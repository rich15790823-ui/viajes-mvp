// script.js minimal ASCII build - robust submit + autocomplete + no fancy chars
console.log("script.js loaded", Date.now());

(function () {
  function debounce(fn, ms) {
    var t;
    ms = ms || 250;
    return function () {
      clearTimeout(t);
      var args = arguments;
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  function fmt(iso) {
    if (!iso) return "-";
    var d = new Date(iso);
    return d.toLocaleString();
  }

  function num(n) {
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function end(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove("loading");
    btn.textContent = "Buscar";
  }

  // ---------- Autocomplete ----------
  function buildList() {
    var ul = document.createElement("ul");
    ul.className = "autocomplete";
    ul.style.position = "absolute";
    ul.style.zIndex = "1000";
    ul.style.listStyle = "none";
    ul.style.margin = "0";
    ul.style.padding = "0";
    ul.style.border = "1px solid #ccc";
    ul.style.background = "#fff";
    ul.style.maxHeight = "200px";
    ul.style.overflowY = "auto";
    ul.style.display = "none";
    document.body.appendChild(ul);
    return ul;
  }

  function placeList(ul, input) {
    var rect = input.getBoundingClientRect();
    ul.style.left = (window.scrollX + rect.left) + "px";
    ul.style.top = (window.scrollY + rect.bottom) + "px";
    ul.style.width = rect.width + "px";
  }

  function setupAutocomplete(inputId) {
    var input = document.getElementById(inputId);
    if (!input) return;

    input.dataset.iata = "";
    var list = buildList();

    function closeList() {
      list.style.display = "none";
      list.innerHTML = "";
    }

    function openList() {
      placeList(list, input);
      list.style.display = "block";
    }

    function render(items) {
      list.innerHTML = "";
      if (!items || !items.length) {
        closeList();
        return;
      }
      items.forEach(function (it) {
        var li = document.createElement("li");
        li.textContent = it.label || it.iata || "";
        li.style.padding = "8px 10px";
        li.style.cursor = "pointer";
        li.addEventListener("mouseenter", function () { li.style.background = "#eee"; });
        li.addEventListener("mouseleave", function () { li.style.background = "#fff"; });
        li.addEventListener("click", function () {
          input.value = it.label || it.iata || "";
          input.dataset.iata = it.iata || "";
          closeList();
        });
        list.appendChild(li);
      });
      openList();
    }

    var search = debounce(function () {
      var q = (input.value || "").trim();
      input.dataset.iata = "";
      if (q.length < 2) {
        closeList();
        return;
      }
      fetch("/api/airports?q=" + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (data) { render((data && data.results) || []); })
        .catch(function (e) { console.error("autocomplete error", e); closeList(); });
    }, 300);

    input.addEventListener("input", search);
    input.addEventListener("focus", function () {
      if (list.children.length > 0) openList();
    });
    input.addEventListener("blur", function () { setTimeout(closeList, 150); });
    window.addEventListener("resize", function () { if (list.style.display === "block") placeList(list, input); });
    window.addEventListener("scroll", function () { if (list.style.display === "block") placeList(list, input); });
  }

  // ---------- Main ----------
  document.addEventListener("DOMContentLoaded", function () {
    var origin = document.getElementById("origin");
    var destination = document.getElementById("destination");
    if (origin) origin.setAttribute("placeholder", "Ciudad o Aeropuerto");
    if (destination) destination.setAttribute("placeholder", "Ciudad o Aeropuerto");

    setupAutocomplete("origin");
    setupAutocomplete("destination");

    var form = document.getElementById("form") || document.querySelector("form");
    var btn  = document.getElementById("btn")  || (form ? form.querySelector('button[type="submit"], button') : null);
    var msg  = document.getElementById("msg")  || document.querySelector("#msg, .msg, .status");
    var tabla = document.getElementById("tabla") || document.querySelector("table");
    var tbody = document.getElementById("tbody") || (tabla ? tabla.querySelector("tbody") : null);
    var roundTripCheckbox = document.getElementById("roundTrip") || document.querySelector('#roundTrip, input[name="roundTrip"]');
    var returnDateWrap = document.getElementById("returnDateWrap") || document.querySelector("#returnDateWrap");

    console.log("hook form=", !!form, "btn=", !!btn, "msg=", !!msg, "tabla=", !!tabla, "tbody=", !!tbody);

    if (!form || !btn || !msg || !tabla || !tbody) {
      console.error("missing UI pieces (form/btn/msg/tabla/tbody)");
      return;
    }

    if (roundTripCheckbox && returnDateWrap) {
      roundTripCheckbox.addEventListener("change", function () {
        returnDateWrap.style.display = roundTripCheckbox.checked ? "block" : "none";
      });
    }

    function handleSearch(e) {
      if (e) e.preventDefault();

      msg.className = "muted";
      msg.textContent = "Buscando...";
      btn.disabled = true;
      btn.classList.add("loading");
      btn.textContent = "Buscando...";
      tabla.style.display = "none";
      tbody.innerHTML = "";

      var originEl = document.getElementById("origin");
      var destEl   = document.getElementById("destination");
      var dateEl = document.getElementById("date");
      var adultsEl = document.getElementById("adults");
      var currencyEl = document.getElementById("currency");
      var returnDateEl = document.getElementById("returnDate");

      var originIata = (originEl && originEl.dataset ? originEl.dataset.iata : "") || "";
      var destIata   = (destEl && destEl.dataset ? destEl.dataset.iata : "") || "";

      if (!originIata && originEl && originEl.value) originIata = originEl.value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0,3);
      if (!destIata && destEl && destEl.value)       destIata   = destEl.value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0,3);

      var date = (dateEl && dateEl.value ? dateEl.value.trim() : "");
      var adults = ((adultsEl && adultsEl.value) ? adultsEl.value : "1").trim();
      var currency = (currencyEl && currencyEl.value ? currencyEl.value : "USD").trim();
      var isRound = !!(roundTripCheckbox && roundTripCheckbox.checked);
      var returnDate = isRound ? ((returnDateEl && returnDateEl.value) ? returnDateEl.value.trim() : "") : "";

      console.log("search params:", { originIata: originIata, destIata: destIata, date: date, returnDate: returnDate, adults: adults, currency: currency });

      if (!/^[A-Z]{3}$/.test(originIata)) { msg.className="error"; msg.textContent="Origen invalido."; end(btn); return; }
      if (!/^[A-Z]{3}$/.test(destIata))   { msg.className="error"; msg.textContent="Destino invalido."; end(btn); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { msg.className="error"; msg.textContent="Salida invalida (YYYY-MM-DD)."; end(btn); return; }
      if (isRound && !/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) { msg.className="error"; msg.textContent="Regreso invalido (YYYY-MM-DD)."; end(btn); return; }

      var q = new URLSearchParams({ origin: originIata, destination: destIata, date: date, adults: adults, currency: currency });
      if (returnDate) q.set("returnDate", returnDate);

      fetch("/api/vuelos?" + q.toString())
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); })
        .then(function (resp) {
          if (!resp.ok) {
            msg.className = "error";
            msg.textContent = (resp.body && resp.body.error) ? resp.body.error : "Error en la busqueda.";
            return;
          }
          var resultados = (resp.body && resp.body.results) ? resp.body.results : [];
          if (!resultados.length) {
            msg.className = "ok";
            msg.textContent = "Sin resultados. Prueba otras fechas o rutas.";
            return;
          }
          resultados.forEach(function (r, idx) {
            var price = r.priceTotal ? ((r.currency || "USD") + " " + num(r.priceTotal)) : "-";
            var durOut = r.durOut || r.duration || "-";
            var durRet = r.durRet || (r.hasReturn ? (r.returnDuration || "-") : "—");

            var tr = document.createElement("tr");
            tr.innerHTML =
              "<td>" + (r.airline || "-") + "<br><span class=\"mono\">" + (r.airlineCode || "") + "</span></td>" +
              "<td><b>" + (r.departureIata || "-") + "</b><br><span class=\"mono\">" + fmt(r.departureAt) + "</span></td>" +
              "<td><b>" + (r.arrivalIata || "-") + "</b><br><span class=\"mono\">" + fmt(r.arrivalAt) + "</span></td>" +
              "<td>" + durOut + "</td>" +
              "<td>" + (r.stops != null ? r.stops : "-") + "</td>" +
              "<td>" + (r.hasReturn ? ("<b>" + (r.returnArrivalIata || "-") + "</b><br><span class=\"mono\">" + fmt(r.returnArrivalAt) + "</span>") : "—") + "</td>" +
              "<td>" + durRet + "</td>" +
              "<td>" + price + "</td>" +
              "<td><button type=\"button\" data-idx=\"" + idx + "\" class=\"btn-detalles\">Ver detalles</button></td>";
            tbody.appendChild(tr);

            var legsOutText = (r.legs || []).map(function (s, i) {
              return "IDA " + (i+1) + " - " + (s.airlineCode || "") + " " + (s.flightNumber || "") + "\n  " +
                     (s.from || "-") + "  " + fmt(s.departAt) + "  ->  " + (s.to || "-") + "  " + fmt(s.arriveAt) + "\n  Duracion: " + (s.duration || "-");
            }).join("\n\n");

            var legsRetText = (r.returnLegs || []).map(function (s, i) {
              return "VUELTA " + (i+1) + " - " + (s.airlineCode || "") + " " + (s.flightNumber || "") + "\n  " +
                     (s.from || "-") + "  " + fmt(s.departAt) + "  ->  " + (s.to || "-") + "  " + fmt(s.arriveAt) + "\n  Duracion: " + (s.duration || "-");
            }).join("\n\n");

            var content = [];
            content.push(legsOutText ? legsOutText : "Sin detalle de ida.");
            if (r.hasReturn) content.push(legsRetText || "Sin detalle de vuelta.");
            var all = content.join("\n\n");

            var trDet = document.createElement("tr");
            trDet.className = "details";
            trDet.innerHTML =
              "<td colspan=\"9\">" +
                "<div style=\"display:none\" id=\"det-" + idx + "\">" +
                  "<pre>" + all + "</pre>" +
                "</div>" +
              "</td>";
            tbody.appendChild(trDet);
          });

          if (!tbody.dataset.listener) {
            tbody.addEventListener("click", function (ev) {
              var b = ev.target.closest(".btn-detalles");
              if (!b) return;
              var i = b.getAttribute("data-idx");
              var panel = document.getElementById("det-" + i);
              var visible = panel.style.display !== "none";
              panel.style.display = visible ? "none" : "block";
              b.textContent = visible ? "Ver detalles" : "Ocultar";
            });
            tbody.dataset.listener = "1";
          }

          msg.className = "ok";
          msg.textContent = "Listo: " + resultados.length + " resultado(s).";
          tabla.style.display = "";
        })
        .catch(function (e) {
          console.error("search error", e);
          msg.className = "error";
          msg.textContent = "Error de red o servidor.";
        })
        .finally(function () { end(btn); });
    }

    form.addEventListener("submit", handleSearch);
    if (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        handleSearch(e);
      });
    }

    console.log("listeners ready");
  });
})();

