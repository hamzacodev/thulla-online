# Thulla Online — Build Spec

## What to build
A real-time multiplayer Thulla (Pakistani/Indian card game) web app. Friends play together from different cities or countries, for free, live at:

`hamzashakoor.com/thulla123-321thulla`

## Stack
- Next.js (App Router, TypeScript) — already scaffolded
- Supabase — free tier: Postgres + Auth (email) + Realtime
- Vercel — free Hobby tier hosting, deployed as its **own** project
- No dedicated game server. Supabase Realtime pushes live game state to every player in a room.

## Repositories
- **Portfolio (existing, live):** `github.com/hamzacodev/portfolio` — hosted on Vercel, this is the site `hamzashakoor.com` points at. Gets touched for exactly one small change (see Routing below).
- **Thulla (new):** suggested name `github.com/hamzacodev/thulla-online` — doesn't exist yet, gets created during setup, deployed as its own separate Vercel project.
- Supabase is connected to GitHub on Hamza's account already. Once the Thulla repo exists, it can optionally be linked under Supabase → Project Settings → Integrations → GitHub for automatic migration syncing on push. Not required — running the SQL file manually in the SQL Editor works fine without it.

## Deployment / routing — no DNS work needed
Thulla deploys as its own separate Vercel project with its own auto-generated `*.vercel.app` URL, fully decoupled from the portfolio codebase.

To make it reachable at `hamzashakoor.com/thulla123-321thulla`, add **one rewrite rule** to `github.com/hamzacodev/portfolio`'s `vercel.json` (create the file if it doesn't exist):

```json
{
  "rewrites": [
    { "source": "/thulla123-321thulla/:path*", "destination": "https://<thulla-vercel-url>/:path*" }
  ]
}
```

Replace `<thulla-vercel-url>` with the real Vercel URL once Thulla is deployed (step 5 in the setup order below). Redeploy the portfolio project after adding this. No subdomain, no Namecheap change — the two apps stay separate repos; the portfolio just proxies that one path.

## Setup order (see CLAUDE_CHROME_SETUP.md for the full runbook)
1. Run `supabase-schema.sql` in Supabase — *(parallel with 2)*
2. Push the `thulla-online` code to the new GitHub repo — *(parallel with 1)*
3. Import that repo into Vercel as a new project — needs 2
4. Connect Supabase env vars to that Vercel project — needs 1 and 3
5. Deploy, get the live `*.vercel.app` URL — needs 4
6. Add the rewrite rule to the portfolio's `vercel.json` with that URL — needs 5
7. Redeploy the portfolio — needs 6
8. Test end-to-end — needs everything

Enabling email auth in Supabase settings can happen any time after the project is created — parallel with 2 through 5.

## Accounts
- Sign up with **email** (Supabase Auth — email + password)
- After signup, the user picks a **username** (separate from email, unique, this is what other players see)
- Returning users just log in — no re-entering a name each game

## Rooms & players
- Any logged-in user can create a room and gets a 5-character room code
- Friends join from anywhere by entering that code
- v1 ships the classic format: 4 players, 2 fixed teams of 2 (seats opposite each other are partners)
- Player cap is a single config value (`max_players` on the room), not hardcoded through the game logic — so raising it later doesn't require a redesign
- No limit on concurrent rooms

## Game rules (as implemented)
- Standard 52-card deck, dealt evenly (13 each at 4 players)
- Turn-based: must follow the led suit if you hold a card of it
- Can't follow suit → "thulla": throw any card, then pick up the entire pile into your hand, and you lead the next trick
- If everyone follows suit, the highest card of the led suit wins the trick, the pile is discarded, and the winner leads next
- First team where both partners empty their hands wins

## Data model
Full detail in `supabase-schema.sql`. Summary:
- `profiles` — one row per user: id, username, created_at (email lives in Supabase's built-in `auth.users`)
- `rooms` — one row per game: code, host, max_players, JSON game state (players, hands, whose turn, pile, log)

## Out of scope for v1
- Spectators
- In-app chat or voice
- Reconnect handling beyond "just refresh the page"
- Strong anti-cheat — game state is broadcast to everyone in the room, so a technically savvy player could inspect it in dev tools. Fine for playing with friends.

## Open items to confirm
- Whether email needs verification before first login, or a simpler flow is fine
- Exact copy/wording on the sign-up screen
