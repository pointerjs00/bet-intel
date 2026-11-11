# BetIntel — Contexto, história e racional

Última atualização: 11/11/2026 · Cobre os 412 commits de 21/03/2026 a 11/11/2026 e o código do branch `melhorias`.

Este documento existe para que qualquer pessoa (ou agente) que mexa na app perceba **o que está feito, porquê, e o que já foi tentado e abandonado**, antes de propor ou alterar alguma coisa. Quando este documento e o código discordarem, o código ganha; corrige este ficheiro.

Documentos relacionados (mais detalhe sobre partes específicas):
- [AGENTS.md](AGENTS.md) — estado atual resumido no topo (secção 0) + especificação original (desatualizada em várias partes).
- [PLANO_MELHORIAS.md](PLANO_MELHORIAS.md) — plano de melhorias de novembro, com o estado de cada item (#1–#64, D1–D11).
- [ESTUDO_FONTES_DADOS.md](ESTUDO_FONTES_DADOS.md) — porque a ESPN e a LiveScore, e não a API-Football ou o SofaScore.
- [ESTUDO_ESTATISTICAS.md](ESTUDO_ESTATISTICAS.md) — que estatísticas de jogo o motor de liquidação usa.
- [DEPLOY.md](DEPLOY.md) — como fazer deploy da API (manual, imagem `ghcr.io/pointerjs00/...`).
- [LOCAL_SETUP.md](LOCAL_SETUP.md) — ambiente local.

---

## 1. Objetivo

O BetIntel é uma **app pessoal** (um só utilizador real) para:

1. **Registar apostas** feitas nas casas de apostas portuguesas (sobretudo Betclic), com o mínimo de esforço — o caminho principal é **partilhar um screenshot do boletim** e deixar a IA lê-lo.
2. **Acompanhar os jogos dessas apostas ao vivo**, com o estado de cada seleção ("a ganhar", "a perder"), e receber notificações.
3. **Ver as apostas resolvidas sozinhas** quando os jogos acabam (liquidação automática), com uma fila para rever o que não deu para decidir.
4. **Perceber o desempenho**: lucro, ROI, por desporto, mercado, casa, odds, hábitos.
5. Consultar jogos e equipas ao estilo Sofascore/Flashscore, **com as apostas do utilizador sempre em destaque**.

**Não é** uma app de odds nem um comparador de casas. Não faz apostas. Não tem utilizadores públicos.

### Consequências do "uso pessoal" (decisões que daqui decorrem)
- Correção dos dados e experiência de uso vêm **antes** de escala, quotas por utilizador e regras das lojas.
- Fontes e IA **gratuitas** são aceitáveis (tier grátis da Gemini, ESPN pública).
- A parte social (Amigos, perfis públicos, partilha) existe mas é **prioridade baixa**: está escondida das tabs e não deve receber funcionalidades novas (rankings, comentários…).
- Upgrade do Expo, paginação por cursor, etc. só quando fizer falta.
- A API continua exposta à internet, por isso a segurança básica mantém-se (auth, rate limit, rotas internas protegidas).

---

## 2. Arquitetura e operação

| Parte | Tecnologia | Notas |
|---|---|---|
| Mobile | Expo SDK 51 / React Native 0.74, Expo Router, TypeScript estrito, React Query (cache persistida), Zustand, Reanimated, Skia/victory-native | Pasta `apps/mobile`. Android é a plataforma usada. |
| API | Node 20, Express, Prisma/PostgreSQL, Redis + Bull, Socket.io | Pasta `apps/api`. |
| Partilhado | `packages/shared` | Tipos e enums (`Sport`, `BoletinStatus`, `ItemResult`). |
| IA (leitura de screenshots) | Gemini `gemini-3.5-flash-lite` via `@google/genai`, com schema JSON | `services/geminiVisionParser.ts`. |
| Dados desportivos | ESPN (futebol, NBA, ATP/WTA), LiveScore (pontos de ténis ao vivo) | `services/sportsData/`. |
| Erros | Sentry (só arranca com `EXPO_PUBLIC_SENTRY_DSN`) | |

### Deploy e builds
- **API:** a imagem é construída **localmente** e enviada para `ghcr.io/pointerjs00/bet-intel/betintel-api:latest`; no servidor faz-se `pull` + `docker compose up -d --force-recreate api`. Ver [DEPLOY.md](DEPLOY.md). Já houve deploys "falhados em silêncio" porque o `docker-compose.yml` do servidor apontava para outra imagem (`jbsousagit5`, `jbsousapsn`) — confirmar sempre com `docker inspect api-api-1 --format '{{.Config.Image}}'`.
- **Mobile:** APK de release gerado localmente (`./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`), não pela EAS. O plugin `withAbiFilters` reduz o APK de ~141 MB para ~62 MB. A minificação R8 está **desligada** porque partia o `expo-modules-core` (a app fechava ao abrir).
- **Git:** trabalho no branch `melhorias`, merge no `main` por PR.
- **Testes:** `npm test` na API (node:test). Testes de lógica pura do mobile correm com ts-node (ver AGENTS.md). Ficheiros de lógica pura no mobile (`utils/teamNames.ts`, `utils/tennisSets.ts`, `utils/betTimeline.ts`, `utils/dayBets.ts`) **não podem importar stores nem componentes**, senão os testes deixam de correr.
- **Base de dados:** a produção teve *drift* face às migrações; foi reconciliada em 10/11 (#24). Antes de gerar uma migração nova, confirmar que o histórico continua alinhado.

---

## 3. História — fases e o que mudou

### Fase 0 · Março: arranque como "comparador de odds" (21–25/03)
- Monorepo criado a partir da especificação do `AGENTS.md`: auth email+Google, scrapers de odds com Puppeteer, feed de odds, boletins, estatísticas, amigos.
- Dezenas de commits só para pôr EAS, Docker e CI a funcionar com pnpm workspaces.
- Scrapers da Betclic, Betano, etc. com proxies, live watchers e anti-deteção — **instáveis e frágeis**. Substituídos pela The Odds API e depois por polling de APIs (Kambi, Betano).
- **Resultado:** tudo isto foi **abandonado**. Ver §8.

### Fase 1 · Abril: virar para "registo de apostas" (04–29/04)
- Foco muda para registar e analisar as apostas do próprio utilizador.
- Fotos de tenistas, estatísticas com filtros de datas e casas, exportação XLSX/CSV.
- Perfil com avatar, perfis públicos, notificações, partilha de boletins (imagem), login biométrico, login obrigatório em cada arranque a frio.
- **Importação por screenshot:** começou com OCR + regras (muitos commits a corrigir artefactos de OCR da Betclic) → substituído por **IA de visão (Gemini)** a 20/04. Seguiram-se: pipeline de feedback para afinar, deteção do resultado por seleção, partilha de imagens do Android para a app, múltiplos screenshots de uma vez.
- Experiência com **modelo OpenAI afinado** (fine-tuning) — depois removido (#51).
- Muitas funcionalidades de análise: insights por seleção/boletim, "explicar boletim" com IA, celebração de vitória, otimizador de múltiplas, métricas personalizadas, cartão de estatísticas partilhável, forma recente, "Os Meus Jogos" (agenda), notificações de jogos.

### Fase 2 · Maio: dados de jogos com API-Football (01–08/05)
- Calendário de jogos (openfootball, CSVs), insights pré-aposta, classificações, onzes, eventos, xG, liquidação automática e resultados ao vivo **pela API-Football**.
- **Problema:** o plano grátis (100 pedidos/dia) não chega para acompanhar jogos ao vivo (1 440 pedidos/dia). Muito código de sincronização e normalização de nomes de equipas.
- Esta fase deixou muitas tabelas (`Fixture`, `TeamStat`, `MatchStat`, `FixtureStats`, `FixtureEvent`, `FixtureLineup`, `FixturePrediction`, `PlayerStat`, `Venue`, `Coach`…) e jobs que hoje estão **desligados** (ver §7).

### Fase 3 · 10/11: plano de melhorias e redesign (um dia de muitos commits)
Ver [PLANO_MELHORIAS.md](PLANO_MELHORIAS.md) para o detalhe item a item. Em resumo:
- **Liquidação reescrita** (#1): analisador de "pernas" de mercado em vez de regras soltas; estados `CANCELLED/ABANDONED/POSTPONED`; incertezas vão para revisão em vez de gravar resultado (#5).
- **Fonte de dados nova e grátis:** ESPN (+ LiveScore para pontos de ténis). API-Football retirada (#58).
- **Tracker ao vivo** (`liveBetTrackerJob`, cada minuto) com estado "a ganhar/a perder" e notificações de início, golo, intervalo e fim.
- **Fila "A rever"** (#36), **limites pessoais e alerta de perseguição de perdas** (#34), cashout (#15/#37).
- **Scan:** novo SDK Gemini com schema, benchmark de modelos (§5 do plano), validação aritmética das odds (#46), importação em massa transacional (#47).
- **Redesign completo:** nova navegação (Início · Boletins · + · Jogos · Análise), tokens v2 → **design v3** ("Neon Arena" escuro, "Clean Pro" claro), NativeWind removido, componentes base, Início em painel, detalhe do boletim em "talão", Jogos em ESPN, Perfil novo.
- NBA, seleções nacionais, emblemas e fotos de fontes fiáveis (`sportAssetsJob`); fotos do atptour.com removidas (bloqueadas para apps).
- Qualidade: 0 erros de `tsc`, sem `any` no mobile, testes de estatísticas e do motor.

### Fase 4 · 10–11/11: polimento orientado ao uso real (sessão com o utilizador)
- **Jogos estilo Sofascore:** qualquer dia desde 2020, calendário, deslizar entre dias, pesquisa com sugestões, histórico de equipa com as apostas do utilizador.
- **Pesquisa de equipas:** atribui cada aposta a uma equipa só (Sporting CP ≠ Sporting Gijón ≠ Sporting KC; Inglaterra ≠ New England Revolution).
- **Logótipos das casas** nos cartões de boletim (`SiteMark`).
- **Toasts modernos, feedback em todos os toques, performance** (cache persistida, imagens em cache, `freezeOnBlur`).
- **Análise refeita em tabs** (Resumo, Desportos, Apostas, Hábitos) com gráficos novos e painel "Últimas N apostas" ajustável.
- **Detalhe do boletim simplificado**; dados avançados passaram para "Análise do boletim" (`/boletins/analise`).
- **Jogos com tab "Apostas"** (todos os jogos com aposta, de qualquer desporto), tabs com ícone por cima, ligas colapsáveis e ordenáveis, cartões elevados.
- **Detalhes de jogo de NBA e ténis** com estatísticas ao vivo; detalhe de futebol com "porque ganhaste".
- **Correções de liquidação:** seleções sem hora de início ou com hora errada (procura pelo dia da aposta, corrige a hora quando difere ≥ 2 h), jogos NBA na data dos EUA, "A RESOLVER" em vez de "Por começar" em jogos terminados com aposta pendente, liquidação imediata a pedido.
- **Partilhar uma imagem para a app** abre logo a importação (depois do login).
- **Importação por screenshot redesenhada** (escolher → a ler → rever → feito) com folha de edição completa.
- **Nomes transliterados** de tenistas (Alexander/Aleksandr Shevchenko) passam a corresponder.
- **Resultado de ténis estilo Sofascore** (sets, jogos por set, pontos, quem serve); só sets terminados contam.

---

## 4. Conceitos de domínio

| Termo | Significado |
|---|---|
| **Boletim** (`Boletin`) | Uma aposta registada: stake, odd total, retorno possível, estado, casa (`siteSlug`), freebet, cashout, data da aposta (`betDate`, pode diferir de `createdAt`), notas, público. Múltipla = várias seleções. |
| **Seleção** (`BoletinItem`) | Uma "perna": equipas/jogadores, competição, desporto, mercado, seleção, odd, resultado, hora de início (`kickoffAt`), `needsReview`. |
| Estados do boletim | `PENDING`, `WON`, `LOST`, `VOID`, `PARTIAL` (algumas anuladas), `CASHOUT`. |
| Resultado da seleção | `PENDING`, `WON`, `LOST`, `VOID`. |
| **Liquidação** | Decidir o resultado de cada seleção a partir do jogo real e, daí, o do boletim. Regras de freebet/void/partial estão em `boletinService` (fonte única). |
| **A rever** | Seleções que a liquidação não decidiu com certeza (mercado desconhecido, equipa ambígua, jogo abandonado/adiado). Resolvem-se com um toque. |
| **Ligação seleção ↔ jogo** | Feita por nomes + competição + data (`itemMatch.ts`, cache Redis `itemmatch3:<id>`; falhas guardadas 30 min). Não há ID do fornecedor gravado na BD. |

---

## 5. Fluxos principais

### 5.1 Registar uma aposta
O botão **+** central abre **Novo boletim** (`/boletins/novo`) com 4 caminhos:

| Caminho | Ecrã | Quando usar |
|---|---|---|
| **Screenshot** (principal) | `/boletins/scan` | Partilhar ou escolher prints do boletim. A IA lê casa, seleções, odds, datas e estado. |
| Por jogo | `/boletins/por-jogo` | Escolher o jogo real (ESPN) e um mercado que o motor sabe liquidar. |
| Registo rápido | `/boletins/quick-log` | Registo mínimo. |
| Manual | `/boletins/create` | Formulário completo (fallback). |

**Importação por screenshot** (`scan.tsx`, redesenhada a 11/11):
1. **Escolher:** prints recentes da galeria (toque para marcar), escolher ficheiros ou tirar foto. Partilhar uma imagem a partir da Betclic → a app abre aqui e salta para a leitura (`hooks/useSharedImage.ts`, espera pelo login).
2. **A ler:** o próprio print com uma linha de leitura animada.
3. **Rever:** um cartão por boletim; campos duvidosos (`uncertain`) a laranja; possíveis duplicados assinalados e desmarcados; boletins com conta que não bate (odd/retorno) marcados para revisão.
4. **Folha de edição** (`components/import/EditLegSheet.tsx`): desporto, equipas/jogadores, competição, mercado, seleção, odd, data e hora do jogo, resultado; e do boletim: casa, valor, data e hora da aposta, estado. **Esta folha é para ser reutilizada** (ver plano de design: editar boletim).
5. **Feito:** resumo, "Ver boletim", "Importar outro".
- A IA também devolve `site` (casa) e `uncertain` por seleção — precisa da API atualizada.
- A importação em massa valida **cada boletim individualmente** (antes um erro rejeitava o lote inteiro com 422).
- O ecrã antigo `/boletins/import-review` **ainda é usado** pela importação do histórico em **PDF** (Definições). Não apagar sem migrar esse caminho.

### 5.2 Acompanhar ao vivo
- `liveBetTrackerJob` (Bull, a cada minuto, 3 leituras por execução) acompanha só jogos com seleções pendentes, calcula "a ganhar/a perder", envia notificações (início, golo com estado da aposta, intervalo, fim) e liquida.
- Também corrige horas de início (`backfillKickoffs`, no máximo a cada 5 min) e é chamado a pedido (`settleSoon`) quando a app vê um jogo terminado com aposta pendente.
- Na app: "A decorrer" no Início, tab **Apostas** em Jogos (cartões grandes que seguem o jogo ao vivo), detalhes de jogo.

### 5.3 Liquidação
- Motores: `marketResolutionEngine.ts` (futebol), `basketballMarketEngine.ts` (NBA, inclui props), `tennisMarketEngine.ts` (vencedor, sets, jogos; desistência/W.O. → revisão).
- Usa o resultado aos 90' (ESPN) e estatísticas do resumo do jogo (cantos, cartões, marcadores…).
- Se não tiver certeza → `needsReview`, aparece em **A rever** (`/boletins/rever`) e na **resolução em lote** (`/boletins/batch-resolve`).
- Ténis: **só sets terminados contam** (6+ jogos com 2 de vantagem, 7-5, 7-6). Um set em curso nunca é "ganho".
- Nomes: `teamNamesMatch` aceita aliases, nomes portugueses (países e clubes), prefixos (FC/SL) e primeiros nomes transliterados com o mesmo apelido.
- NBA: os jogos estão na **data dos EUA**; a procura cobre −2…+1 dias.

### 5.4 Analisar
- **Análise** (tab): período (Semana · Mês · Ano · Sempre), filtros (intervalo, casas, comparar), tabs **Resumo · Desportos · Apostas · Hábitos**. Estatísticas agregadas no servidor (`/stats/me`). Painel "Últimas N apostas" ajustável. Métricas personalizadas (`/custom-metric`) e explicações (`/metric-info`).
- **Análise do boletim** (`/boletins/analise`): probabilidades, histórico do utilizador, explicação IA, estatísticas por seleção, controlos manuais de resultado.
- **Limites e alertas** (`/limites`): perda semanal, valor por mês, perseguição de perdas; aviso no Início a partir de 80%. Guardado só no telemóvel.
- **Diário** (`/boletins/journal`): boletins com notas escritas pelo utilizador (as notas automáticas da importação não contam).

---

## 6. Ecrãs — o que mostram e porquê

### Tabs (barra flutuante: Início · Boletins · + · Jogos · Análise)
| Ecrã | Ficheiro | Mostra | Porquê |
|---|---|---|---|
| **Início** | `app/(tabs)/index.tsx` | Lucro do ano, ROI, 8 semanas, Apostado/Vitórias/Pendentes, aviso de limites, "A decorrer" (estado ao vivo), pendentes a resolver, recentes. Avatar → Perfil, sino → Notificações. | Painel com **um número principal**; o que interessa agora (jogos a decorrer) antes do histórico. ROI só conta boletins resolvidos (#7). |
| **Boletins** | `app/(tabs)/boletins.tsx` | Pesquisa e filtros numa linha, cartões compactos com logótipo da casa, estado com ícone+texto; deslizar para partilhar/apagar. Atalhos Agenda e Diário. | Tocar abre o detalhe; ações por gesto em vez de botões em cada cartão (D6). |
| **Jogos** | `app/(tabs)/fixtures.tsx` | Tabs **Apostas** · Futebol · Ténis · Basquetebol (ícone por cima). Tira de dias/calendário, ao vivo, pesquisa, ligas colapsáveis e ordenáveis (ordem guardada). Na tab Apostas: resumo + cartões grandes por jogo com aposta. | Sofascore/Flashscore com as **apostas do utilizador em destaque**. Atualiza a cada 30 s com jogos ao vivo. |
| **Análise** | `app/(tabs)/stats.tsx` | Ver §5.4. | Métricas simples e legíveis; separadas em tabs para não ser confuso. |
| Perfil | `app/(tabs)/profile.tsx` (tab escondida) | Identidade, métricas do mês com período explícito, lista: Editar perfil, Notificações, Amigos, Limites, Definições. | Aberto pelo avatar do Início (D4/D10). |
| Amigos | `app/(tabs)/friends.tsx` (tab escondida) | Feed, amigos, pedidos. | Prioridade baixa (uso pessoal); aberto pelo Perfil. |

### Boletins
| Ecrã | Ficheiro | Mostra / porquê |
|---|---|---|
| Detalhe | `boletins/[id].tsx` | Cartão "talão" com resultado em destaque (`BoletimResultHero`), seleções (`LegCard`) com resultado real e "Ver jogo"/"Ver porque ganhou", botão "Análise do boletim". Simples de propósito; o avançado está noutro ecrã. Tem ainda um modo de edição **antigo** com cores fixas (a substituir pela folha de edição). |
| Análise do boletim | `boletins/analise.tsx` | Dados avançados (ver §5.4). |
| Novo boletim | `boletins/novo.tsx` | Hub dos 4 caminhos. |
| Screenshot | `boletins/scan.tsx` | Ver §5.1. |
| Por jogo | `boletins/por-jogo.tsx` | Jogo real + mercados que o motor lê. |
| Registo rápido / Manual | `boletins/quick-log.tsx`, `boletins/create.tsx` | Registo sem screenshot. `create` também é usado para **duplicar** um boletim. |
| Rever importação (PDF) | `boletins/import-review.tsx` | Revisão da importação do histórico em PDF. Antigo; manter até migrar. |
| A rever | `boletins/rever.tsx` | Fila de seleções incertas. |
| Resolver em lote | `boletins/batch-resolve.tsx` | Resolver várias pendentes de uma vez. |
| Agenda | `boletins/agenda.tsx` | Próximos jogos com aposta (sobrepõe-se à tab Apostas de Jogos). |
| Diário | `boletins/journal.tsx` | Ver §5.4. |

### Jogos e equipas
| Ecrã | Ficheiro | Mostra / porquê |
|---|---|---|
| Jogo de futebol | `jogo/[id].tsx` | Resultado, eventos, estatísticas, **veredito da aposta** ("porque ganhaste", momentos, outros mercados). Serve para perceber o resultado da aposta. |
| Jogo NBA | `jogo/nba/[id].tsx` | Parciais, box score, totais por equipa, ao vivo. |
| Jogo de ténis | `jogo/tenis/[id].tsx` | Sets, pontos do jogo atual e quem serve (LiveScore), resumo. ESPN não dá ases/quebras. |
| Pesquisa de equipas | `equipa/pesquisa.tsx` | Sugestões ao escrever; vazio → pesquisas recentes e equipas mais apostadas. |
| Histórico de equipa | `equipa/index.tsx` | Jogos desde 2020 com as apostas do utilizador em cada um. |

### Outros
`settings.tsx` (tema, notificações, importação PDF/screenshot, biometria, Google, objetivos mensais, conta), `notifications.tsx`, `limites.tsx`, `perfil-editar.tsx`, `user/[username].tsx` (perfil público), `custom-metric.tsx`, `metric-info.tsx`, `onboarding.tsx`, e o grupo `(auth)` (login, registo, recuperar password, escolher username Google).

---

## 7. API — o que está ativo

**Rotas** (`apps/api/src/index.ts`): `/api/auth`, `/api/reference`, `/api/boletins` e `/api/betintel` (boletins), `/api/stats`, `/api/users`, `/api/friends`, `/api/notifications`, `/api/favourites`, `/api/fixtures`, `/api/fixture-alerts`, **`/api/sports`** (dados ESPN: dias de futebol/NBA/ténis, detalhe de jogo, equipas, saúde dos fornecedores), `/api/admin` e rotas internas (exigem `x-internal-key`).

Endpoints a conhecer:
- `GET /betintel/:id/results` — jogo real de cada seleção; grava a hora certa quando falta/está errada; chama `settleSoon()` se um jogo acabou.
- `GET /sports/tennis/day` — jogos de ténis com sets, pontos e servidor ao vivo.
- `GET /sports/tennis/match/:id`, `GET /sports/basketball/game/:id`.

**Jobs ativos:** `liveBetTrackerJob` (cada minuto), `sportAssetsJob` (arranque + diário: emblemas e fotos), rankings ATP/WTA (semanal), `initFootballDataScheduler`.
**Jobs desligados:** tudo o que é API-Football (`API_FOOTBALL_ENABLED` ≠ `true`): fixtures, estatísticas, eventos, onzes, previsões, jogadores, estádios, treinadores. As tabelas continuam na BD.

**Monitorização:** cada pedido à ESPN/LiveScore regista sucesso/falha; 10 falhas seguidas → notificação (máx. 6/6 h) e outra quando recupera (#61).

---

## 8. O que foi removido ou abandonado (e porquê) — não reintroduzir sem rever isto

| O quê | Porquê |
|---|---|
| **Scrapers de odds** (Betclic, Placard, Bet365, Betano…), feed de odds, `scrape:all`, The Odds API, polling Kambi | Frágeis (proteções anti-bot, proxies), sem utilidade para o objetivo real. **Não contornar proteções anti-bot.** Betclic e atptour.com estão fora de questão. |
| **API-Football** como fonte | Plano grátis não chega para ao vivo; substituída pela ESPN (#58). Só resta o código e tabelas antigas. |
| **SofaScore / FlashScore** como fonte | Só funcionam contornando proteção anti-bot. |
| **OCR com regras** para screenshots | Demasiados casos especiais; substituído pela Gemini. |
| **OpenAI afinado** (fine-tuning) | Não estava ativo; removido com scripts (#51). |
| **NativeWind/Tailwind** | Partia estilos com o `Pressable`; removido (#33). Estilos com `StyleSheet` + tokens. |
| Fotos do **atptour.com** | Bloqueadas para apps; removidas (auditoria de 1 783 URLs). |
| Swagger, scripts mortos | Limpeza (#33). |
| Bolha flutuante de notificações | Notificações têm ecrã próprio, pelo sino do Início. |
| Colunas antigas de visibilidade | Removidas na reconciliação da BD (#24). |
| `FadeInDown` nos itens da lista de boletins | Causava ecrã em branco ao re-renderizar (abril). |
| `removeClippedSubviews` / `windowSize=101` | Flicker / anulava a virtualização; afinado para `windowSize` 11 (#19). |
| Minificação R8 no APK | Apagava classes do `expo-modules-core` → app fechava ao abrir. |
| Tab Amigos e tab Perfil na barra | Uso pessoal; ficaram atrás do avatar (D4). |

---

## 9. Princípios de design e preferências do utilizador

Estas vêm de pedidos explícitos do utilizador ao longo do desenvolvimento. **Têm precedência sobre regras genéricas** (incluindo as das skills de design em `.claude/skills/`).

1. **Escuro por defeito** (design v3 "Neon Arena"); claro "Clean Pro" é secundário mas deve funcionar.
2. **Cartões elevados que sobressaem do fundo** (sombra via `useCardElevation`), sem contornos de 1 px nem faixas laterais. O utilizador pediu isto várias vezes — não converter listas de boletins/jogos em linhas planas.
3. **Animações e feedback em todas as ações**: toda a área tocável dá feedback (`Pressable` da app, `PressableScale`); animações modernas e fluidas. Evitar só a repetição pesada de entradas ao voltar a uma tab.
4. **Estilo Sofascore/Flashscore** para jogos (densidade, resultados à direita, sets em colunas no ténis), **com as apostas do utilizador em destaque**.
5. **Um número principal por ecrã**; verde só para dinheiro/positivo; estados com **ícone + texto** (nunca só cor); números tabulares (Space Grotesk) e texto em Inter.
6. **Sem emojis na UI** (a Agenda ainda os tem — a corrigir).
7. **Logótipos reais** (casas, emblemas, fotos de jogadores) em vez de texto, quando há fonte fiável.
8. **Ecrãs simples com o essencial; o avançado num ecrã à parte** (ex.: detalhe do boletim → Análise do boletim).
9. **Botões de filtro com a mesma altura do campo de pesquisa**; filtros em folhas inferiores bem estruturadas.
10. **Não inventar dados** nas mockups nem nos ecrãs (nomes de torneios, contagens, jogadores).
11. Mockups primeiro quando o pedido é de redesign; depois implementar.
12. Textos em **português de Portugal**; datas DD/MM, 24 h; euros `1 234,56 €`; odds decimais.

Componentes base a preferir: `AppText`, `ListCard`/`ListRow`, `StatusPill`, `SegmentedControl`, `SectionHeader`, `SiteMark`, `TeamBadge`, `HeroCard`, `Toast`, `Skeleton`, `EmptyState`. Tokens em `theme/tokens.ts`.

---

## 10. Armadilhas conhecidas

- **Deploy que não muda nada:** confirmar a imagem do contentor (ver §2). O `grep` dentro do contentor é em `dist/services/...` (o `WORKDIR` é `/app/apps/api`).
- **Cache de correspondências:** ao mudar a lógica de ligação seleção↔jogo, **mudar a versão da chave** (`itemmatch3:` → `itemmatch4:`), senão os "não encontrado" antigos ficam.
- **Horas:** `kickoffAt` é `TIMESTAMPTZ`; a IA às vezes erra a hora ou o dia. O tracker corrige quando o jogo real está ≥ 2 h ao lado e já não está agendado.
- **Nomes:** um nome contido noutro (Sporting / Sporting Gijón) é correspondência fraca; na pesquisa usa-se `teamMatchScore`/`resolveIndexedTeam` para escolher uma equipa só.
- **Ténis ESPN:** devolve o quadro inteiro do torneio em cada dia; filtrar pelo dia pedido. Não tem pontos ao vivo (vêm da LiveScore, cache 20 s).
- **Gemini:** tier grátis tem quota; o SDK tenta 3 vezes em 429/503. Com schema JSON a leitura é mais lenta mas mais fiável.
- **Testes do mobile:** lógica pura sem imports da app (ver §2).
- **Bash/heredocs no Windows:** em scripts de manutenção, preferir ficheiros Python/TS a heredocs com aspas.

---

## 11. Trabalho pendente e ideias em aberto

- **Plano de design** (11/11, artifact "BetIntel Design Review"): Sheet comum e fim das cores fixas; editar boletim com a folha da importação; hub de criação com 3 opções (Por jogo absorve Manual); A rever/lote com o jogo real; lista de boletins agrupada por dia; Agenda dentro de Jogos; Perfil/Definições/Amigos em listas agrupadas; importação PDF na revisão nova.
- Do [PLANO_MELHORIAS.md](PLANO_MELHORIAS.md): #26 (catálogo `sofascoreTournaments` no bundle), #31 (`any` na API), #45 (normalizar mercados de outras casas), #35 gestão de banca, #39 etiquetas/modelos, #41 widget, FotMob (xG) e API WTA (estatísticas por set), #32 upgrade do Expo (opcional).
- Decisões em aberto: manter ou simplificar a parte social; quando fazer o upgrade do Expo.
