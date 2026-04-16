基于你这份页面结构，直接按下面改即可：

```diff
*** Begin Patch
*** Update File: Fund Profile Comparator.html
@@
     .fixed-bar{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #ddd;padding:10px;display:flex;justify-content:space-between;align-items:center;}
     .fixed-bar button{background:var(--btn);color:#fff;border:none;padding:8px 16px;border-radius:18px;}
 
     .hidden{display:none;}
@@
   #tableNode thead th:first-child {
     z-index: 4;
     box-shadow: 1px 0 0 0 rgba(255,255,255,0.25); /* 匹配橙色表头上的阴影颜色 */
   }
+
+  /* ===== bottom sheet ===== */
+  .sheet-mask{
+    position: fixed;
+    inset: 0;
+    background: rgba(0,0,0,.35);
+    opacity: 0;
+    pointer-events: none;
+    transition: opacity .25s ease;
+    z-index: 999;
+  }
+
+  .sheet-mask.show{
+    opacity: 1;
+    pointer-events: auto;
+  }
+
+  .bottom-sheet{
+    position: fixed;
+    left: 0;
+    right: 0;
+    bottom: 0;
+    background: #fff;
+    border-radius: 16px 16px 0 0;
+    box-shadow: 0 -4px 18px rgba(0,0,0,.12);
+    transform: translateY(100%);
+    transition: transform .25s ease;
+    z-index: 1000;
+    max-height: 65vh;
+    display: flex;
+    flex-direction: column;
+  }
+
+  .bottom-sheet.show{
+    transform: translateY(0);
+  }
+
+  .sheet-handle{
+    width: 42px;
+    height: 5px;
+    border-radius: 3px;
+    background: #d9d9d9;
+    margin: 10px auto 6px;
+  }
+
+  .sheet-header{
+    display: flex;
+    justify-content: space-between;
+    align-items: center;
+    padding: 8px 14px 12px;
+    border-bottom: 1px solid #f0f0f0;
+    font-size: 15px;
+    font-weight: 600;
+    color: #333;
+  }
+
+  .sheet-close{
+    border: none;
+    background: transparent;
+    font-size: 20px;
+    line-height: 1;
+    cursor: pointer;
+    color: #999;
+  }
+
+  .sheet-list{
+    overflow-y: auto;
+    padding: 0 14px 14px;
+  }
+
+  .sheet-item{
+    display: flex;
+    justify-content: space-between;
+    align-items: center;
+    padding: 12px 0;
+    border-bottom: 1px solid #f3f3f3;
+    gap: 12px;
+  }
+
+  .sheet-item-name{
+    flex: 1;
+    font-size: 14px;
+    color: #333;
+    word-break: break-word;
+  }
+
+  .sheet-item-price{
+    flex-shrink: 0;
+    font-size: 14px;
+    font-weight: 600;
+    color: var(--primary);
+    text-align: right;
+  }
   </style>
 </head>
 <body>
@@
 <div class="fixed-bar" id="fixedBar">
   <span id="selectedCount">0 / 10 Selected</span>
   <button onclick="goCompare()">Compare</button>
 </div>
+
+<!-- bottom sheet -->
+<div id="sheetMask" class="sheet-mask" onclick="closeFundPriceSheet()"></div>
+<div id="fundPriceSheet" class="bottom-sheet">
+  <div class="sheet-handle"></div>
+  <div class="sheet-header">
+    <span>Fund Price List</span>
+    <button class="sheet-close" onclick="closeFundPriceSheet()">×</button>
+  </div>
+  <div id="fundPriceSheetList" class="sheet-list"></div>
+</div>
 
 <script>
@@
   const funds = Array.from({length:300},(_,i)=>({
     id:i,
     name: fundsList[i%(fundsList.length)],
     code:`GEF${1000+i}`,
+    price:+(Math.random()*90+10).toFixed(2),
     risk:Math.floor(Math.random() *7 ) +1,
     expense:+(Math.random()*1.2+0.3).toFixed(2),
     scheme: schemeList[i % schemeList.length],
     fundType: fundTypeList[i % fundTypeList.length],
@@
   function prevPage(){ if(page>1){page--; renderMainTable();}}
   function nextPage(){ if(page*pageSize<filtered().length){page++; renderMainTable();}}
 
+  function openFundPriceSheet(list = []){
+    const listNode = document.getElementById('fundPriceSheetList');
+    const sheetNode = document.getElementById('fundPriceSheet');
+    const maskNode = document.getElementById('sheetMask');
+
+    if(!list.length){
+      listNode.innerHTML = '<div style="padding:16px 0;color:#999;text-align:center;">No data</div>';
+    }else{
+      listNode.innerHTML = list.map(item => `
+        <div class="sheet-item">
+          <div class="sheet-item-name">${item.fundname}</div>
+          <div class="sheet-item-price">${item.price}</div>
+        </div>
+      `).join('');
+    }
+
+    maskNode.classList.add('show');
+    sheetNode.classList.add('show');
+  }
+
+  function closeFundPriceSheet(){
+    document.getElementById('sheetMask').classList.remove('show');
+    document.getElementById('fundPriceSheet').classList.remove('show');
+  }
+
+  function showSelectedFundPriceSheet(){
+    const fs = funds.filter(f => selected.includes(f.id));
+    openFundPriceSheet(
+      fs.map(f => ({
+        fundname: f.name,
+        price: `$${Number(f.price).toFixed(2)}`
+      }))
+    );
+  }
+
   
   function backToList(){ comparePage.classList.add('hidden'); listPage.classList.remove('hidden'); fixedBar.classList.remove('hidden'); }
@@
  function goCompare(){
   if(!selected.length) return alert('Select funds first');
   const fs=funds.filter(f=>selected.includes(f.id));
+
+  // 示例：在某个方法里调用底部弹框
+  // 如不想在这里触发，删掉这一行，改成在你的目标方法里调用 showSelectedFundPriceSheet()
+  showSelectedFundPriceSheet();
+
   const tableData = {
     firstColumnTitle: "Fund",
     columns: fs.map(c=>c.name),
     rows: [
*** End Patch
```

