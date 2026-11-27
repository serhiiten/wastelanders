// Пустельники в Owlbear Rodeo: смужки над токенами — ОЗ ворога (етап 4, рядок 4.11; автор 2026-11-27, С1), ОЗ героя з аркушем (A),
// ОЗ і запас ходу каравану (B, К1); «Зробити ворогом…» на кількох токенах (рядок 4.6) і «Зробити караваном» (B).
// Без DOM; OBR передається (у тестах — фейк).
// Смужка — локальні предмети OBR.scene.local тла кожного клієнта (нічого не пишеться в сцену): вердикт радника, блокер 6:
//   повне звіряння набору (додати / прибрати — одним викликом кожне) на кожну зміну предметів і на готовність сцени;
//   гравцеві прихований токен (visible:false) смужки не має; підпис стану (sig) — щоб рух токена нічого не перемальовував
//   (смужка прикріплена до токена й їде за ним сама); тло гравця читає лише ОЗ у межах (hpOf, heroHpOf, carOf).
import { NS, K } from './store.mjs'
import { K_ENEMY, K_CARTOK, hpOf, heroHpOf, carOf, barOf, canMakeEnemy, canMakeCaravan, isCaravanToken, labelEmpty, labelStep, setLabel } from './enemy-bar.mjs'
import { isRateLimit } from './writer.mjs'
import { unpackCaravan } from './caravan-data.mjs'

export const K_BAR = NS + '/bar'
export const TONE = { ok: '#3d9a5c', warn: '#d9a032', err: '#d0453a' }
export const MOVE = '#3f86c4'   // запас ходу каравану: завжди синій (автор, 2026-11-27, К1)
export const BAR_BG = '#1e1b17'
// рядок 0 — ті самі id, що в смужки ворога до цього пакета; нижчі рядки — з номером
const barIds = (id, row = 0) => [`${NS}/bar-bg${row || ''}/${id}`, `${NS}/bar-fill${row || ''}/${id}`]

const hpRow = hp => { const { frac, tone } = barOf(hp); return { frac, color: TONE[tone], name: 'ОЗ' } }
const moveRow = mv => ({ frac: mv.max > 0 ? Math.max(0, Math.min(1, mv.value / mv.max)) : 0, color: MOVE, name: 'Запас ходу' })

/**
 * Рядки смужок токена згори вниз: герой з аркушем (A) і ворог — ОЗ; караван (B, К1) — ОЗ, під ними запас ходу.
 * car — {hp, move} каравану кімнати або null (тоді над караван-токеном нічого). → [{frac, color, name}] або null.
 */
export function barRows(meta, car = null) {
  const hero = heroHpOf(meta)
  if (hero) return [hpRow(hero)]
  const foe = hpOf(meta)
  if (foe) return [hpRow(foe)]
  if (car && isCaravanToken(meta)) return [hpRow(car.hp), moveRow(car.move)]
  return null
}

/** Яким має бути набір смужок: Map(tokenId → {rows, sig}). gm — Доглядач бачить і приховані токени. */
export function wantedBars(items, { gm = false, car = null } = {}) {
  const out = new Map()
  for (const it of items || []) {
    if (!it || it.layer === undefined || (!gm && it.visible === false)) continue
    const rows = barRows(it.metadata, car)
    if (!rows) continue
    const sc = it.scale || { x: 1, y: 1 }, im = it.image || {}, g = it.grid || {}
    // без позиції: рух токена не перемальовує; розмір і масштаб — так
    const vals = rows.map(r => r.frac.toFixed(4) + r.color).join(',')
    out.set(it.id, { rows, sig: [vals, sc.x, sc.y, im.width, im.height, g.dpi, it.rotation || 0].join('|') })
  }
  return out
}

/** Смужки над межами токена b = {min:{x,y}, width}: на кожен рядок тло й заповнення; нижній рядок — найближчий до токена. */
export function barShapes(id, rows, b, sig) {
  const w = Math.max(8, b.width), h = Math.max(4, Math.round(w * 0.07)), x = b.min.x
  const gap = Math.max(2, Math.round(h * 0.4)), bottom = b.min.y - h - Math.max(3, Math.round(h * 0.6))
  const base = { type: 'SHAPE', layer: 'ATTACHMENT', attachedTo: id, locked: true, disableHit: true, visible: true, rotation: 0, scale: { x: 1, y: 1 },
    zIndex: 0, disableAttachmentBehavior: ['ROTATION', 'SCALE', 'LOCKED', 'COPY'], metadata: { [K_BAR]: { of: id, sig } } }
  const style = (fill, op) => ({ fillColor: fill, fillOpacity: op, strokeColor: fill, strokeOpacity: 0, strokeWidth: 0, strokeDash: [] })
  const shapes = []
  rows.forEach((r, i) => {
    const y = bottom - (rows.length - 1 - i) * (h + gap), [bgId, fillId] = barIds(id, i)
    shapes.push({ ...base, id: bgId, name: r.name, position: { x, y }, width: w, height: h, shapeType: 'RECTANGLE', style: style(BAR_BG, 0.85) })
    if (r.frac > 0) shapes.push({ ...base, id: fillId, name: r.name, zIndex: 1, position: { x, y }, width: w * r.frac, height: h, shapeType: 'RECTANGLE', style: style(r.color, 1) })
  })
  return shapes
}

