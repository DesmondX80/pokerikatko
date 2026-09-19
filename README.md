# Pokerikatko

Pokerivaihto + tikkipeli samoilla korteilla. Java/Spring Boot -backend
sisältää pelilogiikan, React (Vite) -frontend on selainkäyttöliittymä.

Peli on tällä hetkellä "hotseat"-tyylinen: kaikki pelaavat samalla
laitteella/selaimella vuorotellen (sopii esim. läppärin ympärillä
pelaamiseen). Reaaliaikainen moninpeli eri laitteilta vaatisi
WebSocketin ja per-pelaaja-näkymän - looginen seuraava askel.

## Säännöt (näin ne on toteutettu)

1. Jokainen saa 5 korttia.
2. Pokerivaihto: jokainen hylkää 0-5 korttia ja nostaa tilalle yhtä
   monta uutta pakasta.
3. Vaihdon jälkeinen käsi tallennetaan pokeri-vertailua varten.
4. Sama 5 kortin käsi pelataan tikkipelinä (5 tikkiä). Väriä on
   tunnustettava jos se on mahdollista, muuten voi pelata minkä
   tahansa kortin. Korkein kortti lyödyssä värissä voittaa tikin
   (ei valttia). Tikin voittaja aloittaa seuraavan tikin.
5. Pisteytys kierroksen lopussa:
   - Viimeisen tikin voittaja: +1 piste
   - Paras pokerikäsi (vaiheen 3 tallennetuista käsistä): +1 piste

Jos tulkitsin jonkin säännön väärin, pelilogiikka on keskitetty
`GameEngine`-luokkaan (backend) - helppo korjata yhdestä paikasta.

## Käynnistys

### Backend (vaatii Java 21+ ja Mavenin)

```bash
cd backend
mvn spring-boot:run
```

Käynnistyy porttiin `8080`. Aja testit: `mvn test`.

### Frontend (vaatii Node.js 18+)

```bash
cd frontend
npm install
npm run dev
```

Käynnistyy porttiin `5173` (http://localhost:5173). Backendin CORS
on jo konfiguroitu sallimaan tämä osoite.

## Projektirakenne

```
backend/
  src/main/java/com/pokerikatko/
    model/       Card, Deck, Player, Trick, GamePhase, HandRank...
    service/     GameEngine (pelin tilakone), HandEvaluator (pokerikäden tunnistus), GameStore
    controller/  GameController (REST API)
frontend/
  src/
    App.jsx           Pääkomponentti / pelinäkymä
    api.js             Kutsut backendin REST-rajapintaan
    components/CardView.jsx
```

## Tekoälypelaajat

Pelaajan voi merkitä botiksi jo pelin luontivaiheessa (rasti ruutuun
aloitusnäkymässä). Botti päättää vaihtonsa ja korttinsa itse
(`BotService`): säilyttää parit/kolmoset/neloset pokerivaihdossa ja
tikkipelissä yrittää voittaa tikin tunnustaessaan väriä. Backend
ratkaisee kaikki peräkkäiset bottivuorot automaattisesti aina omien
kutsujensa yhteydessä, joten frontend ei tarvitse mitään erillistä
logiikkaa - se näkee vain seuraavan ihmispelaajan vuoron. Jos kaikki
pelaajat ovat botteja, koko kierros ratkeaa yhdellä API-kutsulla.

## REST API pähkinänkuoressa

- `POST /api/games` `{ players: [{ name: string, ai: boolean }] }` → luo pelin, jakaa kortit
- `GET /api/games/{id}` → hae tila
- `POST /api/games/{id}/draw` `{ playerId, discards: Card[] }` → pokerivaihto
- `POST /api/games/{id}/play-card` `{ playerId, card: Card }` → pelaa kortti tikkiin

`Card` on muotoa `{ "suit": "PATA", "rank": "ACE" }`.

## Seuraavat kehitysaskeleet

- WebSocket + per-pelaaja-näkymä oikeaa moninpeliä varten (kukin
  näkee vain oman kätensä)
- Moniulotteinen peli useammalla kierroksella (esim. ensimmäinen
  10 pisteeseen voittaa) - `GameEngine` tukee jo pistelaskua per
  pelaaja, tarvitsee vain uuden kierroksen aloituslogiikan
- Fiksumpi bottistrategia (nykyinen on tarkoituksella yksinkertainen
  heuristiikka, ei laske todennäköisyyksiä)
- Kättely-/discard-validointi myös frontendin puolella (nyt
  virheet tulevat vasta backendiltä)
