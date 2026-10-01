// Pruebas del motor de precalificación. Correr con: node --test pruebas/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cuotaMensual, montoMaximo, evaluarPerfil, evaluarPrograma, planPara, mejorPlan, planReferencial,
  semaforoPlan, puntaje, codigoCliente, normalizarPerfil, elegibilidad, sugerencias,
} from "../sitio/js/finanzas.js";

const params = JSON.parse(readFileSync(new URL("../sitio/datos/parametros-financieros.json", import.meta.url)));
params.precioMinPortafolio = 60000;
const prog = id => params.programas.find(p => p.id === id);
const centavos = x => Math.round(x * 100) / 100;

test("cuotas de referencia del prompt (sin seguros)", () => {
  assert.equal(centavos(cuotaMensual(95000, 0.0499, 25)), 554.81);
  assert.equal(centavos(cuotaMensual(112000, 0.075, 20)), 902.26);
  assert.equal(centavos(cuotaMensual(65000, 0.0299, 30)), 273.69);
});

test("montoMaximo es la inversa de cuotaMensual", () => {
  for (const [m, t, a] of [[95000, 0.0499, 25], [112000, 0.075, 20], [40000, 0.09, 15]]){
    assert.ok(Math.abs(montoMaximo(cuotaMensual(m, t, a), t, a) - m) < 0.01);
  }
  assert.equal(cuotaMensual(0, 0.05, 20), 0);
  assert.equal(cuotaMensual(1200, 0, 10), 10);
});

test("Miti-Miti VIP pide 5 % de entrada y no admite a quien ya tiene vivienda", () => {
  const p = normalizarPerfil({ ingreso: 1800, ahorro: 8000, edad: 32 });
  const plan = planPara(100000, prog("miti-vip"), p, params);
  assert.equal(plan.entrada, 5000);
  assert.equal(centavos(plan.cuota), 554.81);
  assert.ok(plan.aplica);
  const conCasa = elegibilidad(prog("miti-vip"), normalizarPerfil({ ...p, tieneVivienda: true }), params);
  assert.equal(conCasa.ok, false);
});

test("Miti-Miti VIP respeta el tope de ingreso familiar (6,34 SBU)", () => {
  const rico = normalizarPerfil({ ingreso: 2500, codeudor: true, ingresoCodeudor: 900 });
  assert.equal(elegibilidad(prog("miti-vip"), rico, params).ok, false);
  assert.equal(elegibilidad(prog("banca"), rico, params).ok, true);
});

test("Credicasa: solo con IESS, préstamo tope de USD 65.000 y avalúo hasta 71.504,70", () => {
  const sinIess = normalizarPerfil({ ingreso: 1200, iess: "no" });
  assert.equal(elegibilidad(prog("credicasa"), sinIess, params).ok, false);
  const p = normalizarPerfil({ ingreso: 1400, iess: "36mas", ahorro: 9000, edad: 30 });
  const plan = planPara(70000, prog("credicasa"), p, params);
  assert.equal(plan.prestamo, 65000);
  assert.equal(plan.entrada, 5000);
  assert.equal(plan.plazo, 30);
  assert.equal(planPara(72000, prog("credicasa"), p, params).aplica, false);
});

test("el plazo se acorta con la edad", () => {
  const p = normalizarPerfil({ ingreso: 2000, edad: 60 });
  assert.equal(evaluarPrograma(prog("banca"), p, params).plazo, 15);
  const mayor = normalizarPerfil({ ingreso: 2000, edad: 72 });
  assert.equal(elegibilidad(prog("banca"), mayor, params).ok, false);
});

test("el precio máximo respeta ingreso, entrada y tope a la vez", () => {
  // Mucho ingreso y poco ahorro: lo limita la entrada.
  const pocoAhorro = normalizarPerfil({ ingreso: 3000, ahorro: 5000, edad: 30 });
  const r = evaluarPrograma(prog("banca"), pocoAhorro, params);
  assert.equal(r.limitante, "entrada");
  assert.ok(r.precioMax <= 5000 / (0.2 + 0.03) + 100);
  // Poco ingreso y mucho ahorro: lo limita el ingreso.
  const pocoIngreso = normalizarPerfil({ ingreso: 900, ahorro: 60000, edad: 30 });
  assert.equal(evaluarPrograma(prog("banca"), pocoIngreso, params).limitante, "ingreso");
  // VIP con todo de sobra: lo limita el tope del programa.
  const sobrado = normalizarPerfil({ ingreso: 2900, ahorro: 30000, edad: 30 });
  const vip = evaluarPrograma(prog("miti-vip"), sobrado, params);
  assert.equal(vip.limitante, "tope");
  assert.equal(vip.precioMax, 110300);
});

