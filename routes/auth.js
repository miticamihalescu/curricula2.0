const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { Resend } = require('resend');

const { findUserByEmail, findUserById, createUser, updateUser, findUserByVerifyToken, deleteUserData } = require('../db');
const authMiddleware = require('../auth');
const { validators } = require('../middleware/validate');
const logger = require('../logger');

const JWT_SECRET = process.env.JWT_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const EMAIL_FROM = process.env.EMAIL_FROM || 'curriculAI <noreply@curricula.ro>';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// Numărul maxim de încercări greșite ale unui cod OTP înainte de blocare (per cont)
const MAX_OTP_ATTEMPTS = 5;

const log = (level, route, msg, err) => {
    const meta = { route };
    if (err) meta.error = err.message || String(err);
    logger[level]({ message: msg, ...meta });
};

// Escapă valori dinamice (ex: numele utilizatorului) înainte de a le insera în
// HTML-ul emailurilor. Numele se stochează brut, deci escaparea se face aici.
const escapeHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

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
        if (existingUser && existingUser.emailVerificat) {
            return res.status(409).json({ success: false, error: 'Un cont cu această adresă de email există deja.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(parola, salt);

        // Generăm OTP de 6 cifre pentru verificarea emailului
        const emailOTP = Math.floor(100000 + Math.random() * 900000).toString();
        const emailOTPExpires = Date.now() + 15 * 60 * 1000; // 15 minute

        // Dacă userul există dar nu e verificat, îl actualizăm; altfel îl creăm
        let newUser;
        if (existingUser) {
            await updateUser(email, { parola: hashedPassword, emailOTP, emailOTPExpires, emailOTPAttempts: 0 });
            newUser = existingUser;
        } else {
            newUser = await createUser({ nume, email, parola: hashedPassword, emailVerifyToken: null });
            await updateUser(email, { emailOTP, emailOTPExpires, emailOTPAttempts: 0 });
        }

        // Trimitem codul OTP pe email
        if (resend) {
            try {
                await resend.emails.send({
                    from: EMAIL_FROM,
                    to: email,
                    subject: 'Codul tău de verificare — curriculAI',
                    html: `
                        <div style="font-family:'DM Sans',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f9fafb;border-radius:16px;">
                            <div style="text-align:center;margin-bottom:28px;">
                                <h1 style="font-size:22px;color:#111827;margin:0;">curriculAI</h1>
                            </div>
                            <div style="background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
                                <h2 style="font-size:18px;color:#111827;margin-top:0;">Bună, ${escapeHtml(newUser.nume || nume)}!</h2>
                                <p style="color:#6b7280;line-height:1.6;margin-bottom:24px;">Folosește codul de mai jos pentru a confirma adresa de email și a activa contul tău curriculAI:</p>
                                <div style="text-align:center;margin:28px 0;">
                                    <div style="display:inline-block;background:#f0fdf4;border:2px solid #00C896;border-radius:12px;padding:20px 40px;">
                                        <span style="font-size:38px;font-weight:700;letter-spacing:10px;color:#111827;font-family:monospace;">${emailOTP}</span>
                                    </div>
                                </div>
                                <p style="color:#9ca3af;font-size:13px;text-align:center;">Codul este valabil <strong>15 minute</strong>.<br>Dacă nu ai creat un cont curriculAI, ignoră acest mesaj.</p>
                            </div>
                            <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:20px;">© ${new Date().getFullYear()} curriculAI</p>
                        </div>
                    `
                });
                log('info', 'POST /api/register', `Cod OTP verificare email trimis către ${email}`);
            } catch (emailErr) {
                log('error', 'POST /api/register', 'Eroare la trimiterea emailului OTP', emailErr);
                return res.status(500).json({ success: false, error: 'Nu am putut trimite emailul de verificare. Încearcă din nou.' });
            }
        } else {
            log('warn', 'POST /api/register', `RESEND_API_KEY lipsă — email de verificare nu a fost trimis pentru ${email}.`);
        }

        res.status(201).json({
            success: true,
            requiresOTP: true,
            email,
            message: 'Cont creat! Verifică emailul și introdu codul de 6 cifre.'
        });
    } catch (err) {
        log('error', 'POST /api/register', 'Eroare la crearea contului', err);
        res.status(500).json({ success: false, error: 'A apărut o eroare la crearea contului.' });
    }
});

