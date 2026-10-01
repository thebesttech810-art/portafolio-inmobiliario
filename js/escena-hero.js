/* Portada 3D: la maqueta de una urbanización sobre su base de tierra, como las de una sala de
   ventas, frente a la cordillera y un volcán nevado. La hora del día la manda el reloj de la
   portada (y el scroll): de tarde dorada a noche con las ventanas y los faroles encendidos.
   app.js lo carga con import dinámico solo si hay WebGL 2; si falla, queda la imagen de respaldo. */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Shape, ExtrudeGeometry, BoxGeometry, CylinderGeometry,
  IcosahedronGeometry, PlaneGeometry, MeshStandardMaterial, PointLight, Vector3, SRGBColorSpace,
  ACESFilmicToneMapping, PCFShadowMap, GridHelper
} from "../vendor/three.js";
import { crearLote, crearEdificacion, crearPaisaje, crearAmbiente, ajustarNoche, fusionar, crearMateriales, arbol, aleatorio } from "./casa3d.js";

const LOTES = [
  { id: "hero-a", x: -26, estilo: { forma: "casa", pisos: 2, techo: "dosAguas", pared: "#E9E2D5", acento: "#7C4F38", techoColor: "#8E4A36", paisaje: "sierra" } },
  { id: "hero-b", x: 0, estilo: { forma: "casa", pisos: 2, techo: "plano", pared: "#EDEAE3", acento: "#8A5A3B", techoColor: "#3E4441", paisaje: "valle", piscina: true } },
  { id: "hero-c", x: 27, estilo: { forma: "adosadas", unidades: 3, pisos: 2, techo: "dosAguas", pared: "#E6DED2", acento: "#9C6B48", techoColor: "#7A4A3A", paisaje: "sierra" } },
];

function base(ancho, fondo){
  const r = 4, s = new Shape(), w = ancho / 2, d = fondo / 2;
  s.moveTo(-w + r, -d); s.lineTo(w - r, -d); s.quadraticCurveTo(w, -d, w, -d + r); s.lineTo(w, d - r);
  s.quadraticCurveTo(w, d, w - r, d); s.lineTo(-w + r, d); s.quadraticCurveTo(-w, d, -w, d - r); s.lineTo(-w, -d + r);
  s.quadraticCurveTo(-w, -d, -w + r, -d);
  const g = new Group();
  const capa = (alto, y, colores) => {
    const geo = new ExtrudeGeometry(s, { depth: alto, bevelEnabled: false, curveSegments: 6 });
    geo.rotateX(-Math.PI / 2); geo.translate(0, y - alto, 0);
    const m = new Mesh(geo, colores.map(c => new MeshStandardMaterial({ color: c, roughness: 1 })));
    m.receiveShadow = true;
    g.add(m);
  };
  capa(0.5, 0, [0x7FA35A, 0x6E8F4C]);       // césped
  capa(2.2, -0.5, [0x6B4E3A, 0x6B4E3A]);    // tierra
  capa(1.2, -2.7, [0x4A372B, 0x4A372B]);    // tierra profunda
  return g;
}

