/* Maquetas 3D paramétricas: casas modernas, casas adosadas y torres de departamentos, con su lote
   (césped, camino, cerramiento, árboles según la región y piscina), más el cielo y la luz según la
   hora del día. Todo sale del "estilo" de cada proyecto en datos/proyectos.json, así que un
   proyecto nuevo tiene maqueta sin modelar nada. Lo usan escena-hero.js, visor3d.js y
   miniaturas.js. Unidades: metros. El frente de la casa mira a +z. */
import {
  Group, Mesh, BoxGeometry, CylinderGeometry, ConeGeometry, IcosahedronGeometry, SphereGeometry,
  PlaneGeometry, ExtrudeGeometry, Shape, BufferGeometry, Float32BufferAttribute, Points, PointsMaterial,
  MeshStandardMaterial, MeshBasicMaterial, ShaderMaterial, Color, Vector3, DirectionalLight, HemisphereLight,
  Fog, BackSide, AdditiveBlending, mergeGeometries
} from "../vendor/three.js";

// ---------- Utilidades ----------

/** Aleatorio con semilla: el mismo proyecto siempre da la misma maqueta. */
export function aleatorio(semilla){
  let h = 1779033703 ^ String(semilla).length;
  for (const c of String(semilla)){ h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const mat = (color, extra = {}) => new MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });

function caja(padre, w, h, d, material, x, y, z, ry = 0){
  const m = new Mesh(new BoxGeometry(w, h, d), material);
  m.position.set(x, y, z); m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true;
  padre.add(m);
  return m;
}

function aclarar(hex, k){ const c = new Color(hex); c.offsetHSL(0, 0, k); return c; }

/** Materiales de un proyecto. Los vidrios guardan cuánto brillan de noche (habitación con luz o no). */
export function crearMateriales(e = {}){
  const vidrio = (brillo) => {
    const m = mat(0x5f7d8e, { roughness: 0.12, metalness: 0.25, emissive: new Color(0xffb35c), emissiveIntensity: 0 });
    m.userData.brillo = brillo;
    return m;
  };
  return {
    pared: mat(e.pared || "#ECE8E0"),
    pared2: mat(aclarar(e.pared || "#ECE8E0", -0.06)),
    madera: mat(e.acento || "#8A5A3B", { roughness: 0.7 }),
    techo: mat(e.techoColor || "#3E4441", { roughness: 0.9 }),
    losa: mat(0xF2F1EE),
    concreto: mat(0xBDBAB2),
    marco: mat(0x2B2F31, { roughness: 0.5, metalness: 0.4 }),
    vidrios: [vidrio(1.7), vidrio(1.1), vidrio(0.08)],
    baranda: new MeshStandardMaterial({ color: 0xbfd7df, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.35 }),
    puerta: mat(aclarar(e.acento || "#8A5A3B", -0.08), { roughness: 0.6 }),
    cesped: mat(e.paisaje === "costa" ? 0x8DAA5B : 0x7FA35A, { roughness: 1 }),
    tierra: mat(0x7A5A43, { roughness: 1 }),
    tierra2: mat(0x5E4433, { roughness: 1 }),
    camino: mat(0xD8D3C8),
    asfalto: mat(0x3F4447, { roughness: 0.95 }),
    seto: mat(0x4F7A45, { roughness: 1, flatShading: true }),
    hojas: mat(e.paisaje === "costa" ? 0x5E8F4A : 0x4F7D4F, { roughness: 1, flatShading: true }),
    hojas2: mat(e.paisaje === "austro" ? 0x2F5A3E : 0x6C9A55, { roughness: 1, flatShading: true }),
    tronco: mat(0x6B5240, { roughness: 1 }),
    agua: mat(0x3FA7C9, { roughness: 0.1, metalness: 0.1, emissive: new Color(0x2fd0ff), emissiveIntensity: 0 }),
    luz: new MeshStandardMaterial({ color: 0xfff1d6, emissive: new Color(0xffc777), emissiveIntensity: 0 }),
    auto: mat(0x8C2F2B, { roughness: 0.35, metalness: 0.5 }),
    llanta: mat(0x1d1f20),
  };
}

/** Ventana con marco oscuro y vidrio que se enciende de noche. */
function ventana(padre, M, rnd, w, h, x, y, z, ry = 0){
  const g = new Group();
  g.position.set(x, y, z); g.rotation.y = ry;
  const marco = new Mesh(new BoxGeometry(w + 0.14, h + 0.14, 0.08), M.marco);
  const v = M.vidrios[rnd() < 0.55 ? 0 : rnd() < 0.5 ? 1 : 2];
  const vidrio = new Mesh(new BoxGeometry(w, h, 0.1), v);
  vidrio.position.z = 0.01;
  g.add(marco, vidrio);
  padre.add(g);
  return g;
}

