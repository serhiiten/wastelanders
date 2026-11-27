// Пустельники в Owlbear Rodeo: сторінка аркуша персонажа (modal або вузький popover).
// Логіка — у lib/host.mjs; тут DOM: вибір для нового токена, «це ти?», смуги повідомлень, iframe з аркушем.
// Дизайн: docs/plans/2026-11-26-owlbear-stage1-design.md, «Поведінка» і «Сесія 3».
import OBR from './sdk.js'
import { createHost } from './lib/host.mjs'
import { openSheet, baseOf, ID, forgetWin, followResize } from './lib/pick.mjs'
import { T } from './lib/texts.mjs'
import { icon, splitRev } from './lib/icons.mjs'
import { bootFrame } from './lib/frame.mjs'
import { safeStorage } from './lib/storage.mjs'
import { sendRoll as broadcastRoll } from './lib/rolls.mjs'
import { newCid } from './lib/store.mjs'

const q = new URLSearchParams(location.search)
const itemId = q.get('item') || ''
const narrow = q.get('w') === 'narrow'
const slot = narrow && q.get('slot') === 'b' ? 'b' : ''   // місце вузького вікна (lib/pick.mjs, «два місця»)
let roller = q.get('roller') === '1'   // «Зробити перевірку» з меню: аркуш одразу на панелі перевірки (етап 2)
const BASE = baseOf(location.pathname)
const $ = id => document.getElementById(id)
const frame = $('frame'), panel = $('panel'), strip = $('strip'), status = $('status')
let host = null

// ---- смуги повідомлень ----
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) if (k === 'on') e.onclick = v; else if (k === 'cls') e.className = v; else e.setAttribute(k, v)
  for (const c of kids) if (c != null) e.append(c)
  return e
}
const btn = (text, on, cls = '') => el('button', { type: 'button', on, cls }, text)

/** Смуга над аркушем. key — одна смуга на ключ (нова замінює стару); ttl — сховати сама через ttl мс. */
function say(key, cls, text, { buttons = [], ttl = 0 } = {}) {
  const old = strip.querySelector(`[data-k="${key}"]`)
  const m = el('p', { cls: 'msg ' + cls, 'data-k': key, role: cls === 'err' ? 'alert' : 'status' }, icon(cls), el('span', { cls: 't' }, text), ...buttons)
  if (!buttons.length && !ttl) m.append(btn(T.dismiss, () => m.remove()))
  if (ttl) m.append(el('i', { cls: 'ttl', style: `animation-duration:${ttl}ms`, 'aria-hidden': 'true' }))
  old ? old.replaceWith(m) : strip.append(m)
  if (ttl) setTimeout(() => m.remove(), ttl)
  return m
}
const unsay = key => { const m = strip.querySelector(`[data-k="${key}"]`); if (m) m.remove() }

function showPanel(...kids) {
  panel.replaceChildren(...kids)
  panel.hidden = false; frame.hidden = true
}
function showFrame() { panel.hidden = true; frame.hidden = false }

// ---- аркуш у iframe (міст cg_build.py, режим obr) ----
let embedP = null
// cg_embed.js оголошує `const CG_HTML` — глобальну лексичну змінну, не властивість window; модулю вона видна за іменем
/* global CG_HTML */
const embedHtml = () => typeof CG_HTML === 'string' ? CG_HTML : null
function loadEmbed() {
  if (!embedP) embedP = new Promise((ok, bad) => {
    if (embedHtml()) return ok(embedHtml())
    const s = document.createElement('script')
    s.src = BASE + 'embed/cg_embed.js'
    s.onload = () => embedHtml() ? ok(embedHtml()) : bad(new Error('CG_HTML missing'))
    s.onerror = () => bad(new Error('cg_embed.js failed'))
    document.head.append(s)
  })
  return embedP
}
const sheet = {
  async boot(init, { gm }) {
    const html = await loadEmbed()
    const boot = '<script>window.CG_MODE="obr";window.CG_SEQ=1;window.CG_POP=0;'
      + `window.CG_OBR_GM=${gm ? 1 : 0};`
      + 'window.CG_HOOK=function(t,d,v){parent.postMessage({cg:t,data:d,seq:1,ver:v||0},"*")};'
      + `window.CG_INIT=${JSON.stringify(init === undefined ? null : init).replace(/</g, '\\u003c')};<\/script>`
    showFrame()
    // чекаємо готовий міст (CG_GET), а не лише load; не вийшло — ще одна спроба (вада В2, lib/frame.mjs)
    return bootFrame(frame, html.replace('<!--CG_INIT-->', () => boot))   // функція: «$&», «$'» у тексті персонажа не шаблони заміни
  },
}

