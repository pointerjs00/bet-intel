# O1 — Estudo de viabilidade do comparador de odds (15/11/2026)

Estudo por casa, só com pedidos normais (sem stealth, captchas, proxies nem credenciais), a partir de um IP doméstico em Portugal. Detalhe em [odds/](odds/); exemplos reais em [odds/samples/](odds/samples/).

## Resumo

| Casa | Veredicto | Como se obtêm as odds | Cobertura medida | Ao vivo | Esforço |
|---|---|---|---|---|---|
| **Betclic** | Viável com limitações | API gRPC-web interna (`offering.begmedia.com`, `MatchService`), paginada a 100 jogos; HTML SSR como alternativa fraca | Futebol 896, basquetebol 161 (inclui NBA), ténis 188; 130–300 mercados por jogo de futebol (16 grupos: 1X2, dupla hipótese, totais, ambas marcam, handicap, resultado exato, marcadores) | Stream de atualizações de odds | M |
| **Betano** | Viável com limitações | API JSON interna (`/danae-webapi/...`) | Ao vivo: 104 eventos (futebol 22, basquetebol 26, ténis 10), só ~5 mercados por jogo; pré-jogo só "em destaque" por liga; página do evento com 16 de ~148 mercados | Polling do overview ao vivo | M (ao vivo) / L (calendário completo) |
| **Placard** | Não viável hoje | Deixou o Kambi; widget proprietário por Socket.IO (`sportswidget.placard.pt/vws`). Ligação aberta, sem anti-bot, mas o formato de subscrição não é conhecido | Não medida | Socket.IO | L/XL (a primeira das duas) |
| **Solverde** | Não viável hoje | Mesmo widget que a Placard (`sportswidget.solverde.pt/vws`) | Não medida | Socket.IO | S depois da Placard |
| **Lebull** | Por estudar | O pedido de estudo foi bloqueado pelo classificador de permissões (extrair a chave de integração da plataforma a partir da página) | — | — | — |

## Riscos comuns

- **APIs internas sem documentação:** podem mudar sem aviso (Betano já mudou desde abril; o Kambi da Placard/Solverde desapareceu).
- **IP do servidor:** só foi testado o IP doméstico. O histórico mostra que a Betano bloqueava o IP do Hetzner (WAF) e a Betclic teve problemas de TLS/JA3 e 403 no passado. Antes de construir, é preciso repetir os testes **a partir do VPS**.
- **Termos de utilização:** as casas proíbem normalmente a recolha automática. Uso pessoal e baixa frequência reduzem o risco, mas não o eliminam (o risco prático é bloqueio do IP).
- **Emparelhamento:** nenhuma casa dá o id da ESPN. Betclic: nomes PT + hora de início; Betano: nomes + `betRadarId`.

## Recomendação

1. **Começar só com Betclic** (a casa onde apostas, a melhor cobertura e esforço M), em paralelo com o modelo canónico (O2). O ecrã do evento (O4) e as múltiplas (O5) funcionam já com uma casa e ganham colunas à medida que as outras entram.
2. **Betano como segunda casa** se o teste a partir do VPS passar; senão, só a partir de um proxy residencial (decisão tua, tem custo).
3. **Placard + Solverde:** precisa de capturar a subscrição Socket.IO numa sessão real do browser (podes fazê-lo tu nas DevTools, ou autorizas-me a usar o teu Chrome com a extensão). Um só adaptador serve as duas.
4. **Lebull:** decidir se autorizas o estudo da plataforma (ver acima).
