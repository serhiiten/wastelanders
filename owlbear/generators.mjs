// Пустельники в Owlbear Rodeo: «Генератори» Доглядача (етап 4б, рядки 4.3–4.5), лише вузьке вікно 460 px.
// Вікно А (автор, 2026-11-27): вкладки «Справа», «Подорож», «Натхнення», «Битви»; клік по ворогу — картка у «Ворогах»
// з другого боку екрана; «Показати всім» — простий текст у журнал кидків (Л1). Результати — localStorage цього браузера.
// Рушій — копія terminal.mjs з DEV; логіка без DOM — lib/gen-view.mjs. HTML подорожі — вивід самого рушія (не з кімнати).
import OBR from './sdk.js'
import { baseOf, openGenerators, openEnemies, ID, releasePair, session, followResize, winsGet } from './lib/pick.mjs'
import { autoOpenLog } from './lib/pick.mjs'
import { T } from './lib/texts.mjs'
import { icon } from './lib/icons.mjs'
import { sendRoll, rollAndSend, parseDice } from './lib/rolls.mjs'
import { newCid, K } from './lib/store.mjs'
import { safeStorage } from './lib/storage.mjs'
import { unpackCaravan } from './lib/caravan-data.mjs'
import { specialLeft, rerollSpecial } from './foundry/travel-special.mjs'
import {
  GEN_KEY, TABS, CASE_DIFFS, TRAVEL_TYPES, LUCKS, TABLE_CARDS, BATTLE_DIFFS, cleanGen, loadTerminal, runTable, battleAct, caseToBattle, travelToBattle,
  makeFromBattle, travelSpec, travelKindsSet, travelPlace, carLuck, luckLabel, caseFields, caseDiffName, battleBuckets, battleTitle, battleDiffName, rewardText, prettyTravel,
  caseShare, travelShare, tableShare, battleShare,
} from './lib/gen-view.mjs'

const q = new URLSearchParams(location.search)
const slot = q.get('slot') === 'b' ? 'b' : ''
const side = q.get('side') === 'right' ? 'right' : 'left'
const BASE = baseOf(location.pathname)
const myId = slot === 'b' ? ID.genB : ID.gen
const $ = id => document.getElementById(id)
const main = $('main'), strip = $('strip')
const store = safeStorage(), ss = session()
const rnd = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 2 ** 32 }
const rid = () => newCid(rnd)

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue
    if (k === 'on') e.onclick = v; else if (k === 'cls') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v)
  }
  for (const c of kids) if (c != null && c !== false) e.append(c)
  return e
}
const btn = (text, on, attrs = {}) => el('button', { type: 'button', on, ...attrs }, text)
function say(cls, text, ttl = 4000) {
  const m = el('p', { cls: 'msg ' + cls, role: cls === 'err' ? 'alert' : 'status' }, icon(cls), el('span', { cls: 't', text }))
  strip.replaceChildren(m)
  setTimeout(() => m.remove(), ttl)
}

// ---- стан і рушій ----
let st = cleanGen((() => { try { return JSON.parse(store.getItem(GEN_KEY) || 'null') } catch { return null } })())
let Tm = null   // createTerminal з результатами st
let car = null  // {name, luck} з аркуша каравану кімнати або null
const save = () => { try { store.setItem(GEN_KEY, JSON.stringify(st)) } catch { /* ок: результат лишиться до закриття */ } }
/** Дія: зміна стану, потім збереження й перемальовка; false — без цього. */
const act = fn => async (...a) => { try { if ((await fn(...a)) === false) return; save(); render() } catch (e) { console.error(e); say('err', String((e && e.message) || e)) } }

/** «Показати всім»: заголовок і текст — у журнал кидків усім (лише Доглядач; приймач перевіряє роль). */
async function share(x) {
  if (!x) return
  try { await sendRoll(OBR, 'gen', x, { who: '', id: rid() }); say('ok', T.genShared) } catch (e) { console.error(e); say('err', T.genShareFailed, 6000) }
}
const shareBtn = get => btn(T.genShare, () => share(get()), { cls: 'share', title: T.genShareHint })
const rr = (title, on) => el('button', { type: 'button', cls: 'rr', title, 'aria-label': title, on }, icon('random'))

/** Кістка в тексті результату («2d6»): таємний кидок у журнал Доглядача, як «Таємно» в «Кістках». */
async function secretDie(dice) {
  const d = parseDice(dice)
  if (!d || d.kl) return
  await rollAndSend(OBR, { counts: [[d.s, d.n]], mod: d.mod, secret: true, rnd, id: rid(), storage: store, after: () => autoOpenLog(OBR, BASE, { ss }) })
}

