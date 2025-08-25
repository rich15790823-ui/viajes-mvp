const NV = {
  debounce(fn, wait=220){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; },
  fetchPlaces: async (q)=>{ if(!q) return []; const r = await fetch(`/api/places?q=${encodeURIComponent(q)}`); if(!r.ok) return []; return r.json(); },
  formatItem: (x)=> `${x.code || x.id} — ${x.city || x.name} (${x.country||""})`.trim(),
  choose(elInput, listEl, item){ elInput.value = item.code || item.id || item.name; listEl.classList.remove("open"); listEl.innerHTML = ""; },
  bindAutocomplete(elInput, listEl){
    const onType = NV.debounce(async ()=>{
      const q = elInput.value.trim();
      if(!q){ listEl.classList.remove("open"); listEl.innerHTML=""; return; }
      const items = await NV.fetchPlaces(q);
      if(!items.length){ listEl.classList.remove("open"); listEl.innerHTML=""; return; }
      const ul = document.createElement("ul");
      items.forEach(it=>{
        const li = document.createElement("li");
        li.textContent = NV.formatItem(it);
        li.addEventListener("click", ()=> NV.choose(elInput, listEl, it));
        ul.appendChild(li);
      });
      listEl.innerHTML = ""; listEl.appendChild(ul); listEl.classList.add("open");
    });
    elInput.addEventListener("input", onType);
    elInput.addEventListener("focus", onType);
    document.addEventListener("click", (e)=>{ if(!listEl.contains(e.target) && e.target!==elInput){ listEl.classList.remove("open"); } });
  },
  parseRoute(raw){ const s=(raw||"").toUpperCase().trim(); const norm=s.replace(/[–—-]+/g," ").replace(/\s+/g," ").trim(); const parts=norm.split(" "); if(parts.length===2) return { from:parts[0], to:parts[1] }; return null; },
};

window.addEventListener("DOMContentLoaded", ()=>{
  const o = document.getElementById("nv-origin");
  const od = document.getElementById("nv-origin-dd");
  const d = document.getElementById("nv-dest");
  const dd = document.getElementById("nv-dest-dd");
  const r = document.getElementById("nv-route");
  if(o && od) NV.bindAutocomplete(o, od);
  if(d && dd) NV.bindAutocomplete(d, dd);
  if(r){ r.addEventListener("change", ()=>{ const parsed = NV.parseRoute(r.value); if(parsed){ if(o) o.value = parsed.from; if(d) d.value = parsed.to; } }); }
});
