/**
 * ai-parser.js — Parser PRINCIPAL (Gemini AI)
 *
 * Parsează textul unei planificări anuale folosind Google Gemini AI.
 * Este singurul parser apelat în mod normal.
 *
 * planificare-parser.js există separat ca fallback regex pur —
 * folosit DOAR dacă AI-ul eșuează (vezi routes/upload.js).
 * Nu șterge planificare-parser.js: are teste dedicate și e importat explicit ca fallback.
 */

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('./logger');
const { PROFESOR_SYSTEM_PROMPT } = require('./prompts/system');

// ── Prompturi încărcate din fișiere (editabile fără a atinge codul) ──────────
const EXTRACT_PROMPT        = fs.readFileSync(path.join(__dirname, 'prompts/extract-lectii.txt'), 'utf8');
const PROMPT_PROIECT        = fs.readFileSync(path.join(__dirname, 'prompts/proiect-didactic.txt'), 'utf8');
const PROMPT_FISA           = fs.readFileSync(path.join(__dirname, 'prompts/fisa-lucru.txt'), 'utf8');
const TEST_TEMPLATE         = fs.readFileSync(path.join(__dirname, 'prompts/test-evaluare.txt'), 'utf8');
const PLANIFICARE_TEMPLATE  = fs.readFileSync(path.join(__dirname, 'prompts/genereaza-planificare.txt'), 'utf8');

// ── Referințe și competențe din programa MEN (docs/exemple-lectii/) ──────────
const EXEMPLE_DIR = path.join(__dirname, 'docs/exemple-lectii');

function incarcaFisierExemplu(numeFisier) {
    try {
        return fs.readFileSync(path.join(EXEMPLE_DIR, numeFisier), 'utf8');
    } catch (_) {
        return null;
    }
}

// Selectează fișierul de competențe potrivit pentru disciplina dată
function getCompetenteDisciplina(disciplina) {
    if (!disciplina) return null;
    const d = disciplina.toLowerCase();
    if (d.includes('român') || d.includes('romana') || d.includes('literatura') || d.includes('clr') || d.includes('comunicare')) {
        return incarcaFisierExemplu('competente-limba-romana-v-viii.md');
    }
    if (d.includes('matem')) {
        return incarcaFisierExemplu('competente-matematica-v-viii.md');
    }
    if (d.includes('fizi') || d.includes('chim') || d.includes('biolog')) {
        return incarcaFisierExemplu('competente-stiinte.md');
    }
    if (d.includes('istor') || d.includes('geograf') || d.includes('informatic') || d.includes('tic') || d.includes('sport') || d.includes('muzic') || d.includes('arte')) {
        return incarcaFisierExemplu('competente-alte-discipline.md');
    }
    return null;
}

// Returnează subdirectorul de exemple corespunzător disciplinei
function getSubdirDisciplina(disciplina) {
    if (!disciplina) return null;
    const d = disciplina.toLowerCase();
    if (d.includes('român') || d.includes('romana') || d.includes('literatura') || d.includes('clr') || d.includes('comunicare')) return 'romana';
    if (d.includes('matem')) return 'matematica';
    if (d.includes('fizic')) return 'fizica';
    if (d.includes('chim')) return 'chimie';
    if (d.includes('biolog')) return 'biologie';
    if (d.includes('geograf')) return 'geografie';
    if (d.includes('istor')) return 'istorie';
    if (d.includes('informatic') || d.includes('tic')) return 'informatica';
    if (d.includes('englez') || d.includes('engl') || d.includes('engleza')) return 'engleza';
    if (d.includes('sport') || d.includes('fizic') || d.includes('ed. fiz')) return 'ed-fizica';
    if (d.includes('muzic') || d.includes('arte') || d.includes('plastic')) return 'arte-muzica';
    return null;
}

