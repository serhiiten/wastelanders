// Пустельники в Owlbear Rodeo: «Ходи Доглядача» (автор, 2026-11-28, фідбек п.8). Без DOM.
// Кнопка — вигляд А з макетів (червона табличка «Ходи», як у Foundry) ліворуч від круглої стрілки Owlbear; вікно —
// вигляд Б (вікно розширення з ✕ у темі Owlbear). Макети: https://claude.ai/artifact/3Di1xnfjapWurNMSMYiSGr.
// Табличка — маленьке вікно розширення, яке відкриває тло лише Доглядачу (гравці її не бачать); вікно ходів — popover
// без disableClickAway: клік поза ним закриває його сам Owlbear. Повторний клік по табличці теж згортає, Esc і ✕ — теж.
// Owlbear сам закриває наші вікна (після зміни розміру вікна браузера), тож обидві сторінки щосекунди пишуть пульс.
import { ID, SAFE, ALIVE_MS, session, watchResize } from './pick.mjs'

// Живий замір 2026-11-28 (в'юпорт 2246×1208): кругла стрілка Owlbear x W−60…W−20, y 8–48; колонка інструментів
// x W−64…W−16, y 56–432. Табличка стоїть у тому ж ряду, що стрілка, і її правий край — на SAFE.right (там же, де правий
// край вузьких вікон біля правого краю), тож до стрілки 20 px. Вікно ходів — під табличкою, правий край той самий.
export const BTN = { width: 96, height: 40, top: 8 }
// вогник — як fa-fire на табличці Foundry, власним контуром (без шрифту іконок); колір — currentColor
export const FIRE_D = 'M12 2c.6 3.2-1 5.2-2.6 7C7.8 10.8 6 12.7 6 15.5 6 19 8.7 22 12 22s6-3 6-6.5c0-2.6-1.3-4.4-2.6-5.8-.2 1.6-.9 2.8-2 3.4.4-3.7-.6-8.2-1.4-11.1z'
/** Значок вогника як DOM-вузол (без вставки HTML рядком). */
export function fire(doc) {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = doc.createElementNS(NS, 'svg'), path = doc.createElementNS(NS, 'path')
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'currentColor'); svg.setAttribute('aria-hidden', 'true')
  path.setAttribute('d', FIRE_D)
  svg.append(path)
  return svg
}

/** Тіло вікна ходів з даних d (doc — document сторінки; текст лише textContent, HTML рядком не вставляється). */
export function buildMoves(doc, body, d) {
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e }
  const list = items => { const ul = el('ul'); for (const it of items) ul.append(it); return ul }
  body.append(el('div', 'hd', d.heads[0]), list(d.when.map(t => el('li', '', t))), el('div', 'hd', d.heads[1]))
  for (const g of d.groups) {
    body.append(el('div', 'grp', g.title), list(g.moves.map(([name, rule]) => { const li = el('li'); li.append(el('b', '', name)); if (rule) li.append(' ' + rule); return li })))
  }
  body.append(el('p', 'note', d.note))
}
export const WIN = { width: 460, top: 56, bottom: 16, height: 900 }   // текст ходів ~875 px: на 2007×1083 і вище — без прокрутки
const pop = (left, top, width, height) => ({
  width, height, anchorReference: 'POSITION', anchorPosition: { left, top },
  anchorOrigin: { horizontal: 'LEFT', vertical: 'TOP' }, transformOrigin: { horizontal: 'LEFT', vertical: 'TOP' }, marginThreshold: 8,
})
/** Поля popover таблички на екрані vp = {width, height}; невідома ширина — null (не відкривати навмання). */
export function btnPopover(vp) {
  if (!(vp && vp.width > 0)) return null
  return { ...pop(vp.width - SAFE.right - BTN.width, BTN.top, BTN.width, BTN.height), disableClickAway: true }
}
/** Найвища висота вікна ходів: до низу екрана без WIN.bottom (вікно поверх усього, лоток теж накриває). */
export const winMaxH = vh => vh > 0 ? Math.max(200, Math.min(WIN.height, vh - WIN.top - WIN.bottom)) : WIN.height
/** Поля popover вікна ходів: під табличкою, той самий правий край. Без disableClickAway — клік повз закриває. */
export function winPopover(vp) {
  const w = WIN.width
  if (!(vp && vp.width > 0)) return { width: w, height: WIN.height }
  return pop(vp.width - SAFE.right - w, WIN.top, w, winMaxH(vp.height))
}

