# Novas casas no comparador de odds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acrescentar ao comparador todas as casas portuguesas licenciadas cujas odds se obtêm sem contornar proteções: Lebull agora; Bwin, Casino Portugal, GoldenPark, Retabet, Placard e Solverde conforme os estudos de viabilidade (`docs/analise-2026-11/odds/<casa>.md`). A ESC Online fica de fora (Cloudflare Turnstile).

**Architecture:** Cada casa é um adaptador isolado em `apps/api/src/services/odds/sources/<casa>/` que implementa `OddsSource` (`apps/api/src/services/odds/types.ts`) e entra no `registry.ts`; liga-se pela variável `ODDS_SOURCES`. O adaptador traduz os rótulos da casa para texto que as chaves canónicas (`canonical.ts`) reconhecem. O emparelhamento entre casas usa, por esta ordem: ESPN, id BetRadar (com alias para a chave ESPN) e, novo neste plano, nomes + hora contra os eventos já ligados das outras casas.

**Tech Stack:** API Express + TypeScript + node:test, Redis (só TTL, sem migrações). Mobile Expo + `StyleSheet`.

**Spec:** não há spec separado. Autoridade: o pedido do utilizador ("implementação de obtenção de odds para todas as outras casas de apostas portuguesas legais possíveis"), `AGENTS.md` §0, `docs/analise-2026-11/PLANO_ODDS.md` e os estudos por casa.

## Global Constraints

- Tráfego baixo: o calendário é pedido a cada 10 min, só para as próximas 48 h; mercados completos só quando um jogo é aberto (cache de 60 s já existe). Por casa e por desporto, no máximo ~60 pedidos por atualização do calendário, com ≥ 300 ms entre pedidos à mesma casa.
- Só pedidos HTTP/WebSocket normais com headers de browser comuns. Nada de stealth, captchas, proxies ou credenciais. Um desafio anti-bot é um erro (`ProviderFormatError` ou HTTP), nunca algo a contornar.
- Cada adaptador é isolado: não importa código de outro adaptador; falhas ficam na saúde da casa (`tracked`), nunca derrubam as outras.
- Tokens/ids públicos (tenant ids, access ids) lidos da configuração pública do site no arranque, com cache, e não fixos no código, quando o estudo diz que vêm de lá.
- `SourceEvent`: `startsAt` em ISO UTC; `extraIds.betRadarId` só com um id real (`/^[1-9]\d*$/`); `mainMarkets` (1X2 / vencedor) preenchido a partir do calendário sempre que a casa o envia; `marketCount` quando existir; `countryCode` ISO-2 quando existir.
- Rótulos: `SourceMarket.marketLabel`/`selectionLabel` em PT ou na forma que `canonicalKey` (`apps/api/src/services/odds/canonical.ts`) já reconhece (ex.: "Resultado Final" com "1"/"X"/"2", "Total de Golos Mais/Menos" com "Mais de 2.5", "Ambas as Equipas Marcam" com "Sim"/"Não", "Hipótese Dupla" com "1X"/"X2"/"12", ténis "Vencedor" com nomes, basquetebol "Vencedor (incl. prolongamento)" com nomes). Os rótulos guardados em `labels[house]` são os que o registo do boletim usa, por isso têm de ser legíveis em PT.
- Uma casa nova toca sempre: `HouseId` e `HOUSE_ORDER` na API (`types.ts`, `compare.ts`) e na app (`apps/mobile/utils/odds/types.ts`), `Provider`/`LABEL` em `providerHealth.ts`, `registry.ts`, `BETTING_SITES`/`SITE_LOGOS` em `apps/mobile/utils/sportAssets.ts` (logo por favicon do domínio se não houver PNG), `apps/api/src/.env.example` e `deploy/pi/.env.example` (comentário de `ODDS_SOURCES`), `KNOWN_SITE_SLUGS` em `importController.ts` e `SITE_ENUM` em `geminiVisionParser.ts` se o slug ainda não existir.
- Ordem de apresentação `HOUSE_ORDER`: `betclic, betano, lebull, placard, solverde, bwin, casinoportugal, goldenpark, retabet` (as casas que existirem).
- Testes: `npm test` em `apps/api`; ficheiros de teste novos registados no script `test` do `apps/api/package.json`. Fixtures reais recortadas em `apps/api/src/services/odds/__fixtures__/<casa>/`. Nenhum teste faz pedidos à rede.
- Verificação real: `cd apps/api && npm run odds:coverage -- FOOTBALL betclic,<casa>` (e TENNIS, BASKETBALL) e colar o resumo no relatório.
- Mobile, tipos: `cd apps/mobile && npx tsc --noEmit`.
- Commits em inglês, terminados com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Evento sem ESPN nem BetRadar numa casa nova: tem de cair no mesmo cartão que o da Betclic quando nomes e hora coincidem (Task 1), e não pode juntar-se a um jogo diferente à mesma hora (reservas, femininos).
- Rótulos em inglês da casa: a percentagem de seleções do mercado principal com chave canónica tem de ser alta; um rótulo mal traduzido que dê uma chave errada é pior do que nenhuma chave.
- Hora de início: a Lebull tem um campo `date` com 4 h de desfasamento; usar `timestamp`.

