import { safeEqual, authorized, tg, db, send, edit, user, saveUser, isAdmin, getAdmins, groups, joinedAll, gate, packages, stateSet, stateGet, stateClear, slug, enc, one, kb, back, clean } from "../core.js";
import { cashiCreate, sendCashiQr, checkCashi, startStars, checkOrder } from "../payments/index.js";

export async function latestDraft(env,id){return one(env,`media_drafts?admin_id=eq.${id}&status=eq.DRAFT&select=*&order=created_at.desc`);}

export async function updateDraftConfig(env,id,patch){const d=await one(env,`media_drafts?id=eq.${enc(id)}&select=*`);if(d)await db(env,`media_drafts?id=eq.${enc(id)}`,{method:"PATCH",body:JSON.stringify({config:{...(d.config||{}),...patch}})});}

export async function mediaConfig(env,chat,id){
  const d=await one(env,`media_drafts?id=eq.${enc(id)}&select=*`);if(!d)return;
  const c=d.config||{},expiry=c.expires_hours?`${c.expires_hours} jam`:"Tidak dibatasi",price=Number(c.price||0)===0?"Gratis":`Rp${Number(c.price).toLocaleString("id-ID")}`;
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
  await send(env,chat,"📤 <b>Mode Upload Media</b>\nKirim media satu per satu (foto, video, atau dokumen). Setelah selesai tekan tombol Selesai. Maksimal 50 media per draft.",kb([[{text:"✅ Selesai",callback_data:"upload:finish"},{text:"❌ Batal",callback_data:"upload:cancel"}]]));
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
  const list=d.media||[];if(list.length>=50){await send(env,msg.chat.id,"Maksimal 50 media per link.");return true;}
  list.push(m);await db(env,`media_drafts?id=eq.${enc(d.id)}`,{method:"PATCH",body:JSON.stringify({media:list})});
  await send(env,msg.chat.id,`✅ Media ${list.length} diterima.`,kb([[{text:"➕ Tambah lagi",callback_data:"upload:continue"},{text:"✅ Selesai",callback_data:"upload:finish"}],[{text:"❌ Batal",callback_data:"upload:cancel"}]]));return true;
}

export async function finishUpload(env,chat,id){
  const d=await latestDraft(env,id);if(!d||!d.media?.length)return send(env,chat,"Belum ada media yang diunggah.");
  await db(env,`media_drafts?id=eq.${enc(d.id)}`,{method:"PATCH",body:JSON.stringify({stage:"config"})});
  await stateSet(env,id,"media_title");await send(env,chat,"📝 Masukkan judul untuk link media:");
}

export async function cancelDraft(env,chat,id){
  const d=await latestDraft(env,id);if(d)await db(env,`media_drafts?id=eq.${enc(d.id)}`,{method:"DELETE"});
  await stateClear(env,id);await send(env,chat,"❎ Draft dibatalkan dan data media draft di database dihapus.");
}

export async function saveMediaLink(env,chat,id,draftId){
  const d=await one(env,`media_drafts?id=eq.${enc(draftId)}&select=*`);if(!d||d.admin_id!==id||!d.media?.length)return send(env,chat,"Draft tidak ditemukan.");
  const c=d.config||{};if(!c.title)return send(env,chat,"Judul belum diisi.");
  const token=crypto.randomUUID().replace(/-/g,"").slice(0,12).toUpperCase();
  const expires=c.expires_hours?new Date(Date.now()+Number(c.expires_hours)*3600000).toISOString():null;
  await db(env,"media_links",{method:"POST",body:JSON.stringify({id:token,owner_id:id,title:c.title,media:d.media,expires_at:expires,max_access:c.max_access||null,access_count:0,price:Number(c.price||0),required_groups:c.required_groups||[],allowed_users:c.allowed_users||[],active:true,created_at:new Date().toISOString()})});
  await db(env,`media_drafts?id=eq.${enc(draftId)}`,{method:"DELETE"});await stateClear(env,id);
  const me=await tg(env,"getMe"),username=me.result?.username||"";
  await send(env,chat,`✅ <b>Link media berhasil dibuat!</b>\nJudul: ${clean(c.title)}\nLink: https://t.me/${username}?start=media_${token}\n\nBagikan link tersebut kepada pengguna.`,kb([[{text:"📤 Upload media lagi",callback_data:"upload:start"}],[{text:"🏠 Panel Admin",callback_data:"adm:home"}]]));
}

