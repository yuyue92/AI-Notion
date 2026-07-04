<script setup>
import { ref } from 'vue';

const props = defineProps({
  status: { type: String, default: 'idle' }, // idle | joining | waiting | connected | reconnecting | failed
  role: { type: String, default: '' },
  iceState: { type: String, default: '' },
  reconnectInfo: { type: Object, default: null }
});
const emit = defineEmits(['connect', 'disconnect']);

const serverUrl = ref(localStorage.getItem('lf.serverUrl') || 'http://localhost:3001');
const roomId = ref(localStorage.getItem('lf.roomId') || '');

function handleConnect() {
  if (!roomId.value.trim()) return;
  localStorage.setItem('lf.serverUrl', serverUrl.value);
  localStorage.setItem('lf.roomId', roomId.value);
  emit('connect', { serverUrl: serverUrl.value.trim(), roomId: roomId.value.trim() });
}

const STATUS_LABEL = {
  idle: '未连接',
  joining: '正在加入房间…',
  waiting: '等待对端加入…',
  connected: '已建立 P2P 连接',
  reconnecting: '连接中断，正在重连…',
  failed: '重连失败'
};
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <span class="dot" :class="status"></span>
      <span class="head-title">HANDSHAKE</span>
      <span class="head-sub">{{ STATUS_LABEL[status] || status }}</span>
    </header>

    <div v-if="status === 'idle'" class="form">
      <label>
        <span>信令服务器</span>
        <input v-model="serverUrl" placeholder="http://192.168.1.10:3001" />
      </label>
      <label>
        <span>房间号</span>
        <input v-model="roomId" placeholder="约定一个房间号，如 room-01" @keyup.enter="handleConnect" />
      </label>
      <button class="primary" @click="handleConnect">建立连接</button>
    </div>

    <div v-else class="meta-grid">
      <div class="meta-item">
        <span class="k">role</span>
        <span class="v mono">{{ role || '--' }}</span>
      </div>
      <div class="meta-item">
        <span class="k">ice-state</span>
        <span class="v mono">{{ iceState || '--' }}</span>
      </div>
      <div class="meta-item" v-if="reconnectInfo">
        <span class="k">retry</span>
        <span class="v mono">#{{ reconnectInfo.attempt }} · {{ reconnectInfo.backoff }}ms</span>
      </div>
      <button class="ghost" @click="emit('disconnect')">断开</button>
    </div>
  </section>
</template>

<style scoped>
.panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 20px;
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.head-title {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.14em;
  color: var(--text-faint);
}
.head-sub {
  font-size: 13px;
  color: var(--text-muted);
}
.dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--text-faint);
  box-shadow: 0 0 0 3px transparent;
}
.dot.connected { background: var(--signal); box-shadow: 0 0 0 3px rgba(94,234,212,0.15); }
.dot.reconnecting { background: var(--warn); animation: pulse 1.2s infinite; }
.dot.failed { background: var(--danger); }
.dot.waiting, .dot.joining { background: var(--text-muted); animation: pulse 1.6s infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }

.form { display: flex; flex-direction: column; gap: 12px; }
.form label { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--text-muted); }
.form input {
  background: var(--panel-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  padding: 9px 10px;
  font-family: var(--mono);
  font-size: 13px;
}
.form input:focus { border-color: var(--signal-dim); }

button.primary {
  background: var(--signal);
  color: #06201c;
  border: none;
  border-radius: var(--radius);
  padding: 10px 14px;
  font-weight: 600;
  font-size: 13.5px;
  margin-top: 4px;
}
button.primary:hover { filter: brightness(1.08); }
button.ghost {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: var(--radius);
  padding: 7px 12px;
  font-size: 12.5px;
}
button.ghost:hover { border-color: var(--danger); color: var(--danger); }

.meta-grid { display: flex; flex-wrap: wrap; gap: 18px; align-items: center; }
.meta-item { display: flex; flex-direction: column; gap: 3px; }
.meta-item .k { font-size: 10.5px; letter-spacing: 0.08em; color: var(--text-faint); text-transform: uppercase; }
.meta-item .v { font-size: 13px; color: var(--text); }
.mono { font-family: var(--mono); }
</style>
