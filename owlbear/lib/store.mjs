// Пустельники в Owlbear Rodeo: чисті функції даних аркуша (без OBR і без DOM).
// Дизайн: docs/plans/2026-11-26-owlbear-stage1-design.md, «Дані в Owlbear».

export const NS = 'ua.pustelnyky.obr'
export const K = {
  sheet: NS + '/sheet',   // токен: {v:1, cid, r, w, st} — стан аркуша без портрета
  portrait: NS + '/portrait',   // токен: data URL портрета; в Owlbear не показується, пишеться лише коли змінився
  owner: NS + '/owner',   // токен: {n, id} — кому Доглядач призначив токен
  reg: NS + '/reg',       // кімната: {cid: r} — останній номер зміни кожного персонажа
  set: NS + '/set',       // кімната: {claws, psi, pa, guns} — налаштування аркушів від Доглядача
  caravan: NS + '/caravan',   // кімната: {v:1, r, w, z} — караван, стиснутий (етап 3, lib/caravan-data.mjs)
}
export const ITEM_MAX = 900000   // байт на наш запис у metadata токена (ліміт Owlbear ≈1 MiB)
export const ROOM_MAX = 6000     // байт на всі наші ключі кімнати (ліміт ≈16 000 на всі розширення)
export const REG_MAX = 100       // записів у реєстрі
export const SET_KEYS = ['claws', 'psi', 'pa', 'guns']   // ті самі, що CG_SET_KEYS терміналу
export const CACHE_PREFIX = 'pust-obr-c:'
// Портрет довший за це (символів data URL) у кеш браузера не йде: аркуш сам стискає портрет до 600 px (≈30–150 тис.),
// а .json із Foundry може принести файл до 1 МБ (≈1,37 млн символів base64), і кілька таких забили б localStorage (≈5 млн)
export const CACHE_PORTRAIT_MAX = 300000

const enc = new TextEncoder()
/** Байти JSON у UTF-8 (так Owlbear рахує ліміти). */
export const bytes = x => enc.encode(typeof x === 'string' ? x : JSON.stringify(x === undefined ? null : x)).length

const CID_ABC = 'abcdefghijklmnopqrstuvwxyz0123456789'
/** Новий id персонажа: 8 символів. rand — () => [0,1). */
export function newCid(rand = Math.random) {
  let s = ''
  for (let i = 0; i < 8; i++) s += CID_ABC[Math.floor(rand() * CID_ABC.length)]
  return s
}

/** Копія стану без портрета (портрет токена — окремий ключ K.portrait, щоб часті записи аркуша лишалися малими). */
export function stripPortrait(st) {
  if (!st || typeof st !== 'object') return st
  const { portrait, ...rest } = st
  return rest
}
/** Портрет, якому можна вірити: лише data URL зображення (гість пише будь-яку metadata, а аркуш вставляє портрет в <img src>). */
const PORTRAIT_RE = /^data:image\/(png|jpeg|webp|gif|avif|bmp|svg\+xml);base64,[A-Za-z0-9+/=]+$/   // svg в <img> скриптів не виконує
export const cleanPortrait = p => typeof p === 'string' && PORTRAIT_RE.test(p) ? p : null
/** Повний стан для аркуша: стан токена + портрет токена (або null). */
export const withPortrait = (st, portrait) => ({ ...stripPortrait(st), portrait: cleanPortrait(portrait) })

/** Запис аркуша на токені; hp — {value, max} з рушія аркуша для смужки над токеном (автор, 2026-11-27, A), лише цілі в межах. */
export function packSheet({ cid, r, w, st, hp = null }) {
  const ok = hp && Number.isInteger(hp.max) && hp.max >= 1 && hp.max <= 999 && Number.isInteger(hp.value)
  return { v: 1, cid, r, w, st: stripPortrait(st), ...(ok ? { hp: { value: Math.max(0, Math.min(hp.value, hp.max)), max: hp.max } } : {}) }
}
/** Запис токена → {cid, r, w, st} або null, якщо там не наш аркуш. */
export function unpackSheet(m) {
  if (!m || typeof m !== 'object' || m.v !== 1) return null
  if (typeof m.cid !== 'string' || !m.cid || !Number.isFinite(m.r) || !m.st || typeof m.st !== 'object') return null
  return { cid: m.cid, r: m.r, w: typeof m.w === 'string' ? m.w : '', st: stripPortrait(m.st) }
}

/** Новий номер зміни: більший і за той, що на токені, і за той, що в реєстрі. */
export const nextR = (metaR, regR) => Math.max(metaR || 0, regR || 0) + 1

/** Реєстр з новим записом cid → r; найстаріші записи (за порядком оновлення) викидаються понад max. */
export function regUpdate(reg, cid, r, max = REG_MAX) {
  const out = {}
  for (const [k, v] of Object.entries(reg && typeof reg === 'object' ? reg : {})) if (k !== cid && Number.isFinite(v)) out[k] = v
  out[cid] = Math.max(r, (reg && Number.isFinite(reg[cid])) ? reg[cid] : 0)
  const keys = Object.keys(out)
  for (let i = 0; i < keys.length - max; i++) delete out[keys[i]]
  return out
}

