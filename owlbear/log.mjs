// Пустельники в Owlbear Rodeo: вікно «Журнал кидків» (етап 2), вигляд Б «Картки» (автор, 2026-11-27).
// Записи кладе тло розширення (background.mjs) у localStorage цього браузера; вікно лише читає їх і оновлюється
// подією storage. Безпека (2.3): усе з повідомлення йде в DOM лише як текст; деталі кісток — деревом з detailNodes().
import OBR from './sdk.js'
import { closeLog, logAlive, logGone, logExpired } from './lib/pick.mjs'
import { T } from './lib/texts.mjs'
import { icon } from './lib/icons.mjs'
import { LOG_KEY, logGet, logClear, parseRoll, rollWhat, verdictName, detailNodes, redoText, diceDetail, edmgNote } from './lib/rolls.mjs'
import { safeStorage } from './lib/storage.mjs'
import { ctrColor } from './lib/counters-data.mjs'

const $ = id => document.getElementById(id)
const storage = safeStorage()
const list = $('list')

function el(tag, cls, ...kids) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  for (const k of kids) if (k != null) e.append(k)   // рядки стають текстовими вузлами
  return e
}
/** Дерево detailNodes → DOM: лише текст, <b>, <br> і викинута кістка. */
function detail(nodes) {
  const f = document.createDocumentFragment()
  for (const n of nodes) {
    if (n.t === 'text') f.append(n.v)
    else if (n.t === 'br') f.append(document.createElement('br'))
    else { const e = el(n.t === 'b' ? 'b' : 'span', n.t === 'off' ? 'off' : ''); e.append(detail(n.kids)); f.append(e) }
  }
  return f
}
const p2 = n => String(n).padStart(2, '0')
/** «21:04» сьогодні, «26.11 21:04» для давніших: журнал живе між сесіями. */
const when = (t, now = new Date()) => {
  const d = new Date(+t || 0), hm = p2(d.getHours()) + ':' + p2(d.getMinutes())
  return d.toDateString() === now.toDateString() ? hm : p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + ' ' + hm
}

function card(raw) {
  const e = parseRoll({ ...raw, v: 1 })   // те, що лежить у сховищі, теж перевіряємо
  if (!e) return null
  const v = e.kind === 'check' ? 'v' + e.verdict : e.kind
  const what = el('div', 'what', rollWhat(e))
  if (e.kind === 'check') {
    what.append(' ', el('span', 'vd v' + e.verdict, verdictName(e)))
    if (e.aspect && !e.re) what.append(' ' + T.logAspect)
  }
  const by = typeof raw.by === 'string' ? raw.by.slice(0, 60) : ''
  const dice = e.kind === 'dice' || e.kind === 'gen'   // «Кістки» й генератори: персонажа немає, ім'я — гравця з Owlbear
  const anon = dice || e.kind === 'ctr'                 // лічильник (сесія Б) — теж від імені Доглядача в Owlbear
  // «таємно» лише в журналі самого Доглядача: тло такий запис ніколи не кладе (кидок не розсилався)
  if (dice && raw.secret === true && raw.me === true) what.append(' ', el('span', 'vd sec', T.logSecret))
  const c = el('article', 'roll ' + v,
    e.kind === 'gen' ? el('span', 'num', icon('gen')) : el('span', 'num', String(e.total)),
    el('div', 'top', el('b', '', (anon ? by : e.who) || '?'), !anon && by ? el('span', '', by) : null),
    el('time', '', when(raw.t)),
    what,
    e.kind === 'edmg' ? el('div', 'en', edmgNote(e)) : null,
    e.kind === 'ctr' && e.desc ? el('div', 'en ctr-d', e.desc) : null,
    e.re ? el('div', 're', redoText(e.re)) : null)
  // лічильник: число на тлі від червоного (0) до зеленого (максимум), як у віконці лічильників
  if (e.kind === 'ctr') { const n = c.querySelector('.num'); n.style.background = ctrColor(e.to, e.s); n.classList.add('ctr-n') }
  if (e.kind === 'gen') {
    // «Показати всім» (етап 4б, Л1): заголовок у рядку, текст — у розгортці, лише як текст
    if (e.text) c.append(el('details', '', el('summary', '', T.logText), el('pre', 'gen', e.text)))
  } else if (dice || e.kind === 'edmg') {
    const d = el('details', '', el('summary', '', T.logDice), diceDetail(e))
    c.append(d)
  } else if (e.gx) {
    const d = el('details', '', el('summary', '', T.logDice))
    d.append(detail(detailNodes(e.gx)))
    c.append(d)
  }
  return c
}

function render() {
  const items = logGet(storage).map(card).filter(Boolean)
  list.replaceChildren(...(items.length ? items : [el('p', 'empty', storage.memory ? T.logNoStorage : T.logEmpty)]))
}

$('h-icon').replaceWith(icon('log'))
$('title').textContent = T.logTitle
$('foot').textContent = T.logFoot
$('close').append(icon('x'))
$('close').title = T.close
$('close').setAttribute('aria-label', T.close)
// ✕ і Esc — закриття вручну: далі сповіщення кидків у цій вкладці (lib/pick.mjs, notifyFor; автор, 2026-11-27)
$('close').onclick = () => closeLog(OBR, { manual: true })
// «Очистити» стирає вписане — двічі (docs/ui-rules.md §3): перший клік питає, другий стирає; 4 с без кліку — назад
const clear = $('clear')
let sureT = null
const unsure = () => { clearTimeout(sureT); clear.textContent = T.logClear; clear.classList.remove('sure') }
clear.title = T.logClearHint
unsure()
clear.onclick = () => {
  if (!clear.classList.contains('sure')) { clear.textContent = T.logClearSure; clear.classList.add('sure'); sureT = setTimeout(unsure, 4000); return }
  unsure(); logClear(storage); render()
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLog(OBR, { manual: true }) })
addEventListener('storage', e => { if (!e.key || e.key.endsWith(LOG_KEY)) render() })

render()
// «я живий» для автожурналу (lib/pick.mjs, LOG_ALIVE): Owlbear може закрити це вікно сам, не кажучи нам
// журнал, показаний після кидка, зникає сам за 10 с (автор, 2026-11-27); відкритий з меню — ні
let gone = false
logAlive(); setInterval(() => {
  logAlive()
  if (!gone && logExpired()) { gone = true; closeLog(OBR).catch(() => { gone = false }) }
}, 1000)
addEventListener('pagehide', () => logGone())
OBR.onReady(async () => {
  const setTheme = t => document.documentElement.classList.toggle('light', !!t && t.mode === 'LIGHT')
  try { setTheme(await OBR.theme.getTheme()); OBR.theme.onChange(setTheme) } catch { /* тема необов'язкова */ }
})
