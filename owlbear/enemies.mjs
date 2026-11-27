// Пустельники в Owlbear Rodeo: сторінка «Вороги» (етап 4), лише Доглядач, лише вузьке вікно 460 px.
// Макет Б «Дві сторінки» (автор, 2026-11-27): список (пошук, «У бою», «Свої», бестіарій за групами) і картка з «‹ До списку».
// Режими з адреси: item=<id> — картка токена; make=<id>,<id> — «Зробити ворогом…»; book=<id> — перегляд з бестіарію.
// Логіка запису — lib/enemy-ctl.mjs (черга, гонка onChange); що показувати — lib/enemy-view.mjs; рядки з токена — лише textContent.
import OBR from './sdk.js'
import { baseOf, openEnemies, ID, releasePair, followResize, winsGet, session } from './lib/pick.mjs'
import { T } from './lib/texts.mjs'
import { icon } from './lib/icons.mjs'
import { sendRoll, rollEnemy } from './lib/rolls.mjs'
import { newCid } from './lib/store.mjs'
import { barOf } from './lib/enemy-bar.mjs'
import { BOOK, enemyFromBook, cleanSystem } from './lib/enemy-data.mjs'
import { createEnemyCtl } from './lib/enemy-ctl.mjs'
import { makeEnemies, removeEnemy } from './lib/enemy-bars.mjs'
import { battleList, bookGroups, cardModel, ammoClick, markClick, clearMarks, limitText, attackRoll } from './lib/enemy-view.mjs'
import { formPage } from './lib/enemy-form.mjs'

const q = new URLSearchParams(location.search)
const slot = q.get('slot') === 'b' ? 'b' : ''
const BASE = baseOf(location.pathname)
const $ = id => document.getElementById(id)
const main = $('main'), strip = $('strip')
const myId = slot === 'b' ? ID.enemiesB : ID.enemies

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue
    if (k === 'on') e.onclick = v; else if (k === 'cls') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v)
  }
  for (const c of kids) if (c != null && c !== false) e.append(c)
  return e
}
function say(key, cls, text, { ttl = 0 } = {}) {
  const old = strip.querySelector(`[data-k="${key}"]`)
  const m = el('p', { cls: 'msg ' + cls, 'data-k': key, role: cls === 'err' ? 'alert' : 'status' }, icon(cls), el('span', { cls: 't', text }))
  if (!ttl) m.append(el('button', { type: 'button', on: () => m.remove() }, T.dismiss))
  else { m.append(el('i', { cls: 'ttl', style: `animation-duration:${ttl}ms`, 'aria-hidden': 'true' })); setTimeout(() => m.remove(), ttl) }
  old ? old.replaceWith(m) : strip.append(m)
}
const rnd = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 2 ** 32 }
const rid = () => newCid(rnd)

// ---- стан сторінки ----
let view = { mode: 'list' }   // list | card | book | make | form
let search = '', openGroups = new Set(), removeArm = false
const ctl = createEnemyCtl({
  OBR, rand: rnd,
  onState: () => { if (view.mode === 'card') render() },
  onError: e => say('w', 'err', e && e.code === 'too-big' ? T.enTooBig : T.enWriteFailed(String((e && e.message) || e))),
})

function setBar(title, { back = false, ic = 'enemy' } = {}) {
  $('b-back').hidden = !back
  $('b-icon').replaceChildren(icon(ic))
  $('b-title').textContent = title
}
/** Перерисувати з тим самим фокусом (data-f). */
async function keepFocus(f) {
  const k = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.f
  const a = document.activeElement
  const sel = a && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null
  const top = main.scrollTop
  await f()
  main.scrollTop = top
  if (k) {
    const n = main.querySelector(`[data-f="${CSS.escape(k)}"]`)
    if (n) { n.focus(); if (sel && typeof n.setSelectionRange === 'function') try { n.setSelectionRange(sel[0], sel[1]) } catch { /* не текстове поле */ } }
  }
}

// ---- кидки: усім, завжди (автор, 2026-11-27), підпис — підпис токена ----
function roll(who, d) {
  const r = rollEnemy(d.dice, d.type, rnd)
  if (!r) return
  const p = sendRoll(OBR, 'edmg', { ...r, name: d.name, note: d.note || '' }, { who, id: rid() })
  if (p) p.catch(e => { console.error(e); say('roll', 'err', T.enRollFailed, { ttl: 8000 }) })
}
/** Кістки в тексті ходу без шкоди (лікування, кількість) — звичайні кістки. */
function rollPlain(who, d) {
  const r = rollEnemy(d.dice, 'phys', rnd)
  if (!r) return
  const p = sendRoll(OBR, 'dice', { g: r.g, mod: r.mod }, { who, id: rid() })
  if (p) p.catch(e => { console.error(e); say('roll', 'err', T.enRollFailed, { ttl: 8000 }) })
}
const diceBtn = (label, type, title, on, f) => el('button', { type: 'button', cls: 'dice', 'data-t': type, title, 'aria-label': title, on, 'data-f': f }, icon('dice'), label)

