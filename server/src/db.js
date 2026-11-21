import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg
const host = process.env.PGHOST
const useSsl = host?.includes('render.com') || host?.startsWith('dpg-')

export const pool = new Pool({
  host,
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
})