// ---- що показує господар ----
function ui(kind, d = {}) {
  switch (kind) {
    case 'choose': return showChoose(d.cached || [])
    case 'confirm-owner':
      return showPanel(el('div', { cls: 'card' }, el('div', { cls: 'big' }, icon('user')), el('p', { cls: 'q' }, T.confirmOwner(d.n)), el('div', { cls: 'acts' },
        btn(T.yes, () => run(() => host.confirmOwner(true)), 'main'), btn(T.no, () => run(() => host.confirmOwner(false))))))
    case 'not-yours':
      return showPanel(el('div', { cls: 'card no' }, el('div', { cls: 'big' }, icon('lock')), el('p', { cls: 'q' }, T.notYours(d.n)), el('p', { cls: 'mut' }, T.notYoursHint)))
    case 'open':
      status.textContent = ''
      showFrame()
      if (roller) { roller = false; try { const w = frame.contentWindow; if (w && typeof w.CG_ROLLER === 'function') w.CG_ROLLER(true) } catch (e) { console.error(e) } }
      return
    case 'took-cache': return say('copy', 'ok', T.tookCache(d.r), { ttl: 12000 })
    case 'stale':
      return say('copy', 'warn', T.stale(d.r), { buttons: [el('button', { type: 'button', title: T.detachHint, on: () => host.detach() }, T.detach)] })
    case 'detached': return say('copy', 'ok', T.detached, { ttl: 8000 })
    case 'error': return showError(d)
  }
}
function showError(d) {
  switch (d.code) {
    case 'too-big': return say('too-big', 'err', (d.portrait ? T.tooBigPortrait : T.tooBig)(d.bytes, d.max))
    case 'room-full': return say('room-full', 'err', T.roomFull(d.bytes, d.max))
    case 'write-failed': return say('write', 'err', T.writeFailed(d.msg || '?'))
    case 'item-gone': return say('gone', 'err', T.itemGone)
    case 'enemy': return showPanel(el('div', { cls: 'card no' }, el('div', { cls: 'big' }, icon('err')), el('p', { cls: 'q' }, T.sheetOnEnemy)))
    case 'caravan': return showPanel(el('div', { cls: 'card no' }, el('div', { cls: 'big' }, icon('err')), el('p', { cls: 'q' }, T.sheetOnCaravan)))
    case 'no-item': return showPanel(el('div', { cls: 'card no' }, el('div', { cls: 'big' }, icon('err')), el('p', { cls: 'q' }, T.noItem)))
    case 'start-failed': return showPanel(el('div', { cls: 'card no' }, el('div', { cls: 'big' }, icon('err')), el('p', { cls: 'q' }, T.startFailed(d.msg || '?'))))
    default: return say('err', 'err', String(d.code || d))
  }
}

function showChoose(cached) {
  const opt = (ic, text, hint, on, cls = 'tile') => el('button', { type: 'button', cls, on }, icon(ic), el('b', {}, text), el('small', {}, hint))
  const kids = [
    el('h1', {}, T.chooseTitle),
    el('p', { cls: 'mut' }, T.chooseLead),
    el('div', { cls: 'tiles' },
      opt('create', T.create, T.createHint, () => run(() => host.choose({ kind: 'blank' })), 'tile main'),
      opt('random', T.random, T.randomHint, () => run(() => host.choose({ kind: 'random' }))),
      opt('json', T.json, T.jsonHint, () => $('f-json').click())),
  ]
  const row = c => {
    const [n, rev] = splitRev(T.cachedItem(c.n, c.r))
    return el('button', { type: 'button', cls: 'row-btn', on: () => run(() => host.choose({ kind: 'cache', cid: c.cid })) },
      el('span', { cls: 'av', 'aria-hidden': 'true' }, [...n][0] || '?'), el('span', { cls: 'tx' }, n), rev ? el('span', { cls: 'chip' }, rev) : null)
  }
  if (cached.length) kids.push(
    el('h2', {}, T.cachedTitle), el('p', { cls: 'mut' }, T.cachedHint),
    el('div', { cls: 'list' }, ...cached.map(row)))
  showPanel(el('div', { cls: 'wide' }, ...kids))
}

// «Відкрити .json»: діалог файла відкривається тут (активація кліку не переходить в iframe), файл іде в #f-open аркуша,
// аркуш сам перевіряє форму, показує свої повідомлення й надсилає state.
$('f-json').onchange = async e => {
  const f = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!f) return
  await run(async () => {
    const win = await host.choose({ kind: 'json' })
    const input = win && win.document.getElementById('f-open')
    if (!input) return
    const dt = new win.DataTransfer()
    dt.items.add(f)
    input.files = dt.files
    input.dispatchEvent(new win.Event('change', { bubbles: true }))
  })
}