// Verifică OTP-ul trimis pe email la înregistrare
router.post('/verifica-email-otp', authLimiter, async (req, res) => {
    try {
        const { email, cod } = req.body;
        if (!email || !cod) {
            return res.status(400).json({ success: false, error: 'Email și cod sunt obligatorii.' });
        }

        const user = await findUserByEmail(email);
        if (!user || !user.emailOTP) {
            return res.status(400).json({ success: false, error: 'Cod incorect. Verifică emailul și încearcă din nou.' });
        }

        // Blocăm brute-force-ul pe cont (rate-limit-ul e doar per IP)
        if ((user.emailOTPAttempts || 0) >= MAX_OTP_ATTEMPTS) {
            return res.status(429).json({ success: false, error: 'Prea multe încercări greșite. Solicită un cod nou.' });
        }

        if (user.emailOTP !== String(cod).trim()) {
            await updateUser(email, { emailOTPAttempts: (user.emailOTPAttempts || 0) + 1 });
            return res.status(400).json({ success: false, error: 'Cod incorect. Verifică emailul și încearcă din nou.' });
        }

        if (Date.now() > user.emailOTPExpires) {
            return res.status(400).json({ success: false, error: 'Codul a expirat. Solicită unul nou.' });
        }

        // Activăm contul și ștergem OTP-ul + contorul de încercări
        await updateUser(email, { emailVerificat: true, emailOTP: null, emailOTPExpires: null, emailOTPAttempts: 0 });

        // Generăm JWT direct — utilizatorul e logat automat
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        log('info', 'POST /api/auth/verifica-email-otp', `Email verificat și cont activat: ${email}`);
        res.json({ success: true, token, user: { id: user.id, nume: user.nume, email: user.email } });
    } catch (err) {
        log('error', 'POST /api/auth/verifica-email-otp', 'Eroare la verificarea OTP', err);
        res.status(500).json({ success: false, error: 'Eroare la verificarea codului.' });
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

        if (user.emailVerificat === false) {
            return res.status(403).json({ success: false, error: 'Adresa de email nu a fost confirmată. Verifică inbox-ul și introdu codul de 6 cifre primit.', requiresOTP: true, email: user.email });
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
            // Răspuns generic — nu dezvăluim dacă emailul există
            return res.json({ success: true, message: 'Dacă adresa de e-mail există în sistem, vei primi un cod de verificare în câteva minute.' });
        }

        // Generăm un cod de 6 cifre + token pentru resetare efectivă
        const resetOTP = Math.floor(100000 + Math.random() * 900000).toString();
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = Date.now() + 3600000;    // 1 oră pentru token
        const resetOTPExpires = Date.now() + 900000;  // 15 minute pentru cod

        await updateUser(email, { resetToken, resetExpires, resetOTP, resetOTPExpires, resetOTPAttempts: 0 });

        if (resend) {
            try {
                await resend.emails.send({
                    from: EMAIL_FROM,
                    to: email,
                    subject: 'Codul tău de verificare — curriculAI',
                    html: `
                        <div style="font-family:'DM Sans',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f9fafb;border-radius:16px;">
                            <div style="text-align:center;margin-bottom:28px;">
                                <h1 style="font-size:22px;color:#111827;margin:0;">curriculAI</h1>
                            </div>
                            <div style="background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
                                <h2 style="font-size:18px;color:#111827;margin-top:0;">Bună, ${escapeHtml(user.nume || 'Profesor')}!</h2>
                                <p style="color:#6b7280;line-height:1.6;margin-bottom:24px;">Ai solicitat resetarea parolei pentru contul tău curriculAI. Introdu codul de mai jos pe pagina de resetare:</p>
                                <div style="text-align:center;margin:28px 0;">
                                    <div style="display:inline-block;background:#f0fdf4;border:2px solid #00C896;border-radius:12px;padding:20px 40px;">
                                        <span style="font-size:38px;font-weight:700;letter-spacing:10px;color:#111827;font-family:monospace;">${resetOTP}</span>
                                    </div>
                                </div>
                                <p style="color:#9ca3af;font-size:13px;text-align:center;line-height:1.5;">Codul este valabil <strong>15 minute</strong>.<br>Dacă nu ai cerut resetarea parolei, ignoră acest mesaj.</p>
                            </div>
                            <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:20px;">© ${new Date().getFullYear()} curriculAI</p>
                        </div>
                    `
                });
                log('info', 'POST /api/forgot-password', `Cod OTP trimis către ${email}`);
            } catch (emailErr) {
                log('error', 'POST /api/forgot-password', 'Eroare la trimiterea emailului', emailErr);
                return res.status(500).json({ success: false, error: 'Nu am putut trimite emailul. Încearcă din nou sau contactează suportul.' });
            }
        } else {
            log('warn', 'POST /api/forgot-password', `RESEND_API_KEY lipsă. Cod OTP pentru ${email}: ${resetOTP}`);
        }

        res.json({ success: true, message: 'Dacă adresa de e-mail există în sistem, vei primi un cod de verificare în câteva minute.' });
    } catch (err) {
        log('error', 'POST /api/forgot-password', 'Eroare la procesarea cererii', err);
        res.status(500).json({ success: false, error: 'Eroare la procesarea cererii. Încearcă din nou.' });
    }
});

