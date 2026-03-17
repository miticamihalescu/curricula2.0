const docx = require('docx');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, AlignmentType, WidthType, Header, Footer, PageNumber } = docx;

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
        target = 'all'
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

    // Helper to parse text into docx paragraphs
    const parseText = (text) => {
        if (!text) return [];
        const blocks = [];
        const lines = text.split('\n');

        // Patterns that trigger Heading 2
        const headingPatterns = [
            /^COMPETENȚE/i,
            /^OBIECTIVE/i,
            /^DESFĂȘURAREA/i,
            /^EVALUARE/i,
            /^BAREM/i,
            /^VARIANTA/i,
            /^METODE ȘI PROCEDEE/i,
            /^MIJLOACE DE ÎNVĂȚĂMÂNT/i,
            /^FORME DE ORGANIZARE/i,
            /^BIBLIOGRAFIE/i
        ];

        // Pattern for numbered list items: 1., 2., a), b)
        const listPattern = /^([0-9]+\.|[a-z]\))\s+(.*)/i;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            let isHeading = false;
            for (const pattern of headingPatterns) {
                if (pattern.test(line)) {
                    isHeading = true;
                    break;
                }
            }

            if (isHeading) {
                blocks.push(new Paragraph({
                    text: line,
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 240, after: 120 }
                }));
                continue;
            }

            const listMatch = line.match(listPattern);
            if (listMatch) {
                blocks.push(new Paragraph({
                    text: line,
                    spacing: { after: 120 },
                    indent: { left: 720, hanging: 360 } // Hanging indent for list
                }));
                continue;
            }

            // Normal paragraph
            blocks.push(new Paragraph({
                text: line,
                spacing: { after: 120 }
            }));
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

module.exports = { generateDocx, generateBulkDocx };
