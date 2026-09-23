/* =====================================================================
   PickMyPlate - app.js
   All the behaviour of the app. It works like this:
     1. DATA      - the allergens, courses and sample menu
     2. STORAGE   - load/save the menu in the browser (localStorage)
     3. HELPERS   - small reusable functions
     4. SCREENS   - functions that build the HTML for each tab
     5. EVENTS    - what happens when someone clicks, changes or saves
   Every screen is rebuilt by render() whenever something changes.
   ===================================================================== */

/* ---------------------------------------------------------------------
   0. DARK MODE - follow the device's light/dark setting
   --------------------------------------------------------------------- */
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');   // Asks the device whether dark mode is on
function applyTheme() {                                                // Function that sets Bootstrap's theme
  document.documentElement.setAttribute('data-bs-theme', darkQuery.matches ? 'dark' : 'light');  // "dark" or "light" on <html>
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
const ALLERGEN_LABEL = Object.fromEntries(ALLERGENS);   // Turns the list into a lookup, e.g. ALLERGEN_LABEL.nuts -> "Tree nuts"

// Dietary tags a dish can have. Format: [code, label]
const TAGS = [['veg', 'Vegetarian'], ['vegan', 'Vegan'], ['halal', 'Halal']];
const TAG_LABEL = Object.fromEntries(TAGS);             // Lookup, e.g. TAG_LABEL.veg -> "Vegetarian"

// The courses a child chooses, in order. Add { key:'side', ... } here to add a new course
const COURSES = [
  { key: 'main',    label: 'Main',    prompt: 'What would you like for your main?' },   // Step 1
  { key: 'pudding', label: 'Pudding', prompt: 'What would you like for pudding?' }      // Step 2
];

// Colours available for diet cards. Format: [hex colour, name]
const CARD_COLOURS = [['#3B7DD8', 'Blue'], ['#3E9B5F', 'Green'], ['#E07B2A', 'Orange'], ['#8A5CC2', 'Purple'], ['#D1508A', 'Pink']];

// Emoji offered in the dish picture picker. Add or remove emoji here
const EMOJIS = ['🐟','🍝','🍛','🍔','🥔','🍕','🌭','🥪','🥗','🍗','🍚','🥘','🌯','🍲','🥦','🥕','🌽','🍎','🍌','🍓','🍇','🥣','🍰','🧁','🍪','🍮','🥛','🧃'];

const STORAGE_KEY = 'pickmyplate.v1';   // Name under which the menu is saved in the browser

// Returns a fresh copy of the sample menu (used on first run and by "Restore sample menu")
function sampleData() {
  return {
    dishes: [                                                                           // List of dishes
      { id: 'd1', name: 'Fish fingers',            emoji: '🐟', photo: null, course: 'main',    allergens: ['fish', 'gluten'],          tags: ['halal'] },
      { id: 'd2', name: 'Cheese pasta',            emoji: '🍝', photo: null, course: 'main',    allergens: ['gluten', 'milk'],          tags: ['veg'] },
      { id: 'd3', name: 'Chicken curry and rice',  emoji: '🍛', photo: null, course: 'main',    allergens: ['celery', 'mustard'],       tags: ['halal'] },
      { id: 'd4', name: 'Veggie burger',           emoji: '🍔', photo: null, course: 'main',    allergens: ['gluten', 'soya', 'sesame'], tags: ['veg', 'vegan'] },
      { id: 'd5', name: 'Jacket potato and beans', emoji: '🥔', photo: null, course: 'main',    allergens: [],                          tags: ['veg', 'vegan', 'halal'] },
      { id: 'd6', name: 'Apple crumble',           emoji: '🍎', photo: null, course: 'pudding', allergens: ['gluten', 'milk'],          tags: ['veg'] },
      { id: 'd7', name: 'Yoghurt',                 emoji: '🥣', photo: null, course: 'pudding', allergens: ['milk'],                    tags: ['veg', 'halal'] },
      { id: 'd8', name: 'Fruit pot',               emoji: '🍓', photo: null, course: 'pudding', allergens: [],                          tags: ['veg', 'vegan', 'halal'] },
      { id: 'd9', name: 'Banana',                  emoji: '🍌', photo: null, course: 'pudding', allergens: [],                          tags: ['veg', 'vegan', 'halal'] }
    ],
    cards: [                                                                            // List of diet cards (colours, never names)
      { id: 'c1', name: 'Blue card',   color: '#3B7DD8', avoid: ['milk', 'eggs'],               vegOnly: false },
      { id: 'c2', name: 'Green card',  color: '#3E9B5F', avoid: ['gluten'],                     vegOnly: false },
      { id: 'c3', name: 'Orange card', color: '#E07B2A', avoid: ['peanuts', 'nuts', 'sesame'],  vegOnly: true }
    ],
    tally: { d1: 6, d2: 4, d3: 9, d4: 3, d5: 5, d6: 8, d7: 5, d8: 9, d9: 5 },   // Example counts: dish id -> number of children
    tallySample: true,                                                          // true = the counts above are examples
    speech: true                                                                // true = read dish names aloud
  };
}

/* ---------------------------------------------------------------------
   2. STORAGE - keep the menu on this device
   --------------------------------------------------------------------- */
let S = null;                                                        // "S" holds all saved data (dishes, cards, tally, settings)
try { S = JSON.parse(localStorage.getItem(STORAGE_KEY)); }           // Try to load saved data from the browser
catch (e) { /* storage blocked (e.g. private window): ignore */ }    // If the browser blocks storage, carry on without it
if (!S || !Array.isArray(S.dishes) || !Array.isArray(S.cards)) {     // If nothing was saved (or it's broken)...
  S = sampleData();                                                  // ...start with the sample menu
}

function save() {                                                    // Saves all data to the browser
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); }      // Convert to text and store it
  catch (e) { toast('Could not save on this device. Changes will last until you close the page.'); }  // Tell the user if it failed
}

