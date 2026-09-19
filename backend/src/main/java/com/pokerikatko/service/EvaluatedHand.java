package com.pokerikatko.service;

import com.pokerikatko.model.Card;
import com.pokerikatko.model.HandRank;

import java.util.List;

/**
 * Arvioidun 5 kortin pokerikäden tulos: käden tyyppi (HandRank) sekä
 * tasapelien ratkaisuun käytettävät vertailuarvot suuruusjärjestyksessä.
 */
public class EvaluatedHand implements Comparable<EvaluatedHand> {
    private final HandRank rank;
    private final List<Integer> tiebreakers;
    private final List<Card> cards;

    public EvaluatedHand(HandRank rank, List<Integer> tiebreakers, List<Card> cards) {
        this.rank = rank;
        this.tiebreakers = tiebreakers;
        this.cards = cards;
    }

    public HandRank getRank() {
        return rank;
    }

    public List<Integer> getTiebreakers() {
        return tiebreakers;
    }

    public List<Card> getCards() {
        return cards;
    }

    @Override
    public int compareTo(EvaluatedHand other) {
        int cmp = Integer.compare(this.rank.getValue(), other.rank.getValue());
        if (cmp != 0) return cmp;
        for (int i = 0; i < Math.min(tiebreakers.size(), other.tiebreakers.size()); i++) {
            cmp = Integer.compare(this.tiebreakers.get(i), other.tiebreakers.get(i));
            if (cmp != 0) return cmp;
        }
        return 0;
    }

    @Override
    public String toString() {
        return rank.getFinnishName() + " " + tiebreakers;
    }
}
