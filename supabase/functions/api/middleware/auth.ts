// supabase/functions/api/middleware/auth.ts
import { verify, Context, getNumericDate } from "../deps.ts";

const JWT_SECRET = Deno.env.get("JWT_SECRET") || "secret";

// djwt requires a CryptoKey. We converts the string secret.
const encoder = new TextEncoder();
const keyData = encoder.encode(JWT_SECRET);
const key = await crypto.subtle.importKey(
  "raw",
  keyData,
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["verify", "sign"]
);

export const authMiddleware = async (ctx: Context, next: () => Promise<unknown>) => {
  const authHeader = ctx.request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    ctx.response.status = 401;
    ctx.response.body = { message: "Nu ești autorizat. Te rugăm să te autentifici." };
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = await verify(token, key);
    // Check expiration if not handled by verify
    if (payload.exp && getNumericDate(new Date()) > payload.exp) {
        throw new Error("Token expired");
    }
    
    ctx.state.user = payload;
    await next();
  } catch (err) {
    ctx.response.status = 401;
    ctx.response.body = { message: "Token invalid sau expirat." };
  }
};

export async function createToken(payload: any) {
    const header = { alg: "HS256", typ: "JWT" } as const;
    const exp = getNumericDate(60 * 60 * 24); // 24 hours
    return await (import("../deps.ts").then(d => d.create(header, { ...payload, exp }, key)));
}

export async function hashPassword(password: string) {
    const d = await import("../deps.ts");
    return await d.bcrypt.hash(password);
}

export async function comparePassword(password: string, hash: string) {
    const d = await import("../deps.ts");
    return await d.bcrypt.compare(password, hash);
}
