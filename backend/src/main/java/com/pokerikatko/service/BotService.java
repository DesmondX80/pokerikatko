package com.pokerikatko.service;

import com.pokerikatko.model.*;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Yksinkertainen tekoälypelaajien logiikka:
 *  - Pokerivaihdossa: pidetään parit/kolmoset/neloset, hylätään yksinäiset
 *    kortit (paitsi korkein kortti säilytetään "kickerinä" jos parivaihtoehtoja
 *    ei ole lainkaan).
 *  - Tikkipelissä: aloittaessa pelataan matalin kortti (varovainen avaus),
 *    seuratessa pelataan korkein kortti lyödyssä värissä jos mahdollista
 *    (yritetään voittaa tikki), muuten tyhjennetään matalin kortti kädestä.
 *
 * Botin vuorot ratkaistaan YKSI KERRALLAAN (processOneAiTurn), ei kaikkia
 * peräkkäisiä botti-vuoroja kerralla. Näin frontend voi pyytää seuraavan
 * botin siirron vasta sitten kun edellisen kortin saapumisanimaatio pöydälle
 * on ehtinyt näkyä, jolloin peli etenee askel askeleelta eikä kaikki botin
 * kortit ilmesty pöydälle yhtäkkiä samalla kertaa.
 */
@Service
public class BotService {

    private static final long THINK_DELAY_MS = 1500;

    /** Onko juuri nyt vuorossa botti - joko vaihtamassa kortteja tai pelaamassa tikkiin? */
    public boolean isAiTurnPending(GameEngine engine) {
        if (engine.getPhase() == GamePhase.DEALT) {
            return engine.getPlayers().stream()
                    .anyMatch(p -> p.isAi() && !engine.getPlayersWhoHaveDrawn().contains(p.getId()));
        }
        if (engine.getPhase() == GamePhase.TRICK_TAKING) {
            return engine.playerToActInTrick().isAi();
        }
        return false;
    }

    /**
     * Suorittaa täsmälleen yhden botin vuoron (joko yhden pelaajan pokerivaihdon
     * tai yhden pelatun kortin) pienen "miettimisviiveen" jälkeen. Kutsujan
     * vastuulla on kutsua tätä vain kun isAiTurnPending palauttaa true.
     */
    public void processOneAiTurn(GameEngine engine) {
        sleepThinking();

        if (engine.getPhase() == GamePhase.DEALT) {
            for (Player p : engine.getPlayers()) {
                if (p.isAi() && !engine.getPlayersWhoHaveDrawn().contains(p.getId())) {
                    engine.applyDraw(p.getId(), decideDiscards(p));
                    return;
                }
            }
        } else if (engine.getPhase() == GamePhase.TRICK_TAKING) {
            Player toAct = engine.playerToActInTrick();
            if (toAct.isAi()) {
                Card card = decideCardToPlay(toAct, engine.getCurrentTrick());
                engine.playCard(toAct.getId(), card);
            }
        }
    }

    /** Pieni keinotekoinen "miettimisviive" ennen botin siirtoa, autenttisemman tuntuman vuoksi. */
    private void sleepThinking() {
        try {
            Thread.sleep(THINK_DELAY_MS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    List<Card> decideDiscards(Player player) {
        List<Card> hand = player.getHand();
        Map<Rank, Long> counts = hand.stream()
                .collect(Collectors.groupingBy(Card::getRank, Collectors.counting()));

        List<Card> discards = new ArrayList<>();
        for (Card c : hand) {
            if (counts.get(c.getRank()) == 1) {
                discards.add(c);
            }
        }

        // Jos kädessä ei ole yhtäkään paria, pidetään korkein kortti kickerinä
        // sen sijaan että hylättäisiin koko käsi
        if (discards.size() == hand.size()) {
            Card highest = hand.stream()
                    .max(Comparator.comparingInt(c -> c.getRank().getValue()))
                    .orElseThrow();
            discards.remove(highest);
        }
        return discards;
    }

    Card decideCardToPlay(Player player, Trick currentTrick) {
        List<Card> hand = player.getHand();
        Suit ledSuit = currentTrick.getLedSuit();

        if (ledSuit == null) {
            // Avaa tikin - pelataan matalin kortti varovaisuutta noudattaen
            return hand.stream()
                    .min(Comparator.comparingInt(c -> c.getRank().getValue()))
                    .orElseThrow();
        }

        List<Card> ofLedSuit = hand.stream()
                .filter(c -> c.getSuit() == ledSuit)
                .collect(Collectors.toList());

        if (!ofLedSuit.isEmpty()) {
            // Pakko tunnustaa väri - yritetään voittaa tikki korkeimmalla
            return ofLedSuit.stream()
                    .max(Comparator.comparingInt(c -> c.getRank().getValue()))
                    .orElseThrow();
        }

        // Ei lyötyä väriä - tyhjennetään matalin kortti kädestä
        return hand.stream()
                .min(Comparator.comparingInt(c -> c.getRank().getValue()))
                .orElseThrow();
    }
}
