# Claude in Chrome — Thulla Setup Runbook

Give this file to Claude in Chrome to handle the click-through setup. Anywhere it needs a password, payment detail, or other credential entered, Claude in Chrome stops and lets Hamza do that one step manually, then continues.

Supabase is already connected to Hamza's GitHub account — no need to set that connection up.

## Run order

**Can run in parallel:** Steps 1 and 2. Neither depends on the other.
**Then serial:** 3 → 4 → 5 → 6 → 7, each depends on the one before it.
**Anytime, in parallel with 2–5:** Step 8 (enable email auth).
**Last:** Step 9, after everything else is done.

---

### 1. Run the database schema
1. Go to supabase.com/dashboard → "New project"
2. Name: `thulla-online`. Pick a region close to most players. Free tier. Database password: Hamza enters this manually.
3. Once provisioned, open the SQL Editor → paste the full contents of `supabase-schema.sql` → run it.
4. Confirm `profiles` and `rooms` tables now show up under Table Editor.

### 2. Push the code to GitHub
1. Create a new repo: `github.com/hamzacodev/thulla-online`.
2. Push the `thulla-online` project folder to it.

### 3. Import into Vercel
1. In Vercel: "Add New Project" → import `hamzacodev/thulla-online`.
2. Don't deploy yet if env vars aren't set — Vercel will prompt for them, or they can be added right after in Project Settings.

### 4. Connect Supabase env vars
1. Project Settings → API in Supabase → copy Project URL, `anon` public key, `service_role` key.
2. In the Vercel project (Thulla): Settings → Environment Variables → add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
3. The `service_role` key is secret — only ever goes into Vercel's environment variables, nowhere else.
   - If the Supabase↔Vercel marketplace integration is installed and linked to this project, these three may already be populated automatically — check before pasting.

### 5. Deploy Thulla
1. Trigger the deploy in Vercel.
2. Confirm it loads correctly at its `*.vercel.app` URL.
3. Note that URL — it's needed in step 6.

### 6. Wire it into the portfolio
1. Open `github.com/hamzacodev/portfolio`.
2. Add or update `vercel.json` with the rewrite rule from `PROJECT_SPEC.md`, using the real `*.vercel.app` URL from step 5.

### 7. Redeploy the portfolio
1. Push the `vercel.json` change, or trigger a redeploy in Vercel for the portfolio project.
2. Visit `hamzashakoor.com/thulla123-321thulla` and confirm the game loads.

### 8. Enable email auth (parallel with 2–5)
1. Supabase → Authentication → Providers → confirm "Email" is on.
2. Decide: require email confirmation before login, or allow a simpler flow. Flag this choice back to Hamza if unset.

### 9. Sanity check (last)
1. Sign up with a real email, confirm a profile row gets created in Supabase.
2. Create a room, join it from a second browser profile or incognito window with a second account.
3. Play a few cards, confirm both sessions update live.

## Boundaries for this run
- Never enter Hamza's Supabase, GitHub, Vercel, or Namecheap passwords — pause and ask him to log in.
- Never paste the `service_role` key anywhere other than Vercel's environment variables.
- If any step fails or looks different from what's described here, stop and report back rather than improvising around it.
