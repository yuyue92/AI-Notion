import * as THREE from 'three'

const MIN_DRAG = 0.02   // 归一化屏幕空间下的最小拖拽长度，避免误触发
const MAX_SPEED = 14
const MIN_SPEED = 3

/**
 * 拉弓式发射交互：
 * 1. pointerdown 时用 Raycaster 在一个经过球心、朝向相机的虚拟平面上取起点。
 * 2. pointermove 中持续取终点，实时绘制一条 Line 作为矢量轨迹反馈。
 * 3. pointerup 时：方向 = 起点->终点在该平面内的反向延长（"拉弓后松手"直觉），
 *    速度 = 拖拽长度映射到 [MIN_SPEED, MAX_SPEED]。
 */
export class LaunchController {
  constructor({ camera, domElement, ball, scene, onLaunch }) {
    this.camera = camera
    this.dom = domElement
    this.ball = ball
    this.scene = scene
    this.onLaunch = onLaunch

    this.raycaster = new THREE.Raycaster()
    this.pointerNDC = new THREE.Vector2()
    this.dragPlane = new THREE.Plane()
    this.dragStart = new THREE.Vector3()
    this.dragCurrent = new THREE.Vector3()
    this.dragging = false

    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
    const material = new THREE.LineBasicMaterial({ color: 0x00e5c3, transparent: true, opacity: 0.85 })
    this.trajectoryLine = new THREE.Line(geometry, material)
    this.trajectoryLine.visible = false
    this.scene.add(this.trajectoryLine)

    this._onDown = this._onDown.bind(this)
    this._onMove = this._onMove.bind(this)
    this._onUp = this._onUp.bind(this)

    this.dom.addEventListener('pointerdown', this._onDown)
    window.addEventListener('pointermove', this._onMove)
    window.addEventListener('pointerup', this._onUp)
  }

  _updateNDC(event) {
    const rect = this.dom.getBoundingClientRect()
    this.pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  _raycastToPlane() {
    this.raycaster.setFromCamera(this.pointerNDC, this.camera)
    const point = new THREE.Vector3()
    const hit = this.raycaster.ray.intersectPlane(this.dragPlane, point)
    return hit ? point : null
  }

  _onDown(event) {
    this._updateNDC(event)
    // 拖拽平面：过球心，法线指向相机（始终面向玩家的一张不可见幕布）
    const camDir = new THREE.Vector3()
    this.camera.getWorldDirection(camDir)
    this.dragPlane.setFromNormalAndCoplanarPoint(camDir, this.ball.mesh.position)

    const point = this._raycastToPlane()
    if (!point) return
    this.dragging = true
    this.dragStart.copy(point)
    this.dragCurrent.copy(point)
    this.trajectoryLine.visible = true
    this._updateLine()
  }

  _onMove(event) {
    if (!this.dragging) return
    this._updateNDC(event)
    const point = this._raycastToPlane()
    if (!point) return
    this.dragCurrent.copy(point)
    this._updateLine()
  }

  _onUp() {
    if (!this.dragging) return
    this.dragging = false
    this.trajectoryLine.visible = false

    const drag = this.dragCurrent.clone().sub(this.dragStart)
    const dragLenNDC = drag.length() / (this.camera.position.distanceTo(this.ball.mesh.position) * 0.5)

    if (dragLenNDC < MIN_DRAG) return

    // "拉弓"直觉：往哪拖，球就往反方向飞
    const direction = drag.clone().negate().normalize()
    const speed = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(dragLenNDC, MIN_DRAG, 1.2, MIN_SPEED, MAX_SPEED),
      MIN_SPEED,
      MAX_SPEED
    )

    this.onLaunch?.(direction, speed)
  }

  _updateLine() {
    const positions = this.trajectoryLine.geometry.attributes.position
    positions.setXYZ(0, this.dragStart.x, this.dragStart.y, this.dragStart.z)
    positions.setXYZ(1, this.dragCurrent.x, this.dragCurrent.y, this.dragCurrent.z)
    positions.needsUpdate = true
  }

  dispose() {
    this.dom.removeEventListener('pointerdown', this._onDown)
    window.removeEventListener('pointermove', this._onMove)
    window.removeEventListener('pointerup', this._onUp)
  }
}