// ---- список ----
async function renderList() {
  const make = view.mode === 'make'
  setBar(make ? T.enMakeTitle : T.enTitle, { back: !!view.back })
  const items = await OBR.scene.items.getItems()
  const nodes = []
  if (make) {
    nodes.push(el('p', { cls: 'mut', text: T.enMakeHint(Math.max(1, view.ids.length - (view.refused || []).length)) }))
    const chars = view.refused || []
    if (chars.length) nodes.push(el('p', { cls: 'msg warn' }, icon('warn'), el('span', { cls: 't', text: T.enMakeRefused(chars.map(c => `«${c}»`).join(', ')) })))
  }
  const box = el('input', { type: 'search', placeholder: T.enSearch, 'aria-label': T.enSearch, value: search, 'data-f': 'search' })
  box.oninput = () => { search = box.value; keepFocus(renderList) }   // і «Свої», і бестіарій
  nodes.push(box)
  if (!make) {
    const fight = battleList(items)
    nodes.push(el('h2', { title: T.enInBattleHint, text: T.enInBattle }))
    if (!fight.length) nodes.push(el('p', { cls: 'mut', text: T.enNoBattle }))
    else nodes.push(el('div', { cls: 'rows' }, ...fight.map(t => el('button', { type: 'button', cls: 'rw', 'data-f': 'b:' + t.id, on: () => openCard(t.id, true) },
      el('i', { cls: 'dot ' + t.cat }), el('span', { cls: 'n', text: t.label }, t.hidden ? el('small', { text: ` (${T.enHidden})` }) : null),
      el('span', { cls: 'h', text: t.bad ? T.enBad : t.hp ? `${t.hp.value}/${t.hp.max}` : '' })))))
  }
  const own = formPage.ownList()
  if (own.length || make) {
    nodes.push(el('h2', { text: T.enOwn }))
    const rows = own.filter(o => !search || o.name.toLowerCase().includes(search.toLowerCase())).map(o => el('button', { type: 'button', cls: 'rw', 'data-f': 'o:' + o.id, on: () => make ? doMake(formPage.ownRecord(o.id)) : openOwn(o.id) },
      el('i', { cls: 'dot ' + o.cat }), el('span', { cls: 'n', text: o.name }), el('span', { cls: 'h', text: String(o.hp) })))
    nodes.push(el('div', { cls: 'rows' }, ...rows))
    if (make) nodes.push(el('div', { cls: 'foot' }, el('button', { type: 'button', cls: 'main', 'data-f': 'own-new', on: () => openForm({ kind: 'new' }) }, T.enOwnNew)))
  }
  nodes.push(el('h2', { text: T.enBook }))
  const gbox = el('div')
  fillGroups(gbox, make)
  nodes.push(gbox)
  main.replaceChildren(...nodes)
}
function fillGroups(box, make) {
  const groups = bookGroups(search)
  if (!groups.length) return box.replaceChildren(el('p', { cls: 'mut', text: T.enNothing }))
  box.replaceChildren(...groups.map(g => {
    const d = el('details', { open: !!search || openGroups.has(g.n) })
    d.ontoggle = () => { if (!search) d.open ? openGroups.add(g.n) : openGroups.delete(g.n) }
    d.append(el('summary', { text: `${g.n} (${g.items.length})` }), el('div', { cls: 'rows' }, ...g.items.map(b => el('button', {
      type: 'button', cls: 'rw', 'data-f': 'k:' + b.id, on: () => make ? doMake(enemyFromBook(b.id)) : openBook(b.id),
    }, el('i', { cls: 'dot ' + b.cat }), el('span', { cls: 'n', text: b.name }), el('span', { cls: 'h', text: String(b.hp) })))))
    return d
  }))
}

async function doMake(rec) {
  if (!rec) return
  try {
    const res = await makeEnemies(OBR, view.ids, rec, { w: 'mk' + rid() })
    search = ''
    if (res.refused.length && !res.made.length) { view.refused = res.refused.map(r => r.label); return render() }
    if (res.made.length === 1) await openCard(res.made[0], false)
    else { view = { mode: 'list' }; await render() }
    say('mk', 'ok', T.enMakeDone(res.made.length), { ttl: 5000 })
    if (res.refused.length) say('mkr', 'warn', T.enMakeRefused(res.refused.map(r => `«${r.label}»`).join(', ')))
  } catch (e) { console.error(e); say('w', 'err', T.enWriteFailed(String((e && e.message) || e))) }
}

