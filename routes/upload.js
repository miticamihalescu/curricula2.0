const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const path = require('path');
const archiver = require('archiver');

const authMiddleware = require('../auth');
const { validators } = require('../middleware/validate');
const { parsePlanificare } = require('../planificare-parser');
const { parsePlanificareAI, generateMaterials } = require('../ai-parser');
const { generateDocx, generateBulkDocx } = require('../docx-exporter');
const { generatePdf, generateBulkPdf } = require('../pdf-exporter');
const logger = require('../logger');

// ── In-memory job store for bulk generation results ──────────
const jobStore = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobStore) {
        if (job.expiresAt < now) jobStore.delete(id);
    }
}, 5 * 60 * 1000);

const ALLOWED_EXTENSIONS = ['.docx', '.pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (ALLOWED_EXTENSIONS.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Doar fișiere .docx și .pdf sunt acceptate.'));
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
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        return result.value || '';
    }
    return '';
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

        let text = '';
        try {
            text = await extractTextFromFile(req.file);
        } catch (err) {
            log('error', 'POST /api/upload-planificare', 'Eroare la extragerea textului', err);
            return res.status(400).json({ success: false, error: 'Nu am putut citi fișierul. Asigură-te că e un .docx sau .pdf valid.' });
        }

        if (!text.trim()) {
            return res.status(400).json({ success: false, error: 'Fișierul nu conține text extractibil.' });
        }

        // ── Parsare planificare: AI principal, regex doar ca fallback de urgență ──
        // AI-ul asigură calitatea datelor (module corecte, titluri reale, structură validă).
        // Regex-ul este folosit DOAR dacă AI eșuează, pentru a nu lăsa profesorul fără nimic.

        // Filtre de calitate pentru regex fallback
        const TITLURI_ZGOMOT = [
            /^\d+\.\d+[\.\;\s]/,             // coduri competențe: "1.1.; 1.4.;"
            /^ore la dispoziți/i,            // "Ore la dispoziția profesorului"
            /^obs\./i,                        // "Obs. Vacanță..."
            /^S\s*\d+\s*[-–]/i,             // "S 18 – practică"
            /vacanță/i,                      // linii cu vacanțe
            /recapitulare final/i,           // titluri de capitol
        ];

        const esteLectieBuna = (titlu) => {
            if (!titlu || titlu.length < 12) return false;
            if (TITLURI_ZGOMOT.some(p => p.test(titlu))) return false;
            return true;
        };

        let result = { lectii: [], metadata: {} };
        let sursa = 'ai';

        // Extragem regex fallback în avans, dacă AI eșuează
        let lectiiRegexFallback = [];
        let metadataRegexFallback = {};
        try {
            const parsedRegex = parsePlanificare(text);
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
        } catch (regexErr) {
            log('warn', 'POST /api/upload-planificare', 'Parser regex a eșuat (non-fatal)', regexErr);
        }

        // Folosim AI ca sursă principală — asigură structura corectă
        try {
            result = await parsePlanificareAI(text);
            log('info', 'POST /api/upload-planificare', `Parser AI: ${result.lectii?.length || 0} lecții extrase`);
        } catch (aiErr) {
            // AI a eșuat — folosim ce a extras regex-ul ca ultimă soluție
            log('warn', 'POST /api/upload-planificare', `AI eșuat (${aiErr.message}), folosesc regex ca fallback`, aiErr);
            result = { metadata: metadataRegexFallback, lectii: lectiiRegexFallback };
            sursa = 'regex-fallback';
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
            return res.status(400).json({ success: false, error: 'Fișierul nu conține text extractibil.' });
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

router.post('/generate-materials', authMiddleware, validators.generateMaterials, async (req, res) => {
    try {
        const { titlu_lectie, clasa, disciplina, modul, unitate_invatare, scoala, profesor, dificultate, stil_predare, target, tip_test } = req.body;

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
            target: target || 'all',
            tip_test: tip_test || 'formativ'
        });

        log('info', 'POST /api/generate-materials', `Materiale generate pentru: ${titlu_lectie}`);

        res.json({ success: true, ...materials });

    } catch (err) {
        log('error', 'POST /api/generate-materials', 'Eroare la generarea materialelor', err);
        if (err.message && err.message.includes('429')) {
            return res.status(429).json({ success: false, error: 'Limita de apeluri API depășită. Încearcă din nou în câteva minute.' });
        }
        res.status(500).json({ success: false, error: 'Eroare la generarea materialelor: ' + err.message });
    }
});

router.post('/export-docx', authMiddleware, async (req, res) => {
    try {
        const buffer = await generateDocx(req.body);
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

router.post('/export-pdf', authMiddleware, async (req, res) => {
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

router.post('/export-bulk', authMiddleware, async (req, res) => {
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
    jobStore.set(jobId, {
        generated: successful,
        meta,
        expiresAt: Date.now() + 30 * 60 * 1000
    });

    const errors = allGenerated.filter(g => g.error).length;
    log('info', 'POST /api/generate-all', `Bulk generare completă: ${successful.length} lecții, ${errors} erori`);
    send({ type: 'complete', jobId, total: successful.length, errors });
    res.end();
});


// ── POST /export-zip — ZIP cu câte un DOCX per lecție ────────
router.post('/export-zip', authMiddleware, async (req, res) => {
    const { jobId } = req.body;

    const job = jobStore.get(jobId);
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
router.post('/export-bulk-job', authMiddleware, async (req, res) => {
    const { jobId } = req.body;

    const job = jobStore.get(jobId);
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
