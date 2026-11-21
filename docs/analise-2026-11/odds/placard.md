# Placard (placard.pt, Santa Casa) — estudo de viabilidade de odds

Data do estudo: 2026-11-20 (medições às 00:45 UTC de 21-11). Substitui o estudo de 2026-11-15. Pedidos feitos à casa: ~32 no total (HTTP simples com headers de browser, ≥2 s entre pedidos, sem cookies nem credenciais) + 1 ligação Socket.IO de 40 s. Sem desafios anti-bot.

## 1. Veredicto: **Viável**

O "protocolo de subscrição" não existe na rede. `subscribeEvents`, `eventGroups` e `lockSubscriptions` são mensagens internas (postMessage) entre a UI do widget e o motor de dados **pt-vision**, que corre no browser (service worker ou inline). Esse motor descarrega **o catálogo inteiro da casa como uma base de dados binária replicada**, por HTTP simples a partir do CDN (Cloudflare): ficheiros `.bin` comprimidos com LZMA, num formato colunar próprio. O Socket.IO serve apenas para avisar que há um novo índice de atualização. O estudo anterior não recebia nada porque se ligava ao namespace `/`; o widget usa o namespace **`/vws`**, que envia mensagens sem pedir subscrição nenhuma.

Com ~8 pedidos (~2,2 MB comprimidos) temos **todos os eventos, todos os mercados e todas as odds** de todos os desportos. O formato foi decifrado por análise estática (o CDN publica os *source maps* do widget com o código-fonte original de `pt-vision`) e confirmado por um cliente Node que funciona.

## 2. Fonte técnica

- **Plataforma**: widget "dbx" (`sportsbook.26.8.8.0-9572117.js`) com o motor de dados `pt-vision` (pacotes `pt-vision-feed-downloader`, `-memory-decoder`, `-memory-storage`, `-feed-broadcast-service`). Os códigos de mercado (MRES, DBLC, BTSC, HCMR, HTFT…) seguem o estilo OpenBet/Playtech. Fornecedor provável: Playtech (não confirmado). **A Solverde usa o mesmo backend**: os ids de evento são iguais nas duas casas e as odds diferem (margens próprias); ver `solverde.md`.
- **Bootstrap**: `https://sportswidget.placard.pt/sportsbook.js?assetsLocation=https://sportswidget-cdn.placard.pt&apiUrl=https://sportswidget.placard.pt` responde com 302 para o bundle versionado. O motor de dados está no chunk `vision-inline-bootstrap.<hash>.js` (chunk 7646). O mapa do chunk (`/sourcemaps/vision-inline-bootstrap.<hash>.js.map`) é público e traz `sourcesContent`. O adaptador não precisa de nenhum destes ficheiros; só servem para estudar o formato.
- **Endpoints** (todos `GET`, sem auth nem cookies; o CDN devolve `Access-Control-Allow-Origin: https://www.placard.pt`; basta enviar `Origin`/`Referer` de placard.pt, mas a resposta não depende disso). Base `C = https://sportswidget-cdn.placard.pt`:
  | O quê | URL |
  |---|---|
  | Meta (estado do repositório) | `C/v2/getmeta` → `{"repositoryId":1795166563,"fullIndex":48521,"baseIndex":1,"partialIndex":49040,"upd2fullIndex":49039,"fullPartitions":5,"cultures":["pt"],...}` |
  | Base (esquema, dicionários, MarketType, OddMap) | `C/v2/getslice/{repo}_8_pt_{baseIndex}_0.bin` |
  | Full (partições 0..fullPartitions-1) | `C/v2/getslice/{repo}_2_pt_{fullIndex}_{p}.bin` |
  | Update-to-full (diferenças full → upd2full) | `C/v2/getslice/{repo}_3_pt_{upd2fullIndex}_0.bin` (se `upd2fullIndex > fullIndex`; senão `C/v2/getslice/live/{repo}/pt.bin`) |
  | Parciais (deltas, ~1 por segundo) | `C/v2/getslice/{repo}_1_pt_{i}_0.bin`, i = upd2fullIndex+1 … partialIndex |
  | Um evento completo (opcional) | `C/v2/getslice/event/full/{repo}/{fullIndex}/{eventId}/pt.bin` (não foi preciso: o full já traz todos os mercados) |
  | Descompressor | `C/library/lzma.wasm` (11 KB; opcional, ver abaixo) |
  Tipos de slice (enum `SliceType`): 1 PARTIAL, 2 FULL, 3 UPDATE_TO_FULL, 4 CUSTOM, 5 LIVE, 6 CUSTOM_JSON, 7 FULL_PARTITION, 8 BASE.
