// Пустельники в Owlbear Rodeo: читання й запис лічильників у room metadata (сесія Б, автор 2026-11-27), без DOM.
// Сторінка ext/counters.mjs дає OBR і ui(kind, data). Вердикт радника 2026-11-27 (блокери 1, 2, 5, 6, 7):
// - одна стала job на ключ: writer тримає одне значення на ключ, тож кожен клік — дія в списку acts, а job бере свіжий
//   стан кімнати й застосовує всі дії по черзі; список чиститься лише після підтвердження запису;
// - підтвердження — відлуння w + r в onMetadataChange або перевірка через verifyDelay; лише тоді журнал (broadcast 'ctr');
// - нечитний запис не затирається, доки Доглядач не натисне «Почати наново» (дія clear);
// - seq: старіший результат розпакування не перекриває новіший; той самий запис (r, w, z) не розпаковується вдруге.
//
// ui: 'state' {list, usage, bad, newer} | 'error' {code: 'bad' | 'too-big' {pct} | 'write-failed' {msg} | 'not-saved' | 'gone' | 'full'}
import { createWriter, SKIP } from './writer.mjs'
import { newCid } from './store.mjs'
import { K_CTR, unpackCounters, packCounters, applyActions, onlySteps, fits, usage } from './counters-data.mjs'
import { sendRoll } from './rolls.mjs'

const sameRec = (a, b) => !!a && !!b && a.r === b.r && a.w === b.w && a.z === b.z

