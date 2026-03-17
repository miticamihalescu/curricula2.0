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
    nume: body('nume')
        .exists({ checkFalsy: true }).withMessage('Numele este obligatoriu.')
        .trim()
        .escape()
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

    titluLectie: body('titlu_lectie')
        .exists({ checkFalsy: true }).withMessage('Titlul lecției este obligatoriu.')
        .trim()
        .escape()
        .isLength({ min: 2, max: 300 }).withMessage('Titlul lecției trebuie să aibă între 2 și 300 de caractere.'),

    optionalText: (field, max = 200) =>
        body(field)
            .optional({ nullable: true, checkFalsy: true })
            .trim()
            .escape()
            .isLength({ max }).withMessage(`Câmpul ${field} depășește ${max} de caractere.`),
};

// ─── Seturi de validatori per endpoint ───────────────────────────────────────

const validators = {
    register: [rules.nume, rules.email, rules.parola, handleValidation],

    login: [rules.email, rules.parola, handleValidation],

    forgotPassword: [rules.email, handleValidation],

    resetPassword: [rules.token, rules.nouaParola, handleValidation],

    updateProfile: [rules.nume, handleValidation],

    changePassword: [rules.parolaCurenta, rules.nouaParola, handleValidation],

    generateMaterials: [
        rules.titluLectie,
        rules.optionalText('clasa', 50),
        rules.optionalText('disciplina', 100),
        rules.optionalText('modul', 200),
        rules.optionalText('unitate_invatare', 200),
        rules.optionalText('scoala', 200),
        rules.optionalText('profesor', 100),
        body('dificultate').optional().trim().isIn(['standard', 'advanced', 'remedial'])
            .withMessage('Dificultate invalidă. Valori acceptate: standard, advanced, remedial.'),
        body('stil_predare').optional().trim().isIn(['standard', 'playful', 'visual'])
            .withMessage('Stil de predare invalid. Valori acceptate: standard, playful, visual.'),
        body('target').optional().trim().isIn(['all', 'proiect', 'fisa', 'test'])
            .withMessage('Target invalid. Valori acceptate: all, proiect, fisa, test.'),
        handleValidation,
    ],
};

module.exports = { validators, handleValidation };
