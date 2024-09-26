import {AiBase, AiThinkArg} from './ai/base'
import {Ball} from './ball'
import {Colors} from './color'
import constants from './constants'
import {ContentLoader} from './content-loader'
import {Display} from './display'
import {FuturePrediction, unknownState} from './future-prediction'
import {HistoryManager} from './history-manager'
import {Input} from './input'
import {KapowManager} from './kapow-manager'
import {Menu, MenuAction} from './menu'
import {Player, PlayerSpecies} from './player'
import {SoundManager} from './sound-manager'
import tweakables from './tweakables'
import {ContentLoadMonitor, FutureState, GameState, GameTime, PlayerSide, Vector2} from './types'
import {timeout, vec} from './utils'
import {persistence} from './persistence'
import {ais, aiToName, aiToNickname} from './ai/ai'
import {RectangularObstacle} from './rectangular-obstacle'
import {CircularObject} from './circular-object'

class Game {
  private content: ContentLoader
  private display!: Display
  private input!: Input
  private menu!: Menu
  private history = new HistoryManager()
  private isGamePoint = false
  private scoreLeftPlayer = 0
  private scoreRightPlayer = 0
  private whoseServe = PlayerSide.Left
  private gameState = GameState.PreStart
  private currentGameTime = this.emptyGameTime()
  private futurePredictionList: FuturePrediction[] = []
  private lastFuturePrediction = 0
  private fpsTimer = new Array<number>()
  private players: Map<PlayerSide, Player> = new Map()
  public balls: Ball[] = []
  public net = new RectangularObstacle(tweakables.net)
  public leftWall = new RectangularObstacle(tweakables.leftWall)
  public rightWall = new RectangularObstacle(tweakables.rightWall)
  public invisibleFloor = new RectangularObstacle(tweakables.invisibleFloor)
  public sound!: SoundManager
  public kapow = new KapowManager()

  private accumulatedGamePlayTime = 0 // How much the clock has run this game, in seconds, excluding pauses and between points
  private accumulatedStateSeconds = 0 // Time accumulated since last gamestate change
  private accumulatedPointSeconds = 0 // Accumulated play time this point (persists even if pausing it to go to menu)
  private whenStartedDateTime = Date.now()

  constructor(targetDiv: HTMLElement, contentLoadMonitor: ContentLoadMonitor) {
    this.content = new ContentLoader(contentLoadMonitor)
    this.generatePlayers(null)
    this.generateBalls(2)
    this.resetScores()
    this.init(targetDiv)
  }
  private async init(targetDiv: HTMLElement) {
    this.sound = new SoundManager(this.content)
    this.display = new Display(this, this.content, targetDiv)
    this.menu = new Menu(this.display)
    this.input = new Input(this)
    await this.loadContent()
    this.resetScores()
    this.display.atmosphere.changeSkyForOpponent(this.playerRight, 1)
    this.setGameState(GameState.PreStart)
    this.futurePredictionList = []
    for (let i = 0; i < this.balls.length; i++) {
      this.futurePredictionList.push(new FuturePrediction())
    }
  }
  public player(playerSide: PlayerSide) {
    const p = this.players.get(playerSide)
    if (!p) throw new Error(`Pfff, player could not load`)
    return p
  }
  public get playerLeft(): Player {
    return this.player(PlayerSide.Left)
  }
  private getScore(playerSide: PlayerSide) {
    return playerSide === PlayerSide.Left ? this.scoreLeftPlayer : this.scoreRightPlayer
  }
  public get playerRight(): Player {
    return this.player(PlayerSide.Right)
  }
  private get isTwoPlayerGame(): boolean {
    return this.playerRight.species === PlayerSpecies.Human
  }
  private generateBalls(numBalls: number) {
    this.balls = []
    for (let i = 0; i < numBalls; i++) {
      let ballArg = tweakables.ball.defaultSettings(i)
      if (this.playerRight.ai instanceof ais.Gray) ballArg = tweakables.ball.tennisSettings()
      this.balls.push(new Ball(ballArg))
    }
  }

  private emptyGameTime(): GameTime {
    return {
      totalGameTime: {
        totalMilliseconds: 0,
        totalSeconds: 0,
      },
      elapsedGameTime: {
        totalMilliseconds: 0,
        totalSeconds: 0,
      },
    }
  }

  private generatePlayers(rightPlayerAi: AiBase | null) {
    const pLeftConfig = tweakables.player.defaultSettings(PlayerSide.Left)
    const pRightConfig = tweakables.player.defaultSettings(PlayerSide.Right)
    if (rightPlayerAi) {
      pRightConfig.species = PlayerSpecies.Ai
      pRightConfig.ai = rightPlayerAi
    }
    this.players.set(PlayerSide.Left, new Player(pLeftConfig))
    this.players.set(PlayerSide.Right, new Player(pRightConfig))
  }
  public async run() {
    while (!this.content.isLoaded) {
      await timeout(100)
    }
    this.whenStartedDateTime = Date.now()
    this.display.initialDraw()
    await this.runLoop()
  }
  private updateFps() {
    this.fpsTimer.push(Date.now())
    if (this.fpsTimer.length > tweakables.fpsSampleCount) {
      this.fpsTimer.splice(0, 1)
    }
  }
  private getCurrentFps(): number {
    const len = this.fpsTimer.length
    return len <= 1 ? 0 : 1000 / ((this.fpsTimer[len - 1] - this.fpsTimer[0]) / len)
  }
  private async runLoop() {
    const startTime = Date.now()
    let overshotAdj = 0
    let lastDraw = Date.now()
    let lastTime = Date.now()
    while (this.gameState !== GameState.Exit) {
      this.input.updateInputStates()
      await timeout(constants.gameLoopDelayMs)
      const currTime = Date.now()
      let dt = currTime - lastTime
      if (dt > tweakables.maxDtMs && Date.now() - startTime > 1000) {
        const extra = dt - tweakables.maxDtMs
        console.log(`gameTime adj by -${dt}ms due to browser JS pause`)
        dt = tweakables.maxDtMs
        overshotAdj += extra
      }
      const totalMs = currTime - startTime - overshotAdj
      this.currentGameTime = {
        totalGameTime: {
          totalMilliseconds: totalMs,
          totalSeconds: totalMs / 1000,
        },
        elapsedGameTime: {
          totalMilliseconds: dt,
          totalSeconds: dt / 1000,
        },
      }
      this.update(this.currentGameTime)
      if (Date.now() - lastDraw > tweakables.redrawTargetMs) {
        this.updateFps()
        this.draw(this.currentGameTime)
        lastDraw = Date.now()
      }
      lastTime = currTime
    }
  }

