// Пустельники в Owlbear Rodeo: меню кнопки розширення (popover): «Мій аркуш» (Доглядачу «Аркуш персонажа»),
// «Зробити перевірку» (вузьке вікно одразу на панелі перевірки, автор 2026-11-27), «Журнал кидків» (етап 2) і «Караван» (етап 3).
import OBR from './sdk.js'
import { pickToken, tokenList, openSheet, openLog, openCaravan, openEnemies, openGenerators, openQuick, openCounters, openHelp, closeHelp, baseOf, session, autoOpenLog } from './lib/pick.mjs'
import { DICE, rollAndSend, diceLabel } from './lib/rolls.mjs'
import { safeStorage } from './lib/storage.mjs'
import { T, helpFor } from './lib/texts.mjs'
import { icon } from './lib/icons.mjs'

const BASE = baseOf(location.pathname)
const $ = id => document.getElementById(id)
const out = $('out')
$('title').textContent = T.menuTitle
$('h-icon').replaceWith(icon('sheet'))

function para(text, cls = '') { const p = document.createElement('p'); p.textContent = text; if (cls) p.className = cls; return p }

async function open(id, roll) {
  await openSheet(OBR, BASE, id, roll ? { narrow: true, roller: true } : {})
  try { await OBR.action.close() } catch { /* меню могло вже закритися */ }
}

// Поки показано список токенів, він стежить за сценою: видалений токен зникає з нього одразу (автор, 2026-11-27).
let unwatch = null
const stopWatch = () => { if (unwatch) { try { unwatch() } catch { /* ок */ } unwatch = null } }

function noneCard() {
  const card = document.createElement('div'); card.className = 'card no mini'
  const big = document.createElement('div'); big.className = 'big'; big.append(icon('user'))
  card.append(big, para(T.menuNone), para(T.menuNoneHint, 'mut'))
  return card
}

function showList(items, role, roll) {
  out.replaceChildren()
  if (!items.length) return out.append(role === 'GM' ? para(T.menuGmNone) : noneCard())
  const list = document.createElement('div'); list.className = 'list'
  for (const t of items) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'row-btn'
    const av = document.createElement('span'); av.className = 'av'; av.setAttribute('aria-hidden', 'true'); av.textContent = [...(t.name || '?')][0]
    const tx = document.createElement('span'); tx.className = 'tx'
    tx.append(t.who ? `${t.name} (${t.who})` : t.name)
    const sub = [role === 'GM' && t.n ? T.menuOwner(t.n) : '', t.sheet ? '' : T.menuNoSheet].filter(Boolean).join(', ')
    if (sub) { const s = document.createElement('small'); s.textContent = sub; tx.append(s) }
    const arr = document.createElement('span'); arr.className = 'arr'; arr.setAttribute('aria-hidden', 'true'); arr.textContent = '›'
    b.append(av, tx, arr)
    b.onclick = () => open(t.id, roll)
    list.append(b)
  }
  const h = document.createElement('h2'); h.textContent = role === 'GM' ? T.menuListGm : T.menuListMine
  out.append(h, list)
}

async function go(roll = false) {
  stopWatch()
  out.replaceChildren()
  if (!(await OBR.scene.isReady())) return out.append(para(T.menuNoScene))
  const [id, name, role, selection, items] = await Promise.all([
    OBR.player.getId(), OBR.player.getName(), OBR.player.getRole(), OBR.player.getSelection(), OBR.scene.items.getItems(),
  ])
  const me = { id, name, role }
  const r = pickToken(items, me, selection)
  if (r.kind === 'open') return open(r.id, roll)
  if (r.kind === 'none') return out.append(noneCard())
  if (r.kind === 'gm-none') return out.append(para(T.menuGmNone))
  showList(r.list, role, roll)
  // перемальовувати лише, коли змінився склад списку: рух токена не збиває фокус і наведення (ревізор 2026-11-27)
  let was = JSON.stringify(r.list)
  unwatch = OBR.scene.items.onChange(all => { const l = tokenList(all, me), now = JSON.stringify(l); if (now !== was) { was = now; showList(l, role, roll) } })
}

