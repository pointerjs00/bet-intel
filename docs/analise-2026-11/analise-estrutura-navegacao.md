# Auditoria: estrutura de código e navegação da app móvel (apps/mobile)

Âmbito: só leitura. Caminhos relativos a `apps/mobile`. Itens já feitos no `PLANO_MELHORIAS.md` (D3, D4, D9, D10, #19, #20, #25, #29 parcial pelo #58, #31) não são repetidos. Os números de linha são do estado atual do `main`.

## Top 10 (por prioridade e retorno)

| # | Achado | Tam. | Prior. |
|---|--------|------|--------|
| 1 | Notificações de jogo ao vivo abrem o separador Jogos com um parâmetro que ninguém lê (`openFixtureId`) | S | Alta |
| 2 | `stats.tsx`: cerca de 640 das 1167 linhas são código morto (`ByHourSection`, `FilteredBreakdownTable`, `MiniBoletinCard`, `SectionTitle`) | S | Alta |
| 3 | `boletins.tsx`: bolha de notificações, menu FAB e dropdown de estado nunca abrem (estados que nunca passam a `true`), cerca de 450 linhas mortas | S | Alta |
| 4 | Recuperação de palavra-passe quebrada: o email envia `betintel://reset-password`, mas não existe o ecrã | M | Alta |
| 5 | `import-review.tsx` (2440 linhas, um componente de 2290 linhas) só é alcançável pelo import de PDF em Definições; dividir ou retirar | L | Média |
| 6 | Sete componentes e a pasta de testes sem script: componentes mortos (`ParlayOptimiserCard`, `ProjectionCard`, `OddsCalculator`...) e ausência de `npm test` na app | S | Média |
| 7 | Refetch redundante: `useFocusEffect` refaz `useBoletins` em cada foco e o separador Jogos sonda `/boletins` com `setInterval`; 12 ecrãs usam a lista completa | M | Média |
| 8 | Registo de rotas incoerente: `fixtures` registado em `boletins/_layout.tsx` sem ficheiro; `por-jogo` e `analise` por registar; `/boletins/novo` como modal sobre um stack aninhado | S | Média |
| 9 | `settings.tsx` (832 linhas): 9 secções num só componente, `SectionHeader` local duplica `components/ui/SectionHeader` | M | Média |
| 10 | Pedidos HTTP fora da camada de serviços (`apiClient` em ecrãs de auth, `fixtures.tsx`, `TeamBadge`) e chaves de query com raízes sobrepostas | M | Baixa |

---

## 1. Mapa de rotas

Layout raiz: `app/_layout.tsx` (Stack sem cabeçalho por omissão, `:244-265`). Só 9 ecrãs estão declarados; o resto usa as opções por omissão. Barra de separadores flutuante própria em `app/(tabs)/_layout.tsx` (`VISIBLE_TABS`, `:80`), com o botão central "+" a empurrar `/boletins/novo` (`:93`). `friends` e `profile` são separadores ocultos (`href: null`, `:229-230`).

| Rota | Finalidade | Como se chega | Problemas |
|------|-----------|---------------|-----------|
| `(auth)/login` | Login email e Google | Redirect do AuthGate (`_layout.tsx:135`) | OK |
| `(auth)/register` | Registo | Link do login (`login.tsx:232`) | OK |
| `(auth)/forgot-password` | Pedir link | `login.tsx:188` | O link do email não tem destino (achado 4) |
| `(auth)/google-username` | Escolher username | `login.tsx:103`, `register.tsx:118` | OK |
| `reset-password` | **Não existe** | Email (`apps/api/src/utils/email.ts:46`) | Rota órfã no sentido inverso: deep link sem ecrã |
| `onboarding` | Introdução | AuthGate (`_layout.tsx:141`) | Fora do Stack declarado; sem ligação a partir de Definições para o rever |
| `(tabs)/index` | Início | Separador | OK |
| `(tabs)/boletins` | Lista | Separador | Ver achado 3; função exportada chama-se `HomeScreen` (`:222`) |
| `(tabs)/fixtures` | Jogos (ESPN) | Separador, notificações | Ignora `openFixtureId` (achado 1) |
| `(tabs)/stats` | Análise | Separador, `index.tsx:159`, `boletins.tsx:777` | Achado 2 |
| `(tabs)/friends` | Amigos | `profile.tsx:69` | OK, mas é "separador oculto" com barra visível por baixo |
| `(tabs)/profile` | Perfil | Avatar do Início (`index.tsx:152`) | OK |
| `boletins/[id]` | Detalhe | Muitos pontos (Início, lista, amigos, equipa, notificações) | OK; é o ecrã mais acedido |
| `boletins/novo` | Hub de criação | Botão "+" central, vazios | Modal dentro do stack `boletins` (`_layout.tsx:25`); ver achado 8 |
| `boletins/confirmar` | Criar/editar manual | `novo.tsx:44`, `por-jogo.tsx:210`, `[id].tsx:201` | Usa `useBoletinBuilderStore` global; `replace` para o detalhe no fim (`confirmar.tsx:103`) |
| `boletins/por-jogo` | Escolher jogo | `confirmar.tsx:137` | Não registado em `_layout.tsx` |
| `boletins/scan` | Importar screenshot | `novo.tsx:66`, `useSharedImage.ts:40` | Contexto passado por variável de módulo (`importService.ts:121`) |
| `boletins/import-review` | Rever importação em massa | **Só** `settings.tsx:321` (PDF Betclic) | Achado 5 |
| `boletins/batch-resolve` | Resolver pendentes | `index.tsx:240`, `boletins.tsx:787` | Duplica em parte `rever` (resolução rápida) |
| `boletins/rever` | Fila "A rever" | `index.tsx:227` | OK |
| `boletins/agenda` | Calendário | `boletins.tsx:757` | OK |
| `boletins/journal` | Diário | `boletins.tsx:767` | Apenas um ponto de entrada, escondido no cabeçalho |
| `boletins/analise` | Análise do boletim | `[id].tsx:276` | Não registado em `_layout.tsx` |
| `boletins/fixtures` | **Não existe** | Registado em `boletins/_layout.tsx:23` | Registo sem ficheiro (resto do picker antigo) |
| `jogo/[id]` | Detalhe futebol | `fixtures.tsx:198`, `[id].tsx:207`, `por-jogo.tsx:225` | Único `jogo/*` declarado no Stack raiz (`_layout.tsx:264`) |
| `jogo/nba/[id]`, `jogo/tenis/[id]` | Detalhe NBA/ténis | `fixtures.tsx:199-200`, `[id].tsx:208-209` | Sem declaração; sem ponto de entrada nas notificações |
| `equipa/index`, `equipa/pesquisa` | Histórico por equipa | `stats.tsx:969`, `fixtures.tsx:249` | OK; sem declaração |
| `notifications` | Centro de notificações | `index.tsx:146`, `profile.tsx:70` | Duplica a bolha morta do `boletins.tsx` |
| `settings`, `limites`, `perfil-editar` | Definições | `profile.tsx:76-78`; `limites` também `index.tsx:202` | OK |
| `custom-metric`, `metric-info` | Métricas personalizadas/ajuda | `stats.tsx:759,994,1000` | Fora do Stack declarado |
| `user/[username]` | Perfil público | `friends.tsx:144,175` | OK |

Outras observações de navegação:
- **Deep links**: esquema `betintel` em `app.json:9` e `app.config.js:59`. Só as notificações push navegam programaticamente (`_layout.tsx:314-338`). O `reset-password` não tem rota (achado 4).
- **Voltar**: o separador de Jogos, Análise e Boletins usam `router.push('/(tabs)/x')` a partir de outros separadores (`index.tsx:159,214,250`, `boletins.tsx:777`). Com `push`, cada toque acrescenta uma entrada na pilha; o botão voltar do Android regressa ao separador anterior em vez de sair. Preferir `router.navigate`.
- **Modais vs pushes**: só `novo` é modal (`boletins/_layout.tsx:25`); todos os fluxos que dele partem (`confirmar`, `scan`) são empurrados para o mesmo stack, por isso o "voltar" de `confirmar` regressa ao modal, o que é aceitável, mas `scan.tsx:249` e `confirmar.tsx:103` usam `replace` para o detalhe e deixam o modal por baixo de uma pilha incoerente.

---

## 2. Achados

### 1. `openFixtureId` não é lido (Alta, S)
- Evidência: `_layout.tsx:320` empurra `{ pathname: '/(tabs)/fixtures', params: { openFixtureId } }`; `app/(tabs)/fixtures.tsx` não usa `useLocalSearchParams` (grep sem resultados). Além disso o `fixtureId` é um id da API-Football, não o `providerMatchId` da ESPN usado em `jogo/[id]` (`fixtures.tsx:198`).
- Impacto: tocar numa notificação de golo/intervalo/fim abre só a lista de Jogos, sem ir ao jogo. É o fluxo mais frequente do tracker ao vivo (#57).
- Proposta: enviar da API `league` e `providerMatchId` nos dados da notificação e navegar para `/jogo/[id]` (ou `/jogo/nba/[id]`, `/jogo/tenis/[id]` conforme o desporto); fallback para o boletim se existir `boletinId`. Mover a lógica para `utils/notificationNavigation.ts` (já existe com teste: `utils/notificationNavigation.test.ts`) e usá-la no listener.

### 2. Código morto em `stats.tsx` (Alta, S)
- Evidência: `ByHourSection` (`:109`, ~470 linhas), `FilteredBreakdownTable` (`:582`), `SectionTitle` (`:1038`) e `MiniBoletinCard` (`:1042-1167`) só aparecem na própria definição (grep). O ecrã real vive em `StatsScreen` (`:617-1037`) e delega nas abas v3 (`:48`).
- Impacto: ~640 linhas (55%) que ninguém executa; parecem trabalho por fazer e atrasam o bundle e a leitura.
- Proposta: apagar. Depois dividir `StatsScreen` (~420 linhas): extrair `useStatsPeriod()` (período, datas, comparação, `:625-700`) para `hooks/useStatsPeriod.ts` e o menu de exportação (`:744`) para `components/stats/ExportSheet.tsx`. Ficheiro final abaixo de 350 linhas.

### 3. Estados que nunca abrem em `boletins.tsx` (Alta, S)
- Evidência: `setShowNotifBubble(true)` não existe (só `false`, `:1005,1039,1073,1079`); `setFabOpen(true)` não existe (só `false`, `:1098,1117`); `setShowStatusDropdown` nunca é chamado (`:233`); `setShowScrollTop` idem (`:288`). Logo o bloco `showNotifBubble` (`:1000-1090`), o menu FAB (`:1093-1130`), `SwipeableNotifRow` (`:93-210` e `swipeableRowStyles :211`) e as consultas `useNotifications(1, 8)` (`:274`) e `useMarkNotificationReadMutation` são inalcançáveis. A consulta de notificações ainda corre e gasta rede.
- Impacto: ~450 linhas mortas e um pedido a mais por visita; duplica `app/notifications.tsx`.
- Proposta: remover tudo isto. Renomear o componente para `BoletinsScreen`. Resultado esperado ~1000 linhas; depois partir: `useBoletinFilters()` (os `useState` e parâmetros `filter*` de `:233-290`, mais os `useMemo`), `BoletinListHeader` (`:757-800`) e os estilos para `boletins.styles.ts`.

### 4. Falta o ecrã de reposição de palavra-passe (Alta, M)
- Evidência: `apps/api/src/utils/email.ts:46` gera `betintel://reset-password?token=...`; `(auth)/_layout.tsx` só tem login, register, google-username e forgot-password; o AuthGate não deixa utilizadores não autenticados fora do grupo `(auth)` (`_layout.tsx:134-136`), por isso a rota teria de estar nesse grupo.
- Impacto: "Esqueci-me da palavra-passe" não conclui na app (apenas o fallback web).
- Proposta: `app/(auth)/reset-password.tsx` (token via `useLocalSearchParams`, schema Zod do `@betintel/shared`, `POST /auth/reset-password`, regresso ao login com toast) e registo em `(auth)/_layout.tsx`. Para uso pessoal pode baixar para Média se usas só Google.

### 5. `import-review.tsx` (Média, L; XL se for reescrito)
- Evidência: um só componente de `:148` a `:2158` (2010 linhas) mais estilos até `:2440`; 13 `useMemo`, 4 modais embutidos (`CompetitionPickerModal :1873`, equipa `:1893`, desporto `Modal :1982-2045`, data `Modal :2048-2152`). Só é aberto por `settings.tsx:321` (import de PDF Betclic). O fluxo moderno (screenshots) é `scan.tsx` (557 linhas), que ainda assim parte contexto via variável de módulo (`importService.ts:121-135`) e consome-o em dois sítios (`scan.tsx:183`, `import-review.tsx:827`).
- Impacto: ficheiro mais difícil de manter, com risco real de regressões ao dinheiro; um único ponto de entrada obscuro.
- Proposta, por fases: (a) decidir se o import por PDF ainda é usado; se não, apagar `import-review`, `useParseBetclicPdfMutation` e a linha de Definições (`settings.tsx:675-681`), ganho de ~2400 linhas; (b) se se mantiver, extrair os 4 modais para `components/import/` (já existe `EditLegSheet.tsx`), as funções de data (`:84-120`) para `utils/importDates.ts` com testes, e o estado de edições (`ItemEdits`, `buildEditKey`, `:122-140`) para um `useImportEdits()` com reducer. Um `DraftCard` partilhado com `scan.tsx:387` evita a duplicação.

### 6. Componentes mortos e ausência de teste na app (Média, S)
- Evidência (sem referências em `app/components/hooks/services/stores/utils`): `components/boletins/BoletinInsightsSection.tsx`, `BoletinItem.tsx`, `OddsCalculator.tsx`, `ParlayOptimiserCard.tsx`, `ProjectionCard.tsx`, `StakeInput.tsx`, `components/stats/RecentFormCard.tsx`; também `useRecentForm` em `statsService.ts:213` é consumido só por `stats.tsx` (verificar após o achado 2). `package.json` da app não tem script `test` (`:7-12`); os 6 testes em `utils/*.test.ts` só correm com o comando manual do `AGENTS.md`.
- Impacto: ruído e manutenção; os testes não correm em CI.
- Proposta: apagar os 7 componentes; adicionar `"test": "TS_NODE_COMPILER_OPTIONS=... node -r ts-node/register/transpile-only --test utils/*.test.ts"` (usar `cross-env` no Windows) e correr no workflow.

### 7. Refetch redundante e lista completa em 12 ecrãs (Média, M)
- Evidência: `boletins.tsx:331-335` faz `refetch()` em cada foco, apesar de `staleTime` 30 s (`_layout.tsx:57`) e do prefetch em `_layout.tsx:81-87`; `fixtures.tsx:139-150` repete `boletinsQuery.refetch()` por `setTimeout`/`setInterval` (30 s) e chama `apiClient.get('/betintel/${id}/results')` diretamente; `useBoletins()` (lista completa, com ~250 itens) é usado em 12 ficheiros (`index`, `boletins`, `stats:706`, `fixtures`, `batch-resolve`, `journal`, `scan`, `limites`, `jogo/[id]`, `ResultsRecap`, `MatchBetsStrip`, `ProvisionalLine`). Em `stats.tsx:706` a lista só serve limites de datas e contagens (`:707-739`); o #25 já trouxe as agregações para o servidor.
- Impacto: pedidos duplicados ao mudar de separador; recálculo de contagens em cada render.
- Proposta: (a) retirar o `useFocusEffect` ou usar `refetchOnMount`/`isStale`; (b) criar `useBetsByMatch()` (selector com `select` do React Query) para as vistas de Jogos em vez de cada uma refazer as suas filtragens; (c) mover o "tracker nudge" de `fixtures.tsx` para `useSettlePendingDone()` no `sportsService`; (d) em Análise, trocar `useBoletins` por um endpoint leve de limites (`/stats/me/date-bounds`) ou calcular no servidor.

### 8. Registo de rotas incoerente (Média, S)
- Evidência: `boletins/_layout.tsx:23` regista `fixtures` sem ficheiro (aviso do Expo Router em dev); `por-jogo` e `analise` não têm `Stack.Screen`; `jogo/nba/[id]`, `jogo/tenis/[id]`, `equipa/*`, `custom-metric`, `metric-info`, `onboarding` também não (`_layout.tsx:256-264`). Os cabeçalhos dependem das opções por omissão.
- Impacto: títulos e apresentação (modal, animação) dependem do default; fácil de partir ao renomear.
- Proposta: remover `fixtures` do layout; declarar todas as rotas no layout do respetivo grupo, com `custom-metric` e `metric-info` como `presentation: 'modal'` ou `formSheet`; acrescentar `jogo/_layout.tsx` com Stack para os três tipos.

### 9. `settings.tsx` (Média, M)
- Evidência: um único componente de `:88` a `:776` com ~22 `useState` (`:128-155`) e 9 cartões (Aparência `:353`, Objetivos `:385`, Conta `:452`, Google `:478`, notificações `:507`, Segurança `:552`, Preferências `:573`, Importar `:673`, Sobre `:691`); `SectionHeader` local (`:777`) duplica `components/ui/SectionHeader`.
- Proposta: `components/settings/` com `AppearanceCard`, `GoalsCard`, `AccountCard` (inclui palavra-passe `:140-142`, extrair para `useChangePasswordForm`), `GoogleCard`, `NotificationsCard`, `SecurityCard`, `ImportCard`. Cada cartão com o seu estado. O ecrã fica uma lista de cartões (<150 linhas). Em `mapThemeToApi/FromApi` (`:64-86`) mover para `stores/themeStore.ts`. Se o `import-review` sair (achado 5), `ImportCard` e o BottomSheet de `:732-765` desaparecem.

### 10. Camada de serviços e chaves de query (Baixa, M)
- Evidência: `apiClient` chamado em ecrãs (`login`, `register:64,97`, `google-username:64,83`, `forgot-password:42`, `fixtures.tsx:139`) e em `components/ui/TeamBadge.tsx:35` com `fetch` direto; `sportsService.ts:75` usa `['boletins', boletinId, 'results']`, que partilha a raiz `['boletins']` com `boletinQueryKeys.all`, por isso `invalidateQueries(boletinQueryKeys.all)` (`_layout.tsx:300`, `importService.ts:190`) também invalida isto; chaves literais espalhadas (`['notifications']`, `['stats']`, `['users','search']`, `['boletins','review'|'live']` em `boletinService.ts:121,131`, `rever.tsx:36`).
- Proposta: `services/authService.ts` com `useCheckUsername`, `useRegister`, `useForgotPassword`; `queryKeys.ts` único com `boletins`, `stats`, `sports`, `social`, `reference`; renomear a chave de resultados para `['sports','boletim-results',id]`. Hoje a `staleTime` por omissão (30 s) está bem escolhida; as exceções estão coerentes.

---

## 3. Outros pontos, em ordem de interesse

### Estrutura de pastas, hooks, stores
- `hooks/` só tem 5 ficheiros, enquanto a lógica de ecrã vive nos próprios ecrãs: a maioria dos efeitos de `fixtures.tsx` (`:125-155`) e `boletins.tsx` seria hooks (`useSettlePendingDone`, `useBoletinFilters`, `useBackHandlerForSheet`). Os `eslint-disable-next-line react-hooks/exhaustive-deps` (por exemplo `fixtures.tsx:126,142,152`, `_layout.tsx:90,294`) são sintoma disso.
- `stores/`: 8 stores com responsabilidades claras. `useAuthStore` tem 341 linhas e mistura biometria, refresh e utilizador (`:71,89,141,325`); dividir `session` de `biometric` quando houver razão. `sportAssetsStore.ts:91` e `offlineQueueStore.ts:62` chamam `apiClient` direto: aceitável, mas `sportAssetsStore` poderia ser uma query com `staleTime` longo e `select`, em vez de um store manual.
- Estado duplicado: dados do servidor em Zustand só no `sportAssetsStore`. Filtros de `boletins.tsx` passam por `useLocalSearchParams` vindos da Análise (`:258-268`, `stats.tsx:968`), o que é adequado, mas ficam também em `useState` locais (`:233-290`); sincronizar com `useEffect` está sujeito a estados antigos.
- Contexto do scan via variável de módulo (`importService.ts:121`): perde-se num reload; usar `useImportStore` ou parâmetros.

### Estados de erro/carregamento/vazio
- Bom: `ErrorBoundary` em `_layout.tsx:~335`, `EmptyState` e `Skeleton` usados na lista (`boletins.tsx:918-933`), banner de ligação, fila offline.
- Lacuna: ecrãs de detalhe (`jogo/*`) usam `refreshControl` mas não confirmo estado de erro com retry em todos; só `fixtures.tsx:284` e `boletins.tsx:920` mostram "Tentar novamente". Padronizar com um componente `QueryState` (loading/erro/vazio) em `components/ui/`.

### Desempenho
- `FlatList` em 13 locais, nenhum com `getItemLayout`; a lista de Boletins tem `windowSize`/batching (#19), mas pagina em cliente (`visibleCount`, `:244`) e recalcula 11 `useMemo` sobre toda a lista; aceitável para ~250 boletins.
- `CompetitionPickerModal` (1007 linhas) e `SearchableDropdown` (504) são `Modal` pesados e importados por `import-review`; carregá-los só quando abertos (`React.lazy` não é comum em RN; basta `visible && <Modal/>`).
- `freezeOnBlur: true` nos separadores (`(tabs)/_layout.tsx`) está certo; mas `ResultsRecap` está fora do `Tabs` e sempre montado (`:~185`); confirmar que só consulta quando há resultados novos.

### Tipos e testabilidade
- `strict: true` (`tsconfig.json:4`); só 32 ocorrências de `as any/: any/@ts-ignore` no código da app (já bem reduzido pelo #31). 82 ficheiros importam `@betintel/shared`, bom para tipos partilhados.
- Lógica pura já testada: `betConditions`, `betTimeline`, `bettingLimits`, `notificationNavigation`, `provisional`, `tennisSets`. Por testar e fácil de extrair: datas de importação (`import-review.tsx:84-120`), `dayHeading` (`boletins.tsx:71`), cálculo de `dataRanges` e filtros de `boletins.tsx`, `mapThemeToApi` (`settings.tsx:64-86`), `isDuplicate` (`scan.tsx:271`), cálculo de período anterior (`stats.tsx:654-700`).
- Estilos: 175 cores hex literais em `app` e `components`; muitas são legítimas (cores de marca, por exemplo `settings.tsx:478` `#4285F4`), mas vale uma passagem para os tokens de `theme/tokens.ts`.

---

## 4. Ordem de execução sugerida

1. Remover código morto (achados 2, 3, 6, 8 em `boletins/_layout.tsx`): meio dia, sem risco, corta ~1200 linhas.
2. Corrigir `openFixtureId` (1) e o ecrã `reset-password` (4).
3. Decidir o destino do `import-review` (5); só depois dividir `settings.tsx` (9).
4. Racionalizar fetching (7) e a camada de serviços (10), com um `queryKeys.ts` único.
5. Script `test` e testes das funções puras extraídas (6, secção 3).
