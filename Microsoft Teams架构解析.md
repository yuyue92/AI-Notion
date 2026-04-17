**Microsoft Teams 本质上不是一个“单体聊天软件”，而是一个把身份、聊天、文件、日历、会议、电话、合规与扩展能力，统一编排到一个客户端里的 Microsoft 365 协同壳。** 微软公开了很多逻辑架构和依赖关系，但没有把所有内部微服务、分库分片、消息总线细节完全公开；所以下面我会分成“官方明确公开的部分”和“基于这些公开信息可以推出来的工程设计”。 ([Microsoft Learn][1])

## 1. 先把 Teams 看成六层架构

从公开资料看，Teams 大致可以拆成这六层：

**客户端层**：桌面端、Web、移动端、会议室设备。新 Teams 客户端已重构为基于 Edge WebView2 的新架构。 ([Microsoft Learn][2])

**身份与租户层**：以 Microsoft Entra ID 为统一身份入口，负责 SSO、多租户、多账号、条件访问等。 ([Microsoft Learn][3])

**协同控制层**：聊天、频道、会议、通话、通知、状态、日程等用户可见能力。Teams 官方服务描述里明确把 IM、音视频通话、在线会议、文件协作和可扩展能力都作为服务核心。 ([Microsoft Learn][1])

**数据底座层**：不是一个数据库包打天下，而是把不同类型数据落到不同后端：聊天/频道消息、文件、邮箱/日历、媒体、录制，各自走不同存储。 ([Microsoft Learn][4])

**安全与合规层**：Purview、DLP、eDiscovery、Retention、Sensitivity Labels、Customer Key、Defender 等不是外挂，而是 Teams 设计的一部分。 ([Microsoft Learn][3])

**扩展与生态层**：Tabs、Bots、Message Extensions、Webhooks/Connectors、Graph API、会议/通话 Bot。 ([Microsoft Learn][5])

---

## 2. Teams 为什么不是“自己全做”，而是“编排 Microsoft 365”

微软官方文档反复强调，**完整 Teams 体验依赖 Exchange Online、SharePoint Online 和 Microsoft 365 Groups**；也就是 Teams 不是孤立产品，而是站在 Microsoft 365 上层，把这些底座能力统一成一个协同入口。 ([Microsoft Learn][6])

这套设计有两个直接好处。第一，**复用成熟底座**：身份用 Entra，文件用 SharePoint/OneDrive，日历/邮箱/合规副本用 Exchange，不必为每种能力重新造平台。第二，**天然继承企业能力**：权限、审计、留存、检索、DLP、标签、法务保留都能直接接上，不用另做一套“聊天软件专用合规系统”。 ([Microsoft Learn][3])

所以从产品哲学上说，Teams 更像：**统一协同入口 + 多工作负载编排器**，而不是 Slack/Zoom/Drive 的简单拼盘。 ([Microsoft Learn][1])

---

## 3. 客户端架构：新 Teams 是怎么设计的

公开资料里，微软已经说明新 Teams 客户端**使用 Evergreen 版 Edge WebView2**，并把客户端“从头按性能重建”。官方博客进一步给出了较明确的桌面端架构线索：**native host + Edge WebView2 + IPC + GraphQL 作为客户端数据抽象层 + React + TypeScript + Fluent UI**。此外，Teams 平台应用不再需要传统 WebView 包裹，而是通过 Edge 渲染进程中的 out-of-process iframe 承载。 ([Microsoft Learn][2])

这说明它的客户端并不是“纯网页壳”那么简单，而是**原生宿主 + Web 技术 UI + 进程隔离 + 客户端数据抽象层**的混合方案。这样做的优点很明显：跨平台一致性更强、前端技术栈统一、迭代速度更快、插件承载更自然。代价则是对 WebView2 运行时、进程间通信、渲染性能和缓存策略更敏感。微软自己也把性能测试、实验评分卡、回归阻断、Dashboard 和专门性能团队写进了公开博客。 ([TECHCOMMUNITY.MICROSOFT.COM][7])

如果你从架构视角看，这种客户端路线本质上是在追求：**“像 Web 一样快迭代，像 Native 一样接系统能力”**。 ([Microsoft Learn][2])

---

## 4. 数据架构：Teams 的数据到底放在哪

这是 Teams 最关键的地方：**它不是把所有东西都塞进一个统一库里。**

微软公开说明，**每个 Team 都由一个 Microsoft 365 Group、一个 SharePoint 站点和一个 Exchange 邮箱支撑**。同时，聊天/频道消息和团队结构由 **Azure 驱动的聊天服务**承载；在 eDiscovery 文档里更进一步写明，**真实 Teams 消息数据存于 Azure Cosmos DB，Exchange Online 里存的是由 substrate 捕获的合规记录，且这些内容对客户端是隐藏的**。换句话说，**业务主存储和合规副本是分离的**。 ([Microsoft Learn][4])

