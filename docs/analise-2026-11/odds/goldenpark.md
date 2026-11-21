# GoldenPark (goldenpark.pt) — estudo de viabilidade de odds

Data do estudo: 2026-11-20/21. Só pedidos HTTP simples (cerca de 28 ao todo, ≥2 s entre pedidos), sem credenciais, sem cookies de sessão, sem contornar nada. Não houve desafio anti-bot no `apostas.goldenpark.pt` nem em `ws.goldenpark.pt` (o site principal `www.goldenpark.pt` está atrás de Cloudflare, mas respondeu 200 normal).

## 1. Veredicto

**Viável com limitações.** A API é JSON aberta e sem token, com mercados completos por jogo. As limitações: (a) **não há id BetRadar** (há um `match_id` interno, só em parte dos eventos), por isso o emparelhamento tem de ser por nomes + hora + competição; (b) não existe um endpoint "todos os jogos das próximas 48 h": o calendário completo exige um pedido por competição; (c) o protocolo é um RPC de "árvore de componentes" de página (verboso, sem contrato documentado).

## 2. Fonte técnica

- Marca Azartia/GoldenPark; as apostas desportivas estão em `https://apostas.goldenpark.pt/` (Nuxt 2 SSR). A plataforma é a **Sportnco** (front "UFWSClient", mesmo motor das casas francesas ligadas ao FDJ/Parions; assets em `sportx-static.sportnco.com`, widgets Statscore em `sncgoldenpark.statscore.com`). Não é Kambi, Altenar nem SBTech. O campo `odds_provider_id` é 4 em todos os eventos.
- A configuração está no bundle (`/_nuxt/c47fcec.js`): `clientBaseUrl = https://ws.goldenpark.pt/`, versão `1.0.1`. O browser faz `POST` a `ws.goldenpark.pt/component/datatree` (árvore completa de uma página) ou `component/data` (componentes soltos).

Pedido mínimo que funcionou:

```
POST https://ws.goldenpark.pt/component/datatree
Content-Type: application/json
Origin: https://apostas.goldenpark.pt
Referer: https://apostas.goldenpark.pt/
User-Agent: <browser normal>

{"context":{"url_key":"/competicao/206-nba","url_params":{},"device":"web_vuejs_desktop",
 "version":"1.0.1","lang":"pt","timezone":"Europe/Lisbon","clientIp":"1.1.1.1"}}
```

- Sem cookies, sem token, sem login. CORS devolve `access-control-allow-origin: https://apostas.goldenpark.pt` (irrelevante para um servidor).
- `url_key` é o caminho da página do site, **sem prefixo de idioma** para eventos (`/evento/<id>-<slug>`); para desporto/competição também funcionou com `/pt/...`. Com `/pt/evento/...` devolve a página 404 (cuidado).
- `device` tem de ser um valor `web_vuejs_*` (usei `web_vuejs_desktop`); a árvore filtra componentes por `device_size`.
- A resposta é `{tree_key, tree:{components:[{tree_compo_key, model, data, components:[...]}]}}`; os dados úteis estão em `data` de componentes específicos (abaixo). Resposta grande: 120 a 520 kB por pedido (sem compressão pedida; com `Accept-Encoding: gzip` deve baixar muito).
- Geo-bloqueio: não observado (IP português); não testado fora. Limites: nenhum 429 em ~28 pedidos espaçados. Latência cerca de 0,5 a 1 s.

## 3. Calendário das próximas 48 h

Não há lista única de jogos. O que existe:

| Página (`url_key`) | Componente com eventos | Conteúdo |
|---|---|---|
| `/desporte/13-futebol` (futebol), `/desporte/4-basquetebol`, `/desporte/21-tenis` | `sport_page_featured`, `top_bets_sportcatcomp`, `sport_page_live` | só destaques (cerca de 25 a 45 eventos), insuficiente |
| mesma página | `sport_page_all.data.a_z.categories[].links[]` | **lista de todas as competições** com `id`, `url`, `nb_events` (futebol: 75 competições, 484 eventos) |
| `/competicao/<id>-<slug>` | `prematch_event_list.data.events[]` | **todos os eventos pré-jogo da competição**, com os mercados principais já incluídos (`markets` 3 a 6 blocos) |
| `/apostas-ao-vivo` | (não medido) | jogos ao vivo |

