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
