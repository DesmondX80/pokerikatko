import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  GAMES: KVNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors({
  origin: ['https://desmondx80.github.io', 'http://localhost:3000', 'http://localhost:5173'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}))

app.get('/', (c) => c.text('Pokerikatko API pyörii!'))

const SUITS = ['HERTTA', 'RUUTU', 'RISTI', 'PATA']
const RANK_VALUES: Record<string, number> = {
  SIX: 0, SEVEN: 1, EIGHT: 2, NINE: 3, TEN: 4,
  JACK: 5, QUEEN: 6, KING: 7, ACE: 8
}

const RANK_POWER: Record<string, number> = {
  SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10,
  JACK: 11, QUEEN: 12, KING: 13, ACE: 14
}

function createDeck() {
  const deck = []
  for (const suit of SUITS) {
    for (const rank of Object.keys(RANK_VALUES)) {
      deck.push({ suit, rank })
    }
  }
  return deck.sort(() => Math.random() - 0.5)
}

function evaluatePokerHandScore(hand: any[]): number {
  if (!hand || hand.length === 0) return 0

  const powers = hand.map(c => RANK_POWER[c.rank] || 0).sort((a, b) => b - a)
  const isFlush = hand.every(c => c.suit === hand[0].suit)
  const isStraight = (powers[0] - powers[4] === 4) && (new Set(powers).size === 5)

  const counts: Record<string, number> = {}
  for (const card of hand) {
    counts[card.rank] = (counts[card.rank] || 0) + 1
  }

  const entries = Object.keys(counts).map(rank => ({
    rank,
    count: counts[rank],
    power: RANK_POWER[rank] || 0
  }))

  entries.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return b.power - a.power
  })

  const hasFour = entries[0].count === 4
  const hasThree = entries[0].count === 3
  const pairs = entries.filter(e => e.count === 2)
  const hasFullHouse = hasThree && pairs.length > 0

  if (isFlush && isStraight && powers[0] === 14) return 10000000
  if (isFlush && isStraight) return 9000000 + powers[0]
  if (hasFour) {
    const kicker = entries.find(e => e.count === 1)?.power || 0
    return 8000000 + entries[0].power * 100 + kicker
  }
  if (hasFullHouse) return 7000000 + entries[0].power * 100 + pairs[0].power
  if (isFlush) return 6000000 + powers[0] * 10000 + powers[1] * 1000 + powers[2] * 100 + powers[3] * 10 + powers[4]
  if (isStraight) return 5000000 + powers[0]
  if (hasThree) {
    const kickers = entries.filter(e => e.count === 1).sort((a, b) => b.power - a.power)
    let kickerVal = 0
    if (kickers[0]) kickerVal += kickers[0].power * 10
    if (kickers[1]) kickerVal += kickers[1].power
    return 4000000 + entries[0].power * 1000 + kickerVal
  }
  if (pairs.length === 2) {
    pairs.sort((a, b) => b.power - a.power)
    const kicker = entries.find(e => e.count === 1)?.power || 0
    return 3000000 + pairs[0].power * 10000 + pairs[1].power * 100 + kicker
  }
  if (pairs.length === 1) {
    const pairPower = pairs[0].power
    const kickers = entries.filter(e => e.count === 1).sort((a, b) => b.power - a.power)
    let kickerVal = 0
    if (kickers[0]) kickerVal += kickers[0].power * 100
    if (kickers[1]) kickerVal += kickers[1].power * 10
    if (kickers[2]) kickerVal += kickers[2].power
    return 2000000 + pairPower * 10000 + kickerVal
  }
  return 1000000 + powers[0] * 10000 + powers[1] * 1000 + powers[2] * 100 + powers[3] * 10 + powers[4]
}

function evaluateHandDescription(hand: any[]): string {
  if (!hand || hand.length === 0) return 'Käsi tyhjä'

  const powers = hand.map(c => RANK_POWER[c.rank] || 0).sort((a, b) => b - a)
  const isFlush = hand.every(c => c.suit === hand[0].suit)
  const isStraight = (powers[0] - powers[4] === 4) && (new Set(powers).size === 5)

  const counts: Record<string, number> = {}
  for (const card of hand) {
    counts[card.rank] = (counts[card.rank] || 0) + 1
  }
  const values = Object.values(counts)
  const pairs = values.filter(v => v === 2).length
  const hasThree = values.includes(3)
  const hasFour = values.includes(4)

  if (isFlush && isStraight) {
    if (powers[0] === 14) return 'Kuningasvärisuora'
    return 'Värisuora'
  }
  if (hasFour) return 'Neljä samaa'
  if (hasThree && pairs > 0) return 'Täyskäsi'
  if (isFlush) return 'Väri'
  if (isStraight) return 'Suora'
  if (hasThree) return 'Kolmoset'
  if (pairs === 2) return 'Kaksi paria'
  if (pairs === 1) return 'Pari'
  return 'Haita'
}