// ---------- Edificaciones ----------

const H = 2.9;   // alto de piso

function techo(padre, tipo, M, w, d, y, x = 0, z = 0){
  const g = new Group();
  g.position.set(x, y, z);
  if (tipo === "dosAguas"){
    const alto = Math.min(2.2, w * 0.32), vuelo = 0.45;
    const s = new Shape();
    s.moveTo(-w / 2 - vuelo, 0); s.lineTo(w / 2 + vuelo, 0); s.lineTo(0, alto + 0.15); s.closePath();
    const geo = new ExtrudeGeometry(s, { depth: d + vuelo * 2, bevelEnabled: false });
    geo.translate(0, 0, -(d + vuelo * 2) / 2);
    const m = new Mesh(geo, M.techo); m.castShadow = m.receiveShadow = true;
    g.add(m);
    // Hastial (la pared triangular) en el color de la casa.
    const t = new Shape(); t.moveTo(-w / 2, 0); t.lineTo(w / 2, 0); t.lineTo(0, alto - 0.05); t.closePath();
    const hg = new ExtrudeGeometry(t, { depth: d - 0.02, bevelEnabled: false }); hg.translate(0, 0, -(d - 0.02) / 2);
    const hm = new Mesh(hg, M.pared); hm.castShadow = hm.receiveShadow = true; hm.position.y = -0.01;
    g.add(hm);
  } else if (tipo === "inclinado"){
    const m = caja(g, w + 0.9, 0.22, d + 0.9, M.techo, 0, 0.75, 0);
    m.rotation.x = -0.16;   // agua hacia el frente
    caja(g, w, 1.0, d, M.pared, 0, 0.3, -0.1).scale.set(1, 1, 0.98);
  } else {
    caja(g, w + 0.5, 0.24, d + 0.5, M.losa, 0, 0.12, 0);
    caja(g, w + 0.5, 0.45, 0.12, M.losa, 0, 0.45, (d + 0.5) / 2 - 0.06);   // antepecho frontal
  }
  padre.add(g);
  return g;
}

/** Casa moderna de 1 a 3 pisos con voladizo de madera, ventanales, cochera y entrada. */
function casaModerna(e, M, rnd, opciones = {}){
  const g = new Group();
  const pisos = Math.max(1, Math.min(3, e.pisos || 2));
  const W = pisos === 1 ? 11 : 8.6, D = pisos === 1 ? 8.6 : 9.2;
  const partes = [];
  caja(g, W + 0.5, 0.3, D + 0.5, M.concreto, 0, 0.15, 0);
  for (let i = 0; i < pisos; i++){
    const p = new Group(); p.position.y = 0.3 + i * H; partes.push(p); g.add(p);
    if (i === 0){
      caja(p, W, H, D, M.pared, 0, H / 2, 0);
      // Ventanal de la sala y ventana de la cocina.
      ventana(p, M, rnd, W * 0.42, 2.15, -W * 0.22, 1.2, D / 2 + 0.02);
      ventana(p, M, rnd, 1.2, 1.1, W * 0.33, 1.6, D / 2 + 0.02);
      // Puerta de madera con alero.
      caja(p, 1.05, 2.2, 0.14, M.puerta, W * 0.12, 1.1, D / 2 + 0.05);
      caja(p, 2.2, 0.14, 1.3, M.losa, W * 0.12, 2.5, D / 2 + 0.6);
      ventana(p, M, rnd, 1.6, 1.2, W / 2 + 0.02, 1.5, -D * 0.18, Math.PI / 2);
      ventana(p, M, rnd, 1.6, 1.2, -W / 2 - 0.02, 1.5, D * 0.1, -Math.PI / 2);
      ventana(p, M, rnd, W * 0.5, 2.1, 0, 1.15, -D / 2 - 0.02, Math.PI);
    } else {
      const off = 0.8, w1 = W * 0.84, d1 = D * 0.94;
      caja(p, w1, H, d1, i % 2 ? M.pared : M.pared2, off, H / 2, -0.15);
      caja(p, w1 + 0.3, 0.2, d1 + 0.3, M.losa, off, 0.0, -0.15);
      // Volumen de madera en la mitad izquierda del frente, con celosía.
      caja(p, w1 * 0.46, H - 0.15, 0.16, M.madera, off - w1 * 0.27, H / 2, d1 / 2 - 0.15 + 0.08);
      for (let k = 0; k < 9; k++) caja(p, 0.07, H - 0.5, 0.12, M.madera, off - w1 * 0.48 + k * (w1 * 0.42 / 8), H / 2, d1 / 2 - 0.15 + 0.28);
      ventana(p, M, rnd, w1 * 0.36, 1.45, off + w1 * 0.2, 1.5, d1 / 2 - 0.15 + 0.02);
      ventana(p, M, rnd, 1.4, 1.2, off + w1 / 2 + 0.02, 1.6, -0.6, Math.PI / 2);
      ventana(p, M, rnd, w1 * 0.4, 1.3, off, 1.6, -d1 / 2 - 0.17, Math.PI);
      if (e.techo === "plano" && i === pisos - 1){
        // Balcón con baranda de vidrio sobre la sala.
        caja(p, W * 0.3, 0.16, 1.2, M.losa, -W * 0.3, 0.02, D / 2 + 0.45);
        caja(p, W * 0.3, 1.0, 0.04, M.baranda, -W * 0.3, 0.6, D / 2 + 1.03).castShadow = false;
      }
    }
  }
  const techoG = techo(g, e.techo, M, pisos === 1 ? W : W * 0.84, pisos === 1 ? D : D * 0.94, 0.3 + pisos * H, pisos === 1 ? 0 : 0.8, pisos === 1 ? 0 : -0.15);
  partes.push(techoG);
  // Cochera lateral abierta.
  if (opciones.cochera !== false){
    const cx = W / 2 + 1.75;
    caja(g, 3.4, 0.16, 5.6, M.losa, cx, 2.75, D / 2 - 2.6);
    for (const [dx, dz] of [[1.55, 0], [1.55, -5.2]]) caja(g, 0.12, 2.7, 0.12, M.marco, cx + dx, 1.35, D / 2 - 0.2 + dz);
    if (opciones.auto !== false) auto(g, M, cx, D / 2 - 2.4);
  }
  g.userData.partes = partes;
  g.userData.ancho = W + 4; g.userData.fondo = D;
  return g;
}

