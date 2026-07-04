# LAN-Ferry：基于 WebRTC 的 P2P 大文件分片传输工具

内网环境下，浏览器 A ⇄ 浏览器 B 直接传输 GB 级文件，Node.js 服务器仅做"信令牵线"，不接触任何文件数据。

```
webrtc-file-transfer/
├── signaling-server/        # Node.js + Socket.io 信令服务器
│   └── server.js
└── client/                  # Vue3 前端
    └── src/
        ├── utils/
        │   ├── protocol.js      # 二进制分片打包/解包 + CRC32 + 位图
        │   ├── chunkSizer.js    # 动态分片大小(类 AIMD)
        │   ├── webrtcManager.js # PeerConnection/DataChannel/ICE重连
        │   ├── chunkManager.js  # FileSender / FileReceiver 业务逻辑
        │   ├── hashUtil.js      # 增量 SHA-256（hash-wasm）
        │   ├── storage.js       # IndexedDB 断点续传状态
        │   └── fileWriter.js    # File System Access API 流式落盘
        ├── components/          # ConnectionPanel / DropZone / TransferProgress
        └── App.vue
```

## 快速运行

```bash
# 1. 信令服务器
cd signaling-server && npm install && npm start   # 默认监听 :3001

# 2. 前端（内网两台/两个标签页都打开这个地址）
cd client && npm install && npm run dev            # 默认监听 :5173
```

两个浏览器标签页（或局域网内两台机器）打开客户端页面，填入同一个信令服务器地址与同一个房间号，先加入的是 `host`（发起 Offer），后加入的是 `guest`。连接建立后，任意一方拖拽文件即可开始发送。

> 建议使用 Chrome/Edge，以获得 File System Access API 支持（流式落盘、断点续传句柄持久化）；Firefox/Safari 会自动降级为内存拼接模式。

---

## 一、整体协议设计

一个 `RTCPeerConnection` 上开两条 `RTCDataChannel`：

| Channel | 配置 | 承载内容 |
|---|---|---|
| `control` | 默认可靠有序（SCTP 默认模式） | 文件元信息、续传位图查询、NACK（缺片请求）、传输完成、哈希校验结果 |
| `data` | `{ordered:false, maxRetransmits:0}` 不可靠无序 | 文件分片二进制数据本体 |

**为什么数据通道要故意选"不可靠"？** 如果用默认可靠通道，SCTP 在传输层丢包后会自动重传，但重传期间会阻塞它后面已经到达的分片交付给应用层（队首阻塞，Head-of-Line Blocking），对大文件顺序吞吐是明显损耗。改为不可靠通道后，底层丢了就丢，不做任何自动重传/阻塞；由应用层在 `control` 通道上用 NACK **精确点名**哪些 `chunkIndex` 没收到，只重传这些分片——这就是题目里"差错隐藏机制 + 类 SCTP 重传请求"的实现方式：重传语义搬到应用层做**选择性重传（Selective Repeat ARQ）**，但仍然运行在 SCTP/DTLS 提供的加密、拥塞控制之上。

---

## 二、ArrayBuffer 二进制打包与解包详解

### 1. 为什么不用 JSON 包一层再传？

`{"index":123456,"data":"<base64>"}` 这种写法有两个致命问题：Base64 会带来约 33% 的体积膨胀；JSON.parse/stringify 在高频（每秒成千上万个分片）场景下是明显的 CPU 热点。二进制自定义帧格式可以把这两项开销都消除掉。

### 2. 帧格式（`protocol.js`）

```
┌──────────┬───────────┬──────────┬─────────────────┐
│ 0–3 字节  │ 4–7 字节   │ 8–11 字节 │ 12..N 字节        │
│chunkIndex│ payloadLen│  crc32   │   payload(原始字节)│
│ Uint32   │  Uint32   │  Uint32  │  ArrayBuffer      │
└──────────┴───────────┴──────────┴─────────────────┘
HEADER_SIZE = 12 字节，全部按大端序（网络字节序）写入。
```

**打包（发送端）：**

```js
function packChunk(chunkIndex, payload) {
  const frame = new ArrayBuffer(HEADER_SIZE + payload.byteLength);
  const view = new DataView(frame);
  view.setUint32(0, chunkIndex, false);              // false = 大端序
  view.setUint32(4, payload.byteLength, false);
  view.setUint32(8, crc32(new Uint8Array(payload)), false);
  new Uint8Array(frame, HEADER_SIZE).set(new Uint8Array(payload)); // 内存块拷贝
  return frame;
}
```

