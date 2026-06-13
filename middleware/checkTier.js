const { findUserById } = require('../db');

// Încarcă utilizatorul și atașează tier-ul pe req.user — punctul în care se va
// reactiva limita de generări per tier când platforma e gata de monetizare.
// NU incrementează contorul aici: incrementul se face în rută DOAR după un apel
// AI real, ca să nu consume din limită la cache hit (vezi POST /:planId/genereaza).
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

        req.user.tier = user.tier || 'free';
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = checkTier;
