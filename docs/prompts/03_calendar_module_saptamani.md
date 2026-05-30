# 03 — Calendar vizual: module × săptămâni cu modal de generare

**Fișiere create/modificate:** `calendar.html` (nou), `upload.html` (redirect schimbat)
**Adăugat în:** sesiunea 2026-03-19

---

## Scop

După ce profesorul încarcă o planificare, vede un calendar vizual al întregului an școlar
organizat pe module (rânduri) și săptămâni (coloane). Poate apăsa pe orice lecție și alege
ce material să genereze.

---

## Fluxul complet

```
upload.html
  → încarcă fișier + clasă + materie
  → apasă „Citește planificarea"
  → AI procesează → lecțiile salvate în DB + sessionStorage
  → redirect: calendar.html?planId=XXX

calendar.html
  → afișează grid: module (rânduri) × săptămâni (coloane)
  → carduri colorate per tip_ora
  → profesor apasă pe o lecție

  → MODAL cu:
     - titlul lecției, modulul, săptămâna, perioada, unitatea de învățare, tipul orei
     - 4 butoane: Plan de lecție / Fișă de lucru / Evaluare / Prezentare

  → profesor alege tipul
  → redirect: dashboard.html?plan=XXX (pentru proiect/fisa/test)
             genereaza.html?tip=...   (pentru prezentare, viitor)
```

---

## Structura datelor

Obiect lecție (din API `/api/plans/:planId/lectii`):

```json
{
  "id": 1,
  "modul": "Modul I",
  "unitate_invatare": "Editor de texte",
  "saptamana": "S2",
  "tip_ora": "PREDARE",
  "titlu_lectie": "Interfața unei aplicații de realizare a documentelor",
  "perioada": "15.09-19.09.2025"
}
```

Valori posibile `tip_ora`: `PREDARE`, `EVALUARE`, `RECAPITULARE`, `SĂPTĂMÂNA VERDE`, `ȘCOALA ALTFEL`

---

## Cache sessionStorage

Lecțiile se stochează în `sessionStorage` cu cheia `curricula-lectii-{planId}`.
`upload.html` le salvează după procesare → `calendar.html` le citește instant fără fetch.

---

## Culori carduri per tip_ora

| Tip | Culoare |
|-----|---------|
| PREDARE | albastru `rgba(0,150,255,0.10)` |
| EVALUARE | roșu `rgba(255,100,100,0.12)` |
| RECAPITULARE | portocaliu `rgba(255,170,0,0.12)` |
| SĂPTĂMÂNA VERDE | verde `rgba(0,200,100,0.12)` |
| ȘCOALA ALTFEL | mov `rgba(200,100,255,0.12)` |

Clase CSS: `.tip-predare`, `.tip-evaluare`, `.tip-recapitulare`, `.tip-saptamana-verde`, `.tip-scoala-altfel`
Generate prin funcția `slugify(tip_ora)` care normalizează diacriticele și spațiile.

---

## Decizii de implementare

- **Module fără lecții** sunt omise din grid (nu apar rânduri goale)
- **Sidebar** identic cu `dashboard.html` — navigare, user menu, toggle temă
- **Auth guard** prezent în `<head>` — redirect la login dacă nu e autentificat
- **Modal** se închide la click în afara lui și la `Escape`
- Coloana cu numele modulului este `position: sticky; left: 0` — rămâne vizibilă la scroll orizontal
