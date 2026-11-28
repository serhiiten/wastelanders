// Пустельники в Owlbear Rodeo: картка ворога на токені — контролер запису, без DOM (етап 4, рядок 4.8).
// Пише лише Доглядач, через ту саму чергу, що й аркуш (writer.mjs): номер зміни r, id вкладки w; останній запис перемагає.
// Гонка (вердикт радника, блокер 5; правило аркуша, host.mjs onItems): onChange Owlbear приходить і на чужі зміни
// предметів (гравець тягне токен), і несе metadata, якими вони були до мого запису з черги. Тож стан того самого
// токена з r нижчим за мій ще не записаний пропускається; стан прив'язаний до id токена; перехід на інший токен
// (bind) і закриття (leave) спершу чекають flush черги.
//
// state = {itemId, kind, rec, label, hidden}:
//   kind 'ok' — rec = unpackEnemy(...) ({src, name, e, o, book, r, w}); 'bad' — запис є, але не читається (4.15);
//   'none' — на токені немає ворога (зняли деінде); 'gone' — токена вже немає на сцені; '' — ще не прив'язано.
import { createWriter, isRateLimit } from './writer.mjs'
import { bytes } from './store.mjs'
import { K_ENEMY, isCharacter, labelOf } from './enemy-bar.mjs'
import { ENEMY_MAX, unpackEnemy, withSystem } from './enemy-data.mjs'

const wid = rand => 'e' + Math.floor(rand() * 2 ** 32).toString(36) + Math.floor(rand() * 2 ** 32).toString(36)

