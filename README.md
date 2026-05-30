# Curricula

Platformă web pentru profesori din România. Profesorul încarcă planificarea anuală → AI-ul extrage lecțiile → profesorul generează materiale la cerere (plan lecție, fișă de lucru, test).

## Stack

- **Backend:** Node.js + Express
- **Frontend:** HTML/CSS/JS vanilla
- **AI:** Google Gemini 2.5 Flash
- **DB:** MongoDB
- **Email:** Resend
- **Deploy:** Railway

## Flux principal

```
upload.html → calendar.html → dashboard.html
```

1. Profesor încarcă planificare (`.docx` / `.pdf`) + selectează clasa și materia
2. Planificarea e parsată (regex întâi, fallback AI) → lecțiile salvate în DB
3. Calendar vizual: module × săptămâni — profesor alege o lecție
4. Generare la cerere per lecție: plan lecție / fișă / test
5. Material salvat în DB — apelurile ulterioare returnează din cache

## Structura proiectului

```
server.js               — entry point Express
routes/
  auth.js               — login, register, reset parolă
  plans.js              — CRUD planificări + generare materiale
  upload.js             — upload fișier + parsare planificare
ai-parser.js            — logica Gemini (parsare + generare)
prompts/
  system.js             — PROFESOR_SYSTEM_PROMPT (system instruction Gemini)
db.js                   — MongoDB helpers
middleware/             — rate limiting, auth
docs/
  prompts/
    02_fix_buguri_auth_validare.md   — specificație fix-uri securitate
    03_calendar_module_saptamani.md  — specificație calendar vizual
```

## Auth

JWT stocat în `localStorage['curricula-token']`, user în `localStorage['curricula-user']`.
Paginile private (`dashboard.html`, `upload.html`, `profile.html`, `calendar.html`) au auth guard inline în `<head>`.

## AI — unde stau prompturile

| Ce face | Unde stă |
|---------|----------|
| Regulile generale ale AI-ului | `prompts/system.js` → `PROFESOR_SYSTEM_PROMPT` |
| Extragere lecții din planificare | `ai-parser.js` → `EXTRACT_PROMPT` |
| Format proiect didactic | `ai-parser.js` → `PROMPT_PROIECT` |
| Format fișă de lucru | `ai-parser.js` → `PROMPT_FISA` |
| Format test de evaluare | `ai-parser.js` → `PROMPT_TEST` |

## Variabile de mediu necesare

```
GEMINI_API_KEY=
MONGODB_URI=
JWT_SECRET=
RESEND_API_KEY=
```
