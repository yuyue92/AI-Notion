import { packChunk, unpackChunk, MSG, createBitmap, setBit, getBit, countSetBits, findMissingIndices } from './protocol.js';
import { createIncrementalHasher, hashFileStream } from './hashUtil.js';
import { buildTransferId, loadTransferState, createThrottledSaver, deleteTransferState } from './storage.js';
import { StreamingFileWriter, InMemoryAssembler, isFileSystemAccessSupported } from './fileWriter.js';

const NACK_SCAN_INTERVAL = 600; // ms，接收端定期扫描丢包窗口的间隔

// ------------------------------------------------------------------
// 发送端
// ------------------------------------------------------------------
export class FileSender extends EventTarget {
  /**
   * @param {File} file
   * @param {RTCDataChannel} controlChannel
   * @param {RTCDataChannel} dataChannel
   * @param {import('./webrtcManager').WebRTCManager} rtcManager
   * @param {import('./chunkSizer').ChunkSizer} sizer
   */
  constructor(file, controlChannel, dataChannel, rtcManager, sizer) {
    super();
    this.file = file;
    this.control = controlChannel;
    this.data = dataChannel;
    this.rtc = rtcManager;
    this.sizer = sizer;

    this.transferId = buildTransferId(file);
    this.chunkSize = sizer.current();
    this.totalChunks = Math.ceil(file.size / this.chunkSize);
    this.sentBitmap = createBitmap(this.totalChunks);
    this._retransmitQueue = [];
    this._aborted = false;
    this._saveState = createThrottledSaver();

    this.control.addEventListener('message', (e) => this._onControlMessage(e));
  }

  async start() {
    this.control.send(JSON.stringify({
      type: MSG.FILE_META,
      transferId: this.transferId,
      fileName: this.file.name,
      fileSize: this.file.size,
      chunkSize: this.chunkSize,
      totalChunks: this.totalChunks
    }));

    // 等待接收端回报"它已经有哪些分片"（首次传输为全 0 位图，
    // 断点续传/重连场景下会带有部分 1）
    const receiverBitmap = await this._waitForResumeState();

    const hasher = await createIncrementalHasher();

    for (let i = 0; i < this.totalChunks && !this._aborted; i++) {
      const start = i * this.chunkSize;
      const end = Math.min(start + this.chunkSize, this.file.size);
      // File.slice 是零拷贝的（只是创建一个引用了原 Blob 区间的新 Blob），
      // 真正的字节读取发生在 arrayBuffer() 调用时。
      const buf = await this.file.slice(start, end).arrayBuffer();

      // 无论该分片是否需要重发，都要参与哈希计算 —— 哈希对应的是
      // "文件内容"本身，与网络是否重传无关。
      hasher.update(buf);

      const alreadyHeldByReceiver = getBit(receiverBitmap, i) === 1;
      if (!alreadyHeldByReceiver) {
        await this._sendOne(i, buf);
      } else {
        setBit(this.sentBitmap, i);
      }

      // 每发一批检查一次是否有 NACK 要求优先重传
      await this._drainRetransmitQueue();
      this._emitProgress();
    }

    // 首轮发送完毕，进入"修复期"：持续处理迟到的 NACK，
    // 直到接收端确认完整性或超时。
    const finalHash = hasher.digestHex();
    await this._repairLoop(finalHash);
  }

  async _sendOne(index, buf) {
    await this.rtc.waitForBufferLow(this.data); // 背压控制，防止内存无限增长
    const frame = packChunk(index, buf);
    this.data.send(frame);
    this.sizer.recordSent();
    setBit(this.sentBitmap, index);
    this._saveState({
      transferId: this.transferId,
      role: 'sender',
      fileName: this.file.name,
      fileSize: this.file.size,
      chunkSize: this.chunkSize,
      totalChunks: this.totalChunks,
      bitmap: this.sentBitmap.buffer.slice(0)
    });
  }

  async _drainRetransmitQueue() {
    while (this._retransmitQueue.length) {
      const index = this._retransmitQueue.shift();
      const start = index * this.chunkSize;
      const end = Math.min(start + this.chunkSize, this.file.size);
      const buf = await this.file.slice(start, end).arrayBuffer();
      await this._sendOne(index, buf);
    }
  }

