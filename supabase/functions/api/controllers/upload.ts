// supabase/functions/api/controllers/upload.ts
import { Context, mammoth } from "../deps.ts";
import { parsePlanificare } from "../utils/planificare-parser.ts";
import { generateMaterials as aiGenerate } from "../utils/ai-parser.ts";
import { generateDocx, generateBulkDocx } from "../utils/docx-exporter.ts";
import { generatePdf, generateBulkPdf } from "../utils/pdf-exporter.ts";

// Helper to extract text from buffer
async function extractText(buffer: Uint8Array, filename: string): Promise<string> {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') {
        const { default: pdf } = await import("npm:pdf-parse@1.1.1");
        const data = await pdf(Buffer.from(buffer));
        return data.text || "";
    } else if (ext === 'docx') {
        const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
        return result.value || "";
    }
    return "";
}

export const uploadPlanificare = async (ctx: Context) => {
    const body = ctx.request.body({ type: 'form-data' });
    const formData = await body.value.read();
    const file = formData.files?.[0];

    if (!file || !file.content) {
        ctx.response.status = 400;
        ctx.response.body = { success: false, error: "Lipsește fișierul." };
        return;
    }

    try {
        const text = await extractText(file.content, file.originalName);
        if (!text.trim()) throw new Error("Nu am putut extrage text.");

        const result = parsePlanificare(text);
        ctx.response.body = { success: true, ...result };
    } catch (err) {
        ctx.response.status = 500;
        ctx.response.body = { success: false, error: "Eroare la procesare: " + err.message };
    }
};

export const generateMaterials = async (ctx: Context) => {
    const body = await ctx.request.body({ type: 'json' }).value;
    try {
        const materials = await aiGenerate(body);
        ctx.response.body = { success: true, ...materials };
    } catch (err) {
        ctx.response.status = 500;
        ctx.response.body = { success: false, error: err.message };
    }
};

export const exportDocx = async (ctx: Context) => {
    const body = await ctx.request.body({ type: 'json' }).value;
    try {
        const buffer = await generateDocx(body);
        ctx.response.headers.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        ctx.response.body = buffer;
    } catch (err) {
        ctx.response.status = 500;
        ctx.response.body = { success: false, error: err.message };
    }
};

export const exportPdf = async (ctx: Context) => {
    const body = await ctx.request.body({ type: 'json' }).value;
    try {
        const buffer = await generatePdf(body);
        ctx.response.headers.set('Content-Type', 'application/pdf');
        ctx.response.body = buffer;
    } catch (err) {
        ctx.response.status = 500;
        ctx.response.body = { success: false, error: err.message };
    }
};
