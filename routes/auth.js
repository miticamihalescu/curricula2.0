const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { Resend } = require('resend');

const { findUserByEmail, findUserById, createUser, updateUser } = require('../db');
const authMiddleware = require('../auth');
const { validators } = require('../middleware/validate');
const logger = require('../logger');

const JWT_SECRET = process.env.JWT_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Curricula <noreply@curricula.ro>';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const log = (level, route, msg, err) => {
    const meta = { route };
    if (err) meta.error = err.message || String(err);
    logger[level]({ message: msg, ...meta });
};

const authLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10,
    message: { success: false, error: 'Prea multe încercări. Te rugăm să aștepți un minut și să reîncerci.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === 'test'
});

router.post('/register', authLimiter, validators.register, async (req, res) => {
    try {
        const { nume, email, parola } = req.body;

        const existingUser = await findUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({ success: false, error: 'Un cont cu această adresă de email există deja.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(parola, salt);

        const newUser = await createUser({ nume, email, parola: hashedPassword });

        res.status(201).json({
            success: true,
            message: 'Cont creat cu succes! Te poți autentifica acum.',
            user: { id: newUser.id, nume: newUser.nume, email: newUser.email, dataCrearii: newUser.dataCrearii }
        });
    } catch (err) {
        log('error', 'POST /api/register', 'Eroare la crearea contului', err);
        res.status(500).json({ success: false, error: 'A apărut o eroare la crearea contului.' });
    }
});

router.post('/login', authLimiter, validators.login, async (req, res) => {
    try {
        const { email, parola } = req.body;

        const user = await findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ success: false, error: 'Credențiale invalide. Verifică email-ul și parola.' });
        }

        const isMatch = await bcrypt.compare(parola, user.parola);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Credențiale invalide. Verifică email-ul și parola.' });
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Autentificare reușită!',
            token,
            user: { id: user.id, nume: user.nume, email: user.email }
        });
    } catch (err) {
        log('error', 'POST /api/login', 'Eroare la autentificare', err);
        res.status(500).json({ success: false, error: 'A apărut o eroare la autentificare.' });
    }
});

