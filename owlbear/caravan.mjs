// Пустельники в Owlbear Rodeo: сторінка аркуша каравану (modal або вузький popover), етап 3.
// Логіка — у lib/caravan-host.mjs; тут DOM: смуга вікна, смуги повідомлень, iframe з аркушем (міст car_build.py, режим obr).
// Дизайн: docs/plans/2026-11-27-owlbear-stage3-design.md.
import OBR from './sdk.js'
import { createCaravanHost } from './lib/caravan-host.mjs'
import { openCaravan, baseOf, ID, forgetWin, followResize } from './lib/pick.mjs'
import { T } from './lib/texts.mjs'
import { icon } from './lib/icons.mjs'
import { bootFrame } from './lib/frame.mjs'
import { sendRoll as broadcastRoll } from './lib/rolls.mjs'
import { newCid } from './lib/store.mjs'
import { safeStorage } from './lib/storage.mjs'

const q = new URLSearchParams(location.search)
const narrow = q.get('w') === 'narrow'
const slot = narrow && q.get('slot') === 'b' ? 'b' : ''
const BASE = baseOf(location.pathname)
const $ = id => document.getElementById(id)
const frame = $('frame'), strip = $('strip'), status = $('status'), panel = $('panel')
let host = null

// ---- смуги повідомлень (як у sheet.mjs) ----
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) if (k === 'on') e.onclick = v; else if (k === 'cls') e.className = v; else e.setAttribute(k, v)
  for (const c of kids) if (c != null) e.append(c)
  return e
}
function say(key, cls, text, { ttl = 0, buttons = [] } = {}) {
  const old = strip.querySelector(`[data-k="${key}"]`)
  const m = el('p', { cls: 'msg ' + cls, 'data-k': key, role: cls === 'err' ? 'alert' : 'status' }, icon(cls), el('span', { cls: 't' }, text), ...buttons)
  if (buttons.length) { /* кнопки замість «Сховати» */ } else if (!ttl) m.append(el('button', { type: 'button', on: () => m.remove() }, T.dismiss))
  else m.append(el('i', { cls: 'ttl', style: `animation-duration:${ttl}ms`, 'aria-hidden': 'true' }))
  old ? old.replaceWith(m) : strip.append(m)
  if (ttl) setTimeout(() => m.remove(), ttl)
}
const unsay = key => { const m = strip.querySelector(`[data-k="${key}"]`); if (m) m.remove() }

// ---- аркуш у iframe ----
let embedP = null
/* global CAR_HTML */
const embedHtml = () => typeof CAR_HTML === 'string' ? CAR_HTML : null
function loadEmbed() {
  if (!embedP) embedP = new Promise((ok, bad) => {
    if (embedHtml()) return ok(embedHtml())
    const s = document.createElement('script')
    s.src = BASE + 'embed/car_embed.js'
    s.onload = () => embedHtml() ? ok(embedHtml()) : bad(new Error('CAR_HTML missing'))
    s.onerror = () => bad(new Error('car_embed.js failed'))
    document.head.append(s)
  })
  return embedP
}
const sheet = {
  async boot(init) {
    const html = await loadEmbed()
    const boot = '<script>window.CG_MODE="obr";window.CG_SEQ=1;'
      + 'window.CG_HOOK=function(t,d,v){parent.postMessage({cg:t,data:d,seq:1,ver:v||0},"*")};'
      + `window.CG_INIT=${JSON.stringify(init === undefined ? null : init).replace(/</g, '\\u003c')};<\/script>`
    return bootFrame(frame, html.replace('<!--CG_INIT-->', () => boot))   // функція: «$&» у тексті каравану не шаблон заміни
  },
}

function ui(kind, d = {}) {
  switch (kind) {
    case 'open': status.textContent = ''; return
    case 'conflict': return say('conflict', 'warn', T.carConflict, { ttl: 8000 })
    case 'bad-data': {   // ключ каравану є, але не читається: аркуша не показуємо, щоб перша правка не затерла караван (радник Б7)
      status.textContent = ''
      frame.hidden = true; panel.hidden = false
      const b = el('button', { type: 'button', cls: 'main' }, T.carOpenBlank)
      b.onclick = async () => {
        b.disabled = true
        panel.hidden = true; frame.hidden = false
        try { await host.openBlank() } catch (e) { console.error(e); ui('error', { code: 'start-failed', msg: String((e && e.message) || e) }) }
      }
      const acts = [b]
      if (host.hasSnap()) {   // останній караван цього браузера (автор, П1 а)
        const s = el('button', { type: 'button' }, T.carSnapBtn)
        s.onclick = async () => { s.disabled = b.disabled = true; panel.hidden = true; frame.hidden = false; try { await host.openBlank(true) } catch (e) { console.error(e) } }
        acts.push(s)
      }
      return panel.replaceChildren(el('div', { cls: 'card no' }, el('div', { cls: 'big' }, icon('warn')),
        el('p', { cls: 'q' }, d.newer ? T.carNewer : T.carBad), el('p', { cls: 'mut' }, T.carBadHint), el('div', { cls: 'acts' }, ...acts)))
    }
    case 'written': unsay('too-big'); unsay('write'); return
    case 'snap': return say('snap', 'warn', T.carSnap(d.n), { buttons: [el('button', { type: 'button', on: () => host.restoreSnap() }, T.carSnapBtn)] })
    case 'snap-off': return unsay('snap')
    case 'error':
      if (d.code === 'too-big') return say('too-big', 'err', T.carTooBig(d.bytes, d.max))
      if (d.code === 'write-failed') return say('write', 'err', T.carWriteFailed(d.msg || '?'))
      if (d.code === 'not-saved') return say('write', 'err', T.carNotSaved)
      if (d.code === 'start-failed') { status.textContent = ''; return say('start', 'err', T.carStartFailed(d.msg || '?')) }
      return say('err', 'err', String(d.code || d))
  }
}

