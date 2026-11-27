// Пустельники в Owlbear Rodeo: «Генератори» Доглядача (етап 4б, рядки 4.3–4.5), без DOM.
// Рушій — копія terminal.mjs з DEV (ext/foundry/terminal.mjs, createTerminal); тут лише стан вкладок, що показувати і текст
// для «Показати всім». Константи й дрібні функції повторюють вікно Foundry (module/applications/terminal-view.mjs,
// terminal-battle.mjs, terminal.mjs); тест tests/gen-view.test.mjs звіряє їх із DEV.
// Рішення автора: docs/decisions/owlbear.md, «Stage 4б: the generators window» (вікно А, журнал Л1).
import { CASE_DIFF, caseBattle, caseKind, casePower } from '../foundry/case-battle.mjs'
import { concreteKinds, namePicks } from '../foundry/enemy-kinds.mjs'
import { ENEMIES } from './bestiary.mjs'
import { enemyFromBook } from './enemy-data.mjs'
import { makeEnemies } from './enemy-bars.mjs'
import { onEnemyLayer } from './enemy-bar.mjs'

export const GEN_KEY = 'pust-obr-gen'
export const TABS = [{ id: 'case', label: 'Справа' }, { id: 'travel', label: 'Подорож' }, { id: 'tables', label: 'Натхнення' }, { id: 'battle', label: 'Битви' }]

// ---- те саме, що в module/applications/terminal-view.mjs (тест на рівність) ----
export const CASE_DIFFS = [{ v: "легка", n: "Легка" }, { v: "середня", n: "Середня" }, { v: "важка", n: "Важка" }]
export const CASE_FIELDS = [
  { k: "customer", n: "Замовник" }, { k: "goal", n: "Ціль" }, { k: "complication", n: "Ускладнення" },
  { k: "location", n: "Місце на шляху", sub: "Дорога" }, { k: "danger", n: "Небезпека на шляху" }, { k: "destination", n: "Точка прибуття" },
  { k: "cargo", n: "Можливий вантаж", sub: "Вантаж і загроза" }, { k: "enemies", n: "Супротивники" }, { k: "enemyPower", n: "Міць супротивників" },
  { k: "reward", n: "Запропонована винагорода" },
]
export function splitNote(text) {
  const m = /^([\s\S]*?)\s*(\(перекинь[^)]*\))\s*$/.exec(String(text || ""))
  return m ? { t: m[1], note: m[2] } : { t: String(text || ""), note: "" }
}
export const LUCKS = [-2, -1, 0, 1, 2]
export const TRAVEL_TYPES = [{ v: "travel", n: "Подорож" }, { v: "badEncounter", n: "Погана зустріч" }]
export const TABLE_CARDS = [
  { id: "names", n: "Імена", run: "name", sels: [
    { k: "namesCat", n: "Категорія", opts: [["men", "Чоловіки"], ["women", "Жінки"], ["robots", "Роботи"], ["supermutants", "Супермутанти"], ["dcMales", "Пазурі Смерті — самці"], ["dcFemales", "Пазурі Смерті — самиці"]] },
    { k: "namesCount", n: "Скільки", opts: Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i + 1)]) },
  ] },
  { id: "awards", n: "Нагороди", run: "award", sels: [{ k: "awardType", n: "Тип нагороди", opts: [["small", "Мала"], ["medium", "Середня"], ["large", "Велика"]] }] },
  { id: "jobAwards", n: "Нагороди за справи", run: "jobAward", sels: [{ k: "jobLevel", n: "Складність справи", opts: [["light", "Легка справа"], ["mid", "Середня справа"], ["hard", "Важка справа"]] }] },
  { id: "cargo", n: "Вантажі", run: "table" },
  { id: "places", n: "Обʼєкти та місця", run: "table" },
  { id: "hazards", n: "Небезпеки", run: "table" },
  { id: "themes", n: "Теми", run: "table" },
  { id: "people", n: "Люди", run: "table" },
  { id: "raiders", n: "Рейдери та дикуни", run: "raiders" },
  { id: "epit", n: "Епітети", run: "epithet", sels: [{ k: "epitType", n: "Для чого епітет", opts: [["tech", "Технологія"], ["weapon", "Зброя"], ["armor", "Броня"], ["enemy", "Ворог"], ["npc", "НІП"], ["place", "Місце"]] }] },
]
export function runTable(T, card, sel) {
  switch (card.run) {
    case "name": return T.tables.name(sel.namesCat, Number(sel.namesCount) || 1)
    case "award": return T.tables.award(sel.awardType)
    case "jobAward": return T.tables.jobAward(sel.jobLevel)
    case "table": return T.tables.table(card.id)
    case "raiders": return T.tables.raiders()
    case "epithet": return T.tables.epithet(sel.epitType)
  }
  return ""
}
export const BATTLE_DIFFS = [{ v: "easy", n: "Легка" }, { v: "medium", n: "Середня" }, { v: "hard", n: "Важка" }, { v: "deadly", n: "Смертельна" }]
export const CAT = { statists: "Статисти", regular: "Рядові", elite: "Елітні", boss: "Боси" }
export const armorOf = (e) => parseInt(String(e?.armor ?? ""), 10) || 0
export function prettyTravel(html) {
  return String(html || "").replace(/(<div class="result-content">)([\s\S]*?)(<\/div>)/g, (m, open, body, close) => {
    let t = body.trim()
    if ((t.match(/(^|\s)[1-6] — /g) || []).length >= 3) t = t.replace(/(^|\s)([1-6]) — /g, (_, sp, n) => `\n<b class="tv-opt">${n} —</b> `)
    t = t.split(/\n{2,}/).map((p) => `<p>${p.trim().replace(/\n/g, "<br>")}</p>`).join("")
    return open + t + close
  })
}
// ---- те саме, що в module/applications/terminal-battle.mjs ----
export const OPPONENT_ALIASES = {
  "Бандит/мафіозі/рейдер/дикун": "Бандити, мафіозі, рейдери та дикуни",
  "Ватажок/Воєвода": "Ватажки бандитів, мафіозі, рейдерів, дикунів",
  "Мольфар/відун/дивний": "Мольфари, відуни, дивні",
  "Великий бос/Вождь племені": "Великий бос рейдерів/Бос кримінальної родини/Вождь племені",
  "Маленькі тварини/мутанти (дутні, щури, собаки, радтаргани)": "Маленькі тварини та мутанти (дутні, щури, собаки, радтаргани)",
  "Бойовий пес Легіону": "Бойовий пес",
  "Рядовий НКР": "Рядовий армії НКР",
  "Лейтенант НКР": "Лейтенант армії НКР",
  "Штурмовик НКР": "Штурмовик армії НКР",
  "Протектрон Братства": "Протектрон",
  "Протектрон Анклаву": "Протектрон",
  "Містер Сміливець Братства": "Містер Сміливець",
  "Містер Сміливець Анклаву": "Містер Сміливець",
  "Вертиберд Братства": "Вертиберд",
  "Вертиберд Анклаву": "Вертиберд",
  "Кіберпес Анклаву": "Кіберпес",
}
export const opponentName = (name) => OPPONENT_ALIASES[String(name).replace(/[‐-―]/g, "-")] || OPPONENT_ALIASES[name] || name

