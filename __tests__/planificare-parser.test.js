'use strict';

const { parsePlanificare, extractMetadata } = require('../planificare-parser');

// ─── Text de planificare reprezentativ ───────────────────────────────────────
const SAMPLE_TEXT = `
UNITATEA DE ÎNVĂȚĂMÂNT: Liceul Teoretic "Mihai Eminescu"
DISCIPLINA: Informatică
PROFESOR: Ion Popescu
CLASA: a IX-a B
AN ȘCOLAR: 2025-2026

Modulul I
1. Structura unui sistem de calcul
S1–S7   08.09-24.10.2025
7

Normele de securitate și protecție a muncii în laborator
Structura generală a unui sistem de calcul. Istoric.
Hardware, software
Placa de bază, CPU, RAM, ROM
Recapitulare Modul I
Evaluare sumativă Modul I
`;

const SAMPLE_MULTI_MODULE = `
DISCIPLINA: Matematică
PROFESOR: Maria Ionescu
CLASA: a X-a A

Modulul I
1. Algebra
S1–S4   08.09-03.10.2025
4
Mulțimi și operații
Relații de ordine
Evaluare Modul I

Modulul II
2. Geometrie
S5–S9   06.10-07.11.2025
5
Puncte, drepte și plane
Recapitulare Modul II
`;

// ─── extractMetadata ─────────────────────────────────────────────────────────
describe('extractMetadata', () => {
    test('extrage disciplina corect', () => {
        expect(extractMetadata(SAMPLE_TEXT).disciplina).toBe('Informatică');
    });

    test('extrage profesorul corect', () => {
        expect(extractMetadata(SAMPLE_TEXT).profesor).toBe('Ion Popescu');
    });

    test('extrage clasa corect', () => {
        expect(extractMetadata(SAMPLE_TEXT).clasa).toBe('a IX-a B');
    });

    test('extrage școala corect', () => {
        expect(extractMetadata(SAMPLE_TEXT).scoala).toBe('Liceul Teoretic "Mihai Eminescu"');
    });

    test('extrage anul școlar corect', () => {
        expect(extractMetadata(SAMPLE_TEXT).anScolar).toBe('2025-2026');
    });

    test('returnează undefined pentru câmpuri lipsă', () => {
        const meta = extractMetadata('Text fără structură');
        expect(meta.disciplina).toBeUndefined();
        expect(meta.profesor).toBeUndefined();
        expect(meta.clasa).toBeUndefined();
        expect(meta.scoala).toBeUndefined();
    });

    test('detectează Săptămâna Verde din Observații', () => {
        const text = 'S20 – Săptămâna Verde\n' + SAMPLE_TEXT;
        const meta = extractMetadata(text);
        expect(meta.saptamaniSpeciale['S20']).toBe('Săptămâna Verde');
    });

    test('detectează Școala Altfel din Observații', () => {
        const text = 'S15 – Școala Altfel\n' + SAMPLE_TEXT;
        const meta = extractMetadata(text);
        expect(meta.saptamaniSpeciale['S15']).toBe('Școala Altfel');
    });

    test('returnează saptamaniSpeciale ca obiect gol când nu există', () => {
        const meta = extractMetadata(SAMPLE_TEXT);
        expect(meta.saptamaniSpeciale).toBeDefined();
        expect(typeof meta.saptamaniSpeciale).toBe('object');
    });
});

// ─── parsePlanificare — structura returnată ───────────────────────────────────
describe('parsePlanificare — structura rezultat', () => {
    let result;

    beforeAll(() => {
        result = parsePlanificare(SAMPLE_TEXT);
    });

    test('returnează obiect cu cheile { metadata, folders }', () => {
        expect(result).toHaveProperty('metadata');
        expect(result).toHaveProperty('folders');
    });

    test('folders este un array', () => {
        expect(Array.isArray(result.folders)).toBe(true);
    });

    test('folders nu este gol pentru text valid', () => {
        expect(result.folders.length).toBeGreaterThan(0);
    });

    test('fiecare folder are câmpurile obligatorii', () => {
        result.folders.forEach(f => {
            expect(f).toHaveProperty('id_folder');
            expect(f).toHaveProperty('saptamana');
            expect(f).toHaveProperty('modul');
            expect(f).toHaveProperty('tip_ora');
            expect(f).toHaveProperty('nume_lectie');
            expect(f).toHaveProperty('data');
            expect(f).toHaveProperty('categorie');
        });
    });

    test('id_folder începe de la 1 și este incrementat continuu', () => {
        expect(result.folders[0].id_folder).toBe(1);
        result.folders.forEach((f, i) => {
            expect(f.id_folder).toBe(i + 1);
        });
    });

    test('metadatele din rezultat corespund textului', () => {
        expect(result.metadata.disciplina).toBe('Informatică');
        expect(result.metadata.profesor).toBe('Ion Popescu');
    });
});

