import express, { json, urlencoded } from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url"; // Importar fileURLToPath
import fileUpload from 'express-fileupload';
import cors from 'cors';
import morgan from 'morgan';
import _ from 'lodash';
import { NumeroALetras } from './functions.js'; // Importar la función
import bodyParser from 'body-parser';
import session from 'express-session';
// Importar las rutas
import approvalsRoutes from './APPROVALS/routes/approvals-routes.js';
import apiRoutes from './SIR/routes/sir-routes.js';
import formsRoutesMercadeo from './mercadeo/forms_routes_mercadeo.js';
import mercadeoRoutes from './mercadeo/mercadeo_routes.js';
import crmRoutes from './CRM/routes/crm-routes.js';
import {swaggerDocs} from './public/v1/swagger.js';
import hrRoutes from './HR/routes/hr-routes.js';
import itRoutes from './IT/routes/it-routes.js';
import formsRoutes from './FORMS/routes/form-routes.js';
import authRoutes from './AUTH/routes/auth-routes.js';
import usersRoutes from './USERS/routes/users-routes.js';
import badacoRoutes from './mercadeo/routes/badaco-routes.js';
import aiRoutes from './AI/routes/ai-routes.js';
import toolsRoutes from './Tools/routes/tools-routes.js'
import { createRequire } from 'module';
import fs from 'fs';
import { session_config, sqlConfig } from "./dbConfig.js";
import { metricsMiddleware, metricsHandler, observeDbPool } from './observability/metrics.js';

/*** App Variables*/
const app = express();
const port = process.env.PORT || "8081";

const __filename = fileURLToPath(import.meta.url); 
const __dirname = dirname(__filename);

/*** App Configuration*/
app.set("views", join(__dirname, "views"));
app.set("view engine", "pug");

const require = createRequire(import.meta.url);
const MSSQLStore = require('connect-mssql-v2');

import sql from 'mssql';

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not defined');
}

app.set('trust proxy', 1);

/*** Observabilidad (Prometheus) — antes de session para que el scrape no toque el store */
app.use(metricsMiddleware);
app.get('/metrics', metricsHandler);

const bodyParserLimit = process.env.BODY_PARSER_LIMIT || '10mb';

const sqlStore = new MSSQLStore({
  user: process.env.DB_USER,
  password: process.env.DB_PWD,
  database: process.env.DB_NAME,
  server: process.env.DB_SERVER,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
}, {
  table: 'user_sessions',
  ttl: 1000 * 60 * 60 * 12,      // 12 horas
  autoRemove: true,
  autoRemoveInterval: 10 * 60 * 1000, // cada 10 min
  useUTC: true,
  retries: 3,
  retryDelay: 1000
});

app.use(session(session_config(sqlStore)));
// Usar express.static directamente
app.use(express.static(join(__dirname, "public")));
app.use('/pic', express.static(`//srv-dc-lombard.lombard.local/Approvals/pic`));
app.use('/countries', express.static(join(__dirname, "media/countries")));
app.use('/Approvals', express.static(`//srv-dc-lombard.lombard.local/Approvals/`));
app.use('/Approvals', express.static(`//${process.env.file_server}/Approvals/`));
app.use('/Approvals', express.static(`//vps-file01/Approvals/`));
app.use('/crm-files', express.static(`//${process.env.file_server}/CRM/crm-files`));
app.use('/Approvals', express.static(`//srv-db-lombard/DB/DOCUMENTOS/`));
app.use('/Approvals', express.static(`//srv-dc-lombard.lombard.local/Corporate  Governance & Human Resources/`));
app.use('/Approvals', express.static(`//srv-dc-lombard.lombard.local/Contabilidad/Approvals/Aprobado/`));
app.use('/Approvals', express.static(`//srv-dc-lombard.lombard.local/Finance/Approvals/Aprobado/`));
app.use('/videos', express.static(join(__dirname, "media/videos")));
app.use('/js', express.static(join(__dirname, "public/js")));
app.use(json({ limit: bodyParserLimit })); // for parsing application/json
app.use(urlencoded({ extended: true, limit: bodyParserLimit })); // for parsing application/x-www-form-urlencoded
app.use(fileUpload({ createParentPath: true }));
app.use(cors());
app.use(morgan('dev'));


    
/*** Funciones*/
app.post('/funciones', (req, res) => {
    const funcion = req.body.funcion;
    if (funcion === "numeros_a_letras") {
        const numero = req.body.data.numero;
        const letras = NumeroALetras(numero);
        res.status(200).send({ letras: letras });
    }
});

// Routes Definitions
app.use(bodyParser.json({ limit: bodyParserLimit }));
app.use('/', apiRoutes);    

// Login
app.use('/', authRoutes);
// Forms
app.use('/', formsRoutes);
// Rutas Approvals
app.use('/', approvalsRoutes);    
//Rutas IT
app.use('/', itRoutes);

//Rutas HR
app.use('/', hrRoutes);

//Rutas Users
app.use('/', usersRoutes);
//Rutas Users
app.use('/', toolsRoutes);
// Rutas Mercadeo
formsRoutesMercadeo(app);
mercadeoRoutes(app);

// Rutas CRM
crmRoutes(app);

// Rutas BADACO
app.use('/', badacoRoutes);
app.use('/', aiRoutes);
// Initialize global DB connection pool then start server
sql.connect(sqlConfig).then((pool) => {
    console.log('DB connection pool established');
    observeDbPool(pool);
    app.listen(port, () => {
        console.log(`Listening to requests on http://localhost:${port}`);
        swaggerDocs(app, port);
    });
}).catch(err => {
    console.error('Failed to connect to SQL Server:', err);
    process.exit(1);
});
