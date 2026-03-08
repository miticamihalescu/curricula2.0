require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { connectDB, findUserByEmail, findUserById, createUser, updateUser, createPlan, getPlansByUser, getPlanById, deletePlan } = require('./db');
const crypto = require('crypto');
const authMiddleware = require('./auth');
const { parsePlanificareAI, generateMaterials } = require('./ai-parser');
const { parsePlanificare } = require('./planificare-parser');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

app.use(cors());
app.use(express.json());

// Servește fișierele statice (HTML/JS/CSS) din folderul curent
app.use(express.static(__dirname));

// ─────────────────────────────────────────────────────────
// AUTENTIFICARE — RUTE
// ─────────────────────────────────────────────────────────

/**
 * POST /api/register
 */
app.post('/api/register', async (req, res) => {
  try {
    const { nume, email, parola } = req.body;

    if (!nume || !email || !parola) {
      return res.status(400).json({ error: 'Toate câmpurile sunt obligatorii (nume, email, parola).' });
    }
    if (nume.trim().length < 2) {
      return res.status(400).json({ error: 'Numele trebuie să aibă cel puțin 2 caractere.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Adresa de email nu este validă.' });
    }
    if (parola.length < 6) {
      return res.status(400).json({ error: 'Parola trebuie să aibă cel puțin 6 caractere.' });
    }

    const existingUser = findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'Un cont cu această adresă de email există deja.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(parola, salt);

    const newUser = await createUser({
      nume: nume.trim(),
      email: email.toLowerCase().trim(),
      parola: hashedPassword
    });

    res.status(201).json({
      message: 'Cont creat cu succes! Te poți autentifica acum.',
      user: { id: newUser.id, nume: newUser.nume, email: newUser.email, dataCrearii: newUser.dataCrearii }
    });
  } catch (err) {
    console.error('Eroare la /api/register:', err);
    res.status(500).json({ error: 'A apărut o eroare la crearea contului.' });
  }
});

/**
 * POST /api/login
 */
app.post('/api/login', async (req, res) => {
  try {
    const { email, parola } = req.body;

    if (!email || !parola) {
      return res.status(400).json({ error: 'Email-ul și parola sunt obligatorii.' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Credențiale invalide. Verifică email-ul și parola.' });
    }

    const isMatch = await bcrypt.compare(parola, user.parola);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credențiale invalide. Verifică email-ul și parola.' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Autentificare reușită!',
      token,
      user: { id: user.id, nume: user.nume, email: user.email }
    });
  } catch (err) {
    console.error('Eroare la /api/login:', err);
    res.status(500).json({ error: 'A apărut o eroare la autentificare.' });
  }
});

/**
 * POST /api/forgot-password
 * Generează un token de resetare și îl afișează în consolă (scop demonstrativ/testare)
 */
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email-ul este obligatoriu.' });

    const user = findUserByEmail(email);
    if (!user) {
      // Din motive de securitate, nu confirmăm dacă email-ul există sau nu, 
      // dar pentru acest proiect vom returna o eroare clară pentru UX.
      return res.status(404).json({ error: 'Nu există un cont cu această adresă de email.' });
    }

    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetExpires = Date.now() + 3600000; // 1 oră

    await updateUser(email, { resetToken, resetExpires });

    const resetUrl = `http://localhost:${PORT}/reset-password.html?token=${resetToken}`;
    console.log('\n==========================================');
    console.log(`LINK RESETARE PAROLĂ (pentru ${email}):`);
    console.log(resetUrl);
    console.log('==========================================\n');

    res.json({
      message: 'Instrucțiunile de resetare au fost trimise (verifică consola serverului pentru link-ul de test).',
      debugUrl: resetUrl // Îl trimitem și în JSON pentru a fi ușor de accesat în faza de testare
    });
  } catch (err) {
    console.error('Eroare la /api/forgot-password:', err);
    res.status(500).json({ error: 'Eroare la procesarea cererii.' });
  }
});

/**
 * POST /api/reset-password
 */