function auto(padre, M, x, z){
  const a = new Group(); a.position.set(x, 0.3, z);
  caja(a, 1.75, 0.55, 4.0, M.auto, 0, 0.55, 0);
  caja(a, 1.55, 0.5, 2.0, M.vidrios[2], 0, 1.05, -0.2);
  for (const [dx, dz] of [[0.8, 1.3], [-0.8, 1.3], [0.8, -1.3], [-0.8, -1.3]]){
    const r = new Mesh(new CylinderGeometry(0.33, 0.33, 0.25, 14), M.llanta);
    r.rotation.z = Math.PI / 2; r.position.set(dx, 0.33, dz); a.add(r);
  }
  padre.add(a);
}

/** Fila de casas adosadas de dos pisos con techos a dos aguas y jardín frontal. */
function adosadas(e, M, rnd){
  const g = new Group();
  const n = Math.max(2, Math.min(6, e.unidades || 4)), w = 5.4, D = 9.6;
  const pisosG = [new Group(), new Group()];
  const techoG = new Group();
  pisosG.forEach((p, i) => { p.position.y = 0.3 + i * H; g.add(p); });
  g.add(techoG);
  caja(g, n * w + 0.5, 0.3, D + 0.5, M.concreto, 0, 0.15, 0);
  for (let k = 0; k < n; k++){
    const x = -((n - 1) * w) / 2 + k * w;
    const pm = k % 2 ? M.pared : M.pared2;
    for (let i = 0; i < 2; i++){
      const p = pisosG[i];
      caja(p, w - 0.05, H, D, pm, x, H / 2, 0);
      if (i === 0){
        caja(p, 0.95, 2.15, 0.14, M.puerta, x - w * 0.24, 1.08, D / 2 + 0.05);
        ventana(p, M, rnd, 2.0, 1.4, x + w * 0.16, 1.45, D / 2 + 0.02);
        caja(p, 0.18, H, 0.5, M.madera, x + w / 2 - 0.09, H / 2, D / 2 + 0.2);   // separador entre casas
      } else {
        ventana(p, M, rnd, 1.5, 1.3, x - w * 0.18, 1.55, D / 2 + 0.02);
        ventana(p, M, rnd, 1.2, 1.3, x + w * 0.24, 1.55, D / 2 + 0.02);
        ventana(p, M, rnd, 2.2, 1.2, x, 1.55, -D / 2 - 0.02, Math.PI);
      }
    }
    techo(techoG, e.techo === "plano" ? "plano" : "dosAguas", M, w - 0.05, D, 0.3 + 2 * H, x, 0);
  }
  g.userData.partes = [...pisosG, techoG];
  g.userData.ancho = n * w; g.userData.fondo = D;
  return g;
}

