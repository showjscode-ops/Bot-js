import { OWNER_ID, safeEqual, authorized, tg, db, send, edit, user, saveUser, isAdmin, getAdmins, groups, joinedAll, gate, packages, stateSet, stateGet, stateClear, slug, enc, one, kb, back, clean } from "../core.js";
import { vipHome, vipList, packageDetail, about, donate, createVipOrder, settleOrder } from "../features/vip.js";
import { latestDraft, updateDraftConfig, mediaConfig, beginUpload, extractMedia, saveIncomingMedia, finishUpload, cancelDraft, saveMediaLink, sendMediaToUser, accessMedia, settleMediaOrder, catalogPage } from "../features/media.js";

export async function handleTextState(env,msg,ctx){
  const id=msg.from.id,st=await stateGet(env,id);if(!st)return false;
  const v=msg.text||"";

  if(st.state.startsWith("pkg_duration:")){
    const pid=st.state.split(":")[1],days=Number(v.trim());if(!Number.isInteger(days)||days<0||days>36500)return send(env,msg.chat.id,"Durasi harus 0 sampai 36500 hari (0 = permanen).");
    await db(env,`vip_packages?id=eq.${enc(pid)}`,{method:"PATCH",body:JSON.stringify({duration_days:days})});await stateClear(env,id);return send(env,msg.chat.id,"✅ Durasi paket diperbarui.",kb([back("adm:packages")]));
  }
  if(st.state.startsWith("group_edit_")){
    const p=st.state.split(":"),field=p[0].slice("group_edit_".length),gid=p[1];let patch={};
    if(field==="name"){if(!v.trim())return send(env,msg.chat.id,"Nama tidak boleh kosong.");patch.name=v.trim();}
    if(field==="link"){if(!/^https:\/\/(t\.me|telegram\.me)\//i.test(v.trim()))return send(env,msg.chat.id,"Link harus https://t.me/...");patch.invite_link=v.trim();}
    if(field==="chat"){if(!/^-?\d+$/.test(v.trim()))return send(env,msg.chat.id,"Chat ID tidak valid.");patch.chat_id=v.trim();}
    await db(env,`force_join?id=eq.${Number(gid)}`,{method:"PATCH",body:JSON.stringify(patch)});await stateClear(env,id);return send(env,msg.chat.id,"✅ Grup/channel diperbarui.",kb([back("adm:groups")]));
  }
  if(st.state==="broadcast_message"){
    if(!await isAdmin(env,id))return true;
    // PostgREST commonly caps a response at 1,000 rows; page through users instead
    // of silently broadcasting only to the first page.
    const targets=[];
    for(let offset=0;offset<50000;offset+=1000){
      const page=await db(env,`bot_users?select=telegram_id&order=telegram_id.asc&limit=1000&offset=${offset}`);
      targets.push(...(page||[]));
      if(!page||page.length<1000)break;
    }
    const gs=await db(env,"force_join?active=eq.true&select=chat_id,name");
    await stateSet(env,id,"broadcast_processing");
    await send(env,msg.chat.id,`⏳ Broadcast dimulai ke ${targets.length} pengguna dan ${(gs||[]).length} grup/channel. Hasil akan dikirim setelah proses selesai.`);
    const work=async()=>{
      let ok=0,fail=0;
      const destinations=[...targets.map(x=>x.telegram_id),...(gs||[]).map(g=>g.chat_id)];
      for(let offset=0;offset<destinations.length;offset+=15){
        const batch=destinations.slice(offset,offset+15);
        const results=await Promise.all(batch.map(async target=>{
          try{await tg(env,"copyMessage",{chat_id:target,from_chat_id:msg.chat.id,message_id:msg.message_id});return true;}
          catch(e){console.warn("Broadcast delivery failed:",target,e.message);return false;}
        }));
        ok+=results.filter(Boolean).length;fail+=results.length-results.filter(Boolean).length;
        await new Promise(r=>setTimeout(r,1000));
      }
      await stateClear(env,id);
      await send(env,msg.chat.id,`📢 Broadcast selesai.\nBerhasil: ${ok}\nGagal: ${fail}`,kb([back("adm:home")]));
    };
    const task=work().catch(async e=>{await stateClear(env,id);console.error("Broadcast failed",e);await send(env,msg.chat.id,`❌ Broadcast gagal: ${clean(e.message)}`);});
    if(ctx?.waitUntil)ctx.waitUntil(task);else await task;return true;
  }
  if(st.state==="vip_user_search"){
    const uid=v.trim();if(!/^\d+$/.test(uid))return send(env,msg.chat.id,"Masukkan Telegram User ID berupa angka.");
    await stateClear(env,id);const m=await one(env,`vip_members?telegram_id=eq.${uid}&select=*`);
    return send(env,msg.chat.id,`👤 User <code>${uid}</code>\nStatus: ${m?.active&&(!m.expires_at||new Date(m.expires_at)>new Date())?"VIP":"FREE"}\nBerakhir: ${m?.expires_at||"—"}`,kb([[{text:"👑 Upgrade VIP",callback_data:`adm:user-vip:${uid}`}],[{text:"🆓 Jadikan FREE",callback_data:`adm:user-free:${uid}`}],back("adm:users")]));
  }
  if(st.state.startsWith("vip_set_days:")){
    const uid=st.state.split(":")[1],days=Number(v.trim());
    if(!Number.isInteger(days)||days<0||days>36500)return send(env,msg.chat.id,"Masukkan jumlah hari 0 sampai 36500 (0 = permanen).");
    const expiry=days===0?null:new Date(Date.now()+days*86400000).toISOString();
    await db(env,"vip_members?on_conflict=telegram_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({telegram_id:Number(uid),active:true,expires_at:expiry,updated_by:id,updated_at:new Date().toISOString()})});
    await stateClear(env,id);return send(env,msg.chat.id,`✅ User ${uid} sekarang VIP${days?` selama ${days} hari`:" permanen"}.`,kb([back(`adm:user:${uid}`)]));
  }
  if(st.state.startsWith("published_")){
    const [field,mid]=st.state.slice("published_".length).split(":");let value;
    if(field==="title"){if(!v.trim())return send(env,msg.chat.id,"Judul tidak boleh kosong.");value={title:v.trim()};}
    else {const n=Number(v.trim());if(!Number.isInteger(n)||n<0)return send(env,msg.chat.id,"Masukkan angka 0 atau lebih.");if(field==="expiry"&&n>2820)return send(env,msg.chat.id,"Durasi maksimal 2820 menit (47 jam).");value=field==="price"?{price:n}:field==="expiry"?{expires_minutes:n||null}:{max_access:n||null};}
    await db(env,`media_links?id=eq.${enc(mid)}`,{method:"PATCH",body:JSON.stringify(value)});
    await stateClear(env,id);return send(env,msg.chat.id,"✅ Pengaturan media berhasil diperbarui.",kb([back(`adm:media-open:${mid}`)]));
  }
  if(v==="/cancel"){await stateClear(env,id);await send(env,msg.chat.id,"❎ Proses dibatalkan.");return true;}
  if(st.state==="admin_add"){
    const n=Number(v);if(!Number.isSafeInteger(n)||n<=0)return send(env,msg.chat.id,"Masukkan Telegram User ID numerik.");
    if(n===OWNER_ID){await stateClear(env,id);return send(env,msg.chat.id,"ID tersebut sudah menjadi owner.");}
    const admins=await getAdmins(env);if(admins.length>=3){await stateClear(env,id);return send(env,msg.chat.id,"Maksimal 3 admin tambahan sudah tercapai.");}
    await db(env,"bot_admins?on_conflict=telegram_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({telegram_id:n,added_by:id})});
    await stateClear(env,id);await send(env,msg.chat.id,"✅ Admin berhasil ditambahkan.");return true;
  }
  if(st.state==="pkg_add_name"||st.state.startsWith("pkg_edit_name:")){
    const editId=st.state.split(":")[1]||null;await stateSet(env,id,`${editId?"pkg_edit_desc:"+editId:"pkg_add_desc"}|${v.trim()}`);await send(env,msg.chat.id,"Kirim deskripsi paket:");return true;
  }
  if(st.state.startsWith("pkg_add_desc|")||st.state.startsWith("pkg_edit_desc:")){
    const parts=st.state.split("|"),name=parts[1]||"Paket VVIP";const editId=st.state.startsWith("pkg_edit_desc:")?st.state.split(":")[1]:null;
    await stateSet(env,id,`${editId?"pkg_edit_price:"+editId:"pkg_add_price"}|${name}|${v.trim()}`);await send(env,msg.chat.id,"Kirim harga dalam Rupiah (angka saja):");return true;
  }
  if(st.state.startsWith("pkg_add_price|")||st.state.startsWith("pkg_edit_price:")){
    const p=st.state.split("|"),editId=st.state.startsWith("pkg_edit_price:")?st.state.split(":")[1]:null,n=Number(v);
    if(!Number.isInteger(n)||n<2000||n>10000000)return send(env,msg.chat.id,"Harga harus Rp2.000 sampai Rp10.000.000.");
    const name=p[1],description=p[2];
    await stateSet(env,id,`${editId?"pkg_edit_link:"+editId:"pkg_add_link"}|${name}|${description}|${n}`);await send(env,msg.chat.id,"Kirim link undangan Telegram (https://t.me/...):");return true;
  }
  if(st.state.startsWith("pkg_add_link|")||st.state.startsWith("pkg_edit_link:")){
    const p=st.state.split("|"),editId=st.state.startsWith("pkg_edit_link:")?st.state.split(":")[1]:null;
    if(!/^https:\/\/(t\.me|telegram\.me)\//i.test(v.trim()))return send(env,msg.chat.id,"Link harus berupa https://t.me/...");
    const row={name:p[1],description:p[2],price:Number(p[3]),invite_link:v.trim(),duration_days:30,active:true,sort_order:10};
    if(editId)await db(env,`vip_packages?id=eq.${enc(editId)}`,{method:"PATCH",body:JSON.stringify(row)});
    else{row.id=slug(p[1]);await db(env,"vip_packages",{method:"POST",body:JSON.stringify(row)});}
    await stateClear(env,id);await send(env,msg.chat.id,"✅ Paket berhasil disimpan.");return true;
  }
  if(st.state==="group_add_name"||st.state.startsWith("group_add_name_media:")){const mediaDraft=st.state.startsWith("group_add_name_media:")?st.state.split(":")[1]:null;await stateSet(env,id,`${mediaDraft?"group_add_link_media:"+mediaDraft+"|":"group_add_link|"}`+v.trim());await send(env,msg.chat.id,"Kirim link undangan Telegram:",kb([back(mediaDraft?`med:groups:${mediaDraft}`:"adm:groups"),[{text:"❌ Batal",callback_data:mediaDraft?`med:groups:${mediaDraft}`:"adm:groups"}]]));return true;}
  if(st.state.startsWith("group_add_link|")||st.state.startsWith("group_add_link_media:")){const media=st.state.startsWith("group_add_link_media:");const rest=st.state.slice(media?"group_add_link_media:".length:"group_add_link|".length).split("|");await stateSet(env,id,media?`group_add_chat_media:${rest[0]}|${rest[1]}|${v.trim()}`:"group_add_chat|"+rest[0]+"|"+v.trim());await send(env,msg.chat.id,"Kirim Chat ID numerik (contoh -100123...). Pastikan bot sudah menjadi admin channel/grup.",kb([back(media?`med:groups:${rest[0]}`:"adm:groups"),[{text:"❌ Batal",callback_data:media?`med:groups:${rest[0]}`:"adm:groups"}]]));return true;}
  if(st.state.startsWith("group_add_chat|")||st.state.startsWith("group_add_chat_media:")){
    const media=st.state.startsWith("group_add_chat_media:"),rest=st.state.slice(media?"group_add_chat_media:".length:"group_add_chat|".length).split("|"),draftId=media?rest.shift():null;const [name,link]=rest;if(!/^-?\d+$/.test(v.trim()))return send(env,msg.chat.id,"Chat ID tidak valid.");
    const created=await db(env,"force_join",{method:"POST",headers:{"Prefer":"return=representation"},body:JSON.stringify({name,invite_link:link,chat_id:v.trim(),active:true})});await stateClear(env,id);await send(env,msg.chat.id,"✅ Grup/channel wajib join berhasil ditambahkan!",kb([[{text:"📢 Pilih channel ini",callback_data:media?`med:group-toggle:${draftId}:${created?.[0]?.id}`:"adm:groups"}],[{text:"⬅️ Kembali",callback_data:media?`med:groups:${draftId}`:"adm:groups"}],[{text:"❌ Batal",callback_data:"adm:home"}]]));return true;
  }
  if(st.state==="coupon_add_code"){await stateSet(env,id,"coupon_add_value|"+v.trim().toUpperCase());await send(env,msg.chat.id,"Kirim nilai diskon (angka; persen misalnya 20):");return true;}
  if(st.state.startsWith("coupon_add_value|")){
    const p=st.state.split("|"),n=Number(v);if(!Number.isFinite(n)||n<=0)return send(env,msg.chat.id,"Nilai diskon tidak valid.");
    await db(env,"vip_coupons",{method:"POST",body:JSON.stringify({code:p[1],discount_type:"percent",discount_value:n,active:true,used_count:0})});await stateClear(env,id);await send(env,msg.chat.id,"✅ Kode diskon dibuat sebagai potongan persen.");return true;
  }
  if(st.state.startsWith("coupon_use:")){
    const pkgId=st.state.split(":")[1],p=await one(env,`vip_packages?id=eq.${enc(pkgId)}&select=*`);await stateClear(env,id);
    try{await createVipOrder(env,msg.chat.id,id,p,v.trim());}catch(e){await send(env,msg.chat.id,`❌ ${clean(e.message)}`);}return true;
  }
  if(st.state==="media_catalog_search"){await stateClear(env,id);return catalogPage(env,msg.chat.id,0,v.trim());}
  if(st.state==="media_title"){
    const d=await one(env,`media_drafts?admin_id=eq.${id}&status=eq.DRAFT&select=*&order=created_at.desc`);
    if(!d)return false;const cfg={...(d.config||{}),title:v.trim()};
    await db(env,`media_drafts?id=eq.${enc(d.id)}`,{method:"PATCH",body:JSON.stringify({config:cfg,stage:"ready"})});
    await stateClear(env,id);return mediaConfig(env,msg.chat.id,d.id);
  }
  if(st.state.startsWith("media_custom_expiry:")){
    const minutes=Number(v),draftId=st.state.split(":")[1];if(!Number.isInteger(minutes)||minutes<=0||minutes>2820)return send(env,msg.chat.id,"Masukkan durasi dalam menit (1 sampai 2820 (maksimal 47 jam)).",kb([[{text:"❌ Batal",callback_data:`med:cancel:${draftId}`}]]));
    await updateDraftConfig(env,draftId,{expires_minutes:minutes,expires_hours:null});await stateClear(env,id);return mediaConfig(env,msg.chat.id,draftId);
  }
  if(st.state==="media_price"){
    const n=Number(v);if(!Number.isInteger(n)||n<0)return send(env,msg.chat.id,"Harga harus angka Rupiah, 0 untuk gratis.");
    const d=await latestDraft(env,id);if(!d)return false;await updateDraftConfig(env,d.id,{price:n});await stateClear(env,id);return mediaConfig(env,msg.chat.id,d.id);
  }
  if(st.state.startsWith("media_add_group:")){
    const dId=st.state.split(":")[1];await stateClear(env,id);const g=await one(env,`force_join?id=eq.${Number(v)}&select=*`);if(g){const d=await latestDraft(env,id);const cfg=d.config||{};cfg.required_groups=[...(cfg.required_groups||[]),g.id];await updateDraftConfig(env,dId,{required_groups:cfg.required_groups});}return mediaConfig(env,msg.chat.id,dId);
  }
  if(st.state==="media_allowed_user"){
    const d=await latestDraft(env,id);if(!d)return false;const ids=v.split(/[,\s]+/).map(Number).filter(x=>Number.isSafeInteger(x)&&x>0);await updateDraftConfig(env,d.id,{allowed_users:ids});await stateClear(env,id);return mediaConfig(env,msg.chat.id,d.id);
  }
  return false;
}

