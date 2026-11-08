const TG = "https://api.telegram.org/bot";
const headers = {"content-type":"application/json"};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/webhook" && request.method === "POST") {
      if (!env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("Webhook secret is not configured", { status: 503 });
      }
      const suppliedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
      if (suppliedSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
      try {
        const update = await request.json();
        await handleUpdate(update, env);
        return new Response("ok");
      } catch (error) {
        console.error("Webhook processing failed:", error);
        return new Response("Webhook processing failed", { status: 500 });
      }
    }
    if (url.pathname === "/admin" && request.method === "GET") {
      if (!authorized(request, env)) return new Response("Unauthorized", {status:401,headers:{ "WWW-Authenticate":"Basic realm=Bot Admin"}});
      return new Response(adminHtml(), {headers:{"content-type":"text/html; charset=utf-8"}});
    }
    if (url.pathname.startsWith("/api/admin/")) {
      if (!authorized(request, env)) return new Response("Unauthorized", {status:401});
      return adminApi(request, env, url);
    }
    return new Response("Telegram bot is running.");
  }
};

function authorized(req, env) {
  const h = req.headers.get("authorization") || "";
  if (!env.ADMIN_PASSWORD || !h.startsWith("Basic ")) return false;
  try { return atob(h.slice(6)) === `admin:${env.ADMIN_PASSWORD}`; } catch { return false; }
}
async function tg(env, method, body) {
  const r=await fetch(`${TG}${env.BOT_TOKEN}/${method}`,{method:"POST",headers,body:JSON.stringify(body)});
  const data=await r.json();
  if (!data.ok) console.log("Telegram API:",data);
  return data;
}
async function db(env, path, options={}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase configuration is incomplete");
  }
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...headers,
      ...(options.headers || {})
    }
  });
  if (!r.ok) {
    const detail = await r.text();
    console.error("Supabase request failed:", r.status, detail);
    throw new Error(`Supabase request failed (${r.status})`);
  }
  if (r.status === 204 || r.headers.get("content-length") === "0") return null;
  return r.json();
}
async function saveUser(env, id, data) {
  await db(env,"bot_users?on_conflict=telegram_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({telegram_id:id,...data,updated_at:new Date().toISOString()})});
}
async function getUser(env,id) {
  const a=await db(env,`bot_users?telegram_id=eq.${id}&select=*`);
  return a?.[0]||null;
}
async function getGroups(env) {
  return (await db(env,"force_join?active=eq.true&select=*&order=created_at.asc"))||[];
}
async function send(env,chat_id,text,reply_markup) {
  return tg(env,"sendMessage",{chat_id,text,parse_mode:"HTML", ...(reply_markup?{reply_markup}:{})});
}
const langKeyboard={inline_keyboard:[[{text:"🇮🇩 Bahasa Indonesia",callback_data:"lang:id"}],[{text:"🇬🇧 English",callback_data:"lang:en"}]]};
function t(lang,id,en){return lang==="en"?en:id;}
async function showGate(env,chatId,lang) {
  const groups=await getGroups(env);
  const rows=groups.map(g=>[{text:g.name,url:g.invite_link}]);
  rows.push([{text:t(lang,"✅ Saya sudah bergabung","✅ I have joined"),callback_data:"verify_join"}]);
  await send(env,chatId,t(lang,"Untuk melanjutkan, silakan bergabung terlebih dahulu ke group/channel berikut:","To continue, please join the following groups/channels first:"),{inline_keyboard:rows});
}
async function joinedAll(env,userId) {
  const groups=await getGroups(env);
  for (const g of groups) {
    if (!g.chat_id) return false;
    const r=await tg(env,"getChatMember",{chat_id:g.chat_id,user_id:userId});
    const s=r?.result?.status;
    if (!r.ok || !["member","administrator","creator"].includes(s)) return false;
  }
  return true;
}
async function mainMenu(env,chatId,user,lang) {
  const name=(user.first_name||"").replace(/[<>&]/g,"");
  await send(env,chatId,`${t(lang,"🎉 Selamat datang","🎉 Welcome")}, <b>${name||"there"}</b>!\n\n${t(lang,"Silakan pilih fitur yang sedang Anda cari:","Please choose the feature you are looking for:")}`,{
    inline_keyboard:[
      [{text:"🎬 Video/Media",callback_data:"feature:media"},{text:"👑 Group VIP",callback_data:"feature:vip"}],
      [{text:"📱 Beli Nomor",callback_data:"feature:number"},{text:"🌐 Website",callback_data:"feature:website"}]
    ]
  });
}
async function gateOrMenu(env,chatId,user,lang) {
  if (!(await joinedAll(env,user.id))) return showGate(env,chatId,lang);
  await mainMenu(env,chatId,user,lang);
}
async function handleUpdate(u,env) {
  if (u.chat_member) {
    const cm=u.chat_member;
    if (["member","administrator","creator"].includes(cm.new_chat_member?.status)) {
      const user = cm.new_chat_member?.user;
      if (user?.id) {
        const pref = await getUser(env, user.id);
        if (pref?.language) await gateOrMenu(env, user.id, user, pref.language);
      }
    }
    return;
  }
  const msg=u.message;
  if (msg) {
    const id=msg.from.id, chat=msg.chat.id;
    if (msg.text==="/start") {
      const old=await getUser(env,id);
      if (!old?.language) {
        await saveUser(env,id,{first_name:msg.from.first_name||"",username:msg.from.username||"",language:null});
        await send(env,chat,"🌐 <b>Pilih bahasa / Choose your language</b>",langKeyboard);
      } else await gateOrMenu(env,chat,msg.from,old.language);
    }
  }
  const q=u.callback_query;
  if (!q) return;
  const data=q.data||"", user=q.from, chat=q.message.chat.id;
  await tg(env,"answerCallbackQuery",{callback_query_id:q.id});
  if (data.startsWith("lang:")) {
    const language=data.split(":")[1]==="en"?"en":"id";
    await saveUser(env,user.id,{first_name:user.first_name||"",username:user.username||"",language});
    await tg(env,"editMessageReplyMarkup",{chat_id:chat,message_id:q.message.message_id,reply_markup:{inline_keyboard:[]}});
    await gateOrMenu(env,chat,user,language);
  } else if (data==="verify_join") {
    const pref=await getUser(env,user.id), lang=pref?.language||"id";
    if (await joinedAll(env,user.id)) {
      await tg(env,"editMessageReplyMarkup",{chat_id:chat,message_id:q.message.message_id,reply_markup:{inline_keyboard:[]}});
      await mainMenu(env,chat,user,lang);
    } else {
      await send(env,chat,t(lang,"❌ Anda belum bergabung ke semua group/channel. Silakan bergabung lalu tekan tombol verifikasi.","❌ You have not joined all required groups/channels. Join them and tap verify again."));
    }
  } else if (data.startsWith("feature:")) {
    const pref=await getUser(env,user.id), lang=pref?.language||"id";
    const labels={media:"Video/Media",vip:"Group VIP",number:"Beli Nomor",website:"Website"};
    await send(env,chat,`${labels[data.split(":")[1]]}\n\n${t(lang,"Fitur ini sedang disiapkan. Silakan kembali lagi nanti.","This feature is being prepared. Please check back later.")}`,{inline_keyboard:[[{text:t(lang,"⬅️ Kembali ke menu","⬅️ Back to menu"),callback_data:"back_menu"}]]});
  } else if (data==="back_menu") {
    const pref=await getUser(env,user.id);
    await gateOrMenu(env,chat,user,pref?.language||"id");
  }
}
async function adminApi(req,env,url) {
  if (url.pathname==="/api/admin/groups" && req.method==="GET") return Response.json(await db(env,"force_join?select=*&order=created_at.desc"));
  if (url.pathname==="/api/admin/groups" && req.method==="POST") {
    const b=await req.json();
    if (typeof b.name !== "string" || !b.name.trim() || typeof b.invite_link !== "string" || !/^https:\/\/(t\.me|telegram\.me)\//i.test(b.invite_link) || typeof b.chat_id !== "string" || !/^-?\d+$/.test(b.chat_id.trim())) {
      return Response.json({error:"Nama, link Telegram yang valid, dan chat ID numerik wajib diisi."},{status:400});
    }
    return Response.json(await db(env,"force_join",{method:"POST",headers:{"Prefer":"return=representation"},body:JSON.stringify({name:b.name.trim(),invite_link:b.invite_link.trim(),chat_id:b.chat_id.trim(),active:true})}));
  }
  const m = url.pathname.match(/^\/api\/admin\/groups\/(\d+)$/);
  if (m && req.method==="PATCH") {
    const b=await req.json();
    const patch = {};
    if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim();
    if (typeof b.invite_link === "string" && /^https:\/\/(t\.me|telegram\.me)\//i.test(b.invite_link)) patch.invite_link = b.invite_link.trim();
    if (typeof b.chat_id === "string" && /^-?\d+$/.test(b.chat_id.trim())) patch.chat_id = b.chat_id.trim();
    if (typeof b.active === "boolean") patch.active = b.active;
    if (!Object.keys(patch).length) return Response.json({error:"Tidak ada perubahan yang valid."},{status:400});
    return Response.json(await db(env,`force_join?id=eq.${m[1]}`,{method:"PATCH",headers:{"Prefer":"return=representation"},body:JSON.stringify(patch)}));
  }
  if (m && req.method==="DELETE") {
    await db(env,`force_join?id=eq.${m[1]}`,{method:"DELETE"}); return Response.json({ok:true});
  }
  return new Response("Not found",{status:404});
}
function adminHtml(){return `<!doctype html><html lang="id"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bot Admin</title><style>
*{box-sizing:border-box}body{margin:0;background:#0b1020;color:#e8eefc;font:15px system-ui;padding:28px}.wrap{max-width:900px;margin:auto}.card{background:#141d32;border:1px solid #283652;border-radius:18px;padding:22px;margin:16px 0}h1{margin:0 0 8px}p{color:#9eacc5}input{width:100%;padding:12px;border-radius:10px;border:1px solid #344461;background:#0c1528;color:white;margin:6px 0 12px}button{border:0;border-radius:10px;padding:11px 16px;background:#4f7cff;color:white;font-weight:700;cursor:pointer;margin:4px}button.danger{background:#b83c52}.item{padding:14px 0;border-top:1px solid #2b3852;display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap}.muted{color:#9eacc5;font-size:13px}</style><div class="wrap"><h1>⚙️ Bot Admin</h1><p>Kelola daftar wajib join group/channel Telegram.</p><div class="card"><h3>Tambah group / channel</h3><label>Nama tampilan</label><input id="name" placeholder="Contoh: Channel Update"><label>Link undangan</label><input id="link" placeholder="https://t.me/..."><label>Chat ID</label><input id="chat" placeholder="-1001234567890"><button onclick="add()">+ Tambahkan</button><p class="muted">Bot harus menjadi admin di setiap channel/group agar pemeriksaan keanggotaan dapat dilakukan.</p></div><div class="card"><h3>Daftar force join</h3><div id="list">Memuat...</div></div></div><script>
async function api(path,method="GET",body){let r=await fetch(path,{method,headers:{"content-type":"application/json"},body:body?JSON.stringify(body):undefined});let d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Permintaan gagal");return d}
async function load(){
  const rows=await api("/api/admin/groups");
  const list=document.querySelector("#list");
  list.textContent="";
  if(!Array.isArray(rows)||rows.length===0){list.textContent="Belum ada daftar force join.";return;}
  rows.forEach(function(x){
    const item=document.createElement("div"); item.className="item";
    const info=document.createElement("div");
    const title=document.createElement("b"); title.textContent=String(x.name||"");
    const detail=document.createElement("div"); detail.className="muted";
    detail.textContent=String(x.invite_link||"")+" · "+String(x.chat_id||"");
    info.append(title,detail);
    const actions=document.createElement("div");
    const editButton=document.createElement("button"); editButton.textContent="Edit";
    editButton.addEventListener("click",function(){edit(x.id,x.name||"",x.invite_link||"",x.chat_id||"");});
    const deleteButton=document.createElement("button"); deleteButton.className="danger"; deleteButton.textContent="Hapus";
    deleteButton.addEventListener("click",function(){del(x.id);});
    actions.append(editButton,deleteButton); item.append(info,actions); list.append(item);
  });
}
async function add(){try{await api("/api/admin/groups","POST",{name:document.querySelector("#name").value,invite_link:document.querySelector("#link").value,chat_id:document.querySelector("#chat").value});document.querySelector("#name").value="";document.querySelector("#link").value="";document.querySelector("#chat").value="";await load();}catch(e){alert(e.message)}}
async function edit(id,n,l,c){let nn=prompt("Nama",n);if(nn===null)return;let ll=prompt("Link undangan",l);if(ll===null)return;let cc=prompt("Chat ID",c);if(cc===null)return;try{await api("/api/admin/groups/"+id,"PATCH",{name:nn,invite_link:ll,chat_id:cc});await load();}catch(e){alert(e.message)}}
async function del(id){if(!confirm("Hapus daftar ini?"))return;try{await api("/api/admin/groups/"+id,"DELETE");await load();}catch(e){alert(e.message)}}
load().catch(function(e){document.querySelector("#list").textContent="Gagal memuat: "+e.message;});
</script></html>`}
