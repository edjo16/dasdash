# Traducción de documentos en Approvals

Lleva la herramienta `Tools/translator` al detalle de un approval: cada archivo
traducible gana un botón **Translate** (elige idioma) y, cuando ya tiene
traducciones, un botón **Open translation** (un archivo puede tener varias).

El PDF traducido se guarda **en la misma carpeta del archivo original**, así que
viaja con el expediente cuando se copian los directorios.

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
| Datos | `models/translations.js` | Único punto que conoce las tablas. Sin rutas ni HTTP. |
| Dominio | `services/translation-pdf-service.js` | Bytes de entrada → bytes de PDF. Sin BD ni Express: testeable y reutilizable desde CRM/IT. |
| Dominio | `services/translation-fonts.js` | Qué fuente usar por idioma y si el idioma es exportable. |
| Infra | `services/translation-job-runner.js` | Cola en background, concurrencia, reintentos. |
| HTTP | `controllers/approval_translations.js` | Validación, sesión, formato de respuesta. |
| Ruteo | `APPROVALS/routes/approvals-routes.js` | Solo cablea rutas a métodos. |
| UI | `public/js/approval-translations.js` | Modales, polling y avisos. Autocontenido. |

La resolución de la ruta física reutiliza `shared/approval-file-routing.js`, el
mismo módulo que ya usaban las firmas digitales — no se duplicó esa lógica.

---

## Procesamiento asíncrono

Una traducción puede tardar minutos (OCR + varias llamadas al modelo), demasiado
para un request HTTP. Por eso:

1. `POST /approval-translate/create` solo **encola** el job y responde al instante.
2. `translation-job-runner.js` lo procesa fuera del request.
3. El frontend hace polling de `/approval-translate/status` y avisa con un toast.

La cola está **persistida en la tabla**, no en memoria: si el proceso se reinicia
a mitad de una traducción, el job vuelve a `pending` al arrancar y se reintenta.

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
-- Ejecutar una vez
:r sql/approval_translations.sql
```

Crea `approval_translations` (jobs + resultados) y
`approval_translation_audit_log` (quién generó, abrió o eliminó qué).

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
| GET | `/approval-translate/languages` | Idiomas y cuáles son exportables aquí |
| POST | `/approval-translate/create` | Encola una traducción |
| GET | `/approval-translate/list` | Traducciones de un archivo |
| GET | `/approval-translate/status` | Estado de un job (polling) |
| GET | `/approval-translate/file` | Sirve o descarga el PDF (`&dl=1`) |
| POST | `/approval-translate/delete` | Borrado lógico |

Todos pasan por `requireAuth`. `create` verifica además que el archivo pertenezca
realmente a ese approval, y los nombres se validan contra path traversal.

---

## Convención de nombres

```
contrato.pdf  →  contrato_translated_ara_v1.pdf
              →  contrato_translated_ara_v2.pdf   (re-traducción)
              →  contrato_translated_spa_v1.pdf   (otro idioma)
```

La versión es por `(approval, archivo, idioma)`, así que un mismo documento puede
tener varias traducciones conviviendo, que es justo lo que pide la UI.

---

## Notas de diseño

- **El PDF traducido es un documento nuevo con solo el texto**, no un calco del
  layout original. Reconstruir el layout de un escaneo da resultados
  impredecibles; esta opción es la fiable.
- Lleva una nota visible de *machine translation* para que nadie tome decisiones
  legales sobre un texto sin revisar.
- El borrado es lógico: el PDF permanece en disco porque forma parte del
  expediente, pero deja de listarse.
- El conteo de traducciones de la lista de archivos se resuelve con **una sola
  consulta por approval**, no una por archivo.
- Si las tablas aún no están desplegadas, la lista de archivos sigue funcionando
  (el error se registra y se degrada silenciosamente).

## Extender a CRM u otros módulos

`translation-pdf-service.js` y `translation-fonts.js` no dependen de APPROVALS.
Para reutilizarlos basta con aportar la resolución de rutas y una tabla propia,
igual que `pdf-text-writer.js` ya se comparte hoy entre APPROVALS y CRM.
