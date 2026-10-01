/* Precalificador "¿Cuánta casa me alcanza?": 11 preguntas, una por pantalla, con el presupuesto
   que se va armando en vivo; luego los datos de contacto (con consentimiento LOPDP) y el resultado:
   semáforo, presupuesto, créditos posibles, proyectos que le alcanzan, qué le falta, documentos y
   el cierre por WhatsApp con un código CASA-XXXXXX que el asesor y el agente reconocen.
   Si datos/sitio.json tiene leadsEndpoint, además manda el cliente al Worker (cloudflare/). */
import { $, $$, el, icono, guardar, leer, borrar, aviso, copiar, enlaceWhatsApp, evento, escapar, regla } from "./ui.js";
import { dinero, porcentaje, evaluarPerfil, mejorPlan, semaforoPlan, sugerencias, puntaje, codigoCliente, normalizarPerfil, ingresoFamiliar } from "./finanzas.js";
import { estado, precalActualizada, proyectoPorId, cargarImagen, etiquetaPrograma } from "./app.js";

const CLAVE_BORRADOR = "llave_borrador";
const EDADES = [["18–25", 23], ["26–35", 31], ["36–45", 41], ["46–55", 51], ["56–65", 60], ["66 o más", 68]];
const CUANDO = { mes: "Este mes", "3m": "En los próximos 3 meses", "6m": "En 6 meses", averiguando: "Solo estoy averiguando" };
const PAISES = [["593", "Ecuador +593"], ["1", "EE. UU. +1"], ["34", "España +34"], ["39", "Italia +39"], ["", "Otro país"]];

let b = {};            // respuestas en curso
let paso = 0, proyectoId = null, contacto = {}, raizPc = null, foco = null, ultimoPaso = -1;

function opcion(nombre, valor, titulo, detalle){
  const sel = String(b[nombre]) === String(valor);
  return el("button.opcion", { type: "button", role: "radio", "aria-checked": String(sel), dataset: { campo: nombre, valor: String(valor) } }, el("strong", {}, titulo), detalle ? el("span", {}, detalle) : null);
}
const grupo = (titulo, nombre, opciones) => el("div.grupo-pregunta", {}, titulo ? el("strong", { id: `g-${nombre}` }, titulo) : null,
  el("div.opciones", { role: "radiogroup", "aria-labelledby": titulo ? `g-${nombre}` : "pcTitulo" }, ...opciones.map(o => opcion(nombre, ...o))));

/** Monto con slider y caja numérica sincronizados. */
function monto(nombre, etiqueta, min, max, paso, ayuda){
  const id = `m-${nombre}`;
  if (b[nombre] === undefined) b[nombre] = 0;
  const valor = b[nombre];
  const num = el("input", { type: "number", id, inputmode: "numeric", min, max: max * 4, step: paso, value: valor, "aria-describedby": `${id}-ayuda` });
  const rango = el("input", { type: "range", min, max, step: paso, value: Math.min(valor, max), "aria-label": etiqueta, tabindex: "-1" });
  const pintar = () => rango.style.setProperty("--p", `${((rango.value - min) / (max - min)) * 100}%`);
  num.addEventListener("input", () => { b[nombre] = Math.max(0, +num.value || 0); rango.value = Math.min(b[nombre], max); pintar(); cambio(); });
  rango.addEventListener("input", () => { b[nombre] = +rango.value; num.value = rango.value; pintar(); cambio(); });
  pintar();
  return el("div.monto", {},
    el("div.monto-cabeza", {}, el("label", { for: id }, etiqueta), el("div.monto-entrada", {}, el("span", {}, "USD"), num)),
    rango,
    ayuda ? el("small", { id: `${id}-ayuda` }, ayuda) : null);
}

function ciudades(){ return [...new Set(estado.proyectos.map(p => p.ciudad))]; }

