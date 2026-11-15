# BetIntel — Auditoria de design e UX (mobile)

Data: 15/11/2026 · Âmbito: `apps/mobile` (código atual do `main`) + 171 capturas em `screenshots/` (11/11, 22:34–22:35).
Nota: as capturas são anteriores à "Revisão de ecrãs de 11/11" (§12 do CONTEXTO). Por isso, cada achado foi confirmado no código. As capturas serviram para avaliar o layout e a hierarquia.

Tamanho: S ≤ ½ dia · M 1–2 dias · L 3–5 dias · XL > 1 semana.

---

## Top 10 (por ordem de impacto/esforço)

| # | Achado | Prio | Tam |
|---|---|---|---|
| 1 | Tipografia fora da escala: 837 `fontSize` fixos com 25 tamanhos diferentes; 84 ficheiros usam `<Text>` cru e só 24 usam `AppText` | Alta | L |
| 2 | Texto sobre o verde: 28 cores fixas (`#06110B`…) em vez de `onPrimary`, e o próprio `onPrimary` claro falha o AA (4,1:1) | Alta | S |
| 3 | Demasiados acentos: neon nos seletores, violeta nas datas, dourado nas odds e 7 gradientes nos ícones da Análise. O "verde = dinheiro" perde-se | Alta | M |
| 4 | O Início não tem estado de erro: sem rede, mostra "+0,00 €" como se fosse verdade | Alta | S |
| 5 | Análise com 2–3 filas de controlos iguais (período + tabs + filtros) antes do primeiro número | Alta | M |
| 6 | Cartão de boletim com faixa de cor no topo e rótulos em MAIÚSCULAS, contra as regras §6.1 do próprio plano | Média | S |
| 7 | Copy: "Anulado" vs "Cancelado", "boletin" no texto, € à inglesa e ponto decimal nos explicadores, "FT", onboarding desatualizado | Alta | S |
| 8 | Folhas e modais: 21 ficheiros com `<Modal>` cru, cada folha com o seu fundo, raio e botões | Média | L |
| 9 | Acessibilidade: 310 tocáveis e só 116 `accessibilityLabel`; alvos de 28–36 px; ignora a escala de letra do sistema | Média | M |
| 10 | Elementos flutuantes a mais: barra flutuante, botão "voltar ao topo" verde, pílula "Hoje" violeta, "+" verde. Sobrepõem-se ao conteúdo | Média | S |

---

## A. Sistema (transversal)

### A1. Tipografia sem escala efetiva
- **Evidência:** 837 `fontSize: N` literais. Distribuição: 12 (166×), 13 (145×), 14 (107×), 11 (107×), 15 (80×), **10 (49×), 9 (8×)**, 16, 18, 22, 28, 30, 34, 38, 54, 56… A escala do plano é 12/13/15/17/20/24/32/40 (§6.2), e o `AppText` só tem 9 variantes (`components/ui/AppText.tsx:15-25`). Os piores ficheiros: `app/boletins/import-review.tsx` (35), `components/boletins/BoletinCard.tsx` (31), `app/(tabs)/stats.tsx` (31), `app/(tabs)/boletins.tsx` (31), `app/jogo/nba/[id].tsx` (27), `app/boletins/scan.tsx` (26). Há 490 `fontWeight` contra 287 `fontFamily`, e não existe fonte por omissão (`app/_layout.tsx:211` só carrega as fontes). Um `<Text>` com `fontWeight:'700'` e sem família cai no Roboto do Android. A app mistura assim duas famílias de letra.
- **Impacto:** a hierarquia muda de ecrã para ecrã, há texto de 9–10 px ilegível e a mistura Inter/Roboto dá um ar "montado".
- **Proposta:** (1) acrescentar ao `AppText` as variantes `micro` (11, só para eixos de gráficos) e `numberSmall` (13 tabular); (2) proibir 9–10 px; (3) migrar primeiro os 6 ficheiros acima; (4) uma regra de lint (`no-restricted-syntax` sobre `fontSize` numérico fora de `theme/`).
- **Tamanho:** L · **Prioridade:** Alta

