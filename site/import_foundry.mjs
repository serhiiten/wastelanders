// Пакет Г-Б (автор, 2026-11-28): сторінки лише для сайту з текстів Foundry DEV, яких у вікі не було.
//   «Пам'ятка гравця», «Пам'ятка Доглядача» — журнали компендіуму rules (src/packs/rules), дослівно;
//   «Швидкий старт» — три журнали паку quickstart, текст такий самий, як в Owlbear-версії (pustelnyky-owlbear,
//   tools/make-quickstart.mjs: та сама чистка cleanHtml і ті самі вилучення), але без підказок, специфічних для Owlbear;
//   місця про інтерфейс Foundry взято з тексту PDF «Пустельники - швидкий старт» (його джерела, Google-документа автора);
//   блоки ворогів — повністю, з того ж PDF.
// Сторінки пишуться у wiki/pages/*.md з `compendium: false` (компендіуми Foundry їх не бачать) і далі стають джерелом:
// правляться вже там. Повторний запуск перезаписує їх (спершу подивіться git diff).
//
//   node site/import_foundry.mjs [--dev <DEV clone>] [--owlbear <pustelnyky-owlbear>] [--write | --expected]
// без прапорця — сухий прогін (що буде записано); --expected — JSON {slug: HTML, який мав би бути видимим текстом}
// для site/tests/test_build.py (перевірка «дослівно»).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.dirname(HERE)
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const DEV = path.resolve(arg('--dev', path.join(REPO, '..', 'wastelandersrpg_foundry_dev')))
const OWL = path.resolve(arg('--owlbear', path.join(REPO, '..', 'pustelnyky-owlbear')))
const PAGES = path.join(REPO, 'wiki', 'pages')
const SITE = 'https://serhiiten.github.io/wastelanders/'

const { cleanHtml, OB_PATCHES } = await import(pathToFileURL(path.join(OWL, 'tools', 'make-quickstart.mjs')).href)

// ---------- джерела ----------
const RULES = path.join(DEV, 'src', 'packs', 'rules')
const REMINDERS = [   // журнал компендіуму → сторінка сайту
  { id: 'F0hDlhAvk4LVyrCM', slug: 'pamiatka-hravtsia', file: 'pamiatka-hravtsia.pdf', button: "Скачати пам'ятку гравця" },
  { id: 'JIENHBM52OISboOS', slug: 'pamiatka-dohliadacha', file: 'pamiatka-dohliadacha.pdf', button: "Скачати пам'ятку Доглядача" },
]
const QS_PREFIX = 'shvydkyi-start-'          // сторінки «Швидкого старту»: адреси не перетинаються з розділами вікі
const QS_PDF = 'shvydkyi-start.pdf'
const QS_PDF_BUTTON = 'Скачати PDF'          // автор, 2026-11-28 (пакет Г-Б, 9): на першій сторінці розділу

function readJournal(id) {
  const f = fs.readdirSync(RULES).find(n => n.endsWith(`_${id}.json`))
  if (!f) throw new Error(`немає журналу ${id} у ${RULES}`)
  return JSON.parse(fs.readFileSync(path.join(RULES, f), 'utf8'))
}
const bySort = (a, b) => (a.sort || 0) - (b.sort || 0)

// ---------- «Швидкий старт»: що замінюємо в тексті Owlbear-версії ----------
// Вилучення Owlbear-версії (OB_PATCHES з порожньою заміною: тека акторів, «Мапа Пустки», «Довідки по правилах»,
// «Готова сцена», «Ілюстрації», «Графічний дизайн») — ті самі. Решта OB_PATCHES додає підказки Owlbear — їх немає.
// Пам'ятки на сайті — сторінки, тож їхні назви тут уже позначки посилань ⟦…⟧, а не <strong> Owlbear: шукаємо так само.
const OB_REMOVALS = OB_PATCHES.filter(p => p[1] === '').map(([a, b, n]) => [typeof a === 'string'
  ? a.replace(/<strong>(Пам'ятка гравця|Пам'ятка Доглядача)<\/strong>/g, (_, t) => `⟦${t === "Пам'ятка гравця" ? 'pamiatka-hravtsia' : 'pamiatka-dohliadacha'}.md|${t}⟧`)
  : a, b, n])
