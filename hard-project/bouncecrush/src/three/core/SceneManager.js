import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export class SceneManager {
  constructor(container) {
    this.container = container
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x05070a)
    this.scene.fog = new THREE.FogExp2(0x05070a, 0.018)

    this.camera = new THREE.PerspectiveCamera(
      52,
      container.clientWidth / container.clientHeight,
      0.1,
      200
    )
    this.camera.position.set(14, 10, 16)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(this.renderer.domElement)

    // PMREM 环境贴图：驱动金属材质的镜面反射与各向异性高光基底
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer)
    this.envMap = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environment = this.envMap

    this._setupLights()

    window.addEventListener('resize', () => this.onResize())
  }

  _setupLights() {
    const key = new THREE.DirectionalLight(0xdfe9ff, 2.2)
    key.position.set(10, 16, 8)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.left = -14
    key.shadow.camera.right = 14
    key.shadow.camera.top = 14
    key.shadow.camera.bottom = -14
    this.scene.add(key)

    const rim = new THREE.PointLight(0x00e5c3, 6, 40, 2)
    rim.position.set(-8, -4, -8)
    this.scene.add(rim)

    const fill = new THREE.AmbientLight(0x2a3038, 0.6)
    this.scene.add(fill)
  }

  onResize() {
    const { clientWidth: w, clientHeight: h } = this.container
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.onResizeExtra?.(w, h)
  }
}
