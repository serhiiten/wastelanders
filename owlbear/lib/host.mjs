// Пустельники в Owlbear Rodeo: контролер аркуша персонажа на токені, без DOM.
// Сторінка ext/sheet.mjs (сесія 3) дає йому OBR, localStorage, вікно аркуша й показ повідомлень.
// Дизайн: docs/plans/2026-11-26-owlbear-stage1-design.md, «Поведінка».
//
// sheet.boot(init, {gm}) → Promise<win>: завантажити аркуш (CG_MODE 'obr'); init: стан | {} («Створити») | null («Випадковий»).
//   win має CG_GET(), CG_SET(st, ver), CG_THEME(dark) — міст cg_build.py.
// ui(kind, data) — що показати сторінці:
//   'choose' {cached:[{cid,n,r,t}]}  токен без аркуша: «Створити» / «Випадковий» / «Відкрити .json» / кешовані персонажі
//   'confirm-owner' {n}               збіг лише за ім'ям: «Це ти?»
//   'not-yours' {n}                   чужий токен ('' — токен нікому не призначено)
//   'open' {cid, r}                   аркуш відкрито
//   'took-cache' {r}                  на токені була старіша копія, узято новішу з цього браузера
//   'stale' {r}                       є новіша версія персонажа (зміна №r) деінде: ця копія застаріла
//   'detached' {cid}                  копія стала окремим персонажем
//   'error' {code, ...}               too-big {bytes,max,portrait — завинив портрет} | room-full {bytes,max} | write-failed {msg} | no-item | item-gone
import {
  K, ITEM_MAX, ROOM_MAX, bytes, newCid, packSheet, unpackSheet, nextR, regUpdate, roomBytes, itemFits, itemBytes,
  access, claimOwner, staleness, applySet, pickSet, sameSet, isEcho, stripPortrait, withPortrait, cleanPortrait,
  cacheGet, cacheList, cachePut,
} from './store.mjs'
import { createWriter } from './writer.mjs'
import { hasEnemy, isCaravanToken, heroLabel } from './enemy-bar.mjs'