// Місця, де текст Foundry описує інтерфейс Foundry, а Owlbear поставив свій: на сайті — текст PDF (Google-документ
// «Пустельники - швидкий старт», з якого зверстано PDF; адреси старих генераторів → вкладки Термінала сайту).
// Кожна заміна має знайтися рівно стільки разів, скільки сказано (третє поле, типово 1), інакше пак змінився.
const SITE_PATCHES = [
  // Foundry кидає кістки сам; в PDF такого рядка немає
  ['<li>Кістки кидає Foundry: панель «Кістки» зліва та «Зробити перевірку» в аркуші персонажа.</li>\n', ''],
  // PDF, «Ким можна грати»
  ['Створи власного Пустельника: новий актор типу «Персонаж» у вкладці акторів.',
    `Створи власного Пустельника за допомогою <a href="${SITE}character_generator.html">електронного аркуша персонажа</a>.`],
  // PDF, с. 12 (цей абзац є в текстовому шарі PDF)
  [/<blockquote class="aside warning"><p>Для битв є сцена «Бойова мапа» з панеллю «Битва»[^<]*<\/p><\/blockquote>/g,
    `<blockquote class="aside warning"><p>Для зручності проведення битв можеш скористатися <a href="${SITE}all_generators.html#tracker">трекером битв</a> та <a href="${SITE}all_generators.html#battle">генератором битв</a> з електронного терміналу Доглядача. Трекер може додавати супротивників та персонажів гравців, сам рахує шкоду з урахуванням броні та стійкостей, відстежує зони, ОЗ, аспекти й безкоштовні Посилення. Панель керування внизу екрана тримає під рукою журнал, примітки, кидки, шкоду, лічильники, коло дій і жетони Долі.</p></blockquote>`],
  // PDF, «Події»
  ['Або можеш скористатися генератором подорожей — кнопка «Подорож» на «Мапі Пустки» або вкладка «Подорож» у «Терміналі Доглядача»: він усе порахує сам.',
    `Або можеш скористатися <a href="${SITE}all_generators.html#travel">генератором подорожей</a> — він усе порахує сам.`],
  // PDF, «Сховок Братства»: «знайдеш за посиланням» (посилання вели на вікі в Notion — тепер на сторінки сайту)
  ['знайдеш у їхніх картках з компендіуму «Супротивники» — їх можна просто перетягти на сцену.', 'знайдеш за посиланням.'],
]

// Блоки ворогів — з PDF «Пустельники - швидкий старт» (с. 17–20), дослівно (звірено з відмальованими сторінками PDF,
// 2026-11-28; Google-документ автора тут старіший і місцями інший). Стоять під заголовком «Супротивники» замість
// переліку акторів Foundry. Заголовки блоків у PDF набрано великими літерами (стиль верстки) — тут звичайним регістром.
const li = (k, v) => `<li><strong>${k}</strong> ${v}</li>`
const asp = (...a) => a.map(x => `<strong><em>${x}</em></strong>`).join(', ') + '.'
const block = (name, rows, about = '', moves = null) => `<p><strong>${name}</strong></p>\n` + (about ? `<p>${about}</p>\n` : '')
  + `<ul>${rows.join('')}</ul>` + (moves ? `\n<p><strong>${moves[0]}</strong></p>\n<ul>${moves[1].map(([a, b]) => li(a, b)).join('')}</ul>` : '')
