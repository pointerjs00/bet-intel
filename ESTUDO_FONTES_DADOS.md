# Estudo — fontes gratuitas de dados de futebol e ténis

Data dos testes: 10/11/2026 (madrugada em Portugal). Pedidos feitos a partir do teu PC, com IP doméstico, como pedidos normais e identificados. Os scripts e as respostas gravadas ficaram fora do repositório (pasta temporária da sessão).

**Objetivo:** ter na app, de graça e de forma fiável, os jogos com data e hora, equipas, competição, detalhes do confronto, estatísticas e acontecimentos ao vivo para:
- **Futebol:** Liga Portugal, Premier League, LaLiga, Bundesliga, Serie A, Ligue 1, Eredivisie, Süper Lig (as 8 ligas principais que a app já tem), mais Champions, Liga Europa e Conference League.
- **Ténis:** ATP e WTA 250, 500, Masters/1000 e Grand Slams.

E, com isso, enviar notificações sobre os jogos em que tens apostas e dizer se cada aposta está a ganhar ou a perder.

---

## 1. Resumo

1. **É realista e gratuito.** Quatro fontes públicas, sem chave, cobrem tudo o que pediste: ESPN, FotMob, LiveScore e a API oficial da WTA. Todas responderam com HTTP 200 e em menos de 0,5 s.
2. **Futebol:** a ESPN serve de base (calendário, ao vivo, eventos, 26 estatísticas por equipa, onzes, classificação). A FotMob acrescenta o que a ESPN não tem (xG, grandes oportunidades, momentum, mapa de remates, H2H, forma). A LiveScore fica como reserva ao vivo.
3. **Ténis:** a ESPN dá o calendário e os sets de todos os torneios 250 a Grand Slam. Os pontos do jogo em curso vêm da LiveScore e, no WTA, também da API oficial da WTA. No teste ao vivo nenhuma das duas foi perfeita sozinha, por isso a proposta usa ambas. A API da WTA dá ainda estatísticas por set. No ATP não encontrei estatísticas por encontro numa fonte aberta.
4. **Não compensa integrar os sites oficiais das ligas um a um.** Seriam 8 integrações diferentes, cada uma com o seu formato, e nenhuma resolve o ténis. Os agregadores cobrem tudo com uma integração. O da Liga Portugal, que já usas na outra app, pode entrar como extra.
5. **SofaScore e FlashScore não funcionam com pedidos normais.** A SofaScore respondeu 403 a todos os pedidos; a FlashScore exige um token interno do site. Pô-las a funcionar implica contornar proteções anti-bot, o que não testei (a política desta sessão bloqueou-o). Não são necessárias.
6. **A API-Football deve sair.** O job ao vivo faz 1 pedido por minuto (1440 por dia), e o plano grátis, que os teus documentos assumem, só dá 100 por dia.
7. **Risco principal:** são APIs não documentadas. Podem mudar sem aviso; a FotMob, por exemplo, já mudou de `/api/matches` para `/api/data/matches`. Mitigação: várias fontes com troca automática e testes de contrato. **O acesso a partir do servidor Hetzner está confirmado:** a 10/11/2026 às 02:04 UTC, as 10 verificações de `scripts/test-data-sources.sh` deram HTTP 200, em 0,08 a 0,26 s.
8. **Esforço:** um primeiro resultado útil (notificações de golos e estado ao vivo das tuas apostas de futebol) em cerca de 1,5 a 2 semanas; o conjunto completo, com ténis e o novo ecrã de Jogos, em 3 a 5 semanas.

---

## 2. Fontes testadas

