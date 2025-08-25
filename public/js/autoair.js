/* usando airports.big.json */
;(()=>{
// === Dataset mínimo embebido (funciona ya). Puedes ampliarlo luego sin tocar HTML.
const DATA=[{id:"MEX",code:"MEX",name:"Benito Juárez Intl",city:"Mexico City",country:"Mexico"},{id:"CUN",code:"CUN",name:"Cancún Intl",city:"Cancún",country:"Mexico"},{id:"MTY",code:"MTY",name:"Gral. Mariano Escobedo",city:"Monterrey",country:"Mexico"},{id:"MID",code:"MID",name:"Manuel Crescencio Rejón",city:"Mérida",country:"Mexico"},{id:"GDL",code:"GDL",name:"Miguel Hidalgo y Costilla",city:"Guadalajara",country:"Mexico"},{id:"MAD",code:"MAD",name:"Adolfo Suárez Madrid–Barajas",city:"Madrid",country:"Spain"},{id:"BCN",code:"BCN",name:"Barcelona–El Prat",city:"Barcelona",country:"Spain"},{id:"JFK",code:"JFK",name:"John F. Kennedy Intl",city:"New York",country:"United States"},{id:"LAX",code:"LAX",name:"Los Angeles Intl",city:"Los Angeles",country:"United States"},{id:"CDG",code:"CDG",name:"Charles de Gaulle",city:"Paris",country:"France"}];

const norm=s=>(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const score=(t,it)=>{
  const q=norm(t),name=norm(it.name),city=norm(it.city),country=norm(it.country),code=(it.code||"").toLowerCase();
  let s=0;
  if(code===q) s+=1000;
  if(code.startsWith(q)) s+=400;
  if(city.startsWith(q)) s+=220;
  if(name.startsWith(q)) s+=200;
  if(country.startsWith(q)) s+=60;
  if(city.includes(q)) s+=24;
  if(name.includes(q)) s+=20;
  if(country.includes(q)) s+=8;
  return s;
};
const search=(term,limit=8)=>{
  if(!term) return [];
  const ranked=DATA.map(it=>[score(term,it),it]).filter(([sc])=>sc>0).sort((a,b)=>b[0]-a[0]).slice(0,limit).map(([,it])=>it);
  if(/^[A-Za-z]{3}$/.test(term) && ranked.length===0){
    const ex=DATA.find(it=>(it.code||"").toUpperCase()===term.toUpperCase());
    if(ex) ranked.push(ex);
  }
  return ranked;
};
const fmt= x=>`${x.code||x.id} — ${x.city||x.name} (${x.country||""})`.trim();

function makeDropdown(){
  const box=document.createElement("div");
  box.style.position="absolute";
  box.style.background="#fff";
  box.style.border="1px solid #e6e6e6";
  box.style.borderRadius="10px";
  box.style.boxShadow="0 10px 28px rgba(0,0,0,.10)";
  box.style.maxHeight="240px";
  box.style.overflow="auto";
  box.style.zIndex="9999";
  box.style.display="none";
  document.body.appendChild(box);
  return box;
}
function positionDropdown(box,input){
  const r=input.getBoundingClientRect();
  box.style.left=window.scrollX+r.left+"px";
  box.style.top=window.scrollY+r.bottom+6+"px";
  box.style.width=r.width+"px";
}
function bindAutocomplete(input){
  const box=makeDropdown();
  const render=(items)=>{
    if(!items.length){ box.style.display="none"; box.innerHTML=""; return; }
    box.innerHTML="";
    items.forEach(it=>{
      const li=document.createElement("div");
      li.textContent=fmt(it);
      li.style.padding="10px 12px";
      li.style.cursor="pointer";
      li.addEventListener("mouseover",()=>{li.style.background="#f4f4f4";});
      li.addEventListener("mouseout",()=>{li.style.background="transparent";});
      li.addEventListener("mousedown",(e)=>{ e.preventDefault(); input.value=it.code||it.id||it.name; box.style.display="none"; });
      box.appendChild(li);
    });
    positionDropdown(box,input);
    box.style.display="block";
  };
  let t;
  const onType=()=>{
    clearTimeout(t); t=setTimeout(()=>{
      const q=input.value.trim();
      if(!q){ box.style.display="none"; box.innerHTML=""; return; }
      render(search(q,8));
    },200);
  };
  input.addEventListener("input",onType);
  input.addEventListener("focus",onType);
  window.addEventListener("resize",()=>{ if(box.style.display!=="none") positionDropdown(box,input); });
  window.addEventListener("scroll",()=>{ if(box.style.display!=="none") positionDropdown(box,input); }, true);
  document.addEventListener("click",(e)=>{ if(e.target!==input && !box.contains(e.target)) box.style.display="none"; });
}

function guessInputs(){
  const all=[...document.querySelectorAll("input, [contenteditable='true']")];
  const byId = id => document.getElementById(id);
  let origin = byId("nv-origin") || byId("origin") || byId("from") || null;
  let dest   = byId("nv-dest")   || byId("dest")   || byId("to")   || null;
  if(!origin || !dest){
    const txt = all.filter(el=>el.tagName==="INPUT" && (!el.type || el.type==="text" || el.type==="search"));
    const o = txt.find(el=>/origen|origin|from/i.test(el.placeholder||el.name||""));
    const d = txt.find(el=>/destino|dest|to/i.test(el.placeholder||el.name||""));
    if(!origin && o) origin=o;
    if(!dest && d) dest=d;
  }
  return {origin,dest};
}

function bindRouteFill(origin,dest){
  const candidates=[document.getElementById("nv-route"), document.getElementById("route"), document.querySelector("input[placeholder*='Ruta']"), document.querySelector("input[placeholder*='ruta']")].filter(Boolean);
  const parse=(raw)=>{
    const s=(raw||"").toUpperCase().trim();
    const norm=s.replace(/[–—-]+/g," ").replace(/\s+/g," ").trim();
    const parts=norm.split(" ");
    if(parts.length===2) return { from:parts[0], to:parts[1] };
    return null;
  };
  candidates.forEach(r=>{
    r.addEventListener("change",()=>{
      const p=parse(r.value);
      if(p){ if(origin) origin.value=p.from; if(dest) dest.value=p.to; }
    });
  });
}

function attachSearchButton(origin,dest){
  const btn=document.getElementById("nv-search-btn") || document.getElementById("search") || document.querySelector("button[type='submit']") || document.querySelector("button");
  if(!btn || !origin || !dest) return;
  btn.addEventListener("click",(e)=>{
    const from=(origin.value||"").trim().toUpperCase();
    const to=(dest.value||"").trim().toUpperCase();
    if(!from||!to){ return; }
    const ev=new CustomEvent("navuara:search",{detail:{from,to}});
    window.dispatchEvent(ev);
  });
}

function boot(){
  const {origin,dest}=guessInputs();
  if(origin) bindAutocomplete(origin);
  if(dest) bindAutocomplete(dest);
  bindRouteFill(origin,dest);
  attachSearchButton(origin,dest);
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot); else boot();
})();
