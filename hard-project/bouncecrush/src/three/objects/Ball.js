import * as THREE from 'three'
import * as CANNON from 'cannon-es'

export const BALL_RADIUS = 0.6

/**
 * 高反弹合金球
 * - MeshPhysicalMaterial 开启 anisotropy（各向异性高光），配合环境贴图
 *   模拟拉丝金属/锻造合金表面在不同角度下高光条纹的方向性反射。
 * - 物理体为低质量、高密度小球，质量用于 E=0.5mv² 的能量计算。
 */
export class Ball {
  constructor(envMap) {
    const geometry = new THREE.SphereGeometry(BALL_RADIUS, 64, 64)

    this.material = new THREE.MeshPhysicalMaterial({
      color: 0xb9c2ca,
      metalness: 1.0,
      roughness: 0.22,
      envMap,
      envMapIntensity: 1.4,
      anisotropy: 1.0,
      anisotropyRotation: Math.PI * 0.25,
      clearcoat: 0.35,
      clearcoatRoughness: 0.25
    })

    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.castShadow = true

    this.body = new CANNON.Body({
      mass: 1.6,
      shape: new CANNON.Sphere(BALL_RADIUS),
      linearDamping: 0.0,
      angularDamping: 0.05,
      position: new CANNON.Vec3(0, 0, 0)
    })

    // 速度相关的"动态模糊"由 postprocessing 里的 VelocityBlurPass 读取
    this.prevPosition = new THREE.Vector3()
    this.speed = 0
  }

  setMaterial(cannonMaterial) {
    this.body.material = cannonMaterial
  }

  launch(direction, speed) {
    this.body.velocity.set(direction.x * speed, direction.y * speed, direction.z * speed)
    this.body.angularVelocity.set(
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4
    )
  }

  sync() {
    this.prevPosition.copy(this.mesh.position)
    this.mesh.position.set(this.body.position.x, this.body.position.y, this.body.position.z)
    this.mesh.quaternion.set(
      this.body.quaternion.x,
      this.body.quaternion.y,
      this.body.quaternion.z,
      this.body.quaternion.w
    )
    this.speed = this.mesh.position.distanceTo(this.prevPosition)
  }
}
