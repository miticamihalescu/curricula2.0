const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const path = require('path');
const archiver = require('archiver');

const authMiddleware = require('../auth');
const checkProExport = require('../middleware/checkProExport');
const { validators } = require('../middleware/validate');
const { parsePlanificare } = require('../planificare-parser');
const { parsePlanificareAI, parsePlanificareAI_File, generateMaterials } = require('../ai-parser');
const { saveJob, getJob, getImageById } = require('../db');
const { generateDocx, generateBulkDocx } = require('../docx-exporter');
const { generatePdf, generateBulkPdf } = require('../pdf-exporter');
const logger = require('../logger');

const ALLOWED_EXTENSIONS = ['.docx', '.pdf', '.xlsx'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (ALLOWED_EXTENSIONS.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Doar fișiere .docx, .xlsx și .pdf sunt acceptate.'));
        }
    }
});

const log = (level, route, msg, err) => {
    const meta = { route };
    if (err) meta.error = err.message || String(err);
    logger[level]({ message: msg, ...meta });
};

async function extractTextFromFile(file) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext === '.pdf') {
        const data = await pdfParse(file.buffer);
        return data.text || '';
    }
    if (ext === '.docx') {
        return await extractTextFromDocx(file.buffer);
    }
    if (ext === '.xlsx') {
        return extractTextFromExcel(file.buffer);
    }
    return '';
}

// Extrage text din Excel (.xlsx) parcurgând toate sheet-urile relevante.
// Tratează celulele goale ca moștenitoare ale valorii de pe rândul anterior (lastValues),
// pentru a compensa celulele unite (merged cells) din planificările tabelar.
function extractTextFromExcel(buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const linii = [];

    for (const numeSheet of workbook.SheetNames) {
        const sheet = workbook.Sheets[numeSheet];
        const randuri = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

        if (randuri.length === 0) continue;

        // Găsim numărul de coloane din primul rând ne-gol
        const nrColoane = Math.max(...randuri.map(r => r.length), 0);
        const lastValues = new Array(nrColoane).fill('');

        for (const rand of randuri) {
            // Sari peste rânduri complet goale
            if (rand.every(c => !String(c).trim())) continue;

            // Completează celulele goale cu ultima valoare de pe coloana respectivă (merged cells)
            const randComplet = rand.map((celula, i) => {
                const val = String(celula).trim().replace(/\s+/g, ' ');
                if (val) {
                    lastValues[i] = val;
                    return val;
                }
                return lastValues[i] || '';
            });

            linii.push(randComplet.join('\t'));
        }

        // Separare vizuală între sheet-uri
        linii.push('');
    }

    return linii.join('\n');
}

// Extrage text din DOCX folosind mammoth HTML (nu text brut) pentru a păstra
// structura tabelului. Celulele unite vertical (rowspan) sunt expandate pe fiecare rând.
async function extractTextFromDocx(buffer) {
    const result = await mammoth.convertToHtml({ buffer });
    const html = result.value || '';
    if (!html.trim()) return '';

    const sectiuni = [];

    // Textul din afara tabelelor (antet document: disciplina, profesor, clasă, etc.)
    const htmlFaraTabel = html.replace(/<table[\s\S]*?<\/table>/gi, '\n');
    const textAntet = htmlFaraTabel.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (textAntet) sectiuni.push(textAntet);

    // Parsează fiecare tabel din document
    const tabelRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let match;
    while ((match = tabelRegex.exec(html)) !== null) {
        const randuri = parseTabelHtml(match[0]);
        for (const rand of randuri) {
            if (rand.every(c => !c)) continue;
            sectiuni.push(rand.join('\t'));
        }
        sectiuni.push('');
    }

    return sectiuni.join('\n');
}

