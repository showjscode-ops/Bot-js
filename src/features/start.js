import { send, user, tr, kb } from "../core.js";
export async function showMain(env,chat,u){
 const saved=await user(env,u.id),lang=saved?.language||"id";
 await send(env,chat,tr(lang,"welcome",{name:(u.first_name||"friend").replace(/[<>&]/g,"")}),kb([
 [{text:tr(lang,"media"),callback_data:"feature:media"},{text:tr(lang,"vip"),callback_data:"feature:vip"}],
 [{text:tr(lang,"number"),callback_data:"feature:number"},{text:tr(lang,"website"),callback_data:"feature:website"}],
 [{text:tr(lang,"helpBtn"),callback_data:"menu:help"},{text:tr(lang,"donate"),callback_data:"vip:donate"}]
 ]));
}
