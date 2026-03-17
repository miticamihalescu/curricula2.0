// supabase/functions/api/controllers/auth.ts
import { Context } from "../deps.ts";
import { connectDB } from "../db.ts";
import { createToken, hashPassword, comparePassword } from "../middleware/auth.ts";

export const register = async (ctx: Context) => {
  const body = await ctx.request.body({ type: 'json' }).value;
  const { nume, email, parola } = body;

  const db = await connectDB();
  const users = db.collection("users");

  const existing = await users.findOne({ email });
  if (existing) {
    ctx.response.status = 400;
    ctx.response.body = { message: "Utilizatorul există deja." };
    return;
  }

  const hashedPassword = await hashPassword(parola);
  const result = await users.insertOne({
    nume,
    email,
    parola: hashedPassword,
    createdAt: new Date()
  });

  const token = await createToken({ id: result.insertedId, email });
  ctx.response.body = { token, user: { id: result.insertedId, nume, email } };
};

export const login = async (ctx: Context) => {
  const body = await ctx.request.body({ type: 'json' }).value;
  const { email, parola } = body;

  const db = await connectDB();
  const users = db.collection("users");

  const user = await users.findOne({ email });
  if (!user) {
    ctx.response.status = 400;
    ctx.response.body = { message: "Date de autentificare invalide." };
    return;
  }

  const isMatch = await comparePassword(parola, user.parola);
  if (!isMatch) {
    ctx.response.status = 400;
    ctx.response.body = { message: "Date de autentificare invalide." };
    return;
  }

  const token = await createToken({ id: user._id, email });
  ctx.response.body = { token, user: { id: user._id, nume: user.nume, email: user.email } };
};

// Simplified forgot password for now (matching original logic of just returning Success if user exists)
// REAL implementation would send an email
export const forgotPassword = async (ctx: Context) => {
    const body = await ctx.request.body({ type: 'json' }).value;
    const { email } = body;
    const db = await connectDB();
    const user = await db.collection("users").findOne({ email });
    
    if (!user) {
        ctx.response.status = 404;
        ctx.response.body = { message: "Utilizatorul nu a fost găsit." };
        return;
    }

    ctx.response.body = { message: "Dacă adresa de email există în baza noastră de date, veți primi un link de resetare." };
};