// Parsează un tabel HTML și returnează o matrice de celule.
// Tratează rowspan (celule unite vertical): valoarea se copiază pe rândurile acoperite.
function parseTabelHtml(tabelHtml) {
    const matrice = [];
    // pending[colIndex] = { valoare, randuriRamase }
    const pending = {};

    // Împărțim pe rânduri la </tr>
    const partiiRand = tabelHtml.split(/<\/tr>/i);

    for (const partieRand of partiiRand) {
        if (!/<tr/i.test(partieRand)) continue;

        // Extrage toate <td> din rândul curent cu atributele lor
        const celule = [];
        const celRegex = /<td([^>]*)>([\s\S]*?)(?=<\/td>|<td|<\/tr>|$)/gi;
        let celMatch;
        while ((celMatch = celRegex.exec(partieRand)) !== null) {
            const atribute = celMatch[1] || '';
            const continut = celMatch[2] || '';
            const rsMatch = atribute.match(/rowspan="(\d+)"/i);
            const rowspan = rsMatch ? parseInt(rsMatch[1], 10) : 1;
            const text = continut
                .replace(/<br\s*\/?>/gi, ' ')
                .replace(/<[^>]+>/g, '')
                .replace(/&amp;/g, '&')
                .replace(/&nbsp;/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            celule.push({ text, rowspan });
        }

        if (celule.length === 0 && Object.keys(pending).length === 0) continue;

        const rand = [];
        let iCelula = 0;
        let col = 0;

        // Construiește rândul: intercalează celulele pending (din rowspan-uri anterioare)
        // cu celulele noi din rândul curent
        while (true) {
            if (pending[col] !== undefined) {
                rand.push(pending[col].valoare);
                pending[col].randuriRamase--;
                if (pending[col].randuriRamase <= 0) delete pending[col];
                col++;
            } else if (iCelula < celule.length) {
                const { text, rowspan } = celule[iCelula++];
                rand.push(text);
                if (rowspan > 1) {
                    pending[col] = { valoare: text, randuriRamase: rowspan - 1 };
                }
                col++;
            } else {
                break;
            }
        }

        matrice.push(rand);
    }

    return matrice;
}

function handleMulterError(err, req, res, next) {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, error: 'Fișierul depășește limita de 10MB.' });
        }
        return res.status(400).json({ success: false, error: 'Eroare la încărcarea fișierului: ' + err.message });
    }
    if (err && err.message) {
        return res.status(400).json({ success: false, error: err.message });
    }
    next(err);
}

