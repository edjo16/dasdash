# Tools

Módulo de herramientas internas. Sigue la convención del resto del proyecto
(`routes/ controllers/ services/ utils/`) y se monta en `Approvals.js` con
`app.use('/', toolsRoutes)`.

## Herramienta: Multi-Language Translator (Imágenes y PDFs)

Extrae texto de imágenes o PDFs (OCR / texto embebido), lo traduce al idioma
elegido y permite descargar el resultado.

### Flujo

1. El usuario sube una imagen (PNG/JPG/JPEG/WEBP) o un PDF (drag & drop o selector).
2. `POST /api/tools/extract` extrae el texto:
   - **Imagen** → preprocesado (`sharp`) + OCR (`tesseract.js`).
   - **PDF** → estrategia **híbrida**: primero texto embebido con `pdf-parse`;
     si el PDF está escaneado (poco/nada de texto), se rasteriza con
     `pdf-to-img` y se pasa por OCR.
3. `POST /api/tools/translate` traduce el texto usando el mismo proveedor de IA
   del proyecto (`AI_ENDPOINT` / `AI_MODEL`, endpoint tipo Ollama `/api/generate`).
4. El usuario visualiza, edita y descarga (PDF vía impresión, Word `.doc`,
   CSV, TXT). La exportación es 100% en cliente (sin dependencias nuevas).

### Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET  | `/tools/translator`   | Página de la herramienta (Pug). |
| POST | `/api/tools/extract`  | Multipart: `file`, `source_lang`, `preprocess`, `dpi`. Devuelve `{ text, detectedLang, method, pageCount, chars }`. |
| POST | `/api/tools/translate`| JSON: `{ text, target_lang }`. Devuelve `{ translation }`. |

Todas las rutas están protegidas con `requireAuth`.

### Estructura

```
Tools/
  routes/tools-routes.js        Rutas Express
  controllers/translator.js     Orquestación (render + endpoints)
  services/
    extraction-service.js       PDF (híbrido) + imagen -> texto
    ocr-service.js              tesseract.js (workers cacheados, PSM por idioma)
    image-preprocess.js         sharp (grises/contraste/sharpen/umbral)
    translation-service.js      Prompt + llamada a AI_ENDPOINT
  utils/
    languages.js                Diccionario de idiomas (ISO Tesseract)
    text-clean.js               Normalización Unicode / detección RTL
views/tools/translator.pug      UI
public/css/tools-translator.css Estilos (usa las CSS vars de tema del proyecto)
public/js/tools/translator.js   Frontend (subida, estados, export, historial)
```

### Mapeo de librerías (Python → Node)

| Python | Node |
|---|---|
| `pytesseract` (Tesseract) | `tesseract.js` (WASM, sin binario nativo) |
| `PyMuPDF (fitz)` | `pdf-parse` (texto) + `pdf-to-img` (rasterizado) |
| `opencv-python` + `PIL` | `sharp` |
| `requests` → Ollama | `fetch` a `AI_ENDPOINT` (reutiliza infra de `AI/`) |
| `reportlab` / `python-docx` / `pandas` | Export en cliente (print / blob `.doc` / CSV) |
| `streamlit` | Vista Pug + vanilla JS |

### Variables de entorno (opcionales)

| Variable | Default | Uso |
|---|---|---|
| `TOOLS_MAX_FILE_BYTES` | `26214400` (25 MB) | Tamaño máximo de archivo subido. |
| `TOOLS_TESS_CACHE_PATH` | `Tools/.tess-cache` | Caché en disco de los `.traineddata`. |
| `TOOLS_TESS_LANG_PATH` | *(CDN)* | Ruta local de `.traineddata` para entornos **sin internet**. |

Reutiliza además `AI_ENDPOINT` y `AI_MODEL` (ya requeridas por el módulo `AI/`).

## Herramienta: Presentation Cards (Tarjetas de Presentación)

Extrae los datos de contacto de fotos de tarjetas de presentación con un
**modelo de visión** (gemma3, llama3.2-vision, qwen2.5-vl…), los empareja con
los catálogos de **BADACO** y permite crear el contacto o descargar la tabla
como Excel/CSV.

**No usa OCR.** El modelo lee la imagen directamente; `ocr-service.js` es
exclusivo de la herramienta de traducción.

### Campos y su equivalencia en BADACO

Los campos extraídos están alineados con `badaco_contactos`, así que la tarjeta
se convierte en contacto sin transformaciones intermedias:

| Campo extraído | Columna en `badaco_contactos` |
|---|---|
| `name` | `name` |
| `job_title` | `job_title` |
| `company` | `bmc_id` *(resuelto contra `badaco_mcompany`)* |
| *(derivado de `job_title`)* | `bmjl_id` *(resuelto contra `badaco_mjoblevel`)* |
| `email` | `email` |
| `phone_number` / `mobile` | `phone_number` |
| `country` | `country` = `cpais` *(resuelto contra `m_pais`)* |
| `address` | `address` |
| `website` | *(solo se usa para emparejar la empresa por dominio)* |

### Emparejado con los catálogos (`services/badaco-match.js`)

La tarjeta trae texto libre pero la base guarda ids, así que la tabla **muestra
la etiqueta y guarda el id**. Estrategias por campo:

