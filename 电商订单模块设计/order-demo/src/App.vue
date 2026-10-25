<script setup>
import { ref, computed, reactive } from 'vue'
import { state, STATUSES, TRANSITIONS, total, createOrder, act, reset } from './store'

const filter = ref('全部')
const selectedId = ref(state.orders[0]?.id)
const showNew = ref(false)
const err = ref('')
const form = reactive({ buyer: '', address: '', lines: [] })

const counts = computed(() => Object.fromEntries(STATUSES.map((s) => [s, state.orders.filter((o) => o.status === s).length])))
const list = computed(() => state.orders.filter((o) => filter.value === '全部' || o.status === filter.value))
const current = computed(() => state.orders.find((o) => o.id === selectedId.value))
const actions = computed(() => (current.value ? TRANSITIONS[current.value.status] || [] : []))

function openNew() {
  form.buyer = ''; form.address = ''; err.value = ''
  form.lines = state.products.map((p) => ({ id: p.id, qty: 0 }))
  showNew.value = true
}
function submit() {
  err.value = createOrder(form)
  if (!err.value) { showNew.value = false; filter.value = '全部'; selectedId.value = state.orders[0].id }
}
const stock = (id) => state.products.find((p) => p.id === id)
</script>

<template>
  <header class="top">
    <div><h1>订单管理</h1><p>演示数据保存在浏览器本地，刷新不丢失</p></div>
    <div class="row"><button class="ghost" @click="reset">重置数据</button><button class="primary" @click="openNew">新建订单</button></div>
  </header>

  <nav class="tabs">
    <button v-for="s in ['全部', ...STATUSES]" :key="s" :class="{ on: filter === s }" @click="filter = s">
      {{ s }}<span v-if="s !== '全部'">{{ counts[s] }}</span>
    </button>
  </nav>

  <main class="grid">
    <section class="panel">
      <table>
        <thead><tr><th>订单号</th><th>收货人</th><th>金额</th><th>状态</th></tr></thead>
        <tbody>
          <tr v-for="o in list" :key="o.id" :class="{ sel: o.id === selectedId }" @click="selectedId = o.id">
            <td>{{ o.id }}</td><td>{{ o.buyer }}</td><td>¥{{ total(o) }}</td>
            <td><span class="tag" :data-s="o.status">{{ o.status }}</span></td>
          </tr>
          <tr v-if="!list.length"><td colspan="4" class="empty">该状态下暂无订单，点击「新建订单」创建一笔</td></tr>
        </tbody>
      </table>
      <h3>商品库存</h3>
      <ul class="stock"><li v-for="p in state.products" :key="p.id"><span>{{ p.name }}</span><b :class="{ low: p.stock < 6 }">{{ p.stock }}</b></li></ul>
    </section>

    <section v-if="current" class="panel detail">
      <div class="row between"><h2>{{ current.id }}</h2><span class="tag" :data-s="current.status">{{ current.status }}</span></div>
      <p class="muted">{{ current.buyer }}，{{ current.address }}</p>
      <ul class="items"><li v-for="i in current.items" :key="i.id"><span>{{ i.name }} × {{ i.qty }}</span><span>¥{{ i.price * i.qty }}</span></li>
        <li class="sum"><span>合计</span><span>¥{{ total(current) }}</span></li></ul>
      <div class="row wrap">
        <button v-for="t in actions" :key="t.key" :class="t.danger ? 'ghost danger' : 'primary'" @click="act(current, t)">{{ t.label }}</button>
        <span v-if="!actions.length" class="muted">该订单已结束，无可执行操作</span>
      </div>
      <h3>状态记录</h3>
      <ol class="log"><li v-for="(l, i) in current.logs" :key="i"><time>{{ l.time }}</time>{{ l.text }}</li></ol>
    </section>
  </main>

  <div v-if="showNew" class="mask" @click.self="showNew = false">
    <form class="dialog" @submit.prevent="submit">
      <h2>新建订单</h2>
      <label>收货人<input v-model="form.buyer" /></label>
      <label>收货地址<input v-model="form.address" /></label>
      <div class="lines" v-for="l in form.lines" :key="l.id">
        <span>{{ stock(l.id).name }} <small>¥{{ stock(l.id).price }}，库存 {{ stock(l.id).stock }}</small></span>
        <input type="number" min="0" v-model.number="l.qty" />
      </div>
      <p v-if="err" class="error">{{ err }}</p>
      <div class="row end"><button type="button" class="ghost" @click="showNew = false">取消</button><button class="primary">提交订单</button></div>
    </form>
  </div>
