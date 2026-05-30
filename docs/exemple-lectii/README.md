# Exemple & Referințe pentru Generare AI

Acest folder conține materiale de referință pe care AI-ul le folosește ca inspirație
pentru generarea proiectelor didactice, fișelor de lucru și testelor de evaluare.

## Fișiere de bază

### Structuri & Modele
- `model-proiect-didactic.md` — Șablon complet proiect didactic conform MEN România
- `model-fisa-de-lucru.md` — Șablon fișă de lucru cu barem
- `model-test-evaluare.md` — Șablon test de evaluare cu barem oficial

### Competențe Specifice din Programă (MEN)
- `competente-limba-romana-v-viii.md` — Competențe specifice LLR, clasele V-VIII
- `competente-matematica-v-viii.md` — Competențe specifice Matematică, clasele V-VIII
- `competente-stiinte.md` — Competențe Fizică / Chimie / Biologie, clasele VI-VIII
- `competente-alte-discipline.md` — Istorie, Geografie, Informatică, Ed.Fizică, Arte, Muzică

## Exemple pe discipline și niveluri (44 fișiere)

| Disciplină | Primar | Gimnaziu | Liceu |
|---|---|---|---|
| **Română** | CLR cl.1 proiect, CLR cl.3 test | Textul narativ cl.7, Verbul cl.7, Substantivul fișă | Textul liric cl.9, Romanul cl.11 test |
| **Matematică** | Adunare cl.2 proiect, Înmulțire cl.3 fișă | Ecuații cl.7, Fracții cl.5 fișă, Funcții cl.8 test | Limite cl.10, Derivate cl.11 test |
| **Fizică** | Stări agregare cl.4 fișă | Fenomene termice cl.8 proiect+test | Efect fotoelectric cl.12, Electrizare test |
| **Chimie** | — | Calcule chimice cl.7, Acizi-baze cl.8 fișă | Reacții redox cl.10 |
| **Biologie** | — | Celula cl.7, Sistemul nervos cl.8 test | Genetica cl.11 |
| **Geografie** | Județele României cl.4 | Africa cl.6 | Medii geografice cl.10 |
| **Istorie** | Unirea Principatelor cl.4, Cronologie cl.5 fișă | Istoria trecutului cl.8, Primul Război Mondial test | — |
| **Informatică** | — | TIC cl.9 fișă, Algoritmi cl.9, Tablouri cl.10, OOP cl.10 fișă | — |
| **Engleză** | Family Members cl.3 | Past Simple cl.6, Reading cl.8, Past Tense cl.7 fișă | — |
| **Ed. Fizică** | — | Baschet cl.6 | — |
| **Arte/Muzică** | — | Solfegiu cl.5, Limbaj plastic cl.6 fișă | — |

## Cum folosește AI-ul aceste fișiere

Când un profesor generează un material, `ai-parser.js` injectează automat:
1. **Competențele specifice MEN** corespunzătoare disciplinei
2. **Modelul oficial** de proiect didactic / fișă / test
3. **Un exemplu real** de proiect didactic din subdirectorul disciplinei

## Adăugare materiale noi

Pune fișiere `.md` în subdirectorul potrivit: `romana/`, `matematica/`, `fizica/`, `chimie/`,
`biologie/`, `geografie/`, `istorie/`, `informatica/`, `engleza/`, `ed-fizica/`, `arte-muzica/`

Fiecare poate conține: `primar/`, `gimnaziu/`, `liceu/`
