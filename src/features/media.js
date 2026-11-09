import { safeEqual, authorized, tg, db, send, edit, user, saveUser, isAdmin, getAdmins, groups, joinedAll, gate, packages, stateSet, stateGet, stateClear, slug, enc, one, kb, back, clean } from "../core.js";
import { cashiCreate, sendCashiQr, checkCashi, startStars, checkOrder } from "../payments/index.js";

export async function latestDraft(env,id){return one(env,`media_drafts?admin_id=eq.${id}&status=eq.DRAFT&select=*&order=created_at.desc`);}

export async function updateDraftConfig(env,id,patch){const d=await one(env,`media_drafts?id=eq.${enc(id)}&select=*`);if(d)await db(env,`media_drafts?id=eq.${enc(id)}`,{method:"PATCH",body:JSON.stringify({config:{...(d.config||{}),...patch}})});}

export async function mediaConfig(env,chat,id){
  const d=await one(env,`media_drafts?id=eq.${enc(id)}&select=*`);if(!d)return;
  const c=d.config||{},expiry=c.expires_minutes?`${c.expires_minutes} menit`:c.expires_hours?`${c.expires_hours} jam`:"Tidak dibatasi",price=Number(c.price||0)===0?"Gratis":`Rp${Number(c.price).toLocaleString("id-ID")}`;
  const gs=await db(env,"force_join?select=id,name&active=eq.true");
  await send(env,chat,`📤 <b>Pengaturan Media</b>\nJudul: ${clean(c.title||"(belum diisi)")}\nJumlah media: ${(d.media||[]).length}\nKadaluarsa: ${expiry}\nBatas akses: ${c.max_access||"Tidak dibatasi"}\nHarga: ${price}\nWajib join: ${(c.required_groups||[]).length} grup\nAnggota khusus: ${(c.allowed_users||[]).length}`,kb([
    [{text:"⏳ Atur waktu kadaluarsa",callback_data:`med:expiry:${id}`}],
    [{text:"📢 Pengaturan wajib mengikuti",callback_data:`med:groups:${id}`}],
    [{text:"🔢 Atur batas jumlah akses",callback_data:`med:limit:${id}`}],
    [{text:"👤 Akses anggota tertentu",callback_data:`med:allow:${id}`}],
    [{text:"💰 Atur harga media",callback_data:`med:price:${id}`}],
    [{text:"📝 Masukkan judul",callback_data:`med:title:${id}`}],
    [{text:"💾 Save",callback_data:`med:save:${id}`},{text:"❌ Batal",callback_data:`med:cancel:${id}`}]
  ]));
}

export async function beginUpload(env,chat,id){
  await db(env,"media_drafts",{method:"POST",body:JSON.stringify({id:crypto.randomUUID(),admin_id:id,status:"DRAFT",stage:"collect",media:[],config:{price:0,required_groups:[],allowed_users:[]},created_at:new Date().toISOString()})});
  await send(env,chat,"📤 <b>Mode Upload Media</b>\nKirim foto, video, dokumen, audio, atau animasi sebanyak yang diperlukan. Bot akan menghitung setiap media yang diterima. Setelah selesai, tekan Panel Tugas untuk mengatur link. Maksimal 200 media per link.",kb([[{text:"📋 Panel Tugas",callback_data:"upload:finish"}],[{text:"❌ Batal",callback_data:"upload:cancel"}]]));
}

export function extractMedia(msg){
  if(msg.photo?.length)return {type:"photo",file_id:msg.photo[msg.photo.length-1].file_id};
  if(msg.video)return {type:"video",file_id:msg.video.file_id};
  if(msg.document)return {type:"document",file_id:msg.document.file_id};
  if(msg.animation)return {type:"animation",file_id:msg.animation.file_id};
  if(msg.audio)return {type:"audio",file_id:msg.audio.file_id};
  return null;
}

