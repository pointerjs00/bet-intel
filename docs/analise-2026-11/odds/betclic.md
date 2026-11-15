# Betclic Portugal (betclic.pt) — estudo de viabilidade de odds

Data do estudo: 2026-11-15. Só pedidos HTTP normais (curl/fetch do Node, User-Agent de Chrome genérico, sem cookies de utilizador, sem stealth, sem proxies). Cerca de 24 pedidos à Betclic no total, espaçados ≥2 s.

## 1. Veredicto

**Viável com limitações.**

Hoje a Betclic **não bloqueia** pedidos simples: a página HTML (SSR) e a API gRPC-web de oferta (`offering.begmedia.com`) respondem 200 sem cookie, sem token e sem desafio anti-bot. A conclusão do repositório ("Betclic bloqueia automação") refere-se aos scrapers com Puppeteer e à fase 2025/26 (ver secção 7). As limitações são: formato protobuf sem schema público (tem de ser descodificado/mantido à mão), API interna não documentada (pode mudar sem aviso) e termos de utilização da casa (não verificados/avaliados aqui; a decisão de uso é do utilizador).

## 2. Fonte técnica

Plataforma própria (Angular SSR, "Front.Sport.Desktop 10.7.0-1", infraestrutura AWS CloudFront). Sem Kambi/Altenar.

Descoberta no `ng-state` (script JSON embebido na página) e no bundle `main-*.js`:
- `grpcOfferingUrl`: `https://offering.begmedia.com/web/offering.access.api`
- Serviços no bundle: `MatchService`, `SearchService`, `SportMenuService`, `BetslipService`, `MyCombiService`.
- `MatchService` (todos server-streaming exceto os indicados): `GetMatchWithNotification`, `GetMatchesByCompetitionWithNotifications`, `GetMatchesBySportWithNotifications`, `GetMatchCalendarWithNotifications`, `GetLiveMatchesWithNotifications`, `GetOutrightMarketsWithNotifications`, `GetMatchesByMultiCompetitions`, `GetLiveCount(WithNotifications)`, `GetMatchBySport` (unário; devolve `grpc-status 12 UNIMPLEMENTED` hoje).

### Duas vias que funcionam sem autenticação

**A) HTML SSR (mais simples, só 20 jogos por página):** `GET https://www.betclic.pt/futebol-sfootball` (também `/basquetebol-sbasketball`, `/tenis-stennis`; `/futebol-s1` dá 301 para esta). Resposta 200, ~400–520 KB, que traz `<script id="ng-state" type="application/json">` com a resposta gRPC já em JSON com nomes de campo legíveis (`matches[]`, `market.mainSelections[].odds`, `competition`, `contestants`, `scoreboard`, `openMarketCount`, `totalCount`). Só os 20 primeiros jogos (ordenados: ao vivo primeiro). Headers mínimos: User-Agent de browser + `Accept-Language: pt-PT`. O servidor emite cookies `bc-device-id` e `BC-TOKEN` (JWT anónimo de 7 dias, `plt=DESKTOP`, `rzn=PT`), mas não é necessário reenviá-los.

**B) gRPC-web direto (cobertura total, ao vivo por stream):**
```
POST https://offering.begmedia.com/web/offering.access.api/offering.access.api.MatchService/GetMatchesBySportWithNotifications
content-type: application/grpc-web+proto
x-grpc-web: 1
x-bg-ref-brand: BETCLIC   x-bg-ref-platform: DESKTOP
x-bg-ref-regulator-zone: PT   x-bg-regulation: PT
origin/referer: https://www.betclic.pt
```
Corpo: frame gRPC (5 bytes: `0x00` + comprimento BE) + protobuf. Mensagem de pedido extraída do bundle (`GetMatchBySportRequest`): `1 sport_code` ("football"/"basketball"/"tennis"), `2 market_type_code` (opcional), `3 language` ("pt"), `4 offset`, `5 limit` (o servidor limita a **100** por pedido; paginação por `offset` funciona). `GetMatchWithNotification`: `1 matchId (int64)`, `2 language`. Ver `samples/betclic-grpcweb-request.txt`.

