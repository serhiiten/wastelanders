// Пустельники в Owlbear Rodeo: тло розширення — пункти контекстного меню токена і приймач кидків.
// «Аркуш персонажа» — обом ролям (рішення диспетчера 2026-11-26), «Призначити гравцеві…» — лише Доглядачу.
// Значки різні (автор, 2026-11-26): білі лінії з темним обідком, щоб їх було видно в обох темах Owlbear.
// Кидки (етап 2): тло живе, поки відкрита кімната, навіть коли всі вікна розширення закриті (етап 0), тож саме воно
// приймає кожен кидок, кладе його в журнал цього браузера й показує сповіщення Owlbear — усім, крім того, хто кидав.
import OBR, { buildShape } from './sdk.js'
import { ID, SIZE, openSheet, openEnemies, openCaravan, baseOf, session, winsClear, notifyFor, autoOpenLog, followLogResize, closeContextMenu } from './lib/pick.mjs'
import { T } from './lib/texts.mjs'
import { receiveRolls } from './lib/rolls.mjs'
import { K_ENEMY, K_CARTOK, LAYER_FILTER } from './lib/enemy-bar.mjs'
import { startBars, makeCaravan, removeCaravan } from './lib/enemy-bars.mjs'
import { K } from './lib/store.mjs'
import { startCopies } from './lib/copies.mjs'
import { unpackCaravan } from './lib/caravan-data.mjs'
import { safeStorage } from './lib/storage.mjs'
import { followCounters } from './lib/counters-win.mjs'
import { followMovesBtn } from './lib/moves-win.mjs'

const BASE = baseOf(location.pathname)
// ворожий токен (етап 4, блокер радника 4) і караван-токен (B): без «Аркуш персонажа» і «Призначити гравцеві…», і для Доглядача теж
const token = { max: 1, every: [{ key: 'layer', value: 'CHARACTER' }, { key: ['metadata', K_ENEMY], value: undefined }, { key: ['metadata', K_CARTOK], value: undefined }] }
const isCar = [{ key: ['metadata', K_CARTOK], operator: '!=', value: undefined }]
// після кліку по пункту меню закрити меню Owlbear (lib/pick.mjs, closeContextMenu), лишивши вибір токенів.
// Не для «Призначити гравцеві…»: його вікно стоїть біля пункту меню (anchorElementId) і закривається кліком повз нього.
const closing = f => async (ctx, elementId) => { await closeContextMenu(OBR, ctx.items.map(it => it.id)); return f(ctx, elementId) }

