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
 * processAiTurns ratkaisee kaikki peräkkäiset botti-vuorot automaattisesti,
 * kunnes on ihmispelaajan vuoro tai kierros on ohi.
 */
@Service
public class BotService {

    public void processAiTurns(GameEngine engine) {
        boolean progressed = true;
        while (progressed) {
            progressed = false;

            if (engine.getPhase() == GamePhase.DEALT) {
                for (Player p : engine.getPlayers()) {
                    if (p.isAi() && !engine.getPlayersWhoHaveDrawn().contains(p.getId())) {
                        engine.applyDraw(p.getId(), decideDiscards(p));
                        progressed = true;
                        break; // vaihe on voinut muuttua - tarkistetaan uudelleen alusta
                    }
                }
            } else if (engine.getPhase() == GamePhase.TRICK_TAKING) {
                Player toAct = engine.playerToActInTrick();
                if (toAct.isAi()) {
                    Card card = decideCardToPlay(toAct, engine.getCurrentTrick());
                    engine.playCard(toAct.getId(), card);
                    progressed = true;
                }
            }
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
