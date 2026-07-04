/**
 * 接收端落盘策略
 * ------------------------------------------------------------------
 * GB 级文件绝不能全部缓存在 JS 内存里再一次性生成 Blob —— 那样
 * 峰值内存占用等于文件大小，很容易让标签页因 OOM 被杀。
 *
 * 优先方案：File System Access API
 *   const handle = await window.showSaveFilePicker(...)
 *   const writable = await handle.createWritable({ keepExistingData: true })
 *   await writable.write({ type: 'write', position, data })
 *
 *   关键点在于 write() 支持指定 position 做"随机写入"。这意味着：
 *   即使我们用的是【无序（unordered）DataChannel】、分片到达顺序完全
 *   打乱，也完全不需要在内存里做重排序缓冲 —— 每个分片到达后直接按
 *   `chunkIndex * chunkSize` 的偏移量写入磁盘对应位置，落盘顺序与
 *   网络到达顺序无关，内存占用恒定（只等于一个分片的大小）。
 *
 * 降级方案：不支持 File System Access API 时（如 Firefox / Safari），
 *   退化为把分片存进一个 Map<index, ArrayBuffer>，全部到齐后再用
 *   new Blob([...]) 拼接一次性下载。此方案仍受限于浏览器可用内存，
 *   UI 上会提示"当前浏览器不支持流式落盘，超大文件建议使用 Chrome/Edge"。
 */

export function isFileSystemAccessSupported() {
  return typeof window.showSaveFilePicker === 'function';
}

export class StreamingFileWriter {
  constructor(fileHandle, chunkSize) {
    this.fileHandle = fileHandle;
    this.chunkSize = chunkSize;
    this.writable = null;
    this._queue = Promise.resolve(); // 串行化写操作，避免并发写入同一文件句柄报错
  }

  static async create(suggestedName, totalSize) {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [{ description: '所有文件', accept: { '*/*': [] } }]
    });
    const writer = new StreamingFileWriter(handle, null);
    writer.writable = await handle.createWritable({ keepExistingData: true });
    return writer;
  }

  /** 从已持久化的 handle 恢复（断点续传场景，跳过重新选择保存路径）*/
  static async resume(fileHandle) {
    const perm = await fileHandle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') throw new Error('未获得文件写入权限，需重新选择保存位置');
    const writer = new StreamingFileWriter(fileHandle, null);
    writer.writable = await fileHandle.createWritable({ keepExistingData: true });
    return writer;
  }

  writeChunk(chunkIndex, chunkSize, payload) {
    const position = chunkIndex * chunkSize;
    this._queue = this._queue.then(() =>
      this.writable.write({ type: 'write', position, data: payload })
    );
    return this._queue;
  }

  async close() {
    await this._queue;
    await this.writable.close();
  }

  getFileHandle() {
    return this.fileHandle;
  }
}

/** 内存拼接降级方案 */
export class InMemoryAssembler {
  constructor(totalChunks) {
    this.parts = new Array(totalChunks);
  }
  writeChunk(chunkIndex, chunkSize, payload) {
    this.parts[chunkIndex] = payload;
  }
  async close(mimeType = 'application/octet-stream') {
    return new Blob(this.parts, { type: mimeType });
  }
}
