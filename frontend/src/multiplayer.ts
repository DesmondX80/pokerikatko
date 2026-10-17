import { useCallback, useEffect, useRef, useState } from 'react'
import { tableSocketUrl } from './api.js'

export interface TablePlayer {
  id: string;
  name: string;
  connected: boolean;
}

export interface TableView {
  name: string;
  status: 'LOBBY' | 'PLAYING';
  youId: string;
  hostId: string | null;
  players: TablePlayer[];
  targetScore: number;
  matchScores: Record<string, number>;
  matchWinners: string[];
  round: number;
  game: any | null;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting'

const TOKEN_KEY = 'pokerikatko-player-token'

// Selainkohtainen tunniste, jolla pelaaja tunnistetaan, kun hän palaa pöytään
function playerToken(): string {
  try {
    let token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      token = crypto.randomUUID()
      localStorage.setItem(TOKEN_KEY, token)
    }
    return token
  } catch {
    return crypto.randomUUID()
  }
}

export function useMultiplayer() {
  const [table, setTable] = useState<TableView | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [error, setError] = useState('')

  const wsRef = useRef<WebSocket | null>(null)
  const sessionRef = useRef<{ name: string; tableName: string } | null>(null)
  const retriesRef = useRef(0)
  const retryTimerRef = useRef<number | null>(null)

  const open = useCallback(() => {
    const session = sessionRef.current
    if (!session) return

    const ws = new WebSocket(tableSocketUrl(session.tableName))
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', name: session.name, token: playerToken() }))
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'state') {
        retriesRef.current = 0
        setStatus('open')
        setError('')
        setTable(msg.table)
      } else if (msg.type === 'error') {
        setError(msg.message)
        if (msg.fatal) {
          // Liittyminen hylättiin: ei yritetä uudelleen
          sessionRef.current = null
          setTable(null)
          setStatus('idle')
        }
      }
    }

    ws.onclose = () => {
      if (wsRef.current !== ws) return
      wsRef.current = null
      if (!sessionRef.current) return
      // Yhteys katkesi (esim. puhelin meni lepotilaan): yhdistetään uudelleen samaan paikkaan
      setStatus('reconnecting')
      const delay = Math.min(1000 * 2 ** retriesRef.current, 10000)
      retriesRef.current += 1
      retryTimerRef.current = window.setTimeout(open, delay)
    }
  }, [])

  const connect = useCallback((name: string, tableName: string) => {
    sessionRef.current = { name, tableName }
    retriesRef.current = 0
    setError('')
    setStatus('connecting')
    open()
  }, [open])

  const send = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    } else {
      setError('Ei yhteyttä palvelimeen, yritetään yhdistää uudelleen...')
    }
  }, [])

  const disconnect = useCallback(() => {
    sessionRef.current = null
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current)
    const ws = wsRef.current
    wsRef.current = null
    if (ws) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'leave' }))
      ws.close()
    }
    setTable(null)
    setStatus('idle')
  }, [])

  // Kun välilehti palaa näkyviin, yhdistetään heti eikä odoteta uudelleenyrityksen viivettä
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && sessionRef.current && !wsRef.current) {
        if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current)
        retriesRef.current = 0
        open()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [open])

  useEffect(() => () => {
    sessionRef.current = null
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current)
    wsRef.current?.close()
  }, [])

  return { table, status, error, setError, connect, send, disconnect }
}

export type Multiplayer = ReturnType<typeof useMultiplayer>
