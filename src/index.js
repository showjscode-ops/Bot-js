import { handleUpdate } from "./handlers/update.js";
import { adminApi, adminHtml } from "./features/admin.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/webhook" && request.method === "POST") {
      if (!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) return new Response("Unauthorized", {status:401});
      try { await handleUpdate(await request.json(), env); return new Response("ok"); }
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
    return new Response("Book keep Telegram bot is running.");
  }
};
