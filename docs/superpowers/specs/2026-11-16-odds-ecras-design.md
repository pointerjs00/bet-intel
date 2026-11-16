# Ecrãs do comparador de odds (fase 3 + fase 5 do PLANO_ODDS)

Data: 2026-11-16 · Estado: em aprovação

## Intenção

O servidor já recolhe odds da Betclic e da Betano (e mais casas depois) e compara-as por seleção
canónica. A app ainda não mostra nada disso. O objetivo é ver, antes de apostar, **qual casa paga mais**
em cada seleção e na múltipla inteira, e **registar o boletim nessa casa** sem escrever nada à mão,
com a liquidação automática a funcionar como nos outros boletins.

Uso pessoal (um utilizador). A referência visual é a app da Betclic (lista de competição com cartões
1X2, ecrã do jogo com separadores de mercados), adaptada a várias casas.

## Objetivos

1. Nova tab **Odds** na página Jogos, com filtro de desporto e de competição, e cartões de jogo ao
   estilo Betclic com o 1X2 (ou equivalente do desporto).
2. **Ecrã de odds do jogo** com separadores de mercados e cartões por mercado.
3. Em cada botão de odd: a **melhor odd e o logo da casa** que a paga (decisão A).
4. **Folha das casas** de uma seleção: todas as casas com a odd, melhor destacada, e "Registar nesta casa".
5. **Múltipla de odds**: tocar numa odd adiciona-a; barra flutuante com o resumo; **tabela** com a odd
   total por casa e retorno para um valor; **"Registar na <casa>"** preenche o Novo boletim e abre o Confirmar.
6. No ecrã do jogo existente (`jogo/[id]`), um cartão com o 1X2 e "Ver todas as odds" quando há odds.

## Fora de âmbito (não fazer)

- Fotografias de jogadores nos cartões (não há fonte); usam-se as bandeiras/emblemas já existentes.
- Barra de "% de apostas" da Betclic (nenhuma casa dá esse dado).
- Novas casas (Lebull, Placard, Solverde): os ecrãs mostram as casas que a API devolver, sem lista fixa.
- Odds ao vivo em tempo real, alertas de odds, CLV (fases 8–9).
- Mudanças ao motor de liquidação.

## Anti-objetivos (seria falhar mesmo que funcione)

- Registar um boletim cujo mercado/seleção o motor de liquidação **não** reconheça (fica eternamente
  pendente ou vai para "A rever" sem razão).
- Comparar seleções que não são a mesma aposta (só se compara por chave canónica; já garantido no servidor).
- Partir o Novo boletim manual (registo à mão, importação, "Por jogo").
- Mostrar uma odd como "melhor" quando está suspensa.

## Restrições

- Mobile: Expo Router, React Query, Zustand; **sem NativeWind** — `StyleSheet` + tokens v2
  (`theme/tokens.ts`) e componentes de `components/ui/` (`AppText`, `ListCard`, `StatusPill`,
  `SegmentedControl`, `SectionHeader`, `TeamBadge`, `SiteMark`). PT-PT, odds com vírgula (`1,90`).
- API: rotas `/api/odds/*` já existem e exigem autenticação: `GET /events?sport&date`,
  `GET /events/:key`, `POST /multiple` (hoje 1–10 seleções `{eventKey, selectionKey}`; passa a 30, §1), `GET /health`.
- Janela de odds: 48 h (hoje e amanhã); recolha a cada 10 min.
- Um boletim tem **uma** casa (`siteSlug`); as casas usam os slugs `betclic`, `betano`, `lebull`,
  `placard`, `solverde` (iguais ao `HouseId` da API).
- As chaves canónicas são calculadas com o `parseBet` do `marketResolutionEngine` — o mesmo parser que
  liquida os boletins. Logo, **o texto original da casa** (mercado + seleção) que deu uma chave não nula
  é texto que o motor de liquidação entende.
- Testes da API: `npm test` em `apps/api` (node:test). Lógica pura da app testável com node:test
  (ver AGENTS.md §0).

## Abordagens consideradas

- **A) Lista própria para a múltipla de odds (escolhida).** Store Zustand nova (`oddsSlipStore`) com
  `{eventKey, selectionKey, …dados de apresentação}`, sem casa nem odd. A tabela pede os totais a
  `POST /odds/multiple`; o registo converte para itens do `boletinBuilderStore`. Separa comparar (sem
  casa) de registar (com casa) e reaproveita o cálculo testado do servidor.
