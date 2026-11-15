# BetIntel — Revisão geral e plano (15/11/2026)

Síntese de 4 auditorias só de leitura (relatórios completos nesta pasta):
[backend](analise-backend.md) · [estrutura e navegação](analise-estrutura-navegacao.md) · [design e UX](analise-design.md) · [features](analise-features.md).
Os achados marcados com ✔ foram confirmados no código pelo coordenador.

Tamanho: S ≤ ½ dia · M 1–2 dias · L 3–5 dias · XL > 1 semana.

---

## Fase 0 — Bugs e riscos (fazer já, ~2–3 dias)

| # | O quê | Onde | Tam. |
|---|---|---|---|
| 0.1 ✔ | Múltipla com uma perna perdida fica PENDENTE até a última perna acabar (estado, "A decorrer", estatísticas e notificação atrasam). Devolver LOST logo. | `boletinService.ts:575` | S |
| 0.2 ✔ | Rotas `async` inline sem try/catch (Express 4) e sem `unhandledRejection`: um erro de Prisma/ESPN pode derrubar o processo. | `boletinRoutes.ts:37,54`, `index.ts` | S |
| 0.3 ✔ | Volume `uploads` montado em `/app/uploads`, a app grava em `/app/apps/api/uploads`: os avatares perdem-se em cada deploy. A porta 3000 está aberta em 0.0.0.0 (devia ser `127.0.0.1:3000` atrás do Nginx). | `docker-compose.yml:30-32`, `Dockerfile:45` | S |
| 0.4 ✔ | Recuperar password partida: o email aponta para `betintel://reset-password`, mas o ecrã não existe. | `utils/email.ts:46`, `app/(auth)/` | M |
| 0.5 ✔ | Notificação de jogo abre Jogos com `openFixtureId`, que ninguém lê. | `app/_layout.tsx:320`, `(tabs)/fixtures.tsx` | S |
| 0.6 | Seed de 1989 linhas corre em cada arranque, antes do `listen`, apaga ligações equipa-competição e desativa competições (não atómico). Passar a idempotente/só quando muda. | `index.ts:168`, `prisma/seed.ts` | M |
| 0.7 | Freebet ganha conta `stake × odd` como retorno. Se a Betclic for "stake não devolvida", o lucro está inflacionado. **Precisa da tua confirmação.** | `boletinService.ts:604`, `statsService.ts:582` | S |
| 0.8 | Editar/apagar pernas recalcula a odd total por divisão, sem transação (estraga boletins com odd aumentada). | `boletinService.ts:193-482` | M |
| 0.9 | Tracker reconsulta itens `needsReview` 3×/min durante 5 dias; cron de 1 min sem lock contra execuções sobrepostas. | `liveBetTrackerJob.ts` | M |
| 0.10 | CI faz deploy sem correr `npm test` nem `tsc`. | `.github/workflows/build-api.yml` | S |

## Fase 1 — Limpeza (~3–4 dias, tira ~4 000+ linhas)

- **Mobile:** ~640 linhas mortas em `stats.tsx` e ~450 em `boletins.tsx` (bolha de notificações, menu FAB, dropdown que nunca abrem); 7 componentes sem uso (`ParlayOptimiserCard`, `ProjectionCard`, `OddsCalculator`…); rotas registadas sem ficheiro (`boletins/_layout.tsx:23`).
- **API:** jobs/rotas/serviços da API-Football (desligados por `API_FOOTBALL_ENABLED`), ~20 rotas que a app não chama (`fixture-alerts`…), 6 modelos só lidos por `(prisma as any)`, dependências não usadas, `nba.tmp.ts`.
- **API:** `ok/fail/requireUserId` copiados em 11 controladores → um `asyncHandler` + helpers comuns; nunca devolver `err.message`/`meta` do Prisma.
- **Regra de dinheiro única:** estado/retorno/lucro duplicados em `boletinService`, `statsService` e `userService` (já divergem em PARTIAL) → `boletinMath.ts` puro e testado.
- **Testes:** `npm test` na app; testes para `boletinService`, auth/`tokenService`, importação.
- **Decisões que pedem o teu OK:** `betclicApiService.ts` (usa o teu token de sessão num endpoint privado da Betclic), `import-review.tsx` (2 440 linhas, só para o PDF), Agenda (sobrepõe-se a Jogos → Apostas), parte social, métricas personalizadas.

