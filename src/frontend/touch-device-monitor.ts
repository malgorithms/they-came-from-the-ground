import tweakables from './tweakables'
import {Vector2} from './types'
import {vec} from './utils'

type TouchIdentifier = number

enum ScreenSide {
  Left = 'Left',
  Right = 'Right',
}
type TouchDetail = {
  screenX: number
  screenY: number
  identifier: TouchIdentifier
  whenNoted: number
}
type TouchMoveDelta = {
  v: Vector2
  ms: number
  dist: number
  normalizedDir: Vector2
  vAsScreenFrac: Vector2
  newPos: Vector2
}

type ActiveTouchList = {[k: TouchIdentifier]: TouchDetail}

interface TouchDeviceState {
  liveTapCount: number
  touches: ActiveTouchList
}

class TouchDeviceMonitor {
  private currState: TouchDeviceState
  private prevState: TouchDeviceState
  private touchStartStates: ActiveTouchList = {}

  constructor() {
    this.currState = {liveTapCount: 0, touches: {}}
    this.prevState = {liveTapCount: 0, touches: {}}
    window.addEventListener('touchstart', (e: Event) => this.touchStart(e as TouchEvent))
    window.addEventListener('touchend', (e: Event) => this.touchEnd(e as TouchEvent))
    window.addEventListener('touchmove', (e: Event) => this.touchMove(e as TouchEvent))
  }
  private get screenDiagonalLen() {
    const w = window.screen.width
    const h = window.screen.height
    return Math.sqrt(w * w + h * h)
  }
  private getScreenSide(t: TouchDetail): ScreenSide {
    return t.screenX < window.screen.width / 2 ? ScreenSide.Left : ScreenSide.Right
  }
  private makeTouchDetail(t: Touch): TouchDetail {
    return {
      whenNoted: Date.now(),
      screenX: t.screenX,
      screenY: t.screenY,
      identifier: t.identifier,
    }
  }
  private touchStart(e: TouchEvent) {
    console.log(`touchStart`, e)
    this.currState.liveTapCount++
    for (const t of e.changedTouches) {
      this.currState.touches[t.identifier] = this.makeTouchDetail(t)
      this.touchStartStates[t.identifier] ||= this.makeTouchDetail(t)
    }
  }
  private touchEnd(e: TouchEvent) {
    console.log(`touchEnd`, e)
    this.currState.liveTapCount--
    for (const t of e.changedTouches) {
      delete this.currState.touches[t.identifier]
      this.touchStartStates[t.identifier] ||= this.makeTouchDetail(t)
    }
  }
  private touchMove(e: TouchEvent) {
    //console.log(`touchMove`, e)
    for (const t of e.changedTouches) {
      this.currState.touches[t.identifier] = this.makeTouchDetail(t)
      this.touchStartStates[t.identifier] ||= this.makeTouchDetail(t)
    }
  }
  public wasScreenJustTapped() {
    return this.currState.liveTapCount < this.prevState.liveTapCount
  }

  private positionDelta(t1: TouchDetail, t2: TouchDetail) {
    const ms = t2.whenNoted - t1.whenNoted
    const x = t2.screenX - t1.screenX
    const y = -(t2.screenY - t1.screenY)
    const v = {x: x, y: y}
    const dist = vec.len(v)
    const fracScreenLen = dist / this.screenDiagonalLen
    const normalizedDir = vec.normalized(v)
    const vAsScreenFrac = vec.scale(normalizedDir, fracScreenLen)
    const newPos = {x: t2.screenX, y: t2.screenY}
    return {v, ms, dist, normalizedDir, vAsScreenFrac, newPos}
  }

  /**
   * has the player pulled back to release (in effect, are they currently dragging,
   * and if so, which dir)
   */
  /*
  public isPulledBack(): TouchMoveDelta | false {
    const tt = tweakables.touch
    if (this.currState.liveTapCount >= 1 && this.currState.liveTapCount === this.prevState.liveTapCount) {
      for (const t of Object.values(this.currState.touches)) {
        if (this.prevState.touches[t.identifier]) {
          const start = this.touchStartStates[t.identifier]
          const delta = this.positionDelta(start, t)
          if (delta.ms <= tt.flickMaxMs && delta.ms >= tt.flickMinMs && delta.dist > tt.flickMinDistPx * tt.flickMinDistPx) {
            return delta
          }
        }
      }
    }
    return false
  }*/

  public anyDragMovement(screenSide: ScreenSide): TouchMoveDelta | false {
    const deltas: TouchMoveDelta[] = []
    for (const curr of Object.values(this.currState.touches)) {
      if (this.getScreenSide(curr) === screenSide) {
        const start = this.touchStartStates[curr.identifier]
        const delta = this.positionDelta(start, curr)
        deltas.push(delta)
      }
    }
    deltas.sort((d1, d2) => Math.abs(d2.dist) - Math.abs(d1.dist))
    return deltas[0] ?? false
  }

  public anyTap(screenSide: ScreenSide): TouchMoveDelta | false {
    const tt = tweakables.touch
    if (this.currState.liveTapCount < this.prevState.liveTapCount) {
      // ok, so a touch did disappear...let's see if it was a tap
      for (const t of Object.values(this.prevState.touches)) {
        if (this.getScreenSide(t) === screenSide) {
          if (!this.currState.touches[t.identifier]) {
            const start = this.touchStartStates[t.identifier]
            const delta = this.positionDelta(start, t)
            if (delta.ms <= tt.tapMaxDist && delta.dist < tt.tapMaxDist) {
              return delta
            }
          }
        }
      }
    }
    return false
  }

  /**
   * this is how the player does a dash or jump
   * returns the the direction they are dashing or jumping, with magnitude retained
   */
  public didPlayerReleasePullback(): TouchMoveDelta | false {
    const tt = tweakables.touch
    if (this.currState.liveTapCount < this.prevState.liveTapCount) {
      // ok, so a touch did disappear...let's find
      for (const t of Object.values(this.prevState.touches)) {
        if (!this.currState.touches[t.identifier]) {
          const start = this.touchStartStates[t.identifier]
          const delta = this.positionDelta(start, t)
          if (delta.ms <= tt.flickMaxMs && delta.ms >= tt.flickMinMs && delta.dist > tt.flickMinDistPx) {
            return delta
          }
        }
      }
    }
    return false
  }

  public update() {
    this.prevState = {liveTapCount: this.currState.liveTapCount, touches: {}}
    this.prevState.touches = Object.assign({}, this.currState.touches)
  }
}
export {TouchDeviceMonitor, TouchMoveDelta, ScreenSide}
