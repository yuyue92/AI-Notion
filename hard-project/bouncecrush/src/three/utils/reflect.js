import * as CANNON from 'cannon-es'

/**
 * 精确法向反弹（能量守恒可控版本）
 *
 * 标准反射公式： v' = v - (1 + e) * (v·n) * n
 * 其中 e 为恢复系数(restitution)。e=1 完全弹性（动能守恒），e<1 每次碰撞损失
 * (1 - e^2) 比例的法向动能 —— 这部分“消失”的动能正是我们喂给容器壁形变/发光
 * 系统的能量来源，从而让视觉形变与物理反弹严格挂钩，而不是拍脑袋的美术参数。
 *
 * @param {CANNON.Vec3} velocity 碰撞前速度（世界坐标）
 * @param {CANNON.Vec3} normal   碰撞法向（指向球体一侧，单位向量）
 * @param {number} restitution   恢复系数 0~1
 * @returns {{ velocity: CANNON.Vec3, normalSpeed: number, energyLoss: number }}
 */
export function reflectVelocity(velocity, normal, restitution = 0.96) {
  const vDotN = velocity.dot(normal)
  // 只在球体正朝墙面运动时反弹，避免重复触发（掠射/分离阶段）
  if (vDotN >= 0) {
    return { velocity: velocity.clone(), normalSpeed: 0, energyLoss: 0 }
  }

  const reflected = velocity.vsub(normal.scale((1 + restitution) * vDotN))

  const normalSpeedBefore = Math.abs(vDotN)
  const normalSpeedAfter = Math.abs(reflected.dot(normal))
  // 法向动能损失比例（用单位质量近似，形变强度只关心相对量级）
  const energyLoss = 0.5 * (normalSpeedBefore ** 2 - normalSpeedAfter ** 2)

  return { velocity: reflected, normalSpeed: normalSpeedBefore, energyLoss }
}

/** 将 THREE.Vector3 <-> CANNON.Vec3 互转的小工具，减少样板代码 */
export function toCannon(v3) {
  return new CANNON.Vec3(v3.x, v3.y, v3.z)
}

export function toThree(vec3, THREE) {
  return new THREE.Vector3(vec3.x, vec3.y, vec3.z)
}