export function iniciarHero(canvas, opciones = {}){
  const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const movil = matchMedia("(max-width: 760px)").matches;
  const renderer = new WebGLRenderer({ canvas, antialias: !movil || devicePixelRatio < 2, powerPreference: "high-performance" });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setPixelRatio(Math.min(devicePixelRatio, movil ? 1.5 : 1.75));

  const escena = new Scene();
  const amb = crearAmbiente(escena, { radio: 1100, sombra: 48, mapa: movil ? 1024 : 2048 });
  const materiales = [];

  // Paisaje lejano (sin barrio ni suelo) y una mesa de planos bajo la maqueta.
  const Mfondo = crearMateriales({ paisaje: "sierra" });
  materiales.push(Mfondo);
  escena.add(crearPaisaje({ paisaje: "sierra" }, Mfondo, "hero", { barrio: false, suelo: false, lejos: 2.4 }));
  const mesa = new Mesh(new PlaneGeometry(1400, 1400), new MeshStandardMaterial({ color: 0x9fb0b4, roughness: 0.95 }));
  mesa.rotation.x = -Math.PI / 2; mesa.position.y = -3.92; mesa.receiveShadow = true;
  escena.add(mesa);
  const grilla = new GridHelper(700, 140, 0x56707c, 0x56707c);
  grilla.position.y = -3.88; grilla.material.transparent = true; grilla.material.opacity = 0.22;
  escena.add(grilla);

  const maqueta = new Group();
  escena.add(maqueta);
  maqueta.add(base(92, 66));
  for (const l of LOTES){
    const M = crearMateriales(l.estilo); materiales.push(M);
    const lote = fusionar(crearLote({ id: l.id, estilo: l.estilo }, { materiales: M, calle: false }));
    lote.position.set(l.x, 0.2, -8);
    maqueta.add(lote);
  }
  // Torre al fondo con su plaza.
  {
    const e = { forma: "torre", pisos: 7, techo: "plano", pared: "#DCE0DC", acento: "#3F6B5A", techoColor: "#5A615E", piscina: true };
    const M = crearMateriales(e); materiales.push(M);
    const g = new Group();
    const plaza = new Mesh(new BoxGeometry(19, 0.3, 12.5), M.camino); plaza.position.y = 0.05; plaza.receiveShadow = true;
    g.add(plaza, crearEdificacion(e, M, aleatorio("hero-t")));
    const torre = fusionar(g); torre.position.set(-33, 0, -26.5);
    maqueta.add(torre);
  }
  // Parque frente a la calle: árboles, bancas y faroles con luz de verdad.
  const rnd = aleatorio("parque");
  const parque = new Group();
  for (let i = 0; i < 16; i++){
    const x = -42 + rnd() * 84, z = 17 + rnd() * 13;
    if (Math.abs(x) < 6 && z < 26) continue;
    const a = arbol(Mfondo, rnd, "sierra"); a.position.set(x, 0, z); a.scale.multiplyScalar(0.9); parque.add(a);
  }
  const calle = new Mesh(new BoxGeometry(92, 0.06, 6), Mfondo.asfalto); calle.position.set(0, 0.23, 7); calle.receiveShadow = true; parque.add(calle);
  for (let i = 0; i < 12; i++){ const r = new Mesh(new BoxGeometry(2.4, 0.07, 0.18), Mfondo.losa); r.position.set(-41 + i * 7.5, 0.24, 7); parque.add(r); }
  const vereda = new Mesh(new BoxGeometry(92, 0.14, 2), Mfondo.camino); vereda.position.set(0, 0.07, 11); vereda.receiveShadow = true; parque.add(vereda);
  const sendero = new Mesh(new BoxGeometry(5, 0.08, 14), Mfondo.camino); sendero.position.set(0, 0.04, 24); sendero.receiveShadow = true; parque.add(sendero);
  const plaza = new Mesh(new CylinderGeometry(5.5, 5.5, 0.1, 32), Mfondo.camino); plaza.position.set(0, 0.05, 25); plaza.receiveShadow = true; parque.add(plaza);
  const fuente = new Mesh(new CylinderGeometry(1.6, 1.8, 0.6, 24), Mfondo.concreto); fuente.position.set(0, 0.3, 25); parque.add(fuente);
  const agua = new Mesh(new CylinderGeometry(1.4, 1.4, 0.1, 24), Mfondo.agua); agua.position.set(0, 0.58, 25); parque.add(agua);
  const faroles = [];
  for (let i = 0; i < 7; i++){
    const x = -39 + i * 13;
    const poste = new Mesh(new CylinderGeometry(0.08, 0.1, 4.2, 6), Mfondo.marco); poste.position.set(x, 2.1, 15); poste.castShadow = true;
    const cabeza = new Mesh(new BoxGeometry(0.9, 0.2, 0.4), Mfondo.luz); cabeza.position.set(x + 0.3, 4.2, 15);
    parque.add(poste, cabeza);
    if (i % 2 === 1){
      const luz = new PointLight(0xffc27a, 0, 22, 1.6); luz.position.set(x + 0.3, 3.9, 15);
      escena.add(luz); faroles.push(luz);
    }
  }
  maqueta.add(fusionar(parque));

  // Nubes de maqueta.
  const nubes = new Group();
  const blanco = new MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.25, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 6; i++){
    const n = new Group();
    for (let k = 0; k < 4; k++){
      const b = new Mesh(new IcosahedronGeometry(3 + rnd() * 3, 3), blanco);
      b.position.set(k * 4 - 6, rnd() * 2, rnd() * 3); b.scale.y = 0.6; n.add(b);
    }
    n.position.set(-120 + i * 48 + rnd() * 20, 44 + rnd() * 18, -60 - rnd() * 90);
    nubes.add(n);
  }
  escena.add(nubes);

  const camara = new PerspectiveCamera(30, 1, 1, 2000);
  const objetivo = new Vector3(0, 1, 0);
  const direccion = new Vector3(0.6, 0.4, 1).normalize();
  let distancia = 120;

  let ancho = 0, alto = 0;
  function medir(){
    const r = canvas.getBoundingClientRect();
    if (r.width === ancho && r.height === alto) return;
    ancho = r.width; alto = r.height;
    renderer.setSize(ancho, alto, false);
    camara.aspect = ancho / alto;
    // En pantallas anchas la maqueta va a la derecha del texto; en el celular, abajo.
    const ancha = ancho / alto > 1.15;
    distancia = ancha ? 132 : 150 / Math.max(0.62, camara.aspect);
    if (ancha) camara.setViewOffset(ancho, alto, -ancho * 0.13, -alto * 0.03, ancho, alto);
    else camara.setViewOffset(ancho, alto, 0, -alto * 0.16, ancho, alto);
    camara.updateProjectionMatrix();
  }

  let hora = opciones.hora ?? 16.6, horaMeta = hora;
  function aplicarHora(h){
    const noche = amb.hora(h);
    materiales.forEach(M => ajustarNoche(M, noche));
    faroles.forEach(l => { l.intensity = noche * 60; });
    blanco.color.setScalar(1 - noche * 0.75); blanco.emissiveIntensity = 0.25 * (1 - noche);
  }
  aplicarHora(hora);

  let px = 0, py = 0, visible = true, activo = true, t0 = performance.now(), cuadro = 0;
  const alMover = e => { px = (e.clientX / innerWidth - 0.5); py = (e.clientY / innerHeight - 0.5); };
  addEventListener("pointermove", alMover, { passive: true });
  const obs = new IntersectionObserver(([x]) => { visible = x.isIntersecting; if (visible) pedir(); });
  obs.observe(canvas);
  const alVisibilidad = () => { if (!document.hidden) pedir(); };
  document.addEventListener("visibilitychange", alVisibilidad);

  function dibujar(ahora){
    cuadro = 0;
    if (!activo || !visible || document.hidden) return;
    medir();
    const t = (ahora - t0) / 1000;
    if (Math.abs(horaMeta - hora) > 0.001){
      hora += reducir ? horaMeta - hora : (horaMeta - hora) * 0.08;
      aplicarHora(hora);
    }
    const giro = reducir ? 0 : Math.sin(t * 0.12) * 0.16 + px * 0.12;
    const d = direccion.clone().applyAxisAngle(new Vector3(0, 1, 0), giro);
    d.y += reducir ? 0 : -py * 0.05;
    camara.position.copy(d.normalize().multiplyScalar(distancia)).add(objetivo);
    camara.lookAt(objetivo);
    nubes.position.x = reducir ? 0 : (t * 1.5) % 60;
    renderer.render(escena, camara);
    if (!reducir || Math.abs(horaMeta - hora) > 0.001) pedir();
  }
  function pedir(){ if (!cuadro) cuadro = requestAnimationFrame(dibujar); }
  pedir();

  return {
    setHora(h){ horaMeta = Math.max(5, Math.min(22.5, h)); if (reducir){ hora = horaMeta; aplicarHora(hora); } pedir(); },
    get hora(){ return horaMeta; },
    destruir(){
      activo = false; obs.disconnect();
      removeEventListener("pointermove", alMover);
      document.removeEventListener("visibilitychange", alVisibilidad);
      renderer.dispose();
    },
  };
}
