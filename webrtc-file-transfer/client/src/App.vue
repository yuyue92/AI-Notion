<script setup>
import { ref, reactive, onBeforeUnmount } from 'vue';
import { io } from 'socket.io-client';
import ConnectionPanel from './components/ConnectionPanel.vue';
import DropZone from './components/DropZone.vue';
import TransferProgress from './components/TransferProgress.vue';
import { WebRTCManager } from './utils/webrtcManager.js';
import { FileSender, FileReceiver } from './utils/chunkManager.js';
import { ChunkSizer } from './utils/chunkSizer.js';
import { sampleBitmapRatios } from './utils/protocol.js';

const status = ref('idle');
const role = ref('');
const iceState = ref('');
const reconnectInfo = ref(null);
const channelsReady = ref(false);
const transfers = reactive([]); // { id, name, size, direction, status, ratio, buckets, ... }

let socket = null;
let rtc = null;
let controlChannel = null;
let dataChannel = null;
const sizer = new ChunkSizer(); // 跨多个文件持续演化的动态分片大小控制器
let receiver = null;

function findOrCreateTransfer(id, patch) {
  let t = transfers.find((x) => x.id === id);
  if (!t) {
    t = reactive({
      id, name: '', size: 0, direction: 'send', status: 'transferring',
      ratio: 0, buckets: [], speedBps: 0, chunkSize: 0, totalChunks: 0,
      retransmits: 0, _lastBytes: 0, _lastTs: performance.now()
    });
    transfers.unshift(t);
  }
  Object.assign(t, patch);
  return t;
}

function updateSpeed(t, receivedOrSentChunks, chunkSize) {
  const now = performance.now();
  const bytes = receivedOrSentChunks * chunkSize;
  const dt = (now - t._lastTs) / 1000;
  if (dt > 0.4) {
    t.speedBps = Math.max(0, (bytes - t._lastBytes) / dt);
    t._lastBytes = bytes;
    t._lastTs = now;
  }
}

async function connect({ serverUrl, roomId }) {
  status.value = 'joining';
  socket = io(serverUrl, { transports: ['websocket'] });

  socket.on('connect_error', () => { status.value = 'failed'; });
  socket.on('room-error', (msg) => { alert(msg); status.value = 'idle'; });

  socket.on('joined', async ({ role: r }) => {
    role.value = r;
    status.value = 'waiting';
  });

  socket.on('peer-ready', async () => {
    rtc = new WebRTCManager(socket, roomId);
    bindRtcEvents();
    await rtc.start(role.value === 'host'); // host 作为发起方创建 offer
  });

  socket.emit('join-room', roomId);
}

function bindRtcEvents() {
  rtc.addEventListener('channels-ready', (e) => {
    controlChannel = e.detail.controlChannel;
    dataChannel = e.detail.dataChannel;

    const waitOpen = (ch) => new Promise((resolve) => {
      if (ch.readyState === 'open') resolve();
      else ch.addEventListener('open', resolve, { once: true });
    });
    Promise.all([waitOpen(controlChannel), waitOpen(dataChannel)]).then(() => {
      channelsReady.value = true;
      status.value = 'connected';
      receiver = new FileReceiver(controlChannel, dataChannel);
      bindReceiverEvents(receiver);
    });
  });

  rtc.addEventListener('ice-state', (e) => { iceState.value = e.detail; });
  rtc.addEventListener('reconnecting', (e) => {
    status.value = 'reconnecting';
    reconnectInfo.value = e.detail;
  });
  rtc.addEventListener('reconnected', () => {
    status.value = 'connected';
    reconnectInfo.value = null;
  });
  rtc.addEventListener('reconnect-failed', () => {
    status.value = 'failed';
  });
}

