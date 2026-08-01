# Krytyka kompletności — sekcje A, B, C

Weryfikowałem twierdzenia o repo bezpośrednio (`package.json`, `wc -l`, grep po `getUserMedia`/`localStorage`/`AudioContext`, `find` po testach i manifeście). Wyniki weryfikacji są wplecione w punkty poniżej.

---

## 1. SPRZECZNOŚCI MIĘDZY SEKCJAMI

### S1. Język rdzenia: A projektuje TypeScript, C nakazuje Rust od etapu 2

**A** (§5.4, §6.1) definiuje `AnalysisEngine` jako interfejs TypeScript, runner `vitest` w Node, i stawia warunek: *„cały DSP musi być importowalny bez przeglądarki"*, *„jeśli test nie uruchamia się w Node, kod nie przeniesie się na Swift/Kotlin"*.
**C** (D1, §2.4) mówi: `core-pitch` (pYIN + Viterbi + segmentacja) wchodzi do Rusta w **etapie 2** — czyli zanim jeszcze powstanie TRAIN v2.

To nie jest różnica stylistyczna. Jeśli `core-pitch` jest w Rust, to `vitest` z sekcji A testuje albo nieistniejący kod TS, albo drugą implementację. Powstaje dokładnie ta klasa błędu, przed którą obie sekcje ostrzegają: **harness mierzy inny algorytm niż ten, który słyszy użytkownik**.

**Rozstrzygnięcie: wygrywa kształt kontraktu z A, wygrywa docelowy język z C, ale harmonogram C jest zły.**
1. Harness (`eval/run.ts`, golden, property) **musi ładować dokładnie ten artefakt, który idzie do produkcji** — czyli `core.wasm` przez `wasm-bindgen` z targetem `nodejs`, nigdy plików `.ts`. Zdanie z A trzeba przeformułować: nie „importowalny w Node jako TS", tylko **„uruchamialny w Node bez DOM"**.
2. Sformułowanie A jest przy tym praktycznie użyteczniejsze na starcie: **etap 2 zostaje w TypeScript**, port do Rusta następuje w etapie 6/7, weryfikowany tymi samymi golden files jako testem równoważności. Uzasadnienie w §4 (nierealizm) — A sama podaje, że JS mieści się w 8,6% budżetu CPU, więc Rust w etapie 2 nie kupuje wydajności, tylko koszt toolchainu przed pierwszą widoczną funkcją.

---

### S2. Rozmiar siatki HMM: 531 binów (A) vs 490 binów (C)

A §5.1/§7.2: `gridMinHz 55`, `gridMaxHz 1175`, `binCents 10` → **531 binów**.
C etap 2: te same granice → **490 binów**.

Arytmetyka: `1200·log₂(1175/55)/10 = 530,0` → 531 binów włącznie. **A ma rację, C się myli.** To nie jest kosmetyka: liczba binów wchodzi do rozmiaru tablicy DP, do budżetu operacji (§7.2 A) i do rozmiaru pamięci. Rozjazd o 8% w dwóch miejscach dokumentu, z których każde jest cytowane jako konfiguracja, to gwarantowany bug przy implementacji.

---

### S3. Model przejścia Viterbi: „σ" (A) vs Laplace (C) — i nikt nie podaje wzoru

A `DecoderConfig`: `sigmaNarrowCents 40`, `sigmaWideCents 250`, `wideMix 0.10`. Nazwa „sigma" sugeruje rozkład normalny.
C etap 2: *„mieszanka dwóch **Laplace'ów** 0.9·σ=40c + 0.1·σ=250c"*.

Gauss i Laplace o tej samej σ różnią się ogonem o rzędy wielkości przy 500 centach — a ogon jest dokładnie tym, co decyduje o tym, czy dekoder przepuści skok kwinty. Test S6 z sekcji A (skoki 5/7/12/19/24 półtony) rozstrzyga się na tym parametrze.

**Rozstrzygnięcie: wygrywa C (Laplace), ale wzór musi być zapisany jawnie w `DecoderConfig`, nie zaszyty w nazwie pola.** Referencyjna librosa używa rozkładu trójkątnego — trzecia możliwość, której żadna sekcja nie wymienia, a która jest tym, co dają cytowane liczby pYIN. Zmień pole na `transitionKernel: 'laplace' | 'gauss' | 'triangular'` i wpisz to do golden files, bo inaczej „baseline" jest baseline'em nieznanego algorytmu.

---

### S4. Diagnoza przyczyny błędów oktawowych: B mówi „próg YIN", A i C mówią „warstwa decyzyjna"

**B** §6.3: *„`lib/pitch-detector.ts:92` ustawia `threshold = 0.25` […] Wyższy próg CMNDF akceptuje pierwsze, słabsze minimum, czyli **zwiększa** ryzyko błędów oktawowych i **subharmonicznych**. Zmiana jednej liczby na 0,10-0,15."*

Mechanizm jest opisany odwrotnie w połowie. YIN bierze **pierwsze** (najmniejsze) `tau`, dla którego `d'(tau) < threshold`. Wyższy próg → wcześniejsze tau → **wyższa** częstotliwość → błąd w górę (harmoniczna). Niższy próg → czekasz na głębsze minimum → często większe tau → **niższa** częstotliwość → błąd **subharmoniczny**. Czyli podniesienie progu subharmoniczne *zmniejsza*, nie zwiększa.

Tymczasem **A** raportuje zmierzone zachowanie obecnego silnika: `E4→÷2`, `C5→÷3`, `A5→÷4`, `C4→÷3`, `E4→÷5` — to są **wyłącznie błędy w dół**. Przy `threshold = 0.25`. **C** wskazuje przyczynę gdzie indziej: `pitch-detector.ts:210-229` (blok blokady oktawowej, warunek zawsze prawdziwy), scoring kandydatów, prior `userRangeMatch`.

**Rozstrzygnięcie: wygrywają A i C. Rekomendacja B jest ryzykowna — obniżenie progu do 0,10 przy tym profilu błędów może pogorszyć sytuację.** Kolejność musi być: (1) usuń warstwę decyzyjną (C, etap 2), (2) zmierz na S2/S3 z korpusu A, (3) dopiero potem strój próg. „Zmiana jednej liczby" jako „poprawka" jest w tym dokumencie najbardziej kuszącym i najgorzej uzasadnionym zaleceniem.

---

### S5. Martwa strefa vs tolerancja — C myli dwa parametry A

**A** §4.2/§4.3: `tol ∈ [20, 70]` centów (tolerancja, mianownik gaussa), `d0 ∈ [12, 28]` a cappella / `d0 = 15` z podkładem (martwa strefa).
**C** etap 3: *„ciągła funkcja `s(e) = exp(-max(0,|e|-d0)²/(2·25²))` z **adaptacyjną martwą strefą 20–70 centów**"*.

C podstawia zakres tolerancji A pod nazwę martwej strefy **i jednocześnie zamraża tolerancję na sztywne 25** — czyli odwraca całą adaptacyjność A. Efekt: nuta 100 ms u basa dostałaby martwą strefę 70 centów zamiast tolerancji 70 centów przy strefie 12. **Ocena byłaby 3–5× łagodniejsza niż zaprojektowana.**

Zabawne jest to, że liczby C dla stopni skali *zgadzają się* z A (kwinta 14 = `12+|2,0|`, tercja wielka 26 ≈ `12+|13,7|`) — czyli C poprawnie odczytał `d0`, a potem nazwał tym samym słowem `tol`.

**Rozstrzygnięcie: wygrywa A bez zastrzeżeń.** C wymaga poprawki redakcyjnej, bo to jest zdanie, z którego ktoś będzie implementował.

---

### S6. TRAIN v2 (etap 3) potrzebuje kalibracji latencji, która jest w etapie 5

**C** wpisuje do MVP TRAIN *„Sing-along z **rzeczywistym odtwarzaniem** MIDI"* i *„Hit the Note na czasie w ms"*.
**A** definiuje `ScoreContext.latencyCalibrated` i `Tm = latencyCalibrated ? timingScore(...) : null` — komponent timing jest **wyłączany**, gdy nie ma kalibracji.
**C** planuje kalibrację latencji w **etapie 5 (SING)**.

Czyli: etap 3 dostarcza sing-along, w którym timing nie jest oceniany, bo nie ma kalibracji — a użytkownik śpiewa do słyszalnego akompaniamentu i widzi, że jego nuty są przesunięte. To jest dokładnie ten bug, który dziś psuje karaoke.

**Rozstrzygnięcie: kalibracja latencji (klik → mikrofon → korelacja krzyżowa, zapis per `deviceId`) przesuwa się do etapu 1.** Jest tania (≤3 dni), jest warunkiem *dwóch* filarów, i jest jednym z trzech spike'ów, które C sam nazywa najważniejszymi (§7.3). Trzymanie jej w etapie 5 jest jedynym miejscem, gdzie kolejność C jest wprost błędna.

---

### S7. Dron referencyjny w TRAIN MVP kontra detektor monofoniczny