/** Torre de departamentos con franjas de vidrio, balcones alternados y terraza. */
function torre(e, M, rnd){
  const g = new Group();
  const pisos = Math.max(4, Math.min(16, e.pisos || 8));
  const W = 15, D = 11, h = 3.0;
  const partes = [];
  caja(g, W + 1.2, 0.4, D + 1.2, M.concreto, 0, 0.2, 0);
  for (let i = 0; i < pisos; i++){
    const p = new Group(); p.position.y = 0.4 + i * h; partes.push(p); g.add(p);
    const lobby = i === 0;
    // Cuerpo: frente y fondo de vidrio, costados de pared.
    const vid = lobby ? M.vidrios[0] : M.vidrios[rnd() < 0.5 ? 0 : rnd() < 0.6 ? 1 : 2];
    const vid2 = M.vidrios[rnd() < 0.45 ? 0 : 2];
    const cuerpo = new Mesh(new BoxGeometry(W - 0.6, h - 0.28, D - 0.6), [M.pared, M.pared, M.pared, M.pared, vid, vid2]);
    cuerpo.position.y = (h - 0.28) / 2 + 0.28; cuerpo.castShadow = cuerpo.receiveShadow = true;
    p.add(cuerpo);
    caja(p, W, 0.28, D, M.losa, 0, 0.14, 0);
    // Parteluces del frente.
    for (let k = 0; k <= 6; k++) caja(p, 0.12, h - 0.28, 0.14, M.marco, -(W - 0.6) / 2 + k * ((W - 0.6) / 6), (h - 0.28) / 2 + 0.28, (D - 0.6) / 2 + 0.05);
    if (!lobby){
      const lado = i % 2 ? -1 : 1;
      caja(p, W * 0.45, 0.2, 1.5, M.losa, lado * W * 0.24, 0.1, D / 2 + 0.75);
      const b = caja(p, W * 0.45, 1.05, 0.05, M.baranda, lado * W * 0.24, 0.72, D / 2 + 1.48); b.castShadow = false;
    }
    // Franja de color en un costado.
    caja(p, 0.2, h, D * 0.5, M.madera, W / 2 - 0.2, h / 2, D * 0.12);
  }
  const tg = new Group(); tg.position.y = 0.4 + pisos * h; g.add(tg); partes.push(tg);
  caja(tg, W, 0.3, D, M.losa, 0, 0.15, 0);
  caja(tg, W, 0.9, 0.15, M.losa, 0, 0.6, D / 2 - 0.08);
  caja(tg, 0.15, 0.9, D, M.losa, -W / 2 + 0.08, 0.6, 0);
  caja(tg, 4, 2.6, 3.4, M.pared2, -W / 2 + 2.6, 1.6, -D / 2 + 2.2);       // cuarto de máquinas
  for (let k = 0; k < 6; k++) caja(tg, 0.12, 0.12, 4.6, M.madera, 1 + k * 0.8, 2.6, -1.4);   // pérgola
  if (e.piscina){
    caja(tg, 6.2, 0.35, 3.2, M.concreto, 2.5, 0.45, 2.6);
    caja(tg, 5.6, 0.1, 2.6, M.agua, 2.5, 0.62, 2.6).castShadow = false;
  }
  g.userData.partes = partes;
  g.userData.ancho = W; g.userData.fondo = D;
  return g;
}

/** Edificación según el estilo del proyecto. */
export function crearEdificacion(e, M, rnd, opciones){
  if (e.forma === "torre") return torre(e, M, rnd);
  if (e.forma === "adosadas") return adosadas(e, M, rnd);
  return casaModerna(e, M, rnd, opciones);
}

// ---------- Vegetación ----------