// ---- смуга вікна ----
$('b-icon').replaceWith(icon('caravan'))
$('b-title').textContent = T.carTitle
$('b-size').textContent = narrow ? T.wide : T.narrow
$('b-close').append(icon('x'))
$('b-close').title = T.close
$('b-close').setAttribute('aria-label', T.close)
// наші кнопки закриття чекають, поки караван дійде до кімнати (стиснення асинхронне), але не довше за 1,5 с;
// запис не має зупинити саме закриття (аркуш не завантажився — ✕ мусить працювати)
async function settle() { try { if (host) await host.settle(1500) } catch (e) { console.error(e) } }
function flush() { try { if (host) host.closing() } catch (e) { console.error(e) } }
let leaving = false
async function leave(next) {
  if (leaving) return
  leaving = true
  await settle()
  try { await next() } finally { leaving = false }
}
$('b-size').onclick = () => leave(() => openCaravan(OBR, BASE, { narrow: !narrow, from: narrow ? 'narrow' : 'modal', slot }))
for (const [id, side, ic, t] of [['b-left', 'left', 'dockL', T.dockLeft], ['b-right', 'right', 'dockR', T.dockRight]]) {
  const b = $(id)   // і в широкому вікні: закриває його й відкриває вузьке біля краю (автор, 2026-11-27)
  b.append(icon(ic)); b.title = t; b.setAttribute('aria-label', t)
  b.onclick = () => leave(() => openCaravan(OBR, BASE, { narrow: true, from: narrow ? 'narrow' : 'modal', slot, dock: side }))
}
const closeWin = () => leave(() => {
  if (narrow) forgetWin(slot === 'b' ? ID.carNarrowB : ID.carNarrow)   // журнал більше не міряє висоту закритого вікна
  return narrow ? OBR.popover.close(slot === 'b' ? ID.carNarrowB : ID.carNarrow) : OBR.modal.close(ID.carModal)
})
$('b-close').onclick = closeWin
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) closeWin() })

// ---- кидки: кістка Долі каравану й шкода турелі, тим самим шляхом, що й з аркуша персонажа (етап 2) ----
function sendRoll(kind, d) {
  let who = ''
  try { const st = frame.contentWindow && frame.contentWindow.CG_GET(); who = (st && st.companyName) || '' } catch { /* аркуш недоступний */ }
  const p = broadcastRoll(OBR, kind, d, { who: who || T.carWho, id: newCid(Math.random) })
  if (p) p.catch(e => { console.error(e); say('roll', 'err', T.carRollFailed, { ttl: 8000 }) })
}

status.textContent = T.carLoading
addEventListener('message', e => {
  if (!host || e.source !== frame.contentWindow) return
  const m = e.data
  if (m && m.cg === 'esc') return closeWin()
  if (m && (m.cg === 'fate' || m.cg === 'dmg')) return sendRoll(m.cg, m.data)
  host.onMessage(m)
})
// клік по тлі modal чи закрита вкладка: чекати не можна, тож — одразу (lib/caravan-host.mjs, closing)
addEventListener('pagehide', flush)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush()
  else if (host) host.refresh().catch(e => console.error(e))   // знову видиме: перечитати кімнату
})

OBR.onReady(async () => {
  const setTheme = t => document.documentElement.classList.toggle('light', !!t && t.mode === 'LIGHT')
  try { setTheme(await OBR.theme.getTheme()); OBR.theme.onChange(setTheme) } catch { /* тема необов'язкова */ }
  // зміна розміру вікна браузера: вікно стає за тими самими правилами (lib/pick.mjs, followResize)
  if (narrow) followResize(OBR, slot === 'b' ? ID.carNarrowB : ID.carNarrow, plan => leave(() => openCaravan(OBR, BASE, { narrow: true, from: 'narrow', slot, dock: plan.side })))
  let roomId = ''
  try { roomId = String(OBR.room.id || '') } catch { /* без id — один знімок на браузер */ }
  host = createCaravanHost({ OBR, sheet, ui, storage: safeStorage(), roomId })
  try { await host.start() } catch (e) { console.error(e); ui('error', { code: 'start-failed', msg: String((e && e.message) || e) }) }
  finally { if (status.textContent === T.carLoading) status.textContent = '' }
})
