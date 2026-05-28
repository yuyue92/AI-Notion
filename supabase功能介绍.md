![Image](https://images.openai.com/static-rsc-4/tqiEhXArKra71EhpoAE1UM2FspTvmQ2OD6gJkTQiey3O5a3bGF-flpMetIddw6J0EymFq7cHt3j_o4jZJwUIWZcZoXKN7cqLRyL55wrLrMdZcbpQXQhF5mktzphrO_o0VmOIyGA7Cp0_uBUz0UYEPJusqG3i02H26YCLGwJgFKYQ_jR6dFQCWFaWbCLrsku-?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/itI99j83SWmhrmDfIhKhmmePaudXtQsYbWA8BptLfl9Zw5MKFoULprFCe4HimEfVbpiEgp98l3Dk0-M5cKlkGcfaGuUD02ghVAU2tHV_a_wKmrwavQShZlRbFspnVjGr4TIrCjSLWh7HWsT81f0mvtbhugfgywRqeBHBF64gqRwWjT7i5Bq94sbxV_sEhpRL?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/hVV54_DJopdMDU4_-sgo_YK4xJraTAmWd5GVMIyGWoiVpSTOsiVfKJHZAELn-oXDjdLCjHtjpEJYCCh4OQb60ap1GWJEKKRk34kRVJ1_RtLz9PIqPbv3f43-DuZEijzEuobsLgBw3ildKT3qUDQYX2FL4Fex605ouJZh4mc8s9hFiCmXEi5cCwyxpsiTeeI4?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/v7OiDTy7Y26-FeyZ6-z-QoGQg88knSiHmjiLy4Q2cH1ErV9QRlUi3u_yyskkWYzp63JA26q6AQVUhuGtYY_liJ3P9sPiCI2K6BGKvSiTWSZedq6Akrtn6WdvYCaEyGKcVV3_UWGceXf4fuF-cubMGOabij9Y7Fbzc5YunT9H_mZTapmoq2MRelY5fDbA7046?purpose=fullsize)

你现在把 [Supabase](https://supabase.com?utm_source=chatgpt.com) 当成“在线数据库”来用，其实只用了它能力体系里的很小一部分。

Supabase 本质上是：

> 一个“基于 PostgreSQL 的完整后端平台（Backend-as-a-Service）”

它不是单纯数据库，而是：

* PostgreSQL 数据库
* 用户认证
* 实时订阅
* 文件存储
* Edge Functions
* 向量数据库
* AI 能力
* API 自动生成
* 权限系统
* 后台管理
* Cron 定时任务
* Webhook
* 日志监控
* 多语言 SDK

全部打包在一起。

很多前端开发者最开始只会：

```js
supabase.from("posts").select("*")
```

实际上这只是“SQL API”这一层。

下面我会按“真实开发视角”全面展开。

---

# 一、Supabase 的整体架构

![Image](https://images.openai.com/static-rsc-4/IsdzxAifmqU-TG461rXZCAn-uZYUJs9Yb-FgVWSsMOL0Ey5Q_J7h6ijnqkXErwF34wHn3cReLtqUHqDh3nnjyfHb8O2DHZwByZpVxu9Cwv5N96O6zWVA1ktDbuGDbJZQQ8sH3AbTkZeisXYYne1zK8rKgt7WEY1dd8YgbAHofSI3VJ6LbJwzige4VzjvGjBg?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/j3F3vktV4hEeAFTlD_UuOOxqXevbs9BbdHG2vok8Qnb05g5IL1uHO_Ly-cNq9QjrUzWs-C0lOGy9L-L8FdyfFv4-KfDPDgNYpFfyoDRjPv2GG0BTcf1k5NPxs0SQqbDCNwwNonjXm2UKe9Qry7ZTJKUDAI_KvbVvVpfLgdJBmmKZ-RK4jrSXi1EW5_KkRWNx?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/myIT9R1xh57LT-_xj6dpwOTxMdy3rEZ7GytDbsVwFXkydZSNUREEmuWFpCsRHxYQp6oSK4C-Qyn2ank4PcbiMqGHr3VwpiMvz0Ali-vaph9i5OlXtfjJhts4aQZfrJQ3ecCgwGW3UwlNhcler27utr-7xV6mm0CvXIeWoqD6x3NFNmSDCPXaln66OygoxCyH?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/OfmCeRUIiL7e3-uB0PyciB9CkC3qmcysxnbbwkuxs2aE0PM46dJa8qK7DdX9_-TqJaUQZIoRa9fVB9QEzfVSnfyav5WtgkC89sxV-RmfA3bxnfNw_GUX26k8JJiAlfWZeh2vo8-xYJ2GtkwPxmqASkYMKbOrYIusWYRUcIoBMurOy_ZiVgwV9vulD0ZGnKdi?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/QalsUiE-eR_cU-s9qFrOuevMZo6RGrDdNwJ1wl-G9hwAetoY3WR61MexxYwvtG1xpTxDZNEAgsZu-7WLl6i3OlfRDs4owrmqYGlGXBTzLpMRhYjXXhOkXaSwoX8GXQveNrKbQ1FLoBAXdnY83WJ8yyny7dki0Hqq_SWf4o68zFwzEw6hn28zwRdZ4Wg-c0RO?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/I1QqOBjvmDt-vyOvCMdzTvxDYWW-8xAwx0s5mhKyZyf7-22MlhUJ5cp9FsknEeWnXHFkKL934mma-LVG9LIX9ekKOpoPNLSSXMvCvAV1lMG5Qm1gnZAxAute1fO5f39vQcrdfMZrEe0cbX7q0T4Qg-nTdML110s_2OtNY5_eVXDWlj3EFanJU7zw_ThXp4cr?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/YQJJu8-RfIwaSc1jtiF3ei3tAZUE_F1fwfs3rEBrLyPy2y0ahElqy5yeBzBxSTbXw58kb4hHh53T-P2gu2xCpqs9RFCSxHMIVTJ6y-4hdBsuMiNIER7T-gIhy5AFyeagahsbd7grXfUZupyFozNaxRvn_g39yP5szhIxsQoY10Ti2mLE2F8wLLS9rEdGpmpg?purpose=fullsize)

Supabase 可以理解成：

```text
PostgreSQL
   │
   ├── 自动生成 REST API
   ├── 自动生成 GraphQL
   ├── Realtime 实时订阅
   ├── Auth 用户系统
   ├── Storage 文件系统
   ├── Edge Functions
   ├── Vector / AI
   ├── Row Level Security
   └── Dashboard 管理后台
```

核心是：

# PostgreSQL

这点非常重要。

很多 BaaS 平台其实是“私有数据库”。

而 Supabase 是：

> 真·PostgreSQL

所以你能使用：

* SQL
* 事务
* 索引
* 视图
* 触发器
* 函数
* JSONB
* 全文搜索
* 扩展插件
* GIS
* 向量搜索

等所有 PostgreSQL 能力。

这是 Supabase 最大优势之一。

---

# 二、Database（数据库）

这是你目前主要使用的部分。

## 1. 表（Tables）

最基础：

```sql
create table posts (
  id bigint primary key generated always as identity,
  title text,
  content text
);
```

前端：

```js
const { data } = await supabase
  .from("posts")
  .select("*")
```

---

## 2. 关系型数据库

Supabase 是真正关系型数据库。

例如：

```text
users
posts
comments
likes
```

之间可以：

* foreign key
* cascade
* join
* relation query

例如：

```js
supabase
  .from("posts")
  .select(`
    *,
    comments(*),
    users(*)
  `)
```

类似 ORM 的嵌套查询。

---

## 3. JSONB（超强）

PostgreSQL 的 JSONB 很强。

例如：

```sql
create table products (
  id bigint,
  metadata jsonb
);
```

存：

```json
{
  "color": "red",
  "size": "XL"
}
```

还能建立索引。

非常适合：

* 动态字段
* 配置
* AI 数据
* 富结构内容

---

## 4. SQL Editor

![Image](https://images.openai.com/static-rsc-4/nENz5TPnK_qfQFxg0puq_hMkcX1U_8XyFah87PNRHHa6XeUgTbJQzbwrp01b-GASU8pVnhgr-Gx5uqblwtTzujh8NPRJvYdFziGSBy4k6xTnIOzgSioidt_BmlMKx4lmD4Cjpf8YWSBJ0yp6ImfIH_jlii_2H5NdtTOrz3YgL-R_jQG8usRppxBWhjdMxy8k?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/sTmcvy7qgxwYtR7umIgtnpiGCshLApsOg4T9umMkAqej3lhjxgrXH48CGnfmZWDhpNykJUBOu_kzED1bbRa8nYEHv9NCBIzJxUGLyl_JH3jt-hvQNcIbu2YBLMD6EnSR-vLQko_ZxSff3CXUuEQW124WmUjaA2VRZYnxOJRx4dHnPqDBwKG1qfl79zgM_2gB?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/wbvc5NZSeNWloavJBTmOLYfFXXk8s3Pf6U0R9CFlQWUF4rZrYWDhDInEf6wfl6msvpXDs9Opi-WBcBSSVCBGRo6915ocQC8tG14-CHAYadkn6KvH6X450laxh7OTdLLhcit4FbLQVKHrqPhYtt55i48D7QdoRxUuGlH1jhhPUN_9Oz2Expjrfdh4nWWOLA4I?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/h3u2iyDurqNOBEK3trpnUYsQHIScjyAnAiCZTfq_8ksMI3AeC-KGrLK0VGSu_socEdazX99aIUkM8bxEljdSj4ztuFlb_l2T3fr87XT1nGnsZEFd_xIdaSawuyov2g1FZxjs72XDrlpjNkbaL8SdYZr50_aXI278HYLWqYIn7oQNw-9iAI8eiOowl97Rvmmf?purpose=fullsize)

内置在线 SQL IDE。

你可以：

* 写 SQL
* 建表
* 建索引
* EXPLAIN
* 调试
* migration

很多人低估这个功能。

实际上：

> Supabase 本质更像“云 PostgreSQL 开发平台”。

---

# 三、自动 API（非常核心）

Supabase 自动把数据库变成 API。

这是它最革命性的地方之一。

---

## 1. REST API 自动生成

你建表后：

```text
/posts
/comments
/users
```

API 自动出现。

无需自己写后端。

---

## 2. JavaScript SDK

[Supabase JavaScript SDK](https://supabase.com/docs/reference/javascript/introduction?utm_source=chatgpt.com)

例如：

```js
const supabase = createClient(url, key)
```

之后：

```js
supabase.from("posts").insert(...)
supabase.from("posts").update(...)
supabase.from("posts").delete(...)
```

---

## 3. GraphQL

[Supabase GraphQL Docs](https://supabase.com/docs/guides/graphql?utm_source=chatgpt.com)

Supabase 也支持 GraphQL。

很多人甚至不知道。

适合：

* React Query
* Apollo
* 大型前端项目

---

# 四、Auth（身份认证）

![Image](https://images.openai.com/static-rsc-4/hVV54_DJopdMDU4_-sgo_YK4xJraTAmWd5GVMIyGWoiVpSTOsiVfKJHZAELn-oXDjdLCjHtjpEJYCCh4OQb60ap1GWJEKKRk34kRVJ1_RtLz9PIqPbv3f43-DuZEijzEuobsLgBw3ildKT3qUDQYX2FL4Fex605ouJZh4mc8s9hFiCmXEi5cCwyxpsiTeeI4?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/6q-qJbFF0YTOawFEHUnvKAl-dyNTEiyMTiLDU3GPNuM6QecUgOjfm4sNEkvVOu6By9ABy0Vcmh-xq3HA4xkJxYzTd6gbVvYW6KmxGeHC-MIYpbqsXapDApfY230Qgc4_r4hVXTTWXm5OX2_Vbv1-K-CcRavtUguWaRWRg8E5SD9E-bQaomnNdDdhtZ5bzw0o?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/U8WhI37TjhmI0j_nKcmMHRLXlq9pZN_XSnG2YfWKdND5PZICpnlMTxBtcySf7kNs3KimcJ0KZXnImL05FN8aJI02PvwdESymQhKSsxOEZO-fGqCgTjtux77yg66MN6KxUEvz4sZNqaEDwonqBW7ObsPVKXoUaLAHPFsKijANQn_LdUB3hCo3u4lspTKiNPLs?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/A1-Zl4wJ9liykqMDpPoZhfGqfiCQVc0r7Fp1lAtncT2N2vPbjea0MCbZgwxiunN9VraXb0ygtIXPK_9NKiNo3KT2BesoRqlQMld-cxKKUU6BsP4Nh9-YlNj-OQl3kaQjB-p3JBICqJ44gwgwhBVcI6XFixdJO78aWYym-kbQHJv6K9gq1UTk3WQUHEu2WxFD?purpose=fullsize)

很多人以为 Supabase Auth 只是“邮箱登录”。

实际上很完整。

---

## 支持：

* 邮箱密码
* Magic Link
* OTP
* 手机验证码
* OAuth
* 匿名登录
* SSO
* 企业身份认证

---

## OAuth 登录

支持：

* GitHub
* Google
* Discord
* Apple
* Microsoft
* GitLab

等。

例如：

```js
await supabase.auth.signInWithOAuth({
  provider: 'github'
})
```

---

## JWT

登录后自动获得 JWT。

然后：

* API 自动鉴权
* RLS 自动生效
* Edge Functions 自动识别用户

这是一套完整闭环。

---

# 五、Row Level Security（RLS）

这是：

> Supabase 最重要的能力之一。

也是很多人没真正掌握的部分。

---

## 什么是 RLS

数据库级权限控制。

例如：

```sql
create policy "Users can view own posts"
on posts
for select
using (auth.uid() = user_id);
```

意思：

```text
用户只能看自己的数据
```

注意：

这是数据库层控制。

不是前端控制。

所以非常安全。

---

## 这意味着：

前端甚至可以直接访问数据库 API。

因为：

```text
数据库自己会拒绝非法访问
```

这就是 Supabase 架构哲学。

---

# 六、Realtime（实时系统）

![Image](https://images.openai.com/static-rsc-4/uuhqI4eonhv5NzmhXl_-k1xotSHP8sh3kv8DzWW-mfuDhhEYWxg0H_I9pddRgBR9EQM-phJY23bVKTWKYgzMwOi_kReW2sqMmf2zsoA2VIQkFKpJtb3N6KwT2THRXqLf3_NabxfyYo0cb2P-WlxC3tUb9MD42ipzAYyCOo4EwcYhxUbbBwXky0ZDaT0xq9HT?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/1Adm2Rj7Mhx3N5oGmlDzpOGWsSU3LlduymM5KWiUDA4Y9JD4WSuQGopIeGEUqTKRltKqbqdfppg_Za5Vn-mYNA-kX83Cmex1yFO9hGlV-tqBRwjq2xuSnlI-F5HtOTAM-hvc00NLUgIAY3FEmcdmA4aYjhc1a8SD4bB5b1FcSHh7s11_kBR80Ys4DccEDDBw?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/TxZdn9iB5_c9vHbN4NAnLyW0XJF1MCDfCELexyGhdvvWemrGoTD4oD5qXV6MXLzgML2qU5kn9He92ULMW9HYOhj856KN0YD7iVOiFt6bDq-THqYnYeS4WUMmTgSdEw7x04UeibNjL0on0kPIbUE3YM8u8W1RxDXt5OuAeX9tAG2exCX6V6xhdYxDR_d_42LS?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/CkGXBM6QBnjEtmrVuYIEMERMM13uxhCRlZ3oS7S8aSTJ-RISl3E-sgv8kLjvE6JBay3-8Qeh2eUkYEHnruAAI6iNkcgbOOO2sGdSm6JPIRzFxBH1GD0WmzuuLMbsbryO5xU34z_X7DZFEfdakw5hqFGPwLfI96e6zOYAxh8MM_jitRltfXBISstZqQagYeBR?purpose=fullsize)

很多人不知道：

Supabase 内置 WebSocket 实时系统。

---

## 实时监听数据库变化

例如：

```js
supabase
  .channel('room1')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'messages'
    },
    payload => {
      console.log(payload)
    }
  )
  .subscribe()
```

---

## 可以做：

* 聊天室
* 在线协作
* 实时通知
* 游戏同步
* 数据面板
* 在线文档

---

# 七、Storage（文件存储）

![Image](https://images.openai.com/static-rsc-4/S3jHwSibF3jPuaj0vvXFN-Gt8dOcpeRWVA_TRG4DwZ9sRevkTkEXGjnq8JfENenq3WQmOVYrbWWK0jUmPRGAYjeO82HidlPxn4EboJAuR2gdR-fX0qCLQT_8wmSsnLZqt9SJ2zX3X1Qpl6VnozvUTJIW7RFrfVdTnkZ_y6Q8bWGC3UqyFwMSBL5zE98yoGm2?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/lM2YK-a6AHsbICxePDLSM_HNLLql5dHJK52c2rH2NsqizFzaAjQbAjdT_MgA79Nx9Dx4RjtA__6r1Kd9NPNu1ChdQCX15T2DHFNTOXb2kwSp-tu2iXbM_i9T1aQc6FfJsIaYOrN2nCo1ff13fgGG4P1z85G69NnJdcz1RrNISg8rNP5Ob1MmtxfFq2IauTZO?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/fZ8IJXyKBnzvAuttYUIzesW1DORx9JgNDiUWWc6Le_x25f75dgR9XRbbGaUTeeqcr3zwTGkiCYPMbaVKxWctNAORr01MTNBs2Ud_WCMjlFnZveKfgM5XVJp5EekUq-UzfAcJ75GsGsGNLQrjN7f1fsfZYw68XW-QcZ71p9NWPjttoGPzgQpeYvcbF3QVG0Xb?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/ftWw7uurVX64qbAG7GNS9jMedEPhrFM6IUvt_-vfLEnoqHuYObEyZyhzgsr1CVRF5Ec1hedomG7sevWby9moa_iMBC86sRPxOr0ufSbulXW5A0FwFDFnI1LS069ZsrW8LZXr4TVVF8bvkeomeUo8LGPHXYEoenzwwEx9OuQy7_dcHnl3P90arGzI4VkzPzQm?purpose=fullsize)

很多人只会存数据库。

其实：

Supabase 还有完整对象存储。

类似：

* AWS S3
* Firebase Storage

---

## 可以存：

* 图片
* 视频
* PDF
* 用户头像
* Markdown
* AI 文件

---

## Bucket

```text
avatars
videos
documents
```

---

## 上传：

```js
await supabase.storage
  .from('avatars')
  .upload('user1.png', file)
```

---

## 权限控制

也能配合 RLS：

```text
用户只能访问自己的文件
```

---

# 八、Edge Functions（后端函数）

![Image](https://images.openai.com/static-rsc-4/PFJLY8YfUIb1shjAtDhjKLTN-4hMYRkbGofGK3NkrfQjMpfdN0B73xpZ8toxf-z-DXx--p_rlTDq61bQnLqzG2PanaT0eG7agGtI56Xrq7E30VyMhEfrAsl3uouDXWfezWqjLSt0T8fyOOsrv48-aGXAWjgAj_CmxeT-hDfjIdM1Pk-R4Y7un1SSBTJ4XJ1w?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/9Bo6RynBLoFwDrbPHFFGeUkV90ctIGbOhBXzt-ozvyXSCOwTw4kf-6Bc-ZjG3x4mY4pr9m3S4LAAX5rBq_tsyV4C2Js_0MbDWZpOFX5YwH_Kaa4LR4Qv9An5BIulOm4O2ShiG9LruOqKVn2rCkT4TIFDou-d9OzZ0PzNfx0qPlA9uv87Ve7HpSroiN_0ygR7?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/Yrr0lQRDpj2yXLbGEmdIKDHzllTaifrBcsnjLMuChEaSYjzunNdhAzYCZKGvauGZ0dV4zflI_S9H-8T9oeTgKQs9iDF0cvJKrrggGnZpy6BcEF0Id_EN8YKU9mYIq0vMGwQbCXKhr6PGU8tsFakGRkBbsNA1f8i4gHUvm2JgpoL3LU4piDT9K10PRR8ULuJ7?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/pSbACNNJ5oJEu_whit9Q7ivVQ_AI4S0FRK6IO95gJ4miFllobgHtMRmSZpmEgZJeqIA_MfvEgvin0j5r95LXIiu_nY8ufk85B8KOBOc7ydiZ1bcc4MdjPa0f8nD_8RTjPTP2etA69k90g3TYTJf9GCN4S2CliV7gwMIm5nsm71TdUgPPCwfS7qhlryqzEUkP?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/8mQre1AQlYssVgXK-wRSX1YYu9RJRf6nUedBZvyLAhSloOi0Tx0i64olIqMhgfVX5DTqPyMABrNbSPPEiq7kURJ7736cyc_qSkYhE8hA0FGz69l_yAcllI8IcaxDRikqCoX7aPpA14wHe71BXAeI0i0BUX5-C-bWaYI1nXSfaXppSlooB6hKS2t-lyuR_CQk?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/k4lA_KGFDgJag8QihBvhaK-NmfL0w0oxCgnnV8nuDP_giWYhucrMKPFLLY_MjeAU4QlJdHY_mS297QVpT4bcJhfgQPtr-M-6WB3zlok1PyOBJDjlKTtzrfN0PncXX0rQdXEivOWHxfotbXH2O8mkCu_L7liRDE5dcHAEvPkSvO-lMrDZ3CMyOTr_jHBdGHft?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/xSgfDUIUBJSBmAiYuGtAzwW8Kl44B7LhKQXN68PkULErQNBWG1_1_cy4jYps1KtXwa6pAHaEO8epKuYa4RWOCtZj1q-Kb4FZtR2SYNjYah9xSqbaAsh0NFwW_PgG0EhE9N7gRPTiXCH_4Ckeweu0b8eRi52MDFzNRcpDIlSoy4RRqoNDWj0rG3Koc3Ot6Kwj?purpose=fullsize)

这是很多人完全没用过的高级能力。

---

## 本质

Serverless Functions。

类似：

* Vercel Functions
* Cloudflare Workers
* Netlify Functions

---

## 可以做：

* 支付回调
* AI API 中转
* OpenAI 调用
* Webhook
* 定时任务
* 敏感逻辑

---

## 示例

```ts
Deno.serve(async (req) => {
  return new Response("Hello")
})
```

---

## 最大价值

前端项目终于可以：

```text
前端 + Supabase = 全栈
```

无需传统后端。

---

# 九、Cron 定时任务

[Supabase Cron Docs](https://supabase.com/docs/guides/cron?utm_source=chatgpt.com)

很多人不知道 Supabase 支持 Cron。

例如：

* 每晚清理数据
* 自动发送邮件
* 定时同步
* AI embedding 更新

---

# 十、Database Functions（数据库函数）

这是 PostgreSQL 超强能力。

---

## SQL Function

```sql
create function add_post(title text)
returns void
language sql
as $$
  insert into posts(title)
  values(title);
$$;
```

前端：

```js
supabase.rpc("add_post", {
  title: "hello"
})
```

---

## 作用

非常强。

适合：

* 复杂事务
* 聚合逻辑
* 权限逻辑
* 高性能操作

---

# 十一、Triggers（触发器）

例如：

```text
用户注册后：
自动创建 profile
```

---

## 示例

```sql
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure handle_new_user();
```

---

# 十二、全文搜索（FTS）

PostgreSQL 原生能力。

很多人不知道 Supabase 搜索可以非常强。

---

## 示例

```sql
to_tsvector(content)
```

可以实现：

* 搜索文章
* 搜索评论
* 搜索知识库

甚至：

* 中文搜索
* 权重排序

---

# 十三、Vector / AI 能力（近两年非常重要）

![Image](https://images.openai.com/static-rsc-4/tnPuFK7aia3W79XAjmNBTzC9qir89JvNqMjBbaQusw6Hfp0hIb8AVNFj20V-RjItq7UTo9_fgGUHR9qqrAawPTi3I670liz8V0MPhx2mOE93YMTKULptyXHzmnAky0DJ8VjNEbzlnMDLuD1rV1NsGmZN6PPlcLx9ijNwRqQx6ZVILibi1Sb1CfKwEA7QNEd5?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/9bm4Emb4vaiw6jAQvDXETYMGfhCwDqBr06z6Q3APtQCL-Jz7YKw-Qu1uHGBdaCtGGUtRf5fDILqTXRG62Cc3lxw8fky5MsOe-yE-Mhn281j_1-0DjOOWuCjgSspcdSB72Y1PyPn7h8QM6IjjdvXCFzD3T4peOerQXewR30K2K_6M70ZTqag53UaIycA--VB_?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/x6rI-aSYwuhwsyYVr8GrDZ63A_9yPgPQufEpSt_X-5QaWs-XPgMr7533rUZ6xcoE0NxJtyV6_2eFbvg-m4-woFhyVyNrlU9wXHxBXWq4jhZHNaPa_iVExmotveG7EGLVJWOzAoWeZi1J0k_tsQSdiPaCM7a_6_Y24pqzvmFtlAF9fPHEhzlUAJn9HdhBlQ53?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/HkeRbBwCRx6f9eRVwAv5ZTf0RfNEtTpzT80Ixuxl7z0rj_Is6wmli36f0X17_jroeN5uSRc-PKGRgSDnVQEhrG8BrFej42tpU50x3Ml2xtxW3tW7lYcpdpj1-lvp-QBT0HjRs58pVOeOrYB0cxFknltbFE5qlL-ctr-wEQb8K0H4THqKakT1UD94xi_3oCd2?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/GqQX9f-MGGPwY4xzI4iQzcBmI7xQYiDEYhAM636rb07tkfgCF4lvK6jAtZwbBh8kBUkO5T383k9qjlrZL1arIcsvdqya5Lz7PiA-I9LcFvDurpXfUqC0A8Zb6NxFHlKnd_MH_MU8eW5z_xyhtT5g1QiP7I6nU6VC3Bnp_iLznP12n-zhaxNH21IeK23MKcUN?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/QScWhtGIftluSNaX76WE5mC1qkxBOBgXudnquwmpwuQbj6BFSAhzbAQ7SsSH2ZZHod3KpscOAlcO5H7V7GfH4YWgmebR1ZWVTo6PnxIjF7lcCylLMYFK1OnEbIZRAgo8eC7OVph9Yru5FB7zneiEPPWnMPttCjDV11phTaSJIZVX2AhNgTJwRdzF5GVMBqIT?purpose=fullsize)

Supabase 现在大力发展 AI。

核心：

# pgvector

PostgreSQL 向量扩展。

---

## 可以做：

* AI 语义搜索
* RAG
* Embedding
* ChatGPT 知识库
* 文档检索

---

## 示例

```sql
embedding vector(1536)
```

然后：

```sql
order by embedding <-> query_embedding
```

---

## 这意味着：

Supabase 可以直接做：

* AI 知识库
* AI 聊天机器人
* AI 搜索系统

很多 AI SaaS 都是：

```text
Next.js + Supabase + OpenAI
```

---

# 十四、Extensions（扩展）

[PostgreSQL Extensions in Supabase](https://supabase.com/docs/guides/database/extensions?utm_source=chatgpt.com)

这是高手最爱部分。

Supabase 支持 PostgreSQL 扩展。

例如：

* pgvector
* postgis
* pg_cron
* pgjwt
* uuid-ossp

---

## PostGIS

地理空间能力。

可做：

* 地图
* 附近的人
* 距离搜索
* 轨迹

---

# 十五、日志 & 监控

![Image](https://images.openai.com/static-rsc-4/X_3juHaFfLpopAC58Cu77lSa03Vw82vhqXFJXB01-w0nwNqhGHRsLy1as3PunnNPM29jF_B7ldX8MydE2hZQ0Fk17SkYy-f6MCHN_jOEeZDOADcI01G5VmBR4ii3MPzqnzGZy8IUTDx1X7qoBetdlMEDoTyOFkH6Y7485mYcWn5saqAIJZhpgDnLgG1YHLbg?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/qz4myc69dTJCEtapoOmY1T5C45US7v8cmrVeEKLqOJt1K3Xka9QRTGSG56M6CA2PCpVfFVLLrgVYQxa5ma1ScNOHh27rp5bH4HJt11RiL6UADXGCE4JQY3Xc5h0XRR46joCZ0bFYxJ0PBwukl2VaajYkttB5NwVTTVraMkVTDlts0bprohneOfLGbKU_0usO?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/rdNni49rpmCYspBYWF_H2cdBbkwNXP_yUXg4JsB8fdcFd_R0uDtWuK4No3LakD3wqJovxGz2Ife3WNqS7xA7Ph3fi1sgyyQLNIWgHAWC1jiW0k3vJf2BlDixm0eEqcwlUGzhr43a3f-CIhul8CUqCthi5sMyLBKEKahg_A3YtO98IVXxFdz4ssDYRyWbpQiJ?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/2BuYWPEKSWNY_nx034urwtcKYR_al9ojVXOTLPLvxTcsnRJkEd-KYei26UFmXsJtWoO6pZiMhoiDVqmDq_I_9pxMg6pQaKF1tm2T32urVClhG_yPkUF4BGy0Sc5Vfrz7-XckcxxFjGZKltGxIqGpqIQcF4jK2gcCsr5Mww5xefwiBoKhgMRY_2Np-Epasyyf?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/Gq21h3RvXfGsQsfCsonZUNyyZPNTHiVKkg1cyyoHU7ytxv-OjX-wAD1gKLhVV9f18zEhmhnECemZfCM2Tp_T8lvWj7o8J7l16haKCRS_chUIdo19ATipi_-FxYrCOszvTrf2_9rsoBLG_rS8y0ynRF1JAbcK83OoEzHyFNey0ZjOjf9ciEPGNWzgeqMvYkWR?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/8yRvXWQxVaNj9DkG-ScJy8wnMgnHhBlizzOTgfsYw6-XaIeh3v3dXPiam0QXZBX8ukLu6oGExvCiDP2oDp5-uLuj7OQhTETcszDXZBk364-UwcOsGVwuHNHdmxIcUE7p_REMRmnNfDgt7x9Qpx2rbvVDJ8VZJDlhWNfGBIH5ierAkWPGGLxM7oHoQ2O__Yep?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/msLNT4vyTfNs0DUo8AS6_NxB-msgftNZS5e_R7KbdV6d359wCuV9fGpvAYGQP-fCMABmwHn1MwTkt5vmOQ0c-dWMUdVA2EnTro-SSFb_8uNiRYUUeD6J_Efl3xyPVoRyGMCQ0-o407ChubekwBixEByTCfWs9eOfdMC0HbZfceOw8aYMWtYuSZy1ENiur3U-?purpose=fullsize)

内置：

* API Logs
* Auth Logs
* Database Logs
* Edge Logs

可以排查：

* 慢查询
* 错误
* 认证失败

---

# 十六、Migration（迁移）

[Supabase CLI](https://supabase.com/docs/guides/cli?utm_source=chatgpt.com)

高手基本都用 CLI。

---

## 功能

```bash
supabase migration new
supabase db push
supabase db pull
```

类似：

* Prisma
* Laravel Migration

---

# 十七、本地开发（很多人不知道）

Supabase 能本地运行。

---

## Docker 本地部署

```bash
supabase start
```

直接启动：

* PostgreSQL
* Auth
* Realtime
* Storage

---

## 价值

你能：

* 离线开发
* 本地测试
* 自建 Supabase

---

# 十八、自托管（Self-host）

[Supabase Self Hosting](https://supabase.com/docs/guides/self-hosting?utm_source=chatgpt.com)

Supabase 是开源的。

你甚至能：

```text
自己部署整个 Supabase
```

很多公司这么干。

---

# 十九、真正的 Supabase 技术栈

现在很多现代项目：

```text
Next.js
Supabase
Stripe
OpenAI
Vercel
```

就已经能做 SaaS。

---

# 二十、Supabase 为什么火

因为它解决了：

```text
前端不会后端
```

的问题。

以前：

```text
React
↓
Node.js
↓
Express
↓
JWT
↓
MySQL
↓
Redis
↓
Socket.io
↓
S3
```

现在：

```text
React
↓
Supabase
```

很多东西直接没了。

---

# 二十一、Supabase 最容易被低估的能力

很多开发者只会：

```js
.from().select()
```

但真正高级玩法是：

---

## 1. RLS + Auth

数据库级权限。

这是 Supabase 灵魂。

---

## 2. PostgreSQL 原生能力

真正强的是 PostgreSQL。

---

## 3. Realtime

很多应用瞬间变实时系统。

---

## 4. Edge Functions

直接具备后端能力。

---

## 5. Vector AI

AI 项目天然适合。

---

# 二十二、推荐学习路线（非常重要）

如果你想真正掌握 Supabase：

---

## 第一阶段（你现在）

* CRUD
* Tables
* Select/Insert

---

## 第二阶段（关键）

必须学：

* Auth
* RLS
* Storage

这是分水岭。

---

## 第三阶段（真正变强）

学：

* SQL
* PostgreSQL
* Function
* Trigger
* Index
* JSONB

---

## 第四阶段（高级）

学：

* Realtime
* Edge Functions
* Vector
* pgvector
* Full-text search

---

# 二十三、真正理解后，你会发现：

Supabase 不是：

```text
在线数据库
```

而是：

```text
基于 PostgreSQL 的现代全栈后端平台
```

甚至更准确说：

```text
“把传统后端工程体系产品化”
```

这是它厉害的地方。