Procedimento: 1 pedido por desporto para obter a lista de competições (`a_z`) e depois 1 pedido por competição com `nb_events > 0`, filtrando `ts_start` (epoch s) para as 48 h. Custo: futebol 75 pedidos se for completo; na prática chegam as ~15 a 20 competições relevantes (Primeira Liga, Segunda Liga, Taça, UEFA, top-5 ligas, etc.) a cada 10 min; ténis cerca de 6 a 8 (poucos eventos); basquetebol cerca de 10 (NBA, NCAAB, Euroliga...). Cada pedido é grande, portanto com polling a cada 10 min convém limitar a competições escolhidas. As páginas de categoria (`/categoria/15-espanha`) **não** trazem eventos (só menu). Ids de desporto: 13 futebol, 21 ténis, 4 basquetebol, 14 voleibol, 9 andebol, 10 hóquei no gelo; competições: 154 Primeira Liga, 206 NBA, 306 LaLiga, 6674 Liga dos Campeões.

## 4. Mercados completos de um jogo

`POST /component/datatree` com `url_key = <evento.url>` (ex.: `/evento/12394030-fc-arouca-rio-ave`). O componente `event_market_list.data.event` traz `markets[]` (blocos) → `bets[]` → `selections[]` com `id`, `odds` (decimal), `odds_display`, `label`, `abrev`. Um pedido por jogo (cerca de 120 kB). Os blocos têm `selection_order_type` (`1x2`, `over_under`, ...) e `group`. Os estados são `pm` (pré-jogo) e `live`; os jogos ao vivo usam `url` `/live/<id>-...` e vêm sem mercados no calendário.

## 5. Cobertura medida (2026-11-20 22:00 a 2026-11-21 00:45, hora de Lisboa)

Contagens do menu (`menu_sport`, pré-jogo + ao vivo): **futebol 484** eventos, **basquetebol 107**, **ténis 14** (época baixa, quase só Challenger/Billie Jean King Cup; 13 jogos em 24 h), voleibol 23, andebol 23, hóquei no gelo 44, futebol americano 13, snooker 19. Ao vivo no momento: 21 (futebol 5, ténis 7, basquetebol 6). Nas páginas de desporto medi 36 eventos de futebol nas próximas 48 h só nos blocos de destaque (a lista completa exige as competições).

Mercados por jogo (medido):
- Futebol, Primeira Liga (Arouca-Rio Ave): 53 blocos, 75 apostas, 451 seleções. 1X2, dupla hipótese, ambas marcam, mais/menos 1.5 a 4.5, handicaps, resultado correto, marcadores, 1.ª/2.ª parte, combinações. Calendário traz 5 a 6 blocos por jogo.
- Basquetebol, NBA (Lakers-Kings): 34 blocos, 146 apostas, 332 seleções (vencedor c/ prolongamento, muitas linhas de handicap e totais). Sem props de jogador nas amostras.
- Ténis, Challenger (Samuel-Djere): 12 blocos, 21 apostas, 46 seleções (vencedor, totais de jogos, resultado correto, set 1, handicap de jogos/sets, tie-break). Os eventos no calendário trazem 3 blocos (jogos de pares só 1 a 2).
- Média amostrada: ~33 blocos por jogo (3 jogos). Futebol de ligas menores tem menos.

## 6. Campos para emparelhar

Por evento: `id` (interno, ex. 12394030), `label` ("Casa / Fora"), `actors[]` com `type` home/away e `label`/`abrev` (para ténis de pares o nome vem abreviado, ex. "A.Klepac-N.Radisic"), `ts_start` (epoch s, UTC) e `start` (ISO com offset), `competition.{id,label}`, `category.{id,label}` (país em futebol; em ténis o `competition.label` é a cidade/torneio e a categoria "ATP - Challenger"), `sport.id`.

**BetRadar: não.** Há `match_id` (e `event_live_id`) só em eventos próximos do início ou ao vivo (ex. `14090790` para Real Madrid-Celta, `14319602`-série em NBA, `20962418` em ténis); são ids de 8 dígitos que não coincidem com a gama dos BetRadar vistos nas outras casas (7xxxxxxx), logo é um id interno ou Statscore, não utilizável para juntar com outras casas. A página de detalhe (`event_market_list`) não traz `match_id`. O emparelhamento fica por equipas normalizadas + hora (±) + competição.

## 7. Riscos e esforço

- Esforço do adaptador: **M**. Dois pedidos tipo (competição e evento), JSON simples; o trabalho está na descoberta de competições, na normalização do mapeamento de mercados/linhas (`group`, `selection_order_type`, rótulos em PT) e no emparelhamento sem BetRadar.
- Riscos: protocolo interno sem contrato (`version 1.0.1`, `device`); `url_key` com regras de prefixo; resposta pesada por pedido (200 a 500 kB nas páginas de desporto); calendário só por competição (muitos pedidos se se quiser tudo); `www.goldenpark.pt` tem Cloudflare (não afetou o subdomínio de apostas); ténis em época baixa tem poucos jogos; nomes abreviados em pares de ténis dificultam o emparelhamento.
- Não testado: ao vivo (`/apostas-ao-vivo`), geo-bloqueio fora de Portugal, limites de ritmo mais agressivos, compressão gzip.
