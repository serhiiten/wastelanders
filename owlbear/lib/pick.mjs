// Пустельники в Owlbear Rodeo: який токен відкриває «Мій аркуш» і як відкрити вікна розширення. Без DOM.
// Дизайн: docs/plans/2026-11-26-owlbear-stage1-design.md, «Поведінка», «Вхід (1.1)».
import { NS, K, access, unpackSheet } from './store.mjs'
import { hasEnemy, isCaravanToken } from './enemy-bar.mjs'

export const ID = {
  modal: NS + '/sheet',          // широке вікно аркуша (modal)
  narrow: NS + '/sheet-narrow',  // вузьке вікно аркуша (popover 460 px)
  narrowB: NS + '/sheet-narrow-b',  // друге місце вузького вікна: переставити до краю екрана
  assign: NS + '/assign',        // «Призначити гравцеві…»
  log: NS + '/log',              // «Журнал кидків» (етап 2)
  carModal: NS + '/caravan',     // аркуш каравану, широке вікно (етап 3)
  carNarrow: NS + '/caravan-narrow',
  carNarrowB: NS + '/caravan-narrow-b',
  ctxSheet: NS + '/ctx-sheet',
  ctxAssign: NS + '/ctx-assign',
  enemies: NS + '/enemies',      // «Вороги» (етап 4): лише вузьке вікно, два місця для кнопок «до краю»
  enemiesB: NS + '/enemies-b',
  ctxEnemy: NS + '/ctx-enemy',   // «Зробити ворогом…»
  ctxCard: NS + '/ctx-enemy-card',   // «Картка ворога»
  ctxCarMake: NS + '/ctx-car-make',  // «Зробити караваном» (автор, 2026-11-27, B)
  ctxCarSheet: NS + '/ctx-car-sheet',   // «Аркуш каравану» на караван-токені
  ctxCarOff: NS + '/ctx-car-off',    // «Зняти караван»
  gen: NS + '/generators',       // «Генератори» (етап 4б): лише вузьке вікно, за замовчуванням біля лівого краю
  genB: NS + '/generators-b',
  quick: NS + '/quickstart',     // «Швидкий старт» (сесія Б, автор 2026-11-27): вузьке вікно біля лівого краю, два місця
  quickB: NS + '/quickstart-b',
  help: NS + '/help',            // довідка «?» біля кнопок меню (сесія Б)
  counters: NS + '/counters',    // віконце лічильників над мапою (сесія Б), відкриває тло кожного клієнта
}
export const SIZE = { modal: { width: 900, height: 900 }, narrow: { width: 460, height: 760 }, assign: { width: 320, height: 420 }, log: { width: 460, height: 280 }, help: { width: 300, height: 340 } }

// ворожий токен (етап 4) і караван-токен (автор, 2026-11-27, B) — не персонаж: їх немає в «Мій аркуш» і в списку Доглядача
const isToken = it => it && it.layer === 'CHARACTER' && !hasEnemy(it.metadata) && !isCaravanToken(it.metadata)
const mine = me => it => { const a = access(it.metadata && it.metadata[K.owner], me); return a === 'own' || a === 'name' }

/** Рядок списку токенів: id, назва токена, ім'я персонажа з аркуша, кому призначено, чи є аркуш. */
export function tokenLabel(it) {
  const meta = unpackSheet(it.metadata && it.metadata[K.sheet])
  const owner = it.metadata && it.metadata[K.owner]
  return { id: it.id, name: it.name || '', who: (meta && meta.st && meta.st.name) || '', n: (owner && owner.n) || '', sheet: !!meta }
}
const byName = (a, b) => a.name.localeCompare(b.name, 'uk')

/**
 * «Мій аркуш»: items — предмети сцени, me = {id, name, role}, selection — id вибраних.
 * → {kind:'open', id} | {kind:'list', list:[tokenLabel]} | {kind:'none'} (гравцю нічого не призначено) | {kind:'gm-none'}
 */
export function pickToken(items, me, selection) {
  const tokens = (items || []).filter(isToken)
  const gm = me && me.role === 'GM'
  const sel = selection && selection.length === 1 ? tokens.find(t => t.id === selection[0]) : null
  if (sel && (gm || mine(me)(sel))) return { kind: 'open', id: sel.id }
  if (gm) {
    const list = tokens.filter(t => t.metadata && (t.metadata[K.sheet] || t.metadata[K.owner])).map(tokenLabel).sort(byName)
    return list.length ? { kind: 'list', list } : { kind: 'gm-none' }
  }
  const own = tokens.filter(mine(me))
  if (own.length === 1) return { kind: 'open', id: own[0].id }
  if (own.length) return { kind: 'list', list: own.map(tokenLabel).sort(byName) }
  return { kind: 'none' }
}

/**
 * Список «Токени з аркушами…» / «Твої токени…» наново з предметів сцени (меню оновлює його, коли токен видалено чи
 * змінено, автор 2026-11-27). На відміну від pickToken не відкриває аркуш сам і не дивиться на вибір.
 */
export function tokenList(items, me) {
  const tokens = (items || []).filter(isToken)
  const own = me && me.role === 'GM' ? tokens.filter(t => t.metadata && (t.metadata[K.sheet] || t.metadata[K.owner])) : tokens.filter(mine(me))
  return own.map(tokenLabel).sort(byName)
}

/** Тека сторінок розширення ('/' на хостингу, '/fake/' у dev-сервері з фейковим OBR). */
export const baseOf = pathname => pathname.replace(/[^/]*$/, '')
export const sheetUrl = (base, itemId, narrow = false, slot = '', roller = false) => `${base}sheet.html?item=${encodeURIComponent(itemId)}${narrow ? '&w=narrow' : ''}${narrow && slot === 'b' ? '&slot=b' : ''}${roller ? '&roller=1' : ''}`

