/* =====================================================================
   PickMyPlate - app.js
   All the behaviour of the app. It works like this:
     1. DATA      - allergens, days, courses and the school's 3-week menu
     2. STORAGE   - load/save the menu in the browser (localStorage)
     3. HELPERS   - small reusable functions (safety rules, dates, speech)
     4. SCREENS   - functions that build the HTML for each tab
     5. EVENTS    - what happens when someone clicks, changes or saves
   Every screen is rebuilt by render() whenever something changes.
   ===================================================================== */

/* ---------------------------------------------------------------------
   0. DARK MODE - follow the device's light/dark setting
   --------------------------------------------------------------------- */
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');   // Asks the device whether dark mode is on
function applyTheme() {                                                // Sets Bootstrap's theme on the <html> tag
  document.documentElement.setAttribute('data-bs-theme', darkQuery.matches ? 'dark' : 'light');
}
applyTheme();                                                          // Set the theme when the page loads
darkQuery.addEventListener('change', applyTheme);                      // Update it if the device setting changes

/* ---------------------------------------------------------------------
   1. DATA
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
  { key: 'pudding', label: 'Pudding', prompt: 'What would you like for pudding?' }                                       // Step 3
];

// Colours available for diet cards. Format: [hex colour, name]
const CARD_COLOURS = [['#3B7DD8', 'Blue'], ['#3E9B5F', 'Green'], ['#E07B2A', 'Orange'], ['#8A5CC2', 'Purple'], ['#D1508A', 'Pink']];

// Emoji offered in the dish picture picker. Add or remove emoji here
const EMOJIS = ['🍝','🥧','🍗','🍖','🍔','🐟','🍟','🌯','🍛','🌭','🥔','🥪','🥦','🥗','🥕','🌽','🍕','🍲','🥘','🍚','🍎','🍌','🍓','🍐','🍪','🍰','🍫','🌾','🥣','🍮','🧀','🥫'];

const STORAGE_KEY = 'pickmyplate.v2';   // Name under which data is saved in the browser (v2 = school menu version)

const uid = () => Math.random().toString(36).slice(2, 9);    // Makes a random id like "k3f9a2x"

// Creates one dish. week: 0 = every week, 1-3 = that week. day: 'all' = every day, or 'mon'...'fri'
function dish(week, day, course, name, emoji, allergens = [], tags = [], extra = {}) {
  return Object.assign({
    id: uid(),              // Unique id
    week, day, course,      // When it's served and which step it belongs to
    name, emoji,            // What children see
    photo: null,            // Optional uploaded photo
    allergens, tags,        // Allergens it contains; vegetarian/vegan/halal
    checked: false,         // false = allergens NOT yet confirmed against official records
    options: [],            // Choices inside the dish (e.g. jacket potato fillings)
    optionPrompt: ''        // Question asked when choosing an option
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
// ALLERGENS BELOW ARE SUGGESTIONS ONLY. The official menu has no allergen information.
// Every dish starts as "not checked" until kitchen staff confirm it.
function schoolMenu() {
  const V = ['veg'], VV = ['veg', 'vegan'];                  // Shortcuts for common tag lists
  return [
    // ----- Every day, every week -----
    dish(0, 'all', 'main', 'Jacket potato', '🥔', [], V, {
      optionPrompt: 'What would you like in your jacket potato?',
      options: [opt('Cheese', '🧀', ['milk'], V), opt('Cheese and beans', '🥫', ['milk'], V), opt('Coleslaw', '🥗', ['eggs', 'mustard'], V), opt('Tuna', '🐟', ['fish', 'eggs'])]
    }),
    dish(0, 'all', 'main', 'Sandwich', '🥪', ['gluten'], V, {
      optionPrompt: 'What would you like in your sandwich?',
      options: [opt('Cheese', '🧀', ['milk'], V), opt('Ham', '🍖', []), opt('Jam', '🍓', [], VV)]
    }),
    dish(0, 'all', 'sides', 'Seasonal vegetables', '🥦', [], VV),
    dish(0, 'all', 'sides', 'Mixed salad', '🥗', [], VV),
    dish(0, 'all', 'pudding', 'Fruit', '🍎', [], VV),

    // ----- Week 1 -----
    dish(1, 'mon', 'main', 'Pasta with meatballs', '🍝', ['gluten', 'eggs']),
    dish(1, 'mon', 'main', 'Vegetarian meatballs', '🍝', ['gluten', 'soya'], V),
    dish(1, 'tue', 'main', 'Cowboy pie', '🥧', ['gluten', 'milk']),
    dish(1, 'tue', 'main', 'Cheese and potato pie', '🥧', ['gluten', 'milk'], V),
    dish(1, 'wed', 'main', 'Roast chicken dinner', '🍗', ['gluten', 'eggs', 'milk', 'celery']),
    dish(1, 'wed', 'main', 'Quorn roast dinner', '🥘', ['gluten', 'eggs', 'milk', 'celery'], V),
    dish(1, 'thu', 'main', 'Burger and wedges', '🍔', ['gluten'], [], {
      optionPrompt: 'Chicken burger or beef burger?',
      options: [opt('Chicken burger', '🍗', []), opt('Beef burger', '🍔', [])]
    }),
    dish(1, 'thu', 'main', 'Veggie burger and wedges', '🍔', ['gluten', 'soya'], V),
    dish(1, 'fri', 'main', 'Fish and chips', '🐟', ['fish', 'gluten']),
    dish(1, 'fri', 'main', 'Plant-based fish and chips', '🍟', ['gluten', 'soya'], VV),
    dish(1, 'mon', 'pudding', 'Flapjack', '🌾', ['gluten', 'milk'], V, custard()),
    dish(1, 'tue', 'pudding', 'Banana cake', '🍰', ['gluten', 'eggs', 'milk'], V, custard()),
    dish(1, 'wed', 'pudding', 'Cookie', '🍪', ['gluten', 'eggs', 'milk'], V, custard()),
    dish(1, 'thu', 'pudding', 'Apple crumble', '🥧', ['gluten', 'milk'], V, custard()),
    dish(1, 'fri', 'pudding', 'Brownie', '🍫', ['gluten', 'eggs', 'milk'], V, custard()),

    // ----- Week 2 -----
    dish(2, 'mon', 'main', 'Spaghetti bolognese', '🍝', ['gluten', 'celery']),
    dish(2, 'mon', 'main', 'Quorn bolognese', '🍝', ['gluten', 'eggs', 'celery'], V),
    dish(2, 'tue', 'main', 'Chicken curry and rice', '🍛', ['celery', 'mustard']),
    dish(2, 'tue', 'main', 'Quorn curry and rice', '🍛', ['eggs', 'celery', 'mustard'], V),
    dish(2, 'wed', 'main', 'Roast pork dinner', '🍖', ['gluten', 'eggs', 'milk', 'celery']),
    dish(2, 'wed', 'main', 'Quorn roast dinner', '🥘', ['gluten', 'eggs', 'milk', 'celery'], V),
    dish(2, 'thu', 'main', 'Chicken wrap and wedges', '🌯', ['gluten']),
    dish(2, 'thu', 'main', 'Plant-based chicken wrap and wedges', '🌯', ['gluten', 'soya'], VV),
    dish(2, 'fri', 'main', 'Fish cakes and chips', '🐟', ['fish', 'gluten', 'milk']),
    dish(2, 'fri', 'main', 'Cauliflower cheese grills and chips', '🥦', ['gluten', 'milk'], V),
    dish(2, 'mon', 'pudding', 'Flapjack', '🌾', ['gluten', 'milk'], V, custard()),
    dish(2, 'tue', 'pudding', 'Jam sponge cake', '🍰', ['gluten', 'eggs', 'milk'], V, custard()),
    dish(2, 'wed', 'pudding', 'Cookie', '🍪', ['gluten', 'eggs', 'milk'], V, custard()),
    dish(2, 'thu', 'pudding', 'Berry crumble', '🥧', ['gluten', 'milk'], V, custard()),
    dish(2, 'fri', 'pudding', 'Blondie', '🍫', ['gluten', 'eggs', 'milk'], V, custard()),

    // ----- Week 3 -----
    dish(3, 'mon', 'main', 'Lasagne and garlic bread', '🍝', ['gluten', 'eggs', 'milk', 'celery']),
    dish(3, 'mon', 'main', 'Vegetable lasagne and garlic bread', '🍝', ['gluten', 'eggs', 'milk'], V),
    dish(3, 'tue', 'main', 'Chicken korma and rice', '🍛', ['milk']),
    dish(3, 'tue', 'main', 'Quorn korma and rice', '🍛', ['eggs', 'milk'], V),
    dish(3, 'wed', 'main', 'Roast beef dinner', '🍖', ['gluten', 'eggs', 'milk', 'celery']),
    dish(3, 'wed', 'main', 'Quorn roast dinner', '🥘', ['gluten', 'eggs', 'milk', 'celery'], V),
    dish(3, 'thu', 'main', 'Nuggets or hot dog, with wedges', '🌭', ['gluten'], [], {
      optionPrompt: 'Chicken nuggets or a beef hot dog?',
      options: [opt('Chicken nuggets', '🍗', []), opt('Beef hot dog', '🌭', [])]
    }),
    dish(3, 'thu', 'main', 'Veggie nuggets or veggie hot dog', '🌭', ['gluten', 'soya'], V, {
      optionPrompt: 'Veggie nuggets or a veggie hot dog?',
      options: [opt('Veggie nuggets', '🥕', [], V), opt('Veggie hot dog', '🌭', [], V)]
    }),
    dish(3, 'fri', 'main', 'Fish fingers and chips', '🐟', ['fish', 'gluten']),
    dish(3, 'fri', 'main', 'Plant-based fish fingers and chips', '🍟', ['gluten', 'soya'], VV),
    dish(3, 'mon', 'pudding', 'Flapjack', '🌾', ['gluten', 'milk'], V, custard()),
    dish(3, 'tue', 'pudding', 'Chocolate sponge cake', '🍰', ['gluten', 'eggs', 'milk'], V, custard()),
    dish(3, 'wed', 'pudding', 'Cookie', '🍪', ['gluten', 'eggs', 'milk'], V, custard()),
    dish(3, 'thu', 'pudding', 'Pear crumble', '🥧', ['gluten', 'milk'], V, custard()),
    dish(3, 'fri', 'pudding', 'Cornflake tart', '🥧', ['gluten', 'eggs', 'milk'], V, custard())
  ];
}

// Returns a fresh copy of all starting data (used on first run and by "Restore school menu")
function startingData() {
  return {
    dishes: schoolMenu(),                                                    // The 3-week menu
    cards: [                                                                 // Example diet cards (colours, never names)
      { id: 'c1', name: 'Blue card',   color: '#3B7DD8', avoid: ['milk', 'eggs'],              vegOnly: false },
      { id: 'c2', name: 'Green card',  color: '#3E9B5F', avoid: ['gluten'],                    vegOnly: false },
      { id: 'c3', name: 'Orange card', color: '#E07B2A', avoid: ['peanuts', 'nuts', 'sesame'], vegOnly: true }
    ],
    rotation: { anchor: isoDate(mondayOf(new Date())), anchorWeek: 1 },     // "The week starting <anchor> is Week <anchorWeek>"
    tally: {},                                                               // Today's counts: dish id (or "dishId/optionId") -> number
    speech: true                                                             // true = read dish names aloud
  };
}

/* ---------------------------------------------------------------------
   DATES - work out which week of the 3-week menu it is
   --------------------------------------------------------------------- */