export function arbol(M, rnd, tipo = "sierra"){
  const g = new Group();
  const s = 0.75 + rnd() * 0.6;
  if (tipo === "costa"){
    // Palmera: tronco curvo en tramos y hojas caídas.
    let x = 0, y = 0;
    const inclinacion = (rnd() - 0.5) * 0.5;
    for (let i = 0; i < 6; i++){
      const t = new Mesh(new CylinderGeometry(0.16 - i * 0.012, 0.2 - i * 0.012, 1.1, 7), M.tronco);
      t.position.set(x, y + 0.55, 0); t.rotation.z = -inclinacion * (i / 6); t.castShadow = true;
      g.add(t); x += Math.sin(inclinacion * (i / 6)) * 1.1; y += 1.05;
    }
    for (let k = 0; k < 8; k++){
      const hoja = new Mesh(new BoxGeometry(0.5, 0.06, 2.6), M.hojas);
      const a = (k / 8) * Math.PI * 2;
      hoja.position.set(x + Math.sin(a) * 1.1, y + 0.1, Math.cos(a) * 1.1);
      hoja.rotation.y = a; hoja.rotation.x = 0.45; hoja.castShadow = true;
      g.add(hoja);
    }
  } else if (tipo === "austro" && rnd() < 0.5){
    // Ciprés.
    const t = new Mesh(new CylinderGeometry(0.12, 0.16, 1, 6), M.tronco); t.position.y = 0.5; g.add(t);
    const c = new Mesh(new ConeGeometry(0.95, 5.2, 7), M.hojas2); c.position.y = 3.3; c.castShadow = true; g.add(c);
  } else {
    // Árbol andino de copa irregular (arrayán, aliso, eucalipto joven).
    const alto = 1.6 + rnd() * 1.4;
    const t = new Mesh(new CylinderGeometry(0.13, 0.2, alto, 6), M.tronco); t.position.y = alto / 2; t.castShadow = true; g.add(t);
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++){
      const r = 0.9 + rnd() * 0.8;
      const c = new Mesh(new IcosahedronGeometry(r, 0), i % 2 ? M.hojas2 : M.hojas);
      c.position.set((rnd() - 0.5) * 1.2, alto + 0.4 + i * 0.75, (rnd() - 0.5) * 1.2);
      c.rotation.set(rnd() * 3, rnd() * 3, 0); c.castShadow = true;
      g.add(c);
    }
  }
  g.scale.setScalar(s);
  return g;
}

function arbusto(M, rnd){
  const c = new Mesh(new IcosahedronGeometry(0.45 + rnd() * 0.35, 0), M.seto);
  c.position.y = 0.35; c.castShadow = true; c.scale.y = 0.75;
  return c;
}

// ---------- Lote completo ----------

/** Lote con la edificación, jardín, camino, cerramiento, piscina y árboles. */
export function crearLote(proyecto, opciones = {}){
  const e = proyecto.estilo || {};
  const rnd = aleatorio(proyecto.id || "x");
  const M = opciones.materiales || crearMateriales(e);
  const g = new Group();
  const edif = crearEdificacion(e, M, rnd, opciones);
  const ancho = Math.max(24, edif.userData.ancho + 10), fondo = Math.max(24, edif.userData.fondo + 14);
  // Suelo del lote.
  const suelo = new Mesh(new BoxGeometry(ancho, 0.4, fondo), M.cesped);
  suelo.position.y = -0.2; suelo.receiveShadow = true; g.add(suelo);
  // Vereda y calle al frente.
  caja(g, ancho, 0.12, 2.2, M.camino, 0, 0.06, fondo / 2 - 1.1).castShadow = false;
  if (opciones.calle !== false){ const c = caja(g, ancho, 0.05, 6, M.asfalto, 0, 0.02, fondo / 2 + 3); c.castShadow = false; }
  edif.position.z = -1.2;
  g.add(edif);
  // Camino de piedras a la puerta y entrada vehicular.
  if (e.forma !== "torre"){
    for (let k = 0; k < 5; k++) caja(g, 1.0, 0.08, 0.7, M.camino, e.forma === "adosadas" ? -8.1 : 1.0, 0.04, fondo / 2 - 2.8 - k * 1.05).castShadow = false;
    if (e.forma !== "adosadas") caja(g, 3.2, 0.06, 6.5, M.concreto, edif.userData.ancho / 2 - 0.25, 0.03, fondo / 2 - 4.4).castShadow = false;
  } else {
    caja(g, 10, 0.08, 6, M.camino, 0, 0.04, fondo / 2 - 4.5).castShadow = false;
    for (const x of [-4.5, 4.5]) caja(g, 1.6, 0.6, 1.6, M.concreto, x, 0.3, fondo / 2 - 4.2);
  }
  // Cerramiento verde a los lados y atrás.
  for (const s of [-1, 1]) caja(g, 0.6, 1.0, fondo - 3, M.seto, s * (ancho / 2 - 0.4), 0.5, -1.3);
  caja(g, ancho - 1.2, 1.0, 0.6, M.seto, 0, 0.5, -fondo / 2 + 0.4);
  // Piscina atrás.
  if (e.piscina && e.forma !== "torre"){
    const pz = -edif.userData.fondo / 2 - 4.2;
    caja(g, 7.0, 0.24, 3.6, M.camino, -1, 0.12, pz).castShadow = false;
    const agua = caja(g, 6.2, 0.06, 2.8, M.agua, -1, 0.26, pz); agua.castShadow = false;
  }
  // Árboles y arbustos.
  const paisaje = e.paisaje === "costa" ? "costa" : e.paisaje === "austro" ? "austro" : "sierra";
  // Árboles a los lados y atrás: nunca entre la fachada y la cámara (que mira desde el frente derecho).
  const puntos = [[-ancho / 2 + 2.2, fondo / 2 - 3.2], [ancho / 2 - 2.2, -fondo / 2 + 2.5], [-ancho / 2 + 2.8, -fondo / 2 + 3], [-ancho / 2 + 2, 0]];
  for (const [x, z] of puntos){ const a = arbol(M, rnd, paisaje); a.position.set(x, 0, z); g.add(a); }
  for (let k = 0; k < 7; k++){ const b = arbusto(M, rnd); b.position.set(-ancho / 2 + 1.5 + rnd() * (ancho - 3), 0, fondo / 2 - 2.6 - rnd() * 1.2); if (Math.abs(b.position.x - 1) > 1.4) g.add(b); }
  g.userData = { ...g.userData, materiales: M, edificacion: edif, ancho, fondo };
  return g;
}