### A2. Texto sobre o verde e contraste do `onPrimary`
- **Evidência:** 28 ocorrências de `#06110B`/`#0B0D0C`/`#04140C` escritas à mão (ex.: `app/(tabs)/fixtures.tsx:444,513,551`, `app/(tabs)/stats.tsx:1082,1105`, `app/boletins/scan.tsx:241,343,460,481`, `app/boletins/novo.tsx:59`, `components/boletins/BoletinFilterSheet.tsx:280,547,602`, `components/import/EditLegSheet.tsx:336`). O token `onPrimary` só é usado 3 vezes. No modo claro, `onPrimary #FFFFFF` sobre `primary #0B8F5A` dá **4,13:1** (abaixo de AA para texto normal); o `#06110B` à mão dá 4,66:1.
- **Impacto:** se o `primary` mudar, metade dos botões fica ilegível; o token oficial do modo claro falha o contraste.
- **Proposta:** escurecer o `primary` claro para `#0A7F50` (≈5:1 com branco) ou definir `onPrimary` claro = `#04140C`; substituir as 28 ocorrências por `colors.onPrimary`. O mesmo para o `rgba(61,255,162,0.16)` do ROI no Início (`app/(tabs)/index.tsx:163`), que só serve no escuro: criar `positiveSoft`/`negativeSoft` nos tokens.
- **Tamanho:** S · **Prioridade:** Alta

### A3. Cores fixas restantes
- **Evidência:** 365 hex/rgba em `.tsx` (o plano fala em ~420). Os piores: `components/stats/StatsShareCard.tsx` (45) e `components/boletins/ShareCard.tsx` (23), de propósito; depois `app/boletins/agenda.tsx` (18), `scan.tsx` (12), `import-review.tsx` (11), `(tabs)/boletins.tsx` (11), `components/ui/SportIcon.tsx` (10), `app/_layout.tsx` (10), `components/stats/v3/StatCard.tsx` (9), `app/jogo/nba/[id].tsx` (8).
- **Impacto:** a paridade claro/escuro só é garantida nos ecrãs migrados.
- **Proposta:** migrar só os ecrãs vivos (Agenda, scan, boletins, NBA, StatCard). Deixar os cartões de partilha com paleta própria, mas num `shareTokens` separado. Apagar o `import-review.tsx` quando o PDF passar para o fluxo novo.
- **Tamanho:** M · **Prioridade:** Média

### A4. Acentos a mais: o "Neon Arena" contra os princípios §6.1
- **Evidência:** verde neon cheio em todos os estados selecionados (`SegmentedControl`, chips, BOS/PHI na NBA, "Ano" na Análise, CTAs das folhas); `accent #8B5CFF` violeta no dia selecionado e na pílula "Hoje" (capturas 75–79, 100, 112); `gold` para todas as odds; 7 gradientes de ícone em `components/stats/v3/StatCard.tsx:12-20` (vermelho para "Valor apostado", laranja para "Em resumo"…); botão principal com gradiente verde→ciano e brilho (`components/ui/Button.tsx:81`). O §6.1 pede "verde só para dinheiro", "um acento por cartão" e "sem gradientes fortes".
- **Impacto:** quando tudo brilha, o lucro deixa de sobressair. É também o principal sinal de "app gerada por IA": quadrados coloridos com gradiente, gradiente em todos os CTAs, brilho por baixo dos cartões.
- **Proposta:** manter o v3, mas com regras: (1) estado selecionado = superfície `surfaceRaised` + texto `textPrimary` + indicador fino, e não verde cheio; (2) gradiente só no `HeroCard` e no "+"; botões primários em cor sólida; (3) os `IconTile` da Análise passam a monocromáticos (glifo `textSecondary` sobre `surfaceRaised`), com cor só quando o significado é ganho/perda; (4) o violeta fica só para o "Hoje"/data, ou sai de vez.
- **Tamanho:** M · **Prioridade:** Alta

### A5. Folhas e modais sem componente comum
- **Evidência:** 21 ficheiros com `<Modal>` cru e 6 com `BottomSheet`. Cada um tem o seu fundo (`rgba(0,0,0,0.5)` em `fixtures.tsx:556`, `0.55` em `stats.tsx:431`, `0.6` em `nba/[id].tsx:473`), o seu raio (24 em `BoletinFilterSheet.tsx:297`) e o seu botão de fechar (32 px em `BoletinFilterSheet.tsx:574`). Nas capturas 54–55 a folha de filtros fica por cima da barra de tabs, que continua visível.
- **Impacto:** inconsistência visual, alvos pequenos e a barra a competir com o CTA "Aplicar".
- **Proposta:** um componente `Sheet` (já previsto no plano: "Sheet comum") com cabeçalho (título, subtítulo, fechar de 44 px), corpo com scroll, rodapé fixo com 1–2 ações e `backdrop` dos tokens. Esconder a barra de tabs quando há folha aberta.
- **Tamanho:** L · **Prioridade:** Média