// ---- картка ----
async function openCard(id, select) {
  removeArm = false
  view = { mode: 'card', id }
  if (select) { try { await OBR.player.select([id]) } catch { /* вибір необов'язковий */ } }
  await ctl.bind(id)
  render()
}
function openBook(id) { view = { mode: 'book', id }; render() }
function openOwn(id) { view = { mode: 'own', id }; render() }
async function openForm(opts) { view = { mode: 'form', back: view, ...opts }; render() }

function cardNodes(name, e, { live, who }) {
  const m = cardModel(e)
  const nodes = [el('div', { cls: 'head' }, el('span', { cls: 'nm', text: name }), m.cat ? el('span', { cls: 'cat ' + e.cat, text: m.cat }) : null)]
  if (live) {
    const set = v => ctl.change(x => { x.hp.value = Math.max(0, Math.min(x.hp.max, v)) })
    const inp = el('input', { type: 'number', min: 0, max: e.hp.max, step: 1, value: e.hp.value, inputmode: 'numeric', 'aria-label': T.enHpField, 'data-f': 'hp' })
    inp.onchange = () => { const v = Math.round(+inp.value); if (Number.isFinite(v)) set(v); else inp.value = e.hp.value }
    nodes.push(el('div', { cls: 'hp' }, el('span', { cls: 'lab', text: T.enHp }),
      el('button', { type: 'button', cls: 'pm', title: T.enHpLess, 'aria-label': T.enHpLess, 'data-f': 'hp-', on: () => set(e.hp.value - 1) }, '−'), inp,
      el('button', { type: 'button', cls: 'pm', title: T.enHpMore, 'aria-label': T.enHpMore, 'data-f': 'hp+', on: () => set(e.hp.value + 1) }, '+'),
      el('span', { cls: 'mx', text: `/ ${e.hp.max}` })))
    const b = barOf(e.hp)
    nodes.push(el('div', { cls: 'hpbar', 'aria-hidden': 'true' }, el('i', { cls: b.tone, style: `width:${Math.round(b.frac * 100)}%` })))
  } else nodes.push(el('div', { cls: 'kv' }, `${T.enHp} `, el('b', { text: String(e.hp.max) })), el('p', { cls: 'mut', text: T.enBookView }))
  nodes.push(el('div', { cls: 'kv' }, `${T.enArmor} `, el('b', { text: String(m.armor) }), m.armorText ? el('span', { cls: 'mut', text: ` (${m.armorText})` }) : null))
  if (m.tags.length) nodes.push(el('div', { cls: 'tags' }, ...m.tags.map(t => el('span', { cls: 'chip', text: t }))))
  if (m.aspects.length) nodes.push(el('div', { cls: 'asp' }, ...m.aspects.map(t => el('span', { text: t }))))
  if (m.attacks.length) nodes.push(el('div', { cls: 'sec', text: T.enAttacks }))
  for (const a of m.attacks) {
    const tip = T.enRoll(a.name, a.label)
    const row = el('div', { cls: 'atk' }, el('span', { cls: 'an', text: a.name }),
      el('span', { cls: 'roll' }, diceBtn(a.label, a.type, tip, () => roll(who(), attackRoll(a)), 'a:' + a.i)),
      el('span', { cls: 'note', text: [a.typeName, a.note, a.bonus ? T.enBonus(a.bonus) : ''].filter(Boolean).join('; ') }))
    if (a.ammoMax > 0) {
      const pips = el('span', { cls: 'pips', title: T.enAmmo }, T.enAmmo + ' ')
      for (let k = 1; k <= a.ammoMax; k++) {
        const lab = T.enAmmoPip(k === a.ammo ? k - 1 : k, a.ammoMax)
        pips.append(el('button', { type: 'button', cls: 'pip' + (k > a.ammo ? ' off' : ''), title: lab, 'aria-label': lab, disabled: !live, 'data-f': `p:${a.i}:${k}`,
          on: () => ctl.change(x => { x.attacks[a.i].ammo = ammoClick(x.attacks[a.i].ammo, k) }) }, el('i')))
      }
      row.append(el('span', { cls: 'note' }, pips))
    }
    nodes.push(row)
  }
  if (m.moves.length) nodes.push(el('div', { cls: 'sec', text: T.enMoves }))
  for (const mv of m.moves) {
    const top = el('div', { cls: 'top' }, el('span', { cls: 'mn', text: mv.n }))
    if (mv.uses) {
      top.append(el('span', { cls: 'limc', text: limitText(mv) }))
      if (live) for (let j = 1; j <= mv.uses; j++) {
        const lab = T.enMark(j, mv.uses), on = j <= mv.spent
        top.append(el('button', { type: 'button', cls: 'tick', title: lab, 'aria-label': lab, 'aria-pressed': String(on), 'data-f': `m:${mv.i}:${j}`,
          on: () => ctl.change(x => { x.moves[mv.i] = markClick(x.moves[mv.i], j) }) }, el('i', { text: on ? '✓' : '' }), j === mv.uses ? T.enUsed : null))
      }
    }
    const tx = el('div', { cls: 'tx' })
    mv.parts.forEach((p, k) => {
      if (typeof p === 'string') return tx.append(p)
      tx.append(p.damage
        ? diceBtn(p.label, p.type, T.enRoll(mv.n, p.label), () => roll(who(), { dice: p.dice, type: p.type, name: mv.n, note: '' }), `t:${mv.i}:${k}`)
        : diceBtn(p.label, 'plain', T.enRollDice(p.label), () => rollPlain(who(), p), `t:${mv.i}:${k}`))
    })
    nodes.push(el('div', { cls: 'mv' + (mv.uses ? ' lim' : '') + (mv.used ? ' used' : '') }, top, tx))
  }
  if (m.notes) nodes.push(el('div', { cls: 'sec', text: T.enNotes }), el('div', { cls: 'notes', text: m.notes }))
  return nodes
}

