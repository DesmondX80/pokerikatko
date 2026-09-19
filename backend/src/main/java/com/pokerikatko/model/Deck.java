package com.pokerikatko.model;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.List;

public class Deck {
    private final Deque<Card> cards = new ArrayDeque<>();

    public Deck() {
        reset();
    }

    public void reset() {
        cards.clear();
        for (Suit suit : Suit.values()) {
            for (Rank rank : Rank.values()) {
                cards.add(new Card(suit, rank));
            }
        }
        shuffle();
    }

    public void shuffle() {
        List<Card> list = new ArrayList<>(cards);
        Collections.shuffle(list);
        cards.clear();
        cards.addAll(list);
    }

    public Card draw() {
        if (cards.isEmpty()) {
            throw new IllegalStateException("Pakka on tyhjä");
        }
        return cards.poll();
    }

    public List<Card> draw(int count) {
        List<Card> drawn = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            drawn.add(draw());
        }
        return drawn;
    }

    public int remaining() {
        return cards.size();
    }
}
