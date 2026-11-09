export const TG = "https://api.telegram.org/bot";
export const CASHI = "https://cashi.id/api";
export const OWNER_ID = 6665664367;
export const H = {"content-type":"application/json"};
export const enc=s=>encodeURIComponent(String(s));
export const one=async(env,path)=>((await db(env,path))||[])[0]||null;
export const kb=rows=>({inline_keyboard:rows});
export const back=(data="vip:home")=>[{text:"⬅️ Kembali",callback_data:data}];
export const clean=s=>String(s||"").replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]));

export function safeEqual(a,b){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
export function authorized(req,env){const h=req.headers.get("authorization")||"";if(!env.ADMIN_PASSWORD||!h.startsWith("Basic "))return false;try{return atob(h.slice(6))===`admin:${env.ADMIN_PASSWORD}`;}catch{return false;}}
export async function tg(env,method,body){
  if(!env.BOT_TOKEN) throw new Error("BOT_TOKEN belum dikonfigurasi");
  const r=await fetch(`${TG}${env.BOT_TOKEN}/${method}`,{method:"POST",headers:H,body:JSON.stringify(body)});
  const d=await r.json(); if(!d.ok) console.error("Telegram API",method,d); return d;
}
export async function db(env,path,opts={}){
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw new Error("Supabase configuration is incomplete");
  const r=await fetch(`${env.SUPABASE_URL.replace(/\/$/,"")}/rest/v1/${path}`,{...opts,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,...H,...(opts.headers||{})}});
  if(!r.ok){const s=await r.text();console.error("Supabase",r.status,s);throw new Error(`Database error ${r.status}: ${s.slice(0,180)}`);}
  if(r.status===204||r.headers.get("content-length")==="0")return null;
  const t=await r.text();return t?JSON.parse(t):null;
}
export async function send(env,chat,text,markup){return tg(env,"sendMessage",{chat_id:chat,text,parse_mode:"HTML",...(markup?{reply_markup:markup}:{})});}
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
export async function joinedAll(env,id){
  for(const g of await groups(env)){const r=await tg(env,"getChatMember",{chat_id:g.chat_id,user_id:id});if(!r.ok||!["member","administrator","creator"].includes(r.result?.status))return false;}return true;
}
export async function gate(env,chat,id,lang){
  const gs=await groups(env);if(!gs.length)return true;
  if(await joinedAll(env,id))return true;
  await send(env,chat,"🔒 <b>Gabung terlebih dahulu</b>\nSilakan bergabung ke semua grup/channel berikut, lalu tekan Verifikasi.",kb([...gs.map(g=>[{text:g.name,url:g.invite_link}]),[{text:"✅ Verifikasi",callback_data:"gate:check"}]]));return false;
}
export async function packages(env){return (await db(env,"vip_packages?active=eq.true&select=*&order=sort_order.asc,created_at.asc"))||[];}
export async function stateSet(env,id,state){await db(env,"bot_states?on_conflict=telegram_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({telegram_id:id,state,updated_at:new Date().toISOString()})});}
export async function stateGet(env,id){return one(env,`bot_states?telegram_id=eq.${id}&select=*`);}
export async function stateClear(env,id){await db(env,`bot_states?telegram_id=eq.${id}`,{method:"DELETE"});}
export function slug(s){return String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,32)+"-"+Math.random().toString(36).slice(2,6);}