// ---- вкладка «Кістки» (автор, 2026-11-27, варіант К3): лічильник на кожну кістку, модифікатор ±N, у Доглядача «Таємно» ----
// Стан вкладки (лічильники, dN, модифікатор, вкладка) пам'ятає ця вкладка браузера: меню щоразу відкривається заново.
const ss = session()
const DKEY = 'pust-obr-dice'
const clampInt = (v, lo, hi, d) => { const n = Math.round(+v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d }
function dload() {
  let o = {}
  try { o = JSON.parse(ss.getItem(DKEY) || '{}') || {} } catch { /* зіпсоване — з нуля */ }
  const c = o.c && typeof o.c === 'object' ? o.c : {}
  return {
    tab: o.tab === 'dice' ? 'dice' : 'sheets',
    c: Object.fromEntries([...DICE.sides.map(String), 'N'].map(k => [k, clampInt(c[k], 0, DICE.count, 0)])),
    n: clampInt(o.n, DICE.nMin, DICE.nMax, 20), mod: clampInt(o.mod, -DICE.mod, DICE.mod, 0), secret: o.secret === true,
  }
}
const ds = dload()
const dsave = () => { try { ss.setItem(DKEY, JSON.stringify(ds)) } catch { /* без пам'яті теж працює */ } }
const counts = () => [...DICE.sides.map(s => [s, ds.c[s]]), [ds.n, ds.c.N]]
let gm = false

function setTab(tab) {
  ds.tab = tab; dsave()
  for (const [t, p] of [['sheets', 'p-sheets'], ['dice', 'p-dice']]) {
    $('t-' + t).setAttribute('aria-selected', String(t === tab)); $('t-' + t).tabIndex = t === tab ? 0 : -1
    $(p).hidden = t !== tab
  }
}
function input(id, val, lo, hi, label, on) {
  const i = document.createElement('input')
  Object.assign(i, { id, type: 'number', min: lo, max: hi, step: 1, value: val, inputMode: 'numeric' })
  i.setAttribute('aria-label', label)
  i.onchange = () => { i.value = on(clampInt(i.value, lo, hi, lo)) }
  return i
}
function step(txt, label, f) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.title = label; b.setAttribute('aria-label', label); b.onclick = f
  return b
}
function diceRows() {
  const g = $('dice'); g.replaceChildren()
  const row = (labelEl, name, get, set, lo, hi, id) => {
    const f = input(id, get(), lo, hi, T.diceCount(name), v => { set(v); dsave(); refresh(); return v })
    const bump = d => () => { f.value = clampInt(get() + d, lo, hi, lo); set(+f.value); dsave(); refresh() }
    g.append(labelEl, step('−', T.diceLess(name), bump(-1)), f, step('+', T.diceMore(name), bump(1)))
  }
  for (const s of DICE.sides) {
    const l = document.createElement('label'); l.htmlFor = 'd-c' + s; l.textContent = 'd' + s
    row(l, 'd' + s, () => ds.c[s], v => { ds.c[s] = v }, 0, DICE.count, 'd-c' + s)
  }
  const ln = document.createElement('label'); ln.htmlFor = 'd-n'
  ln.append('d', input('d-n', ds.n, DICE.nMin, DICE.nMax, T.diceSides, v => { ds.n = v; dsave(); refresh(); return v }))
  ln.querySelector('input').className = 'sides'
  row(ln, 'dN', () => ds.c.N, v => { ds.c.N = v }, 0, DICE.count, 'd-cN')
  const lm = document.createElement('label'); lm.htmlFor = 'd-mod'; lm.className = 'modl'; lm.textContent = T.diceMod
  const fm = input('d-mod', ds.mod, -DICE.mod, DICE.mod, T.diceMod, v => { ds.mod = v; dsave(); refresh(); return v })
  const bm = d => () => { ds.mod = clampInt(ds.mod + d, -DICE.mod, DICE.mod, 0); fm.value = ds.mod; dsave(); refresh() }
  g.append(lm, step('−', T.diceLess(T.diceMod.toLowerCase()), bm(-1)), fm, step('+', T.diceMore(T.diceMod.toLowerCase()), bm(1)))
}
function refresh() {
  const any = counts().some(([, n]) => n > 0)
  const b = $('d-roll')
  b.disabled = !any
  b.textContent = any ? T.diceRollWhat(diceLabel(counts(), ds.mod)) : T.diceRoll
  b.title = any ? '' : T.diceNone
  $('d-hint').textContent = gm && ds.secret ? T.diceSecretHint : T.diceHint
}
const rid = () => { const a = new Uint32Array(2); crypto.getRandomValues(a); return a[0].toString(36) + a[1].toString(36) }
const rnd = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 2 ** 32 }
async function throwDice() {
  const secret = gm && ds.secret
  const m = await rollAndSend(OBR, { counts: counts(), mod: ds.mod, secret, rnd, id: rid(), storage: safeStorage(), after: () => autoOpenLog(OBR, BASE, { ss }) })
  if (m) $('d-last').textContent = (secret ? T.diceLastSecret : T.diceLast)(diceLabel(m.g, m.mod), m.total)
}

