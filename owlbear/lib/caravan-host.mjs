// Пустельники в Owlbear Rodeo: господар аркуша каравану в room metadata (етап 3), без DOM.
// Сторінка ext/caravan.mjs дає йому OBR і вікно аркуша (міст car_build.py, режим obr).
// Дизайн і правила злиття: docs/plans/2026-11-27-owlbear-stage3-design.md (вердикт радника 2026-11-27, Б1–Б8).
//
// sheet.boot(init) → Promise<win>: win має CG_GET(), CG_SET(st | fn, ver), CG_THEME(dark), CG_VER.
// ui(kind, data): 'open' | 'bad-data' {newer} (ключ є, але не читається: аркуш не показано, чекаємо openBlank())
//   | 'conflict' {fields} | 'written' | 'error' {code: 'too-big' {bytes,max} | 'write-failed' {msg} | 'not-saved'}
//   | 'snap' {n, t} (у кімнаті порожньо, а цей браузер пам'ятає останній караван) | 'snap-off'
//
// Три стани (радник Б2):
//   room  — останній відомий запис кімнати {r, w, z, st} (st розпаковано) або null;
//   base  — стан, який аркуш уже ввібрав: аркуш = base + правки людини, ще не записані;
//   бажане D = злиття(base, аркуш, room.st) — правки людини поверх кімнати.
// D ≠ кімната — пишемо D (Б3: лише той, у кого є свої правки); D ≠ аркуш — віддаємо в аркуш функцією, що зливає в мить
// застосування (Б1: набране, поки CG_SET чекав, не губиться), і саме тоді base := room.st.
import { K, ROOM_MAX, bytes, newCid, roomBytes } from './store.mjs'
import { createWriter, SKIP } from './writer.mjs'
import {
  packCaravan, packCaravanSync, unpackCaravan, mergeCaravan, caravanKey, isCaravanRec, CAR_MAX, ROOM_TOTAL_MAX,
} from './caravan-data.mjs'

const clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x))
const sameRec = (a, b) => !!a && !!b && a.r === b.r && a.w === b.w && a.z === b.z   // Б4: не за r >, а за самим записом

export const SNAP_KEY = 'pust-obr-car-last'
/** «Добрий» караван, який варто пам'ятати: має назву, вантаж чи примітки (чистий аркуш — ні). */
export const goodCaravan = st => !!st && typeof st === 'object' && !!((typeof st.companyName === 'string' && st.companyName.trim())
  || (Array.isArray(st.cargo) && st.cargo.length) || (typeof st.notes === 'string' && st.notes.trim()))