---

### Task 1: API — emparelhar por nomes e hora com os eventos das outras casas

**Files:**
- Modify: `apps/api/src/services/odds/service.ts` (`refreshCatalogue`)
- Test: `apps/api/src/services/odds/service.test.ts`

Hoje um evento sem jogo ESPN e sem id BetRadar recebe a chave `n:{sport}:{dia}:{equipa}:{equipa}`, que só coincide entre casas se os nomes normalizados forem idênticos. As casas novas (Lebull e outras) não trazem BetRadar e escrevem nomes noutra língua, por isso ficariam em cartões separados.

- [ ] Em `refreshCatalogue`, quando `matchEvent` não encontra jogo ESPN **e** o evento não tem BetRadar válido (`radarOf(ev) === null`), procurar o jogo entre os eventos já guardados das **outras** fontes (`deps.sources`, excluindo a atual) do mesmo desporto: construir candidatos `{ providerMatchId: <chave ligada desse evento (store.getLink)>, home, away, startsAt, sport }` só a partir de eventos que já têm link, e usar `matchEvent(ev, candidatos)`. Com um resultado, a chave do evento é a desse candidato.
- [ ] Construir a lista de candidatos uma vez por chamada de `refreshCatalogue` (preguiçosamente, só se algum evento precisar), não por evento.
- [ ] Uma chave adotada assim não reescreve o `_ctx` existente (como no alias BetRadar já feito: só escreve se faltar).
- [ ] Testes (FakeSource + fake Redis, como os existentes):
  - casa A com BetRadar fora da ESPN ("Gil Vicente" vs "Casa Pia"), casa B sem BetRadar com "Gil Vicente FC" vs "Casa Pia AC" à mesma hora, refrescadas A depois B → os dois ficam com a chave `bet:` de A e `listEvents` dá um cartão com as duas casas;
  - ordem inversa (B antes de A) numa primeira volta e outra volta completa A, B → convergem para uma chave só (o B adota a de A na segunda volta);
  - "Benfica B" vs "Rival" na casa B não adota o "Benfica" vs "Rival" da casa A (variante);
  - hora a mais de 30 min de diferença → não adota.
- [ ] `npm test` verde; commit `feat(odds): join houses without ESPN or BetRadar by names and kickoff`.

### Task 2: API — adaptador Lebull

**Files:**
- Create: `apps/api/src/services/odds/sources/lebull/` (`index.ts`, `map.ts`, testes `map.test.ts`, `index.test.ts`)
- Create: `apps/api/src/services/odds/__fixtures__/lebull/` (respostas reais recortadas)
- Modify: os ficheiros da regra "uma casa nova toca sempre" (Global Constraints). `lebull` já existe em `HouseId`, `HOUSE_ORDER`, `providerHealth` e `sportAssets`; confirmar e acertar `HOUSE_ORDER` à ordem global.

Estudo: `docs/analise-2026-11/odds/lebull.md` (ler todo; amostras em `docs/analise-2026-11/odds/samples/lebull-*.json`).

