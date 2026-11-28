// Пустельники в Owlbear Rodeo: що показує сторінка «Вороги» (етап 4, рядки 4.7–4.10), без DOM.
// Макет Б «Дві сторінки» (автор, 2026-11-27): список («У бою» — ворожі токени сцени, бестіарій за групами вікі, пошук,
// «Свої») і картка. Підписи захистів, категорій і кісток — з модулів Foundry (ext/foundry/, копія скриптом).
import { K_ENEMY, hasEnemy, hpOf, labelOf, onEnemyLayer } from './enemy-bar.mjs'
import { BOOK, GROUPS, QS_GROUP, unpackEnemy } from './enemy-data.mjs'
import { CAT_LABEL, profileTags, diceInText, diceLabel } from '../foundry/battle.mjs'
import { attackDice, bonusFrom, andList, profileOf } from '../foundry/enemy-model.mjs'
import { moveSpec, moveMarks, moveLimit, spendMove, freeMove } from '../foundry/move-spec.mjs'
import { ETYPES } from './rolls.mjs'

/** Пошук без різниці регістру й апострофів: «секʼюритрон» = «Сек'юритрон». */
export const norm = s => String(s || '').toLowerCase().replace(/[’ʼ`']/g, "'").replace(/\s+/g, ' ').trim()

/** «У бою»: ворожі токени сцени → [{id, label, hp, cat, bad, hidden}] за підписом. */
export function battleList(items) {
  return (items || []).filter(it => onEnemyLayer(it) && hasEnemy(it.metadata)).map(it => {
    const rec = unpackEnemy(it.metadata)
    return { id: it.id, label: labelOf(it) || (rec && rec.name) || '', hp: hpOf(it.metadata), cat: rec ? rec.e.cat : '', bad: !rec, hidden: it.visible === false }
  }).sort((a, b) => a.label.localeCompare(b.label, 'uk', { numeric: true }))
}

/**
 * Список «Вороги»: спершу тека «Швидкий старт» (підтеки зустрічей, як у Foundry), далі бестіарій за групами вікі; пошук.
 * → [{n, items:[{id, name, cat, hp}], subs?:[{n, items}]}]; порожні групи й підтеки відкинуто. subs — лише в теці «Швидкий старт».
 */
export function bookGroups(query = '') {
  const q = norm(query)
  const row = b => ({ id: b.id, name: b.name, cat: b.sys.cat, hp: b.sys.hp.max })
  const hit = (b, ...names) => !q || norm(b.name).includes(q) || names.some(n => norm(n).includes(q))
  const subs = QS_GROUP.subs.map(s => ({ n: s.n, items: s.ids.map(id => BOOK.get(id)).filter(Boolean).filter(b => hit(b, QS_GROUP.n, s.n)).map(row) }))
    .filter(s => s.items.length)
  const qs = subs.length ? [{ n: QS_GROUP.n, items: subs.flatMap(s => s.items), subs }] : []
  return qs.concat(GROUPS.map(g => ({
    n: g.n,
    items: g.subs.flatMap(s => s.ids).map(id => BOOK.get(id)).filter(Boolean).filter(b => hit(b, g.n)).map(row),
  })).filter(g => g.items.length))
}

/** Набої: клік по кружечку k (1…) ставить k, клік по останньому витрачає його (як у Foundry). */
export const ammoClick = (ammo, k) => (k === ammo ? k - 1 : k)

/** Позначки ходу: клік по позначці j (1…) ставить j використань, клік по останній знімає її. */
export function markClick(move, j) {
  const spec = moveSpec(move), { spent } = moveMarks(move, spec)
  const next = j === spent ? j - 1 : j
  return next <= 0 ? freeMove(move) : { ...move, spent: next, used: spec.uses > 0 && next >= spec.uses }
}
/** «Зняти позначки»: усі ходи вільні; null — знімати нічого. */
export const clearMarks = e => e.moves.some(m => m.used || m.spent > 0) ? { ...e, moves: e.moves.map(freeMove) } : null

/** Пояснення броні з книги без самого числа: «4 (неживий: …)» → «неживий: …». */
export function armorRest(e) {
  let t = String(e.armorText || '').trim()
  const m = /^(\d+)\s*(.*)$/s.exec(t)
  if (m && +m[1] === e.armor) t = m[2].trim()
  if (/^\(.*\)$/s.test(t)) t = t.slice(1, -1).trim()
  return t
}
const typeName = t => ETYPES[t] || ETYPES.phys

// ---- аспекти прямо в картці (автор, 2026-11-28, п.7 фідбеку, макет Б): ситуативні — до 5, до 70 знаків; рахівниця Посилень ----
export const SIT_MAX = 5, SIT_LEN = 70, INV_MAX = 9   // 9 — межа inv запису на токені (enemy-data.mjs, LIM.inv)
/**
 * Додати ситуативний аспект: текст обрізано пробілами й до SIT_LEN; → {e} (нова копія) або {err: 'empty' | 'full'}.
 * Межа 5 — лише для додавання: старіший запис із більшим числом показується весь.
 */
export function addSit(e, text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, SIT_LEN).trim()
  if (!t) return { err: 'empty' }
  if (e.aspects.length >= SIT_MAX) return { err: 'full' }
  return { e: { ...e, aspects: [...e.aspects, { t, inv: 0 }] } }
}
/** Прибрати ситуативний аспект i (один клік, як × у Foundry; ui-rules §3). */
export const rmSit = (e, i) => ({ ...e, aspects: e.aspects.filter((_, k) => k !== i) })
/** Безкоштовні Посилення: which 'b' — аспект ворога, 's' — ситуативний; d ±1, межі 0…INV_MAX. → нова копія або null (не змінилось). */
export function invStep(e, which, i, d) {
  const key = which === 'b' ? 'baseAspects' : 'aspects', list = e[key], a = list && list[i]
  if (!a) return null
  const inv = Math.max(0, Math.min(INV_MAX, a.inv + d))
  if (inv === a.inv) return null
  return { ...e, [key]: list.map((x, k) => k === i ? { ...x, inv } : x) }
}

/** Картка: {cat, armor, armorText, tags, aspects, base, sit, attacks, moves, notes} — усе рядками, для textContent. */
export function cardModel(e) {
  const p = profileOf(e)
  return {
    cat: CAT_LABEL[e.cat] || '',
    hp: { ...e.hp },
    armor: e.armor,
    armorText: armorRest(e),
    tags: profileTags({ ...p, psyArmor: e.psiArmor }).map(t => t[1]),
    aspects: [...e.baseAspects, ...e.aspects].map(a => a.t),
    base: e.baseAspects.map((a, i) => ({ i, t: a.t, inv: a.inv })),   // аспекти ворога (книга чи «Редагувати»)
    sit: e.aspects.map((a, i) => ({ i, t: a.t, inv: a.inv })),         // ситуативні — у картці
    attacks: e.attacks.map((a, i) => {
      const dice = attackDice(e, i), from = bonusFrom(e, i)
      return { i, name: a.name, dice, label: diceLabel(dice), type: a.type, typeName: typeName(a.type), note: a.note,
        ammo: a.ammo, ammoMax: a.ammoMax, bonus: from.length ? andList(from) : '' }
    }),
    moves: e.moves.map((m, i) => {
      const spec = moveSpec(m, e, i), lim = moveLimit(m.t), mk = moveMarks(m, spec)
      return { i, n: m.n, uses: lim.uses, per: lim.per, spent: mk.spent, used: mk.used,
        parts: diceInText(m.t).map(x => typeof x === 'string' ? x : { dice: x.dice, label: x.label, type: x.damage ? x.type : 'phys', damage: x.damage }) }
    }),
    notes: e.notes,
  }
}
/** Підпис ліміту ходу: «раз за сцену», «двічі за сесію». */
export const limitText = m => m.uses ? `${m.uses === 2 ? 'двічі' : 'раз'} за ${m.per === 'session' ? 'сесію' : 'сцену'}` : ''

/** Дані кидка шкоди атаки для buildRoll('edmg'): name — назва атаки, note — примітка (≤ 200 у повідомленні). */
export const attackRoll = (a) => ({ dice: a.dice, type: a.type, name: a.name, note: [a.note, a.bonus ? `+ ${a.bonus}` : ''].filter(Boolean).join('; ') })

export { K_ENEMY }
