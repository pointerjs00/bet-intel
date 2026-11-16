# Ecrãs do comparador de odds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar na app as odds já recolhidas (tab Odds, ecrã de odds do jogo, folha das casas), montar uma múltipla com a odd total por casa e registá-la no Novo boletim na casa escolhida.

**Architecture:** Pequena alteração aditiva na API (texto original por casa em cada linha comparada; múltipla até 30). Na app: lógica pura em `utils/odds/` (testada com node:test), uma store Zustand nova para a múltipla (`oddsSlipStore`), hooks React Query em `services/oddsService.ts`, componentes em `components/odds/` e duas rotas novas (`app/odds/[key].tsx`, `app/odds/multipla.tsx`). O registo converte a múltipla em itens do `boletinBuilderStore` existente e abre o Confirmar.

**Tech Stack:** API: Express + TypeScript + node:test. Mobile: Expo Router, React Query v5, Zustand (persist + AsyncStorage), `StyleSheet` + tokens v2.

**Spec:** `docs/superpowers/specs/2026-11-16-odds-ecras-design.md` (ler antes de cada tarefa; prevalece sobre este plano).

## Global Constraints

- PT-PT em todo o texto visível; odds com vírgula e 2 casas (`1,90`); euros como `84,10 €`.
- Sem NativeWind: `StyleSheet` + `useTheme()`/tokens v2; reutilizar `AppText`, `SegmentedControl`, `Chip`, `BottomSheet`, `EmptyState`, `Skeleton`, `SiteMark`, `TeamBadge`, `Pressable`, `ConfirmModal`, `useToast`.
- Casas = `HouseId` da API: `'betclic' | 'betano' | 'lebull' | 'placard' | 'solverde'` (iguais aos `siteSlug`). Nunca lista fixa de casas nos ecrãs: usar as casas que a API devolve.
- Ordem de desempate/apresentação: `HOUSE_ORDER = ['betclic','lebull','betano','placard','solverde']`.
- Múltipla: máximo **30** seleções; **uma por jogo** (`eventKey`); só linhas com `key` não nula.
- Odd suspensa nunca é "melhor"; botão sem preço válido mostra "—" e fica desativado.
- Registo usa o **texto original da casa** (`labels[house].market` / `.selection`) e `prices[house].odds`.
- API: `npm test` em `apps/api` (registar ficheiros novos no script `test` do `package.json`, se houver).
- Mobile, testes puros: `cd apps/mobile && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' node -r ts-node/register/transpile-only --test <ficheiro>`; tipos: `cd apps/mobile && npx tsc --noEmit`; lint: `cd apps/mobile && npm run lint`.
- Commits em inglês, terminados com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Jogo de ténis com ordem dos jogadores trocada numa casa: o texto registado tem de ser o dessa casa (nomes), nunca o da primeira casa — teste em Task 4 (`toBuilderItems` usa `labels[house]`).
- Perna da múltipla cuja seleção desapareceu (mercado retirado) ou jogo já começou: a tabela mostra "—" e a casa fica sem botão; registo recusa pernas sem preço — teste em Task 4.
- Adicionar 2.ª seleção do mesmo jogo, 31.ª seleção, ou adicionar linha `key: null` — testes em Task 3.
- Registo com o boletim em curso de outra casa / com itens: pedir confirmação antes de `reset()` — teste do helper puro em Task 4 (`needsReplaceConfirm`).
- Dia de Lisboa à volta da meia-noite UTC (00:30 em Lisboa no verão = 23:30 UTC do dia anterior) — teste em Task 2 (`lisbonDay`).

---

### Task 1: API — texto por casa nas linhas e múltipla até 30

**Files:**
- Modify: `apps/api/src/services/odds/compare.ts` (`ComparedSelection`, `mergeEvent`)
- Modify: `apps/api/src/routes/oddsRoutes.ts:15` (`.max(10)` → `.max(30)`)
- Test: `apps/api/src/services/odds/compare.test.ts`, `apps/api/src/services/odds/service.test.ts:166-169`

**Interfaces:**
- Produces (JSON das rotas `/api/odds/events*`):
  `ComparedSelection = { key: string|null; label: string; market: string; prices: Partial<Record<HouseId,{odds:number;suspended:boolean}>>; best: HouseId|null; labels: Partial<Record<HouseId,{market:string;selection:string}>> }`

