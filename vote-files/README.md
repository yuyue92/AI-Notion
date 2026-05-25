# PollWave · 实时多选投票系统

一个基于 Supabase + ECharts 的现代实时投票系统，支持匿名与登录投票、多选/单选、实时图表同步。

---

## 🗂️ 工程目录结构

```
poll-system/
├── index.html       # 主应用入口（全功能单页面）
├── config.js        # Supabase 配置（★ 必须先填写）
├── setup.sql        # 数据库初始化脚本（含触发器、RLS、函数）
└── README.md        # 本文档
```

---

## 🚀 快速启动步骤

### 第一步：创建 Supabase 项目

1. 访问 [https://supabase.com](https://supabase.com) 并注册/登录
2. 点击 **New Project**，填写项目名称和数据库密码
3. 等待项目初始化完成（约 1 分钟）

### 第二步：执行数据库脚本

1. 进入 Supabase Dashboard → **SQL Editor**
2. 新建查询，将 `setup.sql` 全部内容粘贴进去
3. 点击 **Run** 执行
4. 确认没有报错（警告可以忽略）

### 第三步：开启 Realtime

1. 进入 Dashboard → **Database** → **Replication**
2. 找到 `votes`、`options`、`polls` 三张表
3. 勾选 **INSERT** 和 **UPDATE** 事件
4. 保存设置

### 第四步：配置前端

打开 `config.js`，填入您的项目信息：

```javascript
const SUPABASE_CONFIG = {
  url: 'https://xxxxxxxxxxxx.supabase.co',  // Project Settings → API → Project URL
  anonKey: 'eyJhb...',                       // Project Settings → API → anon public
};
```

### 第五步：启动应用

**方式 A（推荐）：使用 VS Code Live Server**
- 安装 Live Server 插件
- 右键 `index.html` → Open with Live Server

**方式 B：使用 Python HTTP 服务器**
```bash
cd poll-system
python3 -m http.server 8080
# 浏览器访问 http://localhost:8080
```

**方式 C：直接双击 `index.html`**
- 部分浏览器可能限制本地文件的 API 请求
- 建议使用方式 A 或 B

---

## 📋 功能说明

### 普通用户
- ✅ 查看所有进行中的投票列表
- ✅ 点击投票进入详情页，支持单选/多选
- ✅ 提交后立即查看实时结果（饼图 + 进度条）
- ✅ 实时同步其他用户投票（Supabase Realtime）
- ✅ 每人每投票只能投一次（匿名用 localStorage，登录用 user_id）
- ✅ 显示已投选项高亮

### 管理员（需登录）
- ✅ 创建投票：设置标题、描述、选项（最多 6 个）、截止时间
- ✅ 配置多选/单选、是否需要登录
- ✅ 管理面板：查看参与人数、总票数
- ✅ 暂停/恢复投票（is_active 切换）
- ✅ 删除投票（含所有相关数据）

### 数据安全
- ✅ Row Level Security (RLS) 全面启用
- ✅ 投票逻辑通过数据库函数（SECURITY DEFINER）执行
- ✅ vote_count 通过触发器自动维护，不可前端篡改
- ✅ 重复投票由数据库唯一约束保证

---

## 🗄️ 数据库设计

| 表名 | 说明 |
|------|------|
| `polls` | 投票主表，含标题、配置、状态 |
| `options` | 选项表，含 vote_count 计数器 |
| `votes` | 投票记录，含用户/匿名身份 |
| `poll_participants` | 参与者去重表，保证每人只投一次 |

### 核心函数
| 函数 | 说明 |
|------|------|
| `submit_vote()` | 事务安全地提交投票 |
| `get_poll_detail()` | 获取投票+选项+参与人数 |
| `check_voted()` | 检查用户是否已投票 |

### 触发器
- `trg_increment_vote_count`：INSERT votes → vote_count + 1
- `trg_decrement_vote_count`：DELETE votes → vote_count - 1

---

## ⚠️ 注意事项

1. **匿名用户防重复**：使用 localStorage 存储 `pw_anon_id`，清除浏览器数据可绕过，适合轻度使用场景
2. **Realtime 配额**：Supabase 免费计划支持最多 2 个并发 Realtime 频道，生产环境建议升级
3. **RLS 策略**：`setup.sql` 中的策略允许任何人插入 votes（通过函数控制重复），如需更严格控制可调整
4. **邮箱验证**：Supabase 默认要求邮箱验证，开发时可在 Dashboard → Authentication → Settings 关闭

---

## 🎨 技术栈

- **后端**：Supabase (PostgreSQL + Auth + Realtime + RLS)
- **图表**：Apache ECharts 5
- **字体**：Syne + DM Sans (Google Fonts)
- **部署**：任意静态服务器 / Supabase Storage / Vercel / Netlify
