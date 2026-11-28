// Пустельники в Owlbear Rodeo: табличка «Ходи» (автор, 2026-11-28, фідбек п.8, макет А). Відкриває тло лише Доглядачу.
// Клік — відкрити або згорнути вікно «Ходи Доглядача» (lib/moves-win.mjs). Пише пульс, щоб тло знало, що вона є.
import OBR from './sdk.js'
import { baseOf, session } from './lib/pick.mjs'
import { MOVES_T } from './lib/texts.mjs'
import { MOVES } from './lib/moves-data.mjs'
import { BTN_ALIVE, WIN_EVERY, fire, pulse, winOpen, toggleMoves } from './lib/moves-win.mjs'

const BASE = baseOf(location.pathname)
const ss = session()
const b = document.getElementById('b')
b.append(fire(document))
b.append(MOVES_T.btn)
b.title = MOVES.title
b.setAttribute('aria-label', MOVES.title)

const paint = () => { const on = winOpen(ss); b.classList.toggle('on', on); b.setAttribute('aria-expanded', on ? 'true' : 'false') }
OBR.onReady(() => {
  pulse(ss, BTN_ALIVE)
  setInterval(() => { pulse(ss, BTN_ALIVE); paint() }, WIN_EVERY)
  b.onclick = async () => {
    try { await toggleMoves(OBR, BASE, { ss }) } catch (e) { console.error(e) }
    paint()
  }
})
