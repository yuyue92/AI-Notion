# CSRF 攻击详解

## 一、什么是 CSRF

**CSRF(Cross-Site Request Forgery,跨站请求伪造)** 是指攻击者诱导已登录目标网站的用户,在不知情的情况下向该网站发送一个恶意请求。由于浏览器会**自动携带**目标站点的 Cookie,服务器无法区分这个请求是用户真实意愿还是被伪造的。

**核心本质:** 利用了"浏览器自动附带凭证"这一机制,攻击者并不需要窃取 Cookie,只需要"借用"用户的登录状态。

## 二、攻击成立的三个前提

1. 用户已登录目标网站 A,浏览器保存了有效的会话 Cookie
2. 目标网站的某个敏感操作**只依赖 Cookie 做身份验证**
3. 该操作的请求参数**可被攻击者预测**(没有随机、不可预测的字段)

## 三、攻击流程

```
用户 ──(1) 登录 bank.com ──────────► bank.com
     ◄─(2) 返回 Session Cookie ─────

用户 ──(3) 访问恶意网站 evil.com ──► evil.com
     ◄─(4) 返回含隐藏请求的页面 ────

用户浏览器 ──(5) 自动向 bank.com 发请求,携带 Cookie ──► bank.com
                                                      (6) 服务器认为是用户本人操作,执行转账
```

## 四、详细案例

### 案例 1:GET 型 CSRF(最简单)

**场景:** 某银行的转账接口设计为:

```
GET http://bank.com/transfer?to=alice&amount=1000
```

服务器只检查 Cookie 中的 Session,验证通过就执行转账。

**攻击者(Mallory)在自己的网站或论坛贴子中放入:**

```html
<img src="http://bank.com/transfer?to=mallory&amount=10000" width="0" height="0">
```

**结果:** 受害者只要在已登录银行的状态下打开这个页面,浏览器加载"图片"时就会向银行发出 GET 请求,并自动带上 Cookie,10000 元被转走。受害者全程毫无察觉。

### 案例 2:POST 型 CSRF(自动提交表单)

**场景:** 银行把接口改成了 POST,开发者以为"POST 更安全":

```
POST http://bank.com/transfer
Content-Type: application/x-www-form-urlencoded

to=alice&amount=1000
```

**攻击者构造的恶意页面 evil.com/index.html:**

```html
<html>
<body onload="document.forms[0].submit()">
  <form action="http://bank.com/transfer" method="POST">
    <input type="hidden" name="to" value="mallory">
    <input type="hidden" name="amount" value="10000">
  </form>
</body>
</html>
```

**结果:** 页面一打开,表单自动提交,浏览器带着 bank.com 的 Cookie 发出 POST 请求,攻击成功。**POST 并不能防御 CSRF。**

### 案例 3:修改邮箱 → 账户接管(危害更大)

**场景:** 某网站的"修改绑定邮箱"功能:

```
POST /account/email
email=new@example.com
```

不需要输入密码,也没有 CSRF 防护。

**攻击链:**
1. 攻击者诱导已登录用户访问恶意页面,伪造请求把用户邮箱改成 `attacker@evil.com`
2. 攻击者在登录页点击"忘记密码",重置链接发到自己的邮箱
3. 攻击者重置密码,**完全接管账户**

这说明 CSRF 即使不能直接读取数据,也能通过"修改状态"造成严重后果。

### 案例 4:JSON 接口的 CSRF

很多人认为"接口用 JSON 就安全",但如果服务器**不严格校验 Content-Type**,攻击者仍可利用:

```html
<form action="http://api.example.com/user/delete" method="POST" enctype="text/plain">
  <input name='{"id":123,"ignore":"' value='"}'>
</form>
<script>document.forms[0].submit()</script>
```

提交的 body 会变成 `{"id":123,"ignore":"="}`,如果服务端宽松解析,就会被执行。

### 案例 5:历史真实事件