// Verifică codul OTP și returnează token-ul de resetare
router.post('/verifica-cod-reset', authLimiter, async (req, res) => {
    try {
        const { email, cod } = req.body;
        if (!email || !cod) {
            return res.status(400).json({ success: false, error: 'Email și cod sunt obligatorii.' });
        }

        const user = await findUserByEmail(email);
        if (!user || !user.resetOTP) {
            return res.status(400).json({ success: false, error: 'Codul este incorect. Verifică emailul și încearcă din nou.' });
        }

        // Blocăm brute-force-ul pe cont (rate-limit-ul e doar per IP)
        if ((user.resetOTPAttempts || 0) >= MAX_OTP_ATTEMPTS) {
            return res.status(429).json({ success: false, error: 'Prea multe încercări greșite. Solicită un cod nou.' });
        }

        if (user.resetOTP !== String(cod).trim()) {
            await updateUser(email, { resetOTPAttempts: (user.resetOTPAttempts || 0) + 1 });
            return res.status(400).json({ success: false, error: 'Codul este incorect. Verifică emailul și încearcă din nou.' });
        }

        if (Date.now() > user.resetOTPExpires) {
            return res.status(400).json({ success: false, error: 'Codul a expirat. Solicită unul nou.' });
        }

        // Ștergem OTP-ul + contorul de încercări — nu mai poate fi refolosit
        await updateUser(email, { resetOTP: null, resetOTPExpires: null, resetOTPAttempts: 0 });

        res.json({ success: true, token: user.resetToken });
    } catch (err) {
        log('error', 'POST /api/auth/verifica-cod-reset', 'Eroare la verificarea codului', err);
        res.status(500).json({ success: false, error: 'Eroare la verificarea codului.' });
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

// Retrimite emailul de confirmare pentru conturi neactivate
router.post('/retrimite-confirmare', authLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, error: 'Email lipsă.' });

        const user = await findUserByEmail(email);

        // Răspuns generic dacă userul nu există sau e deja verificat
        if (!user || user.emailVerificat !== false) {
            return res.json({ success: true, message: 'Dacă adresa există și contul nu e activat, vei primi un nou email de confirmare.' });
        }

        // Regenerăm un OTP nou de 6 cifre
        const emailOTP = Math.floor(100000 + Math.random() * 900000).toString();
        const emailOTPExpires = Date.now() + 15 * 60 * 1000;
        await updateUser(email, { emailOTP, emailOTPExpires, emailOTPAttempts: 0 });

        if (resend) {
            try {
                await resend.emails.send({
                    from: EMAIL_FROM,
                    to: email,
                    subject: 'Noul tău cod de verificare — curriculAI',
                    html: `
                        <div style="font-family:'DM Sans',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f9fafb;border-radius:16px;">
                            <div style="background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
                                <h2 style="font-size:18px;color:#111827;margin-top:0;">Bună, ${escapeHtml(user.nume)}!</h2>
                                <p style="color:#6b7280;">Noul tău cod de verificare pentru curriculAI:</p>
                                <div style="text-align:center;margin:24px 0;">
                                    <div style="display:inline-block;background:#f0fdf4;border:2px solid #00C896;border-radius:12px;padding:20px 40px;">
                                        <span style="font-size:38px;font-weight:700;letter-spacing:10px;color:#111827;font-family:monospace;">${emailOTP}</span>
                                    </div>
                                </div>
                                <p style="color:#9ca3af;font-size:13px;text-align:center;">Valabil <strong>15 minute</strong>.</p>
                            </div>
                        </div>
                    `
                });
            } catch (emailErr) {
                log('error', 'POST /api/auth/retrimite-confirmare', 'Eroare la trimiterea OTP', emailErr);
                return res.status(500).json({ success: false, error: 'Nu am putut trimite emailul. Încearcă din nou.' });
            }
        } else {
            log('warn', 'POST /api/auth/retrimite-confirmare', `RESEND_API_KEY lipsă. Cod OTP nou pentru ${email}: ${emailOTP}`);
        }

        res.json({ success: true, message: 'Dacă adresa există și contul nu e activat, vei primi un nou email de confirmare.' });
    } catch (err) {
        log('error', 'POST /api/auth/retrimite-confirmare', 'Eroare la retrimitera confirmării', err);
        res.status(500).json({ success: false, error: 'Eroare la procesarea cererii.' });
    }
});

