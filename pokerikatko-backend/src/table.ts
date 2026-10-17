import { DurableObject } from 'cloudflare:workers'
import { applyDraw, applyPlayCard, createGameState } from './game'

// Moninpelin pelipöytä: yksi Durable Object per pöydän nimi.
// Pelaajat ovat yhteydessä WebSocketilla, ja jokainen saa tilasta oman
// näkymänsä, jossa muiden pelaajien kortit on piilotettu.

const MAX_PLAYERS = 4
const MIN_PLAYERS = 2
const TARGET_SCORES = [5, 10, 20]
// Tyhjä pöytä poistetaan, kun kukaan ei ole ollut yhteydessä tähän aikaan
const EMPTY_TABLE_TTL_MS = 2 * 60 * 60 * 1000

type TablePlayer = {
  id: string
  name: string
  token: string
}

type TableData = {
  name: string
  status: 'LOBBY' | 'PLAYING'
  players: TablePlayer[]
  nextPlayerNumber: number
  targetScore: number
  matchScores: Record<string, number>
  matchWinners: string[]
  dealerIndex: number
  round: number
  roundScored: boolean
  game: any | null
}

type Attachment = { playerId: string } | null

function newTable(name: string): TableData {
  return {
    name,
    status: 'LOBBY',
    players: [],
    nextPlayerNumber: 1,
    targetScore: 5,
    matchScores: {},
    matchWinners: [],
    dealerIndex: 0,
    round: 0,
    roundScored: false,
    game: null,
  }
}

