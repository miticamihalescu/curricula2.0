const { findUserById } = require('../db');

// TODO: reactivează restricția Pro când monetizarea e implementată
// Momentan toți userii pot exporta (demo)
async function checkProExport(req, res, next) {
    next();
}

module.exports = checkProExport;
