// import.meta.env.BASE_URL is "/UBMV/" (from vite.config.js), so calls go to /UBMV/api/...
const API = `${import.meta.env.BASE_URL}api`;

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const api = {
  getTodos: () => request('/todos'),
  getProfile: () => request('/profile'),
  addTodo: (todo) => request('/todos', { method: 'POST', body: JSON.stringify(todo) }),
  updateTodo: (id, patch) => request(`/todos/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteTodo: (id) => request(`/todos/${id}`, { method: 'DELETE' }),
  complete: (id) => request(`/todos/${id}/complete`, { method: 'POST' }),
  uncomplete: (id) => request(`/todos/${id}/uncomplete`, { method: 'POST' }),
};