  public getGameState() {
    return this.gameState
  }
  private setGameState(gs: GameState) {
    this.sound.fadeGrowthNoise(PlayerSide.Left)
    this.sound.fadeGrowthNoise(PlayerSide.Right)
    if (gs !== this.gameState) this.accumulatedStateSeconds = 0.0
    this.gameState = gs
    if (gs === GameState.PreAction) {
      this.sound.play('launch', 0.25, 0.5, 0, false)
      this.setUpForServe()
    }
    if (
      gs === GameState.MainMenu ||
      gs === GameState.Paused ||
      gs === GameState.PreExitMessage ||
      gs === GameState.PreExitCredits ||
      gs === GameState.Intro1 ||
      gs === GameState.Intro2 ||
      gs === GameState.Intro3 ||
      gs === GameState.Victory
    ) {
      this.sound.playIfNotPlaying('themeSong', 1.0, 0.0, 0.0, true)
    } else if (gs !== GameState.PreStart) {
      this.sound.stopIfPlaying('themeSong')
    }
    if (gs === GameState.Action && !this.isGamePoint) {
      this.sound.playIfNotPlaying('gamePlayMusic', 0.5, 0.0, 0.0, true)
    } else if (gs === GameState.Paused || gs === GameState.AutoPaused) {
      this.sound.stopIfPlaying('gamePlayMusic')
    }
  }
  private async loadContent() {
    const contentStartTime = Date.now()
    console.log(`Starting to load content`)
    await Promise.all([this.sound.loadContent(), this.display.loadContent()])
    console.log(`Finished loading content ${Date.now() - contentStartTime}ms`)
  }
  private getPlayerNickname(playerSide: PlayerSide): string {
    if (playerSide === PlayerSide.Left) return 'Red'
    if (this.playerRight.species === PlayerSpecies.Human) return 'Blue'
    else if (this.playerRight.ai) {
      return aiToNickname(this.playerRight.ai)
    } else {
      return 'Unknown'
    }
  }

  private draw(gameTime: GameTime): void {
    const dt = gameTime.elapsedGameTime.totalSeconds
    this.kapow.step(dt)

    this.display.draw(
      gameTime,
      this.gameState,
      this.scoreLeftPlayer,
      this.scoreRightPlayer,
      this.futurePredictionList,
      this.kapow,
      this.getCurrentFps(),
      this.input.gamepadConnectSummary(),
    )

    if (this.gameState === GameState.Victory) {
      this.isGamePoint = false
      const seconds = this.accumulatedGamePlayTime
      const minutesInt = Math.floor(seconds / 60.0)
      const secondsRem = seconds - minutesInt * 60
      const time = minutesInt > 0 ? `${minutesInt} min ${secondsRem.toFixed(3)} sec` : `${seconds.toFixed(3)} seconds`
      const winner = this.scoreLeftPlayer > this.scoreRightPlayer ? PlayerSide.Left : PlayerSide.Right
      const summ = winner === PlayerSide.Right && this.playerRight.ai ? `Defeat in ${time}.` : `Victory in ${time}.`
      const wPlayer = winner === PlayerSide.Right ? this.playerRight : this.playerLeft
      if (wPlayer.jumpCount === 0) {
        this.display.drawCenteredDancingMessage(gameTime, 'Without Jumping!!!', summ, Colors.white)
      } else if (this.scoreLeftPlayer === 0 || this.scoreRightPlayer === 0) {
        this.display.drawCenteredDancingMessage(gameTime, 'Shutout!', summ, Colors.white)
      } else {
        this.display.drawCenteredDancingMessage(gameTime, this.getPlayerNickname(winner) + ' Wins!', summ, Colors.white)
      }
    }
    if (this.gameState === GameState.PointScored) {
    } else if (this.gameState === GameState.Paused) {
      this.menu.draw(true, gameTime)
    } else if (this.gameState === GameState.MainMenu) {
      this.menu.draw(false, gameTime)
    } else if (this.gameState === GameState.PreExitCredits) this.display.drawCredits(gameTime)
  }

  private startNewGame(numBalls: number, ai: AiBase | null) {
    this.resetScores()
    this.generatePlayers(ai)
    this.whoseServe = ai || Math.random() < 0.5 ? PlayerSide.Left : PlayerSide.Right
    this.setGameState(GameState.PreAction)
    const aiName = ai ? aiToName(ai) : undefined
    persistence.incGamesStarted(numBalls, this.playerRight.species, aiName)
    this.accumulatedGamePlayTime = 0.0
    this.generateBalls(numBalls)
    this.setUpForServe()
    this.display.atmosphere.changeSkyForOpponent(this.playerRight, 1)
  }

