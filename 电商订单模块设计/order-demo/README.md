# 订单模块演示（Vue 3 + Vite）

```bash
npm install
npm run dev
```
浏览器会自动打开 http://localhost:5173 。

- 数据来自 `src/mock/mockdata.json`，运行中的修改保存在 localStorage，点「重置数据」可恢复。
- 状态流转规则在 `src/store.js` 的 `TRANSITIONS`，与设计稿状态机一致。
- 下单预占库存；取消、超时关闭、退款成功会回补库存。
