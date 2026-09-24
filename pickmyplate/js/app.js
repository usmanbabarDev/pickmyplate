/* =====================================================================
   PickMyPlate - app.js
   All the behaviour of the app. It works like this:
     1. FIREBASE  - connect to the online database and login service
     2. STATE     - what's loaded and what's on screen
     3. LOGIN     - who is signed in: kitchen manager or a class
     4. DATA      - load (live) and save the menu, cards, schools, classes, orders
     5. HELPERS   - safety rules, dates, speech, small bits of HTML
     6. SCREENS   - Sign in, Choose lunch, Kitchen menu, Orders, Schools & classes
     7. EVENTS    - what happens when someone clicks, changes or saves
   The fixed lists and the school menu live in menu-data.js.
   Every screen is rebuilt by render() whenever something changes.
   ===================================================================== */

/* ---------------------------------------------------------------------
   0. DARK MODE - follow the device's light/dark setting
   --------------------------------------------------------------------- */
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  document.documentElement.setAttribute('data-bs-theme', darkQuery.matches ? 'dark' : 'light');
}
applyTheme();
darkQuery.addEventListener('change', applyTheme);

/* ---------------------------------------------------------------------
   1. FIREBASE
   --------------------------------------------------------------------- */
const CONFIGURED = !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey);   // Has firebase-config.js been filled in?
let auth = null, db = null;                                   // Login service and database (null until configured)
if (CONFIGURED) {
  firebase.initializeApp(window.FIREBASE_CONFIG);             // Connect to your Firebase project
  auth = firebase.auth();                                     // Login service
  db = firebase.firestore();                                  // Database
}

// Class logins are usernames like "a-aa". Firebase needs an email, so we add a fake,
// never-used domain behind the scenes. (".invalid" is reserved and can never be a real address.)
const CLASS_DOMAIN = 'pickmyplate.invalid';
const loginEmail = name => name.includes('@') ? name.trim() : name.trim().toLowerCase() + '@' + CLASS_DOMAIN;
const USERNAME_RULE = /^[a-z0-9][a-z0-9-]{2,29}$/;            // 3-30 characters: lowercase letters, numbers, dashes

/* ---------------------------------------------------------------------
   2. STATE
   --------------------------------------------------------------------- */

// Everything loaded from the database (kept up to date live)
const S = {
  dishes: [],                                                 // The menu
  cards: [],                                                  // Diet cards
  settings: { rotation: null, speech: true },                 // Menu rotation and read-aloud
  schools: [],                                                // { id, name }
  classes: [],                                                // { id, schoolId, name, username, uid }
  orders: []                                                  // Orders for the date shown on the Orders screen
};

let user = null;                    // The signed-in Firebase user (null = nobody)
let role = null;                    // 'manager' or 'class'
let account = null;                 // For a class login: { schoolId, classId }
let loading = CONFIGURED;           // true while checking the login / loading data
let loaded = new Set();             // Which collections have arrived at least once
let unsubs = [];                    // Functions that stop the live listeners
let unsubOrders = null;             // Stops the orders listener
let loginError = '';                // Message shown on the sign-in screen
let busy = false;                   // true while signing in or saving something slow

let view = 'choose';                // Current screen: 'choose', 'kitchen', 'orders', 'setup'
let slot = null;                    // Which menu day is showing: { week, day } (set once settings load)
let child = newChild();             // The current child's progress
let dishDraft = null;               // Dish being added/edited (null = form closed)
let cardDraft = null;               // Diet card being added/edited
let schoolDraft = null;             // School being added/renamed
let classDraft = null;              // Class being added/edited
let pendingDelete = null;           // id waiting for "tap again to remove"
let confirmReset = false;           // true = showing "Yes, replace the menu?"
let kitchenFilter = null;           // Kitchen filter: null, 'card:<id>' or 'tag:<code>'
let ordersDate = null;              // Date shown on the Orders screen ("YYYY-MM-DD")
let ordersScope = 'all';            // 'all' or a school id

function newChild() {               // A blank "child choosing" state
  return { cardId: null, step: 0, picks: {}, selected: null, optFor: null };
}

/* ---------------------------------------------------------------------
   DATES - which week of the 3-week menu it is
   --------------------------------------------------------------------- */
function mondayOf(date) {                                     // Monday of the week containing "date"
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function isoDate(d) {                                         // "2026-09-24"
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const rotation = () => S.settings.rotation || { anchor: isoDate(mondayOf(new Date())), anchorWeek: 1 };
function weekFor(date) {                                      // Which menu week (1-3) a date falls in
  const r = rotation();
  const weeksApart = Math.round((mondayOf(date) - mondayOf(new Date(r.anchor + 'T00:00:00'))) / (7 * 864e5));
  return (((r.anchorWeek - 1 + weeksApart) % WEEKS) + WEEKS) % WEEKS + 1;
}
function servingDay() {                                       // Next school day (weekends move to Monday)
  const d = new Date();
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);           // Saturday -> Monday
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);           // Sunday -> Monday
  return d;
}
function todaySlot() {                                        // Menu week/day for the next school day
  const d = servingDay();
  return { week: weekFor(d), day: DAYS[(d.getDay() + 6) % 7][0], weekend: d.toDateString() !== new Date().toDateString() };
}

/* ---------------------------------------------------------------------
   3. LOGIN - work out who is signed in
   --------------------------------------------------------------------- */
if (CONFIGURED) {
  auth.onAuthStateChanged(async u => {
    stopListeners();                                          // Forget the previous user's data
    user = u; role = null; account = null;
    if (!u) { loading = false; render(); return; }            // Nobody signed in: show the sign-in screen
    loading = true; render();
    try {
      const m = await db.collection('managers').doc(u.uid).get();          // Is this the kitchen manager?
      if (m.exists) role = 'manager';
      else {
        const a = await db.collection('accounts').doc(u.uid).get();        // Is this a class login?
        if (a.exists) { role = 'class'; account = a.data(); }
      }
    } catch (err) {
      console.error(err);
    }
    if (!role) {                                              // Signed in, but not allowed in
      loginError = 'This login has no access. Ask the kitchen manager.';
      await auth.signOut();
      return;
    }
    loginError = '';
    view = role === 'manager' ? 'orders' : 'choose';          // Manager starts on Orders; classes on Choose lunch
    child = newChild();
    startListeners();
  });
}

/* ---------------------------------------------------------------------
   4. DATA - live loading and saving
   --------------------------------------------------------------------- */
const withId = doc => ({ id: doc.id, ...doc.data() });        // Database document -> plain object with its id

// Redraw after background changes, but never while a form is open (it would wipe what's being typed)
function softRender() {
  if (dishDraft || cardDraft || schoolDraft || classDraft) return;
  render();
}

function listen(name, query, apply) {                         // Start one live listener
  unsubs.push(query.onSnapshot(snap => {
    apply(snap);
    loaded.add(name);
    if (loading && ['dishes', 'cards', 'settings', 'schools', 'classes'].every(n => loaded.has(n))) {
      loading = false;                                        // Everything needed has arrived
      slot = todaySlot();
      render();
    } else if (!loading) softRender();
  }, err => {
    console.error(name, err);
    toast('Could not load ' + name + ' (' + err.code + ').');
  }));
}