export async function saveIncomingMedia(env,msg){
  const d=await latestDraft(env,msg.from.id);if(!d||d.stage!=="collect")return false;
  const m=extractMedia(msg);if(!m)return false;
  const list=d.media||[];if(list.length>=200){await send(env,msg.chat.id,"⚠️ Maksimal 200 media per link.");return true;}
  list.push(m);await db(env,`media_drafts?id=eq.${enc(d.id)}`,{method:"PATCH",body:JSON.stringify({media:list})});
  await send(env,msg.chat.id,`✅ <b>Media ke-${list.length} berhasil diterima!</b>\n📊 Total media diterima: ${list.length}\n\nKirim media berikutnya atau buka Panel Tugas jika upload sudah selesai.`,kb([[{text:"📤 Upload lagi",callback_data:"upload:continue"},{text:"📋 Panel Tugas",callback_data:"upload:finish"}],[{text:"❌ Batalkan upload",callback_data:"upload:cancel"}]]));return true;
}

export async function finishUpload(env,chat,id){
  const d=await latestDraft(env,id);if(!d||!d.media?.length)return send(env,chat,"Belum ada media yang diunggah.");
  await db(env,`media_drafts?id=eq.${enc(d.id)}`,{method:"PATCH",body:JSON.stringify({stage:"config"})});
  await stateSet(env,id,"media_title");await send(env,chat,`📋 <b>Panel Tugas Upload</b>\n${d.media.length} media sudah diterima.\n\n📝 Masukkan judul untuk link media:`,kb([[{text:"❌ Batal",callback_data:"upload:cancel"}]]));
}

export async function cancelDraft(env,chat,id){
  const d=await latestDraft(env,id);if(d)await db(env,`media_drafts?id=eq.${enc(d.id)}`,{method:"DELETE"});
  await stateClear(env,id);await send(env,chat,"❎ Draft dibatalkan dan data media draft di database dihapus.");
}

export async function saveMediaLink(env,chat,id,draftId){
  const d=await one(env,`media_drafts?id=eq.${enc(draftId)}&select=*`);if(!d||d.admin_id!==id||!d.media?.length)return send(env,chat,"Draft tidak ditemukan.");
  const c=d.config||{};if(!c.title)return send(env,chat,"Judul belum diisi.");
  const token=crypto.randomUUID().replace(/-/g,"").slice(0,12).toUpperCase();
  const durationMinutes=c.expires_minutes?Number(c.expires_minutes):c.expires_hours?Number(c.expires_hours)*60:null;
  await db(env,"media_links",{method:"POST",body:JSON.stringify({id:token,owner_id:id,title:c.title,media:d.media,expires_at:null,expires_minutes:durationMinutes,max_access:c.max_access||null,access_count:0,price:Number(c.price||0),required_groups:c.required_groups||[],allowed_users:c.allowed_users||[],active:true,created_at:new Date().toISOString()})});
  await db(env,`media_drafts?id=eq.${enc(draftId)}`,{method:"DELETE"});await stateClear(env,id);
  const me=await tg(env,"getMe"),username=me.result?.username||"";
  await send(env,chat,`✅ <b>Link media berhasil dibuat!</b>\nJudul: ${clean(c.title)}\nLink: https://t.me/${username}?start=media_${token}\n\nBagikan link tersebut kepada pengguna.`,kb([[{text:"📤 Upload media lagi",callback_data:"upload:start"}],[{text:"🏠 Panel Admin",callback_data:"adm:home"}]]));
}

