# Retabet Portugal (retabet.pt) — estudo de viabilidade de odds

Data do estudo: 2026-11-20/21. Só pedidos HTTP simples (36 no total, ≥2 s entre pedidos, sem credenciais, sem contornar protecções, sem desafio anti-bot em nenhum momento). Licença SRIJ 033.

## 1. Veredicto

**Viável com limitações.** O site é próprio (ASP.NET Core + React SSR, sem fornecedor externo reconhecível: não é Kambi, Altenar, SBTech, Entain nem Betradar), mas o calendário e os mercados saem em JSON/HTML limpo com pedidos simples. Limitações:

1. **Não há id BetRadar** em lado nenhum (calendário, página do jogo, JSON-LD). O emparelhamento tem de ser por nomes + hora UTC + competição (ou ESPN).
2. O calendário geral só devolve bem **o dia corrente**; o "amanhã" exige o filtro de dia (estado no servidor, não decifrado) ou páginas por liga/desporto (ver 3).
3. Os mercados completos vêm em **HTML** (fragmentos), não em JSON; é preciso um parser de HTML (simples e estável: classes `bets__wrapper`, `jqt`, `jpr`).
4. É preciso um **cookie de sessão anónimo** (um GET à home/página dá-o); sem cookie os POST dão 400.

## 2. Fonte técnica

Plataforma própria da Retabet (cookies `RETABal`, `TS01…` = F5/Akamai só como CDN/WAF; header `X-Akamai-Transformed`; sem Cloudflare). Páginas `https://www.retabet.pt/...`; CDN de imagens `cdn.retabet.pt`. Front: `desktop.js` + módulos `/js/modules/*.widget.js`; os widgets React são hidratados a partir de um JSON embutido no HTML (`data-cn='$R.Jsx.s.sportsbookDate.SportsbookDateIndex' data-cp='{...}'`).

Headers que funcionaram: `User-Agent` de Chrome, `Accept-Language: pt-PT,pt;q=0.9`, `Referer` do site; nos POST também `Content-Type: application/json; charset=UTF-8`, `X-Requested-With: XMLHttpRequest`, `Origin: https://www.retabet.pt`. **Cookies:** primeiro `GET https://www.retabet.pt/` (devolve vários `Set-Cookie`, entre eles `ug`, `dan`, `dsn`, `cbu`, `RETABal`, `TS…`); reutilizar o cookie jar. Sem cookie: HTTP 400. Sem token CSRF para estes endpoints (o `__RequestVerificationToken` só é usado em login/depósitos).

Endpoints (todos sem login):

| Pedido | Devolve |
|---|---|
| `GET /calendario` | calendário de **todos os desportos** do dia corrente, 200 eventos por página, JSON em `data-cp` (`initialData.e[]`) |
| `POST /api/sportsbookCalendarEvents/LoadPending` body `{"wpa":"CentralPanel","wpo":1,"lei":<id do último evento>,"let":"<du do último, ex. 2026-11-21T12:00:00.0000000Z>"}` | **JSON** `{eg:{e:[...200 eventos]}, lei, let, ier}`; `ier:true` / `eg:null` = fim |
| `GET /desportos/{desporto}/{id}` (futebol 1, basquetebol 5, ténis 8) | eventos de hoje+amanhã desse desporto, **máx. 80** (cortado), mesmo JSON em `data-cp` |
| `GET /desportos/futebol/{pais}/{liga}/{idLiga}` | todos os jogos dessa liga (próximos dias/semanas); o slug é ignorado (302 para o slug certo; `/futebol/inglaterra/premier-league/6` → `inglaterra-premier-league/6`) |
| `GET /desportos/{d}/{x}/{y}/{x}/{eventId}` (qualquer slug, funciona) | página do jogo: separador "Principais" já em HTML + lista de separadores (`data-tg`/`data-tb`) |
| `POST /api/sportsbookEventDetail/GetTabContent` body `{"id":"<evento>","tab":1,"tag":<tg>,"skey":"SportsbookEventDetail-<evento>"}` | HTML de um separador |
| `POST /api/sportsbookEventDetail/GetTabsContents` body `{"id":"…","tabsandtags":[{"tab":1,"tag":1024},…],"skey":"…"}` | HTML de **vários separadores num só pedido** (415 kB para 10 separadores de futebol) |

Geo-bloqueio: nenhum observado (IP PT; não testado fora). Rate limit: nenhum em 36 pedidos espaçados (sem 429). Latências boas; a página do calendário pesa ~1 MB e cada página LoadPending ~420 kB (JSON, comprime bem). Tamanhos de eventos: página de jogo 125 a 175 kB.

## 3. Calendário das próximas 48 h por desporto

