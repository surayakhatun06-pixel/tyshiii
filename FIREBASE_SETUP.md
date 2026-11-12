# Firebase + Netlify setup (step by step)

This connects TYSHI ZONE to Firebase so you can add anime and SUB/DUB episode links
from `/admin`. Changes are live for every visitor right away — **no redeploy needed**
after the one-time setup below.

You need: a Google account, access to your Netlify site, and about 15 minutes.

---

## 1. Create a Firebase project

1. Go to <https://console.firebase.google.com> and click **Create a project** (or **Add project**).
2. Give it a name (for example `tyshi-zone`). Google Analytics is optional — you can turn it off.
3. Wait for it to finish, then click **Continue**.

## 2. Register the website ("web app")

1. On the project overview page click the **`</>` (Web)** icon.
2. Nickname: `tyshi-zone-web`. Leave "Firebase Hosting" **unchecked** (you use Netlify).
3. Click **Register app**. Firebase shows a code block with `const firebaseConfig = { ... }`.
4. Keep this page open — you'll copy these values in step 6:

| firebaseConfig field | Environment variable              |
| -------------------- | --------------------------------- |
| `apiKey`             | `VITE_FIREBASE_API_KEY`           |
| `authDomain`         | `VITE_FIREBASE_AUTH_DOMAIN`       |
| `projectId`          | `VITE_FIREBASE_PROJECT_ID`        |
| `appId`              | `VITE_FIREBASE_APP_ID`            |
| `storageBucket`      | `VITE_FIREBASE_STORAGE_BUCKET`    |
| `messagingSenderId`  | `VITE_FIREBASE_MESSAGING_SENDER_ID` |

> These values are **not passwords**. Every Firebase website ships them to the browser.
> What protects your data is Firebase Authentication + the security rules in step 5.
> Never put your admin password or a "service account" JSON file in the code or in Netlify.

You can find them again later under **Project settings (gear icon) → General → Your apps**.

## 3. Turn on Firestore (the database)

