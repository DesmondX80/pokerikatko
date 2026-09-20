package com.pokerikatko.service;

import com.pokerikatko.model.*;

import java.util.*;

/**
 * Yhden pokerikatko-kierroksen tilakone:
 *   1. Jako (5 korttia/pelaaja)
 *   2. Pokerivaihto (jokainen hylkää 0-5 korttia, nostaa tilalle)
 *   3. Vaihdon jälkeinen käsi tallennetaan pokeri-vertailua varten
 *   4. Sama käsi pelataan tikkipelinä (5 tikkiä, on pakko tunnustaa väri)
 *   5. Pisteytys: viimeisen tikin voittaja +1, paras pokerikäsi +1
 */
public class GameEngine {

    private final String gameId;
    private final List<Player> players;
    private final Deck deck = new Deck();

    private GamePhase phase = GamePhase.WAITING_FOR_PLAYERS;
    private final Set<String> playersWhoHaveDrawn = new HashSet<>();
    private final Map<String, EvaluatedHand> snapshotHands = new LinkedHashMap<>();

    private final List<Trick> completedTricks = new ArrayList<>();
    private Trick currentTrick;
    private int leaderIndex = 0; // kuka aloittaa seuraavan tikin

    private String lastTrickWinnerId;
    private String bestPokerHandPlayerId;

    public GameEngine(String gameId, List<Player> players) {
        if (players.size() < 2) {
            throw new IllegalArgumentException("Peliin tarvitaan vähintään 2 pelaajaa");
        }
        this.gameId = gameId;
        this.players = players;
    }

    public void dealInitialHands() {
        deck.reset();
        for (Player p : players) {
            p.setHand(new ArrayList<>(deck.draw(5)));
        }
        phase = GamePhase.DEALT;
    }

    /**
     * Pelaajan pokerivaihto: hylkää annetut kortit ja nostaa yhtä monta uutta.
     */
    public void applyDraw(String playerId, List<Card> discards) {
        requirePhase(GamePhase.DEALT);
        Player player = getPlayer(playerId);

        if (playersWhoHaveDrawn.contains(playerId)) {
            throw new IllegalStateException(player.getName() + " on jo vaihtanut korttinsa");
        }
        if (discards.size() > 5) {
            throw new IllegalArgumentException("Ei voi hylätä enempää kuin 5 korttia");
        }
        for (Card c : discards) {
            if (!player.getHand().contains(c)) {
                throw new IllegalArgumentException(player.getName() + " ei omista korttia " + c);
            }
        }

        player.removeCards(discards);
        player.addCards(deck.draw(discards.size()));
        playersWhoHaveDrawn.add(playerId);

        if (playersWhoHaveDrawn.size() == players.size()) {
            finishDrawPhase();
        }
    }

    private void finishDrawPhase() {
        for (Player p : players) {
            snapshotHands.put(p.getId(), HandEvaluator.evaluate(new ArrayList<>(p.getHand())));
        }
        phase = GamePhase.DRAW_DONE;
        startTrickTaking();
    }

    private void startTrickTaking() {
        phase = GamePhase.TRICK_TAKING;
        leaderIndex = 0;
        currentTrick = new Trick();
    }

    /**
     * Pelaaja pelaa kortin nykyiseen tikkiin. Värin tunnustus on pakollinen,
     * jos pelaajalla on lyötyä väriä kädessään.
     */
    public void playCard(String playerId, Card card) {
        requirePhase(GamePhase.TRICK_TAKING);
        Player player = getPlayer(playerId);
        Player expectedPlayer = playerToActInTrick();
        if (!expectedPlayer.getId().equals(playerId)) {
            throw new IllegalStateException("Ei ole " + player.getName() + " vuoro");
        }
        if (!player.getHand().contains(card)) {
            throw new IllegalArgumentException(player.getName() + " ei omista korttia " + card);
        }

        Suit ledSuit = currentTrick.getLedSuit();
        if (ledSuit != null && card.getSuit() != ledSuit && player.hasSuit(ledSuit)) {
            throw new IllegalArgumentException("Väriä " + ledSuit + " on tunnustettava jos mahdollista");
        }

        player.playCard(card);
        currentTrick.playCard(player, card);

        if (currentTrick.isComplete(players.size())) {
            Player winner = currentTrick.determineWinner();
            currentTrick.setWinner(winner);
            completedTricks.add(currentTrick);
            leaderIndex = players.indexOf(winner);

            boolean wasLastTrick = completedTricks.size() == 5;
            if (wasLastTrick) {
                lastTrickWinnerId = winner.getId();
                finishRound();
            } else {
                currentTrick = new Trick();
            }
        }
    }

    private void finishRound() {
        // Paras pokerikäsi
        String bestId = null;
        EvaluatedHand best = null;
        for (Map.Entry<String, EvaluatedHand> entry : snapshotHands.entrySet()) {
            if (best == null || entry.getValue().compareTo(best) > 0) {
                best = entry.getValue();
                bestId = entry.getKey();
            }
        }
        bestPokerHandPlayerId = bestId;

        getPlayer(lastTrickWinnerId).addPoint();
        getPlayer(bestPokerHandPlayerId).addPoint();

        phase = GamePhase.FINISHED;
    }

    /** Kuka on vuorossa nykyisessä tikissä (pelaajat pelaavat leaderIndex-järjestyksessä). */
    public Player playerToActInTrick() {
        int cardsPlayed = currentTrick.getPlayedCards().size();
        int idx = (leaderIndex + cardsPlayed) % players.size();
        return players.get(idx);
    }

    private void requirePhase(GamePhase expected) {
        if (phase != expected) {
            throw new IllegalStateException("Väärä vaihe: odotettiin " + expected + ", oli " + phase);
        }
    }

    private Player getPlayer(String playerId) {
        return players.stream()
                .filter(p -> p.getId().equals(playerId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Tuntematon pelaaja: " + playerId));
    }

    // --- Getterit tilan lukemiseen (esim. REST-vastausta varten) ---

    public String getGameId() {
        return gameId;
    }

    public List<Player> getPlayers() {
        return players;
    }

    public GamePhase getPhase() {
        return phase;
    }

    public Trick getCurrentTrick() {
        return currentTrick;
    }

    public List<Trick> getCompletedTricks() {
        return completedTricks;
    }

    public Map<String, EvaluatedHand> getSnapshotHands() {
        return snapshotHands;
    }

    public String getLastTrickWinnerId() {
        return lastTrickWinnerId;
    }

    public String getBestPokerHandPlayerId() {
        return bestPokerHandPlayerId;
    }

    public Set<String> getPlayersWhoHaveDrawn() {
        return playersWhoHaveDrawn;
    }
}