Resposta: `application/grpc-web` binário. Primeiro frame = snapshot (100 jogos ≈ 67 KB em ~170 ms); frames seguintes = notificações de alteração de odds; fecha com trailer `grpc-status: 14 "A task was canceled"` (normal, o stream é cancelado do lado do servidor). Não vi limites de taxa nem 429 em ~24 pedidos. Não precisa de cookie (testado sem). Sem geo-bloqueio visível a partir de Portugal (POP CloudFront LIS); fora de PT não testado.

O formato binário não tem schema público; os nomes de campo dos ficheiros de amostra foram **inferidos** por comparação com o JSON do SSR e com o bundle (que contém os descritores protobuf-ts, dos quais se pode extrair o schema completo de forma determinística).

### Proteções anti-bot
- **Pedido simples (curl, fetch Node): sem bloqueio, sem challenge, sem CAPTCHA no tráfego de oferta.** O HTML só referencia hCaptcha (site keys) para registo/login (`hcaptchaSiteKey`), `ffm.betclic.pt` (fingerprint de dispositivo) e TrustCommander; nada disto foi exigido para ler ofertas.
- Histórico: em 2026-03 o repo registou que `https.request` a `offering.begmedia.com` "pendurava a ligação (JA3/TLS fingerprinting)" e que `fetch` no browser falhava por CORS (commit `985286e`). Hoje, o `fetch` do Node 24 (undici) funciona sem problemas. Ou a proteção foi aliviada, ou aquele sintoma tinha outra causa (proxy próprio do scraper `proxy-chain`, cookies, versão TLS). Não foi possível confirmar qual; é um risco de regressão (a Betclic pode reativar filtragem por fingerprint TLS/IP a qualquer momento). Se acontecer, descrever e deixar a decisão ao utilizador; **não contornar**.

## 3. Cobertura medida (2026-11-15, domingo, ~17:50 UTC)

Totais (`totalCount` do SSR): futebol 896, basquetebol 161, ténis 188 (inclui ao vivo).

Futebol, 9 páginas de 100 (900 jogos) por data UTC de início: 15/11 ≈ 242 (hoje, inclui ao vivo), 16/11 = 0 (segunda sem jogos no feed), 17/11 = 76, 18/11 = 22, 20/11 = 70, 21/11 = 170, 22/11 = 128, 23–28/11 ≈ 112, até 06/12. O feed vai muito além das 48 h. Ordenação por prioridade, não por data (misturada), logo é preciso paginar tudo e filtrar por `matchDateUtc`.

Basquetebol: amostra de 100 → 94 hoje, 6 amanhã; **NBA presente** (também ACB, Bundesliga, Serie A, ligas menores). Ténis: ATP, WTA, Challengers, qualificações e pares presentes (80 devolvidos na primeira página de 250 pedidos; 74 hoje, 6 amanhã).

Mercados (campo `openMarketCount` por jogo = nº de mercados/linhas abertos): Liga Portugal 2 = 131; LaLiga 2 = 265; Liga das Nações = 222–309; séries C italianas ≈ 108–124; Argentina 2.ª = 95; ACB basquetebol = 437; ténis Challenger 49–301. Média de futebol de 1.ª/2.ª liga ≈ 130–300 linhas.

Mercados devolvidos no detalhe de um jogo (Leixões–Chaves, `GetMatchWithNotification`, 16 grupos): Resultado (tempo regulamentar), Resultado duplo (dupla hipótese), Total de golos acima/abaixo (linhas 0,5 a 4,5+), Total de golos por equipa, As duas equipas marcam, ambas marcam ou acima de 2,5, Resultado handicap (-3 a +3, 3 vias), Resultado correto, Marcador / marcador ou substituto / marcador + substituto, Um dos jogadores marca, Equipa a marcar o golo N, "Equipa tem 2 golos de vantagem ou vence". Cantos e cartões não apareceram neste jogo (podem existir noutras abas/jogos; não verificado). A lista principal do SSR só traz o mercado principal (1X2 / vencedor); tabs de mercado por desporto: ténis `ten_rsm` (vencedor), "ambos vencem pelo menos um set", total de jogos; basquetebol `bkb_rsm2w` (vencedor), `bkb_rsm3w`, `bkb_oum` (total de pontos). Props de jogadores/handicap de basquetebol e sets/jogos de ténis existem no detalhe (não decodificados exaustivamente).

## 4. Ao vivo

