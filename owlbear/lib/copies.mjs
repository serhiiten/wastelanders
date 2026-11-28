// Пустельники в Owlbear Rodeo: копії токенів на сцені (автор, 2026-11-28; запит docs/plans/2026-11-28-owlbear-copies-request.md).
//   Вороги: копія (Ctrl+V, дублювання Owlbear) з підписом, який уже має інший токен цієї сцени, отримує перший вільний
//   номер: «Вертиберд», «Вертиберд 2», «Вертиберд 3»… Оригінал без номера, рахується лише поточна сцена.
//   Герой з аркушем і караван: копія на сцені, де цей персонаж / караван уже є, — лише попередження Доглядачу.
// Owlbear не дає заборонити вставку, тож тло Доглядача реагує після неї на нові id у scene.items.onChange.
// Пише лише тло Доглядача (один записувач, як підписи каравану). Без DOM; OBR передається (у тестах — фейк).
import { K, unpackSheet } from './store.mjs'
import { K_CARTOK, hasEnemy, isCaravanToken, isCharacter, onEnemyLayer, setLabel, LABEL_MAX } from './enemy-bar.mjs'
import { isRateLimit } from './writer.mjs'

const plainOf = it => it && it.text && (it.text.type === undefined || it.text.type === 'PLAIN') && typeof it.text.plainText === 'string'
  ? it.text.plainText.trim() : null
/** «Вертиберд 3» → {base: 'Вертиберд', n: 3}; «Вертиберд» → {base, n: 1}. Номер 1 і 0 — частина назви, не номер. */
export function splitNumber(label) {
  const m = /^(.*\S)\s+(\d{1,4})$/.exec(label)
  return m && Number(m[2]) >= 2 ? { base: m[1], n: Number(m[2]) } : { base: label, n: 1 }
}
const withNumber = (base, n) => {
  const tail = ' ' + n
  return base.slice(0, LABEL_MAX - tail.length).trimEnd() + tail
}
/** Перший вільний підпис назви base серед taken: сама назва, далі «base 2», «base 3»… Додає його в taken. */
export function freeLabel(base, taken) {
  let to = base, n = 1
  while (taken.has(to)) to = withNumber(base, ++n)
  taken.add(to)
  return to
}
/** Підписи ворожих токенів сцени (PLAIN, не порожні), крім skip. */
export const enemyLabels = (items, skip = new Set()) =>
  new Set((items || []).filter(it => it && !skip.has(it.id) && onEnemyLayer(it) && hasEnemy(it.metadata) && plainOf(it)).map(plainOf))

/**
 * Номери для нових ворожих токенів. items — усі предмети сцени (у порядку Owlbear), fresh — Set id, що щойно з'явилися.
 * Новий ворог, чий підпис (PLAIN, не порожній) уже має інший ворог сцени (старий чи раніший новий), бере перший вільний
 * номер своєї назви; решта не чіпається (вставка «Вертиберд 2» без іншого «Вертиберд 2» лишається як є, повернений
 * Ctrl+Z токен теж). → [{id, from, to}].
 */
export function planNumbers(items, fresh) {
  const foes = (items || []).filter(it => it && onEnemyLayer(it) && hasEnemy(it.metadata) && plainOf(it))
  const taken = enemyLabels(foes, fresh)
  const out = []
  for (const it of foes) {
    if (!fresh.has(it.id)) continue
    const label = plainOf(it)
    if (!taken.has(label)) { taken.add(label); continue }
    out.push({ id: it.id, from: label, to: freeLabel(splitNumber(label).base, taken) })
  }
  return out
}

/** Записати номери: лише якщо підпис на чернетці ще той, з якого рахували (інакше хтось уже змінив). → скільки записано. */
export async function writeNumbers(OBR, plan) {
  if (!plan.length) return 0
  const by = new Map(plan.map(p => [p.id, p]))
  let n = 0
  await OBR.scene.items.updateItems(plan.map(p => p.id), ds => {
    for (const d of ds) {
      const p = by.get(d.id)
      if (p && hasEnemy(d.metadata) && plainOf(d) === p.from) { setLabel(d, p.to); n++ }
    }
  })
  return n
}