router.post('/upload-planificare', authMiddleware, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) return handleMulterError(err, req, res, next);
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Lipsește fișierul de planificare.' });
        }

        const ext = path.extname(req.file.originalname || '').toLowerCase();
        const estePDF = ext === '.pdf';

        // Filtre de calitate pentru regex fallback
        const TITLURI_ZGOMOT = [
            /^\d+\.\d+[\.\;\s]/,
            /^ore la dispoziți/i,
            /^obs\./i,
            /^S\s*\d+\s*[-–]/i,
            /vacanță/i,
            /recapitulare final/i,
        ];
        const esteLectieBuna = (titlu) => {
            if (!titlu || titlu.length < 12) return false;
            if (TITLURI_ZGOMOT.some(p => p.test(titlu))) return false;
            return true;
        };

        let result = { lectii: [], metadata: {} };
        let sursa = 'ai-vision';

        // ── Strategie parsare ──────────────────────────────────────────────────
        // PDF → Gemini Vision (citire vizuală, fără extragere text — mai precis
        //        pentru tabele cu celule unite)
        // DOCX/XLSX → extragere text → Gemini AI (mammoth gestionează rowspan bine)
        // Fallback final → regex pe text extras
        // ──────────────────────────────────────────────────────────────────────

        // Pre-calculăm regex fallback din text, indiferent de strategie
        let lectiiRegexFallback = [];
        let metadataRegexFallback = {};
        let textExtras = '';
        try {
            textExtras = await extractTextFromFile(req.file);
            if (textExtras.trim()) {
                const parsedRegex = parsePlanificare(textExtras);
                metadataRegexFallback = parsedRegex?.metadata || {};
                const vazute = new Set();
                lectiiRegexFallback = (parsedRegex?.folders || [])
                    .filter(f => {
                        if (!esteLectieBuna(f.nume_lectie)) return false;
                        const cheie = f.nume_lectie.trim().toLowerCase();
                        if (vazute.has(cheie)) return false;
                        vazute.add(cheie);
                        return true;
                    })
                    .map((f, idx) => ({
                        id: idx + 1,
                        modul: f.modul || 'Modul I',
                        unitate_invatare: f.categorie || '',
                        saptamana: f.saptamana || '—',
                        tip_ora: (f.tip_ora || 'Predare').toUpperCase(),
                        titlu_lectie: f.nume_lectie || '',
                        perioada: f.data || '—'
                    }));
            }
        } catch (extractErr) {
            log('warn', 'POST /api/upload-planificare', 'Extragere text eșuată (non-fatal)', extractErr);
        }

        if (estePDF) {
            // PDF: trimitem fișierul direct la Gemini Vision
            try {
                result = await parsePlanificareAI_File(req.file.buffer, 'application/pdf');
                sursa = 'ai-vision';
                log('info', 'POST /api/upload-planificare', `Gemini Vision (PDF): ${result.lectii?.length || 0} lecții extrase`);
            } catch (visionErr) {
                log('warn', 'POST /api/upload-planificare', `Vision eșuat (${visionErr.message}), încerc text fallback`, visionErr);
                // Fallback: text extras din PDF → AI text
                if (textExtras.trim()) {
                    try {
                        result = await parsePlanificareAI(textExtras);
                        sursa = 'ai-text-fallback';
                        log('info', 'POST /api/upload-planificare', `AI text fallback: ${result.lectii?.length || 0} lecții`);
                    } catch (aiErr) {
                        log('warn', 'POST /api/upload-planificare', `AI text eșuat, regex final`, aiErr);
                        result = { metadata: metadataRegexFallback, lectii: lectiiRegexFallback };
                        sursa = 'regex-fallback';
                    }
                } else {
                    result = { metadata: metadataRegexFallback, lectii: lectiiRegexFallback };
                    sursa = 'regex-fallback';
                }
            }
        } else {
            // DOCX / XLSX: extragere text → AI (mammoth gestionează rowspan bine)
            if (!textExtras.trim()) {
                return res.status(400).json({ success: false, error: 'Fișierul nu conține text extractibil.' });
            }
            try {
                result = await parsePlanificareAI(textExtras);
                sursa = 'ai-text';
                log('info', 'POST /api/upload-planificare', `AI text (${ext}): ${result.lectii?.length || 0} lecții extrase`);
            } catch (aiErr) {
                log('warn', 'POST /api/upload-planificare', `AI eșuat (${aiErr.message}), regex fallback`, aiErr);
                result = { metadata: metadataRegexFallback, lectii: lectiiRegexFallback };
                sursa = 'regex-fallback';
            }
        }

        const lectii = result.lectii || [];
        const metadata = result.metadata || { scoala: '—', profesor: '—' };
        const planId = 'PLAN-' + Date.now().toString(36).toUpperCase();

        log('info', 'POST /api/upload-planificare', `Planificare procesată (${sursa}): ${lectii.length} lecții extrase`);

        res.json({ success: true, id: planId, lectii, metadata });

    } catch (err) {
        log('error', 'POST /api/upload-planificare', 'Eroare la procesarea planificării', err);
        if (err.message && err.message.includes('429')) {
            return res.status(429).json({ success: false, error: 'Limita de apeluri API a fost depășită. Încearcă din nou în câteva minute.' });
        }
        res.status(500).json({ success: false, error: 'A apărut o eroare la procesarea planificării: ' + err.message });
    }
});

