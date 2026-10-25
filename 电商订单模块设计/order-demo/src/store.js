import { reactive, watch } from 'vue'
import mock from './mock/mockdata.json'

const KEY = 'order-demo-v2'
export const PAY_SECONDS = 1800 // 下单后 30 分钟内必须支付
export const ROLES = ['买家', '商家', '客服']
const clone = (o) => JSON.parse(JSON.stringify(o))
const now = () => new Date().toLocaleString('sv-SE').slice(0, 19)

// 状态机：当前状态 -> 可执行动作（role 为有权执行的角色，「系统」由倒计时自动触发）
export const TRANSITIONS = {
  待支付: [
    { key: 'pay', role: '买家', label: '支付', to: '待发货', log: '支付成功，库存已确认扣减' },
    { key: 'cancel', role: '买家', label: '取消订单', to: '已取消', log: '订单取消，库存已释放', release: true, danger: true },
    { key: 'timeout', role: '系统', label: '超时关闭', to: '已取消', log: '30 分钟未支付，系统自动关闭，库存已释放', release: true }
  ],
  待发货: [
    { key: 'ship', role: '商家', label: '发货', to: '已发货', log: '仓库出库，已生成运单' },
    { key: 'refund', role: '买家', label: '申请仅退款', to: '退款中', log: '用户申请仅退款，已拦截出库', danger: true }
  ],
  已发货: [{ key: 'receive', role: '买家', label: '确认收货', to: '已收货', log: '物流签收，进入 7 天售后期' }],
  已收货: [
    { key: 'complete', role: '客服', label: '售后期结束，完成订单', to: '已完成', log: '售后期结束，已结算分账并发放积分' },
    { key: 'return', role: '买家', label: '申请退货退款', to: '退款中', log: '用户申请退货退款，已创建售后单', danger: true }
  ],
  退款中: [{ key: 'refunded', role: '商家', label: '同意并退款', to: '已退款', log: '原路退款完成，库存已回补', release: true }]
}
export const STATUSES = ['待支付', '待发货', '已发货', '已收货', '已完成', '退款中', '已退款', '已取消']

function init(data) {
  const d = clone(data), t = Date.now()
  d.orders.forEach((o) => { if (o.status === '待支付' && !o.expireAt) o.expireAt = t + (o.expireInSec ?? PAY_SECONDS) * 1000 })
  return d
}
const saved = localStorage.getItem(KEY)
export const state = reactive(saved ? JSON.parse(saved) : init(mock))
watch(state, (v) => localStorage.setItem(KEY, JSON.stringify(v)), { deep: true })

export const total = (o) => o.items.reduce((s, i) => s + i.price * i.qty, 0)
export const remaining = (o) => Math.max(0, Math.floor((o.expireAt - Date.now()) / 1000))
export const fmt = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')

export function createOrder({ buyer, address, lines }) {
  const items = lines.filter((l) => l.qty > 0).map((l) => {
    const p = state.products.find((x) => x.id === l.id)
    return { id: p.id, name: p.name, price: p.price, qty: l.qty }
  })
  if (!address || !items.length) return '请填写收货地址，并至少选择一件商品'
  for (const i of items) {
    const p = state.products.find((x) => x.id === i.id)
    if (p.stock < i.qty) return `「${p.name}」库存不足，当前仅剩 ${p.stock} 件`
  }
  items.forEach((i) => (state.products.find((x) => x.id === i.id).stock -= i.qty)) // 预占
  const id = new Date().toISOString().slice(0, 10).replace(/-/g, '') + String(state.orders.length + 1).padStart(6, '0')
  state.orders.unshift({ id, buyer, address, status: '待支付', createdAt: now(), items, expireAt: Date.now() + PAY_SECONDS * 1000,
    logs: [{ time: now(), text: '提交订单，库存已预占', by: '买家' }] })
  return ''
}

export function act(order, t, by) {
  if (!(TRANSITIONS[order.status] || []).some((x) => x.key === t.key)) return // 非法流转直接拒绝
  if (t.release) order.items.forEach((i) => (state.products.find((p) => p.id === i.id).stock += i.qty))
  order.status = t.to
  delete order.expireAt
  order.logs.push({ time: now(), text: t.log, by })
}

// 每秒检查：超过支付时限的待支付订单自动关闭
export function checkExpire() {
  const t = TRANSITIONS.待支付.find((x) => x.key === 'timeout')
  state.orders.forEach((o) => { if (o.status === '待支付' && o.expireAt && o.expireAt <= Date.now()) act(o, t, '系统') })
}
export const speedUp = (o) => { o.expireAt = Date.now() + 10000 } // 演示用：把倒计时缩到 10 秒

export function reset() {
  localStorage.removeItem(KEY)
  Object.assign(state, init(mock))
}
