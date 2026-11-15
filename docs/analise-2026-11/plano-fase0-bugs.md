# Fase 0 — Bugs e riscos: plano de implementação

Origem: [PLANO.md](PLANO.md) (fase 0) e os relatórios desta pasta. Branch: `fase0-bugs`.

## Global Constraints

- Uso pessoal (um utilizador). Correção dos dados e do dinheiro acima de tudo.
- Seguir `AGENTS.md` secção 0 (o estado atual manda sobre a especificação original). Mensagens de UI e de erro em PT-PT; o termo na UI é "boletim".
- Resposta da API: `{ success: boolean; data?: T; error?: string }`. Erros 500 devolvem só "Erro interno do servidor" (nunca `err.message` nem `meta` do Prisma).
- **Sem migrações de schema nesta fase** (a base de produção tem drift; ver plano #24).
- **Regra de freebet confirmada pelo utilizador:** freebet de 5 € a odd 2,00 ganha → retorno 10 €, lucro 10 € (a stake não custa nada). O código atual (`actualReturn = stake × odd`, lucro = retorno) está CERTO; não mudar. Freebet anulada → retorno 0.
- Testes da API: `npm test` em `apps/api` (node:test via ts-node). Ficheiros de teste novos têm de ser acrescentados ao script `test` do `apps/api/package.json`. Lógica pura da app: `TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' node -r ts-node/register/transpile-only --test <file>` em `apps/mobile`.
- Mobile: estilos com `StyleSheet` e os tokens de `theme/tokens.ts`; preferir `components/ui/` (`AppText`, `Button`, etc.). Sem NativeWind.
- Antes de cada commit: `npx tsc --noEmit` no pacote alterado sem erros novos, e `npm test` na API verde.
- Commits pequenos, mensagem em inglês no estilo do repo (`fix(api): ...`, `fix(mobile): ...`).

---

## Task 1: Múltipla com uma perna perdida passa logo a LOST

**Problema:** `deriveBoletinState` em `apps/api/src/services/boletins/boletinService.ts` (~linha 569) devolve `PENDING` se existir alguma perna pendente, antes de verificar se há perna perdida. Uma múltipla já perdida fica "pendente" até acabar o último jogo: aparece em "A decorrer", as estatísticas contam-na como pendente e a notificação de resultado chega tarde.

**Fazer:**
1. Mover `deriveBoletinState` para um módulo puro novo `apps/api/src/services/boletins/boletinState.ts` (exportado), sem dependências de Prisma além de `Prisma.Decimal` e dos enums. `boletinService.ts` importa-o.
2. Nova ordem: sem pernas → PENDING; alguma perna LOST → LOST com `actualReturn = 0` (mesmo com pernas pendentes); senão, alguma PENDING → PENDING; depois as regras atuais (PARTIAL, VOID, WON) sem alterações.
3. Verificar os chamadores (`syncBoletinDerivedState` e quem envia a notificação/evento socket de resultado) e garantir que: (a) a notificação de resultado é enviada quando o estado passa de PENDING para LOST; (b) quando as pernas restantes forem liquidadas depois, o boletim continua LOST e **não** é enviada segunda notificação de resultado. Se o código já só notifica na transição de estado, documentar isso no relatório.
4. O tracker (`liveBetTrackerJob.ts`) deve continuar a liquidar as pernas restantes de um boletim LOST (o resultado de cada perna conta para as estatísticas por mercado). Confirmar que nenhuma query filtra itens por `boletin.status = PENDING` de forma a deixá-las pendentes para sempre; se filtrar, corrigir.
5. Testes novos `boletinState.test.ts`: LOST + PENDING → LOST/0; WON + PENDING → PENDING; todas WON → WON com `potentialReturn`; WON + VOID → PARTIAL com stake × odds ganhas; só VOID não-freebet → VOID com stake; só VOID freebet → VOID com 0; **freebet 5 € odd 2,00 ganha → WON com retorno 10**.

## Task 2: A API não pode cair por uma promise rejeitada

**Problema:** Express 4 não apanha erros de handlers `async`. Há rotas async inline sem try/catch (ex.: `apps/api/src/routes/boletinRoutes.ts` `/market-coverage` e `/:id/results`) e não existe handler de `unhandledRejection`/`uncaughtException` em `apps/api/src/index.ts`. Um erro do Prisma ou da ESPN pode derrubar o processo.

**Fazer:**
1. Criar `apps/api/src/utils/asyncHandler.ts`: `asyncHandler(fn)` que embrulha um `RequestHandler` async e passa erros a `next(err)`.
2. Percorrer todos os ficheiros em `apps/api/src/routes/` e envolver com `asyncHandler` todos os handlers async **inline** (definidos dentro do ficheiro de rotas). Handlers de controladores que já têm try/catch próprio não precisam de mudar.
3. Confirmar que o error handler global devolve `{ success: false, error: 'Erro interno do servidor' }` com 500 e regista o erro com o logger (Winston). Se não existir, criar.
4. Em `index.ts`: `process.on('unhandledRejection', …)` regista com `logger.error` e **não** sai; `process.on('uncaughtException', …)` regista e sai com código 1 (o Docker reinicia o contentor, `restart: always`).
5. Teste: `asyncHandler.test.ts` com um handler que rejeita e verifica que `next` recebe o erro.

## Task 3: Editar seleções é atómico e não estraga a odd total

**Problema:** em `boletinService.ts`, atualizar metadados, adicionar e apagar pernas faz várias escritas sem transação (~linhas 193–203, 425–444, 481–482). Apagar uma perna divide `totalOdds` pela odd dessa perna, o que acumula arredondamento e dá valores sem sentido em boletins importados com odd aumentada (o import grava de propósito a odd total do talão).

**Fazer:**
1. Envolver cada operação de alteração de pernas (adicionar, editar, apagar) e a atualização de metadados que depois recalcula o estado em `prisma.$transaction` (a função de recalcular estado tem de aceitar o cliente da transação).
2. Recalcular `totalOdds` a partir das pernas, nunca por divisão incremental: `produto = Π odds das pernas`. Para preservar odd aumentada: **antes** da alteração calcular `boost = totalOddsAtual / produtoAtual`; se `|boost − 1| > 0,01`, o novo `totalOdds = novoProduto × boost`; senão `totalOdds = novoProduto`. Arredondar a 2 casas só no fim. `potentialReturn = stake × totalOdds` (2 casas).
3. Pôr esta função de cálculo no módulo puro `boletinState.ts` (criado na Task 1) e testá-la: apagar perna sem boost; apagar perna com boost de 10 %; adicionar perna; boletim com uma só perna restante.

## Task 4: Seed de arranque seguro e só quando o catálogo muda

**Problema:** `apps/api/src/index.ts` chama `seedReferenceData()` (`apps/api/src/prisma/seed.ts`, função `seed`, ~linha 1872) em cada arranque, antes do `listen`. O seed apaga ligações equipa-competição, apaga equipas de ténis duplicadas e põe **todas** as competições `isActive: false` antes de as reativar, sem transação: uma falha a meio deixa a base sem competições ativas. Corre em cada deploy/reinício.

**Fazer:**
1. Calcular um hash (SHA-256) do catálogo definido no código (os arrays/objetos que o seed escreve) e guardá-lo no Redis em `seed:catalogue-hash` depois de um seed bem-sucedido. No arranque, se o hash for igual, saltar o seed (registar "seed skipped: catalogue unchanged"). Se o Redis falhar, correr o seed (comportamento atual). Variável `FORCE_SEED=true` força a execução.
2. As operações destrutivas (`deleteMany`, `updateMany isActive:false`) e as escritas que as repõem têm de correr dentro de um `prisma.$transaction` interativo (timeout suficiente, ex. 120 s). Se a transação ficar grande demais, alternativa aceitável: em vez de desativar tudo e reativar, desativar só as competições que **não** estão no catálogo (`updateMany where id/slug notIn catálogo`), e apagar só as ligações que já não existem no catálogo. Escolher uma e explicar no relatório.
3. O comando `npm run prisma:seed` continua a funcionar (sempre força).
4. Teste: a função de hash é determinística (mesmo input → mesmo hash; ordem de chaves diferente num objeto não muda o hash, se aplicável).

## Task 5: Tracker não repete trabalho e não se sobrepõe

**Problema:** `apps/api/src/jobs/liveBetTrackerJob.ts` corre a cada minuto (3 leituras por execução, ~20 s). Itens já marcados `needsReview` continuam a ser consultados e reescritos (`update … needsReview: true`) em cada leitura durante dias. Uma execução lenta (40–60 s) pode sobrepor-se à seguinte.

**Fazer:**
1. Quando um item já tem `needsReview = true` e o jogo dele terminou, o tracker não o volta a avaliar nem a escrever (sai da query de candidatos, ou é filtrado antes de qualquer pedido externo). Itens `needsReview` cujo jogo ainda decorre continuam a receber as notificações ao vivo como hoje.
2. Escritas `needsReview: true` só acontecem se o valor ainda não for `true` (usar `updateMany where needsReview: false`).
3. Lock no Redis por execução: `SET liveBetTracker:lock <id> NX PX 55000`; se não conseguir, a execução sai logo com log debug; libertar no fim (só se o valor ainda for o seu).
4. Testes no `liveBetTrackerJob.test.ts` (ou ficheiro novo) para a seleção de candidatos: item needsReview com jogo terminado é excluído; item needsReview com jogo ao vivo continua.

## Task 6: Infra — avatares persistentes e CI que testa antes de publicar

**Problema A:** `apps/api/docker-compose.yml` monta o volume `uploads_data` em `/app/uploads`, mas o `Dockerfile` usa `WORKDIR /app/apps/api` e a app grava em `path.resolve(process.cwd(), 'uploads')` = `/app/apps/api/uploads`. Os avatares perdem-se em cada deploy.
**Problema B:** `.github/workflows/build-api.yml` faz build e deploy sem correr testes nem `tsc`.

**Fazer:**
1. Mudar o volume para `uploads_data:/app/apps/api/uploads`. Não mexer na publicação da porta 3000 (a configuração do Nginx no servidor não está no repositório; fica como verificação manual para o utilizador).
2. Acrescentar ao workflow um job `test` (ubuntu, Node 20, `npm ci` na raiz do monorepo ou onde o lockfile estiver — verificar), que corre `npx prisma generate` (schema em `apps/api/prisma/schema.prisma` ou onde estiver — verificar), `npx tsc --noEmit` e `npm test` em `apps/api`. `build-and-push` passa a ter `needs: test`.
3. Confirmar localmente que os comandos do job passam (correr os mesmos comandos). Não fazer push.

## Task 7: Ecrã de nova palavra-passe (deep link do email)

**Problema:** o email de recuperação (`apps/api/src/utils/email.ts` ~linha 46) aponta para `betintel://reset-password?token=…`, mas não existe esse ecrã na app; a API já tem `POST /api/auth/reset-password { token, newPassword }`.

**Fazer:**
1. Criar `apps/mobile/app/(auth)/reset-password.tsx`: lê `token` de `useLocalSearchParams`; campos nova palavra-passe e confirmar (com mostrar/esconder) e indicador de força igual ao do registo (reutilizar o componente/função do `register.tsx` se existir; senão extrair para partilhar); validação Zod com as mesmas regras do registo (mín. 8, maiúscula, número, carácter especial); botão "Guardar palavra-passe" chama a API através da camada de serviços (`apps/mobile/services/`), não `apiClient` direto no ecrã. Sucesso → `router.replace('/(auth)/login')` com toast "Palavra-passe alterada. Já podes entrar."; token inválido/expirado → mensagem clara e ligação para "Pedir novo link" (`forgot-password`). Sem token → mesma mensagem.
2. Garantir que o deep link `betintel://reset-password?token=…` chega a este ecrã: verificar como o Expo Router mapeia a rota (o grupo `(auth)` não entra no URL, por isso `/reset-password` deve resolver) e que o AuthGate de `app/_layout.tsx` não redireciona para fora dele, esteja ou não o utilizador com sessão (se tiver sessão, deixar abrir na mesma).
3. Declarar o ecrã no `app/(auth)/_layout.tsx` se os outros estiverem declarados lá.
4. Estilo com tokens e `components/ui`, PT-PT.

## Task 8: Tocar numa notificação de jogo abre esse jogo

**Problema:** em `apps/mobile/app/_layout.tsx` (~linha 320) as notificações ao vivo fazem `router.push('/(tabs)/fixtures', { openFixtureId: data.fixtureId })`, mas `fixtures.tsx` nunca lê esse parâmetro. Além disso, o tracker (`liveBetTrackerJob.ts` ~linhas 545 e 578) envia `espnMatchId` e não `fixtureId`, por isso hoje estas notificações caem no ramo `boletinId` e abrem o boletim.

**Fazer:**
1. API: no `data` das notificações de jogo do tracker, acrescentar `sport` (`football` | `basketball` | `tennis`) e, no futebol, `league` (o slug ESPN que o ecrã `/jogo/[id]` espera); no ténis, a data ISO que `/jogo/tenis/[id]` espera (ver como `fixtures.tsx` ~linhas 198–200 navega para cada tipo e enviar exatamente o necessário). Manter `boletinId` e `espnMatchId`.
2. App: no listener de resposta a notificações, se `data.espnMatchId` existir e o tipo for de jogo ao vivo (`LIVE_MATCH_NOTIF_TYPES`, incluir também os tipos usados pelo tracker, ex. `BET_DECIDED` → esse abre o boletim, não o jogo), navegar para o detalhe do jogo certo (`/jogo/[id]`, `/jogo/nba/[id]`, `/jogo/tenis/[id]`) com os parâmetros recebidos. Se faltar algum parâmetro necessário, abrir o boletim (`boletinId`) como hoje.
3. Remover o ramo morto `openFixtureId`.
4. Extrair a decisão "notificação → rota" para uma função pura (`apps/mobile/utils/notificationRoute.ts`) com testes (futebol, NBA, ténis, sem parâmetros → boletim, KICKOFF_REMINDER → boletim, social → notificações).

## Task 9: Boletim já perdido não gera ruído ao vivo

**Problema (consequência da Task 1):** uma múltipla passa a LOST assim que uma perna perde, mas as pernas restantes continuam a ser acompanhadas. O tracker (`apps/api/src/jobs/liveBetTrackerJob.ts`) ainda envia notificações ao vivo (início, golo com estado da aposta, "se acabasse agora", intervalo, fim, cartão vermelho, "aposta ganha/perdida") para essas pernas, e `getLiveItems` em `apps/api/src/services/boletins/boletinService.ts` (~linha 879) ainda as mostra em "A decorrer" no Início.

**Fazer:**
1. O tracker continua a **liquidar** as pernas restantes de um boletim LOST (não mudar isso), mas não envia nenhuma notificação ao vivo nem de decisão de perna para itens cujo boletim já está LOST.
2. `getLiveItems` não devolve itens de boletins LOST.
3. Testes: um boletim LOST com perna pendente não gera notificação ao vivo (testar ao nível da função pura de decisão de notificação, se existir; senão extrair um predicado pequeno `shouldNotifyLive(boletinStatus)`/equivalente e testá-lo) e não aparece em `getLiveItems` (teste da condição/filtro usado).