### A6. Acessibilidade
- **Evidência:** 310 `Pressable/PressableScale/TouchableOpacity` e 116 `accessibilityLabel`. 0 `maxFontSizeMultiplier`, e há mosaicos de altura fixa (o rótulo "Boletins gan…" já trunca a 100%, captura 147, `SummaryBlocks.tsx:24`). Alvos abaixo de 44: `AIReviewCard.tsx:238` (28×28), `LastNCard.tsx:155` (30×34), `BoletinFilterSheet.tsx:574` (32), `Button` `sm` = 36 (`Button.tsx:157`), `SegmentedControl` `minHeight: 36` (`SegmentedControl.tsx:74`), "…" do detalhe 40×48 (`boletins/[id].tsx:401`).
- **Impacto:** com a letra do sistema aumentada, os números grandes partem os mosaicos; alguns toques falham.
- **Proposta:** `hitSlop` por omissão no `Pressable` da app quando o alvo tem menos de 44; `Button sm` a 40 com `hitSlop` 4; `maxFontSizeMultiplier={1.3}` no `AppText` das variantes numéricas; rótulos obrigatórios nos botões só com ícone (lint `react-native-a11y`).
- **Tamanho:** M · **Prioridade:** Média

### A7. Iconografia misturada
- **Evidência:** Ionicons em 76 ficheiros e MaterialCommunityIcons em 19, os dois juntos em 14 (ex.: `SportIcon` é MCI e os cabeçalhos são Ionicons, com traços e pesos diferentes). Emojis ainda na UI: `app/boletins/agenda.tsx:30-39` (10), `import-review.tsx:58-71,812`, `BoletinCard.tsx:215-228` (💰📉💵💸 na pré-visualização por toque longo), `boletins.tsx:305` ("Ganhou! 🎉"), `WinCelebration.tsx:167`, `ProjectionCard.tsx:131`, `SelectionInsightsSheet.tsx:127,180`, `BoletinInsightsSection.tsx:136`.
- **Impacto:** viola o princípio 6 (sem emojis) e dá ar amador.
- **Proposta:** Ionicons outline para a interface, MCI só para desportos; trocar os emojis por `SportIcon`/Ionicons (é uma substituição mecânica).
- **Tamanho:** S · **Prioridade:** Média

### A8. Movimento e háptica
- **Evidência:** 167 usos de `FadeIn*` e 8 de `Appear`; a háptica existe em 10 ecrãs (`utils/haptics`). Falta nas ações destrutivas e de resultado: marcar Ganhou/Perdeu na fila "A rever" e no lote, apagar e guardar. Na lista de amigos, `FadeInDown.delay(index*25)…springify()` (`friends.tsx:171`) repete a cada visita.
- **Proposta:** háptica `success`/`warning` ao liquidar à mão, guardar e apagar; animações de entrada só na primeira montagem (o padrão do `Appear`); nada de `springify` em listas.
- **Tamanho:** S · **Prioridade:** Baixa

---

## B. Ecrã a ecrã

### B1. Início — `app/(tabs)/index.tsx`
- **Sem estado de erro** (o ficheiro nem refere `isError`). Sem rede ou com a API em baixo, o herói mostra "+0,00 €", 0 pendentes e "Recentes" vazio. **Proposta:** quando `boletinsQuery.isError` e não há cache, mostrar uma faixa "Sem ligação · a mostrar dados de HH:MM" ou um `EmptyState` com "Tentar de novo". **S · Alta**
- **Barras das 8 semanas:** as semanas a zero aparecem como traços verdes (altura mínima de 6% e opacidade de 0,25, linhas 170-180; capturas 0–1). Parece lucro pequeno. **Proposta:** semana a zero = ponto neutro `textMuted`; valor no toque (tooltip). **S · Média**
- **"Pendentes 0"** ocupa um terço da faixa de métricas quando é zero. **Proposta:** com 0 pendentes, mostrar "Odd média" ou "Melhor semana"; o mosaico só aparece quando há pendentes. **S · Baixa**
- "Recentes" repete a tab Boletins. **Proposta:** limitar a 3 e dar prioridade a "A decorrer" e "A rever". **S · Baixa**