/* ---------------------------------------------------------------------
   Screen state (NOT saved - resets when the page reloads)
   --------------------------------------------------------------------- */
let view = 'choose';                                          // Which tab is showing: 'choose', 'kitchen' or 'tally'
let child = newChild();                                       // The current child's progress through choosing
let dishDraft = null;                                         // The dish being added/edited (null = form closed)
let cardDraft = null;                                         // The diet card being added/edited (null = form closed)
let pendingDelete = null;                                     // id of an item waiting for "tap again to remove"
let confirmReset = false;                                     // true = showing "Yes, replace everything?" buttons
let confirmClear = false;                                     // true = showing "Yes, clear today?" buttons

const startTab = location.hash.slice(1);                      // Read the tab name from the web address, e.g. index.html#kitchen -> "kitchen"
if (['choose', 'kitchen', 'tally'].includes(startTab)) view = startTab;   // If it's a real tab, open that tab first

function newChild() {                                         // Returns a blank "child choosing" state
  return { cardId: null, step: 0, picks: {}, selected: null };   // No card, first course, no picks, nothing tapped
}

/* ---------------------------------------------------------------------
   3. HELPERS
   --------------------------------------------------------------------- */
const uid = () => Math.random().toString(36).slice(2, 9);    // Makes a random id like "k3f9a2x" for new dishes/cards

// Makes text safe to put inside HTML (same job as PHP's htmlspecialchars)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const dishById = id => S.dishes.find(d => d.id === id);          // Finds a dish by its id
const cardById = id => S.cards.find(c => c.id === id) || null;    // Finds a diet card by its id (null if none)

// THE SAFETY RULE: is this dish OK for this diet card?
function safeFor(dish, card) {
  if (!card) return true;                                                          // No diet card = every dish is shown
  if (dish.allergens.some(a => card.avoid.includes(a))) return false;              // Dish contains something the card avoids = hide it
  if (card.vegOnly && !dish.tags.includes('veg') && !dish.tags.includes('vegan')) return false;  // Card is vegetarian-only and dish isn't = hide it
  return true;                                                                     // Otherwise the dish is safe
}

// Reads text aloud using the browser's built-in voice
function say(text) {
  if (!S.speech || !('speechSynthesis' in window)) return;   // Stop if speech is turned off or not supported
  try {
    speechSynthesis.cancel();                                 // Stop anything already being spoken
    const u = new SpeechSynthesisUtterance(text);             // Create the thing to say
    u.lang = 'en-GB';                                         // British English voice
    u.rate = 0.9;                                             // Slightly slower than normal, easier to follow
    speechSynthesis.speak(u);                                 // Speak it
  } catch (e) { /* speech failed: ignore */ }                 // If speaking fails, do nothing
}

// Shows a short pop-up message at the bottom (Bootstrap toast)
function toast(message) {
  document.getElementById('toast-text').textContent = message;                  // Put the message in the toast
  bootstrap.Toast.getOrCreateInstance(document.getElementById('toast'), { delay: 2600 }).show();  // Show it for 2.6 seconds
}