/**
 * Відступи вузького вікна від країв екрана: поза ними — стандартний інтерфейс Owlbear (автор, 2026-11-26, `docs/ui-rules.md` §4).
 * Виміряно в живому заході 2026-11-27 (вікно браузера 2007×1083): панель «Players» згори ліворуч x 16–266, y 56–221;
 * колонка інструментів праворуч x 1943–1991 (48 px, 16 від краю), y 8–432; згори — кругла кнопка-стрілка; знизу — трей і кнопки.
 * Вікно вище за панелі (760 px), тож обійти їх можна лише збоку: ліва 280 (266 + 14), права 80 (64 + 16).
 * На найменшому екрані 1366×768 між відступами 1006 px — вікно 460 вміщається з обох боків.
 * Знизу — розгорнутий лоток ресурсів Owlbear (верх на vh − 116, див. LOG_BOTTOM): усі вузькі вікна закінчуються за 12 px
 * над ним (автор, 2026-11-27; було 80, і караван біля лівого краю на 1366×768 заходив під лоток на 36 px).
 */
export const SAFE = { top: 80, left: 280, right: 80, bottom: 128 }

/**
 * Рамка вузького вікна в межах екрана поза зонами SAFE: x, y — бажаний лівий верхній кут, vp = {width, height} в'юпорта
 * (0 — невідомо). Висота менша за 760, якщо екран низький (1366×768 → 560). → поля popover з height.
 */
export function narrowBox(x, y, vp, log = null, w = SIZE.narrow.width, ctr = ctrSlot()) {
  const height = vp.height > 0 ? Math.max(320, Math.min(SIZE.narrow.height, vp.height - SAFE.top - SAFE.bottom)) : SIZE.narrow.height
  const maxX = vp.width > 0 ? vp.width - SAFE.right - w : x
  const maxY = vp.height > 0 ? vp.height - SAFE.bottom - height : y
  const box = {
    anchorReference: 'POSITION',
    anchorPosition: { left: Math.round(Math.max(SAFE.left, Math.min(x, maxX))), top: Math.round(Math.max(SAFE.top, Math.min(y, maxY))) },
    anchorOrigin: { horizontal: 'LEFT', vertical: 'TOP' },
    transformOrigin: { horizontal: 'LEFT', vertical: 'TOP' },
    marginThreshold: 16,
    height,
  }
  const b = ctr ? belowCtr(box, w, ctr, vp) : box
  return log ? underLog(b, w, log) : b
}

// ---- віконце лічильників (сесія Б, автор 2026-11-27) ----
// Стале місце праворуч від панелі «Players» (x 16–266, верх 56; виміряно 2026-11-27 на 2007×1083), 330 px завширшки,
// висота — на заголовок і три рядки. Поки в кімнаті є хоч один лічильник, вузьке вікно, що перетинає це місце по x,
// починається на GAP нижче (автор, відповідь 1). Місце стале, а не живий край вікна: розгорнута форма Доглядача росте
// вниз і не зсуває інші вікна (вердикт радника; той самий принцип, що «місце журналу завжди вільне»).
export const CTR_BOX = { left: 280, top: 56, width: 330, height: 140 }
export const CTR_ON = 'pust-obr-ctr-on'   // sessionStorage: «у кімнаті є лічильники» (пише тло, background.mjs)
/** Місце лічильників, якщо вони є в цій вкладці, інакше null. */
export function ctrSlot(ss = session()) {
  try { return ss.getItem(CTR_ON) ? CTR_BOX : null } catch { return null }
}
export const ctrSet = (on, ss = session()) => { try { if (on) ss.setItem(CTR_ON, '1'); else ss.removeItem(CTR_ON) } catch { /* ок */ } }
/** Вікно box (ширина w) нижче за місце лічильників ctr, якщо перетинає його по x і починається вище за його низ + GAP. */
function belowCtr(box, w, ctr, vp) {
  const p = box.anchorPosition
  const bottom = ctr.top + ctr.height + GAP
  if (!p || !crosses(p, w, ctr) || p.top >= bottom) return box
  const height = vp.height > 0 ? Math.max(MIN_H, Math.min(box.height, vp.height - SAFE.bottom - bottom)) : box.height
  return { ...box, anchorPosition: { ...p, top: bottom }, height }
}

// ---- розклад трьох вікон, варіант Б «Під аркушем персонажа» (автор, 2026-11-27) ----
// Журнал кидків завжди в одному місці: внизу правої колонки (там, де вузьке вікно «до правого краю»), 460 px завширшки.
// Вузьке вікно, чия смуга по x перетинає місце журналу, завжди закінчується за GAP над ним (logSlot: «місце журналу
// завжди вільне», автор 2026-11-27), тож висоти не стрибають. refit лишився для вікон, відкритих без розміру екрана.
// Які вікна відкриті й де, знає лише ця вкладка: реєстр у sessionStorage (WINS), тло чистить його при завантаженні Owlbear.
export const GAP = 12
export const MIN_H = 320       // найнижче вузьке вікно (як у narrowBox)
export const WINS = 'pust-obr-wins'
export const LOG_SHUT = 'pust-obr-log-shut'   // останнім журнал закрили вручну (✕ чи Esc): лише для сповіщень (notifyFor)
// Журнал на 10 секунд (автор, 2026-11-27): після кидка журнал з'являється сам і сам зникає за AUTO_MS; новий кидок
// за цей час починає відлік заново. Відкритий вручну (меню) не зникає, поки його не закриють. LOG_UNTIL — коли
// зникнути; немає — журнал відкрито вручну. Закриває сама сторінка журналу (log.mjs, щосекунди logExpired).
export const LOG_UNTIL = 'pust-obr-log-until'
export const AUTO_MS = 10000
// Лоток ресурсів Owlbear (розгорнутий) — по центру знизу, верх на vh − 116 (живий захід 2026-11-27, 2246×1264:
// y 1148–1216, x 619–1627, 1008 px). На вужчих екранах він сягає правої колонки, тож низ журналу — на GAP над лотком.
export const LOG_BOTTOM = SAFE.bottom   // 116 + GAP; той самий низ, що в усіх вузьких вікон

/** Висота журналу: 280, а на низькому екрані стільки, щоб над ним лишилося вікно MIN_H (1366×768 → 228). */
export function logHeight(vh) {
  if (!(vh > 0)) return SIZE.log.height
  return Math.max(160, Math.min(SIZE.log.height, vh - SAFE.top - LOG_BOTTOM - MIN_H - GAP))
}
const crosses = (a, aw, b) => a.left < b.left + b.width && b.left < a.left + aw
/** Вікно box (ширина w) над журналом log {left, top, width, height} коротшає, щоб не налазити на нього. */
function underLog(box, w, log) {
  const p = box.anchorPosition
  if (!p || !crosses(p, w, log) || p.top >= log.top + log.height) return box
  const room = log.top - GAP - SAFE.top
  const height = Math.max(160, Math.min(box.height, room))
  const top = Math.max(SAFE.top, Math.min(p.top, log.top - GAP - height))
  return { ...box, anchorPosition: { ...p, top }, height }
}

