const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../auth');
const { createPlan, getPlansByUser, getPlanById, deletePlan, deletePlanFortat, getMaterial, saveMaterial, getMaterialsByPlan, getImagesByIds } = require('../db');
const { generateMaterials, genereazaPlanificare } = require('../ai-parser');
const logger = require('../logger');

// Rate limiting per IP — dezactivat temporar (limita lunară scoasă)
const generareLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 999,
    message: { success: false, error: 'Ai depășit limita de generări per oră. Încearcă din nou mai târziu.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === 'test'
});

const log = (level, route, msg, err) => {
    const meta = { route };
    if (err) meta.error = err.message || String(err);
    logger[level]({ message: msg, ...meta });
};

router.get('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            log('warn', 'GET /api/plans', 'userId lipsește din token');
            return res.status(401).json({ success: false, error: 'Token invalid: userId lipsește.' });
        }

        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));

        const { plans, total } = await getPlansByUser(userId, { page, limit });
        log('info', 'GET /api/plans', `userId=${userId} → ${plans.length}/${total} planuri (pagina ${page})`);
        res.json({ success: true, plans, total, page, limit });
    } catch (err) {
        log('error', 'GET /api/plans', 'Eroare la obținerea planificărilor', err);
        res.status(500).json({ success: false, error: 'Eroare la obținerea planificărilor.' });
    }
});

router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const plan = await getPlanById(req.params.id);
        if (!plan) return res.status(404).json({ success: false, error: 'Planificarea nu a fost găsită.' });
        if (plan.userId !== req.user.userId) return res.status(403).json({ success: false, error: 'Acces interzis la această planificare.' });

        res.json({ success: true, plan });
    } catch (err) {
        log('error', `GET /api/plans/${req.params.id}`, 'Eroare la obținerea planificării', err);
        res.status(500).json({ success: false, error: 'Eroare la obținerea planificării.' });
    }
});

router.post('/', authMiddleware, async (req, res) => {
    try {
        const { metadata, lectii, clasa, disciplina } = req.body;

        if (!lectii || !Array.isArray(lectii)) {
            return res.status(400).json({ success: false, error: 'Lista de lecții este obligatorie și trebuie să fie un array.' });
        }

        // TODO: reactivează limita când monetizarea e implementată
        // Momentan fără limită pentru demo

        const newPlan = await createPlan(req.user.userId, { metadata, lectii, clasa, disciplina });
        res.status(201).json({ success: true, message: 'Planificarea a fost salvată cu succes.', planId: newPlan.id });
    } catch (err) {
        log('error', 'POST /api/plans', 'Eroare la salvarea planificării', err);
        res.status(500).json({ success: false, error: 'Eroare la salvarea planificării.' });
    }
});

router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const planId = req.params.id;
        const userId = req.user.userId;

        let success = await deletePlan(planId, userId);

        // Fallback: dacă userId-ul din DB e diferit (plan vechi/migrat), verificăm
        // că planul apare în lista utilizatorului curent, apoi ștergem oricum.
        if (!success) {
            const { plans: planurileUser = [] } = await getPlansByUser(userId) || {};
            const planulInLista = planurileUser.find(p => p.id === planId);
            if (planulInLista) {
                success = await deletePlanFortat(planId);
                if (success) {
                    log('warn', `DELETE /api/plans/${planId}`, `Plan șters cu fallback — userId mismatch (plan.userId=${planulInLista.userId}, req.userId=${userId})`);
                }
            }
        }

        if (success) {
            res.json({ success: true, message: 'Planificarea a fost ștearsă cu succes.' });
        } else {
            res.status(404).json({ success: false, error: 'Planificarea nu a fost găsită sau nu îți aparține.' });
        }
    } catch (err) {
        log('error', `DELETE /api/plans/${req.params.id}`, 'Eroare la ștergerea planificării', err);
        res.status(500).json({ success: false, error: 'Eroare la ștergerea planificării.' });
    }
});

/**
 * GET /api/plans/:planId/lectii
 * Returnează toate lecțiile asociate unei planificări, indiferent de modul.
 * Folosit de dashboard pentru a popula lista de lecții.
 */