O próprio endpoint `GetMatchesBySportWithNotifications` é um **stream gRPC-web**: depois do snapshot chegam frames de ~44–230 bytes com a nova odd por seleção (`marketId`, `selectionId`, `odd`, `status`, `matchId`), observado durante 4–8 s com alguns eventos/segundo ao vivo. Latência: primeiro byte ~170 ms; atualizações de odds a chegar em ~0,3 s a 5 s de intervalo. Existe também `GetLiveMatchesWithNotifications` (stream só de ao vivo; não testado). O snapshot inclui `scoreboard` (período, pontuação por período) para ao vivo. Estratégia realista para o comparador: poll de snapshot por `matchId` (`GetMatchWithNotification`, abrir/ler primeiro frame/cancelar) a cada 30–60 s para os jogos com aposta, ou manter 1 stream aberto por jogo.

## 5. Identificadores para emparelhar com a ESPN

- `matchId` (string numérica longa, ex. `1276069290184704`), `contestants[].contestantId` e `name`/`shortName` **em português** (ex. "Bielorrússia", "Albânia", "Leixões"), `matchDateUtc` (ISO UTC com 7 casas decimais, preciso ao minuto), `competition.id`/`name` com prefixo de país em PT (ex. "Espanha - LaLiga 2", "Itália - Serie C Girone A", "Liga das Nações", "Nitto ATP - Finais Pares"), `competition.sport.code`, `countryCode`.
- `widgets[].sportradarWidget.externalMatchRef` (id Sportradar) e `contestantVisual` (logos em `dam.begmedia.com/offering/images/contestants/*.png`).
- Sem id ESPN. Emparelhamento = normalização de nomes de equipa (PT↔EN/ESPN, mapa de aliases) + hora de início ±30 min + competição. Ténis: nomes "Apelido Nome" e pares "A / B"; basquetebol: nomes com prefixo/sufixo ("F." para feminino).

## 6. Amostras (em `samples/`)

- `betclic-match-list.json` — excerto do SSR (jogo + mercado 1X2).
- `betclic-match-detail.json` — mercados de um jogo decodificados do gRPC-web (totais, handicap).
- `betclic-stream-update.json` — frames de atualização ao vivo decodificados.
- `betclic-grpcweb-request.txt` — pedido mínimo.

## 7. Riscos e histórico

- O repo tinha `betclicScraper.ts` (2883 linhas, Puppeteer + stealth + proxy-chain, scraping de DOM + interceção de gRPC-web), `betclicLiveWatcher.ts` e `browserSiteScraper.ts`; foram removidos no commit `5e3632b` (2026-04-06) por serem "frágeis (proteções anti-bot, proxies)". Sintomas no código: deteção de HTTP 403 / "Error 403", "please try again in a few minutes", código `0x2005002` (página de bloqueio do CloudFront/WAF da Betclic), e a nota de 2026-03-23 sobre JA3. Hoje nenhum destes surgiu com pedidos simples, mas só testei a partir de um IP residencial português, ~24 pedidos.
- Endpoints antigos reaproveitáveis: `GetMatchWithNotification` (igual hoje) e `offering.begmedia.com`.
- `apps/api/src/services/betclicApiService.ts` usa um endpoint **privado autenticado** (histórico de apostas do utilizador) com o token dele; não é necessário para odds e não foi usado.
- Risco de formato: gRPC-web/protobuf interno, versão de front "10.7.0-1"; os números de campo podem mudar a cada release (mitigar extraindo o schema do `main-*.js` ou lendo o JSON do SSR). Risco de termos de utilização e de reativação de anti-bot (WAF por fingerprint TLS/IP) a qualquer altura. `X-BG-*` headers são obrigatórios na prática (replicar).
- Cuidar do volume: 5 pedidos/5 min pré-jogo e 1 por 30–60 s ao vivo é compatível com o que um browser faz.

## 8. Esforço do adaptador

**M** (via A: SSR JSON, só 20 jogos/desporto, esforço S mas cobertura fraca; via B: cliente gRPC-web com schema protobuf extraído do bundle + paginação + stream ao vivo + normalização de nomes PT→ESPN, esforço M; emparelhamento de mercados 1X2/totais/BTTS/handicap/ténis/basquetebol aumenta para M/L se se quiser cobertura total de mercados).
