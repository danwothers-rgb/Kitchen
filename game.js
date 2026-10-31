'use strict';
// Kitchen Line — hot-seat rules prototype. All tunables are in config.js.

const C = CONFIG;
const ST = Object.keys(C.STATIONS);
let G = null;
let nextId = 1;
const uid = () => nextId++;

// ---------- utils ----------
const rnd = n => Math.floor(Math.random() * n);
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function weighted(w) {
  const e = Object.entries(w);
  let r = Math.random() * e.reduce((s, [, v]) => s + v, 0);
  for (const [k, v] of e) { if ((r -= v) < 0) return k; }
  return e[e.length - 1][0];
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const P = id => G.players[id];

// ---------- log ----------
// entries written during a player's secret prep stay hidden until Open
function log(html, cls = '') {
  const secret = G.phase === 'prep' && G.prepActive ? G.prepQueue[G.prepIdx] : null;
  G.log.push({ day: G.day, html, cls, secret });
}
const pn = p => `<b style="color:${p.color}">${esc(p.name)}</b>`;
const ingN = k => C.INGREDIENTS[k].name;
const stN = k => C.STATIONS[k].name;
const cubeTxt = c => c.st ? `${ingN(c.ing)}@${stN(c.st)}` : ingN(c.ing);

function addMoney(p, d, why) {
  if (!d) return;
  p.money += d;
  log(`${pn(p)} ${d > 0 ? '+' : '−'}$${Math.abs(d)} (${why}) → $${p.money}`, 'money');
}
function addRep(p, d, why) {
  if (!d) return;
  const before = p.rep;
  p.rep = Math.max(C.REPUTATION.MIN, p.rep + d);
  if (p.rep !== before) log(`${pn(p)} reputation ${d > 0 ? '+' : '−'}${Math.abs(p.rep - before)} (${why}) → ★${p.rep}`, d > 0 ? 'rep' : 'bad');
  else log(`${pn(p)} would lose reputation (${why}) but is already at the floor ★${p.rep}`, 'bad');
}

// ---------- decks ----------
function buildMarketDeck() {
  const d = [];
  for (let i = 0; i < C.MARKET.DECK_SIZE; i++) {
    const n = +weighted(C.MARKET.CUBES_PER_CARD_WEIGHTS);
    const cubes = [];
    for (let j = 0; j < n; j++) cubes.push(weighted(C.MARKET.INGREDIENT_WEIGHTS));
    d.push({ uid: uid(), cubes });
  }
  return shuffle(d);
}
function makeCustomer(dish, critic) {
  const d = C.DISHES[dish];
  return {
    uid: uid(), dish, name: d.name, price: d.price, patience: d.patience, critic,
    steps: d.steps.map(([ing, st]) => ({ ing, st })),
    reward: critic ? weighted(C.CRITICS.REWARD_WEIGHTS) : null,
  };
}
function buildCustomerDeck() {
  const d = [];
  for (const [k, n] of Object.entries(C.CUSTOMER_DECK)) for (let i = 0; i < n; i++) d.push(makeCustomer(k, false));
  for (let i = 0; i < C.CRITICS.COUNT; i++) d.push(makeCustomer(C.CRITIC_DISHES[i % C.CRITIC_DISHES.length], true));
  return shuffle(d);
}
function drawFrom(deckKey, discardKey, label) {
  if (!G[deckKey].length && G[discardKey].length) {
    G[deckKey] = shuffle(G[discardKey]);
    G[discardKey] = [];
    log(`${label} deck reshuffled.`);
  }
  return G[deckKey].pop() || null;
}
function refillMarket() {
  while (G.marketRow.length < C.MARKET.ROW_SIZE) {
    const c = drawFrom('marketDeck', 'marketDiscard', 'Market'); if (!c) break; G.marketRow.push(c);
  }
}
function refillCustomers() {
  while (G.customerRow.length < C.CUSTOMERS.ROW_SIZE) {
    const c = drawFrom('customerDeck', 'customerDiscard', 'Customer'); if (!c) break;
    G.customerRow.push(c);
    if (c.critic) log(`A critic arrives wanting ${esc(c.name)} (reward: ${rewardName(c.reward)}).`, 'critic');
  }
}
function discardCustomer(c) { c.patience = C.DISHES[c.dish].patience; G.customerDiscard.push(c); }

// ---------- player ----------
function makePlayer(i, name) {
  const stations = {};
  for (const k of ST) stations[k] = { slots: Array(C.HOPPER.SLOTS).fill(null), staffed: C.START.STAFFED.includes(k), jammed: false, sent: false };
  const p = {
    id: i, name, color: C.PLAYERS.COLORS[i % C.PLAYERS.COLORS.length],
    money: C.START.MONEY, rep: C.START.REPUTATION, meeples: C.START.MEEPLES,
    storage: [], stations,
    fresh: Array.from({ length: C.FRESHNESS.COLUMNS }, () => []),
    tickets: [], regulars: [], plates: [], upgrades: {},
    freeUpgrades: 0, buzz: 0, scheduled: 0, plan: null, prepTime: null, prepLoaded: new Set(),
    marketCards: 0, marketPassed: false, marketSent: false, dining: 0,
    stats: { served: 0, short: 0, jams: 0, spoiled: 0, walkouts: 0, unpaid: 0, critics: 0 },
  };
  for (let j = 0; j < C.START.STORAGE_CUBES; j++) p.storage.push({ id: uid(), ing: weighted(C.MARKET.INGREDIENT_WEIGHTS) });
  return p;
}
const staffedCount = p => ST.filter(k => p.stations[k].staffed).length;
const railSize = p => C.OPEN.TICKET_RAIL + (p.upgrades.marketing ? C.UPGRADE_EFFECTS.MARKETING_EXTRA_TICKETS : 0);
const cardPrice = p => Math.max(0, C.MARKET.CARD_PRICE - (p.upgrades.supplier ? C.UPGRADE_EFFECTS.SUPPLIER_DISCOUNT : 0));
const dishPrice = (p, c) => c.price + p.rep * C.REPUTATION.PRICE_PER_STEP;
const rewardName = r => ({ rep: `+${C.CRITICS.REP_TOKEN} rep token`, buzz: `buzz ×${C.CRITICS.BUZZ_MULTIPLIER} next ${C.CRITICS.BUZZ_CUSTOMERS}`, upgrade: 'free upgrade', regular: 'a Regular' }[r]);

// ---------- game flow ----------
function newGame(names) {
  nextId = 1;
  G = {
    players: names.map((n, i) => makePlayer(i, n)),
    day: 1, phase: 'market', log: [],
    marketDeck: buildMarketDeck(), marketDiscard: [], marketRow: [],
    customerDeck: buildCustomerDeck(), customerDiscard: [], customerRow: [],
    marketOrder: [], marketPtr: -1, arrivals: [], openOrder: [],
    prepQueue: [], prepIdx: 0, prepActive: false, prepStart: 0, timer: null,
    tick: 1, openIdx: 0, wageQueue: [], wageIdx: 0, pay: null, sel: null,
  };
  log(`New game: ${G.players.map(pn).join(', ')}. ${C.ROUNDS} days. Final score = lower of money and reputation.`);
  refillMarket();
  refillCustomers();
  startDay();
}

// PHASE 1 — MARKET
function startDay() {
  G.phase = 'market';
  log(`Day ${G.day} of ${C.ROUNDS}`, 'day');
  let order;
  if (G.day === 1) order = shuffle(G.players.map(p => p.id));
  else {
    order = [...G.arrivals];
    for (const id of G.openOrder) if (!order.includes(id)) order.push(id);
  }
  G.marketOrder = order;
  G.arrivals = [];
  G.players.forEach(p => { p.marketCards = 0; p.marketPassed = false; });
  log(`Market pick order: ${order.map(id => pn(P(id))).join(' → ')}${G.day === 1 ? ' (random)' : ' (market meeple arrivals first)'}`);
  G.marketPtr = -1;
  advanceMarket();
}
function marketPlayer() { return P(G.marketOrder[G.marketPtr]); }
function advanceMarket() {
  const n = G.marketOrder.length;
  for (let step = 1; step <= n && G.marketRow.length; step++) {
    const idx = (G.marketPtr + step + n) % n;
    const p = P(G.marketOrder[idx]);
    if (p.marketPassed || p.marketCards >= C.MARKET.MAX_CARDS_PER_PLAYER) continue;
    if (p.money < cardPrice(p)) { p.marketPassed = true; log(`${pn(p)} can't afford a card and passes.`); continue; }
    G.marketPtr = idx;
    render();
    return;
  }
  log('Market closed.');
  startPrep();
}
function buyCard(cardUid) {
  const p = marketPlayer();
  const i = G.marketRow.findIndex(c => c.uid === cardUid);
  if (i < 0 || p.money < cardPrice(p)) return;
  const card = G.marketRow.splice(i, 1)[0];
  G.marketDiscard.push(card);
  p.marketCards++;
  addMoney(p, -cardPrice(p), 'market card');
  let lost = 0;
  for (const ing of card.cubes) {
    if (p.storage.length < C.STORAGE_SIZE) p.storage.push({ id: uid(), ing });
    else lost++;
  }
  log(`${pn(p)} takes ${card.cubes.map(ingN).join(', ')}${lost ? ` — storage full, ${lost} cube(s) discarded` : ''}.`);
  advanceMarket();
}
function passMarket() {
  const p = marketPlayer();
  p.marketPassed = true;
  log(`${pn(p)} passes at the market.`);
  advanceMarket();
}

// PHASE 2 — PREP RACE (hot-seat: each player gets their own timed turn)
function startPrep() {
  G.phase = 'prep';
  const seats = G.players.map(p => p.id);
  const r = (G.day - 1) % seats.length;
  G.prepQueue = [...seats.slice(r), ...seats.slice(0, r)];
  G.prepIdx = 0;
  G.prepActive = false;
  G.sel = null;
  for (const p of G.players) {
    p.prepTime = null;
    p.prepLoaded = new Set();
    for (const k of ST) {
      const s = p.stations[k];
      s.sent = false;
      if (p.plan) s.staffed = C.PREP.CARRY_OVER_STAFFING ? p.plan.includes(k) : false;
    }
  }
  log(`Prep race. Hot-seat order: ${G.prepQueue.map(id => pn(P(id))).join(' → ')}. Fastest finisher acts first in Open.`);
  render();
}
const prepPlayer = () => P(G.prepQueue[G.prepIdx]);
function beginPrepTurn() {
  G.prepActive = true;
  G.prepStart = Date.now();
  G.sel = null;
  log(`${pn(prepPlayer())} starts prep${C.PREP.TIMER_SECONDS ? ` (${C.PREP.TIMER_SECONDS}s on the clock)` : ''}.`);
  if (C.PREP.TIMER_SECONDS) {
    stopTimer();
    G.timer = setInterval(() => { updateTimer(); if (prepLeft() <= 0) finishPrep(true); }, 200);
  }
  render();
}
const prepElapsed = () => (Date.now() - G.prepStart) / 1000;
const prepLeft = () => C.PREP.TIMER_SECONDS - prepElapsed();
function stopTimer() { if (G && G.timer) { clearInterval(G.timer); G.timer = null; } }
function finishPrep(timeout) {
  stopTimer();
  const p = prepPlayer();
  const t = C.PREP.TIMER_SECONDS ? Math.min(C.PREP.TIMER_SECONDS, prepElapsed()) : prepElapsed();
  p.prepTime = t + G.prepIdx * 1e-6; // ties go to whoever prepped earlier
  p.plan = ST.filter(k => p.stations[k].staffed);
  p.scheduled = p.plan.length;
  log(`${pn(p)} ${timeout ? 'ran out of time' : 'finished prep'} at ${t.toFixed(1)}s — scheduled ${p.scheduled} meeple(s) on ${p.plan.map(stN).join(', ') || 'nothing'} (wages $${p.scheduled * C.WAGES.PER_MEEPLE} due at Closing).`);
  G.prepIdx++;
  G.prepActive = false;
  G.sel = null;
  if (G.prepIdx >= G.prepQueue.length) startOpen();
  else render();
}
function selectCube(id) { G.sel = G.sel === id ? null : id; render(); }
function hopperInsert(s, cube) {
  // push in at the top; cubes above the first gap slide down one to make room
  const n = s.slots.length;
  let e = -1;
  for (let i = n - 1; i >= 0; i--) if (!s.slots[i]) { e = i; break; }
  if (e < 0) return false;
  for (let i = e; i < n - 1; i++) s.slots[i] = s.slots[i + 1];
  s.slots[n - 1] = cube;
  return true;
}
function loadHopper(st) {
  const p = prepPlayer();
  const i = p.storage.findIndex(c => c.id === G.sel);
  if (i < 0) return;
  const cube = p.storage[i];
  if (!hopperInsert(p.stations[st], cube)) { log(`${pn(p)}: ${stN(st)} hopper is full.`); render(); return; }
  p.storage.splice(i, 1);
  p.prepLoaded.add(cube.id);
  log(`${pn(p)} loads ${ingN(cube.ing)} into the ${stN(st)} hopper.`);
  G.sel = p.storage[Math.min(i, p.storage.length - 1)]?.id ?? null; // keep a cube selected for fast loading
  render();
}
function unloadCube(st, idx) {
  const p = prepPlayer();
  const s = p.stations[st];
  const cube = s.slots[idx];
  if (!cube || !p.prepLoaded.has(cube.id) || p.storage.length >= C.STORAGE_SIZE) return;
  s.slots[idx] = null;
  p.storage.push(cube);
  p.prepLoaded.delete(cube.id);
  log(`${pn(p)} takes ${ingN(cube.ing)} back out of the ${stN(st)} hopper.`);
  render();
}
function toggleStaff(st) {
  const p = prepPlayer();
  const s = p.stations[st];
  if (s.staffed) s.staffed = false;
  else if (staffedCount(p) < p.meeples) s.staffed = true;
  else { log(`${pn(p)} has no free meeple for the ${stN(st)}.`); render(); return; }
  render();
}
function payUpgrade(p, cost, what) {
  if (p.freeUpgrades > 0) { p.freeUpgrades--; log(`${pn(p)} uses a free-upgrade token on ${what}.`, 'rep'); return true; }
  if (p.money < cost) return false;
  addMoney(p, -cost, what);
  return true;
}
function buyUpgrade(key) {
  const p = prepPlayer();
  const u = C.UPGRADES[key];
  if (p.upgrades[key] || !payUpgrade(p, u.cost, u.name)) return;
  p.upgrades[key] = true;
  if (key === 'sous') p.meeples = Math.min(C.MEEPLES_MAX, p.meeples + C.UPGRADE_EFFECTS.SOUS_CHEF_MEEPLES);
  if (key === 'fridge') for (let i = 0; i < C.UPGRADE_EFFECTS.FRIDGE_EXTRA_COLUMNS; i++) p.fresh.push([]);
  log(`${pn(p)} buys ${u.name} (${u.desc}).`);
  render();
}
function topEmptySlot(s) {
  for (let i = s.slots.length - 1; i >= 0; i--) if (!s.slots[i]) return i;
  return -1;
}
function upgradeStation(st, kind) {
  const p = prepPlayer();
  const s = p.stations[st];
  const e = topEmptySlot(s);
  if (s.slots.length <= C.HOPPER.MIN_SLOTS || e < 0) return;
  if (kind === 'staff' && p.meeples >= C.MEEPLES_MAX) return;
  if (!payUpgrade(p, C.HOPPER.UPGRADE_COST, `${stN(st)} upgrade`)) return;
  s.slots.splice(e, 1);
  if (kind === 'staff') {
    p.meeples++;
    log(`${pn(p)} upgrades the ${stN(st)} to ${s.slots.length} slots; the slot piece becomes a staff meeple (${p.meeples} total).`);
  } else {
    p.dining++;
    log(`${pn(p)} upgrades the ${stN(st)} to ${s.slots.length} slots; the slot piece becomes a dining room piece.`);
    addRep(p, C.HOPPER.DINING_ROOM_REP, 'dining room');
  }
  render();
}

// PHASE 3 — OPEN
function startOpen() {
  G.phase = 'open';
  G.openOrder = G.players.slice().sort((a, b) => a.prepTime - b.prepTime).map(p => p.id);
  log(`Open! Turn order by prep finish: ${G.openOrder.map(id => pn(P(id))).join(' → ')}`, 'phase');
  for (const p of G.players) {
    p.marketSent = false;
    for (const r of p.regulars) {
      r.servedToday = false;
      log(`${pn(p)}'s Regular is in, ordering ${esc(r.card.name)}.`);
    }
  }
  G.tick = 1;
  G.openIdx = 0;
  beginTurn();
}
const openPlayer = () => P(G.openOrder[G.openIdx]);
function beginTurn() {
  if (G.openIdx === 0) log(`Service tick ${G.tick}/${C.OPEN.SERVICE_TICKS}`, 'tick');
  runStations(openPlayer());
  render();
}
function endTurn() {
  G.sel = null;
  G.openIdx++;
  if (G.openIdx >= G.openOrder.length) { G.openIdx = 0; G.tick++; }
  if (G.tick > C.OPEN.SERVICE_TICKS) startClosing();
  else beginTurn();
}
function shiftHopper(s) {
  const n = s.slots.length;
  for (let i = 0; i < n - 1; i++) s.slots[i] = s.slots[i + 1];
  s.slots[n - 1] = null;
}
function runStations(p) {
  for (const k of ST) {
    const s = p.stations[k];
    if (!s.staffed || s.jammed || !s.slots.some(Boolean)) continue;
    const out = s.slots[0];
    if (out) {
      const cube = { id: out.id, ing: out.ing, st: k };
      if (!routeCube(p, cube)) {
        s.jammed = true;
        p.stats.jams++;
        log(`JAM! ${pn(p)}'s ${stN(k)} finished ${cubeTxt(cube)} with nowhere to put it (no matching ticket, freshness column 1 full). Station stopped.`, 'bad');
        continue;
      }
    }
    shiftHopper(s);
  }
}
function allTickets(p) { return [...p.tickets, ...p.regulars.filter(r => !r.servedToday)]; }
function routeCube(p, cube) {
  for (const t of allTickets(p)) {
    const i = t.card.steps.findIndex((s, j) => !t.filled[j] && s.ing === cube.ing && s.st === cube.st);
    if (i < 0) continue;
    t.filled[i] = cube;
    log(`${pn(p)}'s ${stN(cube.st)} sends ${cubeTxt(cube)} to-go onto ${esc(t.card.name)}.`);
    if (t.filled.every(Boolean)) serveTicket(p, t, {});
    return true;
  }
  if (p.fresh[0].length < C.FRESHNESS.COLUMN_CAPACITY) {
    p.fresh[0].push(cube);
    log(`${pn(p)}'s ${stN(cube.st)} finishes ${cubeTxt(cube)} → freshness table.`);
    return true;
  }
  return false;
}
// take matching cubes from the freshness table, oldest column first
function takeFromFresh(p, steps, alreadyFilled, commit) {
  const used = new Set();
  const got = steps.map((s, i) => {
    if (alreadyFilled && alreadyFilled[i]) return alreadyFilled[i];
    for (let c = p.fresh.length - 1; c >= 0; c--) {
      const cube = p.fresh[c].find(x => !used.has(x.id) && x.ing === s.ing && x.st === s.st);
      if (cube) { used.add(cube.id); return cube; }
    }
    return null;
  });
  if (commit) p.fresh = p.fresh.map(col => col.filter(x => !used.has(x.id)));
  return got;
}
const missingFor = (p, t) => takeFromFresh(p, t.card.steps, t.filled, false).filter(x => !x).length;
function findTicket(p, tuid) { return p.tickets.find(t => t.uid === tuid) || p.regulars.find(t => t.uid === tuid); }

function claimCustomer(cuid) {
  const p = openPlayer();
  if (p.tickets.length >= railSize(p)) return;
  const i = G.customerRow.findIndex(c => c.uid === cuid);
  if (i < 0) return;
  const card = G.customerRow.splice(i, 1)[0];
  p.tickets.push({ uid: uid(), card, filled: card.steps.map(() => null), regular: false });
  log(`${pn(p)} claims ${card.critic ? 'the CRITIC ' : ''}${esc(card.name)} (patience ${card.patience}).`);
  endTurn();
}
function serveAction(tuid) {
  const p = openPlayer();
  const targets = p.upgrades.passWindow ? allTickets(p) : [findTicket(p, tuid)].filter(Boolean);
  if (!targets.length) return;
  for (const t of targets) {
    const before = t.filled.filter(Boolean).length;
    t.filled = takeFromFresh(p, t.card.steps, t.filled, true);
    const moved = t.filled.filter(Boolean).length - before;
    if (t.filled.every(Boolean)) serveTicket(p, t, {});
    else if (moved) log(`${pn(p)} assembles ${moved} cube(s) onto ${esc(t.card.name)} (${t.card.steps.length - t.filled.filter(Boolean).length} still missing).`);
  }
  endTurn();
}
function shortPlate(tuid) {
  const p = openPlayer();
  const t = findTicket(p, tuid);
  if (!t) return;
  const m = missingFor(p, t);
  if (m < 1 || m > C.SERVING.SHORT_PLATE_MAX_MISSING) return;
  t.filled = takeFromFresh(p, t.card.steps, t.filled, true);
  serveTicket(p, t, { short: true });
  endTurn();
}
function assemblable(p) {
  return Object.keys(C.DISHES).filter(k => {
    const steps = C.DISHES[k].steps.map(([ing, st]) => ({ ing, st }));
    return takeFromFresh(p, steps, null, false).every(Boolean);
  });
}
function plateDish(dish) {
  const p = openPlayer();
  if (!p.upgrades.warmingPlate || p.plates.length >= C.WARMING_PLATE.CAPACITY || !assemblable(p).includes(dish)) return;
  const steps = C.DISHES[dish].steps.map(([ing, st]) => ({ ing, st }));
  takeFromFresh(p, steps, null, true);
  p.plates.push({ uid: uid(), dish, age: 0 });
  log(`${pn(p)} plates ${esc(C.DISHES[dish].name)} onto the warming plate.`);
  endTurn();
}
function servePlate(puid, target, tuid) {
  const p = openPlayer();
  const pi = p.plates.findIndex(x => x.uid === puid);
  if (pi < 0) return;
  const plate = p.plates[pi];
  let t;
  if (target === 'row') {
    const ci = G.customerRow.findIndex(c => c.uid === tuid);
    if (ci < 0 || G.customerRow[ci].dish !== plate.dish) return;
    const card = G.customerRow.splice(ci, 1)[0];
    t = { uid: uid(), card, filled: [], regular: false };
    log(`${pn(p)} serves ${esc(card.name)} from the warming plate straight to a waiting customer.`);
  } else {
    t = findTicket(p, tuid);
    if (!t || t.card.dish !== plate.dish) return;
    const wasted = t.filled.filter(Boolean).length;
    log(`${pn(p)} serves ${esc(t.card.name)} from the warming plate${wasted ? ` (${wasted} cube(s) on the ticket wasted)` : ''}.`);
  }
  p.plates.splice(pi, 1);
  serveTicket(p, t, { plateAge: plate.age });
  endTurn();
}
function serveTicket(p, t, { short = false, plateAge = 0 }) {
  const card = t.card;
  let value = dishPrice(p, card);
  const parts = [`$${card.price} + ★${p.rep}`];
  if (short && C.SERVING.SHORT_PLATE_PRICE_PENALTY) { value -= C.SERVING.SHORT_PLATE_PRICE_PENALTY; parts.push(`short −${C.SERVING.SHORT_PLATE_PRICE_PENALTY}`); }
  if (plateAge) { value -= plateAge * C.WARMING_PLATE.DECAY_PER_ROUND; parts.push(`plate age ${plateAge} −${plateAge * C.WARMING_PLATE.DECAY_PER_ROUND}`); }
  value = Math.max(0, value);
  if (p.buzz > 0) { value *= C.CRITICS.BUZZ_MULTIPLIER; p.buzz--; parts.push(`buzz ×${C.CRITICS.BUZZ_MULTIPLIER}`); }
  p.stats.served++;
  log(`${pn(p)} SERVES ${card.critic ? 'critic ' : ''}${t.regular ? 'Regular ' : ''}${esc(card.name)}${short ? ' SHORT' : ''}.`, 'serve');
  addMoney(p, value, parts.join(', '));
  if (short) p.stats.short++;
  // every completed ticket moves reputation: up when served in full, down when short
  if (short) addRep(p, -(card.critic ? C.CRITICS.SHORT_REP_LOSS : C.SERVING.SHORT_PLATE_REP_LOSS), card.critic ? 'critic served short — no reward' : 'short plate');
  else {
    addRep(p, C.SERVING.FULL_REP_GAIN, 'happy customer');
    if (card.critic) { p.stats.critics++; criticReward(p, card); }
  }

  if (t.regular) { t.servedToday = true; t.filled = card.steps.map(() => null); }
  else {
    p.tickets = p.tickets.filter(x => x !== t);
    discardCustomer(card);
  }
}
function criticReward(p, card) {
  let r = card.reward;
  if (r === 'regular' && p.regulars.length >= C.CRITICS.MAX_REGULARS) {
    log(`${pn(p)} already has ${C.CRITICS.MAX_REGULARS} Regulars — critic gives a rep token instead.`);
    r = 'rep';
  }
  if (r === 'rep') addRep(p, C.CRITICS.REP_TOKEN, 'critic: reputation token');
  if (r === 'buzz') { p.buzz += C.CRITICS.BUZZ_CUSTOMERS; log(`${pn(p)} gets critic BUZZ: next ${C.CRITICS.BUZZ_CUSTOMERS} customers pay ×${C.CRITICS.BUZZ_MULTIPLIER}.`, 'rep'); }
  if (r === 'upgrade') { p.freeUpgrades++; log(`${pn(p)} gets a critic free-upgrade token (used on the next upgrade bought in prep).`, 'rep'); }
  if (r === 'regular') {
    // auto-pick the priciest non-critic customer in the row; else draw one from the deck
    const pool = G.customerRow.filter(c => !c.critic).sort((a, b) => b.price - a.price);
    let card2 = pool[0];
    if (card2) G.customerRow.splice(G.customerRow.indexOf(card2), 1);
    else {
      const i = G.customerDeck.findIndex(c => !c.critic);
      if (i >= 0) card2 = G.customerDeck.splice(i, 1)[0];
    }
    if (!card2) { addRep(p, C.CRITICS.REP_TOKEN, 'critic: no customer left to become a Regular'); return; }
    p.regulars.push({ uid: uid(), card: card2, filled: card2.steps.map(() => null), regular: true, servedToday: true });
    log(`${pn(p)} gains a REGULAR who orders ${esc(card2.name)} every day (from tomorrow).`, 'rep');
  }
}
function clearJam(st) {
  const p = openPlayer();
  const s = p.stations[st];
  if (!s.jammed) return;
  const out = s.slots[0];
  s.jammed = false;
  if (out) {
    const cube = { id: out.id, ing: out.ing, st };
    if (!routeCube(p, cube)) log(`${pn(p)} clears the ${stN(st)} jam — ${cubeTxt(cube)} still has nowhere to go and is thrown out.`, 'bad');
    else log(`${pn(p)} clears the ${stN(st)} jam.`);
  }
  shiftHopper(s);
  endTurn();
}
function sendToMarket(st) {
  const p = openPlayer();
  const s = p.stations[st];
  if (p.marketSent || !s.staffed) return;
  s.staffed = false;
  s.sent = true;
  p.marketSent = true;
  G.arrivals.push(p.id);
  log(`${pn(p)} sends the ${stN(st)} meeple to the market — arrives #${G.arrivals.length}. ${stN(st)} is off for the day.`);
  endTurn();
}
function waitAction() {
  log(`${pn(openPlayer())} waits.`);
  endTurn();
}

// PHASE 4 — CLOSING
function startClosing() {
  G.phase = 'closing';
  log('Closing', 'phase');
  G.wageQueue = G.players.filter(p => p.scheduled > 0).map(p => p.id);
  G.wageIdx = 0;
  G.pay = { cubes: new Set(), plate: null };
  if (!G.wageQueue.length) finishClosing();
  else render();
}
const wagePlayer = () => P(G.wageQueue[G.wageIdx]);
const wagesOwed = p => p.scheduled * C.WAGES.PER_MEEPLE;
function togglePayCube(id) {
  const p = wagePlayer();
  if (G.pay.cubes.has(id)) G.pay.cubes.delete(id);
  else if (G.pay.cubes.size * C.WAGES.FOOD_CUBE_VALUE < wagesOwed(p)) { G.pay.cubes.add(id); G.pay.plate = null; }
  render();
}
function togglePayPlate(puid) {
  G.pay.plate = G.pay.plate === puid ? null : puid;
  if (G.pay.plate) G.pay.cubes.clear();
  render();
}
function confirmWages() {
  const p = wagePlayer();
  const owed = wagesOwed(p);
  if (G.pay.plate) {
    const pl = p.plates.find(x => x.uid === G.pay.plate);
    p.plates = p.plates.filter(x => x !== pl);
    log(`${pn(p)} pays the full $${owed} wage bill with a plated ${esc(C.DISHES[pl.dish].name)}.`, 'money');
  } else {
    const ids = G.pay.cubes;
    const food = Math.min(owed, ids.size * C.WAGES.FOOD_CUBE_VALUE);
    p.storage = p.storage.filter(c => !ids.has(c.id));
    p.fresh = p.fresh.map(col => col.filter(c => !ids.has(c.id)));
    if (ids.size) log(`${pn(p)} pays $${food} of wages in food (${ids.size} cube(s)).`, 'money');
    const rest = owed - food;
    if (rest > 0) {
      if (p.money >= rest) addMoney(p, -rest, 'wages');
      else {
        const short = rest - p.money;
        if (p.money > 0) addMoney(p, -p.money, 'wages (partial)');
        p.stats.unpaid += short;
        log(`${pn(p)} is $${short} short on wages!`, 'bad');
        addRep(p, -C.WAGES.UNPAID_REP_LOSS, 'unpaid wages');
      }
    }
  }
  G.pay = { cubes: new Set(), plate: null };
  G.wageIdx++;
  if (G.wageIdx >= G.wageQueue.length) finishClosing();
  else render();
}
function finishClosing() {
  for (const p of G.players) {
    const cols = p.fresh;
    const spoiled = cols[cols.length - 1];
    for (let i = cols.length - 1; i > 0; i--) cols[i] = cols[i - 1];
    cols[0] = [];
    if (spoiled.length) {
      p.stats.spoiled += spoiled.length;
      log(`${pn(p)}: ${spoiled.length} cube(s) spoil (${spoiled.map(cubeTxt).join(', ')}).`, 'bad');
    }
    for (const pl of p.plates) pl.age++;
    if (p.plates.length) log(`${pn(p)}'s plated dishes cool (−$${C.WARMING_PLATE.DECAY_PER_ROUND} each).`);
    for (const t of [...p.tickets]) {
      t.card.patience -= C.CUSTOMERS.PATIENCE_DECAY;
      if (t.card.patience > 0) continue;
      p.tickets = p.tickets.filter(x => x !== t);
      p.stats.walkouts++;
      log(`${pn(p)}'s ${t.card.critic ? 'critic' : 'customer'} (${esc(t.card.name)}) runs out of patience and leaves.`, 'bad');
      addRep(p, -(t.card.critic ? C.CRITICS.LATE_REP_LOSS : C.CUSTOMERS.WALKOUT_REP_LOSS), t.card.critic ? 'critic served late' : 'walkout');
      discardCustomer(t.card);
    }
    for (const k of ST) p.stations[k].sent = false;
  }
  for (const c of [...G.customerRow]) {
    c.patience -= C.CUSTOMERS.PATIENCE_DECAY;
    if (c.patience <= 0) {
      G.customerRow.splice(G.customerRow.indexOf(c), 1);
      log(`Unclaimed ${c.critic ? 'critic' : 'customer'} (${esc(c.name)}) leaves the row.`);
      discardCustomer(c);
    }
  }
  if (G.marketRow.length) log(`${G.marketRow.length} unpicked market card(s) discarded.`);
  G.marketDiscard.push(...G.marketRow);
  G.marketRow = [];
  refillMarket();
  refillCustomers();
  log(`End of day ${G.day}: ${G.players.map(p => `${pn(p)} $${p.money} ★${p.rep}`).join(' · ')}`);
  G.day++;
  if (G.day > C.ROUNDS) endGame();
  else startDay();
}

// END
function scoreOf(p) {
  const repScore = p.rep * C.SCORING.REP_MULTIPLIER;
  return { money: p.money, rep: p.rep, repScore, final: Math.min(p.money, repScore), other: Math.max(p.money, repScore) };
}
function ranking() {
  return G.players.slice().sort((a, b) => {
    const A = scoreOf(a), B = scoreOf(b);
    return B.final - A.final || B.other - A.other;
  });
}
function endGame() {
  G.phase = 'end';
  G.day = C.ROUNDS;
  log('Game over', 'phase');
  for (const p of ranking()) {
    const s = scoreOf(p);
    log(`${pn(p)}: money $${s.money}, reputation ★${s.rep}${C.SCORING.REP_MULTIPLIER !== 1 ? ` (×${C.SCORING.REP_MULTIPLIER} = ${s.repScore})` : ''} → final ${s.final}`);
  }
  render();
}

// ---------- rendering ----------
function cubeHtml(c, attrs = '', extra = '') {
  const ing = C.INGREDIENTS[c.ing];
  const dark = c.ing === 'dairy' || c.ing === 'grain';
  return `<span class="cube ${c.st ? 'prepped' : ''} ${extra}" style="background:${ing.color};color:${dark ? '#222' : '#fff'}" title="${cubeTxt(c)}" ${attrs}>${ing.short}${c.st ? `<sub>${C.STATIONS[c.st].short}</sub>` : ''}</span>`;
}
const stepsHtml = (steps, filled = []) => steps.map((s, i) => cubeHtml(s, '', filled[i] ? 'done' : 'need')).join('');
const btn = (label, a, x = '', y = '', z = '', dis = false, cls = '') =>
  `<button class="${cls}" data-a="${a}" data-x="${x}" data-y="${y}" data-z="${z}" ${dis ? 'disabled' : ''}>${label}</button>`;

function customerCard(c, buttons = '') {
  return `<div class="card customer ${c.critic ? 'critic' : ''}">
    <div class="ctitle">${c.critic ? '<span class="tag">CRITIC</span> ' : ''}${esc(c.name)}</div>
    <div class="steps">${stepsHtml(c.steps)}</div>
    <div class="cmeta">$${c.price} · ⏳${c.patience}${c.critic ? `<br><small>reward: ${rewardName(c.reward)}</small>` : ''}</div>
    ${buttons ? `<div class="cbtns">${buttons}</div>` : ''}
  </div>`;
}

function renderShared() {
  const mp = G.phase === 'market' ? marketPlayer() : null;
  const op = G.phase === 'open' ? openPlayer() : null;
  const market = G.marketRow.map(c => `<div class="card market">
      <div class="steps">${c.cubes.map(ing => cubeHtml({ ing })).join('')}</div>
      ${mp ? btn(`Buy $${cardPrice(mp)}`, 'buy', c.uid, '', '', mp.money < cardPrice(mp)) : ''}
    </div>`).join('') || '<em>empty</em>';
  const customers = G.customerRow.map(c => {
    let b = '';
    if (op) {
      b += btn('Claim', 'claim', c.uid, '', '', op.tickets.length >= railSize(op));
      for (const pl of op.plates) if (pl.dish === c.dish) b += btn(`Serve from plate`, 'servePlate', pl.uid, 'row', c.uid);
    }
    return customerCard(c, b);
  }).join('') || '<em>empty</em>';
  return `<section class="shared">
    <div class="rowwrap"><h3>Market <small>${G.marketDeck.length} in deck</small></h3><div class="row">${market}</div></div>
    <div class="rowwrap"><h3>Customers <small>${G.customerDeck.length} in deck</small></h3><div class="row">${customers}</div></div>
  </section>`;
}

function renderBoard(p) {
  const prepMe = G.phase === 'prep' && G.prepActive && prepPlayer() === p;
  const openMe = G.phase === 'open' && openPlayer() === p;
  const payMe = G.phase === 'closing' && wagePlayer() === p;
  const active = prepMe || openMe || payMe || (G.phase === 'market' && marketPlayer() === p);

  const storage = Array.from({ length: C.STORAGE_SIZE }, (_, i) => {
    const c = p.storage[i];
    if (!c) return '<span class="cell"></span>';
    if (prepMe) return `<span class="cell">${cubeHtml(c, `data-a="sel" data-x="${c.id}"`, G.sel === c.id ? 'selected' : 'click')}</span>`;
    if (payMe) return `<span class="cell">${cubeHtml(c, `data-a="payCube" data-x="${c.id}"`, G.pay.cubes.has(c.id) ? 'selected' : 'click')}</span>`;
    return `<span class="cell">${cubeHtml(c)}</span>`;
  }).join('');

  const stations = ST.map(k => {
    const s = p.stations[k];
    const n = s.slots.length;
    let slots = '';
    for (let i = n - 1; i >= 0; i--) {
      const c = s.slots[i];
      let inner = '';
      if (c) inner = prepMe && p.prepLoaded.has(c.id) ? cubeHtml(c, `data-a="unload" data-x="${k}" data-y="${i}"`, 'click') : cubeHtml(c);
      slots += `<div class="slot ${i === 0 ? 'mouth' : ''}">${inner}</div>`;
    }
    let ctrl = '';
    if (prepMe) {
      ctrl += btn(s.staffed ? '👤 Staffed' : '○ Unstaffed', 'staff', k, '', '', false, s.staffed ? 'on' : '');
      const canUp = n > C.HOPPER.MIN_SLOTS && topEmptySlot(s) >= 0 && (p.money >= C.HOPPER.UPGRADE_COST || p.freeUpgrades > 0);
      const cost = p.freeUpgrades ? 'free' : `$${C.HOPPER.UPGRADE_COST}`;
      ctrl += btn(`−slot → meeple (${cost})`, 'upStation', k, 'staff', '', !canUp || p.meeples >= C.MEEPLES_MAX, 'small');
      ctrl += btn(`−slot → dining ★ (${cost})`, 'upStation', k, 'dining', '', !canUp, 'small');
    } else {
      ctrl += `<div class="sstate">${s.sent ? '🛒 at market' : s.staffed ? '👤 staffed' : '○ idle'}</div>`;
    }
    if (s.jammed) ctrl += `<div class="jam">JAMMED</div>`;
    if (openMe && s.jammed) ctrl += btn('Clear jam', 'clearJam', k);
    if (openMe && s.staffed && !p.marketSent) ctrl += btn('Send to market', 'sendMarket', k, '', '', false, 'small');
    return `<div class="station ${s.staffed ? 'staffed' : ''} ${s.jammed ? 'jammed' : ''}">
      <div class="sthead">${C.STATIONS[k].name} <small>${n} slots</small></div>
      <div class="hopper ${prepMe && G.sel ? 'target' : ''}" ${prepMe ? `data-a="load" data-x="${k}"` : ''}>${slots}</div>
      ${ctrl}
    </div>`;
  }).join('');

  const freshCols = p.fresh.map((col, i) => `<div class="fcol ${i === p.fresh.length - 1 ? 'last' : ''}">
      <div class="fhead">${i === 0 ? 'new' : i === p.fresh.length - 1 ? 'spoils next' : `day ${i + 1}`} <small>${col.length}${i === 0 ? '/' + C.FRESHNESS.COLUMN_CAPACITY : ''}</small></div>
      <div class="fcubes">${col.map(c => payMe ? cubeHtml(c, `data-a="payCube" data-x="${c.id}"`, G.pay.cubes.has(c.id) ? 'selected' : 'click') : cubeHtml(c)).join('')}</div>
    </div>`).join('');

  const ticketHtml = t => {
    let b = '';
    if (openMe && !(t.regular && t.servedToday)) {
      const miss = missingFor(p, t);
      b += btn(miss === 0 ? 'Serve' : 'Assemble', 'serve', t.uid, '', '', miss === t.card.steps.length - t.filled.filter(Boolean).length && miss > 0 && !p.upgrades.passWindow);
      if (miss >= 1 && miss <= C.SERVING.SHORT_PLATE_MAX_MISSING) b += btn(`Short plate (−★${t.card.critic ? C.CRITICS.SHORT_REP_LOSS : C.SERVING.SHORT_PLATE_REP_LOSS})`, 'short', t.uid);
      for (const pl of p.plates) if (pl.dish === t.card.dish) b += btn('Serve from plate', 'servePlate', pl.uid, 'ticket', t.uid);
    }
    return `<div class="card ticket ${t.card.critic ? 'critic' : ''} ${t.regular ? 'regular' : ''}">
      <div class="ctitle">${t.regular ? '<span class="tag reg">REGULAR</span> ' : t.card.critic ? '<span class="tag">CRITIC</span> ' : ''}${esc(t.card.name)}</div>
      <div class="steps">${stepsHtml(t.card.steps, t.filled)}</div>
      <div class="cmeta">$${dishPrice(p, t.card)}${t.regular ? (t.servedToday ? ' · served today' : ' · daily') : ` · ⏳${t.card.patience}`}</div>
      ${b ? `<div class="cbtns">${b}</div>` : ''}
    </div>`;
  };
  const tickets = p.tickets.map(ticketHtml).join('') + Array.from({ length: Math.max(0, railSize(p) - p.tickets.length) }, () => '<div class="card ticket empty">open ticket</div>').join('');
  const regulars = p.regulars.map(ticketHtml).join('');

  const plates = p.upgrades.warmingPlate ? `<div class="plates"><h4>Warming plate <small>${p.plates.length}/${C.WARMING_PLATE.CAPACITY}</small></h4>
      ${p.plates.map(pl => `<span class="plate ${payMe && G.pay.plate === pl.uid ? 'selected' : ''}" ${payMe ? `data-a="payPlate" data-x="${pl.uid}"` : ''}>${esc(C.DISHES[pl.dish].name)} <small>(−$${pl.age * C.WARMING_PLATE.DECAY_PER_ROUND})</small></span>`).join('') || '<em>empty</em>'}
    </div>` : '';

  const upgrades = Object.entries(C.UPGRADES).map(([k, u]) => {
    if (p.upgrades[k]) return `<span class="badge on" title="${esc(u.desc)}">${esc(u.name)}</span>`;
    if (prepMe) return btn(`${esc(u.name)} ${p.freeUpgrades ? 'free' : '$' + u.cost}<br><small>${esc(u.desc)}</small>`, 'upgrade', k, '', '', p.money < u.cost && !p.freeUpgrades, 'small up');
    return '';
  }).join('');

  const flags = [
    p.buzz ? `<span class="badge hot">BUZZ ×${C.CRITICS.BUZZ_MULTIPLIER} (${p.buzz})</span>` : '',
    p.freeUpgrades ? `<span class="badge hot">free upgrade ×${p.freeUpgrades}</span>` : '',
    p.dining ? `<span class="badge">dining ×${p.dining}</span>` : '',
  ].join('');

  return `<div class="board ${active ? 'active' : ''}" style="--pc:${p.color}">
    <div class="bhead">
      <span class="pname">${esc(p.name)}</span>
      <span class="stat">$${p.money}</span><span class="stat">★${p.rep}</span>
      <span class="stat" title="staffed / meeples">👤${staffedCount(p)}/${p.meeples}</span>
      ${G.phase === 'open' || G.phase === 'closing' ? `<span class="stat" title="wages due">wages $${wagesOwed(p)}</span>` : ''}
      ${flags}
    </div>
    <div class="bmain">
      <div class="storage"><h4>Storage <small>${p.storage.length}/${C.STORAGE_SIZE}</small></h4><div class="grid">${storage}</div></div>
      <div class="stations">${stations}</div>
    </div>
    <div class="fresh"><h4>Freshness table</h4><div class="fcols">${freshCols}</div></div>
    <div class="rail"><h4>Ticket rail <small>${p.tickets.length}/${railSize(p)}</small></h4><div class="row">${tickets}${regulars}</div></div>
    ${plates}
    <div class="upgrades">${upgrades}</div>
  </div>`;
}

function renderTop() {
  const phaseName = { market: '1 · Market', prep: '2 · Prep race', open: '3 · Open', closing: '4 · Closing', end: 'Game over' }[G.phase];
  let prompt = '', actions = '';
  if (G.phase === 'market') {
    const p = marketPlayer();
    prompt = `${pn(p)} picks a card (${p.marketCards + 1}/${C.MARKET.MAX_CARDS_PER_PLAYER}, $${cardPrice(p)} each).`;
    actions = btn('Pass', 'passMarket');
  } else if (G.phase === 'prep') {
    const p = prepPlayer();
    if (!G.prepActive) { prompt = `Hand the screen to ${pn(p)}.`; actions = btn(`Start ${esc(p.name)}'s prep`, 'startPrep', '', '', '', false, 'primary'); }
    else {
      prompt = `${pn(p)} preps: click a storage cube, then a hopper (top-loads). Click a cube you loaded to take it back. Toggle staff; buy upgrades.`;
      actions = `${C.PREP.TIMER_SECONDS ? '<span id="timer" class="timer"></span>' : ''}${btn('Done — stop the clock', 'donePrep', '', '', '', false, 'primary')}`;
    }
  } else if (G.phase === 'open') {
    const p = openPlayer();
    prompt = `Tick ${G.tick}/${C.OPEN.SERVICE_TICKS} — ${pn(p)}'s action (stations already ran). Claim, Assemble/Serve, Short plate, Clear jam, Send to market${p.upgrades.warmingPlate ? ', Plate' : ''} — or Wait.`;
    if (p.upgrades.warmingPlate && p.plates.length < C.WARMING_PLATE.CAPACITY) actions += assemblable(p).map(d => btn(`Plate ${esc(C.DISHES[d].name)}`, 'plate', d, '', '', false, 'small')).join('');
    actions += btn('Wait', 'wait', '', '', '', false, 'primary');
  } else if (G.phase === 'closing') {
    const p = wagePlayer();
    const owed = wagesOwed(p);
    const food = G.pay.plate ? owed : Math.min(owed, G.pay.cubes.size * C.WAGES.FOOD_CUBE_VALUE);
    prompt = `${pn(p)} owes $${owed} wages (${p.scheduled} meeple(s)). Click storage/freshness cubes to pay $${C.WAGES.FOOD_CUBE_VALUE} each in food${p.plates.length ? ', or a plated dish to cover it all' : ''}. Food: $${food}, coins: $${owed - food}${owed - food > p.money ? ' — NOT ENOUGH, you will lose reputation' : ''}.`;
    actions = btn('Pay wages', 'payWages', '', '', '', false, 'primary');
  } else if (G.phase === 'end') {
    prompt = 'Game over — see summary.';
    actions = btn('New game', 'restart', '', '', '', false, 'primary');
  }
  const order = G.phase === 'market' ? G.marketOrder : G.phase === 'prep' ? G.prepQueue : G.phase === 'open' ? G.openOrder : [];
  return `<div class="topline"><b>Kitchen Line</b> <span>Day ${G.day}/${C.ROUNDS}</span> <span class="phase">${phaseName}</span>
      ${order.length ? `<span class="order">Order: ${order.map(id => pn(P(id))).join(' → ')}</span>` : ''}</div>
    <div class="prompt"><span>${prompt}</span><span class="actions">${actions}</span></div>`;
}

function renderLog() {
  const me = G.phase === 'prep' && G.prepActive ? G.prepQueue[G.prepIdx] : null;
  return G.log.filter(e => e.secret === null || G.phase !== 'prep' || e.secret === me).slice(-500).map(e => `<div class="le ${e.cls}">${e.cls === 'day' || e.cls === 'phase' ? '' : `<span class="ld">D${e.day}</span> `}${e.html}</div>`).join('');
}

function renderOverlay() {
  if (G.phase === 'prep' && !G.prepActive) {
    const p = prepPlayer();
    return `<div class="overlay opaque"><div class="modal">
      <h2>Prep race — ${pn(p)}</h2>
      <p>${C.PREP.TIMER_SECONDS ? `You get ${C.PREP.TIMER_SECONDS} seconds. Your finishing time sets Open-phase turn order (fastest first).` : 'No timer.'}</p>
      <p><b>Hidden selection:</b> everyone else looks away. Other boards and your actions stay hidden until Open.</p>
      <p>Load hoppers, set staffing ($${C.WAGES.PER_MEEPLE}/meeple at Closing, used or not), buy upgrades.</p>
      ${btn(`Start ${esc(p.name)}'s prep`, 'startPrep', '', '', '', false, 'primary')}
    </div></div>`;
  }
  if (G.phase === 'end') {
    const rows = ranking().map((p, i) => {
      const s = scoreOf(p);
      const lower = s.money <= s.repScore ? 'money' : 'rep';
      return `<tr><td>${i + 1}</td><td>${pn(p)}</td>
        <td class="${lower === 'money' ? 'low' : ''}">$${s.money}</td>
        <td class="${lower === 'rep' ? 'low' : ''}">★${s.rep}${C.SCORING.REP_MULTIPLIER !== 1 ? ` (${s.repScore})` : ''}</td>
        <td><b>${s.final}</b></td>
        <td>${p.stats.served} (${p.stats.short} short)</td><td>${p.stats.critics}</td><td>${p.stats.jams}</td><td>${p.stats.spoiled}</td><td>${p.stats.walkouts}</td><td>$${p.stats.unpaid}</td></tr>`;
    }).join('');
    return `<div class="overlay"><div class="modal wide">
      <h2>Final results</h2>
      <p>Final score = the lower of money and reputation${C.SCORING.REP_MULTIPLIER !== 1 ? ` × ${C.SCORING.REP_MULTIPLIER}` : ''} (the limiting track is highlighted). Ties: higher other track.</p>
      <table class="summary"><tr><th>#</th><th>Player</th><th>Money</th><th>Reputation</th><th>Final</th><th>Served</th><th>Critics</th><th>Jams</th><th>Spoiled</th><th>Walkouts</th><th>Unpaid</th></tr>${rows}</table>
      <div class="mbtns">${btn('Close (review board & log)', 'closeSummary')} ${btn('New game', 'restart', '', '', '', false, 'primary')}</div>
    </div></div>`;
  }
  return '';
}

function updateTimer() {
  const el = document.getElementById('timer');
  if (!el || !G || G.phase !== 'prep' || !G.prepActive) return;
  const left = Math.max(0, prepLeft());
  el.textContent = `⏱ ${left.toFixed(1)}s`;
  el.classList.toggle('urgent', left < 15);
}

// prep is a hidden selection: only the player at the screen sees a board
function boardsHtml() {
  if (G.phase !== 'prep') return G.players.map(renderBoard).join('');
  const hidden = G.players.filter(p => !(G.prepActive && prepPlayer() === p))
    .map(p => `<div class="board hidden" style="--pc:${p.color}"><span class="pname">${esc(p.name)}</span> — ${p.prepTime !== null ? 'prepped' : 'waiting'} (hidden)</div>`).join('');
  return (G.prepActive ? renderBoard(prepPlayer()) : '') + hidden;
}

function render() {
  const app = document.getElementById('app');
  if (!G) { app.innerHTML = renderSetup(); return; }
  app.innerHTML = `<header>${renderTop()}</header>
    <div class="layout"><main>${renderShared()}<div class="boards n${G.players.length}">${boardsHtml()}</div></main>
    <aside class="log"><h3>Log</h3><div id="logbody">${renderLog()}</div></aside></div>
    ${G.hideSummary ? '' : renderOverlay()}`;
  const lb = document.getElementById('logbody');
  lb.scrollTop = lb.scrollHeight;
  updateTimer();
}

function renderSetup() {
  const inputs = Array.from({ length: C.PLAYERS.MAX }, (_, i) =>
    `<label>Player ${i + 1} <input id="pname${i}" value="${['Ada', 'Bo', 'Cy', 'Di'][i] || 'P' + (i + 1)}"></label>`).join('');
  return `<div class="overlay"><div class="modal">
    <h2>Kitchen Line — rules prototype</h2>
    <label>Players <select id="pcount">${Array.from({ length: C.PLAYERS.MAX - C.PLAYERS.MIN + 1 }, (_, i) => C.PLAYERS.MIN + i).map(n => `<option ${n === C.PLAYERS.MIN ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <div class="names">${inputs}</div>
    <p><small>Hot-seat on one screen. Tunables in config.js.</small></p>
    ${btn('Start game', 'newGame', '', '', '', false, 'primary')}
  </div></div>`;
}

// ---------- input ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const { a, x, y, z } = el.dataset;
  const nx = +x;
  switch (a) {
    case 'newGame': {
      const n = +document.getElementById('pcount').value;
      const names = Array.from({ length: n }, (_, i) => document.getElementById('pname' + i).value.trim() || `P${i + 1}`);
      newGame(names);
      break;
    }
    case 'restart': stopTimer(); G = null; render(); break;
    case 'closeSummary': G.hideSummary = true; render(); break;
    case 'buy': buyCard(nx); break;
    case 'passMarket': passMarket(); break;
    case 'startPrep': beginPrepTurn(); break;
    case 'donePrep': finishPrep(false); break;
    case 'sel': selectCube(nx); break;
    case 'load': loadHopper(x); break;
    case 'unload': unloadCube(x, +y); break;
    case 'staff': toggleStaff(x); break;
    case 'upgrade': buyUpgrade(x); break;
    case 'upStation': upgradeStation(x, y); break;
    case 'claim': claimCustomer(nx); break;
    case 'serve': serveAction(nx); break;
    case 'short': shortPlate(nx); break;
    case 'plate': plateDish(x); break;
    case 'servePlate': servePlate(nx, y, +z); break;
    case 'clearJam': clearJam(x); break;
    case 'sendMarket': sendToMarket(x); break;
    case 'wait': waitAction(); break;
    case 'payCube': togglePayCube(nx); break;
    case 'payPlate': togglePayPlate(nx); break;
    case 'payWages': confirmWages(); break;
  }
});

render();
