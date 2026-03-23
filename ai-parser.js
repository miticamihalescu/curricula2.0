/**
 * ai-parser.js
 *
 * Parsează textul extras dintr-o planificare calendaristică anuală
 * folosind Google Gemini AI pentru extragere inteligentă.
 *
 * Returnează un JSON Array cu lecțiile extrase.
 */

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('./logger');
const { PROFESOR_SYSTEM_PROMPT } = require('./prompts/system');

// ── Prompturi încărcate din fișiere (editabile fără a atinge codul) ──────────
const EXTRACT_PROMPT   = fs.readFileSync(path.join(__dirname, 'prompts/extract-lectii.txt'), 'utf8');
const PROMPT_PROIECT   = fs.readFileSync(path.join(__dirname, 'prompts/proiect-didactic.txt'), 'utf8');
const PROMPT_FISA      = fs.readFileSync(path.join(__dirname, 'prompts/fisa-lucru.txt'), 'utf8');
const TEST_TEMPLATE    = fs.readFileSync(path.join(__dirname, 'prompts/test-evaluare.txt'), 'utf8');

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


const GENERATE_PROMPT_SINGLE = (target, tip_test) => {
    if (target === 'proiect') {
        return `${PROMPT_PROIECT}\n\nRETURNEAZĂ un obiect JSON valid cu exact 1 câmp:\n{"proiect_didactic": "..."}\nDatele lecției sunt oferite mai jos. NU PUNE TEXT ÎNAINTE SAU DUPĂ JSON. FĂRĂ markdown.`;
    } else if (target === 'fisa') {
        return `${PROMPT_FISA}\n\nRETURNEAZĂ un obiect JSON valid cu exact 1 câmp:\n{"fisa_lucru": "..."}\nDatele lecției sunt oferite mai jos. NU PUNE TEXT ÎNAINTE SAU DUPĂ JSON. FĂRĂ markdown.`;
    } else if (target === 'test') {
        return `${PROMPT_TEST(tip_test)}\n\nRETURNEAZĂ un obiect JSON valid cu exact 1 câmp:\n{"test_evaluare": "..."}\nDatele lecției sunt oferite mai jos. NU PUNE TEXT ÎNAINTE SAU DUPĂ JSON. FĂRĂ markdown.`;
    }
    // fallback: all
    return `${PROMPT_PROIECT}\n\n${PROMPT_FISA}\n\n${PROMPT_TEST(tip_test)}\n\nRETURNEAZĂ un obiect JSON cu câmpurile: "proiect_didactic", "fisa_lucru", "test_evaluare". NU PUNE TEXT ÎNAINTE SAU DUPĂ JSON. FĂRĂ markdown.`;
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

// Trimite un singur chunk de text la Gemini și returnează { metadata, lectii }.
async function parseChunk(model, textChunk, nrChunk, totalChunks) {
    const notaChunk = totalChunks > 1
        ? `\n\nATENȚIE: Acesta este fragmentul ${nrChunk} din ${totalChunks} al planificării. Extrage lecțiile DOAR din acest fragment, nu repeta lecții din alte fragmente.\n\n`
        : '';
    const prompt = `${EXTRACT_PROMPT}${notaChunk}\n\n--- TEXTUL PLANIFICĂRII ---\n\n${textChunk}`;

    const result = await model.generateContent(prompt);
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
            maxOutputTokens: 32768,
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
    for (let i = 0; i < chunks.length; i++) {
        logger.info(`Procesez chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);
        const r = await parseChunk(model, chunks[i], i + 1, chunks.length);
        if (r) rezultate.push(r);
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
async function generateMaterials({ titlu_lectie, clasa, disciplina, modul, unitate_invatare, scoala, profesor, dificultate, stil_predare, target, tip_test }) {
    const apiKeys = [process.env.GEMINI_API_KEY];
    if (!apiKeys[0]) {
        throw new Error('GEMINI_API_KEY lipsește din .env');
    }

    const genAI = new GoogleGenerativeAI(apiKeys[0]);

    const appContext = `
DATE GENERALE CONTEXTUALE(FOLOSEȘTE - LE ÎN ANTETUL MATERIALELOR):
    - ȘCOALA / UNITATEA DE ÎNVĂȚĂMÂNT: ${scoala || '—'}
    - PROFESOR: ${profesor || '—'}
    - DISCIPLINA: ${disciplina}
    - CLASA: ${clasa}
    - MODUL: ${modul}
    - UNITATE DE ÎNVĂȚARE: ${unitate_invatare}
    - TITLU LECȚIE(Subiectul): ${titlu_lectie}

OPȚIUNI DE GENERARE:
    - Dificultate adaptată pentru: ${dificultate?.toUpperCase() || 'STANDARD'} (Standard = nivel mediu, Avansat = exerciții mai complexe și provocatoare, Remedial = explicații pas cu pas și scheme ajutătoare).
    - Stil de predare: ${stil_predare?.toUpperCase() || 'STANDARD'}. 
  Dacă este JUCĂUȘ, folosește un ton mai prietenos, energic, introduce scurte joculețe sau analogii amuzante în activități. 
  Dacă este VIZUAL(cu poze), sugerează profesorului unde să introducă imagini, videoclipuri scurte sau scheme grafice pe tablă / proiector.

Dacă școala sau profesorul sunt "—", omite - le sau lasă spațiu liber[______].Dacă există, scrie - le direct!
`;
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: PROFESOR_SYSTEM_PROMPT,
        generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json'
        }
    });

    const userPrompt = `${GENERATE_PROMPT_SINGLE(target && target !== 'all' ? target : null, tip_test)}

${appContext}

    --- DATELE LECȚIEI-- -
        Titlu: ${titlu_lectie}
    Clasa: ${clasa || '—'}
    Disciplina: ${disciplina || '—'}
    Modulul: ${modul || '—'}
Unitatea de învățare: ${unitate_invatare || '—'} `;

    logger.info('Generez materiale AI', { titlu_lectie, clasa, disciplina });

    let result;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            result = await model.generateContent(userPrompt);
            break;
        } catch (retryErr) {
            if (retryErr.status === 429 && attempt < 3) {
                let waitSec = 35;
                if (retryErr.errorDetails) {
                    const retryInfo = retryErr.errorDetails.find(d => d.retryDelay);
                    if (retryInfo) waitSec = parseInt(retryInfo.retryDelay) || 35;
                }
                logger.warn('Gemini rate limit — aștept înainte de retry', { waitSec, attempt });
                await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
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
        logger.warn('JSON direct parse eșuat, caut bloc JSON', { error: jsonErr.message });
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                parsed = JSON.parse(match[0]);
            } catch (e2) {
                logger.error('Repair JSON final eșuat', { error: e2.message });
                parsed = { proiect_didactic: "Eroare la procesarea materialelor. Text brut:\n" + responseText };
            }
        } else {
            parsed = { proiect_didactic: "Eroare fatală la generare." };
        }
    }

    const getField = (obj, ...keys) => {
        if (!obj) return '';
        for (const k of keys) {
            if (obj[k]) return obj[k];
            const foundKey = Object.keys(obj).find(ok =>
                ok.toLowerCase().replace(/_/g, '').replace(/\s/g, '') ===
                k.toLowerCase().replace(/_/g, '').replace(/\s/g, '')
            );
            if (foundKey) return obj[foundKey];
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


module.exports = { parsePlanificareAI, generateMaterials };
