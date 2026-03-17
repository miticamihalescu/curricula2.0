// supabase/functions/api/utils/planificare-parser.ts

/**
 * Extrage metadatele din antetul documentului.
 */
export function extractMetadata(text: string) {
    const meta: any = {};

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

function normalizeModuleLabel(raw: string) {
    const cleaned = raw.replace(/modulul?\s*/i, '').replace(/al\s+/i, '').replace(/-lea/i, '').trim();
    if (!cleaned) return raw;
    return 'Modul ' + cleaned.toUpperCase();
}

function extractLessons(block: string) {
    const lines = block.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
    const lessons = [];

    const skipPatterns = [
        /^Modulul?\s/i,
        /^\d+\.\d+\s/,
        /^Competențe/i,
        /^Conținuturi$/i,
        /^Nr\.\s*ore/i,
        /^Săptămâna$/i,
        /^Observații$/i,
        /^Unitatea de învățare/i,
        /^S\d+\s*[\–\-–—]/i,
        /^\d{2}\.\d{2}[\–\-–—]/,
        /^\d{4}$/,
        /^S\d+$/,
        /^\d+$/,
        /^Planificarea calendaristică/i,
        /^Cursuri:/i,
        /^Structura anului/i,
        /dispozitivelor de calcul/i,
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
        /^\d+\.\s*[A-Z]/,
        /^Recapitulare finală/i,
        /documentare;?$/i,
        /^Planificarea calendaristică este/i,
        /^Structura anului școlar/i,
        /inspectoratelor/i,
        /^În planificarea/i,
        /^Derularea celor/i,
        /conform OME/i,
        /^Săptămâna\s+\d/i,
        /^ŞCOALA\s+ALTFEL/i,
        /^SĂPTĂMÂNA\s+VERDE/i,
        /^Programul\s+național/i,
        /^programa\s+școlară/i,
    ];

    for (const line of lines) {
        if (skipPatterns.some(p => p.test(line))) continue;
        if (line.length >= 8 && !/^\d+$/.test(line)) {
            const cleaned = line.replace(/S\d+\s*[\–\-–—]\s*(Săptămâna\s+Verde|Școala\s+Altfel)/gi, '').trim();
            if (cleaned.length >= 8) {
                lessons.push(cleaned);
            }
        }
    }
    return lessons;
}

function parseModuleBlock(block: string, modulLabel: string) {
    const catMatch = block.match(/\d+\.\s*(.+?)(?:\n|$)/);
    const categorie = catMatch ? catMatch[1].trim() : modulLabel;

    const weekMatch = block.match(/S(\d+)\s*[\–\-–—]\s*S(\d+)/i);
    let weekStart = null, weekEnd = null;
    if (weekMatch) {
        weekStart = parseInt(weekMatch[1]);
        weekEnd = parseInt(weekMatch[2]);
    } else {
        const altWeekMatch = block.match(/S(\d+)/i);
        if (altWeekMatch) weekStart = parseInt(altWeekMatch[1]);
        const allWeeks = [...block.matchAll(/S(\d+)/gi)];
        if (allWeeks.length >= 2) {
            weekEnd = parseInt(allWeeks[allWeeks.length - 1][1]);
        }
        if (!weekEnd) weekEnd = weekStart;
    }

    const dateMatch = block.match(/(\d{2}\.\d{2})[\–\-–—](\d{2}\.\d{2})\s*\.?\s*(\d{4})/);
    let dateRange = '';
    if (dateMatch) {
        dateRange = `${dateMatch[1]}-${dateMatch[2]}.${dateMatch[3]}`;
    }

    const oreMatch = block.match(/(\d+)\s*(?:ore|$)/m) || block.match(/\n\s*(\d)\s*\n/);
    const nrOre = oreMatch ? parseInt(oreMatch[1]) : null;

    let lessons = extractLessons(block);

    return { modul: modulLabel, categorie, weekStart, weekEnd, dateRange, nrOre, lessons };
}

function parseModules(text: string) {
    const modules: any[] = [];
    const modulePattern = /Modulul?\s+(I{1,3}V?|al\s+[IVX]+-lea|V)\b/gi;
    const moduleSplits = [];
    let match;

    while ((match = modulePattern.exec(text)) !== null) {
        moduleSplits.push({
            index: match.index,
            label: normalizeModuleLabel(match[0])
        });
    }

    const recapFinalaIndex = text.search(/Recapitulare\s+finală/i);

    for (let i = 0; i < moduleSplits.length; i++) {
        const start = moduleSplits[i].index;
        const end = i + 1 < moduleSplits.length
            ? moduleSplits[i + 1].index
            : (recapFinalaIndex > start ? recapFinalaIndex : text.length);

        const block = text.substring(start, end);
        const label = moduleSplits[i].label;

        const parsed = parseModuleBlock(block, label);
        if (parsed) modules.push(parsed);
    }

    if (recapFinalaIndex > -1) {
        const recapBlock = text.substring(recapFinalaIndex);
        const recapParsed = parseModuleBlock(recapBlock, 'Recapitulare finală');
        if (recapParsed) {
            recapParsed.categorie = 'Recapitulare finală și evaluare finală';
            recapParsed.lessons = ['Recapitulare finală', 'Evaluare finală'];
            modules.push(recapParsed);
        }
    }

    return modules;
}

function classifyLessonType(name: string, weekNum: number | null, specialWeeks: any) {
    const lower = name.toLowerCase();
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

export function parsePlanificare(text: string) {
    const meta = extractMetadata(text);
    const modules = parseModules(text);

    const folders: any[] = [];
    let folderId = 1;

    for (const mod of modules) {
        const { modul, categorie, weekStart, weekEnd, dateRange, lessons } = mod;

        if (!weekStart || !lessons.length) {
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

        const totalWeeks = weekEnd - weekStart + 1;
        let lessonIdx = 0;
        for (let w = weekStart; w <= weekEnd && lessonIdx < lessons.length; w++) {
            const weekKey = 'S' + w;
            if (meta.saptamaniSpeciale[weekKey]) {
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
