'use strict';

// Setăm secretul înainte de orice require
process.env.JWT_SECRET = 'test-auth-middleware-secret';

const jwt = require('jsonwebtoken');
const authMiddleware = require('../auth');

const SECRET = process.env.JWT_SECRET;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Creează un res mock cu status() și json() chainabile */
function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
}

/** Generează un token valid cu payload implicit */
function validToken(payload = { userId: 'USR-123', email: 'test@curricula.ro' }, opts = {}) {
    return jwt.sign(payload, SECRET, { expiresIn: '1h', ...opts });
}

// ─── Token valid ─────────────────────────────────────────────────────────────
describe('authMiddleware — token valid', () => {
    test('apelează next() o singură dată', () => {
        const req  = { headers: { authorization: `Bearer ${validToken()}` } };
        const res  = mockRes();
        const next = jest.fn();

        authMiddleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
    });

    test('nu returnează eroare 401', () => {
        const req  = { headers: { authorization: `Bearer ${validToken()}` } };
        const res  = mockRes();
        const next = jest.fn();

        authMiddleware(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    test('atașează req.user cu userId și email corecte', () => {
        const payload = { userId: 'USR-ABC', email: 'prof@scoala.ro' };
        const req  = { headers: { authorization: `Bearer ${validToken(payload)}` } };
        const res  = mockRes();
        const next = jest.fn();

        authMiddleware(req, res, next);

        expect(req.user).toBeDefined();
        expect(req.user.userId).toBe('USR-ABC');
        expect(req.user.email).toBe('prof@scoala.ro');
    });

    test('preservă câmpuri suplimentare din payload', () => {
        const payload = { userId: 'USR-1', email: 'x@x.ro', role: 'admin', extra: 42 };
        const req  = { headers: { authorization: `Bearer ${validToken(payload)}` } };
        const res  = mockRes();
        const next = jest.fn();

        authMiddleware(req, res, next);

        expect(req.user.role).toBe('admin');
        expect(req.user.extra).toBe(42);
    });
});

// ─── Header lipsă / malformat ────────────────────────────────────────────────
describe('authMiddleware — header Authorization lipsă sau malformat', () => {
    test('fără header Authorization → 401', () => {
        const req  = { headers: {} };
        const res  = mockRes();
        const next = jest.fn();

        authMiddleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('mesajul de eroare menționează că token-ul lipsește', () => {
        const req  = { headers: {} };
        const res  = mockRes();
        authMiddleware(req, res, jest.fn());

        const body = res.json.mock.calls[0][0];
        expect(body.error).toMatch(/lipsește/i);
    });

    test('token fără prefix "Bearer " → 401', () => {
        const req  = { headers: { authorization: validToken() } }; // fără "Bearer "
        const res  = mockRes();
        const next = jest.fn();

        authMiddleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('prefix greșit ("Token ..." în loc de "Bearer ...") → 401', () => {
        const req  = { headers: { authorization: `Token ${validToken()}` } };
        const res  = mockRes();
        const next = jest.fn();

        authMiddleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('header gol ("") → 401', () => {
        const req  = { headers: { authorization: '' } };
        const res  = mockRes();
        const next = jest.fn();

        authMiddleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
});

// ─── Token invalid / expirat ─────────────────────────────────────────────────
describe('authMiddleware — token invalid sau expirat', () => {
    test('string aleatoriu ca token → 401', () => {
        const req  = { headers: { authorization: 'Bearer nu.sunt.un.jwt' } };
        const res  = mockRes();
        const next = jest.fn();

        authMiddleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('token semnat cu secret greșit → 401', () => {
        const token = jwt.sign({ userId: 'USR-1' }, 'secret-gresit', { expiresIn: '1h' });
        const req   = { headers: { authorization: `Bearer ${token}` } };
        const res   = mockRes();
        const next  = jest.fn();

        authMiddleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('token expirat → 401', () => {
        const token = jwt.sign({ userId: 'USR-1' }, SECRET, { expiresIn: '-1s' });
        const req   = { headers: { authorization: `Bearer ${token}` } };
        const res   = mockRes();
        const next  = jest.fn();

        authMiddleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('mesajul de eroare pentru token invalid/expirat este corect', () => {
        const token = jwt.sign({ userId: 'USR-1' }, SECRET, { expiresIn: '-1s' });
        const req   = { headers: { authorization: `Bearer ${token}` } };
        const res   = mockRes();
        authMiddleware(req, res, jest.fn());

        const body = res.json.mock.calls[0][0];
        expect(body.error).toMatch(/invalid|expirat/i);
    });

    test('token trunchiat (primele 10 caractere) → 401', () => {
        const token = validToken().substring(0, 10);
        const req   = { headers: { authorization: `Bearer ${token}` } };
        const res   = mockRes();
        const next  = jest.fn();

        authMiddleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('payload JWT modificat manual → 401', () => {
        // Schimbă payload-ul fără a re-semna
        const [header, , signature] = validToken().split('.');
        const fakePayload = Buffer.from(JSON.stringify({ userId: 'HACKED', email: 'hack@hack.com' })).toString('base64url');
        const tamperedToken = `${header}.${fakePayload}.${signature}`;

        const req  = { headers: { authorization: `Bearer ${tamperedToken}` } };
        const res  = mockRes();
        const next = jest.fn();

        authMiddleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
});

// ─── req.user nu este setat la eroare ────────────────────────────────────────
describe('authMiddleware — req.user la eroare', () => {
    test('req.user rămâne nesetat când tokenul este invalid', () => {
        const req  = { headers: { authorization: 'Bearer invalid' } };
        const res  = mockRes();
        authMiddleware(req, res, jest.fn());

        expect(req.user).toBeUndefined();
    });

    test('req.user rămâne nesetat când header-ul lipsește', () => {
        const req  = { headers: {} };
        const res  = mockRes();
        authMiddleware(req, res, jest.fn());

        expect(req.user).toBeUndefined();
    });
});
