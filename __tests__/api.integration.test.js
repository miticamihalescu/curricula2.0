'use strict';

/**
 * Teste de integrare pentru API-ul Curricula.
 *
 * Strategia de mock:
 *  - `db.js`        → mock complet (fără conexiune MongoDB reală)
 *  - `ai-parser.js` → mock (fără apeluri Google Gemini)
 *
 * Toate endpoint-urile sunt testate prin supertest direct pe instanța Express.
 */

// Setăm variabilele de mediu ÎNAINTE de orice require
process.env.JWT_SECRET     = 'test-integration-secret-curricula-2025';
process.env.MONGODB_URI    = 'mongodb://localhost/curricula-test-mock';

// ─── Mock-uri de module ───────────────────────────────────────────────────────

// Rate limiter → no-op în teste (altfel al 6-lea request preia 429)
jest.mock('express-rate-limit', () => () => (req, res, next) => next());

jest.mock('../db', () => ({
    connectDB:      jest.fn().mockResolvedValue(undefined),
    findUserByEmail: jest.fn(),
    findUserById:    jest.fn(),
    createUser:      jest.fn(),
    updateUser:      jest.fn(),
    createPlan:      jest.fn(),
    getPlansByUser:  jest.fn(),
    getPlanById:     jest.fn(),
    deletePlan:      jest.fn(),
}));