function bindReceiverEvents(recv) {
  let currentId = null;
  recv.addEventListener('meta', (e) => {
    currentId = e.detail.transferId;
    findOrCreateTransfer(currentId, {
      name: e.detail.fileName, size: e.detail.fileSize, direction: 'recv',
      status: 'transferring', chunkSize: e.detail.chunkSize, totalChunks: e.detail.totalChunks
    });
  });
  recv.addEventListener('progress', (e) => {
    const t = findOrCreateTransfer(currentId, {
      ratio: e.detail.ratio,
      buckets: sampleBitmapRatios(recv.bitmap, recv.meta.totalChunks)
    });
    updateSpeed(t, e.detail.received, recv.meta.chunkSize);
  });
  recv.addEventListener('verifying', () => findOrCreateTransfer(currentId, { status: 'verifying' }));
  recv.addEventListener('done', (e) => {
    findOrCreateTransfer(currentId, {
      status: e.detail.success ? 'done' : 'failed', ratio: 1
    });
  });
  recv.addEventListener('warning', (e) => console.warn(e.detail));
}

async function onFileSelected(file) {
  if (!channelsReady.value) return;
  const sender = new FileSender(file, controlChannel, dataChannel, rtc, sizer);
  const id = sender.transferId;
  findOrCreateTransfer(id, {
    name: file.name, size: file.size, direction: 'send',
    status: 'transferring', chunkSize: sender.chunkSize, totalChunks: sender.totalChunks
  });

  sender.addEventListener('progress', (e) => {
    const t = findOrCreateTransfer(id, {
      ratio: e.detail.ratio,
      buckets: sampleBitmapRatios(sender.sentBitmap, sender.totalChunks),
      retransmits: sender._retransmitQueue.length
    });
    updateSpeed(t, e.detail.sent, sender.chunkSize);
  });
  sender.addEventListener('done', (e) => {
    findOrCreateTransfer(id, { status: e.detail.success ? 'done' : 'failed', ratio: 1 });
  });

  try {
    await sender.start();
  } catch (err) {
    console.error(err);
    findOrCreateTransfer(id, { status: 'failed' });
  }
}

function disconnect() {
  rtc?.close();
  socket?.emit('leave-room');
  socket?.disconnect();
  channelsReady.value = false;
  status.value = 'idle';
  role.value = '';
}

onBeforeUnmount(disconnect);
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">◇</span>
        <span class="brand-name">LAN-FERRY</span>
        <span class="brand-tag">P2P CHUNKED TRANSFER · WebRTC / SCTP</span>
      </div>
    </header>

    <main class="layout">
      <aside class="col-left">
        <ConnectionPanel
          :status="status"
          :role="role"
          :ice-state="iceState"
          :reconnect-info="reconnectInfo"
          @connect="connect"
          @disconnect="disconnect"
        />
        <DropZone :disabled="!channelsReady" @file-selected="onFileSelected" />
      </aside>

      <section class="col-right">
        <h2 class="section-title">TRANSFERS</h2>
        <div v-if="!transfers.length" class="empty">暂无传输任务</div>
        <TransferProgress v-for="t in transfers" :key="t.id" :transfer="t" />
      </section>
    </main>
  </div>
</template>

<style scoped>
.shell { max-width: 1080px; margin: 0 auto; padding: 28px 24px 60px; }
.topbar { margin-bottom: 28px; }
.brand { display: flex; align-items: baseline; gap: 10px; }
.brand-mark { color: var(--signal); font-size: 18px; }
.brand-name { font-family: var(--mono); font-weight: 600; font-size: 17px; letter-spacing: 0.04em; }
.brand-tag { font-family: var(--mono); font-size: 11px; color: var(--text-faint); }

.layout { display: grid; grid-template-columns: 320px 1fr; gap: 24px; align-items: start; }
.col-left { display: flex; flex-direction: column; gap: 16px; position: sticky; top: 24px; }
.col-right { display: flex; flex-direction: column; gap: 12px; }
.section-title {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.14em;
  color: var(--text-faint); margin: 4px 0 4px;
}
.empty {
  border: 1px dashed var(--border); border-radius: var(--radius);
  padding: 40px; text-align: center; color: var(--text-faint); font-size: 13px;
}

@media (max-width: 800px) {
  .layout { grid-template-columns: 1fr; }
  .col-left { position: static; }
}
</style>
