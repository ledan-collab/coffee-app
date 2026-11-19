import { Router } from 'express'
import { pool } from './db.js'

export const api = Router()

const nextStatus = {
  '주문 접수': '제조 중',
  '제조 중': '완료',
}

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function parseId(value) {
  const id = Number(value)
  if (!Number.isInteger(id) || id < 1) {
    return null
  }
  return id
}

function normalizeItems(body) {
  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    throw httpError(400, '주문 항목이 없습니다.')
  }

  return body.items.map((item) => {
    const menuId = item?.menuId
    const quantity = item?.quantity
    const optionIds = item?.optionIds ?? []
    const validItem =
      Number.isInteger(menuId) &&
      menuId >= 1 &&
      Number.isInteger(quantity) &&
      quantity >= 1 &&
      Array.isArray(optionIds) &&
      optionIds.every((id) => Number.isInteger(id) && id >= 1)
    if (!validItem) {
      throw httpError(400, '주문 항목이 올바르지 않습니다.')
    }
    if (new Set(optionIds).size !== optionIds.length) {
      throw httpError(400, '같은 옵션을 중복해서 선택할 수 없습니다.')
    }
    return { menuId, quantity, optionIds }
  })
}

function mapMenus(rows, includeStock) {
  const menus = new Map()
  for (const row of rows) {
    if (!menus.has(row.id)) {
      const menu = {
        id: row.id,
        name: row.name,
        description: row.description,
        price: row.price,
        imageUrl: row.image_url,
        options: [],
      }
      if (includeStock) {
        menu.stock = row.stock
      }
      menus.set(row.id, menu)
    }
    if (row.option_id) {
      menus.get(row.id).options.push({
        id: row.option_id,
        name: row.option_name,
        price: row.option_price,
      })
    }
  }
  return [...menus.values()]
}

function mapOrders(rows) {
  const orders = new Map()
  for (const row of rows) {
    if (!orders.has(row.id)) {
      orders.set(row.id, {
        id: row.id,
        orderedAt: row.ordered_at,
        status: row.status,
        totalPrice: row.total_price,
        items: new Map(),
      })
    }
    if (!row.item_id) {
      continue
    }
    const items = orders.get(row.id).items
    if (!items.has(row.item_id)) {
      items.set(row.item_id, {
        menuId: row.menu_id,
        menuName: row.menu_name,
        quantity: row.quantity,
        linePrice: row.line_price,
        options: [],
      })
    }
    if (row.option_name) {
      items.get(row.item_id).options.push({
        name: row.option_name,
        price: row.option_price,
      })
    }
  }

  return [...orders.values()].map((order) => ({
    id: order.id,
    orderedAt: order.orderedAt,
    status: order.status,
    totalPrice: order.totalPrice,
    items: [...order.items.values()],
  }))
}

async function listMenus(includeStock) {
  const result = await pool.query(`
    SELECT
      menus.id,
      menus.name,
      menus.description,
      menus.price,
      menus.image_url,
      menus.stock,
      options.id AS option_id,
      options.name AS option_name,
      options.price AS option_price
    FROM menus
    LEFT JOIN options ON options.menu_id = menus.id
    ORDER BY menus.id, options.id
  `)
  return mapMenus(result.rows, includeStock)
}

async function listOrders(orderId = null) {
  const result = await pool.query(
    `
      SELECT
        orders.id,
        orders.ordered_at,
        orders.status,
        orders.total_price,
        order_items.id AS item_id,
        order_items.menu_id,
        order_items.menu_name,
        order_items.quantity,
        order_items.line_price,
        order_item_options.name AS option_name,
        order_item_options.price AS option_price
      FROM orders
      LEFT JOIN order_items ON order_items.order_id = orders.id
      LEFT JOIN order_item_options ON order_item_options.order_item_id = order_items.id
      WHERE ($1::int IS NULL OR orders.id = $1)
      ORDER BY orders.ordered_at DESC, orders.id DESC, order_items.id, order_item_options.id
    `,
    [orderId],
  )
  return mapOrders(result.rows)
}

