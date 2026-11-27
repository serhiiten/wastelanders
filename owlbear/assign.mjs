// Пустельники в Owlbear Rodeo: «Призначити гравцеві…» (popover з контекстного меню токена, лише Доглядач).
// Пише NS/owner токена: {n, id} для гравця з кімнати, {n} для імені, набраного вручну; «Нікому» прибирає ключ.
import OBR from './sdk.js'
import { K } from './lib/store.mjs'
import { ID } from './lib/pick.mjs'
import { T } from './lib/texts.mjs'
import { icon } from './lib/icons.mjs'

const itemId = new URLSearchParams(location.search).get('item') || ''
const $ = id => document.getElementById(id)

async function assign(owner) {
  try {
    await OBR.scene.items.updateItems([itemId], items => {
      for (const it of items) { if (owner) it.metadata[K.owner] = owner; else delete it.metadata[K.owner] }
    })
    await OBR.popover.close(ID.assign)
  } catch (e) {
    const err = $('err'); err.textContent = T.assignFailed(String((e && (e.message || (e.error && e.error.message))) || e)); err.hidden = false
  }
}

OBR.onReady(async () => {
  const setTheme = t => document.documentElement.classList.toggle('light', !!t && t.mode === 'LIGHT')
  try { setTheme(await OBR.theme.getTheme()); OBR.theme.onChange(setTheme) } catch { /* тема необов'язкова */ }
  const [[item], players] = await Promise.all([OBR.scene.items.getItems([itemId]), OBR.party.getPlayers()])
  $('h-icon').replaceWith(icon('assign'))
  if (!item) { $('title').textContent = T.noItem; return }
  const owner = item.metadata[K.owner]
  $('title').textContent = T.assignTitle(item.name || '')
  $('now').textContent = T.assignNow(owner && owner.n)
  $('h-players').textContent = T.assignPlayers
  const seen = new Set()
  const list = players.filter(p => p.role !== 'GM' && !seen.has(p.id) && seen.add(p.id))
  if (!list.length) $('players').append(Object.assign(document.createElement('p'), { className: 'mut', textContent: T.assignNoPlayers }))
  for (const p of list.sort((a, b) => a.name.localeCompare(b.name, 'uk'))) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'row-btn'
    const av = document.createElement('span'); av.className = 'av s'; av.setAttribute('aria-hidden', 'true'); av.textContent = [...(p.name || '?')][0]
    const tx = document.createElement('span'); tx.className = 'tx'; tx.textContent = p.name
    b.append(av, tx)
    if (owner && (owner.id === p.id || owner.n === p.name)) { b.classList.add('cur'); b.setAttribute('aria-current', 'true'); b.append(icon('check', 'ck')) }
    b.onclick = () => assign({ n: p.name, id: p.id })
    $('players').append(b)
  }
  $('l-name').textContent = T.assignByName
  $('b-name').textContent = T.assignDo
  $('by-name').onsubmit = e => { e.preventDefault(); const n = $('name').value.trim(); if (n) assign({ n }) }
  $('nobody').replaceChildren(icon('x'), T.assignNobody)
  $('nobody').onclick = () => assign(null)
  $('hint').textContent = T.assignHint
})
