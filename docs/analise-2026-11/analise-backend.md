# Análise do backend BetIntel (apps/api)

Âmbito: leitura de `apps/api/src`, Dockerfile, docker-compose e CI. Só leitura; nada foi alterado. Os itens já marcados como "Feito" no `PLANO_MELHORIAS.md` (#1-#13, #22-#25, #46-#48, #55-#61) não são repetidos. Caminhos relativos a `apps/api/` salvo indicação.

## Top 10 (por prioridade)

| # | Achado | Tam. | Prio. |
|---|---|---|---|
| 1 | Rotas `async` inline sem try/catch e sem handler global de `unhandledRejection`: um erro de Prisma/ESPN derruba o processo (Node 20) | S | Alta |
| 2 | Porta 3000 publicada em `0.0.0.0` e volume `uploads` montado no caminho errado (avatares perdem-se no deploy) | S | Alta |
| 3 | Boletim com uma perna perdida e outras pendentes fica `PENDING` (stats, "A decorrer" e notificação de resultado atrasam) | S | Alta |
| 4 | Seed de 1989 linhas corre a cada arranque, **antes** do `listen`, apaga e recria ligações e desativa todas as competições (não atómico) | M | Alta |
| 5 | Rotas sem autenticação com dados de API-Football antigos, perfis públicos e registo aberto na internet | S | Média |
| 6 | Código morto da API-Football (jobs, 9 rotas, 6 modelos, `fixtureEvent` etc.) mais dependências não usadas | L | Média |
| 7 | `fail()/ok()/requireUserId()` copiados em 11 controladores; alguns devolvem `err.message` e `meta` do Prisma ao cliente | M | Média |
| 8 | Tracker: itens `needsReview` continuam a ser consultados e escritos 3x/min durante 5 dias; cron de 1 min com corrida de ~40-60 s pode acumular fila | M | Média |
| 9 | Regra de retorno duplicada em 3 sítios (boletinService, statsService, userService) e freebet ganha conta `stake*odd` | M | Média |
| 10 | Testes: 0 para `boletinService`, `autoSettlementJob`, auth, importação; CI não corre testes nem `tsc` antes do deploy | M | Média |

---

## 1. Correção e dinheiro

### 1.1 Boletim com perna perdida fica pendente enquanto houver pernas por decidir
- Evidência: `services/boletins/boletinService.ts:575` devolve `PENDING` se alguma seleção estiver pendente, antes de testar `hasLost` (linha 579).
- Impacto: um múltiplo já perdido (uma perna LOST) só passa a LOST quando a última perna terminar. Até lá o Início mostra-o em "A decorrer", as estatísticas contam-no como pendente e a notificação de resultado chega horas ou dias depois. O dinheiro fica certo no fim, mas o estado está errado durante o intervalo.
- Fix: em `deriveBoletinState`, se existir `LOST` devolver `LOST` com retorno 0 mesmo com pernas pendentes (e só então a regra do PENDING). Acrescentar teste.
- Tamanho S, prioridade Alta.

### 1.2 Retorno de freebet ganha inclui a stake
- Evidência: `boletinService.ts:604-607` (WON usa `potentialReturn = stake*odd`); `statsService.ts:582` assume "freebets cost nothing so profit = returned"; `boletinService.ts:731` (`resultProfit`) idem.
- Impacto: nas casas em que a freebet não devolve a stake (caso típico, "SNR"), o lucro está sobrestimado em `stake` por cada freebet ganha. A regra exata não está documentada em `CONTEXTO_BETINTEL.md`; precisa de confirmação tua.
- Fix: se a regra for SNR, `actualReturn = stake*(odd-1)` quando `isFreebet` (também em PARTIAL, linha 595) e centralizar (ver 1.4).
- Tamanho S, prioridade Média (a confirmar).

### 1.3 Edições de seleções não são atómicas nem recalculam do zero
- Evidência: `boletinService.ts:193` + `:203` (update de metadados e depois `syncBoletinDerivedState` sem transação); `:425` + `:444` (adicionar item); `:481-482` (apagar item divide `totalOdds` pela odd do item).
- Impacto: `totalOdds` é atualizado por divisão/multiplicação incremental. Num boletim importado com odd total "aumentada" (o plano #16 admite que o import usa a odd do talão), apagar ou editar uma perna dá um total sem sentido, e o arredondamento a 2 casas das odds acumula erro. Uma falha a meio deixa item criado e totais antigos. Corrida possível com o tracker (leitura-e-escrita de estado em `syncBoletinDerivedState`, linhas 611-660).
- Fix: envolver cada operação em `prisma.$transaction`; ao mudar pernas, recalcular `totalOdds` como produto das odds restantes, exceto quando o boletim tem "odd aumentada" (guardar `boostedOdds` ou `oddsOverride` explícito).
- Tamanho M, prioridade Média.

### 1.4 Regras de retorno/estado duplicadas
- Evidência: `boletinService.ts:569-610` (`deriveBoletinState`), `statsService.ts:1562-1586` (`getEffectiveReturn`, com os seus próprios casos `PARTIAL`/`VOID`), `services/social/userService.ts:229-248` (`getPublicBoletinReturn`, outra variante).
- Impacto: os três divergem (por exemplo `PARTIAL` sem `actualReturn` devolve `stake` nas stats e `potentialReturn` no perfil público).
- Fix: um módulo `boletinMath.ts` com funções puras (estado, retorno, lucro) usado pelos três; o `statsService` passa a confiar no `actualReturn` gravado.
- Tamanho M, prioridade Média.

### 1.5 `autoSettlementJob` não é usado por omissão
- Evidência: `scheduler.ts:28` (`apiFootball: true`) e `scheduler.ts:50-55` removem o job quando `API_FOOTBALL_ENABLED` não é `true`. A liquidação real é só o `liveBetTrackerJob`.
- Impacto: `jobs/autoSettlementJob.ts` (172 linhas) e `findMatchingItems` são código morto na configuração normal; ficam duas implementações de liquidação a manter (a do tracker faz `needsReview` sem escrever resultado, a do job antigo tem confiança 0,8).
- Fix: apagar o job antigo quando o tracker cobrir as 11 competições, ou documentar como "plano B" e cobrir com teste.
- Tamanho S, prioridade Baixa.

### 1.6 Falha de notificação consome a chave `once` e pode saltar a liquidação desse ciclo
- Evidência: `jobs/liveBetTrackerJob.ts:483-486` (`once` marca antes de enviar); `handleMatchUpdate` chama `notify()` (linha ~560, `await createNotifications`) antes de `settleGroup`; um throw de Prisma/Expo aborta o resto do ciclo.
- Impacto: a notificação "Fim do jogo" perde-se para sempre (chave com TTL 3 dias) e a liquidação só ocorre no poll seguinte.
- Fix: `try/catch` em volta de cada `notify`, e apagar a chave `once` se o envio falhar; liquidar antes de notificar.
- Tamanho S, prioridade Média.

---

## 2. Robustez dos jobs e do arranque

### 2.1 Rejeições não tratadas
- Evidência: `routes/boletinRoutes.ts:37` (`/market-coverage`) e `:54` (`/:id/results`) são `async` inline sem `try/catch`; Express 4 não captura promessas rejeitadas. `grep unhandledRejection` não devolve nada. Também `void settleSoon()` (`boletinRoutes.ts:~72`) e `setInterval(() => void sportAssetsJob(), ...)` em `index.ts:283`.
- Impacto: um erro de BD ou de ESPN faz o pedido ficar pendurado e, a partir do Node 15, termina o processo (a ligação Socket.io, os jobs Bull e o tracker caem juntos; `restart: always` recupera, mas com perda de estado em memória).
- Fix: `process.on('unhandledRejection'/'uncaughtException')` com log; wrapper `asyncHandler` para todas as rotas; mover estes dois handlers para controladores.
- Tamanho S, prioridade Alta.

### 2.2 Seed em cada arranque, a bloquear o `listen`
- Evidência: `index.ts:168` (`await seedReferenceData()` antes de `app.listen` na linha 172, ao contrário do que o plano #23 diz); `prisma/seed.ts:1877` apaga `teamCompetition` de todos os desportos exceto ténis, `:1903` marca todas as competições como inativas, e depois milhares de `upsert` sequenciais. O CI ainda corre o seed à parte (`.github/workflows/build-api.yml:~126`), por isso corre 2 vezes por deploy.
- Impacto: arranque lento; durante o seed (e se falhar a meio) as listas de competições/equipas ficam vazias ou inativas na app; o `seed.ts` usa `console.log` em vez do logger.
- Fix: mover o seed para um comando de deploy único (`prisma:seed`), fazer upserts em lote/`createMany` numa transação e substituir "apagar tudo e recriar" por diff (ativar/desativar só o que mudou). Partir o ficheiro em dados (JSON) e lógica.
- Tamanho M, prioridade Alta.

### 2.3 Tracker consulta itens sem solução durante 5 dias
- Evidência: `liveBetTrackerJob.ts:138-139,259,409` (a query não exclui `needsReview`, `LOOKBACK_MS` = 5 dias, linha 37); `settleGroup` faz `update needsReview=true` a cada poll (linha ~640). Cada minuto tem 3 polls.
- Impacto: um mercado desconhecido gera até 3 escritas e 3 chamadas ESPN por minuto durante 5 dias. Para uso pessoal é pouco, mas gasta quota da ESPN e enche logs.
- Fix: excluir `needsReview: true` da query (ou só reconsultar de hora a hora) e só escrever se o valor mudar.
- Tamanho S, prioridade Média.

### 2.4 Cron de 1 minuto com execução de ~40-60 s
- Evidência: `scheduler.ts:34` (`* * * * *`) e `liveBetTrackerJob.ts:39-40,57-66` (3 polls com `sleep(20_000)` = 40 s só de espera, mais ESPN com timeout de 15 s cada, `espnFootball.ts:303`).
- Impacto: se uma execução passar de 60 s a Bull empilha jobs (um por minuto) sem limite, e há ainda a ronda `settleSoon()` em paralelo (`:106`). A atomicidade (`updateMany ... result: 'PENDING'`) protege a liquidação, mas as notificações dependem só do `once`.
- Fix: `queue.add(..., { removeOnComplete, repeat })` com lock `tracker:running` (SET NX EX 70) e saltar se ocupado; ou um loop único em vez de cron por minuto.
- Tamanho S, prioridade Média.

### 2.5 Detalhes do agendador
- `scheduler.ts:72` usa `jobId: ${name}-weekly` para todos os jobs (nome enganador); `queue.getRepeatableJobs()` + remover e recriar em cada arranque está certo, mas cada queue abre 3 ligações Redis (7 queues).
- `index.ts:261-285`: os `setInterval` dos jobs de insight vivem fora do Bull (perdem o cronograma em cada restart, sem lock entre instâncias). Só correm com `API_FOOTBALL_ENABLED`, por isso são código morto por omissão (ver 3.1).
- `tokenService.ts`: tokens de refresh expirados nunca são apagados (só se apagam quando alguém os usa). Acrescentar limpeza diária.
- `middleware/rateLimiter.ts:15-27`: se o Redis cair o RedisStore lança erro e todos os pedidos falham com 500; usar `passOnStoreError: true` (se a versão instalada o suportar).
- Tamanho S cada, prioridade Baixa.

---

## 3. Código morto e esquema

### 3.1 API-Football desligada mas ainda no código
- Evidência (existe mas está desligado por `API_FOOTBALL_ENABLED`): `scheduler.ts:24-36` (6 jobs), `index.ts:228-249,261-285`, `jobs/{standingsSync,injuriesSync,topScorersSync,fixtureStatsSync,fixtureEventsSync,fixtureLineupsSync,predictionsSync,playerStatsSync,venueSync,coachSync,currentSeasonMatchStatSync,fixtureRefresh,liveScore}Job.ts`, `services/apifootball/` (409 linhas), `services/apiFootballClient.ts`, `controllers/{insight,matchStats,standingsData,injuries,topScorers,standings,fixtureInsight}Controller.ts`.
- Rotas sem qualquer uso na app móvel (grep em `apps/mobile` sem resultados): `/api/fixtures/standings|team-stats|h2h|competition-stats|player-stats|top-cards|venue|coach`, `/api/fixtures/:id/stats|events|lineups|prediction`, `/api/standings/:id`, `/api/teams/:slug/injuries`, `/api/leagues/:id/topscorers`, `/api/fixtures/:id/insight`, `/api/fixture-alerts` e `POST /api/sync/fixtures/recent`. A app só usa `/fixtures`, `/fixtures/upcoming`, `/fixtures/recent` (`mobile/services/referenceService.ts:87,113,150`).
- Modelos sem leitores fora do código desligado: `FixtureEvent`, `FixtureLineup`, `FixturePrediction`, `PlayerStat`, `Venue`, `Coach` (só usados com `(prisma as any)`), mais `TeamStat`, `MatchStat`, `PlayerAvailability`, `TopScorer`, `FixtureStats`, `FixtureWatch` (`schema.prisma`, linhas 354-730, 802). Remover modelos exige reconciliar a BD de produção primeiro (plano #24).
- `(prisma as any)`: 32 `as any` no `src`, a maioria nestes jobs. Os modelos existem, o cast é desnecessário.
- Impacto: ~3000 linhas e 20 ficheiros que ninguém usa, mais superfície de ataque (ver 4.1) e confusão.
- Fix: etapa 1 apagar rotas/controladores sem uso; etapa 2 apagar jobs, `apifootball/` e modelos (migração depois de acertar a drift); manter só o que o "Por jogo" antigo ainda use (`/fixtures` e `Fixture`).
- Tamanho L, prioridade Média.

### 3.2 Dependências e ficheiros soltos
- `package.json`: `@anthropic-ai/sdk`, `puppeteer-core`, `proxy-chain`, `expo-document-picker` sem qualquer import em `src` (o scraping usa `puppeteer-extra`); `sharp` em `devDependencies` mas usado em runtime (avatares) se importado; `@types/sharp` obsoleto.
- `apps/api/nba.tmp.ts` é um script de debug na raiz (fora do Git, sem `.gitignore`); `docker-compose.yml:20-23` ainda passa `OPENAI_*`, `SCRAPER_HTTP_PROXY` e `AI_PARSER`; `training-data/` (30 MB) está ignorado pelo Git mas entra no contexto do `docker build` se o `.dockerignore` da raiz não o excluir (`.dockerignore` lista só `node_modules`, `dist`, `.expo`).
- Fix: remover dependências, apagar `nba.tmp.ts`, limpar variáveis, acrescentar `apps/api/training-data` ao `.dockerignore`.
- Tamanho S, prioridade Baixa.

### 3.3 Sockets
- `sockets/index.ts:56-78`: `subscribe:event`, `eventRoomName` e `liveRoomName` pertencem ao feed de odds (que já não existe) e à `liveScoreJob` (API-Football). `emitFriendActivity` existe duplicado em `sockets/index.ts:117` e `sockets/notificationSocket.ts:15`.
- Fix: apagar a duplicação e as salas de odds; manter só `user:<id>`.
- Tamanho S, prioridade Baixa.

---

## 4. Segurança básica

### 4.1 Superfície pública desnecessária
- Sem `authenticate`: `routes/fixtureRoutes.ts` (todas), `routes/footballDataRoutes.ts:25-29` (leituras), `routes/referenceRoutes.ts:14-16` e `routes/usersRoutes.ts:15,21` (`/users/check-username` e `/users/:username`, que devolve perfil e boletins públicos de qualquer utilizador). `routes/authRoutes.ts:30` mantém o registo aberto a qualquer pessoa na internet, num app de utilizador único.
- Impacto: enumeração de utilizadores e consumo de BD/CPU por anónimos; o limite global é 2000/15 min por IP (`rateLimiter.ts:66`).
- Fix: `authenticate` ao nível do router de fixtures/football/reference; flag `REGISTRATION_ENABLED=false` por omissão em produção (ou convite); `/users/:username` autenticado.
- Tamanho S, prioridade Média.

### 4.2 Porta e uploads no deploy
- `docker-compose.yml:29-30` publica `3000:3000` em todas as interfaces, contornando o Nginx e o TLS. Usar `127.0.0.1:3000:3000`.
- `docker-compose.yml:32` monta `uploads_data:/app/uploads`, mas `Dockerfile:45` define `WORKDIR /app/apps/api` e `services/social/avatarService.ts:9` grava em `process.cwd()/uploads/avatars` = `/app/apps/api/uploads/avatars`. O volume não cobre o caminho real, por isso as fotos de perfil perdem-se quando o contentor é recriado (cada deploy). A confirmar com `docker exec` no servidor.
- Fix: montar `uploads_data:/app/apps/api/uploads` (ou definir `UPLOADS_DIR` por env).
- Tamanho S, prioridade Alta.

### 4.3 Erros que revelam detalhes internos
- `controllers/boletinController.ts:44-48` devolve `err.message`, `code` e `meta` do Prisma ao cliente em erros 500 (comentário "to aid debugging"); `controllers/statsController.ts:24-28`, `friendsController.ts:19`, `usersController.ts:23`, `notificationsController.ts:20` e `importController.ts:135,180,247,471` devolvem `err.message` quando não há `statusCode`; `routes/adminRoutes.ts:83,108,144` e `footballDataRoutes.ts:40,80` também. O plano #9 só corrigiu o handler global.
- Fix: no handler comum, `>=500` devolve sempre a mensagem genérica (ver 5.1).
- Tamanho S, prioridade Média.

### 4.4 Outros
- `middleware/requireInternalKey.ts:12` compara a chave com `!==` (usar `crypto.timingSafeEqual`).
- `index.ts:71` define `express.json({limit:'10mb'})` globalmente antes das rotas; os `json({limit:'15mb'})` de `boletinRoutes.ts:~46-48` nunca chegam a aplicar-se (corpo >10 MB é recusado antes). Importações de PDF/imagem entre 10 e 15 MB falham com 413.
- `tokenService.ts:7,27`: `JWT_SECRET!` sem validação no arranque; validar todas as env obrigatórias com Zod no arranque.
- `routes/boletinRoutes.ts:54-75`: um `GET` que escreve na BD (`/:id/results` atualiza `kickoffAt`); mover a escrita para o tracker.
- `/import/scan-ai` (Gemini) e `/import/betclic-api` não têm limiter próprio; para uso pessoal, um limite baixo evita custos por engano ou abuso com token roubado.
- Tamanho S, prioridade Baixa/Média.

---

## 5. Arquitetura e consistência da API

### 5.1 Controladores copiados e envelope inconsistente
- `ok/fail/requireUserId` repetidos em 11 controladores (`grep "function fail"`). Respostas fora do envelope `{ success, data, error }`: `footballDataRoutes.ts` usa `{ ok: true }` (7 ocorrências), erros `details` do Zod só em alguns.
- Fix: `utils/http.ts` com `ok`, `asyncHandler`, `AppError`, `validate(schema)`; middleware de erro único em `index.ts:~112`.
- Tamanho M, prioridade Média.

### 5.2 Validação com Zod incompleta
- Sem schema: `notificationsController.ts:118` (`req.body as Record<string, boolean>`), `usersController.ts:75` (avatar: sem limite de tamanho do base64 além dos 10 MB globais), `req.params`/`req.query` em vários controladores (81 acessos a `req.*` vs 34 `parse`).
- Fix: schemas em `@betintel/shared` para todos os `body` e `query`.
- Tamanho M, prioridade Baixa.

### 5.3 Ficheiros gigantes
- `prisma/seed.ts` (1989): dados + lógica; mover para `data/*.json`.
- `services/stats/statsService.ts` (1819): 25 funções `build*` com o mesmo ciclo "stake efetiva, retorno, `switch (status)`" (linhas 700-1110); a lógica de freebet (`isFreebet ? 0 : stake`) repete-se 9 vezes. Partir em `stats/{summary,breakdowns,timeline,streaks,insights}.ts` com um `settledLegs()` comum.
- `services/boletins/boletinService.ts` (994): CRUD, partilha, estado derivado, notificações e agenda/live misturados; separar `boletinState.ts` (puro) e `boletinNotifications.ts`.
- `jobs/wtaRankingsJob.ts` (874) e `atpRankingsJob.ts` (403): scraping Puppeteer + Bull + persistência; só `puppeteer-extra` + Chromium no Dockerfile (+300 MB de imagem) servem isto.
- `jobs/liveBetTrackerJob.ts` (661): três desportos copiados (football/tennis/basketball têm o mesmo ciclo notificar/escrever live/liquidar nas linhas 130-470); extrair um `SportTracker` com `findMatch`, `assess`, `resolve`.
- Tamanho L cada, prioridade Média (statsService e boletinService primeiro).

### 5.4 Desempenho
- `statsService.ts:213-267`: carrega todos os boletins com todas as seleções a cada cálculo (cache Redis de 2 min, chave por opções, invalidada por `SCAN`). Com ~90 boletins é irrelevante; com anos de histórico, passar a agregar em SQL ou guardar totais.
- `listUserBoletins` e `/market-coverage` (`boletinRoutes.ts:39`) carregam tudo sem paginação. Prioridade Baixa para uso pessoal.
- Índices: `BoletinItem` tem `@@index([kickoffAt])` mas as queries do tracker filtram por `result`, `sport` e `kickoffAt` (`liveBetTrackerJob.ts:134-139`); um índice composto `(result, sport, kickoffAt)` corta o scan a cada minuto. Tamanho S, Baixa.

---

## 6. Testes e CI

- Existem 12 ficheiros de teste (853 linhas), todos sobre motores puros, notificações e stats. Sem testes para: `deriveBoletinState` (1.1, 1.2), `tokenService` (rotação e reutilização, plano #8), `importController`/`geminiVisionParser` (parse), `autoSettlementJob.findMatchingItems`, `settleGroup` do tracker (só `liveBetTrackerJob.test.ts` com 50 linhas, apenas `verdictOf`).
- O `.github/workflows/build-api.yml` não corre `npm test` nem `tsc --noEmit` antes de construir e fazer deploy; um commit que parte os motores de liquidação chega a produção.
- Fix: job `test` (`pnpm --filter api test` + `tsc --noEmit`) como `needs` do build; testes de integração mínimos com Prisma em memória ou Postgres de serviço para criar, liquidar e recalcular um boletim; `Dockerfile:12` usa `--no-frozen-lockfile` (builds não reprodutíveis), trocar para `--frozen-lockfile`.
- Tamanho M, prioridade Média.

---

## 7. Ordem sugerida

1. Rápidos (um dia): 2.1, 4.2, 1.1, 4.3, 4.4 (limite JSON), `requireInternalKey`.
2. Segunda ronda: 2.2 (seed), 2.3/2.4 (tracker), 1.6, 4.1, testes do ponto 6 e gate no CI.
3. Limpeza: 3.1 por etapas (rotas, depois jobs, depois modelos com migração), 3.2, 3.3, 5.1.
4. Refactors grandes só se fizer falta: 1.3, 1.4, 5.3.
