'use strict';


const logger = require('../logger');

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
    const status = err.status || err.statusCode || 500;
    const isInternal = status >= 500;

    logger.error(`Unhandled error: ${err.message}`, {
        method:   req.method,
        path:     req.originalUrl,
        status,
        userId:   req.user?.userId,
        ip:       req.ip || req.headers['x-forwarded-for'],
        stack:    err.stack,
        code:     err.code,
        details:  err.details,
    });

    if (res.headersSent) return next(err);

    res.status(status).json({
        success: false,
        error: isInternal && process.env.NODE_ENV === 'production'
            ? 'A apărut o eroare internă pe server. Te rugăm să încerci din nou.'
            : err.message || 'Eroare internă server.',
    });
};
