const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { findUserByEmail, updateUser, getAllFeedback, getEventStats } = require('../db');
const logger = require('../logger');

const ADMIN_SECRET = process.env.ADMIN_SECRET;

// Verifică cheia secretă din header-ul X-Admin-Secret
function checkAdminSecret(req, res, next) {
    if (!ADMIN_SECRET) {
        return res.status(500).json({ success: false, error: 'ADMIN_SECRET nu e configurat pe server.' });
    }
    if (req.headers['x-admin-secret'] !== ADMIN_SECRET) {
        logger.warn({ message: 'Tentativă acces admin cu cheie greșită', ip: req.ip });
        return res.status(403).json({ success: false, error: 'Acces interzis.' });
    }
    next();
}

// POST /api/admin/reset-parola
// Body: { email, parolaNoua }
// Header: X-Admin-Secret: <valoarea din .env>
router.post('/reset-parola', checkAdminSecret, async (req, res) => {
    try {
        const { email, parolaNoua } = req.body;

        if (!email || !parolaNoua) {
            return res.status(400).json({ success: false, error: 'email și parolaNoua sunt obligatorii.' });
        }
        if (parolaNoua.length < 6) {
            return res.status(400).json({ success: false, error: 'Parola trebuie să aibă cel puțin 6 caractere.' });
        }

        const user = await findUserByEmail(email);
        if (!user) {
            return res.status(404).json({ success: false, error: `Nu există niciun cont cu emailul: ${email}` });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(parolaNoua, salt);
        await updateUser(email, { parola: hashedPassword, resetToken: null, resetExpires: null });

        logger.info({ message: `Admin: parolă resetată pentru ${email}` });
        res.json({ success: true, message: `Parola a fost schimbată pentru ${email}. Comunică parola nouă profesorului.` });

    } catch (err) {
        logger.error({ message: 'Eroare la reset-parola admin', error: err.message });
        res.status(500).json({ success: false, error: 'Eroare la resetarea parolei.' });
    }
});

// GET /api/admin/utilizatori
// Listează toți utilizatorii (email, nume, data creării, nr generări)
router.get('/utilizatori', checkAdminSecret, async (req, res) => {
    try {
        const { getDb } = require('../db'); // eslint-disable-line
        const db = getDb();
        const users = await db.collection('users')
            .find({}, { projection: { parola: 0, resetToken: 0, emailVerifyToken: 0 } })
            .sort({ dataCrearii: -1 })
            .toArray();

        res.json({ success: true, total: users.length, utilizatori: users });
    } catch (err) {
        logger.error({ message: 'Eroare la listarea utilizatorilor', error: err.message });
        res.status(500).json({ success: false, error: 'Eroare la obținerea utilizatorilor.' });
    }
});

// POST /api/admin/set-tier
// Setează manual tier-ul unui utilizator (folosit până la integrarea plății)
// Body: { email, tier }  — tier: 'free' | 'pro'
// Header: X-Admin-Secret: <valoarea din .env>
router.post('/set-tier', checkAdminSecret, async (req, res) => {
    try {
        const { email, tier } = req.body;

        if (!email || !tier) {
            return res.status(400).json({ success: false, error: 'email și tier sunt obligatorii.' });
        }
        if (!['free', 'pro'].includes(tier)) {
            return res.status(400).json({ success: false, error: 'tier trebuie să fie "free" sau "pro".' });
        }

        const user = await findUserByEmail(email);
        if (!user) {
            return res.status(404).json({ success: false, error: `Nu există niciun cont cu emailul: ${email}` });
        }

        await updateUser(email, { tier });

        logger.info({ message: `Admin: tier setat la "${tier}" pentru ${email}` });
        res.json({ success: true, message: `Contul ${email} a fost setat la tier "${tier}".` });

    } catch (err) {
        logger.error({ message: 'Eroare la set-tier admin', error: err.message });
        res.status(500).json({ success: false, error: 'Eroare la setarea tier-ului.' });
    }
});

// GET /api/admin/feedback
// Tot feedback-ul profesorilor pe materialele generate, cel mai recent primul.
// Query: ?limit=200 (opțional)
// Header: X-Admin-Secret: <valoarea din .env>
router.get('/feedback', checkAdminSecret, async (req, res) => {
    try {
        const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit) || 200));
        const feedback = await getAllFeedback({ limit });

        // Sumar rapid: câte pozitive/negative per tip de material
        const sumar = {};
        for (const f of feedback) {
            sumar[f.tip] = sumar[f.tip] || { pozitiv: 0, negativ: 0 };
            sumar[f.tip][f.rating] = (sumar[f.tip][f.rating] || 0) + 1;
        }

        res.json({ success: true, total: feedback.length, sumar, feedback });
    } catch (err) {
        logger.error({ message: 'Eroare la listarea feedback-ului', error: err.message });
        res.status(500).json({ success: false, error: 'Eroare la obținerea feedback-ului.' });
    }
});

// GET /api/admin/statistici
// Evenimente de utilizare agregate: upload-uri, generări per tip, export-uri, erori.
// Query: ?zile=30 (opțional — fereastra de timp)
// Header: X-Admin-Secret: <valoarea din .env>
router.get('/statistici', checkAdminSecret, async (req, res) => {
    try {
        const zile = Math.min(365, Math.max(1, parseInt(req.query.zile) || 30));
        const statistici = await getEventStats({ zile });

        res.json({ success: true, zile, statistici });
    } catch (err) {
        logger.error({ message: 'Eroare la statistici admin', error: err.message });
        res.status(500).json({ success: false, error: 'Eroare la obținerea statisticilor.' });
    }
});

module.exports = router;