let memo = null
/** sessionStorage вкладки або пам'ять сторінки, якщо браузер його не дає. */
export function session() {
  try { const s = globalThis.sessionStorage; s.getItem('x'); return s } catch {
    if (!memo) { const m = new Map(); memo = { memory: true, getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) } }
    return memo
  }
}
export function winsGet(ss) {
  try { const o = JSON.parse(ss.getItem(WINS) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {} } catch { return {} }
}
function winsPut(ss, o) { try { ss.setItem(WINS, JSON.stringify(o)) } catch { /* без реєстру розклад лише не підлаштовується */ } }
export function winSet(ss, id, rec) { const o = winsGet(ss); if (rec) o[id] = rec; else delete o[id]; winsPut(ss, o) }
export const winsClear = ss => { try { ss.removeItem(WINS); ss.removeItem(LOG_UNTIL) } catch { /* ок */ } }
/** Запис реєстру з полів popover: де стоїть вікно, яку висоту мало б без журналу (full), розмір екрана (vw, vh)
 * і бік, до якого вікно пристало (side: 'left' | 'right'; '' — стоїть біля токена): за ним вікно переставляється,
 * коли розмір вікна браузера змінився (followResize). */
const recOf = (box, w, full, vh, vw = 0, side = '') => box.anchorPosition ? { left: box.anchorPosition.left, top: box.anchorPosition.top, width: w, height: box.height, full, vh, vw, side, ctr: ctrSlot() ? 1 : 0 } : null
// Owlbear може закрити наші вікна сам (живий захід 2026-11-27: після зміни розміру вікна браузера), не кажучи нам, тож
// запис реєстру — ще не доказ: журнал щосекунди пише LOG_ALIVE, і відкритим вважається лише той, що озивався за ALIVE_MS
// (або щойно відкритий і ще вантажиться).
export const LOG_ALIVE = 'pust-obr-log-alive'
export const ALIVE_MS = 4000
export function logOpen(ss, now = Date.now()) {
  const r = winsGet(ss)[ID.log]
  if (!r) return false
  let alive = 0
  try { alive = +ss.getItem(LOG_ALIVE) || 0 } catch { /* ок */ }
  return now - Math.max(+r.at || 0, alive) < ALIVE_MS
}
/** Сторінка журналу: «я живий» (щосекунди) і «мене закрито» (pagehide). */
export const logAlive = (ss = session(), now = Date.now()) => { try { ss.setItem(LOG_ALIVE, String(now)) } catch { /* ок */ } }
export const logGone = (ss = session()) => { try { ss.removeItem(LOG_ALIVE) } catch { /* ок */ } }
export const logShut = ss => { try { return !!ss.getItem(LOG_SHUT) } catch { return false } }
/** Чи показувати сповіщення кидка (автор, 2026-11-27): не тому, хто кидав; журнал закритий, і востаннє його закрили
 * вручну (✕ / Esc; не 10-секундний відлік); позначку знімає ручне відкриття з меню. Журнал при цьому з'являється теж. */
export const notifyFor = ss => (e, me) => !me && !logOpen(ss) && logShut(ss)

/**
 * Де стати вузькому вікну: поруч із токеном на екрані. bounds — межі токена у світі (getItemBounds),
 * vp = {x, y, scale, width, height}: екран = світ × scale + позиція в'юпорта. Токен у правій половині екрана — вікно ліворуч від нього.
 */
export function anchorFor(bounds, vp, gap = 12, log = null) {
  const sx = x => x * vp.scale + vp.x, sy = y => y * vp.scale + vp.y
  const left = sx(bounds.min.x), right = sx(bounds.max.x), top = sy(bounds.min.y)
  const onRight = (left + right) / 2 > vp.width / 2
  const before = left - gap - SIZE.narrow.width, after = right + gap
  // бажаний бік не вміщається між відступами (широка ліва зона «Players») — інший бік, якщо там є місце; інакше як було
  const fits = x => !(vp.width > 0) || (x >= SAFE.left && x + SIZE.narrow.width <= vp.width - SAFE.right)
  const x = onRight ? (fits(before) || !fits(after) ? before : after) : (fits(after) || !fits(before) ? after : before)
  return narrowBox(x, top, vp, log)
}

/** «До лівого / правого краю екрана» (автор 2026-11-26, варіант В: SDK не рухає відкрите вікно). vp = {width, height}. */
export function dockAnchor(side, vp, log = null, w = SIZE.narrow.width, ctr = ctrSlot()) {
  return narrowBox(side === 'right' ? vp.width - SAFE.right - w : SAFE.left, SAFE.top, vp, log, w, ctr)
}

/**
 * Вікно біля правого краю саме йде за краєм (пакет за спільним заходом, 2026-11-27). MUI Popover в Owlbear притискає
 * вікно до краю екрана на marginThreshold і перераховує місце на кожну зміну розміру вікна браузера й на setWidth
 * (виміряно наживо: left 100000, поріг 80, ширина 460 на 2007 px → 1467; setWidth 381 → 1546). Тож вікно біля правого
 * краю відкривається «якнайправіше» з порогом SAFE.right і після зміни розміру не перевідкривається (сторінка не
 * перезавантажується, введене не губиться). Поріг діє і згори (80 = SAFE.top), і знизу (вікна й так закінчуються на 128).
 * Реєстр (rec) пам'ятає справжнє місце, а не це «якнайправіше».
 */
export const FAR = 100000
export function popAt(at, side) {
  if (side !== 'right' || !at || !at.anchorPosition) return at
  return { ...at, anchorPosition: { ...at.anchorPosition, left: FAR }, marginThreshold: SAFE.right }
}

/**
 * «Генератори» біля одного краю й «Вороги» біля другого (пакет за спільним заходом, 2026-11-27): на екрані, вужчому за
 * SAFE.left + 460 + GAP + 460 + SAFE.right = 1292 px, два вікна по 460 налазили одне на одне (1134 px: 280–740 і 595–1055).
 * Тоді обидва вужчають порівну, щоб між ними лишився GAP (1134 → по 381). Не вужче за PAIR_MIN: на ще меншому екрані
 * (нижче за 1092 px) вони знову налазять, новіше — зверху, як було. Інші вікна (аркуш, караван) у пару не входять.
 */
export const PAIR_MIN = 360
const PAIR = { [ID.gen]: 'gen', [ID.genB]: 'gen', [ID.enemies]: 'en', [ID.enemiesB]: 'en' }
export function pairWidth(vw) {
  const W = SIZE.narrow.width
  if (!(vw > 0) || vw >= SAFE.left + 2 * W + GAP + SAFE.right) return W
  return Math.max(PAIR_MIN, Math.floor((vw - SAFE.left - SAFE.right - GAP) / 2))
}
/** Відкрите вікно-пара для id (інший тип із пари, біля протилежного краю): [id, rec] або null. side — бік самого id. */
export function partnerOf(ss, id, side) {
  const me = PAIR[id]
  if (!me || (side !== 'left' && side !== 'right')) return null
  for (const [pid, r] of Object.entries(winsGet(ss))) {
    if (!PAIR[pid] || PAIR[pid] === me || !r) continue
    if ((r.side === 'left' || r.side === 'right') && r.side !== side) return [pid, r]
  }
  return null
}
/** Ширина вузького вікна id біля краю side на екрані vw: 460 або спільна ширина пари. */
export const widthFor = (ss, id, side, vw) => partnerOf(ss, id, side) ? pairWidth(vw) : SIZE.narrow.width
/** Пара змінила ширину (відкрилось чи закрилось друге вікно): ширина й запис реєстру відкритого вікна pid. */
async function setPairWidth(OBR, ss, pid, r, w) {
  if (!r || r.width === w) return
  const left = r.side === 'right' && r.vw > 0 ? r.vw - SAFE.right - w : r.left
  // ширше вікно може налізти на місце журналу (ревізор, 2026-11-27: 1268–1292 px) — висоту наново, як на відкритті
  const vp = { width: r.vw, height: r.vh }
  const height = (r.side === 'left' || r.side === 'right') && r.vw > 0 && r.vh > 0 ? dockAnchor(r.side, vp, logSlot(vp), w).height : r.height
  winSet(ss, pid, { ...r, width: w, left, height, full: height })
  // обидва виклики одразу: на pagehide відповідь Owlbear сторінці, що закривається, може не прийти (ревізор, 2026-11-27)
  const calls = [OBR.popover.setWidth(pid, w)]
  if (height !== r.height) calls.push(OBR.popover.setHeight(pid, height))
  await Promise.all(calls.map(p => Promise.resolve(p).catch(() => {})))
}
/**
 * ✕ чи Esc у «Генераторах» або «Ворогах»: вікно-пара повертає звичайну ширину. Кличе сторінка до свого закриття.
 * key — ключ запису, з яким сторінку відкрито (pagehide): місце id тим часом могло дістатись новому вікну, його не чіпати.
 */
export async function releasePair(OBR, id, ss = session(), key = '') {
  const own = winsGet(ss)[id]
  if (key && (!own || own.k !== key)) return
  const p = own && partnerOf(ss, id, own.side)
  winSet(ss, id, null)
  if (p) await setPairWidth(OBR, ss, p[0], p[1], SIZE.narrow.width)
}

/** Розмір широкого вікна (modal) на екрані vp: 900×900, але не більше за екран без полів Owlbear (папір modal має
 * max-height і max-width calc(100% − 64px) і свою прокрутку, тож вищий вміст прокручувався разом зі смугою вікна і ✕:
 * спільний захід 2026-11-27, сторінка 729 px; виміряно наживо 2026-11-27). */
export const MODAL_MARGIN = 64
export function modalSize(vp) {
  const fit = (v, m) => v > 0 ? Math.max(320, Math.min(m, Math.floor(v - MODAL_MARGIN))) : m
  return { width: fit(vp && vp.width, SIZE.modal.width), height: fit(vp && vp.height, SIZE.modal.height) }
}

async function viewportSize(OBR) {
  const [width, height] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()].map(p => Promise.resolve(p).catch(() => 0)))
  return { width: width > 0 ? width : 0, height: height > 0 ? height : 0 }
}
/** Поля popover біля токена; немає токена — біля лівого краю; немає й в'юпорта — {} (як поставить Owlbear). */
/** Поля popover (at) і запис реєстру (rec): висота без журналу (full) і з ним. */
// Місце журналу завжди вільне (автор, 2026-11-27): вікно, чия смуга перетинає місце журналу, одразу стає над ним,
// відкритий журнал чи ні, — тож аркуш не стрибає по висоті, коли журнал відкривається чи закривається.
/** Місце журналу на екрані vp = {width, height} або null, якщо розмір екрана невідомий. */
export function logSlot(vp) {
  const b = logBox(vp)
  return b.anchorPosition ? { left: b.anchorPosition.left, top: b.anchorPosition.top, width: SIZE.log.width, height: b.height } : null
}
function placed(make, vp, side = '', w = SIZE.narrow.width) {
  const at = make(logSlot(vp))
  return { at: popAt(at, side), rec: vp.height > 0 ? recOf(at, w, at.height, vp.height, vp.width, side) : null, w }
}
async function nearToken(OBR, itemId) {
  let vp
  try { vp = await viewportSize(OBR) } catch { return { at: {}, rec: null } }
  try {
    const [bounds, pos, scale] = await Promise.all([OBR.scene.items.getItemBounds([itemId]), OBR.viewport.getPosition(), OBR.viewport.getScale()])
    if (bounds && pos && scale > 0 && vp.width > 0) return placed(l => anchorFor(bounds, { x: pos.x, y: pos.y, scale, ...vp }, 12, l), vp)
  } catch { /* токена немає */ }
  return vp.width > 0 ? placed(l => dockAnchor('left', vp, l), vp, 'left') : { at: {}, rec: null }
}
/** wOf(vp) — ширина вікна на цьому екрані (пара «Генератори» / «Вороги»), інакше 460. */
async function dockAt(OBR, side, wOf = () => SIZE.narrow.width) {
  let vp
  try { vp = await viewportSize(OBR) } catch { vp = { width: 0, height: 0 } }
  if (side === 'right' && !(vp.width > 0)) return { at: {}, rec: null, w: SIZE.narrow.width }
  const w = wOf(vp)
  return placed(l => dockAnchor(side, vp, l, w), vp, side === 'right' ? 'right' : 'left', w)
}