async function createOrder(body) {
  const items = normalizeItems(body)
  const menuIds = [...new Set(items.map((item) => item.menuId))]
  const optionIds = [...new Set(items.flatMap((item) => item.optionIds))]
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const menuResult = await client.query(
      'SELECT id, name, price, stock FROM menus WHERE id = ANY($1::int[]) FOR UPDATE',
      [menuIds],
    )
    if (menuResult.rowCount !== menuIds.length) {
      throw httpError(404, '메뉴를 찾을 수 없습니다.')
    }

    const optionResult = optionIds.length
      ? await client.query(
          'SELECT id, menu_id, name, price FROM options WHERE id = ANY($1::int[])',
          [optionIds],
        )
      : { rowCount: 0, rows: [] }
    if (optionResult.rowCount !== optionIds.length) {
      throw httpError(404, '옵션을 찾을 수 없습니다.')
    }

    const menus = new Map(menuResult.rows.map((menu) => [menu.id, menu]))
    const options = new Map(optionResult.rows.map((option) => [option.id, option]))
    const quantityByMenu = new Map()
    const pricedItems = items.map((item) => {
      const menu = menus.get(item.menuId)
      const selectedOptions = item.optionIds.map((optionId) => {
        const option = options.get(optionId)
        if (option.menu_id !== item.menuId) {
          throw httpError(400, '옵션이 해당 메뉴에 연결되어 있지 않습니다.')
        }
        return option
      })
      quantityByMenu.set(item.menuId, (quantityByMenu.get(item.menuId) ?? 0) + item.quantity)
      const extra = selectedOptions.reduce((sum, option) => sum + option.price, 0)
      return {
        ...item,
        menuName: menu.name,
        options: selectedOptions,
        linePrice: (menu.price + extra) * item.quantity,
      }
    })

    for (const [menuId, quantity] of quantityByMenu) {
      if (menus.get(menuId).stock < quantity) {
        throw httpError(409, '재고가 부족합니다.')
      }
    }

    const totalPrice = pricedItems.reduce((sum, item) => sum + item.linePrice, 0)
    const orderResult = await client.query(
      `INSERT INTO orders (status, total_price)
       VALUES ('주문 접수', $1)
       RETURNING id`,
      [totalPrice],
    )
    const orderId = orderResult.rows[0].id

    for (const item of pricedItems) {
      const itemResult = await client.query(
        `INSERT INTO order_items (order_id, menu_id, menu_name, quantity, line_price)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [orderId, item.menuId, item.menuName, item.quantity, item.linePrice],
      )
      for (const option of item.options) {
        await client.query(
          `INSERT INTO order_item_options (order_item_id, name, price)
           VALUES ($1, $2, $3)`,
          [itemResult.rows[0].id, option.name, option.price],
        )
      }
    }

    for (const [menuId, quantity] of quantityByMenu) {
      await client.query('UPDATE menus SET stock = stock - $1 WHERE id = $2', [quantity, menuId])
    }

    await client.query('COMMIT')
    const orders = await listOrders(orderId)
    return orders[0]
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

api.get('/', (req, res) => {
  res.json({
    message: 'COFEAPP API',
    menus: '/api/menus',
    orders: '/api/orders',
  })
})

api.get('/menus', async (req, res) => {
  res.json(await listMenus(false))
})

api.get('/admin/menus', async (req, res) => {
  res.json(await listMenus(true))
})

api.patch('/admin/menus/:menuId/stock', async (req, res) => {
  const menuId = parseId(req.params.menuId)
  const delta = req.body?.delta
  if (!menuId) {
    throw httpError(400, '메뉴 ID가 올바르지 않습니다.')
  }
  if (delta !== 1 && delta !== -1) {
    throw httpError(400, '재고 변경 값은 1 또는 -1이어야 합니다.')
  }

  const result = await pool.query(
    `UPDATE menus
     SET stock = GREATEST(0, stock + $1)
     WHERE id = $2
     RETURNING id, stock`,
    [delta, menuId],
  )
  if (result.rowCount === 0) {
    throw httpError(404, '메뉴를 찾을 수 없습니다.')
  }
  res.json(result.rows[0])
})

api.get('/orders', async (req, res) => {
  res.json(await listOrders())
})

api.get('/orders/:orderId', async (req, res) => {
  const orderId = parseId(req.params.orderId)
  if (!orderId) {
    throw httpError(400, '주문 ID가 올바르지 않습니다.')
  }
  const orders = await listOrders(orderId)
  if (orders.length === 0) {
    throw httpError(404, '주문을 찾을 수 없습니다.')
  }
  res.json(orders[0])
})

api.post('/orders', async (req, res) => {
  const order = await createOrder(req.body)
  res.status(201).json(order)
})

api.patch('/orders/:orderId/status', async (req, res) => {
  const orderId = parseId(req.params.orderId)
  if (!orderId) {
    throw httpError(400, '주문 ID가 올바르지 않습니다.')
  }

  const current = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId])
  if (current.rowCount === 0) {
    throw httpError(404, '주문을 찾을 수 없습니다.')
  }
  const status = nextStatus[current.rows[0].status]
  if (!status) {
    throw httpError(409, '완료된 주문은 상태를 바꿀 수 없습니다.')
  }

  await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId])
  const orders = await listOrders(orderId)
  res.json(orders[0])
})
