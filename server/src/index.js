import 'dotenv/config'
import express from 'express'
import { api } from './api.js'
import { pool } from './db.js'
import { initDatabase } from './schema.js'

const app = express()
const port = Number(process.env.PORT) || 3000

const allowedOrigins = new Set([
  'http://localhost:5173',
  'https://coffee-app-frontend-2z1o.onrender.com',
])

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

app.use(express.json())

app.get('/', (req, res) => {
  res.json({ message: 'COFEAPP server' })
})

app.use('/api', api)

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error)
    return
  }
  const status = Number.isInteger(error.status) ? error.status : 500
  if (status === 500) {
    console.error(error)
  }
  res.status(status).json({
    message: status === 500 ? '서버 오류가 발생했습니다.' : error.message,
  })
})

try {
  await pool.query('SELECT 1')
  await initDatabase()
} catch (error) {
  console.error('데이터베이스를 준비하지 못했습니다.', error.message)
  process.exit(1)
}

app.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`)
  console.log(`데이터베이스 ${process.env.PGDATABASE}에 연결했습니다.`)
})
