# ESC Online (Estoril Sol Digital) — estudo de viabilidade de odds

Data: 2026-11-20. Licença SRIJ 008.

## 1. Veredicto: Não viável sem contornar proteções

Todo o domínio responde com um desafio Cloudflare gerido ("Just a moment...", `Cf-Mitigated: challenge`, HTTP 403) a pedidos HTTP normais. Pelas regras do estudo, parei ao primeiro desafio e não tentei contornar.

## 2. Fonte técnica (o que foi observado)

- `https://www.estorilsolcasinos.pt/` (curl, UA Chrome, Accept-Language pt-PT, IP doméstico PT): 403, página de desafio Turnstile/JS (`challenges.cloudflare.com`), `Server: cloudflare`, cookie `__cf_bm`.
- `https://www.esconline.pt/` e `/apostas-desportivas`: redirecionam (301) para `estorilsolcasinos.pt` e dão o mesmo 403 com desafio.
- Pedidos feitos: 3 (limite de 60 muito longe). Não foi possível ler HTML nem bundles JS, logo **plataforma do sportsbook não identificada** e nenhum endpoint de dados descoberto.
- Histórico do repositório: o scraper antigo (`git show 5e3632b^:apps/api/src/services/scraper/sites/`) só tinha Betano, Betclic, Kambi WS (Lebull), Placard e Solverde. Nunca existiu scraper da ESC Online; não há endpoints conhecidos anteriores.

## 3-6. Calendário, mercados, cobertura, emparelhamento

Não medidos: sem acesso. Eventos por desporto: 0 contados. Id BetRadar: desconhecido (não verificável).

## 7. Riscos e esforço

- Bloqueio Cloudflare gerido: exigiria browser real/stealth ou resolução de desafio, proibido pelas regras.
- Esforço do adaptador: não estimável com fiabilidade; se o sportsbook for de terceiros (ex. Kambi/Altenar/SBTech) noutro domínio sem Cloudflare, poderia ser S-M, mas isso exige descobrir o domínio por outra via (p. ex. inspecionar o site manualmente num browser do utilizador, fora do âmbito deste estudo).
- Sugestão: o utilizador abrir o site no seu browser, ver no separador Rede o domínio/API do sportsbook e reportar; só então reavaliar.

Sem amostras (`samples/esconline-*.json` não criadas por não haver dados reais).
