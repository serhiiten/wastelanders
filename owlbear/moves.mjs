// Пустельники в Owlbear Rodeo: вікно «Ходи Доглядача» (автор, 2026-11-28, фідбек п.8, макет Б у темі Owlbear).
// Текст — дослівно з Foundry (lib/moves-data.mjs). ✕ і Esc закривають; клік повз вікно закриває сам Owlbear.
import OBR from './sdk.js'
import { ID, session } from './lib/pick.mjs'
import { T } from './lib/texts.mjs'
import { icon } from './lib/icons.mjs'
import { MOVES } from './lib/moves-data.mjs'
import { WIN_ALIVE, WIN_EVERY, fire, pulse, winShut, winMaxH, buildMoves } from './lib/moves-win.mjs'

const $ = id => document.getElementById(id)
const ss = session()
const close = () => { winShut(ss); return OBR.popover.close(ID.moves).catch(() => {}) }

$('title').textContent = MOVES.title
$('bar').prepend(fire(document))
$('close').append(icon('x')); $('close').title = T.close; $('close').setAttribute('aria-label', T.close)
$('close').onclick = close
document.addEventListener('keydown', e => { if (e.key === 'Escape') close() })
addEventListener('pagehide', () => winShut(ss))
buildMoves(document, $('body'), MOVES)
pulse(ss, WIN_ALIVE)
setInterval(() => pulse(ss, WIN_ALIVE), WIN_EVERY)

OBR.onReady(async () => {
  const setTheme = t => document.documentElement.classList.toggle('light', !!t && t.mode === 'LIGHT')
  try { setTheme(await OBR.theme.getTheme()); OBR.theme.onChange(setTheme) } catch { /* тема необов'язкова */ }
  // висота за текстом, не вище за екран (вікно поверх усього, знизу лише WIN.bottom)
  try {
    const want = $('bar').offsetHeight + $('body').scrollHeight + 2
    const vh = await OBR.viewport.getHeight()
    await OBR.popover.setHeight(ID.moves, Math.min(want, winMaxH(vh)))
  } catch { /* лишається стала висота з прокруткою */ }
})
