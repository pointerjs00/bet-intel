# Casino Portugal (SFP Online, licença SRIJ 007) — estudo de viabilidade de odds

Data: 2026-11-21. Pedidos feitos à casa e à infraestrutura dela: ~28 (limite 60), todos com ≥ 2 s de intervalo, só `curl` com headers de browser (User-Agent, Accept, Accept-Language pt-PT, Origin/Referer `https://www.casinoportugal.pt`). Nenhum desafio anti-bot nos endpoints de dados.

## 1. Veredicto

**Viável.** O desporto do Casino Portugal é um sportsbook NSoft embebido (`/desporto`) cuja API REST de oferta é pública, sem autenticação nem cookies, devolve JSON com calendário, mercados e odds pré-jogo de futebol, basquetebol e ténis, e pagina bem. Duas limitações: **não encontrei id BetRadar** (ver 6) e as odds vêm em inteiros (÷ 10000) com nomes de mercado/seleção num dicionário separado.

## 2. Fonte técnica

- Site: `www.casinoportugal.pt` (Cloudflare à frente do site; HTML devolvido normalmente com UA de browser). Secção de apostas: `https://www.casinoportugal.pt/desporto` (ao vivo `/direto`).
- Plataforma: **NSoft "AIO" / Sports Web** (`nsftx-sports-web.nsoft.app/nsftx-sports-web.js`, módulo Vue carregado na página). A CSP do site também lista `*.nsoft.app`, `*.de-2.nsoft.cloud`, `*.7platform.net`.
- Config pública, no HTML de `/desporto` (`sportsWidget`): `tenantId: 10ca03ad-9dc4-4320-bbc2-c93a42194d08`, `lang: pt`, `statisticsDomain: https://aio-offer-distribution.de-2.nsoft.cloud`. O mesmo `tenantId` e `lang` vêm do HTML; o tenant é estável (configuração de tenant, não sessão).
- API de oferta (extraída de `nsftx-stores-*.js`): base `https://aio-offer-distribution.de-2.nsoft.cloud`, método GET, `Accept: application/json`. Headers que funcionaram: User-Agent de browser, Accept, Origin e Referer do site (não testei sem Origin). Sem tokens, sem cookies, sem login. Sem geo-bloqueio observado a partir de IP doméstico PT (não testei fora de PT).
- Existe também WebSocket `wss://aio-offer-distribution.de-2.nsoft.cloud` (atualizações, compressão zstd) — não usado nem necessário; polling REST chega.
- Limites: sem 429 nem bloqueios nos ~20 pedidos à API. `expectedNumberOfEvents` tem máximo **200** (400 acima disso).
- Os outros hosts do bundle (`aio-betslip-rest`, `aio-bet-list-rest`, `aio-cashout`, `aio-client-proxy`) são de aposta/conta e não foram tocados.

## 3. Calendário das próximas 48 h

```
GET {base}/tenants/{tenant}/games/1,2/languages/pt/offer/cursors
    ?expectedNumberOfEvents=200&numberOfMarketsPerSport=6&marketTypes=1&eventTypes=1
    &sports={sportId}&startsAtFrom=2026-11-21T00:00:00&startsAtTo=2026-11-23T01:00:00
    &extensions=market-feature-flags
```

