# Kitchen Line — rules prototype

Open `index.html` in a browser. No build step and no server needed. Hot-seat play for 2–4 players on one screen.
Every number is in `config.js`. Edit it and reload the page.

Files: `index.html`, `style.css`, `config.js`, `game.js`.

## Rules as implemented

**Setup.** Each player starts with $10, ★3 reputation and 2 meeples. Knife and Pan start staffed, and storage holds 3 random cubes.
Ingredients are Veg, Meat, Fish, Grain and Dairy. A customer row of 6 and a market row of 5 are dealt out. The game lasts 7 days.

### Player board
- **Storage:** 9 raw cubes. Raw cubes never spoil.
- **Stations:** Knife, Pan, Pot, Fryer. Each has a 5-slot hopper. Slot 1, the bottom slot, is the mouth.
- **Freshness table:** 4 columns of prepped cubes. New cubes always enter column 1, which holds 4 cubes.
- **Ticket rail:** 2 claimed customers. Regulars sit beside the rail and don't use a slot.
- **Warming plate:** only appears if you buy the upgrade. It holds 2 dishes.

### 1 · Market
- Pick order on day 1 is random. After that, it's the order players' meeples reached the market during the previous Open phase. Players who didn't send a meeple follow, in last Open's turn order.
- Picking goes round the table one card at a time until everyone has passed or holds 3 cards. A card costs $2 flat whatever its cube count.
- Cubes go into storage. Any that don't fit are discarded.
- If you can't afford a card you auto-pass.
- The row does not refill during the market. Unpicked cards are discarded at Closing.

### 2 · Prep race (hot-seat)
- **Hidden selection.** Each player takes a private timed turn, 90 seconds by default, while the others look away. Only the active player's board is shown, and their prep actions, spend and finish time stay out of the log until Open starts. The first player rotates each day.
- During your turn you can:
  - **Load cubes.** Click a storage cube, then a hopper. Cubes enter at the top. Anything already in the hopper above the first gap slides down one to make room.
  - **Unload.** Click a cube you loaded this turn to put it back in storage.
  - **Staff stations.** Toggle staff on and off, up to your meeple count. Yesterday's plan is pre-filled.
  - **Buy upgrades** (see below).
  - **Upgrade a station:** $3, removes the topmost empty slot, minimum 2 slots. The removed piece becomes either a staff meeple or a dining room piece (+1★).
- Pressing Done stops the clock and records your time. Running out of time records the full 90 seconds.
- Fastest time acts first in Open. Ties go to whoever prepped earlier.

### 3 · Open
- The day runs for **8 service ticks**. On each tick, every player in turn order:
  1. **Runs their stations automatically.** Each staffed, unjammed station pushes its bottom cube out as a prepped cube, and its hopper slides down one.
  2. **Takes one action.**
- A cube loaded into the top of an N-slot hopper comes out on tick N. Upgrading a station makes it faster.
- **Where a finished cube goes:**
  1. Onto one of your tickets or Regulars that needs exactly that ingredient at that station ("to-go"). If that completes the ticket, it is served immediately for free.
  2. Otherwise to freshness column 1, if there's room.
  3. Otherwise the station **JAMS**. It stops running and the cube stays in the mouth.