- [ ] Arranque: `GET https://www.lebull.pt/share/content/init` (header `X-Locale: pt`) → `bootstrap.sb_host`; o HTML desse host tem `window.PROCESS_ENV` com `BETTING_PLATFORM_SVC_URL` e `BETTING_PLATFORM_SVC_TENANT_ID`. Guardar em memória (TTL 6 h); se falhar, erro da casa. Pedidos à API: header `X-Auth-Tenant-Id`, query `lang=pt&currency=EUR` (confirmar se `lang=pt` dá rótulos PT; se sim, usá-los).
- [ ] Calendário de 48 h por desporto (ids 1 futebol, 4 basquetebol, 3 ténis): descobrir no bundle do sportsbook o endpoint mais barato que lista jogos por desporto/data. Se não houver, `/sports` (árvore com contagens) e depois `/sports/{sportId}/leagues/{leagueId}/games` só para ligas com eventos, por ordem de contagem, até 60 ligas. Evitar `/sports/{id}/leagues/upcoming` (7 MB). Filtrar pela janela usando `timestamp` (ms UTC), nunca `date`.
- [ ] `mapEvent`: `houseEventId` = `eventId`; `home`/`away` = `teamA`/`teamB`; competição sem o prefixo do país ("England. Premier League" → "Premier League"), `countryCode` a partir do país quando der (há `utils/countryNames`); `marketCount` se existir; mercado principal do calendário em `mainMarkets`; `live` correto.
- [ ] `mapMarkets` (`/games/{eventId}/prematch`): traduzir por `stakeTypeId` (estável) para rótulos que `canonicalKey` reconhece (Global Constraints), com a linha `stakeArgument` em `line`. Ids conhecidos: 1 = 1X2, 2 = Handicap, 3 = Total, 26 = Ambas marcam, 37 = Dupla hipótese; descobrir os restantes nas amostras (empate anula, total por equipa, intervalo/final, resultado exato, vencedor ténis/basquetebol com e sem prolongamento). Tipos desconhecidos mantêm o nome da casa (ficam sem chave, só nessa casa).
- [ ] Testes com fixtures reais: calendário → eventos com hora certa (caso do `timestamp` vs `date`), competição e principal; mercados de um jogo de futebol, um de basquetebol e um de ténis → para cada fixture, as chaves canónicas esperadas das seleções principais (ex.: `FT.1X2.H`, `FT.TOTAL.goals.O.2.5`, `FT.BTTS.Y`, `B.ML.H`, `T.WIN.A`), via `canonicalKey`.
- [ ] Registar em `registry.ts`; acrescentar `lebull` ao comentário de `ODDS_SOURCES` nos `.env.example`.
- [ ] Verificação real com `npm run odds:coverage` (futebol, ténis, basquetebol) contra `betclic,lebull`; relatar cartões com as duas casas e cartões partidos.
- [ ] `npm test` verde; commit `feat(odds): Lebull adapter`.

### Task 3: API — adaptador Bwin

**Files:**
- Create: `apps/api/src/services/odds/sources/bwin/` (`index.ts`, `map.ts`, testes `map.test.ts`, `index.test.ts`)
- Create: `apps/api/src/services/odds/__fixtures__/bwin/`
- Modify: os ficheiros da regra "uma casa nova toca sempre" (Global Constraints), com `HouseId` `bwin` (o slug `bwin` já existe em `sportAssets`, `importController` e `geminiVisionParser`).

Estudo: `docs/analise-2026-11/odds/bwin.md` (ler todo; amostras `docs/analise-2026-11/odds/samples/bwin-*.json`).

- [ ] Arranque: `GET https://www.bwin.pt/pt/api/clientconfig` → `publicAccessId` (cache 6 h). Pedidos à CDS com `x-bwin-accessid`, `x-bwin-browser-url`, `x-from-product: host-app`, `x-bwin-sports-api: prod` e os restantes parâmetros exatos do estudo.
- [ ] Calendário 48 h por desporto via `.../cds-api/bettingoffer/fixtures` (paginação como no estudo; ≤ ~10 pedidos por desporto). `betRadarId` de `addons.betRadar` (só ids reais). `marketCount` quando existir. `mainMarkets` só com o 1X2 **simples** ("Resultado do jogo"); o "Resultado do Jogo - 2GV" (paga antecipado com 2 golos de vantagem) **nunca** pode receber a chave `FT.1X2.*` — manter o rótulo da casa e garantir com teste que `canonicalKey` devolve `null` para ele.
- [ ] Basquetebol com nomes à americana ("X em casa dos Y"): `home` = Y, `away` = X; a seleção "1" é o primeiro participante (fora) — mapear para os nomes certos. Teste.
- [ ] Ténis: mercados em `games` (não `optionMarkets`); tirar o sufixo de país dos nomes ("Roger Federer (SUI)" → "Roger Federer") em participantes e seleções.
- [ ] `getMarkets` via `.../fixture-view?fixtureIds=<id>`: traduzir para rótulos que `canonicalKey` reconhece (já são PT; confirmar com testes de chaves esperadas: `FT.1X2.H`, `FT.TOTAL.goals.O.2.5`, `FT.BTTS.Y`, `FT.DC.HD`, `B.ML.H`, `T.WIN.A`).
- [ ] Registar em `registry.ts`; `.env.example` (`ODDS_SOURCES`).
- [ ] Verificação real `npm run odds:coverage -- <SPORT> betclic,bwin` nos três desportos; relatar.
- [ ] `npm test` verde; commit `feat(odds): Bwin adapter`.

