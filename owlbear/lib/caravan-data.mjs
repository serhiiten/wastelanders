// Пустельники в Owlbear Rodeo: дані каравану в room metadata (етап 3), без OBR і без DOM.
// Дизайн: docs/plans/2026-11-27-owlbear-stage3-design.md, «Дані» й «Одночасні правки».
//
// Ключ кімнати K.caravan = {v: 1, r, w, z}: r — номер зміни, w — id вкладки, що записала,
// z — base64(deflate-raw(JSON стану аркуша)). Караван у кімнаті завжди стиснутий (автор, В2, 2026-11-26);
// при закритті вікна, коли чекати стиснення ніколи, той самий формат пишеться «збереженим» блоком deflate (BTYPE 00).

export const CAR_V = 1
export const INFLATE_MAX = 400000   // байтів після розпакування: більше — підробка («бомба» з 6 КБ)
// Частки сховища кімнати (байти UTF-8 JSON, як рахує Owlbear): уся кімната ≈16 000 на всі розширення; наші ключі — ROOM_MAX
// (store.mjs, 6 000); з них каравану — CAR_MAX, решта — реєстру копій персонажів і налаштуванням (радник, Ж3)
export const ROOM_TOTAL_MAX = 15900
export const CAR_MAX = 4400
// поля стану, що зливаються на рівень глибше (об'єкти); решта, зокрема списки cargo / counters / customImps, — цілим полем
export const NESTED = ['imp', 'story', 'defOv', 'manual']

const enc = new TextEncoder()
const dec = new TextDecoder()

// ---- base64 для байтів (btoa / atob є і в браузері, і в Node) ----
export function toB64(u8) {
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
  return btoa(s)
}
export function fromB64(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4) return null
  try {
    const b = atob(s), u8 = new Uint8Array(b.length)
    for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i)
    return u8
  } catch { return null }
}

async function readAll(stream, max = Infinity) {
  const reader = stream.getReader(), parts = []
  let n = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    n += value.length
    if (n > max) { try { await reader.cancel() } catch { /* ок */ } throw new Error('inflate-too-big') }
    parts.push(value)
  }
  const out = new Uint8Array(n)
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
const pipe = (u8, ts) => new Blob([u8]).stream().pipeThrough(ts)

/** Стиснути рядок: deflate-raw → Uint8Array. */
export const deflate = str => readAll(pipe(enc.encode(str), new CompressionStream('deflate-raw')))

/** Той самий формат deflate-raw без стиснення, синхронно: «збережені» блоки (BTYPE 00) по 65 535 байтів. */
export function storedDeflate(str) {
  const data = enc.encode(str), n = Math.max(1, Math.ceil(data.length / 65535))
  const out = new Uint8Array(data.length + 5 * n)
  let o = 0
  for (let i = 0; i < n; i++) {
    const chunk = data.subarray(i * 65535, (i + 1) * 65535), len = chunk.length
    out[o++] = i === n - 1 ? 1 : 0   // BFINAL, BTYPE 00; решта бітів байта — вирівнювання
    out[o++] = len & 255; out[o++] = len >> 8
    out[o++] = ~len & 255; out[o++] = (~len >> 8) & 255
    out.set(chunk, o); o += len
  }
  return out
}

/** Розпакувати deflate-raw → рядок; більше за max байтів чи не deflate → помилка. */
export async function inflate(u8, max = INFLATE_MAX) {
  return dec.decode(await readAll(pipe(u8, new DecompressionStream('deflate-raw')), max))
}

/** Запис для кімнати. sync — без чекання («збережений» блок, для закриття вікна). */
// x: 1 — запис замінює увесь караван («Відкрити .json», «Очистити аркуш», «Випадковий караван», «Швидкий старт»,
// «Повернути останній караван»): інші вкладки беруть його цілим, без злиття (ревізор, 2026-11-27)
export async function packCaravan({ r, w, st, x = false }) {
  return { v: CAR_V, r, w, z: toB64(await deflate(JSON.stringify(st))), ...(x ? { x: 1 } : {}) }
}
export function packCaravanSync({ r, w, st, x = false }) {
  return { v: CAR_V, r, w, z: toB64(storedDeflate(JSON.stringify(st))), ...(x ? { x: 1 } : {}) }
}

