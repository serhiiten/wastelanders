// Пустельники в Owlbear Rodeo: форма «Свій» / «Редагувати» сторінки «Вороги» (етап 4, рядки 4.13–4.14).
// Автор, 2026-11-27: «Редагувати» = та сама форма, заповнена ворогом цього токена (Р1); одним стовпцем (Ф1); поля й порядок —
// «Новий супротивник» Foundry (templates/apps/enemy-create.hbs), підписи — з його шаблону й ext/foundry/battle.mjs.
// Ворога збирає buildEnemy Foundry (копія скриптом); заготовки атак і ходів — з бази генератора битв (копія terminal.mjs).
// «Свої» — localStorage браузера Доглядача, до 100, та сама чистка, що й для токена (вердикт радника, блокер 2).
import { CAT_LABEL, CAT_GUIDE, DMG_TYPES, R3, R4, DEF_FIELDS, atkType, buildAttackPresets, buildMovePresets } from '../foundry/battle.mjs'
import { CATS } from '../foundry/enemy-model.mjs'
import { DEF_SELECTS, FLAG_LIST, attackRow, attackFromPreset, catDefaults, blankForm, formFromSystem, buildEnemy, nonlivingShown } from '../foundry/enemy-create.mjs'
import { OWN, cleanSystem, enemyOwn } from './enemy-data.mjs'
import { safeStorage } from './storage.mjs'
import { T } from './texts.mjs'
import { icon } from './icons.mjs'

export const OWN_KEY = 'pust-obr-own'
export const OWN_MAX = 100

// ---- «Свої» (без DOM, тест tests/enemy-form.test.mjs) ----
/** Список «Своїх» зі сховища: лише ті, що пройшли чистку. → [{id, name, e, o, t}] */
export function ownGet(storage) {
  let raw = []
  try { raw = JSON.parse(storage.getItem(OWN_KEY) || '[]') } catch { raw = [] }
  if (!Array.isArray(raw)) return []
  const out = []
  for (const x of raw.slice(0, OWN_MAX)) {
    if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !/^[a-z0-9]{1,24}$/.test(x.id)) continue
    const rec = enemyOwn(x.name, x.e)
    if (!rec) continue
    // книжкова копія «Свого» — сам ворог на час створення (у сховищі він не змінюється), тож її рахуємо наново
    out.push({ id: x.id, name: rec.name, e: rec.e, o: rec.o, t: Number.isSafeInteger(x.t) ? x.t : 0 })
  }
  return out
}
/** Додати «Свого» на початок; понад 100 — найстаріші геть. → id або null (нечитне / сховище недоступне). */
export function ownPut(storage, name, e, { id, now = Date.now() } = {}) {
  const rec = enemyOwn(name, e)
  if (!rec) return null
  const list = ownGet(storage).filter(x => x.id !== id)
  list.unshift({ id, name: rec.name, e: rec.e, o: rec.o, t: now })
  try { storage.setItem(OWN_KEY, JSON.stringify(list.slice(0, OWN_MAX))); return id } catch { return null }
}
export function ownRemove(storage, id) {
  const list = ownGet(storage).filter(x => x.id !== id)
  try { storage.setItem(OWN_KEY, JSON.stringify(list)) } catch { /* ок */ }
}
/** Запис для токена з «Свого»: книжкова копія — на час створення. */
export function ownToRecord(x) { return x ? { v: 1, src: OWN, name: x.name, e: structuredClone(x.e), o: structuredClone(x.o) } : null }

/** «Як у книзі» у формі: книжкова копія (bookCopy) → поля форми; категорія й назва — з поточного ворога. */
export function formFromBook(book, e, name) {
  return formFromSystem({ cat: e.cat, hp: { value: book.hp, max: book.hp }, armor: book.armor, psiArmor: book.psiArmor, armorText: e.armorText,
    def: book.def, flags: book.flags, attacks: book.attacks, baseAspects: book.baseAspects, moves: book.moves, notes: book.notes }, { name })
}

/**
 * Зібрати ворога з форми. edit — поточний запис токена ({e}): ОЗ лишаються (не більше нового максимуму),
 * набої й позначки — як у Foundry після правки (повні, вільні). → {err} | {name, e}
 */