| Fonte | Acesso | Resultado | Cobertura | O que traz | Veredicto |
|---|---|---|---|---|---|
| **ESPN** (`site.api.espn.com`) | Sem chave | 200 em todos os pedidos, 50–600 ms | As 8 ligas, Champions, Liga Europa, Conference League; ATP e WTA 250, 500, 1000/Masters, Grand Slams (e WTA 125) | Calendário, resultado e minuto ao vivo, 26 estatísticas por equipa, eventos com minuto e assistência, onzes com formação, comentário ao minuto, classificação. No ténis: ronda, sets e campo | **Base para futebol e calendário de ténis** |
| **FotMob** (`www.fotmob.com/api/data`) | Sem chave nem assinatura (hoje) | 200, ~20 ms | 150 competições num domingo; só futebol | 7 grupos de estatísticas (xG, grandes oportunidades, toques na área, passes, duelos, disciplina), eventos, últimos 10 H2H, onzes, momentum, mapa de remates, forma, classificação, insights | **Enriquecimento e reserva no futebol** |
| **LiveScore** (`prod-public-api.livescore.com`) | Sem chave | 200, ~40 ms | 200 competições num domingo; ATP e WTA 250–1000, Challengers | Futebol: resultado, minuto, incidências, estatísticas com xG, onzes. Ténis: sets, **pontos do jogo em curso**, quem serve | **Reserva ao vivo no futebol; pontos ao vivo no ténis** |
| **API oficial WTA** (`api.wtatennis.com`) | Sem chave (já usada para rankings) | 200, ~30 ms | Todos os torneios WTA com nível (250/500/1000/125) | Jogos por torneio com filtro ao vivo, pontos, serviço, tempo de jogo, **estatísticas por set** (ases, duplas faltas, pontos ao serviço, break points) | **Estatísticas e pontos no WTA** |
| football-data.org | Chave grátis (registo por email) | Sem chave só lista competições; os jogos dão 403 | Segundo a documentação, 12 competições no plano grátis, sem a Süper Lig | Calendário e resultados; limite de 10 pedidos/min | Alternativa oficial para calendário; não serve para ao vivo detalhado |
| OpenLigaDB | Sem chave | 200 | Só Bundesliga | Calendário e resultados | Desnecessário |
| TheSportsDB | Chave grátis "123" | Erro de ID de liga; o ao vivo é pago | Limitada | — | Descartado |
| API-Football (atual) | Chave (vazia no `.env` local) | Não consegui ver o plano | As 8 ligas | Completo | **Retirar:** o job ao vivo não cabe no plano grátis |
| SofaScore | — | **403 em todos os pedidos**, mesmo com cabeçalhos de browser | Total | A mais completa (incl. estatísticas de ténis ATP) | Exige contornar anti-bot; não testado |
| FlashScore | Token interno do site | Não testado | Total | Muito rápida | Exige contornar a proteção; não testado |
| ATP oficial (`atptour.com`) | Protegido por Cloudflare | Não testado (a app já usa Puppeteer para os rankings) | ATP | Estatísticas ATP | Não testado para não contornar a proteção |
| Sites oficiais das ligas | Varia | Não testados (ver ponto 4 do resumo) | 1 liga cada | Detalhe oficial | Só a Liga Portugal, como extra |

---

## 3. Cobertura medida

### Futebol — ESPN, fim de semana de 7 e 8 de novembro de 2026

| Competição | Jogos sáb. 7 | Jogos dom. 8 |
|---|---|---|
| Liga Portugal | 2 | 6 |
| Premier League | 4 | 5 |
| LaLiga | 4 | 5 |
| Bundesliga | 5 | 3 |
| Serie A | 4 | 5 |
| Ligue 1 | 2 | 6 |
| Eredivisie | 3 | 5 |
| Süper Lig | 4 | 4 |
| Liga Europa / Conference League | 17 / 18 (quinta, 5 de novembro) | — |