// Încarc un exemplu de proiect didactic din subdirectorul disciplinei (primul găsit)
function incarcaExempluDisciplina(disciplina) {
    const subdir = getSubdirDisciplina(disciplina);
    if (!subdir) return null;
    const subdirPath = path.join(EXEMPLE_DIR, subdir);
    try {
        const subdirs = ['primar', 'gimnaziu', 'liceu', ''];
        for (const sub of subdirs) {
            const dirPath = sub ? path.join(subdirPath, sub) : subdirPath;
            if (!fs.existsSync(dirPath)) continue;
            const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md') && f.startsWith('proiect'));
            if (files.length > 0) {
                return fs.readFileSync(path.join(dirPath, files[0]), 'utf8');
            }
        }
    } catch (_) {}
    return null;
}

// Construiește contextul cu exemple și competențe relevante pentru disciplina dată
function buildExempleContext(disciplina) {
    const competente = getCompetenteDisciplina(disciplina);
    const modelProiect = incarcaFisierExemplu('model-proiect-didactic.md');
    const exempluDisciplina = incarcaExempluDisciplina(disciplina);

    let context = '';
    if (competente) {
        context += `\n\n--- COMPETENȚE SPECIFICE DIN PROGRAMA MEN (referință pentru selectare) ---\n${competente}\n--- SFÂRȘIT COMPETENȚE ---\n`;
    }
    if (modelProiect) {
        context += `\n\n--- MODEL OFICIAL PROIECT DIDACTIC (structură și note de calitate) ---\n${modelProiect}\n--- SFÂRȘIT MODEL ---\n`;
    }
    if (exempluDisciplina) {
        context += `\n\n--- EXEMPLU REAL PROIECT DIDACTIC PENTRU ACEASTĂ DISCIPLINĂ (inspirație pentru conținut și terminologie) ---\n${exempluDisciplina}\n--- SFÂRȘIT EXEMPLU ---\n`;
    }
    return context;
}

// PROMPT_TEST rămâne funcție pentru a injecta tipul testului în template
const PROMPT_TEST = (tip_test) => {
    const tipDesc = {
        'initial':  'INIȚIAL (se aplică la începutul unității/anului pentru a evalua cunoștințele anterioare)',
        'formativ': 'FORMATIV (se aplică pe parcursul predării pentru a verifica înțelegerea)',
        'sumativ':  'SUMATIV (se aplică la sfârșitul unității de învățare pentru evaluare finală)'
    }[tip_test] || 'FORMATIV';
    const tipUpper = tip_test ? tip_test.toUpperCase() : 'FORMATIV';
    return TEST_TEMPLATE.replace(/\{\{TIP_DESC\}\}/g, tipDesc).replace(/\{\{TIP_UPPER\}\}/g, tipUpper);
};


