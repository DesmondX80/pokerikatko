package com.pokerikatko.service;

import com.pokerikatko.model.Card;
import com.pokerikatko.model.Player;
import com.pokerikatko.model.Rank;
import com.pokerikatko.model.Suit;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BotServiceTest {

    private final BotService bot = new BotService();

    @Test
    void hylkaaYksinaisetKortitJaSailyttaaParin() {
        Player player = new Player("p1", "Botti", true);
        player.setHand(new ArrayList<>(List.of(
                new Card(Suit.HERTTA, Rank.KING),
                new Card(Suit.RUUTU, Rank.KING),
                new Card(Suit.PATA, Rank.TWO),
                new Card(Suit.RISTI, Rank.FIVE),
                new Card(Suit.HERTTA, Rank.NINE)
        )));

        List<Card> discards = bot.decideDiscards(player);

        assertEquals(3, discards.size());
        assertTrue(discards.stream().noneMatch(c -> c.getRank() == Rank.KING));
    }

    @Test
    void sailyttaaKorkeimmanKickerinaJosEiPareja() {
        Player player = new Player("p1", "Botti", true);
        player.setHand(new ArrayList<>(List.of(
                new Card(Suit.HERTTA, Rank.TWO),
                new Card(Suit.RUUTU, Rank.FIVE),
                new Card(Suit.PATA, Rank.SEVEN),
                new Card(Suit.RISTI, Rank.NINE),
                new Card(Suit.HERTTA, Rank.ACE)
        )));

        List<Card> discards = bot.decideDiscards(player);

        assertEquals(4, discards.size());
        assertTrue(discards.stream().noneMatch(c -> c.getRank() == Rank.ACE));
    }
}
