import { useEffect, useRef, useState } from 'react'
import CardView, { CardBack } from './components/CardView.jsx'
import { advanceBot, createGame, draw, playCard } from './api.js'

const PHASE_LABELS = {
  DEALT: 'Pokerivaihto käynnissä',
  DRAW_DONE: 'Vaihto valmis',
  TRICK_TAKING: 'Tikkipeli käynnissä',
  FINISHED: 'Kierros päättyi',
}

const SUIT_ORDER = { HERTTA: 1, RUUTU: 2, RISTI: 3, PATA: 4 }
const RANK_ORDER = {
  TWO: 0, THREE: 1, FOUR: 2, FIVE: 3,
  SIX: 4, SEVEN: 5, EIGHT: 6, NINE: 7, TEN: 8,
  JACK: 9, QUEEN: 10, KING: 11, ACE: 12
}

function seatStyle(index, total) {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2
  const rx = 38
  const ry = 28 // Pienennetty säde, jotta yläreunan kortit mahtuvat pöydälle
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
  if (!tricks || !Array.isArray(tricks)) return cards
  for (const trick of tricks) {
    const play = trick.plays?.find((p) => p.playerId === playerId)
    if (play && play.card) cards.push(play.card)
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
  const [sortBy, setSortBy] = useState('suit') // 'suit' tai 'rank'
  const [targetScore, setTargetScore] = useState(5)
  const [matchScores, setMatchScores] = useState({})
  const roundProcessedRef = useRef(false)

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
    if (data && data.phase === 'DEALT') {
      const next = data.players?.find((p) => !p.hasDrawn)
      setDrawingPlayerId(next ? next.id : null)
    } else {
      setDrawingPlayerId(null)
    }
  }

  // Pisteiden laskenta kierroksen lopussa
  useEffect(() => {
    if (state?.phase === 'FINISHED' && !roundProcessedRef.current) {
      roundProcessedRef.current = true;
      setMatchScores((prev) => {
        const newScores = { ...prev };
        const trickWinner = state.players?.find(p => p.id === state.lastTrickWinnerId);
        const handWinner = state.players?.find(p => p.id === state.bestPokerHandPlayerId);

        if (trickWinner) {
          newScores[trickWinner.name] = (newScores[trickWinner.name] || 0) + 1;
        }
        if (handWinner) {
          newScores[handWinner.name] = (newScores[handWinner.name] || 0) + 1;
        }
        return newScores;
      });
    }
  }, [state]);

  // Bottilogiikka
  useEffect(() => {
    const currentDrawingPlayer = state?.phase === 'DEALT'
        ? state.players?.find(p => p.id === drawingPlayerId)
        : null;

    const isBotDrawing = state?.phase === 'DEALT' && currentDrawingPlayer?.ai;
    const isBotPlayingTrick = state?.phase === 'TRICK_TAKING' && state.playerToActId && state.players?.find(p => p.id === state.playerToActId)?.ai;

    if (!state || transitionPhase !== 'IDLE') return
    if (!state.aiTurnPending && !isBotDrawing) return

    const signature = [
      state.gameId,
      state.phase,
      state.playerToActId,
      state.completedTricksCount,
      state.players?.map((p) => (p.hasDrawn ? '1' : '0')).join(''),
    ].join('|')

    if (lastAdvanceSignatureRef.current === signature) return
    lastAdvanceSignatureRef.current = signature

    const gameIdAtDispatch = state.gameId;

    // Otetaan botin vanha käsi kopiona talteen ennen tilan päivittämistä,
    // jotta tiedämme täsmälleen mitkä kortit hylättiin animaatiota varten.
    const oldBotHand = currentDrawingPlayer?.hand ? [...currentDrawingPlayer.hand] : [];

    ;(async () => {
      try {
        setIsWaitingForBots(true)

        if (isBotPlayingTrick) {
          await new Promise(resolve => setTimeout(resolve, 800))
        }

        const data = await advanceBot(gameIdAtDispatch)
        if (activeGameIdRef.current !== gameIdAtDispatch) return;

        if (state.phase === 'DEALT' && isBotDrawing && currentDrawingPlayer) {
          const newBot = data.players?.find(p => p.id === currentDrawingPlayer.id);

          if (newBot && newBot.hand) {
            const oldKeys = new Set(oldBotHand.map(c => `${c.suit}-${c.rank}`))
            const newKeys = new Set(newBot.hand.map(c => `${c.suit}-${c.rank}`))

            const discards = oldBotHand.filter(c => !newKeys.has(`${c.suit}-${c.rank}`))
            const draws = newBot.hand.filter(c => !oldKeys.has(`${c.suit}-${c.rank}`))

            if (discards.length > 0) {
              setAnimDiscards(discards)
              setTransitionPhase('DISCARDING')
              await new Promise(r => setTimeout(r, 700))
            }
            if (draws.length > 0) {
              setAnimDraws(draws)
              setTransitionPhase('DRAW_PREPARE')
              await new Promise(r => setTimeout(r, 50))
              setTempHand(newBot.hand)
              setTransitionPhase('DRAWING')
              await new Promise(r => setTimeout(r, 700))
            }
            setTransitionPhase('IDLE')
          }
        }

        if (activeGameIdRef.current === gameIdAtDispatch) applyState(data)
      } catch (e) {
        if (activeGameIdRef.current === gameIdAtDispatch) setError(e.message)
      } finally {
        if (activeGameIdRef.current === gameIdAtDispatch) setIsWaitingForBots(false)
      }
    })()
  }, [state, transitionPhase, drawingPlayerId])

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

      const initialScores = {};
      cleanPlayers.forEach(p => initialScores[p.name] = 0);
      setMatchScores(initialScores);
      roundProcessedRef.current = false;
      lastHumanAnchorRef.current = null;

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

  async function handleNextRound() {
    try {
      setError('')
      setTransitionPhase('IDLE')
      setAnimDiscards([])
      setAnimDraws([])
      setTempHand([])
      roundProcessedRef.current = false;
      lastHumanAnchorRef.current = null;

      const cleanPlayers = players
          .map((p) => ({ name: p.name.trim(), ai: p.ai }))
          .filter((p) => p.name)

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

      // Varmistetaan pelaajan omien korttien turvallinen kopio animaatiota varten
      const currentHand = drawingPlayer?.hand ? [...drawingPlayer.hand] : []
      const discards = [...selectedDiscards]
      setSelectedDiscards([])

      if (discards.length > 0) {
        setAnimDiscards(discards)
        setTransitionPhase('DISCARDING')
      }

      const data = await draw(state.gameId, drawingPlayerId, discards)
      const updatedPlayer = data.players?.find(p => p.id === drawingPlayerId)
      const oldKeys = new Set(currentHand.map(c => `${c.suit}-${c.rank}`))
      const newCards = updatedPlayer?.hand?.filter(c => !oldKeys.has(`${c.suit}-${c.rank}`)) || []

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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', width: '100%' }}>
                <label style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', paddingBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  Pelin pituus (pisteitä):
                </label>
                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                  {[5, 10, 20].map(pts => (
                      <div
                          key={pts}
                          onClick={() => setTargetScore(pts)}
                          style={{
                            flex: 1,
                            background: targetScore === pts ? 'rgba(253, 216, 53, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                            border: `1px solid ${targetScore === pts ? '#fdd835' : 'rgba(255, 255, 255, 0.2)'}`,
                            color: targetScore === pts ? '#fdd835' : '#fff',
                            padding: '10px 0',
                            boxShadow: targetScore === pts ? '0 0 10px rgba(253, 216, 53, 0.2)' : 'none',
                            margin: 0,
                            borderRadius: '10px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            userSelect: 'none',
                            whiteSpace: 'nowrap'
                          }}
                      >
                        {pts} p
                      </div>
                  ))}
                </div>
              </div>

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
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                {players.length < 4 && (
                    <button
                        type="button"
                        onClick={() =>
                            setPlayers([...players, { name: `Pelaaja ${players.length + 1}`, ai: false }])
                        }
                    >
                      + Lisää pelaaja
                    </button>
                )}
                {players.length > 2 && (
                    <button type="button" onClick={() => setPlayers(players.slice(0, -1))}>
                      - Poista
                    </button>
                )}
                <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginLeft: 'auto' }}>
                    Pelaajia: {players.length}/4
                </span>
              </div>
              <button type="button" onClick={handleCreateGame}>Jaa kortit ja aloita</button>
            </div>
          </div>
        </div>
    )
  }

  const currentPhase = transitionPhase !== 'IDLE' ? 'DEALT' : state.phase
  const drawingPlayer = state?.players?.find((p) => p.id === drawingPlayerId)

  return (
      <div className="app-container">
        {/* VASEN SIVUPANEELI */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <h1>🂡 Pokerikatko</h1>
          </div>
          <div className="scoreboard">
            <h3>Pisteet (Tavoite: {targetScore})</h3>
            {state.players?.map((p) => (
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
                  <div className="score">{matchScores[p.name] || 0} p</div>
                </div>
            ))}
          </div>
        </aside>

        {/* OIKEA PUOLI: PELIALUE */}
        <main className="game-area">
          {error && <div className="error">{error}</div>}
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
                          animDiscards.map((card) => {
                            const key = `${card.suit}-${card.rank}`
                            return (
                                <div key={key} style={{ position: 'absolute', zIndex: 1 }}>
                                  {drawingPlayer?.ai ? (
                                      <CardBack layoutId={key} />
                                  ) : (
                                      <CardView card={card} layoutId={key} />
                                  )}
                                </div>
                            )
                          })}

                      <div style={{ position: 'relative', zIndex: 10 }}>
                        <CardBack count={state.deckSize} />
                      </div>

                      {transitionPhase === 'DRAW_PREPARE' &&
                          animDraws.map((card, i) => {
                            const key = `${card.suit}-${card.rank}`
                            return (
                                <div key={key} style={{ position: 'absolute', zIndex: 11 + i }}>
                                  {drawingPlayer?.ai ? (
                                      <CardBack layoutId={key} />
                                  ) : (
                                      <CardView card={card} layoutId={key} />
                                  )}
                                </div>
                            )
                          })}
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
                                        let displayHand = p.hand || []
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
                                          const key = `${card.suit}-${card.rank}`
                                          return (
                                              <div
                                                  key={key}
                                                  className="card-row-item"
                                                  style={{ marginLeft: idx === 0 ? 0 : -28, zIndex: idx }}
                                              >
                                                {p.ai ? (
                                                    <CardBack layoutId={key} />
                                                ) : (
                                                    <CardView
                                                        card={card}
                                                        layoutId={key}
                                                        selected={isSelected && transitionPhase === 'IDLE'}
                                                        onClick={() => toggleDiscard(card)}
                                                    />
                                                )}
                                              </div>
                                          )
                                        })
                                      })()}
                                    </div>
                                ) : (
                                    <div className="card-row">
                                      {p.hand?.map((card, idx) => {
                                        const key = `${card.suit}-${card.rank}`
                                        return (
                                            <div
                                                key={key}
                                                className="card-row-item"
                                                style={{ marginLeft: idx === 0 ? 0 : -28, zIndex: idx }}
                                            >
                                              {!p.ai && isHumanSelf ? (
                                                  <CardView card={card} layoutId={key} />
                                              ) : (
                                                  <CardBack layoutId={key} />
                                              )}
                                            </div>
                                        )
                                      })}
                                    </div>
                                )
                            ) : (
                                <div
                                    style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      gap: '6px',
                                    }}
                                >
                                  {!isHumanSelf && p.hand && p.hand.length > 0 && (
                                      <div className="card-row">
                                        {p.hand.map((card, idx) => {
                                          const key = `${card.suit}-${card.rank}`
                                          return (
                                              <div
                                                  key={key}
                                                  className="card-row-item"
                                                  style={{ marginLeft: idx === 0 ? 0 : -28, zIndex: idx }}
                                              >
                                                <CardBack layoutId={key} />
                                              </div>
                                          )
                                        })}
                                      </div>
                                  )}

                                  {(() => {
                                    const playedCards = collectSeatCards(state.tricks, p.id)
                                    if (playedCards.length > 0) {
                                      return (
                                          <div className="card-row">
                                            {playedCards.map((card, idx) => {
                                              const key = `${card.suit}-${card.rank}`
                                              return (
                                                  <div
                                                      key={key}
                                                      className="card-row-item"
                                                      style={{ marginLeft: idx === 0 ? 0 : -20, zIndex: idx }}
                                                  >
                                                    <CardView card={card} layoutId={key} />
                                                  </div>
                                              )
                                            })}
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

                  {currentPhase === 'DEALT' && drawingPlayer && transitionPhase === 'IDLE' && !drawingPlayer.ai && (
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
                              state.tricks?.find((t) => t.inProgress)?.ledSuit
                                  ? `on vuorossa — tunnusta väri ${
                                      state.tricks.find((t) => t.inProgress).ledSuit
                                  } jos mahdollista`
                                  : 'on vuorossa — avaa tikki'
                          ) : (
                              '— odotetaan muiden vuoroa...'
                          )}
                        </p>
                        {/* Järjestyspainikkeet */}
                        <div style={{ marginBottom: '10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>Järjestä:</span>
                          <button
                              onClick={() => setSortBy('suit')}
                              style={{ background: sortBy === 'suit' ? '#4CAF50' : 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '4px 8px', cursor: 'pointer', borderRadius: '4px', fontSize: '0.8rem' }}
                          >
                            Maittain
                          </button>
                          <button
                              onClick={() => setSortBy('rank')}
                              style={{ background: sortBy === 'rank' ? '#4CAF50' : 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '4px 8px', cursor: 'pointer', borderRadius: '4px', fontSize: '0.8rem' }}
                          >
                            Arvon mukaan
                          </button>
                        </div>

                        <div className="hand">
                          {(() => {
                            const handCopy = [...(humanPlayer.hand || [])]
                            const sortedHumanHand = handCopy.sort((a, b) => {
                              if (sortBy === 'suit') {
                                const suitDiff = (SUIT_ORDER[a.suit] || 0) - (SUIT_ORDER[b.suit] || 0)
                                if (suitDiff !== 0) return suitDiff
                                return (RANK_ORDER[a.rank] || 0) - (RANK_ORDER[b.rank] || 0)
                              } else {
                                const rankDiff = (RANK_ORDER[a.rank] || 0) - (RANK_ORDER[b.rank] || 0)
                                if (rankDiff !== 0) return rankDiff
                                return (SUIT_ORDER[a.suit] || 0) - (SUIT_ORDER[b.suit] || 0)
                              }
                            })

                            return sortedHumanHand.map((card) => {
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
                            })
                          })()}
                        </div>
                      </div>
                  )}

                  {currentPhase === 'FINISHED' && (() => {
                    const scoresArr = Object.values(matchScores || {});
                    const highestScore = scoresArr.length > 0 ? Math.max(...scoresArr) : 0;
                    let matchWinners = [];
                    if (highestScore >= targetScore && scoresArr.length > 0) {
                      matchWinners = Object.keys(matchScores).filter(name => matchScores[name] === highestScore);
                    }

                    return (
                        <div className="result-box">
                          {matchWinners.length > 0 ? (
                              <>
                                <h2 style={{ color: '#fdd835', margin: '0 0 10px 0', fontSize: '1.4rem' }}>
                                  🎉 {matchWinners.join(' ja ')} voitti pelin! 🎉
                                </h2>
                                <p style={{ marginBottom: '15px' }}>
                                  Kokonaispisteet saavutettiin: {highestScore} / {targetScore}
                                </p>
                                <button onClick={() => setState(null)}>Palaa valikkoon</button>
                              </>
                          ) : (
                              <>
                                <p>
                                  🏆 Katkon voitti:{' '}
                                  <strong>
                                    {state.players?.find((p) => p.id === state.lastTrickWinnerId)?.name}
                                  </strong>{' '}
                                  (+1 p)
                                </p>
                                <p>
                                  🃏 Parhaan pokerikäden sai:{' '}
                                  <strong>
                                    {state.players?.find((p) => p.id === state.bestPokerHandPlayerId)?.name}
                                  </strong>{' '}
                                  (+1 p)
                                </p>
                                <button onClick={handleNextRound}>Seuraava kierros</button>
                              </>
                          )}
                        </div>
                    );
                  })()}
                </>
            )
          })()}
        </main>
      </div>
  )
}