## Fase 2 — Estrutura (~1–2 semanas)

- Partir `statsService.ts` (1 819 → `stats/{summary,breakdowns,timeline,streaks,insights}.ts`), `boletinService.ts` (separar estado puro e notificações), `liveBetTrackerJob.ts` (um `SportTracker` comum aos 3 desportos).
- Mobile: `settings.tsx` em cartões por secção; `import-review` dividido ou retirado.
- React Query: tirar o refetch em cada foco (`boletins.tsx:331`) e o `setInterval` em Jogos; chaves sem raízes sobrepostas; pedidos só pela camada `services/`.
- Segurança básica: fechar o registo (app pessoal), `authenticate` em `/fixtures`, `/users/:username`, `/reference`; `timingSafeEqual` na chave interna.

## Fase 3 — Design e UX (~1–2 semanas)

1. **Rápidos (S):** estado de erro no Início (hoje mostra "+0,00 €" sem rede); copy (Anulado vs Cancelado, "boletin", "FT" → "Fim", € e vírgula decimal, onboarding desatualizado); texto sobre verde com `onPrimary` (28 cores à mão) e `primary` claro mais escuro para passar AA.
2. **Sistema (M–L):** escala tipográfica real (837 `fontSize` fixos, 25 tamanhos, 9–10 px ilegíveis, mistura Inter/Roboto) com `AppText` e lint; menos acentos (verde só para dinheiro/ação, sem violeta nas datas nem 7 gradientes na Análise); um componente `Sheet` comum para os 21 modais.
3. **Ecrãs:** Análise com uma só fila de controlos antes do primeiro número; Jogos com menos filas e sem pílula flutuante; cartão de boletim sem faixa de topo nem MAIÚSCULAS; ecrã NBA alinhado com futebol/ténis; menos elementos flutuantes.
4. **Acessibilidade:** `accessibilityLabel` (116 de 310 tocáveis), alvos ≥ 44 px, `maxFontSizeMultiplier`.

## Fase 4 — Features novas (por valor/esforço)

