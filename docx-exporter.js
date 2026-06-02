const docx = require('docx');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, AlignmentType, WidthType, Header, Footer, PageNumber, ImageRun } = docx;

async function generateDocx(data) {
    const {
        titlu_lectie,
        clasa,
        disciplina,
        modul,
        unitate_invatare,
        scoala,
        profesor,
        proiect_didactic,
        fisa_lucru,
        test_evaluare,
        target = 'all',
        imaginiMap = {}  // { [imageId]: { dataBase64, mimeType, filename } }
    } = data;

    const sections = [];

    // Header and Footer for all pages
    const globalHeader = new Header({
        children: [
            new Paragraph({
                alignment: AlignmentType.BETWEEN,
                children: [
                    new TextRun({ text: scoala || '', size: 18, color: "808080" }),
                    new TextRun({ text: "Curricula", size: 18, color: "808080" })
                ]
            })
        ]
    });

    const globalFooter = new Footer({
        children: [
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    new TextRun({ text: "Pagina ", size: 16 }),
                    new TextRun({ children: [PageNumber.CURRENT], size: 16 })
                ]
            })
        ]
    });

    const sectionProperties = {
        headers: { default: globalHeader },
        footers: { default: globalFooter },
        size: {
            width: 11906, // A4 width in DXA
            height: 16838 // A4 height in DXA
        },
        margins: {
            top: 1440,
            right: 1440,
            bottom: 1440,
            left: 1440
        }
    };

    // 1. Cover Page (if target === 'all')
    if (target === 'all') {
        sections.push({
            properties: sectionProperties,
            children: [
                new Paragraph({
                    text: titlu_lectie || 'Lecție Generată',
                    heading: HeadingLevel.TITLE,
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 4000, after: 800 }
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({ text: `Disciplina: ${disciplina || '-'}`, size: 28, break: 1 }),
                        new TextRun({ text: `Clasa: ${clasa || '-'}`, size: 28, break: 1 }),
                        new TextRun({ text: `Modul: ${modul || '-'}`, size: 28, break: 1 }),
                        new TextRun({ text: `Unitate de învățare: ${unitate_invatare || '-'}`, size: 28, break: 1 }),
                    ],
                    spacing: { after: 4000 }
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({ text: `Profesor: ${profesor || '-'}`, size: 24, break: 1 }),
                        new TextRun({ text: `Școala: ${scoala || '-'}`, size: 24, break: 1 }),
                        new TextRun({ text: `Data generării: ${new Date().toLocaleDateString('ro-RO')}`, size: 24, break: 1 }),
                    ]
                })
            ]
        });
    }

    // Helper to create header table for each section
    const createAntetTable = () => {
        return new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            },
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            shading: { fill: "D5E8F0" },
                            margins: { left: 100, right: 100, top: 100, bottom: 100 },
                            children: [
                                new Paragraph({ children: [new TextRun({ text: "Unitatea de învățământ:", bold: true, size: 22 })] }),
                                new Paragraph({ children: [new TextRun({ text: scoala || '-', size: 22 })] }),
                                new Paragraph({ children: [new TextRun({ text: "Cadrul didactic:", bold: true, size: 22, break: 1 })] }),
                                new Paragraph({ children: [new TextRun({ text: profesor || '-', size: 22 })] }),
                            ]
                        }),
                        new TableCell({
                            shading: { fill: "D5E8F0" },
                            margins: { left: 100, right: 100, top: 100, bottom: 100 },
                            children: [
                                new Paragraph({ children: [new TextRun({ text: "Disciplina:", bold: true, size: 22 })] }),
                                new Paragraph({ children: [new TextRun({ text: disciplina || '-', size: 22 })] }),
                                new Paragraph({ children: [new TextRun({ text: "Clasa:", bold: true, size: 22, break: 1 })] }),
                                new Paragraph({ children: [new TextRun({ text: clasa || '-', size: 22 })] }),
                                new Paragraph({ children: [new TextRun({ text: "Unitatea de învățare:", bold: true, size: 22, break: 1 })] }),
                                new Paragraph({ children: [new TextRun({ text: unitate_invatare || '-', size: 22 })] }),
                            ]
                        })
                    ]
                })
            ]
        });
    };

    // Helper to parse text into docx paragraphs — suportă [IMAGINE:ID] și [SVG_START]...[SVG_END]
    const parseText = (text) => {
        if (!text) return [];
        const blocks = [];

        // Scoatem blocurile SVG înainte de split pe linii
        const segmente = text.split(/(\[SVG_START\][\s\S]*?\[SVG_END\])/g);

        const headingPatterns = [
            /^COMPETENȚE/i, /^OBIECTIVE/i, /^DESFĂȘURAREA/i, /^EVALUARE/i,
            /^BAREM/i, /^VARIANTA/i, /^METODE ȘI PROCEDEE/i,
            /^MIJLOACE DE ÎNVĂȚĂMÂNT/i, /^FORME DE ORGANIZARE/i, /^BIBLIOGRAFIE/i
        ];
        const listPattern = /^([0-9]+\.|[a-z]\))\s+(.*)/i;

        for (const segment of segmente) {
            if (segment.startsWith('[SVG_START]')) {
                // SVG-urile nu pot fi inserate direct în DOCX — adăugăm un placeholder vizual
                blocks.push(new Paragraph({
                    children: [new TextRun({ text: '[ Diagramă — disponibilă în previzualizarea web ]', italics: true, color: '888888', size: 20 })],
                    spacing: { before: 120, after: 120 }
                }));
                continue;
            }

            const lines = segment.split('\n');
            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line) continue;

                // Verificăm dacă linia conține un marker de imagine
                const imgMatch = line.match(/\[IMAGINE:([A-Z0-9\-]+)\]/);
                if (imgMatch) {
                    const imageId = imgMatch[1];
                    const imgData = imaginiMap[imageId];
                    if (imgData?.dataBase64) {
                        try {
                            const imgBuffer = Buffer.from(imgData.dataBase64, 'base64');
                            // Textul din jurul marcajului (fără marcaj)
                            const textFaraMarker = line.replace(/\[IMAGINE:[A-Z0-9\-]+\]/g, '').trim();
                            if (textFaraMarker) {
                                blocks.push(new Paragraph({ text: textFaraMarker, spacing: { after: 80 } }));
                            }
                            blocks.push(new Paragraph({
                                children: [new ImageRun({
                                    data: imgBuffer,
                                    transformation: { width: 400, height: 300 },
                                    type: imgData.mimeType?.includes('png') ? 'png' : 'jpg'
                                })],
                                alignment: AlignmentType.CENTER,
                                spacing: { before: 120, after: 120 }
                            }));
                        } catch {
                            blocks.push(new Paragraph({ text: `[ Imagine: ${imgData.filename || imageId} ]`, spacing: { after: 120 } }));
                        }
                    } else {
                        blocks.push(new Paragraph({ text: `[ Imagine: ${imageId} ]`, spacing: { after: 120 } }));
                    }
                    continue;
                }

                let isHeading = false;
                for (const pattern of headingPatterns) {
                    if (pattern.test(line)) { isHeading = true; break; }
                }
                if (isHeading) {
                    blocks.push(new Paragraph({ text: line, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } }));
                    continue;
                }

                if (listPattern.test(line)) {
                    blocks.push(new Paragraph({ text: line, spacing: { after: 120 }, indent: { left: 720, hanging: 360 } }));
                    continue;
                }

                blocks.push(new Paragraph({ text: line, spacing: { after: 120 } }));
            }
        }

        return blocks;
    };

    const createSection = (title, content, forcePageBreakBefore) => {
        const children = [];

        const headingOpts = {
            text: title,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
        };

        if (forcePageBreakBefore) {
            headingOpts.pageBreakBefore = true;
        }

        children.push(new Paragraph(headingOpts));
        children.push(createAntetTable());
        children.push(new Paragraph({ text: "", spacing: { after: 200 } })); // space after table
        children.push(...parseText(content));

        return {
            properties: sectionProperties,
            children
        };
    };

    if (target === 'all' || target === 'proiect') {
        if (proiect_didactic) {
            sections.push(createSection("PROIECT DIDACTIC", proiect_didactic, target === 'all'));
        }
    }

    if (target === 'all' || target === 'fisa') {
        if (fisa_lucru) {
            sections.push(createSection("FIȘĂ DE LUCRU", fisa_lucru, target === 'all' || sections.length > 0));
        }
    }

    if (target === 'all' || target === 'test') {
        if (test_evaluare) {
            sections.push(createSection("TEST DE EVALUARE", test_evaluare, target === 'all' || sections.length > 0));
        }
    }

    if (sections.length === 0) {
        sections.push({
            properties: sectionProperties,
            children: [new Paragraph("Nu s-au găsit date pentru generarea documentului.")]
        });
    }

    const doc = new Document({
        title: titlu_lectie || "Materiale Curricula",
        styles: {
            default: {
                document: {
                    run: {
                        font: "Arial",
                        size: 22, // 11pt
                    },
                    paragraph: {
                        spacing: {
                            line: 276, // 1.15 line spacing
                        }
                    }
                }
            },
            paragraphStyles: [
                {
                    id: "Title",
                    name: "Title",
                    basedOn: "Normal",
                    next: "Normal",
                    run: { bold: true, size: 48, font: "Arial" }, // 24pt
                    paragraph: { spacing: { after: 240 } }
                },
                {
                    id: "Heading1",
                    name: "Heading 1",
                    basedOn: "Normal",
                    next: "Normal",
                    run: { font: "Arial", size: 32, bold: true }, // 16pt
                    paragraph: { spacing: { before: 240, after: 120 } }
                },
                {
                    id: "Heading2",
                    name: "Heading 2",
                    basedOn: "Normal",
                    next: "Normal",
                    run: { font: "Arial", size: 28, bold: true }, // 14pt
                    paragraph: { spacing: { before: 240, after: 120 } }
                }
            ]
        },
        sections: sections
    });

    return await Packer.toBuffer(doc);
}

