/**
 * planificare-parser.js
 * 
 * Parsează textul extras dintr-o planificare calendaristică anuală
 * și returnează un array JSON cu foldere de lecții structurate.
 * 
 * Structura returnată per folder:
 *   {
 *     id_folder: Number,
 *     saptamana: "S1",
 *     data: "08.09-12.09.2025",
 *     modul: "I",
 *     categorie: "Structura sistemului de calcul",
 *     nume_lectie: "Normele de securitate în laborator",
 *     tip_ora: "Predare" | "Recapitulare" | "Evaluare" | "Săptămâna Verde" | "Școala Altfel"
 *   }
 */

/**
 * Extrage metadatele din antetul documentului.
 */
function extractMetadata(text) {
    const meta = {};

    const disciplinaMatch = text.match(/DISCIPLINA\s*:\s*(.+)/i);
    if (disciplinaMatch) meta.disciplina = disciplinaMatch[1].trim();

    const profesorMatch = text.match(/PROFESOR\s*:\s*(.+)/i);
    if (profesorMatch) meta.profesor = profesorMatch[1].trim();

    const clasaMatch = text.match(/CLASA\s*:\s*(.+)/i);
    if (clasaMatch) meta.clasa = clasaMatch[1].trim();

    const scoalaMatch = text.match(/UNITATEA DE ÎNVĂŢĂMÂNT\s*:\s*(.+)/i) || text.match(/UNITATEA DE ÎNVĂȚĂMÂNT\s*:\s*(.+)/i);
    if (scoalaMatch) meta.scoala = scoalaMatch[1].trim();

    const anMatch = text.match(/AN\s*[ŞȘ]COLAR\s*:\s*(.+)/i);
    if (anMatch) meta.anScolar = anMatch[1].trim();

    // Extrage săptămânile speciale
    meta.saptamaniSpeciale = {};

    const scoalaAltfelMatch = text.match(/[ŞȘ]COALA\s+ALTFEL[^S]*(S\d+)/i) || text.match(/(S\d+)\s*[\–\-–]\s*[ŞȘ]coala\s+Altfel/i);
    if (scoalaAltfelMatch) {
        meta.saptamaniSpeciale[scoalaAltfelMatch[1].toUpperCase()] = 'Școala Altfel';
    }

    const saptVerdeMatch = text.match(/SĂPTĂMÂNA\s+VERDE[^S]*(S\d+)/i) || text.match(/(S\d+)\s*[\–\-–]\s*Săptămâna\s+Verde/i);
    if (saptVerdeMatch) {
        meta.saptamaniSpeciale[saptVerdeMatch[1].toUpperCase()] = 'Săptămâna Verde';
    }

    // Detectare și din secțiunea Observații
    const obsPatterns = text.matchAll(/S(\d+)\s*[\–\-–—]?\s*(Săptămâna\s+Verde|[ŞȘ]coala\s+Altfel)/gi);
    for (const m of obsPatterns) {
        const key = 'S' + m[1];
        const val = /verde/i.test(m[2]) ? 'Săptămâna Verde' : 'Școala Altfel';
        meta.saptamaniSpeciale[key] = val;
    }

    return meta;
}

/**
 * Parsează blocurile de module din text.
 * Fiecare modul conține: nume categorie, conținuturi (lecții), ore, săptămâni.
 */