const GENERATE_PROMPT_SINGLE = (target, tip_test, disciplina) => {
    const exempleCtx = buildExempleContext(disciplina);
    if (target === 'proiect') {
        return `${PROMPT_PROIECT}${exempleCtx}\n\nRETURNEAZĂ un obiect JSON valid cu exact 1 câmp:\n{"proiect_didactic": "..."}\nDatele lecției sunt oferite mai jos. NU PUNE TEXT ÎNAINTE SAU DUPĂ JSON. FĂRĂ markdown.`;
    } else if (target === 'fisa') {
        const modelFisa = incarcaFisierExemplu('model-fisa-de-lucru.md') || '';
        const fisaCtx = modelFisa ? `\n\n--- MODEL FIȘĂ DE LUCRU (structură de referință) ---\n${modelFisa}\n--- SFÂRȘIT MODEL FIȘĂ ---\n` : '';
        const competenteCtx = getCompetenteDisciplina(disciplina) ? `\n\n--- COMPETENȚE SPECIFICE MEN ---\n${getCompetenteDisciplina(disciplina)}\n--- SFÂRȘIT COMPETENȚE ---\n` : '';
        return `${PROMPT_FISA}${fisaCtx}${competenteCtx}\n\nRETURNEAZĂ un obiect JSON valid cu exact 1 câmp:\n{"fisa_lucru": "..."}\nDatele lecției sunt oferite mai jos. NU PUNE TEXT ÎNAINTE SAU DUPĂ JSON. FĂRĂ markdown.`;
    } else if (target === 'test') {
        const modelTest = incarcaFisierExemplu('model-test-evaluare.md') || '';
        const testCtx = modelTest ? `\n\n--- MODEL TEST DE EVALUARE (structură de referință) ---\n${modelTest}\n--- SFÂRȘIT MODEL TEST ---\n` : '';
        const competenteCtx = getCompetenteDisciplina(disciplina) ? `\n\n--- COMPETENȚE SPECIFICE MEN ---\n${getCompetenteDisciplina(disciplina)}\n--- SFÂRȘIT COMPETENȚE ---\n` : '';
        return `${PROMPT_TEST(tip_test)}${testCtx}${competenteCtx}\n\nRETURNEAZĂ un obiect JSON valid cu exact 1 câmp:\n{"test_evaluare": "..."}\nDatele lecției sunt oferite mai jos. NU PUNE TEXT ÎNAINTE SAU DUPĂ JSON. FĂRĂ markdown.`;
    }
    // fallback: all
    return `${PROMPT_PROIECT}\n\n${PROMPT_FISA}\n\n${PROMPT_TEST(tip_test)}${exempleCtx}\n\nRETURNEAZĂ un obiect JSON cu câmpurile: "proiect_didactic", "fisa_lucru", "test_evaluare". NU PUNE TEXT ÎNAINTE SAU DUPĂ JSON. FĂRĂ markdown.`;
};


/**
 * Încearcă să repare un JSON trunchiat returnat de Gemini când răspunsul
 * depășește maxOutputTokens. Extrage obiectele complete din array-ul "lectii".
 * Returnează { metadata, lectii } sau null dacă nu poate repara.
 */
function reparaJsonTrunchiat(text) {
    try {
        // Extrage metadata dacă există
        let metadata = { scoala: '—', profesor: '—' };
        const metaMatch = text.match(/"metadata"\s*:\s*(\{[^}]+\})/);
        if (metaMatch) {
            try { metadata = JSON.parse(metaMatch[1]); } catch (_) {}
        }

        // Găsim array-ul lectii și extragem obiectele complete (terminate cu "}")
        const lectiiStart = text.indexOf('"lectii"');
        if (lectiiStart === -1) return null;

        const arrayStart = text.indexOf('[', lectiiStart);
        if (arrayStart === -1) return null;

        // Colectăm obiectele complete din array, ignorând ultimul (care e trunchiat)
        const lectii = [];
        let depth = 0;
        let objStart = -1;

        for (let i = arrayStart + 1; i < text.length; i++) {
            const ch = text[i];
            if (ch === '{') {
                if (depth === 0) objStart = i;
                depth++;
            } else if (ch === '}') {
                depth--;
                if (depth === 0 && objStart !== -1) {
                    try {
                        const obj = JSON.parse(text.substring(objStart, i + 1));
                        lectii.push(obj);
                    } catch (_) {}
                    objStart = -1;
                }
            }
        }

        if (lectii.length === 0) return null;
        logger.info(`JSON reparat: ${lectii.length} lecții extrase din răspuns trunchiat`);
        return { metadata, lectii };
    } catch (e) {
        return null;
    }
}

// Retry cu backoff exponențial pentru erori temporare Gemini (503, 429).
async function withRetry(fn, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (err) {
            const e503 = err.message?.includes('503') || err.message?.includes('Service Unavailable');
            const e429 = err.message?.includes('429') || err.message?.includes('quota');
            if ((e503 || e429) && i < maxRetries - 1) {
                const delay = (i + 1) * 4000; // 4s, 8s
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw err;
        }
    }
}

