const express = require('express');
const router = express.Router();
const authMiddleware = require('../auth');
const checkProExport = require('../middleware/checkProExport');
const { generateDocx, generateBulkDocx } = require('../docx-exporter');
const { generatePdf, generateBulkPdf } = require('../pdf-exporter');
const { getImageById } = require('../db');
const logger = require('../logger');

const log = (level, route, msg, err) => {
    const meta = { route };
    if (err) meta.error = err.message || String(err);
    logger[level]({ message: msg, ...meta });
};

// POST /api/export-docx — export o singură lecție ca DOCX
router.post('/export-docx', authMiddleware, checkProExport, async (req, res) => {
    try {
        const {
            titlu_lectie, clasa, disciplina, modul, unitate_invatare,
            scoala, profesor, proiect_didactic, fisa_lucru, test_evaluare,
            target = 'all', imageIds = []
        } = req.body;

        // Încarcă imaginile selectate (max 5)
        let imaginiMap = {};
        if (Array.isArray(imageIds) && imageIds.length > 0) {
            const imgs = await Promise.all(imageIds.slice(0, 5).map(id => getImageById(id, req.user.userId)));
            imgs.filter(Boolean).forEach(img => {
                imaginiMap[img.id] = { dataBase64: img.dataBase64, mimeType: img.mimeType, filename: img.filename };
            });
        }

        const buffer = await generateDocx({
            titlu_lectie, clasa, disciplina, modul, unitate_invatare,
            scoala, profesor, proiect_didactic, fisa_lucru, test_evaluare,
            target, imaginiMap
        });

        const safeName = (titlu_lectie || 'material').replace(/[^\w\-\s]/g, '').trim().replace(/\s+/g, '_').substring(0, 60);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}.docx"`);
        res.send(buffer);

        log('info', 'POST /api/export-docx', `DOCX generat: "${titlu_lectie}" (userId=${req.user.userId})`);
    } catch (err) {
        log('error', 'POST /api/export-docx', 'Eroare la generarea DOCX', err);
        res.status(500).json({ success: false, error: 'Eroare la generarea documentului DOCX.' });
    }
});

// POST /api/export-bulk — export mai multe lecții (DOCX sau PDF)
router.post('/export-bulk', authMiddleware, checkProExport, async (req, res) => {
    try {
        const { format = 'docx', meta = {}, lessons = [] } = req.body;

        if (!['docx', 'pdf'].includes(format)) {
            return res.status(400).json({ success: false, error: 'Format invalid. Valori acceptate: docx, pdf.' });
        }

        if (!Array.isArray(lessons) || lessons.length === 0) {
            return res.status(400).json({ success: false, error: 'Lista de lecții este goală.' });
        }

        const disc = (meta.disciplina || 'materiale').replace(/[^\w\-\s]/g, '').trim().replace(/\s+/g, '_').substring(0, 40);

        if (format === 'pdf') {
            const buffer = await generateBulkPdf({ meta, lessons });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="toate-materialele-${disc}.pdf"`);
            res.send(buffer);
        } else {
            const buffer = await generateBulkDocx({ meta, lessons });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.setHeader('Content-Disposition', `attachment; filename="toate-materialele-${disc}.docx"`);
            res.send(buffer);
        }

        log('info', 'POST /api/export-bulk', `Bulk ${format.toUpperCase()} generat: ${lessons.length} lecții (userId=${req.user.userId})`);
    } catch (err) {
        log('error', 'POST /api/export-bulk', 'Eroare la generarea bulk', err);
        res.status(500).json({ success: false, error: 'Eroare la generarea documentului.' });
    }
});

module.exports = router;
