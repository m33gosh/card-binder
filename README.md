# Card Binder

A web app for keeping track of a Pokémon card collection: photograph a binder
page, cut it into cards, match each one to the official catalog, and see what
the whole collection is worth today. Sign-in is with Google; who can look, add,
or run things is decided per person. It runs on GitHub Pages and is built to be
wrapped as an iPad app later.

## How it's put together

| Piece | Choice | Why |
| --- | --- | --- |
| Front end | React + TypeScript + Vite | Static build, so GitHub Pages can host it. |
| Sign-in | Supabase Auth with the Google provider | Gmail accounts, no server of our own. |
| Database + photos | Supabase Postgres + Storage | Free tier, and Postgres row security enforces the roles. |
| Prices | [pokemontcg.io](https://pokemontcg.io) (TCGplayer market prices) | Free, current (sets from this month are in it), works straight from the browser. |
| iPad | Capacitor | Wraps the same web build into a native iOS app. |

Every signed-in person has their own private binder; nobody, admins included,
can see anyone else's cards or photos. Roles: **pending** (signed in, no
access yet), **viewer** (can sign in), **editor** (fills and manages their own
binder), **admin** (also approves people on the People page). The first
account to sign in becomes admin. Every rule lives in `supabase/migrations/`
as a row-security policy (`0001` sets up the schema, `0002` makes binders
private); the app only mirrors them in `src/auth/permissions.ts` to hide
buttons.

## Setting it up

You'll create one Supabase project and one Google OAuth client. About 20 minutes.

### 1. Supabase

1. Go to <https://supabase.com>, create a free project. Note the **Project URL**
   and the **anon public key** (Project Settings → API).
2. Open the SQL editor, paste the contents of
   `supabase/migrations/0001_init.sql`, run it. That creates the tables, the
   roles, the row-security rules and the private `card-images` bucket.
3. Authentication → URL Configuration:
   - **Site URL**: where the app will live, e.g. `https://YOUR-USER.github.io/YOUR-REPO/`
   - **Redirect URLs**: add that same URL and `http://localhost:5173/` for development.

### 2. Google sign-in

1. In <https://console.cloud.google.com>, create a project, then
   APIs & Services → OAuth consent screen. Choose **External**, fill in the app
   name and your email. Under **Audience/Test users** add the Gmail addresses of
   everyone in the family (while the app is in "testing" mode only listed users
   can sign in, which is exactly what you want).
2. Credentials → Create credentials → OAuth client ID → **Web application**.
   - Authorized JavaScript origins: `https://YOUR-PROJECT-REF.supabase.co`
   - Authorized redirect URIs: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
3. Copy the client ID and secret into Supabase → Authentication → Providers →
   Google, and enable it.

### 3. Run it locally

```bash
cp .env.example .env.local     # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev                    # http://localhost:5173
```

Sign in with your own Google account first: that account becomes admin. Then
have your son sign in, open **People**, and set him to "Can add cards".

### 4. Deploy to GitHub Pages

1. Push this folder to a GitHub repository on the `main` branch.
2. Repository Settings → Pages → Source: **GitHub Actions**.
3. Settings → Secrets and variables → Actions → **Variables** tab, add:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and optionally
   `VITE_POKEMONTCG_API_KEY` (free key from <https://dev.pokemontcg.io>, raises
   the daily request limit from 1,000 to 20,000).
4. Every push to `main` runs `.github/workflows/deploy.yml`: tests, build, deploy.
   The site lands at `https://YOUR-USER.github.io/YOUR-REPO/`.

These values are fine to expose in a public site. The anon key is designed to be
public; the row-security rules are what protect the data.

### On the iPad today

Open the site in Safari, Share → **Add to Home Screen**. It runs full-screen
with its own icon, and "Add cards" opens the camera directly.

## Adding cards

- **A whole binder page**: photograph the page, drag the two yellow corners so
  the frame hugs the nine cards, and the app cuts it into nine photos. Then tap
  each one and search the catalog by name (plus the card number printed
  bottom-left, like `057/191`, to narrow it down). iPhone HEIC photos are
  converted in the browser.