### Task 4: API — adaptador GoldenPark

**Files:**
- Create: `apps/api/src/services/odds/sources/goldenpark/` (`index.ts`, `map.ts`, testes)
- Create: `apps/api/src/services/odds/__fixtures__/goldenpark/`
- Modify: os ficheiros da regra "uma casa nova toca sempre" (Global Constraints), com `HouseId` `goldenpark` (nome "GoldenPark", logo por favicon de `goldenpark.pt`).

Estudo: `docs/analise-2026-11/odds/goldenpark.md` (ler todo; amostras `docs/analise-2026-11/odds/samples/goldenpark-*.json`). Plataforma Sportnco; API `POST https://ws.goldenpark.pt/component/datatree` com o corpo `context` do estudo (`url_key`, `device`, `version`, `lang: "pt"`, `timezone: "Europe/Lisbon"`), Origin/Referer `https://apostas.goldenpark.pt`.

- [ ] Calendário: página do desporto (`/desporte/<id>-<slug>`) → lista de competições (`sport_page_all.a_z`) com contagens; depois `prematch_event_list` por competição (`/competicao/<id>-<slug>`), por ordem de nº de eventos, no máximo 20 competições de futebol, 8 de basquetebol e 6 de ténis por atualização, ≥ 300 ms entre pedidos. Filtrar pela janela de 48 h. Mercado principal do calendário em `mainMarkets`. Sem BetRadar (o `match_id` interno não é BetRadar: não o pôr em `extraIds`).
- [ ] `getMarkets`: `url_key` `/evento/<id>-<slug>` (sem prefixo `/pt`); o slug vem do calendário — guardar em `pageUrl` do `SourceEvent` e usar o `hint`.
- [ ] Rótulos já em PT: confirmar com testes de chaves (`FT.1X2.H`, `FT.TOTAL.goals.O.2.5`, `FT.BTTS.Y`, `B.ML.H`, `T.WIN.A`); traduzir só o que for preciso.
- [ ] Ténis em pares com nomes abreviados: aceitar como vêm (ficam sem par se não emparelharem).
- [ ] Registar em `registry.ts`; `.env.example` (`ODDS_SOURCES`).
- [ ] Verificação real `npm run odds:coverage -- <SPORT> betclic,goldenpark`; relatar.
- [ ] `npm test` verde; commit `feat(odds): GoldenPark adapter`.

### Task 5: API — adaptador Casino Portugal

**Files:**
- Create: `apps/api/src/services/odds/sources/casinoportugal/` (`index.ts`, `map.ts`, testes)
- Create: `apps/api/src/services/odds/__fixtures__/casinoportugal/`
- Modify: os ficheiros da regra "uma casa nova toca sempre" (Global Constraints), com `HouseId` `casinoportugal` (nome "Casino Portugal", logo por favicon de `casinoportugal.pt`).

Estudo: `docs/analise-2026-11/odds/casinoportugal.md` (ler todo; amostras `docs/analise-2026-11/odds/samples/casinoportugal-*.json`). Plataforma NSoft AIO; API `aio-offer-distribution.de-2.nsoft.cloud/tenants/{tenantId}/...`.

- [ ] Arranque: ler o `tenantId` do HTML de `https://www.casinoportugal.pt/desporto` (cache 6 h); Origin/Referer do site.
- [ ] Calendário: `offer/cursors` com os ids de desporto do estudo (futebol 69, basquetebol 72, ténis 75 — confirmar no estudo), `eventTypes=1`, `startsAtFrom/To` da janela, `expectedNumberOfEvents=200`, paginação por `cursorId` (≤ 5 páginas por desporto). Filtrar por `startsAt` (as páginas não vêm por ordem). 1X2 do calendário em `mainMarkets`. Sem BetRadar (não tentar `offer-id/exchange`).
- [ ] Odds: inteiro ÷ 10000. Nomes de mercado/seleção a partir do dicionário da própria resposta; resolver placeholders como `{{E.C1.NAME}}` para os nomes dos participantes (casa/fora) antes de devolver o rótulo.
- [ ] `getMarkets`: `offer/events/{id}?excludeMarketMetadata=false`; testes de chaves esperadas (`FT.1X2.H`, `FT.TOTAL.goals.O.2.5`, `FT.BTTS.Y`, `B.ML.H`, `T.WIN.A`).
- [ ] Registar em `registry.ts`; `.env.example` (`ODDS_SOURCES`).
- [ ] Verificação real `npm run odds:coverage -- <SPORT> betclic,casinoportugal`; relatar.
- [ ] `npm test` verde; commit `feat(odds): Casino Portugal adapter`.
