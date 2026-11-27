// Пустельники в Owlbear Rodeo: одна черга записів на вкладку.
// Послідовно, не частіше ніж раз на `gap` мс (Owlbear пропускає ≈10 записів предметів за секунду, далі
// «Too many requests»); для кожної цілі (предмет чи кімната) й ключа пишеться лише найсвіжіше значення;
// «Too many requests» → повтор через 500 мс, 1 с, 2 с. Значення може бути функцією async () => value:
// її обчислюють перед самим записом (реєстр кімнати читає свіжі metadata).

/** Значення-функція може повернути SKIP: цей ключ не писати (порожній патч не надсилається зовсім). */
export const SKIP = Symbol('skip')

export const isRateLimit = e => /too many requests/i.test(String((e && (e.message || (e.error && e.error.message))) || e || ''))

/**
 * opts: OBR (scene.items.updateItems, room.setMetadata), gap, retries, onError(err, target),
 *       timers {setTimeout, now} (для тестів), decorate(item, patch, old) — дописати чернетку предмета в тому ж
 *       updateItems (old — значення ключів патча до запису; підпис героя, enemy-bar.mjs heroLabel).
 */
export function createWriter({ OBR, gap = 200, retries = [500, 1000, 2000], onError = () => {}, timers = {}, decorate = null } = {}) {
  const setT = timers.setTimeout || ((f, ms) => setTimeout(f, ms))
  const now = timers.now || (() => Date.now())
  const pending = new Map()   // target ('room' | itemId) → {key: value | fn}
  let running = false, last = -Infinity, idle = [], flushed = false
  let retrying = null   // [target, patch], поки запис чекає повтору після «Too many requests» (його вже немає в pending)
  const sleep = ms => new Promise(ok => setT(ok, ms))

  function put(target, patch) {
    flushed = false   // новий запис після flushNow: вкладка живе далі (сховали й показали знову), повтори знову дозволені
    pending.set(target, Object.assign(pending.get(target) || {}, patch))
    if (!running) run()
  }

  async function resolve(patch) {
    const out = {}
    for (const [k, v] of Object.entries(patch)) { const x = typeof v === 'function' ? await v() : v; if (x !== SKIP) out[k] = x }
    return out
  }

  function send(target, patch) {
    if (target === 'room') return OBR.room.setMetadata(patch)
    // значення undefined — прибрати ключ (справжній delete: undefined у metadata Owlbear не гарантує, що ключ зникне)
    return OBR.scene.items.updateItems([target], items => {
      for (const it of items) {
        const old = decorate ? Object.fromEntries(Object.keys(patch).map(k => [k, it.metadata[k]])) : null
        for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete it.metadata[k]; else it.metadata[k] = v }
        if (decorate) { try { decorate(it, patch, old) } catch (e) { console.error(e) } }   // підпис не вдався — сам запис іде
      }
    })
  }

  async function run() {
    running = true
    while (pending.size) {
      const target = pending.keys().next().value
      const wait = last + gap - now()
      if (wait > 0) await sleep(wait)
      const raw = pending.get(target)   // за час паузи могло прийти свіжіше значення
      pending.delete(target)
      if (!raw) continue                // flushNow уже записав
      let patch = raw   // без функцій — пишемо в тому ж такті, щоб flushNow не обігнав старіший запис
      const lazy = Object.values(raw).some(v => typeof v === 'function')
      if (lazy) {
        try { patch = await resolve(raw) } catch (e) { onError(e, target); continue }
      }
      for (let i = 0; ; i++) {
        if (!Object.keys(patch).length) break   // усі ключі SKIP — писати нічого
        last = now()
        try { await send(target, patch); break } catch (e) {
          if (isRateLimit(e) && i < retries.length) {
            retrying = [target, patch]
            await sleep(retries[i])
            retrying = null
            if (flushed) break   // flushNow уже надіслав і цей запис (В6 ревізора)
            // уже є новіше значення: старе не повторюємо окремо, а кладемо під нове (патчі часткові — ключ, якого
            // в новому немає, напр. портрет, інакше загубився б)
            if (pending.has(target)) { pending.set(target, { ...(lazy ? raw : patch), ...pending.get(target) }); break }
            // значення-функцію обчислюємо наново: за час паузи в кімнаті могли з'явитися новіші чужі записи (радник, етап 3)
            if (lazy) { try { patch = await resolve(raw) } catch (e) { onError(e, target); break } }
            continue
          }
          onError(e, target); break
        }
      }
    }
    running = false
    const w = idle; idle = []
    w.forEach(ok => ok())
  }

  return {
    writeItem: (itemId, patch) => put(itemId, patch),
    writeRoom: patch => put('room', patch),
    get busy() { return running || pending.size > 0 },
    /** Проміс, що виконується, коли черга порожня. */
    flush: () => (running || pending.size) ? new Promise(ok => idle.push(ok)) : Promise.resolve(),
    /**
     * Закриття вкладки: усе, що чекає, — одразу, без паузи й без await (етап 0: такий запис доходить).
     * Значення-функції тут не обчислюються, їх передають готовими в extra.
     */
    flushNow(extra = []) {
      flushed = true
      // запис, що чекає повтору (В6 ревізора, етап 4): закриття під час паузи не губить його; новіше значення лягає зверху
      if (retrying) { const [t, p] = retrying; pending.set(t, { ...p, ...(pending.get(t) || {}) }); retrying = null }
      const jobs = [...pending.entries()]; pending.clear()
      for (const [t, p] of extra) jobs.push([t, p])
      for (const [target, raw] of jobs) {
        const patch = {}
        for (const [k, v] of Object.entries(raw)) if (typeof v !== 'function') patch[k] = v
        if (!Object.keys(patch).length) continue
        try { Promise.resolve(send(target, patch)).catch(e => onError(e, target)) } catch (e) { onError(e, target) }
      }
    },
  }
}
