# Proiect Didactic — Informatică, Clasa a IX-a
## Subiect: Algoritmi elementari și structuri de control

**Surse de referință:** didactic.ro, programareliceu.wordpress.com, rasfoiesc.com

---

## DATE DE IDENTIFICARE

| Câmp | Valoare |
|------|---------|
| Unitatea de învățământ | <!-- PLACEHOLDER: Numele școlii --> |
| Profesor | <!-- PLACEHOLDER: Numele profesorului --> |
| Disciplina | Informatică |
| Clasa | a IX-a (profil real, matematică-informatică) |
| Unitatea de învățare | Algoritmi și structuri de date |
| Subiectul lecției | Algoritmi elementari — structuri repetitive (for, while, do-while) |
| Tipul lecției | Lecție de predare-învățare și formare de priceperi și deprinderi |
| Durata | 50 minute |
| Data | <!-- PLACEHOLDER: data lecției --> |
| Limbaj | C++ / pseudocod |

---

## COMPETENȚE SPECIFICE VIZATE
*(conform Programei MEN pentru Informatică, clasa a IX-a)*

- **CS 1.1** — Identificarea datelor de intrare, de ieșire și intermediare necesare rezolvării unei probleme
- **CS 1.2** — Elaborarea unui algoritm pentru rezolvarea unei probleme, prin descompunerea în subprobleme
- **CS 2.1** — Implementarea algoritmilor utilizând structuri de control secvențiale, alternative și repetitive
- **CS 2.3** — Testarea și depanarea unui program; identificarea și corectarea erorilor

---

## OBIECTIVE OPERAȚIONALE

La sfârșitul lecției, elevii vor fi capabili să:

- **O1** — să identifice tipul de structură repetitivă potrivit pentru o problemă dată (for, while, do-while)
- **O2** — să scrie corect sintaxa structurilor `for`, `while` și `do-while` în C++
- **O3** — să implementeze algoritmi clasici (determinarea minimului/maximului, suma cifrelor, testul de primalitate) folosind structuri repetitive
- **O4** — să analizeze un program dat și să identifice eventualele erori logice sau de sintaxă
- **O5** — să compare cele trei structuri repetitive și să justifice alegerea uneia față de celelalte

---

## STRATEGIA DIDACTICĂ

### Metode și procedee
- Conversație euristică
- Explicație
- Demonstrație la calculator (prin proiector)
- Exercițiu practic (individual și în perechi)
- Problematizare

### Mijloace de învățământ
- Calculatoare cu compilator C++ (Code::Blocks / Dev-C++)
- Videoproiector
- Tablă / flipchart
- Fișe de lucru (exerciții tipărite)
- Manual: Informatică clasa a IX-a (Mariana Milosescu sau echivalent)

### Forme de organizare
- Frontală (explicații, demonstrații)
- Individuală (exerciții practice la calculator)
- În perechi (verificare reciprocă)

### Evaluare
- Observare sistematică pe parcursul lecției
- Verificare orală (întrebări frontale)
- Verificare practică (programele scrise de elevi)
- Aprecieri verbale

---

## SCENARIUL DIDACTIC

