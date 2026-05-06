const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const logger = require('./logger');

// Railway poate folosi MONGO_URL, MONGODB_URL sau MONGODB_URI
const uri = process.env.MONGODB_URI || process.env.MONGODB_URL || process.env.MONGO_URL;
if (!uri) {
    logger.warn('Lipsește MONGODB_URI din variabilele de mediu!');
}

const client = new MongoClient(uri || 'mongodb://localhost/curricula-fallback', {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let db;
let usersCollection;
let plansCollection;
let materialsCollection; // materiale generate la cerere
let bulkJobsCollection;  // rezultate generare bulk (înlocuiește in-memory jobStore)
let _connected = false;

function isConnected() {
    return _connected;
}

async function connectDB() {
    try {
        await client.connect();
        db = client.db("CurriculaApp");
        usersCollection = db.collection("users");
        plansCollection = db.collection("plans");
        materialsCollection = db.collection("materials"); // materiale generate la cerere
        bulkJobsCollection = db.collection("bulk_jobs");  // rezultate generare bulk
        _connected = true;
        logger.info('Conexiune reușită la MongoDB Cloud!', { host: uri?.split('@')[1]?.split('/')[0] || 'local' });

        // Creăm indecșii în background — non-blocking, nu blochează pornirea
        crearindecsi().catch(err => logger.warn('Eroare la crearea indecșilor:', { error: err.message }));
    } catch (err) {
        _connected = false;
        logger.error('Eroare la conectarea cu MongoDB', { error: err.message, stack: err.stack });
    }
}

async function crearindecsi() {
    await usersCollection.createIndex({ email: 1 }, { unique: true, background: true });
    await plansCollection.createIndex({ userId: 1, dataCrearii: -1 }, { background: true });
    await materialsCollection.createIndex({ planId: 1, lectieId: 1, tip: 1 }, { unique: true, background: true });
    logger.info('Indecși MongoDB verificați/creați cu succes.');
}

// ===== UTILIZATORI =====

async function findUserByEmail(email) {
    if (!usersCollection) return null;
    return await usersCollection.findOne({ email: email.toLowerCase() });
}

async function findUserById(id) {
    if (!usersCollection) return null;
    return await usersCollection.findOne({ id: id });
}

async function createUser({ nume, email, parola, emailVerifyToken }) {
    if (!usersCollection) throw new Error("Database not connected");

    const newUser = {
        id: 'USR-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
        nume: nume.trim(),
        email: email.toLowerCase().trim(),
        parola,
        tier: 'free',             // 'free' | 'pro'
        generariLuna: 0,          // contor generări în luna curentă
        dataUltimaGenerare: null, // ISO string — pentru resetul lunar
        emailVerificat: false,    // setat pe true după confirmare email
        emailVerifyToken: emailVerifyToken || null,
        dataCrearii: new Date().toISOString()
    };

    await usersCollection.insertOne(newUser);
    return newUser;
}

async function updateUser(email, updates) {
    if (!usersCollection) return null;

    const { _id, ...safeUpdates } = updates;

    const result = await usersCollection.findOneAndUpdate(
        { email: email.toLowerCase() },
        { $set: safeUpdates },
        { returnDocument: 'after' }
    );

    return result.value;
}

// Incrementează contorul de generări al utilizatorului.
// Resetează contorul dacă suntem într-o lună nouă față de ultima generare.
async function incrementGenerari(userId) {
    if (!usersCollection) return;

    const user = await usersCollection.findOne({ id: userId });
    if (!user) return;

    const acum = new Date();
    const ultimaGenerare = user.dataUltimaGenerare ? new Date(user.dataUltimaGenerare) : null;

    // Resetăm contorul dacă e o lună nouă
    const eLunaNoua = !ultimaGenerare ||
        ultimaGenerare.getFullYear() !== acum.getFullYear() ||
        ultimaGenerare.getMonth() !== acum.getMonth();

    const nouGenerariLuna = eLunaNoua ? 1 : (user.generariLuna || 0) + 1;

    await usersCollection.updateOne(
        { id: userId },
        { $set: { generariLuna: nouGenerariLuna, dataUltimaGenerare: acum.toISOString() } }
    );

    return nouGenerariLuna;
}

async function findUserByResetToken(token) {
    if (!usersCollection) return null;
    return await usersCollection.findOne({
        resetToken: token,
        resetExpires: { $gt: Date.now() }
    });
}

async function findUserByVerifyToken(token) {
    if (!usersCollection) return null;
    return await usersCollection.findOne({ emailVerifyToken: token });
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

// ===== MATERIALE GENERATE =====

/**
 * Returnează un material specific (planId + lectieId + tip).
 * tip: 'proiect' | 'fisa' | 'test'
 */
async function getMaterial(planId, lectieId, tip) {
    if (!materialsCollection) return null;
    return await materialsCollection.findOne({ planId, lectieId: Number(lectieId), tip });
}

/**
 * Salvează (sau suprascrie) un material generat.
 * Folosim upsert pentru a evita duplicate.
 */
async function saveMaterial(planId, userId, lectieId, tip, continut) {
    if (!materialsCollection) throw new Error("Database not connected");

    const filter = { planId, lectieId: Number(lectieId), tip };
    const update = {
        $set: {
            planId,
            userId,
            lectieId: Number(lectieId),
            tip,
            continut,
            dataActualizarii: new Date().toISOString()
        },
        $setOnInsert: {
            id: 'MAT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
            dataCrearii: new Date().toISOString()
        }
    };

    await materialsCollection.updateOne(filter, update, { upsert: true });
    return await materialsCollection.findOne(filter);
}

/**
 * Returnează toate materialele generate pentru o planificare.
 * Util pentru a încărca cache-ul în dashboard la deschiderea unui plan.
 */
async function getMaterialsByPlan(planId) {
    if (!materialsCollection) return [];
    return await materialsCollection.find({ planId }).toArray();
}

// ===== JOB-URI GENERARE BULK =====

/**
 * Salvează rezultatele unui job de generare bulk în DB.
 * Expiră automat după 30 de minute.
 */
async function saveJob(jobId, userId, generated, meta) {
    if (!bulkJobsCollection) throw new Error("Database not connected");

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await bulkJobsCollection.insertOne({
        id: jobId,
        userId,
        generated,
        meta,
        expiresAt,
        dataCrearii: new Date().toISOString()
    });
}

/**
 * Returnează un job după ID dacă nu a expirat.
 */
async function getJob(jobId) {
    if (!bulkJobsCollection) return null;
    const job = await bulkJobsCollection.findOne({ id: jobId });
    if (!job) return null;
    if (new Date(job.expiresAt) < new Date()) {
        await bulkJobsCollection.deleteOne({ id: jobId });
        return null;
    }
    return job;
}

module.exports = {
    connectDB, isConnected,
    findUserByEmail, findUserById, createUser, updateUser, findUserByResetToken, findUserByVerifyToken,
    incrementGenerari,
    createPlan, getPlansByUser, getPlanById, deletePlan,
    getMaterial, saveMaterial, getMaterialsByPlan,
    saveJob, getJob
};
