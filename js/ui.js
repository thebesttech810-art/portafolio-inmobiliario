/* Utilidades de interfaz: crear elementos, íconos, formatos, almacenamiento local seguro,
   avisos (toast), enlaces de WhatsApp y eventos de analítica. Sin dependencias. */
import { dinero } from "./finanzas.js";

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

/** Crea un elemento: el("button.btn", { type: "button", onclick }, "Texto", hijo...). */
export function el(etiqueta, attrs = {}, ...hijos){
  const [tag, ...clases] = etiqueta.split(".");
  const n = document.createElement(tag || "div");
  if (clases.length) n.className = clases.join(" ");
  for (const [k, v] of Object.entries(attrs || {})){
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (k === "html") n.innerHTML = v;
    else if (k === "dataset") Object.assign(n.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
    else if (v === true) n.setAttribute(k, "");
    else n.setAttribute(k, v);
  }
  for (const h of hijos.flat()){
    if (h == null || h === false) continue;
    n.append(h instanceof Node ? h : document.createTextNode(String(h)));
  }
  return n;
}

export const escapar = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Íconos de trazo, dibujados a mano para el sitio (24×24).
const TRAZOS = {
  cama: '<path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 15h18M7 9V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/>',
  bano: '<path d="M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-2ZM6 12V6a2 2 0 0 1 3.5-1.3M7 19l-1 2M17 19l1 2"/>',
  auto: '<path d="M5 16h14M6 16v2M18 16v2M4 16l1.5-5.5A2 2 0 0 1 7.4 9h9.2a2 2 0 0 1 1.9 1.5L20 16M8 13h.01M16 13h.01"/>',
  area: '<path d="M4 4h16v16H4zM4 9h5M15 20v-5M9 4v3"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  corazon: '<path d="M12 20s-7.5-4.6-9.2-9.4C1.6 7.2 3.8 4 7.1 4c2 0 3.4 1.1 4.9 2.9C13.5 5.1 14.9 4 16.9 4c3.3 0 5.5 3.2 4.3 6.6C19.5 15.4 12 20 12 20Z"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
  flecha: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  atras: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  whatsapp: '<path d="M4 20l1.3-3.8A8 8 0 1 1 8 19l-4 1Z"/><path d="M9 9.5c.3 1.8 1.7 3.6 3.7 4.5l1.2-1.1 1.8.7c-.2 1-1 1.6-2 1.6-3 0-6-3-6-6 0-1 .6-1.8 1.6-2l.7 1.8-1 .5Z"/>',
  copiar: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  llave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>',
  calendario: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  luna: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>',
  capas: '<path d="M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5"/>',
  girar: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4"/>',
  compartir: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.9 7.6-3.8M8.2 13.1l7.6 3.8"/>',
  buscar: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  filtro: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  comparar: '<path d="M8 4v16M16 4v16M4 8h8M12 16h8"/>',
};
export function icono(nombre, clase = "ico"){
  return `<svg class="${clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TRAZOS[nombre] || ""}</svg>`;
}

export const miles = x => new Intl.NumberFormat("es-EC", { maximumFractionDigits: 0 }).format(x);
export const corto = x => x >= 1000 ? `$${miles(Math.round(x / 1000))}k` : dinero(x);
export const banos = b => (Number.isInteger(b) ? String(b) : String(b).replace(".", ","));
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export function mesAnio(aaaamm){ const [a, m] = aaaamm.split("-").map(Number); return `${MESES[m - 1]} de ${a}`; }
export function fechaLarga(iso){ const d = new Date(iso + "T12:00:00"); return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; }

// Almacenamiento local: puede fallar (modo privado, vistas previas). Nunca rompe la página.
export const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export const leer = (k, d = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
export const borrar = k => { try { localStorage.removeItem(k); } catch {} };

let timerToast = 0;
export function aviso(texto){
  let t = $("#toast");
  if (!t){ t = el("div.toast", { id: "toast", role: "status", "aria-live": "polite" }); document.body.append(t); }
  t.textContent = texto; t.classList.add("visible");
  clearTimeout(timerToast); timerToast = setTimeout(() => t.classList.remove("visible"), 3200);
}

/** Copia texto; si el navegador no deja, selecciona el texto para copiarlo a mano. */
export async function copiar(texto, nodoSeleccionable){
  try { await navigator.clipboard.writeText(texto); aviso("Copiado"); return true; }
  catch {
    if (nodoSeleccionable){ const r = document.createRange(); r.selectNodeContents(nodoSeleccionable); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    aviso("Selecciona el texto y cópialo");
    return false;
  }
}

export const enlaceWhatsApp = (numero, mensaje) => `https://wa.me/${String(numero).replace(/\D/g, "")}?text=${encodeURIComponent(mensaje)}`;

/** Analítica opcional: Umami, Meta Pixel o Google si están cargados. Nunca manda datos personales. */
export function evento(nombre, datos = {}){
  try { window.umami?.track?.(nombre, datos); } catch {}
  try { if (window.fbq && ["Lead", "Schedule", "Contact"].includes(datos.meta)) window.fbq("track", datos.meta, { content_name: datos.proyecto || "" }); } catch {}
  try { window.gtag?.("event", nombre, datos); } catch {}
}

export function hayWebGL2(){
  try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; }
}

/** Regla de precios (SVG): el rango y el tope de la persona, y un punto por proyecto según si le alcanza. */
export function regla(ev, lista, proyectos, W = 640){
  const precios = proyectos.map(p => p.desde);
  const min = Math.floor((Math.min(...precios, ev.rango.conservador || Infinity) - 8000) / 10000) * 10000;
  const max = Math.ceil((Math.max(...precios, ev.rango.optimista || 0) + 8000) / 10000) * 10000;
  const H = 120, x = v => 20 + ((v - min) / (max - min)) * (W - 40);
  const paso = W < 500 ? 20000 : 10000;
  let s = `<svg class="regla" viewBox="0 0 ${W} ${H}" role="img" aria-label="Regla de precios: tu presupuesto llega a ${dinero(ev.presupuesto)}; cada punto es un proyecto">`;
  if (ev.presupuesto){
    s += `<rect class="regla-rango" x="${x(ev.rango.conservador)}" y="22" width="${Math.max(2, x(ev.rango.optimista) - x(ev.rango.conservador))}" height="58" rx="3"/>`;
  }
  s += `<line class="regla-eje" x1="20" y1="80" x2="${W - 20}" y2="80"/>`;
  for (let v = min; v <= max; v += 10000){
    const etiqueta = (v - min) % paso === 0;
    s += `<line class="regla-eje" x1="${x(v)}" y1="80" x2="${x(v)}" y2="${etiqueta ? 90 : 85}"/>${etiqueta ? `<text x="${x(v)}" y="104" text-anchor="middle">${v / 1000}k</text>` : ""}`;
  }
  const filas = [];
  lista.slice().sort((a, c) => a.p.desde - c.p.desde).forEach(({ p, s: sem }) => {
    const px = x(p.desde);
    let f = 0; while (filas[f] !== undefined && px - filas[f] < 11) f++;
    filas[f] = px;
    s += `<circle class="${sem === "verde" ? "p-ok" : sem === "amarillo" ? "p-casi" : "p-no"}" cx="${px.toFixed(1)}" cy="${70 - f * 11}" r="4.5"><title>${escapar(p.nombre)}: desde ${dinero(p.desde)}</title></circle>`;
  });
  if (ev.presupuesto){
    const px = x(ev.presupuesto);
    s += `<line class="regla-tope" x1="${px}" y1="14" x2="${px}" y2="84"/><text class="regla-tope-txt" x="${px}" y="10" text-anchor="${px > W - 90 ? "end" : px < 90 ? "start" : "middle"}">Tu tope ${dinero(ev.presupuesto)}</text>`;
  }
  return s + `<text x="20" y="118">USD</text></svg>`;
}
