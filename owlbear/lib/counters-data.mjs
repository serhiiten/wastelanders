// Пустельники в Owlbear Rodeo: лічильники Доглядача в room metadata (сесія Б, автор 2026-11-27), без OBR і без DOM.
// Рішення: docs/decisions/owlbear.md, «Counters, «Швидкий старт», help «?»»; план і вердикт радника:
// docs/plans/2026-11-27-owlbear-counters-plan.md.
//
// Ключ кімнати K_CTR = {v: 1, r, w, z}: r — номер зміни, w — id вкладки, z — base64(deflate-raw(JSON масиву лічильників)),
// той самий стиск, що в каравану. Лічильник {i, n, s, v, c?, d?}: i — id, n — назва, s — поділок, v — значення 0…s,
// c: 1 — довільний (1–100, без описів), d — описи поділок (масив довжини s, рядок до 120 кодових точок).
// Ключ окремий від K (store.mjs): бюджет каравану, реєстру й налаштувань (ROOM_MAX 6 000) не змінюється, а лічильники
// самі лишають кімнаті місце під найбільший караван і реєстр (вердикт радника, блокер 4).
import { NS, bytes } from './store.mjs'
import { deflate, inflate, toB64, fromB64, ROOM_TOTAL_MAX, CAR_MAX } from './caravan-data.mjs'

export const K_CTR = NS + '/counters'
export const CTR_V = 1
export const CTR_N = 12            // лічильників (автор, 2026-11-27, відповідь 4)
export const CTR_MAX = 4500        // байтів запису (ключ + значення), стиснуто; форма не пише понад це
export const CTR_STEP = 120        // запас для − / +: зміна значення не впирається в бюджет посеред гри (радник, блокер 3)
export const SIZES = [4, 6, 8, 10, 12]
export const CUSTOM_MAX = 100
export const NAME_MAX = 40
export const DESC_MAX = 120        // знаків опису поділки (автор, 2026-11-27: 120 замість 250)
export const DESC_LINES = 5
export const INFLATE_CTR = 131072  // найбільший чесний запис ≈ 12 × 12 × 120 кодових точок по 4 байти ≈ 70 КБ (радник, блокер 5)
export const WARN_AT = 0.8         // від 80% — попередження Доглядачу
// що лічильники лишають кімнаті для наших інших ключів: караван до CAR_MAX (+40 на обгортку й ключ), реєстр копій
// персонажів (до 100 записів ≈ 1,5 КБ) і налаштування аркушів
export const REG_RESERVE = 1600
export const SET_RESERVE = 200
const K_CAR = NS + '/caravan', K_REG = NS + '/reg', K_SET = NS + '/set'

// ---- чистка рядків ----
// керівні символи (крім \n у описі), напрям письма (U+202A–202E, U+2066–2069), U+2028/2029, нульової ширини U+200B–200F і U+FEFF
const RANGES = [[0, 9], [11, 31], [127, 159], [0x200B, 0x200F], [0x2028, 0x2029], [0x202A, 0x202E], [0x2066, 0x2069], [0xFEFF, 0xFEFF]]
const BAD_CH = new RegExp('[' + RANGES.map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('') + ']', 'g')
const cut = (s, n) => { const a = [...s]; return a.length > n ? a.slice(0, n).join('') : s }
/** Назва: один рядок, без керівних символів, обрізана пробілами, до NAME_MAX кодових точок. */
export function cleanName(x) {
  if (typeof x !== 'string') return ''
  return cut(x.replace(/\r\n?|\n/g, ' ').replace(BAD_CH, '').replace(/\s+/g, ' ').trim(), NAME_MAX).trim()
}
/** Опис поділки: \r\n → \n, до DESC_LINES рядків і DESC_MAX кодових точок. */
export function cleanDesc(x) {
  if (typeof x !== 'string') return ''
  const s = x.replace(/\r\n?/g, '\n').replace(BAD_CH, '')
  return cut(s.split('\n').slice(0, DESC_LINES).join('\n'), DESC_MAX).replace(/\s+$/, '')
}
/** Скільки знаків опису (кодових точок), як рахує лічильник знаків у формі. */
export const descLen = s => [...String(s || '')].length

