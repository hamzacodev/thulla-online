# Thulla (Thulla) Online — Spec

A web version of the Pakistani card game **Thulla**, also called **Thulla**.
Play against the computer on your own, or with friends anywhere. Free.

Live: https://thulla-online.vercel.app

## Stack
- Next.js 16 (App Router, TypeScript) + Tailwind v4
- Supabase — Postgres + Auth (email) + Realtime
- Vercel — Hobby tier
- No dedicated game server: single-player runs in the browser, and online
  rooms sync through Supabase Realtime.

## Game rules (as implemented)

Standard 52-card deck, **2–8 players**, every card dealt out. With counts
that don't divide 52 evenly, the earlier seats get one extra card — the same
thing that happens dealing round a real table.

1. **The Ace of Spades starts.** Whoever is dealt it leads the first trick
   and must lead the A♠ itself. This is derived from the deal, not a random
   pick.
2. **Follow suit if you can.** Play goes clockwise.
3. **Everyone follows → highest card of the led suit wins the trick**, and
   the whole pile is discarded from the game. The winner leads next.
4. **The opening trick is a free round** — being void in spades there is
   not a thulla, play simply continues and the highest spade takes it.
5. **After that, someone can't follow (the thulla) → the trick ends immediately**, and
   the player holding the **highest card of the led suit** picks up the
   entire pile. They lead next.
6. Empty your hand and you are **out, safe**. Play continues without you.
7. The last player still holding cards is the **Thulla**.

There are no teams — it's every player for themselves.

## Architecture

Game rules live in `lib/engine/` and know nothing about React, the network,
or the database:

- `cards.ts` — deck, shuffling (seedable), rank/suit helpers
- `types.ts` — `GameState` and friends
- `rules.ts` — `createGame`, `legalMoves`, `applyPlay`, `resolveTrick`
- `ai.ts` — CPU decision making at three difficulties

Everything else renders that state or transports it:

- `lib/useLocalGame.ts` — drives a single-player game (CPU turns, pacing)
- `lib/useVoice.ts` — the WebRTC mesh behind voice chat
- `lib/avatars.ts` — cropping and uploading a profile picture
- `app/api/*` — online rooms; the server is the authority and re-validates
  every move through the same `applyPlay`
- `components/GameTable.tsx` — one table renderer for both modes

`applyPlay` deliberately does not clear the table — it moves the game to a
`trickEnd` phase and `resolveTrick` finishes the job. That gives the UI a
place to show who won a trick or who is about to eat the pile, and it keeps
online and offline timing identical.

## Voice chat

Online rooms can talk. Audio is peer-to-peer over WebRTC — the same bargain
the rest of the app makes: there is no game server, so there is no media
server either. Supabase Realtime carries only the signalling (offers,
answers, ICE candidates) and a presence roster of who is on the call.

- **A full mesh**, which is the right shape for 2–8 players: each browser
  holds at most seven connections of one mono audio track, and nobody's
  voice waits on a relay to be forwarded.
- **One side offers, and it's always the same side** — the two user ids are
  compared, so both browsers reach the same answer with no extra round trip
  and no offer collision to resolve.
- **Only seated players are dialled in.** Signals from anyone not holding a
  seat are dropped, so knowing the room code isn't enough to listen in.
- **Joining is always a tap.** The microphone is never opened on page load,
  and it's released the moment you leave the call, the room, or the tab.
- Mute your own mic, mute anyone else just for yourself, or turn the whole
  feature off in Settings.
- STUN alone connects on ordinary home and mobile networks. Behind a
  symmetric NAT nothing but a relay will do, so `NEXT_PUBLIC_TURN_URL`
  (with username and credential) adds one if you want it.

## Profile pictures

A face for every name at the table, so eight usernames read as eight
people. Pictures are centre-cropped and re-encoded to a 256px JPEG **in the
browser** before upload — a few kilobytes each instead of phone-camera
originals, and being redrawn strips the EXIF (including any GPS tag) on the
way. They go straight to Supabase Storage, into a folder named after the
uploader, which is the only folder that key may write to. Without a picture
a player gets their initials on a colour derived from their name, which is
deterministic, so they look the same on everyone's screen.

## Statistics

Every **completed** game writes one row to `game_results`. Abandoned games
write nothing, so they can't affect a record.

- Idempotent on `(owner_id, game_id)` — refreshing the results screen, a
  re-render, or a retry can never double-count.
- Aggregates (totals, win rate, current and best streaks) are computed in
  Postgres by `get_player_stats()`; the client never downloads a full
  history to show one number.
- Online results are written server-side from the room's own state. Browsers
  have no insert policy on `game_results`, so a client cannot fabricate wins.
- Single-player results are submitted by the client (the game runs there) but
  are validated server-side for internal consistency before being stored.
- Signed-out players get the same dashboard backed by `localStorage`.

## Testing

- `npm run simulate` — plays 6,300 CPU-vs-CPU games across every player
  count and difficulty, asserting no stuck games, no illegal moves, a correct
  Ace opener, 52 unique cards dealt, and exactly one Thulla.
- `npm run ai-benchmark` — head-to-head difficulty comparison.
- `npm run stats-test` — statistics and streak arithmetic.

## Setup

1. Run `supabase-schema.sql` in the Supabase SQL editor (safe to re-run),
   then `supabase-verify.sql` to confirm every object landed.
2. In Supabase → Authentication → URL Configuration, set **Site URL** to the
   deployed URL and add both it and `http://localhost:3000/**` to **Redirect
   URLs**, so confirmation and password-reset emails land in the right place.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` in the Vercel project. `NEXT_PUBLIC_TURN_URL`,
   `NEXT_PUBLIC_TURN_USERNAME` and `NEXT_PUBLIC_TURN_CREDENTIAL` are
   optional, and only matter for voice chat on networks STUN can't punch
   through.

## Out of scope for now
- Spectators, in-app text chat
- CPU players inside online rooms
- Leaderboards and head-to-head records — the `players` JSON on every result
  row already carries what these need, so they don't require a migration.