// Trimite un singur chunk de text la Gemini și returnează { metadata, lectii }.
async function parseChunk(model, textChunk, nrChunk, totalChunks, contextAnterior) {
    let notaChunk = '';
    if (totalChunks > 1) {
        notaChunk = `\n\nATENȚIE: Acesta este fragmentul ${nrChunk} din ${totalChunks} al planificării. Extrage lecțiile DOAR din acest fragment, nu repeta lecții din alte fragmente.`;
        if (contextAnterior) {
            notaChunk += `\nContext din fragmentele anterioare: ultimul modul găsit = "${contextAnterior.ultimulModul}", ultima săptămână = "${contextAnterior.ultimaSaptamana}", ${contextAnterior.nrLectiiGasite} lecții extrase până acum. Continuă de la unde s-a oprit — nu reextrage lecții deja procesate.`;
        }
        notaChunk += '\n\n';
    }
    const prompt = `${EXTRACT_PROMPT}${notaChunk}\n\n--- TEXTUL PLANIFICĂRII ---\n\n${textChunk}`;

    const result = await withRetry(() => model.generateContent(prompt));
    const responseText = result.response.text();

    let parsed;
    try {
        parsed = JSON.parse(responseText);
    } catch (_) {
        parsed = reparaJsonTrunchiat(responseText);
    }
    if (!parsed) return null;

    const lectii = Array.isArray(parsed.lectii) ? parsed.lectii : (Array.isArray(parsed) ? parsed : []);
    const metadata = parsed.metadata || { scoala: '—', profesor: '—' };
    return { metadata, lectii };
}

// Împarte textul în chunks de maxim `limitaChars` caractere,
// tăind întotdeauna la granița de linie (nu în mijlocul unui rând).
function imparteInChunks(text, limitaChars) {
    const linii = text.split('\n');
    const chunks = [];
    let chunk = '';

    for (const linie of linii) {
        const adaos = (chunk ? '\n' : '') + linie;
        if (chunk.length + adaos.length > limitaChars && chunk) {
            chunks.push(chunk);
            chunk = linie;
        } else {
            chunk += adaos;
        }
    }
    if (chunk.trim()) chunks.push(chunk);
    return chunks;
}

// Mergeaza rezultatele din mai multe chunk-uri:
// - metadata: prima valoare ne-"—" câștigă
// - lectii: concatenare cu deduplicare după (modul + titlu normalizat) și renumerotare ID
function mergeazaRezultate(rezultate) {
    let metadata = { scoala: '—', profesor: '—' };
    const toateLectiile = [];
    const vazute = new Set();

    for (const r of rezultate) {
        if (!r) continue;
        if (metadata.scoala === '—' && r.metadata.scoala !== '—') metadata.scoala = r.metadata.scoala;
        if (metadata.profesor === '—' && r.metadata.profesor !== '—') metadata.profesor = r.metadata.profesor;

        for (const lectie of r.lectii) {
            // Cheie de deduplicare: modul + titlu normalizat (lowercase, fără spații extra)
            const cheie = `${lectie.modul || ''}|${(lectie.titlu_lectie || '').toLowerCase().trim()}`;
            if (!vazute.has(cheie)) {
                vazute.add(cheie);
                toateLectiile.push(lectie);
            }
        }
    }

    // Renumerotare ID-uri secvențiale după merge
    toateLectiile.forEach((l, i) => { l.id = i + 1; });
    return { metadata, lectii: toateLectiile };
}