// Confirmă adresa de email prin token trimis la înregistrare
router.get('/verifica-email', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ success: false, error: 'Token lipsă.' });

        const user = await findUserByVerifyToken(token);
        if (!user) {
            return res.status(400).json({ success: false, error: 'Token invalid sau deja folosit.' });
        }

        await updateUser(user.email, { emailVerificat: true, emailVerifyToken: null });
        // Redirecționăm la login cu mesaj de succes
        res.redirect('/login.html?verificat=1');
    } catch (err) {
        log('error', 'GET /api/auth/verifica-email', 'Eroare la verificarea emailului', err);
        res.status(500).json({ success: false, error: 'Eroare la verificarea emailului.' });
    }
});

// Upgrade Pro — disponibil doar după integrarea plății (Stripe/Netopia)
// Activarea manuală se face din /api/admin/set-tier (cu ADMIN_SECRET)
router.post('/upgrade-pro', authMiddleware, async (req, res) => {
    res.status(503).json({
        success: false,
        error: 'Upgrade-ul Pro nu este disponibil încă. Revenim în curând cu opțiuni de plată.'
    });
});

router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await findUserById(req.user.userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'Utilizatorul nu a fost găsit.' });
        }
        res.json({
            success: true,
            user: { id: user.id, nume: user.nume, email: user.email, tier: user.tier || 'free', generariLuna: user.generariLuna || 0, dataCrearii: user.dataCrearii }
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

// Ștergere cont — șterge utilizatorul și toate datele asociate din DB
router.delete('/account', authMiddleware, async (req, res) => {
    try {
        const { confirmare } = req.body;

        // Cere confirmarea explicită pentru a preveni ștergeri accidentale
        if (confirmare !== 'STERGE') {
            return res.status(400).json({ success: false, error: 'Trimite { confirmare: "STERGE" } pentru a confirma.' });
        }

        const user = await findUserById(req.user.userId);
        if (!user) return res.status(404).json({ success: false, error: 'Contul nu a fost găsit.' });

        await deleteUserData(req.user.userId, user.email);

        logger.info({ message: `Cont șters: ${user.email}` });
        res.json({ success: true, message: 'Contul și toate datele asociate au fost șterse definitiv.' });
    } catch (err) {
        log('error', 'DELETE /api/auth/account', 'Eroare la ștergerea contului', err);
        res.status(500).json({ success: false, error: 'Eroare la ștergerea contului.' });
    }
});

module.exports = router;
