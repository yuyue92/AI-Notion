import * as CANNON from 'cannon-es'

/**
 * 物理世界封装：
 * - 固定步长 + 子步进（substep）提升高速小球在薄壁场景下的高频碰撞检测精度，
 *   避免隧穿(tunneling)。
 * - 使用 SAPBroadphase 提升多面墙体 + 单球场景的宽相性能。
 * - restitution 设为 0，真正的反弹计算交给 reflect.js 手动接管，
 *   这样能量走向完全可控、可回收用于形变系统。
 */
export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -0.6, 0) })
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)
    this.world.allowSleep = false
    this.world.solver.iterations = 12

    this.ballMaterial = new CANNON.Material('ball')
    this.wallMaterial = new CANNON.Material('wall')

    this.contactMaterial = new CANNON.ContactMaterial(
      this.ballMaterial,
      this.wallMaterial,
      {
        friction: 0.02,
        restitution: 0, // 反弹由 reflectVelocity 手动接管
        contactEquationStiffness: 1e8,
        contactEquationRelaxation: 3
      }
    )
    this.world.addContactMaterial(this.contactMaterial)

    // 高频碰撞：固定 240Hz 子步，主循环仍可用可变 dt 驱动
    this.fixedStep = 1 / 240
    this.maxSubSteps = 10
  }

  step(dt) {
    this.world.step(this.fixedStep, dt, this.maxSubSteps)
  }

  addBody(body) {
    this.world.addBody(body)
  }
}
