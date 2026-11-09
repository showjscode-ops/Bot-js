import { safeEqual, authorized, tg, db, send, edit, user, saveUser, isAdmin, getAdmins, groups, joinedAll, gate, packages, stateSet, stateGet, stateClear, slug, enc, one, kb, back, clean } from "../core.js";
import { vipHome, vipList, packageDetail, about, donate, createVipOrder, settleOrder } from "../features/vip.js";
import { latestDraft, updateDraftConfig, mediaConfig, beginUpload, extractMedia, saveIncomingMedia, finishUpload, cancelDraft, saveMediaLink, sendMediaToUser, accessMedia, settleMediaOrder } from "../features/media.js";

export async function cashiCreate(env,amount,orderId){
  if(!env.CASHI_API_KEY)throw new Error("CASHI_API_KEY belum dipasang di Cloudflare Secrets");
  const r=await fetch(`${CASHI}/create-order`,{method:"POST",headers:{"content-type":"application/json","x-api-key":env.CASHI_API_KEY},body:JSON.stringify({amount,order_id:orderId})});
  const d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||d.error||"Cashi gagal membuat pesanan");return d;
}

export async function sendCashiQr(env,chat,caption,qrUrl,checkout,order){
  if(qrUrl&&qrUrl.startsWith("data:image/")){
    try{const [meta,b64]=qrUrl.split(",");const mime=meta.match(/data:(.*?);base64/)?.[1]||"image/png";const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));const form=new FormData();form.append("chat_id",String(chat));form.append("caption",caption);form.append("parse_mode","HTML");form.append("photo",new Blob([bytes],{type:mime}),"qris.png");await fetch(`${TG}${env.BOT_TOKEN}/sendPhoto`,{method:"POST",body:form});}catch(e){console.error("QR image send failed",e);await send(env,chat,caption);}
  }else if(qrUrl){await tg(env,"sendPhoto",{chat_id:chat,photo:qrUrl,caption,parse_mode:"HTML"});}
  else await send(env,chat,caption);
  await send(env,chat,"Jika pembayaran sudah dilakukan, tekan tombol cek pembayaran.",kb([[{text:"🔄 Cek Pembayaran",callback_data:`paycheck:${order}`}],[{text:"🔗 Buka halaman pembayaran",url:checkout||"https://cashi.id"}],[{text:"⬅️ Kembali ke VVIP",callback_data:"vip:home"}]]));
}

export async function checkCashi(env,orderId){
  const r=await fetch(`${CASHI}/check-status/${encodeURIComponent(orderId)}`,{headers:{"x-api-key":env.CASHI_API_KEY}});
  const d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||"Gagal mengecek status Cashi");return d;
}

export async function startStars(env,chat,userId,n){
  await tg(env,"sendInvoice",{chat_id:chat,title:"Donasi Book keep",description:`Dukungan pengembangan bot sebesar ${n} Telegram Stars.`,payload:`donation:${userId}:${n}:${Date.now()}`,provider_token:"",currency:"XTR",prices:[{label:`Donasi ${n} Stars`,amount:n}]});
}

export async function checkOrder(env,chat,id,orderId){
  const v=await checkCashi(env,orderId);
  if(v.status==="SETTLED"){
    if(orderId.startsWith("VIP-"))await settleOrder(env,orderId,v);
    else await settleMediaOrder(env,orderId);
    await send(env,chat,"✅ Pembayaran terkonfirmasi. Jika media/link belum diterima, gunakan /start untuk membuka kembali.");
  }else await send(env,chat,`⏳ Status pembayaran: ${clean(v.status||"PENDING")}. Silakan cek kembali beberapa saat lagi.`);
}