const ENEMIES = {
  'Папа Детонатор': [
    block('Папа Детонатор', [
      li('Категорія:', 'елітний супротивник.'), li('ОЗ:', '15'),
      li('Броня:', '2 (від власної вибухівки Папа Детонатор шкоди не отримує)'),
      li('Шкода:', 'Помповий дробовик (1d10 фізичної шкоди, бій на відстані); саморобні гранати (1d6 фізичної шкоди всім істотам в одній зоні, 2 шт.); армійська граната (2d6 фізичної шкоди всім істотам в одній зоні, 1 шт.)'),
      li('Аспекти:', asp('ватажок найманців', '«вибух — це мистецтво»'))],
    '', ['Ходи:', [['Стимпак:', 'раз за сцену відновлює 5 ОЗ.']]]),
    block('Група Детонатора (4): Шина, Огризок, Ролло Саботаж і Біллі-Боб', [
      li('Категорія:', 'рядовий супротивник.'), li('ОЗ:', '5'), li('Броня:', '1'),
      li('Шкода:', 'Самопал (1d6 фізичної шкоди, бій на відстані); саморобні гранати (1d6 фізичної шкоди всім істотам в одній зоні, по одній у кожного)'),
      li('Аспект:', asp('звичайний головоріз'))]),
  ],
  'Віктор': [
    block('Сек’юритрони (2): Віктор і його товариш', [
      li('Категорія:', 'елітний супротивник.'), li('ОЗ:', '15'), li('Броня:', '2'),
      li('Шкода:', 'Кулемет (1d10 фізичної шкоди, бій на відстані); вбудований гранатомет (2d6 фізичної шкоди всім істотам в одній зоні, 2 гранати)'),
      li('Аспекти:', asp('удосконалений робот-охоронець', 'гучні динаміки'))],
    '', ['Ходи:', [['Сигналізація:', 'раз за сцену кличе на допомогу ще одного сек’юритрона, який з’являється в сцені й піднімає тривогу. Якщо в сцені один сек’юритрон уже покликав допомогу, інші цього зробити не можуть.']]]),
    `<p>У Віктора є особистий хід.</p>\n<ul>${li('Найшвидша клешня на Заході:', 'раз за сцену Віктор може влучними пострілами вибити зброю з рук усіх супротивників, яких бачить. Щоб підняти зброю, треба витратити переміщення.')}</ul>`,
  ],
  'Флавій': [
    block('Фрументарії (2): Флавій і Друз', [
      li('Категорія:', 'елітний супротивник.'), li('ОЗ:', '12'), li('Броня:', '2'),
      li('Шкода:', 'Мисливська гвинтівка (1d10 фізичної шкоди, бій на відстані або ближній бій); армійська граната (2d6 фізичної шкоди всім істотам в одній зоні, 1 шт.)'),
      li('Аспекти:', asp('майстер-шпигун Легіону', 'може видати себе за будь-кого'))],
    'Шпигуни, диверсанти й передові розвідники Легіону. Вишколені бійці, здатні майстерно й непомітно влитися в будь-яку організацію та видати себе за кого завгодно. Зазвичай трапляються по одному–двоє.',
    ['Ходи:', [['Стелс-бой:', 'раз за сцену стає <strong><em>невидимим</em></strong> і переміщується на відстань до двох зон, оминаючи будь-які перешкоди. Після цього може або атакувати ціль, від чого одразу знову стає видимим, або втекти з безнадійного бою.']]]),
    block('Легіонери (3): Прим, Секундус і Терцій', [
      li('Категорія:', 'рядовий супротивник.'), li('ОЗ:', '7'), li('Броня:', '1'),
      li('Шкода:', 'Мачете (1d6 фізичної шкоди, ближній бій); саморобна граната (1d6 фізичної шкоди всім істотам в одній зоні, 1 шт.)'),
      li('Аспект:', asp('рядовий воїн Легіону'))]),
  ],
  'Лицар Кетрін': [
    block('Лицар Кетрін', [
      li('Категорія:', 'елітний супротивник.'), li('ОЗ:', '20'), li('Броня:', '3 (важка композитна бойова броня)'),
      li('Шкода:', 'Важка плазмова гвинтівка (2d6 фізичної шкоди, бій на відстані, ігнорує 2 броні); плазмова граната (3d6 фізичної шкоди всім істотам в одній зоні, 1 шт.)'),
      li('Аспекти:', asp('лицар Братства Сталі', 'різка, як удар молота'))],
    '', ['Ходи:', [['Розпад:', 'коли Кетрін своєю атакою знижує ОЗ цілі до 0, усі вороги в зоні цілі отримують 1d10 енергетичної шкоди, що ігнорує броню.'],
      ['Бойові рефлекси:', 'раз за сцену перекидає всі кістки шкоди, завданої нею або їй, і вибирає кращий для себе результат.'],
      ['Стимпак:', 'раз за сцену відновлює 5 ОЗ.']]]),
    block('Лицарі Братства Сталі (2): Конор і Максвел', [
      li('Категорія:', 'елітний супротивник.'), li('ОЗ:', '15'), li('Броня:', '3 (бойова броня)'),
      li('Шкода:', 'Важкий лазерний карабін (2d6 фізичної шкоди, бій на відстані, ігнорує 1 броні); армійська граната (2d6 фізичної шкоди всім істотам в одній зоні, 1 шт.)'),
      li('Аспекти:', asp('лицар Братства Сталі', 'загартований ветеран'))],
    'Загартовані в багатьох битвах ветерани Братства з доступом до покращеного спорядження й технологій.',
    ['Ходи:', [['Бойові рефлекси:', 'раз за сцену перекидає всі кістки шкоди, завданої ним або йому, і вибирає кращий для себе результат.'],
      ['Стимпак:', 'раз за сцену відновлює 5 ОЗ.']]]),
    block('Писарі Братства Сталі (2): Симона і Чедвік', [
      li('Категорія:', 'рядовий супротивник.'), li('ОЗ:', '8'), li('Броня:', '2'),
      li('Шкода:', 'Лазерна гвинтівка (1d10 фізичної шкоди, бій на відстані, ігнорує 1 броні)'),
      li('Аспект:', asp('писар Братства Сталі'))],
    'Найнижчий ранг в ієрархії Братства. Писарі збирають, відновлюють і зберігають технології Старого світу.'),
  ],
}
// посилання на ворогів компендіуму «Супротивники» → сторінки бестіарію вікі (заголовок ворога)
const OPPONENTS = {
  MY09XF3Htft8t5wu: 'suprotyvnyky-voiny-bratstva-stali.md#paladyn-bratstva-stali',
  eTtJkClcBvmA7Brp: 'suprotyvnyky-zbroini-syly-anklavu.md#vertyberd',
}

