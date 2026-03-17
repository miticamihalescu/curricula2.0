'use strict';
const PDFDocument = require('pdfkit');

/* ── Design constants ─────────────────────────────────────── */
const TEAL   = '#0D9488';
const DARK   = '#1C2938';
const MUTED  = '#66778A';
const BG_HDR = '#D5E8F0';
const BORDER = '#BBCCDD';

/**
 * Build a PDF buffer for one or multiple lessons.
 * @param {Object[]} lessons  - Array of lesson data objects
 * @param {Object}   meta     - { clasa, disciplina, scoala, profesor }
 * @returns {Promise<Buffer>}
 */
function buildPdf(lessons, meta) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                bufferPages: true,
                margins: { top: 55, bottom: 55, left: 72, right: 72 },
                info: {
                    Title:   meta.disciplina ? `Materiale — ${meta.disciplina}` : 'Materiale Curricula',
                    Author:  meta.profesor   || 'Curricula',
                    Creator: 'Curricula 2.0'
                }
            });

            const chunks = [];
            doc.on('data',  b   => chunks.push(b));
            doc.on('end',   ()  => resolve(Buffer.concat(chunks)));
            doc.on('error', err => reject(err));

            const W = doc.page.width - 144; // content width

            /* ── Cover page ─────────────────────────────────── */
            doc.moveDown(5);
            doc.font('Helvetica-Bold').fontSize(20).fillColor(TEAL)
               .text(
                   meta.disciplina
                       ? `Materiale Didactice\n${meta.disciplina}`
                       : 'Materiale Didactice',
                   { align: 'center' }
               );
            doc.moveDown(1.2);

            const coverLines = [
                meta.clasa    ? `Clasa: ${meta.clasa}`                         : null,
                meta.profesor ? `Profesor: ${meta.profesor}`                   : null,
                meta.scoala   ? `Unitatea de învățământ: ${meta.scoala}`       : null,
                `Data generării: ${new Date().toLocaleDateString('ro-RO')}`,
                lessons.length > 1 ? `Nr. lecții incluse: ${lessons.length}`   : null,
            ].filter(Boolean).join('\n');

            doc.font('Helvetica').fontSize(12).fillColor(DARK)
               .text(coverLines, { align: 'center', lineGap: 5 });

            /* ── Lessons ──────────────────────────────────────── */
            for (const lesson of lessons) {
                const {
                    titlu_lectie     = '—',
                    clasa            = meta.clasa     || '—',
                    disciplina       = meta.disciplina || '—',
                    modul            = '—',
                    unitate_invatare = '—',
                    scoala           = meta.scoala    || '—',
                    profesor         = meta.profesor  || '—',
                    proiect_didactic,
                    fisa_lucru,
                    test_evaluare,
                    target           = 'all',
                } = lesson;

                const ctx = { titlu_lectie, clasa, disciplina, modul, unitate_invatare, scoala, profesor };

                const addSection = (sectionTitle, content) => {
                    if (!content) return;
                    doc.addPage();

                    // Section heading
                    doc.font('Helvetica-Bold').fontSize(14).fillColor(TEAL)
                       .text(sectionTitle, { align: 'center' });
                    doc.moveDown(0.25);

                    // Lesson subtitle
                    doc.font('Helvetica-Bold').fontSize(11).fillColor(DARK)
                       .text(titlu_lectie, { align: 'center' });
                    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
                       .text(`${disciplina} · Clasa ${clasa} · ${modul}`, { align: 'center' });
                    doc.moveDown(0.7);

                    drawAntetBox(doc, W, ctx);
                    doc.moveDown(0.8);
                    renderContent(doc, W, content);
                };

                if (target === 'all' || target === 'proiect') addSection('PROIECT DIDACTIC', proiect_didactic);
                if (target === 'all' || target === 'fisa')    addSection('FIȘĂ DE LUCRU',    fisa_lucru);
                if (target === 'all' || target === 'test')    addSection('TEST DE EVALUARE', test_evaluare);
            }

            /* ── Page headers & footers ───────────────────────── */
            const range = doc.bufferedPageRange();
            for (let i = 0; i < range.count; i++) {
                doc.switchToPage(range.start + i);

                // Top rule + header text
                doc.moveTo(72, 40).lineTo(72 + W, 40).lineWidth(0.4).strokeColor(BORDER).stroke();
                doc.font('Helvetica').fontSize(8).fillColor(MUTED)
                   .text(`${meta.scoala || ''}  ·  Curricula 2.0`, 72, 26, { width: W, align: 'center' });

                // Bottom rule + page number
                doc.moveTo(72, doc.page.height - 42).lineTo(72 + W, doc.page.height - 42)
                   .lineWidth(0.4).strokeColor(BORDER).stroke();
                doc.font('Helvetica').fontSize(8).fillColor(MUTED)
                   .text(`Pagina ${i + 1} din ${range.count}`, 72, doc.page.height - 34,
                         { width: W, align: 'center' });
            }

            doc.flushPages();
            doc.end();

        } catch (err) {
            reject(err);
        }
    });
}

