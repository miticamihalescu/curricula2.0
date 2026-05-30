# 02 — Fix-uri: Autentificare, Validare, Sidebar, Flux cont nou

**Fișiere afectate:** `dashboard.html`, `upload.html`, `profile.html`, `index.html`
**Adăugat în:** sesiunea 2026-03-19

---

## BUG 1 — Pagini private accesibile fără autentificare (CRITIC)

**Problema:** `dashboard.html`, `profile.html`, `upload.html` se încărcau complet fără token valid.

**Fix:** Auth guard inline ca **primul `<script>` din `<head>`**, înainte de orice alt script:

```html
<script>(function(){
  var t=localStorage.getItem('curricula-token');
  var u=localStorage.getItem('curricula-user');
  if(!t||!u){ window.location.replace('/login.html'); }
})();</script>
```

**De ce primul din `<head>`:** Blochează render-ul înainte să se încarce conținutul paginii.
Token: `curricula-token` | User: `curricula-user`

---

## BUG 2 — Butonul „Citește planificarea" fără validare vizibilă

**Problema:** Butonul era dezactivat prin JS, dar nu apărea niciun mesaj de eroare vizibil.

**Fix:** Funcție `afiseazaEroare(mesaj)` + validare explicită în click handler:

```js
function afiseazaEroare(mesaj) {
  let errDiv = document.getElementById('err-upload');
  if (!errDiv) {
    errDiv = document.createElement('div');
    errDiv.id = 'err-upload';
    errDiv.style.cssText = 'color:#ff6b6b;margin-top:12px;font-size:14px;text-align:center;';
    btnGenerate.insertAdjacentElement('afterend', errDiv);
  }
  errDiv.textContent = '⚠️ ' + mesaj;
  setTimeout(() => { errDiv.textContent = ''; }, 4000);
}
```

Validare în ordinea: fișier → clasă → materie. Mesaj dispare după 4 secunde.

---

## BUG 3 — Sidebar afișa „Se încarcă..." la nesfârșit

**Problema:** `catch`-ul din `fetchPlans()` nu reseta `planSelect`, lăsând textul inițial.

**Fix:** În blocul `catch` din `fetchPlans()` (dashboard.html):

```js
} catch (e) {
    console.error('Eroare la obținerea planificărilor:', e);
    const planSelectErr = document.getElementById('planSelect');
    planSelectErr.innerHTML = '<option value="">Eroare la încărcare</option>';
}
```

Starea goală (0 planuri) era deja tratată corect — bug-ul era doar la eroare de rețea.

---

## BUG 4 — „Începe gratuit" ducea la upload fără cont

**Problema:** Utilizatorul neautentificat era trimis la `upload.html` direct din landing page.

**Fix (Varianta A):** Toate linkurile „Începe gratuit" din `index.html` duc la `/register.html`:
- Butonul din navbar
- Butonul principal din hero
- Butonul din secțiunea CTA

**Consecință:** `upload.html` este acum pagină protejată (BUG 1) — utilizatorii neautentificați
nu mai pot ajunge la ea direct.