const PASOS = [
  {
    t: "¿Para qué buscas casa?", d: "Así sabemos a qué créditos de primera vivienda puedes acceder.",
    ui: () => [
      grupo(null, "proposito", [["primera", "Mi primera vivienda", "Para vivir con mi familia"], ["cambio", "Cambiarme", "Una más grande o mejor ubicada"], ["inversion", "Invertir", "Para arrendar o revender"]]),
      grupo("¿Tienes alguna vivienda a tu nombre, en Ecuador o en otro país?", "tieneVivienda", [[false, "No"], [true, "Sí"]]),
    ],
    ok: () => b.proposito && b.tieneVivienda !== undefined,
  },
  {
    t: "¿Dónde quieres vivir?", d: "Te mostramos primero los proyectos de esa ciudad.",
    ui: () => [grupo(null, "ciudad", [...ciudades().map(c => [c, c, `${estado.proyectos.filter(p => p.ciudad === c).length} proyectos`]), ["", "Me da igual", "Ver todo el portafolio"]])],
    ok: () => b.ciudad !== undefined,
  },
  {
    t: "¿Cómo recibes tus ingresos?", d: "Los bancos piden papeles distintos según tu tipo de ingreso.",
    ui: () => [grupo(null, "tipoIngreso", [
      ["dependencia", "Trabajo con sueldo", "Relación de dependencia, con rol de pagos"],
      ["independiente", "Independiente con RUC o RIMPE", "Facturo mis servicios"],
      ["negocio", "Negocio propio", "Comercio, taller, local"],
      ["jubilado", "Jubilado", "Recibo pensión del IESS"],
      ["exterior", "Vivo fuera del Ecuador", "Trabajo en otro país"],
    ])],
    ok: () => !!b.tipoIngreso,
  },
  {
    t: "¿Cuánto recibes al mes?", d: "Tu ingreso neto: lo que te llega después de descuentos. Si sumas con tu pareja, el banco considera los dos.",
    ui: () => [
      monto("ingreso", "Tu ingreso neto mensual", 300, 6000, 50, b.tipoIngreso === "independiente" || b.tipoIngreso === "negocio" ? "Usa el promedio mensual de lo que declaras al SRI." : "Lo que dice tu rol de pagos después de aportes."),
      grupo("¿Sumarás los ingresos de tu pareja o de un familiar (codeudor)?", "codeudor", [[false, "No, solo los míos"], [true, "Sí, sumo un codeudor"]]),
      b.codeudor ? monto("ingresoCodeudor", "Ingreso neto del codeudor", 0, 5000, 50) : null,
    ],
    ok: () => b.ingreso >= 300 ? (b.codeudor === undefined ? "Dinos si sumas un codeudor." : true) : "Escribe tu ingreso mensual (desde USD 300).",
  },
  {
    t: "¿Cuánto pagas al mes en deudas?", d: "Tarjetas de crédito (el pago mínimo), préstamos, auto o crédito educativo. El banco los resta de tu capacidad.",
    ui: () => [monto("deudas", "Pagos mensuales de deudas", 0, 2000, 10), el("div.chips", {}, el("button.chip", { type: "button", "aria-pressed": String(b.deudas === 0), onclick: () => { b.deudas = 0; pintar(); } }, "No tengo deudas"))],
    ok: () => b.deudas !== undefined,
  },
  {
    t: "¿Cuánto tienes para la entrada?", d: "Con Miti-Miti la entrada es del 5 %. En proyectos en construcción puedes pagarla en cuotas mientras avanza la obra.",
    ui: () => [
      monto("ahorro", "Ahorro disponible hoy", 0, 60000, 250, "Incluye fondos de reserva o cesantía que puedas retirar."),
      monto("cuotaEntrada", "¿Cuánto podrías pagar al mes para completar la entrada?", 0, 1500, 25, `Lo calculamos para ${estado.params.mesesEntradaEnCuotas || 12} meses de obra. Pon 0 si no puedes.`),
    ],
    ok: () => b.ahorro !== undefined,
  },
  {
    t: "¿Aportas al IESS?", d: "Con 36 aportaciones puedes usar los créditos del BIESS, incluido el Credicasa al 2,99 %.",
    ui: () => [grupo(null, "iess", [["no", "No aporto"], ["menos36", "Sí, menos de 3 años"], ["36mas", "Sí, 3 años o más", "Con las últimas 13 seguidas"], ["jubilado", "Soy jubilado del IESS"]])],
    ok: () => !!b.iess,
  },
  {
    t: "¿Cómo está tu historial de crédito?", d: "No consultamos tu buró: dinos cómo crees que está. Sirve para elegir el banco correcto.",
    ui: () => [grupo(null, "historial", [["excelente", "Excelente", "Siempre pago a tiempo"], ["bueno", "Bueno", "Algún retraso pequeño hace tiempo"], ["atrasos", "Tuve atrasos", "Tengo o tuve deudas vencidas"], ["sin", "No tengo historial", "Nunca he tenido crédito"], ["nose", "No sé"]])],
    ok: () => !!b.historial,
  },
  {
    t: "¿Qué edad tienes?", d: "El plazo del crédito termina, en general, antes de los 75 años.",
    ui: () => [grupo(null, "edad", EDADES.map(([t, v]) => [v, t]))],
    ok: () => !!b.edad,
  },
  {
    t: "¿Cuánto pagas hoy de arriendo?", d: "Para comparar tu arriendo con la cuota de tu propia casa.",
    ui: () => [monto("arriendo", "Arriendo mensual", 0, 1500, 10), el("div.chips", {}, el("button.chip", { type: "button", "aria-pressed": String(b.arriendo === 0), onclick: () => { b.arriendo = 0; pintar(); } }, "No pago arriendo"))],
    ok: () => b.arriendo !== undefined,
  },
  {
    t: "¿Cuándo te gustaría comprar?", d: "Hay proyectos con entrega inmediata y otros en preventa con mejores precios.",
    ui: () => [grupo(null, "cuando", Object.entries(CUANDO))],
    ok: () => !!b.cuando,
  },
];

// ---------- Estado vivo ----------

function perfil(){ return normalizarPerfil({ ...b, edad: b.edad || 35 }); }
function evaluar(paraPanel = false){
  const pf = perfil();
  // Antes de preguntar por la entrada, el panel muestra solo lo que permite el ingreso.
  if (paraPanel && paso <= 5 && !(b.ahorro > 0)){ pf.ahorro = 1e7; }
  const ev = evaluarPerfil(pf, estado.params);
  const lista = estado.proyectos.map(p => { const plan = mejorPlan(p.desde, pf, estado.params); return { p, plan, s: semaforoPlan(plan, estado.params) }; });
  return { pf, ev, lista };
}

function cambio(){
  guardar(CLAVE_BORRADOR, { b, paso, proyectoId });
  pintarPanel();
  const err = $("#pcError"); if (err) err.textContent = "";
}

