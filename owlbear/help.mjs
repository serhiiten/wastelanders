// Пустельники в Owlbear Rodeo: довідка «?» до кнопки меню (сесія Б, автор 2026-11-27, вигляд А).
// Тексти — HELP у lib/texts.mjs (свої для Доглядача й гравця, якщо різняться). ✕ і Esc закривають вікно.
import OBR from './sdk.js'
import { ID, HELP_AT, SAFE } from './lib/pick.mjs'
import { T, helpFor } from './lib/texts.mjs'
import { icon } from './lib/icons.mjs'

const $ = id => document.getElementById(id)
const k = new URLSearchParams(location.search).get('k') || ''
const close = () => OBR.popover.close(ID.help).catch(() => {})
$('close').append(icon('x')); $('close').title = T.close; $('close').setAttribute('aria-label', T.close)
$('close').onclick = close
document.addEventListener('keydown', e => { if (e.key === 'Escape') close() })

OBR.onReady(async () => {
  const setTheme = t => document.documentElement.classList.toggle('light', !!t && t.mode === 'LIGHT')
  try { setTheme(await OBR.theme.getTheme()); OBR.theme.onChange(setTheme) } catch { /* тема необов'язкова */ }
  const gm = (await OBR.player.getRole()) === 'GM'
  const h = helpFor(k, gm)
  const body = $('body')
  if (!h) { $('title').textContent = T.close; body.append(Object.assign(document.createElement('p'), { textContent: T.helpMissing })); return }
  $('title').textContent = h.title
  for (const [label, text] of [[T.helpWhat, h.what], [T.helpDoes, h.does], [T.helpHow, h.how]]) {
    const hh = document.createElement('h2'); hh.textContent = label
    const p = document.createElement('p'); p.textContent = text
    body.append(hh, p)
  }
  // висота за текстом, не вище за екран без зон Owlbear (верх вікна HELP_AT.top, знизу SAFE.bottom)
  try {
    const want = $('bar').offsetHeight + body.scrollHeight + 2
    const vh = await OBR.viewport.getHeight()
    await OBR.popover.setHeight(ID.help, Math.min(want, vh > 0 ? vh - HELP_AT.top - SAFE.bottom : want))
  } catch { /* лишається стала висота з прокруткою */ }
})
