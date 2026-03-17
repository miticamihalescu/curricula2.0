/**
 * ai-parser.js
 *
 * Parsează textul extras dintr-o planificare calendaristică anuală
 * folosind Google Gemini AI pentru extragere inteligentă.
 *
 * Returnează un JSON Array cu lecțiile extrase.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('./logger');

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


// ── Prompt: PROIECT DIDACTIC (format ISJ/MEN) ────────────
const PROMPT_PROIECT = `Ești un profesor-metodist expert din România cu peste 20 de ani de experiență în redactarea proiectelor didactice conform cerințelor MEN și ISJ.

SARCINA: Generează un PROIECT DIDACTIC COMPLET în format tabelar, conform șablonului ISJ România.

STRUCTURA OBLIGATORIE (respectă exact această ordine):

1. ANTET:
UNITATEA DE ÎNVĂȚĂMÂNT: [scoala]
PROFESOR: [profesor]
DISCIPLINA: [disciplina]
CLASA: [clasa]
DATA: [lasă spațiu liber]
UNITATEA DE ÎNVĂȚARE: [unitate_invatare]
SUBIECTUL LECȚIEI: [titlu_lectie]
TIPUL LECȚIEI: [determină din context: "Lecție de transmitere și însușire de noi cunoștințe" / "Lecție de consolidare și sistematizare" / "Lecție de recapitulare" / "Lecție de evaluare" / "Lecție mixtă"]
DURATA: 50 minute
LOCUL DESFĂȘURĂRII: Sala de clasă

2. COMPETENȚE SPECIFICE VIZATE (din programa MEN):
- Listează 2-4 competențe specifice relevante cu codurile lor (ex: CS 1.1, CS 2.3)
- Formulează-le concret pentru disciplina și clasa respectivă

3. OBIECTIVE OPERAȚIONALE:
La sfârșitul orei, elevii vor fi capabili:
O1 - să definească / să recunoască...
O2 - să explice / să identifice...
O3 - să aplice / să calculeze...
O4 - să compare / să analizeze... (dacă e cazul)

4. STRATEGIA DIDACTICĂ:
- Metode și procedee: [lista metode: conversația euristică, explicația, demonstrația, exercițiul, experimentul, problematizarea, etc.]
- Mijloace de învățământ: [manual, caiete, tablă, fișe de lucru, calculator/proiector, trusa de experimente, etc.]
- Forme de organizare: frontal / individual / pe grupe / în perechi
- Evaluare: [tipul: observare sistematică / evaluare formativă / probă orală / probă scrisă]

5. DESFĂȘURAREA LECȚIEI (tabel cu 5 coloane):
Generează tabelul în format text astfel:
| Etapa lecției (durată) | Activitatea profesorului | Activitatea elevilor | Metode / Mijloace | Evaluare |
|---|---|---|---|---|
| 1. Moment organizatoric (2 min) | ... | ... | Conversație | Obs. sistematică |
| 2. Verificarea temei / Reactualizarea cunoștințelor (5-8 min) | ... | ... | ... | ... |
| 3. Captarea atenției (3-5 min) | ... | ... | ... | ... |
| 4. Comunicarea noilor cunoștințe / Dirijarea învățării (20-25 min) | ... | ... | ... | ... |
| 5. Obținerea performanței / Fixarea cunoștințelor (8-10 min) | ... | ... | ... | ... |
| 6. Evaluarea (3-5 min) | ... | ... | ... | ... |
| 7. Tema pentru acasă (2 min) | ... | ... | ... | ... |

6. BIBLIOGRAFIE:
- Manual [disciplina], clasa [clasa], Editura [editură relevantă]
- Curriculum național / Programa școlară [disciplina], MEN

REGULI STRICTE:
- Folosește terminologia pedagogică română corectă
- Adaptează conținutul exact la disciplina, clasa și titlul lecției primite
- Fii concret și specific, nu generic
- NU folosi rânduri reale (Enter) în JSON — folosește \\n
- NU folosi underscore-uri lungi sau linii continue`;

// ── Prompt: FIȘĂ DE LUCRU ────────────────────────────────
const PROMPT_FISA = `Ești un profesor expert din România cu experiență în crearea de fișe de lucru adaptate vârstei elevilor.

SARCINA: Generează o FIȘĂ DE LUCRU COMPLETĂ pentru elevi.

STRUCTURA OBLIGATORIE:

1. ANTET:
UNITATEA DE ÎNVĂȚĂMÂNT: [scoala]
PROFESOR: [profesor]
DISCIPLINA: [disciplina]
CLASA: [clasa]
DATA: [lasă spațiu]
FIȘĂ DE LUCRU
Unitatea de învățare: [unitate_invatare]
Tema: [titlu_lectie]
Nume și prenume elev: [.................................]

2. EXERCIȚII (6-8 exerciții progresive):
- Începe cu exerciții de recunoaștere / completare (ușoare)
- Continuă cu exerciții de aplicare (medii)
- Încheie cu 1-2 exerciții de analiză sau problemă (mai dificile)
- Fiecare exercițiu are numărul și punctajul: Ex. 1 (2p), Ex. 2 (2p), etc.
- Punctaj total: 10 puncte (din oficiu 1 punct)
- Spațiile de răspuns se notează cu [...] sau (răspuns: ...........)
- Dacă disciplina e științe exacte (fizică, chimie, matematică), include cel puțin o problemă cu calcule
- Adaptează limbajul și dificultatea la vârsta clasei

3. Notă la final: "Succes! 🌟" sau echivalent

REGULI STRICTE:
- Exercițiile să fie clar numerotate
- Enunțurile scurte și clare, fără ambiguitate
- NU folosi șiruri lungi de underscore-uri — folosește [...] sau spații marcate
- NU folosi rânduri reale în JSON — folosește \\n`;

// ── Prompt: TEST DE EVALUARE ─────────────────────────────
const PROMPT_TEST = (tip_test) => {
    const tipDesc = {
        'initial':  'INIȚIAL (se aplică la începutul unității/anului pentru a evalua cunoștințele anterioare)',
        'formativ': 'FORMATIV (se aplică pe parcursul predării pentru a verifica înțelegerea)',
        'sumativ':  'SUMATIV (se aplică la sfârșitul unității de învățare pentru evaluare finală)'
    }[tip_test] || 'FORMATIV';

    return `Ești un profesor expert din România specializat în evaluare didactică.

SARCINA: Generează un TEST DE EVALUARE ${tipDesc} complet, cu barem de corectare.

STRUCTURA OBLIGATORIE:

1. ANTET:
UNITATEA DE ÎNVĂȚĂMÂNT: [scoala]
PROFESOR: [profesor]
DISCIPLINA: [disciplina]
CLASA: [clasa]
DATA: [lasă spațiu]
TEST DE EVALUARE ${tip_test ? tip_test.toUpperCase() : 'FORMATIV'}
Unitatea de învățare: [unitate_invatare]
Tema: [titlu_lectie]
Timp de lucru: 50 minute
Nume și prenume: [...................................] Clasa: [.......]

2. SUBIECT I — Itemi obiectivi (20 puncte):
- 4 întrebări cu variante de răspuns (A, B, C, D) — câte 5 puncte fiecare
- Răspunsurile corecte să fie variate (nu toate A sau B)

3. SUBIECT II — Itemi semiobiectivi (30 puncte):
- 3-4 exerciții de completare a spațiilor libere sau răspuns scurt
- Câte 7-10 puncte fiecare
- Spațiile de răspuns marcate cu [...]

4. SUBIECT III — Rezolvare de probleme / Răspuns elaborat (40 puncte):
- 1-2 probleme / exerciții de analiză care necesită calcule sau explicații
- Dacă disciplina nu e exact, include exerciții de argumentare sau analiză
- 20 puncte fiecare (sau 40 pentru una singură)

5. Din oficiu: 10 puncte
   TOTAL: 100 puncte

6. BAREM DE CORECTARE ȘI NOTARE:
SUBIECT I: 1-A, 2-C, 3-B, 4-D (sau răspunsurile corecte reale) — câte 5p fiecare
SUBIECT II: [răspunsurile corecte] — câte Xp
SUBIECT III: [schemă de punctare: ce se evaluează și câte puncte]
Nota se calculează: Punctaj obținut / 10

REGULI STRICTE:
- Itemii să fie clari, fără ambiguitate
- Adaptează dificultatea la tipul testului (inițial = mai ușor, sumativ = mai complet)
- Baremul să fie detaliat și corect față de întrebările puse
- NU folosi underscore-uri lungi — folosește [...]
- NU folosi rânduri reale în JSON — folosește \\n`;
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

    logger.info('Trimit planificarea la Gemini AI...');
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    let parsed;
    try {
        parsed = JSON.parse(responseText);
    } catch (jsonErr) {
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) {
            parsed = JSON.parse(match[0]);
        } else {
            logger.error('Răspuns AI neparsabil', { preview: responseText.substring(0, 500) });
            throw new Error('Nu am putut extrage JSON din răspunsul AI.');
        }
    }

    // Asigurăm formatul { metadata, lectii }
    const lectii = Array.isArray(parsed.lectii) ? parsed.lectii : (Array.isArray(parsed) ? parsed : []);
    const metadata = parsed.metadata || { scoala: '—', profesor: '—' };

    if (!lectii.length) {
        throw new Error('AI-ul nu a returnat nicio lecție.');
    }

    logger.info('Gemini AI a extras planificarea', { lectiiCount: lectii.length });
    return { metadata, lectii };
}


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
