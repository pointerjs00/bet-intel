# Betano Portugal (betano.pt) — viabilidade de odds

Estudo feito em 2026-11-15 com pedidos HTTP simples (curl, User-Agent de browser, sem cookies/sessão, sem proxy), ~30 pedidos espaçados ≥2,5 s. Sem sinais de bloqueio nesta sessão.

## 1. Veredicto

**Viável com limitações.** Os endpoints JSON internos respondem hoje a pedidos simples, sem proxy e sem desafio, a partir de um IP residencial PT. O que falta é um endpoint pré-jogo que liste todos os eventos de um desporto e dê a profundidade completa de mercados; isso não foi encontrado sem automatizar um browser. Do servidor Hetzner, o histórico do repositório sugere bloqueio WAF por IP de datacenter (ver riscos).

## 2. Fonte técnica

Plataforma própria (Kaizen Gaming / "danae"), atrás de Cloudflare (`Server: cloudflare`, cookies `__cf_bm`, `_cfuvid`; a CSP referencia DataDome). Nenhuma autenticação nem geo-bloqueio visto de PT. Headers mínimos: `User-Agent` de browser e `Accept: application/json`. Alguns endpoints devolvem `301` e precisam de `curl -L`.

| Uso | Endpoint (GET) | Estado hoje |
|---|---|---|
| Live, todos os desportos | `/danae-webapi/api/live/overview/latest?includeVirtuals=true&queryLanguageId=5&queryOperatorId=7` | 200, 282 KB, JSON normalizado |
| Pré-jogo, eventos "em destaque" de uma liga | `/api/sports/FOOT/hot/trending/leagues/{leagueId}/events` | 200, poucos eventos por liga |
| Ligas em destaque | `/api/sports/FOOT/hot/trending/leagues` | 200 |
| Eventos em destaque (só ids) | `/api/home/top-events-v2` | 200, apenas `eventIdList` |
| Página de liga | `/sport/futebol/portugal/liga-2/17385/` | 200 HTML, `window["initial_state"]` com os eventos listados (só mercado 1X2) |
| Página de evento | `/odds/{slug}/{eventId}/` | 200 HTML, `initial_state` com 16 mercados |
| Endpoints antigos do scraper | `/api/sports/live/events/?sport=SOCCER` | 404 (já não existem) |
| `/api/sports/events/?sport=...` (antigo scraper) | não testado | desconhecido |
| `/api/sports/upcoming/calendar/{sportId}/` | 400 com sportId=1 | formato do parâmetro não descoberto |
| Páginas `/sport/{desporto}/jogos-de-hoje/` | 200 HTML | sem eventos no `initial_state`; carregam por XHR que não identifiquei |

Não foram observados limites de pedidos em ~30 pedidos espaçados.

## 3. Cobertura medida

- **Live (14:50 UTC, domingo):** 104 eventos: basquetebol 26, futebol 22, voleibol 18, hóquei no gelo 16, andebol 11, ténis 10, futsal 1. Cobre futebol, basquetebol e ténis.
- **Profundidade live:** o overview traz só os mercados populares: média de 4,9 mercados por jogo de futebol, 2,2 em basquetebol, 2,8 em ténis. Há `totalMarketsAvailable` (ex.: 52 num jogo de basquetebol), mas os restantes mercados não vêm neste endpoint. Tipos vistos: `MRES` (1X2), `HCTG` (totais), `H2HT` (vencedor 2 vias), `BTSC` (ambas marcam), `DBLC` (dupla hipótese), `OUH1`, `FHOT`/`AHOT` (handicap), `STWT`/`STWN` (sets), `FTPO`.
- **Pré-jogo:** o endpoint `trending/leagues/{id}/events` devolveu 1 evento na Liga 2 e 3 na Segunda División, ou seja só os destacados, não o calendário completo. Cada evento traz 6 mercados (1X2, totais, totais 1.ª parte, ambas marcam, dupla hipótese, cantos), com `totalMarketsAvailable` 111–227.
- **Evento individual (HTML):** 16 mercados inline (resultado, totais, dupla hipótese, ambas marcam, cantos, 1.ª parte, totais por equipa, empate anula, handicap, intervalo/final, resultado correto). Os restantes (148 no exemplo) dependem de um pedido que não identifiquei; os separadores (Golos, Cantos, Combos, Handicap, Minutos, Todos) existem no `initial_state` sem URL.
- **Não medido:** contagem de eventos hoje/amanhã por desporto em pré-jogo (sem endpoint de listagem completo), profundidade de ténis e basquetebol pré-jogo, marcadores e cartões.

## 4. Ao vivo

Polling do `live/overview/latest` (um pedido devolve todos os desportos). O payload tem `version`/`contentVersion`, o que sugere atualizações incrementais, e o site usa quase de certeza WebSocket/SSE, que não testei. Latência: não medida; com polling a 30–60 s o custo é ~280 KB por pedido. Traz resultado, relógio (`secondsSinceStart`), período (`Q2`) e, em ténis, sets/jogo/serviço.

## 5. Emparelhamento com a ESPN

- Nomes de equipa/jogador (`participants[].name`, `isHome`; pré-jogo `name` = "Casa - Fora"), hora de início em ms Unix (`startTime`), competição (`leagueId`, `leagueName`, `regionName`).
- `betRadarId` / `betradarMatchId` (Sportradar) em todos os eventos, útil se existir mapeamento Sportradar para a ESPN; caso contrário, emparelhar por nome normalizado e hora (±2 h).
- Nomes têm codificação UTF-8 correta no JSON.

## 6. Amostras

- `docs/analise-2026-11/odds/samples/betano-prematch-event.json` (pré-jogo, Leixões-Chaves, 3 mercados)
- `docs/analise-2026-11/odds/samples/betano-live-tennis-event.json` (live, ténis, 2 mercados)

## 7. Riscos e esforço

- **Histórico no repositório:** o `betanoScraper.ts` (removido em 5e3632b) usava Puppeteer + stealth e tentava endpoints `/api/sports/live/events/` e `/api/sports/events/`, hoje inexistentes. Os commits 1a24f19/6508d6d adicionaram `SCRAPER_HTTP_PROXY` ("para o Betano não ver o IP de datacenter") e os logs diziam "WAF block on server IP". Ou seja, no servidor Hetzner o acesso direto foi bloqueado; só o IP doméstico foi testado agora. Se o comparador correr no VPS, há risco real de 403/desafio. Contornar isso (proxy residencial) é decisão do utilizador, não foi tentado.
- Os endpoints não são documentados e podem mudar sem aviso (já mudaram desde abril). Os termos da Betano proíbem normalmente scraping.
- Falta descobrir o endpoint de listagem pré-jogo e de mercados completos por evento (DevTools sobre uma sessão normal de browser resolveria; não foi feito aqui por não automatizar browser).
- **Esforço do adaptador:** M para live (parser do formato normalizado `events/markets/selections` já esboçado no histórico) + pré-jogo parcial; L se for preciso o calendário completo e todos os mercados.
