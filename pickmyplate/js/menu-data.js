/* =====================================================================
   PickMyPlate - menu-data.js
   Fixed lists (allergens, days, steps, colours) and the school's
   3-week menu. The kitchen manager loads this menu into the online
   database once ("Load the school menu"); after that, all edits are
   made in the app and saved online.
   ===================================================================== */

/* ---------------------------------------------------------------------
   DATA
   --------------------------------------------------------------------- */

// The UK's 14 allergens that must be declared by law. Format: [code, label shown on screen]
const ALLERGENS = [
  ['celery', 'Celery'], ['gluten', 'Gluten'], ['crustaceans', 'Crustaceans'], ['eggs', 'Eggs'],
  ['fish', 'Fish'], ['lupin', 'Lupin'], ['milk', 'Milk'], ['molluscs', 'Molluscs'],
  ['mustard', 'Mustard'], ['nuts', 'Tree nuts'], ['peanuts', 'Peanuts'], ['sesame', 'Sesame'],
  ['soya', 'Soya'], ['sulphites', 'Sulphites']
];
const ALLERGEN_LABEL = Object.fromEntries(ALLERGENS);   // Lookup, e.g. ALLERGEN_LABEL.nuts -> "Tree nuts"

// Dietary tags a dish can have. Format: [code, label]
const TAGS = [['veg', 'Vegetarian'], ['vegan', 'Vegan'], ['halal', 'Halal']];
const TAG_LABEL = Object.fromEntries(TAGS);             // Lookup, e.g. TAG_LABEL.veg -> "Vegetarian"

// School days. Format: [code, label]
const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday']];
const DAY_LABEL = Object.fromEntries(DAYS);             // Lookup, e.g. DAY_LABEL.mon -> "Monday"
const WEEKS = 3;                                        // The menu repeats every 3 weeks

// The steps a child goes through, in order.
// optional: true = the child can say "No thank you" and skip this step
const COURSES = [
  { key: 'main',    label: 'Main',    prompt: 'What would you like for your main?' },                                    // Step 1
  { key: 'sides',   label: 'Sides',   prompt: 'Would you like vegetables or salad?', optional: true, skipLabel: 'No thank you' },  // Step 2
  { key: 'pudding', label: 'Dessert', prompt: 'What would you like for dessert?' }                                       // Step 3
];

// Colours available for diet cards. Format: [hex colour, name]
const CARD_COLOURS = [
  ['#3B7DD8', 'Blue'], ['#E3B505', 'Yellow'], ['#3E9B5F', 'Green'], ['#1F9AA6', 'Teal'],
  ['#E07B2A', 'Orange'], ['#8A5CC2', 'Purple'], ['#D1508A', 'Pink'], ['#C0392B', 'Red'], ['#6C757D', 'Grey']
];

// Emoji offered in the dish picture picker. Add or remove emoji here
const EMOJIS = ['🍝','🥧','🍗','🍖','🍔','🐟','🍟','🌯','🍛','🌭','🥔','🥪','🥦','🥗','🥕','🌽','🍕','🍲','🥘','🍚','🍎','🍌','🍓','🍐','🍪','🍰','🍫','🌾','🥣','🍮','🧀','🥫'];


const uid = () => Math.random().toString(36).slice(2, 9);    // Makes a random id like "k3f9a2x"

// Creates one dish. week: 0 = every week, 1-3 = that week. day: 'all' = every day, or 'mon'...'fri'
function dish(week, day, course, name, emoji, allergens = [], tags = [], extra = {}) {
  return Object.assign({
    id: uid(),              // Unique id
    week, day, course,      // When it's served and which step it belongs to
    name, emoji,            // What children see
    photo: null,            // Optional uploaded photo
    allergens, tags,        // Allergens it contains; vegetarian/vegan/halal
    checked: true,          // true = allergens confirmed by the kitchen manager (untick in the dish form to hide it from diet cards)
    options: [],            // Choices inside the dish (e.g. jacket potato fillings)
    optionPrompt: '',       // Question asked when choosing an option
    note: ''                // Research note for staff: why these allergens were suggested
  }, extra);
}