export function createCountersHost({ OBR, gm = false, ui = () => {}, writer, timers = {}, rand = Math.random, verifyDelay = 600 }) {
  const setT = timers.setTimeout || ((f, ms) => setTimeout(f, ms))
  const clearT = timers.clearTimeout || (t => clearTimeout(t))
  const myW = newCid(rand)
  const W = writer || createWriter({ OBR, timers, onError: (e, target) => { if (target === 'room') failed(e) } })
  let acts = []          // дії Доглядача, ще не підтверджені кімнатою
  let inflight = null    // {r, n, changes, rec, list} — останній надісланий запис
  let state = { list: [], rec: null, bad: false, newer: false }
  let room = {}          // остання metadata кімнати (для бюджету)
  let seen = null        // останній розпакований запис {r, w, z}
  let seq = 0, maxR = 0, closed = false, verifyT = null
  const unsub = []

  const emit = () => ui('state', { list: state.list, usage: usage(state.rec, room), bad: state.bad, newer: state.newer })

  function failed(e) {
    // дії цього запису (чи всі, якщо job упала ще до запису) знімаються: людина бачить помилку й натискає знову (ревізор, Д2)
    acts.splice(0, inflight ? inflight.n : acts.length); inflight = null
    ui('error', { code: 'write-failed', msg: String((e && (e.message || (e.error && e.error.message))) || e) })
    emit()
  }

  /** Запис підтверджено: дії з нього зняти, журнал — по одному запису на кожну поділку. */
  function confirm() {
    const f = inflight
    if (!f) return
    inflight = null
    if (verifyT) { clearT(verifyT); verifyT = null }
    acts.splice(0, f.n)
    seq++   // чуже розпакування, що ще йде, старіше за це відлуння
    seen = f.rec; state = { list: f.list, rec: f.rec, bad: false, newer: false }
    room = { ...room, [K_CTR]: f.rec }
    emit()
    for (const ch of f.changes) {
      const id = newCid(rand) + newCid(rand)
      Promise.resolve(sendRoll(OBR, 'ctr', { name: ch.name, from: ch.from, to: ch.to, s: ch.s, desc: ch.desc }, { who: '', id })).catch(e => console.error(e))
    }
    if (acts.length) schedule()
  }

  function schedule() { if (!closed && gm) W.writeRoom({ [K_CTR]: job }) }

  /** Обчислюється перед самим записом і наново після «Too many requests» (writer.mjs). */
  async function job() {
    if (closed || !gm) return SKIP
    const fresh = (await OBR.room.getMetadata()) || {}
    room = fresh
    const m = fresh[K_CTR]
    if (inflight) {
      if (m && m.w === myW && m.r === inflight.r) confirm()   // попередній запис уже в кімнаті
      else inflight = null                                    // не дійшов (повтор після відмови): рахуємо все наново
    }
    if (!acts.length) return SKIP
    const take = acts.slice()
    const clearing = take.some(a => a && a.t === 'clear')
    const d = await unpackCounters(m)
    if (d && d.bad && !clearing) { ui('error', { code: 'bad' }); return SKIP }   // нечитне не затираємо (блокер 6)
    if (d && !d.bad) maxR = Math.max(maxR, d.r)
    const base = d && !d.bad ? d.list : []
    const { list, changes, errs } = applyActions(base, take)
    for (const e of new Set(errs)) if (e === 'gone' || e === 'full') ui('error', { code: e })
    if (JSON.stringify(list) === JSON.stringify(base) && !(d && d.bad)) { acts.splice(0, take.length); emit(); return SKIP }
    const r = Math.min(Number.MAX_SAFE_INTEGER - 1, Math.max(maxR, d && !d.bad ? d.r : 0) + 1)
    const rec = await packCounters({ r, w: myW, list })
    if (!fits(rec, fresh, onlySteps(take))) {
      acts.splice(0, take.length)
      ui('error', { code: 'too-big', pct: usage(rec, fresh).pct })
      emit()
      return SKIP
    }
    maxR = r
    inflight = { r, n: take.length, changes, rec, list }
    if (verifyT) clearT(verifyT)
    verifyT = setT(verify, verifyDelay)
    return rec
  }

  /** Свій запис мав з'явитися в кімнаті; ні — він мовчки не відбувся (етап 0: запис понад ліміт іноді тихо губиться). */
  async function verify() {
    verifyT = null
    if (closed || !inflight) return
    try {
      const m = ((await OBR.room.getMetadata()) || {})[K_CTR]
      if (!inflight) return
      if (m && m.w === myW && m.r === inflight.r) return confirm()
      // кімната має щось інше: свій запис не дійшов або його вже переписала інша вкладка — клік губиться (як у каравану,
      // Owlbear не має «запиши, якщо не змінилося»), людина бачить це й натискає ще раз
      acts.splice(0, inflight.n); inflight = null
      ui('error', { code: 'not-saved' })
      await take(m)
    } catch { /* перевірка необов'язкова */ }
  }

  /** Запис кімнати → стан (відлуння свого — підтвердження). */
  async function take(m) {
    if (closed) return
    if (inflight && m && m.w === myW && m.r === inflight.r) return confirm()
    if (m && seen && sameRec(m, seen)) return
    if (m === undefined || m === null) {
      if (!seen && !state.bad && state.list.length === 0) return
      seen = null; seq++; state = { list: [], rec: null, bad: false, newer: false }; return emit()
    }
    const my = ++seq
    const d = await unpackCounters(m, { withDesc: gm })
    if (my !== seq || closed) return
    seen = m
    if (!d || d.bad) state = { list: [], rec: m, bad: true, newer: !!(d && d.newer) }
    else { maxR = Math.max(maxR, d.r); state = { list: d.list, rec: m, bad: false, newer: false } }
    emit()
  }

  return {
    get myW() { return myW },
    get list() { return state.list },
    get bad() { return state.bad },
    async start() {
      room = (await OBR.room.getMetadata()) || {}
      await take(room[K_CTR])
      if (!seen) emit()
      unsub.push(OBR.room.onMetadataChange(meta => {
        room = meta || {}
        take(room[K_CTR]).catch(e => console.error(e))
        if (!inflight) emit()   // бюджет міг змінитися від чужих ключів
      }))
    },
    /** Дія Доглядача (див. counters-data.mjs, applyActions). Гравцеві — нічого. */
    act(a) {
      if (!gm || closed) return false
      if (state.bad && a.t !== 'clear') { ui('error', { code: 'bad' }); return false }
      acts.push(a)
      schedule()
      return true
    },
    /** Що побачить людина, поки запис іде: список з усіма ще не підтвердженими діями поверх кімнати. */
    preview() { return applyActions(state.list, acts).list },
    close() {
      closed = true
      if (verifyT) clearT(verifyT)
      for (const f of unsub) { try { typeof f === 'function' && f() } catch { /* ок */ } }
    },
  }
}