  private handlePreExitInputs(): void {
    let stepForward = false
    for (let i = 1; i <= 4; i++) {
      if (this.input.wasMenuSelectJustPushed(null).selected) {
        stepForward = true
      }
    }
    if (stepForward && this.gameState === GameState.PreExitCredits) this.setGameState(GameState.Exit)
    else if (stepForward) this.setGameState(GameState.PreExitCredits)
  }
  private handleIntroInputs(): void {
    let stepForward = false
    for (let i = 1; i <= 4; i++) {
      if (this.input.wasMenuSelectJustPushed(null).selected || this.accumulatedStateSeconds > 3) {
        if (Date.now() - this.whenStartedDateTime > 250) {
          stepForward = true
        }
      }
    }
    if (stepForward && this.gameState === GameState.Intro1) this.setGameState(GameState.Intro2)
    else if (stepForward && this.gameState === GameState.Intro2) this.setGameState(GameState.Intro3)
    else if (stepForward) this.setGameState(GameState.MainMenu)
  }

  private handleAutoPausedInputs(): void {
    // Exit this state if controller reconnected
    if (
      this.input.doesPlayerHaveGamepad(PlayerSide.Left) &&
      (this.playerRight.species !== PlayerSpecies.Human || this.input.doesPlayerHaveGamepad(PlayerSide.Right))
    ) {
      // Remove menu ownership
      this.menu.setWhoOwnsMenu(null)
      // Go to paused menu
      this.setGameState(GameState.Paused)
      this.menu.select(MenuAction.ReturnToGame, PlayerSide.Left)
    }
  }
  private handleMenuInputs(): void {
    const owner = this.menu.getWhoOwnsMenu()
    const menuSelectResult = this.input.wasMenuSelectJustPushed(owner)
    if (this.input.wasMenuRightJustPushed(owner)) this.menu.moveRight(owner)
    else if (this.input.wasMenuLeftJustPushed(owner)) this.menu.moveLeft(owner)
    else if (this.input.wasMenuDownJustPushed(owner)) this.menu.moveDown(owner)
    else if (this.input.wasMenuUpJustPushed(owner)) this.menu.moveUp(owner)
    if (menuSelectResult.selected && !this.menu.isOnLockedSelection()) {
      const gamepadSide = menuSelectResult.byPlayerSide
      const entry = this.menu.selectedEntry
      const action = entry.action
      if (action === MenuAction.Play) {
        const numBalls = entry.numBalls ?? 1
        if (!entry.ai) {
          this.startNewGame(numBalls, null)
        } else {
          if (gamepadSide === PlayerSide.Right) {
            this.input.swapGamepadSides()
          }
          this.startNewGame(numBalls, new entry.ai(this))
        }
      } else if (action === MenuAction.Exit) this.setGameState(GameState.PreExitMessage)
      else if (action === MenuAction.ReturnToGame) this.setGameState(GameState.Action)
    }
    // Pressing B or Start from Pause returns to Game
    if (this.gameState === GameState.Paused) {
      if (this.input.wasMenuExitJustPushed(owner)) this.setGameState(GameState.Action)
    }
  }
  private handleVictoryInputs(): void {
    if (this.accumulatedStateSeconds > 1.0 && this.input.wasPostgameProceedJustPushed()) {
      this.setGameState(GameState.MainMenu)
    }
  }
  private handlePostPointInputs(dt: number): void {
    // we can let them move for a min
    if (this.accumulatedStateSeconds < tweakables.afterPointKeepMovingSec) {
      this.handleActionInputsForPlayer(dt, PlayerSide.Left)
      this.handleActionInputsForPlayer(dt, PlayerSide.Right)
    }
  }
  private handlePreActionInputs(): void {
    if (this.accumulatedStateSeconds > tweakables.preServeDelaySec) {
      this.setGameState(GameState.Action)
    }
  }
  private pauseTheGame(playerSide: PlayerSide | null): void {
    this.menu.setWhoOwnsMenu(playerSide)
    this.setGameState(GameState.Paused)
    this.menu.select(MenuAction.ReturnToGame, playerSide)
  }
  // we wait shortly after the ball to launch them
  private launchPlayersWithGoodTiming() {
    const stateSec = this.accumulatedStateSeconds
    const jumpDelay = tweakables.player.afterPointJumpDelay
    if (stateSec < jumpDelay) {
      this.playerLeft.physics.center.y = -this.playerLeft.physics.diameter - this.balls[0].physics.diameter
      this.playerRight.physics.center.y = -this.playerRight.physics.diameter - this.balls[0].physics.diameter
    } else if (
      stateSec >= jumpDelay &&
      this.playerLeft.physics.center.y < -this.playerLeft.physics.radius &&
      this.playerLeft.physics.vel.y <= 0
    ) {
      this.playerLeft.physics.vel.y = tweakables.player.jumpSpeedAfterPoint
      this.playerRight.physics.vel.y = tweakables.player.jumpSpeedAfterPoint
    }
  }
  private arePlayersHighEnoughToMove() {
    return (
      this.playerLeft.physics.center.y >= -this.playerLeft.physics.radius &&
      this.playerRight.physics.center.y >= -this.playerRight.physics.radius
    )
  }
  private handleActionInputs(dt: number): void {
    if (this.arePlayersHighEnoughToMove()) {
      this.handleActionInputsForPlayer(dt, PlayerSide.Left)
      this.handleActionInputsForPlayer(dt, PlayerSide.Right)
    }
    // AUTO-PAUSING
    if (this.input.wasPlayerJustDisconnectedFromGamepad(PlayerSide.Left)) {
      this.setGameState(GameState.AutoPaused)
    } else if (this.playerRight.species === PlayerSpecies.Human && this.input.wasPlayerJustDisconnectedFromGamepad(PlayerSide.Right)) {
      this.setGameState(GameState.AutoPaused)
    }

    // REGULAR PAUSING
    if (this.input.wasKeyboardPauseHit()) {
      this.pauseTheGame(null)
    } else {
      const padCheckPlayerSide = this.input.checkGamepadPauseHit()
      if (padCheckPlayerSide !== null) {
        this.pauseTheGame(padCheckPlayerSide)
      }
    }
  }
  private getDashDir(player: Player) {
    const dSq = (b: Ball) => vec.distSq(b.physics.center, player.physics.center)
    const ballsClosests: Ball[] = this.balls.concat([]).sort((b1, b2) => dSq(b1) - dSq(b2))
    return vec.sub(ballsClosests[0].physics.center, player.physics.center)
    //return this.input.getXyDirectional(playerSide)
  }
  private handleActionInputsForPlayer(dt: number, playerSide: PlayerSide): void {
    const player = this.player(playerSide)

    if (player.species === PlayerSpecies.Human) {
      if (this.input.isPlayingWithTouch) {
        if (player.isInJumpPosition) player.targetXVel = 0
        else player.targetXVel = player.physics.vel.x
      } else {
        player.targetXVel = player.isDashing ? player.physics.vel.x : 0
      }
      // the following is -1...1 and maps to 0 if near the center, as determined
      // in tweakables.thumbstickCenterTolerance
      const thumbstickPos = this.input.getLeftThumbStickX(playerSide)
      const touchMoveX = this.input.getTouchThumbstickX()
      if (!player.isDashing) {
        if (this.input.isLeftPressed(playerSide)) player.moveLeft()
        else if (this.input.isRightPressed(playerSide)) player.moveRight()
        else if (thumbstickPos) player.moveRationally(thumbstickPos)
        else if (touchMoveX) player.moveRationally(touchMoveX)
        if (player.canDashNow && this.input.wasDashJustPushed(playerSide)) {
          const dashDir = this.getDashDir(player)
          player.dash(dashDir)
          this.sound.play('dash', 1, 0, 0, false)
        } else if (player.isInJumpPosition) {
          if (this.input.isJumpPressed(playerSide)) player.jump()
          else if (this.input.didJumpViaTouch()) {
            const b = this.getClosestBall(player.physics.center)
            const dir = vec.normalized(vec.sub(b.physics.center, player.physics.center))
            player.jumpTowards(dir)
          }
        }
      }
      // triggers only register over some threshold as dtermined in tweakables.triggerTolerance
      const lTrigger = this.input.getTrigger(playerSide, 'left')
      const rTrigger = this.input.getTrigger(playerSide, 'right')
      const triggerDiff = rTrigger - lTrigger
      const amSmall = player.physics.diameter === tweakables.player.minDiameter
      const amBig = player.physics.diameter === tweakables.player.maxDiameter
      if (triggerDiff) {
        player.grow(dt, triggerDiff * tweakables.input.triggerGrowthMult)
        if (!amSmall && !amBig) this.sound.playGrowthNoise(playerSide, triggerDiff)
      } else if (!amSmall && this.input.isShrinkPressed(playerSide)) {
        player.grow(dt, -tweakables.keyboardGrowthRate)
        this.sound.playGrowthNoise(playerSide, -tweakables.keyboardGrowthRate)
      } else if (!amBig && this.input.isGrowPressed(playerSide)) {
        player.grow(dt, tweakables.keyboardGrowthRate)
        this.sound.playGrowthNoise(playerSide, tweakables.keyboardGrowthRate)
      } else {
        this.sound.fadeGrowthNoise(playerSide)
      }
    }
  }
  private canPlayerJump(player: Player, opponent: Player): boolean {
    if (this.accumulatedStateSeconds < tweakables.ballPlayerLaunchTime) return false
    else if (player.physics.vel.y > player.maxVel.y / 2) return false
    else if (player.isOnHeight(0.0)) return true
    else if (player.isOnRectangle(this.net)) return true
    else if (player.isOnPlayer(opponent)) return true
    else return false
  }
  private isInDashPosition(player: Player, opponent: Player): boolean {
    // for now dashing is off. It kind of stinks!
    if (!tweakables.allowDashing) return false
    if (player.isDashing) return false
    if (this.accumulatedStateSeconds < tweakables.ballPlayerLaunchTime) return false
    else if (player.isOnHeight(0.0)) return false
    else if (player.isOnRectangle(this.net)) return true
    else if (player.isOnPlayer(opponent)) return true
    else return true
  }

