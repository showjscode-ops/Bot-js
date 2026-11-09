import { send, kb, back, user, tr } from "../core.js";
export async function showWebsite(env,chat,id){
 const u=await user(env,id),lang=u?.language||"id";
 return send(env,chat,tr(lang,"websiteMsg"),kb([[{text:"🌐 boxcelink.pages.dev",url:"https://boxcelink.pages.dev/"}],back("menu:home")]));
}
