# Dokumentacja przebudowy

**[→ PLAN.md](PLAN.md)** — czytaj to. Reszta jest materiałem źródłowym, do którego plan się odwołuje.

| Dokument | Po co sięgać |
|---|---|
| **[PLAN.md](PLAN.md)** | Jak to rozegrać: architektura, 21 decyzji twardych, sekwencja czterech równoległych torów, kryteria ukończenia. |
| [07 — Specyfikacje techniczne](07-specyfikacje-techniczne.md) | Uzasadnienia decyzji z planu. Sześć obszarów, cztery przepuszczone przez adwersarza technicznego. |
| [01 — Audyt](01-audyt.md) | 152 ustalenia potwierdzone na kodzie, z plikami i liniami. Plus 16 obalonych — rzeczy, które działają. |
| [02 — Silnik głosu](02-silnik-glosu.md) · [03 — Obróbka dźwięku](03-obrobka-dzwieku.md) | Wcześniejsze specyfikacje. Nadal aktualne w warstwie DSP i algorytmicznej, nieaktualne w harmonogramie. |
| [05 — Krytyka i warstwa produktowa](05-krytyka-i-warstwa-produktowa.md) | Stany brzegowe, onboarding, RODO, i18n, migracja danych. Sekcja D jest nadal w mocy. |
| [06 — Research](06-research.md) | Podstawa merytoryczna ze źródłami i licencjami. |
| [_archiwum-04](_archiwum-04-plan-v1.md) | Pierwsza wersja planu. **Nieaktualna** — patrz niżej. |

## Dlaczego pierwsza wersja planu jest w archiwum

Powstała przy dwóch błędnych założeniach: że pracochłonność jest kryterium odrzucania rozwiązań,
oraz że rozważamy frameworki cross-platform. Oba są nieprawdziwe. Kod piszą modele SOTA bez limitów,
a platformy są natywne per system — web TypeScript, iOS Swift, Android Kotlin.

Skutek: tamten plan wycinał zakres (podcast, korekcja intonacji, enhancement, separacja podkładu)
argumentem „za dużo pracy", i uzasadniał to dodatkowo domniemaniem, że projekt zostanie porzucony.
To domniemanie było nieuprawnione — aplikacja ma użytkowników, którzy do niej wracają.

`PLAN.md` odrzuca rozwiązania wyłącznie merytorycznie: gorszy wynik, zła licencja, martwy projekt,
nie działa na wymaganej platformie.