- [ ] **Step 1: Failing tests** em `compare.test.ts`:

```ts
test('mergeEvent keeps each house original market/selection text and the row market', () => {
  const a: CanonicalSelection = { key: 'FT.1X2.H', house: 'betclic', marketLabel: 'Resultado (Tempo Regulamentar)', selectionLabel: 'Alemanha', odds: 1.84, suspended: false };
  const b: CanonicalSelection = { key: 'FT.1X2.H', house: 'betano', marketLabel: 'Resultado Final', selectionLabel: '1', odds: 1.9, suspended: false };
  const [row] = mergeEvent({ betano: [b], betclic: [a] });
  assert.equal(row!.market, 'Resultado (Tempo Regulamentar)');
  assert.deepEqual(row!.labels, {
    betclic: { market: 'Resultado (Tempo Regulamentar)', selection: 'Alemanha' },
    betano: { market: 'Resultado Final', selection: '1' },
  });
});
test('mergeEvent null-key rows carry their own market and labels', () => {
  const [row] = mergeEvent({ betano: [{ key: null, house: 'betano', marketLabel: '+2 Golos Vantagem', selectionLabel: 'Alemanha', odds: 1.8, suspended: false }] });
  assert.equal(row!.market, '+2 Golos Vantagem');
  assert.deepEqual(row!.labels, { betano: { market: '+2 Golos Vantagem', selection: 'Alemanha' } });
});
```

  Em `service.test.ts`, no teste da rota: trocar o caso `Array(11)` → `Array(31)` (400) e `Array(10)` → `Array(30)` (200).

- [ ] **Step 2: Run** `cd apps/api && npm test` → FAIL (`market`/`labels` undefined; o pedido com 30 seleções devolve 400).
- [ ] **Step 3: Implement** em `mergeEvent`: `market` = `marketLabel` da primeira casa que criou a linha; `labels[house] ??= { market, selection }` sempre que a casa entra na linha (mesma regra de `prices[house] ??=`). `compareMultiple`/`HousePrice` não mudam. Rota: `.max(30)`.
- [ ] **Step 4: Run** `cd apps/api && npx tsc --noEmit && npm test` → todos passam (os `deepEqual` existentes sobre `prices` continuam válidos).
- [ ] **Step 5: Commit** `feat(odds): per-house labels on compared rows; multiple up to 30 selections`.

---

### Task 2: Mobile — tipos e lógica pura das odds

**Files:**
- Create: `apps/mobile/utils/odds/types.ts`, `apps/mobile/utils/odds/marketTabs.ts`, `apps/mobile/utils/odds/format.ts`
- Test: `apps/mobile/utils/odds/marketTabs.test.ts`, `apps/mobile/utils/odds/format.test.ts`

**Interfaces:**
- Produces (`types.ts`, espelho da API):
  `type HouseId = 'betclic'|'lebull'|'betano'|'placard'|'solverde'`; `type OddsSport = 'FOOTBALL'|'BASKETBALL'|'TENNIS'`;
  `interface HousePrice {odds:number; suspended:boolean}`; `ComparedSelection` (como Task 1);
  `interface OddsEventInfo {home:string; away:string; startsAt:string; competition:string; live:boolean}`;
  `interface OddsEventView {eventKey:string; sport:OddsSport; event:OddsEventInfo; houses:HouseId[]; rows:ComparedSelection[]}`;
  `interface OddsEventListItem {eventKey:string; sport:OddsSport; event:OddsEventInfo; houses:HouseId[]; houseCount:number; main:ComparedSelection[]}`;
  `interface MultipleResult {perHouse: Partial<Record<HouseId,{total:number|null; missing:number}>>; best: HouseId|null}`;
  `const HOUSE_ORDER: HouseId[]`.
- Produces (`marketTabs.ts`):
  `type MarketTab = 'top'|'resultado'|'golos'|'btts'|'handicap'|'marcadores'|'exato'|'outros'`;
  `const MARKET_TAB_LABEL: Record<MarketTab,string>` = Top · Resultado · Golos · Ambas marcam · Handicap · Marcadores · Resultado exato · Outros (para basquetebol/ténis o separador `golos` chama-se "Pontos"/"Jogos": `tabLabel(tab, sport)`);
  `tabOf(key: string|null): Exclude<MarketTab,'top'>`; `isTop(row: ComparedSelection, sport: OddsSport): boolean`;
  `interface MarketCard {title:string; rows:ComparedSelection[]}`;
  `groupByTab(rows: ComparedSelection[], sport: OddsSport): Array<{tab:MarketTab; cards:MarketCard[]}>` (só separadores com linhas, ordem da enum, `top` primeiro; cartões agrupados por `row.market` na ordem de chegada).