function pintarPanel(){
  const panel = $("#pcPanel"), movil = $("#pcMovil");
  if (!panel || !movil) return;
  if (!(b.ingreso >= 300)){
    panel.replaceChildren(el("p.ojo", {}, "Tu presupuesto"), el("p", { style: { color: "var(--tinta-2)" } }, "Cuando nos digas tus ingresos, aquí verás hasta cuánto podrías comprar y cuántos proyectos te alcanzan."));
    movil.hidden = true;
    return;
  }
  const { ev, lista } = evaluar(true);
  const n = lista.filter(x => x.s === "verde").length;
  const aprox = Math.round(ev.presupuesto / 1000) * 1000;
  const soloIngreso = paso <= 5 && !(b.ahorro > 0);
  panel.replaceChildren(
    el("p.ojo", {}, soloIngreso ? "Por tus ingresos podrías llegar a" : "Tu presupuesto va en"),
    el("div.grande", {}, aprox ? `≈ ${dinero(aprox)}` : "Aún sin crédito"),
    el("p", {}, el("strong", {}, `${n} de ${estado.proyectos.length}`), " proyectos te alcanzan con lo que nos has contado."),
    el("small", { style: { color: "var(--tinta-2)" } }, soloIngreso ? "Falta ver cuánto tienes para la entrada." : "Se ajusta con cada respuesta. El detalle sale al final."),
  );
  movil.hidden = false;
  movil.replaceChildren(el("span", {}, "Tu presupuesto va en"), el("strong", {}, aprox ? `≈ ${dinero(aprox)}` : "—"), el("span", {}, `${n} proyectos`));
}

// ---------- Pantallas ----------

function pintar(){
  const total = PASOS.length + 1;
  const cuerpo = $("#pcCuerpo");
  $("#pcPista").style.width = `${Math.min(100, (paso / total) * 100)}%`;
  $("#pcPaso").textContent = paso < total ? `Paso ${paso + 1} de ${total}` : "Tu resultado";
  const nav = $("#pcNav");
  if (paso < PASOS.length){
    const s = PASOS[paso];
    const contenido = el(`div.pc-paso${ultimoPaso !== paso ? ".animar" : ""}`, {}, el("h2", { id: "pcTitulo", tabindex: "-1" }, s.t), el("p", {}, s.d), ...s.ui().filter(Boolean), el("p.error", { id: "pcError", role: "alert" }));
    cuerpo.replaceChildren(el("div.pc-grid.con-panel", {}, el("div", { style: { display: "grid", gap: "16px", minWidth: 0 } }, el("div.pc-movil", { id: "pcMovil", hidden: true }), contenido), el("aside.pc-panel", { id: "pcPanel", "aria-live": "polite" })));
    nav.hidden = false;
    nav.replaceChildren(
      el("button.btn.btn-linea", { type: "button", disabled: paso === 0 || null, onclick: atras, html: `${icono("atras")} Atrás` }),
      el("button.btn.btn-luz", { type: "button", onclick: siguiente, html: `Siguiente ${icono("flecha")}` }),
    );
    pintarPanel();
  } else if (paso === PASOS.length){
    pintarContacto(cuerpo, nav);
  } else {
    nav.hidden = true;
    pintarResultado(cuerpo);
  }
  if (ultimoPaso !== paso){
    cuerpo.scrollTop = 0;
    requestAnimationFrame(() => $("#pcTitulo")?.focus({ preventScroll: true }));
  }
  ultimoPaso = paso;
}

function siguiente(){
  const r = PASOS[paso].ok();
  if (r !== true){ $("#pcError").textContent = typeof r === "string" ? r : "Elige una opción para seguir."; return; }
  paso++; guardar(CLAVE_BORRADOR, { b, paso, proyectoId }); pintar();
  evento("precal_paso", { paso });
}
function atras(){ if (paso > 0){ paso--; pintar(); } }

