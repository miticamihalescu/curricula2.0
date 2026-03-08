/**
 * ai-parser.js
 *
 * Parsează textul extras dintr-o planificare calendaristică anuală
 * folosind Google Gemini AI pentru extragere inteligentă.
 *
 * Returnează un JSON Array cu lecțiile extrase.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// ── Prompt extragere lecții ──────────────────────────────
const EXTRACT_PROMPT = `Ești motorul de procesare al unei platforme educaționale premium pentru profesori din România.

SARCINA TA: Primești textul brut extras dintr-un document Word (planificare calendaristică anuală) și trebuie să extragi un JSON Array cu TOATE lecțiile pentru ÎNTREGUL AN ȘCOLAR.

INSTRUCȚIUNI STRICTE:
1. Scanează ÎNTREGUL document de la început până la sfârșit. Extrage ABSOLUT FIECARE lecție/conținut/temă din planificare — nu omite niciun modul, nici o săptămână.
2. Un an școlar tipic are 35–36 de săptămâni (S1–S36) și mai multe module (Modul I, II, III, IV, V). Generează câte un obiect pentru fiecare oră/lecție: dacă o unitate are "6 ore" sau "7 ore", generează 6 respectiv 7 intrări, fiecare cu titlul/conținutul corespunzător.
3. Pentru fiecare rând sau celulă din tabelele din document care descrie o lecție, o temă sau un conținut, creează o intrare în array. Dacă un modul listează mai multe conținuturi (ex: "Interfața aplicației", "Operații de editare", "Formatare"), fiecare devine o lecție separată.
4. Extrage titlul exact al lecției (sau conținutul), modulul, unitatea de învățare, săptămâna, perioada de desfășurare și tipul orei.
5. Dacă o lecție conține "Recapitulare" + "Evaluare" împreună, clasifică-o ca "EVALUARE".
6. Identifică săptămânile speciale (Săptămâna Verde, Școala Altfel) și marchează-le la tip_ora.

REGULI DE CLASIFICARE tip_ora (UPPERCASE):
- "SĂPTĂMÂNA VERDE" → dacă săptămâna e desemnată ca Săptămâna Verde
- "ȘCOALA ALTFEL" → dacă săptămâna e desemnată ca Școala Altfel  
- "EVALUARE" → dacă lecția conține "evaluare", "test", "evaluare sumativă/formativă"
- "RECAPITULARE" → dacă lecția conține "recapitulare" fără "evaluare"
- "PREDARE" → toate celelalte lecții normale

FORMATUL "modul": trebuie să fie "Modul I", "Modul II", etc. sau "Recapitulare finală".

RETURNEAZĂ DOAR un JSON valid cu următoarea structură:

{
  "metadata": {
    "scoala": "Numele complet al UNITĂȚII DE ÎNVĂȚĂMÂNT / ȘCOLII (caută în antetul sau subsolul documentului, ex: Liceul Teoretic X, Școala Gimnazială Y). Dacă lipsește, pune '—'.",
    "profesor": "Numele complet al profesorului (caută 'Profesor:', 'Întocmit:', 'Avizat:', sau nume proprii în antet/subsol). Dacă lipsește, pune '—'."
  },
  "lectii": [
    {
      "id": 1,
      "modul": "Modul I",
      "unitate_invatare": "Structura unui sistem de calcul",
      "saptamana": "S1",
      "tip_ora": "SĂPTĂMÂNA VERDE",
      "titlu_lectie": "Normele de securitate și protecție a muncii în laborator",
      "perioada": "08.09-12.09.2025"
    },
    {
      "id": 2,
      "modul": "Modul I",
      "unitate_invatare": "Structura unui sistem de calcul",
      "saptamana": "S2",
      "tip_ora": "PREDARE",
      "titlu_lectie": "Structura generală a unui sistem de calcul. Istoric.",
      "perioada": "15.09-19.09.2025"
    }
  ]
}

IMPORTANT:
- Returnează DOAR JSON-ul (obiectul ce conține metadata și array-ul de lectii).
- NU pune JSON-ul în blocuri de cod sau markdown block-uri de tip \`\`\`json.
- id trebuie să fie secvențial, de la 1.
- Dacă nu identifici o valoare, pune "—".
- Păstrează titlurile lecțiilor EXACT cum apar în document.
- tip_ora trebuie UPPERCASE.
- modul trebuie să fie "Modul I", "Modul II", etc. (cu "Modul" prefix).
- OBLIGATORIU: Numărul total de lecții trebuie să acopere ÎNTREGUL AN ȘCOLAR (toate orele din toate modulele). Dacă în document vezi "7 ore" la un modul, generează 7 intrări; dacă vezi "6 ore", generează 6. Nu grupa mai multe ore într-o singură lecție decât dacă documentul le prezintă explicit ca una singură.`;


// ── Prompt generare materiale ────────────────────────────
const GENERATE_PROMPT_ALL = `Ești un profesor-metodist expert din România cu peste 20 de ani de experiență.

SARCINA: Generează materialele didactice complete pentru lecția specificată.

RETURNEAZĂ un obiect JSON valid cu exact aceste 3 câmpuri:

{
  "proiect_didactic": "...",
  "fisa_lucru": "...",
  "test_evaluare": "..."
}

REGULI pentru PROIECT DIDACTIC:
- Format oficial MEN (Ministerul Educației Naționale)
- Include datele generale completate gata în antet (școală, profesor, disciplină, clasă, etc.)
- Include: competențe, obiective, strategia didactică, desfășurarea lecției, evaluare.
- Fii concis și la obiect, nu folosi umplutură.

REGULI pentru FIȘA DE LUCRU:
- 5-8 exerciții progresive (de la simplu la complex)
- Include datele generale completate în antet (școală, profesor, clasa etc.) dacă se aplică.
- Enunțuri clare și scurte.
- FOARTE IMPORTANT: NU folosi șiruri lungi de liniuțe sau underscore-uri (ex: "________"). Folosește "[...]" pentru spațiile libere.

REGULI pentru TEST DE EVALUARE:
- Format oficial: 2 variante scurte și echilibrate
- Include datele generale completate în antet.
- FOARTE IMPORTANT: La fel, NU genera linii continue (--------- sau ________). Folosește "[...]".

IMPORTANT PRIVIND ANTETUL:
- Fiecare material TREBUIE să înceapă cu un ANTET FORMAL care să conțină (dacă sunt disponibile): Unitarea de Învățământ, Profesor, Disciplina, Clasa, Unitatea de Învățare și Titlul Lecției.
- EXEMPLU DE ANTET (adaptează-l):
  UNITATEA DE ÎNVĂȚĂMÂNT: [Nume Școală]
  PROFESOR: [Nume Profesor]
  DISCIPLINA: [Nume Disciplină]
  CLASA: [Nume Clasă]
  UNITATEA DE ÎNVĂȚARE: [Nume Unitate]
  SUBIECTUL LECȚIEI: [Titlu Lecție]
  --------------------------------------------------

- Datele de intrare (DATELE LECȚIEI) sunt oferite mai jos.
- Returnează un JSON valid cu EXACT aceste chei: "proiect_didactic", "fisa_lucru", "test_evaluare".
- NU PUNE TEXT ÎNAINTE SAU DUPĂ JSON. FĂRĂ markdown block-uri.
- FOARTE IMPORTANT: NU folosi rânduri noi reale (Enter) în interiorul șirurilor de text JSON. Folosește literele "\\n" pentru rânduri noi.
- Fii cât mai sintetic.`;

const GENERATE_PROMPT_SINGLE = (target) => {
    let targetName = "";
    let rules = "";
    let returnKey = "";

    if (target === 'proiect') {
        targetName = "PROIECTUL DIDACTIC";
        returnKey = "proiect_didactic";
        rules = `REGULI pentru PROIECT DIDACTIC:
- Format oficial MEN (Ministerul Educației Naționale)
- Include datele generale completate gata în antet (școală, profesor, disciplină, clasă, etc.)
- Include: competențe, obiective, strategia didactică, desfășurarea lecției, evaluare.
- Fii concis și la obiect, nu folosi umplutură.`;
    } else if (target === 'fisa') {
        targetName = "FIȘA DE LUCRU";
        returnKey = "fisa_lucru";
        rules = `REGULI pentru FIȘA DE LUCRU:
- 5-8 exerciții progresive (de la simplu la complex)
- Include datele generale completate în antet (școală, profesor, clasa etc.) dacă se aplică.
- Enunțuri clare și scurte.
- FOARTE IMPORTANT: NU folosi șiruri lungi de liniuțe sau underscore-uri (ex: "________"). Folosește "[...]" pentru spațiile libere.`;
    } else if (target === 'test') {
        targetName = "TESTUL DE EVALUARE";
        returnKey = "test_evaluare";
        rules = `REGULI pentru TEST DE EVALUARE:
- Format oficial: 2 variante scurte și echilibrate
- Include datele generale completate în antet.
- FOARTE IMPORTANT: La fel, NU genera linii continue (--------- sau ________). Folosește "[...]".`;
    }

    return `Ești un profesor-metodist expert din România cu peste 20 de ani de experiență.

SARCINA: Generează ${targetName} pentru lecția specificată.

RETURNEAZĂ un obiect JSON valid cu exact 1 câmp:
{
  "${returnKey}": "..."
}

${rules}

IMPORTANT PRIVIND ANTETUL:
- Materialul TREBUIE să înceapă cu un ANTET FORMAL care să conțină (dacă sunt disponibile): Unitarea de Învățământ, Profesor, Disciplina, Clasa, Unitatea de Învățare și Titlul Lecției.
- EXEMPLU DE ANTET (adaptează-l):
  UNITATEA DE ÎNVĂȚĂMÂNT: [Nume Școală]
  PROFESOR: [Nume Profesor]
  DISCIPLINA: [Nume Disciplină]
  CLASA: [Nume Clasă]
  UNITATEA DE ÎNVĂȚARE: [Nume Unitate]
  SUBIECTUL LECȚIEI: [Titlu Lecție]
  --------------------------------------------------

- Datele de intrare (DATELE LECȚIEI) sunt oferite mai jos.
- Returnează un JSON valid cu EXACT această cheie: "${returnKey}".
- NU PUNE TEXT ÎNAINTE SAU DUPĂ JSON. FĂRĂ markdown block-uri.
- FOARTE IMPORTANT: NU folosi rânduri noi reale (Enter) în interiorul șirurilor de text JSON. Folosește literele "\\n" pentru rânduri noi.
- Fii cât mai sintetic.`;
};


/**
 * Parsează planificarea folosind Google Gemini AI.
 * Returnează direct un Array de lecții.
 *
 * @param {string} text - Textul brut extras din document
 * @returns {Promise<Array>} - Array de lecții
 */
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
            maxOutputTokens: 16384,
            responseMimeType: 'application/json'
        }
    });

    const prompt = `${EXTRACT_PROMPT} \n\n-- - TEXTUL PLANIFICĂRII-- -\n\n${text} `;

    console.log('🤖 Trimit planificarea la Gemini AI...');
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    let parsed;
    try {
        parsed = JSON.parse(responseText);
    } catch (jsonErr) {
        // Dacă AI-ul a pus text extra, extragem JSON-ul din interior
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) {
            parsed = JSON.parse(match[0]);
        } else {
            console.error('Răspuns neparsabil:', responseText.substring(0, 500));
            throw new Error('Nu am putut extrage JSON din răspunsul AI.');
        }
    }

    // Asigurăm formatul { metadata, lectii }
    const lectii = Array.isArray(parsed.lectii) ? parsed.lectii : (Array.isArray(parsed) ? parsed : []);
    const metadata = parsed.metadata || { scoala: '—', profesor: '—' };

    if (!lectii.length) {
        throw new Error('AI-ul nu a returnat nicio lecție.');
    }

    console.log(`✅ Gemini AI a extras metadata și ${lectii.length} lecții.`);
    return { metadata, lectii };
}