// Creates one choice inside a dish (e.g. "Tuna" inside "Jacket potato")
const opt = (name, emoji, allergens = [], tags = []) => ({ id: uid(), name, emoji, allergens, tags });

// Custard choice used for every dessert of the day
const custard = () => ({
  options: [opt('With custard', '🥣', ['milk'], ['veg']), opt('No custard', '🙅', [], ['veg', 'vegan'])],
  optionPrompt: 'Would you like custard?'
});

// The school's 3-week menu (Food Menu 2026-2027).
// ALLERGENS BELOW ARE RESEARCHED SUGGESTIONS, based on what these dishes TYPICALLY contain
// in UK catering. Real allergens depend on the exact products and recipes the kitchen uses.
// Every dish starts as "not checked" until kitchen staff confirm it against the official allergen matrix.
function schoolMenu() {
  const V = ['veg'], VV = ['veg', 'vegan'];                  // Shortcuts for common tag lists

  // Research notes reused by several dishes
  const N = {
    roast: 'Yorkshire puddings contain wheat, egg and milk. Gravy granules usually contain wheat and sometimes celery. Stuffing usually contains wheat and may contain celery or sulphites.',
    quorn: 'Quorn mince and pieces contain egg white; some Quorn products also contain milk or wheat. Check the pack used.',
    quornRoast: 'Quorn contains egg white; some Quorn roasts contain milk. Yorkshire puddings contain wheat, egg and milk. Gravy and stuffing usually contain wheat and may contain celery or sulphites.',
    curry: 'Curry powders and pastes often contain mustard and celery. Some sauces also contain milk (yoghurt/cream) or nuts.',
    korma: 'Korma sauces traditionally contain cream or yoghurt (milk) and ground almonds or cashews (tree nuts). Many schools use a nut-free recipe; confirm with the kitchen.',
    cake: 'Cakes usually contain wheat flour, eggs and butter (milk). Margarine and chocolate often contain soya.',
    crumble: 'Crumble topping is flour and butter (gluten, milk). Oats in the topping also count as gluten.',
    batter: 'Batter and breadcrumbs contain wheat. Some batters contain milk or egg. Shared fryers can carry other allergens.',
    plantFish: 'Plant-based fish alternatives usually contain wheat and soya; some brands contain mustard.'
  };

  return [
    // ----- Every day, every week -----
    dish(0, 'all', 'main', 'Jacket potato', '🥔', [], V, {
      optionPrompt: 'What would you like in your jacket potato?',
      note: 'Plain potato has no listed allergens. Butter or spread adds milk (and sometimes soya). Coleslaw and tuna mayo contain egg and usually mustard (mayonnaise).',
      options: [opt('Cheese', '🧀', ['milk'], V), opt('Cheese and beans', '🥫', ['milk'], V), opt('Coleslaw', '🥗', ['eggs', 'mustard'], V), opt('Tuna', '🐟', ['fish', 'eggs', 'mustard'])]
    }),
    dish(0, 'all', 'main', 'Sandwich', '🥪', ['gluten', 'soya'], V, {
      optionPrompt: 'What would you like in your sandwich?',
      note: 'Bread contains wheat; many UK sliced breads also contain soya flour and may contain sesame traces. Butter or spread adds milk.',
      options: [opt('Cheese', '🧀', ['milk'], V), opt('Turkey Ham', '🍖', []), opt('Jam', '🍓', [], VV)]
    }),
    dish(0, 'all', 'sides', 'Seasonal vegetables', '🥦', [], VV, { note: 'Plain vegetables have no listed allergens, but celery IS one of the 14 allergens. If celery is in the mix, add it. Butter glaze adds milk.' }),
    dish(0, 'all', 'sides', 'Mixed salad', '🥗', [], VV, { note: 'Plain salad has no listed allergens. Dressings often contain mustard and sulphites (vinegar); celery in the salad counts as an allergen.' }),
    dish(0, 'all', 'pudding', 'Fruit', '🍎', [], VV, { note: 'Fresh fruit has no listed allergens. Dried fruit often contains sulphites.' }),

    // ----- Week 1 -----
    dish(1, 'mon', 'main', 'Pasta with meatballs', '🍝', ['gluten', 'eggs', 'celery', 'sulphites'], [], { note: 'Pasta is wheat. Meatballs usually contain wheat rusk or breadcrumbs, sometimes egg, and often a sulphite preservative. Tomato sauce may contain celery.' }),
    dish(1, 'mon', 'main', 'Vegetarian meatballs', '🍝', ['gluten', 'soya', 'eggs'], V, { note: 'Pasta is wheat. Vegetarian meatballs are usually soya- or Quorn-based (Quorn contains egg) with wheat binder. Check the brand.' }),
    dish(1, 'tue', 'main', 'Cowboy pie', '🥧', ['gluten', 'milk', 'sulphites'], [], { note: 'Usually sausages and beans under mash. Sausages usually contain wheat rusk and sulphites. Mash usually contains milk or butter.' }),
    dish(1, 'tue', 'main', 'Cheese and potato pie', '🥧', ['gluten', 'milk', 'eggs'], V, { note: 'Cheese = milk. Pastry = wheat, often glazed with egg. If it is mash-topped with no pastry, gluten and egg may not apply.' }),
    dish(1, 'wed', 'main', 'Potatoes, Chicken, Yorkshire puddings and Stuffing, Gravy.', '🍗', ['gluten', 'eggs', 'milk', 'celery', 'sulphites'], [], { note: N.roast }),
    dish(1, 'wed', 'main', 'Quorn roast dinner', '🥘', ['gluten', 'eggs', 'milk', 'celery', 'sulphites'], V, { note: N.quornRoast }),
    dish(1, 'thu', 'main', 'Burger and wedges', '🍔', ['gluten', 'sesame', 'soya'], [], {
      optionPrompt: 'Chicken burger or beef burger?',
      note: 'Burger buns contain wheat and often sesame and soya. Beef burgers often contain wheat rusk and sulphites. Chicken burgers are usually coated in wheat breadcrumbs. Coated wedges may contain wheat.',
      options: [opt('Chicken burger', '🍗', []), opt('Beef burger', '🍔', ['sulphites'])]
    }),
    dish(1, 'thu', 'main', 'Veggie burger and wedges', '🍔', ['gluten', 'soya', 'sesame'], V, { note: 'Bun contains wheat and often sesame and soya. Veggie burgers vary widely: some contain egg, milk, celery or mustard. Check the brand.' }),
    dish(1, 'fri', 'main', 'Fish and chips', '🐟', ['fish', 'gluten'], [], { note: N.batter }),
    dish(1, 'fri', 'main', 'Plant-based fish and chips', '🍟', ['gluten', 'soya'], VV, { note: N.plantFish }),
    dish(1, 'mon', 'pudding', 'Flapjack', '🌾', ['gluten', 'milk'], V, { ...custard(), note: 'Oats count as a cereal containing gluten under UK law. Butter = milk.' }),
    dish(1, 'tue', 'pudding', 'Banana cake', '🍰', ['gluten', 'eggs', 'milk'], V, { ...custard(), note: N.cake }),
    dish(1, 'wed', 'pudding', 'Cookie', '🍪', ['gluten', 'eggs', 'milk', 'soya'], V, { ...custard(), note: N.cake + ' Check for nut traces.' }),
    dish(1, 'thu', 'pudding', 'Apple crumble', '🥧', ['gluten', 'milk'], V, { ...custard(), note: N.crumble }),
    dish(1, 'fri', 'pudding', 'Brownie', '🍫', ['gluten', 'eggs', 'milk', 'soya'], V, { ...custard(), note: N.cake + ' Check for nut traces.' }),

    // ----- Week 2 -----
    dish(2, 'mon', 'main', 'Spaghetti bolognese', '🍝', ['gluten', 'celery'], [], { note: 'Spaghetti is wheat (egg pasta would add egg). Bolognese sauce and stock often contain celery; stock cubes may contain wheat.' }),
    dish(2, 'mon', 'main', 'Quorn bolognese', '🍝', ['gluten', 'eggs', 'celery'], V, { note: N.quorn + ' Spaghetti is wheat. Sauce often contains celery.' }),
    dish(2, 'tue', 'main', 'Chicken curry and rice', '🍛', ['celery', 'mustard'], [], { note: N.curry }),
    dish(2, 'tue', 'main', 'Quorn curry and rice', '🍛', ['eggs', 'celery', 'mustard'], V, { note: N.quorn + ' ' + N.curry }),
    dish(2, 'wed', 'main', 'Potatoes,  Yorkshire puddings and Stuffing, Gravy.', '🍖', ['gluten', 'eggs', 'milk', 'celery', 'sulphites'], [], { note: N.roast }),
    dish(2, 'wed', 'main', 'Quorn roast dinner', '🥘', ['gluten', 'eggs', 'milk', 'celery', 'sulphites'], V, { note: N.quornRoast }),
    dish(2, 'thu', 'main', 'Chicken wrap and wedges', '🌯', ['gluten', 'eggs', 'mustard'], [], { note: 'Tortilla wraps are wheat. Mayonnaise adds egg and usually mustard. Coated chicken or wedges may add more wheat.' }),
    dish(2, 'thu', 'main', 'Plant-based chicken wrap and wedges', '🌯', ['gluten', 'soya', 'mustard'], VV, { note: 'Tortilla wraps are wheat. Plant-based chicken is usually soya and wheat. Vegan mayo is usually egg-free but may contain mustard.' }),
    dish(2, 'fri', 'main', 'Fish cakes and chips', '🐟', ['fish', 'gluten', 'milk', 'eggs'], [], { note: 'Fish cakes usually contain wheat breadcrumbs and milk, and often egg or mustard. ' + N.batter }),
    dish(2, 'fri', 'main', 'Cauliflower cheese grills and chips', '🥦', ['gluten', 'milk', 'mustard'], V, { note: 'Cheese = milk. Coating = wheat. Cheese sauces often contain mustard.' }),
    dish(2, 'mon', 'pudding', 'Flapjack', '🌾', ['gluten', 'milk'], V, { ...custard(), note: 'Oats count as a cereal containing gluten under UK law. Butter = milk.' }),
    dish(2, 'tue', 'pudding', 'Jam sponge cake', '🍰', ['gluten', 'eggs', 'milk'], V, { ...custard(), note: N.cake + ' Some jams contain sulphites.' }),
    dish(2, 'wed', 'pudding', 'Cookie', '🍪', ['gluten', 'eggs', 'milk', 'soya'], V, { ...custard(), note: N.cake + ' Check for nut traces.' }),
    dish(2, 'thu', 'pudding', 'Berry crumble', '🥧', ['gluten', 'milk'], V, { ...custard(), note: N.crumble }),
    dish(2, 'fri', 'pudding', 'Blondie', '🍫', ['gluten', 'eggs', 'milk', 'soya'], V, { ...custard(), note: 'White chocolate contains milk and often soya. ' + N.cake + ' Check for nut traces.' }),

    // ----- Week 3 -----
    dish(3, 'mon', 'main', 'Lasagne and garlic bread', '🍝', ['gluten', 'eggs', 'milk', 'celery'], [], { note: 'Lasagne sheets are wheat and often egg. White sauce = milk (sometimes mustard). Meat sauce often contains celery. Garlic bread = wheat and butter.' }),
    dish(3, 'mon', 'main', 'Vegetable lasagne and garlic bread', '🍝', ['gluten', 'eggs', 'milk', 'celery'], V, { note: 'Lasagne sheets are wheat and often egg. White sauce = milk. Vegetable sauce may contain celery. Garlic bread = wheat and butter.' }),
    dish(3, 'tue', 'main', 'Chicken korma and rice', '🍛', ['milk', 'nuts'], [], { note: N.korma }),
    dish(3, 'tue', 'main', 'Quorn korma and rice', '🍛', ['eggs', 'milk', 'nuts'], V, { note: N.quorn + ' ' + N.korma }),
    dish(3, 'wed', 'main', 'Roast beef dinner', '🍖', ['gluten', 'eggs', 'milk', 'celery', 'sulphites'], [], { note: N.roast }),
    dish(3, 'wed', 'main', 'Quorn roast dinner', '🥘', ['gluten', 'eggs', 'milk', 'celery', 'sulphites'], V, { note: N.quornRoast }),
    dish(3, 'thu', 'main', 'Nuggets or hot dog, with wedges', '🌭', ['gluten'], [], {
      optionPrompt: 'Chicken nuggets or a beef hot dog?',
      note: 'Nugget coating is wheat. Hot dog rolls are wheat and may contain sesame or soya. Beef sausages often contain sulphites and sometimes mustard.',
      options: [opt('Chicken nuggets', '🍗', []), opt('Beef hot dog', '🌭', ['sulphites', 'soya'])]
    }),
    dish(3, 'thu', 'main', 'Veggie nuggets or veggie hot dog', '🌭', ['gluten', 'soya'], V, {
      optionPrompt: 'Veggie nuggets or a veggie hot dog?',
      note: 'Veggie nuggets and sausages are usually soya or Quorn (egg) with a wheat coating. Some contain milk. Check the brand.',
      options: [opt('Veggie nuggets', '🥕', [], V), opt('Veggie hot dog', '🌭', [], V)]
    }),
    dish(3, 'fri', 'main', 'Fish fingers and chips', '🐟', ['fish', 'gluten'], [], { note: N.batter }),
    dish(3, 'fri', 'main', 'Plant-based fish fingers and chips', '🍟', ['gluten', 'soya'], VV, { note: N.plantFish }),
    dish(3, 'mon', 'pudding', 'Flapjack', '🌾', ['gluten', 'milk'], V, { ...custard(), note: 'Oats count as a cereal containing gluten under UK law. Butter = milk.' }),
    dish(3, 'tue', 'pudding', 'Chocolate sponge cake', '🍰', ['gluten', 'eggs', 'milk', 'soya'], V, { ...custard(), note: N.cake }),
    dish(3, 'wed', 'pudding', 'Cookie', '🍪', ['gluten', 'eggs', 'milk', 'soya'], V, { ...custard(), note: N.cake + ' Check for nut traces.' }),
    dish(3, 'thu', 'pudding', 'Pear crumble', '🥧', ['gluten', 'milk'], V, { ...custard(), note: N.crumble }),
    dish(3, 'fri', 'pudding', 'Cornflake tart', '🥧', ['gluten', 'eggs', 'milk'], V, { ...custard(), note: 'Pastry = wheat and butter. Cornflakes contain barley malt (gluten). Egg may be in the pastry or filling. Some jams contain sulphites.' })
  ];
}

