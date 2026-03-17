// supabase/functions/api/deps.ts

// Oak framework for Deno
export { Application, Router, Context, send } from "https://deno.land/x/oak@v12.6.1/mod.ts";
export { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";

// MongoDB
export { MongoClient, ObjectId } from "npm:mongodb@6.1.0";

// Auth
export * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
export { create, verify, decode, getNumericDate } from "https://deno.land/x/djwt@v2.9/mod.ts";

// AI
export { GoogleGenerativeAI } from "npm:@google/generative-ai@0.11.4";

// Document Exporters
export * as docx from "npm:docx@8.2.2";
export { default as PDFDocument } from "npm:pdfkit@0.13.0";

// Parsers
export { default as mammoth } from "npm:mammoth@1.6.0";
// pdf-parse doesn't play well with Deno sometimes, might need alternative or strictly npm:
// export { default as pdfParse } from "npm:pdf-parse@1.1.1"; 