- **Hoje (dia civil do servidor):** `GET /calendario` (200 eventos) + `LoadPending` em cadeia usando `lei`/`let` do último evento (paginação por cursor) até `ier:true`. Medido: 782 eventos em **3 pedidos** (1 GET + 2 POST; 3.º POST devolveu fim). Ordenado por hora, todos os desportos misturados; filtrar por `dd` (disciplina) ou `di` (id: futebol 1; ver sdi para liga). Cada evento já traz o mercado principal (`b[0]`: 1-X-2 / vencedor do jogo) e `nb` (nº de mercados).
- **Amanhã:** o filtro de dia (`Hoje / Amanhã / 23 nov`, `SelectedDay` 0/1/2) é estado no servidor (`/api/sportsbookCalendarEvents/SetFilters` + refresco do widget por `/api/render/LoadWidget`). Tentei SetFilters + LoadPending e uma chamada directa ao LoadWidget com um corpo adivinhado: **não consegui** obter o dia seguinte por aí (respostas vazias). Alternativas medidas e funcionais:
  - Ténis: `GET /desportos/tenis/8` devolve hoje+amanhã completos (17 eventos, abaixo do corte de 80). 1 pedido.
  - Futebol e basquetebol: a página de desporto corta a 80 eventos e põe ligas obscuras à frente (Japão J2, Roménia Liga 2, NCAA…), logo **não serve** para ligas top. Usar as **páginas de liga** (ids nos links do menu lateral: Premier League 6, LaLiga 1, Serie A 7, Bundesliga 8, Ligue 1 9, Primeira Liga 123, Liga dos Campeões 10, Liga Europa 11, Eredivisie 122…): 1 pedido por liga (Premier League: 20 jogos, de 21/11 a final de Dezembro). Para o comparador pessoal (ligas que a ESPN também cobre) são cerca de 10 a 25 pedidos de 10 em 10 min, ou menos se só se tocar nas ligas com jogos nesse dia.
  - Basquetebol: página `/desportos/basquetebol/5` (80 eventos, dominada por NCAA) + página da liga NBA (id 41).
- Ids de desporto (`di` e menu): futebol 1, basquetebol 5, ténis 8, andebol 12, voleibol 16, hóquei no gelo 26, futebol americano 31.

## 4. Mercados completos de um jogo

1. `GET` da página do jogo (`/desportos/.../{eventId}`): traz o separador **Principais** em HTML (24 mercados em futebol, 10 em basquetebol, 12 em ténis) e a lista de separadores `data-tg` (tag), `data-tb` (tab=1).
2. `POST /api/sportsbookEventDetail/GetTabsContents` com todos os `tag` dos outros separadores (um só pedido). Alternativa: `GetTabContent` por separador.
3. Parser: por separador `div.jbcont[data-tg]`; por mercado `div.bets__wrapper[data-mid]` com nome em `span.mt[data-fmkn]`; linhas `ul.bets__option-list`; selecção `li.jopc[data-i]` com `span.jqt` (rótulo) e `span.jpr` (odd, vírgula decimal). Mercados com linhas (mais/menos, handicap) vêm como várias `ul` dentro do mesmo `data-mid`, rótulos tipo `+ de 2,5`, `Newcastle (+0,5)`. `data-i` da selecção é um id estável útil para dedupe.
4. Separadores de futebol (tags): 1026 Principais, 1674 Suplente Estrela, 1024 Jogo, 1017 Golos, 1607/1611 Estatísticas, 1033 Jogadores, 1534 Especiais, 1008 Cantos, 1049 Equipas, 1475 1.ª/2.ª parte. Basquetebol: 1026, 1518 Pontos jogadores, 1024, 1049, 1002/1003 partes, 1009 Quartos, 1519/1520/1521/1522 props. Ténis: 1026, 1024 Jogo, 1028 Sets, 1033 Jogadores.

## 5. Cobertura medida

Calendário do dia 21/11 (servidor), todos os pedidos acima, 782 eventos únicos:

| Desporto | Eventos (dia 21/11) | Média de `nb` |
|---|---|---|
| Futebol | 357 | 64,6 |
| Basquetebol | 119 (maioria NCAA; 9 NBA) | 32,9 |
| Ténis | 20 (Challengers, BJK Cup, ATP Finals pares) | 22,8 |
| Futebol americano 98, voleibol 61, andebol 49, hóquei gelo 32, MMA 12, badminton 10, rugby 10, snooker 6, basebol 3, futsal 3, dardos 2 | | |

Hoje/amanhã por página de desporto (medido às 22 h de 20/11): futebol 80 (cortado), basquetebol 80 (cortado), ténis 17 (4+13, completo).

Mercados por jogo (soma das contagens reais de grupos de mercado após obter todos os separadores):

