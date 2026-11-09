import { safeEqual, authorized, tg, db, send, edit, user, saveUser, isAdmin, getAdmins, groups, joinedAll, gate, packages, stateSet, stateGet, stateClear, slug, enc, one, kb, back, clean } from "../core.js";

export async function showMain(env,chat,u){
  const n=clean(u.first_name||"teman");
  await send(env,chat,`🎉 <b>Selamat datang, ${n}!</b>\n\nSilakan pilih layanan yang tersedia.`,kb([[{text:"🎬 Video/Media",callback_data:"feature:media"},{text:"👑 Group VIP",callback_data:"feature:vip"}],[{text:"📱 Beli Nomor",callback_data:"feature:number"},{text:"🌐 Website",callback_data:"feature:website"}]]));
}

