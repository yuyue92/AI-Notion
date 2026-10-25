import { reactive, watch } from 'vue'
import mock from './mock/mockdata.json'

const KEY = 'order-demo-v1'
const clone = (o) => JSON.parse(JSON.stringify(o))
const now = () => new Date().toLocaleString('sv-SE').slice(0, 19)

// 状态机：当前状态 -> 可执行动作
export const TRANSITIONS = {
  待支付: [
    { key: 'pay', label: '支付', to: '待发货', log: '支付成功，库存已确认扣减' },
    { key: 'cancel', label: '取消订单', to: '已取消', log: '订单取消，库存已释放', release: true, danger: true },
    { key: 'timeout', label: '模拟超时关闭', to: '已取消', log: '30 分钟未支付，系统自动关闭，库存已释放', release: true, danger: true }
  ],
  待发货: [
    { key: 'ship', label: '发货', to: '已发货', log: '仓库出库，已生成运单' },
    { key: 'refund', label: '申请仅退款', to: '退款中', log: '用户申请仅退款，已拦截出库', danger: true }
  ],
  已发货: [{ key: 'receive', label: '确认收货', to: '已收货', log: '物流签收，进入 7 天售后期' }],
  已收货: [
    { key: 'complete', label: '售后期结束', to: '已完成', log: '售后期结束，已结算分账并发放积分' },
    { key: 'return', label: '申请退货退款', to: '退款中', log: '用户申请退货退款，已创建售后单', danger: true }
  ],
  退款中: [{ key: 'refunded', label: '退款成功', to: '已退款', log: '原路退款完成，库存已回补', release: true }]
}
export const STATUSES = ['待支付', '待发货', '已发货', '已收货', '已完成', '退款中', '已退款', '已取消']

const saved = localStorage.getItem(KEY)
export const state = reactive(saved ? JSON.parse(saved) : clone(mock))
watch(state, (v) => localStorage.setItem(KEY, JSON.stringify(v)), { deep: true })

export const total = (o) => o.items.reduce((s, i) => s + i.price * i.qty, 0)

export function createOrder({ buyer, address, lines }) {
  const items = lines.filter((l) => l.qty > 0).map((l) => {
    const p = state.products.find((x) => x.id === l.id)
    return { id: p.id, name: p.name, price: p.price, qty: l.qty }
  })
  if (!buyer || !address || !items.length) return '请填写收货人、地址，并至少选择一件商品'
  for (const i of items) {
    const p = state.products.find((x) => x.id === i.id)
    if (p.stock < i.qty) return `「${p.name}」库存不足，当前仅剩 ${p.stock} 件`
  }
  items.forEach((i) => (state.products.find((x) => x.id === i.id).stock -= i.qty)) // 预占
  const id = new Date().toISOString().slice(0, 10).replace(/-/g, '') + String(state.orders.length + 1).padStart(6, '0')
  state.orders.unshift({ id, buyer, address, status: '待支付', createdAt: now(), items,
    logs: [{ time: now(), text: '提交订单，库存已预占' }] })
  return ''
}

export function act(order, t) {
  if (!(TRANSITIONS[order.status] || []).some((x) => x.key === t.key)) return // 非法流转直接拒绝
  if (t.release) order.items.forEach((i) => (state.products.find((p) => p.id === i.id).stock += i.qty))
  order.status = t.to
  order.logs.push({ time: now(), text: t.log })
}

export function reset() {
  localStorage.removeItem(KEY)
  Object.assign(state, clone(mock))
}
