const { findUserById, incrementGenerari } = require('../db');

const LIMITA_FREE = 10; // generări/lună pentru utilizatorii free

// Verifică dacă utilizatorul a depășit limita lunară de generări.
// Utilizatorii pro sunt scutiți de limită.
// La trecere OK, incrementează contorul și continuă.
async function checkTier(req, res, next) {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Token invalid.' });
        }

        const user = await findUserById(userId);
        if (!user) {
            return res.status(401).json({ success: false, error: 'Utilizatorul nu a fost găsit.' });
        }

        // Pro: fără limită
        if (user.tier === 'pro') {
            // Atașăm tier-ul pe req pentru rate limiter
            req.user.tier = 'pro';
            await incrementGenerari(userId);
            return next();
        }

        // Free: verifică dacă s-a resetat luna
        const acum = new Date();
        const ultimaGenerare = user.dataUltimaGenerare ? new Date(user.dataUltimaGenerare) : null;
        const eLunaNoua = !ultimaGenerare ||
            ultimaGenerare.getFullYear() !== acum.getFullYear() ||
            ultimaGenerare.getMonth() !== acum.getMonth();

        const generariCurente = eLunaNoua ? 0 : (user.generariLuna || 0);

        if (generariCurente >= LIMITA_FREE) {
            return res.status(403).json({
                success: false,
                error: 'Ai atins limita gratuită. Upgrade la Pro pentru generări nelimitate.',
                limita: LIMITA_FREE,
                generariUtilizate: generariCurente
            });
        }

        req.user.tier = 'free';
        await incrementGenerari(userId);
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = checkTier;
