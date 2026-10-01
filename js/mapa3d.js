/* Mapa 3D del Ecuador continental: el país en relieve sobre una grilla de plano, los volcanes de la
   cordillera en su lugar real y un pin por ciudad con proyectos, alto según cuántos hay. Las
   etiquetas son botones HTML (se pueden tocar y leer con lector de pantalla) que siguen a cada pin.
   Al elegir una ciudad avisa a app.js para filtrar el catálogo. Sin WebGL 2 la sección muestra
   solo la lista de ciudades. */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Shape, ExtrudeGeometry, ConeGeometry, CylinderGeometry,
  SphereGeometry, RingGeometry, EdgesGeometry, LineSegments, LineBasicMaterial, MeshStandardMaterial,
  MeshBasicMaterial, DirectionalLight, HemisphereLight, GridHelper, Vector3, SRGBColorSpace, DoubleSide
} from "../vendor/three.js";
import { ECUADOR } from "./ecuador.js";

const K = 10, LON0 = -78.6, LAT0 = -1.55;
const aXZ = (lat, lon) => [(lon - LON0) * K, -(lat - LAT0) * K];

// Volcanes principales [nombre, latitud, longitud, altura en metros].
const VOLCANES = [
  ["Cayambe", 0.029, -77.986, 5790], ["Antisana", -0.481, -78.141, 5753], ["Cotopaxi", -0.684, -78.437, 5897],
  ["Iliniza", -0.659, -78.714, 5248], ["Pichincha", -0.171, -78.598, 4784], ["Chimborazo", -1.469, -78.817, 6263],
  ["Tungurahua", -1.467, -78.442, 5023], ["Altar", -1.676, -78.42, 5319], ["Sangay", -2.005, -78.341, 5230],
  ["Cotacachi", 0.36, -78.35, 4939],
];

const leerColor = (nombre, defecto) => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim() || defecto;

