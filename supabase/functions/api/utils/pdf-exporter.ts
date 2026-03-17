// supabase/functions/api/utils/pdf-exporter.ts
import { PDFDocument } from "../deps.ts";

export async function generatePdf(data: any) {
    // pdfkit might need adjustments for Deno binary output
    const doc = new PDFDocument();
    const chunks: Uint8Array[] = [];
    
    return new Promise((resolve) => {
        doc.on('data', (chunk: any) => chunks.push(new Uint8Array(chunk)));
        doc.on('end', () => resolve(concatUint8Arrays(chunks)));
        
        doc.text("Proiect Didactic: " + (data.titlu_lectie || "Lecție"));
        doc.end();
    });
}

function concatUint8Arrays(arrays: Uint8Array[]) {
    const totalLength = arrays.reduce((acc, value) => acc + value.length, 0);
    const result = new Uint8Array(totalLength);
    let length = 0;
    for (const array of arrays) {
        result.set(array, length);
        length += array.length;
    }
    return result;
}

export async function generateBulkPdf(data: any) {
    return generatePdf(data); // placeholder
}
