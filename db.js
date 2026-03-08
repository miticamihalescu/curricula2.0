const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;
if (!uri) {
    console.error("Lipsește MONGODB_URI din fișierul .env (sau din variabilele mediului Netlify)!");
}

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let db;
let usersCollection;
let plansCollection;

/**
 * Conectează la baza de date MongoDB
 */
async function connectDB() {
    try {
        await client.connect();
        db = client.db("CurriculaApp");
        usersCollection = db.collection("users");
        plansCollection = db.collection("plans");
        console.log("✅ Conexiune reușită la MongoDB Cloud!");
    } catch (err) {
        console.error("❌ Eroare la conectarea cu MongoDB:", err);
    }
}

// ===== UTILIZATORI =====

/**
 * Caută un utilizator după email.
 */
async function findUserByEmail(email) {
    if (!usersCollection) return null;
    return await usersCollection.findOne({ email: email.toLowerCase() });
}

/**
 * Caută un utilizator după ID.
 */
async function findUserById(id) {
    if (!usersCollection) return null;
    return await usersCollection.findOne({ id: id });
}

/**
 * Creează un utilizator nou și îl salvează.
 */
async function createUser({ nume, email, parola }) {
    if (!usersCollection) throw new Error("Database not connected");

    const newUser = {
        id: 'USR-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
        nume: nume.trim(),
        email: email.toLowerCase().trim(),
        parola, // hash-uit deja din server.js
        dataCrearii: new Date().toISOString()
    };

    await usersCollection.insertOne(newUser);
    return newUser;
}

/**
 * Actualizează datele unui utilizator.
 */
async function updateUser(email, updates) {
    if (!usersCollection) return null;

    // Asigură-te că nu încercăm să modificăm id-ul intern (_id) al MongoDB, doar variabilele noastre
    const { _id, ...safeUpdates } = updates;

    const result = await usersCollection.findOneAndUpdate(
        { email: email.toLowerCase() },
        { $set: safeUpdates },
        { returnDocument: 'after' } // Returnează documentul modificat
    );

    return result.value;
}

// ===== PLANIFICĂRI =====

async function createPlan(userId, planData) {
    if (!plansCollection) throw new Error("Database not connected");

    const newPlan = {
        id: 'PLAN-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
        userId,
        ...planData,
        dataCrearii: new Date().toISOString()
    };

    await plansCollection.insertOne(newPlan);
    return newPlan;
}

async function getPlansByUser(userId) {
    if (!plansCollection) return [];

    const plansCursor = plansCollection.find({ userId: userId }).sort({ dataCrearii: -1 });
    return await plansCursor.toArray();
}

async function getPlanById(planId) {
    if (!plansCollection) return null;

    return await plansCollection.findOne({ id: planId });
}

async function deletePlan(planId, userId) {
    if (!plansCollection) return false;

    const result = await plansCollection.deleteOne({ id: planId, userId: userId });
    return result.deletedCount === 1;
}

module.exports = {
    connectDB, findUserByEmail, findUserById, createUser, updateUser,
    createPlan, getPlansByUser, getPlanById, deletePlan
};