**C** wpisuje dron referencyjny do MVP TRAIN i uzasadnia go pięknie („dudnienia to najczulszy detektor intonacji").
**A** przewiduje `f_ctx = 1,0 z dronem` — czyli traktuje dron jako neutralny dla oceny.
**Ani A, ani C nie zauważa,** że dron odtwarzany przez głośnik laptopa/telefonu wraca do mikrofonu i **detektor monofoniczny dostaje dwa jednoczesne tony**. To jest dokładnie ten sam błąd kategorii, za który C skazuje na śmierć grę akordową („ocenia polifonię detektorem monofonicznym").

Wymóg słuchawek + detekcja przecieku (koherencja) są zaplanowane w **etapie 5**, tylko dla SING.

**Rozstrzygnięcie: albo dron wymaga słuchawek już w etapie 3 (i wtedy detekcja przecieku też idzie do etapu 3), albo dron wypada z MVP.** Rekomenduję pierwsze — detekcja przecieku to ta sama funkcja, której SING potrzebuje, i wchodzi raz zamiast dwa razy.

---

### S8. Rust jako plan A, przy trzech obowiązkowych zależnościach C/C++

**C** D1: Rust, *bo „jedna osoba bez testów nie utrzyma C++ z UB w wątku audio"*. C++ jest planem B.
**B** rekomenduje jednocześnie: **Signalsmith Stretch** (C++11 header-only), **libebur128** (C, wendorowana), **RNNoise** (C).

Czyli plan A od pierwszego dnia linkuje trzy biblioteki C/C++ do rdzenia Rust. To znosi główny argument (bezpieczeństwo pamięci — bo UB siedzi w tych właśnie bibliotekach) i wprowadza hybrydowy toolchain (cargo + `cc`/`bindgen` + emscripten dla wasm z C++) w etapie, w którym C zakłada czyste `cargo build --target wasm32`.

Dodatkowo: **budżet `.wasm` rdzenia < 400 kB brotli (C §2.4) nie uwzględnia Signalsmith ani libebur128.**

**Rozstrzygnięcie i tania naprawa:**
- **libebur128 wypada.** Argument C przeciw własnej implementacji (*„BS.1770-4 podaje współczynniki tylko dla 48 kHz"*) jest **unieważniony przez decyzję B §7.1, że format wewnętrzny to 48 kHz**. K-weighting to dwa biquady o stałych współczynnikach + RMS + dwustopniowy gating; w Rust to 150–250 LOC i jest w pełni testowalne plikami EBU TECH 3341. Wendorowanie porzuconego projektu C (ostatni commit 2021) po to, żeby nie napisać 200 linii, jest złym handlem.
- **RNNoise wypada z MVP** (patrz §4 — denoise nie jest problemem tego produktu).
- **Signalsmith zostaje jako osobny moduł WASM**, ładowany leniwie tylko na ścieżce korekcji intonacji, i **nie wchodzi do rdzenia ani do budżetu 400 kB**. To trzeba zapisać wprost.

---

### S9. MediaRecorder: B mówi „porzuć", C mówi „napraw mimeType"

**B** §7.2: *„Nie `MediaRecorder`"* → AudioWorklet → OPFS.
**C** etap 0: *„`pickRecorderMime()` z `isTypeSupported` w 4 miejscach"*.

**Rozstrzygnięcie: obie mają rację, ale to musi być nazwane jako świadomy dwutakt, bo inaczej ktoś zrobi tylko jedno.** Etap 0 = `pickRecorderMime()` (godziny, natychmiast odblokowuje iOS, `audio/mp4`). Etap 1 = MediaRecorder znika razem z wejściem AudioWorkletu. Jeśli tego nie zapisać, `pickRecorderMime()` przeżyje trzy lata jako „to działa, nie ruszaj".

Weryfikacja: **6 miejsc wywołania `getUserMedia`**, nie 5 jak podaje tabela B (`components/multi-track-manager.tsx:213` — martwy kod, ale nadal kompilowany).

---

### S10. Surowe kontury F0: A wymaga, C zabrania

**A** §4.6: *„trzymaj surowe kontury F0 — wtedy przy zmianie formuły przeliczasz historię offline"*.
**C** §3.3: *„Postępy liczone z **zagregowanych metryk per take**, nie z surowych `pitchHistory`"*.

**Rozstrzygnięcie: wygrywa A, ale na innym poziomie granulacji.** Do przeliczenia scoringu **nie są potrzebne ramki** — wystarczy `NoteMeasurement[]` (≈50 B/nutę, czyli ~10 kB na 3-minutowy take). Ramki są potrzebne tylko do przeliczenia *segmentacji i vibrata*.

Polityka:
| co | kiedy trzymać | koszt |
|---|---|---|
| `TakeScore` + `NoteMeasurement[]` | **zawsze, na stałe** | ~10 kB/take |
| surowe ramki `F0Frame` (3 kB/s) | ostatnie 20 sesji + wszystko oznaczone „do korpusu" | ~180 kB/min |
| surowe audio | tylko na jawną prośbę użytkownika | 691 MB/h float32 |

C ma rację, że `pitchHistory` w `localStorage` musi zniknąć. A ma rację, że bez surowych danych wykres postępu przy pierwszej zmianie `scoreVersion` staje się kłamstwem.

---

### S11. Niezmiennik „bit-identyczne `push` vs `analyzeBuffer`" jest niespełnialny jak napisany

Wewnętrzna sprzeczność sekcji A, ale krytyczna, bo to jest **test bramkujący cały etap 0**:

```
analyzeBuffer(pcm, cfg).frames === concat(push(...)) → drain()
```

Tymczasem A sama definiuje ścieżkę live jako `mediana-3 + octave-snap + One Euro` (§7.1) i wprowadza flagę `FrameFlag.OctaveSnapped` = *„ścieżka live poprawiła oktawę"*. Ścieżka oceny to `decodeSequence` (pełny Viterbi). **To są z definicji różne algorytmy.**

**Rozstrzygnięcie:** niezmiennik musi być rozbity na dwa i zapisany precyzyjnie:
- `emitRawFrames(pcm)` ≡ `push`/`drain` w trybie `postprocess: 'none'` — **bit-identyczne** dla dowolnego podziału na chunki. To jest test ramkowania i stanu.
- `decodeSequence(rawFrames)` — czysta funkcja, deterministyczna, ale **nieporównywalna** z live.
- Ścieżka live (`mediana-3`/`snap`/`OneEuro`) jest osobną, czystą funkcją nad `rawFrames` i ma własny test determinizmu.

Jak napisano dziś, test nigdy nie przejdzie i pierwsze dwa dni etapu 0 zejdą na szukanie „buga", którego nie ma.

---

### S12. `FRAME_STRIDE = 8` gubi `tSamples` — czyli dokładnie to, o co walczy §5.2

A §5.2 poświęca akapit na to, że *„`tSamples` to pozycja w strumieniu, nie `Date.now()`"* i że wall-clock *„uniemożliwia sample-accurate synchronizację z podkładem"*. Po czym payload FFI to:

```
FRAME_STRIDE = 8;  // f32: [tMs, f0Hz, cents, periodicity, voicedProb, rmsDbfs, hnrDb, flags]
```

`tSamples` nie przechodzi przez granicę. Zostaje `tMs` **jako f32**: 24 bity mantysy → przy 10 minutach nagrania krok kwantyzacji to 0,06 ms, przy 3 godzinach **1 ms**. Dla filaru PODCAST (cięcia z błędem ≤30 ms, forced alignment) i dla synchronizacji karaoke to jest za mało, a błąd jest cichy i rośnie z długością nagrania.

**Rozstrzygnięcie:** `FRAME_STRIDE = 10`, pierwsze dwa sloty to `tSamples` rozbite na `hi/lo` u32 reinterpretowane z f32, albo — czyściej — drugi, równoległy `Int32Array` na znaczniki czasu. `tMs` zostaje wyłącznie jako wygoda do rysowania.

---

### S13. Hop: 512 (A, C) vs 128–256 (B, korekcja intonacji)

A: `hopSamples: 512 live / 256 offline`, budżet CPU liczony przy 512.
C etap 1: stały hop 512.
B §6.3: *„hop 128-256 próbek. Przy hop 512 korekcja słyszalnie »kroczy«"*.

Dwa problemy naraz:
1. Jeśli SING używa tego samego rdzenia F0, musi umieć hop 128 → **budżet z A §7.2 (0,92 ms/ramkę w JS) przy hopie 128 to 34% jednego rdzenia**, nie 8,6%. Sekcja A liczy budżet tylko dla swojej ścieżki.
2. A ustawia `maxJumpCents: 500 na ramkę` — **bez skalowania hopem**. Przy hopie 256 (ścieżka offline, czyli ta oceniająca!) ten sam limit jest 2× ostrzejszy w centach/sekundę niż live. Ścieżka oceny byłaby *bardziej* podatna na przyklejanie się przy szybkich interwałach niż podgląd. To jest dokładnie odwrotność zamierzenia.

**Rozstrzygnięcie: wszystkie progi „na ramkę" muszą być wyrażone w jednostkach fizycznych** (centy/s, ms), a konfiguracja ma je przeliczać na ramki przy konstrukcji trackera. Dotyczy: `maxJumpCents`, `minVoicedRunMs`, mediany-3, `newNoteHoldMs`. To jest zasada nr 7 z A §5.4 („wszystkie długości okien liczone z `sampleRate`") zastosowana konsekwentnie — A sama jej łamie.

---

### S14. Drobne rozjazdy liczbowe (każdy = jeden cichy bug)

| parametr | A | B | C | uwaga |
|---|---|---|---|---|
| zakres vibrata do detekcji | 4,0–9,0 Hz | 4,5–7 Hz | 5–7 Hz | trzy różne wartości konfiguracji |
| `fMaxHz` detektora vs `gridMaxHz` dekodera | 1200 Hz vs **1175 Hz** | — | — | kandydaci mogą wypaść poza siatkę HMM |
| martwa strefa korekcji intonacji | — | 18 centów | 18 centów | zgodne ✓ |
| wagi komponentów oceny | 0,45+0,25+0,15+0,15+0,12 = **1,12** | — | — | `geoMean` bez jawnej normalizacji zwraca wartość < oczekiwanej; A mówi o renormalizacji tylko przy wyłączonym komponencie |
| liczba zależności runtime | — | — | „46" | **faktycznie 51** w `package.json`; podane jako zweryfikowane |

Ostatni wiersz jest istotny nie dlatego, że 5 pakietów robi różnicę, tylko dlatego, że sekcja C otwiera się zdaniem *„Wszystkie liczby […] zweryfikowałem bezpośrednio na repo"*. Reszta liczb C (21 617 LOC ✓, 29 tras ✓, 0 testów ✓, 24 nieużywane Radix ✓, 37 do usunięcia ✓) sprawdza się co do jednego — tym bardziej szkoda tej jednej.

Dodatkowo w `package.json` są **dwie biblioteki animacji Tailwinda naraz** (`tailwindcss-animate` w deps, `tw-animate-css` w devDeps) — żadna z list C ich nie dotyka.

---

## 2. LUKI

### L1. Prywatność, RODO i wymogi sklepów — **nieobecne we wszystkich trzech sekcjach**

To jest największa luka dokumentu. Konkretnie brakuje:

- **GA4 działa dziś bez zgody.** Zweryfikowałem: `lib/analytics.ts` ładuje `G-BFQ35YS210` bezwarunkowo, w repo nie ma słów `consent`, `cookie`, `polityka`, `RODO`, `privacy`. Właściciel jest w Polsce, użytkownicy w EU. To naruszenie art. 173 Prawa telekomunikacyjnego / ePrivacy niezależnie od RODO, i istnieje **już teraz**, nie po przebudowie.
- **Status prawny głosu.** Sekcje mówią o „danych" i „storage", nigdy o tym, że nagranie głosu to dana osobowa (motyw 51 RODO). Dopóki przetwarzanie jest w 100% lokalne i nie ma kont — obowiązki są minimalne i to jest **przewaga marketingowa, którą trzeba nazwać**. Od momentu, gdy audio idzie do ASR w chmurze (etap 6), pojawia się procesor, umowa powierzenia i obowiązek informacyjny.
- **Sklepy.** iOS wymaga `NSMicrophoneUsageDescription` z sensownym tekstem + Privacy Nutrition Labels; Google Play wymaga formularza Data Safety. Deklaracja „nie zbieramy" jest łatwa **tylko jeśli architektura naprawdę nic nie wysyła** — czyli decyzja o ASR w chmurze jest też decyzją o formularzu w sklepie.
- **`UIBackgroundModes: audio`.** C wpisuje do kryteriów etapu 7 *„nagrywanie w tle 30 min"*. Aplikacja treningowa nagrywająca w tle to pozycja, którą App Review kwestionuje. Nie ma planu B na wypadek odrzucenia.

### L2. Obsługa błędów i stanów brzegowych — jest kilka zdań, brak katalogu

Trzy sekcje wspominają: `> 30% nut niemierzalnych` (A), clipping (B), stan `'interrupted'` (B), Bluetooth HFP (B). Brakuje **wszystkiego pozostałego**, a to jest 80% pracy przy audio na urządzeniu użytkownika:

odmowa uprawnień vs brak urządzenia vs urządzenie zajęte (trzy różne `DOMException`, dziś jeden kłamliwy komunikat) · zmiana urządzenia w trakcie sesji (`devicechange`, AirPods padają w połowie nagrania) · zakładka w tle (rAF dławiony, AudioWorklet nie) · blokada ekranu telefonu · przekroczenie quoty w trakcie zapisu · crash/zamknięcie karty w trakcie 60-minutowego nagrania · cisza (użytkownik nie śpiewa — brak timeoutu) · hałas otoczenia powyżej progu (nagrywać z flagą czy odmówić?) · `sampleRate` inny niż 48 kHz · mono vs stereo wejście.

Domykam to w §5 (sekcja D.1).

### L3. Onboarding i kalibracja — rozproszone po trzech sekcjach, nigdzie jako przepływ

Elementy istnieją: kalibracja mikrofonu (C etap 3), miernik poziomu (B §7.2), kalibracja latencji (C etap 5), wymóg słuchawek (C etap 5), test zakresu głosu (C, nowa trasa). **Nikt ich nie ułożył w jeden przepływ pierwszego uruchomienia**, nie powiedział, co jest obowiązkowe, co pomijalne, co się zapisuje i pod jakim kluczem, ani co się dzieje przy zmianie urządzenia. Domykam w D.2.

### L4. i18n — zero, a decyzja jest tania teraz i droga w etapie 3

Zweryfikowałem: brak jakiejkolwiek biblioteki i18n, wszystkie stringi hardkodowane po polsku w JSX (`app/settings/page.tsx:22 "Ustawienia"`, `app/library/page.tsx:174 "Nagraj sesje"`, …). Przy static exporcie wybór jest binarny (prerender `/pl/*` + `/en/*` vs runtime JSON) i **trzeba go podjąć przed przepisaniem UI w etapie 3**, bo inaczej przepisujesz 21k LOC drugi raz.

Dodatkowo: C buduje całą tezę rynkową PODCAST na polskim, ale TRAIN i SING nie mają żadnego powodu być tylko po polsku — a rynek treningu wokalnego po polsku to ułamek promila. **To dwie różne strategie językowe w jednym produkcie i nikt tego nie nazwał.** Domykam w D.4.

### L5. Offline-first / PWA — B zakłada istnienie PWA, którego nie ma

B §8.4: *„ewikcja po 7 dniach braku interakcji (ITP), **jeśli PWA nie jest dodane do ekranu głównego**"*. Zweryfikowałem `public/`: **nie ma `manifest.json`, nie ma service workera.** Nie ma czego dodać do ekranu głównego. Czyli plan przechowywania z D3 (OPFS jako główny magazyn) stoi na założeniu, które w repo nie jest spełnione.

Poza ITP: TRAIN musi działać w samolocie i w piwnicy — ćwiczenia to JSON, silnik to WASM, nie ma powodu na sieć. Domykam w D.5.

### L6. Migracja danych istniejących użytkowników — zero, a to jednocześnie darmowy korpus

Aplikacja jest na produkcji z GA. Dane użytkowników siedzą w:
```
localStorage: SESSIONS_STORAGE_KEY (pełne pitchHistory), STORAGE_KEY (profil głosu),
              "karaoke-temp-audio" (audio jako base64 dataURL!)
IndexedDB:    3 niezależne bazy (multi-track-storage, audio-storage, project-templates)
```
Etap 0 kasuje 2 900 LOC, etap 3 zmienia format oceny, etap 4 zmienia magazyn. **Bez eksportu przed etapem 0 wszystko to znika.**

Argument nie jest sentymentalny, tylko techniczny: **te sesje są jedynym istniejącym korpusem realnych nagrań tego produktu.** Sekcje A i C obie mówią, że brak 50–100 własnych nagrań jest jedyną rzeczą, której nie da się załatwić teorią (A, otwarte pytanie 9). Kasowanie ich w etapie 0 to strzał we własne kryterium akceptacji etapu 3. Domykam w D.6.

### L7. Model biznesowy — jego brak czyni bramkę decyzyjną C niemierzalną

C §7.2 punkt 3: *„jeśli po TRAIN + SING nie ma ~200 powracających użytkowników albo pierwszych przychodów, PODCAST się nie zaczyna"*.

Nie ma infrastruktury do zmierzenia ani jednego, ani drugiego: GA4 bez zgody nie da wiarygodnych liczb w EU (i nie powinno działać), nie ma kont, nie ma płatności. **Bramka decyzyjna, której nie da się odczytać, nie jest bramką.**
Do tego kurczak/jajko w D2: *„nigdy pełny backend przed pierwszymi płacącymi"*, ale pierwsi płacący w webie wymagają backendu. Wyjście: monetyzacja startuje przez IAP w sklepach (etap 7) albo przez offline-owy klucz licencyjny — i to determinuje, czy w ogóle kiedykolwiek potrzeba kont. Domykam w D.9.

### L8. Dostępność — jest jeden akapit o kolorach, brak reszty

C ma Okabe-Ito + redundancję bez koloru. To dobre i konkretne. Brakuje:
- **Canvas jest niedostępny z definicji.** Cała wizualizacja TRAIN to canvas → dla czytnika ekranu produkt nie istnieje. Potrzebny tekstowy odpowiednik wyniku (live region).
- `prefers-reduced-motion` — piano-roll przewijający się 60×/s.
- Nawigacja klawiaturą, rozmiary celów dotykowych.
- **Feedback wyłącznie dźwiękowy (dron) wyklucza użytkowników niedosłyszących** — a to jest grupa, dla której wizualny trener intonacji jest *przewagą*, nie ustępstwem. Warto to nazwać jako pozycjonowanie, nie tylko jako zgodność.

### L9. Koszty — policzone tylko dla ASR

B i C liczą 0,36–2,80 USD za 9 h ASR. Brak tabeli „ile to kosztuje przy 0 / 100 / 1000 użytkowników", brak kosztów stałych (Apple 99 USD/rok, Google Play 25 USD jednorazowo, domena, R2 przy sync, LLM na show notes). Suma jest niewielka — i właśnie dlatego warto ją pokazać, bo usuwa lęk kosztowy jako powód odkładania decyzji. Domykam w D.8.

### L10. Brak definicji „gotowe" dla samego produktu

Każdy etap ma kryteria techniczne (RPA, LUFS ±0,1 LU, ρ > 0,8). Nie ma **ani jednego kryterium produktowego**: ile osób ma ukończyć onboarding, ile sesji ma trwać retencja, jaka jest pierwsza minuta użytkownika. Przy historii „60 commitów w 14 dni → 6 miesięcy ciszy" najbardziej brakującym artefaktem nie jest kolejny plan techniczny, tylko **jedna liczba, po której właściciel wie, że warto ciągnąć dalej**.

---

## 3. NIEUZASADNIONA PEWNOŚĆ

| # | Twierdzenie | Status faktyczny |
|---|---|---|
| 1 | **„Naiwny DFT to najdroższy zmierzony defekt w repo — 25,84 ms/ramkę"** (A §7.2, C §1.1, D7) | Pomiar był w **Node**, nie w przeglądarce (inny tier JIT, inny GC), na jednym CPU. Poważniejsze: C §1.8 sama pisze, że `computeHarmonicRatio` ma **0 wywołań**. Trzeba powiedzieć wprost, **na jakiej ścieżce i w którym trybie** ten koszt realnie występuje. Jeśli tylko w trybie Pro, to zdanie „najdroższy defekt w repo" jest za mocne — a stoi na nim uzasadnienie etapu 1 i decyzji D7. |
| 2 | **„JS wyrabia się w 8,6% budżetu"** (A §7.2) | A sama oznacza to jako szacunek z liczby operacji (otwarte pytanie 2). Ale w tabeli stoi obok twardo zmierzonych 26,94 ms w tej samej kolumnie formatowania — czytelnik odbiera obie liczby jako równie pewne. To ma konsekwencje: **jeśli 8,6% jest prawdą, argument wydajnościowy za Rustem znika.** |
| 3 | **„Limit ~6 `AudioContext` na kartę"** (B §8.4) | Nieudokumentowane przez Apple; w obiegu funkcjonują wartości 4 i 6, zależne od wersji. Fakt bazowy (przeciek kontekstów w Studio) jest prawdziwy i zweryfikowałem, że repo tworzy **17 kontekstów w 17 miejscach** — ale konkretna liczba limitu jest folklorem. Pisz „kilka", nie „~6". |
| 4 | **„Safari nie ma `COEP: credentialless`"** (A §7.1, B §8.3, C §2.4) | Prawdopodobnie prawda, ale podana bez daty weryfikacji, a jest **jedyną podstawą** rezygnacji z `SharedArrayBuffer` i wątków WASM. Decyzja jest i tak słuszna z innych powodów (gtag, embedy) — ale nie opieraj jej na jednej niedatowanej przesłance. |
| 5 | **„Whisper sam usuwa wypełniacze — nie da się usunąć czegoś, czego nie ma"** (C §4) | Tendencja realna, absolut fałszywy. Zależy od wersji, `temperature`, promptu inicjalnego i języka. Zdanie jest tak kategoryczne, że **wyklucza tanie sprawdzenie** (30 minut: przepuść 3 minuty polskiego audio z „yyy" i policz). |
| 6 | **„Eksperci nie słyszą 20–25 centów" jako uzasadnienie martwej strefy** (C etap 3) | Vurma & Ross dotyczy oceny **interwałów melodycznych w kontekście**, nie progu detekcji. Dla tonów **jednoczesnych** (dron, podkład) próg jest o rząd niższy, bo działają dudnienia. A zastrzega to przy `f_ctx = 0,7`; C używa tej samej liczby bez zastrzeżenia. |
| 7 | **„Zmiana `threshold` 0.25 → 0.10-0.15"** (B §6.3) | Mechanizm opisany częściowo odwrotnie (patrz S4), a zmierzony profil błędów w A (÷2, ÷3, ÷4, ÷5 — wyłącznie w dół) sugeruje, że ta zmiana może pogorszyć. Podane jako jednoznaczna „poprawka do istniejącego kodu". |
| 8 | **„Spearman ρ > 0,8" jako kryterium akceptacji przy n=10** (A §6.7, C etap 3) | Przy n=10 przedział ufności dla ρ = 0,8 rozciąga się mniej więcej od 0,35 do 0,95. **Kryterium jest statystycznie puste.** Albo n ≥ 30 take'ów, albo nazwij to sanity checkiem, a nie bramką. |
| 9 | **„Kryterium akceptacji: mediana 65–75, IQR ~20"** (A §4.6) | A w otwartym pytaniu 9 nazywa to postulatem, którego nie da się zweryfikować bez 50–100 nagrań. W §4.6 stoi jako „kryterium akceptacji". Wewnętrznie niespójne. |
| 10 | **„penn/FCNF0++ — MIT na kodzie *i* checkpointach"** (A §6.4, C D7) | Kluczowe dla legalności całego korpusu, podane bez cytatu z pliku licencji. To samo dla `Basic Pitch` (Apache-2.0 na wagach). Skoro licencja SwiftF0 jest jawnie oznaczona jako niepewna, te dwie zasługują na ten sam rygor. |
| 11 | **„46 zależności runtime, zweryfikowane"** (C, nagłówek) | 51 w `package.json`. Reszta liczb C sprawdza się co do jednego — tym bardziej ta jedna psuje wiarygodność zdania otwierającego. |
| 12 | **„MP3: LGPL-3.0 dziedziczy klauzule anty-DRM → sprzeczne z ToS App Store"** (B §7.4) | Powszechnie powtarzane, ale to interpretacja prawna, nie fakt. Wniosek (nie używaj MP3 w natywnym) jest i tak słuszny z prostszego powodu — brak systemowego enkodera. Nie potrzebujesz spornej przesłanki, skoro masz bezsporną. |
| 13 | **„AudioKit `PitchTap` = `ptrack` z `BINPEROCT 48` = 25 centów rozdzielczości"** (C) | Bardzo szczegółowe twierdzenie o cudzym kodzie, podane bez wskazania pliku. Wniosek („AudioKit tylko do I/O") jest słuszny niezależnie. |
| 14 | **Cały §7.5 sekcji A (budżet latencji 78–153 ms)** | A ma zastrzeżenie metodologiczne ✓ — ale tabela ma format budżetu z sumą, czyli czyta się jak pomiar. B i C zgodnie mówią, że **żadna liczba latencji w całym materiale nie została zmierzona**. Trzy sekcje, jedna prawda, trzy różne poziomy pewności w prezentacji. |

