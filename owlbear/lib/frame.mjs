// Пустельники в Owlbear Rodeo: завантажити аркуш у iframe через srcdoc і дочекатися, поки його міст готовий. Без глобалів DOM.
// Вада В2 (2026-11-27): load iframe ще не означає, що аркуш живий: міст cg_build.py міг упасти до window.CG_GET,
// а load буває й від порожнього about:blank раніше за srcdoc. Тут чекаємо саме CG_GET і пробуємо ще раз, перш ніж здатися.

/** Вікно аркуша готове: міст cg_build.py визначив свої функції. */
export const sheetReady = w => { try { return !!w && typeof w.CG_GET === 'function' && typeof w.CG_SET === 'function' } catch { return false } }

/** Вікно показує саме srcdoc, а не порожній about:blank (у фейку без location — так). */
const isSrcdoc = w => { try { const h = w && w.location && w.location.href; return !h || h === 'about:srcdoc' } catch { return true } }

/**
 * frame — iframe (або фейк з onload / srcdoc / contentWindow); doc — HTML для srcdoc.
 * Спроба: поставити srcdoc і чекати sheetReady (перевірка кожні `step` мс) до `settle` мс після останнього load
 * (load від about:blank не завершує спробу) або `loadTimeout` мс, якщо load не прийшов зовсім.
 * Не вдалося за `tries` спроб → помилка з code 'sheet-not-ready'. → Promise<window аркуша>.
 */
export async function bootFrame(frame, doc, { tries = 2, loadTimeout = 20000, settle = 1500, step = 50, now = () => Date.now(), wait = ms => new Promise(ok => setTimeout(ok, ms)) } = {}) {
  for (let i = 0; i < tries; i++) {
    let loadedAt = 0
    frame.onload = () => { if (isSrcdoc(frame.contentWindow)) loadedAt = now() }   // load від about:blank спробу не завершує
    const t0 = now()
    frame.srcdoc = doc
    for (;;) {
      if (sheetReady(frame.contentWindow)) { frame.onload = null; return frame.contentWindow }
      const t = now()
      if (loadedAt ? t - loadedAt >= settle : t - t0 >= loadTimeout) break
      await wait(step)
    }
    frame.onload = null
  }
  const e = new Error('sheet-not-ready')
  e.code = 'sheet-not-ready'
  throw e
}