function startListeners() {
  loaded = new Set();
  listen('dishes', db.collection('dishes'), snap => { S.dishes = snap.docs.map(withId); });
  listen('cards', db.collection('cards'), snap => { S.cards = snap.docs.map(withId).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)); });
  listen('settings', db.collection('settings').doc('app'), doc => { S.settings = Object.assign({ rotation: null, speech: true }, doc.exists ? doc.data() : {}); });
  listen('schools', db.collection('schools'), snap => { S.schools = snap.docs.map(withId).sort((a, b) => a.name.localeCompare(b.name)); });
  listen('classes', db.collection('classes'), snap => { S.classes = snap.docs.map(withId).sort((a, b) => a.name.localeCompare(b.name)); });
  if (role === 'manager') { ordersDate = isoDate(servingDay()); listenOrders(); }
}

function listenOrders() {                                     // Live orders for the chosen date (manager only)
  if (unsubOrders) unsubOrders();
  S.orders = [];
  unsubOrders = db.collection('orders').where('date', '==', ordersDate).onSnapshot(snap => {
    S.orders = snap.docs.map(withId).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    if (view === 'orders') softRender();
  }, err => { console.error(err); toast('Could not load orders (' + err.code + ').'); });
}

function stopListeners() {
  unsubs.forEach(f => f()); unsubs = [];
  if (unsubOrders) { unsubOrders(); unsubOrders = null; }
  Object.assign(S, { dishes: [], cards: [], schools: [], classes: [], orders: [], settings: { rotation: null, speech: true } });
}

const strip = obj => { const { id, ...rest } = obj; return rest; };   // Remove "id" before saving (it's the document name)

// Saving (the manager's changes). Each returns a promise; errors show a message.
async function run(promise, okMessage) {
  try { await promise; if (okMessage) toast(okMessage); return true; }
  catch (err) { console.error(err); toast('Could not save: ' + (err.message || err.code)); return false; }
}
const saveDish = d => run(db.collection('dishes').doc(d.id).set(strip(d)), 'Saved ' + d.name);
const saveCard = c => run(db.collection('cards').doc(c.id).set(strip(c)), 'Saved ' + c.name);
const saveSettings = patch => run(db.collection('settings').doc('app').set(patch, { merge: true }));

// Load the school menu and diet cards into an empty database (or replace them)
async function loadSchoolMenu(replace) {
  const batch = db.batch();
  if (replace) {
    S.dishes.forEach(d => batch.delete(db.collection('dishes').doc(d.id)));
    S.cards.forEach(c => batch.delete(db.collection('cards').doc(c.id)));
  }
  schoolMenu().forEach(d => batch.set(db.collection('dishes').doc(d.id), strip(d)));
  defaultCards().forEach((c, i) => batch.set(db.collection('cards').doc(c.id), { ...strip(c), order: i }));
  if (!S.settings.rotation) batch.set(db.collection('settings').doc('app'), { rotation: rotation(), speech: true }, { merge: true });
  return run(batch.commit(), 'School menu loaded');
}

// Create a class login. Uses a second, separate Firebase connection so the manager stays signed in.
let creatorAuth = null;
async function createClassLogin(username, password) {
  if (!creatorAuth) {
    creatorAuth = firebase.initializeApp(window.FIREBASE_CONFIG, 'class-creator').auth();
    await creatorAuth.setPersistence(firebase.auth.Auth.Persistence.NONE);   // Don't remember this sign-in
  }
  const cred = await creatorAuth.createUserWithEmailAndPassword(loginEmail(username), password);
  await creatorAuth.signOut();
  return cred.user.uid;
}