- `games=1,2` = pré-jogo + live (o app usa `2` só para live; `1,2` incluiu apenas jogos futuros no filtro de datas). `eventTypes=1` = jogos (2 = outrights).
- Datas em UTC, formato `YYYY-MM-DDTHH:mm:ss` sem `Z`.
- Ids de desporto (da API de contagens): futebol **69**, basquetebol **72**, ténis **75**; também 67 andebol, 70 futebol americano, 71 futsal, 74 hóquei no gelo, 78 voleibol, 83 rugby, 60 basebol, 44 polo aquático.
- Paginação: a resposta traz `cursorId` (~400-1000 chars, opaco). Próxima página: `GET .../offer/cursors/{cursorId}?expectedNumberOfEvents=200&numberOfMarketsPerSport=6&extensions=market-feature-flags` (testado: 200 eventos novos, sem sobreposição). Primeira página pode trazer 201 eventos.
- Contagem prévia (sem eventos, barata): `GET .../games/2,1/languages/pt/offer-stats/event-counts/cursors?eventTypes=1&startsAtFrom=..&startsAtTo=..` → `sportNumberOfEvents` por desporto, `tournamentNumberOfEvents`, etc.
- Pedidos precisos para 48 h: futebol 3 (539 jogos), basquetebol 2 (238), ténis 1 (37) = **~6 por ciclo de 10 min**, mais 1 opcional de contagens.
- Resposta normalizada: tabelas `sports`, `categories` (países/regiões), `tournaments`, `markets` (dicionário dos mercados incluídos), `events`. O jogo traz só os mercados pedidos em `numberOfMarketsPerSport` (6 para futebol: Hipótese Dupla, Total de golos, Ambas marcam, Qualificar, Vencedor da final, 1x2; mas por jogo vêm só ~4, os que existem) — o 1x2 (`marketId 1708`) já vem no calendário. Ordem das páginas não é cronológica (por prioridade de torneio).

## 4. Mercados completos de um jogo

```
GET {base}/tenants/{tenant}/games/1,2/languages/pt/offer/events/{eventId}[,{eventId2}...]
    ?extensions=market-feature-flags&excludeSportCategoryTournamentMetadata=false
    &excludeMarketMetadata=false&waitForEventsToBecomeAvailable=false
```

- Aceita vários ids separados por vírgula (usado pelo app para vários jogos de uma vez).
- Devolve `events[0].markets[]` (`marketId`, `outcomes[]` com `outcomeId`, `odds`, `status`, `specifiers[]` com `{id:2, value:"2.5"}` = linha) e o dicionário `markets[]` com nomes dos mercados e das seleções (`name`, `eventMarketOutcomeName` com placeholders `{{E.C1.NAME}}`/`{{E.C2.NAME}}`).
- **Odds = inteiro ÷ 10000** (`20400` → 2,04). `status:1` = ativa; vi `status:2` em seleções suspensas (inferido, não confirmado).
- Um mercado com linhas (Total, Handicap) vem como um único `marketId` com várias seleções, uma por linha, distinguidas por `specifiers` (mesmo `outcomeId` repetido).
- `outcomes[].id` (1,2,3…) é a posição/slot; a identidade da seleção é `outcomeId` → nome no dicionário (ex. 5158 Casa, 5168 Empate, 5240 Fora no 1x2; 1x2 `marketId 1708`).

## 5. Cobertura medida (janela 21–23/11/2026, pré-jogo)

| Desporto | Eventos 48 h | Hoje (21/11) | Amanhã (22/11) | Mercados/jogo |
|---|---|---|---|---|
| Futebol | 539 (contagem); 400 lidos nas 2 primeiras páginas | 249 (de 401 lidos) | 152 (de 401 lidos) | 100 num jogo da Ligue 1; 82 num da Escócia |
| Basquetebol | 238 (contagem); 202 lidos | 123 | 79 | 41 (LPB), média 38 |
| Ténis | 37 (contagem), 38 lidos | 38 | 0 | 14 singulares, 7 pares (dobles), média 11,4 |

Hoje/amanhã só contados nas páginas lidas (futebol não leu a 3.ª página, basquetebol 1 página de 2).

Mercados num jogo de 1.ª liga de futebol (Lens–Toulouse, 100): 1x2, Hipótese Dupla, Empate anula aposta, Total de golos (várias linhas), Handicap e Handicap 1x2, Ambas marcam, 1.ª e 2.ª parte (1x2, totais, ambas marcam, handicap), Resultado ao intervalo/final, Resultado correto, Golos exatos, Margem de vitória, Cantos (total, handicap, intervalos, 1x2), 1x2 & Total, 1x2 & Ambas marcam, marcadores (primeiro, último, a qualquer momento), vários mercados de equipa.

