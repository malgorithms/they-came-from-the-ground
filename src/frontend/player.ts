import {AiBase} from './ai/base'
import {CircularObject} from './circular-object'
import {TextureName} from './content-load-list'
import {RectangularObstacle} from './rectangular-obstacle'
import tweakables from './tweakables'
import {NewPlayerArg, PlayerSide, PlayerSpecies, Vector2} from './types'
import {vec} from './utils'

class Player {
  public readonly xSpringConstant: number
  public readonly species: PlayerSpecies
  public readonly playerSide: PlayerSide
  public readonly ai: AiBase | null
  public physics: CircularObject
  public targetXVel: number // desired speed, accelerates towards
  private _jumpCount = 0
  private _isInJumpPosition = false
  private _isInDashPosition = false
  private _isDashing = false
  private maxVelAtSmallest: Vector2
  private maxVelAtLargest: Vector2

  constructor(o: NewPlayerArg) {
    this.physics = new CircularObject({
      center: vec.zero(),
      vel: vec.zero(),
      diameter: o.diameter,
      density: o.density,
      orientation: 0,
      angularVel: 0,
      gravityMultiplier: o.gravityMultiplier,
      canSpin: false,
      spinElasticityOffFrictionPoints: 0,
      bumpOffFrictionPoints: 0,
    })
    this.playerSide = o.playerSide
    this.maxVelAtLargest = o.maxVelAtLargest
    this.maxVelAtSmallest = o.maxVelAtSmallest
    this.targetXVel = o.targetXVel
    this.xSpringConstant = o.xSpringConstant
    this.species = o.species
    this.ai = o.ai
  }
  public get textureName(): TextureName {
    if (this.ai) return this.ai.textureName
    else return this.playerSide === PlayerSide.Left ? 'redPlayer' : 'bluePlayer'
  }
  public get jumpCount() {
    return this._jumpCount
  }
  public get isInJumpPosition() {
    return this._isInJumpPosition
  }
  public setIsInJumpPosition(canJump: boolean) {
    this._isInJumpPosition = canJump
  }
  public get canDashNow() {
    return this._isInDashPosition && !this.isDashing
  }
  public get isDashing() {
    return this._isDashing
  }
  public setIsInDashPosition(canDash: boolean) {
    this._isInDashPosition = canDash
  }
  public deepCopy(): Player {
    const sp = new Player({
      maxVelAtSmallest: vec.copy(this.maxVelAtSmallest),
      maxVelAtLargest: vec.copy(this.maxVelAtLargest),
      diameter: this.physics.diameter,
      density: this.physics.density,
      xSpringConstant: this.xSpringConstant,
      gravityMultiplier: this.physics.gravityMultiplier,
      targetXVel: this.targetXVel,
      species: this.species,
      ai: this.ai,
      playerSide: this.playerSide,
    })
    sp.physics.center = vec.copy(this.physics.center)
    sp.physics.vel = vec.copy(this.physics.vel)
    sp.physics.orientation = this.physics.orientation
    sp.physics.angularVel = this.physics.angularVel
    sp._jumpCount = this._jumpCount
    return sp
  }
  public get jumpSpeed(): number {
    return this.maxVel.y
  }
  public get maxVel(): Vector2 {
    const tP = tweakables.player
    const phys = this.physics
    const sizeFrac = (phys.diameter - tP.minDiameter) / (tP.maxDiameter - tP.minDiameter)
    const x = this.maxVelAtLargest.x + (this.maxVelAtSmallest.x - this.maxVelAtLargest.x) * (1 - sizeFrac)
    const y = this.maxVelAtLargest.y + (this.maxVelAtSmallest.y - this.maxVelAtLargest.y) * (1 - sizeFrac)
    return {x, y}
  }
  public jump(): boolean {
    if (this.isInJumpPosition) {
      this._jumpCount++
      this.physics.vel.y = this.jumpSpeed
      return true
    }
    return false
  }
  public jumpTowards(dir: Vector2): boolean {
    if (this.isInJumpPosition) {
      this._jumpCount++
      this.physics.vel.y = this.jumpSpeed * dir.y
      this.physics.vel.x = this.jumpSpeed * dir.x
      return true
    }
    return false
  }
  public dash(dir: Vector2) {
    console.log('player::dash', this._isDashing, 'can dash=', this.canDashNow)
    if (this.canDashNow) {
      this._isDashing = true
      this.physics.density = 234
      console.log('player::dash - YES')
      this._jumpCount++
      const dirNormalized = vec.normalized(dir)
      const speed = tweakables.player.dashMult * Math.max(this.maxVel.x, this.maxVel.y)
      this.physics.vel.x += dirNormalized.x * speed
      this.physics.vel.y += dirNormalized.y * speed
    }
  }
  public grow(dt: number, vel: number) {
    const tP = tweakables.player
    const phys = this.physics
    phys.diameter += vel * dt
    if (phys.diameter < tP.minDiameter) phys.diameter = tP.minDiameter
    if (phys.diameter > tP.maxDiameter) phys.diameter = tP.maxDiameter
  }
  public moveRight() {
    this.targetXVel = this.maxVel.x
  }
  public moveLeft() {
    this.targetXVel = -this.maxVel.x
  }
  public moveRationally(fractionOfMaxVelocity: number) {
    this.targetXVel = this.maxVel.x * fractionOfMaxVelocity
  }
  public stepPosition(dt: number) {
    this.physics.center = vec.add(this.physics.center, vec.scale(this.physics.vel, dt))
  }
  public stepVelocity(dt: number) {
    const idealVx = this.targetXVel
    const difference = idealVx - this.physics.vel.x
    this.physics.vel = vec.add(this.physics.vel, {x: difference * dt * this.xSpringConstant, y: 0})

    // gravity
    this.physics.vel.y += dt * this.physics.gravityY
    if (vec.lenSq(this.physics.vel) < this.maxVel.x) {
      this._isDashing = false
    }
  }
  public isOnHeight(height: number): boolean {
    return this.physics.center.y <= height + tweakables.proximityTolerance
  }
  public isOnPlayer(opponent: Player): boolean {
    // Jump off opponent! Are you serious?! Yes.
    const diff = vec.sub(this.physics.center, opponent.physics.center)
    const distance = vec.len(diff)
    if (distance < this.physics.diameter / 2 + opponent.physics.diameter / 2 + tweakables.proximityTolerance) {
      // Only if above opponent
      if (this.physics.center.y > opponent.physics.center.y) {
        return true
      }
    }
    return false
  }
  public isOnRectangle(obstacle: RectangularObstacle): boolean {
    // top-left corner
    const netTopLeftCorner: Vector2 = {x: obstacle.center.x - obstacle.width / 2, y: obstacle.center.y + obstacle.height / 2}
    const distToNetTopLeft = vec.len(vec.sub(netTopLeftCorner, this.physics.center))

    if (distToNetTopLeft <= this.physics.diameter / 2 + tweakables.proximityTolerance) {
      return true
    }

    // top-right corner
    const netTopRightCorner: Vector2 = {x: obstacle.center.x + obstacle.width / 2, y: obstacle.center.y + obstacle.height / 2}
    const distToNetTopRight = vec.len(vec.sub(netTopRightCorner, this.physics.center))
    if (distToNetTopRight <= this.physics.diameter / 2 + tweakables.proximityTolerance) {
      return true
    }

    // top of it
    if (this.physics.center.x > obstacle.center.x - obstacle.width / 2 && this.physics.center.x < obstacle.center.x + obstacle.width / 2) {
      const jumpHeight = obstacle.center.y + obstacle.height / 2 + this.physics.diameter / 2
      if (this.isOnHeight(jumpHeight)) {
        return true
      }
    }
    return false
  }
  public getMaxJumpHeight(): number {
    return (this.maxVel.y * this.maxVel.y) / (2 * Math.abs(this.physics.gravityY))
  }
  public getTimeToJumpToHeight(height: number): number {
    // y = y0 + v0t + 0.5at^2
    // y = 0 + vt + 0.5gt^2
    // 0.5gt^2 + vt - y = 0
    // (-v +- sqrt(v*v+2yg) ) / (g)
    const g = this.physics.gravityY
    const v = this.maxVel.y
    if (v * v + 2 * height * g < 0) return Infinity
    else {
      const answer1 = (-v + Math.sqrt(v * v + 2 * height * g)) / g
      const answer2 = (-v - Math.sqrt(v * v + 2 * height * g)) / g
      if (answer1 > 0 && answer2 > 0 && answer1 < answer2) return answer1
      else if (answer1 > 0 && answer2 > 0 && answer2 < answer1) return answer2
      else if (answer2 > 0) return answer2
      else if (answer1 > 0) return answer1
      else return Infinity
    }
  }

  /**
   *
   * @returns how long the player will stay in the air on a normal jump
   */
  public getMyJumpTime = () => {
    // x = x0 + v0*t + 0.5at^2
    // 0 = 0 + v0t + 0.5at^2
    // 0 = v0 + 0.5at
    // -v0 = 0.5at
    // -2 * v0 / a = t
    return (-2 * this.jumpSpeed) / this.physics.gravityY
  }
}

export {PlayerSpecies, Player}