// ─── parsePlanificare — clasificare tip oră ───────────────────────────────────
describe('parsePlanificare — clasificare tip oră', () => {
    let folders;

    beforeAll(() => {
        folders = parsePlanificare(SAMPLE_TEXT).folders;
    });

    test('lecție cu "Evaluare sumativă" are tip_ora = Evaluare', () => {
        const evaluare = folders.find(f => /evaluare sumativ/i.test(f.nume_lectie));
        expect(evaluare).toBeDefined();
        expect(evaluare.tip_ora).toBe('Evaluare');
    });

    test('lecție cu "Recapitulare" are tip_ora = Recapitulare', () => {
        const recap = folders.find(f => /^recapitulare/i.test(f.nume_lectie));
        expect(recap).toBeDefined();
        expect(recap.tip_ora).toBe('Recapitulare');
    });

    test('lecție normală are tip_ora = Predare', () => {
        const predare = folders.find(f => /structura generală/i.test(f.nume_lectie));
        expect(predare).toBeDefined();
        expect(predare.tip_ora).toBe('Predare');
    });
});

// ─── parsePlanificare — via helper intern (tip_ora direct) ───────────────────
describe('classifyLessonType (prin parsePlanificare)', () => {
    function parseSingleLesson(lessonName) {
        const text = `DISCIPLINA: Test\n\nModulul I\n1. Modul test\nS1–S3\n${lessonName}\n`;
        const { folders } = parsePlanificare(text);
        return folders[0]?.tip_ora;
    }

    test('"Evaluare sumativă" → Evaluare', () => {
        expect(parseSingleLesson('Evaluare sumativă')).toBe('Evaluare');
    });

    test('"Evaluare finală" → Evaluare', () => {
        expect(parseSingleLesson('Evaluare finală')).toBe('Evaluare');
    });

    test('"Recapitulare curentă" → Recapitulare', () => {
        expect(parseSingleLesson('Recapitulare curentă')).toBe('Recapitulare');
    });

    test('"Noțiunea de algoritm" → Predare', () => {
        expect(parseSingleLesson('Noțiunea de algoritm')).toBe('Predare');
    });

    test('"Structuri de date liniare" → Predare', () => {
        expect(parseSingleLesson('Structuri de date liniare')).toBe('Predare');
    });
});

// ─── parsePlanificare — module multiple ──────────────────────────────────────
describe('parsePlanificare — module multiple', () => {
    let result;

    beforeAll(() => {
        result = parsePlanificare(SAMPLE_MULTI_MODULE);
    });

    test('parsează lecții din ambele module', () => {
        const module1 = result.folders.filter(f => f.modul === 'Modul I');
        const module2 = result.folders.filter(f => f.modul === 'Modul II');
        expect(module1.length).toBeGreaterThan(0);
        expect(module2.length).toBeGreaterThan(0);
    });

    test('modul este populat corect pe foldere', () => {
        result.folders.forEach(f => {
            expect(f.modul).toMatch(/Modul (I|II)/);
        });
    });

    test('id_folder rămâne unic și crescător pe toate modulele', () => {
        const ids = result.folders.map(f => f.id_folder);
        const unique = new Set(ids);
        expect(unique.size).toBe(ids.length);
        ids.forEach((id, i) => {
            if (i > 0) expect(id).toBeGreaterThan(ids[i - 1]);
        });
    });
});

// ─── parsePlanificare — cazuri limită ────────────────────────────────────────
describe('parsePlanificare — cazuri limită', () => {
    test('text gol → folders gol', () => {
        expect(parsePlanificare('').folders).toEqual([]);
    });

    test('text fără module → folders gol', () => {
        expect(parsePlanificare('Text aleatoriu fără structură.').folders).toHaveLength(0);
    });

    test('text cu Recapitulare finală → lecțiile sunt parsate', () => {
        const text = SAMPLE_TEXT + '\nRecapitulare finală\n';
        const { folders } = parsePlanificare(text);
        const recap = folders.find(f => /recapitulare finală/i.test(f.modul) || /recapitulare/i.test(f.nume_lectie));
        expect(recap).toBeDefined();
    });

    test('nu generează id_folder duplicate la text lung', () => {
        const longText = SAMPLE_MULTI_MODULE.repeat(3);
        const { folders } = parsePlanificare(longText);
        const ids = folders.map(f => f.id_folder);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
