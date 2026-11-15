# O1 — Estudo de viabilidade de odds: instruções comuns

Objetivo: para cada casa (Betclic, Betano, Lebull, Solverde, Placard), saber se é viável obter **eventos, mercados e odds** de **futebol, basquetebol (NBA e outras) e ténis**, pré-jogo e ao vivo, de forma estável, para um comparador de uso pessoal (um utilizador, baixa frequência: ~5 em 5 min pré-jogo para as próximas 48 h; ~30–60 s ao vivo só para jogos com aposta).

Regras:
- Só pedidos HTTP/WebSocket normais (como um browser faria), poucos e espaçados (≥2 s entre pedidos à mesma casa, no máximo ~40 pedidos por casa no estudo todo).
- **Não contornar proteções anti-bot** (sem plugins stealth, sem resolver captchas/desafios Cloudflare/Akamai, sem proxies residenciais para fugir a bloqueios). Se houver proteção, documentar qual é, como se manifesta e o que seria preciso — a decisão é do utilizador.
- Não usar credenciais nem sessões do utilizador.
- Histórico do repositório: houve scrapers (removidos no commit 5e3632b; ver `git show 5e3632b^:apps/api/src/services/scraper/sites/<ficheiro>.ts`, e o commit 1714b6a "API-only polling" com Kambi CDN e Betano). Ler primeiro o que já se descobriu (endpoints, problemas) e verificar se ainda funciona hoje.

Resultado: `docs/analise-2026-11/odds/<casa>.md` em PT-PT com:
1. Veredicto: **Viável / Viável com limitações / Não viável sem contornar proteções**.
2. Fonte técnica: endpoints (URL padrão, método, headers mínimos), formato, plataforma (ex.: Kambi, Altenar, própria), autenticação/geo-bloqueio, rate limits observados.
3. Cobertura medida: nº de eventos hoje/amanhã por desporto; mercados disponíveis por evento (lista de tipos, ex. 1X2, dupla hipótese, totais, ambas marcam, handicap, marcadores, cantos, cartões; ténis: vencedor, sets, jogos; basquetebol: vencedor, handicap, totais, props); profundidade (nº médio de mercados por jogo de futebol de 1.ª liga).
4. Ao vivo: como chegam as odds ao vivo (polling/WebSocket/SSE), latência aproximada.
5. Identificadores úteis para emparelhar com a ESPN (nomes de equipas, ids, hora de início, competição).
6. Exemplo real recortado de resposta (≤40 linhas) guardado em `docs/analise-2026-11/odds/samples/<casa>-*.json` (sem dados pessoais).
7. Riscos (mudanças de formato, bloqueios vistos no passado, termos) e esforço estimado do adaptador (S/M/L/XL).