  private aIStep(): void {
    for (const p of [this.playerLeft, this.playerRight]) {
      if (p.species === PlayerSpecies.Ai) {
        const aiThinkArg: AiThinkArg = {
          gameTime: this.currentGameTime,
          accumulatedPointSeconds: this.accumulatedPointSeconds,
          balls: this.balls,
          ballPredictions: this.futurePredictionList,
          gameGravity: tweakables.gameGravity,
          p0Score: this.scoreLeftPlayer,
          p1Score: this.scoreRightPlayer,
          me: p,
          opponent: p.playerSide === PlayerSide.Left ? this.playerRight : this.playerLeft,
          net: this.net,
        }
        p.ai?.think(aiThinkArg)
      }
    }
  }

  private get serveFrom() {
    return tweakables.courtWidth / 4
  }

  private setUpForServe(): void {
    this.accumulatedPointSeconds = 0.0
    const playerL = this.playerLeft
    const playerR = this.playerRight

    playerL.physics.center = {x: -this.serveFrom, y: -playerL.physics.diameter - this.balls[0].physics.diameter}
    playerL.physics.vel = {x: 0, y: 0}
    playerL.targetXVel = 0.0

    playerR.physics.center = {x: this.serveFrom, y: -playerR.physics.diameter - this.balls[0].physics.diameter}
    playerR.physics.vel = {x: 0, y: 0}
    playerR.targetXVel = 0.0

    this.balls[0].physics.center = {
      x: this.whoseServe === PlayerSide.Left ? -this.serveFrom : this.serveFrom,
      y: -this.balls[0].physics.radius,
    }
    this.balls[0].physics.vel = {x: 0, y: this.balls[0].maxSpeed}
    this.balls[0].physics.angularVel = 0
    this.balls[0].physics.orientation = 0
    if (this.balls[1]) {
      this.balls[1].physics.center = {
        x: this.whoseServe === PlayerSide.Left ? this.serveFrom : -this.serveFrom,
        y: -this.balls[1].physics.radius * 1.1,
      }
      this.balls[1].physics.vel = {x: 0, y: this.balls[1].maxSpeed}
      this.balls[1].physics.angularVel = 0
      this.balls[0].physics.orientation = 0
    }
  }

