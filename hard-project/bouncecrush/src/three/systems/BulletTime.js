/**
 * Bullet Time 控制器：撞击瞬间把时间缩放骤降到 minScale，
 * 保持 holdDuration（真实时间，不受缩放影响）后用 easeOutCubic 缓升回 1。
 * update() 每帧调用，返回当前 timeScale，用于同时缩放：
 *   - 物理步进 dt
 *   - 动画/相机 dt
 * 从而实现物理与渲染统一的"子弹时间"效果。
 */
export class BulletTime {
  constructor({ minScale = 0.12, holdDuration = 0.12, recoverDuration = 0.6 } = {}) {
    this.minScale = minScale
    this.holdDuration = holdDuration
    this.recoverDuration = recoverDuration

    this.active = false
    this.timer = 0 // 真实时间计时
    this.scale = 1
  }

  trigger(intensity = 1) {
    // intensity 越大（撞击能量越高），慢动作压得越低，停留更久
    this.active = true
    this.timer = 0
    this._minScaleThisHit = Math.max(this.minScale, 1 - intensity)
    this._holdThisHit = this.holdDuration * THREE_clamp01(intensity)
  }

  /** @param {number} realDt 真实时间增量（未缩放） */
  update(realDt) {
    if (!this.active) return this.scale

    this.timer += realDt
    const hold = this._holdThisHit ?? this.holdDuration
    const total = hold + this.recoverDuration

    if (this.timer <= hold) {
      this.scale = this._minScaleThisHit ?? this.minScale
    } else if (this.timer <= total) {
      const t = (this.timer - hold) / this.recoverDuration
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      this.scale = (this._minScaleThisHit ?? this.minScale) + eased * (1 - (this._minScaleThisHit ?? this.minScale))
    } else {
      this.scale = 1
      this.active = false
    }
    return this.scale
  }
}

function THREE_clamp01(v) {
  return Math.min(1, Math.max(0.3, v))
}
