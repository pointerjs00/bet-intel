# BetIntel — Análise de produto: o que existe e o que vale a pena fazer

15/11/2026 · Revisão só de leitura do código (`main`), do CONTEXTO_BETINTEL.md, do PLANO_MELHORIAS.md e dos estudos. O ponto de partida é um único apostador sério (Betclic: futebol, ténis, NBA), com dados grátis (ESPN, LiveScore, WTA) e Gemini, e **sem scrapers de odds**.

Escalas usadas: esforço S (até meio dia), M (1–2 dias), L (3–5 dias), XL (mais de 1 semana). Valor Alta, Média ou Baixa.

---

## Top 8 por valor/esforço

| # | Feature | Esforço | Valor | Porquê primeiro |
|---|---|---|---|---|
| 1 | **Edge por mercado** (ROI e calibração por tipo de mercado e gama de odds, com aviso de amostra pequena) | S–M | Alta | Os dados já existem (`buildCalibration`, `buildBySportMarket`). Falta juntá-los e dizer "aqui ganhas, aqui perdes". |
| 2 | **Revisão semanal por IA, enviada por push** | S | Alta | O `aiReviewService.ts` já existe e tem cache de 24 h. Falta um job de domingo e o contexto "esta semana face ao histórico". |
| 3 | **Aviso de perseguição de perdas no momento de registar** (limites guardados no servidor) | S–M | Alta | Hoje os limites só existem no telemóvel (`limitsStore`). O alerta tem de chegar quando a aposta é registada, no Confirmar ou no scan. |
| 4 | **Banca e unidades** (#35): saldo por casa, depósitos e levantamentos, stake em unidades | M | Alta | É a base de toda a gestão de risco e, depois disso, o ROI passa a ter um denominador real. |
| 5 | **Etiquetas e confiança por aposta** (#39 mais um campo 1–5) | M | Alta | Permite responder a "as apostas em que confio mais rendem mais?", e é com isto que a análise passa a dizer algo sobre o processo e não só sobre o resultado. |
| 6 | **Cobertura de liquidação na app** (`/boletins/market-coverage`) | S | Média | O endpoint já existe e nenhum ecrã o usa. Mostra o que nunca vai liquidar sozinho e ajuda a escolher mercados. |
| 7 | **"Apostas que evito"**: lista de padrões perdedores gerada pelos dados, mostrada no Confirmar | M | Alta | Junta o #1 ao momento em que a decisão é tomada, e é aí que o valor se multiplica. |
| 8 | **Widget Android com pendentes e ao vivo** (#41) | L | Média | Os dados já estão prontos (`/boletins/live`). É o ecrã que mais se abre, e o widget evita abrir a app. |

Antes de qualquer feature nova convém fazer uma limpeza (secção 1.3). Não traz valor visível, mas tira peso morto.

---

## 1. Avaliação do que existe

### 1.1 O núcleo está sólido. Não mexer, só alimentar
- **Registo por screenshot** (`scan.tsx`, `geminiVisionParser.ts`): 90% dos boletins ficam totalmente certos e cada um demora 1,8 s. É o melhor ativo da app.
- **Liquidação e tracker** (`marketResolutionEngine.ts`, `basketballMarketEngine.ts`, `tennisMarketEngine.ts`, `liveBetTrackerJob.ts`): 97% das seleções reais liquidam sozinhas. A fila "A rever" fecha o resto.
- **Jogos estilo Sofascore** com as apostas em destaque (`fixtures.tsx`, `jogo/*`).

### 1.2 Meio feito ou subaproveitado: pequenas mudanças multiplicam o valor

| O quê | Estado | Mudança pequena com grande retorno |
|---|---|---|
| **Revisão IA** (`services/stats/aiReviewService.ts`, `AIReviewCard.tsx`) | Fica escondida na tab Análise e só corre quando o utilizador a abre. O prompt recebe os agregados de sempre e não compara períodos. | Passar a semanal e a push (ver ideia 2), com a semana comparada com o histórico e 3 ações concretas. |
| **Calibração e insights** (`buildCalibration`, `buildInsights` em `statsService.ts`, `CalibrationChart.tsx`) | Existem, mas só há 8 insights fixos ("Acumuladas a prejudicar-te", "pior dia"…). A calibração não é cortada por mercado. | Cruzar a calibração com o mercado e o desporto e mostrar o resultado como ranking de edge (ideia 1). |
| **Limites e alertas** (`limites.tsx`, `utils/bettingLimits.ts`, `stores/limitsStore.ts`) | Ficam só no telemóvel. A perseguição de perdas é calculada depois do facto (`chaseCount`). | Guardar no servidor e avaliar no `createBoletin` e no fim do scan. Aviso e push no momento (ideia 3). |
| **Objetivos** (`GoalProgressCard.tsx`, `GoalType` em `packages/shared`) | O cartão aparece no fundo da tab Hábitos, sem notificações. | Push quando um objetivo é atingido ou corre risco, e mostrar o objetivo no Início. |
| **Diário** (`boletins/journal.tsx`, 111 linhas) | É só uma lista de notas escritas à mão. Não há campos estruturados. | Acrescentar confiança, motivo e etiquetas (ideia 5). Passa a alimentar a análise em vez de ser texto morto. |
| **Cobertura de mercados** (`services/marketCoverage.ts`, `GET /boletins/market-coverage`) | Está feita e não aparece em nenhum ecrã (o ESTUDO_ESTATISTICAS §6.4 já o sugeria). | Uma linha nas Definições ou na Análise: "Mercados que liquidam sozinhos: 97%", e a lista dos restantes. |
| **Exportação** (`GET /boletins/export`, só CSV) | Funciona. | Juntar colunas de unidades, etiquetas e confiança quando existirem, e oferecer uma exportação automática mensal (ideia 13). |
| **Análise do boletim** (`boletins/analise.tsx`) | Já compara a probabilidade implícita com a taxa de acerto do utilizador nesse tipo de aposta (linhas 63–95). É a ideia de "edge" num só boletim. | Mostrar a mesma comparação **antes** de registar, no Confirmar (ideia 7). |
| **Agenda** (`boletins/agenda.tsx`, 487 linhas) | Sobrepõe-se à tab Apostas de Jogos e ainda tem emojis (CONTEXTO §9.6). | Fundir com a tab Apostas, como já diz o plano de design, e apagar. |
| **Métricas personalizadas** (`custom-metric.tsx`, 664 linhas, `customMetricsStore`) | São poderosas, mas é provável que ninguém as use: estão escondidas no fim de Análise. | Verificar se há métricas guardadas. Se não houver, cortar. As ideias 1 e 5 cobrem a necessidade real. |

### 1.3 Não vale a pena manter (ou está morto)

| O quê | Recomendação |
|---|---|
| **Parte social** (`(tabs)/friends.tsx`, `services/social/`, `user/[username].tsx`, modelos `Friendship`, `FriendRequest`, `SharedBoletin`, `isPublic`) | **Decisão sugerida: congelar e esconder.** Tirar "Amigos" do Perfil e "público/privado" do menu do boletim. Manter a **partilha como imagem** (`StatsShareCard`, cartões de partilha), que funciona sem amigos. Num utilizador único, o feed e os pedidos não têm uso: só 5 commits desde outubro, todos de manutenção. Apagar as tabelas fica para depois, junto com uma migração. |
| **API-Football** (cerca de 13 jobs em `apps/api/src/jobs/*Sync*`, `apifootball/`, `fixtureInsightService.ts`, tabelas `Fixture`, `TeamStat`, `MatchStat`, `FixturePrediction`…) | Estão desligados desde o #58 e concentram quase todos os ~110 `any` que restam na API. Apagar o código e, numa migração, as tabelas. |
| **Fixture alerts** (`routes/fixtureAlertRoutes.ts`, modelo `FixtureWatch`) | Nenhum ecrã do mobile os chama. Apagar, ou reaproveitar para a ideia 10 com IDs ESPN. |
| **`autoSettlementJob.ts` e `liveScoreJob.ts`** | Foram substituídos pelo `liveBetTrackerJob`. Confirmar que não estão agendados e apagar. |
| **Importação pela API da Betclic** (`betclicApiService.ts`, `/import/betclic-api`) | Usa o token de sessão da Betclic contra um endpoint privado. Isto choca com a política "sem contornar a Betclic" e é frágil. Avaliar a remoção. O PDF e o screenshot já cobrem o histórico. |
| **`import-review.tsx` (2 440 linhas)** | Só serve a importação por PDF. Migrar o PDF para a revisão nova do scan (o `EditLegSheet` serve) e apagar. |

---

## 2. Ideias novas (18)

Nenhuma destas ideias precisa de scraping de odds. A única fonte externa nova que algumas pedem é o próprio utilizador: a odd que ele vê ou fotografa.

### A. Saber onde há edge

**1. Edge por mercado ("Onde ganhas")**: S–M · **Alta**
- *O quê:* uma tabela ordenada com ROI, número de apostas, odd média e "acerto real face ao implícito" (calibração) para cada desporto × mercado × gama de odds. Leva uma faixa de confiança simples: abaixo de 30 apostas aparece "amostra pequena", e há um intervalo de Wilson para a taxa de acerto.
- *Porquê:* é a pergunta central de um apostador sério. Os componentes já existem separados (`buildBySportMarket`, `buildByOddsRange`, `buildCalibration`).
- *Dados:* todos internos. Grátis.

**2. Revisão semanal por IA (push ao domingo à noite)**: S · **Alta**
- *O quê:* um job Bull semanal chama a Gemini com as estatísticas da semana, as das últimas 12 semanas e os maiores desvios (mercado, casa, stake). Devolve 3 parágrafos e 3 ações, e fica guardado como notificação e no histórico de revisões.
- *Porquê:* transforma uma análise que só se vê quando se procura numa rotina. O prompt já existe (`aiReviewService.ts::buildPrompt`), falta a comparação temporal.
- *Dados:* internos mais o tier grátis da Gemini (uma chamada por semana).

**3. "Se tivesses seguido as tuas regras"**: M · **Média**
- *O quê:* simula o histórico com filtros (sem múltiplas de 4 ou mais seleções, sem odds acima de 5, sem apostas depois das 23 h…) e mostra o lucro alternativo.
- *Porquê:* é a prova concreta de que um hábito custa dinheiro. Há dados para isso: `buildLegKillDistribution` e `buildByHour` já mostram os padrões.
- *Dados:* internos.

**4. Ranking de equipas e jogadores "amigos" e "inimigos"**: S · **Média**
- *O quê:* destaca as 5 equipas, competições e tenistas com melhor e pior lucro (`getStatsByTeam` e `getStatsByCompetition` já existem) e liga a cada um o histórico de equipa (`equipa/index.tsx`).
- *Dados:* internos.

### B. Disciplina e gestão de banca

**5. Banca e unidades (#35)**: M · **Alta**
- *O quê:* um modelo novo `BankrollTx` (depósito, levantamento, bónus por casa) e um saldo calculado como depósitos − stakes + retornos. A unidade é definida como 1–2% da banca. A stake de cada boletim aparece em unidades e o Confirmar sugere a stake. As estatísticas ganham "ROI sobre a banca" e "drawdown máximo".
- *Porquê:* sem banca não existe gestão de risco, e o yield sobre o total apostado esconde o drawdown.
- *Dados:* lançamentos manuais. Extra opcional: o extrato do PDF da Betclic já passa por `betclicPdfParser.ts`.
- *Nota:* é preciso uma migração (respeitar a reconciliação do #24).

**6. Etiquetas, confiança e motivo da aposta (#39)**: M · **Alta**
- *O quê:* no Confirmar, 3 campos opcionais com um toque cada: confiança de 1 a 5, motivo (forma, valor, palpite, ao vivo, recuperar) e etiquetas livres. Entram nas estatísticas como mais uma dimensão de repartição.
- *Porquê:* é a única forma de avaliar o processo e não só o resultado. "As apostas de confiança 5 têm ROI de −12%" é o tipo de insight que muda comportamentos.
- *Dados:* introduzidos pelo utilizador. São 3 campos no `Boletin`.

**7. Aviso no momento de apostar**: S–M · **Alta**
- *O quê:* quando um boletim é registado (Confirmar ou scan), avaliar no servidor os limites, a perseguição de perdas (stake ≥ 2× a mediana até 24 h depois de uma perda), a stake fora do intervalo habitual e os padrões perdedores da ideia 1. O resultado aparece como um cartão laranja com o motivo concreto e um push, se a aposta veio de uma partilha.
- *Porquê:* hoje `bettingLimits.ts` só avisa no Início, depois do facto.
- *Dados:* internos. Os limites passam do `limitsStore` para as preferências do utilizador no servidor.

**8. Pausa voluntária (cool-off)**: S · **Média**
- *O quê:* um botão "Pausa de 24 h / 7 dias". Durante a pausa, o + mostra a pausa e o tempo que falta e não deixa registar sem confirmação dupla. Opcionalmente, liga ao link da autoexclusão do SRIJ.
- *Porquê:* é o complemento natural dos limites, e custa pouco.
- *Dados:* nenhum.

**9. Lista "Apostas que evito"**: M · **Alta**
- *O quê:* uma lista curta de regras pessoais, sugeridas pelos dados (por exemplo "Múltiplas de 5+ seleções: −38% em 41 apostas") e aceites pelo utilizador. O Confirmar avisa quando um boletim cai numa regra.
- *Porquê:* fecha o ciclo análise → decisão. Reaproveita as ideias 1 e 7.

### C. Valor sem scrapers

**10. CLV manual, "a odd fechou abaixo?"**: M · **Média**
- *O quê:* depois do jogo começar, uma notificação opcional pede "qual é a odd agora?" para uma seleção marcada, e aceita um print (a Gemini lê). Com o tempo calcula o CLV médio por mercado.
- *Porquê:* o CLV é o melhor indicador de skill a longo prazo, mais estável que o ROI. Sem odds automáticas, só dá para fazer por amostragem e à mão. É opcional, e vale a pena só para os mercados principais.
- *Dados:* o utilizador. **Alternativa a verificar:** o resumo da ESPN às vezes traz `pickcenter`/`odds` (casas dos EUA) na NBA e em algumas ligas. Os ficheiros de teste em `sportsData/__fixtures__` não o mostram, por isso é preciso confirmar com respostas reais. Se existir, dá um CLV aproximado no 1X2, no spread e nos totais sem scraping. Não é a Betclic, mas é um mercado de referência.

**11. "Odd justa" pessoal antes de apostar**: S · **Média**
- *O quê:* no Confirmar, o utilizador escreve a probabilidade que estima (ou usa o slider de confiança). A app mostra a odd justa e o valor esperado face à odd da Betclic, e mais tarde a calibração das suas estimativas.
- *Porquê:* treina a disciplina de "só aposto com valor" e cria uma calibração pessoal real, não só implícita.
- *Dados:* o utilizador.

### D. Contexto pré-aposta (dados ESPN)

**12. Checklist pré-aposta automática**: M · **Média**
- *O quê:* no Confirmar ou no Por jogo, um cartão com forma, confrontos diretos, posição (já em `espnPreview.ts` e `/sports/football/preview`), o teu histórico com a equipa (`teamHistory.ts`) e com o mercado (como em `analise.tsx`), e avisos como "jogo às 20h, já tens 3 apostas pendentes hoje".
- *Porquê:* junta numa vista o que hoje está espalhado por 3 ecrãs.
- *Dados:* ESPN, grátis, e internos. Ténis e NBA têm menos dados (sets e parciais).

### E. Hábito, conveniência e saída de dados

**13. Exportação automática mensal**: S · **Baixa**
- *O quê:* no dia 1 de cada mês, gerar CSV e XLSX (o mobile já tem a folha de exportação) e enviá-los por email via SMTP, que já está configurado para a autenticação.
- *Porquê:* cópia de segurança e IRS/controlo pessoal, sem esforço.

**14. Widget Android (#41)**: L · **Média**
- *O quê:* pendentes, "a ganhar/a perder" ao vivo e lucro da semana. Usa `react-native-android-widget` ou um módulo nativo. Como a app é usada só em Android, não é preciso iOS.
- *Dados:* `/boletins/live`.

**15. Resumo diário de manhã ("o teu dia")**: S · **Média**
- *O quê:* um push às 10 h com os jogos de hoje com aposta, a exposição total em euros e os resultados de ontem.
- *Porquê:* combina com a Agenda e os resultados ao abrir a app, que já existem (commit 09e1824).

**16. Calendário de exposição**: S · **Baixa**
- *O quê:* no `HeatmapCalendar.tsx`, mostrar também os dias futuros com o valor em jogo. Permite ver de relance os "fins de semana carregados".

**17. Duplicar como modelo (#39, parte "modelos")**: S · **Média**
- *O quê:* "guardar como modelo" nos boletins recorrentes (por exemplo "Over 2.5 + BTTS no jogo do Benfica") e preenchê-lo a partir do Por jogo. O fluxo "Duplicar" já existe no `confirmar.tsx`.

**18. Leitura de screenshots de outras casas (#50)**: M · **Baixa**
- *O quê:* prompts por casa no `geminiVisionParser.ts`.
- *Porquê:* só compensa se o utilizador passar a usar outra casa. Hoje usa sobretudo a Betclic.

---

## 3. Resumo das ideias

| # | Ideia | Dados | Grátis? | Esforço | Valor |
|---|---|---|---|---|---|
| 1 | Edge por mercado | Internos | Sim | S–M | Alta |
| 2 | Revisão semanal IA | Internos + Gemini | Sim (tier grátis) | S | Alta |
| 3 | "Se tivesses seguido as regras" | Internos | Sim | M | Média |
| 4 | Equipas amigas/inimigas | Internos | Sim | S | Média |
| 5 | Banca e unidades | Manual | Sim | M | Alta |
| 6 | Etiquetas, confiança, motivo | Utilizador | Sim | M | Alta |
| 7 | Aviso ao registar | Internos | Sim | S–M | Alta |
| 8 | Pausa voluntária | — | Sim | S | Média |
| 9 | "Apostas que evito" | Internos | Sim | M | Alta |
| 10 | CLV manual / ESPN `pickcenter` | Utilizador / ESPN (a verificar) | Sim | M | Média |
| 11 | Odd justa pessoal | Utilizador | Sim | S | Média |
| 12 | Checklist pré-aposta | ESPN + internos | Sim | M | Média |
| 13 | Exportação mensal por email | Internos | Sim | S | Baixa |
| 14 | Widget Android | `/boletins/live` | Sim | L | Média |
| 15 | Resumo de manhã | Internos | Sim | S | Média |
| 16 | Calendário de exposição | Internos | Sim | S | Baixa |
| 17 | Modelos de boletim | Internos | Sim | S | Média |
| 18 | Scan de outras casas | Gemini | Sim | M | Baixa |

## 4. Ordem sugerida

1. **Limpeza** (1.3): social escondido, API-Football e fixture alerts apagados, PDF na revisão nova. Esforço M no total.
2. **Rápidas de alto valor:** 2, 1, 6 e 7 (cerca de uma semana). A partir daqui a app passa a dizer o que fazer, e não só o que aconteceu.
3. **Banca (5)**, seguida de 9 e 3, que ficam mais ricas com as unidades.
4. **Conveniência:** 15, 17 e depois 14.
5. **Exploratórias:** 10 (verificar primeiro o `pickcenter` da ESPN com uma resposta real) e 11.