关键点：
- `DataView` 用来做**定长字段**的读写——它不关心底层字节序（由 `setUint32` 第三个参数显式指定），比手写位移拼接更不容易出错。
- `new Uint8Array(frame, HEADER_SIZE)` 创建了一个"从第 12 字节开始"的视图（View），`.set()` 是一次内存块拷贝（类似 `memcpy`），远快于逐字节循环赋值。
- `payload` 来自 `File.slice(start, end).arrayBuffer()`——`File.slice` 是零拷贝的（只是生成一个指向原 Blob 区间的新 Blob 引用），真正的磁盘/内存读取发生在 `.arrayBuffer()` 被 await 的那一刻，这样可以按需读取而不是一次性把整个文件读入内存。

**解包（接收端）：**

```js
function unpackChunk(frame) {
  const view = new DataView(frame);
  const chunkIndex = view.getUint32(0, false);
  const length = view.getUint32(4, false);
  const crc = view.getUint32(8, false);
  const payload = frame.slice(HEADER_SIZE, HEADER_SIZE + length); // 拷贝出独立内存
  const valid = crc32(new Uint8Array(payload)) === crc;
  return { chunkIndex, payload, valid };
}
```

`ArrayBuffer.prototype.slice` 会**拷贝**出一份新的底层内存（不同于 `subarray`/`TypedArray` 视图共享内存），这里故意用 `slice` 而不是视图，是因为 `payload` 之后要被异步地写入磁盘（`FileSystemWritableFileStream.write`），如果和原始的大 `frame` 共享内存，一旦 `frame` 被后续复用/GC 时机不确定，会有数据竞争风险；`slice` 换来的是一份"可以放心持有"的独立缓冲区。

`dataChannel.binaryType = 'arraybuffer'` 必须显式设置——默认是 `'blob'`，收到的 `event.data` 会是 `Blob` 而不是 `ArrayBuffer`，`DataView` 无法直接作用于 `Blob`。

### 3. 位图（Bitmap）：分片状态的最小表示

1,000,000 个分片，只需要 1 bit 记录"是否收到/发送"，一个 `Uint8Array(ceil(N/8))` 就能装下（100 万分片仅占 122KB），可以整体塞进 IndexedDB 做断点续传记忆，也可以作为 UI 进度可视化的数据源（见 `TransferProgress.vue` 的分片网格，降采样后渲染）。

```js
setBit(bitmap, i)  // bitmap[i>>3] |= 1 << (i&7)
getBit(bitmap, i)  // (bitmap[i>>3] >> (i&7)) & 1
```

### 4. 接收端"随机写入"落盘，天然适配无序通道

`FileSystemWritableFileStream.write({ type:'write', position, data })` 支持指定写入偏移量。收到分片后直接按 `chunkIndex * chunkSize` 写到磁盘对应位置——哪怕网络到达顺序完全被打乱（因为用的是无序通道），落盘顺序也与到达顺序无关，**不需要在内存里做任何重排序缓冲**，内存占用恒定为一个分片大小，这是能稳定处理 GB 级文件而不 OOM 的关键。

---

## 三、Chunk Size 动态调整（避免 MTU 溢出）

`RTCDataChannel` 底层是 SCTP over DTLS over UDP。一条应用层 message 过大时，SCTP 会把它拆成多个 UDP 包发送（还受链路 MTU 限制，常见以太网 1500 字节，隧道/VPN 场景可能更小）；只要拆出的任意一个 UDP 包丢失，整条 message 都无法重组，必须整条重发——message 越大，一次丢包的代价越大。不同浏览器对单条 message 大小也有硬限制（可读 `pc.sctp.maxMessageSize`）。

`chunkSizer.js` 采用类 AIMD 策略：

- 初始值 16KB（经验上吞吐量/丢包率的较优平衡点）。
- 上限 `min(64KB, pc.sctp.maxMessageSize)`，下限 4KB。
- 每完成 200 个分片为一个评估窗口：丢包率（该窗口内被 NACK 的分片数 / 总分片数）< 1% 则分片大小 `×1.25`（快速探顶）；> 5% 则 `÷2`（快速回落）。

