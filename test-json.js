require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testParsing() {
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

    const GENERATE_PROMPT = `Ești un profesor expert.
Generează un obiect JSON cu "proiect_didactic", "fisa_lucru", "test_evaluare". 
Fiecare curs trebuie sa fie lung. Pune \\n pentru rânduri noi.`;

    const userPrompt = `${GENERATE_PROMPT}\n\nTitlu: Normele de securitate în laborator`;

    console.log(`🤖 Generez materiale...`);
    const result = await model.generateContent(userPrompt);
    const responseText = result.response.text();
    const candidate = result.response.candidates[0];

    console.log("Finish reason:", candidate.finishReason);

    try {
        JSON.parse(responseText);
        console.log("✅ JSON parsed successfully!");
    } catch (e) {
        console.log("❌ JSON parse error:", e.message);
        console.log("Raw text length:", responseText.length);
        console.log("Starts with:", responseText.substring(0, 100));
        console.log("Ends with:", responseText.substring(responseText.length - 100));
    }
}
testParsing();