function renderCard() {
  const s = ctl.state
  setBar(s.label || (s.rec && s.rec.name) || T.enTitle, { back: true })
  if (s.kind !== 'ok') {
    const text = s.kind === 'bad' ? T.enCardBad : s.kind === 'gone' ? T.enCardGone : T.enCardNone
    const acts = []
    if (s.kind === 'bad' || s.kind === 'none') acts.push(el('button', { type: 'button', cls: 'main', on: () => { view = { mode: 'make', ids: [s.itemId], back: view }; render() } }, s.kind === 'bad' ? T.enChooseAgain : T.enMakeOne))
    return main.replaceChildren(el('div', { cls: 'card no mini' }, el('div', { cls: 'big' }, icon(s.kind === 'bad' ? 'err' : 'enemy')), el('p', { text }), el('div', { cls: 'acts' }, ...acts)))
  }
  const e = s.rec.e
  const nodes = cardNodes(s.label || s.rec.name, e, { live: true, who: () => ctl.state.label || ctl.state.rec.name })
  const cleared = clearMarks(e)
  nodes.push(el('div', { cls: 'foot' },
    el('button', { type: 'button', 'data-f': 'clear', title: T.enClearHint, disabled: !cleared, on: () => ctl.change(x => clearMarks(x) || x) }, '↺ ' + T.enClear),
    el('button', { type: 'button', 'data-f': 'edit', on: () => openForm({ kind: 'edit' }) }, T.enEdit),
    el('button', { type: 'button', 'data-f': 'rm', title: T.enRemoveHint, on: () => {
      if (!removeArm) { removeArm = true; return keepFocus(render) }
      removeArm = false
      ctl.leave().then(() => removeEnemy(OBR, s.itemId)).catch(e => say('w', 'err', T.enWriteFailed(String((e && e.message) || e))))
    } }, removeArm ? T.enRemoveSure : T.enRemove)))
  main.replaceChildren(...nodes)
}
function renderBook(name, e) {
  setBar(name, { back: true })
  main.replaceChildren(...cardNodes(name, e, { live: false, who: () => name }))
}

// зміна розміру екрана, поки відкрита форма «Свій» / «Редагувати»: перевідкриття загубило б уведене (ревізор 2026-11-27),
// тож вікно переставляється, щойно форму залишено
let movePending = null
const moveTo = plan => leave(() => openEnemies(OBR, BASE, { q: qOf(), from: 'narrow', slot, dock: plan.side }))
async function render() {
  if (movePending && view.mode !== 'form') { const p = movePending; movePending = null; return moveTo(p) }
  try {
    if (view.mode === 'card') return keepFocus(renderCard)
    if (view.mode === 'book') { const b = BOOK.get(view.id); return b ? renderBook(view.as || b.name, cleanSystem(b.sys)) : back() }
    if (view.mode === 'own') { const o = formPage.ownRecord(view.id); return o ? renderBook(o.name, o.e) : back() }
    if (view.mode === 'form') return formPage.render({ main, el, setBar, say, view, ctl, done: back, made: rec => doFormMade(rec) })
    return await renderList()
  } catch (e) { console.error(e); say('w', 'err', String((e && e.message) || e)) }
}
/** Форма «Свій» з режиму «Зробити ворогом…» — одразу на токени; з картки («Редагувати») форма пише сама через ctl. */
async function doFormMade(rec) {
  const prev = view.back
  if (prev && prev.mode === 'make') { view = prev; return doMake(rec) }
  return back()
}