文件这块也分得很细。**标准频道文件**存团队关联的 SharePoint 站点；**私有频道、共享频道**则有各自独立的 SharePoint 站点；而 **1:1 聊天和群聊里分享的文件**，存的是分享者自己的 OneDrive。 ([Microsoft Learn][8])

消息这块，微软还公开了合规副本路径：**1:1 聊天消息会进入所有参与者的 Exchange Online 邮箱；标准频道消息进入团队关联邮箱；Teams 聊天与频道消息在主路径上由 Azure 聊天服务保存，同时在 Exchange 隐藏文件夹里保留副本，用于 eDiscovery、Retention、Legal Hold 等合规能力。** ([Microsoft Learn][9])

媒体和录制也独立处理。官方数据驻留文档说，**聊天中用到的图片与媒体存 Azure-based Media Service**；**会议录制**则存录制发起者或组织者的 OneDrive（部分场景会结合 SharePoint/Stream on SharePoint）。 ([Microsoft Learn][4])

这套设计非常值得学：
**主业务存储负责低延迟和实时体验；Exchange/SharePoint/OneDrive 负责“企业级可治理数据面”。** 这就是 Teams 能同时兼顾“像 IM 一样快”和“像企业内容系统一样可审计”的原因。 ([Microsoft Learn][9])

---

## 5. 会议与通话架构：实时媒体是怎么跑的

微软公开的通话流文档给得很具体。**一对一通话会先交换 ICE candidates，本地/公网反射/relay 候选一起尝试，再通过 STUN 连通性检测选出可行的最佳路径。** 如果直连可行，就尽量走端到端直达；如果不可行，则通过 Microsoft 365 的 **Teams Transport Relay** 转发媒体。媒体使用 **SRTP** 保护。 ([Microsoft Learn][10])

会议则不是同一套思路。官方明确说，**Teams conference 由 Microsoft 365 托管在第一个参与者加入的区域**；而且媒体端点是否上云，不是由“是不是会议”简单决定，而是由**是否需要媒体处理**决定，例如录制、转写、混流、路由等。微软还直接写明：**大多数会议会使用云端媒体端点做 mixing 和 routing。** ([Microsoft Learn][10])

另一个很重要但常被忽略的点是：Teams 现在**既支持实时媒体流 RTP，也支持通过 HTTPS 的流式媒体**，具体看会议类型；CQD 也能分别展示这两类流的指标。这个信息其实说明 Teams 已经不是只有传统 WebRTC/VoIP 那一条路，而是会针对 town hall、直播类场景走不同媒体技术栈。 ([Microsoft Learn][11])

从工程上看，微软在媒体层的设计取舍是：
**能直连就直连，降低时延和云成本；需要处理就上云端媒体节点，换取录制、转写、混流、合规、会议控制这些高级能力。** 这是非常标准也非常成熟的企业实时通信设计。 ([Microsoft Learn][10])

---

## 6. Teams Phone：企业电话能力怎么接进来

Teams 不只是“网内会议”，它还把传统企业电话能力接了进来。微软官方把 PSTN 连接方式分成四种：**Microsoft Calling Plan、Operator Connect、Teams Phone Mobile、Direct Routing**。其中最灵活的是 **Direct Routing**，通过受支持的 **SBC** 把企业现有运营商、PBX、模拟设备接入 Teams；最省事的是 Calling Plan；Operator Connect 和 Phone Mobile 则介于中间。 ([Microsoft Learn][12])

这说明 Teams 的语音方案不是单一产品，而是一个**电话接入平台**。你可以把它理解成：
**Teams 前端 + Microsoft 云控制面 + 多种 PSTN 互联模型 + 企业现网兼容层。** 这也是它为什么能从“协同工具”扩展成“统一通信平台”。 ([Microsoft Learn][12])

---

## 7. 安全与合规：这其实是 Teams 架构的一半

微软公开文档里，Teams 的安全底线包括：**组织级/团队级双因素认证、通过 Entra ID 单点登录、传输中和静止状态加密**。在媒体层，微软安全指南明确提到 **TLS** 用于认证和信令保护，**SRTP** 用于媒体流加密。 ([Microsoft Learn][3])

更关键的是企业治理能力。Teams 原生接入 **Conditional Access、Audit、Communication Compliance、DLP、eDiscovery、Retention、Sensitivity Labels、Customer Key**。而且这些能力并不是“补丁式叠加”，而是因为 Teams 本来就和 Exchange、SharePoint、OneDrive 深度耦合，所以这些治理能力能落到真实的数据面上。 ([Microsoft Learn][3])