---

## 4. NIEREALIZM I KONKRETNE CIĘCIA

### 4.1. Skala planu

Sekcja C wycenia etapy literami (S/M/L/XL) bez kotwicy czasowej, ale sekcja B podaje twarde liczby dla porównywalnych zadań („rdzeń DSP w Rust 4-8 tyg.", „przebudowa timeline'u 6-10 tyg."). Przeliczając C tą samą skalą, dla **jednej osoby pracującej pełne etaty**:

| etap | zakres C | realna wycena FTE |
|---|---|---|
| 0 — higiena + harness + korpus + CI + baseline | „S/M" | **2–3 tyg.** |
| 1 — AudioWorklet + ring buffer + FFT + WASM w worklecie | „S" | **2–3 tyg.** |
| 2 — pYIN + Viterbi + segmentacja + vibrato + strojenie na korpusie | „M/L" | **6–10 tyg.** (to jest research, nie implementacja) |
| 3 — nowy scoring + dual-view + kalibracja + całe UI TRAIN | „L" | **8–12 tyg.** |
| 4 — core-dsp + LUFS + OPFS + WebCodecs + render offline | „L" | **8–12 tyg.** |
| 5 — SING | „M/L" | **6–8 tyg.** |
| 6 — PODCAST v1 + backend + ASR + EDL-jako-tekst | „L/XL" | **16–26 tyg.** |
| 7 — natywne | „XL" | **12–20 tyg.** |
| **suma** | | **60–94 tygodni FTE** |

