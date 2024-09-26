import {Color} from './color'
import {SoundName} from './content-load-list'
import {Dims, EyeConfig, KeyboardControlSet, NewBallArg, NewPlayerArg, PlayerKeyboardSet, PlayerSide, PlayerSpecies, Vector2} from './types'
import {vec} from './utils'

const twoPlayerControls: KeyboardControlSet = {
  p0: {
    left: ['KeyA'],
    right: ['KeyD'],
    jump: ['KeyW', 'Space'],
    shrink: ['KeyQ'],
    grow: ['KeyE'],
    dash: ['KeyS'],
  },
  p1: {
    left: ['KeyJ', 'ArrowLeft'],
    right: ['KeyL', 'ArrowRight'],
    jump: ['KeyI', 'ArrowUp'],
    shrink: ['KeyU', 'Period'],
    grow: ['KeyO', 'Slash'],
    dash: ['KeyK', 'ArrowDown'],
  },
}

// allow any of the above for one player games
const p0Set: PlayerKeyboardSet = {
  left: twoPlayerControls.p0.left.concat(twoPlayerControls.p1.left),
  right: twoPlayerControls.p0.right.concat(twoPlayerControls.p1.right),
  jump: twoPlayerControls.p0.jump.concat(twoPlayerControls.p1.jump),
  shrink: twoPlayerControls.p0.shrink.concat(twoPlayerControls.p1.shrink),
  grow: twoPlayerControls.p0.grow.concat(twoPlayerControls.p1.grow),
  dash: twoPlayerControls.p0.dash.concat(twoPlayerControls.p1.dash),
}
const onePlayerControls: KeyboardControlSet = {
  p0: p0Set,
  p1: p0Set,
}

// THE GAME COORDINATE SYSTEM
// The game is played on its own coordinate system, which is typical euclidean.
// With the ground at y=0 and the net at x=0.
// Also, positive Y is UP, like most math, but unlike most comptuer graphics
// So if a ball is at (0.5, 0.5), that means it's to the right and up, relative to the net.
//
// rotations are counter-clockwise and in radians. As you'd expect!
//

// how far between the walls' edges (not their centers). In other words, this describes
// the width of the playable area.
const courtWidth = 1.1
const flowerDims: Dims = {w: 0.258, h: 1.0}
const defaultEyes: EyeConfig[] = [
  {
    offset: {x: -0.113, y: 0.14},
    size: 0.24 * 0.67,
    movementRadius: 0.05,
    blinkScale: 0.1,
    blinkEveryMs: 5000,
    blinkDurationMs: 100,
    pupilTexture: 'pupil',
  },
  {
    offset: {x: 0.1195, y: 0.144},
    size: 0.28 * 0.67,
    movementRadius: 0.05,
    blinkScale: 0.1,
    blinkEveryMs: 5000,
    blinkDurationMs: 100,
    pupilTexture: 'pupil',
  },
]
const autoPitchSet: SoundName[] = ['bounceFlower', 'bounceTennis', 'bounce', 'ceramicBounce', 'rejected', 'slam']