/**
 * Generate a single DOCX buffer for multiple lessons (bulk export).
 * @param {{ meta: Object, lessons: Object[] }} param0
 * @returns {Promise<Buffer>}
 */
async function generateBulkDocx({ meta = {}, lessons = [] }) {
    const {
        clasa      = '—',
        disciplina = '—',
        scoala     = '—',
        profesor   = '—',
    } = meta;

    const sections = [];

    const bulkSectionProps = {
        headers: {
            default: new Header({
                children: [new Paragraph({
                    alignment: AlignmentType.BETWEEN,
                    children: [
                        new TextRun({ text: scoala || '', size: 18, color: '808080' }),
                        new TextRun({ text: 'Curricula', size: 18, color: '808080' }),
                    ]
                })]
            })
        },
        footers: {
            default: new Footer({
                children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({ text: 'Pagina ', size: 16 }),
                        new TextRun({ children: [PageNumber.CURRENT], size: 16 }),
                        new TextRun({ text: ' din ', size: 16 }),
                        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16 }),
                    ]
                })]
            })
        },
        size: { width: 11906, height: 16838 },
        margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    };

    // Cover page
    sections.push({
        properties: bulkSectionProps,
        children: [
            new Paragraph({
                text: disciplina ? `Materiale Didactice — ${disciplina}` : 'Materiale Didactice',
                heading: HeadingLevel.TITLE,
                alignment: AlignmentType.CENTER,
                spacing: { before: 4000, after: 800 },
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    new TextRun({ text: `Clasa: ${clasa}`,         size: 26, break: 1 }),
                    new TextRun({ text: `Profesor: ${profesor}`,   size: 26, break: 1 }),
                    new TextRun({ text: `Școala: ${scoala}`,       size: 26, break: 1 }),
                    new TextRun({ text: `Data generării: ${new Date().toLocaleDateString('ro-RO')}`, size: 26, break: 1 }),
                    new TextRun({ text: `Nr. lecții: ${lessons.length}`, size: 26, break: 1 }),
                ],
                spacing: { after: 3200 },
            }),
        ],
    });

    // Shared helpers (re-use parseText from outer scope)
    const makeAntetTable = (lesson) => {
        const s = lesson.scoala     || scoala     || '—';
        const p = lesson.profesor   || profesor   || '—';
        const d = lesson.disciplina || disciplina || '—';
        const c = lesson.clasa      || clasa      || '—';
        const u = lesson.unitate_invatare         || '—';
        return new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
                top:              { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                bottom:           { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                left:             { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                right:            { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
            },
            rows: [new TableRow({
                children: [
                    new TableCell({
                        shading: { fill: 'D5E8F0' },
                        margins: { left: 100, right: 100, top: 100, bottom: 100 },
                        children: [
                            new Paragraph({ children: [new TextRun({ text: 'Unitatea de învățământ:', bold: true, size: 22 })] }),
                            new Paragraph({ children: [new TextRun({ text: s, size: 22 })] }),
                            new Paragraph({ children: [new TextRun({ text: 'Cadrul didactic:', bold: true, size: 22, break: 1 })] }),
                            new Paragraph({ children: [new TextRun({ text: p, size: 22 })] }),
                        ],
                    }),
                    new TableCell({
                        shading: { fill: 'D5E8F0' },
                        margins: { left: 100, right: 100, top: 100, bottom: 100 },
                        children: [
                            new Paragraph({ children: [new TextRun({ text: 'Disciplina:', bold: true, size: 22 })] }),
                            new Paragraph({ children: [new TextRun({ text: d, size: 22 })] }),
                            new Paragraph({ children: [new TextRun({ text: 'Clasa:', bold: true, size: 22, break: 1 })] }),
                            new Paragraph({ children: [new TextRun({ text: c, size: 22 })] }),
                            new Paragraph({ children: [new TextRun({ text: 'Unitatea de învățare:', bold: true, size: 22, break: 1 })] }),
                            new Paragraph({ children: [new TextRun({ text: u, size: 22 })] }),
                        ],
                    }),
                ],
            })],
        });
    };

    const buildSection = (title, content, lesson, first) => {
        if (!content) return null;
        const headingOpts = {
            text: title,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            pageBreakBefore: !first,
        };
        const children = [
            new Paragraph(headingOpts),
            // Lesson subtitle under heading
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: lesson.titlu_lectie || '—', bold: true, size: 24 })],
                spacing: { after: 200 },
            }),
            makeAntetTable(lesson),
            new Paragraph({ text: '', spacing: { after: 200 } }),
            ...parseText(content),
        ];
        return { properties: bulkSectionProps, children };
    };

    for (const lesson of lessons) {
        let sectionCount = 0;
        const addLessonSection = (title, content) => {
            const sec = buildSection(title, content, lesson, sectionCount === 0);
            if (sec) { sections.push(sec); sectionCount++; }
        };
        const t = lesson.target || 'all';
        if (t === 'all' || t === 'proiect') addLessonSection('PROIECT DIDACTIC', lesson.proiect_didactic);
        if (t === 'all' || t === 'fisa')    addLessonSection('FIȘĂ DE LUCRU',    lesson.fisa_lucru);
        if (t === 'all' || t === 'test')    addLessonSection('TEST DE EVALUARE', lesson.test_evaluare);
    }

    if (sections.length <= 1) {
        sections.push({
            properties: bulkSectionProps,
            children: [new Paragraph('Nu există materiale de exportat.')],
        });
    }

    const doc = new Document({
        title: disciplina ? `Materiale — ${disciplina}` : 'Materiale Curricula',
        styles: {
            default: {
                document: {
                    run:       { font: 'Arial', size: 22 },
                    paragraph: { spacing: { line: 276 } },
                }
            },
            paragraphStyles: [
                { id: 'Title',    name: 'Title',    basedOn: 'Normal', next: 'Normal', run: { bold: true, size: 48, font: 'Arial' },       paragraph: { spacing: { after: 240 } } },
                { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', run: { font: 'Arial', size: 32, bold: true },       paragraph: { spacing: { before: 240, after: 120 } } },
                { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', run: { font: 'Arial', size: 28, bold: true },       paragraph: { spacing: { before: 240, after: 120 } } },
            ],
        },
        sections,
    });

    return await Packer.toBuffer(doc);
}

// ═══════════════════════════════════════════════════════════════
// EXPORT PLANIFICARE ANUALĂ — format tabel MEN oficial
// ═══════════════════════════════════════════════════════════════

function cellMEN(text, opts = {}) {
    return new TableCell({
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        shading: opts.header ? { fill: '1a1a2e', color: 'ffffff' } : undefined,
        children: [new Paragraph({
            alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
            children: [new TextRun({
                text: String(text || '—'),
                size: opts.header ? 18 : 17,
                bold: !!opts.header,
                color: opts.header ? 'ffffff' : '1a1a1a',
                font: 'Arial'
            })]
        })]
    });
}

async function exportPlanificareAnuala({ plan, metadata, disciplina, clasa, oreSaptamana, anScolar }) {
    const { scoala, profesor } = metadata || {};
    const lectii = plan.lectii || [];

    // Grupăm lecțiile pe unități de învățare
    const unitatiMap = new Map();
    for (const l of lectii) {
        const key = `${l.modul}||${l.unitate_invatare}`;
        if (!unitatiMap.has(key)) {
            unitatiMap.set(key, {
                modul: l.modul,
                unitate_invatare: l.unitate_invatare,
                competente: l.competente_specifice || [],
                continuturi: new Set(),
                ore: 0,
                saptamani: []
            });
        }
        const u = unitatiMap.get(key);
        if (l.continut) l.continut.split(';').forEach(c => u.continuturi.add(c.trim()));
        u.ore += (l.ore_alocate || 1);
        if (l.saptamana && !u.saptamani.includes(l.saptamana)) u.saptamani.push(l.saptamana);
    }
    const unitati = Array.from(unitatiMap.values());

    // Antet document
    const antetRows = [
        ['Unitatea de învățământ:', scoala || '—', 'Disciplina:', disciplina || plan.disciplina || '—'],
        ['Profesor:', profesor || '—', 'Clasa:', clasa || plan.clasa || '—'],
        ['Anul școlar:', anScolar || '2025-2026', 'Nr. ore/săptămână:', String(oreSaptamana || '—')],
    ];

    const antetTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: antetRows.map(([l1, v1, l2, v2]) => new TableRow({ children: [
            cellMEN(l1, { header: false }), cellMEN(v1), cellMEN(l2, { header: false }), cellMEN(v2)
        ]}))
    });

    // Header tabel planificare
    const headerRow = new TableRow({
        tableHeader: true,
        children: [
            cellMEN('Nr. crt.', { header: true, center: true }),
            cellMEN('Unitatea de învățare', { header: true }),
            cellMEN('Competențe specifice', { header: true }),
            cellMEN('Conținuturi', { header: true }),
            cellMEN('Nr. ore', { header: true, center: true }),
            cellMEN('Săptămâna', { header: true, center: true }),
            cellMEN('Observații', { header: true }),
        ]
    });

    const dataRows = unitati.map((u, i) => new TableRow({ children: [
        cellMEN(String(i + 1), { center: true }),
        cellMEN(u.unitate_invatare),
        cellMEN(u.competente.join('\n')),
        cellMEN(Array.from(u.continuturi).join(';\n') || '—'),
        cellMEN(String(u.ore), { center: true }),
        cellMEN(u.saptamani.length > 0 ? `${u.saptamani[0]} – ${u.saptamani[u.saptamani.length - 1]}` : '—', { center: true }),
        cellMEN(''),
    ]}));

    const planTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...dataRows]
    });

    const doc = new Document({
        styles: { paragraphStyles: [
            { id: 'Normal', name: 'Normal', run: { font: 'Arial', size: 20 } }
        ]},
        sections: [{
            properties: { page: { margin: { top: 720, bottom: 720, left: 1000, right: 1000 } } },
            children: [
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [
                    new TextRun({ text: 'PLANIFICARE ANUALĂ', bold: true, size: 28, font: 'Arial' })
                ]}),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [
                    new TextRun({ text: `${disciplina || plan.disciplina} — Clasa ${clasa || plan.clasa} — An școlar ${anScolar || '2025-2026'}`, size: 22, font: 'Arial' })
                ]}),
                antetTable,
                new Paragraph({ spacing: { before: 300, after: 200 }, children: [] }),
                planTable,
                new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.RIGHT, children: [
                    new TextRun({ text: `Profesor: ${profesor || '____________________'}`, size: 20, font: 'Arial' })
                ]}),
            ]
        }]
    });

    return await Packer.toBuffer(doc);
}