function pintarContacto(cuerpo, nav){
  const { ev, lista } = evaluar();
  const n = lista.filter(x => x.s === "verde").length;
  const gate = estado.sitio.pedirContactoAntesDelResultado !== false;
  const nombre = el("input", { type: "text", id: "cNombre", autocomplete: "name", required: true, value: contacto.nombre || "" });
  const pais = el("select", { id: "cPais", "aria-label": "Código de país" }, ...PAISES.map(([v, t]) => el("option", { value: v }, t)));
  pais.value = contacto.pais ?? "593";
  const tel = el("input", { type: "tel", id: "cTel", autocomplete: "tel-national", inputmode: "tel", required: true, placeholder: "099 123 4567", value: contacto.tel || "" });
  const correo = el("input", { type: "email", id: "cCorreo", autocomplete: "email", value: contacto.correo || "" });
  const horario = contacto.horario || "";
  const horarios = el("div.chips", { role: "group", "aria-label": "Mejor horario para llamarte" }, ...["Mañana", "Tarde", "Noche"].map(h => el("button.chip", { type: "button", "aria-pressed": String(h === horario), onclick: e => { contacto.horario = h; $$(".chip", horarios).forEach(x => x.setAttribute("aria-pressed", String(x === e.currentTarget))); } }, h)));
  const c1 = el("input", { type: "checkbox", id: "cDatos", checked: contacto.consentimiento || null });
  const c2 = el("input", { type: "checkbox", id: "cPromo", checked: contacto.promociones || null });
  const priv = el("button.btn.btn-fantasma.btn-chico", { type: "button", style: { padding: 0, minHeight: 0, color: "var(--verde)", textDecoration: "underline" } }, "política de privacidad");
  priv.addEventListener("click", async () => { const { abrirPrivacidad } = await import("./app.js"); abrirPrivacidad(); });
  const rango = ev.rango;
  const form = el("form.pc-paso", { id: "formContacto", novalidate: true },
    el("h2", { id: "pcTitulo", tabindex: "-1" }, "Tu resultado está listo"),
    el("div.adelanto", {},
      el("span", {}, "Tu presupuesto estimado está entre"),
      el("strong", {}, ev.presupuesto ? `${dinero(Math.round(rango.conservador / 1000) * 1000)} y ${dinero(Math.round(rango.optimista / 1000) * 1000)}` : "por definir con un asesor"),
      el("small", {}, `${n} de ${estado.proyectos.length} proyectos te alcanzan. ¿A nombre de quién preparamos tu informe con las cuotas exactas?`),
    ),
    el("label.campo", { for: "cNombre" }, el("span", {}, "Nombre y apellido"), nombre),
    el("div.campo", {}, el("span", { id: "lTel" }, "WhatsApp"), el("div.telefono", {}, pais, tel)),
    el("label.campo", { for: "cCorreo" }, el("span", {}, "Correo (opcional)"), correo),
    el("div.campo", {}, el("span", {}, "¿A qué hora prefieres que te llamemos?"), horarios),
    el("label.consentimiento", { for: "cDatos" }, c1, el("span", {}, "Acepto que usen mis datos para calcular mi precalificación y contactarme sobre proyectos de vivienda, según la ", priv, ". (Obligatorio)")),
    el("label.consentimiento", { for: "cPromo" }, c2, el("span", {}, "Quiero recibir novedades y promociones. (Opcional)")),
    // Campo trampa: invisible para las personas; si llega lleno, el servidor descarta el envío.
    el("div.solo-lector", { "aria-hidden": "true" }, el("label", { for: "cEmpresa" }, "Empresa"), el("input", { type: "text", id: "cEmpresa", tabindex: "-1", autocomplete: "off" })),
    estado.sitio.turnstileSiteKey ? el("div", { id: "cTurnstile" }) : null,
    el("p.error", { id: "pcError", role: "alert" }),
  );
  tel.setAttribute("aria-labelledby", "lTel");
  form.addEventListener("submit", e => { e.preventDefault(); enviarContacto(); });
  if (estado.sitio.turnstileSiteKey) montarTurnstile();
  cuerpo.replaceChildren(el("div.pc-grid", { style: { maxWidth: "720px" } }, form));
  nav.hidden = false;
  nav.replaceChildren(
    el("button.btn.btn-linea", { type: "button", onclick: atras, html: `${icono("atras")} Atrás` }),
    ...(gate ? [] : [el("button.btn.btn-fantasma", { type: "button", onclick: verSinDatos }, "Ver sin dejar datos")]),
    el("button.btn.btn-luz", { type: "submit", form: "formContacto", html: `Ver mi resultado ${icono("flecha")}` }),
  );
}

