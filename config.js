// Kitchen Line — every tunable number lives here. Edit, save, reload the page.
const CONFIG = {
  ROUNDS: 7,

  PLAYERS: {
    MIN: 2,
    MAX: 4,
    COLORS: ['#e4572e', '#2a9d8f', '#e9a820', '#7b61d1'],
  },

  START: {
    MONEY: 10,
    REPUTATION: 3,
    MEEPLES: 2,
    STORAGE_CUBES: 3,            // random cubes in storage at game start
    STAFFED: ['knife', 'pan'],   // default staffing plan on day 1
  },

  REPUTATION: {
    MIN: 0,                      // reputation can't drop below this
    PRICE_PER_STEP: 1,           // +$ per reputation step on every dish served
  },

  SCORING: {
    // Final score = min(money, reputation * REP_MULTIPLIER).
    // 1 = rules as written (raw $ vs raw rep steps).
    REP_MULTIPLIER: 1,
  },

  STORAGE_SIZE: 9,

  STATIONS: {
    knife: { name: 'Knife', verb: 'chop',  short: 'K' },
    pan:   { name: 'Pan',   verb: 'sauté', short: 'P' },
    pot:   { name: 'Pot',   verb: 'boil',  short: 'B' },
    fryer: { name: 'Fryer', verb: 'fry',   short: 'F' },
  },

  HOPPER: {
    SLOTS: 5,                    // starting slots per station (= ticks a top-loaded cube takes)
    MIN_SLOTS: 2,                // can't upgrade below this
    UPGRADE_COST: 3,             // $ to remove one slot
    DINING_ROOM_REP: 1,          // rep gained when the removed slot becomes a dining room piece
  },

  MEEPLES_MAX: 6,

  FRESHNESS: {
    COLUMNS: 4,                  // cubes survive this many Closings, then spoil
    COLUMN_CAPACITY: 4,          // new prepped cubes enter column 1 only; full = jam risk
  },

  INGREDIENTS: {
    veg:   { name: 'Veg',   color: '#43a047', short: 'V' },
    meat:  { name: 'Meat',  color: '#c62828', short: 'M' },
    fish:  { name: 'Fish',  color: '#1e88e5', short: 'Fi' },
    grain: { name: 'Grain', color: '#f9a825', short: 'G' },
    dairy: { name: 'Dairy', color: '#eeeeee', short: 'D' },
  },

  MARKET: {
    ROW_SIZE: 5,
    CARD_PRICE: 2,               // flat price per card
    MAX_CARDS_PER_PLAYER: 3,
    DECK_SIZE: 60,
    CUBES_PER_CARD_WEIGHTS: { 1: 3, 2: 4, 3: 2 },     // relative odds of a card having 1/2/3 cubes
    INGREDIENT_WEIGHTS: { veg: 4, meat: 2, fish: 2, grain: 2, dairy: 2 },
  },

  PREP: {
    TIMER_SECONDS: 90,           // per player in hot-seat; 0 = no timer
    CARRY_OVER_STAFFING: true,   // pre-fill today's staffing with yesterday's plan
  },

  OPEN: {
    SERVICE_TICKS: 8,            // each tick: every player (in turn order) runs stations then takes 1 action
    TICKET_RAIL: 2,              // max claimed customers at once (Regulars don't count)
  },

  CUSTOMERS: {
    ROW_SIZE: 6,
    PATIENCE_DECAY: 1,           // per Closing
    WALKOUT_REP_LOSS: 1,         // claimed customer runs out of patience
  },

  SERVING: {
    FULL_REP_GAIN: 1,            // every complete ticket (incl. critics, Regulars, plated dishes)
    SHORT_PLATE_MAX_MISSING: 1,
    SHORT_PLATE_REP_LOSS: 1,
    SHORT_PLATE_PRICE_PENALTY: 0, // $ off a short plate (rules say rep only)
  },

  WARMING_PLATE: {
    CAPACITY: 2,
    DECAY_PER_ROUND: 1,          // $ lost per Closing a dish sits on the plate
  },

  CRITICS: {
    COUNT: 5,                    // critic cards shuffled into the customer deck
    SHORT_REP_LOSS: 2,           // short-plating a critic
    LATE_REP_LOSS: 2,            // claimed critic runs out of patience
    REWARD_WEIGHTS: { rep: 1, buzz: 1, upgrade: 1, regular: 1 },
    REP_TOKEN: 2,
    BUZZ_MULTIPLIER: 2,
    BUZZ_CUSTOMERS: 2,
    MAX_REGULARS: 2,
  },

  WAGES: {
    PER_MEEPLE: 1,               // per meeple scheduled in prep, used or not
    FOOD_CUBE_VALUE: 1,          // a raw or prepped cube pays $1
    UNPAID_REP_LOSS: 1,          // flat rep loss if you can't cover the bill
  },

  UPGRADES: {
    marketing:    { name: 'Marketing',         cost: 4, desc: '+1 ticket rail slot' },
    fridge:       { name: 'Walk-in fridge',    cost: 5, desc: '+1 freshness column' },
    sous:         { name: 'Sous chef',         cost: 5, desc: '+1 meeple' },
    supplier:     { name: 'Supplier contract', cost: 4, desc: 'Market cards cost $1 less' },
    passWindow:   { name: 'Pass window',       cost: 4, desc: 'One Serve action works every ticket' },
    warmingPlate: { name: 'Warming plate',     cost: 3, desc: 'Plate dishes ahead; serve later' },
  },

  UPGRADE_EFFECTS: {
    MARKETING_EXTRA_TICKETS: 1,
    FRIDGE_EXTRA_COLUMNS: 1,
    SOUS_CHEF_MEEPLES: 1,
    SUPPLIER_DISCOUNT: 1,
  },

  // steps: [ingredient, station] — each step is one cube processed at that station.
  DISHES: {
    salad:      { name: 'Salad',          price: 3,  patience: 2, steps: [['veg', 'knife'], ['veg', 'knife']] },
    fries:      { name: 'Fries',          price: 2,  patience: 2, steps: [['veg', 'fryer']] },
    steak:      { name: 'Steak',          price: 3,  patience: 2, steps: [['meat', 'pan']] },
    porridge:   { name: 'Porridge',       price: 2,  patience: 2, steps: [['grain', 'pot']] },
    soup:       { name: 'Soup',           price: 4,  patience: 3, steps: [['veg', 'knife'], ['veg', 'pot']] },
    pasta:      { name: 'Pasta',          price: 5,  patience: 3, steps: [['grain', 'pot'], ['dairy', 'pan']] },
    fishchips:  { name: 'Fish & Chips',   price: 5,  patience: 3, steps: [['fish', 'fryer'], ['veg', 'fryer']] },
    stirfry:    { name: 'Stir Fry',       price: 5,  patience: 3, steps: [['meat', 'knife'], ['veg', 'pan']] },
    chicken:    { name: 'Fried Chicken',  price: 5,  patience: 3, steps: [['meat', 'fryer'], ['grain', 'fryer']] },
    ricebowl:   { name: 'Rice Bowl',      price: 7,  patience: 3, steps: [['grain', 'pot'], ['veg', 'knife'], ['fish', 'pan']] },
    chowder:    { name: 'Chowder',        price: 7,  patience: 3, steps: [['fish', 'knife'], ['dairy', 'pot'], ['veg', 'pot']] },
    // critic dishes
    tasting:    { name: 'Tasting Plate',  price: 12, patience: 2, steps: [['fish', 'knife'], ['meat', 'pan'], ['veg', 'fryer'], ['dairy', 'pot']] },
    bouilla:    { name: 'Bouillabaisse',  price: 11, patience: 2, steps: [['fish', 'pot'], ['fish', 'knife'], ['veg', 'pan'], ['dairy', 'pot']] },
    wellington: { name: 'Beef Wellington',price: 12, patience: 2, steps: [['meat', 'pan'], ['grain', 'pot'], ['veg', 'knife'], ['dairy', 'pan']] },
  },

  // copies of each dish in the customer deck (critics added separately)
  CUSTOMER_DECK: {
    salad: 4, fries: 4, steak: 4, porridge: 3, soup: 3, pasta: 3,
    fishchips: 3, stirfry: 3, chicken: 3, ricebowl: 2, chowder: 2,
  },
  CRITIC_DISHES: ['tasting', 'bouilla', 'wellington'],
};