export function createHost({ OBR, storage, sheet, ui = () => {}, itemId, writer, timers = {}, rand = Math.random, regDelay = 1500 }) {
  const setT = timers.setTimeout || ((f, ms) => setTimeout(f, ms))
  const clearT = timers.clearTimeout || (t => clearTimeout(t))
  const now = timers.now || (() => Date.now())
  // підпис під токеном — ім'я персонажа (автор, 2026-11-27), у тому ж записі, що й аркуш
  const W = writer || createWriter({ OBR, timers, decorate: heroLabel, onError: e => ui('error', { code: 'write-failed', msg: String((e && e.message) || e) }) })

  const myW = newCid(rand)          // id цієї вкладки: упізнати власне відлуння
  let me = null, gm = false, owner = null, room = {}, win = null
  let cid = '', myR = 0, myVer = 0, lastKey = '', lastSet = null, stale = 0
  let regTimer = null, regDirty = false, closed = false, blocked = false   // blocked — показано «не твій» після перепризначення
  let waitFile = null   // «Відкрити .json»: ключ чистого аркуша, поки аркуш не прийняв файл (нічого не пишемо)
  let tokP = null       // портрет, що лежить на токені (K.portrait), наскільки відомо цій вкладці
  let tokHp = 'null'    // ОЗ для смужки, що лежать у записі аркуша на токені (JSON), наскільки відомо цій вкладці
  let bigP = null       // портрет, що не влазить у токен: персонаж пишеться без нього (попередження показано раз)
  let landedR = 0       // найбільший номер зміни, який ця вкладка вже бачила на токені (свій чи чужий)
  const unsub = []

  const regOf = c => { const r = room[K.reg]; return r && Number.isFinite(r[c]) ? r[c] : 0 }
  const roomSet = () => room[K.set] && typeof room[K.set] === 'object' ? room[K.set] : null
  const keyOf = st => JSON.stringify(stripPortrait(st))
  /**
   * ОЗ героя для смужки над токеном (автор, 2026-11-27, A): максимум рахує лише рушій аркуша (атрибути, перки, хімія),
   * тож питаємо його функції у вікні аркуша (compute, curHp, hpMaxNow — глобальні функції cg_embed); немає — null.
   */
  function sheetHp() {
    try {
      if (!win || typeof win.compute !== 'function' || typeof win.curHp !== 'function' || typeof win.hpMaxNow !== 'function') return null
      const d = win.compute(win.CG_GET())
      const max = win.hpMaxNow(d), value = win.curHp(d)
      return Number.isInteger(max) && Number.isInteger(value) && max >= 1 ? { value: Math.max(0, Math.min(value, max)), max } : null
    } catch { return null }
  }
  const hpKeyOf = rec => JSON.stringify(rec && typeof rec === 'object' && rec.hp ? rec.hp : null)
  const hpKey = () => hpKeyOf(packSheet({ cid: '', r: 0, w: '', st: {}, hp: sheetHp() }))
  const fullKey = st => JSON.stringify([stripPortrait(st), cleanPortrait(st && st.portrait)])
  /** Патч токена: аркуш і, якщо портрет змінився, портрет (undefined — прибрати ключ); одним updateItems. */
  function itemPatch(packed, p) {
    const patch = { [K.sheet]: packed }
    if (p !== tokP) patch[K.portrait] = p || undefined
    return patch
  }
  /** Портрет, який піде на токен: завеликий (bigP) — жодного. */
  const tokenP = st => { const p = cleanPortrait(st && st.portrait); return p && p === bigP ? null : p }
  /**
   * Підготувати запис стану: {r, packed, p} або null, якщо не влазить сам аркуш (тоді — помилка, нічого не пишемо).
   * Не влазить лише портрет — правка все одно пишеться, без портрета, з одним попередженням на портрет.
   */
  function prepare(st) {
    const r = nextR(myR, regOf(cid))
    const packed = packSheet({ cid, r, w: myW, st, hp: sheetHp() })
    let p = tokenP(st)
    if (!itemFits(packed, owner, p)) {
      if (!p || !itemFits(packed, owner, null)) {
        ui('error', { code: 'too-big', bytes: itemBytes(packed, owner, null), max: ITEM_MAX })
        return null
      }
      bigP = p
      ui('error', { code: 'too-big', bytes: itemBytes(packed, owner, p), max: ITEM_MAX, portrait: true })
      p = null
    }
    return { r, packed, p }
  }

  function regPatch(reg) {
    const val = regUpdate(reg, cid, myR)
    const b = roomBytes(room, { [K.reg]: val })
    if (b > ROOM_MAX) { const e = new Error('room-full'); e.bytes = b; throw e }
    return { [K.reg]: val }
  }
  function writeReg() {
    regTimer = null; regDirty = false
    const c = cid, r = myR
    W.writeRoom({
      [K.reg]: async () => {
        const fresh = (await OBR.room.getMetadata()) || {}
        const val = regUpdate(fresh[K.reg], c, r)
        const b = roomBytes(fresh, { [K.reg]: val })
        if (b > ROOM_MAX) { ui('error', { code: 'room-full', bytes: b, max: ROOM_MAX }); return fresh[K.reg] || {} }
        return val
      },
    })
  }
  function scheduleReg() {
    regDirty = true
    if (regTimer) clearT(regTimer)
    regTimer = setT(writeReg, regDelay)
  }

  /** Записати стан аркуша на токен (і в кеш). force — навіть якщо стан не змінився. */
  function commit(st, force = false) {
    if (!st || !cid) return false
    const key = keyOf(st)
    // самі лише ОЗ для смужки (без правки) дописуються тільки в незастарілу копію: інакше відкриття старої копії
    // писало б її на токен і піднімало реєстр над новішою версією (ревізор, 2026-11-27)
    if (key === lastKey && tokenP(st) === tokP && (stale || hpKey() === tokHp) && !force) return false
    const w = prepare(st)
    if (!w) return false
    const { r, packed, p } = w
    myR = r; lastKey = key; tokHp = hpKeyOf(packed)
    cachePut(storage, cid, { r, st }, now())
    W.writeItem(itemId, itemPatch(packed, p))
    tokP = p
    scheduleReg()
    return true
  }

  function pushToSheet(st) {
    if (!win) return
    myVer++
    win.CG_SET(st, myVer)
  }

  async function boot(init) {
    win = null   // аркуш не завантажився — старого вікна теж немає (srcdoc уже замінено)
    win = await sheet.boot(init, { gm })
    const set = roomSet()
    let cur = win.CG_GET()
    if (set && cur && !sameSet(pickSet(cur), set)) { cur = applySet(cur, set); pushToSheet(cur) }
    lastSet = pickSet(cur)
    try {
      const t = await OBR.theme.getTheme()
      win.CG_THEME(t && t.mode === 'DARK')
      unsub.push(OBR.theme.onChange(t => win && win.CG_THEME(t && t.mode === 'DARK')))
    } catch { /* тема необов'язкова */ }
    return cur
  }

  function listen() {
    unsub.push(OBR.scene.items.onChange(onItems))
    unsub.push(OBR.room.onMetadataChange(onRoom))
  }

  async function open(meta) {
    cid = meta.cid; myR = meta.r; landedR = meta.r
    const cache = cacheGet(storage, cid)
    const regR = regOf(cid)
    const s = staleness(meta.r, regR, cache ? cache.r : undefined)
    let st, took = false
    if (s === 'cache') { st = cache.st; took = true }
    else st = withPortrait(meta.st, tokP)   // портрет — з токена; кеш браузера його не домішує
    lastKey = took ? '' : keyOf(meta.st)
    const cur = await boot(applySet(st, roomSet()))
    if (took) { commit(cur, true); ui('took-cache', { r: myR }) }
    else if (s === 'stale') { stale = regR; ui('stale', { r: regR }) }
    listen()
    ui('open', { cid, r: myR })
  }

  async function start() {
    const [id, name, role] = await Promise.all([OBR.player.getId(), OBR.player.getName(), OBR.player.getRole()])
    me = { id, name, role }; gm = role === 'GM'
    const [item] = await OBR.scene.items.getItems([itemId])
    if (!item) { ui('error', { code: 'no-item' }); return 'no-item' }
    // ворожий токен (етап 4, блокер радника 4): аркуш на ньому не відкривається й не пишеться
    if (hasEnemy(item.metadata)) { ui('error', { code: 'enemy' }); return 'enemy' }
    // караван-токен (автор, 2026-11-27, B): теж не персонаж
    if (isCaravanToken(item.metadata)) { ui('error', { code: 'caravan' }); return 'caravan' }
    owner = item.metadata[K.owner] || null
    const a = access(owner, me)
    if (a === 'other' || a === 'unassigned') { ui('not-yours', { n: (owner && owner.n) || '' }); return 'not-yours' }
    room = (await OBR.room.getMetadata()) || {}
    if (a === 'name') { ui('confirm-owner', { n: owner.n }); return 'confirm-owner' }
    return afterAccess(item)
  }

  async function afterAccess(item) {
    tokP = cleanPortrait(item.metadata[K.portrait])
    tokHp = hpKeyOf(item.metadata[K.sheet])
    const meta = unpackSheet(item.metadata[K.sheet])
    if (!meta) { ui('choose', { cached: cacheList(storage) }); return 'choose' }
    await open(meta)
    return 'open'
  }

  /** «Так, це я» / «Ні». */
  async function confirmOwner(yes) {
    if (!yes) { ui('not-yours', { n: owner.n }); return 'not-yours' }
    owner = claimOwner(owner, me)
    W.writeItem(itemId, { [K.owner]: owner })
    const [item] = await OBR.scene.items.getItems([itemId])
    if (!item) { ui('error', { code: 'no-item' }); return 'no-item' }
    return afterAccess(item)
  }

  /**
   * Вибір для токена без аркуша: {kind:'blank'|'random'|'json'} або {kind:'cache', cid}.
   * Для 'json' повертає вікно аркуша: сторінка віддає файл у його #f-open, аркуш сам перевірить форму й надішле state.
   */
  async function choose(choice) {
    // поки вікно вибору було відкрите, токен могли зробити ворогом чи караваном (ревізор, 2026-11-27)
    const [now] = await OBR.scene.items.getItems([itemId])
    if (now && hasEnemy(now.metadata)) { ui('error', { code: 'enemy' }); return null }
    if (now && isCaravanToken(now.metadata)) { ui('error', { code: 'caravan' }); return null }
    let init
    if (choice.kind === 'cache') {
      const c = cacheGet(storage, choice.cid)
      if (!c) { ui('choose', { cached: cacheList(storage) }); return null }
      cid = choice.cid; myR = Math.max(c.r || 0, regOf(cid)); init = c.st
    } else {
      cid = newCid(rand); myR = 0
      init = choice.kind === 'random' ? null : {}
    }
    const cur = await boot(init ? applySet(init, roomSet()) : null)
    // .json: пишемо лише тоді, коли стан аркуша відрізнився від чистого (файл прийнято або гравець почав правити);
    // невдалий файл не лишає на токені порожнього персонажа
    if (choice.kind === 'json') waitFile = fullKey(cur)
    else commit(cur, true)
    listen()
    ui('open', { cid, r: myR })
    return win
  }

  /** «Зробити окремим персонажем»: новий cid, нумерація з 1. */
  function detach() {
    if (!win) return
    cid = newCid(rand); myR = 0; stale = 0; waitFile = null
    commit(win.CG_GET(), true)
    ui('detached', { cid })
  }

  /** Повідомлення від аркуша ({cg, data, ver}, як parent.postMessage мосту). */
  function onMessage(m) {
    if (!m || closed || blocked || m.cg !== 'state' || !win) return
    if ((m.ver || 0) < myVer) return            // стан, надісланий до того, як аркуш отримав новіший від нас
    const st = m.data
    if (waitFile !== null) {
      if (fullKey(st) === waitFile) return   // аркуш лише переслав свій чистий стан (після старту), файла ще не прийнято
      waitFile = null
    }
    commit(st)
    if (gm) {
      const s = pickSet(st)
      if (!lastSet || !sameSet(s, lastSet)) {
        lastSet = s
        const b = roomBytes(room, { [K.set]: s })
        if (b > ROOM_MAX) ui('error', { code: 'room-full', bytes: b, max: ROOM_MAX })
        else { room = { ...room, [K.set]: s }; W.writeRoom({ [K.set]: s }) }
      }
    }
  }

  function onItems(items) {
    if (closed || !win) return
    const it = items.find(x => x.id === itemId)
    if (!it) { ui('error', { code: 'item-gone' }); return }
    owner = it.metadata[K.owner] || null
    const a = access(owner, me)
    if (a === 'other' || a === 'unassigned') { if (!blocked) { blocked = true; ui('not-yours', { n: (owner && owner.n) || '' }) } return }
    if (blocked) { blocked = false; ui('open', { cid, r: myR }) }
    const meta = unpackSheet(it.metadata[K.sheet])
    // мій запис ще в черзі, а токен показує старішу зміну того ж персонажа (onChange Owlbear приходить і на чужі
    // предмети): це не новина, а знімок до мого запису — не відкочувати аркуш і не вірити старому портрету
    if (meta && meta.cid === cid && meta.r < myR && landedR < myR) return
    if (meta) landedR = Math.max(landedR, meta.r)
    tokP = cleanPortrait(it.metadata[K.portrait])   // ще до відлуння: вкладка має знати, що зараз лежить на токені
    tokHp = hpKeyOf(it.metadata[K.sheet])
    if (!meta || isEcho(meta, myW, myR)) return
    const key = JSON.stringify(meta.st)
    const cur = win.CG_GET() || {}
    if (key === lastKey && meta.cid === cid && cleanPortrait(cur.portrait) === tokP) { myR = Math.max(myR, meta.r); return }
    cid = meta.cid; myR = Math.max(myR, meta.r); lastKey = key
    const full = withPortrait(meta.st, tokP)
    cachePut(storage, cid, { r: meta.r, st: full }, now())
    pushToSheet(full)
  }

  function onRoom(m) {
    room = m || {}
    const set = roomSet()
    if (!set || !win) return
    const cur = win.CG_GET()
    if (cur && !sameSet(pickSet(cur), set)) { lastSet = pickSet(applySet(cur, set)); pushToSheet(applySet(cur, set)) }
  }

  /** pagehide / visibilitychange:hidden — дописати незаписане одразу, без черги. */
  function closing() {
    if (!win || !cid || blocked || typeof win.CG_GET !== 'function') return
    const extra = []
    const st = win.CG_GET()
    const w = st && (keyOf(st) !== lastKey || tokenP(st) !== tokP || (!stale && hpKey() !== tokHp)) && !(waitFile !== null && fullKey(st) === waitFile) ? prepare(st) : null
    if (w) {
      const { r, packed, p } = w
      {
        myR = r; lastKey = keyOf(st); tokHp = hpKeyOf(packed)
        cachePut(storage, cid, { r, st }, now())
        extra.push([itemId, itemPatch(packed, p)])
        tokP = p
        regDirty = true
      }
    }
    if (regDirty) {
      if (regTimer) { clearT(regTimer); regTimer = null }
      try { extra.push(['room', regPatch(room[K.reg])]); regDirty = false } catch { /* кімната повна: реєстр не пишемо */ }
    }
    W.flushNow(extra)
  }

  function dispose() {
    closed = true
    if (regTimer) { clearT(regTimer); regTimer = null }
    unsub.splice(0).forEach(f => { try { typeof f === 'function' && f() } catch { /* ок */ } })
  }

  return {
    start, confirmOwner, choose, detach, onMessage, closing, dispose,
    get cid() { return cid }, get r() { return myR }, get w() { return myW }, get stale() { return stale }, get gm() { return gm },
    get win() { return win }, writer: W,
  }
}
