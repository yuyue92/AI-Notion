## 整体架构

当你在 Claude.ai 看到我"使用 Python 生成文件"时，整个流程大概是这样的：

```
你的请求 → Claude 大脑（LLM）→ 决定调用工具 → 执行环境（沙盒）→ 返回结果给你
```

---

## 分层拆解

### 1. 我（LLM）本身是什么？

我是一个**语言模型**，本质上就是一个"预测下一个 token"的神经网络。我没有硬盘、没有内存、不能直接运行代码。每次对话对我来说都是无状态的——我只能读取输入、生成输出。

### 2. 工具调用（Tool Use）是怎么运作的？

Anthropic 给了我一套**工具接口**，我可以在回答中"声明"我要调用某个工具：

```
我（LLM）输出：
  "我需要运行这段 Python 代码..."
  → 触发 bash_tool / create_file 等工具
```

这不是我真的在"跑"代码，而是：
- 我生成一段结构化的"工具调用请求"
- Anthropic 的**后端基础设施**接收这个请求
- 后端把代码扔进一个**沙盒容器**执行
- 执行结果再返回给我
- 我再根据结果继续生成回答

### 3. 沙盒容器是什么？

就是一个临时的 **Linux 环境**（Ubuntu），隔离运行，每次对话结束就销毁：

```
/home/claude/     ← 我的工作目录（临时）
/mnt/user-data/   ← 你上传的文件
/mnt/user-data/outputs/  ← 我生成的文件放这里
```

### 4. 生成文件的完整流程

以"帮我生成一个 Excel 文件"为例：

```
① 你发送请求
        ↓
② LLM 分析意图，决定用 Python (openpyxl) 来生成
        ↓
③ LLM 输出工具调用：
   view("/mnt/skills/public/xlsx/SKILL.md")  ← 先读最佳实践
        ↓
④ 后端执行，把文件内容返回给 LLM
        ↓
⑤ LLM 生成 Python 代码
        ↓
⑥ LLM 输出工具调用：
   bash_tool("python3 generate.py")
        ↓
⑦ 沙盒容器执行这段 Python，生成 .xlsx 文件
   存到 /mnt/user-data/outputs/result.xlsx
        ↓
⑧ 执行结果（stdout/stderr）返回给 LLM
        ↓
⑨ LLM 调用 present_files，把文件链接发给你
        ↓
⑩ 你看到下载链接，点击下载
```

---

## 为什么用 Python 而不是其他语言？

| 原因 | 说明 |
|---|---|
| 生态丰富 | `openpyxl`, `python-docx`, `reportlab`, `pandas`… 几乎什么格式都有库 |
| 语法简洁 | LLM 生成 Python 代码准确率高 |
| 默认安装 | 沙盒里 Python 是预装的 |

---

## GPT 的情况类似吗？

本质上一样，OpenAI 叫它 **Code Interpreter**（现在叫 Advanced Data Analysis）。同样是：LLM → 生成代码 → 沙盒执行 → 返回结果。架构思路是业界通用的。

---

## 一句话总结

> 我（LLM）是"大脑"，负责理解和规划；Python + 沙盒是"手"，负责真正执行操作。我不能直接碰文件系统，但可以通过工具接口指挥后端去做。

---


很好，我们来深挖这三块！

---

## 一、沙盒隔离机制

### 本质：容器化技术

沙盒本质上是一个 **Linux 容器**（类似 Docker），每次会话都是一个全新的、隔离的进程空间：

```
┌─────────────────────────────────────────┐
│           宿主机（Anthropic 服务器）        │
│                                         │
│  ┌──────────────┐  ┌──────────────┐    │
│  │  你的沙盒 A   │  │  别人的沙盒 B │    │
│  │              │  │              │    │
│  │ /home/claude │  │ /home/claude │    │
│  │ PID 空间隔离  │  │ PID 空间隔离  │    │
│  │ 网络受限      │  │ 网络受限      │    │
│  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────┘
```

### 隔离的几个维度

**① 文件系统隔离**
```
/home/claude/          ← 临时读写，会话结束即销毁
/mnt/user-data/uploads ← 只读，你上传的文件
/mnt/user-data/outputs ← 只写，我产出的文件
/mnt/skills/           ← 只读，内置知识库
```

**② 网络隔离**
```bash
# 我现在的网络状态：
Enabled: false   ← 对外网络是关闭的！
```
我无法主动访问互联网、无法向外传数据，这就防止了数据泄露。

**③ 进程隔离**
每个沙盒有独立的 PID 命名空间，我看不到宿主机或其他用户的进程。

**④ 资源限制**
CPU、内存、磁盘都有上限，防止恶意代码耗尽服务器资源。

**⑤ 时间限制**
每条命令有超时机制，死循环不会永远跑下去。

### 会话结束时发生什么？
```
对话结束
    ↓
容器被销毁
    ↓
/home/claude/ 全部清空
    ↓
只有 /mnt/user-data/outputs/ 的文件通过链接传给你
```

