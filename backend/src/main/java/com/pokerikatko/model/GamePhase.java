package com.pokerikatko.model;

public enum GamePhase {
    WAITING_FOR_PLAYERS,
    DEALT,          // Kortit jaettu, odottaa vaihtoja
    DRAW_DONE,      // Kaikki vaihtaneet, kädet lukittu pokeri-vertailua varten
    TRICK_TAKING,   // Tikkipeli käynnissä
    FINISHED        // Kierros valmis, pisteet jaettu
}