/**
 * Generează materiale didactice pentru o lecție specifică.
 *
 * @param {Object} params
 * @param {string} params.titlu_lectie
 * @param {string} params.clasa
 * @param {string} params.disciplina
 * @param {string} params.modul
 * @param {string} params.unitate_invatare
 * @param {string} params.scoala
 * @param {string} params.profesor
 * @param {string} params.dificultate
 * @param {string} params.stil_predare
 * @returns {Promise<Object>} Object cu materialele
 */
async function generateMaterials({ titlu_lectie, clasa, disciplina, modul, unitate_invatare, scoala, profesor, dificultate, stil_predare, target }) {
    const apiKeys = [process.env.GEMINI_API_KEY];
    if (!apiKeys[0]) {
        throw new Error('GEMINI_API_KEY lipsește din .env');
    }

    const genAI = new GoogleGenerativeAI(apiKeys[0]);

    // Build the specific context block
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
        generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json'
        }
    });

    const userPrompt = `${target && target !== 'all' ? GENERATE_PROMPT_SINGLE(target) : GENERATE_PROMPT_ALL}

${appContext}

    --- DATELE LECȚIEI-- -
        Titlu: ${titlu_lectie}
    Clasa: ${clasa || '—'}
    Disciplina: ${disciplina || '—'}
    Modulul: ${modul || '—'}
Unitatea de învățare: ${unitate_invatare || '—'} `;

    console.log(`🤖 Generez materiale pentru: "${titlu_lectie}"...`);

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
                console.log(`⏳ Rate limit atins.Aștept ${waitSec} s(încercare ${attempt} / 3)...`);
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
        // Fallback: search for JSON-like block
        console.warn('JSON direct fail, searching for block...', jsonErr.message);
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                parsed = JSON.parse(match[0]);
            } catch (e2) {
                console.error('Final repair fail:', e2.message);
                parsed = { proiect_didactic: "Eroare la procesarea materialelor. Text brut:\n" + responseText };
            }
        } else {
            parsed = { proiect_didactic: "Eroare fatală la generare." };
        }
    }

    // Helper to get field with normalization
    const getField = (obj, ...keys) => {
        if (!obj) return '';
        for (const k of keys) {
            if (obj[k]) return obj[k];
            // Normalize existing keys to check
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

    // --- Post-process: format spaces for blanks ---
    Object.keys(final).forEach(k => {
        if (typeof final[k] === 'string') {
            final[k] = final[k].replace(/\[\.\.\.\]/g, '_______');
        }
    });

    console.log(`✅ Materiale generate pentru: "${titlu_lectie}"`);
    return final;
}


module.exports = { parsePlanificareAI, generateMaterials };
