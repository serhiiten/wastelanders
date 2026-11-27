// Пустельники в Owlbear Rodeo: віконце лічильників (сесія Б, автор 2026-11-27, вигляд Б «Рядки»).
// Бачать усі, поки в кімнаті є хоч один лічильник (відкриває тло, background.mjs); − / +, розгорнути й видалити — лише
// Доглядач. Гравець бачить назву й число; опис поділки — лише в «Журналі кидків». Дані — lib/counters-data.mjs,
// запис — lib/counters-host.mjs. Усе з кімнати — лише textContent; колір — з числа, не з даних.
import OBR from './sdk.js'
import { ID, CTR_BOX, SAFE, CTR_FORM, ctrAlive, ctrGone, session } from './lib/pick.mjs'
import { createCountersHost } from './lib/counters-host.mjs'
import { SIZES, CUSTOM_MAX, CTR_N, DESC_MAX, NAME_MAX, cleanDesc, descLen, newCounter, ctrColor } from './lib/counters-data.mjs'
import { newCid } from './lib/store.mjs'
import { T } from './lib/texts.mjs'
import { icon } from './lib/icons.mjs'

const $ = id => document.getElementById(id)
const rows = $('rows'), panel = $('panel'), msgEl = $('msg'), badEl = $('bad'), emptyEl = $('empty')
const ss = session()
const q = new URLSearchParams(location.search)
const rnd = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 2 ** 32 }

let gm = false, host = null
let list = [], bad = false, newer = false, use = { pct: 0, warn: false }
let open = ''            // id розгорнутого лічильника (лише Доглядач)
let form = null          // стан форми «Новий лічильник» або null
let sureDel = '', sureT = null

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'cls') e.className = v
    else if (k === 'text') e.textContent = v
    else if (k === 'on') for (const [ev, f] of Object.entries(v)) e.addEventListener(ev, f)
    else if (k in e) e[k] = v
    else e.setAttribute(k, v)
  }
  for (const k of kids) if (k != null) e.append(k)
  return e
}
const ib = (txt, label, f, cls = 'ib') => el('button', { type: 'button', cls, title: label, 'aria-label': label, text: txt, on: { click: f } })

let msgT = null
function say(text, err = false) {
  msgEl.textContent = text; msgEl.hidden = !text; msgEl.classList.toggle('err', !!err)
  clearTimeout(msgT); if (text) msgT = setTimeout(() => { msgEl.hidden = true; fit() }, 6000)
  fit()
}

// ---- висота вікна за вмістом (із затримкою, радник): не вище за екран без зон Owlbear ----
let fitT = null, lastH = 0
function fit() {
  clearTimeout(fitT)
  fitT = setTimeout(async () => {
    const want = Math.ceil(document.body.scrollHeight)
    let vh = 0
    try { vh = await OBR.viewport.getHeight() } catch { /* ок */ }
    const max = vh > 0 ? vh - CTR_BOX.top - SAFE.bottom : 700
    const h = Math.max(60, Math.min(max, want))
    if (h !== lastH) { lastH = h; try { await OBR.popover.setHeight(ID.counters, h) } catch { /* ок */ } }
  }, 60)
}

