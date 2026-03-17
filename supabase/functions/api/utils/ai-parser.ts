// supabase/functions/api/utils/ai-parser.ts
import { GoogleGenerativeAI } from "../deps.ts";

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
    "scoala": "Numele complet al UNITĂȚII DE ÎNVĂȚĂMÂNT / ȘCOLII. Dacă lipsește, pune '—'.",
    "profesor": "Numele complet al profesorului. Dacă lipsește, pune '—'."
  },
  "lectii": [
    {
      "id": 1,
      "modul": "Modul I",
      "unitate_invatare": "...",
      "saptamana": "S1",
      "tip_ora": "PREDARE",
      "titlu_lectie": "...",
      "perioada": "..."
    }
  ]
}

IMPORTANT: Reîntoarce DOAR JSON-ul, fără markdown block-uri.`;

// ── Prompt generare materiale ────────────────────────────
const GENERATE_PROMPT_ALL = `Ești un profesor-metodist expert din România cu peste 20 de ani de experiență.
SARCINA: Generează materialele didactice complete pentru lecția specificată.
RETURNEAZĂ un obiect JSON valid: { "proiect_didactic": "...", "fisa_lucru": "...", "test_evaluare": "..." }
... [Full rules as per original] ...`;

const GENERATE_PROMPT_SINGLE = (target: string) => {
    let targetName = "";
    let returnKey = "";
    if (target === 'proiect') { targetName = "PROIECTUL DIDACTIC"; returnKey = "proiect_didactic"; }
    else if (target === 'fisa') { targetName = "FIȘA DE LUCRU"; returnKey = "fisa_lucru"; }
    else if (target === 'test') { targetName = "TESTUL DE EVALUARE"; returnKey = "test_evaluare"; }
    
    return `Ești un profesor-metodist expert din România. SARCINA: Generează ${targetName}. RETURNEAZĂ JSON: { "${returnKey}": "..." }`;
};

export async function parsePlanificareAI(text: string) {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error('GEMINI_API_KEY lipsește.');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `${EXTRACT_PROMPT} \n\nTEXT:\n${text}`;
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    try {
        return JSON.parse(responseText.replace(/```json|```/g, '').trim());
    } catch (err) {
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error('Nu am putut parsa răspunsul AI.');
    }
}

export async function generateMaterials(params: any) {
    const { titlu_lectie, target } = params;
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error('GEMINI_API_KEY lipsește.');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const userPrompt = `${target && target !== 'all' ? GENERATE_PROMPT_SINGLE(target) : GENERATE_PROMPT_ALL}\n\nLECTIE: ${titlu_lectie}`;
    const result = await model.generateContent(userPrompt);
    const responseText = result.response.text();

    try {
        const parsed = JSON.parse(responseText.replace(/```json|```/g, '').trim());
        // Simple repair for potential missing keys
        const final: any = {};
        if (!target || target === 'all' || target === 'proiect') final.proiect_didactic = parsed.proiect_didactic || parsed.proiect || '';
        if (!target || target === 'all' || target === 'fisa') final.fisa_lucru = parsed.fisa_lucru || parsed.fisa || '';
        if (!target || target === 'all' || target === 'test') final.test_evaluare = parsed.test_evaluare || parsed.test || '';
        return final;
    } catch (err) {
        throw new Error('Eroare la generarea materialelor AI.');
    }
}
