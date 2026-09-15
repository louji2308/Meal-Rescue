# Push Notification Test Script

Manual test script for OneSignal push notifications in Meal Rescue.

## Setup

### Prerequisites

- Node.js 18+ (for native `fetch`)
- Backend server running on `http://localhost:3000`
- OneSignal credentials configured in `apps/backend/.env`:
  ```
  ONESIGNAL_REST_KEY=your_rest_api_key
  ONESIGNAL_APP_ID=your_app_id
  ```
- A valid auth token (JWT)

### Getting an Auth Token

1. Log in via the app or use the auth endpoint:
   ```bash
   curl -X POST http://localhost:3000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"you@example.com","password":"yourpassword"}'
   ```
2. Copy the `token` from the response.

### Environment Variables

| Variable     | Required | Default               | Description               |
|--------------|----------|-----------------------|---------------------------|
| `AUTH_TOKEN` | Yes      | —                     | JWT auth token            |
| `BASE_URL`   | No       | `http://localhost:3000` | Backend server URL      |

## Usage

### Quick Test (Predefined Payloads)

```bash
# Rescue Window notification
npx tsx scripts/test-push.ts --type rescue --user <user-uuid>

# Spoiler Alert notification
npx tsx scripts/test-push.ts --type spoiler --user <user-uuid>

# Pick For Me notification
npx tsx scripts/test-push.ts --type pick --user <user-uuid>
```

### Custom Payload

```bash
npx tsx scripts/test-push.ts \
  --user <user-uuid> \
  --title "Custom title" \
  --body "Custom body"
```

### With Environment Variable

```bash
AUTH_TOKEN=your_token npx tsx scripts/test-push.ts --type rescue --user <uuid>
```

### All Options

```
--user, -u <uuid>       User ID to send the push to
--title, -t <string>    Notification title
--body, -b <string>     Notification body
--type <rescue|spoiler|pick>  Use a predefined test payload
--auth <token>          Auth token (or set AUTH_TOKEN env var)
--base-url <url>        Backend URL (default: http://localhost:3000)
-h, --help              Show help
```

## Predefined Payloads

### Rescue Window (`--type rescue`)

| Field    | Value                                     |
|----------|-------------------------------------------|
| title    | Time to rescue your meal!                 |
| body     | Your leftovers need saving tonight.       |
| buttons  | "Make it" / "Later"                       |
| deepLink | `mealrescue://rescue`                     |

### Spoiler Alert (`--type spoiler`)

| Field    | Value                                     |
|----------|-------------------------------------------|
| title    | Use it soon!                              |
| body     | Your milk expires tomorrow.               |
| deepLink | `mealrescue://pantry`                     |

### Pick For Me (`--type pick`)

| Field    | Value                                              |
|----------|----------------------------------------------------|
| title    | Tonight's pick                                     |
| body     | How about pasta aglio e olio?                      |
| buttons  | "Make it" / "Not tonight"                          |
| deepLink | `mealrescue://rescue?dish=pasta%20aglio%20e%20olio` |

## Verification Checklist

### Rescue Window

1. Push notification appears in device notification drawer
2. Title shows: "Time to rescue your meal!"
3. Body shows: "Your leftovers need saving tonight."
4. Tap "Make it" — app opens to the rescue flow
5. Tap "Later" — app opens with snooze action
6. Deep link `mealrescue://rescue` opens the rescue screen

### Spoiler Alert

1. Push notification appears in device notification drawer
2. Title shows: "Use it soon!"
3. Body shows: "Your milk expires tomorrow."
4. Tap the notification — app opens to the pantry
5. Deep link `mealrescue://pantry` opens the pantry screen

### Pick For Me

1. Push notification appears in device notification drawer
2. Title shows: "Tonight's pick"
3. Body shows: "How about pasta aglio e olio?"
4. Tap "Make it" — app opens the rescue flow for the dish
5. Tap "Not tonight" — app dismisses and suppresses future picks
6. Deep link includes the dish query parameter

## Testing Deep Links

### Android

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "mealrescue://rescue" com.mealrescue
```

### iOS Simulator

```bash
xcrun simctl openurl booted "mealrescue://rescue"
```

### iOS Device

Open Safari and navigate to:
```
mealrescue://rescue
```

## Testing Buttons

Button actions are handled by the mobile app's notification handler:

1. **"Make it"** — should navigate to the rescue/meal screen
2. **"Later"** — should trigger a snooze (rescue window) or dismiss (pick for me)
3. **"Not tonight"** — should suppress further pick_for_me pushes for the day

Verify the button tap navigates to the correct screen and that the action
is logged in the backend notification ledger.

## Troubleshooting

### "Push failed" or HTTP 401/403

- Auth token may be expired — log in again to get a fresh token
- Ensure `AUTH_TOKEN` is set or pass `--auth <token>`

### "User not found"

- Double-check the UUID format (must be a valid v4 UUID)
- Ensure the user exists in the database

### "Push sent" but no notification on device

- **OneSignal credentials missing**: Check `ONESIGNAL_REST_KEY` and `ONESIGNAL_APP_ID` in `.env`
- **Dry-run mode**: Without credentials, the server logs the push but doesn't send it (outcome: `dry_run`)
- **Quiet hours**: The user may have quiet hours enabled (default 22:00–08:00)
- **Deduplication**: The server deduplicates pushes per user per day — try a different user or wait until tomorrow
- **App not installed/registered**: Ensure the app is installed and the user has granted push permissions
- **Snooze active**: The user may have a snooze suppression active

### Notification arrives but buttons don't work

- Check that the app's notification handler is registered for the action IDs
- Verify the `buttons` array is in the correct format: `[{ "id": "...", "text": "..." }]`

### Deep link doesn't open the right screen

- Verify the deep link scheme (`mealrescue://`) is registered in the app's manifest/plist
- Check that the deep link path matches the app's navigation config
- Test the deep link directly using the adb/simctl commands above

### Server not responding

- Ensure the backend is running: `npm run dev` in `apps/backend`
- Check the server is listening on the expected port (default 3000)
- Use `--base-url` to point to a different server instance
