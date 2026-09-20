package com.pokerikatko.model;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Yksi tikki: pelaajat pelaavat vuorollaan kortin, ensimmäinen kortti
 * määrää lyödyn värin ("led suit"). Ilman valttia: korkein kortti
 * lyödyssä värissä voittaa tikin. Jos pelaajalla ei ole lyötyä väriä,
 * hän voi pelata minkä tahansa kortin, mutta se ei voi voittaa tikkiä.
 */
public class Trick {
    private final Map<Player, Card> playedCards = new LinkedHashMap<>();
    private Suit ledSuit;
    private Player winner; // asetetaan kun tikki on valmis

    public void playCard(Player player, Card card) {
        if (playedCards.isEmpty()) {
            ledSuit = card.getSuit();
        }
        playedCards.put(player, card);
    }

    public Map<Player, Card> getPlayedCards() {
        return playedCards;
    }

    public Suit getLedSuit() {
        return ledSuit;
    }

    public Player getWinner() {
        return winner;
    }

    public void setWinner(Player winner) {
        this.winner = winner;
    }

    public boolean isComplete(int playerCount) {
        return playedCards.size() == playerCount;
    }

    public Player determineWinner() {
        Player winner = null;
        Card winningCard = null;
        for (Map.Entry<Player, Card> entry : playedCards.entrySet()) {
            Card card = entry.getValue();
            if (card.getSuit() != ledSuit) {
                continue;
            }
            if (winningCard == null || card.getRank().getValue() > winningCard.getRank().getValue()) {
                winningCard = card;
                winner = entry.getKey();
            }
        }
        return winner;
    }
}