function parseModules(text) {
    const modules = [];
    const recapFinalaIndex = text.search(/Recapitulare\s+finală/i);

    // --- Strategie 1: format "Modulul II: 14 ore" / "MODULUL III: 14 ore" ---
    // Unele planificări au un overview ("cuprinde S1-S7") urmat de secțiuni detaliate.
    // Detectăm secțiunile cu nr. de ore explicit — acestea sunt cele cu conținut real.
    const detailPattern = /Modulul?\s+(I{1,3}V?|V)\s*[:.]\s*\d+\s*ore/gi;
    const detailSplits = [];
    let dm;
    while ((dm = detailPattern.exec(text)) !== null) {
        detailSplits.push({ index: dm.index, label: 'Modul ' + dm[1].toUpperCase() });
    }

    if (detailSplits.length > 0) {
        // Găsim ultima linie "cuprinde S..." — conținutul de după ea e Modulul I
        const overviewPattern = /Modulul?\s+[IVX]+\.?\s+cuprinde\s+S\d+[^\n]*/gi;
        let lastOverviewEnd = -1, om;
        while ((om = overviewPattern.exec(text)) !== null) {
            lastOverviewEnd = om.index + om[0].length;
        }

        const allSplits = [];
        if (lastOverviewEnd > -1 && lastOverviewEnd < detailSplits[0].index) {
            // Blocul dintre sfărșitul overview-ului și primul modul detaliat = Modul I
            allSplits.push({ index: lastOverviewEnd, label: 'Modul I' });
        }
        allSplits.push(...detailSplits);

        for (let i = 0; i < allSplits.length; i++) {
            const start = allSplits[i].index;
            const end = i + 1 < allSplits.length
                ? allSplits[i + 1].index
                : (recapFinalaIndex > start ? recapFinalaIndex : text.length);

            const parsed = parseModuleBlock(text.substring(start, end), allSplits[i].label);
            if (parsed) modules.push(parsed);
        }
    } else {
        // --- Strategie 2: format clasic "Modulul I" fără overview separatr ---
        const modulePattern = /Modulul?\s+(I{1,3}V?|al\s+[IVX]+-lea|V)\b/gi;
        const moduleSplits = [];
        let match;
        while ((match = modulePattern.exec(text)) !== null) {
            // Sari peste liniile de overview ("Modulul I. cuprinde S1-S7")
            const afterMatch = text.substring(match.index + match[0].length, match.index + match[0].length + 50);
            if (/[\s.]*cuprinde/i.test(afterMatch)) continue;
            moduleSplits.push({ index: match.index, label: normalizeModuleLabel(match[0]) });
        }

        for (let i = 0; i < moduleSplits.length; i++) {
            const start = moduleSplits[i].index;
            const end = i + 1 < moduleSplits.length
                ? moduleSplits[i + 1].index
                : (recapFinalaIndex > start ? recapFinalaIndex : text.length);

            const parsed = parseModuleBlock(text.substring(start, end), moduleSplits[i].label);
            if (parsed) modules.push(parsed);
        }
    }

    // Recapitulare finală
    if (recapFinalaIndex > -1) {
        const recapParsed = parseModuleBlock(text.substring(recapFinalaIndex), 'Recapitulare finală');
        if (recapParsed) {
            recapParsed.categorie = 'Recapitulare finală și evaluare finală';
            recapParsed.lessons = ['Recapitulare finală', 'Evaluare finală'];
            modules.push(recapParsed);
        }
    }

    return modules;
}

/**
 * Normalizează eticheta modulului (ex: "Modulul al II-lea" → "II")
 */
function normalizeModuleLabel(raw) {
    const cleaned = raw.replace(/modulul?\s*/i, '').replace(/al\s+/i, '').replace(/-lea/i, '').trim();
    if (!cleaned) return raw;
    return 'Modul ' + cleaned.toUpperCase();
}

/**
 * Parsează un bloc de text al unui singur modul.
 */
