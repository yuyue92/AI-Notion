<script setup>
import { ref } from 'vue';

const props = defineProps({
  disabled: { type: Boolean, default: false }
});
const emit = defineEmits(['file-selected']);

const dragOver = ref(false);
const inputRef = ref(null);

function onDrop(e) {
  dragOver.value = false;
  if (props.disabled) return;
  const file = e.dataTransfer.files?.[0];
  if (file) emit('file-selected', file);
}

function onPick(e) {
  const file = e.target.files?.[0];
  if (file) emit('file-selected', file);
  e.target.value = '';
}
</script>

<template>
  <div
    class="dropzone"
    :class="{ over: dragOver, disabled }"
    @dragover.prevent="dragOver = true"
    @dragleave.prevent="dragOver = false"
    @drop.prevent="onDrop"
    @click="!disabled && inputRef.click()"
  >
    <input ref="inputRef" type="file" hidden @change="onPick" />
    <div class="frame">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
        <path d="M12 3v12M12 3l-4 4M12 3l4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <p class="title">拖拽文件到此处，或点击选择</p>
    <p class="sub">{{ disabled ? '等待 P2P 连接建立后可用' : '文件不经过服务器，直接点对点传输' }}</p>
  </div>
</template>

<style scoped>
.dropzone {
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  color: var(--text-muted);
}
.dropzone:hover { border-color: var(--signal-dim); }
.dropzone.over { border-color: var(--signal); background: rgba(94, 234, 212, 0.04); }
.dropzone.disabled { cursor: not-allowed; opacity: 0.5; }
.frame { color: var(--signal); margin-bottom: 10px; display: flex; justify-content: center; }
.title { color: var(--text); font-size: 14px; margin: 0 0 4px; }
.sub { font-size: 12px; margin: 0; color: var(--text-faint); }
</style>
