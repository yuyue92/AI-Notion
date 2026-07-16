<script setup>
import { onMounted, onBeforeUnmount, ref, shallowRef } from 'vue'
import * as THREE from 'three'
import { SceneManager } from '../three/core/SceneManager.js'
import { Postprocessing } from '../three/core/Postprocessing.js'
import { PhysicsWorld } from '../three/physics/PhysicsWorld.js'
import { Ball } from '../three/objects/Ball.js'
import { Chamber } from '../three/objects/Chamber.js'
import { LaunchController } from '../three/interaction/LaunchController.js'
import { ImpactSystem } from '../three/systems/ImpactSystem.js'
import { BulletTime } from '../three/systems/BulletTime.js'

const canvasHost = ref(null)
const hud = shallowRef({ speed: 0, impacts: 0, lastEnergy: 0, bulletTime: false })

let raf = 0
let disposed = false

onMounted(() => {
  const host = canvasHost.value
  const sceneManager = new SceneManager(host)
  const { scene, camera, renderer, envMap } = sceneManager

  const physicsWorld = new PhysicsWorld()

  const ball = new Ball(envMap)
  ball.setMaterial(physicsWorld.ballMaterial)
  scene.add(ball.mesh)
  physicsWorld.addBody(ball.body)

  const chamber = new Chamber({ envMap, physicsWorld })
  scene.add(chamber.group)

  const bulletTime = new BulletTime({ minScale: 0.1, holdDuration: 0.1, recoverDuration: 0.55 })

  const post = new Postprocessing({
    renderer,
    scene,
    camera,
    width: host.clientWidth,
    height: host.clientHeight
  })
  sceneManager.onResizeExtra = (w, h) => post.setSize(w, h)

  const impactSystem = new ImpactSystem({
    ball,
    chamber,
    bulletTime,
    onImpact: (intensity) => {
      post.bloomPass.strength = 0.9 + intensity * 1.8
      hud.value = { ...hud.value, impacts: hud.value.impacts + 1, lastEnergy: intensity, bulletTime: true }
    }
  })

  const launchController = new LaunchController({
    camera,
    domElement: renderer.domElement,
    ball,
    scene,
    onLaunch: (direction, speed) => ball.launch(direction, speed)
  })

  const clock = new THREE.Clock()

  function animate() {
    if (disposed) return
    raf = requestAnimationFrame(animate)

    const realDt = Math.min(clock.getDelta(), 1 / 30)
    const timeScale = bulletTime.update(realDt)
    const simDt = realDt * timeScale

    physicsWorld.step(simDt)
    ball.sync()
    impactSystem.update(realDt) // 损伤贴图衰减不受子弹时间影响，保持真实感

    post.updateVelocityBlur(ball.mesh.position, camera, ball.speed)
    post.setBulletTimeAmount(1 - timeScale)

    // 相机绕舱体缓慢环绕，兼顾"工业监控视角"与展示球体轨迹
    const t = performance.now() * 0.00004
    camera.position.x = Math.sin(t) * 20
    camera.position.z = Math.cos(t) * 20
    camera.position.y = 9 + Math.sin(t * 1.3) * 2
    camera.lookAt(0, 0, 0)

    hud.value = {
      ...hud.value,
      speed: ball.body.velocity.length(),
      bulletTime: bulletTime.active
    }

    post.render()
  }
  animate()

  onBeforeUnmount(() => {
    disposed = true
    cancelAnimationFrame(raf)
    launchController.dispose()
    renderer.dispose()
    host.removeChild(renderer.domElement)
  })
})
</script>

<template>
  <div class="bc-root">
    <div ref="canvasHost" class="bc-canvas-host"></div>

    <div class="bc-hud">
      <header class="bc-header">
        <div class="bc-title">
          <span class="bc-title-main">BOUNCECRUSH</span>
          <span class="bc-title-sub">合金动能测试舱 // ALLOY KINETIC TEST CHAMBER</span>
        </div>
        <div class="bc-status" :class="{ active: hud.bulletTime }">
          <span class="dot"></span>
          {{ hud.bulletTime ? 'BULLET TIME' : 'STANDBY' }}
        </div>
      </header>

      <div class="bc-panel bc-panel--left">
        <div class="bc-row"><span class="k">SPEED</span><span class="v">{{ hud.speed.toFixed(2) }} m/s</span></div>
        <div class="bc-row"><span class="k">IMPACTS</span><span class="v">{{ hud.impacts.toString().padStart(3, '0') }}</span></div>
        <div class="bc-row"><span class="k">LAST Δv</span><span class="v">{{ (hud.lastEnergy * 100).toFixed(0) }}%</span></div>
      </div>

      <div class="bc-panel bc-panel--hint">
        <span class="k">拖拽鼠标拉弓瞄准 · 松开发射</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bc-root {
  position: relative;
  width: 100vw;
  height: 100vh;
}
.bc-canvas-host {
  width: 100%;
  height: 100%;
}
.bc-canvas-host :deep(canvas) {
  display: block;
  cursor: crosshair;
}

.bc-hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  padding: 22px 28px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.bc-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.bc-title-main {
  font-family: var(--bc-font-display);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 4px;
  color: var(--bc-text);
  display: block;
}
.bc-title-sub {
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--bc-text-dim);
}

.bc-status {
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--bc-text-dim);
  background: var(--bc-panel);
  border: 1px solid var(--bc-panel-line);
  padding: 8px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.bc-status .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--bc-metal-light);
}
.bc-status.active {
  color: var(--bc-energy);
  border-color: var(--bc-energy);
}
.bc-status.active .dot {
  background: var(--bc-energy);
  box-shadow: 0 0 8px var(--bc-energy);
}

.bc-panel {
  background: var(--bc-panel);
  border: 1px solid var(--bc-panel-line);
  padding: 14px 18px;
  width: fit-content;
}
.bc-panel--left { align-self: flex-start; }
.bc-panel--hint {
  align-self: center;
  color: var(--bc-text-dim);
  font-size: 12px;
  letter-spacing: 1px;
}

.bc-row {
  display: flex;
  justify-content: space-between;
  gap: 22px;
  font-size: 12px;
  padding: 3px 0;
}
.bc-row .k { color: var(--bc-text-dim); letter-spacing: 1px; }
.bc-row .v { color: var(--bc-energy); font-weight: 700; }
</style>