// ---- рядки ----
function row(c) {
  const name = c.n
  const chip = el('span', { cls: 'chip', text: `${c.v}/${c.s}` })
  chip.style.background = ctrColor(c.v, c.s)
  const r = el('div', { cls: 'row' + (open === c.i ? ' open' : ''), role: 'listitem', title: name }, chip, el('span', { cls: 'nm' + (sureDel === c.i ? ' sure' : ''), text: sureDel === c.i ? T.ctrDelSure : name }))
  if (gm) {
    r.append(ib('−', T.ctrLess(name), () => step(c.i, -1)), ib('+', T.ctrMore(name), () => step(c.i, 1)))
    if (!c.c) r.append(ib(open === c.i ? '⌃' : '⌄', open === c.i ? T.ctrFold(name) : T.ctrOpen(name), () => { open = open === c.i ? '' : c.i; draft = null; form = null; render(true) }))
    // видалення стирає вписане — двічі (docs/ui-rules.md §3): перший клік питає, другий видаляє; 4 с без кліку — назад
    const del = ib('✕', sureDel === c.i ? T.ctrDelSure : T.ctrDel(name), () => {
      if (sureDel !== c.i) { sureDel = c.i; clearTimeout(sureT); sureT = setTimeout(() => { sureDel = ''; render() }, 4000); return render() }
      sureDel = ''; const was = open === c.i; if (was) { open = ''; draft = null } host.act({ t: 'del', i: c.i }); render(was)
    }, 'ib' + (sureDel === c.i ? ' sure' : ''))
    r.append(del)
  }
  return r
}
function step(i, by) { host.act({ t: 'step', i, by }); render() }

// ---- розгорнутий лічильник: описи поділок ----
let editT = null, draft = null
function ticks(c) {
  draft = draft && draft.i === c.i ? draft : { i: c.i, d: Array.from({ length: c.s }, (_, k) => (c.d && c.d[k]) || '') }
  const save = () => { clearTimeout(editT); editT = setTimeout(() => host.act({ t: 'edit', i: c.i, d: draft.d.slice() }), 700) }
  const box = el('div', { cls: 'ticks' })
  for (let k = 1; k <= c.s; k++) {
    const b = el('b', { text: String(k) }); b.style.background = ctrColor(k, c.s)
    const n = el('span', { cls: 'n', text: `${descLen(draft.d[k - 1])}/${DESC_MAX}` })
    const ta = el('textarea', { rows: 1, placeholder: T.ctrTickPh, 'aria-label': T.ctrTick(k), value: draft.d[k - 1] })
    let prev = ta.value
    ta.addEventListener('input', () => {
      // понад 120 знаків чи 5 рядків — новий ввід не приймається (а не обрізається кінець тексту, ревізор Д3)
      if (descLen(ta.value) > DESC_MAX || ta.value.split('\n').length > 5) { const pos = ta.selectionStart - (ta.value.length - prev.length); ta.value = prev; ta.selectionStart = ta.selectionEnd = Math.max(0, pos) }
      else if (cleanDesc(ta.value) !== ta.value.replace(/\s+$/, '')) { const pos = ta.selectionStart; ta.value = cleanDesc(ta.value); ta.selectionStart = ta.selectionEnd = Math.min(pos, ta.value.length) }
      prev = ta.value
      draft.d[k - 1] = ta.value
      n.textContent = `${descLen(ta.value)}/${DESC_MAX}`
      save()
    })
    ta.addEventListener('blur', () => { if (editT) { clearTimeout(editT); editT = null; host.act({ t: 'edit', i: c.i, d: draft.d.slice() }) } })
    box.append(el('div', { cls: 'tick' + (k === c.v ? ' cur' : '') }, b, el('div', { cls: 'f' }, ta, n)))
  }
  return el('div', { cls: 'panel' }, el('h2', { text: c.n }), el('p', { cls: 'mut', text: T.ctrDescHint }), box, usageLine())
}

function usageLine() {
  return el('p', { cls: 'mut use' + (use.warn ? ' warn' : ''), text: (use.warn ? T.ctrUsageWarn : T.ctrUsage)(use.pct) })
}
/** Рядок «зайнято N%» на місці, не перемальовуючи панелі (поле вводу не губить фокус). */
function updateUsage() {
  for (const p of panel.querySelectorAll('.use')) { p.className = 'mut use' + (use.warn ? ' warn' : ''); p.textContent = (use.warn ? T.ctrUsageWarn : T.ctrUsage)(use.pct) }
}

