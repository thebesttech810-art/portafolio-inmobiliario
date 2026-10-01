// Pruebas del Worker que recibe los clientes, con Supabase y los avisos simulados.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/leads-worker.js";

const env = { ORIGENES: "https://ejemplo.github.io", SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "clave", RESEND_API_KEY: "re_x", AVISO_CORREO: "ventas@ejemplo.ec" };
let llamadas;
beforeEach(() => {
  llamadas = [];
  globalThis.fetch = async (url, op = {}) => { llamadas.push({ url: String(url), body: op.body ? JSON.parse(op.body) : null }); return new Response("", { status: 201 }); };
});
const ctx = { pendientes: [], waitUntil(p){ this.pendientes.push(p); } };
let ip = 0;
const pedir = (cuerpo, origen = "https://ejemplo.github.io") => worker.fetch(new Request("https://w.dev/", {
  method: "POST", headers: { Origin: origen, "Content-Type": "application/json", "CF-Connecting-IP": `10.0.0.${++ip}` }, body: JSON.stringify(cuerpo),
}), env, ctx);
const valido = () => ({
  codigo: "CASA-ABC234", proyectoId: "jardines-del-ilalo",
  contacto: { nombre: "Daniela Pérez", whatsapp: "593991234567", correo: "", horario: "Tarde", promociones: false },
  consentimiento: { datos: true, promociones: false, version: "2026-10" },
  perfil: { ingreso: 1800, ahorro: 12000, edad: 30, iess: "36mas", historial: "bueno", cuando: "mes", ciudad: "Quito", tipoIngreso: "dependencia" },
  // El navegador podría mandar números inflados: el servidor los ignora y recalcula.
  presupuesto: 999999, prioridad: "A",
});

test("guarda el cliente con la precalificación recalculada y avisa por correo", async () => {
  const r = await pedir(valido());
  assert.equal(r.status, 200);
  const res = await r.json();
  assert.equal(res.ok, true);
  await Promise.all(ctx.pendientes);
  const guardado = llamadas.find(l => l.url.includes("/rest/v1/leads_inmobiliaria"));
  assert.ok(guardado, "no llamó a Supabase");
  assert.equal(guardado.body.whatsapp, "593991234567");
  assert.equal(guardado.body.proyecto_id, "jardines-del-ilalo");
  assert.ok(guardado.body.presupuesto > 90000 && guardado.body.presupuesto < 130000, `presupuesto ${guardado.body.presupuesto}`);
  assert.equal(guardado.body.programa, "miti-vip");
  assert.equal(guardado.body.prioridad, "A");
  assert.ok(llamadas.some(l => l.url.includes("api.resend.com")), "no avisó por correo");
});

test("rechaza origen no permitido, datos incompletos y sin consentimiento", async () => {
  assert.equal((await pedir(valido(), "https://otro.com")).status, 403);
  const sinNombre = valido(); sinNombre.contacto.nombre = "";
  assert.equal((await pedir(sinNombre)).status, 400);
  const sinConsent = valido(); sinConsent.consentimiento.datos = false;
  const r = await pedir(sinConsent);
  assert.equal(r.status, 400);
  assert.deepEqual((await r.json()).campos, ["consentimiento"]);
  assert.equal(llamadas.length, 0);
});

test("el campo trampa descarta bots sin guardar nada", async () => {
  const bot = { ...valido(), empresa: "Spam S.A." };
  const r = await pedir(bot);
  assert.equal(r.status, 200);
  assert.equal(llamadas.length, 0);
});

test("si Supabase falla, responde error para que el cliente use WhatsApp", async () => {
  globalThis.fetch = async () => new Response("caído", { status: 500 });
  assert.equal((await pedir(valido())).status, 502);
});
