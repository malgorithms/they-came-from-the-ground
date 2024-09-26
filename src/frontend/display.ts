import {Atmosphere} from './atmosphere'
import {Ball} from './ball'
import {CanvasManager} from './canvas-manager'
import {Color, Colors} from './color'
import {TextureName, textureSources} from './content-load-list'
import {ContentLoader} from './content-loader'
import {FontManager, FontName} from './font-manager'
import {FuturePrediction} from './future-prediction'
import {Game, GameState} from './game'
import {GamepadConnectSummary} from './gamepad-monitor'
import {KapowManager} from './kapow-manager'
import {Player} from './player'
import {ScoreCard} from './score-card'
import {SpriteBatch} from './sprite-batch'
import tweakables from './tweakables'
import {FutureState, GameTime, PlayerSide, Rectangle, Texture2D, Vector2} from './types'
import {vec} from './utils'
import {default as constants} from './constants'

class Display {
  private canvasManager: CanvasManager

  // Properties
  public inDebugView = false

  // Members
  private p0ScoreCard = new ScoreCard()
  private p1ScoreCard = new ScoreCard()

  private content: ContentLoader
  private spriteBatch: SpriteBatch
  private textures = new Map<TextureName, Texture2D>()
  private _atmosphere: Atmosphere
  private lastCloudDraw = 0
  private fontManager: FontManager
  private game: Game

  public constructor(game: Game, content: ContentLoader, targetDiv: HTMLElement) {
    this.game = game
    this.content = content
    this.canvasManager = new CanvasManager(targetDiv)
    this.spriteBatch = new SpriteBatch(this.canvasManager)
    this._atmosphere = new Atmosphere(this, this.canvasManager)
    this.fontManager = new FontManager(this.content)
  }

  private async loadTexture(path: string, name: TextureName) {
    const t = await this.content.loadTexture2d(path)
    this.textures.set(name, t)
  }
  public font(fontName: FontName) {
    return this.fontManager.getFont(fontName)
  }
  public get atmosphere(): Atmosphere {
    return this._atmosphere
  }
  public get canvasWidth(): number {
    return this.canvasManager.width
  }
  public get canvasHeight(): number {
    return this.canvasManager.height
  }
  public get viewableRegion() {
    return this.canvasManager.viewableRegion
  }
  public get ctx(): CanvasRenderingContext2D {
    return this.canvasManager.ctx
  }
  public getSpriteBatch(): SpriteBatch {
    return this.spriteBatch
  }
  public initialDraw(): void {
    this.canvasManager.initialDraw()
  }
  public async loadContent(): Promise<void> {
    this.spriteBatch = new SpriteBatch(this.canvasManager)

    const p: Promise<any>[] = []
    Object.entries(textureSources).forEach(([name, source]) => p.push(this.loadTexture(source, name as TextureName)))
    p.push(this.fontManager.loadContent())
    await Promise.all(p)

    for (let i = 1; i <= 5; i++) {
      const tSunny = this.getTexture(`sunnyCloud${i}` as TextureName)
      const tDark = this.getTexture(`darkCloud${i}` as TextureName)
      this.atmosphere.addCloudTextures(tSunny, tDark)
    }
    this.atmosphere.fillClouds()
  }

  public getTexture(name: TextureName): Texture2D {
    const t = this.textures.get(name)
    if (!t) throw new Error(`no texture was loaded with name ${name}`)
    return t
  }