// HTML for a dish's picture: the photo if there is one, otherwise the emoji
function dishMedia(d) {
  const inner = d.photo
    ? `<img src="${d.photo}" alt="">`                                             // Uploaded photo
    : `<span class="dish-emoji" aria-hidden="true">${esc(d.emoji || '🍽️')}</span>`;  // Emoji (plate if none chosen)
  return `<span class="dish-media">${inner}</span>`;                             // Wrap it in the 4:3 picture box
}

// HTML for the small picture in the kitchen list
function dishThumb(d) {
  return `<span class="thumb" aria-hidden="true">${d.photo ? `<img src="${d.photo}" alt="">` : esc(d.emoji || '🍽️')}</span>`;
}

// Loudspeaker icon used on the "Say it" button
const SPEAKER_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

/* ---------------------------------------------------------------------
   4a. SCREEN: Choose lunch (for children)
   --------------------------------------------------------------------- */
function viewChoose() {
  const card = cardById(child.cardId);                                // The diet card staff selected (or null)

  // Row of diet card buttons at the top
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

  // "Now / Next" step strip: Main -> Pudding -> All done
  const steps = `
    <div class="d-flex flex-wrap gap-2 mb-3" aria-label="Steps">
      ${COURSES.map((c, i) => {
        const cls = i < child.step ? 'text-bg-success' : i === child.step ? 'step-now' : 'text-bg-secondary';  // Done = green, now = yellow, later = grey
        return `<span class="badge rounded-pill step ${cls}">${i === child.step ? 'Now: ' : ''}${c.label}</span>`;
      }).join('')}
      <span class="badge rounded-pill step ${child.step >= COURSES.length ? 'step-now' : 'text-bg-secondary'}">All done</span>
    </div>`;

  // --- Finished: show what the child chose ---
  if (child.step >= COURSES.length) {
    const picked = COURSES.map(c => dishById(child.picks[c.key])).filter(Boolean);   // The dishes chosen (skipped courses removed)
    return cardBar + steps + `
      <section class="text-center py-3">
        <h1 class="display-5 fw-bold">All done!</h1>
        <p class="text-body-secondary">${picked.length ? 'You chose:' : 'No choices made.'}</p>
        <div class="row g-3 justify-content-center mb-4">
          ${picked.map(d => `<div class="col-6 col-md-3"><div class="dish-tile">${dishMedia(d)}<span class="dish-name">${esc(d.name)}</span></div></div>`).join('')}
        </div>
        <button class="btn btn-primary btn-lg px-5" data-act="nextchild">Next child</button>
      </section>`;
  }

  // --- Still choosing: show dishes for the current course ---
  const course = COURSES[child.step];                                              // Current course (Main or Pudding)
  const list = S.dishes.filter(d => d.course === course.key && safeFor(d, card));   // Only dishes in this course AND safe for the card
  const selected = dishById(child.selected);                                       // The dish currently tapped (or undefined)

  // Grid of picture tiles (Bootstrap row: 2 per row on phones, 3 on tablets, 4 on laptops)
  const grid = list.length
    ? `<div class="row row-cols-2 row-cols-md-3 row-cols-lg-4 g-3">
        ${list.map(d => `
          <div class="col">
            <button class="dish-tile ${child.selected === d.id ? 'selected' : ''}" data-act="pick" data-id="${d.id}" aria-pressed="${child.selected === d.id}">
              ${dishMedia(d)}
              <span class="dish-name">${esc(d.name)}</span>
            </button>
          </div>`).join('')}
      </div>`
    : `<div class="card text-center p-4">
        <h3 class="h5">No ${course.label.toLowerCase()} choices for this diet card today</h3>
        <p class="text-body-secondary">Please ask a member of the kitchen team.</p>
        <div><button class="btn btn-outline-secondary" data-act="skip">Skip ${course.label.toLowerCase()}</button></div>
      </div>`;

  // Sticky bar at the bottom with the confirm button
  const confirmBar = `
    <div class="confirm-bar card shadow mt-4">
      <div class="card-body d-flex flex-wrap gap-2 align-items-center">
        ${child.step > 0 ? `<button class="btn btn-outline-secondary btn-lg" data-act="back">Back</button>` : ''}
        ${selected
          ? `<button class="btn btn-success btn-lg btn-choose" data-act="confirm">I choose ${esc(selected.name)}</button>
             <button class="btn btn-outline-secondary btn-lg d-inline-flex align-items-center gap-2" data-act="say" aria-label="Say it again">${SPEAKER_ICON}Say it</button>`
          : `<span class="text-body-secondary fs-5 px-2">Tap a picture to choose.</span>`}
      </div>
    </div>`;

  // Put it all together. The confirm bar is hidden if there's nothing to choose on step 1
  return cardBar + steps + `<h1 class="prompt fw-bold mb-4">${course.prompt}</h1>` + grid + (list.length || child.step > 0 ? confirmBar : '');
}

