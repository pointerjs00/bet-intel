# Comparador de odds — fases 0 a 2: plano de implementação

Origem: [PLANO_ODDS.md](PLANO_ODDS.md) (fases 0, 1 e 2), [ESTUDO_ODDS.md](ESTUDO_ODDS.md), relatórios e amostras em [odds/](odds/). Branch: `odds-comparador`.

## Global Constraints

- Uso pessoal (um utilizador). Correção acima de tudo: **só se comparam seleções com a mesma chave canónica**; o que não se reconhece fica fora da comparação (aparece só na casa de origem).
- **Sem migrações de schema.** Odds e ligações vivem no Redis com TTL.
- **Pouco tráfego.** Calendário de cada casa de 10 em 10 min, só para as próximas 48 h. Mercados completos de um evento só a pedido, com cache de 60 s. Pedidos com um User-Agent de browser fixo e `Accept-Language: pt-PT`.
- Cada casa é isolada: uma falha (exceção, formato novo, 403) regista-se na saúde da casa e **nunca** parte as outras nem a API.
- Resposta da API: `{ success: boolean; data?: T; error?: string }`. Erros 500 devolvem só "Erro interno do servidor". Rotas novas exigem `authenticate`. Handlers async inline usam `asyncHandler` (`apps/api/src/utils/asyncHandler.ts`).
- Código em `apps/api/src/services/odds/` (estrutura em PLANO_ODDS §2). Lógica pura separada do I/O, para ser testável sem rede nem Redis.
- Testes: node:test via ts-node (`npm test` em `apps/api`). Cada ficheiro de teste novo é acrescentado ao script `test` do `apps/api/package.json`. Fixtures (respostas reais gravadas) em `apps/api/src/services/odds/__fixtures__/`. Os testes **não** fazem pedidos à rede.
- Antes de cada commit: `npx tsc --noEmit` e `npm test` em `apps/api`, ambos verdes.
- Commits pequenos, mensagens em inglês (`feat(odds): ...`), a terminar com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Textos para o utilizador em PT-PT.

### Chave canónica (formato exato, usado por todas as tarefas)

Uma seleção normalizada é uma string. Lados e linhas:
- `H`/`D`/`A` = casa/empate/fora (ténis: `A`/`B` = 1.º/2.º jogador pela ordem do evento);
- linhas com o mínimo de casas decimais (`2.5`, `10.5`, `3`, `-1.5`, `+0.5`; handicaps sempre com sinal; totais sem sinal);
- nomes de jogadores normalizados: minúsculas, sem acentos, espaços simples.

**Futebol** (a partir das `legs` do `parseBet`):
| Leg | Chave |
|---|---|
| RESULT, 1 resultado | `{P}.1X2.{H|D|A}` |
| RESULT, 2 resultados | `{P}.DC.{HD|HA|DA}` (pela ordem H, D, A) |
| TOTAL | `{P}.TOTAL.{stat}.{O|U}.{line}`; com equipa: `{P}.TOTAL.{stat}.{H|A}.{O|U}.{line}` |
| BTTS | `{P}.BTTS.{Y|N}` |
| HTFT | `HTFT.{ht}{ft}` (ex.: `HTFT.HD`) |
| SCORE | `FT.SCORE.{h}-{a}` |
| DNB | `FT.DNB.{H|A}` |
| HANDICAP | `{P}.HCP.{EU|AS}.{H|A}.{line}` |
| SCORER | `SCORER.{mode}[.{n}].{jogador}` (`player` null → `NONE`; `orAssist`/`orSub` → sufixo `.OA`/`.OS`) |
| FIRST_GOAL | `FT.FIRSTGOAL.{H|A|NONE}` |
| PARITY | `{P}.PARITY.{EVEN|ODD}` |
| PLAYER_STAT, PLAYER_CARD | fora da comparação na v1 (`null`) |

- `{P}` é `FT`, `1H` ou `2H`; `{stat}` é o nome do campo (`goals`, `corners`, `cards`, …).
- Apostas com várias pernas: chaves das pernas ordenadas e unidas por `+`. Com `mode: 'ANY'`, o resultado fica `ANY(<chaves unidas por +>)`.
- `extraTimeIncluded` → prefixo `ET:`.

