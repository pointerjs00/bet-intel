# Lebull Portugal (lebull.pt) — estudo de viabilidade de odds

Data do estudo: 2026-11-15. Autorizado pelo utilizador. Só pedidos HTTP simples (cerca de 35 no total, ≥2 s entre pedidos), sem credenciais, sem contornar protecções.

## 1. Veredicto

**Viável.** A Lebull usa uma plataforma de apostas própria, partilhada com uma casa white-label (a "betting-platform" da sbteam). Não é a mesma plataforma de nenhuma das outras casas da lista (Betclic, Betano, Placard, Solverde). A API JSON é aberta e responde a pedidos simples, sem desafio anti-bot, com pré-jogo e ao vivo por polling. Cobertura de futebol, NBA e ténis boa. Ressalva: não há props de jogador, cantos, cartões nem marcadores nas amostras medidas.

## 2. Fonte técnica

Cadeia de descoberta (tudo público, lida no HTML/JS que o próprio site serve):

1. `https://www.lebull.pt/` é uma SPA React (Vite) atrás de Cloudflare. A página "Desportos" (`/apostas-desportivas`) embute um iframe.
2. O iframe vem de `bootstrap.sb_host`, devolvido por `GET https://www.lebull.pt/share/content/init` (header `X-Locale: pt`). Valor: `https://lebullpt-ssr.boxwebcdn.work`.
3. O HTML desse host (SSR React) expõe em `window.PROCESS_ENV` a configuração pública que o próprio front usa para chamar a API:
   - `BETTING_PLATFORM_SVC_URL` = `https://betting-platform.prod.sbteam.xyz`
   - `BETTING_PLATFORM_SVC_TENANT_ID` = `126dc7bf-288b-4f72-9536-3aa54648c0f4` (identificador de integração/tenant da Lebull, enviado como header)
   - `INPLAY_GAMES_TIMEOUT` = 1000 ms, `UPCOMING_GAMES_TIMEOUT` = 3000 ms (intervalos de polling do próprio site)
4. Os caminhos vêm do bundle `main.*.js` do sportsbook.

Pedido mínimo:

```
GET https://betting-platform.prod.sbteam.xyz/<caminho>?lang=pt&currency=EUR
X-Auth-Tenant-Id: 126dc7bf-288b-4f72-9536-3aa54648c0f4
Accept: application/json
```

Funciona com um User-Agent normal de browser, sem cookies e sem token (`X-Auth-Tenant-Token` só é preciso para favoritos/watchlist/streams, que não interessam). CORS aberto (`access-control-allow-origin: *`).

Endpoints úteis (todos GET, JSON):

| Caminho | Conteúdo |
|---|---|
| `/sports` | árvore desporto, país, liga com contagens de eventos e de eventos ao vivo |
| `/sports/{sportId}/leagues/{leagueId}/games` | jogos de uma liga (com os mercados principais) |
| `/sports/{sportId}/leagues/upcoming` | próximos jogos das ligas "top" do desporto (cerca de 10 ligas, resposta grande) |
| `/games/{eventId}/prematch` | evento com **todos** os mercados pré-jogo |
| `/games/{eventId}/live` | evento ao vivo com mercados e estado |
| `/sports/inplay`, `/sports/{id}/leagues/inplay` | árvore e jogos ao vivo |
| `/games/top`, `/leagues/upcoming`, `/games/search2/{termo}` | destaques, próximos, pesquisa |

Ids de desporto: 1 futebol, 3 ténis, 4 basquetebol, 13 andebol, 10 hóquei no gelo, 12 voleibol, 6 futebol americano, 19 snooker, 20 dardos, 17 futsal.

Ids de liga úteis: 4565 Primeira Liga, 4485 Premier League, 998 NBA, 33669 ATP Finals.