/** Antispam de Cloudflare (opcional): solo si sitio.json trae turnstileSiteKey. */
function montarTurnstile(){
  const pintarWidget = () => window.turnstile?.render("#cTurnstile", { sitekey: estado.sitio.turnstileSiteKey, language: "es", callback: t => { contacto.turnstile = t; } });
  if (window.turnstile) { pintarWidget(); return; }
  if (!document.getElementById("turnstileJs")) document.head.append(el("script", { id: "turnstileJs", src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit", async: true, defer: true, onload: pintarWidget }));
}

/** Normaliza el WhatsApp: Ecuador 09XXXXXXXX → 5939XXXXXXXX. */
export function normalizarTelefono(pais, numero){
  let n = String(numero || "").replace(/\D/g, "");
  if (pais === "593"){
    if (n.startsWith("593")) n = n.slice(3);
    if (n.startsWith("0")) n = n.slice(1);
    return /^9\d{8}$/.test(n) ? `593${n}` : null;
  }
  if (!pais) return /^\d{8,15}$/.test(n) ? n : null;
  if (n.startsWith(pais)) n = n.slice(pais.length);
  return /^\d{6,13}$/.test(n) ? `${pais}${n}` : null;
}

/** Solo si sitio.json lo permite: resultado sin contacto (no se registra cliente ni se envía nada). */
function verSinDatos(){
  const { pf, ev } = evaluar();
  precalActualizada({ codigo: codigoCliente(estado.sitio.prefijoCodigo || "CASA"), fecha: new Date().toISOString(), perfil: pf, proyectoId, contacto: null, presupuesto: ev.presupuesto, programa: ev.recomendado?.programa.id || null });
  paso++; pintar();
}

function enviarContacto(){
  const nombre = $("#cNombre").value.trim(), pais = $("#cPais").value, tel = $("#cTel").value.trim(), correo = $("#cCorreo").value.trim();
  Object.assign(contacto, { nombre, pais, tel, correo, consentimiento: $("#cDatos").checked, promociones: $("#cPromo").checked });
  const err = $("#pcError");
  if (nombre.length < 3){ err.textContent = "Escribe tu nombre y apellido."; $("#cNombre").focus(); return; }
  const whatsapp = normalizarTelefono(pais, tel);
  if (!whatsapp){ err.textContent = pais === "593" ? "Revisa tu celular: 10 dígitos que empiezan con 09." : "Revisa tu número de WhatsApp."; $("#cTel").focus(); return; }
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)){ err.textContent = "Revisa tu correo o déjalo vacío."; $("#cCorreo").focus(); return; }
  if (!contacto.consentimiento){ err.textContent = "Necesitamos tu autorización para usar tus datos y contactarte."; $("#cDatos").focus(); return; }
  contacto.whatsapp = whatsapp;
  contacto.empresa = $("#cEmpresa")?.value || "";
  if (estado.sitio.turnstileSiteKey && !contacto.turnstile){ err.textContent = "Espera un segundo a que termine la verificación antispam."; return; }
  registrar();
  paso++; pintar();
}

function objetivoDe(lista){
  if (proyectoId){ const x = lista.find(x => x.p.id === proyectoId); if (x) return x; }
  const enCiudad = lista.filter(x => !b.ciudad || x.p.ciudad === b.ciudad);
  const orden = (a, c) => ({ verde: 0, amarillo: 1, rojo: 2 }[a.s] - { verde: 0, amarillo: 1, rojo: 2 }[c.s]) || (a.s === "verde" ? c.p.desde - a.p.desde : a.p.desde - c.p.desde);
  return [...(enCiudad.length ? enCiudad : lista)].sort(orden)[0];
}

function registrar(){
  const { pf, ev, lista } = evaluar();
  const obj = objetivoDe(lista);
  const pts = puntaje(pf, ev, obj?.plan, { whatsapp: contacto.whatsapp, correo: contacto.correo });
  const anterior = estado.precal;
  const precal = {
    codigo: anterior?.codigo || codigoCliente(estado.sitio.prefijoCodigo || "CASA"),
    fecha: new Date().toISOString(),
    perfil: pf, proyectoId: obj?.p.id || null,
    contacto: { nombre: contacto.nombre, whatsapp: contacto.whatsapp, correo: contacto.correo || "", horario: contacto.horario || "", promociones: !!contacto.promociones },
    presupuesto: ev.presupuesto, programa: ev.recomendado?.programa.id || null, prioridad: pts.prioridad, puntaje: pts.total,
  };
  precalActualizada(precal);
  borrar(CLAVE_BORRADOR);
  enviarAlServidor(precal);
  evento("precalificacion_completa", { prioridad: pts.prioridad, meta: "Lead", proyecto: precal.proyectoId || "" });
}

/** Manda el cliente al Worker si está configurado. Si falla, el WhatsApp del resultado lo cubre. */
async function enviarAlServidor(precal){
  const url = estado.sitio.leadsEndpoint;
  if (!url) return;
  const q = new URLSearchParams(location.search);
  const origen = { utm_source: q.get("utm_source") || "", utm_medium: q.get("utm_medium") || "", utm_campaign: q.get("utm_campaign") || "", referrer: document.referrer || "", pagina: location.pathname };
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...precal, origen, empresa: contacto.empresa || "", turnstile: contacto.turnstile || "", consentimiento: { datos: true, promociones: precal.contacto.promociones, version: "2026-10" } }) });
    if (!r.ok) throw new Error(String(r.status));
  } catch (e){ console.warn("No se pudo registrar el cliente en el servidor:", e); }
}

// ---------- Resultado ----------

function mini(x, conFalta){
  const { p, plan } = x;
  const img = el("div.mini-img");
  const btn = el("button.mini", { type: "button", onclick: async () => { cerrar(); const { abrirFicha } = await import("./ficha.js"); abrirFicha(p); } },
    img,
    el("div", {}, el("strong", {}, p.nombre), el("small", {}, `${p.ciudad} · desde ${dinero(p.desde)}`),
      el("span.dato", {}, plan ? `${dinero(plan.cuotaTotal)}/mes` : "—"),
      plan ? el("small", {}, `con ${plan.programa.nombre}`) : null,
      conFalta && plan ? el("small", { style: { color: "var(--alerta)" } }, [plan.faltaEntrada >= 1 ? `Faltan ${dinero(plan.faltaEntrada)} de entrada` : "", plan.faltaIngreso >= 1 ? `Faltan ${dinero(plan.faltaIngreso)} de ingreso` : ""].filter(Boolean).join(" · ")) : null));
  cargarImagen(img, p, "frente", 320, 240);
  img._cargar?.();
  return btn;
}

function proximosDias(){
  const dias = [];
  const d = new Date();
  for (let i = 1; dias.length < 6 && i < 10; i++){
    const x = new Date(d); x.setDate(d.getDate() + i);
    dias.push(x);
  }
  return dias;
}

