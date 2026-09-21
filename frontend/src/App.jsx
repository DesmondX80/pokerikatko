import { useEffect, useRef, useState } from 'react'
import CardView, { CardBack } from './components/CardView.jsx'
import { advanceBot, createGame, draw, playCard } from './api.js'

const PHASE_LABELS = {
  DEALT: 'Pokerivaihto käynnissä',
  DRAW_DONE: 'Vaihto valmis',
  TRICK_TAKING: 'Tikkipeli käynnissä',
  FINISHED: 'Kierros päättyi',
}

// Sijoittaa pelaajan pöydän ympärille tasaisin välein, ensimmäinen ylhäällä, sitten myötäpäivään.
function seatStyle(index, total) {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2
  const rx = 30 // vaakasäde prosentteina
  const ry = 28 // pystysäde prosentteina
  const left = 50 + rx * Math.cos(angle)
  const top = 50 + ry * Math.sin(angle)
  return { left: `${left}%`, top: `${top}%` }
}

// "Alin" paikka-indeksi total-pelaajan pöydässä (lähinnä ruudun alareunaa).
function frontSeatIndex(total) {
  return Math.floor(total / 2)
}

// Kiertää pelaajien näyttöjärjestyksen niin että ankkuripelaaja (esim. vuorossa oleva)
// näkyy aina alimmalla paikalla, muut pysyvät samassa suhteellisessa järjestyksessä.
function rotatedSeatIndex(originalIndex, total, anchorIndex) {
  if (anchorIndex == null || anchorIndex < 0) return originalIndex
  return (originalIndex - anchorIndex + frontSeatIndex(total) + total) % total
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
  const [isWaitingForBots, setIsWaitingForBots] = useState(false)
  // Näytetäänkö juuri nyt "tässä lopullinen kätesi" -näkymä vaihdon jälkeen
  // (ennen kuin siirrytään seuraavaan pelaajaan)?
  const [revealingDraw, setRevealingDraw] = useState(false)

  // Muistaa pelaajakohtaisesti, mitkä kortit (maa+arvo) on jo NÄYTETTY kyseiselle
  // pelaajalle aiemmin - näiden ei tarvitse kääntyä pakasta enää uudelleen, kun
  // taas vaihdossa saadut UUDET kortit puuttuvat vielä joukosta ja kääntyvät.
  const seenCardKeysRef = useRef(new Map())

  // Estää saman botin vuoron käynnistymisen kahdesti (esim. Reactin
  // kehitystilan efektien tahallisen tuplakäynnistyksen takia) - tallentaa
  // "allekirjoituksen" siitä tilanteesta jolle botin siirto on jo pyydetty.
  const lastAdvanceSignatureRef = useRef(null)
  // Pitää kirjaa siitä, mikä peli on juuri nyt aktiivinen, jotta vanhentunutta
  // vastausta ei sovelleta jos peli on sillä välin nollattu ("Uusi peli").
  const activeGameIdRef = useRef(null)
  activeGameIdRef.current = state ? state.gameId : null

  // Pöydän kiertoankkuri: päivittyy vain kun oikeasti IHMISEN vuoro on käsillä,
  // ei botin jokaisen yksittäisen kortin jälkeen - muuten koko pöytä pyörähtäisi
  // sekavasti joka kerta kun botti pelaa, mikä ei tunnu jouhevalta.
  const lastHumanAnchorRef = useRef(null)

  // Päivittää pelin tilan ja sen mukana sen, kenen vaihtopaneeli näytetään (vain ihmiset).
  // HUOM: jos "lopullinen kätesi" -paljastus on juuri nyt kesken, EI kosketa
  // drawingPlayerId:hen tästä - muuten esim. botin samanaikainen tikkivuoro voisi
  // nollata sen ja katkaista paljastuksen kesken kaiken.
  function applyState(data) {
    setState(data)
    if (revealingDraw) return
    if (data.phase === 'DEALT') {
      const next = data.players.find((p) => !p.ai && !p.hasDrawn)
      setDrawingPlayerId(next ? next.id : null)
    } else {
      setDrawingPlayerId(null)
    }
  }

  const drawingPlayer = state?.players.find((p) => p.id === drawingPlayerId)

  // Merkitsee drawingPlayerin NYKYISEN käden kortit "nähdyiksi" - tämä ajetaan
  // renderöinnin JÄLKEEN, joten sama renderöinti ehtii vielä käyttää EDELLISTÄ
  // (vaihtoa edeltävää) nähtyjen korttien joukkoa laskiessaan mitkä kortit ovat uusia.
  useEffect(() => {
    if (!drawingPlayer) return
    const set = seenCardKeysRef.current.get(drawingPlayer.id) ?? new Set()
    drawingPlayer.hand.forEach((c) => set.add(`${c.suit}-${c.rank}`))
    seenCardKeysRef.current.set(drawingPlayer.id, set)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingPlayer?.id, drawingPlayer?.hand.map((c) => `${c.suit}-${c.rank}`).join(',')])

  // Botit ratkaistaan yksi vuoro kerrallaan: kun tila kertoo botin olevan vuorossa,
  // pyydetään heti palvelinta suorittamaan täsmälleen yksi botin siirto. Pelaajan oma
  // kortti on jo tässä vaiheessa asettunut pöydälle välittömästi (ei etukäteisviivettä
  // frontendissä) - koko "miettimisaika" tulee yksinomaan palvelimen omasta viiveestä,
  // joka toistuu samalla tavalla myös silloin kun botti voittaa tikin ja aloittaa seuraavan.
  useEffect(() => {
    if (!state || !state.aiTurnPending) return

    // Yksilöi tämän tarkan pelitilanteen: jos sama tilanne yrittää liipaista
    // efektin uudelleen (esim. Strict Mode -tuplakutsu), ei lähetetä toista pyyntöä.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

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
      seenCardKeysRef.current = new Map()
      setRevealingDraw(false)
      const data = await createGame(cleanPlayers)
      applyState(data)
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
      const data = await draw(state.gameId, drawingPlayerId, selectedDiscards)
      setState(data)
      setSelectedDiscards([])

      if (data.phase === 'DEALT') {
        // Näytä pelaajalle hetken ajan hänen lopullinen kätensä (drawingPlayerId
        // pysyy samana), ennen kuin siirrytään seuraavaan vaihtamattomaan pelaajaan.
        setRevealingDraw(true)
        setTimeout(() => {
          setRevealingDraw(false)
          const next = data.players.find((p) => !p.ai && !p.hasDrawn)
          setDrawingPlayerId(next ? next.id : null)
        }, 1600)
      } else {
        setDrawingPlayerId(null)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setIsWaitingForBots(false)
    }
  }

  async function handlePlayCard(card) {
    try {
      setError('')
      const data = await playCard(state.gameId, state.playerToActId, card)
      applyState(data)
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

      <div className="deck-area">
        <CardBack count={state.deckSize} />
      </div>

      {isWaitingForBots && <p style={{ textAlign: 'center', opacity: 0.8 }}>🤖 Botit miettivät...</p>}

      {state.phase === 'DEALT' && drawingPlayer && !revealingDraw && (
        <div className="player-panel">
          <p>
            <strong>{drawingPlayer.name}</strong>: valitse hylättävät kortit (0-5) ja vaihda.
          </p>
          <div className="hand">
            {drawingPlayer.hand.map((card) => (
              <CardView
                key={`${card.suit}-${card.rank}`}
                card={card}
                layoutId={`${card.suit}-${card.rank}`}
                dealAnimation
                disabled={isWaitingForBots}
                selected={selectedDiscards.some((c) => c.suit === card.suit && c.rank === card.rank)}
                onClick={() => toggleDiscard(card)}
              />
            ))}
          </div>
          <button onClick={handleSubmitDraw} disabled={isWaitingForBots}>
            Vaihda {selectedDiscards.length} korttia
          </button>
        </div>
      )}

      {revealingDraw && drawingPlayer && (() => {
        const seenSet = seenCardKeysRef.current.get(drawingPlayer.id) ?? new Set()
        return (
          <div className="player-panel">
            <p>
              <strong>{drawingPlayer.name}</strong>: tässä lopullinen kätesi.
            </p>
            <div className="hand">
              {drawingPlayer.hand.map((card) => {
                const key = `${card.suit}-${card.rank}`
                return (
                  <CardView
                    key={key}
                    card={card}
                    layoutId={key}
                    dealAnimation={!seenSet.has(key)}
                  />
                )
              })}
            </div>
          </div>
        )
      })()}

      {state.phase === 'DEALT' && !drawingPlayer && !revealingDraw && (
        <p>Kaikki ovat vaihtaneet, käsitellään...</p>
      )}

      {!revealingDraw && (state.phase === 'TRICK_TAKING' || state.phase === 'FINISHED') && (() => {
        const currentTrick = state.tricks.find((t) => t.inProgress)
        const total = state.players.length

        // Päivitä ankkuri vain kun vuorossa on ihminen - botin vuorojen aikana
        // pöytä pysyy paikallaan eikä pyörähdä jokaisen botin kortin jälkeen.
        if (state.phase === 'TRICK_TAKING') {
          const toAct = state.players.find((p) => p.id === state.playerToActId)
          if (toAct && !toAct.ai) {
            lastHumanAnchorRef.current = toAct.id
          }
        }
        const anchorId = lastHumanAnchorRef.current ?? state.players[0]?.id
        const anchorIndex = state.players.findIndex((p) => p.id === anchorId)

        return (
          <>
            <div className="poker-table">
              {state.players.map((p, i) => {
                const cards = collectSeatCards(state.tricks, p.id)
                const isActing = p.id === state.playerToActId
                const isTrickWinner = state.phase === 'FINISHED' && p.id === state.lastTrickWinnerId
                const isHandWinner = state.phase === 'FINISHED' && p.id === state.bestPokerHandPlayerId
                return (
                  <div
                    key={p.id}
                    className="seat"
                    style={seatStyle(rotatedSeatIndex(i, total, anchorIndex), total)}
                  >
                    {cards.length > 0 ? (
                      <div className="card-row">
                        {cards.map((card, idx) => (
                          <div
                            key={`${card.suit}-${card.rank}`}
                            className="card-row-item"
                            style={{ marginLeft: idx === 0 ? 0 : -30, zIndex: idx }}
                          >
                            <CardView card={card} layoutId={`${card.suit}-${card.rank}`} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="card-slot-empty" />
                    )}
                    <div className={'seat-name' + (isActing ? ' active' : '')}>
                      {p.name} {p.ai && '🤖'}
                      {isTrickWinner && ' 🏆'}
                      {isHandWinner && ' 🃏'}
                    </div>
                    {state.phase === 'FINISHED' && (
                      <div className="seat-hand-label">{state.snapshotPokerHands?.[p.id]}</div>
                    )}
                  </div>
                )
              })}
            </div>

            {state.phase === 'TRICK_TAKING' && activeTrickPlayer && !activeTrickPlayer.ai && (
              <div className="player-panel">
                <p>
                  <strong>{activeTrickPlayer.name}</strong> on vuorossa
                  {currentTrick?.ledSuit
                    ? ` — tunnusta väri ${currentTrick.ledSuit} jos mahdollista`
                    : ' — avaa tikki'}
                </p>
                <div className="hand">
                  {activeTrickPlayer.hand.map((card) => (
                    <CardView
                      key={`${card.suit}-${card.rank}`}
                      card={card}
                      layoutId={`${card.suit}-${card.rank}`}
                      disabled={isWaitingForBots}
                      onClick={() => handlePlayCard(card)}
                    />
                  ))}
                </div>
              </div>
            )}

            {state.phase === 'TRICK_TAKING' && (
              <p style={{ textAlign: 'center', opacity: 0.7 }}>
                Tikkejä pelattu: {state.completedTricksCount} / 5
              </p>
            )}

            {state.phase === 'FINISHED' && (
              <div className="result-box">
                <p>
                  🏆 Katkon voitti:{' '}
                  <strong>{state.players.find((p) => p.id === state.lastTrickWinnerId)?.name}</strong> (+1 p)
                </p>
                <p>
                  🃏 Parhaan pokerikäden sai:{' '}
                  <strong>{state.players.find((p) => p.id === state.bestPokerHandPlayerId)?.name}</strong> (+1 p)
                </p>
                <button onClick={() => setState(null)}>Uusi peli</button>
              </div>
            )}
          </>
        )
      })()}
    </div>
  )
}
