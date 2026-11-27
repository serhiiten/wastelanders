// Пустельники в Owlbear Rodeo: кидки з аркуша для всіх за столом і «Журнал кидків». Без DOM.
// Дизайн: docs/plans/2026-11-27-owlbear-stage2-design.md; рішення автора: docs/decisions/owlbear.md, «Stage 2».
//
// Шлях кидка: аркуш (CG_HOOK 'check' | 'fate' | 'dmg') → sheet.mjs → buildRoll() → OBR.broadcast на CH, 'ALL'
// → background.mjs у кожного: parseRoll() → logAdd() у localStorage → сповіщення (не тому, хто кидав).
// Безпека (2.3): broadcast може надіслати будь-хто в кімнаті, тож parseRoll бере лише відомі поля відомих типів,
// а сторінки малюють запис лише через textContent; деталі кісток (gx) — через білий список detailNodes().
import { NS } from './store.mjs'

export const CH = NS + '/roll'
export const LOG_KEY = 'pust-obr-log'
export const LOG_MAX = 50
export const MSG_MAX = 4000   // байтів в одному повідомленні (ліміт broadcast — 64 kB)
export const VERDICTS = ['Невдача', 'Частковий успіх', 'Успіх', 'Критичний успіх']   // cg_src.html, VERDICTS
const KINDS = ['check', 'fate', 'dmg', 'dice', 'edmg', 'gen']
// Шкода ворога (етап 4, автор 2026-11-27: усім, завжди; лише від Доглядача — вердикт радника): ключ типу — як у картці
// ворога Foundry (ext/foundry/battle.mjs, DMG_TYPES), назви — тут, щоб тло не вантажило battle.mjs; тест на рівність.
export const ETYPES = {
  phys: 'Фізична', laser: 'Лазерна (ігнорує 1 броні)', plasma: 'Плазмова (ігнорує 2 броні)', gauss: 'Гаус (ігнорує 3 броні)',
  electric: 'Електрична (+1d6 роботам)', cryo: 'Кріо', fire: 'Вогонь', rad: 'Радіація (ігнорує броню)',
  poison: 'Отрута (ігнорує броню)', psychic: 'Психічна (ігнорує фізичну броню)',
}
export const EDICE = { count: 20, sMin: 2, sMax: 100, mod: 99 }
// Панель «Кістки» (автор, 2026-11-27, варіант К3): кількість кожної кістки, модифікатор ±N. Кістки — як у вікі: d6, 1d10.
export const DICE = { sides: [6, 8, 10], nMin: 2, nMax: 100, count: 20, groups: 4, mod: 99 }
export const ERR_MS = 6000     // червоне сповіщення Owlbear само не зникає: закриваємо його самі (автор, 2026-11-27)
const LIM = { title: 120, text: 3500, who: 60, label: 120, typeName: 60, type: 20, name: 80, dstr: 40, gx: 2000, id: 16, by: 60, note: 200 }

const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : ''
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi ? v : null
const bytes = x => new TextEncoder().encode(JSON.stringify(x)).length

/** Повідомлення про кидок з того, що надіслав аркуш. who — ім'я персонажа; id — випадковий. null — не кидок. */
export function buildRoll(kind, d, { who, id }) {
  if (!KINDS.includes(kind) || !d || typeof d !== 'object') return null
  const m = { v: 1, id: str(id, LIM.id), kind, who: str(who, LIM.who), total: Math.round(+d.total || 0) }
  if (kind === 'check') Object.assign(m, { verdict: +d.verdict || 0, label: str(d.label, LIM.label), type: str(d.type, LIM.type), typeName: str(d.typeName, LIM.typeName), aspect: !!d.aspect, rt: Number.isSafeInteger(Math.round(+d.time)) ? Math.round(+d.time) : 0 })
  if (kind === 'fate') Object.assign(m, { die: Math.round(+d.v || 0), mod: Math.round(+d.mod || 0), mode: d.mode === 'char' ? 'char' : 'party' })
  if (kind === 'dmg') Object.assign(m, { name: str(d.name, LIM.name), dstr: str(d.dstr, LIM.dstr), rerolled: !!d.rerolled })
  if (kind === 'dice') { const g = diceGroups(d.g), mod = int(d.mod, -DICE.mod, DICE.mod); if (!g || mod === null) return null; Object.assign(m, { g, mod, total: diceSum(g, mod) }); return m }
  if (kind === 'edmg') { const x = enemyDice(d); if (!x) return null; Object.assign(m, x, { name: str(d.name, LIM.name), note: str(d.note, LIM.note) }); return m }
  // «Показати всім» генераторів (етап 4б, Л1): заголовок і простий текст, без числа
  if (kind === 'gen') { Object.assign(m, { total: 0, title: str(d.title, LIM.title), text: str(d.text, LIM.text) }); if (!m.title) return null; while (bytes(m) > MSG_MAX) m.text = m.text.slice(0, Math.floor(m.text.length * 0.8)); return m }
  if (kind !== 'fate') m.gx = str(d.gx, LIM.gx)
  while (m.gx && bytes(m) > MSG_MAX) m.gx = m.gx.slice(0, Math.floor(m.gx.length * 0.8))
  return m
}