// ---------- Entorno: cordillera, mar y barrio ----------

/** Montañas (con un volcán nevado al fondo) o mar, más casas vecinas y árboles sueltos. */
export function crearPaisaje(e = {}, M, semilla = "paisaje", opciones = {}){
  const rnd = aleatorio(semilla + (e.paisaje || ""));
  const g = new Group();
  const costa = e.paisaje === "costa";
  if (opciones.suelo !== false){
    const suelo = new Mesh(new PlaneGeometry(900, 900), mat(costa ? 0x9DAE72 : 0x7E9A62, { roughness: 1 }));
    suelo.rotation.x = -Math.PI / 2; suelo.position.y = -0.42; suelo.receiveShadow = true;
    g.add(suelo);
  }
  const roca = [0x7E929C, 0x8C9DA4, 0x71877F, 0x95A3A6].map(c => mat(c, { roughness: 1, flatShading: true }));
  const nieve = mat(0xF4F6F8, { roughness: 0.9, flatShading: true });
  if (costa){
    const mar = new Mesh(new PlaneGeometry(1400, 600), mat(0x3B86A8, { roughness: 0.25, metalness: 0.1 }));
    mar.rotation.x = -Math.PI / 2; mar.position.set(0, -0.3, -420); g.add(mar);
    const arena = new Mesh(new PlaneGeometry(1400, 24), mat(0xE3D3A8, { roughness: 1 }));
    arena.rotation.x = -Math.PI / 2; arena.position.set(0, -0.33, -112); g.add(arena);
    for (let i = 0; i < 6; i++){
      const c = new Mesh(new ConeGeometry(30 + rnd() * 30, 8 + rnd() * 10, 6), roca[i % 4]);
      c.position.set((i % 2 ? 1 : -1) * (120 + rnd() * 120), 2, -40 - rnd() * 80); c.receiveShadow = true; g.add(c);
    }
  } else {
    // Cordillera en anillo, más alta al fondo.
    for (let i = 0; i < 22; i++){
      const a = (i / 22) * Math.PI * 2 + rnd() * 0.2;
      const fondo = Math.cos(a) < -0.3;
      const lejos = opciones.lejos || 1;
      const r = (270 + rnd() * 80) * lejos, alto = ((fondo ? 50 : 26) + rnd() * (fondo ? 40 : 22)) * lejos;
      const c = new Mesh(new ConeGeometry(alto * (1.1 + rnd() * 0.6), alto, 5 + Math.floor(rnd() * 3)), roca[i % 4]);
      c.position.set(Math.sin(a) * r, alto / 2 - 1, Math.cos(a) * r); c.rotation.y = rnd() * 3;
      g.add(c);
    }
    // Volcán nevado al fondo (Cotopaxi, Chimborazo o Tungurahua según la ciudad).
    const k = opciones.lejos || 1, alto = 95 * k, base = 120 * k;
    const v = new Mesh(new ConeGeometry(base, alto, 9), roca[1]); v.position.set(-60 * k, alto / 2 - 2, -300 * k); g.add(v);
    const cap = new Mesh(new ConeGeometry(base * 0.36, alto * 0.36, 9), nieve); cap.position.set(-60 * k, alto - alto * 0.18 - 2 + 0.6, -300 * k); g.add(cap);
  }
  if (opciones.barrio === false) return g;
  // Barrio: casas vecinas sencillas y árboles sueltos.
  const paredes = [0xE9E3D8, 0xDCD6CB, 0xEFE9DD, 0xD9DDD6].map(c => mat(c));
  const techos = [0x7A4A3A, 0x4E5652, 0x8E4A36].map(c => mat(c));
  for (let i = 0; i < 10; i++){
    const a = rnd() * Math.PI * 2, r = 34 + rnd() * 40;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (z > 10 && Math.abs(x) < 30) continue;   // no tapar la vista desde el frente
    const w = 6 + rnd() * 3, d = 7 + rnd() * 3, h = 2.8 * (1 + Math.floor(rnd() * 2));
    const casa = new Group(); casa.position.set(x, 0, z); casa.rotation.y = Math.round(rnd() * 4) * Math.PI / 2;
    caja(casa, w, h, d, paredes[i % 4], 0, h / 2, 0);
    techo(casa, rnd() < 0.5 ? "dosAguas" : "plano", { techo: techos[i % 3], pared: paredes[i % 4], losa: paredes[(i + 1) % 4] }, w, d, h);
    g.add(casa);
  }
  const tipo = costa ? "costa" : e.paisaje === "austro" ? "austro" : "sierra";
  for (let i = 0; i < 18; i++){
    const a = rnd() * Math.PI * 2, r = 20 + rnd() * 50;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (z > 8 && Math.abs(x) < 18) continue;
    const t = arbol(M, rnd, tipo); t.position.set(x, -0.4, z); g.add(t);
  }
  return g;
}

