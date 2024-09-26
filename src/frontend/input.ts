import {Game} from './game'
import {GamepadConnectSummary, GamepadMonitor, TriggerName} from './gamepad-monitor'
import {KeyboardMonitor} from './keyboard-monitor'
import {MenuOwnership} from './menu'
import {PlayerSpecies} from './player'
import {ScreenSide, TouchDeviceMonitor, TouchMoveDelta} from './touch-device-monitor'
import tweakables from './tweakables'
import {MenuSelectResult, PlayerSide, Vector2} from './types'
import {vec} from './utils'

class Input {
  private pads = new GamepadMonitor()
  private keyboard = new KeyboardMonitor()
  private touch = new TouchDeviceMonitor()
  private game: Game
  private _isPlayingWithTouch = false

  public constructor(game: Game) {
    this.game = game
  }
  public updateInputStates(): void {
    this.keyboard.update()
    this.pads.update()
    this.touch.update()
  }
  public get isPlayingWithTouch() {
    return this._isPlayingWithTouch
  }
  public isKeyboardConnected(): boolean {
    return true // for now
  }

  private getKeyboardSet(pI: PlayerSide) {
    const isTwoPlayerGame = this.game.playerRight.species === PlayerSpecies.Human
    const kSet = isTwoPlayerGame ? tweakables.twoPlayerControls : tweakables.onePlayerControls
    if (pI === PlayerSide.Left) return kSet.p0
    else return kSet.p1
  }
  public swapGamepadSides() {
    this.pads.swapSides()
  }
  public wasKeyboardPauseHit(): boolean {
    return this.keyboard.anyKeysJustPushed(['Enter', 'Escape'])
  }
  public checkGamepadPauseHit(): null | PlayerSide {
    for (const pI of [PlayerSide.Left, PlayerSide.Right]) {
      if (this.pads.anyButtonsPushedBy(pI, ['start'])) return pI
    }
    return null
  }
  public wasMenuSelectJustPushed(owner: MenuOwnership): MenuSelectResult {
    const res: MenuSelectResult = {
      selected: false,
      byPlayerSide: null,
      byKeyboard: false,
    }
    if (this.touch.wasScreenJustTapped()) {
      res.selected = true
      res.byKeyboard = true
    } else if (this.keyboard.anyKeysJustPushed(['Enter', 'Space'])) {
      res.selected = true
      res.byKeyboard = true
    } else {
      const toCheck = owner ? [owner] : [PlayerSide.Left, PlayerSide.Right]
      for (const playerSide of toCheck) {
        if (this.pads.anyButtonsPushedBy(playerSide, ['psX'])) {
          res.selected = true
          res.byPlayerSide = playerSide
        }
      }
    }
    return res
  }