/** Сувора перевірка повідомлення з broadcast: запис журналу без by / t, або null (відкинути). */
export function parseRoll(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m) || m.v !== 1 || !KINDS.includes(m.kind)) return null
  // кістки: до 4 × 20 кісток по 100 граней і модифікатор ±99 — підсумок до 8099
  const id = str(m.id, LIM.id), total = m.kind === 'dice' ? int(m.total, -99, 9999) : int(m.total, -99, 999)
  if (!/^[A-Za-z0-9_-]{4,16}$/.test(id) || total === null) return null
  const e = { id, kind: m.kind, who: str(m.who, LIM.who), total }
  if (m.kind === 'check') {
    const verdict = int(m.verdict, 0, 3)
    if (verdict === null) return null
    Object.assign(e, { verdict, label: str(m.label, LIM.label), type: str(m.type, LIM.type), typeName: str(m.typeName, LIM.typeName), aspect: m.aspect === true, rt: Number.isSafeInteger(m.rt) && m.rt > 0 ? m.rt : 0 })
    const re = parseRe(m.re)
    if (re) e.re = re
  } else if (m.kind === 'dice') {
    const g = diceGroups(m.g), mod = int(m.mod, -DICE.mod, DICE.mod)
    if (!g || mod === null || diceSum(g, mod) !== total) return null   // підсумок рахуємо самі
    Object.assign(e, { g, mod })
    return e
  } else if (m.kind === 'edmg') {
    const x = enemyDice(m)
    if (!x || x.total !== total) return null   // підсумок рахуємо самі
    Object.assign(e, x, { name: str(m.name, LIM.name), note: str(m.note, LIM.note) })
    return e
  } else if (m.kind === 'gen') {
    const title = str(m.title, LIM.title)
    if (!title || total !== 0) return null
    Object.assign(e, { title, text: str(m.text, LIM.text) })
    return e
  } else if (m.kind === 'fate') {
    const die = int(m.die, 1, 10), mod = int(m.mod, -20, 20)
    if (die === null || mod === null) return null
    Object.assign(e, { die, mod, mode: m.mode === 'char' ? 'char' : 'party' })
  } else {
    Object.assign(e, { name: str(m.name, LIM.name), dstr: str(m.dstr, LIM.dstr), rerolled: m.rerolled === true })
  }
  if (m.kind !== 'fate' && typeof m.gx === 'string' && m.gx) e.gx = str(m.gx, LIM.gx)
  return e
}

/** Групи кісток [[грані, [значення…]], …]: 1–4 групи, у кожній 1–20 кісток, грані 2–100, значення 1…грані. Інше — null. */
export function diceGroups(g) {
  if (!Array.isArray(g) || !g.length || g.length > DICE.groups) return null
  const out = []
  for (const x of g) {
    if (!Array.isArray(x) || x.length !== 2) return null
    const s = int(x[0], DICE.nMin, DICE.nMax), v = x[1]
    if (s === null || !Array.isArray(v) || !v.length || v.length > DICE.count || !v.every(n => int(n, 1, s) !== null)) return null
    out.push([s, [...v]])
  }
  return out
}
const diceSum = (g, mod) => g.reduce((a, [, v]) => a + v.reduce((b, n) => b + n, 0), 0) + mod
/**
 * Кістки шкоди ворога з паку: «3d6», «1d10+2», «2d6kl1» (менша з 2d6) — той самий запис, що DICE_RE картки Foundry.
 * → {n, s, kl, mod} або null.
 */