// Вузьке вікно має два місця (id): щоб переставити його, нове відкривається в другому місці, а старе закривається
// останнім (з ним зупиняється й скрипт сторінки). Повторний open з тим самим id SDK не обіцяє перемістити.
const narrowId = slot => slot === 'b' ? ID.narrowB : ID.narrow

/**
 * Відкрити аркуш токена. Одночасно відкрите лише одне вікно аркуша: широке закриває вузьке й навпаки.
 * from — 'modal' | 'narrow', якщо кличе саме вікно аркуша (його закриваємо останнім, бо з ним зупиниться й скрипт);
 * slot — місце вузького вікна, що кличе ('' | 'b'); dock — 'left' | 'right': вузьке вікно до краю екрана, інакше біля токена;
 * roller — одразу відкрити панель «Зробити перевірку» (етап 2).
 */
export async function openSheet(OBR, base, itemId, { narrow = false, from = '', slot = '', dock = '', roller = false, ss = session() } = {}) {
  const quiet = p => Promise.resolve(p).catch(() => {})
  const forget = () => { winSet(ss, ID.narrow, null); winSet(ss, ID.narrowB, null) }
  const other = slot === 'b' ? '' : 'b'
  const closeNarrow = async () => {   // своє місце — останнім
    if (from === 'narrow') { await quiet(OBR.popover.close(narrowId(other))); await quiet(OBR.popover.close(narrowId(slot))) }
    else { await quiet(OBR.popover.close(ID.narrowB)); await quiet(OBR.popover.close(ID.narrow)) }
  }
  if (narrow) {
    const to = from === 'narrow' ? other : ''
    if (from !== 'narrow') await closeNarrow()
    const { at, rec } = dock ? await dockAt(OBR, dock) : await nearToken(OBR, itemId)
    forget(); winSet(ss, narrowId(to), rec)
    await OBR.popover.open({ id: narrowId(to), url: sheetUrl(base, itemId, true, to, roller), ...SIZE.narrow, disableClickAway: true, ...at })
    if (from === 'modal') await quiet(OBR.modal.close(ID.modal))
    if (from === 'narrow') await quiet(OBR.popover.close(narrowId(slot)))
  } else {
    if (from !== 'modal') await quiet(OBR.modal.close(ID.modal))
    let vp   // не вище за сторінку без полів modal, як караван (автор, 2026-11-27)
    try { vp = await viewportSize(OBR) } catch { vp = { width: 0, height: 0 } }
    await OBR.modal.open({ id: ID.modal, url: sheetUrl(base, itemId, false, '', roller), ...modalSize(vp) })
    forget()
    await closeNarrow()
  }
}

