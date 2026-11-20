# Estudo de viabilidade de odds — fase 2 (novas casas licenciadas)

Data: 2026-11-20. Casas com licença SRIJ de apostas desportivas ainda sem adaptador: Bwin, ESC Online, Casino Portugal, GoldenPark, Retabet, Placard e Solverde (estas duas com o protocolo por decifrar). Moosh, Luckia e Nossa Aposta estão suspensas no SRIJ e ficam de fora.

## Objetivo

Para a casa atribuída, saber se dá para obter, de forma estável, **eventos, mercados e odds pré-jogo** de **futebol, basquetebol e ténis** das próximas 48 h, para o comparador de uso pessoal da BetIntel (um utilizador; o calendário é lido a cada 10 min e os mercados completos de um jogo só quando o utilizador o abre).

## Regras (obrigatórias)

- Só pedidos HTTP/WebSocket normais, como um browser faria: `fetch`/`curl` com headers de browser comuns (User-Agent, Accept, Accept-Language pt-PT, Origin/Referer do site). Nada de stealth, resolução de captchas, proxies, credenciais ou sessões do utilizador. Não usar o Chrome do utilizador.
- Poucos pedidos e espaçados: ≥ 2 s entre pedidos à mesma casa, no máximo ~60 pedidos à casa no estudo todo. Ler JavaScript público do site (bundles) para descobrir endpoints é permitido e, muitas vezes, o caminho mais rápido.
- O PC sai por um IP português doméstico. Se a casa responder com desafio anti-bot (Cloudflare "Just a moment", DataDome, Akamai 403 com página de desafio), registar e parar: não contornar.
- Não alterar código da app, não fazer commits. Escrever só os ficheiros indicados abaixo.
- Ficheiros temporários (scripts, respostas em bruto) no diretório scratch indicado no pedido, nunca no repositório.

## Contexto técnico útil

- Contrato do adaptador: `apps/api/src/services/odds/types.ts` (`OddsSource.listEvents(sport, fromIso, toIso)` → `SourceEvent[]`; `getMarkets(houseEventId, hint?)` → `SourceMarket[]`). Ver os adaptadores existentes em `apps/api/src/services/odds/sources/betclic/` e `.../betano/` como referência.
- O que mais importa no calendário: nomes das equipas/jogadores, hora de início (UTC), competição e país, **id BetRadar se existir** (é o que junta as casas quando a ESPN não tem o jogo; procurar campos como `betRadarId`, `betradarId`, `sportradar`, `brMatchId`, `externalId`, links `sir.sportradar.com/.../match/<id>`), o mercado principal (1X2 / vencedor) já no calendário, e o número de mercados do jogo.
- Plataformas conhecidas no mercado PT: Entain/CDS (bwin), Altenar, Kambi, SBTech, Sportradar/Betradar UOF, GAN, Playtech, Kaizen. Identificar a plataforma costuma dar logo os endpoints.
- Estudos anteriores (formato a seguir): `docs/analise-2026-11/odds/lebull.md` (bom exemplo de "Viável") e `placard.md`.

## Resultado

1. `docs/analise-2026-11/odds/<casa>.md` em PT-PT com:
   1. Veredicto: **Viável / Viável com limitações / Não viável sem contornar proteções**.
   2. Fonte técnica: plataforma; endpoints exatos (URL, método, query, headers mínimos que funcionaram), formato, autenticação/tokens públicos e de onde vêm, geo-bloqueio, limites observados.
   3. Como listar o calendário das próximas 48 h por desporto (futebol, basquetebol, ténis): ids de desporto, paginação, quantos pedidos são precisos.
   4. Como obter os mercados completos de um jogo.
   5. Cobertura medida: nº de eventos hoje/amanhã por desporto; tipos de mercado num jogo de 1.ª liga de futebol, num de ténis e num de basquetebol; nº médio de mercados.
   6. Campos para emparelhar (nomes, hora, competição, país, id BetRadar sim/não, com exemplo).
   7. Riscos e esforço estimado do adaptador (S/M/L/XL).
2. Amostras reais recortadas (≤ 60 linhas cada, sem dados pessoais) em `docs/analise-2026-11/odds/samples/<casa>-*.json`: uma do calendário e uma dos mercados de um jogo.
