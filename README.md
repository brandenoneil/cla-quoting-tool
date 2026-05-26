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

## Deploy (Vercel + Neon)

Production uses **PostgreSQL** (Prisma). SQLite is not suitable for serverless hosting.

1. Create a free [Neon](https://neon.tech) database and copy the **pooled** connection string.
2. Push this repo to GitHub, then [import the project on Vercel](https://vercel.com/new).
3. Set environment variables in Vercel (Project → Settings → Environment Variables):

   | Variable | Notes |
   |----------|--------|
   | `DATABASE_URL` | Neon PostgreSQL URL (`?sslmode=require`) |
   | `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
   | `NEXTAUTH_URL` | `https://your-project.vercel.app` |
   | `HUBSPOT_PRIVATE_APP_TOKEN` | Optional |
   | `CLA_ANTHROPIC_KEY` | Optional |
   | `DEALER_EMBED_FRAME_ANCESTORS` | Optional; space-separated parent origins for embed |

4. Deploy. The Vercel build runs `prisma db push` to create tables, then `next build`.
5. After the first deploy, run the seed once (creates admin if empty):

   ```bash
   npx vercel env pull .env.production
   DATABASE_URL="..." npx prisma db seed
   ```

   Or use Vercel’s **Run Command** / a one-off terminal with production env.

Default seeded admin (change password after first login): see `prisma/seed.ts`.

**PDF generation** uses Puppeteer and may need extra configuration on Vercel (memory/timeout). Price check and most quote flows do not depend on it.

### Local development after Postgres migration

Copy `.env.example` to `.env` and set `DATABASE_URL` to your Neon dev branch or local Postgres. Run:

```bash
npx prisma db push
npm run db:seed
npm run dev
```