export function formToEnemy(form, { edit = null, baseName = '' } = {}) {
  const b = buildEnemy(form, { baseName })
  if (b.err) return { err: b.err }
  const e = cleanSystem(b.system)
  if (!e) return { err: T.enFormBad }
  if (!edit && !enemyOwn(b.name, e)) return { err: T.enTooBig }
  if (edit) {
    e.hp.value = Math.min(edit.e.hp.value, e.hp.max)
    // та сама атака (назва й запас) лишає свої набої, той самий хід — свої позначки: правка не «перезаряджає» ворога
    for (const a of e.attacks) { const o = edit.e.attacks.find(x => x.name === a.name && x.ammoMax === a.ammoMax); if (o) a.ammo = Math.min(o.ammo, a.ammoMax) }
    for (const m of e.moves) { const o = edit.e.moves.find(x => x.n === m.n && x.t === m.t); if (o) { m.used = o.used; m.spent = o.spent || 0 } }
    // ситуативні аспекти живуть у картці, не у формі (автор, 2026-11-28): правка й «Як у книзі» їх не стирають
    e.aspects = structuredClone(edit.e.aspects || [])
  }
  return { name: b.name, e }
}

// ---- заготовки (ліниво: копія terminal.mjs важить ~280 КБ) ----
let presetsP = null
const presets = () => presetsP || (presetsP = import('../foundry/terminal.mjs').then(m => {
  const db = m.createTerminal({ toast: () => {}, icon: () => '' }).battle.BT.DB
  return { attacks: buildAttackPresets(db), moves: buildMovePresets(db) }
}))

const cut = (s, n = 70) => (s.length > n ? `${s.slice(0, n - 2)}…` : s)
const defLabel = k => (DEF_FIELDS.find(f => f[0] === k) || [k, k])[1]

