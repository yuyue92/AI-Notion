# 《如何用 Python 抓取网页数据》

网页抓取（Web Scraping）是 Python 最经典的应用之一。

很多人第一次学 Python，就是因为：

* 想批量下载数据
* 想自动采集网站内容
* 想做信息监控
* 想分析商品、新闻、股票、招聘信息
* 想替代重复的人力操作

这篇文章分成三个层级：

1. 小白版 —— 复制粘贴即可运行
2. 进阶版 —— 真正能应对网站限制
3. 专业版 —— 工业级异步抓取架构

你可以按自己的水平阅读。

---

# 一、小白版：10分钟学会网页抓取

适合：

* Python 初学者
* 从未写过爬虫
* 想快速体验“自动抓网页”

核心目标：

> 用最少代码抓取网页标题

---

# 1. 先安装 Python 库

打开终端（CMD / PowerShell）：

```bash
pip install requests beautifulsoup4
```

安装两个库：

| 库             | 作用   |
| ------------- | ---- |
| requests      | 下载网页 |
| BeautifulSoup | 解析网页 |

---

# 2. 第一个爬虫

创建文件：

```python
demo.py
```

复制下面代码：

```python
import requests
from bs4 import BeautifulSoup

# 目标网址
url = "https://news.ycombinator.com/"

# 请求网页
response = requests.get(url)

# 获取网页HTML
html = response.text

# 解析HTML
soup = BeautifulSoup(html, "html.parser")

# 找到所有标题
titles = soup.select(".titleline a")

# 输出结果
for index, title in enumerate(titles, start=1):
    print(f"{index}. {title.text}")
```

运行：

```bash
python demo.py
```

你会看到：

```python
1. Example Title
2. Another Title
3. Some News
```

---

# 3. 每一步到底在干什么？

---

## 第一步：requests.get()

```python
response = requests.get(url)
```

相当于：

> 浏览器访问网站

网站返回：

* HTML
* 图片
* JS
* CSS

这里我们只拿 HTML。

---

## 第二步：response.text

```python
html = response.text
```

拿到网页源码。

你可以打印：

```python
print(html)
```

会看到一大堆 HTML 标签。

---

## 第三步：BeautifulSoup

```python
soup = BeautifulSoup(html, "html.parser")
```

作用：

> 把乱糟糟HTML变成可搜索对象

类似：

* 浏览器DOM树
* 网页结构化

---

## 第四步：select()

```python
titles = soup.select(".titleline a")
```

这里用的是 CSS 选择器。

意思：

```css
.titleline a
```

即：

> class="titleline" 里面的 a 标签

---

# 4. 如何找到网页元素？

Chrome 浏览器：

* 右键
* 检查（Inspect）
* 查看HTML结构

例如：

```html
<span class="titleline">
    <a href="...">新闻标题</a>
</span>
```

所以：

```python
.titleline a
```

就能选中它。

---

# 5. 保存到CSV

实际开发中，通常需要保存数据。

```python
import csv
import requests
from bs4 import BeautifulSoup

url = "https://news.ycombinator.com/"
response = requests.get(url)

soup = BeautifulSoup(response.text, "html.parser")

titles = soup.select(".titleline a")

with open("news.csv", "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)

    writer.writerow(["标题", "链接"])

    for title in titles:
        writer.writerow([
            title.text,
            title["href"]
        ])

print("保存完成")
```

运行后会生成：

```python
news.csv
```

Excel 可直接打开。

---

# 6. 小白版适用场景

适合：

* 新闻列表
* 博客文章
* 商品名称
* 简单数据采集

不适合：

* 登录网站
* JS动态加载
* 大规模抓取
* 高频请求

---

# 二、进阶版：真正能用的爬虫

现实中的网站：

* 会限制访问
* 会封IP
* 会校验请求头
* 会超时
* 会反爬

所以需要更专业写法。

---

# 1. 加入请求头（User-Agent）

很多网站会拦截默认Python请求。

正确做法：

```python
headers = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 "
        "(KHTML, like Gecko) "
        "Chrome/136.0 Safari/537.36"
    )
}
```