/* ---------------------------------------------------------------------
   4b. SCREEN: Kitchen menu (for staff)
   --------------------------------------------------------------------- */

// Form for adding/editing a dish
function dishForm() {
  const d = dishDraft;                                          // The dish being edited
  const isNew = !S.dishes.some(x => x.id === d.id);             // true if it isn't in the menu yet
  return `
    <form class="card editor mb-4" id="dishForm">
      <div class="card-body">
        <h3 class="h5 mb-3">${isNew ? 'Add a dish' : 'Edit ' + esc(d.name)}</h3>

        <div class="row g-3">
          <div class="col-sm-8">
            <label class="form-label fw-bold" for="f-name">Dish name</label>
            <input class="form-control" id="f-name" name="name" required maxlength="40" value="${esc(d.name)}" placeholder="e.g. Shepherd's pie">
          </div>
          <div class="col-sm-4">
            <label class="form-label fw-bold" for="f-course">Course</label>
            <select class="form-select" id="f-course" name="course">
              ${COURSES.map(c => `<option value="${c.key}" ${d.course === c.key ? 'selected' : ''}>${c.label}</option>`).join('')}
            </select>
          </div>
        </div>

        <fieldset class="mt-3">
          <legend class="fs-6 fw-bold">Picture</legend>
          <div class="d-flex flex-wrap gap-3 align-items-start">
            <span class="picture-preview" id="f-preview">${dishMedia(d)}</span>
            <div>
              <div class="d-flex flex-wrap gap-1 mb-2" style="max-width:440px">
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
          <div class="row row-cols-2 row-cols-sm-3">
            ${ALLERGENS.map(([k, l]) => `
              <div class="col"><div class="form-check">
                <input class="form-check-input" type="checkbox" id="f-alg-${k}" name="alg" value="${k}" ${d.allergens.includes(k) ? 'checked' : ''}>
                <label class="form-check-label" for="f-alg-${k}">${l}</label>
              </div></div>`).join('')}
          </div>
        </fieldset>

        <fieldset class="mt-3">
          <legend class="fs-6 fw-bold">Suitable for</legend>
          ${TAGS.map(([k, l]) => `
            <div class="form-check form-check-inline">
              <input class="form-check-input" type="checkbox" id="f-tag-${k}" name="tag" value="${k}" ${d.tags.includes(k) ? 'checked' : ''}>
              <label class="form-check-label" for="f-tag-${k}">${l}</label>
            </div>`).join('')}
        </fieldset>

        <div class="d-flex gap-2 mt-4">
          <button type="submit" class="btn btn-primary">Save dish</button>
          <button type="button" class="btn btn-outline-secondary" data-act="canceldish">Cancel</button>
        </div>
      </div>
    </form>`;
}

