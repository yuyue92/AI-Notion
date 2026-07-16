import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

// 方向性速度模糊：沿"球体屏幕空间运动方向"做多次采样叠加，
// 强度由 uStrength 驱动（由球体世界速度大小映射得到）。
// 撞墙瞬间配合 Bullet Time 把 uStrength 压到 0，形成"速度骤停"的强反差。
const VelocityBlurShader = {
  uniforms: {
    tDiffuse: { value: null },
    uDir: { value: new THREE.Vector2(0, 0) },
    uStrength: { value: 0 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uDir;
    uniform float uStrength;
    varying vec2 vUv;
    const int SAMPLES = 10;
    void main() {
      vec4 color = vec4(0.0);
      float total = 0.0;
      for (int i = 0; i < SAMPLES; i++) {
        float t = (float(i) / float(SAMPLES - 1)) - 0.5;
        float w = 1.0 - abs(t) * 1.2;
        w = max(w, 0.0);
        vec2 offset = uDir * t * uStrength;
        color += texture2D(tDiffuse, vUv + offset) * w;
        total += w;
      }
      gl_FragColor = color / max(total, 0.0001);
    }
  `
}

// 子弹时间暗角 + 轻微冷色调偏移，强化"时间被拉慢"的知觉
const BulletTimeVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uAmount: { value: 0 } // 0 = 正常, 1 = 完全子弹时间
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAmount;
    varying vec2 vUv;
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec2 centered = vUv - 0.5;
      float vig = smoothstep(0.9, 0.25, length(centered) * (1.0 + uAmount * 0.6));
      vec3 cool = mix(tex.rgb, tex.rgb * vec3(0.85, 1.0, 1.08), uAmount);
      gl_FragColor = vec4(cool * mix(1.0, vig, uAmount * 0.8), tex.a);
    }
  `
}

export class Postprocessing {
  constructor({ renderer, scene, camera, width, height }) {
    this.composer = new EffectComposer(renderer)
    this.composer.addPass(new RenderPass(scene, camera))

    // SSAO：强化墙面凹陷形变的接触阴影，让"被砸出的坑"更有实体感
    this.ssaoPass = new SSAOPass(scene, camera, width, height)
    this.ssaoPass.kernelRadius = 0.6
    this.ssaoPass.minDistance = 0.002
    this.ssaoPass.maxDistance = 0.15
    this.composer.addPass(this.ssaoPass)

    // Bloom：让墙面损伤贴图里的发光通道形成"能量扩散"辉光
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.9, 0.6, 0.15)
    this.composer.addPass(this.bloomPass)

    this.velocityBlurPass = new ShaderPass(VelocityBlurShader)
    this.composer.addPass(this.velocityBlurPass)

    this.bulletTimePass = new ShaderPass(BulletTimeVignetteShader)
    this.composer.addPass(this.bulletTimePass)

    this.composer.addPass(new OutputPass())

    this._prevScreenPos = new THREE.Vector2()
    this._hasPrev = false
  }

  setSize(width, height) {
    this.composer.setSize(width, height)
    this.ssaoPass.setSize(width, height)
  }

  /** 每帧根据球体屏幕空间位移更新动态模糊方向与强度 */
  updateVelocityBlur(ballWorldPos, camera, speedWorld) {
    const p = ballWorldPos.clone().project(camera)
    const screen = new THREE.Vector2(p.x, p.y)

    if (this._hasPrev) {
      const delta = screen.clone().sub(this._prevScreenPos)
      const len = delta.length()
      if (len > 0.0001) {
        this.velocityBlurPass.uniforms.uDir.value.copy(delta.normalize())
      }
      const strength = THREE.MathUtils.clamp(speedWorld * 0.9, 0, 0.035)
      this.velocityBlurPass.uniforms.uStrength.value = strength
    }
    this._prevScreenPos.copy(screen)
    this._hasPrev = true
  }

  setBulletTimeAmount(amount) {
    this.bulletTimePass.uniforms.uAmount.value = amount
  }

  render() {
    this.composer.render()
  }
}
