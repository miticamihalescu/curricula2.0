require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // We can't easily list models via the SDK without an explicit API call, but we can try basic generation with 1.5-flash and 2.5-flash
        const modelsToTest = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];

        for (const modelName of modelsToTest) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent("Hello!");
                console.log(`✅ ${modelName} works! Response: ${result.response.text().substring(0, 20)}`);
                // Stop after finding the first working model
                process.exit(0);
            } catch (err) {
                console.log(`❌ ${modelName} failed: ${err.message}`);
            }
        }
    } catch (err) {
        console.error("General error:", err);
    }
}

listModels();