router.get('/:planId/lectii', authMiddleware, async (req, res) => {
    try {
        const plan = await getPlanById(req.params.planId);
        if (!plan) return res.status(404).json({ success: false, error: 'Planificarea nu a fost găsită.' });
        if (plan.userId !== req.user.userId) return res.status(403).json({ success: false, error: 'Acces interzis la această planificare.' });

        const lectii = plan.lectii || [];
        log('info', `GET /api/plans/${req.params.planId}/lectii`, `${lectii.length} lecții returnate`);
        res.json({ success: true, lectii });
    } catch (err) {
        log('error', `GET /api/plans/${req.params.planId}/lectii`, 'Eroare la obținerea lecțiilor', err);
        res.status(500).json({ success: false, error: 'Eroare la obținerea lecțiilor.' });
    }
});

// ===== MATERIALE GENERATE LA CERERE =====

/**
 * GET /api/plans/:planId/materiale
 * Returnează toate materialele generate pentru o planificare.
 * Folosit la încărcarea dashboard-ului pentru a popula cache-ul local.
 */
router.get('/:planId/materiale', authMiddleware, async (req, res) => {
    try {
        const plan = await getPlanById(req.params.planId);
        if (!plan) return res.status(404).json({ success: false, error: 'Planificarea nu a fost găsită.' });
        if (plan.userId !== req.user.userId) return res.status(403).json({ success: false, error: 'Acces interzis la această planificare.' });

        const materiale = await getMaterialsByPlan(req.params.planId);
        res.json({ success: true, materiale });
    } catch (err) {
        log('error', `GET /api/plans/${req.params.planId}/materiale`, 'Eroare la obținerea materialelor', err);
        res.status(500).json({ success: false, error: 'Eroare la obținerea materialelor.' });
    }
});

/**
 * POST /api/plans/:planId/genereaza
 * Generează un singur material (proiect / fisa / test) pentru o lecție specifică.
 * Dacă materialul există deja în DB și nu se forțează regenerarea, îl returnează din cache.
 * Body: { lectieId, tip, dificultate?, stil_predare?, forteaza? }
 */
const checkTier = require('../middleware/checkTier');

router.post('/:planId/genereaza', authMiddleware, generareLimiter, checkTier, async (req, res) => {
    try {
        const { lectieId, tip, dificultate, stil_predare, forteaza, imageIds } = req.body;

        if (!lectieId || !tip) {
            return res.status(400).json({ success: false, error: 'lectieId și tip sunt obligatorii.' });
        }
        if (!['proiect', 'fisa', 'test'].includes(tip)) {
            return res.status(400).json({ success: false, error: 'Tip invalid. Valori acceptate: proiect, fisa, test.' });
        }

        const plan = await getPlanById(req.params.planId);
        if (!plan) return res.status(404).json({ success: false, error: 'Planificarea nu a fost găsită.' });
        if (plan.userId !== req.user.userId) return res.status(403).json({ success: false, error: 'Acces interzis.' });

        // Dacă nu se forțează regenerarea, verificăm dacă există deja în DB
        if (!forteaza) {
            const existent = await getMaterial(req.params.planId, lectieId, tip);
            if (existent) {
                log('info', `POST /api/plans/${req.params.planId}/genereaza`, `Din cache: lecție ${lectieId}, tip ${tip}`);
                return res.json({ success: true, continut: existent.continut, dinCache: true });
            }
        }

        // Găsim lecția în structura planificării
        const lectie = plan.lectii.find(l => String(l.id) === String(lectieId));
        if (!lectie) {
            return res.status(404).json({ success: false, error: 'Lecția nu a fost găsită în această planificare.' });
        }

        log('info', `POST /api/plans/${req.params.planId}/genereaza`, `Generare AI: "${lectie.titlu_lectie}", tip: ${tip}`);

        // Încarcă imaginile selectate de profesor (max 5)
        let imagini = [];
        if (Array.isArray(imageIds) && imageIds.length > 0) {
            imagini = await getImagesByIds(imageIds.slice(0, 5), req.user.userId);
        }

        // Un singur apel AI pentru materialul specific
        const result = await generateMaterials({
            titlu_lectie: lectie.titlu_lectie,
            clasa: plan.clasa,
            disciplina: plan.disciplina,
            modul: lectie.modul,
            unitate_invatare: lectie.unitate_invatare,
            scoala: plan.metadata?.scoala,
            profesor: plan.metadata?.profesor,
            dificultate: dificultate || 'standard',
            stil_predare: stil_predare || 'standard',
            target: tip,
            imagini,
            competente_specifice: lectie.competente_specifice || []
        });

        // Extragem conținutul pentru tipul cerut — garantăm că e string
        const raw = tip === 'proiect' ? result.proiect_didactic
                  : tip === 'fisa'    ? result.fisa_lucru
                  :                     result.test_evaluare;
        const continut = typeof raw === 'string' ? raw : (raw ? JSON.stringify(raw, null, 2) : '');

        // Salvăm în baza de date pentru apeluri viitoare
        await saveMaterial(req.params.planId, req.user.userId, Number(lectieId), tip, continut || '');

        res.json({ success: true, continut, dinCache: false });
    } catch (err) {
        log('error', `POST /api/plans/${req.params.planId}/genereaza`, 'Eroare la generare material', err);
        if (err.message?.includes('429')) {
            return res.status(429).json({ success: false, error: 'Limita de apeluri API a fost depășită. Încearcă din nou în câteva minute.' });
        }
        res.status(500).json({ success: false, error: 'Eroare la generare: ' + err.message });
    }
});

