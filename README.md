# Telegram Bot — Cloudflare Workers + Supabase

Starter MVP bilingual bot (Indonesia/English), force join manager, and simple admin panel.

## 1. Supabase
1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql`.
3. Copy Project URL and `service_role` key from Project Settings → API. Keep the service role key secret.

## 2. Telegram
1. Create bot with @BotFather and copy the bot token.
2. Add the bot as **administrator** to every group/channel in force join. It needs permission to see membership updates.
3. For each channel/group, obtain its numeric chat ID (usually starts with `-100`). The invite link and chat ID are both required.

## 3. Cloudflare Worker
Install Node.js, then:
```bash
npm install
npx wrangler login
npx wrangler secret put BOT_TOKEN
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```
Set `SUPABASE_URL` in `wrangler.toml`, then:
```bash
npm run deploy
```
Use the deployed Worker URL as `WORKER_URL`.

## 4. Set webhook
Set webhook with Telegram's secret-token protection. Use a random secret of 1–256 characters containing only letters, digits, `_`, or `-`, and save the same value as the Cloudflare Worker secret `TELEGRAM_WEBHOOK_SECRET`:

`https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=<WORKER_URL>/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>&allowed_updates=%5B%22message%22,%22callback_query%22,%22chat_member%22%5D`

For `chat_member` updates Telegram requires the bot to be administrator in the relevant chats. Users can also press the Verify button.

## 5. Admin panel
Open `https://<worker-subdomain>.workers.dev/admin`. Browser asks for Basic Auth:
- Username: `admin`
- Password: value of `ADMIN_PASSWORD`

Add each required group/channel with display name, invite link, and chat ID. Edit and delete are supported.

## 6. GitHub automatic deployment
Create a GitHub repository and push this project to branch `main`. In repository Settings → Secrets and variables → Actions add:
- `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit permission)
- `CLOUDFLARE_ACCOUNT_ID`

Push to `main` to deploy. Also configure `SUPABASE_URL` in `wrangler.toml`. Add Worker secrets in Cloudflare dashboard (or deploy them once with Wrangler): `BOT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, and `TELEGRAM_WEBHOOK_SECRET`. GitHub workflow deploys code, not secret values.

In Cloudflare Workers Builds, set the project root directory to `/` (repository root). Leave the build command empty; the deploy command is `npx wrangler deploy`. The Worker entry point is the root-level `index.js` so it does not depend on the `src/` folder being included in a deployment upload.

## Current scope
- `/start` → language selection.
- Language selection is replaced by force-join prompt.
- Membership verification → personalized welcome and four feature buttons.
- Force join list can be added, renamed/edited, and deleted in `/admin`.
- Feature buttons currently show a placeholder response, ready for later modules.

## Important
- This is a starter implementation. Test with a private test channel first.
- Force join requires bot admin access in each chat and a valid numeric `chat_id`.
- Protect `/admin` with a strong password and do not publish service-role keys or bot token.
