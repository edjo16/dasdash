# Observabilidad — Prometheus + Grafana

Stack de observabilidad para la app dasdash (Express, puerto 8081).

## Arquitectura

- La app expone métricas en `GET /metrics` (instrumentación en `observability/metrics.js`, cableada en `Approvals.js`). El endpoint está protegido con bearer token (`METRICS_TOKEN` en `.env`).
- Prometheus (contenedor, puerto **9090**) scrapea `host.docker.internal:8081/metrics` cada 15s usando el token de `prometheus/token.secret` (gitignored; debe coincidir con `METRICS_TOKEN`).
- Grafana (contenedor, puerto **3000**) ya viene provisionado con el datasource Prometheus y el dashboard **dasdash — Aplicación** (carpeta `dasdash`).

## Uso

```bash
# Levantar el stack (desde esta carpeta)
docker compose up -d

# Bajar el stack (los datos persisten en volúmenes)
docker compose down
```

- Grafana: http://localhost:3000 — usuario `admin`, contraseña `dasdash` (cambiarla en producción vía `GF_SECURITY_ADMIN_PASSWORD`).
- Prometheus: http://localhost:9090 (targets en http://localhost:9090/targets).
- La app debe estar corriendo (`npm run dev`) para que el target `dasdash` esté UP.

## Métricas expuestas

| Métrica | Tipo | Qué mide |
|---|---|---|
| `http_request_duration_seconds` | histogram | Latencia por `method`/`route`/`status_code` (ruta = patrón Express) |
| `http_requests_total` | counter | Volumen de requests |
| `http_requests_in_flight` | gauge | Requests en curso |
| `mssql_pool_size/available/borrowed/pending` | gauge | Estado del pool global de MSSQL |
| `app_info` | gauge | Entorno y versión de Node |
| `process_*`, `nodejs_*` | varios | Default de prom-client: CPU, memoria, heap, event loop lag, GC, handles |

## Rotar el token

1. Generar uno nuevo: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
2. Actualizar `METRICS_TOKEN` en `.env` y el contenido de `prometheus/token.secret` (sin salto de línea extra).
3. Reiniciar la app y `docker compose restart prometheus`.

## Producción

- Cambiar la contraseña de Grafana y considerar poner Prometheus/Grafana detrás del firewall interno.
- Si la app corre con pm2 en otro servidor, cambiar el target en `prometheus/prometheus.yml` por `host:puerto` reales y ajustar la etiqueta `env`.