/**
 * POST /api/plans/genereaza-din-zero
 * Generează o planificare anuală completă fără a încărca vreun fișier.
 * Body: { disciplina, clasa, oreSaptamana, semestru, scoala, profesor, unitati[], anScolar }
 */
router.post('/genereaza-din-zero', authMiddleware, generareLimiter, async (req, res) => {
    try {
        const { disciplina, clasa, oreSaptamana, nrModule = 0, semestru = 'ambele', scoala, profesor, unitati = [], anScolar } = req.body;

        if (!disciplina || !clasa || !oreSaptamana) {
            return res.status(400).json({ success: false, error: 'Disciplina, clasa și orele pe săptămână sunt obligatorii.' });
        }
        // oreSaptamana poate fi "2" sau "2/3" — calculăm media pentru validare
        const oreNr = String(oreSaptamana).includes('/')
            ? String(oreSaptamana).split('/').reduce((a, b) => Number(a) + Number(b), 0) / String(oreSaptamana).split('/').length
            : Number(oreSaptamana);
        if (isNaN(oreNr) || oreNr < 1 || oreNr > 15) {
            return res.status(400).json({ success: false, error: 'Format invalid pentru orele pe săptămână (ex: 2 sau 2/3).' });
        }

        log('info', 'POST /api/plans/genereaza-din-zero', `Generare planificare: ${disciplina} cls. ${clasa}, ${oreSaptamana}h/săpt, ${nrModule || 'auto'} module`);

        const { metadata, lectii } = await genereazaPlanificare({
            disciplina, clasa, oreSaptamana: String(oreSaptamana),
            nrModule: Number(nrModule), semestru, scoala, profesor, unitati, anScolar
        });

        const plan = await createPlan(req.user.userId, { metadata, lectii, clasa, disciplina });

        log('info', 'POST /api/plans/genereaza-din-zero', `Plan creat: ${plan.id}, ${lectii.length} lecții`);
        res.status(201).json({ success: true, id: plan.id, lectii, metadata, total: lectii.length });

    } catch (err) {
        log('error', 'POST /api/plans/genereaza-din-zero', 'Eroare la generarea planificării', err);
        if (err.message?.includes('429')) {
            return res.status(429).json({ success: false, error: 'Limita API depășită. Încearcă din nou în câteva minute.' });
        }
        res.status(500).json({ success: false, error: 'Eroare la generarea planificării: ' + err.message });
    }
});

module.exports = router;