- **Compressão**: LZMA "alone" (props `5d`, dicionário 4 MB e tamanho descomprimido em uint64 LE, nos bytes 5–12). O Python `lzma` só o aceita quando o campo de tamanho é substituído por `ff…ff`. O PoC usa o `lzma.wasm` do próprio widget, com a sequência `reset()` → `newU8Array(n)` → copiar para `ptr+24` → `decode(ptr)` → `[ok, err, size, dataPtr]`. Em produção, qualquer descompressor LZMA1 de JS serve.
- **Formato descomprimido** ("memory" pt-vision, little-endian): cabeçalho de memória (tag 201, …, `maxTables` u16 no offset 11, tabela de ponteiros u32 a partir do offset 18). Cada tabela começa com a tag 203 e tem `nColumns` u16 no offset +7, os ponteiros das colunas a partir de +10 e o nome em string u16-len+UTF-8. Cada coluna começa com a tag 206: `headerLength` u16 em +5, `count` i32 em +11, `type` u8 em +15, nome em +21. Os itens vêm a seguir ao cabeçalho, com estes tipos: 0 byte, 1 bool (bitset), 2 i16, 3 u16, 4 i32, 5 u32, 6 date (u32 segundos), 7 long (u64), 10 string (i32 = offset absoluto de uma string u16-len+UTF-8). O leitor tem ~40 linhas (`mo.js` no scratch).
- **Tabelas relevantes**: `Structure(node_id, parent_node_id, node_type_id 1=desporto/2=região/3=competição, dictionary_id)`, `Event(node_id, parent_node_id, start_date, participant_home/away_dictionary_id, is_displayed, is_active)`, `Market(node_id, parent_node_id=evento, market_type_id, dictionary_id, market_handicap, is_active, is_displayed)`, `Result(node_id, parent_node_id=mercado, dictionary_id, handicap_dictionary_id, odd_map_id)`, `OddMap(id, num, den, dec = odd×1000, us)`, `MarketType(id, market_type = código de 4 letras)`, `DictionaryEntry(id, value)` (todos os textos), `AdditionalValue(node_id, key_id, dictionary_id)` + `AdditionalValueKey`, e ainda `NodesInPlayDetail` (ao vivo), `EventSmall/MarketSmall/ResultSmall` (deltas: flags e `odd_map_id`).
- **Junção dos slices**: aplicar em ordem base → full p0..p4 → update-to-full → parciais, como *upsert* por `node_id`/`id`. As tabelas `*Small` só alteram campos de nós que já existem.
- **Socket.IO** (só aviso de versão): exatamente o que o widget faz é `io("https://sportswidget.placard.pt/vws", { path: "/vws", transports: ["websocket","polling"] })`. Na rede fica Engine.IO v4 em `wss://sportswidget.placard.pt/vws/?EIO=4&transport=websocket`, seguido do pacote CONNECT ao namespace **`/vws`** (`40/vws,`). **Não se envia mais nada.** O servidor emite então o evento `message` cerca de uma vez por segundo, com `{"repositoryId":1795166563,"partialIndex":48921,"timestamp":"2026-11-21T00:43:57.09Z"}`. O cliente compara com o seu índice e descarrega as parciais em falta (o widget reconstrói tudo se faltarem mais de 50). Se o `repositoryId` mudar, recomeça do zero.
- **Geo-bloqueio / limites**: nada observado (IP PT). Os slices estão em cache no Cloudflare (`X-Proxy-Cache-Status: HIT`), por isso cada pedido é servido pelo CDN e não pela origem.

## 3. Calendário das próximas 48 h por desporto

