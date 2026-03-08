const jwt = require('jsonwebtoken');

/**
 * Middleware Express pentru verificarea token-ului JWT.
 *
 * Se așteaptă ca request-ul să conțină header-ul:
 *   Authorization: Bearer <token>
 *
 * Dacă token-ul este valid, atașează datele decodate la req.user
 * și apelează next(). Altfel, returnează 401.
 */
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Acces neautorizat. Token-ul lipsește.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { userId, email, iat, exp }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token invalid sau expirat.' });
    }
}

module.exports = authMiddleware;
