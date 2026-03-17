const express = require('express');
const router = express.Router();
const authMiddleware = require('../auth');
const { createPlan, getPlansByUser, getPlanById, deletePlan } = require('../db');
const logger = require('../logger');

const log = (level, route, msg, err) => {
    const meta = { route };
    if (err) meta.error = err.message || String(err);
    logger[level]({ message: msg, ...meta });
};

router.get('/', authMiddleware, async (req, res) => {
    try {
        const plans = await getPlansByUser(req.user.userId);
        res.json({ success: true, plans });
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

        const newPlan = await createPlan(req.user.userId, { metadata, lectii, clasa, disciplina });
        res.status(201).json({ success: true, message: 'Planificarea a fost salvată cu succes.', planId: newPlan.id });
    } catch (err) {
        log('error', 'POST /api/plans', 'Eroare la salvarea planificării', err);
        res.status(500).json({ success: false, error: 'Eroare la salvarea planificării.' });
    }
});

router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const success = await deletePlan(req.params.id, req.user.userId);
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

module.exports = router;