  async _repairLoop(finalHash) {
    this.control.send(JSON.stringify({ type: MSG.TRANSFER_DONE, transferId: this.transferId, hash: finalHash }));

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(), 60_000); // 修复期最长等待 60s
      const onMsg = async (e) => {
        const msg = JSON.parse(e.data);
        if (msg.transferId !== this.transferId) return;
        if (msg.type === MSG.CHUNK_NACK) {
          this.sizer.recordLoss(msg.missingIndices.length);
          for (const idx of msg.missingIndices) this._retransmitQueue.push(idx);
          await this._drainRetransmitQueue();
        } else if (msg.type === MSG.VERIFY_RESULT) {
          clearTimeout(timeout);
          this.control.removeEventListener('message', onMsg);
          this.dispatchEvent(new CustomEvent('done', { detail: msg }));
          resolve();
        }
      };
      this.control.addEventListener('message', onMsg);
    });
  }

  _waitForResumeState() {
    return new Promise((resolve) => {
      const onMsg = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === MSG.RESUME_STATE && msg.transferId === this.transferId) {
          this.control.removeEventListener('message', onMsg);
          const bytes = Uint8Array.from(atob(msg.bitmapBase64), (c) => c.charCodeAt(0));
          resolve(bytes);
        }
      };
      this.control.addEventListener('message', onMsg);
    });
  }

  _onControlMessage(e) {
    // 非首轮等待期间到达的 NACK 也要接收（例如发送尚未结束时对方就发现了缺口）
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === MSG.CHUNK_NACK && msg.transferId === this.transferId) {
        this.sizer.recordLoss(msg.missingIndices.length);
        this._retransmitQueue.push(...msg.missingIndices);
      }
    } catch { /* 非 JSON 消息，忽略（正常情况下不会出现）*/ }
  }

  _emitProgress() {
    const sent = countSetBits(this.sentBitmap, this.totalChunks);
    this.dispatchEvent(new CustomEvent('progress', {
      detail: { sent, total: this.totalChunks, ratio: sent / this.totalChunks }
    }));
  }

  abort() {
    this._aborted = true;
    this.control.send(JSON.stringify({ type: MSG.CANCEL, transferId: this.transferId }));
  }
}

// ------------------------------------------------------------------
// 接收端
// ------------------------------------------------------------------
export class FileReceiver extends EventTarget {
  constructor(controlChannel, dataChannel) {
    super();
    this.control = controlChannel;
    this.data = dataChannel;
    this.meta = null;
    this.bitmap = null;
    this.writer = null;
    this._scanTimer = null;

    this.data.addEventListener('message', (e) => this._onData(e));
    this.control.addEventListener('message', (e) => this._onControl(e));
  }

  async _onControl(e) {
    const msg = JSON.parse(e.data);
    if (msg.type === MSG.FILE_META) {
      await this._handleFileMeta(msg);
    } else if (msg.type === MSG.TRANSFER_DONE) {
      await this._handleTransferDone(msg);
    } else if (msg.type === MSG.CANCEL) {
      this._teardownScan();
      this.dispatchEvent(new Event('cancelled'));
    }
  }

  async _handleFileMeta(msg) {
    this.meta = msg;

    // 断点续传：先看本地是否已有该 transferId 的记录
    const existing = await loadTransferState(msg.transferId);
    if (existing && existing.role === 'receiver' && existing.fileSize === msg.fileSize) {
      this.bitmap = new Uint8Array(existing.bitmap);
      if (existing.fileHandle && isFileSystemAccessSupported()) {
        this.writer = await StreamingFileWriter.resume(existing.fileHandle);
      }
    } else {
      this.bitmap = createBitmap(msg.totalChunks);
    }

    if (!this.writer) {
      if (isFileSystemAccessSupported()) {
        this.writer = await StreamingFileWriter.create(msg.fileName, msg.fileSize);
      } else {
        this.writer = new InMemoryAssembler(msg.totalChunks);
        this.dispatchEvent(new CustomEvent('warning', {
          detail: '当前浏览器不支持流式落盘（File System Access API），超大文件将占用较多内存，建议使用 Chrome/Edge。'
        }));
      }
    }

    this._saveState = createThrottledSaver();
    this._replyResumeState();
    this._startScanLoop();
    this.dispatchEvent(new CustomEvent('meta', { detail: msg }));
  }