// ---- форма «Новий лічильник» ----
function newForm() {
  const f = form
  const name = el('input', { cls: 'in', id: 'f-name', maxLength: NAME_MAX, placeholder: T.ctrNamePh, value: f.n, on: { input: e => { f.n = e.target.value } } })
  const seg = el('div', { cls: 'seg', role: 'group', 'aria-label': T.ctrSize })
  const pick = (size, custom) => () => { f.size = size; f.custom = custom; if (f.start > (custom ? f.cn : size)) f.start = custom ? f.cn : size; renderPanel() }
  for (const s of SIZES) seg.append(el('button', { type: 'button', text: String(s), 'aria-pressed': String(!f.custom && f.size === s), on: { click: pick(s, false) } }))
  seg.append(el('button', { type: 'button', text: T.ctrCustom + '…', 'aria-pressed': String(f.custom), on: { click: pick(f.cn, true) } }))
  const num = (id, val, lo, hi, label, on) => el('input', { cls: 'in', id, type: 'number', min: lo, max: hi, step: 1, value: val, 'aria-label': label, on: { change: e => { const v = Math.max(lo, Math.min(hi, Math.round(+e.target.value) || lo)); e.target.value = v; on(v) } } })
  const max = f.custom ? f.cn : f.size
  const kids = [
    el('h2', { text: T.ctrNew }),
    el('label', { cls: 'l', htmlFor: 'f-name', text: T.ctrName }), name,
    el('label', { cls: 'l', text: T.ctrSize }), seg,
    f.custom ? el('div', { cls: 'line' }, el('label', { cls: 'l', htmlFor: 'f-cn', text: T.ctrCustomN }), num('f-cn', f.cn, 1, CUSTOM_MAX, T.ctrCustomN, v => { f.cn = v; f.size = v; if (f.start > v) f.start = v; render(true) })) : null,
    el('div', { cls: 'line' }, el('label', { cls: 'l', htmlFor: 'f-start', text: T.ctrStart }), num('f-start', Math.min(f.start, max), 0, max, T.ctrStart, v => { f.start = v })),
    el('div', { cls: 'acts' },
      el('button', { type: 'button', cls: 'main', text: T.ctrAdd, on: { click: addCounter } }),
      el('button', { type: 'button', text: T.ctrCancel, on: { click: () => { form = null; render(true); closeIfEmpty() } } })),
    list.length >= CTR_N ? el('p', { cls: 'mut warn', text: T.ctrFull(CTR_N) }) : usageLine(),
  ]
  return el('div', { cls: 'panel' }, ...kids)
}
function addCounter() {
  const f = form
  if (list.length >= CTR_N) return say(T.ctrFull(CTR_N), true)
  const c = newCounter({ i: newCid(rnd), n: f.n, size: f.custom ? f.cn : f.size, custom: f.custom, start: f.start })
  if (!c) return say(T.ctrNoName, true)
  host.act({ t: 'add', c })
  sentForm = { f: { ...f }, i: c.i }   // запис не вліз чи не дійшов — форма повертається з набраним (ревізор, В2)
  form = null; render(true)
}
let sentForm = null
const blankForm = () => ({ n: '', size: 6, custom: false, cn: 20, start: 4 })

// ---- малювання ----
// render() — рядки й рядок «зайнято N%»; render(true) — ще й панель (форма чи описи): лише на дію людини, бо
// перемальована панель губить фокус і курсор у полі, а стан кімнати приходить після кожного запису.
function renderPanel() { render(true) }
function render(withPanel = false) {
  const shown = gm && host ? host.preview() : list
  $('add').hidden = !gm || bad
  badEl.hidden = !(gm && bad)
  if (gm && bad) {
    const reset = el('button', { type: 'button', text: T.ctrReset })
    let sure = false
    reset.onclick = () => { if (!sure) { sure = true; reset.textContent = T.ctrResetSure; setTimeout(() => { sure = false; reset.textContent = T.ctrReset }, 4000); return } host.act({ t: 'clear' }) }
    badEl.replaceChildren(el('p', { text: newer ? T.ctrNewer : T.ctrBad }), newer ? null : reset)
  }
  rows.replaceChildren(...(bad ? [] : shown.map(row)))
  emptyEl.hidden = !(gm && !bad && !shown.length && !form)
  emptyEl.textContent = T.ctrEmpty
  const oc = open && shown.find(c => c.i === open && !c.c)
  if (open && !oc) { open = ''; draft = null; withPanel = true }   // розгорнутий лічильник видалили (інша вкладка)
  if (withPanel || (!panel.firstChild && (form || oc))) panel.replaceChildren(...(form ? [newForm()] : oc ? [ticks(oc)] : []))
  else {
    updateUsage()
    if (oc) panel.querySelectorAll('.tick').forEach((t, k) => t.classList.toggle('cur', k + 1 === oc.v))
  }
  fit()
}
/** Доглядач: лічильників нема й форма закрита — віконце закривається само (тло закриває лише гравцям, радник). */
function closeIfEmpty() {
  if (gm && !bad && !form && host && !host.preview().length) { ctrGone(ss); OBR.popover.close(ID.counters).catch(() => {}) }
}

