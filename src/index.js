import { handleUpdate } from "./handlers/update.js";
import { adminApi, adminHtml } from "./features/admin.js";

export default {
  async scheduled(controller, env, ctx) {
    const { cleanupExpiredMedia } = await import("./features/media.js");
    ctx.waitUntil(cleanupExpiredMedia(env));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      const { supabaseConfig } = await import("./core.js");
      const sb = supabaseConfig(env);
      const checks = { botToken: !!env.BOT_TOKEN, telegramWebhookSecret: !!env.TELEGRAM_WEBHOOK_SECRET, supabaseUrl: !!sb.url, supabaseServiceRoleKey: !!sb.key, cashiApiKey: !!env.CASHI_API_KEY, cashiWebhookSecret: !!env.CASHI_WEBHOOK_SECRET };
      let database = "not_configured";
      if (checks.supabaseUrl && checks.supabaseServiceRoleKey) {
        try { await (await import("./core.js")).db(env, "bot_users?select=telegram_id&limit=1"); database = "connected"; }
        catch (e) { database = "error"; console.error("Health Supabase check failed:", e); }
      }
      const ready = checks.botToken && checks.telegramWebhookSecret && database === "connected";
      return Response.json({ ok: ready, service: "bookkeep-vvip-media-bot", runtime: "cloudflare-workers", checks, missingSecrets: [...(!checks.botToken?["BOT_TOKEN"]:[]),...(!checks.telegramWebhookSecret?["TELEGRAM_WEBHOOK_SECRET"]:[]),...sb.missing], database, hint: sb.missing.length ? `Tambahkan secret ${sb.missing.join(" dan ")} di Cloudflare Workers > Settings > Variables and Secrets.` : undefined }, { status: ready ? 200 : 503 });
    }
    if (url.pathname === "/webhook" && request.method === "POST") {
      if (!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) return new Response("Unauthorized", {status:401});
      let update;
      try {
        update = await request.json();
      } catch (e) {
        console.error("Invalid Telegram webhook JSON:", e);
        return new Response("Bad Request", {status:400});
      }

      // Acknowledge Telegram callback queries before any database/network work.
      // This prevents Telegram's short callback deadline from expiring while a menu loads.
      if (update.callback_query?.id) {
        try {
          const { tg } = await import("./core.js");
          await tg(env, "answerCallbackQuery", { callback_query_id: update.callback_query.id });
        } catch (e) {
          // A callback can already be expired (for example, a delayed/retried update).
          // Never fail the webhook solely because its transient toast can no longer be shown.
          console.warn("Callback acknowledgement skipped:", e.message);
        }
      }

      const task = (async () => {
        try {
          await handleUpdate(update, env, ctx);
          // Keep private bot chats tidy after processing.
          if (update.message?.chat?.type === "private" && update.message?.message_id) {
            const { tg, stateGet } = await import("./core.js");
            const st = await stateGet(env, update.message.from.id);
            if (st?.state !== "broadcast_processing") {
              try { await tg(env, "deleteMessage", { chat_id: update.message.chat.id, message_id: update.message.message_id }); }
              catch (e) { console.warn("Incoming message cleanup skipped:", e.message); }
            }
          }
        } catch (e) {
          console.error("Telegram update processing failed:", e);
          try {
            const { send } = await import("./core.js");
            const q = update.callback_query, msg = update.message;
            const target = q?.message?.chat?.id || q?.from?.id || msg?.chat?.id;
            if (target) await send(env, target, `❌ Proses gagal: ${String(e.message || "Silakan coba lagi").slice(0, 180)}`);
          } catch (notifyError) {
            console.error("Could not notify Telegram user:", notifyError);
          }
        }
      })();

      // Return HTTP 200 immediately so Telegram does not retry an already accepted update.
      // Cloudflare keeps the processing task alive through waitUntil.
      if (ctx?.waitUntil) {
        ctx.waitUntil(task);
        return new Response("ok");
      }
      await task;
      return new Response("ok");
    }
    if (url.pathname === "/cashi/webhook" && request.method === "POST") {
      try {
        const raw = await request.text();
        if (!env.CASHI_WEBHOOK_SECRET) return new Response("Webhook secret missing",{status:503});
        const sig = request.headers.get("x-gateway-signature") || "";
        const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(env.CASHI_WEBHOOK_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
        const digest = await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw));
        const expected = [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
        const { safeEqual } = await import("./core.js");
        if (!safeEqual(sig.toLowerCase(),expected)) return new Response("Invalid signature",{status:401});
        const event = JSON.parse(raw);
        if (event.event === "PAYMENT_SETTLED" && event.data?.status === "SETTLED") {
          const { settleOrder } = await import("./features/vip.js");
          const { settleMediaOrder } = await import("./features/media.js");
          const orderId = event.data.order_id;
          if (orderId?.startsWith("VIP-")) await settleOrder(env,orderId,event.data);
          else if (orderId?.startsWith("MED-")) await settleMediaOrder(env,orderId);
        }
        return new Response("OK");
      } catch(e) { console.error("Cashi webhook failed:",e); return new Response("error",{status:500}); }
    }
    if (url.pathname === "/admin" && request.method === "GET") {
      const { authorized } = await import("./core.js");
      if (!authorized(request,env)) return new Response("Unauthorized",{status:401,headers:{"WWW-Authenticate":"Basic realm=Bot Admin"}});
      return new Response(adminHtml(),{headers:{"content-type":"text/html; charset=utf-8"}});
    }
    if (url.pathname.startsWith("/api/admin/")) {
      const { authorized } = await import("./core.js");
      if (!authorized(request,env)) return new Response("Unauthorized",{status:401});
      return adminApi(request,env,url);
    }
    if (url.pathname === "/webhook" && request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
    return new Response("Book keep Telegram bot is running. Check /health for deployment diagnostics.");
  }
};