router.post('/forgot-password', authLimiter, validators.forgotPassword, async (req, res) => {
    try {
        const { email } = req.body;

        const user = await findUserByEmail(email);
        if (!user) {
            // Răspuns generic pentru a nu dezvălui dacă emailul există
            return res.json({
                success: true,
                message: 'Dacă adresa de e-mail există în sistem, vei primi un mesaj cu instrucțiunile de resetare în câteva minute.'
            });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = Date.now() + 3600000; // 1 oră

        await updateUser(email, { resetToken, resetExpires });

        const resetUrl = `${APP_URL}/reset-password.html?token=${resetToken}`;

        if (resend) {
            try {
                await resend.emails.send({
                    from: EMAIL_FROM,
                    to: email,
                    subject: 'Resetare parolă — Curricula',
                    html: `
                        <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #f9fafb; border-radius: 16px;">
                            <div style="text-align: center; margin-bottom: 32px;">
                                <h1 style="font-size: 24px; color: #111827; margin: 0;">Curricula 2.0</h1>
                            </div>
                            <div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb;">
                                <h2 style="font-size: 20px; color: #111827; margin-top: 0;">Bună, ${user.nume || 'Profesor'}!</h2>
                                <p style="color: #6b7280; line-height: 1.6;">Am primit o cerere de resetare a parolei pentru contul tău Curricula. Apasă butonul de mai jos pentru a seta o parolă nouă:</p>
                                <div style="text-align: center; margin: 32px 0;">
                                    <a href="${resetUrl}" style="background: #2563eb; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">Resetează parola</a>
                                </div>
                                <p style="color: #9ca3af; font-size: 14px; line-height: 1.5;">Link-ul este valabil <strong>1 oră</strong>. Dacă nu ai cerut resetarea parolei, poți ignora acest mesaj — contul tău este în siguranță.</p>
                                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
                                <p style="color: #9ca3af; font-size: 12px;">Sau copiază acest link în browser:<br><span style="color: #2563eb; word-break: break-all;">${resetUrl}</span></p>
                            </div>
                            <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 24px;">© ${new Date().getFullYear()} Curricula. Cu drag pentru profesorii din România.</p>
                        </div>
                    `
                });
                log('info', 'POST /api/forgot-password', `Email de resetare trimis către ${email}`);
            } catch (emailErr) {
                log('error', 'POST /api/forgot-password', 'Eroare la trimiterea emailului', emailErr);
                return res.status(500).json({ success: false, error: 'Nu am putut trimite emailul. Încearcă din nou sau contactează suportul.' });
            }
        } else {
            // Mod dezvoltare: fără Resend configurat
            log('warn', 'POST /api/forgot-password', `RESEND_API_KEY lipsă. Link resetare pentru ${email}: ${resetUrl}`);
        }

        res.json({
            success: true,
            message: 'Dacă adresa de e-mail există în sistem, vei primi un mesaj cu instrucțiunile de resetare în câteva minute.'
        });
    } catch (err) {
        log('error', 'POST /api/forgot-password', 'Eroare la procesarea cererii', err);
        res.status(500).json({ success: false, error: 'Eroare la procesarea cererii. Încearcă din nou.' });
    }
});

router.post('/reset-password', authLimiter, validators.resetPassword, async (req, res) => {
    try {
        const { token, nouaParola } = req.body;
        const { findUserByResetToken } = require('../db');
        const user = await findUserByResetToken(token);

        if (!user) {
            return res.status(400).json({ success: false, error: 'Token-ul este invalid sau a expirat.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(nouaParola, salt);

        await updateUser(user.email, { parola: hashedPassword, resetToken: null, resetExpires: null });

        res.json({ success: true, message: 'Parola a fost actualizată cu succes! Te poți autentifica acum.' });
    } catch (err) {
        log('error', 'POST /api/reset-password', 'Eroare la resetarea parolei', err);
        res.status(500).json({ success: false, error: 'Eroare la resetarea parolei.' });
    }
});

router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await findUserById(req.user.userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'Utilizatorul nu a fost găsit.' });
        }
        res.json({
            success: true,
            user: { id: user.id, nume: user.nume, email: user.email, dataCrearii: user.dataCrearii }
        });
    } catch (err) {
        log('error', 'GET /api/me', 'Eroare la obținerea datelor utilizatorului', err);
        res.status(500).json({ success: false, error: 'Eroare la obținerea datelor utilizatorului.' });
    }
});

router.put('/profile', authMiddleware, validators.updateProfile, async (req, res) => {
    try {
        const { nume } = req.body;

        const user = await findUserById(req.user.userId);
        if (!user) return res.status(404).json({ success: false, error: 'Utilizatorul nu a fost găsit.' });

        await updateUser(user.email, { nume });
        res.json({ success: true, message: 'Profilul a fost actualizat cu succes.' });
    } catch (err) {
        log('error', 'PUT /api/profile', 'Eroare la actualizarea profilului', err);
        res.status(500).json({ success: false, error: 'A apărut o eroare la actualizarea profilului.' });
    }
});

router.put('/change-password', authMiddleware, validators.changePassword, async (req, res) => {
    try {
        const { parolaCurenta, parolaNoua } = req.body;

        const user = await findUserById(req.user.userId);
        if (!user) return res.status(404).json({ success: false, error: 'Utilizatorul nu a fost găsit.' });

        const isMatch = await bcrypt.compare(parolaCurenta, user.parola);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Parola curentă este incorectă.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(parolaNoua, salt);

        await updateUser(user.email, { parola: hashedPassword });
        res.json({ success: true, message: 'Parola a fost schimbată cu succes.' });
    } catch (err) {
        log('error', 'PUT /api/change-password', 'Eroare la schimbarea parolei', err);
        res.status(500).json({ success: false, error: 'A apărut o eroare la schimbarea parolei.' });
    }
});

module.exports = router;