// HTML рушія (подорож) → вузли за білим списком: лише ці теги, клас і data-атрибути кісток і битв; решта — текст.
// DOMParser розбирає в окремий документ без скриптів; у сторінку йдуть нові вузли, зібрані тут.
const TAGS = new Set(['DIV', 'SPAN', 'P', 'B', 'STRONG', 'EM', 'I', 'SMALL', 'BR', 'UL', 'OL', 'LI', 'BUTTON'])
const ATTRS = ['data-dice', 'data-diff', 'data-idx', 'data-kinds']
function safeNodes(html) {
  const copy = n => {
    if (n.nodeType === 3) return [document.createTextNode(n.nodeValue)]
    if (n.nodeType !== 1) return []
    const kids = [...n.childNodes].flatMap(copy)
    if (!TAGS.has(n.tagName) || (n.tagName === 'BUTTON' && !n.classList.contains('die'))) return n.tagName === 'BUTTON' ? [] : kids
    const e = document.createElement(n.tagName.toLowerCase())
    const cls = (n.getAttribute('class') || '').split(/\s+/).filter(c => /^[a-z][a-z0-9-]*$/.test(c))
    if (cls.length) e.className = cls.join(' ')
    for (const a of ATTRS) { const v = n.getAttribute(a); if (v !== null && /^[\w,+-]*$/.test(v)) e.setAttribute(a, v) }
    e.append(...kids)
    return [e]
  }
  return [...new DOMParser().parseFromString(String(html || ''), 'text/html').body.childNodes].flatMap(copy)
}

// ---- вкладки ----
function seg(list, cur, on, { disabled = false, label } = {}) {
  return el('div', { cls: 'seg', role: 'group', 'aria-label': label }, ...list.map(x => btn(x.n, () => on(x.v), { 'aria-pressed': String(x.v === cur), disabled })))
}

function caseTab() {
  const nodes = [el('p', { cls: 'l', text: T.genCaseDiff }),
    seg(CASE_DIFFS, st.case.diff, act(v => { st.case.diff = v; const cs = Tm.case.setDifficulty(v); if (st.case.cs) st.case.cs = JSON.parse(JSON.stringify(cs)) }), { label: T.genCaseDiff }),
    btn(T.genCaseGo, act(() => { st.case.cs = JSON.parse(JSON.stringify(Tm.case.generate(st.case.diff))) }), { cls: 'main' })]
  if (st.case.cs) {
    const res = el('div', { cls: 'res' }, el('div', { cls: 'rh' }, el('b', { text: 'Справа' }), el('span', { cls: 'chip', text: caseDiffName(st) }), shareBtn(() => caseShare(st))))
    for (const f of caseFields(st)) {
      if (f.sub) res.append(el('div', { cls: 'sub', text: f.sub }))
      const body = el('div', {}, f.t, f.note ? el('small', { text: ' ' + f.note }) : null)
      if (f.k === 'enemies') body.append(' ', btn(T.genCaseBattle, act(() => { if (!caseToBattle(Tm, st)) { say('warn', T.genCaseBattleFail); return false } }), { title: T.genCaseBattleHint }))
      res.append(el('div', { cls: 'f' }, el('div', { cls: 'fh' }, el('span', { text: f.n }), rr(T.genReroll, act(() => { st.case.cs = JSON.parse(JSON.stringify(Tm.case.reroll(f.k))) }))), body))
    }
    nodes.push(res)
  }
  return nodes
}