- Produces (`format.ts`): `formatOdd(n:number): string` (`1.9`→`"1,90"`); `formatEuro(n:number): string` (`84.1`→`"84,10 €"`); `bestPrice(row): {house:HouseId; odds:number}|null`; `housesByOdds(row): Array<{house:HouseId; odds:number; suspended:boolean}>` (desc., suspensas no fim); `lisbonDay(offsetDays:number, now?:Date): string` (`YYYY-MM-DD` em Europe/Lisbon).

- [ ] **Step 1: Failing tests** (`marketTabs.test.ts`):

```ts
const r = (key: string | null, market = 'm'): ComparedSelection => ({ key, label: key ?? 'x', market, prices: { betclic: { odds: 2, suspended: false } }, best: 'betclic', labels: { betclic: { market, selection: 'x' } } });
test('tabOf maps key prefixes', () => {
  assert.equal(tabOf('FT.1X2.H'), 'resultado'); assert.equal(tabOf('HT.DC.HD'), 'resultado'); assert.equal(tabOf('FT.DNB.A'), 'resultado'); assert.equal(tabOf('HTFT.HD'), 'resultado'); assert.equal(tabOf('B.ML.H'), 'resultado');
  assert.equal(tabOf('FT.TOTAL.GOALS.O.2.5'), 'golos'); assert.equal(tabOf('Q1:B.TOTAL.O.50.5'), 'golos'); assert.equal(tabOf('T.GAMES.O.22.5'), 'golos');
  assert.equal(tabOf('FT.BTTS.Y'), 'btts'); assert.equal(tabOf('FT.HCP.EU.H.-1'), 'handicap');
  assert.equal(tabOf('SCORER.ANY.KANE'), 'marcadores'); assert.equal(tabOf('FT.FIRSTGOAL.H'), 'marcadores');
  assert.equal(tabOf('FT.SCORE.2-1'), 'exato'); assert.equal(tabOf('T.SETS.2-0'), 'exato');
  assert.equal(tabOf(null), 'outros'); assert.equal(tabOf('FT.PARITY.EVEN'), 'outros');
});
test('groupByTab: top first, only non-empty tabs, cards by market', () => {
  const rows = [r('FT.1X2.H', 'Resultado Final'), r('FT.1X2.D', 'Resultado Final'), r('FT.TOTAL.GOALS.O.2.5', 'Total'), r(null, '+2 Golos')];
  const tabs = groupByTab(rows, 'FOOTBALL');
  assert.deepEqual(tabs.map((t) => t.tab), ['top', 'resultado', 'golos', 'outros']);
  assert.deepEqual(tabs[1]!.cards.map((c) => [c.title, c.rows.length]), [['Resultado Final', 2]]);
});
test('isTop: 1X2/ML, DC, BTTS and the 2.5 goals line (football)', () => {
  assert.ok(isTop(r('FT.1X2.H'), 'FOOTBALL')); assert.ok(isTop(r('FT.TOTAL.GOALS.U.2.5'), 'FOOTBALL'));
  assert.ok(!isTop(r('FT.TOTAL.GOALS.O.3.5'), 'FOOTBALL')); assert.ok(!isTop(r('HT.1X2.H'), 'FOOTBALL'));
  assert.ok(isTop(r('B.ML.H'), 'BASKETBALL')); assert.ok(isTop(r('T.WIN.A'), 'TENNIS'));
});
```

  (`format.test.ts`):

