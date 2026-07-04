/**
 * 二进制分片协议
 * ------------------------------------------------------------------
 * 每个分片在 DataChannel 上以【定长二进制头 + 载荷】的形式发送，
 * 而不是单独发送一条“描述信息 + 数据”的两条消息 —— 这样可以：
 *   1) 保证头部与数据的原子性（不会出现头到了、数据没到的错位）；
 *   2) 避免 JSON 序列化数字/字符串带来的体积膨胀；
 *   3) 用 DataView 做定长字段读写，速度远快于 JSON.parse。
 *
 * 帧格式（Big-Endian，网络字节序）：
 *   ┌──────────┬──────────┬──────────┬────────────────┐
 *   │ 0-3 字节  │ 4-7 字节  │ 8-11 字节 │ 12..N 字节      │
 *   │chunkIndex│ payloadLen│  crc32   │   payload       │
 *   │ Uint32   │  Uint32   │  Uint32  │  ArrayBuffer    │
 *   └──────────┴──────────┴──────────┴────────────────┘
 *   HEADER_SIZE = 12 字节
 *
 * 为什么不用 SCTP/DTLS 自带的完整性校验就够了？
 *   DTLS 层确实会防止“比特翻转后仍被当作合法包”的情况，但它工作在
 *   传输层，应用层拿到 message 事件时无法知道“这个 ArrayBuffer 究竟
 *   对应哪个 chunkIndex、长度是否与发送时一致”。加一层轻量 CRC32
 *   可以在应用层快速甄别“数据虽然完整送达，但被错误拼接/越界切片”
 *   之类的业务逻辑错误，属于纵深防御，而非重复造轮子。
 */

export const HEADER_SIZE = 12;

// message type 前缀，用于 controlChannel 上的 JSON 文本消息
export const MSG = {
  FILE_META: 'file-meta',
  RESUME_QUERY: 'resume-query',
  RESUME_STATE: 'resume-state',
  CHUNK_NACK: 'chunk-nack',
  CHUNK_ACK_WINDOW: 'chunk-ack-window',
  TRANSFER_DONE: 'transfer-done',
  VERIFY_RESULT: 'verify-result',
  CANCEL: 'cancel'
};

// ---- CRC32（标准 IEEE 802.3 多项式）----
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(uint8arr) {
  let crc = 0xffffffff;
  for (let i = 0; i < uint8arr.length; i++) {
    crc = CRC_TABLE[(crc ^ uint8arr[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * 将一个分片打包成可直接 channel.send() 的 ArrayBuffer。
 * @param {number} chunkIndex  分片序号（从 0 开始）
 * @param {ArrayBuffer} payload 该分片的原始字节
 * @returns {ArrayBuffer} 打包后的完整帧
 */
export function packChunk(chunkIndex, payload) {
  const frame = new ArrayBuffer(HEADER_SIZE + payload.byteLength);
  const view = new DataView(frame);
  view.setUint32(0, chunkIndex, false);
  view.setUint32(4, payload.byteLength, false);
  view.setUint32(8, crc32(new Uint8Array(payload)), false);
  // 把 payload 拷贝到头部之后的区域。
  // 用 Uint8Array.set 做内存块拷贝，比逐字节赋值快几个数量级。
  new Uint8Array(frame, HEADER_SIZE).set(new Uint8Array(payload));
  return frame;
}

/**
 * 从收到的 ArrayBuffer 中解出 chunkIndex + payload，并校验 CRC32。
 * @param {ArrayBuffer} frame
 * @returns {{chunkIndex:number, payload:ArrayBuffer, valid:boolean}}
 */
export function unpackChunk(frame) {
  const view = new DataView(frame);
  const chunkIndex = view.getUint32(0, false);
  const length = view.getUint32(4, false);
  const crc = view.getUint32(8, false);
  // ArrayBuffer.slice 会拷贝一份新内存，避免多个分片共享同一块底层
  // buffer 导致的引用问题（尤其在写文件、重排序缓存时很重要）。
  const payload = frame.slice(HEADER_SIZE, HEADER_SIZE + length);
  const valid = crc32(new Uint8Array(payload)) === crc;
  return { chunkIndex, payload, valid };
}

/**
 * 位图（bitmap）工具：用一个 bit 表示一个分片是否已收到/已发送，
 * 1,000,000 个分片仅占 122KB 内存，可安全存进 IndexedDB 做断点续传记忆。
 */
export function createBitmap(totalBits) {
  return new Uint8Array(Math.ceil(totalBits / 8));
}

export function setBit(bitmap, index) {
  bitmap[index >> 3] |= 1 << (index & 7);
}

export function getBit(bitmap, index) {
  return (bitmap[index >> 3] >> (index & 7)) & 1;
}

export function countSetBits(bitmap, totalBits) {
  let count = 0;
  for (let i = 0; i < totalBits; i++) count += getBit(bitmap, i);
  return count;
}

/** 找出位图中所有为 0 的下标（即缺失的分片），用于生成 NACK 请求 */
export function findMissingIndices(bitmap, totalBits, limit = Infinity) {
  const missing = [];
  for (let i = 0; i < totalBits && missing.length < limit; i++) {
    if (!getBit(bitmap, i)) missing.push(i);
  }
  return missing;
}

/**
 * 把可能有几十万/上百万位的位图降采样成固定数量的桶，每个桶给出
 * "该区间内已完成的比例"(0~1)，用于 UI 上渲染分片进度网格，
 * 避免海量分片时渲染上百万个 DOM/Canvas 单元导致页面卡死。
 */
export function sampleBitmapRatios(bitmap, totalBits, buckets = 240) {
  const result = new Array(Math.min(buckets, totalBits) || 1).fill(0);
  const bucketCount = result.length;
  const perBucket = totalBits / bucketCount;
  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor(b * perBucket);
    const end = Math.floor((b + 1) * perBucket);
    let set = 0;
    const total = Math.max(1, end - start);
    for (let i = start; i < end; i++) set += getBit(bitmap, i);
    result[b] = set / total;
  }
  return result;
}
