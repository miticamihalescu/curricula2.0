# Curricula — Reguli de dezvoltare

## Despre aplicație
Curricula este o platformă web pentru profesori din România.
Profesorul încarcă planificarea anuală → platforma o parsează și salvează structura →
profesorul generează materiale individual, la cerere (plan lecție, fișă, test).

## Stack
- Frontend: HTML/CSS/JS vanilla (fișiere .html separate)
- Backend: Node.js + Express
- Hosting: Railway
- Autentificare: JWT

## Reguli obligatorii

### Arhitectură
- AI-ul se apelează DOAR când profesorul apasă explicit un buton de generare
- Planificarea se parsează O SINGURĂ DATĂ și se salvează în DB — fără AI în acest pas
- Materialele generate se salvează în DB — dacă există deja, se afișează din DB, nu se regenerează
- Un apel AI = un singur material (nu genera tot deodată)

### Cod
- Nu rescrie ce funcționează deja — doar adaugă sau modifică ce e necesar
- Păstrează stilul vizual existent: dark theme, verde teal #00C896
- Comentează codul în română
- Nu schimba structura fișierelor existente fără motiv

### UX
- Profesorul trebuie să rămână în platformă — nu trimite tot dintr-o dată
- Fiecare material are stare vizibilă: Negenerat / În generare... / Generat ✓
- Butoanele de generare sunt per lecție/temă, nu globale

### Securitate
- Toate rutele de API verifică JWT-ul
- Un profesor vede DOAR planificările și materialele lui

## Structura paginilor existente
- dashboard.html — lista lecții pe module, modal per lecție cu tabs
- login.html — autentificare JWT
- index.html — landing page (NU modifica fără motiv)

## Reguli UI specifice
- Modalul unei lecții are 3 tabs: Proiect didactic, Fișă de lucru, Test de evaluare
- Fiecare tab se generează SEPARAT, la cerere — NU toate odată
- ELIMINĂ sau dezactivează butonul "Generează toate" din dashboard — contrazice logica platformei
- Nivelul de dificultate și stilul de predare se trimit ca parametri la generare
- După generare, tab-ul afișează conținutul salvat din DB — nu mai apelează AI la redeschidere

## Ce NU trebuie făcut
- NU adăuga butoane globale de "generează tot"
- NU regenera materiale deja existente în DB
- NU schimba structura modalului de lecție

## Parsarea planificării
- La încărcarea planificării, extrage și salvează în DB: toate modulele/unitățile, toate lecțiile cu săptămâna și zilele exacte aferente, tipul lecției (predare/recapitulare/evaluare), numărul de ore
- Fiecare lecție trebuie să aibă asociate: modul, săptămâna (ex: S1, S2...), interval date (ex: 08.09-12.09.2025), tipul, numărul de ordine
- Modulele și lecțiile din sidebar se populează automat din planificarea parsată — NU hardcodat

## Format proiect didactic — OBLIGATORIU conform MEN România
Proiectul didactic generat trebuie să conțină TOATE rubricile oficiale:
1. Date de identificare: școala, profesor, clasa, disciplina, unitatea de învățare, subiectul lecției, tipul lecției, durata, data
2. Competențe specifice vizate (coduri din programa școlară, ex: 1.1, 2.3)
3. Obiective operaționale (O1, O2, O3... — formulate cu verbe de acțiune)
4. Strategia didactică: metode și procedee, mijloace de învățământ, forme de organizare
5. Resurse: materiale, temporale, umane
6. Scenariul didactic — tabel cu coloanele: Etapele lecției | Ob. | Activitatea profesorului | Activitatea elevilor | Metode/Procedee | Mijloace | Evaluare | Timp (min)
7. Etapele obligatorii ale scenariului: Moment organizatoric, Verificarea temei/cunoștințelor anterioare, Captarea atenției, Anunțarea titlului și a obiectivelor, Dirijarea învățării, Obținerea performanței, Asigurarea retenției și transferului, Evaluarea, Tema pentru acasă
8. Bibliografie

## Format fișă de lucru — OBLIGATORIU
- Antet: școală, clasa, disciplina, data, nume elev
- Titlul unității/lecției
- Exerciții variate: grilă, completare, asociere, răspuns scurt, problemă aplicativă
- Barem de notare (punctaj per exercițiu, total 100p sau 10p)

## Format test de evaluare — OBLIGATORIU
- Antet oficial: școală, clasa, disciplina, data, nume elev, varianta
- Subiectul I, II, III structurate
- Timp de lucru specificat
- Barem de corectare detaliat
- Notă: "Toate subiectele sunt obligatorii. Se acordă 10 puncte din oficiu."

## Reguli de calitate pentru generare
- Folosește terminologia din programa școlară românească
- Competențele specifice trebuie să fie REALE din programa MEN pentru acea materie și clasă
- Obiectivele operaționale se formulează cu verbe clare: să identifice, să explice, să rezolve, să compare
- Timpul alocat per etapă din scenariului didactic trebuie să se adune la durata totală a lecției
