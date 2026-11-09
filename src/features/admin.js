import { OWNER_ID, safeEqual, authorized, tg, db, send, edit, user, saveUser, isAdmin, getAdmins, groups, joinedAll, gate, packages, stateSet, stateGet, stateClear, slug, enc, one, kb, back, clean } from "../core.js";

export async function adminHome(env,chat,id){
  if(!await isAdmin(env,id))return send(env,chat,"⛔ Kamu tidak memiliki akses admin.");
  await send(env,chat,"🛠️ <b>Panel Admin Book keep</b>\nPilih pengaturan:",kb([
    [{text:"👥 Kelola Admin",callback_data:"adm:admins"},{text:"👑 Kelola VVIP",callback_data:"adm:packages"}],
    [{text:"📢 Force Sub (wajib saat /start)",callback_data:"adm:force-sub"}],
    [{text:"🎬 Wajib Join Media",callback_data:"adm:groups"}],
    [{text:"🎟️ Kode Diskon",callback_data:"adm:coupons"}],
    [{text:"📊 Statistik",callback_data:"adm:stats"}],
    [{text:"📤 Upload Media",callback_data:"upload:start"},{text:"🎬 Kelola Media",callback_data:"adm:media"}],
    [{text:"👤 Kelola VIP/FREE",callback_data:"adm:users"}],
    [{text:"📢 Broadcast",callback_data:"adm:broadcast"}],
    [{text:"🖼️ Watermark Media",callback_data:"adm:watermark"}]
  ]));
}

export async function adminPanel(env,chat,id,section){
  if(!await isAdmin(env,id))return;
  if(section==="admins"){
    const a=await getAdmins(env),rows=a.map(x=>[{text:`❌ Hapus ${x.telegram_id}`,callback_data:`adm:admin-del:${x.telegram_id}`}]);
    await send(env,chat,`👥 <b>Kelola Admin</b>\nOwner tetap: <code>${OWNER_ID}</code>\nAdmin tambahan: ${a.length}/3\n\nTambahkan admin dengan ID Telegram.`,kb([[{text:"➕ Tambah Admin",callback_data:"adm:admin-add"}],...rows,back("adm:home")]));
  }else if(section==="packages"){
    const p=await db(env,"vip_packages?select=*&order=sort_order.asc");
    const rows=(p||[]).flatMap(x=>[[{text:`✏️ ${x.name}`,callback_data:`adm:pkg-edit:${x.id}`},{text:x.active?"🟢":"⚪",callback_data:`adm:pkg-toggle:${x.id}`},{text:"🗑️",callback_data:`adm:pkg-del:${x.id}`}],[{text:`⏳ Durasi ${x.duration_days??30} hari`,callback_data:`adm:pkg-duration:${x.id}`}]]);
    await send(env,chat,"👑 <b>Kelola Paket VVIP</b>\nTambah, ubah harga/nama/deskripsi/link, atau nonaktifkan paket.",kb([[{text:"➕ Tambah Paket",callback_data:"adm:pkg-add"}],...rows,back("adm:home")]));
  }else if(section==="groups"){
    const g=await db(env,"force_join?select=*&order=created_at.asc");
    const rows=(g||[]).map(x=>[{text:`✏️ ${x.name}`,callback_data:`adm:group-edit:${x.id}`},{text:"🗑️",callback_data:`adm:group-del:${x.id}`}]);
    await send(env,chat,"🎬 <b>Grup/Channel Wajib Join Media</b>\nGrup di sini hanya diperiksa saat pengguna membuka media yang dipilih admin.",kb([[{text:"➕ Tambah Grup/Channel",callback_data:"adm:group-add"}],...rows,back("adm:home")]));
  }else if(section==="force_sub"){
    const g=await db(env,"force_sub_groups?select=*&order=created_at.asc");
    const rows=(g||[]).map(x=>[{text:`${x.active?"🟢":"⚪"} ${x.name}`,callback_data:`adm:fs-edit:${x.id}`},{text:"🗑️",callback_data:`adm:fs-del:${x.id}`}]);
    await send(env,chat,"📢 <b>Force Sub Global</b>\nGrup/channel di sini wajib diikuti saat pengguna menjalankan /start atau membuka menu bot. Ini terpisah dari wajib join media.",kb([[{text:"➕ Tambah Force Sub",callback_data:"adm:fs-add"}],...rows,back("adm:home")]));
  }else if(section==="coupons"){
    const c=await db(env,"vip_coupons?select=*&order=created_at.desc");
    const rows=(c||[]).map(x=>[{text:`${x.code} · ${x.active?"Aktif":"Nonaktif"}`,callback_data:`adm:coupon-toggle:${x.id}`}]);
    await send(env,chat,"🎟️ <b>Kode Diskon</b>",kb([[{text:"➕ Buat Kode",callback_data:"adm:coupon-add"}],...rows,back("adm:home")]));
  }else if(section==="stats"){
    const [u,o,m]=await Promise.all([db(env,"bot_users?select=telegram_id"),db(env,"vip_orders?select=order_id&status=eq.PAID"),db(env,"media_links?select=id")]);
    await send(env,chat,`📊 <b>Statistik Bot</b>\nPengguna: ${(u||[]).length}\nTransaksi VVIP berhasil: ${(o||[]).length}\nLink media dibuat: ${(m||[]).length}`,kb([back("adm:home")]));
  }
  else if(section==="media"){
    const a=await db(env,"media_links?select=id,title,price,active,access_count&order=created_at.desc&limit=40");
    const rows=(a||[]).map(x=>[{text:`${x.active?"🟢":"⚪"} ${(x.title||"Media").slice(0,32)} · ${x.id}`,callback_data:`adm:media-open:${x.id}`}]);
    await send(env,chat,`🎬 <b>Kelola Media Terbit</b>\nMenampilkan ${(a||[]).length} media terbaru. Pilih media untuk mengeditnya.`,kb([...rows,[{text:"🔄 Muat ulang",callback_data:"adm:media-refresh"}],back("adm:home")]));
  }else if(section==="users"){
    await send(env,chat,"👤 <b>Kelola VIP / FREE</b>\nCari pengguna dengan Telegram User ID, lalu upgrade VIP atau ubah kembali menjadi FREE.",kb([[{text:"🔎 Cari User ID",callback_data:"adm:user-search"}],back("adm:home")]));
  }
}

