const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const path = require('path');

const authMiddleware = require('../auth');
const { validators } = require('../middleware/validate');
const { parsePlanificare } = require('../planificare-parser');
const { generateMaterials } = require('../ai-parser');
const { generateDocx, generateBulkDocx } = require('../docx-exporter');
const { generatePdf, generateBulkPdf } = require('../pdf-exporter');
const logger = require('../logger');

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

        const result = parsePlanificare(text);
        const lectii = result.folders || [];
        const metadata = result.metadata || { scoala: '—', profesor: '—' };
        const planId = 'PLAN-' + Date.now().toString(36).toUpperCase();

        log('info', 'POST /api/upload-planificare', `Planificare procesată: ${lectii.length} lecții extrase`);

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

        const result = parsePlanificare(text);
        const lectii = result.folders || [];
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
        const { titlu_lectie, clasa, disciplina, modul, unitate_invatare, scoala, profesor, dificultate, stil_predare, target } = req.body;

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

module.exports = router;