**实现取舍**：分片大小在**单个文件的传输过程中保持固定**（写入 `FILE_META` 并持久化到续传记录里），只在**不同文件之间**根据上一次传输的丢包表现动态调整。这是因为断点续传/随机写入依赖 `offset = chunkIndex × chunkSize` 这个简单算式，若中途改变分片大小会破坏这个映射关系，需要额外维护一张变长分片的偏移表。用"跨文件动态收敛"替代"文件内动态调整"，在工程复杂度和自适应能力之间取得了更合理的平衡。

---

## 四、ICE 连接状态变化与重连逻辑

`webrtcManager.js` 同时监听 `oniceconnectionstatechange` 与 `onconnectionstatechange`：

| 状态 | 含义 | 处理策略 |
|---|---|---|
| `checking` | 正在做连通性检查 | 无操作 |
| `connected` / `completed` | 已有可用链路 | 若此前处于重连中，清零重试计数，派发 `reconnected` 事件 |
| `disconnected` | 链路**暂时**中断（如 Wi-Fi 漫游切 AP、短暂拥塞） | 启动 3 秒宽限计时器，期间若自愈则忽略；到期仍未恢复才进入重连 |
| `failed` | 确认无法连通 | 立即进入重连，不等宽限期 |
| `closed` | 连接已关闭 | 不再重连 |

**重连流程（指数退避）：**

```js
async _attemptReconnect() {
  if (attempts >= 5) { dispatch('reconnect-failed'); return; }
  attempts++;
  const backoff = min(16000, 1000 * 2**(attempts-1)); // 1s,2s,4s,8s,16s
  setTimeout(async () => {
    pc.restartIce();                       // 触发重新收集 ICE 候选
    if (isInitiator) {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      sendSignal({ sdp: pc.localDescription }); // 经 Socket.io 转发给对端
    }
    // 被动方等待新 offer 从 onSignal 进来即可，走同一套协商代码路径
  }, backoff);
}
```

要点：
1. **同一个 `RTCPeerConnection`、同一个 SCTP association 上做 ICE 重启**：`restartIce()` 只重新做连通性检查、更换传输层链路，已创建的 `DataChannel` 对象通常可以在重连成功后继续使用，不需要销毁重建 —— 只要重连能在 SCTP association 超时前完成。
2. **重连成功后如何"接着传"而不是"重头传"**：这正是断点续传机制与断线重连机制共用同一套状态（分片位图）的原因——重连后发送端/接收端各自读取本地记忆的位图，发送端只补发接收端还没收到的分片，接收端只需继续原来的随机写入。位图既是"断点续传"的记忆，也是"断线重连"的恢复依据，二者是同一份状态的两个使用场景。
3. **信令服务器不参与重连判断**：Socket.io 连接和 WebRTC 的 ICE 连接是两条独立的链路。哪怕信令服务器短暂掉线，只要 P2P 通道本身还在（`connected`/`completed`），传输不受影响；只有真正需要重新协商 SDP（ICE 重启）时才会用到信令通道。

---

## 五、断点续传实现

- **续传身份标识**：`transferId = fileName:fileSize:lastModified`，不依赖内容哈希（避免续传前还要先算一遍哈希），足以标识"同一份文件的同一次传输任务"。
- **发送端**：本地记忆"已发送"位图；每次开始传输前，先询问接收端当前已有哪些分片（`RESUME_QUERY` → `RESUME_STATE`），只补发接收端缺的部分。
- **接收端**：本地记忆"已接收"位图 + （Chrome）`FileSystemFileHandle` 本身（可结构化克隆存入 IndexedDB），刷新页面/重启浏览器后可凭句柄 `requestPermission()` 重新获得写权限，续接着写同一个文件，不需要用户重新选择保存路径。
- **哈希校验**：发送端在顺序读取每个分片时同步喂给增量 SHA-256（`hash-wasm`），读完文件即得到整份文件哈希，无需二次读盘；接收端落盘完成后重新流式读取本地文件计算哈希，与发送端哈希比对，双向确认端到端一致性（而不仅仅是"分片计数对上了"）。

---

## 六、已知限制 / 后续可扩展方向

- 当前信令服务器为最简单的两人房间实现，多人/多文件并发传输队列已在前端预留（`transfers` 列表结构支持多任务），信令层的房间容量可按需扩展。
- Firefox/Safari 尚不支持 File System Access API，会自动降级为内存拼接下载，超大文件在这些浏览器上仍受可用内存限制。
- 纯内网环境通常不需要 TURN；如果网络存在跨网段 NAT，需要额外部署 TURN 服务器并加入 `WebRTCManager.ICE_SERVERS`。
