import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { createDeformableWallMaterial } from '../materials/DeformableWallMaterial.js'

export const ROOM_SIZE = 10 // 舱体内壁边长的一半（半宽）

/**
 * 六面墙定义：法线永远指向舱体内部（球体所在一侧），
 * 用于 cannon.Plane 朝向、着色器凹陷方向、以及碰撞点 -> UV 的反算。
 */
const WALL_DEFS = [
  { id: 'posX', normal: new THREE.Vector3(-1, 0, 0), center: new THREE.Vector3(ROOM_SIZE, 0, 0), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(0, 0, 1) },
  { id: 'negX', normal: new THREE.Vector3(1, 0, 0), center: new THREE.Vector3(-ROOM_SIZE, 0, 0), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(0, 0, -1) },
  { id: 'posY', normal: new THREE.Vector3(0, -1, 0), center: new THREE.Vector3(0, ROOM_SIZE, 0), up: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0) },
  { id: 'negY', normal: new THREE.Vector3(0, 1, 0), center: new THREE.Vector3(0, -ROOM_SIZE, 0), up: new THREE.Vector3(0, 0, 1), right: new THREE.Vector3(1, 0, 0) },
  { id: 'posZ', normal: new THREE.Vector3(0, 0, -1), center: new THREE.Vector3(0, 0, ROOM_SIZE), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(-1, 0, 0) },
  { id: 'negZ', normal: new THREE.Vector3(0, 0, 1), center: new THREE.Vector3(0, 0, -ROOM_SIZE), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(1, 0, 0) }
]

export class Chamber {
  constructor({ envMap, physicsWorld }) {
    this.group = new THREE.Group()
    this.walls = []

    for (const def of WALL_DEFS) {
      const material = createDeformableWallMaterial({ envMap })
      const geometry = new THREE.PlaneGeometry(ROOM_SIZE * 2, ROOM_SIZE * 2, 96, 96)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.copy(def.center)
      mesh.lookAt(def.center.clone().add(def.normal))
      mesh.receiveShadow = true
      this.group.add(mesh)

      // cannon Plane 默认法线为 +z，需要用四元数把 +z 转到 def.normal
      const body = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: physicsWorld.wallMaterial })
      const threeQuat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        def.normal
      )
      body.quaternion.set(threeQuat.x, threeQuat.y, threeQuat.z, threeQuat.w)
      body.position.set(def.center.x, def.center.y, def.center.z)
      body.userData = { wallId: def.id }
      physicsWorld.addBody(body)

      this.walls.push({ def, mesh, material, body })
    }
  }

  /** 世界坐标碰撞点 -> 命中墙体 + 该墙体局部 UV(0~1)，用于在损伤贴图上定位笔刷 */
  findWallAndUV(worldPoint, wallId) {
    const wall = this.walls.find((w) => w.def.id === wallId)
    if (!wall) return null
    const rel = worldPoint.clone().sub(wall.def.center)
    const u = rel.dot(wall.def.right) / (ROOM_SIZE * 2) + 0.5
    const v = rel.dot(wall.def.up) / (ROOM_SIZE * 2) + 0.5
    return { wall, u: THREE.MathUtils.clamp(u, 0, 1), v: THREE.MathUtils.clamp(v, 0, 1) }
  }
}