| # | Feature | Esforço | Valor |
|---|---|---|---|
| F1 | **Onde ganhas:** ROI e calibração por desporto × mercado × gama de odds, com aviso de amostra pequena (dados já calculados em separado) | S–M | Alta |
| F2 | **Revisão semanal por IA por push** (o `aiReviewService` já existe; falta job de domingo e comparação com o histórico) | S | Alta |
| F3 | **Aviso no momento de registar:** limites passam para o servidor; perseguição de perdas, stake fora do habitual e padrões perdedores avisados no Confirmar/scan | S–M | Alta |
| F4 | **Banca e unidades (#35):** depósitos/levantamentos por casa, stake em unidades, drawdown | M | Alta |
| F5 | **Confiança 1–5, motivo e etiquetas (#39)** por boletim, como nova dimensão nas estatísticas | M | Alta |
| F6 | **"Apostas que evito":** regras pessoais sugeridas pelos dados e avisadas no Confirmar | M | Alta |
| F7 | Cobertura de liquidação visível na app (endpoint já existe) | S | Média |
| F8 | "Se tivesses seguido as tuas regras" (simulação do histórico com filtros) | M | Média |
| F9 | Checklist pré-aposta (forma, H2H, o teu histórico com a equipa e o mercado) | M | Média |
| F10 | Widget Android (#41) com pendentes e ao vivo | L | Média |
| F11 | CLV aproximado (odd de fecho pedida por print, ou `pickcenter` da ESPN se existir) | M | Média |
| — | Também: pausa voluntária, equipas "amigas/inimigas", odd justa pessoal, exportação mensal por email (ver relatório de features) | S–M | Média/Baixa |

## Fase O — Comparador de odds (requisito novo, 15/11/2026)

**Pedido:** obter mercados e odds da **Betclic, Betano, Lebull, Solverde e Placard** para **futebol, basquetebol e ténis**; mostrar cada evento ao estilo da app da Betclic (cabeçalho do jogo, separadores Top / Resultado / Golos / Marcadores / Handicap…, sub-filtros em pílulas, mercados em cartões com as seleções em botões); ver as odds de todas as casas para cada seleção e saber qual paga mais; construir múltiplas e comparar a odd total entre casas.

Isto inverte a decisão anterior "sem scrapers de odds" (AGENTS.md §0 e CONTEXTO serão atualizados quando a fase arrancar). Riscos conhecidos: a Betclic já bloqueou pedidos automáticos antes (CONTEXTO); os sites mudam sem aviso (manutenção contínua); termos de utilização das casas (uso pessoal, baixa frequência).

| # | O quê | Tam. |
|---|---|---|
| O1 | **Estudo de viabilidade por casa** (antes de construir): como a web/app de cada casa obtém as odds (JSON/WebSocket públicos), cobertura dos 3 desportos e mercados, limites, bloqueios, a partir do servidor Hetzner e com o proxy `SCRAPER_HTTP_PROXY`. Resultado: `ESTUDO_ODDS.md` com go/no-go por casa. O `betclicApiService.ts` existente entra aqui. | M |
| O2 | **Modelo canónico:** eventos ancorados nos jogos ESPN (já usados na liquidação); emparelhamento de nomes por casa; dicionário de mercados normalizados (reaproveita o vocabulário do motor de liquidação, para que o que se compara é o que depois se liquida). Odds atuais no Redis (TTL); histórico em Postgres só para fecho de mercado (dá o CLV automático, F11). Migração nova → reconciliar o drift primeiro (#24). | L |
| O3 | **Adaptadores** por casa + agendamento: só eventos das próximas 48 h nas competições cobertas, de 5 em 5 min; ao vivo de 30 em 60 s só para jogos com aposta ou abertos no ecrã; monitorização por fonte (reaproveita o #61). | L–XL |
| O4 | **Ecrã do evento estilo Betclic** (a partir de Jogos): cabeçalho, separadores e pílulas por categoria de mercado; cada seleção mostra a melhor odd e o logótipo da casa; tocar abre a comparação das 5 casas (melhor destacada). | L |
| O5 | **Construtor de múltiplas com comparação:** juntar seleções de vários eventos; tabela de odd total por casa (casas sem todas as pernas aparecem como "incompleta"); melhor casa destacada; "Registar nesta casa" abre o Confirmar já preenchido. | M–L |

Esforço total estimado: 3–5 semanas, dependente do O1. O O1 corre logo a seguir à fase 0 porque decide o que é possível.

## Decisões tomadas (15/11/2026)

- **Freebet:** stake devolvida (5 € a odd 2,00 ganha → 10 € de lucro). O código atual está certo; o ponto 0.7 sai do plano.
- **`betclicApiService.ts`:** fica até ao estudo O1, que decide se serve para o comparador.
- **Cortes (decididos por mim, a teu pedido), na fase 1:**
  - Parte social: sair da app (Amigos, perfil público, público/privado, feed). A partilha como imagem fica. As tabelas ficam na base (sem migração).
  - Agenda: sai (Jogos → Apostas cobre o mesmo).
  - Métricas personalizadas: saem (os dados ficam na base).
  - Registo aberto: fechado por omissão (`REGISTRATION_ENABLED=false`).
  - Código da API-Football: sai o que já não é usado (verificar antes o que o #58 ainda deixou ligado).
  - `import-review.tsx` (PDF): **fica**. É a única importação em massa do histórico; é partido na fase 2.
- **Porta 3000:** não mexo sem ver o Nginx do servidor. Verificação manual: se o Nginx corre no host, mudar para `127.0.0.1:3000:3000`; se corre na rede Docker, retirar a publicação da porta.

## Ordem recomendada

Fase 0 (a decorrer, branch `fase0-bugs`, [plano](plano-fase0-bugs.md)) → **O1 estudo de odds** → Fase 1 (limpeza e cortes) → O2–O5 (comparador) → F1 + F2 + F3 → Fase 3 (design rápido + sistema) → F4/F5/F6 (migração; reconciliar drift, #24) → Fase 2 conforme for preciso → restantes features.
