import * as THREE from 'three'

/**
 * 每面墙体拥有一张独立的 "damageMap"（R 通道=凹陷深度，G 通道=发光扩散强度，
 * B 通道=发光生命周期衰减)。碰撞发生时由 ImpactSystem 直接在 CPU Canvas 上以
 * 高斯笔刷叠加绘制，再 texture.needsUpdate = true 上传 GPU。
 *
 * 顶点凹陷：在顶点着色器里沿法线方向按采样到的深度做位移（真正几何形变，
 * 而不是只做视觉法线贴图假凹凸），保证近距离观察/多次撞击叠加时立体感正确。
 * 发光扩散：在片元着色器里叠加到 emissive，形成"能量冲击波"式的扩散光晕。
 */
export function createDeformableWallMaterial({ envMap, baseColor = 0x2a2f36 }) {
  const damageCanvas = document.createElement('canvas')
  damageCanvas.width = 512
  damageCanvas.height = 512
  const ctx = damageCanvas.getContext('2d')
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, 512, 512)

  const damageMap = new THREE.CanvasTexture(damageCanvas)
  damageMap.wrapS = THREE.ClampToEdgeWrapping
  damageMap.wrapT = THREE.ClampToEdgeWrapping

  const material = new THREE.MeshStandardMaterial({
    color: baseColor,
    metalness: 0.85,
    roughness: 0.38,
    envMap,
    envMapIntensity: 0.9,
    emissive: new THREE.Color(0x00e5c3),
    emissiveIntensity: 0
  })
  // 没有挂 map/emissiveMap 时 three.js 不会声明 vUv/uv 相关 varying，
  // 而我们的 onBeforeCompile 注入代码需要用到它们，这里强制打开。
  material.defines = { ...(material.defines || {}), USE_UV: '' }

  material.userData.damageMap = damageMap
  material.userData.damageCanvas = damageCanvas
  material.userData.damageCtx = ctx

  const uniforms = {
    uDamageMap: { value: damageMap },
    uMaxDent: { value: 0.35 } // 单点最大凹陷深度（世界单位）
  }
  material.userData.uniforms = uniforms

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uDamageMap;
        uniform float uMaxDent;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float dentSample = texture2D(uDamageMap, uv).r;
        transformed -= normal * dentSample * uMaxDent;`
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uDamageMap;`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 damage = texture2D(uDamageMap, vUv).rgb;
        // G 通道 = 发光扩散能量，随时间由 ImpactSystem 在 canvas 上做指数衰减
        totalEmissiveRadiance += vec3(0.1, 1.0, 0.9) * damage.g * 2.2;`
      )

    material.userData.shader = shader
  }

  return material
}