export function parseDice(str0) {
  const m = /^(\d*)d(\d+)(kl1)?([+-]\d+)?$/i.exec(String(str0 || '').replace(/\s+/g, '').replace(/к/gi, 'd'))
  if (!m) return null
  const n = m[1] ? +m[1] : 1, s = +m[2], kl = !!m[3], mod = m[4] ? +m[4] : 0
  if (n < 1 || n > EDICE.count || s < EDICE.sMin || s > EDICE.sMax || Math.abs(mod) > EDICE.mod || (kl && n < 2)) return null
  return { n, s, kl, mod }
}
/** «3d6», «1d10 + 2», «менша з 2d6». */
export function edmgLabel({ n, s, kl, mod }) {
  return (kl ? `менша з ${n}d${s}` : `${n}d${s}`) + (mod ? signed(mod) : '')
}
/** Перевірена шкода ворога з повідомлення чи кидка: {g:[[s, [значення]]], kl, mod, type, total} або null. */
export function enemyDice(d) {
  if (!d || typeof d !== 'object') return null
  const g = Array.isArray(d.g) && d.g.length === 1 ? d.g[0] : null
  if (!Array.isArray(g) || g.length !== 2) return null
  const s = int(g[0], EDICE.sMin, EDICE.sMax), v = g[1], mod = int(d.mod, -EDICE.mod, EDICE.mod), kl = d.kl === true
  if (s === null || mod === null || !Array.isArray(v) || !v.length || v.length > EDICE.count || !v.every(x => int(x, 1, s) !== null) || (kl && v.length < 2)) return null
  if (typeof d.type !== 'string' || !Object.hasOwn(ETYPES, d.type)) return null
  return { g: [[s, [...v]]], kl, mod, type: d.type, total: (kl ? Math.min(...v) : v.reduce((a, x) => a + x, 0)) + mod }
}
/** Кинути шкоду ворога: dstr із паку, type — ключ ETYPES, rnd() — [0, 1). → дані для buildRoll('edmg') або null. */
export function rollEnemy(dstr, type, rnd = Math.random) {
  const p = parseDice(dstr)
  if (!p || !Object.hasOwn(ETYPES, type)) return null
  return { g: [[p.s, Array.from({ length: p.n }, () => 1 + Math.floor(rnd() * p.s))]], kl: p.kl, mod: p.mod, type }
}
const edmgOf = e => edmgLabel({ n: e.g[0][1].length, s: e.g[0][0], kl: e.kl, mod: e.mod })

/** Кинути: counts = [[грані, скільки], …] (нулі пропускаються), rnd() — [0, 1). → {g, mod} або null (нема кісток). */
export function rollDice(counts, mod, rnd = Math.random) {
  const g = (counts || []).filter(([s, n]) => n > 0).map(([s, n]) => [s, Array.from({ length: n }, () => 1 + Math.floor(rnd() * s))])
  return diceGroups(g) && int(mod, -DICE.mod, DICE.mod) !== null ? { g, mod } : null
}
/** «2d6 + 1d10 + 1» з груп чи лічильників ([[грані, скільки]] чи [[грані, [значення]]]). */
export function diceLabel(g, mod) {
  const parts = g.map(([s, v]) => (Array.isArray(v) ? v.length : v) + 'd' + s).filter(p => !p.startsWith('0'))
  return parts.join(' + ') + (mod ? signed(mod) : '')
}
/** Деталі: «2d6: 4, 5; 1d10: 7; модифікатор +1». */
/** Кидок ворога: тип шкоди й примітка атаки, рядок журналу під назвою (видно одразу, не в «Кістках»). */
export const edmgNote = e => e.kind === 'edmg' ? [ETYPES[e.type], e.note].filter(Boolean).join('; ') : ''
export const diceDetail = e => e.kind === 'edmg' ? [`${e.g[0][1].length}d${e.g[0][0]}: ${e.g[0][1].join(', ')}${e.kl ? ` (менша ${Math.min(...e.g[0][1])})` : ''}`, ...(e.mod ? [`модифікатор ${e.mod > 0 ? '+' : '−'}${Math.abs(e.mod)}`] : []), ].join('; ') : [...e.g.map(([s, v]) => `${v.length}d${s}: ${v.join(', ')}`), ...(e.mod ? [`модифікатор ${e.mod > 0 ? '+' : '−'}${Math.abs(e.mod)}`] : [])].join('; ')