To jest **1,5–2 lata pełnoetatowo**, czyli realnie 3–4 lata przy pracy wieczorami. Repo, w którym po 14 dniach intensywnej pracy nastąpiło 6 miesięcy ciszy, tego nie dowiezie. Sekcja C zresztą sama diagnozuje ten wzorzec jako główne ryzyko — a potem przedstawia plan, który go wywoła.

### 4.2. Cięcia, uszeregowane po stosunku oszczędności do straty

**C1. Rust wypada z etapów 1–4. Wraca w etapie 6/7, gdy istnieje druga platforma.** *(oszczędność: 6–10 tygodni)*
Uzasadnienie jest w samym dokumencie: A §7.2 podaje, że JS mieści się w 8,6% budżetu przy hopie 512. Rust w etapie 1 kupuje 6,7 punktu procentowego CPU i kosztuje 2–4 tygodnie na toolchain (cargo + wasm-bindgen + `.wasm` w AudioWorklecie bez `fetch` + CI). C sama argumentuje (tabela 2.4), że `core-score` i `core-edl` warto najpierw napisać w TS pod golden testami i portować mechanicznie. **Rozszerz tę logikę na `core-pitch`** — jeśli golden files są dobre, port pYIN jest mechaniczny; jeśli nie są, Rust i tak nie pomoże. Warunek: reguły przenośności z A §5.4 (zero stanu modułowego, zero `Date.now()`, zero rAF, zero alokacji, zero `console`) obowiązują **od pierwszej linii TS**. To one przenoszą kod, nie język.