// Diet cards for the most common school food restrictions.
// One card per restriction. For a child with several allergies, staff add a combined card (e.g. "Red · No milk or eggs").
function defaultCards() {
  return [
    { id: 'c-milk',   name: 'Blue · No milk',               color: '#3B7DD8', avoid: ['milk'],                           vegOnly: false },
    { id: 'c-egg',    name: 'Yellow · No eggs',             color: '#E3B505', avoid: ['eggs'],                           vegOnly: false },
    { id: 'c-gluten', name: 'Purple · No gluten',           color: '#8A5CC2', avoid: ['gluten'],                         vegOnly: false },
    { id: 'c-nuts',   name: 'Orange · No nuts or sesame',   color: '#E07B2A', avoid: ['peanuts', 'nuts', 'sesame'],      vegOnly: false },
    { id: 'c-fish',   name: 'Teal · No fish or shellfish',  color: '#1F9AA6', avoid: ['fish', 'crustaceans', 'molluscs'], vegOnly: false },
    { id: 'c-soya',   name: 'Pink · No soya',               color: '#D1508A', avoid: ['soya'],                           vegOnly: false },
    { id: 'c-veg',    name: 'Green · Vegetarian',           color: '#3E9B5F', avoid: [],                                 vegOnly: true }
  ];
}
