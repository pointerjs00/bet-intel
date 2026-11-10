# BetIntel — Plano de melhorias

Última atualização: 10/11/2026

**Contexto:** a app é só para uso pessoal. Por isso, a correção dos dados e a experiência de uso vêm antes da escala multiutilizador, das quotas por utilizador e das exigências das lojas. A API continua exposta na internet, e a segurança básica mantém-se.

**Complexidade (estimativa):** S = até meio dia · M = 1 a 2 dias · L = 3 a 5 dias · XL = mais de 1 semana

Documentos relacionados:
- [ESTUDO_FONTES_DADOS.md](ESTUDO_FONTES_DADOS.md): estudo das fontes gratuitas de dados de futebol e ténis, com os testes feitos.
- Mockups do redesign: canvas "BetIntel Redesign" (claude.ai/artifact/N8XPf7MAAFGoGt8sxuHWwi).

---

## Estado da implementação

Alterações de 10/11/2026: em commit no branch `melhorias`. Merge no `main` e deploy da API feitos a 10/11/2026 até às migrações do #24 (tracker ativo em produção). Os commits seguintes (D7, D10, D2/D3, #22, #23, #26, #31, #45, #59) esperam pelo próximo merge.

| Item | Estado | Notas |
|---|---|---|
| #1 | Feito | Motor reescrito como analisador de "pernas" (resultado, dupla hipótese, totais, ambas marcam, intervalo/final, resultado exato, empate anula). Reconhece 140 de 151 seleções reais; as restantes (marcadores, handicap, eliminatória) vão para revisão. 11 testes em `marketResolutionEngine.test.ts`. Auditoria em produção (10/11/2026): 0 itens tinham sido liquidados pelo motor antigo, nada a corrigir. |
| #2 | Feito | `/sync/fixtures/recent` exige login; o resto de `/sync/*` e o refresh de rankings exigem `x-internal-key`. |
| #3 | **Bloqueado** | A tabela `Fixture` não guarda o resultado aos 90'. Precisa de uma migração (sem base de dados local para a gerar) ou das novas fontes (fase 2). O motor já recusa liquidar jogos com prolongamento sem esse resultado. |
| #4 | Feito | Novos estados `CANCELLED`, `ABANDONED` e `POSTPONED`. Cancelado anula a seleção; abandonado e adiado vão para revisão. |
| #5 | Feito | Correspondências incertas já não gravam resultado, só marcam revisão. |
| #6 | Feito | A liquidação automática usa as regras do `boletinService` (freebet, VOID, PARTIAL, notificações). |
| #7 | Feito | O ROI da Home só conta boletins resolvidos. |
| #8 | Feito | Rotação atómica; a reutilização de um token trocado há mais de 30 s revoga todas as sessões (registo no Redis, sem migração). |
| #9 | Feito | Erros 500 devolvem "Erro interno do servidor". |
| #10 | Feito | Sem limiter duplicado nas rotas. O limite global mantém-se em 2000 / 15 min (para uso pessoal não vale a pena baixar). |
| #11, #12 | Feito | O socket volta às salas em cada reconexão; `boletim:result` atualiza boletins e estatísticas. |
| #13 | Feito | Golo anulado já não notifica; o "Fim do jogo" é enviado pelo tracker (#55) nos jogos com aposta. |
| #14 | Feito (falta build) | `expo-haptics` instalado; a vibração funciona na próxima build nativa (EAS). |
| #15, #37 | Feito | Campo "Cashout" na edição do boletim; a API grava e preserva o valor. |
| #16 | Parcial | Quem não é dono já não vê as outras partilhas. O arredondamento ficou: o import usa de propósito a odd total do talão. |
| #17, #52 | Feito | Ficheiros sensíveis fora do Git (continuam no disco) e `.gitignore` atualizado. |
| #20 | Feito | `staleTime` de 30 s e 2 tentativas por omissão. |
| #24 | Feito | `redis.keys` substituído por `SCAN`. Diferenças entre a base de dados e o schema acertadas (enum, precisão das datas, nomes de índices) e índice `Boletin(userId, createdAt)` criado, aplicado em produção a 10/11/2026. Colunas antigas `visibility` removidas numa segunda migração (todos os boletins estavam em PRIVATE; nenhum código as lia). |
| #46 | Feito | O scan marca para revisão boletins cujo produto das odds difere mais de 3% da odd total, ou cujo retorno não bate (1 em 88 boletins reais é um falso alarme: odd aumentada). |
| #47 | Feito | A importação em massa cria os boletins dentro da transação, com timeout de 120 s. |
| #51 | Feito | Caminho OpenAI e scripts de fine-tuning removidos; `openai` e `@google/generative-ai` desinstalados. A análise IA das estatísticas passou também para o SDK novo. |
| #28 | Feito | `npm test` na API (30 testes, incluindo 7 de estatísticas: lucro/ROI, anulados, freebets, cashout, casa/fora, favorito/underdog, repartição por odds e mercado, forma recente). |
| #19 | Feito | `windowSize` 11 e `updateCellsBatchingPeriod` 50 na lista de Boletins (FlashList não foi preciso). |
| #33 | Feito | NativeWind e Tailwind removidos (partiam os estilos em função do `Pressable`); scripts mortos e Swagger fora da API; `AGENTS.md` com uma secção "Current state" no topo. |
| #34 | Feito | Limites de perda semanal e de valor apostado por mês, e alerta de perseguição de perdas (pelo menos o dobro da stake habitual até 24 h depois de uma perda). Ecrã "Limites e alertas" no Perfil; aviso no Início a partir de 80%. Guardado só no telemóvel. 5 testes. |
| #38 | Feito | Já existia: casa/fora, favorito/underdog, variância e desvio padrão, evolução do ROI, calibração. A API calcula e a Análise mostra. |
| D11 | Feito | Modo claro validado no emulador: Início, Boletins, Análise e Limites. As cores e as sombras estão corretas. |
| #30 | Feito (falta DSN) | Ecrã de erro e Sentry configurados; o Sentry só arranca quando definires `EXPO_PUBLIC_SENTRY_DSN` (e precisa de build nativa). |
| #36 | Feito | Fila "A rever" (`/boletins/rever`, com aviso no Início): Ganhou / Perdeu / Anulada com um toque. No detalhe, a seleção também mostra "A rever". Precisa do deploy da API (`/boletins/review`). |
| #42, #43, #44 | Feito | Regra das linhas vermelhas corrigida; prompt corrigido; anulados importados devolvem a stake. |
| #48 | Feito | SDK `@google/genai` com schema JSON obrigatório e 3 tentativas em 429/503. Validado com 2 screenshots reais (iguais à correção). Nota: com o schema a leitura demora 6–7 s em vez de 1,3 s. |
| #49 | Feito | Ver "Resultado do benchmark" na secção 5. |
| #53 | Parcial | Modelo normalizado e adaptadores ESPN (futebol e ténis) e LiveScore (pontos do ténis ao vivo), testados com respostas reais gravadas. Faltam a FotMob (xG, momentum) e a API da WTA (estatísticas por set): são extras, não bloqueiam nada. |
| #54 | Feito | Cada seleção pendente é ligada ao jogo da ESPN por liga, data e nomes das equipas (inclui nomes portugueses); a ligação fica no Redis 7 dias, sem migração. |
| #55 | Feito | `liveBetTrackerJob`: corre a cada minuto, com 3 leituras (~20 s), só para jogos com seleções pendentes das 11 competições. |
| #56 | Feito | Estado "a ganhar/a perder" por seleção, calculado pelo motor com o resultado e os cantos ao vivo, mostrado em "A decorrer" no Início. |
| #57 | Feito | Notificações de início, golo (com o estado de cada aposta), intervalo e fim, com deduplicação e respeitando as preferências. O job antigo deixou de notificar quem tem aposta, para não haver duplicados. |
| #3 | Resolvido via #55 | Para as 11 competições cobertas, o tracker liquida com o resultado aos 90' da ESPN. O job antigo da API-Football continua sem esse dado. |
| #58 | Feito | Novo "Por jogo" (`/boletins/por-jogo`) sobre a ESPN, com os mercados que o motor de liquidação lê (13 combinações verificadas). Antevisão do jogo (forma, confrontos diretos, classificação) a partir do resumo da ESPN, em `/api/sports/football/preview` e no detalhe do jogo. Painéis da API-Football retirados do registo manual; picker antigo (4489 linhas) e componentes sem uso apagados (−9,7 mil linhas). Os jobs da API-Football ficam desligados, salvo `API_FOOTBALL_ENABLED=true`. Consequência: jogos fora das 11 competições da ESPN deixam de ser liquidados automaticamente (vão para "A rever" ou marcam-se à mão), e a sugestão de hora de início no registo manual deixa de ter jogos novos. |
| #18 | Feito (simples) | A lista de boletins deixou de carregar as partilhas e os utilizadores de cada partilha (nenhum ecrã de lista os usa). A paginação por cursor ficou de fora: o Início, o Diário e os filtros calculam sobre a lista completa, e com ~250 boletins não compensa. |
| #25 | Feito | A Análise já lê as estatísticas agregadas no servidor (`/stats/me`); a lista completa só serve o calendário e os limites de datas. |
| #61 | Feito | Cada pedido à ESPN e à LiveScore regista sucesso ou falha (uma resposta 200 com outro formato conta como falha). Ao fim de 10 falhas seguidas chega uma notificação (no máximo de 6 em 6 h) e outra quando a fonte recupera. `GET /api/sports/health` mostra o último estado. Os testes de contrato com respostas gravadas já existiam (ESPN, LiveScore, antevisão). |
| NBA e seleções | Feito | Seleções: Liga das Nações, Mundial (+ qualificação UEFA/CONMEBOL), Europeu (+ qualificação), Copa América e amigáveis, pela ESPN, com nomes em português; "Dinamarca", "Holanda", "Irlanda"… batem certo com os nomes ingleses da ESPN na liquidação. NBA: adaptador ESPN, motor de liquidação (vencedor com prolongamento, 1X2 do tempo regulamentar, handicap, totais, totais por equipa, par/ímpar; props de jogador vão para "A rever") e acompanhamento ao vivo no tracker. Jogos e "Por jogo" com seletor Futebol / Basquetebol / Ténis. |
| Emblemas e fotos | Feito | Auditoria dos 1783 endereços do mapa fixo (11/2026): 68 partidos, incluindo as 54 fotos do atptour.com (bloqueadas para apps). Removidos. Nova fonte principal, `sportAssetsJob` (arranque + diário): emblemas das listas de equipas da ESPN (~40 competições, seleções, NBA; 944 nomes) e fotos do top 150 ATP/WTA (ESPN, depois foto oficial da WTA, depois Wikipédia). Na app, o registo ganha à URL de cada linha e ao mapa fixo, e os nomes resolvem por palavras ("SL Benfica" → "Benfica"); nomes ambíguos ficam sem imagem em vez de uma errada. Fotos ATP fora do top 150 ESPN/Wikipédia continuam com iniciais. |
| Design v3 | Feito | Tema escuro "Neon Arena" e claro "Clean Pro" (mockups: claude.ai/artifact/NvtFHpEV6guk1g2gWdqJuM). Cartão principal com gradiente e brilho (`HeroCard`), sombras mais fortes, botão principal e "+" com gradiente, seletor com indicador deslizante, animação de entrada (`Appear`) e ponto "ao vivo" a pulsar. Emblemas e caras em todo o lado: logótipos e fotos dos tenistas recolhidos dos dados da ESPN (`/api/sports/assets`), bandeiras para seleções. Perfil reestruturado (identidade + mês num só cartão; atalhos em Social e Conta) e Análise com as conclusões logo abaixo do cartão principal. |
| #60 | Feito | `GET /api/sports/football/day` e `/match/:league/:id` (ESPN, cache Redis, marca de "tens aposta"). Ver D8. |
| — | Validado | Teste de ponta a ponta com a base de dados local e a ESPN real (jogos de 08/11/2026): 5 de 5 seleções liquidadas como esperado (resultado, cantos, ambas marcam, marcador para revisão, empate) e notificações certas. |
| #59 | Feito | Motor de mercados de ténis (vencedor, resultado em sets, vencedor de set, total de jogos e de sets; desistência e walkover vão para revisão) e adaptador ESPN ATP/WTA. O tracker acompanha e liquida as apostas de ténis (teste 4 de 4, Estocolmo, 09/11). Os pontos do jogo em curso e quem serve vêm da LiveScore (no máximo um pedido a cada 15 s, só com jogos ao vivo) e aparecem em "A decorrer", por exemplo "7-6 1-6 5-3 (40-40) · serve Geerts". 2 testes com uma resposta real gravada. |
| D2 | Parcial | Paleta v2, fontes e tokens `positive`, `negative` e `onPrimary` (§6.2). Os componentes base, Início, Boletins (cartão e seleções), Análise (topo), Perfil e Limites já usam os tokens. Restam cerca de 420 cores fixas, sobretudo nos cartões de partilha (imagem com paleta própria, de propósito), no ecrã antigo de jogos e nos insights da API-Football (saem com o #58). |
| D3 | Feito | `AppText`, `ListCard`/`ListRow`, `StatusPill`, `SegmentedControl`, `SectionHeader`/`MetricTile`, usados no Início, Boletins, Análise, Perfil, Limites, A rever e Novo boletim. O `StatusBadge` antigo foi substituído pelo `StatusPill` e apagado. |
| D4 | Feito | Barra Início · Boletins · + · Jogos · Análise. Perfil pelo avatar do Início; Amigos pelo Perfil (com selo de pedidos). As ligações das estatísticas abrem Boletins. |
| D5 | Feito | Início novo: lucro do ano, ROI, 8 semanas, métricas, "A decorrer" com estado ao vivo (precisa do deploy do endpoint `/boletins/live`), resolver pendentes e recentes. |
| D6 | Feito | Cabeçalho de Boletins simplificado; cartão sem faixa lateral nem fila de botões (tocar abre o detalhe; partilhar/apagar por deslize), estado com ícone e texto, título com o jogo. Detalhe em "talão" (estado, jogo, retorno em destaque, lucro e ROI, stake/odd/seleções; nome e stake editáveis no próprio bloco). Ações: Editar e Partilhar à vista; imagem, duplicar, público/privado e apagar no menu "…". |
| D7 | Feito | Título "Análise", período em controlo segmentado (Semana · Mês · Ano · Sempre) e um botão de filtros com contador (intervalo, casas, comparar) em vez de duas filas de botões. Cartão principal com o lucro do período, ROI, barras por período e 3 métricas (apostado, taxa de vitória, odd média). As secções detalhadas continuam por baixo. Abre em "Ano"; período vazio mostra "Sem apostas neste período". |
| D8 | Feito | Novo ecrã Jogos com dados ESPN (tira de dias, filtros Todos / Ao vivo / Com aposta, ligas agrupadas, atualização de 30 s ao vivo) e detalhe do jogo (resultado, intervalo, estádio, eventos de cada lado, estatísticas em barras). O ecrã antigo (API-Football) continua só no "Novo boletim → Por jogo". |
| D9 | Feito | Ecrã "Novo boletim" com os 4 modos, aberto pelo + central. |
| Redesign geral | Feito | Passagem por todos os ecrãs (10/11/2026). Componentes base sem contorno (`Card`, `Button`, `Chip`, `EmptyState`, `InfoButton`), rótulos sem maiúsculas, pílulas de escolha tingidas em vez de verde cheio. Boletins: uma linha de resumo, pesquisa e filtros numa só linha, cartão compacto (jogo, seleção, lucro, estado, casa e data). Detalhe: secção "Análise do boletim" simplificada e seleções sem faixa lateral. Amigos com `SegmentedControl`. Scan com introdução curta, casas em `Chip` e duas linhas Galeria/Câmara. Criar manual sem título gigante. Diário compacto, só com notas escritas por ti. Títulos "Agenda" e "Escolher jogo". Gráfico e cartões da Análise sem contornos. Corrigido "há 4 mês". |
| D10 | Feito | Perfil novo: identidade, métricas do mês com o período explícito e uma lista (Editar perfil, Notificações, Amigos, Limites e alertas, Definições). A edição de nome e bio passou para um ecrã próprio (`/perfil-editar`). |
| #22 | Feito | A liquidação parte das seleções pendentes (sai logo quando não há nenhuma) e emparelha os jogos em memória: 2 consultas por execução, em vez de 1 a 2 por jogo terminado. |
| #23 | Feito | A API aceita pedidos logo após a base de dados, o Redis e a seed; rankings, sincronização de jogos e agendamentos arrancam em segundo plano. No encerramento fecha os sockets e força a saída ao fim de 10 s. |
| #26 | Parcial | Config plugin `withAbiFilters`: a APK só leva a arquitetura pedida: 62 MB no telemóvel (arm64), em vez de 141 MB. O catálogo `sofascoreTournaments` continua no bundle. |
| #31 | Parcial | App sem `any` e com 0 erros de `tsc` (eram 20). Os tipos revelaram 2 bugs: o registo rápido nunca enviava a competição, por isso guardar falhava sempre; e o "histórico geral" no detalhe do boletim nunca aparecia. Na API restam cerca de 110 `any`, quase todos nos jobs da API-Football (agora desligados pelo #58, mas o código continua lá caso queiras religar). |
| #45 | Parcial | O motor passou a ler o atalho de bet builder "X vence & +1.5 Golos", que antes ia para revisão. Os nomes do Betclic, como "Resultado (Tempo Regulamentar)", já eram reconhecidos desde o #1. Falta normalizar os mercados de outras casas (depende do #50). |
| — | Corrigido | **APK de release fechava ao abrir:** a minificação R8 removia classes do `expo-modules-core`. Desligada no `gradle.properties` e no `app.config.js`. |
| #64 | Feito | **Bug novo:** a app terminava a sessão perante qualquer erro de rede durante o refresh; agora só o faz quando o servidor recusa o token. (Nota: as quedas de sessão no emulador eram outra coisa — sem login biométrico ativo, a app apaga os tokens em cada arranque a frio, de propósito, em `authStore.hydrate`.) |

---

## Ordem recomendada

| Fase | Objetivo | Itens |
|---|---|---|
| 1 | Corrigir dados e dinheiro | #1, #3–#7, #42–#44, testes do motor (#28), #2 e #17 (segurança rápida) |
| 2 | Dados desportivos gratuitos e notificações ao vivo | #62, #53–#61 (também resolve #11–#13 e #21) |
| 3 | Redesign | D2 → D3 → D4 → D5, D6, D9 → D7 → D8 → D10, D11 |
| 4 | Scan de screenshots com IA | #48, #49, #45, #46, #47, #50–#52 |
| 5 | Restante | Performance (#18–#27) conforme fizer falta, qualidade (#29–#33), features (#34–#41) |

A fase 2 vem antes do redesign porque o novo ecrã de Jogos (D8) e as notificações ao vivo dependem das novas fontes de dados.

---

## 1. Bugs e segurança

| # | Problema | Onde | Compl. |
|---|---|---|---|
| 1 | **A liquidação automática erra mercados que não são de golos.** Qualquer mercado com "mais de" é tratado como golos. Num jogo 2-1, "Cantos - Mais de 7.5" dá perdido e "Cantos - Mais de 1.5" dá ganho (testado). Cartões, combinados ("Ambas Marcam + Mais de 2.5") e "Primeira Parte" sofrem do mesmo. Inclui auditar os boletins já liquidados. | `apps/api/src/services/marketResolutionEngine.ts:51` | M |
| 2 | `/api/sync/*` e o refresh de rankings não têm autenticação; qualquer pessoa pode gastar quota e lançar o Puppeteer. | `footballDataRoutes.ts:31`, `referenceRoutes.ts:18` | S |
| 3 | Jogos com prolongamento parecem liquidar com o resultado final e não com o dos 90 minutos. A confirmar com dados reais. | `services/apifootball/fixturesSync.ts:43` | M |
| 4 | Jogos cancelados ou adiados nunca anulam a seleção, porque o job só lê `FINISHED`. | `jobs/autoSettlementJob.ts:22` | S |
| 5 | Correspondências incertas (confiança 0,8) gravam resultado na mesma. `needsReview` não aparece na app, e "Hipótese Dupla" (nome na seed) fica pendente sem aviso. | `autoSettlementJob.ts` | M |
| 6 | Freebet anulada devolve a stake na liquidação automática e 0 na manual; a lógica está duplicada. | `autoSettlementJob.ts:156`, `boletinService.ts:563` | S |
| 7 | O ROI da Home conta a stake dos pendentes, mas não o seu retorno, o que o puxa para baixo. | `apps/mobile/app/(tabs)/index.tsx:670` | S |
| 8 | A reutilização de refresh tokens é detetada, mas as sessões não são invalidadas; a rotação não é transacional. | `services/auth/tokenService.ts:79` | M |
| 9 | Erros 500 devolvem a mensagem interna ao cliente. | `apps/api/src/index.ts:123` | S |
| 10 | O rate limit conta a dobrar nas rotas com limiter próprio e está em 2000 (a spec diz 500). Quotas por utilizador ficam de fora: uso pessoal. | `index.ts:75`, rotas | S |
| 11 | Após uma falha de rede, o socket não volta à sala `live`. | `apps/mobile/services/socketService.ts:172` | S |
| 12 | A app não escuta `boletim:result`; a lista não atualiza quando um boletim é liquidado. | `socketService.ts` | S |
| 13 | Um golo anulado envia "Golo!". "Fim do jogo" pode nunca disparar, porque `live=all` não devolve jogos terminados. | `jobs/liveScoreJob.ts:79` | S |
| 14 | A vibração nunca funciona: `expo-haptics` não está instalado e o erro é silenciado. | `apps/mobile/utils/haptics.ts` | S |
| 15 | Cashout existe na UI e nas stats, mas a API nunca o grava, e qualquer edição limpa o valor. | `boletinService.ts:616` | M |
| 16 | Boletins públicos expõem com quem foram partilhados. Remover seleções acumula erro de arredondamento nas odds. | `boletinService.ts:819`, `:456` | S |
| 17 | `google-services.json` na raiz não está no `.gitignore`; `PT_17996111.pdf`, `api_logs.txt` e JPGs estão no Git (confirmar se têm dados pessoais). | raiz do repositório | S |

## 2. Performance

Com uso pessoal (~145 boletins), estes itens só entram quando a lentidão se notar. A exceção é o #20, que é barato e melhora a abertura da app.

| # | Melhoria | Compl. |
|---|---|---|
| 18 | A lista devolve todos os boletins com todas as relações e filtra no telemóvel. Passar a paginação por cursor, filtros no servidor e payload leve. | L |
| 19 | `windowSize={101}` anula a virtualização da lista; afinar ou migrar para FlashList e aligeirar o `BoletinCard`. | M |
| 20 | `QueryClient` sem defaults e refetch em cada foco: definir `staleTime` e persistir a cache. | S |
| 21 | `liveScoreJob` processa todos os jogos ao vivo do mundo. Substituído pelo #55. | — |
| 22 | A liquidação faz consultas por cada jogo terminado, a cada 5 minutos; partir dos itens pendentes. | M |
| 23 | A API só aceita pedidos depois da seed, dos rankings e do sync de jogos; o shutdown não fecha sockets nem filas. | M |
| 24 | Substituir `redis.keys` por chaves versionadas; índice `Boletin(userId, createdAt)`. | S |
| 25 | Stats calculadas em JS sobre todos os boletins, num ecrã de 1351 linhas: agregar no servidor e carregar secções a pedido. | L |
| 26 | Tirar catálogos do bundle (`sofascoreTournaments.ts`, 7611 linhas) e gerar APKs por ABI (o atual tem 136 MB). | M |
| 27 | Aplicar o que falta de `betintel-performance.md`. | M |

## 3. Qualidade e manutenção

| # | Melhoria | Compl. |
|---|---|---|
| 28 | Testes para liquidação, estado do boletim e stats. Hoje há só 2 ficheiros de teste e nenhum script para os correr. | M |
| 29 | Partir os ficheiros gigantes: `boletins/fixtures.tsx` (4489 linhas), `import-review` (2321), `create` (2046), Home (1560). Fazer commit das alterações pendentes em `fixtures.tsx` antes. | XL |
| 30 | ErrorBoundary e Sentry (não existem). | S |
| 31 | Eliminar os 127 usos de `any` (39 ficheiros), a começar pelos `prisma as any`. | M |
| 32 | Upgrade do Expo SDK 51 / RN 0.74. Opcional: a exigência da Play Store não se aplica a uso pessoal. | XL |
| 33 | Limpeza: NativeWind (0 usos), Swagger, `scrape:all` partido, `android/` e configs duplicados, `--no-frozen-lockfile` no Docker. Atualizar o `AGENTS.md`, que ainda descreve scrapers que já não existem. | S |

## 4. Features

| # | Feature | Compl. | Nota |
|---|---|---|---|
| 34 | Limites e alertas pessoais: perda semanal, perseguição de perdas | M | Junto com o #35 |
| 35 | Gestão de banca: saldo por casa, evolução, unidades, stake sugerida | L | |
| 36 | Fila "A rever": confirmar liquidações incertas, anular resolvidas durante um período | M | Depende do #5 |
| 37 | Registo de cashout completo | S | Fecha o #15 |
| 38 | Novas métricas: casa/fora, favorito/underdog, evolução do yield, variância | M | |
| 39 | Etiquetas e modelos de boletim recorrentes | M | |
| 40 | Ranking entre amigos, comentários e reações | L | Prioridade baixa |
| 41 | Widget Android/iOS com pendentes e resultados ao vivo | L | Depende da fase 2 |

## 5. Scan de screenshots com IA

**Decisão:** tier grátis da Gemini (uso pessoal), com `gemini-3.5-flash-lite` e raciocínio baixo, escolhido pelo benchmark (#49).

**Resultado do benchmark (10/11/2026)**, sobre os teus screenshots corrigidos (88 boletins, 185 seleções), com o prompt de produção:

| | 2.5-flash (anterior) | 3.5-flash-lite mínimo | **3.5-flash-lite baixo** | 3.8-flash baixo |
|---|---|---|---|---|
| Casos feitos | 18 (quota grátis esgotada) | 59 | 59 | 1 (quota e 503) |
| Boletins totalmente certos, nos mesmos 18 casos | 94% | 94% | **100%** | — |
| Resultado por seleção, nos mesmos 18 | 93% | 93% | **100%** | — |
| Seleção igual à correção, nos mesmos 18 | 79% | 76% | **90%** | — |
| Boletins totalmente certos, 59 casos | — | 89% | **90%** | — |
| Tempo médio | 2,4 s | 3,1 s | **1,8 s** | 23,6 s |

O 3.8-flash é demasiado lento e esgota a quota grátis. A correção do #42 subiu o resultado por seleção de 92% para 93% nas mesmas respostas do modelo C.

| # | Melhoria | Compl. |
|---|---|---|
| 42 | Numa múltipla perdida, as seleções não vermelhas passam a ganhas, mesmo pendentes ou anuladas. A comparação por texto parcial pode acertar na seleção errada. (`geminiVisionParser.ts:152`) | S |
| 43 | O prompt diz que há "exatamente UMA" linha vermelha, mas uma múltipla pode falhar em várias. (`geminiVisionParser.ts:78`) | S |
| 44 | A importação grava sempre `isFreebet: false` e dá retorno 0 a boletins anulados; cashout não é reconhecido. (`importController.ts:312`, `:409`) | M |
| 45 | Os mercados lidos do Betclic não batem certo com a liquidação ("Resultado (Tempo Regulamentar)" não é reconhecido). Extrair tipo de mercado, linha e seleção normalizados, e ligar equipa e jogo ao catálogo e às fontes de dados (#54). | L |
| 46 | Validar a aritmética (produto das odds face à odd total; stake × odd face ao retorno); se não bater, reanalisar ou pedir revisão. | M |
| 47 | A importação em massa diz ser "tudo ou nada", mas `createBoletin` escreve fora da transação, e o timeout predefinido da Prisma (5 s) pode deixá-la a meio. | M |
| 48 | Passar para `@google/genai` (o SDK atual está descontinuado), com schema JSON obrigatório e tentativas automáticas em 429/503. | M |
| 49 | Benchmark com os 58 screenshots corrigidos: modelo atual, 3.5 Flash-Lite e 3.8 Flash, com e sem raciocínio, JPEG e PNG. **Pendente:** autorização para os enviar à Gemini. | M |
| 50 | Adaptar o prompt a cada casa de apostas (hoje é só Betclic, mas a importação aceita 12). | M |
| 51 | Remover o caminho OpenAI e o fine-tuning, que não estão ativos. | S |
| 52 | Imagens guardadas em base64 na base de dados: definir prazo de retenção e adicionar `apps/api/training-data/` ao `.gitignore`. | S |

---

## 6. Redesign — decisões tomadas

**Direção escolhida:** a base é o "Painel escuro" (A), com as sombras nos cartões e o aspeto minimalista do "Claro editorial" (B). Os mockups estão no canvas "BetIntel Redesign".

### 6.1 Princípios

1. **Escuro por defeito**, com a hierarquia do painel A: um número principal por ecrã, verde só para dinheiro e estados positivos.
2. **Elevação em vez de contornos** (vem de B): os cartões não têm borda de 1 px, separam-se do fundo por sombra suave e por um tom de superfície ligeiramente mais claro. As bordas ficam só para campos de texto e foco.
3. **Minimalismo** (vem de B): um cartão por secção, com linhas separadas por divisórias finas, em vez de um cartão por item. Muito espaço em branco. Um único acento de cor por cartão.
4. **Uma ação principal por ecrã.** As ações secundárias passam para um menu "…" ou uma folha inferior.
5. **Estados com ícone e texto** (✓ Ganhou, ✕ Perdeu, ⏱ Pendente, ⊘ Anulado). Ganho e perdido nunca dependem só do verde e do vermelho.
6. **Sem emojis na UI**, sem gradientes fortes e sem faixas de cor na lateral dos cartões.
7. **Números tabulares** em todas as quantias, odds e percentagens.

### 6.2 Tokens (substituem `apps/mobile/theme/tokens.ts`)

**Tema escuro (por defeito)**

| Token | Valor | Uso |
|---|---|---|
| `background` | `#0B0D0C` | Fundo do ecrã |
| `surface` | `#151817` | Cartões |
| `surfaceRaised` | `#1D211F` | Mosaicos e campos dentro de cartões |
| `separator` | `#262B28` | Divisórias finas e borda de campos |
| `textPrimary` | `#F2F5F3` | Texto principal |
| `textSecondary` | `#A3ABA6` | Texto de apoio |
| `textMuted` | `#8E9791` | Rótulos; ~6:1 sobre `surface` (o atual `#505050` tem ~2,2:1) |
| `primary` | `#2FD27A` | Ação principal, botão "+" |
| `positive` | `#5BE39A` | Lucro e estados ganhos (texto) |
| `negative` | `#FF6B5E` (texto `#FF8A7F`) | Perdas |
| `pending` | `#F5B13D` | Pendentes |
| `live` | `#FF6B5E` | Indicador ao vivo |
| `info` | `#6EA8FF` | Informação |

**Tema claro (secundário, paleta B)**

`background #F4F3EF` · `surface #FFFFFF` · `textPrimary #17181A` · `textSecondary #5B5F66` · `textMuted #6B7078` · `primary #0E6B42` · `negative #B23A27` · `pending #7A4A00`

**Elevação**
- Claro: `0 1px 2px rgba(23,24,26,.06)` + `0 8px 24px rgba(23,24,26,.05)`.
- Escuro iOS: `shadowColor #000`, `opacity .35`, `radius 18`, `offset (0, 8)`. Como a sombra se nota pouco em fundo escuro, a separação vem sobretudo do tom de `surface`.
- Android: `elevation 6`.

**Forma e espaço:** raio 20 nos cartões, 12–14 em mosaicos e campos, 14–16 em botões e total em pills; espaçamento 4/8/12/16/20/24/32; margem lateral do ecrã 20.

**Tipografia:** Inter (400/500/600/700) para a interface e Space Grotesk (600/700, tabular) para números. Escala 12/13/15/17/20/24/32/40.

### 6.3 Navegação

- **Barra inferior:** Início · Boletins · **+** (botão central, abre "Novo boletim") · Jogos · Análise.
- **Perfil** abre pelo avatar no topo do Início. **Notificações** abrem pelo sino no topo do Início, num ecrã próprio (acaba a bolha flutuante).
- **Amigos** passa para dentro do Perfil (prioridade baixa em uso pessoal).
- **Agenda** e **Diário** ficam dentro de Boletins, como filtros ou separadores.

### 6.4 Problemas vistos nos screenshots da app atual

| Ecrã | Problema | Correção no redesign |
|---|---|---|
| Início | 4 botões no topo, mais resumo, aviso, pesquisa, estado e filtros antes do primeiro boletim | Painel com lucro, jogos a decorrer e recentes; a pesquisa e os filtros vão para Boletins |
| Início | Cada cartão tem ações (partilhar, imagem, apagar, fechar) e "Ver detalhes" expande em vez de abrir | Cartão compacto que abre o detalhe; ações no detalhe e por gesto |
| Detalhe | 6 botões em 2 linhas, 6 mosaicos com ícone "i" e uma faixa verde pesada | Layout de "talão": retorno em destaque, 3 métricas, seleções e um menu "…" |
| Estatísticas | Em "Este Mês" sem apostas diz "Cria o teu primeiro boletim", mesmo havendo boletins | Mensagem "Sem apostas neste período" com atalho para "Ano" ou "Sempre"; lembrar o último período usado |
| Estatísticas | Duas linhas de pills (período, casas, comparar) | Controlo segmentado para o período e um botão de filtros |
| Perfil | "ROI MÊS 0,00 €" sem dizer o período; formulário de edição no ecrã principal | Métricas com período explícito; edição num ecrã próprio |
| Jogos | Dia vazio sem atalho | Saltar para o próximo dia com jogos; filtros "Ao vivo" e "Com aposta" |
| Geral | Fonte do sistema, cores fixas (268 no código) e contraste baixo nos rótulos | Tokens v2 e tipografia nova |

### 6.5 Tarefas

| # | Tarefa | Compl. |
|---|---|---|
| D1 | Capturas da app atual. **Feito:** 16 ecrãs. Faltam o detalhe de um jogo, os separadores Amigos e Pedidos e o modo claro. | S |
| D2 | Tokens v2 (6.2) e fim das cores fixas; NativeWind sai (#33). | L |
| D3 | Componentes: `Card` (elevado, sem borda), `ListCard` (linhas com divisórias), `MetricTile`, `StatusPill`, `TicketCard`, `MatchRow`, `SegmentedControl`, `BottomBar` com botão central, `Sheet`, `EmptyState`, `Skeleton`. | L |
| D4 | Nova navegação (6.3). | L |
| D5 | Início em painel: lucro do ano com gráfico, 3 métricas, "A decorrer" com o estado da aposta e "Recentes". | L |
| D6 | Boletins: lista com pesquisa e filtros, cartão compacto e detalhe em "talão". | L |
| D7 | Análise: período segmentado, lucro acumulado com gráfico, taxa de vitória, odd média e ROI por mercado, desporto, casa e odds. | L |
| D8 | Jogos: tira de dias, filtros, ligas agrupadas e detalhe do jogo (estatísticas, eventos, onzes, H2H, forma, classificação). Depende da fase 2. | L |
| D9 | Novo boletim único, com os modos Por jogo · Screenshot · Rápido · Manual, stake com atalhos e resumo fixo em baixo. | L |
| D10 | Perfil, Amigos, Definições e Notificações; animações, estados vazios e skeletons. | M |
| D11 | Modo claro com a paleta B. | M |

---

## 7. Dados desportivos gratuitos e notificações ao vivo

O estudo completo, com os testes, está em [ESTUDO_FONTES_DADOS.md](ESTUDO_FONTES_DADOS.md). Resumo da decisão:

- **Futebol:** ESPN como fonte principal (calendário, ao vivo, eventos, estatísticas, onzes, classificação), FotMob para enriquecer (xG, momentum, H2H, forma) e LiveScore como reserva ao vivo.
- **Ténis:** ESPN para o calendário e os sets; LiveScore e, no WTA, a API oficial da WTA para os pontos ao vivo (no teste nenhuma foi perfeita sozinha); a API da WTA também para as estatísticas WTA.
- **API-Football:** deixa de ser usada. O job ao vivo (1 pedido por minuto, 1440 por dia) não cabe no plano grátis de 100 pedidos por dia.
- **Sites oficiais das ligas:** não compensam como fonte principal. O da Liga Portugal fica como extra opcional.

| # | Tarefa | Compl. |
|---|---|---|
| 53 | Camada de fornecedores: interface `SportsDataProvider`, modelo normalizado (competição, jogo, participantes, estado ao vivo, incidências, estatísticas, onzes) e adaptadores ESPN, FotMob, LiveScore e WTA. | L |
| 54 | Ligação boletim ↔ jogo: guardar o ID de cada fornecedor em `BoletinItem` (diretamente no fluxo "Por jogo"; por correspondência de nomes no scan e no manual, reaproveitando `nameNormalisation.ts`). | M |
| 55 | Job ao vivo: acompanhar só os jogos com apostas pendentes ou favoritos, de 20 em 20 s ao vivo e de 5 em 5 min antes do jogo, com backoff e troca automática de fornecedor quando um falha. | M |
| 56 | Avaliação ao vivo das apostas ("a ganhar", "a perder", "decidida") com o novo motor de mercados (#1), usando golos, cantos e cartões ao vivo. | L |
| 57 | Notificações: início do jogo, golo com o estado da aposta, aposta passou a ganhar ou perder, intervalo, fim e liquidação. Com deduplicação e preferências. | M |
| 58 | Retirar os jobs da API-Football (live, recent-fixtures, insights) e migrar classificações, onzes, eventos e estatísticas para os novos fornecedores. | M |
| 59 | Ténis: calendário ATP/WTA (250, 500, Masters/1000, Grand Slams), pontos ao vivo e avaliação de mercados (vencedor, sets, jogos). | L |
| 60 | Ecrã Jogos e detalhe do jogo com os novos dados (ver D8). | L |
| 61 | Monitorização: registo de erros por fornecedor, alerta quando um falha ou muda de formato, e testes de contrato com respostas gravadas. | M |
| 62 | ~~Correr o script de teste no servidor Hetzner.~~ **Feito a 10/11/2026:** as 10 fontes responderam 200 a partir do servidor, em menos de 0,3 s. | S |
| 63 | (Opcional) Adaptador da Liga Portugal, a partir da tua outra app, para detalhe oficial dos jogos portugueses. | M |

---

## Decisões pendentes

1. Retirar ficheiros sensíveis do Git (#17): `git rm --cached api_logs.txt PT_17996111.pdf` e os JPGs da raiz.
3. SofaScore e FlashScore: só funcionam contornando a proteção anti-bot, o que não testei. Não são necessários para cobrir o que pediste (ver o estudo).
4. Quando fazer o upgrade do Expo (#32): antes ou depois do redesign.
5. Manter ou simplificar a parte social.