- **Netflix(2006 年左右):** 存在 CSRF 漏洞,攻击者可借此向受害者账户的租赁队列添加 DVD、修改收货地址、甚至更改账户凭证。
- **uTorrent 等本地服务:** 管理界面监听本地端口,网页通过 CSRF 可让用户电脑下载恶意文件。
- **家用路由器:** 大量路由器管理后台缺少 CSRF 防护,攻击者可通过网页远程修改 DNS 设置,把用户引导至钓鱼站点(DNS 劫持)。

## 五、防御方案

### 1. CSRF Token(最经典、最有效)

服务器生成随机、不可预测的 Token,放入表单或请求头,提交时校验:

```html
<form action="/transfer" method="POST">
  <input type="hidden" name="csrf_token" value="a8f3k29dj...随机值">
  ...
</form>
```

攻击者无法读取受害者页面中的 Token(受同源策略限制),因此无法伪造合法请求。

### 2. SameSite Cookie 属性

```
Set-Cookie: sessionid=abc123; SameSite=Lax; Secure; HttpOnly
```

- `Strict`:跨站请求一律不带 Cookie
- `Lax`:仅允许顶级导航的 GET 请求带 Cookie(现代浏览器默认值)
- `None`:不限制(必须配合 `Secure`)

这是目前最简单有效的"第一道防线",但不应作为唯一手段(旧浏览器、同站子域名攻击等场景仍有风险)。

### 3. 校验 Origin / Referer 头

服务器检查请求来源是否在白名单内:

```python
allowed = ["https://bank.com"]
origin = request.headers.get("Origin") or request.headers.get("Referer", "")
if not any(origin.startswith(a) for a in allowed):
    abort(403)
```

### 4. 双重提交 Cookie(Double Submit Cookie)

Token 同时存于 Cookie 和请求参数/头中,服务端比对两者是否一致。适合无状态服务。

### 5. 敏感操作二次验证

转账、改密码、改邮箱等操作要求重新输入密码、短信验证码或 MFA。

### 6. 自定义请求头

对 AJAX 请求要求携带如 `X-Requested-With` 或 `X-CSRF-Token` 头。跨域请求添加自定义头会触发 CORS 预检,从而被拦截。

### 7. 遵循 HTTP 语义

**GET 请求绝不修改状态**,只做查询。

## 六、框架中的实践

**Spring Security:**
```java
http.csrf(csrf -> csrf.csrfTokenRepository(
    CookieCsrfTokenRepository.withHttpOnlyFalse()));
```

**Django:** 默认启用 `CsrfViewMiddleware`,模板中使用:
```html
<form method="post">{% csrf_token %}</form>
```

**Express:** 可使用 `csurf` 或其继任方案(如 `csrf-csrf`)等中间件。

## 七、CSRF 与 XSS 的区别

| 对比项 | CSRF | XSS |
|---|---|---|
| 利用的信任 | 网站对**用户浏览器**的信任 | 用户对**网站**的信任 |
| 攻击者能否读取响应 | 通常不能 | 可以 |
| 是否需要注入脚本到目标站 | 不需要 | 需要 |
| 能否绕过 CSRF Token | — | 可以(XSS 能读取 Token) |

> **重要提示:** 如果站点存在 XSS 漏洞,CSRF 防护基本形同虚设,因为攻击者的脚本运行在同源环境中,可以直接读取 Token。

## 八、安全检查清单

- [ ] 所有状态修改操作都使用 POST/PUT/DELETE,而非 GET
- [ ] 所有状态修改请求都校验 CSRF Token
- [ ] Session Cookie 设置 `SameSite=Lax` 或 `Strict`,并带 `HttpOnly`、`Secure`
- [ ] 校验 `Origin` / `Referer`
- [ ] 严格校验 `Content-Type`,不接受意外类型
- [ ] 高危操作要求二次认证
- [ ] 同时修复 XSS 漏洞

## 总结

CSRF 的关键在于:**服务器仅凭"浏览器自动携带的凭证"就认定请求是用户本意**。防御的核心思路是让请求中包含一个**攻击者无法获得或预测的信息**(Token、同源标识等),或者**阻止浏览器在跨站场景下自动携带凭证**(SameSite)。实际工程中应采用"SameSite Cookie + CSRF Token + Origin 校验"的多层组合防御。
