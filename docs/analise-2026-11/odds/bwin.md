# Bwin Portugal (bwin.pt) — estudo de viabilidade de odds

Data do estudo: 2026-11-20. Só pedidos HTTP simples (cerca de 21 no total, >= 2 s entre pedidos), sem credenciais, sem cookies de sessão, sem contornar protecções. Nenhum desafio anti-bot observado.

## 1. Veredicto

**Viável.** Plataforma Entain "CDS" (a mesma da Bwin/Ladbrokes/Coral). A API JSON `cds-api/bettingoffer` é aberta e responde a `curl` com User-Agent de browser, sem cookies nem token de sessão: só precisa de um `x-bwin-accessid` público que o próprio site serve no `clientconfig`. **O id BetRadar vem em todos os jogos de futebol e de basquetebol amostrados e em 19 de 22 jogos de ténis**, o que resolve o emparelhamento. Ressalvas: payload pesado no calendário de futebol; o 1X2 principal de cerca de 1/3 dos jogos é a variante "2GV" (pagamento antecipado com 2 golos de avanço); ténis tem os mercados em `games` (formato antigo), futebol/basquetebol em `optionMarkets`.

## 2. Fonte técnica

Cadeia de descoberta (tudo público):

1. `GET https://www.bwin.pt/pt/sports` devolve o HTML da SPA; o script inline faz `fetch` ao `clientconfig`.
2. `GET https://www.bwin.pt/pt/api/clientconfig?browserUrl=http%3A%2F%2Fwww.bwin.pt%2Fpt%2Fsports` com os headers `x-bwin-browser-url: http%3A%2F%2Fwww.bwin.pt%2Fpt%2Fsports`, `x-from-product: host-app` e `x-bwin-sports-api: prod` (80 kB de JSON). Contém:
   - `publicAccessId` = `YmQwNTFkNDAtNzM3Yi00YWIyLThkNDYtYWFmNGY2N2Y1OWIx` (o `x-bwin-accessid`; público, mas convém relê-lo do `clientconfig` em vez de o fixar no código)
   - `cdsFrontendUrl` = `https://www.bwin.pt/cds-api` (usar este; existe também `cdsApiUrl` = `https://row1-cds-api.itsfogo.com`)
   - `cdsPushUrl` = `https://cds-push.bwin.pt/ws-1-0` (WebSocket de actualizações; não testado)

Pedidos que funcionaram (headers: `User-Agent` de browser, `Accept: application/json`, `Origin: https://www.bwin.pt`, `Referer: https://www.bwin.pt/pt/sports`; o `accessid` vai na query):

```
GET https://www.bwin.pt/cds-api/bettingoffer/fixtures?x-bwin-accessid=<ID>&lang=pt&country=PT&userCountry=PT
    &fixtureTypes=Standard&state=Latest&offerMapping=Filtered&offerCategories=Gridable
    &fixtureCategories=Gridable,NonGridable,Specials,Outrights&regionIds=&competitionIds=&conferences=
    &isPriceBoost=false&statisticsModes=None&sportIds=4&skip=0&take=100&sortBy=StartDate
    &from=2026-11-20T22:00:00.000Z&to=2026-11-22T22:00:00.000Z

GET https://www.bwin.pt/cds-api/bettingoffer/fixture-view?x-bwin-accessid=<ID>&lang=pt&country=PT&userCountry=PT
    &offerMapping=All&scoreboardMode=Full&fixtureIds=2:7912742&state=Latest&includePrecreatedBetBuilder=true
    &supportVirtual=false&isBettingInsightsEnabled=true&useRegionalisedConfiguration=true&includeRelatedFixtures=false
```

Os parâmetros seguem a convenção conhecida da plataforma Entain (não li o bundle) e foram confirmados por teste: `from`/`to` (ISO UTC) filtram (futebol desce de 621 para 503 na janela de 48 h) e `sortBy=StartDate` ordena por hora (por omissão `Tags` ordena por destaque). `take=100` aceite; valores maiores não testados.

Autenticação: só o `accessid` público. Geo-bloqueio: não testado fora de Portugal (esperar bloqueio). Rate limit: nenhum observado. Latências 0,4 a 0,9 s. Tamanhos: calendário de futebol 1,5 MB por 100 jogos (9 a 10 mercados embutidos por jogo), ténis 112 kB por 22 jogos, basquetebol 1,7 MB por 100; `fixture-view` de futebol 34 a 220 kB, NBA 660 kB.

## 3. Calendário das próximas 48 h

Ids de desporto: **4 futebol, 5 ténis, 7 basquetebol**. Resposta `{fixtures, totalCount, ...}`; paginação por `skip`/`take`. Futebol (cerca de 500 jogos): 5 pedidos de `take=100`; basquetebol (cerca de 185): 2; ténis: 1. Cerca de 8 pedidos e 8 MB por ciclo de 10 min (futebol domina; `offerMapping=None` não poupou bytes de forma relevante, 2,4 MB por 100). Filtrar ligas por `competitionIds` pode reduzir.

`stage` distingue `PreMatch` de `Live`; o filtro `from` inclui jogos ao vivo, filtrar por `stage == "PreMatch"`.

