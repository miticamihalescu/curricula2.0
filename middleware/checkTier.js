const { findUserById, incrementGenerari } = require('../db');

// Limita de generări dezactivată temporar — se va reactiva când platforma e gata de monetizare
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
        await incrementGenerari(userId);
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = checkTier;