// ---------- Cielo, luz y hora ----------

const CLAVES = [
  // hora, cénit, horizonte, color del sol, intensidad del sol, intensidad del cielo
  [4.5, 0x060a1a, 0x121933, 0xffffff, 0, 0.16],
  [5.9, 0x27325e, 0xe89a66, 0xffb27a, 0.35, 0.4],
  [7.2, 0x4f86c6, 0xf3d3b0, 0xffe1c2, 1.6, 0.8],
  [10, 0x3d7fcf, 0xcfe5f2, 0xfff6ea, 2.6, 1.0],
  [14.5, 0x3a7ccd, 0xd6eaf4, 0xfff4e6, 2.6, 1.0],
  [16.6, 0x4a7fc0, 0xf2d4a8, 0xffd9a8, 2.1, 0.85],
  [17.7, 0x3d4f8a, 0xf39a5c, 0xffa765, 1.3, 0.6],
  [18.4, 0x24305f, 0xc9645a, 0xff7f5a, 0.35, 0.38],
  [19.2, 0x121a3a, 0x3a2f55, 0xffffff, 0, 0.22],
  [22.5, 0x060a1a, 0x121933, 0xffffff, 0, 0.16],
];
const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 0 de día, 1 de noche cerrada. En Ecuador el sol sale ~6:10 y se pone ~18:20 todo el año. */
export function factorNoche(h){ return Math.max(suave(17.6, 19.0, h), 1 - suave(5.5, 6.6, h)); }

export function colorCielo(h){
  let i = 0;
  while (i < CLAVES.length - 2 && h > CLAVES[i + 1][0]) i++;
  const [h0, z0, o0, s0, i0, c0] = CLAVES[i], [h1, z1, o1, s1, i1, c1] = CLAVES[i + 1];
  const t = Math.min(1, Math.max(0, (h - h0) / (h1 - h0)));
  const mezcla = (a, b) => new Color(a).lerp(new Color(b), t);
  return { cenit: mezcla(z0, z1), horizonte: mezcla(o0, o1), sol: mezcla(s0, s1), intensidadSol: i0 + (i1 - i0) * t, intensidadCielo: c0 + (c1 - c0) * t };
}

