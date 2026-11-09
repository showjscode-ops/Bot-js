export const TG = "https://api.telegram.org/bot";
export const CASHI = "https://cashi.id/api";
export const OWNER_ID = 6665664367;
export const H = {"content-type":"application/json"};
export const enc=s=>encodeURIComponent(String(s));
export const one=async(env,path)=>((await db(env,path))||[])[0]||null;
export const kb=rows=>({inline_keyboard:rows});
export const back=(data="vip:home")=>[{text:"⬅️ Kembali",callback_data:data}];
export const clean=s=>String(s||"").replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]));
export const TEXT={
 id:{welcome:"🎉 <b>Selamat datang, {name}!</b>\n\nSilakan pilih layanan yang tersedia.",media:"🎬 Video/Media",vip:"👑 Group VIP",number:"📱 Beli Nomor",website:"🌐 Website",helpBtn:"❔ Bantuan",help:"🤖 <b>Panduan Bot</b>\n/start — Menu utama\n/help — Panduan penggunaan\n/setlanguage — Ganti bahasa\n/upload — Upload media (admin)\n/admin — Panel admin (admin)\n/cancel — Batalkan proses\n\nPilih menu di bawah untuk mulai.",language:"🌐 <b>Pilih bahasa / Choose your language</b>",changed:"✅ Bahasa berhasil diubah.",back:"⬅️ Kembali",cancel:"❌ Batal",donate:"❤️‍🔥 Donasi",websiteMsg:"🌐 <b>Website Boxcelink</b>\nKlik tombol untuk membuka website resmi.",numberMsg:"📱 <b>NOKOS SEMUA APLIKASI TERSEDIA !!!</b>\n\nBeli nokos dengan berbagai pilihan negara dan harga yang terjangkau 😍\n\n🌐 <b>Layanan Tersedia</b>\n➡️ <b>Telegram</b>\nPembelian nomor Telegram yang siap pakai\n➡️ <b>Layanan Lain</b>\nPembelian OTP berbagai aplikasi seperti WhatsApp, Google, dan Facebook\n\nSilakan Hubungi Admin."},
 en:{welcome:"🎉 <b>Welcome, {name}!</b>\n\nChoose an available service below.",media:"🎬 Video/Media",vip:"👑 VIP Group",number:"📱 Buy Number",website:"🌐 Website",helpBtn:"❔ Help",help:"🤖 <b>Bot Help</b>\n/start — Main menu\n/help — Help guide\n/setlanguage — Change language\n/upload — Upload media (admin)\n/admin — Admin panel (admin)\n/cancel — Cancel current process\n\nChoose a menu below to get started.",language:"🌐 <b>Choose your language / Pilih bahasa</b>",changed:"✅ Language changed successfully.",back:"⬅️ Back",cancel:"❌ Cancel",donate:"❤️‍🔥 Donate",websiteMsg:"🌐 <b>Boxcelink Website</b>\nTap the button to open the official website.",numberMsg:"📱 <b>VIRTUAL NUMBERS FOR ALL APPS AVAILABLE!!!</b>\n\nBuy virtual numbers from various countries at affordable prices 😍\n\n🌐 <b>Available Services</b>\n➡️ <b>Telegram</b>\nReady-to-use Telegram number purchases\n➡️ <b>Other Services</b>\nOTP numbers for apps such as WhatsApp, Google, and Facebook\n\nPlease contact the admin."}
};
export const tr=(lang,key,vars={})=>Object.entries(vars).reduce((v,[k,x])=>v.replaceAll(`{${k}}`,String(x)),(TEXT[lang]||TEXT.id)[key]||TEXT.id[key]||key);

