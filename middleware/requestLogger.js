'use strict';


const logger = require('../logger');

module.exports = function requestLogger(req, res, next) {
    const startAt = process.hrtime.bigint();

    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startAt) / 1_000_000;
        const { statusCode } = res;
        const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'http';

        logger.log(level, `${req.method} ${req.originalUrl} ${statusCode}`, {
            method:     req.method,
            path:       req.originalUrl,
            status:     statusCode,
            duration:   parseFloat(durationMs.toFixed(2)),
            ip:         req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
            userAgent:  req.headers['user-agent'] || '—',
            userId:     req.user?.userId,
        });
    });

    next();
};