```ts
test('formatOdd / formatEuro', () => { assert.equal(formatOdd(1.9), '1,90'); assert.equal(formatOdd(13.5), '13,50'); assert.equal(formatEuro(84.1), '84,10 €'); });
test('bestPrice skips suspended; null when none', () => {
  const row = { key: 'k', label: 'x', market: 'm', best: 'betano', labels: {}, prices: { betclic: { odds: 3, suspended: true }, betano: { odds: 2, suspended: false } } } as ComparedSelection;
  assert.deepEqual(bestPrice(row), { house: 'betano', odds: 2 });
  assert.equal(bestPrice({ ...row, prices: { betclic: { odds: 3, suspended: true } } }), null);
  assert.deepEqual(housesByOdds(row).map((h) => h.house), ['betano', 'betclic']);
});
test('lisbonDay uses the Lisbon calendar day', () => {
  assert.equal(lisbonDay(0, new Date('2026-07-01T23:30:00Z')), '2026-07-02'); // 00:30 WEST
  assert.equal(lisbonDay(1, new Date('2026-11-16T12:00:00Z')), '2026-11-17');
});
```

- [ ] **Step 2: Run** cada ficheiro com o comando de testes puros → FAIL (módulos inexistentes).
- [ ] **Step 3: Implement** os três módulos. `tabOf`: tirar prefixo de período `Q\d:`/`H\d:` e procurar o segmento de tipo (`1X2|DC|DNB|ML` → resultado, prefixo `HTFT.` → resultado; `TOTAL|TEAMTOTAL|GAMES|SETSTOTAL` → golos; `BTTS`; `HCP`; `SCORER.`/`FIRSTGOAL` → marcadores; `SCORE`/`T.SETS.` → exato; resto → outros). `isTop` só período `FT.` (ou sem prefixo de período no basquetebol/ténis). `bestPrice` reproduz `bestOf` da API (maior odd não suspensa, desempate por `HOUSE_ORDER`). `lisbonDay` com `Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon'})`.
- [ ] **Step 4: Run** os testes → PASS; `npx tsc --noEmit` limpo.
- [ ] **Step 5: Commit** `feat(mobile): odds types, market tab grouping and formatting helpers`.

---

### Task 3: Mobile — store da múltipla e hooks da API

**Files:**
- Create: `apps/mobile/utils/odds/slip.ts` (regras puras), `apps/mobile/stores/oddsSlipStore.ts`, `apps/mobile/services/oddsService.ts`
- Test: `apps/mobile/utils/odds/slip.test.ts`

**Interfaces:**
- Consumes: Task 2 tipos.
- Produces (`slip.ts`):
  `interface SlipLeg {eventKey:string; selectionKey:string; label:string; market:string; home:string; away:string; startsAt:string; sport:OddsSport; competition:string}`;
  `const MAX_LEGS = 30`;
  `type AddResult = {legs:SlipLeg[]; outcome:'added'|'replaced'|'full'|'invalid'}`;
  `addLeg(legs:SlipLeg[], leg:SlipLeg): AddResult` (mesmo `eventKey` → substitui no mesmo lugar, `'replaced'`; já com 30 pernas e `eventKey` novo → `'full'`, lista igual; senão acrescenta, `'added'`); `toggleLeg(legs, leg): AddResult & {removed?:boolean}` (se a mesma `eventKey+selectionKey` existe, remove-a com `removed: true`; senão `addLeg`);
  `pruneLegs(legs, now:number): SlipLeg[]` (remove pernas com `startsAt` < now − 3 h);
  `legFromRow(view: Pick<OddsEventView,'eventKey'|'sport'|'event'>, row: ComparedSelection): SlipLeg | null` (null se `row.key === null`).
- Produces (`oddsSlipStore.ts`, `persist` com `createJSONStorage(() => AsyncStorage)`, nome `odds-slip`):
  `{ legs: SlipLeg[]; stake: number /*default 10*/; pendingHouse: HouseId|null; toggle(leg:SlipLeg): AddResult & {removed?:boolean}; remove(eventKey:string): void; clear(): void; setStake(n:number): void; setPendingHouse(h:HouseId|null): void; prune(): void }` — `useOddsSlipStore`.
- Produces (`oddsService.ts`, axios `apiClient`, envelope `{success,data}`):
  `useOddsDay(sport:OddsSport, date:string, enabled?:boolean)` → `OddsEventListItem[]`, queryKey `['odds','day',sport,date]`, `staleTime` 120 000;
  `useOddsEvent(key:string|undefined)` → `OddsEventView`, queryKey `['odds','event',key]`, `staleTime` 60 000, `retry` false em 404;
  `fetchOddsEvent(key:string): Promise<OddsEventView|null>` (404 → null);
  `useOddsMultiple(legs:SlipLeg[])` → `MultipleResult`, queryKey `['odds','multiple', legs.map(l=>l.eventKey+'|'+l.selectionKey)]`, `enabled: legs.length>0`, POST `/odds/multiple` com `{selections: legs.map(({eventKey,selectionKey})=>({eventKey,selectionKey}))}`.

