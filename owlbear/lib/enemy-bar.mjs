// Пустельники в Owlbear Rodeo: ворог на токені, легка частина без модулів Foundry (тло кожного клієнта, меню).
// Етап 4, рішення автора 2026-11-27 (docs/decisions/owlbear.md, «Stage 4: …»); вердикт радника: docs/plans/2026-11-27-owlbear-stage4-design.md.
//   Ключ токена K_ENEMY = {v:1, r, w, src, name, e, o?}; e — system ворога у формі Foundry. Пише лише Доглядач.
//   Аркуш і ворог виключають одне одного (блокер 4): токен з …/sheet або …/owner — персонаж, ворога на ньому немає.
import { NS, K, unpackSheet } from './store.mjs'

export const K_ENEMY = NS + '/enemy'
export const HP_MAX = 999   // як форма «Новий супротивник» Foundry (enemy-create.mjs)

const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x)
/** Токен персонажа: аркуш або призначений гравець. */
export const isCharacter = meta => isObj(meta) && (meta[K.sheet] !== undefined || meta[K.owner] !== undefined)
/** Чи є на токені запис ворога, що може діяти (не персонаж). Вміст не перевіряє: це робить unpackEnemy. */
export const hasEnemy = meta => isObj(meta) && !isCharacter(meta) && isObj(meta[K_ENEMY])
/** Токен каравану (автор, 2026-11-27, B): позначка {v:1}; персонаж і ворог важать більше, ніж ця позначка. */
export const K_CARTOK = NS + '/car-token'
export const isCaravanToken = meta => isObj(meta) && !isCharacter(meta) && !isObj(meta[K_ENEMY]) && isObj(meta[K_CARTOK])
/** Чи можна зробити токен ворогом: не персонаж і не караван (відмова, не заміна — заміна стерла б персонажа). */
export const canMakeEnemy = meta => !isCharacter(meta) && !(isObj(meta) && isObj(meta[K_CARTOK]))
/** Чи можна зробити токен караваном: не персонаж і не ворог. */
export const canMakeCaravan = meta => !isCharacter(meta) && !(isObj(meta) && isObj(meta[K_ENEMY]))

/** Шари, де токен може бути ворогом: CHARACTER і MOUNT (автор, 2026-11-27: токен на MOUNT — як звичайний). */
export const ENEMY_LAYERS = ['CHARACTER', 'MOUNT']
export const onEnemyLayer = it => !!it && ENEMY_LAYERS.includes(it.layer)
/** Фільтр контекстного меню Owlbear: шар CHARACTER або MOUNT (лише умови шару, тож порядок || не важить). */
export const LAYER_FILTER = [{ key: 'layer', value: 'CHARACTER', coordinator: '||' }, { key: 'layer', value: 'MOUNT' }]

/** Підпис токена, який бачать гравці (text.plainText зображення Owlbear); порожній — назва предмета. */
export function labelOf(it) {
  const t = it && it.text && typeof it.text.plainText === 'string' ? it.text.plainText.trim() : ''
  return (t || (it && typeof it.name === 'string' ? it.name.trim() : '')).slice(0, 80)
}
/** Чи порожній підпис токена (тоді «Зробити ворогом» пише туди назву ворога, автор 2026-11-27). */
export const labelEmpty = it => !(it && it.text && typeof it.text.plainText === 'string' && it.text.plainText.trim())

/**
 * Підпис під токеном за ім'ям персонажа чи назвою каравану (автор, 2026-11-27: «як у ворога»). Пишемо, коли підпис
 * порожній або дорівнює старому імені; підпис, який Доглядач змінив сам, не чіпаємо. it — предмет (чи чернетка
 * updateItems), oldName — ім'я, яке було, newName — нове. → новий підпис або null (нічого не міняти).
 */
export const LABEL_MAX = 80
export function nameLabel(it, oldName, newName) {
  const cut = v => typeof v === 'string' ? v.trim().slice(0, LABEL_MAX) : ''
  const to = cut(newName)
  if (!to || !it || !isObj(it.text) || (it.text.type !== undefined && it.text.type !== 'PLAIN')) return null
  const cur = typeof it.text.plainText === 'string' ? it.text.plainText.trim() : ''
  if (cur === to) return null
  const from = cut(oldName)
  return !cur || (from && cur === from) ? to : null
}
/** Записати підпис у чернетку предмета. */
export function setLabel(d, text) { d.text.plainText = text; if (d.text.type === undefined) d.text.type = 'PLAIN' }
/**
 * Яке ім'я ми самі написали в підпис востаннє (marker) і що з ним робити тепер: → {label, marker} — новий підпис
 * (або null) і нова позначка (або null — не міняти). Підпис уже дорівнює імені, а позначки немає чи вона інша —
 * позначка стає ім'ям (старий запис без позначки потім теж іде за перейменуванням; ревізор, 2026-11-27).
 */
