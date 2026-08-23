# Meal Rescue - Judge Demo Script (Shipaton 2026)

Total runtime: ~4 minutes. Every step below is verified working on the
current build. Run order matters: backend first, then app, then the
monetization beats that make this a RevenueCat story.

## 0. Boot checklist (before judges arrive)

1. Embedded Postgres up (port 5433):
   `Start-Process node -ArgumentList "$env:TEMP\opencode\pg-verify\boot-pg.cjs"`
2. Backend dev server on port 3010:
   `npm run dev --workspace @meal-rescue/backend` (Start-Process detached;
   never let a shell timeout kill it).
3. Android emulator running; app installed via `expo run:android` from
   apps/mobile (dev build only - Expo Go is broken by design here).
4. OpenRouter account has credit (GLM-5.2 is live; heuristic fallback
   covers zero-credit silently - demo still works either way).
5. Optional env flags (all degrade gracefully when empty):
   `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, `EXPO_PUBLIC_ONESIGNAL_APP_ID`,
   backend `ONESIGNAL_REST_KEY`/`ONESIGNAL_APP_ID`.

## 1. The problem and the rescue loop (60s)

- Sign in as `judge@mealrescue.app` / `Demo1234!` (or register fresh).
- Capture tab: type "leftover rice and chicken from yesterday" -> Analyze.
  GLM extracts real ingredients with confidence scores.
- Review screen: confirm detection, tap "5 minutes" + "No cooking" chips.
- Rescue: ONE recommendation plus at most TWO alternatives. Read the
  "why" explanation out loud - this is GLM ranking, deterministic engine
  deciding, exactly as our architecture doc promises.
- Tap "I don't have these": pipeline re-runs avoiding those ingredients.
- Rescue my meal -> feedback (Better / Same / Not for me). Mention this
  feeds preference learning visible later in Profile.

## 2. The monetization story (90s) - why we win the HAMM

- Rescue three more meals quickly. The fourth attempt hits the server's
  free limit: HTTP 429 DAILY_RESCUE_LIMIT -> Rescue Fuel sheet slides up.
- Beat 1 (Rescue Fuel): "Watch a short ad" -> simulated rewarded ad ->
  server verifies the transaction id against its idempotent ledger ->
  +2 rescues appear instantly. Retry works. Say: "server-authoritative,
  replay-proof, capped at two ads per day".
- Beat 2 (Pro Pass): "Try Pro free for 1 hour" -> rewarded ad ->
  temporary Pro entitlement, no card, honest copy. Profile now shows
  "Pro (temporary)".
- Beat 3 (Paywall): Upgrade to Pro -> paywall with live RevenueCat
  offerings (static pricing in dev). Restore purchases link present.
  Say: "subscribers NEVER see another ad surface - enforced in code,
  not just policy."
- Beat 4 (Staples Shelf): run one more rescue; sponsored staple chips
  under the recommendation -> clearly-labeled Sponsored card.

## 3. The engagement story (45s) - Keep Them Coming Back

- Fridge Negotiator: list what is actually in your fridge -> real meal.
- Leftover Alchemist: transform leftovers with state tracking.
- Pantry: add an item expiring tomorrow -> mention Spoiler Alert scans
  pantries daily and nudges before food dies.
- Rescue Windows: the scheduler learns each user's median mealtime and
  sends ONE push per day max, in their local window, respecting quiet
  hours (22:00-08:00 default), deduplicated by ledger, written by GLM
  with template fallback, snoozable for up to 72 hours.
- Permission ask happens AFTER the first successful rescue - never at
  launch.

## 4. Close (15s)

- "Meal Rescue turns 'there is nothing to eat' into a habit-forming
  rescue loop, monetized without ever charging the moment of need."
- Hand off to tech-architecture appendix if asked: docs/superpowers/
  plans/2026-08-23-shipaton-revenuecat-onesignal.md

## Known demo-safety notes

- All AI calls fall back deterministically offline; nothing white-screens.
- Ad surfaces are simulated locally; swapping in AdMob unit ids activates
  real rewarded ads without UI changes.
- If the emulator is cold: boot it, then `cd apps/mobile; npx expo run:android`.