  private resetScores(): void {
    this.scoreLeftPlayer = 0
    this.scoreRightPlayer = 0
  }

  private pointExplosion(b: Ball) {
    for (const p of this.players.values()) {
      this.explodeAwayFrom(p.physics, b.physics.center)
    }
    for (const otherB of this.balls) {
      if (otherB !== b) {
        this.explodeAwayFrom(otherB.physics, b.physics.center)
      }
    }
  }
  private explodeAwayFrom(c: CircularObject, p: Vector2) {
    const fDir = vec.normalized(vec.sub(c.center, p))
    const velDelta = vec.scale(fDir, tweakables.physics.explosionVelDelta)
    c.vel.x += velDelta.x
    c.vel.y += velDelta.y
  }

  private checkForAndScorePoint(): boolean {
    let pointForPlayer: PlayerSide | null = null
    if (this.accumulatedPointSeconds < tweakables.ballPlayerLaunchTime) return false
    for (const b of this.balls) {
      const didHit = this.invisibleFloor.handleBallCollision(b.physics, tweakables.physics.ballFloorElasticity, false)
      if (didHit) {
        pointForPlayer = b.physics.center.x > this.net.center.x ? PlayerSide.Left : PlayerSide.Right
        this.kapow.addAKapow('kapowScore', b.physics.center, Math.random() / 10, 0.4, 0.5)
        // increase the pitch on each point
        //const pitch = Math.max(1, this.getScore(pointForPlayer) / 5)
        //this.sound.play('pointScored', 0.8, pitch, b.physics.center.x, false)
        this.sound.play('chaChing', 0.8, 0, 0, false)
        this.pointExplosion(b)
      }
    }
    if (pointForPlayer) this.handlePointScored(pointForPlayer)
    if (
      this.gameState === GameState.PointScored &&
      this.scoreLeftPlayer !== this.scoreRightPlayer &&
      (this.scoreLeftPlayer >= tweakables.winningScore - 1 || this.scoreRightPlayer >= tweakables.winningScore - 1)
    ) {
      this.sound.stopIfPlaying('gamePlayMusic')
      this.isGamePoint = true
      this.sound.playIfNotPlaying('gamePoint', 0.6, 0.0, 0.0, false)
      this.display.atmosphere.changeSkyForOpponent(this.playerRight, 0)
    } else if (pointForPlayer) {
      this.display.atmosphere.changeSkyForOpponent(this.playerRight, 1)
    }
    return !!pointForPlayer
  }

  private handlePointScored(playerSide: PlayerSide): void {
    const winScore = tweakables.winningScore
    this.display.bounceScoreCard(playerSide)
    const sec = this.accumulatedGamePlayTime
    const jumps = this.playerLeft.jumpCount
    this.setGameState(GameState.PointScored)
    if (playerSide === PlayerSide.Left) {
      this.scoreLeftPlayer++
      if (this.scoreLeftPlayer >= winScore && this.scoreLeftPlayer - this.scoreRightPlayer >= 2) {
        persistence.incGamesCompleted()
        if (this.playerRight.ai) {
          const aiName = aiToName(this.playerRight.ai)
          const wasShutout = this.scoreRightPlayer === 0
          persistence.recordResultAgainstAi(aiName, true, wasShutout, sec, jumps)
        }
        this.setGameState(GameState.Victory)
      }
      this.whoseServe = PlayerSide.Left
    } else {
      this.scoreRightPlayer++
      if (this.scoreRightPlayer >= winScore && this.scoreRightPlayer - this.scoreLeftPlayer >= 2) {
        persistence.incGamesCompleted()
        if (this.playerRight.ai) {
          const aiName = aiToName(this.playerRight.ai)
          persistence.recordResultAgainstAi(aiName, false, false, sec, jumps)
        }
        this.setGameState(GameState.Victory)
      }
      this.whoseServe = PlayerSide.Right
    }
  }

  public getClosestBall(p: Vector2): Ball {
    let closestBall = this.balls[0]
    let closestDSq = Infinity
    for (const ball of this.balls) {
      const dSq = vec.lenSq(vec.sub(ball.physics.center, p))
      if (dSq < closestDSq) {
        closestDSq = dSq
        closestBall = ball
      }
    }
    return closestBall
  }

  // keeps balls within the flowers; this is a simple/fast solution
  // to the problem of a multi-object pileup that could otherwise push them through.
  // Also, if we were to allow a y-velocity so high they could go over the flowers,
  // this would keep them inside.
  private constrainBalls(): void {
    for (const b of this.balls) {
      const {x, y} = b.physics.center
      const r = b.physics.radius
      if (x - r < this.leftWall.x2) {
        b.physics.center.x = this.leftWall.x2 + r
      }
      if (x + r > this.rightWall.x1) {
        b.physics.center.x = this.rightWall.x1 - r
      }
      if (y - r < this.invisibleFloor.y2) {
        b.physics.center.y = this.invisibleFloor.y2 + r
      }
    }
  }