export class PokerTable extends DurableObject {
  table: TableData | null = null

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      this.table = (await ctx.storage.get<TableData>('table')) ?? null
    })
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Odotettiin WebSocket-yhteyttä', { status: 426 })
    }

    const tableName = decodeURIComponent(new URL(request.url).pathname.split('/').pop() || '').trim()
    if (!this.table) {
      this.table = newTable(tableName)
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment(null)
    await this.ctx.storage.deleteAlarm()

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    let msg: any
    try {
      msg = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message))
    } catch {
      return this.sendError(ws, 'Virheellinen viesti')
    }

    if (!this.table) {
      return this.sendFatal(ws, 'Pöytää ei enää ole olemassa')
    }

    if (msg.type === 'join') {
      return this.handleJoin(ws, msg)
    }

    const attachment = ws.deserializeAttachment() as Attachment
    const player = attachment && this.table.players.find((p) => p.id === attachment.playerId)
    if (!player) {
      return this.sendFatal(ws, 'Et ole enää tässä pöydässä')
    }

    const error = this.handleAction(player, msg)
    if (error) {
      return this.sendError(ws, error)
    }

    await this.save()
    this.broadcast()

    if (msg.type === 'leave') {
      ws.serializeAttachment(null)
      ws.close(1000, 'Poistui pöydästä')
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, 'Yhteys suljettu')
    } catch {
      // Yhteys oli jo suljettu
    }
    await this.onDisconnect(ws)
  }

  async webSocketError(ws: WebSocket) {
    await this.onDisconnect(ws)
  }

  async alarm() {
    if (this.openSockets().length === 0) {
      await this.ctx.storage.deleteAll()
      this.table = null
    }
  }

  private async onDisconnect(closed: WebSocket) {
    this.broadcast(closed)
    if (this.openSockets(closed).length === 0) {
      await this.ctx.storage.setAlarm(Date.now() + EMPTY_TABLE_TTL_MS)
    }
  }

  private async handleJoin(ws: WebSocket, msg: any) {
    const t = this.table!
    const name = String(msg.name ?? '').trim().slice(0, 20)
    const token = String(msg.token ?? '')
    if (!name) return this.sendFatal(ws, 'Kirjoita pelaajan nimi')
    if (!token) return this.sendFatal(ws, 'Virheellinen liittymispyyntö')

    const sameName = t.players.find((p) => p.name.toLowerCase() === name.toLowerCase())
    let player = t.players.find((p) => p.token === token)

    if (player) {
      // Sama selain liittyy uudelleen. Aulassa nimen voi vaihtaa, pelin aikana ei.
      if (t.status === 'LOBBY' && player.name !== name) {
        if (sameName && sameName !== player) return this.sendFatal(ws, `Nimi "${name}" on jo käytössä tässä pöydässä`)
        player.name = name
      }
    } else if (sameName) {
      // Pelaaja palaa toiselta laitteelta: paikan saa haltuun, jos alkuperäinen yhteys on katkennut
      if (this.isConnected(sameName.id)) return this.sendFatal(ws, `Nimi "${name}" on jo käytössä tässä pöydässä`)
      sameName.token = token
      player = sameName
    } else {
      if (t.status !== 'LOBBY') return this.sendFatal(ws, 'Pöydässä on peli jo käynnissä')
      if (t.players.length >= MAX_PLAYERS) return this.sendFatal(ws, `Pöytä on täynnä (max ${MAX_PLAYERS} pelaajaa)`)
      player = { id: `p${t.nextPlayerNumber++}`, name, token }
      t.players.push(player)
    }

    // Saman pelaajan vanhat yhteydet (esim. toinen välilehti) suljetaan
    for (const other of this.openSockets(ws)) {
      const att = other.deserializeAttachment() as Attachment
      if (att?.playerId === player.id) {
        this.sendFatal(other, 'Liityit pöytään toisesta ikkunasta')
      }
    }

    ws.serializeAttachment({ playerId: player.id })
    await this.save()
    this.broadcast()
  }

  // Palauttaa virheilmoituksen tai null
  private handleAction(player: TablePlayer, msg: any): string | null {
    const t = this.table!
    const isHost = t.players[0]?.id === player.id

    switch (msg.type) {
      case 'setTarget': {
        if (t.status !== 'LOBBY') return 'Pelin pituutta ei voi muuttaa kesken pelin'
        if (!isHost) return 'Vain pöydän isäntä voi muuttaa pelin pituutta'
        if (!TARGET_SCORES.includes(msg.targetScore)) return 'Virheellinen pelin pituus'
        t.targetScore = msg.targetScore
        return null
      }

      case 'start': {
        if (t.status !== 'LOBBY') return 'Peli on jo käynnissä'
        if (!isHost) return 'Vain pöydän isäntä voi aloittaa pelin'
        // Aulasta poistuneet (yhteys katkennut) eivät pääse mukaan peliin
        const connected = t.players.filter((p) => this.isConnected(p.id))
        if (connected.length < MIN_PLAYERS) return `Tarvitaan vähintään ${MIN_PLAYERS} pelaajaa`
        t.players = connected
        t.status = 'PLAYING'
        t.matchScores = Object.fromEntries(connected.map((p) => [p.name, 0]))
        t.matchWinners = []
        t.round = 0
        t.dealerIndex = Math.floor(Math.random() * connected.length)
        this.startRound()
        return null
      }

      case 'draw': {
        if (t.status !== 'PLAYING' || !t.game) return 'Peli ei ole käynnissä'
        return applyDraw(t.game, player.id, msg.discards)
      }

      case 'playCard': {
        if (t.status !== 'PLAYING' || !t.game) return 'Peli ei ole käynnissä'
        const error = applyPlayCard(t.game, player.id, msg.card)
        if (!error) this.scoreRoundIfFinished()
        return error
      }

      case 'nextRound': {
        if (t.status !== 'PLAYING' || t.game?.phase !== 'FINISHED') return 'Kierros on vielä kesken'
        // Useampi pelaaja voi painaa samaan aikaan: vain ensimmäinen painallus aloittaa kierroksen
        if (msg.round !== t.round) return null
        if (t.matchWinners.length > 0) return 'Peli on jo päättynyt'
        t.dealerIndex = (t.dealerIndex + 1) % t.players.length
        this.startRound()
        return null
      }

      case 'backToLobby': {
        if (t.status !== 'PLAYING') return null
        if (t.matchWinners.length === 0 && !isHost) return 'Vain pöydän isäntä voi lopettaa pelin kesken'
        t.status = 'LOBBY'
        t.game = null
        t.round = 0
        t.matchScores = {}
        t.matchWinners = []
        return null
      }

      case 'leave': {
        // Kesken pelin paikka säilyy, jotta pelaaja voi palata samalla nimellä
        if (t.status === 'LOBBY') {
          t.players = t.players.filter((p) => p.id !== player.id)
        }
        return null
      }

      default:
        return 'Tuntematon toiminto'
    }
  }

  private startRound() {
    const t = this.table!
    t.round += 1
    t.roundScored = false
    const ordered = [...t.players.slice(t.dealerIndex), ...t.players.slice(0, t.dealerIndex)]
    t.game = createGameState(
      `${t.name}-${t.round}`,
      ordered.map((p) => ({ id: p.id, name: p.name, ai: false })),
    )
  }

  private scoreRoundIfFinished() {
    const t = this.table!
    const game = t.game
    if (!game || game.phase !== 'FINISHED' || t.roundScored) return
    t.roundScored = true

    for (const winnerId of [game.lastTrickWinnerId, game.bestPokerHandPlayerId]) {
      const winner = game.players.find((p: any) => p.id === winnerId)
      if (winner) t.matchScores[winner.name] = (t.matchScores[winner.name] || 0) + 1
    }

    const highest = Math.max(...Object.values(t.matchScores))
    if (highest >= t.targetScore) {
      t.matchWinners = Object.keys(t.matchScores).filter((name) => t.matchScores[name] === highest)
    }
  }

  private async save() {
    await this.ctx.storage.put('table', this.table)
  }

  private openSockets(exclude?: WebSocket) {
    return this.ctx.getWebSockets().filter((ws) => ws !== exclude && ws.readyState === WebSocket.OPEN)
  }

  private isConnected(playerId: string, exclude?: WebSocket) {
    return this.openSockets(exclude).some(
      (ws) => (ws.deserializeAttachment() as Attachment)?.playerId === playerId,
    )
  }

  private broadcast(exclude?: WebSocket) {
    if (!this.table) return
    for (const ws of this.openSockets(exclude)) {
      const att = ws.deserializeAttachment() as Attachment
      if (!att) continue
      try {
        ws.send(JSON.stringify({ type: 'state', table: this.viewFor(att.playerId, exclude) }))
      } catch {
        // Yhteys katkesi kesken lähetyksen
      }
    }
  }

  private viewFor(playerId: string, exclude?: WebSocket) {
    const t = this.table!
    return {
      name: t.name,
      status: t.status,
      youId: playerId,
      hostId: t.players[0]?.id ?? null,
      players: t.players.map((p) => ({ id: p.id, name: p.name, connected: this.isConnected(p.id, exclude) })),
      targetScore: t.targetScore,
      matchScores: t.matchScores,
      matchWinners: t.matchWinners,
      round: t.round,
      game: t.game ? hideOtherHands(t.game, playerId) : null,
    }
  }

  private sendError(ws: WebSocket, message: string) {
    try {
      ws.send(JSON.stringify({ type: 'error', message }))
    } catch {
      // Yhteys katkesi
    }
  }

  // Virhe, jonka jälkeen yhteys suljetaan eikä asiakas yritä yhdistää uudelleen
  private sendFatal(ws: WebSocket, message: string) {
    try {
      ws.send(JSON.stringify({ type: 'error', message, fatal: true }))
      ws.serializeAttachment(null)
      ws.close(4000, 'Liittyminen epäonnistui')
    } catch {
      // Yhteys oli jo suljettu
    }
  }
}

// Muiden pelaajien kortit korvataan kortin selkäpuolilla, eikä pakkaa lähetetä.
// Pokerikädet paljastetaan vasta kierroksen lopussa.
function hideOtherHands(game: any, playerId: string) {
  const { deck, pokerHandsSnapshot, ...rest } = game
  const finished = game.phase === 'FINISHED'
  return {
    ...rest,
    snapshotPokerHands: finished ? game.snapshotPokerHands : {},
    players: game.players.map((p: any) =>
      p.id === playerId
        ? p
        : { ...p, hand: p.hand.map((_: any, i: number) => ({ suit: 'HIDDEN', rank: `${p.id}-${i}` })) },
    ),
  }
}