/**
 * Звіряння: local — OBR.scene.local; bounds(id) → межі токена; gm; car — караван кімнати ({hp, move} або null).
 * make(shape) — предмет Owlbear з опису (у тлі — buildShape SDK, щоб були всі поля); Додає нові й змінені, прибирає зайві
 * (змінені — прибрати й додати наново). → {added, removed} (кількість предметів).
 */
export async function reconcileBars(local, items, { gm = false, car = null, bounds, make = x => x }) {
  const want = wantedBars(items, { gm, car })
  const have = (await local.getItems(it => !!(it.metadata && it.metadata[K_BAR]))) || []
  const haveSig = new Map()
  for (const it of have) { const m = it.metadata[K_BAR]; if (m && typeof m.of === 'string' && it.id === barIds(m.of)[0]) haveSig.set(m.of, m.sig) }
  const drop = new Set(), add = []
  for (const it of have) { const m = it.metadata[K_BAR]; const w = m && want.get(m.of); if (!w || w.sig !== haveSig.get(m.of)) drop.add(it.id) }
  for (const [id, w] of want) {
    if (haveSig.get(id) === w.sig && !drop.has(barIds(id)[0])) continue
    let b = null
    try { b = await bounds(id) } catch { /* токена вже немає */ }
    if (b && b.width > 0) add.push(...barShapes(id, w.rows, b, w.sig).map(make))
  }
  if (drop.size) await local.deleteItems([...drop])
  if (add.length) await local.addItems(add)
  return { added: add.length, removed: drop.size }
}

/**
 * Підписи караван-токенів (пункт 5 пакета за заходом; автор, 2026-11-27: «як у ворога»): назва каравану кімнати під
 * кожним караван-токеном, коли підпис порожній або дорівнює назві, яку ми написали востаннє (K_CARTOK.n: Доглядач міг
 * бути не в кімнаті, коли караван перейменували). Підпис, який Доглядач змінив сам, не чіпаємо. → id, що треба оновити.
 */
export function caravanLabelIds(items, name) {
  if (typeof name !== 'string' || !name.trim()) return []
  return (items || []).filter(it => {
    if (!it || !isCaravanToken(it.metadata)) return false
    const s = labelStep(it, it.metadata[K_CARTOK].n, '', name)
    return s.label !== null || s.marker !== null
  }).map(it => it.id)
}
/** Записати назву каравану в підписи (лише тло Доглядача: стан каравану в кімнаті, токени — його). */
export async function writeCaravanLabels(OBR, items, name) {
  const ids = caravanLabelIds(items, name)
  if (!ids.length) return 0
  let n = 0
  await OBR.scene.items.updateItems(ids, ds => {
    for (const d of ds) {
      if (!isCaravanToken(d.metadata)) continue
      const s = labelStep(d, d.metadata[K_CARTOK].n, '', name)
      if (s.label !== null) setLabel(d, s.label)
      if (s.marker !== null) d.metadata[K_CARTOK] = { ...d.metadata[K_CARTOK], n: s.marker }
      if (s.label !== null || s.marker !== null) n++
    }
  })
  return n
}

/**
 * Тло: смужки на onChange предметів, на готовність сцени й на зміну каравану кімнати (room metadata, розпакування).
 * У Доглядача ще й підписи караван-токенів (writeCaravanLabels).
 * Звіряння по черзі (нове чекає попереднього, проміжні зливаються). → функція відписки.
 */
