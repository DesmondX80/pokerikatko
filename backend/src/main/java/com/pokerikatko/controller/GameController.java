package com.pokerikatko.controller;

import com.pokerikatko.dto.Requests.CreateGameRequest;
import com.pokerikatko.dto.Requests.DrawRequest;
import com.pokerikatko.dto.Requests.PlayCardRequest;
import com.pokerikatko.dto.Requests.PlayerConfig;
import com.pokerikatko.model.Player;
import com.pokerikatko.model.Trick;
import com.pokerikatko.service.BotService;
import com.pokerikatko.service.EvaluatedHand;
import com.pokerikatko.service.GameEngine;
import com.pokerikatko.service.GameStore;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/games")
public class GameController {

    private final GameStore store;
    private final BotService botService;

    public GameController(GameStore store, BotService botService) {
        this.store = store;
        this.botService = botService;
    }

    @PostMapping
    public Map<String, Object> createGame(@RequestBody CreateGameRequest request) {
        String gameId = UUID.randomUUID().toString().substring(0, 8);
        List<Player> players = new ArrayList<>();
        for (PlayerConfig pc : request.players) {
            players.add(new Player(UUID.randomUUID().toString().substring(0, 8), pc.name, pc.ai));
        }
        GameEngine engine = new GameEngine(gameId, players);
        engine.dealInitialHands();
        store.save(engine);
        return toState(engine);
    }

    @GetMapping("/{gameId}")
    public Map<String, Object> getState(@PathVariable String gameId) {
        return toState(store.get(gameId));
    }

    @PostMapping("/{gameId}/draw")
    public ResponseEntity<?> draw(@PathVariable String gameId, @RequestBody DrawRequest request) {
        try {
            GameEngine engine = store.get(gameId);
            engine.applyDraw(request.playerId, request.discards);
            return ResponseEntity.ok(toState(engine));
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{gameId}/play-card")
    public ResponseEntity<?> playCard(@PathVariable String gameId, @RequestBody PlayCardRequest request) {
        try {
            GameEngine engine = store.get(gameId);
            engine.playCard(request.playerId, request.card);
            return ResponseEntity.ok(toState(engine));
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Suorittaa täsmälleen yhden botin vuoron (jos sellainen on juuri nyt vireillä) ja
     * palauttaa päivittyneen tilan. Frontend kutsuu tätä vasta kun edellisen kortin
     * saapumisanimaatio pöydälle on ehtinyt näkyä, jolloin botit "miettivät" vasta
     * edellisen siirron jälkeen eivätkä kaikki botin kortit ilmesty kerralla.
     */
    @PostMapping("/{gameId}/advance-bot")
    public ResponseEntity<?> advanceBot(@PathVariable String gameId) {
        try {
            GameEngine engine = store.get(gameId);
            if (botService.isAiTurnPending(engine)) {
                botService.processOneAiTurn(engine);
            }
            return ResponseEntity.ok(toState(engine));
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Muuntaa moottorin tilan JSON-yst\u00e4v\u00e4lliseksi mapiksi.
     * HUOM: t\u00e4ss\u00e4 MVP:ss\u00e4 kaikkien pelaajien k\u00e4det n\u00e4kyv\u00e4t kaikille vastauksessa -
     * oikeassa moninpelissä jokaiselle pelaajalle pitäisi palauttaa vain oma käsi
     * (esim. WebSocket + per-istunto suodatus).
     */
    private Map<String, Object> toState(GameEngine engine) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("gameId", engine.getGameId());
        state.put("phase", engine.getPhase());
        state.put("deckSize", engine.getDeckSize());

        List<Map<String, Object>> playersJson = new ArrayList<>();
        for (Player p : engine.getPlayers()) {
            Map<String, Object> pj = new LinkedHashMap<>();
            pj.put("id", p.getId());
            pj.put("name", p.getName());
            pj.put("ai", p.isAi());
            pj.put("hand", p.getHand());
            pj.put("score", p.getScore());
            pj.put("hasDrawn", engine.getPlayersWhoHaveDrawn().contains(p.getId()));
            playersJson.add(pj);
        }
        state.put("players", playersJson);

        // Kaikki tikit (myös aiemmat) pöydälle näkyviin - ei vain nykyinen tikki.
        List<Map<String, Object>> tricksJson = new ArrayList<>();
        int trickNumber = 1;
        for (Trick t : engine.getCompletedTricks()) {
            tricksJson.add(trickToJson(trickNumber++, t, false));
        }
        if (engine.getCurrentTrick() != null && engine.getPhase() == com.pokerikatko.model.GamePhase.TRICK_TAKING) {
            tricksJson.add(trickToJson(trickNumber, engine.getCurrentTrick(), true));
        }
        state.put("tricks", tricksJson);
        state.put("completedTricksCount", engine.getCompletedTricks().size());

        if (engine.getPhase() == com.pokerikatko.model.GamePhase.TRICK_TAKING) {
            state.put("playerToActId", engine.playerToActInTrick().getId());
        }

        if (!engine.getSnapshotHands().isEmpty()) {
            Map<String, String> hands = new LinkedHashMap<>();
            for (Map.Entry<String, EvaluatedHand> e : engine.getSnapshotHands().entrySet()) {
                hands.put(e.getKey(), e.getValue().toString());
            }
            state.put("snapshotPokerHands", hands);
        }

        state.put("lastTrickWinnerId", engine.getLastTrickWinnerId());
        state.put("bestPokerHandPlayerId", engine.getBestPokerHandPlayerId());
        state.put("aiTurnPending", botService.isAiTurnPending(engine));

        return state;
    }

    private Map<String, Object> trickToJson(int trickNumber, Trick trick, boolean inProgress) {
        Map<String, Object> trickJson = new LinkedHashMap<>();
        trickJson.put("trickNumber", trickNumber);
        trickJson.put("ledSuit", trick.getLedSuit());
        trickJson.put("inProgress", inProgress);
        trickJson.put("winnerName", trick.getWinner() != null ? trick.getWinner().getName() : null);

        List<Map<String, Object>> plays = new ArrayList<>();
        for (Map.Entry<Player, com.pokerikatko.model.Card> e : trick.getPlayedCards().entrySet()) {
            Map<String, Object> play = new LinkedHashMap<>();
            play.put("playerId", e.getKey().getId());
            play.put("playerName", e.getKey().getName());
            play.put("card", e.getValue());
            plays.add(play);
        }
        trickJson.put("plays", plays);
        return trickJson;
    }
}