// Save a child's finished choice as an order (class logins only)
function placeOrder() {
  const card = cardById(child.cardId);
  const items = COURSES.map(c => {
    const p = child.picks[c.key];
    if (!p) return { course: c.key, skipped: true };
    const d = dishById(p.d), o = optById(d, p.o);
    return { course: c.key, dishId: d.id, dish: d.name, optionId: o ? o.id : null, option: o ? o.name : null };
  });
  return db.collection('orders').add({
    date: isoDate(servingDay()),                              // The school day this lunch is for
    schoolId: account.schoolId,
    classId: account.classId,
    uid: user.uid,
    card: card ? card.name : null,                            // Diet card used (so the kitchen can take extra care)
    items,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

/* ---------------------------------------------------------------------
   5. HELPERS
   --------------------------------------------------------------------- */

// Makes text safe to put inside HTML (same job as PHP's htmlspecialchars)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const dishById = id => S.dishes.find(d => d.id === id);
const cardById = id => S.cards.find(c => c.id === id) || null;
const optById = (d, id) => d && (d.options || []).find(o => o.id === id);
const schoolById = id => S.schools.find(s => s.id === id);
const classById = id => S.classes.find(c => c.id === id);
const schoolName = id => (schoolById(id) || { name: 'Unknown school' }).name;
const className = id => (classById(id) || { name: 'Unknown class' }).name;

const inSlot = (d, week, day) => (d.week === 0 || d.week === week) && (d.day === 'all' || d.day === day);
const dishesFor = courseKey => S.dishes.filter(d => d.course === courseKey && inSlot(d, slot.week, slot.day));
const isVeg = tags => tags.includes('veg') || tags.includes('vegan');

// THE SAFETY RULE for one dish + one option (option can be null).
// ignoreChecked = true is used ONLY by the kitchen filter; the child screen is always strict.
function optionSafe(d, o, card, ignoreChecked = false) {
  if (!card) return true;                                                    // No diet card = everything is shown
  if (!d.checked && !ignoreChecked) return false;                            // Allergens not confirmed = hidden from diet cards
  const all = o ? d.allergens.concat(o.allergens) : d.allergens;             // Dish + option allergens together
  if (all.some(a => card.avoid.includes(a))) return false;                   // Contains something the card avoids
  if (card.vegOnly && !(isVeg(d.tags) && (!o || isVeg(o.tags)))) return false;   // Vegetarian card and this isn't
  return true;
}
function safeFor(d, card, ignoreChecked = false) {                          // Safe if the dish (or any of its choices) is safe
  if ((d.options || []).length) return d.options.some(o => optionSafe(d, o, card, ignoreChecked));
  return optionSafe(d, null, card, ignoreChecked);
}

function pickName(p) {                                        // "Jacket potato – Tuna"
  const d = dishById(p.d), o = optById(d, p.o);
  return d ? d.name + (o ? ' – ' + o.name : '') : '';
}
const itemName = it => it.dish + (it.option ? ' – ' + it.option : '');   // Same, for a saved order item

function say(text) {                                          // Read text aloud
  if (!S.settings.speech || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB'; u.rate = 0.9;
    speechSynthesis.speak(u);
  } catch (e) { /* ignore */ }
}

function toast(message) {                                     // Short pop-up message
  document.getElementById('toast-text').textContent = message;
  bootstrap.Toast.getOrCreateInstance(document.getElementById('toast'), { delay: 3200 }).show();
}

function dishMedia(d) {                                       // Photo, or the emoji
  const inner = d.photo ? `<img src="${d.photo}" alt="">` : `<span class="dish-emoji" aria-hidden="true">${esc(d.emoji || '🍽️')}</span>`;
  return `<span class="dish-media">${inner}</span>`;
}
function dishThumb(d) {
  return `<span class="thumb" aria-hidden="true">${d.photo ? `<img src="${d.photo}" alt="">` : esc(d.emoji || '🍽️')}</span>`;
}
function tile(item, act, selected) {                          // Big picture button on the child screen
  return `<div class="col">
    <button class="dish-tile ${selected ? 'selected' : ''}" data-act="${act}" data-id="${item.id}" aria-pressed="${selected}">
      ${dishMedia(item)}<span class="dish-name">${esc(item.name)}</span>
    </button></div>`;
}
function whenLabel(d) {                                       // "Every day" or "Week 2 · Tuesday"
  if (d.week === 0 && d.day === 'all') return 'Every day';
  return (d.week === 0 ? 'Every week' : 'Week ' + d.week) + ' · ' + (d.day === 'all' ? 'every day' : DAY_LABEL[d.day]);
}
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

const SPEAKER_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

/* ---------------------------------------------------------------------
   6a. SCREEN: Setup needed / Sign in / Loading
   --------------------------------------------------------------------- */
function viewNotConfigured() {
  return `<div class="card mx-auto" style="max-width:560px"><div class="card-body p-4">
    <h1 class="h4">Setup needed</h1>
    <p>PickMyPlate isn't connected to its online database yet.</p>
    <p class="mb-0">Kitchen manager: follow <b>SETUP.md</b> in the project to create the Firebase project and paste its settings into <code>js/firebase-config.js</code>.</p>
  </div></div>`;
}

function viewLogin() {
  return `<form class="card mx-auto" style="max-width:420px" id="loginForm"><div class="card-body p-4">
    <h1 class="h4 mb-1">Sign in</h1>
    <p class="text-body-secondary small">Classes: use the username and password from the kitchen manager.</p>
    ${loginError ? `<div class="alert alert-danger py-2 small">${esc(loginError)}</div>` : ''}
    <label class="form-label fw-bold" for="l-user">Username</label>
    <input class="form-control mb-3" id="l-user" name="user" autocomplete="username" required autocapitalize="none" placeholder="e.g. a-aa">
    <label class="form-label fw-bold" for="l-pass">Password</label>
    <input class="form-control mb-4" id="l-pass" name="pass" type="password" autocomplete="current-password" required>
    <button class="btn btn-primary w-100" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'Signing in…' : 'Sign in'}</button>
  </div></form>`;
}

const viewLoading = () => `<div class="text-center text-body-secondary py-5"><div class="spinner-border mb-3" role="status"></div><p>Loading…</p></div>`;

/* ---------------------------------------------------------------------
   6b. SCREEN: Choose lunch (classes; the manager sees a preview)
   --------------------------------------------------------------------- */
function viewChoose() {
  if (!S.dishes.length) {
    return `<div class="card p-4 text-center"><h2 class="h5">Today's menu isn't ready yet</h2><p class="text-body-secondary mb-0">Please ask the kitchen manager.</p></div>`;
  }
  const card = cardById(child.cardId);
  const today = todaySlot();
  const isToday = slot.week === today.week && slot.day === today.day;

  const who = role === 'class'
    ? `<p class="label-caps mb-2">${esc(schoolName(account.schoolId))} · ${esc(className(account.classId))} · ${DAY_LABEL[slot.day]}${today.weekend ? ' (next school day)' : ''}</p>`
    : `<div class="alert alert-info py-2 small">Preview: this is what classes see. Orders are <b>not</b> saved from the manager account. Showing ${DAY_LABEL[slot.day]}, Week ${slot.week}${isToday ? '' : ' (not today)'}.</div>`;

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

  const steps = `
    <div class="d-flex flex-wrap gap-2 mb-3" aria-label="Steps">
      ${COURSES.map((c, i) => `<span class="badge rounded-pill step ${i < child.step ? 'text-bg-success' : i === child.step ? 'step-now' : 'text-bg-secondary'}">${i === child.step ? 'Now: ' : ''}${c.label}</span>`).join('')}
      <span class="badge rounded-pill step ${child.step >= COURSES.length ? 'step-now' : 'text-bg-secondary'}">All done</span>
    </div>`;

  if (child.step >= COURSES.length) {                                         // Finished
    const picked = COURSES.map(c => child.picks[c.key]).filter(Boolean);
    return who + cardBar + steps + `
      <section class="text-center py-3">
        <h1 class="display-5 fw-bold">All done!</h1>
        <p class="text-body-secondary">${picked.length ? 'You chose:' : 'No choices made.'}</p>
        <div class="row row-cols-2 row-cols-md-3 g-3 justify-content-center mb-3">
          ${picked.map(p => { const d = dishById(p.d), o = optById(d, p.o);
            return `<div class="col"><div class="dish-tile">${dishMedia(o || d)}<span class="dish-name">${esc(pickName(p))}</span></div></div>`; }).join('')}
        </div>
        <p class="small ${child.saved === 'error' ? 'text-danger fw-bold' : 'text-body-secondary'}">${
          role !== 'class' ? 'Preview only: not saved.'
          : child.saved === 'saving' ? 'Sending order…'
          : child.saved === 'error' ? 'The order was NOT sent. Check the internet connection and tap Try again.'
          : 'Order sent to the kitchen ✓'}</p>
        ${child.saved === 'error' ? `<button class="btn btn-danger btn-lg px-4 me-2" data-act="retry">Try again</button>` : ''}
        <button class="btn btn-primary btn-lg px-5" data-act="nextchild" ${child.saved === 'saving' ? 'disabled' : ''}>Next child</button>
      </section>`;
  }

  const course = COURSES[child.step];
  let prompt, items, act;
  if (child.optFor) {                                                        // Choosing inside a dish
    const d = dishById(child.optFor);
    prompt = d.optionPrompt || `What would you like with your ${d.name.toLowerCase()}?`;
    items = d.options.filter(o => optionSafe(d, o, card));
    act = 'pickopt';
  } else {
    prompt = course.prompt;
    items = dishesFor(course.key).filter(d => safeFor(d, card));
    act = 'pick';
  }
  const selected = child.optFor ? optById(dishById(child.optFor), child.selected) : dishById(child.selected);

  const grid = items.length
    ? `<div class="row row-cols-2 row-cols-md-3 row-cols-lg-4 g-3">${items.map(it => tile(it, act, child.selected === it.id)).join('')}</div>`
    : `<div class="card text-center p-4">
        <h3 class="h5">No ${course.label.toLowerCase()} choices for this diet card today</h3>
        <p class="text-body-secondary">Please ask a member of the kitchen team.</p>
        <div><button class="btn btn-outline-secondary" data-act="skip">Skip ${course.label.toLowerCase()}</button></div>
      </div>`;

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

  return who + cardBar + steps + `<h1 class="prompt fw-bold mb-4">${esc(prompt)}</h1>` + grid + (items.length || canGoBack ? confirmBar : '');
}

/* ---------------------------------------------------------------------
   6c. SCREEN: Kitchen menu (manager)
   --------------------------------------------------------------------- */
function allergenChecks(prefix, name, selected, cols = 'row-cols-2 row-cols-sm-3') {
  return `<div class="row ${cols}">${ALLERGENS.map(([k, l]) => `
    <div class="col"><div class="form-check">
      <input class="form-check-input" type="checkbox" id="${prefix}-${k}" name="${name}" value="${k}" ${selected.includes(k) ? 'checked' : ''}>
      <label class="form-check-label" for="${prefix}-${k}">${l}</label>
    </div></div>`).join('')}</div>`;
}
function tagChecks(prefix, name, selected) {
  return TAGS.map(([k, l]) => `
    <div class="form-check form-check-inline">
      <input class="form-check-input" type="checkbox" id="${prefix}-${k}" name="${name}" value="${k}" ${selected.includes(k) ? 'checked' : ''}>
      <label class="form-check-label" for="${prefix}-${k}">${l}</label>
    </div>`).join('');
}

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
            <input class="form-control" id="f-name" name="name" required maxlength="80" value="${esc(d.name)}" placeholder="e.g. Shepherd's pie">
          </div>
          <div class="col-sm-4">
            <label class="form-label fw-bold" for="f-course">Step</label>
            <select class="form-select" id="f-course" name="course">${COURSES.map(c => `<option value="${c.key}" ${d.course === c.key ? 'selected' : ''}>${c.label}</option>`).join('')}</select>
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
            <input class="form-control mb-2" id="f-oprompt" name="optionPrompt" maxlength="80" value="${esc(d.optionPrompt)}">` : ''}
          ${d.options.map((o, i) => `
            <div class="border rounded p-2 mb-2">
              <div class="d-flex gap-2 mb-2 align-items-center">
                <span id="o-${i}-preview">${dishThumb(o)}</span>                            <!-- Photo, or the emoji if there's no photo -->
                <input class="form-control form-control-sm" style="max-width:4.5rem" id="o-${i}-emoji" name="o-${i}-emoji" value="${esc(o.emoji)}" aria-label="Choice ${i + 1} emoji (used when there's no photo)">
                <input class="form-control form-control-sm" id="o-${i}-name" name="o-${i}-name" value="${esc(o.name)}" placeholder="Choice name" aria-label="Choice ${i + 1} name">
                <button type="button" class="btn btn-sm btn-outline-danger" data-act="delopt" data-i="${i}">Remove</button>
              </div>
              <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
                <label class="small fw-bold" for="o-${i}-photo">Photo</label>
                <input class="form-control form-control-sm opt-photo" style="max-width:16rem" type="file" accept="image/*" id="o-${i}-photo" data-i="${i}">
                <button type="button" class="btn btn-sm btn-outline-danger" id="o-${i}-clearphoto" data-act="clearoptphoto" data-i="${i}" ${o.photo ? '' : 'hidden'}>Remove photo</button>
              </div>
              <details><summary class="small">Allergens and tags for this choice (${o.allergens.map(a => ALLERGEN_LABEL[a]).join(', ') || 'none'})</summary>
                <div class="small mt-2">${allergenChecks(`o-${i}-alg`, `o-${i}-alg`, o.allergens, 'row-cols-2 row-cols-sm-4')}</div>
                <div class="small mt-1">${tagChecks(`o-${i}-tag`, `o-${i}-tag`, o.tags)}</div>
              </details>
            </div>`).join('')}
          <button type="button" class="btn btn-sm btn-outline-primary" data-act="addopt">Add a choice</button>
        </fieldset>

        <div class="mt-3">
          <label class="form-label fw-bold" for="f-note">Allergen notes for staff</label>
          <textarea class="form-control" id="f-note" name="note" rows="2" maxlength="400">${esc(d.note || '')}</textarea>
        </div>

        <div class="form-check mt-4 p-3 rounded border border-success-subtle bg-success-subtle">
          <input class="form-check-input ms-0 me-2" type="checkbox" id="f-checked" name="checked" ${d.checked ? 'checked' : ''}>
          <label class="form-check-label fw-bold" for="f-checked">Allergens confirmed by the kitchen manager</label>
          <div class="form-text">Untick to hide this dish from every diet card until it's checked again.</div>
        </div>

        <div class="d-flex gap-2 mt-4">
          <button type="submit" class="btn btn-primary">Save dish</button>
          <button type="button" class="btn btn-outline-secondary" data-act="canceldish">Cancel</button>
        </div>
      </div>
    </form>`;
}

function syncDishDraft() {                                    // Copy typed values into dishDraft
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
    note: String(f.get('note') || '').trim(),
    options: dishDraft.options.map((o, i) => ({
      id: o.id,
      name: String(f.get(`o-${i}-name`) || '').trim(),
      emoji: String(f.get(`o-${i}-emoji`) || '').trim() || '🍽️',
      photo: o.photo || null,                                  // Keep the choice's photo (set by the photo upload)
      allergens: f.getAll(`o-${i}-alg`),
      tags: f.getAll(`o-${i}-tag`)
    }))
  });
}