export function startBars(OBR, { gm = false, make, onError = e => console.error(e) } = {}) {
  let busy = false, again = false, ready = false, car = null, carKey = null, carSeq = 0, carName = '', retryT = null
  const bounds = id => OBR.scene.items.getItemBounds([id])
  async function run(items) {
    if (busy) { again = true; return }
    busy = true
    try {
      let list = items
      do {
        again = false
        if (!ready) break
        const all = list || await OBR.scene.items.getItems()
        await reconcileBars(OBR.scene.local, all, { gm, car, bounds, make })
        // «Too many requests» (назву набирають по літері) — ще раз за секунду, а не аж до наступної зміни (ревізор, 2026-11-27)
        if (gm && carName) await writeCaravanLabels(OBR, all, carName).catch(e => { if (!isRateLimit(e)) throw e; retryT = setTimeout(() => { retryT = null; run(null) }, 1000) })
        list = null
      } while (again)
    } catch (e) { onError(e) } finally { busy = false }
  }
  // караван кімнати: лише коли змінився саме його запис; пізніше розпакування не перезаписує новішого
  async function onRoom(meta) {
    const m = meta ? meta[K.caravan] : undefined, key = m === undefined ? '' : JSON.stringify(m)
    if (key === carKey) return
    carKey = key
    const seq = ++carSeq
    let d = null
    try { d = m === undefined ? null : await unpackCaravan(m) } catch { d = null }
    if (seq !== carSeq) return
    car = d && d.st ? carOf(d.st) : null
    carName = d && d.st && typeof d.st.companyName === 'string' ? d.st.companyName : ''
    run(null)
  }
  const offs = [
    OBR.scene.items.onChange(items => run(items)),
    OBR.scene.onReadyChange(r => { ready = !!r; if (ready) run(null) }),
    OBR.room.onMetadataChange(onRoom),
  ]
  Promise.resolve(OBR.scene.isReady()).then(r => { ready = !!r; if (ready) run(null) }).catch(onError)
  Promise.resolve(OBR.room.getMetadata()).then(onRoom).catch(onError)
  return () => { if (retryT) clearTimeout(retryT); retryT = null; offs.forEach(f => { try { f() } catch { /* ок */ } }) }
}

/**
 * «Зробити ворогом…» на вибраних токенах одним updateItems. rec — запис ворога (enemyFromBook / enemyOwn) без r / w.
 * Персонажі (аркуш чи власник) і караван — відмова, не заміна. Порожній підпис отримує назву ворога (автор, 2026-11-27).
 * → {made: [id], refused: [{id, label}]}.
 */
export async function makeEnemies(OBR, ids, rec, { w = 'mk' } = {}) {
  const items = await OBR.scene.items.getItems(ids)
  const ok = items.filter(it => canMakeEnemy(it.metadata)), refused = items.filter(it => !canMakeEnemy(it.metadata))
  if (ok.length) {
    await OBR.scene.items.updateItems(ok.map(it => it.id), drafts => {
      for (const d of drafts) {
        if (!canMakeEnemy(d.metadata)) continue
        const old = d.metadata[K_ENEMY], r = (old && Number.isSafeInteger(old.r) ? old.r : 0) + 1
        d.metadata[K_ENEMY] = { ...structuredClone(rec), r, w }
        if (labelEmpty(d) && d.text) { d.text.plainText = rec.name; if (d.text.type === undefined) d.text.type = 'PLAIN' }
      }
    })
  }
  return { made: ok.map(it => it.id), refused: refused.map(it => ({ id: it.id, label: (it.text && it.text.plainText) || it.name || '' })) }
}

/** «Зняти ворога»: прибрати запис з токена (смужка зникне на звірянні). */
export const removeEnemy = (OBR, id) => OBR.scene.items.updateItems([id], ds => { for (const d of ds) delete d.metadata[K_ENEMY] })

/**
 * «Зробити караваном» (автор, 2026-11-27, B: лише Доглядач, скільки завгодно токенів): позначка {v:1} одним updateItems.
 * Персонаж і ворог — відмова, не заміна. → {made: [id], refused: [{id, label}]}.
 */
export async function makeCaravan(OBR, ids) {
  const items = await OBR.scene.items.getItems(ids)
  const ok = items.filter(it => canMakeCaravan(it.metadata)), refused = items.filter(it => !canMakeCaravan(it.metadata))
  const todo = ok.filter(it => !isCaravanToken(it.metadata))
  if (todo.length) {
    await OBR.scene.items.updateItems(todo.map(it => it.id), drafts => {
      for (const d of drafts) if (canMakeCaravan(d.metadata)) d.metadata[K_CARTOK] = { v: 1 }
    })
  }
  return { made: ok.map(it => it.id), refused: refused.map(it => ({ id: it.id, label: (it.text && it.text.plainText) || it.name || '' })) }
}

/** «Зняти караван»: прибрати позначку (смужки зникнуть на звірянні). */
export const removeCaravan = (OBR, ids) => OBR.scene.items.updateItems(ids, ds => { for (const d of ds) delete d.metadata[K_CARTOK] })