/** Байти наших ключів кімнати після накладання patch. */
export function roomBytes(room, patch = {}) {
  const m = { ...(room || {}), ...patch }
  let n = 0
  for (const k of Object.values(K)) if (m[k] !== undefined) n += bytes(k) + bytes(m[k])
  return n
}
/** Байти наших ключів токена (аркуш, власник, портрет). */
export const itemBytes = (sheetVal, ownerVal, portrait) => bytes(sheetVal) + bytes(ownerVal || null) + (portrait ? bytes(portrait) : 0)
/** Чи влазить запис токена (наші ключі) у ліміт. */
export const itemFits = (sheetVal, ownerVal, portrait) => itemBytes(sheetVal, ownerVal, portrait) <= ITEM_MAX

/**
 * Хто відкриває токен. me = {id, name, role: 'GM'|'PLAYER'}.
 * 'gm' — Доглядач (будь-який токен); 'own' — збіг за id; 'name' — збіг лише за ім'ям (спитати «це ти?»);
 * 'other' — токен іншого гравця; 'unassigned' — Доглядач токен ще нікому не призначив.
 */
export function access(owner, me) {
  if (me && me.role === 'GM') return 'gm'
  if (!owner || typeof owner !== 'object' || (!owner.id && !owner.n)) return 'unassigned'
  if (owner.id && me && owner.id === me.id) return 'own'
  if (owner.n && me && owner.n === me.name) return 'name'
  return 'other'
}
/** Відповідь «Так, це я»: дописати мій id до призначення. */
export const claimOwner = (owner, me) => ({ n: (owner && owner.n) || me.name, id: me.id })

/**
 * Копія токена (В3). metaR — номер на токені, regR — у реєстрі, cacheR — у кеші браузера (або undefined).
 * 'ok' — токен найновіший; 'cache' — у браузері є новіший за реєстр стан, беремо його; 'stale' — новіша версія десь інде.
 */
export function staleness(metaR, regR, cacheR) {
  if (!(regR > metaR)) return 'ok'
  if (Number.isFinite(cacheR) && cacheR >= regR) return 'cache'
  return 'stale'
}

/** Налаштування Доглядача з кімнати поверх st.set (як cgApplySet терміналу). */
export function applySet(st, set) {
  if (!st || typeof st !== 'object' || !set || typeof set !== 'object') return st
  const s = { ...(st.set || {}) }
  for (const k of SET_KEYS) if (k in set) s[k] = !!set[k]
  return { ...st, set: s }
}
export function pickSet(st) {
  const s = (st && st.set) || {}
  const out = {}
  for (const k of SET_KEYS) out[k] = !!s[k]
  return out
}
export const sameSet = (a, b) => SET_KEYS.every(k => !!(a && a[k]) === !!(b && b[k]))

/** Власне відлуння: зміну написала ця вкладка, і вона не новіша за мій останній запис. */
export const isEcho = (meta, myW, myR) => !!meta && meta.w === myW && meta.r <= myR

// ---- кеш браузера: pust-obr-c:<cid> → {n, r, t, st} — знімок персонажа на зміну №r (з портретом, щоб персонаж зі списку
// «Твої персонажі в цьому браузері» і новіший знімок В3 не губили його); портрет для відкриття береться з токена, не звідси ----
// storage — інтерфейс localStorage (getItem/setItem/removeItem/key/length); будь-яка помилка тут не валить аркуш.

export function cacheGet(storage, cid) {
  try {
    const v = JSON.parse(storage.getItem(CACHE_PREFIX + cid))
    return v && typeof v === 'object' && v.st ? v : null
  } catch { return null }
}
export function cacheList(storage) {
  const out = []
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)
      if (!k || !k.startsWith(CACHE_PREFIX)) continue
      const v = cacheGet(storage, k.slice(CACHE_PREFIX.length))
      if (v) out.push({ cid: k.slice(CACHE_PREFIX.length), n: v.n || '', r: v.r || 0, t: v.t || 0 })
    }
  } catch { /* сховище недоступне */ }
  return out.sort((a, b) => b.t - a.t)
}
/**
 * Записати персонажа в кеш. Великий портрет (понад CACHE_PORTRAIT_MAX) не кешується. Місця немає — викинути найстаріших
 * інших і спробувати ще; далі — поточний без портрета; не вдалося й так — прибрати власний старий знімок, щоб список
 * «Твої персонажі в цьому браузері» не підсунув застарілу версію. Кеш — зручність: запис на токен від нього не залежить.
 * → 'full' | 'lean' (без портрета) | false (не записано).
 */
export function cachePut(storage, cid, { r, st }, now = Date.now()) {
  const val = s => JSON.stringify({ n: (st && st.name) || '', r, t: now, st: s })
  const tryPut = v => { try { storage.setItem(CACHE_PREFIX + cid, v); return true } catch { return false } }
  const big = st && typeof st.portrait === 'string' && st.portrait.length > CACHE_PORTRAIT_MAX
  const lean = st && st.portrait ? val({ ...st, portrait: null }) : null
  const full = big ? lean : val(st)
  const kind = big ? 'lean' : 'full'
  if (tryPut(full)) return kind
  for (const old of cacheList(storage).filter(x => x.cid !== cid).reverse()) {
    try { storage.removeItem(CACHE_PREFIX + old.cid) } catch { break }
    if (tryPut(full)) return kind
  }
  if (lean && !big && tryPut(lean)) return 'lean'
  try { storage.removeItem(CACHE_PREFIX + cid) } catch { /* сховище недоступне */ }
  return false
}