**Ténis:** `T.WIN.{A|B}`; `T.SETS.{a}-{b}`; `T.SET{n}.WIN.{A|B}`; `T.GAMES.{O|U}.{line}`; `T.GAMES.HCP.{A|B}.{line}`; `T.SETSTOTAL.{O|U}.{line}`.

**Basquetebol:**
- `B.ML.{H|A}` (vencedor, prolongamento incluído);
- `B.1X2.{H|D|A}` (tempo regulamentar);
- `B.HCP.{H|A}.{line}`;
- `B.TOTAL.{O|U}.{line}`;
- `B.TEAMTOTAL.{H|A}.{O|U}.{line}`;
- quartos e partes com prefixo `Q{n}:` / `H{n}:` (ex.: `Q1:B.TOTAL.O.52.5`);
- props de jogadores fora da comparação na v1.

---

## Task 1: Documentação — as odds voltam, com regras

**Fazer:**
1. `AGENTS.md` §0: trocar o ponto "No odds scrapers" por um ponto curto. Deve dizer que o comparador de odds (Betclic, Betano, Lebull, Placard, Solverde) está a ser construído segundo `docs/analise-2026-11/PLANO_ODDS.md`, com as regras: pouco tráfego, chave canónica via `parseBet`, Redis sem migrações, adaptador isolado por casa. Acrescentar `docs/analise-2026-11/` e `docs/MIGRACAO_RASPBERRY_PI.md` às referências.
2. `CONTEXTO_BETINTEL.md`: na tabela de coisas retiradas (linha com "Scrapers de odds"), acrescentar uma nota de 15/11/2026 a dizer que o utilizador pediu o comparador.
3. `docs/analise-2026-11/PLANO_ODDS.md` §6: marcar como decididas as seguintes.
   - Betano: recolha a partir do Raspberry Pi em casa (IP português), sem proxy.
   - Mercados da v1: os que o analisador reconhece, conforme a chave canónica do `plano-odds-fase1-2.md`.
   - Captura da Placard: pendente, a cargo do utilizador.
4. PT-PT, sem tocar em código.

## Task 2: Tipos e chave canónica do futebol

**Fazer:**
1. Em `apps/api/src/services/marketResolutionEngine.ts`: exportar os tipos `Leg`, `ParsedBet`, `Side` e `Period` (só acrescentar `export`; nenhuma mudança de comportamento).
2. Criar `apps/api/src/services/odds/types.ts`:
   - `OddsSport = 'FOOTBALL' | 'BASKETBALL' | 'TENNIS'`;
   - `HouseId = 'betclic' | 'betano' | 'lebull' | 'placard' | 'solverde'`;
   - `SourceEvent { house; houseEventId: string; sport; competition: string; home: string; away: string; startsAt: string /* ISO UTC */; live: boolean; extraIds?: { betRadarId?: string } }`;
   - `SourceMarket { marketLabel: string; selectionLabel: string; line?: number | null; odds: number; suspended: boolean }`;
   - `OddsSource { house: HouseId; listEvents(sport: OddsSport, fromIso: string, toIso: string): Promise<SourceEvent[]>; getMarkets(houseEventId: string): Promise<SourceMarket[]> }`;
   - `CanonicalSelection { key: string | null; house; marketLabel; selectionLabel; odds; suspended }`.
3. Criar `apps/api/src/services/odds/canonical.ts`, puro:
   - `footballKey(marketLabel, selectionLabel, ctx: { home: string; away: string }): string | null`, que chama `parseBet` com `MatchContext { homeNames: [home], awayNames: [away] }` e serializa as legs no formato exato das Global Constraints;
   - `legKey(leg)`, exportado para teste.
4. Testes `canonical.test.ts` com **rótulos reais** tirados das amostras em `docs/analise-2026-11/odds/samples/` e dos relatórios `odds/betclic.md`, `betano.md` e `lebull.md` (mercados 1X2, dupla hipótese, totais, ambas marcam, handicap, resultado exato, marcadores). Têm de existir pelo menos estes casos:
   - "Resultado (Tempo Regulamentar)"/"Espanha" (Betclic) e o equivalente da Betano e da Lebull dão a mesma chave `FT.1X2.H`;
   - um total de golos 2.5 → `FT.TOTAL.goals.O.2.5`;
   - "As duas equipas marcam"/"Sim" → `FT.BTTS.Y`;
   - uma dupla hipótese → `FT.DC.HD`;
   - um rótulo não reconhecido → `null`.
   Se uma casa usar um rótulo que o `parseBet` ainda não reconhece mas que é claramente um destes mercados, **não** alterar o `parseBet` nesta tarefa: registar no relatório (lista de rótulos por casa a reconhecer depois).