Um único sync dá todos os desportos ao mesmo tempo: 1 `getmeta` + 1 base + 5 partições full + 1 update-to-full + N parciais. Foram **8–9 pedidos e ~2,2 MB comprimidos** (~17 MB descomprimidos). Desporto: o 1.º nível do `Structure` (`node_type_id=1`, nome do dicionário): Futebol (node 106), Basquetebol (76), Ténis (63). Os nomes vêm do dicionário em PT, por isso convém filtrar pelo node id e não pelo nome. Filtrar `Event.start_date` em [agora, agora+48 h] e `is_displayed`. Não há paginação.

Atualização a cada 10 min, de forma leve: guardar o estado em memória. Em cada ciclo, `getmeta`. Se `repositoryId` e `fullIndex` não mudaram, descarregar só o novo update-to-full (o servidor regenera-o com frequência: `upd2fullIndex` estava a 1 do `partialIndex`; tamanho ~0,25–1 MB) e as poucas parciais que faltam. Se mudaram, refazer o sync completo. Não é preciso manter o socket aberto; o `getmeta` basta.

Mercado principal (código `MarketType`): futebol `MRES` ("Resultado Final"); basquetebol `H2HT` ("Vencedor do Jogo (inc. Prolongamento)"), havendo também `MRES` em 3 vias; ténis `HTOH` ("Vencedor do Jogo").

## 4. Mercados completos de um jogo

Já estão no sync (a partição full 4, ~1,25 MB comprimida, tem ~60 mil mercados e ~370 mil seleções). `getMarkets(eventId)` não faz nenhum pedido: filtra `Market.parent_node_id = eventId`, depois `Result.parent_node_id = market.node_id`, odd = `OddMap[odd_map_id].dec / 1000`, linha = `DictionaryEntry[handicap_dictionary_id]` (ex. `"2.5"`, `"-1"`). Em alternativa existe o slice `event/full` por evento.

Os textos das seleções têm o formato `rótulo|sinal|código|ordem|`, por exemplo `{0}||1|1|` (casa), `Empate||X|2|`, `{1}||2|3|` (fora), `Mais de|+|O|0|`, `Sim||Y|1|`. `{0}`/`{1}` são substituídos pelos nomes da casa e de fora, e o **código** (`1`/`X`/`2`/`O`/`U`/`Y`/`N`/`1X`/`12`/`X2`) é ótimo para a chave canónica. A ordem das seleções na tabela é arbitrária, por isso usar o código. Os nomes dos mercados às vezes vêm em inglês (`"Third Period Over/Under 1.5"`); usar o código `MarketType`.

## 5. Cobertura medida (21-11-2026 00:45 UTC; "hoje" = dia 21 UTC)

| Desporto | Eventos nas próximas 48 h | Hoje | Com mercado principal | Média de mercados |
|---|---|---|---|---|
| Futebol | 557 | 334 | 557 | 76 |
| Basquetebol | 186 (11 NBA, NCAAB, Euroliga, ligas nacionais) | 138 | 171 | 34 |
| Ténis | 28 (ATP/WTA/Challenger) | 25 | 27 | 15 |

Total no repositório: 1 622 eventos, 98 mil mercados e 421 mil seleções (todos os desportos, incluindo ao vivo).

- **Futebol, 1.ª liga** (Liverpool–Man. United, Premier League): 150 mercados. Inclui 1X2 (`MRES`), hipótese dupla (`DBLC`), ambas marcam (`BTSC`), totais com várias linhas (`HCTG` 1.5–5.5), handicap europeu (`HCMR` ±1..±4), resultado ao intervalo (`H1RS`), intervalo/final (`HTFT`), resultado exato (`CSFT`), cantos (`CN*`), cartões, marcadores (`FGA*`, `PSA*`), totais por equipa e por parte. Primeira Liga (Benfica): 102–106 mercados por jogo.
- **Basquetebol** (OKC–Pelicans, NBA): 103 mercados. Vencedor (`H2HT`), 1X2 (`MRES`), handicaps e totais alternativos (`FTPO`, `TPOT`, `HCOT`), mercados por quarto (`T1..T4`) e por parte.
- **Ténis** (Alcaraz–Shelton): 23 mercados. Vencedor (`HTOH`), vencedor do set (`STWN`), resultado em sets (`STSC`), handicap e total de jogos (`TGHC`, `FTGO`).

## 6. Campos para emparelhar