  public bounceScoreCard(playerSide: PlayerSide) {
    if (playerSide == PlayerSide.Left) this.p0ScoreCard.bounce()
    else this.p1ScoreCard.bounce()
  }
  private drawPupils(gameTime: GameTime, p: Player, lookingAt: Vector2) {
    const eyes = p.ai?.eyes ?? tweakables.player.defaultEyes
    const pDiam = p.physics.diameter
    for (const eye of eyes) {
      const offset = vec.scale(eye.offset, pDiam)
      const pos = vec.add(p.physics.center, offset)
      const blinkFactor = p.playerSide === PlayerSide.Left ? 0 : 1
      const isBlinking = gameTime.totalGameTime.totalMilliseconds % (eye.blinkEveryMs + blinkFactor * 1000) < eye.blinkDurationMs
      const w = eye.size * pDiam
      const h = isBlinking ? w * eye.blinkScale : w
      const lookDir = vec.normalized(vec.sub(lookingAt, pos))
      pos.x += lookDir.x * eye.movementRadius * pDiam
      pos.y += lookDir.y * eye.movementRadius * pDiam
      this.spriteBatch.drawTextureCentered(this.getTexture(eye.pupilTexture), pos, {w, h}, 0, 1)
    }
  }
  private drawPlayer(gameTime: GameTime, player: Player, ball: Ball): void {
    const playerTexture = this.getTexture(player.textureName)
    this.spriteBatch.drawTextureCentered(
      playerTexture,
      player.physics.center,
      {w: player.physics.diameter, h: player.physics.diameter},
      player.physics.orientation,
      1,
    )
    this.drawPupils(gameTime, player, ball.physics.center)
    if (player.ai?.drawExtrasInFrontOfCharacter) {
      this.ctx.save()
      this.spriteBatch.transformCtxForCenteredObject(
        player.physics.center,
        {w: player.physics.diameter, h: player.physics.diameter},
        player.physics.orientation,
        player.physics.radius,
        false,
      )
      player.ai.drawExtrasInFrontOfCharacter(this.ctx)
      this.ctx.restore()
    }
  }

  private drawPlayerShadowBehind(player: Player) {
    const shadowWidth = player.physics.diameter * 1.1
    const shadowHeight = player.physics.diameter / 5
    const shadowPosition = {x: player.physics.center.x, y: 0}
    this.spriteBatch.drawTextureCentered(this.getTexture('playerShadowBehind'), shadowPosition, {w: shadowWidth, h: shadowHeight}, 0, 1)
  }
  private drawPlayerShadowFront(player: Player) {
    const shadowWidth = player.physics.diameter * 1.1
    const shadowHeight = player.physics.diameter / 10
    const shadowPosition = {x: player.physics.center.x, y: -shadowHeight / 2}
    this.spriteBatch.drawTextureCentered(this.getTexture('playerShadowFront'), shadowPosition, {w: shadowWidth, h: shadowHeight}, 0, 1)
  }

  public drawCenteredDancingMessage(gameTime: GameTime, text: string, subtitle: string | null, color: Color) {
    const minHeight = 0.08
    const maxHeight = 0.25 // added or subtracted to above
    const avgHeight = (maxHeight + minHeight) / 2
    const heightDev = avgHeight - minHeight

    const seconds = gameTime.totalGameTime.totalSeconds

    const beat = Math.PI * 2.0 * seconds * (tweakables.menu.bpm / 60)
    const height = avgHeight + heightDev * (Math.sin(beat / 2) / 2 + Math.sin(beat / 8) / 2)
    const rot = -0.1 + Math.sin(beat) / 50.0

    const dest: Vector2 = {x: 0, y: 0.4}
    const shift = this.canvasManager.pixelWidth(2)
    const subFont = this.font('regular')
    const font = this.font('extraBold')

    // we draw subtitle first so title is on top when they overlap
    if (subtitle) {
      const subtitleRelativeSize = 0.8 // 80% as big as title
      const subSize = (minHeight + (maxHeight - height)) * subtitleRelativeSize
      dest.y -= subSize * 2
      this.spriteBatch.drawStringCentered(subtitle, subFont, subSize, vec.add(dest, {x: shift, y: shift}), Colors.black, rot, false)
      this.spriteBatch.drawStringCentered(subtitle, subFont, subSize, vec.add(dest, {x: shift, y: -shift}), Colors.black, rot, false)
      this.spriteBatch.drawStringCentered(subtitle, subFont, subSize, vec.add(dest, {x: -shift, y: shift}), Colors.black, rot, false)
      this.spriteBatch.drawStringCentered(subtitle, subFont, subSize, vec.add(dest, {x: -shift, y: -shift}), Colors.black, rot, false)
      this.spriteBatch.drawStringCentered(subtitle, subFont, subSize, dest, color, rot, false)
      dest.y += subSize
    }

    this.spriteBatch.drawStringCentered(text, font, height, vec.add(dest, {x: shift, y: shift}), Colors.black, rot, false)
    this.spriteBatch.drawStringCentered(text, font, height, vec.add(dest, {x: shift, y: -shift}), Colors.black, rot, false)
    this.spriteBatch.drawStringCentered(text, font, height, vec.add(dest, {x: -shift, y: shift}), Colors.black, rot, false)
    this.spriteBatch.drawStringCentered(text, font, height, vec.add(dest, {x: -shift, y: -shift}), Colors.black, rot, false)
    this.spriteBatch.drawStringCentered(text, font, height, dest, color, rot, false)
  }

