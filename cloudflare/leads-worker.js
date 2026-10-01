// Recibe los clientes del precalificador del sitio y los deja listos para llamar.
//
// 1. Valida el pedido (origen permitido, campo trampa, Turnstile si está configurado, límite por IP).
// 2. Recalcula la precalificación EN EL SERVIDOR con el mismo motor del sitio (sitio/js/finanzas.js)
//    y los mismos datos (sitio/datos/*.json): nunca confía en lo que calculó el navegador.
// 3. Guarda o actualiza el cliente en Supabase (tabla leads_inmobiliaria, ver supabase/leads.sql).
// 4. Avisa al vendedor por correo (Resend) y/o por WhatsApp (plantilla de la Cloud API), si están
//    configurados. Si un aviso falla, el cliente igual queda guardado.
//
// Secretos y variables: ver wrangler.toml.ejemplo y el README.
import { normalizarPerfil, evaluarPerfil, mejorPlan, puntaje, ingresoFamiliar, dineroParaEntrada } from "../sitio/js/finanzas.js";
import parametros from "../sitio/datos/parametros-financieros.json" with { type: "json" };
import datosProyectos from "../sitio/datos/proyectos.json" with { type: "json" };

const params = {
  ...parametros,
  precioMinPortafolio: Math.min(...datosProyectos.proyectos.flatMap(p => p.modelos.map(m => m.precio))),
};
const proyectos = new Map(datosProyectos.proyectos.map(p => [p.id, { ...p, desde: Math.min(...p.modelos.map(m => m.precio)) }]));

const POR_HORA = 8;                 // envíos por IP por hora (por instancia del Worker)
const visitas = new Map();

const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= max ? n : null; };
const texto = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const usd = n => new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

function validar(c){
  const errores = [];
  const contacto = c?.contacto || {};
  const nombre = texto(contacto.nombre, 80);
  const whatsapp = String(contacto.whatsapp || "").replace(/\D/g, "");
  const correo = texto(contacto.correo, 120);
  if (nombre.length < 3) errores.push("nombre");
  if (!/^\d{8,15}$/.test(whatsapp)) errores.push("whatsapp");
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) errores.push("correo");
  if (c?.consentimiento?.datos !== true) errores.push("consentimiento");
  if (!/^[A-Z]{2,10}-[A-Z0-9]{6}$/.test(String(c?.codigo || ""))) errores.push("codigo");
  const p = c?.perfil || {};
  const perfil = {
    proposito: ["primera", "cambio", "inversion"].includes(p.proposito) ? p.proposito : "primera",
    tieneVivienda: p.tieneVivienda === true,
    ciudad: texto(p.ciudad, 40),
    tipoIngreso: ["dependencia", "independiente", "negocio", "jubilado", "exterior"].includes(p.tipoIngreso) ? p.tipoIngreso : "dependencia",
    ingreso: num(p.ingreso, 100000), codeudor: p.codeudor === true, ingresoCodeudor: num(p.ingresoCodeudor ?? 0, 100000),
    deudas: num(p.deudas ?? 0, 100000), ahorro: num(p.ahorro ?? 0, 5000000), cuotaEntrada: num(p.cuotaEntrada ?? 0, 100000),
    iess: ["no", "menos36", "36mas", "jubilado"].includes(p.iess) ? p.iess : "no",
    historial: ["excelente", "bueno", "atrasos", "sin", "nose"].includes(p.historial) ? p.historial : "nose",
    edad: num(p.edad, 100), arriendo: num(p.arriendo ?? 0, 100000),
    cuando: ["mes", "3m", "6m", "averiguando"].includes(p.cuando) ? p.cuando : "averiguando",
  };
  for (const k of ["ingreso", "ingresoCodeudor", "deudas", "ahorro", "cuotaEntrada", "edad", "arriendo"]) if (perfil[k] === null) errores.push(`perfil.${k}`);
  return { errores, nombre, whatsapp, correo, perfil };
}

async function verificarTurnstile(env, token, ip){
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip || "" }),
  });
  return (await r.json()).success === true;
}

function limitar(ip){
  const ahora = Date.now(), hora = 3600e3;
  const lista = (visitas.get(ip) || []).filter(t => ahora - t < hora);
  lista.push(ahora);
  visitas.set(ip, lista);
  if (visitas.size > 5000) visitas.clear();
  return lista.length <= POR_HORA;
}

async function guardar(env, fila){
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/leads_inmobiliaria?on_conflict=codigo`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(fila),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function avisarCorreo(env, fila, proyecto){
  if (!env.RESEND_API_KEY || !env.AVISO_CORREO) return;
  const filas = [
    ["Código", fila.codigo], ["Prioridad", `${fila.prioridad} (${fila.puntaje}/100)`], ["Nombre", fila.nombre], ["WhatsApp", `+${fila.whatsapp}`],
    ["Horario", fila.horario || "—"], ["Proyecto", proyecto ? `${proyecto.nombre} (${proyecto.ciudad})` : "—"],
    ["Presupuesto", usd(fila.presupuesto || 0)], ["Crédito", fila.programa || "—"], ["Cuota aprox.", fila.cuota_estimada ? usd(fila.cuota_estimada) : "—"],
    ["Para la entrada", usd(fila.entrada_disponible || 0)], ["Ingreso familiar", usd(fila.ingreso_familiar || 0)], ["Quiere comprar", fila.cuando],
  ];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const html = `<h2>Nuevo cliente ${esc(fila.prioridad)}: ${esc(fila.nombre)}</h2><table cellpadding="6">${filas.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("")}</table><p><a href="https://wa.me/${fila.whatsapp}">Escribirle por WhatsApp</a></p>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.AVISO_DESDE || "Precalificador <onboarding@resend.dev>", to: env.AVISO_CORREO.split(","), subject: `[${fila.prioridad}] ${fila.nombre} · ${usd(fila.presupuesto || 0)} · ${fila.codigo}`, html }),
  });
}

