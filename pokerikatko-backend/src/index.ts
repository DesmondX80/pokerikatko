import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { advanceBotTurn, applyDraw, applyPlayCard, createGameState, updateAiTurnPending } from './game'

export { PokerTable } from './table'

type Bindings = {
  GAMES: KVNamespace
  TABLES: DurableObjectNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors({
  origin: ['https://desmondx80.github.io', 'http://localhost:3000', 'http://localhost:5173'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}))

app.get('/', (c) => c.text('Pokerikatko API pyörii!'))

// Moninpeli: jokainen pöydän nimi ohjataan omalle Durable Objectilleen
app.get('/ws/tables/:tableName', (c) => {
  if (c.req.header('Upgrade') !== 'websocket') {
    return c.text('Odotettiin WebSocket-yhteyttä', 426)
  }
  const tableName = c.req.param('tableName').trim()
  if (!tableName || tableName.length > 30) {
    return c.text('Virheellinen pöydän nimi', 400)
  }
  const id = c.env.TABLES.idFromName(tableName.toLowerCase())
  return c.env.TABLES.get(id).fetch(c.req.raw)
})

app.post('/api/createGame', async (c) => {
  const body = await c.req.json()
  const gameId = Math.random().toString(36).substring(2, 9)
  const gameState = createGameState(gameId, body.players.map((p: any) => ({ name: p.name, ai: p.ai })))

  await c.env.GAMES.put(gameId, JSON.stringify(gameState))
  return c.json(gameState)
})

app.get('/api/:gameId', async (c) => {
  const gameId = c.req.param('gameId')
  const gameData = await c.env.GAMES.get(gameId)
  if (!gameData) return c.json({ error: 'Peliä ei löytynyt' }, 404)
  const state = JSON.parse(gameData)
  updateAiTurnPending(state)
  return c.json(state)
})

app.post('/api/:gameId/draw', async (c) => {
  const gameId = c.req.param('gameId')
  const body = await c.req.json()
  const gameData = await c.env.GAMES.get(gameId)
  if (!gameData) return c.json({ error: 'Peliä ei löytynyt' }, 404)

  const state = JSON.parse(gameData)
  const error = applyDraw(state, body.playerId, body.discards)
  if (error) return c.json({ error }, 400)

  await c.env.GAMES.put(gameId, JSON.stringify(state))
  return c.json(state)
})

app.post('/api/:gameId/play-card', async (c) => {
  const gameId = c.req.param('gameId')
  const body = await c.req.json()
  const gameData = await c.env.GAMES.get(gameId)
  if (!gameData) return c.json({ error: 'Peliä ei löytynyt' }, 404)

  const state = JSON.parse(gameData)
  const error = applyPlayCard(state, body.playerId, body.card)
  if (error) return c.json({ error }, 400)

  await c.env.GAMES.put(gameId, JSON.stringify(state))
  return c.json(state)
})

app.post('/api/:gameId/advance-bot', async (c) => {
  const gameId = c.req.param('gameId')
  const gameData = await c.env.GAMES.get(gameId)
  if (!gameData) return c.json({ error: 'Peliä ei löytynyt' }, 404)

  const state = JSON.parse(gameData)
  advanceBotTurn(state)

  await c.env.GAMES.put(gameId, JSON.stringify(state))
  return c.json(state)
})

export default app
