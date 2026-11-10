# Estudo — estatísticas para liquidar apostas e catálogo de mercados

Data: 11/11/2026 · Complementa [ESTUDO_FONTES_DADOS.md](ESTUDO_FONTES_DADOS.md)

## 1. Resumo

1. **Há uma fonte gratuita que chega para quase tudo: o resumo de jogo da ESPN** (`site.api.espn.com/.../summary?event=`), sem chave. No futebol dá 28 estatísticas por equipa, golos com marcador, assistência e minuto, cartões por jogador e parte, substituições, titulares e suplentes com estatísticas individuais, e o relato com cada canto e a parte em que aconteceu. Na NBA dá a ficha completa de cada jogador.
2. **Implementado:** o motor passou a liquidar marcadores, cartões, cantos e cartões por parte, remates, faltas, foras de jogo, handicap, props de jogadores (futebol e NBA), quartos e partes na NBA, e tie-breaks e handicap de jogos no ténis. Nos teus 59 boletins reais (185 seleções) a liquidação automática passou de **168 para 180** (97%).
3. **Ao vivo:** cada seleção tem agora quatro estados, "a ganhar" e "a perder" (se acabasse agora) e "ganha" e "perdida" (já não pode mudar). Exemplos de decisão antecipada: a linha de golos ou cantos já foi ultrapassada, o marcador já marcou, o 1.º quarto já acabou. Quando uma seleção fica decidida antes do fim, recebes uma notificação. Também passa a haver notificação de cartão vermelho.
4. **Catálogo da Betclic:** a Betclic bloqueia pedidos automáticos (HTTP 403). Contornar isso viola os termos e a política do projeto, por isso não é opção. O catálogo é aprendido com os teus próprios boletins: `GET /api/boletins/market-coverage` lista cada mercado que usaste e se é liquidado automaticamente. Para uma lista completa, a alternativa viável é uma captura manual pontual no teu browser (secção 5).

## 2. Fontes avaliadas (teste de 10–11/11/2026)

| Fonte | Futebol | Basquetebol | Ténis | Notas |
|---|---|---|---|---|
| **ESPN summary** | Estatísticas por equipa (28), golos/cartões/substituições com jogador e parte, estatísticas por jogador, relato com cantos | Ficha por jogador (MIN, PTS, REB, AST, 3PT, STL, BLK, TO), parciais por quarto | Só sets | **Fonte principal.** Já usada pelo tracker. |
| FotMob | Estatísticas por parte (1.ª/2.ª) incluindo cantos, cartões e remates; xG; jogadores | — | — | Sem chave. Útil como reserva para as partes quando o relato da ESPN falha. Não ligada ainda. |
| LiveScore | Resultado e incidências | — | Pontos ao vivo e quem serve | Já usada para os pontos do ténis. |
| API WTA | — | — | Estatísticas por set (só WTA) | Não ligada. |
| SofaScore / FlashScore / site ATP | — | — | Ases, duplas faltas, breaks | **Bloqueadas a pedidos automáticos.** Não usadas. |

**Limite que fica:** no ténis não há fonte aberta para ases, duplas faltas ou break points no ATP. Esses mercados vão para "A rever".

## 3. O que o motor liquida agora

| Desporto | Mercados | Dado usado |
|---|---|---|
| Futebol | Resultado, dupla hipótese, empate anula, intervalo/final, resultado exato, ambas marcam, par/ímpar, primeira equipa a marcar | Resultado e intervalo |
| Futebol | Totais de golos, cantos, cartões, remates, remates à baliza, faltas e foras de jogo (jogo, equipa, 1.ª/2.ª parte em golos, cantos e cartões) | Estatísticas e relato |
| Futebol | Handicap europeu e asiático (linhas inteiras e meias; as de quarto vão para revisão) | Resultado |
| Futebol | Marcador (qualquer momento, primeiro, último, golo N, 2+ e hat-trick, "marca ou assiste", "ou o seu substituto"), "marca e equipa vence", jogador vê cartão, remates/faltas/assistências do jogador | Golos, substituições e estatísticas por jogador |
| NBA | Vencedor (com prolongamento), 1X2 do tempo regulamentar, handicap, totais, totais por equipa, par/ímpar, tudo também por quarto e parte | Parciais |
| NBA | Pontos, ressaltos, assistências, triplos, roubos, desarmes, combinações (PRA…), duplo-duplo e triplo-duplo | Ficha por jogador |
| Ténis | Vencedor, resultado em sets, vencedor de set, totais de jogos e de sets, jogos por jogador, tie-break (jogo ou set), handicap de jogos e de sets, "vence pelo menos um set" | Sets |

**Regras de prudência** (na dúvida, vai para "A rever" e nunca se adivinha):
- jogador que não jogou: anulada;
- jogador que entrou depois do golo, em "primeiro marcador": revisão;
- autogolo no golo N: revisão;
- total de cartões perto da linha com vermelhos: revisão, porque as casas contam o segundo amarelo de formas diferentes;
- linhas inteiras de totais: revisão;
- prolongamento em mercados de estatísticas: revisão.

## 4. Ao vivo e notificações

- `assessLive` (futebol), `assessBasketballLive` e `assessTennisLive` devolvem dois valores: "se acabasse agora" e "já decidida".
- **"Já decidida"** usa o facto de golos, cantos, cartões, pontos e jogos só aumentarem:
  - um "mais de" já ultrapassado está ganho;
  - um "menos de" já ultrapassado está perdido;
  - um marcador que já marcou está ganho;
  - uma parte, quarto ou set terminado decide os seus mercados.
- **Notificações novas:** "✅ Seleção ganha antes do fim" e "❌ Seleção perdida", uma vez por seleção, sob a preferência de golos; e cartão vermelho, sob a preferência própria. As de golo, intervalo e fim mostram o estado de cada seleção.
- A liquidação continua a acontecer só no fim do jogo, para não ser enganada por um golo anulado pelo VAR depois de contado.

## 5. Catálogo de mercados da Betclic

| Opção | Viável? | Porquê |
|---|---|---|
| Recolha automática do site/API da Betclic | **Não** | Responde 403 a pedidos automáticos. Contornar viola os termos e a regra do projeto ("sem scrapers de odds"). |
| APIs de odds de terceiros (ex.: The Odds API, grátis até 500 pedidos/mês) | Parcial | Só mercados principais (1X2, handicap, totais). Não chega para "todas as combinações". |
| **Aprender com os teus boletins** | **Sim — implementado** | Cada boletim importado ou registado alimenta `GET /api/boletins/market-coverage`: por mercado, quantas seleções liquidam sozinhas e exemplos das que não liquidam. É a lista que importa, porque são os mercados que usas. |
| Captura manual no teu browser | Sim, pontual | Com a extensão Claude no Chrome ligada (hoje estava desligada), abrir um jogo de cada desporto e guardar a lista de nomes de mercados como ficheiro do projeto. Não é recolha automática: é ler a página como tu. |

**Combinações:** o "Cria a tua aposta" da Betclic junta mercados base com "e". O motor já trata uma seleção composta como várias pernas que têm todas de ganhar. Por isso, cobrir os mercados base cobre as combinações, sem ser preciso conhecer cada uma.

## 6. Próximos passos sugeridos

1. Ligar a FotMob como reserva das estatísticas por parte, quando o relato da ESPN não bater com o total.
2. Ligar a API da WTA para ases e duplas faltas no WTA.
3. Captura manual do catálogo da Betclic quando a extensão estiver ligada, e testes com esses nomes.
4. Mostrar o relatório de cobertura na app (Definições).
