// Dedicated Website feature module.
// The uploaded project contains only a menu placeholder; implement website
// ordering and delivery workflows here when the product/API requirements exist.
export async function showWebsite(env, chat) {
  const { send, kb, back } = await import("../core.js");
  return send(env, chat, "🌐 Fitur Website sedang disiapkan.", kb([back("menu:home")]));
}
