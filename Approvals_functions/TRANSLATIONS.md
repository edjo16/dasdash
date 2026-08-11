# Traducción de documentos (Approvals y CRM)

Lleva la herramienta `Tools/translator` al detalle de un approval y al detalle de
un caso de CRM: cada archivo traducible gana un botón **Translate** (elige
idioma) y, cuando ya tiene traducciones, un botón **Open translation** (un
archivo puede tener varias).

El PDF traducido se guarda **en la misma carpeta del archivo original**, así que
viaja con el expediente o el caso cuando se copian los directorios.

Los dos módulos comparten el pipeline de PDF, el motor de jobs y la interfaz;
solo cambian la identidad del archivo y la resolución de la ruta:

| | APPROVALS | CRM |
|---|---|---|
| Identidad | `(approval_id, filename)` | `(crm_id, msg_id, filename)` |
| Ruta del original | `shared/approval-file-routing.js` (consulta flow/log/proceso) | `\\{server_1}\CRM\{crm_id}\{msg_id}\` (determinista) |
| Permisos | equipo/devteam de APPROVALS | `validateCrmReadAccess` del caso |
| Tablas | `approval_translations` | `crm_translations` |

---

## Arquitectura

El pipeline reutiliza los servicios que ya existían en `Tools/` en lugar de
duplicar la lógica de OCR y de traducción:

```
archivo original (UNC)
   └─> Tools/services/extraction-service.js     texto embebido o OCR
        └─> Tools/services/translation-service.js   traducción vía IA
             └─> translation-pdf-service.js         compone el PDF nuevo
                  └─> se escribe junto al original
```

### Separación de responsabilidades

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Dominio | `services/translation-pdf-service.js` | Bytes de entrada → bytes de PDF. Sin BD ni Express: compartido por ambos módulos. |
| Dominio | `services/translation-fonts.js` | Qué fuente usar por idioma y si el idioma es exportable. |
| Infra | `services/translation-job-engine.js` | Motor genérico: un solo bucle y un solo límite de concurrencia para todas las colas. |
| UI | `public/js/document-translations-core.js` | Modales, polling y avisos. Agnóstico del módulo. |
| UI | `public/css/document-translations.css` | Estilos (clases `atr-*`), compartidos. |

Y por módulo:

| Capa | APPROVALS | CRM |
|---|---|---|
| Datos | `Approvals_functions/models/translations.js` | `CRM/model/crm_translations.js` |
| Cola | `services/translation-job-runner.js` | `CRM/services/crm-translation-source.js` |
| HTTP | `controllers/approval_translations.js` | `CRM/controllers/crm_translations.js` |
| Ruteo | `APPROVALS/routes/approvals-routes.js` | `CRM/routes/crm-routes.js` |
| UI | `public/js/approval-translations.js` | `public/js/crm-translations.js` |

Los archivos "por módulo" son adaptadores finos: describen cómo se identifica un
documento y dónde vive, y delegan todo lo demás en las capas compartidas.

En APPROVALS la resolución de la ruta física reutiliza
`shared/approval-file-routing.js`, el mismo módulo que ya usaban las firmas
digitales. En CRM se reutiliza `buildCrmUncPath()` de `CRM/controllers/CRM.js`,
el mismo que usan `/crm-file` y el visor de PDF.

---

## Procesamiento asíncrono

Una traducción puede tardar minutos (OCR + varias llamadas al modelo), demasiado
para un request HTTP. Por eso:

1. `POST /…-translate/create` solo **encola** el job y responde al instante.
2. El motor de jobs lo procesa fuera del request.
3. El frontend hace polling de `/…-translate/status` y avisa con un toast.

La cola está **persistida en la tabla**, no en memoria: si el proceso se reinicia
a mitad de una traducción, el job vuelve a `pending` al arrancar y se reintenta.

Hay **un único runner para toda la aplicación**. Cada módulo registra su cola con
`registerTranslationSource()` (import por efecto secundario desde `Approvals.js`)
y el motor las recorre por turnos, de modo que una cola larga en un módulo no
deja al otro sin atender y `TRANSLATION_MAX_CONCURRENT` sigue siendo un límite
global frente al servicio de IA.

### Variables de entorno

| Variable | Default | Uso |
|---|---|---|
| `TRANSLATION_MAX_CONCURRENT` | `1` | Traducciones en paralelo. Subirlo satura más el servicio de IA. |
| `TRANSLATION_IDLE_POLL_MS` | `15000` | Cada cuánto revisa la cola si nadie la despierta. |
| `TRANSLATION_STALE_MINUTES` | `30` | Tras cuántos minutos un job colgado se re-encola. |
| `TRANSLATION_CHUNK_CHARS` | `3500` | Tamaño de los bloques enviados al modelo. |
| `TRANSLATION_FONT_DIR` | `public/font` | Dónde buscar las fuentes Unicode. |

Reutiliza `AI_ENDPOINT` y `AI_MODEL`, ya configuradas para el módulo `AI/`.

---

## Instalación

### 1. Base de datos

```sql
-- Ejecutar una vez cada uno
:r sql/approval_translations.sql
:r sql/crm_translations.sql
```

Crea `approval_translations` / `crm_translations` (jobs + resultados) y sus
tablas de auditoría (quién generó, abrió o eliminó qué). Son tablas separadas
por el mismo criterio que ya separa `crm_document_versions` de las de APPROVALS.

### 2. Dependencias

```bash
npm install
```

Agrega `@pdf-lib/fontkit`, necesario para incrustar fuentes Unicode.

### 3. Fuentes por idioma ⚠️

`pdf-lib` solo trae fuentes WinAnsi, que cubren **inglés, español, francés,
alemán, italiano y portugués**. Para los demás idiomas hay que copiar la fuente
correspondiente a `public/font/` (o a `TRANSLATION_FONT_DIR`):

| Idioma | Archivo esperado |
|---|---|
| Ruso, Vietnamita | `NotoSans-Regular.ttf` |
| Árabe | `NotoNaskhArabic-Regular.ttf` |
| Hebreo | `NotoSansHebrew-Regular.ttf` |
| Hindi | `NotoSansDevanagari-Regular.ttf` |
| Tailandés | `NotoSansThai-Regular.ttf` |
| Japonés | `NotoSansJP-Regular.otf` |
| Coreano | `NotoSansKR-Regular.otf` |
| Chino simplificado | `NotoSansSC-Regular.otf` |
| Chino tradicional | `NotoSansTC-Regular.otf` |

El sistema **no se conforma con encontrar el archivo**: verifica con fontkit que
la fuente tenga glifos reales para ese alfabeto. Una fuente latina no se acepta
para árabe, precisamente para no generar PDFs llenos de cuadros vacíos.

Los idiomas sin fuente aparecen marcados como *(PDF font not installed)* en el
selector, así el usuario lo ve **antes** de encolar, no cuando el job falla.

---

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/approval-translate/languages`<br>`/crm-translate/languages` | Idiomas y cuáles son exportables aquí |
| POST | `/approval-translate/create`<br>`/crm-translate/create` | Encola una traducción |
| GET | `/approval-translate/list`<br>`/crm-translate/list` | Traducciones de un archivo |
| GET | `/approval-translate/status`<br>`/crm-translate/status` | Estado de un job (polling) |
| GET | `/approval-translate/file`<br>`/crm-translate/file` | Sirve o descarga el PDF (`&dl=1`) |
| POST | `/approval-translate/delete`<br>`/crm-translate/delete` | Borrado lógico |
| GET | `/crm-translate/counts` | **Solo CRM**: contadores de todo el caso |

