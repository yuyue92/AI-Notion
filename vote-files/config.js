// ============================================================
// config.js — 填入您的 Supabase 项目信息
// 在 Supabase Dashboard > Project Settings > API 中获取
// ============================================================

const SUPABASE_CONFIG = {
  // 您的 Supabase 项目 URL（格式：https://xxxxxxxxxxxx.supabase.co）
  url: 'https://mryvuflnyiocfnembjjh.supabase.co',

  // 您的 anon/public key（安全，可在前端使用）
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yeXZ1ZmxueWlvY2ZuZW1iampoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NDI5MTAsImV4cCI6MjA4NjMxODkxMH0.hnW6mJqVSfFNWyYPQmnP8xRhrlOtL8NtHKdhRi74Jg0',
};

// 导出供 HTML 文件引用
if (typeof module !== 'undefined') {
  module.exports = SUPABASE_CONFIG;
}
