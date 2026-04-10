思路转变：不再用一个 ECharts 实例做多 grid，改为**每个基金独立一个 `<div>` + 独立 ECharts 实例**，彻底隔离，高度完全可控。

```diff
-    let chartInstance = null;
+    const chartInstances = {};   // { [id]: echartsInstance }

     function drawChart() {
-      if (!chartInstance) {
-        chartInstance = echarts.init(document.getElementById('chart'));
-      }
-      const { count, labels } = getChartDataPoints(currentPeriod);
-      const selectedList = [...selected];
-      const panelCount = selectedList.length || 1;
-      const leftOffset = 70;
-      const rightOffset = 40;
-      const topPadding = 20;
-      const bottomPadding = 10;
-      const gapBetween = 10;
-      const totalHeight = 100;
-      const usable = totalHeight - topPadding - bottomPadding
-                    - gapBetween * (panelCount - 1);
-      const panelHeight = usable / panelCount;
-      const grids = [];
-      const xAxes = [];
-      const yAxes = [];
-      const seriesData = [];
-      const titles = [];
-      selectedList.forEach((id, i) => {
-        const f = schemaList.find(x => x.id === id);
-        let rawFunddata = Math.random() * 400 + 100;
-        const amountData = Array.from({ length: count }, () => {
-          rawFunddata += Math.random() * 20;
-          return rawFunddata.toFixed(2);
-        });
-        const gridTop = topPadding + i * (panelHeight + gapBetween);
-        const isLast = i === panelCount - 1;
-        grids.push({ left: leftOffset, right: rightOffset,
-          top: `${gridTop}%`, height: `${panelHeight}%` });
-        xAxes.push({ type: 'category', data: labels, gridIndex: i,
-          axisLabel: { show: isLast }, axisLine: { show: true } });
-        yAxes.push({
-          type: 'value', gridIndex: i, splitNumber: 4,
-          min: value => { ... }, max: value => { ... },
-          axisLine: { show: true, lineStyle: { color: '#ccc' } },
-          axisLabel: { formatter: value => { ... } },
-        });
-        titles.push({ text: f?.name ?? '', left: leftOffset,
-          top: `${gridTop}%`,
-          textStyle: { fontSize: 11, fontWeight: 'normal', color: '#555' } });
-        seriesData.push({ name: f?.name, type: 'line', data: amountData,
-          showSymbol: false, smooth: true,
-          xAxisIndex: i, yAxisIndex: i });
-      });
-      chartInstance.setOption({
-        tooltip: { trigger: 'axis' },
-        title: titles, grid: grids,
-        xAxis: xAxes, yAxis: yAxes, series: seriesData,
-      }, true);
-      requestAnimationFrame(() => chartInstance.resize());
+      const { count, labels } = getChartDataPoints(currentPeriod);
+      const selectedList = [...selected];
+      const container = document.getElementById('chart');
+
+      // 1. 销毁已不在 selected 中的实例，移除对应 dom
+      Object.keys(chartInstances).forEach(id => {
+        if (!selected.has(id)) {
+          chartInstances[id].dispose();
+          delete chartInstances[id];
+          const el = document.getElementById('chart-panel-' + id);
+          if (el) el.remove();
+        }
+      });
+
+      // 2. 按 selectedList 顺序，确保 dom 顺序与选择顺序一致
+      selectedList.forEach(id => {
+        let el = document.getElementById('chart-panel-' + id);
+        if (!el) {
+          el = document.createElement('div');
+          el.id = 'chart-panel-' + id;
+          el.style.cssText = 'width:100%;height:160px;margin-bottom:10px;';
+        }
+        container.appendChild(el);   // 已存在的节点 append 会自动移到末尾保持顺序
+
+        if (!chartInstances[id]) {
+          chartInstances[id] = echarts.init(el);
+        }
+
+        const f = schemaList.find(x => x.id === id);
+        let rawFunddata = Math.random() * 400 + 100;
+        const amountData = Array.from({ length: count }, () => {
+          rawFunddata += Math.random() * 20;
+          return rawFunddata.toFixed(2);
+        });
+
+        chartInstances[id].setOption({
+          tooltip: { trigger: 'axis' },
+          title: {
+            text: f?.name ?? '',
+            left: 70,
+            top: 4,
+            textStyle: { fontSize: 11, fontWeight: 'normal', color: '#555' },
+          },
+          grid: { left: 70, right: 40, top: 28, bottom: 30 },
+          xAxis: { type: 'category', data: labels },
+          yAxis: {
+            type: 'value',
+            splitNumber: 4,
+            min: value => {
+              const range = value.max - value.min;
+              const result = value.min - range * 0.3;
+              const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(range) || 1)));
+              return Math.floor(result / magnitude) * magnitude;
+            },
+            max: value => {
+              const range = value.max - value.min;
+              const result = value.max + range * 0.3;
+              const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(range) || 1)));
+              return Math.ceil(result / magnitude) * magnitude;
+            },
+            axisLine: { show: true, lineStyle: { color: '#ccc' } },
+            axisLabel: {
+              formatter: value => {
+                if (Math.abs(value) >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
+                if (Math.abs(value) >= 1_000) return (value / 1_000).toFixed(1) + 'K';
+                return value;
+              }
+            },
+          },
+          series: [{
+            name: f?.name,
+            type: 'line',
+            data: amountData,
+            showSymbol: false,
+            smooth: true,
+          }],
+        }, true);
+      });
     }
```

同时 `#chart` 的 CSS 去掉固定高度，让子 div 自然撑开：

```diff
-  #chart { height: 400px; }   /* 或任何你原来写的固定高度 */
+  #chart { width: 100%; }
```

---

**核心变化说明**

- `chartInstances` 对象维护所有实例，key 为基金 id
- 每个基金对应独立 `<div id="chart-panel-{id}">` 固定 `height:160px`
- 取消选中时 `dispose()` 实例并移除 DOM，完全释放
- 每个子图有完整独立的 `xAxis / yAxis / grid`，互不影响
- 父容器 `#chart` 不设高度，由子 div 自然撑开，彻底解决遮挡问题
