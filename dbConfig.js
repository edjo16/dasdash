import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

export const sqlConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PWD,
    database: process.env.DB_NAME,
    server: process.env.DB_SERVER,
    pool: {
        max: 50,
        min: 2,
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 15000
    },
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectionTimeout: 15000,
        requestTimeout: 30000
    }
}
export const MSSQLStoreConfig =({
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

// dbConfig.js
import session from 'express-session';

export const session_config = (store) => {
  const isProd = process.env.NODE_ENV === 'production';

  return {
    // ✅ En prod, __Host-sid (requiere Secure y Path=/). En dev, nombre estándar.
    name: isProd ? '__Host-sid' : 'connect.sid',
    secret: process.env.SESSION_SECRET,        
    store: store,
    resave: false,
    saveUninitialized: false,
    rolling: true,                               // refresh cookie & store TTL on every response
    proxy: isProd,                               // Solo relevante en prod tras proxy
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,                            // dev: false (HTTP), prod: true (HTTPS)
      path: '/',
      maxAge: 12 * 60 * 60 * 1000
    }
  };
};