  //
  // Keeps players constrained by floor and walls
  //
  private constrainPlayers(): void {
    const wallBorder = tweakables.courtWidth / 2
    for (const p of this.players.values()) {
      // Constrain Player to Floor. In the first second of the game they float up from it. After that they stick above it.
      if (this.accumulatedPointSeconds > tweakables.ballPlayerLaunchTime && p.physics.center.y < 0.0) {
        p.physics.center.y = 0.0
        if (p.physics.vel.y < 0) p.physics.vel.y = 0
      }
      // Left Wall
      if (p.physics.center.x < -wallBorder + p.physics.diameter / 2) {
        p.physics.center.x = -wallBorder + p.physics.diameter / 2
        if (p.physics.vel.x < 0) p.physics.vel.x = 0.0
      }
      // Right Wall
      if (p.physics.center.x > wallBorder - p.physics.diameter / 2) {
        p.physics.center.x = wallBorder - p.physics.diameter / 2
        if (p.physics.vel.x > 0) p.physics.vel.x = 0.0
      }
    }
  }

  private manageCollisions(isSimulation: boolean): void {
    const ball0 = this.balls[0]
    const ball1 = this.balls[1]
    const playerL = this.playerLeft
    const playerR = this.playerRight

    // Balls with net, walls, even the floor
    for (const b of this.balls) {
      if (this.leftWall.handleBallCollision(b.physics, 1.0, isSimulation) && !isSimulation) {
        this.sound.playIfNotPlaying(b.bounceOffFlowerSoundName, 0.6, 0.0, -0.5, false)
      }
      if (this.rightWall.handleBallCollision(b.physics, 1.0, isSimulation) && !isSimulation)
        this.sound.playIfNotPlaying('bounceFlower', 0.6, 0.0, 0.5, false)
      if (this.net.handleBallCollision(b.physics, 1.0, isSimulation) && !isSimulation) {
        this.sound.playIfNotPlaying(b.bounceOffFlowerSoundName, 0.3, 0.0, 0.0, false)
      }
      if (this.gameState !== GameState.Action || this.accumulatedPointSeconds > tweakables.timeOnServeFloorDisappears) {
        if (this.invisibleFloor.handleBallCollision(b.physics, tweakables.physics.ballFloorElasticity, isSimulation)) {
          if (!isSimulation) {
            //console.log(this.gameState, this.accumulatedStateSeconds)
          }
        }
      }
    }
    // Balls with other balls
    if (ball0 && ball1) {
      const collision = ball0.physics.handleHittingOtherCircle(ball1.physics, 1, isSimulation)
      if (collision.didCollide && !isSimulation) {
        const hardness = Math.min(1, vec.len(collision.c2MomentumDelta) / ball0.physics.mass / 5.0)
        const pan = collision.pointOfContact.x
        const pitch = 0.5
        this.sound.playIfNotPlaying(ball0.bounceSoundName, hardness, pitch, pan, false)
      }
    }

    // Players with net
    this.net.handleBallCollision(playerL.physics, 0.0, isSimulation)
    this.net.handleBallCollision(playerR.physics, 0.0, isSimulation)

    // Players with balls
    for (const b of this.balls) {
      this.manageBallPlayerCollision(isSimulation, b, playerL, PlayerSide.Left)
      this.manageBallPlayerCollision(isSimulation, b, playerR, PlayerSide.Right)
    }

    // Player-player collisions
    playerL.physics.handleHittingOtherCircle(playerR.physics, 0.0, isSimulation)
  }