- **Actions:**
  - **Claim** a customer from the row onto your rail.
  - **Assemble/Serve** a ticket. This pulls matching prepped cubes off your freshness table, oldest first, and serves the ticket if that completes it. With Pass window, one action does this for every ticket.
  - **Short plate** a ticket that is missing exactly 1 cube after assembly. You get the full price but lose 1★ (2★ and no reward if it's a critic).
  - **Plate a dish** (Warming plate only). Assemble any dish from your freshness table and put it on the plate.
  - **Serve from plate.** Give a plated dish to a matching row customer (this claims and serves at once) or to a matching ticket (cubes already on that ticket are wasted).
  - **Clear jam.** The stuck cube tries to route again. If it still has nowhere to go, it's thrown out. The station then resumes.
  - **Send to market.** Once per day, pull the meeple off a staffed station and send it to the market. The station is idle for the rest of the day and you still pay its wage. Arrival order sets tomorrow's market pick order.
  - **Wait.**
- **Every completed ticket moves reputation:** +1★ for a full serve (including critics, Regulars and plated dishes), −1★ for a short plate (−2★ for a critic), −1★ for a walkout (−2★ for a critic).
- **Payout** for a dish is its printed price, plus $1 per ★, minus $1 per round it sat on the warming plate (never below 0). Buzz then doubles it.
- **Critics** are 5 cards shuffled into the customer deck, each wanting a 4-cube dish. Each critic has a printed reward:
  - +2★ token
  - Buzz: the next 2 customers you serve pay ×2
  - A free upgrade token, used on your next upgrade in prep
  - A Regular: the priciest non-critic customer in the row comes to you. It orders the same dish every day, starting tomorrow, never runs out of patience, and doesn't use a rail slot. Max 2; if you already have 2, you get the ★ token instead.

### 4 · Closing
1. **Wages:** $1 for every meeple scheduled at the end of prep, used or not. Pay with any mix of:
   - coins
   - food: click storage or freshness cubes, $1 each
   - one plated dish, which covers the whole bill
   If you can't cover the bill you pay what coins you have and lose 1★.
2. **Freshness drops a column.** The last column spoils. Warming-plate dishes age by 1.
3. **Patience drops by 1** on every customer, in the row and on rails.
   - A claimed customer at 0 walks out: −1★, or −2★ if it was a critic ("served late").
   - An unclaimed customer at 0 just leaves.
4. Unpicked market cards are discarded, and both rows refill.

### Scoring
Final score = **min(money, reputation)**. The track that limits each player is highlighted on the summary screen. Ties go to the higher other track. Reputation can't go below 0.

### Upgrades (one each, bought in prep)
| Upgrade | Cost | Effect (my interpretation) |
|---|---|---|
| Marketing | $4 | +1 ticket rail slot |
| Walk-in fridge | $5 | +1 freshness column (cubes last a day longer) |
| Sous chef | $5 | +1 meeple |
| Supplier contract | $4 | Market cards cost $1 less |
| Pass window | $4 | One Serve action works every ticket |
| Warming plate | $3 | Enables plating; dishes lose $1 per round |

## Interpretations (rules I had to decide)
1. **Hopper latency.** Slot count works as both travel time and capacity, and that's what makes an upgrade "faster". A single cube loaded into a 5-slot hopper takes 5 ticks to come out.
2. **"Each action".** I turned this into fixed service ticks: stations run at the start of each of your turns. Passing early doesn't end your day; you Wait and your stations keep running.
3. **Customers are claimed onto a ticket rail.** Competition for orders happens when players claim. To-go means a cube goes straight onto a claimed ticket.
4. **The warming plate holds dishes, not loose cubes,** so a single cube can never route to it, and it doesn't prevent jams. Dishes are repeated across the deck so plating ahead pays off.
5. **"Freshness table full"** means column 1 (the newest) is full. New cubes never skip ahead into older columns.
6. **Upgrade effects** weren't given, so all six are my inventions (table above) and are tunable.
7. **"No legality check".** Physical limits are still enforced: slots, meeple count and storage. The app doesn't stop you scheduling more wages than you can pay, loading cubes nobody ordered, or loading the wrong station.
8. **Market meeple.** It must come off a staffed station, so it costs you that station's output. Its wage is still due.
9. **Plated dish = full wage** means one plated dish covers the whole day's wage bill.
10. **Unpaid wages** cost a flat 1★ however big the shortfall.
11. **Regular reward** is picked automatically (the priciest non-critic in the row), so there's no modal in the middle of a turn.
12. **Short plate** pays the full price and costs only reputation, as written. `SHORT_PLATE_PRICE_PENALTY` lets you add a money cost.
13. **Prep is hidden but sequential.** Nobody sees another board during prep. Finish times are measured per player rather than raced head-to-head, so the race is a solo clock, not a live race.
14. **Reputation from serving:** a full serve gives +1★ (`SERVING.FULL_REP_GAIN`). A critic gives that +1★ and its reward on top.

## Balance notes from bot runs
I ran 200 games with a crude greedy bot, and the engine finished every one with no errors. With +1★ per serve, the bot ends around ★6 and $21; before that change it ended around ★2–5 and $8.

Reputation now compounds: each ★ adds $1 to every later dish, so a player who serves well early pulls ahead on both tracks. Watch for runaway leaders. `REPUTATION.PRICE_PER_STEP` and `SERVING.FULL_REP_GAIN` are the knobs. Under min(money, rep), reputation is still usually the lower track. `SCORING.REP_MULTIPLIER` is there if you want to put the two on the same scale.
