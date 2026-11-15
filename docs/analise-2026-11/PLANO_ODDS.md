# Comparador de odds — plano para as 5 casas

15/11/2026 · Base: [ESTUDO_ODDS.md](ESTUDO_ODDS.md) e os relatórios em [odds/](odds/).
Objetivo: ver, em cada jogo de futebol, basquetebol e ténis, as odds da **Betclic, Betano, Lebull, Placard e Solverde** lado a lado, ao estilo da app da Betclic. Saber qual casa paga mais em cada seleção. Montar múltiplas e comparar a odd total por casa.

Tamanho: S ≤ ½ dia · M 1–2 dias · L 3–5 dias · XL > 1 semana.

---

## 1. Princípios

1. **Uma casa nunca parte as outras.** Cada casa tem um adaptador isolado, com o seu próprio agendamento, limites e estado de saúde. Se uma falha, o ecrã mostra as outras e marca essa como "indisponível".
2. **Compara-se só o que se sabe que é igual.** Cada seleção de cada casa passa pelo analisador de mercados que já liquida as apostas (`parseBet` em `marketResolutionEngine.ts`, mais os motores de ténis e basquetebol). Daí sai uma **chave canónica**, por exemplo `FT.1X2.HOME`, `FT.TOTAL.OVER.2.5` ou `FT.BTTS.YES`. Duas casas só aparecem na mesma linha quando a chave é igual. O que não se reconhece aparece na mesma, mas só na coluna dessa casa. Bónus: tudo o que se compara é também liquidável automaticamente.
3. **O jogo âncora é o da ESPN**, que já é a base da liquidação e do ecrã Jogos. Cada evento de cada casa liga-se a um jogo ESPN pela competição, pela hora (±30 min) e pelos nomes (`teamNamesMatch` e aliases PT). Jogos fora da ESPN agrupam-se entre casas pelo `betRadarId` (quando existe) ou pelos nomes e hora, e aparecem só na lista do comparador.
4. **Pouco tráfego.** Calendário de 10 em 10 min, só para as próximas 48 h e só nas competições cobertas. Mercados completos só quando abres um jogo ou quando ele está numa múltipla em construção (cache de 60 s). Ao vivo de 30 em 30 s, só com o ecrã aberto ou com aposta. Nada de pedidos em massa.
5. **Sem contornar proteções anti-bot.** Se uma casa bloquear o servidor, ou se passa a recolha por um proxy (decisão tua, com custo), ou essa casa fica de fora.
6. **Começa sem migração.** As odds atuais e as ligações evento↔jogo vivem no Redis com TTL. Postgres só entra na fase de odds de fecho/CLV (fase 8), depois de alinhar o drift do schema (#24).

## 2. Arquitetura

```
apps/api/src/services/odds/
  types.ts            OddsSource, SourceEvent, SourceMarket, CanonicalSelection
  canonical.ts        (casa, mercado, seleção, linha) → chave canónica, via parseBet
  matcher.ts          SourceEvent → jogo ESPN ou grupo entre casas
  store.ts            Redis: odds:{casa}:{evento}, odds:link:{casa}:{evento}, odds:health:{casa}
  compare.ts          junta as casas por chave; melhor odd; múltipla por casa
  sources/
    betclic/          cliente gRPC-web + schema protobuf gerado a partir do bundle
    lebull/           JSON (betting-platform), tenant id lido da config pública
    betano/           JSON danae-webapi + initial_state das páginas
    sportswidget/     Placard e Solverde (mesmo widget, um adaptador, dois hosts)
apps/api/src/jobs/oddsCatalogueJob.ts   calendário 48 h por casa (Bull, de 10 em 10 min, lock por casa)
apps/api/src/routes/oddsRoutes.ts       /api/odds/...
```

**Contrato de cada adaptador (`OddsSource`):**
- `listEvents(sport, from, to)` devolve `SourceEvent[]`: id da casa, competição, nomes, início em UTC, ids extra (`betRadarId`…), estado ao vivo.
- `getMarkets(eventId)` devolve `SourceMarket[]`: rótulo do mercado, rótulo da seleção, linha, odd, suspenso.
- `health()` devolve o último sucesso e a última falha. Reaproveita o `providerHealth.ts` do #61, incluindo a notificação ao fim de 10 falhas seguidas.

**API:**
- `GET /api/odds/events?sport&date` devolve a lista de jogos com o mercado principal (1X2 ou vencedor): melhor odd, casa e nº de casas.
- `GET /api/odds/events/:key` devolve o jogo com os mercados agrupados por separador (Top, Resultado, Golos, Marcadores, Handicap, Cantos, Cartões, Jogadores; ténis: Jogo, Sets, Jogos; basquetebol: Jogo, Pontos, Handicap, Quartos, Jogadores). Cada seleção traz as odds por casa, com a melhor marcada.
- `POST /api/odds/multiple` recebe `{ selections: [{ eventKey, selectionKey }] }` e devolve, por casa, a odd total, as pernas em falta e a melhor casa.

**App:**
- **Jogos:** cada jogo ganha uma linha com o 1X2 e a melhor odd (com logótipo). Há um filtro "Com odds".
- **Ecrã do evento ao estilo Betclic:** cabeçalho do jogo; separadores; pílulas por categoria; cartões de mercado com botões de seleção. Cada botão mostra a melhor odd e o logótipo da casa. Um toque abre uma folha com as 5 casas, ordenadas. Um toque longo junta a seleção à múltipla.
- **Múltipla (comparador):** uma barra fixa em baixo com o nº de pernas e a melhor odd total. Abre uma tabela casa × pernas com o total por casa. "Registar nesta casa" abre o Confirmar já preenchido, com as odds dessa casa.
- **Separação:** o comparador é um ecrã novo (`app/odds/[key].tsx` e `app/odds/multipla.tsx`). O detalhe ESPN atual (`/jogo/[id]`) fica para estatísticas e ao vivo, e ganha um botão "Odds".

## 3. Fases

| # | Fase | Inclui | Depende de | Tam. |
|---|---|---|---|---|
| 0 | Pré-requisitos | Merge da fase de bugs; resultado do `probe-odds.sh` no servidor; captura do protocolo da Placard (DevTools); atualizar `AGENTS.md` §0 e `CONTEXTO` (as odds voltam, com regras) | — | S |
| 1 | Núcleo sem casas | `types`, `canonical` (com testes a partir de rótulos reais das 5 casas, das amostras do estudo), `matcher` (testes com jogos ESPN gravados), `store`, `compare`, rotas com uma fonte falsa | 0 | L |
| 2 | Betclic | Schema protobuf gerado a partir do bundle; cliente gRPC-web (paginação de 100, detalhe por jogo); testes de contrato com respostas gravadas; job de calendário | 1 | M–L |
| 3 | Ecrãs | Linha de odds em Jogos; ecrã do evento ao estilo Betclic; folha das 5 casas. Funciona já só com a Betclic | 2 | L |
| 4 | Lebull | Adaptador JSON; tenant id lido da config pública em cada arranque; `timestamp` em vez de `date` | 1 | S–M |
| 5 | Múltiplas | Store da múltipla na app; `POST /odds/multiple`; ecrã da tabela; "Registar nesta casa" a abrir o Confirmar preenchido | 3 | M |
| 6 | Betano | Adaptador: ao vivo pelo overview; pré-jogo pelas páginas de liga (`initial_state`) e pelo evento (16 mercados). Se o servidor for bloqueado: decisão sobre o proxy | 1, teste no servidor | M–L |
| 7 | Placard + Solverde | Cliente Socket.IO do widget, a partir da captura; um adaptador, dois hosts | 1, captura | L (S para a 2.ª) |
| 8 | Odds de fecho e CLV | Guardar a última odd antes do início, por seleção apostada e por casa (migração). CLV nas estatísticas: "apostaste a 2,10, fechou a 1,95" | 2, drift #24 | M |
| 9 | Alertas (opcional) | "A odd desta seleção subiu acima de X" e "a melhor casa mudou" para seleções marcadas | 3 | M |

**Ordem:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Com a fase 5 feita, a app já tem o comparador completo com 2 casas (Betclic e Lebull). As fases 6 e 7 acrescentam colunas sem mexer nos ecrãs.

**Esforço total:** cerca de 4 a 6 semanas de trabalho, com subagentes como na fase de bugs (cada fase é um plano com tarefas, revisão por tarefa e revisão final).

## 4. Testes e qualidade

- **Adaptadores:** respostas reais gravadas em `__fixtures__`, como nos testes da ESPN, e um teste de contrato por casa. Uma mudança de formato falha no teste e não em produção.
- **Chave canónica:** tabela de rótulos reais por casa → chave esperada. Por exemplo, "Resultado (Tempo Regulamentar) / Espanha", "Resultado Final / 1" e "1X2 / Casa" dão todos `FT.1X2.HOME`.
- **Emparelhamento:** jogos reais da ESPN contra eventos de cada casa, incluindo os casos difíceis: seleções, nomes PT/EN, "Sporting CP" vs "Sporting", ténis com nomes abreviados.
- **Saúde em produção:** `GET /api/odds/health` por casa, e push ao fim de 10 falhas seguidas.

## 5. Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| A casa muda a API | Essa coluna desaparece até corrigir | Testes de contrato, alerta de saúde, adaptador isolado |
| O servidor é bloqueado (Betano já foi) | Casa indisponível | Teste prévio; proxy só com o teu OK; ficar sem essa casa |
| Mercados com nomes ambíguos | Comparação errada | Só se compara pela chave canónica; o resto aparece sem comparação |
| Termos das casas | Bloqueio da conta ou do IP | Uso pessoal, pouco tráfego, nenhum pedido autenticado |
| Manutenção | Tempo contínuo | Ecrã de saúde e a prioridade da Betclic (onde apostas) |

## 6. Decisões que preciso de ti

1. **Resultado do teste no servidor.** Decide se a Betano (e a Betclic) correm diretamente no VPS.
2. **Proxy residencial.** Se o servidor for bloqueado: pagar um proxy (~5–15 €/mês) ou deixar essa casa de fora?
3. **Captura da Placard.** Consegues fazê-la nas DevTools? (Instruções no estudo.)
4. **Mercados da primeira versão.** Proposta: todos os que o `parseBet` já reconhece (1X2, dupla hipótese, totais, ambas marcam, handicap, resultado exato, intervalo/final, marcadores, cantos, cartões; ténis e NBA como na liquidação). O resto aparece sem comparação.
