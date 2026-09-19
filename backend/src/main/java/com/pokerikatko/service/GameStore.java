package com.pokerikatko.service;

import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class GameStore {
    private final Map<String, GameEngine> games = new ConcurrentHashMap<>();

    public void save(GameEngine engine) {
        games.put(engine.getGameId(), engine);
    }

    public GameEngine get(String gameId) {
        GameEngine engine = games.get(gameId);
        if (engine == null) {
            throw new IllegalArgumentException("Peliä ei löydy: " + gameId);
        }
        return engine;
    }
}