## Task 3: Chave canónica do ténis e do basquetebol

**Fazer:**
1. Em `canonical.ts`, acrescentar `tennisKey(marketLabel, selectionLabel, ctx: { playerA: string; playerB: string }): string | null` e `basketballKey(marketLabel, selectionLabel, ctx: { home: string; away: string }): string | null`, no formato exato das Global Constraints.
   - Podem reutilizar helpers puros dos motores (`tennisMarketEngine.ts`, `basketballMarketEngine.ts`). Para isso, exportar helpers internos que já existam (ex.: `sideOf`, `lineIn`, `overUnder`, `scopeOf`, `playerOf`) sem mudar comportamento.
   - A identificação de jogador ou equipa nos rótulos usa a mesma lógica dos motores (nomes, apelidos), para que o que se compara seja o que se liquida.
2. Função de entrada `canonicalKey(sport, marketLabel, selectionLabel, ctx)` que despacha para as três.
3. Testes com rótulos reais das amostras: vencedor, totais de jogos e de pontos, handicap, resultado em sets, vencedor do 1.º set e total de um quarto. Mais um caso `null` por desporto.

## Task 4: Emparelhamento de eventos (casa → jogo ESPN)

**Fazer:**
1. `apps/api/src/services/odds/matcher.ts`.
   - **Parte pura:** `matchEvent(ev: SourceEvent, candidates: Candidate[]): Candidate | null`, em que `Candidate = { providerMatchId: string; league: string | null; home: string; away: string; startsAt: string }`. Regras:
     - mesmo desporto;
     - início a ±30 min;
     - `teamNamesMatch(ev.home, c.home) && teamNamesMatch(ev.away, c.away)`, ou com casa/fora trocados, só no ténis;
     - mais de um candidato → o de início mais próximo; empate → `null` (ambíguo).
   - **Chave do evento canónico:** `eventKey(ev, match)`. Com match: `espn:{sport}:{providerMatchId}`. Sem match: `bet:{sport}:{betRadarId}` quando existe; senão `n:{sport}:{YYYY-MM-DDTHH}:{teamKey(home)}:{teamKey(away)}`, usando a normalização exportada do `marketResolutionEngine` (exportar `teamKey` se preciso, sem mudar comportamento).
   - **Parte I/O:** `candidatesFor(sport, dateIso, cache)`, que obtém os jogos ESPN do dia e do dia seguinte:
     - futebol: `fetchEspnFootballDay` para cada liga de `ESPN_FOOTBALL_LEAGUES` (e seleções);
     - NBA: `fetchEspnNbaDay`;
     - ténis: `fetchEspnTennisDay('atp' | 'wta')`.
     Reutiliza o `DayCache` de `sportsData/itemMatch.ts`, se servir.
2. Testes da parte pura com jogos ESPN gravados em `sportsData/__fixtures__` e eventos de casas construídos a partir das amostras:
   - nomes PT/EN ("Espanha"/"Spain", "Sporting CP"/"Sporting");
   - fora da janela → `null`;
   - ambiguidade → `null`;
   - ténis com ordem trocada.

## Task 5: Armazenamento (Redis) e comparação

**Fazer:**
1. `apps/api/src/services/odds/store.ts`, só I/O, com chaves exatas:
   - `odds:events:{house}:{sport}`: JSON `SourceEvent[]` do último calendário, TTL 30 min;
   - `odds:link:{house}:{houseEventId}`: `eventKey`, TTL 48 h;
   - `odds:markets:{house}:{houseEventId}`: JSON `{ fetchedAt, markets: SourceMarket[] }`, TTL 60 s;
   - `odds:index:{eventKey}`: hash `house → houseEventId`, TTL 48 h.