/** Чи схоже значення кімнати на наш запис (без розпакування). */
export const isCaravanRec = m => !!m && typeof m === 'object' && !Array.isArray(m) && m.v === CAR_V
  && Number.isSafeInteger(m.r) && m.r > 0 && typeof m.w === 'string' && typeof m.z === 'string'

/** Запис кімнати → {r, w, st} або null (не наш запис, пошкоджений чи підроблений). */
export async function unpackCaravan(m) {
  if (!isCaravanRec(m) || m.z.length > CAR_MAX) return null   // довший за частку каравану — не наш запис
  const u8 = fromB64(m.z)
  if (!u8) return null
  let st
  try { st = JSON.parse(await inflate(u8)) } catch { return null }
  if (!st || typeof st !== 'object' || Array.isArray(st)) return null
  return { r: m.r, w: m.w, st: cleanState(st), x: m.x === 1 }
}

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
/** Без ключів, що міняють прототип у Object.assign аркуша (normalize): кімнату пише будь-хто (радник, Ж5). */
export function cleanState(x, depth = 0) {
  if (!x || typeof x !== 'object' || depth > 6) return depth > 6 ? null : x
  if (Array.isArray(x)) return x.map(v => cleanState(v, depth + 1))
  const out = {}
  for (const k of Object.keys(x)) if (!BAD_KEYS.has(k)) out[k] = cleanState(x[k], depth + 1)
  return out
}

// ---- злиття за полями з трьох сторін ----
/** JSON з ключами по порядку: однакові об'єкти дають однаковий рядок незалежно від порядку ключів. */
export function canon(x) {
  if (x === undefined) return 'undefined'
  if (x === null || typeof x !== 'object') return JSON.stringify(x)
  if (Array.isArray(x)) return '[' + x.map(v => v === undefined ? 'null' : canon(v)).join(',') + ']'
  return '{' + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}'
}
const same = (a, b) => canon(a) === canon(b)
const plain = x => !!x && typeof x === 'object' && !Array.isArray(x)

function mergeLevel(base, mine, theirs, path, conflicts, deep) {
  const out = {}
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(mine || {}), ...Object.keys(theirs || {})])
  for (const k of keys) {
    const b = base ? base[k] : undefined, m = mine ? mine[k] : undefined, t = theirs ? theirs[k] : undefined
    if (deep && NESTED.includes(k) && plain(m) && plain(t)) {
      out[k] = mergeLevel(plain(b) ? b : {}, m, t, path + k + '.', conflicts, false)
      continue
    }
    // списки однакової довжини з усіх трьох боків (лічильники, вантаж) — поелементно за полями (радник, Ж2):
    // клацання по різних лічильниках не затирають одне одного; додали чи прибрали рядок — список цілим полем
    if (deep && Array.isArray(b) && Array.isArray(m) && Array.isArray(t) && b.length === m.length && m.length === t.length
      && [b, m, t].every(a => a.every(plain))) {
      out[k] = m.map((mi, i) => mergeLevel(b[i], mi, t[i], `${path}${k}.${i}.`, conflicts, false))
      continue
    }
    // поля, якого в «них» немає (старий запис без нового ключа), «вони» не змінювали
    const theyChanged = t !== undefined && !same(b, t)
    const iChanged = !same(b, m)
    if (theyChanged && iChanged && !same(m, t)) conflicts.push(path + k)
    const v = theyChanged && !iChanged ? t : m
    if (v !== undefined) out[k] = v
  }
  return out
}

/**
 * Злиття: base — спільний предок, mine — аркуш цієї вкладки, theirs — кімната.
 * Поле змінила одна сторона — її значення; обидві — моє (пишу пізніше), і поле йде в conflicts.
 * → {st, conflicts: ['notes', 'imp.armor', …]}
 */
export function mergeCaravan(base, mine, theirs) {
  const conflicts = []
  if (!plain(theirs)) return { st: mine, conflicts }
  if (!plain(mine)) return { st: theirs, conflicts }
  return { st: mergeLevel(plain(base) ? base : {}, mine, theirs, '', conflicts, true), conflicts }
}
export const caravanKey = st => canon(st)