/** Рамка вікна «Журнал кидків»: унизу правої колонки, над лотком ресурсів (LOG_BOTTOM), варіант Б; vp = {width, height} (0 — невідомо). */
export function logBox(vp) {
  const w = SIZE.log.width
  const height = logHeight(vp.height)
  if (!(vp.width > 0) || !(vp.height > 0)) return { height }
  return {
    anchorReference: 'POSITION',
    anchorPosition: { left: Math.max(SAFE.left, vp.width - SAFE.right - w), top: vp.height - LOG_BOTTOM - height },
    anchorOrigin: { horizontal: 'LEFT', vertical: 'TOP' },
    transformOrigin: { horizontal: 'LEFT', vertical: 'TOP' },
    marginThreshold: 16,
    height,
  }
}

/** Висоти відкритих вузьких вікон під новий стан журналу: log — запис журналу або null (закрили). */
async function refit(OBR, ss, log) {
  for (const [id, r] of Object.entries(winsGet(ss))) {
    if (id === ID.log || !r || !(r.full > 0) || !(r.vh > 0)) continue
    // вікно, поставлене для іншого розміру екрана, саме переставляється (followResize) — не змагатися з ним
    if (log && r.vw > 0 && log.vw > 0 && (r.vw !== log.vw || r.vh !== log.vh)) continue
    // відкрите вікно стоїть, де стоїть (SDK його не рухає): коротшає лише до верху журналу від свого r.top
    const freeH = Math.max(160, Math.min(r.full, r.vh - SAFE.bottom - r.top))
    const h = log && crosses(r, r.width, log) && r.top < log.top + log.height ? Math.max(160, Math.min(freeH, log.top - GAP - r.top)) : freeH
    if (h === r.height) continue
    winSet(ss, id, { ...r, height: h })
    await Promise.resolve(OBR.popover.setHeight(id, h)).catch(() => {})
  }
}

/** Відкрити «Журнал кидків» (popover без закриття кліком по мапі); вузькі вікна над ним коротшають.
 * Вручну (з меню, auto = false): журнал не зникає сам, а позначка «закрито вручну» знімається. */
export async function openLog(OBR, base, { ss = session(), auto = false } = {}) {
  const at = Date.now()
  if (!auto) { try { ss.removeItem(LOG_UNTIL); ss.removeItem(LOG_SHUT) } catch { /* ок */ } }
  if (!logOpen(ss, at)) winSet(ss, ID.log, { pending: 1, at })   // до першого await: два кидки поспіль не відкривають журнал двічі
  let vp
  try { vp = await viewportSize(OBR) } catch { vp = { width: 0, height: 0 } }
  const box = logBox(vp)
  const rec = recOf(box, SIZE.log.width, box.height, vp.height, vp.width)
  winSet(ss, ID.log, { ...(rec || { none: 1 }), at })
  try { await OBR.popover.open({ id: ID.log, url: base + 'log.html', ...SIZE.log, disableClickAway: true, ...box }) } catch (e) { winSet(ss, ID.log, null); throw e }
  if (rec) await refit(OBR, ss, rec)
}