2. `apps/api/src/services/odds/compare.ts`, puro.
   - `mergeEvent(perHouse: Partial<Record<HouseId, CanonicalSelection[]>>): ComparedSelection[]`, em que `ComparedSelection = { key: string | null; label: string; prices: Partial<Record<HouseId, { odds: number; suspended: boolean }>>; best: HouseId | null }`.
     - Seleções com a mesma `key` não nula juntam-se.
     - `key` null fica uma linha só dessa casa.
     - `best` é a odd mais alta entre as não suspensas; num empate ganha a ordem `betclic, lebull, betano, placard, solverde`.
     - `label` é o rótulo da primeira casa por essa ordem.
   - `compareMultiple(legs: Array<Partial<Record<HouseId, { odds: number; suspended: boolean }>>>): { perHouse: Partial<Record<HouseId, { total: number | null; missing: number }>>; best: HouseId | null }`.
     - O total é o produto, arredondado a 2 casas.
     - `null` quando falta pelo menos uma perna ou uma está suspensa; `missing` conta as pernas em falta.
     - `best` é o maior total completo.
3. Testes de `compare` com casos à mão:
   - junção de duas casas;
   - melhor odd;
   - suspensa ignorada;
   - empate;
   - múltipla com perna em falta;
   - arredondamento.

## Task 6: Saúde por casa, registo de fontes e rotas `/api/odds`

**Fazer:**
1. `providerHealth.ts`: acrescentar ao tipo `Provider` os valores `odds-betclic`, `odds-betano`, `odds-lebull`, `odds-placard` e `odds-solverde`, e as etiquetas PT em `LABEL` (ex.: "Odds Betclic"). Os adaptadores usam `tracked(...)`.
2. `apps/api/src/services/odds/registry.ts`: `getSources(): OddsSource[]`, ativadas pela variável `ODDS_SOURCES` (lista separada por vírgulas; omissão: vazia). Uma `FakeSource` (só para testes) vive no ficheiro de teste, não no registo.
3. `apps/api/src/services/odds/service.ts` (I/O), que liga tudo:
   - `refreshCatalogue(source, sport)`: `listEvents` para as próximas 48 h → `store` → emparelhamento (`matcher`) → links e índice;
   - `getEvent(eventKey)`: para cada casa do índice, mercados com cache de 60 s (`getMarkets` só quando a cache expira) → `canonicalKey` → `mergeEvent`;
   - `listEvents(sport, dateIso)`: eventos canónicos do dia, com o mercado principal (`FT.1X2.*`, `T.WIN.*`, `B.ML.*`) já comparado e o nº de casas;
   - cada chamada a uma casa está protegida: erros são registados (`tracked`) e a casa fica de fora dessa resposta.
4. `apps/api/src/routes/oddsRoutes.ts`, montado em `/api/odds` com `authenticate`:
   - `GET /events?sport=FOOTBALL|BASKETBALL|TENNIS&date=YYYY-MM-DD`;
   - `GET /events/:key` (key com URL-encoding);
   - `POST /multiple` com body `{ selections: [{ eventKey, selectionKey }] }`, validado com Zod;
   - `GET /health`.
   Respostas no envelope padrão.
5. Testes do `service` com uma `FakeSource` e um Redis falso em memória (injetado). Têm de cobrir:
   - um evento em duas casas fica junto;
   - uma casa a lançar exceção não parte o resultado;
   - `POST /multiple` calcula como `compareMultiple`.

## Task 7: Job do calendário

**Fazer:**
1. `apps/api/src/jobs/oddsCatalogueJob.ts`: fila Bull, repetível de 10 em 10 min (`*/10 * * * *`). Para cada fonte de `getSources()` e cada desporto, chama `refreshCatalogue`.
   - Lock Redis por casa: `odds:lock:{house}`, `SET NX PX 540000`, libertado com compare-and-delete, como em `liveBetTrackerJob`.
   - Pausa de 2 s entre desportos da mesma casa.
2. Agendar no `warmUp()` do `index.ts`, com o mesmo padrão try/catch dos outros jobs. Só agenda se `ODDS_SOURCES` não estiver vazio.
3. Teste da função que percorre fontes e desportos com fontes falsas: chama cada uma e continua quando uma falha.

## Task 8: Betclic — schema protobuf e fixtures reais

**Contexto:** ver `docs/analise-2026-11/odds/betclic.md`. A API gRPC-web é `https://offering.begmedia.com/web/offering.access.api/offering.access.api.MatchService/<Método>`, com os headers `x-bg-ref-*` desse relatório. O bundle `main-*.js` da betclic.pt contém descritores protobuf-ts. Os nomes de campo das amostras atuais são **inferidos**.