// Form for adding/editing a diet card
function cardForm() {
  const c = cardDraft;                                          // The card being edited
  const isNew = !S.cards.some(x => x.id === c.id);              // true if it's a new card
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
          <div class="row row-cols-2">
            ${ALLERGENS.map(([k, l]) => `
              <div class="col"><div class="form-check">
                <input class="form-check-input" type="checkbox" id="c-alg-${k}" name="avoid" value="${k}" ${c.avoid.includes(k) ? 'checked' : ''}>
                <label class="form-check-label" for="c-alg-${k}">${l}</label>
              </div></div>`).join('')}
          </div>
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
  // Dish list, grouped by course
  const menu = COURSES.map(c => {
    const dishes = S.dishes.filter(d => d.course === c.key);    // Dishes in this course
    return `
      <h3 class="label-caps mt-4 mb-2">${c.label} · ${dishes.length} ${dishes.length === 1 ? 'dish' : 'dishes'}</h3>
      <ul class="list-group">
        ${dishes.map(d => `
          <li class="list-group-item d-flex gap-3 align-items-center">
            ${dishThumb(d)}
            <div class="flex-grow-1" style="min-width:0">
              <div class="fw-bold">${esc(d.name)}</div>
              <div class="d-flex flex-wrap gap-1 mt-1">
                ${d.allergens.map(a => `<span class="badge text-bg-danger">${ALLERGEN_LABEL[a]}</span>`).join('')}
                ${d.tags.map(t => `<span class="badge text-bg-success">${TAG_LABEL[t]}</span>`).join('')}
                ${!d.allergens.length ? '<span class="badge text-bg-light border">No listed allergens</span>' : ''}
              </div>
            </div>
            <div class="d-flex flex-wrap gap-1 justify-content-end">
              <button class="btn btn-sm btn-outline-secondary" data-act="editdish" data-id="${d.id}">Edit</button>
              <button class="btn btn-sm ${pendingDelete === d.id ? 'btn-danger' : 'btn-outline-danger'}" data-act="deldish" data-id="${d.id}">${pendingDelete === d.id ? 'Tap again to remove' : 'Remove'}</button>
            </div>
          </li>`).join('') || '<li class="list-group-item text-body-secondary">No dishes yet.</li>'}
      </ul>`;
  }).join('');

  // Diet card list
  const cards = S.cards.map(c => `
    <li class="list-group-item d-flex gap-3 align-items-start">
      <i class="swatch swatch-lg mt-1" style="background:${esc(c.color)}"></i>
      <div class="flex-grow-1" style="min-width:0">
        <div class="fw-bold">${esc(c.name)}</div>
        <div class="d-flex flex-wrap gap-1 mt-1">
          ${c.avoid.map(a => `<span class="badge text-bg-danger">No ${ALLERGEN_LABEL[a].toLowerCase()}</span>`).join('')}
          ${c.vegOnly ? '<span class="badge text-bg-success">Vegetarian only</span>' : ''}
        </div>
        <div class="small text-body-secondary mt-1">${S.dishes.filter(d => safeFor(d, c)).length} of ${S.dishes.length} dishes shown</div>
      </div>
      <div class="d-flex flex-column gap-1">
        <button class="btn btn-sm btn-outline-secondary" data-act="editcard" data-id="${c.id}">Edit</button>
        <button class="btn btn-sm ${pendingDelete === c.id ? 'btn-danger' : 'btn-outline-danger'}" data-act="delcard" data-id="${c.id}">${pendingDelete === c.id ? 'Tap again' : 'Remove'}</button>
      </div>
    </li>`).join('');

  // Layout: menu on the left (7/12 width), cards + settings on the right (5/12). Stacks on phones
  return `
    <div class="row g-4">
      <div class="col-lg-7">
        <section class="card"><div class="card-body">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
            <h2 class="h4 mb-0">Today's menu</h2>
            <button class="btn btn-primary" data-act="newdish">Add a dish</button>
          </div>
          ${dishDraft ? dishForm() : ''}
          ${menu}
        </div></section>
      </div>

      <div class="col-lg-5 d-flex flex-column gap-4">
        <section class="card"><div class="card-body">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
            <h2 class="h4 mb-0">Diet cards</h2>
            <button class="btn btn-outline-primary" data-act="newcard">Add card</button>
          </div>
          <p class="small text-body-secondary">Staff pick a card before a child chooses. Dishes that aren't safe for that card are hidden.</p>
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
                 <button class="btn btn-outline-secondary" data-act="cancelreset">Keep my menu</button>`
              : `<button class="btn btn-outline-secondary" data-act="reset">Restore sample menu</button>`}
          </div>
        </div></section>
      </div>
    </div>`;
}

/* ---------------------------------------------------------------------
   4c. SCREEN: Today's choices (counts)
   --------------------------------------------------------------------- */
function viewTally() {
  // Total children = total number of mains chosen
  const total = S.dishes.filter(d => d.course === COURSES[0].key).reduce((sum, d) => sum + (S.tally[d.id] || 0), 0);

  // One card per course, with a Bootstrap progress bar per dish
  const columns = COURSES.map(c => {
    const dishes = S.dishes.filter(d => d.course === c.key)                            // Dishes in this course...
      .sort((a, b) => (S.tally[b.id] || 0) - (S.tally[a.id] || 0));                    // ...most popular first
    const max = Math.max(1, ...dishes.map(d => S.tally[d.id] || 0));                   // Highest count (bars are relative to this)
    return `
      <div class="col-md-6">
        <section class="card h-100"><div class="card-body">
          <h2 class="h5 mb-3">${c.label}</h2>
          ${dishes.map(d => {
            const n = S.tally[d.id] || 0;                                              // How many chose this dish
            return `
              <div class="d-flex align-items-center gap-2 mb-2">
                <span class="fs-4" style="width:40px;text-align:center" aria-hidden="true">${d.photo ? '📷' : esc(d.emoji || '🍽️')}</span>
                <div class="flex-grow-1" style="min-width:0">
                  <div class="small fw-bold text-truncate">${esc(d.name)}</div>
                  <div class="progress tally-progress" role="progressbar" aria-label="${esc(d.name)}" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="${max}">
                    <div class="progress-bar" style="width:${(n / max * 100).toFixed(1)}%"></div>
                  </div>
                </div>
                <span class="fw-bold tabular" style="width:3ch;text-align:right">${n}</span>
              </div>`;
          }).join('') || '<p class="text-body-secondary">No dishes.</p>'}
        </div></section>
      </div>`;
  }).join('');

  return `
    <div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
      <div>
        <div class="label-caps">Children who have chosen</div>
        <div class="big-number tabular">${total}</div>
      </div>
      <div class="d-flex flex-wrap gap-2 align-items-center">
        ${S.tallySample ? '<span class="badge text-bg-warning fs-6 fw-normal">Example numbers. They clear when the first child chooses.</span>' : ''}
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
  document.querySelectorAll('#tabs .nav-link').forEach(b => {         // For each of the three tabs...
    const on = b.dataset.v === view;                                   // ...is it the current one?
    b.classList.toggle('active', on);                                  // Highlight it if so
    b.setAttribute('aria-selected', String(on));                       // Tell screen readers which tab is selected
  });
  const html = view === 'choose' ? viewChoose()                        // Build the child screen...
             : view === 'kitchen' ? viewKitchen()                      // ...or the kitchen screen...
             : viewTally();                                            // ...or the counts screen
  document.getElementById('app').innerHTML = html;                     // Put it on the page
}

