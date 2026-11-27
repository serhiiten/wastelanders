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