**Fazer:**
1. Obter o bundle público da página `https://www.betclic.pt/futebol-sfootball` (poucos pedidos, espaçados ≥ 2 s) e extrair os descritores das mensagens necessárias:
   - pedidos `GetMatchesBySport*` e `GetMatchWithNotification`;
   - resposta `Match`, com competição, contestants, data, estado ao vivo, mercados, seleções, odds e linhas.
   Escrever `apps/api/src/services/odds/sources/betclic/betclic.proto`, ou um schema protobufjs em JSON/TS, só com os campos usados.
2. Dependência: usar `protobufjs`, se ainda não existir no monorepo (pnpm).
3. Gravar fixtures reais, em binário codificado em base64, em `__fixtures__/betclic/`:
   - uma lista de futebol (limit 100);
   - uma de basquetebol;
   - uma de ténis;
   - o detalhe de um jogo de futebol com vários mercados.
   Guardar só o primeiro frame (snapshot).
4. Testes de descodificação: as fixtures descodificam com o schema e os campos têm valores plausíveis (nomes de equipas, odds > 1, datas futuras à data da gravação).
5. Relatório: lista de campos usados, com o número de campo protobuf e o significado.

## Task 9: Betclic — adaptador `OddsSource`

**Fazer:**
1. `sources/betclic/grpcWeb.ts`, puro:
   - `encodeFrame(bytes)`, que acrescenta o cabeçalho de 5 bytes;
   - `readFrames(buffer)`, que separa frames de dados e o trailer (`0x80`) e lê `grpc-status`.
   Testes com bytes construídos à mão e com as fixtures.
2. `sources/betclic/index.ts` implementa `OddsSource`.
   - `fetch` com `AbortController`: lê só até ao fim do **primeiro frame** de dados e aborta, porque o stream continua aberto.
   - Timeout de 10 s.
   - Headers exatos do relatório e User-Agent de browser fixo.
   - `listEvents(sport, from, to)` pagina `offset` de 100 em 100 até uma página vir com menos de 100 jogos, ou até 10 páginas. Filtra por `startsAt` dentro da janela. Mapeia para `SourceEvent`.
   - `getMarkets(matchId)` usa `GetMatchWithNotification` e mapeia cada seleção para `SourceMarket` com os rótulos PT tal como a Betclic os mostra.
   - Tudo dentro de `tracked('odds-betclic', …)`.
   - Mapeamento puro (`mapMatch`, `mapMarkets`) separado do I/O e testado com as fixtures da Task 8.
3. Registar `betclic` no `registry.ts` (ativo quando `ODDS_SOURCES` contém `betclic`).

## Task 10: Integração ponta-a-ponta com fixtures

**Fazer:**
1. Teste de integração sem rede:
   - adaptador Betclic sobre as fixtures (fetch injetado);
   - `matcher` com jogos ESPN gravados (escolher fixtures em que haja pelo menos um jogo em comum; se não houver, construir candidatos ESPN mínimos com os nomes e horas da fixture da Betclic);
   - `canonical` e `service.getEvent`.
   O teste verifica:
   - o evento fica ligado a um jogo ESPN;
   - o mercado principal tem a chave `FT.1X2.*` com a odd da Betclic;
   - pelo menos 5 mercados do detalhe têm chave canónica.
2. Relatório com a taxa de cobertura: percentagem de seleções do detalhe com chave não nula, por grupo de mercado. Lista dos rótulos sem chave, para melhorar o `parseBet` numa fase seguinte.
3. Acrescentar `ODDS_SOURCES=` ao `apps/api/.env.example` e ao `deploy/pi/.env.example`, com uma linha de explicação (ex.: `ODDS_SOURCES=betclic`).

## Task 11: Corrigir o analisador de mercados (também afeta a liquidação) e auditar apostas já liquidadas

**Problema (confirmado a 15/11/2026):** `parseBet` em `apps/api/src/services/marketResolutionEngine.ts` lê mal mercados restritos ou qualificados e devolve pernas do jogo inteiro. O motor de liquidação usa estas pernas. Uma aposta destas pode ter sido liquidada com o resultado errado. Exemplos com `ctx` Leixões–GD Chaves:
- "Total de golos - 1ª Parte" / "Mais de 0,5" → `TOTAL period FT` (devia ser `1H`)
- "Total de Golos Mais/Menos - 2ª Parte" / "Mais de 1,5" → `FT` (devia ser `2H`)
- "Resultado - 1º Tempo" / "Leixões" → `RESULT FT` (devia ser `1H`)
- "Resultado correto - 1ª Parte" / "1-0" → `SCORE`, avaliado no resultado final
- "Cantos 1X2" / "1", "Cartões - Resultado" / "1", "Resultado nos primeiros 10 minutos" / "1" → `RESULT FT`
- "Total de Golos da Equipa da Casa" / "Mais de 1,5" → total do jogo (devia ser o total da equipa da casa)

