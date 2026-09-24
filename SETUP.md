# Setting up PickMyPlate online (Firebase)

PickMyPlate uses **Firebase** (by Google) for two things:

- **Logins**: the kitchen manager and each class sign in.
- **An online database**: the menu, diet cards, schools, classes and orders are shared by every device.

It's free for a project this size. You only do this setup once. It takes about 15 minutes.

---

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. Click **Create a project** and name it `pickmyplate`.
3. Google Analytics: **turn it off** (not needed), then click **Create project**.

## 2. Add a web app and copy its settings

1. On the project home page, click the **Web** icon (`</>`).
2. App nickname: `PickMyPlate`. Leave "Firebase Hosting" unticked. Click **Register app**.
3. Firebase shows a block of code containing `const firebaseConfig = { apiKey: ..., ... }`.
4. Copy each value into `pickmyplate/js/firebase-config.js` (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId).

These values are **not secret**. Every Firebase website shares them publicly. Your data is protected by the logins and the security rules (step 5).

## 3. Turn on logins

1. Left menu: **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Email/Password** → switch on the first option → **Save**.
3. **Settings** tab → **Authorized domains** → **Add domain** → `usmanbabardev.github.io`.

## 4. Create the database

1. Left menu: **Build → Firestore Database → Create database**.
2. Location: **europe-west2 (London)**, so the data stays in the UK.
3. Start in **production mode** → **Create**.

## 5. Add the security rules

1. In Firestore Database, open the **Rules** tab.
2. Delete everything there and paste the whole contents of `firestore.rules` from this project.
3. Click **Publish**.

## 6. Create your kitchen manager login

1. **Authentication → Users → Add user**.
2. Enter your email and a strong password → **Add user**.
3. Copy the **User UID** shown in the list (a long code like `hG7s...`).
4. Go to **Firestore Database → Data → Start collection**:
   - Collection ID: `managers` → **Next**
   - Document ID: paste your **User UID**
   - Add a field: `name` (string) = `Kitchen manager`
   - **Save**

Only people with a document in `managers` get the manager screens. Nobody can add themselves from the app.

## 7. First sign-in

1. Push your changes to GitHub (so the live site has your Firebase settings) and open the live link.
2. Sign in with your **email** and password.
3. **Kitchen menu → Load the school menu**: loads the 3-week menu and the 7 diet cards.
4. **Schools & classes → Add a school**: add `School A` and `School B`.
5. For each school, **Add a class** (e.g. `AA`) with a username (e.g. `a-aa`) and a password.
6. Give each class teacher their username and password. On the class tablet, open the live link and sign in with them.

---

## Day to day

| Who | Signs in with | Sees |
|---|---|---|
| Class teacher / children | Class username (e.g. `a-aa`) | Choose lunch only |
| Kitchen manager | Your email | Orders, Kitchen menu, Schools & classes, Preview |

- **Orders** updates live: School A, School B and the total, with a serving list for each class. Meals ordered with a diet card are listed separately so they can be kept apart.
- **Forgotten class password:** Schools & classes → Edit the class → tick "Give this class a new login". The old login stops working straight away.
- **Removing a class** also blocks its login.

## Privacy

- No children's names are stored anywhere. Orders record only the school, class, meal and diet card colour.
- Before using this with real classes, check with each school's data protection lead (DPO) that they're happy with it.
