# BADACO — rendimiento de la carga de datos

Notas de la revisión de rendimiento del módulo (lista de contactos, formularios
y exportación a Excel). Explica **qué estaba costando tiempo, qué se cambió y
qué falta por hacer**, para que el próximo que toque esto no repita el análisis.

---

## Cómo aplicarlo

1. **Base de datos (obligatorio, es la mitad de la mejora):**

   ```sql
   -- sobre la base de datos de la app (DB_NAME, normalmente `approvals`)
   :r sql/badaco_performance.sql
   ```

   El script es idempotente y sólo crea lo que falta. Conviene ejecutarlo en una
   ventana de baja actividad: crear un índice bloquea la tabla mientras se
   construye.

2. **Aplicación:** no requiere nada especial, sólo desplegar. Variables
   opcionales:

   | Variable | Default | Uso |
   |---|---|---|
   | `BADACO_CACHE_TTL_MS` | `300000` (5 min) | Vida de la caché de catálogos. |
   | `BADACO_EXCEL_BATCH_SIZE` | `2000` | Filas por lote en la exportación. |

---

## Diagnóstico

Ordenado por impacto, midiendo sobre la pantalla `/badaco-contacts`.

### 1. N+1 al listar contactos (el más caro)

`getAllContacts` traía las filas y **después lanzaba una consulta por cada
contacto** para leer sus colaboradores asignados:

- lista normal (15 filas) → **16 idas al servidor** por cada página, cada
  filtro, cada tecleo en el buscador;
- exportación a Excel (`limit 100000`) → **100.001 consultas**.

Además la consulta ya traía un `LEFT JOIN` con `STRING_AGG` sobre toda la tabla
de asignados cuyo resultado **no se seleccionaba**: se calculaba y se tiraba.

### 2. Sin índices

Ninguna de las tablas tenía índices. Cada consulta era un recorrido completo de
`badaco_contactos` más un hash join contra cada catálogo, y el conteo repetía el
mismo trabajo. El coste crece de forma lineal con la tabla: hoy tarda, mañana
tarda el doble.

### 3. Dos consultas por request para lo mismo

`/badaco/api/contacts` pedía las filas y luego el total con **dos consultas que
filtraban exactamente igual**, es decir, el trabajo de filtrado se hacía dos
veces por cada carga de la tabla.

### 4. Render de la página: 12 consultas en fila india

`getContactsList` encadenaba ~12 consultas con `await` una detrás de otra
(incluida `obtenerDatosUsuario` **repetida literalmente dos veces**), cuando casi
todas son independientes entre sí. El tiempo de la página era la suma de todas.

### 5. Catálogos releídos en cada petición

Empresas, job levels, relaciones, países y regiones se consultaban en cada
render de lista, de formulario y de modal, y también desde la herramienta de
tarjetas. Son datos que cambian unas pocas veces al día.

### 6. Excel: todo en memoria y con búsquedas lineales

Se pedían hasta 100.000 contactos de golpe, se armaba el libro entero en RAM
antes de enviar el primer byte, y por cada fila se hacía un `find()` sobre la
lista de usuarios y otro sobre la de países (búsqueda lineal dentro del bucle).

---

## Qué se cambió

### SQL — `sql/badaco_performance.sql`

Índices sobre lo que se filtra, se ordena y se une:

- `PK_badaco_contactos` **clustered** por `contact_id` (la lista ordena y pagina
  por ahí), y PK en los catálogos para que cada JOIN sea un seek.
- `IX_badaco_contactos_bmc_id` con `INCLUDE` de las columnas que pinta la tabla:
  el filtro por empresa se resuelve sin volver a la tabla base.
- `IX_badaco_contactos_email` (control de duplicados y validación por lotes de
  la herramienta de tarjetas).
- `IX_badaco_contactos_name` — la búsqueda `LIKE '%...%'` no puede posicionarse
  con un índice, pero sí recorrer uno estrecho en vez de la tabla entera.
- Índices para el resto de filtros (`bmjl_id`, `country`, `contact_rl_id`,
  `event`) y para `badaco_activere_contactos (contact_id)`, que es lo que hace
  barata la columna "Contact Active Re".