function updateAiTurnPending(state: any) {
  if (state.phase === 'DEALT') {
    const nextDrawing = state.players.find((p: any) => !p.hasDrawn)
    state.aiTurnPending = !!(nextDrawing && nextDrawing.ai)
  } else if (state.phase === 'TRICK_TAKING') {
    const currentActor = state.players.find((p: any) => p.id === state.playerToActId)
    state.aiTurnPending = !!(currentActor && currentActor.ai)
  } else {
    state.aiTurnPending = false
  }
}

app.post('/api/createGame', async (c) => {
  const body = await c.req.json()
  const gameId = Math.random().toString(36).substring(2, 9)
  const deck = createDeck()

  const players = body.players.map((p: any, index: number) => ({
    id: `player-${index + 1}`,
    name: p.name,
    ai: p.ai,
    hand: deck.splice(0, 5),
    hasDrawn: false,
  }))

  const gameState = {
    gameId,
    players,
    deckSize: deck.length,
    deck,
    phase: 'DEALT',
    playerToActId: players[0].id,
    tricks: [],
    completedTricksCount: 0,
    aiTurnPending: false,
    pokerHandsSnapshot: {},
    snapshotPokerHands: {},
  }

  updateAiTurnPending(gameState)
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
  const player = state.players.find((p: any) => p.id === body.playerId)
  if (!player) return c.json({ error: 'Pelaajaa ei löytynyt' }, 400)

  player.hand = player.hand.filter((card: any) =>
      !body.discards.some((d: any) => d.suit === card.suit && d.rank === card.rank)
  )

  while (player.hand.length < 5 && state.deck.length > 0) {
    player.hand.push(state.deck.pop())
  }
  player.hasDrawn = true
  state.deckSize = state.deck.length

  const allDone = state.players.every((p: any) => p.hasDrawn)
  if (allDone) {
    state.phase = 'TRICK_TAKING'
    state.playerToActId = state.players[0].id

    state.pokerHandsSnapshot = {}
    state.snapshotPokerHands = {}
    for (const p of state.players) {
      state.pokerHandsSnapshot[p.id] = [...p.hand]
      state.snapshotPokerHands[p.id] = evaluateHandDescription(p.hand)
    }
  }

  updateAiTurnPending(state)
  await c.env.GAMES.put(gameId, JSON.stringify(state))
  return c.json(state)
})

app.post('/api/:gameId/play-card', async (c) => {
  const gameId = c.req.param('gameId')
  const body = await c.req.json()
  const gameData = await c.env.GAMES.get(gameId)
  if (!gameData) return c.json({ error: 'Peliä ei löytynyt' }, 404)

  const state = JSON.parse(gameData)
  const player = state.players.find((p: any) => p.id === body.playerId)
  if (!player) return c.json({ error: 'Pelaajaa ei löytynyt' }, 400)

  if (!state.tricks) state.tricks = []
  let currentTrick = state.tricks.find((t: any) => t.inProgress)
  const ledSuit = currentTrick && currentTrick.plays.length > 0 ? currentTrick.ledSuit : null

  // Tunnustamispakko: jos maata löytyy kädestä, sitä on pakko pelata
  if (ledSuit) {
    const hasLedSuit = player.hand.some((card: any) => card.suit === ledSuit)
    if (hasLedSuit && body.card.suit !== ledSuit) {
      return c.json({ error: 'Sinun täytyy tunnustaa maata!' }, 400)
    }
  }

  player.hand = player.hand.filter((card: any) =>
      !(card.suit === body.card.suit && card.rank === body.card.rank)
  )

  if (!currentTrick) {
    currentTrick = { plays: [], inProgress: true, ledSuit: body.card.suit }
    state.tricks.push(currentTrick)
  }

  currentTrick.plays.push({ playerId: body.playerId, card: body.card })

  if (currentTrick.plays.length === state.players.length) {
    currentTrick.inProgress = false
    state.completedTricksCount = (state.completedTricksCount || 0) + 1

    let bestPlay = currentTrick.plays[0]
    for (const play of currentTrick.plays) {
      if (play.card.suit === currentTrick.ledSuit) {
        if ((RANK_VALUES[play.card.rank] || 0) > (RANK_VALUES[bestPlay.card.rank] || 0)) {
          bestPlay = play
        }
      }
    }
    state.lastTrickWinnerId = bestPlay.playerId
    state.playerToActId = bestPlay.playerId

    if (state.players.every((p: any) => p.hand.length === 0)) {
      state.phase = 'FINISHED'

      let bestPokerPlayer = state.players[0]
      let maxPokerScore = -1
      for (const p of state.players) {
        const handToCheck = state.pokerHandsSnapshot?.[p.id] || p.hand
        const score = evaluatePokerHandScore(handToCheck)
        if (score > maxPokerScore) {
          maxPokerScore = score
          bestPokerPlayer = p
        }
      }
      state.bestPokerHandPlayerId = bestPokerPlayer.id
    }
  } else {
    const currentPlayerIndex = state.players.findIndex((p: any) => p.id === body.playerId)
    const nextPlayerIndex = (currentPlayerIndex + 1) % state.players.length
    state.playerToActId = state.players[nextPlayerIndex].id
  }

  updateAiTurnPending(state)
  await c.env.GAMES.put(gameId, JSON.stringify(state))
  return c.json(state)
})