const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)))
const norm = s => String(s || '').toLowerCase().replace(/[‐-―]/g, '-').replace(/[’ʼ']/g, "'").replace(/[^\p{L}\p{N}]/gu, '')
const BY_NAME = new Map(ENEMIES.map(e => [norm(e.name), e.id]))

/** Ворог битви → картка бестіарію: {id, as} (as — назва виду для групи, «Щур»), або null, якщо в бестіарії його немає. */
export function bookOf(e) {
  const id = BY_NAME.get(norm(opponentName((e && (e.group || e.name)) || '')))
  return id ? { id, as: e.group ? String(e.name || '') : '' } : null
}

// ---- стан (localStorage Доглядача) ----
export function blankGen() {
  return {
    tab: 'case',
    case: { diff: 'легка', cs: null },
    travel: { type: 'travel', luck: 0, luckFrom: '', main: '', additional: '' },
    tables: { sel: { namesCat: 'men', namesCount: 1, awardType: 'small', jobLevel: 'light', epitType: 'tech' }, out: {} },
    battle: { difficulty: 'easy', kinds: ['beasts'], state: null, picks: {} },
  }
}
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x)
/** Збережене → стан; чуже чи зіпсоване поле — значення за замовчуванням (сховище своє, але може бути старим). */
export function cleanGen(x) {
  const b = blankGen()
  if (!isObj(x)) return b
  if (TABS.some(t => t.id === x.tab)) b.tab = x.tab
  if (isObj(x.case)) {
    if (CASE_DIFFS.some(d => d.v === x.case.diff)) b.case.diff = x.case.diff
    if (isObj(x.case.cs) && isObj(x.case.cs.f)) b.case.cs = x.case.cs
  }
  if (isObj(x.travel)) {
    const t = x.travel
    if (TRAVEL_TYPES.some(d => d.v === t.type)) b.travel.type = t.type
    if (LUCKS.includes(t.luck)) b.travel.luck = t.luck
    for (const k of ['luckFrom', 'main', 'additional']) if (typeof t[k] === 'string') b.travel[k] = t[k]
  }
  if (isObj(x.tables)) {
    // лише значення зі списків таблиць (ревізор: старе значення йшло в рушій, а список показував інше)
    if (isObj(x.tables.sel)) for (const c of TABLE_CARDS) for (const s of c.sels || []) if (s.opts.some(([v]) => v === String(x.tables.sel[s.k]))) b.tables.sel[s.k] = s.k === 'namesCount' ? Number(x.tables.sel[s.k]) : x.tables.sel[s.k]
    if (isObj(x.tables.out)) for (const c of TABLE_CARDS) if (typeof x.tables.out[c.id] === 'string') b.tables.out[c.id] = x.tables.out[c.id]
  }
  if (isObj(x.battle)) {
    const s = x.battle
    if (BATTLE_DIFFS.some(d => d.v === s.difficulty)) b.battle.difficulty = s.difficulty
    if (Array.isArray(s.kinds)) b.battle.kinds = s.kinds.filter(k => typeof k === 'string')
    if (isObj(s.state)) b.battle.state = s.state
    if (isObj(s.picks)) b.battle.picks = s.picks
  }
  return b
}

/** Генератори з уже збереженими результатами (як get T у вікні Foundry). */
export function loadTerminal(createTerminal, st) {
  const T = createTerminal({ toast: () => {}, icon: () => '' })
  T.case.setDifficulty(st.case.diff)
  if (st.case.cs) T.case.set(clone(st.case.cs))
  T.battle.setDifficulty(st.battle.difficulty)
  T.battle.setKinds(st.battle.kinds)
  if (st.battle.state) T.battle.restore(clone(st.battle.state))
  return T
}

// ---- дії (як TerminalApp у Foundry; місце й небезпека битви живуть у самій битві, спільних панелей тут немає) ----
/** fn(B) → стан битви; fresh — нова битва. → false, якщо не вийшло (і чому). */
export function battleAct(T, st, fn, fresh = false) {
  const B = T.battle
  B.setDifficulty(st.battle.difficulty)
  B.setKinds(st.battle.kinds)
  if (fresh && !st.battle.kinds.length) return 'no-kinds'
  B.BT.BT_SCENE.place = (st.battle.state && st.battle.state.place) || ''
  B.BT.BT_SCENE.hazard = (st.battle.state && st.battle.state.hazard) || ''
  const s = fn(B)
  if (fresh) st.battle.picks = {}
  st.battle.picks = st.battle.picks || {}
  st.battle.state = concreteKinds(clone({ ...s, names: undefined }), st.battle.picks, OPPONENT_ALIASES)
  return true
}
/** «Створити битву» під «Супротивниками» справи: битва справи на вкладці «Битви». → false, якщо не зібралась. */
export function caseToBattle(T, st) {
  const cs = st.case.cs
  if (!cs) return false
  const B = T.battle
  const kind = caseKind(cs.f.enemies)
  const diff = CASE_DIFF[cs.diff] || 'easy'
  B.setDifficulty(diff)
  const b = caseBattle(B.BT.DB, B.BT.ORDER, kind, casePower(cs.f.enemyPower))
  if (!b) return false
  B.BT.BT_SCENE.place = ''; B.BT.BT_SCENE.hazard = ''
  B.BT.renderBattle(b.factionKey, b.pickedCase, b.allocations)
  B.BT.rollReward() // a fresh reward for this battle's difficulty, not the previous battle's (as DEV #caseBattle, author 2026-11-27)
  const s = B.state()
  Object.assign(st.battle, { difficulty: diff, kinds: [kind] })
  st.battle.picks = namePicks(s.last && s.last.allocations, s.names, OPPONENT_ALIASES)
  st.battle.state = concreteKinds(clone({ ...s, names: undefined }), st.battle.picks, OPPONENT_ALIASES)
  st.tab = 'battle'
  return true
}
/** Битва з події подорожі (spec — з її розмітки: diff, kinds або idx, place) на вкладку «Битви». */
export function travelToBattle(T, st, spec) {
  const s = T.battle.fromTravel(spec)
  if (!s) return false
  st.battle.difficulty = s.difficulty
  st.battle.picks = namePicks(s.last && s.last.allocations, s.names, OPPONENT_ALIASES)
  st.battle.state = concreteKinds(clone({ ...s, names: undefined }), st.battle.picks, OPPONENT_ALIASES)
  st.tab = 'battle'
  return true
}

/** Удача партії з аркуша каравану (як _prepareContext Foundry): нове значення каравану бере верх, ручний вибір лишається до наступної зміни. */
export function carLuck(st, luck) {
  const t = st.travel
  if (luck === null || luck === undefined || !Number.isFinite(+luck)) { t.luckFrom = ''; return null }
  const l = Math.round(+luck), v = Math.max(-2, Math.min(2, l)), from = 'car:' + l
  if (t.luckFrom !== from) { t.luck = v; t.luckFrom = from }
  return { luck: l, clipped: v !== l, used: Number(t.luck) === v }
}

// ---- що показати ----
const sgn = n => (n > 0 ? `+${n}` : String(n))
export const luckLabel = sgn
export function caseFields(st) {
  const cs = st.case.cs
  return cs ? CASE_FIELDS.map(f => ({ ...f, ...splitNote(cs.f[f.k]) })) : []
}
export const caseDiffName = st => ((st.case.cs && CASE_DIFFS.find(d => d.v === st.case.cs.diff)) || {}).n || ''

/** Склад битви за категоріями: [{cat, label, count, cards: [{name, count, hp, armor, cat, kind, book}]}]. */
export function battleBuckets(T, st) {
  const last = st.battle.state && st.battle.state.last
  if (!last) return []
  const mixed = Array.isArray(last.factionKey)
  return T.battle.BT.ORDER.map(cat => {
    const entries = (last.allocations || []).flatMap(a => a.entries || []).filter(e => e.cat === cat && e.count > 0)
    return {
      cat, label: CAT[cat] || cat, count: entries.reduce((n, e) => n + e.count, 0),
      cards: entries.map(x => ({
        name: x.enemy.name, count: x.count, cat: x.cat, hp: +x.enemy.hp || 0, armor: armorOf(x.enemy),
        kind: mixed && x.kind ? (T.battle.BT.DB[x.kind] || {}).name || '' : '', book: bookOf(x.enemy),
      })),
    }
  }).filter(b => b.count)
}
export const battleTitle = (T, st) => { const l = st.battle.state && st.battle.state.last; return l ? T.battle.BT.kindName(l.factionKey) : '' }
export const battleDiffName = st => ((st.battle.state && BATTLE_DIFFS.find(d => d.v === st.battle.state.difficulty)) || {}).n || ''
/** Винагорода битви — текстова частина рамки генератора. */
export function rewardText(st) {
  const html = String((st.battle.state && st.battle.state.rewardHtml) || '')
  const i = html.indexOf('<div class="sc-v">')
  return i < 0 ? '' : htmlText(html.slice(i + '<div class="sc-v">'.length).replace(/<\/div>\s*$/, ''))
}

// ---- «Показати всім»: заголовок і простий текст (Л1) ----
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' }
/** HTML генератора → простий текст: рядки й абзаци — переносами, теги геть, сутності — символами. */
export function htmlText(html) {
  return String(html || '')
    .replace(/<button[^>]*class="[^"]*\bdie\b[^"]*"[^>]*data-dice="([^"]*)"[^>]*>[\s\S]*?<\/button>/g, '$1')
    .replace(/<button[\s\S]*?<\/button>/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h\d)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_, k) => ENT[k])
    .split('\n').map(s => s.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n')
}
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
export function caseShare(st) {
  if (!st.case.cs) return null
  const f = caseFields(st)
  return { title: cut(`Справа (${caseDiffName(st)}): ${(f.find(x => x.k === 'goal') || {}).t || ''}`, 120), text: f.map(x => `${x.n}: ${x.t}${x.note ? ' ' + x.note : ''}`).join('\n') }
}
export function travelShare(st) {
  const t = st.travel
  if (!t.main && !t.additional) return null
  return { title: t.type === 'badEncounter' ? 'Погана зустріч' : 'Подорож Пусткою', text: htmlText((t.main || '') + '\n' + (t.additional || '')) }
}
export function tableShare(st, id) {
  const c = TABLE_CARDS.find(x => x.id === id), out = st.tables.out[id]
  return c && out ? { title: `Натхнення: ${c.n}`, text: String(out) } : null
}
export function battleShare(T, st) {
  const b = battleBuckets(T, st)
  if (!b.length) return null
  const s = st.battle.state
  const lines = b.map(x => `${x.label}: ${x.cards.map(c => `${c.name} × ${c.count} (ОЗ ${c.hp}, броня ${c.armor})`).join('; ')}`)
  if (s.place) lines.push('Місце: ' + s.place)
  if (s.hazard) lines.push('Небезпека: ' + s.hazard)
  const r = rewardText(st)
  if (r) lines.push('Винагорода: ' + r.replace(/\n/g, ' '))
  return { title: cut(`Битва (${battleDiffName(st)}): ${battleTitle(T, st)}`, 120), text: lines.join('\n') }
}

