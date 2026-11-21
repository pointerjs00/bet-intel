# Solverde (solverde.pt) — estudo de viabilidade de odds

Data do estudo: 2026-11-20 (medições às 00:45 UTC de 21-11). Substitui o estudo de 2026-11-15. Pedidos feitos à casa: ~10 (HTTP simples com headers de browser, ≥2 s entre pedidos, sem cookies nem credenciais) + 1 ligação Socket.IO de 40 s. Sem desafios anti-bot.

## 1. Veredicto: **Viável**

Usa a mesma plataforma que o Placard (motor de dados `pt-vision`), e o mesmo cliente funcionou só com a troca do host. O catálogo inteiro (eventos, mercados e odds) é descarregado por HTTP do CDN em slices binários LZMA. O Socket.IO (`/vws`, namespace `/vws`) só avisa novos índices e não precisa de subscrições. Protocolo, formato e PoC: ver `placard.md`.

## 2. Fonte técnica

Plataforma partilhada: ver `placard.md` (secções 2 e 7). Específico da Solverde:

- **Hosts**: API/socket `https://sportswidget.solverde.pt` (socket `wss://sportswidget.solverde.pt/vws/?EIO=4&transport=websocket`, CONNECT a `/vws`), CDN/dados `https://sportswidget-cdn.solverde.pt` (`/v2/getmeta`, `/v2/getslice/...`, `/library/lzma.wasm`). Origin `https://www.solverde.pt`.
- Widget `sportsbook.26.6.9.0-455fdff.js` (mais antigo que o do Placard, 26.8.8), mas com o mesmo formato `/v2` e os mesmos tipos de slice. O PoC funcionou sem alterações.
- Meta observada: `{"repositoryId":1794382932,"fullIndex":980895,"baseIndex":1,"partialIndex":981704,"upd2fullIndex":981704,"fullPartitions":5,"cultures":["pt"]}`. O repositório e os índices são próprios (não é uma cópia do do Placard).
- Socket: mensagens `message` `{"repositoryId":1794382932,"partialIndex":981732,"timestamp":"2026-11-21T00:45:13.76Z"}`, ~1 por segundo (57 em 40 s).
- **Mesmo backend que o Placard**: 556 dos 557 eventos de futebol têm o mesmo `node_id` nas duas casas, mas as **odds do mercado principal diferem em 538 de 556** (margens próprias; ex. Keciorengucu 1.73 no Placard vs 1.70 na Solverde). Vale a pena comparar as duas.
- Geo-bloqueio/limites: nada observado. O age-gate/splash do site não afeta o CDN.

## 3. Calendário das próximas 48 h

Igual ao Placard: 1 sync (7 pedidos, **2,5 MB** comprimidos) dá todos os desportos, com atualização incremental a cada 10 min (`getmeta` + update-to-full + parciais). Desportos: Futebol, Basquetebol, Ténis no 1.º nível do `Structure`. Mercados principais: `MRES` (futebol), `H2HT` (basquetebol), `HTOH` (ténis).

## 4. Mercados completos de um jogo

Já vêm no sync, sem pedidos extra (ver `placard.md` §4). A Solverde tem às vezes mais mercados que o Placard: OKC–Pelicans tem **270** mercados (mercados de jogador `PLBL`, `PLPA`, `TPLP`…) contra 103 no Placard. Norwich–Cardiff tem 153.

## 5. Cobertura medida (21-11-2026 00:45 UTC)

| Desporto | Eventos nas próximas 48 h | Hoje | Com mercado principal | Média de mercados |
|---|---|---|---|---|
| Futebol | 557 | 333 | 557 | 77 |
| Basquetebol | 186 | 138 | 171 | 37 |
| Ténis | 28 | 25 | 27 | 14 |

Total no repositório: 1 655 eventos, 105 mil mercados e 410 mil seleções. Tipos de mercado: os mesmos códigos do Placard (futebol: `MRES`, `DBLC`, `BTSC`, `HCTG`, `HCMR`, `DNOB` "empate anula", `HTFT`, `CSFT`, cantos, cartões, marcadores; ténis: `HTOH`, `STWN`, `STSC`, `TGHC`, `FTGO`).

## 6. Campos para emparelhar

Iguais aos do Placard: nomes (dicionário), `start_date` UTC, caminho desporto/região/competição, id Statscore (`VISUALISATION "SS|<id>"`). **Sem id BetRadar.** Entre Placard e Solverde o emparelhamento é direto pelo `houseEventId` (mesmo `node_id`). Com a ESPN, por nomes + hora.

## 7. Exemplos

- `docs/analise-2026-11/odds/samples/solverde-calendar.json` (calendário descodificado, meta e mensagem do socket)
- `docs/analise-2026-11/odds/samples/solverde-event-markets.json` (mercados de Norwich–Cardiff, recortados)
- `docs/analise-2026-11/odds/samples/solverde-socketio-handshake.json` (estudo de 15-11, só o handshake)

## 8. Riscos e esforço

Os mesmos do Placard. A versão do widget é diferente (26.6.9 vs 26.8.8), por isso uma futura mudança de formato pode chegar às duas casas em alturas diferentes. Convém que o adaptador valide as tags e as colunas e falhe de forma isolada. **Esforço: S** sobre o adaptador do Placard (só muda a configuração de host e Origin). Um único adaptador parametrizado serve as duas casas.
