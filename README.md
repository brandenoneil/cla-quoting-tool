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
| **`DATABASE_URL`** | **Transaction pool** URI (short-lived/serverless-friendly). |
| **`DIRECT_URL`** | **Direct** URI (`db.*.supabase.co:5432`). Used by **`prisma db push`** on Vercel and for migrations locally. |

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
   | `HUBSPOT_PRIVATE_APP_TOKEN` | Optional |
   | `CLA_ANTHROPIC_KEY` | Optional |
   | `DEALER_EMBED_FRAME_ANCESTORS` | Optional; space-separated parent origins for iframe embed |

3. Deploy. The build runs **`prisma db push`** (via `directUrl`) to sync the schema, then **`next build`**.

4. **Seed once** after the schema exists (creates admin if DB is empty). Pull env vars and run seed:

   ```bash
   npx vercel env pull .env.production.local
   npx prisma db seed
   ```

   Alternatively run `prisma db seed` from any machine where `DATABASE_URL` / `DIRECT_URL` match production.

Default seeded credentials (rotate after first login): see [`prisma/seed.ts`](prisma/seed.ts).

**PDF generation** uses Puppeteer and may need extra tuning on Vercel (memory / timeout). The dealer price check and most quote flows do not depend on it.

### Local development with Supabase

Copy `.env.example` to `.env`, fill **`DATABASE_URL`** and **`DIRECT_URL`**, then:

```bash
npx prisma db push
npm run db:seed
npm run dev
```

This app uses **NextAuth + your `User` table** — you are only using Supabase as **PostgreSQL** here; Supabase Auth is optional unless you integrate it separately.