OBR.onReady(async () => {
  const setTheme = t => document.documentElement.classList.toggle('light', !!t && t.mode === 'LIGHT')
  try { setTheme(await OBR.theme.getTheme()); OBR.theme.onChange(setTheme) } catch { /* тема необов'язкова */ }
  gm = (await OBR.player.getRole()) === 'GM'
  $('t-sheets').textContent = T.menuTabSheets
  $('t-dice').textContent = T.menuTabDice
  $('t-sheets').onclick = () => setTab('sheets')
  $('t-dice').onclick = () => setTab('dice')
  $('t-sheets').onkeydown = $('t-dice').onkeydown = e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const t = ds.tab === 'dice' ? 'sheets' : 'dice'; setTab(t); $('t-' + t).focus() } }
  diceRows()
  $('secret-row').hidden = !gm
  $('d-secret-t').textContent = T.diceSecret
  $('d-secret').checked = ds.secret
  $('d-secret').onchange = () => { ds.secret = $('d-secret').checked; dsave(); refresh() }
  $('d-roll').onclick = () => throwDice().catch(e => { console.error(e); $('d-last').textContent = T.diceFailed })
  refresh()
  setTab(ds.tab)
  $('go').replaceChildren(icon('sheet'), gm ? T.menuGm : T.menuMine)
  $('hint').textContent = gm ? T.menuGmHint : ''
  const fail = e => { console.error(e); out.replaceChildren(para(String((e && e.message) || e))) }
  $('go').onclick = () => go().catch(fail)
  $('roll').replaceChildren(icon('dice'), T.menuRoll)
  $('roll').title = gm ? T.menuRollGmHint : T.menuRollHint
  $('roll').onclick = () => go(true).catch(fail)
  $('log').replaceChildren(icon('log'), T.menuLog)
  $('log').onclick = () => openLog(OBR, BASE).then(() => OBR.action.close()).catch(fail)
  $('caravan').replaceChildren(icon('caravan'), T.menuCaravan)
  $('caravan').title = T.menuCaravanHint
  $('caravan').onclick = () => openCaravan(OBR, BASE).then(() => OBR.action.close()).catch(fail)
  // «Вороги» (етап 4): лише Доглядачу
  $('enemies').hidden = !gm
  $('enemies').replaceChildren(icon('enemy'), T.menuEnemies)
  $('enemies').title = T.menuEnemiesHint
  $('enemies').onclick = () => openEnemies(OBR, BASE).then(() => OBR.action.close()).catch(fail)
  // «Генератори» (етап 4б): лише Доглядачу
  $('gen').hidden = !gm
  $('gen').replaceChildren(icon('gen'), T.menuGen)
  $('gen').title = T.menuGenHint
  $('gen').onclick = () => openGenerators(OBR, BASE).then(() => OBR.action.close()).catch(fail)
  // «Швидкий старт» — обом ролям; «Лічильники» — лише Доглядачу (сесія Б, автор 2026-11-27)
  $('quick').replaceChildren(icon('book'), T.menuQuick)
  $('quick').title = T.menuQuickHint
  $('quick').onclick = () => openQuick(OBR, BASE).then(() => OBR.action.close()).catch(fail)
  $('counters').replaceChildren(icon('counter'), T.menuCounters)
  $('counters').title = T.menuCountersHint
  $('counters').onclick = () => openCounters(OBR, BASE, { form: true }).then(() => OBR.action.close()).catch(fail)
  for (const id of ['enemies', 'gen', 'counters']) $(id).closest('.it').hidden = !gm
  // довідка «?» (вигляд А): кружечок біля кожної кнопки вкладки «Аркуші», крім «Кісток»; вікно праворуч від меню
  let shown = ''
  for (const b of document.querySelectorAll('.qh')) {
    const k = b.dataset.h, h = helpFor(k, gm)
    b.textContent = '?'
    const label = T.helpBtn(h ? h.title : k)
    b.title = label; b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', 'false')
    b.onclick = async () => {
      const again = shown === k
      for (const x of document.querySelectorAll('.qh')) x.setAttribute('aria-pressed', 'false')
      shown = again ? '' : k
      try { await (again ? closeHelp(OBR) : openHelp(OBR, BASE, k)) } catch (e) { console.error(e) }
      if (!again) b.setAttribute('aria-pressed', 'true')
    }
  }
  addEventListener('pagehide', () => { closeHelp(OBR).catch(() => {}) })   // меню закрилось — довідка теж
  // меню росте під нові рядки, але не вище за екран (Owlbear сам ставить вікно меню)
  try {
    const vh = await OBR.viewport.getHeight()
    const want = Math.ceil(document.body.scrollHeight) + 8
    if (want > 480) await OBR.action.setHeight(Math.min(want, vh > 0 ? vh - 120 : want))
  } catch { /* лишається 480 з прокруткою */ }
})
