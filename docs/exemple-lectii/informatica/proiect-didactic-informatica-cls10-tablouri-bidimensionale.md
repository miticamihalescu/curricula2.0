# Proiect Didactic — Informatică, Clasa a X-a
## Subiect: Operații specifice tablourilor bidimensionale (matrice)

**Sursa de referință:** programareliceu.wordpress.com — proiect10info2013.doc (adaptat), rasfoiesc.com

---

## DATE DE IDENTIFICARE

| Câmp | Valoare |
|------|---------|
| Unitatea de învățământ | <!-- PLACEHOLDER: Numele școlii --> |
| Profesor | <!-- PLACEHOLDER: Numele profesorului --> |
| Disciplina | Informatică |
| Clasa | a X-a (profil real, matematică-informatică) |
| Unitatea de învățare | Tablouri (arrays) — tablouri bidimensionale |
| Subiectul lecției | Operații specifice matricelor: parcurgere, diagonale, triunghi superior/inferior |
| Tipul lecției | Lecție mixtă (predare + formare de competențe) |
| Durata | 50 minute |
| Data | <!-- PLACEHOLDER: data lecției --> |
| Limbaj | C++ |

---

## COMPETENȚE SPECIFICE VIZATE
*(conform Programei MEN pentru Informatică, clasa a X-a)*

- **CS 1.3** — Identificarea structurilor de date adecvate rezolvării unor probleme
- **CS 2.2** — Implementarea algoritmilor care prelucrează tablouri bidimensionale
- **CS 2.4** — Elaborarea și implementarea algoritmilor de prelucrare a matricelor pătratice
- **CS 3.1** — Selectarea structurii de date și a algoritmului optim pentru o problemă dată

---

## OBIECTIVE OPERAȚIONALE

La sfârșitul lecției, elevii vor fi capabili să:

- **O1** — să declare și să inițializeze o matrice în C++
- **O2** — să parcurgă o matrice pe linii, pe coloane, pe diagonala principală și pe diagonala secundară
- **O3** — să identifice și să prelucreze elementele din triunghiul superior și inferior al unei matrice pătratice
- **O4** — să implementeze operații de bază: suma elementelor, determinarea minimului/maximului, verificarea proprietăților de simetrie
- **O5** — să rezolve probleme practice care utilizează matrice bidimensionale

---

## STRATEGIA DIDACTICĂ

### Metode și procedee
- Conversație euristică
- Explicație cu demonstrație la proiector
- Exercițiu practic individual la calculator
- Tehnica „gândiți — lucrați în perechi — comunicați"

### Mijloace de învățământ
- Calculatoare cu Code::Blocks sau Dev-C++
- Videoproiector
- Tablă
- Fișe de lucru

### Forme de organizare
- Frontală (predare, discuții)
- Individuală (exerciții practice)
- În perechi (verificare reciprocă)

---

## SCENARIUL DIDACTIC