- Nomes: `participant_home/away_dictionary_id` → texto (`"FC Porto"`, `"Sporting CP"`), mais `HOME/AWAY_PARTICIPANT_SHORT_NAME` em `AdditionalValue`.
- Hora: `Event.start_date` (UTC, segundos).
- Competição e país: caminho do `Structure`, desporto/região/competição. Ex.: `Futebol / Europa / Portugal - Primeira Liga`, `Futebol / Reino Unido / Premier League`, `Ténis / Challenger / Montevidéu - Individual`. O país vem às vezes na região, às vezes no prefixo da competição.
- **Id BetRadar: não.** Não há chave equivalente em `AdditionalValueKey` (50 chaves, entre elas `PARTICIPANT_MAPPING`, `STREAMING_CHANNEL_ID_MAP`, `VISUALISATION`). Há um **id Statscore**: `VISUALISATION = "SS|6558957"` (Liverpool–Man. United). Só serve para emparelhar entre Placard e Solverde, que de qualquer forma partilham o `node_id` do evento. Também há `PARTICIPANT_MAPPING` (`"107698|107701|"`, ids internos de equipa).
- Exemplo: `{houseEventId:"34319247", competition:"Premier League", region:"Reino Unido", home:"Liverpool", away:"Manchester United", startsAt:"2026-11-22T16:30:00Z", marketCount:150, statscoreId:"6558957"}`.

Emparelhar com a ESPN por nomes normalizados + hora (±15 min), como com as outras casas. Placard ↔ Solverde emparelham por `houseEventId` idêntico.

## 7. Prova de conceito (scratch)

`C:/Users/jbsou/AppData/Local/Temp/claude/9e8447d826d24314/3659f6cd-1a61-4dd7-bda9-8e0bb6438a98/scratchpad/study-placard/poc.js` (com `mo.js`, o leitor do formato). Uso: `node poc.js placard [--socket]` ou `node poc.js solverde`. Lista as próximas 48 h de futebol, basquetebol e ténis com o mercado principal, grava os mercados completos de um jogo por desporto em `out/<casa>/` e, com `--socket`, escuta o `/vws` durante 40 s.

As **mensagens Socket.IO exatas** são estas, e não há nenhuma subscrição. As frames são as do Socket.IO v4 padrão geradas por `socket.io-client@4.8.1`; os eventos `message` foram observados (40 em 40 s):
```
GET wss://sportswidget.placard.pt/vws/?EIO=4&transport=websocket      (Origin: https://www.placard.pt)
<- 0{"sid":"…","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}
-> 40/vws,                                   (CONNECT ao namespace /vws, sem payload)
<- 40/vws,{"sid":"…"}
<- 42/vws,["message",{"repositoryId":1795166563,"partialIndex":48921,"timestamp":"2026-11-21T00:43:57.096Z"}]   (~1/s)
<- 2 / -> 3                                  (ping/pong Engine.IO)
```
Os dados vêm só dos `GET` HTTP da secção 2.

Amostras: `samples/placard-calendar.json` (meta, mensagem do socket, contagens e eventos descodificados), `samples/placard-event-markets.json` (Liverpool–Man. United, recortado), `samples/placard-socketio-handshake.json` (estudo de 15-11).

## 8. Riscos e esforço

- Formato proprietário mas **estável e autodescritivo**: cada coluna tem nome e tipo, e o slice base inclui a tabela `TableInfo` com o esquema. Uma coluna nova não parte o leitor; uma mudança de tags ou de layout partia, mas é improvável sem mudar o prefixo `/v2/`.
- Volume: um sync completo tem ~2,2 MB comprimidos e ~17 MB em memória. Com a estratégia incremental da secção 3 fica em ~0,3–1 MB a cada 10 min. Cabe no Raspberry Pi.
- Lógica de junção: o PoC aplica os deltas `*Small` de forma simplificada. Remoções de nós e o caso de `repositoryId` mudar (recomeçar do zero) precisam de testes com dados reais.
- `live` deve vir de `NodesInPlayDetail` e não de `start_date < agora`.
- Termos de utilização não analisados. É o mesmo tráfego que o widget público faz, servido pela cache do CDN.
- **Esforço do adaptador: M.** Leitor binário (~60 linhas) + LZMA (dependência JS ou wasm) + modelo/junção + mapeamento dos ~10 códigos de mercado principais para `parseBet`. **Serve as duas casas**: Solverde = outro host (custo S).
