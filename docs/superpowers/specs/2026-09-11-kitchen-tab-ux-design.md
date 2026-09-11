# Kitchen Tab UX Improvements — Design

Date: 2026-09-11

## Goal

Improve the Kitchen tab in the mobile app with four changes:
1. Horizontal swipe between the Explore and Manage sub-tabs (standard pager: Explore is the left page, Manage is the right page).
2. Move the "Add to Kitchen" action out of the header into a floating action button (FAB) at the bottom-right; tapping it opens the add form as a bottom sheet modal.
3. Turn off the "running low" flag (a 0.5 kg chicken was showing as low stock because any quantity <= 0.5 is flagged regardless of unit).
4. Add a separate "Enter Leftovers" capability in the Manage view with proper database storage for leftovers.

## 1. Swipe between Explore/Manage (standard pager)

- Replace the `view: 'explore' | 'manage'` boolean + conditional render with a horizontal pager.
- Implementation: RN built-in `ScrollView` with `horizontal`, `pagingEnabled`, `showsHorizontalScrollIndicator={false}`, and a ref. Each page is full-screen-width (`width: '100%'`, page width tracked from `onLayout`).
- Page 0 = Explore, page 1 = Manage. Swipe left navigates Explore → Manage; swipe right navigates Manage → Explore (standard pager).
- Keep the tab control at the top (Explore | Manage). Tab taps call `scrollTo({ x: pageIndex * pageWidth })`. Page changes are captured via `onMomentumScrollEnd`, which updates the active tab styling and the `view` state (used to gate the FAB visibility).
- No new native dependency (`react-native-gesture-handler` is not installed; a paging `ScrollView` needs none).

## 2. Floating Action Button + bottom sheet form

- Remove the `Add` button from the header actions.
- Add a circular FAB (`+`) absolutely positioned at `bottom: 24, right: 24`, visible only when the Manage page is active.
- Tapping the FAB opens the add form as a bottom sheet: a `Modal` with a transparent backdrop, bottom-anchored rounded panel, animated slide-up entry.
- The bottom sheet contains a segmented toggle: **Pantry item** | **Leftover dish**.
  - **Pantry item** fields: name, qty, unit (current behavior).
  - **Leftover dish** fields: dish name, servings, units (e.g. portions), notes, made date (free text: "today", "yesterday"), optional expiry.
- Submit calls `upsertKitchenItem` with `kind` and the extra fields; success closes the sheet and reloads the dashboard.

## 3. Turn off "running low"

- `pantry.service.ts`: remove `LOW_STOCK_THRESHOLD`; set `isLowStock` to always `false` in both `getPantry` mapping and `toPantryItem`.
- Remove the "Low stock" branch from `generateSuggestedUses`.
- `kitchen-intelligence.service.ts`: remove the `low_stock` signal block from `generateSignals`.
- Keep the `isLowStock: boolean` field in shared types so the API shape stays stable (always `false`).

## 4. Leftovers storage + entry section

### Database (pantries table, auto-migrated via `sequelize.sync({ alter: true })`)

| Column         | Type               | Notes                                    |
|----------------|--------------------|------------------------------------------|
| `kind`         | STRING(20)         | `'pantry'` or `'leftover'`, default `'pantry'`, not null |
| `dishName`     | STRING(255)        | nullable; set for leftovers              |
| `servings`     | INTEGER            | nullable; servings remaining for leftovers |
| `notes`        | TEXT               | nullable; freeform                      |
| `madeAt`       | DATE               | nullable; when the dish was made         |

- For leftover rows, `ingredient_name` stores the dish name too (mirrors `dishName`) so the existing unique index on `(user_id, ingredient_name)` keeps leftovers addressable by name and existing signals/intelligence still read `ingredientName`.
- `quantity`/`unit` stay nullable; leftovers primarily use `servings`.

### Shared types

- `PantryItem`: add `kind: 'pantry' | 'leftover'`; optional `dishName`, `servings`, `notes`, `madeAt`.
- `PantryUpsertRequest`: add `kind?`, `dishName?`, `servings?`, `notes?`, `madeAt?`.

### Backend behavior

- `pantry.service.upsertItem`:
  - Resolves the row name: `kind === 'leftover' && dishName` → use `dishName`, else `ingredientName`.
  - Stores `kind`, `dishName`, `servings`, `notes`, `madeAt` (updates existing row if fields provided).
- `markUsed` (POST `/api/v1/pantry/:id/use`): for `kind === 'leftover'`, decrement `servings` instead of `quantity`; when remaining servings would drop below 1, delete the row.
- `kitchen-intelligence.toKitchenItem`: if `kind === 'leftover'`, force `state = 'leftover'` with `stateReason` derived from `madeAt` (falling back to `addedAt`); `stats.leftoverCount` counts `kind === 'leftover'` items.
- `pantry.routes.ts` upsert validation: add optional `kind` enum, `dishName`, `servings` (int >= 1), `notes`, `madeAt` (ISO datetime).

### Mobile UI (Manage view)

- Manage view splits into two sections:
  - **Leftovers** (shown only when leftovers exist): cards show dish name, servings remaining, made/when, purple left-accent (`STATE_COLORS.leftover`). Tap = mark used (decrements servings), long press = delete.
  - **Pantry items**: the existing list/cards, unchanged.
- `KitchenItem` interface in `kitchen.api.ts` gains `kind`, `dishName`, `servings`, `notes`, `madeAt`.

## Out of scope

- Restoring the low-stock feature (removed per request).
- Separate leftovers API/tables (leftovers live in the `pantries` table with a `kind` discriminator).
- Native gesture-handler dependency / native rebuilds.

## Testing

- Backend: unit tests for `upsertItem` with `kind='leftover'` (persists new columns, updates existing), `markUsed` servings decrement/delete for leftovers, low-stock always `false`, kitchen-intelligence leftover state mapping, `low_stock` signal removed.
- Mobile: TypeScript typecheck and lint must pass.
- Manual QA on emulator once RedBox/connection issue is resolved.