</template>

<style>
:root { --ink: #1c2a33; --muted: #5d6b75; --line: #d9e0e4; --bg: #f3f6f7; --brand: #0f766e; --danger: #b42318; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.6 -apple-system, 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif; }
#app { max-width: 1160px; margin: 0 auto; padding: 24px 20px 48px; }
h1 { margin: 0; font-size: 26px; } h2 { margin: 0; font-size: 18px; } h3 { margin: 24px 0 8px; font-size: 15px; }
.top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.top p, .muted { margin: 0; color: var(--muted); }
.row { display: flex; gap: 8px; align-items: center; } .between { justify-content: space-between; } .wrap { flex-wrap: wrap; margin: 16px 0; } .end { justify-content: flex-end; margin-top: 16px; }
button { font: inherit; border-radius: 6px; padding: 8px 16px; min-height: 40px; cursor: pointer; border: 1px solid var(--line); background: #fff; color: var(--ink); }
button:focus-visible, input:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
.ghost.danger { color: var(--danger); border-color: #e7b4ae; }
.tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
.tabs button { border-radius: 20px; padding: 4px 14px; min-height: 36px; }
.tabs button.on { background: var(--ink); color: #fff; border-color: var(--ink); }
.tabs span { margin-left: 6px; opacity: .7; }
.grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 16px; align-items: start; }
@media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
.panel { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 16px; }
table { width: 100%; border-collapse: collapse; } th { text-align: left; color: var(--muted); font-weight: 600; }
th, td { padding: 10px 8px; border-bottom: 1px solid var(--line); } tbody tr { cursor: pointer; } tbody tr:hover, tr.sel { background: #e9f3f2; }
.empty { text-align: center; color: var(--muted); padding: 32px 8px; cursor: default; }
.tag { padding: 2px 10px; border-radius: 12px; font-size: 13px; background: #e5e9ec; }
.tag[data-s='待支付'] { background: #fdecc8; color: #7a4b00; } .tag[data-s='待发货'], .tag[data-s='已发货'] { background: #d6e8fb; color: #174a85; }
.tag[data-s='已收货'], .tag[data-s='已完成'] { background: #d3f0e4; color: #0b5a3a; } .tag[data-s='退款中'], .tag[data-s='已退款'] { background: #fbdcd7; color: #8a1c10; }
ul, ol { list-style: none; margin: 0; padding: 0; }
.items li, .stock li { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed var(--line); } .sum { font-weight: 700; }
.low { color: var(--danger); }
.log li { padding: 6px 0 6px 14px; border-left: 2px solid var(--brand); margin-left: 4px; } .log time { display: block; color: var(--muted); font-size: 12px; }
.mask { position: fixed; inset: 0; background: rgba(20, 30, 36, .5); display: grid; place-items: center; padding: 16px; }
.dialog { background: #fff; border-radius: 10px; padding: 24px; width: 460px; max-width: 100%; max-height: 90vh; overflow: auto; }
.dialog label { display: block; margin-top: 12px; } .dialog input { width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font: inherit; }
.lines { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 10px; } .lines input { width: 80px; } small { color: var(--muted); }
.error { color: var(--danger); margin: 12px 0 0; }
</style>