**C2. PODCAST wypada z dokumentu. Nie „okrojony" — wypada.** *(oszczędność: 16–26 tygodni + cały backend, ASR, transkrypcja, EDL-jako-tekst, undo/redo timeline'u)*
C sama pisze: *„PODCAST jest osobnym produktem"*, *„jedna osoba part-time nie zbuduje trzech produktów"*, *„bramka decyzyjna przed etapem 6"* — a potem pisze mu etap, kryteria ukończenia i backend. **Trzy filary to decyzja właściciela i nie podważam kierunku — ale kolejność to nie to samo co zakres jednego dokumentu.** Zostaw w planie jedno zdanie i jedną stronę „co PODCAST odziedziczy po TRAIN+SING" (EDL, LUFS, storage, render offline). Wszystko inne pisz, gdy TRAIN i SING żyją.

**C3. Korekcja intonacji wypada z SING v1.** *(oszczędność: 3–4 tygodnie)*
Signalsmith Stretch + martwa strefa + retune tau + rozdział vibrata + bramka wierności + strojenie na uchu = miesiąc. Jest ozdobą przy funkcji, której główną obietnicą jest *„nagranie zgadza się z podkładem co do próbki"*. SING v1 = kalibracja latencji + podkład z pliku + wymóg słuchawek + jeden łańcuch czyszczenia + eksport. Korekcja to v1.1, gdy ktoś o nią poprosi.

**C4. `core-dsp` w etapie 4 redukuje się do czterech bloków: HPF, kompresor, limiter true-peak, LUFS.** *(oszczędność: 4–6 tygodni)*
Wypada: de-esser (wymaga strojenia na korpusie), adaptive leveler, saturacja z 4× oversamplingiem, FDN reverb. Reverb w SING może zostać `ConvolverNode` z jednym IR — **to Web Audio, ale reverb nie produkuje liczby widzianej przez użytkownika**, więc nie łamie reguły z C §2.1. Limiter i LUFS zostają, bo pierwszy usuwa twardy clipping (realny bug), a drugi jest jedyną częścią łańcucha testowalną plikami referencyjnymi.

**C5. Denoise neuronowy (DeepFilterNet / dpdfnet2, 10 MB modelu + runtime ORT) wypada w całości.** *(oszczędność: 2–4 tygodnie + cała niepewność z otwartych pytań B 2 i 4)*
Produkt wymaga słuchawek i cichego pomieszczenia z zupełnie innych powodów (przeciek podkładu, pomiar SNR). Ekspander + HPF załatwiają realistyczny przypadek. To jest dokładnie ryzyko „optymalizacja niewłaściwej rzeczy", które C wypisuje w §7.1.

**C6. Panel percepcyjny przenosi się z etapu 3 do etapu 0.** *(koszt: pół dnia; zysk: kryterium akceptacji dostępne 6 miesięcy wcześniej)*
Nagraj 15 take'ów, każ trzem osobom je uszeregować, zamroź ranking. Od tej chwili **każda** zmiana w scoringu ma natychmiastowy test sensu. Dziś ten test jest kryterium ukończenia etapu 3, czyli dowiadujesz się, czy formuła ma sens, po pół roku pracy nad nią.

**C7. Test zakresu głosu (`/train/range`) przenosi się do etapu 1.** *(koszt: 3–5 dni; zysk: pierwsza nowa funkcja w tygodniu 4, nie w miesiącu 6)*
Jest wsadowy i offline (glissando w górę i w dół, analiza po fakcie), więc **nie wymaga niczego z etapu 2** poza przyzwoitym detektorem na wolnym, stabilnym materiale. C sama pisze, że to funkcja, która „dziś nie działa". To jedyny punkt w całym planie, gdzie da się dostarczyć widoczną nową funkcję przed przepisaniem silnika.