export function createCaravanHost({ OBR, sheet, ui = () => {}, writer, timers = {}, rand = Math.random, verifyDelay = 600, storage = null, roomId = '' }) {
  const setT = timers.setTimeout || ((f, ms) => setTimeout(f, ms))
  const clearT = timers.clearTimeout || (t => clearTimeout(t))
  const myW = newCid(rand)
  let restore = null   // на випадок відмови запису
  const W = writer || createWriter({ OBR, timers, onError: (e, target) => { if (target === 'room') failed(e) } })

  let win = null, room = null, base = null, closed = false, bad = false
  let replace = false        // аркуш замінив увесь караван (Ж1): пишемо цілим, без злиття
  let whole = false          // чужий запис замінив увесь караван (x: 1): беремо його цілим, мої незаписані правки — ні
  let pushes = 0             // скільки функцій CG_SET ще не застосовано аркушем
  let inflight = null        // мій останній запис {r, st, rec}, якого кімната ще не підтвердила
  let maxR = 0               // найбільший номер, який бачила вкладка
  let ready = null           // {key, rec} — уже стиснутий запис для закриття вікна
  let seq = 0                // порядок розпакування чужих записів: старіший результат не перекриває новішого
  let verifyT = null, theme = null
  const unsub = []

  // ---- останній добрий караван цього браузера (автор, 2026-11-27, П1 а): «Очистити аркуш» чи підробка не стирає його назавжди ----
  const now = timers.now || (() => Date.now())
  const snapKey = roomId ? SNAP_KEY + ':' + roomId : SNAP_KEY   // знімок своєї кімнати: чужий караван в іншу кімнату не пропонуємо
  function snapGet() { try { const v = storage && JSON.parse(storage.getItem(snapKey)); return v && v.st && typeof v.st === 'object' ? v : null } catch { return null } }
  function snapPut(st) { if (!storage || !goodCaravan(st)) return; try { storage.setItem(snapKey, JSON.stringify({ t: now(), st })) } catch { /* сховище недоступне */ } }
  /** Показати чи сховати смугу «Повернути останній караван»: у кімнаті немає доброго каравану, а браузер його пам'ятає. */
  function snapCheck() {
    const s = snapGet(), here = room ? room.st : cur()
    if (s && !goodCaravan(here) && caravanKey(s.st) !== caravanKey(here)) ui('snap', { n: s.st.companyName || '', t: s.t })
    else ui('snap-off', {})
  }
  /** «Повернути останній караван з цього браузера»: увесь караван цілим, як «Відкрити .json». */
  function restoreSnap() {
    const s = snapGet()
    if (!s || !win) return false
    replace = true
    win.CG_SET(() => clone(s.st))
    ui('snap-off', {})
    return true
  }

  // копія, не сам стан: CG_GET мосту car_build.py віддає живий об'єкт S, який аркуш міняє на місці. Без копії room.st
  // після першого запису в порожню кімнату був тим самим об'єктом, і жодна наступна правка «не відрізнялась» від кімнати
  // (вада етапу 3, жива перевірка 2026-11-27)
  const cur = () => { try { return win && typeof win.CG_GET === 'function' ? clone(win.CG_GET()) : null } catch { return null } }
  const desired = c => replace ? { st: c, conflicts: [] } : whole && room ? { st: room.st, conflicts: [] } : mergeCaravan(base, c, room ? room.st : null)

  function failed(e) {
    if (restore) { inflight = null; restore = null }
    ui('error', { code: 'write-failed', msg: String((e && (e.message || (e.error && e.error.message))) || e) })
  }

  /** Аркуш отримує стан кімнати, злитий з правками людини в мить застосування. */
  function push() {
    if (!win) return
    pushes++
    win.CG_SET(s => {
      pushes = Math.max(0, pushes - 1)
      const target = room ? room.st : null
      const { st } = replace ? { st: s } : whole && target ? { st: clone(target) } : mergeCaravan(base, s, target)
      if (target && !replace) base = clone(target)
      whole = false
      return st
    })
  }

  /** Записати, якщо в кімнаті не те, що треба. Значення обчислюється перед самим записом (і наново після «Too many requests»). */
  function schedule() {
    if (closed || bad) return
    W.writeRoom({ [K.caravan]: job })
  }
  async function job() {
    if (closed || !win) return SKIP
    const fresh = (await OBR.room.getMetadata()) || {}
    await take(fresh[K.caravan], false)
    const c = cur()
    if (!c) return SKIP
    const { st, conflicts = [] } = desired(c)
    if (!replace && !room && caravanKey(st) === caravanKey(base)) return SKIP   // порожня кімната й аркуш не мінявся
    if (room && caravanKey(st) === caravanKey(room.st)) { replace = false; return SKIP }
    if (conflicts.length) ui('conflict', { fields: conflicts })
    if (caravanKey(st) !== caravanKey(c)) push()
    const r = Math.min(Number.MAX_SAFE_INTEGER - 1, Math.max(maxR, room ? room.r : 0) + 1)
    const rec = await packCaravan({ r, w: myW, st, x: replace })
    // розмір: частка каравану, усі наші ключі й уся кімната разом з іншими розширеннями (Б8, Ж3)
    const all = { ...fresh, [K.caravan]: rec }
    const ours = roomBytes(all), total = bytes(all), mine = bytes(K.caravan) + bytes(rec)
    if (mine > CAR_MAX + 40 || ours > ROOM_MAX || total > ROOM_TOTAL_MAX) {
      const [b, max] = mine > CAR_MAX + 40 ? [mine, CAR_MAX] : total > ROOM_TOTAL_MAX ? [total, ROOM_TOTAL_MAX] : [ours, ROOM_MAX]
      ui('error', { code: 'too-big', bytes: b, max })
      return SKIP
    }
    replace = false
    snapPut(st)
    maxR = r
    inflight = { r, st, rec }; restore = true
    ready = { key: caravanKey(st), rec }
    if (verifyT) clearT(verifyT)
    verifyT = setT(verify, verifyDelay)
    return rec
  }

  /** Ж4: свій запис має з'явитися в кімнаті; ні — він мовчки не відбувся. */
  async function verify() {
    verifyT = null
    if (closed || !inflight) return
    try {
      const m = ((await OBR.room.getMetadata()) || {})[K.caravan]
      if (inflight && !(m && m.w === myW && m.r === inflight.r)) {
        if (m && m.r >= inflight.r) await take(m, true)   // його вже переписав хтось інший
        else { inflight = null; restore = null; ui('error', { code: 'not-saved' }) }
      } else if (m) await take(m, true)
    } catch { /* перевірка необов'язкова */ }
  }

  /**
   * Запис кімнати: відлуння мого, чужий (розпакувати, злити, віддати в аркуш, дописати свої правки) чи нечитаний.
   * act — після чужого одразу дописати свої правки (з черги запису — ні: черга й так пише).
   */
  async function take(m, act) {
    if (m === undefined || m === null) return
    if (room && sameRec(m, room)) return
    if (inflight && m.w === myW && m.r === inflight.r) {   // відлуння: аркуш уже містить записане, якщо не чекає злиття
      seq++   // чужий запис, що ще розпаковується, старіший за це відлуння
      room = { ...inflight.rec, st: inflight.st }
      if (!pushes) base = clone(inflight.st)
      inflight = null; restore = null
      ui('written')
      return
    }
    if (!isCaravanRec(m)) return
    const my = ++seq
    const d = await unpackCaravan(m)
    if (my !== seq || closed) return   // поки розпаковували, прийшов новіший запис
    if (!d) return                     // підробку чи пошкоджене посеред роботи не вливаємо (Б7: перша правка перепише)
    maxR = Math.max(maxR, d.r)
    room = { ...m, st: d.st }
    if (d.x) { whole = true; replace = false }   // заміна цілого каравану: старі ключі не воскресають
    snapPut(d.st)
    snapCheck()
    const c = cur()
    if (!c) return
    const { st, conflicts = [] } = desired(c)
    if (conflicts.length) ui('conflict', { fields: conflicts })   // те саме поле змінили обидва: лишається моє, я його й допишу
    if (caravanKey(st) !== caravanKey(c)) push()
    // аркуш уже містить чуже (обидва зробили однакову правку): він ввібрав кімнату, як після push. Інакше старий base
    // наступного раунду дав би хибний конфлікт (О3, захід етапу 3, 2026-11-27)
    else if (!pushes && !replace) base = clone(room.st)
    if (act && caravanKey(st) !== caravanKey(room.st)) schedule()
  }

  async function boot(init) {
    win = null
    win = await sheet.boot(init)
    base = clone(win.CG_GET())
    try {
      const t = await OBR.theme.getTheme()
      win.CG_THEME(t && t.mode === 'DARK')
      theme = OBR.theme.onChange(t => win && win.CG_THEME(t && t.mode === 'DARK'))
    } catch { /* тема необов'язкова */ }
  }

  function listen() {
    unsub.push(OBR.room.onMetadataChange(meta => { take((meta || {})[K.caravan], true).catch(e => console.error(e)) }))
    if (theme) unsub.push(theme)
  }

  async function start() {
    const m = ((await OBR.room.getMetadata()) || {})[K.caravan]
    if (m !== undefined && m !== null) {
      const d = await unpackCaravan(m)
      if (!d) {   // Б7: ключ є, але не читається — не відкривати чистий аркуш, який першою правкою затер би караван
        bad = true
        ui('bad-data', { newer: !!m && typeof m === 'object' && Number.isFinite(m.v) && m.v > 1 })
        return 'bad-data'
      }
      room = { ...m, st: d.st }; maxR = d.r
      snapPut(d.st)
      await boot(d.st)
    } else await boot(undefined)
    listen()
    ui('open', {})
    snapCheck()
    return 'open'
  }

  /** «Відкрити чистий аркуш» з екрана нечитаного каравану: явна дія людини, перша правка перепише запис. */
  async function openBlank(restore = false) {
    bad = false
    await boot(undefined)
    listen()
    ui('open', {})
    if (restore) restoreSnap(); else snapCheck()
    return 'open'
  }

  /** Повідомлення від аркуша. */
  function onMessage(msg) {
    if (!msg || closed || !win) return
    if (msg.cg === 'replace') { replace = true; return }
    if (msg.cg !== 'state') return
    const c = cur()
    if (!c) return
    const { st } = desired(c)
    if (!room && !replace && caravanKey(st) === caravanKey(base)) return
    if (room && caravanKey(st) === caravanKey(room.st) && !replace) return
    schedule()
    packAhead(st)
  }
  /** Наперед стиснути те, що піде в кімнату: закриття вікна візьме готове (не «збережений» блок). */
  function packAhead(st) {
    const key = caravanKey(st)
    packCaravan({ r: 0, w: myW, st }).then(rec => { if (!ready || ready.key !== key) ready = { key, rec, pre: true } }).catch(() => {})
  }

  /** ✕, Esc, «Вузьке / Широке вікно»: дочекатися самого запису (не постановки в чергу), але не довше за ms (Б6). */
  async function settle(ms = 1500) {
    if (!win || closed || bad) return
    const c = cur()
    if (c) {
      const { st } = desired(c)
      const need = room ? caravanKey(st) !== caravanKey(room.st) : (replace || caravanKey(st) !== caravanKey(base))
      if (need) schedule()
    }
    await Promise.race([W.flush(), new Promise(ok => setT(ok, ms))])
  }

  /** pagehide / сховане вікно: чекати не можна — одразу, з уже стиснутого або «збереженим» блоком (той самий формат). */
  function closing() {
    if (!win || closed || bad) return
    const c = cur()
    if (!c) return
    const { st } = desired(c)
    const need = room ? caravanKey(st) !== caravanKey(room.st) : (replace || caravanKey(st) !== caravanKey(base))
    if (!need) return W.flushNow([])
    const r = Math.min(Number.MAX_SAFE_INTEGER - 1, Math.max(maxR, room ? room.r : 0) + 1)
    const key = caravanKey(st)
    let rec = ready && ready.key === key && !replace ? { ...ready.rec, r } : packCaravanSync({ r, w: myW, st, x: replace })
    const fits = x => bytes(K.caravan) + bytes(x) <= CAR_MAX + 40
    if (!fits(rec)) {   // «збережений» блок не влазить: стискаємо й шлемо, якщо вікно ще проживе
      W.flushNow([])
      packCaravan({ r, w: myW, st, x: replace }).then(z => { if (fits(z)) W.flushNow([['room', { [K.caravan]: z }]]) }).catch(() => {})
      return
    }
    maxR = r; inflight = { r, st, rec }
    W.flushNow([['room', { [K.caravan]: rec }]])
  }

  /** Вікно знову видиме: перечитати кімнату (етап 0 раз бачив розбіжність вигляду із сервером, Ж7). */
  async function refresh() {
    if (!win || closed || bad) return
    const m = ((await OBR.room.getMetadata()) || {})[K.caravan]
    await take(m, true)
  }

  function dispose() {
    closed = true
    if (verifyT) { clearT(verifyT); verifyT = null }
    unsub.splice(0).forEach(f => { try { typeof f === 'function' && f() } catch { /* ок */ } })
  }

  return {
    start, openBlank, restoreSnap, hasSnap: () => !!snapGet(), onMessage, settle, closing, refresh, dispose,
    get w() { return myW }, get win() { return win }, get room() { return room }, get base() { return base }, writer: W,
  }
}