  private manageBallPlayerCollision(isSimulation: boolean, ball: Ball, player: Player, playerSide: PlayerSide): void {
    const collision = player.physics.handleHittingOtherCircle(ball.physics, tweakables.physics.ballPlayerElasticity, isSimulation)
    const isLeft = playerSide === PlayerSide.Left
    if (!collision.didCollide || isSimulation) return
    const hardness = Math.min(1, vec.len(collision.c2MomentumDelta) / ball.physics.mass / 5.0)
    const pan = collision.pointOfContact.x
    const range = tweakables.sound.normalBumpPitchRange
    const pitch =
      range -
      (2 * range * (player.physics.diameter - tweakables.player.minDiameter)) /
        (tweakables.player.maxDiameter - tweakables.player.minDiameter)
    this.sound.playIfNotPlaying(ball.bounceSoundName, hardness, pitch, pan, false)
    // Slam
    let amINearnet = false
    if (
      player.physics.center.x > this.net.center.x - (3 * this.net.width) / 2 &&
      player.physics.center.x < this.net.center.x + (3 * this.net.width) / 2
    )
      amINearnet = true
    let amIHittingItDown = false
    if ((isLeft && ball.physics.vel.x > 0 && ball.physics.vel.y < 0) || (!isLeft && ball.physics.vel.x < 0 && ball.physics.vel.y < 0))
      amIHittingItDown = true
    let amIHighEnough = false
    if (player.physics.center.y > player.getMaxJumpHeight() / 2) amIHighEnough = true

    if (
      amINearnet &&
      amIHittingItDown &&
      amIHighEnough &&
      !this.history.hasHappenedRecently(`Kapow-Slam-Player-${isLeft ? 0 : 1}`, this.currentGameTime, 0.75)
    ) {
      this.sound.play('slam', 0.3, 0.0, pan, false)
      const dest: Vector2 = vec.add(collision.pointOfContact, {x: 0, y: 2 * ball.physics.diameter})
      this.kapow.addAKapow('kapowSlam', dest, 0.0, 0.3, 1.5)
      this.history.recordEvent(`Kapow-Slam-Player-${isLeft ? 0 : 1}`, this.currentGameTime)
    }

    // Rejection
    else if (
      hardness > 0.1 &&
      ball.physics.vel.y > 1.0 &&
      this.history.hasHappenedRecently(`Kapow-Slam-Player-${isLeft ? 1 : 0}`, this.currentGameTime, 0.5) &&
      !this.history.hasHappenedRecently(`Kapow-Rejected-Player-${isLeft ? 0 : 1}`, this.currentGameTime, 0.25)
    ) {
      this.sound.playIfNotPlaying('rejected', 0.4, 0.1, 0.0, false)
      this.kapow.addAKapow('kapowRejected', collision.pointOfContact, 0.0, 0.3, 1.5)
      this.history.recordEvent(`Kapow-Rejected-Player-${isLeft ? 0 : 1}`, this.currentGameTime)
    }
  }
  /**
   * after a point, we let things move for another moment or two, so it all doesn't just freeze.
   * Then we freeze for a second and launch everything back into its hole. Once everything is back
   * underground, we switch the state to PreAction, where the serve is launched.
   */
  private postPointStep(dt: number): void {
    // if everything is back underground, we can proceed to the next step
    if (
      this.playerLeft.physics.center.y < -this.playerLeft.physics.radius &&
      this.playerRight.physics.center.y < -this.playerRight.physics.radius &&
      this.balls[0].physics.center.y < -this.balls[0].physics.diameter &&
      (!this.balls[1] || this.balls[1].physics.center.y < -this.balls[1].physics.diameter)
    ) {
      this.setGameState(GameState.PreAction)
    }

    // just let things move for a bit
    else if (this.accumulatedStateSeconds < tweakables.afterPointKeepMovingSec) {
      this.runActionOrPostPointState()
    }
    // launch things back towards the start
    else if (this.accumulatedStateSeconds < tweakables.afterPointKeepMovingSec + tweakables.afterPointFreezeSec) {
      for (const ball of this.balls) {
        ball.physics.vel = {x: 0, y: ball.maxSpeed}
      }
      for (const p of this.players.values()) {
        p.physics.vel.x = 0.0
        p.physics.vel.y = tweakables.player.jumpSpeedAfterPoint
      }
    }
    // Only move it after that
    else {
      const isTwoBallGame = !!this.balls[1]
      // we launch the balls into the air, and we need to know how long until they are underground
      const timeTillBallUnderground = (b: Ball) => {
        const v0 = b.physics.vel.y
        const c = b.physics.center.y + b.physics.diameter
        const a = tweakables.gameGravity.y
        return (-v0 - Math.sqrt(v0 * v0 - 2 * a * c)) / a
      }
      const timeTillDone = Math.max(timeTillBallUnderground(this.balls[0]), isTwoBallGame ? timeTillBallUnderground(this.balls[1]) : 0.01)
      for (let i = 0; i < 2; i++) {
        const ball = this.balls[i]
        if (ball) {
          ball.stepVelocity(dt, 1.5, false)
          let xDestination = this.whoseServe === PlayerSide.Left ? -this.serveFrom : this.serveFrom
          if (isTwoBallGame) xDestination = this.serveFrom - 2 * this.serveFrom * i
          const xDistance = xDestination - ball.physics.center.x
          ball.physics.vel.x = (3 * xDistance) / timeTillDone
          ball.stepPositionAndOrientation(dt)
        }
      }
      for (const player of this.players.values()) {
        const xDestination = player.playerSide === PlayerSide.Left ? -this.serveFrom : this.serveFrom
        const xDistance = xDestination - player.physics.center.x
        player.stepVelocity(dt)
        if (player.physics.center.y < -player.physics.radius) {
          player.physics.center.y = -player.physics.diameter - this.balls[0].physics.radius
        } else {
          player.physics.vel.x = (3 * xDistance) / timeTillDone
          player.stepPosition(dt)
        }
      }
    }
  }

  private gameStep(dt: number): boolean {
    const isSimulation = this.gameState !== GameState.Action
    this.accumulatedGamePlayTime += dt
    for (const player of this.players.values()) {
      const opponent = player === this.playerLeft ? this.playerRight : this.playerLeft
      player.stepVelocity(dt)
      player.stepPosition(dt)
      player.setIsInJumpPosition(this.canPlayerJump(player, opponent))
      player.setIsInDashPosition(this.isInDashPosition(player, opponent))
    }
    for (const ball of this.balls) {
      ball.stepVelocity(dt, 1, true)
      ball.stepPositionAndOrientation(dt)
    }
    if (!isSimulation) {
      this.launchPlayersWithGoodTiming()
      if (this.checkForAndScorePoint()) return true
    }
    this.manageCollisions(isSimulation)
    this.handleActionInputs(dt)
    this.constrainPlayers()
    this.constrainBalls()
    return false
  }

  private simulateStep(dt: number): void {
    for (const p of this.players.values()) {
      p.stepVelocity(dt)
      p.stepPosition(dt)
    }
    for (const ball of this.balls) {
      ball.stepVelocity(dt, 1, true)
      ball.stepPositionAndOrientation(dt)
    }

    this.manageCollisions(true)
    this.constrainPlayers()
    this.constrainBalls()
  }