- **Empresa** (`bmc_id`): dominio del email/website → nombre exacto (ignorando
  `S.A.`, `Inc`, `Ltda`, `Group`…) → similitud difusa (Dice + Jaccard).
  Los dominios públicos (gmail, hotmail…) nunca emparejan por dominio.
- **País** (`cpais`): nombre → alias en español/ISO (`Estados Unidos`, `USA`,
  `PA`) → última línea de la dirección → país nombrado dentro de la dirección →
  prefijo telefónico internacional (`+507` → Panamá) → similitud difusa.
- **Job level** (`bmjl_id`): el nombre del nivel dentro del cargo → reglas por
  jerarquía (CEO/Founder → C-Level, VP, Director, Manager/Coordinador,
  Ingeniero/Analista → Staff, Asistente…) emparejadas contra los niveles que
  existan realmente en la base.

Cada resultado devuelve `id`, `label`, `score`, `reason`, `confidence`
(`high`/`medium`/`low`/`none`) y hasta 5 alternativas. Sólo se auto-selecciona
con `score >= 0.80`; por debajo se proponen candidatos y decide el usuario.

### Flujo

1. El usuario sube una o varias imágenes de tarjetas (PNG/JPG/JPEG/WEBP).
2. Si una tarjeta es de doble cara, marca la segunda imagen como
   "Back of previous card": los datos de ambas caras se combinan
   (`mergeCardData`, prioriza el frente).
3. `POST /api/tools/cards/extract` procesa **una tarjeta por petición**
   (frente + dorso opcional): la imagen se normaliza con `sharp` (rotación
   EXIF, máx. 1600px, JPEG) y se envía en base64 al modelo, que responde un
   objeto JSON (`format: 'json'`). `parseCardData` acepta JSON y, como
   respaldo, líneas `Campo: valor` y heurísticas. Después se adjunta el
   emparejado con BADACO.
4. En la tabla de revisión, las celdas Company / Job Level / Country muestran
   el texto leído en la tarjeta (editable) y el registro de BADACO enlazado,
   con un chip de confianza y las alternativas sugeridas. Editar el texto
   dispara `POST /api/tools/cards/rematch`.
5. Si la empresa no existe, un botón abre el modal de empresa de BADACO
   pre-llenado; al guardarla, la fila queda enlazada al `bmc_id` nuevo.
6. El botón de cada fila abre el modal de contacto con los ids ya resueltos, o
   se descarga todo en Excel/CSV (incluye `bmc_id`, `bmjl_id` y `country_code`).

### Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET  | `/tools/cards` | Página de la herramienta (Pug). |
| POST | `/api/tools/cards/extract` | Multipart: `front` (imagen), `back` (opcional). Devuelve `{ data, match, raw }`. |
| POST | `/api/tools/cards/rematch` | JSON: `{ data, refresh? }`. Re-resuelve las llaves de BADACO sin volver a llamar a la IA. |

Todas las rutas están protegidas con `requireAuth`. El emparejado sólo se
adjunta a usuarios con acceso al módulo BADACO (`Business Developer`,
`Marketing` o `All`), igual que el ítem del sidebar.

### Estructura (solo lo nuevo)

```
Tools/
  controllers/cards.js          Orquestación (render + endpoints + caché de catálogos)
  services/card-service.js      Visión IA + parseCardData + mergeCardData
  services/badaco-match.js      Emparejado difuso texto -> bmc_id / bmjl_id / cpais
views/tools/cards.pug           UI
public/css/tools-cards.css      Estilos (complementa tools-translator.css)
public/tools/cards.js           Frontend (subida múltiple, pares frente/dorso,
                                tabla de revisión con celdas enlazadas, export)
```

### Variables de entorno (opcionales)

| Variable | Default | Uso |
|---|---|---|
| `TOOLS_VISION_ENDPOINT` | `AI_ENDPOINT` | Endpoint del modelo de visión (soporta Ollama `/api/generate` y `/api/chat`). |
| `TOOLS_VISION_MODEL` | `AI_MODEL` | Modelo con soporte de imágenes (p. ej. `gemma3:12b`). |
| `TOOLS_VISION_JSON` | `1` | `0` desactiva el `format: 'json'` del proveedor (modelos que no lo soportan). |
| `TOOLS_VISION_TIMEOUT_MS` | `180000` (3 min) | Timeout por imagen. |
| `TOOLS_CATALOG_TTL_MS` | `300000` (5 min) | Vida de la caché de catálogos usada por el emparejado. |

> Nota: si `AI_MODEL` no es multimodal, configurar `TOOLS_VISION_MODEL`
> apuntando a un modelo de visión disponible en el mismo servidor Ollama.

## Notas de OCR (solo aplican al Translator)

- Los `.traineddata` se descargan del CDN de tesseract.js la primera vez que se
  usa un idioma y se cachean en disco (`Tools/.tess-cache`, en `.gitignore`).
  Para servidores sin salida a internet, colocar los archivos localmente y
  apuntar `TOOLS_TESS_LANG_PATH` a esa carpeta.
- Los workers de Tesseract se mantienen cacheados en memoria por idioma para
  evitar recargas costosas.