// ---------- посилання Foundry ----------
// @UUID на сторінку паку чи журнал пам'ятки — посилання на сторінку сайту; на ворога бестіарію — його місце в бестіарії;
// решта (персонажі, вороги пригоди, сцени) — жирна назва, як в Owlbear. Позначки ⟦…⟧ переживають cleanHtml.
function links(html, pageSlug) {
  return html.replace(/@UUID\[([^\]]*)\]\{([^}]*)\}/g, (all, ref, label) => {
    let m = /JournalEntryPage\.([A-Za-z0-9]{16})$/.exec(ref)
    if (m && pageSlug[m[1]]) return `⟦${pageSlug[m[1]]}.md|${label}⟧`
    m = /rules\.JournalEntry\.([A-Za-z0-9]{16})$/.exec(ref)
    const r = m && REMINDERS.find(x => x.id === m[1])
    if (r) return `⟦${r.slug}.md|${label}⟧`
    m = /opponents\.Actor\.([A-Za-z0-9]{16})$/.exec(ref)
    if (m && OPPONENTS[m[1]]) return `⟦${OPPONENTS[m[1]]}|${label}⟧`
    if (m) throw new Error(`немає місця в бестіарії для ${ref}`)
    return all
  })
}
const unmark = html => html.replace(/⟦([^|⟧]+)\|([^⟧]*)⟧/g, (_, h, t) => `<a href="${h}">${t}</a>`)

