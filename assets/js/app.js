/* ศูนย์การเรียนรู้เมืองน่าน — แผนที่และรายการ
   ข้อมูลมาจาก data/centers.json (สร้างจาก Excel ด้วย scripts/build_data.py) */
(function () {
  "use strict";

  const T = {
    th: {
      title: "ศูนย์การเรียนรู้เมืองน่าน",
      subtitle: "แหล่งเรียนรู้เกษตร ป่าชุมชน ภูมิปัญญา และอาชีพ ทั่วจังหวัดน่าน",
      statCenters: "ศูนย์", statDistricts: "อำเภอ", statCourse: "มีหลักสูตร",
      search: "ค้นหาชื่อศูนย์ หรือคำในคำอธิบาย", allAmp: "ทุกอำเภอ", allCourse: "ทุกศูนย์", onlyCourse: "มีหลักสูตรเท่านั้น",
      showing: (n, t) => `แสดง ${n} จาก ${t} แห่ง`, reset: "ล้างตัวกรอง",
      course: "มีหลักสูตร", planned: "กำลังทำหลักสูตร",
      noLoc: "ยังไม่มีที่ตั้ง", noDesc: "ยังไม่มีคำอธิบาย",
      empty: "ไม่พบศูนย์ที่ตรงกับตัวกรอง ลองล้างตัวกรองหรือค้นหาคำอื่น",
      loading: "กำลังโหลดข้อมูล…", loadError: "โหลดข้อมูลไม่สำเร็จ หากเปิดไฟล์จากเครื่องโดยตรง ให้เปิดผ่านเว็บเซิร์ฟเวอร์ (ดู README)",
      openMap: "เปิดใน Google Maps", share: "คัดลอกลิงก์", copied: "คัดลอกแล้ว",
      courseName: "หลักสูตร", phone: "โทร", social: "LINE / Facebook", hours: "เวลาเปิด", booking: "ต้องจองก่อน",
      fee: "ค่าใช้จ่าย", more: "ข้อมูลเพิ่มเติม", map: "แผนที่", satellite: "ภาพดาวเทียม",
      footer: "ข้อมูลอาจมีการเปลี่ยนแปลง กรุณาติดต่อศูนย์ก่อนเดินทาง",
    },
    en: {
      title: "Nan Learning Centers",
      subtitle: "Farms, community forests, local wisdom and livelihood learning across Nan Province",
      statCenters: "centers", statDistricts: "districts", statCourse: "with a course",
      search: "Search names or descriptions", allAmp: "All districts", allCourse: "All centers", onlyCourse: "With a course only",
      showing: (n, t) => `Showing ${n} of ${t}`, reset: "Clear filters",
      course: "Has course", planned: "Course planned",
      noLoc: "Location needed", noDesc: "No description yet",
      empty: "No centers match these filters. Clear filters or try another search.",
      loading: "Loading…", loadError: "Could not load data. If you opened the file directly, serve it from a web server (see README).",
      openMap: "Open in Google Maps", share: "Copy link", copied: "Copied",
      courseName: "Course", phone: "Phone", social: "LINE / Facebook", hours: "Hours", booking: "Booking required",
      fee: "Fee", more: "More info", map: "Map", satellite: "Satellite",
      footer: "Details may change. Please contact the center before visiting.",
    },
  };

  let lang = "th";
  try { lang = localStorage.getItem("nan-lang") || "th"; } catch (e) { /* storage unavailable */ }
  const t = (k) => T[lang][k];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let themes = {}, centers = [], geo = null, map, ampLayer, labels, baseLayers, layerControl;
  const markers = {};
  const state = { q: "", amp: "", course: "", on: new Set(), active: null };

  const nm = (c) => (lang === "th" ? c.th : c.en);
  const desc = (c) => (lang === "th" ? c.d_th : c.d_en || c.d_th);
  const where = (c) => {
    if (!c.amp) return "";
    if (lang === "th") return (c.tam ? `ต.${c.tam} ` : "") + `อ.${c.amp}`;
    return (c.tam_en ? c.tam_en + ", " : "") + (c.amp_en || c.amp);
  };
  const themeLabel = (k) => (themes[k] ? (lang === "th" ? themes[k][0] : themes[k][1]) : k);
  const themeColor = (k) => (themes[k] ? themes[k][2] : "#8A94A6");

  // ---------- Map ----------
  function initMap() {
    map = L.map("map", { zoomSnap: 0.25, minZoom: 8, maxZoom: 18 });
    baseLayers = {
      map: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }),
      satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 18, attribution: "Imagery &copy; Esri",
      }),
    };
    baseLayers.map.addTo(map);

    // Shade everything outside Nan so the province stands out.
    const holes = [];
    geo.amp.features.forEach((f) => {
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      polys.forEach((p) => holes.push(p[0].map(([x, y]) => [y, x])));
    });
    L.polygon([[[-89, -179], [-89, 179], [89, 179], [89, -179]], ...holes], {
      interactive: false, stroke: false, fillColor: "#1E2B4A", fillOpacity: 0.35,
    }).addTo(map);

    ampLayer = L.geoJSON(geo.amp, {
      style: { color: "#1E2B4A", weight: 1.4, opacity: 0.8, fill: false },
      interactive: false,
      onEachFeature: (f, l) => { f.properties._layer = l; },
    }).addTo(map);
    map.fitBounds(ampLayer.getBounds(), { padding: [16, 16] });

    labels = L.layerGroup().addTo(map);
    map.on("zoomend", () => (map.getZoom() < 11 ? labels.addTo(map) : map.removeLayer(labels)));

    centers.forEach((c) => {
      if (c.lat == null || c.lng == null) return;
      const icon = L.divIcon({ className: "", iconSize: [16, 16], html: `<div class="pin" style="--c:${themeColor(c.theme)}"></div>` });
      const m = L.marker([c.lat, c.lng], { icon, title: c.th, riseOnHover: true });
      m.on("click", () => select(c.id, false));
      m.on("popupclose", () => { if (state.active === c.id) { state.active = null; mark(); history.replaceState(null, "", location.pathname + location.search); } });
      markers[c.id] = m;
    });
  }

  function drawMapText() {
    labels.clearLayers();
    geo.amp.features.forEach((f) => {
      L.tooltip({ permanent: true, direction: "center", className: "amp-label", interactive: false })
        .setLatLng([f.properties.lab[0] - 0.045, f.properties.lab[1]])
        .setContent(lang === "th" ? f.properties.th : f.properties.en).addTo(labels);
    });
    if (layerControl) layerControl.remove();
    layerControl = L.control.layers({ [t("map")]: baseLayers.map, [t("satellite")]: baseLayers.satellite }, null, { position: "topright" }).addTo(map);
  }

  // ---------- Popup ----------
  function popupHtml(c) {
    const d = desc(c);
    const rows = [
      ["courseName", c.course_name], ["phone", c.phone], ["social", c.social],
      ["hours", c.hours], ["booking", c.booking], ["fee", c.fee],
    ].filter(([, v]) => v).map(([k, v]) => {
      const val = safeUrl(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>`
        : k === "phone" ? `<a href="tel:${esc(String(v).replace(/[^\d+]/g, ""))}">${esc(v)}</a>` : esc(v);
      return `<dt>${t(k)}</dt><dd>${val}</dd>`;
    }).join("");
    let tags = "";
    if (c.course === "yes") tags += `<span class="tag course">${t("course")}</span>`;
    if (c.course === "planned") tags += `<span class="tag">${t("planned")}</span>`;
    const mapUrl = safeUrl(c.map_url) || `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;
    return `<div class="pop" style="--c:${themeColor(c.theme)}">
      <span class="theme"><i></i>${esc(themeLabel(c.theme))}</span>
      <h3>${esc(nm(c))}</h3><span class="where">${esc(where(c))}</span>
      ${tags ? `<div class="tags">${tags}</div>` : ""}
      ${safeUrl(c.photo) ? `<img src="${esc(c.photo)}" alt="" loading="lazy">` : ""}
      <p class="${d ? "" : "missing"}">${esc(d || t("noDesc"))}</p>
      ${rows ? `<dl>${rows}</dl>` : ""}
      ${c.visit_note ? `<p class="note">${esc(c.visit_note)}</p>` : ""}
      <div class="actions">
        <a class="btn" href="${esc(mapUrl)}" target="_blank" rel="noopener">${t("openMap")}</a>
        ${safeUrl(c.more_url) ? `<a class="btn ghost" href="${esc(c.more_url)}" target="_blank" rel="noopener">${t("more")}</a>` : ""}
        <button type="button" class="btn ghost" data-share="${esc(c.id)}">${t("share")}</button>
      </div>
    </div>`;
  }

  // ---------- List & filters ----------
  function matches(c) {
    if (!state.on.has(c.theme)) return false;
    if (state.amp && c.amp !== state.amp) return false;
    if (state.course === "yes" && c.course !== "yes") return false;
    if (state.q) {
      const hay = [c.th, c.en, c.d_th, c.d_en, c.amp, c.tam, c.amp_en, c.tam_en, c.course_name].join(" ").toLowerCase();
      if (!hay.includes(state.q.toLowerCase())) return false;
    }
    return true;
  }

  function itemHtml(c, clickable) {
    let tags = "";
    if (c.course === "yes") tags += `<span class="tag course">${t("course")}</span>`;
    if (c.course === "planned") tags += `<span class="tag">${t("planned")}</span>`;
    const inner = `<span class="dot" style="--c:${themeColor(c.theme)}"></span>
      <span><span class="name">${esc(nm(c))}</span>
      <span class="where">${esc(lang === "th" ? (c.tam ? "ต." + c.tam : "") : c.tam_en)}</span>
      ${tags ? `<span class="tags">${tags}</span>` : ""}</span>`;
    return clickable
      ? `<button type="button" class="item${state.active === c.id ? " active" : ""}" data-id="${esc(c.id)}">${inner}</button>`
      : `<div class="item static">${inner}</div>`;
  }

  function render() {
    const vis = centers.filter(matches);
    $("count").textContent = t("showing")(vis.length, centers.length);
    const onMap = vis.filter((c) => markers[c.id]);
    const noLoc = vis.filter((c) => !markers[c.id]);
    const byAmp = {};
    onMap.forEach((c) => (byAmp[c.amp] = byAmp[c.amp] || []).push(c));
    let h = Object.keys(byAmp).sort((a, b) => a.localeCompare(b, "th")).map((a) => {
      const list = byAmp[a].sort((x, y) => x.th.localeCompare(y.th, "th"));
      const label = lang === "th" ? `อ.${a}` : list[0].amp_en || a;
      return `<div class="group"><span>${esc(label)}</span><span>${list.length}</span></div>` + list.map((c) => itemHtml(c, true)).join("");
    }).join("");
    if (noLoc.length) h += `<div class="group"><span>${t("noLoc")}</span><span>${noLoc.length}</span></div>` + noLoc.map((c) => itemHtml(c, false)).join("");
    $("list").innerHTML = vis.length ? h : `<div class="empty">${t("empty")}</div>`;
    Object.entries(markers).forEach(([id, m]) => {
      const c = centers.find((x) => x.id === id);
      if (matches(c)) m.addTo(map); else map.removeLayer(m);
    });
    mark();
  }

  function mark() {
    document.querySelectorAll(".item[data-id]").forEach((b) => b.classList.toggle("active", b.dataset.id === state.active));
    Object.entries(markers).forEach(([id, m]) => {
      const el = m.getElement();
      if (el && el.firstChild) el.firstChild.classList.toggle("on", id === state.active);
    });
  }

  function select(id, pan) {
    const c = centers.find((x) => x.id === id), m = markers[id];
    if (!c || !m) return;
    if (!map.hasLayer(m)) { state.on.add(c.theme); state.amp = state.amp && state.amp !== c.amp ? "" : state.amp; buildControls(); render(); }
    state.active = id; mark();
    history.replaceState(null, "", "#" + id);
    m.bindPopup(popupHtml(c), { maxWidth: 320, autoPanPadding: [24, 24] });
    if (pan) {
      const z = Math.max(map.getZoom(), 12);
      map.once("moveend", () => m.openPopup());
      if (reduceMotion) map.setView(m.getLatLng(), z, { animate: false }); else map.flyTo(m.getLatLng(), z, { duration: 0.6 });
    } else m.openPopup();
    const b = document.querySelector(`.item[data-id="${CSS.escape(id)}"]`);
    if (b) b.scrollIntoView({ block: "nearest" });
  }

  function buildControls() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-t]").forEach((el) => (el.textContent = t(el.dataset.t)));
    document.title = lang === "th" ? "ศูนย์การเรียนรู้เมืองน่าน | Nan Learning Centers" : "Nan Learning Centers";
    const q = $("q"); q.placeholder = t("search"); q.setAttribute("aria-label", t("search"));

    const amps = [...new Set(centers.filter((c) => c.amp).map((c) => c.amp))].sort((a, b) => a.localeCompare(b, "th"));
    $("amp").innerHTML = `<option value="">${t("allAmp")}</option>` + amps.map((a) => {
      const en = (centers.find((c) => c.amp === a) || {}).amp_en || a;
      return `<option value="${esc(a)}"${state.amp === a ? " selected" : ""}>${esc(lang === "th" ? "อ." + a : en)}</option>`;
    }).join("");
    $("course").innerHTML = `<option value="">${t("allCourse")}</option><option value="yes"${state.course === "yes" ? " selected" : ""}>${t("onlyCourse")}</option>`;
    $("chips").innerHTML = Object.keys(themes).map((k) =>
      `<button type="button" class="chip" data-k="${esc(k)}" aria-pressed="${state.on.has(k)}" style="--c:${themeColor(k)}"><i></i>${esc(themeLabel(k))}</button>`).join("");
    $("stats").innerHTML = [
      [centers.length, t("statCenters")], [amps.length, t("statDistricts")],
      [centers.filter((c) => c.course === "yes").length, t("statCourse")],
    ].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("");
    document.querySelectorAll(".lang button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === lang));
    drawMapText();
  }

  function fitAll() { map.fitBounds(ampLayer.getBounds(), { padding: [16, 16] }); }

  function bindEvents() {
    $("q").addEventListener("input", (e) => { state.q = e.target.value.trim(); render(); });
    $("amp").addEventListener("change", (e) => {
      state.amp = e.target.value; render();
      const f = geo.amp.features.find((x) => x.properties.th === state.amp);
      if (f) map.fitBounds(f.properties._layer.getBounds(), { padding: [30, 30] }); else fitAll();
    });
    $("course").addEventListener("change", (e) => { state.course = e.target.value; render(); });
    $("chips").addEventListener("click", (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      const k = b.dataset.k, all = Object.keys(themes);
      if (state.on.size === all.length) state.on = new Set([k]);          // first click: show only this theme
      else if (state.on.has(k)) { state.on.delete(k); if (!state.on.size) state.on = new Set(all); }
      else state.on.add(k);
      document.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", state.on.has(c.dataset.k)));
      render();
    });
    $("list").addEventListener("click", (e) => { const b = e.target.closest(".item[data-id]"); if (b) select(b.dataset.id, true); });
    $("reset").addEventListener("click", () => {
      Object.assign(state, { q: "", amp: "", course: "", on: new Set(Object.keys(themes)) });
      $("q").value = ""; map.closePopup(); buildControls(); render(); fitAll();
    });
    document.querySelectorAll(".lang button").forEach((b) => b.addEventListener("click", () => {
      lang = b.dataset.lang;
      try { localStorage.setItem("nan-lang", lang); } catch (e) { /* ignore */ }
      const open = state.active; map.closePopup(); buildControls(); render();
      if (open) select(open, false);
    }));
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-share]"); if (!b) return;
      const url = location.origin + location.pathname + "#" + b.dataset.share;
      const done = () => { b.textContent = t("copied"); setTimeout(() => (b.textContent = t("share")), 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => prompt(t("share"), url));
      else prompt(t("share"), url);
    });
    window.addEventListener("hashchange", () => { const id = location.hash.slice(1); if (id && id !== state.active) select(id, true); });
  }

  // ---------- Start ----------
  Promise.all([
    fetch("data/centers.json").then((r) => r.json()),
    fetch("data/nan-boundaries.json").then((r) => r.json()),
  ]).then(([data, boundaries]) => {
    themes = data.themes; centers = data.centers; geo = boundaries;
    state.on = new Set(Object.keys(themes));
    initMap(); buildControls(); bindEvents(); render();
    const id = location.hash.slice(1);
    if (id) setTimeout(() => select(id, true), 300);
  }).catch((err) => {
    console.error(err);
    $("list").innerHTML = `<div class="empty">${t("loadError")}</div>`;
  });
})();