function pintarResultado(cuerpo){
  const precal = estado.precal;
  if (!precal){ paso = PASOS.length; pintar(); return; }
  b = { ...b, ...precal.perfil };
  const { pf, ev, lista } = evaluar();
  const obj = objetivoDe(lista);
  const verdes = lista.filter(x => x.s === "verde"), amarillos = lista.filter(x => x.s === "amarillo");
  const enCiudad = x => !pf.ciudad || x.p.ciudad === pf.ciudad;
  const general = verdes.some(enCiudad) ? "verde" : (verdes.length || amarillos.some(enCiudad)) ? "amarillo" : "rojo";
  const nombre = (precal.contacto?.nombre || "").split(" ")[0];
  const frase = { verde: "con tu perfil puedes comprar una vivienda de hasta", amarillo: "estás cerca. Con tu perfil hoy llegas a", rojo: "hoy el banco te prestaría para una vivienda de hasta" }[general];
  const plan = obj?.plan;
  const reco = ev.recomendado;
  const sem = el("span", { class: `semaforo semaforo-${general}` }, { verde: "Te alcanza", amarillo: "Casi te alcanza", rojo: "Todavía no, pero hay camino" }[general]);

  const tablaCreditos = el("div.tabla-scroll", {}, el("table.tabla", {},
    el("thead", {}, el("tr", {}, ...["Crédito", "¿Calificas?", "Hasta", "Tasa", "Plazo"].map((t, i) => el(i > 1 ? "th.num" : "th", { scope: "col" }, t)))),
    el("tbody", {}, ...ev.programas.map(r => el("tr", {},
      el("td", {}, el("strong", {}, r.programa.nombre)),
      el("td", { style: { whiteSpace: "normal", minWidth: "180px" } }, r.elegible && r.precioMax > 0 ? el("span.etiqueta.etiqueta-ok", {}, "Sí") : el("span", {}, el("span.etiqueta.etiqueta-peligro", {}, "No"), " ", el("small", {}, r.motivos[0] || (r.limitante === "piso" ? `Desde ${dinero(r.programa.precioMin)}` : "Tu capacidad no llega")))),
      el("td.num", {}, r.elegible && r.precioMax ? [dinero(r.precioMax), el("small", {}, { ingreso: "por tu ingreso", entrada: "por tu entrada", tope: "tope del crédito" }[r.limitante] || "")] : "—"),
      el("td.num", {}, porcentaje(r.programa.tasa)),
      el("td.num", {}, `${r.plazo || r.programa.plazoMax} años`),
    )))));

  const docs = estado.params.documentos || {};
  const listaDocs = [...(docs.comun || []), ...(docs[pf.tipoIngreso] || []), ...(!pf.tieneVivienda ? docs.sinVivienda || [] : [])];
  const sug = plan && !plan.alcanza ? sugerencias(plan, pf, estado.params) : [];

  // Agendar visita: proyecto, día y hora.
  let dia = null, hora = null, proyVisita = obj?.p.id || estado.proyectos[0].id;
  const selProy = el("select", { id: "vProyecto", "aria-label": "Proyecto a visitar" }, ...[...verdes, ...amarillos, ...lista.filter(x => x.s === "rojo")].map(x => el("option", { value: x.p.id }, `${x.p.nombre} · ${x.p.ciudad}`)));
  selProy.value = proyVisita;
  const chipsDia = el("div.chips", { role: "group", "aria-label": "Día de la visita" }, ...proximosDias().map(d => {
    const t = d.toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short" });
    return el("button.chip", { type: "button", "aria-pressed": "false", onclick: e => { dia = d.toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" }); $$(".chip", chipsDia).forEach(x => x.setAttribute("aria-pressed", String(x === e.currentTarget))); actualizarVisita(); } }, t);
  }));
  const chipsHora = el("div.chips", { role: "group", "aria-label": "Hora de la visita" }, ...(estado.sitio.horasVisita || ["10:00", "15:00"]).map(h => el("button.chip", { type: "button", "aria-pressed": "false", onclick: e => { hora = h; $$(".chip", chipsHora).forEach(x => x.setAttribute("aria-pressed", String(x === e.currentTarget))); actualizarVisita(); } }, h)));
  const btnVisita = el("a.btn.btn-luz", { target: "_blank", rel: "noopener", html: `${icono("calendario")} Pedir la visita por WhatsApp` });
  function actualizarVisita(){
    const p = proyectoPorId(selProy.value);
    const msg = `Hola${precal.contacto?.nombre ? `, soy ${precal.contacto.nombre}` : ""}. Me precalifiqué en la web (código ${precal.codigo}). Quiero visitar ${p.nombre} en ${p.ciudad}${dia ? ` el ${dia}` : ""}${hora ? ` a las ${hora}` : ""}.`;
    btnVisita.href = enlaceWhatsApp(estado.sitio.whatsapp, msg);
  }
  selProy.addEventListener("change", actualizarVisita);
  btnVisita.addEventListener("click", () => evento("agendar_visita", { proyecto: selProy.value, meta: "Schedule" }));
  actualizarVisita();

  const codigoTxt = el("span", {}, precal.codigo);
  const msgAsesor = [
    `Hola${precal.contacto?.nombre ? `, soy ${precal.contacto.nombre}` : ""}. Me precalifiqué en la web.`,
    `Código: ${precal.codigo}`,
    obj ? `Proyecto: ${obj.p.nombre} (${obj.p.ciudad}), desde ${dinero(obj.p.desde)}` : "",
    `Presupuesto estimado: hasta ${dinero(ev.presupuesto)}`,
    reco ? `Crédito sugerido: ${reco.programa.nombre} ${porcentaje(reco.programa.tasa)}` : "",
    plan ? `Cuota aprox.: ${dinero(plan.cuotaTotal)} al mes` : "",
    `Ingreso familiar: ${dinero(ingresoFamiliar(pf))}${pf.codeudor ? " (con codeudor)" : ""} · Para la entrada: ${dinero(pf.ahorro)}${pf.cuotaEntrada ? ` + ${dinero(pf.cuotaEntrada)}/mes` : ""}`,
    `Quiero comprar: ${CUANDO[pf.cuando] || ""}`,
    "¿Me pueden asesorar?",
  ].filter(Boolean).join("\n");

  const res = el("div.res", {},
    el("div.res-cabeza", {},
      sem,
      el("h2", { id: "pcTitulo", tabindex: "-1", style: { fontSize: "clamp(1.4rem, 3vw, 2rem)" } }, `${nombre ? `${nombre}, ` : ""}${frase}`),
      el("div.res-monto", {}, ev.presupuesto ? dinero(ev.presupuesto) : "—"),
      el("p.res-sub", {}, ev.maximo ? `Con ${ev.maximo.programa.nombre}. Según la tasa que te aprueben, tu rango está entre ${dinero(ev.rango.conservador)} y ${dinero(ev.rango.optimista)}.` : "Con los datos que nos diste, ningún crédito cubre todavía una vivienda del portafolio. Abajo te decimos qué cambiar."),
    ),
    el("div", { html: regla(ev, lista, estado.proyectos, innerWidth < 640 ? 380 : 640) }),
    el("small", { style: { color: "var(--tinta-2)" } }, "Cada punto es un proyecto por su precio desde: verde te alcanza, ámbar casi, gris todavía no. La franja verde es tu rango."),
    plan ? el("div.res-cifras", {},
      el("div.cifra.cifra-grande", {}, el("small", {}, `Cuota en ${obj.p.nombre}`), el("strong", {}, `${dinero(plan.cuotaTotal)}`)),
      el("div.cifra", {}, el("small", {}, "Entrada + gastos"), el("strong", {}, dinero(plan.entrada + plan.gastos))),
      el("div.cifra", {}, el("small", {}, "Crédito"), el("strong", { style: { fontSize: "1rem" } }, etiquetaPrograma(plan.programa))),
      el("div.cifra", {}, el("small", {}, "Plazo"), el("strong", {}, `${plan.plazo} años`)),
    ) : null,
    plan && pf.arriendo > 0 ? el("p", {}, el("strong", {}, `Hoy pagas ${dinero(pf.arriendo)} de arriendo. `), plan.cuotaTotal <= pf.arriendo ? `La cuota de ${obj.p.nombre} sería ${dinero(pf.arriendo - plan.cuotaTotal)} menos al mes, y la casa sería tuya.` : `La cuota de ${obj.p.nombre} sería ${dinero(plan.cuotaTotal - pf.arriendo)} más al mes, pagando algo que va a ser tuyo.`) : null,
    reco && reco !== ev.maximo ? el("p", {}, `Tu opción más barata es ${reco.programa.nombre} al ${porcentaje(reco.programa.tasa)}: alcanza para viviendas de hasta ${dinero(reco.precioMax)}.`) : null,
    sug.length ? el("section.bloque", {}, el("h3", {}, `Para llegar a ${obj.p.nombre}`), el("ul.lista-check.sugerencias", {}, ...sug.map(t => el("li", { html: `${icono("info")}<span>${escapar(t)}</span>` })))) : null,
    verdes.length ? el("section.bloque", {}, el("h3", {}, `Proyectos que te alcanzan (${verdes.length})`), el("div.res-mini", {}, ...verdes.sort((a, c) => (enCiudad(c) - enCiudad(a)) || a.plan.cuotaTotal - c.plan.cuotaTotal).map(x => mini(x)))) : null,
    amarillos.length ? el("section.bloque", {}, el("h3", {}, `Casi te alcanzan (${amarillos.length})`), el("div.res-mini", {}, ...amarillos.map(x => mini(x, true)))) : null,
    el("section.bloque", {}, el("h3", {}, "Tus créditos posibles"), tablaCreditos),
    el("section.bloque", {}, el("h3", {}, "Documentos que te van a pedir"), el("ul.lista-check", {}, ...listaDocs.map(t => el("li", { html: `${icono("check")}<span>${escapar(t)}</span>` })))),
    el("section.cierre", {},
      el("h3", {}, "Siguiente paso: habla con un asesor"),
      el("p", {}, `Tu código de precalificación es este. Con él, el asesor ya tiene tus números y no te vuelve a preguntar todo.`),
      el("div.codigo", {}, codigoTxt, el("button.btn.btn-fantasma.btn-icono", { type: "button", "aria-label": "Copiar código", html: icono("copiar"), onclick: () => copiar(precal.codigo, codigoTxt) })),
      el("div.cierre-acciones", {},
        el("a.btn.btn-wa", { href: enlaceWhatsApp(estado.sitio.whatsapp, msgAsesor), target: "_blank", rel: "noopener", html: `${icono("whatsapp")} Enviar mi precalificación por WhatsApp`, onclick: () => evento("enviar_whatsapp", { meta: "Contact", proyecto: obj?.p.id || "" }) }),
      ),
      el("h3", { style: { marginTop: "8px" } }, "O agenda tu visita"),
      el("label.campo", { for: "vProyecto" }, el("span", { style: { color: "inherit" } }, "Proyecto"), selProy),
      chipsDia, chipsHora,
      el("div.cierre-acciones", {}, btnVisita),
      el("small", { style: { opacity: .75 } }, `WhatsApp de ventas: ${estado.sitio.whatsappVisible} · ${estado.sitio.horario}`),
    ),
    el("p.nota-legal", {}, `Simulación referencial con tasas y topes vigentes al ${estado.params.vigencia.split("-").reverse().join("/")}. No es una aprobación de crédito: la decisión es de la entidad financiera después de revisar tus documentos y tu buró.`),
    el("div.cierre-acciones", {},
      el("button.btn.btn-tinta", { type: "button", onclick: () => { cerrar(); estado.filtros.soloAlcanza = true; if (pf.ciudad) estado.filtros.ciudad = pf.ciudad; precalActualizada(estado.precal); document.getElementById("proyectos").scrollIntoView(); } }, "Ver los proyectos con mi presupuesto"),
      el("button.btn.btn-linea", { type: "button", onclick: () => { paso = 0; pintar(); } }, "Editar mis respuestas"),
      el("button.btn.btn-fantasma", { type: "button", onclick: () => { precalActualizada(null); borrar(CLAVE_BORRADOR); b = {}; contacto = {}; aviso("Borramos tus datos de este navegador"); cerrar(); } }, "Borrar mis datos de este navegador"),
    ),
  );
  cuerpo.replaceChildren(el("div.pc-grid", { style: { maxWidth: "900px" } }, res));
}

// ---------- Abrir y cerrar ----------

function cerrar(){
  if (!raizPc) return;
  raizPc.hidden = true;
  document.documentElement.style.overflow = "";
  removeEventListener("keydown", teclas);
  if (location.hash === "#precalificar"){ try { history.replaceState(null, "", location.pathname + location.search); } catch {} }
  foco?.focus?.();
}
function teclas(e){
  if (document.querySelector("dialog[open]")) return;   // la política de privacidad está encima
  if (e.key === "Escape") cerrar();
  if (e.key === "Enter" && paso < PASOS.length && e.target.tagName !== "BUTTON" && e.target.tagName !== "A"){ e.preventDefault(); siguiente(); }
  if (e.target.closest?.(".opcion") && ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(e.key)){
    const ops = $$(".opcion", e.target.closest("[role=radiogroup]"));
    const i = ops.indexOf(e.target.closest(".opcion"));
    const j = (i + (["ArrowDown", "ArrowRight"].includes(e.key) ? 1 : -1) + ops.length) % ops.length;
    ops[j].focus(); e.preventDefault();
  }
}

export function abrirPrecalificador(opciones = {}){
  foco = document.activeElement;
  raizPc = $("#pc");
  const borrador = leer(CLAVE_BORRADOR, null);
  if (estado.precal && !opciones.reiniciar){
    b = { ...estado.precal.perfil };
    contacto = { ...(estado.precal.contacto || {}), tel: (estado.precal.contacto?.whatsapp || "").replace(/^593/, "0"), consentimiento: true };
    proyectoId = opciones.proyectoId || estado.precal.proyectoId;
    if (opciones.proyectoId && opciones.proyectoId !== estado.precal.proyectoId){
      estado.precal = { ...estado.precal, proyectoId: opciones.proyectoId };
      precalActualizada(estado.precal);
    }
    paso = PASOS.length + 1;
  } else if (borrador){
    ({ b, paso } = borrador); proyectoId = opciones.proyectoId || borrador.proyectoId || null;
    paso = Math.min(paso, PASOS.length);
  } else {
    b = {}; paso = 0; proyectoId = opciones.proyectoId || null;
    const p = proyectoId && proyectoPorId(proyectoId);
    if (p) b.ciudad = p.ciudad;
  }
  raizPc.replaceChildren(
    el("div.pc-barra", {},
      el("span.marca-logo", { html: icono("llave"), "aria-hidden": "true" }),
      el("div.pc-progreso", {}, el("small", { id: "pcPaso" }), el("div.pc-pista", {}, el("div", { id: "pcPista" }))),
      el("button.btn.btn-fantasma.btn-icono", { type: "button", "aria-label": "Cerrar el precalificador", html: icono("cerrar"), onclick: cerrar }),
    ),
    el("div.pc-cuerpo", { id: "pcCuerpo" }),
    el("div.pc-nav", { id: "pcNav" }),
  );
  raizPc.hidden = false;
  document.documentElement.style.overflow = "hidden";
  addEventListener("keydown", teclas);
  raizPc.onclick = e => {
    const o = e.target.closest(".opcion");
    if (!o) return;
    const { campo, valor } = o.dataset;
    b[campo] = valor === "true" ? true : valor === "false" ? false : (campo === "edad" ? +valor : valor);
    $$(`.opcion[data-campo="${campo}"]`, raizPc).forEach(x => x.setAttribute("aria-checked", String(x === o)));
    cambio();
    // Una sola pregunta de opciones en la pantalla: avanzar solo.
    const s = PASOS[paso];
    if (s && $$(".opciones", raizPc).length === 1 && !$$(".monto", raizPc).length && s.ok() === true) setTimeout(siguiente, 220);
    else if (campo === "codeudor") pintar();
  };
  pintar();
  evento("precal_abrir", { proyecto: proyectoId || "" });
}