  public drawControllerInstructions() {
    // TODO
    const c = new Color(1, 1, 1, 1)
    this.spriteBatch.drawStringCentered('Instructions soon', this.font('regular'), 0.1, {x: 0, y: 0.1}, c, 0, false)
  }

  public drawCredits(gameTime: GameTime) {
    console.log(`Todo, draw credits at ${gameTime.totalGameTime.totalSeconds}`)
  }

  public drawKapows(k: KapowManager) {
    for (const kapow of k.kapows) {
      const texture = this.getTexture(kapow.kapowName)
      const alpha = 1 - kapow.fractionOfWayToDeath()
      this.spriteBatch.drawTextureCentered(texture, kapow.pos, {w: kapow.size, h: kapow.size}, kapow.orientation, alpha)
    }
  }

  public draw(
    gameTime: GameTime,
    gameState: GameState,
    p0Score: number,
    p1Score: number,
    futurePrediction: FuturePrediction[],
    kapowManager: KapowManager,
    currentFps: number,
    gamepadConnectSummary: GamepadConnectSummary,
  ) {
    this.canvasManager.clearCanvas()
    const playerLeft = this.game.playerLeft
    const playerRight = this.game.playerRight

    const dt = (gameTime.totalGameTime.totalMilliseconds - this.lastCloudDraw) / 1000.0
    this.p0ScoreCard.update(dt)
    this.p1ScoreCard.update(dt)
    this.atmosphere.step(dt)
    this.lastCloudDraw = gameTime.totalGameTime.totalMilliseconds

    this.atmosphere.draw(this.spriteBatch)

    const viewableRegion = this.canvasManager.viewableRegion

    this.spriteBatch.drawTextureInRect(
      this.getTexture('floorBack'),
      {
        x1: viewableRegion.x1 - 0.1,
        x2: viewableRegion.x2 + 0.1,
        y1: tweakables.floorBack.yMin,
        y2: tweakables.floorBack.yMax,
      },
      1,
    )

    if (
      gameState != GameState.PreExitMessage &&
      gameState != GameState.Intro1 &&
      gameState != GameState.Intro2 &&
      gameState != GameState.Intro3 &&
      gameState != GameState.MainMenu
    ) {
      this.drawPlayerShadowBehind(playerLeft)
      this.drawPlayerShadowBehind(playerRight)

      this.drawKapows(kapowManager)
      for (const player of [this.game.playerLeft, this.game.playerRight]) {
        const closestBall = this.game.getClosestBall(player.physics.center)
        this.drawPlayer(gameTime, player, closestBall)
      }
      this.game.balls.forEach((b) => this.drawBall(b))
    }
    this.spriteBatch.drawTextureInRect(
      this.getTexture('floorFront'),
      {
        x1: viewableRegion.x1 - 0.1,
        x2: viewableRegion.x2 + 0.1,
        y1: viewableRegion.y1 - 0.1,
        y2: tweakables.floorFront.yMax,
      },
      1,
    )

    if (
      gameState != GameState.PreExitMessage &&
      gameState != GameState.Intro1 &&
      gameState != GameState.Intro2 &&
      gameState != GameState.Intro3 &&
      gameState != GameState.MainMenu
    ) {
      this.drawPlayerShadowFront(playerLeft)
      this.drawPlayerShadowFront(playerRight)
    }

    const leftTreeTopWidth = this.game.leftWall.width * 2.5
    const leftFlowerTop = this.getTexture('leftFlowerTop')
    const rightFlowerTop = this.getTexture('rightFlowerTop')
    const leftTreeTopHeight = (leftTreeTopWidth * leftFlowerTop.height) / leftFlowerTop.width
    const rightTreeTopWidth = this.game.rightWall.width * 2.5
    const rightTreeTopHeight = (rightTreeTopWidth * rightFlowerTop.height) / rightFlowerTop.width
    const net = this.game.net
    this.spriteBatch.drawTextureCentered(this.getTexture('net'), net.center, {w: net.width, h: net.height}, 0, 1)

    this.drawFlowers(leftTreeTopWidth, leftTreeTopHeight, rightTreeTopWidth, rightTreeTopHeight)

    if (
      gameState != GameState.MainMenu &&
      gameState != GameState.PreStart &&
      gameState != GameState.PreExitMessage &&
      gameState != GameState.PreExitCredits &&
      gameState != GameState.Intro1 &&
      gameState != GameState.Intro2 &&
      gameState != GameState.Intro3
    ) {
      this.drawScores(p0Score, p1Score, gameTime)
    }

    this.drawDebugView(futurePrediction, currentFps)
    this.drawGamepadConnections(gameState, gamepadConnectSummary)

    if (gameState == GameState.PreExitMessage) {
      this.drawCenteredDancingMessage(gameTime, 'They went back to the ground.', null, Colors.white)
    } else if (gameState == GameState.Intro1) {
      this.drawCenteredDancingMessage(gameTime, 'They came from the ground.', null, Colors.white)
    } else if (gameState == GameState.Intro2) {
      this.drawCenteredDancingMessage(gameTime, 'they brought a bouncy ball -', null, Colors.white)
    } else if (gameState == GameState.Intro3) {
      this.drawCenteredDancingMessage(gameTime, '- and they bounced it around.', null, Colors.white)
    } else if (gameState == GameState.AutoPaused) {
      this.drawCenteredDancingMessage(gameTime, 'Please reconnect your controller.', null, Colors.white)
    } else if (gameState == GameState.PreExitCredits) {
      this.drawCenteredDancingMessage(gameTime, 'tippycoco.com', 'love you', Colors.white)
    }
  }
  private drawFlowers(leftTreeTopWidth: number, leftTreeTopHeight: number, rightTreeTopWidth: number, rightTreeTopHeight: number) {
    const leftWall = this.game.leftWall
    const rightWall = this.game.rightWall
    this.spriteBatch.drawTextureCentered(this.getTexture('leftFlower'), leftWall.center, {w: leftWall.width, h: leftWall.height}, 0, 1)

    this.spriteBatch.drawTextureCentered(
      this.getTexture('leftFlowerTop'),
      {x: leftWall.center.x + leftWall.width / 3, y: leftWall.center.y + leftWall.height / 2},
      {w: leftTreeTopWidth, h: leftTreeTopHeight},
      0,
      1,
    )

    this.spriteBatch.drawTextureCentered(this.getTexture('rightFlower'), rightWall.center, {w: rightWall.width, h: rightWall.height}, 0, 1)

    this.spriteBatch.drawTextureCentered(
      this.getTexture('rightFlowerTop'),
      {
        x: rightWall.center.x - rightWall.width / 3,
        y: rightWall.center.y + rightWall.height / 2,
      },
      {w: rightTreeTopWidth, h: rightTreeTopHeight},
      0,
      1,
    )
  }