function mondayOf(date) {                                     // Returns the Monday of the week containing "date"
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());   // Copy the date (without the time)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));            // Go back to Monday (getDay: Sunday=0 ... Saturday=6)
  return d;
}
function isoDate(d) {                                         // Formats a date as "2026-09-21"
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function weekFor(date) {                                      // Which menu week (1-3) a date falls in
  const anchor = new Date(S.rotation.anchor + 'T00:00:00');   // The Monday staff set as a known week
  const weeksApart = Math.round((mondayOf(date) - mondayOf(anchor)) / (7 * 864e5));   // Whole weeks between them
  return (((S.rotation.anchorWeek - 1 + weeksApart) % WEEKS) + WEEKS) % WEEKS + 1;   // Wrap around 1 -> 2 -> 3 -> 1
}
function todaySlot() {                                        // Today's week and day (weekends show next Monday)
  const d = new Date();                                       // Today
  const weekend = d.getDay() === 0 || d.getDay() === 6;       // Saturday or Sunday?
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);           // Saturday -> Monday
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);           // Sunday -> Monday
  return { week: weekFor(d), day: DAYS[(d.getDay() + 6) % 7][0], weekend };
}

/* ---------------------------------------------------------------------
   2. STORAGE - keep the menu on this device
   --------------------------------------------------------------------- */
let S = null;                                                        // "S" holds all saved data
try { S = JSON.parse(localStorage.getItem(STORAGE_KEY)); }           // Try to load saved data from the browser
catch (e) { /* storage blocked (e.g. private window): ignore */ }
if (!S || !Array.isArray(S.dishes) || !S.rotation) S = startingData();   // Nothing saved (or broken): start with the school menu

function save() {                                                    // Saves all data to the browser
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); }
  catch (e) { toast('Could not save on this device. Changes will last until you close the page.'); }
}

/* ---------------------------------------------------------------------
   Screen state (NOT saved - resets when the page reloads)
   --------------------------------------------------------------------- */