export default {
  courtWidth,
  twoPlayerControls,
  onePlayerControls,
  touch: {
    flickMinDistPx: 30,
    flickMinMs: 20,
    flickMaxMs: 10000,
    tapMaxMs: 100,
    tapMaxDist: 20,
    xMoveMult: 10,
  },
  physics: {
    ballPlayerElasticity: 0.95,
    ballAngularFriction: 0.5,
    ballFloorElasticity: 0.5,
    maxAngVel: 100,
    ballSpinElasticityOffFrictionPoints: 0.65,
    ballBumpOffFrictionPoints: 0.25,
    ballOnBallFrictionSpin: 1.25, // higher values allow players to add more spin to balls
    ballOnBallFrictionBump: 0.4, // higher values cause more redirection from spin hits
    minRelSpeedToAllowBallSpins: 0.25,
    explosionVelDelta: 0.5,
  },
  input: {
    triggerTolerance: 0.05, // anything this close to 0 is just 0
    triggerGrowthMult: 0.4, // how fast the trigger scales/shrinks character
    thumbstickPush: 0.6, // how far stick has to go to be considered pushed like a dpad
  },
  sound: {
    autoPitchSecStorage: 0.5, // sec
    autoPitchInc: 0.25,
    normalBumpPitchRange: 0.4, // -this...this depending on player size
    autoPitchSet: autoPitchSet,
  },
  display: {
    zoomCenter: {x: 0, y: 0.3} as Vector2,
    zoomScale: {
      min: 0.45,
      start: 0.8,
      max: 0.8,
      springConstant: 0.5,
      ballHeightMult: 1.05, // multiplies expected ball height by this to get zoom scale
    },
    scorecard: {
      textOffset: {x: 0, y: 0},
    },
  },
  // this is a public join link...if it's abused we can change the rules
  discordJoin: 'https://discord.gg/vUttx8Qrnp',
  allowDashing: false,
  fpsSampleCount: 100, // loops
  ballPlayerLaunchTime: 1,
  winningScore: 5,
  gameGravity: {x: 0, y: -1.9} as Vector2,
  timeOnServeFloorDisappears: 0.15,
  afterPointKeepMovingSec: 1,
  afterPointFreezeSec: 0.01,
  preServeDelaySec: 0.8, // sec to switch from pre-action to action
  predictFutureEveryMs: 10, // update every this often ms
  maxDtMs: 100, // if the game tries to advance more than this, clip the timing
  physicsDtSec: 0.002, // seconds,
  redrawTargetMs: 4, // every game loop, if this much time has gone by, we redraw
  predictionLookaheadSec: 1.75,
  predictionPhysicsDtSec: 0.004,
  predictionStorageDtSec: 0.02,
  thumbstickCenterTolerance: 0.05, // anything this close to center is returned as 0
  keyboardGrowthRate: 0.1,
  fontFamilyFallback: "'Courier New', Arial",
  net: {
    center: {x: 0, y: 0.025} as Vector2,
    width: 0.08,
    height: 0.055,
  },
  invisibleFloor: {
    center: {x: 0, y: -0.5},
    width: courtWidth * 2,
    height: 1,
  },
  leftWall: {
    center: {x: -courtWidth / 2 - flowerDims.w / 2, y: 0.5} as Vector2,
    width: flowerDims.w,
    height: flowerDims.h,
  },
  rightWall: {
    center: {x: courtWidth / 2 + flowerDims.w / 2, y: 0.5} as Vector2,
    width: flowerDims.w,
    height: flowerDims.h,
  },
  floorFront: {
    yMax: 0, // draws below this line
  },
  floorBack: {
    yMax: 0.0365,
    yMin: -0.07,
  },
  ball: {
    defaultSettings: (ballNum: number): NewBallArg => ({
      density: 20,
      diameter: 0.08,
      maxSpeed: 1.4,
      orientation: 0,
      center: vec.zero(),
      vel: vec.zero(),
      angularVel: 0,
      textureName: ballNum === 0 ? 'ball1' : 'ball2',
      bounceSoundName: 'bounce',
    }),
    tennisSettings: (): NewBallArg => ({
      density: 10,
      diameter: 0.05,
      maxSpeed: 1.8,
      orientation: 0,
      center: vec.zero(),
      vel: vec.zero(),
      angularVel: 0,
      textureName: 'ballTennis',
      bounceSoundName: 'bounceTennis',
    }),
  },
  cloud: {
    num: 5,
    minVel: {x: 0.01, y: -0.01},
    maxVel: {x: 0.07, y: 0.01},
  },
  atmosphere: {
    timeToTurnSunny: 2,
    timeToTurnDark: 3,
    maxSkies: 3,
    skyTransitionMs: 1000,
  },
  moon: {
    nightHeightFrac: 0.75,
    widthFrac: 0.3,
  },
  proximityTolerance: 0.001,
  player: {
    growSpeed: 0.1,
    minDiameter: 0.09,
    maxDiameter: 0.175,
    dashMult: 1.5, // multiplied by max speed
    jumpSpeedAfterPoint: 1.85,
    afterPointJumpDelay: 0.15,
    defaultEyes: defaultEyes,
    defaultSettings: (playerSide: PlayerSide): NewPlayerArg => ({
      maxVelAtSmallest: {x: 1.033, y: 1.37} as Vector2,
      maxVelAtLargest: {x: 0.74, y: 1.15} as Vector2,
      diameter: 0.15,
      density: 170,
      xSpringConstant: 30,
      gravityMultiplier: 1.9, // relative to ball
      targetXVel: 0,
      species: PlayerSpecies.Human,
      ai: null,
      playerSide: playerSide,
    }),
  },
  menu: {
    springCards: {
      velK: 100,
      velDamp: -10,
      sizeK: 100,
      sizeDamp: -10,
    },
    rowLabelColor: new Color(1, 1, 1, 0.5),
    rowLabelSelectedColor: new Color(1, 1, 1, 1),
    bpm: 87, // beats per minute for menu, to match the music
    rowHeight: 0.3,
    colLeftWidth: 0.1,
    colRightWidth: 0.5,
    cardWidth: 0.3, // game units
    cardWidthSelectedRow: 0.6, // unselected cards in the selected row
    cardWidthSelectedCard: 0.8, // selected card this much bigger
    textOffsetFromCard: {x: 0, y: 0.3},
    coverColor: new Color(0, 0, 0, 0.3), //  background over existing game
    deselectedCardColor: new Color(0, 0, 0, 0.4), //  background over existing game
    cardBall1Pos: {x: 0.75, y: 0.55}, // fractional position on card's surface
    cardBall2Pos: {x: 0.75, y: 0.25}, // fractional position on card's surface
    cardBallSize: 0.16, // fractional to card's size
    cardSizeBounce: 0.1,
    cardRotationBounce: 0.03,
    lockReasonPos: {x: 0, y: -0.5}, // fraction position on card's surface
    lockReasonColor: new Color(1, 1, 1, 0.8),
    lockReasonSize: 0.08,
    lockReasonSubsize: 0.06,
    lockOverlayAlpha: 0.9,
    statsPosition: {x: 0.75, y: -0.1},
    statsColorLeft: new Color(0.5, 1, 0, 0.5),
    statsColorRight: new Color(0.5, 1, 0, 0.7),
    statsColorRightBad: new Color(1, 1, 0, 0.7),
    statsFontSize: 0.055,
    statsLineSpacing: 1.2,
    statsRightColAdj: {x: 0.02, y: -0.0025},
    statsRightColFontMult: 1.1,
    statsFastestWinFlames: [60, 45, 30, 15],
  },
  scoreCard: {
    bounceVelocity: 2.5,
    dampeningConstant: 1.5,
    maxSizeMultiplier: 3.0,
    minSizeMultiplier: 0.25,
    sizeMultiplier: 1,
    sizeVelocity: 0,
    springConstant: 24,
  },
} as const
