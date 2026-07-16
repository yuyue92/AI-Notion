import * as CANNON from 'cannon-es'
import * as THREE from 'three'
import { reflectVelocity } from '../utils/reflect.js'

const RESTITUTION = 0.965          // 恢复系数（合金球高反弹）
const ENERGY_TO_DENT = 0.028       // 能量 -> 凹陷深度换算
const ENERGY_TO_GLOW = 0.9         // 能量 -> 发光强度换算
const BULLET_TIME_THRESHOLD = 1.2  // 触发慢动作的最小法向冲击速度

export class ImpactSystem {
  constructor({ ball, chamber, bulletTime, onImpact }) {
    this.ball = ball
    this.chamber = chamber
    this.bulletTime = bulletTime
    this.onImpact = onImpact // 回调：给 postprocessing 一个"能量脉冲"用于泛光/震颤
    this._tmpNormal = new CANNON.Vec3()

    ball.body.addEventListener('collide', (e) => this._handleCollision(e))
  }

  _handleCollision(event) {
    const { body: other, contact } = event
    const isBallBi = contact.bi.id === this.ball.body.id
    // contact.ni 始终由 bi 指向 bj，统一成"指向球体"的法线
    const normal = isBallBi ? contact.ni.scale(-1) : contact.ni.clone()

    const { velocity, normalSpeed, energyLoss } = reflectVelocity(
      this.ball.body.velocity,
      normal,
      RESTITUTION
    )
    this.ball.body.velocity.copy(velocity)

    if (normalSpeed < 0.05) return // 忽略静止接触/滚动造成的抖动

    // 计算世界坐标碰撞点：body 位置 + 局部接触向量
    const ri = isBallBi ? contact.ri : contact.rj
    const worldPoint = this.ball.body.position.vadd(ri)

    const wallId = other.userData?.wallId
    if (wallId) {
      const hit = this.chamber.findWallAndUV(
        new THREE.Vector3(worldPoint.x, worldPoint.y, worldPoint.z),
        wallId
      )
      if (hit) this._paintDamage(hit, energyLoss, normalSpeed)
    }

    if (normalSpeed > BULLET_TIME_THRESHOLD) {
      const intensity = Math.min(1, normalSpeed / 8)
      this.bulletTime.trigger(intensity)
      this.onImpact?.(intensity)
    }
  }

  _paintDamage({ wall, u, v }, energyLoss, normalSpeed) {
    const { damageCanvas: canvas, damageCtx: ctx, damageMap } = wall.material.userData
    const cx = u * canvas.width
    const cy = (1 - v) * canvas.height // canvas 原点在左上，v 需要翻转

    const dentStrength = THREE.MathUtils.clamp(energyLoss * ENERGY_TO_DENT, 0, 1)
    const glowStrength = THREE.MathUtils.clamp(normalSpeed * ENERGY_TO_GLOW * 0.12, 0, 1)
    const radius = 18 + normalSpeed * 6

    ctx.globalCompositeOperation = 'lighter'
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
    // R 通道叠加凹陷深度，G 通道叠加发光能量，B 通道暂留（生命周期可扩展）
    grad.addColorStop(0, `rgba(${Math.round(dentStrength * 255)}, ${Math.round(glowStrength * 255)}, 0, 1)`)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)
    ctx.globalCompositeOperation = 'source-over'

    damageMap.needsUpdate = true
    wall.material.userData.needsFade = true
  }

  /** 每帧调用：让发光通道（G）随时间指数衰减，形成"扩散后熄灭"的能量波效果 */
  update(dt) {
    for (const wall of this.chamber.walls) {
      if (!wall.material.userData.needsFade) continue
      const { damageCtx: ctx, damageCanvas: canvas, damageMap } = wall.material.userData
      // 用极低强度的整体黑色叠层做指数衰减；凹陷(R)与发光(G)一起缓慢回落，
      // 视觉上读作"金属延迟形变松弛 + 冲击波熄灭"，工业风格上是合理的。
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.06, dt * 1.4)})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      damageMap.needsUpdate = true
    }
  }
}