  private drawBall(ball: Ball) {
    const bp = ball.physics
    const ballName = ball.textureName
    this.spriteBatch.drawTextureCentered(this.getTexture(ballName), bp.center, {w: bp.diameter, h: bp.diameter}, bp.orientation, 1)
    this.spriteBatch.drawTextureCentered(this.getTexture('ballShadow'), bp.center, {w: bp.diameter, h: bp.diameter}, 0, 1)
  }

  private drawGamepadConnections(gameState: GameState, gCS: GamepadConnectSummary) {
    const ignore = [GameState.Action, GameState.PreAction, GameState.PointScored]
    if (ignore.includes(gameState)) {
      return
    }
    // draw FPS in bottom right corner
    const view = this.canvasManager.viewableRegion
    //const tlC = this.canvasManager.topLeftCorner()
    //const bRC = this.canvasManager.bottomRightCorner()
    const onePixel = this.canvasManager.onePixel
    const height = 100
    const width = 100
    const kbLeftOpacity = gCS.left ? 0.1 : 1
    const gpLeftOpacity = gCS.left ? 1 : 0.1
    const kbRightOpacity = gCS.right ? 0.1 : 1
    const gpRightOpacity = gCS.right ? 1 : 0.1

    const kbLeftRect = {
      x1: view.x1 + 70 * onePixel,
      x2: view.x1 + 70 * onePixel + onePixel * width,
      y1: view.y1 + onePixel * height,
      y2: view.y1 + onePixel * height * 2,
    }
    const gpLeftRect = {
      x1: kbLeftRect.x2 + onePixel * 10,
      x2: kbLeftRect.x2 + onePixel * (10 + width),
      y1: view.y1 + onePixel * height,
      y2: view.y1 + onePixel * height * 2,
    }
    this.spriteBatch.drawTextureInRect(this.getTexture('keyboard'), kbLeftRect, kbLeftOpacity)
    this.spriteBatch.drawTextureInRect(this.getTexture('gamepad'), gpLeftRect, gpLeftOpacity)

    // now player 2
    const kbRightRect = {
      x1: view.x2 - onePixel * width * 3.8 + onePixel * width,
      x2: view.x2 - onePixel * width * 3.8 + onePixel * width * 2,
      y1: view.y1 + onePixel * height,
      y2: view.y1 + onePixel * height * 2,
    }
    const gpRightRect = {
      x1: kbRightRect.x2 + onePixel * 10,
      x2: kbRightRect.x2 + onePixel * (10 + width),
      y1: view.y1 + onePixel * height,
      y2: view.y1 + onePixel * height * 2,
    }
    this.spriteBatch.drawTextureInRect(this.getTexture('keyboard'), kbRightRect, kbRightOpacity)
    this.spriteBatch.drawTextureInRect(this.getTexture('gamepad'), gpRightRect, gpRightOpacity)

    //console.log(kbLeftRect)
  }