**C8. Capacitor / D4 wypada z decyzji „do podjęcia teraz".** *(oszczędność: 0 tygodni pracy, ale usuwa fałszywe zobowiązanie)*
Etap 7 jest 12+ miesięcy w przyszłości. Jedyna dziś potrzebna konsekwencja D4 („capture w natywnym pluginie, nie przez `getUserMedia` w WebView") wynika już z reguły z §2.1. Wybór shella dokonuje się, gdy shell jest budowany.

### 4.3. Plan po cięciach

| etap | zakres | FTE | widoczny efekt dla użytkownika |
|---|---|---|---|
| **0** | eksport danych → higiena → `openMicrophone()` → `pickRecorderMime()` → naprawa nagrywania → harness + korpus + panel percepcyjny + CI | 2–3 tyg. | **nagrywanie działa na iPhonie; sesje faktycznie się zapisują** |
| **1** | AudioWorklet + ring buffer + FFT + kalibracja latencji + `/train/range` | 3–4 tyg. | **koniec klatkowania; nowa funkcja: test zakresu głosu** |
| **2** | rdzeń F0 (TS): usunięcie warstwy decyzyjnej → pYIN → Viterbi → segmentacja | 6–10 tyg. | **liczba w centach przestaje kłamać; tuner pokazuje A2 jako A2** |
| **3** | TRAIN v2: scoring, dual-view, dron (ze słuchawkami), kalibracja mikrofonu, onboarding | 8–12 tyg. | **pierwszy filar, który działa** |
| **4** | minimalny DSP (HPF/comp/limiter/LUFS) + OPFS + eksport | 5–7 tyg. | eksport bez trzasków i bez zawieszania karty |
| **5** | SING v1 bez korekcji intonacji | 5–6 tyg. | **drugi filar** |
| — | **bramka decyzyjna** | | |
| **6+** | port do Rusta ⟶ natywne ⟶ (osobna decyzja) PODCAST | | |

**~30–42 tygodnie do dwóch działających filarów** zamiast 60–94 do trzech niedziałających. Cięcia nie usuwają ani jednej rzeczy, którą użytkownik zobaczy w pierwszym roku.

---

## 5. SEKCJA D — Warstwa produktowa: stany brzegowe, onboarding, prywatność, dane

> Ta sekcja domyka luki, których nie pokrywa żadna z sekcji A–C. Wszystko poniżej jest **niezależne od wyboru języka rdzenia** i przenosi się na natywne bez zmian, bo dotyczy kontraktu z użytkownikiem, nie DSP.

---

### D.1. Maszyna stanów sesji nagraniowej i katalog błędów

Trzy sekcje opisują, co robić, gdy wszystko działa. Poniżej kontrakt na sytuacje, gdy nie działa — a to jest domyślny stan audio na cudzym urządzeniu.

#### D.1.1. Stany

```
IDLE
 └─ requestPermission() ──► PERMISSION_DENIED ─┐
 └─ openDevice()       ──► DEVICE_ERROR       ─┤
 ▼                                             │
READY  ◄──────────────────────────────────────┘  (po naprawie)
 └─ calibrationMissing ──► NEEDS_CALIBRATION
 ▼
ARMED          poziom wejścia widoczny, nic nie zapisujemy
 ▼
RECORDING ──► INTERRUPTED   (AudioContext 'interrupted' / 'suspended' / visibilitychange)
 │        ──► DEGRADED      (SNR < próg | clipping | XRUN | drop chunków)
 │        ──► DEVICE_LOST   (devicechange: zniknęło aktywne urządzenie)
 │        ──► STORAGE_FULL
 ▼
FINALIZING     flush do OPFS, zamknięcie pliku, obliczenie metryk
 ▼
DONE
```

**Zasady twarde:**
1. `RECORDING → INTERRUPTED` **nigdy nie kasuje tego, co już zapisano.** Zapis jest append-only do OPFS; przerwanie zamyka segment i otwiera nowy po wznowieniu.
2. Każde wyjście ze stanu `RECORDING` (także przez zamknięcie karty) musi zostawić plik, który da się odtworzyć. Manifest sesji (`session.json`) zapisywany co 5 s, nie na końcu.
3. `DEGRADED` **nie przerywa nagrania.** Flaguje ramki i pokazuje ostrzeżenie. Decyzję o wartości nagrania podejmuje użytkownik po fakcie, nie system w trakcie.
4. Wszystkie stany są jednym typem w rdzeniu: `SessionState`, drenowanym tym samym kanałem co `F0Frame`. UI nie zgaduje stanu z wyjątków.

#### D.1.2. Katalog błędów

| kod | wykrycie | komunikat PL (bez oskarżania użytkownika) | akcja |
|---|---|---|---|
| `MIC_DENIED` | `NotAllowedError` | „Przeglądarka zablokowała dostęp do mikrofonu. Kliknij ikonę kłódki obok adresu → Mikrofon → Zezwól." | link do instrukcji per przeglądarka; **nie** proponuj ponownego kliknięcia (Safari nie zapyta drugi raz) |
| `MIC_NOT_FOUND` | `NotFoundError` / `enumerateDevices()` bez `audioinput` | „Nie widzimy żadnego mikrofonu. Podłącz słuchawki lub mikrofon i odśwież." | nasłuch `devicechange`, auto-retry |
| `MIC_BUSY` | `NotReadableError` / `AbortError` | „Mikrofon jest zajęty przez inną aplikację (np. Teams, Zoom, inna karta)." | przycisk „Spróbuj ponownie" |
| `MIC_OVERCONSTRAINED` | `OverconstrainedError` | (bez komunikatu) | automatyczny fallback: zdejmij `sampleRate`, potem `channelCount`, na końcu wołaj `{audio:true}` i **oznacz sesję flagą `constraintsFallback`** |
| `CTX_INTERRUPTED` | `audioContext.state === 'interrupted'` (iOS) lub `'suspended'` | „Nagrywanie wstrzymane — rozmowa telefoniczna lub Siri. Wróć i naciśnij Wznów." | zamknij segment, pokaż Wznów, **nie** próbuj auto-resume (iOS wymaga gestu) |
| `DEVICE_LOST` | `devicechange` + brak `deviceId` na liście | „Odłączono {nazwa}. Nagranie zatrzymane w {mm:ss}, nic nie przepadło." | zamknij segment; po ponownym podłączeniu zaproponuj kontynuację **tylko jeśli `deviceId` ten sam** — inna kalibracja = inna sesja |
| `SR_MISMATCH` | `track.getSettings().sampleRate !== 48000` | (bez komunikatu, wpis w diagnostyce) | resample w rdzeniu, zapisz `actualSampleRate` w metadanych sesji |
| `BT_NARROWBAND` | `sampleRate ≤ 16000` lub pasmo < 8 kHz | „Mikrofon Bluetooth ogranicza jakość do poziomu rozmowy telefonicznej. Do treningu użyj mikrofonu telefonu lub słuchawek przewodowych." | **blokada dla testu zakresu głosu i dla SING**, ostrzeżenie dla reszty |
| `CLIPPING` | `\|x\| > 0,99` w ≥3 kolejnych próbkach, ≥5× w 2 s | „Za głośno — cofnij się od mikrofonu." | pasek na czerwono; **nie** przerywaj; oznacz zakres jako `clipped` |
| `LOW_SNR` | zmierzony SNR < 15 dB względem kalibracji | „Głośno w tle. Wynik będzie mniej dokładny." | flaga `lowConfidence` na sesji; A §4.2 podnosi tolerancję (`f_lvl`) |
| `SILENCE` | brak ramki `voiced` przez 20 s w `RECORDING` | „Nie słyszymy Cię. Sprawdź, czy wybrany jest właściwy mikrofon." | pokaż wybór urządzenia inline |
| `LEAKAGE` | koherencja mic↔podkład > próg w 300–3000 Hz | „Słychać podkład w mikrofonie. Załóż słuchawki." | **blokada startu w SING**, ostrzeżenie w TRAIN |
| `XRUN` | pusta pula buforów w AudioWorklecie | (bez komunikatu poniżej 0,5%) | licznik w diagnostyce; powyżej 2% → `DEGRADED` |
| `STORAGE_FULL` | `QuotaExceededError` lub `estimate()` < 3× przewidywany rozmiar | „Kończy się miejsce. Zostało na ~{n} min nagrania." | **ostrzeżenie PRZED startem**, nie w trakcie; auto-stop z zachowaniem tego, co jest |
| `TAB_HIDDEN` | `visibilitychange` | (bez komunikatu) | AudioWorklet gra dalej, rAF stoi; po powrocie **przerysuj z ring buffera, nie z ostatniej klatki** |

#### D.1.3. Ekran diagnostyczny (`/settings/audio` → „Diagnostyka")

Jedna strona, którą właściciel może kazać otworzyć użytkownikowi zgłaszającemu problem. Zawiera: `navigator.userAgent`, `AudioContext.sampleRate` / `baseLatency` / `outputLatency` (jeśli dostępne), `track.getSettings()` w całości, wynik kalibracji (noise floor, SNR, próg), zmierzoną latencję round-trip, licznik XRUN z ostatniej sesji, `navigator.storage.estimate()`, `engineVersion` + `scoreVersion`. Przycisk „Kopiuj jako tekst".

Koszt: pół dnia. Bez tego każde zgłoszenie „nie działa mi" to godzina korespondencji.

---

### D.2. Onboarding i kalibracja — jeden przepływ

**Zasada: nic nie mierzymy, dopóki nie wiemy, czym mierzymy.** Ale też: **nie każ nikomu przechodzić pięciu ekranów przed pierwszym dźwiękiem.**

#### D.2.1. Podział na obowiązkowe i odroczone

| krok | kiedy | czas | obowiązkowy? |
|---|---|---|---|
| 1. Uprawnienie mikrofonu | przy pierwszym wejściu na ekran nagrywania, **nie** na stronie głównej | 5 s | tak |
| 2. Wybór urządzenia + miernik poziomu | ten sam ekran | 10 s | tak (z domyślnym) |
| 3. **Kalibracja tła**: 2 s ciszy | ten sam ekran, animowany odliczacz | 2 s | tak |
| 4. **Kalibracja głosu**: „zaśpiewaj »aaa« przez 3 s" | ten sam ekran | 3 s | tak |
| 5. **Kalibracja latencji** (klik → mikrofon → korelacja) | odroczona do pierwszego użycia dronu / sing-along / SING | 8 s | warunkowo |
| 6. **Test zakresu głosu** (glissando w górę i w dół) | odroczony, proponowany po 3. sesji | 90 s | nie |
| 7. Wymóg słuchawek + test przecieku | tylko SING i tylko dron | 10 s | warunkowo |

Kroki 1–4 to **20 sekund do pierwszego dźwięku**. Reszta pojawia się dokładnie wtedy, gdy jest potrzebna, z jednozdaniowym wyjaśnieniem *dlaczego teraz*.

#### D.2.2. Co zapisujemy

```ts
interface DeviceCalibration {
  deviceId: string;              // klucz; z MediaDeviceInfo, stabilny per origin
  deviceLabel: string;           // do pokazania użytkownikowi
  platform: string;              // 'ios-safari' | 'android-chrome' | 'desktop-chrome' | ...
  appliedConstraints: MediaTrackSettings;   // z getSettings(), NIE z tego, o co prosiliśmy
  constraintsFallback: boolean;  // czy musieliśmy zdjąć constrainty
  noiseFloorDbfs: number;        // mediana z 2 s ciszy
  snrDb: number;
  voicedEnterDbfs: number;       // noiseFloor + max(10, 0.35·SNR)
  voicedExitDbfs: number;        // enter − 4
  inputLatencyMs: number | null; // z testu loopbackowego; null = nieskalibrowane
  latencyStdMs: number | null;   // 5 pomiarów, odrzuć skrajne; std > 8 ms → powtórz
  measuredAtMs: number;
  calibrationVersion: number;
}
```

**Reguły:**
- Kalibracja jest **per `deviceId`**, nie globalna. Zmiana urządzenia = nowa kalibracja albo ostrzeżenie.
- Kalibracja **wygasa po 30 dniach** i przy zmianie `appliedConstraints`.
- **Każda sesja zapisuje `deviceId` + `platform` + `calibrationVersion` w metadanych.** Bez tego porównywanie postępów między iPhonem a laptopem jest bez sensu (B §8.4 punkt 1) — i wykres postępu musi to widzieć: sesje z różnych platform rysowane różnym kształtem punktu, z legendą.
- **Suwak czułości nie wraca w żadnej formie.** Jeśli użytkownik chce coś regulować, reguluje wzmocnienie systemowe, a my mierzymy wynik.

#### D.2.3. Test latencji — konkret

```
1. Zbuduj graf: OscillatorNode (klik 1 kHz, 5 ms, Hann) → destination
   oraz getUserMedia → AudioWorklet → bufor.
2. Zaplanuj klik na currentTime + 0.5, zapisz tę wartość.
3. Nagrywaj 1,5 s. Znajdź klik w nagraniu przez korelację krzyżową z wzorcem.
4. latencja = t_znaleziony − t_zaplanowany.
5. Powtórz 5×, odrzuć min i max, weź medianę z trzech.
6. std > 8 ms → „Pomiar niestabilny, spróbuj w cichszym miejscu" i powtórz.
7. Wymaga głośnika (nie słuchawek!) — więc to jedyny moment, gdy prosimy o ich zdjęcie.
```
Fallback dla użytkowników bez głośnika: `baseLatency + outputLatency` z `AudioContext` (dostępne od Safari 18.4) + stała 20 ms na wejście, **oznaczone jako oszacowanie**, z komponentem `timing` wyłączonym w scoringu (A: `latencyCalibrated: false`).

---

### D.3. Prywatność, RODO i wymogi sklepów

#### D.3.1. Trzy poziomy przetwarzania — zapisz je i trzymaj się ich

| poziom | co się dzieje | dziś | po przebudowie |
|---|---|---|---|
| **P0 — lokalny** | audio i analiza nigdy nie opuszczają urządzenia | TRAIN, tuner, gry | TRAIN, SING, tuner, metronom |
| **P1 — telemetria anonimowa** | zdarzenia bez treści (nie: bez audio, bez F0, bez transkryptu) | GA4 **bez zgody** ❌ | za zgodą albo wcale |
| **P2 — chmura z treścią** | audio lub transkrypt trafia do procesora | brak | tylko PODCAST/ASR, tylko po jawnej akcji |

**Reguła architektoniczna: przejście P0→P2 wymaga jawnego kliknięcia użytkownika za każdym razem, nigdy ustawienia „domyślnie włączone".** To nie jest wyłącznie zgodność — to jedyna wiarygodna obietnica, jaką jednoosobowy produkt może złożyć przeciw Descriptowi.

#### D.3.2. Do zrobienia natychmiast (etap 0, ~1 dzień)

1. **GA4 za zgodą albo wcale.** Rekomendacja: **wyłączyć GA i zastąpić** licznikiem po stronie Cloudflare (Web Analytics — bez cookies, bez identyfikatorów, nie wymaga zgody) albo prostym `beacon` do Workera z samą trasą. Znika baner, znika ryzyko, a liczby do bramki decyzyjnej z §L7 nadal są.
2. **Strona `/privacy`** — jedna, krótka, po polsku i angielsku. Musi zawierać: co jest przetwarzane lokalnie (wszystko), co opuszcza urządzenie (dziś nic / potem: nazwa trasy), gdzie leżą nagrania (w przeglądarce użytkownika), jak je usunąć, jak wyeksportować, kontakt.
3. **Widoczna kontrola nad danymi w `/settings`:** „Eksportuj wszystkie dane" (jeden ZIP) + „Usuń wszystko" (OPFS + IndexedDB + localStorage, z potwierdzeniem). To realizuje art. 15 i 17 RODO **bez backendu i bez kont**, bo dane są u użytkownika. Koszt: 1 dzień. Wartość: cała kategoria ryzyka znika.

#### D.3.3. Do przygotowania przed etapem 6 (ASR)

- Umowa powierzenia z dostawcą ASR; wybór dostawcy z DPA i przetwarzaniem w EU jeśli to możliwe.
- Ekran przed pierwszą transkrypcją: „Ten plik zostanie wysłany do {dostawca} w celu transkrypcji. Nie jest przechowywany po zakończeniu." + checkbox „nie pytaj ponownie dla tego projektu".
- Zakaz logowania treści w Workerze-proxy (żadnego `console.log(body)` — to najczęstszy wyciek w tej architekturze).
- Retencja u dostawcy: wybierz opcję „no data retention", jeśli istnieje, i zapisz to na `/privacy`.

#### D.3.4. Do przygotowania przed etapem 7 (sklepy)

| wymóg | iOS | Android |
|---|---|---|
| opis użycia mikrofonu | `NSMicrophoneUsageDescription` — konkretny, nie „app needs microphone" | uzasadnienie w Data Safety |
| etykieta prywatności | Privacy Nutrition Labels; przy P0 wszystko „Data Not Collected" | Data Safety: „No data shared" |
| nagrywanie w tle | `UIBackgroundModes: audio` — **App Review kwestionuje to dla aplikacji nie-odtwarzaczy** | `FOREGROUND_SERVICE_MICROPHONE` + notyfikacja |
| konto/logowanie | jeśli jest logowanie → **obowiązkowe Sign in with Apple** | — |

**Plan B na wypadek odrzucenia `UIBackgroundModes: audio`:** nagrywanie tylko przy aktywnym ekranie + `Screen Wake Lock`, komunikat „nie blokuj ekranu w trakcie nagrania". Trzeba go mieć, bo kryterium ukończenia etapu 7 w sekcji C („nagrywanie w tle 30 min przeżywa rozmowę") zakłada zgodę Apple jako pewnik.