**Fazer:**
1. Corrigir o `parseBet`, mantendo o comportamento nos casos que hoje estão certos:
   - períodos "1ª/2ª Parte", "1º/2º Tempo" e "Intervalo" (fora de "Intervalo/Final") → `1H`/`2H`;
   - `SCORE`, `DNB`, `FIRST_GOAL` e `SCORER` restritos a uma parte → não suportados (`null`, vão para revisão), salvo se o motor já os souber liquidar por parte;
   - mercados de cantos e de cartões com resultado (1X2) → `RESULT` com `stat` só se o motor o suportar; senão `null`;
   - intervalos de minutos ("primeiros 10 minutos", "minutos") e "resto do jogo" → `null`;
   - totais de equipa por "Equipa da casa/visitante" ou pelo prefixo "<equipa> -" → `team: 'H'|'A'`;
   - totais asiáticos → `null`, salvo se o motor suportar meia-linha/quarto de linha.
2. Testes no `marketResolutionEngine.test.ts` com todos os exemplos acima e os do relatório da Task 2. Os testes atuais continuam verdes (as 185 seleções reais do estudo de estatísticas não regridem).
3. Simplificar as guardas do `canonical.ts` que deixem de ser precisas, sem enfraquecer nenhuma.
4. **Auditoria (só leitura):** script `apps/api/src/scripts/auditMisparsedSettlements.ts`:
   - procura `BoletinItem` liquidados automaticamente cujo `market`/`selection` corresponde aos padrões acima;
   - volta a avaliar cada um com o `parseBet` corrigido;
   - lista os que mudariam de resultado (id, boletim, mercado, seleção, resultado atual → resultado novo, ou "agora vai para revisão").
   **Não altera dados.** O utilizador decide depois. Corre com `DATABASE_URL` apontado para a produção, à parte.

## Task 12: Combinações mal lidas pelo analisador (liquidação)

**Problema (encontrado na revisão da Task 11):**
- "Leixões vence e ambas marcam" / "Sim" dá uma só perna `BTTS`: a perna do resultado perde-se e a aposta é liquidada só como "ambas marcam".
- "Leixões marca" / "Sim" dá um marcador chamado "sim".
- Combinações com períodos diferentes (ex.: "1ª parte X e jogo Y") aplicam o período do mercado a todas as pernas.

**Fazer:**
1. Corrigir o `parseBet` para que cada perna destas combinações seja lida, ou o conjunto dê `null` (vai para revisão). Nunca uma combinação reduzida a uma só perna.
2. "<equipa> marca" / "Sim|Não" → `TOTAL goals {H|A} O/U 0.5`, ou `null`.
3. Testes com estes rótulos e a mesma verificação antes/depois sobre o corpus de seleções reais da Task 11 (nenhuma mudança fora das pretendidas).
4. Pequenos ajustes deixados pela revisão da Task 11:
   - "Total de golos do jogo / da partida / do encontro" volta a ser o total do jogo;
   - no `SUSPECT` do script de auditoria, acrescentar `^x \(` e `\bpor \d` (verificados na seleção);
   - acrescentar uma nota no output da auditoria: o resultado usado inclui o prolongamento.

## Task 13: Mais duas leituras erradas do analisador (liquidação)

**Problema (encontrado na revisão da Task 12, já existia antes):** com `ctx` Leixões–GD Chaves:
- "Total de golos de Leixões" / "Mais de 1,5" é lido como total do jogo; a equipa no mercado é ignorada. Deve dar `TOTAL goals team H`.
- "Resultado correto" / "Leixões 2-1" é lido como vitória do Leixões; devia ser `SCORE 2-1`, com o resultado na perspetiva certa (casa-fora), ou `null` se for ambíguo.

**Fazer:** corrigir as duas leituras no `parseBet`. Mesmas regras das Tasks 11–12:
- testes com estes rótulos e variações ("Total de golos do Leixões", "Golos de GD Chaves", "Resultado exato / GD Chaves 1-2", "Resultado correto / 2-1 Leixões");
- verificação antes/depois no corpus de seleções reais (nenhuma mudança fora das pretendidas);
- confirmar a chave canónica (`footballKey`) destes casos.

