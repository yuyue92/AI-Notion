<script setup>
const props = defineProps({
  transfer: { type: Object, required: true }
  /* transfer 结构:
     {
       id, name, size, direction: 'send'|'recv',
       status: 'hashing'|'transferring'|'repairing'|'verifying'|'done'|'failed'|'paused',
       ratio, speedBps, buckets: number[] (0~1，来自 sampleBitmapRatios),
       chunkSize, totalChunks, retransmits
     }
  */
});

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n, i = -1;
  do { v /= 1024; i++; } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

const STATUS_TEXT = {
  hashing: '计算哈希…',
  transferring: '传输中',
  repairing: '修复丢包分片…',
  verifying: '校验完整性…',
  done: '完成',
  failed: '校验失败',
  paused: '已暂停 · 可续传'
};
</script>

<template>
  <div class="card">
    <div class="row head">
      <span class="dir" :class="transfer.direction">{{ transfer.direction === 'send' ? '↑ 发送' : '↓ 接收' }}</span>
      <span class="name" :title="transfer.name">{{ transfer.name }}</span>
      <span class="size mono">{{ fmtBytes(transfer.size) }}</span>
    </div>

    <!-- 签名元素：分片位图网格 —— 每个格子代表一段分片区间的完成度，
         直接可视化 ARQ 选择性重传 + 断点续传所依赖的那份位图状态 -->
    <div class="bitmap" :class="transfer.status">
      <span
        v-for="(ratio, i) in transfer.buckets"
        :key="i"
        class="cell"
        :style="{ opacity: 0.12 + ratio * 0.88 }"
      ></span>
    </div>

    <div class="row foot">
      <span class="status mono" :class="transfer.status">{{ STATUS_TEXT[transfer.status] || transfer.status }}</span>
      <span class="pct mono">{{ (transfer.ratio * 100).toFixed(1) }}%</span>
      <span class="speed mono" v-if="transfer.speedBps">{{ fmtBytes(transfer.speedBps) }}/s</span>
      <span class="retrans mono" v-if="transfer.retransmits">重传 {{ transfer.retransmits }}</span>
      <span class="chunkinfo mono">{{ (transfer.chunkSize/1024).toFixed(0) }}KB × {{ transfer.totalChunks }}</span>
    </div>
  </div>
</template>

<style scoped>
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
}
.row { display: flex; align-items: center; gap: 10px; }
.row.head { margin-bottom: 10px; }
.dir { font-size: 11px; padding: 2px 6px; border-radius: 2px; font-family: var(--mono); }
.dir.send { color: var(--signal); background: rgba(94,234,212,0.1); }
.dir.recv { color: #8ec6ff; background: rgba(142,198,255,0.1); }
.name { flex: 1; font-size: 13.5px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.size { color: var(--text-faint); font-size: 12px; }

.bitmap {
  display: grid;
  grid-template-columns: repeat(60, 1fr);
  gap: 2px;
  margin: 10px 0;
}
.bitmap .cell {
  aspect-ratio: 1;
  background: var(--signal);
  border-radius: 1px;
}
.bitmap.failed .cell { background: var(--danger); }
.bitmap.repairing .cell { background: var(--warn); }

.row.foot { margin-top: 8px; font-size: 11.5px; color: var(--text-muted); flex-wrap: wrap; }
.pct { color: var(--text); font-size: 12.5px; }
.status.done { color: var(--ok); }
.status.failed { color: var(--danger); }
.status.repairing { color: var(--warn); }
.mono { font-family: var(--mono); }
</style>