let view = 'choose';                                          // Which tab is showing: 'choose', 'kitchen' or 'tally'
let slot = todaySlot();                                       // Which menu day is showing: { week, day }
let child = newChild();                                       // The current child's progress
let dishDraft = null;                                         // The dish being added/edited (null = form closed)
let cardDraft = null;                                         // The diet card being added/edited (null = form closed)
let pendingDelete = null;                                     // id waiting for "tap again to remove"
let confirmReset = false;                                     // true = showing "Yes, replace everything?"
let confirmClear = false;                                     // true = showing "Yes, clear today?"

const startTab = location.hash.slice(1);                      // Tab name from the address, e.g. index.html#kitchen
if (['choose', 'kitchen', 'tally'].includes(startTab)) view = startTab;

function newChild() {                                         // A blank "child choosing" state
  return { cardId: null, step: 0, picks: {}, selected: null, optFor: null };
  // picks: { main: {d: dishId, o: optionId or null}, ... }   optFor: dish id while choosing its options
}

/* ---------------------------------------------------------------------
   3. HELPERS
   --------------------------------------------------------------------- */

// Makes text safe to put inside HTML (same job as PHP's htmlspecialchars)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const dishById = id => S.dishes.find(d => d.id === id);          // Finds a dish by id
const cardById = id => S.cards.find(c => c.id === id) || null;    // Finds a diet card by id
const optById = (d, id) => d && d.options.find(o => o.id === id); // Finds an option inside a dish

// Is this dish served on this week/day?
const inSlot = (d, week, day) => (d.week === 0 || d.week === week) && (d.day === 'all' || d.day === day);

// Dishes for a course on the currently shown day
const dishesFor = courseKey => S.dishes.filter(d => d.course === courseKey && inSlot(d, slot.week, slot.day));

const isVeg = tags => tags.includes('veg') || tags.includes('vegan');   // Vegetarian (vegan counts too)

// THE SAFETY RULE for one dish + one option (option can be null)
function optionSafe(d, o, card) {
  if (!card) return true;                                                    // No diet card = everything is shown
  if (!d.checked) return false;                                              // Allergens not confirmed = never shown with a card
  const all = o ? d.allergens.concat(o.allergens) : d.allergens;             // Dish + option allergens together
  if (all.some(a => card.avoid.includes(a))) return false;                   // Contains something the card avoids
  if (card.vegOnly && !(isVeg(d.tags) && (!o || isVeg(o.tags)))) return false;   // Card is vegetarian-only and this isn't
  return true;
}

// Is a dish safe? A dish with options is safe if at least one option is safe
function safeFor(d, card) {
  if (d.options.length) return d.options.some(o => optionSafe(d, o, card));
  return optionSafe(d, null, card);
}

// Readable name of a pick, e.g. "Jacket potato – Tuna"
function pickName(p) {
  const d = dishById(p.d), o = optById(d, p.o);
  return d ? d.name + (o ? ' – ' + o.name : '') : '';
}

// Reads text aloud using the browser's built-in voice
function say(text) {
  if (!S.speech || !('speechSynthesis' in window)) return;   // Speech off or not supported
  try {
    speechSynthesis.cancel();                                 // Stop anything already being spoken
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';                                         // British English voice
    u.rate = 0.9;                                             // Slightly slower, easier to follow
    speechSynthesis.speak(u);
  } catch (e) { /* speech failed: ignore */ }
}

// Shows a short pop-up message (Bootstrap toast)
function toast(message) {
  document.getElementById('toast-text').textContent = message;
  bootstrap.Toast.getOrCreateInstance(document.getElementById('toast'), { delay: 2600 }).show();
}

// Picture HTML: the photo if there is one, otherwise the emoji
function dishMedia(d) {
  const inner = d.photo
    ? `<img src="${d.photo}" alt="">`
    : `<span class="dish-emoji" aria-hidden="true">${esc(d.emoji || '🍽️')}</span>`;
  return `<span class="dish-media">${inner}</span>`;
}
function dishThumb(d) {                                       // Small picture for kitchen lists
  return `<span class="thumb" aria-hidden="true">${d.photo ? `<img src="${d.photo}" alt="">` : esc(d.emoji || '🍽️')}</span>`;
}

// Big picture button used on the child screen (for dishes and options)
function tile(item, act, selected) {
  return `<div class="col">
    <button class="dish-tile ${selected ? 'selected' : ''}" data-act="${act}" data-id="${item.id}" aria-pressed="${selected}">
      ${dishMedia(item)}<span class="dish-name">${esc(item.name)}</span>
    </button></div>`;
}

// Label for when a dish is served, e.g. "Every day" or "Week 2 · Tuesday"
function whenLabel(d) {
  if (d.week === 0 && d.day === 'all') return 'Every day';
  const w = d.week === 0 ? 'Every week' : 'Week ' + d.week;
  const day = d.day === 'all' ? 'every day' : DAY_LABEL[d.day];
  return w + ' · ' + day;
}

const SPEAKER_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

/* ---------------------------------------------------------------------
   4a. SCREEN: Choose lunch (for children)
   --------------------------------------------------------------------- */