// ═══════════════════════════════════════════════════════════════
// EXPORT PLANIFICARE CALENDARISTICĂ — format detaliat per lecție
// ═══════════════════════════════════════════════════════════════

async function exportPlanificareCalendaristica({ plan, metadata, disciplina, clasa, oreSaptamana, anScolar }) {
    const { scoala, profesor } = metadata || {};
    const lectii = plan.lectii || [];

    const antetRows = [
        ['Unitatea de învățământ:', scoala || '—', 'Disciplina:', disciplina || plan.disciplina || '—'],
        ['Profesor:', profesor || '—', 'Clasa:', clasa || plan.clasa || '—'],
        ['Anul școlar:', anScolar || '2025-2026', 'Nr. ore/săptămână:', String(oreSaptamana || '—')],
    ];

    const antetTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: antetRows.map(([l1, v1, l2, v2]) => new TableRow({ children: [
            cellMEN(l1), cellMEN(v1), cellMEN(l2), cellMEN(v2)
        ]}))
    });

    const headerRow = new TableRow({
        tableHeader: true,
        children: [
            cellMEN('Nr.', { header: true, center: true }),
            cellMEN('Unitatea de învățare', { header: true }),
            cellMEN('Subiectul lecției', { header: true }),
            cellMEN('Conținuturi', { header: true }),
            cellMEN('Tipul lecției', { header: true, center: true }),
            cellMEN('Competențe specifice', { header: true }),
            cellMEN('Ore', { header: true, center: true }),
            cellMEN('Săptămâna', { header: true, center: true }),
            cellMEN('Data', { header: true, center: true }),
            cellMEN('Obs.', { header: true }),
        ]
    });

    const dataRows = lectii.map((l, i) => new TableRow({ children: [
        cellMEN(String(i + 1), { center: true }),
        cellMEN(l.unitate_invatare || '—'),
        cellMEN(l.titlu_lectie || '—'),
        cellMEN(l.continut || '—'),
        cellMEN(l.tip_ora || '—', { center: true }),
        cellMEN((l.competente_specifice || []).join(', ')),
        cellMEN(String(l.ore_alocate || 1), { center: true }),
        cellMEN(l.saptamana || '—', { center: true }),
        cellMEN(l.perioada || '—', { center: true }),
        cellMEN(''),
    ]}));

    const planTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...dataRows]
    });

    const doc = new Document({
        styles: { paragraphStyles: [
            { id: 'Normal', name: 'Normal', run: { font: 'Arial', size: 20 } }
        ]},
        sections: [{
            properties: { page: { margin: { top: 720, bottom: 720, left: 800, right: 800 }, orientation: 'landscape' } },
            children: [
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [
                    new TextRun({ text: 'PLANIFICARE CALENDARISTICĂ', bold: true, size: 28, font: 'Arial' })
                ]}),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [
                    new TextRun({ text: `${disciplina || plan.disciplina} — Clasa ${clasa || plan.clasa} — An școlar ${anScolar || '2025-2026'}`, size: 22, font: 'Arial' })
                ]}),
                antetTable,
                new Paragraph({ spacing: { before: 300, after: 200 }, children: [] }),
                planTable,
                new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.RIGHT, children: [
                    new TextRun({ text: `Profesor: ${profesor || '____________________'}`, size: 20, font: 'Arial' })
                ]}),
            ]
        }]
    });

    return await Packer.toBuffer(doc);
}

module.exports = { generateDocx, generateBulkDocx, exportPlanificareAnuala, exportPlanificareCalendaristica };