test("comprar al precio máximo calculado sí alcanza (consistencia)", () => {
  const perfiles = [
    { ingreso: 1500, ahorro: 7000, edad: 33 },
    { ingreso: 2600, ahorro: 30000, edad: 41, tieneVivienda: true },
    { ingreso: 1100, ahorro: 3000, cuotaEntrada: 250, iess: "36mas", edad: 28 },
    { ingreso: 2200, ahorro: 15000, tipoIngreso: "independiente", edad: 45, deudas: 200 },
  ];
  for (const perfil of perfiles){
    const ev = evaluarPerfil(perfil, params);
    for (const r of ev.programas.filter(x => x.elegible && x.precioMax > 0)){
      const plan = planPara(r.precioMax, r.programa, ev.perfil, params);
      assert.ok(plan.alcanza, `${r.programa.id} con ${JSON.stringify(perfil)}: ${JSON.stringify({ fi: plan.faltaIngreso, fe: plan.faltaEntrada })}`);
    }
  }
});

test("evaluarPerfil recomienda el crédito más barato que sirve y da un rango coherente", () => {
  const ev = evaluarPerfil({ ingreso: 1600, ahorro: 9000, iess: "36mas", edad: 31 }, params);
  assert.ok(ev.presupuesto > 60000);
  assert.ok(ev.rango.conservador <= ev.presupuesto && ev.presupuesto <= ev.rango.optimista);
  assert.ok(ev.recomendado.tasa <= ev.maximo.tasa);
});

test("mejorPlan elige la menor cuota entre los que alcanzan", () => {
  const perfil = { ingreso: 1800, ahorro: 12000, edad: 30 };
  const plan = mejorPlan(98000, perfil, params);
  assert.equal(plan.programa.id, "miti-vip");
  assert.equal(semaforoPlan(plan, params), "verde");
});

test("semáforo amarillo cuando falta poco, rojo cuando falta mucho", () => {
  const casi = mejorPlan(100000, { ingreso: 1450, ahorro: 6500, edad: 30 }, params);
  assert.equal(semaforoPlan(casi, params), "amarillo");
  const lejos = mejorPlan(150000, { ingreso: 700, ahorro: 1000, edad: 30 }, params);
  assert.equal(semaforoPlan(lejos, params), "rojo");
  assert.ok(sugerencias(lejos, { ingreso: 700, ahorro: 1000 }, params).length >= 2);
});

test("cuota referencial de las tarjetas: Credicasa barato, Miti-Miti en el medio", () => {
  assert.equal(planReferencial(68000, params).programa.id, "credicasa");
  assert.equal(planReferencial(100000, params).programa.id, "miti-vip");
  assert.ok(planReferencial(140000, params).cuota > 0);
});

test("puntaje y prioridad", () => {
  const perfil = { ingreso: 1800, ahorro: 12000, edad: 30, iess: "36mas", historial: "bueno", cuando: "mes" };
  const ev = evaluarPerfil(perfil, params);
  const plan = mejorPlan(98000, perfil, params);
  const caliente = puntaje(perfil, ev, plan, { whatsapp: "+593999999999", correo: "a@b.ec" });
  assert.equal(caliente.prioridad, "A");
  assert.equal(caliente.total, 30 + 20 + 15 + 8 + 15 + 10);
  const frio = puntaje({ ingreso: 600, cuando: "averiguando", historial: "atrasos", tipoIngreso: "negocio" }, evaluarPerfil({ ingreso: 600 }, params), mejorPlan(120000, { ingreso: 600 }, params), {});
  assert.equal(frio.prioridad, "C");
});

test("código de cliente legible", () => {
  const c = codigoCliente("CASA");
  assert.match(c, /^CASA-[A-HJKMNP-Z2-9]{6}$/);
  assert.notEqual(codigoCliente("CASA"), codigoCliente("CASA"));
});