- **One card at a time**: pick one or more photos with a single card each.
- Cards you can't find in the catalog can be saved with just a name and matched
  later from the card's page.

"Update today's prices" on the binder page re-fetches every matched card's
market price and records it, so each card's page shows how its price has moved.
The price used is the TCGplayer market price for the card's finish (regular,
holo, reverse holo). If the catalog doesn't price that finish it falls back to
the cheapest finish it does price, so the total never overstates.

## Moving to iPad (Capacitor)

The web build is the app; Capacitor wraps it. On a Mac with Xcode:

```bash
npm run build
npx cap add ios
npx cap sync
npx cap open ios
```

Two things to change for the native shell:

1. **Google sign-in inside the app.** Google blocks OAuth inside embedded web
   views, so replace `signInWithGoogle` in `src/auth/AuthProvider.tsx` with the
   native flow: `@capacitor/browser` to open the Supabase OAuth URL, and a custom
   URL scheme (`cardbinder://auth`) added to Supabase's redirect list so the app
   receives the callback. Alternatively `@capgo/capacitor-social-login` gives a
   native Google sheet and `supabase.auth.signInWithIdToken` accepts its token.
2. **Camera.** Already handled: `src/lib/camera.ts` uses the native camera
   plugin when running inside Capacitor and the file picker on the web.

Everything else (data, roles, pricing, image cropping) is shared code.

## Development

```bash
npm test          # unit tests (pricing rules, grid maths, permissions)
npm run typecheck
npm run build
```

Layout of `src/`:

```
auth/            AuthProvider (Supabase session + profile), permissions (RBAC mirror)
lib/supabase.ts  client
lib/pricing/     PricingSource interface + pokemontcg.io implementation
lib/images.ts    HEIC conversion, resizing, grid cropping
lib/camera.ts    photo picking (web + native)
features/cards/  types and data access for cards, photos, price history
features/admin/  role management
features/import/ BinderCropper
pages/           Collection, CardDetail, AddCards, People, Login, Pending
```

## Known limits

- Card identification is by search, not image recognition. Auto-recognising a
  card from its photo would be the natural next feature (the crops are already
  isolated, so a model could take them as input).
- Prices are USD from TCGplayer. Cardmarket (EUR) data is available from the
  same API if you'd rather.
- The free API occasionally returns a server error; the app retries once and
  otherwise asks you to try again.

## Bulk import from a folder of photos

`scripts/bulk-import.mjs` loads many cards at once from a JSON manifest plus a
folder of per-card photos, merging duplicates into one row with a quantity.
It needs the Supabase **service-role** key, which bypasses row security, so
it runs only on your own machine: put `SUPABASE_SERVICE_ROLE_KEY=...` in
`.env.local` (gitignored) and never in the app or the repo.

```bash
node scripts/bulk-import.mjs manifest.json photos/ --dry-run   # preview
node scripts/bulk-import.mjs manifest.json photos/             # import
```

## Reading card numbers from photos (optional)

After a page is cut into cards, the app can read the set code and number
printed in each card's bottom-left corner and suggest the exact catalog match,
which you confirm with one tap. It uses [OCR.space](https://ocr.space), which
has a free tier (25,000 reads a month, no card needed). In testing on binder-page
photos it read about three out of four regular cards correctly; single-card
photos do better. Cards it can't read fall back to the normal search.

The key lives in a Supabase Edge Function, never in the web app, and the
function only answers signed-in editors and admins. Setup, once:

```bash
npx supabase login
npx supabase secrets set OCR_SPACE_API_KEY=your-key --project-ref YOUR-PROJECT-REF
npx supabase functions deploy ocr-card --project-ref YOUR-PROJECT-REF
```

Without the function deployed, the app simply skips the suggestion step.

Tip that works without any of this: type the number printed on the card, like
`57/191`, into the search box and it finds the exact card.
