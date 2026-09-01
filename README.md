# Thulla 🃏

A web version of the Pakistani card game **Thulla** (also called **Thulla**).
2–8 players, against the computer or with friends. Mobile first.

**Play:** https://thulla-online.vercel.app

## Running it

```bash
npm install
npm run dev
```

Needs a `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Single-player works without any of that once the app is running — only
online rooms and cross-device stats need Supabase.

## Tests

```bash
npm run simulate      # 6,300 simulated games — rules, deals, no stuck games
npm run ai-benchmark  # is "hard" actually harder than "easy"?
npm run stats-test    # win rate, streaks, filters
npx tsc --noEmit      # types
```

## How the code is laid out

| Path | What's in it |
| --- | --- |
| `lib/engine/` | The rules. Pure TypeScript, no React, no network. |
| `lib/useLocalGame.ts` | Runs a single-player game and paces the CPUs. |
| `lib/gameHistory.ts` | Recording results and reading stats. |
| `app/api/` | Online rooms. The server re-validates every move. |
| `components/` | The table, cards, hand, and results screen. |

See [PROJECT_SPEC.md](PROJECT_SPEC.md) for the rules and the reasoning.
