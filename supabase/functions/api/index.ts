// supabase/functions/api/index.ts
import { Application, Router, Context, oakCors } from "./deps.ts";
import { authMiddleware } from "./middleware/auth.ts";
import * as auth from "./controllers/auth.ts";
import * as plans from "./controllers/plans.ts";
import * as upload from "./controllers/upload.ts";

const app = new Application();
const router = new Router();

// Routes
router.get("/health", (ctx) => {
  ctx.response.body = { status: "ok", time: new Date().toISOString() };
});

// Auth
router.post("/auth/register", auth.register);
router.post("/auth/login", auth.login);
router.post("/auth/forgot-password", auth.forgotPassword);

// Plans (Protected)
router.get("/plans", authMiddleware, plans.getPlans);
router.get("/plans/:id", authMiddleware, plans.getPlanById);
router.post("/plans", authMiddleware, plans.createPlan);
router.delete("/plans/:id", authMiddleware, plans.deletePlan);

// Upload & Generate (Protected)
router.post("/upload-planificare", authMiddleware, upload.uploadPlanificare);
router.post("/parse-planificare", authMiddleware, upload.uploadPlanificare); // Re-use same for now
router.post("/generate-materials", authMiddleware, upload.generateMaterials);
router.post("/export-docx", authMiddleware, upload.exportDocx);
router.post("/export-pdf", authMiddleware, upload.exportPdf);

app.use(oakCors());
app.use(router.routes());
app.use(router.allowedMethods());

console.log("Supabase Edge Function started (Oak)");

// Edge Functions use Deno.serve (internally handled by Supabase, but Oak can use it)
// In Supabase, we just need to handle the request.
Deno.serve(async (req) => {
  try {
    return await app.handle(req);
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