/* ---------------------------------------------------------------------
   Photo upload: shrink the photo so it doesn't fill up storage
   --------------------------------------------------------------------- */
function readPhoto(file) {
  return new Promise((resolve, reject) => {                            // Returns the result later (loading takes time)
    const reader = new FileReader();                                   // Browser tool for reading files
    reader.onerror = reject;                                           // If reading fails, report an error
    reader.onload = () => {                                            // When the file has been read...
      const img = new Image();                                         // ...load it as an image
      img.onerror = reject;                                            // Not a valid image = error
      img.onload = () => {                                             // When the image is ready...
        const scale = Math.min(1, 400 / Math.max(img.width, img.height));   // Shrink so the longest side is max 400px
        const canvas = document.createElement('canvas');               // Invisible drawing area
        canvas.width = Math.round(img.width * scale);                  // New width
        canvas.height = Math.round(img.height * scale);                // New height
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);   // Draw the smaller image
        resolve(canvas.toDataURL('image/jpeg', 0.8));                  // Return it as JPEG text (80% quality)
      };
      img.src = reader.result;                                         // Start loading the image
    };
    reader.readAsDataURL(file);                                        // Start reading the file
  });
}

// Adds the finished child's choices to today's counts
function recordChoices() {
  if (S.tallySample) { S.tally = {}; S.tallySample = false; }          // First real child: clear the example numbers
  COURSES.forEach(c => {                                               // For each course...
    const id = child.picks[c.key];                                     // ...which dish was picked?
    if (id) S.tally[id] = (S.tally[id] || 0) + 1;                      // Add 1 to that dish's count
  });
  save();                                                              // Save the new counts
}

