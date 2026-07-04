/**
 * 文件完整性校验
 * ------------------------------------------------------------------
 * GB 级文件不能用 crypto.subtle.digest(wholeFileArrayBuffer) 一次性算 —
 * 那需要先把整个文件读进内存，本身就违背“大文件”场景的初衷。
 *
 * 这里使用 hash-wasm 的增量（incremental）SHA-256 接口：
 *   const hasher = await createSHA256();
 *   hasher.init();
 *   hasher.update(chunkBytes);   // 可以调用 N 次，每次喂一个分片
 *   const hex = hasher.digest('hex');
 *
 * 发送端：文件按顺序读取分片时，同步把每个分片喂给 hasher，
 *         读完最后一个分片即可拿到整份文件的 SHA-256，无需额外二次读盘。
 * 接收端：写盘同样是按 chunkIndex 顺序落盘（哪怕网络到达顺序是乱的，
 *         写盘顺序也是保证的，见 fileWriter.js），落盘完成后可选择
 *         重新以流的方式读一遍本地文件来计算 hash 做“端到端”校验
 *         （防止 File System Access API 写入过程中出现的任何异常）。
 */
import { createSHA256 } from 'hash-wasm';

export async function createIncrementalHasher() {
  const hasher = await createSHA256();
  hasher.init();
  return {
    update(bufferOrView) {
      const u8 = bufferOrView instanceof Uint8Array
        ? bufferOrView
        : new Uint8Array(bufferOrView);
      hasher.update(u8);
    },
    digestHex() {
      return hasher.digest('hex');
    }
  };
}

/**
 * 对一个 File/Blob 做流式 SHA-256（用于接收端落盘后的复核校验）。
 * 使用 Blob.stream() 分块读取，内存占用恒定，不受文件大小影响。
 */
export async function hashFileStream(file, onProgress) {
  const hasher = await createIncrementalHasher();
  const reader = file.stream().getReader();
  let readBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    hasher.update(value);
    readBytes += value.byteLength;
    if (onProgress) onProgress(readBytes);
  }
  return hasher.digestHex();
}
