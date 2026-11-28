// Пустельники в Owlbear Rodeo: відкрити ворога у «Ворогах» ззовні (автор, 2026-11-28, п.3 фідбеку — посилання з тексту
// «Швидкого старту»). id — id актора Foundry: ворога пригоди «Швидкий старт» (@UUID[Actor.<id>]) чи бестіарію
// (@UUID[Compendium.….opponents.Actor.<id>]). «Вороги» відкриваються на картці з бестіарію (лише перегляд, атаки кидаються),
// де кнопка «Зробити вибрані токени ворогом «…»» робить вибрані на мапі токени цим ворогом. Невідомий id — список.
// Легкий модуль: без бестіарію, щоб сторінка, яка кличе, не тягла його дані.
import { openEnemies } from './pick.mjs'

/** id актора Foundry: 16 знаків латиниці й цифр (як src запису ворога на токені). */
export const isEnemyId = id => typeof id === 'string' && /^[A-Za-z0-9]{1,24}$/.test(id)

/** Адреса «Ворогів» для id: рядок запиту без «?». */
export const enemyCardQuery = id => isEnemyId(id) ? 'book=' + encodeURIComponent(id) : ''

/**
 * Відкрити «Вороги» на картці ворога id біля краю, протилежного вікну, що кличе (side — його бік, 'left' чи 'right').
 * @returns {Promise<void>}
 */
export function openEnemyCard(OBR, base, id, { side = 'left', ...opts } = {}) {
  return openEnemies(OBR, base, { ...opts, q: enemyCardQuery(id), dock: side === 'right' ? 'left' : 'right' })
}