- B) Usar o `boletinBuilderStore` como múltipla — rejeitada: obriga a casa e odd fixas por item e
  misturava o boletim manual com a comparação.
- C) Como A mas totais calculados na app — rejeitada: duplica lógica do servidor e usa odds possivelmente
  desatualizadas.

## Desenho

### 1. Alteração à API (pequena, aditiva)

`ComparedSelection` passa a levar o texto de cada casa, para o registo e para agrupar por mercado:

```ts
interface HousePrice { odds: number; suspended: boolean; market: string; selection: string }
interface ComparedSelection { key: string | null; label: string; market: string; prices: …; best: … }
```

- `prices[house].market/selection` = `marketLabel`/`selectionLabel` originais dessa casa.
- `market` da linha = `marketLabel` da primeira casa (ordem `HOUSE_ORDER`), para títulos de cartão.
- `compareMultiple` ignora os campos novos. Testes de `compare`/`service` atualizados.
- A linha do 1X2 de `GET /events` (`main`) já traz estes campos por herança.
- `POST /multiple` passa a aceitar até **30** seleções (era 10), o máximo das casas portuguesas;
  teste da rota atualizado (30 aceite, 31 → 400).

### 2. Tab Odds (página Jogos, `app/(tabs)/fixtures.tsx`)

- Nova entrada `'odds'` no `TabBar` (ícone de odds/trending), ao lado de Apostas · Futebol · Ténis · Basquetebol.
- Conteúdo: `SegmentedControl` de desporto (Futebol · Ténis · Basquetebol) e, por baixo, chips de
  competição horizontais ("Todas" + competições com jogos, ordenadas por nº de jogos).
- Dados: `GET /odds/events?sport&date` para hoje e amanhã (Lisboa), duas queries React Query,
  `staleTime` 2 min. Secções "Hoje" / "Amanhã".
- **Cartão de jogo**: competição + nº de casas no topo; casa · bandeira · hora · bandeira · fora;
  linha de botões principais (`main`): futebol 3 (Casa / Empate / Fora), ténis e basquetebol 2.
  Jogo ao vivo: hora substituída por "AO VIVO".
- Sem odds para o dia/filtro: `EmptyState` "Sem odds para estes jogos".
- Tocar no cartão (fora dos botões) abre o ecrã de odds do jogo.

### 3. Botão de odd (componente partilhado `OddButton`)

- Mostra o rótulo da seleção (equipa/Empate/Mais 2,5…), a **melhor odd** e o `SiteMark` pequeno da casa.
- Estados: normal; **na múltipla** (contorno/realce com a cor primária); suspenso (todas as casas
  suspensas → "—", desativado).
- **Toque**: adiciona/remove da múltipla (só linhas com `key` não nula).
- **Toque longo** (e toque em linhas `key: null`): abre a folha das casas.

### 4. Folha das casas (bottom sheet)

- Título: seleção + mercado + jogo. Lista de casas (ordem por odd desc.), `SiteMark` + nome + odd;
  melhor com destaque; suspensas a cinzento com "suspensa".
- Cada casa não suspensa: botão **"Registar nesta casa"** → regista **uma seleção** (ver §7).
- Linha `key: null` (mercado de uma só casa): mostra a casa e a odd, **sem botão de registar**
  (o motor pode não reconhecer o texto).
- Botão "Adicionar à múltipla" / "Remover da múltipla" quando `key` não nula.

### 5. Ecrã de odds do jogo (`app/odds/[key].tsx`, nova rota)

- Rota própria porque há jogos com odds sem ficha ESPN (chaves `bet:`/`n:`).
- Cabeçalho: competição, casa · hora/AO VIVO · fora (bandeiras via `TeamBadge`), nº de casas.
  Para chaves `espn:FOOTBALL:<id>`, link "Estatísticas do jogo" para `jogo/[id]`.
