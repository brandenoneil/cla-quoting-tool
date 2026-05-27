This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Dealer quick price check (embed)

Authorized **dealer** users can estimate a configured machine total (matching internal quote freight rules) from:

- In-app: `/dealer/price-check`
- Iframe-friendly page: `/dealer/embed/price-check`

Both routes require signing in as a dealer (session cookie). Embed the iframe on a dealer-facing portal pointing at your deployed host, for example:

```html
<iframe
  title="CLA price check"
  src="https://YOUR_HOST/dealer/embed/price-check"
  width="100%"
  height="720"
></iframe>
```

### `Content-Security-Policy: frame-ancestors`

Responses under `/dealer/embed/**` send `Content-Security-Policy: frame-ancestors …` via [`middleware.ts`](middleware.ts). Set **`DEALER_EMBED_FRAME_ANCESTORS`** in the environment to a comma-separated list of allowed **parent origins** (scheme + host + optional port). Example:

```bash
DEALER_EMBED_FRAME_ANCESTORS=https://portal.dealer-a.com https://staging.dealer-a.com
```

If unset, the policy defaults to **`'self'`** (only your own site may embed).

### Cookies in third-party iframes

If the iframe is embedded on a **different site** than the app’s own origin (cross-site iframe), browsers may block session cookies depending on cookie `SameSite` settings. Dealers typically need to complete sign-in inside the iframe; if cookies are dropped after refresh, configure NextAuth session cookies as **`SameSite=None; Secure`** in production (`authOptions`) and serve the app over HTTPS. Falling back to “open portal in new tab” is always available via the embed header link.

API: `POST /api/dealer/price-check` (dealer role only). `GET /api/dealer/price-check` returns model name hints from the sheet (labels only).

## HubSpot CRM (company search & deals)

Company autocomplete and deal flows use HubSpot’s API. Set **`HUBSPOT_PRIVATE_APP_TOKEN`** in `.env` / Vercel (private app with scopes to read **Companies** and **Contacts**, plus whatever you need for deals/quotes). If it is missing, the UI shows **“CRM search is unavailable”** instead of failing silently.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy (Vercel + Supabase)

Production uses **PostgreSQL** through Prisma. Serverless hosts do not reliably support file-based SQLite; **Supabase** (Postgres + dashboard, same ecosystem you may use on AROS) is a good fit.

### 1. Supabase database

Supabase does **not** hide this under Database settings only—you open it from **`Connect`** in the dashboard.

**Where to find the URIs**

