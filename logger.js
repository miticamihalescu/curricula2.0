'use strict';


const path = require('path');
const fs   = require('fs');
const { createLogger, format, transports } = require('winston');

// ─── Directorul logs/ ────────────────────────────────────────────────────────

const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// ─── Formate ─────────────────────────────────────────────────────────────────

const { combine, timestamp, errors, json, colorize, printf } = format;

const devFormat = combine(
    colorize({ all: true }),
    timestamp({ format: 'HH:mm:ss' }),
    errors({ stack: true }),
    printf(({ level, message, timestamp: ts, stack, service: _s, ...meta }) => {
        let line = `${ts} [${level}] ${message}`;

        const extra = Object.entries(meta)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
            .join('  ');
        if (extra) line += `  ${extra}`;

        if (stack) line += `\n${stack}`;
        return line;
    })
);

const prodFormat = combine(
    timestamp(),
    errors({ stack: true }),
    json()
);

// ─── Logger principal ────────────────────────────────────────────────────────

const isProduction = process.env.NODE_ENV === 'production';

const logger = createLogger({
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    defaultMeta: { service: 'curricula-api' },
    format: isProduction ? prodFormat : devFormat,

    transports: [
        new transports.Console({
            // În teste suprima output-ul (Jest capturează oricum stdout)
            silent: process.env.NODE_ENV === 'test',
        }),

        // Fișier numai pentru erori (JSON, indiferent de mediu)
        new transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            format: combine(timestamp(), errors({ stack: true }), json()),
            maxsize:  5 * 1024 * 1024, // 5 MB
            maxFiles: 5,
            tailable: true,
        }),

        // Fișier combinat (toate nivelurile)
        new transports.File({
            filename: path.join(logsDir, 'combined.log'),
            format: combine(timestamp(), errors({ stack: true }), json()),
            maxsize:  10 * 1024 * 1024, // 10 MB
            maxFiles: 5,
            tailable: true,
        }),
    ],

    exceptionHandlers: [
        new transports.File({
            filename: path.join(logsDir, 'exceptions.log'),
            format: combine(timestamp(), errors({ stack: true }), json()),
        }),
    ],

    rejectionHandlers: [
        new transports.File({
            filename: path.join(logsDir, 'rejections.log'),
            format: combine(timestamp(), errors({ stack: true }), json()),
        }),
    ],
});

module.exports = logger;