function cardForm() {
  const c = cardDraft;
  const isNew = !S.cards.some(x => x.id === c.id);
  return `
    <form class="card editor mb-3" id="cardForm">
      <div class="card-body">
        <h3 class="h5 mb-3">${isNew ? 'Add a diet card' : 'Edit ' + esc(c.name)}</h3>
        <label class="form-label fw-bold" for="c-name">Card name</label>
        <input class="form-control" id="c-name" name="name" required maxlength="32" value="${esc(c.name)}" placeholder="e.g. Red · No milk or eggs">
        <div class="form-text">Use a colour and the restriction, never a child's name.</div>
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

function viewKitchen() {
  if (!S.dishes.length) {                                     // First run: empty database
    return `<div class="card mx-auto" style="max-width:560px"><div class="card-body p-4">
      <h2 class="h4">Your menu is empty</h2>
      <p>Load the school's 3-week menu and the 7 diet cards into the online database. You can edit everything afterwards.</p>
      <button class="btn btn-primary" data-act="seed" ${busy ? 'disabled' : ''}>${busy ? 'Loading…' : 'Load the school menu'}</button>
    </div></div>`;
  }
  const today = todaySlot();
  const shown = S.dishes.filter(d => inSlot(d, slot.week, slot.day));
  const unchecked = shown.filter(d => !d.checked).length;

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

  // Filter buttons
  const fCard = kitchenFilter && kitchenFilter.startsWith('card:') ? cardById(kitchenFilter.slice(5)) : null;
  const fTag = kitchenFilter && kitchenFilter.startsWith('tag:') ? kitchenFilter.slice(4) : null;
  const filterOn = !!(fCard || fTag);
  const optFits = (d, o) => fCard ? optionSafe(d, o, fCard, true) : fTag ? d.tags.includes(fTag) && (!o || o.tags.includes(fTag)) : true;
  const fits = d => (d.options || []).length ? d.options.some(o => optFits(d, o)) : optFits(d, null);
  const matching = shown.filter(fits).length;
  const filterBar = `
    <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
      <span class="label-caps me-1">Show</span>
      <button class="btn btn-sm rounded-pill fw-bold ${!filterOn ? 'btn-primary' : 'btn-outline-secondary'}" data-act="kfilter" data-f="">All dishes</button>
      ${S.cards.map(c => `<button class="btn btn-sm rounded-pill fw-bold d-inline-flex align-items-center gap-1 ${fCard && fCard.id === c.id ? 'btn-primary' : 'btn-outline-secondary'}" data-act="kfilter" data-f="card:${c.id}"><i class="swatch" style="background:${esc(c.color)}"></i>${esc(c.name)}</button>`).join('')}
      ${['vegan', 'halal'].map(t => `<button class="btn btn-sm rounded-pill fw-bold ${fTag === t ? 'btn-primary' : 'btn-outline-secondary'}" data-act="kfilter" data-f="tag:${t}">${TAG_LABEL[t]}</button>`).join('')}
    </div>
    ${filterOn ? `<p class="small text-body-secondary mb-3">Showing <b>${matching} of ${shown.length}</b> dishes that suit <b>${esc(fCard ? fCard.name : TAG_LABEL[fTag])}</b>. Choices that don't suit it are <s>crossed out</s>.${fTag === 'halal' && !matching ? ' No dishes are tagged Halal yet: add the tag with Edit.' : ''}</p>` : ''}`;

  const menu = COURSES.map(c => {
    const list = shown.filter(d => d.course === c.key && (!filterOn || fits(d)));
    return `
      <h3 class="label-caps mt-4 mb-2">${c.label} · ${plural(list.length, 'dish', 'dishes')}</h3>
      <ul class="list-group">
        ${list.map(d => `
          <li class="list-group-item d-flex gap-3 align-items-center">
            ${dishThumb(d)}
            <div class="flex-grow-1" style="min-width:0">
              <div class="fw-bold">${esc(d.name)} <span class="badge text-bg-light border fw-normal">${whenLabel(d)}</span></div>
              ${(d.options || []).length ? `<div class="small text-body-secondary">Choices: ${d.options.map(o => filterOn && !optFits(d, o) ? `<s>${esc(o.name)}</s>` : esc(o.name)).join(', ')}</div>` : ''}
              ${d.note ? `<div class="small text-body-secondary fst-italic mt-1">Allergen notes: ${esc(d.note)}</div>` : ''}
              <div class="d-flex flex-wrap gap-1 mt-1">
                ${d.checked ? '' : '<span class="badge text-bg-warning">Allergens not confirmed</span>'}
                ${d.allergens.map(a => `<span class="badge text-bg-danger">${ALLERGEN_LABEL[a]}</span>`).join('')}
                ${d.tags.map(t => `<span class="badge text-bg-success">${TAG_LABEL[t]}</span>`).join('')}
              </div>
            </div>
            <div class="d-flex flex-wrap gap-1 justify-content-end">
              <button class="btn btn-sm btn-outline-secondary" data-act="editdish" data-id="${d.id}">Edit</button>
              <button class="btn btn-sm ${pendingDelete === d.id ? 'btn-danger' : 'btn-outline-danger'}" data-act="deldish" data-id="${d.id}">${pendingDelete === d.id ? 'Tap again to remove' : 'Remove'}</button>
            </div>
          </li>`).join('') || '<li class="list-group-item text-body-secondary">No dishes.</li>'}
      </ul>`;
  }).join('');

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
          ${filterBar}
          ${unchecked ? `<div class="alert alert-warning small py-2">${plural(unchecked, 'dish is', 'dishes are')} not confirmed and hidden from diet cards.</div>` : ''}
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
          <p class="small text-body-secondary mt-2 mb-0">Moves on automatically every Monday, for every school.</p>
        </div></section>
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
            <input class="form-check-input" type="checkbox" role="switch" id="s-speech" ${S.settings.speech ? 'checked' : ''}>
            <label class="form-check-label fw-bold" for="s-speech">Read choices aloud</label>
          </div>
          <p class="small text-body-secondary">Applies to every class device.</p>
          ${confirmReset
            ? `<div class="alert alert-danger small">This replaces every dish and diet card with the original school menu. Your edits will be lost.</div>
               <button class="btn btn-danger" data-act="doreset">Yes, replace the menu</button>
               <button class="btn btn-outline-secondary" data-act="cancelreset">Keep my menu</button>`
            : `<button class="btn btn-outline-secondary" data-act="reset">Restore the original school menu</button>`}
        </div></section>
      </div>
    </div>`;
}

