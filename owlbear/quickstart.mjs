// Пустельники в Owlbear Rodeo: «Швидкий старт» (сесія Б, автор 2026-11-27, вигляд А): увесь текст однією стрічкою,
// випадний зміст угорі показує, де ти, і переносить до будь-якої сторінки. Доглядач — три журнали, гравець — лише перший.
// Текст — ext/lib/quickstart-player.mjs і quickstart-gm.mjs (згенеровано з паку Foundry, чищено за білим списком), не з метаданих: його можна
// вставити як HTML. Вікно — вузьке, біля лівого краю, з кнопками «до краю», ✕ і Esc, як «Генератори».
import OBR from './sdk.js'
import { openEnemyCard } from './lib/enemy-link.mjs'
import { baseOf, openQuick, ID, forgetWin, followResize, winsGet, session } from './lib/pick.mjs'
import { journalsFor, shortJournal, currentPage, pageAnchor, anchorTop, readAnchor, QS_FULL } from './lib/quickstart-view.mjs'
import { T } from './lib/texts.mjs'
import { icon } from './lib/icons.mjs'

const q = new URLSearchParams(location.search)
const slot = q.get('slot') === 'b' ? 'b' : ''
// на весь екран (сесія А, автор 2026-11-28, п.5, макет А «Книжка»): та сама сторінка в modal fullScreen з ?full=1
const full = q.get('full') === '1'
const BASE = baseOf(location.pathname)
const myId = slot === 'b' ? ID.quickB : ID.quick
const $ = id => document.getElementById(id)
const text = $('text'), toc = $('toc'), side = $('side')
document.body.classList.toggle('full', full)

// ---- смуга вікна ----
$('b-icon').replaceChildren(icon('book'))
$('b-title').textContent = T.quickTitle
$('toc-l').textContent = T.quickToc
// місце в тексті переживає переставляння до іншого краю й перехід на весь екран і назад (нове вікно — нова сторінка):
// сторінка й частка прокрутки всередині неї (pageAnchor), бо в іншій ширині той самий текст має іншу висоту
const POS = 'pust-obr-quick-pos'
const savePos = () => { try { sessionStorage.setItem(POS, JSON.stringify(pageAnchor(tops(), text.scrollTop, text.scrollHeight))) } catch { /* ок */ } }
const SIDE = 'pust-obr-quick-side'   // біля якого краю було вузьке вікно перед «На весь екран»
for (const [id, to, ic, t] of [['b-left', 'left', 'dockL', T.dockLeft], ['b-right', 'right', 'dockR', T.dockRight]]) {
  const b = $(id); b.append(icon(ic)); b.title = t; b.setAttribute('aria-label', t); b.hidden = full
  b.onclick = () => { savePos(); openQuick(OBR, BASE, { from: 'narrow', slot, dock: to }).catch(e => console.error(e)) }
}
$('b-close').append(icon('x')); $('b-close').title = T.close; $('b-close').setAttribute('aria-label', T.close)
const closeWin = () => { savePos(); if (full) return OBR.modal.close(QS_FULL); forgetWin(myId); return OBR.popover.close(myId) }
$('b-close').onclick = closeWin
// «На весь екран»: спершу modal, потім закрити вузьке вікно (з ним зупиняється й цей скрипт)
const bFull = $('b-full'); bFull.hidden = full
bFull.append(fullIcon()); bFull.title = T.quickFull; bFull.setAttribute('aria-label', T.quickFull)
bFull.onclick = async () => {
  savePos()
  try { sessionStorage.setItem(SIDE, (winsGet(session())[myId] || {}).side === 'right' ? 'right' : 'left') } catch { /* ок */ }
  try { await OBR.modal.open({ id: QS_FULL, url: `${BASE}quickstart.html?full=1`, fullScreen: true }) } catch (e) { console.error(e); return }
  forgetWin(myId); OBR.popover.close(myId)
}
// «Згорнути» (і Esc на весь екран): назад у вузьке вікно біля того самого краю
const fold = async () => {
  savePos()
  let dock = 'left'
  try { dock = sessionStorage.getItem(SIDE) === 'right' ? 'right' : 'left' } catch { /* ок */ }
  try { await openQuick(OBR, BASE, { dock }) } catch (e) { console.error(e) }
  OBR.modal.close(QS_FULL)
}
const bFold = $('b-fold'); bFold.hidden = !full; bFold.textContent = T.quickFold; bFold.title = T.quickFoldHint
bFold.onclick = fold
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) (full ? fold : closeWin)() })
function fullIcon() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'ic')
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  for (const [k, v] of [['d', 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]) p.setAttribute(k, v)
  s.append(p)
  return s
}