/** Закрити журнал: manual — ✕ чи Esc у ньому (далі сповіщення, notifyFor), інакше — минули 10 с; вікна повертають висоту. */
export async function closeLog(OBR, { ss = session(), manual = false } = {}) {
  try { if (manual) ss.setItem(LOG_SHUT, '1'); ss.removeItem(LOG_UNTIL) } catch { /* ок */ }
  winSet(ss, ID.log, null); logGone(ss)
  await refit(OBR, ss, null)
  // ревізія 2026-11-27: кидок за час refit знову відкрив журнал (новий запис реєстру) — не закривати його
  if (!manual && winsGet(ss)[ID.log]) return
  await Promise.resolve(OBR.popover.close(ID.log)).catch(() => {})   // останнім: з ним зупиняється скрипт журналу
}

const untilOf = ss => { try { return +ss.getItem(LOG_UNTIL) || 0 } catch { return 0 } }
const setUntil = (ss, t) => { try { ss.setItem(LOG_UNTIL, String(t)) } catch { /* ок: тоді журнал не зникне сам */ } }
/** Чи пора журналу, показаному на 10 с, зникнути (кличе сторінка журналу щосекунди). */
export const logExpired = (ss = session(), now = Date.now()) => { const u = untilOf(ss); return u > 0 && now >= u }
/**
 * Після кидка будь-кого (автор, 2026-11-27, «Журнал на 10 секунд»): закритий журнал з'являється на AUTO_MS;
 * показаний на 10 с — відлік заново; відкритий вручну — нічого. → чи відкрито зараз.
 */
export async function autoOpenLog(OBR, base, { ss = session(), now = Date.now() } = {}) {
  if (logOpen(ss, now)) {
    if (untilOf(ss) > 0) setUntil(ss, now + AUTO_MS)
    return false
  }
  setUntil(ss, now + AUTO_MS)
  await openLog(OBR, base, { ss, auto: true })
  return true
}

/** Вузьке вікно закрилося своєю кнопкою: прибрати його з реєстру. */
export const forgetWin = (id, ss = session()) => winSet(ss, id, null)

// ---- караван (етап 3): ті самі два вигляди, що в аркуша персонажа; вузьке вікно — біля краю, бо токена в каравану немає ----
export const caravanUrl = (base, narrow = false, slot = '') => `${base}caravan.html${narrow ? '?w=narrow' : ''}${narrow && slot === 'b' ? '&slot=b' : ''}`
const carNarrowId = slot => slot === 'b' ? ID.carNarrowB : ID.carNarrow

/** Відкрити аркуш каравану; from / slot / dock — як в openSheet (вікно, що кличе, закривається останнім). */
export async function openCaravan(OBR, base, { narrow = false, from = '', slot = '', dock = 'left', ss = session() } = {}) {
  const quiet = p => Promise.resolve(p).catch(() => {})
  const forget = () => { winSet(ss, ID.carNarrow, null); winSet(ss, ID.carNarrowB, null) }
  const other = slot === 'b' ? '' : 'b'
  if (narrow) {
    const to = from === 'narrow' ? other : ''
    if (from !== 'narrow') { await quiet(OBR.popover.close(ID.carNarrowB)); await quiet(OBR.popover.close(ID.carNarrow)) }
    const { at, rec } = await dockAt(OBR, dock)
    forget(); winSet(ss, carNarrowId(to), rec)
    await OBR.popover.open({ id: carNarrowId(to), url: caravanUrl(base, true, to), ...SIZE.narrow, disableClickAway: true, ...at })
    if (from === 'modal') await quiet(OBR.modal.close(ID.carModal))
    if (from === 'narrow') await quiet(OBR.popover.close(carNarrowId(slot)))
  } else {
    if (from !== 'modal') await quiet(OBR.modal.close(ID.carModal))
    let vp
    try { vp = await viewportSize(OBR) } catch { vp = { width: 0, height: 0 } }
    await OBR.modal.open({ id: ID.carModal, url: caravanUrl(base), ...modalSize(vp) })
    forget()
    await quiet(OBR.popover.close(ID.carNarrowB)); await quiet(OBR.popover.close(ID.carNarrow))
  }
}

// ---- «Вороги» (етап 4): лише вузьке вікно 460 px, за замовчуванням у правій колонці над журналом (рядок 4.16) ----
/** q — рядок запиту сторінки без «?»: 'item=<id>' (картка токена), 'make=<id>,<id>' («Зробити ворогом…»), 'book=<id>'. */
export const enemiesUrl = (base, q = '', slot = '') => `${base}enemies.html?${[q, slot === 'b' ? 'slot=b' : ''].filter(Boolean).join('&')}`
const enemiesId = slot => slot === 'b' ? ID.enemiesB : ID.enemies

/** Відкрити «Вороги»; from = 'narrow', якщо кличе саме це вікно (його закриваємо останнім), slot — його місце. */
export async function openEnemies(OBR, base, { q = '', from = '', slot = '', dock = 'right', ss = session() } = {}) {
  const quiet = p => Promise.resolve(p).catch(() => {})
  const to = from === 'narrow' ? (slot === 'b' ? '' : 'b') : ''
  if (from !== 'narrow') { await quiet(OBR.popover.close(ID.enemiesB)); await quiet(OBR.popover.close(ID.enemies)) }
  winSet(ss, ID.enemies, null); winSet(ss, ID.enemiesB, null)
  await openPaired(OBR, ss, enemiesId(to), dock, enemiesUrl(base, q, to))
  if (from === 'narrow') await quiet(OBR.popover.close(enemiesId(slot)))
}

/** Вікно з пари «Генератори» / «Вороги» біля краю dock: ширина пари, а вікно-пара — ту саму ширину (setWidth). */
async function openPaired(OBR, ss, id, dock, url) {
  const side = dock === 'right' ? 'right' : 'left'
  const { at, rec, w } = await dockAt(OBR, dock, vp => widthFor(ss, id, side, vp.width))
  if (rec) rec.k = Math.random().toString(36).slice(2, 10)   // ключ цього відкриття (releasePair на pagehide)
  winSet(ss, id, rec)
  await OBR.popover.open({ id, url, ...SIZE.narrow, width: w, disableClickAway: true, ...at })
  // вікно другого типу пари: біля протилежного краю — та сама ширина, біля того самого — знову 460
  for (const [pid, r] of Object.entries(winsGet(ss))) {
    if (!PAIR[pid] || PAIR[pid] === PAIR[id] || !r) continue
    await setPairWidth(OBR, ss, pid, r, rec && (r.side === 'left' || r.side === 'right') && r.side !== side ? w : SIZE.narrow.width)
  }
}