app.post('/api/:gameId/advance-bot', async (c) => {
  const gameId = c.req.param('gameId')
  const gameData = await c.env.GAMES.get(gameId)
  if (!gameData) return c.json({ error: 'Peliä ei löytynyt' }, 404)

  const state = JSON.parse(gameData)

  if (state.phase === 'DEALT') {
    for (const p of state.players) {
      if (p.ai && !p.hasDrawn) {
        p.hasDrawn = true
      }
    }
    const allDone = state.players.every((p: any) => p.hasDrawn)
    if (allDone) {
      state.phase = 'TRICK_TAKING'
      state.playerToActId = state.players[0].id

      state.pokerHandsSnapshot = {}
      state.snapshotPokerHands = {}
      for (const p of state.players) {
        state.pokerHandsSnapshot[p.id] = [...p.hand]
        state.snapshotPokerHands[p.id] = evaluateHandDescription(p.hand)
      }
    }
  } else if (state.phase === 'TRICK_TAKING') {
    const currentBot = state.players.find((p: any) => p.id === state.playerToActId && p.ai)
    if (currentBot && currentBot.hand && currentBot.hand.length > 0) {
      if (!state.tricks) state.tricks = []
      let currentTrick = state.tricks.find((t: any) => t.inProgress)
      const ledSuit = currentTrick && currentTrick.plays.length > 0 ? currentTrick.ledSuit : null

      let cardToPlay = ledSuit ? currentBot.hand.find((card: any) => card.suit === ledSuit) : null
      if (!cardToPlay) {
        cardToPlay = currentBot.hand[0]
      }

      currentBot.hand = currentBot.hand.filter((card: any) =>
          !(card.suit === cardToPlay.suit && card.rank === cardToPlay.rank)
      )

      if (!currentTrick) {
        currentTrick = { plays: [], inProgress: true, ledSuit: cardToPlay.suit }
        state.tricks.push(currentTrick)
      }

      currentTrick.plays.push({ playerId: currentBot.id, card: cardToPlay })

      if (currentTrick.plays.length === state.players.length) {
        currentTrick.inProgress = false
        state.completedTricksCount = (state.completedTricksCount || 0) + 1

        let bestPlay = currentTrick.plays[0]
        for (const play of currentTrick.plays) {
          if (play.card.suit === currentTrick.ledSuit) {
            if ((RANK_VALUES[play.card.rank] || 0) > (RANK_VALUES[bestPlay.card.rank] || 0)) {
              bestPlay = play
            }
          }
        }
        state.lastTrickWinnerId = bestPlay.playerId
        state.playerToActId = bestPlay.playerId

        if (state.players.every((p: any) => p.hand.length === 0)) {
          state.phase = 'FINISHED'

          let bestPokerPlayer = state.players[0]
          let maxPokerScore = -1
          for (const p of state.players) {
            const handToCheck = state.pokerHandsSnapshot?.[p.id] || p.hand
            const score = evaluatePokerHandScore(handToCheck)
            if (score > maxPokerScore) {
              maxPokerScore = score
              bestPokerPlayer = p
            }
          }
          state.bestPokerHandPlayerId = bestPokerPlayer.id
        }
      } else {
        const currentPlayerIndex = state.players.findIndex((p: any) => p.id === currentBot.id)
        const nextPlayerIndex = (currentPlayerIndex + 1) % state.players.length
        state.playerToActId = state.players[nextPlayerIndex].id
      }
    }
  }

  updateAiTurnPending(state)
  await c.env.GAMES.put(gameId, JSON.stringify(state))
  return c.json(state)
})

export default app