---

# 2. 完整进阶版代码

```python
import requests
from bs4 import BeautifulSoup
import time
import random

headers = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 "
        "(KHTML, like Gecko) "
        "Chrome/136.0 Safari/537.36"
    )
}

url = "https://news.ycombinator.com/"

try:
    # 超时时间
    response = requests.get(
        url,
        headers=headers,
        timeout=10
    )

    # 检查状态码
    response.raise_for_status()

    soup = BeautifulSoup(
        response.text,
        "html.parser"
    )

    titles = soup.select(".titleline a")

    for title in titles:
        print(title.text)

    # 随机等待
    sleep_time = random.uniform(1, 3)
    time.sleep(sleep_time)

except requests.exceptions.Timeout:
    print("请求超时")

except requests.exceptions.HTTPError as e:
    print("HTTP错误：", e)

except requests.exceptions.RequestException as e:
    print("请求失败：", e)
```

---

# 3. 为什么要异常处理？

真实网络环境：

* 网站崩了
* 网络断了
* 被限流
* DNS失败
* 连接超时

如果不处理：

```python
程序直接崩溃
```

专业程序必须：

```python
即使失败也能继续运行
```

---

# 4. 常见反爬策略

很多网站会检测：

| 反爬方式         | 说明       |
| ------------ | -------- |
| User-Agent检测 | 判断是不是浏览器 |
| 请求频率检测       | 请求太快     |
| IP封禁         | 同IP过多访问  |
| Cookie校验     | 判断是否真人   |
| JS加密         | 必须执行JS   |
| 验证码          | 人机验证     |

---

# 5. 如何降低被封概率？

---

## （1）控制请求频率

别这样：

```python
for url in urls:
    requests.get(url)
```

应该：

```python
time.sleep(random.uniform(1, 5))
```

模拟真人。

---

## （2）使用 Session

```python
session = requests.Session()
```

作用：

* 自动保存Cookie
* 更像真实浏览器
* 提升连接效率

示例：

```python
session = requests.Session()

response = session.get(url, headers=headers)
```

---

## （3）代理IP

很多网站限制：

```python
一个IP访问次数
```

可以：

```python
proxies = {
    "http": "http://代理IP",
    "https": "http://代理IP"
}
```

---

# 6. 动态网页怎么办？

很多网站内容是 JS 加载的。

requests 拿不到。

这时需要：

| 工具           | 用途      |
| ------------ | ------- |
| Selenium     | 自动控制浏览器 |
| Playwright   | 更现代自动化  |
| DrissionPage | 国产优秀方案  |

---

# 7. Selenium 示例

安装：

```bash
pip install selenium
```

代码：

```python
from selenium import webdriver
from selenium.webdriver.common.by import By

driver = webdriver.Chrome()

driver.get("https://example.com")

titles = driver.find_elements(
    By.TAG_NAME,
    "h2"
)

for t in titles:
    print(t.text)

driver.quit()
```

---

# 8. 进阶版适用场景

适合：

* 电商网站
* 登录网站
* JS动态网页
* 中小规模采集

不适合：

* 百万级数据
* 高并发抓取
* 分布式系统

---

# 三、专业版：工业级爬虫系统

这是企业真正使用的架构。

特点：

* 高并发
* 异步IO
* 自动重试
* 数据管道
* 分布式
* 可监控
* 可扩展

---

# 1. 为什么普通爬虫很慢？

普通 requests：

```python
请求A -> 等待
请求B -> 等待
请求C -> 等待
```

大量时间浪费在：

```python
网络等待
```

---

# 2. 异步爬虫核心思想

异步：

```python
发出请求后不等待
继续处理其他任务
```

即：

```python
同时抓很多网页
```

速度提升巨大。

---

# 3. 专业级技术栈

| 技术         | 用途     |
| ---------- | ------ |
| aiohttp    | 异步HTTP |
| asyncio    | 异步调度   |
| Redis      | 队列     |
| Kafka      | 消息流    |
| PostgreSQL | 数据存储   |
| Scrapy     | 爬虫框架   |
| Playwright | 浏览器自动化 |