function applyPatches(html, table, hits) {
  return table.reduce((s, [a, b], i) => {
    if (a instanceof RegExp) return s.replace(a, (...m) => { hits[i]++; return typeof b === 'function' ? b(...m) : b })
    const parts = s.split(a); hits[i] += parts.length - 1; return parts.join(b)
  }, html)
}
function checkHits(table, hits, what) {
  const bad = hits.map((n, i) => n === (table[i][2] || 1) ? null : `${what} ${i + 1}: знайдено ${n} разів`).filter(Boolean)
  if (bad.length) throw new Error('пак змінився, перегляньте заміни:\n' + bad.join('\n'))
}

// ---------- HTML → Markdown сайту ----------
// Теги текстів Foundry: p, h3, h4, ul, ol, li, blockquote.aside(.warning), table…, strong, em, br, a. h3 → ##, h4 → ###
// (h1 — назва сторінки); blockquote.aside → виноска `> [!NOTE]` (☢), .aside.warning → `> [!WARNING]` (⚠️);
// таблиці лишаються HTML (у Markdown немає colspan і рядків-заголовків у тілі).
function parse(html) {
  const root = { tag: '#root', kids: [] }, stack = [root]
  const re = /<(\/?)([a-z0-9]+)((?:\s+[a-z-]+="[^"]*")*)\s*\/?>|([^<]+)/gi
  let m
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1]
    if (m[4] !== undefined) { top.kids.push({ text: m[4] }); continue }
    const tag = m[2].toLowerCase()
    if (m[1]) {
      while (stack.length > 1 && stack[stack.length - 1].tag !== tag) stack.pop()
      if (stack.length > 1) stack.pop()
      continue
    }
    const attrs = {}
    for (const a of m[3].matchAll(/([a-z-]+)="([^"]*)"/gi)) attrs[a[1]] = a[2]
    const node = { tag, attrs, kids: [] }
    top.kids.push(node)
    if (tag !== 'br') stack.push(node)
  }
  return root
}
const decode = s => s.replace(/&nbsp;/g, '\u00a0').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
const escMd = s => decode(s).replace(/\\/g, '\\\\').replace(/([*_[\]`])/g, '\\$1').replace(/&/g, '&amp;').replace(/</g, '&lt;')
const serialize = n => n.text !== undefined ? n.text
  : `<${n.tag}${Object.entries(n.attrs).map(([k, v]) => ` ${k}="${v}"`).join('')}>` + (n.tag === 'br' ? '' : n.kids.map(serialize).join('') + `</${n.tag}>`)

function inline(kids, bold = false) {
  return kids.map(k => {
    if (k.text !== undefined) return escMd(k.text.replace(/\s*\n\s*/g, ' '))
    const inner = inline(k.kids, bold || k.tag === 'strong')
    if (k.tag === 'strong' && bold) return inner        // <strong> у <strong> (назва-посилання Foundry в жирному тексті)
    const wrap = (mark) => { const t = inner.match(/^(\s*)(.*?)(\s*)$/s); return t[2] ? `${t[1]}${mark}${t[2]}${mark}${t[3]}` : inner }
    if (k.tag === 'strong') return wrap('**')
    if (k.tag === 'em') return wrap('*')
    if (k.tag === 'br') return '<br>'
    if (k.tag === 'a') return `[${inner}](${k.attrs.href.startsWith(SITE) ? k.attrs.href : k.attrs.href})`
    throw new Error(`невідомий тег у рядку: <${k.tag}>`)
  }).join('')
}
const INLINE = new Set(['strong', 'em', 'br', 'a'])
function blocks(kids, pre = '') {
  const out = []
  let run = []
  const flush = () => { const t = inline(run).trim(); if (t) out.push(pre + t); run = [] }
  for (const k of kids) {
    if (k.text !== undefined || INLINE.has(k.tag)) { run.push(k); continue }
    flush()
    if (k.tag === 'p') { const t = inline(k.kids).trim(); if (t) out.push(pre + t) }
    else if (k.tag === 'h3' || k.tag === 'h4') out.push(pre + (k.tag === 'h3' ? '## ' : '### ') + inline(k.kids).trim())
    else if (k.tag === 'ul' || k.tag === 'ol') {
      let n = 0
      const items = k.kids.filter(x => x.tag === 'li').map(item => {
        const mark = k.tag === 'ol' ? `${++n}. ` : '- '
        const parts = blocks(item.kids, '')
        const first = parts.shift() || ''
        const rest = parts.map(p => p.split('\n').map(l => l ? '    ' + l : l).join('\n'))
        return pre + mark + first + (rest.length ? '\n\n' + rest.map(r => r.split('\n').map(l => l ? pre + l : l).join('\n')).join('\n\n') : '')
      })
      const tight = k.kids.filter(x => x.tag === 'li').every(item => item.kids.every(x => x.text !== undefined || INLINE.has(x.tag)))
      out.push(items.join(tight ? '\n' : '\n\n'))
    } else if (k.tag === 'blockquote') {
      const kind = /\bwarning\b/.test(k.attrs.class || '') ? 'WARNING' : 'NOTE'
      const inner = blocks(k.kids, '').join('\n\n')
      out.push([`> [!${kind}]`, '>', ...inner.split('\n').map(l => l ? '> ' + l : '>')].map(l => pre + l).join('\n'))
    } else if (k.tag === 'table') out.push(pre + serialize(k).replace(/\n+/g, '\n').trim())
    else throw new Error(`невідомий блок: <${k.tag}>`)
  }
  flush()
  return out
}
const toMd = html => blocks(parse(html).kids).join('\n\n') + '\n'

// ---------- сторінки ----------
function page(slug, title, html, extra = {}) {
  const body = '\n' + toMd(html)
  const head = { title, compendium: false, ...extra, import_sha: crypto.createHash('sha1').update(body).digest('hex').slice(0, 12) }
  const yaml = Object.entries(head).map(([k, v]) => `${k}: ${typeof v === 'string' ? JSON.stringify(v) : v}`).join('\n')
  return { slug, title, html, md: `---\n${yaml}\n---\n${body}` }
}

function reminders() {
  return REMINDERS.map(r => {
    const j = readJournal(r.id)
    const html = j.pages.slice().sort(bySort).map(p => `<h3>${p.name}</h3>\n` + p.text.content.replace(/<h3>/g, '<h4>').replace(/<\/h3>/g, '</h4>')).join('\n')
    if (/@\w+\[|pust-fvtt/.test(html)) throw new Error(`${j.name}: посилання чи примітки Foundry — перегляньте імпорт`)
    return page(r.slug, j.name, html + `\n<p><a href="../files/${r.file}">${r.button}</a></p>`,
      { source: `Foundry DEV, компендіум «Довідки по правилах», журнал «${j.name}» (${r.id}), 2026-11-28` })
  })
}

function quickstart() {
  const dir = path.join(DEV, 'src', 'packs', 'quickstart')
  const adv = JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find(n => n.endsWith('.json'))), 'utf8'))
  const journals = adv.journal.slice().sort(bySort)
  const slugOf = {}
  const out = { sections: [], pages: [] }
  const { slugify } = SLUG
  for (const j of journals) for (const p of j.pages) slugOf[p._id] = QS_PREFIX + slugify(p.name)
  const hitsR = OB_REMOVALS.map(() => 0), hitsS = SITE_PATCHES.map(() => 0)
  let first = true
  for (const j of journals) {
    const sec = { title: j.name.replace(/^Швидкий старт: /, ''), journal: j.name, pages: [] }
    for (const p of j.pages.slice().sort(bySort).filter(p => !p.type || p.type === 'text')) {
      let html = links(p.text.content, slugOf)
      html = cleanHtml(html, new Set(), new Set())
      html = applyPatches(html, OB_REMOVALS, hitsR)
      html = applyPatches(html, SITE_PATCHES, hitsS)
      html = html.replace(/<h3>Супротивники<\/h3>\s*<ul>([\s\S]*?)<\/ul>/g, (all, list) => {
        const name = /<strong>([^<]+)<\/strong>/.exec(list)[1]
        if (!ENEMIES[name]) throw new Error(`немає блоків ворогів для «${name}» (${p.name})`)
        ENEMIES[name].used = true
        return '<h3>Супротивники</h3>\n' + ENEMIES[name].join('\n')
      })
      html = unmark(html)
      if (first) { html = `<p><a href="../files/${QS_PDF}">${QS_PDF_BUTTON}</a></p>\n` + html; first = false }
      const left = /@\w+\[|\[\[|⟦|Foundry|вкладці акторів|компендіум/.exec(html)
      if (left) throw new Error(`${p.name}: лишився слід Foundry: ${html.slice(left.index - 40, left.index + 60)}`)
      out.pages.push(page(slugOf[p._id], p.name, html, { source: `Foundry DEV, пак «Швидкий старт», журнал «${j.name}», сторінка ${p._id}, 2026-11-28` }))
      sec.pages.push(slugOf[p._id])
    }
    out.sections.push(sec)
  }
  checkHits(OB_REMOVALS, hitsR, 'вилучення Owlbear')
  checkHits(SITE_PATCHES, hitsS, 'заміна сайту')
  const unused = Object.keys(ENEMIES).filter(k => !ENEMIES[k].used)
  if (unused.length) throw new Error('не вставлено блоки ворогів: ' + unused.join(', '))
  return out
}

// транслітерація адрес — та сама, що в site/wikisrc.py (slugify), щоб адреси збігалися з рештою вікі
const SLUG = (() => {
  const TR = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', '’': '', "'": '', 'ʼ': '' }
  const FIRST = { є: 'ye', ї: 'yi', й: 'y', ю: 'yu', я: 'ya' }
  return {
    slugify(title) {
      let out = '', prev = ''
      for (const ch of title.toLowerCase()) {
        const first = !/\p{L}/u.test(prev)
        if (ch === 'г' && prev === 'з') out += 'gh'
        else if (ch in TR) out += first && ch in FIRST ? FIRST[ch] : TR[ch]
        else if (/[a-z0-9]/.test(ch)) out += ch
        else out += '-'
        if (!"’'ʼ".includes(ch)) prev = ch
      }
      return out.replace(/-+/g, '-').replace(/^-|-$/g, '')
    },
  }
})()

const rem = reminders()
const qs = quickstart()
const all = [...rem, ...qs.pages]
if (process.argv.includes('--expected')) {
  process.stdout.write(JSON.stringify(Object.fromEntries(all.map(p => [p.slug, p.html]))))
} else {
  for (const p of all) {
    const f = path.join(PAGES, p.slug + '.md')
    const was = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null
    if (process.argv.includes('--write')) fs.writeFileSync(f, p.md)
    console.log(`${was === null ? 'нова' : was === p.md ? 'та сама' : 'змінена'}: pages/${p.slug}.md «${p.title}»`)
  }
  console.log('розділи «Швидкого старту» для contents.yml:')
  for (const s of qs.sections) console.log(`  ${s.title}: ${s.pages.join(', ')}`)
  if (!process.argv.includes('--write')) console.log('(сухий прогін; --write, щоб записати)')
}
