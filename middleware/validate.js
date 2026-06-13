const { validationResult, body } = require('express-validator');

/**
 * Rulează validatorii și returnează 400 cu primul mesaj de eroare dacă ceva e invalid.
 */
function handleValidation(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const first = errors.array()[0];
        return res.status(400).json({ success: false, error: first.msg });
    }
    next();
}

// ─── Reguli de validare reutilizabile ────────────────────────────────────────

const rules = {
    // Notă: NU folosim .escape() — stocăm valoarea brută (single source of truth)
    // și escapăm la randarea HTML (template-uri email, frontend). Escaparea la
    // stocare ar fi mutilat numele cu &, ', " în exporturile DOCX/PDF.
    nume: body('nume')
        .exists({ checkFalsy: true }).withMessage('Numele este obligatoriu.')
        .trim()
        .isLength({ min: 2, max: 100 }).withMessage('Numele trebuie să aibă între 2 și 100 de caractere.'),

    email: body('email')
        .exists({ checkFalsy: true }).withMessage('Email-ul este obligatoriu.')
        .trim()
        .normalizeEmail()
        .isEmail().withMessage('Adresa de email nu este validă.')
        .isLength({ max: 254 }).withMessage('Email-ul este prea lung.'),

    parola: body('parola')
        .exists({ checkFalsy: true }).withMessage('Parola este obligatorie.')
        .isLength({ min: 6, max: 128 }).withMessage('Parola trebuie să aibă între 6 și 128 de caractere.'),

    nouaParola: body('nouaParola')
        .exists({ checkFalsy: true }).withMessage('Noua parolă este obligatorie.')
        .isLength({ min: 6, max: 128 }).withMessage('Noua parolă trebuie să aibă între 6 și 128 de caractere.'),

    parolaCurenta: body('parolaCurenta')
        .exists({ checkFalsy: true }).withMessage('Parola curentă este obligatorie.'),

    token: body('token')
        .exists({ checkFalsy: true }).withMessage('Token-ul este obligatoriu.')
        .trim()
        .isHexadecimal().withMessage('Token invalid.')
        .isLength({ min: 64, max: 64 }).withMessage('Token invalid.'),
};

// ─── Seturi de validatori per endpoint ───────────────────────────────────────

const validators = {
    register: [rules.nume, rules.email, rules.parola, handleValidation],

    login: [rules.email, rules.parola, handleValidation],

    forgotPassword: [rules.email, handleValidation],

    resetPassword: [rules.token, rules.nouaParola, handleValidation],

    updateProfile: [rules.nume, handleValidation],

    changePassword: [rules.parolaCurenta, rules.nouaParola, handleValidation],
};

module.exports = { validators, handleValidation };
