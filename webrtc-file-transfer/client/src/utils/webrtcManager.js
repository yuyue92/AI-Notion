/**
 * WebRTC 连接管理器
 * ------------------------------------------------------------------
 * 关键设计：一个 PeerConnection 上开两条 DataChannel
 *
 *   controlChannel（可靠 / 有序，浏览器默认配置）
 *     用于：文件元信息、断点续传位图查询、NACK（缺失分片请求）、
 *          完成通知、哈希校验结果。这些消息小而关键，必须"保真送达
 *          且顺序正确"，交给 SCTP 默认的可靠模式最省心。
 *
 *   dataChannel（不可靠 / 无序：{ordered:false, maxRetransmits:0}）
 *     用于：文件分片的二进制数据本体。
 *     刻意选择"不可靠"是本方案的核心思路 —— 如果用默认可靠通道，
 *     SCTP 会在传输层自动重传丢失的分片，但重传期间会阻塞它后面
 *     所有已经到达的分片交付给应用层（Head-of-Line Blocking），
 *     对于大文件顺序传输这是很大的吞吐量损失。
 *     改为不可靠通道后，丢了就丢了，底层不做任何重传/阻塞，
 *     由应用层（chunkManager.js）在 controlChannel 上用 NACK 精确
 *     点名"哪些 chunkIndex 没收到"，只重传这些分片 ——
 *     即"选择性重传（Selective Repeat ARQ）"，这就是题目里
 *     "差错隐藏机制 + 类 SCTP 重传请求"的落地方式：重传的语义由应用层
 *     实现，但仍然运行在 SCTP/DTLS 提供的加密与拥塞控制之上。
 *
 * ICE 重连策略见 _bindConnectionStateHandlers()。
 */
export class WebRTCManager extends EventTarget {
  /**
   * @param {import('socket.io-client').Socket} socket
   * @param {string} roomId
   */
  constructor(socket, roomId) {
    super();
    this.socket = socket;
    this.roomId = roomId;
    this.pc = null;
    this.controlChannel = null;
    this.dataChannel = null;
    this.isInitiator = false;
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 5;
    this._reconnectTimer = null;
    this._disconnectGraceTimer = null;

    this._onSignal = this._onSignal.bind(this);
    this.socket.on('signal', this._onSignal);
  }

  /** 内网环境通常不需要 STUN/TURN（双方都是 host 候选即可直连）。
   *  保留一个公共 STUN 仅用于"跨网段/有 NAT"的兜底场景，纯内网可留空数组。 */
  static ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