Los de APPROVALS reciben `RowID`; los de CRM, `crm_id` (+ `msg_id` donde se
identifica un archivo). Todos pasan por `requireAuth`. `create` verifica además
que el archivo pertenezca realmente a ese approval / mensaje, y los nombres se
validan contra path traversal.

`/crm-translate/counts` existe porque en CRM la lista de adjuntos se arma en el
cliente a partir del string `files` de cada mensaje: no hay dónde colgar la
metadata por archivo, así que los contadores se piden una sola vez por caso y se
cruzan en el navegador. En APPROVALS, en cambio, viajan dentro del JSON de la
lista de archivos.

---

## Convención de nombres

```
contrato.pdf  →  contrato_translated_ara_v1.pdf
              →  contrato_translated_ara_v2.pdf   (re-traducción)
              →  contrato_translated_spa_v1.pdf   (otro idioma)
```

La versión es por `(approval, archivo, idioma)` — en CRM, por
`(caso, mensaje, archivo, idioma)` — así que un mismo documento puede tener
varias traducciones conviviendo, que es justo lo que pide la UI.

---

## Notas de diseño

- **El PDF traducido es un documento nuevo con solo el texto**, no un calco del
  layout original. Reconstruir el layout de un escaneo da resultados
  impredecibles; esta opción es la fiable.
- Lleva una nota visible de *machine translation* para que nadie tome decisiones
  legales sobre un texto sin revisar.
- El borrado es lógico: el PDF permanece en disco porque forma parte del
  expediente, pero deja de listarse.
- El conteo de traducciones se resuelve con **una sola consulta por approval o
  por caso**, no una por archivo.
- Si las tablas aún no están desplegadas, la lista de archivos sigue funcionando
  (el error se registra y se degrada silenciosamente).
- En CRM el PDF traducido **no** se inserta en `crm_archivos`: la lista de
  adjuntos del mensaje sigue mostrando solo lo que subió el usuario, y la
  traducción se alcanza desde el botón *Open translation*.

## Extender a otros módulos

Para añadir un tercer módulo (IT, SIR…) no hace falta tocar el motor ni la UI:

1. Una tabla propia + un modelo con la misma interfaz que
   `CRM/model/crm_translations.js` (`claimNextPendingJob`, `markCompleted`,
   `markFailed`, `insertAuditLog`, `requeueStaleJobs`).
2. Un archivo que llame a `registerTranslationSource({ key, model,
   resolveSourcePath, auditScope, pdfContext })` e impórtalo desde `Approvals.js`
   antes de `startTranslationJobRunner`.
3. Un controlador con los mismos 6 endpoints y un adaptador de UI de ~50 líneas
   sobre `window.DocumentTranslations.create()`.
