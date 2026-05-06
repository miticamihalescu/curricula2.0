const { findUserById } = require('../db');

// Blochează exportul (DOCX/PDF) pentru utilizatorii free.
// Generarea e permisă, doar descărcarea e rezervată Pro.
async function checkProExport(req, res, next) {
    try {
        const user = await findUserById(req.user?.userId);
        if (!user || user.tier !== 'pro') {
            return res.status(403).json({
                success: false,
                error: 'Exportul materialelor este disponibil doar în planul Pro. Upgrade pentru a descărca.',
                upgrade: true
            });
        }
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = checkProExport;
