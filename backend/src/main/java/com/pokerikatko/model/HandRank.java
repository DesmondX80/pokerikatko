package com.pokerikatko.model;

public enum HandRank {
    HIGH_CARD(1, "Korkea kortti"),
    PAIR(2, "Pari"),
    TWO_PAIR(3, "Kaksi paria"),
    THREE_OF_A_KIND(4, "Kolmoset"),
    STRAIGHT(5, "Suora"),
    FLUSH(6, "Väri"),
    FULL_HOUSE(7, "Täyskäsi"),
    FOUR_OF_A_KIND(8, "Neloset"),
    STRAIGHT_FLUSH(9, "Suoraväri");

    private final int value;
    private final String finnishName;

    HandRank(int value, String finnishName) {
        this.value = value;
        this.finnishName = finnishName;
    }

    public int getValue() {
        return value;
    }

    public String getFinnishName() {
        return finnishName;
    }
}
