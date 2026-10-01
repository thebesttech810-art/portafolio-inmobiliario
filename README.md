# Llave · Portafolio inmobiliario con precalificación

Sitio web para vender un portafolio de proyectos de vivienda en Ecuador (USD 60.000 a 150.000)
que, además de mostrar los proyectos, **precalifica al cliente**. La persona responde 11 preguntas
y ve al instante:

- cuánto le presta el banco,
- con qué crédito le conviene comprar (Credicasa BIESS, Miti-Miti VIS/VIP, BIESS, banca privada o cooperativa),
- cuánto necesita de entrada,
- qué proyectos le alcanzan.

Al vendedor le llega el cliente con nombre, WhatsApp, presupuesto, crédito sugerido, proyecto
elegido, prioridad A/B/C y un código `CASA-XXXXXX` para cerrar la venta rápido.

> Está basado en el catálogo de Electronic Games: es un sitio estático con escenas de three.js
> que se cargan solo cuando se van a ver, datos en JSON, páginas por producto para Google, PWA y
> botones de WhatsApp con código de seguimiento.

**Todo lo de `sitio/datos/` es de ejemplo (modo demostración):** proyectos, testimonios, marca,
WhatsApp y correo. Cámbialos antes de mostrarlo a clientes.

---

## Qué tiene

| Parte | Qué hace |
| --- | --- |
| **Portada 3D** | Maqueta de una urbanización sobre su base de tierra, como las de una sala de ventas, frente a la cordillera y un volcán nevado. Al bajar cae la tarde y se encienden ventanas y faroles; el reloj permite ver la maqueta a cualquier hora (en Ecuador el sol sale ~6:10 y se pone ~18:20 todo el año). |
| **Catálogo** | Tarjetas con render 3D de cada proyecto (o foto real si la pones), precio desde, **cuota mensual desde** y crédito. Filtros por ciudad, tipo, precio, **cuota mensual**, dormitorios, etapa y crédito. Además: favoritos, comparador de hasta 3 proyectos y "solo los que me alcanzan". |
| **Ficha de proyecto** (`#proyecto-<id>`) | Renders (fachada, patio, aérea y noche), **maqueta 3D** que se gira y se abre por pisos, **plano referencial** con cotas por modelo, tabla de modelos con cuota, calculadora (crédito, entrada y plazo), plan de pagos (reserva, entrada en cuotas, gastos y crédito), amenidades, cercanía, mapa y botón para agendar la visita por WhatsApp. |
| **Mapa 3D del Ecuador** | El país en relieve con los volcanes en su lugar real y un pin por ciudad. Al tocar una ciudad se filtra el catálogo. |
| **Precalificador** (`#precalificar`) | 11 preguntas, una por pantalla, con el presupuesto armándose en vivo. Luego pide contacto con consentimiento LOPDP y muestra el resultado: semáforo, presupuesto con rango, regla de precios, créditos posibles con lo que limita a cada uno, proyectos que alcanzan y que casi alcanzan (con lo que falta), sugerencias, documentos según su tipo de ingreso, código y envío por WhatsApp, y agenda de visita. |
| **Financiamiento** | Tarjetas de cada crédito (tasa, entrada, plazo, para quién y fuente), bono VIS, comparador "arriendo o compra" y preguntas frecuentes. |
| **Servidor de clientes** (opcional) | Un Worker de Cloudflare recibe el formulario y recalcula la precalificación en el servidor. Guarda al cliente en Supabase y avisa al vendedor por correo y/o WhatsApp. |

## Estructura

```
├── sitio/                         ← lo que se publica (GitHub Pages)
│   ├── index.html
│   ├── css/estilos.css
│   ├── datos/
│   │   ├── sitio.json                  marca, WhatsApp, correo, horarios, testimonios, opciones
│   │   ├── proyectos.json              proyectos, modelos, precios, unidades, estilo de la maqueta
│   │   └── parametros-financieros.json tasas, topes, entradas, plazos, relación cuota/ingreso, documentos
│   ├── js/
│   │   ├── finanzas.js        motor de precalificación (funciones puras, con pruebas)
│   │   ├── app.js             portada, catálogo, filtros, mapa, financiamiento, pie
│   │   ├── precalificador.js  preguntas, contacto, resultado y envío
│   │   ├── ficha.js           ficha de cada proyecto
│   │   ├── plano.js           plano referencial en SVG
│   │   ├── casa3d.js          maquetas paramétricas (casa, adosadas, torre), cielo y hora
│   │   ├── escena-hero.js, mapa3d.js, visor3d.js, miniaturas.js
│   │   └── ui.js, ecuador.js
│   ├── vendor/three.js        three.js recortado (generado)
│   ├── proyectos/*.html       páginas por proyecto para Google (generadas)
│   ├── sitemap.xml, robots.txt, manifest.webmanifest, sw.js, offline.html, favicon.svg
├── cloudflare/leads-worker.js     recibe los clientes (Worker) + wrangler.toml.ejemplo
├── supabase/leads.sql             tabla de clientes con RLS y embudo de ventas
├── herramientas/                  generar páginas, recortar three.js, armar el Artifact
└── pruebas/                       pruebas del motor financiero y del Worker
```

