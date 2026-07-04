/**
 * 断点续传状态持久化（IndexedDB）
 * ------------------------------------------------------------------
 * 记忆的对象是"分片位图(bitmap)"，而不是整份文件。
 * Key 设计：transferId = `${fileName}:${fileSize}:${lastModified}`
 *   —— 只要这三者相同，就认为是"同一份文件的同一次传输任务"，
 *      哪怕浏览器刷新、进程重启、Wi-Fi 断开重连，都能对上号。
 *
 * Chrome 122+ 支持把 FileSystemFileHandle 直接结构化克隆存入
 * IndexedDB，因此接收端可以把"正在写入的目标文件句柄"也存起来，
 * 下次恢复时用 handle.requestPermission() 重新拿到写权限，
 * 无需用户重新选择保存路径。
 */
const DB_NAME = 'p2p-file-transfer';
const DB_VERSION = 1;
const STORE = 'transfer-state';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'transferId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function buildTransferId(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export async function saveTransferState(state) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(state);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadTransferState(transferId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(transferId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteTransferState(transferId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(transferId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 节流保存：分片级别的写入很频繁，不需要每收到一个分片就写一次
 * IndexedDB（会造成大量磁盘 I/O）。这里做简单的时间节流。
 */
export function createThrottledSaver(intervalMs = 800) {
  let timer = null;
  let pending = null;
  return function schedule(state) {
    pending = state;
    if (timer) return;
    timer = setTimeout(async () => {
      timer = null;
      if (pending) await saveTransferState(pending);
    }, intervalMs);
  };
}