| Nr. | Etapa lecției | Ob. | Activitatea profesorului | Activitatea elevilor | Metode | Mijloace | Timp |
|-----|--------------|-----|--------------------------|----------------------|--------|----------|------|
| 1 | **Moment organizatoric** | — | Verifică prezența. Asigură funcționarea calculatoarelor. Anunță că lecția se desfășoară la calculator. | Se pregătesc, pornesc calculatoarele. | Conversație | Calculatoare | 3 min |
| 2 | **Verificarea temei / cunoștințe anterioare** | — | Adresează întrebări despre lecția anterioară: *„Ce este o structură alternativă? Când folosim if-else? Dați un exemplu."* Verifică oral 2-3 teme. | Răspund la întrebări. Prezintă temele. | Conversație frontală | Tablă | 7 min |
| 3 | **Captarea atenției** | — | Prezintă problema: *„Cum calculăm suma primelor 100 de numere naturale? Dar suma cifrelor unui număr?"* Lasă elevii să propună soluții. Conduce discuția spre nevoia repetării unor instrucțiuni. | Propun soluții. Observă că repetarea manuală a instrucțiunilor nu este eficientă. | Problematizare | Videoproiector | 5 min |
| 4 | **Anunțarea titlului și a obiectivelor** | — | Scrie pe tablă titlul: *„Structuri repetitive în C++"*. Enunță obiectivele în termeni accesibili. | Notează titlul în caiete. | Explicație | Tablă | 2 min |
| 5 | **Dirijarea învățării — Structura FOR** | O1, O2 | Explică sintaxa `for`: `for(init; condiție; incrementare) { corp; }`. Prezintă la proiector exemplul: calculul sumei 1+2+...+n. Explică pas cu pas execuția. | Urmăresc explicațiile. Notează sintaxa. Pun întrebări. | Explicație + Demonstrație | Videoproiector, tablă | 8 min |
| 6 | **Dirijarea învățării — WHILE și DO-WHILE** | O1, O2 | Prezintă sintaxa `while(condiție){...}` și `do{...}while(condiție)`. Compară cele trei structuri: *„When do we use each?"* Subliniază diferența: do-while se execută CEL PUȚIN O DATĂ. | Urmăresc, notează. Răspund la întrebările comparative. | Explicație + Conversație | Tablă, videoproiector | 7 min |
| 7 | **Obținerea performanței — Exerciții practice** | O3, O4 | Distribuie fișa de lucru cu 3 probleme. Monitorizează activitatea. Oferă asistență individuală. | Rezolvă individual la calculator: **P1** — suma cifrelor unui număr; **P2** — testul de primalitate; **P3** — CMMDC prin algoritmul lui Euclid. | Exercițiu practic | Calculator, fișă de lucru | 13 min |
| 8 | **Asigurarea retenției și transferului** | O5 | Cere elevilor să prezinte soluțiile la P1 și P2. Discută erorile frecvente. Pune întrebarea: *„Care structură ați folosit și de ce?"* | Prezintă soluțiile la proiector. Justifică alegerea structurii. | Conversație + Demonstrație | Videoproiector | 5 min |
| 9 | **Evaluarea** | O1–O5 | Adresează 2 întrebări rapide de verificare (oral + pe tablă). Apreciază verbal participarea. | Răspund la întrebările de evaluare. | Conversație | Tablă | 2 min |
| 10 | **Tema pentru acasă** | — | Anunță tema: implementarea algoritmului de determinare a celui mai mic număr prim mai mare decât n (citit de la tastatură). | Notează tema în caiete. | — | — | 1 min |

**Total: 53 minute** *(variabil cu ±3 min în funcție de clasa)*

---

## CONȚINUT TEORETIC PREDAT (rezumat pentru proiect)

### Structura FOR (ciclu cu număr cunoscut de pași)

```cpp
for (int i = 1; i <= n; i++) {
    // instrucțiuni repetate
}
```

**Exemplu:** Suma cifrelor unui număr
```cpp
int n, s = 0;
cin >> n;
while (n > 0) {
    s += n % 10;
    n /= 10;
}
cout << "Suma cifrelor: " << s;
```

### Structura WHILE (ciclu anterior condiționat)

```cpp
while (condiție) {
    // instrucțiuni
    // obligatoriu: instrucțiune care modifică condiția
}
```

**Exemplu:** CMMDC prin algoritmul lui Euclid
```cpp
int a, b;
cin >> a >> b;
while (b != 0) {
    int r = a % b;
    a = b;
    b = r;
}
cout << "CMMDC = " << a;
```

### Structura DO-WHILE (ciclu posterior condiționat)

```cpp
do {
    // instrucțiuni (se execută cel puțin o dată)
} while (condiție);
```

**Exemplu:** Citire validată
```cpp
int n;
do {
    cout << "Introduceți un număr pozitiv: ";
    cin >> n;
} while (n <= 0);
```

---

## FIȘĂ DE LUCRU — anexă la proiect

**Fișă de lucru Nr. 1 — Structuri repetitive**
**Clasa a IX-a — Informatică**

**P1.** Scrieți un program C++ care citește un număr natural n și afișează suma cifrelor sale.
*(Exemplu: n=1234 → suma = 10)*

**P2.** Scrieți un program care testează dacă un număr natural n este prim.
*(Indiciu: verificați dacă n are divizori între 2 și √n)*

**P3.** Implementați algoritmul lui Euclid pentru calculul CMMDC a două numere naturale a și b.

**P4 (extra):** Scrieți un program care afișează toate numerele prime mai mici decât n (Ciurul lui Eratostene — varianta simplificată).

---

## BIBLIOGRAFIE

- Programa școlară pentru Informatică, clasa a IX-a — MEN România
- Mariana Milosescu — *Informatică, manual pentru clasa a IX-a*, Ed. Teora
- Tudor Sorin — *Informatică, manual clasa a IX-a*, Ed. L&S Infomat
- [didactic.ro — Proiect de lecție clasa IX-a, Algoritmi elementari](https://www.didactic.ro/materiale-didactice/proiect-de-lectie-clasa-a-ixa-informatica-algoritmi-elementari)
- [programareliceu.wordpress.com — Proiecte didactice algoritmi](https://programareliceu.wordpress.com/documente-scolare/mapa-profesorului/programe-scolare/)
