# CSRF 防御中的前端职责

CSRF 的防御是前后端协作的结果:**后端负责生成与校验,前端负责"把正确的凭证带上"以及"让敏感操作更难被误触发"**。前端做不好,后端再严也会出现"合法用户被误拦"或"防护被绕过"的问题。下面按四类工作逐个展开。

---

## 一、Token 传递

### 1.1 Token 从哪里来

前端拿到 CSRF Token 通常有四种方式,各有适用场景:

| 获取方式 | 做法 | 适用场景 |
|---|---|---|
| 服务端渲染注入表单 | 模板输出隐藏字段 `<input name="csrf_token">` | 传统 MPA(Django、Flask、Spring MVC 模板) |
| 注入 meta 标签 | `<meta name="csrf-token" content="...">` | SSR 页面 + 局部 AJAX(Rails、Laravel 风格) |
| 读取 Cookie | 后端下发可读 Cookie(如 `XSRF-TOKEN`),JS 读取后放入请求头 | SPA、双重提交 Cookie 方案(Angular、Axios 默认约定) |
| 专用接口获取 | 登录后调用 `GET /api/csrf-token` | 前后端完全分离的 SPA |

### 1.2 Token 往哪里放

**表单提交:** 放隐藏字段。

```html
<form method="POST" action="/transfer">
  <input type="hidden" name="csrf_token" value="{{ csrf_token }}">
  ...
</form>
```

**AJAX / Fetch:** 放自定义请求头(推荐),如 `X-CSRF-Token`。

```javascript
const token = document.querySelector('meta[name="csrf-token"]').content;

fetch('/api/transfer', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': token,
  },
  body: JSON.stringify({ to: 'alice', amount: 100 }),
});
```

放请求头优于放 URL 参数:**URL 中的 Token 会泄露到浏览器历史、服务器日志、Referer 头中**,所以 Token 永远不要放在 GET 的 query string 里。

### 1.3 Cookie 读取方案(双重提交)

```javascript
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

const token = getCookie('XSRF-TOKEN');
headers['X-XSRF-TOKEN'] = token;
```

这里有个容易忽略的点:**承载 Token 的那个 Cookie 不能设置 `HttpOnly`**,否则前端读不到;但 **Session Cookie 必须设置 `HttpOnly`**。两个 Cookie 职责不同,别混为一谈。

### 1.4 Token 生命周期管理

前端常见的坑:

- **页面长时间停留后 Token 过期:** 后端返回 403 时,前端应能识别是"Token 失效",自动重新获取 Token 并重试一次,而不是直接报错让用户困惑。
- **多标签页 Token 不一致:** 如果后端采用"每次请求轮换 Token",多标签页会互相覆盖导致误拦截。推荐"每会话一个 Token"或在响应头中回传新 Token 并统一更新。
- **登录/登出后必须刷新 Token:** 登录前后的 Token 应该不同(防 Session Fixation 类问题),前端在登录成功后要重新拉取。
- **缓存问题:** 含 Token 的 HTML 页面不应被 CDN 或浏览器长期缓存,否则用户拿到的是过期或他人的 Token。

---

## 二、请求封装

### 2.1 为什么要统一封装

如果每个开发者都手写 `fetch` 并手动加 Token,**迟早有人会漏**。CSRF 防护是"木桶效应",漏一个接口就是一个洞。所以应该把 Token 注入做到请求层,让业务代码"想漏都漏不了"。

### 2.2 Axios 拦截器封装示例

```javascript
import axios from 'axios';

const http = axios.create({
  baseURL: '/api',
  withCredentials: true,           // 同源/允许的跨域请求携带 Cookie
  xsrfCookieName: 'XSRF-TOKEN',    // Axios 内置支持双重提交约定
  xsrfHeaderName: 'X-XSRF-TOKEN',
});

// 请求拦截:仅对"会修改状态"的方法注入 Token
const UNSAFE_METHODS = ['post', 'put', 'patch', 'delete'];

http.interceptors.request.use((config) => {
  if (UNSAFE_METHODS.includes(config.method?.toLowerCase())) {
    const token = getCsrfToken(); // 从 meta / cookie / 内存中取
    if (token) config.headers['X-CSRF-Token'] = token;
  }
  return config;
});

// 响应拦截:Token 失效时自动刷新并重试一次
http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { response, config } = error;
    if (response?.status === 403 && response.data?.code === 'CSRF_INVALID' && !config._retried) {
      config._retried = true;
      await refreshCsrfToken();           // 重新获取 Token
      return http(config);                // 带新 Token 重试
    }
    return Promise.reject(error);
  }
);

export default http;
```

注意两个细节:
- **只对非安全方法注入**:GET/HEAD/OPTIONS 不需要,减少 Token 暴露面。
- **重试只做一次**(`_retried` 标记),避免死循环。

### 2.3 Fetch 封装

```javascript
export async function apiFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('X-CSRF-Token', getCsrfToken());
    if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }
  }

  return fetch(url, {
    ...options,
    method,
    headers,
    credentials: 'same-origin', // 默认就是 same-origin,显式写出更清晰
  });
}
```