router.post('/parse-planificare', authMiddleware, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) return handleMulterError(err, req, res, next);
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Lipsește fișierul de planificare.' });
        }

        let text = '';
        try {
            text = await extractTextFromFile(req.file);
        } catch (err) {
            log('error', 'POST /api/parse-planificare', 'Eroare la extragerea textului', err);
            return res.status(400).json({ success: false, error: 'Nu am putut citi fișierul.' });
        }

        if (!text.trim()) {
            const ext = path.extname(req.file.originalname || '').toLowerCase();
            const eroare = ext === '.pdf'
                ? 'PDF-ul încărcat pare a fi scanat (imagine) și nu conține text selectabil. Te rugăm să încarci versiunea Word (.docx) sau un PDF generat digital, nu scanat.'
                : 'Fișierul nu conține text extractibil.';
            return res.status(400).json({ success: false, error: eroare });
        }

        const result = await parsePlanificareAI(text);
        const lectii = result.lectii || [];
        const metadata = result.metadata || { scoala: '—', profesor: '—' };

        log('info', 'POST /api/parse-planificare', `Parsare completă: ${lectii.length} lecții`);

        res.json({ success: true, lectii, metadata, total: lectii.length });

    } catch (err) {
        log('error', 'POST /api/parse-planificare', 'Eroare la parsarea planificării', err);
        if (err.message && err.message.includes('429')) {
            return res.status(429).json({ success: false, error: 'Limita de apeluri API depășită. Încearcă din nou în câteva minute.' });
        }
        res.status(500).json({ success: false, error: 'Eroare la parsarea planificării: ' + err.message });
    }
});

router.post('/export-docx', authMiddleware, checkProExport, async (req, res) => {
    try {
        // Construim harta de imagini dacă sunt transmise imageIds
        const imaginiMap = {};
        if (Array.isArray(req.body.imageIds) && req.body.imageIds.length > 0) {
            await Promise.all(req.body.imageIds.map(async (id) => {
                const img = await getImageById(id, req.user.userId);
                if (img) imaginiMap[id] = { dataBase64: img.dataBase64, mimeType: img.mimeType, filename: img.filename };
            }));
        }
        const buffer = await generateDocx({ ...req.body, imaginiMap });
        const titluSanitizat = (req.body.titlu_lectie || 'Lectie').replace(/[^a-z0-9]/gi, '_').toLowerCase();

        log('info', 'POST /api/export-docx', `DOCX generat pentru: ${req.body.titlu_lectie}`);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="materiale-${titluSanitizat}.docx"`);
        res.send(buffer);
    } catch (err) {
        log('error', 'POST /api/export-docx', 'Eroare la generarea DOCX', err);
        res.status(500).json({ success: false, error: 'A apărut o eroare la generarea fișierului DOCX.' });
    }
});

router.post('/export-pdf', authMiddleware, checkProExport, async (req, res) => {
    try {
        const buffer = await generatePdf(req.body);
        const titluSanitizat = (req.body.titlu_lectie || 'Lectie').replace(/[^a-z0-9]/gi, '_').toLowerCase();

        log('info', 'POST /api/export-pdf', `PDF generat pentru: ${req.body.titlu_lectie}`);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="materiale-${titluSanitizat}.pdf"`);
        res.send(buffer);
    } catch (err) {
        log('error', 'POST /api/export-pdf', 'Eroare la generarea PDF', err);
        res.status(500).json({ success: false, error: 'A apărut o eroare la generarea fișierului PDF.' });
    }
});

