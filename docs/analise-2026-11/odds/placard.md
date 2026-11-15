# Placard (placard.pt, Santa Casa) — estudo de viabilidade de odds

Data do estudo: 2026-11-15. Pedidos feitos: ~14 (HTTP simples, >=2 s entre pedidos, sem credenciais).

## 1. Veredicto: **Não viável hoje (sem decifrar um protocolo proprietário); a via Kambi do histórico está morta**

Não há bloqueio anti-bot visto, mas o pre-fetch "Kambi CDN" usado antes já não devolve dados e a plataforma atual **não é Kambi**. Passaria a "Viável com limitações" se se aceitar decifrar o protocolo Socket.IO (esforço L/XL).

## 2. Fonte técnica

- **Já não é Kambi.** O widget atual (`sportsbook.26.8.6.0-4bc2ef0.js`, 2,1 MB) é uma app React/Redux sobre um framework próprio ("Mojito"/"dbx"), com streams Statscore e Perform. A única menção a "KambiBC" no bundle é um seletor CSS de compatibilidade. Não há referências a `kambicdn`/`offering` no HTML nem no JS.
- Bootstrap: `https://www.placard.pt/apostas/sports/soccer/matches/today` (HTTP 200, 63 KB, sem desafio) carrega `https://sportswidget.placard.pt/sportsbook.js?assetsLocation=https://sportswidget-cdn.placard.pt&apiUrl=https://sportswidget.placard.pt` (302 para o ficheiro versionado no CDN).
- **Pre-fetch antigo morto**: `https://sportswidget-cdn.placard.pt/pre-fetch?locale=pt_PT&page=soccer&type=DESKTOP` devolve **200 text/html** (fallback SPA, 8,6 KB), não JSON. O fallback do commit `1714b6a` já não rende nada.
- **Kambi offering API genérica** (`eu-offering-api.kambicdn.com/offering/v2018/<operador>/listView/football.json?lang=pt_PT&market=PT`): testei `placard` e `stplacard` -> **429** (rate limit do CDN, inconclusivo; não insisti). Como o widget não usa Kambi, não é de esperar que funcione para o Placard. Código de operador Kambi: não confirmado.
- **Transporte de dados**: Socket.IO (Engine.IO v4) em `https://sportswidget.placard.pt/vws` (`broadcastUrl = apiUrl + /vws`). Verificado: handshake por polling e por websocket funcionam sem cookies nem auth (`pingInterval 25000`, `maxPayload 1000000`, ligação aceite com Origin `https://www.placard.pt`). **O servidor não emite nada até receber subscrições**; o protocolo de subscrição vive num worker/wasm do widget (mensagens internas `subscribeEvents`, `eventGroups`, `lockSubscriptions`) e não foi decifrado. Decifrá-lo exige capturar tráfego numa sessão de browser real (não feito, para não usar o Chrome do utilizador, que pode ter sessões).
- `${apiUrl}/event`, `/subscribe`, `/utils/calculate-odds` etc. são endpoints do **talão/apostas** (autenticados), não um feed de odds.
- Geo-bloqueio: não observado. Rate limits: nenhum visto nos pedidos feitos. `robots.txt`: `Disallow:` vazio.

## 3. Cobertura medida

**Não medida** (nenhum feed de eventos obtido). O scraper antigo reportava ~166 eventos de futebol, mas era via Puppeteer + STOMP da versão anterior do widget (agora substituída por Socket.IO). Basquetebol/ténis: existem páginas (`/apostas/sports/basketball|tennis/matches/...`), sem dados medidos. Mercados por evento: não medidos.

## 4. Ao vivo

Socket.IO push (sem polling). Latência não medida. Se o protocolo for decifrado, seria o melhor modo ao vivo.

## 5. Identificadores para emparelhar com a ESPN

Do scraper antigo (formato STOMP anterior, a reconfirmar): `id`, `name` ("Casa - Fora"), `typeName` (competição), `className` (desporto), `startTime` ISO, `countryCode`. Emparelhar por nomes normalizados + hora de início (±15 min), como o histórico fazia.

## 6. Exemplo

`docs/analise-2026-11/odds/samples/placard-socketio-handshake.json` (handshake e URLs; não há payload de odds).

## 7. Riscos e esforço

- Formato proprietário e versionado (v26.8.6), sem documentação; qualquer release pode partir o parser.
- Histórico: Puppeteer + stealth era frágil e foi removido; reintroduzir stealth contraria as regras do estudo.
- Termos de utilização não analisados.
- **Esforço do adaptador: L/XL** (capturar protocolo, cliente Socket.IO, mapear mercados), sem garantia de estabilidade. Alternativas: entrada manual/screenshot (já existe) ou agregador licenciado.