const ID_RE = /^[a-z0-9]{8}$/
const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi

/**
 * Один лічильник з будь-чого → новий об'єкт з відомих полів або null. withDesc — лишати описи (Доглядач);
 * гравцеві описи не потрібні й до його сторінки не доходять (радник).
 */
export function cleanCounter(x, { withDesc = true } = {}) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null
  const i = typeof x.i === 'string' && ID_RE.test(x.i) ? x.i : null
  const n = cleanName(x.n)
  const custom = x.c === 1
  const s = custom ? (intIn(x.s, 1, CUSTOM_MAX) ? x.s : null) : (SIZES.includes(x.s) ? x.s : null)
  if (!i || !n || s === null || !Number.isInteger(x.v)) return null
  const out = { i, n, s, v: Math.max(0, Math.min(s, x.v)) }
  if (custom) out.c = 1
  else if (withDesc) {
    const d = Array.isArray(x.d) ? x.d : []
    const dd = Array.from({ length: s }, (_, k) => cleanDesc(d[k]))
    if (dd.some(Boolean)) out.d = dd
  }
  return out
}
/** Список: до CTR_N, повтор id відкидається. */
export function cleanList(arr, opts) {
  if (!Array.isArray(arr)) return []
  const out = [], seen = new Set()
  for (const x of arr) {
    if (out.length >= CTR_N) break
    const c = cleanCounter(x, opts)
    if (c && !seen.has(c.i)) { seen.add(c.i); out.push(c) }
  }
  return out
}

// ---- запис кімнати ----
/** Чи схоже на наш запис (без розпакування). */
export const isCtrRec = m => !!m && typeof m === 'object' && !Array.isArray(m) && Number.isSafeInteger(m.r) && m.r > 0
  && typeof m.w === 'string' && m.w.length <= 16 && typeof m.z === 'string'
/** Запис для кімнати: пишемо тим самим cleanList, що читає (симетрія, радник, блокер 5). */
export async function packCounters({ r, w, list }) {
  return { v: CTR_V, r, w, z: toB64(await deflate(JSON.stringify(cleanList(list)))) }
}
/** Байти запису в кімнаті (ключ + значення), як рахує Owlbear. */
export const recBytes = rec => bytes(K_CTR) + bytes(rec)

/**
 * Запис кімнати → {r, w, list} | {bad: true, newer} (ключ є, але не читається; newer — записала новіша версія) |
 * null (ключа немає). withDesc: false — без описів (гравець).
 */
export async function unpackCounters(m, { withDesc = true } = {}) {
  if (m === undefined || m === null) return null
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { bad: true, newer: false }
  if (Number.isInteger(m.v) && m.v > CTR_V) return { bad: true, newer: true }
  if (m.v !== CTR_V || !isCtrRec(m) || m.z.length > CTR_MAX + CTR_STEP) return { bad: true, newer: false }
  const u8 = fromB64(m.z)
  if (!u8) return { bad: true, newer: false }
  let arr
  try { arr = JSON.parse(await inflate(u8, INFLATE_CTR)) } catch { return { bad: true, newer: false } }
  if (!Array.isArray(arr)) return { bad: true, newer: false }
  return { r: m.r, w: m.w, list: cleanList(arr, { withDesc }) }
}

// ---- бюджет ----
/**
 * Скільки байтів може взяти запис лічильників у цій кімнаті: не більше CTR_MAX і стільки, щоб поруч завжди
 * вмістилися найбільший караван, реєстр і налаштування (а не скільки їх зараз), а чужі розширення лишилися як є.
 * room — уся metadata кімнати.
 */