async function parsePlanificareAI(text) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY lipsește din .env');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
            temperature: 0.1,
            topP: 0.95,
            maxOutputTokens: 65536,
            responseMimeType: 'application/json'
        }
    });

    // Trunchiăm textul la secțiunea de planificare calendaristică.
    // Documentele românești conțin adesea și "Proiectarea unităților de învățare"
    // care dublează textul inutil.
    const MARCATORI_SFARSIT_PLANIFICARE = [
        'PROIECTAREA UNITĂŢILOR',
        'PROIECTAREA UNITĂȚILOR',
        'Proiectarea unităților',
        'PROIECT DE LECȚIE',
        'Proiect de lecție',
    ];
    let textPentruAI = text;
    for (const marcator of MARCATORI_SFARSIT_PLANIFICARE) {
        const idx = text.indexOf(marcator);
        if (idx > 2000) {
            textPentruAI = text.substring(0, idx);
            logger.info(`Text trunchiat la "${marcator}" (${idx} din ${text.length} chars)`);
            break;
        }
    }

    // Limita per chunk: 15000 chars — noul parser compact permite mai mult decât 10000
    const LIMITA_CHUNK = 15000;

    if (textPentruAI.length <= LIMITA_CHUNK) {
        // Planificare mică — un singur apel AI
        logger.info(`Trimit planificarea la Gemini AI (${textPentruAI.length} chars)...`);
        const rezultat = await parseChunk(model, textPentruAI, 1, 1);

        if (!rezultat || !rezultat.lectii.length) {
            throw new Error('AI-ul nu a returnat nicio lecție.');
        }
        logger.info('Gemini AI a extras planificarea', { lectiiCount: rezultat.lectii.length });
        return rezultat;
    }

    // Planificare mare — împărțim în chunks și mergem rezultatele
    const chunks = imparteInChunks(textPentruAI, LIMITA_CHUNK);
    logger.info(`Planificare mare (${textPentruAI.length} chars) — procesare în ${chunks.length} chunk-uri`);

    const rezultate = [];
    let contextAnterior = null;
    for (let i = 0; i < chunks.length; i++) {
        logger.info(`Procesez chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);
        const r = await parseChunk(model, chunks[i], i + 1, chunks.length, contextAnterior);
        if (r && r.lectii.length > 0) {
            rezultate.push(r);
            // Construim contextul pentru chunk-ul următor
            const ultimaLectie = r.lectii[r.lectii.length - 1];
            const totalGasite = rezultate.reduce((sum, rz) => sum + rz.lectii.length, 0);
            contextAnterior = {
                ultimulModul: ultimaLectie.modul || '—',
                ultimaSaptamana: ultimaLectie.saptamana || '—',
                nrLectiiGasite: totalGasite
            };
        }
    }

    const merged = mergeazaRezultate(rezultate);

    if (!merged.lectii.length) {
        throw new Error('AI-ul nu a returnat nicio lecție după procesarea tuturor chunk-urilor.');
    }

    logger.info('Gemini AI a extras planificarea (multi-chunk)', {
        chunks: chunks.length,
        lectiiCount: merged.lectii.length
    });
    return merged;
}


// ── System prompt global pentru generarea materialelor ────
// Discipline la care generăm automat diagrame SVG
const DISCIPLINE_EXACTE = ['fizică', 'fizica', 'chimie', 'chimia', 'matematică', 'matematica', 'biologie', 'biologia', 'informatică', 'informatica'];

function esteDisiplinaExacta(disciplina) {
    if (!disciplina) return false;
    const d = disciplina.toLowerCase();
    return DISCIPLINE_EXACTE.some(de => d.includes(de));
}

async function generateMaterials({ titlu_lectie, clasa, disciplina, modul, unitate_invatare, scoala, profesor, dificultate, stil_predare, target, tip_test, imagini, competente_specifice }) {
    const apiKeys = [process.env.GEMINI_API_KEY];
    if (!apiKeys[0]) {
        throw new Error('GEMINI_API_KEY lipsește din .env');
    }

    const genAI = new GoogleGenerativeAI(apiKeys[0]);

    const areImagini = Array.isArray(imagini) && imagini.length > 0;
    const areSVG = esteDisiplinaExacta(disciplina) && (target === 'fisa' || target === 'test');

    const contextImagini = areImagini
        ? `\nIMAGINI FURNIZATE DE PROFESOR (${imagini.length} imagini atașate):
${imagini.map((img, i) => `  ${i + 1}. "${img.filename}" — referențiaz-o în conținut ca [IMAGINE:${img.id}] exact acolo unde e relevantă pentru exercițiu.`).join('\n')}
Inserează marcajele [IMAGINE:ID] direct în textul exercițiilor, nu separat.\n`
        : '';

    const contextSVG = areSVG
        ? `\nDIAGRAME SVG: Dacă disciplina necesită o schemă, diagramă sau grafic (circuit electric, forțe, moleculă, axă de coordonate etc.), generează-l ca SVG valid între marcajele [SVG_START] și [SVG_END]. SVG-ul trebuie să aibă width="400" height="300" și text lizibil. Inserează diagrama imediat după titlul exercițiului relevant. Maxim 2 diagrame per material.\n`
        : '';

    const appContext = `
DATE GENERALE CONTEXTUALE(FOLOSEȘTE - LE ÎN ANTETUL MATERIALELOR):
    - ȘCOALA / UNITATEA DE ÎNVĂȚĂMÂNT: ${scoala || '—'}
    - PROFESOR: ${profesor || '—'}
    - DISCIPLINA: ${disciplina}
    - CLASA: ${clasa}
    - MODUL: ${modul}
    - UNITATE DE ÎNVĂȚARE: ${unitate_invatare}
    - TITLU LECȚIE(Subiectul): ${titlu_lectie}
${Array.isArray(competente_specifice) && competente_specifice.length > 0
    ? `    - COMPETENȚE SPECIFICE (din planificarea profesorului): ${competente_specifice.join(', ')}`
    : ''}
OPȚIUNI DE GENERARE:
    - Dificultate adaptată pentru: ${dificultate?.toUpperCase() || 'STANDARD'} (Standard = nivel mediu, Avansat = exerciții mai complexe și provocatoare, Remedial = explicații pas cu pas și scheme ajutătoare).
    - Stil de predare: ${stil_predare?.toUpperCase() || 'STANDARD'}.
  Dacă este JUCĂUȘ, folosește un ton mai prietenos, energic, introduce scurte joculețe sau analogii amuzante în activități.
  Dacă este VIZUAL(cu poze), sugerează profesorului unde să introducă imagini, videoclipuri scurte sau scheme grafice pe tablă / proiector.
${contextImagini}${contextSVG}
Dacă școala sau profesorul sunt "—", omite - le sau lasă spațiu liber[______].Dacă există, scrie - le direct!
`;
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            maxOutputTokens: 65536,
            responseMimeType: 'application/json'
        }
    });

    // System prompt inclus direct în user prompt (evită conflictul systemInstruction + responseMimeType)
    const textPrompt = `${PROFESOR_SYSTEM_PROMPT}

${GENERATE_PROMPT_SINGLE(target && target !== 'all' ? target : null, tip_test, disciplina)}

${appContext}

--- DATELE LECȚIEI ---
Titlu: ${titlu_lectie}
Clasa: ${clasa || '—'}
Disciplina: ${disciplina || '—'}
Modulul: ${modul || '—'}
Unitatea de învățare: ${unitate_invatare || '—'}`;

    // Construim conținutul multimodal (text + imagini opționale)
    const contentParts = [{ text: textPrompt }];
    if (areImagini) {
        imagini.slice(0, 5).forEach(img => {
            contentParts.push({
                inlineData: { mimeType: img.mimeType, data: img.dataBase64 }
            });
        });
    }

    logger.info('Generez materiale AI', { titlu_lectie, clasa, disciplina, nrImagini: imagini?.length || 0, areSVG });

    let result;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            result = await model.generateContent(contentParts.length === 1 ? textPrompt : contentParts);
            break;
        } catch (retryErr) {
            const e503 = retryErr.message?.includes('503') || retryErr.message?.includes('Service Unavailable');
            if (retryErr.status === 429 && attempt < 3) {
                let waitSec = 35;
                if (retryErr.errorDetails) {
                    const retryInfo = retryErr.errorDetails.find(d => d.retryDelay);
                    if (retryInfo) waitSec = parseInt(retryInfo.retryDelay) || 35;
                }
                logger.warn('Gemini rate limit — aștept înainte de retry', { waitSec, attempt });
                await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
            } else if (e503 && attempt < 3) {
                // Serverele Gemini suprasolicitate — retry după pauză scurtă
                logger.warn('Gemini 503 Service Unavailable — retry', { attempt });
                await new Promise(resolve => setTimeout(resolve, attempt * 4000));
            } else {
                throw retryErr;
            }
        }
    }

    let responseText = result.response.text();

    // ── EXTRACTION & REPAIR LOGIC ──
    let parsed;

    try {
        parsed = JSON.parse(responseText);
    } catch (jsonErr) {
        logger.warn('JSON direct parse eșuat, caut bloc JSON', { error: jsonErr.message, preview: responseText.slice(0, 200) });
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                parsed = JSON.parse(match[0]);
            } catch (e2) {
                logger.error('Repair JSON final eșuat', { error: e2.message, preview: responseText.slice(0, 200) });
                parsed = { proiect_didactic: "Eroare la procesarea materialelor. Text brut:\n" + responseText };
            }
        } else {
            logger.error('Răspuns AI fără JSON', { responseLength: responseText.length, preview: responseText.slice(0, 300) });
            parsed = { proiect_didactic: "Eroare fatală la generare." };
        }
    }

    const toStr = (val) => {
        if (val === null || val === undefined) return '';
        if (typeof val === 'string') return val;
        // Gemini uneori returnează câmpul ca obiect cu secțiuni — îl serializăm
        return JSON.stringify(val, null, 2);
    };

    const getField = (obj, ...keys) => {
        if (!obj) return '';
        for (const k of keys) {
            if (obj[k] !== undefined && obj[k] !== null) return toStr(obj[k]);
            const foundKey = Object.keys(obj).find(ok =>
                ok.toLowerCase().replace(/_/g, '').replace(/\s/g, '') ===
                k.toLowerCase().replace(/_/g, '').replace(/\s/g, '')
            );
            if (foundKey !== undefined) return toStr(obj[foundKey]);
        }
        return '';
    };

    const final = {};
    if (!target || target === 'all' || target === 'proiect') {
        final.proiect_didactic = getField(parsed, 'proiect_didactic', 'proiect');
    }
    if (!target || target === 'all' || target === 'fisa') {
        final.fisa_lucru = getField(parsed, 'fisa_lucru', 'fisa', 'fisa_de_lucru', 'fisalucru');
    }
    if (!target || target === 'all' || target === 'test') {
        final.test_evaluare = getField(parsed, 'test_evaluare', 'test', 'test_de_evaluare', 'testevaluare');
    }

    Object.keys(final).forEach(k => {
        if (typeof final[k] === 'string') {
            final[k] = final[k].replace(/\[\.\.\.\]/g, '_______');
        }
    });

    logger.info('Materiale AI generate cu succes', { titlu_lectie });
    return final;
}


// Trimite fișierul original (PDF) direct la Gemini ca date vizuale (inline base64).
// Gemini „vede" documentul cum e, inclusiv tabele cu celule unite — mult mai precis
// decât extragerea de text care poate amesteca coloanele.
async function parsePlanificareAI_File(fileBuffer, mimeType) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY lipsește din .env');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
            temperature: 0.1,
            topP: 0.95,
            maxOutputTokens: 65536,
            responseMimeType: 'application/json'
        }
    });

    const base64Data = fileBuffer.toString('base64');

    logger.info(`Trimit fișierul la Gemini Vision (${mimeType}, ${Math.round(fileBuffer.length / 1024)} KB)...`);

    const result = await withRetry(() => model.generateContent([
        EXTRACT_PROMPT,
        { inlineData: { data: base64Data, mimeType } }
    ]));

    const responseText = result.response.text();

    let parsed;
    try {
        parsed = JSON.parse(responseText);
    } catch (_) {
        parsed = reparaJsonTrunchiat(responseText);
    }

    if (!parsed || !Array.isArray(parsed.lectii) || parsed.lectii.length === 0) {
        throw new Error('Gemini Vision nu a returnat nicio lecție.');
    }

    parsed.lectii.forEach((l, i) => { l.id = i + 1; });
    logger.info('Gemini Vision a extras planificarea', { lectiiCount: parsed.lectii.length });
    return {
        metadata: parsed.metadata || { scoala: '—', profesor: '—' },
        lectii: parsed.lectii
    };
}


/**
 * Generează o planificare anuală de la zero pe baza datelor introduse de profesor.
 * @param {object} date - { disciplina, clasa, oreSaptamana, semestru, scoala, profesor, unitati, anScolar }
 * @returns {{ metadata, lectii }}
 */
async function genereazaPlanificare({ disciplina, clasa, oreSaptamana, nrModule = 0, semestru, scoala, profesor, unitati, anScolar }) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY lipsește din .env');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.4, maxOutputTokens: 65536 }
    });

    // Construim promptul cu datele profesorului
    const unitatiText = Array.isArray(unitati) && unitati.length > 0
        ? `\nUNITĂȚI DE ÎNVĂȚARE specificate de profesor:\n${unitati.map((u, i) => `${i + 1}. ${u}`).join('\n')}`
        : '\nUNITĂȚI DE ÎNVĂȚARE: generează tu conform programei MEN pentru această disciplină și clasă.';

    const semestruText = {
        'ambele': 'Generează planificarea pentru ÎNTREG ANUL ȘCOLAR (toate modulele).',
        'M1': 'Generează planificarea DOAR pentru Modul I (primul modul al anului școlar).',
        'M2': 'Generează planificarea DOAR pentru Modul II.',
        'M3': 'Generează planificarea DOAR pentru Modul III.',
        'M4': 'Generează planificarea DOAR pentru Modul IV.',
        'M5': 'Generează planificarea DOAR pentru Modul V (ultimul modul al anului).',
    }[semestru] || 'Generează planificarea pentru ÎNTREG ANUL ȘCOLAR.';

    const moduleText = nrModule > 0
        ? `- Număr de module: EXACT ${nrModule} module (Modul I, Modul II, ..., Modul ${['', 'I','II','III','IV','V','VI','VII','VIII'][nrModule] || nrModule}). Distribuie lecțiile echilibrat între ele.`
        : `- Număr de module: decide tu în funcție de programa MEN (de obicei 4-6 module).`;

    const prompt = PLANIFICARE_TEMPLATE
        .replace('{{SCOALA}}', scoala || '—')
        .replace('{{PROFESOR}}', profesor || '—')
        + `\n\n## DATE INTRODUSE DE PROFESOR\n`
        + `- Disciplina: ${disciplina}\n`
        + `- Clasa: ${clasa}\n`
        + `- Ore pe săptămână: ${oreSaptamana}\n`
        + `- Anul școlar: ${anScolar || '2025-2026'}\n`
        + `- Semestru: ${semestruText}\n`
        + `- ${moduleText}\n`
        + unitatiText;

    logger.info('Generez planificare de la zero', { disciplina, clasa, oreSaptamana, semestru });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();

    let parsed;
    try {
        parsed = JSON.parse(responseText);
    } catch (_) {
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error('AI-ul nu a returnat JSON valid pentru planificare.');
    }

    if (!parsed?.lectii?.length) throw new Error('AI-ul nu a generat nicio lecție.');

    parsed.lectii.forEach((l, i) => { l.id = i + 1; });
    logger.info('Planificare generată cu succes', { lectiiCount: parsed.lectii.length });

    return {
        metadata: parsed.metadata || { scoala: scoala || '—', profesor: profesor || '—' },
        lectii: parsed.lectii
    };
}

module.exports = { parsePlanificareAI, parsePlanificareAI_File, generateMaterials, genereazaPlanificare };
