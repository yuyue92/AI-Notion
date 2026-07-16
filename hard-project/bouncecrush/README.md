# BounceCrush 合金动能测试舱

Vue 3 + Three.js + cannon-es 制作的 3D 物理交互原型：拖拽鼠标拉弓瞄准，松手发射一颗高反弹合金球，
球体在封闭六面舱体内连续反弹；每次撞击都会按能量守恒在墙面对应位置留下几何凹陷，并伴随扩散状的
能量辉光与瞬时慢动作（Bullet Time）反馈。

## 运行

```bash
npm install
npm run dev
```

浏览器打开终端提示的本地地址（默认 http://localhost:5173）。在 3D 视图内按住鼠标左键拖拽后松开即可发射。

## 目录结构

```
src/
  components/GameCanvas.vue        主编排组件：场景/物理/交互/HUD 全部在此接线
  three/core/SceneManager.js       渲染器、相机、PMREM 环境贴图、光照
  three/core/Postprocessing.js     EffectComposer：SSAO + Bloom + 速度动态模糊 + 子弹时间暗角
  three/physics/PhysicsWorld.js    cannon-es 世界：高频子步 + SAP 宽相
  three/objects/Ball.js            合金球：MeshPhysicalMaterial(anisotropy) + Sphere 刚体
  three/objects/Chamber.js         六面舱体网格与静态碰撞体，含世界坐标->UV 反算
  three/materials/DeformableWallMaterial.js  onBeforeCompile 注入的顶点凹陷 + 发光着色器
  three/interaction/LaunchController.js      Raycaster 拖拽取点 -> 发射矢量
  three/systems/ImpactSystem.js    碰撞回调：精确反弹、能量分配、损伤贴图绘制
  three/systems/BulletTime.js      时间缩放曲线控制器
  three/utils/reflect.js           核心反弹公式 v' = v - (1+e)(v·n)n
```

## 核心算法说明

### 1. 精确法向量反弹（`three/utils/reflect.js`）
cannon-es 自身的 `restitution` 是求解器近似值，为了让"反弹能量"与"墙面形变能量"严格挂钩，
将墙面材质的 `restitution` 设为 0，在 `collide` 事件里用标准反射公式手动接管：

```
v' = v - (1 + e) * (v·n) * n
```

`e` 为恢复系数；反弹前后法向动能差即为该次撞击"消耗"的能量，直接作为形变强度与发光强度的输入，
形成物理上自洽的因果链：撞得越狠 → 凹得越深 / 越亮 → 慢动作压得越低。

### 2. 几何形变（非法线贴图假凹凸）
`DeformableWallMaterial` 给每面墙一张独立的 CanvasTexture（"损伤贴图"，R=凹陷深度，G=发光能量）。
碰撞点先经 `Chamber.findWallAndUV` 从世界坐标反算成该墙的局部 UV，再用径向渐变笔刷叠加绘制到
Canvas 上传 GPU。顶点着色器里通过 `onBeforeCompile` 注入：

```glsl
float dentSample = texture2D(uDamageMap, uv).r;
transformed -= normal * dentSample * uMaxDent;
```

即沿墙面法线方向真实位移顶点，因此近距离观察、多次叠加撞击时凹陷会正确堆叠/扩大，而不是伪光影。

### 3. Bullet Time
`BulletTime` 维护一个与"真实时间"解耦的 `timeScale`：撞击触发后骤降到 `minScale`，停留
`holdDuration` 后用 `easeOutCubic` 缓升回 1。主循环里物理步进的 `dt` 会乘上这个 `timeScale`，
渲染仍以真实帧率运行，从而得到"世界变慢但画面不掉帧"的效果。

### 4. 交互：Raycaster 拉弓瞄准
`LaunchController` 在按下瞬间建立一张过球心、法线朝向相机的虚拟拖拽平面，`pointerdown/move` 期间
持续用 `Raycaster.ray.intersectPlane` 取交点并绘制矢量线；松开时取"起点→终点"的反方向作为发射
方向（类似弹弓），拖拽长度映射为初速度大小。

### 5. 材质与后期
- 合金球使用 `MeshPhysicalMaterial` 的 `anisotropy` / `anisotropyRotation`，配合 `clearcoat`
  模拟锻造合金的方向性高光与表层清漆反射。
- `Postprocessing` 管线：`SSAOPass` 强化凹陷接触阴影的实体感 → `UnrealBloomPass` 让损伤贴图的
  发光通道形成能量扩散辉光（撞击强度会临时调高 `bloomPass.strength`）→ 自定义 `VelocityBlurShader`
  依据球体屏幕空间位移做方向性动态模糊 → 自定义子弹时间暗角/冷色调 Pass。

## 已知简化 / 后续可扩展方向

- 损伤贴图的"发光衰减"目前用整张 Canvas 的低强度黑色叠层近似做指数衰减，凹陷通道会随之缓慢
  回落，可读作"金属延迟形变松弛"；如需凹陷永久保留，可将 R、G 通道分离到两张贴图分别处理衰减。
- 目前舱体为轴对齐立方体（6 张 `CANNON.Plane`），换成任意凸多面体只需扩展 `WALL_DEFS` 与
  `Chamber.findWallAndUV` 的 UV 反算逻辑。
- 未接入真实的屏幕空间运动矢量缓冲（Motion Vector G-buffer），`VelocityBlurShader` 用"球体屏幕
  位移方向"近似驱动全屏方向模糊，性能开销低但只对高速小物体场景准确，不适合复杂多物体运动模糊。
