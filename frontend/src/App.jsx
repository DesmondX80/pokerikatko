import { useEffect, useRef, useState } from 'react'
import CardView, { CardBack } from './components/CardView.jsx'
import { advanceBot, createGame, draw, playCard } from './api.js'

const SUIT_ORDER = { HERTTA: 1, RUUTU: 2, RISTI: 3, PATA: 4 }
const RANK_ORDER = {
  TWO: 0, THREE: 1, FOUR: 2, FIVE: 3,
  SIX: 4, SEVEN: 5, EIGHT: 6, NINE: 7, TEN: 8,
  JACK: 9, QUEEN: 10, KING: 11, ACE: 12
}

function seatStyle(index, total) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  const angle = (2 * Math.PI * index) / total + Math.PI / 2
  const rx = isMobile ? 25 : 36
  const ry = isMobile ? 28 : 28
  const left = 50 + rx * Math.cos(angle)
  const top = 50 + ry * Math.sin(angle)
  return { left: `${left}%`, top: `${top}%` }
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

function sortHandCards(hand, sortBy) {
  if (!hand) return []
  return [...hand].sort((a, b) => {
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
}

export default function App() {
  const [state, setState] = useState(null)
  const [players, setPlayers] = useState([
    { name: 'Pelaaja 1', ai: false },
    { name: 'Pelaaja 2', ai: false },
  ])
  const [error, setError] = useState('')

  const [targetScore, setTargetScore] = useState(5)
  const [matchScores, setMatchScores] = useState({})
  const roundProcessedRef = useRef(false)

  const [drawingPlayerId, setDrawingPlayerId] = useState(null)
  const [selectedDiscards, setSelectedDiscards] = useState([])
  const [isWaitingForBots, setIsWaitingForBots] = useState(false)
  const [playingCardKey, setPlayingCardKey] = useState(null)
  const [sortBy, setSortBy] = useState('suit')

  const [dealerIndex, setDealerIndex] = useState(0)

  const lastAdvanceSignatureRef = useRef(null)
  const activeGameIdRef = useRef(null)
  activeGameIdRef.current = state ? state.gameId : null

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

  useEffect(() => {
    const currentDrawingPlayer = state?.phase === 'DEALT'
        ? state.players?.find(p => p.id === drawingPlayerId)
        : null;

    const isBotDrawing = state?.phase === 'DEALT' && currentDrawingPlayer?.ai;
    const isBotPlayingTrick = state?.phase === 'TRICK_TAKING' && state.playerToActId && state.players?.find(p => p.id === state.playerToActId)?.ai;

    if (!state) return
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

    ;(async () => {
      try {
        setIsWaitingForBots(true)

        if (isBotPlayingTrick) {
          await new Promise(resolve => setTimeout(resolve, 800))
        }

        const data = await advanceBot(gameIdAtDispatch)
        if (activeGameIdRef.current !== gameIdAtDispatch) return;

        applyState(data)
      } catch (e) {
        if (activeGameIdRef.current !== gameIdAtDispatch) setError(e.message)
      } finally {
        if (activeGameIdRef.current === gameIdAtDispatch) setIsWaitingForBots(false)
      }
    })()
  }, [state, drawingPlayerId])

  async function startGame(isFirstRound = false) {
    const cleanPlayers = players
        .map((p) => ({ name: p.name.trim(), ai: p.ai }))
        .filter((p) => p.name)

    let newDealer = dealerIndex;
    if (isFirstRound) {
      newDealer = Math.floor(Math.random() * cleanPlayers.length);
    } else {
      newDealer = (dealerIndex + 1) % cleanPlayers.length;
    }
    setDealerIndex(newDealer);

    const ordered = [...cleanPlayers.slice(newDealer), ...cleanPlayers.slice(0, newDealer)];
    const data = await createGame(ordered)
    applyState(data)
  }

  async function handleCreateGame() {
    try {
      setError('')
      const cleanPlayers = players.map(p => ({ name: p.name.trim(), ai: p.ai })).filter(p => p.name);
      if (cleanPlayers.length < 2) {
        setError('Tarvitaan vähintään 2 pelaajaa')
        return
      }

      const initialScores = {};
      cleanPlayers.forEach(p => initialScores[p.name] = 0);
      setMatchScores(initialScores);
      roundProcessedRef.current = false;

      await startGame(true);
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleNextRound() {
    try {
      setError('')
      roundProcessedRef.current = false;
      await startGame(false);
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
      setIsWaitingForBots(true)
      const discards = [...selectedDiscards]
      setSelectedDiscards([])

      const data = await draw(state.gameId, drawingPlayerId, discards)
      applyState(data)
      setIsWaitingForBots(false)
    } catch (e) {
      setError(e.message)
      setIsWaitingForBots(false)
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

  const drawingPlayer = state?.players?.find((p) => p.id === drawingPlayerId)
  const originalPlayerNames = players.map(p => p.name.trim())
  const sortedSeatPlayers = state?.players ? [...state.players].sort((a, b) => {
    return originalPlayerNames.indexOf(a.name) - originalPlayerNames.indexOf(b.name);
  }) : []
  const humanPlayer = sortedSeatPlayers[0]
  const isMyTurn = state?.phase === 'TRICK_TAKING' && state.playerToActId === humanPlayer?.id

  return (
      <div className="app-container">
        <style>{`
          /* Länkkärityylinen otsikko ja tehosteet */
          .western-title {
            font-family: 'Georgia', 'Times New Roman', serif;
            font-weight: bold;
            letter-spacing: 2px;
            color: #ffca28;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8), 0 0 10px rgba(255, 202, 40, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
          }

          @media (max-width: 768px) {
            html, body {
              height: auto !important;
              overflow: auto !important;
            }
            .app-container {
              flex-direction: column !important;
              height: auto !important;
              min-height: 100vh;
              overflow: auto !important;
            }
            .sidebar {
              width: 100% !important;
              height: auto !important;
              flex-direction: row !important;
              flex-wrap: wrap;
              padding: 6px !important;
              box-sizing: border-box;
              border-right: none !important;
              border-bottom: 1px solid rgba(255, 255, 255, 0.1);
              flex-shrink: 0;
            }
            .sidebar-header {
              width: 100%;
              margin-bottom: 2px !important;
            }
            .scoreboard {
              display: flex;
              flex-direction: row;
              flex-wrap: wrap;
              gap: 4px;
              width: 100%;
            }
            .scoreboard h3 {
              display: none;
            }
            .player-badge {
              flex: 1;
              min-width: 75px;
              padding: 4px 6px !important;
              font-size: 0.7rem;
              margin-bottom: 0 !important;
            }
            .game-area {
              flex: 1 !important;
              height: auto !important;
              overflow: visible !important;
              padding: 10px 10px 160px 10px !important;
              box-sizing: border-box;
            }
            .poker-table {
              width: 100% !important;
              height: 240px !important;
              max-width: 100% !important;
              margin: 5px auto 10px auto !important;
              overflow: hidden;
            }
            .seat:not(.human-seat) {
              transform: translate(-50%, -50%) scale(0.3) !important;
            }
            .seat.human-seat {
              transform: translate(-50%, -50%) scale(0.55) !important;
            }
            .deck-area {
              transform: translate(-50%, -50%) scale(0.4) !important;
            }
            .card-row-item {
              margin-left: -16px !important;
            }
            .hand {
              overflow-x: auto;
              justify-content: flex-start !important;
              padding-bottom: 6px;
              max-width: 100%;
            }
            .player-panel {
              padding: 12px !important;
              margin-top: 15px !important;
              margin-bottom: 40px !important;
              position: relative !important;
              z-index: 10;
            }
            .setup-card {
              width: 92% !important;
              padding: 16px !important;
              margin: 10px auto !important;
              box-sizing: border-box;
            }
          }
        `}</style>

        {!state ? (
            <div className="app-container setup-mode" style={{ width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="setup-card">
                <h1 className="western-title"><span>🤠 🔫</span> Pokerikatko <span>🔫 🤠</span></h1>
                <p className="subtitle">Lännen nopein pokeri + tikkipeli</p>
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

                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
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
                        <button type="button" onClick={() => setPlayers(players.slice(0, -1))}>- Poista</button>
                    )}
                    <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginLeft: 'auto' }}>
                      Pelaajia: {players.length}/4
                    </span>
                  </div>

                  <button type="button" onClick={handleCreateGame} style={{ width: '100%' }}>Jaa kortit ja aloita</button>
                </div>
              </div>
            </div>
        ) : (
            <>
              {/* VASEN SIVUPANEELI / MOBIILISSA YLÄBARI */}
              <aside className="sidebar">
                <div className="sidebar-header">
                  <h1 className="western-title" style={{ fontSize: '1.1rem' }}><span>🔫</span> Pokerikatko <span>🔫</span></h1>
                </div>
                <div className="scoreboard">
                  <h3>Pisteet (Tavoite: {targetScore})</h3>
                  {state.players.map((p) => {
                    const isCurrent = p.id === (drawingPlayerId || state.playerToActId);
                    return (
                        <div
                            key={p.id}
                            className={'player-badge' + (isCurrent ? ' active' : '')}
                        >
                          <div className="name">
                            {p.name} {p.ai && '🤖'}
                          </div>
                          <div className="score">{matchScores[p.name] || 0} p</div>
                        </div>
                    );
                  })}
                </div>
              </aside>

              {/* PELIALUE */}
              <main className="game-area">
                {error && <div className="error">{error}</div>}
                {(() => {
                  const total = sortedSeatPlayers.length;

                  return (
                      <>
                        <div className="poker-table">
                          {/* PAKKA KESKELLÄ PÖYTÄÄ */}
                          {state.deckSize > 0 && (
                              <div className="deck-area">
                                <CardBack count={state.deckSize} />
                              </div>
                          )}

                          {sortedSeatPlayers.map((p, i) => {
                            const isCurrentDrawing = state.phase === 'DEALT' && p.id === drawingPlayerId
                            const isActing = state.phase === 'TRICK_TAKING' && p.id === state.playerToActId
                            const isTrickWinner = state.phase === 'FINISHED' && p.id === state.lastTrickWinnerId
                            const isHandWinner = state.phase === 'FINISHED' && p.id === state.bestPokerHandPlayerId
                            const isHumanSelf = p.id === humanPlayer?.id

                            return (
                                <div
                                    key={p.id}
                                    className={'seat' + (isHumanSelf ? ' human-seat' : '')}
                                    style={seatStyle(i, total)}
                                >
                                  {state.phase === 'DEALT' ? (
                                      isCurrentDrawing ? (
                                          <div className="card-row">
                                            {sortHandCards(p.hand, sortBy).map((card, idx) => {
                                              const isSelected = selectedDiscards.some(
                                                  (c) => c.suit === card.suit && c.rank === card.rank
                                              )
                                              const key = `${card.suit}-${card.rank}`
                                              return (
                                                  <div
                                                      key={key}
                                                      className="card-row-item"
                                                      style={{ marginLeft: idx === 0 ? 0 : -20, zIndex: idx }}
                                                  >
                                                    {p.ai ? (
                                                        <CardBack layoutId={key} />
                                                    ) : (
                                                        <CardView
                                                            card={card}
                                                            layoutId={key}
                                                            selected={isSelected}
                                                            onClick={() => toggleDiscard(card)}
                                                        />
                                                    )}
                                                  </div>
                                              )
                                            })}
                                          </div>
                                      ) : (
                                          <div className="card-row">
                                            {p.hand?.map((card, idx) => {
                                              const key = `${card.suit}-${card.rank}`
                                              return (
                                                  <div
                                                      key={key}
                                                      className="card-row-item"
                                                      style={{ marginLeft: idx === 0 ? 0 : -20, zIndex: idx }}
                                                  >
                                                    {isHumanSelf && !p.ai ? (
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
                                                        style={{ marginLeft: idx === 0 ? 0 : -20, zIndex: idx }}
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
                                                            style={{ marginLeft: idx === 0 ? 0 : -15, zIndex: idx }}
                                                        >
                                                          <CardView card={card} layoutId={key} />
                                                        </div>
                                                    )
                                                  })}
                                                </div>
                                            )
                                          } else {
                                            return null
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
                                  {state.phase === 'FINISHED' && (
                                      <div className="seat-hand-label">
                                        {state.snapshotPokerHands?.[p.id]}
                                      </div>
                                  )}
                                </div>
                            )
                          })}
                        </div>

                        {/* Järjestyspainikkeet */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>Järjestä käsi:</span>
                          <button
                              onClick={() => setSortBy('suit')}
                              style={{ background: sortBy === 'suit' ? '#4CAF50' : 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '4px 10px', cursor: 'pointer', borderRadius: '4px', fontSize: '0.8rem' }}
                          >
                            Maittain
                          </button>
                          <button
                              onClick={() => setSortBy('rank')}
                              style={{ background: sortBy === 'rank' ? '#4CAF50' : 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '4px 10px', cursor: 'pointer', borderRadius: '4px', fontSize: '0.8rem' }}
                          >
                            Arvon mukaan
                          </button>
                        </div>

                        {state.phase === 'DEALT' && drawingPlayer && !drawingPlayer.ai && (
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

                        {state.phase === 'DEALT' && drawingPlayer && drawingPlayer.ai && (
                            <div className="player-panel">
                              <p>
                                <strong>{drawingPlayer.name}</strong> (botti) miettii kortinvaihtoa...
                              </p>
                            </div>
                        )}

                        {state.phase === 'TRICK_TAKING' && humanPlayer && !humanPlayer.ai && (
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
                              <div className="hand">
                                {sortHandCards(humanPlayer.hand, sortBy).map((card) => {
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

                        {state.phase === 'FINISHED' && (() => {
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
                  );
                })()}
              </main>
            </>
        )}
      </div>
  )
}