/* ---------------------------------------------------------------------
   6d. SCREEN: Orders (manager) - per school, per class, and total
   --------------------------------------------------------------------- */
function countItems(orders) {                                 // { "main|Jacket potato – Tuna": n, ... }
  const counts = {};
  orders.forEach(o => o.items.forEach(it => {
    const key = it.course + '|' + (it.skipped ? (COURSES.find(c => c.key === it.course)?.optional ? 'No thank you' : 'Skipped') : itemName(it));
    counts[key] = (counts[key] || 0) + 1;
  }));
  return counts;
}

function viewOrders() {
  const schools = S.schools;
  const inScope = ordersScope === 'all' ? S.orders : S.orders.filter(o => o.schoolId === ordersScope);
  const dateLabel = new Date(ordersDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  // Header: date, scope buttons, totals
  const header = `
    <div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
      <div>
        <label class="label-caps d-block mb-1" for="o-date">Orders for</label>
        <div class="d-flex gap-2 align-items-center">
          <input type="date" class="form-control" id="o-date" value="${ordersDate}" style="max-width:12rem">
          ${ordersDate !== isoDate(servingDay()) ? `<button class="btn btn-sm btn-link" data-act="otoday">Today</button>` : ''}
        </div>
        <div class="small text-body-secondary mt-1">${dateLabel} · updates live</div>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <div class="text-center px-3"><div class="big-number tabular">${S.orders.length}</div><div class="label-caps">Total</div></div>
        ${schools.map(s => `<div class="text-center px-3 border-start"><div class="big-number tabular">${S.orders.filter(o => o.schoolId === s.id).length}</div><div class="label-caps">${esc(s.name)}</div></div>`).join('')}
      </div>
    </div>
    <div class="btn-group flex-wrap mb-4" role="group" aria-label="Show orders for">
      <button class="btn ${ordersScope === 'all' ? 'btn-primary' : 'btn-outline-secondary'}" data-act="oscope" data-s="all">All schools</button>
      ${schools.map(s => `<button class="btn ${ordersScope === s.id ? 'btn-primary' : 'btn-outline-secondary'}" data-act="oscope" data-s="${s.id}">${esc(s.name)}</button>`).join('')}
    </div>`;

  if (!schools.length) return header + `<div class="alert alert-info">Add your schools and classes in <b>Schools &amp; classes</b> first.</div>`;
  if (!inScope.length) return header + `<div class="card p-4 text-center text-body-secondary">No orders yet for this day.</div>`;

  // 1) Meals to prepare: one row per meal, one column per school (+ total)
  const cols = ordersScope === 'all' ? schools : schools.filter(s => s.id === ordersScope);
  const perSchool = Object.fromEntries(cols.map(s => [s.id, countItems(inScope.filter(o => o.schoolId === s.id))]));
  const allCounts = countItems(inScope);
  const prepare = COURSES.map(c => {
    const rows = Object.entries(allCounts).filter(([k]) => k.startsWith(c.key + '|')).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return '';
    return `<tr class="table-light"><th colspan="${cols.length + 2}">${c.label}</th></tr>` + rows.map(([k, n]) => `
      <tr><td>${esc(k.split('|')[1])}</td>
        ${cols.map(s => `<td class="text-end tabular">${perSchool[s.id][k] || ''}</td>`).join('')}
        <td class="text-end tabular fw-bold">${n}</td></tr>`).join('');
  }).join('');

  // 2) Serving list: each class, what to take to it, and diet-card meals listed one by one
  const serving = cols.map(s => {
    const classes = S.classes.filter(c => c.schoolId === s.id);
    const orphans = inScope.filter(o => o.schoolId === s.id && !classes.some(c => c.id === o.classId));   // Orders from removed classes
    const groups = classes.map(c => ({ name: c.name, orders: inScope.filter(o => o.classId === c.id) }))
      .concat(orphans.length ? [{ name: 'Removed class', orders: orphans }] : []);
    return `
      <h3 class="h5 mt-4 mb-2">${esc(s.name)}</h3>
      <div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3">
        ${groups.map(g => {
          const counts = countItems(g.orders);
          const cardMeals = g.orders.filter(o => o.card);
          return `<div class="col"><div class="card h-100"><div class="card-body">
            <div class="d-flex justify-content-between align-items-baseline mb-2">
              <h4 class="h6 mb-0">${esc(g.name)}</h4>
              <span class="badge text-bg-secondary">${plural(g.orders.length, 'order', 'orders')}</span>
            </div>
            ${g.orders.length ? COURSES.map(c => {
              const rows = Object.entries(counts).filter(([k]) => k.startsWith(c.key + '|'));
              return rows.length ? `<div class="small"><span class="label-caps">${c.label}</span><ul class="list-unstyled mb-2">${rows.map(([k, n]) => `<li><b class="tabular">${n} ×</b> ${esc(k.split('|')[1])}</li>`).join('')}</ul></div>` : '';
            }).join('') : '<p class="small text-body-secondary mb-0">No orders.</p>'}
            ${cardMeals.length ? `<div class="alert alert-warning small py-2 mb-2"><b>Diet card meals: keep separate</b>
              <ul class="mb-0 ps-3">${cardMeals.map(o => `<li><b>${esc(o.card)}:</b> ${o.items.filter(i => !i.skipped).map(itemName).map(esc).join(', ')}</li>`).join('')}</ul></div>` : ''}
            ${g.orders.length ? `<details class="small"><summary>Individual orders</summary>
              <ul class="list-unstyled mt-2 mb-0">${g.orders.map(o => `
                <li class="d-flex gap-2 align-items-start border-top pt-1 mt-1">
                  <span class="text-body-secondary tabular">${o.createdAt ? o.createdAt.toDate().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '…'}</span>
                  <span class="flex-grow-1">${o.card ? `<b>${esc(o.card)}</b>: ` : ''}${o.items.filter(i => !i.skipped).map(itemName).map(esc).join(', ')}</span>
                  <button class="btn btn-sm py-0 ${pendingDelete === o.id ? 'btn-danger' : 'btn-outline-danger'}" data-act="delorder" data-id="${o.id}">${pendingDelete === o.id ? 'Tap again' : 'Remove'}</button>
                </li>`).join('')}</ul></details>` : ''}
          </div></div></div>`;
        }).join('') || '<p class="text-body-secondary">No classes yet.</p>'}
      </div>`;
  }).join('');

  return header + `
    <section class="card mb-4"><div class="card-body">
      <h2 class="h5">Meals to prepare</h2>
      <div class="table-responsive"><table class="table table-sm align-middle mb-0">
        <thead><tr><th>Meal</th>${cols.map(s => `<th class="text-end">${esc(s.name)}</th>`).join('')}<th class="text-end">Total</th></tr></thead>
        <tbody>${prepare}</tbody>
      </table></div>
    </div></section>
    <h2 class="h5">Serving list by class</h2>
    ${serving}`;
}

/* ---------------------------------------------------------------------
   6e. SCREEN: Schools & classes (manager)
   --------------------------------------------------------------------- */
function classForm() {
  const c = classDraft;
  const isNew = !c.id;
  return `<form class="card editor mb-3" id="classForm"><div class="card-body">
    <h3 class="h6 mb-3">${isNew ? 'Add a class to ' + esc(schoolName(c.schoolId)) : 'Edit ' + esc(c.name)}</h3>
    <label class="form-label fw-bold" for="k-name">Class name</label>
    <input class="form-control mb-3" id="k-name" name="name" required maxlength="30" value="${esc(c.name || '')}" placeholder="e.g. AA">
    ${isNew ? '' : `<div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="k-newlogin" name="newLogin" ${c.newLogin ? 'checked' : ''} data-act="togglenewlogin">
      <label class="form-check-label" for="k-newlogin">Give this class a new login (e.g. forgotten password)</label></div>`}
    ${isNew || c.newLogin ? `
      <div class="row g-2">
        <div class="col-sm-6">
          <label class="form-label fw-bold" for="k-user">${isNew ? 'Username' : 'New username'}</label>
          <input class="form-control" id="k-user" name="username" required maxlength="30" autocapitalize="none" value="${esc(c.username || '')}" placeholder="e.g. a-aa">
          <div class="form-text">Lowercase letters, numbers and dashes.${isNew ? '' : ' Must be different from the old one.'}</div>
        </div>
        <div class="col-sm-6">
          <label class="form-label fw-bold" for="k-pass">Password</label>
          <input class="form-control" id="k-pass" name="password" required minlength="6" maxlength="64" autocomplete="new-password">
          <div class="form-text">At least 6 characters. Write it down for the class teacher.</div>
        </div>
      </div>` : ''}
    <div class="d-flex gap-2 mt-3">
      <button type="submit" class="btn btn-primary" ${busy ? 'disabled' : ''}>${busy ? 'Saving…' : 'Save class'}</button>
      <button type="button" class="btn btn-outline-secondary" data-act="cancelclass">Cancel</button>
    </div>
  </div></form>`;
}

function viewSetup() {
  const schoolFormHtml = schoolDraft ? `
    <form class="card editor mb-3" id="schoolForm"><div class="card-body">
      <label class="form-label fw-bold" for="sc-name">${schoolDraft.id ? 'Rename school' : 'New school name'}</label>
      <input class="form-control mb-3" id="sc-name" name="name" required maxlength="40" value="${esc(schoolDraft.name || '')}" placeholder="e.g. School A">
      <button type="submit" class="btn btn-primary">Save school</button>
      <button type="button" class="btn btn-outline-secondary" data-act="cancelschool">Cancel</button>
    </div></form>` : '';

  return `
    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
      <h2 class="h4 mb-0">Schools &amp; classes</h2>
      <button class="btn btn-primary" data-act="newschool">Add a school</button>
    </div>
    <p class="text-body-secondary small">Each class gets its own login. Class devices can only choose lunch, and every order is labelled with its school and class.</p>
    ${schoolDraft && !schoolDraft.id ? schoolFormHtml : ''}
    ${S.schools.map(s => {
      const classes = S.classes.filter(c => c.schoolId === s.id);
      return `<section class="card mb-4"><div class="card-body">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <h3 class="h5 mb-0">${esc(s.name)} <span class="badge text-bg-light border fw-normal">${plural(classes.length, 'class', 'classes')}</span></h3>
          <div class="d-flex gap-1">
            <button class="btn btn-sm btn-outline-secondary" data-act="editschool" data-id="${s.id}">Rename</button>
            <button class="btn btn-sm ${pendingDelete === s.id ? 'btn-danger' : 'btn-outline-danger'}" data-act="delschool" data-id="${s.id}">${pendingDelete === s.id ? 'Tap again' : 'Remove'}</button>
            <button class="btn btn-sm btn-outline-primary" data-act="newclass" data-id="${s.id}">Add a class</button>
          </div>
        </div>
        ${schoolDraft && schoolDraft.id === s.id ? schoolFormHtml : ''}
        ${classDraft && classDraft.schoolId === s.id ? classForm() : ''}
        <ul class="list-group">
          ${classes.map(c => `<li class="list-group-item d-flex gap-3 align-items-center">
            <div class="flex-grow-1"><div class="fw-bold">${esc(c.name)}</div><div class="small text-body-secondary">Username: <code>${esc(c.username)}</code></div></div>
            <button class="btn btn-sm btn-outline-secondary" data-act="editclass" data-id="${c.id}">Edit</button>
            <button class="btn btn-sm ${pendingDelete === c.id ? 'btn-danger' : 'btn-outline-danger'}" data-act="delclass" data-id="${c.id}">${pendingDelete === c.id ? 'Tap again' : 'Remove'}</button>
          </li>`).join('') || '<li class="list-group-item text-body-secondary">No classes yet.</li>'}
        </ul>
      </div></section>`;
    }).join('') || '<div class="card p-4 text-center text-body-secondary">No schools yet. Add School A and School B to start.</div>'}
    <p class="small text-body-secondary">Removing a class or giving it a new login blocks the old login straight away. To tidy up, you can also delete old logins in Firebase → Authentication.</p>`;
}

/* ---------------------------------------------------------------------
   RENDER - redraw the page
   --------------------------------------------------------------------- */
const MANAGER_TABS = [['orders', 'Orders'], ['kitchen', 'Kitchen menu'], ['setup', 'Schools & classes'], ['choose', 'Preview']];

function render() {
  // Tabs: only the manager sees them
  const tabs = document.getElementById('tabs');
  tabs.innerHTML = role === 'manager' && !loading
    ? MANAGER_TABS.map(([v, l]) => `<li class="nav-item"><button class="nav-link ${view === v ? 'active' : ''}" data-act="view" data-v="${v}" aria-selected="${view === v}">${l}</button></li>`).join('')
    : '';
  tabs.hidden = !tabs.innerHTML;

  // Who is signed in + Sign out
  document.getElementById('who').innerHTML = user && role
    ? `<span class="small text-body-secondary me-2">${role === 'manager' ? 'Kitchen manager' : esc(className(account.classId))}</span>
       <button class="btn btn-sm btn-outline-secondary" data-act="signout">Sign out</button>`
    : '';

  const app = document.getElementById('app');
  if (!CONFIGURED) app.innerHTML = viewNotConfigured();
  else if (!user || !role) app.innerHTML = loading ? viewLoading() : viewLogin();
  else if (loading) app.innerHTML = viewLoading();
  else if (role === 'class') app.innerHTML = viewChoose();
  else app.innerHTML = view === 'kitchen' ? viewKitchen() : view === 'orders' ? viewOrders() : view === 'setup' ? viewSetup() : viewChoose();
}

/* ---------------------------------------------------------------------
   Photo upload: shrink the photo so it fits in the database
   --------------------------------------------------------------------- */
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, 400 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------------------------------------------------------------------
   Child flow
   --------------------------------------------------------------------- */
async function finishChild() {                                // Save the order (classes only)
  if (role !== 'class') return;
  child.saved = 'saving'; render();
  try { await placeOrder(); child.saved = 'ok'; }
  catch (err) { console.error(err); child.saved = 'error'; }
  render();
}

function advance() {                                          // Next step
  child.selected = null;
  child.optFor = null;
  child.step++;
  if (child.step >= COURSES.length) {
    const names = COURSES.map(c => child.picks[c.key]).filter(Boolean).map(pickName);
    say('All done. You chose ' + (names.join(', ') || 'nothing') + '.');
    finishChild();
  } else say(COURSES[child.step].prompt);
}

/* ---------------------------------------------------------------------
   7. EVENTS
   --------------------------------------------------------------------- */
document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act, id = btn.dataset.id;
  if (!['deldish', 'delcard', 'delorder', 'delclass', 'delschool'].includes(act)) pendingDelete = null;
  const isManager = role === 'manager';

  switch (act) {
    case 'signout': await auth.signOut(); return;
    case 'view': if (isManager) { view = btn.dataset.v; dishDraft = cardDraft = schoolDraft = classDraft = null; confirmReset = false; } break;

    // ----- Choosing lunch -----
    case 'card': child.cardId = id || null; child.selected = null; child.optFor = null; break;
    case 'pick': { child.selected = id; const d = dishById(id); if (d) say(d.name); break; }
    case 'pickopt': { child.selected = id; const o = optById(dishById(child.optFor), id); if (o) say(o.name); break; }
    case 'say': { const it = child.optFor ? optById(dishById(child.optFor), child.selected) : dishById(child.selected); if (it) say(it.name); return; }
    case 'confirm': {
      const d = dishById(child.selected); if (!d) return;
      const safeOpts = (d.options || []).filter(o => optionSafe(d, o, cardById(child.cardId)));
      if (safeOpts.length) { child.optFor = d.id; child.selected = null; say('You chose ' + d.name + '. ' + (d.optionPrompt || '')); }
      else { child.picks[COURSES[child.step].key] = { d: d.id, o: null }; advance(); }
      break;
    }
    case 'confirmopt': if (!child.selected) return; child.picks[COURSES[child.step].key] = { d: child.optFor, o: child.selected }; advance(); break;
    case 'skip': child.picks[COURSES[child.step].key] = null; advance(); break;
    case 'back':
      if (child.optFor) { child.selected = child.optFor; child.optFor = null; }
      else { child.step = Math.max(0, child.step - 1); const p = child.picks[COURSES[child.step].key]; child.selected = p ? p.d : null; }
      break;
    case 'retry': finishChild(); return;
    case 'nextchild': child = newChild(); break;

    // ----- Manager only from here -----
    default:
      if (!isManager) return;
      switch (act) {
        case 'seed': busy = true; render(); await loadSchoolMenu(false); busy = false; break;
        case 'reset': confirmReset = true; break;
        case 'cancelreset': confirmReset = false; break;
        case 'doreset': confirmReset = false; busy = true; render(); await loadSchoolMenu(true); busy = false; break;

        case 'kfilter': kitchenFilter = btn.dataset.f || null; dishDraft = null; break;
        case 'slotweek': slot = { ...slot, week: Number(btn.dataset.w) }; dishDraft = null; break;
        case 'slotday': slot = { ...slot, day: btn.dataset.d }; dishDraft = null; break;
        case 'today': slot = todaySlot(); dishDraft = null; break;
        case 'setweek':
          await saveSettings({ rotation: { anchor: isoDate(mondayOf(new Date())), anchorWeek: Number(btn.dataset.w) } });
          slot = todaySlot(); toast('This week is now Week ' + btn.dataset.w);
          break;

        case 'newdish':
          dishDraft = { id: uid(), name: '', emoji: '🍽️', photo: null, course: 'main', week: slot.week, day: slot.day,
                        allergens: [], tags: [], checked: true, options: [], optionPrompt: '', note: '' };
          cardDraft = null; break;
        case 'editdish': dishDraft = JSON.parse(JSON.stringify(dishById(id))); dishDraft.options = dishDraft.options || []; cardDraft = null; break;
        case 'canceldish': dishDraft = null; break;
        case 'addopt': syncDishDraft(); dishDraft.options.push(opt('', '🍽️')); break;
        case 'delopt': syncDishDraft(); dishDraft.options.splice(Number(btn.dataset.i), 1); break;
        case 'deldish':
          if (pendingDelete === id) { pendingDelete = null; await run(db.collection('dishes').doc(id).delete(), 'Dish removed'); }
          else pendingDelete = id;
          break;
        case 'emoji':
          dishDraft.emoji = btn.dataset.e; dishDraft.photo = null;
          document.getElementById('f-preview').innerHTML = dishMedia(dishDraft);
          document.getElementById('f-clearphoto').hidden = true;
          return;
        case 'clearphoto':
          dishDraft.photo = null;
          document.getElementById('f-preview').innerHTML = dishMedia(dishDraft);
          btn.hidden = true;
          return;
        case 'clearoptphoto': {                                // Remove a choice's photo (its emoji shows again)
          const i = Number(btn.dataset.i);
          dishDraft.options[i].photo = null;
          document.getElementById(`o-${i}-preview`).innerHTML = dishThumb(dishDraft.options[i]);
          btn.hidden = true;
          return;
        }

        case 'newcard': cardDraft = { id: uid(), name: '', color: CARD_COLOURS[7][0], avoid: [], vegOnly: false, order: S.cards.length }; dishDraft = null; break;
        case 'editcard': cardDraft = JSON.parse(JSON.stringify(cardById(id))); dishDraft = null; break;
        case 'cancelcard': cardDraft = null; break;
        case 'delcard':
          if (pendingDelete === id) { pendingDelete = null; await run(db.collection('cards').doc(id).delete(), 'Diet card removed'); }
          else pendingDelete = id;
          break;

        case 'otoday': ordersDate = isoDate(servingDay()); listenOrders(); break;
        case 'oscope': ordersScope = btn.dataset.s; break;
        case 'delorder':
          if (pendingDelete === id) { pendingDelete = null; await run(db.collection('orders').doc(id).delete(), 'Order removed'); }
          else pendingDelete = id;
          break;

        case 'newschool': schoolDraft = { name: '' }; classDraft = null; break;
        case 'editschool': schoolDraft = { ...schoolById(id) }; classDraft = null; break;
        case 'cancelschool': schoolDraft = null; break;
        case 'delschool':
          if (S.classes.some(c => c.schoolId === id)) { toast('Remove this school\'s classes first.'); pendingDelete = null; break; }
          if (pendingDelete === id) { pendingDelete = null; await run(db.collection('schools').doc(id).delete(), 'School removed'); }
          else pendingDelete = id;
          break;
        case 'newclass': classDraft = { schoolId: id, name: '', username: '' }; schoolDraft = null; break;
        case 'editclass': classDraft = { ...classById(id), newLogin: false, username: '' }; schoolDraft = null; break;
        case 'togglenewlogin': {                               // Keep the typed name, then show/hide the login fields
          const f = new FormData(document.getElementById('classForm'));
          classDraft.name = String(f.get('name') || '');
          classDraft.newLogin = btn.checked;
          break;
        }
        case 'cancelclass': classDraft = null; break;
        case 'delclass':
          if (pendingDelete === id) {
            pendingDelete = null;
            const c = classById(id);
            const batch = db.batch();
            batch.delete(db.collection('classes').doc(id));
            if (c && c.uid) batch.delete(db.collection('accounts').doc(c.uid));   // Blocks the old login
            await run(batch.commit(), 'Class removed and its login blocked');
          } else pendingDelete = id;
          break;
        default: return;
      }
  }
  render();
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 's-speech' && role === 'manager') {
    await saveSettings({ speech: t.checked });
    toast(t.checked ? 'Reading aloud is on' : 'Reading aloud is off');
  }
  if (t.id === 'o-date' && t.value) { ordersDate = t.value; listenOrders(); render(); }
  if (t.classList.contains('opt-photo') && t.files[0]) {       // Photo chosen for a choice inside the dish
    const i = Number(t.dataset.i);
    try {
      dishDraft.options[i].photo = await readPhoto(t.files[0]);
      document.getElementById(`o-${i}-preview`).innerHTML = dishThumb(dishDraft.options[i]);
      document.getElementById(`o-${i}-clearphoto`).hidden = false;
    } catch (err) { toast('That file could not be read as a picture. Try a JPG or PNG.'); }
  }
  if (t.id === 'f-photo' && t.files[0]) {
    try {
      dishDraft.photo = await readPhoto(t.files[0]);
      document.getElementById('f-preview').innerHTML = dishMedia(dishDraft);
      document.getElementById('f-clearphoto').hidden = false;
    } catch (err) { toast('That file could not be read as a picture. Try a JPG or PNG.'); }
  }
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const f = new FormData(form);

  // ----- Sign in -----
  if (form.id === 'loginForm') {
    busy = true; loginError = ''; render();
    try {
      await auth.signInWithEmailAndPassword(loginEmail(String(f.get('user'))), String(f.get('pass')));
    } catch (err) {
      console.error(err);
      loginError = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(err.code)
        ? 'Wrong username or password.'
        : err.code === 'auth/too-many-requests' ? 'Too many attempts. Wait a few minutes and try again.'
        : 'Could not sign in (' + err.code + '). Check the internet connection.';
    }
    busy = false; render();
    return;
  }
  if (role !== 'manager') return;                             // Everything below is manager-only

  if (form.id === 'dishForm') {
    syncDishDraft();
    const d = dishDraft;
    d.options = d.options.filter(o => o.name);
    if (await saveDish(d)) dishDraft = null;
  }

  if (form.id === 'cardForm') {
    const c = Object.assign(cardDraft, {
      name: String(f.get('name')).trim(),
      color: f.get('color') || CARD_COLOURS[0][0],
      avoid: f.getAll('avoid'),
      vegOnly: f.get('vegOnly') === 'on'
    });
    if (await saveCard(c)) cardDraft = null;
  }

  if (form.id === 'schoolForm') {
    const name = String(f.get('name')).trim();
    const ref = schoolDraft.id ? db.collection('schools').doc(schoolDraft.id) : db.collection('schools').doc();
    if (await run(ref.set({ name }), 'Saved ' + name)) schoolDraft = null;
  }

  if (form.id === 'classForm') {
    const c = classDraft;
    const name = String(f.get('name')).trim();
    const needLogin = !c.id || c.newLogin;
    const username = String(f.get('username') || '').trim().toLowerCase();
    const password = String(f.get('password') || '');
    if (needLogin && !USERNAME_RULE.test(username)) { toast('Username: 3–30 lowercase letters, numbers or dashes, e.g. a-aa'); return; }
    busy = true; render();
    try {
      const ref = c.id ? db.collection('classes').doc(c.id) : db.collection('classes').doc();
      const batch = db.batch();
      if (needLogin) {
        const newUid = await createClassLogin(username, password);                    // New Firebase login
        batch.set(db.collection('accounts').doc(newUid), { role: 'class', schoolId: c.schoolId, classId: ref.id });
        if (c.uid) batch.delete(db.collection('accounts').doc(c.uid));                // Block the old login
        batch.set(ref, { schoolId: c.schoolId, name, username, uid: newUid });
      } else {
        batch.set(ref, { name }, { merge: true });
      }
      await batch.commit();
      toast(needLogin ? `Saved. Class login: ${username}` : 'Saved ' + name);
      classDraft = null;
    } catch (err) {
      console.error(err);
      toast(err.code === 'auth/email-already-in-use' ? 'That username is already taken. Choose another.'
          : err.code === 'auth/weak-password' ? 'The password must be at least 6 characters.'
          : 'Could not save the class: ' + (err.message || err.code));
    }
    busy = false;
  }

  render();
});

/* ---------------------------------------------------------------------
   START
   --------------------------------------------------------------------- */
render();
