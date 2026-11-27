// Пустельники в Owlbear Rodeo: лінійні значки сторінок розширення (вигляд A «Картки», автор 2026-11-26).
// 24×24, колір — currentColor, тож значок бере колір тексту чи акценту свого місця. Рядки статичні, без даних користувача.

const sv = d => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`

export const ICON = {
  sheet: sv('<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><circle cx="12" cy="11" r="2.2"/><path d="M8.5 18c.6-2.2 2-3.2 3.5-3.2s2.9 1 3.5 3.2"/>'),
  assign: sv('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.7-3.6 2.9-5.4 5.5-5.4 1.3 0 2.5.4 3.4 1.3"/><path d="M15 17h6M18.5 14.5 21 17l-2.5 2.5"/>'),
  create: sv('<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M12 10v7M8.5 13.5h7"/>'),
  random: sv('<path d="M3 7h3.5c4.5 0 6.5 10 11 10H21"/><path d="M3 17h3.5c1.6 0 2.8-1.3 3.8-3M14 10c1-1.7 2.2-3 3.5-3H21"/><path d="m18.5 4.5 2.5 2.5-2.5 2.5M18.5 14.5l2.5 2.5-2.5 2.5"/>'),
  json: sv('<path d="M3 7.5V18a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18V9.5A1.5 1.5 0 0 0 19.5 8H12l-2-2.5H4.5A1.5 1.5 0 0 0 3 7z"/><path d="M12 16v-5M9.5 13.5 12 11l2.5 2.5"/>'),
  user: sv('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.9-4 3.6-6 7-6s6.1 2 7 6"/>'),
  lock: sv('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  ok: sv('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>'),
  warn: sv('<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.1"/>'),
  err: sv('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'),
  check: sv('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  dockL: sv('<rect x="3" y="4.5" width="18" height="15" rx="1.5"/><path d="M8 4.5v15"/><path d="M15.5 9.5 13 12l2.5 2.5"/>'),
  dockR: sv('<rect x="3" y="4.5" width="18" height="15" rx="1.5"/><path d="M16 4.5v15"/><path d="M8.5 9.5 11 12l-2.5 2.5"/>'),
  x: sv('<path d="M6 6l12 12M18 6 6 18"/>'),
  dice: sv('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01" stroke-width="2.6"/>'),
  caravan: sv('<path d="M3 15V9.5a6.5 4.5 0 0 1 13 0V15z"/><path d="M16 11h3.5l1.5 4H16"/><path d="M2 15h20"/><circle cx="7" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>'),
  enemy: sv('<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/><circle cx="12" cy="12" r="1"/>'),
  card: sv('<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3.2"/><path d="M12 5.5v1.5M12 13v1.5M7.5 10H9M15 10h1.5M8 18h8"/>'),
  gen: sv('<rect x="3" y="4" width="18" height="13" rx="2"/><path d="m7 9 2.5 2L7 13M11.5 13H15M9 20h6M12 17v3"/>'),
  log: sv('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  // сесія Б (автор, 2026-11-27): «Швидкий старт» — розгорнута книжка, «Лічильники» — шкала з покажчиком
  book: sv('<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"/><path d="M12 6.5v13"/>'),
  counter: sv('<path d="M4 16a8 8 0 0 1 16 0"/><path d="M12 16l4-5"/><circle cx="12" cy="16" r="1.3"/><path d="M4 20h16"/>'),
}

/** Значок як DOM-вузол (span з SVG), cls — додатковий клас. */
export function icon(name, cls = '') {
  const s = document.createElement('span')
  s.className = 'ic' + (cls ? ' ' + cls : '')
  s.innerHTML = ICON[name]
  return s
}

/** «Ім'я (зміна №r)» → [ім'я, «зміна №r»] для рядка з позначкою; текст той самий, що T.cachedItem. */
export function splitRev(s) {
  const m = /^(.*) \((зміна №\d+)\)$/.exec(s)
  return m ? [m[1], m[2]] : [s, '']
}