// ---- сторінка ----
export const formPage = {
  ownList: () => ownGet(safeStorage()).map(x => ({ id: x.id, name: x.name, cat: x.e.cat, hp: x.e.hp.max })),
  ownRecord: id => { const x = ownGet(safeStorage()).find(o => o.id === id); return x ? { ...ownToRecord(x), e: x.e } : null },

  /** ctx = {main, el, setBar, say, view, ctl, done(), made(rec)}; view.kind 'new' | 'edit'. */
  async render(ctx) {
    const { main, el, setBar, say, view, ctl } = ctx
    // запис токена береться раз, на вході у форму: зміни деінде не перетворюють «Редагувати» на «Свій»
    if (view.edit === undefined) view.edit = view.kind === 'edit' && ctl.state.kind === 'ok' ? ctl.state.rec : null
    const edit = view.edit
    if (!view.form) view.form = edit ? formFromSystem(edit.e, { name: edit.name }) : blankForm('')
    const f = view.form
    setBar(edit ? T.enEditTitle(edit.name) : T.enOwnTitle, { back: true })
    const P = await presets().catch(e => { console.error(e); return { attacks: [], moves: [] } })
    const redo = () => formPage.render(ctx)
    const num = (key, label, lo, hi, step = 1) => {
      const inp = el('input', { type: 'number', cls: 'fld', min: lo, max: hi, step, value: f[key], 'aria-label': label, 'data-f': key })
      inp.onchange = () => { const v = Math.round(+inp.value); f[key] = Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : f[key]; inp.value = f[key] }
      const bump = d => () => { f[key] = Math.max(lo, Math.min(hi, (+f[key] || 0) + d)); inp.value = f[key] }
      return el('div', { cls: 'hp' }, el('button', { type: 'button', cls: 'pm', title: T.enLess(label), 'aria-label': T.enLess(label), on: bump(-step) }, '−'), inp,
        el('button', { type: 'button', cls: 'pm', title: T.enMore(label), 'aria-label': T.enMore(label), on: bump(step) }, '+'))
    }
    const text = (obj, key, label, { area = false, ph = '' } = {}) => {
      const i = el(area ? 'textarea' : 'input', { type: area ? null : 'text', cls: 'fld', 'aria-label': label, placeholder: ph || null, rows: area ? 3 : null })
      i.value = obj[key] || ''
      i.oninput = () => { obj[key] = i.value }
      return i
    }
    const lab = t => el('label', { text: t })
    const nodes = []
    nodes.push(lab(T.fName), text(f, 'name', T.fName, { ph: 'Напр., Божевільний механік' }))
    const cat = el('select', { cls: 'fld', 'aria-label': T.fCat }, ...CATS.map(k => el('option', { value: k, selected: k === f.cat, text: CAT_LABEL[k] })))
    cat.onchange = () => { f.cat = cat.value; const d = catDefaults(f.cat); f.hp = d.hp; f.armor = d.armor; redo() }
    const guide = CAT_GUIDE[f.cat] || CAT_GUIDE.regular
    nodes.push(lab(T.fCat), cat, el('p', { cls: 'mut', text: guide.txt }))
    nodes.push(lab(T.enHp), num('hp', T.enHp, 1, 999))
    nodes.push(lab(T.enArmor), num('armor', T.enArmor, 0, 99))
    nodes.push(lab(T.fPsi), num('psiArmor', T.fPsi, 0, 99))
    nodes.push(lab(T.fDef))
    for (const k of DEF_SELECTS) {
      const s = el('select', { cls: 'fld', 'aria-label': defLabel(k) }, ...Object.entries(k === 'rad' ? R4 : R3).map(([v, l]) => el('option', { value: v, selected: v === f.def[k], text: l })))
      s.onchange = () => { f.def[k] = s.value }
      nodes.push(el('div', { cls: 'kv' }, el('span', { text: defLabel(k) }), s))
    }
    for (const [k, l] of [...FLAG_LIST, ['nonliving', T.fNonliving]]) {
      const c = el('input', { type: 'checkbox', checked: k === 'nonliving' ? nonlivingShown(f) : !!f.flags[k] })
      c.onchange = () => { f.flags[k] = c.checked }
      nodes.push(el('label', { cls: 'chk' }, c, ' ' + l))
    }
    // атаки
    nodes.push(el('div', { cls: 'sec', text: T.enAttacks }))
    if (!f.attacks.length) nodes.push(el('p', { cls: 'mut', text: 'Атак ще немає.' }))
    f.attacks.forEach((a, i) => {
      const type = el('select', { cls: 'fld', 'aria-label': 'Тип шкоди' },
        el('option', { value: '', selected: !a.type, text: `Авто: ${DMG_TYPES[atkType(`${a.n} ${a.note}`)].n}` }),
        ...Object.entries(DMG_TYPES).map(([k, t]) => el('option', { value: k, selected: k === a.type, text: t.n })))
      type.onchange = () => { a.type = type.value }
      const ammo = el('input', { type: 'number', cls: 'fld', min: 0, max: 20, value: a.ammo, 'aria-label': 'Заряди' })
      ammo.onchange = () => { a.ammo = Math.max(0, Math.min(20, Math.round(+ammo.value) || 0)); ammo.value = a.ammo }
      nodes.push(el('div', { cls: 'atk frm' },
        el('div', { cls: 'row' }, text(a, 'n', 'Назва атаки', { ph: 'Назва атаки' }), el('button', { type: 'button', cls: 'pm', title: 'Прибрати атаку', 'aria-label': 'Прибрати атаку', on: () => { f.attacks.splice(i, 1); redo() } }, '×')),
        el('div', { cls: 'row' }, Object.assign(text(a, 'd', 'Шкода: кістки', { ph: '1d10' }), { title: 'Кістки: 1d10, 2d6+2, «менша з 2d6»' }), type),
        el('div', { cls: 'row' }, el('span', { cls: 'mut', text: 'Заряди (0 — без обмежень)' }), ammo),
        text(a, 'note', 'Опис атаки', { ph: 'Опис: ігнорує 1 броні, влучає по всіх у зоні…' })))
    })
    const atkSel = el('select', { cls: 'fld', 'aria-label': 'Додати атаку із заготовки' }, el('option', { value: '', text: '+ Додати атаку…' }), el('option', { value: 'blank', text: 'Порожня атака' }),
      ...P.attacks.map(([g, l], gi) => el('optgroup', { label: g }, ...l.map((p, pi) => el('option', { value: `${gi}:${pi}`, text: cut(`${p.n} (${p.d}${p.note ? ', ' + p.note : ''})`) })))))
    atkSel.onchange = () => {
      const v = atkSel.value; if (!v) return
      if (v === 'blank') f.attacks.push(attackRow({}))
      else { const [gi, pi] = v.split(':').map(Number); const p = P.attacks[gi] && P.attacks[gi][1][pi]; if (p) f.attacks.push(attackFromPreset(p)) }
      redo()
    }
    nodes.push(atkSel)
    // ходи
    nodes.push(el('div', { cls: 'sec', text: T.enMoves }))
    if (!f.moves.length) nodes.push(el('p', { cls: 'mut', text: 'Ходів немає (у статистів і рядових їх зазвичай немає).' }))
    f.moves.forEach((m, i) => nodes.push(el('div', { cls: 'mv frm' },
      el('div', { cls: 'row' }, text(m, 'n', 'Назва ходу', { ph: 'Назва ходу' }), el('button', { type: 'button', cls: 'pm', title: 'Прибрати хід', 'aria-label': 'Прибрати хід', on: () => { f.moves.splice(i, 1); redo() } }, '×')),
      text(m, 't', 'Опис ходу', { area: true, ph: 'Що робить: раз за сцену завдає 2d6 шкоди…' }))))
    const mvSel = el('select', { cls: 'fld', 'aria-label': 'Додати хід із заготовки' }, el('option', { value: '', text: '+ Додати хід…' }), el('option', { value: 'blank', text: 'Порожній хід' }),
      el('optgroup', { label: 'З бази супротивників' }, ...P.moves.map((p, i) => el('option', { value: String(i), text: cut(`${p.n}: ${p.t}`) }))))
    mvSel.onchange = () => {
      const v = mvSel.value; if (!v) return
      if (v === 'blank') f.moves.push({ n: '', t: '' }); else { const p = P.moves[+v]; if (p) f.moves.push({ n: p.n, t: p.t }) }
      redo()
    }
    nodes.push(mvSel)
    // аспекти
    nodes.push(el('div', { cls: 'sec', text: T.fAspects }))
    nodes.push(el('div', { cls: 'asp' }, ...f.aspects.map((a, i) => el('span', {}, a.t, ' ', el('button', { type: 'button', cls: 'x', title: 'Прибрати аспект', 'aria-label': 'Прибрати аспект', on: () => { f.aspects.splice(i, 1); redo() } }, '×')))))
    const asp = el('input', { type: 'text', cls: 'fld', placeholder: '+ аспект, Enter', 'aria-label': 'Новий аспект', 'data-f': 'asp' })
    asp.onkeydown = e => { if (e.key === 'Enter' && asp.value.trim()) { e.preventDefault(); f.aspects.push({ t: asp.value.trim(), inv: 0 }); redo() } }
    nodes.push(asp)
    nodes.push(el('div', { cls: 'sec', text: 'Примітка' }), text(f, 'notes', 'Примітка', { area: true, ph: 'Що можна забрати з тіла, особливі правила…' }))
    // кнопки
    const save = () => {
      const r = formToEnemy(f, { edit })
      if (r.err) return say('f', 'err', r.err, { ttl: 8000 })
      if (edit) {
        const raw = { v: 1, src: edit.src, name: r.name, e: r.e, ...(edit.o ? { o: edit.o } : {}) }
        if (ctl.put(raw)) {
          if (r.name !== edit.name) ctl.relabel(edit.name, r.name).catch(e => console.error(e))   // підпис токена = нова назва, хай який був (автор, 2026-11-28)
          say('f', 'ok', T.enSaved, { ttl: 4000 }); view.form = null; return ctx.done()
        }
        return
      }
      const id = Math.floor(Math.random() * 2 ** 32).toString(36) + Date.now().toString(36)
      if (!ownPut(safeStorage(), r.name, r.e, { id })) say('f', 'warn', T.enOwnNotKept, { ttl: 8000 })
      view.form = null
      return ctx.made({ v: 1, src: OWN, name: r.name, e: r.e, o: enemyOwn(r.name, r.e).o })
    }
    const acts = [el('button', { type: 'button', on: () => { view.form = null; ctx.done() } }, 'Скасувати')]
    if (edit) acts.unshift(el('button', { type: 'button', title: T.enBookHint, disabled: !edit.book, on: () => { view.form = formFromBook(edit.book, edit.e, f.name || edit.name); redo() } }, '↺ ' + T.enAsBook))
    acts.push(el('button', { type: 'button', cls: 'main', on: save }, icon('check'), edit ? T.enSaveToken : 'Створити супротивника'))
    nodes.push(el('div', { cls: 'foot' }, ...acts))
    main.replaceChildren(...nodes)
  },
}
