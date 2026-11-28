// «Швидкий старт» (сесія Б, автор 2026-11-27): що бачить роль і зміст для випадного списку. Без DOM.
// Доглядач — усі три журнали; гравець (і невідома роль) — лише «Швидкий старт: гравцям». Текст Доглядача лежить в
// окремому файлі й вантажиться лише для ролі GM (вердикт радника, 2026-11-27): гравцеві він навіть не приходить.
import { QS_PLAYERS } from './quickstart-player.mjs'

/** Журнали для ролі: [{name, pages: [{id, name, html}]}]. loadGm — як дістати журнали Доглядача (у тестах — підміна). */
export async function journalsFor(role, loadGm = async () => (await import('./quickstart-gm.mjs')).QS_GM) {
  return role === 'GM' ? [...QS_PLAYERS, ...(await loadGm())] : QS_PLAYERS
}

/** Зміст: [{journal, id, name}] у порядку тексту. */
export const tocOf = journals => journals.flatMap(j => j.pages.map(p => ({ journal: j.name, id: p.id, name: p.name })))

/** Коротка назва журналу для змісту («Гравцям», «Доглядачу», «Пригода»). */
export function shortJournal(name) {
  if (/гравцям$/.test(name)) return 'Гравцям'
  if (/Доглядачу$/.test(name)) return 'Доглядачу'
  return 'Пригода'
}

/**
 * Яка сторінка зараз угорі вікна: tops — [{id, top}] у порядку тексту (top — відстань від верху прокрутки),
 * scrollTop — прокрутка, pad — запас. Остання сторінка, чий верх уже вище за scrollTop + pad.
 */
export function currentPage(tops, scrollTop, pad = 24) {
  let cur = tops.length ? tops[0].id : ''
  for (const t of tops) { if (t.top <= scrollTop + pad) cur = t.id; else break }
  return cur
}

// ---- на весь екран (сесія А, автор 2026-11-28, п.5 фідбеку, макет А «Книжка») ----
/** id вікна «Швидкий старт» на весь екран (Owlbear modal fullScreen); вузьке вікно — ID.quick / ID.quickB у pick.mjs. */
export const QS_FULL = 'ua.pustelnyky.obr/quickstart-full'

/**
 * Місце в тексті, що переживає іншу ширину вікна: сторінка, на якій стоїть верх прокрутки, і частка від 0 до 1
 * всередині неї. tops — [{id, top}] у порядку тексту, end — висота всього тексту (кінець останньої сторінки).
 */
export function pageAnchor(tops, scrollTop, end) {
  const id = currentPage(tops, scrollTop, 0)
  const i = tops.findIndex(t => t.id === id)
  if (i < 0) return { id: '', frac: 0 }
  const from = tops[i].top, to = i + 1 < tops.length ? tops[i + 1].top : end
  const frac = to > from ? Math.min(1, Math.max(0, (scrollTop - from) / (to - from))) : 0
  return { id, frac: Math.round(frac * 1000) / 1000 }
}

/** Прокрутка для збереженого місця в нових tops; невідома сторінка — 0. */
export function anchorTop(tops, anchor, end) {
  const i = anchor ? tops.findIndex(t => t.id === anchor.id) : -1
  if (i < 0) return 0
  const from = tops[i].top, to = i + 1 < tops.length ? tops[i + 1].top : end
  return Math.round(from + (to - from) * (+anchor.frac || 0))
}

/** Збережене місце з sessionStorage: {id, frac} або null (старий формат — число пікселів — не переносимо). */
export function readAnchor(raw) {
  try { const a = JSON.parse(raw); return a && typeof a.id === 'string' ? { id: a.id, frac: +a.frac || 0 } : null } catch { return null }
}
