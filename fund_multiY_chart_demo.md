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
const leftOffset = 70;
       const rightOffset = 40;
-      const topPadding = 20;       // 整体顶部留白
-      const bottomPadding = 10;    // 整体底部留白（最后一个xAxis）
-      const gapBetween = 10;       // 子图之间的间距
-      const totalHeight = 100;     // 百分比总高度
-      const usable = totalHeight - topPadding - bottomPadding
-                    - gapBetween * (panelCount - 1);
-      const panelHeight = usable / panelCount;  // 每个子图高度百分比
+      const topPadding = 10;       // 整体顶部留白 px
+      const bottomPadding = 30;    // 底部留白 px（最后一个xAxis标签空间）
+      const gapBetween = 24;       // 子图之间间距 px
+      const panelHeight = 160;     // 每个子图固定高度 px ← 按需调整
+
+      // 容器总高度动态撑开
+      const totalHeight = topPadding + panelCount * panelHeight
+                        + (panelCount - 1) * gapBetween + bottomPadding;
+      const chartEl = document.getElementById('chart');
+      chartEl.style.height = totalHeight + 'px';
+      if (chartInstance) chartInstance.resize();

       ...

-        const gridTop = topPadding + i * (panelHeight + gapBetween);
+        const gridTop = topPadding + i * (panelHeight + gapBetween);  // 此行不变，单位已变为 px

         grids.push({
           left: leftOffset,
           right: rightOffset,
-          top: `${gridTop}%`,
-          height: `${panelHeight}%`,
+          top: gridTop,            // number 类型，ECharts 视为 px
+          height: panelHeight,
         });

         ...

         titles.push({
           text: f?.name ?? '',
           left: leftOffset,
-          top: `${gridTop}%`,
+          top: gridTop + 4,        // px，标题稍微内缩 4px
           textStyle: { fontSize: 11, fontWeight: 'normal', color: '#555' },
         });
```
