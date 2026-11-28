// Пустельники в Owlbear Rodeo: ворог на токені — сувора чистка запису, бестіарій, «Як у книзі» (етап 4).
// Рішення автора 2026-11-27 (docs/decisions/owlbear.md, «Stage 4: …»), вердикт радника — блокери 1–3
// (docs/plans/2026-11-27-owlbear-stage4-design.md). Без OBR і без DOM: метадані пише будь-який гість кімнати, тож
// з токена береться лише те, що пройшло unpackEnemy; рядки показуються лише через textContent.
import { bytes } from './store.mjs'
import { K_ENEMY, HP_MAX, hasEnemy } from './enemy-bar.mjs'
import { ENEMIES, GROUPS, QS_GROUP, QS_ENEMIES } from './bestiary.mjs'
import { DMG_TYPES, R3, R4, DICE_RE } from '../foundry/battle.mjs'
import { CATS, ENEMY_V, bookCopy } from '../foundry/enemy-model.mjs'

export { K_ENEMY, GROUPS, QS_GROUP }
export const ENEMY_MAX = 30000   // байт на запис ворога (книжковий до 4 623, з книжковою копією «Свого» до ~10 000)
export const OWN = 'own'
const LIM = { name: 80, armorText: 400, atkName: 120, note: 400, aspect: 100, moveN: 120, moveT: 1500, notes: 4000, attacks: 16, aspects: 24, moves: 20, num: 99, inv: 9 }
const DEF_KEYS = ['phys', 'energy', 'fire', 'rad', 'poison', 'psy']
const FLAG_KEYS = ['electricVuln', 'halfPartial', 'noKnockdown', 'noStun', 'noDisarm', 'kamikaze', 'psyVuln']

/** Бестіарій і вороги Швидкого старту за id: Map (не obj[src], щоб «__proto__» чи «constructor» нічого не знайшли). */
export const BOOK = new Map([...ENEMIES, ...QS_ENEMIES].map(x => [x.id, x]))

const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x)
const str = (v, n) => typeof v === 'string' && v.length <= n ? v : null
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi ? v : null
const arr = (v, n) => Array.isArray(v) && v.length <= n ? v : null
const all = (list, f) => { const out = []; for (const x of list) { const y = f(x); if (y === null) return null; out.push(y) } return out }

function cleanAttack(a) {
  if (!isObj(a)) return null
  const name = str(a.name, LIM.atkName), dice = str(a.dice, 20), note = str(a.note, LIM.note)
  const ammoMax = int(a.ammoMax, 0, LIM.num), ammo = int(a.ammo, 0, LIM.num), ignoreN = int(a.ignoreN, 0, 9)
  if (name === null || dice === null || !DICE_RE.test(dice) || note === null || ammoMax === null || ammo === null || ammo > ammoMax || ignoreN === null) return null
  if (typeof a.type !== 'string' || !Object.hasOwn(DMG_TYPES, a.type) || typeof a.ignoreArmor !== 'boolean') return null
  return { name, dice, type: a.type, note, ammoMax, ammo, ignoreN, ignoreArmor: a.ignoreArmor }
}
function cleanAspect(a) {
  if (!isObj(a)) return null
  const t = str(a.t, LIM.aspect), inv = int(a.inv, 0, LIM.inv)
  return t === null || inv === null ? null : { t, inv }
}
function cleanMove(m) {
  if (!isObj(m)) return null
  const n = str(m.n, LIM.moveN), t = str(m.t, LIM.moveT), spent = m.spent === undefined ? 0 : int(m.spent, 0, LIM.inv)
  if (n === null || t === null || typeof m.used !== 'boolean' || spent === null) return null
  return { n, t, used: m.used, spent }
}
function cleanDef(d) {
  if (!isObj(d)) return null
  const out = {}
  for (const k of DEF_KEYS) { const v = d[k], ok = k === 'rad' ? R4 : R3; if (typeof v !== 'string' || !Object.hasOwn(ok, v)) return null; out[k] = v }
  return out
}
function cleanFlags(f) {
  if (!isObj(f)) return null
  const out = {}
  for (const k of FLAG_KEYS) { if (typeof f[k] !== 'boolean') return null; out[k] = f[k] }
  if (f.nonliving !== undefined && f.nonliving !== null && typeof f.nonliving !== 'boolean') return null
  if (f.nonliving !== undefined) out.nonliving = f.nonliving
  return out
}

