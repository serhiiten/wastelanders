// Пустельники в Owlbear Rodeo: «Швидкий старт» (сесія Б, автор 2026-11-27, вигляд А): увесь текст однією стрічкою,
// випадний зміст угорі показує, де ти, і переносить до будь-якої сторінки. Доглядач — три журнали, гравець — лише перший.
// Текст — ext/lib/quickstart-player.mjs і quickstart-gm.mjs (згенеровано з паку Foundry, чищено за білим списком), не з метаданих: його можна
// вставити як HTML. Вікно — вузьке, біля лівого краю, з кнопками «до краю», ✕ і Esc, як «Генератори».
import OBR from './sdk.js'
import { baseOf, openQuick, ID, forgetWin, followResize } from './lib/pick.mjs'
import { journalsFor, shortJournal, currentPage } from './lib/quickstart-view.mjs'
import { T } from './lib/texts.mjs'
import { icon } from './lib/icons.mjs'

const q = new URLSearchParams(location.search)
const slot = q.get('slot') === 'b' ? 'b' : ''
const BASE = baseOf(location.pathname)
const myId = slot === 'b' ? ID.quickB : ID.quick
const $ = id => document.getElementById(id)
const text = $('text'), toc = $('toc')

// ---- смуга вікна ----
$('b-icon').replaceChildren(icon('book'))
$('b-title').textContent = T.quickTitle
$('toc-l').textContent = T.quickToc
// місце прокрутки переживає переставляння до іншого краю (нове вікно — нова сторінка)
const POS = 'pust-obr-quick-pos'
const savePos = () => { try { sessionStorage.setItem(POS, String(Math.round(text.scrollTop))) } catch { /* ок */ } }
for (const [id, to, ic, t] of [['b-left', 'left', 'dockL', T.dockLeft], ['b-right', 'right', 'dockR', T.dockRight]]) {
  const b = $(id); b.append(icon(ic)); b.title = t; b.setAttribute('aria-label', t)
  b.onclick = () => { savePos(); openQuick(OBR, BASE, { from: 'narrow', slot, dock: to }).catch(e => console.error(e)) }
}
$('b-close').append(icon('x')); $('b-close').title = T.close; $('b-close').setAttribute('aria-label', T.close)
const closeWin = () => { savePos(); forgetWin(myId); return OBR.popover.close(myId) }
$('b-close').onclick = closeWin
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) closeWin() })

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
      if (/^#qs-[A-Za-z0-9]{16}$/.test(h)) e.setAttribute('href', h)
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
  const nodes = []
  toc.replaceChildren()
  for (const j of journals) {
    const og = document.createElement('optgroup'); og.label = shortJournal(j.name)
    for (const p of j.pages) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; og.append(o) }
    toc.append(og)
    nodes.push(el('p', 'jr', j.name))
    for (const p of j.pages) {
      const h = el('h2', 'pg', p.name); h.id = 'qs-' + p.id
      const b = el('div', 'pb'); b.append(...safeNodes(p.html))
      nodes.push(h, b)
    }
  }
  text.replaceChildren(...nodes)
}

const tops = () => [...toc.options].map(o => { const h = document.getElementById('qs-' + o.value); return { id: o.value, top: h ? h.offsetTop - text.offsetTop : 0 } })
const go = id => { const h = document.getElementById('qs-' + id); if (h) { h.scrollIntoView({ block: 'start' }); toc.value = id } }
toc.onchange = () => go(toc.value)
let raf = 0
text.addEventListener('scroll', () => {
  if (raf) return
  raf = requestAnimationFrame(() => { raf = 0; const id = currentPage(tops(), text.scrollTop); if (id && toc.value !== id) toc.value = id })
})
// переходи всередині тексту (#qs-…): без зміни адреси сторінки
text.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href^="#qs-"]')
  if (!a) return
  e.preventDefault(); go(a.getAttribute('href').slice(4))
})

OBR.onReady(async () => {
  const setTheme = t => document.documentElement.classList.toggle('light', !!t && t.mode === 'LIGHT')
  try { setTheme(await OBR.theme.getTheme()); OBR.theme.onChange(setTheme) } catch { /* тема необов'язкова */ }
  followResize(OBR, myId, plan => { savePos(); return openQuick(OBR, BASE, { from: 'narrow', slot, dock: plan.side }) })
  let role = 'PLAYER'
  try { role = await OBR.player.getRole() } catch (e) { console.error(e) }
  await render(role)
  let pos = 0
  try { pos = +sessionStorage.getItem(POS) || 0 } catch { /* ок */ }
  text.scrollTop = pos
  const id = currentPage(tops(), text.scrollTop); if (id) toc.value = id
  try { OBR.player.onChange(p => { if (p && p.role && p.role !== role) { role = p.role; render(role).catch(e => console.error(e)) } }) } catch { /* необов'язково */ }
})