// ---- смуга вікна: ‹ До списку, до краю, ✕, Esc — дочекатися черги записів ----
let leaving = false
async function leave(next) {
  if (leaving) return
  leaving = true
  try { await Promise.race([ctl.leave(), new Promise(ok => setTimeout(ok, 2000))]) } catch (e) { console.error(e) }
  try { await next() } finally { leaving = false }
}
function back() {
  return leave(async () => {
    if (view.back) { view = view.back; if (view.mode === 'card') await ctl.bind(view.id) }
    else view = { mode: 'list' }
    render()
  })
}
const qOf = (v = view) => v.mode === 'form' && v.back ? qOf(v.back) : v.mode === 'card' ? 'item=' + encodeURIComponent(v.id) : v.mode === 'book' ? 'book=' + encodeURIComponent(v.id) + (v.as ? '&kind=' + encodeURIComponent(v.as) : '') : v.mode === 'make' ? 'make=' + v.ids.map(encodeURIComponent).join(',') : ''
$('b-back').onclick = back
$('b-back').title = T.enBack; $('b-back').setAttribute('aria-label', T.enBack)
for (const [id, side, ic, t] of [['b-left', 'left', 'dockL', T.dockLeft], ['b-right', 'right', 'dockR', T.dockRight]]) {
  const b = $(id); b.append(icon(ic)); b.title = t; b.setAttribute('aria-label', t)
  b.onclick = () => leave(() => openEnemies(OBR, BASE, { q: qOf(), from: 'narrow', slot, dock: side }))
}
$('b-close').append(icon('x')); $('b-close').title = T.close; $('b-close').setAttribute('aria-label', T.close)
// «Генератори» з другого боку повертають звичайну ширину (пара на вузькому екрані, lib/pick.mjs releasePair)
const closeWin = () => leave(async () => { await releasePair(OBR, myId); return OBR.popover.close(myId) })
$('b-close').onclick = closeWin
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) closeWin() })
// Owlbear закрив вікно сам (не ✕): «Генератори» з другого боку теж повертають ширину (ревізор, 2026-11-27)
const myKey = (winsGet(session())[myId] || {}).k || ''
addEventListener('pagehide', () => { ctl.closing(); if (myKey) releasePair(OBR, myId, session(), myKey).catch(() => {}) })
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') ctl.closing() })

OBR.onReady(async () => {
  const setTheme = t => document.documentElement.classList.toggle('light', !!t && t.mode === 'LIGHT')
  try { setTheme(await OBR.theme.getTheme()); OBR.theme.onChange(setTheme) } catch { /* тема необов'язкова */ }
  // зміна розміру вікна браузера: вікно стає за тими самими правилами (lib/pick.mjs, followResize)
  followResize(OBR, myId, plan => { if (view.mode === 'form') { movePending = plan; return } return moveTo(plan) })
  // сторінка сама перевіряє роль (вердикт радника): гравець, що відкрив адресу, картки не бачить
  if ((await OBR.player.getRole()) !== 'GM') { setBar(T.enTitle); return main.replaceChildren(el('p', { cls: 'center mut', text: T.enGmOnly })) }
  if (!(await OBR.scene.isReady())) { setBar(T.enTitle); return main.replaceChildren(el('p', { cls: 'center mut', text: T.enMakeNoScene })) }
  ctl.listen()
  OBR.scene.items.onChange(() => { if (view.mode === 'list') keepFocus(renderList) })
  if (q.get('item')) return openCard(q.get('item'), false)
  // kind=<назва виду> — групу бестіарію «Генератори» показують як один вид («Щур»), як картка Foundry (лише текст, до 80 знаків)
  if (q.get('book') && BOOK.has(q.get('book'))) view = { mode: 'book', id: q.get('book'), as: String(q.get('kind') || '').slice(0, 80) }
  if (q.get('make')) {
    const ids = q.get('make').split(',').filter(Boolean).slice(0, 50)
    const items = await OBR.scene.items.getItems(ids)
    const { canMakeEnemy } = await import('./lib/enemy-bar.mjs')
    view = { mode: 'make', ids, refused: items.filter(it => !canMakeEnemy(it.metadata)).map(it => (it.text && it.text.plainText) || it.name || '') }
  }
  render()
})