export function iniciarMapa(contenedor, ciudades, { alElegir } = {}){
  const canvas = contenedor.querySelector("canvas");
  const capa = contenedor.querySelector(".mapa-etiquetas");
  const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const escena = new Scene();
  const mapa = new Group();
  escena.add(mapa);

  const tierra = new MeshStandardMaterial({ color: 0x9fb39a, roughness: 0.9 });
  const borde = new MeshStandardMaterial({ color: 0x6f846c, roughness: 1 });
  const linea = new LineBasicMaterial({ color: 0x2c3a33 });
  const roca = new MeshStandardMaterial({ color: 0x8a8f86, roughness: 1, flatShading: true });
  const nieve = new MeshStandardMaterial({ color: 0xf6f7f8, roughness: 0.8, flatShading: true });
  const pinMat = new MeshStandardMaterial({ color: 0xf2a93b, emissive: 0xf2a93b, emissiveIntensity: 0.35, roughness: 0.4 });
  const tallo = new MeshStandardMaterial({ color: 0x2c3a33, roughness: 0.6 });
  const anilloMat = new MeshBasicMaterial({ color: 0xf2a93b, transparent: true, opacity: 0.5, side: DoubleSide, depthWrite: false });

  // País en relieve.
  const s = new Shape();
  ECUADOR.forEach(([lon, lat], i) => { const x = (lon - LON0) * K, y = (lat - LAT0) * K; i ? s.lineTo(x, y) : s.moveTo(x, y); });
  const geo = new ExtrudeGeometry(s, { depth: 1.4, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 2 });
  geo.rotateX(-Math.PI / 2);
  const pais = new Mesh(geo, [tierra, borde]);
  mapa.add(pais);
  const contorno = new LineSegments(new EdgesGeometry(geo, 25), linea);
  mapa.add(contorno);
  const grilla = new GridHelper(260, 52, 0x8aa0a8, 0x8aa0a8);
  grilla.position.y = -0.05; grilla.material.transparent = true; grilla.material.opacity = 0.35;
  mapa.add(grilla);

  for (const [, lat, lon, m] of VOLCANES){
    const [x, z] = aXZ(lat, lon);
    const alto = (m / 6263) * 4.2, radio = alto * 0.9;
    const c = new Mesh(new ConeGeometry(radio, alto, 8), roca); c.position.set(x, 1.65 + alto / 2, z); mapa.add(c);
    const n = new Mesh(new ConeGeometry(radio * 0.38, alto * 0.38, 8), nieve); n.position.set(x, 1.65 + alto - alto * 0.19 + 0.02, z); mapa.add(n);
  }

  // Pines por ciudad.
  const pines = ciudades.map(c => {
    const [x, z] = aXZ(c.lat, c.lon);
    const alto = 3 + c.cantidad * 1.1;
    const g = new Group(); g.position.set(x, 1.65, z);
    const t = new Mesh(new CylinderGeometry(0.12, 0.12, alto, 8), tallo); t.position.y = alto / 2;
    const cabeza = new Mesh(new SphereGeometry(0.8, 20, 12), pinMat); cabeza.position.y = alto + 0.4;
    const anillo = new Mesh(new RingGeometry(0.9, 1.5, 32), anilloMat.clone()); anillo.rotation.x = -Math.PI / 2; anillo.position.y = 0.05;
    g.add(t, cabeza, anillo);
    mapa.add(g);
    const b = document.createElement("button");
    b.type = "button"; b.className = "mapa-etiqueta";
    b.innerHTML = `<strong>${c.nombre}</strong><span>${c.cantidad} ${c.cantidad === 1 ? "proyecto" : "proyectos"} · desde ${c.desde}</span>`;
    b.addEventListener("click", () => alElegir?.(c.nombre));
    capa.appendChild(b);
    return { c, g, cabeza, anillo, b, alto };
  });

  escena.add(new HemisphereLight(0xffffff, 0x8a9a90, 1.4));
  const sol = new DirectionalLight(0xffffff, 1.6); sol.position.set(30, 60, 40); escena.add(sol);

  let ancho = 0, alto = 0, giro = 0, giroMeta = 0, elegida = null, visible = false, cuadro = 0;
  function aplicarTema(){
    tierra.color.set(leerColor("--mapa-tierra", "#9fb39a"));
    borde.color.set(leerColor("--mapa-borde", "#6f846c"));
    linea.color.set(leerColor("--tinta", "#2c3a33"));
    grilla.material.color.set(leerColor("--linea-fuerte", "#8aa0a8"));
    tallo.color.set(leerColor("--tinta", "#2c3a33"));
    pedir();
  }
  aplicarTema();
  const mqOscuro = matchMedia("(prefers-color-scheme: dark)");
  mqOscuro.addEventListener?.("change", aplicarTema);
  const obsTema = new MutationObserver(aplicarTema);
  obsTema.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const camara = new PerspectiveCamera(30, 1, 1, 1000);
  const objetivo = new Vector3(0, 0, 4);
  function medir(){
    const r = canvas.getBoundingClientRect();
    if (r.width === ancho && r.height === alto) return;
    ancho = r.width; alto = r.height;
    renderer.setSize(ancho, alto, false);
    camara.aspect = ancho / alto; camara.updateProjectionMatrix();
  }
  const v = new Vector3();
  function dibujar(t){
    cuadro = 0;
    if (!visible) return;
    medir();
    giro += (giroMeta - giro) * 0.06;
    const dist = 118 / Math.min(1.1, Math.max(0.62, camara.aspect));
    const dir = new Vector3(-0.18, 1.15, 0.85).normalize().applyAxisAngle(new Vector3(0, 1, 0), giro + (reducir ? 0 : Math.sin(t / 7000) * 0.06));
    camara.position.copy(dir.multiplyScalar(dist)).add(objetivo);
    camara.lookAt(objetivo);
    const ocupados = [];
    const chica = ancho < 560;
    for (const p of pines){
      const activo = elegida === p.c.nombre;
      const k = reducir ? 0 : (t / 1400 + p.c.lat) % 1;
      p.anillo.scale.setScalar(1 + k * 1.8); p.anillo.material.opacity = 0.55 * (1 - k);
      p.cabeza.scale.setScalar(activo ? 1.5 : 1);
      v.set(0, p.alto + 1.6, 0); p.g.localToWorld(v); v.project(camara);
      const sx = (v.x * 0.5 + 0.5) * ancho, sy = (-v.y * 0.5 + 0.5) * alto;
      p.b.classList.toggle("activa", activo);
      p.b.classList.toggle("chica", chica && !activo);
      // Las etiquetas van de la ciudad con más proyectos a la de menos. Si una pisa a otra, prueba
      // debajo del pin; si tampoco cabe, se esconde (el pin y la lista de ciudades siguen ahí).
      const w = p.b.offsetWidth, h = p.b.offsetHeight;
      const base = (-v.y * 0.5 + 0.5) * alto;
      v.set(0, 0, 0); p.g.localToWorld(v); v.project(camara);
      const debajo = (-v.y * 0.5 + 0.5) * alto + 10;
      const choca = c => ocupados.some(o => c[0] < o[2] && c[2] > o[0] && c[1] < o[3] && c[3] > o[1]);
      const arriba = [sx - w / 2, base - h, sx + w / 2, base], abajo = [sx - w / 2, debajo, sx + w / 2, debajo + h];
      let caja = arriba, y = base - h;
      if (choca(arriba) && !activo){ caja = abajo; y = debajo; }
      const oculta = choca(caja) && !activo;
      p.b.style.transform = `translate(${sx - w / 2}px, ${y}px)`;
      p.b.classList.toggle("oculta", oculta);
      if (!oculta) ocupados.push(caja);
    }
    renderer.render(escena, camara);
    pedir();
  }
  function pedir(){ if (!cuadro && visible) cuadro = requestAnimationFrame(dibujar); }
  const obs = new IntersectionObserver(([x]) => { visible = x.isIntersecting; pedir(); });
  obs.observe(canvas);
  contenedor.addEventListener("pointermove", e => {
    const r = contenedor.getBoundingClientRect();
    giroMeta = ((e.clientX - r.left) / r.width - 0.5) * 0.35;
  });
  contenedor.addEventListener("pointerleave", () => { giroMeta = 0; });

  return {
    elegir(nombre){ elegida = nombre; pedir(); },
    destruir(){ obs.disconnect(); obsTema.disconnect(); renderer.dispose(); capa.innerHTML = ""; },
  };
}