OBR.onReady(async () => {
  OBR.contextMenu.create({
    id: ID.ctxSheet,
    icons: [{ icon: BASE + 'icon.svg', label: T.ctxSheet, filter: { ...token, roles: ['GM', 'PLAYER'] } }],
    onClick: closing(ctx => openSheet(OBR, BASE, ctx.items[0].id)),
  })
  OBR.contextMenu.create({
    id: ID.ctxAssign,
    icons: [{ icon: BASE + 'icon-assign.svg', label: T.ctxAssign, filter: { ...token, roles: ['GM'] } }],
    onClick: (ctx, elementId) => OBR.popover.open({
      id: ID.assign, url: `${BASE}assign.html?item=${encodeURIComponent(ctx.items[0].id)}`, ...SIZE.assign, anchorElementId: elementId,
    }),
  })

  // Етап 4: «Зробити ворогом…» (лише Доглядач, кілька токенів одразу; персонажам сторінка відмовить з поясненням, рядок 4.6)
  // і «Картка ворога» на ворожому токені. Шар CHARACTER або MOUNT (автор, 2026-11-27); умова ключа окремо в some: з max 1
  // це те саме, що every, і не змішується з || шарів.
  OBR.contextMenu.create({
    id: ID.ctxEnemy,
    icons: [{ icon: BASE + 'icon-enemy.svg', label: T.ctxEnemy, filter: { every: LAYER_FILTER, roles: ['GM'] } }],
    onClick: closing(ctx => openEnemies(OBR, BASE, { q: 'make=' + ctx.items.map(it => encodeURIComponent(it.id)).join(',') })),
  })
  OBR.contextMenu.create({
    id: ID.ctxCard,
    icons: [{ icon: BASE + 'icon-card.svg', label: T.ctxCard, filter: { max: 1, every: LAYER_FILTER, some: [{ key: ['metadata', K_ENEMY], operator: '!=', value: undefined }], roles: ['GM'] } }],
    onClick: closing(ctx => openEnemies(OBR, BASE, { q: 'item=' + encodeURIComponent(ctx.items[0].id) })),
  })
  // Караван-токен (автор, 2026-11-27, B): робить лише Доглядач, скільки завгодно токенів; усі показують караван кімнати.
  // Без вікна: відмова (персонаж чи ворог) і «аркуш ще порожній» — сповіщенням Owlbear, решту видно смужками.
  OBR.contextMenu.create({
    id: ID.ctxCarMake,
    icons: [{ icon: BASE + 'icon-caravan-make.svg', label: T.ctxCarMake, filter: { every: LAYER_FILTER, some: [{ key: ['metadata', K_CARTOK], value: undefined }], roles: ['GM'] } }],
    onClick: closing(async ctx => {
      try {
        const res = await makeCaravan(OBR, ctx.items.map(it => it.id))
        if (res.refused.length) await OBR.notification.show(T.carMakeRefused(res.refused.map(r => `«${r.label || '?'}»`).join(', ')), 'WARNING')
        else if (res.made.length && ((await OBR.room.getMetadata()) || {})[K.caravan] === undefined) await OBR.notification.show(T.carMakeEmpty, 'INFO')
      } catch (e) { console.error(e) }
    }),
  })
  OBR.contextMenu.create({
    id: ID.ctxCarSheet,
    icons: [{ icon: BASE + 'icon-caravan.svg', label: T.ctxCarSheet, filter: { max: 1, every: LAYER_FILTER, some: isCar, roles: ['GM', 'PLAYER'] } }],
    onClick: closing(() => openCaravan(OBR, BASE).catch(e => console.error(e))),
  })
  OBR.contextMenu.create({
    id: ID.ctxCarOff,
    icons: [{ icon: BASE + 'icon-caravan-off.svg', label: T.ctxCarOff, filter: { every: LAYER_FILTER, some: isCar, roles: ['GM'] } }],
    onClick: closing(ctx => removeCaravan(OBR, ctx.items.filter(it => it.metadata && it.metadata[K_CARTOK] !== undefined).map(it => it.id)).catch(e => console.error(e))),
  })

  // смужки над токенами (рядок 4.11; A, B): локальні предмети цього клієнта
  const gm = (await OBR.player.getRole()) === 'GM'
  const make = s => {
    const b = buildShape().id(s.id).name(s.name).width(s.width).height(s.height).shapeType(s.shapeType)
      .fillColor(s.style.fillColor).fillOpacity(s.style.fillOpacity).strokeColor(s.style.strokeColor).strokeOpacity(0).strokeWidth(0)
      .position(s.position).attachedTo(s.attachedTo).layer(s.layer).locked(true).disableHit(true).zIndex(s.zIndex)
      .disableAttachmentBehavior(s.disableAttachmentBehavior).metadata(s.metadata)
    return b.build()
  }
  startBars(OBR, { gm, make })

  // копії токенів на сцені (автор, 2026-11-28): номери копіям ворогів і попередження про копію героя чи каравану;
  // пише й попереджає лише тло Доглядача (роль читається на кожну вставку)
  startCopies(OBR, {
    warn: async (heroes, caravan) => {
      if (heroes.length) await OBR.notification.show(T.copyHero(heroes.map(n => `«${n || '?'}»`).join(', ')), 'WARNING')
      if (caravan) {
        let name = ''
        try { const m = ((await OBR.room.getMetadata()) || {})[K.caravan]; const d = m === undefined ? null : await unpackCaravan(m); name = (d && d.st && typeof d.st.companyName === 'string' && d.st.companyName.trim()) || '' } catch { /* без назви */ }
        await OBR.notification.show(T.copyCaravan(name), 'WARNING')
      }
    },
  })

  // Автожурнал і сповіщення (автор, 2026-11-27): кидок будь-кого показує журнал у цій вкладці на 10 с (відкритий з меню —
  // не чіпає); поки журнал відкритий, сповіщення немає; сповіщення — лише тому, хто закрив журнал вручну, і не тому, хто кидав.
  // Тло вантажиться разом зі сторінкою Owlbear, коли жодне наше вікно ще не відкрите: старий реєстр вікон — геть.
  const ss = session()
  winsClear(ss)
  // журнал кидків після зміни розміру вікна браузера — знову над лотком у правій колонці (автор, 2026-11-27)
  followLogResize(OBR, BASE, { ss })
  receiveRolls(OBR, safeStorage(), {
    unknown: T.unknownPlayer,
    notify: notifyFor(ss),
    after: () => autoOpenLog(OBR, BASE, { ss }),
  }).catch(e => console.error(e))
  // лічильники (сесія Б, автор 2026-11-27): віконце над мапою в усіх, поки є хоч один лічильник
  followCounters(OBR, BASE, { gm, ss })
  // табличка «Ходи» в правому верхньому куті — лише Доглядачу (автор, 2026-11-28, фідбек п.8); роль перевіряється щоразу,
  // тож гравець, якого зробили Доглядачем (чи навпаки), отримує чи втрачає її без F5
  followMovesBtn(OBR, BASE, { ss, getRole: () => OBR.player.getRole() })
})