$('h-icon').replaceWith(icon('counter'))
$('title').textContent = T.ctrTitle
$('add').textContent = '+'; $('add').title = T.ctrNew; $('add').setAttribute('aria-label', T.ctrNew)
$('add').onclick = () => { form = form ? null : blankForm(); open = ''; draft = null; render(true); if (form) $('f-name').focus(); else closeIfEmpty() }
// Esc — лише Доглядачу й лише для форми чи розгорнутого: віконце не закривається з клавіатури (його бачать усі)
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !gm) return
  if (form) { form = null; render(true); closeIfEmpty() } else if (open) { open = ''; draft = null; render(true) }
})

// «я живий» для тла (lib/pick.mjs, CTR_ALIVE): Owlbear може закрити віконце сам — тло тоді відкриє його знову
ctrAlive(ss); setInterval(() => {
  ctrAlive(ss)
  let f = 0
  try { f = +ss.getItem(CTR_FORM) || 0 } catch { /* ок */ }
  if (f && gm) { try { ss.removeItem(CTR_FORM) } catch { /* ок */ } if (!form) { form = blankForm(); open = ''; draft = null; render(true); $('f-name').focus() } }
}, 1000)
addEventListener('pagehide', () => ctrGone(ss))

OBR.onReady(async () => {
  const setTheme = t => document.documentElement.classList.toggle('light', !!t && t.mode === 'LIGHT')
  try { setTheme(await OBR.theme.getTheme()); OBR.theme.onChange(setTheme) } catch { /* тема необов'язкова */ }
  gm = (await OBR.player.getRole()) === 'GM'
  if (gm && q.get('new') === '1') form = blankForm()
  host = createCountersHost({
    OBR, gm, ui: (kind, d) => {
      if (kind === 'state') {
        const wasBad = bad
        list = d.list; bad = d.bad; newer = d.newer; use = d.usage
        render(wasBad !== bad)
        if (!form && !d.bad && !d.list.length && !host.preview().length) closeIfEmpty()
      } else if (kind === 'error') {
        const m = { bad: T.ctrBad, gone: T.ctrGone, full: T.ctrFull(CTR_N), 'too-big': T.ctrTooBig(d.pct), 'not-saved': T.ctrNotSaved, 'write-failed': T.ctrWriteFailed(d.msg) }
        say(m[d.code] || String(d.code), true)
        const back = sentForm && !form && !list.some(x => x.i === sentForm.i) && ['too-big', 'full', 'not-saved', 'write-failed'].includes(d.code)
        if (back) { form = sentForm.f; open = ''; draft = null }
        sentForm = null
        render(d.code === 'bad' || back)
      }
    },
  })
  await host.start()
  render(true)
  if (form) $('f-name').focus()
  // роль могла змінитися посеред гри (Доглядач передав роль): перечитати сторінку з новою роллю
  try { OBR.player.onChange(p => { if (p && p.role && (p.role === 'GM') !== gm) location.reload() }) } catch { /* необов'язково */ }
})