Autenticação e geo-bloqueio: nenhum observado (pedidos feitos a partir de Portugal; não testado a partir de fora). Rate limit: nenhum observado em cerca de 35 pedidos espaçados (sem 429 nem headers de limite). Latências 0,14 a 0,66 s. Tamanhos: `/sports` cerca de 100 kB; `/sports/1/leagues/upcoming` 7 MB (pesado, evitar); `/games/{id}/prematch` 17 a 190 kB.

## 3. Cobertura medida (2026-11-15, 18:15 UTC)

`/sports` devolveu, para eventos totais (pré-jogo e ao vivo) e ao vivo:

| Desporto | Eventos | Ao vivo |
|---|---|---|
| Futebol | 654 | 10 |
| Ténis | 158 | 11 |
| Basquetebol | 45 | 17 |
| Hóquei no gelo | 30 | 6 |
| Andebol | 15 | 2 |
| Snooker | 13 | 1 |
| Futebol americano | 13 | 7 |
| Darts | 11 | 0 |
| Futsal | 2 | 1 |
| Voleibol | 1 | 1 |

Total ao vivo: 56.

Hoje e amanhã (via `/sports/{id}/leagues/upcoming`, que só cobre as ligas "top", por isso é um mínimo; datas pelo campo `timestamp`):

- Basquetebol: 5 jogos hoje (15/11) e 14 amanhã. NBA (liga 998): 8 jogos próximos, incluindo Lakers vs Suns. Euroleague 8.
- Ténis: 12 hoje e 54 amanhã (sobretudo ATP Challenger, mais ATP Finals e WTA 125/Finals).
- Futebol: esta semana é pausa de selecções, por isso as ligas top só começam a 20/11 (10 jogos), 21/11 (41), 22/11 (20). Os 134 jogos das 10 ligas top (Premier League, La Liga, Serie A, Bundesliga, Ligue 2, Serie B, Europa League, Süper Lig, A-League, NIFL) estão listados com mercados. Hoje/amanhã só há jogos de ligas menores e selecções, não contados. Primeira Liga: 8 jogos listados (ex. Benfica vs Famalicão a 30/11).

Profundidade de mercados por evento (`/games/{id}/prematch`):

- **Futebol (Primeira Liga, Benfica–Famalicão):** 30 tipos de mercado, 194 selecções (`oddsCount` 224; na lista das ligas top a média é cerca de 226 odds por jogo e 32 tipos). Tipos: Resultado (1X2), Total (0,5 a mais linhas), Handicap, Ambas marcam, Dupla hipótese, Empate anula aposta, Total por equipa, Handicap europeu, Resultado + total, Dupla hipótese + total, Resultado + ambas marcam, Intervalo/fim de jogo, Resultado exacto, Total de golos, Golo em ambas as partes, Parte com mais golos, Ganha sem sofrer, Par/ímpar, Último golo. Não aparecem cantos, cartões nem marcadores nesta amostra (não verificado noutros jogos).
- **NBA (Lakers–Suns):** 45 tipos, 600 selecções. Vencedor (com e sem prolongamento), Handicap, Total, Total por equipa, Par/ímpar, Quarto com mais pontos, Primeiros pontos, e por metades e quartos (resultado, handicap, total, total por equipa). Sem props de jogador.
- **Ténis (Challenger/ITF):** variável conforme o jogo: de 3 tipos (pares, 8 odds) a 13 tipos e 65 selecções (Ivashka–Samuel): Vencedor, Vencedor do 1.º/2.º set, Handicap de jogos, Total de jogos, Resultado exacto, Handicap de sets, Handicap e total do 1.º set, Resultado do 1.º/2.º set, Par/ímpar.

## 4. Ao vivo

