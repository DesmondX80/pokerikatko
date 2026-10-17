import { useState, FormEvent } from 'react'
import type { Multiplayer } from '../multiplayer'

const MIN_PLAYERS = 2
const MAX_PLAYERS = 4

interface Props {
  mp: Multiplayer;
  onBack: () => void;
}

// Moninpelin liittymislomake ja odotusaula
export default function MultiplayerLobby({ mp, onBack }: Props) {
  const { table, status, error } = mp
  const [form, setForm] = useState({ name: '', tableName: '' })

  function handleJoin(e: FormEvent) {
    e.preventDefault()
    const name = form.name.trim()
    const tableName = form.tableName.trim()
    if (!name || !tableName) {
      mp.setError('Kirjoita sekä pelaajan nimi että pelipöydän nimi')
      return
    }
    mp.connect(name, tableName)
  }

  if (!table) {
    const connecting = status !== 'idle'
    return (
        <form className="setup" onSubmit={handleJoin}>
          <h2 className="lobby-heading">Moninpeli</h2>
          {error && <div className="error">{error}</div>}

          <label className="field-label" htmlFor="mp-name">Pelaajan nimi</label>
          <input
              id="mp-name"
              type="text"
              value={form.name}
              maxLength={20}
              autoComplete="nickname"
              placeholder="esim. Lucky Luke"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <label className="field-label" htmlFor="mp-table">Pelipöydän nimi</label>
          <input
              id="mp-table"
              type="text"
              value={form.tableName}
              maxLength={30}
              placeholder="esim. Saluuna"
              onChange={(e) => setForm({ ...form, tableName: e.target.value })}
          />
          <p className="hint">
            Kaikki samaan pöytään liittyvät kirjoittavat saman pöydän nimen. Jos pöytää ei vielä ole, se luodaan.
          </p>

          <button type="button" className="back-btn" onClick={onBack} disabled={connecting}>← Takaisin</button>
          <button type="submit" disabled={connecting}>
            {connecting ? 'Liitytään...' : 'Liity pöytään'}
          </button>
        </form>
    )
  }

  const isHost = table.hostId === table.youId
  const host = table.players.find((p) => p.id === table.hostId)
  const connectedCount = table.players.filter((p) => p.connected).length
  const canStart = connectedCount >= MIN_PLAYERS

  return (
      <div className="setup">
        <h2 className="lobby-heading">Pöytä: {table.name}</h2>
        {status === 'reconnecting' && <div className="error">Yhteys katkesi, yhdistetään uudelleen...</div>}
        {error && <div className="error">{error}</div>}

        <div className="field-label">Pelaajat ({table.players.length}/{MAX_PLAYERS})</div>
        <ul className="lobby-players">
          {table.players.map((p) => (
              <li key={p.id} className={p.connected ? '' : 'offline'}>
                <span>
                  {p.id === table.hostId && '👑 '}
                  {p.name}
                  {p.id === table.youId && ' (sinä)'}
                </span>
                <span className="lobby-status">{p.connected ? '🟢 paikalla' : '⚪ ei yhteyttä'}</span>
              </li>
          ))}
        </ul>

        <div className="field-label">Pelin pituus (pisteitä)</div>
        <div className="target-options">
          {[5, 10, 20].map((pts) => (
              <button
                  key={pts}
                  type="button"
                  className={'target-option' + (table.targetScore === pts ? ' selected' : '')}
                  disabled={!isHost}
                  onClick={() => mp.send({ type: 'setTarget', targetScore: pts })}
              >
                {pts} p
              </button>
          ))}
        </div>

        <p className="hint">
          {!canStart
              ? <>Odotetaan muita pelaajia... Kerro kavereillesi pöydän nimi <strong>{table.name}</strong>.</>
              : isHost
                  ? 'Kun kaikki ovat liittyneet, aloita peli.'
                  : `Odotetaan, että ${host?.name ?? 'isäntä'} aloittaa pelin...`}
        </p>

        <button
            type="button"
            className="back-btn"
            onClick={() => {
              mp.disconnect()
              onBack()
            }}
        >
          Poistu pöydästä
        </button>
        {isHost && (
            <button type="button" disabled={!canStart} onClick={() => mp.send({ type: 'start' })}>
              Aloita peli
            </button>
        )}
      </div>
  )
}