  async start(isInitiator) {
    this.isInitiator = isInitiator;
    this.pc = new RTCPeerConnection({ iceServers: WebRTCManager.ICE_SERVERS });
    this._bindConnectionStateHandlers();

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this._sendSignal({ candidate: e.candidate });
      }
    };

    if (isInitiator) {
      // 发起方创建两条 channel；被动方通过 ondatachannel 接收
      this.controlChannel = this.pc.createDataChannel('control', { ordered: true });
      this.dataChannel = this.pc.createDataChannel('data', {
        ordered: false,
        maxRetransmits: 0
      });
      this._bindChannels();

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this._sendSignal({ sdp: this.pc.localDescription });
    } else {
      this.pc.ondatachannel = (e) => {
        if (e.channel.label === 'control') this.controlChannel = e.channel;
        if (e.channel.label === 'data') this.dataChannel = e.channel;
        if (this.controlChannel && this.dataChannel) this._bindChannels();
      };
    }
  }

  _sendSignal(data) {
    this.socket.emit('signal', { roomId: this.roomId, data });
  }

  async _onSignal(data) {
    if (data.sdp) {
      await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      if (data.sdp.type === 'offer') {
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this._sendSignal({ sdp: this.pc.localDescription });
      }
      // ICE 重启后收到的 answer 会让 pc 自动恢复连通性，无需额外操作
    } else if (data.candidate) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        // 正常协商时序下偶尔会收到"迟到"的 candidate，忽略即可
        console.warn('addIceCandidate failed (可忽略，通常是时序问题):', err);
      }
    }
  }

  _bindChannels() {
    this.dataChannel.binaryType = 'arraybuffer';
    // 背压阈值：发送缓冲区低于该值时触发 bufferedamountlow 事件，
    // chunkManager 用它做流控节流，防止无限往发送队列里塞数据
    // 造成内存暴涨（GB 级文件如果不做流控，很快就会占满内存）。
    this.dataChannel.bufferedAmountLowThreshold = 1 * 1024 * 1024; // 1MB

    this.dispatchEvent(new CustomEvent('channels-ready', {
      detail: { controlChannel: this.controlChannel, dataChannel: this.dataChannel }
    }));
  }

  /**
   * ICE / 连接状态监控与重连逻辑
   * ------------------------------------------------------------------
   * iceConnectionState 的几种关键取值：
   *   checking    -> 正在做连通性检查
   *   connected   -> 至少有一条可用链路
   *   completed   -> 所有候选对检查完毕，选定最优链路
   *   disconnected -> 链路暂时中断（可能是短暂的网络抖动，比如 Wi-Fi
   *                   漫游切换 AP），此时【不要】立刻判死刑，
   *                   很多情况下几百毫秒到几秒内会自愈。
   *   failed      -> 确认无法连通，必须主动介入（ICE 重启）。
   *   closed      -> 连接已被关闭。
   *
   * 处理策略：
   *   disconnected -> 启动一个宽限计时器（3s）。如果计时器触发前状态
   *                   变回 connected/completed，取消计时器，什么都不做
   *                   （只是抖动）。如果计时器触发时仍处于 disconnected/
   *                   failed，则进入重连流程。
   *   failed       -> 立即进入重连流程（不再等待宽限期）。
   *
   *   重连流程：
   *     1) 调用 pc.restartIce()（或旧浏览器用
   *        createOffer({iceRestart:true})）触发重新收集 ICE 候选、
   *        重新协商。因为 DataChannel 依附在同一个 PeerConnection /
   *        同一个 SCTP association 上，只要重连在 SCTP association
   *        超时前完成，已创建的 channel 对象通常可以复用，无需重建。
   *     2) 通过信令服务器把新的 Offer 发给对端，对端 setRemoteDescription
   *        + createAnswer 后经 onSignal 走同一条协商路径。
   *     3) 用指数退避（1s, 2s, 4s, 8s, 16s）安排最多 5 次重试；
   *        超过上限则触发 'reconnect-failed' 事件，交给 UI 提示用户
   *        手动重新建立房间连接。
   *     4) 重连成功（状态回到 connected）后触发 'reconnected' 事件 —
   *        由上层（chunkManager）监听该事件，从本地记忆的分片位图中
   *        找出"最后已确认发送/接收"的位置继续传输，而不是从头开始。
   *        这正是断点续传机制与断线重连机制共用同一套状态的原因。
   */
  _bindConnectionStateHandlers() {
    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc.iceConnectionState;
      this.dispatchEvent(new CustomEvent('ice-state', { detail: state }));

      if (state === 'disconnected') {
        clearTimeout(this._disconnectGraceTimer);
        this._disconnectGraceTimer = setTimeout(() => {
          if (['disconnected', 'failed'].includes(this.pc.iceConnectionState)) {
            this._attemptReconnect();
          }
        }, 3000);
      } else if (state === 'failed') {
        clearTimeout(this._disconnectGraceTimer);
        this._attemptReconnect();
      } else if (state === 'connected' || state === 'completed') {
        clearTimeout(this._disconnectGraceTimer);
        if (this._reconnectAttempts > 0) {
          this._reconnectAttempts = 0;
          this.dispatchEvent(new Event('reconnected'));
        }
      }
    };

    this.pc.onconnectionstatechange = () => {
      // connectionState 综合了 ICE + DTLS 证书校验，某些浏览器上
      // 比 iceConnectionState 更早/更准确地反映"彻底断开"
      if (this.pc.connectionState === 'failed') {
        this._attemptReconnect();
      }
    };
  }

  async _attemptReconnect() {
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      this.dispatchEvent(new Event('reconnect-failed'));
      return;
    }
    this._reconnectAttempts++;
    const backoff = Math.min(16000, 1000 * 2 ** (this._reconnectAttempts - 1));
    this.dispatchEvent(new CustomEvent('reconnecting', {
      detail: { attempt: this._reconnectAttempts, backoff }
    }));

    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(async () => {
      try {
        if (typeof this.pc.restartIce === 'function') {
          this.pc.restartIce();
        }
        if (this.isInitiator) {
          const offer = await this.pc.createOffer({ iceRestart: true });
          await this.pc.setLocalDescription(offer);
          this._sendSignal({ sdp: this.pc.localDescription });
        }
        // 被动方什么都不用做，等待新的 offer 从 _onSignal 进来即可
      } catch (err) {
        console.error('ICE 重启失败:', err);
        this._attemptReconnect();
      }
    }, backoff);
  }

  /** 等待发送缓冲区降到阈值以下，用于分片发送时的流控 */
  waitForBufferLow(channel) {
    if (channel.bufferedAmount <= channel.bufferedAmountLowThreshold) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const handler = () => {
        channel.removeEventListener('bufferedamountlow', handler);
        resolve();
      };
      channel.addEventListener('bufferedamountlow', handler);
    });
  }

  close() {
    clearTimeout(this._reconnectTimer);
    clearTimeout(this._disconnectGraceTimer);
    this.controlChannel?.close();
    this.dataChannel?.close();
    this.pc?.close();
    this.socket.off('signal', this._onSignal);
  }
}