function viewChoose() {
  const card = cardById(child.cardId);                                // Selected diet card (or null)
  const today = todaySlot();                                          // Real today, to spot previews
  const isToday = slot.week === today.week && slot.day === today.day;

  // Which day's menu this is
  const dayLine = `<p class="label-caps mb-2">${DAY_LABEL[slot.day]} · Week ${slot.week} menu
    ${!isToday ? '<span class="badge text-bg-warning ms-1">Preview</span>' : today.weekend ? '<span class="badge text-bg-secondary ms-1">Next school day</span>' : ''}</p>`;

  // Diet card buttons
  const cardBar = `
    <div class="d-flex flex-wrap align-items-center gap-2 mb-4">
      <span class="label-caps me-1">Diet card</span>
      <button class="btn rounded-pill fw-bold ${!card ? 'btn-primary' : 'btn-outline-secondary'}" data-act="card" data-id="" aria-pressed="${!card}">No card</button>
      ${S.cards.map(c => `
        <button class="btn rounded-pill fw-bold d-inline-flex align-items-center gap-2 ${card && card.id === c.id ? 'btn-primary' : 'btn-outline-secondary'}"
                data-act="card" data-id="${c.id}" aria-pressed="${!!(card && card.id === c.id)}">
          <i class="swatch" style="background:${esc(c.color)}"></i>${esc(c.name)}
        </button>`).join('')}
    </div>`;

  // "Now / Next" step strip
  const steps = `
    <div class="d-flex flex-wrap gap-2 mb-3" aria-label="Steps">
      ${COURSES.map((c, i) => {
        const cls = i < child.step ? 'text-bg-success' : i === child.step ? 'step-now' : 'text-bg-secondary';
        return `<span class="badge rounded-pill step ${cls}">${i === child.step ? 'Now: ' : ''}${c.label}</span>`;
      }).join('')}
      <span class="badge rounded-pill step ${child.step >= COURSES.length ? 'step-now' : 'text-bg-secondary'}">All done</span>
    </div>`;

  // --- Finished ---
  if (child.step >= COURSES.length) {
    const picked = COURSES.map(c => child.picks[c.key]).filter(Boolean);        // Skipped steps removed
    return dayLine + cardBar + steps + `
      <section class="text-center py-3">
        <h1 class="display-5 fw-bold">All done!</h1>
        <p class="text-body-secondary">${picked.length ? 'You chose:' : 'No choices made.'}</p>
        <div class="row row-cols-2 row-cols-md-3 g-3 justify-content-center mb-4">
          ${picked.map(p => { const d = dishById(p.d), o = optById(d, p.o);
            return `<div class="col"><div class="dish-tile">${dishMedia(o || d)}<span class="dish-name">${esc(pickName(p))}</span></div></div>`; }).join('')}
        </div>
        <button class="btn btn-primary btn-lg px-5" data-act="nextchild">Next child</button>
      </section>`;
  }

  const course = COURSES[child.step];                                 // Current step
  let prompt, items, act;                                             // What to ask, which tiles, which click action
  if (child.optFor) {                                                 // Choosing inside a dish (e.g. a filling)
    const d = dishById(child.optFor);
    prompt = d.optionPrompt || `What would you like with your ${d.name.toLowerCase()}?`;
    items = d.options.filter(o => optionSafe(d, o, card));           // Only safe options
    act = 'pickopt';
  } else {                                                            // Choosing a dish
    prompt = course.prompt;
    items = dishesFor(course.key).filter(d => safeFor(d, card));      // Only safe dishes for today
    act = 'pick';
  }
  const selected = child.optFor ? optById(dishById(child.optFor), child.selected) : dishById(child.selected);

  // Picture grid, or a message if nothing is safe
  const grid = items.length
    ? `<div class="row row-cols-2 row-cols-md-3 row-cols-lg-4 g-3">${items.map(it => tile(it, act, child.selected === it.id)).join('')}</div>`
    : `<div class="card text-center p-4">
        <h3 class="h5">No ${course.label.toLowerCase()} choices for this diet card today</h3>
        <p class="text-body-secondary">Please ask a member of the kitchen team.${card ? ' Dishes are hidden until their allergens have been checked.' : ''}</p>
        <div><button class="btn btn-outline-secondary" data-act="skip">Skip ${course.label.toLowerCase()}</button></div>
      </div>`;

  // Sticky confirm bar
  const canGoBack = child.step > 0 || child.optFor;
  const confirmBar = `
    <div class="confirm-bar card shadow mt-4">
      <div class="card-body d-flex flex-wrap gap-2 align-items-center">
        ${canGoBack ? `<button class="btn btn-outline-secondary btn-lg" data-act="back">Back</button>` : ''}
        ${selected
          ? `<button class="btn btn-success btn-lg btn-choose" data-act="${child.optFor ? 'confirmopt' : 'confirm'}">I choose ${esc(selected.name)}</button>
             <button class="btn btn-outline-secondary btn-lg d-inline-flex align-items-center gap-2" data-act="say" aria-label="Say it again">${SPEAKER_ICON}Say it</button>`
          : `<span class="text-body-secondary fs-5 px-2 flex-grow-1">Tap a picture to choose.</span>`}
        ${course.optional && !child.optFor ? `<button class="btn btn-outline-secondary btn-lg" data-act="skip">${course.skipLabel}</button>` : ''}
      </div>
    </div>`;

  return dayLine + cardBar + steps + `<h1 class="prompt fw-bold mb-4">${esc(prompt)}</h1>` + grid + (items.length || canGoBack ? confirmBar : '');
}

/* ---------------------------------------------------------------------
   4b. SCREEN: Kitchen menu (for staff)
   --------------------------------------------------------------------- */

// Allergen checkboxes (used for dishes and options). prefix makes each id unique
function allergenChecks(prefix, name, selected, cols = 'row-cols-2 row-cols-sm-3') {
  return `<div class="row ${cols}">${ALLERGENS.map(([k, l]) => `
    <div class="col"><div class="form-check">
      <input class="form-check-input" type="checkbox" id="${prefix}-${k}" name="${name}" value="${k}" ${selected.includes(k) ? 'checked' : ''}>
      <label class="form-check-label" for="${prefix}-${k}">${l}</label>
    </div></div>`).join('')}</div>`;
}
function tagChecks(prefix, name, selected) {                  // Vegetarian/Vegan/Halal checkboxes
  return TAGS.map(([k, l]) => `
    <div class="form-check form-check-inline">
      <input class="form-check-input" type="checkbox" id="${prefix}-${k}" name="${name}" value="${k}" ${selected.includes(k) ? 'checked' : ''}>
      <label class="form-check-label" for="${prefix}-${k}">${l}</label>
    </div>`).join('');
}

