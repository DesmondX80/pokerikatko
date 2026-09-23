const BASE_URL = 'https://pokerikatko-backend.desmond80x.workers.dev'

async function handle(response) {
  let data
  try {
    data = await response.json()
  } catch (e) {
    throw new Error(`Palvelinvirhe (status ${response.status})`)
  }

  if (!response.ok) {
    throw new Error(data.error || 'Tuntematon virhe')
  }
  return data
}

export async function createGame(players) {
  const res = await fetch(`${BASE_URL}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ players }),
  })
  return handle(res)
}

export async function getState(gameId) {
  const res = await fetch(`${BASE_URL}/${gameId}`)
  return handle(res)
}

export async function draw(gameId, playerId, discards) {
  const res = await fetch(`${BASE_URL}/${gameId}/draw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, discards }),
  })
  return handle(res)
}

export async function playCard(gameId, playerId, card) {
  const res = await fetch(`${BASE_URL}/${gameId}/play-card`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, card }),
  })
  return handle(res)
}

export async function advanceBot(gameId) {
  const res = await fetch(`${BASE_URL}/${gameId}/advance-bot`, {
    method: 'POST',
  })
  return handle(res)
}