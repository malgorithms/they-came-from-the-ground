import {AiBase, AiThinkArg} from './base'

const PREDICT_SEC = 0.4 // seconds in the future green will see
const REACTION_TIME_MS = 300 // I can't change wiggle direction faster than this

/**
 *  This AI serves as a good simple example how to write a TCFTG player.
 *  It's not too bright but the code is simple and clean.
 */

class GreenAi extends AiBase {
  constructor() {
    super()
  }

  /**
   * `think` is the function you must implement in your AI. it takes a general
   * object `o` that has a bunch of game state. Your think function is called many
   * times per second. It doesn't return anything. Instead, you send movement
   * commands such as `this.jumpIfPossible(o)` or `this.moveLeft(o)`
   * @param o
   */

  public think(o: AiThinkArg): void {
    // I just jump sometimes
    if (o.accumulatedPointSeconds < 1) this.jumpIfPossible(o)

    // And hang out at 90% size
    this.goToSize(o, 0.9)

    // I try not to move otherwise the first second of a point
    if (o.accumulatedPointSeconds < 1) return

    // Ok, now I need a point of interest. First thing I look for is
    // a ball entering my jump range. If there isn't one coming, even worse,
    // maybe it is on its way to hit on my side.
    const target = this.getNextBallEnteringMyJumpRange(o) || this.getNextBallHittingOnMySide(o)

    if (!target) {
      this.moveRationally(o, 0.1) // let's just move right at 10% speed
      this.jumpIfPossible(o)
    } else {
      // I'll try to stay a bit to the right of the position
      target.pos.x += -0.16 * o.me.physics.diameter

      if (target.time < PREDICT_SEC) {
        // Let's add some randomness for stupidity, but have that randomness a function of the
        // current time, so it's not flickering all over the place.
        const err = Math.sin(o.gameTime.totalGameTime.totalSeconds)
        target.pos.x += (o.balls[0].physics.diameter * err) / 1.5
        target.pos.y += (o.balls[0].physics.diameter * err) / 1.5

        // At this point we know we have a state to watch
        // keep me on my side of net
        if (this.amIAboveTheNet(o) || this.amIOnTheWrongSide(o)) {
          this.jumpIfPossible(o)
          this.moveRight(o)
        } else {
          // the base class has this helper that uses a rational move speed to
          // try to get to a spot by a certain time.
          this.tryToGetToX(o, target.pos.x, target.time, REACTION_TIME_MS)
        }

        // Remaining question is...do I jump?
        const seconds = Math.floor(o.gameTime.totalGameTime.totalSeconds)
        const isOddSecond = seconds % 2
        const timeErr = 0.3 * Math.sin(o.accumulatedPointSeconds)
        const timeTillJump = o.me.getTimeToJumpToHeight(o.gameGravity.y, target.pos.y) + timeErr
        if (target.time < timeTillJump && isOddSecond) this.jumpIfPossible(o)
      }
    }
  }
}

export {GreenAi as _GreenAi}