// Form for adding/editing a dish
function dishForm() {
  const d = dishDraft;
  const isNew = !S.dishes.some(x => x.id === d.id);
  return `
    <form class="card editor mb-4" id="dishForm">
      <div class="card-body">
        <h3 class="h5 mb-3">${isNew ? 'Add a dish' : 'Edit ' + esc(d.name)}</h3>

        <div class="row g-3">
          <div class="col-12">
            <label class="form-label fw-bold" for="f-name">Dish name</label>
            <input class="form-control" id="f-name" name="name" required maxlength="50" value="${esc(d.name)}" placeholder="e.g. Shepherd's pie">
          </div>
          <div class="col-sm-4">
            <label class="form-label fw-bold" for="f-course">Step</label>
            <select class="form-select" id="f-course" name="course">
              ${COURSES.map(c => `<option value="${c.key}" ${d.course === c.key ? 'selected' : ''}>${c.label}</option>`).join('')}
            </select>
          </div>
          <div class="col-sm-4">
            <label class="form-label fw-bold" for="f-week">Week</label>
            <select class="form-select" id="f-week" name="week">
              <option value="0" ${d.week === 0 ? 'selected' : ''}>Every week</option>
              ${[1, 2, 3].map(w => `<option value="${w}" ${d.week === w ? 'selected' : ''}>Week ${w}</option>`).join('')}
            </select>
          </div>
          <div class="col-sm-4">
            <label class="form-label fw-bold" for="f-day">Day</label>
            <select class="form-select" id="f-day" name="day">
              <option value="all" ${d.day === 'all' ? 'selected' : ''}>Every day</option>
              ${DAYS.map(([k, l]) => `<option value="${k}" ${d.day === k ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
        </div>

        <fieldset class="mt-3">
          <legend class="fs-6 fw-bold">Picture</legend>
          <div class="d-flex flex-wrap gap-3 align-items-start">
            <span class="picture-preview" id="f-preview">${dishMedia(d)}</span>
            <div>
              <div class="d-flex flex-wrap gap-1 mb-2" style="max-width:460px">
                ${EMOJIS.map(e => `<button type="button" class="btn btn-outline-secondary emoji-btn" data-act="emoji" data-e="${e}" aria-label="Use ${e}">${e}</button>`).join('')}
              </div>
              <label class="form-label fw-bold small mb-1" for="f-photo">Or upload a photo</label>
              <input class="form-control form-control-sm mb-2" type="file" id="f-photo" accept="image/*">
              <button type="button" class="btn btn-sm btn-outline-danger" id="f-clearphoto" data-act="clearphoto" ${d.photo ? '' : 'hidden'}>Remove photo</button>
            </div>
          </div>
          <div class="form-text">A real photo of your own food often helps autistic children more than a cartoon picture.</div>
        </fieldset>

        <fieldset class="mt-3">
          <legend class="fs-6 fw-bold">Contains (the UK's 14 allergens)</legend>
          ${allergenChecks('f-alg', 'alg', d.allergens)}
        </fieldset>

        <fieldset class="mt-3">
          <legend class="fs-6 fw-bold">Suitable for</legend>
          ${tagChecks('f-tag', 'tag', d.tags)}
        </fieldset>

        <fieldset class="mt-3">
          <legend class="fs-6 fw-bold">Choices inside this dish <span class="fw-normal text-body-secondary">(optional, e.g. fillings or custard)</span></legend>
          ${d.options.length ? `
            <label class="form-label small fw-bold" for="f-oprompt">Question for the child</label>
            <input class="form-control mb-2" id="f-oprompt" name="optionPrompt" maxlength="80" value="${esc(d.optionPrompt)}" placeholder="e.g. What would you like in your jacket potato?">` : ''}
          ${d.options.map((o, i) => `
            <div class="border rounded p-2 mb-2">
              <div class="d-flex gap-2 mb-2">
                <input class="form-control form-control-sm" style="max-width:4.5rem" id="o-${i}-emoji" name="o-${i}-emoji" value="${esc(o.emoji)}" aria-label="Choice ${i + 1} picture (emoji)">
                <input class="form-control form-control-sm" id="o-${i}-name" name="o-${i}-name" value="${esc(o.name)}" placeholder="Choice name" aria-label="Choice ${i + 1} name">
                <button type="button" class="btn btn-sm btn-outline-danger" data-act="delopt" data-i="${i}">Remove</button>
              </div>
              <details><summary class="small">Allergens and tags for this choice (${o.allergens.map(a => ALLERGEN_LABEL[a]).join(', ') || 'none'})</summary>
                <div class="small mt-2">${allergenChecks(`o-${i}-alg`, `o-${i}-alg`, o.allergens, 'row-cols-2 row-cols-sm-4')}</div>
                <div class="small mt-1">${tagChecks(`o-${i}-tag`, `o-${i}-tag`, o.tags)}</div>
              </details>
            </div>`).join('')}
          <button type="button" class="btn btn-sm btn-outline-primary" data-act="addopt">Add a choice</button>
        </fieldset>

        <div class="form-check mt-4 p-3 rounded border border-warning-subtle bg-warning-subtle">
          <input class="form-check-input ms-0 me-2" type="checkbox" id="f-checked" name="checked" ${d.checked ? 'checked' : ''}>
          <label class="form-check-label fw-bold" for="f-checked">I have checked these allergens against the kitchen's official records</label>
          <div class="form-text">Until this is ticked, the dish is hidden whenever a diet card is selected.</div>
        </div>

        <div class="d-flex gap-2 mt-4">
          <button type="submit" class="btn btn-primary">Save dish</button>
          <button type="button" class="btn btn-outline-secondary" data-act="canceldish">Cancel</button>
        </div>
      </div>
    </form>`;
}

// Copies what's typed in the dish form into dishDraft (so re-drawing the form doesn't lose it)
function syncDishDraft() {
  const form = document.getElementById('dishForm');
  if (!form || !dishDraft) return;
  const f = new FormData(form);
  Object.assign(dishDraft, {
    name: String(f.get('name') || '').trim(),
    course: f.get('course'),
    week: Number(f.get('week')),
    day: f.get('day'),
    allergens: f.getAll('alg'),
    tags: f.getAll('tag'),
    checked: f.get('checked') === 'on',
    optionPrompt: String(f.get('optionPrompt') || '').trim(),
    options: dishDraft.options.map((o, i) => ({
      id: o.id,
      name: String(f.get(`o-${i}-name`) || '').trim(),
      emoji: String(f.get(`o-${i}-emoji`) || '').trim() || '🍽️',
      allergens: f.getAll(`o-${i}-alg`),
      tags: f.getAll(`o-${i}-tag`)
    }))
  });
}

// Form for adding/editing a diet card
function cardForm() {
  const c = cardDraft;
  const isNew = !S.cards.some(x => x.id === c.id);
  return `
    <form class="card editor mb-3" id="cardForm">
      <div class="card-body">
        <h3 class="h5 mb-3">${isNew ? 'Add a diet card' : 'Edit ' + esc(c.name)}</h3>
        <label class="form-label fw-bold" for="c-name">Card name</label>
        <input class="form-control" id="c-name" name="name" required maxlength="24" value="${esc(c.name)}" placeholder="e.g. Purple card">
        <div class="form-text">Use a colour or code, never a child's name.</div>
        <fieldset class="mt-3">
          <legend class="fs-6 fw-bold">Card colour</legend>
          ${CARD_COLOURS.map(([hex, n]) => `
            <div class="form-check form-check-inline">
              <input class="form-check-input" type="radio" id="c-col-${n}" name="color" value="${hex}" ${c.color === hex ? 'checked' : ''}>
              <label class="form-check-label d-inline-flex align-items-center gap-1" for="c-col-${n}"><i class="swatch" style="background:${hex}"></i>${n}</label>
            </div>`).join('')}
        </fieldset>
        <fieldset class="mt-3">
          <legend class="fs-6 fw-bold">Must avoid</legend>
          ${allergenChecks('c-alg', 'avoid', c.avoid, 'row-cols-2')}
        </fieldset>
        <div class="form-check form-switch mt-3">
          <input class="form-check-input" type="checkbox" role="switch" id="c-veg" name="vegOnly" ${c.vegOnly ? 'checked' : ''}>
          <label class="form-check-label fw-bold" for="c-veg">Vegetarian dishes only</label>
        </div>
        <div class="d-flex gap-2 mt-4">
          <button type="submit" class="btn btn-primary">Save card</button>
          <button type="button" class="btn btn-outline-secondary" data-act="cancelcard">Cancel</button>
        </div>
      </div>
    </form>`;
}

// The whole kitchen screen
function viewKitchen() {
  const today = todaySlot();
  const shown = S.dishes.filter(d => inSlot(d, slot.week, slot.day));        // Dishes on the shown day
  const unchecked = shown.filter(d => !d.checked).length;                    // How many still need allergen checks

  // Week and day pickers
  const picker = `
    <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
      <div class="btn-group" role="group" aria-label="Menu week">
        ${[1, 2, 3].map(w => `<button class="btn btn-sm ${slot.week === w ? 'btn-primary' : 'btn-outline-secondary'}" data-act="slotweek" data-w="${w}">Week ${w}</button>`).join('')}
      </div>
      <div class="btn-group flex-wrap" role="group" aria-label="Menu day">
        ${DAYS.map(([k]) => `<button class="btn btn-sm ${slot.day === k ? 'btn-primary' : 'btn-outline-secondary'}" data-act="slotday" data-d="${k}">${DAY_LABEL[k].slice(0, 3)}</button>`).join('')}
      </div>
      ${slot.week !== today.week || slot.day !== today.day ? `<button class="btn btn-sm btn-link" data-act="today">Back to today</button>` : ''}
    </div>`;

  // Dish list, grouped by step
  const menu = COURSES.map(c => {
    const list = shown.filter(d => d.course === c.key);
    return `
      <h3 class="label-caps mt-4 mb-2">${c.label} · ${list.length} ${list.length === 1 ? 'dish' : 'dishes'}</h3>
      <ul class="list-group">
        ${list.map(d => `
          <li class="list-group-item d-flex gap-3 align-items-center">
            ${dishThumb(d)}
            <div class="flex-grow-1" style="min-width:0">
              <div class="fw-bold">${esc(d.name)} <span class="badge text-bg-light border fw-normal">${whenLabel(d)}</span></div>
              ${d.options.length ? `<div class="small text-body-secondary">Choices: ${d.options.map(o => esc(o.name)).join(', ')}</div>` : ''}
              <div class="d-flex flex-wrap gap-1 mt-1">
                ${d.checked ? '' : '<span class="badge text-bg-warning">Allergens not checked</span>'}
                ${d.allergens.map(a => `<span class="badge ${d.checked ? 'text-bg-danger' : 'border border-danger text-danger'}">${ALLERGEN_LABEL[a]}</span>`).join('')}
                ${d.tags.map(t => `<span class="badge text-bg-success">${TAG_LABEL[t]}</span>`).join('')}
              </div>
            </div>
            <div class="d-flex flex-wrap gap-1 justify-content-end">
              <button class="btn btn-sm btn-outline-secondary" data-act="editdish" data-id="${d.id}">Edit</button>
              <button class="btn btn-sm ${pendingDelete === d.id ? 'btn-danger' : 'btn-outline-danger'}" data-act="deldish" data-id="${d.id}">${pendingDelete === d.id ? 'Tap again to remove' : 'Remove'}</button>
            </div>
          </li>`).join('') || '<li class="list-group-item text-body-secondary">No dishes for this day.</li>'}
      </ul>`;
  }).join('');

  // Diet cards
  const cards = S.cards.map(c => `
    <li class="list-group-item d-flex gap-3 align-items-start">
      <i class="swatch swatch-lg mt-1" style="background:${esc(c.color)}"></i>
      <div class="flex-grow-1" style="min-width:0">
        <div class="fw-bold">${esc(c.name)}</div>
        <div class="d-flex flex-wrap gap-1 mt-1">
          ${c.avoid.map(a => `<span class="badge text-bg-danger">No ${ALLERGEN_LABEL[a].toLowerCase()}</span>`).join('')}
          ${c.vegOnly ? '<span class="badge text-bg-success">Vegetarian only</span>' : ''}
        </div>
        <div class="small text-body-secondary mt-1">${shown.filter(d => safeFor(d, c)).length} of ${shown.length} dishes shown on this day</div>
      </div>
      <div class="d-flex flex-column gap-1">
        <button class="btn btn-sm btn-outline-secondary" data-act="editcard" data-id="${c.id}">Edit</button>
        <button class="btn btn-sm ${pendingDelete === c.id ? 'btn-danger' : 'btn-outline-danger'}" data-act="delcard" data-id="${c.id}">${pendingDelete === c.id ? 'Tap again' : 'Remove'}</button>
      </div>
    </li>`).join('');

  return `
    <div class="row g-4">
      <div class="col-lg-7">
        <section class="card"><div class="card-body">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
            <h2 class="h4 mb-0">Menu: Week ${slot.week}, ${DAY_LABEL[slot.day]}</h2>
            <button class="btn btn-primary" data-act="newdish">Add a dish</button>
          </div>
          ${picker}
          ${unchecked ? `<div class="alert alert-warning small py-2">${unchecked} ${unchecked === 1 ? 'dish needs' : 'dishes need'} an allergen check. Red outlined allergens are <b>suggestions only</b>. Open each dish, compare with the official records, then tick the confirmation box.</div>` : ''}
          ${dishDraft ? dishForm() : ''}
          ${menu}
        </div></section>
      </div>

      <div class="col-lg-5 d-flex flex-column gap-4">
        <section class="card"><div class="card-body">
          <h2 class="h4 mb-2">Menu rotation</h2>
          <p class="small text-body-secondary mb-2">This week (starting ${mondayOf(new Date()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}) is:</p>
          <div class="btn-group" role="group" aria-label="This week is">
            ${[1, 2, 3].map(w => `<button class="btn ${weekFor(new Date()) === w ? 'btn-primary' : 'btn-outline-secondary'}" data-act="setweek" data-w="${w}">Week ${w}</button>`).join('')}
          </div>
          <p class="small text-body-secondary mt-2 mb-0">The menu moves on to the next week automatically every Monday.</p>
        </div></section>

        <section class="card"><div class="card-body">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
            <h2 class="h4 mb-0">Diet cards</h2>
            <button class="btn btn-outline-primary" data-act="newcard">Add card</button>
          </div>
          <p class="small text-body-secondary">Staff pick a card before a child chooses. Dishes that aren't safe for that card, or haven't been allergen-checked, are hidden.</p>
          ${cardDraft ? cardForm() : ''}
          <ul class="list-group">${cards || '<li class="list-group-item text-body-secondary">No diet cards yet.</li>'}</ul>
        </div></section>

        <section class="card"><div class="card-body">
          <h2 class="h4 mb-3">Settings</h2>
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" role="switch" id="s-speech" ${S.speech ? 'checked' : ''}>
            <label class="form-check-label fw-bold" for="s-speech">Read choices aloud</label>
          </div>
          <p class="small text-body-secondary">Speaks each dish when a child taps it, using the device's built-in voice.</p>
          <div class="d-flex flex-wrap gap-2">
            ${confirmReset
              ? `<button class="btn btn-danger" data-act="doreset">Yes, replace everything</button>
                 <button class="btn btn-outline-secondary" data-act="cancelreset">Keep my changes</button>`
              : `<button class="btn btn-outline-secondary" data-act="reset">Restore school menu</button>`}
          </div>
        </div></section>
      </div>
    </div>`;
}

/* ---------------------------------------------------------------------
   4c. SCREEN: Today's choices (counts)
   --------------------------------------------------------------------- */
function viewTally() {
  const today = todaySlot();
  // Total children = number of mains chosen today (every main dish, any day)
  const total = S.dishes.filter(d => d.course === 'main').reduce((sum, d) => sum + (S.tally[d.id] || 0), 0);
  const skippedMain = S.tally['skip/main'] || 0;              // Children who skipped the main

  const columns = COURSES.map(c => {
    const list = S.dishes
      .filter(d => d.course === c.key && (inSlot(d, today.week, today.day) || S.tally[d.id]))   // Today's dishes + anything counted
      .sort((a, b) => (S.tally[b.id] || 0) - (S.tally[a.id] || 0));                              // Most popular first
    const max = Math.max(1, ...list.map(d => S.tally[d.id] || 0));
    const skipped = S.tally['skip/' + c.key] || 0;
    return `
      <div class="col-lg-4">
        <section class="card h-100"><div class="card-body">
          <h2 class="h5 mb-3">${c.label}</h2>
          ${list.map(d => {
            const n = S.tally[d.id] || 0;
            const breakdown = d.options.map(o => [o.name, S.tally[d.id + '/' + o.id] || 0]).filter(([, k]) => k);   // Counts per option
            return `
              <div class="d-flex align-items-center gap-2 mb-2">
                <span class="fs-4" style="width:40px;text-align:center" aria-hidden="true">${d.photo ? '📷' : esc(d.emoji || '🍽️')}</span>
                <div class="flex-grow-1" style="min-width:0">
                  <div class="small fw-bold text-truncate">${esc(d.name)}</div>
                  <div class="progress tally-progress" role="progressbar" aria-label="${esc(d.name)}" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="${max}">
                    <div class="progress-bar" style="width:${(n / max * 100).toFixed(1)}%"></div>
                  </div>
                  ${breakdown.length ? `<div class="small text-body-secondary mt-1">${breakdown.map(([name, k]) => `${esc(name)}: ${k}`).join(' · ')}</div>` : ''}
                </div>
                <span class="fw-bold tabular" style="width:3ch;text-align:right">${n}</span>
              </div>`;
          }).join('') || '<p class="text-body-secondary">No dishes.</p>'}
          ${skipped ? `<p class="small text-body-secondary mb-0">${c.optional ? 'Said no thank you' : 'Skipped'}: ${skipped}</p>` : ''}
        </div></section>
      </div>`;
  }).join('');

  return `
    <div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
      <div>
        <div class="label-caps">Children who have chosen · ${DAY_LABEL[today.day]}, Week ${today.week}</div>
        <div class="big-number tabular">${total + skippedMain}</div>
      </div>
      <div class="d-flex flex-wrap gap-2 align-items-center">
        ${confirmClear
          ? `<button class="btn btn-danger" data-act="doclear">Yes, clear today</button>
             <button class="btn btn-outline-secondary" data-act="cancelclear">Cancel</button>`
          : `<button class="btn btn-outline-secondary" data-act="clear">Start a new day</button>`}
      </div>
    </div>
    <div class="row g-4">${columns}</div>
    <p class="small text-body-secondary mt-3">Use these counts to plan portions and reduce food waste. No child's name is recorded.</p>`;
}

/* ---------------------------------------------------------------------
   RENDER - redraw the current screen
   --------------------------------------------------------------------- */
function render() {
  document.querySelectorAll('#tabs .nav-link').forEach(b => {         // Highlight the current tab
    const on = b.dataset.v === view;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  document.getElementById('app').innerHTML =
    view === 'choose' ? viewChoose() : view === 'kitchen' ? viewKitchen() : viewTally();
}

/* ---------------------------------------------------------------------
   Photo upload: shrink the photo so it doesn't fill up storage
   --------------------------------------------------------------------- */
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();                                   // Browser tool for reading files
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, 400 / Math.max(img.width, img.height));   // Longest side max 400px
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));                  // JPEG at 80% quality
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------------------------------------------------------------------
   Child flow helpers
   --------------------------------------------------------------------- */
function recordChoices() {                                             // Adds the finished child's choices to today's counts
  COURSES.forEach(c => {
    const p = child.picks[c.key];
    if (!p) { S.tally['skip/' + c.key] = (S.tally['skip/' + c.key] || 0) + 1; return; }   // Skipped step
    S.tally[p.d] = (S.tally[p.d] || 0) + 1;                                               // Count the dish
    if (p.o) S.tally[p.d + '/' + p.o] = (S.tally[p.d + '/' + p.o] || 0) + 1;               // Count the option
  });
  save();
}

function advance() {                                                   // Moves on to the next step
  child.selected = null;
  child.optFor = null;
  child.step++;
  if (child.step >= COURSES.length) {                                  // Finished all steps
    recordChoices();
    const names = COURSES.map(c => child.picks[c.key]).filter(Boolean).map(pickName);
    say('All done. You chose ' + (names.join(', ') || 'nothing') + '.');
  } else {
    say(COURSES[child.step].prompt);                                   // Ask the next question
  }
}

/* ---------------------------------------------------------------------
   5. EVENTS - every button has data-act="..." saying what it does
   --------------------------------------------------------------------- */
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-act]');                          // The clicked button
  if (!btn) return;
  const act = btn.dataset.act, id = btn.dataset.id;
  if (act !== 'deldish' && act !== 'delcard') pendingDelete = null;    // Any other click cancels "tap again"

  switch (act) {
    // ----- Tabs -----
    case 'view':
      view = btn.dataset.v;
      dishDraft = cardDraft = null;
      confirmReset = confirmClear = false;
      break;

    // ----- Child screen -----
    case 'card':                                                       // Diet card chosen
      child.cardId = id || null;
      child.selected = null;
      child.optFor = null;
      break;
    case 'pick': {                                                     // Dish tapped
      child.selected = id;
      const d = dishById(id);
      if (d) say(d.name);
      break;
    }
    case 'pickopt': {                                                  // Option tapped (e.g. a filling)
      child.selected = id;
      const o = optById(dishById(child.optFor), id);
      if (o) say(o.name);
      break;
    }
    case 'say': {                                                      // "Say it" button
      const item = child.optFor ? optById(dishById(child.optFor), child.selected) : dishById(child.selected);
      if (item) say(item.name);
      return;
    }
    case 'confirm': {                                                  // "I choose <dish>"
      const d = dishById(child.selected);
      if (!d) return;
      const card = cardById(child.cardId);
      const safeOpts = d.options.filter(o => optionSafe(d, o, card));
      if (safeOpts.length) {                                           // Dish has choices inside: ask about them next
        child.optFor = d.id;
        child.selected = null;
        say('You chose ' + d.name + '. ' + (d.optionPrompt || ''));
      } else {                                                         // No choices inside: save and move on
        child.picks[COURSES[child.step].key] = { d: d.id, o: null };
        advance();
      }
      break;
    }
    case 'confirmopt': {                                               // "I choose <option>"
      if (!child.selected) return;
      child.picks[COURSES[child.step].key] = { d: child.optFor, o: child.selected };
      advance();
      break;
    }
    case 'skip':                                                       // "No thank you" / skip a step
      child.picks[COURSES[child.step].key] = null;
      advance();
      break;
    case 'back':                                                       // Go back
      if (child.optFor) {                                              // From options back to dishes
        child.selected = child.optFor;
        child.optFor = null;
      } else {                                                         // Back one step
        child.step = Math.max(0, child.step - 1);
        const p = child.picks[COURSES[child.step].key];
        child.selected = p ? p.d : null;
      }
      break;
    case 'nextchild':                                                  // Reset for the next child (card too, for safety)
      child = newChild();
      break;

    // ----- Kitchen: which day is shown -----
    case 'slotweek': slot = { ...slot, week: Number(btn.dataset.w) }; dishDraft = null; break;
    case 'slotday':  slot = { ...slot, day: btn.dataset.d };          dishDraft = null; break;
    case 'today':    slot = todaySlot();                              dishDraft = null; break;
    case 'setweek':                                                    // "This week is Week N"
      S.rotation = { anchor: isoDate(mondayOf(new Date())), anchorWeek: Number(btn.dataset.w) };
      save();
      slot = todaySlot();
      toast('This week is now Week ' + btn.dataset.w);
      break;

    // ----- Kitchen: dishes -----
    case 'newdish':
      dishDraft = { id: uid(), name: '', emoji: '🍽️', photo: null, course: 'main', week: slot.week, day: slot.day,
                    allergens: [], tags: [], checked: false, options: [], optionPrompt: '' };
      cardDraft = null;
      break;
    case 'editdish':
      dishDraft = JSON.parse(JSON.stringify(dishById(id)));            // Copy, so Cancel doesn't change the original
      cardDraft = null;
      break;
    case 'canceldish': dishDraft = null; break;
    case 'addopt':                                                     // "Add a choice" inside a dish
      syncDishDraft();                                                 // Keep what's already typed
      dishDraft.options.push(opt('', '🍽️'));
      break;
    case 'delopt':                                                     // Remove a choice
      syncDishDraft();
      dishDraft.options.splice(Number(btn.dataset.i), 1);
      break;
    case 'deldish':
      if (pendingDelete === id) {
        S.dishes = S.dishes.filter(d => d.id !== id);
        pendingDelete = null;
        save();
        toast('Dish removed');
      } else pendingDelete = id;
      break;
    case 'emoji':                                                      // Emoji picked for the dish
      dishDraft.emoji = btn.dataset.e;
      dishDraft.photo = null;
      document.getElementById('f-preview').innerHTML = dishMedia(dishDraft);
      document.getElementById('f-clearphoto').hidden = true;
      return;                                                          // Don't redraw (keeps typed text)
    case 'clearphoto':
      dishDraft.photo = null;
      document.getElementById('f-preview').innerHTML = dishMedia(dishDraft);
      btn.hidden = true;
      return;

    // ----- Kitchen: diet cards -----
    case 'newcard':
      cardDraft = { id: uid(), name: '', color: CARD_COLOURS[3][0], avoid: [], vegOnly: false };
      dishDraft = null;
      break;
    case 'editcard':
      cardDraft = JSON.parse(JSON.stringify(cardById(id)));
      dishDraft = null;
      break;
    case 'cancelcard': cardDraft = null; break;
    case 'delcard':
      if (pendingDelete === id) {
        S.cards = S.cards.filter(c => c.id !== id);
        if (child.cardId === id) child.cardId = null;
        pendingDelete = null;
        save();
        toast('Diet card removed');
      } else pendingDelete = id;
      break;

    // ----- Settings and counts -----
    case 'reset':       confirmReset = true;  break;
    case 'cancelreset': confirmReset = false; break;
    case 'doreset':
      S = startingData();
      save();
      confirmReset = false;
      child = newChild();
      slot = todaySlot();
      toast('School menu restored');
      break;
    case 'clear':       confirmClear = true;  break;
    case 'cancelclear': confirmClear = false; break;
    case 'doclear':
      S.tally = {};
      save();
      confirmClear = false;
      toast('Ready for a new day');
      break;

    default: return;
  }
  render();                                                            // Redraw with the changes
});