router.post('/export-bulk', authMiddleware, checkProExport, async (req, res) => {
    try {
        const { format = 'docx', meta = {}, lessons = [] } = req.body;

        if (!Array.isArray(lessons) || lessons.length === 0) {
            return res.status(400).json({ success: false, error: 'Lista de lecții este goală.' });
        }

        const disciplinaSanitizata = (meta.disciplina || 'Materiale').replace(/[^a-z0-9]/gi, '_').toLowerCase();

        if (format === 'pdf') {
            const buffer = await generateBulkPdf({ meta, lessons });
            log('info', 'POST /api/export-bulk', `Bulk PDF generat: ${lessons.length} lecții`);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="toate-materialele-${disciplinaSanitizata}.pdf"`);
            res.send(buffer);
        } else {
            const buffer = await generateBulkDocx({ meta, lessons });
            log('info', 'POST /api/export-bulk', `Bulk DOCX generat: ${lessons.length} lecții`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.setHeader('Content-Disposition', `attachment; filename="toate-materialele-${disciplinaSanitizata}.docx"`);
            res.send(buffer);
        }
    } catch (err) {
        log('error', 'POST /api/export-bulk', 'Eroare la generarea bulk', err);
        res.status(500).json({ success: false, error: 'A apărut o eroare la generarea fișierului: ' + err.message });
    }
});

// ── POST /generate-all — SSE stream for bulk generation ──────
router.post('/generate-all', authMiddleware, async (req, res) => {
    const { lectii, meta = {}, target = 'all', tip_test = 'formativ' } = req.body;

    if (!Array.isArray(lectii) || lectii.length === 0) {
        return res.status(400).json({ success: false, error: 'Lista de lecții este goală.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (data) => {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let clientClosed = false;
    req.on('close', () => { clientClosed = true; });

    const heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(': heartbeat\n\n');
    }, 20000);

    const SKIP_TYPES = new Set(['SĂPTĂMÂNA VERDE', 'ȘCOALA ALTFEL']);
    const toProcess = lectii.filter(l => !SKIP_TYPES.has(l.tip_ora));

    send({ type: 'start', total: toProcess.length });

    const allGenerated = [];

    for (let i = 0; i < toProcess.length; i++) {
        if (clientClosed) break;

        const lectie = toProcess[i];
        const isEvaluare = lectie.tip_ora === 'EVALUARE';
        const effectiveTarget = isEvaluare ? 'test' : target;
        const effectiveTipTest = isEvaluare ? 'sumativ' : tip_test;

        send({ type: 'progress', index: i + 1, total: toProcess.length, titlu: lectie.titlu_lectie, modul: lectie.modul });

        try {
            const materials = await generateMaterials({
                titlu_lectie: lectie.titlu_lectie,
                clasa: meta.clasa || '—',
                disciplina: meta.disciplina || '—',
                modul: lectie.modul || '—',
                unitate_invatare: lectie.unitate_invatare || '—',
                scoala: meta.scoala || '—',
                profesor: meta.profesor || '—',
                dificultate: 'standard',
                stil_predare: 'standard',
                target: effectiveTarget,
                tip_test: effectiveTipTest
            });

            allGenerated.push({ lectie, materials });
            send({ type: 'done_lesson', index: i + 1, total: toProcess.length, titlu: lectie.titlu_lectie, modul: lectie.modul });

        } catch (err) {
            log('error', 'POST /api/generate-all', `Eroare la generarea pentru: ${lectie.titlu_lectie}`, err);
            allGenerated.push({ lectie, materials: null, error: err.message });
            send({ type: 'error_lesson', index: i + 1, total: toProcess.length, titlu: lectie.titlu_lectie, error: err.message });
        }
    }

    clearInterval(heartbeat);

    if (clientClosed) { res.end(); return; }

    const jobId = 'JOB-' + Date.now().toString(36).toUpperCase();
    const successful = allGenerated.filter(g => g.materials);
    await saveJob(jobId, req.user.userId, successful, meta);

    const errors = allGenerated.filter(g => g.error).length;
    log('info', 'POST /api/generate-all', `Bulk generare completă: ${successful.length} lecții, ${errors} erori`);
    send({ type: 'complete', jobId, total: successful.length, errors });
    res.end();
});


// ── POST /export-zip — ZIP cu câte un DOCX per lecție ────────
router.post('/export-zip', authMiddleware, checkProExport, async (req, res) => {
    const { jobId } = req.body;

    const job = await getJob(jobId, req.user.userId);
    if (!job) {
        return res.status(404).json({ success: false, error: 'Sesiunea a expirat. Regenerează materialele.' });
    }

    const { generated, meta } = job;
    const disciplinaSanitizata = (meta.disciplina || 'Materiale').replace(/[^a-z0-9]/gi, '_').toLowerCase();

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="materiale-${disciplinaSanitizata}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
        log('error', 'POST /api/export-zip', 'Eroare la crearea ZIP', err);
        if (!res.headersSent) res.status(500).json({ success: false, error: 'Eroare la generarea ZIP.' });
    });
    archive.pipe(res);

    for (let i = 0; i < generated.length; i++) {
        const { lectie, materials } = generated[i];
        const modul = (lectie.modul || 'Altele').replace(/[^a-z0-9 ]/gi, '').trim();
        const titlu = (lectie.titlu_lectie || 'Lectie').replace(/[^a-z0-9 ]/gi, ' ').trim().replace(/\s+/g, '_').toLowerCase();
        const fileName = `${String(i + 1).padStart(2, '0')}_${titlu}.docx`;

        try {
            const buffer = await generateDocx({
                titlu_lectie: lectie.titlu_lectie,
                clasa: meta.clasa || '—',
                disciplina: meta.disciplina || '—',
                modul: lectie.modul || '—',
                unitate_invatare: lectie.unitate_invatare || '—',
                scoala: meta.scoala || '—',
                profesor: meta.profesor || '—',
                proiect_didactic: materials.proiect_didactic,
                fisa_lucru: materials.fisa_lucru,
                test_evaluare: materials.test_evaluare
            });
            archive.append(buffer, { name: `${modul}/${fileName}` });
        } catch (err) {
            log('error', 'POST /api/export-zip', `Eroare la DOCX pentru ${lectie.titlu_lectie}`, err);
        }
    }

    await archive.finalize();
    log('info', 'POST /api/export-zip', `ZIP generat: ${generated.length} lecții`);
});


// ── POST /export-bulk-job — DOCX unic pentru toate lecțiile ──
router.post('/export-bulk-job', authMiddleware, checkProExport, async (req, res) => {
    const { jobId } = req.body;

    const job = await getJob(jobId, req.user.userId);
    if (!job) {
        return res.status(404).json({ success: false, error: 'Sesiunea a expirat. Regenerează materialele.' });
    }

    const { generated, meta } = job;
    const disciplinaSanitizata = (meta.disciplina || 'Materiale').replace(/[^a-z0-9]/gi, '_').toLowerCase();

    try {
        const lessons = generated.map(({ lectie, materials }) => ({
            titlu_lectie: lectie.titlu_lectie,
            clasa: meta.clasa || '—',
            disciplina: meta.disciplina || '—',
            modul: lectie.modul || '—',
            unitate_invatare: lectie.unitate_invatare || '—',
            scoala: meta.scoala || '—',
            profesor: meta.profesor || '—',
            proiect_didactic: materials.proiect_didactic,
            fisa_lucru: materials.fisa_lucru,
            test_evaluare: materials.test_evaluare
        }));

        const buffer = await generateBulkDocx({ meta, lessons });
        log('info', 'POST /api/export-bulk-job', `Bulk DOCX generat: ${lessons.length} lecții`);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="toate-materialele-${disciplinaSanitizata}.docx"`);
        res.send(buffer);
    } catch (err) {
        log('error', 'POST /api/export-bulk-job', 'Eroare la generarea bulk DOCX', err);
        res.status(500).json({ success: false, error: 'Eroare la generarea fișierului: ' + err.message });
    }
});


module.exports = router;
