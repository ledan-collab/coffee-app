import { pool } from './db.js'

const menus = [
  {
    name: '아메리카노(ICE)',
    description: '차갑고 깔끔한 에스프레소',
    price: 2500,
    imageUrl: '/아메리카노.webp',
  },
  {
    name: '아메리카노(HOT)',
    description: '따뜻하고 진한 에스프레소',
    price: 2500,
    imageUrl: '/아메리카노HOT.webp',
  },
  {
    name: '말차라떼(ICE)',
    description: '우유를 더한 달콤한 아이스 말차',
    price: 4500,
    imageUrl: '/말차라떼.webp',
  },
]

const options = [
  { name: '샷 추가', price: 500 },
  { name: '시럽 추가', price: 500 },
]

export async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS menus (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price INTEGER NOT NULL CHECK (price >= 0),
      image_url TEXT,
      stock INTEGER NOT NULL CHECK (stock >= 0)
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS options (
      id SERIAL PRIMARY KEY,
      menu_id INTEGER NOT NULL REFERENCES menus (id),
      name TEXT NOT NULL,
      price INTEGER NOT NULL CHECK (price >= 0)
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      ordered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL CHECK (status IN ('주문 접수', '제조 중', '완료')),
      total_price INTEGER NOT NULL CHECK (total_price >= 0)
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders (id),
      menu_id INTEGER NOT NULL REFERENCES menus (id),
      menu_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity >= 1),
      line_price INTEGER NOT NULL CHECK (line_price >= 0)
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_item_options (
      id SERIAL PRIMARY KEY,
      order_item_id INTEGER NOT NULL REFERENCES order_items (id),
      name TEXT NOT NULL,
      price INTEGER NOT NULL CHECK (price >= 0)
    )
  `)

  const existing = await pool.query('SELECT COUNT(*)::int AS count FROM menus')
  if (existing.rows[0].count > 0) {
    return
  }

  for (const menu of menus) {
    const inserted = await pool.query(
      `INSERT INTO menus (name, description, price, image_url, stock)
       VALUES ($1, $2, $3, $4, 10)
       RETURNING id`,
      [menu.name, menu.description, menu.price, menu.imageUrl],
    )
    for (const option of options) {
      await pool.query(
        `INSERT INTO options (menu_id, name, price)
         VALUES ($1, $2, $3)`,
        [inserted.rows[0].id, option.name, option.price],
      )
    }
  }
}
