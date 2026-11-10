import { OWNER_ID, tg, db, send, user, isVip, stateSet, stateGet, stateClear, slug, enc, one, kb, back, clean } from "../core.js";
import { cashiCreate, sendCashiQr } from "../payments/index.js";

const rupiah = n => `Rp${Number(n || 0).toLocaleString("id-ID")}`;
const BOT_USERNAME = async env => {
  if (env.BOT_USERNAME) return String(env.BOT_USERNAME).replace(/^@/, "");
  try { const x = await tg(env, "getMe", {}); return x.result?.username || ""; } catch { return ""; }
};

export async function latestDraft(env, adminId) {
  return one(env, `media_drafts?admin_id=eq.${adminId}&status=eq.DRAFT&select=*&order=created_at.desc`);
}
export async function updateDraftConfig(env, draftId, patch) {
  const d = await one(env, `media_drafts?id=eq.${enc(draftId)}&select=*`);
  if (!d) throw new Error("Draft upload tidak ditemukan.");
  const config = { ...(d.config || {}), ...patch };
  await db(env, `media_drafts?id=eq.${enc(draftId)}`, { method: "PATCH", body: JSON.stringify({ config }) });
  return config;
}
export function extractMedia(msg) {
  if (msg.photo?.length) return { type: "photo", file_id: msg.photo[msg.photo.length - 1].file_id, file_unique_id: msg.photo[msg.photo.length - 1].file_unique_id, message_id: msg.message_id, chat_id: msg.chat.id, caption: msg.caption || "" };
  for (const type of ["video", "document", "animation", "audio", "voice", "video_note"]) {
    if (msg[type]?.file_id) return { type, file_id: msg[type].file_id, file_unique_id: msg[type].file_unique_id, message_id: msg.message_id, chat_id: msg.chat.id, caption: msg.caption || "" };
  }
  return null;
}
export async function beginUpload(env, chat, adminId) {
  const existing = await latestDraft(env, adminId);
  if (existing) await db(env, `media_drafts?id=eq.${enc(existing.id)}`, { method: "DELETE" });
  const id = crypto.randomUUID();
  await db(env, "media_drafts", { method: "POST", body: JSON.stringify({ id, admin_id: adminId, status: "DRAFT", stage: "collect", media: [], config: { title: "", price: 0, direct_price: 0, expires_minutes: null, max_access: null, required_groups: [], allowed_users: [] } }) });
  await send(env, chat, "📤 <b>Upload media baru</b>\n\nKirim foto/video/dokumen satu per satu. Setelah selesai, tekan Panel Tugas untuk mengatur judul dan harga akses langsung.\n\nHarga media gratis tetap bisa diberi harga Langsung Akses.", kb([[{ text: "📋 Panel Tugas", callback_data: "upload:finish" }], [{ text: "❌ Batal", callback_data: "upload:cancel" }]]));
}
export async function saveIncomingMedia(env, msg) {
  const d = await latestDraft(env, msg.from.id);
  if (!d || d.stage !== "collect") return false;
  const item = extractMedia(msg);
  if (!item) return false;
  const media = Array.isArray(d.media) ? d.media : [];
  media.push(item);
  await db(env, `media_drafts?id=eq.${enc(d.id)}`, { method: "PATCH", body: JSON.stringify({ media }) });
  await send(env, msg.chat.id, `✅ Media ke-${media.length} diterima.`, kb([[{ text: "➕ Kirim media lagi", callback_data: "upload:continue" }, { text: "📋 Panel Tugas", callback_data: "upload:finish" }], [{ text: "❌ Batal", callback_data: "upload:cancel" }]]));
  return true;
}
export async function finishUpload(env, chat, adminId) {
  const d = await latestDraft(env, adminId);
  if (!d || !d.media?.length) return send(env, chat, "⚠️ Belum ada media yang diunggah. Kirim media terlebih dahulu.");
  if (!d.config?.title) {
    await stateSet(env, adminId, "media_title");
    return send(env, chat, `📋 Total ${d.media.length} media diterima.\n\nKirim judul/tugas media ini:`, kb([[{ text: "❌ Batal", callback_data: "upload:cancel" }]]));
  }
  await db(env, `media_drafts?id=eq.${enc(d.id)}`, { method: "PATCH", body: JSON.stringify({ stage: "ready" }) });
  return mediaConfig(env, chat, d.id);
}
export async function mediaConfig(env, chat, draftId) {
  const d = await one(env, `media_drafts?id=eq.${enc(draftId)}&select=*`);
  if (!d) return send(env, chat, "Draft tidak ditemukan.");
  const c = d.config || {};
  const groups = c.required_groups || [];
  const allow = c.allowed_users || [];
  return send(env, chat, `📋 <b>Panel Tugas Media</b>\n\n<b>Judul:</b> ${clean(c.title || "Belum diatur")}\n<b>Jumlah media:</b> ${d.media?.length || 0}\n<b>Mode share unlock:</b> 3 pengguna baru\n<b>Harga Langsung Akses:</b> ${rupiah(c.direct_price)}\n<b>Wajib join:</b> ${groups.length} grup\n<b>Pengguna khusus:</b> ${allow.length}\n<b>Hapus otomatis:</b> ${c.expires_minutes ? `${c.expires_minutes} menit` : "Tidak"}\n<b>Batas akses:</b> ${c.max_access || "Tanpa batas"}\n\nAtur harga Langsung Akses secara terpisah. Media bisa tetap berlabel gratis tetapi pengguna dapat memilih membayar untuk akses instan.`, kb([
    [{ text: "✏️ Ubah Judul", callback_data: `med:title:${d.id}` }],
    [{ text: `💳 Harga Langsung Akses (${rupiah(c.direct_price)})`, callback_data: `med:price:${d.id}` }],
    [{ text: "⏳ Durasi", callback_data: `med:expiry:${d.id}` }, { text: "🔢 Batas akses", callback_data: `med:limit:${d.id}` }],
    [{ text: "📢 Wajib Join", callback_data: `med:groups:${d.id}` }, { text: "👤 Pengguna khusus", callback_data: `med:allow:${d.id}` }],
    [{ text: "✅ Terbitkan Media", callback_data: `med:save:${d.id}` }],
    [{ text: "❌ Batalkan", callback_data: `med:cancel:${d.id}` }]
  ]));
}
export async function cancelDraft(env, chat, adminId) {
  const d = await latestDraft(env, adminId);
  if (d) await db(env, `media_drafts?id=eq.${enc(d.id)}`, { method: "DELETE" });
  await stateClear(env, adminId);
  return send(env, chat, "❎ Draft upload dibatalkan.");
}
export async function saveMediaLink(env, chat, adminId, draftId) {
  const d = await one(env, `media_drafts?id=eq.${enc(draftId)}&admin_id=eq.${adminId}&select=*`);
  if (!d || !d.media?.length) throw new Error("Draft tidak ditemukan atau belum berisi media.");
  const c = d.config || {};
  if (!String(c.title || "").trim()) throw new Error("Judul media wajib diisi.");
  const directPrice = Number(c.direct_price ?? 0);
  if (!Number.isInteger(directPrice) || (directPrice !== 0 && (directPrice < 2000 || directPrice > 10000000))) {
    throw new Error("Harga Langsung Akses harus Rp0 (gratis) atau Rp2.000–Rp10.000.000.");
  }
  let id, row;
  if (c.parent_media_id) {
    const parent = await one(env, `media_links?id=eq.${enc(c.parent_media_id)}&select=*`);
    if (!parent) throw new Error("Media utama untuk penambahan tidak ditemukan.");
    id = parent.id;
    row = { ...parent, media: [...(parent.media || []), ...d.media] };
    await db(env, `media_links?id=eq.${enc(id)}`, { method: "PATCH", body: JSON.stringify({ media: row.media }) });
  } else {
    id = slug(c.title);
    row = { id, owner_id: adminId, title: c.title.trim(), media: d.media, expires_minutes: c.expires_minutes || null, max_access: c.max_access || null, price: 0, direct_price: directPrice, required_groups: c.required_groups || [], allowed_users: c.allowed_users || [], active: true };
    await db(env, "media_links", { method: "POST", body: JSON.stringify(row) });
  }
  await db(env, `media_drafts?id=eq.${enc(draftId)}`, { method: "DELETE" });
  await stateClear(env, adminId);
  return send(env, chat, `🎉 <b>${c.parent_media_id ? "Media berhasil ditambahkan!" : "Media berhasil diterbitkan!"}</b>\nJudul: ${clean(row.title)}\nJumlah media: ${row.media.length}\nHarga Langsung Akses: ${rupiah(row.direct_price)}\n\nPengguna akan diarahkan ke halaman pilihan akses saat menekan judul media.`, kb([[{ text: "🎬 Lihat katalog", callback_data: "feature:media" }], [ { text: "⬅️ Panel Admin", callback_data: "adm:media" } ]]));
}
async function hasUnlock(env, mediaId, telegramId) {
  return !!(await one(env, `share_unlocks?media_id=eq.${enc(mediaId)}&owner_id=eq.${telegramId}&select=id`));
}
async function isAllowed(env, item, id) {
  if (Number(id) === Number(item.owner_id) || Number(id) === Number(OWNER_ID) || await isVip(env, id)) return true;
  if ((item.allowed_users || []).map(Number).includes(Number(id))) return true;
  return hasUnlock(env, item.id, id);
}
export async function accessMedia(env, chat, id, token) {
  const item = await one(env, `media_links?id=eq.${enc(token)}&active=eq.true&select=*`);
  if (!item) return send(env, chat, "Media tidak ditemukan atau sudah tidak aktif.", kb([back("feature:media")]));
  const vip = await isVip(env, id);
  if (!vip && item.required_groups?.length) {
    const gs = await db(env, `force_join?id=in.(${item.required_groups.join(",")})&active=eq.true&select=*`);
    const checks = await Promise.all((gs || []).map(async g => { try { const x = await tg(env, "getChatMember", { chat_id: g.chat_id, user_id: id }); return [g, ["member", "administrator", "creator"].includes(x.result?.status)]; } catch { return [g, false]; } }));
    const missing = checks.filter(x => !x[1]).map(x => x[0]);
    if (missing.length) return send(env, chat, "🔒 <b>Wajib bergabung untuk media ini</b>", kb([...missing.map(g => [{ text: g.name, url: g.invite_link }]), [{ text: "🔄 Saya sudah bergabung", callback_data: `media:verify:${item.id}` }]]));
  }
  if (await isAllowed(env, item, id)) return sendMediaToUser(env, chat, id, item);
  return showAccessTask(env, chat, id, item);
}
async function showAccessTask(env, chat, id, item) {
  const count = await db(env, `share_referrals?media_id=eq.${enc(item.id)}&referrer_id=eq.${id}&select=id`);
  const progress = Math.min(3, count?.length || 0);
  const rows = [[{ text: `🔓 Share to Unlock (${progress}/3)`, callback_data: `media:progress:${item.id}` }]];
  if (Number(item.direct_price || 0) > 0) rows.push([{ text: `⚡ Langsung Akses · ${rupiah(item.direct_price)}`, callback_data: `media:direct:${item.id}` }]);
  else rows.push([{ text: "⚡ Langsung Akses · Gratis", callback_data: `media:free:${item.id}` }]);
  rows.push(back("feature:media"));
  return send(env, chat, `🎬 <b>${clean(item.title)}</b>\n\nPilih cara membuka media ini:\n\n🔓 <b>Share to Unlock</b>\nUndang 3 pengguna baru untuk memulai bot melalui link undangan kamu.\n\n⚡ <b>Langsung Akses</b>\n${Number(item.direct_price || 0) > 0 ? `Bayar ${rupiah(item.direct_price)} melalui QRIS Cashi dan media langsung terbuka setelah pembayaran terverifikasi.` : "Buka langsung tanpa pembayaran."}\n\nPilih salah satu cara di bawah.`, kb(rows));
}
export async function openShareUnlock(env, chat, id, token, show = true) {
  const item = await one(env, `media_links?id=eq.${enc(token)}&active=eq.true&select=*`);
  if (!item) return send(env, chat, "Media tidak ditemukan.");
  if (await isAllowed(env, item, id)) return sendMediaToUser(env, chat, id, item);
  const refs = await db(env, `share_referrals?media_id=eq.${enc(token)}&referrer_id=eq.${id}&select=id`);
  const progress = Math.min(3, refs?.length || 0);
  if (progress >= 3) {
    await db(env, "share_unlocks?on_conflict=media_id,owner_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ media_id: token, owner_id: id }) });
    return sendMediaToUser(env, chat, id, item);
  }
  const username = await BOT_USERNAME(env);
  const link = username ? `https://t.me/${username}?start=share_${token}_${id}` : "";
  const rows = [];
  if (link) rows.push([{ text: "📤 Bagikan link undangan", url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(`Buka media: ${item.title}`)}` }]);
  rows.push([{ text: "🔄 Perbarui progres", callback_data: `media:progress:${token}` }], [{ text: "⚡ Langsung Akses", callback_data: `media:direct:${token}` }], back("feature:media"));
  return send(env, chat, `🔓 <b>Share to Unlock</b>\n\nMedia: <b>${clean(item.title)}</b>\nProgres: <b>${progress}/3 pengguna baru</b>\n\nBagikan link undangan di bawah. Pengguna dihitung setelah membuka link dan menekan Start pada bot.`, kb(rows));
}
export async function registerShareReferral(env, inviteeId, token, referrerId) {
  if (!token || !referrerId || Number(inviteeId) === Number(referrerId)) return;
  const item = await one(env, `media_links?id=eq.${enc(token)}&active=eq.true&select=id`);
  if (!item) return;
  await db(env, "share_referrals?on_conflict=media_id,referrer_id,invitee_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ media_id: token, referrer_id: referrerId, invitee_id: inviteeId }) });
  const refs = await db(env, `share_referrals?media_id=eq.${enc(token)}&referrer_id=eq.${referrerId}&select=id`);
  if ((refs || []).length >= 3 && !(await hasUnlock(env, token, referrerId))) {
    await db(env, "share_unlocks?on_conflict=media_id,owner_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ media_id: token, owner_id: referrerId }) });
    const media = await one(env, `media_links?id=eq.${enc(token)}&select=*`);
    if (media) await sendMediaToUser(env, referrerId, referrerId, media);
    await send(env, referrerId, "🎉 Share to Unlock berhasil! Kamu sudah mengundang 3 pengguna baru.");
  }
}
export async function sendMediaToUser(env, chat, id, item) {
  if (!item?.media?.length) return send(env, chat, "Media belum tersedia.");
  const isOwner = Number(id) === Number(item.owner_id) || Number(id) === Number(OWNER_ID);
  const vip = await isVip(env, id);
  // Reserve access atomically in Postgres; never read-modify-write access_count in JS.
  if (!isOwner && !vip) {
    const result = await db(env, "rpc/claim_media_access", {
      method: "POST",
      body: JSON.stringify({ p_media_id: item.id })
    });
    if (!result?.ok) return send(env, chat, "Kuota akses media habis, media kedaluwarsa, atau sudah tidak aktif.");
  }
  await db(env, "rpc/increment_media_view", {
    method: "POST",
    body: JSON.stringify({ p_media_id: item.id })
  });
  await send(env, chat, `🎬 <b>${clean(item.title)}</b>\nJumlah media: ${item.media.length}`);
  for (let i = 0; i < item.media.length; i++) {
    const m = item.media[i];
    const caption = m.caption ? clean(m.caption) : `🎬 ${clean(item.title)} · Media ${i + 1}/${item.media.length}`;
    let sent;
    if (m.chat_id && m.message_id) {
      sent = await tg(env, "copyMessage", { chat_id: chat, from_chat_id: m.chat_id, message_id: m.message_id, caption, parse_mode: "HTML" });
    } else {
      const field = ({ photo: "photo", video: "video", animation: "animation", audio: "audio", voice: "voice", video_note: "video_note" })[m.type] || "document";
      const method = ({ photo: "sendPhoto", video: "sendVideo", document: "sendDocument", animation: "sendAnimation", audio: "sendAudio", voice: "sendVoice", video_note: "sendVideoNote" })[m.type] || "sendDocument";
      sent = await tg(env, method, { chat_id: chat, [field]: m.file_id, ...(m.type !== "video_note" ? { caption, parse_mode: "HTML" } : {}) });
    }
    if (item.expires_minutes && sent?.result?.message_id) {
      await db(env, "media_deliveries", { method: "POST", body: JSON.stringify({ chat_id: chat, message_id: sent.result.message_id, delete_at: new Date(Date.now() + Number(item.expires_minutes) * 60000).toISOString() }) });
    }
  }
}
export async function catalogPage(env, chat, page = 0, search = "") {
  const all = await db(env, `media_links?active=eq.true&select=id,title,media,views,likes,shares,direct_price,created_at&order=created_at.desc&limit=100`);
  const rows = (all || []).filter(x => !search || x.title.toLowerCase().includes(search.toLowerCase()));
  const start = Math.max(0, page) * 8, batch = rows.slice(start, start + 8);
  const buttons = batch.map(x => [{ text: `🎬 ${x.title.slice(0, 48)} · ${x.views || 0} views`, callback_data: `catalog:open:${x.id}` }]);
  const nav = [];
  if (page > 0) nav.push({ text: "⬅️ Sebelumnya", callback_data: `catalog:page:${page - 1}:${encodeURIComponent(search)}` });
  if (start + 8 < rows.length) nav.push({ text: "Berikutnya ➡️", callback_data: `catalog:page:${page + 1}:${encodeURIComponent(search)}` });
  if (nav.length) buttons.push(nav);
  buttons.push([{ text: "🔎 Cari media", callback_data: "catalog:search" }], back("menu:home"));
  return send(env, chat, `🎬 <b>Katalog Media</b>\n${search ? `Pencarian: ${clean(search)}\n` : ""}Pilih judul media untuk membuka halaman tugas dan pilihan akses.\n\nMenampilkan ${batch.length} dari ${rows.length} media.`, kb(buttons));
}
export async function createMediaDirectOrder(env, chat, userId, token) {
  const item = await one(env, `media_links?id=eq.${enc(token)}&active=eq.true&select=*`);
  if (!item) throw new Error("Media tidak ditemukan.");
  if (await isAllowed(env, item, userId)) return sendMediaToUser(env, chat, userId, item);
  const amount = Number(item.direct_price || 0);
  if (!Number.isInteger(amount) || amount < 2000 || amount > 10000000) throw new Error("Harga Langsung Akses belum valid (minimal Rp2.000 dan maksimal Rp10.000.000).");
  const orderId = `MED-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${userId}`;
  const c = await cashiCreate(env, amount, orderId);
  await db(env, "media_orders", { method: "POST", body: JSON.stringify({ order_id: orderId, telegram_id: userId, media_id: item.id, amount, status: "PENDING", cashi_order_id: c.orderId || orderId, checkout_url: c.checkout_url, created_at: new Date().toISOString() }) });
  await sendCashiQr(env, chat, `🧾 <b>Konfirmasi Langsung Akses</b>\nMedia: ${clean(item.title)}\nHarga: <b>${rupiah(amount)}</b>\nID Pesanan: <code>${orderId}</code>\n\nScan QRIS Cashi sesuai nominal di atas. Setelah pembayaran berhasil diverifikasi, media otomatis dikirim ke chat ini.`, c.qrUrl, c.checkout_url, orderId, "feature:media", "⬅️ Kembali ke Media");
}
export async function settleMediaOrder(env, orderId, data = {}) {
  const order = await one(env, `media_orders?order_id=eq.${enc(orderId)}&select=*`);
  if (!order) return;
  if (data.amount == null || Number(data.amount) !== Number(order.amount)) throw new Error("Nominal pembayaran media tidak cocok dengan nominal pesanan.");
  if (order.status !== "PAID") {
    const claimed = await db(env, `media_orders?order_id=eq.${enc(orderId)}&status=eq.PENDING`, {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "PAID", paid_at: new Date().toISOString() })
    });
    if (!claimed?.length) {
      const latest = await one(env, `media_orders?order_id=eq.${enc(orderId)}&select=*`);
      if (!latest || latest.status !== "PAID") return;
    }
  }
  // Unlock is idempotent. A retry can safely resume delivery if Telegram failed previously.
  await db(env, "share_unlocks?on_conflict=media_id,owner_id", {
    method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ media_id: order.media_id, owner_id: order.telegram_id })
  });
  const latest = await one(env, `media_orders?order_id=eq.${enc(orderId)}&select=delivery_sent_at`);
  if (latest?.delivery_sent_at) return;
  const item = await one(env, `media_links?id=eq.${enc(order.media_id)}&active=eq.true&select=*`);
  if (item) {
    await send(env, order.telegram_id, `✅ <b>Pembayaran berhasil!</b>
Langsung Akses untuk <b>${clean(item.title)}</b> sudah aktif.`);
    await sendMediaToUser(env, order.telegram_id, order.telegram_id, item);
    await db(env, `media_orders?order_id=eq.${enc(orderId)}`, {
      method: "PATCH", body: JSON.stringify({ delivery_sent_at: new Date().toISOString() })
    });
  } else {
    await send(env, order.telegram_id, "Pembayaran berhasil, tetapi media sudah tidak aktif. Hubungi admin.");
  }
}
export async function cleanupExpiredMedia(env) {
  const due = await db(env, `media_deliveries?deleted_at=is.null&delete_at=lte.${encodeURIComponent(new Date().toISOString())}&select=id,chat_id,message_id&limit=25`);
  for (const d of due || []) {
    try {
      await tg(env, "deleteMessage", { chat_id: d.chat_id, message_id: d.message_id });
      await db(env, `media_deliveries?id=eq.${d.id}`, { method: "PATCH", body: JSON.stringify({ deleted_at: new Date().toISOString() }) });
    } catch (e) {
      // Telegram's "message to delete not found" means the desired end state is already reached.
      if (/message to delete not found|message_id_invalid/i.test(e.message || "")) {
        await db(env, `media_deliveries?id=eq.${d.id}`, { method: "PATCH", body: JSON.stringify({ deleted_at: new Date().toISOString() }) });
      } else console.warn("Media cleanup will retry:", d.id, e.message);
    }
  }
}