// Switches and file uploads
document.addEventListener('change', async e => {
  if (e.target.id === 's-speech') {                                    // "Read choices aloud"
    S.speech = e.target.checked;
    save();
    toast(S.speech ? 'Reading aloud is on' : 'Reading aloud is off');
  }
  if (e.target.id === 'f-photo' && e.target.files[0]) {                // Photo chosen in the dish form
    try {
      dishDraft.photo = await readPhoto(e.target.files[0]);
      document.getElementById('f-preview').innerHTML = dishMedia(dishDraft);
      document.getElementById('f-clearphoto').hidden = false;
    } catch (err) {
      toast('That file could not be read as a picture. Try a JPG or PNG.');
    }
  }
});

// Saving the forms
document.addEventListener('submit', e => {
  e.preventDefault();                                                  // Stop the page reloading

  if (e.target.id === 'dishForm') {
    syncDishDraft();                                                   // Read every field into dishDraft
    const d = dishDraft;
    d.options = d.options.filter(o => o.name);                         // Drop choices left without a name
    const i = S.dishes.findIndex(x => x.id === d.id);
    if (i >= 0) S.dishes[i] = d; else S.dishes.push(d);                // Replace or add
    dishDraft = null;
    save();
    toast('Saved ' + d.name);
  }

  if (e.target.id === 'cardForm') {
    const f = new FormData(e.target);
    const c = Object.assign(cardDraft, {
      name: String(f.get('name')).trim(),
      color: f.get('color') || CARD_COLOURS[0][0],
      avoid: f.getAll('avoid'),
      vegOnly: f.get('vegOnly') === 'on'
    });
    const i = S.cards.findIndex(x => x.id === c.id);
    if (i >= 0) S.cards[i] = c; else S.cards.push(c);
    cardDraft = null;
    save();
    toast('Saved ' + c.name);
  }

  render();
});

/* ---------------------------------------------------------------------
   START - draw the first screen
   --------------------------------------------------------------------- */
render();