// ---- «Генератори» (етап 4б, вікно А): вузьке вікно 460 px біля лівого краю; картка ворога — у «Ворогах» з другого боку ----
export const genUrl = (base, slot = '', side = 'left') => `${base}generators.html?side=${side === 'right' ? 'right' : 'left'}${slot === 'b' ? '&slot=b' : ''}`
const genId = slot => slot === 'b' ? ID.genB : ID.gen

/** Відкрити «Генератори»; from = 'narrow', якщо кличе саме це вікно (його закриваємо останнім), slot — його місце. */
export async function openGenerators(OBR, base, { from = '', slot = '', dock = 'left', ss = session() } = {}) {
  const quiet = p => Promise.resolve(p).catch(() => {})
  const to = from === 'narrow' ? (slot === 'b' ? '' : 'b') : ''
  if (from !== 'narrow') { await quiet(OBR.popover.close(ID.genB)); await quiet(OBR.popover.close(ID.gen)) }
  winSet(ss, ID.gen, null); winSet(ss, ID.genB, null)
  await openPaired(OBR, ss, genId(to), dock, genUrl(base, to, dock))
  if (from === 'narrow') await quiet(OBR.popover.close(genId(slot)))
}

// ---- «Швидкий старт» (сесія Б, автор 2026-11-27, вигляд А): вузьке вікно 460 px біля лівого краю, як караван ----
export const quickUrl = (base, slot = '') => `${base}quickstart.html${slot === 'b' ? '?slot=b' : ''}`
const quickId = slot => slot === 'b' ? ID.quickB : ID.quick
/** Відкрити «Швидкий старт»; from = 'narrow', якщо кличе саме це вікно (його закриваємо останнім), slot — його місце. */
export async function openQuick(OBR, base, { from = '', slot = '', dock = 'left', ss = session() } = {}) {
  const quiet = p => Promise.resolve(p).catch(() => {})
  const to = from === 'narrow' ? (slot === 'b' ? '' : 'b') : ''
  if (from !== 'narrow') { await quiet(OBR.popover.close(ID.quickB)); await quiet(OBR.popover.close(ID.quick)) }
  const { at, rec } = await dockAt(OBR, dock)
  winSet(ss, ID.quick, null); winSet(ss, ID.quickB, null); winSet(ss, quickId(to), rec)
  await OBR.popover.open({ id: quickId(to), url: quickUrl(base, to), ...SIZE.narrow, disableClickAway: true, ...at })
  if (from === 'narrow') await quiet(OBR.popover.close(quickId(slot)))
}

// ---- віконце лічильників (сесія Б): відкриває тло кожного клієнта (background.mjs), Доглядачу — ще й меню ----
// Сторінка щосекунди пише CTR_ALIVE: Owlbear сам закриває наші вікна (після зміни розміру вікна браузера), тож тло
// перевідкриває віконце, що не озивалося ALIVE_MS (вердикт радника, блокер 9). Відкрите живе вікно вдруге не відкривається:
// перезавантаження сторінки стерло б форму Доглядача.
export const CTR_ALIVE = 'pust-obr-ctr-alive'
export const ctrAlive = (ss = session(), now = Date.now()) => { try { ss.setItem(CTR_ALIVE, String(now)) } catch { /* ок */ } }
export const ctrGone = (ss = session()) => { try { ss.removeItem(CTR_ALIVE) } catch { /* ок */ } }
export function ctrOpen(ss = session(), now = Date.now()) {
  let t = 0
  try { t = +ss.getItem(CTR_ALIVE) || 0 } catch { /* ок */ }
  return now - t < ALIVE_MS
}
export const countersUrl = (base, form = false) => `${base}counters.html${form ? '?new=1' : ''}`
/** Поля popover віконця лічильників: стале місце CTR_BOX (праворуч від «Players»). */
export const ctrPopover = height => ({
  width: CTR_BOX.width, height: height || CTR_BOX.height,
  anchorReference: 'POSITION', anchorPosition: { left: CTR_BOX.left, top: CTR_BOX.top },
  anchorOrigin: { horizontal: 'LEFT', vertical: 'TOP' }, transformOrigin: { horizontal: 'LEFT', vertical: 'TOP' },
  marginThreshold: 16, disableClickAway: true,
})
/** Відкрити віконце лічильників; form — одразу з формою «Новий лічильник» (меню Доглядача). Живе вікно з form — лише сказати йому. */
export async function openCounters(OBR, base, { form = false, ss = session(), now = Date.now() } = {}) {
  if (ctrOpen(ss, now)) {
    if (form) { try { ss.setItem(CTR_FORM, String(now)) } catch { /* ок */ } }
    return false
  }
  try { ss.setItem(CTR_ALIVE, String(now)) } catch { /* ок */ }   // до першого await: два виклики не відкривають двічі
  await OBR.popover.open({ id: ID.counters, url: countersUrl(base, form), ...ctrPopover() })
  return true
}
export const CTR_FORM = 'pust-obr-ctr-form'   // меню просить відкрите віконце показати форму «Новий лічильник»

// ---- довідка «?» (сесія Б, автор 2026-11-27, вигляд А): окреме вікно праворуч від меню розширення, меню не затуляє ----
// Меню Owlbear ставить саме (action popover 320 px під кнопкою розширення вгорі ліворуч); HELP_AT — праворуч від нього
// з проміжком GAP (уточнено наживо, docs/plans/2026-11-27-owlbear-counters-plan.md).
export const HELP_AT = { left: 352, top: 64 }
export const helpUrl = (base, k) => `${base}help.html?k=${encodeURIComponent(k)}`
export async function openHelp(OBR, base, k) {
  await Promise.resolve(OBR.popover.close(ID.help)).catch(() => {})   // одна довідка за раз
  await OBR.popover.open({
    id: ID.help, url: helpUrl(base, k), ...SIZE.help, disableClickAway: true,
    anchorReference: 'POSITION', anchorPosition: { ...HELP_AT },
    anchorOrigin: { horizontal: 'LEFT', vertical: 'TOP' }, transformOrigin: { horizontal: 'LEFT', vertical: 'TOP' }, marginThreshold: 16,
  })
}
export const closeHelp = OBR => Promise.resolve(OBR.popover.close(ID.help)).catch(() => {})

