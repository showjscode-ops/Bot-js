// Dedicated Buy Number feature module.
// The uploaded project contains only a menu placeholder; implement provider/API
// workflows here when the number provider contract and credentials are supplied.
export async function showBuyNumber(env, chat) {
  const { send, kb, back } = await import("../core.js");
  return send(env, chat, "📱 Fitur Beli Nomor sedang disiapkan.", kb([back("menu:home")]));
}
