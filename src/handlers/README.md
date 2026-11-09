# Book keep Telegram Bot — Cloudflare Workers + Supabase

## Deploy
1. Run `supabase/schema.sql` in Supabase SQL Editor. It creates the new tables and seeds the four VVIP packages; existing `bot_users` and `force_join` are retained.
2. Cloudflare Worker name: `botbookkeep`; entrypoint: `index.js`.
3. Production variables/secrets:
   - Secret `BOT_TOKEN`
   - Secret `SUPABASE_SERVICE_ROLE_KEY`
   - Variable `SUPABASE_URL` (real Supabase project URL)
   - Secret `TELEGRAM_WEBHOOK_SECRET` (same as Telegram webhook secret_token)
   - Secret `CASHI_API_KEY`
   - Secret `CASHI_WEBHOOK_SECRET` (Cashi HMAC signing secret)
   - Optional `ADMIN_PASSWORD` for legacy browser `/admin`.
4. Deploy. Configure Telegram webhook with URL `https://botbookkeep.showjscode.workers.dev/webhook` and allowed updates `message`, `callback_query`, `pre_checkout_query`, `chat_member`.
5. Configure Cashi webhook URL: `https://botbookkeep.showjscode.workers.dev/cashi/webhook`.

## Telegram
- `/start`: language and main menu.
- Group VIP: package listing, QRIS Cashi, settlement auto-send invite, About, Telegram Stars donation.
- `/admin`: admin panel. Owner ID is fixed at `6665664367`; maximum three additional admin IDs.
- `/upload`: upload photo/video/document/audio/animation, Finish, then configure expiry, required groups, max accesses, allowed user IDs, price and title. Save creates a Telegram deep link.
- `/cancel`: cancel a pending text input.
- Admin can add/edit/deactivate packages, manage admins, coupons and force-join groups.

## Important
- Edit all four seeded invite links in `/admin` → Kelola VVIP before selling. They are placeholder URLs.
- Cashi webhook verifies `x-gateway-signature` as HMAC-SHA256 over raw request body. Confirm this exact signature convention with Cashi merchant dashboard/docs before going live.
- The bot must be admin in each required group/channel to verify membership.
- Telegram Stars invoices use currency `XTR`.
- Draft cancellation deletes the draft record. Telegram does not expose a delete-file method for file IDs already uploaded to Telegram.
- Never expose bot token, Supabase service role key, Cashi API key or webhook secret.


## Modular source layout (refactored)
The runtime entrypoint is `src/index.js`. Feature logic is separated into:
- `src/features/start.js` — start menu and main navigation.
- `src/features/media.js` — media upload, link configuration, access checks and media delivery.
- `src/features/vip.js` — VIP packages, coupons, VIP order creation and VIP fulfillment.
- `src/features/admin.js` — Telegram admin menus and web admin API/page.
- `src/payments/index.js` — shared Cashi QR/order creation and payment status checks; order fulfillment is routed by order prefix (`VIP-` / `MED-`).
- `src/handlers/states.js` — text-input state machine used by the current admin flows.
- `src/handlers/update.js` — Telegram update router.
- `src/core.js` — shared Telegram, Supabase, authorization and state utilities.

### Notes before deployment
- The existing database schema is retained; this refactor does not require a SQL migration.
- `feature:number` and `feature:website` remain "under preparation" placeholders because the uploaded source ZIP did not contain number-selling or website-selling workflows, tables, API contracts, or provider credentials. Their modules should be implemented once those requirements are supplied; they are not silently simulated.
- `ads/` is reserved for a dedicated ad module. No working ad provider or ad placement integration existed in the uploaded ZIP, so no fictitious ad behavior has been added.
- `handleTextState` remains a dispatcher for the existing shared `bot_states` table. Feature-specific states can be extracted further as the number/website/ads flows are implemented.