### B2. Boletins — `app/(tabs)/boletins.tsx`, `components/boletins/BoletinCard.tsx`
- **Faixa de estado no topo** (`BoletinCard.tsx:94`, estilo `cTopBar` na 282) contradiz o comentário da linha 87 e a regra 6 do §6.1. Nas capturas 48–53 a lista fica com riscas verdes e vermelhas. **Proposta:** retirar a faixa; o `StatusPill` com ícone já chega. **S · Média**
- **Rótulos em MAIÚSCULAS** "APOSTA/ODD/LUCRO" (`BoletinCard.tsx:165`) e mercados com `toUpperCase()` (`MarketSelection.tsx:34`, `LegCard.tsx:64`, `scan.tsx:435`): o redesign decidiu "rótulos sem maiúsculas". **Proposta:** `AppText variant="label"` em caixa normal. **S · Média**
- **Botão "voltar ao topo"** (`scrollTopInner` 44 px, linha 1489) verde e circular, por cima dos cartões e a 2 cm do "+" (capturas 48, 52). Ficam dois botões verdes redondos. **Proposta:** já existe "tocar na tab volta ao topo" (§12.5), por isso remover o botão ou torná-lo uma pílula neutra "↑ Topo" no centro superior. **S · Média**
- O fundo vermelho do deslizar para apagar está à mão (`#FF3B3020`, linha 169). **Proposta:** `colors.negative` + alfa. **S · Baixa**

### B3. Detalhe do boletim — `app/boletins/[id].tsx`, `BoletimResultHero.tsx`
- O layout "talão" funciona (capturas 7 e 23). Mas as odds aparecem a dourado e o "Podia dar" está ao lado da "Aposta" com o mesmo peso. **Proposta:** odds em `textPrimary` tabular (dourado só para odds altas ou destacadas); "Podia dar" em `textSecondary` quando o boletim perdeu. **S · Baixa**
- "Partilhar imagem" como ação principal visível; "Partilhar com amigos" fica no "…". Para uso pessoal está certo. Falta a háptica ao apagar. **S · Baixa**

### B4. Novo boletim e modos — `novo.tsx`, `scan.tsx`, `por-jogo.tsx`, `confirmar.tsx`, `EditLegSheet.tsx`
- O hub está bom no código atual (screenshot primeiro). `scan.tsx` é o pior ecrã vivo em tokens: 12 cores fixas, 26 `fontSize`, gradiente `['#3DFFA2','#0FB980']` à mão (292, 460), e odds formatadas com `toFixed(2).replace('.',',')` (416, 438, 475) em vez de `formatOdds`. **Proposta:** usar `formatOdds`/`formatCurrency`, `colors.onPrimary` e o `Button` do sistema para os CTAs. **S · Média**
- Por jogo: dia selecionado a violeta, mercados em chips verdes, "Adicionar ao boletim" e "Rever boletim" com dois CTAs verdes empilhados (captura 77). **Proposta:** "Adicionar" como botão secundário; a barra "Rever boletim · N" fica como único primário. **S · Média**
- No `confirmar`, a stake vem antes do resumo e o resumo não está fixo em baixo, como o D9 previa ("resumo fixo em baixo"). **Proposta:** rodapé com odd total · retorno · Guardar. **M · Média**