1. Sign in → open your **project**.
2. At the **top of the dashboard** there is a **Connect** button (often top-right bar). **[Click Connect](https://supabase.com/docs/guides/database/connecting-to-postgres#where-is-the-postgres-connection-string-in-supabase)** — a modal appears with Postgres connection tabs.
3. In that modal, switch tabs and copy:
   - **Transaction pool** (often port **6543**, “serverless / edge”) → use as **`DATABASE_URL`** on Vercel [[Supabase pooling](https://supabase.com/docs/guides/database/connecting-to-postgres)].  
     For Prisma, append **`?pgbouncer=true`** if the string does not already include it (some copy-pastes include pooling params automatically).
   - **Direct connection** or **Direct** (port **5432**, host like `db.<project-ref>.supabase.co`) → use as **`DIRECT_URL`** (builds **`prisma db push`** correctly).

Supabase occasionally changes labels (“Transaction pool”, “Dedicated pooler”, “ORM”). If you see **Prisma**, it may propose both pooled and direct—it’s OK to paste those into **`DATABASE_URL`** / **`DIRECT_URL`** accordingly.

If you honestly don’t see **Connect**: press **`g`** then **`d`** for “go to database” in some builds, or use **Project Settings** (gear) → **Database** — the password and host are there; you can still build the URI by hand from the [connection method examples](https://supabase.com/docs/guides/database/connecting-to-postgres) (direct `5432` vs transaction pool `6543`).

Configure **two** environment variables ([Prisma + Supabase](https://www.prisma.io/docs/orm/overview/databases/supabase)):

| Variable | Use |
|---------|-----|
| **`DATABASE_URL`** | **Runtime** (Vercel serverless). Use **Shared pooler → Transaction** or **Session pooler** (`*.pooler.supabase.com`). **Do not** use **Dedicated** `db.<ref>.supabase.co:6543` — Vercel is IPv4-only and login will fail with “Can't reach database server … :6543”. |
| **`DIRECT_URL`** | **Build / migrations** only. **Session pooler** `:5432` on `*.pooler.supabase.com` (what worked in your deploy logs), or direct `:5432` if IPv6 works. |

For **local-only** development you can often set **both** to the **direct** URI (simplest).

**Note:** If Vercel can’t resolve **IPv6** and the **direct** host fails during build, use Supabase [**session pool**](https://supabase.com/docs/guides/database/connecting-to-postgres#pooler-session-mode) for **`DIRECT_URL`** or enable their **IPv4 add-on** for direct connections—see Supabase’s “Connecting to Postgres” doc.

### 2. Vercel

1. [Import the repo](https://vercel.com/new) (or use an existing linked project).
2. **Project → Settings → Environment Variables** — add (at least for **Production**, and optionally **Preview**):

   | Variable | Notes |
   |----------|--------|
   | `DATABASE_URL` | Pooled URI (above) |
   | `DIRECT_URL` | Direct URI (above) |
   | `NEXTAUTH_SECRET` | e.g. `openssl rand -base64 32` |
   | `NEXTAUTH_URL` | Your canonical URL (`https://…vercel.app` or custom domain) |
   | `HUBSPOT_PRIVATE_APP_TOKEN` | **Required** for company search / HubSpot deal features (private app token) |
   | `CLA_ANTHROPIC_KEY` | Optional |
   | `DEALER_EMBED_FRAME_ANCESTORS` | Optional; space-separated parent origins for iframe embed |

3. Deploy. The build runs **`prisma db push`** (via `directUrl`) to sync the schema, then **`next build`**.

4. **Create the admin user** (required for `/login`):

   **Default credentials** (see [`prisma/seed.ts`](prisma/seed.ts)):  
   `admin@cutliteamerica.com` / `CutliteAdmin2026` — change after first login.

   **Option A — Prisma seed (recommended)**  
   `npx vercel env pull` often writes **empty** values for `DATABASE_URL` / `DIRECT_URL` locally. If `npx prisma db seed` fails with “nonempty URL”, paste your production strings into a **temporary** file (do not commit) or run:

   ```bash
   DATABASE_URL='postgresql://…' DIRECT_URL='postgresql://…' npx prisma db seed
   ```

   (Use the same URIs as in Vercel; password must be URL-encoded if it has special characters.)

   **Option B — Supabase SQL Editor**  
   If seed is awkward, run this once in **Supabase → SQL** (password for login is `CutliteAdmin2026`):

   ```sql
   INSERT INTO "User" ("id", "email", "name", "password", "role", "createdAt")
   VALUES (
     replace(gen_random_uuid()::text, '-', ''),
     'admin@cutliteamerica.com',
     'Admin',
     '$2b$12$MSKfhwbiSHeIj4mEyv5FD.7IiJ3ejr/tqkn1wP.6qdsMj35waw/TS',
     'admin',
     NOW()
   )
   ON CONFLICT ("email") DO UPDATE SET
     "password" = EXCLUDED."password",
     "role" = EXCLUDED."role",
     "name" = EXCLUDED."name";
   ```

   If login still says “Invalid email or password”, the row is missing or the app is not using the same database as Supabase (wrong `DATABASE_URL` on Vercel).

**PDF generation** uses Puppeteer and may need extra tuning on Vercel (memory / timeout). The dealer price check and most quote flows do not depend on it.

### Local development with Supabase

Copy `.env.example` to `.env`, fill **`DATABASE_URL`** and **`DIRECT_URL`**, then:

```bash
npx prisma db push
npm run db:seed
npm run dev
```

This app uses **NextAuth + your `User` table** — you are only using Supabase as **PostgreSQL** here; Supabase Auth is optional unless you integrate it separately.