app.post('/api/reset-password', async (req, res) => {
  try {
    const { token, nouaParola } = req.body;

    if (!token || !nouaParola) {
      return res.status(400).json({ error: 'Token-ul și noua parolă sunt obligatorii.' });
    }

    if (nouaParola.length < 6) {
      return res.status(400).json({ error: 'Parola trebuie să aibă cel puțin 6 caractere.' });
    }

    const users = require('./db').readUsers ? require('./db').readUsers() : JSON.parse(require('fs').readFileSync(path.join(__dirname, 'users.json'), 'utf-8'));
    const user = users.find(u => u.resetToken === token && u.resetExpires > Date.now());

    if (!user) {
      return res.status(400).json({ error: 'Token-ul este invalid sau a expirat.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(nouaParola, salt);

    await updateUser(user.email, {
      parola: hashedPassword,
      resetToken: null,
      resetExpires: null
    });

    res.json({ message: 'Parola a fost actualizată cu succes! Te poți autentifica acum.' });
  } catch (err) {
    console.error('Eroare la /api/reset-password:', err);
    res.status(500).json({ error: 'Eroare la resetarea parolei.' });
  }
});

/**
 * GET /api/me — rută protejată
 */
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const user = await findUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'Utilizatorul nu a fost găsit.' });
    }
    res.json({
      user: { id: user.id, nume: user.nume, email: user.email, dataCrearii: user.dataCrearii }
    });
  } catch (err) {
    console.error('Eroare la /api/me:', err);
    res.status(500).json({ error: 'Eroare la obținerea datelor utilizatorului.' });
  }
});

// ─────────────────────────────────────────────────────────
// GESTIUNE PLANIFICĂRI (Multiple Plans)
// ─────────────────────────────────────────────────────────

/**
 * GET /api/plans
 * Obține toate planificările utilizatorului curent
 */
app.get('/api/plans', authMiddleware, async (req, res) => {
  try {
    const plans = await getPlansByUser(req.user.userId);
    res.json({ plans });
  } catch (err) {
    console.error('Eroare la /api/plans (GET):', err);
    res.status(500).json({ error: 'Eroare la obținerea planificărilor.' });
  }
});

/**
 * GET /api/plans/:id
 * Obține o planificare specifică după ID
 */
app.get('/api/plans/:id', authMiddleware, async (req, res) => {
  try {
    const plan = await getPlanById(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Planificarea nu a fost găsită.' });
    if (plan.userId !== req.user.userId) return res.status(403).json({ error: 'Acces interzis la această planificare.' });

    res.json({ plan });
  } catch (err) {
    console.error(`Eroare la /api/plans/${req.params.id}:`, err);
    res.status(500).json({ error: 'Eroare la obținerea planificării.' });
  }
});

/**
 * POST /api/plans
 * Salvează o planificare nouă
 */
app.post('/api/plans', authMiddleware, async (req, res) => {
  try {
    const { metadata, lectii, clasa, disciplina } = req.body;

    if (!lectii || !Array.isArray(lectii)) {
      return res.status(400).json({ error: 'Lista de lecții este obligatorie și trebuie să fie un array.' });
    }

    const newPlan = await createPlan(req.user.userId, { metadata, lectii, clasa, disciplina });
    res.status(201).json({ message: 'Planificarea a fost salvată cu succes.', planId: newPlan.id });
  } catch (err) {
    console.error('Eroare la /api/plans (POST):', err);
    res.status(500).json({ error: 'Eroare la salvarea planificării.' });
  }
});

/**
 * DELETE /api/plans/:id
 * Șterge o planificare
 */
app.delete('/api/plans/:id', authMiddleware, async (req, res) => {
  try {
    const success = await deletePlan(req.params.id, req.user.userId);
    if (success) {
      res.json({ message: 'Planificarea a fost ștearsă cu succes.' });
    } else {
      res.status(404).json({ error: 'Planificarea nu a fost găsită sau nu îți aparține.' });
    }
  } catch (err) {
    console.error(`Eroare la /api/plans/delete/${req.params.id}:`, err);
    res.status(500).json({ error: 'Eroare la ștergerea planificării.' });
  }
});

// ─────────────────────────────────────────────────────────
// UPLOAD & PARSARE PLANIFICĂRI (100% AI)
// ─────────────────────────────────────────────────────────

/**
 * Extrage textul brut dintr-un buffer de fișier.
 */
async function extractTextFromFile(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();

  if (ext === '.pdf') {
    const data = await pdfParse(file.buffer);
    return data.text || '';
  }
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value || '';
  }
  return '';
}

/**
 * POST /api/upload-planificare
 * Upload fișier Word/PDF → AI extrage lecțiile → returnează JSON Array.
 * Răspunde cu: { id, lectii: [...] }
 */