function parseModuleBlock(block, modulLabel) {
    // Extrage categoria (primul titlu numerotate: "1. Structura unui sistem de calcul")
    const catMatch = block.match(/\d+\.\s*(.+?)(?:\n|$)/);
    const categorie = catMatch ? catMatch[1].trim() : modulLabel;

    // Extrage săptămâni
    const weekMatch = block.match(/S(\d+)\s*[\–\-–—]\s*S(\d+)/i);
    let weekStart = null, weekEnd = null;
    if (weekMatch) {
        weekStart = parseInt(weekMatch[1]);
        weekEnd = parseInt(weekMatch[2]);
    } else {
        // Format alternativ: "S29–27.04-31.04.2026"
        const altWeekMatch = block.match(/S(\d+)/i);
        if (altWeekMatch) weekStart = parseInt(altWeekMatch[1]);

        // Caută al doilea S
        const allWeeks = [...block.matchAll(/S(\d+)/gi)];
        if (allWeeks.length >= 2) {
            weekEnd = parseInt(allWeeks[allWeeks.length - 1][1]);
        }
        if (!weekEnd) weekEnd = weekStart;
    }

    // Extrage datele calendaristice
    const dateMatch = block.match(/(\d{2}\.\d{2})[\–\-–—](\d{2}\.\d{2})\s*\.?\s*(\d{4})/);
    let dateRange = '';
    if (dateMatch) {
        dateRange = `${dateMatch[1]}-${dateMatch[2]}.${dateMatch[3]}`;
    }

    // Extrage nr. ore
    const oreMatch = block.match(/(\d+)\s*(?:ore|$)/m) || block.match(/\n\s*(\d)\s*\n/);
    const nrOre = oreMatch ? parseInt(oreMatch[1]) : null;

    // Extrage conținuturile (lecțiile)
    const continutStart = block.search(/Normele|Ce este|Rolul|Noțiunea|Prezentarea|Recapitulare|Hardware|Structura generală|Clasificarea/i);
    const continutEnd = block.search(/\n\s*\d+\s*\n|\nS\d+/);

    let lessons = extractLessons(block);

    return {
        modul: modulLabel,
        categorie,
        weekStart,
        weekEnd,
        dateRange,
        nrOre,
        lessons
    };
}

/**
 * Extrage lecțiile individuale din blocul de conținuturi al unui modul.
 */
function extractLessons(block) {
    const lines = block.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
    const lessons = [];

    // Lecțiile sunt linii care descriu conținuturi concrete
    // Filtrăm: competențe (1.1, 1.2...), headere, și date
    const skipPatterns = [
        /^Modulul?\s/i,
        /^\d+\.\d+/,                        // Competențe specifice (1.1, 1.2, 1.7.; 1.8...)
        /^Competențe/i,
        /^Conținuturi$/i,
        /^Nr\.\s*ore/i,
        /^Săptămâna$/i,
        /^Observații$/i,
        /^Unitatea de învățare/i,
        /^S\d+\s*[\–\-–—]/i,              // S1 – S7
        /^\d{2}\.\d{2}[\–\-–—]/,          // Date (08.09-24.10)
        /^\d{4}$/,                         // Ani (2025, 2026)
        /^S\d+$/,                          // Săptămâni izolate
        /^\d+$/,                           // Numere izolate (nr. ore)
        /^Planificarea calendaristică/i,
        /^Cursuri:/i,
        /^Structura anului/i,
        /dispozitivelor de calcul/i,       // Continuări de competențe
        /componente software/i,
        /sursă de documentare/i,
        /situații din viața/i,
        /acestora în prelucrări/i,
        /rezolvarea unor probleme/i,
        /produse informatice/i,
        /mediu grafic interactiv/i,
        /jocuri digitale/i,
        /informațiilor științifice/i,
        /construire a unor/i,
        /^Februarie.*liber/i,
        /^\d+\s+Februarie/i,
        /^\d+\s+Martie/i,
        /liber$/i,
        /^PLANIFICARE/i,
        /^\d+\.\s*[A-Z]/,                  // Titluri de categorii ("1. Structura unui sistem")
        /^Recapitulare finală/i,
        /documentare;?$/i,
        /^Planificarea calendaristică este/i,
        /^Structura anului școlar/i,
        /inspectoratelor/i,
        /^În planificarea/i,
        /^Derularea celor/i,
        /conform OME/i,
        /^Săptămâna\s+\d/i,                // Header: "Săptămâna 20-24.10.2025"
        /^ŞCOALA\s+ALTFEL/i,
        /^SĂPTĂMÂNA\s+VERDE/i,
        /^Programul\s+național/i,
        /^programa\s+școlară/i,
        /^Obs\.\s/i,                        // Observații inline (Obs. Vacanță...)
        /^Vacanţ/i,                         // Vacanță
        /^[A-ZȘȚÂÎĂ\s]{10,}$/,             // Titluri de unități ALL CAPS
    ];

    for (const line of lines) {
        // Sari peste liniile care nu sunt lecții
        if (skipPatterns.some(p => p.test(line))) continue;

        // Verifică dacă linia arată ca un conținut de lecție (minim 10 caractere, nu e doar numere)
        if (line.length >= 8 && !/^\d+$/.test(line)) {
            // Curăță liniile care conțin observații inline
            const cleaned = line.replace(/S\d+\s*[\–\-–—]\s*(Săptămâna\s+Verde|Școala\s+Altfel)/gi, '').trim();
            if (cleaned.length >= 8) {
                lessons.push(cleaned);
            }
        }
    }

    return lessons;
}