export function safeEqual(a,b){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
export function authorized(req,env){const h=req.headers.get("authorization")||"";if(!env.ADMIN_PASSWORD||!h.startsWith("Basic "))return false;try{return atob(h.slice(6))===`admin:${env.ADMIN_PASSWORD}`;}catch{return false;}}
export async function tg(env,method,body){
  if(!env.BOT_TOKEN) throw new Error("BOT_TOKEN belum dikonfigurasi");
  const r=await fetch(`${TG}${env.BOT_TOKEN}/${method}`,{method:"POST",headers:H,body:JSON.stringify(body)});
  const raw=await r.text();
  let d; try { d=JSON.parse(raw); } catch { throw new Error(`Telegram API ${method} returned non-JSON (${r.status}): ${raw.slice(0,160)}`); }
  if(!r.ok || !d.ok) { console.error("Telegram API",method,d); throw new Error(`Telegram API ${method}: ${d.description||r.statusText||"request failed"}`); }
  return d;
}
export async function db(env,path,opts={}){
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw new Error("Supabase configuration is incomplete");
  const r=await fetch(`${env.SUPABASE_URL.replace(/\/$/,"")}/rest/v1/${path}`,{...opts,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,...H,...(opts.headers||{})}});
  if(!r.ok){const s=await r.text();console.error("Supabase",r.status,s);throw new Error(`Database error ${r.status}: ${s.slice(0,180)}`);}
  if(r.status===204||r.headers.get("content-length")==="0")return null;
  const t=await r.text();return t?JSON.parse(t):null;
}
export async function send(env,chat,text,markup){return tg(env,"sendMessage",{chat_id:chat,text,parse_mode:"HTML",...(markup?{reply_markup:markup}:{})});}
export async function delMessage(env,chat,message){try{return await tg(env,"deleteMessage",{chat_id:chat,message_id:message});}catch(e){console.warn("Could not delete chat message:",e.message);return null;}}
export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function edit(env,chat,message,text,markup){return tg(env,"editMessageText",{chat_id:chat,message_id:message,text,parse_mode:"HTML",...(markup?{reply_markup:markup}:{})});}
export async function user(env,id){return one(env,`bot_users?telegram_id=eq.${id}&select=*`);}
export async function saveUser(env,u,language){
  await db(env,"bot_users?on_conflict=telegram_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({telegram_id:u.id,first_name:u.first_name||"",username:u.username||"",...(language?{language}:{}),updated_at:new Date().toISOString()})});
}
export async function isAdmin(env,id){
  if(Number(id)===OWNER_ID)return true;
  return !!(await one(env,`bot_admins?telegram_id=eq.${id}&select=telegram_id`));
}
export async function getAdmins(env){return (await db(env,"bot_admins?select=*&order=created_at.asc"))||[];}
export async function groups(env){return (await db(env,"force_join?active=eq.true&select=*&order=created_at.asc"))||[];}
export async function joinedAll(env,id,selectedGroups=null){
  const gs=selectedGroups || await groups(env);
  for(const g of gs){
    try {
      const r=await tg(env,"getChatMember",{chat_id:g.chat_id,user_id:id});
      if(!["member","administrator","creator"].includes(r.result?.status))return false;
    } catch(e) {
      console.warn("Force-join membership check failed",g.id,e.message);
      return false;
    }
  }
  return true;
}
export async function gate(env,chat,id,lang){
  const gs=await groups(env);if(!gs.length)return true;
  if(await joinedAll(env,id,gs))return true;
  const isEn=lang==="en";
  await send(env,chat,isEn?"🔒 <b>Join required</b>\nJoin every channel/group below, then tap Verify.":"🔒 <b>Wajib bergabung</b>\nSilakan bergabung ke semua grup/channel berikut, lalu tekan Verifikasi.",kb([...gs.map(g=>[{text:g.name,url:g.invite_link}]),[{text:isEn?"✅ Verify":"✅ Verifikasi",callback_data:"gate:check"}]]));return false;
}
export async function packages(env){return (await db(env,"vip_packages?active=eq.true&select=*&order=sort_order.asc,created_at.asc"))||[];}
export async function stateSet(env,id,state){await db(env,"bot_states?on_conflict=telegram_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({telegram_id:id,state,updated_at:new Date().toISOString()})});}
export async function stateGet(env,id){return one(env,`bot_states?telegram_id=eq.${id}&select=*`);}
export async function stateClear(env,id){await db(env,`bot_states?telegram_id=eq.${id}`,{method:"DELETE"});}
export function slug(s){return String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,32)+"-"+Math.random().toString(36).slice(2,6);}