A classificação da Liga Portugal veio completa (18 equipas). Num jogo terminado (Alverca–Casa Pia) o detalhe tinha 424 KB: 26 estatísticas por equipa (cantos, cartões, remates, posse, passes, desarmes…), 25 eventos (golo aos 36' com marcador e assistência, cartões, substituições), onzes com formação (3-4-3 e 4-3-3) e 119 entradas de comentário.

**Limitação:** a ESPN não aceita intervalos de datas no futebol (HTTP 400); é preciso um pedido por dia e por competição.

### Ténis — torneios devolvidos por data

| Data | ESPN ATP | ESPN WTA | LiveScore |
|---|---|---|---|
| 25/01 | Australian Open | Australian Open, Philippine Women's Open | — |
| 11/02 | Rotterdam (500), Buenos Aires (250), Dallas (500) | Doha, Oeiras 125 | Rotterdam 500, Argentina 250, Dallas 500, Qatar 1000 |
| 10/03 | Indian Wells | Indian Wells + 2 WTA 125 | — |
| 15/04 | Munique (500), Barcelona (500) | Estugarda, Rouen, Oeiras | — |
| 17/06 | Halle (500), Queen's (500) | Berlim, Nottingham + 2 | — |
| 15/07 | Båstad, Gstaad, Umag (250) | Båstad, Atenas, Iasi + 3 | Umag, Båstad, Gstaad (250), Iasi 250, Atenas, Istambul, Kitzbühel |
| 14/10 | Xangai (Masters) | Wuhan, Maiorca, Rovereto, Lisboa | — |
| 29/10 | Viena (500), Basileia (500) | Guangzhou, Tóquio + 3 | Viena 500, Basileia 500, Tóquio 500, Guangzhou 250 + 2 |
| 10/11 | Estocolmo (250) | WTA Finals, Chennai + 1 | WTA Finals, Challengers |

A ESPN cobre todos os níveis pedidos, mas no ténis só tem sets: não tem estatísticas por encontro (0 de 62 encontros de Viena e Basileia) nem os pontos do jogo em curso.

---

## 4. Teste ao vivo

Acompanhei durante 10 minutos, com um pedido a cada 15 segundos por fonte:
- **Ténis:** Dabrowski/Stefani – Mertens/Zhang (WTA Finals, pares), no tie-break do 2.º set, em LiveScore, API WTA e ESPN.
- **Futebol:** Atlético Junior – Cúcuta (Colômbia), dos 84' ao fim, em LiveScore e FotMob. Às 01:43 UTC de uma terça-feira não havia jogos das 8 ligas a decorrer.

### Ténis (tie-break do 2.º set até ao fim)

| Ponto | API WTA | LiveScore | ESPN |
|---|---|---|---|
| Início do teste (01:43:20) | 3:3 | 2:2 (chegou a 3:3 15 s depois) | Só sets: 3-6, 6-6 |
| 4:3 | 01:45:22 | 01:45:22 | — |
| 5:3 | 01:46:23 | 01:45:37 (46 s antes da WTA) | — |
| 5:4, 6:4, 6:5 | 01:47:23, 01:47:54, 01:48:24 | **Não apareceram**: ficou em 5:3 durante 3 minutos | — |
| Fim, 7-6(5) | 01:48:54 | Retirou o encontro da lista ao vivo às 01:48:54 | "Final" às 01:49:09 |

**Conclusão:** nenhuma fonte de ténis é perfeita sozinha. A LiveScore foi mais rápida nalguns pontos, mas ficou parada 3 minutos. A API da WTA não falhou nenhum ponto, mas atrasou até ~45 s (a cache é de 30 s). A ESPN só mostra sets e confirmou o fim 15 s depois. Por isso a proposta junta as duas fontes de pontos no WTA (fica o valor mais recente) e usa a ESPN para confirmar o resultado. No ATP só há a LiveScore para pontos; se parar, os sets da ESPN continuam a atualizar. Para apostas de vencedor, sets e jogos, atrasos de 15 a 45 s não fazem diferença.

### Futebol (84' até ao fim, 3–0)

- **Minuto:** em 11 atualizações, a FotMob e a LiveScore mudaram no mesmo ciclo de 15 s ou a FotMob 15 s antes (5 vezes).
- **Golo aos 90+4':** a LiveScore mostrou-o às 01:53:12; a FotMob ainda mostrava 2–0 no fim do teste, 15 s depois.
- **Implicação:** com duas fontes, e usando a primeira que muda, o golo chega à app em 15 a 30 s. É suficiente para notificações, e semelhante ao atraso da TV e das apps das casas de apostas.
- **Detalhe para o adaptador:** o minuto da FotMob vem com caracteres invisíveis de direção de texto, que têm de ser limpos.

### Limites deste teste

- Durou 10 minutos, com um encontro por desporto. Não mede a fiabilidade ao longo de um dia inteiro de jogos.
- **A ESPN não foi testada ao vivo no futebol**, porque não havia jogos das 8 ligas a decorrer. A cache de 7 s e de 1 s sugere que é rápida, mas falta confirmar.
- Convém repetir o teste num fim de semana, com jogos das 8 ligas e a partir do servidor (itens #61 e #62).

---

## 5. Frescura e limites

| Fonte | Cache indicada pelo servidor | Leitura |
|---|---|---|
| ESPN scoreboard | 7 s | Bom para ao vivo |
| ESPN detalhe do jogo | 1 s | Bom para ao vivo |
| LiveScore | 10 s | Bom para ao vivo |
| API WTA (ao vivo) | 30 s | Atraso até ~45 s observado |
| FotMob (jogo terminado) | 1 h | Ao vivo atualiza ao minuto (ver teste) |

Nenhuma destas fontes publica limites de pedidos. Para não arriscar bloqueios, a proposta mantém um volume baixo e só acompanha ao vivo os jogos em que tens apostas ou favoritos:
- **Calendário:** 11 competições × 8 dias (hoje + 7) = 88 pedidos à ESPN por atualização. Uma vez por dia, mais um refresh por hora no dia de jogo, chega.
- **Ao vivo:** 1 pedido a cada 20 s por jogo acompanhado, cerca de 360 por jogo. Com 5 jogos ao mesmo tempo, cerca de 15 pedidos por minuto, repartidos entre fontes.
- **Enriquecimento FotMob:** 1 pedido por jogo antes do início (H2H, forma) e, opcionalmente, 1 por minuto ao vivo (xG, momentum).

---

## 6. Arquitetura proposta

```
 ESPN        FotMob       LiveScore      API WTA       (Liga Portugal, opcional)
   │            │             │              │                 │
   └────────────┴──── adaptadores: normalizam para o mesmo modelo ┘
                               │
              SportsDataService (cache Redis, troca automática se uma fonte falhar)
                               │
            Postgres: Fixture, LiveState, Incident, Stats, ids por fornecedor
                               │
   LiveTracker (job): só jogos com apostas pendentes ou favoritos, 20 s ao vivo
          │                         │                         │
  avaliação das apostas        Socket.io (app aberta)    liquidação automática
  (motor de mercados #1)                                      (#1, #3, #4)
          │
   notificações push: início, golo, "a tua aposta está a ganhar/perder", intervalo, fim
```

Pontos-chave:
- **Modelo normalizado:** o resto da app nunca sabe de que fonte veio o dado.
- **Ligação boletim ↔ jogo:** guardar o ID de cada fornecedor no item do boletim. No fluxo "Por jogo" o ID vem direto; no scan e no manual, por correspondência de nomes (já existe `nameNormalisation.ts`) com confirmação quando houver dúvida.
- **Avaliação ao vivo:** o mesmo motor que liquida as apostas (#1) passa a dizer o estado a cada atualização. Exemplos: "Mais de 2,5: 2 golos, falta 1", "Cantos mais de 9,5: 7 aos 70'", "Vencedor: perde o 1.º set, 3-2 no 2.º".
- **Ténis:** estado ao vivo da LiveScore (pontos e serviço), com a API WTA como confirmação e para estatísticas no WTA; calendário e quadro pela ESPN.

---

## 7. Esforço de implementação

| Passo | Itens do plano | Compl. | Notas |
|---|---|---|---|
| 0. Confirmar acesso a partir do servidor | #62 | S | `bash scripts/test-data-sources.sh` no Hetzner |
| 1. Camada de fornecedores (ESPN + LiveScore primeiro) | #53 | L | Começar só pelo futebol |
| 2. Ligar boletins a jogos | #54 | M | |
| 3. Job ao vivo + notificações de golo e de estado da aposta | #55, #57 | M + M | **Primeiro resultado útil (~1,5–2 semanas)** |
| 4. Avaliação ao vivo de todos os mercados | #56 | L | Depende do novo motor (#1) |
| 5. Retirar a API-Football | #58 | M | |
| 6. Ténis | #59 | L | |
| 7. Ecrã Jogos e detalhe do jogo | #60, D8 | L | Com o redesign |
| 8. Monitorização e testes de contrato | #61 | M | |
| 9. (Opcional) Liga Portugal oficial | #63 | M | A partir da tua outra app |

**Total estimado:** 3 a 5 semanas de trabalho para tudo.

---

## 8. Limitações e alternativas

- **Estatísticas de ténis ATP por encontro:** não encontrei fonte aberta (ESPN e LiveScore só têm resultados, o site ATP está protegido). Para apostas de vencedor, sets e jogos, os resultados e pontos chegam. Se precisares de ases ou break points no ATP, a SofaScore é a única opção encontrada, e exige contornar a proteção anti-bot.
- **Odds:** a ESPN traz odds da DraftKings (EUA), não das casas portuguesas.
- **Lesões e castigos:** a FotMob mostra indisponíveis nalguns jogos; não verifiquei a cobertura nas 8 ligas.
- **Se uma fonte mudar ou bloquear:** a troca automática entre ESPN, LiveScore e FotMob mantém o futebol a funcionar. No ténis, LiveScore e WTA cobrem-se para os pontos, e a ESPN mantém sempre os sets.
- **Alternativa mais "oficial":** football-data.org (chave grátis) para calendário e resultados, mas sem a Süper Lig e sem estatísticas ao vivo ricas. Só vale a pena se as APIs não documentadas falharem a partir do servidor.
