/**
 * 动态分片大小（Chunk Size）控制
 * ------------------------------------------------------------------
 * 为什么不能固定用一个很大的分片（比如 1MB）？
 *   RTCDataChannel 底层跑在 SCTP over DTLS over UDP 之上。
 *   - 应用层发一条大 message，SCTP 会把它拆成多个 SCTP chunk 在
 *     若干个 UDP 包里发出去（UDP 包本身还受链路 MTU 限制，以太网
 *     常见 1500 字节，含 Wi-Fi/隧道场景可能更小）。
 *   - 只要这一条 message 拆成的任意一个底层 UDP 包丢失，整条
 *     message 都无法在接收端重组，必须整条重传/重发 —— message
 *     越大，一次丢包造成的"重传代价"越大。
 *   - 不同浏览器对 RTCDataChannel 单条 message 的大小也有实现上限
 *     （可通过 pc.sctp.maxMessageSize 读取，Chrome 通常 256KB，
 *     部分平台更小），超过会直接抛异常。
 *
 * 策略：
 *   1) 初始值取安全默认 16KB（远小于常见 MTU 对应的 SCTP 分片阈值，
 *      经验上是内网环境吞吐量与丢包率的较优平衡点）。
 *   2) 上限 = min(HARD_MAX, pc.sctp.maxMessageSize - HEADER_SIZE)。
 *   3) 每处理完一个"评估窗口"（WINDOW 个分片），根据这个窗口内的
 *      NACK（重传请求）比例做类 AIMD 调整：
 *        - 丢包率 < 1%  → 分片大小 *= 1.25（快速探顶，Additive/乘性增）
 *        - 丢包率 > 5%  → 分片大小 /= 2   （出现明显丢包，乘性减）
 *      并始终 clamp 在 [MIN, MAX] 之间。
 */

const MIN_CHUNK = 4 * 1024;      // 4KB 下限，避免头部开销占比过高
const HARD_MAX_CHUNK = 64 * 1024; // 64KB 上限，跨浏览器兼容性较好的经验值
const DEFAULT_CHUNK = 16 * 1024; // 16KB 初始值
const WINDOW = 200;              // 每 200 个分片评估一次

export class ChunkSizer {
  constructor(maxMessageSize) {
    this.max = maxMessageSize
      ? Math.min(HARD_MAX_CHUNK, maxMessageSize)
      : HARD_MAX_CHUNK;
    this.size = Math.min(DEFAULT_CHUNK, this.max);
    this._windowTotal = 0;
    this._windowLoss = 0;
  }

  current() {
    return this.size;
  }

  /** 每发出一个分片调用一次 */
  recordSent() {
    this._windowTotal++;
    if (this._windowTotal >= WINDOW) this._evaluate();
  }

  /** 每收到一次 NACK（重传请求）里包含的分片数调用一次 */
  recordLoss(count = 1) {
    this._windowLoss += count;
  }

  _evaluate() {
    const lossRate = this._windowTotal ? this._windowLoss / this._windowTotal : 0;
    if (lossRate < 0.01) {
      this.size = Math.min(this.max, Math.round(this.size * 1.25));
    } else if (lossRate > 0.05) {
      this.size = Math.max(MIN_CHUNK, Math.round(this.size / 2));
    }
    this._windowTotal = 0;
    this._windowLoss = 0;
  }
}

export { MIN_CHUNK, HARD_MAX_CHUNK, DEFAULT_CHUNK };