- `UPDATE STATISTICS` al final: sin estadísticas frescas el optimizador puede
  seguir eligiendo un scan aunque el índice exista.

El script termina con las tres cosas que **conviene hacer después**: índice
único de email (cuando los datos estén limpios), full-text para la búsqueda
(cuando la tabla crezca de verdad) y claves foráneas.

### Modelo — `BadacoModel`

- **Paginación por clave en dos pasos, en una sola consulta.** Una CTE filtra,
  ordena y pagina tocando sólo `badaco_contactos` (y `badaco_mcompany`/`m_pais`
  *sólo si el filtro los necesita*) y devuelve nada más que los `contact_id` de
  la página; la consulta externa une los catálogos y agrega los colaboradores
  **para esas 15 filas**. Lo único que crece con la tabla es el primer paso, que
  es justo lo que cubren los índices nuevos.
- **El total viaja en la misma consulta** (`COUNT(*) OVER ()`): se elimina la
  segunda consulta de conteo. `getContactsCount` queda como respaldo para el
  caso de una página vacía.
- **Se acabó el N+1**: los asignados salen de un `OUTER APPLY` con `STRING_AGG`
  y se parten en JS.
- `findContactsByEmails` ya no envuelve la columna en `LOWER()`: aplicar una
  función al campo impide usar el índice. La comparación sigue siendo
  insensible a mayúsculas por la intercalación del servidor.
- `forEachContactBatch` recorre el resultado por lotes para la exportación.
- `getCompanyOptions` devuelve la versión mínima del catálogo de empresas.
- `getContactsForPicker` acepta `search`/`limit` (sin argumentos se comporta
  como siempre).

### Controlador — `BadacoController`

- Las consultas independientes van en `Promise.all` (cada `sql.Request` toma su
  propia conexión del pool), y se eliminó la llamada duplicada al perfil.
- `limit` de la API viene acotado a 200 filas: es un parámetro de querystring.
- **Excel en streaming y por lotes**: se leen `BADACO_EXCEL_BATCH_SIZE` filas y
  se escriben directo en la respuesta; ni la app ni la base sostienen el
  resultado completo. Se quitó la transacción (eran lecturas manteniendo
  bloqueos), los `find()` del bucle pasaron a `Map`, y la región sale de la
  propia consulta en vez de buscarse en `m_pais` por cada fila.

### Caché — `mercadeo/services/badaco-cache.js` (nuevo)

Caché en memoria de los catálogos, con TTL de 5 minutos, **invalidación
explícita** al crear/editar empresas, job levels, relaciones y contactos, y una
sola consulta en vuelo por catálogo (diez peticiones simultáneas con la caché
fría hacen una consulta, no diez).

La herramienta de tarjetas (`Tools/controllers/cards.js`) usa esta misma caché
en vez de la suya, así una empresa creada desde las tarjetas aparece al
instante en la lista de BADACO y al revés.

---

## Qué falta (por orden de valor)

1. **El combo de empresas se sirve entero al navegador.** La página serializa
   todas las empresas en el HTML y el desplegable las pinta todas al abrirse.
   Con unos pocos miles ya se nota en el navegador, y no lo arregla ningún
   índice. Lo correcto es un endpoint de búsqueda (`?q=` → `TOP 50`) y que el
   combo consulte al escribir. `getCompanyOptions` ya deja el lado servidor
   listo para eso.
2. **Full-text para la búsqueda** cuando la tabla crezca (ver nota (b) del
   script SQL).
3. **Índice único de email** (nota (a)): hoy dos altas simultáneas con el mismo
   correo pueden colarse, porque la comprobación es de la aplicación.
4. `getContactsForPicker` sin argumentos sigue trayendo todos los contactos en
   las pantallas de Meetings y Events: conviene pasarlas a la variante con
   `search`/`limit`.

## Defectos encontrados de paso (no tocados)

- `mercadeo/routes/badaco-routes.js` enruta `BadacoController.deleteContact`
  (DELETE `/badaco-contacts/delete/:id`) y `BadacoController.createRelationship`
  (POST `/badaco/relationships/create`), pero **ninguno de los dos métodos
  existe** en el controlador: esas rutas revientan con un `TypeError` que Express
  no captura y dejan la petición colgada.