  _replyResumeState() {
    const bitmapBase64 = btoa(String.fromCharCode(...this.bitmap));
    this.control.send(JSON.stringify({
      type: MSG.RESUME_STATE,
      transferId: this.meta.transferId,
      bitmapBase64
    }));
  }

  _onData(e) {
    if (!this.meta) return; // 元信息还没到就先丢弃（理论上不会发生，控制通道先于数据通道处理）
    const { chunkIndex, payload, valid } = unpackChunk(e.data);
    if (!valid || chunkIndex >= this.meta.totalChunks) {
      // CRC 校验失败或下标越界：视为"未收到"，等待下一轮 NACK 扫描自动补requst
      return;
    }
    this.writer.writeChunk(chunkIndex, this.meta.chunkSize, payload);
    setBit(this.bitmap, chunkIndex);

    this._saveState({
      transferId: this.meta.transferId,
      role: 'receiver',
      fileName: this.meta.fileName,
      fileSize: this.meta.fileSize,
      chunkSize: this.meta.chunkSize,
      totalChunks: this.meta.totalChunks,
      bitmap: this.bitmap.buffer.slice(0),
      fileHandle: this.writer.getFileHandle ? this.writer.getFileHandle() : undefined
    });

    const received = countSetBits(this.bitmap, this.meta.totalChunks);
    this.dispatchEvent(new CustomEvent('progress', {
      detail: { received, total: this.meta.totalChunks, ratio: received / this.meta.totalChunks }
    }));
  }

  /**
   * 差错检测核心：定期扫描位图找缺口，主动向发送端要求重传。
   * 不是等发送端"发现"丢包（发送端并不知道网络丢了包 —— 不可靠通道
   * 底层丢包对发送方完全透明），而是接收方基于"我期望收到 N 个分片，
   * 但位图里有 0"的事实反向驱动重传，这就是应用层 ARQ 的核心。
   */
  _startScanLoop() {
    this._scanTimer = setInterval(() => {
      if (!this.meta) return;
      const missing = findMissingIndices(this.bitmap, this.meta.totalChunks, 500);
      if (missing.length > 0) {
        this.control.send(JSON.stringify({
          type: MSG.CHUNK_NACK,
          transferId: this.meta.transferId,
          missingIndices: missing
        }));
      }
    }, NACK_SCAN_INTERVAL);
  }

  _teardownScan() {
    clearInterval(this._scanTimer);
    this._scanTimer = null;
  }

  async _handleTransferDone(msg) {
    // 收尾前做最后一次同步扫描确保没有遗漏，缺了就再要一次并等待
    await this._ensureComplete();
    this._teardownScan();

    let resultFile;
    if (this.writer instanceof StreamingFileWriter) {
      await this.writer.close();
      resultFile = await this.writer.getFileHandle().getFile();
    } else {
      resultFile = await this.writer.close();
    }

    this.dispatchEvent(new CustomEvent('verifying'));
    const actualHash = await hashFileStream(resultFile, (bytes) => {
      this.dispatchEvent(new CustomEvent('verify-progress', { detail: bytes }));
    });
    const success = actualHash === msg.hash;

    this.control.send(JSON.stringify({
      type: MSG.VERIFY_RESULT,
      transferId: this.meta.transferId,
      success,
      hash: actualHash
    }));

    if (success) {
      await deleteTransferState(this.meta.transferId); // 成功后清理续传记录
    }

    this.dispatchEvent(new CustomEvent('done', {
      detail: { success, expectedHash: msg.hash, actualHash, file: resultFile }
    }));
  }

  _ensureComplete() {
    return new Promise((resolve) => {
      const check = () => {
        const missing = findMissingIndices(this.bitmap, this.meta.totalChunks, 1);
        if (missing.length === 0) {
          resolve();
        } else {
          this.control.send(JSON.stringify({
            type: MSG.CHUNK_NACK,
            transferId: this.meta.transferId,
            missingIndices: findMissingIndices(this.bitmap, this.meta.totalChunks, 500)
          }));
          setTimeout(check, 300);
        }
      };
      check();
    });
  }
}
