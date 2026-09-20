import { useState } from 'react'
import CardView from './components/CardView.jsx'
import { createGame, draw, playCard } from './api.js'

const PHASE_LABELS = {
  DEALT: 'Pokerivaihto käynnissä',
  DRAW_DONE: 'Vaihto valmis',
  TRICK_TAKING: 'Tikkipeli käynnissä',
  FINISHED: 'Kierros päättyi',
}

// Sijoittaa pelaajan pöydän ympärille tasaisin välein, ensimmäinen ylhäällä, sitten myötäpäivään.
function seatStyle(index, total) {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2
  const rx = 42 // vaakasäde prosentteina
  const ry = 40 // pystysäde prosentteina
  const left = 50 + rx * Math.cos(angle)
  const top = 50 + ry * Math.sin(angle)
  return { left: `${left}%`, top: `${top}%` }
}

// Kerää pelaajan kaikki tähän mennessä pelaamat kortit kierroksen aikana, pelijärjestyksessä.
function collectSeatCards(tricks, playerId) {
  const cards = []
  for (const trick of tricks) {
    const play = trick.plays.find((p) => p.playerId === playerId)
    if (play) cards.push(play.card)
  }
  return cards
}

export default function App() {
  const [state, setState] = useState(null)
  const [players, setPlayers] = useState([
    { name: 'Pelaaja 1', ai: false },
    { name: 'Pelaaja 2', ai: false },
  ])
  const [error, setError] = useState('')

  // Pokerivaihtoa varten: kuka on juuri nyt valittuna vaihtamaan
  const [drawingPlayerId, setDrawingPlayerId] = useState(null)
  const [selectedDiscards, setSelectedDiscards] = useState([])

  async function handleCreateGame() {
    try {
      setError('')
      const cleanPlayers = players
        .map((p) => ({ name: p.name.trim(), ai: p.ai }))
        .filter((p) => p.name)
      if (cleanPlayers.length < 2) {
        setError('Tarvitaan vähintään 2 pelaajaa')
        return
      }
      const data = await createGame(cleanPlayers)
      setState(data)
      setDrawingPlayerId(data.players.find((p) => !p.ai && !p.hasDrawn)?.id ?? null)
    } catch (e) {
      setError(e.message)
    }
  }

  function toggleDiscard(card) {
    const key = card.suit + card.rank
    setSelectedDiscards((prev) => {
      const exists = prev.find((c) => c.suit + c.rank === key)
      if (exists) return prev.filter((c) => c.suit + c.rank !== key)
      return [...prev, card]
    })
  }

  async function handleSubmitDraw() {
    try {
      setError('')
      const data = await draw(state.gameId, drawingPlayerId, selectedDiscards)
      setState(data)
      setSelectedDiscards([])
      const next = data.players.find((p) => !p.ai && !p.hasDrawn)
      setDrawingPlayerId(next ? next.id : null)
    } catch (e) {
      setError(e.message)
    }
  }

  async function handlePlayCard(card) {
    try {
      setError('')
      const data = await playCard(state.gameId, state.playerToActId, card)
      setState(data)
    } catch (e) {
      setError(e.message)
    }
  }

  if (!state) {
    return (
      <div className="app">
        <h1>🂡 Pokerikatko</h1>
        <p className="subtitle">Pokerivaihto + tikkipeli samoilla korteilla</p>
        <div className="setup">
          {error && <div className="error">{error}</div>}
          {players.map((player, i) => (
            <div key={i} className="player-row">
              <input
                value={player.name}
                onChange={(e) => {
                  const copy = [...players]
                  copy[i] = { ...copy[i], name: e.target.value }
                  setPlayers(copy)
                }}
                placeholder={`Pelaaja ${i + 1}`}
              />
              <label className="ai-checkbox">
                <input
                  type="checkbox"
                  checked={player.ai}
                  onChange={(e) => {
                    const copy = [...players]
                    copy[i] = { ...copy[i], ai: e.target.checked }
                    setPlayers(copy)
                  }}
                />
                🤖 Botti
              </label>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              onClick={() =>
                setPlayers([...players, { name: `Pelaaja ${players.length + 1}`, ai: false }])
              }
            >
              + Lisää pelaaja
            </button>
            {players.length > 2 && (
              <button onClick={() => setPlayers(players.slice(0, -1))}>- Poista</button>
            )}
          </div>
          <button onClick={handleCreateGame}>Jaa kortit ja aloita</button>
        </div>
      </div>
    )
  }

  const drawingPlayer = state.players.find((p) => p.id === drawingPlayerId)
  const activeTrickPlayer = state.players.find((p) => p.id === state.playerToActId)

  return (
    <div className="app">
      <h1>🂡 Pokerikatko</h1>

      {error && <div className="error">{error}</div>}

      <div className="scoreboard">
        {state.players.map((p) => (
          <div
            key={p.id}
            className={'player-badge' + (p.id === (drawingPlayerId || state.playerToActId) ? ' active' : '')}
          >
            <div className="name">
              {p.name} {p.ai && '🤖'}
            </div>
            <div className="score">{p.score} p</div>
          </div>
        ))}
      </div>

      <div className="phase-banner">{PHASE_LABELS[state.phase] || state.phase}</div>

      {state.phase === 'DEALT' && drawingPlayer && (
        <div className="player-panel">
          <p>
            <strong>{drawingPlayer.name}</strong>: valitse hylättävät kortit (0-5) ja vaihda.
            Muut eivät katso! 🙈
          </p>
          <div className="hand">
            {drawingPlayer.hand.map((card, i) => (
              <CardView
                key={i}
                card={card}
                selected={selectedDiscards.some((c) => c.suit === card.suit && c.rank === card.rank)}
                onClick={() => toggleDiscard(card)}
              />
            ))}
          </div>
          <button onClick={handleSubmitDraw}>
            Vaihda {selectedDiscards.length} korttia
          </button>
        </div>
      )}

      {state.phase === 'DEALT' && !drawingPlayer && (
        <p>Kaikki ovat vaihtaneet, käsitellään...</p>
      )}

      {state.phase === 'TRICK_TAKING' && (() => {
        const currentTrick = state.tricks.find((t) => t.inProgress)
        return (
          <>
            <div className="poker-table">
              {state.players.map((p, i) => {
                const cards = collectSeatCards(state.tricks, p.id)
                const isActing = p.id === state.playerToActId
                return (
                  <div key={p.id} className="seat" style={seatStyle(i, state.players.length)}>
                    {cards.length > 0 ? (
                      <div className="card-row">
                        {cards.map((card, idx) => (
                          <div
                            key={idx}
                            className="card-row-item"
                            style={{ marginLeft: idx === 0 ? 0 : -30, zIndex: idx }}
                          >
                            <CardView card={card} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="card-slot-empty" />
                    )}
                    <div className={'seat-name' + (isActing ? ' active' : '')}>
                      {p.name} {p.ai && '🤖'}
                    </div>
                  </div>
                )
              })}
            </div>

            {activeTrickPlayer && (
              <div className="player-panel">
                <p>
                  <strong>{activeTrickPlayer.name}</strong> on vuorossa
                  {currentTrick?.ledSuit
                    ? ` — tunnusta väri ${currentTrick.ledSuit} jos mahdollista`
                    : ' — avaa tikki'}
                </p>
                <div className="hand">
                  {activeTrickPlayer.hand.map((card, i) => (
                    <CardView key={i} card={card} onClick={() => handlePlayCard(card)} />
                  ))}
                </div>
              </div>
            )}
            <p style={{ textAlign: 'center', opacity: 0.7 }}>
              Tikkejä pelattu: {state.completedTricksCount} / 5
            </p>
          </>
        )
      })()}

      {state.phase === 'FINISHED' && (
        <div className="result-box">
          <h3>Kierroksen tulokset</h3>
          <p>
            🏆 Viimeisen tikin voitti:{' '}
            <strong>{state.players.find((p) => p.id === state.lastTrickWinnerId)?.name}</strong> (+1 p)
          </p>
          <p>
            🃏 Parhaan pokerikäden sai:{' '}
            <strong>{state.players.find((p) => p.id === state.bestPokerHandPlayerId)?.name}</strong> (+1 p)
          </p>
          <h4>Kädet vaihdon jälkeen:</h4>
          <ul>
            {state.players.map((p) => (
              <li key={p.id}>
                {p.name}: {state.snapshotPokerHands?.[p.id]}
              </li>
            ))}
          </ul>
          <button onClick={() => setState(null)}>Uusi peli</button>
        </div>
      )}
    </div>
  )
}
