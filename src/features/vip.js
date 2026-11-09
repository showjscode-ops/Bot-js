import { safeEqual, authorized, tg, db, send, edit, user, saveUser, isAdmin, getAdmins, groups, joinedAll, gate, packages, stateSet, stateGet, stateClear, slug, enc, one, kb, back, clean } from "../core.js";
import { cashiCreate, sendCashiQr, checkCashi, startStars, checkOrder } from "../payments/index.js";

export async function vipHome(env,chat){
  await send(env,chat,"👑 <b>Group VIP</b>\n\nPilih Daftar VVIP, lihat paket yang tersedia, atau dukung pengembangan bot.",kb([
    [{text:"📚 Pilih Daftar VVIP",callback_data:"vip:list"}],
    [{text:"🔎 Lihat Daftar VVIP",callback_data:"vip:list"}],
    [{text:"❤️‍🔥 Donasi",callback_data:"vip:donate"},{text:"🌟 About",callback_data:"vip:about"}],
    back("menu:home")
  ]));
}

export async function vipList(env,chat){
  const ps=await packages(env);
  const rows=ps.map(p=>[{text:p.name,callback_data:`vip:pkg:${p.id}`}]);
  rows.push(back("vip:home"));
  await send(env,chat,`📚 <b>Daftar VVIP Group</b>\n\n<b>Bot:</b> Book keep\n<b>Keterangan:</b> Daftar paket eksklusif. Klik paket untuk detail lengkap dan penawaran spesial.`,kb(rows));
}

export async function packageDetail(env,chat,id){
  const p=await one(env,`vip_packages?id=eq.${enc(id)}&active=eq.true&select=*`);
  if(!p){await send(env,chat,"Paket tidak ditemukan atau sedang tidak tersedia.",kb([back("vip:list")]));return;}
  await send(env,chat,`✨ <b>Detail Paket VVIP</b>\n\n<b>Nama Paket:</b> ${clean(p.name)}\n<b>Deskripsi:</b> ${clean(p.description)}\n<b>Harga Normal:</b> Rp${Number(p.price).toLocaleString("id-ID")}\n\nSilakan klik tombol Bayar di bawah untuk melanjutkan!`,kb([
    [{text:`💳 Bayar Rp${Number(p.price).toLocaleString("id-ID")}`,callback_data:`vip:pay:${p.id}`}],
    [{text:"🎟️ Gunakan Code Discount",callback_data:`vip:coupon:${p.id}`}],
    back("vip:list")
  ]));
}

export async function about(env,chat){
  await send(env,chat,`🌟 <b>Tentang Bot Fitur VVIP Ini</b>\nSelamat datang! Saya adalah asisten otomatis yang dirancang untuk memberikan Anda kemudahan dalam mengakses grup VVIP.\n\n🤖 <b>Fungsi Utama Saya</b>\n• Pembayaran otomatis dan aman via QRIS\n• Akses instan setelah transaksi berhasil\n• Konfirmasi tanpa menunggu konfirmasi manual\n\n🚀 <b>Alur Penggunaan</b>\n1. Pilih paket — jelajahi daftar VVIP yang tersedia\n2. Lakukan pembayaran — scan QRIS yang saya berikan\n3. Akses instan — link undangan terkirim otomatis setelah pembayaran terkonfirmasi.`,kb([back("vip:home")]));
}

export async function donate(env,chat){
  await send(env,chat,"❤️‍🔥 <b>Dukung Kami dengan Telegram Stars</b>\n\nSetiap Star yang Anda berikan memberi kami semangat untuk terus berinovasi.\n\n<b>Jumlah · Keterangan</b>\n50 ⭐ · Dukungan kecil\n100 ⭐ · Dukungan sedang\n150 ⭐ · Dukungan besar\n200 ⭐ · Dukungan spesial",kb([[50,100,150,200].map(n=>({text:`${n} ⭐`,callback_data:`stars:${n}`})) ,back("vip:home")]));
}

export async function createVipOrder(env,chat,userId,pkg,coupon){
  let amount=Number(pkg.price),discount=0,couponId=null;
  if(coupon){
    const c=await one(env,`vip_coupons?code=eq.${enc(coupon.toUpperCase())}&active=eq.true&select=*`);
    if(!c)throw new Error("Kode diskon tidak valid.");
    if(c.package_id&&c.package_id!==pkg.id)throw new Error("Kode diskon tidak berlaku untuk paket ini.");
    if(c.max_uses&&c.used_count>=c.max_uses)throw new Error("Kuota kode diskon sudah habis.");
    discount=c.discount_type==="percent"?Math.floor(amount*Number(c.discount_value)/100):Number(c.discount_value);
    discount=Math.min(amount-2000,Math.max(0,discount));amount-=discount;couponId=c.id;
  }
  const orderId=`VIP-${Date.now()}-${userId}`;
  const c=await cashiCreate(env,amount,orderId);
  await db(env,"vip_orders",{method:"POST",body:JSON.stringify({order_id:orderId,telegram_id:userId,package_id:pkg.id,amount,original_amount:pkg.price,discount,coupon_id:couponId,status:"PENDING",cashi_order_id:c.orderId||orderId,checkout_url:c.checkout_url,created_at:new Date().toISOString()})});
  if(couponId)await db(env,`vip_coupons?id=eq.${couponId}`,{method:"PATCH",body:JSON.stringify({used_count:(await one(env,`vip_coupons?id=eq.${couponId}&select=*`)).used_count+1})});
  const qr=c.qrUrl;
  await sendCashiQr(env,chat,`🧾 <b>Invoice VVIP</b>\nPaket: ${clean(pkg.name)}\nHarga: Rp${amount.toLocaleString("id-ID")}\nID: <code>${orderId}</code>\n\nScan QRIS untuk membayar. Setelah berhasil, bot akan mengirim link grup secara otomatis.`,qr,c.checkout_url,orderId);
}

export async function settleOrder(env,orderId,data={}){
  const order=await one(env,`vip_orders?order_id=eq.${enc(orderId)}&select=*`);
  if(!order||order.status==="PAID")return;
  if(data.amount&&Number(data.amount)<Number(order.amount))throw new Error("Nominal settlement tidak sesuai");
  const claimed=await db(env,`vip_orders?order_id=eq.${enc(orderId)}&status=eq.PENDING`,{method:"PATCH",headers:{"Prefer":"return=representation"},body:JSON.stringify({status:"PAID",paid_at:new Date().toISOString(),gateway_data:data})});
  if(!claimed?.length)return;
  const pkg=await one(env,`vip_packages?id=eq.${enc(order.package_id)}&select=*`);
  if(pkg?.invite_link)await send(env,order.telegram_id,`🎉 <b>Pembayaran berhasil!</b>\nPaket: ${clean(pkg.name)}\n\nIni link undangan VVIP kamu:\n${clean(pkg.invite_link)}\n\nSegera bergabung sebelum link kedaluwarsa.`,kb([[{text:"👑 Kembali ke VVIP",callback_data:"vip:home"}]]));
}