/** Domo de cielo con degradado, sol, estrellas y luces. Devuelve hora(h) para cambiar la hora. */
export function crearAmbiente(escena, opciones = {}){
  const radio = opciones.radio || 400;
  const uniforms = { cenit: { value: new Color() }, horizonte: { value: new Color() }, suelo: { value: new Color(0x2a2f2c) } };
  const cielo = new Mesh(new SphereGeometry(radio, 32, 16), new ShaderMaterial({
    uniforms, side: BackSide, depthWrite: false, fog: false,
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 cenit; uniform vec3 horizonte; uniform vec3 suelo; varying vec3 vP; void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(horizonte, cenit, pow(clamp(y * 1.6, 0.0, 1.0), 0.7)) : mix(horizonte, suelo, clamp(-y * 6.0, 0.0, 1.0)); gl_FragColor = vec4(c, 1.0); }",
  }));
  escena.add(cielo);

  const n = 600, pos = new Float32Array(n * 3), r = aleatorio("estrellas");
  for (let i = 0; i < n; i++){
    const a = r() * Math.PI * 2, b = Math.acos(0.15 + r() * 0.85);
    pos.set([Math.sin(b) * Math.cos(a) * radio * 0.9, Math.cos(b) * radio * 0.9, Math.sin(b) * Math.sin(a) * radio * 0.9], i * 3);
  }
  const gEst = new BufferGeometry(); gEst.setAttribute("position", new Float32BufferAttribute(pos, 3));
  const estrellas = new Points(gEst, new PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  escena.add(estrellas);

  const disco = new Mesh(new SphereGeometry(radio * 0.035, 16, 8), new MeshBasicMaterial({ color: 0xfff1c4, fog: false, transparent: true, blending: AdditiveBlending }));
  escena.add(disco);

  const hemi = new HemisphereLight(0xcfe5ff, 0x5b6b4a, 1);
  escena.add(hemi);
  const sol = new DirectionalLight(0xffffff, 2);
  sol.castShadow = true;
  const ext = opciones.sombra || 30;
  Object.assign(sol.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 300 });
  sol.shadow.mapSize.set(opciones.mapa || 2048, opciones.mapa || 2048);
  sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.03;
  escena.add(sol, sol.target);
  const luna = new DirectionalLight(0x9db4ff, 0);
  luna.position.set(-60, 90, 40);
  escena.add(luna);
  escena.fog = new Fog(0xffffff, radio * 0.22, radio * 0.98);

  let noche = 0;
  function hora(h){
    const c = colorCielo(h);
    uniforms.cenit.value.copy(c.cenit); uniforms.horizonte.value.copy(c.horizonte);
    uniforms.suelo.value.copy(c.horizonte).multiplyScalar(0.35);
    escena.fog.color.copy(c.horizonte);
    // Trayectoria del sol en la línea ecuatorial: sale por el este (+x), casi cenital al mediodía.
    const ang = ((h - 6.1) / 12.2) * Math.PI;
    const dir = new Vector3(Math.cos(ang), Math.sin(ang), 0.35).normalize();
    sol.position.copy(dir).multiplyScalar(120);
    sol.color.copy(c.sol); sol.intensity = Math.max(0, c.intensidadSol * Math.min(1, dir.y * 4 + 0.15));
    disco.position.copy(dir).multiplyScalar(radio * 0.85);
    disco.material.color.copy(c.sol); disco.material.opacity = dir.y > -0.05 ? 1 : 0;
    hemi.intensity = c.intensidadCielo;
    hemi.color.copy(c.cenit).lerp(new Color(0xffffff), 0.5);
    noche = factorNoche(h);
    estrellas.material.opacity = noche;
    luna.intensity = noche * 0.55;
    return noche;
  }
  return { hora, sol, hemi, luna, cielo, get noche(){ return noche; } };
}

/** Enciende vidrios, agua y faroles según qué tan de noche es. */
export function ajustarNoche(M, noche){
  for (const v of M.vidrios) v.emissiveIntensity = noche * v.userData.brillo;
  M.agua.emissiveIntensity = noche * 0.55;
  M.luz.emissiveIntensity = noche * 2.2;
}

// ---------- Fusión de geometrías (menos llamadas de dibujo) ----------

/** Junta en una sola malla todas las piezas que comparten material dentro de un grupo. */
export function fusionar(grupo){
  grupo.updateMatrixWorld(true);
  const inv = grupo.matrixWorld.clone().invert();
  const porMaterial = new Map(), sueltas = [];
  grupo.traverse(o => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material) || o.material.transparent){ sueltas.push(o); return; }
    const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    geo.applyMatrix4(o.matrixWorld.clone().premultiply(inv));
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k);
    const lista = porMaterial.get(o.material) || [];
    lista.push({ geo, sombra: o.castShadow });
    porMaterial.set(o.material, lista);
  });
  const nuevo = new Group();
  for (const [m, lista] of porMaterial){
    const fusion = mergeGeometries(lista.map(x => x.geo), false);
    lista.forEach(x => x.geo.dispose());
    if (!fusion) continue;
    const malla = new Mesh(fusion, m);
    malla.castShadow = lista.some(x => x.sombra); malla.receiveShadow = true;
    nuevo.add(malla);
  }
  for (const o of sueltas){
    const copia = o.clone();
    copia.matrix.copy(o.matrixWorld).premultiply(inv);
    copia.matrix.decompose(copia.position, copia.quaternion, copia.scale);
    nuevo.add(copia);
  }
  nuevo.userData = grupo.userData;
  return nuevo;
}

/** Libera la memoria de la GPU de un objeto y sus hijos. */
export function liberar(objeto){
  objeto.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    ms.forEach(m => m.dispose());
  });
}