## Ver el sitio en tu computadora

```bash
cd portafolio-inmobiliario
npm run servir          # abre http://localhost:8080
npm test                # 18 pruebas: cuotas, topes, elegibilidad, semáforo, puntaje, Worker
```

No hace falta instalar dependencias para usar el sitio.

## Editar sin programar

**Tu marca y contacto** van en `sitio/datos/sitio.json`:

| Campo | Para qué |
| --- | --- |
| `marca`, `eslogan` | Nombre de la marca y frase que la acompaña |
| `whatsapp`, `whatsappVisible`, `correo` | WhatsApp y correo de ventas (el número va sin `+`, por ejemplo `593991234567`) |
| `salaDeVentas`, `horario`, `horasVisita` | Dónde y cuándo atiendes |
| `testimonios` | Testimonios de tus clientes |
| `modoDemo: false` | Quita el aviso de demostración |
| `pedirContactoAntesDelResultado` | En `true` (lo recomendado), el resultado se ve después de dejar el WhatsApp. En `false` aparece "Ver sin dejar datos". |
| `leadsEndpoint` | URL del Worker. Vacío = solo WhatsApp. |
| `turnstileSiteKey` | Opcional: antispam de Cloudflare |
| `dominio` | URL pública del sitio (para el sitemap y las páginas de Google) |

**Proyectos:** se editan en `sitio/datos/proyectos.json`.

- Cada proyecto lleva:
  - `id`: sin espacios ni tildes; es la dirección `#proyecto-<id>`.
  - `ciudad`, `sector` y `coordenadas` (`[latitud, longitud]`).
  - `tipo`: `casa` o `departamento`.
  - `etapa`: `planos`, `construccion` o `inmediata`.
  - `entrega` (`AAAA-MM`), `avance` (0–100), `reserva` y `entradaCuotasMeses`.
  - `alicuota`, `amenidades` y `cercania`.
  - `modelos`: nombre, m², dormitorios, baños, parqueaderos, patio, precio y **unidades disponibles**.
- `estilo` define la maqueta 3D, sin modelar nada:
  - `forma`: `casa`, `adosadas` o `torre`.
  - `pisos` y `techo` (`plano`, `dosAguas` o `inclinado`).
  - Colores: `pared`, `acento` y `techoColor`.
  - `paisaje`: `sierra`, `valle`, `austro` o `costa`.
  - `piscina` y `hora` del render.
- Si tienes fotos reales, súbelas a `sitio/fotos/` y ponlas en `"fotos": ["fotos/mi-proyecto-1.webp", ...]`: reemplazan a los renders.
- Después corre `npm run paginas` para regenerar las páginas de Google y el sitemap.

**Tasas y topes:** se editan en `sitio/datos/parametros-financieros.json`. El sitio no tiene
ningún número del mercado escrito en el código.

- Cada crédito tiene `tasa`, `plazoMax` y `financiamiento` (por tramos de precio).
- También lleva `montoMax`, `precioMin`/`precioMax`, `relacionCuotaIngreso`, `gastosCierre`, `ingresoFamiliarMax` y requisitos (`iess`, `sinVivienda`, `viviendaNueva`).
- `vigencia` es la fecha que se muestra en el sitio. Si pasan más de `revisarCadaDias`, la franja dice "por revisar".
- Los valores vienen de prensa ecuatoriana y páginas de bancos a octubre de 2026 (fuentes en el mismo archivo). **Verifícalos con el BCE, el BIESS, el MIDUVI y cada banco antes de usarlos con clientes.**

## Cómo calcula

En `sitio/js/finanzas.js`, sistema francés (cuota fija, tasa nominal anual / 12). Para cada
crédito al que la persona puede acceder:

- **Elegibilidad:** IESS (36 aportaciones o jubilado), no tener vivienda, tope de ingreso familiar y plazo según la edad (el crédito termina antes de los 75 años).
- **Cuota máxima:** ingreso considerado × relación cuota/ingreso − deudas.
  - Para independientes y negocios se considera el 80 % del ingreso.
  - La cuota incluye seguros (0,035 % mensual del préstamo).
- **Precio máximo** = el menor de:
  - (préstamo máximo + dinero para la entrada) / (1 + gastos),
  - dinero para la entrada / (% de entrada + gastos),
  - el tope del crédito.
- **Dinero para la entrada** = ahorro + cuotas que puede pagar durante 12 meses de obra.
- **Presupuesto:** el crédito que más alcanza. **Recomendado:** el más barato que sirve para el portafolio.
- **Semáforo por proyecto:**
  - **verde**: alcanza;
  - **amarillo**: falta 15 % o menos de entrada e ingreso;
  - **rojo**: falta más.