export async function adminApi(req,env,url){
  if(url.pathname==="/api/admin/groups"&&req.method==="GET")return Response.json(await db(env,"force_join?select=*&order=created_at.desc"));
  if(url.pathname==="/api/admin/groups"&&req.method==="POST"){const b=await req.json();if(!b.name||!/^https:\/\/(t\.me|telegram\.me)\//i.test(b.invite_link||"")||! /^-?\d+$/.test(String(b.chat_id||"")))return Response.json({error:"Nama, link Telegram, dan Chat ID wajib valid."},{status:400});return Response.json(await db(env,"force_join",{method:"POST",headers:{"Prefer":"return=representation"},body:JSON.stringify({name:b.name,invite_link:b.invite_link,chat_id:String(b.chat_id),active:true})}));}
  const m=url.pathname.match(/^\/api\/admin\/groups\/(\d+)$/);if(m&&req.method==="PATCH")return Response.json(await db(env,`force_join?id=eq.${m[1]}`,{method:"PATCH",headers:{"Prefer":"return=representation"},body:JSON.stringify(await req.json())}));if(m&&req.method==="DELETE"){await db(env,`force_join?id=eq.${m[1]}`,{method:"DELETE"});return Response.json({ok:true});}
  if(url.pathname==="/api/admin/watermark"&&req.method==="GET"){
    const rows=await db(env,"bot_settings?key=in.(watermark_template,watermark_links)&select=key,value");return Response.json(Object.fromEntries((rows||[]).map(x=>[x.key,x.value])));
  }
  if(url.pathname==="/api/admin/watermark"&&req.method==="PUT"){
    const b=await req.json();if(typeof b.template!=="string"||!Array.isArray(b.links)||b.links.some(x=>!x.label||!/^https:\/\/(t\.me|telegram\.me)\//i.test(x.url||"")))return Response.json({error:"Template atau tautan watermark tidak valid."},{status:400});
    for(const [key,value] of [["watermark_template",b.template],["watermark_links",b.links]])await db(env,"bot_settings?on_conflict=key",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({key,value,updated_at:new Date().toISOString()})});return Response.json({ok:true});
  }
  return new Response("Not found",{status:404});
}

export function adminHtml(){return `<!doctype html><html lang="id"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Book keep Admin</title><style>*{box-sizing:border-box}body{margin:0;background:#0b1020;color:#e8eefc;font:15px system-ui;padding:24px}.wrap{max-width:850px;margin:auto}.card{background:#141d32;border:1px solid #283652;border-radius:16px;padding:20px;margin:14px 0}input{width:100%;padding:12px;border-radius:9px;border:1px solid #344461;background:#0c1528;color:white;margin:6px 0 12px}button{border:0;border-radius:9px;padding:11px 15px;background:#4f7cff;color:white;font-weight:700;cursor:pointer}.item{padding:12px 0;border-top:1px solid #2b3852}.muted{color:#9eacc5;font-size:13px}button:disabled{opacity:.55;cursor:wait}button.busy:after{content:"";display:inline-block;width:12px;height:12px;margin-left:8px;border:2px solid #fff;border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style><div class="wrap"><h1>⚙️ Book keep Admin</h1><div class="card"><h3>Tambah grup/channel wajib join</h3><label>Nama</label><input id="name"><label>Link undangan</label><input id="link" placeholder="https://t.me/..."><label>Chat ID</label><input id="chat" placeholder="-100..."><button onclick="withBusy(this,add)">Simpan grup</button><p class="muted">Bot harus menjadi admin pada grup/channel agar dapat memeriksa anggota.</p></div><div class="card"><h3>Daftar grup</h3><div id="list">Memuat...</div></div><div class="card"><h3>Watermark Media</h3><label>Template caption</label><textarea id="wmtemplate" rows="4" style="width:100%;padding:12px;border-radius:9px;background:#0c1528;color:white;border:1px solid #344461"></textarea><p class="muted">Placeholder: {number}, {bot}, {title}. Contoh: Media ke {number}\nBot: {bot}</p><label>Daftar tautan (satu per baris: Nama | URL)</label><textarea id="wmlinks" rows="5" style="width:100%;padding:12px;border-radius:9px;background:#0c1528;color:white;border:1px solid #344461"></textarea><button onclick="withBusy(this,saveWatermark)">Simpan watermark</button><p class="muted">Tautan dapat ditambah, diedit, atau dihapus di sini.</p></div></div><script>async function withBusy(b,fn){if(!b||b.disabled)return;const old=b.textContent;b.disabled=true;b.classList.add("busy");b.textContent="Memproses...";try{await fn()}catch(e){alert(e.message||"Permintaan gagal")}finally{b.disabled=false;b.classList.remove("busy");b.textContent=old}}async function api(p,m="GET",b){let r=await fetch(p,{method:m,headers:{"content-type":"application/json"},body:b?JSON.stringify(b):undefined}),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Gagal");return d}async function load(){let a=await api("/api/admin/groups"),l=document.querySelector("#list");l.textContent="";a.forEach(x=>{let d=document.createElement("div");d.className="item";let t=document.createElement("b");t.textContent=x.name;let s=document.createElement("div");s.className="muted";s.textContent=x.invite_link+" · "+x.chat_id;let e=document.createElement("button");e.textContent="Edit";e.onclick=()=>withBusy(e,async()=>{let n=prompt("Nama",x.name);if(n===null)return;let u=prompt("Link",x.invite_link);if(u===null)return;let c=prompt("Chat ID",x.chat_id);if(c===null)return;if(n&&u&&c){await api("/api/admin/groups/"+x.id,"PATCH",{name:n,invite_link:u,chat_id:c});await load()}});let z=document.createElement("button");z.textContent="Hapus";z.onclick=()=>withBusy(z,async()=>{if(confirm("Hapus?")){await api("/api/admin/groups/"+x.id,"DELETE");await load()}});d.append(t,s,e,z);l.append(d)})}async function add(){try{const n=document.querySelector("#name"),l=document.querySelector("#link"),c=document.querySelector("#chat");await api("/api/admin/groups","POST",{name:n.value,invite_link:l.value,chat_id:c.value});n.value=l.value=c.value="";await load()}catch(e){alert(e.message)}}async function loadWatermark(){let x=await api("/api/admin/watermark");document.querySelector("#wmtemplate").value=typeof x.watermark_template==="string"?x.watermark_template:"Media ke {number}\\nBot: {bot}";document.querySelector("#wmlinks").value=(x.watermark_links||[]).map(v=>v.label+" | "+v.url).join("\\n")}async function saveWatermark(){try{let links=document.querySelector("#wmlinks").value.split(/\\n/).map(s=>s.trim()).filter(Boolean).map(s=>{let p=s.split("|");return {label:(p.shift()||"").trim(),url:p.join("|").trim()}});await api("/api/admin/watermark","PUT",{template:document.querySelector("#wmtemplate").value,links});alert("Watermark tersimpan") }catch(e){alert(e.message)}}load().catch(e=>document.querySelector("#list").textContent=e.message);loadWatermark().catch(e=>console.warn(e))</script></html>`}