  private drawDebugView(futurePrediction: FuturePrediction[], currentFps: number) {
    // draw FPS in bottom right corner
    const view = this.canvasManager.viewableRegion
    const onePixel = this.canvasManager.onePixel
    const height = onePixel * 36
    const xPos = view.x1 + height * 2
    const yPos = view.y1 + height * 2
    const color = new Color(0, 0, 0, 0.25)
    const font = this.font('regular')
    const str = `v${constants.version} ${~~currentFps} fps`
    this.spriteBatch.drawString(str, font, height, {x: xPos, y: yPos}, color, 0)
    const suggAt = 90
    if (currentFps && currentFps < suggAt) {
      const opacity = 0.5 * (1 - currentFps / suggAt)
      this.spriteBatch.drawString(
        `lmk if a smaller window improves smoothness/fps`,
        font,
        height * 0.75,
        {x: xPos, y: yPos - height * 1.1},
        new Color(0, 0, 0, opacity),
        0,
      )
    }

    if (this.inDebugView) {
      this.spriteBatch.drawString(
        this.game.getGameState(),
        font,
        height * 0.75,
        {x: xPos, y: yPos - height * 1.1},
        new Color(0, 0, 0, 0.75),
        0,
      )
      const alpha = (s: FutureState) => 1 - s.time / tweakables.predictionLookaheadSec
      for (let i = 0; i < this.game.balls.length; i++) {
        const ball = this.game.balls[i]
        const prediction = futurePrediction[i]
        for (const state of prediction.ballStates ?? []) {
          this.spriteBatch.drawTextureCentered(this.getTexture('predictionDot'), state.pos, {w: 0.01, h: 0.01}, 0, alpha(state))
        }

        for (const s of [PlayerSide.Left, PlayerSide.Right]) {
          const entrance = prediction.ballEnteringJumpRange(s)
          if (entrance?.isKnown)
            this.spriteBatch.drawTextureCentered(
              this.getTexture('kapowScore'),
              entrance.pos,
              {w: ball.physics.diameter, h: ball.physics.diameter},
              0,
              alpha(entrance),
            )
        }
        const groundHit = prediction.ballHittingGround
        if (groundHit?.isKnown)
          this.spriteBatch.drawTextureCentered(
            this.getTexture('kapowScore'),
            prediction.ballHittingGround.pos,
            {w: ball.physics.diameter, h: ball.physics.diameter},
            0,
            alpha(groundHit),
          )
      }
    }
  }

