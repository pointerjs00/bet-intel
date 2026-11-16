# O1 — Estudo de viabilidade do comparador de odds (15/11/2026)

Estudo por casa, só com pedidos normais (sem stealth, captchas, proxies nem credenciais), a partir de um IP doméstico em Portugal. Detalhe em [odds/](odds/); exemplos reais em [odds/samples/](odds/samples/).

## Resumo

| Casa | Veredicto | Como se obtêm as odds | Cobertura medida | Ao vivo | Esforço |
|---|---|---|---|---|---|
| **Betclic** | Viável com limitações | API gRPC-web interna (`offering.begmedia.com`, `MatchService`), paginada a 100 jogos; HTML SSR como alternativa fraca | Futebol 896, basquetebol 161 (inclui NBA), ténis 188; 130–300 mercados por jogo de futebol (16 grupos: 1X2, dupla hipótese, totais, ambas marcam, handicap, resultado exato, marcadores) | Stream de atualizações de odds | M |
| **Betano** | Viável com limitações | API JSON interna (`/danae-webapi/...`) | Ao vivo: 104 eventos (futebol 22, basquetebol 26, ténis 10), só ~5 mercados por jogo; pré-jogo só "em destaque" por liga; página do evento com 16 de ~148 mercados | Polling do overview ao vivo | M (ao vivo) / L (calendário completo) |
| **Placard** | Não viável hoje | Deixou o Kambi; widget proprietário por Socket.IO (`sportswidget.placard.pt/vws`). Ligação aberta, sem anti-bot, mas o formato de subscrição não é conhecido | Não medida | Socket.IO | L/XL (a primeira das duas) |
| **Solverde** | Não viável hoje | Mesmo widget que a Placard (`sportswidget.solverde.pt/vws`) | Não medida | Socket.IO | S depois da Placard |
| **Lebull** | **Viável** | Sportsbook próprio (iframe `lebullpt-ssr.boxwebcdn.work`); API JSON `betting-platform.prod.sbteam.xyz` com o header `X-Auth-Tenant-Id` lido da configuração pública do front (estudo autorizado pelo utilizador) | Futebol 654 eventos (~30 tipos de mercado, ~194 seleções por jogo da Primeira Liga; sem cantos, cartões nem marcadores nas amostras), NBA 8 (45 tipos, sem props), ténis 158 (3–13 tipos) | Polling HTTP a 1 s (como o site) | S–M |

## Teste a partir do servidor (Hetzner, Nuremberga, 15/11/2026 20:08 UTC)

| Pedido | Resultado |
|---|---|
| Betclic gRPC-web (`offering.begmedia.com`) | **200 OK** (a via que o adaptador usa) |
| Betclic HTML SSR | 403 (não é precisa) |
| Betano JSON ao vivo e página de liga | **403**, nos dois |
| Placard e Solverde, handshake Socket.IO | 200 OK |
| Lebull, página `www.lebull.pt` | **451** "Unavailable For Legal Reasons", bloqueio geográfico (servidor na Alemanha) |
| Lebull API `betting-platform.prod.sbteam.xyz` | **200 OK** (29 KB) — o bloqueio 451 é só do site, não da API |

Leitura: o servidor está na Alemanha, e as casas com licença portuguesa bloqueiam IPs de fora de Portugal (451 explícito na Lebull; o 403 da Betano é provavelmente o mesmo, somado ao WAF já visto em abril). A Betclic (via gRPC), a Lebull (API), a Placard e a Solverde respondem do servidor. **Só a Betano precisa de sair por um IP português.**

## Riscos comuns

- **APIs internas sem documentação:** podem mudar sem aviso (Betano já mudou desde abril; o Kambi da Placard/Solverde desapareceu).
- **IP do servidor:** só foi testado o IP doméstico. O histórico mostra que a Betano bloqueava o IP do Hetzner (WAF) e a Betclic teve problemas de TLS/JA3 e 403 no passado. Antes de construir, é preciso repetir os testes **a partir do VPS**.
- **Termos de utilização:** as casas proíbem normalmente a recolha automática. Uso pessoal e baixa frequência reduzem o risco, mas não o eliminam (o risco prático é bloqueio do IP).
- **Emparelhamento:** nenhuma casa dá o id da ESPN. Betclic: nomes PT + hora de início; Betano: nomes + `betRadarId`.

## Recomendação

1. **Começar só com Betclic** (a casa onde apostas, a melhor cobertura e esforço M), em paralelo com o modelo canónico (O2). O ecrã do evento (O4) e as múltiplas (O5) funcionam já com uma casa e ganham colunas à medida que as outras entram.
2. **Betano como segunda casa** se o teste a partir do VPS passar; senão, só a partir de um proxy residencial (decisão tua, tem custo).
3. **Placard + Solverde:** precisa de capturar a subscrição Socket.IO numa sessão real do browser (podes fazê-lo tu nas DevTools, ou autorizas-me a usar o teu Chrome com a extensão). Um só adaptador serve as duas.
4. **Lebull:** viável e simples; segunda casa a entrar (o campo `date` vem com 4 h de desfasamento; usar `timestamp`).

## Placard/Solverde — tentativa de captura no browser (15/11/2026)

Com autorização do utilizador, no Chrome dele: a página de evento é `https://www.placard.pt/apostas/sports/soccer/events/<id>` (ex. 34739366, Espanha–Inglaterra). Os sockets visíveis na página (`wss://oapi.placard.pt/socket.io/1/...`, Socket.IO 0.9) só trocam heartbeats e o keep-alive do chat. As odds chegaram sem pedidos XHR/fetch visíveis e sem mensagens em `WebSocket`, `Worker`, `MessagePort` ou `BroadcastChannel` do contexto principal (ganchos instalados depois do carregamento). Conclusão: o canal de odds foi aberto antes dos ganchos ou dentro de um worker. **Próximo passo:** captura manual nas DevTools (Network → filtro WS, que também mostra sockets de workers → abrir `vws` → separador Messages → abrir um jogo e copiar as primeiras mensagens enviadas e recebidas).

## Teste a partir do Raspberry Pi em casa (16/11/2026 03:10 UTC)

| Pedido | Pi (Linux, OpenSSL) | PC na mesma rede (Windows, Schannel) |
|---|---|---|
| Betclic SSR e gRPC-web | 200 OK | 200 OK |
| Betano JSON ao vivo e página de liga | **403** (IPv4; o Pi não tem IPv6) | **200** |
| Solverde handshake | 200 OK | — |
| Placard handshake | erro de DNS no Pi (por confirmar) | — |
| Lebull site e API | 200 OK | — |

**Leitura:** o PC e o Pi saem pelo mesmo IP português de casa, mas só o Pi é bloqueado. A Betano bloqueia pela assinatura do cliente (TLS/HTTP), não pelo IP. Contornar isso (imitar a assinatura de um browser) é exatamente o tipo de contorno de proteção anti-bot que as regras do comparador excluem. **Por isso a Betano fica de fora**, a não ser que surja uma via oficial. As outras quatro casas mantêm-se.