---

# 4. aiohttp 异步抓取示例

安装：

```bash
pip install aiohttp beautifulsoup4
```

完整代码：

```python
import asyncio
import aiohttp
from bs4 import BeautifulSoup

urls = [
    "https://example.com",
    "https://example.org",
    "https://example.net"
]

headers = {
    "User-Agent": (
        "Mozilla/5.0"
    )
}

async def fetch(session, url):
    try:
        async with session.get(
            url,
            headers=headers,
            timeout=10
        ) as response:

            html = await response.text()

            soup = BeautifulSoup(
                html,
                "html.parser"
            )

            title = soup.title.string

            print(url, "->", title)

    except Exception as e:
        print(url, "失败：", e)

async def main():

    async with aiohttp.ClientSession() as session:

        tasks = []

        for url in urls:
            task = asyncio.create_task(
                fetch(session, url)
            )
            tasks.append(task)

        await asyncio.gather(*tasks)

asyncio.run(main())
```

---

# 5. 为什么异步快很多？

同步：

```python
一次只能等一个网站响应
```

异步：

```python
同时等待几十上百个网站
```

网络IO利用率暴增。

---

# 6. 数据管道（Pipeline）

专业爬虫不会：

```python
抓完直接print
```

而是：

```text
抓取层
  ↓
清洗层
  ↓
去重层
  ↓
存储层
  ↓
分析层
```

---

# 7. 专业架构示意

```text
URL队列
   ↓
异步抓取器
   ↓
HTML解析器
   ↓
数据清洗
   ↓
去重系统
   ↓
数据库
   ↓
分析系统
```

---

# 8. 常见数据库方案

| 数据类型  | 推荐            |
| ----- | ------------- |
| 结构化数据 | PostgreSQL    |
| 日志    | Elasticsearch |
| 大规模缓存 | Redis         |
| 海量分析  | ClickHouse    |

---

# 9. Scrapy 企业级框架

Scrapy 是 Python 最经典爬虫框架。

特点：

* 自动调度
* 自动重试
* 自动限速
* Pipeline
* 中间件
* 分布式支持

安装：

```bash
pip install scrapy
```

创建项目：

```bash
scrapy startproject myspider
```

---

# 10. 专业版适用场景

适合：

* 舆情系统
* 电商监控
* 金融数据
* 搜索引擎
* 大规模数据平台

---

# 四、你真正要理解的核心

很多人学爬虫只会：

```python
复制代码
```

但真正核心其实只有三件事：

---

## 1. 请求（Request）

如何访问网站。

---

## 2. 解析（Parse）

如何从HTML中提取数据。

---

## 3. 存储（Save）

如何把数据保存起来。

---

# 五、学习路线建议

---

## 第一阶段

学习：

* requests
* BeautifulSoup
* CSS选择器

目标：

```python
能抓静态网页
```

---

## 第二阶段

学习：

* Selenium
* Playwright
* Session
* Cookie
* 反爬

目标：

```python
能抓动态网站
```

---

## 第三阶段

学习：

* asyncio
* aiohttp
* Scrapy
* Redis
* PostgreSQL

目标：

```python
构建工业级爬虫
```

---

# 六、必须注意的法律与伦理问题

不要：

* 抓取隐私数据
* 攻击网站
* 高频压测
* 绕过付费系统

建议：

* 阅读 robots.txt
* 控制访问频率
* 尊重网站条款

---

# 七、最后总结

如果一句话总结 Python 爬虫：

> 本质就是“自动访问网页 + 提取信息”。

三种层级：

| 版本  | 特点      |
| --- | ------- |
| 小白版 | 能跑      |
| 进阶版 | 能长期稳定运行 |
| 专业版 | 能支撑商业系统 |

真正的差距不在“会不会写 requests”。

而在：

* 如何处理异常
* 如何绕过反爬
* 如何设计架构
* 如何管理数据流

这才是爬虫工程化的核心。