// пульси (sessionStorage вкладки: кадри одного походження в одній вкладці його ділять)
export const BTN_ALIVE = 'pust-obr-moves-btn-alive'
export const WIN_ALIVE = 'pust-obr-moves-alive'
export const WIN_SHUT = 'pust-obr-moves-shut'   // коли вікно ходів закрилося (pagehide)
const put = (ss, k, v) => { try { if (v === null) ss.removeItem(k); else ss.setItem(k, String(v)) } catch { /* ок */ } }
const num = (ss, k) => { try { return +ss.getItem(k) || 0 } catch { return 0 } }
export const pulse = (ss, k, now = Date.now()) => put(ss, k, now)
export const alive = (ss, k, now = Date.now()) => now - num(ss, k) < ALIVE_MS
// вікно ходів пише пульс частіше (кнопка міняє вигляд «відкрито» за ним), тож і мертвим вважається швидше
export const WIN_EVERY = 300, WIN_DEAD = 1200
export const winOpen = (ss, now = Date.now()) => { const t = num(ss, WIN_ALIVE); return t > 0 && now - t < WIN_DEAD }
export const winShut = (ss, now = Date.now()) => { put(ss, WIN_ALIVE, null); put(ss, WIN_SHUT, now) }

/**
 * Клік по табличці: відкрите вікно — закрити; щойно закрите цим самим кліком (Owlbear закрив його кліком повз, а клік
 * дійшов і до таблички) — нічого; інакше — відкрити. → 'close' | 'none' | 'open'.
 */
export const JUST_MS = 400
export function btnAction(ss, now = Date.now()) {
  if (winOpen(ss, now)) return 'close'
  const shut = num(ss, WIN_SHUT)
  if (shut > 0 && now - shut < JUST_MS) return 'none'
  return 'open'
}
export async function toggleMoves(OBR, base, { ss = session(), now = Date.now() } = {}) {
  const a = btnAction(ss, now)
  if (a === 'close') { winShut(ss, now); await Promise.resolve(OBR.popover.close(ID.moves)).catch(() => {}) }
  else if (a === 'open') {
    pulse(ss, WIN_ALIVE, now)   // до першого await: два швидкі кліки не відкривають двічі
    let vp = { width: 0, height: 0 }
    try { vp = { width: await OBR.viewport.getWidth(), height: await OBR.viewport.getHeight() } } catch { /* ок */ }
    await OBR.popover.open({ id: ID.moves, url: base + 'moves.html', ...winPopover(vp) })
  }
  return a
}

/**
 * Тло Доглядача: табличка є, поки роль — GM. Пульс сторінки таблички (BTN_ALIVE) не озивався ALIVE_MS — відкрити знову;
 * екран змінив розмір — табличку на нове місце (перевідкрити: сторінка без стану), вікно ходів — закрити.
 * getRole — async () => 'GM' | 'PLAYER'. → функція «зупинити».
 */
export function followMovesBtn(OBR, base, { getRole, ss = session(), every = 1000, setI = setInterval, clearI = clearInterval, watch = watchResize } = {}) {
  let chain = Promise.resolve(), stopped = false, shown = false, vpNow = null
  const queue = f => { chain = chain.then(f).catch(e => console.error(e)); return chain }
  const vpOf = async () => { try { return { width: await OBR.viewport.getWidth(), height: await OBR.viewport.getHeight() } } catch { return null } }
  async function sync(reopen = false) {
    if (stopped) return
    const gm = (await getRole()) === 'GM'
    if (!gm) {
      if (shown) { shown = false; put(ss, BTN_ALIVE, null); await Promise.resolve(OBR.popover.close(ID.movesBtn)).catch(() => {}); await Promise.resolve(OBR.popover.close(ID.moves)).catch(() => {}) }
      return
    }
    if (!reopen && shown && alive(ss, BTN_ALIVE)) return
    const vp = vpNow || await vpOf()
    const at = btnPopover(vp)
    if (!at) return
    if (reopen) await Promise.resolve(OBR.popover.close(ID.movesBtn)).catch(() => {})
    pulse(ss, BTN_ALIVE)   // сторінка щойно відкрита ще вантажиться
    shown = true
    await OBR.popover.open({ id: ID.movesBtn, url: base + 'moves-btn.html', ...at })
  }
  put(ss, BTN_ALIVE, null); put(ss, WIN_ALIVE, null)   // F5: старі пульси цієї вкладки нічого не значать
  queue(() => sync())
  const t = setI(() => queue(() => sync()), every)
  const stopWatch = watch(OBR, async vp => {
    const first = !vpNow, moved = !first && vpNow.width !== vp.width
    vpNow = vp
    if (!moved) return   // перший стійкий розмір — табличку вже поставлено за ним (sync); висота її місця не міняє
    queue(async () => {
      if (winOpen(ss)) { winShut(ss); await Promise.resolve(OBR.popover.close(ID.moves)).catch(() => {}) }
      await sync(true)
    })
  })
  return () => { stopped = true; clearI(t); try { stopWatch() } catch { /* ок */ } }
}
