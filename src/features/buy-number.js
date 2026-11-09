import { send, kb, back, user, tr } from "../core.js";
export async function showBuyNumber(env,chat,id){
 const u=await user(env,id),lang=u?.language||"id";
 return send(env,chat,tr(lang,"numberMsg"),kb([[{text:"👤 Admin Nokos @nokossupport",url:"https://t.me/nokossupport"}],back("menu:home")]));
}
