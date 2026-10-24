import express from 'express'
import handler from './vercelHandler.js'

const app = express()

app.disable('x-powered-by')
app.use(express.json({ limit: '8kb', strict: true }))
app.use((request, response) => handler(request, response))
app.use((error, _request, response, next) => {
  if (error?.type === 'entity.parse.failed') {
    response.status(400).json({ error: 'Body JSON tidak valid.' })
    return
  }
  if (error?.type === 'entity.too.large') {
    response.status(413).json({ error: 'Body JSON terlalu besar.' })
    return
  }
  next(error)
})

export default app