function travelTab() {
  const t = st.travel, bad = t.type === 'badEncounter'
  const was = t.luckFrom
  const c = car ? carLuck(st, car.luck) : carLuck(st, null)
  if (t.luckFrom !== was) save()
  const nodes = [el('p', { cls: 'l', text: T.genTravelType }), seg(TRAVEL_TYPES, t.type, act(v => { t.type = v }), { label: T.genTravelType }),
    el('p', { cls: 'l', text: T.genTravelLuck }),
    seg(LUCKS.map(n => ({ v: n, n: luckLabel(n) })), Number(t.luck), act(v => { t.luck = v }), { disabled: bad, label: T.genTravelLuck }),
    el('p', { cls: 'mut', text: bad ? T.genTravelLuckOff : c ? T.genTravelCar(car.name, c.luck < 0 ? '−' + -c.luck : luckLabel(c.luck), c.clipped, c.used) : T.genTravelNoCar }),
    btn(T.genTravelGo, act(() => { Object.assign(t, Tm.travel.generate(t.type, Number(t.luck))) }), { cls: 'main' })]
  if (t.main || t.additional) {
    const box = el('div', { cls: 'tv' }, ...safeNodes(prettyTravel((t.main || '') + (t.additional || ''))))
    enhanceTravel(box)
    nodes.push(el('div', { cls: 'res' }, el('div', { cls: 'rh' }, el('b', { text: bad ? 'Погана зустріч' : 'Подорож Пусткою' }), shareBtn(() => travelShare(st))), box))
  }
  return nodes
}
/** Кнопки в HTML подорожі: кістки, «Інші види» й «Створити битву» під битвами, «Перекинути» особливої зустрічі. */
function enhanceTravel(box) {
  box.querySelectorAll('button.die').forEach(b => { b.type = 'button'; b.title = T.genDieHint(b.dataset.dice || ''); b.onclick = () => secretDie(b.dataset.dice).catch(e => console.error(e)) })
  box.querySelectorAll('.battle-encounter').forEach((sec, i) => {
    const span = sec.querySelector('.tvb')
    if (!span) return
    const rndKinds = span.classList.contains('tvb-rnd')
    sec.append(el('div', { cls: 'acts' },
      rndKinds ? btn(T.genTravelKinds, act(() => travelKinds(i)), { title: T.genTravelKindsHint }) : null,
      btn(T.genCaseBattle, act(() => travelBattle(i)), { cls: 'main', title: T.genTravelBattleHint })))
  })
  box.querySelectorAll('.special-encounter').forEach(sec => {
    const left = specialLeft(st.travel.main, Tm.travel.specials())
    const b = btn(T.genSpecialReroll, act(() => { const h = rerollSpecial(st.travel.main, Tm.travel.specials()); if (!h) return false; st.travel.main = h }), { title: left ? T.genSpecialHint : T.genSpecialNone, disabled: !left })
    const head = sec.querySelector(':scope > .result-title')
    head ? head.append(b) : sec.append(b)
  })
}
function travelKinds(i) {
  const sp = travelSpec(st.travel.additional, i)
  if (!sp || !sp.rnd) return false
  const ks = Tm.travel.kindsRoll(sp.kinds)
  const html = travelKindsSet(st.travel.additional, i, ks, Tm.travel.randomText(ks))
  if (!html) return false
  st.travel.additional = html
}
function travelBattle(i) {
  const sp = travelSpec(st.travel.additional, i)
  if (!sp) return false
  const place = travelPlace(st.travel.additional, i)
  const spec = sp.rnd ? { diff: sp.diff, kinds: sp.kinds, place } : { diff: sp.diff, idx: sp.idx, place }
  if (!travelToBattle(Tm, st, spec)) { say('warn', T.genTravelBattleFail); return false }
}

function tablesTab() {
  return TABLE_CARDS.map(c => {
    const sels = (c.sels || []).map(s => {
      const sel = el('select', { 'aria-label': s.n, title: s.n }, ...s.opts.map(([v, n]) => el('option', { value: v, selected: String(st.tables.sel[s.k]) === v, text: n })))
      sel.onchange = act(() => { st.tables.sel[s.k] = sel.value })
      return sel
    })
    const out = st.tables.out[c.id] || ''
    return el('div', { cls: 'res tbl' }, el('div', { cls: 'rh' }, el('b', { text: c.n })),
      sels.length ? el('div', { cls: 'sels' }, ...sels) : null,
      out ? el('div', { cls: 'out', text: out }) : null,
      el('div', { cls: 'btns' }, btn(T.genTablesGo, act(() => { st.tables.out[c.id] = runTable(Tm, c, st.tables.sel) }), { cls: 'main go' }),
        out ? shareBtn(() => tableShare(st, c.id)) : null))
  })
}