- Separadores (horizontais, só os que têm linhas), a partir do prefixo da chave:

  | Separador | Chaves |
  |---|---|
  | Top | 1X2/ML, Dupla, Total de golos/pontos principal (linha 2.5 no futebol), BTTS |
  | Resultado | `*.1X2.*`, `*.DC.*`, `FT.DNB.*`, `HTFT.*`, `B.ML.*` |
  | Golos / Pontos | `*.TOTAL.*`, `B.TOTAL.*`, `B.TEAMTOTAL.*`, `T.GAMES.*`, `T.SETSTOTAL.*` |
  | Ambas marcam | `*.BTTS.*` |
  | Handicap | `*.HCP.*` |
  | Marcadores | `SCORER.*`, `FT.FIRSTGOAL.*` |
  | Resultado exato | `FT.SCORE.*`, `T.SETS.*` |
  | Outros | resto, incluindo `key: null` (por `market` da linha) |

  Períodos (`HT.`/`H1.`/`Q1:`…) ficam no mesmo separador, em cartões próprios com o período no título.
- Cartões por mercado (agrupados por `market` da linha). Layout: 2–3 seleções → botões lado a lado
  (como o 1X2 da Betclic); mais → lista "rótulo ······ [botão]" (como o "Resultado duplo").
- Dados: `GET /odds/events/:key`, `staleTime` 1 min, pull-to-refresh. 404 → "Odds indisponíveis para este jogo".

### 6. Múltipla de odds

- Store `oddsSlipStore` (Zustand + persistência AsyncStorage, como o builder):
  `legs: { eventKey, selectionKey, label, market, home, away, startsAt, sport, competition }[]`,
  máx. **30** (o máximo das casas portuguesas; a 31.ª dá toast "Máximo de 30 seleções"), **uma seleção por jogo** (adicionar outra do mesmo jogo substitui, com toast).
  Pernas cujo `startsAt` já passou há mais de 3 h são descartadas ao abrir.
- **Barra flutuante** (visível na tab Odds e no ecrã de odds quando há pernas):
  "Múltipla · N seleções · melhor X,XX na <casa>"; toque abre a tabela.
  O "melhor" vem de `POST /odds/multiple` (query React Query com a lista como chave).
- **Tabela da múltipla** (`app/odds/multipla.tsx`, ecrã modal):
  - Linhas = pernas (seleção, mercado, jogo) com botão remover; colunas = casas com preço em pelo
    menos uma perna; cada célula = odd dessa casa (dos `EventView` já em cache/obtidos) ou "—".
  - Linha "Odd total" (de `perHouse[h].total`, "—" se `null`) e "Retorno" para um valor editável
    (default = último valor usado, senão 10 €). Melhor total destacado.
  - Botão principal **"Registar na <melhor casa>"**; tocar no cabeçalho de outra coluna completa
    escolhe essa casa. Casas incompletas não têm botão.
  - "Limpar múltipla".

### 7. Registo no Novo boletim

Função pura `toBuilderItems(legs, house, views)` (testada) que gera `BoletinBuilderItem[]`:

- `market` = `prices[house].market`, `selection` = `prices[house].selection`, `oddValue` = `prices[house].odds`
  (texto original da casa — reconhecido pelo motor, ver Restrições);
- `homeTeam`/`awayTeam`/`competition`/`eventDate`/`sport` do `EventView`.

Fluxo:
1. Se o builder tiver itens: diálogo "Já tens um boletim em curso (N seleções). Substituir?" →
   Substituir / Cancelar.
2. `reset()` do builder, `setSiteSlug(house)`, `addItem` de cada perna, odds conferidas no momento
   (se a odd mudou desde a tabela, o valor novo é usado e um toast avisa "Odds atualizadas").
3. Abre `/boletins/confirmar` (o utilizador põe o valor e guarda como hoje). A múltipla de odds
   **não** é limpa automaticamente; o Confirmar, ao guardar com sucesso, limpa-a se as pernas
   coincidirem (mesmo jogo + seleção).
- "Registar nesta casa" da folha (§4) = o mesmo fluxo com uma só perna.

### 8. Ecrã do jogo existente (`jogo/[id].tsx`)

- Se `GET /odds/events/espn:<SPORT>:<id>` responder 200: cartão "Odds" logo abaixo do cabeçalho com
  os botões principais (mesmo `OddButton`) e "Ver todas as odds (N casas)" → ecrã de odds.
- Se 404: nada (sem cartão vazio).

## O que fica para quem constrói

- Ícone exato da tab e pormenores visuais dentro dos tokens v2.
- Formato das bandeiras/emblemas para jogos sem ESPN (o `TeamBadge` já trata nomes sem imagem).
- Cache/invalidação fina das queries, desde que respeite os `staleTime` acima.
- Testes: lógica pura (agrupamento por separador, `toBuilderItems`, regras da múltipla) com node:test;
  API com os testes existentes atualizados.