/* ---------------------------------------------------------------------
   5. EVENTS
   Every button has a data-act="..." attribute saying what it does.
   One click listener handles them all (like a PHP switch on $_GET['action']).
   --------------------------------------------------------------------- */
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-act]');                          // Find the button that was clicked
  if (!btn) return;                                                    // Clicked something else: ignore
  const act = btn.dataset.act;                                         // What to do, e.g. "pick"
  const id = btn.dataset.id;                                           // Which dish/card, if any
  if (act !== 'deldish' && act !== 'delcard') pendingDelete = null;    // Any other click cancels "tap again to remove"

  switch (act) {
    // ----- Tabs -----
    case 'view':                                                       // A tab was clicked
      view = btn.dataset.v;                                            // Switch to that tab
      dishDraft = cardDraft = null;                                    // Close any open forms
      confirmReset = confirmClear = false;                             // Cancel any open confirmations
      break;

    // ----- Child screen -----
    case 'card':                                                       // A diet card was chosen
      child.cardId = id || null;                                       // Remember it ("" means no card)
      child.selected = null;                                           // Clear the tapped dish (it may now be hidden)
      break;
    case 'pick': {                                                     // A dish picture was tapped
      child.selected = id;                                             // Highlight it
      const d = dishById(id);                                          // Find the dish
      if (d) say(d.name);                                              // Read its name aloud
      break;
    }
    case 'say': {                                                      // "Say it" button
      const d = dishById(child.selected);                              // The highlighted dish
      if (d) say(d.name);                                              // Read it aloud again
      return;                                                          // No need to redraw the screen
    }
    case 'confirm': {                                                  // "I choose ..." button
      const d = dishById(child.selected);                              // The chosen dish
      if (!d) return;                                                  // Nothing selected: do nothing
      child.picks[COURSES[child.step].key] = d.id;                     // Save the pick for this course
      child.selected = null;                                           // Clear the highlight
      child.step++;                                                    // Move to the next course
      if (child.step >= COURSES.length) {                              // If that was the last course...
        recordChoices();                                               // ...add to today's counts
        const names = COURSES.map(c => dishById(child.picks[c.key])).filter(Boolean).map(x => x.name);  // Names of all picks
        say('All done. You chose ' + names.join(' and ') + '.');       // Read the summary aloud
      } else {
        say('You chose ' + d.name + '. ' + COURSES[child.step].prompt);   // Confirm, then ask the next question
      }
      break;
    }
    case 'skip':                                                       // No safe dishes: skip this course
      child.picks[COURSES[child.step].key] = null;                     // Record "nothing" for this course
      child.selected = null;                                           // Clear the highlight
      child.step++;                                                    // Next course
      if (child.step >= COURSES.length) recordChoices();               // If finished, record the choices
      break;
    case 'back':                                                       // Go back one course
      child.step = Math.max(0, child.step - 1);                        // Previous step (never below 0)
      child.selected = child.picks[COURSES[child.step].key] || null;   // Re-highlight what they picked before
      break;
    case 'nextchild':                                                  // Start again for the next child
      child = newChild();                                              // Reset everything (including the diet card, for safety)
      break;

    // ----- Kitchen: dishes -----
    case 'newdish':                                                    // "Add a dish"
      dishDraft = { id: uid(), name: '', emoji: '🍽️', photo: null, course: 'main', allergens: [], tags: [] };   // Blank dish
      cardDraft = null;                                                // Close the card form
      break;
    case 'editdish':                                                   // "Edit" on a dish
      dishDraft = JSON.parse(JSON.stringify(dishById(id)));            // Copy the dish (so Cancel doesn't change it)
      cardDraft = null;                                                // Close the card form
      break;
    case 'canceldish':                                                 // "Cancel" in the dish form
      dishDraft = null;                                                // Close the form
      break;
    case 'deldish':                                                    // "Remove" on a dish
      if (pendingDelete === id) {                                      // Second tap: really remove it
        S.dishes = S.dishes.filter(d => d.id !== id);                  // Remove from the menu
        delete S.tally[id];                                            // Remove its count
        pendingDelete = null;                                          // Reset
        save();                                                        // Save
        toast('Dish removed');                                         // Confirm
      } else {
        pendingDelete = id;                                            // First tap: ask to tap again
      }
      break;
    case 'emoji':                                                      // An emoji in the picker
      dishDraft.emoji = btn.dataset.e;                                 // Use that emoji
      dishDraft.photo = null;                                          // Remove any photo
      document.getElementById('f-preview').innerHTML = dishMedia(dishDraft);   // Update just the preview (keeps typed text)
      document.getElementById('f-clearphoto').hidden = true;           // Hide "Remove photo"
      return;                                                          // Don't redraw (it would clear the form)
    case 'clearphoto':                                                 // "Remove photo"
      dishDraft.photo = null;                                          // Remove the photo
      document.getElementById('f-preview').innerHTML = dishMedia(dishDraft);   // Show the emoji again
      btn.hidden = true;                                               // Hide the button
      return;                                                          // Don't redraw

    // ----- Kitchen: diet cards -----
    case 'newcard':                                                    // "Add card"
      cardDraft = { id: uid(), name: '', color: CARD_COLOURS[3][0], avoid: [], vegOnly: false };   // Blank card (purple)
      dishDraft = null;                                                // Close the dish form
      break;
    case 'editcard':                                                   // "Edit" on a card
      cardDraft = JSON.parse(JSON.stringify(cardById(id)));            // Copy the card
      dishDraft = null;                                                // Close the dish form
      break;
    case 'cancelcard':                                                 // "Cancel" in the card form
      cardDraft = null;                                                // Close the form
      break;
    case 'delcard':                                                    // "Remove" on a card
      if (pendingDelete === id) {                                      // Second tap: really remove
        S.cards = S.cards.filter(c => c.id !== id);                    // Remove the card
        if (child.cardId === id) child.cardId = null;                  // If it was selected, unselect it
        pendingDelete = null;                                          // Reset
        save();                                                        // Save
        toast('Diet card removed');                                    // Confirm
      } else {
        pendingDelete = id;                                            // First tap: ask to tap again
      }
      break;

    // ----- Settings and counts -----
    case 'reset':       confirmReset = true;  break;                   // Show "Yes, replace everything?"
    case 'cancelreset': confirmReset = false; break;                   // Hide it again
    case 'doreset':                                                    // Confirmed: restore the sample menu
      S = sampleData();                                                // Replace all data
      save();                                                          // Save
      confirmReset = false;                                            // Hide the confirmation
      child = newChild();                                              // Reset the child screen
      toast('Sample menu restored');                                   // Confirm
      break;
    case 'clear':       confirmClear = true;  break;                   // Show "Yes, clear today?"
    case 'cancelclear': confirmClear = false; break;                   // Hide it again
    case 'doclear':                                                    // Confirmed: clear the counts
      S.tally = {};                                                    // Empty the counts
      S.tallySample = false;                                           // They're no longer examples
      save();                                                          // Save
      confirmClear = false;                                            // Hide the confirmation
      toast('Ready for a new day');                                    // Confirm
      break;

    default: return;                                                   // Unknown action: do nothing
  }
  render();                                                            // Redraw the screen with the changes
});