let clearArm = 0
function battleTab() {
  const b = st.battle
  const kinds = Tm.battle.kinds()
  const nodes = [el('p', { cls: 'l', text: T.genBattleDiff }), seg(BATTLE_DIFFS, b.difficulty, act(v => { b.difficulty = v }), { label: T.genBattleDiff }),
    el('p', { cls: 'l', text: T.genBattleKinds }),
    el('div', { cls: 'kinds', role: 'group', 'aria-label': T.genBattleKinds }, ...kinds.map(k => btn(k.name, act(() => {
      const on = b.kinds.includes(k.key), ks = b.kinds.filter(x => x !== k.key)
      if (!on) ks.push(k.key)
      b.kinds = kinds.map(x => x.key).filter(x => ks.includes(x))
    }), { 'aria-pressed': String(b.kinds.includes(k.key)) }))),
    btn(T.genBattleGo, act(() => { const r = battleAct(Tm, st, B => B.generate(b.difficulty, b.kinds), true); if (r !== true) { say('warn', T.genBattleNoKinds); return false } }), { cls: 'main' })]
  const s = b.state
  if (s && s.last) {
    const box = (name, hint, val, on) => el('div', {}, el('div', { cls: 'fh' }, el('span', { text: name }), rr(hint, on)), val || '—')
    const res = el('div', { cls: 'res' },
      el('div', { cls: 'rh' }, el('b', { text: 'Битва: ' + battleTitle(Tm, st) }), el('span', { cls: 'chip', text: battleDiffName(st) }), shareBtn(() => battleShare(Tm, st))),
      el('div', { cls: 'trio' },
        box(T.genPlace, T.genPlaceHint, s.place, act(() => { battleAct(Tm, st, B => B.rollScene('place')) })),
        box(T.genHazard, T.genHazardHint, s.hazard, act(() => { battleAct(Tm, st, B => B.rollScene('hazard')) })),
        box(T.genReward, T.genRewardHint, rewardText(st), act(() => { battleAct(Tm, st, B => B.rollReward()) }))))
    for (const k of battleBuckets(Tm, st)) {
      res.append(el('div', { cls: 'bucket' }, el('p', { cls: 'l', text: `${k.label} · ${k.count}` }),
        ...k.cards.map(c => el('div', { cls: 'enrow' }, btn('', () => openCard(c), { cls: 'en ' + c.cat, title: c.book ? T.genEnemyTip(c.name, k.label) : T.genEnemyNoBook(c.name), 'aria-disabled': c.book ? null : 'true' }),
          // без бестіарію значка немає, але місце під нього лишається: рядки битви однакової ширини (ревізор 4б)
          c.book ? el('button', { type: 'button', cls: 'tok', title: T.genToTokens(c.name), 'aria-label': T.genToTokens(c.name), on: () => toTokens(c) }, icon('enemy')) : el('span', { cls: 'tok gap', 'aria-hidden': 'true' })))))
      const list = res.lastChild.querySelectorAll('button.en')
      k.cards.forEach((c, i) => list[i].replaceChildren(el('b', {}, c.name, c.kind ? el('small', { text: c.kind }) : null), el('span', { cls: 'st', text: T.genHpArmor(c.hp, c.armor) }), el('span', { cls: 'n', text: '× ' + c.count })))
    }
    res.append(el('p', { cls: 'mut', text: T.genBattleHint }),
      btn(clearArm ? T.genClearSure : T.genClear, act(() => {
        if (!clearArm) { clearArm = setTimeout(() => { clearArm = 0; render() }, 3000); return }
        clearTimeout(clearArm); clearArm = 0; b.state = null; b.picks = {}; Tm = null; ensureT()
      })))
    nodes.push(res)
  }
  return nodes
}
/** Значок біля ворога (4.4, автор 2026-11-27): вибрані токени стають цим ворогом, як «Зробити ворогом…». */
async function toTokens(c) {
  try {
    const res = await makeFromBattle(OBR, c.book, { w: 'gen' + rid() })
    if (res.nobook) return say('warn', T.genEnemyNoBook(c.name), 6000)
    if (res.none) return say('warn', T.genToTokensNone, 6000)
    const refused = res.refused.length ? T.enMakeRefused(res.refused.map(r => `«${r.label}»`).join(', ')) : ''
    if (!res.made.length) return say('err', refused, 8000)
    say(refused ? 'warn' : 'ok', [T.enMakeDone(res.made.length), refused].filter(Boolean).join(' '), refused ? 8000 : 5000)
  } catch (e) { console.error(e); say('err', T.enWriteFailed(String((e && e.message) || e)), 6000) }
}
/** Клік по ворогу (4.4): його картка з бестіарію у «Ворогах», з другого боку екрана, щоб битву було видно. */
function openCard(c) {
  if (!c.book) return say('warn', T.genEnemyNoBook(c.name))
  const qs = 'book=' + encodeURIComponent(c.book.id) + (c.book.as ? '&kind=' + encodeURIComponent(c.book.as) : '')
  openEnemies(OBR, BASE, { q: qs, dock: side === 'left' ? 'right' : 'left' }).catch(e => { console.error(e); say('err', String((e && e.message) || e)) })
}

