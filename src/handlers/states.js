import { OWNER_ID, safeEqual, authorized, tg, db, send, edit, user, saveUser, isAdmin, getAdmins, groups, joinedAll, gate, packages, stateSet, stateGet, stateClear, slug, enc, one, kb, back, clean } from "../core.js";
import { vipHome, vipList, packageDetail, about, donate, createVipOrder, settleOrder } from "../features/vip.js";
import { latestDraft, updateDraftConfig, mediaConfig, beginUpload, extractMedia, saveIncomingMedia, finishUpload, cancelDraft, saveMediaLink, sendMediaToUser, accessMedia, settleMediaOrder } from "../features/media.js";

export async function handleTextState(env,msg){
  const id=msg.from.id,st=await stateGet(env,id);if(!st)return false;
  const v=msg.text||"";
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
    const row={name:p[1],description:p[2],price:Number(p[3]),invite_link:v.trim(),active:true,sort_order:10};
    if(editId)await db(env,`vip_packages?id=eq.${enc(editId)}`,{method:"PATCH",body:JSON.stringify(row)});
    else{row.id=slug(p[1]);await db(env,"vip_packages",{method:"POST",body:JSON.stringify(row)});}
    await stateClear(env,id);await send(env,msg.chat.id,"✅ Paket berhasil disimpan.");return true;
  }
  if(st.state==="group_add_name"){await stateSet(env,id,"group_add_link|"+v.trim());await send(env,msg.chat.id,"Kirim link undangan Telegram:");return true;}
  if(st.state.startsWith("group_add_link|")){await stateSet(env,id,"group_add_chat|"+st.state.split("|")[1]+"|"+v.trim());await send(env,msg.chat.id,"Kirim Chat ID numerik (contoh -100123...):");return true;}
  if(st.state.startsWith("group_add_chat|")){
    const p=st.state.split("|");if(!/^-?\d+$/.test(v.trim()))return send(env,msg.chat.id,"Chat ID tidak valid.");
    await db(env,"force_join",{method:"POST",body:JSON.stringify({name:p[1],invite_link:p[2],chat_id:v.trim(),active:true})});await stateClear(env,id);await send(env,msg.chat.id,"✅ Grup/channel wajib join ditambahkan.");return true;
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
  if(st.state==="media_title"){
    const d=await one(env,`media_drafts?admin_id=eq.${id}&status=eq.DRAFT&select=*&order=created_at.desc`);
    if(!d)return false;const cfg={...(d.config||{}),title:v.trim()};
    await db(env,`media_drafts?id=eq.${enc(d.id)}`,{method:"PATCH",body:JSON.stringify({config:cfg,stage:"ready"})});
    await stateClear(env,id);return mediaConfig(env,msg.chat.id,d.id);
  }
  if(st.state.startsWith("media_custom_expiry:")){
    const hours=Number(v),draftId=st.state.split(":")[1];if(!Number.isFinite(hours)||hours<=0||hours>8760)return send(env,msg.chat.id,"Masukkan jumlah jam 1 sampai 8760.");
    await updateDraftConfig(env,draftId,{expires_hours:hours});await stateClear(env,id);return mediaConfig(env,msg.chat.id,draftId);
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