- [ ] **Step 1: Failing tests** (`slip.test.ts`):

```ts
const leg = (ev: string, sel = 'FT.1X2.H', startsAt = '2026-11-16T19:45:00Z'): SlipLeg => ({ eventKey: ev, selectionKey: sel, label: 'x', market: 'm', home: 'A', away: 'B', startsAt, sport: 'FOOTBALL', competition: 'c' });
test('toggle adds, then removes the same selection', () => {
  const a = toggleLeg([], leg('e1')); assert.equal(a.outcome, 'added'); assert.equal(a.legs.length, 1);
  const b = toggleLeg(a.legs, leg('e1')); assert.equal(b.removed, true); assert.equal(b.legs.length, 0);
});
test('a second selection of the same event replaces the first', () => {
  const r = toggleLeg([leg('e1')], leg('e1', 'FT.1X2.A')); assert.equal(r.outcome, 'replaced'); assert.deepEqual(r.legs.map((l) => l.selectionKey), ['FT.1X2.A']);
});
test('the 31st leg is refused', () => {
  const full = Array.from({ length: 30 }, (_, i) => leg(`e${i}`));
  const r = toggleLeg(full, leg('e99')); assert.equal(r.outcome, 'full'); assert.equal(r.legs.length, 30);
});
test('legFromRow refuses null-key rows', () => {
  const view = { eventKey: 'e', sport: 'FOOTBALL' as const, event: { home: 'A', away: 'B', startsAt: 's', competition: 'c', live: false } };
  assert.equal(legFromRow(view, { key: null, label: 'x', market: 'm', prices: {}, best: null, labels: {} }), null);
});
test('prune drops legs that started more than 3 h ago', () => {
  const now = Date.parse('2026-11-16T23:00:00Z');
  assert.deepEqual(pruneLegs([leg('a', 'k', '2026-11-16T19:45:00Z'), leg('b', 'k', '2026-11-16T21:00:00Z')], now).map((l) => l.eventKey), ['b']);
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `slip.ts`, depois a store (ações delegam nas funções puras; `prune` usa `Date.now()`) e `oddsService.ts` (padrão de `services/sportsService.ts`).
- [ ] **Step 4: Run** testes → PASS; `npx tsc --noEmit` limpo.
- [ ] **Step 5: Commit** `feat(mobile): odds slip store and odds API hooks`.

---

### Task 4: Mobile — conversão para o Novo boletim e fluxo de registo

**Files:**
- Create: `apps/mobile/utils/odds/register.ts` (puro), `apps/mobile/hooks/useRegisterInHouse.ts`
- Modify: `apps/mobile/app/boletins/confirmar.tsx` (limpar a múltipla após guardar)
- Test: `apps/mobile/utils/odds/register.test.ts`

**Interfaces:**
- Consumes: Task 2/3 (`SlipLeg`, `OddsEventView`, `useOddsSlipStore`, `fetchOddsEvent`); `BoletinBuilderItem`, `useBoletinBuilderStore` (`reset`, `setSiteSlug`, `addItem`, `items`, `siteSlug`); `Sport` de `@betintel/shared`.
- Produces (`register.ts`):
  `toBuilderItems(legs:SlipLeg[], house:HouseId, views:Map<string,OddsEventView|null>, now?:number): {items:BoletinBuilderItem[]; missing:SlipLeg[]}` — por perna: linha `views.get(eventKey)?.rows.find(r=>r.key===selectionKey)`; sem linha, sem `prices[house]`, suspensa ou sem `labels[house]` → vai para `missing`; senão item `{id:\`${eventKey}|${selectionKey}|${house}\`, homeTeam:event.home, awayTeam:event.away, competition:event.competition, sport: Sport[view.sport], market:labels[house].market, selection:labels[house].selection, oddValue:prices[house].odds, eventDate:event.startsAt}`;
  `oddsChanged(before: Partial<Record<string,number>>, items:BoletinBuilderItem[]): boolean` (chave = item.id);
  `needsReplaceConfirm(builder:{items:unknown[]}): boolean` (`items.length > 0`);
  `slipMatchesSaved(legs:SlipLeg[], pendingHouse:HouseId|null, saved:{siteSlug:string; items:Array<{id:string}>}): boolean` (mesma casa e o conjunto `eventKey|selectionKey|house` igual aos `id`s dos itens).
- Produces (`useRegisterInHouse.ts`): `useRegisterInHouse(): (legs:SlipLeg[], house:HouseId, shownOdds?:Partial<Record<string,number>>) => Promise<void>` — 1) se `needsReplaceConfirm` → `ConfirmModal`/`Alert` "Já tens um boletim em curso (N seleções). Substituir?" (Substituir/Cancelar); 2) `fetchOddsEvent` de cada `eventKey` (sem cache); 3) `toBuilderItems`; se `missing.length` → toast de erro "A <casa> já não tem odd para N seleção(ões)" e para; 4) `reset()`, `setSiteSlug(house)`, `addItem` de cada item, `setPendingHouse(house)`; 5) se `oddsChanged` → toast "Odds atualizadas"; 6) `router.push('/boletins/confirmar')`.

