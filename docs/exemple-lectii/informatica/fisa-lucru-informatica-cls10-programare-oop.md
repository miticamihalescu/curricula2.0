# Fișă de lucru — Informatică, Clasa a X-a
## Programare orientată pe obiecte — Clase și obiecte în C++

**Școala:** ___________________________ **Data:** ___________
**Clasa:** a X-a **Numele și prenumele:** ___________________________

---

### Exercițiul 1 — Noțiuni teoretice (20 puncte)

Completați spațiile libere cu termenii corecți:

a) În OOP, un _______________ este un șablon (template) care definește structura și comportamentul unui obiect.

b) _______________ unui obiect sunt variabilele membre (câmpurile), iar _______________ sunt funcțiile membre.

c) Modificatorul de acces _______________ permite accesul la membrii clasei doar din interiorul acesteia.

d) Constructorul este o funcție membră cu _______________ ca și clasa, fără tip de retur, apelat automat la _______________ unui obiect.

e) Principiul prin care un obiect al unei clase derivate poate fi folosit în locul unui obiect al clasei de bază se numește _______________.

---

### Exercițiul 2 — Analiză de cod (25 puncte)

Analizați codul următor și răspundeți la întrebări:

```cpp
#include <iostream>
using namespace std;

class Dreptunghi {
private:
    double lungime;
    double latime;
public:
    Dreptunghi(double l, double lt) {
        lungime = l;
        latime = lt;
    }
    double arie() {
        return lungime * latime;
    }
    double perimetru() {
        return 2 * (lungime + latime);
    }
    void afisare() {
        cout << "L=" << lungime << ", l=" << latime << endl;
        cout << "Arie=" << arie() << ", Perimetru=" << perimetru() << endl;
    }
};

int main() {
    Dreptunghi r1(5.0, 3.0);
    Dreptunghi r2(7.5, 2.0);
    r1.afisare();
    r2.afisare();
    return 0;
}
```

a) (5p) Ce afișează programul la execuție?

___________________________________________________

b) (5p) De ce câmpurile `lungime` și `latime` sunt `private`? Ce problemă s-ar putea apărea dacă ar fi `public`?

___________________________________________________

c) (5p) Ce se întâmplă dacă scriem `r1.lungime = 10;` în `main`? Explicați eroarea.

___________________________________________________

d) (10p) Adăugați o metodă `estePatrat()` care returnează `true` dacă dreptunghiul e pătrat. Scrieți implementarea completă.

___________________________________________________

---

### Exercițiul 3 — Scriere de cod (30 puncte)

Definiți clasa `Student` cu:
- **Atribute private:** `nume` (string), `medie` (double), `clasa` (int)
- **Constructor** cu toți parametrii
- **Getteri** pentru fiecare atribut (funcții `getNume()`, `getMedie()`, `getClasa()`)
- **Metodă** `afisare()` care afișează: „Studentul [nume], clasa [clasa], media: [medie]"
- **Metodă** `esteBursabil()` care returnează `true` dacă media >= 9.50

```cpp
// Scrieți codul clasei Student:
```

---

### Exercițiul 4 — Aplicație completă (25 puncte)

Extindeți clasa `Student` cu o metodă statică `compareMedii(Student s1, Student s2)` care afișează care student are media mai mare.

Scrieți un program `main()` care:
1. Creează 3 obiecte Student
2. Le afișează pe toate
3. Identifică câți sunt bursabili
4. Afișează studentul cu cea mai mare medie

---

**Total: ___ / 100 puncte**
*Se acordă 10 puncte din oficiu.*

---

### Barem de corectare
- Ex. 1: clasă / atribute, metode / private / același nume, crearea / polimorfism — câte 4p
- Ex. 2: a) afișare corectă (5p); b) încapsulare, accesul necontrolat poate duce la valori invalide (5p); c) eroare de compilare — `lungime` e private (5p); d) `bool estePatrat() { return lungime == latime; }` (10p)
- Ex. 3: clasă completă, corect sintactic (15p) + toate metodele cerute (15p)
- Ex. 4: logică corectă de comparare și iterare (15p) + sintaxă C++ corectă (10p)
