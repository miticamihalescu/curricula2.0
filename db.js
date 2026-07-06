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
let imagesCollection;    // biblioteca de imagini per profesor
let feedbackCollection;  // feedback pe materialele generate (👍/👎 + comentariu)
let eventsCollection;    // evenimente de utilizare (upload, generare, export) — analytics intern
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
        imagesCollection = db.collection("images");       // biblioteca imagini profesor
        feedbackCollection = db.collection("feedback");   // feedback materiale generate
        eventsCollection = db.collection("events");       // evenimente de utilizare (analytics)
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
    await imagesCollection.createIndex({ userId: 1, dataCrearii: -1 }, { background: true });
    // Un singur feedback per material per utilizator — al doilea vot suprascrie primul
    await feedbackCollection.createIndex({ userId: 1, planId: 1, lectieId: 1, tip: 1 }, { unique: true, background: true });
    await eventsCollection.createIndex({ tip: 1, dataCrearii: -1 }, { background: true });
    await eventsCollection.createIndex({ userId: 1, dataCrearii: -1 }, { background: true });
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

    // Driver v4 returnează result.value, driver v5+ returnează documentul direct
    return result?.value ?? result;
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

async function getPlansByUser(userId, { page = 1, limit = 50 } = {}) {
    if (!plansCollection) return { plans: [], total: 0 };

    const skip = (page - 1) * limit;
    const [plans, total] = await Promise.all([
        plansCollection.find({ userId }).sort({ dataCrearii: -1 }).skip(skip).limit(limit).toArray(),
        plansCollection.countDocuments({ userId })
    ]);
    return { plans, total, page, limit };
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

// Șterge planul doar după ID, fără verificarea userId — folosit DOAR ca fallback
// când planul apare în lista utilizatorului dar userId-ul din DB e inconsistent.
async function deletePlanFortat(planId) {
    if (!plansCollection) return false;

    const result = await plansCollection.deleteOne({ id: planId });
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
    return await materialsCollection.find({ planId }, { projection: { _id: 0, planId: 1, lectieId: 1, tip: 1, continut: 1 } }).toArray();
}

// ===== IMAGINI =====

async function saveImage(userId, { filename, mimeType, dataBase64, size }) {
    if (!imagesCollection) throw new Error('Database not connected');
    const img = {
        id: 'IMG-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
        userId,
        filename,
        mimeType,
        dataBase64,
        size,
        dataCrearii: new Date().toISOString()
    };
    await imagesCollection.insertOne(img);
    return img;
}

async function getImagesByUser(userId) {
    if (!imagesCollection) return [];
    return await imagesCollection
        .find({ userId }, { projection: { dataBase64: 0 } }) // fără date binare la listare
        .sort({ dataCrearii: -1 })
        .toArray();
}

async function getImageById(imageId, userId) {
    if (!imagesCollection) return null;
    return await imagesCollection.findOne({ id: imageId, userId });
}

async function getImagesByIds(imageIds, userId) {
    if (!imagesCollection || !imageIds?.length) return [];
    return await imagesCollection.find({ id: { $in: imageIds }, userId }).toArray();
}

async function deleteImage(imageId, userId) {
    if (!imagesCollection) return false;
    const result = await imagesCollection.deleteOne({ id: imageId, userId });
    return result.deletedCount > 0;
}

// ===== FEEDBACK MATERIALE =====

/**
 * Salvează feedback-ul unui profesor pe un material generat.
 * rating: 'pozitiv' | 'negativ'. Un vot nou de la același user pe același material suprascrie votul vechi.
 */
async function saveFeedback(userId, { planId, lectieId, tip, rating, comentariu }) {
    if (!feedbackCollection) throw new Error("Database not connected");

    const filter = { userId, planId, lectieId: Number(lectieId), tip };
    const update = {
        $set: {
            userId,
            planId,
            lectieId: Number(lectieId),
            tip,                                    // 'proiect' | 'fisa' | 'test'
            rating,                                 // 'pozitiv' | 'negativ'
            comentariu: (comentariu || '').trim().slice(0, 1000), // max 1000 caractere
            dataActualizarii: new Date().toISOString()
        },
        $setOnInsert: {
            id: 'FBK-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
            dataCrearii: new Date().toISOString()
        }
    };

    await feedbackCollection.updateOne(filter, update, { upsert: true });
    return await feedbackCollection.findOne(filter);
}

/**
 * Returnează tot feedback-ul, cel mai recent primul — pentru panoul de admin.
 */
async function getAllFeedback({ limit = 200 } = {}) {
    if (!feedbackCollection) return [];
    return await feedbackCollection
        .find({}, { projection: { _id: 0 } })
        .sort({ dataActualizarii: -1 })
        .limit(limit)
        .toArray();
}

// ===== EVENIMENTE (ANALYTICS INTERN) =====

/**
 * Loghează un eveniment de utilizare. Fire-and-forget: nu aruncă niciodată,
 * ca să nu strice fluxul principal dacă logging-ul eșuează.
 * tip: 'upload_planificare' | 'generare_proiect' | 'generare_fisa' | 'generare_test' |
 *      'generare_cache_hit' | 'export_docx' | 'export_pdf' | ...
 */
async function logEvent(userId, tip, detalii = {}) {
    try {
        if (!eventsCollection) return;
        await eventsCollection.insertOne({
            userId,
            tip,
            detalii,
            dataCrearii: new Date().toISOString()
        });
    } catch (err) {
        logger.warn('Eveniment nelogat', { tip, error: err.message });
    }
}

/**
 * Statistici agregate pe evenimente — pentru panoul de admin.
 * Returnează numărul de evenimente per tip + numărul de utilizatori unici per tip.
 */
async function getEventStats({ zile = 30 } = {}) {
    if (!eventsCollection) return [];
    const dataStart = new Date(Date.now() - zile * 24 * 60 * 60 * 1000).toISOString();

    return await eventsCollection.aggregate([
        { $match: { dataCrearii: { $gte: dataStart } } },
        {
            $group: {
                _id: '$tip',
                total: { $sum: 1 },
                utilizatori: { $addToSet: '$userId' }
            }
        },
        {
            $project: {
                _id: 0,
                tip: '$_id',
                total: 1,
                utilizatoriUnici: { $size: '$utilizatori' }
            }
        },
        { $sort: { total: -1 } }
    ]).toArray();
}

function getDb() { return db; }

// Șterge toate datele unui utilizator — apelat la ștergerea contului
async function deleteUserData(userId, email) {
    // Ștergem toate colecțiile în paralel pentru eficiență
    await Promise.all([
        plansCollection?.deleteMany({ userId }),
        materialsCollection?.deleteMany({ userId }),
        imagesCollection?.deleteMany({ userId }),
        feedbackCollection?.deleteMany({ userId }),
        eventsCollection?.deleteMany({ userId }),
        usersCollection?.deleteOne({ email: email.toLowerCase() })
    ]);
}

module.exports = {
    connectDB, isConnected, getDb,
    findUserByEmail, findUserById, createUser, updateUser, findUserByResetToken, findUserByVerifyToken,
    incrementGenerari,
    createPlan, getPlansByUser, getPlanById, deletePlan, deletePlanFortat,
    getMaterial, saveMaterial, getMaterialsByPlan, getImagesByIds,
    saveImage, getImagesByUser, getImageById, deleteImage,
    saveFeedback, getAllFeedback, logEvent, getEventStats,
    deleteUserData
};