---

### D.4. i18n — decyzja do podjęcia przed etapem 3

**Dwie strategie językowe w jednym produkcie:**
- TRAIN i SING nie mają żadnego powodu być polskie. Rynek treningu wokalnego po polsku jest znikomy, a produkt nie zawiera ani słowa specyficznego dla języka.
- PODCAST ma polski jako **całą tezę rynkową**.

**Rekomendacja: `en` jest językiem domyślnym produktu od etapu 3, `pl` pierwszym tłumaczeniem.** To odwraca dzisiejszy stan, ale zwiększa adresowalny rynek TRAIN o dwa rzędy wielkości przy koszcie zera (interfejs jest mały i ma ~300 stringów).

**Realizacja przy static exporcie:**
```
1. Wszystkie stringi do packages/content/i18n/{en,pl}.json
   Klucze płaskie: "train.range.start", nie zagnieżdżone obiekty.
2. Routing: /en/* i /pl/* jako generateStaticParams. Podwaja liczbę stron w /out,
   ale przy 21 trasach to 42 pliki HTML — nieistotne, a daje poprawne SEO i hreflang.
3. Wybór języka: cookie/localStorage → Accept-Language → 'en'. Przekierowanie z / robi
   Cloudflare przez _redirects albo mały skrypt w root page.
4. Format liczb i dat przez Intl (wbudowane), nigdy ręcznie.
5. LINT: zakaz literałów tekstowych w JSX (eslint-plugin-i18next lub własna reguła).
   Bez tego regresja nastąpi w drugim tygodniu.
```
**Koszt teraz: 2–3 dni. Koszt po etapie 3: przepisanie całego UI drugi raz.**

Uwaga o treści: nazwy nut. `C D E` vs `Do Re Mi` vs polskie `H` zamiast `B` — to nie jest tłumaczenie stringów, tylko **ustawienie użytkownika** (`noteNaming: 'english' | 'german' | 'solfege'`) i musi wejść do modelu danych, nie do plików językowych. Polska konwencja `H = B♮`, `B = B♭` jest realną pułapką dla polskiego użytkownika z wykształceniem muzycznym.

---

### D.5. Offline-first i PWA