Ténis (14): Vencedor, Handicap de set, Vencedor Xº set, Total jogos, Handicap total de jogos, Handicap de jogos Xº set, Resultado correto (melhor de 3), Ímpar/Par jogos, Vencedor & Total jogos.

Basquetebol (41): Vencedor (incl. prol.), Handicap, Total de pontos (várias linhas), 1x2 (3 vias, tempo regulamentar), totais e handicaps por parte e por quarto, totais de equipa, Ímpar/Par, Margem de vitória, Intervalo/Final.

## 6. Campos para emparelhar

- Evento: `id` (inteiro NSoft, ex. 1605656), `name` ("Lens vs. Toulouse FC"; `Casa vs. Fora`), `startsAt` ISO UTC (`2026-11-21T19:45:00Z`), `competitors[]` com `ordinal` (1 casa, 2 fora), `teamName`, `typeId`, `gender`. Em ténis o nome é "Apelido, Nome" (ex. "Burel, Clara") nos singulares e "L Pigossi / L Stefani" nos pares, com `teamName` em `competitors`.
- Competição: `tournamentId` → `tournaments[].name` (ex. "Ligue 1", "LPB") e `categoryId` → `categories[].name` + `code` (ex. "França"/`FRA`; "Clubes Internacionais"/`INT`); desporto `sportId` → `sports[].code` (`soccer`, `basketball`, `tennis`).
- **Id BetRadar: não encontrado.** Nenhum campo de evento ou competidor o traz. Existe `GET .../offer-id/exchange?events={ids}&idTypes={x}` (visto no bundle) que provavelmente troca ids NSoft por ids externos, mas respondeu 400 "Can't exchange IDs. Please verify requested types" para `idTypes` 0–5, 10, `sportradar`, `betradar` (maiúsculas e minúsculas) — não consegui descobrir o valor válido (o código que o chama está em chunk que não localizei) e parei de adivinhar. O `typeId` dos competidores (ex. 131445 para o Lens) é um id interno NSoft, não foi verificado se coincide com BetRadar. O site usa widgets Sportradar (`/sportradar-widgets/auth/token`, exige sessão), o que sugere que o id existe do lado deles.
- Sem id externo, o emparelhamento teria de ser por nomes de equipas + hora (como com ESPN) e por canonicalização dos mercados via `parseBet`.

## 7. Riscos e esforço

- Esforço do adaptador: **M**. Pedidos simples, JSON estável, sem auth; trabalho está no mapeamento de `marketId`/`outcomeId` (dicionário vem na própria resposta) para as chaves canónicas, tratar linhas via `specifiers`, odds ÷ 10000, e nomes ténis "Apelido, Nome". Para só 1x2/vencedor/total no calendário é S-M.
- Riscos: API não documentada (pode mudar ou passar a exigir token/Origin); `tenantId` fixo no HTML (ler da página se mudar); `expectedNumberOfEvents` ≤ 200; sem BetRadar id obriga a emparelhar por nome/hora; mercados com `{{E.C1.NAME}}`/`{{M.S.QUARTER_NUMBER}}` precisam de substituição de placeholders; ordem não cronológica (filtrar por `startsAt`); Cloudflare à frente do site (não do endpoint de dados) — o bundle JS vem de `nsftx-sports-web.nsoft.app`.
- Pendente se a casa interessar: descobrir `idTypes` válido de `offer-id/exchange` (pode dar o id BetRadar); confirmar significado de `status` das seleções; confirmar acesso sem `Origin`.

Amostras: `samples/casinoportugal-calendar.json` (calendário, 2 jogos de futebol com 1x2) e `samples/casinoportugal-markets.json` (3 mercados de um jogo + dicionário).