  public wasMenuDownJustPushed(owner: MenuOwnership): boolean {
    if (this.keyboard.anyKeysJustPushed(['KeyS', 'KeyK', 'ArrowDown'])) return true
    if (owner) {
      return this.pads.anyButtonsPushedBy(owner, ['dPadDown']) || this.pads.wasThumbstickPushedDownBy(owner, 'left')
    } else {
      return this.pads.anyButtonsPushedByAnyone(['dPadDown']) || this.pads.wasThumbstickPushedDown('left')
    }
  }
  public wasMenuUpJustPushed(owner: MenuOwnership): boolean {
    if (this.keyboard.anyKeysJustPushed(['KeyW', 'KeyI', 'ArrowUp'])) return true
    if (owner) {
      return this.pads.anyButtonsPushedBy(owner, ['dPadUp']) || this.pads.wasThumbstickPushedUpBy(owner, 'left')
    } else {
      return this.pads.anyButtonsPushedByAnyone(['dPadUp']) || this.pads.wasThumbstickPushedUp('left')
    }
  }
  public wasMenuLeftJustPushed(owner: MenuOwnership): boolean {
    if (this.keyboard.anyKeysJustPushed(['KeyA', 'KeyJ', 'ArrowLeft'])) return true
    if (owner) {
      return this.pads.anyButtonsPushedBy(owner, ['dPadLeft']) || this.pads.wasThumbstickPushedLeftBy(owner, 'left')
    } else {
      return this.pads.anyButtonsPushedByAnyone(['dPadLeft']) || this.pads.wasThumbstickPushedLeft('left')
    }
  }
  public wasMenuRightJustPushed(owner: MenuOwnership): boolean {
    if (this.keyboard.anyKeysJustPushed(['KeyD', 'KeyL', 'ArrowRight'])) return true
    if (owner) {
      return this.pads.anyButtonsPushedBy(owner, ['dPadRight']) || this.pads.wasThumbstickPushedRightBy(owner, 'left')
    } else {
      return this.pads.anyButtonsPushedByAnyone(['dPadRight']) || this.pads.wasThumbstickPushedRight('left')
    }
  }
  public wasMenuExitJustPushed(owner: MenuOwnership): boolean {
    if (this.keyboard.anyKeysJustPushed(['Escape'])) return true
    if (owner) return this.pads.anyButtonsPushedBy(owner, ['psO', 'start'])
    else return this.pads.anyButtonsPushedByAnyone(['psO', 'start'])
  }
  public wasPostgameProceedJustPushed(): boolean {
    return this.pads.anyButtonsPushedByAnyone(['psO', 'psX', 'start']) || this.wasMenuSelectJustPushed(null).selected
  }
  public wasPlayerJustDisconnectedFromGamepad(playerSide: PlayerSide) {
    return this.pads.wasPlayerJustDisconnected(playerSide)
  }
  public wasPlayerJustConnectedToGamepad(playerSide: PlayerSide) {
    return this.pads.wasPlayerJustConnected(playerSide)
  }
  public doesPlayerHaveGamepad(playerSide: PlayerSide) {
    return this.pads.doesPlayerHaveGamepad(playerSide)
  }
  public gamepadConnectSummary(): GamepadConnectSummary {
    return {
      left: this.pads.getStateFromPlayer(PlayerSide.Left),
      right: this.pads.getStateFromPlayer(PlayerSide.Right),
    }
  }
  public wasDashJustPushed(pI: PlayerSide): boolean {
    const set = this.getKeyboardSet(pI)
    return this.keyboard.anyKeyDown(set.dash) || this.pads.anyButtonDown(pI, ['psSquare'])
  }
  public isJumpPressed(pI: PlayerSide): boolean {
    const set = this.getKeyboardSet(pI)
    return this.keyboard.anyKeyDown(set.jump) || this.pads.anyButtonDown(pI, ['psX'])
  }
  public didJumpViaTouch(): boolean {
    const res = !!this.touch.anyTap(ScreenSide.Right)
    this._isPlayingWithTouch ||= res
    return res
  }
  public getTouchThumbstickX(): number {
    const t = this.touch.anyDragMovement(ScreenSide.Left)
    if (!t) return 0
    else {
      this._isPlayingWithTouch = true
      const x = t.vAsScreenFrac.x * tweakables.touch.xMoveMult
      return Math.max(-1, Math.min(1, x))
    }
  }
  /*
  public isPulledBackTouch(): TouchMoveDelta | false {
    const res = this.touch.isPulledBack()
    if (res) this._isPlayingWithTouch = true
    return res
  }*/
  /**
   * returns 0 if trigger near 0, within tolerance
   * defined in tweakables. otherwise returns value up to 1
   */
  public getTrigger(playerSide: PlayerSide, triggerName: TriggerName): number {
    const x = this.pads.getTrigger(playerSide, triggerName)
    if (x < tweakables.input.triggerTolerance) return 0
    return x
  }

  /**
   * returns 0 if thumbstick near the middle, within tolerance
   * defined in tweakables. otherwise returns value
   * @param playerSide - playerSide
   */
  public getLeftThumbStickX(playerSide: PlayerSide): number {
    const x = this.pads.getThumbStick(playerSide, 'left').x
    if (Math.abs(x) < tweakables.thumbstickCenterTolerance) return 0
    else return x
  }
  /**
   * returns 0 if thumbstick near the middle, within tolerance
   * defined in tweakables. otherwise returns value
   * @param playerSide - playerSide
   */
  public getLeftThumbStickY(playerSide: PlayerSide): number {
    const y = -this.pads.getThumbStick(playerSide, 'left').y
    if (Math.abs(y) < tweakables.thumbstickCenterTolerance) return 0
    else return y
  }
  public getXyDirectional(pS: PlayerSide): Vector2 {
    const res: Vector2 = {
      x: this.getLeftThumbStickX(pS),
      y: this.getLeftThumbStickY(pS),
    }
    console.log(res)
    if (!res.x && !res.y) {
      if (this.isLeftPressed(pS) && !this.isRightPressed(pS)) res.x = -1
      else if (this.isRightPressed(pS) && !this.isLeftPressed(pS)) res.x = 1
      if (this.isJumpPressed(pS)) res.y = 1
      // dive bomb if nothing pushed
      if (!res.x && !res.y) res.y = -1
    }
    return res
  }

  public isLeftPressed(pI: PlayerSide): boolean {
    const set = this.getKeyboardSet(pI)
    const keyboardLeft = this.keyboard.anyKeyDown(set.left) && !this.keyboard.anyKeyDown(set.right)
    const dPadLeft = this.pads.anyButtonDown(pI, ['dPadLeft'])
    return keyboardLeft || dPadLeft
  }
  public isRightPressed(pI: PlayerSide): boolean {
    const set = this.getKeyboardSet(pI)
    const keyboardRight = this.keyboard.anyKeyDown(set.right) && !this.keyboard.anyKeyDown(set.left)
    const dPadRight = this.pads.anyButtonDown(pI, ['dPadRight'])
    return keyboardRight || dPadRight
  }
  public isGrowPressed(pI: PlayerSide): boolean {
    const set = this.getKeyboardSet(pI)
    return this.keyboard.anyKeyDown(set.grow)
  }
  public isShrinkPressed(pI: PlayerSide): boolean {
    const set = this.getKeyboardSet(pI)
    return this.keyboard.anyKeyDown(set.shrink)
  }
  public wasDebugKeyJustPushed(): boolean {
    return this.keyboard.anyKeysJustPushed(['KeyG'])
  }
}

export {Input}
