# Solverde (solverde.pt) — estudo de viabilidade de odds

Data do estudo: 2026-11-15. Pedidos feitos: ~14 (HTTP simples, >=2 s entre pedidos, sem credenciais).

## 1. Veredicto: **Não viável hoje (sem decifrar um protocolo proprietário); a via Kambi do histórico está morta**

Mesma plataforma e conclusão que o Placard (as duas casas partilham o mesmo widget). Sem bloqueio anti-bot visto.

## 2. Fonte técnica

Plataforma partilhada: ver `placard.md`. Específico da Solverde:

- **Domínios**: `https://www.solverde.pt`; widget em `https://sportswidget.solverde.pt/sportsbook.js?assetsLocation=https://sportswidget-cdn.solverde.pt&apiUrl=https://sportswidget.solverde.pt` -> 302 -> `sportsbook.26.6.9.0-455fdff.js` (1,7 MB; versão mais antiga que a do Placard, 26.8.6). Existem também `sportswidget-preview[-cdn].solverde.pt`.
- **Não é Kambi**: o bundle só tem a referência CSS "KambiBC"; sem `kambicdn`. Teste `eu-offering-api.kambicdn.com/offering/v2018/{solverde,sbsolverde}/...` -> 429 (inconclusivo); `ubsolverde` -> 400. Código de operador Kambi: não confirmado.
- **Pre-fetch antigo morto**: `https://sportswidget-cdn.solverde.pt/pre-fetch?locale=pt_PT&page=soccer&type=DESKTOP` -> 200 text/html (12 KB), não JSON.
- **Socket.IO**: `https://sportswidget.solverde.pt/vws` — handshake EIO=4 OK por polling e websocket, sem auth, Origin `https://www.solverde.pt`; sem push sem subscrição. Protocolo não decifrado.
- Página `/apostas/sports/soccer/matches/today`: HTTP 200, 332 KB, sem desafio anti-bot. O scraper antigo tinha de fechar um splash/age-gate (`button.splash-enter`).
- Diferenças de mercados vs Placard: não medidas (o scraper antigo reportava ~167 vs ~166 eventos de futebol, catálogo equivalente, provavelmente mesmo fornecedor).

## 3. Cobertura medida

Não medida (sem feed). Ver `placard.md`.

## 4. Ao vivo

Socket.IO push se decifrado; latência não medida.

## 5. Identificadores para ESPN

Iguais aos do Placard (id de evento, nome "Casa - Fora", competição, hora ISO); emparelhar por nomes normalizados + hora.

## 6. Exemplo

`docs/analise-2026-11/odds/samples/solverde-socketio-handshake.json`.

## 7. Riscos e esforço

Os mesmos do Placard. Como o widget é partilhado, **um único adaptador serviria as duas casas** (mudam domínio/versão). Esforço: **L/XL** para o primeiro, **S** para o segundo.