- [ ] **Step 1: Failing tests** (`register.test.ts`) — incluir o caso de ténis com ordem trocada:

```ts
const view = (rows: ComparedSelection[]): OddsEventView => ({ eventKey: 'e1', sport: 'TENNIS', event: { home: 'Sinner', away: 'Alcaraz', startsAt: '2026-11-16T19:00:00Z', competition: 'ATP', live: false }, houses: ['betclic', 'betano'], rows });
const win: ComparedSelection = { key: 'T.WIN.A', label: 'Sinner', market: 'Vencedor', best: 'betano',
  prices: { betclic: { odds: 1.8, suspended: false }, betano: { odds: 1.85, suspended: false } },
  labels: { betclic: { market: 'Vencedor do encontro', selection: 'Sinner' }, betano: { market: 'Vencedor', selection: 'J. Sinner' } } };
const leg = { eventKey: 'e1', selectionKey: 'T.WIN.A', label: 'Sinner', market: 'Vencedor', home: 'Sinner', away: 'Alcaraz', startsAt: '2026-11-16T19:00:00Z', sport: 'TENNIS' as const, competition: 'ATP' };
test('toBuilderItems uses the chosen house text and odds', () => {
  const { items, missing } = toBuilderItems([leg], 'betano', new Map([['e1', view([win])]]));
  assert.equal(missing.length, 0);
  assert.equal(items[0]!.market, 'Vencedor'); assert.equal(items[0]!.selection, 'J. Sinner'); assert.equal(items[0]!.oddValue, 1.85);
  assert.equal(items[0]!.sport, 'TENNIS'); assert.equal(items[0]!.eventDate, '2026-11-16T19:00:00Z');
});
test('legs without a live price at the house are missing', () => {
  const susp = { ...win, prices: { ...win.prices, betano: { odds: 1.85, suspended: true } } };
  assert.equal(toBuilderItems([leg], 'betano', new Map([['e1', view([susp])]])).missing.length, 1);
  assert.equal(toBuilderItems([leg], 'betano', new Map([['e1', null]])).missing.length, 1);
  assert.equal(toBuilderItems([leg], 'placard', new Map([['e1', view([win])]])).missing.length, 1);
});
test('needsReplaceConfirm and slipMatchesSaved', () => {
  assert.equal(needsReplaceConfirm({ items: [] }), false); assert.equal(needsReplaceConfirm({ items: [1] }), true);
  assert.ok(slipMatchesSaved([leg], 'betano', { siteSlug: 'betano', items: [{ id: 'e1|T.WIN.A|betano' }] }));
  assert.ok(!slipMatchesSaved([leg], 'betano', { siteSlug: 'betclic', items: [{ id: 'e1|T.WIN.A|betano' }] }));
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `register.ts` e o hook. Em `confirmar.tsx`, no `save` antes de `router.replace`: ler `items`/`siteSlug` do builder **antes** de guardar (o `save` faz reset), e após sucesso, se `slipMatchesSaved(...)` → `useOddsSlipStore.getState().clear()`.
- [ ] **Step 4: Run** testes → PASS; `npx tsc --noEmit`; `npm run lint`.
- [ ] **Step 5: Commit** `feat(mobile): register an odds multiple in a house via the boletim builder`.

---

### Task 5: Mobile — componentes `OddButton`, folha das casas e barra da múltipla

**Files:**
- Create: `apps/mobile/components/odds/OddButton.tsx`, `apps/mobile/components/odds/HousesSheet.tsx`, `apps/mobile/components/odds/SlipBar.tsx`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  `OddButton({ view, row, caption?, compact? }: { view: Pick<OddsEventView,'eventKey'|'sport'|'event'>; row: ComparedSelection; caption?: string; compact?: boolean })` — mostra `caption ?? row.label`, `formatOdd(best)` e `SiteMark` (size 14, `showName={false}`) da melhor casa; selecionado se `legs` contém `eventKey+selectionKey`; toque → `toggle(legFromRow(...))` com toasts (`'replaced'` → "Seleção do mesmo jogo substituída", `'full'` → "Máximo de 30 seleções"); toque em linha `key:null` e toque longo → abre `HousesSheet`; sem `bestPrice` → "—" desativado.
  `HousesSheet({ visible, onClose, view, row })` — `BottomSheet` com título `row.label` · `row.market` · `home – away`; linhas de `housesByOdds(row)` (`SiteMark` com nome, odd, "suspensa"); melhor destacada; botão "Registar nesta casa" por casa não suspensa **só se `row.key !== null`** → `useRegisterInHouse()([leg], house)`; botão "Adicionar à múltipla"/"Remover da múltipla" se `row.key !== null`.
  `SlipBar()` — escondida sem pernas; texto "Múltipla · N seleções · melhor X,XX na <Casa>" (de `useOddsMultiple`; sem melhor → "Múltipla · N seleções"); toque → `router.push('/odds/multipla')`. Posicionada acima da tab bar (`useSafeAreaInsets`).

- [ ] **Step 1: Implement** os três componentes com `StyleSheet` + tokens; acessibilidade: `accessibilityLabel` "<rótulo>, melhor odd <x> na <casa>" no botão.
- [ ] **Step 2: Run** `cd apps/mobile && npx tsc --noEmit && npm run lint` → limpo.
- [ ] **Step 3: Commit** `feat(mobile): odd button, houses sheet and multiple bar`.

---

### Task 6: Mobile — tab Odds na página Jogos

**Files:**
- Create: `apps/mobile/components/odds/OddsTab.tsx`, `apps/mobile/components/odds/OddsEventCard.tsx`
- Modify: `apps/mobile/app/(tabs)/fixtures.tsx` (tipo `Tab`, array `tabs`, render)

**Interfaces:**
- Consumes: `useOddsDay`, `lisbonDay`, `OddButton`, `SlipBar`.
- Produces: `OddsTab()`; `OddsEventCard({ item }: { item: OddsEventListItem })`.

- [ ] **Step 1:** `fixtures.tsx`: `type Tab = 'bets' | 'odds' | SportKey`; nova entrada `{ value: 'odds', label: 'Odds', icon: (c) => <Ionicons color={c} name="trending-up" size={20} /> }` a seguir a "Apostas"; quando `tab === 'odds'` renderizar só `<OddsTab />` (sem os controlos de data/ao vivo da página, que são de outras tabs) e desativar as queries ESPN dessa tab.
- [ ] **Step 2:** `OddsTab`: `SegmentedControl` Futebol · Ténis · Basquetebol; `useOddsDay(sport, lisbonDay(0))` e `lisbonDay(1)`; chips horizontais de competição ("Todas" + `competition` distintas, ordenadas por nº de jogos desc.); `SectionList` com secções "Hoje"/"Amanhã"; `Skeleton` a carregar; `EmptyState` "Sem odds para estes jogos"; pull-to-refresh; `<SlipBar />` no fundo.
- [ ] **Step 3:** `OddsEventCard` (spec §2): cabeçalho competição + "N casas"; linha casa · `TeamBadge` · hora `HH:MM` (ou "AO VIVO") · `TeamBadge` · fora; linha de `OddButton` com `item.main` (futebol: captions casa/"Empate"/fora por `FT.1X2.H|D|A`; ténis/basquetebol: nomes); toque fora dos botões → `router.push({ pathname: '/odds/[key]', params: { key: item.eventKey } })`.
- [ ] **Step 4: Run** `npx tsc --noEmit && npm run lint` → limpo.
- [ ] **Step 5: Commit** `feat(mobile): Odds tab on the Jogos page`.

---

### Task 7: Mobile — ecrã de odds do jogo

**Files:**
- Create: `apps/mobile/app/odds/[key].tsx`, `apps/mobile/components/odds/MarketCard.tsx`

**Interfaces:**
- Consumes: `useOddsEvent`, `groupByTab`, `tabLabel`, `OddButton`, `SlipBar`.
- Produces: rota `/odds/[key]`; `MarketCard({ view, card }: { view: OddsEventView; card: MarketCard })` — ≤3 linhas → botões lado a lado; >3 → lista "rótulo ······ [OddButton compact]".

- [ ] **Step 1:** Ecrã (spec §5): cabeçalho (competição, equipas com `TeamBadge`, hora/"AO VIVO", "N casas"); se `key` começa por `espn:FOOTBALL:` → link "Estatísticas do jogo" para `/jogo/[id]` (id = último segmento); separadores horizontais com `groupByTab(view.rows, view.sport)` e `tabLabel`; lista de `MarketCard`; pull-to-refresh; 404 → `EmptyState` "Odds indisponíveis para este jogo"; `<SlipBar />`.
- [ ] **Step 2: Run** `npx tsc --noEmit && npm run lint` → limpo.
- [ ] **Step 3: Commit** `feat(mobile): event odds screen with market tabs`.

---

### Task 8: Mobile — tabela da múltipla

**Files:**
- Create: `apps/mobile/app/odds/multipla.tsx`

**Interfaces:**
- Consumes: `useOddsSlipStore` (`legs`, `stake`, `setStake`, `remove`, `clear`, `prune`), `useOddsMultiple`, `useOddsEvent`/`useQueries` para os `OddsEventView` das pernas, `useRegisterInHouse`, `formatOdd`, `formatEuro`, `HOUSE_ORDER`.

- [ ] **Step 1:** Ecrã modal (`Stack.Screen options={{ presentation: 'modal' }}`), spec §6: `prune()` ao abrir; colunas = casas presentes em `perHouse` por `HOUSE_ORDER`, coluna da melhor primeiro; linhas = pernas (rótulo, mercado, `home – away`, botão remover) com a odd de cada casa (ou "—"); linha "Odd total" (`perHouse[h].total` ou "—") e "Retorno com X €" (`NumericInput` ligado a `stake`); melhor total destacado; botão principal "Registar na <melhor casa>"; tocar no cabeçalho de outra coluna completa seleciona-a e o botão passa a "Registar na <casa>"; colunas incompletas não selecionáveis; "Limpar múltipla" com confirmação; sem pernas → `EmptyState` "A múltipla está vazia". Registar chama `useRegisterInHouse()(legs, house, shownOdds)` com as odds mostradas por perna.
- [ ] **Step 2: Run** `npx tsc --noEmit && npm run lint` → limpo.
- [ ] **Step 3: Commit** `feat(mobile): multiple table with total odds per house`.

---

### Task 9: Mobile — cartão de odds no ecrã do jogo

**Files:**
- Create: `apps/mobile/components/odds/MatchOddsCard.tsx`
- Modify: `apps/mobile/app/jogo/[id].tsx` (logo abaixo do cabeçalho/hero)

**Interfaces:**
- Consumes: `useOddsEvent`, `OddButton`.
- Produces: `MatchOddsCard({ espnId }: { espnId: string })` — `useOddsEvent(\`espn:FOOTBALL:${espnId}\`)`; 404/erro/carregar → `null` (sem cartão vazio); senão cartão "Odds" com as linhas `isTop` do 1X2 (`FT.1X2.*`) como `OddButton` e botão "Ver todas as odds (N casas)" → `/odds/[key]`.

- [ ] **Step 1:** Implementar e inserir `<MatchOddsCard espnId={id ?? ''} />` em `jogo/[id].tsx` só quando `id` existe.
- [ ] **Step 2: Run** `npx tsc --noEmit && npm run lint`; testes puros de `utils/odds/*.test.ts` todos → PASS; `cd apps/api && npm test` → PASS.
- [ ] **Step 3: Commit** `feat(mobile): odds card on the match screen`.
