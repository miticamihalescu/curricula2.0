require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testSafety() {
    const apiKey = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json'
        }
    });

    const GENERATE_PROMPT = `Ești un profesor-metodist expert din România cu peste 20 de ani de experiență.
Generează materialele didactice complete pentru lecția specificată.

RETURNEAZĂ un obiect JSON valid cu exact aceste 3 câmpuri:
{
  "proiect_didactic": "...",
  "fisa_lucru": "...",
  "test_evaluare": "..."
}

REGULI pentru PROIECT DIDACTIC:
- Format oficial MEN (Ministerul Educației Naționale)
- Include: date generale, competențe specifice vizate, obiective operaționale (O1-O5), strategia didactică (metode, mijloace, forme), desfășurarea lecției pe momente (cu timp alocat), evaluare, bibliografie

REGULI pentru FIȘA DE LUCRU:
- Minimum 8-10 exerciții/itemi progresivi
- Include: header cu școala/clasa/data, enunțuri clare

REGULI pentru TEST DE EVALUARE:
- Format oficial: 2 variante echilibrate
- Include barem de corectare detaliat`;

    const userPrompt = `${GENERATE_PROMPT}\n\n--- DATELE LECȚIEI ---\nTitlu: Normele de securitate și protecție a muncii în laborator\nClasa: a IX-a`;

    console.log(`🤖 Generez materiale...`);
    const result = await model.generateContent(userPrompt);
    const responseText = result.response.text();
    const candidate = result.response.candidates[0];

    console.log("Finish reason:", candidate.finishReason);
    console.log("Safety ratings:", JSON.stringify(candidate.safetyRatings, null, 2));

    // just print end of text
    console.log("Ends with:", responseText.substring(responseText.length - 50));
}
testSafety();
