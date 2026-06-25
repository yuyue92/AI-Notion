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

