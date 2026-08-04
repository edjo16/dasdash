import client from 'prom-client';

/**
 * Instrumentación Prometheus de la app.
 * Se cablea en Approvals.js: metricsMiddleware (global), metricsHandler (/metrics)
 * y observeDbPool (al establecer el pool global de mssql).
 */

export const register = new client.Registry();

register.setDefaultLabels({ app: 'dasdash' });

// Métricas default de Node.js: CPU, memoria, heap, event loop lag, GC, handles
client.collectDefaultMetrics({ register });

const appInfo = new client.Gauge({
    name: 'app_info',
    help: 'Metadata de la aplicación',
    labelNames: ['entorno', 'node_version'],
    registers: [register]
});
appInfo.set({ entorno: process.env.ENTORNO || 'unknown', node_version: process.version }, 1);

const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duración de requests HTTP en segundos',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    registers: [register]
});

const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total de requests HTTP',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register]
});

const httpRequestsInFlight = new client.Gauge({
    name: 'http_requests_in_flight',
    help: 'Requests HTTP en curso',
    registers: [register]
});

// Etiqueta de ruta acotada: el patrón de Express (/crm/:id) cuando hubo match de
// router; todo lo demás (estáticos, 404) se agrupa para no disparar la cardinalidad.
function routeLabel(req) {
    if (req.route && typeof req.route.path === 'string') {
        return (req.baseUrl || '') + req.route.path;
    }
    return '(static/other)';
}

export function metricsMiddleware(req, res, next) {
    if (req.path === '/metrics') return next();

    httpRequestsInFlight.inc();
    const endTimer = httpRequestDuration.startTimer();
    let done = false;

    const record = () => {
        if (done) return;
        done = true;
        httpRequestsInFlight.dec();
        const labels = {
            method: req.method,
            route: routeLabel(req),
            status_code: String(res.statusCode)
        };
        endTimer(labels);
        httpRequestsTotal.inc(labels);
    };

    res.on('finish', record);
    res.on('close', record); // conexiones abortadas por el cliente
    next();
}

export async function metricsHandler(req, res) {
    const token = process.env.METRICS_TOKEN;
    if (token) {
        const auth = req.headers.authorization || '';
        if (auth !== `Bearer ${token}`) {
            return res.status(401).send('Unauthorized');
        }
    }
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
}

// Estado del pool global de mssql (getters size/available/borrowed/pending de tarn)
export function observeDbPool(pool) {
    const gauge = (name, help, read) => new client.Gauge({
        name, help,
        registers: [register],
        collect() { this.set(Number(read()) || 0); }
    });

    gauge('mssql_pool_size', 'Conexiones totales del pool MSSQL', () => pool.size);
    gauge('mssql_pool_available', 'Conexiones libres del pool MSSQL', () => pool.available);
    gauge('mssql_pool_borrowed', 'Conexiones en uso del pool MSSQL', () => pool.borrowed);
    gauge('mssql_pool_pending', 'Solicitudes en espera de conexión MSSQL', () => pool.pending);
}