- Futebol, Premier League (Newcastle - Arsenal): **118 mercados**, 152 "linhas" segundo `nb`. 1-X-2, 1-X-2 com vantagem de 1/2 golos, hipótese dupla, ambas marcam, mais/menos golos (0,5 a 6,5), handicap 3 opções e asiático, empate anula aposta, 1.ª/2.ª parte, intervalo/final, resultado exacto, margem, cantos (total, equipa, 1.ª parte), remates à baliza, par/ímpar, combinados (1-X-2 + golos, + ambas), props de jogador (marcador, suplente estrela). Jogos de ligas menores: 20 a 60 linhas.
- Basquetebol, NBA (Denver - Houston): **38 mercados** (vencedor, handicap, total e por equipa, quartos, 1.ª/2.ª parte, par/ímpar, props de jogador: pontos, ressaltos, assistências, roubos, blocks, triplos, combinados). NCAA e ligas menores muito menos.
- Ténis, Challenger (Trotter - Mayo): **34 mercados** (vencedor, vencedor set, mais/menos jogos e por set/jogador, handicap jogos e sets, resultado em sets, ganhar um set, vencedor + total de jogos, par/ímpar). Jogos de pares: ~6.

Média de mercados: futebol 55 (sport page) / 64,6 (calendário) linhas por jogo; basquetebol 33; ténis 23.

## 6. Campos para emparelhar

Por evento no JSON do calendário (nomes de campos curtos):

| Campo | Significado |
|---|---|
| `i` | id do evento Retabet (ex. 38784300) |
| `d` | "Casa - Fora" (separador " - "); `p[]` com `{i, n, h}` (n = nome, h = é a casa) |
| `du` | início UTC ISO (`2026-11-21T17:30:00Z`); `ts` hora local, `lds` data extensa |
| `dd` / `di` | desporto (nome, id) |
| `scd` / `sdd` / `sdi` | país ("Inglaterra") / competição ("Inglaterra Premier League", prefixa o país) / id da competição (Premier League 6) |
| `nb` | nº de linhas de mercado do jogo |
| `il` | ao vivo |
| `b[]` | mercados do calendário: `{i, md (nome), o:[[{i, t (rótulo), p (odd "2,18")}]]}` |
| `ei`, `ed`, `ci`, `cd` | `ei/ed` sempre `null` (nenhuma referência externa); `ci/cd` = canal de streaming (ex. DAZN) |

**id BetRadar: não.** Nenhum campo, atributo nem JSON-LD contém `betradar`/`sportradar`/id numérico externo (a única referência é um link genérico para o widget `ls.sir.sportradar.com/retabet/pt` no rodapé, sem id de jogo). O id `38784300` é interno da Retabet. Nomes: tendem a ser os oficiais ingleses para ligas top ("Newcastle", "Manchester City"), mas com variantes ("Mar�timo - CD Nacional", "CD Santa Clara") e nomes de ténis completos, pares como "M. Arevalo / M. Pavic". Competições com país como prefixo. Exemplos em `samples/retabet-calendar.json`.

## 7. Riscos e esforço

Riscos:
- Sem id BetRadar: dependência de emparelhamento por nomes e hora (já existente no comparador via ESPN).
- Mercados em HTML: o parser depende de classes CSS (`bets__wrapper`, `jqt`, `jpr`) e de `data-fmkn`; mudanças de front quebram-no. O JSON do calendário (`data-cp`, `LoadPending`) parece mais estável, mas os nomes de campos são minificados.
- "Amanhã" no calendário geral não resolvido (estado no servidor); soluções por liga custam mais pedidos.
- Cookie de sessão necessário (renovar quando devolver 400); WAF Akamai/F5 por trás: sem desafio visto com ritmo ≥2 s, mas não testado em volume.
- Nomes de mercado em PT próprios da Retabet ("Marcam ambas as equipas", "Mais/menos golos" com rótulos `+ de 2,5`), é preciso mapear para as chaves canónicas de `parseBet`.
- Cobertura: 1-X-2 e vencedor sempre presentes no calendário; basquetebol sem NBA/Europa fica atrás de NCAA na página de desporto.

Esforço do adaptador: **M**. Calendário (cookie + `/calendario` + `LoadPending`, JSON): fácil. Mercados (HTML via `GetTabsContents` + parser + mapeamento de nomes e linhas): médio. Se for preciso o dia seguinte para futebol/basquetebol via páginas de liga: acrescenta uma lista de ligas e alguns pedidos (S). Decifrar o filtro de dia (SetFilters + render) é opcional e poderia tirar esse extra.

Amostras: `samples/retabet-calendar.json` (3 eventos de calendário: futebol, basquetebol, ténis) e `samples/retabet-markets-football.json` (7 mercados do jogo de futebol, já convertidos do HTML pelo parser do estudo).