### 2.4 跨域场景下的封装要点

前后端分域部署(如 `app.example.com` 调用 `api.example.com`)时,封装需要额外注意:

```javascript
fetch('https://api.example.com/transfer', {
  method: 'POST',
  credentials: 'include',   // 跨域携带 Cookie
  headers: { 'X-CSRF-Token': token, 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});
```

此时后端必须配套:
- `Access-Control-Allow-Origin` 指定**具体域名**(带凭证时不能用 `*`)
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Headers` 包含 `X-CSRF-Token`

这里有个知识点值得强调:**自定义请求头会触发 CORS 预检(preflight)**,而恶意站点无法通过预检(因为后端不会把恶意域名加入白名单),所以"必须携带自定义头"本身就是一层防护。这也是为什么前端用请求头传 Token 比用表单字段更稳妥。

### 2.5 其他封装层面的注意点

- **文件上传:** `multipart/form-data` 的上传也要带 Token,别因为用了 `FormData` 就漏掉。
- **非 AJAX 的导航型操作:** 如 `window.location = '/logout'`、`<a href="/delete?id=1">`,这类"GET 改状态"的写法本身就是设计问题,应改为 POST 表单或带 Token 的请求。
- **第三方库发请求:** 如 `navigator.sendBeacon`、WebSocket 握手、图片上传 SDK,它们不走你的拦截器,需要单独处理。WebSocket 尤其要注意**校验 Origin**(跨站 WebSocket 劫持,CSWSH)。
- **永远不要把 Token 发给第三方域名:** 拦截器里应限定只对自家 API 域名注入 Token,否则会把 Token 泄露给第三方接口。

```javascript
http.interceptors.request.use((config) => {
  const url = new URL(config.url, window.location.origin);
  if (url.origin !== window.location.origin && !TRUSTED_API_ORIGINS.includes(url.origin)) {
    return config; // 不对非受信域名附加 Token
  }
  // ...注入 Token
});
```

---

## 三、Cookie 策略配合

Cookie 属性主要由后端 `Set-Cookie` 下发,但**前端必须理解这些属性对自己的影响**,否则会出现"后端配了 SameSite,前端功能却坏了"的情况。

### 3.1 SameSite 对前端的实际影响

| 取值 | 跨站 POST/AJAX | 跨站顶级导航 GET(点链接) | 对前端的影响 |
|---|---|---|---|
| `Strict` | 不带 | 不带 | 从外部链接(邮件、聊天)点进站点时首次请求不带 Cookie,用户**看起来像未登录**,需处理 |
| `Lax` | 不带 | 带 | 大多数场景无感,是推荐默认值 |
| `None; Secure` | 带 | 带 | 用于跨站嵌入、第三方登录、iframe 场景,**此时更依赖 CSRF Token** |

**Strict 的体验问题与对策:** 用户从邮件点链接进入站点,因为首次导航不带 Cookie,页面可能显示"未登录"。常见做法是用 Lax 作为会话 Cookie,仅对极敏感的 Cookie 用 Strict;或前端在检测到未登录态时,**自动再发起一次同站请求**(此时已是同站上下文,会带 Cookie)来恢复登录态。

### 3.2 "站点(site)"与"源(origin)"的区别

前端同学容易混淆:

- **同源(same-origin):** 协议 + 域名 + 端口都相同
- **同站(same-site):** 看**可注册域名**(eTLD+1)是否相同

所以 `app.example.com` 与 `api.example.com` 虽然**跨源**,但**同站**——SameSite 不会阻止它们互相携带 Cookie。这意味着:**SameSite 防不住同站内被攻陷的子域名发起的请求**。如果你的某个子域名托管了用户内容(如 `blog.example.com` 允许用户上传 HTML),它就可能成为攻击跳板,这时 CSRF Token 仍然是必需的。

### 3.3 前端 Cookie 使用的几条原则

1. **不要用 JS 存放会话凭证:** 把 JWT 放进 `localStorage` 再手动加到 `Authorization` 头,确实天然免疫 CSRF(浏览器不会自动携带),但代价是**一旦有 XSS,Token 直接被偷走**。这是 CSRF 与 XSS 防护之间的取舍,需要根据业务权衡,而不是简单认为"不用 Cookie 就一劳永逸"。
2. **会话 Cookie 保持 `HttpOnly`:** 前端不应也不需要读取它。
3. **`Secure` 全站 HTTPS:** 避免中间人窃取或篡改。
4. **使用 `__Host-` 前缀:** 如 `__Host-session`,强制要求 `Secure`、`Path=/`、不带 `Domain`,可防止子域名覆盖 Cookie。
5. **开发环境注意:** 本地 `http://localhost` 下 `SameSite=None; Secure` 的 Cookie 可能无法正常工作,联调跨域时需要配代理(如 Vite/Webpack `devServer.proxy`)让前后端"看起来同源",而不是为了方便把安全属性关掉后忘记恢复。

