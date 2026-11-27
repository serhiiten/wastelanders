// Пустельники в Owlbear Rodeo: сховище браузера для сторінок розширення.

/** localStorage або порожня заглушка, якщо браузер його не дає (сторонній iframe у приватному режимі). */
export function safeStorage() {
  try { const s = window.localStorage; s.getItem('x'); return s } catch {
    const m = new Map()
    return { memory: true, getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] || null, get length() { return m.size } }
  }
}