export async function sendMediaToUser(env,chat,media,caption){
  const batches=[];for(let i=0;i<media.length;i+=10)batches.push(media.slice(i,i+10));
  for(const batch of batches){
    if(batch.length===1){const m=batch[0],method=m.type==="photo"?"sendPhoto":m.type==="video"?"sendVideo":m.type==="animation"?"sendAnimation":m.type==="audio"?"sendAudio":"sendDocument";await tg(env,method,{chat_id:chat,[m.type==="photo"?"photo":m.type==="video"?"video":m.type==="animation"?"animation":m.type==="audio"?"audio":"document"]:m.file_id,caption:caption||undefined});}
    else await tg(env,"sendMediaGroup",{chat_id:chat,media:batch.map((m,i)=>({type:m.type==="animation"?"document":m.type==="audio"?"audio":m.type,media:m.file_id,...(i===0&&caption?{caption}:{})}))});
  }
}

export async function accessMedia(env,chat,id,token){
  const m=await one(env,`media_links?id=eq.${enc(token)}&active=eq.true&select=*`);
  if(!m)return send(env,chat,"❌ Link media tidak ditemukan atau sudah dinonaktifkan.");
  if(m.expires_at&&Date.now()>new Date(m.expires_at).getTime())return send(env,chat,"⌛ Link media sudah kedaluwarsa.");
  if(m.max_access&&m.access_count>=m.max_access)return send(env,chat,"Batas akses link ini sudah tercapai.");
  if((m.allowed_users||[]).length&&!(m.allowed_users||[]).includes(Number(id)))return send(env,chat,"⛔ Akun kamu tidak termasuk anggota yang diizinkan.");
  if((m.required_groups||[]).length){
    for(const gid of m.required_groups){const g=await one(env,`force_join?id=eq.${Number(gid)}&select=*`);if(g){const r=await tg(env,"getChatMember",{chat_id:g.chat_id,user_id:id});if(!r.ok||!["member","administrator","creator"].includes(r.result?.status))return send(env,chat,`🔒 Kamu harus bergabung ke ${clean(g.name)} terlebih dahulu.`,kb([[{text:"Gabung",url:g.invite_link}],[{text:"✅ Saya sudah bergabung",callback_data:`media:verify:${token}`}]]));}}
  }
  if(Number(m.price)>0){
    const orderId=`MED-${Date.now()}-${id}`,c=await cashiCreate(env,Number(m.price),orderId);
    await db(env,"media_orders",{method:"POST",body:JSON.stringify({order_id:orderId,telegram_id:id,media_id:m.id,amount:m.price,status:"PENDING",cashi_order_id:c.orderId||orderId,checkout_url:c.checkout_url,created_at:new Date().toISOString()})});
    return sendCashiQr(env,chat,`🎬 <b>${clean(m.title)}</b>\nHarga: Rp${Number(m.price).toLocaleString("id-ID")}\nSelesaikan pembayaran untuk membuka media.`,c.qrUrl,c.checkout_url,orderId);
  }
  await db(env,`media_links?id=eq.${enc(token)}`,{method:"PATCH",body:JSON.stringify({access_count:Number(m.access_count||0)+1})});
  await sendMediaToUser(env,chat,m.media,`🎬 ${m.title}`);return true;
}

export async function settleMediaOrder(env,orderId){
  const o=await one(env,`media_orders?order_id=eq.${enc(orderId)}&select=*`);if(!o||o.status==="PAID")return;
  const claimed=await db(env,`media_orders?order_id=eq.${enc(orderId)}&status=eq.PENDING`,{method:"PATCH",headers:{"Prefer":"return=representation"},body:JSON.stringify({status:"PAID",paid_at:new Date().toISOString()})});
  if(!claimed?.length)return;
  const m=await one(env,`media_links?id=eq.${enc(o.media_id)}&select=*`);if(!m||!m.active)return;
  await db(env,`media_links?id=eq.${enc(m.id)}`,{method:"PATCH",body:JSON.stringify({access_count:Number(m.access_count||0)+1})});
  await sendMediaToUser(env,o.telegram_id,m.media,`🎬 ${m.title}`);
}

