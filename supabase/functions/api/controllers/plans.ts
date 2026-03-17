// supabase/functions/api/controllers/plans.ts
import { Context } from "../deps.ts";
import { connectDB } from "../db.ts";

export const getPlans = async (ctx: Context) => {
  const userId = (ctx.state.user as any).id;
  const db = await connectDB();
  const plansCollection = db.collection("plans");

  const plans = await plansCollection.find({ userId }).sort({ dataCrearii: -1 }).toArray();
  ctx.response.body = { success: true, plans };
};

export const getPlanById = async (ctx: Context) => {
  const userId = (ctx.state.user as any).id;
  const planId = (ctx as any).params.id; // Oak Router puts params in ctx.params
  
  const db = await connectDB();
  const plansCollection = db.collection("plans");

  const plan = await plansCollection.findOne({ id: planId });
  if (!plan) {
    ctx.response.status = 404;
    ctx.response.body = { success: false, error: "Planificarea nu a fost găsită." };
    return;
  }

  if (plan.userId !== userId) {
    ctx.response.status = 403;
    ctx.response.body = { success: false, error: "Acces interzis la această planificare." };
    return;
  }

  ctx.response.body = { success: true, plan };
};

export const createPlan = async (ctx: Context) => {
  const userId = (ctx.state.user as any).id;
  const body = await ctx.request.body({ type: 'json' }).value;
  const { metadata, lectii, clasa, disciplina } = body;

  if (!lectii || !Array.isArray(lectii)) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "Lista de lecții este obligatorie." };
    return;
  }

  const db = await connectDB();
  const plansCollection = db.collection("plans");

  const planId = 'PLAN-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  
  const newPlan = {
    id: planId,
    userId,
    metadata,
    lectii,
    clasa,
    disciplina,
    dataCrearii: new Date().toISOString()
  };

  await plansCollection.insertOne(newPlan);
  ctx.response.status = 201;
  ctx.response.body = { success: true, message: "Planificarea a fost salvată.", planId };
};

export const deletePlan = async (ctx: Context) => {
  const userId = (ctx.state.user as any).id;
  const planId = (ctx as any).params.id;

  const db = await connectDB();
  const plansCollection = db.collection("plans");

  const result = await plansCollection.deleteOne({ id: planId, userId });
  if (result.deletedCount === 1) {
    ctx.response.body = { success: true, message: "Planificarea a fost ștearsă." };
  } else {
    ctx.response.status = 404;
    ctx.response.body = { success: false, error: "Planificarea nu a fost găsită." };
  }
};