jest.mock('../ai-parser', () => ({
    generateMaterials: jest.fn().mockResolvedValue({
        proiect_didactic: 'Mock proiect didactic generat',
        fisa_lucru:       'Mock fișă de lucru generată',
        test_evaluare:    'Mock test de evaluare generat',
    }),
    parsePlanificareAI: jest.fn().mockResolvedValue([]),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

const request = require('supertest');
const jwt     = require('bcryptjs') && require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const db      = require('../db');
const app     = require('../server');

const JWT_SECRET = process.env.JWT_SECRET;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeToken(userId = 'USR-TEST-001', email = 'test@curricula.ro') {
    return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '1h' });
}

function authHeader(token) {
    return { Authorization: `Bearer ${token}` };
}

// Utilizator mock cu parolă hash-uită (parola în clar: "Parola123!")
let HASHED_PASSWORD;
beforeAll(async () => {
    HASHED_PASSWORD = await bcrypt.hash('Parola123!', 10);
});

// Resetăm mock-urile între teste pentru izolare
beforeEach(() => {
    jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
    test('201 — cont nou creat cu date valide', async () => {
        db.findUserByEmail.mockResolvedValue(null);
        db.createUser.mockResolvedValue({
            id: 'USR-NEW-001',
            nume: 'Maria Ionescu',
            email: 'maria@test.ro',
            dataCrearii: new Date().toISOString(),
        });

        const res = await request(app)
            .post('/api/auth/register')
            .send({ nume: 'Maria Ionescu', email: 'maria@test.ro', parola: 'Parola123!' });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.user).toBeDefined();
        expect(res.body.user.email).toBe('maria@test.ro');
        expect(res.body.user).not.toHaveProperty('parola'); // parola nu se returnează
    });

    test('409 — email deja înregistrat', async () => {
        db.findUserByEmail.mockResolvedValue({ id: 'USR-EXIST', email: 'maria@test.ro' });

        const res = await request(app)
            .post('/api/auth/register')
            .send({ nume: 'Maria Ionescu', email: 'maria@test.ro', parola: 'Parola123!' });

        expect(res.status).toBe(409);
        expect(res.body.success).toBe(false);
    });

    test('400 — lipsesc câmpuri obligatorii (fără nume)', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'test@test.ro', parola: 'Parola123!' });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('400 — parola prea scurtă (sub 6 caractere)', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ nume: 'Test User', email: 'test@test.ro', parola: '123' });

        expect(res.status).toBe(400);
    });

    test('400 — email invalid', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ nume: 'Test User', email: 'nu-este-email', parola: 'Parola123!' });

        expect(res.status).toBe(400);
    });

    test('400 — body complet gol', async () => {
        const res = await request(app).post('/api/auth/register').send({});
        expect(res.status).toBe(400);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
    test('200 — autentificare reușită, returnează token JWT', async () => {
        db.findUserByEmail.mockResolvedValue({
            id: 'USR-001',
            nume: 'Ion Popescu',
            email: 'ion@curricula.ro',
            parola: HASHED_PASSWORD,
        });

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'ion@curricula.ro', parola: 'Parola123!' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.token).toBeDefined();
        expect(typeof res.body.token).toBe('string');
        expect(res.body.user.id).toBe('USR-001');
    });

    test('tokenul returnat de login este un JWT valid', async () => {
        db.findUserByEmail.mockResolvedValue({
            id: 'USR-001',
            nume: 'Ion Popescu',
            email: 'ion@curricula.ro',
            parola: HASHED_PASSWORD,
        });

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'ion@curricula.ro', parola: 'Parola123!' });

        const decoded = jwt.verify(res.body.token, JWT_SECRET);
        expect(decoded.userId).toBe('USR-001');
        expect(decoded.email).toBe('ion@curricula.ro');
    });

    test('401 — email inexistent în baza de date', async () => {
        db.findUserByEmail.mockResolvedValue(null);

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'ghost@test.ro', parola: 'Parola123!' });

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    test('401 — parolă greșită', async () => {
        db.findUserByEmail.mockResolvedValue({
            id: 'USR-001',
            email: 'ion@curricula.ro',
            parola: HASHED_PASSWORD,
        });

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'ion@curricula.ro', parola: 'ParodaGresita99!' });

        expect(res.status).toBe(401);
        expect(res.body.token).toBeUndefined();
    });

    test('400 — body gol', async () => {
        const res = await request(app).post('/api/auth/login').send({});
        expect(res.status).toBe(400);
    });

    test('400 — email invalid', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'nu-email', parola: 'Parola123!' });

        expect(res.status).toBe(400);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/plans
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/plans', () => {
    test('401 — fără token de autorizare', async () => {
        const res = await request(app).get('/api/plans');
        expect(res.status).toBe(401);
    });

    test('200 — returnează lista planificărilor utilizatorului', async () => {
        db.getPlansByUser.mockResolvedValue([
            { id: 'PLAN-1', disciplina: 'Informatică', clasa: '9' },
            { id: 'PLAN-2', disciplina: 'Matematică',  clasa: '10' },
        ]);

        const res = await request(app)
            .get('/api/plans')
            .set(authHeader(makeToken()));

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.plans)).toBe(true);
        expect(res.body.plans).toHaveLength(2);
    });

    test('200 — returnează array gol când utilizatorul nu are planuri', async () => {
        db.getPlansByUser.mockResolvedValue([]);

        const res = await request(app)
            .get('/api/plans')
            .set(authHeader(makeToken()));

        expect(res.status).toBe(200);
        expect(res.body.plans).toEqual([]);
    });

    test('getPlansByUser este apelat cu userId-ul din token', async () => {
        db.getPlansByUser.mockResolvedValue([]);
        const token = makeToken('USR-SPECIFIC-123');

        await request(app)
            .get('/api/plans')
            .set(authHeader(token));

        expect(db.getPlansByUser).toHaveBeenCalledWith('USR-SPECIFIC-123');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/plans
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/plans', () => {
    const validPlanBody = {
        clasa: '9',
        disciplina: 'Informatică',
        metadata: { scoala: 'Liceul Test', profesor: 'Ion Popescu' },
        lectii: [
            { titlu_lectie: 'Introducere în algoritmi', modul: 'Modul I', tip_ora: 'PREDARE' },
            { titlu_lectie: 'Structuri de date', modul: 'Modul I', tip_ora: 'PREDARE' },
        ],
    };

    test('401 — fără token', async () => {
        const res = await request(app).post('/api/plans').send(validPlanBody);
        expect(res.status).toBe(401);
    });

    test('201 — planificare salvată cu succes', async () => {
        db.createPlan.mockResolvedValue({ id: 'PLAN-NEW-001', ...validPlanBody });

        const res = await request(app)
            .post('/api/plans')
            .set(authHeader(makeToken()))
            .send(validPlanBody);

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.planId).toBeDefined();
    });

    test('createPlan este apelat cu userId-ul corect', async () => {
        db.createPlan.mockResolvedValue({ id: 'PLAN-001' });
        const token = makeToken('USR-OWNER-456');

        await request(app)
            .post('/api/plans')
            .set(authHeader(token))
            .send(validPlanBody);

        expect(db.createPlan).toHaveBeenCalledWith('USR-OWNER-456', expect.any(Object));
    });

    test('400 — lipsește câmpul lectii', async () => {
        const res = await request(app)
            .post('/api/plans')
            .set(authHeader(makeToken()))
            .send({ clasa: '9', disciplina: 'Info' }); // fără lectii

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('400 — lectii nu este array', async () => {
        const res = await request(app)
            .post('/api/plans')
            .set(authHeader(makeToken()))
            .send({ lectii: 'nu-sunt-array' });

        expect(res.status).toBe(400);
    });

    test('201 — lectii array gol este acceptat de router (validarea e la nivel de business)', async () => {
        db.createPlan.mockResolvedValue({ id: 'PLAN-EMPTY', lectii: [] });

        const res = await request(app)
            .post('/api/plans')
            .set(authHeader(makeToken()))
            .send({ ...validPlanBody, lectii: [] });

        // Routerul verifică doar că lectii e array, nu că e ne-gol
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/plans/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/plans/:id', () => {
    test('401 — fără token', async () => {
        const res = await request(app).get('/api/plans/PLAN-1');
        expect(res.status).toBe(401);
    });

    test('200 — returnează planificarea proprie', async () => {
        const userId = 'USR-TEST-001';
        db.getPlanById.mockResolvedValue({
            id: 'PLAN-1',
            userId,
            disciplina: 'Informatică',
            lectii: [{ titlu_lectie: 'Algoritmi' }],
        });

        const res = await request(app)
            .get('/api/plans/PLAN-1')
            .set(authHeader(makeToken(userId)));

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.plan.id).toBe('PLAN-1');
    });

    test('403 — acces la planificarea altui utilizator', async () => {
        db.getPlanById.mockResolvedValue({
            id: 'PLAN-ALT',
            userId: 'USR-ALT-999',
            disciplina: 'Matematică',
        });

        const res = await request(app)
            .get('/api/plans/PLAN-ALT')
            .set(authHeader(makeToken('USR-TEST-001'))); // user diferit

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    test('404 — planificarea nu există', async () => {
        db.getPlanById.mockResolvedValue(null);

        const res = await request(app)
            .get('/api/plans/PLAN-INEXISTENT')
            .set(authHeader(makeToken()));

        expect(res.status).toBe(404);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/plans/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/plans/:id', () => {
    test('401 — fără token', async () => {
        const res = await request(app).delete('/api/plans/PLAN-1');
        expect(res.status).toBe(401);
    });

    test('200 — ștergere reușită', async () => {
        db.deletePlan.mockResolvedValue(true);

        const res = await request(app)
            .delete('/api/plans/PLAN-1')
            .set(authHeader(makeToken()));

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('deletePlan este apelat cu planId și userId corecte', async () => {
        db.deletePlan.mockResolvedValue(true);
        const token = makeToken('USR-OWNER-789');

        await request(app)
            .delete('/api/plans/PLAN-XYZ')
            .set(authHeader(token));

        expect(db.deletePlan).toHaveBeenCalledWith('PLAN-XYZ', 'USR-OWNER-789');
    });

    test('404 — planificarea nu există sau nu aparține utilizatorului', async () => {
        db.deletePlan.mockResolvedValue(false);

        const res = await request(app)
            .delete('/api/plans/PLAN-GHOST')
            .set(authHeader(makeToken()));

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Protecție generală JWT pe endpoint-uri protejate
// ─────────────────────────────────────────────────────────────────────────────

describe('Protecție JWT — token expirat sau invalid', () => {
    test('401 pe GET /api/plans cu token expirat', async () => {
        const expiredToken = jwt.sign({ userId: 'USR-1' }, JWT_SECRET, { expiresIn: '-1s' });

        const res = await request(app)
            .get('/api/plans')
            .set('Authorization', `Bearer ${expiredToken}`);

        expect(res.status).toBe(401);
    });

    test('401 pe POST /api/plans cu token semnat cu secret greșit', async () => {
        const badToken = jwt.sign({ userId: 'USR-1' }, 'secret-gresit');

        const res = await request(app)
            .post('/api/plans')
            .set('Authorization', `Bearer ${badToken}`)
            .send({ lectii: [{ titlu_lectie: 'Test' }] });

        expect(res.status).toBe(401);
    });

    test('401 pe DELETE /api/plans/:id cu token invalid', async () => {
        const res = await request(app)
            .delete('/api/plans/PLAN-1')
            .set('Authorization', 'Bearer nu.sunt.un.jwt');

        expect(res.status).toBe(401);
    });

    test('401 pe GET /api/plans/:id fără header', async () => {
        const res = await request(app).get('/api/plans/PLAN-1');
        expect(res.status).toBe(401);
    });
});
