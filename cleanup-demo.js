/**
 * cleanup-demo.js
 * ───────────────────────────────────────────────────────────
 * Șterge DOAR datele demo/test din MongoDB.
 * Contul real și planificările reale rămân intacte.
 *
 * UTILIZARE:
 *   node cleanup-demo.js          → arată ce s-ar șterge (DRY RUN)
 *   node cleanup-demo.js --sterge → șterge efectiv (după confirmare)
 * ───────────────────────────────────────────────────────────
 */

require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const readline = require('readline');

const uri = process.env.MONGODB_URI || process.env.MONGODB_URL || process.env.MONGO_URL;

if (!uri) {
    console.error('\n❌ EROARE: Nu găsesc MONGODB_URI în fișierul .env\n');
    process.exit(1);
}

// ── Conturi reale — NICIODATĂ șterse ────────────────────────
const CONTURI_PROTEJATE = [
    'miticamihalescu@gmail.com',
];

function esteProtejat(email) {
    if (!email) return false;
    return CONTURI_PROTEJATE.includes(email.toLowerCase().trim());
}

// ── Criterii pentru date demo/test ──────────────────────────
const EMAIL_DEMO_PATTERNS = [
    /^a@b\./i,
    /^test@/i,
    /^profesor@test\./i,
    /^demo@/i,
    /\+test/i,
    /^user\d+@/i,
];

function isDemoEmail(email) {
    if (!email) return false;
    if (esteProtejat(email)) return false; // siguranță dublă
    return EMAIL_DEMO_PATTERNS.some(pattern => pattern.test(email));
}

// ── Culori pentru terminal ───────────────────────────────────
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

async function confirm(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.trim().toLowerCase());
        });
    });
}

async function main() {
    const DRY_RUN = !process.argv.includes('--sterge');

    console.log('\n' + BOLD + '═══════════════════════════════════════════════════' + RESET);
    console.log(BOLD + '  Curricula 2.0 — Curățare date demo/test' + RESET);
    console.log('═══════════════════════════════════════════════════');

    if (DRY_RUN) {
        console.log(YELLOW + '\n  MOD: DRY RUN — nu se șterge nimic' + RESET);
        console.log(YELLOW + '  Rulează cu --sterge pentru ștergere efectivă\n' + RESET);
    } else {
        console.log(RED + '\n  MOD: ȘTERGERE EFECTIVĂ\n' + RESET);
    }

    const client = new MongoClient(uri, {
        serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
    });

    try {
        await client.connect();
        const db = client.db('CurriculaApp');
        const usersCol = db.collection('users');
        const plansCol = db.collection('plans');

        // ── 1. Găsește utilizatori demo ──────────────────────
        const toți_utilizatorii = await usersCol.find({}).toArray();
        const utilizatori_demo = toți_utilizatorii.filter(u => isDemoEmail(u.email));
        const utilizatori_reali = toți_utilizatorii.filter(u => !isDemoEmail(u.email));
        const id_uri_demo = utilizatori_demo.map(u => u.id);

        // ── 2. Găsește planuri orfane ────────────────────────
        const toate_planurile = await plansCol.find({}).toArray();
        const id_uri_reali = utilizatori_reali.map(u => u.id);
        const planuri_orfane = toate_planurile.filter(p => !id_uri_reali.includes(p.userId));
        const planuri_demo = planuri_orfane; // planuri fără utilizator real

        // ── RAPORT ───────────────────────────────────────────
        console.log(BOLD + CYAN + '  📊 SITUAȚIA CURENTĂ ÎN MONGODB' + RESET);
        console.log('  ─────────────────────────────────────────────────');
        console.log(`  Total utilizatori: ${toți_utilizatorii.length}`);
        console.log(`  Total planificări: ${toate_planurile.length}\n`);

        console.log(BOLD + '  👤 UTILIZATORI REALI (rămân intacți):' + RESET);
        if (utilizatori_reali.length === 0) {
            console.log(YELLOW + '    (niciunul găsit)' + RESET);
        } else {
            utilizatori_reali.forEach(u => {
                console.log(GREEN + `    ✓ ${u.email} — ${u.nume} (creat: ${u.dataCrearii?.slice(0, 10)})` + RESET);
            });
        }

        console.log('\n' + BOLD + RED + '  🗑  CE SE VA ȘTERGE:' + RESET);
        console.log('  ─────────────────────────────────────────────────');

        if (utilizatori_demo.length === 0 && planuri_demo.length === 0) {
            console.log(GREEN + '\n  ✅ Nu există date demo de șters. Baza de date e curată!\n' + RESET);
            await client.close();
            return;
        }

        if (utilizatori_demo.length > 0) {
            console.log(RED + `\n  Utilizatori demo (${utilizatori_demo.length}):` + RESET);
            utilizatori_demo.forEach(u => {
                console.log(RED + `    ✗ ${u.email} — ${u.nume} (ID: ${u.id})` + RESET);
            });
        }

        if (planuri_demo.length > 0) {
            console.log(RED + `\n  Planificări orfane (${planuri_demo.length}):` + RESET);
            planuri_demo.forEach(p => {
                const disciplina = p.disciplina || p.metadata?.disciplina || '—';
                const clasa = p.clasa || p.metadata?.clasa || '—';
                console.log(RED + `    ✗ ${p.id} — ${disciplina}, clasa ${clasa} (userId: ${p.userId})` + RESET);
            });
        }

        console.log('\n  ─────────────────────────────────────────────────');
        console.log(BOLD + `  TOTAL: ${utilizatori_demo.length} utilizatori + ${planuri_demo.length} planificări de șters` + RESET);

        // ── ȘTERGERE ─────────────────────────────────────────
        if (DRY_RUN) {
            console.log(YELLOW + '\n  ℹ️  Acesta a fost DRY RUN. Nimic nu a fost șters.' + RESET);
            console.log(YELLOW + '  Rulează cu --sterge pentru a șterge efectiv:\n' + RESET);
            console.log(YELLOW + '    node cleanup-demo.js --sterge\n' + RESET);
        } else {
            const raspuns = await confirm(
                RED + BOLD + '\n  ⚠️  Ești sigur că vrei să ștergi aceste date? (da/nu): ' + RESET
            );

            if (raspuns !== 'da') {
                console.log(YELLOW + '\n  Anulat. Nimic nu a fost șters.\n' + RESET);
                await client.close();
                return;
            }

            let sterse_users = 0;
            let sterse_plans = 0;

            if (utilizatori_demo.length > 0) {
                const result = await usersCol.deleteMany({
                    id: { $in: id_uri_demo }
                });
                sterse_users = result.deletedCount;
            }

            if (planuri_demo.length > 0) {
                const id_planuri_demo = planuri_demo.map(p => p.id);
                const result = await plansCol.deleteMany({
                    id: { $in: id_planuri_demo }
                });
                sterse_plans = result.deletedCount;
            }

            console.log(GREEN + BOLD + '\n  ✅ CURĂȚARE COMPLETĂ:' + RESET);
            console.log(GREEN + `    • ${sterse_users} utilizatori șterși` + RESET);
            console.log(GREEN + `    • ${sterse_plans} planificări șterse` + RESET);
            console.log(GREEN + '\n  Contul tău real și datele reale sunt intacte.\n' + RESET);
        }

    } catch (err) {
        console.error(RED + '\n  ❌ Eroare:', err.message + RESET + '\n');
    } finally {
        await client.close();
    }
}

main();
