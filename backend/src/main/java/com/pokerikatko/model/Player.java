package com.pokerikatko.model;

import java.util.ArrayList;
import java.util.List;

public class Player {
    private final String id;
    private final String name;
    private final boolean ai;
    private List<Card> hand = new ArrayList<>();
    private int score = 0;

    public Player(String id, String name) {
        this(id, name, false);
    }

    public Player(String id, String name, boolean ai) {
        this.id = id;
        this.name = name;
        this.ai = ai;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public boolean isAi() {
        return ai;
    }

    public List<Card> getHand() {
        return hand;
    }

    public void setHand(List<Card> hand) {
        this.hand = hand;
    }

    public int getScore() {
        return score;
    }

    public void addPoint() {
        this.score++;
    }

    public void removeCards(List<Card> toRemove) {
        hand.removeAll(toRemove);
    }

    public void addCards(List<Card> toAdd) {
        hand.addAll(toAdd);
    }

    public void playCard(Card card) {
        if (!hand.remove(card)) {
            throw new IllegalArgumentException(name + " ei omista korttia " + card);
        }
    }

    public boolean hasSuit(Suit suit) {
        return hand.stream().anyMatch(c -> c.getSuit() == suit);
    }
}