export function labelStep(it, marker, fallback, name) {
  // спершу позначка, потім старе ім'я з аркуша (гравець на старій версії розширення перейменував без позначки)
  const to = (typeof marker === 'string' && marker.trim() ? nameLabel(it, marker, name) : null) ?? nameLabel(it, fallback, name)
  if (to !== null) return { label: to, marker: to }
  const cur = it && isObj(it.text) && typeof it.text.plainText === 'string' ? it.text.plainText.trim() : ''
  const want = typeof name === 'string' ? name.trim().slice(0, LABEL_MAX) : ''
  return { label: null, marker: want && cur === want && marker !== want ? want : null }
}
/** Ім'я, яке ми востаннє написали в підпис героя: без нього ім'я, стерте на мить (аркуш пише кожні 200 мс), назавжди
 * відв'язувало б підпис (ревізор, 2026-11-27). */
export const K_LABEL = NS + '/label'
/**
 * Підпис героя (пункт 5 пакета за заходом, 2026-11-27): кличе черга записів (writer.mjs, decorate) на чернетці токена,
 * коли аркуш пише свій запис. old — значення ключів до запису. Старе ім'я — K_LABEL, а без нього — ім'я з попереднього
 * запису аркуша на токені. Пише той, хто пише аркуш: гравець — на свій токен, Доглядач — на будь-який.
 */
export function heroLabel(d, patch, old) {
  if (!patch || !(K.sheet in patch) || !d || !isObj(d.metadata)) return
  const a = unpackSheet(old && old[K.sheet]), b = unpackSheet(patch[K.sheet])
  const step = labelStep(d, d.metadata[K_LABEL], a && a.st.name, b && b.st.name)
  if (step.label !== null) setLabel(d, step.label)
  if (step.marker !== null) d.metadata[K_LABEL] = step.marker
}

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi ? v : null
/** ОЗ для смужки (тло гравця читає лише їх, блокер 6): {value, max} у межах, або null. */
export function hpOf(meta) {
  if (!hasEnemy(meta)) return null
  const raw = meta[K_ENEMY]
  if (raw.v !== 1 || !isObj(raw.e) || !isObj(raw.e.hp)) return null
  const max = int(raw.e.hp.max, 1, HP_MAX), value = int(raw.e.hp.value, 0, HP_MAX)
  if (max === null || value === null) return null
  return { value: Math.min(value, max), max }
}

/**
 * ОЗ героя для смужки (автор, 2026-11-27, A): аркуш сам пише на токен {value, max}, порахувавши їх своїм рушієм
 * (атрибути, перки, хімія), бо тло цього не вміє; тут лише читання в межах. Без запису (старий токен) — null.
 */
export function heroHpOf(meta) {
  if (!isCharacter(meta)) return null
  const s = meta[K.sheet]
  if (!isObj(s) || s.v !== 1 || !isObj(s.hp)) return null
  const max = int(s.hp.max, 1, HP_MAX), value = int(s.hp.value, 0, HP_MAX)
  if (max === null || value === null) return null
  return { value: Math.min(value, max), max }
}

/**
 * ОЗ і запас ходу каравану зі стану аркуша каравану (автор, 2026-11-27, B). Максимуми — та сама формула, що derived
 * аркуша (caravan-logic.mjs DEV; тест звіряє): ОЗ 25 чи 35 (тачка) + 10 × «Посилена конструкція» + надбавка; запас ходу
 * 10 + 5 × «Додаткове місце для корму». Стан у кімнаті пише будь-хто, тож усе в межах. → {hp, move} або null.
 */
export function carOf(st) {
  if (!isObj(st) || !isObj(st.imp)) return null
  const num = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d }
  const lim = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
  const maxHP = lim((st.tachka ? 35 : 25) + 10 * lim(num(st.imp.structure), 0, 3) + lim(num(st.hpBonus), -HP_MAX, HP_MAX), 1, HP_MAX)
  const maxMove = 10 + 5 * lim(num(st.imp.feed), 0, 2)
  return {
    hp: { value: lim(num(st.hpCurrent, maxHP), 0, maxHP), max: maxHP },
    move: { value: lim(num(st.moveCurrent, maxMove), 0, maxMove), max: maxMove },
  }
}

/**
 * Смужка ОЗ (автор, 2026-11-27, С1): частка й тон. Понад половину — зелений, до половини — бурштиновий,
 * чверть і менше — червоний; 0 ОЗ — порожня. → {frac, tone: 'ok' | 'warn' | 'err'}.
 */
export function barOf({ value, max }) {
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  return { frac, tone: frac > 0.5 ? 'ok' : frac > 0.25 ? 'warn' : 'err' }
}