HTTP polling, sem necessidade de WebSocket. O próprio site faz polling a 1 s ao vivo (`INPLAY_GAMES_TIMEOUT=1000`) e a 3 s no pré-jogo. Um jogo ao vivo (`/games/{id}/live`) traz `homeScore`, `awayScore`, `score`, `matchSeconds`, `period` e os mercados ao vivo (cerca de 12 tipos num jogo de selecções de segundo plano; o 1X2 principal pode desaparecer quando o jogo está decidido, como num 5-1). Dois pedidos separados por 8 s devolveram o mesmo estado, pelo que a latência real das odds não foi medida (jogo sem alterações); a latência esperada é a do polling (1 a 3 s). O bundle contém também um cliente Centrifuge (WebSocket), não explorado: o polling chega para ~30 a 60 s por jogo com aposta.

Nota: `matchSeconds` mostrou 55 e depois 1 no mesmo jogo, pelo que o campo parece pouco fiável; usar a ESPN para o relógio.

## 5. Identificadores para emparelhar com a ESPN

- `eventId` (estável, numérico), `teamA` (casa), `teamB` (fora), `leagueId`/`leagueName` ("England. Premier League", "Portugal. Primeira League", "NBA", "ATP Challenger. Champaign. Hard. USA"), `countryName`.
- Hora de início: usar `timestamp` (ms, UTC). O campo `date` (`/Date(ms+0400)/`) vem com o relógio do servidor (UTC+4) tratado como UTC, por isso o `ms` dentro de `date` está 4 h atrasado. Conferido com Benfica–Famalicão (`timestamp` = 20:15 UTC) e com os jogos da NBA. Validar com a ESPN antes de depender disto.
- Nomes de equipas em inglês e sem acentos ("Famalicao"), com alguns nomes de clube encurtados ("SL Benfica"): precisa de normalização/alias para emparelhar com a ESPN. Ténis em pares vem como "Jogador A/Jogador B"; o primeiro apelido pode vir duplicado ("William Mroz Mroz").
- Os nomes dos mercados e selecções são `stakeTypeName`/`stakeName` em inglês; `stakeTypeId` é estável (1 = 1X2, 3 = Total, 2 = Handicap, 26 = Ambas marcam, 37 = Dupla hipótese). `stakeArgument` é a linha (ex. 2,5). `betFactor` é a odd decimal.

## 6. Exemplos

- `docs/analise-2026-11/odds/samples/lebull-football-prematch.json`
- `docs/analise-2026-11/odds/samples/lebull-nba-prematch.json`
- `docs/analise-2026-11/odds/samples/lebull-tennis-prematch.json`
- `docs/analise-2026-11/odds/samples/lebull-sports-tree.json`

## 7. Riscos e esforço

- **Plataforma partilhada** com outros white-labels da mesma sbteam: o adaptador, se escrito bem, serve outras casas da mesma família, mas nenhuma das casas da nossa lista parece usar esta plataforma (não verificado nas outras casas).
- A API não é documentada nem oficial: o formato, o header de tenant ou os hosts (`boxwebcdn.work`, `sbteam.xyz`) podem mudar sem aviso. O id do tenant e o `sb_host` devem ser lidos de `share/content/init` e do `PROCESS_ENV` no arranque, em vez de ficarem fixos.
- A Cloudflare está à frente de `lebull.pt` e `boxwebcdn.work`, mas não se manifestou nenhum bloqueio nos pedidos feitos. A `betting-platform.prod.sbteam.xyz` também respondeu sem desafio. Um uso mais intenso pode accionar protecções, pelo que convém manter-se nos limites do brief.
- Termos de utilização não analisados; uso pessoal e de baixa frequência.
- Lacunas: sem props de jogador, cantos, cartões ou marcadores nas amostras; sem odds de ligas menores de futebol hoje/amanhã contadas; latência real do ao vivo não medida; geo-bloqueio não testado.
- Esforço do adaptador: **S a M**. Os endpoints são simples; o trabalho está na normalização de nomes (emparelhamento com a ESPN), no mapeamento de `stakeTypeId` para o nosso esquema de mercados, na gestão das linhas (`stakeArgument`) e no ajuste do `timestamp`.
