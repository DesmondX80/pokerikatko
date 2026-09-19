package com.pokerikatko.service;

import com.pokerikatko.model.Card;
import com.pokerikatko.model.HandRank;
import com.pokerikatko.model.Rank;
import com.pokerikatko.model.Suit;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HandEvaluatorTest {

    @Test
    void tunnistaaParin() {
        List<Card> hand = List.of(
                new Card(Suit.HERTTA, Rank.KING),
                new Card(Suit.RUUTU, Rank.KING),
                new Card(Suit.PATA, Rank.TWO),
                new Card(Suit.RISTI, Rank.FIVE),
                new Card(Suit.HERTTA, Rank.NINE)
        );
        assertEquals(HandRank.PAIR, HandEvaluator.evaluate(hand).getRank());
    }

    @Test
    void tunnistaaSuoravarin() {
        List<Card> hand = List.of(
                new Card(Suit.PATA, Rank.FIVE),
                new Card(Suit.PATA, Rank.SIX),
                new Card(Suit.PATA, Rank.SEVEN),
                new Card(Suit.PATA, Rank.EIGHT),
                new Card(Suit.PATA, Rank.NINE)
        );
        assertEquals(HandRank.STRAIGHT_FLUSH, HandEvaluator.evaluate(hand).getRank());
    }

    @Test
    void assaPienimpanaSuorassa() {
        List<Card> hand = List.of(
                new Card(Suit.PATA, Rank.ACE),
                new Card(Suit.HERTTA, Rank.TWO),
                new Card(Suit.RUUTU, Rank.THREE),
                new Card(Suit.RISTI, Rank.FOUR),
                new Card(Suit.PATA, Rank.FIVE)
        );
        assertEquals(HandRank.STRAIGHT, HandEvaluator.evaluate(hand).getRank());
    }

    @Test
    void taysikasiVoittaaVarin() {
        List<Card> fullHouse = List.of(
                new Card(Suit.HERTTA, Rank.THREE),
                new Card(Suit.RUUTU, Rank.THREE),
                new Card(Suit.PATA, Rank.THREE),
                new Card(Suit.RISTI, Rank.KING),
                new Card(Suit.HERTTA, Rank.KING)
        );
        List<Card> flush = List.of(
                new Card(Suit.PATA, Rank.TWO),
                new Card(Suit.PATA, Rank.FIVE),
                new Card(Suit.PATA, Rank.NINE),
                new Card(Suit.PATA, Rank.JACK),
                new Card(Suit.PATA, Rank.KING)
        );
        assertTrue(HandEvaluator.evaluate(fullHouse).compareTo(HandEvaluator.evaluate(flush)) > 0);
    }
}
