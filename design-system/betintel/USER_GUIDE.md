# BetIntel — Guia do Utilizador
## Passo a passo completo de todas as funcionalidades

> Esta guia descreve todas as funcionalidades presentes na app BetIntel. Cada secção explica como aceder ao ecrã e o que podes fazer nele.

---

## Índice

1. [Autenticação](#1-autenticação)
2. [Separadores Principais](#2-separadores-principais)
3. [Boletins — Lista Principal](#3-boletins--lista-principal)
4. [Criar Boletin](#4-criar-boletin)
5. [Detalhe do Boletin](#5-detalhe-do-boletin)
6. [Registo Rápido](#6-registo-rápido)
7. [Diário de Apostas](#7-diário-de-apostas)
8. [Resolver em Lote](#8-resolver-em-lote)
9. [Importar Histórico Betclic](#9-importar-histórico-betclic)
10. [Exportar Dados](#10-exportar-dados)
11. [Estatísticas](#11-estatísticas)
12. [Amigos & Social](#12-amigos--social)
13. [Perfil](#13-perfil)
14. [Definições](#14-definições)
15. [Notificações](#15-notificações)
16. [Onboarding](#16-onboarding)
17. [Perfil Público de Outro Utilizador](#17-perfil-público-de-outro-utilizador)
18. [Informação sobre Métricas](#18-informação-sobre-métricas)

---

## 1. Autenticação

### 1.1 Criar conta (email + password)

**Como aceder:** Abre a app → toca em **"Criar conta"** no ecrã de login.

**Passos:**
1. Preenche o **nome completo** (nome de exibição)
2. Escolhe um **nome de utilizador** — verificação de disponibilidade em tempo real (✓ = disponível, ✗ = ocupado)
3. Insere o teu **email**
4. Cria uma **password** — barra de força mostra `Fraca / Média / Forte` em tempo real
5. Repete a password no campo de confirmação
6. A checkbox "Aceito os Termos de Serviço" está activa por defeito
7. Toca em **"Criar conta"**
8. Verifica o teu email e clica no link de confirmação
9. Regressa à app e inicia sessão

---

### 1.2 Iniciar sessão (email + password)

**Como aceder:** Abre a app — o ecrã de login é o primeiro ecrã.

**Passos:**
1. Insere o teu **email** e **password**
2. Toca em **"Entrar"**
3. Em caso de erro, aparece uma mensagem genérica (por segurança, não indica qual campo está errado)
4. Após **5 tentativas falhadas**, a conta fica bloqueada 15 minutos

---

### 1.3 Iniciar sessão com Google

**Como aceder:** Ecrã de login → toca no botão **"Continuar com Google"**.

**Passos:**
1. Selecciona a conta Google no selector nativo
2. Se já tens conta BetIntel → entras directamente
3. Se é a primeira vez → aparece o **ecrã de escolha de nome de utilizador** (ver 1.5)
4. Se o email do Google coincide com uma conta existente, as duas contas são **ligadas automaticamente**

---

### 1.4 Recuperar password

**Como aceder:** Ecrã de login → **"Esqueceste a password?"**

**Passos:**
1. Insere o teu email → toca em **"Enviar link"**
2. A app mostra sempre uma mensagem de sucesso (mesmo que o email não exista — por privacidade)
3. Verifica o teu email — o link expira em **1 hora**
4. Toca no link → define a nova password
5. Inicia sessão com a nova password

---

### 1.5 Escolher nome de utilizador (novos utilizadores Google)

**Como aceder:** Aparece automaticamente quando fazes Google Sign-In pela primeira vez.

**Passos:**
1. A tua foto e nome do Google aparecem no topo como confirmação
2. Escreve o nome de utilizador desejado — verificação em tempo real (debounce 500ms)
3. Regras: 3–20 caracteres, apenas letras, números e `_`
4. Podes também alterar o **nome de exibição**
5. Toca em **"Continuar"** → és redirecionado para a app

---

## 2. Separadores Principais

A app tem **4 separadores** na barra inferior:

| Separador | Função |
|-----------|--------|
| **Boletins** (1.º) | Lista de todos os teus boletins — ecrã principal |
| **Estatísticas** (2.º) | Dashboard completo de estatísticas |
| **Amigos** (3.º) | Feed de actividade, lista de amigos, pedidos |
| **Perfil** (4.º) | A tua conta, resumo de stats, notificações, definições |

---

## 3. Boletins — Lista Principal

**Como aceder:** Separador **Boletins** (primeiro separador, ecrã de arranque).

### 3.1 Visualizar os boletins

A lista mostra todos os teus boletins em scroll infinito (carrega mais à medida que vais descendo).

Cada card mostra:
- Chip de estado (verde=ganhou, laranja=pendente, vermelho=perdeu, azul=cancelado/void)
- Data + nome opcional
- Número de selecções + odds totais
- Stake → Retorno potencial (ou real se resolvido) + P&L
- Pré-visualização de até 3 eventos

### 3.2 Filtrar e pesquisar

**Barra de pesquisa** (topo): filtra por nome do boletin, equipa, mercado ou selecção.

**Filtro rápido de estado** (pills horizontais): Pendente / Ganhou / Perdeu / Cancelado / Cashout — selecção múltipla.

**Filtro avançado** (ícone de filtro com badge de contagem):
- Intervalo de stake (€ min / € max)
- Intervalo de odds
- Intervalo de retorno
- Desporto
- Competição (multi-select)
- Equipa (multi-select)
- Casa de apostas (multi-select)
- Dia da semana
- Nº de selecções
- Intervalo de datas

**Ordenação**: por data, odds, stake ou retorno — crescente ou decrescente.

### 3.3 Acções nos cards

**Toca no card** → abre o detalhe do boletin.

**Desliza para a direita** → partilha o boletin.

**Desliza para a esquerda** → apaga o boletin (pede confirmação).

**Resolução rápida** (directamente no card, sem abrir detalhe):
- Botões WON / LOST / VOID visíveis em cada card de boletin pendente
- Resolve o boletin sem sair da lista

### 3.4 Notificações inline

No topo da lista pode aparecer uma **barra flutuante** com as notificações não lidas:
- Desliza para descartar cada notificação
- Toca no **»** para navegar para o conteúdo relacionado
- Toca em **"Ler todas"** para descartar todas de uma vez

### 3.5 Criar novo boletin

**FAB "+"** (canto inferior direito) → abre o ecrã de criação (ver secção 4).

**Pull-to-refresh**: puxa para baixo para actualizar a lista.

---

## 4. Criar Boletin

**Como aceder:** FAB "+" na lista de boletins.

### 4.1 Adicionar selecções

Cada selecção (perna) requer:
1. **Desporto** — grid de 10 desportos (futebol, basquetebol, ténis, etc.)
2. **Competição** — picker com lista por país (bandeiras), inclui hierarquia ATP/WTA/Challenger no ténis
3. **Equipa casa** e **Equipa fora** — picker com `TeamBadge`
4. **Mercado** — lista categorizada com labels legíveis (1X2, Mais/Menos, BTTS, Dupla Hipótese, Handicap, etc.)
5. **Selecção** — opções automáticas baseadas no mercado escolhido
6. **Odd** — teclado numérico dedicado

Toca em **"Adicionar selecção"** para adicionar mais pernas ao boletin acumulador.

### 4.2 Campos do boletin

- **Stake** — valor apostado em €
- **OddsCalculator** — mostra as odds totais e o retorno potencial em tempo real
- **Nome** — opcional, texto livre
- **Notas** — opcional, texto livre para registar o raciocínio
- **Casa de apostas** — slug do site (ex: "betclic")
- **Data da aposta** — seleccionável via `DatePickerField` (DD/MM/YYYY), útil para registar apostas passadas
- **Público/Privado** — toggle; se público, amigos podem ver este boletin no teu perfil
- **Freebet** — toggle para marcar como aposta gratuita

### 4.3 Projecção histórica

O card **"Projecção"** mostra, com base nos teus dados históricos, o ROI esperado para este tipo de aposta (mercado + desporto + range de odds similar).

### 4.4 Guardar

Toca em **"Guardar"** → boletin criado com estado **Pendente**.

Se tentares sair com o formulário preenchido, aparece um modal de confirmação de descarte.

---

## 5. Detalhe do Boletin

**Como aceder:** Toca em qualquer card na lista de boletins.

### 5.1 Visão geral

- **Banner de estado** (full-width, colorido): verde=ganhou, laranja=pendente, vermelho=perdeu, azul=void
- **Resumo**: Stake | Odds totais | Retorno potencial/real | ROI %
- **Lista de selecções** — cada linha mostra:
  - Ícone de resultado (✓ / ✗ / ⏳ / 🚫)
  - Match (Casa vs Fora)
  - Mercado + selecção
  - Casa de apostas
  - Valor da odd
- **Notas** — secção recolhível (só aparece se tiveres notas)
- **WinCelebration** — animação ao marcar como ganho

### 5.2 Editar boletin

Toca em **"Editar"** (ícone de lápis no cabeçalho):
- Edita nome, stake, notas, casa de apostas, data, público/privado, freebet
- **Adiciona novas selecções** com o mesmo formulário de criação
- **Edita selecções individuais** via `EditItemModal` (sport, equipas, mercado, selecção, odd, resultado)
- **Remove selecções** (com confirmação)

### 5.3 Resolver boletin

Para marcar o resultado de um boletin pendente:
1. Edita os resultados de cada selecção individualmente (WON / LOST / VOID)
2. O estado do boletin é calculado automaticamente:
   - Todas ganhas → WON
   - Pelo menos uma perdida → LOST
   - Todas void → VOID

### 5.4 Partilhar e apagar

- **Partilhar**: toca em "Partilhar" → abre o bottom sheet de partilha com amigos
- **Apagar**: toca no ícone de lixo → modal de confirmação

---

## 6. Registo Rápido

**Como aceder:** No cabeçalho da lista de boletins → ícone de relâmpago (ou atalho de teclado).

**O que é:** Formulário mínimo para registar uma aposta em ~10 segundos — ideal para entrada de dados históricos.

**Campos obrigatórios apenas:**
- Desporto
- Equipa casa + Equipa fora (campos de texto livre, sem picker)
- Mercado (6 pré-definidos + "Outro")
- Selecção (gerada automaticamente pelo mercado)
- Odd + Stake

**Campo extra:**
- **Resultado imediato** — podes seleccionar Pendente / Ganhou / Perdeu / Void logo na criação (útil para apostas já resolvidas)

O boletin é criado e resolvido numa só acção.

---

## 7. Diário de Apostas

**Como aceder:** No cabeçalho da lista de boletins → ícone de livro.

**O que vês:** Feed cronológico de todos os boletins que têm notas preenchidas.

Cada entrada mostra:
- Data + status chip
- Nome opcional
- Stake × odds → retorno/lucro
- Excerto das notas (expansível inline)

Toca num item → abre o detalhe do boletin correspondente.

**Adicionar notas a um boletin:** Abre o detalhe → Editar → campo "Notas".

---

## 8. Resolver em Lote

**Como aceder:** No cabeçalho da lista de boletins → ícone de check múltiplo.

**O que é:** Wizard de resolução de boletins pendentes um a um — útil quando tens vários resultados para registar de uma vez.

**Passos:**
1. O wizard apresenta cada boletin pendente sequencialmente
2. Para cada boletin vês: nome, stake, odds, lista de selecções
3. Toca em **WON** / **LOST** / **VOID** → resolve imediatamente e avança para o próximo
4. Toca em **SKIP** → deixa este pendente e avança
5. **Desfazer**: após resolver, tens 5 segundos para reverter (timer visível)
6. Quando todos os pendentes estão tratados → ecrã "Concluído"

O cabeçalho mostra progresso (ex: "3 / 12") e contagem de resolvidos.

---

## 9. Importar Histórico Betclic

**Como aceder:** Separador Perfil → Definições → **"Dados & Importação"** → **"Importar histórico Betclic"**.

**O que é:** Importa o teu histórico de apostas directamente de um PDF exportado do site Betclic.

**Passos:**
1. Toca em **"Importar histórico Betclic"**
2. Lê as instruções no bottom sheet (expansível):
   - Como exportar o PDF do site Betclic
   - Formato esperado (extrato de apostas)
3. Toca em **"Seleccionar PDF"** → picker de ficheiros nativo (PDF apenas, máx. 10MB)
4. O PDF é enviado para o servidor para parsing
5. Abre o **ecrã de revisão de importação**:
   - Lista de boletins detectados com expand/collapse
   - Cabeçalho: total de boletins detectados, contagem de erros
   - Badge de erro nos boletins com problemas de parsing
   - Selecciona / desselecciona individualmente
   - "Seleccionar todos" / "Desseleccionar todos"
6. Toca em **"Importar X boletins"** → os boletins são adicionados à tua conta

---

## 10. Exportar Dados

**Como aceder:** Separador **Estatísticas** → ícone de download (↓) no cabeçalho.

**Passos:**
1. Toca no ícone → aparece um alerta com opções: **CSV** / **Excel (.xlsx)** / Cancelar
2. O ficheiro é gerado com todos os boletins do período actual
   - **CSV**: uma linha por boletin (Data, Nome, Stake, Odds, Retorno, Status, Apostas)
   - **XLSX**: mesmos dados em formato Excel
3. O sistema de partilha nativo do iOS/Android abre → podes guardar ou partilhar o ficheiro

---

## 11. Estatísticas

**Como aceder:** Separador **Estatísticas** (segundo separador).

### 11.1 Controles do dashboard

**Selector de período** (linha de botões no topo):
- Esta Semana / Este Mês / Este Ano / Sempre
- **Personalizado** — activa dois campos de data (De / Até) para um intervalo personalizado

**Filtro de casas de apostas** (botão "Todas as casas"):
- Filtra todas as métricas para um ou mais sites específicos
- Toca no × para limpar o filtro

**Comparação** (botão "Comparar"):
- Compara o período actual com o período anterior equivalente
- Mostra `DeltaBadge` (↑↓ com %) em cada métrica
- Só disponível para períodos relativos (não para "Sempre" ou "Personalizado")

### 11.2 Personalizar o dashboard

**Como aceder:** Ícone de filtros (⊞) no cabeçalho → bottom sheet de personalização.

**O que podes fazer:**
- **Ocultar/mostrar secções** — toca no ícone 👁 ao lado de cada secção (riscado = oculto)
- **Reordenar secções** — toca e arrasta pelo ícone ≡ (drag handle) para a posição desejada; larga para confirmar
- **Repor** — botão "Repor" no topo volta à ordem e visibilidade por defeito

### 11.3 As 31 secções de estatísticas

Todas as secções são independentes, ocultáveis e reordináveis. Toca no ℹ em qualquer secção para ver a explicação detalhada da métrica.

#### ROI do período
Percentagem de retorno sobre investimento do período seleccionado. Verde = positivo, vermelho = negativo.

#### Total Apostado / Lucro
Dois cards lado a lado: total apostado em € e lucro/prejuízo em €.

#### Odd média (ganhas/perdidas)
Odd média das apostas ganhas vs odd média das apostas perdidas.

#### Taxa de Vitória
Anel de progresso circular com a percentagem de boletins ganhos.

#### Sequências
Sequência actual (vitórias ou derrotas consecutivas), melhor sequência de vitórias de sempre e maior sequência de derrotas.

#### Stake média por resultado
Stake médio em boletins ganhos vs perdidos — revela se apostas mais quando tens menos confiança.

#### Total boletins / Stake média
Contagem total de boletins (com breakdown de decididos/pendentes/void) e stake médio.

#### Odd média geral / Ganhos
Odd média geral de todos os boletins + rácio de boletins ganhos vs perdidos.

#### Eficiência de odds
Pontuação calculada como retorno real / retorno esperado. 100% = na expectativa, >100% = superaste o house edge.

#### Evolução P&L
Gráfico de área com P&L ao longo do tempo. Toggle de granularidade: diário / semanal / mensal. Toggle "Acumulado" para ver o saldo acumulado.

#### Tendência de ROI
Linha de ROI em janela deslizante (últimas apostas resolvidas). Toggle para ajustar a janela.

#### Por desporto
Tabela: desporto | apostas | ganhou | ROI. Toca numa linha → filtra automaticamente a lista de boletins por esse desporto.

#### Por equipa
Breakdown por equipa. Drill-through para lista filtrada.

#### Por competição
Breakdown por liga/torneio. Drill-through para lista filtrada.

#### Por mercado
Tabela por tipo de aposta (1X2, Mais/Menos 2.5, BTTS, Handicap, etc.). Drill-through para lista filtrada.

#### Por intervalo de odds
Gráfico de barras com ROI por escalão: <1.5 | 1.5–2.0 | 2.0–3.0 | 3.0–5.0 | 5.0+.

#### Por casa de apostas
Tabela com logo | apostas | ganhou | ROI por bookmaker. Drill-through para lista filtrada.

#### Por dia da semana
Win rate e ROI por dia (Segunda–Domingo). Drill-through para lista filtrada.

#### Por nº de selecções
Breakdown por simples / duplas / triplas / 4+. Compara ROI por nível de complexidade. Drill-through.

#### Freebets
Comparação: apostas com freebet vs apostas reais. Mostra o lucro limpo.

#### Calendário de actividade (Heatmap)
Calendário estilo "GitHub contributions" — cada dia colorido por P&L (verde/vermelho). Mostra padrões de apostas ao longo do ano.

#### Por faixa de stake
Histograma de apostas por escalão de stake (€0–5, €5–10, €10–25, €25–50, €50+). Win rate por escalão. Drill-through.

#### Matriz Desporto × Mercado
Tabela cruzada: desportos nas linhas, tipos de mercado nas colunas — ROI em cada célula. Identifica onde tens vantagem real.

#### Insights automáticos
Cards de insights gerados automaticamente em português. Ex: "Os teus boletins de 3+ selecções perdem 4× mais que os simples" ou "O teu ROI às sextas é -18%".

#### Calibração
Gráfico de curva de calibração: probabilidade implícita (1/odd) vs win rate real. Linha diagonal = calibração perfeita. Pontos acima = encontras valor.

#### Casa vs Fora
ROI e win rate quando apostas na equipa da casa vs equipa visitante.

#### Favorito vs Azarão
Apostas com odds < 2.00 (favorito) vs odds ≥ 2.00 (azarão). ROI e win rate por categoria.

#### Perna Assassina
Para boletins com múltiplas selecções que perdeste: qual a posição da selecção que mais vezes "matou" o boletin.

#### Por hora do dia
Distribuição das apostas pelas 24 horas. Filtro por hora específica (0–23) ou sort por ROI/Win%/Total apostas.

#### Variância / Desvio padrão
Volatilidade do teu P&L: desvio padrão por boletin + indicador (baixa/média/alta volatilidade).

#### Melhores / Piores boletins
Scroll horizontal com o boletin de maior ROI e o de maior prejuízo. Toca para abrir o detalhe.

---

## 12. Amigos & Social

**Como aceder:** Separador **Amigos** (terceiro separador).

### 12.1 Feed de Actividade (aba "Feed")

Stream de actividade recente dos teus amigos:
- Apostas registadas, resultados, etc.
- Avatar + nome de utilizador + tempo relativo ("há 2h")
- Toca num item → abre o detalhe do boletin (se for público)
- Pull-to-refresh

### 12.2 Lista de Amigos (aba "Amigos")

- **Barra de pesquisa** (mín. 2 caracteres): pesquisa utilizadores por username
- Resultados mostram `FriendCard` com:
  - Estado: "Adicionar" / "Pedido enviado" / "Já é amigo"
- Lista dos teus amigos actuais com `FriendCard`
- Toca num amigo → abre o perfil público

**Remover amigo:** Pressão longa no card ou botão no perfil público.

### 12.3 Pedidos de Amizade (aba "Pedidos")

O separador mostra um badge com o número de pedidos pendentes.

**Pedidos recebidos:**
- Card com avatar + username do remetente
- Botões inline **"Aceitar"** e **"Recusar"**

**Pedidos enviados:**
- Lista visível (podes ver que enviaste)

### 12.4 Enviar pedido de amizade

1. Na aba "Amigos", pesquisa pelo username
2. Toca em **"Adicionar"** no `FriendCard` do utilizador
3. O utilizador recebe uma notificação push

---

## 13. Perfil

**Como aceder:** Separador **Perfil** (quarto separador).

### 13.1 Card de perfil

- **Avatar** — toca para abrir `AvatarPicker` (escolher da galeria ou remover foto)
- **Nome de exibição**, **username** (@), **email**
- **Bio**

### 13.2 Editar perfil

No ecrã de perfil, edita directamente:
- **Nome de exibição** — campo de texto
- **Bio** — multiline, máx. 300 caracteres (contador visível)
- Toca em **"Guardar perfil"**

Para alterar username ou email → **Definições**.

### 13.3 Resumo de estatísticas

Linha de 3 métricas rápidas (período: Este Mês):
- ROI %
- Total Apostado
- Lucro / Prejuízo

### 13.4 Notificações no perfil

Pré-visualização das últimas 3 notificações não lidas:
- Toca numa notificação → navega para o conteúdo relacionado
- **"Ler todas"** → marca todas como lidas
- **"Ver todas as notificações"** → abre o ecrã completo de notificações

### 13.5 Atalhos

- **Definições** → `/settings`
- **Estatísticas** → separador de stats

---

## 14. Definições

**Como aceder:** Separador Perfil → ícone de engrenagem no cabeçalho, ou link "Definições".

### 14.1 Aparência

- **Tema**: Claro | Escuro | Sistema | **Agendado** (escuro entre as 22:00 e as 07:00 automaticamente)
- **Moeda**: define o símbolo de moeda exibido (ex: EUR, USD)
- **Boletins públicos por defeito**: toggle — se activo, novos boletins são públicos por defeito

### 14.2 Conta

- Mostra o teu **email** e **método de autenticação** (Email / Google / Híbrido)
- Badge de email verificado/não verificado

### 14.3 Conta Google

- **Ligar conta Google**: faz Google Sign-In → a conta fica com ambos os métodos disponíveis (conta Híbrida)
- **Desligar conta Google**: só disponível se tiveres password definida (evita bloqueio)

### 14.4 Password

**Se tens conta email + password:**
- **Alterar password**: campos para password actual + nova password + confirmação

**Se tens conta Google (sem password):**
- **Definir password**: define uma password pela primeira vez → conta torna-se Híbrida

### 14.5 Dados & Importação

- **Importar histórico Betclic**: ver secção 9 desta guia

### 14.6 Terminar sessão

- Botão "Sair" com modal de confirmação
- Invalida o token no servidor e regressa ao login

---

## 15. Notificações

**Como aceder:**
- Via bubble de notificações na lista de boletins
- Separador Perfil → link "Ver todas as notificações"
- Qualquer item de notificação → ícone de navegação

### 15.1 Centro de notificações

Lista paginada de notificações. Cada item mostra:
- Ícone colorido por tipo
- Título + corpo da mensagem
- Hora relativa ("há 5 min")
- Fundo destacado se não lida

**Toca numa notificação** → navega para o conteúdo relacionado e marca como lida.

**"Marcar todas como lidas"** — botão no cabeçalho.

### 15.2 Tipos de notificações

| Tipo | Quando aparece |
|------|----------------|
| Pedido de amizade | Alguém enviou um pedido |
| Amizade aceite | O teu pedido foi aceite |
| Boletin partilhado | Um amigo partilhou um boletin contigo |
| Resultado de boletin | Um boletin foi resolvido |
| Sistema | Mensagens da equipa BetIntel |

---

## 16. Onboarding

**Como aceder:** Aparece automaticamente na primeira vez que abres a app após criar conta.

**3 slides:**
1. **Bem-vindo ao BetIntel** — visão geral da app
2. **Criar boletin** — como registar a tua primeira aposta
3. **Estatísticas** — o que podes acompanhar

Botão "Próximo" avança os slides. No último slide, "Concluir" → redireccionado para a app. Podes tocar em "Ignorar" a qualquer momento.

---

## 17. Perfil Público de Outro Utilizador

**Como aceder:** Toca num amigo na lista de amigos, ou pesquisa um username.

**O que vês:**
- Avatar, nome de exibição, username, bio
- 3 métricas públicas: ROI, taxa de vitória, total de boletins
- Lista de boletins públicos desse utilizador (nome, estado, selecções, odds, stake, tempo relativo)
- Toca num boletin → abre o detalhe

**Acções:**
- **"Adicionar amigo"** — envia pedido de amizade
- **"Remover amigo"** — remove da lista de amigos (com confirmação)
- Estados possíveis: "Pedido enviado" (cancelável) / "Já são amigos"

---

## 18. Informação sobre Métricas

**Como aceder:** Toca no ícone ℹ em qualquer secção de estatísticas.

Abre um ecrã dedicado com:
- Título e ícone da métrica
- Explicação completa do que mede e como é calculada
- **Interpretação personalizada** (quando um valor real é passado):
  - Colorida por sentimento (positivo/neutro/negativo)
  - Exemplo contextualizado com o teu valor real
- Texto de exemplo estático ou derivado do teu valor

---

## Dicas Rápidas

- **Registo rápido**: no cabeçalho da lista → ícone de relâmpago → formulário de 5 campos
- **Resolver em lote**: no cabeçalho da lista → ícone de check múltiplo → wizard por boletins
- **Importar Betclic**: Perfil → Definições → Dados & Importação → Importar PDF
- **Exportar CSV/XLSX**: Estatísticas → ícone de download
- **Personalizar dashboard**: Estatísticas → ícone ⊞ → arrastar secções pelo ≡
- **Drill-through**: nas tabelas de estatísticas, toca numa linha para filtrar a lista de boletins por essa categoria
- **Tema automático**: Definições → Aparência → Agendado (escuro 22:00–07:00)
- **Freebet**: ao criar boletin, activa o toggle "Freebet" para rastrear apostas gratuitas separadamente
- **Apostas passadas**: usa o campo "Data da aposta" ao criar para registar apostas históricas com a data correcta
- **Notas e diário**: preenche o campo "Notas" num boletin → aparece no Diário de Apostas

---

*Versão da guia: Abril 2026 | Compatível com BetIntel para iOS e Android*