你后面真正要在别的方法里调时，直接用这一句就行：

```js
showSelectedFundPriceSheet();
```

新增删除项目:
```
*** Begin Patch
*** Update File: Fund Profile Comparator.html
@@
   .sheet-item{
     display: flex;
     justify-content: space-between;
     align-items: center;
     padding: 12px 0;
     border-bottom: 1px solid #f3f3f3;
     gap: 12px;
   }
 
   .sheet-item-name{
     flex: 1;
     font-size: 14px;
     color: #333;
     word-break: break-word;
   }
 
   .sheet-item-price{
     flex-shrink: 0;
     font-size: 14px;
     font-weight: 600;
     color: var(--primary);
     text-align: right;
   }
+
+  .sheet-item-delete{
+    flex-shrink: 0;
+    width: 22px;
+    height: 22px;
+    border: none;
+    border-radius: 50%;
+    background: #ff6b6b;
+    color: #fff;
+    font-size: 16px;
+    line-height: 22px;
+    text-align: center;
+    cursor: pointer;
+    padding: 0;
+  }
   </style>
 </head>
 <body>
@@
   let selected=[];
   let retRange=[2,12];
   let riskRange=[1,6];
+  let currentFundPriceSheetList = [];
@@
-  function openFundPriceSheet(list = []){
+  function renderFundPriceSheetList(){
     const listNode = document.getElementById('fundPriceSheetList');
-    const sheetNode = document.getElementById('fundPriceSheet');
-    const maskNode = document.getElementById('sheetMask');
 
-    if(!list.length){
+    if(!currentFundPriceSheetList.length){
       listNode.innerHTML = '<div style="padding:16px 0;color:#999;text-align:center;">No data</div>';
     }else{
-      listNode.innerHTML = list.map(item => `
+      listNode.innerHTML = currentFundPriceSheetList.map((item, index) => `
         <div class="sheet-item">
           <div class="sheet-item-name">${item.fundname}</div>
           <div class="sheet-item-price">${item.price}</div>
+          <button class="sheet-item-delete" onclick="removeFundPriceItem(${index})">-</button>
         </div>
       `).join('');
     }
+  }
+
+  function openFundPriceSheet(list = []){
+    const sheetNode = document.getElementById('fundPriceSheet');
+    const maskNode = document.getElementById('sheetMask');
+
+    currentFundPriceSheetList = [...list];
+    renderFundPriceSheetList();
 
     maskNode.classList.add('show');
     sheetNode.classList.add('show');
   }
+
+  function removeFundPriceItem(index){
+    currentFundPriceSheetList.splice(index, 1);
+    renderFundPriceSheetList();
+  }
 
   function closeFundPriceSheet(){
     document.getElementById('sheetMask').classList.remove('show');
     document.getElementById('fundPriceSheet').classList.remove('show');
   }
*** End Patch
```