app.post('/api/upload-planificare', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Lipsește fișierul de planificare.' });
    }

    // Extrage text din document
    let text = '';
    try {
      text = await extractTextFromFile(req.file);
    } catch (err) {
      console.error('Eroare la extragerea textului:', err);
      return res.status(400).json({ error: 'Nu am putut citi fișierul. Asigură-te că e un .docx sau .pdf valid.' });
    }

    if (!text.trim()) {
      return res.status(400).json({ error: 'Fișierul nu conține text extractibil.' });
    }

    // Parsare rapidă cu regex
    const result = parsePlanificare(text);
    const lectii = result.folders || [];
    const metadata = result.metadata || { scoala: '—', profesor: '—' };

    const planId = 'PLAN-' + Date.now().toString(36).toUpperCase();

    res.json({
      id: planId,
      lectii,
      metadata
    });

  } catch (err) {
    console.error('Eroare la upload-planificare:', err);

    // Mesaj specific pentru rate limit
    if (err.message && err.message.includes('429')) {
      return res.status(429).json({
        error: 'Limita de apeluri API a fost depășită. Încearcă din nou în câteva minute.',
        details: 'Quota Gemini AI epuizată temporar.'
      });
    }

    res.status(500).json({ error: 'A apărut o eroare la procesarea planificării: ' + err.message });
  }
});

/**
 * POST /api/parse-planificare
 * Endpoint dedicat doar pentru parsare (fără materiale vechi).
 */
app.post('/api/parse-planificare', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Lipsește fișierul de planificare.' });
    }

    let text = '';
    try {
      text = await extractTextFromFile(req.file);
    } catch (err) {
      console.error('Eroare la extragerea textului:', err);
      return res.status(400).json({ error: 'Nu am putut citi fișierul.' });
    }

    if (!text.trim()) {
      return res.status(400).json({ error: 'Fișierul nu conține text extractibil.' });
    }

    const result = parsePlanificare(text);
    const lectii = result.folders || [];
    const metadata = result.metadata || { scoala: '—', profesor: '—' };

    res.json({
      lectii,
      metadata,
      total: lectii.length
    });

  } catch (err) {
    console.error('Eroare la parse-planificare:', err);

    if (err.message && err.message.includes('429')) {
      return res.status(429).json({
        error: 'Limita de apeluri API depășită. Încearcă din nou în câteva minute.'
      });
    }

    res.status(500).json({ error: 'Eroare la parsarea planificării: ' + err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GENERARE MATERIALE ON-DEMAND (Pas 2)
// ─────────────────────────────────────────────────────────

/**
 * POST /api/generate-materials
 * Generează proiect didactic + fișă de lucru + test de evaluare
 * pentru o lecție specifică, la cerere (on-demand).
 *
 * Primește: { titlu_lectie, clasa, disciplina, modul, unitate_invatare }
 * Returnează: { proiect_didactic, fisa_lucru, test_evaluare }
 */
app.post('/api/generate-materials', async (req, res) => {
  try {
    const { titlu_lectie, clasa, disciplina, modul, unitate_invatare, scoala, profesor, dificultate, stil_predare, target } = req.body;

    if (!titlu_lectie) {
      return res.status(400).json({ error: 'Titlul lecției este obligatoriu.' });
    }

    const materials = await generateMaterials({
      titlu_lectie,
      clasa: clasa || '—',
      disciplina: disciplina || '—',
      modul: modul || '—',
      unitate_invatare: unitate_invatare || '—',
      scoala: scoala || '—',
      profesor: profesor || '—',
      dificultate: dificultate || 'standard',
      stil_predare: stil_predare || 'standard',
      target: target || 'all'
    });

    res.json(materials);

  } catch (err) {
    console.error('Eroare la generare materiale:', err);

    if (err.message && err.message.includes('429')) {
      return res.status(429).json({
        error: 'Limita de apeluri API depășită. Încearcă din nou în câteva minute.'
      });
    }

    res.status(500).json({ error: 'Eroare la generarea materialelor: ' + err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PORNIRE SERVER
// ─────────────────────────────────────────────────────────

async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`🚀 Curricula backend pornit pe http://localhost:${PORT}`);
  });
}

// ─────────────────────────────────────────────────────────
// CONFIGURARE NETLIFY SERVERLESS
// ─────────────────────────────────────────────────────────
const serverless = require('serverless-http');

// Ensure the database is connected even in serverless environments
connectDB().catch(console.error);

module.exports = app;
module.exports.handler = serverless(app);

if (require.main === module) {
  startServer();
}
