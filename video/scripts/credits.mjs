import { credits } from "./eleven.mjs";
const c = await credits();
console.log(`crédits utilisés ${c.used} / ${c.limit} (reste ${c.limit - c.used})`);