### B5. Jogos — `app/(tabs)/fixtures.tsx`, `jogo/[id].tsx`, `jogo/nba/[id].tsx`, `jogo/tenis/[id].tsx`
- **Três filas de controlos** (tabs com ícone, depois ao vivo + dia + pesquisa) e ainda a pílula flutuante "Hoje" violeta (capturas 98–117). **Proposta:** juntar o ponto "ao vivo" à tira de dias como chip "Ao vivo · N"; a pílula "Hoje" só aparece quando o dia está a mais de ±1 do atual, e em cor neutra. **M · Média**
- **"FT"** em inglês nos cartões (capturas 100–113) e em `app/equipa/index.tsx:143`. **Proposta:** "Fim", "Int." e "Adiado", num mapa único em `utils`. **S · Alta**
- **NBA com cabeçalho próprio:** gradiente castanho fixo `['#3A2418','#15151C']` e brancos fixos (`nba/[id].tsx:55,68,435-444`). O ténis usa `heroFrom/heroTo` (`tenis/[id].tsx:61`) e o futebol outro herói. **Proposta:** um `MatchHero` comum para os 3 desportos (tokens hero, marcador tabular, estado). **M · Média**
- Tabela de jogadores NBA: o seletor de equipa BOS/PHI em verde cheio e colunas de 12–13 px muito juntas (capturas 24–25). **Proposta:** `SegmentedControl` neutro; primeira coluna fixa; destacar os jogadores que entram nas apostas do utilizador (props). **M · Baixa**

### B6. Análise — `app/(tabs)/stats.tsx`, `components/stats/v3/*`
- **Controlos empilhados:** período (`SegmentedControl` na 810), Personalizado + casas + "vs ano ant." (838-883) e tabs (959) têm o mesmo aspeto de pílula verde (capturas 114, 121, 144, 147). O utilizador não percebe qual é o filtro e qual é a navegação. **Proposta:** tabs Resumo · Desportos · Apostas · Hábitos como separadores sublinhados de texto, fixos ao fazer scroll; período como uma pílula "Ano ▾" no cabeçalho, ao lado do filtro; intervalo personalizado e casas dentro da folha de filtros. **M · Alta**
- **Ícones arco-íris** (`StatCard.tsx:12-20`) e o cartão "Análise IA" com a etiqueta "Gemini" e um gráfico vazio como ilustração (`AIReviewCard.tsx:157-206`) parecem um modelo genérico de dashboard. **Proposta:** ver A4; "Análise IA" como uma linha "Pedir análise" com o resultado inline, sem a marca do modelo. **S · Média**
- **Dois ícones parecidos** no cabeçalho (descarregar e partilhar). **Proposta:** um só "…" com Exportar CSV/XLSX e Partilhar imagem. **S · Baixa**
- As barras divergentes por desporto e por competição ficam centradas e quase invisíveis com valores pequenos (capturas 121–127). **Proposta:** barras ancoradas à esquerda, com o eixo zero visível e o valor à direita; ordenar por valor absoluto. **M · Média**

### B7. Explicadores — `utils/statExplainers.ts`, `app/metric-info.tsx`
- Formato inglês: `€${abs.toFixed(2)}` (linha 45), `${value.toFixed(decimals)}%` (49), "€100", "2.00x" (capturas 28–31, 73), e "boletin" nas linhas 92, 195 e 198. **Proposta:** usar `formatCurrency`, `formatPercentage` e `formatOdds`; corrigir para "boletim". **S · Alta**
- "Explica-me" e "Definição" estão como tabs em `metric-info.tsx:151`. "Prob. implícita" é jargão sem explicação. **Proposta:** "Probabilidade pelas odds" com um (i). **S · Baixa**

### B8. Perfil, Definições, Limites, Editar perfil — `profile.tsx`, `settings.tsx`, `limites.tsx`, `perfil-editar.tsx`
- O ROI do Perfil é formatado à mão com `toFixed` (`profile.tsx:118`). **Proposta:** `formatPercentage`. **S · Baixa**
- "Activo · Token" (`settings.tsx:616`) está em grafia anterior ao AO90 e o resto da app usa "Ativo" (`FriendCard.tsx:51`). **S · Baixa**
- Definições ainda é uma lista de cartões com títulos e ícones coloridos (capturas 164–167), e não as "listas agrupadas" do plano (§11). **Proposta:** `ListCard` agrupado (Aparência · Notificações · Importação · Segurança · Conta), com valores à direita e detalhe noutro ecrã. **M · Média**
- Limites (captura 163): os campos "Sem limite" parecem botões sem rótulo. **Proposta:** valor com € e um lápis. **S · Baixa**

### B9. Amigos e perfil público — `friends.tsx`, `user/[username].tsx`
- "Remover" amigo atua logo, sem confirmação (`friends.tsx:173-180`); no perfil público há `ConfirmModal` (`user/[username].tsx:184`). **Proposta:** usar o mesmo `ConfirmModal`. "Feed" → "Atividade". **S · Baixa**