export async function watermarkSettings(env){
  const rows=await db(env,"bot_settings?key=in.(watermark_template,watermark_links)&select=key,value");
  const map=Object.fromEntries((rows||[]).map(x=>[x.key,x.value]));
  return {template:typeof map.watermark_template==="string"?map.watermark_template:"Media ke {number}\nBot: {bot}",links:Array.isArray(map.watermark_links)?map.watermark_links:[]};
}
export async function catalogPage(env,chat,page=0,query=""){
  const all=await db(env,`media_links?active=eq.true&select=id,title,price&order=created_at.desc&limit=500`);
  const filtered=(all||[]).filter(x=>!query||String(x.title||"").toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const size=15,total=Math.max(1,Math.ceil(filtered.length/size)),p=Math.max(0,Math.min(Number(page)||0,total-1));
  const slice=filtered.slice(p*size,(p+1)*size);
  const rows=slice.map(x=>[{text:`${x.title.slice(0,48)}${Number(x.price)>0?` · Rp${Number(x.price).toLocaleString("id-ID")}`:""}`,callback_data:`catalog:open:${x.id}`}]);
  rows.push([{text:"🔎 Cari berdasarkan judul",callback_data:"catalog:search"}]);
  if(total>1)rows.push([{text:"⬅️",callback_data:`catalog:page:${p-1}:${encodeURIComponent(query)}`,...(p===0?{callback_data:"catalog:noop"}:{})},{text:`${p+1}/${total}`,callback_data:"catalog:noop"},{text:"➡️",callback_data:`catalog:page:${p+1}:${encodeURIComponent(query)}`,...(p>=total-1?{callback_data:"catalog:noop"}:{})}]);
  rows.push(back("menu:home"));
  return send(env,chat,`🎬 <b>Video / Media</b>\n${filtered.length} judul tersedia. Pilih judul untuk melihat detail.\nHalaman ${p+1} dari ${total}.`,kb(rows));
}
export async function sendMediaToUser(env,chat,media,title,deleteAfterMinutes=null){
  const deleteAt=deleteAfterMinutes?new Date(Date.now()+Number(deleteAfterMinutes)*60000).toISOString():null;
  const settings=await watermarkSettings(env);let botName="Bot";
  try{const me=await tg(env,"getMe",{});botName=me.result?.first_name||me.result?.username||"Bot";}catch{}
  for(let i=0;i<media.length;i++){
    const m=media[i],num=i+1;
    let caption=(settings.template||"Media ke {number}\nBot: {bot}").replaceAll("{number}",String(num)).replaceAll("{bot}",clean(botName)).replaceAll("{title}",clean(title||"Media"));
    for(const link of settings.links){if(!link?.label||!link?.url||!/^https:\/\/(t\.me|telegram\.me)\//i.test(String(link.url)))continue;caption+=`\n<a href="${String(link.url).replace(/&/g,"&amp;").replace(/\"/g,"&quot;")}">${clean(link.label)}</a>`;}
    const method=m.type==="photo"?"sendPhoto":m.type==="video"?"sendVideo":m.type==="animation"?"sendAnimation":m.type==="audio"?"sendAudio":"sendDocument";
    const field=m.type==="photo"?"photo":m.type==="video"?"video":m.type==="animation"?"animation":m.type==="audio"?"audio":"document";
    const sent=await tg(env,method,{chat_id:chat,[field]:m.file_id,caption,parse_mode:"HTML"});
    if(deleteAt&&sent.result?.message_id){await db(env,"media_deliveries",{method:"POST",body:JSON.stringify({chat_id:chat,message_id:sent.result.message_id,delete_at:deleteAt})});}
    if(i<media.length-1)await new Promise(resolve=>setTimeout(resolve,3000));
  }
}

export async function accessMedia(env,chat,id,token){
  const m=await one(env,`media_links?id=eq.${enc(token)}&active=eq.true&select=*`);
  if(!m)return send(env,chat,"❌ Link media tidak ditemukan atau sudah dinonaktifkan.");
  if(m.expires_at&&Date.now()>new Date(m.expires_at).getTime())return send(env,chat,"🔥 <b>Media sudah terbakar/kedaluwarsa.</b>\nMasa berlaku link ini telah habis.");
  if(m.max_access&&m.access_count>=m.max_access)return send(env,chat,"⚠️ <b>Media sudah dibuka oleh semua pengguna yang mendapat kuota.</b>\nBatas akses telah tercapai. Link ini tidak menerima pengguna baru lagi.");
  if((m.allowed_users||[]).length&&!(m.allowed_users||[]).includes(Number(id)))return send(env,chat,"⛔ Akun kamu tidak termasuk anggota yang diizinkan.");
  if((m.required_groups||[]).length){
    for(const gid of m.required_groups){
      const g=await one(env,`force_join?id=eq.${Number(gid)}&active=eq.true&select=*`);
      if(!g)return send(env,chat,"⚠️ Channel wajib join pada link ini sudah tidak tersedia. Hubungi admin.");
      let joined=false;
      try { const r=await tg(env,"getChatMember",{chat_id:g.chat_id,user_id:id}); joined=["member","administrator","creator"].includes(r.result?.status); }
      catch(e){ console.warn("Required group check failed",g.id,e.message); }
      if(!joined)return send(env,chat,`🔒 Kamu harus bergabung ke ${clean(g.name)} terlebih dahulu.`,kb([[{text:"Gabung",url:g.invite_link}],[{text:"✅ Saya sudah bergabung",callback_data:`media:verify:${token}`}],[{text:"⬅️ Kembali",callback_data:"feature:media"}]]));
    }
  }
  if(Number(m.price)>0){
    const orderId=`MED-${Date.now()}-${id}`,c=await cashiCreate(env,Number(m.price),orderId);
    await db(env,"media_orders",{method:"POST",body:JSON.stringify({order_id:orderId,telegram_id:id,media_id:m.id,amount:m.price,status:"PENDING",cashi_order_id:c.orderId||orderId,checkout_url:c.checkout_url,created_at:new Date().toISOString()})});
    return sendCashiQr(env,chat,`🎬 <b>${clean(m.title)}</b>\nHarga: Rp${Number(m.price).toLocaleString("id-ID")}\nSelesaikan pembayaran untuk membuka media.`,c.qrUrl,c.checkout_url,orderId);
  }
  const burnMinutes=Number(m.expires_minutes)||null;
  if(burnMinutes)await send(env,chat,`⚠️ <b>PERINGATAN!</b>\nHarap simpan semua media yang Anda butuhkan.\nKarena semua media akan terbakar dalam ${burnMinutes} menit.`,null);
  const claimed=await db(env,"rpc/claim_media_access",{method:"POST",body:JSON.stringify({p_media_id:token})});if(!claimed?.ok)return send(env,chat,"⚠️ Media sudah dibuka oleh semua orang yang mendapat kuota. Silakan cari link lain.");
  await send(env,chat,`✅ Akses <b>${clean(m.title)}</b> berhasil. Media akan dikirim satu per satu.`,null);await sendMediaToUser(env,chat,m.media,m.title,burnMinutes);return true;
}

export async function settleMediaOrder(env,orderId){
  const o=await one(env,`media_orders?order_id=eq.${enc(orderId)}&select=*`);if(!o||o.status==="PAID")return;
  const claimed=await db(env,`media_orders?order_id=eq.${enc(orderId)}&status=eq.PENDING`,{method:"PATCH",headers:{"Prefer":"return=representation"},body:JSON.stringify({status:"PAID",paid_at:new Date().toISOString()})});
  if(!claimed?.length)return;
  const m=await one(env,`media_links?id=eq.${enc(o.media_id)}&select=*`);if(!m||!m.active)return;
  const claimedAccess=await db(env,"rpc/claim_media_access",{method:"POST",body:JSON.stringify({p_media_id:m.id})});if(!claimedAccess?.ok){await send(env,o.telegram_id,"⚠️ Maaf, kuota akses media sudah habis sebelum pembayaran selesai. Hubungi admin untuk bantuan pengembalian dana.");return;}
  const burnMinutes=Number(m.expires_minutes)||null;if(burnMinutes)await send(env,o.telegram_id,`⚠️ <b>PERINGATAN!</b>\nHarap simpan semua media yang Anda butuhkan.\nKarena semua media akan terbakar dalam ${burnMinutes} menit.`);
  await send(env,o.telegram_id,`✅ Pembayaran berhasil. Media <b>${clean(m.title)}</b> sedang dikirim satu per satu.`);await sendMediaToUser(env,o.telegram_id,m.media,m.title,burnMinutes);
}


export async function cleanupExpiredMedia(env){
  const rows=await db(env,`media_deliveries?deleted_at=is.null&delete_at=lte.${enc(new Date().toISOString())}&select=id,chat_id,message_id&limit=100`);
  for(const row of rows||[]){
    try{
      await tg(env,"deleteMessage",{chat_id:row.chat_id,message_id:row.message_id});
      await db(env,`media_deliveries?id=eq.${row.id}&deleted_at=is.null`,{method:"PATCH",body:JSON.stringify({deleted_at:new Date().toISOString()})});
    }catch(e){
      // Telegram may already have removed the message or may temporarily reject deletion.
      // Keep the row pending so the next scheduled run can retry.
      console.warn("Media auto-delete will retry",row.id,e.message);
    }
  }
}