// Plantilla de WhatsApp sugerida (crearla en Meta, categoría "Utility", idioma español):
//   "Nuevo cliente {{1}} ({{2}}). Presupuesto {{3}}, proyecto {{4}}, prioridad {{5}}. Código {{6}}."
async function avisarWhatsApp(env, fila, proyecto){
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID || !env.WHATSAPP_AVISO_A || !env.WHATSAPP_PLANTILLA) return;
  const parametrosPlantilla = [fila.nombre, `+${fila.whatsapp}`, usd(fila.presupuesto || 0), proyecto?.nombre || "sin elegir", fila.prioridad, fila.codigo];
  for (const destino of env.WHATSAPP_AVISO_A.split(",")){
    await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: destino.trim(), type: "template",
        template: { name: env.WHATSAPP_PLANTILLA, language: { code: env.WHATSAPP_IDIOMA || "es" }, components: [{ type: "body", parameters: parametrosPlantilla.map(t => ({ type: "text", text: String(t) })) }] },
      }),
    });
  }
}

export default {
  async fetch(request, env, ctx){
    const permitidos = String(env.ORIGENES || "").split(",").map(s => s.trim()).filter(Boolean);
    const origen = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": permitidos.includes(origen) ? origen : permitidos[0] || "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "Método no permitido" }, 405);
    if (!permitidos.includes(origen)) return json({ error: "Origen no permitido" }, 403);
    const ip = request.headers.get("CF-Connecting-IP") || "";
    if (!limitar(ip)) return json({ error: "Demasiados envíos. Intenta en un rato o escríbenos por WhatsApp." }, 429);

    let cuerpo;
    try { cuerpo = await request.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    if (texto(cuerpo?.empresa, 100)) return json({ ok: true });   // campo trampa: solo lo llenan los bots
    if (!(await verificarTurnstile(env, cuerpo?.turnstile, ip))) return json({ error: "No pudimos verificar que no eres un robot." }, 400);

    const v = validar(cuerpo);
    if (v.errores.length) return json({ error: "Datos incompletos", campos: v.errores }, 400);

    const perfil = normalizarPerfil(v.perfil);
    const ev = evaluarPerfil(perfil, params);
    const proyecto = proyectos.get(texto(cuerpo.proyectoId, 80)) || null;
    const plan = proyecto ? mejorPlan(proyecto.desde, perfil, params) : null;
    const p = puntaje(perfil, ev, plan, { whatsapp: v.whatsapp, correo: v.correo });
    const o = cuerpo.origen || {};
    const fila = {
      codigo: cuerpo.codigo,
      organization_id: env.ORGANIZATION_ID || null,
      nombre: v.nombre, whatsapp: v.whatsapp, correo: v.correo || null,
      horario: texto(cuerpo.contacto?.horario, 20) || null,
      promociones: cuerpo.consentimiento?.promociones === true,
      consentimiento_version: texto(cuerpo.consentimiento?.version, 20) || "sin-version",
      proyecto_id: proyecto?.id || null, ciudad: perfil.ciudad || proyecto?.ciudad || null,
      presupuesto: ev.presupuesto, rango_min: ev.rango.conservador, rango_max: ev.rango.optimista,
      programa: ev.recomendado?.programa.id || null,
      cuota_estimada: plan ? Math.round(plan.cuotaTotal * 100) / 100 : null,
      entrada_disponible: dineroParaEntrada(perfil, params),
      ingreso_familiar: ingresoFamiliar(perfil),
      tipo_ingreso: perfil.tipoIngreso, cuando: perfil.cuando,
      puntaje: p.total, prioridad: p.prioridad,
      perfil,
      origen: { utm_source: texto(o.utm_source, 100), utm_medium: texto(o.utm_medium, 100), utm_campaign: texto(o.utm_campaign, 150), referrer: texto(o.referrer, 300), pagina: texto(o.pagina, 200) },
    };

    try { await guardar(env, fila); }
    catch (e){ console.error(e); return json({ error: "No pudimos guardar tus datos. Escríbenos por WhatsApp." }, 502); }

    // Los avisos no demoran la respuesta al cliente.
    ctx.waitUntil(Promise.allSettled([avisarCorreo(env, fila, proyecto), avisarWhatsApp(env, fila, proyecto)]).then(r => r.forEach(x => x.status === "rejected" && console.error(x.reason))));
    return json({ ok: true, codigo: fila.codigo, prioridad: fila.prioridad });
  },
};