// Checkbox switches and file uploads
document.addEventListener('change', async e => {
  if (e.target.id === 's-speech') {                                    // The "Read choices aloud" switch
    S.speech = e.target.checked;                                       // Save the new setting
    save();
    toast(S.speech ? 'Reading aloud is on' : 'Reading aloud is off');  // Confirm
  }
  if (e.target.id === 'f-photo' && e.target.files[0]) {                // A photo was chosen in the dish form
    try {
      dishDraft.photo = await readPhoto(e.target.files[0]);            // Shrink it and store it on the draft
      document.getElementById('f-preview').innerHTML = dishMedia(dishDraft);   // Show it in the preview
      document.getElementById('f-clearphoto').hidden = false;          // Show "Remove photo"
    } catch (err) {
      toast('That file could not be read as a picture. Try a JPG or PNG.');   // Not an image
    }
  }
});

// Saving the dish and diet card forms
document.addEventListener('submit', e => {
  e.preventDefault();                                                  // Stop the browser reloading the page
  const f = new FormData(e.target);                                    // Read all the form's fields

  if (e.target.id === 'dishForm') {                                    // The dish form was saved
    const d = Object.assign(dishDraft, {                               // Copy the form values onto the draft
      name: String(f.get('name')).trim(),                              // Dish name (spaces trimmed)
      course: f.get('course'),                                         // Main or pudding
      allergens: f.getAll('alg'),                                      // All ticked allergens
      tags: f.getAll('tag')                                            // All ticked tags
    });
    const i = S.dishes.findIndex(x => x.id === d.id);                  // Is it already in the menu?
    if (i >= 0) S.dishes[i] = d;                                       // Yes: replace it
    else S.dishes.push(d);                                             // No: add it
    dishDraft = null;                                                  // Close the form
    save();                                                            // Save
    toast('Saved ' + d.name);                                          // Confirm
  }

  if (e.target.id === 'cardForm') {                                    // The diet card form was saved
    const c = Object.assign(cardDraft, {                               // Copy the form values onto the draft
      name: String(f.get('name')).trim(),                              // Card name
      color: f.get('color') || CARD_COLOURS[0][0],                     // Chosen colour (blue if none)
      avoid: f.getAll('avoid'),                                        // All ticked allergens
      vegOnly: f.get('vegOnly') === 'on'                               // true if the switch is on
    });
    const i = S.cards.findIndex(x => x.id === c.id);                   // Is it already in the list?
    if (i >= 0) S.cards[i] = c;                                        // Yes: replace it
    else S.cards.push(c);                                              // No: add it
    cardDraft = null;                                                  // Close the form
    save();                                                            // Save
    toast('Saved ' + c.name);                                          // Confirm
  }

  render();                                                            // Redraw the screen
});

/* ---------------------------------------------------------------------
   START - draw the first screen when the page loads
   --------------------------------------------------------------------- */
render();
