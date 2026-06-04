--- a/timesheet_prototype_index_formatted.html
+++ b/timesheet_prototype_index_formatted.html
@@
-    .logo {
-      width: 38px;
-      height: 38px;
-      border-radius: 10px;
-      background: linear-gradient(145deg, var(--brand), var(--brand2));
-      display: grid;
-      place-items: center;
-      color: #fff;
-      font-weight: 800;
-      letter-spacing: 0.4px;
-    }
+    .logo {
+      position: relative;
+      display: inline-flex;
+      align-items: baseline;
+      gap: 6px;
+      padding-right: 12px;
+      color: var(--brand);
+      white-space: nowrap;
+    }
+
+    .logo-pccw {
+      font-size: 25px;
+      line-height: 1;
+      font-weight: 900;
+      font-style: italic;
+      letter-spacing: -1.2px;
+    }
+
+    .logo-solutions {
+      font-size: 16px;
+      line-height: 1;
+      font-weight: 700;
+      letter-spacing: -0.4px;
+    }
+
+    .logo-registered {
+      position: absolute;
+      top: -7px;
+      right: 0;
+      font-size: 11px;
+      line-height: 1;
+      font-weight: 700;
+    }

--- a/timesheet_prototype_index_formatted.html
+++ b/timesheet_prototype_index_formatted.html
@@
-              <div class="logo">TS</div>
+              <div class="logo">
+                <span class="logo-pccw">PCCW</span>
+                <span class="logo-solutions">Solutions</span>
+                <span class="logo-registered">®</span>
+              </div>
@@
-            <div class="logo">TS</div>
+            <div class="logo">
+              <span class="logo-pccw">PCCW</span>
+              <span class="logo-solutions">Solutions</span>
+              <span class="logo-registered">®</span>
+            </div>
