// supabase/functions/api/db.ts
import { MongoClient } from "./deps.ts";

const MONGODB_URI = Deno.env.get("MONGODB_URI");

if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set");
}

let client: MongoClient | null = null;
let db: any = null;

export async function connectDB() {
  if (db) return db;
  
  try {
    if (!client) {
      client = new MongoClient(MONGODB_URI!);
    }
    await client.connect();
    db = client.db("curricula");
    console.log("MongoDB Connected (Deno)");
    return db;
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
    throw err;
  }
}

export function getDb() {
  return db;
}