/** Роль відправника в Owlbear за connectionId: 'GM' | 'PLAYER' | ''. */
export function roleOf(conn, players, mine) {
  if (mine && conn && conn === mine.connectionId) return mine.role || ''
  const p = (players || []).find(x => x && x.connectionId === conn)
  return p ? String(p.role || '') : ''
}
/** Хто кидав: ім'я гравця в Owlbear за connectionId (players — party.getPlayers() плюс я). Невідомий — ''. */
export function playerOf(conn, players, mine) {
  if (mine && conn === mine.connectionId) return mine.name || ''
  const p = (players || []).find(x => x && x.connectionId === conn)
  return p ? str(p.name, LIM.by) : ''
}

/**
 * Помітка повтору (автор, 2026-11-27): аркуш шле той самий кидок ще раз, коли до нього викликали аспект (чи підняли
 * вердикт перком), з тим самим часом кидка rt. Приймач ставить re сам: why 'aspect' | 'redo', total / verdict — що було
 * в попередньому записі цього браузера (якщо він є). У повідомленні re не довіряємо: його прибирає receiveRolls.
 */
function parseRe(r) {
  if (!r || typeof r !== 'object' || !['aspect', 'redo'].includes(r.why)) return null
  const re = { why: r.why }
  if (int(r.total, -99, 999) !== null) re.total = r.total
  if (int(r.verdict, 0, 3) !== null) re.verdict = r.verdict
  return re
}
/** Помітка повтору для запису e, якщо це той самий кидок, що й попередній запис (prev) або кидок з викликом аспекту. */
export function redoOf(e, prev) {
  if (e.kind !== 'check' || !(e.aspect || prev)) return null
  const re = { why: e.aspect && !(prev && prev.aspect) ? 'aspect' : 'redo' }
  if (prev) { re.total = prev.total; re.verdict = prev.verdict }
  return re
}
const RE_TEXT = { aspect: 'попередній кидок з викликом аспекту', redo: 'попередній кидок, результат оновлено' }
/** «Попередній кидок з викликом аспекту: було 11 (Частковий успіх)» для картки. */
export function redoText(re) {
  if (!re) return ''
  const t = RE_TEXT[re.why]
  const was = re.total !== undefined ? `: було ${re.total}${re.verdict !== undefined ? ` (${VERDICTS[re.verdict]})` : ''}` : ''
  return t[0].toUpperCase() + t.slice(1) + was
}

const signed = n => n < 0 ? ' − ' + -n : ' + ' + n
const fateMode = e => e.mode === 'char' ? 'УДЧ' : 'Удача партії'

/** Що за кидок, для картки: рядок без підсумку. */
export function rollWhat(e) {
  if (e.kind === 'check') {
    if (e.type && e.type !== 'gen' && e.typeName) return [e.typeName, e.label].filter(Boolean).join(', ')
    return e.label ? 'Перевірка ' + e.label : 'Перевірка'
  }
  if (e.kind === 'fate') return `Кістка Долі: ${e.die}${e.mod ? signed(e.mod) : ''} (${fateMode(e)})`
  if (e.kind === 'dice') return 'Кістки: ' + diceLabel(e.g, e.mod)
  if (e.kind === 'gen') return e.title
  if (e.kind === 'edmg') return `Шкода: ${[e.name, edmgOf(e)].filter(Boolean).join(', ')}`
  return `${e.rerolled ? 'Шкода перекинута' : 'Шкода'}: ${[e.name, e.dstr].filter(Boolean).join(', ')}`
}
export const verdictName = e => e.kind === 'check' ? VERDICTS[e.verdict] : ''