// ---- битви в події подорожі (без DOM: HTML рушія — рядок) ----
/** Межі першого <span class="tvb…"> після i-ї секції «battle-encounter»: {start, open, end} або null. */
function tvbAt(html, i) {
  let at = -1
  for (let k = 0; k <= i; k++) { at = html.indexOf('battle-encounter', at + 1); if (at < 0) return null }
  const next = html.indexOf('battle-encounter', at + 1)
  const start = html.indexOf('<span class="tvb', at)
  if (start < 0 || (next >= 0 && start > next)) return null
  const open = html.indexOf('>', start) + 1
  const re = /<span\b|<\/span>/g
  re.lastIndex = open
  let depth = 1, m
  while ((m = re.exec(html))) { depth += m[0] === '</span>' ? -1 : 1; if (!depth) return { start, open, end: m.index } }
  return null
}
const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? m[1] : '' }
/** Розмітка битви i-ї секції: {rnd, diff, kinds, idx} або null. */
export function travelSpec(html, i) {
  const at = tvbAt(String(html || ''), i)
  if (!at) return null
  const tag = html.slice(at.start, at.open)
  return { rnd: /\btvb-rnd\b/.test(tag), diff: attr(tag, 'data-diff'), kinds: attr(tag, 'data-kinds').split(',').filter(Boolean), idx: +attr(tag, 'data-idx') || 0 }
}
/** «Інші види»: нові види kinds і їхній текст inner (з рушія) в i-й випадковій битві. → новий HTML або null. */
export function travelKindsSet(html, i, kinds, inner) {
  html = String(html || '')
  const at = tvbAt(html, i)
  if (!at || !/\btvb-rnd\b/.test(html.slice(at.start, at.open))) return null
  const tag = html.slice(at.start, at.open).replace(/\bdata-kinds="[^"]*"/, `data-kinds="${kinds.join(',')}"`)
  return html.slice(0, at.start) + tag + inner + html.slice(at.end)
}
/** Місце i-ї секції битви (<span class="tv-place">) як текст. */
export function travelPlace(html, i) {
  html = String(html || '')
  let at = -1
  for (let k = 0; k <= i; k++) { at = html.indexOf('battle-encounter', at + 1); if (at < 0) return '' }
  const next = html.indexOf('battle-encounter', at + 1)
  const m = /<span class="tv-place">([^<]*)<\/span>/.exec(html.slice(at, next < 0 ? undefined : next))
  return m ? htmlText(m[1]) : ''
}

// ---- «На вибрані токени» (автор, 2026-11-27, 4.4): ворог битви на токени, тим самим кодом, що «Зробити ворогом…» ----
/**
 * Вибрані на мапі токени (шари CHARACTER і MOUNT) стають цим ворогом бестіарію; група — під назвою виду («Радтарган»).
 * → {nobook: true} — ворога немає в бестіарії розширення; {none: true} — нічого не вибрано;
 * інакше {made, refused} від makeEnemies (персонажам відмова).
 */
export async function makeFromBattle(OBR, book, { w = 'gen' } = {}) {
  const rec = book && enemyFromBook(book.id, { w })
  if (!rec) return { nobook: true }
  if (book.as) rec.name = String(book.as).slice(0, 80)
  const sel = (await OBR.player.getSelection()) || []
  const items = sel.length ? await OBR.scene.items.getItems(sel) : []
  const ids = items.filter(onEnemyLayer).map(it => it.id)
  if (!ids.length) return { none: true }
  return makeEnemies(OBR, ids, rec, { w })
}