/** system ворога з токена чи «Своїх» → чиста копія у формі Foundry, або null (нечитне). */
export function cleanSystem(e) {
  if (!isObj(e) || !CATS.includes(e.cat) || !isObj(e.hp)) return null
  const max = int(e.hp.max, 0, HP_MAX), value = int(e.hp.value, 0, HP_MAX)
  const armor = int(e.armor, 0, LIM.num), psiArmor = int(e.psiArmor, 0, LIM.num), armorText = str(e.armorText, LIM.armorText), notes = str(e.notes, LIM.notes)
  const def = cleanDef(e.def), flags = cleanFlags(e.flags)
  const attacks = arr(e.attacks, LIM.attacks) && all(e.attacks, cleanAttack)
  const baseAspects = arr(e.baseAspects, LIM.aspects) && all(e.baseAspects, cleanAspect)
  const aspects = arr(e.aspects, LIM.aspects) && all(e.aspects, cleanAspect)
  const moves = arr(e.moves, LIM.moves) && all(e.moves, cleanMove)
  if ([max, value, armor, psiArmor, armorText, notes, def, flags, attacks, baseAspects, aspects, moves].some(x => x === null || x === false)) return null
  return { v: ENEMY_V, cat: e.cat, hp: { value: Math.min(value, max), max }, armor, psiArmor, armorText, def, flags, attacks, baseAspects, aspects, moves, notes }
}
/** Книжкова копія «Свого» (bookCopy) → чиста, або null. */
function cleanBook(o) {
  if (!isObj(o)) return null
  const hp = int(o.hp, 0, HP_MAX)
  const s = hp === null ? null : cleanSystem({ cat: 'regular', hp: { value: hp, max: hp }, armor: o.armor, psiArmor: o.psiArmor, armorText: '', def: o.def, flags: o.flags, attacks: o.attacks, baseAspects: o.baseAspects, aspects: [], moves: o.moves, notes: o.notes })
  return s && bookCopy(s)
}

/**
 * Запис ворога з metadata токена → {src, name, e, o, book} або null (нечитне: картка «не читається», смужки немає).
 * book — що повертає «Як у книзі»: книжкова копія з бандла (src паку) чи з токена (o «Свого»); null — кнопка неактивна.
 */
export function unpackEnemy(meta) {
  if (!hasEnemy(meta)) return null
  const raw = meta[K_ENEMY]
  if (raw.v !== 1 || bytes(raw) > ENEMY_MAX || typeof raw.src !== 'string' || !/^(own|[A-Za-z0-9]{1,24})$/.test(raw.src)) return null
  const name = str(raw.name, LIM.name), e = cleanSystem(raw.e)
  if (name === null || !e) return null
  const r = Number.isSafeInteger(raw.r) && raw.r >= 0 ? raw.r : 0, w = typeof raw.w === 'string' ? raw.w.slice(0, 40) : ''
  if (raw.src === OWN) {
    const o = raw.o === undefined ? null : cleanBook(raw.o)
    if (raw.o !== undefined && !o) return null
    return { src: OWN, name, e, o, book: o, r, w }
  }
  const b = BOOK.get(raw.src)
  return { src: raw.src, name, e, o: null, book: b ? bookCopy(b.sys) : null, r, w }
}

/** Запис для токена: ворог з бестіарію (id) — повні ОЗ і набої, без позначок. → значення ключа K_ENEMY або null. */
export function enemyFromBook(id, { r = 1, w = '' } = {}) {
  const b = BOOK.get(id)
  return b ? { v: 1, r, w, src: id, name: b.name, e: cleanSystem(b.sys) } : null
}
/** Запис для токена: «Свій» (e — system з форми Foundry). Книжкова копія — на час створення (блокер 1). */
export function enemyOwn(name, e, { r = 1, w = '' } = {}) {
  const s = cleanSystem(e), n = str(name, LIM.name)
  const out = s && n !== null ? { v: 1, r, w, src: OWN, name: n, e: s, o: bookCopy(s) } : null
  return out && bytes(out) <= ENEMY_MAX ? out : null   // з книжковою копією «Свій» удвічі важчий: завеликий не піде на токен
}
/** Записати змінений system на той самий запис (ОЗ, набої, позначки, правки). */
export function withSystem(rec, e, { r, w }) {
  const s = cleanSystem(e)
  if (!s) return null
  const out = { v: 1, r, w, src: rec.src, name: rec.name, e: s }
  if (rec.src === OWN && rec.o) out.o = rec.o
  return bytes(out) <= ENEMY_MAX ? out : null
}