### B10. Notificações — `notifications.tsx`
- Está bem no código atual (agrupado por dia). Falta a ação "Marcar todas como lidas" visível e o deslizar para apagar. **S · Baixa**

### B11. Importação PDF (antiga) — `app/boletins/import-review.tsx` (2440 linhas)
- É o pior ficheiro do repositório: 35 `fontSize`, 11 cores, 13 emojis, `borderLeftWidth: 4` (2185), que é a faixa lateral proibida, e "Stake" (997). **Proposta:** passar o PDF para o fluxo novo do `scan` (rever → `EditLegSheet`) e apagar o ficheiro. **L · Média**

### B12. Agenda — `app/boletins/agenda.tsx`
- Ecrã com emojis por desporto e cores de acento próprias (30-39), `toUpperCase()` nas secções (377), e sobrepõe-se à tab "Apostas" de Jogos. **Proposta:** absorver na tab Apostas de Jogos (o plano já propõe "Agenda dentro de Jogos") e apagar. **M · Média**

### B13. Auth e onboarding — `(auth)/*`, `onboarding.tsx`
- **Onboarding desatualizado:** "Toca em '+' no separador Boletins", "Usa o Registo Rápido" (removido a 11/11) e "O separador Estatísticas" (agora Análise) (`onboarding.tsx:41,47`). **Proposta:** 3 slides novos (Screenshot → Ao vivo → Análise) com capturas reais. **S · Alta**
- O login tem o logótipo em texto simples (`login.tsx:144`). O botão Google está à mão (`#FFFFFF`, `#DADCE0`, 320-321) e certo segundo as regras da Google, mas não tem variante escura. **S · Baixa**

---

## C. Copy (PT-PT)

| Problema | Onde | Correção |
|---|---|---|
| "Cancelado" para VOID (no resto da app é "Anulado/Anulada") | `boletins.tsx:305`, `batch-resolve.tsx:421`, `SwipeableBoletinCard.tsx:161`, `StatusFilterSheet` (captura 50) | "Anulada" (seleção) / "Anulado" (boletim); "Cancelado" só para o estado do jogo (`BoletinItem.tsx:54`) |
| "boletin" no texto visível | `utils/statExplainers.ts:92,195,198` | "boletim" |
| € à frente e ponto decimal | `statExplainers.ts:45-53,70,74,263,266` | `formatCurrency` → "10,00 €" |
| "FT" | `fixtures` (via dados), `equipa/index.tsx:143` | "Fim" |
| "Stake" vs "Aposta" vs "Valor" | `BoletinFilterSheet.tsx:111`, `import-review.tsx:997`, `ShareCard.tsx:143`; o cartão usa "Aposta" | escolher **"Valor apostado"** (rótulo) / "Aposta" (curto) |
| "Feed", "Performance" | `friends.tsx:33`; captura 123 | "Atividade", "Desempenho" |
| Onboarding e "e joga!" | `onboarding.tsx:41` | remover o incentivo; tom neutro |
| "Ganhou! 🎉" | `boletins.tsx:305` | "Marcada como ganha" |

---

## D. O que já está bem (manter)
- `HeroCard` com um número principal, `StatusPill` com ícone e texto, `SiteMark`/`TeamBadge` com logótipos reais, o talão do detalhe e a fila "A rever".
- Skeletons em 18 ecrãs; `EmptyState` sem contorno; tokens claro/escuro com contraste de `textMuted` ≥ 5:1 nas duas paletas.
- Háptica e `Pressable` com feedback em todos os toques; a barra inferior tem `accessibilityLabel` (`(tabs)/_layout.tsx:53,91`).

## E. Sequência sugerida
1. **Rápido (1–2 dias, S):** A2, B1 (erro), B13 (onboarding), C (copy), B5 "FT", B2 (faixa, maiúsculas, botão do topo), A7 (emojis).
2. **Sistema (1 semana):** A4 (acentos), B6 (controlos da Análise), A6 (acessibilidade), `MatchHero`.
3. **Estrutura (2 semanas):** A1 (tipografia), A5 (`Sheet`), Definições agrupadas, Agenda → Jogos, PDF → scan e apagar o `import-review.tsx`.