// Вміст сторінки — HTML з бандла розширення, уже чищений під час збирання (tests/quickstart.test.mjs). Ще раз тут, як
// «Генератори»: DOMParser розбирає в окремий документ без скриптів, у сторінку йдуть нові вузли з білого списку тегів;
// атрибути — лише class примітки, перехід усередині вікна й https-посилання в новій вкладці.
const TAGS = new Set(['P', 'BR', 'STRONG', 'EM', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'A'])
function safeNodes(html) {
  const copy = n => {
    if (n.nodeType === 3) return [document.createTextNode(n.nodeValue)]
    if (n.nodeType !== 1) return []
    const kids = [...n.childNodes].flatMap(copy)
    if (!TAGS.has(n.tagName)) return kids
    const e = document.createElement(n.tagName.toLowerCase())
    if (n.tagName === 'BLOCKQUOTE') { const c = n.getAttribute('class'); if (c === 'aside' || c === 'aside warning') e.className = c }
    if (n.tagName === 'A') {
      const h = n.getAttribute('href') || ''
      if (/^#(?:qs|en)-[A-Za-z0-9]{16}$/.test(h)) e.setAttribute('href', h)
      else if (/^https:\/\/[^\s"<>]+$/.test(h)) { e.setAttribute('href', h); e.target = '_blank'; e.rel = 'noopener noreferrer' }
    }
    e.append(...kids)
    return [e]
  }
  return [...new DOMParser().parseFromString(String(html || ''), 'text/html').body.childNodes].flatMap(copy)
}
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e }

async function render(role) {
  const journals = await journalsFor(role)
  const nodes = [], sideNodes = []
  toc.replaceChildren()
  for (const j of journals) {
    const og = document.createElement('optgroup'); og.label = shortJournal(j.name)
    for (const p of j.pages) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; og.append(o) }
    toc.append(og)
    // зміст ліворуч (на весь екран): журнал і його сторінки кнопками, поточна підсвічена
    sideNodes.push(el('p', 'sj', shortJournal(j.name)))
    for (const p of j.pages) { const b = el('button', '', p.name); b.type = 'button'; b.dataset.id = p.id; sideNodes.push(b) }
    nodes.push(el('p', 'jr', j.name))
    for (const p of j.pages) {
      const h = el('h2', 'pg', p.name); h.id = 'qs-' + p.id
      const b = el('div', 'pb'); b.append(...safeNodes(p.html))
      nodes.push(h, b)
    }
  }
  text.replaceChildren(...nodes)
  side.replaceChildren(...sideNodes)
}

const tops = () => [...toc.options].map(o => { const h = document.getElementById('qs-' + o.value); return { id: o.value, top: h ? h.offsetTop - text.offsetTop : 0 } })
const mark = id => {
  if (toc.value !== id) toc.value = id
  for (const b of side.querySelectorAll('button')) { const on = b.dataset.id === id; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current') }
}
const go = id => { const h = document.getElementById('qs-' + id); if (h) { h.scrollIntoView({ block: 'start' }); mark(id) } }
toc.onchange = () => go(toc.value)
side.setAttribute('aria-label', T.quickSide)
side.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button[data-id]'); if (b) go(b.dataset.id) })
let raf = 0
text.addEventListener('scroll', () => {
  if (raf) return
  raf = requestAnimationFrame(() => { raf = 0; const id = currentPage(tops(), text.scrollTop); if (id) mark(id) })
})
// переходи всередині тексту (#qs-…): без зміни адреси сторінки
text.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href^="#qs-"]')
  if (!a) return
  e.preventDefault(); go(a.getAttribute('href').slice(4))
})
// ворог пригоди (#en-<id актора Foundry>) → «Вороги» (п.3 фідбеку 5.1, шов А↔Б). Посилання є лише в текстах Доглядача.
// Відкриває сесії Б openEnemyCard (ext/lib/enemy-link.mjs): «Вороги» на картці ворога біля протилежного краю.
text.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href^="#en-"]')
  if (!a) return
  e.preventDefault()
  const id = a.getAttribute('href').slice(4)
  ;(async () => {
    let at = (winsGet(session())[myId] || {}).side === 'right' ? 'right' : 'left'
    // на весь екран «Вороги» ховалися б під вікном: спершу згорнути у вузьке
    if (full) { try { at = sessionStorage.getItem(SIDE) === 'right' ? 'right' : 'left' } catch { /* ок */ } await fold() }
    await openEnemyCard(OBR, BASE, id, { side: at })
  })().catch(err => console.error(err))
})

OBR.onReady(async () => {
  const setTheme = t => document.documentElement.classList.toggle('light', !!t && t.mode === 'LIGHT')
  try { setTheme(await OBR.theme.getTheme()); OBR.theme.onChange(setTheme) } catch { /* тема необов'язкова */ }
  if (!full) followResize(OBR, myId, plan => { savePos(); return openQuick(OBR, BASE, { from: 'narrow', slot, dock: plan.side }) })
  let role = 'PLAYER'
  try { role = await OBR.player.getRole() } catch (e) { console.error(e) }
  side.hidden = !full
  await render(role)
  let saved = null
  try { saved = sessionStorage.getItem(POS) } catch { /* ок */ }
  text.scrollTop = anchorTop(tops(), readAnchor(saved), text.scrollHeight)
  const id = currentPage(tops(), text.scrollTop); if (id) mark(id)
  try { OBR.player.onChange(p => { if (p && p.role && p.role !== role) { role = p.role; render(role).catch(e => console.error(e)) } }) } catch { /* необов'язково */ }
})
