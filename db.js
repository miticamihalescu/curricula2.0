const fs = require('fs');
const path = require('path');

/**
 * Baza de date simplă bazată pe fișier JSON.
 * Fișierul `users.json` se creează automat în directorul proiectului.
 * Suportă oricâți utilizatori — fiecare cont nou se adaugă în array.
 */

// În mediul serverless (Netlify), sistemul de fișiere este Read-Only.
// Singurul folder în care avem voie să scriem temporar este /tmp.
const isNetlify = process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME;
const DB_PATH = isNetlify ? path.join('/tmp', 'users.json') : path.join(process.cwd(), 'users.json');
const DB_PLANS_PATH = isNetlify ? path.join('/tmp', 'plans.json') : path.join(process.cwd(), 'plans.json');

/**
 * Citește toți utilizatorii din fișier.
 * Dacă fișierul nu există, returnează un array gol.
 */
function readUsers() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            return [];
        }
        const data = fs.readFileSync(DB_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Eroare la citirea bazei de date:', err.message);
        return [];
    }
}

/**
 * Scrie array-ul de utilizatori în fișier.
 */
function writeUsers(users) {
    fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2), 'utf-8');
}

/**
 * Caută un utilizator după email.
 * @returns {Object|null} Utilizatorul găsit sau null.
 */
function findUserByEmail(email) {
    const users = readUsers();
    return users.find(u => u.email === email.toLowerCase()) || null;
}

/**
 * Caută un utilizator după ID.
 * @returns {Object|null} Utilizatorul găsit sau null.
 */
function findUserById(id) {
    const users = readUsers();
    return users.find(u => u.id === id) || null;
}

/**
 * Creează un utilizator nou și îl salvează.
 * @returns {Object} Utilizatorul creat (cu ID generat).
 */
function createUser({ nume, email, parola }) {
    const users = readUsers();

    const newUser = {
        id: 'USR-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
        nume: nume.trim(),
        email: email.toLowerCase().trim(),
        parola, // deja hash-uit cu bcrypt
        dataCrearii: new Date().toISOString()
    };

    users.push(newUser);
    writeUsers(users);

    return newUser;
}

/**
 * Funcție de conectare (compatibilitate cu server.js).
 * La JSON nu avem nevoie de conectare, doar verificăm/creăm fișierul.
 */
async function connectDB() {
    // În mediul Serverless trebuie să scriem /tmp dacă fișierele nu există la primul request pe instanță.
    if (!fs.existsSync(DB_PATH)) {
        // Dacă e mock, punem userul default ca să meargă login-ul în demo
        const isNetlify = process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME;
        let pUsers = [];
        if (isNetlify) {
            try {
                // Încercăm să copiem din root-ul de citire (de unde e build-uit pachetul)
                const defaultUsersPath = path.join(process.cwd(), 'users.json');
                if (fs.existsSync(defaultUsersPath)) {
                    pUsers = JSON.parse(fs.readFileSync(defaultUsersPath, 'utf-8'));
                }
            } catch (e) { console.error('Nu s-a putut citi users.json default', e.message); }
        }
        writeUsers(pUsers);
        console.log('📁 Bază de date creată: users.json');
    } else {
        const users = readUsers();
        console.log(`📁 Bază de date încărcată: ${users.length} utilizatori în users.json`);
    }

    if (!fs.existsSync(DB_PLANS_PATH)) {
        writePlans([]);
        console.log('📁 Bază de date creată: plans.json');
    } else {
        const plans = readPlans();
        console.log(`📁 Bază de date încărcată: ${plans.length} planificări în plans.json`);
    }
}

/**
 * Actualizează datele unui utilizator.
 * @param {string} email Email-ul utilizatorului.
 * @param {Object} updates Câmpurile de actualizat.
 * @returns {Object|null} Utilizatorul actualizat sau null.
 */
function updateUser(email, updates) {
    const users = readUsers();
    const index = users.findIndex(u => u.email === email.toLowerCase());
    if (index === -1) return null;

    users[index] = { ...users[index], ...updates };
    writeUsers(users);
    return users[index];
}

// ===== PLANIFICĂRI =====

function readPlans() {
    try {
        if (!fs.existsSync(DB_PLANS_PATH)) return [];
        const data = fs.readFileSync(DB_PLANS_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Eroare la citirea plans.json:', err.message);
        return [];
    }
}

function writePlans(plans) {
    fs.writeFileSync(DB_PLANS_PATH, JSON.stringify(plans, null, 2), 'utf-8');
}

function createPlan(userId, planData) {
    const plans = readPlans();
    const newPlan = {
        id: 'PLAN-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
        userId,
        ...planData,
        dataCrearii: new Date().toISOString()
    };
    plans.push(newPlan);
    writePlans(plans);
    return newPlan;
}

function getPlansByUser(userId) {
    return readPlans().filter(p => p.userId === userId).sort((a, b) => new Date(b.dataCrearii) - new Date(a.dataCrearii));
}

function getPlanById(planId) {
    return readPlans().find(p => p.id === planId) || null;
}

function deletePlan(planId, userId) {
    let plans = readPlans();
    const initialLength = plans.length;
    // se asigură că șterge doar dacă planul îi aparține
    plans = plans.filter(p => !(p.id === planId && p.userId === userId));
    if (plans.length < initialLength) {
        writePlans(plans);
        return true;
    }
    return false;
}

module.exports = {
    connectDB, findUserByEmail, findUserById, createUser, updateUser,
    createPlan, getPlansByUser, getPlanById, deletePlan
};