1. Left menu: **Build → Firestore Database → Create database**.
2. Pick a location close to your viewers (it can't be changed later).
3. Choose **Start in production mode** and click **Create**.

## 4. Turn on sign-in and create your admin account

1. Left menu: **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Email/Password** → enable the first switch → **Save**.
3. In the same **Sign-in method** tab, enable **Anonymous** sign-in and save it. Visitors use anonymous accounts to submit anime requests and be counted once for the visitor total.
4. **Users** tab → **Add user** → enter your email and a strong password → **Add user**.
5. In the users list, copy the **User UID** of that account (a long code like `Xy12Ab…`).

Recommended: in **Authentication → Settings → User actions**, turn off **Enable create
(sign-up)** so nobody else can create accounts. (Even if they could, they wouldn't be admins.)

Then make yourself an admin:

1. Go to **Firestore Database → Data → Start collection**.
2. Collection ID: `admins` → **Next**.
3. Document ID: paste your **User UID** (exactly).
4. Add one field, e.g. `name` (string) = `me`, and click **Save**.

Only accounts with a document in `admins` can change content. To add another admin later,
create their user in Authentication and add their UID to `admins` the same way. To remove
an admin, delete their document.

## 5. Publish the security rules

1. **Firestore Database → Rules** tab.
2. Delete everything in the editor and paste the full contents of [`firestore.rules`](./firestore.rules) from this project.
3. Click **Publish**.

What the rules do:

- Anyone can **read** `anime` and `episodeLists` (needed to watch).
- Only signed-in admins (UID in `admins`) can change site content. Visitors can submit one anime request per title and create their own anonymous unique-visitor record.
- Nobody can create or change `admins` from the website — only you, in the console.
- Everything else is blocked.

## 6. Add the environment variables to Netlify

1. Open your site at <https://app.netlify.com> → **Site configuration → Environment variables**.
2. Click **Add a variable → Add a single variable** for each row in the table in step 2
   (for example key `VITE_FIREBASE_API_KEY`, value = your `apiKey`). Keep the default
   "same value for all deploy contexts".
3. Go to **Deploys → Trigger deploy → Deploy site** (or push a commit). This one deploy is
   needed because `VITE_` variables are built into the site.

Nothing else in `netlify.toml` needs to change (build command `bun run build`, publish `dist`).

## 7. Allow your domain to sign in

**Authentication → Settings → Authorized domains → Add domain** and add your Netlify
domain (e.g. `your-site.netlify.app`) and any custom domain. `localhost` is already listed.

## 8. Add content

1. Open `https://your-site.netlify.app/admin` and sign in with the account from step 4.
   - If it says *"signed in but not an admin"*, it shows your UID — check that the
     `admins` document ID matches it exactly.
2. **Choose an anime**: search by name or type the AniList ID (the number in your site's
   `/anime/ID` address).
3. **Import SUB links** and **Import DUB links** are separate boxes:
   - Choose a `.txt` file or paste links — one per line, in episode order.
   - Accepted formats per line:
     ```
     https://player.example/embed/abc
     <iframe src="https://player.example/embed/abc" allowfullscreen></iframe>
     Episode 5 | https://player.example/embed/abc
     5. https://player.example/embed/abc
     ```
   - **Numbering**: "In order" numbers the first link as the start number (default 1),
     the next as +1, and so on. If every line has an episode number ("Episode 5 | …"),
     those numbers are used automatically.
   - Check the **preview table** (episode number, host, status) and press **Preview** on
     any row to test-play it before saving.
   - Existing links of the same language are kept unless you tick **Replace existing**.
   - Saving SUB never changes DUB links, and saving DUB never changes SUB links.
4. Use **Episodes in Firestore** to add one episode by hand, edit, remove only the SUB or
   DUB link, or delete an episode.

Viewers see a **SUB / DUB** switch on the watch page when an episode has both. Their choice
is remembered. Whatever you add in `/admin` shows up directly on that anime's normal page
(find it with the search bar) — there is no separate "available to watch" row.

### Multiple servers

Every import box has a **Server name** field. Leave it as `Server 1`, or type any name
(`VidPlay`, `Server 2`, …) to add another server. Import SUB and DUB links for as many
servers as you want — each one is stored separately, so importing to one server never
overwrites another. In **Episodes in Firestore** you can add several servers to a single
episode, rename a server everywhere, or remove one from every episode.

On the watch page viewers get a **Server** switch below the player *and* a server / SUB / DUB
button on top of the video itself, so it still works in fullscreen. Use the site's own
fullscreen button (on the video, or next to the controls) — a video host's built-in
fullscreen button can only fullscreen its own frame, which hides every control from this site.

### Your own series

In step 1 of the admin page press **Create your own series**: give it a name, logo/poster
link, optional banner, About text, genres, year, format and status. It gets its own page,
appears in the normal search bar (with an "Original" tag), and you add SUB/DUB links to it
like any other anime. For normal AniList titles, **Save details** replaces the name, poster,
banner, About and genres on that title's page. **Delete series / Remove from database**
removes it and all its links.

> **Upgrading from the previous version?** Republish [`firestore.rules`](./firestore.rules)
> (step 5) once — the `anime` collection now accepts the extra fields above. Existing episodes
> and links keep working untouched (old links count as `Server 1`).

Episodes that were saved only in a browser (the old `/anime/:id/edit` page) still work in
that browser. To share them with everyone, open `/admin` in that same browser and use
**Use episodes saved in this browser** in the SUB or DUB box.

---

## Local development (optional)

```bash
cp .env.example .env     # then fill in the values from step 2
bun install
bun run dev              # open http://localhost:3000/admin  (port may differ)
```

`.env` is git-ignored — don't commit it.

To test against local emulators instead of your real project, install the Firebase CLI,
run `firebase emulators:start --only firestore,auth --project demo-tyshi`, and set
`VITE_FIREBASE_USE_EMULATOR=true` with `VITE_FIREBASE_PROJECT_ID=demo-tyshi`.

## Troubleshooting

| Message / problem | Fix |
| --- | --- |
| Admin page says "Firebase isn't configured" | The `VITE_FIREBASE_*` variables are missing. Add them in Netlify and redeploy. |
| "auth/unauthorized-domain" or sign-in popup errors | Add your domain in step 7. |
| "Permission denied" when saving or creating a series | Two things must both be true: (1) a document exists at `admins/<your UID>` (the sign-in screen shows your UID with a copy button), and (2) the **current** `firestore.rules` from this project are published (Firestore Database → Rules → paste → **Publish**). Older published rules refuse newer fields, so republish after every update. |
| Episodes don't appear | Check the AniList ID matches the anime page URL, and that each episode has a SUB or DUB link. |
| A link plays on its host site but not here | Some hosts block embedding on other sites. Use the host's *embed* link or iframe code. |
| "too many links for one Firestore document" | One title holds roughly 5,000+ long links. Split very long series by season (separate AniList IDs). |

## Firestore data layout (for reference)

```
admins/{uid}                 { name }                         ← created by you in the console
anime/{id}                   { anilistId, title, poster, episodeCount, subCount, dubCount, updatedAt,
                               custom?, edited?, about?, banner?, genres?, year?, format?, status? }
                             (custom series use ids from 900000000 up, so they never clash with AniList)
episodeLists/{id}            { anilistId, updatedAt,
                               episodes: { "1": { subUrl, dubUrl,          ← "Server 1"
                                                  servers: { "VidPlay": { subUrl, dubUrl } },
                                                  title?, thumbnail? }, "2": {…} } }
```

All episodes of a title live in one document, so opening a watch page costs one read
(Firebase's free Spark plan includes 50,000 reads per day).

## v10: rules for Bulk import

Bulk import writes to a new top-level `series` collection (`series/{id}/seasons/{anilistId}/episodes/{n}`).
Publish the updated `firestore.rules` (Firebase console → Firestore → Rules → paste → Publish), or the import
will say "Firestore refused this change".
