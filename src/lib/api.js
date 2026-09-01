/** Thin wrapper over the local API. Everything goes to the machine you're on. */

async function request (path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = body.message || body.error || ''
    } catch { /* non-JSON error body */ }
    const err = new Error(detail || `${res.status} ${res.statusText}`)
    err.status = res.status
    throw err
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  info: () => request('/info'),

  listBoards: () => request('/boards'),
  createBoard: (name) => request('/boards', { method: 'POST', body: { name } }),
  getBoard: (id) => request(`/boards/${id}`),
  updateBoard: (id, patch) => request(`/boards/${id}`, { method: 'PATCH', body: patch }),
  deleteBoard: (id) => request(`/boards/${id}`, { method: 'DELETE' }),

  commit: (boardId, ops) => request(`/boards/${boardId}/commit`, { method: 'POST', body: { ops } }),

  exportBoard: (id) => request(`/boards/${id}/export`),
  importBoard: (payload) => request('/boards/import', { method: 'POST', body: payload })
}