这也解释了一个很典型的设计：**Teams 真实消息在 Azure 聊天服务/Cosmos DB，合规副本在 Exchange 隐藏邮箱。** 这样一来，前台协同系统可以专注实时体验，后台合规系统可以专注审计、法务、留存和检索。两边职责明确。 ([Microsoft Learn][9])

---

## 8. 可扩展平台：Teams 为什么能长成一个“操作系统”

官方文档列得很清楚，Teams 扩展主要包括：**Tabs、Bots、Messaging Extensions、Webhooks/Connectors**。其中 **Tabs** 本质上是嵌入在 Teams 里的 client-aware 网页 iframe；**Bots** 是对话式能力；**Message Extensions** 让用户在消息输入区、命令框或消息上下文里搜索外部系统或触发动作；**Webhooks/Connectors** 用于把外部系统事件推到频道。 ([Microsoft Learn][5])

更进一步，Teams 还开放了**会议/通话 Bot**。微软公开说明，Bots 可以通过 **Microsoft Graph 的 calls/online meetings API** 参与语音、视频、屏幕共享，且 **Real-time Media Platform** 支持更底层的实时媒体处理。这意味着 Teams 不只是“嵌入业务页面”，而是允许开发者进入会议控制面和媒体面。 ([Microsoft Learn][13])

所以 Teams 的平台化路径其实很像企业版 super-app：
**协同入口 + 身份体系 + 数据/权限统一 + 应用嵌入 + 事件集成 + 会议能力开放。** ([Microsoft Learn][5])

---

## 9. 从架构师视角，Teams 最值得学的 5 个设计思想

**第一，不做单体。**
Teams 把聊天、文件、日历、媒体、电话、合规拆到不同底座，不追求“一个库一个服务全解决”。这是典型的大型协同平台做法。 ([Microsoft Learn][4])

**第二，前台实时、后台可治理。**
主消息走 Azure 聊天服务/Cosmos DB，合规副本走 Exchange 隐藏存储；文件走 SharePoint/OneDrive。体验和治理分层。 ([Microsoft Learn][9])

**第三，媒体路径按场景动态选。**
1:1 优先直连，必要时 relay；会议多数上云媒体节点；直播类场景还能切到 HTTPS streaming。 ([Microsoft Learn][10])

**第四，把平台能力做成原生入口。**
Tabs、Bots、消息扩展、会议 Bot 说明 Teams 不是“加插件”，而是从第一天就按平台设计。 ([Microsoft Learn][5])

**第五，把运维观测做到产品级。**
CQD 说明微软把呼叫质量、端点遥测、RTP/Streaming 区分、劣化分类都产品化了。大规模实时协同系统没有这层，后面一定会很痛苦。 ([Microsoft Learn][11])

---

## 10. 如果你要做一个“类 Teams”系统，方案该怎么落地

如果把 Teams 的思路抽象成一套可复用方案，我会这么分：

**A. 统一身份与租户层**
单点登录、多租户隔离、组织/项目/频道三级权限模型，最好把条件访问、设备策略、审计入口从第一天就预留。这个是 Teams 之所以能进企业的门槛。 ([Microsoft Learn][3])

**B. 协同控制面**
把聊天、频道、通知、状态、会议调度做成独立服务，不要和文件、搜索、审计耦死。Teams 明显就是控制面编排多个后端能力。 ([Microsoft Learn][14])

**C. 数据面分层**
实时消息库、对象存储、搜索/审计副本、录制媒体库分开。不要指望一个 OLTP 库同时兼顾 IM 延迟、文件分发、全文检索、合规留存。Teams 的公开数据布局已经把这件事说明白了。 ([Microsoft Learn][9])

**D. 会议媒体层单独建设**
至少区分 signaling、media relay、SFU/MCU、recording/transcription。1:1 与多人会议不能同一套简单链路；直连、relay、云混流必须能切换。 ([Microsoft Learn][10])

**E. 平台化入口**
把 Web tab、Bot、消息扩展、Webhook 做成一等公民。很多产品死在“功能够了，但生态进不来”。Teams 的扩展面是它长期价值的关键。 ([Microsoft Learn][5])

**F. 可观测性先行**
QoS 遥测、端侧性能、网络丢包、延迟、抖动、设备故障、会议质量面板，这些不是后补模块，而是基础设施。 ([Microsoft Learn][11])

---

## 11. 一句话总结

**Teams 的核心不是“聊天 + 开会”，而是“以统一客户端承载多工作负载，用 Microsoft 365 作为企业级数据与治理底座，再用开放平台把协同能力扩出去”。**
所以它真正厉害的地方，不是某个单点功能，而是：**实时协同、企业数据治理、语音互联、应用平台，这四件事被它放进了一套一致的架构里。** ([Microsoft Learn][1])