let busy = false
async function run(f) {
  if (busy) return
  busy = true
  try { await f() } catch (e) { console.error(e); say('err', 'err', T.embedFailed) } finally { busy = false }
}

// ---- смуга господаря ----
$('b-icon').replaceWith(icon('sheet'))
$('b-title').textContent = T.ctxSheet
$('b-size').textContent = narrow ? T.wide : T.narrow
$('b-close').append(icon('x'))
$('b-close').title = T.close
$('b-close').setAttribute('aria-label', T.close)
// запис закриття не має зупинити саме закриття чи перемикання вікна (вада В2: аркуш не завантажився — ✕ мусить працювати)
function flush() { try { if (host) host.closing() } catch (e) { console.error(e) } }
// перемикання вікна одне за раз: другий клік за 300 мс не відкриває вузьке вікно вдруге (ревізія 2026-11-27)
let switching = false
async function switchTo(opts) {
  if (switching) return
  switching = true
  try {
    flush()
    await new Promise(ok => setTimeout(ok, 300))   // запис закриття має дійти раніше, ніж нове вікно прочитає токен
    await openSheet(OBR, BASE, itemId, { from: narrow ? 'narrow' : 'modal', slot, ...opts })
  } finally { switching = false }
}
$('b-size').onclick = () => switchTo({ narrow: !narrow })
// «До лівого / правого краю екрана». Modal Owlbear завжди по центру й не рухається, тож у широкому вікні кнопка
// закриває його й відкриває вузьке 460 px біля того краю (автор, 2026-11-27), як у вузькому.
for (const [id, side, ic, t] of [['b-left', 'left', 'dockL', T.dockLeft], ['b-right', 'right', 'dockR', T.dockRight]]) {
  const b = $(id)
  b.append(icon(ic)); b.title = t; b.setAttribute('aria-label', t)
  b.onclick = () => switchTo({ narrow: true, dock: side })
}
function closeSheet() {
  flush()
  if (narrow) forgetWin(slot === 'b' ? ID.narrowB : ID.narrow)   // журнал більше не міряє висоту закритого вікна
  return narrow ? OBR.popover.close(slot === 'b' ? ID.narrowB : ID.narrow) : OBR.modal.close(ID.modal)
}
$('b-close').onclick = closeSheet
// Esc закриває вікно, як ✕: з екранів господаря — тут, з аркуша — повідомленням 'esc' мосту (аркуш шле його,
// лише коли Esc не закрив нічого його власного: меню, «Зробити перевірку», інструкцію)
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) closeSheet() })

// ---- старт ----
status.textContent = T.loading
addEventListener('message', e => {
  if (!host || e.source !== frame.contentWindow) return
  if (e.data && e.data.cg === 'esc') return closeSheet()
  if (e.data && ['check', 'fate', 'dmg'].includes(e.data.cg)) return sendRoll(e.data.cg, e.data.data)
  host.onMessage(e.data)
})
addEventListener('pagehide', flush)

// ---- кидки для всіх за столом (етап 2, lib/rolls.mjs): приймає й показує їх тло розширення (background.mjs) ----
let tokenName = ''
function sendRoll(kind, d) {
  let who = ''
  try { const st = frame.contentWindow && frame.contentWindow.CG_GET(); who = (st && st.name) || '' } catch { /* аркуш недоступний */ }
  const p = broadcastRoll(OBR, kind, d, { who: who || tokenName, id: newCid(Math.random) })
  if (p) p.catch(e => { console.error(e); say('roll', 'err', T.rollFailed, { ttl: 8000 }) })
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })

OBR.onReady(async () => {
  const setTheme = t => document.documentElement.classList.toggle('light', !!t && t.mode === 'LIGHT')
  try { setTheme(await OBR.theme.getTheme()); OBR.theme.onChange(setTheme) } catch { /* тема необов'язкова */ }
  // зміна розміру вікна браузера: вузьке вікно стає за тими самими правилами (lib/pick.mjs, followResize)
  if (narrow) followResize(OBR, slot === 'b' ? ID.narrowB : ID.narrow, plan => switchTo(plan.token ? { narrow: true } : { narrow: true, dock: plan.side }))
  if (!itemId) return ui('error', { code: 'no-item' })
  OBR.scene.items.getItems([itemId]).then(a => { tokenName = (a && a[0] && a[0].name) || '' }).catch(() => {})
  host = createHost({ OBR, storage: safeStorage(), sheet, ui, itemId })
  try { await host.start() } catch (e) { console.error(e); ui('error', { code: 'start-failed', msg: String((e && e.message) || e) }) }
  finally { if (status.textContent === T.loading) status.textContent = '' }
})