/* ── Draw the metadata header box ────────────────────────────── */
function drawAntetBox(doc, W, ctx) {
    const y   = doc.y;
    const H   = 52;
    const pad = 6;
    const col = W / 2;

    // Background + border
    doc.save();
    doc.rect(72, y, W, H).fill(BG_HDR);
    doc.rect(72, y, W, H).lineWidth(0.5).stroke(BORDER);
    doc.moveTo(72 + col, y).lineTo(72 + col, y + H).lineWidth(0.5).stroke(BORDER);
    doc.restore();

    // Left column
    doc.font('Helvetica-Bold').fontSize(8).fillColor(DARK)
       .text('Unitatea de învățământ: ' + (ctx.scoala || '—'), 76, y + pad, { width: col - 8 });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(DARK)
       .text('Cadrul didactic: ' + (ctx.profesor || '—'),       76, y + pad + 20, { width: col - 8 });

    // Right column
    const rx = 72 + col + 4;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(DARK)
       .text('Disciplina: ' + (ctx.disciplina || '—'), rx, y + pad,      { width: col - 8 });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(DARK)
       .text('Clasa: ' + (ctx.clasa || '—'),           rx, y + pad + 14, { width: col - 8 });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(DARK)
       .text('U.I.: ' + (ctx.unitate_invatare || '—'), rx, y + pad + 28, { width: col - 8 });

    // Advance cursor past the box
    doc.y = y + H + 6;
}

/* ── Parse and render plain-text content ─────────────────────── */
function renderContent(doc, W, content) {
    const headingPats = [
        /^COMPETENȚE/i, /^OBIECTIVE/i, /^DESFĂȘURAREA/i,
        /^EVALUARE/i,   /^BAREM/i,     /^VARIANTA/i,
        /^METODE/i,     /^MIJLOACE/i,  /^FORME DE/i,   /^BIBLIOGRAFIE/i,
        /^SUBIECTUL/i,  /^STRATEGIA/i, /^CONȚINUTURI/i,
    ];

    for (const raw of content.split('\n')) {
        const line = raw.trim();
        if (!line) { doc.moveDown(0.22); continue; }

        // Long dash-separator line → horizontal rule
        if (/^-{8,}$/.test(line) || /^={8,}$/.test(line)) {
            doc.moveDown(0.1);
            doc.moveTo(72, doc.y).lineTo(72 + W, doc.y).lineWidth(0.4).strokeColor(BORDER).stroke();
            doc.moveDown(0.2);
            continue;
        }

        if (headingPats.some(p => p.test(line))) {
            doc.moveDown(0.15);
            doc.font('Helvetica-Bold').fontSize(10.5).fillColor(TEAL).text(line, { lineGap: 1 });
            doc.moveDown(0.1);
            continue;
        }

        const isList = /^([0-9]+\.|[a-z]\)|-\s)\s?/i.test(line);
        if (isList) {
            doc.font('Helvetica').fontSize(9.5).fillColor(DARK).text(line, { indent: 12, lineGap: 1 });
        } else {
            doc.font('Helvetica').fontSize(9.5).fillColor(DARK).text(line, { lineGap: 1 });
        }
    }
}

/* ── Public API ───────────────────────────────────────────────── */

/**
 * Generate a single-lesson PDF.
 * @param {Object} data
 * @returns {Promise<Buffer>}
 */
async function generatePdf(data) {
    const meta = {
        clasa:      data.clasa      || '—',
        disciplina: data.disciplina || '—',
        scoala:     data.scoala     || '—',
        profesor:   data.profesor   || '—',
    };
    return buildPdf([data], meta);
}

/**
 * Generate a combined PDF for multiple lessons.
 * @param {{ meta: Object, lessons: Object[] }} param0
 * @returns {Promise<Buffer>}
 */
async function generateBulkPdf({ meta = {}, lessons = [] }) {
    return buildPdf(lessons, meta);
}

module.exports = { generatePdf, generateBulkPdf };
