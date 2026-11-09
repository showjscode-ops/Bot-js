import { handleUpdate } from "./handlers/update.js";
import { adminApi, adminHtml } from "./features/admin.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      const checks = { botToken: !!env.BOT_TOKEN, telegramWebhookSecret: !!env.TELEGRAM_WEBHOOK_SECRET, supabaseUrl: !!env.SUPABASE_URL, supabaseServiceRoleKey: !!env.SUPABASE_SERVICE_ROLE_KEY, cashiApiKey: !!env.CASHI_API_KEY, cashiWebhookSecret: !!env.CASHI_WEBHOOK_SECRET };
      let database = "not_configured";
      if (checks.supabaseUrl && checks.supabaseServiceRoleKey) {
        try { await (await import("./core.js")).db(env, "bot_users?select=telegram_id&limit=1"); database = "connected"; }
        catch (e) { database = "error"; console.error("Health Supabase check failed:", e); }
      }
      const ready = checks.botToken && checks.telegramWebhookSecret && database === "connected";
      return Response.json({ ok: ready, service: "bookkeep-vvip-media-bot", runtime: "cloudflare-workers", checks, database }, { status: ready ? 200 : 503 });
    }
    if (url.pathname === "/webhook" && request.method === "POST") {
      if (!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) return new Response("Unauthorized", {status:401});
      try {
        const update = await request.json();
        await handleUpdate(update, env);
        // Keep private bot chats tidy: remove the user's just-processed message
        // and the old inline-menu message after a callback has been handled.
        const { tg } = await import("./core.js");
        if (update.message?.chat?.type === "private" && update.message?.message_id) {
          try { await tg(env, "deleteMessage", { chat_id: update.message.chat.id, message_id: update.message.message_id }); } catch (e) { console.warn("Incoming message cleanup skipped:", e.message); }
        }
        if (update.callback_query?.message?.chat?.type === "private" && update.callback_query?.message?.message_id) {
          try { await tg(env, "deleteMessage", { chat_id: update.callback_query.message.chat.id, message_id: update.callback_query.message.message_id }); } catch (e) { console.warn("Previous menu cleanup skipped:", e.message); }
        }
        return new Response("ok");
      }
      catch (e) { console.error("Telegram webhook failed:", e); return new Response("error", {status:500}); }
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
