// Пустельники в Owlbear Rodeo: тло стежить за віконцем лічильників (сесія Б, автор 2026-11-27). Без DOM.
// Віконце є в усіх, поки в кімнаті є хоч один лічильник (Доглядачу — і коли запис не читається: там «Почати наново»).
// Вердикт радника (блокери 8, 9): один стан «має бути відкрите?», виклики в ланцюжку по одному; живе вікно ніколи не
// відкривається вдруге; пульс CTR_ALIVE — Owlbear сам закриває наші вікна; тло закриває віконце лише гравцям (Доглядач
// міг відкрити порожнє з меню, щоб створити перший лічильник, — його сторінка закривається сама).
import { K_CTR, unpackCounters } from './counters-data.mjs'
import { ID, session, ctrSet, ctrOpen, ctrGone, openCounters } from './pick.mjs'

/** Чи має бути віконце: d — результат unpackCounters (без описів) або null. */
export const wantCounters = (d, gm) => !!d && (d.bad ? gm : d.list.length > 0)

/** → функція «зупинити». every — як часто перевіряти пульс віконця. */
export function followCounters(OBR, base, { gm = false, ss = session(), every = 1000, setI = setInterval, clearI = clearInterval } = {}) {
  let want = false, seen = undefined, chain = Promise.resolve(), stopped = false
  const queue = f => { chain = chain.then(f).catch(e => console.error(e)); return chain }

  async function decide(meta) {
    const m = (meta || {})[K_CTR]
    const key = m === undefined || m === null ? '' : JSON.stringify(m)
    if (key === seen) return   // той самий запис (зміни каравану й реєстру сюди теж стріляють)
    seen = key
    want = wantCounters(await unpackCounters(m, { withDesc: false }), gm)
    ctrSet(want, ss)   // вузькі вікна біля лівого краю стають під віконце (pick.mjs, narrowBox)
  }
  async function sync() {
    if (stopped) return
    if (want && !ctrOpen(ss)) await openCounters(OBR, base, { ss })
    else if (!want && !gm && ctrOpen(ss)) { ctrGone(ss); await Promise.resolve(OBR.popover.close(ID.counters)).catch(() => {}) }
  }

  // сторінку Owlbear перезавантажили (F5): старий пульс і позначка цієї вкладки вже нічого не значать
  ctrGone(ss); ctrSet(false, ss)
  const off = []
  queue(async () => { await decide(await OBR.room.getMetadata()); await sync() })
  off.push(OBR.room.onMetadataChange(meta => queue(async () => { await decide(meta); await sync() })))
  const t = setI(() => queue(sync), every)
  return () => { stopped = true; clearI(t); for (const f of off) { try { typeof f === 'function' && f() } catch { /* ок */ } } }
}