| Nr. | Etapa lecției | Ob. | Activitatea profesorului | Activitatea elevilor | Metode | Mijloace | Timp |
|-----|--------------|-----|--------------------------|----------------------|--------|----------|------|
| 1 | **Moment organizatoric** | — | Verifică prezența. Asigură condițiile de lucru. | Se pregătesc. | — | — | 2 min |
| 2 | **Verificarea cunoștințelor anterioare** | — | Adresează întrebări despre tablouri unidimensionale (vectori): declarare, parcurgere, sortare. Rezolvă oral o problemă simplă cu vectori. | Răspund la întrebări. Prezintă rezolvarea problemei. | Conversație, exercițiu | Tablă | 8 min |
| 3 | **Captarea atenției** | — | Prezintă o imagine cu o tablă de șah sau o matrice de pixeli. Întreabă: *„Cum am putea stoca aceste date în memorie?"* Conduce spre conceptul de matrice. | Observă imaginile. Propun soluții. | Problematizare | Videoproiector | 3 min |
| 4 | **Anunțarea titlului și obiectivelor** | — | Scrie titlul pe tablă. Prezintă obiectivele lecției. | Notează titlul. | — | Tablă | 2 min |
| 5 | **Dirijarea învățării — Declarare și inițializare** | O1 | Explică declararea: `int a[10][10]; int n, m;`. Prezintă citirea elementelor cu dublu for. Demonstrează la proiector. | Urmăresc, notează sintaxa. | Explicație + Demonstrație | Videoproiector | 7 min |
| 6 | **Dirijarea învățării — Diagonale și triunghiuri** | O2, O3 | Explică pe tablă: diagonala principală (`i==j`), secundară (`i+j==n-1`), triunghi superior (`j>i`), inferior (`j<i`). Desenează vizual pe tablă o matrice 4x4. | Urmăresc desenul. Notează condițiile. Pun întrebări. | Explicație + Demonstrație | Tablă | 8 min |
| 7 | **Obținerea performanței — Exerciții la calculator** | O3, O4, O5 | Distribuie fișa de exerciții. Monitorizează activitatea individuală. Oferă indicii când e nevoie. | Rezolvă la calculator: **P1** — afișarea elementelor de pe diagonala principală; **P2** — suma elementelor din triunghiul superior; **P3** — verificarea dacă matricea este simetrică față de diagonala principală. | Exercițiu practic | Calculator, fișă | 15 min |
| 8 | **Asigurarea retenției și transferului** | O5 | Cere 2-3 elevi să prezinte soluțiile. Discută abordările alternative. Subliniază condițiile pentru fiecare zonă a matricei. | Prezintă soluțiile la proiector. Compară abordările. | Conversație + Demonstrație | Videoproiector | 5 min |
| 9 | **Evaluarea** | O1–O5 | Adresează 2 întrebări de verificare: *„Care este condiția pentru elementele de pe diagonala secundară?"* | Răspund la întrebări. | Conversație | — | 2 min |
| 10 | **Tema pentru acasă** | — | Anunță tema: Scrieți un program care transpune o matrice (transpusa = interschimbarea liniilor cu coloanele). | Notează tema. | — | — | 1 min |

---

## CONȚINUT TEORETIC

### Declarare matrice în C++

```cpp
int a[100][100];
int n, m; // n = nr linii, m = nr coloane

// Citire matrice
for (int i = 0; i < n; i++)
    for (int j = 0; j < m; j++)
        cin >> a[i][j];

// Afișare matrice
for (int i = 0; i < n; i++) {
    for (int j = 0; j < m; j++)
        cout << a[i][j] << " ";
    cout << endl;
}
```

### Zone ale matricei pătratice (n x n)

```
Diagonala principală:    i == j
Diagonala secundară:     i + j == n - 1
Triunghi superior:       j > i
Triunghi inferior:       j < i
Triunghi sup. (inclusiv diag.): j >= i
```

### Exemplu complet — suma diagonalei principale

```cpp
int s = 0;
for (int i = 0; i < n; i++)
    s += a[i][i];
cout << "Suma diagonalei principale: " << s;
```

### Exemplu — verificare matrice simetrică

```cpp
bool simetric = true;
for (int i = 0; i < n && simetric; i++)
    for (int j = i+1; j < n && simetric; j++)
        if (a[i][j] != a[j][i])
            simetric = false;
cout << (simetric ? "Simetrica" : "Nu este simetrica");
```

---

## BIBLIOGRAFIE

- Programa școlară pentru Informatică, clasa a X-a — MEN România
- Tudor Sorin — *Informatică, manual clasa a X-a*, Ed. L&S Infomat
- [programareliceu.wordpress.com — Operații asupra tablourilor bidimensionale](https://programareliceu.wordpress.com/documente-scolare/mapa-profesorului/programe-scolare/)
- [rasfoiesc.com — Pointeri și tablouri C++](https://www.rasfoiesc.com/educatie/informatica/POINTERI-SI-TABLOURI-POINTERI-35.php)
