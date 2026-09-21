import { useEffect, useRef, useState } from 'react'
import CardView, { CardBack } from './components/CardView.jsx'
import { advanceBot, createGame, draw, playCard } from './api.js'

const PHASE_LABELS = {
  DEALT: 'Pokerivaihto käynnissä',
  DRAW_DONE: 'Vaihto valmis',
  TRICK_TAKING: 'Tikkipeli käynnissä',
  FINISHED: 'Kierros päättyi',
}

function seatStyle(index, total) {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2
  // Vähennetty hieman vertikaalisädettä (ry=34), jotta kortit pysyvät hyvin pöydällä
  const rx = 38
  const ry = 34
  const left = 50 + rx * Math.cos(angle)
  const top = 50 + ry * Math.sin(angle)
  return { left: `${left}%`, top: `${top}%` }
}

function frontSeatIndex(total) {
  return Math.floor(total / 2)
}

function rotatedSeatIndex(originalIndex, total, anchorIndex) {
  if (anchorIndex == null || anchorIndex < 0) return originalIndex
  return (originalIndex - anchorIndex + frontSeatIndex(total) + total) % total
}

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

  const [drawingPlayerId, setDrawingPlayerId] = useState(null)
  const [selectedDiscards, setSelectedDiscards] = useState([])
  const [isWaitingForBots, setIsWaitingForBots] = useState(false)
  const [playingCardKey, setPlayingCardKey] = useState(null)
  const [transitionPhase, setTransitionPhase] = useState('IDLE')
  const [animDiscards, setAnimDiscards] = useState([])
  const [animDraws, setAnimDraws] = useState([])
  const [tempHand, setTempHand] = useState([])
  const lastAdvanceSignatureRef = useRef(null)
  const activeGameIdRef = useRef(null)
  activeGameIdRef.current = state ? state.gameId : null
  const lastHumanAnchorRef = useRef(null)

  function applyState(data) {
    setState(data)
    setPlayingCardKey(null)
    if (data.phase === 'DEALT') {
      const next = data.players.find((p) => !p.ai && !p.hasDrawn)
      setDrawingPlayerId(next ? next.id : null)
    } else {
      setDrawingPlayerId(null)
    }
  }

  const drawingPlayer = state?.players.find((p) => p.id === drawingPlayerId)

  useEffect(() => {
    if (!state || !state.aiTurnPending || transitionPhase !== 'IDLE') return

    const signature = [
      state.gameId,
      state.phase,
      state.playerToActId,
      state.completedTricksCount,
      state.players.map((p) => (p.hasDrawn ? '1' : '0')).join(''),
    ].join('|')

    if (lastAdvanceSignatureRef.current === signature) return
    lastAdvanceSignatureRef.current = signature

    const gameIdAtDispatch = state.gameId
    ;(async () => {
      try {
        setIsWaitingForBots(true)
        const data = await advanceBot(gameIdAtDispatch)
        if (activeGameIdRef.current === gameIdAtDispatch) applyState(data)
      } catch (e) {
        if (activeGameIdRef.current === gameIdAtDispatch) setError(e.message)
      } finally {
        if (activeGameIdRef.current === gameIdAtDispatch) setIsWaitingForBots(false)
      }
    })()

  }, [state, transitionPhase])

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
      lastHumanAnchorRef.current = null

      setTransitionPhase('IDLE')
      setAnimDiscards([])
      setAnimDraws([])
      setTempHand([])

      const data = await createGame(cleanPlayers)
      applyState(data)
    } catch (e) {
      setError(e.message)
    }
  }

  function toggleDiscard(card) {
    if (transitionPhase !== 'IDLE') return
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
      setIsWaitingForBots(true)

      const currentHand = drawingPlayer ? drawingPlayer.hand : []
      const discards = [...selectedDiscards]
      setSelectedDiscards([])

      if (discards.length > 0) {
        setAnimDiscards(discards)
        setTransitionPhase('DISCARDING')
      }

      const data = await draw(state.gameId, drawingPlayerId, discards)
      const updatedPlayer = data.players.find(p => p.id === drawingPlayerId)
      const oldKeys = new Set(currentHand.map(c => `${c.suit}-${c.rank}`))
      const newCards = updatedPlayer.hand.filter(c => !oldKeys.has(`${c.suit}-${c.rank}`))

      if (discards.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 700))
      }

      if (newCards.length > 0) {
        setAnimDraws(newCards)
        setTransitionPhase('DRAW_PREPARE')
        await new Promise(resolve => setTimeout(resolve, 50))

        setTempHand(updatedPlayer.hand)
        setTransitionPhase('DRAWING')
        await new Promise(resolve => setTimeout(resolve, 700))
      }

      setTransitionPhase('IDLE')
      applyState(data)
      setIsWaitingForBots(false)

    } catch (e) {
      setError(e.message)
      setIsWaitingForBots(false)
      setTransitionPhase('IDLE')
    }
  }

  async function handlePlayCard(card) {
    try {
      setError('')
      const cardKey = `${card.suit}-${card.rank}`
      setPlayingCardKey(cardKey)
      setIsWaitingForBots(true)
      const data = await playCard(state.gameId, state.playerToActId, card)
      applyState(data)
    } catch (e) {
      setError(e.message)
      setPlayingCardKey(null)
    } finally {
      setIsWaitingForBots(false)
    }
  }

  if (!state) {
    return (
        <div className="app-container setup-mode">
          <div className="setup-card">
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
                        style={{
                          flex: 1,
                          background: 'rgba(255, 255, 255, 0.08)',
                          color: '#ffffff',
                          border: '1px solid rgba(255, 255, 255, 0.25)',
                          borderRadius: '10px',
                          padding: '10px 14px',
                          fontSize: '0.95rem',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
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
        </div>
    )
  }

  const currentPhase = transitionPhase !== 'IDLE' ? 'DEALT' : state.phase

  return (
      <div className="app-container">
        {/* VASEN SIVUPANEELI: OTSIKKO JA PISTEET */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <h1>🂡 Pokerikatko</h1>
          </div>
          <div className="scoreboard">
            <h3>Pisteet</h3>
            {state.players.map((p) => (
                <div
                    key={p.id}
                    className={
                        'player-badge' +
                        (p.id === (drawingPlayerId || state.playerToActId) ? ' active' : '')
                    }
                >
                  <div className="name">
                    {p.name} {p.ai && '🤖'}
                  </div>
                  <div className="score">{p.score} p</div>
                </div>
            ))}
          </div>
        </aside>

        {/* OIKEA PUOLI: PELIALUE */}
        <main className="game-area">
          {error && <div className="error">{error}</div>}

          <div className="phase-banner">{PHASE_LABELS[currentPhase] || currentPhase}</div>

          {(currentPhase === 'DEALT' ||
              currentPhase === 'TRICK_TAKING' ||
              currentPhase === 'FINISHED') && (() => {
            const total = state.players.length

            if (currentPhase === 'TRICK_TAKING') {
              const toAct = state.players.find((p) => p.id === state.playerToActId)
              if (toAct && !toAct.ai) {
                lastHumanAnchorRef.current = toAct.id
              }
            }
            const anchorId = lastHumanAnchorRef.current ?? state.players[0]?.id
            const anchorIndex = state.players.findIndex((p) => p.id === anchorId)

            const humanPlayer =
                state.players.find((p) => p.id === lastHumanAnchorRef.current) ||
                state.players.find((p) => !p.ai)
            const isMyTurn =
                currentPhase === 'TRICK_TAKING' && humanPlayer && state.playerToActId === humanPlayer.id

            return (
                <>
                  <div className="poker-table">
                    {/* PAKKA KESKELLÄ PÖYTÄÄ */}
                    <div className="deck-area">
                      {(transitionPhase === 'DISCARDING' || transitionPhase === 'DRAW_PREPARE') &&
                          animDiscards.map((card) => (
                              <div
                                  key={`${card.suit}-${card.rank}`}
                                  style={{ position: 'absolute', zIndex: 1 }}
                              >
                                <CardView card={card} layoutId={`${card.suit}-${card.rank}`} />
                              </div>
                          ))}

                      <div style={{ position: 'relative', zIndex: 10 }}>
                        <CardBack count={state.deckSize} />
                      </div>

                      {transitionPhase === 'DRAW_PREPARE' &&
                          animDraws.map((card, i) => (
                              <div
                                  key={`${card.suit}-${card.rank}`}
                                  style={{ position: 'absolute', zIndex: 11 + i }}
                              >
                                <CardView card={card} layoutId={`${card.suit}-${card.rank}`} />
                              </div>
                          ))}
                    </div>

                    {state.players.map((p, i) => {
                      const isCurrentDrawing = currentPhase === 'DEALT' && p.id === drawingPlayerId
                      const isActing = currentPhase === 'TRICK_TAKING' && p.id === state.playerToActId
                      const isTrickWinner =
                          currentPhase === 'FINISHED' && p.id === state.lastTrickWinnerId
                      const isHandWinner =
                          currentPhase === 'FINISHED' && p.id === state.bestPokerHandPlayerId
                      const isHumanSelf = humanPlayer && p.id === humanPlayer.id

                      return (
                          <div
                              key={p.id}
                              className="seat"
                              style={seatStyle(rotatedSeatIndex(i, total, anchorIndex), total)}
                          >
                            {currentPhase === 'DEALT' ? (
                                isCurrentDrawing ? (
                                    <div className="card-row">
                                      {(() => {
                                        let displayHand = p.hand
                                        if (
                                            transitionPhase === 'DISCARDING' ||
                                            transitionPhase === 'DRAW_PREPARE'
                                        ) {
                                          displayHand = displayHand.filter(
                                              (c) =>
                                                  !animDiscards.some(
                                                      (d) => d.suit === c.suit && d.rank === c.rank
                                                  )
                                          )
                                        } else if (transitionPhase === 'DRAWING') {
                                          displayHand = tempHand
                                        }

                                        return displayHand.map((card, idx) => {
                                          const isSelected = selectedDiscards.some(
                                              (c) => c.suit === card.suit && c.rank === card.rank
                                          )
                                          return (
                                              <div
                                                  key={`${card.suit}-${card.rank}`}
                                                  className="card-row-item"
                                                  style={{ marginLeft: idx === 0 ? 0 : -28, zIndex: idx }}
                                              >
                                                <CardView
                                                    card={card}
                                                    layoutId={`${card.suit}-${card.rank}`}
                                                    selected={isSelected && transitionPhase === 'IDLE'}
                                                    onClick={() => toggleDiscard(card)}
                                                />
                                              </div>
                                          )
                                        })
                                      })()}
                                    </div>
                                ) : (
                                    // Vastustajan käsi limittäin
                                    <div className="card-row">
                                      {p.hand.map((card, idx) => (
                                          <div
                                              key={`${card.suit}-${card.rank}`}
                                              className="card-row-item"
                                              style={{ marginLeft: idx === 0 ? 0 : -28, zIndex: idx }}
                                          >
                                            <CardBack />
                                          </div>
                                      ))}
                                    </div>
                                )
                            ) : (
                                // TRICK_TAKING TAI FINISHED -VAIHE
                                <div
                                    style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      gap: '6px',
                                    }}
                                >
                                  {!isHumanSelf && p.hand.length > 0 && (
                                      <div className="card-row">
                                        {p.hand.map((card, idx) => (
                                            <div
                                                key={`back-${card.suit}-${card.rank}`}
                                                className="card-row-item"
                                                style={{ marginLeft: idx === 0 ? 0 : -28, zIndex: idx }}
                                            >
                                              <CardBack />
                                            </div>
                                        ))}
                                      </div>
                                  )}

                                  {/* Pöytään pelatut kortit */}
                                  {(() => {
                                    const playedCards = collectSeatCards(state.tricks, p.id)
                                    if (playedCards.length > 0) {
                                      return (
                                          <div className="card-row">
                                            {playedCards.map((card, idx) => (
                                                <div
                                                    key={`${card.suit}-${card.rank}`}
                                                    className="card-row-item"
                                                    style={{ marginLeft: idx === 0 ? 0 : -20, zIndex: idx }}
                                                >
                                                  <CardView
                                                      card={card}
                                                      layoutId={`${card.suit}-${card.rank}`}
                                                  />
                                                </div>
                                            ))}
                                          </div>
                                      )
                                    } else {
                                      return <div className="card-slot-empty" />
                                    }
                                  })()}
                                </div>
                            )}

                            <div
                                className={
                                    'seat-name' + (isCurrentDrawing || isActing ? ' active' : '')
                                }
                            >
                              {p.name} {p.ai && '🤖'}
                              {isTrickWinner && ' 🏆'}
                              {isHandWinner && ' 🃏'}
                            </div>
                            {currentPhase === 'FINISHED' && (
                                <div className="seat-hand-label">
                                  {state.snapshotPokerHands?.[p.id]}
                                </div>
                            )}
                          </div>
                      )
                    })}
                  </div>

                  {/* OHJAUSPANEELI ALHAALLA */}
                  {currentPhase === 'DEALT' && drawingPlayer && transitionPhase === 'IDLE' && (
                      <div className="player-panel">
                        <p>
                          <strong>{drawingPlayer.name}</strong>: valitse hylättävät kortit (0-5)
                          yllä olevasta kädestäsi.
                        </p>
                        <button onClick={handleSubmitDraw} disabled={isWaitingForBots}>
                          Vaihda {selectedDiscards.length} korttia
                        </button>
                      </div>
                  )}

                  {currentPhase === 'DEALT' && drawingPlayer && transitionPhase !== 'IDLE' && (
                      <div className="player-panel">
                        <p>
                          <strong>{drawingPlayer.name}</strong>: kortteja vaihdetaan...
                        </p>
                      </div>
                  )}

                  {currentPhase === 'DEALT' && !drawingPlayer && transitionPhase === 'IDLE' && (
                      <p style={{ textAlign: 'center', margin: '10px 0' }}>
                        Kaikki ovat vaihtaneet, käsitellään...
                      </p>
                  )}

                  {currentPhase === 'TRICK_TAKING' && humanPlayer && !humanPlayer.ai && (
                      <div className="player-panel">
                        <p>
                          <strong>{humanPlayer.name}</strong>{' '}
                          {isMyTurn ? (
                              state.tricks.find((t) => t.inProgress)?.ledSuit
                                  ? `on vuorossa — tunnusta väri ${
                                      state.tricks.find((t) => t.inProgress).ledSuit
                                  } jos mahdollista`
                                  : 'on vuorossa — avaa tikki'
                          ) : (
                              '— odotetaan muiden vuoroa...'
                          )}
                        </p>
                        <div className="hand">
                          {humanPlayer.hand.map((card) => {
                            const cardKey = `${card.suit}-${card.rank}`
                            const isBeingPlayed = cardKey === playingCardKey
                            return (
                                <CardView
                                    key={cardKey}
                                    card={card}
                                    layoutId={cardKey}
                                    disabled={isWaitingForBots || !isMyTurn || isBeingPlayed}
                                    onClick={isMyTurn ? () => handlePlayCard(card) : undefined}
                                />
                            )
                          })}
                        </div>
                      </div>
                  )}

                  {currentPhase === 'TRICK_TAKING' && (
                      <p style={{ textAlign: 'center', opacity: 0.7, margin: '5px 0' }}>
                        Tikkejä pelattu: {state.completedTricksCount} / 5
                      </p>
                  )}

                  {currentPhase === 'FINISHED' && (
                      <div className="result-box">
                        <p>
                          🏆 Katkon voitti:{' '}
                          <strong>
                            {state.players.find((p) => p.id === state.lastTrickWinnerId)?.name}
                          </strong>{' '}
                          (+1 p)
                        </p>
                        <p>
                          🃏 Parhaan pokerikäden sai:{' '}
                          <strong>
                            {state.players.find((p) => p.id === state.bestPokerHandPlayerId)?.name}
                          </strong>{' '}
                          (+1 p)
                        </p>
                        <button onClick={() => setState(null)}>Uusi peli</button>
                      </div>
                  )}
                </>
            )
          })()}
        </main>
      </div>
  )
}