/**
 * Clasifică tipul orei pe baza numelui lecției.
 */
function classifyLessonType(name, weekNum, specialWeeks) {
    const lower = name.toLowerCase();

    // Verifică dacă săptămâna e specială
    const weekKey = 'S' + weekNum;
    if (specialWeeks[weekKey]) {
        return specialWeeks[weekKey];
    }

    if (/recapitulare\s*[/și]*\s*evaluare|evaluare\s*sumativă|evaluare\s*finală/i.test(name)) {
        return 'Evaluare';
    }
    if (/recapitulare/i.test(name)) {
        return 'Recapitulare';
    }
    if (/evaluare/i.test(name)) {
        return 'Evaluare';
    }

    return 'Predare';
}

/**
 * Funcția principală de parsare.
 * Primește textul brut extras din document și returnează array-ul JSON cu foldere.
 */
function parsePlanificare(text) {
    const meta = extractMetadata(text);
    const modules = parseModules(text);

    const folders = [];
    let folderId = 1;

    for (const mod of modules) {
        const { modul, categorie, weekStart, weekEnd, dateRange, lessons } = mod;

        if (!weekStart || !lessons.length) {
            // Dacă nu avem săptămâni dar avem lecții, le asignăm generic
            for (const lesson of lessons) {
                const tipOra = classifyLessonType(lesson, null, meta.saptamaniSpeciale);
                folders.push({
                    id_folder: folderId++,
                    saptamana: '—',
                    data: dateRange || '—',
                    modul: modul,
                    categorie: categorie,
                    nume_lectie: lesson,
                    tip_ora: tipOra
                });
            }
            continue;
        }

        // Distribuie lecțiile pe săptămâni
        const totalWeeks = weekEnd - weekStart + 1;
        const lessonsPerWeek = Math.max(1, Math.ceil(lessons.length / totalWeeks));

        let lessonIdx = 0;
        for (let w = weekStart; w <= weekEnd && lessonIdx < lessons.length; w++) {
            const weekKey = 'S' + w;

            // Verifică dacă e săptămână specială
            if (meta.saptamaniSpeciale[weekKey]) {
                // Dacă e săptămâna Verde sau Școala Altfel, pune lecția curentă cu tipul special
                const lesson = lessons[lessonIdx] || categorie;
                folders.push({
                    id_folder: folderId++,
                    saptamana: weekKey,
                    data: dateRange || '—',
                    modul: modul,
                    categorie: categorie,
                    nume_lectie: lesson,
                    tip_ora: meta.saptamaniSpeciale[weekKey]
                });
                lessonIdx++;
                continue;
            }

            // Lecție normală
            const lesson = lessons[lessonIdx];
            const tipOra = classifyLessonType(lesson, w, meta.saptamaniSpeciale);

            folders.push({
                id_folder: folderId++,
                saptamana: weekKey,
                data: dateRange || '—',
                modul: modul,
                categorie: categorie,
                nume_lectie: lesson,
                tip_ora: tipOra
            });

            lessonIdx++;
        }

        // Dacă au rămas lecții neasignate
        while (lessonIdx < lessons.length) {
            const lesson = lessons[lessonIdx];
            const tipOra = classifyLessonType(lesson, weekEnd, meta.saptamaniSpeciale);
            folders.push({
                id_folder: folderId++,
                saptamana: 'S' + weekEnd,
                data: dateRange || '—',
                modul: modul,
                categorie: categorie,
                nume_lectie: lesson,
                tip_ora: tipOra
            });
            lessonIdx++;
        }
    }

    return {
        metadata: meta,
        folders
    };
}

module.exports = { parsePlanificare, extractMetadata };