const cidOf = it => { const s = isCharacter(it && it.metadata) ? unpackSheet(it.metadata[K.sheet]) : null; return s ? s.cid : '' }
const heroName = it => { const s = unpackSheet(it.metadata[K.sheet]); return (s && typeof s.st.name === 'string' && s.st.name.trim()) || plainOf(it) || '' }

/**
 * Копії героїв і каравану на цій сцені. Новий токен з аркушем, чий персонаж (cid) уже має інший токен сцени, і новий
 * караван-токен, коли на сцені вже є інший караван-токен. → {heroes: [ім'я], caravan: bool}.
 */
export function findCopies(items, fresh) {
  const seen = new Set(), heroes = []
  let cars = 0, caravan = false
  for (const it of (items || []).filter(it => it && !fresh.has(it.id))) {
    const cid = cidOf(it)
    if (cid) seen.add(cid)
    if (isCaravanToken(it.metadata)) cars++
  }
  for (const it of (items || []).filter(it => it && fresh.has(it.id))) {
    const cid = cidOf(it)
    if (cid) {
      if (seen.has(cid)) { const nm = heroName(it); if (!heroes.includes(nm)) heroes.push(nm) }
      seen.add(cid)
    }
    if (isCaravanToken(it.metadata)) { if (cars > 0) caravan = true; cars++ }
  }
  return { heroes, caravan }
}

/**
 * Тло Доглядача: стежить за новими id предметів сцени. Відлік — getItems після готовності сцени (і після зміни сцени),
 * без дій: усе, що там є, не копія; списки onChange до відліку лише пропускаються (сцена ще вантажиться). Роль читається на кожну вставку (гравця можуть зробити Доглядачем).
 * warn(heroes, caravan) — показати попередження. → функція відписки.
 */
export function startCopies(OBR, { warn, getRole = () => OBR.player.getRole(), onError = e => console.error(e), timers = {} } = {}) {
  const setT = timers.setTimeout || ((f, ms) => setTimeout(f, ms))
  const clearT = timers.clearTimeout || (t => clearTimeout(t))
  let known = null, gen = 0, retryT = null, chain = Promise.resolve()
  const reset = () => { known = null; gen++ }
  async function seed() {
    const g = gen
    const items = await OBR.scene.items.getItems()
    if (g === gen && known === null) known = new Set(items.map(it => it.id))
  }
  async function onItems(items) {
    if (known === null) return
    const fresh = new Set(items.filter(it => !known.has(it.id)).map(it => it.id))
    known = new Set(items.map(it => it.id))
    if (!fresh.size || (await getRole()) !== 'GM') return
    const plan = planNumbers(items, fresh)
    const send = () => writeNumbers(OBR, plan).catch(e => {
      if (!isRateLimit(e)) throw e
      retryT = setT(() => { retryT = null; writeNumbers(OBR, plan).catch(onError) }, 1000)
    })
    if (plan.length) await send()
    const c = findCopies(items, fresh)
    if (c.heroes.length || c.caravan) await warn(c.heroes, c.caravan)
  }
  // по черзі: друга вставка не рахує номери, поки не записано першу
  const queue = items => { const g = gen; chain = chain.then(() => g === gen ? onItems(items) : null).catch(onError) }
  const offs = [
    OBR.scene.items.onChange(queue),
    OBR.scene.onReadyChange(r => { reset(); if (r) seed().catch(onError) }),
  ]
  Promise.resolve(OBR.scene.isReady()).then(r => { if (r) return seed() }).catch(onError)
  return () => { if (retryT) clearT(retryT); retryT = null; offs.forEach(f => { try { f() } catch { /* ок */ } }) }
}
