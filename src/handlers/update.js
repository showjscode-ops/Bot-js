import { OWNER_ID, safeEqual, authorized, tg, db, send, edit, user, saveUser, isAdmin, getAdmins, groups, joinedAll, gate, packages, stateSet, stateGet, stateClear, slug, enc, one, kb, back, clean } from "../core.js";
import { showMain } from "../features/start.js";
import { vipHome, vipList, packageDetail, about, donate, createVipOrder, settleOrder } from "../features/vip.js";
import { latestDraft, updateDraftConfig, mediaConfig, beginUpload, extractMedia, saveIncomingMedia, finishUpload, cancelDraft, saveMediaLink, sendMediaToUser, accessMedia, settleMediaOrder, catalogPage } from "../features/media.js";
import { adminHome, adminPanel, adminApi, adminHtml } from "../features/admin.js";
import { cashiCreate, sendCashiQr, checkCashi, startStars, checkOrder } from "../payments/index.js";
import { handleTextState } from "./states.js";
import { showBuyNumber } from "../features/buy-number.js";
import { showWebsite } from "../features/website.js";

export async function handleUpdate(u,env){
  if(u.pre_checkout_query){await tg(env,"answerPreCheckoutQuery",{pre_checkout_query_id:u.pre_checkout_query.id,ok:true});return;}
  if(u.message?.successful_payment){
    const p=u.message.successful_payment;await db(env,"bot_donations",{method:"POST",body:JSON.stringify({telegram_id:u.message.from.id,stars:p.total_amount,currency:p.currency,payload:p.invoice_payload,telegram_charge_id:p.telegram_payment_charge_id,created_at:new Date().toISOString()})});
    await send(env,u.message.chat.id,"❤️‍🔥 Terima kasih banyak atas dukungan Telegram Stars kamu!");return;
  }
  if(u.chat_member)return;
  if(u.message){
    const msg=u.message,id=msg.from.id,chat=msg.chat.id,text=msg.text||"";
    if(text.startsWith("/start")){
      await saveUser(env,msg.from);
      const payload=text.split(/\s+/)[1]||"";
      if(payload.startsWith("media_")){if(await gate(env,chat,id,"id"))await accessMedia(env,chat,id,payload.slice(6));return;}
      const old=await user(env,id);if(!old?.language){await send(env,chat,"🌐 <b>Pilih bahasa / Choose your language</b>",kb([[{text:"🇮🇩 Bahasa Indonesia",callback_data:"lang:id"}],[{text:"🇬🇧 English",callback_data:"lang:en"}]]));return;}
      if(await gate(env,chat,id,old.language))await showMain(env,chat,msg.from);return;
    }
    if(text==="/admin"){return adminHome(env,chat,id);}
    if(text==="/upload"){if(!await isAdmin(env,id))return send(env,chat,"⛔ Khusus admin.");return beginUpload(env,chat,id);}
    if(text==="/cancel"){await stateClear(env,id);return send(env,chat,"Proses dibatalkan.");}
    if(await isAdmin(env,id)&&await saveIncomingMedia(env,msg))return;
    if(await handleTextState(env,msg))return;
    if(text==="/help")return send(env,chat,"Perintah:\n/start — menu utama\n/admin — panel admin\n/upload — upload media (admin)\n/cancel — batalkan input");
  }
  const q=u.callback_query;if(!q)return;
  const data=q.data||"",id=q.from.id,chat=q.message?.chat?.id||id;
  await tg(env,"answerCallbackQuery",{callback_query_id:q.id});
  if(data.startsWith("lang:")){await saveUser(env,q.from,data.endsWith("en")?"en":"id");if(await gate(env,chat,id,"id"))await showMain(env,chat,q.from);return;}
  if(data==="gate:check"){if(await gate(env,chat,id,"id"))await showMain(env,chat,q.from);return;}
  if(data==="menu:home")return showMain(env,chat,q.from);
  if(data==="feature:vip")return vipHome(env,chat);
  if(data==="feature:media")return catalogPage(env,chat,0,"");
  if(data==="feature:number")return showBuyNumber(env,chat);
   if(data==="feature:website")return showWebsite(env,chat);
   if(data.startsWith("feature:"))return send(env,chat,"Fitur ini sedang disiapkan.",kb([back("menu:home")]));
  if(data==="catalog:noop")return;
  if(data.startsWith("catalog:page:")){const p=data.split(":");return catalogPage(env,chat,Number(p[2]),decodeURIComponent(p.slice(3).join(":")||""));}
  if(data==="catalog:search"){await stateSet(env,id,"media_catalog_search");return send(env,chat,"Kirim judul atau sebagian judul media yang ingin dicari. Ketik /cancel untuk batal.");}
  if(data.startsWith("catalog:open:")){const token=data.slice("catalog:open:".length);const item=await one(env,`media_links?id=eq.${enc(token)}&active=eq.true&select=*`);if(!item)return send(env,chat,"Media tidak ditemukan atau sudah tidak aktif.",kb([back("feature:media")]));await send(env,chat,`🎬 <b>${clean(item.title)}</b>\nJumlah media: ${(item.media||[]).length}\n${Number(item.price)>0?`Harga: Rp${Number(item.price).toLocaleString("id-ID")}`:"Gratis"}\n\nMenyiapkan akses media...`);return accessMedia(env,chat,id,token);}
  if(data==="vip:home")return vipHome(env,chat);
  if(data==="vip:list")return vipList(env,chat);
  if(data==="vip:about")return about(env,chat);
  if(data==="vip:donate")return donate(env,chat);
  if(data.startsWith("vip:pkg:"))return packageDetail(env,chat,data.slice(8));
  if(data.startsWith("vip:pay:")){
    const p=await one(env,`vip_packages?id=eq.${enc(data.slice(8))}&active=eq.true&select=*`);if(!p)return send(env,chat,"Paket tidak tersedia.");
    try{await createVipOrder(env,chat,id,p,null);}catch(e){await send(env,chat,`❌ ${clean(e.message)}`);}return;
  }
  if(data.startsWith("vip:coupon:")){const pid=data.slice(11);await stateSet(env,id,`coupon_use:${pid}`);return send(env,chat,"🎟️ Kirim kode diskon kamu. Ketik /cancel untuk batal.");}
  if(data.startsWith("stars:"))return startStars(env,chat,id,Number(data.split(":")[1]));
  if(data.startsWith("paycheck:")){try{return await checkOrder(env,chat,id,data.slice(9));}catch(e){return send(env,chat,`❌ ${clean(e.message)}`);}}
  if(data==="adm:home")return adminHome(env,chat,id);
  if(data.startsWith("adm:")){
    if(!await isAdmin(env,id))return send(env,chat,"⛔ Tidak memiliki akses.");
    if(data==="adm:admins")return adminPanel(env,chat,id,"admins");
    if(data==="adm:packages")return adminPanel(env,chat,id,"packages");
    if(data==="adm:groups")return adminPanel(env,chat,id,"groups");
    if(data==="adm:coupons")return adminPanel(env,chat,id,"coupons");
    if(data==="adm:stats")return adminPanel(env,chat,id,"stats");
    if(data==="adm:watermark"){const me=await tg(env,"getMe",{});return send(env,chat,"🖼️ <b>Pengaturan Watermark</b>\nEdit template dan tautan Channel/Group melalui panel web /admin.\n\nPlaceholder: {number}, {bot}, {title}.",kb([[{text:"⚙️ Buka panel admin",url:`https://botbookkeep.showjscode.workers.dev/admin`}],back("adm:home")]));}
    if(data==="adm:admin-add"){if(id!==OWNER_ID)return send(env,chat,"Hanya owner utama yang dapat menambahkan admin.");await stateSet(env,id,"admin_add");return send(env,chat,"Kirim Telegram User ID admin baru (maksimal 3 admin tambahan).");}
    if(data.startsWith("adm:admin-del:")){if(id!==OWNER_ID)return send(env,chat,"Hanya owner yang dapat menghapus admin.");await db(env,`bot_admins?telegram_id=eq.${data.split(":")[2]}`,{method:"DELETE"});return adminPanel(env,chat,id,"admins");}
    if(data==="adm:pkg-add"){await stateSet(env,id,"pkg_add_name");return send(env,chat,"Kirim nama paket VVIP:");}
    if(data.startsWith("adm:pkg-edit:")){const p=await one(env,`vip_packages?id=eq.${enc(data.split(":")[2])}&select=*`);if(!p)return;await stateSet(env,id,`pkg_edit_name:${p.id}`);return send(env,chat,`Kirim nama baru untuk paket (saat ini: ${clean(p.name)}).`);}
    if(data.startsWith("adm:pkg-toggle:")){const p=await one(env,`vip_packages?id=eq.${enc(data.split(":")[2])}&select=*`);if(p)await db(env,`vip_packages?id=eq.${enc(p.id)}`,{method:"PATCH",body:JSON.stringify({active:!p.active})});return adminPanel(env,chat,id,"packages");}
    if(data.startsWith("adm:pkg-del:")){const pid=data.split(":")[2];const used=await one(env,`vip_orders?package_id=eq.${enc(pid)}&select=order_id`);if(used)return send(env,chat,"Paket sudah memiliki riwayat transaksi. Nonaktifkan saja agar riwayat tetap aman.",kb([back("adm:packages")]));await db(env,`vip_packages?id=eq.${enc(pid)}`,{method:"DELETE"});return adminPanel(env,chat,id,"packages");}
    if(data==="adm:group-add"){await stateSet(env,id,"group_add_name");return send(env,chat,"Kirim nama grup/channel:");}
    if(data.startsWith("adm:group-del:")){await db(env,`force_join?id=eq.${Number(data.split(":")[2])}`,{method:"DELETE"});return adminPanel(env,chat,id,"groups");}
    if(data.startsWith("adm:group-edit:")){const g=await one(env,`force_join?id=eq.${Number(data.split(":")[2])}&select=*`);if(g)return send(env,chat,`Edit grup ${clean(g.name)}:\nGunakan panel web /admin untuk ubah nama, link, dan chat ID.`,kb([back("adm:groups")]));}
    if(data==="adm:coupon-add"){await stateSet(env,id,"coupon_add_code");return send(env,chat,"Kirim kode diskon (huruf/angka):");}
    if(data.startsWith("adm:coupon-toggle:")){const c=await one(env,`vip_coupons?id=eq.${Number(data.split(":")[2])}&select=*`);if(c)await db(env,`vip_coupons?id=eq.${c.id}`,{method:"PATCH",body:JSON.stringify({active:!c.active})});return adminPanel(env,chat,id,"coupons");}
  }
  if(data==="upload:start"){if(!await isAdmin(env,id))return send(env,chat,"⛔ Khusus admin.");return beginUpload(env,chat,id);}
  if(data==="upload:finish")return finishUpload(env,chat,id);
  if(data==="upload:cancel")return cancelDraft(env,chat,id);
  if(data==="upload:continue")return send(env,chat,"Silakan kirim media berikutnya.");
  if(data.startsWith("med:")){
    if(!await isAdmin(env,id))return;
    const [_,action,draftId]=data.split(":");
    if(action==="cancel")return cancelDraft(env,chat,id);
    if(action==="save")return saveMediaLink(env,chat,id,draftId);
    if(action==="expiry")return send(env,chat,"Pilih masa berlaku:",kb([[1,2,12,24].map(n=>({text:`${n} jam`,callback_data:`med:setexp:${draftId}:${n}`})) ,[{text:"Atur sendiri",callback_data:`med:customexp:${draftId}`}],back("adm:home")]));
    if(action==="setexp"){const h=Number(data.split(":")[3]);await updateDraftConfig(env,draftId,{expires_hours:h});return mediaConfig(env,chat,draftId);}
    if(action==="customexp"){await stateSet(env,id,`media_custom_expiry:${draftId}`);return send(env,chat,"Masukkan masa berlaku dalam jam (1–8760):");}
    if(action==="limit")return send(env,chat,"Pilih batas jumlah akses:",kb([[10,50,100,500].map(n=>({text:String(n),callback_data:`med:setlimit:${draftId}:${n}`})),[{text:"Tanpa batas",callback_data:`med:setlimit:${draftId}:0`}],back("adm:home")]));
    if(action==="setlimit"){const n=Number(data.split(":")[3]);await updateDraftConfig(env,draftId,{max_access:n||null});return mediaConfig(env,chat,draftId);}
    if(action==="groups"){const g=await db(env,"force_join?active=eq.true&select=id,name");const rows=(g||[]).map(x=>[{text:x.name,callback_data:`med:group-toggle:${draftId}:${x.id}`}]);rows.push([{text:"➕ Tambah grup/channel baru",callback_data:"adm:group-add"}],back("adm:home"));return send(env,chat,"Pilih grup/channel wajib join:",kb(rows));}
    if(action==="group-toggle"){const gid=Number(data.split(":")[3]),d=await one(env,`media_drafts?id=eq.${enc(draftId)}&select=*`),a=d.config?.required_groups||[];await updateDraftConfig(env,draftId,{required_groups:a.includes(gid)?a.filter(x=>x!==gid):[...a,gid]});return mediaConfig(env,chat,draftId);}
    if(action==="allow"){await stateSet(env,id,"media_allowed_user");return send(env,chat,"Kirim Telegram User ID yang diizinkan, pisahkan dengan koma. Kosongkan dengan /cancel untuk batal.");}
    if(action==="price"){await stateSet(env,id,"media_price");return send(env,chat,"Masukkan harga Rupiah. Isi 0 untuk media gratis:");}
    if(action==="title"){await stateSet(env,id,"media_title");return send(env,chat,"Masukkan judul media:");}
  }
  if(data.startsWith("media:verify:"))return accessMedia(env,chat,id,data.split(":")[2]);
}