### 3.4 Authorization 头方案 vs Cookie 方案对比

| 维度 | Cookie 会话 | `Authorization: Bearer` + localStorage |
|---|---|---|
| CSRF 风险 | 有,需防护 | 基本无(浏览器不自动携带) |
| XSS 风险 | HttpOnly 时 Token 不可被读取 | Token 可被 JS 读取窃取 |
| 前端工作量 | 需要处理 CSRF Token | 需要自行管理 Token 存取与刷新 |
| 适用 | 传统站点、同站 SPA | 移动端 API、第三方开放接口 |

---

## 四、敏感操作交互

技术手段拦的是"伪造请求",而前端交互设计解决的是"**让用户真正确认这是自己的意图**",这是纵深防御中容易被忽视的一环。

### 4.1 哪些操作算"敏感操作"

转账/支付、修改密码/邮箱/手机号、绑定/解绑第三方账号、修改收货地址、删除账号/数据、权限变更、API Key 创建、导出敏感数据。

### 4.2 二次验证交互

**重新输入密码(Re-authentication):**

```html
<dialog id="confirm-dialog">
  <h3>请验证身份以继续</h3>
  <input type="password" id="pwd" autocomplete="current-password">
  <button id="confirm">确认转账</button>
</dialog>
```

```javascript
async function transferWithReauth(data) {
  const password = await promptPassword(); // 弹窗收集
  return http.post('/transfer', { ...data, password });
}
```

攻击者发起的伪造请求**无法提供用户密码**,因此即使 CSRF Token 被绕过,这一层仍能挡住。

**短信 / 邮件 / TOTP 验证码:** 交互上需要注意倒计时、重发限制、输错次数提示,且**验证码应与具体操作绑定**(如绑定转账金额和收款人),避免"验证一次,后续任意操作通用"。

**MFA / Passkey / 生物识别确认:** 移动端可调用系统级认证,体验好且安全性高。

### 4.3 操作确认页(Confirmation)

关键原则:**让用户在确认界面看到操作的关键内容,而不是一个笼统的"确定吗?"**

❌ 糟糕的确认:
> 确定要执行此操作吗? [确定] [取消]

✅ 良好的确认:
> 您将向 **alice@example.com** 转账 **¥5,000.00**,预计到账时间:即时。
> [输入支付密码确认]

这样即使用户被诱导触发了某个流程,也有机会在确认环节发现异常(收款人不对、金额异常)。

### 4.4 防误触与防点击劫持(Clickjacking)

CSRF 常与点击劫持联动:攻击者把你的真实页面用透明 `iframe` 盖在诱饵按钮上,诱导用户**亲手点击**真实的"确认转账"按钮,这时请求带着合法 Token,CSRF Token 完全失效。

防御要点:

```
# 后端响应头(前端也应了解并验证)
Content-Security-Policy: frame-ancestors 'self'
X-Frame-Options: DENY
```

前端层面可配合:

```javascript
// 兜底的 frame-busting(不能替代响应头)
if (window.top !== window.self) {
  window.top.location = window.self.location;
}
```

另外,敏感按钮可加入**短暂延迟启用**或**必须经过多步交互**(如滑块、长按),降低被透明覆盖诱导误点的概率。

### 4.5 操作通知与可追溯

- 敏感操作完成后,**前端展示明确的结果与记录入口**(如"最近操作记录"),让用户容易发现异常。
- 配合后端的邮件/站内信/推送通知:"您刚刚修改了绑定邮箱,如非本人操作请立即……"
- 对关键变更提供**冷却期或撤销窗口**(如修改邮箱后 24 小时内可一键回滚),给用户留出补救时间。

### 4.6 敏感操作的前端清单

```
□ 展示操作摘要(对象、金额、影响范围)
□ 要求二次验证(密码 / 验证码 / MFA)
□ 验证码绑定具体操作,有时效与次数限制
□ 防点击劫持(frame-ancestors + 前端兜底)
□ 提交后禁用按钮,防止重复提交
□ 操作完成后给出明确反馈与可追溯入口
```

---

## 五、四类工作的关系

```
┌────────────────────────────────────────────────────────┐
│  敏感操作交互   ← 最后一道防线:确认"真是用户本意"       │
├────────────────────────────────────────────────────────┤
│  Cookie 策略配合 ← 第一道防线:阻止跨站请求带凭证        │
├────────────────────────────────────────────────────────┤
│  Token 传递     ← 核心防线:请求必须携带不可预测凭证      │
├────────────────────────────────────────────────────────┤
│  请求封装       ← 保障机制:让前两者在工程上不被遗漏      │
└────────────────────────────────────────────────────────┘
```

**总结一句话:** Cookie 策略负责"尽量不让凭证被跨站带出去",Token 负责"即使带出去了也伪造不出合法请求",请求封装保证"Token 不会漏",敏感操作交互则保证"就算前面都被绕过,用户仍有最后一次确认的机会"。前端在这条链路上不是配角,而是把防御从"理论可行"变成"工程落地"的关键一环。