export function ctrCap(room) {
  const m = room || {}
  const all = bytes(m)
  const mine = k => m[k] === undefined ? 0 : bytes(k) + bytes(m[k]) + 2   // +2: кома й двокрапка в JSON об'єкта
  const others = Math.max(0, all - mine(K_CTR) - mine(K_CAR) - mine(K_REG) - mine(K_SET))
  const reserve = Math.max(mine(K_CAR), bytes(K_CAR) + CAR_MAX + 40) + Math.max(mine(K_REG), REG_RESERVE) + Math.max(mine(K_SET), SET_RESERVE)
  return Math.max(0, Math.min(CTR_MAX, ROOM_TOTAL_MAX - others - reserve))
}
/** Частка зайнятого (0…1+) і чи попереджати. */
export function usage(rec, room) {
  const cap = ctrCap(room)
  const b = rec ? recBytes(rec) : 0
  const share = cap > 0 ? b / cap : 1
  return { bytes: b, cap, share, warn: share >= WARN_AT, pct: Math.min(999, Math.round(share * 100)) }
}
/** Чи можна записати rec: step — лише зміна значення (− / +), їй дозволено запас CTR_STEP. */
export const fits = (rec, room, step = false) => recBytes(rec) <= ctrCap(room) + (step ? CTR_STEP : 0)

// ---- дії Доглядача ----
// Дія — простий об'єкт; job черги застосовує список дій по черзі до свіжого стану з кімнати (радник, блокер 1).
// {t:'add', c} | {t:'step', i, by: ±1} | {t:'del', i} | {t:'edit', i, n?, d?} | {t:'clear'}
/**
 * Застосувати дії до списку. → {list, changes, errs}: changes — [{i, name, from, to, s, desc}] по одній на кожну
 * поділку (у журнал); errs — ['gone' | 'full' | 'edge' | 'bad'] для дій, що нічого не змінили.
 */
export function applyActions(list, acts) {
  let cur = cleanList(list)
  const changes = [], errs = []
  for (const a of acts || []) {
    if (!a || typeof a !== 'object') { errs.push('bad'); continue }
    if (a.t === 'clear') { cur = []; continue }
    if (a.t === 'add') {
      const c = cleanCounter(a.c)
      if (!c) errs.push('bad')
      else if (cur.length >= CTR_N) errs.push('full')
      else if (cur.some(x => x.i === c.i)) errs.push('bad')
      else cur = [...cur, c]
      continue
    }
    const k = cur.findIndex(x => x.i === a.i)
    if (k < 0) { errs.push('gone'); continue }   // лічильник уже видалено (друга вкладка)
    const c = cur[k]
    if (a.t === 'del') { cur = cur.filter((_, j) => j !== k); continue }
    if (a.t === 'step') {
      const to = c.v + (a.by > 0 ? 1 : -1)
      if (to < 0 || to > c.s) { errs.push('edge'); continue }   // «+» на максимумі: ні запису, ні журналу
      changes.push({ i: c.i, name: c.n, from: c.v, to, s: c.s, desc: (c.d && c.d[to - 1]) || '' })
      cur = cur.map((x, j) => j === k ? { ...x, v: to } : x)
      continue
    }
    if (a.t === 'edit') {
      const n = a.n === undefined ? c.n : cleanName(a.n)
      const next = cleanCounter({ ...c, n: n || c.n, d: a.d === undefined ? c.d : a.d })
      if (!next) { errs.push('bad'); continue }
      cur = cur.map((x, j) => j === k ? next : x)
      continue
    }
    errs.push('bad')
  }
  return { list: cur, changes, errs }
}
/** Чи це лише кроки − / + (запис отримує запас CTR_STEP). */
export const onlySteps = acts => (acts || []).length > 0 && acts.every(a => a && a.t === 'step')

/** Новий лічильник з форми: розмір 4–12 чи довільний 1–100, стартове значення в межах. → лічильник або null. */
export function newCounter({ i, n, size, custom = false, start }) {
  const s = Math.round(+size)
  const v = Math.round(+start)
  return cleanCounter({ i, n, s, v: Number.isFinite(v) ? v : 0, ...(custom ? { c: 1 } : {}) })
}

// ---- вигляд ----
/** Тло цифри: від червоного (0) до зеленого (максимум), темне, щоб білий напис читався (≥ 4,5:1, tests/counters.test.mjs). */
export function ctrColor(v, s) {
  const f = s > 0 ? Math.max(0, Math.min(1, v / s)) : 0
  return `hsl(${Math.round(120 * f)} 60% 28%)`
}
/** Опис поділки, на якій стоїть лічильник (порожньо для 0 і довільного). */
export const tickDesc = (c, v = c.v) => (c && c.d && v > 0 && c.d[v - 1]) || ''