// ---- малювання ----
const TABF = { case: caseTab, travel: travelTab, tables: tablesTab, battle: battleTab }
function ensureT() { if (!Tm) Tm = loadTerminal(createTerminal, st) }
let createTerminal = null
// фокус клавіатури після перемальовки (ревізор 2026-11-27): та сама кнопка чи список за порядком у вкладці, як keepFocus «Ворогів»
const focusables = () => [...main.querySelectorAll('button, select')]
function render() {
  ensureT()
  for (const b of $('tabs').children) {
    const on = b.dataset.tab === st.tab
    b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1
    if (on) main.setAttribute('aria-labelledby', b.id)
  }
  const top = main.scrollTop, ae = document.activeElement
  const at = main.contains(ae) ? focusables().indexOf(ae) : -1
  main.replaceChildren(...TABF[st.tab]())
  main.scrollTop = top
  if (at >= 0) { const list = focusables(), f = list[Math.min(at, list.length - 1)]; if (f) f.focus({ preventScroll: true }) }
}
function tabs() {
  $('tabs').replaceChildren(...TABS.map(t => {
    const b = el('button', { type: 'button', role: 'tab', id: 'tab-' + t.id, 'aria-controls': 'main', 'data-tab': t.id, text: t.label })
    b.onclick = () => { st.tab = t.id; save(); main.scrollTop = 0; render() }
    b.onkeydown = e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const i = TABS.findIndex(x => x.id === st.tab), n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
      st.tab = n.id; save(); render(); $('tabs').querySelector(`[data-tab="${n.id}"]`).focus()
    }
    return b
  }))
}

/** Удача партії з аркуша каравану кімнати (етап 3): назва й Удача, або null. */
async function readCaravan(meta) {
  const d = await unpackCaravan((meta || {})[K.caravan])
  car = d && d.st ? { name: typeof d.st.companyName === 'string' ? d.st.companyName.slice(0, 80) : '', luck: Number.isInteger(d.st.luck) ? d.st.luck : 0 } : null
}

// ---- смуга вікна ----
$('b-icon').replaceChildren(icon('gen'))
$('b-title').textContent = T.genTitle
for (const [id, to, ic, t] of [['b-left', 'left', 'dockL', T.dockLeft], ['b-right', 'right', 'dockR', T.dockRight]]) {
  const b = $(id); b.append(icon(ic)); b.title = t; b.setAttribute('aria-label', t)
  b.onclick = () => { save(); openGenerators(OBR, BASE, { from: 'narrow', slot, dock: to }).catch(e => console.error(e)) }
}
$('b-close').append(icon('x')); $('b-close').title = T.close; $('b-close').setAttribute('aria-label', T.close)
// «Вороги» з другого боку повертають звичайну ширину (пара на вузькому екрані, lib/pick.mjs releasePair)
const closeWin = async () => { save(); await releasePair(OBR, myId); return OBR.popover.close(myId) }
$('b-close').onclick = closeWin
// Owlbear закрив вікно сам (не ✕): «Вороги» з другого боку теж повертають ширину (ревізор, 2026-11-27)
const myKey = (winsGet(session())[myId] || {}).k || ''
addEventListener('pagehide', () => { if (myKey) releasePair(OBR, myId, session(), myKey).catch(() => {}) })
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) closeWin() })

OBR.onReady(async () => {
  const setTheme = t => document.documentElement.classList.toggle('light', !!t && t.mode === 'LIGHT')
  try { setTheme(await OBR.theme.getTheme()); OBR.theme.onChange(setTheme) } catch { /* тема необов'язкова */ }
  // зміна розміру вікна браузера: вікно стає за тими самими правилами (lib/pick.mjs, followResize)
  followResize(OBR, myId, plan => { save(); return openGenerators(OBR, BASE, { from: 'narrow', slot, dock: plan.side }) })
  // сторінка сама перевіряє роль: гравець, що відкрив адресу, генераторів не бачить
  if ((await OBR.player.getRole()) !== 'GM') return main.replaceChildren(el('p', { cls: 'center mut', text: T.genGmOnly }))
  ;({ createTerminal } = await import('./foundry/terminal.mjs'))
  try { await readCaravan(await OBR.room.getMetadata()) } catch (e) { console.error(e) }
  OBR.room.onMetadataChange(async meta => { const was = JSON.stringify(car); await readCaravan(meta).catch(() => {}); if (st.tab === 'travel' && JSON.stringify(car) !== was) render() })
  tabs()
  render()
})
