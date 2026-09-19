package com.pokerikatko.service;

import com.pokerikatko.model.Card;
import com.pokerikatko.model.HandRank;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Arvioi 5 kortin pokerikäden tyypin (paritonta -> suoraväriin).
 * Ei tue "jokerikortteja" tms. - tasan 5 tavallista korttia.
 */
public final class HandEvaluator {

    private HandEvaluator() {
    }

    public static EvaluatedHand evaluate(List<Card> hand) {
        if (hand.size() != 5) {
            throw new IllegalArgumentException("Käsi tarvitsee tasan 5 korttia, oli " + hand.size());
        }

        List<Integer> ranksDesc = hand.stream()
                .map(c -> c.getRank().getValue())
                .sorted(Collections.reverseOrder())
                .collect(Collectors.toList());

        Map<Integer, Long> counts = ranksDesc.stream()
                .collect(Collectors.groupingBy(r -> r, Collectors.counting()));

        boolean isFlush = hand.stream().map(Card::getSuit).distinct().count() == 1;

        boolean isStraight = isConsecutive(ranksDesc);
        List<Integer> straightTiebreak = ranksDesc;

        // Erikoistapaus: A-5-4-3-2 (ässä toimii pienimpänä suorassa)
        if (!isStraight && ranksDesc.equals(List.of(14, 5, 4, 3, 2))) {
            isStraight = true;
            straightTiebreak = List.of(5, 4, 3, 2, 1);
        }

        List<Long> countValuesDesc = new ArrayList<>(counts.values());
        countValuesDesc.sort(Collections.reverseOrder());

        // Vertailuarvot: ensin määrän mukaan (esim. pari ennen yksittäisiä), sitten arvon mukaan
        List<Integer> groupedTiebreak = counts.entrySet().stream()
                .sorted((a, b) -> {
                    int cmp = Long.compare(b.getValue(), a.getValue());
                    if (cmp != 0) return cmp;
                    return Integer.compare(b.getKey(), a.getKey());
                })
                .map(Map.Entry::getKey)
                .collect(Collectors.toList());

        long topCount = countValuesDesc.get(0);
        long secondCount = countValuesDesc.size() > 1 ? countValuesDesc.get(1) : 0;

        HandRank rank;
        List<Integer> tiebreakers;

        if (isStraight && isFlush) {
            rank = HandRank.STRAIGHT_FLUSH;
            tiebreakers = straightTiebreak;
        } else if (topCount == 4) {
            rank = HandRank.FOUR_OF_A_KIND;
            tiebreakers = groupedTiebreak;
        } else if (topCount == 3 && secondCount == 2) {
            rank = HandRank.FULL_HOUSE;
            tiebreakers = groupedTiebreak;
        } else if (isFlush) {
            rank = HandRank.FLUSH;
            tiebreakers = ranksDesc;
        } else if (isStraight) {
            rank = HandRank.STRAIGHT;
            tiebreakers = straightTiebreak;
        } else if (topCount == 3) {
            rank = HandRank.THREE_OF_A_KIND;
            tiebreakers = groupedTiebreak;
        } else if (topCount == 2 && secondCount == 2) {
            rank = HandRank.TWO_PAIR;
            tiebreakers = groupedTiebreak;
        } else if (topCount == 2) {
            rank = HandRank.PAIR;
            tiebreakers = groupedTiebreak;
        } else {
            rank = HandRank.HIGH_CARD;
            tiebreakers = ranksDesc;
        }

        return new EvaluatedHand(rank, tiebreakers, hand);
    }

    private static boolean isConsecutive(List<Integer> sortedDesc) {
        if (new HashSet<>(sortedDesc).size() != 5) {
            return false; // duplikaatteja -> ei voi olla suora
        }
        for (int i = 0; i < sortedDesc.size() - 1; i++) {
            if (sortedDesc.get(i) - sortedDesc.get(i + 1) != 1) {
                return false;
            }
        }
        return true;
    }
}