/** Простий текст сповіщення, як рядок журналу трекера (cg.js): «Волті (Оксана): атака, СПР + Стрільба: 9 — Успіх». */
export function rollText(e, by) {
  if (e.kind === 'gen') return `${by || e.who || 'Доглядач'}: ${e.title}`
  if (e.kind === 'dice') return `${by || e.who || 'Без імені'}: кістки ${diceLabel(e.g, e.mod)} = ${e.total}`
  if (e.kind === 'edmg') return `${e.who || 'Ворог'}: шкода (${[e.name, edmgOf(e)].filter(Boolean).join(', ')}): ${e.total}`
  const who = (e.who || 'Без імені') + (by ? ` (${by})` : '')
  if (e.kind === 'check') {
    const t = e.type && e.type !== 'gen' && e.typeName ? e.typeName.toLowerCase() + ', ' : 'перевірка '
    if (e.re) return `${who}: ${RE_TEXT[e.re.why]}: ${t}${e.label}: ${e.re.total !== undefined ? e.re.total + ' → ' : ''}${e.total} — ${VERDICTS[e.verdict]}`
    return `${who}: ${t}${e.label}: ${e.total} — ${VERDICTS[e.verdict]}${e.aspect ? ' (з викликом аспекту)' : ''}`
  }
  if (e.kind === 'fate') return `${who}: кістка Долі ${e.die}${e.mod ? signed(e.mod) : ''} (${fateMode(e)}) = ${e.total}`
  return `${who}: ${e.rerolled ? 'шкода перекинута' : 'шкода'} (${[e.name, e.dstr].filter(Boolean).join(', ')}): ${e.total}`
}

/** Колір сповіщення Owlbear за вердиктом (автор, 2026-11-27): кістка Долі й шкода — звичайне. */
export function rollVariant(e) {
  if (e.kind !== 'check') return 'DEFAULT'
  return e.verdict === 0 ? 'ERROR' : e.verdict === 1 ? 'WARNING' : 'SUCCESS'
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' }
const unent = s => s.replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_, k) => ENT[k])

/**
 * Деталі кісток (gx — HTML аркуша) як дерево вузлів за білим списком:
 * {t:'text', v} | {t:'br'} | {t:'b', kids} | {t:'off', kids} (<span class="gx-off">, викинута кістка).
 * Будь-який інший тег, атрибут чи незакритий шматок лишається текстом; вкладеність до 3 рівнів.
 */
export function detailNodes(gx) {
  const root = { kids: [] }, stack = [root]
  const top = () => stack[stack.length - 1]
  const text = v => { if (!v) return; const k = top().kids, last = k[k.length - 1]; if (last && last.t === 'text') last.v += v; else k.push({ t: 'text', v }) }
  const re = /<(\/?)(b|br|span)(\s+class="gx-off")?\s*\/?>/gi
  let i = 0, m
  const s = typeof gx === 'string' ? gx.slice(0, LIM.gx) : ''
  while ((m = re.exec(s))) {
    text(unent(s.slice(i, m.index))); i = re.lastIndex
    const [raw, close, tag0, cls] = m, tag = tag0.toLowerCase()
    if (tag === 'br') { if (!close && !cls) top().kids.push({ t: 'br' }); else text(raw); continue }
    const t = tag === 'b' ? 'b' : 'off'
    if (close) { if (stack.length > 1 && top().t === t && !cls) stack.pop(); else text(raw); continue }
    if ((tag === 'b' && cls) || (tag === 'span' && !cls) || stack.length > 3) { text(raw); continue }
    const n = { t, kids: [] }; top().kids.push(n); stack.push(n)
  }
  text(unent(s.slice(i)))
  return root.kids
}

// ---- журнал у браузері (у кожного свій, автор 2026-11-27) ----
export function logGet(storage) {
  try {
    const a = JSON.parse(storage.getItem(LOG_KEY) || '[]')
    return Array.isArray(a) ? a.filter(x => x && typeof x === 'object') : []
  } catch { return [] }
}
/** Додати запис (новіші перші); повтор id не додається. → true, якщо додано. */
export function logAdd(storage, e) {
  const list = logGet(storage)
  if (list.some(x => x.id === e.id)) return false
  list.unshift(e)
  try { storage.setItem(LOG_KEY, JSON.stringify(list.slice(0, LOG_MAX))) } catch { return false }
  return true
}
export function logClear(storage) { try { storage.removeItem(LOG_KEY) } catch { /* ок */ } }

// ---- розсилка й приймач (OBR передається: у тестах — фейк) ----
/** Розіслати кидок аркуша всім за столом (і собі — у журнал). → Promise; null — не кидок. */
export function sendRoll(OBR, kind, d, { who, id }) {
  const m = buildRoll(kind, d, { who, id })
  return m ? OBR.broadcast.sendMessage(CH, m, { destination: 'ALL' }) : null
}

