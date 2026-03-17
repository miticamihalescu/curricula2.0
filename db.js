const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const logger = require('./logger');

const uri = process.env.MONGODB_URI;
if (!uri) {
    logger.warn('Lipsește MONGODB_URI din fișierul .env (sau din variabilele mediului Netlify)!');
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
        _connected = true;
        logger.info('Conexiune reușită la MongoDB Cloud!', { host: uri?.split('@')[1]?.split('/')[0] || 'local' });
    } catch (err) {
        _connected = false;
        logger.error('Eroare la conectarea cu MongoDB', { error: err.message, stack: err.stack });
    }
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

async function createUser({ nume, email, parola }) {
    if (!usersCollection) throw new Error("Database not connected");

    const newUser = {
        id: 'USR-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
        nume: nume.trim(),
        email: email.toLowerCase().trim(),
        parola, 
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

async function findUserByResetToken(token) {
    if (!usersCollection) return null;
    return await usersCollection.findOne({ 
        resetToken: token, 
        resetExpires: { $gt: Date.now() } 
    });
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
    connectDB, isConnected,
    findUserByEmail, findUserById, createUser, updateUser, findUserByResetToken,
    createPlan, getPlansByUser, getPlanById, deletePlan
};