  private updateFuturePrediction(): void {
    // Copy current player/ball info to temp so we can step w/o wrecking things
    const sbReal: Ball[] = []
    const p0Real = this.player(PlayerSide.Left)
    const p1Real = this.player(PlayerSide.Right)
    const p0Copy = p0Real.deepCopy()
    const p1Copy = p1Real.deepCopy()
    this.players.set(PlayerSide.Left, p0Copy)
    this.players.set(PlayerSide.Right, p1Copy)

    for (let i = 0; i < this.balls.length; i++) {
      sbReal[i] = this.balls[i]
      this.balls[i] = this.balls[i].deepCopy()
      const prediction = this.futurePredictionList[i]
      prediction.ballStates = []
      // Clear old important markers
      prediction.ballHittingGround.isKnown = false
      prediction.ballCrossingNet.isKnown = false
      prediction.ballEnteringJumpRange(PlayerSide.Left).isKnown = false
      prediction.ballEnteringJumpRange(PlayerSide.Right).isKnown = false
    }

    let time = 0
    const timeElapsed = this.currentGameTime.totalGameTime.totalSeconds
    const p0JumpHeight = p0Copy.getMaxJumpHeight()
    const p1JumpHeight = p1Copy.getMaxJumpHeight()

    while (time < tweakables.predictionLookaheadSec) {
      this.simulateStep(tweakables.predictionPhysicsDtSec)
      time += tweakables.predictionPhysicsDtSec
      const currStep = (time + timeElapsed) / tweakables.predictionStorageDtSec
      const lastStep = (time - tweakables.predictionPhysicsDtSec + timeElapsed) / tweakables.predictionStorageDtSec
      for (let i = 0; i < this.balls.length; i++) {
        const state: FutureState = unknownState()
        const ballPhysics = this.balls[i].physics
        const prediction = this.futurePredictionList[i]

        state.pos = ballPhysics.center
        state.time = time
        if (Math.round(currStep) !== Math.round(lastStep)) {
          prediction.ballStates.push(state)
        }
        if (!prediction.ballHittingGround.isKnown && ballPhysics.center.y - ballPhysics.diameter / 2 <= 0.0) {
          prediction.ballHittingGround = state
          prediction.ballHittingGround.isKnown = true
        } else if (!prediction.ballCrossingNet.isKnown && Math.abs(ballPhysics.center.x - this.net.center.x) < ballPhysics.diameter / 4.0) {
          prediction.ballCrossingNet = state
          prediction.ballCrossingNet.isKnown = true
        }
        if (
          !prediction.ballEnteringJumpRange(PlayerSide.Left).isKnown &&
          ballPhysics.center.x < this.net.center.x - this.net.width / 2 &&
          ballPhysics.center.y <= p0JumpHeight
        ) {
          state.isKnown = true
          prediction.setBallEnteringJumpRange(PlayerSide.Left, state)
        }
        if (
          !prediction.ballEnteringJumpRange(PlayerSide.Right).isKnown &&
          ballPhysics.center.x > this.net.center.x + this.net.width / 2 &&
          ballPhysics.center.y <= p1JumpHeight
        ) {
          state.isKnown = true
          prediction.setBallEnteringJumpRange(PlayerSide.Right, state)
        }
      }
    }
    for (let i = 0; i < this.balls.length; i++) {
      this.balls[i] = sbReal[i]
    }
    this.players.set(PlayerSide.Left, p0Real)
    this.players.set(PlayerSide.Right, p1Real)
  }

  private runActionOrPostPointState() {
    const dt = this.currentGameTime.elapsedGameTime.totalSeconds
    let physicsDtCountdown = dt
    if (this.currentGameTime.totalGameTime.totalMilliseconds > this.lastFuturePrediction + tweakables.predictFutureEveryMs) {
      this.updateFuturePrediction()
      this.lastFuturePrediction = this.currentGameTime.totalGameTime.totalMilliseconds
    }

    while (physicsDtCountdown > 0) {
      const delta = Math.min(tweakables.physicsDtSec, physicsDtCountdown)
      this.gameStep(delta)
      physicsDtCountdown -= delta
    }
    this.aIStep()
  }
  private runMainMenuState() {
    this.handleMenuInputs()
  }
  private runPreExitState() {
    this.handlePreExitInputs()
  }
  private runIntroState() {
    this.handleIntroInputs()
  }
  private runPausedState() {
    this.handleMenuInputs()
  }
  private runAutoPausedState() {
    this.handleAutoPausedInputs()
  }
  private runPostPointState() {
    const dt = this.currentGameTime.elapsedGameTime.totalSeconds
    this.postPointStep(dt)
    this.handlePostPointInputs(dt)
  }
  private runPreActionState() {
    this.setUpForServe()
    this.handlePreActionInputs()
  }
  private runVictoryState() {
    this.handleVictoryInputs()
  }
  private handleUniversalInputs() {
    if (this.input.wasDebugKeyJustPushed()) {
      this.menu.unlockAll = true
      this.display.inDebugView = !this.display.inDebugView
    }
  }
  private getMaxHeightOfAllBalls(): number {
    let highest = -Infinity
    for (const ball of this.balls) {
      highest = Math.max(highest, ball.physics.getBallMaxHeight(tweakables.gameGravity))
    }
    return highest
  }

  private update(gameTime: GameTime): boolean {
    if (this.gameState === GameState.PreStart) {
      this.setGameState(GameState.Intro1)
    }
    this.handleUniversalInputs()

    const dt = gameTime.elapsedGameTime.totalMilliseconds / 1000
    this.accumulatedStateSeconds += dt
    if (this.gameState === GameState.Action) this.accumulatedPointSeconds += dt

    switch (this.gameState) {
      case GameState.Action:
        this.display.adjustZoomLevel(this.getMaxHeightOfAllBalls(), dt)
        this.runActionOrPostPointState()
        break
      case GameState.Paused:
        this.display.adjustZoomLevel(1000, dt)
        this.runPausedState()
        break
      case GameState.AutoPaused:
        this.display.adjustZoomLevel(1000, dt)
        this.runAutoPausedState()
        break
      case GameState.MainMenu:
        this.runMainMenuState()
        break
      case GameState.Intro1:
      case GameState.Intro2:
      case GameState.Intro3:
        this.runIntroState()
        break
      case GameState.PointScored:
        this.runPostPointState()
        break
      case GameState.PreAction:
        this.runPreActionState()
        break
      case GameState.Victory:
        this.display.adjustZoomLevel(1000, dt)
        this.runVictoryState()
        break
      case GameState.PreExitMessage:
      case GameState.PreExitCredits:
        this.runPreExitState()
        break
      case GameState.Exit:
        return false
    }
    return true
  }
}

export {Game, GameState}