**Stan faktyczny (zweryfikowany):** w `public/` nie ma `manifest.json`, w repo nie ma service workera. Czyli założenie z sekcji B („eviction, jeśli PWA nie jest dodane do ekranu głównego") opisuje sytuację, której nie da się dziś uniknąć, bo nie ma czego dodać.

**Do etapu 1 (koszt: 2–3 dni):**

1. **`manifest.webmanifest`**: `name`, `short_name`, `display: "standalone"`, ikony 192/512 (maskable), `theme_color`, `orientation: "any"`, `categories: ["music","education"]`.
2. **Service worker — minimalny, precache app shell:** HTML tras, JS/CSS bundla, `core.wasm`, `content/*.json`, ikony. Strategia: `cache-first` z wersjonowaniem po hashu buildu. **Zero cache'owania danych użytkownika** — te są w OPFS i SW ich nie dotyka.
3. **`navigator.storage.persist()`** wołane **po pierwszym zapisanym nagraniu**, nie na starcie (szansa na przyznanie rośnie z zaangażowaniem). Wynik zapisany i pokazany w `/settings`.
4. **Wskaźnik trwałości w UI:** „Twoje nagrania są zapisane trwale ✓" albo „Przeglądarka może usunąć Twoje nagrania po 7 dniach nieaktywności — dodaj aplikację do ekranu głównego lub wyeksportuj". Konkretny, nie ogólny.
5. **Prompt instalacji** pokazywany raz, po trzeciej sesji, z uczciwym powodem („żeby Twoje nagrania nie znikały"), nie jako baner na wejściu.

**Co musi działać bez sieci od etapu 3:** cały TRAIN (ćwiczenia to JSON, silnik to WASM), tuner, metronom, biblioteka, odsłuch. Co wymaga sieci: nic w TRAIN/SING. To jest sprawdzalne jednym testem w CI (Playwright z `context.setOffline(true)` przechodzący ścieżkę: otwórz → nagraj 10 s → zapisz → odtwórz).

---

### D.6. Migracja danych istniejących użytkowników

**Ryzyko:** etap 0 kasuje 2 900 LOC i zmienia magazyn; etap 3 zmienia format oceny. Bez działania — historia znika.
**Drugi, ważniejszy argument:** te sesje to **jedyny istniejący korpus realnych nagrań tego produktu**, a A (otwarte pytanie 9) i C zgodnie mówią, że brak 50–100 własnych nagrań jest jedyną rzeczą, której nie da się załatwić teorią.

#### D.6.1. Co jest do uratowania

```
localStorage["vocal-coach-sessions"]  → sesje z pełnym pitchHistory (limit 5 MB, prawdopodobnie
                                        już obcinany — sprawdź długość tablicy vs deklarowany czas)
localStorage[STORAGE_KEY]             → profil głosu (min/max F0)
localStorage["karaoke-temp-audio"]    → audio jako base64 dataURL (!)
IndexedDB × 3                         → multi-track projects, audio blobs, templates
```

#### D.6.2. Plan (koszt: 1–2 dni, wykonać JAKO PIERWSZĄ RZECZ w etapie 0)

**Krok 1 — jednorazowy eksporter, przed jakimkolwiek kasowaniem.**
Trasa `/export-legacy`, czysty JS, zero zależności od reszty aplikacji. Czyta wszystkie 3 bazy IDB + 3 klucze localStorage, pakuje do jednego ZIP-a:
```
legacy-export-{timestamp}.zip
  manifest.json          { exportedAt, appVersion, counts, userAgent }
  sessions.json          wszystkie sesje z pełnymi metadanymi
  voice-profile.json
  pitch-history/{id}.json
  audio/{id}.{webm|mp4|wav}
  projects/{id}.json
```
Uruchom to **na własnym urządzeniu właściciela i na każdym, do którego jest dostęp**, zanim cokolwiek zostanie skasowane.

**Krok 2 — importer przy pierwszym uruchomieniu nowej wersji.**
Wykryj obecność starych kluczy → jednorazowy ekran: „Znaleźliśmy {n} nagrań z poprzedniej wersji. Przenieść?" → migracja do nowego modelu → **nie kasuj źródła przez 90 dni**, tylko oznacz `migratedAt`. Kasowanie starych kluczy dopiero po potwierdzeniu, że nowa wersja działa.

**Krok 3 — mapowanie i uczciwość wobec danych.**

| stare | nowe | uwaga |
|---|---|---|
| `pitchHistory: {time, frequency, note}[]` | `F0Frame[]` (bez `voicedProb`, `hnr`) | wypełnij `voicedProb = NaN`, **nie** zgaduj |
| `accuracy` (metryka kubełkowa) | **nie migruj** | to jest ta metryka, którą A uznaje za bezwartościową |
| `sessionType` z trasy `/training` | `pillar: 'train'` | trasa nie istnieje — mapuj po najlepszym dopasowaniu |
| czas w ms zapisany jako s (bug od 2. nagrania) | heurystyka: `duration > 3600 → /1000` | **oznacz `timeUnitRepaired: true`** |
| oktawa z `guitar-tuner` (A/A#/B o oktawę za wysoko) | przelicz z `frequency`, nie z `note` | nazwa nuty w starych danych jest niewiarygodna |

**Krok 4 — reguła nadrzędna: historyczne wyniki są przeliczane, nie przepisywane.**
Każdy zmigrowany rekord dostaje `scoreVersion: 0` i **na wykresie postępu jest rysowany innym stylem, z legendą „stara metoda oceny"**. Nigdy nie rysuj starych i nowych wyników jedną linią. To jest dokładnie ostrzeżenie A §4.6 („zmiana formuły czyni wykres postępu kłamstwem") zastosowane do migracji.

**Krok 5 — z eksportu zbuduj korpus.**
Nagrania, dla których istnieje audio, przechodzą do `tools/eval/fixtures/legacy/` z ręcznym oznaczeniem (falset? passaggio? hałas?). To jest darmowe 20–40% zbioru wymaganego przez A §6.4.

---

### D.7. Dostępność — minimalny zestaw, który nie jest kosmetyką

| obszar | wymóg | koszt |
|---|---|---|
| **kolor** | Okabe-Ito + redundancja pozycją, kształtem i liczbą (już w C ✓) | — |
| **canvas** | każda wizualizacja ma **tekstowy odpowiednik** w `aria-live="polite"`, aktualizowany max 1×/s: „C4, 12 centów wysoko, czysto" | 1 dzień |
| **ruch** | `prefers-reduced-motion` → piano-roll przestaje przewijać się płynnie, przeskakuje po nutach; wyłącz wszystkie animacje ozdobne | 0,5 dnia |
| **klawiatura** | Spacja = start/stop, Escape = przerwij, strzałki = nawigacja po nutach w analizie; widoczny focus ring | 1 dzień |
| **dotyk** | cele ≥ 44×44 px; główny przycisk nagrywania osiągalny kciukiem (dolne 1/3 ekranu) | — |
| **słuch** | **dron ma zawsze wizualny odpowiednik** (pulsujący wskaźnik dudnień); żadna informacja nie jest przekazywana wyłącznie dźwiękiem | 1 dzień |
| **kontrast** | 4,5:1 dla tekstu, 3:1 dla elementów graficznych niosących znaczenie — sprawdzalne w CI | 0,5 dnia |

**Pozycjonowanie, nie tylko zgodność:** wizualny trener intonacji to jedno z niewielu narzędzi muzycznych sensownych dla osób niedosłyszących i z implantami ślimakowymi. To warto powiedzieć na stronie głównej — jest prawdziwe, jest różnicujące i nie kosztuje nic ponad powyższą listę.

---

### D.8. Koszty — pełna tabela

**Stałe, niezależne od liczby użytkowników:**

| pozycja | koszt | kiedy |
|---|---|---|
| domena + Cloudflare Pages | ~0 (Pages free do 500 buildów/mies.) | już |
| Cloudflare Web Analytics | 0 | etap 0 |
| Apple Developer Program | **99 USD/rok** | etap 7 |
| Google Play Developer | **25 USD jednorazowo** | etap 7 |
| Cloudflare Workers Paid (proxy ASR) | **5 USD/mies.** | etap 6 |
| **razem rok 1 (bez etapów 6–7)** | **~0 USD** | |
| **razem rok z etapami 6–7** | **~190 USD** | |

**Zmienne (tylko PODCAST, tylko przy P2):**

| pozycja | jednostka | 100 użytkowników × 2 h/mies. |
|---|---|---|
| ASR w chmurze | 0,04–0,31 USD/h (widełki z sekcji B) | **8–62 USD/mies.** |
| LLM na show notes/rozdziały | ~0,01–0,05 USD/odcinek | ~2–10 USD/mies. |
| R2 (jeśli kiedykolwiek sync) | 0,015 USD/GB-mies., **egress 0** | 100 × 1 GB = **15 USD/mies.** |

**Wniosek dla właściciela:** do etapu 5 włącznie ten produkt kosztuje **zero**. Pierwszy realny koszt pojawia się razem z PODCAST-em i skaluje się z użyciem, nie z liczbą zarejestrowanych. To jest silny argument za kolejnością TRAIN → SING → (bramka) → PODCAST i za odłożeniem wszystkiego, co wymaga backendu.

**Anty-koszt, o którym warto pamiętać:** największym kosztem tego projektu jest czas jednej osoby. 62 USD/miesiąc za ASR to ekwiwalent ~1 godziny pracy. Każde zdanie w tych dokumentach o „optymalizacji kosztu ASR" optymalizuje pozycję, która nie jest problemem — sekcja C sama to zauważa (D8) i warto to podkreślić.

---

### D.9. Model biznesowy — tylko w zakresie, w jakim dotyka architektury

Nie projektuję cennika. Projektuję **to, co musi być prawdą w architekturze, żeby jakikolwiek cennik był później możliwy** — i to, bez czego bramka decyzyjna z sekcji C jest niemierzalna.

#### D.9.1. Trzy wymagania architektoniczne

1. **Musi dać się policzyć powracających użytkowników bez naruszania prywatności.** Cloudflare Web Analytics (bez cookies, bez zgody) daje unikalne wizyty i trasy. To wystarczy do bramki „~200 powracających". Do niczego więcej nie potrzeba analityki.
2. **Musi dać się włączyć płatną funkcję bez kont.** Najprostszy działający model dla jednej osoby: **darmowe w webie, płatne w sklepach** (jednorazowy zakup albo subskrypcja przez IAP). Sklep obsługuje płatność, zwroty, VAT-MOSS i tożsamość — czyli wszystkie rzeczy, których jednoosobowy zespół nie chce budować. To znaczy: **konta i backend nie są potrzebne nigdy**, jeśli monetyzacja idzie przez sklepy.
3. **Musi dać się przenieść dane między web a natywnym.** Bez kont oznacza to eksport/import pliku projektu — patrz D.6. To jest **jedyna** konsekwencja braku backendu, która realnie boli użytkownika, i trzeba ją rozwiązać jawnie (eksport ZIP + import), a nie liczyć na sync.

#### D.9.2. Konsekwencja dla mapy drogowej

Decyzja D2 („nigdy pełny backend przed pierwszymi płacącymi") jest **spójna tylko przy założeniu monetyzacji przez sklepy.** Trzeba to dopisać jako założenie, bo inaczej D2 zawiera pętlę bez wyjścia. Jeśli właściciel chce sprzedawać w webie — potrzebuje kont i backendu, i wtedy D2 trzeba przepisać.

---

### D.10. Wpięcie sekcji D w mapę drogową

| element | etap | koszt | dlaczego wtedy |
|---|---|---|---|
| **Eksporter legacy (D.6 krok 1)** | **0, przed czymkolwiek** | 1 dzień | po kasowaniu jest za późno; to darmowy korpus |
| GA4 → Cloudflare Analytics, `/privacy`, eksport/usuń dane (D.3.2) | 0 | 1 dzień | usuwa istniejące naruszenie |
| Katalog błędów `MIC_*` + maszyna stanów (D.1) | 0 | 2 dni | dziś jeden komunikat kłamie o uprawnieniach na całym iOS |
| Ekran diagnostyczny (D.1.3) | 0 | 0,5 dnia | bez tego każde zgłoszenie to godzina korespondencji |
| Manifest PWA + service worker + `persist()` (D.5) | 1 | 2–3 dni | warunek trwałości OPFS na iOS |
| Kalibracja latencji (D.2.3) | **1** *(przesunięte z 5)* | 3 dni | warunek TRAIN sing-along **i** SING |
| Onboarding 4-krokowy (D.2) | 1 | 3 dni | bez kalibracji żadna liczba nie jest porównywalna |
| i18n: ekstrakcja stringów + routing + lint (D.4) | **przed 3** | 2–3 dni | po przepisaniu UI koszt rośnie 10× |
| Importer legacy + `scoreVersion: 0` na wykresie (D.6 krok 2–4) | 3 | 2 dni | wraz z nowym formatem oceny |
| Dostępność: aria-live, reduced-motion, klawiatura (D.7) | 3 | 3–4 dni | razem z przepisywanym UI, nie po |
| Reszta D.3 (ASR, DPA, ekran zgody) | 6 | 2 dni | dopiero gdy cokolwiek opuszcza urządzenie |
| Wymogi sklepów (D.3.4) | 7 | 3 dni + ryzyko review | — |

**Suma nowej pracy: ~22–26 dni roboczych rozłożonych na etapy 0–3.** Przy cięciach z §4 (oszczędność 30–50 tygodni) to jest w całości pokryte — i domyka kategorię ryzyka, która w wersji dzisiejszej dokumentu prowadzi wprost do odrzucenia w App Review, do naruszenia RODO, do utraty historii użytkowników i do produktu, którego nie da się sprzedać poza Polską.