export function createEnemyCtl({ OBR, writer, onState = () => {}, onError = () => {}, rand = Math.random, timers = {} }) {
  const W = writer || createWriter({ OBR, timers, onError: e => onError(e) })
  const myW = wid(rand)
  let itemId = '', myR = 0, landedR = 0, closed = false, gen = 0
  let state = { itemId: '', kind: '', rec: null, label: '', hidden: false }
  const emit = () => { try { onState(state) } catch (e) { console.error(e) } }

  /** Стан токена з предмета Owlbear (без гонки: це робить onItems). */
  function read(it) {
    if (!it) return { itemId, kind: 'gone', rec: null, label: state.label, hidden: false }
    const meta = it.metadata || {}
    const base = { itemId: it.id, label: labelOf(it), hidden: it.visible === false }
    if (isCharacter(meta) || meta[K_ENEMY] === undefined) return { ...base, kind: 'none', rec: null }
    const rec = unpackEnemy(meta)
    return rec ? { ...base, kind: 'ok', rec } : { ...base, kind: 'bad', rec: null }
  }

  /** Прив'язати картку до токена: спершу дописати чергу попереднього, нумерацію почати з того, що лежить на токені. */
  async function bind(id) {
    const g = ++gen
    await W.flush()
    if (g !== gen) return state   // два швидкі кліки: важить лише останній (стан прив'язаний до id, блокер 5)
    itemId = id; myR = 0; landedR = 0
    const [it] = await OBR.scene.items.getItems([id])
    if (g !== gen) return state
    state = it ? read(it) : { itemId: id, kind: 'gone', rec: null, label: '', hidden: false }
    if (state.rec) { myR = state.rec.r; landedR = state.rec.r }
    emit()
    return state
  }

  /** Записати новий запис ворога (без r / w: їх ставить контролер). → чи пішов запис. */
  function put(raw) {
    if (closed || !itemId || !raw || typeof raw !== 'object') return false
    const r = Math.max(myR, landedR) + 1
    const val = { ...raw, r, w: myW }
    if (bytes(val) > ENEMY_MAX) { onError(Object.assign(new Error('too-big'), { code: 'too-big', bytes: bytes(val), max: ENEMY_MAX })); return false }
    const rec = unpackEnemy({ [K_ENEMY]: val })
    if (!rec) return false
    myR = r
    W.writeItem(itemId, { [K_ENEMY]: val })
    state = { ...state, kind: 'ok', rec }
    emit()
    return true
  }

  /**
   * «Редагувати» з новою назвою: підпис токена стає новою назвою, хай який був — і свій підпис Доглядача («Вертиберд 2»),
   * і порожній (автор, 2026-11-28, п.6 фідбеку: остання зміна перемагає; замінює «лише якщо дорівнював старій» 2026-11-27).
   * Перейменування самого токена в Owlbear пізніше — теж остання зміна: картка показує підпис. RICH-текст не чіпаємо.
   * Окремий запис після черги (writer пише лише metadata). from — стара назва: та сама назва — нічого не пишемо.
   */
  async function relabel(from, to, { wait = ms => new Promise(ok => (timers.setTimeout || setTimeout)(ok, ms)) } = {}) {
    from = String(from || '').trim(); to = String(to || '').trim()
    if (closed || !itemId || !from || !to || from === to) return false
    const id = itemId
    await W.flush()
    let done = false
    const fix = ds => { for (const d of ds) {
      const t = d.text
      if (t && typeof t.plainText === 'string' && (t.type === undefined || t.type === 'PLAIN')) { if (t.plainText !== to) t.plainText = to; done = true }
    } }
    for (const ms of [0, 500, 1000]) {
      if (ms) await wait(ms)
      try { await OBR.scene.items.updateItems([id], fix); return done } catch (e) { if (!isRateLimit(e)) { onError(e); return false } }
    }
    return false
  }

  /** Змінити system ворога: fn(e) отримує копію й змінює її (або повертає нову). ОЗ, набої, позначки, правки. */
  function change(fn) {
    if (state.kind !== 'ok' || !state.rec) return false
    const e = structuredClone(state.rec.e)
    const next = fn(e) || e
    const raw = withSystem(state.rec, next, { r: 0, w: '' })
    if (!raw) { onError(Object.assign(new Error('too-big'), { code: 'too-big', max: ENEMY_MAX })); return false }
    const { r: _r, w: _w, ...rest } = raw
    return put(rest)
  }

  /** scene.items.onChange: усі предмети сцени. */
  function onItems(items) {
    if (closed || !itemId) return
    const it = (items || []).find(x => x.id === itemId)
    const s = read(it)
    if (s.kind === 'ok') {
      // мій запис ще в черзі, а токен показує старішу зміну: це знімок до мого запису (рух токена гравцем), не новина
      if (s.rec.r < myR && landedR < myR) {
        if (s.label !== state.label || s.hidden !== state.hidden) { state = { ...state, label: s.label, hidden: s.hidden }; emit() }
        return
      }
      landedR = Math.max(landedR, s.rec.r)
      // той самий запис, що вже показаний (власне відлуння чи чужий рух предметів сцени): картку не перебудовувати.
      // Мій старіший запис після того, як усе моє записано, — не відлуння, а Ctrl+Z Доглядача (живий захід 2026-11-27):
      // його показати, як і запис, що повернувся на токен після «Зняти ворога».
      if (state.kind === 'ok' && state.rec && s.rec.r === state.rec.r && s.rec.w === state.rec.w) {
        if (s.label !== state.label || s.hidden !== state.hidden) { state = { ...state, label: s.label, hidden: s.hidden }; emit() }
        return
      }
      myR = Math.max(myR, s.rec.r)
    }
    state = s
    emit()
  }

  let unsub = null
  function listen() { if (!unsub) unsub = OBR.scene.items.onChange(onItems) }

  /** ✕, Esc, «‹ До списку»: дочекатися, поки черга запише все. */
  const leave = () => W.flush()
  /** Закриття вкладки: дописати чергу одразу, без паузи. */
  const closing = () => W.flushNow()
  function dispose() { closed = true; if (unsub) { try { unsub() } catch { /* ок */ } unsub = null } }

  return {
    bind, put, change, relabel, onItems, listen, leave, closing, dispose,
    get state() { return state }, get r() { return myR }, get w() { return myW }, writer: W,
  }
}
