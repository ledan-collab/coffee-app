import 'dotenv/config'
import express from 'express'
import { pool } from './db.js'

const app = express()
const port = Number(process.env.PORT) || 3000

app.use(express.json())

app.get('/', (req, res) => {
  res.json({ message: 'COFEAPP server' })
})

try {
  await pool.query('SELECT 1')
} catch (error) {
  console.error('데이터베이스에 연결하지 못했습니다.', error.message)
  process.exit(1)
}

app.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`)
  console.log(`데이터베이스 ${process.env.PGDATABASE}에 연결했습니다.`)
})
