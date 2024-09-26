import {$, isMobile} from './site-utils'
import {GameLoader} from '../game-loader'
import {MenuAutoHider} from './menu-auto-hide'
import {timeout} from '../utils'
/**
 * any site JavaScript can start here.
 */
class Site {
  private gameLoader?: GameLoader
  constructor() {
    this.addHandlers()
  }
  public async run() {
    await timeout(250) // all we are saying...is give paint a chance
    console.log('running. isMobileDevice=', isMobile())
    if ($('#game-canvas-wrapper')) {
      this.loadGame()
    }
  }
  private addHandlers() {
    const btnEraseStorage = $('#btn-erase-storage')
    btnEraseStorage?.addEventListener('click', () => this.eraseLocalStorage())
    window.addEventListener('keydown', (e: KeyboardEvent) => this.keyDown(e))
    window.addEventListener('touchend', (e: TouchEvent) => this.endTouch(e))
  }
  private eraseLocalStorage() {
    if (confirm('Are you sure? This will clear your game stats.')) {
      window.localStorage.clear()
      alert('done!')
      window.location.reload()
    }
  }
  private async loadGame() {
    this.gameLoader = new GameLoader($('#game-canvas-wrapper'), $('#load-stats'), () => {
      $('#game-canvas-wrapper').classList.add('loaded')
      $('#game-load-wrapper').classList.add('loaded')
    })
  }
  private async launchGame() {
    const gL = this.gameLoader
    if (gL) {
      if (gL.isLoaded && !gL.isRunning) {
        $('body').classList.add('in-game')
        new MenuAutoHider(gL.game)
        await gL.run()
        await window.location.reload()
      }
    }
  }
  private keyDown(e: KeyboardEvent) {
    if (e.key === ' ') this.launchGame()
  }
  private endTouch(e: TouchEvent) {
    console.log(e)
    this.launchGame()
  }
}
export {Site}