## Task 14: Rótulos reais da Betclic mal lidos (comparador e liquidação)

**Problema (encontrado ao passar o detalhe real da Betclic pelo `canonicalKey`):**
- "As duas equipas marcam ou Acima de 2,5 golos" / "Não": significa "não marcam ambas **e** menos de 2,5". Hoje dá `FT.BTTS.N`, a mesma chave do "ambas marcam: Não".
- "Primeira Parte - 1.ª equipa a marcar" / "Estónia" (e "Segunda parte"): dá `1H.TOTAL.goals.H.O.0.5`. Devia ser primeira equipa a marcar nessa parte, ou `null`.
- "Estónia -Total de golos - par/ímpar" / "Impar"/"Par": é a paridade dos golos dessa equipa, mas dá `FT.PARITY.*` (paridade do jogo).

**Fazer:**
1. Corrigir no `parseBet` (serve a liquidação e o comparador):
   - "Não" num mercado "A ou B" → todas as pernas negadas (com `mode ALL`), ou `null`;
   - "1.ª equipa a marcar" restrita a uma parte → `null`, a não ser que o motor saiba liquidar o primeiro golo por parte;
   - paridade de uma equipa → `null`, a não ser que o motor suporte paridade por equipa.
2. Uniformizar "primeiro golo: nenhum": a chave deve ser `FT.FIRSTGOAL.NONE` (formato da especificação), e não `SCORER.FIRST.NONE`.
3. Testes com os rótulos reais da Betclic, das fixtures em `apps/api/src/services/odds/__fixtures__/betclic/`. Verificação antes/depois no corpus de seleções reais (nenhuma mudança fora das pretendidas).
4. Repetir a sonda de cobertura (`canonicalKey` sobre todas as seleções do detalhe da Betclic). Reportar a percentagem e confirmar que não há chaves erradas, revendo à mão todas as famílias de mercados com chave.

---

## Estado no fim (16/11/2026)

Tarefas 1 a 14 feitas, revistas tarefa a tarefa, com revisão final do branch e ronda de correções. 249 testes, `tsc` sem erros. Comparador **desligado por omissão** (`ODDS_SOURCES` vazio).

### Pendentes (por ordem de importância)
1. **Liquidação:** totais de equipa escritos sem separador ("Bayer 04 Total de golos", "Leixões: Total de golos", "Total de golos (Leixões)", "Leixões Mais/Menos") ainda são lidos como total do jogo. Não aparece em nenhum talão real; é plausível vindo de screenshots. Correção sugerida: se um TOTAL sem equipa tiver no mercado o nome de uma das equipas, vai para revisão.
2. **Liquidação:** "Golos - Fora" é lido como total do jogo, enquanto "Golos - Casa" vai para revisão. Com o Casa Pia em jogo, "Total de golos - Casa" vai para o lado do Casa Pia.
3. **Decisão do utilizador:** "Marcador: Nenhum" quando os únicos golos são autogolos (hoje dá perdida; muitas casas pagam).
4. **Decisão antes da 2.ª casa:** comparar odds ao vivo da Betclic com odds pré-jogo de outras casas (marcar ou esconder).
5. **Auditoria:** depois do merge, correr `npm run audit:misparsed` contra a produção para rever apostas antigas lidas mal.
6. **Comparador:** cobertura de 48,7% das seleções da Betclic. Faltam: pares de jogadores, resultado correto com espaços ("1 - 0"), combinações resultado+golos, resultado ao intervalo, golos exatos por parte. `mergeEvent` guarda o primeiro duplicado da mesma casa em vez do melhor. Alias "Man Utd".
7. **Robustez:** o job do calendário não se volta a agendar se o Redis estiver em baixo no arranque; falta um teste de timeout a meio da resposta da Betclic; ainda não há fixtures de detalhe de basquetebol e ténis.
8. **Documentação:** frase "Old scrapers… stay gone" no AGENTS.md; a linha de riscos do PLANO_ODDS ainda fala em proxy.

### Próximas fases (PLANO_ODDS.md)
Fase 3 (ecrãs na app), 4 (Lebull), 5 (múltiplas), 6 (Betano, a partir do Pi), 7 (Placard/Solverde, depois da captura), 8 (CLV).