// ---- зміна розміру вікна браузера (автор, 2026-11-27) ----
// Owlbear не повідомляє розширенню, що вікно браузера змінило розмір, а SDK 3.1.0 не рухає відкрите вікно; сам Owlbear
// лише підтягує popover до краю екрана (16 px), тож вузьке вікно після звуження могло закрити колонку інструментів.
// Тому кожне наше вузьке вікно саме опитує розмір екрана й, коли той устоявся, стає за тими самими правилами:
// пристале до краю — до того краю, біля токена — знову біля токена; лише висота — setHeight без перевідкриття.
export const RESIZE_EVERY = 500

/**
 * Що робити вікну з записом реєстру rec на екрані vp = {width, height}: null — нічого (той самий екран чи розмір невідомий);
 * {kind:'height', height, rec} — лише змінити висоту; {kind:'move', side, token} — перевідкрити (side — бік краю;
 * token — вікно стояло біля токена, тож і далі біля нього, якщо сторінка це вміє).
 */
export function resizePlan(rec, vp, w = (rec && rec.width) || SIZE.narrow.width, ctr = ctrSlot()) {
  if (!rec || !Number.isFinite(rec.left) || !Number.isFinite(rec.top) || !(vp.width > 0) || !(vp.height > 0)) return null
  // той самий екран і ті самі лічильники (з'явилися чи зникли — вікно біля лівого краю стає під них або назад угору)
  if (rec.vw === vp.width && rec.vh === vp.height && !!rec.ctr === !!ctr) return null
  const side = rec.side === 'left' || rec.side === 'right' ? rec.side : ''
  // вікно біля токена, поставлене під лічильники, після їхнього зникнення повертається на свій верх (SAFE.top і вище — як було)
  const top0 = !ctr && rec.ctr && rec.top === CTR_BOX.top + CTR_BOX.height + GAP ? SAFE.top : rec.top
  const box = side ? dockAnchor(side, vp, logSlot(vp), w, ctr) : narrowBox(rec.left, top0, vp, logSlot(vp), w, ctr)
  const p = box.anchorPosition
  // біля правого краю вікно вже стоїть, де треба: Owlbear притиснув його до краю сам (popAt); лишились висота й ширина
  if (side === 'right' || (p.left === rec.left && p.top === rec.top)) return { kind: 'height', height: box.height, width: w, rec: { ...rec, left: p.left, top: p.top, width: w, height: box.height, full: box.height, vw: vp.width, vh: vp.height, ctr: ctr ? 1 : 0 } }
  const was = rec.vw > 0 ? rec.vw : vp.width
  return { kind: 'move', side: side || (rec.left + (rec.width || SIZE.narrow.width) / 2 > was / 2 ? 'right' : 'left'), token: !side }
}

/**
 * Опитувати розмір екрана кожні every мс; onStable(vp) — коли розмір двічі поспіль однаковий і ще не оброблений
 * (тягнути край вікна браузера — не привід перевідкривати вікно на кожному кроці). → функція «зупинити».
 */
export function watchResize(OBR, onStable, { every = RESIZE_EVERY, setI = setInterval, clearI = clearInterval, extra = () => '' } = {}) {
  let prev = '', done = '', busy = false
  const t = setI(async () => {
    if (busy) return
    busy = true
    try {
      if (!OBR.viewport) return   // фейк dev-сервера без viewport: не сипати помилками щопівсекунди
      const vp = await viewportSize(OBR)
      if (!(vp.width > 0) || !(vp.height > 0)) return
      const key = vp.width + 'x' + vp.height + extra()   // extra: лічильники з'явилися чи зникли (followResize)
      if (key === prev && key !== done) { done = key; await onStable(vp) }
      prev = key
    } catch (e) { console.error(e) } finally { busy = false }
  }, every)
  return () => clearI(t)
}

/**
 * Вузьке вікно id стежить за розміром екрана: висоту міняє саме, а перевідкриття віддає сторінці (onMove(plan)),
 * бо лише вона знає, що треба записати перед закриттям (аркуш, караван).
 */
export function followResize(OBR, id, onMove, { ss = session(), ...opts } = {}) {
  return watchResize(OBR, async vp => {
    const rec = winsGet(ss)[id]
    const plan = resizePlan(rec, vp, rec && widthFor(ss, id, rec.side, vp.width), ctrSlot(ss))
    if (!plan) return
    if (plan.kind === 'height') {
      winSet(ss, id, plan.rec)
      if (plan.width !== rec.width) await Promise.resolve(OBR.popover.setWidth(id, plan.width)).catch(() => {})
      await Promise.resolve(OBR.popover.setHeight(id, plan.height)).catch(() => {})
    } else await onMove(plan)
  }, { extra: () => ctrSlot(ss) ? ':ctr' : '', ...opts })
}

/** Тло: журнал кидків (його сторінка не може перевідкрити сама себе — з закриттям зупиняється її скрипт). */
export function followLogResize(OBR, base, { ss = session(), ...opts } = {}) {
  return watchResize(OBR, async vp => {
    if (!logOpen(ss)) return
    const r = winsGet(ss)[ID.log]
    if (!r || (r.vw === vp.width && r.vh === vp.height)) return
    const b = logBox(vp)
    if (b.anchorPosition && b.anchorPosition.left === r.left && b.anchorPosition.top === r.top && b.height === r.height) {
      winSet(ss, ID.log, { ...r, vw: vp.width, vh: vp.height }); return
    }
    await Promise.resolve(OBR.popover.close(ID.log)).catch(() => {})
    await openLog(OBR, base, { ss, auto: true })   // auto: не чіпає ні «10 секунд», ні «закрито вручну»
  }, opts)
}

/**
 * Закрити контекстне меню Owlbear після кліку по нашому пункту (автор, 2026-11-27). SDK 3.1.0 не має contextMenu.close,
 * а Owlbear сам меню не закриває: воно лишалося під нашим вікном, і перший клік у вікні лише закривав меню (кидок не йшов).
 * Меню живе, поки вибрано токени: зняти вибір закриває його (живий захід 2026-11-27), а повернути той самий вибір
 * меню вже не відкриває, тож для Доглядача й гравця вибір лишається, як був.
 */
export async function closeContextMenu(OBR, ids) {
  try {
    await OBR.player.deselect()
    if (ids && ids.length) await OBR.player.select(ids, true)
  } catch (e) { console.error(e) }
}