  public drawMenuBanner(bannerTexture: Texture2D, gameTime: GameTime, center: Vector2) {
    const seconds = gameTime.totalGameTime.totalSeconds
    const beat = 2.0 * Math.PI * seconds * (tweakables.menu.bpm / 60) // 87bmp

    const destination = center
    const sizeMultiplier = 0.05 + Math.sin(beat / 2) / 40 + Math.sin(beat / 8) / 40
    const scale: Vector2 = {x: sizeMultiplier, y: sizeMultiplier}

    const rect: Rectangle = {
      x1: destination.x,
      y1: destination.y,
      x2: destination.x + scale.x,
      y2: destination.y + scale.y,
    }

    this.spriteBatch.drawTextureInRect(bannerTexture, rect, 1)
  }

  private scoreIntToTextureArray(n: number): Texture2D[] {
    const res: Texture2D[] = []
    for (const c of `${n}`) {
      const textureName: TextureName = `digit${c}` as TextureName
      res.push(this.getTexture(textureName))
    }
    return res
  }

  private drawScore(score: number, sizeMultiplier: number, center: Vector2, gameTime: GameTime) {
    const seconds = gameTime.totalGameTime.totalSeconds
    const rotMax = 0.02
    const rotation = rotMax + 2 * rotMax * Math.sin(gameTime.totalGameTime.totalSeconds)
    const scaleMax = 0.1
    const beat = 2.0 * Math.PI * seconds * (tweakables.menu.bpm / 60) // 87bmp
    const extraScale = 1 - scaleMax * Math.sin(beat / 4) - scaleMax * Math.sin(beat / 8)

    const view = this.canvasManager.viewableRegion
    const scoreCardHeight = ((view.y2 - view.y1) / 10) * extraScale * sizeMultiplier
    const dims = {w: scoreCardHeight, h: scoreCardHeight}
    this.spriteBatch.drawTextureCentered(this.getTexture('scoreCard'), center, dims, rotation, 1)
    const textures1 = this.scoreIntToTextureArray(score)
    const eachWidth = textures1.length === 1 ? 0.7 * dims.w : dims.w / textures1.length
    const digitDims = this.spriteBatch.autoDim(eachWidth, textures1[0])
    const startX = center.x - (textures1.length - 1) * 0.5 * eachWidth
    for (let i = 0; i < textures1.length; i++) {
      const texture = textures1[i]
      const tCenter = {x: startX + i * eachWidth, y: center.y}
      this.spriteBatch.drawTextureCentered(texture, tCenter, digitDims, rotation, 1)
    }
  }

  private drawScores(p0Score: number, p1Score: number, gameTime: GameTime) {
    const view = this.canvasManager.viewableRegion
    const y = (9 * view.y2 + view.y1) / 10 // most of the way towards tL.y
    const x1 = (9 * view.x1 + view.x2) / 10 // most of the way to the left side
    const x2 = (9 * view.x2 + view.x1) / 10 //  most of the way to the right side
    this.drawScore(p0Score, this.p0ScoreCard.sizeMultiplier, {x: x1, y}, gameTime)
    this.drawScore(p1Score, this.p1ScoreCard.sizeMultiplier, {x: x2, y}, gameTime)
  }

  public adjustZoomLevel(maxBallHeight: number, dt: number) {
    this.canvasManager.adjustZoomLevel(maxBallHeight, dt)
  }
}

export {Display}