## 4. Mercados completos de um jogo

`GET /cds-api/bettingoffer/fixture-view?...&fixtureIds=<fixture.id>`. Devolve `{fixture, splitFixtures, availableMarketGroupIds, ...}`. Um pedido por jogo aberto.

- Futebol e basquetebol: `fixture.optionMarkets[]` (`name.value`, `isMain`, `parameters[]` com `MarketType`/`Period`/`DecimalValue`, `options[]` com `name.value`, `sourceName.value` "1"/"X"/"2", `price.odds` decimal).
- Ténis: `fixture.games[]` (`results[]` com `name.value`, `sourceName.value`, `odds`); o calendário de ténis e de basquetebol também traz os principais em `games`.
- `totalMarketsCount` já vem no calendário.

## 5. Cobertura medida (2026-11-20, 22:00 UTC)

| Desporto | 1.º dia (20/11 22h a 21/11 22h) | 2.º dia (21/11 22h a 22/11 22h) | Total 48 h |
|---|---|---|---|
| Futebol | 326 | 177 | 503 |
| Ténis | 23 | 0 (ainda não listado) | 22 a 23 |
| Basquetebol | 136 | 49 | 184 |

(Sem filtro de data o futebol tem 621 jogos listados.) O ténis está fraco por ser entressafra: Challengers, ATP Finals, BJK Cup pares. O basquetebol é sobretudo NCAA, NBA e B.League.

Mercados por jogo (`totalMarketsCount`, média): futebol 68 a 97, ténis 9,9, basquetebol 29,7 (NBA 88). Jogo de 1.ª liga de futebol (Marítimo - Nacional, 108 mercados): 1X2, hipótese dupla, ambas marcam, total de golos (7 linhas) e por parte, golos por equipa, resultado exato, 1X2 + total, 1X2 + ambas marcam, handicap de 3 opções, margem de vitória, cantos (totais, por equipa, por parte), primeira equipa a marcar, intervalo/final. Ténis (WTA 125K, 23 mercados): vencedor, total de jogos (3 linhas), vencedor do 1.º e 2.º set, tie-break no 1.º set, resultado exato do 1.º set, número de sets, handicap de sets e de jogos. Basquetebol (NBA, 88 contados, 322 `optionMarkets`): money line, handicap e totais (21 linhas cada), 1.ª parte e 1.º quarto, par/ímpar, intervalo/final e props de jogador (triplos, ressaltos, assistências, pontos).

## 6. Campos para emparelhar

| Campo | Onde | Exemplo |
|---|---|---|
| Id do jogo | `fixture.id` | `2:7912742` (futebol), `20119484` (ténis) |
| Equipas/jogadores | `participants[].name.value`; `properties.type` HomeTeam/AwayTeam só no futebol | `CS Marítimo` / `CD Nacional` |
| Hora de início (UTC) | `startDate` | `2026-11-27T20:15:00.000Z` |
| Competição | `competition.name.value`, `.id` | `Liga Portugal` (102851) |
| País | `region.name.value`, `region.code` (ISO-3) | `Portugal` / `POR` |
| **Id BetRadar** | `addons.betRadar` (= `addons.liveMatchTracker.sportradarId`) | `72531026` |
| Nº de mercados | `totalMarketsCount` | 108 |

BetRadar presente: futebol 103/103, basquetebol 100/100, ténis 19/22. Cuidados:

- Ténis: nomes com país, "Rebeka Masarova (SUI)", e abreviados nos mercados ("R. Masarova"); pares são competição própria.
- Basquetebol (formato americano): "Sacramento Kings em casa dos Los Angeles Lakers" = visitante primeiro; `participants[0]` é o visitante, `[1]` o da casa, e `sourceName` "1" é o primeiro (visitante). Inverter ao ligar a outras casas. Nomes abreviados nas opções ("SAC Kings").
- 1X2 do futebol: `isMain=true`, `MarketType=3way`, `Period=RegularTime`. Chama-se "Resultado do jogo" (32 de 50 jogos) ou "Resultado do Jogo - 2GV" (18 de 50; América do Sul, México, Turquia, Japão). A 2GV paga antecipado com 2 golos de avanço, **não é um 1X2 puro**, e nesses jogos não vi o 1X2 simples no `fixture-view`. Decidir se a chave canónica a aceita.
- Totais: `DecimalValue` dá a linha; opções "Mais 2.5"/"Menos 2.5".

## 7. Riscos e esforço

- `accessid` público mas pode rodar: ler do `clientconfig` com cache e renovar em 401/403. Os headers `x-bwin-*` do `clientconfig` não são documentados.
- Payload grande do calendário de futebol (cerca de 8 MB por ciclo).
- Dois formatos de mercado e o 1X2 "2GV".
- Basquetebol com visitante primeiro; ténis com país nos nomes.
- Geo-bloqueio fora de PT presumível (o Pi doméstico está em PT).

Esforço do adaptador: **M**.

## Amostras

- `samples/bwin-calendar.json` (3 jogos: futebol, ténis, NBA)
- `samples/bwin-markets-football.json`, `samples/bwin-markets-tennis.json`, `samples/bwin-markets-basketball.json`