---

## 二、工具调用的 JSON 格式

### LLM 输出的本质

我（LLM）的输出流里，除了普通文字，还会穿插**结构化的工具调用块**。Anthropic API 的格式大概长这样：

**我发出的请求（工具调用）：**
```json
{
  "type": "tool_use",
  "id": "toolu_01ABC123",
  "name": "bash_tool",
  "input": {
    "command": "python3 /home/claude/generate.py",
    "description": "运行脚本生成 Excel 文件"
  }
}
```

**后端执行后，把结果塞回对话：**
```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_01ABC123",
  "content": "文件已生成：/mnt/user-data/outputs/result.xlsx\n耗时 0.3s"
}
```

**然后我继续生成后续回复。**

### 一次完整对话的消息结构

```json
[
  { "role": "user",      "content": "帮我生成一个销售报表 Excel" },

  { "role": "assistant", "content": [
      { "type": "text",     "text": "好的，我来生成..." },
      { "type": "tool_use", "name": "bash_tool",
        "input": { "command": "pip install openpyxl --break-system-packages" } }
  ]},

  { "role": "user",      "content": [
      { "type": "tool_result",
        "content": "Successfully installed openpyxl-3.1.2" }
  ]},

  { "role": "assistant", "content": [
      { "type": "tool_use", "name": "create_file",
        "input": {
          "path": "/home/claude/report.py",
          "file_text": "import openpyxl\n...",
          "description": "生成报表的 Python 脚本"
        }
      }
  ]},

  { "role": "user", "content": [
      { "type": "tool_result", "content": "File created successfully" }
  ]},

  { "role": "assistant", "content": [
      { "type": "tool_use", "name": "bash_tool",
        "input": { "command": "python3 /home/claude/report.py" } }
  ]},

  { "role": "user", "content": [
      { "type": "tool_result",
        "content": "报表已生成 → /mnt/user-data/outputs/sales.xlsx" }
  ]},

  { "role": "assistant", "content": [
      { "type": "text", "text": "报表已生成，可以下载了！" },
      { "type": "tool_use", "name": "present_files",
        "input": { "filepaths": ["/mnt/user-data/outputs/sales.xlsx"] } }
  ]}
]
```

### 关键点

```
LLM 的"思考"和"工具调用"是交替进行的
不是一次性生成所有代码，而是：
  生成一步 → 看结果 → 再生成下一步
这就是为什么叫 Agentic（代理式）行为
```

---

## 三、为什么某些任务用 React 而不是 Python？

这是最有趣的部分，核心差异在于：**产出物要在哪里"活着"？**

### 两条路径的本质区别

```
Python 路径：
  代码在服务器沙盒运行 → 产出静态文件（xlsx/pdf/png）→ 你下载到本地

React 路径：
  代码在你的浏览器运行 → 产出交互式界面 → 就活在聊天窗口里
```

### 决策树

```
这个任务的产出物是什么？
        │
        ├─── 静态文件（Excel/Word/PDF/图片）
        │         ↓
        │      用 Python + 沙盒
        │
        ├─── 需要交互（点击/输入/动态更新）
        │         ↓
        │      用 React / HTML（浏览器渲染）
        │
        └─── 纯数据可视化（图表）
                  ↓
               看情况：
               简单静态图 → Python matplotlib → 图片
               交互式图表 → React + recharts → 内嵌界面
```

### 具体例子对比

| 需求 | 用什么 | 原因 |
|---|---|---|
| 生成财务报表 | Python + openpyxl | 要下载 .xlsx 文件 |
| 做一个计算器 | React | 需要实时交互 |
| 画一张静态折线图 | Python + matplotlib | 输出图片即可 |
| 做可拖拽的看板 | React | 复杂交互，浏览器最擅长 |
| 转换 PDF 格式 | Python + pypdf | 文件操作 |
| 做一个小游戏 | React / HTML | 需要实时响应用户操作 |

### React Artifact 是怎么运行的？

```
我生成 JSX 代码
    ↓
发送给你的浏览器
    ↓
Claude.ai 前端用 iframe 沙盒渲染它
    ↓
整个运行环境在你本地的浏览器里
    ↓
我完全不知道你点了什么按钮（除非你告诉我）
```

这就是为什么 React Artifact 里**不能用 localStorage**——iframe 的存储是隔离的，每次刷新就没了。

---

## 总结：三者的关系

```
          ┌─────────────────────────────────────┐
          │           Claude LLM（大脑）           │
          │   理解意图 → 规划步骤 → 生成代码/指令   │
          └──────┬──────────────────┬────────────┘
                 │                  │
        ┌────────▼───────┐  ┌───────▼────────┐
        │  服务器沙盒      │  │  你的浏览器     │
        │  Python 执行    │  │  React 渲染    │
        │  产出：文件      │  │  产出：交互界面  │
        │  你需要下载      │  │  直接嵌在对话里  │
        └────────────────┘  └────────────────┘
```