/**
 * Кидок з вкладки «Кістки»: counts = [[грані, скільки]], mod — модифікатор. Звичайний — усім (і собі) через broadcast,
 * журнал і автожурнал робить тло. Таємний (лише Доглядач, автор 2026-11-27) нікуди не надсилається, навіть прихованим:
 * запис лише в журнал цього браузера (storage) з secret, далі after() — автожурнал. → повідомлення кидка або null.
 */
export async function rollAndSend(OBR, { counts, mod, secret = false, rnd, id, storage, now = () => Date.now(), after = () => {} }) {
  const r = rollDice(counts, mod, rnd)
  const m = r && buildRoll('dice', r, { who: '', id })
  if (!m) return null
  if (!secret) { await OBR.broadcast.sendMessage(CH, m, { destination: 'ALL' }); return m }
  const e = parseRoll(m)
  if (e) logAdd(storage, { ...e, by: (await OBR.player.getName()) || '', me: true, secret: true, t: now() })
  await after(e)
  return m
}

/** Сповіщення Owlbear; червоне (ERROR) Owlbear сам не ховає — закриваємо через ERR_MS, колір лишається. */
export function showNote(OBR, text, variant, later = (f, ms) => setTimeout(f, ms)) {
  Promise.resolve(OBR.notification.show(text, variant)).then(id => {
    if (variant === 'ERROR' && id) later(() => Promise.resolve(OBR.notification.close(id)).catch(() => {}), ERR_MS)
  }).catch(() => {})
}

/**
 * Приймач тла розширення: кожен кидок → перевірка → журнал цього браузера → сповіщення Owlbear (не тому, хто кидав).
 * unknown — підпис невідомого гравця. → Promise<функція відписки>.
 */
export async function receiveRolls(OBR, storage, { unknown, now = () => Date.now(), notify = (e, me) => !me, after = () => {}, later = (f, ms) => setTimeout(f, ms) }) {
  let players = [], mine = { connectionId: '', name: '', role: '' }
  const who = async () => {
    try {
      const [p, connectionId, name] = await Promise.all([OBR.party.getPlayers(), OBR.player.getConnectionId(), OBR.player.getName()])
      players = p || []; mine = { connectionId, name, role: mine.role }
      mine.role = await OBR.player.getRole()
    } catch (e) { console.error(e) }
  }
  await who()
  const off = []
  // повтори id рахує кожна вкладка сама: localStorage спільний для всіх вкладок браузера, і запис, який уже поклала інша
  // вкладка тієї самої людини, не має забирати в цієї автожурнал і сповіщення (живий захід 2026-11-27)
  const seen = new Set()
  try { off.push(OBR.party.onChange(p => { players = p || [] })) } catch { /* необов'язково */ }
  off.push(OBR.broadcast.onMessage(CH, async ev => {
    const e = parseRoll(ev && ev.data)
    if (!e || seen.has(e.id)) return
    seen.add(e.id)
    delete e.re   // помітку повтору ставить приймач, не відправник
    const conn = String((ev && ev.connectionId) || '')
    let by = playerOf(conn, players, mine)
    if (!by && conn !== mine.connectionId) { await who(); by = playerOf(conn, players, mine) }   // щойно зайшов
    const me = !!conn && conn === mine.connectionId
    if ((e.kind === 'edmg' || e.kind === 'gen') && roleOf(conn, players, mine) !== 'GM') return   // шкоду ворога й генератори шле лише Доглядач
    if (e.kind === 'check' && (e.rt || e.aspect)) {
      const prev = e.rt ? logGet(storage).find(x => x.id !== e.id && x.kind === 'check' && x.rt === e.rt && x.who === e.who && x.by === (by || unknown)) : null
      const re = redoOf(e, prev)
      if (re) e.re = re
    }
    logAdd(storage, { ...e, by: by || unknown, me, t: now() })   // інша вкладка могла вже покласти той самий запис
    // сповіщення (автор, 2026-11-27): не тому, хто кидав, і лише тому, хто закрив журнал вручну (рішення — notify)
    if (notify(e, me)) showNote(OBR, rollText(e, by || unknown), rollVariant(e), later)
    try { await after(e, me) } catch (err) { console.error(err) }   // автожурнал
  }))
  return () => off.forEach(f => { try { typeof f === 'function' && f() } catch { /* ок */ } })
}
