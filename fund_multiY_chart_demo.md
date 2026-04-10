```
function drawChart() {
   if (!chartInstance) {
     chartInstance = echarts.init(document.getElementById('chart'));
   }
   const { count, labels } = getChartDataPoints(currentPeriod);
-  const seriesData = [...selected].map(id => {
+  const selectedList = [...selected];
+  const panelCount = selectedList.length || 1;
+
+  // 每个子图的布局参数
+  const leftOffset = 70;
+  const rightOffset = 40;
+  const topPadding = 20;       // 整体顶部留白
+  const bottomPadding = 40;    // 整体底部留白（最后一个xAxis）
+  const gapBetween = 30;       // 子图之间的间距
+  const totalHeight = 100;     // 百分比总高度
+  const usable = totalHeight - topPadding - bottomPadding
+                 - gapBetween * (panelCount - 1);
+  const panelHeight = usable / panelCount;  // 每个子图高度百分比
+
+  const grids = [];
+  const xAxes = [];
+  const yAxes = [];
+  const seriesData = [];
+  const titles = [];
+
+  selectedList.forEach((id, i) => {
     const f = schemaList.find(x => x.id === id);
     let rawFunddata = Math.random() * 400 + 100;
     const amountData = Array.from({ length: count }, () => {
       rawFunddata += Math.random() * 20;
       return rawFunddata.toFixed(2);
     });
-    return {
-      name: f?.name,
-      type: 'line',
-      data: amountData,
-      showSymbol: false,
-      smooth: true,
-    };
-  });
+
+    const gridTop = topPadding + i * (panelHeight + gapBetween);
+    const isLast = i === panelCount - 1;
+
+    grids.push({
+      left: leftOffset,
+      right: rightOffset,
+      top: `${gridTop}%`,
+      height: `${panelHeight}%`,
+    });
+
+    // X轴：只有最后一个子图显示标签
+    xAxes.push({
+      type: 'category',
+      data: labels,
+      gridIndex: i,
+      axisLabel: { show: isLast },
+      axisLine: { show: true },
+    });
+
+    yAxes.push({
+      type: 'value',
+      gridIndex: i,
+      splitNumber: 4,
+      min: value => {
+        const range = value.max - value.min;
+        const result = value.min - range * 0.3;
+        const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(range) || 1)));
+        return Math.floor(result / magnitude) * magnitude;
+      },
+      max: value => {
+        const range = value.max - value.min;
+        const result = value.max + range * 0.3;
+        const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(range) || 1)));
+        return Math.ceil(result / magnitude) * magnitude;
+      },
+      axisLine: { show: true, lineStyle: { color: '#ccc' } },
+      axisLabel: {
+        formatter: value => {
+          if (Math.abs(value) >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
+          if (Math.abs(value) >= 1_000) return (value / 1_000).toFixed(1) + 'K';
+          return value;
+        }
+      },
+    });
+
+    // 每个子图左上角标注基金名
+    titles.push({
+      text: f?.name ?? '',
+      left: leftOffset,
+      top: `${gridTop}%`,
+      textStyle: { fontSize: 11, fontWeight: 'normal', color: '#555' },
+    });
+
+    seriesData.push({
+      name: f?.name,
+      type: 'line',
+      data: amountData,
+      showSymbol: false,
+      smooth: true,
+      xAxisIndex: i,
+      yAxisIndex: i,
+    });
+  });

   chartInstance.setOption({
     tooltip: { trigger: 'axis' },
-    title: {
-      show: true,
-      text: 'Fund Price(HKD)',
-      left: 10,
-      top: 10,
-      textStyle: { fontSize: 12, fontWeight: 'normal', color: '#444' }
-    },
-    legend: { top: 36, left: 'center', textStyle: { fontSize: 10 } },
-    grid: { left: 70, right: 40, top: 80, bottom: 40 },
-    xAxis: { type: 'category', data: labels },
-    yAxis: {
-      type: 'value',
-      splitNumber: 6,
-      min: value => { ... },
-      max: value => { ... },
-      axisLine: { ... },
-      axisLabel: { formatter: ... }
-    },
-    series: seriesData,
+    title: titles,
+    grid: grids,
+    xAxis: xAxes,
+    yAxis: yAxes,
+    series: seriesData,
   }, true);
 }
```

---

**核心思路：每个子图固定像素高度，图表容器总高度 = 动态撑开，改用 px 替代 % 做 top 定位。(改完后无论选几条曲线，每个子图始终保持 PANEL_H_PX 高度，容器自动向下撑开，移动端可正常滚动查看。)**
```
-  // ── Layout math (percentages) ──────────────────────────────────────────────
-  const LEFT_PX   = 62;
-  const RIGHT_PX  = 18;
-  const TOP_PCT   = 2;
-  const BOT_PCT   = 6;       // space for last x-axis labels
-  const GAP_PCT   = 4;       // gap between panels
-  const usable    = 100 - TOP_PCT - BOT_PCT - GAP_PCT * (panelCount - 1);
-  const panelH    = usable / panelCount;
+  // ── Layout math (fixed px per panel) ──────────────────────────────────────
+  const LEFT_PX    = 62;
+  const RIGHT_PX   = 18;
+  const TOP_PX     = 10;      // 整体顶部留白 px
+  const BOT_PX     = 30;      // 底部留给最后一个 x 轴标签 px
+  const GAP_PX     = 28;      // 子图之间间距 px
+  const PANEL_H_PX = 160;     // ← 每个子图固定高度 px，按需调整
+
+  // 动态撑开容器
+  const totalChartH = TOP_PX + panelCount * PANEL_H_PX
+                    + (panelCount - 1) * GAP_PX + BOT_PX;
+  document.getElementById('chart').style.height = totalChartH + 'px';
+  chartInstance.resize();   // 先 resize，再 setOption

   ...

   selectedList.forEach((id, i) => {
     ...
-    const gridTop = TOP_PCT + i * (panelH + GAP_PCT);
+    const gridTopPx = TOP_PX + i * (PANEL_H_PX + GAP_PX);

     grids.push({
       left: LEFT_PX, right: RIGHT_PX,
-      top: `${gridTop}%`, height: `${panelH}%`,
+      top: gridTopPx,           // 直接传 number，ECharts 视为 px
+      height: PANEL_H_PX,
     });

     ...

     // fund name label 同步改 px
     titles.push({
       text: `${f.name}  (HKD)`,
       left: LEFT_PX + 6,
-      top: `${gridTop + 1}%`,
+      top: gridTopPx + 4,       // px，title 在子图内稍微内缩
       textStyle: { fontSize: 11, fontWeight: '600', color },
     });
   });

-  // 旧的容器高度设置（删除，已移到上方）
-  const minH = 200, perPanel = 160;
-  document.getElementById('chart').style.height =
-    Math.max(minH, panelCount * perPanel) + 'px';
-  chartInstance.resize();
```
