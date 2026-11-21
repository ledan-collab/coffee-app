const apiBase = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.message || '요청에 실패했습니다.')
    error.status = response.status
    throw error
  }
  return data
}

export function fetchMenus() {
  return request('/api/menus')
}

export function fetchAdminMenus() {
  return request('/api/admin/menus')
}

export function fetchOrders() {
  return request('/api/orders')
}

export function createOrder(items) {
  return request('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
}

export function updateStock(menuId, delta) {
  return request(`/api/admin/menus/${menuId}/stock`, {
    method: 'PATCH',
    body: JSON.stringify({ delta }),
  })
}

export function updateOrderStatus(orderId) {
  return request(`/api/orders/${orderId}/status`, {
    method: 'PATCH',
  })
}
