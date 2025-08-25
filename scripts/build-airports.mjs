import fs from "fs";
const text=fs.readFileSync("data/airports.dat","utf8");
const rows=text.split(/\r?\n/).filter(Boolean).map(l=>{const o=[];let c="",q=false;for(let i=0;i<l.length;i++){const ch=l[i];if(ch=='"'){q=!q;continue;}if(ch==","&&!q){o.push(c);c="";continue;}c+=ch;}o.push(c);return o;});
const items=[];
for(const r of rows){const name=r[1],city=r[2],country=r[3],iata=r[4];if(!iata||iata=="\\N")continue;if(!/^[A-Z0-9]{3}$/.test(iata))continue;items.push({id:iata,code:iata,name,city,country});}
fs.writeFileSync("public/js/airports.big.json",JSON.stringify(items,null,0));
console.log("ok",items.length);