- **Puntaje (0–100)** para priorizar la llamada:

  | Factor | Puntos |
  | --- | --- |
  | Capacidad frente al precio | 30 |
  | Entrada | 20 |
  | Tipo de ingreso / IESS | 15 |
  | Historial declarado | 10 |
  | Urgencia | 15 |
  | Contacto | 10 |

  **A** desde 75, **B** de 50 a 74, **C** por debajo de 50.

Las cuotas de referencia están probadas:

| Préstamo | Tasa | Plazo | Cuota |
| --- | --- | --- | --- |
| 95.000 | 4,99 % | 25 años | 554,81 |
| 112.000 | 7,5 % | 20 años | 902,26 |
| 65.000 | 2,99 % | 30 años | 273,69 |

## Publicación

El sitio vive en **https://thebesttech810-art.github.io/portafolio-inmobiliario/**. Cada cambio que
llega a `main` corre las pruebas, regenera las páginas de Google y publica la carpeta `sitio/` en la
rama `gh-pages` (acción **Probar y publicar**). Si algún día se apaga, revisa en
Settings → Pages que la fuente sea **Deploy from a branch → gh-pages / (root)**.

## Recibir los clientes en un panel (Supabase + Cloudflare)

Sin configurar nada, cada cliente llega **por WhatsApp**: el botón del resultado abre un mensaje
con su código, presupuesto, crédito, cuota, ingreso, entrada y cuándo quiere comprar. Para tener
además la lista en una base de datos y avisos automáticos:

1. **Supabase:** en el SQL Editor pega y ejecuta `supabase/leads.sql`.
   - Si es el mismo proyecto del agente de WhatsApp, los miembros de tu organización verán los clientes.
   - La vista `leads_por_llamar` muestra los A y B sin contactar y cuántos minutos llevan esperando.
2. **Worker:** copia `cloudflare/wrangler.toml.ejemplo` como `cloudflare/wrangler.toml`, ajusta `ORIGENES` y carga los secretos:
   ```bash
   cd cloudflare
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler deploy
   ```
3. **Sitio:** pon la URL del Worker en `sitio.json → leadsEndpoint`.
4. **Avisos (opcional):**
   - **Correo:** `RESEND_API_KEY` + `AVISO_CORREO`.
   - **WhatsApp al vendedor:**
     1. Crea en Meta la plantilla `nuevo_cliente` (categoría Utility) con el texto: *"Nuevo cliente {{1}} ({{2}}). Presupuesto {{3}}, proyecto {{4}}, prioridad {{5}}. Código {{6}}."*
     2. Configura `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_AVISO_A` y `WHATSAPP_PLANTILLA`.
5. **Antispam (opcional):** crea un widget de Turnstile y pon la clave pública en `sitio.json → turnstileSiteKey` y la secreta en `TURNSTILE_SECRET`.

El Worker usa el mismo `finanzas.js` y los mismos JSON que el sitio. Si cambias tasas o proyectos,
vuelve a publicarlo (`npx wrangler deploy`).

## Medir las campañas

- El sitio guarda los `utm_*` y el referrer junto con cada cliente.
- La función `evento()` de `js/ui.js` manda eventos a Umami, Meta Pixel (`Lead`, `Schedule`, `Contact`) o Google si sus scripts están cargados en `index.html`. Nunca manda datos personales.
- Eventos: `precal_abrir`, `precal_paso`, `precalificacion_completa`, `enviar_whatsapp`, `agendar_visita`, `ver_proyecto`, `maqueta3d`, `favorito`, `comparar` y `ciudad`.

## Privacidad (LOPDP)

- **Consentimiento:** el formulario pide dos permisos separados y sin marcar. El de usar los datos para la precalificación y el contacto es obligatorio; el de promociones es opcional.
- **Política:** la política de privacidad está en el pie de la página. Indica responsable, finalidad, base legal, destinatarios, conservación (24 meses) y derechos.
- **Datos mínimos:** el sitio no pide cédula ni consulta el buró.
- **Navegador:** la persona puede borrar los datos guardados en su navegador desde el resultado.

## Herramientas

| Comando | Qué hace |
| --- | --- |
| `npm test` | Pruebas del motor y del Worker |
| `npm run paginas` | Regenera `sitio/proyectos/*.html`, `sitemap.xml` y el JSON-LD de la portada |
| `npm run vendor` | Vuelve a recortar three.js si usas una pieza nueva en `js/` |
| `npm run artefacto` | Arma una copia para publicar como página privada en claude.ai |

## Próximos pasos sugeridos

- Plantilla **inmobiliaria** en el agente de WhatsApp (`agente-whatsapp/`) para que reconozca el código `CASA-XXXXXX` como hoy reconoce `EG-XXXXXX`. Así contestaría con la precalificación del cliente y agendaría la visita con los horarios libres de Google Calendar.
- Pantalla de clientes en el panel del agente leyendo `leads_inmobiliaria` (embudo y tiempo de primera respuesta).
- Fotos reales, recorridos 360° (Matterport o Kuula) y videos por proyecto.
- Edición de proyectos desde una hoja de Google con un GitHub Action que regenere `proyectos.json`, como hoy se hace con Contífico en el catálogo.
