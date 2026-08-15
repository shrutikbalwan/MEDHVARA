# MEDHVARA

A [Next.js](https://nextjs.org) app (App Router, TypeScript) bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Copy the env template and fill in your keys:

```bash
cp .env.example .env.local
```

Then run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the result. Edit `src/app/page.tsx` — the page auto-updates as you save.

## Project Structure

```
src/
├── app/           # routes and layouts (App Router)
│   └── api/       # route handlers (server-side)
├── components/
│   └── ui/        # presentational primitives
├── lib/           # clients and business logic
├── hooks/         # client-side React hooks
├── types/         # shared TypeScript types
├── config/        # constants and env parsing
└── styles/        # shared CSS
```

## Environment Variables

See `.env.example` for the full list. `.env.local` is gitignored — never commit real keys. `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security and must stay server-side (never prefixed with `NEXT_PUBLIC_`).

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)
