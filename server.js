require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const helmet  = require('helmet');

const logger        = require('./logger');
const requestLogger = require('./middleware/requestLogger');
const errorHandler  = require('./middleware/errorHandler');
const { connectDB, isConnected } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    logger.error('FATAL: JWT_SECRET environment variable is not defined. Exiting.');
    process.exit(1);
}

// ─────────────────────────────────────────────────────────
// MIDDLEWARES GLOBALE
// ─────────────────────────────────────────────────────────

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// Logging HTTP pentru toate request-urile
app.use(requestLogger);

// ─────────────────────────────────────────────────────────
// HEALTH CHECK  (public — fără autentificare)
// ─────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
    const uptime     = Math.floor(process.uptime());
    const dbStatus   = isConnected() ? 'connected' : 'disconnected';
    const memUsageMB = Math.round(process.memoryUsage().rss / 1024 / 1024);

    const payload = {
        status:      'ok',
        uptime,
        timestamp:   new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        database:    dbStatus,
        memory: {
            rss: `${memUsageMB} MB`,
        },
        version: process.env.npm_package_version || '1.0.0',
    };

    // Dacă DB e disconnected → răspundem cu 503 dar nu oprim serverul
    const httpStatus = dbStatus === 'connected' ? 200 : 503;
    res.status(httpStatus).json(payload);
});

// ─────────────────────────────────────────────────────────
// RUTE MODULARE
// ─────────────────────────────────────────────────────────

const authRoutes   = require('./routes/auth');
const planRoutes   = require('./routes/plans');
const uploadRoutes = require('./routes/upload');

app.use('/api/auth', authRoutes);
app.use('/api/plans', planRoutes);
app.use('/api', uploadRoutes);

// ─────────────────────────────────────────────────────────
// 404 — catch-all pentru rute HTML necunoscute
// ─────────────────────────────────────────────────────────

app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

// ─────────────────────────────────────────────────────────
// ERROR HANDLER CENTRALIZAT (ultimul middleware)
// ─────────────────────────────────────────────────────────

app.use(errorHandler);

// ─────────────────────────────────────────────────────────
// PORNIRE SERVER
// ─────────────────────────────────────────────────────────

async function startServer() {
    await connectDB();
    const server = app.listen(PORT, () => {
        logger.info(`Curricula backend pornit`, { port: PORT, env: process.env.NODE_ENV || 'development' });
    });
    
    server.on('error', (err) => {
        logger.error('SERVER ERROR ON LISTEN:', { error: err.message, code: err.code });
        process.exit(1);
    });
}


module.exports = app;

if (require.main === module) {
    startServer().catch(err => {
        logger.error('SERVER CRASH:', { error: err.message, stack: err.stack });
        process.exit(1);
    });
}
