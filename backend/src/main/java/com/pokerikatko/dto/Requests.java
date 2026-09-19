package com.pokerikatko.dto;

import com.pokerikatko.model.Card;

import java.util.List;

public class Requests {

    public static class PlayerConfig {
        public String name;
        public boolean ai;
    }

    public static class CreateGameRequest {
        public List<PlayerConfig> players;
    }

    public static class DrawRequest {
        public String playerId;
        public List<Card> discards;
    }

    public static class PlayCardRequest {
        public String playerId;
        public Card card;
    }
}
