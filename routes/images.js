const express = require('express');
const router = express.Router();
const multer = require('multer');
const authMiddleware = require('../auth');
const { saveImage, getImagesByUser, getImageById, deleteImage } = require('../db');
const logger = require('../logger');

const MAX_IMAGE_SIZE = 1.5 * 1024 * 1024; // 1.5MB

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_SIZE },
    fileFilter: (req, file, cb) => {
        const tipuriPermise = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (tipuriPermise.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Format neacceptat. Folosește JPG, PNG, GIF sau WebP.'));
    }
});

// GET /api/images — lista imaginilor utilizatorului (fără date binare)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const images = await getImagesByUser(req.user.userId);
        res.json({ success: true, images });
    } catch (err) {
        logger.error({ message: 'Eroare la listarea imaginilor', error: err.message });
        res.status(500).json({ success: false, error: 'Eroare la obținerea imaginilor.' });
    }
});

// POST /api/images — upload imagine nouă
router.post('/', authMiddleware, (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err instanceof multer.MulterError || err) {
            return res.status(400).json({ success: false, error: err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Nicio imagine trimisă.' });
        }

        const dataBase64 = req.file.buffer.toString('base64');
        const img = await saveImage(req.user.userId, {
            filename: req.file.originalname,
            mimeType: req.file.mimetype,
            dataBase64,
            size: req.file.size
        });

        res.status(201).json({
            success: true,
            image: { id: img.id, filename: img.filename, mimeType: img.mimeType, size: img.size, dataCrearii: img.dataCrearii }
        });
    } catch (err) {
        logger.error({ message: 'Eroare la salvarea imaginii', error: err.message });
        res.status(500).json({ success: false, error: 'Eroare la salvarea imaginii.' });
    }
});

// GET /api/images/:id — returnează o imagine completă (cu base64) pentru preview
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const img = await getImageById(req.params.id, req.user.userId);
        if (!img) return res.status(404).json({ success: false, error: 'Imaginea nu a fost găsită.' });
        res.json({ success: true, image: img });
    } catch (err) {
        logger.error({ message: 'Eroare la obținerea imaginii', error: err.message });
        res.status(500).json({ success: false, error: 'Eroare la obținerea imaginii.' });
    }
});

// DELETE /api/images/:id — șterge o imagine
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const deleted = await deleteImage(req.params.id, req.user.userId);
        if (!deleted) return res.status(404).json({ success: false, error: 'Imaginea nu a fost găsită.' });
        res.json({ success: true });
    } catch (err) {
        logger.error({ message: 'Eroare la ștergerea imaginii', error: err.message });
        res.status(500).json({ success: false, error: 'Eroare la ștergerea imaginii.' });
    }
});

module.exports = router;
