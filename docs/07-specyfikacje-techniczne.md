# Specyfikacje techniczne — materiał źródłowy planu

Sześć obszarów zrewidowanych przy założeniach: jakość maksymalna, pracochłonność nie jest kryterium odrzucenia, natywne per platforma (web TS · iOS Swift · Android Kotlin), iOS startuje natychmiast.

Cztery z nich przeszły przez adwersarza technicznego, który szukał rzeczy niedziałających, martwych projektów i licencji wykluczających użycie komercyjne. Jego ustalenia są na końcu każdego rozdziału i **mają pierwszeństwo**.

Plan (`PLAN.md`) odwołuje się do decyzji stąd. Ten dokument jest referencją, nie lekturą ciągłą.

---

## Warstwa oceny śpiewu (core-eval) dla platformy Vocal Coach — segmentacja na nuty, vibrato, referencja adaptacyjna, wyrównanie czasowe, scoring, wymiary poza wysokością, feedback pedagogiczny, walidacja, poprzeczka rynkowa

**Werdykt:** Budujemy `core-eval` — osobną, czystą warstwę domenową (bez Web Audio, bez DOM), która przyjmuje kontur F0 + energię + cechy widmowe + opcjonalną referencję, a zwraca `PerformanceReport`: ocenę per nutę, cztery ortogonalne wymiary i listę findings. Rdzeń decyzji: (1) ocena wyłącznie per NUTA, na stanie ustalonym, po odjęciu vibrata, w domenie centów — nigdy per ramka i nigdy w hercach; (2) błąd rozkładany na wolny offset tonacji O(t) i residuum r_i, bo to jedyny sposób odróżnienia "czysto ale niżej" od "chaotycznie" — i jest to empirycznie potwierdzone: MusicJudge (Interspeech 2026) estymuje klucz z SAMEGO wykonania, nie z podkładu, właśnie żeby nie karać transpozycji, i osiąga Spearman ρ=0.683 z sędziami-ekspertami; (3) segmentacja na nuty przez SIEĆ, nie przez reguły — TONY (HMM na konturze F0, czyli najlepsze podejście regułowe) ma COn F1 = 67.5 czysto / 49.2 w szumie, ROSVOT = 94.0 / 93.8, przewaga 26.5 / 44.6 punktu; kod ROSVOT jest MIT, ale wagi są bezużyteczne prawnie (M4Singer = NOASSERTION, brak licencji wag), więc retrenujemy tę architekturę na CC-BY; (4) z sieci bierzemy WYŁĄCZNIE granice — dekoder wysokości wyrzucamy, bo model transkrypcji wytrenowany na czystym śpiewie "przyciąga" fałszywą nutę do zamierzonej i kasuje dokładnie ten błąd, który mierzymy (BERT-APC pokazuje 10.49 pp różnicy RPA na mocno rozstrojonych próbkach); (5) vibrato jest wykrywane, parametryzowane i PREMIOWANE, a jego składowa jest odejmowana przed liczeniem stabilności; (6) wynik końcowy to średnia geometryczna czterech wymiarów przepuszczona przez kalibrację percentylową dopasowaną do populacji referencyjnej — to jedyna konstrukcja, która z definicji nie może zawsze pokazywać 90% ani zawsze 40%. Poprzeczka odbioru: Spearman ρ ≥ 0.70 ze średnią z ≥3 nauczycieli na 120 wykonaniach (opublikowany SOTA to 0.683; sam pitch to ~0.485).

### Decyzje

| Pytanie | Rozstrzygnięcie | Dlaczego | Odrzucone |
|---|---|---|---|
| Segmentacja na nuty: reguły (histereza na konturze F0, SiPTH) czy model uczony? | Model uczony jako ścieżka główna: architektura ROSVOT (U-Net 4 down/up, downsampling 16, 2-warstwowy Conformer w wąskim gardle, wejście mel + log-F0 + opcjonalne granice słów, focal loss, miękkie etykiety gaussowskie o szerokości 80 ms, próg μ=0.8). Reguły histerezowe zostają WYŁĄCZNIE jako fallback offline/cold-start i jako generator etykiet wstępnych do anotacji. | Twarde liczby z Tabeli 1 ROSVOT (ACL 2024), metryki Molina et al. 2014 przez mir_eval, tolerancja onsetu 50 ms, offsetu max(50 ms, 20% długości nuty), wysokości 50 centów: TONY (HMM na konturze F0 — czyli dokładnie najlepsza wersja podejścia regułowego, ta z Tony/pYIN) osiąga COn F1 67.5 czysto i 49.2 w szumie, COnPOff 43.9/28.4. ROSVOT: COn 94.0/93.8, COff 94.5/94.4, COnPOff 77.4/77.0, AOR 97.0/9 | Odrzucone: (a) czysta histereza na konturze pitch-time (SiPTH/Molina) jako ścieżka główna — merytorycznie gorsza o 26+ punktów F1 i katastrofalnie degraduje w szumie, a nasi użytkownicy nagrywają telefonem w pokoju; zostaje jako fallback; (b) klasyczny onset detection przez spectral flux — zaprojektowany pod transient perkusyjny, którego głos nie ma; w legato i na samogłoskach ciągłych nie ma żadn |
| Czy model transkrypcji ma dostarczać także WYSOKOŚĆ nuty, czy tylko granice? | Tylko granice. Dekoder wysokości D_P jest usuwany z architektury. Wysokość nuty liczymy zawsze z ciągłego konturu F0 jako środek tonu (średnia krocząca po dokładnie jednym okresie vibrata, w domenie centów) na stanie ustalonym. | To jest różnica między transkrypcją a oceną i pomylenie jej niszczy produkt. Model transkrypcji jest trenowany tak, żeby zwracać nutę ZAMIERZONĄ — jego dekoder wysokości uczy się przyciągać fałszywe wykonanie do najbliższej sensownej muzycznie nuty. BERT-APC (arXiv 2511.20006) mierzy dokładnie ten efekt: ich predyktor 'stationary pitch' przewyższa ROSVOT o 10.49 punktu procentowego raw pitch accur | Odrzucone: użycie MIDI-owego wyjścia jakiegokolwiek modelu transkrypcji (ROSVOT, VOCANO, MusicYOLO, Omnizart) jako wartości nuty do oceny — kwantyzacja do półtonu kasuje mierzoną wielkość. Odrzucone też liczenie środka nuty jako średniej arytmetycznej częstotliwości w hercach (tak robi obecny kod: hooks/use-training-mode.ts, avgFrequency = suma f / n) — przy vibrato systematycznie przesuwa wynik w |
| Referencja intonacji: temperacja równa czy naturalna? Jak odróżnić 'czysto ale niżej' od 'chaotycznie'? | Referencja trybowa: a cappella → martwa strefa zależna od stopnia skali (5-limit JI), offset tonacji NIE karany; z podkładem o stałym stroju → ET, offset karany powyżej progu. Rozkład obowiązkowy: e_i = O(t_i) + r_i, gdzie O(t) to wolny offset (transpozycja + dryf), a r_i to residuum. Do UI idą DWIE liczby: 'intonacja' = 1.4826·MAD(r) i 'strojenie' = O. Niska dyspersja + duże \|O\| = 'czysto, ale  | To jedyna decyzja w całej warstwie, która ma bezpośrednie potwierdzenie empiryczne na sędziach-ekspertach. MusicJudge (Saini & Ghosh, Samsung R&D Bangalore, Interspeech 2026, arXiv 2606.26451) estymuje globalny klucz K z akompaniamentu SAMEGO WYKONANIA, a nie z referencyjnego podkładu, i uzasadnia to dosłownie: 'to avoid penalizing intentional transposition while still enforcing intra-performance  | Odrzucone: (a) mierzenie odległości do najbliższego DOWOLNEGO półtonu — to robi obecny kod (lib/pitch-detector.ts:17, cents = odległość do zaokrąglonego numeru nuty; hooks/use-session-library.ts:60 buduje z tego 'averageAccuracy') i jest to metryka bez celu dydaktycznego: nucący bez sensu ale stabilnie dostaje wysoki wynik, a poprawnie zaśpiewana melodia 30 centów niżej dostaje zero; (b) karanie o |
| Wyrównanie czasowe: jeden aligner czy dwa? | Dwa, i nigdy nie wolno oceniać z alignera live. (A) KURSOR LIVE: online DTW (OLTW w stylu Dixon/MATCH) na konturze INTERWAŁOWYM, szerokość okna c=100 ramek (±1 s przy hopie 10 ms), tylko do prowadzenia UI. (B) SCORING: offline'owe wyrównanie Needlemana-Wunscha na poziomie NUT (nie ramek), z jawnymi stanami deletion (nuta pominięta) i insertion (nuta dodana), uruchamiane po zakończeniu take'u. Kosz | Przegląd arXiv po 'score following' / 'online dynamic time warping' / 'audio-to-score alignment' (25 najnowszych pozycji, w tym Matchmaker 2510.10087, 'Precise and Simple Audio-to-Score Alignment' 2605.20014, 'Just Label the Repeats' 2411.07428, neuronowy score follower 2503.06348, 'Musical Score Following using Statistical Inference' 2502.10426) daje jednoznaczny obraz: CAŁA ta literatura jest fo | Odrzucone: (a) proporcjonalne rozciąganie nagrania na siatkę nut, czyli to co robi obecny kod (hooks/use-training-mode.ts:161: noteStartRatio = currentTime/totalDuration przemnożone przez actualDuration) — jedna dłużej trzymana nuta rozjeżdża wszystkie następne i ocena mierzy wtedy głównie to, czy użytkownik zaczął i skończył równo z metronomem; (b) DTW na chromie audio — droższe i mniej sensowne  |
| Vibrato: karać, ignorować czy nagradzać? | Nagradzać jako osobny wymiar i odejmować przed liczeniem stabilności. Detekcja tylko na stanie ustalonym ≥500 ms (≥3 okresy): detrend medianą kroczącą 250 ms w centach → okno Hanna → FFT z zero-paddingiem → szczyt w 4.0–9.0 Hz → wymóg prominencji ≥6 dB nad średnią mocą 1–15 Hz. Parametryzacja cyklowa po filtracji pasmowej 3–9 Hz + Hilbert: rate [Hz], extent [± centy] = 1200·log2(f_max/f_min)/2, re | Zdrowe vibrato zawodowca ma zasięg ±34 do ±123 centów (średnia ±71) przy tempie 5–6.25 Hz (Prame 1994/1997). Obecny próg 'off' w kodzie to 25 centów (lib/pitch-detector.ts:280) — czyli poprawnie zaśpiewana nuta z vibratem spędza WIĘKSZOŚĆ czasu w kategorii 'off', a aplikacja systematycznie wystawia lepsze oceny głosom niewytrenowanym (prosty ton) niż wytrenowanym. To jest wprost odwrócenie celu pr | Odrzucone: (a) traktowanie odchylenia chwilowego jako fałszu — to główne źródło antywzorca 'zawsze 40%'; (b) wygładzanie konturu filtrem o odcięciu poniżej 8–10 Hz przed oceną — spłaszcza vibrato 4–7 Hz i kasuje dowód umiejętności; (c) detekcja vibrata na oknach krótszych niż 500 ms — poniżej 3 okresów rozdzielczość FFT nie pozwala odróżnić vibrata od drżenia i od wolnego portamento. |
| Jak złożyć metryki w jeden wynik, który nie jest zawsze 90% ani zawsze 40%? | Średnia geometryczna czterech wymiarów z podłogą 0.15 na każdym, przemnożona przez bonus ekspresyjny do +12%, a następnie przepuszczona przez MONOTONICZNĄ MAPĘ KALIBRACYJNĄ dopasowaną per klasa trudności tak, żeby populacja referencyjna trafiała w zadane kwantyle: p10→30, p25→45, p50→62, p75→78, p90→88, p99→96. Wagi a cappella: intonacja .40, kompletność .30, rytm .15, stabilność .15. Wagi karaoke | Rozkład wyniku jest własnością konstrukcji, a nie skutkiem ubocznym — i tylko kalibracja percentylowa gwarantuje go z definicji. 'Zawsze 90%' bierze się z metryk saturujących (procent ramek w tolerancji saturuje, bo tolerancja jest hojna i większość ramek trafia); 'zawsze 40%' bierze się z karania rzeczy poprawnych. Fizyka (martwa strefa, rozkład offsetu, pominięcie ataku, odjęcie vibrata) usuwa d | Odrzucone: (a) średnia arytmetyczna sub-score'ów — pozwala nadrobić katastrofę w jednym wymiarze doskonałością w innym, co jest pedagogicznie fałszywe; (b) czysta średnia geometryczna bez podłogi — jedno zero zeruje cały wynik i produkuje bezużyteczne 0/100; (c) 'procent ramek w tolerancji' w jakiejkolwiek postaci (obecne hooks/use-training-mode.ts hitRate i use-session-library.ts averageAccuracy) |
| Które wymiary poza wysokością wchodzą do produktu? | WCHODZĄ: zakres (VRP, percentyl 5/95, bramka ≥400 ms + stabilność), stabilność tonu podtrzymanego (SD centów po odjęciu vibrata + dryf w centach/s), celność i kierunek ataku (czas dojścia do ±25 centów, znak przestrzelenia), długość frazy / MPT, parametry vibrata, dynamika WZGLĘDNA w obrębie jednego take'u (messa di voce), pozycje oddechów. WCHODZI Z OGRANICZENIEM: rejestr jako 3-klasowy klasyfika | Kryterium jest jedno: czy pomiar jest niezmienniczy na to, czego nie kontrolujemy — mikrofon, odległość, pokój, AGC. Zakres, stabilność, atak, długość frazy i vibrato są liczone z konturu F0 i z RÓŻNIC w czasie, więc są odporne na wzmocnienie i pasmo mikrofonu. Dynamika absolutna nie jest — telefon z AGC i zmienna odległość ust od mikrofonu niszczą ją całkowicie, więc dopuszczamy tylko kontrast we | Odrzucone i uzasadnienie: jitter/shimmer — metryka kliniczna wyrwana z kontekstu, sprzeczna z vibratem; dynamika w dBFS/SPL jako liczba pokazywana użytkownikowi — niemierzalna bez kalibracji, a phone AGC pełznie po głośności; barwa absolutna ('twój głos jest ciepły') — pseudonauka na mikrofonie telefonu; 'podparcie oddechowe' jako WIELKOŚĆ MIERZONA — nie istnieje sygnał akustyczny, z którego da si |
| Jak feedback ma powstawać: reguły czy LLM? | Trójstopniowo, z twardą granicą: (1) silnik REGUŁ produkuje findings — każdy finding ma warunek liczbowy, minimalną liczebność próby, rozmiar efektu i listę dowodów (konkretne nuty); (2) priorytetyzacja wybiera JEDEN finding na sesję; (3) LLM dostaje wyłącznie ustrukturyzowane findings i formułuje z nich zdanie. LLM nigdy nie widzi surowego audio ani surowych liczb bez findingu i nie ma prawa post | Dokładnie ten wzorzec jest zwalidowany: MusicJudge generuje feedback naturalnojęzykowy przez LLM (gpt-oss-120b), ale karmi go WYŁĄCZNIE ustrukturyzowanymi sekwencjami ocen blokowych {C_k}, {M_k}, transkrypcją i referencją — i osiąga 63.97 podobieństwa kosinusowego (all-MiniLM-L6-v2) z komentarzami ekspertów. Ich uzasadnienie architektoniczne jest też nasze: 'sekwencje ocen blokowych zachowują loka | Odrzucone: (a) podanie LLM-owi surowego konturu F0 i poproszenie o diagnozę — model będzie halucynował przyczyny fizjologiczne, których nie da się zweryfikować, a użytkownik nie ma jak ich podważyć; (b) wyświetlanie wszystkich znalezionych problemów naraz — sprzeczne z guidance hypothesis i w praktyce paraliżujące; (c) formułowanie diagnozy przyczynowej z pojedynczej obserwacji — każdy finding ma  |
| Jak udowodnić, że ocena jest dobra? | Trzy poziomy, wszystkie w CI. (1) SYNTETYK ze wstrzykniętym znanym odchyleniem — testy monotoniczności i rozdzielczości, bramka twarda. (2) KORPUSY Z ADNOTACJĄ, tylko permisywne: vocadito (CC BY 4.0, 40 fragmentów, 7 języków, nuty od DWÓCH niezależnych anotatorów-muzyków) jako zbiór testowy i jako pomiar SUFITU LUDZKIEGO; Annotated-VocalSet (CC BY 4.0, DOI 10.5281/zenodo.7061507, 10 h, 20 śpiewakó | Protokół i poprzeczka są przepisane z jedynej pracy, która to zmierzyła na ludziach: MusicJudge użył 120 wykonań ocenionych niezależnie przez ≥3 ekspertów na skali 1–10, raportuje dokładnie ten zestaw metryk (ρ, τ, MSE, MAE, MedAE) i osiąga ρ=0.683 / τ=0.499. W tej samej tabeli metryki oparte na samym detektorze F0 dają ρ≈0.485 (pYIN), 0.442 (CREPE), 0.421 (SWIPE). Zatem 0.70 to poprzeczka postawi | Odrzucone jako źródła danych: MDB-stem-synth (CC BY-NC-SA — niekomercyjna), MIR-1K i iKala (dostęp ograniczony), M4Singer (NOASSERTION), zbiór dynamiki z arXiv 2410.20540 (CC BY-NC-SA). Odrzucone jako metryka odbioru: DNSMOS/PESQ/STOI i SingMOS — wszystkie kalibrowane na jakości SYGNAŁU albo na jakości SYNTEZY, nie na jakości wykonania; SingMOS-Pro (7981 klipów z 41 modeli SVS, ≥5 anotatorów) ocen |

### Specyfikacja

> **Status weryfikacji.** Budżet WebSearch był wyczerpany na poziomie sesji (200/200) przed startem — cała weryfikacja zewnętrzna szła przez WebFetch na źródła pierwotne: arXiv API + pełne PDF-y (czytane lokalnie, nie ze streszczeń), GitHub API, Zenodo API, Semantic Scholar API, Google Patents. Liczby oznaczone **[Z]** są zweryfikowane w tej sesji. Liczby oznaczone **[W]** pochodzą z wiedzy własnej (cutoff maj 2026) i wymagają potwierdzenia. Odwołania do obecnego kodu są sprawdzone na repo.

---

# 0. Kształt warstwy

## 0.1. Granica

`core-eval` jest czystą warstwą domenową. Zero Web Audio, zero DOM, zero `Date.now()`, zero I/O. Wejście i wyjście to POD. To jest odpowiedź na "iOS może ruszyć pojutrze": ta sama warstwa kompiluje się do WASM, do static lib dla Swift i dla Kotlina, a testy golden są jednym zestawem plików dla wszystkich trzech celów.

```
EvalInput {
  frames: {                      // wszystko o stałym hopie, wyrównane indeksem
    t0Ms: f64, hopMs: f64,       // hop = 10.0 ms (100 Hz) — kanoniczny dla core-eval
    f0Hz: [f32],                 // 0 = bezdźwięczne
    voicedProb: [f32],           // 0..1, z pYIN/SwiftF0
    rmsDb: [f32],                // dBFS, bez AGC
    spectralFlatness: [f32],
    h1h2Db: [f32],               // opcjonalne, do rejestru
    band2540Db: [f32],           // energia 2.5–4.0 kHz, do rejestru
  },
  reference: Option<Reference>,  // None => tryb free-sing
  mode: ACappella | FixedBacking,
  device: DeviceProfile,         // fingerprint + zmierzona latencja + noise floor
  calibration: CalibrationTable, // wersjonowana, patrz §5.4
}

PerformanceReport {
  notes: [NoteVerdict],          // per nuta, z dowodami
  axes: { pitch, content, timing, stability },  // 0..1, każda z CI
  tuning: { offsetCents, driftCentsPerMin, scatterCents },
  expression: { vibrato, dynamics, attack },
  dimensions: { range, phrase, register },
  findings: [Finding],           // patrz §7
  score: { value: u8, band: String, calibVersion: String },
}
```

Reguła twarda: `PerformanceReport` jest deterministyczny. To samo wejście → ten sam bajt wyjścia, na wszystkich trzech platformach, w granicach tolerancji golden-testów.

## 0.2. Kanoniczna reprezentacja

Wszystko w **centach**, nigdy w hercach:

```
cents(f) = 1200 · log2(f / 440) + 5700     // 5700 = A4 = MIDI 69 · 100
```

Wszystkie uśrednienia, mediany, MAD-y i regresje liczone na `cents`. Uśrednianie w hercach systematycznie krzywdzi głosy niskie (30 centów przy 110 Hz to 1.9 Hz, przy 880 Hz to 15.4 Hz) i przy vibrato przesuwa środek tonu w stronę "sharp".

**To jest konkretny defekt obecnego kodu**: `hooks/use-training-mode.ts` liczy `avgFrequency` jako średnią arytmetyczną w Hz, a potem dopiero konwertuje do centów.

---

# 1. Segmentacja na nuty

## 1.1. Werdykt i liczby

| Metoda | COn F1 czysto | COn F1 szum | COnPOff czysto | COnPOff szum | AOR czysto |
|---|---|---|---|---|---|
| TONY (HMM na konturze F0) | 67.5 | 49.2 | 43.9 | 28.4 | 73.8 |
| VOCANO | 75.8 | 64.7 | 50.2 | 43.4 | 81.4 |
| MusicYOLO | 82.2 | 79.7 | 58.9 | 51.5 | 85.4 |
| Yong et al. 2023 | 92.0 | 88.5 | 65.8 | 62.1 | 91.6 |
| **ROSVOT (pełny)** | **94.0** | **93.8** | **77.4** | **77.0** | **97.0** |
| ROSVOT bez GT granic słów (`w/ E_W`) | 93.3 | 93.5 | 77.1 | 77.0 | 96.5 |
| ROSVOT bez warunku granic słów (`w/o wbd`) | 91.3 | 91.1 | 70.2 | 69.9 | 95.5 |

**[Z]** Tabela 1, ROSVOT, ACL 2024, arXiv 2405.09940. Metryki wg Molina et al. 2014 przez `mir_eval`. Tolerancja onsetu **50 ms**, offsetu **max(50 ms, 20% długości nuty)**, wysokości **50 centów**.

Trzy wnioski, które przesądzają architekturę:

1. **Reguły przegrywają o 26.5 punktu na czystym sygnale i o 44.6 w szumie.** TONY to nie jest słomiany strach — to jest HMM na konturze pitch-time od autorów pYIN, czyli najlepsze, co podejście regułowe ma do zaoferowania. Nasi użytkownicy nagrywają telefonem w pokoju, więc interesuje nas kolumna "szum": 49.2 vs 93.8.
2. **Granice słów nie muszą pochodzić z ASR.** Wariant z własnym ekstraktorem granic (`E_W`) traci 0.7 punktu COn względem GT. To usuwa zależność od Whispera/MFA, czyli od jedynej ciężkiej zależności wdrożeniowej.
3. **Optimum skali = 80 ms.** Ablacja downsamplingu (Tabela 2, ROSVOT) **[Z]**:

| Rate | Krok w Conformerze | COn | COff | COnPOff |
|---|---|---|---|---|
| 2 | 10.7 ms | 92.7 | 92.4 | 70.7 |
| 4 | 21.3 ms | 93.9 | 93.6 | 73.6 |
| 8 | 42.7 ms | **94.4** | 94.1 | 76.8 |
| **16** | **85.3 ms** | 94.0 | **94.5** | **77.4** |
| 32 | 170.7 ms | 94.3 | 94.1 | 77.2 |

Optimum pokrywa się z długością miękkich etykiet (~80 ms). Granica nuty w śpiewie jest zjawiskiem o skali ~80 ms, nie punktem — dlatego jednoprogowa reguła na konturze strukturalnie nie może tego złapać.

## 1.2. `NoteBoundaryNet` — specyfikacja

Architektura ROSVOT (kod **MIT** **[Z]**, GitHub API), **z usuniętym dekoderem wysokości**.

```
Wejście  @ 24 kHz, hop 128 = 5.333 ms (187.5 ramek/s)
  E_M : mel 80 binów
  E_P : log-F0 z NASZEGO ekstraktora (pYIN/SwiftF0), kwantyzowany do 256 kategorii
  E_B : granice słów (opcjonalne; z E_W albo brak)

Backbone
  U-Net: 4 warstwy down + 4 up, downsampling 2 na warstwę => łącznie 16 (krok 85.3 ms)
  channel dim stały (przeciw overfittingowi)
  wąskie gardło: 2-warstwowy Conformer z relative position encoding

Wyjście
  D_B : pojedyncza macierz W_B ∈ R^{C×1} -> logit granicy per ramka
  D_P : USUNIĘTY

Strata
  L = λ_B · BCE + λ_FC · Focal(γ=2)
  (niezbilansowanie pozytywów do negatywów ~1:500)
  miękkie etykiety: konwolucja z filtrem gaussowskim, szerokość okna 80 ms,
                    normalizacja tak, żeby środek etykiety pozostał 1.0

Inferencja
  próg μ = 0.8  (eksponowany jako "granularity")
    μ niższe  -> więcej granic -> melizmaty dzielone na osobne nuty
    μ wyższe  -> mniej granic  -> małe fluktuacje ignorowane
  post-processing: scalanie granic o odstępie < 60 ms
```

**Statystyka odniesienia [Z]:** ~2.42 granice nuty na sekundę w korpusach ROSVOT. Nasz materiał (ćwiczenia, wolne melodie) będzie rzadszy — 0.8–2.0/s. To jest sanity-check dla `μ`.

**Krytyczny wymóg treningowy:** ROSVOT trenował z konturami F0 z RMVPE. Jeżeli w inferencji podamy kontur z pYIN, mamy przesunięcie rozkładu. **Trenujemy z wyjściem naszego własnego ekstraktora F0 na wejściu.** Zmiana ekstraktora F0 = retrening segmentera.

**Eksport:** ONNX, uruchamiany przez ONNX Runtime (WASM SIMD w web, ORT Mobile na iOS/Android). Cel: < 10 MB. Segmentacja jest OFFLINE — biegnie po zakończeniu take'u, nie w AudioWorklecie. To zdejmuje cały problem "ORT w worklecie".

## 1.3. Licencje — werdykt

| Zasób | Licencja | Werdykt |
|---|---|---|
| Kod ROSVOT | **MIT** **[Z]** | ✅ używamy architektury |
| **Wagi ROSVOT** | **brak zadeklarowanej** **[Z]** | ❌ **BLOKADA** |
| M4Singer (dane treningowe ROSVOT) | `spdx: NOASSERTION`, "Other", tekst niedostępny **[Z]** | ❌ **BLOKADA** |
| VocalSet | **CC BY 4.0** **[Z]** | ✅ 10.1 h, 20 śpiewaków (9M/11K), 17 technik |
| Annotated-VocalSet (DOI 10.5281/zenodo.7061507) | **CC BY 4.0** **[Z]** | ⚠️ patrz ostrzeżenie niżej |
| vocadito | **CC BY 4.0** **[Z]** | ✅ 40 fragmentów, 7 języków, **2 niezależnych anotatorów** |
| SingStyle111 | **CC BY 4.0** **[Z]** | ✅ 12.8 h, 8 zawodowców, EN/ZH/IT, alignment fonemowy + F0 |
| MIR-1K, iKala | dostęp ograniczony **[Z]** | ❌ |
| MDB-stem-synth | CC BY-NC-SA | ❌ niekomercyjna |
| OpenScore Lieder (dynamika, arXiv 2410.20540) | CC BY-NC-SA 4.0 **[Z]** | ❌ niekomercyjna |

> **⚠️ Bramka przed użyciem Annotated-VocalSet.** Abstrakt (Faghih & Timoney, *Applied Sciences* 12(18):9257) mówi, że autorzy "porównują cztery różne metody definiowania onsetu/offsetu" **[Z, Semantic Scholar]**. To silnie sugeruje adnotację ALGORYTMICZNĄ, nie ręczną. Jeśli tak — trenowanie na tym uczy nasz model naśladować cudzy algorytm, a nie człowieka. **Przed jakimkolwiek użyciem: przeczytać sekcję metodologiczną pełnego artykułu i zmierzyć zgodność 200 losowych nut z ręczną adnotacją własną.** Bramka: jeżeli COnPOff między ich adnotacją a naszą ręczną < 85, zbiór schodzi do roli pre-labelingu, nie ground truth.

**Ścieżka danych:** SingStyle111 (12.8 h) + Annotated-VocalSet (10 h, po bramce) + własne nagrania z adnotacją półautomatyczną + syntetyk z SVS o znanym ground truth. vocadito **wyłącznie jako zbiór testowy** — 40 fragmentów to za mało do treningu, ale dwóch niezależnych anotatorów daje **sufit ludzki**, którego nie da się kupić inaczej.

## 1.4. Fallback regułowy (offline / cold start / brak modelu)

Ma istnieć, bo model ładuje się asynchronicznie i bo służy do pre-labelingu.

```
kontur:      cents @ 100 Hz (hop 10 ms), filtr medianowy 5-punktowy (50 ms)
voicing:     voicedProb > 0.6 aby otworzyć, < 0.4 aby zamknąć (histereza)
             AND rmsDb > noiseFloorDb + 12
             minimalny ciąg dźwięczny 60 ms
granica:     |cents(t) − medianaKrocząca(150 ms)| > 100 centów  -> otwarcie
             powrót poniżej 60 centów                            -> zamknięcie
             przytrzymanie 60 ms przed zatwierdzeniem
min nuta:    100 ms; krótsze scalane z sąsiadem o bliższej wysokości
TRANSITION:  |nachylenie| > 700 centów/s  -> etykieta przejścia, WYKLUCZONA z oceny
```

## 1.5. Portamento, legato, atak — pominięcie stanu nieustalonego

Nigdy nie oceniamy ataku i wybiegu. Kryterium stabilizacji jest **adaptacyjne**, nie stałe:

```
skip_head = pierwsza ramka, dla której w oknie 50 ms JEDNOCZEŚNIE:
              |nachylenie wygładzonego konturu| < 400 centów/s
              AND (max − min w oknie) < 35 centów
            clamp do [40 ms, min(150 ms, 0.30 · długość nuty)]
skip_tail = max(30 ms, 0.10 · długość nuty)
```

Nuta krótsza niż **100 ms nie jest oceniana wcale** (po pominięciu ataku nie zostaje stan ustalony).

Portamento **między** nutami dostaje własną etykietę `TRANSITION` i jest wykluczone ze scoringu wysokości — ale jego czas trwania i gładkość wchodzą do wymiaru ekspresji.

**Scoop na ataku** (dojście do wysokości od dołu) jest normalną techniką, nie błędem. Mierzymy go jako `attackApproachCents` (znak i wielkość maksymalnego odchylenia w fazie ataku) i `attackSettleMs` — i pokazujemy tylko wtedy, gdy jest patologiczny (patrz §7).

## 1.6. Oddech

Detekcja oddechu jest potrzebna do dwóch rzeczy: segmentacji fraz i sygnału pedagogicznego. Koniunkcja:

```
rmsDb ∈ [−45, −25]                     (odniesione do noise floor urządzenia)
spectralFlatness > 0.30
voicedProb < 0.3                        (brak periodyczności — najsilniejszy sygnał)
czas trwania ∈ [150, 500] ms
sąsiedztwo mowy/śpiewu w oknie 1 s
```

Wynik: `breathPositions[]`. Z tego liczymy `phraseLengths[]` i `breathsPerMinute`. **Nie modyfikujemy audio** — to warstwa oceny, nie obróbki.

---

# 2. Vibrato

## 2.1. Zasada

Vibrato jest **mierzone i premiowane**. Jego składowa jest **odejmowana** przed liczeniem stabilności, więc konstrukcyjnie nie może obniżyć oceny.

Wartości odniesienia (Prame 1994/1997, zawodowcy) **[W]**: rate **5.0–6.5 Hz** (średnia ~6.0), extent **±34 do ±123 centów** (średnia **±71**).

Obecny próg "off" w kodzie to **25 centów** (`lib/pitch-detector.ts:280`). Zdrowe vibrato zawodowca ma zasięg ~3× większy — czyli aplikacja obecnie wystawia **lepsze** oceny głosom niewytrenowanym niż wytrenowanym. To odwrócenie celu produktu.

## 2.2. Detekcja

Wymagany stan ustalony **≥ 500 ms** (3 okresy przy 6 Hz; idealnie 600–1000 ms = 4–6 okresów).

```
1. r(t) = cents(t) − medianaKrocząca(cents, 250 ms)      // detrend, usuwa dryf i portamento
2. okno Hanna na r(t), zero-padding do 1024 punktów
3. FFT; szukaj szczytu w paśmie 4.0–9.0 Hz
4. vibrato obecne  <=>  moc szczytu ≥ 4× (6 dB) średnia moc w 1–15 Hz
                        AND amplituda szczytu ≥ 15 centów
```

## 2.3. Parametryzacja (analiza cyklowa, nie FFT)

FFT służy tylko do **detekcji** i do wstępnego rate. Parametry liczymy cyklowo, bo tylko tak dostajemy regularność:

```
r_bp(t) = pasmowoprzepustowy 3–9 Hz na r(t)          (Butterworth 4. rzędu, zero-phase)
znajdź przejścia przez zero z narastaniem -> okresy T_1..T_n
znajdź ekstrema lokalne                   -> amplitudy A_1..A_n

rate      = 1 / mean(T_i)                                          [Hz]
extent    = median(A_i)                                            [± centy]
            gdzie A_i = 1200·log2(f_max,i / f_min,i) / 2
regularity = 1 − CV(T_i),  CV = std(T_i)/mean(T_i),  clamp [0,1]
onsetDelay = czas od początku stanu ustalonego do 1. pełnego cyklu [ms]
```

> **Konwencja `extent` jest deklarowana jawnie: `±` czyli POŁOWA rozstępu peak-to-peak, w centach, liczona logarytmicznie.** Obecny kod (`lib/pitch-detector.ts:273–275`) liczy `(max − min)/mean · 1200` — to jest jednocześnie liniowe przybliżenie centów **i** rozstęp peak-to-peak, więc **zawyża extent około dwukrotnie**. Obecny `rate` liczony przez zliczanie przejść przez zero konturu **bez filtracji pasmowej** (`lib/pitch-detector.ts:262–271`) łapie portamento i szum jako pozorne cykle.

## 2.4. Środek tonu

```
środek tonu = średnia krocząca po DOKŁADNIE jednym okresie vibrata (1/rate),
              w domenie centów,
              po oknie stanu ustalonego
```

Bez vibrata: mediana centów po stanie ustalonym. Percepcyjny środek tonu z vibratem jest średnią czasową w domenie logarytmicznej (Shonle & Horan 1980, Sundberg) **[W]** — stąd jeden pełny okres i stąd centy.

## 2.5. Punktacja (BONUS, nigdy kara)

```
V_rate    = exp(−(rate − 5.75)² / (2 · 1.1²))            szczyt 5.75 Hz
V_extent  = exp(−(extent − 70)² / (2 · 35²))             szczyt ±70 centów
V_reg     = regularity
V_cover   = udział nut ≥600 ms, które mają vibrato       // umiejętność stosowania

VIBRATO = 0.30·V_rate + 0.25·V_extent + 0.30·V_reg + 0.15·V_cover   ∈ [0,1]
```

Wchodzi wyłącznie do `expression` (bonus, §5.2). Brak vibrata daje `VIBRATO = 0` i **nie odejmuje ani jednego punktu**.

---

# 3. Referencja adaptacyjna

## 3.1. Rozkład błędu — rdzeń rozdziału "czysto ale niżej" / "chaotycznie"

Dla każdej dopasowanej nuty *i*:

```
dev_i = środek_tonu_i − cents(nuta_referencyjna_i)      [centy]
dev_i = O(t_i) + r_i
```

- **O(t)** — wolno zmienny offset tonacji: transpozycja + dryf. **Nie jest fałszem.**
- **r_i** — residuum. **To jest fałsz.**

Dwie liczby do UI, nigdy zsumowane:

```
INTONACJA (residuum) = scatter = 1.4826 · MAD(r_i)        [centy]  -> karane
STROJENIE (offset)   = O                                  [centy]  -> raportowane
DRYF                 = nachylenie regresji dev(t)         [centy/min]
```

| scatter | \|O\| | Interpretacja | Komunikat |
|---|---|---|---|
| < 25 | < 30 | czysto i w stroju | "czysto" |
| < 25 | > 30 | **czysto, ale niżej/wyżej** | "intonacja świetna, cała fraza 40 centów pod spodem" |
| > 60 | dowolne | **chaotycznie** | "wysokość rozjeżdża się z nuty na nutę" |
| < 25 | rośnie | dryf | "zaczynasz w stroju i opadasz 60 centów przez zwrotkę" |

## 3.2. Empiryczne potwierdzenie

MusicJudge estymuje globalny klucz **z samego wykonania**, a nie z podkładu referencyjnego, i uzasadnia to dosłownie: *"to avoid penalizing intentional transposition while still enforcing intra-performance tonal consistency"* **[Z]**. Ich składowa wysokości ma postać:

```
δ_p = λ1 · (średnia odległość in-key) + λ2 · (stabilność: wariancja w regionach podtrzymanych) + λ3 · (1 − voiced_rate)
P_k = 1 − ρ_p(δ_p),   Σλ = 1
```

— czyli dokładnie rozdział "gdzie jesteś" od "jak stabilnie". System osiąga **Spearman ρ = 0.683, Kendall τ = 0.499** przeciw średniej z ≥3 ekspertów. Metryki oparte na samym detektorze F0 w tej samej tabeli: **pYIN ρ = 0.485, CREPE 0.442, SWIPE 0.421** **[Z]**.

Wniosek liczbowy: sam pomiar odległości od siatki ma sufit ρ≈0.49. Rozdzielenie składowych to główny mechanizm, który podnosi wynik.

## 3.3. Estymacja O(t) — celowo powolna

```
okno:            6 nut kroczące (min 3, i nie krócej niż 2.5 s głosu)
statystyka:      MEDIANA (nigdy średnia)
wygładzanie:     EMA, τ = 3.0 s
limit narastania: 8 centów/s
clamp:           |O| ≤ 60 centów po odjęciu transpozycji całopółtonowej
ZAMROŻENIE:      jeśli MAD(dev) w oknie > 40 centów -> O(t) zamrożone
```

Do estymacji wchodzą **tylko** nuty: ≥ 200 ms stanu ustalonego, `voicedProb` > 0.7, bez wykrytego skoku oktawowego.

> **Zamrożenie na wysokiej dyspersji jest najważniejszym zabezpieczeniem w całym module.** Bez niego referencja goni śpiewaka, cały fałsz zostaje wchłonięty w offset, residuum spada do zera i aplikacja mówi każdemu, że śpiewa czysto. To jest "auto-tune referencji" i to jest najczęstszy błąd tej klasy systemów.

## 3.4. Transpozycja i oktawa

```
histogram (dev_i mod 1200), bin 10 centów, wygładzony jądrem gaussowskim σ = 20 centów
T = moda cyrkularna
transpozycja w półtonach k = round(T / 100)
O_0 = T − 100·k
```

Praca domyślnie w **przestrzeni chroma (mod 1200)**. Błąd oktawowy jest raportowany jako **osobne zdarzenie rejestrowe**, nie jako 1200 centów błędu intonacji. Powód: pomyłka oktawowa to albo błąd detektora, albo świadomy wybór rejestru — w obu przypadkach 1200 centów w metryce intonacji niszczy statystykę i produkuje "zawsze 0%".

## 3.5. Martwa strefa zależna od trybu

Odchylenia 5-limit JI od ET (centy) **[W]**:

| Stopień | JI adj | `d0` a cappella | `d0` z podkładem |
|---|---|---|---|
| pryma / oktawa | 0 | 12 | 12 |
| sekunda mała | +12 | 24 | 14 |
| sekunda wielka | +4 | 16 | 14 |
| tercja mała | +16 | 28 | 14 |
| tercja wielka | **−14** | **26** | 14 |
| kwarta | −2 | 14 | 14 |
| kwinta | +2 | 14 | 14 |
| seksta mała | +14 | 26 | 14 |
| seksta wielka | **−16** | **28** | 14 |
| septyma mała | +4 | 16 | 14 |
| septyma wielka | −12 | 24 | 14 |

```
d0(stopień) = 12 + |JI_adj(stopień)|     w trybie ACappella
d0          = 14                          w trybie FixedBacking (stały strój -> dudnienie słyszalne)
```

Uzasadnienie progu bazowego: eksperci oceniają interwały odchylone o **20–25 centów** jako "w stroju" (Vurma & Ross 2006) **[W]**; nietrenowani słuchacze wykrywają rozstrojenie dopiero ~**65 centów**, wysoko trenowani ~**43 centy** **[W]**. Karanie za 10 centów to karanie za szum estymatora.

Dodatkowe rozszerzenie tolerancji:

```
f_dur = clamp(1 + (200 − min(dur_ms, 200)) / 200, 1.0, 2.0)     // nuta 100 ms -> 1.5×
f_reg = 1 + max(0, 130 − f0Hz) / 130 · 0.8                       // poniżej C3 -> do 1.8×
tol_i = d0(stopień_i) · f_dur · f_reg
```

---

# 4. Wyrównanie czasowe

## 4.1. Trzy reżimy — nie jeden problem

| Reżim | Kto rządzi czasem | Rozwiązanie |
|---|---|---|
| **TRAIN** (ćwiczenie, znane nuty, dron/metronom) | my | okno tolerancji ±150 ms + kalibracja latencji. DTW zbędne. |
| **SING** (karaoke, podkład gra) | podkład | czas jest DANY. Potrzebna tylko kompensacja latencji + detekcja pominięć. |
| **FREE** (a cappella, rubato) | śpiewak | pełne online DTW + wyrównanie na poziomie nut |

Mieszanie tych trzech w jeden aligner to źródło większości błędów tej klasy. W dwóch z trzech reżimów oś czasu jest znana.

## 4.2. Stan literatury

Przegląd 25 najnowszych prac arXiv po `score following` / `online dynamic time warping` / `audio-to-score alignment` **[Z]**: Matchmaker (2510.10087), Precise and Simple A2S (2605.20014), Just Label the Repeats (2411.07428, poprawa 33%→82% dzięki obsłudze repetycji), neuronowy score follower (2503.06348), Score Following using Statistical Inference (2502.10426, GP + duration-HMM).

**Wszystkie są fortepianowe. Ani jedna nie dotyczy głosu.** Nie ma czego zaadaptować wprost — projektujemy sami i zakładamy, że aligner będzie się mylił.

## 4.3. Dwa alignery, twardo rozdzielone

### (A) Kursor live — tylko UI

```
algorytm:     OLTW (Dixon/MATCH), ścieżka do przodu, monotoniczna
cechy:        kontur INTERWAŁOWY (Δcenty między kolejnymi ramkami) + flaga voicing
szerokość c:  100 ramek = ±1.0 s przy hopie 10 ms
nachylenie:   lokalne tempo ograniczone do [0.5, 2.0]
koszt:        |Δcenty_sung − Δcenty_ref| przycięty do 200, + kara 50 za niezgodność voicingu
```

Koszt na **interwałach** jest niezmienniczy na transpozycję z konstrukcji. Bez tego trzeba iterować DTW ↔ estymacja offsetu, bo śpiewak transponowany o 200 centów wygląda dla DTW absolutnego jak śpiewak śpiewający zupełnie inną melodię.

### (B) Aligner scoringowy — offline, po take'u

Needleman–Wunsch na sekwencji **NUT**, nie ramek:

```
substitution(i,j) = w_p · min(|Δcent_ij| , 600)/600 + w_t · min(|Δt_ij|, 1000)/1000
                    w_p = 0.65, w_t = 0.35
deletion  (nuta referencyjna pominięta) = 0.55
insertion (nuta dodana przez śpiewaka)  = 0.45
```

Asymetria kar jest celowa: pominięcie nuty jest muzycznie poważniejsze niż dośpiewanie ozdobnika.

Wyjście: `matched[]`, `deleted[]`, `inserted[]` → wprost zasila wymiar `content` (§5.1).

> **Reguła twarda: kursor live NIGDY nie zasila scoringu.** Zgubienie ścieżki przez aligner live zamieniłoby się w "błąd śpiewaka", którego użytkownik nie ma jak zweryfikować. To niszczy zaufanie mocniej niż brak funkcji.

## 4.4. Bramka pewności alignera

```
jeżeli udział dopasowanych nut < 0.55  LUB  mediana kosztu dopasowania > 0.45:
    -> NIE POKAZUJ WYNIKU
    -> komunikat: "Nie udało mi się dopasować tego wykonania do ćwiczenia.
                   Wykonanie jest zapisane — spróbuj jeszcze raz."
```

Lepiej odmówić oceny niż wystawić losową. To jest różnica między narzędziem a zabawką.

## 4.5. Kalibracja latencji — warunek konieczny

Bez tego metryka rytmu nie znaczy nic.

```
procedura: odtwórz klik -> nagraj mikrofonem -> korelacja krzyżowa -> offset per urządzenie
czas:      ~3 s, raz na urządzenie+trasę audio, z możliwością ponowienia
zapis:     DeviceProfile (fingerprint urządzenia + trasa wyjścia)
```

Realne rzędy **[W]**: desktop AudioWorklet 20–60 ms, iOS Safari 40–150 ms, słuchawki Bluetooth **+100–300 ms**. Zmiana trasy wyjścia (podpięcie słuchawek) musi unieważniać kalibrację.

---

# 5. SCORING

## 5.1. Cztery osie

### P — intonacja
```
s(r_i)  = exp(−max(0, |r_i| − tol_i)² / (2 · 30²))
P       = Σ_i (w_i · s(r_i)) / Σ_i w_i,     w_i = czas_trwania_i / Σ czas_trwania
```
Ważenie **czasem trwania**, nie liczbą ramek — inaczej hop size zmienia metrykę. Wzorzec `w_k = |B_k| / Σ|B_j|` wzięty wprost z MusicJudge **[Z]**.

### C — kompletność / wierność treści
```
coverage = |matched| / |reference|
insert_p = 0.5 · |inserted| / |reference|
interval = udział kolejnych par dopasowanych, których zaśpiewany interwał
           mieści się w ±(tol_i + tol_{i+1}) od interwału referencyjnego

C = clamp(0.55 · coverage + 0.45 · interval − insert_p, 0, 1)
```

> **`interval` to najważniejsza pojedyncza metryka w całym module.** Człowiek słyszy relatywnie. Wykonanie transponowane o 30 centów brzmi dobrze; wykonanie z losowym rozrzutem ±40 centów wokół zera brzmi źle. Tylko interwały to rozróżniają — bezwzględne odchylenie od MIDI nie.

### T — rytm
Konstrukcja z MusicJudge **[Z]**:
```
δ_r(o_i) = |o_i − najbliższy_beat| / τ    (τ = lokalny odstęp międzytaktowy)
δ_r      = η1·mean|δ_r| + η2·std(δ_r) + η3·|mean δ_r|
           η1 = 0.5, η2 = 0.3, η3 = 0.2
T        = 1 − clamp(δ_r / 0.35, 0, 1)
```
Trzecia składowa (**bias ze znakiem**) rozróżnia "śpiewasz nierówno" od "śpiewasz konsekwentnie za wcześnie" — to są różne błędy i różne ćwiczenia.

### S — stabilność
```
dla nut ≥ 400 ms, po odjęciu składowej vibrata r_bp(t):
  sd_i   = std(cents_stan_ustalony − r_bp)          [centy]
  drift_i= |nachylenie regresji|                     [centy/s]
S = mean_i exp(−(sd_i / 22)²) · exp(−(drift_i / 45)²)
```
Odjęcie vibrata **przed** liczeniem SD jest tym, co czyni vibrato niekaralnym z konstrukcji, a nie z uprzejmości.

## 5.2. Złożenie

```
P, C, T, S  <- clamp(x, 0.15, 1.0)          // podłoga: jedna katastrofa nie zeruje całości

raw = P^wP · C^wC · T^wT · S^wS

               wP    wC    wT    wS
ACappella     0.40  0.30  0.15  0.15
FixedBacking  0.30  0.35  0.25  0.10

E = 0.45·VIBRATO + 0.30·ATTACK + 0.25·DYNAMICS      ∈ [0,1]
raw' = raw · (1 + 0.12 · E)                          // bonus maks. +12%

Score = 100 · Calib_c(raw')
```

Średnia **geometryczna**, nie arytmetyczna: nie wolno nadrobić katastrofy w jednym wymiarze doskonałością w innym. Podłoga 0.15 zapobiega zeru absorbującemu.

**Dlaczego C ma 0.30–0.35, a nie rolę pomocniczą.** Ablacja MusicJudge (Tabela 2a) **[Z]**:

| Konfiguracja | ρ z ekspertami | MSE |
|---|---|---|
| tylko muzyka (wysokość + rytm) | 0.495 | 0.00920 |
| tylko treść (co zaśpiewano, gdzie) | **0.626** | 0.00885 |
| **obie** | **0.683** | **0.00564** |

Wagi ich systemu: γ_C = 0.55 / γ_M = 0.45, "dobrane empirycznie na podstawie korelacji ze zbiorem walidacyjnym ocen eksperckich". To jest kontrintuicyjne i decydujące: **"czy w ogóle zaśpiewałeś to, co trzeba, tam gdzie trzeba" koreluje z oceną nauczyciela LEPIEJ niż celność wysokości.**

## 5.3. Jak konstrukcyjnie uniknąć "zawsze 90%" i "zawsze 40%"

To są dwie różne choroby i wymagają dwóch różnych leków. Oba są konieczne.

**"Zawsze 40%" — przyczyna: karanie rzeczy poprawnych.** Lek to fizyka modelu:

| Przyczyna | Lek | Gdzie |
|---|---|---|
| vibrato ±71 centów liczone jako fałsz | odjęcie składowej vibrata przed S; próg 25→`tol_i` | §2.5, §3.5 |
| portamento/scoop na ataku w średniej nuty | pominięcie stanu nieustalonego | §1.5 |
| transpozycja/dryf liczone jako fałsz | rozkład na O(t) + r_i | §3.1 |
| błędy oktawowe jako 1200 centów | praca w chroma, oktawa jako osobne zdarzenie | §3.4 |
| próg 10/25 centów | próg percepcyjny 20–25 + `f_dur`, `f_reg` | §3.5 |

**"Zawsze 90%" — przyczyna: metryka saturuje.** Lek to kalibracja percentylowa. "Procent ramek w tolerancji" saturuje z definicji: tolerancja jest hojna, więc większość ramek trafia i wszyscy dostają 85–95. Metryki oparte na **rozrzucie** (`scatter`, `sd`, `CV`) mają szeroki naturalny rozkład i nie saturują — dlatego są bazą.

## 5.4. Kalibracja rozkładu — gwarancja z konstrukcji

```
1. Zbierz populację referencyjną: N ≥ 500 wykonań na klasę trudności c,
   zbalansowaną po typie głosu, urządzeniu i poziomie zaawansowania.
2. Policz raw' dla wszystkich.
3. Dopasuj monotoniczną mapę odcinkowo-liniową Calib_c na kwantylach:

   percentyl populacji ->  wynik
        p10            ->   30
        p25            ->   45
        p50            ->   62
        p75            ->   78
        p90            ->   88
        p99            ->   96

4. Zamroź i zwersjonuj (calibVersion w PerformanceReport).
5. Przelicz kwartalnie; zmiana wersji NIGDY nie zmienia wyników historycznych
   (wynik zapisany raz jest niezmienny — inaczej wykres postępów kłamie).
```

Rozkład wyniku jest **własnością konstrukcji, a nie skutkiem ubocznym**. Mediana 62 jest wybrana świadomie: zostawia widoczną przestrzeń wzrostu, a jednocześnie nie jest karząca. Górna asymptota 96, nie 100 — 100 nie istnieje, bo zawsze jest co poprawić, i to jest komunikat pedagogiczny.

**Zawsze pokazuj rozbicie na cztery osie obok liczby.** Sama liczba jest nieinformacyjna niezależnie od tego, jak dobrze skalibrowana.

## 5.5. Sanity-testy scoringu (bramki CI)

| Test | Oczekiwanie |
|---|---|
| syntetyk, wstrzyknięte odchylenie 0→100 centów krokiem 10 | Score **ściśle monotonicznie malejący** |
| ten sam kontur transponowany o +250 centów | ΔScore ≤ **3 punkty** (a cappella) |
| ten sam kontur + vibrato 6 Hz / ±70 centów | ΔScore ≥ **0** (nigdy ujemna) |
| ten sam kontur, tempo ×1.15 równomiernie | ΔScore ≤ **2 punkty** |
| ten sam kontur z jedną pominiętą nutą z 12 | ΔScore ∈ [4, 10] |
| populacja referencyjna | mediana 62 ± 3, IQR 45–78 ± 5 |
| rozkład wg typu głosu | brak różnicy median > 4 punktów |
| rozkład wg klasy urządzenia | brak różnicy median > 4 punktów |

Ostatnie dwa są **testami sprawiedliwości**. Praca o uprzedzeniu płciowym w transkrypcji śpiewu (arXiv 2308.02898) **[Z]** wykazała systematyczną przewagę głosów żeńskich wynikającą z różnic w rozkładzie wysokości, redukowalną o >50% przez trening adwersarialny. Nasz odpowiednik to `f_reg` (rozszerzenie tolerancji poniżej C3) plus twardy test regresyjny.

---

# 6. Wymiary poza wysokością — triaż

## 6.1. ✅ Wchodzą

| Wymiar | Metoda | Dlaczego wiarygodne na mikrofonie telefonu | Wartość dydaktyczna |
|---|---|---|---|
| **Zakres** (VRP) | ton zaliczony gdy ≥400 ms, `voicedProb`>0.8, SD<50 centów. Ekstrema jako **percentyl 5/95** z sesji, nie wartości absolutne | wyłącznie z F0, niezmiennicze na wzmocnienie i pasmo | bardzo wysoka; widoczny postęp miesiąc do miesiąca |
| **Stabilność tonu** | SD centów po odjęciu vibrata + nachylenie dryfu | tylko F0 | wysoka; bezpośrednio ćwiczalna |
| **Celność ataku** | czas do wejścia w ±25 centów; znak i wielkość przestrzelenia | tylko F0 | bardzo wysoka; scoop od dołu to najczęstszy nawyk |
| **Długość frazy / MPT** | ciągły czas dźwięczny między oddechami | licznik czasu | wysoka; mierzalny postęp |
| **Vibrato** | §2 | tylko F0 | wysoka |
| **Dynamika WZGLĘDNA** | kontrast RMS **w obrębie jednego take'u**: messa di voce, crescendo | różnica w obrębie take'u znosi wzmocnienie i odległość | średnio-wysoka |
| **Oddechy** | §1.6 | RMS + flatness + brak periodyczności | wysoka; pozycja oddechu to realna decyzja muzyczna |

## 6.2. ⚠️ Wchodzi z ograniczeniem

**Rejestr** (pierś / głowa / falset) — **klasyfikator opisowy, nigdy punktowany.**

```
cechy:   H1−H2 [dB], nachylenie widma 0–5 kHz, poziom pasma 2.5–4.0 kHz
         względem całkowitej energii, F0 względem oszacowanego passaggio użytkownika
model:   3 klasy + jawna klasa ODMOWY ("nie wiem")
bramka:  odmowa gdy max softmax < 0.65 albo gdy nie pasuje DeviceProfile
trening: VocalSet (CC BY 4.0, 17 technik, 20 śpiewaków)
prezentacja: opisowa ("ta fraza brzmi jak rejestr piersiowy"), NIGDY punkty
```

Podstawa: arXiv 2505.11378 (AVRA — SVM i CNN na cechach teksturalnych mel-spektrogramu dla chest/head/passaggio) **[Z]**. Zastrzeżenie: abstrakt **nie podaje żadnej liczby dokładności** **[Z]**, a H1−H2 i nachylenie widma są silnie zanieczyszczone charakterystyką mikrofonu i pokoju. Stąd bramka odmowy i zakaz punktowania.

**Barwa** — wyłącznie jako **zmiana wewnątrz jednego użytkownika**, przy zgodnym `DeviceProfile`. Nigdy jako miara absolutna, nigdy jako porównanie między użytkownikami.

## 6.3. ❌ Odrzucone bezwzględnie

| Odrzucone | Powód |
|---|---|
| **Jitter, shimmer** | Protokół kliniczny dla stacjonarnej fonacji /a/ przy kontrolowanej odległości w kabinie. Na śpiewie podwójnie nieważne: **vibrato JEST okresową modulacją F0, więc mechanicznie zawyża jitter** — trenowany śpiewak wyszedłby jako "patologiczny". Metryka kliniczna wyrwana z kontekstu. |
| **Dynamika absolutna (dB SPL)** | Niemierzalna bez kalibracji akustycznej. AGC telefonu pełznie po głośności, odległość ust zmienia poziom o 10–15 dB. Liczba byłaby fikcją. |
| **Barwa jako miara absolutna** | Pseudonauka na mikrofonie telefonu. Odpowiedź częstotliwościowa taniego mikrofonu ma rozrzut ±10 dB. |
| **"Podparcie oddechowe" jako WIELKOŚĆ MIERZONA** | Nie istnieje sygnał akustyczny, z którego da się to odczytać wprost. Może być **wyłącznie wnioskiem** z koniunkcji innych obserwacji — patrz §7.2. Prezentowanie tego jako pomiaru to okłamywanie użytkownika. |
| **Formant śpiewaczy jako ocena** | Mierzalny w zasadzie, ale zdominowany przez mikrofon i pokój. Dopuszczalny tylko jako trend wewnątrz użytkownika. |
| **Cokolwiek o zdrowiu głosu** | Poza kompetencją i poza prawem. Zero twierdzeń typu "wykryto napięcie/zmęczenie strun". |
| **CPPS jako liczba dla użytkownika** | Dopuszczalny wyłącznie jako wewnętrzny trend w kontrolowanym ćwiczeniu "trzymaj prosty ton bez vibrata"; nigdy jako wynik. |

---

# 7. Feedback pedagogiczny

## 7.1. Architektura — trzy stopnie, twarda granica

```
POMIAR  ->  SILNIK REGUŁ  ->  PRIORYTETYZACJA  ->  JĘZYK
            (produkuje       (wybiera JEDEN      (LLM albo szablon
             findings)        finding)            formułuje zdanie)
```

**Reguła nadrzędna: silnik reguł produkuje TWIERDZENIE, LLM produkuje wyłącznie SŁOWA.** LLM nigdy nie widzi surowego audio ani surowych liczb bez findingu i nie ma prawa postawić diagnozy, której nie ma w `findings[]`.

Ten wzorzec jest zwalidowany: MusicJudge generuje feedback naturalnojęzykowy przez LLM (gpt-oss-120b), ale karmi go **wyłącznie** ustrukturyzowanymi sekwencjami ocen blokowych, transkrypcją i referencją — i osiąga **63.97 podobieństwa kosinusowego (all-MiniLM-L6-v2) z komentarzami ekspertów** **[Z]**. Ich uzasadnienie architektoniczne jest też nasze: *"sekwencje ocen blokowych zachowują lokalne zróżnicowanie wykonania (np. słabszy refren, mocniejsza zwrotka), co pozwala produkować feedback świadomy sekcji zamiast opierać się na globalnym agregacie"* **[Z]**.

## 7.2. Struktura findingu

```
Finding {
  id, severity,
  claim,              // twierdzenie — z reguły, nie z LLM
  evidence: [NoteRef],// KONKRETNE nuty; użytkownik musi móc kliknąć i posłuchać
  n, effectSize, confidence,
  suggestedExercise,
}
```

Każda reguła ma **trzy bramki**: minimalne `n`, minimalny rozmiar efektu, minimalną istotność. Poniżej którejkolwiek — finding nie powstaje.

## 7.3. Tablica reguł wnioskowania

| # | Warunek liczbowy | Twierdzenie | Zdanie do użytkownika | Ćwiczenie |
|---|---|---|---|---|
| R1 | regresja `dev` po wysokości: nachylenie < −8 centów/oktawę, R² > 0.30, n ≥ 12 | zaniżanie na górze zakresu | "Konsekwentnie zaniżasz na wysokich nutach — im wyżej, tym bardziej." | syrena na /u/, cichy start |
| **R2** | **R1 AND** mediana `attackApproachCents` < −20 na górnych nutach **AND** długość frazy na górnych −25% względem dolnych | **niewystarczające podparcie oddechowe** | "Na wysokich nutach podchodzisz od dołu i kończysz frazę wcześniej — to nie słuch, to podparcie oddechowe. Weź oddech niżej i utrzymaj żebra otwarte." | messa di voce na D4, oddech 4-4-8 |
| R3 | `scatter` < 25 **AND** \|O\| > 30 | czysto, ale transponowane | "Intonacja jest świetna — cała fraza leży 40 centów pod spodem. To jedno przesunięcie, nie fałsz." | dron referencyjny przed startem |
| R4 | `drift` > 40 centów/min, monotoniczny | dryf tonacji | "Zaczynasz w stroju i opadasz przez zwrotkę. Klasyczny objaw kończącego się powietrza." | fraza z dronem, oddech co 8 taktów |
| R5 | \|`dev`\| > tol na tercjach i sekstach, ale nie na kwintach/oktawach, n ≥ 6 | słabe interwały tercjowe | "Kwinty i oktawy masz pewne, tercje uciekają. To najtrudniejszy interwał do trafienia." | tercje z drona |
| R6 | mediana `attackSettleMs` > 180, n ≥ 8 | wolne wchodzenie w nutę | "Wchodzisz w nutę przez 200 ms. Celuj od razu, nie szukaj." | staccato na jednej wysokości |
| R7 | `sd_i` rośnie z długością nuty, nachylenie > 8 centów/s | brak kontroli podtrzymania | "Nuta jest czysta na starcie i rozjeżdża się po sekundzie." | długie tony z dronem, 8 s |
| R8 | `VIBRATO` > 0.7 **AND** `V_cover` > 0.5 | vibrato opanowane | "Twoje vibrato ma 5.8 Hz i ±68 centów — to zakres zawodowy. Trzymaj tak." | — (pochwała, bez zadania) |
| R9 | `rate` > 7.5 Hz **AND** `regularity` < 0.6 | drżenie, nie vibrato | "To co słyszę na długich nutach jest szybsze i mniej regularne niż vibrato — to napięcie, nie technika." | rozluźnienie szczęki, /v/ |
| R10 | zdarzenia oktawowe > 15% nut, spójne w rejestrze | wybór rejestru, nie błąd | "Górne nuty bierzesz oktawę niżej. To wybór rejestru — jeśli świadomy, transponuj ćwiczenie." | transpozycja ćwiczenia |
| R11 | `scatter` > 60 **AND** `coverage` > 0.85 | trafia nuty, nie trzyma | "Trafiasz we właściwe miejsca, ale wysokość skacze w obrębie nuty." | pojedyncze długie tony |
| R12 | `T` < 0.5 **AND** `mean δ_r` < −0.15 (bias ujemny) | konsekwentne przyspieszanie | "Nie śpiewasz nierówno — śpiewasz konsekwentnie za wcześnie, średnio o 90 ms." | ćwiczenie z klikiem, akcent na 2 i 4 |

R2 jest wzorcowa i pokazuje, dlaczego "podparcie oddechowe" **wolno** wymienić: nie dlatego, że je zmierzyliśmy, tylko dlatego, że **trzy niezależne obserwacje** (zaniżanie rosnące z wysokością + podchodzenie od dołu + skrócenie frazy) mają jedną wspólną przyczynę i żadna z nich osobno by jej nie uzasadniała.

## 7.4. Priorytetyzacja i dawkowanie

```
priorytet = severity · confidence · trenowalność · (1 − niedawnoPokazany)
POKAZUJEMY JEDEN FINDING NA SESJĘ.
```

Podstawa: **guidance hypothesis** (Salmoni, Schmidt & Walter 1984; Schmidt & Wulf) **[W]** — ciągły, nadmiarowy feedback poprawia wykonanie **w trakcie**, ale **pogarsza uczenie się** i tworzy zależność od feedbacku. To jest najważniejsza pozycja literaturowa dla całego UX oceny i argument, żeby świadomie pokazywać MNIEJ, niż się da.

Reszta findings jest dostępna pod "szczegóły", ale nigdy nie jest wypychana.

## 7.5. Zakazy

- Żadnej diagnozy przy `n` poniżej progu reguły.
- Nigdy dwie konkurencyjne przyczyny naraz ("to może być oddech albo słuch").
- Nigdy twierdzenia o zdrowiu, budowie anatomicznej ani "talencie".
- Każdy finding musi mieć klikalne dowody — użytkownik ma móc odsłuchać te konkretne nuty. Twierdzenie bez możliwości weryfikacji jest wróżeniem.
- LLM z `temperature ≤ 0.3` i twardym schematem wyjścia; halucynacja diagnozy to bug klasy critical.

---

# 8. Walidacja

## 8.1. Poziom 1 — syntetyk (bramka CI, każdy commit)

Generator w rdzeniu: fala piłokształtna przez filtr formantowy, skryptowany kontur F0 z **wstrzykniętym znanym odchyleniem**. Kontrolujemy: odchylenie [centy], vibrato (rate, extent, regularity), portamento, dryf, pominięcia nut, SNR, symulowaną charakterystykę mikrofonu.

Asercje: tablica z §5.5 plus — odtworzone F0 w granicach **3–5 centów** od zadanego; zmierzony `extent` vibrata w granicach **10%** od zadanego; zmierzony `rate` w granicach **0.2 Hz**.

## 8.2. Poziom 2 — korpusy z adnotacją (nocne)

| Korpus | Licencja | Rola |
|---|---|---|
| **vocadito** | CC BY 4.0 **[Z]** | zbiór testowy segmentacji + **pomiar sufitu ludzkiego** (2 niezależnych anotatorów) |
| **SingStyle111** | CC BY 4.0 **[Z]** | trening + walidacja, 12.8 h, EN/ZH/IT |
| **Annotated-VocalSet** | CC BY 4.0 **[Z]** | trening **po bramce proweniencji** (§1.3) |
| **VocalSet** | CC BY 4.0 **[Z]** | trening klasyfikatora rejestru i technik |

Metryki: `COn`, `COff`, `COnP`, `COnPOff`, `AOR` przez `mir_eval`, tolerancje jak w §1.1. RPA/RCA @ ±50 centów dla warstwy F0.

> **Sufit ludzki z vocadito jest niezbędny.** Zgodność `COnPOff` między dwoma ludzkimi anotatorami jest górną granicą tego, co model może osiągnąć. Bez tej liczby nie wiadomo, czy 77 punktów to blisko sufitu czy daleko — a to zmienia decyzję o tym, czy w ogóle warto dalej inwestować w segmenter.

## 8.3. Poziom 3 — panel ekspercki (kwartalnie, bramka wydania)

Protokół przepisany z jedynej pracy, która to zmierzyła na ludziach **[Z]**:

```
materiał:   120 wykonań, zbalansowane po typie głosu, poziomie, urządzeniu, języku
sędziowie:  ≥ 3 nauczycieli śpiewu, oceny NIEZALEŻNE (bez kontaktu, losowa kolejność)
skala:      1–10, całościowa jakość wykonania
prawda:     średnia po sędziach dla klipu
metryki:    Spearman ρ, Kendall τ, MSE, MAE, MedAE  +  ICC(2,k) MIĘDZY SĘDZIAMI
```

**Poprzeczka odbioru: ρ ≥ 0.70.**

Uzasadnienie liczby **[Z]**:

| System | ρ | τ |
|---|---|---|
| SWIPE | 0.421 | — |
| CREPE | 0.442 | — |
| **pYIN (sam pomiar wysokości)** | **0.485** | 0.354 |
| MusicJudge, tylko muzyka | 0.495 | — |
| MusicJudge, tylko treść | 0.626 | — |
| **MusicJudge, pełny (SOTA)** | **0.683** | **0.499** |

0.70 leży minimalnie powyżej opublikowanego SOTA i ~0.21 powyżej sufitu samego pomiaru wysokości. Jest ambitna, ale nie fantastyczna — i jest **jedyną liczbą w całej specyfikacji, która odpowiada wprost na "czy nauczyciel powie, że to jest słuszne"**.

**ICC(2,k) jest obowiązkowe i raportowane zawsze.** Jeżeli sędziowie zgadzają się na poziomie 0.6, żaden system nie przekroczy 0.6, a gonienie 0.70 jest gonieniem szumu. Bez tej liczby cały panel jest niemierzalny.

## 8.4. Poziom 4 — testy sprawiedliwości (bramka wydania)

Rozkład wyniku wg: typu głosu (bas/baryton/tenor/alt/mezzo/sopran), płci, klasy urządzenia (mikrofon laptopa / słuchawki BT / iPhone / mikrofon USB), języka, poziomu zaawansowania.

Bramka: **żadna para median nie różni się o więcej niż 4 punkty** przy zbalansowanym materiale. Podstawa: arXiv 2308.02898 wykazał systematyczną przewagę głosów żeńskich w transkrypcji śpiewu wynikającą z różnic w rozkładzie wysokości **[Z]** — to samo uderzy w scoring, jeśli się tego nie zmierzy.

## 8.5. Bramki regresyjne w CI

| Metryka | Bramka |
|---|---|
| `COnPOff` na vocadito | spadek > 1.0 pkt → fail |
| RPA @ ±50 centów | spadek > 0.5 pkt → fail |
| mediana \|błędu\| na syntetyku czystym | > 10 centów → fail |
| mediana \|błędu\| przy SNR 10 dB | > 25 centów → fail |
| monotoniczność scoringu | jakiekolwiek naruszenie → fail |
| mediana populacji referencyjnej | poza 62 ± 3 → fail |
| rozrzut median po typie głosu / urządzeniu | > 4 pkt → fail |
| determinizm cross-platform (Rust/WASM/Swift/Kotlin) | rozbieżność > tolerancja golden → fail |

Obecnie repo ma **zero testów i niedziałający lint** (`package.json:9`) — to jest warunek wstępny całej reszty, bo bez tego żadna z powyższych liczb nie jest egzekwowalna.

---

# 9. Poprzeczka rynkowa

> **Zastrzeżenie.** Zweryfikowane w tej sesji **[Z]** są wyłącznie patenty. Reszta tej sekcji to wiedza własna **[W]** i wymaga potwierdzenia przed użyciem w materiałach marketingowych.

## 9.1. Co da się zweryfikować: model bazowy branży

Patenty karaoke-owe **[Z, Google Patents]**:

- **US7164076B2** — *"determining a pitch error from the pitch value of a respective sample and a corresponding selected reference pitch; comparing the pitch error with a target range; scoring the live musical performance positively if the pitch error is less than the target range"*
- **US20060009979A1** — *"the compare module compares the player's vocal pitch with a reference pitch from the reference performance"*
- **US7806759B2** — feedback "indicative of the player's rhythm and pitch"

To jest **kanoniczny model branżowy**: per-próbka, odległość od referencji, próg, zliczanie. Dokładnie ta konstrukcja, którą ta specyfikacja odrzuca w §5.3 — i dokładnie ta, którą implementuje obecny kod (`hitRate` = procent ramek w ±50 centów).

## 9.2. Konkurencja i jej słabe punkty **[W]**

| Produkt | Model | Gdzie jest słaby |
|---|---|---|
| **Smule (Sing!)** | per-ramka, hojna tolerancja, silne ważenie pokrycia; wynik zaprojektowany żeby był wysoki | Wynik jest instrumentem retencji, nie pomiarem — prawie każdy dostaje 85–95, więc nie niesie informacji. Zero pedagogiki, zero rozbicia na wymiary. Karze transpozycję. Nie ma pojęcia vibrata. |
| **Yousician (wokal)** | detekcja per-ramka, zielono/czerwono na piano-rollu, gamifikacja | Feedback binarny "w pasku / poza paskiem": bez kierunku, bez wielkości, bez przyczyny. Silnik pochodzi z instrumentów strunowych — tolerancje i model ataku są instrumentalne, a głos ma portamento i vibrato, których gitara nie ma. Karze scoop. |
| **Vanido** | krótkie codzienne ćwiczenia, duży okrągły target z ruchomym punktem | Minimalna diagnostyka. Jedna liczba bez rozbicia. Brak modelu offsetu — transpozycja czytana jako błąd. Brak jakiegokolwiek raportu długoterminowego poza serią dni. |
| **Riyaz** | **najmocniejszy pedagogicznie**: ocenia względem tonicznej podstawy (Sa) wybranej przez użytkownika i mierzy INTERWAŁY | Koncepcyjnie rozwiązał to, czego zachód nie rozwiązał (relatywność). Słaby: mocno związany z repertuarem klasyki indyjskiej, słabo przenosi się na muzykę zachodnią, brak wymiarów poza wysokością, brak vibrata jako mierzonej umiejętności (gamaka to co innego). |
| **SingSharp** | piano-roll + karaoke, nuty docelowe i linia głosu | Przestarzały UI, znaczny lag wizualizacji, brak kompensacji latencji. Feedback czysto wizualny, zero wnioskowania. |
| **Erol Singer's Studio** | najbliżej metodyki konserwatoryjnej: struktura ćwiczeń, akompaniament fortepianowy, dobre pokrycie repertuaru wprawek | Ocena pozostaje wskaźnikiem "w stroju / nie" per ramka. Zna pedagogikę, nie zna pomiaru. Brak raportu z sesji, brak trendów, brak rozbicia na wymiary. |

## 9.3. Czym konkretnie się bije — pięć rzeczy, których nie robi nikt

1. **Rozdzielenie offsetu od rozrzutu.** Wszyscy karzą transpozycję. Zdanie *"intonacja jest świetna, cała fraza leży 40 centów pod spodem"* jest dla użytkownika przełomowe i nie pada nigdzie na rynku. To najtańsza i największa przewaga w całym dokumencie — jest wyłącznie kwestią matematyki, nie danych i nie modeli.
2. **Vibrato jako mierzona i nagradzana umiejętność.** Konkurencja albo je ignoruje, albo karze jako niestabilność. Zdanie *"twoje vibrato ma 5.8 Hz i ±68 centów — to zakres zawodowy"* natychmiast ustawia produkt w innej klasie i jest tym, co nauczyciel rozpozna jako słuszne.
3. **Pominięcie ataku i portamento.** Wszyscy uśredniają całą nutę razem ze scoopem. Skutek: śpiewak z dobrym legato dostaje gorszy wynik niż śpiewak z prostym, martwym atakiem. To jest odwrócenie pedagogiki i jest naprawialne czterema liniami logiki.
4. **Kalibrowany rozkład wyniku.** Wynik Smule zawsze jest wysoki, wynik amatorskich aplikacji zawsze niski. Wynik, którego mediana wynosi 62 i który realnie przesuwa się o 6 punktów po miesiącu ćwiczeń, jest funkcjonalnie innym produktem — mierzy zamiast pochlebiać.
5. **Feedback z przyczyną i dowodem.** Nie "78%", tylko *"konsekwentnie zaniżasz na wysokich nutach i skracasz tam frazy — to podparcie oddechowe"* + trzy klikalne nuty do odsłuchu + jedno ćwiczenie. To jest przejście od miernika do nauczyciela i to jest jedyny wymiar, w którym można wygrać trwale.

---

# 10. Kolejność budowy

Kolejność wynika z zależności merytorycznych, nie z pracochłonności.

| # | Krok | Odblokowuje | Bramka wyjścia |
|---|---|---|---|
| 0 | Harness syntetyczny + golden tests + naprawa lintu | wszystko | testy przechodzą, CI zielone |
| 1 | `core-eval` jako czysty moduł: kontrakt, centy, ring buffer | port natywny | `PerformanceReport` deterministyczny |
| 2 | Segmentacja regułowa (§1.4) + pominięcie ataku (§1.5) | ocena per nuta | monotoniczność scoringu |
| 3 | Rozkład O(t)/r_i + martwe strefy (§3) | koniec "zawsze 40%" | test transpozycji ≤3 pkt |
| 4 | Vibrato (§2) | koniec karania techniki | test vibrata ΔScore ≥ 0 |
| 5 | Aligner scoringowy NW na nutach (§4.3B) | wymiar `content` | test pominiętej nuty |
| 6 | Scoring + kalibracja percentylowa (§5) | wynik informacyjny | mediana populacji 62±3 |
| 7 | Silnik findings + feedback (§7) | wartość pedagogiczna | podobieństwo z komentarzem eksperta |
| 8 | `NoteBoundaryNet` — dane, trening, ONNX (§1.2) | jakość segmentacji | `COnPOff` > fallback o ≥15 pkt |
| 9 | Panel ekspercki (§8.3) | dowód, że to działa | **ρ ≥ 0.70** |
| 10 | Klasyfikator rejestru (§6.2) | wymiar opisowy | dokładność + kalibracja odmowy |

Kroki 2–7 nie wymagają ani jednego modelu uczonego i dają największą część przewagi rynkowej z §9.3. Krok 8 jest tym, co podnosi sufit — i tym, co wymaga danych, więc pozyskiwanie i weryfikacja korpusów startuje równolegle od kroku 0.

### Zależności

- Warstwa F0 o jakości pYIN/SwiftF0 z voicedProb per ramka i z dekodowaniem sekwencyjnym (Viterbi) — bez tego wszystko powyżej mierzy błędy detektora, a nie śpiewaka. Segmentacja przez sieć przyjmuje kontur F0 na wejściu, więc jest wprost na niej zawieszona. Krytyczne: NoteBoundaryNet musi być trenowany na wyjściu DOKŁADNIE tego ekstraktora, który będzie użyty w produkcji — zmiana ekstraktora F0 wymusza retrening segmentera.
- Rdzeń przenośny (Rust lub C++) z bindingami wasm-bindgen / uniffi. core-eval musi być w tym rdzeniu od pierwszego commita, nie 'przeniesiony potem' — inaczej iOS oznacza przepisanie całej logiki oceny i utratę determinizmu między platformami.
- Kalibracja latencji round-trip per urządzenie i per trasa wyjścia (loopback klik + korelacja krzyżowa). Bez niej wymiar rytmu (T, waga 0.15–0.25) jest szumem, a przy słuchawkach Bluetooth (+100–300 ms) jest szumem o amplitudzie większej niż mierzony sygnał.
- Pomiar noise floor i jawny DeviceProfile (fingerprint urządzenia). Wymagany przez: bramkę voicing (rmsDb > noiseFloor + 12), detekcję oddechu, klasyfikator rejestru i testy sprawiedliwości po klasie urządzenia. Stały próg absolutny (obecne rmsThreshold=0.001) nie może działać — rozrzut między mikrofonem laptopa z AGC a kondensatorem USB to 25–30 dB.
- getUserMedia / AVAudioSession / Oboe z WYŁĄCZONYM AGC, NS i AEC na torze analizy, plus weryfikacja przez track.getSettings() — Safari i część Androidów ignorują część constraintów. AGC pełznie po głośności i niszczy dynamikę względną oraz stabilność F0.
- Reprezentacja referencji jako danych, nie kodu: schemat JSON dla ćwiczeń i melodii (nuty, czasy, stopień skali, tryb ACappella/FixedBacking). Obecnie ćwiczenia są zahardkodowane w module syntezy (lib/audio-synth.ts:240) i przypięte na sztywno do C4–C5 bez adaptacji do zakresu głosu — martwa strefa zależna od stopnia skali (§3.5) wymaga znajomości stopnia, a nie tylko wysokości.
- Populacja referencyjna N ≥ 500 wykonań na klasę trudności, zbalansowana po typie głosu, urządzeniu i poziomie — bez niej mapa kalibracyjna Calib_c nie istnieje, a bez niej wynik nie ma gwarantowanego rozkładu. To jest zbieranie danych od realnych użytkowników i musi ruszyć najwcześniej, bo ma najdłuższy czas dojrzewania.
- Panel ≥3 nauczycieli śpiewu i 120 ocenionych wykonań — jedyna bramka, która odpowiada na pytanie postawione w zadaniu ('nauczyciel ma powiedzieć: to jest słuszne'). Rekrutacja i protokół są zależnością organizacyjną o najdłuższym leadzie.
- Weryfikacja proweniencji adnotacji Annotated-VocalSet (przeczytanie sekcji metodologicznej Applied Sciences 12(18):9257 + ręczna kontrola 200 nut) PRZED użyciem jako ground truth — od tego zależy, czy mamy 10 h danych treningowych, czy 0.
- Testy i lint w CI (obecnie package.json:9 — zero testów, lint niedziałający). Wszystkie bramki regresyjne z §8.5 są bezwartościowe bez działającego CI.
- Persystencja pełnego PerformanceReport z wersją kalibracji, poza localStorage (obecnie pitchHistory idzie do localStorage i przekracza quotę, hooks/use-session-library.ts:88). Wykres postępów wymaga niezmienności wyników historycznych, więc calibVersion musi być zapisany razem z wynikiem.

### Ryzyka

- Sufit ludzki może być niżej niż poprzeczka. Jeżeli ICC(2,k) między nauczycielami wyjdzie ~0.6, to ρ=0.70 z ich średnią jest matematycznie nieosiągalne i cała bramka odbioru jest źle postawiona. Ryzyko realne: ocena śpiewu jest notorycznie subiektywna, a MusicJudge nie raportuje ICC swoich sędziów, więc nie wiadomo, jak blisko sufitu jest ich 0.683. Mitygacja: ICC mierzone w pierwszej rundzie panelu, PRZED zamrożeniem poprzeczki; jeśli ICC < 0.7, poprzeczka przechodzi na 0.90·ICC.
- NoteBoundaryNet trenowany na materiale klasycznym i zawodowym (VocalSet, SingStyle111 — sami profesjonaliści) może się nie generalizować na docelowego użytkownika: amatora, który śpiewa niepewnie, z przydechem i z niestabilną wysokością. To jest przesunięcie rozkładu w najgorszym możliwym kierunku, bo granice nut u amatora są właśnie rozmyte. Dowód, że to realne: ROSVOT trenowany na mandaryńskim popie wyraźnie degraduje na TONAS (flamenco a cappella), a autorzy przypisują to zarówno stylowi, jak i nieznanemu językowi.
- Model transkrypcji może 'poprawiać' śpiewaka także przez granice, nie tylko przez wysokość. Usunięcie dekodera D_P zamyka oczywisty kanał, ale sieć trenowana na poprawnym śpiewie może umieszczać granice tam, gdzie POWINNY być muzycznie, a nie tam, gdzie realnie nastąpiła zmiana — u kogoś, kto rozjeżdża rytm. To zafałszowałoby wymiar T. Musi być zmierzone jawnie: COn na materiale rytmicznie niepoprawnym, osobno od materiału poprawnego.
- Rozdzielenie offsetu od rozrzutu jest tylko tak dobre, jak zamrożenie estymatora na wysokiej dyspersji. Jeśli próg MAD > 40 centów jest źle dobrany, O(t) zaczyna gonić śpiewaka, residuum spada do zera i aplikacja mówi każdemu, że śpiewa czysto — czyli patologia 'zawsze 90%' wraca tylnymi drzwiami i to w formie trudnej do zauważenia, bo wygląda jak sukces.
- Kalibracja percentylowa wprowadza sprzężenie zwrotne: gdy użytkownicy się poprawiają, populacja referencyjna się przesuwa, a przeliczenie mapy obniża wyniki tym, którzy nie zrobili postępu — mimo że nic nie zrobili gorzej. Zamrożenie wyników historycznych rozwiązuje wykres postępów, ale nie rozwiązuje sytuacji, w której ten sam użytkownik dostaje dziś mniej niż wczoraj za identyczne wykonanie. Wymaga jawnej polityki wersjonowania widocznej w UI.
- Ryzyko licencyjne wag jest szersze niż ROSVOT. Ta sama pułapka ('licencja kodu ≠ licencja wag') dotyczy każdego modelu, który wciągniemy do pipeline'u — w tym ekstraktora F0. Zweryfikowane w tej sesji: wagi ROSVOT nie mają licencji, M4Singer ma NOASSERTION. Potrzebna twarda polityka: do produktu wchodzą tylko modele z permisywną licencją NA KODZIE I NA WAGACH plus udokumentowanym pochodzeniem danych, z SHA-256 każdego pliku wag w repo.
- Klasyfikator rejestru może stać się źródłem najgorszego rodzaju fałszywej pewności. H1-H2 i nachylenie widma są zdominowane przez charakterystykę mikrofonu i pokój; przy złej kalibracji użytkownik dostanie 'śpiewasz falsetem' o rejestrze piersiowym. Bramka odmowy (softmax < 0.65) jest zabezpieczeniem, ale jej próg trzeba dobrać na danych z realnych telefonów, a nie na VocalSet nagranym w studiu — inaczej odmowa nigdy się nie uruchomi tam, gdzie jest potrzebna.
- Feedback pedagogiczny może być technicznie poprawny i dydaktycznie szkodliwy. R2 ('to podparcie oddechowe') stawia diagnozę fizjologiczną z sygnału akustycznego — jeśli reguła odpali u kogoś, kto ma problem ze słuchem, a nie z oddechem, wyślemy go na miesiące złego ćwiczenia. Progi n i rozmiaru efektu muszą być zweryfikowane przez nauczycieli na realnych przypadkach, a nie tylko statystycznie.
- Nierówność wyników po typie głosu jest domyślnym stanem, nie wyjątkiem. Praca o uprzedzeniu płciowym w transkrypcji śpiewu (arXiv 2308.02898) pokazała systematyczną przewagę głosów żeńskich wynikającą z samego rozkładu wysokości. Nasz f_reg to korekta ad hoc; jeśli nie zmierzymy rozkładu wyników po typie głosu od pierwszego dnia, wypuścimy produkt, który po cichu karze basy.
- Trzy reżimy wyrównania czasowego (TRAIN/SING/FREE) to trzy różne ścieżki kodu na tym samym kontrakcie. Jeśli granica między nimi się rozmyje, dostaniemy najgorszy przypadek: aligner live zaczyna zasilać scoring, a błędy alignera stają się nieodróżnialne od błędów śpiewaka. To jest defekt, którego użytkownik nie może zweryfikować, więc niszczy zaufanie nieproporcjonalnie.

### Do rozstrzygnięcia pomiarem

- Jaki jest sufit ludzki dla segmentacji na nuty? Zgodność COnPOff między dwoma niezależnymi anotatorami vocadito (dane są, wystarczy policzyć). Bez tej liczby nie wiadomo, czy COnPOff 77 to blisko sufitu, czy zostało jeszcze 20 punktów — a to decyduje, czy dalsza inwestycja w segmenter ma sens.
- Czy adnotacje Annotated-VocalSet są ludzkie czy algorytmiczne? Abstrakt mówi o porównaniu 'czterech metod definiowania onsetu/offsetu', co sugeruje algorytm. Rozstrzyga: lektura sekcji metodologicznej + ręczna kontrola 200 losowych nut. Od tego zależy dostępność 10 h danych treningowych.
- Jaki jest ICC(2,k) między nauczycielami śpiewu na naszym materiale? Rozstrzyga wyłącznie panel. Determinuje, czy poprzeczka ρ ≥ 0.70 jest osiągalna, czy trzeba ją przedefiniować jako ułamek sufitu.
- Jak bardzo NoteBoundaryNet degraduje na amatorach względem zawodowców? Wymaga własnego zbioru testowego z nagrań realnych użytkowników z ręczną adnotacją. To najważniejsza nieznana liczba w całej specyfikacji — determinuje, czy sieć jest przewagą, czy kosztownym ozdobnikiem nad fallbackiem regułowym.
- Czy sieć trenowana na poprawnym śpiewie przesuwa granice nut w stronę muzycznej poprawności u śpiewaków rytmicznie niedokładnych? Pomiar: COn osobno na materiale rytmicznie poprawnym i niepoprawnym (syntetyk ze wstrzykniętym przesunięciem onsetów). Jeśli różnica jest istotna, wymiar T nie może korzystać z granic sieci.
- Jaki próg MAD zamraża estymator offsetu w sam raz? 40 centów to wartość wyjściowa z wcześniejszego researchu, nie zmierzona. Rozstrzyga: symulacja na syntetyku z płynnie rosnącym rozrzutem — szukamy progu, przy którym residuum przestaje maleć wraz z rosnącym fałszem.
- Jaki jest realny rozkład raw' w populacji użytkowników i czy da się go zmapować na docelowe kwantyle bez patologicznych odcinków mapy? Możliwe, że rozkład jest tak skoncentrowany, że mapa staje się prawie pionowa i drobne różnice pomiaru dają duże skoki wyniku. Rozstrzyga: pierwsze N=500.
- Czy tolerancja d0 oparta na JI jest odczuwana przez użytkowników jako sprawiedliwa, czy jako niekonsekwentna ('dlaczego tercja ma większy margines niż kwinta')? To pytanie percepcyjne, nie akustyczne — rozstrzyga test A/B z komentarzem jakościowym plus opinia nauczycieli.
- Jaka jest dokładność klasyfikatora rejestru na realnych mikrofonach telefonów (nie na VocalSet)? Abstrakt AVRA nie podaje żadnej liczby. Rozstrzyga: własny zbiór z etykietami od nauczyciela, nagrany na 4 klasach urządzeń.
- Czy jeden finding na sesję to właściwa dawka, czy zbyt mało? Guidance hypothesis mówi 'mniej', ale nie mówi 'ile'. Rozstrzyga: A/B na retencji i na realnym postępie mierzonym po 4 tygodniach — nie na deklarowanej satysfakcji, bo ta preferuje więcej feedbacku niż jest zdrowe.
- Czy da się zmierzyć dynamikę względną wiarygodnie przy ruchu użytkownika względem telefonu w trakcie take'u? Zmiana odległości o 15 cm to kilka dB, porównywalne z mierzonym crescendo. Możliwa mitygacja przez stosunek energii pasm zamiast poziomu bezwzględnego — wymaga pomiaru.
- Jaka jest realna latencja end-to-end NoteBoundaryNet w ONNX Runtime na iPhonie i na średnim Androidzie dla take'u 3-minutowego? Segmentacja jest offline, więc chodzi o akceptowalny czas oczekiwania na wynik, nie o real-time. Rozstrzyga profilowanie po eksporcie.

### Adwersarz techniczny

**Nie zadziała tak, jak opisano:**

- **§10: 'Nie włączać wasm-threads/SharedArrayBuffer → brak COOP/COEP' + §1.1/§7.3: 'AudioWorklet → ring buffer → plik i24' i 'ring buffer 4 × 65 536 klatek'**

  Bez SharedArrayBuffer ring buffer między AudioWorkletem a Workerem trzymającym FileSystemSyncAccessHandle NIE ISTNIEJE. Jedyny kanał z AudioWorkletProcessor to jego `port`, a drugi koniec (`AudioWorkletNode.port`) żyje na MAIN THREADZIE. Czyli każdy blok audio 3 ścieżek przechodzi przez wątek Reacta zanim trafi na dysk. Przy rysowaniu waveformu 3 h, re-renderze albo GC main thread stoi, kolejka MessagePortu rośnie, RAM rośnie liniowo. To nie jest ring buffer, to kolejka komunikatów bez backpressure. Przy 432 kB/s przez 3 h to 4,7 GB, które musi przepłynąć przez wątek UI.

  → Albo (a) włączyć COOP/COEP + SAB i rozwiązać problem embedów inaczej (Safari nie ma `COEP: credentialless` — potwierdzone, BCD version_added:false — więc embedy trzeba przenieść na własny proxy albo iframe na osobnym originie), albo (b) utworzyć `new MessageChannel()`, przesłać `port2` DO procesora przez `node.port.postMessage(msg,[port2])`, a `port1` do Workera dyskowego. Wtedy kanał worklet→worker omija main thread i działa bez COOP/COEP. Wariant (b) musi być zapisany w spec jawnie, bo naiwna implementacja go nie zrobi.

- **§10: 'bindings-wasm/ wasm-bindgen' + 'AudioWorklet ← rdzeń WASM bez feature onnx'**

  Wygenerowany przez wasm-bindgen glue NIE URUCHOMI SIĘ w AudioWorklecie. `AudioWorkletGlobalScope` nie ma `TextEncoder` ani `TextDecoder` (używanych przez glue do każdego stringa), nie ma `fetch` ani `importScripts` (więc `init()` z URL-em .wasm nie zadziała). Issue rustwasm/wasm-bindgen#2367 jest OTWARTE od 2020 z cytatem: 'the major blocker is that TextEncoder and TextDecoder are not available within AudioWorklets'.

  → Osobny build rdzenia dla worklera: `wasm-bindgen --target no-modules`, wstrzyknięty polyfill TextEncoder/TextDecoder (FastestSmallestTextEncoderDecoder, MIT) na początku pliku procesora, `WebAssembly.Module` skompilowany na main threadzie i przekazany przez `node.port.postMessage(module)` + `WebAssembly.instantiate(module, imports)` w konstruktorze procesora. Alternatywnie: build worklerowy bez wasm-bindgen w ogóle — czysty `extern "C"` bez stringów, bo tor RT nie potrzebuje stringów.

- **§3.1 i §8: 'Parakeet w onnxruntime-web tylko jako opt-in na desktopie, model cache'owany w OPFS' przy jednoczesnym 'nie włączać SharedArrayBuffer'**

  Wielowątkowość onnxruntime-web wymaga cross-origin isolation. Dokumentacja ORT: 'only when the browser supports WebAssembly multi-threading and crossOriginIsolated mode is enabled, multi-threading will be enabled'. Bez COOP/COEP `env.wasm.numThreads` degraduje do 1. Enkoder FastConformer 600M int8 na JEDNYM wątku WASM to RTF rzędu jednostek (nie ułamków) — 3 h materiału to godziny liczenia. Ta ścieżka jest martwa z definicji, a spec ją wymienia jako realną opcję.

  → Skreślić onnxruntime-web CPU z opcji. Jeśli ma być cokolwiek on-device w przeglądarce, to tylko backend WebGPU ORT (nie wymaga SAB) — ale spec sam odrzucił WebGPU na iOS. Werdykt merytoryczny: w przeglądarce ASR jest wyłącznie serwerowy, a on-device należy do shelli natywnych. Zapisać to jako decyzję, nie jako 'opt-in'.

- **§7: 'SQLite Wasm na OPFS dla metadanych i command logu' przy braku COOP/COEP**

  Kanoniczny VFS `opfs` w sqlite-wasm WYMAGA SharedArrayBuffer i COOP/COEP (dokumentacja SQLite: 'JavaScript's SharedArrayBuffer type is required for the OPFS VFS, and that class is only available if the web server includes the so-called COOP and COEP response headers'). Zostaje `opfs-sahpool`, który ma dwa ograniczenia zabójcze dla tej architektury: 'does not support multiple simultaneous connections' oraz 'pre-allocates all potential file handles, immediately locking those files'. Czyli: jedna instancja bazy na cały origin (Worker audio i Worker ASR nie mogą obie mieć połączenia), brak drugiej zakładki, i pula plików zablokowana wyłącznie przez SAHPool — koegzystująca z Twoimi własnymi SyncAccessHandle na plikach i24.

  → Jeden dedykowany 'db-worker' jako JEDYNY właściciel połączenia SQLite; wszystkie inne Workery i main thread rozmawiają z nim przez MessagePort (RPC). Zapisać w spec, że command log NIE jest zapisywany bezpośrednio z Workera audio. Dodatkowo obsłużyć 'pause/unpause' VFS (sqlite 3.50+) na wypadek drugiej zakładki, albo jawnie zablokować drugą zakładkę tego samego projektu przez Web Locks API.

- **§5.2: 'presigned R2 multipart, części 5 MB (≈34 s audio i24)' oraz '1 555 200 000 B / 5 MB ≈ 312 części'**

  R2 odrzuci te części. Minimum to 5 MiB = 5 242 880 B, nie 5 MB = 5 000 000 B — dostaniesz EntityTooSmall na każdej części poza ostatnią. Do tego dwa warunki, których spec nie uwzględnia: 'All parts except the last must be the same size' (czyli po wznowieniu przerwanego uploadu NIE WOLNO zmienić rozmiaru części) oraz 'Incomplete multipart uploads are automatically aborted after 7 days by default' (przerwany upload gościa znika, a spec zakłada 'lokalny plik jest zawsze prawdą i można go dosłać po fakcie' — po 8 dniach nie można, trzeba zacząć od nowa). Poprawna liczba części: 1 555 200 000 / 5 242 880 = 297 na ścieżkę, 891 na odcinek.

  → Rozmiar części 8 MiB = 8 388 608 B (54,5 s audio i24, 186 części/3 h, zapas do limitu 10 000). Rozmiar części zapisać w metadanych sesji w D1 i NIGDY nie zmieniać przy wznowieniu. Lifecycle policy na buckecie 'tracks' wydłużyć abort do 30 dni. Ostatnia część jako jedyna może być mniejsza — zaokrąglić nagranie w górę i dopchać ciszą, żeby nie było części o rozmiarze innym niż nominalny w środku.

- **§7.4: 'twarda bramka navigator.storage.estimate() wymagająca 1,3 × przewidywanego rozmiaru wolnego miejsca'**

  Ta bramka na Safari nie mierzy tego, co spec zakłada — przepuści nagranie na pełnym telefonie. Po pierwsze: `StorageManager.estimate()` jest w Safari/iOS dopiero od wersji 17 (MDN BCD), a SyncAccessHandle od 15.2 — na iOS 16.x bramki fizycznie nie ma. Po drugie i ważniejsze: WebKit liczy kwotę od CAŁKOWITEGO rozmiaru dysku, nie od wolnego: 'each origin can store up to around 60% of total disk'. Na iPhonie 256 GB z 2 GB wolnego `estimate().quota` zwróci ~150 GB, bramka '1,3 × 4,666 GB = 6,07 GB' przejdzie, a zapis padnie QuotaExceededError w 40. minucie trzygodzinnego nagrania — czyli w najgorszym możliwym momencie. Ryzyko #7 ze spec jest niedoszacowane: to nie jest 'odcina część użytkowników', to jest 'przepuszcza i gubi materiał'.

  → Bramka musi być testem zapisu, nie zapytaniem o kwotę: przed startem nagrania utworzyć docelowe pliki i wywołać `handle.truncate(przewidywany_rozmiar)` dla każdej ścieżki (preallocation). Jeśli truncate rzuci QuotaExceededError — miejsca nie ma, koniec. Preallocation daje dodatkowo mniejszą fragmentację i stały offset seek. Do tego licznik zapisanych bajtów z twardym progiem ostrzegawczym co 10% i automatyczne przełączenie na FLAC-24 w locie po przekroczeniu 80% zadeklarowanej alokacji.

- **§7.4: 'OPFS z FileSystemSyncAccessHandle ... Safari i iOS 15.2+'**

  Na Safari 15.2–16.3 metody `getSize()`, `flush()`, `truncate()` i `close()` ZWRACAJĄ PROMISE, nie działają synchronicznie (MDN BCD notuje wersję synchroniczną dopiero od 16.4). Cały argument spec — 'tylko SyncAccessHandle daje synchroniczny random-access' — na tych wersjach nie zachodzi, a kod napisany pod API synchroniczne rzuci tam błędy typu 'undefined is not a number' przy `getSize()`. Realna podłoga to Safari/iOS 16.4, nie 15.2.

  → Zadeklarować minimum Safari/iOS 16.4 i sprawdzać w runtime: `typeof handle.getSize() === 'number'`. Poniżej — tryb tylko-do-odczytu / import, bez nagrywania długich sesji. Poprawić tabelę w §7.4.

- **§5.2 mechanizm (2): 'GCC-PHAT lokalnej ścieżki A vs referencyjny miks u B, okno 60 s, FFT 2^20 → ±1 próbka (±21 µs)' i mechanizm (3): 'regresja liniowa offset(t)'**

  Referencyjny miks zdalny to WYJŚCIE NetEq (jitter buffer WebRTC), który robi time-scale modification: accelerate, preemptive expand, PLC. NetEq NIELINIOWO wstawia i usuwa próbki w zależności od jittera sieci — to nie jest ta sama oś czasu, tylko oś czasu warpowana skokowo. Do tego Opus 32 kb/s nie jest liniowo-fazowy, a AEC jest adaptacyjny i nieliniowy. Konsekwencje: (a) 'offset(t) = a + b·t' jest fałszywym modelem — mierzysz sumę dryfu zegara i skoków NetEq, a resampling korygujący wyprostuje artefakty jitter buffera zamiast dryfu; (b) '±21 µs' to fizycznie 1 próbka przy 48 kHz, a sygnał referencyjny ma 16 kHz — jedna próbka referencji to 62,5 µs = 3 próbki @48 kHz przed interpolacją; (c) przy stracie pakietów PLC generuje syntetyczne próbki, które w GCC-PHAT są szumem dekorelującym. Twoje własne openQuestion #11 zadaje to pytanie — odpowiedź brzmi: nie, nie da deklarowanej dokładności, i model liniowy jest strukturalnie zły.

  → Nie mierz dryfu przez sieć. Mierz zegar urządzenia LOKALNIE, u każdego uczestnika, przeciw monotonicznemu zegarowi systemowemu: iOS — `AVAudioTime.hostTime` + `mach_timebase_info` przy każdym buforze wejściowym; Android — `AudioStream::getTimestamp()` (framePosition + nanoseconds, Oboe); web — `currentFrame`/`currentTime` w worklecie vs `performance.now()`. Regresja liniowa liczby zarejestrowanych klatek względem zegara monotonicznego daje realny rate urządzenia w ppm z dokładnością <0,5 ppm po 10 minutach, jest ciągła i całkowicie odporna na Opus, AEC, NetEq i utratę pakietów. Sieć (Cristian) służy TYLKO do zsynchronizowania zegarów monotonicznych, i to zgrubnie, bo dryf bierzesz z nachylenia, nie z offsetu. GCC-PHAT zostaw wyłącznie do JEDNORAZOWEGO wyznaczenia offsetu startowego, na oknie 5–10 s, z jawnym progiem jakości piku (peak-to-sidelobe ratio > 3) i fallbackiem na chirp, gdy pik jest rozmyty.

- **§5.2: 'Lokalny zapis (AudioWorklet → i24 48 kHz mono) — to jest materiał' jako mechanizm double-endera dostępny na webie**

  W przeglądarce nie masz dostępu do zegara mikrofonu. `MediaStreamAudioSourceNode` oddaje próbki JUŻ przeresamplowane do `AudioContext.sampleRate`, a przeglądarka sama kompensuje dryf urządzenia względem kontekstu (wstawiając/gubiąc próbki lub resamplując asynchronicznie). Spec Web Audio mówi o resamplingu wyjścia; dla wejścia z MediaStream nie definiuje nic, a implementacje robią właśnie ukrytą kompensację. Czyli 'lokalny zapis i24 48 kHz' na webie NIE jest zapisem zegara mikrofonu, tylko zapisem zegara AudioContextu z już nałożoną, niewidoczną korektą — i te wstawione/pominięte próbki są nieodwracalne. Mierzenie dryfu ±100 ppm na materiale, który przeglądarka już zdryfowała za Ciebie, nie ma sensu.

  → To jest twardy argument, że DOUBLE-ENDER JEST FUNKCJĄ NATYWNĄ, nie webową — i to zapisać wprost, obok istniejącego argumentu o nagrywaniu w tle. Na iOS `AVAudioEngine` z `installTap` na input node daje surowe bufory i hostTime; na Androidzie Oboe/AAudio daje framePosition. Web pozostaje trybem 'solo, krótka sesja, import i edycja'. Jeśli web ma być trybem gościa w double-enderze, to z jawnym komunikatem o ograniczonej precyzji synchronizacji i obowiązkową weryfikacją chirpem.

- **§6.3: 'Źródło kandydatów: luki w alignmencie ... Akcja: usuwalne automatycznie' przy celu 'precyzja ≥97%'**

  Luka w alignmencie powstaje w TRZECH sytuacjach, nie w jednej: (1) wypełniacz, (2) DELECJA ASR — Parakeet nie zwrócił realnie wypowiedzianego słowa, (3) błąd alignera. Przy WER 7% na czytanej mowie i realnie 15–25% na spontanicznym polskim podcaście delecje to kilka procent słów. Automat będzie regularnie kasował realnie wypowiedziane słowa — i to BEZ ŚLADU dla użytkownika, bo tego słowa nigdy nie było w transkrypcie, więc w widoku tekstowym nic nie zniknie. Użytkownik dowie się dopiero z odsłuchu. To jest gorsze niż problem, który funkcja rozwiązuje: 'yyy' jest irytujące, ucięte słowo jest błędem merytorycznym. Dodatkowo: kryterium 'F0 wykryty, clarity >0,6' spełnia każda samogłoska, czyli każde niezaalignowane słowo z sylabą otwartą.

  → Warunek konieczny przed automatycznym usunięciem: DRUGI PRZEBIEG ASR na wyizolowanym fragmencie luki z paddingiem 200 ms z każdej strony. Jeśli zwróci jakikolwiek token leksykalny — to jest delecja, nie wypełniacz; oznacz jako 'możliwe brakujące słowo' i NIE usuwaj. Dopiero pusty lub nieleksykalny wynik + kryteria akustyczne z §6.3 kwalifikuje do klasy A. Drugi warunek: monotoniczność formantów — wypełniacz ma stały F1/F2 (zmiana <10% przez ≥100 ms), a każde słowo ma tranzycje formantowe; to jest silniejszy dyskryminator niż stabilność centroidu. I nawet z tym: przy 27 000 słów precyzja 97% to ~kilkanaście błędnych cięć na odcinek, więc domyślnie klasa A też powinna być 'zaznaczone + jeden przycisk zastosuj', a nie cicha automatyka.

- **§10 + zależność #12: 'Golden-file testy DSP + CI — warunek, żeby port na Swift/Kotlin był przenoszeniem, nie pisaniem od nowa'**

  Golden-file testy bit-exact NIE PRZEJDĄ między wasm32, aarch64-apple-ios i aarch64-linux-android. Arytmetyka IEEE-754 (+,−,×,÷,sqrt) jest deterministyczna, ale funkcje transcendentalne NIE SĄ: `sin`, `cos`, `tan`, `exp`, `log`, `pow`, `atan2` w Ruście wołają platformowy libm na targetach natywnych (Apple libm ≠ bionic ≠ musl) i wkompilowany libm na wasm32-unknown-unknown. Dotyczy to bezpośrednio: współczynników biquadów RBJ (tan, cos, sinh) w HPF/EQ/de-esserze, jądra sinc w rubato (sin), pYIN (log, exp), K-weightingu BS.1770-4, obliczeń FDN reverb. Dodatkowo: WASM nie ma instrukcji FMA, ARM64 ma — jeśli ktokolwiek napisze SIMD ręcznie albo włączy `relaxed-simd` (którego `f32x4.relaxed_madd` jest W SPECYFIKACJI niedeterministyczny: może być fused albo nie), różnice rosną z każdą próbką rekursji IIR.

  → Trzy twarde reguły w `core-dsp`, egzekwowane clippy lintem: (1) ZAKAZ `std`/`core` float math — wyłącznie crate `libm` (pure Rust, ten sam kod źródłowy na wszystkich targetach, MIT); (2) ZAKAZ target-feature `relaxed-simd`, zakaz jakichkolwiek flag fast-math w LLVM; (3) golden-file porównywane z TOLERANCJĄ, nie bit-exact — kryterium: RMS różnicy < −120 dBFS i max |różnica| < 1e-5 dla bloków 10 s. Osobno: współczynniki filtrów liczyć RAZ przy zmianie parametru i cache'ować, żeby ewentualna różnica w tan() nie propagowała się per-próbkę.

- **§10: 'bindings-ffi/ uniffi → Swift + Kotlin' jako jedyna granica FFI, przy metryce '60 fps, zero dropoutów audio'**

  UniFFI jest realtime-unsafe i nie wolno go wołać z callbacku audio. Generowane scaffoldingi alokują `RustBuffer` (malloc) na każde wywołanie zwracające cokolwiek złożonego, obiekty są za `Arc<Mutex<…>>`, a `catch_unwind` jest w każdej funkcji. Wołanie tego z render callbacku AudioUnit/AVAudioSourceNode albo z `AudioStreamCallback::onAudioReady` w Oboe łamie zasadę no-malloc/no-lock w wątku o priorytecie czasu rzeczywistego → priority inversion, dropouty, w skrajnym przypadku watchdog kill na iOS.

  → DWIE granice FFI, zapisane w §10 jako osobne crate'y: (a) `bindings-ffi-control` — UniFFI, dla EDL, komend, analizy, storage, wszystkiego co nie jest w wątku audio; (b) `bindings-ffi-rt` — ręczny `extern "C"`, kontekst preallokowany raz (`rt_create(cfg) -> *mut RtCtx`), pętla `rt_process(ctx, in_ptr, out_ptr, n_frames)` bez jednej alokacji, `panic = "abort"` dla profilu release, żaden `Mutex` (parametry przekazywane lock-free przez `AtomicU64` / triple buffer). Do tego `#[inline(never)]` na granicy i `assert_no_alloc` w testach debug.

- **§3.2 punkt 2: 'Brak okna 30 s ... Parakeet obsługuje długie wejście (do 24 min z pełną atencją, do 3 h z lokalną)' jako powód wyboru Parakeeta, przy wdrożeniu na Cloudflare Containers standard-4**

  Karta modelu mówi dosłownie: 'audio up to 24 minutes long with full attention (on A100 80GB) or up to 3 hours with local attention'. standard-4 to 4 vCPU / 12 GiB / BEZ GPU (potwierdzone w docs Cloudflare). 24 min przy subsamplingu 8× z 10 ms to 18 000 ramek — macierz atencji 18000² × 4 B to 1,3 GB na głowę na warstwę. Na 12 GiB to niewykonalne. Zostaje local attention, dla którego opublikowane WER 7,31%/7,28% NIE BYŁY MIERZONE (Fleurs i MLS to krótkie, czytane wypowiedzi kilkunastosekundowe, więc mierzono full attention). Do tego §8.2 i tak tnie materiał na segmenty 5-minutowe dla równoległości. Czyli deklarowana przewaga #2 w wybranym wdrożeniu nie występuje — i to jest w porządku, ale nie wolno na niej opierać werdyktu wyboru silnika.

  → Przeformułować uzasadnienie wyboru Parakeeta na dwa realne powody: (1) brak halucynacji na ciszy (transducer), (2) natywne timestampy z predykcji duration. Skreślić 'brak okna 30 s' jako argument. Zapisać jawnie: segmentacja własna na granicach VAD, okna 120–300 s z zakładką 5 s i zszywaniem po najdłuższym wspólnym prefiksie/sufiksie tokenów, local attention jako tryb produkcyjny. Dopisać do korpusu ewaluacyjnego pomiar WER W TRYBIE LOCAL ATTENTION przy realnym rozmiarze okna — bo to jest tryb, który pojedzie na produkcji.

- **§3.1/§8.1: 'Whisper large-v3-turbo ... Workers AI 0,03 USD/h ... podłoga kosztowa, fallback' oraz tabela kosztów 'Razem (ścieżka whisper-turbo) ≈0,47 USD / odcinek'**

  Schemat odpowiedzi `@cf/openai/whisper-large-v3-turbo` na Workers AI to `text` (string), `word_count` (number), `vtt` (string) — CZYLI SEGMENTY W WEBVTT, BEZ word-level timestamps. Jako 'fallback' dla toru, którego cała wartość to granice słów, to nie jest fallback — to inna funkcjonalność. Może służyć wyłącznie jako źródło TEKSTU dla alignera CTC, ale wtedy 'podłoga kosztowa 0,27 USD' jest fikcyjna, bo droga część (aligner XLSR-large 315M na CPU, RTF 0,15–0,5) zostaje w kosztach. Druga rzecz: żądanie do Workers AI idzie przez Workera, a Worker ma limit body 100 MB na Free I NA PRO (potwierdzone; 200 MB dopiero Business). 9 h FLAC 16 kHz mono to ~150–250 MB, więc i tak trzeba ciąć na kawałki i płacić za wywołania.

  → Wykreślić 'whisper-turbo jako tania ścieżka' z tabeli kosztów jako pozycję samodzielną. Zostawić go jako awaryjne ŹRÓDŁO TEKSTU, gdy kontener Parakeeta nie wstaje, z kosztem = 0,27 USD + pełny koszt alignera. Prawdziwa podłoga kosztowa odcinka to koszt alignera, nie ASR.

- **§8.2: 'Workflow "episode-pipeline" (durable, retry)' zwracający WordTrack/SpeakerTrack**

  Cloudflare Workflows ma limit 'Max step result size: 1 MiB'. WordTrack dla 3 h to ~27 000 słów; jako JSON z `start`, `end`, `text`, `score` to 2–5 MB, binarnie z tabelą stringów ~600 kB–1 MB — czyli na granicy albo ponad. Krok, który zwróci WordTrack jako wynik, wywali cały workflow. Drugi limit: CPU time per step 30 s domyślnie (konfigurowalne do 5 min) na Workers Paid — jakiekolwiek przetwarzanie WordTracku w Workerze (scalanie segmentów, deduplikacja zakładek) musi się w tym zmieścić albo iść do kontenera. Trzeci: retention stanu 30 dni.

  → Reguła w spec: KAŻDY krok Workflow zwraca wyłącznie klucz R2 i metadane skalarne (≤1 kB). Żaden artefakt nie przechodzi przez stan Workflow. Scalanie segmentów WordTrack robi kontener, nie Worker. Zapisać limit 1 MiB wprost, bo diagram w §8.2 sugeruje przepływ danych przez Workflow.

- **§16/§11: 'true peak z 4× oversamplingiem' + metryka akceptacji 'true peak ≤ −1,0 dBTP ZAWSZE'**

  Te dwa zdania są ze sobą sprzeczne. BS.1770-4 podaje 4× jako MINIMUM dla materiału 48 kHz, a znane niedoszacowanie estymatora 4× dla sygnałów o energii w górnym paśmie sięga ~0,5 dB (dla treści blisko Nyquista więcej). Czyli plik zmierzony przez Ciebie na −1,0 dBTP realnie może mieć −0,5 dBTP, a mierzony niezależnym narzędziem z 16× oversamplingiem obleje test. Metryka mówi 'ZAWSZE', a metoda tego nie gwarantuje.

  → Albo oversampling 8× minimum (16× dla eksportu, koszt pomijalny bo to jeden przebieg offline), albo limiter celuje w −1,5 dBTP przy pomiarze 4×. Wybrać jedno i zapisać. Rekomendacja: 16× w pomiarze eksportowym, 4× w mierniku RT (tam liczy się latencja, nie ostatnie 0,5 dB).

- **§16: 'normalizacja PER MÓWCA do −20 LUFS short-term PRZED masterem'**

  To jest niedefiniowalne. Short-term LUFS to wartość ZMIENNA W CZASIE (okno przesuwne 3 s wg EBU Tech 3341). 'Znormalizować do −20 LUFS short-term' nie ma jednego wyniku — to może znaczyć jedno przesunięcie gain na ścieżkę (wtedy właściwą miarą jest integrated albo mediana short-term), albo automatyzację gain w czasie (leveler). To dwie zupełnie różne implementacje o różnym brzmieniu: pierwsza zachowuje dynamikę mówcy, druga ją spłaszcza. Napisane tak, jak jest, zostanie zaimplementowane losowo.

  → Wybrać i zapisać: gain statyczny per ścieżka do integrated −20 LUFS liczonego TYLKO na segmentach VAD=mowa tej ścieżki (bo cisza i crosstalk zaniżają integrated), plus opcjonalny leveler jako osobny blok DSP z jawnymi parametrami (cel −20 LUFS-S, zakres ±6 dB, slew 1 dB/s, okno 3 s). Dwa parametry w `MaterialProfile`, nie jeden.

- **§2: 'Widok tekstowy nie ma własnych operacji. Usunięcie zdania w tekście = RemoveRange{start: word[i].start_refined, ...}' przy `Annotation.start: u64 // klatka w źródle`**

  Brakuje najważniejszej funkcji w całej integracji i bez niej widok tekstowy się rozjedzie. Adnotacje są indeksowane KLATKĄ W ŹRÓDLE, a EDL operuje na OSI PROJEKTU. Po `RemoveRange{ripple:true}` odwzorowanie source→timeline przestaje być monotoniczne, a po `MoveClip`/duplikacji klipu jedno źródłowe słowo może występować w projekcie ZERO, JEDEN albo N razy. Spec nie definiuje funkcji `source_frame → [timeline_frame]` ani tego, co widok tekstowy pokazuje, gdy to samo źródłowe słowo jest na osi dwa razy (dubel zdania w tekście?), ani co robi `word[i].start_refined`, gdy słowo zostało PRZECIĘTE przez `SplitClip` w środku. To jest dokładnie ten szew, na którym pęka teza 'drugi widok na ten sam EDL'.

  → Odwrócić kierunek: tekst NIE jest renderowany z WordTrack, tylko z PRZEJŚCIA PO KLIPACH OSI CZASU. Dla każdego klipu w kolejności `timeline_start` bierzesz zakres źródła `[source_in, source_in+len)`, robisz zapytanie interwałowe do WordTrack tego źródła i emitujesz tokeny, które mieszczą się CAŁE w klipie (częściowo przycięte oznaczasz jako 'ucięte' i renderujesz na szaro, nieedytowalne). Wtedy: dubel klipu = dubel zdania w tekście (poprawnie), ripple delete = tekst po prostu krótszy, split w środku słowa = widoczny artefakt zamiast cichego rozjazdu. Dodać do §2 jawną strukturę `TimelineTextIndex` przebudowywaną inkrementalnie po każdej komendzie (tylko dotknięte klipy) i zdefiniować `undo` jako przebudowę tego indeksu, nie osobny stan.

- **§1.1, tabela: 'Kompensacja latencji round-trip, monitoring, miernik RMS/clip — 100% wspólna'**

  Na webie nie ma czego kompensować, bo nie ma z czego policzyć. Web Audio daje `AudioContext.baseLatency` i `outputLatency` — obie dotyczą WYJŚCIA. Nie istnieje żadne API zwracające latencję ścieżki WEJŚCIOWEJ (`MediaTrackSettings.latency` jest advisory, nieimplementowane spójnie i nie obejmuje bufora sprzętowego). Czyli 'kompensacja round-trip' jako warstwa '100% wspólna' jest na webie niewykonalna, a na iOS/Androidzie jest trywialna (`AVAudioSession.inputLatency + outputLatency + ioBufferDuration`; Oboe `getTimestamp()` na obu strumieniach). To nie jest warstwa wspólna, to warstwa z dziurą na jednej z trzech platform.

  → Przenieść kompensację latencji do warstwy platformowej z jednym kontraktem `fn io_latency_frames() -> Option<u64>`. Na webie: `None` domyślnie + jednorazowy KALIBRATOR PĘTLI AKUSTYCZNEJ (odtwórz chirp/MLS przez głośniki, nagraj mikrofonem, GCC-PHAT, zapisz wynik per urządzenie w SQLite). Bez tego overdub na webie będzie systematycznie przesunięty o 20–200 ms zależnie od sprzętu — a to jest funkcja, którą tor śpiewu potrzebuje bardziej niż podcast.

- **Zależność #7 / §12 punkt 5: 'Renderer offline w rdzeniu — obecny jest martwym kodem (lib/multi-track-engine.ts:373), czyli nie istnieje żadna ścieżka eksportu projektu multitrack'**

  To jest po prostu nieprawda i sprawdziłem to w repo. `mixToBuffer` (lib/multi-track-engine.ts:373) jest wołane z `exportMix` (lib/multi-track-engine.ts:423), a `exportMix` jest wołane z UI: components/multi-track-manager.tsx:177. Ścieżka eksportu ISTNIEJE i jest podpięta. Ma realne wady (twardo zaszyte `sampleRate = 44100` mimo capture 48 kHz, wymaga wszystkich buforów w RAM przez `loadAudioSource`/`decodeAudioData` — lib/multi-track-engine.ts:491), ale to jest 'zły renderer', nie 'brak renderera'. Fałszywa diagnoza w liście zależności psuje priorytetyzację: pozycja 5 w §12 jest opisana jako 'nie istnieje', czyli blocker, a realnie jest to refaktor.

  → Poprawić diagnozę na: 'renderer offline istnieje i jest podpięty (multi-track-manager.tsx:177 → exportMix → mixToBuffer), ale renderuje na 44 100 Hz niezależnie od materiału i wymaga pełnego dekodu wszystkich źródeł do RAM (decodeAudioData na całych blobach), więc dla 3 h × 3 ścieżki wywali zakładkę na OOM'. To zmienia charakter zadania i jego ryzyko. Pozostałe cytowane usterki sprawdziłem i SĄ prawdziwe: MediaRecorder tylko webm (hooks/use-audio-recording.ts:17-19), martwy start nagrywania przez odczyt `audioRecorder.isRecording` w tym samym ticku po await (contexts/audio-recorder-context.tsx:62), czas w sekundach float (lib/multi-track-storage.ts:24-29), stałe 1000 próbek waveformu (lib/multi-track-storage.ts:715), brak jakiegokolwiek AudioWorkletu w repo.

- **§1.3 MaterialProfile: 'denoise: DenoiseCfg, // speech: DPDFNet 48k, wet 100%, attn limit −18 dB'**

  Nie istnieje projekt o nazwie 'DPDFNet'. Najbliższy realny to DeepFilterNet (Rikorose/DeepFilterNet) — i jest to JEDYNY blok DSP w całej specyfikacji, dla którego nie podano licencji ani wersji, mimo że denoise mowy jest najbardziej widoczną dla użytkownika funkcją całego filaru. Sprawdziłem: kod DeepFilterNet jest dual MIT/Apache-2.0 (LICENSE-MIT, Copyright 2021 Hendrik Schröter), 4,5k gwiazdek — ale OSTATNI PUSH TO 2024-10-17, czyli 21 miesięcy bez commita. GitHub raportuje spdx NOASSERTION dla repo. Wagi modeli są dystrybuowane osobno i wymagają osobnego sprawdzenia (DNS4/DNS5 mają własne warunki).

  → Nazwać projekt poprawnie, przypiąć konkretny tag (DeepFilterNet3), zarchiwizować wagi lokalnie z SHA-256 tak samo jak dla pyannote, i sprawdzić licencję WAG osobno od licencji kodu. Rozważyć, czy denoiser ma być modelem, czy klasycznym spectral gate + Wienerem w rdzeniu — bo projekt bez commitów od 21 miesięcy, z którego bierzesz wagi ONNX na trzy platformy, jest realnym długiem. Alternatywa z żywym utrzymaniem: `sherpa-onnx` ma wbudowane modele speech-enhancement (GTCRN) pod Apache-2.0 z buildami na iOS/Android/WASM — tym samym runtime, którego i tak używasz.

- **§4: 'MFA jako GOLDEN REFERENCE w CI do pomiaru błędu granic' + metryka 'mediana |błąd granicy| vs MFA polish_mfa ≤20 ms'**

  MFA nie jest prawdą, tylko drugim estymatorem o TYM SAMYM RZĘDZIE BŁĘDU. Publikowany błąd granic MFA na mowie spontanicznej to same 20–30 ms, a próg akceptacji ustawiony jest na ≤20 ms mediany — czyli mierzysz zgodność dwóch narzędzi, których błędy są porównywalne, i nie wiesz, które się myli. Gorzej: MFA na dokładnie tych przypadkach, które są trudne (nazwy własne, anglicyzmy IT, code-switching), wymaga G2P i często odmawia alignmentu albo produkuje śmieć — czyli 'prawda' znika tam, gdzie najbardziej jej potrzebujesz. Metryka jest niefalsyfikowalna w interesującym zakresie.

  → Prawdą muszą być RĘCZNE ANOTACJE GRANIC. 20–30 minut polskiego materiału podcastowego oznaczone w Praacie na poziomie słowa przez fonetyka — to jest ~2 dni pracy jednej osoby i rozwiązuje problem raz na zawsze dla całego projektu. MFA zostaje jako trzeci głos do wykrywania regresji na dużej próbce (gdzie liczy się trend, nie wartość bezwzględna). Do korpusu z zależności #10 dopisać 'granice słów anotowane ręcznie', a MFA przenieść z 'prawda' na 'baseline'.

- **§8.2: 'Wymóg: pierwszy tekst na ekranie ≤60 s od zakończenia nagrania' przy Containers z sleepAfter**

  Budżet 60 s nie zamyka się przy zimnym starcie. Cloudflare podaje 'Container cold starts can often be in the 1-3 second range, but this is dependent on image size and code execution time' — to jest dla małych obrazów. Twój obraz zawiera Parakeet int8 (640 MB wg sherpa-onnx: encoder 622M + decoder 12M + joiner 6,1M), wav2vec2-XLSR int8 (~320 MB) i pyannote. Do 1–3 s cold startu dochodzi inicjalizacja sesji ONNX Runtime dla enkodera 622 MB na 4 vCPU — realnie 10–40 s, zanim policzy się pierwsza ramka. Plus Cloudflare zastrzega: 'no guarantee that any instance will run for any set period of time' i restarty hostów są nieregularne, więc job w połowie może zniknąć.

  → (1) Startować kontener SPEKULATYWNIE w momencie rozpoczęcia nagrywania, nie po jego zakończeniu — masz 3 h zapasu, a koszt idle to 12 GiB × 0,0000025 USD/GiB-s ≈ 0,03 USD/h, czyli nic. (2) Ustawić `sleepAfter` dłużej niż typowy odstęp między odcinkami użytkownika. (3) Wysyłać segmenty do ASR NA BIEŻĄCO w trakcie nagrania (masz progresywny upload do R2, więc materiał już tam jest) — wtedy 'pierwszy tekst' istnieje jeszcze przed końcem nagrania i metryka staje się trywialna. (4) Każdy segment musi być idempotentny i wznawialny, bo host może zniknąć.

**Problemy licencyjne:**

- Wagi modeli embeddingów mówcy: spec deklaruje '3D-Speaker/WeSpeaker (Apache-2.0)'. To jest licencja KODU repozytorium (modelscope/3D-Speaker: Apache-2.0, potwierdzone), a NIE licencja wag. Wagi tych modeli trenowane są na VoxCeleb1/2 i CN-Celeb. Metadane VoxCeleb są pod CC BY-SA 4.0 (potwierdzone na stronie VGG: 'The provided VoxCeleb metadata is licensed under a Creative Commons Attribution-ShareAlike 4.0 International License'), a CC BY-SA jest licencją COPYLEFT — jeśli ktoś uzna wagi za utwór zależny, klauzula ShareAlike zaraża. Sam audio to linki do YouTube'a, więc dochodzi warstwa praw osób trzecich. Spec archiwizuje SHA-256 tylko dla pyannote; embeddingi zostawia bez żadnej weryfikacji. https://www.robots.ox.ac.uk/~vgg/data/voxceleb/vox1.html | https://api.github.com/repos/modelscope/3D-Speaker
- flacenc-rs jest Apache-2.0, NIE 'MIT-Apache' jak podaje spec §6/§10. Do tego 40 gwiazdek i jeden maintainer — dla enkodera FLAC w produkcie komercyjnym na trzy platformy to cienki fundament. Push 2026-06-29, więc żywy, ale plan B (własny enkoder, który spec i tak dopuszcza) powinien być decyzją, nie fallbackiem. https://api.github.com/repos/yotarok/flacenc-rs
- DeepFilterNet (spec nazywa go błędnie 'DPDFNet') to JEDYNY blok DSP w całej specyfikacji bez podanej licencji. Kod jest dual MIT/Apache-2.0 (LICENSE-MIT: Copyright (c) 2021 Hendrik Schröter), ale GitHub API zwraca spdx NOASSERTION, a wagi są dystrybuowane osobno i mają własną historię zbiorów treningowych (DNS Challenge). To wymaga osobnego audytu przed wdrożeniem. https://api.github.com/repos/Rikorose/DeepFilterNet
- CC-BY-4.0 na wagach oznacza atrybucję W PRODUKCIE, na trzech platformach, dla: Parakeet TDT 0.6b v3 (potwierdzone: cc-by-4.0, lastModified 2026-06-29), Canary-1b-v2 (potwierdzone: cc-by-4.0, lastModified 2025-12-03), pyannote community-1, modele MFA, HerBERT-base-cased (potwierdzone: cc-by-4.0). Spec to zauważa, ale nie precyzuje formy: CC-BY-4.0 wymaga podania autora, tytułu, linku do licencji ORAZ oznaczenia zmian (kwantyzacja int8 i eksport ONNX to modyfikacja utworu — trzeba to napisać). Ekran 'O programie' z listą nie wystarczy, jeśli nie ma adnotacji o modyfikacji.
- Dataset Granary (na którym trenowany jest Parakeet v3) jest CC-BY-4.0, ale składa się m.in. z YODAS i 'YouTube Clips (YTC)' — czyli materiału z YouTube'a. To nie jest problem licencyjny dla Ciebie (wagi są CC-BY-4.0), ale spec twierdzi, że dane 'nie są zapożyczone ze zbiorów badawczych o ograniczeniach' — to jest za mocne stwierdzenie przy komponencie YouTube'owym. Zapisać jako ryzyko reputacyjne/regulacyjne, nie jako czysty rachunek. https://huggingface.co/api/datasets/nvidia/Granary
- sdadas/polish-roberta-base-v2 jest Apache-2.0 (potwierdzone, lastModified 2026-01-27) — czyli PERMISYWNIEJSZY niż HerBERT (CC-BY-4.0, wymaga atrybucji). Spec wymienia HerBERT jako pierwszy wybór, a polish-roberta jako 'lub'. Przy równej lub lepszej jakości i braku obowiązku atrybucji kolejność powinna być odwrotna.

**Projekty martwe:**

- DeepFilterNet (spec: 'DPDFNet') — ostatni push 2024-10-17, czyli 21 MIESIĘCY bez commita na dzień 2026-07-26. To jest denoiser mowy, czyli najbardziej widoczna dla użytkownika funkcja DSP w całym filarze podcast. 4,5k gwiazdek, nie zarchiwizowany, ale bez utrzymania. https://api.github.com/repos/Rikorose/DeepFilterNet
- jonatasgrosman/wav2vec2-large-xlsr-53-polish — lastModified 2022-12-14, czyli 3,5 ROKU bez zmian. Trenowany na Common Voice PL 6.0 (mowa CZYTANA, studyjna, zdania z Wikipedii). To jest fundament stopnia 2 alignera, na którym opiera się cała edycja po tekście. Nie jest 'martwy' (2,5 mln pobrań, Apache-2.0), ale jest zamrożony w 2022 i architektura XLSR-53 ma od tego czasu następców. https://huggingface.co/api/models/jonatasgrosman/wav2vec2-large-xlsr-53-polish
- pyannote/segmentation-3.0 — lastModified 2024-05-10, ponad 2 lata. MIT, gated (auto, z formularzem 'Company/university' i 'Website' oraz zastrzeżeniem 'we will occasionnally email you about premium models and paid services'). Gating na modelu, który jest w Twojej ścieżce produkcyjnej fallbacku, to ryzyko dostępu — spec słusznie każe archiwizować z SHA-256, ale ta reguła powinna dotyczyć WSZYSTKICH wag, nie tylko tej. https://huggingface.co/api/models/pyannote/segmentation-3.0
- modelscope/3D-Speaker — push 2025-12-08, 7,5 miesiąca bez commita. Apache-2.0 na kodzie. Nie martwy, ale w zwolnionym tempie.
- allegro/herbert-base-cased — lastModified 2022-06-09, 4 LATA. Jeśli klasyfikator wypełniaczy klasy B ma być fine-tune'em, to na modelu zamrożonym cztery lata temu, podczas gdy sdadas/polish-roberta-base-v2 był aktualizowany 2026-01-27.
- ŻYWE (sprawdzone, bez zastrzeżeń): k2-fsa/sherpa-onnx — push 2026-07-24, Apache-2.0, 13 797 gwiazdek, nie zarchiwizowany. HEnquist/rubato — push 2026-07-18, LICENSE.txt = dual MIT OR Apache-2.0 (GitHub raportuje NOASSERTION tylko dlatego, że plik zawiera oba warianty; to nie jest problem). yotarok/flacenc-rs — push 2026-06-29.

**Luki platformowe:**

- AudioWorkletGlobalScope nie ma TextEncoder/TextDecoder/fetch/importScripts → wygenerowany glue wasm-bindgen rzuca ReferenceError przy pierwszym stringu. Issue rustwasm/wasm-bindgen#2367 otwarte. Dotyczy WSZYSTKICH trzech przeglądarek, nie tylko Safari.
- onnxruntime-web wielowątkowy wymaga crossOriginIsolated (COOP/COEP) — dokumentacja ORT wprost. Decyzja spec o braku COOP/COEP zabija ścieżkę 'Parakeet w onnxruntime-web opt-in na desktopie'.
- sqlite-wasm: kanoniczny VFS 'opfs' wymaga SharedArrayBuffer + COOP/COEP. Bez tego zostaje 'opfs-sahpool', który 'does not support multiple simultaneous connections' i prealokuje/blokuje pulę plików. Jedno połączenie na origin, brak drugiej zakładki.
- Cross-Origin-Embedder-Policy: credentialless — Safari i Safari iOS: version_added FALSE (MDN BCD). Czyli argument spec jest poprawny, ale konsekwencja jest twardsza niż spec przyznaje: na Safari wybór to 'COEP require-corp i naprawa wszystkich embedów' albo 'brak SAB i brak wielowątkowego WASM'.
- navigator.storage.estimate() — Safari i Safari iOS dopiero od wersji 17 (MDN BCD). FileSystemSyncAccessHandle od 15.2. Czyli na iOS 15.2–16.7 masz OPFS bez możliwości sprawdzenia kwoty.
- FileSystemSyncAccessHandle na Safari 15.2–16.3: getSize(), flush(), truncate(), close() ZWRACAJĄ PROMISE. Wersje synchroniczne dopiero od Safari 16.4. Deklaracja 'Safari i iOS 15.2+' w §7.4 jest myląca — realna podłoga to 16.4.
- WebKit liczy kwotę storage od CAŁKOWITEGO rozmiaru dysku ('each origin can store up to around 60% of total disk', 'overall quota ... 80% of disk size'), nie od wolnego miejsca. Bramka miejsca oparta na estimate() przepuści nagranie na pełnym urządzeniu.
- Safari 7-dniowa eksmisja: WebKit dokumentuje ją jako część ITP ('If an origin has no user interaction ... in the last seven days of browser use, its data created from script will be deleted'). ANI MDN, ANI blog WebKit NIE POTWIERDZAJĄ, że navigator.storage.persist() z tego zwalnia — mówią tylko 'might be excluded from eviction if it has active page at the time of eviction, or its storage is in persistent mode', a persistent mode WebKit przyznaje heurystycznie, 'based on heuristics like whether the website is opened as a Home Screen Web App'. Czyli JEDYNY udokumentowany niezawodny sposób to instalacja jako Home Screen Web App — a to trzeba zaproponować użytkownikowi w UI, nie liczyć na persist().
- WebCodecs AudioEncoder: Safari/Safari iOS od 26, Chrome 94, Firefox 130 — ale Firefox Android: version_added FALSE. Czyli fallback WASM jest obowiązkowy nie tylko dla starszego Safari.
- Web Audio nie ma żadnego API latencji WEJŚCIA. baseLatency i outputLatency dotyczą wyjścia. 'Kompensacja latencji round-trip 100% wspólna' (§1.1) jest na webie niewykonalna bez kalibratora pętli akustycznej.
- MediaStreamAudioSourceNode oddaje próbki już przeresamplowane do AudioContext.sampleRate — przeglądarka ukrywa i kompensuje dryf zegara mikrofonu. Na webie nie da się zmierzyć realnego rate'u urządzenia, więc double-ender z korektą dryfu jest funkcją NATYWNĄ.
- Cloudflare Containers: brak GPU (potwierdzone — nigdzie w docs nie ma o tym mowy), max standard-4 = 4 vCPU / 12 GiB / 20 GB, custom max 4 vCPU / 12 GiB / 20 GB, min ratio 3 GiB pamięci na vCPU. Max rozmiar obrazu = dysk instancji (20 GB), łącznie 50 GB rejestru na konto. Cold start '1-3 s' tylko dla małych obrazów. 'No guarantee that any instance will run for any set period of time'.
- Cloudflare Workers: body 100 MB na Free I NA PRO (200 MB dopiero Business, 500 MB Enterprise), 128 MB RAM na isolate — spec ma to poprawnie.
- Cloudflare Workflows: max step result 1 MiB, CPU per step 30 s (do 5 min konfigurowalnie), retention stanu 30 dni, max persisted state 1 GB.
- Workers AI @cf/openai/whisper-large-v3-turbo zwraca text / word_count / vtt — BEZ word-level timestamps.
- iOS Safari: brak nagrywania w tle i przy zablokowanym ekranie (spec to wie i wyciąga poprawny wniosek).

**Potwierdzone niezależnie:**

- Parakeet TDT 0.6b v3: licencja CC-BY-4.0, lastModified 2026-06-29, 25 języków w tym polski, WER PL 7,31% Fleurs / 7,28% MLS, automatyczna interpunkcja i wielkie litery, 'accurate word-level and segment-level timestamps'. Wszystko jak w spec. https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3
- sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8 ISTNIEJE i jest udokumentowany w sherpa-onnx, 25 języków europejskich z polskim, rozmiary: encoder 622M, decoder 12M, joiner 6,1M, razem 640M (spec podaje 652/11,8/6,4 = 670 MB — rząd się zgadza). https://k2-fsa.github.io/sherpa/onnx/pretrained_models/offline-transducer/nemo-transducer-models.html
- k2-fsa/sherpa-onnx: Apache-2.0, push 2026-07-24, 13 797 gwiazdek, nie zarchiwizowany. Żywy projekt.
- jonatasgrosman/wav2vec2-large-xlsr-53-polish: Apache-2.0 — licencja jak deklarowana.
- pyannote/segmentation-3.0: MIT, gated (auto) — licencja jak deklarowana.
- nvidia/canary-1b-v2: CC-BY-4.0 — jak deklarowana.
- allegro/herbert-base-cased: CC-BY-4.0 — jak deklarowana. sdadas/polish-roberta-base-v2: Apache-2.0.
- Granary: CC-BY-4.0.
- Cloudflare Containers standard-4 = 4 vCPU / 12 GiB / 20 GB, BEZ GPU, ceny 0,000020 USD/vCPU-s i 0,0000025 USD/GiB-s — dokładnie jak w spec. Arytmetyka kosztu 8424 s × 0,00011 = 0,93 USD jest poprawna.
- Workers AI @cf/openai/whisper-large-v3-turbo: 0,0005 USD za minutę audio = 0,03 USD/h — jak w spec.
- Worker: 100 MB body na Free/Pro, 128 MB RAM na isolate, 15 min dla Queue consumers / Cron / DO alarms — jak w spec.
- R2 max 10 000 części — jak w spec.
- Descript: Free 60 min, Hobbyist 16 USD / 10 h, Creator 24 USD / 30 h, Business 50 USD / 40 h; Studio Sound, Remove Filler Words i Multitrack Transcription gated na Creator+ — dokładnie jak w spec.
- COEP credentialless brak w Safari — jak w spec.
- Matematyka piramidy peaków: L0=256 → 2 025 000 bucketów × 6 B = 12,15 MB; suma 6 poziomów ≈16,2 MB/ścieżka; pokrycie zoomu 3 h w 1600 px = 324 000 klatek/px, L5 = 1,236 bucketa/px ≥ 1. Wszystko się liczy.
- Rozmiary PCM: i24 mono 48 kHz = 144 000 B/s, 3 h = 1,5552 GB, ×3 ścieżki = 4,666 GB. Poprawne.
- Diagnoza obecnego kodu (sprawdzone lokalnie): MediaRecorder tylko 'audio/webm' — hooks/use-audio-recording.ts:17-19. Martwy start nagrywania audio przez odczyt audioRecorder.isRecording w tym samym renderze po await — contexts/audio-recorder-context.tsx:62. AudioClip w sekundach float — lib/multi-track-storage.ts:24-29. generateWaveformData ze stałym samples=1000 — lib/multi-track-storage.ts:715. Pełny decodeAudioData całego bloba do RAM — lib/multi-track-engine.ts:490-492. Zero AudioWorkletu w całym repo (grep bez wyników).
- Teza główna — 'podcast to profil materiału, nie osobny produkt; granica leży w warstwie ANALIZY, a widok tekstowy to drugi widok na ten sam EDL emitujący te same komendy' — jest merytorycznie słuszna i jest najlepszą częścią tej propozycji. Podobnie: EDL na klatkach u64 zamiast sekund float, command log z odwrotnościami zamiast snapshotów, zakaz contenteditable, oddechy tłumione zamiast usuwanych, klasa B wypełniaczy tylko jako sugestia, zakotwiczenie bulletów show notes w cytacie, adaptacyjny próg ciszy z percentyla zamiast stałego dBFS, ochrona pauzy retorycznej.

**Lepsze alternatywy:**

- zamiast *Dwustopniowy pipeline modelowy: Parakeet TDT (ASR) + osobny wav2vec2-large-xlsr-53-polish 315M / ~320 MB int8 (forced alignment CTC, RTF 0,15)* → **Forced alignment NA WŁASNEJ KRATOWNICY PARAKEETA. Transducer TDT pozwala na wymuszony alignment: przy zadanym ciągu tokenów robisz Viterbi po siatce (t, u) enkodera-jointa, dokładnie tak jak CTC, tylko na modelu, który już policzyłeś. Drugi model dokładasz DOPIERO gdy pomiar na własnym korpusie pokaże medianę >30 ms.** (Cztery konkretne zyski: (1) −320 MB modelu i −RTF 0,15, czyli koszt inferencji odcinka spada o ~40% (z 0,93 do ~0,58 USD) i on-device na Androidzie robi się realny; (2) ZERO rozjazdu tokenizacji — obecnie Parakeet ma tokenizer SentencePiece BPE na 25 języków, a XLSR-PL grafemowy, więc tekst trzeba renormalizować między modelami i każda różnica w interpunkcji/wielkich literach/liczbach psuje alignment; (3) TDT PRZEWIDUJE DURATION tokenu, więc granica jest ostrzejsza niż sama siatka 80 ms — CTC daje 20 ms grid, ale CTC ma udokumentowane systematyczne opóźnienie pików (peaky behaviour), którego spec w ogóle nie uwzględnia, a które może przekroczyć okno refinementu ±40 ms; (4) jeden model do utrzymania, kwantyzacji, walidacji i archiwizacji zamiast dwóch. Spec sam pisze, że fine-tuningu nie robi się przed pomiarem — ta sama zasada dotyczy dokładania drugiego modelu. Jeśli pomiar pokaże, że trzeba, to i tak nie XLSR-53 z grudnia 2022, tylko coś nowszego.)
- zamiast *Korekta dryfu zegarów przez GCC-PHAT na referencyjnym miksie zdalnym przesłanym przez WebRTC + regresja liniowa offsetu* → **Pomiar rate'u urządzenia LOKALNIE, bez sieci: regresja (liczba zarejestrowanych klatek) vs (monotoniczny zegar sprzętowy). iOS: AVAudioTime.hostTime + mach_timebase_info przy każdym buforze wejściowym. Android: AudioStream::getTimestamp() z Oboe (framePosition + nanoseconds). Wynik: ppm urządzenia, zapisywany w AudioSource.clock_ppm co 60 s. Sieć służy tylko do synchronizacji zegarów monotonicznych; offset startowy z GCC-PHAT na oknie 5-10 s z progiem peak-to-sidelobe > 3.** (Ścieżka sieciowa nie może dać deklarowanej dokładności, bo referencyjny miks jest wyjściem NetEq, który nieliniowo wstawia i usuwa próbki (accelerate/preemptive expand/PLC) w reakcji na jitter. To unieważnia model offset(t)=a+b·t, na którym stoi cała korekta: resampling będzie prostował artefakty jitter buffera zamiast dryfu zegara. Pomiar lokalny jest odporny na Opus, AEC, NetEq, utratę pakietów i zmienne opóźnienie, daje dryf z dokładnością <0,5 ppm po 10 minutach (czyli <20 ms na 3 h, dziesięć razy lepiej niż wymóg spec ≤1 ms... a przy ciągłym pomiarze i korekcie odcinkowej ≤1 ms), i — kluczowe — WYKRYWA urządzenia, które zmieniają rate w trakcie sesji (openQuestion #7 spec), bo nachylenie regresji przestaje być stałe. Metoda sieciowa tego nie odróżni od jittera. Bonus: eliminuje potrzebę zapisu i uploadu referencyjnego miksu 16 kHz (345,6 MB na ścieżkę na 3 h).)
- zamiast *MFA polish_mfa jako 'GOLDEN REFERENCE / prawda' w CI, z progiem mediany błędu granic ≤20 ms* → **20-30 minut polskiego materiału podcastowego z granicami słów anotowanymi RĘCZNIE w Praacie przez fonetyka. MFA schodzi do roli trzeciego głosu / detektora regresji na dużej próbce.** (Błąd granic MFA na mowie spontanicznej jest sam rzędu 20-30 ms, czyli równy progowi akceptacji — mierzysz zgodność dwóch estymatorów o porównywalnym błędzie i nie wiesz, który się myli. Gorzej: MFA wymaga słownika wymowy i G2P, więc dokładnie na przypadkach trudnych (nazwiska gości, anglicyzmy IT, code-switching) — czyli tam, gdzie chcesz mierzyć — 'prawda' albo znika, albo jest zmyślona przez G2P. Ręczna anotacja 25 minut to dwa dni pracy jednej osoby i zamyka temat dla całego projektu na trzy platformy. To jest dokładnie ten rodzaj wydatku, który zasada 'wysiłek nie jest wektorem' każe ponieść.)
- zamiast *i24 raw jako domyślny format capture na wszystkich platformach, z FLAC-24 w locie jako awaryjnym fallbackiem 'poniżej progu miejsca'* → **FLAC-24 w locie jako DOMYŚLNY format capture na urządzeniach mobilnych (blocksize 4096, SEEKTABLE co 10 s), i24 raw jako domyślny na desktopie/natywnym macOS/Windows.** (Spec odrzuca FLAC jako roboczy argumentem 'odczyt losowy to czysty seek offset = frame × 3, zero dekodowania'. Ale FLAC ma SEEKTABLE i stałe bloki: przy blocksize 4096 indeks bloku liczysz arytmetycznie, a dekod jednego bloku 24-bit mono to ~30-50 µs — o rząd wielkości poniżej budżetu prefetchu 5,46 s, który spec sam definiuje. Zysk jest za to twardy i rozwiązuje ryzyko, które spec sam wskazuje jako niemożliwe do obejścia (ryzyko #7): 4,666 GB → 2,71 GB, czyli bramka miejsca przechodzi na iPhonie, który spec skazuje na odmowę. Koszt 8-12% CPU jest realny, ale na telefonie nagrywającym JEDNĄ ścieżkę (a nie 12) to jest 8-12% z jednego rdzenia. Odwrócenie domyślnej wartości per platforma kosztuje jedną flagę w MaterialProfile, a ratuje główny scenariusz mobilny. Dodatkowo: i24 packed to niewyrównane 3-bajtowe próbki — jeśli i tak trzeba je rozpakowywać w pętli, argument 'zero dekodowania' jest słabszy niż wygląda, a argument '+25% I/O dla f32' nie ma za sobą żadnego pomiaru.)
- zamiast *Diaryzacja fallback jako pyannote/segmentation-3.0 (segmentacja) + embeddingi 3D-Speaker/WeSpeaker + klastrowanie* → **NVIDIA Sortformer (diar_sortformer_4spk / diar_streaming_sortformer_4spk-v2, CC-BY-4.0) jako podstawowa ścieżka fallbacku end-to-end, bez osobnych embeddingów i bez klastrowania. pyannote+embeddingi zostaje dla >4 mówców.** (Spec sam identyfikuje mowę nakładającą się jako główną słabość diaryzacji ('praktycznie gubiona') i główne źródło błędnej edycji. Pipeline segmentacja+embedding+klastrowanie jest architekturą, która overlapu NIE MODELUJE — przypisuje ramkę jednemu klastrowi. Sortformer jest modelem EEND-owym, który wielomówcowość modeluje wprost w wyjściu. Skoro overlap jest zdefiniowanym problemem, wybór modelu, który go modeluje, jest wyborem merytorycznym, nie wygodnym. Drugi powód jest licencyjny: Sortformer to jedne wagi CC-BY-4.0 od jednego wydawcy, zamiast łańcucha segmentacja (MIT, gated) + embeddingi (Apache-2.0 na kodzie, wagi trenowane na VoxCeleb CC-BY-SA i CN-Celeb) — czyli usuwa cały problem opisany w licenceProblems. Spec wymienia Sortformer wyłącznie jako opcję 'na żywo', co jest niedoszacowaniem.)
- zamiast *Ochrona pauzy retorycznej oparta na interpunkcji z ASR ('jeśli poprzednie zdanie kończy się znakiem końca zdania według ASR, minimum 400 ms')* → **Detekcja końca frazy PROZODYCZNA jako podstawa: opadający kontur F0 na ostatnich 200-300 ms (nachylenie < -150 centów/s), wydłużenie finalne (czas trwania ostatniej sylaby > 1,4 × mediana), spadek intensywności > 6 dB. Interpunkcja ASR jako wzmocnienie, gdy jest dostępna.** (Trzy powody. (1) Twoje własne openQuestion #6 pyta, czy interpunkcja Parakeeta dla polskiego wystarcza — a na mowie spontanicznej modele wytrenowane na Granary (gdzie interpunkcja była RESTAUROWANA pseudo-etykietowaniem) stawiają kropki nierówno. (2) Detektor pYIN i tak musi istnieć dla toru śpiewu, więc to zero dodatkowego DSP — dokładnie ten sam argument, którym spec uzasadnia detektor oddechów. (3) I najważniejsze produktowo: skracanie ciszy przestaje wtedy WYMAGAĆ CHMURY. Użytkownik importuje plik i natychmiast, offline, za darmo, dostaje działający 'remove silence' z ochroną rytmu — zamiast czekać na Workflow, ASR i aligner. To zmienia moment pierwszej wartości z 'kilka minut po uploadzie' na 'natychmiast', i robi to bez kompromisu jakościowego. Spec używa tej zależności jako argumentu, że WordTrack musi być obok obwiedni; realnie jest odwrotnie — im mniej warstwa DSP zależy od chmury, tym lepiej.)
- zamiast *Klasa A wypełniaczy usuwana automatycznie na podstawie samych luk w alignmencie + kryteriów akustycznych* → **Obowiązkowa weryfikacja drugim przebiegiem ASR na wyizolowanym fragmencie luki (padding 200 ms). Token leksykalny w wyniku = delecja ASR, oznacz jako 'brakujące słowo', NIE usuwaj. Plus twardsze kryterium akustyczne: monotoniczność formantów (zmiana F1 i F2 < 10% przez ≥100 ms) zamiast samego centroidu widmowego.** (Luka w alignmencie to suma trzech zdarzeń: wypełniacz, delecja ASR i błąd alignera. Przy realnym WER 15-25% na spontanicznym polskim (bo 7,31% to Fleurs, mowa czytana) delecje są częste, a automat skasuje je BEZ ŚLADU — użytkownik nie zobaczy nic w tekście, bo tego słowa tam nigdy nie było. Weryfikacja drugim przebiegiem kosztuje ułamek sekundy na kandydata (fragmenty 120-800 ms), jest praktycznie darmowa w skali odcinka i zamienia najgroźniejszy tryb awarii (ciche kasowanie treści) na nieszkodliwy (nadmiarowe podświetlenie). Monotoniczność formantów jest silniejszym dyskryminatorem niż centroid, bo każde realne słowo ma tranzycje formantowe, a wypełniacz z definicji ich nie ma.)
- zamiast *Jedna granica FFI: 'bindings-ffi/ uniffi → Swift + Kotlin'* → **Dwie granice: bindings-ffi-control (UniFFI, dla EDL/komend/analizy/storage) i bindings-ffi-rt (ręczny extern "C", kontekst preallokowany, rt_process(ctx, in, out, n) bez alokacji, panic=abort, parametry przez triple buffer/atomiki).** (UniFFI alokuje RustBuffer (malloc) i owija obiekty w Arc<Mutex<>> — wywołanie z render callbacku AVAudioSourceNode albo z Oboe onAudioReady łamie realtime safety i daje priority inversion. Metryka 'zero dropoutów audio' jest z tym niekompatybilna. To nie jest kwestia optymalizacji, tylko poprawności: alokator może zablokować wątek audio na czas nieograniczony. Podział na dwie granice trzeba zadeklarować w §10, bo inaczej pierwsza implementacja pójdzie najkrótszą drogą i problem wyjdzie dopiero na urządzeniu.)
- zamiast *Determinizm DSP przez 'golden-file testy w CI' bez sprecyzowania metody porównania* → **Zakaz std/core float math w core-dsp (clippy lint), wyłącznie crate libm (pure Rust, MIT), zakaz target-feature relaxed-simd, zakaz jakichkolwiek flag fast-math; golden-file z tolerancją: RMS różnicy < -120 dBFS i max |różnica| < 1e-5 na blokach 10 s.** (Bez tego CI będzie oblewał w sposób, którego nikt nie zdiagnozuje. sin/cos/tan/exp/log/pow w Ruście to platformowy libm na aarch64-apple-ios i aarch64-linux-android, a wkompilowany na wasm32 — trzy różne wyniki w ostatnich bitach. Dotyczy to współczynników każdego biquada RBJ (tan, cos), jądra sinc w rubato (sin), pYIN (log/exp), K-weightingu. Do tego WASM nie ma FMA, ARM64 ma, a relaxed-simd jest W SPECYFIKACJI niedeterministyczny. Crate libm daje ten sam kod źródłowy na wszystkich targetach, czyli realnie identyczne bity — to jedyny sposób, żeby zdanie 'port na Swift/Kotlin ma być przenoszeniem, nie pisaniem od nowa' było weryfikowalne.)
- zamiast *Startowanie kontenera z inferencją po zakończeniu nagrania, przy wymogu 'pierwszy tekst ≤60 s'* → **Inferencja W TRAKCIE nagrania: każda ukończona część multipart w R2 (8 MiB ≈ 54 s audio) wyzwala Queue → Workflow → kontener. Kontener startuje spekulatywnie w momencie rozpoczęcia sesji.** (Cold start kontenera z ~1 GB wag ONNX plus inicjalizacja sesji ORT dla enkodera 622 MB na 4 vCPU to realnie 15-45 s, a Cloudflare podaje '1-3 s' tylko dla małych obrazów. Budżet 60 s zjada się na samym starcie. Materiał i tak leci do R2 progresywnie — spec to już ma. Uruchamianie ASR na bieżąco sprawia, że transkrypt jest gotowy w sekundach po naciśnięciu STOP zamiast po minutach, a koszt idle kontenera (12 GiB × 0,0000025 USD/GiB-s ≈ 0,11 USD/h) jest nieistotny wobec 0,93 USD za inferencję odcinka. Dodatkowo Cloudflare zastrzega, że instancja może zniknąć w dowolnym momencie ('no guarantee that any instance will run for any set period of time'), więc rozbicie na segmenty ~54 s jest i tak wymuszone przez idempotencję.)
- zamiast *Widok tekstowy renderowany z WordTrack indeksowanego klatką w źródle* → **Widok tekstowy renderowany z PRZEJŚCIA PO KLIPACH OSI CZASU: dla każdego klipu w kolejności timeline_start → zapytanie interwałowe do WordTrack źródła po [source_in, source_in+len) → tokeny mieszczące się całe w klipie. Tokeny przecięte przez granicę klipu renderowane na szaro jako nieedytowalne. Struktura TimelineTextIndex przebudowywana inkrementalnie tylko dla dotkniętych klipów po każdej komendzie.** (To jest jedyny szew, na którym teza 'drugi widok na ten sam EDL' pęka, i spec go nie definiuje. Po RemoveRange z ripple odwzorowanie source→timeline nie jest monotoniczne, a po duplikacji klipu jedno źródłowe słowo istnieje na osi N razy. Przy renderowaniu z WordTrack nie wiadomo, co pokazać — i implementacja albo zduplikuje zdania, albo je zgubi, albo zdesynchronizuje kursor. Renderowanie z klipów rozwiązuje wszystkie trzy przypadki poprawnie i jest jednocześnie naturalnym miejscem, żeby pokazać użytkownikowi, że coś jest ucięte w środku słowa. Bez tej struktury undo w widoku tekstowym będzie się rozjeżdżać z undo na timeline mimo wspólnego command logu.)

<details><summary>Źródła</summary>

- [ROSVOT: Robust Singing Voice Transcription Serves Synthesis (ACL 2024) — Tabela 1 i 2, metryki COn/COff/COnPOff, ablacja downsamplingu](https://arxiv.org/abs/2405.09940)
- [ROSVOT — repozytorium (kod MIT; wagi bez zadeklarowanej licencji, trenowane na M4Singer)](https://github.com/RickyL-2000/ROSVOT)
- [Listening Like a Judge: A Music-Aware Framework for Automatic Singing Performance Evaluation (MusicJudge, Interspeech 2026) — ρ=0.683, τ=0.499, ablacja treść/muzyka, wagi γ_C/γ_M](https://arxiv.org/abs/2606.26451)
- [BERT-APC: reference-free automatic pitch correction — 'stationary pitch', +10.49 pp RPA nad ROSVOT na rozstrojonych próbkach](https://arxiv.org/abs/2511.20006)
- [A Survey on 30+ Years of Automatic Singing Assessment and Singing Information Processing (2026)](https://arxiv.org/abs/2601.12153)
- [Gender Fairness in Singing Voice Transcription — systematyczna przewaga głosów żeńskich z rozkładu wysokości](https://arxiv.org/abs/2308.02898)
- [Machine Learning Approaches to Vocal Register Classification (AVRA) — chest/head/passaggio, SVM vs CNN](https://arxiv.org/abs/2505.11378)
- [Automatic Estimation of Singing Voice Musical Dynamics — bark-scale bije log-mel; zbiór CC BY-NC-SA (niekomercyjny)](https://arxiv.org/abs/2410.20540)
- [SingMOS-Pro — 7981 klipów z 41 modeli SVS, ≥5 anotatorów; benchmark syntezy, nie wykonania](https://arxiv.org/abs/2510.01812)
- [Matchmaker: Open-source Library for Real-time Piano Score Following (2025) — potwierdza fortepianocentryczność literatury score following](https://arxiv.org/abs/2510.10087)
- [vocadito: solo vocals z adnotacją f0, nut (DWÓCH niezależnych anotatorów) i tekstu, 7 języków — CC BY 4.0](https://zenodo.org/records/5578807)
- [Annotated-VocalSet (Faghih & Timoney 2022) — CC BY 4.0, 10 h, 20 śpiewaków, 17 technik; proweniencja adnotacji do weryfikacji](https://doi.org/10.5281/zenodo.7061507)
- [VocalSet: A Singing Voice Dataset — CC BY 4.0, 10.1 h, 20 zawodowców, techniki rozszerzone](https://zenodo.org/records/1193957)
- [M4Singer — repozytorium; spdx NOASSERTION, licencja 'Other' bez dostępnego tekstu (blokada dla wag ROSVOT)](https://github.com/M4Singer/M4Singer)
- [US7164076B2 — Synchronizing a live musical performance with a reference: kanoniczny branżowy model 'pitch error vs target range'](https://patents.google.com/patent/US7164076B2/en)
- [US20060009979A1 — Vocal Training System with Flexible Performance Evaluation Criteria](https://patents.google.com/patent/US20060009979A1/en)

</details>

---

## Detekcja F0 na pułapie jakości dla głosu śpiewanego — jeden rdzeń, trzy platformy (web / iOS / Android)

**Werdykt:** Odrzucam pYIN jako bazę — nie z powodu kosztu, tylko dlatego, że jest zmierzony jako najgorszy z wiarygodnych kandydatów na śpiewie (harmoniczna średnia 79,5% na vocadito wobec 96,4% RMVPE; voicing recall 0,633, czyli gubi 37% ramek dźwięcznych). Odrzucam też „weź gotowy model": CREPE, RMVPE, PENN/FCNF0++ i SwiftF0 mają wagi wytrenowane m.in. na MDB-stem-synth, który jest CC BY-NC 4.0 — żadnych z tych wag nie wolno wysłać w produkcie komercyjnym, niezależnie od jakości. Rekomenduję JEDNĄ architekturę hybrydową VC-F0: własny, mały model neuronowy (~30-190k parametrów, konwolucje dylatowane po osi harmonicznej w log-częstotliwości) decyduje o OKTAWIE i DŹWIĘCZNOŚCI, klasyczny CMNDF/pYIN z interpolacją paraboliczną daje PRECYZJĘ subcentową, a fixed-lag Viterbi po wspólnej siatce 481 binów × 10 centów scala oba przez log-liniowe pooling i wymusza spójność czasową. Cały tor to jeden ręcznie napisany rdzeń w Rust (bez ONNX Runtime, bez Core ML, bez LiteRT) kompilowany do wasm32 + aarch64-apple-ios + aarch64-linux-android, z własnymi expf/logf zamiast libm — co daje BITOWO IDENTYCZNY wynik na trzech platformach, a nie „porównywalny w granicach tolerancji". Budżet: 275 MFLOP/s łącznie, Tier A (kursor na żywo) 49-73 ms end-to-end, Tier B (zatwierdzony, do scoringu) +120 ms.

### Decyzje

| Pytanie | Rozstrzygnięcie | Dlaczego | Odrzucone |
|---|---|---|---|
| pYIN jako baseline — utrzymać czy odrzucić? | ODRZUCIĆ jako samodzielny estymator. Zachować WYŁĄCZNIE generator kandydatów CMNDF + interpolację paraboliczną jako tor precyzji wewnątrz hybrydy. | Niezależny benchmark 8 zbiorów (lars76/pitch-benchmark, MIT) daje pYIN harmoniczną średnią 79,5% na vocadito (prawdziwy śpiew solo) i 91,2% na MIR-1K, przy RMVPE 96,4% / 96,0% i CREPE 95,6% / 95,7%. Agregat: pYIN RPA 0,878, cents error 62,9, octave error 3,2%, voicing recall 0,633 — najgorsza czułość dźwięczności z całej stawki. W papierze RMVPE (Tab. 3, czyste wokale) pYIN ma RPA 74,71±10,37 na M | Odrzucone: 'pYIN + lepsze parametry'. Powód merytoryczny: błędy pYIN na śpiewie to błędy oktawowe i dziury w voicingu przy głosie breathy/falsetowym, a nie zły dobór progów; to jest ograniczenie informacyjne pojedynczej ramki autokorelacji, nie strojenia. |
| Który pojedynczy estymator jest najlepszy na głosie ŚPIEWANYM? | RMVPE (Apache-2.0 na kodzie). Ale NIE wolno go użyć w produkcie — ani jako wag, ani w czasie rzeczywistym. | Na obu prawdziwych zbiorach śpiewu RMVPE wygrywa: vocadito 96,4%, MIR-1K 96,0% (harmoniczna średnia, benchmark lars76); w papierze własnym RPA 97,27±2,35 na czystych wokalach MIR-1K. Dwa niezależne blokery: (1) BiGRU 256 jednostek jest DWUKIERUNKOWY — model jest z definicji nieprzyczynowy, trenowany na segmentach 2,56 s, więc nie istnieje strumieniowa wersja bez przepisania architektury; (2) okno  | Odrzucone RMVPE jako runtime. Powody: nieprzyczynowy BiGRU (blokuje feedback na żywo), okno 128 ms (niszczy pomiar vibrata), wagi trenowane na MDB-stem-synth (CC BY-NC) + MIR-1K + Cmedia + MIR_ST500 (licencje badawcze). |
| SwiftF0 — czy to jest odpowiedź, jak sugerował wcześniejszy research? | NIE jako gotowy model. TAK jako punkt odniesienia i inspiracja architektoniczna dla własnego treningu. | Dwa twarde fakty przeoczone we wcześniejszym researchu. Po pierwsze: w papierze (sekcja 3.3) 'Stacking five such layers results in a receptive field of 21x21 bins' — 21 ramek po osi CZASU przy hopie 16 ms to ±160 ms lookaheadu na ramkę w pełni skontekstualizowaną. Papier nigdy tego nie omawia, bo ewaluuje offline. Dla feedbacku na żywo to dyskwalifikuje architekturę as-is. Po drugie: koszt strumie | Odrzucone: 'SwiftF0 jako tryb Pro za interfejsem PitchDetector'. Powód: ±160 ms lookaheadu i licencja pochodna wag. Zachowane z SwiftF0: pomysł selekcji pasma częstotliwości, łączna strata klasyfikacja+regresja (CE + L1 w log-f) oraz dekodowanie local expected value — wszystkie trzy wchodzą do naszego treningu. |
| PESTO, CREPE, FCNF0++/PENN, HARMOF0 — co z nimi? | PESTO wykluczyć twardo (LGPL-3.0, zweryfikowane przez GitHub API). CREPE odrzucić. PENN odrzucić jako model. HARMOF0 (MIT) — przejąć POMYSŁ architektoniczny, nie wagi. | PESTO LGPL-3.0 — statyczne linkowanie w aplikacji ze sklepu uniemożliwia spełnienie obowiązku relinkowania; to kwestia polityki, nie jakości. CREPE: 22M parametrów, 1425,9 ms CPU (najwolniejszy w benchmarku), a mimo to agregat cents error 51,4 gorszy niż SwiftF0 35,4 i RMVPE 40,9. PENN/FCNF0++ (MIT) ma najlepszą rozdzielczość binów (1440 binów po 5 centów) i najlepszy wynik na MDB-stem-synth (94,0 | PESTO: LGPL-3.0. CREPE: koszt bez zysku + wagi na danych badawczych. PENN: załamanie w szumie (OA 40,95 przy 10 dB SNR). BasicPitch: RPA 0,307 — zaprojektowany do polifonii, nie do tego zadania. |
| Pojedynczy model czy hybryda/ensemble? | HYBRYDA, z jawnym podziałem ról: neuronowy = oktawa + dźwięczność, klasyczny = precyzja częstotliwości, Viterbi = spójność czasowa. Fuzja przez log-liniowe pooling (iloczyn ekspertów), nie głosowanie. | Podział wynika wprost ze zmierzonych mocnych stron. Sieć neuronowa czyta wzorzec harmoniczny i dlatego ma najniższy octave error (SwiftF0 1,2% wobec pYIN 3,2%) — ale jest skwantowana do binów 20-33 centów, a jej confidence NIE jest prawdopodobieństwem dźwięczności (papier SwiftF0, sekcja 5: 'these scores primarily reflect certainty in pitch class, not voicing'). CMNDF z interpolacją paraboliczną d | Odrzucone głosowanie większościowe kilku estymatorów: traci informację o rozkładzie (dostajesz punkt, nie posterior), nie da się go wpiąć w Viterbiego i skaluje koszt liniowo z liczbą estymatorów bez gwarancji zysku. Odrzucone 'neural jako priory nad kandydatami pYIN': za słabe — priory tylko przeważają, a my potrzebujemy żeby sieć mogła CAŁKOWICIE wykluczyć oktawę. |
| Trenować własny model? | TAK, bezwarunkowo. To nie jest decyzja optymalizacyjna, tylko licencyjna — i dopiero w drugiej kolejności jakościowa. | Zweryfikowane przez Zenodo: MDB-stem-synth jest CC BY-NC 4.0 (nie NC-SA, jak zakładał wcześniejszy research — ale NC tak czy tak). Na MDB-stem-synth trenowane są wagi CREPE, PENN/FCNF0++, RMVPE ORAZ SwiftF0 (papier SwiftF0 sekcja 3.6 wymienia go wprost w zbiorze treningowym). MIR-1K jest zbiorem badawczym i też jest w treningu SwiftF0 i RMVPE. Wniosek: NIE ISTNIEJE gotowy model F0 klasy SOTA, któr | Odrzucone 'fine-tuning gotowych wag na śpiewie': model pochodny dziedziczy licencję danych treningowych wag bazowych — fine-tuning wag zatrutych NC daje wagi zatrute NC. Odrzucone 'użyć tylko na własny użytek, nikt nie sprawdzi': to nie jest argument merytoryczny. |
| Runtime inferencji: ONNX Runtime / Core ML / LiteRT / ExecuTorch? | ŻADEN. Ręcznie napisany kernel inferencyjny w Rust w tym samym rdzeniu co DSP. ONNX wyłącznie jako format wymiany do walidacji w CI, nigdy w produkcie. | Przy modelu 30-190k parametrów każdy runtime kosztuje więcej niż daje. ORT Web to binarka WASM rzędu 3-9 MB przy modelu ~200 KB, nie da się jej załadować do AudioWorkletu (glue oczekuje fetch/URL), a jej kernele używają platformowego libm i wielowątkowych redukcji — czyli z definicji nie da się uzyskać zgodności bitowej z ORT Mobile i Core ML. Core ML na ANE liczy w fp16 (natychmiast łamie równowa | ORT Web/Mobile, Core ML, LiteRT, ExecuTorch odrzucone na podstawie: rozmiaru runtime'u względem modelu, niemożności załadowania do AudioWorkletu, fp16 na ANE/GPU delegate łamiącego równoważność, oraz cichego fallbacku na CPU zmieniającego profil latencji. NIE odrzucone z powodu trudności implementacji. |
| Jak załadować model i runtime do AudioWorkletu, skoro nie ma tam fetch ani DOM? | Nie ładować tam inferencji w ogóle. AudioWorklet robi wyłącznie ring buffer + tor klasyczny (0,44 MFLOP/ramkę). Sieć neuronowa działa w dedykowanym Web Workerze, połączonym z workletem bezpośrednim MessagePortem. | Policzone: jedna ramka neuronowa to ~4 MFLOP; przy realistycznych 2 GFLOP/s w WASM SIMD to ~2 ms, a deadline jednego render quantum (128 próbek @48 kHz) to 2,67 ms. Ramka neuronowa co 20 ms trafiałaby w co 7,5 quantum i zabierała 75% jego budżetu — to gwarantowane, cykliczne przekroczenie deadline'u i słyszalne dropouty. Sam MECHANIZM ładowania jest rozwiązany i udokumentowany (Chrome AudioWorklet | Odrzucone uruchamianie ORT Web w AudioWorklecie: technicznie niewykonalne (glue wymaga fetch) i wydajnościowo błędne. Odrzucone liczenie sieci na main threadzie: obecny kod właśnie na tym poległ (naiwny DFT O(N^2) w rAF, 26,9 ms/ramkę). |
| Budżet latencji — ile ms i jak rozłożone? | Dwa poziomy. Tier A (kursor na żywo): 49-73 ms end-to-end, twardy limit 100 ms. Tier B (zatwierdzony, do scoringu i rysowania śladu za kursorem): +120 ms lagu Viterbiego, razem 169-193 ms. | Feedback jest WZROKOWY, nie słuchowy — więc obowiązującym progiem jest 0,1 s Nielsena ('the limit for having the user feel that the system is reacting instantaneously', za Miller 1968 i Card et al. 1991), a nie 10-20 ms z monitoringu w słuchawkach. Drugi punkt odniesienia: odruch kompensacji F0 na przesunięty pitch feedback (Burnett, Freedland, Larson, Hain, JASA 103(6):3153-61, 1998) działa w ska | Odrzucone jednopoziomowe wyjście: albo kursor by się spóźniał o 120 ms, albo scoring działałby na niezdekodowanych, migoczących wartościach. Odrzucone L>16 ramek: powyżej ~150 ms Viterbi już nie poprawia błędów oktawowych proporcjonalnie do lagu, a ślad zaczyna widocznie 'doganiać' kursor. |
| Voicing detection | Osobna głowa w sieci z odciętym gradientem + fuzja 5 cech w JEDNO skalibrowane P(voiced) + stan unvoiced WEWNĄTRZ Viterbiego. Punkt pracy przesunięty na recall: VR >= 0,97 przy VFA <= 0,15, nie optimum F1. | Zmierzone voicing F1 w benchmarku: SwiftF0 0,885, YAAPT 0,868, Praat 0,857, RMVPE 0,837, CREPE 0,826, pYIN 0,731 (recall 0,633!). Nikt nie przekracza 0,89 — to najsłabsze ogniwo całej dziedziny. Papier SwiftF0 raportuje konkretny mechanizm porażki: dodanie dedykowanego wyjścia voicingu do wspólnego treningu POGORSZYŁO RPA, bo model zaczął deklarować wysoką pewność dźwięczności przy niskiej pewnośc | Odrzucony próg na confidence modelu (SwiftF0 stosuje ~90%) — to nie jest prawdopodobieństwo dźwięczności, tylko koncentracja masy w oknie binów. Odrzucony rmsThreshold jako wartość bezwzględna: rozrzut szumu jałowego między mikrofonem laptopa a kondensatorem USB to 25-30 dB, więc jeden próg nie może być poprawny. |
| Jak zagwarantować identyczne wyniki na wasm / Swift / Kotlin? | Zgodność BITOWA, nie 'w granicach tolerancji'. Jeden rdzeń Rust, jednowątkowy, stała kolejność operacji, własne implementacje expf/logf/log2f zamiast libm. W CI assert bit-exact na trzech targetach. | Trzy runtime'y nigdy nie dadzą zgodności bitowej — to jest właśnie powód, dla którego ich nie używamy. Przy jednym rdzeniu Rust zgodność bitowa jest OSIĄGALNA i prawie darmowa, pod czterema warunkami: (1) Rust nie kontraktuje a*b+c do FMA implicite (w odróżnieniu od C z -ffp-contract=fast), więc to jest za darmo, ale musi być asercją testu; (2) sqrtf jest wymagany przez IEEE-754 jako poprawnie zao | Odrzucona strategia 'porównuj metrykami MIR z progiem regresji zamiast bitowo'. Powód: przy trzech runtime'ach to jedyne, co można zrobić, ale przy jednym rdzeniu to dobrowolna rezygnacja z mocniejszej gwarancji. Metryki MIR zostają jako druga, niezależna bramka. |

### Specyfikacja

> **Uwaga metodologiczna.** Budżet WebSearch był wyczerpany na poziomie sesji (200/200) przed pierwszym zapytaniem. Wszystko poniżej pochodzi z bezpośrednich pobrań źródeł pierwotnych: pełny PDF papieru SwiftF0 (arXiv 2508.18440v1, odczytany stronami 1-14), pełny PDF papieru RMVPE (arXiv 2306.15412v2, strony 1-5), tabele wynikowe repo `lars76/pitch-benchmark` (MIT, ostatni push 2026-07-22), GitHub API dla licencji, Zenodo dla licencji zbiorów. To są twardsze dane niż snippety wyszukiwarki.

---

# 1. SUFIT DOKŁADNOŚCI — gdzie realnie leży i kto do niego podchodzi

## 1.1 Zmierzony stan pola (benchmark niezależny, 8 zbiorów)

`lars76/pitch-benchmark`, MIT, hop 256 @ 22,05 kHz, tolerancja RPA 50 centów, SNR 10-30 dB, gain −6..+6 dB.
Wartości to harmoniczna średnia 6 składowych (RPA, CA, P, R, OA, GEA).

| Algorytm | Bach10Synth | MDBStemSynth | **MIR1K** | NSynth | PTDB | PTDBNoisy | SpeechSynth | **Vocadito** | Średnia |
|---|---|---|---|---|---|---|---|---|---|
| SwiftF0 | 97,5 | 92,0 | **95,0** | 89,3 | 90,4 | 74,0 | 90,7 | **92,6** | **90,2** |
| **RMVPE** | 98,1 | 90,6 | **96,0** | 68,2 | 88,9 | 68,5 | 90,6 | **96,4** | 87,2 |
| CREPE | 98,5 | 90,5 | **95,7** | 80,2 | 79,7 | 53,8 | 88,3 | **95,6** | 85,3 |
| PENN (FCNF0++) | 97,3 | **94,0** | 89,0 | 63,3 | 91,0 | 76,4 | 84,8 | 82,4 | 84,8 |
| Praat | 96,0 | 90,7 | 92,6 | 70,7 | 86,2 | 65,3 | 88,2 | 88,2 | 84,7 |
| SPICE | 95,0 | 89,4 | 92,7 | 68,8 | 77,8 | 55,9 | 87,9 | 92,3 | 82,5 |
| TorchCREPE | 96,7 | 85,1 | 71,4 | 83,8 | 78,3 | 61,2 | 79,7 | 89,0 | 80,6 |
| **pYIN** | 97,5 | 90,3 | **91,2** | 74,3 | 72,1 | 43,2 | 81,4 | **79,5** | 78,7 |
| RAPT | 91,9 | 79,6 | 82,4 | 54,6 | 68,4 | 48,9 | 74,3 | 87,5 | 73,5 |
| SWIPE | 77,8 | 65,6 | 77,1 | 51,4 | 66,6 | 45,0 | 77,1 | 66,6 | 65,9 |
| YAAPT | 58,5 | 39,6 | 82,0 | 6,4 | 69,8 | 51,7 | 83,5 | 88,6 | 60,0 |
| BasicPitch | 23,7 | 12,4 | 36,5 | 77,7 | 23,1 | 12,6 | 61,2 | 17,8 | 33,1 |

**Kolumny pogrubione to jedyne dwa zbiory PRAWDZIWEGO ŚPIEWU.** Ranking na śpiewie różni się od rankingu ogólnego: SwiftF0 wygrywa średnią dzięki NSynth (89,3 vs RMVPE 68,2 — instrumenty) i PTDBNoisy (mowa w szumie). Na śpiewie prowadzi RMVPE.

## 1.2 Metryki bezwzględne (agregat po wszystkich zbiorach)

| Algorytm | RPA | RCA | Cents Error | RMSE (Hz) | **Octave Error** | Gross Error |
|---|---|---|---|---|---|---|
| CREPE | **0,928** | **0,939** | 51,4 | 32,6 | 0,025 | 0,032 |
| RMVPE | 0,921 | 0,932 | 40,9 | 30,1 | 0,020 | 0,022 |
| SwiftF0 | 0,905 | 0,911 | **35,4** | **25,1** | **0,012** | **0,017** |
| Praat | 0,907 | 0,928 | 54,1 | 40,2 | 0,029 | 0,036 |
| PENN | 0,895 | 0,912 | 48,7 | 28,7 | 0,024 | 0,032 |
| pYIN | 0,878 | 0,893 | 62,9 | 41,2 | 0,032 | 0,041 |

**Voicing (agregat):**

| Algorytm | Precision | Recall | F1 |
|---|---|---|---|
| SwiftF0 | 0,903 | 0,871 | **0,885** |
| YAAPT | 0,838 | 0,912 | 0,868 |
| Praat | 0,937 | 0,794 | 0,857 |
| RMVPE | 0,902 | 0,793 | 0,837 |
| CREPE | 0,897 | 0,772 | 0,826 |
| **pYIN** | 0,913 | **0,633** | **0,731** |

**Runtime CPU (5 s audio, desktop):** Praat 2,8 ms · RAPT 3,3 · SwiftF0 16,2 · SPICE 27,5 · PENN 126,6 · pYIN 274,6 · RMVPE 293,3 · TorchCREPE 722,0 · CREPE 1425,9.

## 1.3 Gdzie jest SUFIT — odpowiedź liczbowa

Z papieru RMVPE, Tab. 3, **czyste wokale monofoniczne** (RPA @50 centów, ±SD):

| Zbiór | pYIN | CREPE | HARMOF0 | JDC | RMVPE_vocal |
|---|---|---|---|---|---|
| MDB-stem-synth (GT idealny, resynteza) | 65,83±21,29 | 97,50±4,25 | **97,94±2,49** | 62,61±26,43 | 97,11±2,70 |
| MIR-1K (wokale) | 74,71±10,37 | 95,66±4,07 | 96,07±3,54 | 68,96±10,78 | **97,27±2,35** |

**Sufit na czystym śpiewie monofonicznym: RPA@50c ≈ 97,5-98,0%.**

Trzy niezależne składowe pozostałych 2-2,5%:
1. **Szum anotacji.** GT vocadito pochodzi z pYIN + weryfikacja ręczna; GT MIR-1K z YIN + korekta ręczna. Mierząc się z nimi mierzysz częściowo błąd anotatora. Tylko MDB-stem-synth (resynteza) ma GT dokładny co do próbki — i tam też sufit to 97,94%.
2. **Ramki fizycznie nierozstrzygalne:** ataki przed ustaleniem periodyczności, vocal fry (nieregularne okresy 40-70 Hz), głos breathy przy niskim SPL, przejścia rejestrowe.
3. **Błędy oktawowe:** 1,2% (SwiftF0, najlepszy publiczny) do 3,2% (pYIN).

**Realistyczne cele dla VC-F0 na sustained voiced frames w warunkach domowych:**

| Metryka | Cel | Uzasadnienie |
|---|---|---|
| RPA @50 centów | ≥ 97,0% | poziom RMVPE/HARMOF0 na czystych wokalach |
| RPA @10 centów | ≥ 88% | wymaga interpolacji parabolicznej, nieosiągalne z samego binowania 20-33 c |
| mediana \|Δ\| na tonie podtrzymanym | ≤ 4 centy | CMNDF + parabola; ograniczone szumem estymatora, nie metodą |
| cents RMSE (voiced, po odrzuceniu gross) | ≤ 15 centów | agregat SwiftF0 to 35,4 z gross errors włącznie |
| **octave error rate** | **≤ 0,3%** | dekodowanie sekwencyjne nad fuzją; 4x lepiej niż najlepszy publiczny |
| gross error (>200 c) | ≤ 0,5% | j.w. |
| Voicing Recall | ≥ 0,97 | przy VFA ≤ 0,15 — punkt pracy produktowy, nie optimum F1 |
| P95 długości dropoutu | ≤ 2 ramki (20 ms) | to jest to, co użytkownik faktycznie widzi |
| błąd zakresu vibrata (5 Hz, ±71 c) | ≤ 8% zaniżenia | test okna analizy |

## 1.4 Werdykt Q1

**Najbliżej sufitu podchodzi HYBRYDA, i to nie jest kompromis — to konsekwencja tego, że trzy różne błędy mają trzy różne rozwiązania:**

| Problem | Kto go rozwiązuje | Zmierzony dowód |
|---|---|---|
| błąd oktawowy | sieć neuronowa (wzorzec harmoniczny) | SwiftF0 OA err 1,2% vs pYIN 3,2% |
| precyzja subsemitonowa | CMNDF + interpolacja paraboliczna | binowanie neuronowe to 20-33 c; parabola daje 1-3 c |
| dziury i migotanie w czasie | fixed-lag Viterbi | Boersma 1993: path finder usuwa 100% lokalnych błędów oktawowych nawet gdy stanowią 40% lokalnie najlepszych kandydatów |
| dźwięczność | fuzja 5 cech + stan w Viterbim | nikt w polu nie przekracza F1 0,885 |

Żaden pojedynczy model nie robi wszystkich czterech. Dlatego hybryda, mimo że jest trudniejsza.

---

# 2. WŁASNY MODEL — TAK, i to nie jest opcjonalne

## 2.1 Argument decydujący: licencje wag

Zweryfikowane bezpośrednio (Zenodo, GitHub API, papiery):

| Model | Licencja KODU | Zbiory treningowe wag | Status komercyjny WAG |
|---|---|---|---|
| CREPE | MIT | MDB-stem-synth, MIR-1K, Bach10, RWC-synth, MedleyDB, NSynth | **ZATRUTE** (NC + badawcze) |
| RMVPE | Apache-2.0 | MDB-stem-synth, MIR-1K, Cmedia, MIR_ST500 | **ZATRUTE** |
| PENN / FCNF0++ | MIT | MDB-stem-synth, PTDB-TUG | **ZATRUTE** |
| SwiftF0 | MIT | NSynth, PTDB-TUG, **MIR-1K**, **MDB-STEM-Synth**, SpeechSynth | **ZATRUTE** |
| PESTO | **LGPL-3.0** | — | wykluczone już na poziomie kodu |
| HARMOF0 | MIT | MDB-stem-synth, MIR-1K | **ZATRUTE** |

**MDB-stem-synth: Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** — zweryfikowane na `zenodo.org/records/1481172`. 230 plików mono, 44,1 kHz, GT z resyntezy (Salamon et al. 2017).

Konsekwencja: **nie istnieje gotowy model F0 klasy SOTA, którego wagi wolno wysłać w produkcie komercyjnym.** Fine-tuning nie pomaga — model pochodny dziedziczy ograniczenie. To zamyka dyskusję niezależnie od jakości.

## 2.2 Argument drugi: architektura publicznych modeli nie pasuje do zadania

Policzone na podstawie opisów architektur:

**SwiftF0 (papier, sekcja 3.3):** „All convolutional layers use 5×5 kernels with stride 1 and 'same' padding. Stacking five such layers results in a receptive field of 21×21 bins at the final layer."

```
21 ramek po osi czasu = ±10 ramek × 16 ms hop = ±160 ms LOOKAHEADU
```

Koszt strumieniowy (na każdą nową ramkę, bez downsamplingu po osi 132 binów):

| Warstwa | MMAC/ramkę |
|---|---|
| L1 1→8 | 0,026 |
| L2 8→16 | 0,422 |
| L3 16→32 | 1,690 |
| **L4 32→64** | **6,758** |
| L5 64→1 | 0,211 |
| projekcja 132→200 | 0,026 |
| **razem** | **9,13 MMAC/ramkę = 1,14 GFLOP/s @62,5 fps** |

Mimo 95 842 parametrów. „42× szybciej niż CREPE" jest prawdą — CREPE ma 22M parametrów.

**RMVPE:** BiGRU 256 jednostek → **dwukierunkowy, czyli nieprzyczynowy z definicji**; trenowany na segmentach 2,56 s. Okno mel 2048 @16 kHz = **128 ms** przy vibrato 5-7 Hz (okres 143-200 ms) rozmywa 64-77% cyklu. Hop 320 = 20 ms.

Żaden z nich nie jest zaprojektowany pod strumieniowy feedback na żywo dla śpiewu. Nasz — będzie.

## 2.3 Projekt własnego modelu (VC-F0-Net)

Induktywny bias przejęty z HARMOF0 (MIT): **konwolucje dylatowane po osi harmonicznej w log-częstotliwości.** W skali log-f harmoniczne siedzą pod stałymi offsetami niezależnymi od F0 (h2 = +1200 c, h3 = +1902 c, h4 = +2400 c, h5 = +2786 c, h6 = +3102 c), więc jeden wyuczony szablon harmoniczny działa dla każdej wysokości. To jest właściwy bias dla F0, i to dlatego HARMOF0 przy małym modelu bije RMVPE na MDB-stem-synth (97,94 vs 97,11).

```
WEJŚCIE   16 kHz mono
          STFT: N=1024 Hann (64 ms), hop=320 (20 ms), fs=16000
          |X| → resampling na oś log-f: 20 centów/bin,
                55,0 Hz (A1) … 4186,0 Hz (C8) = 6 oktaw = 7200 c → 360 binów
          log(x + 1e-8), normalizacja per-ramka (odjęcie mediany)

L1  conv2d (7 freq × 1 time), 1→24, dilation 1                        0,060 MMAC
L2  HARMONIC DILATED: 6 równoległych gałęzi 1×1, 24→8,
    dylatacje po osi freq = {0, 60, 95, 120, 139, 155} binów
    (= {0, 1200, 1900, 2400, 2780, 3100} centów)
    concat 48 → pointwise 1×1, 48→24                                  0,829 MMAC
L3  jak L2                                                            0,829 MMAC
L4  depthwise (1 freq × 3 time) na 24 kan. + pointwise 24→24          0,233 MMAC
L5  conv 1×1, 24→1                                                    0,009 MMAC

GŁOWA A (pitch):    projekcja PASMOWA 360 log-f binów → 481 binów pitch
                    (każdy bin wyjściowy czyta okno 41 binów wejściowych)
                    C2 65,41 Hz … C6 1046,50 Hz, 10 centów/bin        0,020 MMAC
GŁOWA B (voicing):  stop_gradient(features L4) → 2×conv1×1 → 1 sigmoid 0,020 MMAC
                                                             ─────────────────
                                                      RAZEM   2,00 MMAC/ramkę
                                              @50 fps = 100 MMAC/s = 0,20 GFLOP/s
```

**Parametry: ~30k** (projekcja pasmowa 481×41 = 19,7k dominuje). **5,7× taniej niż SwiftF0 przy 3,3× lepszej rozdzielczości binów.**

**Twardy budżet lookaheadu: tylko L4 ma kontekst czasowy (3 tapy).** Receptive field po czasie = 3 ramki = **±1 ramka = ±20 ms**. Świadoma decyzja: struktura harmoniczna jest informacją CHWILOWĄ — kontekst czasowy to zadanie Viterbiego, nie sieci. Wariant z L2/L3 też o kontekście 3 (RF 7 ramek = ±60 ms) trenujemy równolegle i porównujemy.

**Strata (wprost z SwiftF0, sekcja 3.4 — ten element jest dobry):**
```
L_CE    = cross-entropy po binach pitch (target: gaussian smoothing σ=25 c, nie one-hot)
L_cents = |log(f̂) − log(f_true)|,  f̂ = Σ_b p̂_b · log(f_b)     ← L1 w log-f
L_voice = BCE na głowie voicingu (gradient NIE wraca do trunku)
L_total = L_CE + 1,0·L_cents + 0,5·L_voice
```

## 2.4 Dane — plan z licencjami

**Czyste komercyjnie (zweryfikowane):**

| Zbiór | Licencja | Rozmiar | Rola |
|---|---|---|---|
| **VocalSet** (Zenodo 1442513) | **CC BY 4.0** | 10,1 h, 20 śpiewaków (9M/11K), techniki rozszerzone | źródło do resyntezy — vibrato, straight tone, belt, breathy, trill, fry |
| **NSynth** (Magenta) | **CC BY 4.0** | 305 979 nut, 16 kHz, dokładne etykiety | odporność oktawowa, negatywy instrumentalne |
| **vocadito** (Zenodo 5578807) | **CC BY 4.0** | 40 fragmentów śpiewu solo | **wyłącznie EWALUACJA** (GT z pYIN — nie trenować na tym) |
| FSD50K | CC BY | — | augmentacja szumem |
| OpenAIR | CC BY | — | IR pomieszczeń |

**Zabronione w treningu:** MDB-stem-synth (CC BY-NC), MIR-1K (badawcza), Cmedia, MIR_ST500, PTDB-TUG. Wolno ich użyć **wyłącznie** do wewnętrznego porównania z liczbami publikowanymi, wynik nigdy nie opuszcza repo. Zapisać w `docs/licensing.md` z SHA-256 każdego pliku.

**Cztery źródła danych treningowych:**

1. **Resynteza VocalSet metodą MDB-stem-synth.** Metoda Salamon et al. 2017 jest opublikowanym artykułem — wolno ją zaimplementować; zabroniony jest tylko *ich zbiór*. Bierzemy VocalSet (CC BY), ekstrahujemy F0 ensemblem (pYIN + CREPE + RMVPE, głosowanie + weryfikacja ręczna rozbieżności), resyntezujemy WORLD (BSD-3-Clause) ze ZNANYM konturem → **GT idealny co do próbki, licencja czysta.** Cel: 10 h → ~40 h po augmentacji tempa/formantów.

2. **Synteza źródło-filtr od zera.** Model glottalny LF + skryptowany kontur F0 + losowe filtry traktu. Pełna kontrola nad: vibrato 4-8 Hz × 10-150 centów, portamento 0,5-8 oktaw/s, scoop na ataku 20-200 ms, jitter 0,2-1,0%, shimmer, przejścia rejestrowe, fry. **GT z konstrukcji.** Cel: 300-500 h. To jest największa dźwignia i jest darmowa.

3. **Własny korpus z elektroglottografem (EGG).** Laryngograf + mikrofon synchronicznie; GT z peak-pickingu na zróżniczkowanym Lx → F0 co do cyklu głośni, dokładniejszy niż jakakolwiek anotacja algorytmiczna. **20 śpiewaków × 30 min = 10 h**, z obowiązkowym pokryciem: bas (E2), sopran (C6), falset męski, głos dziecięcy, głos breathy, fry. Koszt: ~€2k sprzęt + czas studia. To jest jedyna droga do zmierzenia czegokolwiek powyżej sufitu anotacji publicznych zbiorów.

4. **Augmentacja:** IR pomieszczeń, szum FSD50K, SNR 0-30 dB, gain −12..+6 dB, round-trip kodeków (Opus 24/32/64 kbps, AAC 64/128), krzywe EQ mikrofonów telefonów, clipping, offset DC, resampling 44,1↔48.

## 2.5 Koszt treningu

Model 30k parametrów, 500 h audio 16 kHz, segmenty 2,56 s, batch 64, ~100k kroków.
**Pojedynczy przebieg: 6-14 h na jednym RTX 4090.** Sweep 20 konfiguracji: 1-2 tygodnie na jednym GPU albo ~1 doba na ośmiu.

**Compute nie jest wąskim gardłem. Wąskim gardłem jest pipeline syntezy i korpus EGG.**

## 2.6 Oczekiwany zysk

| Metryka | SwiftF0 (najlepszy dostępny) | Cel VC-F0 | Skąd zysk |
|---|---|---|---|
| HM na vocadito | 92,6% | ≥ 96,5% | trening na śpiewie zamiast na mowie |
| cents error (agregat) | 35,4 | ≤ 15 | biny 10 c zamiast 33,1 c + refinacja paraboliczna |
| octave error | 1,2% | ≤ 0,3% | Viterbi nad fuzją log-liniową |
| voicing recall | 0,871 | ≥ 0,97 | osobna głowa + fuzja 5 cech + punkt pracy |
| lookahead | ±160 ms | ±20 ms | ograniczenie kontekstu czasowego by design |
| koszt | 1,14 GFLOP/s | 0,20 GFLOP/s | konwolucje harmoniczne zamiast gęstych 5×5 |
| licencja wag | NC | czysta | własne dane |

---

# 3. TRZY PLATFORMY Z JEDNEGO ŹRÓDŁA

## 3.1 Decyzja: zero runtime'ów ML

```
PyTorch (źródło prawdy treningu)
   │
   ├──► eksport wag: płaski blob f32 + manifest JSON (kształty, kolejność NCHW, SHA-256)
   │
   ├──► eksport ONNX opset 17  ──► TYLKO CI: walidacja forward passu Rust
   │                                 vs onnxruntime na desktopie, tol. 1e-6
   │
   └──► crate  vc-f0-core  (Rust, ręczny kernel inferencyjny)
             │  zależności: realfft 3.x + rustfft 6.x (MIT OR Apache-2.0). Nic więcej.
             │  zawiera: decymacja, STFT, CMNDF, forward CNN, fuzja, Viterbi
             │
             ├─ wasm32-unknown-unknown, -C target-feature=+simd128   →  ~250 KB .wasm   → WEB
             ├─ aarch64-apple-ios / -sim  → staticlib → XCFramework  →  iOS (Swift, C ABI)
             └─ aarch64-linux-android (+ armv7, x86_64)  → .so       →  Android (Kotlin, JNI)
```

**Dlaczego nie ONNX Runtime / Core ML / LiteRT / ExecuTorch — powody merytoryczne:**

| Runtime | Blokada |
|---|---|
| ORT Web | Binarka WASM 3-9 MB przy modelu 250 KB. **Nie da się jej załadować do AudioWorkletu** — glue oczekuje fetch/URL. `proxy: true` jest niekompatybilne z WebGPU (bufor GPU nie jest transferowalny — udokumentowane). Kernele używają platformowego libm → brak zgodności bitowej z ORT Mobile. |
| Core ML | ANE liczy w **fp16** — natychmiast łamie równoważność z buildem webowym i wnosi szum kwantyzacji do posteriora. Kompilacja przy pierwszym uruchomieniu ze zmienną latencją. Nieobsługiwane operatory **po cichu spadają na CPU** (udokumentowane w docs CoreML EP: „unsupported operators automatically fall back to the CPU execution provider") → profil latencji zmienia się między wersjami iOS. |
| LiteRT + NNAPI | NNAPI wycofywane na rzecz delegatów per-vendor; ta sama `.tflite` daje inną numerykę na innym SoC. GPU delegate: fp16, ten sam problem. |
| ExecuTorch | Druga ścieżka eksportu i kolejny runtime do przypięcia. Przy 30k parametrów nie kupuje niczego. |

Przy **2,0 MMAC/ramkę i 50 fps = 0,2 GFLOP/s** akcelerator NPU nie ma czego przyspieszać. Ręczny kernel jest trudniejszy i lepszy na każdej osi: rozmiar, latencja startu, determinizm, ładowalność do worklet, brak licencji trzeciej strony.

## 3.2 Zgodność BITOWA — jak, konkretnie

Nie „w granicach tolerancji". Bitowa. Pięć warunków:

1. **Jeden wątek, stała kolejność operacji.** Bez rayon, bez autowektoryzowanych redukcji z reasocjacją. Sumy akumulowane w zadeklarowanej kolejności.
2. **Brak kontrakcji FMA.** Rust nie kontraktuje `a*b+c` do `fma` implicite (inaczej niż C z `-ffp-contract=fast`). Darmowe, ale zabezpieczone testem porównującym wynik z jawnie rozwiniętym `mul` + `add`.
3. **Zero libm.** `expf`, `logf`, `log2f`, `tanhf` — własne aproksymacje wielomianowe w crate. **To jest najbardziej prawdopodobne źródło rozjazdu:** libm Apple, bionic Androida i musl Emscriptena dają różne ostatnie bity. `sqrtf` zostaje — IEEE-754 wymaga poprawnego zaokrąglenia, więc jest identyczny wszędzie sprzętowo.
4. **WASM ma wymuszoną semantykę IEEE-754 dla f32** (poza payloadami NaN, których nigdy nie produkujemy) → wasm32 zgadza się z aarch64 z definicji.
5. **Brak `wasm-opt` z przebiegami fast-math.**

**Bramka CI:** ten sam korpus 200 plików uruchamiany na `wasm32` (wasmtime), `aarch64-apple-ios` (symulator na runnerze macOS) i `aarch64-linux-android` (emulator + realne urządzenie). Assert **bitowej równości wszystkich f32 wyjściowych**. Rozbieżność = BŁĄD, nie tolerancja.

## 3.3 Web: rozwiązanie problemu AudioWorkletu

**Problem A — jak wnieść kod do worklet, skoro nie ma fetch.** Rozwiązany, wzorzec udokumentowany przez Chrome („Pattern B: Cross-Thread Module Transfer"):

```js
// ── main thread ──────────────────────────────────────────────
const wasmBytes = await fetch('/vc-f0-core.wasm').then(r => r.arrayBuffer());
const wasmModule = await WebAssembly.compile(wasmBytes);   // WebAssembly.Module
const weights   = await fetch('/vc-f0-w.bin').then(r => r.arrayBuffer());

const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
await ctx.audioWorklet.addModule('/vc-f0-worklet.js');     // ~3 KB, zero fetch w środku

// WebAssembly.Module JEST strukturalnie klonowalny → przechodzi przez processorOptions
const node = new AudioWorkletNode(ctx, 'vc-f0', {
  numberOfInputs: 1, numberOfOutputs: 0,
  processorOptions: { wasmModule, weights }
});

// ── wewnątrz AudioWorkletProcessor ───────────────────────────
constructor(options) {
  super();
  // synchroniczna instancjacja ze SKOMPILOWANEGO modułu — dozwolona, bez fetch
  this.inst = new WebAssembly.Instance(options.processorOptions.wasmModule, imports);
}
```

**Problem B — gdzie liczyć sieć. NIE w worklecie.** Policzone:

```
1 ramka neuronowa ≈ 4 MFLOP
przy realistycznych 2 GFLOP/s (WASM SIMD, mobile)  →  ~2 ms
deadline jednego render quantum (128 próbek @48 kHz) →  2,67 ms
ramka neuronowa co 20 ms trafia w co 7,5 quantum i zabiera 75% jego budżetu
```
To jest gwarantowane, cykliczne przekroczenie deadline'u. **Sieć idzie do dedykowanego Web Workera.**

**Podział pracy w webie:**

| Wątek | Zadanie | Koszt |
|---|---|---|
| AudioWorklet (audio thread) | zapis do ring buffera + CMNDF/kandydaci @100 Hz | 44 MFLOP/s — bezpiecznie RT-safe |
| dedykowany Worker | STFT + CNN @50 Hz + fuzja + Viterbi @100 Hz | 208 MFLOP/s |
| main thread | tylko rysowanie z ring buffera wyników | ~0 |

**Kanał worklet ↔ worker z pominięciem main threada:**
```js
const ch = new MessageChannel();
worker.postMessage({ port: ch.port1 }, [ch.port1]);
node.port.postMessage({ port: ch.port2 }, [ch.port2]);   // AudioWorkletNode.port OBSŁUGUJE transfer
```
> Pułapka: `processorOptions` jest serializowane przez **StructuredSerialize bez transferu** — MessagePortu tamtędy nie przepchniesz. Musi iść przez `node.port.postMessage(msg, [port])`.

**Transport próbek — dwie ścieżki za jednym interfejsem, wybór w runtime:**
- `self.crossOriginIsolated === true` → **SharedArrayBuffer**, lock-free SPSC ring, `Atomics.store/load` release/acquire na indeksie zapisu. Zero kopii, zero alokacji.
- w przeciwnym razie → **pula 8 pre-alokowanych `ArrayBuffer(1280*4)`** transferowanych tam i z powrotem (transfer = przeniesienie wskaźnika, też zero kopii). Koszt: 1-3 ms na hop.

Nagłówki dla SAB w `_headers` static exportu:
```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```
Jest to bezpieczne **dopiero po usunięciu iframe'a YouTube z karaoke** — a ten i tak jest już zakwalifikowany jako ślepy zaułek dla wersji natywnej. To zależność kolejnościowa, nie blokada: ścieżka bez COOP/COEP działa i kosztuje 1-3 ms.

## 3.4 iOS

```
AVAudioSession: .playAndRecord, mode .measurement  (wyłącza przetwarzanie systemowe)
                setPreferredSampleRate(48000)
                setPreferredIOBufferDuration(0.005)      // 240 ramek
AVAudioEngine → inputNode → render callback → ring buffer (lock-free, bez alokacji)
                ↓
DispatchQueue(qos: .userInteractive) → vc_f0_process() z XCFramework (C ABI)
```
Obowiązkowo: obsługa `AVAudioSession.interruptionNotification` **oraz** `routeChangeNotification`; przy zmianie sample rate reset stanu rdzenia (`vc_f0_reset`). Bluetooth HFP zbija rate do 16 kHz — wykryć i zareagować, nie ignorować.

## 3.5 Android

```
Oboe (Apache-2.0) → AAudio
  PerformanceMode::LowLatency, SharingMode::Exclusive
  setSampleRate(48000), setFormat(Float), setChannelCount(1)
  bufferSizeInFrames = 2 × burstSize
Audio callback → wyłącznie zapis do ring buffera
HandlerThread, Process.setThreadPriority(THREAD_PRIORITY_AUDIO) → vc_f0_process() przez JNI
```
Targety: `aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-linux-android` (emulator).

---

# 4. BUDŻET LATENCJI

## 4.1 Jaki próg obowiązuje i dlaczego

Feedback intonacyjny jest **wzrokowy**, nie słuchowy. Obowiązuje więc **próg 0,1 s Nielsena** — „about the limit for having the user feel that the system is reacting instantaneously" (nngroup, za Miller 1968, *Proc. AFIPS FJCC* 33:267-277 i Card, Robertson, Mackinlay 1991, *Proc. ACM CHI'91*:181-188), a **nie** 10-20 ms z monitoringu w słuchawkach (to osobny tor, jeśli kiedykolwiek wrócimy głosem do ucha).

Drugi punkt odniesienia: odruch kompensacji F0 na przesunięty pitch feedback — **Burnett, Freedland, Larson, Hain, *J Acoust Soc Am* 103(6):3153-61, 1998** (bodźce 100-500 ms, przesunięcia 25-300 centów). Ludzka pętla kontroli wysokości działa w skali setek ms; feedback wolniejszy niż ~150 ms użytkownik odbiera jako „po fakcie", nie jako sterowanie.

## 4.2 Rozkład budżetu

| Składnik | ms | Uwaga |
|---|---|---|
| bufor wejściowy urządzenia (256 @48 kHz) | 5,3 | iOS 5,0 · Android AAudio 5-10 · Web 5,3-10,7 |
| render quantum AudioWorklet (128) | 2,7 | stały, niekonfigurowalny |
| centrowanie okna klasycznego (2048/2 @48k) | 21,3 | nieusuwalne — cena rozdzielczości |
| kwantyzacja hopu (średnio pół hopu 480) | 5,0 | |
| decymacja /3, FIR 96 tapów | 0 | opóźnienie grupowe 0,99 ms **kompensowane dokładnie** |
| handoff worklet → worker | 1,0-3,0 | SAB ~1 ms · transfer ~3 ms |
| Viterbi Tier A (argmax kolumny forward) | 0 | bez backtrace |
| postMessage → rAF → kompozytor | 16,7-33,0 | |
| **TIER A (kursor na żywo)** | **49-73** | **< 100 ms ✓** |
| Viterbi Tier B, L = 12 ramek × 10 ms | +120 | |
| **TIER B (zatwierdzony)** | **169-193** | |

**Staleness informacji neuronowej w Tier A: 20 ms** (RF czasowy ±1 ramka przy hopie 20 ms) **+ 10,7 ms** (dłuższe centrowanie okna 1024 @16 kHz = 32,0 ms wobec 21,3 ms toru klasycznego) **= ~31 ms.** Nieistotne, bo oktawa i dźwięczność są wielkościami wolnozmiennymi; gdy jednak nastąpi szybki skok interwałowy, Tier B koryguje narysowany ślad 120 ms później.

## 4.3 Czy fixed-lag Viterbi mieści się w budżecie

```
stany:        481 voiced (10 c/bin, C2…C6) + 1 unvoiced = 482
okno przejść: ±40 binów = ±400 centów = 81 przejść
koszt:        482 × 81 = 39 042 operacji add-compare = 0,078 MFLOP/ramkę
              @100 fps = 7,8 MFLOP/s
```

**To jest 2,8% całkowitego budżetu DSP (275 MFLOP/s) i 3,9% kosztu sieci.**

**Viterbi jest obliczeniowo darmowy. Jedyną jego ceną jest lag, i płacimy go wyłącznie na Tier B.** Nie istnieje merytoryczny powód, żeby go nie zrobić porządnie. Wybrane L = 12 ramek = 120 ms; poniżej ~10 ramek Viterbi przestaje realnie poprawiać błędy oktawowe (za mało kontekstu), powyżej ~16 ramek ślad zaczyna widocznie „doganiać" kursor.

## 4.4 Całkowity budżet obliczeniowy

| Blok | MFLOP/s |
|---|---|
| STFT 1024-pkt @50 fps | 1,5 |
| CNN @50 fps | 200,0 |
| CMNDF (3× realFFT 4096) @100 fps | 44,0 |
| Viterbi @100 fps | 7,8 |
| fuzja, refinacja, voicing | ~22 |
| **RAZEM** | **~275 MFLOP/s** |

Na rdzeniu ARM z NEON (~15 GFLOP/s f32): **1,8% jednego rdzenia.** W przeglądarce mobilnej na WASM SIMD (~2 GFLOP/s zachowawczo): **~14% jednego rdzenia**, w Workerze, poza main threadem.

---

# 5. VOICING NA PUŁAPIE

## 5.1 Dlaczego to jest osobny, trudniejszy problem

Najlepszy publiczny wynik to F1 = 0,885 (SwiftF0). Nikt nie przekracza 0,89. Dla porównania RPA sięga 0,93. **Dźwięczność jest zmierzalnie słabszym ogniwem niż sama wysokość** — i jest dokładnie tym, co użytkownik widzi jako „aplikacja mnie nie słyszy".

Papier SwiftF0 (sekcja 5) raportuje konkretny mechanizm porażki, który trzeba obejść:
> „since we train only on voiced frames, the resulting scores primarily reflect certainty in pitch class, not voicing. We experimented with adding a dedicated voicing output, but this reduced performance. When the model was allowed to express high voicing confidence despite low pitch certainty, it produced more incorrect pitch predictions, lowering RPA."

## 5.2 Projekt

**(a) Osobna głowa z odciętym gradientem.** Głowa voicingu czyta `stop_gradient(features_L4)`. To usuwa dokładnie ten konflikt, który zgłasza SwiftF0: głowa nie może zdegradować trunku, bo gradient do niego nie wraca. Trening na WSZYSTKICH ramkach (dźwięcznych i bezdźwięcznych), przy czym głowa pitch jest maskowana na ramkach bezdźwięcznych.

**(b) Pięć cech → jedno SKALIBROWANE P(voiced).** Regresja logistyczna dopasowana na dev secie (nie ręczne progi):

| Cecha | Definicja | Rola |
|---|---|---|
| `a` | aperiodyczność = CMNDF d′(τ*) | fizyczna miara periodyczności |
| `hnr` | 10·log10(r/(1−r)), r = znormalizowana autokorelacja w okresie | odporna na poziom |
| `nn` | logit głowy voicingu | uczona, kontekstowa |
| `rms_rel` | RMS w dBFS **minus adaptacyjne dno szumu** | nigdy próg bezwzględny |
| `flat` | spectral flatness 300-3400 Hz | rozróżnia szum od tonu |

**(c) Kalibracja per-urządzenie na starcie sesji** (obowiązkowa, 5 s):
```
0,0-2,0 s  cisza  → ramki 20 ms/hop 10 ms → 200 pomiarów RMS
                    N = mediana; widmo szumu w 8 pasmach
                    odrzuć i powtórz, jeśli p90 − mediana > 10 dB
2,0-5,0 s  głos   → poziom odniesienia S
próg bazowy = N + 12 dB, histereza 4 dB
potem: ciągła aktualizacja N trackerem percentylowym (p10 z okna 10 s)
```
Powód: rozrzut szumu jałowego między mikrofonem laptopa z AGC (−50…−40 dBFS) a kondensatorem USB (−70 dBFS) to 25-30 dB. Obecne `rmsThreshold = 0.001` nie może być poprawne na żadnym z nich.

**(d) Stan unvoiced WEWNĄTRZ Viterbiego, nie bramka przed nim.**
```
koszt przełączenia voiced ↔ unvoiced  = 0,14 nata   (Praat voicedUnvoicedCost)
koszt unvoiced → unvoiced             = 0           (Boersma 1993, równ. 27)
emisja stanu unvoiced                 = log(1 − P(voiced))
```
To daje histerezę wynikającą z modelu, a nie doklejoną. Zerowe ryzyko migotania.

**(e) Trzeci stan: `voiced-irregular` (fry / creak).** Wykrywany po: periodyczność obecna, ale odchylenie standardowe okresu cyklu-do-cyklu > 15%, F0 40-90 Hz. **Nie wymuszamy tam F0.** Fry to poprawna technika wokalna, nie błąd — więc nie może obniżać wyniku ani rysować linii. Bez tego stanu metryka karałaby prawidłowe zachowanie.

**(f) Punkt pracy: recall, nie F1.** Cel **VR ≥ 0,97 przy VFA ≤ 0,15.** Uzasadnienie produktowe: fałszywe „unvoiced" przerywa rysowaną linię (użytkownik czyta: awaria), fałszywe „voiced" produkuje krótki artefakt, który Viterbi i tak wygładzi. Koszty są asymetryczne, więc próg nie może siedzieć w optimum F1.

**(g) Metryka, która naprawdę odpowiada odczuciu: rozkład długości serii dropoutów.** Raportować P50/P95/max liczby kolejnych fałszywie bezdźwięcznych ramek. Cel: **P95 ≤ 2 ramki (20 ms).** Sam VR tego nie pokazuje — 3% rozrzucone równomiernie jest niewidoczne, 3% skupione w seriach po 15 ramek to katastrofa.

---

# 6. WALIDACJA

## 6.1 Zbiory i ich status prawny

| Zbiór | Licencja | Trening | Ewaluacja | Publikacja wyników |
|---|---|---|---|---|
| własny korpus EGG | nasza | ✅ | ✅ **zbiór złoty** | ✅ |
| synteza źródło-filtr | nasza | ✅ | ✅ (GT idealny) | ✅ |
| resynteza VocalSet (WORLD) | CC BY 4.0 | ✅ | ✅ | ✅ z atrybucją |
| NSynth | CC BY 4.0 | ✅ | ✅ | ✅ z atrybucją |
| **vocadito** | **CC BY 4.0** | ❌ (GT z pYIN) | ✅ | ✅ z atrybucją |
| MDB-stem-synth | **CC BY-NC 4.0** | ❌ | tylko wewnętrznie | ❌ |
| MIR-1K, Cmedia, MIR_ST500, PTDB-TUG | badawcze | ❌ | tylko wewnętrznie | ❌ |

## 6.2 Metryki — raportować wszystkie, nigdy jednej liczby

**Podstawowe (mir_eval, MIT — kanoniczne definicje):**
`RPA @50c / @25c / @10c` · `RCA @50c` · **`luka RPA−RCA`** (proxy błędu oktawowego, cel < 0,5 pp) · mediana \|Δ\|, MAD, RMSE w centach na ramkach dźwięcznych · octave error rate (\|Δ\| ∈ 1200±100 lub 1902±100) · gross error (\|Δ\| > 200 c) · VR / VFA / **rozkład długości dropoutów**.

**Specyficzne dla ŚPIEWU — tych nie ma w żadnym publicznym benchmarku i dlatego trzeba je zbudować:**

| Test | Bodziec | Kryterium |
|---|---|---|
| **wierność vibrata** | wstrzyknięte 4/5/6/7/8 Hz × {25, 50, 100, 150} c | błąd tempa ≤ 0,15 Hz; stosunek zmierzonego zakresu do zadanego 0,92-1,05 |
| **śledzenie glissanda** | E2→C6 przy 1, 2, 4 oktawy/s | opóźnienie ≤ 2 ramki, max \|Δ\| ≤ 40 c |
| **skok interwałowy** | skoki 5, 7, 12, 19 półtonów | ramek do ustalenia w ±25 c: ≤ 3 (Tier B) |
| **atak** | onset po ciszy | czas od onsetu GT do pierwszej estymaty w ±50 c ≤ 60 ms |
| **portamento na ataku** | scoop 20-200 ms | NIE liczony jako błąd intonacji |
| **fry / creak** | fonacja nieregularna | sklasyfikowany jako `voiced-irregular`, nie wymuszone F0 |

> Test wierności vibrata jest zaprojektowany tak, żeby wykryć dokładnie tę wadę, która dyskwalifikuje RMVPE (okno 128 ms). Jeśli nasze okno 42,67 ms jest za długie, ten test to pokaże.

**Rygor statystyczny:** bootstrap 95% CI **po nagraniach, nie po ramkach** — ramki są silnie autoskorelowane, CI po ramkach jest fałszywie wąskie.

**Bramka regresji w CI:** RPA@50c nie spada > 0,5 pp wobec baseline; octave error nie rośnie > 0,1 pp; P95 dropoutu nie rośnie.

## 6.3 Panel percepcyjny

Metryki nie mierzą zaufania. Dwa niezależne testy:

1. **Zgodność z ekspertem.** 3 nauczycieli śpiewu + 12 śpiewaków. 200 zaśpiewanych nut, każda oznaczona przez nauczycieli jako czysta / za nisko / za wysoko. Mierzymy **Cohena κ między werdyktem aplikacji a większością nauczycieli. Cel κ ≥ 0,80.**
2. **A/B na żywo, wymuszony wybór.** Ten sam UI, dwa trackery (stary / VC-F0), n ≥ 20 użytkowników. To wyłapuje rzeczy niewidoczne w metrykach: drżenie rysowanej linii, dropouty, „doganianie" śladu przez kursor.

## 6.4 Równoważność międzyplatformowa

**Poziom 1 — bitowy (główna bramka).** Korpus 200 plików × pełne wyjście (f0, confidence, voiced, per-ramka) na `wasm32` / `aarch64-apple-ios` / `aarch64-linux-android`. **Assert bitowej równości f32.** Rozbieżność = błąd.

**Poziom 2 — vs referencja.** Forward pass Rust vs `onnxruntime` na desktopie z tymi samymi wagami, tolerancja 1e-6. Wyłapuje błędy implementacyjne kernela, których poziom 1 nie widzi (bo wszystkie trzy platformy byłyby zgodnie błędne).

**Poziom 3 — golden files vs librosa.pyin** (ISC) dla samego toru CMNDF, jako niezależna weryfikacja matematyki.

## 6.5 Kolejność prac

| # | Krok | Bramka wyjścia |
|---|---|---|
| 0 | Harness ewaluacyjny + korpus syntetyczny + **pomiar OBECNEGO detektora** | znamy punkt wyjścia liczbowo |
| 1 | `vc-f0-core` w Rust: decymacja, CMNDF, kandydaci, Viterbi, voicing — **bez sieci** | bije obecny kod i pYIN na naszym korpusie; bitowa równość na 3 targetach |
| 2 | Integracja web: AudioWorklet + Worker + oba transporty | Tier A < 100 ms zmierzone na 3 urządzeniach |
| 3 | Pipeline syntezy + resynteza VocalSet | 300+ h z GT idealnym |
| 4 | Korpus EGG | 10 h, pokrycie E2-C6 + falset + dziecięce |
| 5 | Trening VC-F0-Net + sweep | ≥ 96,5% HM na vocadito, ≤ 0,3% octave error |
| 6 | Fuzja + kalibracja wag `w_n`/`w_c` | brak regresji cents RMSE |
| 7 | iOS (XCFramework) + Android (JNI) | bitowa równość, panel percepcyjny κ ≥ 0,80 |

---

# 7. PEŁNA SPECYFIKACJA VC-F0

## 7.1 Front-end

| Parametr | Wartość |
|---|---|
| sample rate | **48 000 Hz** wymuszone; weryfikacja `getSettings()` / `AVAudioSession.sampleRate` |
| fallback 44,1 kHz | polyphase FIR 160/147, 64 tapy/fazę, stopband −80 dB |
| constraints | `echoCancellation:false, noiseSuppression:false, autoGainControl:false, channelCount:1` — **sprawdzić czy honorowane** |
| ring buffer | 4 s = 192 000 próbek f32, SPSC lock-free |
| DC block | 1-biegunowy HP @ 20 Hz |
| tor 16 kHz | decymacja /3, FIR 96 tapów, cutoff 7,2 kHz (0,9·Nyquist), stopband ≥ 80 dB, faza liniowa, opóźnienie grupowe 0,99 ms **kompensowane** |

## 7.2 Tor klasyczny — 100 Hz (hop 480 @48 kHz = 10,0 ms)

| Parametr | Wartość |
|---|---|
| okno | 2048 próbek = 42,67 ms, **PROSTOKĄTNE** (YIN wymaga braku taperingu) |
| CMNDF | przez FFT: `d(τ) = r(0) + r_τ(0) − 2r(τ)`, realFFT 4096 (realfft 3.x / rustfft 6.x, MIT OR Apache-2.0) |
| zakres τ | [40, 686] próbek = **70 Hz … 1200 Hz** |
| kandydaci | **WSZYSTKIE** lokalne minima d′ < 0,60, max K = 16. **Zero filtrowania harmonicznego, zero odrzucania.** |
| + kandydaci wymuszeni | dla top-3: dodaj 2f i f/2 z ich **własnym zmierzonym** d′ |
| interpolacja | paraboliczna wokół każdego minimum → precyzja 1-3 centy |
| prawdopodobieństwa | integracja pYIN po 100 progach 0,01…1,00, prior **Beta(2, 18)**, `no_trough_prob = 0,01` |
| cechy pomocnicze | d′(τ*), HNR, RMS dBFS, spectral flatness |

## 7.3 Tor neuronowy — 50 Hz (hop 320 @16 kHz = 20,0 ms)

| Parametr | Wartość |
|---|---|
| STFT | N = 1024 Hann (64 ms), hop 320, fs 16 000 |
| oś wejściowa | log-f, **20 centów/bin**, 55,0 Hz (A1) … 4186,0 Hz (C8) = **360 binów** |
| normalizacja | `log(x + 1e-8)`, odjęcie mediany per-ramka |
| architektura | L1 conv(7f × 1t) 1→24 · L2/L3 harmonic-dilated 6 gałęzi {0, 60, 95, 120, 139, 155} binów · L4 depthwise(1f × 3t) + pointwise · L5 1×1 → 1 |
| **RF czasowy** | **3 ramki = ±1 ramka = ±20 ms lookaheadu** (twardy budżet) |
| głowa pitch | projekcja pasmowa (okno 41 binów) → **481 binów, 10 centów/bin, C2 65,41 Hz … C6 1046,50 Hz** |
| głowa voicing | `stop_gradient(L4)` → 2× conv1×1 → sigmoid |
| parametry | ~30 000 |
| koszt | **2,00 MMAC/ramkę = 0,20 GFLOP/s @50 fps** |
| strata | `L_CE(σ=25c smoothing) + 1,0·L_cents(L1 w log-f) + 0,5·L_voice` |

## 7.4 Fuzja

```
Siatka wspólna: 481 binów voiced (10 centów) + 1 unvoiced = 482 stany
                identyczna z wyjściem sieci → ZERO resamplingu

p_klas(b)  = Σ_kandydaci  P_pyin(k) · N(b | cent(f_k), σ=8 centów)
             normalizacja + podłoga jednostajna ε = 0,02

p_neur(b)  = softmax głowy pitch, zero-order hold przez 2 ramki klasyczne
             (ZOH, nie interpolacja — zachowuje przyczynowość)

log p_fused(b) = w_n · log p_neur(b) + w_c · log p_klas(b) − log Z
                 w_n = 0,65   w_c = 0,35   (start; kalibracja grid search
                 na dev secie: minimalizuj octave error pod warunkiem
                 braku regresji cents RMSE)

P(voiced) = σ( β₀ + β₁·a + β₂·hnr + β₃·nn + β₄·rms_rel + β₅·flat )
            współczynniki z regresji logistycznej na dev secie
```

**Dlaczego log-liniowe pooling (iloczyn), a nie mieszanka (suma):** iloczyn realizuje koniunkcję — bin musi być wiarygodny dla OBU ekspertów. Subharmoniczne minimum YIN przy 2T zostaje wyzerowane przez brak masy sieci w tym miejscu. Mieszanka dałaby alternatywę i zachowała ten kandydat.

## 7.5 Fixed-lag Viterbi

| Parametr | Wartość |
|---|---|
| stany | 481 voiced + 1 unvoiced = 482 |
| przejście V→V | `log P = −\|Δcentów\| / 60` (Laplace σ = 60 c), mix z podłogą 0,02 |
| okno przejść | ±40 binów = **±400 centów/ramkę = 400 półtonów/s** (przepuszcza każdy realny interwał i glissando) |
| **kara oktawowa asymetryczna** | +0,35 nata dla Δ = −1200±60 c (charakterystyczny poślizg subharmoniczny YIN); +0,20 nata dla Δ = +1200±60 c |
| kara kwintowa | +0,15 nata dla Δ = −1902±60 c |
| przełączenie V↔U | 0,14 nata (Praat `voicedUnvoicedCost`) |
| U→U | 0 (Boersma 1993, równ. 27) |
| **lag L** | **12 ramek = 120 ms** |
| koszt | 0,078 MFLOP/ramkę = **7,8 MFLOP/s** |
| Tier A | argmax kolumny forward DP, bez backtrace, 0 ms dodatkowo |
| Tier B | backtrace zamrożony na ramce t−12 |

## 7.6 Refinacja subbinowa (mechanizm kluczowy)

```
Viterbi zwraca bin b* (kwant 10 centów).
Wybierz kandydata klasycznego k najbliższego środkowi b*.
f0_final = f_k  (częstotliwość z interpolacji parabolicznej, precyzja 1-3 centy)
Jeśli brak kandydata w ±25 centów od środka b* → użyj środka binu
     i oznacz ramkę flagą `neural_only`.
```

**To jest miejsce, w którym hybryda daje coś, czego nie daje żaden pojedynczy model: decyzja o oktawie pochodzi z fuzji odpornej na błędy oktawowe, a wartość liczbowa z estymatora o rozdzielczości subcentowej.**

## 7.7 Wyjście API rdzenia

```rust
#[repr(C)]
pub struct F0Frame {
    pub t_sec:        f64,   // znacznik czasu ze środka okna analizy
    pub f0_hz:        f32,   // 0.0 gdy bezdźwięczna
    pub cents:        f32,   // 1200·log2(f0/55.0), NaN gdy bezdźwięczna
    pub p_voiced:     f32,   // SKALIBROWANE prawdopodobieństwo [0,1]
    pub state:        u8,    // 0=unvoiced 1=voiced 2=voiced_irregular(fry)
    pub tier:         u8,    // 0=A (live) 1=B (committed)
    pub confidence:   f32,   // margines log-prawdop. top1 vs top2 po fuzji
    pub aperiodicity: f32,   // d'(τ*)
    pub rms_db:       f32,
}

extern "C" {
    fn vc_f0_create(sample_rate: u32, weights: *const u8, len: usize) -> *mut VcF0;
    fn vc_f0_push(h: *mut VcF0, pcm: *const f32, n: usize) -> u32;   // → liczba gotowych ramek
    fn vc_f0_pop(h: *mut VcF0, out: *mut F0Frame, cap: usize) -> u32;
    fn vc_f0_reset(h: *mut VcF0);                                    // przy zmianie rate/przerwaniu
    fn vc_f0_calibrate_noise(h: *mut VcF0, pcm: *const f32, n: usize);
    fn vc_f0_destroy(h: *mut VcF0);
}
```

Ta sama sygnatura na trzech platformach: `wasm-bindgen` dla weba, C ABI + XCFramework dla iOS, JNI dla Androida. **Jedna implementacja, trzy opakowania.**

## 7.8 Zamknięte decyzje licencyjne (do `docs/licensing.md`)

| Element | Licencja | Status |
|---|---|---|
| `realfft` 3.x, `rustfft` 6.x | MIT OR Apache-2.0 | ✅ |
| algorytm pYIN (Mauch & Dixon 2014) | opublikowany, wolny | ✅ implementacja własna |
| path finder Praata (Boersma 1993) | opublikowany, wolny | ✅ implementacja własna |
| dylatowane konwolucje harmoniczne (HARMOF0) | MIT, pomysł architektoniczny | ✅ wagi NIE używane |
| WORLD (do resyntezy) | BSD-3-Clause | ✅ |
| VocalSet, NSynth, vocadito, FSD50K | CC BY 4.0 | ✅ z atrybucją |
| `mir_eval` (do CI) | MIT | ✅ |
| `librosa` (golden tests) | ISC | ✅ dev-only |
| PESTO | **LGPL-3.0** | ❌ zakaz |
| MDB-stem-synth | **CC BY-NC 4.0** | ❌ zakaz treningu |
| MIR-1K, Cmedia, MIR_ST500, PTDB-TUG | badawcze | ❌ zakaz treningu |
| wagi CREPE / RMVPE / PENN / SwiftF0 / HARMOF0 | pochodne NC/badawczych | ❌ zakaz dystrybucji |

Dla każdego pliku wag i każdego zbioru: SHA-256 + URL źródła + data pobrania w repo.

---

# 8. CO Z OBECNEGO KODU ZOSTAJE

| Element | Los |
|---|---|
| `noteToFrequency` (`lib/pitch-detector.ts`) | **przenieść do rdzenia Rust** — jedyna konwersja w repo bez błędu oktawowego |
| Normalizacja CMND zgodna z równ. (8) de Cheveigné & Kawahara 2002 | **przenieść do Rust** — matematyka jest poprawna |
| Stałe okno całkowania W = MAX_PERIOD | **zachować** — to poprawna forma YIN |
| Interpolacja paraboliczna | **zachować i rozszerzyć** na wszystkie kandydaty |
| Architektura wielohipotezowa trybu Pro | **koncepcja poprawna** — zachować, wymienić cechy i wagi |
| `lib/fft-analyzer.ts` (naiwny DFT O(N²), 26,9 ms/ramkę) | **usunąć** — zastąpione realfft |
| Filtry antyharmoniczne (`lib/pitch-detector.ts:114`) | **usunąć** — martwy kod, a idea jest szkodliwa (kasuje kandydata, którego dekoder potrzebuje) |
| Blokada skoku > 5 półtonów (`:156`) | **usunąć** — zatrzaskuje błąd oktawowy i gubi legalne interwały |
| Globalny mutowalny stan modułu (`:42`) | **usunąć** — stan w handle rdzenia |
| `AnalyserNode` + `requestAnimationFrame` | **usunąć** — zastąpione AudioWorklet + ring buffer |
| `harmonicScore` (`lib/pitch-detector-pro.ts:98`) | **usunąć** — zastąpione posteriorem sieci |
| `WEIGHTS` z 50% stałych (`:47`) | **usunąć** — zastąpione kalibrowaną fuzją |

### Zależności

- Rdzeń Rust `vc-f0-core` jako osobny crate w workspace — musi powstać PRZED czymkolwiek innym, bo jest jednocześnie zależnością planu iOS/Android dla całej platformy (potwierdzona usterka: 'Brak granicy domenowej: nie istnieje warstwa core ani żaden port')
- Offline'owy harness ewaluacyjny uruchamialny w Node/CLI bez przeglądarki + korpus golden — MUSI istnieć przed pierwszą zmianą w detektorze, inaczej nie da się stwierdzić czy cokolwiek się poprawiło. Obecnie repo ma zero testów i niedziałający lint
- Przepisanie warstwy capture na AudioWorklet + lock-free ring buffer. Obecny tor (AnalyserNode + rAF, `hooks/use-audio-recorder.ts:40`) nie daje deterministycznego hopu i gubi próbki — bez tego żadne parametry ramkowania nie są dotrzymywalne
- Usunięcie iframe'a YouTube z karaoke (`app/record/karaoke/page.tsx:55`) PRZED włączeniem COOP/COEP: require-corp. Bez tego traci się ścieżkę SharedArrayBuffer (fallback transferowalny działa, kosztuje 1-3 ms)
- Konfiguracja nagłówków COOP/COEP w `_headers` hostingu statycznego — poziom hostingu, nie next.config.ts
- Pipeline syntezy głosu śpiewanego (LF glottal source + filtr traktu + skryptowany kontur F0) — to jest największa dźwignia jakości i jednocześnie największy nakład; bez niego nie ma 300-500 h danych z idealnym GT
- Implementacja resyntezy WORLD (BSD-3) do wytworzenia GT dla VocalSet — odtworzenie metody Salamon et al. 2017 na źródle CC BY zamiast na zbiorze CC BY-NC
- Sprzęt EGG/laryngograf (~€2k) + rekrutacja 20 śpiewaków z pokryciem bas→sopran, falset męski, głos dziecięcy — bez tego korpusu nie da się zmierzyć niczego powyżej sufitu anotacji zbiorów publicznych
- GPU do treningu: 1× RTX 4090 wystarcza (6-14 h na przebieg); 8× skraca sweep 20 konfiguracji z 2 tygodni do doby
- CI z trzema targetami kompilacji: wasm32 (wasmtime), aarch64-apple-ios (runner macOS), aarch64-linux-android (emulator + farma urządzeń) — asercja bitowej równości
- Panel percepcyjny: 3 nauczycieli śpiewu + 12 śpiewaków do pomiaru Cohena κ i A/B na żywo
- `docs/licensing.md` z SHA-256 i URL każdego artefaktu — warunek wstępny jakiegokolwiek treningu, żeby nie zatruć wag danymi NC

### Ryzyka

- NAJWIĘKSZE: własne wagi na starcie będą GORSZE niż RMVPE, dopóki pipeline syntezy i korpus EGG nie dojrzeją. Mitigacja: tor klasyczny (CMNDF + Viterbi + fuzja voicingu) musi być w pełni funkcjonalny SAM, bez sieci — i już on bije obecny kod oraz goły pYIN. Sieć wchodzi jako addytywne ulepszenie za flagą z telemetrią A/B, nigdy jako warunek działania
- Log-liniowe pooling (iloczyn ekspertów) jest z natury nadmiernie pewne siebie — iloczyn dwóch ostrych rozkładów daje rozkład skrajnie ostry, co przy zgodnym błędzie obu ekspertów daje pewny błąd. Wymagana kalibracja temperaturowa OBU ekspertów przed poolingiem (temperature scaling na dev secie), inaczej confidence będzie bezużyteczny jako sygnał dla UI
- Okno 42,67 ms toru klasycznego jest kompromisem: krótsze poprawia vibrato, ale traci rozdzielczość na E2 (82,4 Hz = okres 12,1 ms, więc 42,67 ms mieści 3,5 okresu — to absolutne minimum dla YIN). Dla basów przy 70 Hz mamy 3,0 okresu. Poniżej ~3 okresów CMNDF się rozpada. Ryzyko: głosy basowe będą miały mierzalnie gorszą precyzję niż soprany i trzeba to zaraportować, a nie ukryć
- Vocal fry i creak łamią założenie periodyczności całkowicie. Jeśli nie wprowadzimy osobnego stanu `voiced-irregular`, metryka będzie karać poprawne zachowanie systemu, a użytkownik zobaczy chaotyczną linię przy technice, którą stosuje świadomie
- Głos dziecięcy i falset męski to znany słaby punkt WSZYSTKICH modeli (trenowanych na dorosłych) — a to jest realna grupa użytkowników aplikacji do śpiewania. Ryzyko: model wytrenowany na VocalSet (20 dorosłych) przeniesie ten bias. Wymaga jawnego pokrycia w korpusie EGG i osobnego raportowania metryk per typ głosu
- Projekcja z siatki 20 centów (wejście log-f) na siatkę 10 centów (wyjście pitch) to upsampling — istnieje ryzyko artefaktów aliasingowych w posteriorze, które udają subsemitonową precyzję, której nie ma. Konieczna weryfikacja: podać czysty sinus i sprawdzić kształt posteriora, nie tylko argmax
- Zgodność bitowa jest osiągalna, ale krucha: jedno nieuważne użycie `f32::exp()` zamiast własnej aproksymacji, jedna autowektoryzowana redukcja z reasocjacją albo jedna flaga fast-math w wasm-opt ją łamie. Wymaga bramki CI od pierwszego commita, nie dołożonej później
- AudioWorklet + Worker + MessagePort to trzy konteksty wykonania z osobnymi cyklami życia. Na iOS Safari AudioContext ma niestandardowy stan 'interrupted' (rozmowa, Siri, alarm) — kod obsługujący tylko 'suspended'/'running' zostawi martwy graf bez żadnego sygnału. Musi być obsłużone od początku, bo obecny kod na tym już poległ
- Lag Tier B = 120 ms oznacza, że narysowany ślad koryguje się ZA kursorem. Jeśli korekta jest widoczna (skok linii), użytkownik odczyta to jako błąd aplikacji, nawet gdy korekta jest poprawna. Do rozstrzygnięcia panelem percepcyjnym; możliwa mitigacja: rysować Tier A jako linię cienką/półprzezroczystą, Tier B jako pełną
- Publiczne zbiory śpiewu mają GT wyprowadzony z pYIN/YIN + korekta ręczna. Mierząc się z nimi mierzymy częściowo błąd anotatora, więc powyżej ~97-98% RPA na vocadito i MIR-1K NIE DA SIĘ wiarygodnie stwierdzić poprawy. Korpus EGG jest jedynym wyjściem — bez niego górna część planu jest niemierzalna
- Prawne: choć unikamy wag zatrutych NC, sam FAKT porównywania się z nimi w dokumentacji wymaga ostrożności. Wyniki na MDB-stem-synth i MIR-1K zostają wewnętrzne i nie trafiają do materiałów produktowych

### Do rozstrzygnięcia pomiarem

- Realne wagi fuzji w_n / w_c — czy 0,65 / 0,35 jest bliskie optimum, i czy log-liniowe pooling ze stałymi wagami przegrywa z małym wyuczonym MLP fuzyjnym (2 warstwy nad konkatenacją obu posteriorów). Rozstrzyga tylko grid search + A/B na dev secie
- Czy lookahead neuronowy jest w ogóle potrzebny. Wytrenować wariant ŚCIŚLE PRZYCZYNOWY (kernel czasowy 1 wszędzie, RF = 1 ramka) i porównać RPA/octave error z wariantem ±1 i ±3 ramki. Jeśli różnica < 0,3 pp — brać przyczynowy i odzyskać 20-60 ms
- Czy podział hopów 10 ms (klasyczny) / 20 ms (neuronowy) jest właściwy, czy lepszy jest 5 / 10 ms. Wyższa częstość poprawia pomiar vibrata i ataków, ale podwaja koszt. Rozstrzyga pomiar wierności vibrata + profilowanie na realnym telefonie
- Czy L = 12 ramek Viterbiego jest zauważalne w rysowanym śladzie. Zmierzyć testem A/B z L ∈ {6, 12, 20} przy tej samej wizualizacji; być może optymalne L zależy od tego, czy użytkownik trzyma nutę czy wykonuje pasaż (adaptacyjny lag)
- Faktyczny koszt kernela WASM SIMD na przeglądarce mobilnej średniej klasy (Android, Chrome). Szacunek 2 GFLOP/s jest zachowawczy, ale realne może być 0,8-1,2 GFLOP/s na słabszym SoC — wtedy 275 MFLOP/s to 25-35% rdzenia i trzeba zejść z hopem neuronowym do 30-40 ms
- Czy ścieżka SharedArrayBuffer mierzalnie bije pulę buforów transferowalnych. Jeśli różnica to < 1 ms, można w ogóle nie włączać COOP/COEP i uniknąć całej klasy problemów z zasobami cross-origin
- Czy okno 42,67 ms wystarcza dla basów przy 70 Hz (3,0 okresu). Alternatywa: adaptacyjna długość okna zależna od bieżącej estymaty F0 (dłuższe okno dla niskich, krótsze dla wysokich) — poprawia bas, ale łamie stałą latencję i komplikuje Viterbiego. Rozstrzyga pomiar na korpusie EGG z basami
- Czy asymetryczne kary oktawowe (0,35 w dół / 0,20 w górę / 0,15 kwinta) mają właściwe wartości — powinny wyjść z EMPIRYCZNEGO rozkładu błędów naszego fusora na dev secie, nie z założenia. Policzyć macierz pomyłek Δ i wyprowadzić kary jako −log częstości
- Czy głowa voicingu ze stop-gradientem faktycznie usuwa problem raportowany przez SwiftF0, czy tylko go przesuwa. Wytrenować trzy warianty (bez głowy / głowa z gradientem / głowa ze stop-gradient) i porównać RPA oraz voicing F1 jednocześnie
- Jak wykrywać i klasyfikować przejścia rejestrowe (piersiowy → głowowy → falset). To osobny wymiar dydaktyczny, którego żaden estymator F0 nie dostarcza — czy da się go wyprowadzić z tych samych cech (HNR, aperiodyczność, kształt widma), czy wymaga osobnej głowy
- Czy resynteza WORLD zachowuje wystarczająco realistyczne cechy akustyczne, żeby model trenowany na niej generalizował na prawdziwe nagrania. Papier SwiftF0 raportuje wprost: 'training exclusively on [synthetic] yields suboptimal results... incorporating datasets with algorithmically-derived labels improves generalization'. Trzeba zmierzyć proporcję syntetyk/realne
- Jaki jest realny rozkład błędów na mikrofonach telefonów (nie laptopów) — cała literatura mierzy na nagraniach studyjnych. Potrzebny własny pomiar na 10+ modelach telefonów, bo to jest główna platforma docelowa

### Adwersarz techniczny

**Nie zadziała tak, jak opisano:**

- **"Cały tor to jeden ręcznie napisany rdzeń w Rust... zależności: realfft 3.x + rustfft 6.x. Nic więcej" ORAZ "BITOWO IDENTYCZNY wynik na trzech platformach" ORAZ "Zero libm. expf, logf, log2f, tanhf — własne aproksymacje".**

  Te trzy zdania wykluczają się wzajemnie i to jest sprawdzalne w źródle. (1) rustfft liczy twiddle factory WEWNĄTRZ crate'a przez libm: w src/twiddles.rs jest dosłownie `let angle = constant * index as f64; Complex { re: T::from_f64(angle.cos()).unwrap(), im: T::from_f64(angle.sin()).unwrap() }`. `f64::sin`/`f64::cos` NIE są objęte wymogiem poprawnego zaokrąglenia IEEE-754 i dają różne ostatnie bity w Apple libm, w bionic Androida i w crate'cie `libm` (port musl) używanym na wasm32-unknown-unknown. Lista do podmiany w propozycji obejmuje expf/logf/log2f/tanhf — NIE obejmuje sinf/cosf, a i tak podmiana własnych funkcji nie pomoże, bo rozjazd siedzi w kodzie rustfft, nie w waszym. Rozjazd wchodzi w PIERWSZYM bloku toru (STFT i CMNDF), przed czymkolwiek co planujecie kontrolować. (2) rustfft ma `default = ["avx", "sse", "neon"]` (Cargo.toml) i README mówi wprost: "Simply plan a FFT using the FftPlanner on a machine that supports the `avx` and `fma` CPU features, and RustFFT will automatically switch to faster AVX-accelerated algorithms" — czyli na x86_64 (wasz runner CI i poziom 2 walidacji vs onnxruntime) rustfft używa FMA, na aarch64 NEON, na wasm32 ścieżki skalarnej (wasm_simd NIE jest default). Trzy różne kernele = trzy różne zaokrąglenia. (3) Propozycja wymienia `armv7-linux-androideabi` jako target produkcyjny. rustfft nie ma ścieżki NEON dla 32-bitowego ARM — czyli ta sama aplikacja na dwóch telefonach Android (aarch64 vs armv7) daje różne bity. Bramka CI "assert bitowej równości, rozbieżność = BŁĄD" zapali się na pierwszym uruchomieniu i nie da się jej zaspokoić bez wyrzucenia rustfft. realfft tylko przekazuje flagi dalej: "RealFFT has the same set of cargo feature flags as RustFFT".

  → Wyrzucić rustfft/realfft z toru produkcyjnego. Napisać własny split-radix / radix-4 real-FFT o stałym harmonogramie, z tablicą twiddle PRECOMPUTOWANĄ offline i wysyłaną jako dane (ten sam blob co wagi, z SHA-256) — zero sin/cos w runtime, zero runtime dispatch. rustfft zostaje jako dev-dependency do golden testów. Dodatkowo: `-C target-feature=-relaxed-simd` (relaxed-simd ma jawnie niedeterministyczny `f32x4.relaxed_madd`) i zakaz `default-features` na czymkolwiek z runtime CPU detection.

- **"275 MFLOP/s łącznie... W przeglądarce mobilnej na WASM SIMD (~2 GFLOP/s zachowawczo): ~14% jednego rdzenia" przy jednoczesnym "Jeden wątek, stała kolejność operacji. Bez rayon, bez autowektoryzowanych redukcji z reasocjacją."**

  Budżet wydajnościowy jest policzony jak dla SIMD, a ograniczenia determinizmu SIMD zabraniają — w formie w jakiej są zapisane. Splot i CMNDF to redukcje (iloczyny skalarne). Redukcja SIMD jest bitowo równa skalarnej TYLKO jeśli ręcznie zafiksujesz układ lane'ów i kolejność scalania, identycznie na `core::arch::wasm32::v128` i na `core::arch::aarch64::float32x4_t`. Autowektoryzacja LLVM tego nie gwarantuje: dobiera szerokość wektora i obsługę ogona per target, więc wasm32+simd128 i aarch64+neon dostaną różne harmonogramy. Propozycja mówi "jeden ręcznie napisany rdzeń" i zakazuje autowektoryzowanych redukcji — z tego wynika, że albo (a) kernele są skalarne i wtedy 2 GFLOP/s to fikcja (realnie 0,3-0,8 GFLOP/s dla f32 skalarnie w WASM z bounds-checkingiem, czyli 275 MFLOP/s = 35-90% rdzenia, nie 14%), albo (b) kernele są pisane DWA RAZY, z ręcznymi intrinsics per target i asercją zgodności lane-by-lane — czego dokument nigdzie nie mówi, a to jest właśnie miejsce, w którym gwarancja bitowa cicho pęka. Do tego rustfft (44 MFLOP/s z budżetu) w ogóle nie może uczestniczyć w tej dyscyplinie, patrz punkt wyżej.

  → Rozstrzygnąć jawnie i wpisać do specyfikacji: kernele SIMD pisane ręcznie osobno dla `wasm32::v128` i `aarch64::float32x4_t`, z IDENTYCZNYM harmonogramem lane'ów (akumulacja 4 lane'y, scalanie w ustalonej kolejności 0+1, 2+3, potem suma), plus test jednostkowy skalar-vs-SIMD na każdym targecie. Przebudżetować realistycznie: podać oddzielnie liczby dla ścieżki skalarnej i SIMD i zmierzyć na realnym Androidzie średniej klasy PRZED zamrożeniem hopów 10/20 ms.

- **Test akceptacyjny "wierność vibrata: wstrzyknięte 4/5/6/7/8 Hz × {25,50,100,150} c; kryterium: stosunek zmierzonego zakresu do zadanego 0,92-1,05" przy jednoczesnym oknie toru klasycznego "2048 próbek = 42,67 ms".**

  Ta specyfikacja nie przechodzi własnej bramki i da się to policzyć na kartce, bez implementacji. Estymator autokorelacyjny na oknie długości T zwraca w pierwszym przybliżeniu średnią F0 po tym oknie, czyli działa jak filtr średniej ruchomej o odpowiedzi |sin(pi*fm*T)/(pi*fm*T)|. Dla T = 2048/48000 = 42,67 ms: 4 Hz -> 0,953 (PASS), 5 Hz -> 0,927 (PASS o włos), 6 Hz -> 0,896 (FAIL), 7 Hz -> 0,860 (FAIL), 8 Hz -> 0,819 (FAIL). Czyli 3 z 5 zadanych częstotliwości vibrata są odrzucone przez własne kryterium, a tabela celów mówi "błąd zakresu vibrata (5 Hz, ±71 c) ≤ 8% zaniżenia" — 5 Hz daje 7,3%, więc cel jest ustawiony dokładnie na granicy tego, co jedyna przechodząca częstotliwość osiąga. Vibrato 6-7 Hz to norma u wyszkolonych śpiewaków, nie przypadek brzegowy. Uwaga: ta sama matematyka POTWIERDZA zarzut wobec RMVPE i jest mocniejsza niż argument użyty w dokumencie — okno 128 ms daje 0,450 przy 5 Hz i 0,114 przy 7 Hz, czyli RMVPE praktycznie kasuje vibrato, nie "zaniża". Ale ten sam nóż tnie w obie strony i autor nie zauważył, że tnie też jego.

  → Nie skracać okna (przy 70 Hz masz wtedy <3 okresów i CMNDF się rozpada) i nie robić okna adaptacyjnego (łamie stałą latencję — słusznie odrzucone). Liczyć DWA okna CMNDF równolegle, 1024 i 2048 próbek, oba na tym samym hopie 480, i wpuszczać oba zestawy kandydatów do tej samej fuzji log-liniowej; Viterbi i tak wybiera. Koszt: +44 MFLOP/s (16% budżetu), latencja bez zmian (dyktuje ją dłuższe okno), a krótkie okno wnosi nieobciążony pomiar zakresu vibrata dla 6-8 Hz i szybszą reakcję na atak. Alternatywnie: zostawić jedno okno i skorygować kryterium akceptacji na kompensację analityczną (dzielić zmierzony zakres przez sinc(pi*fm*T) po estymacji fm) — ale wtedy trzeba to zapisać jako element specyfikacji, a nie udawać, że okno jest wystarczające.

- **"HARMOF0 osiąga w papierze RMVPE Tab. 3 najlepszy wynik na MDB-stem-synth (RPA 97,94±2,49, lepiej niż RMVPE 97,11) PRZY MAŁYM MODELU — bo dylatowane konwolucje po osi harmonicznej... To jest właściwy induktywny bias dla F0 i przejmujemy go" -> uzasadnia własny model 2,00 MMAC/ramkę, ~30k parametrów, z celami RPA ≥97,0% i octave error ≤0,3%.**

  Liczba 97,94% jest przypisana architekturze, która jest o dwa rzędy wielkości większa od proponowanej — to jest dokładnie ten błąd, który dokument zarzuca innym ("liczby wydajnosci wziete z README autorow"), tylko gorszy, bo liczba pochodzi z INNEGO, znacznie większego modelu. Przeczytałem faktyczne źródło (harmof0/network.py): domyślne `channels=[32, 64, 128, 128]`, jądra `kernel_size=[3,3]` w każdym z 4 bloków, `freq_bins=88*4=352`, `bins_per_octave=48` (25 centów/bin, nie 20), `n_fft=1024`, `hop=512` (32 ms, nie 20 ms), `n_har=12` w bloku 1. Policzone MAC-i na ramkę: blok1 4,43 + blok2 10,81 + blok3 43,25 + blok4 69,21 + głowy 2,90 = 130,6 MMAC/ramkę, czyli 8,2 GFLOP/s przy 31,25 fps. Propozycja zakłada 2,00 MMAC/ramkę — to 65x mniej operacji i ~14x mniej parametrów (~25-30k wobec ~370-400k) — i mimo tego dziedziczy cel jakościowy. Nie ma na to żadnego dowodu. Dodatkowo: temporalne RF HARMOF0 to 1+4*2 = 9 ramek po 32 ms = ±128 ms lookaheadu (bo kernel [3,3] ma 3 tapy w czasie w KAŻDYM z 4 bloków), więc HARMOF0 też nie jest architekturą o małym lookaheadzie — teza, że ten bias sam z siebie kupuje dokładność bez kontekstu czasowego, nie ma poparcia w cytowanym modelu.

  → Rozdzielić dwie rzeczy w planie: (a) bias harmoniczny jest wart przejęcia — to zostaje; (b) cel jakościowy musi być wyprowadzony z ablacji WŁASNEJ, nie z HARMOF0. Konkretnie: wytrenować najpierw replikę HARMOF0-scale (352 biny, 32/64/128/128, ~130 MMAC) na własnych danych, zmierzyć, POTEM schodzić z kanałami i mierzyć krzywą jakość-vs-MAC i publikować ją w repo. Cel ≥97,0% RPA wolno wpisać do bramki dopiero jako punkt na tej krzywej. Bez tego kroku krok 5 harmonogramu ("≥96,5% HM na vocadito") jest bramką, której nikt nie wie jak przejść.

- **"L2 HARMONIC DILATED: 6 równoległych gałęzi 1×1, 24->8, dylatacje po osi freq = {0, 60, 95, 120, 139, 155} binów, concat 48 -> pointwise 1×1, 48->24".**

  Ta warstwa, zaimplementowana dosłownie jak opisano, jest matematycznie zdegenerowana i nie da się jej zbudować w PyTorchu. Dylatacja rozstawia tapy WEWNĄTRZ jądra — na jądrze 1×1 nie ma czego rozstawiać, więc `dilation` jest no-opem i wszystkie 6 gałęzi liczy identyczny wynik (concat 6 kopii tego samego). Ponadto `dilation=0` jest odrzucane przez PyTorcha (wymagane >= 1), więc pierwsza gałąź nie skompiluje się nawet formalnie. Prawdziwy mechanizm HARMOF0 (harmof0/layers.py, klasa MRDConv) NIE używa argumentu `dilation` nigdzie: to 6-12 równoległych `nn.Conv2d(kernel_size=[1,1])`, po których następuje PRZESUNIĘCIE po osi częstotliwości przez slicing (`x = x[:, :, :, dilation:]`) i SUMOWANIE gałęzi (`y[:, :, :, :n_freq] += x`), a nie konkatenacja. Czyli w propozycji jest jednocześnie: zła nazwa operacji, nieimplementowalny parametr i inny sposób łączenia gałęzi niż w źródle, do którego się odwołuje.

  → Przepisać spec na to, czym to jest: 6 równoległych projekcji 1×1 (24->8), każda z jawnym przesunięciem wejścia po osi log-f o {0, 60, 95, 120, 139, 155} binów (gather/shift z zerowym paddingiem), potem concat 48 -> 1×1 48->24. Model kosztu (0,829 MMAC) jest przy tym poprawny, bo policzony właśnie dla concat — trzeba zmienić tylko opis operacji, nie budżet. Zdecydować świadomie concat-vs-sum: concat jest ekspresyjniejszy i tak został wyceniony, HARMOF0 sumuje; jeśli robicie concat, to jest wasza modyfikacja i tak ją opisać, a nie jako "pomysł przejęty z HARMOF0".

- **"oś wejściowa: log-f, 20 centów/bin, 55,0 Hz (A1) … 4186,0 Hz (C8) = 360 binów" przy "STFT: N=1024 Hann (64 ms), hop=320, fs=16000".**

  Oś 20 centów/bin jest nominalna, nie realna, w CAŁYM zakresie podstawowym śpiewu — i to jest policzalne. STFT N=1024 przy 16 kHz ma rozdzielczość 15,625 Hz. 20 centów przy częstotliwości f to f*0,011619 Hz. Zrównanie następuje przy f = 1345 Hz. Czyli poniżej 1345 Hz — a wasza głowa pitch kończy się na 1046,5 Hz, więc CAŁY zakres wyjściowy — siatka 20-centowa jest gęstsza niż informacja w widmie: przy 65,41 Hz jeden bin STFT rozciąga się na 20,6 binów log-f, przy 82,41 Hz (E2, bas) na 16,3, przy 220 Hz na 6,1, przy 440 Hz na 3,1. Liniowa interpolacja tego nie naprawia — nie tworzy informacji. Praktyczna konsekwencja jest gorsza niż "ryzyko artefaktów" wpisane do sekcji ryzyk: tapy harmoniczne w L2/L3 stoją w konkretnych, pojedynczych binach ({0,60,95,...}), a przy niskim F0 cały płat harmonicznej mieści się w jednym interpolowanym binie STFT rozsmarowanym na 16-20 binów log-f. Czyli szablon harmoniczny — jedyny mechanizm, którym sieć rozstrzyga OKTAWĘ — jest najtępszy dokładnie tam, gdzie błędy oktawowe faktycznie występują: przy niskich, przydechowych, cichych głosach. Uzasadnienie "tor klasyczny da precyzję" tu nie działa, bo tor klasyczny z założenia NIE rozstrzyga oktawy. HARMOF0 ma ten sam problem (25 c/bin, fmin 27,5, n_fft 1024 @16k) i mimo to osiąga 97,94% — ale na MDB-stem-synth, czyli na RESYNTEZIE z idealnie czystymi harmonicznymi, co jest najbardziej łaskawym możliwym materiałem dla tego front-endu.

  → Front-end wielorozdzielczościowy zamiast jednego STFT: trzy transformaty na tym samym hopie 320 (N=4096 dla binów poniżej ~200 Hz, N=2048 dla 200-700 Hz, N=1024 powyżej), zszyte w jedną oś log-f 360 binów. Koszt: STFT rośnie z 1,5 do ~8 MFLOP/s — czyli 2,4% budżetu, nieistotne. Latencja rośnie tylko dla pasma niskiego (4096/2 @16k = 128 ms centrowania) — i to jest akceptowalne, bo z tego pasma bierzecie WZORZEC HARMONICZNY do decyzji o oktawie, która jest wielkością wolnozmienną, a nie wartość F0 (ta idzie z toru klasycznego 42,67 ms). Trzeba wtedy jawnie zapisać per-pasmo staleness w budżecie latencji. Alternatywnie: zejść z osi wejściowej na 50 centów/bin (144 biny) i uczciwie stwierdzić, że tyle informacji jest — to obniża koszt L2/L3 2,5x i nic nie traci.

- **"octave error rate ≤ 0,3% — dekodowanie sekwencyjne nad fuzją; 4x lepiej niż najlepszy publiczny", oparte na "fixed-lag Viterbi" i cytacie Boersma 1993.**

  To najsłabiej podparta liczba w całym dokumencie, a papier SwiftF0 — cytowany w dokumencie sześć razy — zawiera bezpośrednio przeciwny wynik empiryczny, który został pominięty. Sekcja 3.5, dosłownie: "Consequently, alternative decoding methods like the Viterbi algorithm did not yield improvements over the local expected value in our experiments." Czyli autor modelu o najniższym zmierzonym octave error w niezależnym benchmarku (1,2%) próbował Viterbiego nad swoim posteriorem i nie dostał poprawy. Dokument cytuje z tego samego papieru straty (3.4), dekodowanie local expected value (3.5), próg 90% (3.5), pasmo (3.2), receptive field (3.3) i zbiory (3.6) — a jedno zdanie o Viterbim, które podważa tezę, nie zostało przytoczone. To nie znaczy, że Viterbi nie pomoże (nad SŁABSZYM posteriorem 30k-parametrowego modelu prawdopodobnie pomoże więcej niż nad SwiftF0), ale znaczy, że 4x poprawa wobec state of the art jest hipotezą bez poparcia, wpisaną jako bramka wyjścia z kroku 5.

  → Zdegradować 0,3% z celu do hipotezy i wpisać jako bramkę wartość wyprowadzoną z pomiaru: krok 1 harmonogramu (rdzeń bez sieci) daje wam octave error samego CMNDF+Viterbi; krok 5 daje octave error fuzji. Bramka = "nie gorzej niż SwiftF0 1,2% na vocadito" na start, a 0,3% jako cel rozciągnięty. Dodatkowo zrobić ablację, którą SwiftF0 pominął: Viterbi nad posteriorem log-liniowej fuzji vs Viterbi nad samym posteriorem sieci vs local expected value — bo waszym argumentem za Viterbim jest to, że zabija subharmoniczne minimum YIN, a to działa tylko jeśli fuzja jest w torze; nad czystym posteriorem sieci istotnie nie ma czego poprawiać.

- **Struktura API: "pub cents: f32,   // 1200·log2(f0/55.0), NaN gdy bezdźwięczna" przy bramce CI "Assert bitowej równości WSZYSTKICH f32 wyjściowych. Rozbieżność = BŁĄD, nie tolerancja."**

  Te dwie rzeczy się nie składają. NaN != NaN w każdym porównaniu zmiennoprzecinkowym, więc naiwny assert równości f32 na polu `cents` zawiedzie na KAŻDEJ ramce bezdźwięcznej, na wszystkich trzech platformach jednocześnie. Jeśli obejdziecie to porównaniem wzorca bitowego (`to_bits()`), problem się odwraca i staje się realny: propozycja sama zastrzega "poza payloadami NaN, których nigdy nie produkujemy", a tu produkuje NaN jawnie, w kontrakcie API. Wzorzec bitowy quiet-NaN (bit znaku i payload) nie jest ustalony przez IEEE-754 dla wyników operacji i różni się między architekturami oraz między sposobami wytworzenia NaN (0.0/0.0, log ujemnego, jawne `f32::NAN`). Czyli pole, które jest sentinelem, a nie pomiarem, jest jedynym miejscem gwarantowanego rozjazdu bitowego.

  → Wyrzucić NaN z ABI. `cents: f32` ustawiać na 0.0 przy bezdźwięcznej i polegać na `state: u8` oraz `f0_hz == 0.0` jako sygnale — i tak macie oba. Bramkę CI zapisać jako porównanie `to_bits()` na całej strukturze przy zakazie NaN i inf w wyjściu, z osobną asercją "żadne pole wyjściowe nie jest NaN/inf" jako pierwszym testem. To dodatkowo wyłapie log(0) w normalizacji, jeśli epsilon 1e-8 kiedyś zniknie.

- **"głowa pitch: 481 binów, 10 centów/bin, C2 65,41 Hz … C6 1046,50 Hz" oraz "zakres τ [40, 686] próbek = 70 Hz … 1200 Hz".**

  Dwie niespójności zakresów, obie z konsekwencją produktową. (1) Siatka Viterbiego/fuzji zaczyna się na 65,41 Hz, a tor klasyczny fizycznie nie może wygenerować kandydata poniżej 70 Hz (τ=686 przy 48 kHz to 69,97 Hz). Dolne ~4 biny siatki są nieosiągalne dla eksperta klasycznego, więc w log-liniowym poolingu (iloczyn!) dostają masę tylko z sieci — a iloczyn z zerem z drugiej strony je wyzeruje, chyba że podłoga ε=0,02 je uratuje, i wtedy dolne biny są rozstrzygane wyłącznie przez sieć bez refinacji subbinowej. (2) Sufit C6 = 1046,5 Hz. To nie jest sufit śpiewu: soprany koloraturowe rutynowo wchodzą na F6-G6, rejestr fletowy/whistle wyżej, a głos dziecięcy siedzi w górnej części tego zakresu na stałe. Wasz własny korpus EGG ma specyfikację "sopran (C6)", czyli powtarza ten sufit w danych treningowych — model nigdy nie zobaczy niczego wyżej i nie będzie mieć tam ani wzorca harmonicznego, ani kalibracji. Dla aplikacji, która MA użytkowników i mierzy "zakres" jako funkcję produktową, obcięcie zakresu na C6 jest wadą funkcjonalną, a nie parametrem DSP. Oś wejściowa sieci idzie do C8 = 4186 Hz, więc informacja jest, tylko głowa jej nie wyprowadza.

  → Podnieść siatkę pitch do C7 = 2093,0 Hz (5 oktaw, 600 binów po 10 centów — koszt Viterbiego rośnie z 7,8 do 9,7 MFLOP/s, czyli nieistotnie; projekcja pasmowa rośnie z 19,7k do 24,6k parametrów) i zejść dolną granicą na E1 41,2 Hz albo podnieść siatkę do 70 Hz, żeby zgadzała się z torem klasycznym. Rozszerzyć τ do [40, 1170] (41-1200 Hz) jeśli chcecie basy poniżej 70 Hz — wtedy realFFT musi być 8192, nie 4096, i trzeba to wpisać do budżetu. Do korpusu EGG dopisać obowiązkowe pokrycie F6 i rejestru fletowego.

- **§7.2: "okno 2048 próbek = 42,67 ms" + "CMNDF przez FFT: d(τ) = r(0) + r_τ(0) − 2r(τ), realFFT 4096" + "zakres τ [40, 686]", oraz §8: "Stałe okno całkowania W = MAX_PERIOD | zachować — to poprawna forma YIN", oraz sekcja ryzyk: "42,67 ms mieści 3,5 okresu" przy E2.**

  Te trzy miejsca opisują trzy różne rzeczy i przynajmniej jedna liczba w budżecie latencji jest z tego powodu zła. Jeśli W (okno całkowania YIN, de Cheveigné & Kawahara równ. 7-8) równa się MAX_PERIOD = 686 próbek, to okno całkowania ma 14,3 ms i przy 70 Hz obejmuje DOKŁADNIE JEDEN okres — CMNDF jest tam bezużyteczny, a zdanie z sekcji ryzyk o "3,0 okresach przy 70 Hz" (które zakłada W=2048) jest nieprawdziwe. Jeśli natomiast W = 2048, to do policzenia członu r_τ(0) dla τ do 686 potrzebujecie 2048+686 = 2734 próbek na ramkę, czyli 56,96 ms materiału, a nie 42,67 ms — i wtedy "centrowanie okna klasycznego (2048/2 @48k) = 21,3 ms" w budżecie latencji jest zaniżone: prawidłowo 1367/48000 = 28,5 ms. Trzeciej opcji (2048 próbek łącznie z τmax w środku) odpowiada malejące z τ okno całkowania, czyli obciążona autokorelacja, której krok 2 YIN-a właśnie unika — i wtedy "to poprawna forma YIN" z §8 jest nieprawdą.

  → Rozstrzygnąć jawnie i podać jedną liczbę: W = 2048 próbek całkowania, ramka wejściowa 2048 + 686 = 2734 próbki, realFFT 4096 (wystarcza, bo 2734+686 < 4096), centrowanie 28,5 ms. Poprawić linię budżetu: Tier A wychodzi wtedy 56-80 ms zamiast 49-73 ms — nadal poniżej twardego limitu 100 ms, więc wniosek się nie zmienia, ale liczba musi być prawdziwa, bo to ona uzasadnia hop i rozmiar okna. Usunąć z §8 zdanie o W = MAX_PERIOD albo doprecyzować, że chodzi o stałość W, nie o jego wartość.

**Problemy licencyjne:**

- FSD50K jest w tabeli "czyste komercyjnie / ✅ z atrybucją" jako "CC BY" — i to jest błąd, dokładnie tej klasy, którą cały dokument uznaje za decydującą. Zenodo 4060432 mówi: "All audio clips in FSD50K are released under Creative Commons (CC) licenses. Each clip has its own license as defined by the clip uploader in Freesound, some of them requiring attribution to their original authors and SOME FORBIDDING FURTHER COMMERCIAL REUSE." Rozbicie dev setu: CC0 14 959, CC-BY 20 017, CC-BY-NC 4 616, CC Sampling+ 1 374. Eval set: CC0 4 914, CC-BY 3 489, CC-BY-NC 1 425, CC Sampling+ 403. Czyli ~11% dev setu to CC-BY-NC. Według WŁASNEJ doktryny dokumentu ("model pochodny dziedziczy licencję danych treningowych") augmentacja szumem z FSD50K zatruwa wagi tak samo jak MDB-stem-synth. Naprawa jest trywialna i FSD50K dostarcza do niej dane: przefiltrować po dołączonych mapowaniach licencji per-klip do CC0 + CC-BY, zapisać listę SHA-256 dopuszczonych plików do docs/licensing.md. Źródło: https://zenodo.org/records/4060432
- SPICE jest w głównej tabeli benchmarku (średnia 82,5, vocadito 92,3) i NIE MA WERDYKTU w żadnej z 11 decyzji — jedyny model w stawce pominięty bez uzasadnienia. Sprawdziłem: SPICE jest CC BY-NC 4.0 ("This model follows CC BY-NC 4.0 license"), trenowany self-supervised na MIR-1k, i oznaczony `fine-tunable: false`. Czyli konkluzja dokumentu SIĘ UTRZYMUJE — SPICE też jest wykluczony — ale analiza licencyjna była niekompletna i o tym, że się utrzymuje, autor nie wiedział. Warto dopisać wiersz do tabeli §2.1, bo SPICE przy 92,3 na vocadito jest w tej samej klasie co SwiftF0 i ktoś to zaproponuje. Źródło: https://raw.githubusercontent.com/tensorflow/tfhub.dev/master/assets/docs/google/models/spice/2.md
- MDB-stem-synth: POTWIERDZONE. Zenodo pokazuje dosłownie "Creative Commons Attribution Non Commercial 4.0 International". Teza o zatruciu wag jest prawdziwa. https://zenodo.org/records/1481172
- Zbiór treningowy SwiftF0: POTWIERDZONE bezpośrednio z papieru, sekcja 3.6, cytat dosłowny: "For model training and hyperparameter optimization, we employed 5-fold group cross-validation across NSynth, PTDB-TUG, MIR-1k, MDB-STEM-Synth, and SpeechSynth." oraz "For evaluation, we used three held-out datasets: Vocadito, Bach10-mf0-synth, and an independently generated SpeechSynth test set." Czyli wagi SwiftF0 są istotnie wytrenowane na MDB-STEM-Synth (CC BY-NC) i MIR-1k. To jest najmocniejszy weryfikowalny punkt całego dokumentu i jest w 100% prawdziwy. Bonus: vocadito jest u SwiftF0 zbiorem HELD-OUT, więc 92,6% to uczciwa generalizacja, a nie wynik in-domain.
- PESTO: POTWIERDZONE, GitHub API zwraca "GNU Lesser General Public License v3.0", ostatni push 2025-10-15, 297 gwiazdek. Projekt żywy, licencja wyklucza. https://api.github.com/repos/SonyCSLParis/pesto
- Dwie licencje w tabeli "✅" nie mają w dokumencie żadnego źródła i nie udało mi się ich potwierdzić: OpenAIR (IR pomieszczeń) — wpisane jako "CC BY" bez URL-a; część bazy OpenAIR była historycznie udostępniana na CC BY-SA, co przy waszej doktrynie dziedziczenia jest flagą. Oraz PTDB-TUG — wpisane jako "badawcze / zakaz treningu", ale strona TU Graz (https://www2.spsc.tugraz.at/databases/PTDB-TUG/) to goły katalog bez widocznych warunków; warunki są w podkatalogu DOCUMENTATION. To jest warte pięciu minut, bo PTDB-TUG ma sygnał laryngografu — czyli dokładnie to, na co planujecie wydać €2k i zbudować własny korpus EGG. Jeśli licencja pozwala, dostajecie darmowo GT laryngograficzny dla MOWY (nie dla śpiewu, ale kalibracja voicingu i tor mowy w profilu PODCAST to realne zastosowanie w tym produkcie).
- Do sprawdzenia przed użyciem jako zamiennik FSD50K: CHiME-Home, czyli zbiór szumów, którego użył SwiftF0 (sekcja 3.7: "blending environmental recordings from the CHiME-Home dataset with synthetic white Gaussian noise"). To zbiór badawczy z licencją do zweryfikowania. Bezpieczniejszy wybór o znanej licencji: MUSAN (CC BY 4.0, JHU) jako korpus szumu/muzyki tła.

**Projekty martwe:**

- HarmoF0 (WX-Wei/HarmoF0) — repo, z którego przejmujecie kluczowy bias architektoniczny, jest NIEUTRZYMYWANE i jego kod NIE URUCHOMI SIĘ na współczesnym środowisku. GitHub API: ostatni push 2024-08-23 (prawie dwa lata), 108 gwiazdek, 4 otwarte issues, MIT. Dwie konkretne usterki w kodzie, który chcecie replikować: (1) harmof0/network.py, funkcja dila_conv_block, tryb 'log_scale' — czyli DOKŁADNIE tryb realizujący harmoniczne dylatacje, ten po który sięgacie — zawiera `dilation_list = a.round().astype(np.int)`. `np.int` został usunięty w NumPy 1.24 (grudzień 2022) i podnosi AttributeError. (2) network.py importuje `from torch._C import has_openmp`, czyli prywatne API PyTorcha. Konsekwencja praktyczna: nie da się uruchomić referencji, żeby zwalidować własną implementację MRDConv przeciw oryginałowi — a to jest jedyny sensowny golden test dla tej warstwy. Trzeba to naprawić samemu (obie poprawki są jednoliniowe) i zapisać forka z SHA. Nie jest to blokada merytoryczna, bo bierzecie pomysł, nie wagi — jest to blokada weryfikacji.
- lars76/pitch-benchmark — ŻYWY, POTWIERDZONY. GitHub API: MIT, utworzony 2025-01-17, ostatni push 2026-07-22 (cztery dni przed dzisiejszą datą), 78 gwiazdek. Data podana w dokumencie jest dokładna. Wszystkie liczby z tabel §1.1 i §1.2 zweryfikowałem co do cyfry przeciw benchmark_report.md — zgadzają się w 100%.
- realfft 3.5.0 (wydane 2026-07-24) i rustfft 6.4 — oba żywe i aktywnie wydawane. Problem z nimi nie jest problemem utrzymania, tylko determinizmu (patrz sekcja fatal).
- SonyCSLParis/pesto — żywy (push 2025-10-15, 297 gwiazdek). Odrzucenie jest poprawne, ale z powodu licencji, nie martwości projektu; dokument tak to zresztą stawia.

**Luki platformowe:**

- iOS Safari nie pozwala wyłączyć przetwarzania wejścia, a cała kalibracja voicingu na tym stoi. §7.1 wymaga `echoCancellation:false, noiseSuppression:false, autoGainControl:false` z dopiskiem "sprawdzić czy honorowane". MDN dla autoGainControl podaje status "Limited availability — This feature is not Baseline because it does not work in some of the most widely-used browsers". Skutek nie jest kosmetyczny: §5.2(c) mierzy dno szumu N jako medianę RMS z 2 s ciszy, a potem `rms_rel = RMS − N` wchodzi jako cecha do skalibrowanej regresji logistycznej P(voiced). Jeśli platforma stosuje AGC albo bramkę szumu, to dno szumu zmierzone w ciszy NIE JEST tym samym dnem, względem którego mierzycie głos — AGC podnosi wzmocnienie w ciszy i opuszcza je przy głosie, więc `rms_rel` dostaje przesunięcie o wartość, której nie znacie, i to w kierunku ZMNIEJSZAJĄCYM kontrast. Cel VR >= 0,97 jest ustawiony na sygnale, którego na iOS w webie nie dostaniecie. Naprawa: traktować `rms_rel` jako cechę o wagach uczonych OSOBNO per platforma-transport (web-iOS, web-Android, web-desktop, native-iOS, native-Android) albo wywalić ją z fuzji na platformach, gdzie constraints nie są honorowane, i oprzeć voicing na `a`, `hnr`, `flat`, `nn` (cechy niezależne od poziomu). Wykrywanie: `track.getSettings()` po getUserMedia i porównanie z żądanymi wartościami — to jedyny sposób i trzeba go wpisać do specyfikacji, nie do listy "sprawdzić".
- `numberOfOutputs: 0` w konstruktorze AudioWorkletNode — to węzeł bez ścieżki do AudioDestinationNode, a graf Web Audio jest pull-based i renderowany OD destination. Węzeł nieosiągalny z destination nie ma gwarancji, że jego `process()` będzie wołany; Chrome traktuje węzły bez wyjść jako sinki i je pompuje, WebKit historycznie tego nie robił niezawodnie. Skutek: tor działa na desktopowym Chrome i cicho nie startuje na iOS, bez żadnego błędu. Naprawa (tania, portowalna, stosowana w produkcji): dać węzłowi 1 wyjście i podłączyć je do `ctx.destination` przez GainNode z `gain.value = 0`. Przepisać §3.3 na ten wzorzec, bo tam jest jawnie `numberOfOutputs: 0`.
- Wzorzec ładowania WASM do worklet jest w dokumencie przedstawiony jako udokumentowany przez Chrome, a udokumentowany jest tylko z nazwy. Pobrałem artykuł: sekcja istnieje, ale nazywa się "WASM module instantiation pattern B: Using AudioWorkletNode constructor's cross-thread transfer" (nie "Pattern B: Cross-Thread Module Transfer"), opisuje podejście wyłącznie diagramem i tekstem, i NIE ZAWIERA kodu — mówi tylko, że transfer następuje "via the constructor of AudioWorkletNode", bez wskazania, że chodzi o processorOptions. Konkretny snippet z §3.3 (WebAssembly.compile na main threadzie -> processorOptions -> synchroniczne `new WebAssembly.Instance` w konstruktorze procesora) jest waszą konstrukcją, nie cytatem, i nie ma za sobą żadnego dowodu działania na WebKicie. Sama serializowalność WebAssembly.Module jest OK (MDN, baseline od października 2017, przykład z worker.postMessage(mod)), ale worker to nie AudioWorkletGlobalScope. To musi być pierwszy spike do napisania — 20 linii kodu, przed jakąkolwiek decyzją architektoniczną, na realnym iPhonie. Rozróżnienie processorOptions (StructuredSerialize BEZ transferu, więc MessagePort tam nie przejdzie) vs node.port.postMessage(msg,[port]) jest natomiast opisane poprawnie. https://developer.chrome.com/blog/audio-worklet-design-pattern
- Android armv7 vs aarch64: ta sama aplikacja, dwa różne wyniki numeryczne. §3.5 wymienia `armv7-linux-androideabi` jako target produkcyjny. rustfft ma ścieżkę NEON tylko dla 64-bitowego ARM (README: "RustFFT supports the NEON instruction set in 64-bit Arm, AArch64"), więc armv7 dostaje kernel skalarny, a aarch64 wektorowy — inne zaokrąglenia. Bramka "bitowa równość na 3 targetach" testuje wasm32 + aarch64-apple-ios + aarch64-linux-android i armv7 w niej NIE WYSTĘPUJE, więc rozjazd przejdzie przez CI niezauważony i pojawi się na tanich telefonach. Albo wyrzucić armv7 z listy targetów (uzasadnialne: minSdk 26+ na 64-bit), albo dodać go do bramki bitowej, albo — poprawnie — usunąć rustfft.
- Zgodność bitowa RDZENIA to nie zgodność PRODUKTU, a dokument sugeruje inaczej ("dowolna rozbieżność w CI jest BŁĘDEM, a nie dopuszczalną różnicą platformową — co eliminuje całą klasę nieodtwarzalnych bugów"). Do rdzenia wchodzą próbki z trzech zupełnie różnych torów akwizycji: getUserMedia (z nieznanym AGC/NS na iOS), AVAudioEngine z `.measurement`, oraz Oboe/AAudio Exclusive. Każdy z nich ma inną charakterystykę, inny resampling do 48 kHz i inne opóźnienie grupowe. Bitowo identyczny rdzeń nakarmiony trzema różnymi sygnałami da trzy różne wyniki i użytkownik zobaczy różnicę między iOS a Androidem mimo zielonego CI. Naprawa: bramka bitowa działa na PLIKACH WAV z korpusu (i to jest jej właściwy, wąski zakres — tak trzeba ją opisać), a równoważność produktowa wymaga OSOBNEGO pomiaru: ten sam materiał zagrany z głośnika, nagrany na 3 platformach, porównanie metryk MIR z progiem. Ten drugi pomiar w planie walidacji nie istnieje.
- Do jawnego wyłączenia w konfiguracji builda: `relaxed-simd`. WASM ma jedną prawdziwą niedeterministyczną rodzinę operacji — propozycja relaxed-simd (`f32x4.relaxed_madd` i pokrewne) ma z definicji zależny od implementacji wynik. LLVM nie emituje ich bez włączenia, ale `-C target-feature=+simd128` bywa kopiowane razem z szerszymi zestawami flag. Dopisać `-relaxed-simd` do RUSTFLAGS i asercję w CI, że moduł .wasm nie zawiera opkodów relaxed (walidacja przez wasm-objdump). Osobno: zakaz wasm-opt z przebiegami zmieniającymi semantykę FP jest w dokumencie i jest słuszny.

**Potwierdzone niezależnie:**

- Wszystkie liczby z benchmarku lars76/pitch-benchmark zweryfikowane co do cyfry przeciw surowemu benchmark_report.md: harmoniczne średnie na MIR1K/Vocadito (pYIN 91,2/79,5; RMVPE 96,0/96,4; CREPE 95,7/95,6; SwiftF0 95,0/92,6; PENN 89,0/82,4), agregaty (pYIN RPA 0,878 / cents 62,9 / octave 0,032 / voicing 0,913-0,633-0,731; SwiftF0 0,905 / 35,4 / 0,012 / 0,903-0,871-0,885; RMVPE 0,921 / 40,9 / 0,020 / 0,902-0,793-0,837), runtime CPU (Praat 2,8 / SwiftF0 16,2 / pYIN 274,6 / RMVPE 293,3 / CREPE 1425,9 ms). Zero rozbieżności. Podstawa faktograficzna decyzji o pYIN jest solidna i pochodzi z niezależnego, żywego źródła (MIT, push 2026-07-22).
- Odrzucenie pYIN jako samodzielnego estymatora jest merytorycznie uzasadnione i najlepiej udokumentowana decyzja w dokumencie. Voicing recall 0,633 to nie kwestia progów — to najgorszy wynik w stawce 12 algorytmów przy jednoczesnie NAJWYŻSZEJ precyzji 0,913, co jest sygnaturą estymatora, który po prostu odmawia decyzji, a nie takiego, który jest źle nastrojony.
- MDB-stem-synth = CC BY-NC 4.0 (Zenodo pokazuje dosłownie "Creative Commons Attribution Non Commercial 4.0 International"). VocalSet = CC BY 4.0, 20 śpiewaków (9M/11K), 10,1 h. PESTO = LGPL-3.0 (GitHub API). Wszystkie trzy potwierdzone bezpośrednio.
- Zbiór treningowy SwiftF0 potwierdzony dosłownym cytatem z sekcji 3.6 papieru: 5-fold group CV po NSynth, PTDB-TUG, MIR-1k, MDB-STEM-Synth i SpeechSynth. Wniosek "nie istnieje gotowy model F0 klasy SOTA, którego wagi wolno wysłać w produkcie komercyjnym" po dodaniu mojej weryfikacji SPICE (CC BY-NC 4.0) obejmuje teraz siedem modeli i JEST PRAWDZIWY. To najmocniejszy argument dokumentu i wytrzymuje atak.
- Wykrycie ±160 ms lookaheadu w SwiftF0 to najlepszy pojedynczy wkład analityczny w całym dokumencie i jest poprawne. Papier, sekcja 3.3, dosłownie: "All convolutional layers use 5x5 kernels with stride 1 and 'same' padding, preserving temporal and frequency dimensions throughout the network. Stacking five such layers results in a receptive field of 21x21 bins at the final layer." Papier interpretuje 21 tylko po osi częstotliwości ("21 x 15.6 ~ 328 Hz") i o osi czasu nie mówi ANI SŁOWA — a przy H=256 i fs=16000 (sekcja 3.2, potwierdzone) hop wynosi 16 ms, więc 21 ramek to ±160 ms. Wniosek, że architektura jest niezdatna do feedbacku na żywo as-is, jest uzasadniony i nie ma go w literaturze.
- Parametry SwiftF0 potwierdzone co do cyfry: 95 842 parametry, ~42x szybszy od CREPE (22M param), N=1024 Hann, H=256, fs=16000, rozdzielczość 15,625 Hz, pasmo 46,875-2093,75 Hz, kmin=3, kmax=134, K=132 biny (odrzucone 74% z 513), B=200 binów logarytmicznych, 33,1 centa/bin, L_total = L_CE + lambda*L_cents przy lambda=1, dekodowanie local expected value z półszerokością okna w=9, próg confidence ~90%. Wszystko zgadza się z dokumentem.
- Praat: voicedUnvoicedCost = 0,14 i octave-jump cost = 0,35 potwierdzone w manualu (Sound: To Pitch (ac)). Wartości kar w §7.5 są przejęte poprawnie, a nie wymyślone.
- Wewnętrzna arytmetyka FLOP-ów jest spójna i sprawdziłem ją niezależnie. Model VC-F0: L1 0,060 + L2 0,829 + L3 0,829 + L4 0,233 + L5 0,009 + głowy 0,040 = 2,00 MMAC/ramkę, przy 50 fps = 200 MFLOP/s. Koszt strumieniowy SwiftF0: L4 32->64 przy 132 binach i jądrze 5x5 to 132*25*32*64 = 6,758 MMAC, suma 9,13 MMAC/ramkę, przy 62,5 fps = 1,14 GFLOP/s. Viterbi: 482*81 = 39 042 operacji, 7,8 MFLOP/s przy 100 fps = 2,8% budżetu 275 MFLOP/s. Offsety harmoniczne na siatce 20 c/bin: {0, 60, 95, 120, 139, 155} = {0, 1200, 1900, 2400, 2780, 3100} centów, zgodne z 1200*log2(n) w granicach jednego bina. Siatka 481 binów = 4800 centów / 10 = C2..C6. Okno przejść ±40 binów = ±400 c/ramkę = 400 półtonów/s. Wszystko się liczy.
- Teza, że Viterbi jest obliczeniowo darmowy i jedyną jego ceną jest lag, jest prawdziwa (7,8 MFLOP/s). Budżet Tier A wytrzymuje nawet po mojej korekcie centrowania okna z 21,3 na 28,5 ms: 56-80 ms, wciąż poniżej progu 100 ms Nielsena. Wniosek architektoniczny (dwa poziomy wyjścia) się nie zmienia.
- Odrzucenie ONNX Runtime Web dla AudioWorkletu jest poprawne co do mechanizmu (glue oczekuje fetch/URL, którego w AudioWorkletGlobalScope nie ma) i co do proporcji (3-9 MB runtime na 250 KB model). Argument o fp16 na ANE łamiącym równoważność jest poprawny. Decyzja o niewrzucaniu sieci do worklet jest poprawna i dobrze policzona: 2 ms pracy w 2,67 ms deadline'u to gwarantowany dropout.
- Punkt pracy voicingu przesunięty na recall (VR >= 0,97 przy VFA <= 0,15) zamiast optimum F1, oraz metryka "rozkład długości serii dropoutów, P95 <= 2 ramki" — to poprawna analiza asymetrii kosztów produktowych i metryka, której faktycznie nie ma w żadnym publicznym benchmarku. Zostawić bez zmian. Podobnie osobny stan `voiced-irregular` dla fry: to jest poprawna obserwacja, że metryka bez tego stanu karze prawidłowe zachowanie.
- Argument o stop-gradient na głowie voicingu jest poparty konkretnym, zweryfikowanym mechanizmem porażki opisanym przez autora SwiftF0 (sekcja 3.5 potwierdza, że confidence to koncentracja masy w oknie w=9, próg ~90%, czyli faktycznie nie jest prawdopodobieństwem dźwięczności). Kierunek jest dobry, choć skuteczność stop-gradientu pozostaje niesprawdzoną hipotezą — dokument uczciwie stawia to jako otwarte pytanie.
- Uzasadnienie progu latencji 0,1 s Nielsena dla feedbacku WZROKOWEGO (zamiast 10-20 ms z monitoringu słuchawkowego) jest poprawnym rozróżnieniem i najczęściej mylonym miejscem w tego typu projektach.
- Lista "co zostaje z obecnego kodu" jest trafna. Usunięcie filtrów antyharmonicznych i blokady skoku >5 półtonów jest szczególnie ważne i dobrze uzasadnione: oba kasują kandydata, którego dekoder sekwencyjny potrzebuje, i zatrzaskują błąd oktawowy. Naiwny DFT O(N^2) w rAF (lib/fft-analyzer.ts) do wyrzucenia — potwierdzam, że plik istnieje w repo (/Users/arvind/Documents/projekty/voice/voice/lib/fft-analyzer.ts, 4,3 KB) obok lib/pitch-detector.ts (9,5 KB) i lib/pitch-detector-pro.ts (9,3 KB).

**Lepsze alternatywy:**

- zamiast *realfft 3.x + rustfft 6.x w torze produkcyjnym, z nadzieją że zgodność bitowa wyjdzie sama* → **Własny real-FFT (split-radix albo radix-4) o stałym, zakodowanym harmonogramie, z tablicą twiddle wygenerowaną OFFLINE w f64 i wysyłaną jako dane binarne razem z wagami (jeden blob, jeden SHA-256). Zero sin/cos w runtime, zero FftPlanner, zero runtime CPU detection. rustfft zostaje jako dev-dependency: golden test "nasz FFT vs rustfft, tolerancja 1e-6" na desktopie.** (To jedyny sposób, żeby żądanie zgodności bitowej było w ogóle spełnialne — rustfft liczy twiddle przez `angle.cos()`/`angle.sin()` z libm wewnątrz swojego kodu (src/twiddles.rs), więc nie da się tego obejść z zewnątrz, a `default = ["avx","sse","neon"]` dodatkowo wybiera inne kernele per architektura. Efekt uboczny jest korzystny: precomputowana tablica twiddle to kilkanaście KB danych i mniej pracy w runtime niż generowanie jej przy starcie, a rozmiar .wasm spada, bo nie linkujecie planera dla wszystkich długości. To jest więcej pracy i lepszy wynik na każdej osi — czyli dokładnie kierunek, który ten projekt przyjmuje.)
- zamiast *jedno kompromisowe okno CMNDF 2048 próbek (42,67 ms), z ryzykiem "basy będą gorsze" wpisanym do rejestru ryzyk, albo adaptacyjna długość okna odrzucona za łamanie stałej latencji* → **Dwa okna CMNDF liczone RÓWNOLEGLE na tym samym hopie 480: 1024 próbek (21,3 ms) i 2048 próbek (42,67 ms). Oba zestawy kandydatów po interpolacji parabolicznej wchodzą do tej samej fuzji log-liniowej jako jeden zbiór; Viterbi rozstrzyga. Cechy aperiodyczności bierzecie z okna dłuższego dla f0 < 200 Hz i z krótszego wyżej.** (Rozwiązuje jednocześnie trzy problemy, które dokument traktuje jako nierozwiązywalne kompromisy: (1) niedoszacowanie vibrata przy 6-8 Hz (okno 1024 daje sinc 0,973 przy 7 Hz wobec 0,860 dla 2048 — przechodzi wasze kryterium 0,92-1,05 na całym zakresie 4-8 Hz), (2) basy przy 70 Hz (okno 2048 zostaje i daje im swoje 3 okresy), (3) opóźnienie na ataku (krótkie okno ustala periodyczność szybciej). Koszt: +44 MFLOP/s, czyli 16% budżetu DSP — nieistotnie. Latencja BEZ ZMIAN, bo dyktuje ją dłuższe okno, które i tak liczycie. Nie łamie stałej latencji, więc nie ma wady, za którą odrzucono okno adaptacyjne, i nie komplikuje Viterbiego, bo ten operuje na wspólnej siatce 481 binów niezależnie od tego, ilu ekspertów ją zasila.)
- zamiast *jeden STFT N=1024 @16 kHz interpolowany na oś log-f 20 centów/bin od 55 Hz* → **Front-end wielorozdzielczościowy: trzy STFT na tym samym hopie 320 — N=4096 dla binów poniżej ~200 Hz, N=2048 dla 200-700 Hz, N=1024 powyżej — zszyte w jedną oś log-f 360 binów, z jawnie udokumentowaną latencją per pasmo. Wariant tańszy i też poprawny: zejść z osi na 50 centów/bin (144 biny) i przyjąć, że tyle informacji naprawdę jest.** (Oś 20 centów/bin jest poniżej 1345 Hz gęstsza niż rozdzielczość STFT (15,625 Hz) — a wasza głowa pitch kończy się na 1046,5 Hz, więc dotyczy to CAŁEGO zakresu wyjściowego. Przy 82,41 Hz (E2) jeden bin STFT rozciąga się na 16,3 bina log-f. Tapy harmoniczne stoją w pojedynczych binach, więc szablon harmoniczny — jedyny mechanizm rozstrzygania OKTAWY — jest najtępszy dokładnie tam, gdzie błędy oktawowe faktycznie występują. Koszt naprawy: STFT rośnie z 1,5 do ~8 MFLOP/s, czyli 2,4% budżetu. Wzrost latencji dotyczy tylko pasma niskiego i jest akceptowalny, bo z niego bierzecie wzorzec harmoniczny (wielkość wolnozmienna), a nie wartość F0 (ta idzie z toru klasycznego 42,67 ms). Wersja z 50 c/bin jest darmowa i uczciwa — obniża koszt L2/L3 2,5x nie tracąc żadnej realnej informacji.)
- zamiast *"Assert bitowej równości WSZYSTKICH f32 wyjściowych. Rozbieżność = BŁĄD, nie tolerancja" na całym torze zmiennoprzecinkowym* → **Dwustopniowa bramka. (a) Tor float: porównanie metrykami z progiem, jak dla dowolnego DSP. (b) Kwantyzacja zsumowanego log-posteriora do int32 fixed-point (Q16.16) PRZED wejściem do Viterbiego, i asercja bitowej równości na skwantowanym posteriorze, na zdekodowanej ścieżce Viterbiego oraz na `state: u8` i indeksie binu. Cała arytmetyka Viterbiego (add-compare-select) w int32.** (Przenosi gwarancję tam, gdzie ma znaczenie produktowe, i czyni ją OSIĄGALNĄ. Rozjazd ostatniego bitu w twiddle FFT prawie nigdy nie zmienia tego, co widzi użytkownik; zmienia to natomiast przełączenie argmaxu przy remisie dwóch binów o niemal równym prawdopodobieństwie — i to jest jedyny mechanizm, przez który różnica platformowa staje się widoczna (skok linii o oktawę na jednym telefonie, nie na drugim). Wasza obecna bramka jest jednocześnie niespełnialna (rustfft, libm, NaN w API) i nie adresuje tego konkretnego ryzyka. Fixed-point Viterbi jest deterministyczny z definicji na każdej platformie, bez zależności od libm, bez pytań o FMA i bez konieczności pisania własnego expf. Dodatkowa korzyść: add-compare-select w int32 jest szybszy niż w f32 na każdym targecie, w tym w WASM.)
- zamiast *VocalSet użyty WYŁĄCZNIE jako materiał do resyntezy WORLD ("GT idealny co do próbki"), przy zerowej ilości prawdziwego, nieprzetworzonego śpiewu w treningu* → **Trenować na obu wersjach jednocześnie: resynteza WORLD z idealnym GT ORAZ oryginalne 10,1 h VocalSet (CC BY 4.0, prawdziwe nagrania) z pseudo-etykietami z ensemble'u, z wagą straty proporcjonalną do zgodności estymatorów w ensemble'u (ramki, na których pYIN/CREPE/RMVPE się nie zgadzają, dostają wagę bliską zeru zamiast być wyrzucane).** (Plan usuwa z treningu MIR-1K i MDB-stem-synth — czyli oba realne zbiory śpiewu — i zastępuje je 300-500 h syntezy źródło-filtr plus 10 h resyntezy plus 10 h EGG. To znaczy ZERO godzin prawdziwego, nieprzetworzonego śpiewu, przy jednoczesnym celu 96,5% HM na vocadito. Papier SwiftF0 mówi wprost przeciwnie, a wasz własny dokument to cytuje w otwartych pytaniach i nie wyciąga wniosku: recepta zwycięska u SwiftF0 to cztery zbiory realne/algorytmicznie etykietowane PLUS jeden syntetyczny (sekcja 3.6: NSynth, PTDB-TUG, MIR-1k, MDB-STEM-Synth, SpeechSynth). Kluczowe: powód wyrzucenia MIR-1K jest LICENCYJNY, nie jakościowy — a VocalSet ma czystą licencję CC BY 4.0 i jest prawdziwym śpiewem. Wyrzucanie jego oryginalnego audio z treningu w imię czystości GT to dobrowolna rezygnacja z jedynego realnego materiału, jakim legalnie dysponujecie, i to na podstawie argumentu, który papier SwiftF0 empirycznie podważa. Uczenie z etykietami ważonymi zgodnością ensemble'u to standardowe rozwiązanie i nie wymaga żadnego kompromisu licencyjnego.)
- zamiast *FSD50K jako źródło szumu do augmentacji, wpisane w tabelę jako "CC BY / czyste komercyjnie"* → **Albo FSD50K przefiltrowany do CC0 + CC-BY po dołączonych mapowaniach licencji per-klip (zostaje 34 976 z 40 966 klipów dev, w pełni wystarczająco), albo MUSAN (CC BY 4.0) jako korpus szumu i muzyki tła. W obu wypadkach lista dopuszczonych plików z SHA-256 do docs/licensing.md.** (FSD50K zawiera 4 616 klipów CC-BY-NC i 1 374 CC Sampling+ w samym dev secie (plus 1 425 i 403 w eval). Według doktryny, którą ten dokument uznaje za decydujący argument całej architektury — "model pochodny dziedziczy licencję danych treningowych" — augmentacja szumem z FSD50K zatruwa wagi identycznie jak MDB-stem-synth, tylko mniej widocznie, bo szum nie wygląda jak dane treningowe. To jedyne miejsce, gdzie dokument łamie własną, poprawną zasadę, i naprawa jest darmowa: FSD50K sam dostarcza mapowania licencji w plikach JSON.)
- zamiast *L2/L3 opisane jako "6 równoległych gałęzi 1x1 z dylatacjami {0, 60, 95, 120, 139, 155}"* → **6 równoległych projekcji 1x1 (24->8), każda czytająca wejście PRZESUNIĘTE po osi log-f o {0, 60, 95, 120, 139, 155} binów (gather z zerowym paddingiem na brzegu), potem concat 48 -> 1x1 48->24. Zaimplementować przez slicing/indeksowanie, nie przez argument `dilation`.** (Dylatacja rozstawia tapy wewnątrz jądra — na jądrze 1x1 nie ma czego rozstawiać, więc jako `dilation` to no-op dający 6 identycznych gałęzi, a `dilation=0` PyTorch odrzuca (wymagane >=1). Faktyczny mechanizm HARMOF0, do którego się odwołujecie, to dokładnie przesunięcie: harmof0/layers.py, klasa MRDConv, `x = x[:, :, :, dilation:]` po `nn.Conv2d(kernel_size=[1,1])`, i sumowanie gałęzi zamiast konkatenacji. Wasz model kosztu (0,829 MMAC) jest policzony poprawnie dla concat, więc budżet zostaje bez zmian — trzeba poprawić tylko opis operacji, ale bez tej poprawki spec jest nieimplementowalny i pierwsza próba jego realizacji da 6 kopii tego samego kanału.)
- zamiast *cel jakościowy modelu (RPA >= 97,0%, octave error <= 0,3%) uzasadniony wynikiem HARMOF0 97,94% na MDB-stem-synth, przy 2,00 MMAC/ramkę* → **Krzywa jakość-vs-koszt wyprowadzona z własnej ablacji: najpierw replika w skali HARMOF0 (352 biny, kanały 32/64/128/128, ~130 MMAC/ramkę) na własnych danych, pomiar, potem schodzenie z kanałami przy mierzeniu na każdym kroku. Do bramki CI wpisać punkt z tej krzywej, nie liczbę z papieru.** (HARMOF0 w konfiguracji domyślnej (odczytanej z harmof0/network.py: channels=[32,64,128,128], jądra [3,3], freq_bins=352, bins_per_octave=48, n_fft=1024, hop=512) to 130,6 MMAC/ramkę i ~370-400k parametrów — 65x więcej operacji i ~14x więcej parametrów niż proponowany VC-F0-Net. Przypisanie jego wyniku modelowi 65x tańszemu to ten sam błąd metodologiczny, który dokument słusznie zarzuca innym, tylko trudniejszy do zauważenia, bo liczba jest z recenzowanego papieru — tylko o innym modelu. Dodatkowo temporalne RF HARMOF0 to 9 ramek po 32 ms = ±128 ms, więc teza, że sam bias harmoniczny kupuje dokładność bez kontekstu czasowego, nie ma poparcia w cytowanym źródle. Bez tej krzywej krok 5 harmonogramu ma bramkę wyjścia, o której nikt nie wie, czy jest osiągalna — i to jest jedyne miejsce w planie, gdzie ryzyko jest nierozpoznane, a nie tylko duże.)

<details><summary>Źródła</summary>

- [SwiftF0: Fast and Accurate Monophonic Pitch Detection (Nieradzik, arXiv 2508.18440v1) — pełny PDF, tabele 1-3, architektura, zbiory treningowe](https://arxiv.org/abs/2508.18440)
- [lars76/pitch-benchmark — niezależny benchmark 12 algorytmów × 8 zbiorów (MIT, push 2026-07-22): tabela per-dataset, RPA/RCA/cents error/octave error, voicing P/R/F1, runtime CPU](https://github.com/lars76/pitch-benchmark)
- [benchmark_report.md — Aggregate Pitch Accuracy Metrics + Voicing Detection Performance + Speed Performance (surowe tabele)](https://raw.githubusercontent.com/lars76/pitch-benchmark/main/benchmark_report.md)
- [RMVPE: A Robust Model for Vocal Pitch Estimation in Polyphonic Music (Wei et al., INTERSPEECH 2023, arXiv 2306.15412v2) — pełny PDF: U-Net + BiGRU 256, mel 256 binów, hop 320, okno 2048, 360 binów × 20 centów, Tab. 1-3](https://arxiv.org/abs/2306.15412)
- [lars76/swift-f0 — README: specyfikacja I/O, 16 kHz, hop 256, zakres 46,875–2093,75 Hz](https://github.com/lars76/swift-f0)
- [Dream-High/RMVPE — GitHub API: licencja kodu Apache-2.0](https://api.github.com/repos/Dream-High/RMVPE)
- [SonyCSLParis/pesto — GitHub API: licencja LGPL-3.0 (potwierdzone, wyklucza z produktu ze sklepu)](https://api.github.com/repos/SonyCSLParis/pesto)
- [WX-Wei/HarmoF0 — GitHub API: licencja MIT (źródło pomysłu konwolucji dylatowanych po osi harmonicznej)](https://api.github.com/repos/WX-Wei/HarmoF0)
- [interactiveaudiolab/penn (FCNF0++) — GitHub API: licencja MIT](https://api.github.com/repos/interactiveaudiolab/penn)
- [Cross-domain Neural Pitch and Periodicity Estimation (Morrison et al., arXiv 2301.12258) — FCNF0++, 1440 binów × 5 centów, 11,2× real-time na CPU](https://arxiv.org/abs/2301.12258)
- [MDB-stem-synth (Zenodo) — licencja CC BY-NC 4.0, 230 stemów, GT z resyntezy. FAKT DECYDUJĄCY: taintuje wagi CREPE, RMVPE, PENN i SwiftF0](https://zenodo.org/records/1481172)
- [vocadito (Zenodo) — licencja CC BY 4.0, 40 fragmentów śpiewu solo, użyteczne komercyjnie do EWALUACJI](https://zenodo.org/records/5578807)
- [VocalSet (Zenodo) — licencja CC BY 4.0, 10,1 h, 20 śpiewaków, techniki rozszerzone; komercyjnie użyteczne do TRENINGU](https://zenodo.org/records/1442513)
- [NSynth (Magenta) — licencja CC BY 4.0, 305 979 nut, 16 kHz; komercyjnie użyteczne](https://magenta.withgoogle.com/datasets/nsynth)
- [ONNX Runtime Web — env flags i session options: wasmPaths, numThreads (crossOriginIsolated wymagane dla wielowątkowości), proxy niekompatybilny z WebGPU](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)
- [ONNX Runtime CoreML Execution Provider — MLComputeUnits, MLProgram vs NeuralNetwork, cichy fallback nieobsługiwanych operatorów na CPU](https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html)
- [Chrome: Audio Worklet Design Patterns — 'Pattern B: Cross-Thread Module Transfer' (przekazanie skompilowanego WebAssembly.Module do worklet bez fetch), HeapAudioBuffer, ring buffer, SAB vs postMessage](https://developer.chrome.com/blog/audio-worklet-design-pattern)
- [Nielsen Norman Group: Response Times — The 3 Important Limits (próg 0,1 s = 'reacting instantaneously'), za Miller 1968 i Card et al. 1991](https://www.nngroup.com/articles/response-times-3-important-limits/)
- [Burnett, Freedland, Larson, Hain — Voice F0 responses to manipulations in pitch feedback, J Acoust Soc Am 103(6):3153-61, 1998 (skala czasowa odruchu kompensacji F0)](https://pubmed.ncbi.nlm.nih.gov/9637026/)
- [arXiv API — przegląd wszystkich prac o 'pitch estimation' posortowanych malejąco po dacie: brak nowego SOTA w 2026 bijącego SwiftF0/RMVPE/CREPE](http://export.arxiv.org/api/query?search_query=abs:%22pitch+estimation%22&sortBy=submittedDate&sortOrder=descending)

</details>

---

## Filar PODCAST platformy glosowej: granica wspolna/specyficzna wobec toru SPIEW, ASR + forced alignment dla jezyka polskiego, edycja po tekscie, diaryzacja vs double-ender, automaty redakcyjne, skala danych i backend

**Werdykt:** Podcast nie jest osobnym produktem — jest PROFILEM MATERIALU (mowa) plynacym przez ten sam rdzen co spiew. Wspolne jest wszystko ponizej warstwy semantycznej: capture, streaming zapis do FLAC-24, piramida LOD, model EDL, silnik multitrack, channel strip, automatyka, offline render, LUFS/true-peak, undo, storage i sync. Specyficzne dla mowy jest dokladnie siedem rzeczy: ASR, forced alignment, indeks tekst-token-czas, detekcja zdarzen niejezykowych, adaptacyjny leveler regionowy, crossgate/mic-bleed oraz warstwa redakcyjna (rozdzialy, show notes, klipy). Kluczowa decyzja architektoniczna: NIE ufamy transkrypcji jako zrodlu prawdy o tym, co jest w audio. Whisper i Parakeet sa trenowane na oczyszczonym tekscie i systematycznie WYCINAJA wypelniacze, wiec "usun yyy klikajac w transkrypcji" (model Descripta) jest z definicji dziurawy. Zamiast tego budujemy REZYDUUM ALIGNMENTU: forced alignment z tokenem <star> pokazuje, ktore fragmenty audio nie sa wyjasnione przez transkrypcje — i to wlasnie tam siedza wypelniacze, oddechy, smiech, falstarty i cisza. To jest jednoczesnie nasz detektor, nasza przewaga nad Descriptem i uzasadnienie, dlaczego alignment jest obowiazkowy, a nie opcjonalny. Diaryzacji nie budujemy jako sciezki glownej: przy DER 17-20% na realnym materialu konwersacyjnym bledna etykieta oznacza ciecie na zlej sciezce, wiec zamiast walczyc z modelem budujemy double-ender (kazdy rozmowca nagrywa lokalnie u siebie, synchronizacja przez zegar sesji + chirp + GCC-PHAT, korekta dryfu przez resampling), gdzie DER = 0 z konstrukcji. Inferencja GPU jest serwerowa (wlasny obraz, nie API dostawcy — bo potrzebujemy verbatim, wlasnego alignera i kontroli nad slownikiem), Cloudflare bierze R2/Workers/D1/DO/Queues, ale NIE inferencje (brak GPU w Containers, Workers AI zwraca tylko WebVTT bez timestampow slownych). Edycja, render i playback zostaja lokalnie na wszystkich trzech platformach.

### Decyzje

| Pytanie | Rozstrzygnięcie | Dlaczego | Odrzucone |
|---|---|---|---|
| Gdzie dokladnie przebiega granica miedzy torem SPIEW a torem MOWA? | Granica przebiega POWYZEJ warstwy sygnalowej i EDL, a PONIZEJ warstwy semantycznej. Wspolne (jeden kod, rdzen Rust `voice-core`): capture i constraints, streaming zapis FLAC-24 z seektable, piramida peak/LOD, model EDL (source/clip/track/automation), silnik transportu na zegarze audio, channel strip (DC block, HPF, gate/expander, de-esser, EQ RBJ, kompresor, pan, gain), automatyka, streaming offli | Ta granica jest wyznaczona przez jedno pytanie: czy blok potrzebuje wiedziec, ze sygnal to mowa? Kompresor, limiter, LUFS, EDL i render nie potrzebuja. Leveler regionowy potrzebuje (bo dziala na segmentach mowy). Detektor oddechu formalnie potrzebuje tylko clarity/aperiodycznosci — czyli sygnalu, ktory JUZ produkuje pYIN dla spiewu. Dlatego oddechy sa tania funkcja: rdzen spiewu placi za nia z gor | Odrzucone: osobna aplikacja podcastowa z wlasnym silnikiem audio. Powod merytoryczny: podwoiloby to liczbe implementacji limitera, LUFS, render grafu i EDL na trzech platformach = szesc niezaleznych zrodel rozbieznosci numerycznej, ktorych nie da sie utrzymac w zgodzie golden-testami. Odrzucone tez: 'podcast jako preset presetow' bez wlasnej warstwy semantycznej — to nie oddaje tego, ze tekst jest |
| Ktory silnik ASR dla polskiego, na pulapie jakosci? | DWA modele w jednym przebiegu, fuzja, nie wybor: (A) NVIDIA Parakeet TDT 0.6B v3 (CC-BY-4.0, 600M par., 25 jezykow z polskim, WER 7,31% na Fleurs-pl, RTFx 3332, natywne timestampy slowne z predykcji trwania tokenu) jako silnik SEGMENTACJI I CZASU; (B) OpenAI Whisper large-v3 (Apache-2.0, 1,55B, 128 binow mel, -10..-20% bledu vs large-v2) przez faster-whisper/CTranslate2 (MIT, int8_float16, batched | Transducer TDT jest monotoniczny — architektonicznie nie moze przeskoczyc ani powtorzyc fragmentu, wiec nie robi petli halucynacyjnych, ktore sa najgorszym trybem awarii Whispera na dlugim materiale (3h odcinek to dokladnie ten rezim). Ale TDT ma subsampling 8x przy ramce 10 ms = 80 ms rozdzielczosci, co jest o rzad wielkosci za grubo dla ciecia (budzet 30 ms, cel 10-20 ms). Whisper ma lepszy teks | Odrzucone: Canary 1B v2 (CC-BY-4.0, 978M) — WER pl 8,40% na Fleurs, czyli gorzej niz Parakeet 7,31% przy 1,6x wiekszym modelu i RTFx 749 zamiast 3332; jego przewaga to tlumaczenie, ktorego nie potrzebujemy. Odrzucone: Moonshine (MIT) — tylko angielski, model card mowi wprost 'intended to transcribe English speech'. Odrzucone: Vosk — architektura Kaldi/Zipformer o WER dla polskiego rzedu 15-25%, uz |
| Czy Whisper/Parakeet zwracaja wypelniacze? Co z tego wynika dla edycji po tekscie? | NIE zwracaja i nie da sie tego naprawic promptem. Oba sa trenowane na napisach i pseudo-etykietach oczyszczonych z dysfluencji (Parakeet v3: 660 tys. h pseudo-labeled Granary + 10 tys. h NeMo ASR Set 3.0). Wniosek architektoniczny: TRANSKRYPCJA NIE JEST ZRODLEM PRAWDY O AUDIO. Zrodlem prawdy jest os czasu. Tekst jest PROJEKCJA. Dlatego strumien tokenow to nie sa slowa ASR, tylko: `Token = Word \|  | To rozwiazuje jednym mechanizmem cztery niezalezne problemy: wypelniacze niejezykowe, oddechy, falstarty i uczciwa miare pewnosci ('tu jest audio, ktorego nie potrafimy wyjasnic' — dokladne przeciwienstwo halucynacji). Zaden konkurent tego nie wystawia. Descript szuka wypelniaczy w tekscie, ktory ich nie zawiera, wiec strukturalnie nie moze znalezc 'yyy'. | Odrzucone: fine-tune Whispera na verbatim jako PIERWSZY krok. Merytorycznie kuszace (baza Apache-2.0, wiec wolno dystrybuowac pochodne) i docelowo warte zrobienia, ale nie zastapi rezyduum: nawet verbatim ASR nie oznaczy oddechu ani mlaskniecia, a to sa realne cele redakcyjne. Rezyduum jest nadzbiorem. Odrzucone: prompt engineering ('transcribe verbatim including fillers') — dziala niestabilnie i  |
| Ktory forced aligner, przy wymogu licencji komercyjnej i jezyka polskiego? | WLASNY aligner CTC w rdzeniu Rust (ONNX Runtime), z modelem akustycznym `jonatasgrosman/wav2vec2-large-xlsr-53-polish` (Apache-2.0, baza facebook/wav2vec2-large-xlsr-53 Apache-2.0, CER 3,49% bez LM na Common Voice pl). Ramka 20 ms (stride 320 @16 kHz). Algorytm: trellis Viterbi po posteriorach CTC + backtracking + merge_repeats, DOKLADNIE jak w whisperX/alignment.py (BSD-2-Clause, wolno podpatrzec | Token <star> jest tu nieopcjonalny i to jest sedno. Bez niego 500 ms 'yyy' zostaje wchloniete w trwanie sasiedniego slowa — granica ciecia rozjezdza sie o pol sekundy, a rezyduum znika, bo aligner rozmazal je po sasiadach. Ze <star> nieuwyjasnione audio zostaje jawnie oznaczone jako nieuwyjasnione. To jest ten sam mechanizm, ktory ma MMS_FA (with_star=True), tylko my musimy go zaimplementowac sami | ODRZUCONE TWARDO: MMS_FA / MahmoudAshraf/mms-300m-1130-forced-aligner — wagi na CC-BY-NC-4.0, potwierdzone bezposrednio na karcie modelu; sam autor pisze 'the default model has CC-BY-NC 4.0 License, so make sure to use a different model for commercial usage'. Kod BSD, wagi NC — klasyczna pulapka 'licencja kodu != licencja wag'. Dodatkowo torchaudio.pipelines.MMS_FA jest deprecated w 2.8, usuniete  |
| On-device czy serwerowo? Osobno iPhone / Android / web. | iOS: on-device przez Apple SpeechAnalyzer + SpeechTranscriber (iOS 26+) jako sciezka PIERWSZA, z runtime'owym sprawdzeniem `await SpeechTranscriber.supportedLocales` na `pl_PL`; API jest w calosci on-device, modele przez AssetInventory (nie powiekszaja bundla), zwraca `.audioTimeRange` per segment, zaprojektowane pod long-form i distant audio, wspiera volatile + finalized results. Fallback gdy bra | Apple SpeechAnalyzer to jedyny on-device ASR klasy produkcyjnej z per-token czasem, ktory nie kosztuje nas ani MB bundla, ani watta wiecej niz musi — nie wykorzystac go na iOS byloby bledem. Na Androidzie nie ma czego wykorzystac: SpeechRecognizer on-device jest short-form i slaby po polsku. Web: model 0.6-1.5B to 600 MB-1,2 GB pobrania, a WebGPU w Safari jest najslabszym ogniwem; przy 3h material | Odrzucone: transformers.js + WebGPU jako sciezka glowna dla web — nie z powodu wydajnosci samej w sobie, tylko dlatego, ze 3-godzinna sesja wymaga, by transkrypcja przezyla zamkniecie karty; przegladarka tego nie gwarantuje. Zostaje jako opcjonalny 'tryb prywatny' na malym modelu. Odrzucone: whisper.cpp jako silnik iOS gdy dostepny SpeechAnalyzer — duplikacja przy gorszym wyniku energetycznym. |
| Diaryzacja czy wlasne nagrywanie wielosciezkowe (double-ender)? | DOUBLE-ENDER jako sciezka glowna. Diaryzacja (pyannote-audio, MIT kod / speaker-diarization-community-1, wagi CC-BY-4.0, gated) TYLKO dla importu obcego pliku jednosciezkowego i oznaczona w UI jako niepewna. Double-ender: kazdy rozmowca uruchamia nasza aplikacje (web/iOS/Android), nagrywa LOKALNIE 48 kHz FLAC-24, chunki ida progresywnie do R2 przez presigned multipart; rozmowa na zywo leci osobno  | Trzy powody, wszystkie merytoryczne. (1) LICZBY: pyannote community-1 raportuje DER 17,0% na AMI IHM i 20,2% na DIHARD 3. W edycji po tekscie etykieta mowcy decyduje, KTORA SCIEZKE tniemy — 1 na 5 sekund z bledna etykieta to nie 'troche gorzej', to strukturalna nieuzywalnosc. (2) OVERLAP: diaryzacja degraduje sie najmocniej dokladnie tam, gdzie zyje podcast — przerwania, backchannele 'mhm', 'tak', | Odrzucone jako sciezka glowna: NVIDIA NeMo Sortformer/MSDD i WeSpeaker — te same problemy jakosciowe co pyannote plus ciezszy runtime; brak przewagi uzasadniajacej budowe wokol nich. Odrzucone: nagrywanie miksu z WebRTC po stronie serwera (model Zoom) — kodek stratny, AGC/AEC wlaczone po drodze, brak separacji mowcow; to jest dokladnie ten kompromis, ktory czyni podcasty 'zoomowe' rozpoznawalnymi  |
| Backend: co MUSI byc serwerowo i czy Cloudflare sie nadaje? | Serwerowo MUSZA byc: (1) inferencja GPU (ASR + aligner + diaryzacja importu), (2) koordynacja sesji double-ender (rejestr uczestnikow, zegar, autoryzacja uploadu), (3) trwale przechowanie surowych takow, (4) wywolania LLM. Lokalnie ZOSTAJE: cala edycja, playback, waveform, podglad DSP, render mastera. Cloudflare: TAK dla R2 (0,015 USD/GB-mies., egress 0 — potwierdzone), Workers (API, presigned URL | Egress zero w R2 jest dla audio decydujacy, nie kosmetyczny: odcinek wazy ~2,5 GiB i uzytkownik bedzie go pobieral wielokrotnie; na S3 sam egress zdominowalby rachunek. Jednoczesnie Worker ma 128 MB pamieci i 100 MB limitu ciala requestu (Free/Pro) — audio NIGDY nie moze przez niego przechodzic, zawsze presigned multipart bezposrednio do R2, czesci 16 MiB. Podzial 'Cloudflare = plumbing, dedykowan | Odrzucone: Workers AI jako silnik ASR — brak timestampow slownych zabija caly model rezyduum; cena bez znaczenia, skoro produkt bez tego nie istnieje. Odrzucone: wlasny stale wlaczony serwer GPU — przy 1000 odcinkow/mies. realne wykorzystanie to ~3 h GPU dziennie; scale-to-zero jest o rzad wielkosci tanszy przy identycznej jakosci. Odrzucone: transkodowanie/render w Workerze — 5 min CPU na paid to |
| Jak przechowywac 3h x 3 sciezki na kazdej z trzech platform? | Format kanoniczny WSZEDZIE: FLAC 24-bit / 48 kHz mono per sciezka, z seektable co 1 s, plus sidecar `.lod` (piramida min/max i16). Rozmiary policzone: surowy f32 to 1,931 GiB/sciezke (5,794 GiB dla trzech), i24 1,448 GiB (4,345 GiB), FLAC-24 dla mowy ~52% = ~0,75 GiB/sciezke, ~2,2-2,8 GiB dla trzech. Piramida LOD: poziomy 256/1024/4096/16384/65536/262144 probek na bucket, 4 B na bucket (min+max i1 | FLAC-24 zamiast surowego PCM to nie oszczednosc miejsca, tylko warunek istnienia wersji webowej: 5,8 GiB f32 przekracza realistyczna kwote OPFS na Safari, a 2,5 GiB FLAC nie. Bezstratnosc oznacza zero kompromisu jakosciowego, dekodowanie w Rust idzie 200-400x realtime, wiec okno 30 s dekoduje sie w ~0,1 s — random access przez seektable jest w praktyce natychmiastowy. LOD musi byc pisany podczas n | ODRZUCONE: IndexedDB na audio — brak random access, odczyt calego bloba, i to jest dokladnie awaria, ktora repo juz demonstruje (base64 dataURL w localStorage dla nagrania karaoke, pelna pitchHistory w localStorage). ODRZUCONE: surowy f32 na dysku — 5,794 GiB dla jednego odcinka bez zadnego zysku jakosciowego nad FLAC-24. ODRZUCONE: Opus jako format roboczy — stratny, a bedziemy na tym materiale r |
| Jak zbudowac edycje po tekscie tak, zeby tekst i os czasu nigdy sie nie rozjechaly? | EDL jest FUNKCJA POCHODNA strumienia tokenow, nie rownolegla struktura. Tokeny sa niezmienne, maja stabilne u64 id i stale (tStart, tEnd) — token nigdy nie zmienia czasu. Usuniecie tekstu = oznaczenie zakresu tokenow jako Deleted w logu operacji. Kompilator EDL to czysta funkcja `tokens -> aktywne zakresy tokenow -> scalone zakresy czasu -> klipy z crossfadami`. Undo = cofniecie operacji na tokena | Trojstronna synchronizacja znak-token-czas przy undo/redo, wklejaniu, autokorekcie i IME jest klasycznym zrodlem nieodwracalnych bugow — chyba ze jedna z trzech reprezentacji jest wyprowadzona z pozostalych. Wyprowadzenie EDL z tokenow czyni rozjazd matematycznie niemozliwym. Crossfade z wyrownaniem na epokach to jedyny sposob, zeby ciecie w srodku samogloski nie dalo trzasku ani skoku fazy — a ma | Odrzucone: contenteditable + mapowanie offsetow — synchronizacja DOM z EDL przy IME i autokorekcie jest niedeterministyczna. Odrzucone: tekst jako niezalezny dokument z okresowa resynchronizacja — kazda resynchronizacja to okazja do rozjazdu. |
| Wypelniacze po polsku — jak to zrobic dobrze? | DWIE ROZLACZNE KLASY, dwa mechanizmy. KLASA A, niejezykowe ('yyy' [ɨː], 'eee' [ɛː], 'mmm', 'hmm', 'eh', przeciagniete 'no...'): NIE MA ICH W TRANSKRYPCJI, znajdowane wylacznie akustycznie na rezyduum alignmentu. Kryteria (koniunkcja, ramka 10 ms): dzwieczne (clarity pYIN > 0,6), F0 plaskie (\|nachylenie\| < 40 centow/s), formanty statyczne (wariancja spectral centroid < prog, energia dMFCC nisko), | Polskie wypelniacze sa leksykalnie dwuznaczne w stopniu, w jakim angielskie 'um/uh' nie sa, i to jest twarda przewaga, ktorej zaden globalny produkt nie ma. `no` to jednoczesnie najczestszy polski wypelniacz i pelnoprawne potwierdzenie ('no tak', 'no dobra'). `nie` to negacja i pytajnik ('fajne, nie?'). `jakby` to wypelniacz i spojnik ('wygladal, jakby spal'). `takze` vs `tak ze`. Jezyk jest silni | Odrzucone: jedna lista slow kluczowych z progiem pewnosci ASR (model Descripta). Na polskim daje albo bardzo niski recall (bo 'yyy' nie ma w tekscie), albo katastrofalny precision (bo wycina 'no' i 'nie'). Odrzucone: automatyczne stosowanie zmian — usuniecie 'nie' z 'fajne, nie?' zmienia sens wypowiedzi; ryzyko nieproporcjonalne do zysku. |
| Oddechy i cisza — usuwac czy przetwarzac? | Oddechy: TLUMIC, nie usuwac. Detekcja (koniunkcja): bezdzwieczne (clarity < 0,3), spectral flatness > 0,30, RMS w [-45, -25] dBFS, trwanie 150-500 ms, sasiedztwo mowy w oknie 1 s, obecnosc w rezyduum alignmentu. Akcja: -12 do -18 dB z fade 20 ms. Cisza: adaptacyjny prog z histereza — dno szumu = 10. percentyl rozkladu poziomow calej sciezki, prog otwarcia = dno + 10 dB, zamkniecia = dno + 6 dB (hi | Usuniecie wszystkich oddechow brzmi nieludzko i jest najczestsza skarga na automaty (Descript i Alitu zbieraja za to cięgi). Skrocenie pauz do zera niszczy rytm wypowiedzi — pauza jest interpunkcja mowiona. Kompresja proporcjonalna zachowuje hierarchie pauz (dluga zostaje dluzsza od krotkiej) i to jest roznica miedzy 'zwiezle' a 'zdyszane'. | Odrzucone: staly prog bramkowania w dBFS — rozrzut miedzy mikrofonem laptopa a kondensatorem USB to 25-30 dB, ten sam prog nie moze byc poprawny dla obu. Odrzucone: usuwanie oddechow do -inf. |
| Adaptacyjny leveler — kompresor czy cos innego? | DWUSTOPNIOWY, i to jest kluczowe. Stopien 1 (wolny leveler regionowy, klasa Auphonic): segmentacja na regiony mowy (VAD + rezyduum), pomiar short-term LUFS (3 s) per region, dopasowanie wolnej krzywej gain g(t) do celu, z ograniczeniami: max slew 3 dB/s, zmiany gainu WYLACZNIE w pauzach >=100 ms tam gdzie to mozliwe, max zakres +-12 dB, ZERO gainu na regionach nie-mowy (zeby tlo pokoju nie pompowa | Pojedynczy kompresor nie potrafi wyrownac roznicy 12 dB miedzy mowca cichym a glosnym bez zniszczenia mikrodynamiki — musialby miec staly czasowa liczona w sekundach, co daje slyszalne pompowanie. Rozdzielenie na wolna korekte regionowa (dziala miedzy zdaniami) i szybka kompresje (dziala wewnatrz slowa) to dokladnie powod, dla ktorego Auphonic brzmi lepiej niz preset w DAW. Warunek 'zmiana gainu t | Odrzucone: DynamicsCompressorNode z Web Audio — brak makeup gain, brak kontroli knee, ratio nieliniowe, implementacje rozne miedzy przegladarkami; i tak nie istnieje na iOS/Android. Cala dynamika musi byc wlasna. |
| Auto-rozdzialy, show notes i klipy do social — czym to napedzac? | ROZDZIALY: fuzja trzech sygnalow, nie sam LLM. (1) leksykalna segmentacja tematyczna — embeddingi zdan, spadek podobienstwa kosinusowego w oknie kroczacym 60 s, minimum lokalne = kandydat; (2) sygnaly akustyczne — pauza > 1,2 s, reset wysokosci glosu (skok mediany F0 mowcy > 1,5 poltonu na starcie nowego bloku), zmiana gestosci zmian mowcy; (3) LLM tylko do NAZWANIA juz wyznaczonych segmentow. Zna | LLM sam w sobie halucynuje znaczniki czasu — daje sensowne tytuly przy bledzie pozycji rzedu minut. Rozdzielenie 'GDZIE' (akustyka + leksyka, mierzalne) od 'JAK SIE NAZYWA' (LLM) usuwa ten tryb awarii calkowicie. Warunek samodzielnosci klipu jest tym, czego brakuje wszystkim automatom: klip zaczynajacy sie od 'i wtedy on powiedzial' jest bezwartosciowy niezaleznie od tego, jak ciekawa jest reszta. | Odrzucone: pytanie LLM o timestampy rozdzialow. Odrzucone: wybor klipow wylacznie po scoringu 'ciekawosci' z LLM — pomija wymog samodzielnosci i granic zdaniowych. |
| Czy fine-tunowac na polskim, i co konkretnie? | TAK, w tej kolejnosci priorytetow. (1) NAJPIERW ALIGNER, nie ASR: fine-tune `wav2vec2-large-xlsr-53` (Apache-2.0) na polskiej mowie spontanicznej transkrybowanej VERBATIM (z 'yyy', 'eee', falstartami). Dane: Common Voice PL (CC0), Multilingual LibriSpeech PL (CC-BY-4.0), korpusy Clarin-PL, plus 20-50 h wlasnego materialu podcastowego z reczna korekta. Nawet 20 h in-domain verbatim mocno poprawia d | Fine-tune ASR poprawia WER, ale WER nie jest naszym waskim gardlem — bledna litera w slowie jest kosmetyczna, przesunieta granica slowa daje slyszalny artefakt ciecia. Kolejnosc priorytetow wynika wprost z tego, co uzytkownik uslyszy. | Odrzucone: fine-tune Parakeet TDT jako pierwszy krok — wagi CC-BY-4.0 pozwalaja, ale model juz ma dobre polskie WER (7,31%) i jego slaboscia jest rozdzielczosc czasowa (80 ms), ktorej fine-tune nie naprawi, bo to wlasciwosc architektury (subsampling 8x). |
| Jak zapewnic, ze iOS moze ruszyc pojutrze? | Warunkiem jest, ze w dniu zero istnieje workspace Rust `voice-core` z DWIEMA warstwami wyjscia: (a) surowe C ABI dla sciezki RT — `vc_rt_process(handle, const float* const* in, float* const* out, uint32_t nframes)`, `vc_rt_reset`, `vc_rt_set_param`, wolane bezposrednio z callbacku audio, bez alokacji, bez lockow, bez UniFFI; (b) UniFFI dla API sterujacego (projekt, EDL, transport, transkrypcja, ek | Jesli DSP zyje w TypeScripcie, port na iOS jest przepisaniem, a nie przeniesieniem — i kazda poprawka algorytmu bedzie od tego momentu robiona trzy razy z trzema roznymi bledami. Rozdzielenie C ABI (hot path) od UniFFI (control plane) jest konieczne, bo narzut FFI UniFFI na wywolanie 375 razy na sekunde (hop 256 @48 kHz na trzech sciezkach) jest nieakceptowalny, a rezygnacja z UniFFI w warstwie st | Odrzucone: jeden interfejs UniFFI do wszystkiego (narzut w callbacku RT). Odrzucone: goly C ABI do wszystkiego (recznie utrzymywane bindingi dla dwoch jezykow to gwarantowane rozjazdy). Odrzucone: jakikolwiek shared UI — wykluczone przez zalozenia i niepotrzebne, skoro cala logika jest w rdzeniu. |
| Czym konkretnie bijemy Descript, Riverside, Adobe, Auphonic i Hindenburga? | Piec przewag, kazda merytoryczna. (1) REZYDUUM ALIGNMENTU jako pierwszorzedny artefakt — nikt nie wystawia 'czego transkrypcja nie wyjasnia'. Daje wypelniacze, oddechy, smiech, falstarty i martwe powietrze w jednym przebiegu, z prawdziwym czasem akustycznym zamiast zgadywania z tekstu, plus uczciwa powierzchnie pewnosci. (2) POLSKI JAKO JEZYK PIERWSZEJ KLASY w warstwie redakcyjnej, nie tylko w ASR | Wszystkie piec wynikaja z decyzji architektonicznych podjetych wyzej, a nie z listy funkcji do dorobienia. Rezyduum jest konsekwencja alignera ze <star>; brak diaryzacji jest konsekwencja double-endera; lokalnosc jest konsekwencja rdzenia Rust; wspolnota z torem spiewu jest konsekwencja profilu materialu. | Odrzucone jako pole walki: klonowanie glosu / Overdub. Rozwiazuje problem, ktorego uzytkownik podcastu w praktyce nie ma (poprawianie pojedynczych slow), a wprowadza powazne ryzyka reputacyjne i prawne. Odrzucone: wideo. Poszerza zakres o cala rownolegla domene bez zwiazku z rdzeniem glosowym. |

### Specyfikacja

> **Uwaga metodologiczna:** budzet WebSearch byl wyczerpany na poziomie sesji (200/200) przed startem zadania. Wszystkie fakty ponizej weryfikowalem przez WebFetch bezposrednio na zrodlach pierwotnych (karty modeli HF, GitHub API, dokumentacja Cloudflare/Apple/NVIDIA, cenniki). Liczby oznaczone **[Z]** sa zweryfikowane w tej sesji. Liczby policzone przeze mnie sa deterministyczne. Jedno miejsce niepewne oznaczylem jawnie.

---

# 1. GRANICA: co jest wspolne z torem SPIEW, a co wylacznie podcastowe

## 1.1 Zasada

Podcast to **profil materialu**, nie aplikacja:

```rust
pub enum MaterialProfile {
    Speech(SpeechProfile),    // podcast, wywiad, narracja
    Singing(SingingProfile),  // trening, karaoke, nagranie wokalu
}
```

Profil wybiera **piec** rzeczy i nic wiecej:
1. constraints capture,
2. lancuch analizy (co liczymy z sygnalu),
3. preset DSP,
4. strategie segmentacji (slowa vs nuty),
5. warstwe adnotacji/oceny.

Wszystko pozostale jest `profile-agnostic`.

## 1.2 Tabela granicy (to jest kontrakt architektoniczny)

| Warstwa | Blok | SPIEW | MOWA | Kod |
|---|---|:--:|:--:|---|
| Capture | getUserMedia / AVAudioEngine / Oboe, AGC/NS/AEC off | ✓ | ✓ | wspolny |
| Capture | Kalibracja latencji round-trip (klik + cross-korelacja) | ✓ | ✓ | wspolny |
| Capture | Monitoring na sluchawki z efektami | ✓ | ✓ | wspolny |
| Zapis | Streaming FLAC-24 @48k + seektable 1 s | ✓ | ✓ | wspolny |
| Zapis | Inkrementalna piramida LOD (6 poziomow) | ✓ | ✓ | wspolny |
| Model | EDL: Source / Clip / Track / AutomationLane | ✓ | ✓ | wspolny |
| Model | Undo/redo jako log operacji + rekompilacja | ✓ | ✓ | wspolny |
| Transport | Scheduling na zegarze AudioContext / AVAudioTime | ✓ | ✓ | wspolny |
| DSP | DC block, HPF Butterworth kaskada | ✓ | ✓ | wspolny |
| DSP | EQ parametryczny RBJ (3–6 pasm) | ✓ | ✓ | wspolny |
| DSP | Kompresor feed-forward log-domain, soft knee | ✓ | ✓ | wspolny |
| DSP | Expander / gate | ✓ | ✓ | wspolny |
| DSP | De-esser split-band 5–9 kHz | ✓ | ✓ | wspolny |
| DSP | FDN reverb | ✓ | ✓ | wspolny |
| DSP | Limiter true-peak 4× oversampled, LA 5 ms | ✓ | ✓ | wspolny |
| DSP | Miernik BS.1770-4 (M / S / I / LRA / TP) | ✓ | ✓ | wspolny |
| DSP | SRC polyphase (dryf, resampling) | ✓ | ✓ | wspolny |
| DSP | Redukcja szumu (spectral gating + ONNX) | ✓ | ✓ | wspolny |
| Analiza | pYIN → F0 + clarity + aperiodycznosc | ✓ | ✓ | **wspolny (kluczowe)** |
| Analiza | Silero VAD (MIT) **[Z]** | ✓ | ✓ | wspolny |
| Render | Streaming offline render blokami 4096 | ✓ | ✓ | wspolny |
| Storage | SQLite + blob store + LOD | ✓ | ✓ | wspolny |
| Sync | UUIDv7, tombstones, event log | ✓ | ✓ | wspolny |
| Infra | Host ONNX Runtime | ✓ | ✓ | wspolny |
| — | — | — | — | — |
| Semantyka | ASR (Parakeet + Whisper) | ✗ | ✓ | **mowa** |
| Semantyka | Forced alignment CTC ze `<star>` | ✗ | ✓ | **mowa** |
| Semantyka | Indeks znak↔token↔czas, kompilator EDL z tokenow | ✗ | ✓ | **mowa** |
| Semantyka | Detektor zdarzen na rezyduum alignmentu | ✗ | ✓ | **mowa** |
| DSP | De-plosive (dynamiczny HPF 80→180 Hz) | ✗ | ✓ | **mowa** |
| DSP | Adaptacyjny leveler regionowy | ✗ | ✓ | **mowa** |
| DSP | Crossgate / mic-bleed (multitrack w jednym pokoju) | ✗ | ✓ | **mowa** |
| DSP | Dereverb WPE | ✗ | ✓ | **mowa** |
| Redakcja | Kompresja pauz swiadoma zdania | ✗ | ✓ | **mowa** |
| Redakcja | Rozdzialy / show notes / klipy | ✗ | ✓ | **mowa** |
| Semantyka | Segmentacja nut (histereza na centach) | ✓ | ✗ | **spiew** |
| Semantyka | Scoring intonacji JI/ET, vibrato | ✓ | ✗ | **spiew** |
| DSP | Pitch correction (Signalsmith Stretch, MIT) | ✓ | ✗ | **spiew** |

**Obserwacja, ktora placi za caly filar podcastowy:** detektor oddechu potrzebuje wylacznie `clarity` + `spectral flatness` + RMS. `clarity` produkuje juz pYIN dla toru spiewu. Filar PODCAST dostaje detektor oddechu **za darmo**, bo rdzen spiewu i tak musi go liczyc.

## 1.3 Workspace

```
voice-core/                      # Rust, jedno zrodlo prawdy
├── vc-dsp/                      # bloki DSP, czyste, bez I/O
├── vc-analysis/                 # pYIN, VAD, LUFS, onsety, formanty
├── vc-edl/                      # model projektu, kompilator EDL, undo
├── vc-engine/                   # graf RT + streaming render offline
├── vc-store/                    # SQLite (rusqlite) + FLAC + LOD
├── vc-speech/                   # ASR client, aligner CTC, rezyduum, fillery
├── vc-sing/                     # segmentacja nut, scoring, vibrato
├── vc-ffi-c/                    # extern "C" — sciezka RT (bez alokacji)
├── vc-ffi-uniffi/               # UniFFI — control plane (~30 funkcji)
└── vc-wasm/                     # wasm-bindgen
```

Artefakty CI z jednego commita: `voice_core.wasm`, `VoiceCore.xcframework` (+SPM), `voice-core.aar`.

Kontrakt RT (jedyna funkcja w hot path):
```c
int32_t vc_rt_process(VcHandle*, const float* const* in, uint32_t nin,
                      float* const* out, uint32_t nout, uint32_t nframes);
```
Zero alokacji, zero lockow, SPSC ring buffer na zdarzenia do UI.

---

# 2. ASR dla jezyka polskiego

## 2.1 Krajobraz — fakty zweryfikowane

| Model | Licencja **[Z]** | Param | Polski | WER pl | Timestampy slowne | Uwaga |
|---|---|---|---|---|---|---|
| **Parakeet TDT 0.6B v3** | CC-BY-4.0 | 600 M | tak (25 jez. EU) | **7,31 %** (Fleurs) | **natywne** (TDT przewiduje trwanie) | RTFx 3332; monotoniczny → brak petli halucynacyjnych |
| **Whisper large-v3** | Apache-2.0 | 1,55 B | tak | ~5–6 % (Fleurs, szac.) | DTW cross-attn, ±100–200 ms | −10…−20 % bledu vs large-v2; 128 binow mel |
| Canary 1B v2 | CC-BY-4.0 | 978 M | tak | 8,40 % (Fleurs) | word + segment | RTFx 749; przewaga = tlumaczenie (nam zbedne) |
| Moonshine tiny/base | MIT | 27/61 M | **nie** | — | — | *english-only* wg karty modelu |
| Vosk / Zipformer pl | Apache-2.0 | ~50 MB | tak | ~15–25 % | tak | tylko nawigacja |
| Apple SpeechTranscriber | platformowa | — | do sprawdzenia w runtime | — | `.audioTimeRange` | iOS 26+, w pelni on-device |

Runtime'y: `faster-whisper` MIT (int8/fp16, batched, do 4× szybciej, 2926 MB VRAM int8) **[Z]**; `whisper.cpp` MIT, 52,3 k gwiazd, Core ML/Metal/Vulkan/CUDA **[Z]**; `sherpa-onnx` Apache-2.0, bindingi Swift + Kotlin + WASM, obsluguje Parakeet **[Z]**; `onnx-asr` MIT, eksportuje Parakeet v3 z timestampami tokenowymi **[Z]**.

## 2.2 WERDYKT: fuzja dwoch modeli, timing z trzeciego

```
audio 48 kHz mono
   │
   ├─ Silero VAD (MIT) ──► segmenty mowy, padding ±200 ms
   │
   ├─► [A] Parakeet TDT 0.6B v3   ──► slowa + os czasu 80 ms + confidence
   │        monotoniczny, nie halucynuje
   │
   ├─► [B] Whisper large-v3 (faster-whisper, int8_float16, batched)
   │        condition_on_previous_text=False
   │        temperature=0
   │        no_speech_threshold=0.6
   │        hallucination_silence_threshold=2.0
   │        ──► slowa + interpunkcja + ortografia
   │
   ├─► FUZJA ROVER na poziomie slowa (kotwice = zgodne slowa,
   │    rozbieznosci rozstrzygane wg confidence; interpunkcja zawsze z [B])
   │
   └─► [C] ALIGNER CTC (wav2vec2-large-xlsr-53-polish, Apache-2.0)
            ──► granice slow @20 ms + REZYDUUM
```

**Czas NIGDY nie pochodzi z dekodera ASR.** [A] daje segmentacje, [B] daje tekst, [C] daje czas.

Parametry Whispera:
```python
model = WhisperModel("large-v3", device="cuda", compute_type="int8_float16")
segments, _ = BatchedInferencePipeline(model).transcribe(
    audio, language="pl", batch_size=16,
    condition_on_previous_text=False, temperature=0.0,
    no_speech_threshold=0.6, compression_ratio_threshold=2.4,
    hallucination_silence_threshold=2.0,
    vad_filter=True, vad_parameters=dict(min_silence_duration_ms=500),
    word_timestamps=False,   # NIE uzywamy — mamy aligner
)
```

## 2.3 On-device vs serwerowo

| Platforma | Sciezka domyslna | Fallback | Uzasadnienie |
|---|---|---|---|
| **iOS 26+** | Apple SpeechAnalyzer + SpeechTranscriber, `.audioTimeRange`, modele przez AssetInventory (0 MB bundla) **[Z]** | Parakeet TDT int8 via sherpa-onnx | jedyny on-device klasy produkcyjnej z czasem per token, w pelni lokalny, long-form **[Z]** |
| **iOS < 26** | Parakeet TDT 0.6B v3 int8 (sherpa-onnx) | serwer | — |
| **Android** | Parakeet TDT 0.6B v3 int8 (sherpa-onnx, Kotlin) | whisper.cpp base/small q5 | brak systemowego odpowiednika |
| **Web** | **serwer, zawsze** | — | 0,6–1,5 B = 600 MB–1,2 GB pobrania; Safari/WebGPU niedojrzale; sesja 3 h musi przezyc zamkniecie karty |

Runtime-check dla iOS (obowiazkowy, bo lista lokalizacji rosnie):
```swift
let locales = await SpeechTranscriber.supportedLocales
let hasPolish = locales.contains { $0.identifier(.bcp47).hasPrefix("pl") }
```
Jesli `false` → `DictationTranscriber` (gorszy) albo nasz ONNX. **Nie zakladamy, ze polski jest w zestawie.**

Twarda zasada: on-device jest trybem **prywatnym / offline**, jawnie oznaczonym jako szkicowy. Pelna sciezka jakosciowa (fuzja + aligner ze `<star>` + diaryzacja importu) na 9 track-godzinach nie miesci sie w budzecie termicznym telefonu.

## 2.4 Koszt API jako punkt odniesienia

Wszystkie ceny **[Z]** z cennikow.

| Dostawca / model | Cena | 9 track-h (3 h × 3) | Po VAD-gatingu (~3,5 h) |
|---|---|---|---|
| Cloudflare Workers AI whisper-large-v3-turbo | 0,0005 USD/min = **0,03 USD/h** | 0,27 USD | 0,11 USD |
| Groq whisper-large-v3-turbo | **0,04 USD/h** | 0,36 USD | 0,14 USD |
| Groq whisper-large-v3 | **0,111 USD/h** | 1,00 USD | 0,39 USD |
| AssemblyAI Universal-2 | 0,15 USD/h | 1,35 USD | 0,53 USD |
| AssemblyAI Universal-3.5 Pro (+diar 0,02) | 0,21 USD/h | 1,89 USD | 0,74 USD |
| ElevenLabs Scribe v2 | 0,22 USD/h | 1,98 USD | 0,77 USD |
| Deepgram Nova-3 multilingual (+diar) | 0,0092 USD/min ≈ 0,55 USD/h ⚠︎ | ≈ 5,0 USD | ≈ 1,9 USD |
| **Wlasny GPU** (Replicate L40S 0,000975 USD/s = 3,51 USD/h GPU) | ~50× RT dla Whisper int8 batched | **0,63 USD** | **0,25 USD** + aligner 0,08 USD |

⚠︎ Cennik Deepgram po konwersji do markdown pokazal jednostke „/hour" przy wartosciach, ktore w rate cardzie Deepgrama historycznie sa „per minute". Przyjmuje **per minute**; do przeliczenia przy realnym POC.

**Werdykt kosztowy:** wlasna inferencja kosztuje ~0,30–0,70 USD/odcinek vs 0,12–0,36 USD u Groqa. Roznica ~0,3 USD/odcinek kupuje: verbatim, wlasny aligner, dostep do posteriorow CTC, brak vendor locka, brak DPA. **To jest kupione tanio.** Groq zostaje jako sciezka overflow za tym samym interfejsem.

## 2.5 Fine-tuning polskiego — plan

| Priorytet | Co | Baza (licencja) | Dane | Metryka celu |
|---|---|---|---|---|
| **1** | Aligner CTC | `wav2vec2-large-xlsr-53` / `-polish` (Apache-2.0) **[Z]** | Common Voice PL (CC0) + MLS PL (CC-BY-4.0) + Clarin-PL + **20–50 h wlasnego verbatim** | MAE granicy slowa ≤ 15 ms, P95 ≤ 35 ms |
| **2** | Klasyfikator wypelniaczy | wlasny BiGRU 2×64 nad 40-dim log-mel + F0 + clarity, ~50 k par. | oznaczone rezydua z naszego korpusu | F1 ≥ 0,90 dla klasy A, ≥ 0,75 dla klasy B |
| **3** | Whisper → verbatim | `openai/whisper-large-v3` (Apache-2.0) **[Z]** — wolno dystrybuowac pochodne | ten sam korpus, transkrypcje verbatim | verbatim-WER < baseline − 2 pp |

Kolejnosc wynika z tego, co uzytkownik **uslyszy**: bledna litera jest kosmetyczna, przesunieta granica slowa daje trzask.

**Zbior ewaluacyjny (warunek wstepny czegokolwiek):** 5 h polskiego podcastu, 3 mowcow, transkrypcja **verbatim** (fillery, falstarty, oddechy oznaczone), 30-minutowy podzbior z granicami slow oznaczonymi recznie z dokladnoscia ≤10 ms. Metryki: WER, verbatim-WER, MAE i P95 granicy, F1 fillera, F1 oddechu, **odsetek ciec dajacych slyszalny trzask** (odsluch slepy, N=100 ciec).

---

# 3. Forced alignment

## 3.1 Pulapka licencyjna (zweryfikowana)

| Rozwiazanie | Kod | **Wagi** | Werdykt |
|---|---|---|---|
| `torchaudio` MMS_FA | BSD | **CC-BY-NC-4.0** | ❌ zablokowane komercyjnie; dodatkowo deprecated w 2.8, usuwane w 2.9 **[Z]** |
| `ctc-forced-aligner` | BSD | domyslny model **CC-BY-NC-4.0** — autor pisze wprost: *„make sure to use a different model for commercial usage"* **[Z]** | ❌ |
| WhisperX | BSD-2-Clause, 23,3 k ★, push 2026-07-13 **[Z]** | dla `pl` → `jonatasgrosman/wav2vec2-large-xlsr-53-polish` **[Z]** | ⚠︎ model OK, stack (Python/PyTorch) nie |
| `jonatasgrosman/wav2vec2-large-xlsr-53-polish` | — | **Apache-2.0**, CER 3,49 % bez LM **[Z]** | ✅ |
| NeMo Forced Aligner | Apache-2.0 **[Z]** | zalezne od modelu | ⚠︎ tylko CTC/hybryda-w-trybie-CTC; **nie obsluguje czystych transducerow** → nie zalignuje Parakeet TDT **[Z]** |

## 3.2 WERDYKT: wlasny aligner w rdzeniu Rust

Model akustyczny: `wav2vec2-large-xlsr-53-polish` (Apache-2.0), ONNX, ramka **20 ms** (stride 320 @16 kHz). Algorytm — trellis Viterbi CTC + backtracking + `merge_repeats`, wzorowany na `whisperx/alignment.py` (BSD-2-Clause pozwala), **z obowiazkowa modyfikacja**:

### Token `<star>` — to nie jest opcja

```
Alfabet CTC: [blank, a, ą, b, c, ć, ..., ż, ź, |]  ∪  {<star>}

log p(<star> | ramka t) = log(ε),  ε = 0,03   (strojenie 0,02–0,05)
```

`<star>` moze skonsumowac dowolna ramke, ale tylko wtedy, gdy najlepszy realny token ma posterior < ε.

**Dlaczego to jest sedno calego filaru:** bez `<star>` 500 ms „yyy" zostaje wchloniete w trwanie sasiedniego slowa. Granica ciecia rozjezdza sie o pol sekundy, a rezyduum **znika**, bo aligner rozmazal je po sasiadach. Ze `<star>` — audio nieuwyjasnione zostaje jawnie oznaczone jako nieuwyjasnione, i staje sie **wejsciem do detektorow**.

### Trojstopniowa precyzja granicy

```
1. CTC Viterbi            → granica @20 ms (rozdzielczosc ramki)
2. Refinement ±60 ms:
     onset  → argmax spectral flux (STFT 512/128, tylko przyrosty dodatnie)
     offset → argmin energii szerokopasmowej, okno 10 ms
3. Snap do przejscia przez zero ±2 ms + crossfade equal-power
```

Cel: MAE ≤ 15 ms, P95 ≤ 35 ms (budzet Descript-class to ~30 ms; celujemy nizej).

### Splicing klasy PSOLA

```
crossfade domyslny            : 8 ms, equal-power (cos/sin)
obie strony dzwieczne, ΔF0 < 2 poltony:
    dlugosc = 3 × okres podstawowy (15–30 ms)
    wyrownanie na epokach glotalnych (peak picking na residuum LPC rzedu 16)
ciecie przecinajace wybuch zwarciowy (/p/,/t/,/k/,/b/,/d/,/g/):
    przesuniecie punktu o 20 ms wstecz
```

F0 i epoki mamy z pYIN — **z rdzenia spiewu**.

### Dlugie audio

Chunking 30 s z zakladka 2 s, sklejanie po dopasowaniu w strefie zakladki; przy 3 h to 360 chunkow, ~2,5 min na L40S.

## 3.3 Rezyduum alignmentu — struktura danych

```rust
pub struct AlignmentResidual {
    /// przedzialy czasu nieprzypisane do zadnego slowa (pochlonięte przez <star>)
    pub gaps: Vec<Gap>,
}
pub struct Gap {
    pub t_start: f64, pub t_end: f64,
    pub voiced_ratio: f32,      // z pYIN clarity
    pub f0_slope_cents_s: f32,
    pub spectral_flatness: f32,
    pub rms_dbfs: f32,
    pub centroid_var: f32,
    pub star_frames: u32,
}
```

Klasyfikacja luki:

| Klasa | Warunki (koniunkcja) |
|---|---|
| **Filler (A)** | `voiced_ratio > 0,6` ∧ `|f0_slope| < 40 cent/s` ∧ `centroid_var < próg` ∧ `150 ms ≤ dur ≤ 1200 ms` ∧ `rms w ±12 dB otoczenia` |
| **Breath** | `voiced_ratio < 0,3` ∧ `flatness > 0,30` ∧ `rms ∈ [−45, −25] dBFS` ∧ `150 ms ≤ dur ≤ 500 ms` ∧ sasiedztwo mowy ≤1 s |
| **Laugh** | `voiced_ratio > 0,5` ∧ modulacja energii 4–8 Hz ∧ `dur > 400 ms` |
| **Pause** | `rms < dno_szumu + 6 dB` ∧ `dur > 200 ms` |
| **Noise** | reszta → do przegladu recznego |

---

# 4. Diaryzacja vs double-ender

## 4.1 Liczby, ktore rozstrzygaja

`pyannote/speaker-diarization-community-1` **[Z]**: kod MIT, wagi CC-BY-4.0 (gated), DER: **AMI IHM 17,0 %**, **DIHARD 3 20,2 %**, VoxConverse 11,2 %, AISHELL-4 11,7 %.

W edycji po tekscie etykieta mowcy decyduje, **ktora sciezke tniemy**. 17–20 % DER = mniej wiecej co piata sekunda z bledna etykieta. To nie jest „troche gorzej" — to strukturalna nieuzywalnosc dla operacji destrukcyjnych. Do tego diaryzacja degraduje sie najmocniej **dokladnie tam, gdzie zyje podcast**: przerwania, backchannele („mhm", „tak", „no wlasnie"), smiech na wejsciu.

## 4.2 WERDYKT: double-ender jako sciezka glowna

Diaryzacja = tylko import obcego pliku jednosciezkowego, oznaczony w UI jako niepewny.

### Architektura sesji

```
        ┌──────────────────────────── Durable Object: SESSION ────────────────┐
        │  rejestr uczestnikow, zegar sesji, autoryzacja uploadu, stan        │
        └──────┬──────────────────┬──────────────────┬────────────────────────┘
               │ WebSocket        │                  │
        ┌──────▼─────┐     ┌──────▼─────┐     ┌──────▼─────┐
        │ Klient A   │     │ Klient B   │     │ Klient C   │
        │ (web)      │     │ (iOS)      │     │ (Android)  │
        │            │     │            │     │            │
        │ LOKALNIE:  │     │ LOKALNIE:  │     │ LOKALNIE:  │
        │ FLAC-24    │     │ FLAC-24    │     │ FLAC-24    │
        │ 48 kHz     │     │ 48 kHz     │     │ 48 kHz     │
        │  + LOD     │     │  + LOD     │     │  + LOD     │
        └──────┬─────┘     └──────┬─────┘     └──────┬─────┘
               │ multipart 16 MiB, presigned          │
               └──────────────► R2 ◄──────────────────┘

        rownolegle i NIEZALEZNIE: WebRTC (Opus 32 kbps) = „telefon", nie nagranie
```

### Synchronizacja — trzy niezalezne mechanizmy

| # | Mechanizm | Parametry | Rola |
|---|---|---|---|
| 1 | **Zegar sesji** | host nadaje timecode po data channel co 5 s; klient zapisuje pary `(localSampleIndex, sessionTime)` | ciagly szacunek dryfu |
| 2 | **Chirp** | 18–20 kHz, sweep liniowy 200 ms, −40 dBFS, na starcie i co 10 min; lapany przez mikrofony pozostalych | absolutna kotwica cross-korelacyjna, niezalezna od sieci |
| 3 | **GCC-PHAT** | okna 30 s na przesluku, zakres ±5 s, rozdzielczosc 1 probka | weryfikacja koncowa |

### Korekta dryfu — obowiazkowa

Zegary konsumenckie dryfuja **20–100 ppm**. Przez 3 h:

| Dryf | Rozjazd po 3 h |
|---|---|
| 5 ppm | **54 ms** |
| 20 ppm | 216 ms |
| 100 ppm | **1,08 s** |

Ucho slyszy flam od ~10–20 ms. **Nawet 5 ppm jest slyszalne na przesluchu.** Dlatego:

```
dopasowanie MNK po kotwicach:  t_sesji = a · t_lokalny + b
resampling polyphase, a ≈ 1 ± 1e-4, filtr Kaisera β=8,6, 64 fazy
```

**Samo przesuniecie offsetu jest bledem.** To jest ta sama klasa awarii, ktora jest juz w repo (karaoke bez kompensacji round-trip, `app/record/karaoke/page.tsx:240`).

### Co double-ender daje ponad etykiety

- DER = 0 z konstrukcji, odpornosc na overlap;
- niezalezny gain staging, denoise, dereverb, AutoEQ **per glos**;
- per-speaker cel glosnosci;
- brak przeslchu → brak potrzeby crossgate w scenariuszu zdalnym;
- 48 kHz bezstratnie zamiast kodeka WebRTC.

Riverside wycenia dokladnie to: plany paid to „15/20/25 h separate track downloads" **[Z]**. To jest ich paywall — i nasza funkcja bazowa.

---

# 5. Automaty redakcyjne

## 5.1 Wypelniacze po polsku

### Klasa A — niejezykowe (bezpieczne do agresywnego usuwania)

`yyy` [ɨː], `eee` [ɛː], `mmm` [m̩ː], `hmm`, `eh`, przeciagniete `nooo`.

**Nie ma ich w transkrypcji.** Znajdowane wylacznie na rezyduum (§3.3). Detektor: reguly + BiGRU (§2.5 prio 2).

### Klasa B — leksykalne (nigdy nie usuwane automatycznie)

Slownik lemat + forma (jezyk fleksyjny — lista stringow nie wystarczy):

| Grupa | Formy |
|---|---|
| partykuly | `no`, `no wiesz`, `no dobra`, `no wlasnie` |
| metajezyk | `znaczy`, `to znaczy`, `powiedzmy`, `ze tak powiem`, `by tak rzec` |
| hedging | `jakby`, `tak jakby`, `jakos tak`, `w sumie`, `w zasadzie`, `zasadniczo`, `generalnie` |
| kontakt | `wiesz`, `wiesz co`, `rozumiesz`, `prawda?`, `nie?`, `tak?` |
| deiktyki-wypelniacze | `tego`, `tam` (`poszedlem tam do tego...`) |
| konektory nadmiarowe | `wiec` (inicjalne), `takze`, `czyli`, `w kazdym razie` |
| zgoda | `dobra`, `okej`, `ok` |
| powtorzenia | ten sam lemat 2× w oknie 600 ms |
| falstarty | fragment slowa + restart tego samego lematu |

**Twarde przypadki polskie, ktorych narzedzia anglocentryczne nie lapia:**
- `nie` = negacja **i** pytajnik (`fajne, nie?`) → nigdy auto-usuwanie;
- `no` = najczestszy wypelniacz **i** pelne potwierdzenie (`no tak`, `no dobra`);
- `jakby` = wypelniacz **i** spojnik (`wygladal, jakby spal`);
- `takze` vs `tak ze`;
- `czyli` = wypelniacz **i** realny konektor logiczny.

### Scoring i polityka

```
s = 0,35 · leksykalnyPrior
  + 0,35 · prozodia
  + 0,30 · kontekst

prozodia = izolacja pauzami ≥120 ms z obu stron
         ∧ |f0_slope| < 40 cent/s
         ∧ trwanie < 0,7 × mediana trwania tego lematu w odcinku
         ∧ energia −3…−8 dB vs otoczenie

kontekst = klasyfikator/LLM: „czy usuniecie zmienia sens?"  (0 = zmienia)
```

Progi: `konserwatywny s>0,85` (domyslny) / `zbalansowany 0,70` / `agresywny 0,55`.

**Zawsze:** wynik to **diff EDL**, nie zmiana. Przegladalny pozycja po pozycji, z podgladem A/B, z pelnym undo.

## 5.2 Oddechy — tlumic, nie usuwac

```
detekcja: voiced_ratio < 0,3 ∧ flatness > 0,30
        ∧ rms ∈ [−45, −25] dBFS ∧ 150 ≤ dur ≤ 500 ms
        ∧ sasiedztwo mowy ≤ 1 s  ∧  obecnosc w rezyduum
akcja:    −12 … −18 dB, fade in/out 20 ms
```

Usuniecie wszystkich oddechow brzmi nieludzko — to najczestsza skarga na Descript i Alitu.

## 5.3 Cisza — kompresja, nie kasowanie

```
dno_szumu = 10. percentyl rozkladu RMS calej sciezki (okno 20 ms, hop 10 ms)
otwarcie  = dno + 10 dB
zamkniecie= dno + 6 dB          (histereza 4 dB)
fallback stały jesli adaptacja zawiedzie: −38 / −42 dBFS

nowaPrzerwa = min(przerwa, cel + (przerwa − cel) · 0,35)
cel = 350 ms wewnatrz zdania
      600 ms miedzy turami mowcow
minimum bezwzglednie zachowane: 120 ms
```

Na multitracku: **pauza istnieje tylko wtedy, gdy wszystkie sciezki sa ciche jednoczesnie.**

Kompresja proporcjonalna (a nie do stalej wartosci) zachowuje **hierarchie** pauz — dluga pozostaje dluzsza od krotkiej. To jest roznica miedzy „zwiezle" a „zdyszane".

## 5.4 Adaptacyjny leveler — dwustopniowy

```
STOPIEN 1 — wolny leveler regionowy (klasa Auphonic)
  segmentacja mowy (VAD + rezyduum)
  short-term LUFS (3 s) per region
  krzywa g(t) → cel, z ograniczeniami:
      max slew         3 dB/s
      zmiany gainu     tylko w pauzach ≥100 ms (gdy mozliwe)
      zakres           ±12 dB
      regiony nie-mowy g = 0 dB  (tlo pokoju nie pompuje)

STOPIEN 2 — kompresor (dynamika wewnatrzwyrazowa)
  ratio 2,5:1, prog −22 dBFS, atak 8 ms, release 120 ms, soft knee 6 dB

STOPIEN 3 — limiter true-peak
  4× oversampling, look-ahead 5 ms, ceiling −1 dBTP
```

Cel masteringu: **−16 LUFS-I**, **LRA ≤ 8 LU**, **TP ≤ −1 dBTP**.

Metrologia BS.1770-4 (semantyka libebur128, MIT, przepisana do Rust): K-weighting = shelving HP +4 dB @1681 Hz + RLB HP @38 Hz; bloki 400 ms, zakladka 75 %; gating −70 LUFS absolutny + −10 LU relatywny.

⚠︎ Pulapka +3 LU: BS.1770 sumuje srednie kwadratow kanalow — ten sam glos jako mono i jako dual-mono stereo rozni sie o 3 LUFS. **Mierzymy zawsze plik dostarczany, nie bufor roboczy.**

## 5.5 Lancuch DSP per sciezka mowy (kolejnosc sztywna)

```
1. DC block            jednobiegunowy HP @5 Hz
2. HPF                 Butterworth 12 dB/okt: 80 Hz M / 100 Hz K
                       notch 50/100/150 Hz Q=30 tylko przy brumie
3. De-plosive          detektor RMS 20–120 Hz; przy przekroczeniu
                       dynamiczny HP 80 → 180 Hz, atak 2 ms, release 80 ms
4. Denoise             spectral gating: prog = dno + 6 dB, max −12 dB
                       (opcjonalnie GTCRN/DPDFNet ONNX, wet 60–80 %)
5. Dereverb            WPE single-channel: taps 24, delay 3 ramki, 4 iteracje
6. Crossgate           tylko multitrack w jednym pokoju (§5.6)
7. AutoEQ              analiza dlugoterminowego widma vs krzywa docelowa
                       mowy; max ±6 dB na pasmo, 6 pasm, Q 0,7–2,0
8. De-esser            split-band 5–9 kHz, prog adaptacyjny, ratio 4:1
9. Leveler regionowy   §5.4 stopien 1
10. Kompresor          §5.4 stopien 2
11. Gain
```
Sumowanie → limiter master → pomiar → eksport.

## 5.6 Crossgate / mic-bleed (tylko jeden pokoj)

```
dla sciezki i, ramka 10 ms, 3 pasma (0–300 / 300–3k / 3k–16k Hz):
  dominacja_i = E_i / max_{j≠i} E_j
  jesli dominacja_i < 1 (nie jest dominujaca) ORAZ
        lag GCC-PHAT(i, dominujaca) ∈ [0, 30 ms]   (plauzybilne opoznienie akustyczne)
  → tlumienie do −18 dB, atak 5 ms, release 150 ms
```
Warunek lagu chroni przed tlumieniem realnej mowy nakladajacej sie (dwie osoby mowia naraz — wtedy lag jest losowy, nie akustyczny).

## 5.7 Rozdzialy

```
(1) LEKSYKA   embeddingi zdan, okno kroczace 60 s, spadek cos-sim
              → minima lokalne = kandydaci
(2) AKUSTYKA  pauza > 1,2 s
              reset F0 (skok mediany mowcy > 1,5 poltonu na starcie bloku)
              zmiana gestosci zmian mowcy
(3) LLM       wylacznie NAZWANIE juz wyznaczonych segmentow
```
Znacznik = sygnal akustyczny najblizszy granicy leksykalnej, zaokraglony do poczatku zdania.
Eksport: **ID3v2 CHAP/CTOC** w MP3 + **Podcasting 2.0 JSON Chapters**.

**LLM nigdy nie podaje timestampow.** To likwiduje caly tryb awarii „sensowny tytul, pozycja bledna o minuty".

## 5.8 Show notes i klipy

Show notes: LLM nad transkrypcja z timestampami; **kazdy punkt obowiazkowo z cytowanym znacznikiem czasu** (weryfikowalnosc = brak halucynacji).

Klipy — scoring kandydata:
```
s = 0,30 · samodzielnosc      (brak nierozwiazanej anafory w 1. zdaniu)
  + 0,25 · wyrazistosc        (ekskursja energii i F0 > 80. percentyla odcinka)
  + 0,20 · reakcja            (smiech / mowa nakladajaca na innej sciezce)
  + 0,15 · dopasowanie dlugosci (20–75 s, szczyt 45 s)
  + 0,10 · czystosc granic    (start = granica zdania, koniec = kropka + ≥400 ms pauzy)
```
Warunek samodzielnosci jest tym, czego brakuje wszystkim automatom: klip zaczynajacy sie od „i wtedy on powiedzial" jest bezwartosciowy niezaleznie od tresci.

---

# 6. Skala danych: 3 h × 3 sciezki

## 6.1 Liczby (policzone, 48 kHz mono, 10 800 s, 518 400 000 probek/sciezke)

| Format | Na sciezke | **3 sciezki** | Zastosowanie |
|---|---|---|---|
| PCM f32 | 1,931 GiB | **5,794 GiB** | ❌ nigdy na dysku |
| PCM i24 | 1,448 GiB | 4,345 GiB | ❌ |
| PCM i16 | 0,966 GiB | 2,897 GiB | ❌ (utrata bitow) |
| **FLAC-24 (~52 % dla mowy)** | **~0,75 GiB** | **~2,2–2,8 GiB** | ✅ **kanoniczny** |
| Opus 96 kbps | 129,6 MB | 389 MB | proxy / podglad |
| Opus 48 kbps | 64,8 MB | 194 MB | upload podgladowy live |
| MP3 128 kbps stereo (master 3 h) | — | 173 MB | eksport |
| AAC 96 kbps stereo | — | 130 MB | eksport |

## 6.2 Piramida LOD

| Poziom | Probek/bucket | Buckety/sciezka | Rozmiar |
|---|---|---|---|
| L0 | 256 (5,33 ms) | 2 025 000 | 8,100 MB |
| L1 | 1 024 | 506 250 | 2,025 MB |
| L2 | 4 096 | 126 562 | 0,506 MB |
| L3 | 16 384 | 31 640 | 0,127 MB |
| L4 | 65 536 | 7 910 | 0,032 MB |
| L5 | 262 144 | 1 977 | 0,008 MB |
| **Razem** | | | **10,80 MB / sciezke → 32,4 MB / 3** |

Bucket = `(min: i16, max: i16)` = 4 B. Pisana **inkrementalnie** podczas nagrywania (wygenerowanie po fakcie = pelny odczyt 2,5 GiB).

**Sprawdzenie glebokosci:** pelny widok 3 h na 1920 px = 5,625 s/px = **270 000 probek/px** → potrzebny L5 (262 144), 1,03 bucketa/px. **Piramida musi miec 6 poziomow, nie 3.** Regula wyboru: `L` takie, ze `samplesPerPixel / bucketSize ∈ [1, 4)`.

## 6.3 Transkrypcja

Polski ~135 slow/min; 3 h realnej mowy ≈ **24 300 slow**.
Rekord binarny: `id u32 + tStart f32 + tEnd f32 + conf f16 + flags u8 + text` ≈ 24 B → **~580 kB**. W SQLite z indeksami ~3 MB. Nieistotne.

## 6.4 Budzet RAM podczas edycji (twardy wymog)

```
ring playback: 3 sciezki × 8 s × 48 kHz × f32 =  4,6 MB
scratch dekodera FLAC (3 × 64 kB ramek)      =  ~2 MB
LOD w pamieci (tylko widoczne poziomy)        =  ~3 MB
graf render (bloki 4096 × 8 wezlow × 3)       =  ~1 MB
──────────────────────────────────────────────────────
CEL: < 64 MB working set, niezaleznie od dlugosci projektu
```

**Render 3 h stereo musi byc streamingiem** blok po bloku (4096 ramek) prosto do pliku. Pelny bufor to 3,86 GiB — dokladnie ten blad jest dzis w repo (`lib/audio-processor.ts:262`, `audioBufferToWavBlob` buduje zwykla tablice JS ze wszystkich probek).

## 6.5 Storage per platforma

| | Web | iOS | Android |
|---|---|---|---|
| Blob audio | **OPFS** + `FileSystemSyncAccessHandle` (dedykowany Worker) | `FileManager`, Application Support, `isExcludedFromBackup=true` | `getExternalFilesDir()` |
| Baza | SQLite Wasm na VFS OPFS | SQLite (rusqlite w rdzeniu) | SQLite (rusqlite w rdzeniu) |
| Trwalosc | `navigator.storage.persist()` **obowiazkowo** | natywna | natywna |
| Eksport | File System Access / download | Files / share sheet | MediaStore |

Wsparcie `FileSystemSyncAccessHandle` **[Z]**: 93,39 % globalnie; Chrome 102+, Firefox 111+, Edge 102+, Safari (desktop i iOS) 15.2+, Chrome Android 150+.

**IndexedDB jest zdyskwalifikowane dla audio**: brak random access, odczyt calego bloba. Repo juz demonstruje ta awarie (base64 dataURL w `localStorage` dla karaoke, pelna `pitchHistory` w `localStorage`).

Bez `persist()` Safari usuwa dane po 7 dniach nieuzywania — to musi byc **jawnie pokazane w UI**: „Ten projekt istnieje tylko lokalnie — wlacz synchronizacje albo zainstaluj aplikacje".

Uklad OPFS:
```
/projects/{projectId}/
    project.sqlite
    sources/{sourceId}.flac          # 24-bit, seektable co 1 s
    sources/{sourceId}.json          # sr, kanaly, dlugosc, sha256, drift(a,b)
    peaks/{sourceId}.lod             # 6 poziomow, naglowek 64 B
    proxy/{sourceId}.opus            # 48 kbps, do scrubbingu
    transcript/{sourceId}.tokens     # binarny strumien tokenow
    render/                          # wyniki eksportu
```

## 6.6 Constraints capture

```javascript
// web
getUserMedia({ audio: {
  echoCancellation: false, noiseSuppression: false, autoGainControl: false,
  channelCount: 1, sampleRate: 48000
}})
// OBOWIAZKOWO sprawdzic track.getSettings() — Safari i czesc Androidow
// ignoruja czesc constraintow
```
```swift
// iOS
try session.setCategory(.playAndRecord, mode: .measurement,
                        options: [.allowBluetoothHFP, .defaultToSpeaker])
try session.setPreferredSampleRate(48000)
try session.setPreferredIOBufferDuration(0.005)   // 256 ramek
// Info.plist: UIBackgroundModes = ["audio"]
// obsluzyc AVAudioSession.interruptionNotification I routeChangeNotification
```
```kotlin
// Android — Oboe
AudioSource.UNPROCESSED                 // jesli PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED
    ?: AudioSource.VOICE_RECOGNITION    // fallback: najmniej przetworzone z gwarantowanych
// NIGDY: MIC, VOICE_COMMUNICATION
// foreground service typu microphone
```

**Sluchawki sa wymogiem produktu dla PODCAST.** Bez nich trzeba wlaczyc AEC, a AEC nieodwracalnie niszczy nagranie.

---

# 7. Backend

## 7.1 Podzial

| Musi byc serwerowo | Zostaje lokalnie |
|---|---|
| Inferencja GPU (ASR + aligner + diaryzacja importu) | Cala edycja i EDL |
| Koordynacja sesji double-ender | Playback i scrubbing |
| Trwale przechowanie takow | Waveform i LOD |
| Wywolania LLM (klucze) | Podglad DSP w czasie rzeczywistym |
| Wspoldzielenie / publikacja | **Render mastera** |

## 7.2 Cloudflare — co tak, co nie

| Usluga | Werdykt | Uzasadnienie **[Z]** |
|---|---|---|
| **R2** | ✅ | 0,015 USD/GB-mies., **egress 0 USD**, Class A 4,50/mln, Class B 0,36/mln, free 10 GB |
| **Workers** | ✅ API, presigned, orkiestracja | 5 min CPU (paid), **128 MB RAM**, body 100 MB (Free/Pro) → **audio nigdy przez Workera** |
| **Durable Objects** | ✅ jeden DO na sesje | naturalny nosnik zegara sesji i rejestru uczestnikow |
| **D1** | ✅ metadane | — |
| **Queues** | ✅ dispatch jobow | — |
| **Containers** | ❌ dla inferencji | max **4 vCPU / 12 GiB / 20 GB** w custom instance; **w calej dokumentacji limitow ani slowa o GPU** |
| **Workers AI Whisper** | ❌ | 0,0005 USD/min (najtaniej), ale zwraca **wylacznie WebVTT** — bez timestampow slownych, bez posteriorow, bez podmiany modelu → caly model rezyduum niewykonalny |

**GPU:** Modal albo RunPod serverless (scale-to-zero) z wlasnym obrazem. Punkt odniesienia: Replicate L40S **0,000975 USD/s = 3,51 USD/h** **[Z]**, A100-80GB 0,001400 USD/s, T4 0,000225 USD/s.

## 7.3 Ksztalt

```
Klient ──► Worker /api/session/create ──► DO(SESSION)
                                            │ rejestr, zegar, tokeny
Klient ──► Worker /api/upload/init  ──► presigned multipart (16 MiB parts)
Klient ──────────────────────────────► R2  (bezposrednio, NIE przez Workera)
Klient ──► Worker /api/upload/complete ──► Queue(TRANSCRIBE)
                                            │
                              Modal/RunPod worker (L40S, scale-to-zero)
                                pull z R2 → Silero VAD
                                          → Parakeet TDT v3
                                          → Whisper large-v3 (faster-whisper)
                                          → fuzja ROVER
                                          → aligner CTC ze <star>
                                          → rezyduum + klasyfikacja
                                push .tokens + .residual do R2
                                            │
                                       Worker → D1 (stan) → WS push do klienta
                                            │
Klient ◄──────────────────────── pobiera .tokens (~580 kB) i edytuje LOKALNIE
```

## 7.4 Koszt (1000 odcinkow/mies., odcinek = 3 h × 3 sciezki)

| Pozycja | Wyliczenie | USD/mies. |
|---|---|---|
| R2 storage | 1000 × 2,5 GiB = 2,5 TB × 0,015 | **37,50** |
| R2 operacje | ~500 Class A/odcinek × 1000 = 0,5 mln × 4,50 | **2,25** |
| R2 egress | 0 | **0,00** |
| GPU (VAD-gated ~3,5 h mowy/odcinek) | ~0,33 USD/odcinek | **330** |
| LLM (rozdzialy + notatki + klipy, ~110 k tok./odcinek) | ~0,05 USD/odcinek | **50** |
| Workers / D1 / DO / Queues | — | **25** |
| **Razem** | | **≈ 445 USD → 0,45 USD / odcinek** |

Porownanie: Descript Creator 24 USD/mies. za **30 h** mediow **[Z]** = 0,80 USD/h. Nasze 9 track-h kosztuja 0,45 USD calosciowo.

**Dlaczego egress 0 jest decydujacy, a nie kosmetyczny:** odcinek wazy 2,5 GiB i uzytkownik pobiera go wielokrotnie (master, sciezki surowe, klipy). Na S3 przy 3 pobraniach/odcinek: 1000 × 7,5 GiB × 0,09 USD/GB = **675 USD/mies. samego egressu** — wiecej niz caly nasz rachunek.

---

# 8. Poprzeczka i wedge

## 8.1 Konkurencja — co robia dobrze, gdzie sa slabi

| Produkt | Mocne | Slabe |
|---|---|---|
| **Descript** | Najlepsza edycja po tekscie na rynku; Studio Sound; usuwanie fillerow; 25 jezykow **[Z]** | Transkrypcja **jest** modelem → brak pelnoprawnej edycji falowej i DSP; fillery szukane w tekscie, ktory ich nie zawiera; logika redakcyjna anglocentryczna; cloud-only; limity godzin (Creator 30 h/mies. za 24 USD) **[Z]** |
| **Riverside** | Najlepszy capture zdalny: lokalne nagrywanie, osobne sciezki, 48 kHz, 4K **[Z]** | Edytor slaby; multitrack jest paywallem (15/20/25 h pobran) **[Z]**; brak powaznego DSP |
| **Adobe Podcast** | Enhance Speech to swietny pojedynczy trick | Brak edytora; agresywne przetwarzanie niszczy muzyke i material niemowny; zero kontroli |
| **Auphonic** | **Najlepszy automatyczny mastering na rynku**: adaptive leveler, multitrack crossgate + ducking, AutoEQ z **czasowymi profilami per mowca**, presety zgodnosci loudness, cut listy **[Z]** | **Zero edytora**; batch-only; brak interaktywnej weryfikacji propozycji |
| **Hindenburg PRO** | Prawdziwy DAW slowa mowionego: voice profiler, clipboard, workflow record→transcribe→edit→montage→mix→publish **[Z]** | Desktop-only, przestarzale UI, brak warstwy automatycznej |

## 8.2 Piec przewag — kazda wynika z decyzji architektonicznej, nie z listy funkcji

1. **Rezyduum alignmentu jako artefakt pierwszej klasy.** Nikt nie wystawia „czego transkrypcja nie wyjasnia". Jeden przebieg daje: wypelniacze niejezykowe, oddechy, smiech, falstarty, martwe powietrze — z **prawdziwym czasem akustycznym**, nie ze zgadywania z tekstu. Plus uczciwa powierzchnia pewnosci: „tu jest audio, ktorego nie potrafimy wytlumaczyc" to dokladne przeciwienstwo halucynacji. *Wynika z: aligner ze `<star>`.*

2. **Polski jako jezyk pierwszej klasy w warstwie redakcyjnej**, nie tylko w ASR. Slownik lemat+forma, prozodia, kontekst, twarda zasada nieusuwania pozycji dwuznacznych (`no`, `nie`, `jakby`, `czyli`). Descript ma 25 jezykow w ASR i angielska logike redakcyjna. *Wynika z: rozdzielenia klasy A od klasy B.*

3. **Double-ender z korekta dryfu jako fundament → DER = 0.** Kazdy automat (leveler, denoise, EQ, gate, AutoEQ) dziala per glos, nie per miks. *Wynika z: odrzucenia diaryzacji jako sciezki glownej.*

4. **Edycja i render lokalnie; chmura tylko tam, gdzie potrzebny GPU.** Descript i Riverside nie moga tego zrobic — ich model biznesowy to godziny mediow na serwerze. My mamy z tego jednoczesnie: prywatnosc, brak limitow godzin, dzialanie offline i sensowne aplikacje natywne. *Wynika z: rdzenia Rust.*

5. **Jeden rdzen, trzy czasowniki.** Detektor periodycznosci znajdujacy oddechy to ten sam pYIN, ktory ocenia intonacje. LUFS, limiter, timeline, EDL, render, storage — wspolne. Zaden konkurent nie ma produktu, w ktorym poprawa detektora F0 jednoczesnie poprawia trening wokalu i jakosc ciecia podcastu. *Wynika z: profilu materialu.*

## 8.3 Czego swiadomie NIE robimy

- **Klonowanie glosu / Overdub** — rozwiazuje problem, ktorego uzytkownik podcastu w praktyce nie ma, przy powaznym ryzyku reputacyjnym.
- **Wideo** — cala rownolegla domena bez zwiazku z rdzeniem glosowym.
- **Diaryzacja jako sciezka glowna** — §4.1.

---

# 9. Kolejnosc budowy (bez szacunkow czasu — sa nieistotne)

Kolejnosc jest wymuszona **zaleznosciami**, nie wysilkiem:

```
0. Zbior ewaluacyjny: 5 h polskiego podcastu, verbatim, 30 min z granicami ≤10 ms.
   BEZ TEGO NIE DA SIE STWIERDZIC, CZY COKOLWIEK DZIALA.

1. voice-core: vc-dsp + vc-analysis (pYIN, VAD, LUFS) + golden testy na 4 targetach.
   Artefakty CI: .wasm / .xcframework / .aar.

2. vc-store: FLAC-24 + seektable + LOD + SQLite. Streaming zapis i streaming render.

3. vc-edl + vc-engine: model EDL, kompilator, undo jako log, transport na zegarze audio.
   ► w tym momencie SPIEW i PODCAST maja wspolny fundament i iOS moze ruszyc.

4. Capture double-ender: DO sesji, zegar, chirp, GCC-PHAT, resampling dryfu, upload R2.

5. vc-speech serwerowo: VAD → Parakeet → Whisper → fuzja → aligner ze <star> → rezyduum.
   Bramka: MAE granicy ≤15 ms, P95 ≤35 ms na zbiorze z kroku 0.

6. Indeks token↔czas + kompilator EDL z tokenow + widok tekstu (bez contenteditable).
   Bramka: 0 rozjazdow tekst/timeline w 10 000 losowych sekwencjach edycji (fuzzing).

7. Detektory na rezyduum: filler A, breath, laugh, pause. Klasyfikator BiGRU.
   Bramka: F1 ≥ 0,90 (A) / ≥ 0,75 (B).

8. Lancuch DSP mowy: de-plosive, denoise, dereverb, AutoEQ, de-esser, leveler 2-stopniowy,
   limiter. Bramka: −16 LUFS ±0,3, TP ≤ −1 dBTP, LRA ≤ 8 LU na 20 realnych odcinkach.

9. Warstwa redakcyjna: rozdzialy (leksyka+akustyka+LLM), show notes, klipy.

10. Diaryzacja importu (pyannote) — jedyny moment, w ktorym jest potrzebna.
```

Krok 3 jest bramka dla iOS: od niego shell natywny to `AVAudioEngine tap → vc_rt_process → SwiftUI z view-modeli rdzenia`. **Zero DSP w Swift. Kiedykolwiek.**

---

# 10. Rejestr licencji (do `docs/licensing.md`, z SHA-256 kazdego pliku wag)

| Komponent | Licencja **[Z]** | Obowiazek |
|---|---|---|
| Whisper large-v3 (wagi) | Apache-2.0 | — (wolno dystrybuowac fine-tune) |
| Parakeet TDT 0.6B v3 (wagi) | CC-BY-4.0 | **atrybucja NVIDIA** w ekranie Licencje |
| Canary 1B v2 (wagi) | CC-BY-4.0 | atrybucja (jesli uzyty) |
| wav2vec2-large-xlsr-53-polish | Apache-2.0 | — |
| faster-whisper / CTranslate2 | MIT | — |
| whisper.cpp | MIT | — |
| sherpa-onnx | Apache-2.0 | NOTICE |
| onnx-asr | MIT | — |
| Silero VAD | MIT | — |
| pyannote-audio (kod) | MIT | — |
| pyannote community-1 (wagi) | CC-BY-4.0, gated | atrybucja + akceptacja warunkow |
| WhisperX (algorytm alignmentu) | BSD-2-Clause | atrybucja przy przepisaniu |
| NeMo (narzedzia offline) | Apache-2.0 | NOTICE |
| libebur128 (semantyka) | MIT | — |
| Signalsmith Stretch | MIT | — (tor SPIEW) |
| **MMS_FA / mms-300m-1130-forced-aligner** | **CC-BY-NC-4.0** | 🚫 **ZAKAZ — wpisac na czarna liste w CI** |
| **PESTO** | **LGPL-3.0** | 🚫 zakaz (statyczne linkowanie w sklepie) |
| **aubio / essentia.js / pitchfinder / TarsosDSP** | GPL-3 / AGPL-3 | 🚫 zakaz |

Regula polityki: **do produktu wchodza wylacznie modele z licencja permisywna lub CC-BY NA KODZIE I NA WAGACH.** Weryfikacja w CI: skrypt sprawdza SHA-256 i pole `license` kazdego pobranego artefaktu wobec allowlisty.

### Zależności

- Zbior ewaluacyjny PL: 5 h polskiego podcastu, 3 mowcow, transkrypcja VERBATIM (z 'yyy', 'eee', falstartami, oznaczonymi oddechami) + 30-minutowy podzbior z recznie oznaczonymi granicami slow z dokladnoscia <=10 ms. Bez tego nie da sie zmierzyc ani alignera, ani detektorow, ani fine-tune'u. To jest zaleznosc numer zero dla calego filaru.
- voice-core (Rust) z dwiema warstwami FFI: surowe C ABI dla sciezki RT (vc_rt_process, bez alokacji i lockow) + UniFFI dla control plane (~30 funkcji, tylko POD). CI produkujace z jednego commita: voice_core.wasm, VoiceCore.xcframework + SPM, voice-core.aar. To jest warunek tego, zeby iOS mogl ruszyc pojutrze.
- vc-store: streaming enkoder/dekoder FLAC-24 z seektable co 1 s + inkrementalny builder piramidy LOD (6 poziomow) + SQLite przez rusqlite. Musi istniec ZANIM powstanie jakikolwiek UI edytora, bo determinuje model dostepu do danych na wszystkich trzech platformach.
- vc-edl: model EDL i kompilator 'tokeny -> aktywne zakresy -> klipy z crossfadami' jako czysta funkcja, plus undo jako log operacji. Jest wspolna zaleznoscia SPIEWU i PODCASTU — dopoki nie istnieje, oba tory produkuja niekompatybilne dane.
- Streaming offline render (bloki 4096 ramek prosto do pliku). Warunek eksportu czegokolwiek dluzszego niz kilka minut; obecny kod (lib/audio-processor.ts:262) ma tu blad OOM.
- Infrastruktura GPU serverless (Modal albo RunPod) z obrazem zawierajacym: Silero VAD + Parakeet TDT v3 + faster-whisper large-v3 + wlasny aligner CTC ONNX. Cloudflare tego nie dostarczy (brak GPU w Containers).
- Cloudflare: R2 bucket + Worker API + Durable Object na sesje + D1 + Queues. Presigned multipart 16 MiB. Audio nigdy nie przechodzi przez Workera (limit 128 MB RAM / 100 MB body).
- Kanal WebRTC dla rozmowy na zywo w sesji double-ender (LiveKit Cloud albo wlasny SFU) — jest niezalezny od nagrywania, ale bez niego double-ender nie ma sensu produktowego.
- Model ONNX alignera: eksport jonatasgrosman/wav2vec2-large-xlsr-53-polish do ONNX z wystawieniem posteriorow CTC (nie tylko argmax). Bez posteriorow nie ma trellisa Viterbiego, nie ma <star> i nie ma rezyduum.
- Naprawa fundamentow toru capture, ktore sa dzis martwe: MediaRecorder nigdy nie startuje (contexts/audio-recorder-context.tsx:62), brak kompensacji round-trip (app/record/karaoke/page.tsx:240), audio w localStorage jako base64. Filar podcastowy dziedziczy ten tor — nie da sie na nim budowac przed naprawa.
- Polityka licencyjna w CI: allowlista licencji wag + weryfikacja SHA-256 kazdego pobieranego artefaktu. Bez tego CC-BY-NC (MMS_FA) albo LGPL wejdzie do buildu przez przypadek.

### Ryzyka

- Polski moze nie byc w zestawie lokalizacji Apple SpeechTranscriber. WWDC nie podaje listy, a API kaze sprawdzac ja w runtime (SpeechTranscriber.supportedLocales). Jesli pl nie ma, sciezka on-device na iOS spada do DictationTranscriber (gorszy) albo do wlasnego Parakeet ONNX (~600 MB pobrania). To zmienia ekonomike i UX pierwszego uruchomienia na iOS, nie plan.
- Parakeet TDT v3 ma subsampling 8x przy ramce 10 ms = 80 ms rozdzielczosci timestampow. To jest wlasciwosc architektury, ktorej fine-tune nie naprawi. Cala precyzja czasowa zalezy wiec od jednego komponentu — alignera CTC. Jesli aligner nie dowiezie MAE <=15 ms na polskiej mowie spontanicznej, edycja po tekscie bedzie dawala slyszalne artefakty i nie ma planu B poza fine-tunem alignera.
- Deklarowany WER Parakeeta dla polskiego (7,31%) pochodzi z Fleurs — czytana mowa studyjna. Mowa spontaniczna w podcascie ma inny rozklad: falstarty, nakladanie, akcent regionalny, slownictwo domenowe. Realny WER moze byc 2-3x wyzszy i to samo dotyczy Whispera. Roznica ta uderza najmocniej w warstwe redakcyjna (rozdzialy, klipy), nie w timing.
- Token <star> z ustalonym eps=0,03 jest strojeniem globalnym, a optymalna wartosc moze zalezec od SNR i mowcy. Za wysokie eps: aligner pochlania realne slowa i rezyduum sie zasmieca (falszywe fillery). Za niskie: wraca problem rozmazywania 'yyy' po sasiadach. To musi byc strojone na zbiorze ewaluacyjnym, potencjalnie adaptacyjnie per sciezka.
- Dryf zegarow w double-enderze jest mierzony przez kotwice, ale kotwice moga byc rzadkie albo zaszumione (chirp 18-20 kHz nie przejdzie przez tani mikrofon laptopa z filtrem antyaliasingowym odcinajacym powyzej 16 kHz; niektore kodeki WebRTC tez go wytna). Jesli wszystkie trzy mechanizmy synchronizacji zawioda jednoczesnie na konkretnym zestawie sprzetu, dostajemy rozjechane nagranie i uzytkownik dowie sie o tym po 3 godzinach.
- Whisper large-v3 na 3-godzinnym materialu z condition_on_previous_text=False traci kontekst dlugozasiegowy — poprawia to odpornosc na halucynacje, ale pogarsza spojnosc nazw wlasnych i terminologii w obrebie odcinka. Fuzja z Parakeetem tego nie naprawia, bo Parakeet ma ten sam problem. Moze byc potrzebna warstwa post-korekty leksykalnej (slownik nazw wlasnych odcinka).
- Klasa B wypelniaczy (leksykalna) wymaga oceny kontekstowej. Jesli robi to LLM, to jest 24 300 slow x kontekst na odcinek = realny koszt i realne opoznienie; jesli robi to maly klasyfikator, potrzebuje oznaczonych danych, ktorych nie ma publicznie dla polskiego. To jest jedyne miejsce w calym planie, gdzie brak danych jest twardym ograniczeniem, a nie kwestia pracy.
- OPFS na iOS Safari ma historycznie agresywna polityke kwot i eksmisji. navigator.storage.persist() nie gwarantuje przyznania. Projekt 2,5 GiB w przegladarce na iPhonie moze byc po prostu niemozliwy — co czyni aplikacje natywna nie 'lepsza wersja', tylko jedyna wersja mobilna zdolna do pracy nad pelnym odcinkiem.
- pyannote community-1 ma wagi gated na HF (wymagana akceptacja warunkow i konto). Automatyczny pipeline CI/deploy musi trzymac token HF; jesli NVIDIA/pyannote zmieni warunki albo model zostanie przeniesiony za paywall pyannoteAI, sciezka importu jednosciezkowego traci silnik. Niski wplyw (to sciezka poboczna), ale realny.
- CC-BY-4.0 na wagach Parakeeta wymaga atrybucji przy dystrybucji modelu i dziel pochodnych. Jesli kiedykolwiek zdecydujemy sie na fine-tune i wysylke wag w bundlu aplikacji mobilnej, obowiazek atrybucji przechodzi na aplikacje — trzeba to obsluzyc w ekranie Licencje od pierwszej wersji, bo dodanie tego pozniej wymaga aktualizacji w sklepie.
- Rezyduum alignmentu jest tak dobre, jak dobra jest transkrypcja. Jesli ASR zgubi cale zdanie (halucynacja typu 'skip'), to zdanie wyladuje w rezyduum jako wielka luka sklasyfikowana jako Noise — a uzytkownik zobaczy w transkrypcji dziure. Potrzebny jest bezpiecznik: luka voiced dluzsza niz 2 s uruchamia ponowna transkrypcje tego fragmentu z innymi parametrami.

### Do rozstrzygnięcia pomiarem

- Czy polski jest w SpeechTranscriber.supportedLocales na iOS 26.x? Da sie rozstrzygnac tylko uruchomieniem trzech linijek Swifta na urzadzeniu. Determinuje, czy sciezka on-device na iOS jest darmowa (Apple) czy kosztuje 600 MB pobrania (Parakeet ONNX).
- Jaki jest realny WER Parakeeta TDT v3 i Whispera large-v3 na POLSKIEJ MOWIE SPONTANICZNEJ (nie Fleurs)? Fleurs 7,31% vs 5-6% to ranking na czytanym tekscie studyjnym; na podcascie kolejnosc moze sie odwrocic. Pomiar na wlasnym zbiorze 5 h.
- Jakie MAE i P95 granicy slowa daje wav2vec2-large-xlsr-53-polish + Viterbi + <star> + refinement, PRZED fine-tunem? Jesli P95 juz jest <=35 ms, fine-tune alignera schodzi z priorytetu 1. Pomiar na 30-minutowym podzbiorze z granicami recznymi.
- Jaka wartosc eps dla tokena <star> maksymalizuje F1 detekcji wypelniaczy klasy A przy minimum falszywych alarmow? Zakres do przeszukania 0,01-0,08, prawdopodobnie zalezna od SNR sciezki. Tylko grid search na zbiorze ewaluacyjnym.
- Ile realnie wazy FLAC-24 dla polskiej mowy podcastowej? Zalozylem 52%, ale zalezy to od poziomu szumu tla i od tego, czy sciezka przeszla juz gate. Roznica 45% vs 60% to roznica 2,2 vs 2,9 GiB na odcinek — istotna dla kwoty OPFS na iOS. Pomiar: zakodowac 10 realnych sciezek.
- Czy chirp 18-20 kHz przezywa lancuch: glosnik laptopa -> powietrze -> mikrofon laptopa/sluchawek BT? Tanie przetworniki i kodek HFP moga go calkowicie wyciac. Test na macierzy 5 zestawow sprzetu; jesli nie przezywa, trzeba zejsc na 15-16 kHz (slyszalny dla czesci osob) albo oprzec sie tylko na zegarze sesji + GCC-PHAT.
- Jaki jest realny wspolczynnik RT dla faster-whisper large-v3 int8_float16 batched na L40S dla polskiego, przy batch_size=16? Zalozylem ~50x, co daje 0,25-0,63 USD/odcinek. Jesli to 20x, koszt GPU rosnie 2,5x i warto rozwazyc Groqa jako sciezke domyslna z Whisperem large-v3 (0,111 USD/h).
- Czy Deepgram Nova-3 jest wyceniany per minute czy per hour? Strona po konwersji do markdown pokazala '/hour' przy wartosciach wygladajacych na per-minute. Roznica to czynnik 60 i rozstrzyga, czy Deepgram jest 10x drozszy od Groqa, czy 10x tanszy. Sprawdzic na realnym rachunku POC.
- Czy Cloudflare Containers dostana GPU? W dokumentacji limitow nie ma o tym slowa (custom instance max 4 vCPU / 12 GiB). Jesli dostana, caly backend konsoliduje sie w jednej chmurze i znika hop R2 -> Modal. Monitorowac changelog.
- Ile godzin wlasnego verbatim potrzeba, zeby fine-tune alignera dal mierzalna poprawe P95 granicy? Literatura sugeruje, ze 20 h in-domain wystarcza, ale dla polskiego z dysfluencjami nie ma punktu odniesienia. Krzywa uczenia: 5 / 10 / 20 / 50 h.

### Adwersarz techniczny

**Nie zadziała tak, jak opisano:**

- **§10: 'Nie włączać wasm-threads/SharedArrayBuffer → brak COOP/COEP' + §1.1/§7.3: 'AudioWorklet → ring buffer → plik i24' i 'ring buffer 4 × 65 536 klatek'**

  Bez SharedArrayBuffer ring buffer między AudioWorkletem a Workerem trzymającym FileSystemSyncAccessHandle NIE ISTNIEJE. Jedyny kanał z AudioWorkletProcessor to jego `port`, a drugi koniec (`AudioWorkletNode.port`) żyje na MAIN THREADZIE. Czyli każdy blok audio 3 ścieżek przechodzi przez wątek Reacta zanim trafi na dysk. Przy rysowaniu waveformu 3 h, re-renderze albo GC main thread stoi, kolejka MessagePortu rośnie, RAM rośnie liniowo. To nie jest ring buffer, to kolejka komunikatów bez backpressure. Przy 432 kB/s przez 3 h to 4,7 GB, które musi przepłynąć przez wątek UI.

  → Albo (a) włączyć COOP/COEP + SAB i rozwiązać problem embedów inaczej (Safari nie ma `COEP: credentialless` — potwierdzone, BCD version_added:false — więc embedy trzeba przenieść na własny proxy albo iframe na osobnym originie), albo (b) utworzyć `new MessageChannel()`, przesłać `port2` DO procesora przez `node.port.postMessage(msg,[port2])`, a `port1` do Workera dyskowego. Wtedy kanał worklet→worker omija main thread i działa bez COOP/COEP. Wariant (b) musi być zapisany w spec jawnie, bo naiwna implementacja go nie zrobi.

- **§10: 'bindings-wasm/ wasm-bindgen' + 'AudioWorklet ← rdzeń WASM bez feature onnx'**

  Wygenerowany przez wasm-bindgen glue NIE URUCHOMI SIĘ w AudioWorklecie. `AudioWorkletGlobalScope` nie ma `TextEncoder` ani `TextDecoder` (używanych przez glue do każdego stringa), nie ma `fetch` ani `importScripts` (więc `init()` z URL-em .wasm nie zadziała). Issue rustwasm/wasm-bindgen#2367 jest OTWARTE od 2020 z cytatem: 'the major blocker is that TextEncoder and TextDecoder are not available within AudioWorklets'.

  → Osobny build rdzenia dla worklera: `wasm-bindgen --target no-modules`, wstrzyknięty polyfill TextEncoder/TextDecoder (FastestSmallestTextEncoderDecoder, MIT) na początku pliku procesora, `WebAssembly.Module` skompilowany na main threadzie i przekazany przez `node.port.postMessage(module)` + `WebAssembly.instantiate(module, imports)` w konstruktorze procesora. Alternatywnie: build worklerowy bez wasm-bindgen w ogóle — czysty `extern "C"` bez stringów, bo tor RT nie potrzebuje stringów.

- **§3.1 i §8: 'Parakeet w onnxruntime-web tylko jako opt-in na desktopie, model cache'owany w OPFS' przy jednoczesnym 'nie włączać SharedArrayBuffer'**

  Wielowątkowość onnxruntime-web wymaga cross-origin isolation. Dokumentacja ORT: 'only when the browser supports WebAssembly multi-threading and crossOriginIsolated mode is enabled, multi-threading will be enabled'. Bez COOP/COEP `env.wasm.numThreads` degraduje do 1. Enkoder FastConformer 600M int8 na JEDNYM wątku WASM to RTF rzędu jednostek (nie ułamków) — 3 h materiału to godziny liczenia. Ta ścieżka jest martwa z definicji, a spec ją wymienia jako realną opcję.

  → Skreślić onnxruntime-web CPU z opcji. Jeśli ma być cokolwiek on-device w przeglądarce, to tylko backend WebGPU ORT (nie wymaga SAB) — ale spec sam odrzucił WebGPU na iOS. Werdykt merytoryczny: w przeglądarce ASR jest wyłącznie serwerowy, a on-device należy do shelli natywnych. Zapisać to jako decyzję, nie jako 'opt-in'.

- **§7: 'SQLite Wasm na OPFS dla metadanych i command logu' przy braku COOP/COEP**

  Kanoniczny VFS `opfs` w sqlite-wasm WYMAGA SharedArrayBuffer i COOP/COEP (dokumentacja SQLite: 'JavaScript's SharedArrayBuffer type is required for the OPFS VFS, and that class is only available if the web server includes the so-called COOP and COEP response headers'). Zostaje `opfs-sahpool`, który ma dwa ograniczenia zabójcze dla tej architektury: 'does not support multiple simultaneous connections' oraz 'pre-allocates all potential file handles, immediately locking those files'. Czyli: jedna instancja bazy na cały origin (Worker audio i Worker ASR nie mogą obie mieć połączenia), brak drugiej zakładki, i pula plików zablokowana wyłącznie przez SAHPool — koegzystująca z Twoimi własnymi SyncAccessHandle na plikach i24.

  → Jeden dedykowany 'db-worker' jako JEDYNY właściciel połączenia SQLite; wszystkie inne Workery i main thread rozmawiają z nim przez MessagePort (RPC). Zapisać w spec, że command log NIE jest zapisywany bezpośrednio z Workera audio. Dodatkowo obsłużyć 'pause/unpause' VFS (sqlite 3.50+) na wypadek drugiej zakładki, albo jawnie zablokować drugą zakładkę tego samego projektu przez Web Locks API.

- **§5.2: 'presigned R2 multipart, części 5 MB (≈34 s audio i24)' oraz '1 555 200 000 B / 5 MB ≈ 312 części'**

  R2 odrzuci te części. Minimum to 5 MiB = 5 242 880 B, nie 5 MB = 5 000 000 B — dostaniesz EntityTooSmall na każdej części poza ostatnią. Do tego dwa warunki, których spec nie uwzględnia: 'All parts except the last must be the same size' (czyli po wznowieniu przerwanego uploadu NIE WOLNO zmienić rozmiaru części) oraz 'Incomplete multipart uploads are automatically aborted after 7 days by default' (przerwany upload gościa znika, a spec zakłada 'lokalny plik jest zawsze prawdą i można go dosłać po fakcie' — po 8 dniach nie można, trzeba zacząć od nowa). Poprawna liczba części: 1 555 200 000 / 5 242 880 = 297 na ścieżkę, 891 na odcinek.

  → Rozmiar części 8 MiB = 8 388 608 B (54,5 s audio i24, 186 części/3 h, zapas do limitu 10 000). Rozmiar części zapisać w metadanych sesji w D1 i NIGDY nie zmieniać przy wznowieniu. Lifecycle policy na buckecie 'tracks' wydłużyć abort do 30 dni. Ostatnia część jako jedyna może być mniejsza — zaokrąglić nagranie w górę i dopchać ciszą, żeby nie było części o rozmiarze innym niż nominalny w środku.

- **§7.4: 'twarda bramka navigator.storage.estimate() wymagająca 1,3 × przewidywanego rozmiaru wolnego miejsca'**

  Ta bramka na Safari nie mierzy tego, co spec zakłada — przepuści nagranie na pełnym telefonie. Po pierwsze: `StorageManager.estimate()` jest w Safari/iOS dopiero od wersji 17 (MDN BCD), a SyncAccessHandle od 15.2 — na iOS 16.x bramki fizycznie nie ma. Po drugie i ważniejsze: WebKit liczy kwotę od CAŁKOWITEGO rozmiaru dysku, nie od wolnego: 'each origin can store up to around 60% of total disk'. Na iPhonie 256 GB z 2 GB wolnego `estimate().quota` zwróci ~150 GB, bramka '1,3 × 4,666 GB = 6,07 GB' przejdzie, a zapis padnie QuotaExceededError w 40. minucie trzygodzinnego nagrania — czyli w najgorszym możliwym momencie. Ryzyko #7 ze spec jest niedoszacowane: to nie jest 'odcina część użytkowników', to jest 'przepuszcza i gubi materiał'.

  → Bramka musi być testem zapisu, nie zapytaniem o kwotę: przed startem nagrania utworzyć docelowe pliki i wywołać `handle.truncate(przewidywany_rozmiar)` dla każdej ścieżki (preallocation). Jeśli truncate rzuci QuotaExceededError — miejsca nie ma, koniec. Preallocation daje dodatkowo mniejszą fragmentację i stały offset seek. Do tego licznik zapisanych bajtów z twardym progiem ostrzegawczym co 10% i automatyczne przełączenie na FLAC-24 w locie po przekroczeniu 80% zadeklarowanej alokacji.

- **§7.4: 'OPFS z FileSystemSyncAccessHandle ... Safari i iOS 15.2+'**

  Na Safari 15.2–16.3 metody `getSize()`, `flush()`, `truncate()` i `close()` ZWRACAJĄ PROMISE, nie działają synchronicznie (MDN BCD notuje wersję synchroniczną dopiero od 16.4). Cały argument spec — 'tylko SyncAccessHandle daje synchroniczny random-access' — na tych wersjach nie zachodzi, a kod napisany pod API synchroniczne rzuci tam błędy typu 'undefined is not a number' przy `getSize()`. Realna podłoga to Safari/iOS 16.4, nie 15.2.

  → Zadeklarować minimum Safari/iOS 16.4 i sprawdzać w runtime: `typeof handle.getSize() === 'number'`. Poniżej — tryb tylko-do-odczytu / import, bez nagrywania długich sesji. Poprawić tabelę w §7.4.

- **§5.2 mechanizm (2): 'GCC-PHAT lokalnej ścieżki A vs referencyjny miks u B, okno 60 s, FFT 2^20 → ±1 próbka (±21 µs)' i mechanizm (3): 'regresja liniowa offset(t)'**

  Referencyjny miks zdalny to WYJŚCIE NetEq (jitter buffer WebRTC), który robi time-scale modification: accelerate, preemptive expand, PLC. NetEq NIELINIOWO wstawia i usuwa próbki w zależności od jittera sieci — to nie jest ta sama oś czasu, tylko oś czasu warpowana skokowo. Do tego Opus 32 kb/s nie jest liniowo-fazowy, a AEC jest adaptacyjny i nieliniowy. Konsekwencje: (a) 'offset(t) = a + b·t' jest fałszywym modelem — mierzysz sumę dryfu zegara i skoków NetEq, a resampling korygujący wyprostuje artefakty jitter buffera zamiast dryfu; (b) '±21 µs' to fizycznie 1 próbka przy 48 kHz, a sygnał referencyjny ma 16 kHz — jedna próbka referencji to 62,5 µs = 3 próbki @48 kHz przed interpolacją; (c) przy stracie pakietów PLC generuje syntetyczne próbki, które w GCC-PHAT są szumem dekorelującym. Twoje własne openQuestion #11 zadaje to pytanie — odpowiedź brzmi: nie, nie da deklarowanej dokładności, i model liniowy jest strukturalnie zły.

  → Nie mierz dryfu przez sieć. Mierz zegar urządzenia LOKALNIE, u każdego uczestnika, przeciw monotonicznemu zegarowi systemowemu: iOS — `AVAudioTime.hostTime` + `mach_timebase_info` przy każdym buforze wejściowym; Android — `AudioStream::getTimestamp()` (framePosition + nanoseconds, Oboe); web — `currentFrame`/`currentTime` w worklecie vs `performance.now()`. Regresja liniowa liczby zarejestrowanych klatek względem zegara monotonicznego daje realny rate urządzenia w ppm z dokładnością <0,5 ppm po 10 minutach, jest ciągła i całkowicie odporna na Opus, AEC, NetEq i utratę pakietów. Sieć (Cristian) służy TYLKO do zsynchronizowania zegarów monotonicznych, i to zgrubnie, bo dryf bierzesz z nachylenia, nie z offsetu. GCC-PHAT zostaw wyłącznie do JEDNORAZOWEGO wyznaczenia offsetu startowego, na oknie 5–10 s, z jawnym progiem jakości piku (peak-to-sidelobe ratio > 3) i fallbackiem na chirp, gdy pik jest rozmyty.

- **§5.2: 'Lokalny zapis (AudioWorklet → i24 48 kHz mono) — to jest materiał' jako mechanizm double-endera dostępny na webie**

  W przeglądarce nie masz dostępu do zegara mikrofonu. `MediaStreamAudioSourceNode` oddaje próbki JUŻ przeresamplowane do `AudioContext.sampleRate`, a przeglądarka sama kompensuje dryf urządzenia względem kontekstu (wstawiając/gubiąc próbki lub resamplując asynchronicznie). Spec Web Audio mówi o resamplingu wyjścia; dla wejścia z MediaStream nie definiuje nic, a implementacje robią właśnie ukrytą kompensację. Czyli 'lokalny zapis i24 48 kHz' na webie NIE jest zapisem zegara mikrofonu, tylko zapisem zegara AudioContextu z już nałożoną, niewidoczną korektą — i te wstawione/pominięte próbki są nieodwracalne. Mierzenie dryfu ±100 ppm na materiale, który przeglądarka już zdryfowała za Ciebie, nie ma sensu.

  → To jest twardy argument, że DOUBLE-ENDER JEST FUNKCJĄ NATYWNĄ, nie webową — i to zapisać wprost, obok istniejącego argumentu o nagrywaniu w tle. Na iOS `AVAudioEngine` z `installTap` na input node daje surowe bufory i hostTime; na Androidzie Oboe/AAudio daje framePosition. Web pozostaje trybem 'solo, krótka sesja, import i edycja'. Jeśli web ma być trybem gościa w double-enderze, to z jawnym komunikatem o ograniczonej precyzji synchronizacji i obowiązkową weryfikacją chirpem.

- **§6.3: 'Źródło kandydatów: luki w alignmencie ... Akcja: usuwalne automatycznie' przy celu 'precyzja ≥97%'**

  Luka w alignmencie powstaje w TRZECH sytuacjach, nie w jednej: (1) wypełniacz, (2) DELECJA ASR — Parakeet nie zwrócił realnie wypowiedzianego słowa, (3) błąd alignera. Przy WER 7% na czytanej mowie i realnie 15–25% na spontanicznym polskim podcaście delecje to kilka procent słów. Automat będzie regularnie kasował realnie wypowiedziane słowa — i to BEZ ŚLADU dla użytkownika, bo tego słowa nigdy nie było w transkrypcie, więc w widoku tekstowym nic nie zniknie. Użytkownik dowie się dopiero z odsłuchu. To jest gorsze niż problem, który funkcja rozwiązuje: 'yyy' jest irytujące, ucięte słowo jest błędem merytorycznym. Dodatkowo: kryterium 'F0 wykryty, clarity >0,6' spełnia każda samogłoska, czyli każde niezaalignowane słowo z sylabą otwartą.

  → Warunek konieczny przed automatycznym usunięciem: DRUGI PRZEBIEG ASR na wyizolowanym fragmencie luki z paddingiem 200 ms z każdej strony. Jeśli zwróci jakikolwiek token leksykalny — to jest delecja, nie wypełniacz; oznacz jako 'możliwe brakujące słowo' i NIE usuwaj. Dopiero pusty lub nieleksykalny wynik + kryteria akustyczne z §6.3 kwalifikuje do klasy A. Drugi warunek: monotoniczność formantów — wypełniacz ma stały F1/F2 (zmiana <10% przez ≥100 ms), a każde słowo ma tranzycje formantowe; to jest silniejszy dyskryminator niż stabilność centroidu. I nawet z tym: przy 27 000 słów precyzja 97% to ~kilkanaście błędnych cięć na odcinek, więc domyślnie klasa A też powinna być 'zaznaczone + jeden przycisk zastosuj', a nie cicha automatyka.

- **§10 + zależność #12: 'Golden-file testy DSP + CI — warunek, żeby port na Swift/Kotlin był przenoszeniem, nie pisaniem od nowa'**

  Golden-file testy bit-exact NIE PRZEJDĄ między wasm32, aarch64-apple-ios i aarch64-linux-android. Arytmetyka IEEE-754 (+,−,×,÷,sqrt) jest deterministyczna, ale funkcje transcendentalne NIE SĄ: `sin`, `cos`, `tan`, `exp`, `log`, `pow`, `atan2` w Ruście wołają platformowy libm na targetach natywnych (Apple libm ≠ bionic ≠ musl) i wkompilowany libm na wasm32-unknown-unknown. Dotyczy to bezpośrednio: współczynników biquadów RBJ (tan, cos, sinh) w HPF/EQ/de-esserze, jądra sinc w rubato (sin), pYIN (log, exp), K-weightingu BS.1770-4, obliczeń FDN reverb. Dodatkowo: WASM nie ma instrukcji FMA, ARM64 ma — jeśli ktokolwiek napisze SIMD ręcznie albo włączy `relaxed-simd` (którego `f32x4.relaxed_madd` jest W SPECYFIKACJI niedeterministyczny: może być fused albo nie), różnice rosną z każdą próbką rekursji IIR.

  → Trzy twarde reguły w `core-dsp`, egzekwowane clippy lintem: (1) ZAKAZ `std`/`core` float math — wyłącznie crate `libm` (pure Rust, ten sam kod źródłowy na wszystkich targetach, MIT); (2) ZAKAZ target-feature `relaxed-simd`, zakaz jakichkolwiek flag fast-math w LLVM; (3) golden-file porównywane z TOLERANCJĄ, nie bit-exact — kryterium: RMS różnicy < −120 dBFS i max |różnica| < 1e-5 dla bloków 10 s. Osobno: współczynniki filtrów liczyć RAZ przy zmianie parametru i cache'ować, żeby ewentualna różnica w tan() nie propagowała się per-próbkę.

- **§10: 'bindings-ffi/ uniffi → Swift + Kotlin' jako jedyna granica FFI, przy metryce '60 fps, zero dropoutów audio'**

  UniFFI jest realtime-unsafe i nie wolno go wołać z callbacku audio. Generowane scaffoldingi alokują `RustBuffer` (malloc) na każde wywołanie zwracające cokolwiek złożonego, obiekty są za `Arc<Mutex<…>>`, a `catch_unwind` jest w każdej funkcji. Wołanie tego z render callbacku AudioUnit/AVAudioSourceNode albo z `AudioStreamCallback::onAudioReady` w Oboe łamie zasadę no-malloc/no-lock w wątku o priorytecie czasu rzeczywistego → priority inversion, dropouty, w skrajnym przypadku watchdog kill na iOS.

  → DWIE granice FFI, zapisane w §10 jako osobne crate'y: (a) `bindings-ffi-control` — UniFFI, dla EDL, komend, analizy, storage, wszystkiego co nie jest w wątku audio; (b) `bindings-ffi-rt` — ręczny `extern "C"`, kontekst preallokowany raz (`rt_create(cfg) -> *mut RtCtx`), pętla `rt_process(ctx, in_ptr, out_ptr, n_frames)` bez jednej alokacji, `panic = "abort"` dla profilu release, żaden `Mutex` (parametry przekazywane lock-free przez `AtomicU64` / triple buffer). Do tego `#[inline(never)]` na granicy i `assert_no_alloc` w testach debug.

- **§3.2 punkt 2: 'Brak okna 30 s ... Parakeet obsługuje długie wejście (do 24 min z pełną atencją, do 3 h z lokalną)' jako powód wyboru Parakeeta, przy wdrożeniu na Cloudflare Containers standard-4**

  Karta modelu mówi dosłownie: 'audio up to 24 minutes long with full attention (on A100 80GB) or up to 3 hours with local attention'. standard-4 to 4 vCPU / 12 GiB / BEZ GPU (potwierdzone w docs Cloudflare). 24 min przy subsamplingu 8× z 10 ms to 18 000 ramek — macierz atencji 18000² × 4 B to 1,3 GB na głowę na warstwę. Na 12 GiB to niewykonalne. Zostaje local attention, dla którego opublikowane WER 7,31%/7,28% NIE BYŁY MIERZONE (Fleurs i MLS to krótkie, czytane wypowiedzi kilkunastosekundowe, więc mierzono full attention). Do tego §8.2 i tak tnie materiał na segmenty 5-minutowe dla równoległości. Czyli deklarowana przewaga #2 w wybranym wdrożeniu nie występuje — i to jest w porządku, ale nie wolno na niej opierać werdyktu wyboru silnika.

  → Przeformułować uzasadnienie wyboru Parakeeta na dwa realne powody: (1) brak halucynacji na ciszy (transducer), (2) natywne timestampy z predykcji duration. Skreślić 'brak okna 30 s' jako argument. Zapisać jawnie: segmentacja własna na granicach VAD, okna 120–300 s z zakładką 5 s i zszywaniem po najdłuższym wspólnym prefiksie/sufiksie tokenów, local attention jako tryb produkcyjny. Dopisać do korpusu ewaluacyjnego pomiar WER W TRYBIE LOCAL ATTENTION przy realnym rozmiarze okna — bo to jest tryb, który pojedzie na produkcji.

- **§3.1/§8.1: 'Whisper large-v3-turbo ... Workers AI 0,03 USD/h ... podłoga kosztowa, fallback' oraz tabela kosztów 'Razem (ścieżka whisper-turbo) ≈0,47 USD / odcinek'**

  Schemat odpowiedzi `@cf/openai/whisper-large-v3-turbo` na Workers AI to `text` (string), `word_count` (number), `vtt` (string) — CZYLI SEGMENTY W WEBVTT, BEZ word-level timestamps. Jako 'fallback' dla toru, którego cała wartość to granice słów, to nie jest fallback — to inna funkcjonalność. Może służyć wyłącznie jako źródło TEKSTU dla alignera CTC, ale wtedy 'podłoga kosztowa 0,27 USD' jest fikcyjna, bo droga część (aligner XLSR-large 315M na CPU, RTF 0,15–0,5) zostaje w kosztach. Druga rzecz: żądanie do Workers AI idzie przez Workera, a Worker ma limit body 100 MB na Free I NA PRO (potwierdzone; 200 MB dopiero Business). 9 h FLAC 16 kHz mono to ~150–250 MB, więc i tak trzeba ciąć na kawałki i płacić za wywołania.

  → Wykreślić 'whisper-turbo jako tania ścieżka' z tabeli kosztów jako pozycję samodzielną. Zostawić go jako awaryjne ŹRÓDŁO TEKSTU, gdy kontener Parakeeta nie wstaje, z kosztem = 0,27 USD + pełny koszt alignera. Prawdziwa podłoga kosztowa odcinka to koszt alignera, nie ASR.

- **§8.2: 'Workflow "episode-pipeline" (durable, retry)' zwracający WordTrack/SpeakerTrack**

  Cloudflare Workflows ma limit 'Max step result size: 1 MiB'. WordTrack dla 3 h to ~27 000 słów; jako JSON z `start`, `end`, `text`, `score` to 2–5 MB, binarnie z tabelą stringów ~600 kB–1 MB — czyli na granicy albo ponad. Krok, który zwróci WordTrack jako wynik, wywali cały workflow. Drugi limit: CPU time per step 30 s domyślnie (konfigurowalne do 5 min) na Workers Paid — jakiekolwiek przetwarzanie WordTracku w Workerze (scalanie segmentów, deduplikacja zakładek) musi się w tym zmieścić albo iść do kontenera. Trzeci: retention stanu 30 dni.

  → Reguła w spec: KAŻDY krok Workflow zwraca wyłącznie klucz R2 i metadane skalarne (≤1 kB). Żaden artefakt nie przechodzi przez stan Workflow. Scalanie segmentów WordTrack robi kontener, nie Worker. Zapisać limit 1 MiB wprost, bo diagram w §8.2 sugeruje przepływ danych przez Workflow.

- **§16/§11: 'true peak z 4× oversamplingiem' + metryka akceptacji 'true peak ≤ −1,0 dBTP ZAWSZE'**

  Te dwa zdania są ze sobą sprzeczne. BS.1770-4 podaje 4× jako MINIMUM dla materiału 48 kHz, a znane niedoszacowanie estymatora 4× dla sygnałów o energii w górnym paśmie sięga ~0,5 dB (dla treści blisko Nyquista więcej). Czyli plik zmierzony przez Ciebie na −1,0 dBTP realnie może mieć −0,5 dBTP, a mierzony niezależnym narzędziem z 16× oversamplingiem obleje test. Metryka mówi 'ZAWSZE', a metoda tego nie gwarantuje.

  → Albo oversampling 8× minimum (16× dla eksportu, koszt pomijalny bo to jeden przebieg offline), albo limiter celuje w −1,5 dBTP przy pomiarze 4×. Wybrać jedno i zapisać. Rekomendacja: 16× w pomiarze eksportowym, 4× w mierniku RT (tam liczy się latencja, nie ostatnie 0,5 dB).

- **§16: 'normalizacja PER MÓWCA do −20 LUFS short-term PRZED masterem'**

  To jest niedefiniowalne. Short-term LUFS to wartość ZMIENNA W CZASIE (okno przesuwne 3 s wg EBU Tech 3341). 'Znormalizować do −20 LUFS short-term' nie ma jednego wyniku — to może znaczyć jedno przesunięcie gain na ścieżkę (wtedy właściwą miarą jest integrated albo mediana short-term), albo automatyzację gain w czasie (leveler). To dwie zupełnie różne implementacje o różnym brzmieniu: pierwsza zachowuje dynamikę mówcy, druga ją spłaszcza. Napisane tak, jak jest, zostanie zaimplementowane losowo.

  → Wybrać i zapisać: gain statyczny per ścieżka do integrated −20 LUFS liczonego TYLKO na segmentach VAD=mowa tej ścieżki (bo cisza i crosstalk zaniżają integrated), plus opcjonalny leveler jako osobny blok DSP z jawnymi parametrami (cel −20 LUFS-S, zakres ±6 dB, slew 1 dB/s, okno 3 s). Dwa parametry w `MaterialProfile`, nie jeden.

- **§2: 'Widok tekstowy nie ma własnych operacji. Usunięcie zdania w tekście = RemoveRange{start: word[i].start_refined, ...}' przy `Annotation.start: u64 // klatka w źródle`**

  Brakuje najważniejszej funkcji w całej integracji i bez niej widok tekstowy się rozjedzie. Adnotacje są indeksowane KLATKĄ W ŹRÓDLE, a EDL operuje na OSI PROJEKTU. Po `RemoveRange{ripple:true}` odwzorowanie source→timeline przestaje być monotoniczne, a po `MoveClip`/duplikacji klipu jedno źródłowe słowo może występować w projekcie ZERO, JEDEN albo N razy. Spec nie definiuje funkcji `source_frame → [timeline_frame]` ani tego, co widok tekstowy pokazuje, gdy to samo źródłowe słowo jest na osi dwa razy (dubel zdania w tekście?), ani co robi `word[i].start_refined`, gdy słowo zostało PRZECIĘTE przez `SplitClip` w środku. To jest dokładnie ten szew, na którym pęka teza 'drugi widok na ten sam EDL'.

  → Odwrócić kierunek: tekst NIE jest renderowany z WordTrack, tylko z PRZEJŚCIA PO KLIPACH OSI CZASU. Dla każdego klipu w kolejności `timeline_start` bierzesz zakres źródła `[source_in, source_in+len)`, robisz zapytanie interwałowe do WordTrack tego źródła i emitujesz tokeny, które mieszczą się CAŁE w klipie (częściowo przycięte oznaczasz jako 'ucięte' i renderujesz na szaro, nieedytowalne). Wtedy: dubel klipu = dubel zdania w tekście (poprawnie), ripple delete = tekst po prostu krótszy, split w środku słowa = widoczny artefakt zamiast cichego rozjazdu. Dodać do §2 jawną strukturę `TimelineTextIndex` przebudowywaną inkrementalnie po każdej komendzie (tylko dotknięte klipy) i zdefiniować `undo` jako przebudowę tego indeksu, nie osobny stan.

- **§1.1, tabela: 'Kompensacja latencji round-trip, monitoring, miernik RMS/clip — 100% wspólna'**

  Na webie nie ma czego kompensować, bo nie ma z czego policzyć. Web Audio daje `AudioContext.baseLatency` i `outputLatency` — obie dotyczą WYJŚCIA. Nie istnieje żadne API zwracające latencję ścieżki WEJŚCIOWEJ (`MediaTrackSettings.latency` jest advisory, nieimplementowane spójnie i nie obejmuje bufora sprzętowego). Czyli 'kompensacja round-trip' jako warstwa '100% wspólna' jest na webie niewykonalna, a na iOS/Androidzie jest trywialna (`AVAudioSession.inputLatency + outputLatency + ioBufferDuration`; Oboe `getTimestamp()` na obu strumieniach). To nie jest warstwa wspólna, to warstwa z dziurą na jednej z trzech platform.

  → Przenieść kompensację latencji do warstwy platformowej z jednym kontraktem `fn io_latency_frames() -> Option<u64>`. Na webie: `None` domyślnie + jednorazowy KALIBRATOR PĘTLI AKUSTYCZNEJ (odtwórz chirp/MLS przez głośniki, nagraj mikrofonem, GCC-PHAT, zapisz wynik per urządzenie w SQLite). Bez tego overdub na webie będzie systematycznie przesunięty o 20–200 ms zależnie od sprzętu — a to jest funkcja, którą tor śpiewu potrzebuje bardziej niż podcast.

- **Zależność #7 / §12 punkt 5: 'Renderer offline w rdzeniu — obecny jest martwym kodem (lib/multi-track-engine.ts:373), czyli nie istnieje żadna ścieżka eksportu projektu multitrack'**

  To jest po prostu nieprawda i sprawdziłem to w repo. `mixToBuffer` (lib/multi-track-engine.ts:373) jest wołane z `exportMix` (lib/multi-track-engine.ts:423), a `exportMix` jest wołane z UI: components/multi-track-manager.tsx:177. Ścieżka eksportu ISTNIEJE i jest podpięta. Ma realne wady (twardo zaszyte `sampleRate = 44100` mimo capture 48 kHz, wymaga wszystkich buforów w RAM przez `loadAudioSource`/`decodeAudioData` — lib/multi-track-engine.ts:491), ale to jest 'zły renderer', nie 'brak renderera'. Fałszywa diagnoza w liście zależności psuje priorytetyzację: pozycja 5 w §12 jest opisana jako 'nie istnieje', czyli blocker, a realnie jest to refaktor.

  → Poprawić diagnozę na: 'renderer offline istnieje i jest podpięty (multi-track-manager.tsx:177 → exportMix → mixToBuffer), ale renderuje na 44 100 Hz niezależnie od materiału i wymaga pełnego dekodu wszystkich źródeł do RAM (decodeAudioData na całych blobach), więc dla 3 h × 3 ścieżki wywali zakładkę na OOM'. To zmienia charakter zadania i jego ryzyko. Pozostałe cytowane usterki sprawdziłem i SĄ prawdziwe: MediaRecorder tylko webm (hooks/use-audio-recording.ts:17-19), martwy start nagrywania przez odczyt `audioRecorder.isRecording` w tym samym ticku po await (contexts/audio-recorder-context.tsx:62), czas w sekundach float (lib/multi-track-storage.ts:24-29), stałe 1000 próbek waveformu (lib/multi-track-storage.ts:715), brak jakiegokolwiek AudioWorkletu w repo.

- **§1.3 MaterialProfile: 'denoise: DenoiseCfg, // speech: DPDFNet 48k, wet 100%, attn limit −18 dB'**

  Nie istnieje projekt o nazwie 'DPDFNet'. Najbliższy realny to DeepFilterNet (Rikorose/DeepFilterNet) — i jest to JEDYNY blok DSP w całej specyfikacji, dla którego nie podano licencji ani wersji, mimo że denoise mowy jest najbardziej widoczną dla użytkownika funkcją całego filaru. Sprawdziłem: kod DeepFilterNet jest dual MIT/Apache-2.0 (LICENSE-MIT, Copyright 2021 Hendrik Schröter), 4,5k gwiazdek — ale OSTATNI PUSH TO 2024-10-17, czyli 21 miesięcy bez commita. GitHub raportuje spdx NOASSERTION dla repo. Wagi modeli są dystrybuowane osobno i wymagają osobnego sprawdzenia (DNS4/DNS5 mają własne warunki).

  → Nazwać projekt poprawnie, przypiąć konkretny tag (DeepFilterNet3), zarchiwizować wagi lokalnie z SHA-256 tak samo jak dla pyannote, i sprawdzić licencję WAG osobno od licencji kodu. Rozważyć, czy denoiser ma być modelem, czy klasycznym spectral gate + Wienerem w rdzeniu — bo projekt bez commitów od 21 miesięcy, z którego bierzesz wagi ONNX na trzy platformy, jest realnym długiem. Alternatywa z żywym utrzymaniem: `sherpa-onnx` ma wbudowane modele speech-enhancement (GTCRN) pod Apache-2.0 z buildami na iOS/Android/WASM — tym samym runtime, którego i tak używasz.

- **§4: 'MFA jako GOLDEN REFERENCE w CI do pomiaru błędu granic' + metryka 'mediana |błąd granicy| vs MFA polish_mfa ≤20 ms'**

  MFA nie jest prawdą, tylko drugim estymatorem o TYM SAMYM RZĘDZIE BŁĘDU. Publikowany błąd granic MFA na mowie spontanicznej to same 20–30 ms, a próg akceptacji ustawiony jest na ≤20 ms mediany — czyli mierzysz zgodność dwóch narzędzi, których błędy są porównywalne, i nie wiesz, które się myli. Gorzej: MFA na dokładnie tych przypadkach, które są trudne (nazwy własne, anglicyzmy IT, code-switching), wymaga G2P i często odmawia alignmentu albo produkuje śmieć — czyli 'prawda' znika tam, gdzie najbardziej jej potrzebujesz. Metryka jest niefalsyfikowalna w interesującym zakresie.

  → Prawdą muszą być RĘCZNE ANOTACJE GRANIC. 20–30 minut polskiego materiału podcastowego oznaczone w Praacie na poziomie słowa przez fonetyka — to jest ~2 dni pracy jednej osoby i rozwiązuje problem raz na zawsze dla całego projektu. MFA zostaje jako trzeci głos do wykrywania regresji na dużej próbce (gdzie liczy się trend, nie wartość bezwzględna). Do korpusu z zależności #10 dopisać 'granice słów anotowane ręcznie', a MFA przenieść z 'prawda' na 'baseline'.

- **§8.2: 'Wymóg: pierwszy tekst na ekranie ≤60 s od zakończenia nagrania' przy Containers z sleepAfter**

  Budżet 60 s nie zamyka się przy zimnym starcie. Cloudflare podaje 'Container cold starts can often be in the 1-3 second range, but this is dependent on image size and code execution time' — to jest dla małych obrazów. Twój obraz zawiera Parakeet int8 (640 MB wg sherpa-onnx: encoder 622M + decoder 12M + joiner 6,1M), wav2vec2-XLSR int8 (~320 MB) i pyannote. Do 1–3 s cold startu dochodzi inicjalizacja sesji ONNX Runtime dla enkodera 622 MB na 4 vCPU — realnie 10–40 s, zanim policzy się pierwsza ramka. Plus Cloudflare zastrzega: 'no guarantee that any instance will run for any set period of time' i restarty hostów są nieregularne, więc job w połowie może zniknąć.

  → (1) Startować kontener SPEKULATYWNIE w momencie rozpoczęcia nagrywania, nie po jego zakończeniu — masz 3 h zapasu, a koszt idle to 12 GiB × 0,0000025 USD/GiB-s ≈ 0,03 USD/h, czyli nic. (2) Ustawić `sleepAfter` dłużej niż typowy odstęp między odcinkami użytkownika. (3) Wysyłać segmenty do ASR NA BIEŻĄCO w trakcie nagrania (masz progresywny upload do R2, więc materiał już tam jest) — wtedy 'pierwszy tekst' istnieje jeszcze przed końcem nagrania i metryka staje się trywialna. (4) Każdy segment musi być idempotentny i wznawialny, bo host może zniknąć.

**Problemy licencyjne:**

- Wagi modeli embeddingów mówcy: spec deklaruje '3D-Speaker/WeSpeaker (Apache-2.0)'. To jest licencja KODU repozytorium (modelscope/3D-Speaker: Apache-2.0, potwierdzone), a NIE licencja wag. Wagi tych modeli trenowane są na VoxCeleb1/2 i CN-Celeb. Metadane VoxCeleb są pod CC BY-SA 4.0 (potwierdzone na stronie VGG: 'The provided VoxCeleb metadata is licensed under a Creative Commons Attribution-ShareAlike 4.0 International License'), a CC BY-SA jest licencją COPYLEFT — jeśli ktoś uzna wagi za utwór zależny, klauzula ShareAlike zaraża. Sam audio to linki do YouTube'a, więc dochodzi warstwa praw osób trzecich. Spec archiwizuje SHA-256 tylko dla pyannote; embeddingi zostawia bez żadnej weryfikacji. https://www.robots.ox.ac.uk/~vgg/data/voxceleb/vox1.html | https://api.github.com/repos/modelscope/3D-Speaker
- flacenc-rs jest Apache-2.0, NIE 'MIT-Apache' jak podaje spec §6/§10. Do tego 40 gwiazdek i jeden maintainer — dla enkodera FLAC w produkcie komercyjnym na trzy platformy to cienki fundament. Push 2026-06-29, więc żywy, ale plan B (własny enkoder, który spec i tak dopuszcza) powinien być decyzją, nie fallbackiem. https://api.github.com/repos/yotarok/flacenc-rs
- DeepFilterNet (spec nazywa go błędnie 'DPDFNet') to JEDYNY blok DSP w całej specyfikacji bez podanej licencji. Kod jest dual MIT/Apache-2.0 (LICENSE-MIT: Copyright (c) 2021 Hendrik Schröter), ale GitHub API zwraca spdx NOASSERTION, a wagi są dystrybuowane osobno i mają własną historię zbiorów treningowych (DNS Challenge). To wymaga osobnego audytu przed wdrożeniem. https://api.github.com/repos/Rikorose/DeepFilterNet
- CC-BY-4.0 na wagach oznacza atrybucję W PRODUKCIE, na trzech platformach, dla: Parakeet TDT 0.6b v3 (potwierdzone: cc-by-4.0, lastModified 2026-06-29), Canary-1b-v2 (potwierdzone: cc-by-4.0, lastModified 2025-12-03), pyannote community-1, modele MFA, HerBERT-base-cased (potwierdzone: cc-by-4.0). Spec to zauważa, ale nie precyzuje formy: CC-BY-4.0 wymaga podania autora, tytułu, linku do licencji ORAZ oznaczenia zmian (kwantyzacja int8 i eksport ONNX to modyfikacja utworu — trzeba to napisać). Ekran 'O programie' z listą nie wystarczy, jeśli nie ma adnotacji o modyfikacji.
- Dataset Granary (na którym trenowany jest Parakeet v3) jest CC-BY-4.0, ale składa się m.in. z YODAS i 'YouTube Clips (YTC)' — czyli materiału z YouTube'a. To nie jest problem licencyjny dla Ciebie (wagi są CC-BY-4.0), ale spec twierdzi, że dane 'nie są zapożyczone ze zbiorów badawczych o ograniczeniach' — to jest za mocne stwierdzenie przy komponencie YouTube'owym. Zapisać jako ryzyko reputacyjne/regulacyjne, nie jako czysty rachunek. https://huggingface.co/api/datasets/nvidia/Granary
- sdadas/polish-roberta-base-v2 jest Apache-2.0 (potwierdzone, lastModified 2026-01-27) — czyli PERMISYWNIEJSZY niż HerBERT (CC-BY-4.0, wymaga atrybucji). Spec wymienia HerBERT jako pierwszy wybór, a polish-roberta jako 'lub'. Przy równej lub lepszej jakości i braku obowiązku atrybucji kolejność powinna być odwrotna.

**Projekty martwe:**

- DeepFilterNet (spec: 'DPDFNet') — ostatni push 2024-10-17, czyli 21 MIESIĘCY bez commita na dzień 2026-07-26. To jest denoiser mowy, czyli najbardziej widoczna dla użytkownika funkcja DSP w całym filarze podcast. 4,5k gwiazdek, nie zarchiwizowany, ale bez utrzymania. https://api.github.com/repos/Rikorose/DeepFilterNet
- jonatasgrosman/wav2vec2-large-xlsr-53-polish — lastModified 2022-12-14, czyli 3,5 ROKU bez zmian. Trenowany na Common Voice PL 6.0 (mowa CZYTANA, studyjna, zdania z Wikipedii). To jest fundament stopnia 2 alignera, na którym opiera się cała edycja po tekście. Nie jest 'martwy' (2,5 mln pobrań, Apache-2.0), ale jest zamrożony w 2022 i architektura XLSR-53 ma od tego czasu następców. https://huggingface.co/api/models/jonatasgrosman/wav2vec2-large-xlsr-53-polish
- pyannote/segmentation-3.0 — lastModified 2024-05-10, ponad 2 lata. MIT, gated (auto, z formularzem 'Company/university' i 'Website' oraz zastrzeżeniem 'we will occasionnally email you about premium models and paid services'). Gating na modelu, który jest w Twojej ścieżce produkcyjnej fallbacku, to ryzyko dostępu — spec słusznie każe archiwizować z SHA-256, ale ta reguła powinna dotyczyć WSZYSTKICH wag, nie tylko tej. https://huggingface.co/api/models/pyannote/segmentation-3.0
- modelscope/3D-Speaker — push 2025-12-08, 7,5 miesiąca bez commita. Apache-2.0 na kodzie. Nie martwy, ale w zwolnionym tempie.
- allegro/herbert-base-cased — lastModified 2022-06-09, 4 LATA. Jeśli klasyfikator wypełniaczy klasy B ma być fine-tune'em, to na modelu zamrożonym cztery lata temu, podczas gdy sdadas/polish-roberta-base-v2 był aktualizowany 2026-01-27.
- ŻYWE (sprawdzone, bez zastrzeżeń): k2-fsa/sherpa-onnx — push 2026-07-24, Apache-2.0, 13 797 gwiazdek, nie zarchiwizowany. HEnquist/rubato — push 2026-07-18, LICENSE.txt = dual MIT OR Apache-2.0 (GitHub raportuje NOASSERTION tylko dlatego, że plik zawiera oba warianty; to nie jest problem). yotarok/flacenc-rs — push 2026-06-29.

**Luki platformowe:**

- AudioWorkletGlobalScope nie ma TextEncoder/TextDecoder/fetch/importScripts → wygenerowany glue wasm-bindgen rzuca ReferenceError przy pierwszym stringu. Issue rustwasm/wasm-bindgen#2367 otwarte. Dotyczy WSZYSTKICH trzech przeglądarek, nie tylko Safari.
- onnxruntime-web wielowątkowy wymaga crossOriginIsolated (COOP/COEP) — dokumentacja ORT wprost. Decyzja spec o braku COOP/COEP zabija ścieżkę 'Parakeet w onnxruntime-web opt-in na desktopie'.
- sqlite-wasm: kanoniczny VFS 'opfs' wymaga SharedArrayBuffer + COOP/COEP. Bez tego zostaje 'opfs-sahpool', który 'does not support multiple simultaneous connections' i prealokuje/blokuje pulę plików. Jedno połączenie na origin, brak drugiej zakładki.
- Cross-Origin-Embedder-Policy: credentialless — Safari i Safari iOS: version_added FALSE (MDN BCD). Czyli argument spec jest poprawny, ale konsekwencja jest twardsza niż spec przyznaje: na Safari wybór to 'COEP require-corp i naprawa wszystkich embedów' albo 'brak SAB i brak wielowątkowego WASM'.
- navigator.storage.estimate() — Safari i Safari iOS dopiero od wersji 17 (MDN BCD). FileSystemSyncAccessHandle od 15.2. Czyli na iOS 15.2–16.7 masz OPFS bez możliwości sprawdzenia kwoty.
- FileSystemSyncAccessHandle na Safari 15.2–16.3: getSize(), flush(), truncate(), close() ZWRACAJĄ PROMISE. Wersje synchroniczne dopiero od Safari 16.4. Deklaracja 'Safari i iOS 15.2+' w §7.4 jest myląca — realna podłoga to 16.4.
- WebKit liczy kwotę storage od CAŁKOWITEGO rozmiaru dysku ('each origin can store up to around 60% of total disk', 'overall quota ... 80% of disk size'), nie od wolnego miejsca. Bramka miejsca oparta na estimate() przepuści nagranie na pełnym urządzeniu.
- Safari 7-dniowa eksmisja: WebKit dokumentuje ją jako część ITP ('If an origin has no user interaction ... in the last seven days of browser use, its data created from script will be deleted'). ANI MDN, ANI blog WebKit NIE POTWIERDZAJĄ, że navigator.storage.persist() z tego zwalnia — mówią tylko 'might be excluded from eviction if it has active page at the time of eviction, or its storage is in persistent mode', a persistent mode WebKit przyznaje heurystycznie, 'based on heuristics like whether the website is opened as a Home Screen Web App'. Czyli JEDYNY udokumentowany niezawodny sposób to instalacja jako Home Screen Web App — a to trzeba zaproponować użytkownikowi w UI, nie liczyć na persist().
- WebCodecs AudioEncoder: Safari/Safari iOS od 26, Chrome 94, Firefox 130 — ale Firefox Android: version_added FALSE. Czyli fallback WASM jest obowiązkowy nie tylko dla starszego Safari.
- Web Audio nie ma żadnego API latencji WEJŚCIA. baseLatency i outputLatency dotyczą wyjścia. 'Kompensacja latencji round-trip 100% wspólna' (§1.1) jest na webie niewykonalna bez kalibratora pętli akustycznej.
- MediaStreamAudioSourceNode oddaje próbki już przeresamplowane do AudioContext.sampleRate — przeglądarka ukrywa i kompensuje dryf zegara mikrofonu. Na webie nie da się zmierzyć realnego rate'u urządzenia, więc double-ender z korektą dryfu jest funkcją NATYWNĄ.
- Cloudflare Containers: brak GPU (potwierdzone — nigdzie w docs nie ma o tym mowy), max standard-4 = 4 vCPU / 12 GiB / 20 GB, custom max 4 vCPU / 12 GiB / 20 GB, min ratio 3 GiB pamięci na vCPU. Max rozmiar obrazu = dysk instancji (20 GB), łącznie 50 GB rejestru na konto. Cold start '1-3 s' tylko dla małych obrazów. 'No guarantee that any instance will run for any set period of time'.
- Cloudflare Workers: body 100 MB na Free I NA PRO (200 MB dopiero Business, 500 MB Enterprise), 128 MB RAM na isolate — spec ma to poprawnie.
- Cloudflare Workflows: max step result 1 MiB, CPU per step 30 s (do 5 min konfigurowalnie), retention stanu 30 dni, max persisted state 1 GB.
- Workers AI @cf/openai/whisper-large-v3-turbo zwraca text / word_count / vtt — BEZ word-level timestamps.
- iOS Safari: brak nagrywania w tle i przy zablokowanym ekranie (spec to wie i wyciąga poprawny wniosek).

**Potwierdzone niezależnie:**

- Parakeet TDT 0.6b v3: licencja CC-BY-4.0, lastModified 2026-06-29, 25 języków w tym polski, WER PL 7,31% Fleurs / 7,28% MLS, automatyczna interpunkcja i wielkie litery, 'accurate word-level and segment-level timestamps'. Wszystko jak w spec. https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3
- sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8 ISTNIEJE i jest udokumentowany w sherpa-onnx, 25 języków europejskich z polskim, rozmiary: encoder 622M, decoder 12M, joiner 6,1M, razem 640M (spec podaje 652/11,8/6,4 = 670 MB — rząd się zgadza). https://k2-fsa.github.io/sherpa/onnx/pretrained_models/offline-transducer/nemo-transducer-models.html
- k2-fsa/sherpa-onnx: Apache-2.0, push 2026-07-24, 13 797 gwiazdek, nie zarchiwizowany. Żywy projekt.
- jonatasgrosman/wav2vec2-large-xlsr-53-polish: Apache-2.0 — licencja jak deklarowana.
- pyannote/segmentation-3.0: MIT, gated (auto) — licencja jak deklarowana.
- nvidia/canary-1b-v2: CC-BY-4.0 — jak deklarowana.
- allegro/herbert-base-cased: CC-BY-4.0 — jak deklarowana. sdadas/polish-roberta-base-v2: Apache-2.0.
- Granary: CC-BY-4.0.
- Cloudflare Containers standard-4 = 4 vCPU / 12 GiB / 20 GB, BEZ GPU, ceny 0,000020 USD/vCPU-s i 0,0000025 USD/GiB-s — dokładnie jak w spec. Arytmetyka kosztu 8424 s × 0,00011 = 0,93 USD jest poprawna.
- Workers AI @cf/openai/whisper-large-v3-turbo: 0,0005 USD za minutę audio = 0,03 USD/h — jak w spec.
- Worker: 100 MB body na Free/Pro, 128 MB RAM na isolate, 15 min dla Queue consumers / Cron / DO alarms — jak w spec.
- R2 max 10 000 części — jak w spec.
- Descript: Free 60 min, Hobbyist 16 USD / 10 h, Creator 24 USD / 30 h, Business 50 USD / 40 h; Studio Sound, Remove Filler Words i Multitrack Transcription gated na Creator+ — dokładnie jak w spec.
- COEP credentialless brak w Safari — jak w spec.
- Matematyka piramidy peaków: L0=256 → 2 025 000 bucketów × 6 B = 12,15 MB; suma 6 poziomów ≈16,2 MB/ścieżka; pokrycie zoomu 3 h w 1600 px = 324 000 klatek/px, L5 = 1,236 bucketa/px ≥ 1. Wszystko się liczy.
- Rozmiary PCM: i24 mono 48 kHz = 144 000 B/s, 3 h = 1,5552 GB, ×3 ścieżki = 4,666 GB. Poprawne.
- Diagnoza obecnego kodu (sprawdzone lokalnie): MediaRecorder tylko 'audio/webm' — hooks/use-audio-recording.ts:17-19. Martwy start nagrywania audio przez odczyt audioRecorder.isRecording w tym samym renderze po await — contexts/audio-recorder-context.tsx:62. AudioClip w sekundach float — lib/multi-track-storage.ts:24-29. generateWaveformData ze stałym samples=1000 — lib/multi-track-storage.ts:715. Pełny decodeAudioData całego bloba do RAM — lib/multi-track-engine.ts:490-492. Zero AudioWorkletu w całym repo (grep bez wyników).
- Teza główna — 'podcast to profil materiału, nie osobny produkt; granica leży w warstwie ANALIZY, a widok tekstowy to drugi widok na ten sam EDL emitujący te same komendy' — jest merytorycznie słuszna i jest najlepszą częścią tej propozycji. Podobnie: EDL na klatkach u64 zamiast sekund float, command log z odwrotnościami zamiast snapshotów, zakaz contenteditable, oddechy tłumione zamiast usuwanych, klasa B wypełniaczy tylko jako sugestia, zakotwiczenie bulletów show notes w cytacie, adaptacyjny próg ciszy z percentyla zamiast stałego dBFS, ochrona pauzy retorycznej.

**Lepsze alternatywy:**

- zamiast *Dwustopniowy pipeline modelowy: Parakeet TDT (ASR) + osobny wav2vec2-large-xlsr-53-polish 315M / ~320 MB int8 (forced alignment CTC, RTF 0,15)* → **Forced alignment NA WŁASNEJ KRATOWNICY PARAKEETA. Transducer TDT pozwala na wymuszony alignment: przy zadanym ciągu tokenów robisz Viterbi po siatce (t, u) enkodera-jointa, dokładnie tak jak CTC, tylko na modelu, który już policzyłeś. Drugi model dokładasz DOPIERO gdy pomiar na własnym korpusie pokaże medianę >30 ms.** (Cztery konkretne zyski: (1) −320 MB modelu i −RTF 0,15, czyli koszt inferencji odcinka spada o ~40% (z 0,93 do ~0,58 USD) i on-device na Androidzie robi się realny; (2) ZERO rozjazdu tokenizacji — obecnie Parakeet ma tokenizer SentencePiece BPE na 25 języków, a XLSR-PL grafemowy, więc tekst trzeba renormalizować między modelami i każda różnica w interpunkcji/wielkich literach/liczbach psuje alignment; (3) TDT PRZEWIDUJE DURATION tokenu, więc granica jest ostrzejsza niż sama siatka 80 ms — CTC daje 20 ms grid, ale CTC ma udokumentowane systematyczne opóźnienie pików (peaky behaviour), którego spec w ogóle nie uwzględnia, a które może przekroczyć okno refinementu ±40 ms; (4) jeden model do utrzymania, kwantyzacji, walidacji i archiwizacji zamiast dwóch. Spec sam pisze, że fine-tuningu nie robi się przed pomiarem — ta sama zasada dotyczy dokładania drugiego modelu. Jeśli pomiar pokaże, że trzeba, to i tak nie XLSR-53 z grudnia 2022, tylko coś nowszego.)
- zamiast *Korekta dryfu zegarów przez GCC-PHAT na referencyjnym miksie zdalnym przesłanym przez WebRTC + regresja liniowa offsetu* → **Pomiar rate'u urządzenia LOKALNIE, bez sieci: regresja (liczba zarejestrowanych klatek) vs (monotoniczny zegar sprzętowy). iOS: AVAudioTime.hostTime + mach_timebase_info przy każdym buforze wejściowym. Android: AudioStream::getTimestamp() z Oboe (framePosition + nanoseconds). Wynik: ppm urządzenia, zapisywany w AudioSource.clock_ppm co 60 s. Sieć służy tylko do synchronizacji zegarów monotonicznych; offset startowy z GCC-PHAT na oknie 5-10 s z progiem peak-to-sidelobe > 3.** (Ścieżka sieciowa nie może dać deklarowanej dokładności, bo referencyjny miks jest wyjściem NetEq, który nieliniowo wstawia i usuwa próbki (accelerate/preemptive expand/PLC) w reakcji na jitter. To unieważnia model offset(t)=a+b·t, na którym stoi cała korekta: resampling będzie prostował artefakty jitter buffera zamiast dryfu zegara. Pomiar lokalny jest odporny na Opus, AEC, NetEq, utratę pakietów i zmienne opóźnienie, daje dryf z dokładnością <0,5 ppm po 10 minutach (czyli <20 ms na 3 h, dziesięć razy lepiej niż wymóg spec ≤1 ms... a przy ciągłym pomiarze i korekcie odcinkowej ≤1 ms), i — kluczowe — WYKRYWA urządzenia, które zmieniają rate w trakcie sesji (openQuestion #7 spec), bo nachylenie regresji przestaje być stałe. Metoda sieciowa tego nie odróżni od jittera. Bonus: eliminuje potrzebę zapisu i uploadu referencyjnego miksu 16 kHz (345,6 MB na ścieżkę na 3 h).)
- zamiast *MFA polish_mfa jako 'GOLDEN REFERENCE / prawda' w CI, z progiem mediany błędu granic ≤20 ms* → **20-30 minut polskiego materiału podcastowego z granicami słów anotowanymi RĘCZNIE w Praacie przez fonetyka. MFA schodzi do roli trzeciego głosu / detektora regresji na dużej próbce.** (Błąd granic MFA na mowie spontanicznej jest sam rzędu 20-30 ms, czyli równy progowi akceptacji — mierzysz zgodność dwóch estymatorów o porównywalnym błędzie i nie wiesz, który się myli. Gorzej: MFA wymaga słownika wymowy i G2P, więc dokładnie na przypadkach trudnych (nazwiska gości, anglicyzmy IT, code-switching) — czyli tam, gdzie chcesz mierzyć — 'prawda' albo znika, albo jest zmyślona przez G2P. Ręczna anotacja 25 minut to dwa dni pracy jednej osoby i zamyka temat dla całego projektu na trzy platformy. To jest dokładnie ten rodzaj wydatku, który zasada 'wysiłek nie jest wektorem' każe ponieść.)
- zamiast *i24 raw jako domyślny format capture na wszystkich platformach, z FLAC-24 w locie jako awaryjnym fallbackiem 'poniżej progu miejsca'* → **FLAC-24 w locie jako DOMYŚLNY format capture na urządzeniach mobilnych (blocksize 4096, SEEKTABLE co 10 s), i24 raw jako domyślny na desktopie/natywnym macOS/Windows.** (Spec odrzuca FLAC jako roboczy argumentem 'odczyt losowy to czysty seek offset = frame × 3, zero dekodowania'. Ale FLAC ma SEEKTABLE i stałe bloki: przy blocksize 4096 indeks bloku liczysz arytmetycznie, a dekod jednego bloku 24-bit mono to ~30-50 µs — o rząd wielkości poniżej budżetu prefetchu 5,46 s, który spec sam definiuje. Zysk jest za to twardy i rozwiązuje ryzyko, które spec sam wskazuje jako niemożliwe do obejścia (ryzyko #7): 4,666 GB → 2,71 GB, czyli bramka miejsca przechodzi na iPhonie, który spec skazuje na odmowę. Koszt 8-12% CPU jest realny, ale na telefonie nagrywającym JEDNĄ ścieżkę (a nie 12) to jest 8-12% z jednego rdzenia. Odwrócenie domyślnej wartości per platforma kosztuje jedną flagę w MaterialProfile, a ratuje główny scenariusz mobilny. Dodatkowo: i24 packed to niewyrównane 3-bajtowe próbki — jeśli i tak trzeba je rozpakowywać w pętli, argument 'zero dekodowania' jest słabszy niż wygląda, a argument '+25% I/O dla f32' nie ma za sobą żadnego pomiaru.)
- zamiast *Diaryzacja fallback jako pyannote/segmentation-3.0 (segmentacja) + embeddingi 3D-Speaker/WeSpeaker + klastrowanie* → **NVIDIA Sortformer (diar_sortformer_4spk / diar_streaming_sortformer_4spk-v2, CC-BY-4.0) jako podstawowa ścieżka fallbacku end-to-end, bez osobnych embeddingów i bez klastrowania. pyannote+embeddingi zostaje dla >4 mówców.** (Spec sam identyfikuje mowę nakładającą się jako główną słabość diaryzacji ('praktycznie gubiona') i główne źródło błędnej edycji. Pipeline segmentacja+embedding+klastrowanie jest architekturą, która overlapu NIE MODELUJE — przypisuje ramkę jednemu klastrowi. Sortformer jest modelem EEND-owym, który wielomówcowość modeluje wprost w wyjściu. Skoro overlap jest zdefiniowanym problemem, wybór modelu, który go modeluje, jest wyborem merytorycznym, nie wygodnym. Drugi powód jest licencyjny: Sortformer to jedne wagi CC-BY-4.0 od jednego wydawcy, zamiast łańcucha segmentacja (MIT, gated) + embeddingi (Apache-2.0 na kodzie, wagi trenowane na VoxCeleb CC-BY-SA i CN-Celeb) — czyli usuwa cały problem opisany w licenceProblems. Spec wymienia Sortformer wyłącznie jako opcję 'na żywo', co jest niedoszacowaniem.)
- zamiast *Ochrona pauzy retorycznej oparta na interpunkcji z ASR ('jeśli poprzednie zdanie kończy się znakiem końca zdania według ASR, minimum 400 ms')* → **Detekcja końca frazy PROZODYCZNA jako podstawa: opadający kontur F0 na ostatnich 200-300 ms (nachylenie < -150 centów/s), wydłużenie finalne (czas trwania ostatniej sylaby > 1,4 × mediana), spadek intensywności > 6 dB. Interpunkcja ASR jako wzmocnienie, gdy jest dostępna.** (Trzy powody. (1) Twoje własne openQuestion #6 pyta, czy interpunkcja Parakeeta dla polskiego wystarcza — a na mowie spontanicznej modele wytrenowane na Granary (gdzie interpunkcja była RESTAUROWANA pseudo-etykietowaniem) stawiają kropki nierówno. (2) Detektor pYIN i tak musi istnieć dla toru śpiewu, więc to zero dodatkowego DSP — dokładnie ten sam argument, którym spec uzasadnia detektor oddechów. (3) I najważniejsze produktowo: skracanie ciszy przestaje wtedy WYMAGAĆ CHMURY. Użytkownik importuje plik i natychmiast, offline, za darmo, dostaje działający 'remove silence' z ochroną rytmu — zamiast czekać na Workflow, ASR i aligner. To zmienia moment pierwszej wartości z 'kilka minut po uploadzie' na 'natychmiast', i robi to bez kompromisu jakościowego. Spec używa tej zależności jako argumentu, że WordTrack musi być obok obwiedni; realnie jest odwrotnie — im mniej warstwa DSP zależy od chmury, tym lepiej.)
- zamiast *Klasa A wypełniaczy usuwana automatycznie na podstawie samych luk w alignmencie + kryteriów akustycznych* → **Obowiązkowa weryfikacja drugim przebiegiem ASR na wyizolowanym fragmencie luki (padding 200 ms). Token leksykalny w wyniku = delecja ASR, oznacz jako 'brakujące słowo', NIE usuwaj. Plus twardsze kryterium akustyczne: monotoniczność formantów (zmiana F1 i F2 < 10% przez ≥100 ms) zamiast samego centroidu widmowego.** (Luka w alignmencie to suma trzech zdarzeń: wypełniacz, delecja ASR i błąd alignera. Przy realnym WER 15-25% na spontanicznym polskim (bo 7,31% to Fleurs, mowa czytana) delecje są częste, a automat skasuje je BEZ ŚLADU — użytkownik nie zobaczy nic w tekście, bo tego słowa tam nigdy nie było. Weryfikacja drugim przebiegiem kosztuje ułamek sekundy na kandydata (fragmenty 120-800 ms), jest praktycznie darmowa w skali odcinka i zamienia najgroźniejszy tryb awarii (ciche kasowanie treści) na nieszkodliwy (nadmiarowe podświetlenie). Monotoniczność formantów jest silniejszym dyskryminatorem niż centroid, bo każde realne słowo ma tranzycje formantowe, a wypełniacz z definicji ich nie ma.)
- zamiast *Jedna granica FFI: 'bindings-ffi/ uniffi → Swift + Kotlin'* → **Dwie granice: bindings-ffi-control (UniFFI, dla EDL/komend/analizy/storage) i bindings-ffi-rt (ręczny extern "C", kontekst preallokowany, rt_process(ctx, in, out, n) bez alokacji, panic=abort, parametry przez triple buffer/atomiki).** (UniFFI alokuje RustBuffer (malloc) i owija obiekty w Arc<Mutex<>> — wywołanie z render callbacku AVAudioSourceNode albo z Oboe onAudioReady łamie realtime safety i daje priority inversion. Metryka 'zero dropoutów audio' jest z tym niekompatybilna. To nie jest kwestia optymalizacji, tylko poprawności: alokator może zablokować wątek audio na czas nieograniczony. Podział na dwie granice trzeba zadeklarować w §10, bo inaczej pierwsza implementacja pójdzie najkrótszą drogą i problem wyjdzie dopiero na urządzeniu.)
- zamiast *Determinizm DSP przez 'golden-file testy w CI' bez sprecyzowania metody porównania* → **Zakaz std/core float math w core-dsp (clippy lint), wyłącznie crate libm (pure Rust, MIT), zakaz target-feature relaxed-simd, zakaz jakichkolwiek flag fast-math; golden-file z tolerancją: RMS różnicy < -120 dBFS i max |różnica| < 1e-5 na blokach 10 s.** (Bez tego CI będzie oblewał w sposób, którego nikt nie zdiagnozuje. sin/cos/tan/exp/log/pow w Ruście to platformowy libm na aarch64-apple-ios i aarch64-linux-android, a wkompilowany na wasm32 — trzy różne wyniki w ostatnich bitach. Dotyczy to współczynników każdego biquada RBJ (tan, cos), jądra sinc w rubato (sin), pYIN (log/exp), K-weightingu. Do tego WASM nie ma FMA, ARM64 ma, a relaxed-simd jest W SPECYFIKACJI niedeterministyczny. Crate libm daje ten sam kod źródłowy na wszystkich targetach, czyli realnie identyczne bity — to jedyny sposób, żeby zdanie 'port na Swift/Kotlin ma być przenoszeniem, nie pisaniem od nowa' było weryfikowalne.)
- zamiast *Startowanie kontenera z inferencją po zakończeniu nagrania, przy wymogu 'pierwszy tekst ≤60 s'* → **Inferencja W TRAKCIE nagrania: każda ukończona część multipart w R2 (8 MiB ≈ 54 s audio) wyzwala Queue → Workflow → kontener. Kontener startuje spekulatywnie w momencie rozpoczęcia sesji.** (Cold start kontenera z ~1 GB wag ONNX plus inicjalizacja sesji ORT dla enkodera 622 MB na 4 vCPU to realnie 15-45 s, a Cloudflare podaje '1-3 s' tylko dla małych obrazów. Budżet 60 s zjada się na samym starcie. Materiał i tak leci do R2 progresywnie — spec to już ma. Uruchamianie ASR na bieżąco sprawia, że transkrypt jest gotowy w sekundach po naciśnięciu STOP zamiast po minutach, a koszt idle kontenera (12 GiB × 0,0000025 USD/GiB-s ≈ 0,11 USD/h) jest nieistotny wobec 0,93 USD za inferencję odcinka. Dodatkowo Cloudflare zastrzega, że instancja może zniknąć w dowolnym momencie ('no guarantee that any instance will run for any set period of time'), więc rozbicie na segmenty ~54 s jest i tak wymuszone przez idempotencję.)
- zamiast *Widok tekstowy renderowany z WordTrack indeksowanego klatką w źródle* → **Widok tekstowy renderowany z PRZEJŚCIA PO KLIPACH OSI CZASU: dla każdego klipu w kolejności timeline_start → zapytanie interwałowe do WordTrack źródła po [source_in, source_in+len) → tokeny mieszczące się całe w klipie. Tokeny przecięte przez granicę klipu renderowane na szaro jako nieedytowalne. Struktura TimelineTextIndex przebudowywana inkrementalnie tylko dla dotkniętych klipów po każdej komendzie.** (To jest jedyny szew, na którym teza 'drugi widok na ten sam EDL' pęka, i spec go nie definiuje. Po RemoveRange z ripple odwzorowanie source→timeline nie jest monotoniczne, a po duplikacji klipu jedno źródłowe słowo istnieje na osi N razy. Przy renderowaniu z WordTrack nie wiadomo, co pokazać — i implementacja albo zduplikuje zdania, albo je zgubi, albo zdesynchronizuje kursor. Renderowanie z klipów rozwiązuje wszystkie trzy przypadki poprawnie i jest jednocześnie naturalnym miejscem, żeby pokazać użytkownikowi, że coś jest ucięte w środku słowa. Bez tej struktury undo w widoku tekstowym będzie się rozjeżdżać z undo na timeline mimo wspólnego command logu.)

<details><summary>Źródła</summary>

- [NVIDIA Parakeet-TDT-0.6B-v3 (CC-BY-4.0, 25 jezykow EU, WER pl 7,31% Fleurs, RTFx 3332, natywne timestampy slowne)](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)
- [NVIDIA Canary-1B-v2 (CC-BY-4.0, 978M, WER pl 8,40% Fleurs, RTFx 749)](https://huggingface.co/nvidia/canary-1b-v2)
- [OpenAI Whisper large-v3 (Apache-2.0, 1,55B, 128 binow mel, -10..-20% bledu vs large-v2)](https://huggingface.co/openai/whisper-large-v3)
- [WhisperX (BSD-2-Clause, 23,3k gwiazd, push 2026-07-13)](https://github.com/m-bain/whisperX)
- [WhisperX alignment.py — DEFAULT_ALIGN_MODELS_HF, model dla 'pl', trellis CTC Viterbi](https://raw.githubusercontent.com/m-bain/whisperX/main/whisperx/alignment.py)
- [jonatasgrosman/wav2vec2-large-xlsr-53-polish (Apache-2.0, WER 14,21% / CER 3,49% bez LM na Common Voice pl)](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-polish)
- [MahmoudAshraf/mms-300m-1130-forced-aligner — wagi CC-BY-NC-4.0, ZABLOKOWANE komercyjnie](https://huggingface.co/MahmoudAshraf/mms-300m-1130-forced-aligner)
- [ctc-forced-aligner — autor ostrzega wprost o licencji NC domyslnego modelu](https://github.com/MahmoudAshraf97/ctc-forced-aligner)
- [torchaudio MMS_FA forced alignment (token <star>, API deprecated w 2.8, usuwane w 2.9)](https://docs.pytorch.org/audio/main/tutorials/forced_alignment_for_multilingual_data_tutorial.html)
- [NeMo Forced Aligner — tylko CTC i hybrydy w trybie CTC, NIE obsluguje czystych transducerow](https://docs.nvidia.com/nemo-framework/user-guide/latest/nemotoolkit/tools/nemo_forced_aligner.html)
- [NVIDIA NeMo — Apache-2.0, 17,8k gwiazd, push 2026-07-26](https://api.github.com/repos/NVIDIA/NeMo)
- [pyannote-audio — MIT, 10,3k gwiazd, push 2026-07-24](https://api.github.com/repos/pyannote/pyannote-audio)
- [pyannote/speaker-diarization-community-1 — wagi CC-BY-4.0 (gated), DER: AMI IHM 17,0%, DIHARD3 20,2%, VoxConverse 11,2%](https://huggingface.co/pyannote/speaker-diarization-community-1)
- [faster-whisper (MIT) — int8/fp16, batched, 2926 MB VRAM int8, word_timestamps](https://github.com/SYSTRAN/faster-whisper)
- [whisper.cpp (MIT, 52,3k gwiazd) — Core ML/Metal/Vulkan/CUDA, iOS/Android, VAD Silero](https://github.com/ggml-org/whisper.cpp)
- [sherpa-onnx (Apache-2.0) — Parakeet/Whisper/Zipformer, bindingi Swift/Kotlin/WASM, diaryzacja, VAD](https://github.com/k2-fsa/sherpa-onnx)
- [onnx-asr (MIT) — eksport Parakeet v3 / Canary v2 do ONNX z timestampami tokenowymi](https://github.com/istupakov/onnx-asr)
- [Moonshine (MIT, 27M/61M) — WYLACZNIE angielski](https://huggingface.co/UsefulSensors/moonshine)
- [Silero VAD (MIT) — ~2 MB, <1 ms na chunk 30 ms, ONNX, WASM w przegladarce](https://github.com/snakers4/silero-vad)
- [Apple WWDC25 — SpeechAnalyzer / SpeechTranscriber (iOS 26+, w pelni on-device, .audioTimeRange, AssetInventory, volatile results)](https://developer.apple.com/videos/play/wwdc2025/277/)
- [Groq pricing — whisper-large-v3-turbo 0,04 USD/h, whisper-large-v3 0,111 USD/h](https://groq.com/pricing)
- [Deepgram pricing — Nova-3 mono 0,0077, multilingual 0,0092, diaryzacja +0,0020 (jednostka do weryfikacji)](https://deepgram.com/pricing)
- [Deepgram — lista jezykow, Nova-3 i Nova-2 wspieraja polski (pl)](https://developers.deepgram.com/docs/models-languages-overview)
- [AssemblyAI pricing — Universal-2 0,15 USD/h, Universal-3.5 Pro 0,21 USD/h, diaryzacja +0,02 USD/h](https://www.assemblyai.com/pricing)
- [ElevenLabs Scribe v2 — 0,22 USD/h, 90+ jezykow](https://elevenlabs.io/pricing/api)
- [Cloudflare R2 pricing — 0,015 USD/GB-mies., Class A 4,50/mln, Class B 0,36/mln, EGRESS 0](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare Containers — limity: max 4 vCPU / 12 GiB / 20 GB, BRAK wzmianki o GPU](https://developers.cloudflare.com/containers/platform-details/limits/)
- [Cloudflare Containers pricing — instancje lite..standard-4, stawki GiB-s / vCPU-s](https://developers.cloudflare.com/containers/pricing/)
- [Cloudflare Workers limits — 128 MB RAM, 5 min CPU (paid), body 100 MB Free/Pro](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Workers AI pricing — whisper-large-v3-turbo 0,0005 USD/min](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Workers AI whisper-large-v3-turbo — zwraca WebVTT, bez timestampow slownych](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/)
- [Replicate pricing — L40S 0,000975 USD/s, A100-80GB 0,001400 USD/s, T4 0,000225 USD/s](https://replicate.com/pricing)
- [Descript pricing — Hobbyist 10 h, Creator 30 h, Business 40 h mediow/mies., 25 jezykow](https://www.descript.com/pricing)
- [Riverside pricing — Pro 15 h / Grow 20 h / Webinar 25 h pobran osobnych sciezek, 48 kHz](https://riverside.com/pricing)
- [Auphonic features — adaptive leveler, multitrack crossgate/ducking, AutoEQ z czasowymi profilami per mowca, presety loudness](https://auphonic.com/features)
- [caniuse: FileSystemSyncAccessHandle — 93,39% globalnie, Safari 15.2+, Chrome 102+, Firefox 111+](https://caniuse.com/mdn-api_filesystemsyncaccesshandle)
- [caniuse: WebCodecs — Safari partial 16.4-18.7, pelne od 26.0; Chrome 94+; Firefox 130+](https://caniuse.com/webcodecs)

</details>

---

## Projekt produktu Vocal Coach: dekompozycja zadaniowa, mapa ekranów (web + iOS + Android), model wspólnych danych, wizualizacja intonacji, progresja gry, onboarding/kalibracja, prywatność głosu i katalog stanów brzegowych

**Werdykt:** Podział na trzy czasowniki jest właściwy, ale ma jedną wadę topologiczną: w briefie `capture -> [ćwiczenie: analiza na żywo] | [nagranie -> edycja -> eksport]` stoi ALTERNATYWA, więc ćwiczenie jest odnogą bez wyjścia — nie da się zmontować tego, co się przećwiczyło, ani ocenić tego, co się nagrało. Rekomenduję jeden prymityw danych — UJĘCIE (Take: PCM + kontur F0 + referencja + kalibracja urządzenia) — i cztery czasowniki nad nim: ĆWICZ (ujęcie z referencją, analiza na żywo), NAGRAJ (ujęcie bez referencji), OCEŃ (ujęcie → zrozumienie: cztery liczby, tabela nut, mapa błędów) i ZMONTUJ (ujęcia → artefakt + eksport). OCEŃ jest czasownikiem brakującym i nie jest biurokracją: feedback terminalny bije feedback równoczesny na retencji umiejętności motorycznej, a diagnoza „śpiewasz czysto ale 30 centów nisko" vs „śpiewasz chaotycznie" nie ma gdzie się zmieścić w modelu trzech czasowników. Profil materiału (SPIEW/MOWA) nie tylko przełącza łańcuch DSP — przełącza też domyślny czasownik wejściowy, bo środek ciężkości SPIEWU to ĆWICZ, a MOWY to ZMONTUJ. Architektonicznie decydujące jest jedno: cała analiza działa wyłącznie na urządzeniu, co Apple i Google literalnie zwalniają z deklaracji zbierania danych, a pitch tracking bez identyfikacji mówcy nie wchodzi pod art. 9 RODO — więc prywatność jest tu bronią produktową, nie kosztem. Rzecz, która decyduje o wszystkim innym: prawdziwość werdyktu intonacyjnego, bo to jest przyrząd pomiarowy udający grę, a przyrząd, który raz skłamał, jest bezwartościowy niezależnie od reszty.

### Decyzje

| Pytanie | Rozstrzygnięcie | Dlaczego | Odrzucone |
|---|---|---|---|
| Czy dekompozycja ĆWICZ / NAGRAJ / ZMONTUJ jest właściwa? | Prawie. Utrzymać, ale (a) dodać czwarty czasownik OCEŃ jako pełnoprawną rodzinę ekranów, (b) zamienić rozgałęzienie `\|` z briefu na jeden pipeline nad prymitywem UJĘCIE (Take), którego OCEŃ i ZMONTUJ są równoprawnymi konsumentami. | Rozgałęzienie czyni z ćwiczenia odnogę bez wyjścia — dokładnie stąd biorą się dwa potwierdzone błędy w repo: przekazywanie karaoke do Studio przez base64 w localStorage i filtr trybu 'karaoke' w bibliotece, który jest martwym UI. Gdy istnieje jedna encja Take, obie te ścieżki to otwarcie tego samego rekordu w innym widoku. OCEŃ jest brakującym czasownikiem, bo feedback terminalny (po wykonaniu) da | Odrzucone: scalenie ĆWICZ i NAGRAJ w jedno 'Capture' — różnią się obecnością referencji, a ta różnica propaguje się przez cały UI (wstęga celu vs jej brak), scoring (wynik vs brak wyniku) i intencję (popraw się vs zachowaj). Scalenie postawiłoby pytanie 'czy chcesz cel?' przed użytkownikiem, który chce po prostu wcisnąć nagrywanie. Odrzucone też: SPIEW i MOWA jako osobne aplikacje/sekcje nawigacji |
| Co jest prymitywem danych całej platformy? | UJĘCIE (Take): niezmienny rekord = PCM f32 48 kHz + kontur F0 + referencja (jeśli była) + snapshot kalibracji urządzenia + profil materiału. Analiza (Analysis) jest DERYWATEM, wersjonowanym przez analyzerVersion i przeliczalnym leniwie. | Rozdzielenie niezmiennego ujęcia od przeliczalnej analizy daje funkcję, której konkurencja nie ma: poprawa detektora F0 retroaktywnie poprawia oceny wszystkich historycznych sesji. Jest to niemożliwe, jeśli przechowuje się tylko wynik liczbowy — a repo dziś przechowuje wyłącznie wynik (averageAccuracy w localStorage) i to nawet wynik bez celu dydaktycznego (odległość do najbliższego dowolnego półt | Odrzucone: przechowywanie tylko wyniku i konturu bez PCM (tanie, ale zamyka drogę do ponownej analizy i do montażu). Odrzucone: localStorage jako magazyn tablic — potwierdzona przyczyna cichej utraty sesji przy przekroczeniu quoty. Odrzucone: trzy niezależne bazy IndexedDB jak dziś — brak wspólnego ID uniemożliwia jakiekolwiek przejście między czasownikami. |
| Gdzie żyje kalibracja latencji round-trip? | W ujęciu, jako latencyOffsetMs zapisany per (deviceId, routeType) w momencie startu capture, plus znaczniki zmiany trasy w środku ujęcia. Nigdy jako globalne ustawienie aplikacji. | Latencja zmienia się w trakcie: wypięcie słuchawek to inna trasa i inny offset. Jeśli offset jest globalny, ocena intonacji karaoke policzona dzień później użyje offsetu z innego urządzenia i będzie fałszem. To jest ta sama klasa błędu co potwierdzona usterka krytyczna 'zero kompensacji latencji round-trip w karaoke'. | Odrzucone: offset jako pole w settings (nie przetrwa zmiany słuchawek). Odrzucone: liczenie offsetu przy każdym scoringu na nowo z korelacji — działa tylko gdy podkład przecieka do mikrofonu, czyli dokładnie w scenariuszu, którego chcemy uniknąć. |
| Czy narzędzia gitarowe zostają w nawigacji głównej? | Zostają w produkcie, wypadają z nawigacji głównej. Nowa trasa /narzedzia z: stroik, metronom, gra akordowa. Przeramowane jako narzędzia muzyka, nie sekcja instrumentu. | Gitara nie jest czasownikiem — jej obecność jako piątej pozycji obok Ćwicz/Nagraj/Zmontuj rozmywa cały model. Merytorycznie warto ją zachować: stroik to ten sam detektor F0 (wspólny rdzeń, zero dodatkowego kodu DSP), a metronom jest potrzebny wokaliście do ćwiczeń rytmicznych i do podcastu (tempo mowy). | Odrzucone: usunięcie gitary (istniejący, działający kod, czysty model domenowy stroi/akordów/centów, i realny użytkownik — wokalista akompaniujący sobie). Odrzucone: awans gitary do piątego czasownika (nie jest zadaniem, jest instrumentem). |
| Ile zakładek na iOS i czy montaż jest zakładką? | Pięć zakładek na iPhone: Dziś / Ćwicz / Nagraj / Ujęcia / Postęp. Montaż NIE jest zakładką na iPhone — jest pushowany z ujęcia albo z listy projektów w Ujęciach. Na iPadzie montaż jest pozycją w NavigationSplitView. Ustawienia i Profil głosu to przycisk w nav barze, nie zakładka. | Tab bar jest dla równorzędnych miejsc docelowych, a Apple wprost ostrzega przed niestabilną konfiguracją zakładek; pięć to praktyczny sufit na iPhone. Multitrack jako pozycja najwyższego poziomu na ekranie szerokości 390 pt jest obietnicą, której nie da się dowieźć — edytor osi czasu wymaga precyzyjnego wskazywania i szerokości. Postęp zostaje zakładką, bo to jedyny ekran, który daje powód do powr | Odrzucone: sześć zakładek z Montażem (przepełnienie tab bara i zakładka, która na telefonie prowadzi do frustracji). Odrzucone: Ustawienia jako zakładka (marnuje najcenniejsze miejsce w UI na ekran odwiedzany raz). |
| Jak wchodzi się w capture na natywnych? | Zawsze jako pełnoekranowy modal (iOS: fullScreenCover / sheet z .interactiveDismissDisabled; Android: osobny ekran nawigacji z przechwyconym predictive back), nigdy jako push w stosie nawigacji. | Ekran capture jest właścicielem sesji audio i pliku na dysku. Push można zamknąć gestem back-swipe, co na iOS jest gestem przypadkowym — i traci się ujęcie. Modal z zablokowanym dismissem wymusza jawną decyzję 'zakończ / odrzuć'. Na Androidzie od 16 predictive back animuje odejście z ekranu jeszcze przed puszczeniem palca, więc bez przechwycenia w onBackPressedDispatcher utrata ujęcia jest wizualn | Odrzucone: push w NavigationStack (najprostsze, ale gubi ujęcia). Odrzucone: capture jako overlay nad zakładkami (miesza cykl życia audio z cyklem życia tab bara — to jest źródło potwierdzonej usterki 'Karaoke i Studio nie sprzątają przy odmontowaniu'). |
| Jedna liczba wyniku czy kilka? | Cztery liczby na ekranie OCEŃ, zawsze razem: offset (systematyczny, centy), rozrzut (1,4826 × MAD, centy), dryf (centy/min) i błąd interwałowy (mediana \|interwał zaśpiewany − docelowy\|). Jedna liczba wyłącznie w grze, i tam jest punktem, nie oceną głosu. | 'Śpiewasz czysto ale 30 centów nisko' i 'śpiewasz chaotycznie' to dwie różne diagnozy z dwoma różnymi ćwiczeniami naprawczymi, a jedna liczba je zlepia w tę samą wartość. Dodatkowo offset transpozycyjny jest w a cappella normą, nie błędem, więc karanie za niego jest błędem merytorycznym, który dyskwalifikuje aplikację u wyszkolonego śpiewaka. | Odrzucone: obecna 'średnia dokładność' = odległość do najbliższego dowolnego półtonu (potwierdzona usterka: metryka bez celu dydaktycznego, rośnie gdy śpiewasz cokolwiek stabilnie, w tym fałsz). Odrzucone: procent ramek w stroju (mierzy przede wszystkim rozkład długości nut, a ramki nie są niezależne). |
| Czym rośnie trudność gry? | Strukturą muzyczną, nie zacieśnianiem tolerancji. Osiem poziomów od unisonu z brzmiącą referencją do interwału zaśpiewanego przeciw dronowi na innej nucie. Tolerancja jest funkcją WŁASNEGO rozrzutu użytkownika: tol = max(25 centów, 1,5 × MAD tego użytkownika w tym rejestrze). | Zacieśnianie tolerancji poniżej ~20 centów nie mierzy śpiewu, mierzy szum estymatora F0 i rozdzielczość ekranu; eksperci oceniają interwały odchylone o 20–25 centów jako 'w stroju', a nietrenowani wykrywają rozstrojenie dopiero ok. 65 centów. Skok trudności, który realnie uczy, to usunięcie brzmiącej referencji (poziom 3) — dopiero wtedy pracuje pamięć wysokości, a nie odruch dopasowania. | Odrzucone: poziomy trudności jako 50 → 25 → 15 → 10 centów (mierzy detektor, nie człowieka; generuje 'zawsze 40%' i utratę zaufania). Odrzucone: globalny poziom użytkownika — zamiast tego stan mistrzostwa per komórka (interwał × rejestr × kierunek) z rozkładem Beta i doborem następnego elementu tak, by trafiać w pasmo 75–85% sukcesu. |
| Streak dzienny czy tygodniowy? | Tygodniowy cel (np. 4 sesje/tydzień) plus neutralny licznik ciągłości z automatycznymi dniami odpoczynku (2/miesiąc). Bez waluty, bez tabel liderów wobec obcych, bez framingu straty. | Argument jest domenowy, nie estetyczny: głos to mięsień, który potrzebuje regeneracji, a codzienny streak popycha początkującego do śpiewania na zmęczonym aparacie — to jest antypedagogika wpisana w mechanikę. Do tego nagrody podkopują motywację wewnętrzną głównie wtedy, gdy są oczekiwane, materialne i powiązane z wykonaniem zadania, które samo z siebie jest interesujące — czyli dokładnie w tym pr | Odrzucone: dzienny streak z framingiem straty w stylu Duolingo (szkodzi zdrowiu głosu i jest nagrodą kontrolującą). Odrzucone: XP/monety/gemy i tabele liderów wobec obcych (czysty cargo cult — mierzą czas w aplikacji, nie umiejętność, i przy wysokim wyjściowym zainteresowaniu zadaniem działają przeciw niemu). |
| Czy budujemy jakąkolwiek analizę emocji / 'pewności głosu'? | Nie. Nigdy. Ani jako funkcja, ani jako eksperyment, ani w podcastowym profilu jako 'ocena pewności prezentacji'. | Art. 5(1)(f) AI Act (obowiązuje od 2 lutego 2025) zakazuje wprowadzania do obrotu i używania systemów AI wnioskujących o emocjach osoby fizycznej w obszarze miejsca pracy ORAZ instytucji edukacyjnych, z wyjątkiem powodów medycznych lub bezpieczeństwa. Aplikacja do nauki śpiewu z edycją dla nauczycieli/szkół celuje dokładnie w 'instytucje edukacyjne'. To nie jest ryzyko regulacyjne do zarządzania — | Odrzucone: 'emocja w głosie' jako funkcja premium dla podcasterów (ten sam model, ta sama klasyfikacja, a granica 'miejsca pracy' jest dla podcastu zawodowego przekroczona). Odrzucone: rozpoznawanie mówcy / voiceprint do 'automatycznego rozpoznania kto mówi' w podcaście — to jest jedyny sposób, w jaki ten produkt mógłby wejść pod art. 9 RODO, i jest wymienny na wymóg 'każdy rozmówca na osobnej ści |
| On-device czy chmura? | Wszystko na urządzeniu domyślnie. Chmura wyłącznie jako jawna akcja per-ujęcie ('wyślij to ujęcie'), nigdy jako domyślny tor. | To nie jest uprzejmość — to dźwignia produktowa potwierdzona regulaminami obu sklepów. Apple: 'Data that is processed only on device is not collected and does not need to be disclosed.' Google: 'Data processed only ephemerally or only locally on-device does NOT need disclosure.' Skutek: etykieta App Privacy praktycznie pusta i formularz Data Safety mówiący 'no data collected' — w kategorii, w któr | Odrzucone: analiza w chmurze dla 'lepszych modeli' (uruchamia deklarację zbierania danych głosowych, wymóg szyfrowania w tranzycie, mechanizm żądania usunięcia, politykę prywatności z retencją — i kasuje główny wyróżnik). Odrzucone: hybryda 'na urządzeniu, ale telemetria konturów F0 do chmury na potrzeby ulepszania modelu' — kontur F0 wyprowadzony z głosu i wysłany dalej jest wg Apple osobną daną  |
| Grupa docelowa: 13+ czy Families? | 13+ w v1, świadomie i jawnie: bez grafiki przyciągającej dzieci, deklaracja target audience 13+. | Aplikacja do śpiewania z grą PRZYCIĄGNIE dzieci — to nie jest hipoteza. Play Families dla mieszanej publiczności wymaga neutralnego ekranu wieku, zakazu transmisji AAID, wyłącznie reklam nieprofilowanych z SDK z self-certyfikacją Families oraz kontroli rodzicielskiej nad funkcjami społecznościowymi. To są dwie równoległe ścieżki danych i osobny tor reklamowy. Decyzja: podjąć ją później i celowo, a | Odrzucone: brak deklaracji i 'zobaczymy' (Google zastrzega sobie prawo weryfikacji zgodności deklarowanej publiczności z treścią; grafika i słownictwo sugerujące dzieci uruchamiają własną ocenę Google). Odrzucone: wejście od razu w Families (podwaja tor danych przed walidacją produktu na dorosłych). |
| Dron referencyjny w tle podczas ćwiczenia? | Tak, jako podstawowy kanał feedbacku na telefonie — ale wyłącznie przy podłączonych słuchawkach. Na głośniku: bezwarunkowo wyłączony. | Dopasowanie do brzmiącej referencji jest tą umiejętnością, której się uczymy, więc kanał słuchowy jest silniejszy niż ekran — zwłaszcza na telefonie, gdzie użytkownik i tak nie patrzy. Ale przy echoCancellation:false dron z głośnika wchodzi do mikrofonu i aplikacja zalicza nuty za użytkownika; to jest potwierdzona usterka krytyczna w lib/audio-synth.ts:21. Detekcja trasy jest tania, a bez niej cał | Odrzucone: dron na głośniku z odejmowaniem echa (NLMS na sygnale znanym) — działa, ale wprowadza nietrywialny tor DSP po to, by ratować scenariusz, w którym i tak nie da się sensownie ćwiczyć intonacji. Lepiej powiedzieć użytkownikowi 'włóż słuchawki' i wyjaśnić dlaczego. |
| Feedback równoczesny czy terminalny podczas występu/karaoke? | Podczas występu: bandwidth feedback — dopóki użytkownik jest w tolerancji, nie pokazujemy NICZEGO. Werdykt per nuta pojawia się na końcu nuty jako glif. Pełna diagnoza wyłącznie na ekranie OCEŃ po wykonaniu. | Ciągły, równoczesny feedback poprawia wykonanie W SESJI, ale pogarsza retencję — użytkownik uczy się śledzić wskaźnik, nie słuchać siebie. Występ ma być stanem flow; nauka dzieje się na ekranie analizy. Dodatkowo pokazywanie błędu 8 centów, którego nikt nie słyszy, to szum informacyjny podawany jako porażka. | Odrzucone: ciągły error lane podczas karaoke (obecny wzorzec większości konkurencji, i to jest dokładnie ten wzorzec, który produkuje uzależnienie od wskaźnika). Odrzucone: brak jakiegokolwiek feedbacku w czasie realnym na ekranie ĆWICZ — tam feedback równoczesny jest uzasadniony, bo celem jest kalibracja odruchu, a nie wykonanie utworu. |
| Czym renderować wizualizację 60 fps na każdej platformie? | Web: dwie warstwy — statyczna (siatka, klawiatura, wstęga celu) w OffscreenCanvas w Workerze przez transferControlToOffscreen, dynamiczna (kontur, głowa, punkt błędu) w Canvas 2D na wątku głównym. Bez WebGL. iOS: MTKView (Metal) dla warstwy przewijanej, SwiftUI Canvas dla error lane, miernika i nakładek. Android: Compose Canvas (Skia) dla wszystkiego, z Modifier.drawWithCache; GLSurfaceView dopier | Warstwa dynamiczna to polilinia ≤1200 punktów i ~40 prostokątów — to jest kilka setek mikrosekund w Canvas 2D, więc WebGL dokłada obsługę utraty kontekstu i pipeline shaderów za zerowy zysk. Na iOS SwiftUI Canvas wystarcza dla elementów niescrollujących, ale warstwa przewijana przy 187 zdarzeniach F0/s na starszym urządzeniu potrzebuje Metala — i, co ważniejsze, CAMetalDisplayLink (iOS 17+) daje d | Odrzucone: WebGL/WebGPU dla konturu pitchu (narzut transferu i złożoność bez zysku przy tej liczbie prymitywów). Odrzucone: rysowanie po akumulowanej delcie rAF — zawsze dryfuje; zegarem rysowania musi być zegar audio, a każde zdarzenie F0 musi nieść znacznik czasu audio. Odrzucone: SpriteKit na iOS (system scen do zadania, które jest jedną polilinią). |

### Specyfikacja

## 0. Jedno zdanie pozycjonujące

**Vocal Coach to przyrząd pomiarowy, który jest zabawny.** Kategoria do wygrania: *jedyna aplikacja, której werdykt intonacyjny zaakceptowałby wyszkolony śpiewak*. Wszystko inne — nagrywanie, montaż, podcast — jest pochodną zaufania do pomiaru. Dlatego kolejność inwestycji w jakość jest: prawda pomiaru → integralność ujęcia → wyjście z aplikacji → wszystko inne.

---

## 1. DEKOMPOZYCJA

### 1.1 Poprawka topologiczna

Model z briefu:

```
capture -> [ćwiczenie: analiza na żywo] | [nagranie -> edycja -> eksport]
```

Znak `|` to alternatywa i to jest wada: ćwiczenie jest odnogą bez wyjścia. Poprawny model to jeden pipeline nad jednym prymitywem:

```
                    ┌─ ĆWICZ    (podczas capture: referencja + analiza na żywo)
capture ──> UJĘCIE ─┼─ OCEŃ     (po capture: cztery liczby, tabela nut, mapa błędów)
   ↑                └─ ZMONTUJ  (ujęcia -> artefakt -> eksport)
   │
   └─ NAGRAJ (capture bez referencji)
```

**UJĘCIE (Take)** = PCM f32 48 kHz + kontur F0 + referencja (jeśli była) + snapshot kalibracji urządzenia + profil materiału. Niezmienne.

### 1.2 Cztery czasowniki

| Czasownik | Wejście | Wyjście | Referencja | Profil, który dominuje |
|---|---|---|---|---|
| **ĆWICZ** | mikrofon + referencja | ujęcie + wynik na żywo | tak | SPIEW |
| **NAGRAJ** | mikrofon | ujęcie | nie | MOWA |
| **OCEŃ** | ujęcie | zrozumienie + ćwiczenie naprawcze | opcjonalnie | SPIEW |
| **ZMONTUJ** | ujęcia | projekt → plik | nie | MOWA |

**OCEŃ jest czasownikiem brakującym w modelu trzech**, i nie jest to porządkowanie. Dwa argumenty merytoryczne:

1. Feedback terminalny (po wykonaniu) daje lepszą retencję umiejętności motorycznej niż feedback równoczesny — hipoteza wskazówki (guidance hypothesis). Jeśli cała ocena dzieje się na żywo, użytkownik uczy się śledzić wskaźnik, nie słuchać siebie.
2. Diagnoza czterowymiarowa (offset / rozrzut / dryf / błąd interwałowy) fizycznie nie mieści się na ekranie ćwiczenia i nie ma sensu w czasie realnym — potrzebuje całego ujęcia.

Dziś ten czasownik jest rozsmarowany na trzy trasy bez wspólnej narracji: `/analysis`, `/library/session`, `/progress`.

### 1.3 Asymetria profili — konsekwencja nawigacyjna

Profil materiału nie jest tylko przełącznikiem łańcucha DSP. Środek ciężkości jest inny:

- **SPIEW**: ĆWICZ (80% czasu) → OCEŃ → rzadko ZMONTUJ
- **MOWA**: NAGRAJ → ZMONTUJ (80% czasu) → rzadko ĆWICZ

Skutek: **ekran Dziś ma inną akcję główną w zależności od zadeklarowanego profilu podstawowego**. To decyzja na poziomie nawigacji, nie na poziomie ustawień. Profil MOWA ma sensowne ćwiczenia (tempo mowy, gęstość wypełniaczy, monotonia wysokości = zakres F0 w mowie, spójność głośności, plozywy), ale nie ma sensownego „trzymania nuty".

### 1.4 Co przełącza profil materiału

| Wymiar | SPIEW | MOWA |
|---|---|---|
| Zakres F0 | 65–1100 Hz (C2–C6) | 70–350 Hz |
| HPF | 60 Hz (C2 = 65,4 Hz musi przejść) | 80 Hz M / 100 Hz K |
| Cel głośności | −14 LUFS (muzyka) | −16 LUFS mono podcast |
| Metryki | intonacja, vibrato, zakres, ataki | tempo (sylaby/s), wypełniacze, pauzy, zakres F0 mowy |
| Enhancement | DSP-first, denoise max −8 dB wet 30–50% | model SE pełną siłą |
| Redukcja szumu | nigdy modelu mowy pełną siłą | tak |
| Segmentacja | nuty (histereza na konturze) | słowa (forced alignment CTC) |
| Presety eksportu | WAV 48/24, FLAC | AAC 128 mono, MP3 dla RSS |
| Domyślny czasownik | ĆWICZ | ZMONTUJ |

### 1.5 Przejścia (to jest test poprawności modelu)

| Z | Do | Mechanika |
|---|---|---|
| Ćwiczenie → montaż | „Zmontuj to ujęcie" | Ten sam rekord Take. Zero transferu, zero base64, zero eksportu/importu. Nowy projekt z jedną ścieżką wskazującą to ujęcie. |
| Karaoke → ocena intonacji | „Zobacz analizę" | Take niesie `reference` + `latencyOffsetMs`. Scoring działa też trzy dni później, bo referencja i kalibracja są ZAPISANE, nie trzymane w RAM. |
| Ocena → ćwiczenie | „Przećwicz to" | Z 3 najgorszych nut/interwałów generujemy `Reference` i wchodzimy w ĆWICZ. **To jest pętla, która czyni z aplikacji trenera, a nie miernik.** |
| Nagranie → biblioteka utworów | „Zapisz jako referencję" | Kontur F0 własnego dobrego wykonania staje się `Reference` do drylowania. |
| Montaż → ocena | „Oceń ścieżkę wokalną" | Klip w projekcie wskazuje ujęcie; analiza działa na źródle, nie na miksie. |

Każde przejście to otwarcie tego samego rekordu w widoku innego czasownika. Zero serializacji między ekranami.

---

## 2. MAPA EKRANÓW

### 2.1 Web — kanoniczne trasy

Dziś repo ma **28 tras z pięcioma zestawami duplikatów** (`/train` + `/training`, `/library/progress` + `/progress`, `/edit/studio` + `/studio`, `/record/karaoke` + `/karaoke`, `/library` + `/sessions`). To jest bezpośrednia przyczyna potwierdzonej usterki „martwy warunek po przemianowaniu /training → /train: wszystkie sesje zapisują się jako 'live'". Kanonizacja i przekierowania 301:

```
/                          Dziś            akcja główna zależna od profilu
/cwicz                     hub ćwiczeń
/cwicz/rozgrzewka          rozgrzewka prowadzona (sekwencja adaptacyjna)
/cwicz/celuj               Hit the Note (rdzeń, który się obronił)
/cwicz/interwaly           dryl interwałowy (nowy)
/cwicz/gamy                gamy i arpeggia, transponowane do tessitury
/cwicz/utwor               sing-along / dryl melodyczny
/cwicz/mowa                dryl mowy (profil MOWA)
/nagraj                    capture; wybór profilu SPIEW/MOWA
/nagraj/karaoke            capture z podkładem
/ujecia                    biblioteka ujęć (filtry: profil, referencja, ocena, flagi)
/ujecia/[id]               OCEŃ — analiza ujęcia
/ujecia/[id]/nuty          rozbiór nuta po nucie
/montaz                    lista projektów
/montaz/[id]               edytor multitrack (świadomy profilu)
/postep                    postęp
/glos                      profil głosu: zakres, tessitura, kalibracja, rejestry
/narzedzia                 stroik, metronom, gra akordowa
/ustawienia                audio, prywatność, dane, konto
```

**19 tras zamiast 28**, każda z jednym właścicielem.

Desktop: sidebar 220 px, grupy = czasowniki. Mobile web: bottom bar 5 pozycji + `/ustawienia` w headerze (dokładnie jak dziś — ten wzorzec jest poprawny, zmienia się tylko zawartość).

### 2.2 iOS — te same zadania, inna geometria

**Tab bar, 5 zakładek (iPhone):** `Dziś` · `Ćwicz` · `Nagraj` · `Ujęcia` · `Postęp`

- `Ustawienia` i `Profil głosu` → przycisk avatara w `.toolbar` na Dziś. Nie marnujemy zakładki na ekran odwiedzany raz.
- `Montaż` → **nie jest zakładką**. Wchodzi się z ujęcia (`Zmontuj`) albo z sekcji Projekty w Ujęciach. Multitrack jako miejsce najwyższego poziomu na 390 pt to obietnica niedowożalna.
- `Narzędzia` → sekcja w Dziś.

**Wymuszenia natywne, których web nie ma:**

| Wzorzec iOS | Konsekwencja |
|---|---|
| Tab bar = miejsca równorzędne, stabilna konfiguracja | Czasowniki muszą być równorzędne (są), a zakładki nie mogą się zmieniać między profilami — zmienia się tylko akcja główna w Dziś |
| iOS 26: minimalizacja tab bara przy przewijaniu + akcesorium nad tab barem | Idealne miejsce na trwałą pigułkę „nagrywam / ćwiczę 04:12" widoczną z każdej zakładki. Web nie ma odpowiednika. |
| Capture jako `fullScreenCover` + `.interactiveDismissDisabled()` | Back-swipe nie może zabić ujęcia |
| `NavigationSplitView` na iPadzie | Montaż awansuje do sidebara; Ujęcia + OCEŃ to master-detail |
| `AVAudioSession` żyje poza cyklem życia widoku | Sesja audio należy do serwisu, nie do ekranu — to naprawia „Karaoke i Studio nie sprzątają przy odmontowaniu" |
| Wymóg wizualnego wskazania nagrywania (App Review 2.5.14) | Własny wskaźnik, nie tylko systemowa oranżowa kropka |
| `UIBackgroundModes: audio` | Długie ujęcia podcastowe w tle — funkcja niemożliwa w web |

### 2.3 Android — te same zadania, trzeci układ

**Klasy rozmiaru okna (oficjalne progi):** compact < 600 dp → `NavigationBar`; medium 600–839 dp → `NavigationRail`; expanded ≥ 840 dp → `NavigationDrawer`. Wysokość: compact < 480 dp, medium 480–899 dp, expanded ≥ 900 dp.

- compact: `NavigationBar` z tymi samymi 5 pozycjami
- medium (tablet portret, foldable rozłożony): `NavigationRail` + Montaż jako 6. pozycja — tu się już mieści
- expanded: `NavigationSuiteScaffold` z permanentnym drawerem, layout = web desktop

**Wymuszenia natywne Androida:**

| Wzorzec Android | Konsekwencja |
|---|---|
| Predictive back (Android 16) | Podczas capture: `BackHandler` + dialog „odrzucić ujęcie?". Bez tego animacja odejścia jest wizualnie nieodwracalna. |
| Foreground service typu `microphone` | **Wymagane** dla capture w tle: `FOREGROUND_SERVICE_MICROPHONE` + `FOREGROUND_SERVICE` w manifeście, `android:foregroundServiceType="microphone"`, `startForeground(FOREGROUND_SERVICE_TYPE_MICROPHONE)`, plus deklaracja w Play Console → Policy → App content |
| `RECORD_AUDIO` jest while-in-use | Serwisu nie da się wystartować z tła ani z `BOOT_COMPLETED`. Capture zawsze inicjuje użytkownik z pierwszego planu. |
| Powiadomienie FGS | Musi pokazywać czas ujęcia + akcję Stop; to jest realny ekran produktu, nie detal |
| `MediaRecorder.AudioSource.UNPROCESSED` | Właściwe źródło dla analizy F0; sprawdzać `AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED`, fallback `VOICE_RECOGNITION` |
| `NavigationSuiteScaffold` | Jedna deklaracja nawigacji na trzy klasy okna |

### 2.4 Tabela: to samo zadanie, trzy realizacje

| Zadanie | Web | iOS | Android |
|---|---|---|---|
| Nawigacja główna | sidebar 220 px / bottom bar | TabView 5 zakładek | NavigationBar / Rail / Drawer wg klasy okna |
| Wejście w capture | trasa `/nagraj` | fullScreenCover, dismiss zablokowany | ekran nawigacji + przechwycony back |
| Capture w tle | **niemożliwe** — czyste zakończenie i komunikat | UIBackgroundModes: audio | FGS type microphone |
| Montaż | trasa najwyższego poziomu | push z ujęcia; zakładka na iPadzie | 6. pozycja od medium |
| Trwały wskaźnik sesji | sticky pigułka | akcesorium tab bara (iOS 26) | powiadomienie FGS + pigułka in-app |
| Ustawienia | trasa | przycisk w toolbarze | pozycja w drawerze / toolbar |

---

## 3. CO JEST WSPÓLNE — MODEL DANYCH

Jedna schema SQLite na wszystkich trzech platformach (web: SQLite Wasm na OPFS; native: ten sam plik przez rusqlite/FFI). Audio jako osobne pliki w OPFS / w katalogu aplikacji.

### 3.1 Encje

```
Identity        id, createdAt, displayName?, primaryProfile: SING|SPEECH
                (konto opcjonalne; local-first)

AudioProfile    id, deviceLabel, deviceIdHash, routeType: SPEAKER|WIRED|BT_A2DP|BT_HFP|USB
                noiseFloorDbfs, noiseSpectrum8Band[8]
                latencyRoundTripMs, latencyStdMs, latencyMeasuredAt
                agcDetected: bool, requestedConstraints, actualSettings
                sampleRate, channelCount
                → klucz to (device, route). Wypięcie słuchawek = INNY rekord.

VoiceProfile    id, identityId, updatedAt
                rangeLowMidi, rangeHighMidi           (5. i 95. percentyl, nie ekstrema)
                tessituraLowMidi, tessituraHighMidi   ← WAŻNIEJSZE niż zakres
                registerTransitions[]                  (przejścia rejestrowe, MIDI)
                perNoteReliability[]                   (MAD centów per klasa × oktawa)
                voiceTypeHint?                         (derywat tessitury, nigdy tożsamość)
                analyzerVersion

Take            id (UUIDv7), identityId, createdAt, deletedAt?
                profile: SING|SPEECH
                verb: PRACTICE|RECORD                  (czy była referencja)
                audioUri, audioFormat, durationMs, sampleRate
                f0ContourUri                            (Float32: t, cents, conf, rms)
                referenceId?                            (cel, jeśli był)
                audioProfileSnapshot                    (kopia, nie FK — urządzenie może zniknąć)
                latencyOffsetMs                         (użyty do wyrównania)
                routeChangeMarkers[]                    (t, nowa trasa, nowy offset)
                interruptionMarkers[]                   (t, powód)
                lowConfidence: bool                     (zły SNR / AGC / brak kalibracji)
                schemaVersion, deviceId

Reference       id, kind: EXERCISE|MELODY|SONG|USER_TAKE|GENERATED_DRILL
                notes[] { midi, onsetMs, durationMs, lyric? }
                tuningMode: EQUAL_TEMPERED|A_CAPPELLA_JI
                transposeSemitones, sourceUri?

Analysis        id, takeId, analyzerVersion, computedAt
                offsetCents, scatterCents, driftCentsPerMin, intervalErrorCents
                notes[] { refIdx, sungMedianCents, attackMs, stabilitySd,
                          vibratoHz, vibratoExtentCents, verdict }
                voicedRatio, snrDb
                → DERYWAT. Kasowalny, przeliczalny.

Project         id, profile, tracks[], clips[], automation[], masterChain
                (klip wskazuje Take, nie kopiuje audio)

SkillState      identityId, cell: (interval, register, direction)
                betaAlpha, betaBeta, lastSeenAt, attempts
                → posterior Beta na P(trafienie); podstawa doboru następnego elementu

Goal            identityId, weeklySessions, restDaysRemaining, currentStreakWeeks
```

### 3.2 Reguły, które nie podlegają negocjacji

1. **Take jest niezmienny; Analysis jest derywatem z `analyzerVersion`.** Gdy detektor się poprawia, historyczne oceny przeliczają się leniwie przy otwarciu. To jest funkcja niemożliwa, gdy trzyma się tylko wynik — a repo dziś trzyma tylko wynik.
2. **Żadna tablica nigdy nie ląduje w localStorage.** `pitchHistory` w localStorage jest potwierdzoną przyczyną cichej utraty sesji (przekroczenie quoty).
3. **`latencyOffsetMs` per ujęcie, nie per aplikacja.**
4. **Kontur F0 jest tani, audio jest drogie.** 3 min przy 187,5 ramki/s × 4 pola × 4 B ≈ 540 kB → wykresy postępu bez dotykania blobów. Audio: f32 48 kHz mono = 192 kB/s = **11,5 MB/min**.
5. **Autoretencja, nie dialog zapisu.** Każde ĆWICZ i NAGRAJ tworzy Take z audio bezwarunkowo. Użytkownik decyduje później przez nie-usunięcie. Obecny model (dialog zapisu + autozapis wyłącznie w nawigacji desktopowej, wskutek czego na telefonie NIC się nie zapisuje) jest najgorszym z dwóch światów.
6. **`hasAudio` jest wyliczane z istnienia pliku, nigdy zapisywane.** Dziś zahardkodowane na `true`, a audio nie istnieje.
7. **Jedno ID, jedna baza, migracje od pierwszego dnia** (`schemaVersion`, `updatedAt`, `deletedAt`, `deviceId` w każdej tabeli — na wypadek późniejszej synchronizacji LWW).

### 3.3 Ustawienia audio jako obiekt pierwszej klasy

`/glos` i `/ustawienia` konsumują ten sam `AudioProfile`. Ekran musi pokazywać: zmierzone dno szumu (dBFS), zmierzoną latencję (ms) z rozrzutem, czy AGC zostało wykryte mimo `autoGainControl:false`, i aktualną trasę. To nie jest ekran dla nerdów — to jest ekran, na który odsyłamy z każdego stanu brzegowego zamiast pokazywać toast.

---

## 4. CO MUSI BYĆ ZNAKOMITE

Po jednej rzeczy na czasownik. Kryterium: co, jeśli zawiedzie jeden raz, powoduje odejście.

### ĆWICZ → **prawdziwość werdyktu intonacyjnego**

Konkretnie: zero błędów oktawowych i zero fałszywego „jesteś nisko", gdy użytkownik ma rację.

To jest przyrząd pomiarowy udający grę. Użytkownik przychodzi z pytaniem „czy śpiewam czysto?" i przyjmuje odpowiedź na wiarę, bo nie ma niczego, czym mógłby ją sprawdzić — a w tym właśnie momencie kupuje albo traci zaufanie do całego produktu. Miernik, który raz skłamał, jest bezwartościowy: użytkownik nie wie, które inne odczyty były kłamstwem, więc odrzuca wszystkie. Repo ma dziś na to trzy niezależne dowody: systematyczny błąd oktawowy/kwintowy dla każdej nuty powyżej E4 (detektor zestrojony na 200 Hz), blokada na jednej wysokości uniemożliwiająca wykrycie skoku interwałowego, oraz tryb domyślny liczący naiwny DFT O(N²) po 26,9 ms na ramkę. Suma: użytkownik śpiewający poprawnie A4 widzi A3 i dostaje informację, że jest o oktawę nisko.

Test akceptacyjny: śpiewak wyszkolony wykonuje gamę C3–C5 i skoki oktawowe; aplikacja nie może zgłosić ani jednego błędu oktawowego, a mediana |błędu| musi być < 10 centów na czystym sygnale.

### NAGRAJ → **ujęcie istnieje i brzmi jak głos użytkownika**

Konkretnie: bezstratny capture bez pominiętej próbki + realny monitoring w słuchawkach o znanej latencji.

Dwa argumenty. Pierwszy: śpiewak nie użyje rejestratora, przez który się nie słyszy — monitoring nie jest wygodą, jest warunkiem możliwości śpiewania z podkładem. Drugi: utrata ujęcia jest jedyną awarią, której nie da się naprawić przeprosinami. Użytkownik, który zaśpiewał raz dobrze i tego nie ma, nie wraca. Repo ma tu usterkę, która kasuje cały filar: `MediaRecorder` nigdy nie startuje (stale closure), więc ŻADNA sesja z `/record/live` ani z `/train/*` nie ma pliku audio, a Studio pokazuje nagrania, których nie da się otworzyć. Do tego brak jakiegokolwiek monitoringu i drugie `getUserMedia` bez constraints włączające AGC/NS/AEC na strumieniu przeznaczonym do nagrania.

### ZMONTUJ → **rzecz wychodzi z aplikacji**

Konkretnie: przycisk eksportu, który produkuje plik zgodny z tym, co słychać w edytorze.

Montaż bez eksportu to nie edytor, to zabawka — i to jest dosłowny stan repo: edytor multitrack pozwala zaimportować ślady, pociąć je na klipy, ustawić automatykę i EQ, i nie ma ŻADNEJ ścieżki wyniesienia tego z aplikacji, a jedyny renderer jest martwym kodem, który i tak by nie zadziałał (ignoruje EQ, master i klipy). Podcaster ocenia edytor w pierwszych pięciu minutach po jednym kryterium: czy dostanę plik. Drugie w kolejności: undo — którego też nie ma, a undo w edytorze pojedynczej ścieżki kasuje audio bezpowrotnie i drugie cięcie niszczy zły fragment.

### OCEŃ → **liczba rusza się z powodu, który użytkownik umie wskazać**

Konkretnie: każda zmiana wyniku musi być klikalna aż do konkretnej nuty w konkretnym ujęciu.

Wynik, którego nie da się rozłożyć, jest wyrokiem, nie informacją zwrotną — a wyrok bez uzasadnienia jest demotywujący niezależnie od wartości. Dziś „średnia dokładność" mierzy odległość od najbliższego dowolnego półtonu, więc rośnie, gdy użytkownik stabilnie fałszuje, i nie ma żadnego związku z celem dydaktycznym. To jest metryka, która aktywnie dezinformuje.

---

## 5. WIZUALIZACJA FEEDBACKU INTONACYJNEGO

### 5.1 Zasada nadrzędna: dwa zadania = dwa widoki

Nie da się w jednym pasie pokazać 2–3 oktaw i precyzji ±10 centów. Na 300 px to 12 centów/px, czyli 10 centów = 0,8 px. Fizycznie niemożliwe. Dlatego: **piano-roll dla kształtu melodii + osobny error lane dla precyzji.**

### 5.2 Ekran A — ĆWICZENIE w czasie realnym (cel znany)

Trzy strefy, iPhone portret, obszar użyteczny ~360 × 620 pt:

```
┌──────────────────────────────────────┐
│  PIANO-ROLL          280 pt          │  okno = cel ±6 półtonów = 1200 centów
│  ▓▓▓▓▓ wstęga celu                   │  → 1200/280 = 4,3 centa/pt
│    ╱╲__ kontur głosu                 │  przewijanie 120 pt/s, głowa na 70% szer.
│              ▲ głowa (70%)           │  (30% przyszłości widoczne — konieczne dla melodii)
├──────────────────────────────────────┤
│  ERROR LANE           72 pt          │  ±50 centów pełna skala
│  +50 ─────────────────               │  → 100/72 = 1,4 centa/pt
│    0 ═══════════════ ● ◄─ punkt      │  10 centów = 7 pt = WIDOCZNE
│  −50 ─────────────────               │  NIC nie przewija się; punkt rusza się tylko w pionie
├──────────────────────────────────────┤
│  MIERNIK TRZYMANIA   120 pt          │  łuk/pasek, który się wypełnia
│      ◕ 68%    C4   +8 ¢              │  ← TA MECHANIKA JUŻ DZIAŁA, nie ruszać jej logiki
└──────────────────────────────────────┘
```

**Co się rusza i jak:**
- Piano-roll: przewija prawo→lewo ze stałą 120 pt/s. Wstęga celu przewija się razem z konturem.
- Error lane: nie przewija się wcale. Punkt rusza się tylko w pionie + ślad zanikający przez 400 ms. Uzasadnienie: dwa różne zadania dostają dwa różne modele ruchu; przewijanie w error lane odwracałoby uwagę od jedynej istotnej osi.
- Miernik trzymania: wypełnia się **w czasie, nie w ramkach**. Obecny `REQUIRED_CONSECUTIVE_HITS = 100` jest liczony w ramkach, więc próg trafienia zależy od częstotliwości odświeżania ekranu (potwierdzona usterka). Poprawnie: akumulator sekund w tolerancji, cel 1500 ms, dekrement −1× dt przy lekkim odchyleniu, −5× dt przy >100 centów (asymetria z obecnego kodu jest dobrym pomysłem, tylko jednostka jest zła).

**Głowa „teraz" interpolowana do czasu prezentacji klatki**, nie do ostatniego zdarzenia audio. To jest powód, dla którego 30 fps wygląda jak 60 fps.

### 5.3 Ekran B — WYSTĘP / KARAOKE

Inne zadanie: nie uczyć precyzji, utrzymać flow.

```
┌──────────────────────────────────────┐
│  ▓▓▓▓  ▓▓▓▓▓▓   ▓▓  ▓▓▓▓▓            │  piano-roll 250 pt, zakres melodii +3 półtony,
│    ╱─╲__╱─────╲____╱───              │  min 2 oktawy → 2400–3000 centów / 250 pt
│                                      │  = 10–12 centów/pt
│  "…i wtedy zo-ba-czy-łem…"           │  linia tekstu
└──────────────────────────────────────┘
        BEZ error lane
```

**Bandwidth feedback:** dopóki |błąd| ≤ tolerancja, nie renderujemy żadnego wskazania błędu. Powyżej — kontur zmienia barwę i grubość. Werdykt per nuta pojawia się jako mały glif na końcu nuty (terminalnie), nie w trakcie. Wynik akumuluje się w prawym górnym rogu, mały, zdeemfazowany.

Uzasadnienie: ciągły feedback równoczesny poprawia wykonanie w sesji, ale pogarsza retencję — użytkownik uczy się śledzić wskaźnik. Występ ma być flow; nauka dzieje się na ekranie C. Dodatkowo pokazywanie błędu 8 centów, którego nikt nie słyszy, to szum informacyjny podany jako porażka.

### 5.4 Ekran C — ANALIZA po nagraniu (tu idziemy na maksimum)

```
┌─────────────────────────────────────────────────────────────┐
│ 1 │ waveform + kontur F0 na tle celu, całe ujęcie, LOD, scrub │
├─────────────────────────────────────────────────────────────┤
│ 2 │ TABELA NUT — sortowalna po błędzie                        │
│   │ # │ cel │ zaśpiew. │ atak  │ stab. │ vibrato │ werdykt   │
│   │ 4 │ E4  │ −34 ¢    │ 180ms │ 12 ¢  │ 5,2 Hz  │ nisko  ▼ │
│   │ 7 │ A4  │  +6 ¢    │  70ms │  8 ¢  │ —       │ czysto ● │
│   │   │ klik → odtwarza tę nutę ±300 ms razem z referencją    │
├─────────────────────────────────────────────────────────────┤
│ 3 │ CZTERY LICZBY (nigdy jedna)                               │
│   │ offset −18 ¢ │ rozrzut 22 ¢ │ dryf +4 ¢/min │ interw. 15 ¢│
│   │ "śpiewasz czysto, ale całość leży 18 centów nisko"        │
├─────────────────────────────────────────────────────────────┤
│ 4 │ HEATMAPA 12 klas × oktawy; kolor = mediana |błędu|,       │
│   │ glif strzałki = znak biasu                                │
│   │ → "problem: opadające tercje małe w okolicy E4"           │
├─────────────────────────────────────────────────────────────┤
│ 5 │ [ Przećwicz te 3 nuty ]  ← zamyka pętlę do ĆWICZ          │
└─────────────────────────────────────────────────────────────┘
```

Wiersz 3 jest najważniejszą decyzją UI w całej aplikacji. Rozdzielenie offsetu (transpozycja + dryf) od residuum (prawdziwy fałsz) to różnica między „śpiewasz czysto, tylko nisko" i „śpiewasz chaotycznie" — dwie różne diagnozy z dwoma różnymi ćwiczeniami. Jedna liczba je zlepia.

### 5.5 Wygładzanie — dokładny łańcuch

```
bramka voicing  →  median-3 w CENTACH  →  One Euro Filter na centach
```

**W tej kolejności, nigdy inaczej, i nigdy przez luki bezdźwięczne.**

| Etap | Parametry | Opóźnienie |
|---|---|---|
| hop | 256 @ 48 kHz = 5,33 ms → 187,5 Hz | — |
| median-3 | w centach; zabija skoki oktawowe, których filtr liniowy nie zabije | 16 ms |
| One Euro | `fcmin = 1,5 Hz`, `beta = 0,01`, `dcutoff = 1,0 Hz`, karmiony REALNYM dt | adaptacyjne |

Procedura strojenia One Euro (z dokumentacji autorów): ustaw `beta = 0` i `fcmin ≈ 1 Hz`, dostrajaj `fcmin` przy wolnym ruchu aż zniknie jitter, potem podnoś `beta` rzędami wielkości (0,001 / 0,01) przy szybkim ruchu aż zniknie opóźnienie.

**Dlaczego One Euro, a nie EMA:** vibrato śpiewaka to 4–7 Hz przy zasięgu ±34…±123 centów (średnio ±71 u zawodowca). Prędkość sygnału ~1400 centów/s → adaptacyjny cutoff rośnie do ~15 Hz i vibrato przeżywa. Każdy stały low-pass z odcięciem poniżej 8–10 Hz spłaszczy vibrato, czyli **skasuje dowód umiejętności**. Test regresyjny: zaśpiewaj 5 Hz / ±60 centów; zmierzony zasięg nie może spaść o więcej niż 10%.

**Nigdy nie wygładzać przez luki bezdźwięczne** — tworzy fantomowe zjazdy i łamane glissanda, które użytkownik czyta jako własny błąd. Polilinia musi się PRZERWAĆ na bezdźwięcznych.

### 5.6 Histereza — tylko dla stanów dyskretnych

| Element | Histereza? |
|---|---|
| pozycja rysowanej linii | **NIE** — nigdy |
| wskaźnik „czysto" / barwa / dźwięk / haptyka / punktacja | **TAK** |

Wejście w „czysto": |błąd| ≤ tol. Wyjście: |błąd| > tol + 10 centów. Dwell 100 ms przed zmianą stanu. Tożsamość nuty docelowej: 60 ms powyżej granicy przed przepisaniem. Odczyt liczbowy centów: throttle do 10 Hz (187 aktualizacji/s to nieczytelna migotanina).

Tolerancja adaptacyjna: `tol = 25 ¢ × f_dur × f_reg`, gdzie `f_dur = clamp(1 + (200 − min(dur,200))/200, 1, 2)` i `f_reg = 1 + max(0, 130 − f0Hz)/130 × 0,8`. Nuty ≤ 100 ms nie są oceniane wcale.

### 5.7 Kolory — bezpieczne dla daltonistów

Paleta Okabe-Ito. **Barwa = KIERUNEK błędu; luminancja/poświata = WIELKOŚĆ. „Czysto" nie ma własnej barwy — jest neutralne.** To rozwiązuje problem, którego nie rozwiązuje zielony/żółty/czerwony (wyklucza ~8% mężczyzn).

| Rola | Motyw ciemny | Motyw jasny |
|---|---|---|
| tło | `#12141A` | `#FFFFFF` |
| siatka | `#262A33` | `#E4E7EC` |
| wstęga celu | `#56B4E9` @ 25% | `#0072B2` @ 18% |
| **za nisko (flat)** | `#56B4E9` sky blue | `#0072B2` blue |
| **czysto** | `#F5F5F5` + poświata `#F0E442` @ 20% | `#1A1A1A` + poświata `#E69F00` @ 20% |
| **za wysoko (sharp)** | `#E69F00` → `#D55E00` | `#D55E00` vermillion |
| ostrzeżenie SNR | `#CC79A7` | `#CC79A7` |

Uwaga: te same heksy w obu motywach są błędem. `#0072B2` jest czytelny na białym i za ciemny na `#12141A` — dlatego dla ciemnego motywu podnosimy do `#56B4E9`.

### 5.8 Kodowanie dokładności BEZ koloru — minimum trzy kanały równolegle

1. **Pozycja** w error lane (kanał podstawowy, 1,4 centa/pt)
2. **Kształt glifu**: `▲` sharp / `●` czysto / `▼` flat
3. **Grubość linii**: 2 px czysto → 4 px poza tolerancją
4. **Liczba centów** z znakiem, throttle 10 Hz
5. **Wypełnienie wstęgi nuty**: gładkie = czysto, ukośne kreskowanie = poza tolerancją

Test: aplikacja musi być w pełni używalna w trybie skali szarości. To jest twarde kryterium akceptacji, nie aspiracja.

### 5.9 Haptyka i dźwięk jako kanał równoległy (telefon)

**Dźwięk — kanał NAJSILNIEJSZY na telefonie:**
- Dron referencyjny na nucie docelowej: sinus + trójkąt, −20 dBFS, duckowany o 6 dB gdy użytkownik śpiewa.
- **Wyłącznie przy podłączonych słuchawkach.** Na głośniku przy `echoCancellation:false` dron wchodzi do mikrofonu i aplikacja zalicza nuty za użytkownika — potwierdzona usterka krytyczna.
- Uzasadnienie: dopasowanie do brzmiącej referencji jest tą umiejętnością, której uczymy. Na telefonie użytkownik i tak nie patrzy w ekran, gdy śpiewa.

**Haptyka — wyłącznie impulsowa, nigdy ciągła:**
- Pojedynczy impuls przy WEJŚCIU w tolerancję po ≥ 300 ms poza nią. Nic podczas trzymania.
- iOS: `CHHapticTransientEvent`, `intensity 0.5`, `sharpness 0.3`, przez `CHHapticEngine`.
- Android: `VibrationEffect.startComposition().addPrimitive(PRIMITIVE_CLICK, 0.5f)` (API 30+, sprawdzać `areAllPrimitivesSupported`), fallback `createPredefined(EFFECT_TICK)`.
- Uzasadnienie zakazu haptyki ciągłej: wibracja w dłoni podczas fonacji maskuje własne czucie kinestetyczne krtani, czyli **niszczy kanał, którego uczymy**. Plus bateria.

### 5.10 Renderowanie 60 fps

**Web — dwie warstwy, bez WebGL:**

| Warstwa | Technika | Budżet |
|---|---|---|
| statyczna: siatka, klawiatura, wstęga celu | `OffscreenCanvas` w Workerze przez `transferControlToOffscreen`, przerysowanie tylko przy zmianie viewportu | — |
| dynamiczna: kontur, głowa, punkt błędu | Canvas 2D na wątku głównym | ≤ 3 ms/klatkę |

Ring buffer 4096 zdarzeń, drenowany RAZ na rAF. Zero `setState` per klatka (obecny kod kopiuje całą historię pitchu 60×/s — O(n²) alokacji plus setState globalnego kontekstu w każdej klatce).

Dlaczego nie WebGL: warstwa dynamiczna to polilinia ≤1200 punktów i ~40 prostokątów — kilkaset mikrosekund w Canvas 2D. WebGL dokłada obsługę utraty kontekstu i pipeline shaderów za zerowy zysk. WebGL uzasadnia się dopiero w edytorze multitrack przy >20 ścieżkach waveformu.

Osobno: canvas waveformu MUSI być kafelkowany. Obecny kod przekracza maksymalny rozmiar canvasu przeglądarki już przy klipie 5,5-minutowym.

**iOS:**

| Warstwa | Technika |
|---|---|
| przewijany kontur | `MTKView` w `UIViewRepresentable`, `preferredFramesPerSecond = 60`; triangle strip dla grubej linii, instancing dla prostokątów celu |
| zegar | `CAMetalDisplayLink` (iOS 17+) → dokładny `targetPresentationTimestamp` |
| error lane, miernik trzymania, nakładki | SwiftUI `Canvas` (CoreGraphics) — wystarcza, bo nie przewija |

`CAMetalDisplayLink` jest tu istotny nie z powodu wydajności, a z powodu **poprawności**: daje czas prezentacji klatki, więc głowę interpolujemy do rzeczywistego „teraz", a nie do ostatniego callbacku audio.

**Android:**

| Warstwa | Technika |
|---|---|
| wszystko poza multitrackiem | Compose `Canvas` (Skia), `Modifier.drawWithCache` żeby nie alokować `Path` per klatka |
| zegar | `Choreographer.FrameCallback` → `frameTimeNanos` |
| multitrack waveform | `AndroidView` z `GLSurfaceView` |

Skia na Androidzie z akceleracją sprzętową obsługuje ścieżkę 1200-punktową + 40 prostokątów przy 60 fps komfortowo.

**Reguła wspólna dla trzech platform: zegarem rysowania jest zegar AUDIO.** Każde zdarzenie F0 niesie znacznik czasu audio (`AudioContext.currentTime` / `AVAudioTime` / licznik próbek `AudioRecord`). Renderer interpoluje pozycję głowy do `now` z callbacku klatki. Rysowanie po akumulowanej delcie rAF zawsze dryfuje i to jest ta sama klasa błędu co „automatyka sterowana requestAnimationFrame zamiast harmonogramem AudioParam".

---

## 6. GRA I MOTYWACJA

### 6.1 Dlaczego obecna gra działa (diagnoza przed rozbudową)

Pętla w `use-hit-the-note-game.ts`:

```
usłysz referencję → wyprodukuj → zobacz KIERUNEK błędu (sharp/flat/perfect)
                  → trzymaj → miernik się wypełnia → nagroda
```

To jest zamknięta pętla uczenia motorycznego z sygnałem **knowledge of performance** (kierunek błędu), nie tylko knowledge of results (trafiłeś/nie). Miernik trzymania przekształca ciągłą umiejętność w dyskretne, wygrywalne zdarzenie. To jest dokładnie właściwa konstrukcja i **niczego w niej nie zmieniamy poza jednostką czasu** (ramki → sekundy).

Do zachowania także: histereza z asymetryczną karą (−1 lekkie odchylenie, −5 przy >100 centów) i wzorzec antysprzężeniowy z gry akordowej (wyciszenie nasłuchu na czas referencji + zerowanie progresu).

### 6.2 Drabina trudności — struktura muzyczna, nie zacieśnianie tolerancji

| Poziom | Zadanie | Co realnie trenuje |
|---|---|---|
| L1 | unison z brzmiącą referencją, trzymaj 1,5 s, ±50 ¢, dowolna oktawa | odruch dopasowania |
| L2 | to samo, ścisła oktawa | świadomość rejestru |
| L3 | **referencja milknie przed śpiewem** | ← TU jest prawdziwy skok: pamięć wysokości zamiast odruchu |
| L4 | interwał od podanego prymu (2 → 5 → 3 → 7 → tryton, kolejność wg ZMIERZONEJ trudności) | słuch interwałowy |
| L5 | pryma brzmi, milknie, „zaśpiewaj sekstę wielką" | interwał z pamięci |
| L6 | sekwencja 3–5 nut | krótka pamięć melodyczna |
| L7 | interwał przeciw DRONOWI na innej nucie | kontekst harmoniczny — dużo trudniejsze |
| L8 | „zaśpiewaj F4" bez referencji | odniesienie długoterminowe (tylko dla użytkowników z udokumentowaną stabilnością) |

**Tolerancja NIE jest suwakiem trudności.** `tol = max(25 ¢, 1,5 × MAD tego użytkownika w tym rejestrze)`. Zacieśnianie poniżej ~20 centów mierzy szum estymatora, nie śpiew: eksperci oceniają interwały odchylone o 20–25 centów jako „w stroju", nietrenowani wykrywają rozstrojenie dopiero ok. 65 centów, a zawodowcy sami dryfują średnio ~30 centów. Poziom „10 centów" nie jest trudniejszy — jest fałszywy.

### 6.3 Dobór następnego elementu — bandyta, nie playlist

Stan mistrzostwa per komórka `(interwał × rejestr × kierunek)`, posterior Beta(α, β) aktualizowany po każdej próbie. Następny element = maksymalizacja informacji przy docelowym pasmie sukcesu **75–85%**.

- < 60% sukcesu → zniechęcenie, użytkownik odchodzi
- > 90% → to nie jest trening, to potwierdzanie

To jest jedyna rzecz, która czyni z gry trenera. Globalny „poziom użytkownika" nie ma jak wiedzieć, że ktoś świetnie robi kwinty w górę i sypie się na opadających tercjach małych.

### 6.4 Co jest poparte dowodami, a co jest cargo cultem

| Twierdzenie | Status |
|---|---|
| Praktyka **przeplatana** (interleaved) bije blokową na retencji | Solidne — interferencja kontekstowa jest wynikiem z uczenia motorycznego. **Wdrażamy: przeplataj interwały, nie dryluj jednego 20×.** |
| Feedback **terminalny** bije równoczesny na retencji | Solidne (hipoteza wskazówki). **Wdrażamy: pełna diagnoza po ujęciu.** |
| Feedback wizualny o wysokości poprawia celność intonacji | Solidne (Welch i wsp.) — to fundament produktu |
| **Spacing effect** przenosi się na umiejętności percepcyjno-motoryczne | **Słabe.** Efekt odstępów jest dobrze udokumentowany dla pamięci deklaratywnej; poza nią dowody są cienkie, a „rozszerzające się odstępy" wypadają w metaanalizach nie lepiej niż równomierne. **Nie sprzedawać SRS-dla-śpiewu jako nauki.** Rozkładamy sesje w czasie, bo to zdrowe dla głosu, nie bo tak mówi krzywa zapominania. |
| Nagrody zewnętrzne podkopują motywację wewnętrzną | Warunkowo, i warunki są tu spełnione: podkopują głównie gdy są **oczekiwane, materialne i powiązane z wykonaniem** zadania, które samo z siebie jest interesujące. NIE podkopują, gdy **sygnalizują kompetencję**. |

**Konsekwencja praktyczna ostatniego wiersza:** celebracja musi mówić CO było dobre — „C4 utrzymane w 8 centach przez 1,5 s" — a nie ile punktów. To jest jednozdaniowa zmiana copy, która przełącza nagrodę z kontrolującej na informacyjną.

### 6.5 Streak — zmiana z dziennego na tygodniowy

- Cel **tygodniowy** (domyślnie 4 sesje/tydzień), nie dzienny.
- 2 automatyczne dni odpoczynku na miesiąc, wliczone, bez „zamrażania" jako nagrody.
- Licznik ciągłości neutralny: „12 tygodni z rzędu", nigdy „stracisz 47 dni!".
- Zero waluty, zero gemów, zero tabel liderów wobec obcych.

**Uzasadnienie jest domenowe, nie estetyczne:** głos to mięsień wymagający regeneracji. Dzienny streak z framingiem straty popycha początkującego do śpiewania na zmęczonym aparacie — to antypedagogika wpisana w mechanikę, i w tej kategorii jest to realna szkoda, nie tylko zła praktyka UX.

### 6.6 Postęp długoterminowy — wykresy, które mierzą GŁOS

| Wykres | Dlaczego ma sens |
|---|---|
| **Tessitura** (dolny/górny percentyl komfortu) w tygodniach | To jest fizyczna zmiana w instrumencie; rośnie realnie i widocznie |
| **Rozrzut (MAD centów) per rejestr** malejący | Bezpośrednia miara kontroli intonacji, odporna na outliery |
| **Czas ataku do ±25 ¢** malejący | Mierzy odruch, nie wiedzę — rośnie szybko i motywuje |
| **Vibrato pod kontrolą świadomą** (obecne gdy chcesz, nieobecne gdy nie chcesz) | Wskaźnik techniki, nie stabilności |
| **Mapa mistrzostwa** interwałów (heatmapa z SkillState) | Pokazuje, gdzie iść dalej |

Odrzucone jako cargo cult: XP, monety, całkowite minuty, „accuracy %" jako jedna liczba, odznaki za logowanie, prognozy typu „słuch absolutny w 30 dni".

**Twarda reguła:** ujęcia z `lowConfidence = true` (zły SNR, wykryte AGC, brak kalibracji) są **wykluczone z dopasowania trendu** i oznaczone na wykresie. Bez tego zaszumiona sesja produkuje komunikat „pogorszyłeś się" i to jest największe źródło utraty zaufania w tej klasie aplikacji.

---

## 7. ONBOARDING I KALIBRACJA

**Zasada projektowa: kalibracja musi być czynnością muzyczną, nie formularzem.** Każdy pomiar jest wyciągany z czegoś, co użytkownik i tak zamierzał zrobić. Cel: użyteczne w 45 s, w pełni skalibrowane w 3 min, nigdy blokujące.

| Krok | Czas | Co widzi użytkownik | Co mierzymy |
|---|---|---|---|
| **0** | 0 s | Jeden ekran: „Zaśpiewaj ze mną" + duży przycisk. Bez konta, bez pytań. | — |
| **1** | 5 s | Prompt o mikrofon | — |
| **2** | 2 s | Tekst następnej instrukcji (użytkownik czyta) | **Dno szumu**: 200 ramek RMS (okno 20 ms / hop 10 ms), N = mediana dBFS + widmo 8-pasmowe. Odrzuć i powtórz, jeśli p90 − mediana > 10 dB. **Detekcja AGC**: czy dno rośnie przez 1,5 s + porównanie `getSettings()` z żądanymi constraints. |
| **3** | 3 s | „Sprawdzam opóźnienie" — 3 kliki | **Latencja round-trip**: korelacja krzyżowa, per (device, route). Bez słuchawek też mierzymy (RT głośnik→mikrofon jest tym, czego potrzebuje karaoke) i zapisujemy jako osobny rekord. |
| **4** | 60–90 s | Rozgrzewka: syrena w dół, syrena w górę na /a/, potem 5-nutowy wzór opadający od 4 wysokości | **Zakres**: 5. i 95. percentyl tonów trzymanych ≥400 ms, clarity >0,8, SD <50 ¢. **Tessitura**: rejestr o najniższym rozrzucie i najdłuższym podtrzymaniu. |
| **5** | 30 s | Hit the Note na 3 nutach ustawionych w zmierzonej tessiturze — **gwarantowana wygrana** | pierwszy SkillState |
| **6** | — | *Teraz* (i nie wcześniej) propozycja konta | — |

### 7.1 Dlaczego tessitura, a nie zakres

Klasyfikacja głosu opiera się przede wszystkim na **tessiturze** (gdzie głos jest najwygodniejszy) i barwie, a nie na zakresie. Zakres wyznaczony z pojedynczych skrajnych próbek jest zresztą technicznie kruchy — jeden błąd oktawowy rozjeżdża go na stałe (potwierdzona usterka w `use-vocal-range.ts`). Dlatego: percentyle, nie ekstrema; tessitura jako liczba główna; typ głosu jako podpowiedź, **nigdy jako tożsamość** („wygląda na baryton" ≠ „jesteś barytonem").

### 7.2 Czego w onboardingu NIE MA

- Kwizu „jaki masz typ głosu?" — typ jest derywatem pomiaru
- Pytania „dlaczego tu jesteś" / wyboru gatunku
- Konta (Apple: jeśli aplikacja nie ma istotnych funkcji kontowych, pozwól używać bez logowania)
- Prośby o powiadomienia — dopiero dzień 3, po dostarczeniu wartości, i **nigdy jako warunek dostępu do treści** (Apple 5.1.2(i) zakazuje wymagania włączenia powiadomień dla dostępu do funkcji)
- Ekranu wyboru „tryb detekcji Pro/Basic" — to jest dziś w ustawieniach i jest to pytanie, na które użytkownik nie ma prawa znać odpowiedzi

### 7.3 Rekalibracja — cicha, bez kreatora

Wyzwalacze: zmiana trasy audio, zmiana urządzenia, dryf dna szumu > 6 dB, upływ 30 dni, zmiana zmierzonego rozrzutu > 2× (może być zły dzień, może być zimny głos, może być zepsuty detektor — flagujemy, nie orzekamy).

---

## 8. PRYWATNOŚĆ

### 8.1 Trzy fakty, które rozstrzygają architekturę

**(1) RODO art. 9 nie obejmuje tego, co robimy.** Art. 9(1) mówi o „biometric data **for the purpose of uniquely identifying a natural person**". Analiza wysokości dźwięku nikogo nie identyfikuje. Głos jest tu daną osobową (art. 4(1)), ale **nie daną szczególnej kategorii** — pod warunkiem, że nigdy nie budujemy voiceprintu ani rozpoznawania mówcy. To jest ograniczenie projektowe do zapisania i honorowania, nie do zapomnienia.

**(2) AI Act art. 5(1)(f), obowiązuje od 2 lutego 2025:** zakazane jest wprowadzanie do obrotu i używanie systemów AI wnioskujących o emocjach osoby fizycznej w obszarze **miejsca pracy i instytucji edukacyjnych**, z wyjątkiem powodów medycznych lub bezpieczeństwa. Aplikacja do nauki śpiewu celuje w „instytucje edukacyjne" z definicji. **Werdykt: zero analizy emocji. Nigdy. Także nie jako „ocena pewności głosu" dla podcasterów.**

**(3) Oba sklepy zwalniają przetwarzanie na urządzeniu z deklaracji:**
- Apple: *„Data that is processed only on device is not 'collected' and does not need to be disclosed in your answers. If you derive anything from that data and send it off device, the resulting data should be considered separately."*
- Google: *„Data processed only ephemerally or only locally on-device does NOT need disclosure."*

### 8.2 Werdykt architektoniczny

**Wszystko na urządzeniu, domyślnie i bezwarunkowo. Chmura wyłącznie jako jawna akcja per-ujęcie.**

To nie jest uprzejmość — to dźwignia produktowa. Skutek: etykieta App Privacy praktycznie pusta, formularz Data Safety mówiący „no data collected", zero potrzeby App Tracking Transparency. W kategorii, w której użytkownik wpuszcza aplikację do własnego głosu, to jest przewaga marketingowa i jednocześnie usunięcie całej klasy pracy compliance.

Zwróć uwagę na drugie zdanie cytatu Apple: **kontur F0 wyprowadzony z głosu i wysłany dalej jest osobną daną do zadeklarowania.** Więc nawet „telemetria konturów na potrzeby ulepszania modelu" wywraca cały układ. Nie robimy tego.

### 8.3 Konkretna lista zobowiązań

**Apple:**

| Wymóg | Realizacja |
|---|---|
| 5.1.1(ii) purpose strings „clearly and completely describe your use" | `NSMicrophoneUsageDescription`: „Vocal Coach słucha Twojego głosu, żeby pokazać wysokość dźwięku i ocenić intonację. Analiza działa na urządzeniu; nagrania zostają na urządzeniu, dopóki sam ich nie wyeksportujesz." |
| **2.5.14** — jawna zgoda + wyraźne wskazanie wizualne/dźwiękowe przy nagrywaniu | Własny trwały wskaźnik nagrywania (systemowa oranżowa kropka NIE wystarcza), plus akcesorium tab bara z licznikiem |
| 5.1.1(v) usuwanie konta w aplikacji, jeśli jest zakładanie konta | Wysyłamy w TYM SAMYM release co rejestrację, nie później |
| 5.1.1(iii) minimalizacja danych | Tylko mikrofon. Zero kontaktów, zero lokalizacji, zero zdjęć bez picker-a |
| 5.1.1(iv) „provide alternative solutions for users who don't grant consent" | Tryb przeglądania: biblioteka, analiza, odtwarzanie, edytor działają bez mikrofonu |
| Etykieta App Privacy | `Usage Data → Product Interaction` + `Diagnostics` (nie powiązane z tożsamością, nie do trackingu). `User Content → Audio Data` **tylko jeśli** włączono funkcję chmurową. **Nigdy `Sensitive Info → biometric data`** — i pilnujemy, żeby nigdy jej nie zasłużyć |
| 3.1.1 + 3.1.2(a) IAP; „subscription must work across all of the user's devices" | Subskrypcja kupiona na iOS musi odblokować web. To wymusza usługę uprawnień w dniu monetyzacji — model konta trzeba zaprojektować teraz, choćby nie budować |
| 4.2 minimum functionality | Nie jesteśmy przepakowaną stroną — capture w tle, haptyka, Metal, offline. To jest wprost argument za natywnym |

**Google Play:**

| Wymóg | Realizacja |
|---|---|
| Data Safety | „No data collected" dopóki wszystko jest on-device. Jeśli włączymy chmurę: `Audio files → Voice or sound recordings`, szyfrowanie w tranzycie (TLS), mechanizm żądania usunięcia |
| Mechanizm usuwania | Deklarujemy przez „automatycznie usuwamy/anonimizujemy w ciągu 90 dni" dla telemetrii + żądanie usunięcia dla konta |
| FGS microphone | `FOREGROUND_SERVICE_MICROPHONE` + `FOREGROUND_SERVICE`, `android:foregroundServiceType="microphone"`, deklaracja w Play Console → Policy → App content |
| Target audience | **13+ w v1**, świadomie: bez grafiki i słownictwa przyciągającego dzieci. Families wymaga neutralnego ekranu wieku, zakazu transmisji AAID, wyłącznie reklam nieprofilowanych z SDK self-certified Families — to dwie równoległe ścieżki danych, decyzja na później i celowa |

**RODO — mechanika, którą wdrażamy nawet przy on-device:**
- „Eksportuj wszystkie moje dane" → ZIP: JSON (metadane, profile, oceny) + WAV-y. Ok. 2 h pracy.
- „Usuń wszystko" → jedno potwierdzenie, kasuje bazę + pliki + profil.
- Polityka prywatności z retencją i sposobem wycofania zgody (Apple 5.1.1(i) wymaga opisania retencji i usuwania).
- Retencja telemetrii: 90 dni. Ujęcia: nigdy automatycznie — to jest praca użytkownika.
- **Jeden system analityki.** Dziś są dwa, jeden nieczynny. Bez IDFA, bez ATT.

**Licencje jako reguła twarda (przy okazji prywatności):** do produktu wchodzą wyłącznie modele z MIT/Apache-2.0/BSD **na kodzie I na wagach**, z udokumentowanym pochodzeniem danych treningowych. To dotyczy prywatności bezpośrednio: model zdolny do rozpoznawania mówcy w kodzie to jedyna droga, którą ten produkt mógłby wejść pod art. 9.

---

## 9. STANY BRZEGOWE — KATALOG

| # | Stan | Detekcja | Zachowanie | Czego NIGDY |
|---|---|---|---|---|
| 1 | Brak mikrofonu sprzętowego | `enumerateDevices()` bez audioinput / `AVAudioSession.availableInputs` puste / `AudioManager` bez wejścia | Tryb przeglądania: biblioteka, analiza, odtwarzanie, edytor, eksport działają. Przyciski capture z powodem inline | pustego ekranu; pętli promptów uprawnień |
| 2 | Odmowa uprawnień | Rozróżniaj: `NotAllowedError` (odmowa) / `NotFoundError` (brak sprzętu) / `NotReadableError` (zajęte) / `SecurityError` (niebezpieczny kontekst) | Copy per przyczyna + dokładna ścieżka naprawy. iOS: Ustawienia → Vocal Coach → Mikrofon. Android: deep link `ACTION_APPLICATION_DETAILS_SETTINGS`. Safari: po odmowie promptu nie da się pokazać programowo — powiedz to | fałszywej diagnozy „sprawdź uprawnienia", gdy przyczyna jest inna (potwierdzona usterka na Safari/iOS w karaoke) |
| 3 | Uprawnienie jest, ale ścieżka milczy | `track.muted === true` albo RMS < dno+3 dB przez 3 s przy `readyState === 'live'` | Baner „nie słyszę Cię" **z miernikiem poziomu**, żeby użytkownik widział, że to wejście, nie on | ocenienia cichego ujęcia jako 0% celności |
| 4 | Za głośno w tle | dno > −40 dBFS albo SNR podczas fonacji < 12 dB | Nie blokuj. Degradacja: poszerz progi voicingu, wyłącz metryki głośności absolutnej, ustaw `lowConfidence: true`, pokaż flagę na analizie, **wyklucz z dopasowania trendu** | cichego wmieszania ujęcia low-confidence do wykresu postępu — to jest główne źródło „aplikacja mówi, że się pogorszyłem" |
| 5 | Cisza / użytkownik nie śpiewa | voiced ratio < 10% przez 10 s | **Zatrzymaj zegar ćwiczenia** (sing-along już to robi i to jest dobry pomysł do generalizacji), nie przesuwaj celu, nie odejmuj życia, zaproponuj diagnostykę | odliczania czasu ćwiczenia, którego nie ma |
| 6 | Słuchawki podłączone | web: `mediaDevices.ondevicechange`; iOS: `routeChangeNotification` z `.newDeviceAvailable`; Android: `AudioDeviceCallback.onAudioDevicesAdded` | To **zmiana trybu**, nie zdarzenie: włącz dron, włącz monitoring, przełącz na kalibrację słuchawkową, dopuść scoring karaoke | traktowania tego jako toast |
| 7 | Słuchawki wypięte W TRAKCIE ujęcia | iOS: `routeChangeNotification` reason `.oldDeviceUnavailable` | **Natychmiast wycisz monitoring**, nagrywaj dalej, wyłącz dron, oznacz resztę ujęcia jako `route: SPEAKER` z innym offsetem, niemodalny komunikat | utrzymania monitoringu do głośnika (natychmiastowe sprzężenie); zatrzymania ujęcia — utrata materiału jest gorsza niż zmiana trasy |
| 8 | Bluetooth | sampleRate ≠ 48 kHz lub typ trasy BT-HFP; +100–300 ms latencji | **Odmów BT do monitoringu podczas ćwiczenia** z wyjaśnieniem („opóźnienie Bluetooth uniemożliwia śpiewanie do podkładu"). Dopuść BT do odsłuchu. iOS: nie żądaj `.allowBluetooth` gdy nie potrzebujesz mikrofonu BT; używaj `.allowBluetoothA2DP` na wyjście | milczącego zbicia sampleRate do 16 kHz i pomiaru intonacji przez HFP |
| 9 | Telefon dzwoni / Siri / alarm | iOS: `AVAudioSession.interruptionNotification` type `.began` → system deaktywuje sesję i **zatrzymuje engine**; na `.ended` sprawdź `options.contains(.shouldResume)`. Android: `AUDIOFOCUS_LOSS_TRANSIENT`. Web: iOS Safari ma niestandardowy `AudioContext.state === 'interrupted'` | **Flush ujęcia na dysk natychmiast na `.began`**, marker przerwania w ujęciu, po powrocie pytanie „kontynuować to ujęcie?" | trzymania niezflushowanego ujęcia w RAM; **automatycznego wznowienia** — tak się nagrywa czyjąś prywatną rozmowę; kodu obsługującego tylko `'suspended'` (zostawia martwy graf audio) |
| 10 | Aplikacja w tle | web: `visibilitychange` → hidden | **Web: twardy sufit.** Zakończ ujęcie czysto, flush, powiedz DLACZEGO. **Native: to jest cały powód istnienia natywnego** — iOS `UIBackgroundModes: audio`; Android FGS `microphone` z powiadomieniem (czas + Stop) | udawania na webie, że nagrywanie trwało |
| 11 | Brak miejsca / quota | `navigator.storage.estimate()` **przed** ujęciem | Preflight: odmów startu, jeśli wolne < 3× oczekiwany rozmiar (f32 48k mono = 11,5 MB/min; 40 min = 460 MB). Wywołaj `navigator.storage.persist()` — bez tego storage niezainstalowanego PWA może zostać usunięty po 7 dniach bezczynności | utraty ujęcia w 38. minucie; **jakiejkolwiek tablicy w localStorage** |
| 12 | Zabicie karty/aplikacji w trakcie | brak czystego zamknięcia w metadanych | Zapis w chunkach (nagłówek WAV łatany przy finalizacji albo ramki FLAC). Przy starcie: „znaleziono niedokończone ujęcie z 14:32 (12 min) — odzyskać?" | ujęcia trzymanego w pamięci do końca |
| 13 | Dryf zegara na długim ujęciu | `AudioContext.currentTime` / licznik próbek vs zegar ścienny | Dryf > 20 ms na ujęcie → oznacz i zaproponuj resync w edytorze | ignorowania — istotne dla 40-min podcastu, nieistotne dla 10-s drylu |
| 14 | Dwie karty / instancje na mikrofonie | `BroadcastChannel` jako lock | Druga karta: „sesja jest już otwarta w innej karcie" + przycisk przejścia | dwóch strumieni walczących o urządzenie |
| 15 | Niepewność detektora | confidence per ramka poniżej progu | **Nie rysuj nic** i **przerwij polilinię** | interpolacji przez ramki bezdźwięczne — tworzy fantomowe glissanda, które użytkownik czyta jako własny błąd |
| 16 | AGC wykryte mimo constraints | `getSettings()` ≠ żądane, albo dno szumu pompuje | Oznacz `lowConfidence`, wyłącz metryki dynamiki, pokaż na `/glos` jako fakt o urządzeniu | udawania, że constraints zadziałały (Safari i część Androidów je ignorują) |

**Reguła wspólna dla całego katalogu: każdy stan brzegowy prowadzi do `/glos` (profil audio) z konkretną liczbą, nie do toastu.** Toast znika i nie da się do niego wrócić; ekran z „dno szumu −38 dBFS, latencja 142 ms, AGC wykryte" jest diagnozą, którą użytkownik może pokazać komuś innemu.

---

## 10. SPÓJNA WIZJA — jedna strona

**Czym to jest:** jeden przyrząd pomiarowy z czterema trybami użycia nad jednym prymitywem danych. Użytkownik nie przełącza się między aplikacjami — przełącza się między czasownikami nad tym samym ujęciem.

**Dlaczego wygrywa:** bo w tej kategorii wszyscy zbudowali gry, a nikt nie zbudował przyrządu. Konkurencja mierzy odległość do siatki temperacji równej, karze za intonację naturalną, karze za vibrato i portamento, myli oktawy, i podaje jedną liczbę bez rozbicia. My mierzymy odległość do najbliższego **dopuszczalnego** celu, rozkładamy błąd na transpozycję i fałsz, wykrywamy vibrato jako umiejętność, dekodujemy oktawę globalnie zamiast lokalnie, i pokazujemy cztery liczby, z których każda ma inne ćwiczenie naprawcze. Trafianie w nuty pozostaje zabawą — ale jest teraz zabawą, której werdykt jest prawdziwy.

**Dlaczego to jest natywne:** nagrywanie w tle i przy zablokowanym ekranie (web nie ma tego i nie będzie miał), haptyka jako trzeci kanał feedbacku, sesja audio odporna na przerwania, Metal/Skia dla warstwy przewijanej z dokładnym czasem prezentacji, i lokalna baza, której nikt nie usunie po 7 dniach. Web zostaje jako pełnoprawna trzecia platforma dla montażu i analizy, gdzie mysz i 1440 px wygrywają z telefonem.

**Dlaczego on-device jest strategią, nie skrupułem:** bo pozwala powiedzieć „Twój głos nie opuszcza tego urządzenia" i mieć to udokumentowane w etykiecie sklepu, a nie w polityce prywatności, której nikt nie czyta. W kategorii „wpuść mikrofon do swojego domu i śpiewaj" to jest najmocniejszy argument sprzedażowy, jaki istnieje — i dostajemy go za darmo, bo cały DSP i tak musi być lokalny z powodów latencji.

**Kolejność, w której to się buduje** (kolejność jakości, nie kosztu): prawda pomiaru → integralność ujęcia → eksport → cztery liczby na ekranie OCEŃ → progresja gry oparta na SkillState → montaż multitrack → profil MOWA.


### Zależności

- Rdzeń DSP jako biblioteka przenośna (Rust/C++) z interfejsem PitchDetector: analyze(Float32Array pcm, sampleRate) -> {t, f0Hz, confidence, voiced}[]. Bez tego 'iOS pojutrze' oznacza przepisanie detektora w Swift, a wtedy trzy platformy dają trzy różne werdykty na tym samym nagraniu i nie da się nawet powiedzieć, która jest poprawna.
- Harness ewaluacyjny F0 uruchamialny bez przeglądarki (Node/cargo test) z metrykami RPA/RCA/GPE/VFA i progami regresji w CI. Bez tego nie ma sposobu stwierdzić, czy jakakolwiek zmiana detektora poprawiła cokolwiek — a ekran OCEŃ, gra i wykresy postępu wszystkie stoją na jednym pomiarze.
- Korpus referencyjny z ground truth: syntetyk z wstrzykniętym ZNANYM odchyleniem (sinusy 82,41/220/440/1046,5 Hz, vibrato 5/6/7 Hz przy ±50 i ±200 centów, glissanda) plus 20-30 realnych nagrań w 6 kategoriach warunków. To jest jednocześnie test i specyfikacja modułu referencji adaptacyjnej.
- Jedna schema SQLite z UUIDv7, updated_at, deleted_at, device_id, schema_version w każdej tabeli — na webie SQLite Wasm na OPFS, natywnie ten sam plik. Bez tego żadne przejście między czasownikami nie jest tanie i wracamy do base64 w localStorage.
- AudioWorklet jako cienki adapter nad rdzeniem + SPSC ring buffer 4096 zdarzeń drenowany raz na rAF. Wszystkie ekrany wizualizacji zależą od tego, że zdarzenia F0 mają znaczniki czasu audio i że nie ma setState per klatka.
- Kalibracja latencji round-trip per (device, route) — warunek konieczny dla karaoke, sing-alongu, oceny timingu i monitoringu. Bez niej metryka timingu mierzy sprzęt użytkownika, nie jego śpiew.
- Warstwa capture jako serwis o cyklu życia niezależnym od widoku (iOS: obiekt trzymający AVAudioSession; Android: FGS; web: kontekst poza drzewem routera). Warunek dla stanów brzegowych 7, 9, 10 i dla naprawy 'Karaoke i Studio nie sprzątają przy odmontowaniu'.
- Biblioteka treści: ćwiczenia jako dane JSON (nie stałe w module syntezy) z transpozycją do tessitury, plus co najmniej 20 melodii do sing-alongu. Dziś lista utworów to pusta tablica przy plikach MIDI leżących w /public — cały filar SING jest pusty.
- Ścieżka eksportu w silniku multitrack (OfflineAudioContext / render offline w rdzeniu) uwzględniająca klipy, EQ, automatykę i master. Czasownik ZMONTUJ nie istnieje bez niej.
- Model uprawnień/entitlement zaprojektowany (nie zbudowany) przed pierwszą monetyzacją, bo Apple 3.1.2(a) wymaga, by subskrypcja działała na wszystkich urządzeniach użytkownika — czyli zakup na iOS musi odblokować web.

### Ryzyka

- Zaufanie do werdyktu jest binarne i nieodwracalne. Użytkownik, który raz zobaczył 'jesteś o oktawę nisko' śpiewając poprawnie, nie odrzuca tego jednego odczytu — odrzuca wszystkie, bo nie ma sposobu odróżnić prawdziwych od fałszywych. Obecny kod ma systematyczny błąd oktawowy dla każdej nuty powyżej E4, więc każdy użytkownik śpiewający wyżej niż E4 już tego doświadczył.
- Referencja adaptacyjna zbyt szybka = 'auto-tune referencji'. Jeśli offset tonacji O(t) goni śpiewaka (tau < 2 s, slew > 15 centów/s, brak zamrożenia przy wysokiej dyspersji), cały fałsz zostanie wchłonięty w offset i użytkownik dostanie wynik 95% śpiewając chaotycznie. To jest najczęstszy błąd tej klasy systemów i jest niewidoczny w testach na czystych sygnałach.
- Cztery liczby zamiast jednej mogą przytłoczyć początkującego. Ryzyko jest realne i nie znosi go argument 'ale są poprawne'. Mitygacja: jedna liczba główna wybierana przez system jako 'to jest teraz Twój wąski gardło' + trzy pozostałe rozwijalne — ale to trzeba zaprojektować i zmierzyć, bo można stracić czytelność w drugą stronę.
- Interleaving pogarsza wyniki W SESJI, poprawiając retencję. Użytkownik odczuje przeplatanie interwałów jako 'gorzej mi idzie' i może odejść przed pojawieniem się korzyści. To jest udokumentowany paradoks interferencji kontekstowej i wymaga jawnego komunikatu w UI ('mieszamy interwały, bo tak zostaje w głowie'), inaczej mechanika sabotuje retencję użytkownika ratując retencję umiejętności.
- Ujęcia low-confidence wykluczone z trendu tworzą asymetrię, którą użytkownik może wykryć: sesje w hałasie nie liczą się do postępu, więc ktoś, kto ćwiczy głównie w hałasie, widzi płaski wykres i wnioskuje, że się nie rozwija. Potrzebny jest osobny komunikat 'zmierzyliśmy 12 sesji, 4 były zbyt zaszumione' zamiast cichego pominięcia.
- Profil MOWA ciągnie produkt w stronę, w której nie ma wygranej. Edytor podcastów konkuruje z Audacity (darmowe), Descriptem (edycja przez tekst) i Auphonicem (jeden przycisk). Filar MOWA bez edycji przez transkrypcję ORAZ bez jednoprzyciskowego masteringu jest kolejnym edytorem fal, czyli produktem bez powodu istnienia. To nie jest argument przeciw MOWIE — to jest ostrzeżenie, że MOWA ma wyższy próg wejścia jakościowego niż SPIEW.
- Dron referencyjny wymuszający słuchawki wyklucza dużą część sesji mobilnych (nikt nie ma słuchawek pod ręką za każdym razem). Bez drona kanał słuchowy — najsilniejszy na telefonie — jest niedostępny, a ekran w kieszeni jest bezużyteczny. Wersja bez słuchawek jest strukturalnie słabszym produktem i trzeba świadomie zdecydować, czy budujemy dla niej osobny tryb.
- Zakaz analizy emocji z AI Act zamyka drogę do funkcji, których konkurencja będzie używać jako wyróżnika ('oceń pewność swojej prezentacji'). Ryzyko nie polega na tym, że nam czegoś zabrakuje, ale na tym, że presja rynkowa popchnie ku granicy, a granica jest zakazem, nie ryzykiem do wyceny.
- Model 13+ oznacza, że dzieci — naturalnie największa i najbardziej entuzjastyczna grupa dla gry w trafianie w nuty — są formalnie poza zakresem. Jeśli aplikacja mimo to je przyciągnie (a przyciągnie), rozbieżność między deklarowaną publicznością a rzeczywistą treścią jest wprost przedmiotem weryfikacji Google.
- Immutable Take + wersjonowana Analysis oznacza, że poprawa detektora zmienia historyczne wyniki użytkownika. Ktoś, kto miał 78% i po aktualizacji ma 64%, ma prawo czuć się oszukany. Potrzebna jest jawna komunikacja ('poprawiliśmy pomiar, przeliczyliśmy Twoje sesje') i możliwość zobaczenia obu wersji — inaczej najlepsza cecha architektury zamienia się w skargę.

### Do rozstrzygnięcia pomiarem

- Jaka jest realna latencja round-trip w rozkładzie na urządzeniach docelowych i jaki procent użytkowników przekracza 45 ms? To rozstrzyga, czy karaoke i monitoring są funkcjami głównymi, czy funkcjami zależnymi od sprzętu — i czy potrzebujemy odrębnego trybu 'bez monitoringu' jako pełnoprawnej ścieżki. Mierzalne tylko sekwencją kalibracyjną w produkcji na realnych urządzeniach.
- Ile realnie wynosi MAD centów u początkującego w jego tessiturze? Cała drabina trudności (tol = max(25, 1,5 × MAD) i pasmo sukcesu 75-85%) opiera się na tej liczbie. Jeśli typowe MAD to 15 centów, tolerancja bazowa 25 jest za luźna; jeśli 60 centów, poziomy L4+ są nieosiągalne dla większości. Mierzalne na 30 nagraniach onboardingowych.
- Czy usunięcie brzmiącej referencji (poziom L3) jest skokiem trudności, czy ścianą? Hipoteza jest, że to jest moment, w którym zaczyna się prawdziwa nauka; alternatywa jest, że to moment, w którym 70% użytkowników odpada. Mierzalne wyłącznie współczynnikiem przejścia L2→L3 w produkcji.
- Przy jakim progu confidence przestać rysować kontur? Za wysoko — linia miga i wygląda na zepsutą; za nisko — rysujemy zgadywanie, które użytkownik czyta jako swój błąd. Nie ma sposobu ustalić tego analitycznie; wymaga porównania rysowanej linii z ground truth na korpusie w hałasie.
- Czy cztery liczby na ekranie OCEŃ są czytelne dla użytkownika bez wykształcenia muzycznego, czy potrzebują jednej liczby-bramy? Mierzalne testem z 10 użytkownikami: pokaż ekran i poproś o zdanie 'co mam poprawić'. Jeśli więcej niż połowa nie umie odpowiedzieć, potrzebna jest warstwa nadrzędna.
- Czy tygodniowy cel z dniami odpoczynku utrzymuje ciągłość tak dobrze jak streak dzienny? Argument za tygodniowym jest domenowy (zdrowie głosu) i mocny, ale koszt w retencji jest nieznany. Mierzalne A/B na kohortach po 4 i po 12 tygodniach — i to jest jedyny wymiar, gdzie A/B jest tu uzasadniony.
- Jaki procent ujęć w realnym użyciu wypada jako lowConfidence? Jeśli to 40%, wykluczanie ich z trendu czyni wykresy postępu bezużytecznymi i potrzebna jest inna strategia (np. normalizacja wyniku względem zmierzonego SNR zamiast wykluczenia). Mierzalne od pierwszego dnia po wdrożeniu pomiaru dna szumu.
- Czy tessitura mierzona w onboardingu (90 s rozgrzewki) jest stabilna między dniami? Jeśli rozrzut między sesjami przekracza szerokość samej tessitury, to nie jest liczba, na której można oprzeć transpozycję ćwiczeń, i trzeba ją uśredniać przez tygodnie zamiast mierzyć raz.
- Czy Compose Canvas (Skia) faktycznie utrzymuje 60 fps na Androidzie średniej klasy przy polilinii 1200 punktów odświeżanej 187 razy na sekundę, czy trzeba GLSurfaceView także dla ekranu ćwiczenia? Rozstrzygalne wyłącznie profilowaniem na realnym urządzeniu z 2022-2023 roku.

### Adwersarz techniczny

**Nie zadziała tak, jak opisano:**

- **§10: 'Nie włączać wasm-threads/SharedArrayBuffer → brak COOP/COEP' + §1.1/§7.3: 'AudioWorklet → ring buffer → plik i24' i 'ring buffer 4 × 65 536 klatek'**

  Bez SharedArrayBuffer ring buffer między AudioWorkletem a Workerem trzymającym FileSystemSyncAccessHandle NIE ISTNIEJE. Jedyny kanał z AudioWorkletProcessor to jego `port`, a drugi koniec (`AudioWorkletNode.port`) żyje na MAIN THREADZIE. Czyli każdy blok audio 3 ścieżek przechodzi przez wątek Reacta zanim trafi na dysk. Przy rysowaniu waveformu 3 h, re-renderze albo GC main thread stoi, kolejka MessagePortu rośnie, RAM rośnie liniowo. To nie jest ring buffer, to kolejka komunikatów bez backpressure. Przy 432 kB/s przez 3 h to 4,7 GB, które musi przepłynąć przez wątek UI.

  → Albo (a) włączyć COOP/COEP + SAB i rozwiązać problem embedów inaczej (Safari nie ma `COEP: credentialless` — potwierdzone, BCD version_added:false — więc embedy trzeba przenieść na własny proxy albo iframe na osobnym originie), albo (b) utworzyć `new MessageChannel()`, przesłać `port2` DO procesora przez `node.port.postMessage(msg,[port2])`, a `port1` do Workera dyskowego. Wtedy kanał worklet→worker omija main thread i działa bez COOP/COEP. Wariant (b) musi być zapisany w spec jawnie, bo naiwna implementacja go nie zrobi.

- **§10: 'bindings-wasm/ wasm-bindgen' + 'AudioWorklet ← rdzeń WASM bez feature onnx'**

  Wygenerowany przez wasm-bindgen glue NIE URUCHOMI SIĘ w AudioWorklecie. `AudioWorkletGlobalScope` nie ma `TextEncoder` ani `TextDecoder` (używanych przez glue do każdego stringa), nie ma `fetch` ani `importScripts` (więc `init()` z URL-em .wasm nie zadziała). Issue rustwasm/wasm-bindgen#2367 jest OTWARTE od 2020 z cytatem: 'the major blocker is that TextEncoder and TextDecoder are not available within AudioWorklets'.

  → Osobny build rdzenia dla worklera: `wasm-bindgen --target no-modules`, wstrzyknięty polyfill TextEncoder/TextDecoder (FastestSmallestTextEncoderDecoder, MIT) na początku pliku procesora, `WebAssembly.Module` skompilowany na main threadzie i przekazany przez `node.port.postMessage(module)` + `WebAssembly.instantiate(module, imports)` w konstruktorze procesora. Alternatywnie: build worklerowy bez wasm-bindgen w ogóle — czysty `extern "C"` bez stringów, bo tor RT nie potrzebuje stringów.

- **§3.1 i §8: 'Parakeet w onnxruntime-web tylko jako opt-in na desktopie, model cache'owany w OPFS' przy jednoczesnym 'nie włączać SharedArrayBuffer'**

  Wielowątkowość onnxruntime-web wymaga cross-origin isolation. Dokumentacja ORT: 'only when the browser supports WebAssembly multi-threading and crossOriginIsolated mode is enabled, multi-threading will be enabled'. Bez COOP/COEP `env.wasm.numThreads` degraduje do 1. Enkoder FastConformer 600M int8 na JEDNYM wątku WASM to RTF rzędu jednostek (nie ułamków) — 3 h materiału to godziny liczenia. Ta ścieżka jest martwa z definicji, a spec ją wymienia jako realną opcję.

  → Skreślić onnxruntime-web CPU z opcji. Jeśli ma być cokolwiek on-device w przeglądarce, to tylko backend WebGPU ORT (nie wymaga SAB) — ale spec sam odrzucił WebGPU na iOS. Werdykt merytoryczny: w przeglądarce ASR jest wyłącznie serwerowy, a on-device należy do shelli natywnych. Zapisać to jako decyzję, nie jako 'opt-in'.

- **§7: 'SQLite Wasm na OPFS dla metadanych i command logu' przy braku COOP/COEP**

  Kanoniczny VFS `opfs` w sqlite-wasm WYMAGA SharedArrayBuffer i COOP/COEP (dokumentacja SQLite: 'JavaScript's SharedArrayBuffer type is required for the OPFS VFS, and that class is only available if the web server includes the so-called COOP and COEP response headers'). Zostaje `opfs-sahpool`, który ma dwa ograniczenia zabójcze dla tej architektury: 'does not support multiple simultaneous connections' oraz 'pre-allocates all potential file handles, immediately locking those files'. Czyli: jedna instancja bazy na cały origin (Worker audio i Worker ASR nie mogą obie mieć połączenia), brak drugiej zakładki, i pula plików zablokowana wyłącznie przez SAHPool — koegzystująca z Twoimi własnymi SyncAccessHandle na plikach i24.

  → Jeden dedykowany 'db-worker' jako JEDYNY właściciel połączenia SQLite; wszystkie inne Workery i main thread rozmawiają z nim przez MessagePort (RPC). Zapisać w spec, że command log NIE jest zapisywany bezpośrednio z Workera audio. Dodatkowo obsłużyć 'pause/unpause' VFS (sqlite 3.50+) na wypadek drugiej zakładki, albo jawnie zablokować drugą zakładkę tego samego projektu przez Web Locks API.

- **§5.2: 'presigned R2 multipart, części 5 MB (≈34 s audio i24)' oraz '1 555 200 000 B / 5 MB ≈ 312 części'**

  R2 odrzuci te części. Minimum to 5 MiB = 5 242 880 B, nie 5 MB = 5 000 000 B — dostaniesz EntityTooSmall na każdej części poza ostatnią. Do tego dwa warunki, których spec nie uwzględnia: 'All parts except the last must be the same size' (czyli po wznowieniu przerwanego uploadu NIE WOLNO zmienić rozmiaru części) oraz 'Incomplete multipart uploads are automatically aborted after 7 days by default' (przerwany upload gościa znika, a spec zakłada 'lokalny plik jest zawsze prawdą i można go dosłać po fakcie' — po 8 dniach nie można, trzeba zacząć od nowa). Poprawna liczba części: 1 555 200 000 / 5 242 880 = 297 na ścieżkę, 891 na odcinek.

  → Rozmiar części 8 MiB = 8 388 608 B (54,5 s audio i24, 186 części/3 h, zapas do limitu 10 000). Rozmiar części zapisać w metadanych sesji w D1 i NIGDY nie zmieniać przy wznowieniu. Lifecycle policy na buckecie 'tracks' wydłużyć abort do 30 dni. Ostatnia część jako jedyna może być mniejsza — zaokrąglić nagranie w górę i dopchać ciszą, żeby nie było części o rozmiarze innym niż nominalny w środku.

- **§7.4: 'twarda bramka navigator.storage.estimate() wymagająca 1,3 × przewidywanego rozmiaru wolnego miejsca'**

  Ta bramka na Safari nie mierzy tego, co spec zakłada — przepuści nagranie na pełnym telefonie. Po pierwsze: `StorageManager.estimate()` jest w Safari/iOS dopiero od wersji 17 (MDN BCD), a SyncAccessHandle od 15.2 — na iOS 16.x bramki fizycznie nie ma. Po drugie i ważniejsze: WebKit liczy kwotę od CAŁKOWITEGO rozmiaru dysku, nie od wolnego: 'each origin can store up to around 60% of total disk'. Na iPhonie 256 GB z 2 GB wolnego `estimate().quota` zwróci ~150 GB, bramka '1,3 × 4,666 GB = 6,07 GB' przejdzie, a zapis padnie QuotaExceededError w 40. minucie trzygodzinnego nagrania — czyli w najgorszym możliwym momencie. Ryzyko #7 ze spec jest niedoszacowane: to nie jest 'odcina część użytkowników', to jest 'przepuszcza i gubi materiał'.

  → Bramka musi być testem zapisu, nie zapytaniem o kwotę: przed startem nagrania utworzyć docelowe pliki i wywołać `handle.truncate(przewidywany_rozmiar)` dla każdej ścieżki (preallocation). Jeśli truncate rzuci QuotaExceededError — miejsca nie ma, koniec. Preallocation daje dodatkowo mniejszą fragmentację i stały offset seek. Do tego licznik zapisanych bajtów z twardym progiem ostrzegawczym co 10% i automatyczne przełączenie na FLAC-24 w locie po przekroczeniu 80% zadeklarowanej alokacji.

- **§7.4: 'OPFS z FileSystemSyncAccessHandle ... Safari i iOS 15.2+'**

  Na Safari 15.2–16.3 metody `getSize()`, `flush()`, `truncate()` i `close()` ZWRACAJĄ PROMISE, nie działają synchronicznie (MDN BCD notuje wersję synchroniczną dopiero od 16.4). Cały argument spec — 'tylko SyncAccessHandle daje synchroniczny random-access' — na tych wersjach nie zachodzi, a kod napisany pod API synchroniczne rzuci tam błędy typu 'undefined is not a number' przy `getSize()`. Realna podłoga to Safari/iOS 16.4, nie 15.2.

  → Zadeklarować minimum Safari/iOS 16.4 i sprawdzać w runtime: `typeof handle.getSize() === 'number'`. Poniżej — tryb tylko-do-odczytu / import, bez nagrywania długich sesji. Poprawić tabelę w §7.4.

- **§5.2 mechanizm (2): 'GCC-PHAT lokalnej ścieżki A vs referencyjny miks u B, okno 60 s, FFT 2^20 → ±1 próbka (±21 µs)' i mechanizm (3): 'regresja liniowa offset(t)'**

  Referencyjny miks zdalny to WYJŚCIE NetEq (jitter buffer WebRTC), który robi time-scale modification: accelerate, preemptive expand, PLC. NetEq NIELINIOWO wstawia i usuwa próbki w zależności od jittera sieci — to nie jest ta sama oś czasu, tylko oś czasu warpowana skokowo. Do tego Opus 32 kb/s nie jest liniowo-fazowy, a AEC jest adaptacyjny i nieliniowy. Konsekwencje: (a) 'offset(t) = a + b·t' jest fałszywym modelem — mierzysz sumę dryfu zegara i skoków NetEq, a resampling korygujący wyprostuje artefakty jitter buffera zamiast dryfu; (b) '±21 µs' to fizycznie 1 próbka przy 48 kHz, a sygnał referencyjny ma 16 kHz — jedna próbka referencji to 62,5 µs = 3 próbki @48 kHz przed interpolacją; (c) przy stracie pakietów PLC generuje syntetyczne próbki, które w GCC-PHAT są szumem dekorelującym. Twoje własne openQuestion #11 zadaje to pytanie — odpowiedź brzmi: nie, nie da deklarowanej dokładności, i model liniowy jest strukturalnie zły.

  → Nie mierz dryfu przez sieć. Mierz zegar urządzenia LOKALNIE, u każdego uczestnika, przeciw monotonicznemu zegarowi systemowemu: iOS — `AVAudioTime.hostTime` + `mach_timebase_info` przy każdym buforze wejściowym; Android — `AudioStream::getTimestamp()` (framePosition + nanoseconds, Oboe); web — `currentFrame`/`currentTime` w worklecie vs `performance.now()`. Regresja liniowa liczby zarejestrowanych klatek względem zegara monotonicznego daje realny rate urządzenia w ppm z dokładnością <0,5 ppm po 10 minutach, jest ciągła i całkowicie odporna na Opus, AEC, NetEq i utratę pakietów. Sieć (Cristian) służy TYLKO do zsynchronizowania zegarów monotonicznych, i to zgrubnie, bo dryf bierzesz z nachylenia, nie z offsetu. GCC-PHAT zostaw wyłącznie do JEDNORAZOWEGO wyznaczenia offsetu startowego, na oknie 5–10 s, z jawnym progiem jakości piku (peak-to-sidelobe ratio > 3) i fallbackiem na chirp, gdy pik jest rozmyty.

- **§5.2: 'Lokalny zapis (AudioWorklet → i24 48 kHz mono) — to jest materiał' jako mechanizm double-endera dostępny na webie**

  W przeglądarce nie masz dostępu do zegara mikrofonu. `MediaStreamAudioSourceNode` oddaje próbki JUŻ przeresamplowane do `AudioContext.sampleRate`, a przeglądarka sama kompensuje dryf urządzenia względem kontekstu (wstawiając/gubiąc próbki lub resamplując asynchronicznie). Spec Web Audio mówi o resamplingu wyjścia; dla wejścia z MediaStream nie definiuje nic, a implementacje robią właśnie ukrytą kompensację. Czyli 'lokalny zapis i24 48 kHz' na webie NIE jest zapisem zegara mikrofonu, tylko zapisem zegara AudioContextu z już nałożoną, niewidoczną korektą — i te wstawione/pominięte próbki są nieodwracalne. Mierzenie dryfu ±100 ppm na materiale, który przeglądarka już zdryfowała za Ciebie, nie ma sensu.

  → To jest twardy argument, że DOUBLE-ENDER JEST FUNKCJĄ NATYWNĄ, nie webową — i to zapisać wprost, obok istniejącego argumentu o nagrywaniu w tle. Na iOS `AVAudioEngine` z `installTap` na input node daje surowe bufory i hostTime; na Androidzie Oboe/AAudio daje framePosition. Web pozostaje trybem 'solo, krótka sesja, import i edycja'. Jeśli web ma być trybem gościa w double-enderze, to z jawnym komunikatem o ograniczonej precyzji synchronizacji i obowiązkową weryfikacją chirpem.

- **§6.3: 'Źródło kandydatów: luki w alignmencie ... Akcja: usuwalne automatycznie' przy celu 'precyzja ≥97%'**

  Luka w alignmencie powstaje w TRZECH sytuacjach, nie w jednej: (1) wypełniacz, (2) DELECJA ASR — Parakeet nie zwrócił realnie wypowiedzianego słowa, (3) błąd alignera. Przy WER 7% na czytanej mowie i realnie 15–25% na spontanicznym polskim podcaście delecje to kilka procent słów. Automat będzie regularnie kasował realnie wypowiedziane słowa — i to BEZ ŚLADU dla użytkownika, bo tego słowa nigdy nie było w transkrypcie, więc w widoku tekstowym nic nie zniknie. Użytkownik dowie się dopiero z odsłuchu. To jest gorsze niż problem, który funkcja rozwiązuje: 'yyy' jest irytujące, ucięte słowo jest błędem merytorycznym. Dodatkowo: kryterium 'F0 wykryty, clarity >0,6' spełnia każda samogłoska, czyli każde niezaalignowane słowo z sylabą otwartą.

  → Warunek konieczny przed automatycznym usunięciem: DRUGI PRZEBIEG ASR na wyizolowanym fragmencie luki z paddingiem 200 ms z każdej strony. Jeśli zwróci jakikolwiek token leksykalny — to jest delecja, nie wypełniacz; oznacz jako 'możliwe brakujące słowo' i NIE usuwaj. Dopiero pusty lub nieleksykalny wynik + kryteria akustyczne z §6.3 kwalifikuje do klasy A. Drugi warunek: monotoniczność formantów — wypełniacz ma stały F1/F2 (zmiana <10% przez ≥100 ms), a każde słowo ma tranzycje formantowe; to jest silniejszy dyskryminator niż stabilność centroidu. I nawet z tym: przy 27 000 słów precyzja 97% to ~kilkanaście błędnych cięć na odcinek, więc domyślnie klasa A też powinna być 'zaznaczone + jeden przycisk zastosuj', a nie cicha automatyka.

- **§10 + zależność #12: 'Golden-file testy DSP + CI — warunek, żeby port na Swift/Kotlin był przenoszeniem, nie pisaniem od nowa'**

  Golden-file testy bit-exact NIE PRZEJDĄ między wasm32, aarch64-apple-ios i aarch64-linux-android. Arytmetyka IEEE-754 (+,−,×,÷,sqrt) jest deterministyczna, ale funkcje transcendentalne NIE SĄ: `sin`, `cos`, `tan`, `exp`, `log`, `pow`, `atan2` w Ruście wołają platformowy libm na targetach natywnych (Apple libm ≠ bionic ≠ musl) i wkompilowany libm na wasm32-unknown-unknown. Dotyczy to bezpośrednio: współczynników biquadów RBJ (tan, cos, sinh) w HPF/EQ/de-esserze, jądra sinc w rubato (sin), pYIN (log, exp), K-weightingu BS.1770-4, obliczeń FDN reverb. Dodatkowo: WASM nie ma instrukcji FMA, ARM64 ma — jeśli ktokolwiek napisze SIMD ręcznie albo włączy `relaxed-simd` (którego `f32x4.relaxed_madd` jest W SPECYFIKACJI niedeterministyczny: może być fused albo nie), różnice rosną z każdą próbką rekursji IIR.

  → Trzy twarde reguły w `core-dsp`, egzekwowane clippy lintem: (1) ZAKAZ `std`/`core` float math — wyłącznie crate `libm` (pure Rust, ten sam kod źródłowy na wszystkich targetach, MIT); (2) ZAKAZ target-feature `relaxed-simd`, zakaz jakichkolwiek flag fast-math w LLVM; (3) golden-file porównywane z TOLERANCJĄ, nie bit-exact — kryterium: RMS różnicy < −120 dBFS i max |różnica| < 1e-5 dla bloków 10 s. Osobno: współczynniki filtrów liczyć RAZ przy zmianie parametru i cache'ować, żeby ewentualna różnica w tan() nie propagowała się per-próbkę.

- **§10: 'bindings-ffi/ uniffi → Swift + Kotlin' jako jedyna granica FFI, przy metryce '60 fps, zero dropoutów audio'**

  UniFFI jest realtime-unsafe i nie wolno go wołać z callbacku audio. Generowane scaffoldingi alokują `RustBuffer` (malloc) na każde wywołanie zwracające cokolwiek złożonego, obiekty są za `Arc<Mutex<…>>`, a `catch_unwind` jest w każdej funkcji. Wołanie tego z render callbacku AudioUnit/AVAudioSourceNode albo z `AudioStreamCallback::onAudioReady` w Oboe łamie zasadę no-malloc/no-lock w wątku o priorytecie czasu rzeczywistego → priority inversion, dropouty, w skrajnym przypadku watchdog kill na iOS.

  → DWIE granice FFI, zapisane w §10 jako osobne crate'y: (a) `bindings-ffi-control` — UniFFI, dla EDL, komend, analizy, storage, wszystkiego co nie jest w wątku audio; (b) `bindings-ffi-rt` — ręczny `extern "C"`, kontekst preallokowany raz (`rt_create(cfg) -> *mut RtCtx`), pętla `rt_process(ctx, in_ptr, out_ptr, n_frames)` bez jednej alokacji, `panic = "abort"` dla profilu release, żaden `Mutex` (parametry przekazywane lock-free przez `AtomicU64` / triple buffer). Do tego `#[inline(never)]` na granicy i `assert_no_alloc` w testach debug.

- **§3.2 punkt 2: 'Brak okna 30 s ... Parakeet obsługuje długie wejście (do 24 min z pełną atencją, do 3 h z lokalną)' jako powód wyboru Parakeeta, przy wdrożeniu na Cloudflare Containers standard-4**

  Karta modelu mówi dosłownie: 'audio up to 24 minutes long with full attention (on A100 80GB) or up to 3 hours with local attention'. standard-4 to 4 vCPU / 12 GiB / BEZ GPU (potwierdzone w docs Cloudflare). 24 min przy subsamplingu 8× z 10 ms to 18 000 ramek — macierz atencji 18000² × 4 B to 1,3 GB na głowę na warstwę. Na 12 GiB to niewykonalne. Zostaje local attention, dla którego opublikowane WER 7,31%/7,28% NIE BYŁY MIERZONE (Fleurs i MLS to krótkie, czytane wypowiedzi kilkunastosekundowe, więc mierzono full attention). Do tego §8.2 i tak tnie materiał na segmenty 5-minutowe dla równoległości. Czyli deklarowana przewaga #2 w wybranym wdrożeniu nie występuje — i to jest w porządku, ale nie wolno na niej opierać werdyktu wyboru silnika.

  → Przeformułować uzasadnienie wyboru Parakeeta na dwa realne powody: (1) brak halucynacji na ciszy (transducer), (2) natywne timestampy z predykcji duration. Skreślić 'brak okna 30 s' jako argument. Zapisać jawnie: segmentacja własna na granicach VAD, okna 120–300 s z zakładką 5 s i zszywaniem po najdłuższym wspólnym prefiksie/sufiksie tokenów, local attention jako tryb produkcyjny. Dopisać do korpusu ewaluacyjnego pomiar WER W TRYBIE LOCAL ATTENTION przy realnym rozmiarze okna — bo to jest tryb, który pojedzie na produkcji.

- **§3.1/§8.1: 'Whisper large-v3-turbo ... Workers AI 0,03 USD/h ... podłoga kosztowa, fallback' oraz tabela kosztów 'Razem (ścieżka whisper-turbo) ≈0,47 USD / odcinek'**

  Schemat odpowiedzi `@cf/openai/whisper-large-v3-turbo` na Workers AI to `text` (string), `word_count` (number), `vtt` (string) — CZYLI SEGMENTY W WEBVTT, BEZ word-level timestamps. Jako 'fallback' dla toru, którego cała wartość to granice słów, to nie jest fallback — to inna funkcjonalność. Może służyć wyłącznie jako źródło TEKSTU dla alignera CTC, ale wtedy 'podłoga kosztowa 0,27 USD' jest fikcyjna, bo droga część (aligner XLSR-large 315M na CPU, RTF 0,15–0,5) zostaje w kosztach. Druga rzecz: żądanie do Workers AI idzie przez Workera, a Worker ma limit body 100 MB na Free I NA PRO (potwierdzone; 200 MB dopiero Business). 9 h FLAC 16 kHz mono to ~150–250 MB, więc i tak trzeba ciąć na kawałki i płacić za wywołania.

  → Wykreślić 'whisper-turbo jako tania ścieżka' z tabeli kosztów jako pozycję samodzielną. Zostawić go jako awaryjne ŹRÓDŁO TEKSTU, gdy kontener Parakeeta nie wstaje, z kosztem = 0,27 USD + pełny koszt alignera. Prawdziwa podłoga kosztowa odcinka to koszt alignera, nie ASR.

- **§8.2: 'Workflow "episode-pipeline" (durable, retry)' zwracający WordTrack/SpeakerTrack**

  Cloudflare Workflows ma limit 'Max step result size: 1 MiB'. WordTrack dla 3 h to ~27 000 słów; jako JSON z `start`, `end`, `text`, `score` to 2–5 MB, binarnie z tabelą stringów ~600 kB–1 MB — czyli na granicy albo ponad. Krok, który zwróci WordTrack jako wynik, wywali cały workflow. Drugi limit: CPU time per step 30 s domyślnie (konfigurowalne do 5 min) na Workers Paid — jakiekolwiek przetwarzanie WordTracku w Workerze (scalanie segmentów, deduplikacja zakładek) musi się w tym zmieścić albo iść do kontenera. Trzeci: retention stanu 30 dni.

  → Reguła w spec: KAŻDY krok Workflow zwraca wyłącznie klucz R2 i metadane skalarne (≤1 kB). Żaden artefakt nie przechodzi przez stan Workflow. Scalanie segmentów WordTrack robi kontener, nie Worker. Zapisać limit 1 MiB wprost, bo diagram w §8.2 sugeruje przepływ danych przez Workflow.

- **§16/§11: 'true peak z 4× oversamplingiem' + metryka akceptacji 'true peak ≤ −1,0 dBTP ZAWSZE'**

  Te dwa zdania są ze sobą sprzeczne. BS.1770-4 podaje 4× jako MINIMUM dla materiału 48 kHz, a znane niedoszacowanie estymatora 4× dla sygnałów o energii w górnym paśmie sięga ~0,5 dB (dla treści blisko Nyquista więcej). Czyli plik zmierzony przez Ciebie na −1,0 dBTP realnie może mieć −0,5 dBTP, a mierzony niezależnym narzędziem z 16× oversamplingiem obleje test. Metryka mówi 'ZAWSZE', a metoda tego nie gwarantuje.

  → Albo oversampling 8× minimum (16× dla eksportu, koszt pomijalny bo to jeden przebieg offline), albo limiter celuje w −1,5 dBTP przy pomiarze 4×. Wybrać jedno i zapisać. Rekomendacja: 16× w pomiarze eksportowym, 4× w mierniku RT (tam liczy się latencja, nie ostatnie 0,5 dB).

- **§16: 'normalizacja PER MÓWCA do −20 LUFS short-term PRZED masterem'**

  To jest niedefiniowalne. Short-term LUFS to wartość ZMIENNA W CZASIE (okno przesuwne 3 s wg EBU Tech 3341). 'Znormalizować do −20 LUFS short-term' nie ma jednego wyniku — to może znaczyć jedno przesunięcie gain na ścieżkę (wtedy właściwą miarą jest integrated albo mediana short-term), albo automatyzację gain w czasie (leveler). To dwie zupełnie różne implementacje o różnym brzmieniu: pierwsza zachowuje dynamikę mówcy, druga ją spłaszcza. Napisane tak, jak jest, zostanie zaimplementowane losowo.

  → Wybrać i zapisać: gain statyczny per ścieżka do integrated −20 LUFS liczonego TYLKO na segmentach VAD=mowa tej ścieżki (bo cisza i crosstalk zaniżają integrated), plus opcjonalny leveler jako osobny blok DSP z jawnymi parametrami (cel −20 LUFS-S, zakres ±6 dB, slew 1 dB/s, okno 3 s). Dwa parametry w `MaterialProfile`, nie jeden.

- **§2: 'Widok tekstowy nie ma własnych operacji. Usunięcie zdania w tekście = RemoveRange{start: word[i].start_refined, ...}' przy `Annotation.start: u64 // klatka w źródle`**

  Brakuje najważniejszej funkcji w całej integracji i bez niej widok tekstowy się rozjedzie. Adnotacje są indeksowane KLATKĄ W ŹRÓDLE, a EDL operuje na OSI PROJEKTU. Po `RemoveRange{ripple:true}` odwzorowanie source→timeline przestaje być monotoniczne, a po `MoveClip`/duplikacji klipu jedno źródłowe słowo może występować w projekcie ZERO, JEDEN albo N razy. Spec nie definiuje funkcji `source_frame → [timeline_frame]` ani tego, co widok tekstowy pokazuje, gdy to samo źródłowe słowo jest na osi dwa razy (dubel zdania w tekście?), ani co robi `word[i].start_refined`, gdy słowo zostało PRZECIĘTE przez `SplitClip` w środku. To jest dokładnie ten szew, na którym pęka teza 'drugi widok na ten sam EDL'.

  → Odwrócić kierunek: tekst NIE jest renderowany z WordTrack, tylko z PRZEJŚCIA PO KLIPACH OSI CZASU. Dla każdego klipu w kolejności `timeline_start` bierzesz zakres źródła `[source_in, source_in+len)`, robisz zapytanie interwałowe do WordTrack tego źródła i emitujesz tokeny, które mieszczą się CAŁE w klipie (częściowo przycięte oznaczasz jako 'ucięte' i renderujesz na szaro, nieedytowalne). Wtedy: dubel klipu = dubel zdania w tekście (poprawnie), ripple delete = tekst po prostu krótszy, split w środku słowa = widoczny artefakt zamiast cichego rozjazdu. Dodać do §2 jawną strukturę `TimelineTextIndex` przebudowywaną inkrementalnie po każdej komendzie (tylko dotknięte klipy) i zdefiniować `undo` jako przebudowę tego indeksu, nie osobny stan.

- **§1.1, tabela: 'Kompensacja latencji round-trip, monitoring, miernik RMS/clip — 100% wspólna'**

  Na webie nie ma czego kompensować, bo nie ma z czego policzyć. Web Audio daje `AudioContext.baseLatency` i `outputLatency` — obie dotyczą WYJŚCIA. Nie istnieje żadne API zwracające latencję ścieżki WEJŚCIOWEJ (`MediaTrackSettings.latency` jest advisory, nieimplementowane spójnie i nie obejmuje bufora sprzętowego). Czyli 'kompensacja round-trip' jako warstwa '100% wspólna' jest na webie niewykonalna, a na iOS/Androidzie jest trywialna (`AVAudioSession.inputLatency + outputLatency + ioBufferDuration`; Oboe `getTimestamp()` na obu strumieniach). To nie jest warstwa wspólna, to warstwa z dziurą na jednej z trzech platform.

  → Przenieść kompensację latencji do warstwy platformowej z jednym kontraktem `fn io_latency_frames() -> Option<u64>`. Na webie: `None` domyślnie + jednorazowy KALIBRATOR PĘTLI AKUSTYCZNEJ (odtwórz chirp/MLS przez głośniki, nagraj mikrofonem, GCC-PHAT, zapisz wynik per urządzenie w SQLite). Bez tego overdub na webie będzie systematycznie przesunięty o 20–200 ms zależnie od sprzętu — a to jest funkcja, którą tor śpiewu potrzebuje bardziej niż podcast.

- **Zależność #7 / §12 punkt 5: 'Renderer offline w rdzeniu — obecny jest martwym kodem (lib/multi-track-engine.ts:373), czyli nie istnieje żadna ścieżka eksportu projektu multitrack'**

  To jest po prostu nieprawda i sprawdziłem to w repo. `mixToBuffer` (lib/multi-track-engine.ts:373) jest wołane z `exportMix` (lib/multi-track-engine.ts:423), a `exportMix` jest wołane z UI: components/multi-track-manager.tsx:177. Ścieżka eksportu ISTNIEJE i jest podpięta. Ma realne wady (twardo zaszyte `sampleRate = 44100` mimo capture 48 kHz, wymaga wszystkich buforów w RAM przez `loadAudioSource`/`decodeAudioData` — lib/multi-track-engine.ts:491), ale to jest 'zły renderer', nie 'brak renderera'. Fałszywa diagnoza w liście zależności psuje priorytetyzację: pozycja 5 w §12 jest opisana jako 'nie istnieje', czyli blocker, a realnie jest to refaktor.

  → Poprawić diagnozę na: 'renderer offline istnieje i jest podpięty (multi-track-manager.tsx:177 → exportMix → mixToBuffer), ale renderuje na 44 100 Hz niezależnie od materiału i wymaga pełnego dekodu wszystkich źródeł do RAM (decodeAudioData na całych blobach), więc dla 3 h × 3 ścieżki wywali zakładkę na OOM'. To zmienia charakter zadania i jego ryzyko. Pozostałe cytowane usterki sprawdziłem i SĄ prawdziwe: MediaRecorder tylko webm (hooks/use-audio-recording.ts:17-19), martwy start nagrywania przez odczyt `audioRecorder.isRecording` w tym samym ticku po await (contexts/audio-recorder-context.tsx:62), czas w sekundach float (lib/multi-track-storage.ts:24-29), stałe 1000 próbek waveformu (lib/multi-track-storage.ts:715), brak jakiegokolwiek AudioWorkletu w repo.

- **§1.3 MaterialProfile: 'denoise: DenoiseCfg, // speech: DPDFNet 48k, wet 100%, attn limit −18 dB'**

  Nie istnieje projekt o nazwie 'DPDFNet'. Najbliższy realny to DeepFilterNet (Rikorose/DeepFilterNet) — i jest to JEDYNY blok DSP w całej specyfikacji, dla którego nie podano licencji ani wersji, mimo że denoise mowy jest najbardziej widoczną dla użytkownika funkcją całego filaru. Sprawdziłem: kod DeepFilterNet jest dual MIT/Apache-2.0 (LICENSE-MIT, Copyright 2021 Hendrik Schröter), 4,5k gwiazdek — ale OSTATNI PUSH TO 2024-10-17, czyli 21 miesięcy bez commita. GitHub raportuje spdx NOASSERTION dla repo. Wagi modeli są dystrybuowane osobno i wymagają osobnego sprawdzenia (DNS4/DNS5 mają własne warunki).

  → Nazwać projekt poprawnie, przypiąć konkretny tag (DeepFilterNet3), zarchiwizować wagi lokalnie z SHA-256 tak samo jak dla pyannote, i sprawdzić licencję WAG osobno od licencji kodu. Rozważyć, czy denoiser ma być modelem, czy klasycznym spectral gate + Wienerem w rdzeniu — bo projekt bez commitów od 21 miesięcy, z którego bierzesz wagi ONNX na trzy platformy, jest realnym długiem. Alternatywa z żywym utrzymaniem: `sherpa-onnx` ma wbudowane modele speech-enhancement (GTCRN) pod Apache-2.0 z buildami na iOS/Android/WASM — tym samym runtime, którego i tak używasz.

- **§4: 'MFA jako GOLDEN REFERENCE w CI do pomiaru błędu granic' + metryka 'mediana |błąd granicy| vs MFA polish_mfa ≤20 ms'**

  MFA nie jest prawdą, tylko drugim estymatorem o TYM SAMYM RZĘDZIE BŁĘDU. Publikowany błąd granic MFA na mowie spontanicznej to same 20–30 ms, a próg akceptacji ustawiony jest na ≤20 ms mediany — czyli mierzysz zgodność dwóch narzędzi, których błędy są porównywalne, i nie wiesz, które się myli. Gorzej: MFA na dokładnie tych przypadkach, które są trudne (nazwy własne, anglicyzmy IT, code-switching), wymaga G2P i często odmawia alignmentu albo produkuje śmieć — czyli 'prawda' znika tam, gdzie najbardziej jej potrzebujesz. Metryka jest niefalsyfikowalna w interesującym zakresie.

  → Prawdą muszą być RĘCZNE ANOTACJE GRANIC. 20–30 minut polskiego materiału podcastowego oznaczone w Praacie na poziomie słowa przez fonetyka — to jest ~2 dni pracy jednej osoby i rozwiązuje problem raz na zawsze dla całego projektu. MFA zostaje jako trzeci głos do wykrywania regresji na dużej próbce (gdzie liczy się trend, nie wartość bezwzględna). Do korpusu z zależności #10 dopisać 'granice słów anotowane ręcznie', a MFA przenieść z 'prawda' na 'baseline'.

- **§8.2: 'Wymóg: pierwszy tekst na ekranie ≤60 s od zakończenia nagrania' przy Containers z sleepAfter**

  Budżet 60 s nie zamyka się przy zimnym starcie. Cloudflare podaje 'Container cold starts can often be in the 1-3 second range, but this is dependent on image size and code execution time' — to jest dla małych obrazów. Twój obraz zawiera Parakeet int8 (640 MB wg sherpa-onnx: encoder 622M + decoder 12M + joiner 6,1M), wav2vec2-XLSR int8 (~320 MB) i pyannote. Do 1–3 s cold startu dochodzi inicjalizacja sesji ONNX Runtime dla enkodera 622 MB na 4 vCPU — realnie 10–40 s, zanim policzy się pierwsza ramka. Plus Cloudflare zastrzega: 'no guarantee that any instance will run for any set period of time' i restarty hostów są nieregularne, więc job w połowie może zniknąć.

  → (1) Startować kontener SPEKULATYWNIE w momencie rozpoczęcia nagrywania, nie po jego zakończeniu — masz 3 h zapasu, a koszt idle to 12 GiB × 0,0000025 USD/GiB-s ≈ 0,03 USD/h, czyli nic. (2) Ustawić `sleepAfter` dłużej niż typowy odstęp między odcinkami użytkownika. (3) Wysyłać segmenty do ASR NA BIEŻĄCO w trakcie nagrania (masz progresywny upload do R2, więc materiał już tam jest) — wtedy 'pierwszy tekst' istnieje jeszcze przed końcem nagrania i metryka staje się trywialna. (4) Każdy segment musi być idempotentny i wznawialny, bo host może zniknąć.

**Problemy licencyjne:**

- Wagi modeli embeddingów mówcy: spec deklaruje '3D-Speaker/WeSpeaker (Apache-2.0)'. To jest licencja KODU repozytorium (modelscope/3D-Speaker: Apache-2.0, potwierdzone), a NIE licencja wag. Wagi tych modeli trenowane są na VoxCeleb1/2 i CN-Celeb. Metadane VoxCeleb są pod CC BY-SA 4.0 (potwierdzone na stronie VGG: 'The provided VoxCeleb metadata is licensed under a Creative Commons Attribution-ShareAlike 4.0 International License'), a CC BY-SA jest licencją COPYLEFT — jeśli ktoś uzna wagi za utwór zależny, klauzula ShareAlike zaraża. Sam audio to linki do YouTube'a, więc dochodzi warstwa praw osób trzecich. Spec archiwizuje SHA-256 tylko dla pyannote; embeddingi zostawia bez żadnej weryfikacji. https://www.robots.ox.ac.uk/~vgg/data/voxceleb/vox1.html | https://api.github.com/repos/modelscope/3D-Speaker
- flacenc-rs jest Apache-2.0, NIE 'MIT-Apache' jak podaje spec §6/§10. Do tego 40 gwiazdek i jeden maintainer — dla enkodera FLAC w produkcie komercyjnym na trzy platformy to cienki fundament. Push 2026-06-29, więc żywy, ale plan B (własny enkoder, który spec i tak dopuszcza) powinien być decyzją, nie fallbackiem. https://api.github.com/repos/yotarok/flacenc-rs
- DeepFilterNet (spec nazywa go błędnie 'DPDFNet') to JEDYNY blok DSP w całej specyfikacji bez podanej licencji. Kod jest dual MIT/Apache-2.0 (LICENSE-MIT: Copyright (c) 2021 Hendrik Schröter), ale GitHub API zwraca spdx NOASSERTION, a wagi są dystrybuowane osobno i mają własną historię zbiorów treningowych (DNS Challenge). To wymaga osobnego audytu przed wdrożeniem. https://api.github.com/repos/Rikorose/DeepFilterNet
- CC-BY-4.0 na wagach oznacza atrybucję W PRODUKCIE, na trzech platformach, dla: Parakeet TDT 0.6b v3 (potwierdzone: cc-by-4.0, lastModified 2026-06-29), Canary-1b-v2 (potwierdzone: cc-by-4.0, lastModified 2025-12-03), pyannote community-1, modele MFA, HerBERT-base-cased (potwierdzone: cc-by-4.0). Spec to zauważa, ale nie precyzuje formy: CC-BY-4.0 wymaga podania autora, tytułu, linku do licencji ORAZ oznaczenia zmian (kwantyzacja int8 i eksport ONNX to modyfikacja utworu — trzeba to napisać). Ekran 'O programie' z listą nie wystarczy, jeśli nie ma adnotacji o modyfikacji.
- Dataset Granary (na którym trenowany jest Parakeet v3) jest CC-BY-4.0, ale składa się m.in. z YODAS i 'YouTube Clips (YTC)' — czyli materiału z YouTube'a. To nie jest problem licencyjny dla Ciebie (wagi są CC-BY-4.0), ale spec twierdzi, że dane 'nie są zapożyczone ze zbiorów badawczych o ograniczeniach' — to jest za mocne stwierdzenie przy komponencie YouTube'owym. Zapisać jako ryzyko reputacyjne/regulacyjne, nie jako czysty rachunek. https://huggingface.co/api/datasets/nvidia/Granary
- sdadas/polish-roberta-base-v2 jest Apache-2.0 (potwierdzone, lastModified 2026-01-27) — czyli PERMISYWNIEJSZY niż HerBERT (CC-BY-4.0, wymaga atrybucji). Spec wymienia HerBERT jako pierwszy wybór, a polish-roberta jako 'lub'. Przy równej lub lepszej jakości i braku obowiązku atrybucji kolejność powinna być odwrotna.

**Projekty martwe:**

- DeepFilterNet (spec: 'DPDFNet') — ostatni push 2024-10-17, czyli 21 MIESIĘCY bez commita na dzień 2026-07-26. To jest denoiser mowy, czyli najbardziej widoczna dla użytkownika funkcja DSP w całym filarze podcast. 4,5k gwiazdek, nie zarchiwizowany, ale bez utrzymania. https://api.github.com/repos/Rikorose/DeepFilterNet
- jonatasgrosman/wav2vec2-large-xlsr-53-polish — lastModified 2022-12-14, czyli 3,5 ROKU bez zmian. Trenowany na Common Voice PL 6.0 (mowa CZYTANA, studyjna, zdania z Wikipedii). To jest fundament stopnia 2 alignera, na którym opiera się cała edycja po tekście. Nie jest 'martwy' (2,5 mln pobrań, Apache-2.0), ale jest zamrożony w 2022 i architektura XLSR-53 ma od tego czasu następców. https://huggingface.co/api/models/jonatasgrosman/wav2vec2-large-xlsr-53-polish
- pyannote/segmentation-3.0 — lastModified 2024-05-10, ponad 2 lata. MIT, gated (auto, z formularzem 'Company/university' i 'Website' oraz zastrzeżeniem 'we will occasionnally email you about premium models and paid services'). Gating na modelu, który jest w Twojej ścieżce produkcyjnej fallbacku, to ryzyko dostępu — spec słusznie każe archiwizować z SHA-256, ale ta reguła powinna dotyczyć WSZYSTKICH wag, nie tylko tej. https://huggingface.co/api/models/pyannote/segmentation-3.0
- modelscope/3D-Speaker — push 2025-12-08, 7,5 miesiąca bez commita. Apache-2.0 na kodzie. Nie martwy, ale w zwolnionym tempie.
- allegro/herbert-base-cased — lastModified 2022-06-09, 4 LATA. Jeśli klasyfikator wypełniaczy klasy B ma być fine-tune'em, to na modelu zamrożonym cztery lata temu, podczas gdy sdadas/polish-roberta-base-v2 był aktualizowany 2026-01-27.
- ŻYWE (sprawdzone, bez zastrzeżeń): k2-fsa/sherpa-onnx — push 2026-07-24, Apache-2.0, 13 797 gwiazdek, nie zarchiwizowany. HEnquist/rubato — push 2026-07-18, LICENSE.txt = dual MIT OR Apache-2.0 (GitHub raportuje NOASSERTION tylko dlatego, że plik zawiera oba warianty; to nie jest problem). yotarok/flacenc-rs — push 2026-06-29.

**Luki platformowe:**

- AudioWorkletGlobalScope nie ma TextEncoder/TextDecoder/fetch/importScripts → wygenerowany glue wasm-bindgen rzuca ReferenceError przy pierwszym stringu. Issue rustwasm/wasm-bindgen#2367 otwarte. Dotyczy WSZYSTKICH trzech przeglądarek, nie tylko Safari.
- onnxruntime-web wielowątkowy wymaga crossOriginIsolated (COOP/COEP) — dokumentacja ORT wprost. Decyzja spec o braku COOP/COEP zabija ścieżkę 'Parakeet w onnxruntime-web opt-in na desktopie'.
- sqlite-wasm: kanoniczny VFS 'opfs' wymaga SharedArrayBuffer + COOP/COEP. Bez tego zostaje 'opfs-sahpool', który 'does not support multiple simultaneous connections' i prealokuje/blokuje pulę plików. Jedno połączenie na origin, brak drugiej zakładki.
- Cross-Origin-Embedder-Policy: credentialless — Safari i Safari iOS: version_added FALSE (MDN BCD). Czyli argument spec jest poprawny, ale konsekwencja jest twardsza niż spec przyznaje: na Safari wybór to 'COEP require-corp i naprawa wszystkich embedów' albo 'brak SAB i brak wielowątkowego WASM'.
- navigator.storage.estimate() — Safari i Safari iOS dopiero od wersji 17 (MDN BCD). FileSystemSyncAccessHandle od 15.2. Czyli na iOS 15.2–16.7 masz OPFS bez możliwości sprawdzenia kwoty.
- FileSystemSyncAccessHandle na Safari 15.2–16.3: getSize(), flush(), truncate(), close() ZWRACAJĄ PROMISE. Wersje synchroniczne dopiero od Safari 16.4. Deklaracja 'Safari i iOS 15.2+' w §7.4 jest myląca — realna podłoga to 16.4.
- WebKit liczy kwotę storage od CAŁKOWITEGO rozmiaru dysku ('each origin can store up to around 60% of total disk', 'overall quota ... 80% of disk size'), nie od wolnego miejsca. Bramka miejsca oparta na estimate() przepuści nagranie na pełnym urządzeniu.
- Safari 7-dniowa eksmisja: WebKit dokumentuje ją jako część ITP ('If an origin has no user interaction ... in the last seven days of browser use, its data created from script will be deleted'). ANI MDN, ANI blog WebKit NIE POTWIERDZAJĄ, że navigator.storage.persist() z tego zwalnia — mówią tylko 'might be excluded from eviction if it has active page at the time of eviction, or its storage is in persistent mode', a persistent mode WebKit przyznaje heurystycznie, 'based on heuristics like whether the website is opened as a Home Screen Web App'. Czyli JEDYNY udokumentowany niezawodny sposób to instalacja jako Home Screen Web App — a to trzeba zaproponować użytkownikowi w UI, nie liczyć na persist().
- WebCodecs AudioEncoder: Safari/Safari iOS od 26, Chrome 94, Firefox 130 — ale Firefox Android: version_added FALSE. Czyli fallback WASM jest obowiązkowy nie tylko dla starszego Safari.
- Web Audio nie ma żadnego API latencji WEJŚCIA. baseLatency i outputLatency dotyczą wyjścia. 'Kompensacja latencji round-trip 100% wspólna' (§1.1) jest na webie niewykonalna bez kalibratora pętli akustycznej.
- MediaStreamAudioSourceNode oddaje próbki już przeresamplowane do AudioContext.sampleRate — przeglądarka ukrywa i kompensuje dryf zegara mikrofonu. Na webie nie da się zmierzyć realnego rate'u urządzenia, więc double-ender z korektą dryfu jest funkcją NATYWNĄ.
- Cloudflare Containers: brak GPU (potwierdzone — nigdzie w docs nie ma o tym mowy), max standard-4 = 4 vCPU / 12 GiB / 20 GB, custom max 4 vCPU / 12 GiB / 20 GB, min ratio 3 GiB pamięci na vCPU. Max rozmiar obrazu = dysk instancji (20 GB), łącznie 50 GB rejestru na konto. Cold start '1-3 s' tylko dla małych obrazów. 'No guarantee that any instance will run for any set period of time'.
- Cloudflare Workers: body 100 MB na Free I NA PRO (200 MB dopiero Business, 500 MB Enterprise), 128 MB RAM na isolate — spec ma to poprawnie.
- Cloudflare Workflows: max step result 1 MiB, CPU per step 30 s (do 5 min konfigurowalnie), retention stanu 30 dni, max persisted state 1 GB.
- Workers AI @cf/openai/whisper-large-v3-turbo zwraca text / word_count / vtt — BEZ word-level timestamps.
- iOS Safari: brak nagrywania w tle i przy zablokowanym ekranie (spec to wie i wyciąga poprawny wniosek).

**Potwierdzone niezależnie:**

- Parakeet TDT 0.6b v3: licencja CC-BY-4.0, lastModified 2026-06-29, 25 języków w tym polski, WER PL 7,31% Fleurs / 7,28% MLS, automatyczna interpunkcja i wielkie litery, 'accurate word-level and segment-level timestamps'. Wszystko jak w spec. https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3
- sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8 ISTNIEJE i jest udokumentowany w sherpa-onnx, 25 języków europejskich z polskim, rozmiary: encoder 622M, decoder 12M, joiner 6,1M, razem 640M (spec podaje 652/11,8/6,4 = 670 MB — rząd się zgadza). https://k2-fsa.github.io/sherpa/onnx/pretrained_models/offline-transducer/nemo-transducer-models.html
- k2-fsa/sherpa-onnx: Apache-2.0, push 2026-07-24, 13 797 gwiazdek, nie zarchiwizowany. Żywy projekt.
- jonatasgrosman/wav2vec2-large-xlsr-53-polish: Apache-2.0 — licencja jak deklarowana.
- pyannote/segmentation-3.0: MIT, gated (auto) — licencja jak deklarowana.
- nvidia/canary-1b-v2: CC-BY-4.0 — jak deklarowana.
- allegro/herbert-base-cased: CC-BY-4.0 — jak deklarowana. sdadas/polish-roberta-base-v2: Apache-2.0.
- Granary: CC-BY-4.0.
- Cloudflare Containers standard-4 = 4 vCPU / 12 GiB / 20 GB, BEZ GPU, ceny 0,000020 USD/vCPU-s i 0,0000025 USD/GiB-s — dokładnie jak w spec. Arytmetyka kosztu 8424 s × 0,00011 = 0,93 USD jest poprawna.
- Workers AI @cf/openai/whisper-large-v3-turbo: 0,0005 USD za minutę audio = 0,03 USD/h — jak w spec.
- Worker: 100 MB body na Free/Pro, 128 MB RAM na isolate, 15 min dla Queue consumers / Cron / DO alarms — jak w spec.
- R2 max 10 000 części — jak w spec.
- Descript: Free 60 min, Hobbyist 16 USD / 10 h, Creator 24 USD / 30 h, Business 50 USD / 40 h; Studio Sound, Remove Filler Words i Multitrack Transcription gated na Creator+ — dokładnie jak w spec.
- COEP credentialless brak w Safari — jak w spec.
- Matematyka piramidy peaków: L0=256 → 2 025 000 bucketów × 6 B = 12,15 MB; suma 6 poziomów ≈16,2 MB/ścieżka; pokrycie zoomu 3 h w 1600 px = 324 000 klatek/px, L5 = 1,236 bucketa/px ≥ 1. Wszystko się liczy.
- Rozmiary PCM: i24 mono 48 kHz = 144 000 B/s, 3 h = 1,5552 GB, ×3 ścieżki = 4,666 GB. Poprawne.
- Diagnoza obecnego kodu (sprawdzone lokalnie): MediaRecorder tylko 'audio/webm' — hooks/use-audio-recording.ts:17-19. Martwy start nagrywania audio przez odczyt audioRecorder.isRecording w tym samym renderze po await — contexts/audio-recorder-context.tsx:62. AudioClip w sekundach float — lib/multi-track-storage.ts:24-29. generateWaveformData ze stałym samples=1000 — lib/multi-track-storage.ts:715. Pełny decodeAudioData całego bloba do RAM — lib/multi-track-engine.ts:490-492. Zero AudioWorkletu w całym repo (grep bez wyników).
- Teza główna — 'podcast to profil materiału, nie osobny produkt; granica leży w warstwie ANALIZY, a widok tekstowy to drugi widok na ten sam EDL emitujący te same komendy' — jest merytorycznie słuszna i jest najlepszą częścią tej propozycji. Podobnie: EDL na klatkach u64 zamiast sekund float, command log z odwrotnościami zamiast snapshotów, zakaz contenteditable, oddechy tłumione zamiast usuwanych, klasa B wypełniaczy tylko jako sugestia, zakotwiczenie bulletów show notes w cytacie, adaptacyjny próg ciszy z percentyla zamiast stałego dBFS, ochrona pauzy retorycznej.

**Lepsze alternatywy:**

- zamiast *Dwustopniowy pipeline modelowy: Parakeet TDT (ASR) + osobny wav2vec2-large-xlsr-53-polish 315M / ~320 MB int8 (forced alignment CTC, RTF 0,15)* → **Forced alignment NA WŁASNEJ KRATOWNICY PARAKEETA. Transducer TDT pozwala na wymuszony alignment: przy zadanym ciągu tokenów robisz Viterbi po siatce (t, u) enkodera-jointa, dokładnie tak jak CTC, tylko na modelu, który już policzyłeś. Drugi model dokładasz DOPIERO gdy pomiar na własnym korpusie pokaże medianę >30 ms.** (Cztery konkretne zyski: (1) −320 MB modelu i −RTF 0,15, czyli koszt inferencji odcinka spada o ~40% (z 0,93 do ~0,58 USD) i on-device na Androidzie robi się realny; (2) ZERO rozjazdu tokenizacji — obecnie Parakeet ma tokenizer SentencePiece BPE na 25 języków, a XLSR-PL grafemowy, więc tekst trzeba renormalizować między modelami i każda różnica w interpunkcji/wielkich literach/liczbach psuje alignment; (3) TDT PRZEWIDUJE DURATION tokenu, więc granica jest ostrzejsza niż sama siatka 80 ms — CTC daje 20 ms grid, ale CTC ma udokumentowane systematyczne opóźnienie pików (peaky behaviour), którego spec w ogóle nie uwzględnia, a które może przekroczyć okno refinementu ±40 ms; (4) jeden model do utrzymania, kwantyzacji, walidacji i archiwizacji zamiast dwóch. Spec sam pisze, że fine-tuningu nie robi się przed pomiarem — ta sama zasada dotyczy dokładania drugiego modelu. Jeśli pomiar pokaże, że trzeba, to i tak nie XLSR-53 z grudnia 2022, tylko coś nowszego.)
- zamiast *Korekta dryfu zegarów przez GCC-PHAT na referencyjnym miksie zdalnym przesłanym przez WebRTC + regresja liniowa offsetu* → **Pomiar rate'u urządzenia LOKALNIE, bez sieci: regresja (liczba zarejestrowanych klatek) vs (monotoniczny zegar sprzętowy). iOS: AVAudioTime.hostTime + mach_timebase_info przy każdym buforze wejściowym. Android: AudioStream::getTimestamp() z Oboe (framePosition + nanoseconds). Wynik: ppm urządzenia, zapisywany w AudioSource.clock_ppm co 60 s. Sieć służy tylko do synchronizacji zegarów monotonicznych; offset startowy z GCC-PHAT na oknie 5-10 s z progiem peak-to-sidelobe > 3.** (Ścieżka sieciowa nie może dać deklarowanej dokładności, bo referencyjny miks jest wyjściem NetEq, który nieliniowo wstawia i usuwa próbki (accelerate/preemptive expand/PLC) w reakcji na jitter. To unieważnia model offset(t)=a+b·t, na którym stoi cała korekta: resampling będzie prostował artefakty jitter buffera zamiast dryfu zegara. Pomiar lokalny jest odporny na Opus, AEC, NetEq, utratę pakietów i zmienne opóźnienie, daje dryf z dokładnością <0,5 ppm po 10 minutach (czyli <20 ms na 3 h, dziesięć razy lepiej niż wymóg spec ≤1 ms... a przy ciągłym pomiarze i korekcie odcinkowej ≤1 ms), i — kluczowe — WYKRYWA urządzenia, które zmieniają rate w trakcie sesji (openQuestion #7 spec), bo nachylenie regresji przestaje być stałe. Metoda sieciowa tego nie odróżni od jittera. Bonus: eliminuje potrzebę zapisu i uploadu referencyjnego miksu 16 kHz (345,6 MB na ścieżkę na 3 h).)
- zamiast *MFA polish_mfa jako 'GOLDEN REFERENCE / prawda' w CI, z progiem mediany błędu granic ≤20 ms* → **20-30 minut polskiego materiału podcastowego z granicami słów anotowanymi RĘCZNIE w Praacie przez fonetyka. MFA schodzi do roli trzeciego głosu / detektora regresji na dużej próbce.** (Błąd granic MFA na mowie spontanicznej jest sam rzędu 20-30 ms, czyli równy progowi akceptacji — mierzysz zgodność dwóch estymatorów o porównywalnym błędzie i nie wiesz, który się myli. Gorzej: MFA wymaga słownika wymowy i G2P, więc dokładnie na przypadkach trudnych (nazwiska gości, anglicyzmy IT, code-switching) — czyli tam, gdzie chcesz mierzyć — 'prawda' albo znika, albo jest zmyślona przez G2P. Ręczna anotacja 25 minut to dwa dni pracy jednej osoby i zamyka temat dla całego projektu na trzy platformy. To jest dokładnie ten rodzaj wydatku, który zasada 'wysiłek nie jest wektorem' każe ponieść.)
- zamiast *i24 raw jako domyślny format capture na wszystkich platformach, z FLAC-24 w locie jako awaryjnym fallbackiem 'poniżej progu miejsca'* → **FLAC-24 w locie jako DOMYŚLNY format capture na urządzeniach mobilnych (blocksize 4096, SEEKTABLE co 10 s), i24 raw jako domyślny na desktopie/natywnym macOS/Windows.** (Spec odrzuca FLAC jako roboczy argumentem 'odczyt losowy to czysty seek offset = frame × 3, zero dekodowania'. Ale FLAC ma SEEKTABLE i stałe bloki: przy blocksize 4096 indeks bloku liczysz arytmetycznie, a dekod jednego bloku 24-bit mono to ~30-50 µs — o rząd wielkości poniżej budżetu prefetchu 5,46 s, który spec sam definiuje. Zysk jest za to twardy i rozwiązuje ryzyko, które spec sam wskazuje jako niemożliwe do obejścia (ryzyko #7): 4,666 GB → 2,71 GB, czyli bramka miejsca przechodzi na iPhonie, który spec skazuje na odmowę. Koszt 8-12% CPU jest realny, ale na telefonie nagrywającym JEDNĄ ścieżkę (a nie 12) to jest 8-12% z jednego rdzenia. Odwrócenie domyślnej wartości per platforma kosztuje jedną flagę w MaterialProfile, a ratuje główny scenariusz mobilny. Dodatkowo: i24 packed to niewyrównane 3-bajtowe próbki — jeśli i tak trzeba je rozpakowywać w pętli, argument 'zero dekodowania' jest słabszy niż wygląda, a argument '+25% I/O dla f32' nie ma za sobą żadnego pomiaru.)
- zamiast *Diaryzacja fallback jako pyannote/segmentation-3.0 (segmentacja) + embeddingi 3D-Speaker/WeSpeaker + klastrowanie* → **NVIDIA Sortformer (diar_sortformer_4spk / diar_streaming_sortformer_4spk-v2, CC-BY-4.0) jako podstawowa ścieżka fallbacku end-to-end, bez osobnych embeddingów i bez klastrowania. pyannote+embeddingi zostaje dla >4 mówców.** (Spec sam identyfikuje mowę nakładającą się jako główną słabość diaryzacji ('praktycznie gubiona') i główne źródło błędnej edycji. Pipeline segmentacja+embedding+klastrowanie jest architekturą, która overlapu NIE MODELUJE — przypisuje ramkę jednemu klastrowi. Sortformer jest modelem EEND-owym, który wielomówcowość modeluje wprost w wyjściu. Skoro overlap jest zdefiniowanym problemem, wybór modelu, który go modeluje, jest wyborem merytorycznym, nie wygodnym. Drugi powód jest licencyjny: Sortformer to jedne wagi CC-BY-4.0 od jednego wydawcy, zamiast łańcucha segmentacja (MIT, gated) + embeddingi (Apache-2.0 na kodzie, wagi trenowane na VoxCeleb CC-BY-SA i CN-Celeb) — czyli usuwa cały problem opisany w licenceProblems. Spec wymienia Sortformer wyłącznie jako opcję 'na żywo', co jest niedoszacowaniem.)
- zamiast *Ochrona pauzy retorycznej oparta na interpunkcji z ASR ('jeśli poprzednie zdanie kończy się znakiem końca zdania według ASR, minimum 400 ms')* → **Detekcja końca frazy PROZODYCZNA jako podstawa: opadający kontur F0 na ostatnich 200-300 ms (nachylenie < -150 centów/s), wydłużenie finalne (czas trwania ostatniej sylaby > 1,4 × mediana), spadek intensywności > 6 dB. Interpunkcja ASR jako wzmocnienie, gdy jest dostępna.** (Trzy powody. (1) Twoje własne openQuestion #6 pyta, czy interpunkcja Parakeeta dla polskiego wystarcza — a na mowie spontanicznej modele wytrenowane na Granary (gdzie interpunkcja była RESTAUROWANA pseudo-etykietowaniem) stawiają kropki nierówno. (2) Detektor pYIN i tak musi istnieć dla toru śpiewu, więc to zero dodatkowego DSP — dokładnie ten sam argument, którym spec uzasadnia detektor oddechów. (3) I najważniejsze produktowo: skracanie ciszy przestaje wtedy WYMAGAĆ CHMURY. Użytkownik importuje plik i natychmiast, offline, za darmo, dostaje działający 'remove silence' z ochroną rytmu — zamiast czekać na Workflow, ASR i aligner. To zmienia moment pierwszej wartości z 'kilka minut po uploadzie' na 'natychmiast', i robi to bez kompromisu jakościowego. Spec używa tej zależności jako argumentu, że WordTrack musi być obok obwiedni; realnie jest odwrotnie — im mniej warstwa DSP zależy od chmury, tym lepiej.)
- zamiast *Klasa A wypełniaczy usuwana automatycznie na podstawie samych luk w alignmencie + kryteriów akustycznych* → **Obowiązkowa weryfikacja drugim przebiegiem ASR na wyizolowanym fragmencie luki (padding 200 ms). Token leksykalny w wyniku = delecja ASR, oznacz jako 'brakujące słowo', NIE usuwaj. Plus twardsze kryterium akustyczne: monotoniczność formantów (zmiana F1 i F2 < 10% przez ≥100 ms) zamiast samego centroidu widmowego.** (Luka w alignmencie to suma trzech zdarzeń: wypełniacz, delecja ASR i błąd alignera. Przy realnym WER 15-25% na spontanicznym polskim (bo 7,31% to Fleurs, mowa czytana) delecje są częste, a automat skasuje je BEZ ŚLADU — użytkownik nie zobaczy nic w tekście, bo tego słowa tam nigdy nie było. Weryfikacja drugim przebiegiem kosztuje ułamek sekundy na kandydata (fragmenty 120-800 ms), jest praktycznie darmowa w skali odcinka i zamienia najgroźniejszy tryb awarii (ciche kasowanie treści) na nieszkodliwy (nadmiarowe podświetlenie). Monotoniczność formantów jest silniejszym dyskryminatorem niż centroid, bo każde realne słowo ma tranzycje formantowe, a wypełniacz z definicji ich nie ma.)
- zamiast *Jedna granica FFI: 'bindings-ffi/ uniffi → Swift + Kotlin'* → **Dwie granice: bindings-ffi-control (UniFFI, dla EDL/komend/analizy/storage) i bindings-ffi-rt (ręczny extern "C", kontekst preallokowany, rt_process(ctx, in, out, n) bez alokacji, panic=abort, parametry przez triple buffer/atomiki).** (UniFFI alokuje RustBuffer (malloc) i owija obiekty w Arc<Mutex<>> — wywołanie z render callbacku AVAudioSourceNode albo z Oboe onAudioReady łamie realtime safety i daje priority inversion. Metryka 'zero dropoutów audio' jest z tym niekompatybilna. To nie jest kwestia optymalizacji, tylko poprawności: alokator może zablokować wątek audio na czas nieograniczony. Podział na dwie granice trzeba zadeklarować w §10, bo inaczej pierwsza implementacja pójdzie najkrótszą drogą i problem wyjdzie dopiero na urządzeniu.)
- zamiast *Determinizm DSP przez 'golden-file testy w CI' bez sprecyzowania metody porównania* → **Zakaz std/core float math w core-dsp (clippy lint), wyłącznie crate libm (pure Rust, MIT), zakaz target-feature relaxed-simd, zakaz jakichkolwiek flag fast-math; golden-file z tolerancją: RMS różnicy < -120 dBFS i max |różnica| < 1e-5 na blokach 10 s.** (Bez tego CI będzie oblewał w sposób, którego nikt nie zdiagnozuje. sin/cos/tan/exp/log/pow w Ruście to platformowy libm na aarch64-apple-ios i aarch64-linux-android, a wkompilowany na wasm32 — trzy różne wyniki w ostatnich bitach. Dotyczy to współczynników każdego biquada RBJ (tan, cos), jądra sinc w rubato (sin), pYIN (log/exp), K-weightingu. Do tego WASM nie ma FMA, ARM64 ma, a relaxed-simd jest W SPECYFIKACJI niedeterministyczny. Crate libm daje ten sam kod źródłowy na wszystkich targetach, czyli realnie identyczne bity — to jedyny sposób, żeby zdanie 'port na Swift/Kotlin ma być przenoszeniem, nie pisaniem od nowa' było weryfikowalne.)
- zamiast *Startowanie kontenera z inferencją po zakończeniu nagrania, przy wymogu 'pierwszy tekst ≤60 s'* → **Inferencja W TRAKCIE nagrania: każda ukończona część multipart w R2 (8 MiB ≈ 54 s audio) wyzwala Queue → Workflow → kontener. Kontener startuje spekulatywnie w momencie rozpoczęcia sesji.** (Cold start kontenera z ~1 GB wag ONNX plus inicjalizacja sesji ORT dla enkodera 622 MB na 4 vCPU to realnie 15-45 s, a Cloudflare podaje '1-3 s' tylko dla małych obrazów. Budżet 60 s zjada się na samym starcie. Materiał i tak leci do R2 progresywnie — spec to już ma. Uruchamianie ASR na bieżąco sprawia, że transkrypt jest gotowy w sekundach po naciśnięciu STOP zamiast po minutach, a koszt idle kontenera (12 GiB × 0,0000025 USD/GiB-s ≈ 0,11 USD/h) jest nieistotny wobec 0,93 USD za inferencję odcinka. Dodatkowo Cloudflare zastrzega, że instancja może zniknąć w dowolnym momencie ('no guarantee that any instance will run for any set period of time'), więc rozbicie na segmenty ~54 s jest i tak wymuszone przez idempotencję.)
- zamiast *Widok tekstowy renderowany z WordTrack indeksowanego klatką w źródle* → **Widok tekstowy renderowany z PRZEJŚCIA PO KLIPACH OSI CZASU: dla każdego klipu w kolejności timeline_start → zapytanie interwałowe do WordTrack źródła po [source_in, source_in+len) → tokeny mieszczące się całe w klipie. Tokeny przecięte przez granicę klipu renderowane na szaro jako nieedytowalne. Struktura TimelineTextIndex przebudowywana inkrementalnie tylko dla dotkniętych klipów po każdej komendzie.** (To jest jedyny szew, na którym teza 'drugi widok na ten sam EDL' pęka, i spec go nie definiuje. Po RemoveRange z ripple odwzorowanie source→timeline nie jest monotoniczne, a po duplikacji klipu jedno źródłowe słowo istnieje na osi N razy. Przy renderowaniu z WordTrack nie wiadomo, co pokazać — i implementacja albo zduplikuje zdania, albo je zgubi, albo zdesynchronizuje kursor. Renderowanie z klipów rozwiązuje wszystkie trzy przypadki poprawnie i jest jednocześnie naturalnym miejscem, żeby pokazać użytkownikowi, że coś jest ucięte w środku słowa. Bez tej struktury undo w widoku tekstowym będzie się rozjeżdżać z undo na timeline mimo wspólnego command logu.)

<details><summary>Źródła</summary>

- [Apple App Store Review Guidelines (5.1.1 Data Collection, 5.1.2 Data Use, 2.5.14 Recording Disclosure, 4.2 Minimum Functionality, 3.1.1/3.1.2 IAP i subskrypcje)](https://developer.apple.com/app-store/review/guidelines/)
- [Apple App Privacy Details — kategorie etykiet, definicja 'collect', wyłączenie przetwarzania on-device](https://developer.apple.com/app-store/app-privacy-details/)
- [Google Play — Data Safety: definicje collected/shared, wyłączenie ephemeral i on-device, typ 'Voice or sound recordings', szyfrowanie w tranzycie, mechanizm usuwania](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Android — Foreground service types: microphone (FOREGROUND_SERVICE_MICROPHONE), mediaPlayback, wymóg deklaracji w Play Console](https://developer.android.com/develop/background-work/services/fgs/service-types)
- [Google Play — Families policy: target audience, neutralny ekran wieku, zakaz AAID, Families Self-Certified Ads SDKs](https://support.google.com/googleplay/android-developer/answer/9893335)
- [Google Play — Permissions and APIs that Access Sensitive Information](https://support.google.com/googleplay/android-developer/answer/9888170)
- [RODO art. 9 — dane biometryczne objęte wyłącznie 'for the purpose of uniquely identifying a natural person'](https://gdpr-info.eu/art-9-gdpr/)
- [EU AI Act art. 5 — zakaz wnioskowania o emocjach w miejscu pracy i instytucjach edukacyjnych (obowiązuje od 2 lutego 2025)](https://artificialintelligenceact.eu/article/5/)
- [Android — Window size classes: progi compact/medium/expanded i rekomendowane komponenty nawigacji](https://developer.android.com/guide/topics/large-screens/support-different-screen-sizes)
- [One Euro Filter (Casiez, Roussel, Vogel, CHI 2012) — parametry fcmin/beta/dcutoff i procedura strojenia](https://gery.casiez.net/1euro/)
- [Vocal range / tessitura — rozróżnienie zakresu od tessitury jako podstawy klasyfikacji głosu](https://en.wikipedia.org/wiki/Vocal_range)
- [Overjustification effect / Deci, Koestner & Ryan — kiedy nagrody podkopują motywację wewnętrzną, a kiedy nie](https://en.wikipedia.org/wiki/Overjustification_effect)
- [Spaced repetition — zakres dowodów dla efektu odstępów i luka dowodowa dla umiejętności motoryczno-percepcyjnych](https://en.wikipedia.org/wiki/Spaced_repetition)
- [Okabe & Ito — Color Universal Design, paleta bezpieczna dla daltonistów](https://jfly.uni-koeln.de/color/)

</details>

---

## Wspoldzielony rdzen obliczeniowy Vocal Coach i jego wpiecie w trzy natywne aplikacje (web TS/React, iOS Swift, Android Kotlin)

**Werdykt:** Rdzen w Rust, ale rozbity na DWA TIERY o roznych kontraktach: `vc-core-rt` (`#![no_std]`, zero alokacji, zero C/C++, wylacznie `libm`, bit-identyczny na wszystkich trzech targetach) i `vc-core-off` (`std`, alokacja wolna, linkuje C++ signalsmith-stretch, inferencja przez tract). Ta granica nie jest estetyczna - wynika z dwoch twardych faktow: rustc dokumentuje, ze `wasm32-unknown-unknown` "has no C/C++ toolchain", a Rust std dokumentuje, ze `sin/cos/exp/powf` maja "precision non-deterministic... varies by platform, Rust version". FFI tez jest dwutierowe: goraca sciezka to goly `extern "C"` + POD + wait-free ring (uniffi jest tu zdyskwalifikowane wlasna dokumentacja - serializuje zlozone typy do alokowanego `RustBuffer` per wywolanie), a zimna sciezka to uniffi 0.32.0, bo generuje model EDL/scoring rownoczesnie dla Swift i Kotlin, co eliminuje dryf modelu miedzy platformami. Na web rdzen RT laduje sie do AudioWorkletu jako surowy cdylib BEZ wasm-bindgen (blocker #2367: brak `TextEncoder`/`TextDecoder` w `AudioWorkletGlobalScope`), przez `WebAssembly.Module` przekazany w `processorOptions` i synchroniczne `new WebAssembly.Instance` - legalne, bo worklet nie jest watkiem UI. SharedArrayBuffer i COOP/COEP sa OPCJONALNA optymalizacja wlaczana per-sciezka, nie wymogiem. Inferencja ML idzie przez tract 0.23.4 (czysty Rust, produkcja w Sonos), nie przez ONNX Runtime - bo ORT daje rozne wyniki na roznych execution providerach (CoreML EP ma float16 accumulation), co czyni testy rownowaznosci Tier 0 niemozliwymi, a jego `ort-wasm-simd-threaded.wasm` wazy 12,86 MB przy modelu 0,38 MB.

### Decyzje

| Pytanie | Rozstrzygnięcie | Dlaczego | Odrzucone |
|---|---|---|---|
| Jezyk rdzenia: Rust vs C++ vs C | RUST. Nie z powodu utrzymania, a z czterech mierzalnych powodow: (1) `wasm32-unknown-unknown` to target tier-2 dostepny przez `rustup target add`, produkujacy modul BEZ JS-glue i BEZ importow - jedyny sposob, zeby zrobic synchroniczna instancjacje wewnatrz AudioWorkletGlobalScope; (2) `#![no_std]` mechanicznie USUWA alokator z systemu typow - `Vec::push` sie nie kompiluje, co jest compile-time dow | Decydujacy jest punkt (3) w polaczeniu z (2). Wymagana jest bitowa rownowaznosc wyniku na trzech targetach - to determinuje, ze rdzen nie moze uzywac platformowego libm ani pozwalac kompilatorowi na kontrakcje FMA. W Rust to stan domyslny gwarantowany przez jezyk. W C++ `-ffp-contract=fast` jest domyslne dla clanga w wielu trybach, wiec ten sam kod skompilowany przez Apple clang (arm64), NDK clang | C++ ODRZUCONE: domyslne `-ffp-contract=fast` w clangu, brak mechanizmu zakazania alokacji (nie da sie usunac `operator new`), dla wasm wymaga Emscripten (dodatkowy SDK + nieusuwalny JS-glue, ktory laduje w worklecie jako Pattern A) albo wasi-sdk, a dojrzale biblioteki DSP, ktore bysmy chcieli, sa objete GPL/LGPL/AGPL lub dual-commercial (Rubber Band: GPL albo licencja platna). NIE odrzucone za tru |
| Jak rdzen linkuje istniejace biblioteki C/C++ (time-stretch) i jak to wplywa na build | C/C++ NIE MOZE istniec w tierze RT. Powod jest cytowalny z dokumentacji rustc dla `wasm32-unknown-unknown`: 'This target currently has no equivalent in C/C++. There is no C/C++ toolchain for this target', z rekomendacja przejscia na `wasm32-unknown-emscripten` albo `wasm32-wasip1`. Dlatego: `vc-core-rt` = 0 zaleznosci C/C++, buduje sie do `wasm32-unknown-unknown` jako import-free cdylib. `vc-core- | To nie jest kompromis - to wlasciwa granica produktowa. Live pitch correction w torze monitorowym na web jest i tak bez sensu: round-trip AudioWorklet + getUserMedia to 35-180 ms, a nie da sie spiewac do wlasnego glosu opoznionego o tyle. Wiec na web time-stretch nalezy do renderu offline (Worker), gdzie wasip1 + shim `wasi_snapshot_preview1` jest w porzadku. Na iOS/Android ten sam crate laduje do | Emscripten dla calego rdzenia ODRZUCONE: wymusza JS-glue, ktory w AudioWorklecie dziala tylko w Pattern A z `-s SINGLE_FILE=1`, powieksza modul o rzedy wielkosci i pociaga wlasne libm (a wiec wlasne wyniki `sin`), lamiac par. 7. Przepisanie signalsmith-stretch do Rust NIE ODRZUCONE, ale nierekomendowane teraz: to algorytm z kompensacja formantow dopracowany przez autora, a nasza przewaga nie lezy  |
| Granica rdzenia: co wchodzi, co zostaje natywne | WCHODZI: pelny tor F0 (YIN-FFT kandydaci -> integracja po priorze Beta pYIN -> siatka 10 centow / 490 binow + unvoiced -> fixed-lag Viterbi), fuzja voicingu z 5 cech, segmentacja nut przez histereze na konturze centow, forced alignment do melodii referencyjnej (Needleman-Wunsch), detekcja vibrata, scoring z rozkladem na offset tonacji O(t) i residuum r_i, martwe strefy JI, VRP/zakres glosu, WSZYST | Granica biegnie tam, gdzie trzy platformy nie maja czesci wspolnej wartej abstrahowania. AudioWorklet+getUserMedia, AVAudioEngine+AVAudioSession i Oboe+AAudio maja calkowicie rozne modele przerwan, zmian trasy i uprawnien; wspolne API dla nich to najgorszy wspolny mianownik trzech systemow. Odwrotnie: EDL z undo/redo MUSI byc w rdzeniu, bo dokladnie te same semantyki cofania musza istniec na trzec | Abstrakcja audio I/O w rdzeniu (typu cpal) ODRZUCONA: cpal nie istnieje na web ani na iOS w formie nadajacej sie do AVAudioSession, a przerwania iOS ('interrupted' state), zmiany trasy i HFP-drop do 16 kHz wymagaja platformowej obslugi, ktorej nie da sie sensownie schowac. Storage w rdzeniu ODRZUCONE: OPFS ma synchroniczne API tylko w workerze, iOS ma klasy ochrony danych, Android ma scoped storag |
| Ksztalt API RT: push czy pull | PUSH. Host wola `vc_rt_push(handle, input_ptr, frames, monitor_out_ptr)` raz na blok. Zero callbackow, zero wskaznikow do funkcji przez FFI, wylacznie POD. Zdarzenia wychodza przez wait-free SPSC ring (`rtrb` 0.3.4, MIT/Apache, `no_std`-capable) umieszczony WEWNATRZ bloku stanu, ktorego pamiec przydziela HOST: `vc_rt_state_size(cfg)` -> `vc_rt_init(mem, len, cfg)`. Rdzen nigdy nie alokuje. Odczyt: | Pull wymaga, zeby rdzen wolal z powrotem do hosta na kazdy blok. Na Androidzie to znaczy JNI z watku RT - a `AttachCurrentThread`, `GetPrimitiveArrayCritical` i kazda alokacja obiektu Java moga zablokowac na GC, co lamie kontrakt Oboe wprost. Na web pull dodaje import do modulu i trampoline do JS, co niszczy wlasnosc 'import-free', na ktorej opiera sie synchroniczna instancjacja w worklecie. Push  | Pull z callbackiem ODRZUCONY (JNI na watku RT, import w module wasm). Przekazywanie zdarzen przez `port.postMessage` jako JEDYNY mechanizm ODRZUCONE jako projekt bazowy - structured clone alokuje na watku audio; dopuszczone tylko jako fallback web bez izolacji, i wtedy z pula pre-alokowanych ArrayBufferow transferowanych O(1) tam i z powrotem, zeby nie bylo kopiowania danych. Zwracanie `Result`/`O |
| FFI iOS: uniffi vs swift-bridge vs cbindgen+module map | DWUTIEROWO. Goraca sciezka: cbindgen 0.29.4 -> naglowek C + `module.modulemap`, wolane jako symbol C. Zimna sciezka (EDL, biblioteka sesji, raporty scoringowe, migracje): uniffi 0.32.0. swift-bridge nie jest uzywany nigdzie. | uniffi jest zdyskwalifikowane z RT jego wlasna dokumentacja internals: 'Non-trivial types such as Strings, Optionals and Records, etc. are lowered to a byte buffer called a RustBuffer', z serializacja per wywolanie w formacie fixed-width big-endian. Alokacja plus zamiana kolejnosci bajtow co 2,67 ms jest nie do przyjecia. Na zimnej sciezce ten koszt jest bez znaczenia (wywolania per akcja uzytkown | swift-bridge ODRZUCONE, bo nie wygrywa NIGDZIE: jest tylko dla iOS, wiec i tak potrzebowalibysmy drugiego generatora dla Kotlina, co przywraca dokladnie ten dryf modelu, ktoremu uniffi zapobiega; jest w 0.x z 92 otwartymi issue i wymaga Swift 6.0+. Jego realna przewaga wydajnosciowa nad uniffi ('no object serialization, cloning, synchronization') dotyczy sciezki, na ktorej koszt wywolania i tak je |
| Czy wolno wolac Rusta z AURemoteIO render callback | TAK, i to jest zalecany ksztalt - pod SZESCIU warunkami: (1) wywolanie jest bezposrednim symbolem C / `@convention(c)`, nigdy metoda na klasie Swift; (2) uchwyt jest przechwycony jako `UnsafeMutableRawPointer` w strukturze, nie jako referencja do klasy - inaczej ARC moze zrobic retain/release w callbacku; (3) zero `Array`/`String`/`Dictionary`/`print`/`os_log` w bloku; (4) Rust jest zbudowany z `p | Apple wprost uzasadnia forme blokowa w dokumentacji `AURenderBlock`: 'All realtime operations are implemented using blocks to avoid Objective-C method dispatching and the possibility of blocking'. Zwykle wywolanie C to spelnia; metoda na klasie Swift nie, bo ARC moze zrobic retain. Dokumentacja `AVAudioSourceNode` dodaje: 'Depending on the audio engine's operating mode, call the block on real-time | Wywolywanie uniffi-generowanego Swifta z callbacku ODRZUCONE (RustBuffer + alokacja). Uzywanie `installTap` jako zrodla analizy ODRZUCONE (nie-RT, 4096 ramek). Zamkniecie klasy Swift w callbacku ODRZUCONE (ARC retain/release). |
| FFI Android: uniffi-kotlin vs JNI recznie vs cargo-ndk, i jak wpiac w Oboe | cargo-ndk 4.1.2 do budowania, uniffi-kotlin na zimnej sciezce, ~6 recznych funkcji JNI na lifecycle i dostep do ringu. W callbacku Oboe `onAudioReady` NIE MA ZADNEGO JNI - to jest ~40-liniowy shim C++, ktory wola `vc_rt_push` bezposrednio. Rust buduje sie jako `staticlib` i jest linkowany razem z Oboe i shimem w JEDNA `libvcshim.so` przez CMake/externalNativeBuild. ABI: arm64-v8a, armeabi-v7a, x86 | Kontrakt Oboe jest cytowalny i kategoryczny: 'You should never perform an operation which could block inside onAudioReady. Examples of blocking operations include: allocate memory using malloc() or new, file operations, network operations, use mutexes or other synchronization primitives, sleep, stop or close the stream'. JNI lamie to na kilka sposobow rownoczesnie. Jedna `.so` zamiast dwoch daje j | Rust jako osobny `cdylib` obok Oboe ODRZUCONE (dwa loady, brak dead-stripu przez granice). Odczyt zdarzen przez JNI z kopiowaniem tablic ODRZUCONY - zamiast tego jednorazowy `NewDirectByteBuffer` nad ringiem, wiec drain z Kotlina tez nie alokuje. `x86` (32-bit) pominiete - martwe ABI, tylko powieksza APK. |
| FFI web: wasm-bindgen vs wasm-pack, i jak zaladowac .wasm do AudioWorkletu bez fetch | Tier RT: SUROWY cdylib `wasm32-unknown-unknown`, BEZ wasm-bindgen, bez zadnego JS-glue, import-free. Tier offline: wasm-bindgen 0.2.126 w zwyklym Workerze, gdzie fetch istnieje. wasm-pack pominiete - `cargo build` + `wasm-bindgen-cli` + `wasm-opt` bezposrednio. WZORZEC LADOWANIA: na watku glownym `fetch` -> `WebAssembly.compile(bytes)` -> przekazanie gotowego `WebAssembly.Module` w `processorOptio | wasm-bindgen jest zdyskwalifikowane z AudioWorkletu udokumentowanym blockerem: issue rustwasm/wasm-bindgen#2367, cytat 'the major blocker is that TextEncoder and TextDecoder are not available within AudioWorklets'. Dodatkowo AudioWorkletGlobalScope dziedziczy z celowo minimalnego WorkletGlobalScope - nie ma tam fetch, XHR ani importScripts; jego wlasne czlony to tylko `currentFrame`, `currentTime` | Pattern A z artykulu Chrome (Emscripten `-s SINGLE_FILE=1` + `audioWorklet.addModule`) ODRZUCONY dla rdzenia Rust: dotyczy toolchainu Emscripten, ktorego nie uzywamy w tierze RT, i wnosi wlasne libm lamiace par. 7. wasm-pack ODRZUCONE: dodaje workflow publikacji npm, ktorego nie potrzebujemy, i ukrywa flagi, ktore potrzebujemy (`-C target-feature=+simd128`, wybor `--target web` vs `--no-modules`). |
| Czy potrzebny SharedArrayBuffer i COOP/COEP | NIE JAKO WYMOG - tylko jako opcjonalna szybka sciezka wlaczana PER SCIEZKA URL, nie na cala domene. Bez SAB zdarzenia wychodza przez `port.postMessage(pooledBuffer, [pooledBuffer])` co 8 kwantow (21,3 ms, ~4 zdarzenia x 32 B = 128 B), z transferem O(1) i zwrotem bufora do puli. Z SAB: zero komunikatow. Watki wasm calkowicie POZA zakresem - tier offline paralelizuje sie przez wiele Workerow, kazdy  | `COEP: require-corp` blokuje kazdy cross-origin subresource i iframe w trybie no-cors - to zabija iframe YouTube w karaoke i kazda zewnetrzna czcionke/analitykę. `COEP: credentialless` omija wymog CORP, ale nie jest w Safari, a Safari to JEDYNY silnik na iOS. Poniewaz COOP i COEP sa naglowkami per-dokument, mozna izolowac `/train/*` i `/studio/*` i zostawic `/`, `/karaoke/*` i strony marketingowe  | Site-wide COOP/COEP ODRZUCONE (zabija karaoke i zewnetrzne zasoby, Safari bez credentialless). Uzaleznienie jakiejkolwiek funkcji od `crossOriginIsolated` ODRZUCONE - kod SAB jest zawsze bramkowany runtime'owo przez `self.crossOriginIsolated` z pelnym fallbackiem. Watki wasm (`+atomics,+bulk-memory`) ODRZUCONE: wymagaja SAB, a wiec izolacji, a rdzen RT jest jednowatkowy z zalozenia. |
| Dystrybucja modeli ML: ONNX Runtime czy wlasna inferencja | tract 0.23.4 (MIT OR Apache-2.0), czysty Rust, jeden plik `.opl` (tract-OPL / NNEF) skonwertowany z ONNX na CI. ZERO ONNX Runtime na jakiejkolwiek platformie. API rdzenia to `vc_nn_load(bytes, len)` - BAJTY, nigdy sciezka. Model: SwiftF0 (95 842 parametry, 16 kHz, hop 256 = 16 ms, zakres 46,875-2093,75 Hz, kod i wagi MIT, 91,80% HM przy 10 dB SNR, ~42x szybszy niz CREPE). Zyje w tierze OFFLINE jak | ORT nie moze spelnic par. 7. Jego CoreML EP ma opcje `AllowLowPrecisionAccumulationOnGPU` (akumulacja float16), a dokumentacja mowi, ze tryb CPU-only 'decreases performance but provides reference output value without precision loss, which is useful for validation' - czyli sciezka ANE/GPU jest jawnie stratna. Na Androidzie dostaniesz NNAPI/XNNPACK, na web WASM-SIMD. Trzy rozne sciezki numeryczne oz | ONNX Runtime ODRZUCONY z powodow numerycznych (rozne EP = rozne wyniki = Tier 0 niemozliwy) i rozmiarowych (12,86 MB runtime na 0,38 MB model). `tract-onnx` w runtime ODRZUCONY - ma 13 zaleznosci normalnych w tym `prost` (protobuf) i `memmap2` (wrogi wasm); konwersja ONNX->OPL idzie na CI, a runtime dostaje tylko `tract-core` + `tract-nnef`, co tract dokumentuje jako cel istnienia OPL ('minimize r |
| Testy rownowaznosci: jak zagwarantowac identyczne wyniki na wasm / arm64-apple / arm64-android | TIER 0 BITOWA ROWNOSC, zero tolerancji, dla calego `vc-core-rt`. Jest to osiagalne, bo spec WebAssembly w pelni specyfikuje `f32.add/sub/mul/div/sqrt` per IEEE 754 z 'round-to-nearest ties-to-even', a jedynym niedeterminizmem sa payloady NaN; a RFC 3514 Rusta odrzuca fast-math domyslnie ('Providing strict IEEE 754-2008 guarantees precludes many transformations, such as turning a*b + c into FMA ope | Bitowa rownosc nie jest perfekcjonizmem - jest jedyna tolerancja, ktora naprawde chroni. 'Tolerancja 0,1 centa' ukrywa systematyczna rozbieznosc, ktora bedzie rosla i ujawni sie jako 'web mowi 87, iOS mowi 84 na tym samym take' - a wtedy zaufanie do oceny jest skonczone. Poniewaz gwarancje jezyka i specyfikacji wasm daja bitowa rownosc DARMO dla kodu zlozonego z `+ - * / sqrt`, jedyne co trzeba zr | Tolerancja procentowa jako podstawowa metryka ODRZUCONA (maskuje dryf systematyczny). Hand-written SIMD i `core::arch` w tierze RT ODRZUCONE (kolejnosc redukcji zmienia zaokraglenie). `codegen-units > 1` ODRZUCONE (niedeterministyczna kolejnosc optymalizacji). `#[cfg(target_arch)]` w `vc-core-rt` ZABRONIONE i weryfikowane grepem w CI - ma istniec dokladnie jedna sciezka kodu. Ustawianie FPCR.FZ /  |

### Specyfikacja

## 0. Struktura decyzji w jednym akapicie

Rdzen jest w Rust i jest **podzielony na dwa tiery o roznych kontraktach**, bo dwa niezalezne fakty techniczne wymuszaja te sama linie ciecia:

1. rustc o `wasm32-unknown-unknown`: *"This target currently has no equivalent in C/C++. There is no C/C++ toolchain for this target"* -> C++ nie moze byc w module, ktory laduje do AudioWorkletu.
2. Rust std o `f32::sin/cos/exp/powf`: *"The precision of this function is non-deterministic. This means it varies by platform, Rust version, and can even differ within the same execution from one invocation to the next"* -> bitowa rownowaznosc wymaga `#![no_std]` + wlasnego libm.

Te dwie granice pokrywaja sie, wiec sa jedna granica.

```
vc-core-rt    #![no_std] | libm only | zero alloc | zero C/C++ | zero importow wasm
              -> wasm32-unknown-unknown  (surowy cdylib, bez wasm-bindgen)
              -> aarch64-apple-ios / -sim / x86_64-apple-ios
              -> aarch64-linux-android / armv7-linux-androideabi / x86_64-linux-android
              -> host (testy)
              KONTRAKT: BIT-IDENTYCZNY na wszystkich targetach. Tier 0.

vc-core-off   std | alloc OK | C++ OK (signalsmith-stretch) | tract NN
              -> wasm32-wasip1 (wasi-sdk >=33 dla C++), uruchamiany w Workerze
              -> te same targety native
              KONTRAKT: Tier 1 (1 LSB 24-bit) / Tier 2 (metryki MIR).
```

---

## 1. Jezyk rdzenia — argumentacja punktowa

| Kryterium | Rust | C++ | C |
|---|---|---|---|
| wasm bez dodatkowego SDK | **TAK** (`rustup target add wasm32-unknown-unknown`, tier 2) | NIE (Emscripten albo wasi-sdk) | NIE |
| wasm bez JS-glue / import-free | **TAK** (surowy cdylib) | NIE (Emscripten zawsze dokleja glue) | NIE |
| Mechaniczny zakaz alokacji | **TAK** — `#![no_std]` usuwa alokator z systemu typow; `Vec::push` sie nie kompiluje | NIE — nie da sie usunac `operator new`, zostaje code review | NIE |
| FP strict-IEEE domyslnie | **TAK** — RFC 3514, brak stabilnej flagi fast-math | NIE — `-ffp-contract=fast` domyslne w clangu | NIE |
| Deterministyczne transcendentale | **TAK** — `libm` 0.2.16 (MIT, port musl, czysty Rust) | Trzeba wendorowac musl samemu | jak C++ |
| FFI do Swift | `extern "C"` + module map (identycznie jak C) | `extern "C"` + module map | to samo |
| FFI do Kotlin | JNI (identycznie dla wszystkich trzech) | JNI | JNI |
| Permisywne biblioteki DSP/ML | **rustfft 6.4.1, realfft 3.5.0, rtrb 0.3.4, rubato 4.0.0, tract 0.23.4** — wszystkie MIT/Apache | aubio GPL-3, essentia AGPL-3, Rubber Band GPL/platna, SoundTouch LGPL-2.1, Soundpipe (Csound taint) | — |
| Linkowanie istniejacego C++ | `cc` 1.4.0 + `bindgen` 0.72.1 na native; na wasm wymaga wasip1 + wasi-sdk | natywne | natywne |

**Werdykt: Rust.** Rozstrzygaja wiersze 2, 3, 4 i 5, nie wiersz "utrzymanie".

### Koszt Rusta, ktory jest realny i jak go placimy
`wasm32-unknown-unknown` nie linkuje C/C++. Placimy przez rozbicie na tiery. Tier offline na web idzie na `wasm32-wasip1`, ktory rustc opisuje jako *"This target explicitly supports interop with non-Rust code such as C and C++"*, z prekompilowanym `wasi-libc` i rekomendacja `wasi-sdk` >= 33 dla `staticlib`. Modul importuje `wasi_snapshot_preview1` — w przegladarce daje sie to obsluzyc shimem ~60 linii (`proc_exit`, `fd_write`, `random_get`, `clock_time_get`, `environ_sizes_get`).

---

## 2. Granica rdzenia

### W RDZENIU (tier RT — `vc-core-rt`)
| Modul | Zawartosc | Parametry |
|---|---|---|
| `vc-num` | shim libm, konwersje Hz<->centy, sumy o ustalonej kolejnosci | `cent(f) = 1200*log2(f/440) + 5700` |
| `vc-dsp` | biquady RBJ (wlasne wspolczynniki, nie BiquadFilterNode), kompresor z knee+makeup, de-esser, ekspander, FDN reverb 8x8/16x16, limiter, dithering TPDF, RMS, BS.1770-4 K-weighting + gated LUFS (M/S/I) + LRA + true peak 4x, decymator polyphase FIR 48k->16k | LP 7,2 kHz, >=60 dB w pasmie zaporowym; gating -70 LUFS abs + -10 LU rel |
| `vc-f0` | YIN-FFT generator kandydatow (funkcja roznicowa przez FFT, staly integration window W = MAX_PERIOD), integracja po priorze Beta(2,18) po 100 progach 0,01..1,00, siatka 10 centow (490 binow voiced + unvoiced), fixed-lag Viterbi, fuzja voicingu z 5 cech | fs 48000, frame 2048 (42,67 ms), hop 512 (10,67 ms, 93,75 fps), fmin 65 Hz, fmax 1100 Hz, maxLag 738, minLag 43,6, lag Viterbi L=24 (256 ms) lub 14 (149 ms), przejscie Laplace sigma=60 c + podloga 0,02, okno +-40 binow, koszt v<->uv 0,14 nata |
| `vc-notes` | segmentacja przez histereze na konturze centow (SiPTH), forced alignment Needleman-Wunsch do melodii referencyjnej, detekcja i pomiar vibrata | histereza 60/100 centow, dwell 60 ms, min nuta 100 ms, skip_head 40..min(150, 0,3*dur) ms, vibrato 4,0-9,0 Hz, wymagane >=500 ms stanu ustalonego |
| `vc-score` | martwe strefy JI per stopien skali, rozklad e_i = O(t) + r_i, agregat geometryczny | tol_base 25 c, d0: pryma/oktawa 12, kwinta 14, tercja wielka 26, tercja mala 28; O(t): mediana z 6 nut, EMA tau 3 s, slew 8 c/s, clamp 60 c, zamrozenie przy MAD > 40 c; raw = P^0.45 * C^0.25 * S^0.15 * T^0.15 |
| `vc-viewmodel` | ring -> draw-list (polyline/rect/glyph, wspolrzedne 0..1 + rola semantyczna), One Euro Filter, median-3 w centach | median-3 (16 ms) -> One Euro (fcmin 1,5 Hz, beta 0,01, dcutoff 1,0 Hz) |
| `vc-core-rt` | fasada `extern "C"`, ring `rtrb`, bump allocator | — |

### W RDZENIU (tier offline — `vc-core-off`)
`vc-edl` (niezmienny EDL, log komend, undo/redo, UUIDv7, tombstony), `vc-project` (DDL SQLite + migracje jako `&str`), `vc-midi` (port `lib/midi-parser.ts`), `vc-peaks` (piramida LOD, 1 poziom na x4 zoomu), `vc-nn` (tract-core + tract-nnef, loader OPL, SwiftF0), `vc-render` (mixdown offline, linkuje signalsmith-stretch), matematyka kalibracji latencji.

### NATYWNE
Audio I/O i cykl zycia sesji audio; uprawnienia; tryby tla / foreground service; **wykonanie** storage (uchwyty plikow — rdzen dostaje i oddaje slice bajtow); siec, auth, platnosci; cale UI i cala rasteryzacja.

### Reguly brzegowe rdzenia (nienaruszalne)
1. Rdzen nie dotyka zegara scienno-czasowego. **Wszystkie czasy to indeksy probek.**
2. Rdzen nie alokuje na sciezce RT (gwarantowane `#![no_std]`).
3. Rdzen nie robi I/O.
4. Rdzen nie zwraca stringa z goracej sciezki.
5. Rdzen akceptuje **dowolny rozmiar bloku** i daje identyczny wynik (Oboe daje 96/128/160/192/240/256/512, AudioWorklet daje 128, iOS daje to, co wynegocjuje `preferredIOBufferDuration`).

### Co ta granica strukturalnie usuwa z audytu
| Bug z audytu | Dlaczego przestaje istniec |
|---|---|
| playhead/linijka/klipy nie pokrywaja sie (4 bledy geometrii) | jeden zegar = indeks probki, konwersja w jednym miejscu |
| prog trafienia zalezny od czestotliwosci odswiezania | scoring per nuta, hop staly w rdzeniu, rAF nie uczestniczy |
| automatyka na rAF zamarza w tle | automatyka schedulowana w rdzeniu po indeksie probki |
| globalny mutowalny detektor bez resetu | jeden `handle` = jedna sesja, `vc_rt_reset` |
| O(n^2) kopiowanie pitchHistory 60x/s + setState | ring o stalej pojemnosci, brak setState per ramka |
| naiwny DFT O(N^2) 26,9 ms/ramke | YIN-FFT: funkcja roznicowa przez FFT, ~0,2-0,6 ms/ramke |
| brak undo w multitracku / undo kasuje audio | jeden `vc-edl` z logiem komend, edycja niedestrukcyjna |
| zero testow, niedzialajacy lint | harness `vc-equiv` jako bramka merge |

---

## 3. API rdzenia RT — konkretny szkic

### Rust

```rust
#![no_std]
// core/crates/vc-core-rt/src/lib.rs

#[repr(C)]
pub struct VcRtConfig {
    pub sample_rate_hz: f32,     // 48000.0 wymagane; rdzen odrzuca inne z kodem -3
    pub max_block_frames: u32,   // najwiekszy blok, jaki host kiedykolwiek poda
    pub hop_frames: u32,         // 512 -> 10,667 ms
    pub window_frames: u32,      // 2048
    pub fmin_hz: f32,            // 65.0
    pub fmax_hz: f32,            // 1100.0
    pub profile: u32,            // 0 = SING, 1 = SPEECH
    pub decode_lag_frames: u32,  // 24 -> 256 ms tier "committed"
    pub flags: u32,              // b0 monitor chain, b1 loudness, b2 clip detect
    pub event_ring_capacity: u32,// 4096
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct VcEvent {             // 32 B, POD, layout stabilny w ABI
    pub kind: u16,   // 1 F0_LIVE 2 F0_COMMITTED 3 NOTE_ON 4 NOTE_OFF
                     // 5 LEVEL 6 CLIP 7 LOUDNESS 8 VIBRATO 9 FAULT
    pub flags: u16,  // b0 voiced, b1 in_tolerance, b2 nonfinite_rejected
    pub frame_index: u64, // indeks probki SRODKA okna analizy
    pub a: f32, pub b: f32, pub c: f32, pub d: f32,
    // F0_*: a=Hz b=centy c=confidence d=RMS_dBFS
    // NOTE_ON: a=target_cents b=sung_median_cents c=dev_cents d=dur_ms
    // VIBRATO: a=rate_Hz b=extent_cents c=regularity d=n_periods
}

// ---------- lifecycle: alokacja DOZWOLONA, NIE wolac z watku audio ----------
#[no_mangle] pub extern "C" fn vc_core_abi_version() -> u32;
#[no_mangle] pub extern "C" fn vc_core_numeric_epoch() -> u32;
#[no_mangle] pub extern "C" fn vc_rt_state_size(cfg: *const VcRtConfig) -> usize;
#[no_mangle] pub extern "C" fn vc_rt_init(mem: *mut u8, len: usize,
                                          cfg: *const VcRtConfig) -> i32;
#[no_mangle] pub extern "C" fn vc_rt_reset(h: *mut u8);

// ---------- goraca sciezka: wait-free, zero alloc, zero locks, zero panic ----
/// input: mono f32. monitor_out: moze byc null; jesli nie-null, rdzen wpisuje
/// tor monitorowy (2 kanaly interleaved, frames*2 f32).
/// Zwraca liczbe zdarzen dostepnych do odczytu.
#[no_mangle] pub extern "C" fn vc_rt_push(h: *mut u8,
                                          input: *const f32, frames: u32,
                                          monitor_out: *mut f32) -> u32;

// ---------- drain: fallback (web bez SAB). Wolane z TEGO SAMEGO watku ----------
#[no_mangle] pub extern "C" fn vc_rt_drain(h: *mut u8, out: *mut VcEvent,
                                           cap: u32) -> u32;

// ---------- zero-copy: bezposredni odczyt ringu (iOS/Android/SAB) ----------
#[no_mangle] pub extern "C" fn vc_rt_ring_ptr(h: *mut u8) -> *mut VcEvent;
#[no_mangle] pub extern "C" fn vc_rt_ring_cap(h: *mut u8) -> u32;
#[no_mangle] pub extern "C" fn vc_rt_ring_write_seq(h: *mut u8) -> u64; // Acquire
#[no_mangle] pub extern "C" fn vc_rt_ring_ack(h: *mut u8, seq: u64);    // Release

// ---------- kalibracja latencji: wspolna dla trzech platform ----------
#[no_mangle] pub extern "C" fn vc_calibrate_latency(reference: *const f32, n_ref: u32,
                                                    recorded: *const f32, n_rec: u32,
                                                    out_frames: *mut i32,
                                                    out_confidence: *mut f32) -> i32;

// ---------- bump allocator dla web (host nie ma malloc w worklecie) ----------
#[no_mangle] pub extern "C" fn vc_bump_reset();
#[no_mangle] pub extern "C" fn vc_bump_alloc(len: usize) -> *mut u8; // align 64
```

Profil buildu (identyczny dla **kazdego** targetu — to wymog par. 7, nie optymalizacja):

```toml
[profile.release]
opt-level = 3
lto = "fat"
codegen-units = 1        # >1 => niedeterministyczna kolejnosc optymalizacji
panic = "abort"
overflow-checks = false
debug-assertions = false
strip = "debuginfo"
```

### Swift

```swift
// apps/ios/Sources/Audio/RtSession.swift
import VcCoreFFI   // module map nad cbindgen'owym naglowkiem

/// STRUKTURA, nie klasa. Przechwytywana przez blok RT bez ARC.
struct RtHandle { let p: UnsafeMutablePointer<UInt8> }

final class RtSession {
    private let mem: UnsafeMutableRawPointer
    private let bytes: Int
    let handle: RtHandle
    /// bufor odczytu ringu — stored property, NIGDY alokowany w callbacku
    private var scratch = [VcEvent](repeating: VcEvent(), count: 4096)
    private var lastSeq: UInt64 = 0

    init(cfg: VcRtConfig) throws {
        guard vc_core_abi_version() == Self.expectedAbi else { throw CoreError.abiMismatch }
        var c = cfg
        bytes = vc_rt_state_size(&c)
        mem = UnsafeMutableRawPointer.allocate(byteCount: bytes, alignment: 64)
        let p = mem.assumingMemoryBound(to: UInt8.self)
        guard vc_rt_init(p, bytes, &c) == 0 else { throw CoreError.initFailed }
        handle = RtHandle(p: p)
    }
    deinit { mem.deallocate() }

    /// Watek UI / CADisplayLink. Czyta ring bezposrednio — wspolna przestrzen adresowa.
    func drain(_ body: (VcEvent) -> Void) {
        let base = vc_rt_ring_ptr(handle.p)!
        let cap  = UInt64(vc_rt_ring_cap(handle.p))
        let seq  = vc_rt_ring_write_seq(handle.p)   // atomic acquire w Rust
        var i = max(lastSeq, seq &- cap)
        while i < seq { body(base[Int(i % cap)]); i &+= 1 }
        lastSeq = seq
        vc_rt_ring_ack(handle.p, seq)
    }
}

// --- podlaczenie do grafu. AVAudioSinkNode = blok RT.
final class Engine {
    private let engine = AVAudioEngine()
    private var session: RtSession!

    func start() throws {
        let s = AVAudioSession.sharedInstance()
        try s.setCategory(.playAndRecord, mode: .measurement,
                          options: [.allowBluetoothA2DP, .defaultToSpeaker])
        try s.setPreferredSampleRate(48_000)
        try s.setPreferredIOBufferDuration(0.005)      // 256 ramek @48k
        try s.setActive(true)
        // request jest DORADCZY — weryfikuj:
        precondition(abs(s.sampleRate - 48_000) < 1, "HFP/BT zbil sampleRate")

        session = try RtSession(cfg: VcRtConfig(sample_rate_hz: Float(s.sampleRate), ...))
        let h = session.handle                          // wartosc, nie referencja

        let sink = AVAudioSinkNode { _, frameCount, audioBufferList in
            // ===== WATEK REAL-TIME. Zero ARC, zero alokacji, zero os_log. =====
            let abl = UnsafeMutableAudioBufferListPointer(
                        UnsafeMutablePointer(mutating: audioBufferList))
            guard let raw = abl[0].mData else { return noErr }
            _ = vc_rt_push(h.p, raw.assumingMemoryBound(to: Float.self),
                           frameCount, nil)
            return noErr
        }
        engine.attach(sink)
        engine.connect(engine.inputNode, to: sink, format: nil)
        try engine.start()
    }

    /// Zmierzona latencja round-trip wg systemu
    var systemRoundTripSeconds: Double {
        let s = AVAudioSession.sharedInstance()
        return s.inputLatency + s.outputLatency + s.ioBufferDuration
             + engine.inputNode.presentationLatency
    }
}
```

**Warunki, ktore czynia to legalnym w callbacku RT** (uzasadnienie: Apple o `AURenderBlock` — *"All realtime operations are implemented using blocks to avoid Objective-C method dispatching and the possibility of blocking"*; o `AVAudioSourceNode` — *"When rendering to a device, avoid making blocking calls within the block"*):
1. `vc_rt_push` to symbol C, nie metoda Swift (brak witness table, brak msgSend).
2. `h` jest **strukturą z surowym wskaznikiem**, przechwycona po wartosci -> zero retain/release.
3. W bloku nie ma `Array`, `String`, `Dictionary`, `print`, `os_log`, `DispatchQueue`.
4. Rust: `panic = "abort"` + `#![no_std]` -> brak alokacji i brak sciezki panicznej.

### Kotlin + C++ shim

```cpp
// apps/android/src/main/cpp/oboe_shim.cpp   — ZERO JNI w tym callbacku
#include <oboe/Oboe.h>
extern "C" {
  uint32_t vc_rt_push(uint8_t*, const float*, uint32_t, float*);
}

class VcCallback : public oboe::AudioStreamDataCallback {
public:
    explicit VcCallback(uint8_t* h) : h_(h) {}
    oboe::DataCallbackResult onAudioReady(oboe::AudioStream*, void* data,
                                         int32_t numFrames) override {
        vc_rt_push(h_, static_cast<const float*>(data),
                   static_cast<uint32_t>(numFrames), nullptr);
        return oboe::DataCallbackResult::Continue;
    }
private:
    uint8_t* h_;
};

extern "C" JNIEXPORT jlong JNICALL
Java_digital_arvind_sing_core_Rt_nativeOpen(JNIEnv*, jobject, jlong handlePtr) {
    auto* cb = new VcCallback(reinterpret_cast<uint8_t*>(handlePtr));
    oboe::AudioStreamBuilder b;
    std::shared_ptr<oboe::AudioStream> s;
    b.setDirection(oboe::Direction::Input)
     ->setPerformanceMode(oboe::PerformanceMode::LowLatency)   // wymagane dla low-lat
     ->setSharingMode(oboe::SharingMode::Exclusive)            // API 26+, bypass miksera
     ->setFormat(oboe::AudioFormat::Float)
     ->setChannelCount(1)
     ->setSampleRate(48000)
     ->setSampleRateConversionQuality(oboe::SampleRateConversionQuality::None)
     ->setInputPreset(oboe::InputPreset::VoiceRecognition)     // usuwa AGC/NS/AEC
     ->setDataCallback(cb);
    if (b.openStream(s) != oboe::Result::OK) return 0;
    // framesPerBurst jest READ-ONLY, ustawiony przez stream. Bufor = 2x burst.
    s->setBufferSizeInFrames(s->getFramesPerBurst() * 2);
    s->requestStart();
    return reinterpret_cast<jlong>(new std::shared_ptr<oboe::AudioStream>(s));
}

/// Ring udostepniony Kotlinowi RAZ jako direct buffer -> drain bez alokacji
extern "C" JNIEXPORT jobject JNICALL
Java_digital_arvind_sing_core_Rt_nativeRingBuffer(JNIEnv* env, jobject, jlong h) {
    auto* p = reinterpret_cast<uint8_t*>(h);
    return env->NewDirectByteBuffer(vc_rt_ring_ptr(p),
                                    (jlong)vc_rt_ring_cap(p) * 32);
}
```

```kotlin
// apps/android/src/main/java/.../core/Rt.kt
class Rt private constructor(private val handle: Long, private val stream: Long) {
    private val ring: ByteBuffer = nativeRingBuffer(handle)
        .order(ByteOrder.nativeOrder())          // WAZNE: native, nie BIG_ENDIAN
    private var lastSeq = 0L

    /** Watek UI. Zero alokacji. */
    fun drain(sink: (kind: Int, frame: Long, a: Float, b: Float, c: Float, d: Float) -> Unit) {
        val cap = nativeRingCap(handle).toLong()
        val seq = nativeRingWriteSeq(handle)
        var i = maxOf(lastSeq, seq - cap)
        while (i < seq) {
            val o = ((i % cap) * 32).toInt()
            sink(ring.getShort(o).toInt(), ring.getLong(o + 8),
                 ring.getFloat(o + 16), ring.getFloat(o + 20),
                 ring.getFloat(o + 24), ring.getFloat(o + 28))
            i++
        }
        lastSeq = seq; nativeRingAck(handle, seq)
    }
    companion object {
        init { System.loadLibrary("vcshim") }    // JEDNA .so: Rust + Oboe + shim
        @JvmStatic external fun nativeRingBuffer(h: Long): ByteBuffer
        // ...
    }
}
```

Kontrakt Oboe, ktorego to przestrzega (cytat): *"You should never perform an operation which could block inside `onAudioReady`. Examples of blocking operations include: allocate memory using malloc() or new, file operations, network operations, use mutexes or other synchronization primitives, sleep, stop or close the stream, or call read()/write() on the invoking stream."*

---

## 4. Web: ladowanie wasm do AudioWorkletu — dzialajacy wzorzec

### Dlaczego nie wasm-bindgen w worklecie
- `AudioWorkletGlobalScope` dziedziczy z celowo minimalnego `WorkletGlobalScope`. Jego wlasne czlony to **tylko** `currentFrame`, `currentTime`, `sampleRate`, `port`, `registerProcessor`. Nie ma `fetch`, `XMLHttpRequest`, `importScripts`.
- wasm-bindgen issue #2367, cytat: *"the major blocker is that `TextEncoder` and `TextDecoder` are not available within AudioWorklets."*

### Wzorzec (Pattern B z artykulu Chrome, zaadaptowany do surowego Rusta)

```ts
// apps/web/src/audio/rt-client.ts  — watek glowny
const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });

const simd = await wasmFeatureDetect.simd();
const url  = simd ? '/core/vc_core_rt.simd.wasm' : '/core/vc_core_rt.wasm';

const [bytes] = await Promise.all([
  fetch(url).then(r => r.arrayBuffer()),
  ctx.audioWorklet.addModule('/core/vc-processor.js'),
]);
// Kompilacja ASYNCHRONICZNA na watku glownym — poza sciezka krytyczna.
const wasmModule = await WebAssembly.compile(bytes);

// WebAssembly.Module jest structured-cloneable (MDN pokazuje worker.postMessage(mod)),
// wiec przechodzi przez processorOptions bez kopiowania kodu.
const node = new AudioWorkletNode(ctx, 'vc-rt', {
  numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
  processorOptions: {
    wasmModule,
    cfg: { sampleRateHz: ctx.sampleRate, hopFrames: 512, windowFrames: 2048,
           fminHz: 65, fmaxHz: 1100, profile: 0, decodeLagFrames: 24,
           maxBlockFrames: 1024, eventRingCapacity: 4096 },
    // SAB jest OPCJONALNY. Zawsze bramkowany runtime'owo.
    sab: self.crossOriginIsolated ? new SharedArrayBuffer(4096 * 32 + 64) : null,
  },
});
```

```js
// apps/web/public/core/vc-processor.js  — AudioWorkletGlobalScope
const EVT = 32;                       // sizeof(VcEvent)
const CHUNK = 64 * EVT;

class VcRt extends AudioWorkletProcessor {
  constructor({ processorOptions: { wasmModule, cfg, sab } }) {
    super();
    // SYNCHRONICZNA instancjacja. Legalna: MDN wiaze RangeError dla duzych
    // buforow z "the UI thread", a to nie jest watek UI.
    // Rdzen jest IMPORT-FREE, wiec importObject jest pusty (asertowane w CI).
    this.x = new WebAssembly.Instance(wasmModule, {}).exports;

    // ===== CALA pamiec przydzielana TERAZ. memory.buffer nigdy nie rosnie
    // po tym punkcie, bo growth odczepia wszystkie widoki. =====
    this.x.vc_bump_reset();
    const cfgPtr = this.x.vc_bump_alloc(48);
    this.writeCfg(cfgPtr, cfg);
    const need = this.x.vc_rt_state_size(cfgPtr);
    this.h = this.x.vc_bump_alloc(need);
    if (this.x.vc_rt_init(this.h, need, cfgPtr) !== 0) throw new Error('core init');

    const MAXB = 1024;
    this.inPtr  = this.x.vc_bump_alloc(MAXB * 4);
    this.outPtr = this.x.vc_bump_alloc(MAXB * 4 * 2);
    this.evPtr  = this.x.vc_bump_alloc(CHUNK);

    const buf = this.x.memory.buffer;
    this.growCheck = buf.byteLength;
    this.inV   = new Float32Array(buf, this.inPtr, MAXB);
    this.outL  = new Float32Array(buf, this.outPtr, MAXB);
    this.outR  = new Float32Array(buf, this.outPtr + MAXB * 4, MAXB);
    this.evV   = new Uint8Array(buf, this.evPtr, CHUNK);

    this.sabHdr = sab ? new Int32Array(sab, 0, 16) : null;
    this.sabEvt = sab ? new Uint8Array(sab, 64)    : null;
    // Pula transferowalnych buforow — transfer jest O(1), bez kopiowania danych.
    this.pool = [new ArrayBuffer(CHUNK), new ArrayBuffer(CHUNK)];
    this.port.onmessage = e => { if (e.data.ret) this.pool.push(e.data.ret); };
    this.q = 0;
  }

  process(inputs, outputs) {
    const ch = inputs[0][0];
    if (!ch) return true;
    // sanity: pamiec nie moze byc urosla
    if (this.x.memory.buffer.byteLength !== this.growCheck) return false;

    this.inV.set(ch);                                       // 128 ramek
    this.x.vc_rt_push(this.h, this.inPtr, ch.length, this.outPtr);

    const o = outputs[0];
    if (o[0]) o[0].set(this.outL.subarray(0, ch.length));
    if (o[1]) o[1].set(this.outR.subarray(0, ch.length));

    if (this.sabEvt) {
      this.copyRingToSab();                                 // sciezka bez komunikatow
    } else if (++this.q === 8) {                            // 8 * 2,67 = 21,3 ms
      this.q = 0;
      const n = this.x.vc_rt_drain(this.h, this.evPtr, 64);
      if (n) {
        const b = this.pool.pop();
        if (b) { new Uint8Array(b).set(this.evV.subarray(0, n * EVT));
                 this.port.postMessage({ evt: b, n }, [b]); }
      }
    }
    return true;
  }
}
registerProcessor('vc-rt', VcRt);
```

### Rekoncyliacja 128 ramek vs okno 2048 / hop 512
**W rdzeniu, nie w JS.** Rdzen ma wlasny ring wejsciowy i wyzwala analize, gdy zbierze `hop_frames`. Powod: Oboe daje 96/128/160/192/240/256/512, iOS daje co wynegocjuje `preferredIOBufferDuration`, AudioWorklet daje 128. Gdyby framing robil shell, kazda platforma miala by inny — i jest to **osobny golden test** (`corpus/blocks/`), ze rdzen daje identyczne wyniki przy losowej sekwencji rozmiarow blokow. Artykul Chrome opisuje ten sam wzorzec ring-buffera, ale w JS; przeniesienie go do rdzenia jest tym, co daje rownowaznosc miedzy platformami.

### SharedArrayBuffer / COOP-COEP — werdykt
**Nie jest wymagany. Opcjonalna szybka sciezka, wlaczana per-sciezka URL.**

| | `unsafe-none` | `require-corp` | `credentialless` |
|---|---|---|---|
| cross-origin no-cors (iframe YouTube, fonty, analityka) | dziala | **BLOKOWANE** | dziala (bez cookies) |
| `crossOriginIsolated` / SAB | nie | tak | tak |
| Safari (jedyny silnik na iOS) | tak | tak | **NIE** |

Wniosek: izolacja **per sciezka**, bo COOP/COEP sa naglowkami per-dokument.

```json
// apps/web/vercel.json   (NOWY plik — repo nie ma dzisiaj ZADNEJ konfiguracji naglowkow)
{ "headers": [
  { "source": "/train/(.*)",  "headers": [
      { "key": "Cross-Origin-Opener-Policy",   "value": "same-origin" },
      { "key": "Cross-Origin-Embedder-Policy", "value": "credentialless" }]},
  { "source": "/studio/(.*)", "headers": [
      { "key": "Cross-Origin-Opener-Policy",   "value": "same-origin" },
      { "key": "Cross-Origin-Embedder-Policy", "value": "credentialless" }]}
]}
```
Cloudflare Pages / Netlify: `apps/web/public/_headers` z tymi samymi blokami.

**PULAPKA WDROZENIOWA:** `headers()` w `next.config.ts` **nie dziala** przy `output: 'export'` — nie ma serwera. Obecny `next.config.ts` to wylacznie `output:'export'` + `images.unoptimized` + `reactStrictMode:false`, i w repo nie ma `vercel.json`, `_headers`, `netlify.toml` ani `wrangler.toml`. Naglowki musza powstac jako plik na poziomie hostingu.

**Watki wasm: POZA ZAKRESEM.** Wymagaja SAB (a wiec izolacji site-wide dla workerow) plus `+atomics,+bulk-memory`. Rdzen RT jest jednowatkowy z zalozenia; tier offline paralelizuje sie przez **wiele Workerow**, kazdy z wlasna instancja modulu i wlasnym zakresem czasu — to nie potrzebuje SAB wcale.

**`+simd128`: TAK, dwa pliki.** Safari 16.4+, Chrome 91+, Firefox 89+ (caniuse `wasm-simd`, ~93,6% globalnie). Wybor przez `wasm-feature-detect`. **`relaxed-simd`: NIGDY** — `relaxed_madd` jest specyfikacyjnie niedeterministyczny (moze lub nie musi fuzowac), co lamie Tier 0. Weryfikowane grepem `relaxed_` w disasemblacji `.wat` w CI.

---

## 5. Audio I/O i latencja — realne liczby

### Web / AudioWorklet
- Kwant renderowania **128 ramek = 2,67 ms @ 48 kHz**, staly (`AudioContextRenderSizeCategory."default"` = 128 frames).
- Estymata systemowa: `ctx.baseLatency + ctx.outputLatency`. Spec o `outputLatency`: *"the interval between the time the UA requests the host system to play a buffer and the time at which the first sample in the buffer is actually processed by the audio output device"*, i *"may change while the context is running"*.
- **Realny round-trip:** desktop Chrome **35-60 ms**; Android Chrome **90-180 ms**; iOS Safari **60-150 ms**; +100-300 ms przez Bluetooth.
- Twardy sufit: brak nagrywania w tle, iOS wprowadza niestandardowy stan `'interrupted'`, Bluetooth HFP moze zbic `sampleRate` do 16 kHz z resetem kontekstu. **Rdzen dostaje sample rate w `cfg` i musi byc re-inicjowany przy zmianie** — nie hardkodowac 48000 w shellu, tylko asertowac w rdzeniu i zwracac czysty blad.

### iOS / AVAudioEngine
- Kategoria `.playAndRecord`, tryb **`.measurement`**. Apple: *"Use this mode for apps that need to minimize the amount of system-supplied signal processing to input and output signals"* oraz *"This mode disables some dynamics processing on input and output signals, resulting in a lower-output playback level."* Ta druga klauzula to pulapka: tor monitorowy potrzebuje jawnej kompensacji wzmocnienia, a A/B z innym trybem nie jest zrownany poziomowo.
- **NIGDY `.voiceChat`.** Apple o nim: *"provides useful voice features, including automatic gain correction"* + echo cancellation. To niszczy stabilnosc F0 i pomiar dynamiki.
- `setPreferredIOBufferDuration(0.005)` -> 256 ramek @48k. Apple: *"The typical maximum I/O buffer duration is 0.093 seconds (corresponding to 4,096 sample frames at a sample rate of 44.1 kHz). The minimum I/O buffer duration is at least 0.005 seconds (256 frames) but might be lower depending on the hardware in use."* Request jest **doradczy** — weryfikowac `ioBufferDuration` po aktywacji.
- **Pomiar:** `inputLatency + outputLatency + ioBufferDuration` (+ `AVAudioIONode.presentationLatency`, ktore odpowiada `kAudioDevicePropertyLatency`). Realnie: **iPhone bez BT ~12-25 ms round-trip; AirPods ~150-250 ms** (Apple ostrzega osobno: AirPlay potrafi dodac 2 s).
- Wejscie tapowac `AVAudioSinkNode` (blok RT), nie `installTap(onBus:)` — ten drugi jest nie-RT i daje 4096 ramek (~85 ms).
- Obsluzyc: `interruptionNotification`, `routeChangeNotification`, `mediaServicesWereResetNotification` (pelna rozbiorka i odbudowa engine'u).
- Tlo: `UIBackgroundModes: audio`. **To jest zdolnosc, ktorej web nie ma w ogole.**

### Android / Oboe + AAudio
- Oboe (Apache-2.0) wybiera AAudio na API 27+, OpenSL ES nizej. Cytat: *"in order to achieve the lowest possible latency you must use the `PerformanceMode::LowLatency` performance mode along with a high-priority data callback."*
- `SharingMode::Exclusive` (API 26+) *"provides the lowest possible latency by bypassing the mixer stage"*, ale *"streams are more likely to get disconnected"* -> zadaj Exclusive, obsluz `onErrorAfterClose` reotwarciem w Shared.
- Bufory: `framesPerBurst` jest **read-only**, ustawiany przez stream; `bufferCapacityInFrames` *"may change even if explicitly set… should always be queried"*. Dokumentowane wartosci: **96, 128, 160, 192, 240, 256, 512** ramek. Ustaw `setBufferSizeInFrames(2 * framesPerBurst)` i podnos przy rosnacym `getXRunCount()`.
- Wejscie: `InputPreset::VoiceRecognition` — dokumentacja Androida wskazuje ten preset jako usuwajacy przetwarzanie sygnalu. To androidowy odpowiednik iOS `.measurement`. **Nigdy `VoiceCommunication`** dla TRAIN.
- **Liczby z dokumentacji Androida:**
  | Flaga / klasa | Wymog |
  |---|---|
  | `android.hardware.audio.low_latency` | continuous **output** latency <= **45 ms** |
  | `android.hardware.audio.pro` | continuous **round-trip** <= **20 ms** (low_latency to prerekwizyt) |
  | CDD baseline (kazdy handheld) | mean continuous round-trip <= **300 ms** przy 5 pomiarach, MAD < 30 ms; tap-to-tone <= 300 ms |
  | Media Performance Class V | round-trip <= **80 ms**, tap-to-tone <= **80 ms** |
  Czyli uczciwy zakres na Androidzie to **20 ms do 300 ms — rozrzut 15x**. `PackageManager.FEATURE_AUDIO_PRO` / `FEATURE_AUDIO_LOW_LATENCY` musza **zmieniac zachowanie produktu**: monitorowanie na sluchawki oferujemy tylko przy PRO albo zmierzonym RT < 30 ms.
- **Pomiar:** OboeTester (GitHub + Play Store) robi automatyczny pomiar round-trip przez Intent; CTS Verifier ma test loopback. Metoda Androida: krotkie serie bialego szumu, loopback przez glosnik/mikrofon albo dongle 3,5 mm, offset przez **znormalizowana korelacje** — dokladnie to, co implementuje `vc_calibrate_latency`.

### Jedna procedura pomiaru dla trzech platform
1. Zglos estymate systemowa (web: `baseLatency+outputLatency`; iOS: `inputLatency+outputLatency+ioBufferDuration`; Android: `getTimestamp()` + `framesPerBurst`).
2. Zmierz **prawde** akustycznym loopbackiem: 3 serie bialego szumu 20 ms z przerwami 200 ms, nagraj mikrofonem, `vc_calibrate_latency` (znormalizowana korelacja krzyzowa), **5 powtorzen, mediana + MAD**.
3. Odrzuc, jesli MAD > 15 ms (zaklocenia) i powtorz. Zapisz per (urzadzenie, trasa audio) — trasa zmienia sie przy podlaczeniu sluchawek, wiec kalibracja jest **per-route**, nie per-device.
4. Ta sama funkcja rdzenia, ten sam algorytm, te same liczby na trzech platformach.

---

## 6. Build i CI

```
make all      # -> out/VcCore.xcframework, out/jniLibs/{abi}/, out/web/, out/models/
make ios | android | web | models | equiv | regolden
```

### Matryca targetow

| Tier | Target | Artefakt | Flagi specjalne |
|---|---|---|---|
| RT | `wasm32-unknown-unknown` | `vc_core_rt.wasm`, `vc_core_rt.simd.wasm` | `-C target-feature=+simd128` (tylko wariant simd); brak wasm-bindgen; `wasm-opt -Oz --strip-debug --strip-producers` |
| RT+off | `aarch64-apple-ios` | `libvc_core.a` | |
| RT+off | `aarch64-apple-ios-sim` + `x86_64-apple-ios` | `libvc_core.a` (lipo) | |
| RT+off | `aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-linux-android` | `libvc_core.a` -> `libvcshim.so` | `-Wl,-z,max-page-size=16384` |
| off | `wasm32-wasip1` | `vc_core_off.wasm` | wasi-sdk >= 33 dla C++ (signalsmith-stretch) |
| test | `aarch64-apple-darwin`, `x86_64-unknown-linux-gnu` | `vc-equiv` | referencja goldenow = **arm64-darwin** |

### Pakowanie iOS
```bash
for T in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios; do
  cargo build --release --target $T -p vc-core-rt -p vc-core-off
done
lipo -create target/aarch64-apple-ios-sim/release/libvc_core.a \
             target/x86_64-apple-ios/release/libvc_core.a \
     -output build/sim/libvc_core.a
cbindgen --config core/cbindgen.toml --crate vc-core-rt --output include/vc_core.h
cat > include/module.modulemap <<'EOF'
module VcCoreFFI { header "vc_core.h" export * }
EOF
xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libvc_core.a -headers include \
  -library build/sim/libvc_core.a                        -headers include \
  -output out/VcCore.xcframework
```
- **Statyczna biblioteka, nie dynamic framework.** Unika calej klasy problemow `@rpath`/embed-and-sign i pozwala linkerowi na dead-strip przez granice FFI.
- **Podpisywanie:** XCFramework zawierajacy wylacznie statyczne biblioteki nie jest sam podpisywany — kod laduje w binarce aplikacji i jest podpisany razem z nia. Podpis staje sie tematem tylko przy dystrybucji przez URL: wtedy `codesign --timestamp -s "Apple Distribution: …"` na `.xcframework`, a SwiftPM weryfikuje `checksum:`.
- SwiftPM: `.binaryTarget(name:"VcCoreFFI", url:"…/VcCore.xcframework.zip", checksum:"…")`. Target konsumujacy musi miec `linkerSettings: [.linkedLibrary("c++")]`, jesli tier offline pociaga C++.
- Bitcode: usuniety w Xcode 14+, ignorowac.

### Pakowanie Android
```bash
cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 \
          -o apps/android/src/main/jniLibs \
          build --release -p vc-core-rt -p vc-core-off
```
+ CMake linkuje `libvc_core.a` razem z Oboe i `oboe_shim.cpp` w **jedna** `libvcshim.so`. `android:extractNativeLibs="false"`.

### Budzety rozmiaru (wymuszane w CI)
| Artefakt | Limit |
|---|---|
| `vc_core_rt.wasm` po `wasm-opt -Oz` | **<= 220 KB raw / <= 90 KB brotli** |
| `vc_core_off.wasm` (tract + signalsmith) | **<= 2,5 MB raw / <= 800 KB brotli** |
| `libvc_core.a` per arch | 2-5 MB archiwum; przyrost aplikacji po dead-stripie 400-900 KB |
| dla porownania: `ort-wasm-simd-threaded.wasm` | **12,86 MB** — to jest cala argumentacja par. 8 |

### Wersjonowanie rdzenia wzgledem trzech aplikacji
1. **`vc_core_abi_version() -> u32`** sprawdzane przy starcie przez wszystkie trzy shelle; niezgodnosc = twardy blad z obiema wersjami w komunikacie. Jedyna obrona przed przestarzalym XCFrameworkiem i zacacheowanym `.wasm`.
2. **`vc_core_numeric_epoch() -> u32`** — osobny licznik. Kazde wydanie zmieniajace jakikolwiek golden musi go podbic. Aplikacje zapisuja epoch razem z kazdym wynikiem sesji i przeliczaja leniwie przy odczycie, jesli jest nieaktualny. Bez tego historia postepow uzytkownika miesza dwie skale.
3. `rust-toolchain.toml` z **dokladnym** `channel = "1.9x.y"` — bo Rust std dokumentuje, ze precyzja funkcji matematycznych *"varies by platform, **Rust version**"*, wiec nieprzypiety toolchain moze ruszyc goldeny.
4. Dystrybucja: iOS -> SwiftPM `binaryTarget(url:checksum:)` na asset GitHub Release; Android -> Maven `.aar` (jniLibs + wygenerowany Kotlin uniffi) do GitHub Packages; web -> npm `@vocalcoach/core` (`.wasm` + `.d.ts` + worklet JS + `.opl`). Trzy package managery, **jeden job CI, jeden numer wersji**.

### CI (GitHub Actions)
| Job | Runner | Zakres |
|---|---|---|
| `core-apple` | `macos-14` | build Apple + web; `vc-equiv` na `aarch64-apple-darwin` (**generuje referencje**); porownanie wasm pod `wasmtime` |
| `core-web-browsers` | `macos-14` | `vc-equiv` w prawdziwym AudioWorklecie przez Playwright: Chrome + Safari + Firefox (bo `wasmtime` nie jest silnikiem przegladarki, a przegladarka jest tym, co wysylamy) |
| `core-android` | `ubuntu-24.04` | cargo-ndk; `vc-equiv` na emulatorze x86_64 (szybkie) |
| `core-device` (nightly) | self-hosted | `adb push` binarki `vc-equiv` na `aarch64` do `/data/local/tmp` + XCTest na fizycznym iPhonie |
| `oracle` (nightly) | `ubuntu-24.04` | porownanie z `librosa.pyin` (ISC) na tym samym korpusie |

---

## 7. Testy rownowaznosci — procedura

### Co jest zagwarantowane z konstrukcji
- Spec WebAssembly: *"All operators use round-to-nearest ties-to-even"*, a `f32.add/sub/mul/div/sqrt` sa w pelni okreslone per IEEE 754. **Jedynym** niedeterminizmem sa payloady NaN (*"propagate NaN payloads from their operands"* — dozwolone, nie wymagane).
- Rust RFC 3514: *"Providing strict IEEE 754-2008 guarantees precludes many transformations, such as turning `a*b + c` into FMA operations (since the result can change due to different rounding)"*. Nie ma stabilnej flagi opt-in.
- **Wniosek:** kod zlozony wylacznie z `+ - * / sqrt`, porownan i operacji calkowitych jest **bitowo identyczny** na wasm32, arm64-apple i arm64-android. Ta wlasnosc jest fundamentem calego par. 7.

### Zagrozenia i regula dla kazdego

| Zagrozenie | Dlaczego lamie | Regula |
|---|---|---|
| `std` float math: `sin cos tan exp ln log2 log10 powf atan2 hypot cbrt` | Rust std: *"The precision of this function is non-deterministic. This means it varies by platform, Rust version, and can even differ within the same execution from one invocation to the next."* Woluja platformowy libm: musl (Android), Apple libm (iOS), LLVM builtins (wasm) | **ZAKAZ.** `#![no_std]` usuwa je z istnienia. `libm` 0.2.16 (czysty Rust, port musl, MIT) **na wszystkich targetach, wlacznie z native**. Wymuszone przez `clippy.toml` `disallowed-methods` + grep w CI poza modulem `vc-num::m` |
| Kontrakcja do FMA | `fmadd` na aarch64 zaokragla raz, wasm mul+add dwa razy | Rust nie kontraktuje (RFC 3514). **Kazdy** C/C++ przez `cc` dostaje bezwarunkowo `-ffp-contract=off -fno-fast-math -fno-associative-math -fno-reciprocal-math -fno-unsafe-math-optimizations -fno-finite-math-only` |
| `relaxed-simd` | `relaxed_madd` jest SPECYFIKACYJNIE may-or-may-not-fuse | Nigdy `+relaxed-simd`. Grep `relaxed_` w `.wat` w CI |
| Recznie pisany SIMD, `core::arch`, redukcje | Zmiana kolejnosci redukcji zmienia zaokraglenie | Tier RT: **zero** recznego SIMD. Sumy jako jawne petle sekwencyjne po `f32` (LLVM bez fast-math nie przestawi dodawan FP). `+simd128` bezpieczne z tego samego powodu — ale weryfikowane empirycznie harnessem, nie zaufaniem |
| `codegen-units > 1`, rozne `opt-level`/LTO | Rozne inlinowanie; ryzyko roznego wyboru sciezki w `libm` jesli wchodzi `cfg(target_feature)` | Identyczny profil dla kazdego targetu (par. 6). **`#[cfg(target_arch)]` ZABRONIONE w `vc-core-rt`**, grep w CI. Istnieje dokladnie jedna sciezka kodu |
| Payloady NaN | wasm moze kanonizowac, sprzet propagowac | Rdzen nie moze produkowac NaN w normalnej pracy. `debug_assert!(x.is_finite())` na granicy kazdego kernela; w release kazda wartosc nieskonczona emituje `VcEvent{kind:9 FAULT}` i ramka jest porzucana. Goldeny porownuja **NaN-owosc**, nigdy bity NaN |
| Denormale / flush-to-zero | ARM64 ma FPCR.FZ, wasm nie ma FTZ | **Nigdy nie ustawiac FPCR.FZ ani `_MM_SET_FLUSH_ZERO_MODE`.** `vc_rt_init` na aarch64 czyta FPCR i odmawia startu przy niedomyslnych bitach FZ/AH/RMode. Realne ryzyko: inny host albo plugin moze zostawic FPCR brudny |
| `HashMap` iteration order, `sort_unstable` | Niedeterministyczna kolejnosc | Tier RT: brak zegara, brak HashMap. Sortowania przez `sort_by` z **totalnym** komparatorem zawierajacym tiebreaker po indeksie (to naprawia tez audytowany bug "remisy harmonicScore rozstrzyga kolejnosc sortowania") |

### Korpus (`core/corpus/`, git-lfs)
| Katalog | Zawartosc | Po co |
|---|---|---|
| `synth/` | sinusy 82,41 / 110 / 220 / 440 / 1046,50 Hz; vibrato 5/6/7 Hz x +-50/+-200 c; glissando E2->C6 w 2 s; piloksztaltna + filtr formantowy na 12 wysokosciach; **bodzce dwutonowe f + 2f o rownej amplitudzie z przemiataniem fazy** | Ostatni wiersz to te, ktore realnie wylapia rozbieznosc dekodera — siedza na ostrzu noza niejednoznacznosci oktawowej |
| `noise/` | powyzsze przy SNR 20/10/0 dB: szum rozowy, HVAC, przeciek z glosnika | Voicing i fuzja cech |
| `real/` | 12 ludzkich take'ow (3 typy glosu x tani/dobry mikrofon x cicho/glosno), rece anotowane nuty | Tier 2 |
| `edge/` | 30 s cyfrowej ciszy; fala prostokatna full-scale; take z offsetem DC; jednopróbkowy klik; bufor zerowej dlugosci; **bufor NaN (musi byc odrzucony, nie propagowany)** | Sciezki bledu |
| `blocks/` | to samo audio przy rozmiarach 96, 128, 160, 192, 240, 256, 512, 1024, 4096 **oraz losowa sekwencja rozmiarow** | Bo Oboe daje 96-512, AudioWorklet 128, iOS cokolwiek — najwieksza czajaca sie klasa bledow z audytu jest zaleznoscia od framingu |

### Runner
Jedna binarka: `vc-equiv run --target <t> --pattern <blocks> --out results.bin`. Dla kazdej pozycji korpusu wola `vc_rt_init` + `vc_rt_push` w zadanym wzorcu blokow i zrzuca **kazde** `VcEvent` verbatim plus PCM toru monitorowego, jako blob z prefiksami dlugosci.

Uruchamiana na: host arm64-darwin (**referencja**); `wasm32-unknown-unknown` pod `wasmtime` **oraz** w prawdziwym AudioWorklecie przez Playwright (Chrome/Safari/Firefox); `aarch64-apple-ios` na fizycznym urzadzeniu przez XCTest; `aarch64-linux-android` przez `adb push` do `/data/local/tmp` (dziala bez APK) + jeden przebieg instrumentowany w procesie aplikacji; `x86_64-*` dla szybkosci CI, ale **nigdy jako referencja**.

### Trzy poziomy scislosci
| Tier | Zakres | Tolerancja |
|---|---|---|
| **0** | wszystkie pola `VcEvent` z `vc-core-rt`, porownanie przez `to_bits()` | **ZERO.** Jeden rozny bit = build red |
| **1** | PCM renderu z `vc-core-off` | max \|delta\| <= 1 LSB 24-bit = **6,0e-8**; \|\|delta\|\|2/\|\|x\|\|2 <= **1e-6** |
| **2** | tier NN + regresja **jakosci** (nie rownowaznosci) | RPA@+-50c nie spada > **0,5 pp** vs baseline; octave-error rate **nie rosnie wcale**; mediana \|err\| <= **10 c** czysto, <= **25 c** przy 10 dB SNR; VFA < 10% przy VR > 92% |

Uzasadnienie Tier 0 bez tolerancji: "tolerancja 0,1 centa" **ukrywa** rozbieznosc systematyczna, ktora bedzie rosla i ujawni sie jako "web mowi 87, iOS 84 na tym samym take". Poniewaz gwarancje jezyka i specyfikacji wasm daja bitowa rownosc **darmo** dla kodu z `+ - * / sqrt`, jedyne zadanie to zbanowac wszystko inne i to udowodnic.

### Bisekcja awarii
`vc-equiv --trace <modul> --frame <n>` zrzuca dodatkowo tablice posrednie: funkcje roznicowa `d(tau)`, CMNDF `d'(tau)`, liste kandydatow, koszty Viterbiego per bin. Pierwszy modul, ktorego trace sie rozni, jest winowajca — i w ~95% przypadkow bedzie to transcendentala, ktora umknela zakazowi.

### Dyscyplina goldenow
`core/goldens/<CORE_NUMERIC_EPOCH>/`. Generowane **wylacznie** na `aarch64-apple-darwin` z przypietym toolchainem, przez jawne `make regolden`, ktore **odmawia** dzialania na brudnym drzewie i zapisuje `PROVENANCE.json`: wersja rustc, target, hash profilu, hash korpusu, git SHA. PR ruszajacy goldeny musi podbic epoch i podac, ktora metryka sie zmienila i dlaczego. To jest mechanizm, ktory zamienia audytowany critical "zero testow i niedzialajacy lint" w faktyczna bramke.

### Niezalezny oracle
Osobno od rownowaznosci miedzyplatformowej: nocne porownanie z `librosa.pyin` (ISC) na tym samym korpusie (RPA/RCA/GPE). Lapie failure mode "wszystkie trzy platformy sie zgadzaja i wszystkie trzy sa zle" — czego rownowaznosc miedzyplatformowa strukturalnie nie potrafi wykryc.

---

## 8. Dystrybucja modeli ML

**Werdykt: `tract` 0.23.4 (MIT OR Apache-2.0), jeden plik `.opl`, zero ONNX Runtime.**

### Dlaczego nie ONNX Runtime — argument numeryczny, nie rozmiarowy
- CoreML EP ma opcje `AllowLowPrecisionAccumulationOnGPU` (*"Use low precision data(float16) to accumulate data"*), a dokumentacja mowi o trybie CPU-only: *"This decreases performance but provides reference output value without precision loss, which is useful for validation"* — czyli sciezka ANE/GPU jest **jawnie stratna**. Na Androidzie dostajesz NNAPI/XNNPACK, na web WASM-SIMD. Trzy rozne sciezki numeryczne => **Tier 0 nieosiagalny**, a ten sam uzytkownik dostaje inny wynik na innym urzadzeniu.
- Rozmiar (`onnxruntime-web@1.27.0`, zmierzone dzisiaj przez jsDelivr): `ort-wasm-simd-threaded.wasm` **12,86 MB**, wariant jsep **25,58 MB**, asyncify **23,13 MB**, plus ~0,77 MB minifikowanego JS — do uruchomienia modelu **0,38 MB**. Stosunek **34:1**. Wariant threaded wymaga SharedArrayBuffer, czyli izolacji.

### Dlaczego tract
- Czysty Rust -> kompiluje sie do `wasm32-unknown-unknown` **i** obu targetow mobilnych z tego samego zrodla, bez dodatkowego SDK. Jedyny runtime NN zachowujacy wlasnosc "jeden build, zero toolchainow".
- Produkcja w Sonos do **wake-word i streaming speech recognition** — ten sam ksztalt obciazenia (maly model, ciagle audio, on-device, ograniczona bateria).
- **"Pulsified" inference dla streamingu**: kompilujesz model raz z dlugoscia pulsu (hop SwiftF0 = 256 probek @ 16 kHz = 16 ms) i tract sam prowadzi wewnetrzne linie opoznien — karmisz go ramka po ramce zamiast przeliczac cale okno. Dokladnie to, czego potrzebuje ciagly track F0.
- **tract-OPL / NNEF**: konwersja `.onnx` -> OPL **na CI**, w runtime idzie tylko OPL. To wyrzuca `prost` (protobuf) i caly parser ONNX. tract dokumentuje OPL wlasnie jako sposob *"to minimize runtime footprint by separating compilation from deployment"*. Runtime deps: `tract-core` + `tract-nnef` zamiast 13 crate'ow `tract-onnx` (wsrod nich `memmap2`, wrogi wasm).

### Pipeline z jednego zrodla
```
core/models/src/swift_f0.onnx            upstream, kod MIT + wagi MIT, SHA-256 przypiete
        | make models  (CI, x86_64-linux)
        v
core/models/dist/swift_f0.opl            ~380 KB, JEDEN plik na trzy platformy
        |
        +-- web     -> statyczny asset; fetch na watku glownym, bajty do Workera
        |              (tier offline). NIE do AudioWorkletu — NN jest backendem
        |              "dokladnym", nie sterownikiem kursora.
        +-- iOS     -> resource w targecie SwiftPM: .copy("swift_f0.opl")
        +-- Android -> src/main/assets/swift_f0.opl, AssetManager.open -> slice bajtow
                       (bez ekstrakcji na dysk)
```

**API rdzenia: `vc_nn_load(bytes: *const u8, len: usize) -> *mut NnHandle` — BAJTY, nigdy sciezka.** To cala sztuczka przenosnosci: OPFS, `Bundle.main.url` i `AssetManager.open` nie maja ze soba nic wspolnego poza tym, ze wszystkie trzy potrafia wyprodukowac slice bajtow.

### Integralnosc i licencje
`core/models/MODELS.lock`:
```json
{ "swift_f0": {
    "upstream_url": "https://github.com/lars76/swift-f0",
    "paper": "arXiv:2508.18440",
    "upstream_sha256": "…", "opl_blake3": "…",
    "params": 95842, "sample_rate_hz": 16000, "hop_samples": 256,
    "f0_range_hz": [46.875, 2093.75],
    "code_license": "MIT", "weights_license": "MIT",
    "training_data": "wlasny syntetyczny SpeechSynth (autorzy)",
    "provenance_note": "najczystsza proweniencja w polu — CREPE/RMVPE trenowane na MIR-1K / MDB-stem-synth z ograniczeniami badawczymi"
}}
```
Rdzen weryfikuje `opl_blake3` przy ladowaniu i odmawia przy niezgodnosci. To jednoczesnie sciezka audytu licencyjnego.

### Umiejscowienie w dwutierowej architekturze
SwiftF0 to backend **dokladny** i zyje w `vc-core-off`, wolany z Workera na web i z watku nie-RT na mobile; wyniki wlewaja sie do tego samego strumienia zdarzen po `frame_index`. Backend pYIN+Viterbi zyje w `vc-core-rt` i prowadzi kursor na zywo. Oba przechodza przez jeden trait `PitchBackend`, wiec warstwa scoringu ich nie rozroznia. Rownowaznosc dla tieru NN to **Tier 2 (metryki), nie Tier 0** — i **to jest wlasnie powod**, dla ktorego nie jest w tierze RT: cokolwiek, co uzytkownik widzi jako liczbe, musi byc Tier 0.

**Regula na przyszlosc:** jesli jakis model bedzie musial trafic do tieru RT, forward pass pisze sie recznie (SwiftF0 to 95 842 parametry — CNN 2-D o ustalonej topologii nad STFT, czyli kilkaset linii `no_std` Rusta z libm), bo tract ma *"hand-rolled SIMD micro-kernels"* per architektura, a wiec jest wrogi Tier 0.

---

## 9. Uklad repozytorium

```
vocal-coach/
├─ core/                                   # jeden workspace cargo, wlasne tagi git
│  ├─ rust-toolchain.toml                  # channel = "1.9x.y"  (przypiety, par. 7)
│  ├─ Cargo.toml                           # [workspace] + [profile.release]
│  ├─ clippy.toml                          # disallowed-methods: std float math
│  ├─ cbindgen.toml
│  ├─ Makefile                             # all|ios|android|web|models|equiv|regolden
│  ├─ crates/
│  │  ├─ vc-num/          #![no_std] shim libm, centy<->Hz, sumy o stalej kolejnosci
│  │  ├─ vc-dsp/          #![no_std] biquady, kompresor, de-esser, ekspander, FDN,
│  │  │                   #           limiter, dither, BS.1770-4 + gated LUFS + TP 4x,
│  │  │                   #           decymator polyphase 48k->16k
│  │  ├─ vc-f0/           #![no_std] YIN-FFT, pYIN Beta(2,18)/100 progow, siatka 10 c,
│  │  │                   #           fixed-lag Viterbi, fuzja voicingu 5 cech
│  │  ├─ vc-notes/        #![no_std] histereza 60/100 c, vibrato, Needleman-Wunsch
│  │  ├─ vc-score/        #![no_std] martwe strefy JI, rozklad O(t)/r_i, agregat
│  │  ├─ vc-viewmodel/    #![no_std] ring -> draw-list, median-3, One Euro
│  │  ├─ vc-core-rt/      #![no_std] FASADA RT: cbindgen extern "C" + rtrb + bump.
│  │  │                   #           ZERO C/C++. ZERO alloc. ZERO importow wasm.
│  │  ├─ vc-edl/          std: niezmienny EDL, log komend, undo/redo, UUIDv7
│  │  ├─ vc-project/      std: DDL SQLite + migracje jako &str, tombstony
│  │  ├─ vc-midi/         std: parser MIDI (port lib/midi-parser.ts)
│  │  ├─ vc-peaks/        std: piramida peak/LOD
│  │  ├─ vc-nn/           std: tract-core + tract-nnef, loader OPL, SwiftF0
│  │  ├─ vc-render/       std: mixdown offline; linkuje signalsmith-stretch (C++)
│  │  ├─ vc-core-off/     std: FASADA OFFLINE: cbindgen + uniffi
│  │  └─ vc-equiv/        harness + runner korpusu (par. 7)
│  ├─ corpus/             git-lfs: synth/ noise/ real/ edge/ blocks/
│  ├─ goldens/<epoch>/    + PROVENANCE.json
│  ├─ models/{src,dist}/  + MODELS.lock
│  └─ include/            cbindgen output + module.modulemap
├─ apps/
│  ├─ web/                                 # ISTNIEJACY Next.js 16, TS/React
│  │  ├─ public/core/                       # vc_core_rt{,.simd}.wasm, swift_f0.opl
│  │  ├─ public/core/vc-processor.js         # AudioWorkletProcessor (surowy wasm)
│  │  ├─ src/audio/rt-client.ts              # node + transport SAB/postMessage
│  │  ├─ src/audio/off-worker.ts             # Worker z vc-core-off (wasm-bindgen)
│  │  └─ vercel.json                          # COOP/COEP per-sciezka (par. 4)
│  ├─ ios/                                  # Swift + SwiftUI
│  │  ├─ Package.swift                       # binaryTarget -> VcCore.xcframework
│  │  ├─ Sources/Audio/AVEngine.swift        # .measurement, AVAudioSinkNode
│  │  ├─ Sources/Audio/RtSession.swift       # bridge C-symbol, zero ARC w callbacku
│  │  └─ Sources/Generated/                  # uniffi Swift (zimna sciezka)
│  └─ android/                              # Kotlin + Jetpack Compose
│     │                                     #   (natywny toolkit Androida,
│     │                                     #    NIE Compose Multiplatform)
│     ├─ src/main/cpp/oboe_shim.cpp          # onAudioReady -> vc_rt_push. Zero JNI.
│     ├─ src/main/cpp/CMakeLists.txt         # libvc_core.a + Oboe -> libvcshim.so
│     ├─ src/main/jniLibs/{arm64-v8a,armeabi-v7a,x86_64}/
│     ├─ src/main/assets/swift_f0.opl
│     └─ src/main/java/.../generated/        # uniffi Kotlin (zimna sciezka)
└─ .github/workflows/core.yml
```

### Lista crate'ow z licencjami (wszystkie zweryfikowane dzisiaj przez API crates.io)
| Crate | Wersja | Licencja | Rola |
|---|---|---|---|
| `rustfft` | 6.4.1 | MIT OR Apache-2.0 | FFT (funkcja roznicowa YIN, STFT) |
| `realfft` | 3.5.0 | MIT | real->complex wrapper nad rustfft |
| `rtrb` | 0.3.4 | MIT OR Apache-2.0 | **wait-free SPSC**, `no_std`-capable — ring zdarzen |
| `libm` | 0.2.16 | MIT | czysty Rust port musl; **jedyne** zrodlo transcendentali |
| `rubato` | 4.0.0 | MIT OR Apache-2.0 | resampling (tier offline) |
| `tract-core` / `tract-nnef` | 0.23.4 | MIT OR Apache-2.0 | inferencja NN, OPL |
| `signalsmith-stretch` | 0.1.3 | MIT | time-stretch/pitch-shift (`cc`+`bindgen` nad MIT C++) — **tylko tier offline** |
| `symphonia` | 0.6.0 | MPL-2.0 | dekodowanie importow (copyleft plikowy — linkowanie OK, nie forkowac) |
| `uniffi` | 0.32.0 | MPL-2.0 | **tylko zimna sciezka** (jw.) |
| `blake3` | — | CC0/Apache-2.0 | integralnosc modeli |
| `cbindgen` | 0.29.4 | — | naglowek C (build) |
| `cargo-ndk` | 4.1.2 | — | linkowanie NDK (build) |
| `wasm-bindgen` | 0.2.126 | MIT OR Apache-2.0 | **tylko tier offline w Workerze** (build) |

**Celowo nieobecne (licencje):** aubio / aubio-rs (GPL-3), essentia / essentia.js (AGPL-3), pitchfinder (GPL-3), TarsosDSP (GPL-3), Praat (GPL-3), Rubber Band (GPL albo licencja platna), SoundTouch (LGPL-2.1), Soundpipe (pochodne Csounda), PESTO (LGPL-3 — statyczne linkowanie w sklepie praktycznie uniemozliwia spelnienie obowiazku relinkowania), Mel-Band Roformer dereverb (wagi GPL-3), ONNX Runtime (nie licencja, a numeryka i 12,86 MB).

---

## 10. Co moze ruszyc "pojutrze" na iOS

Kolejnosc jest wymuszona jedna rzecza: **ksztalt API musi byc ostateczny od dnia pierwszego, algorytmy moga byc puste.** Shell iOS pisze sie przeciwko `vc_core.h`, ktory jest kompletny natychmiast; wypelnianie `vc-f0`, `vc-notes`, `vc-score` nie zmienia w Swifcie ani jednej linii.

| # | Artefakt | Blokuje |
|---|---|---|
| 1 | `vc_core.h` + `module.modulemap` + `VcCore.xcframework` ze **stubem** rdzenia (poprawne ABI, `vc_rt_push` emituje syntetyczne `VcEvent`) | caly shell iOS: AVAudioSession `.measurement`, `AVAudioSinkNode`, `RtSession`, drain ringu, SwiftUI rysujace z draw-list |
| 2 | `vc-equiv` + `corpus/` + pierwsze goldeny na arm64-darwin | zaufanie do jakiegokolwiek kodu DSP |
| 3 | `vc-num` (shim libm) + `vc-dsp` (biquady, RMS, decymator) | `vc-f0` |
| 4 | `vc-f0` z pelnym pYIN+Viterbi | `vc-notes`, `vc-score`, i wymiana stuba na prawdziwy rdzen |
| 5 | `vc_calibrate_latency` | jakikolwiek scoring zalezny od czasu |
| 6 | Decyzja o hostingu web (Vercel vs CF Pages) | plik COOP/COEP per-sciezka |
| 7 | wasi-sdk >= 33 przypiety w CI | web build tieru offline |

Stub z punktu 1 to nie proteza — to kontrakt. Jesli shell iOS dziala przeciwko stubowi i pokazuje przewijajacy sie kontur syntetyczny, to znaczy, ze granica jest poprawna, i podmiana na prawdziwy rdzen jest zmiana jednego pliku `.xcframework`.

### Zależności

- core/include/vc_core.h + module.modulemap + VcCore.xcframework ze STUBEM rdzenia (poprawne ABI, vc_rt_push emitujacy syntetyczne VcEvent) - musi istniec PRZED jakimkolwiek kodem Swift, bo caly shell iOS pisze sie przeciwko temu naglowkowi i nie zmienia sie ani o linie, gdy stub zostanie zastapiony prawdziwym rdzeniem
- core/crates/vc-equiv + core/corpus/ (synth, noise, real, edge, blocks) + pierwsze goldeny wygenerowane na aarch64-apple-darwin z przypietym toolchainem - warunek wstepny zaufania do jakiegokolwiek kodu DSP; bez tego nie da sie stwierdzic, czy zmiana algorytmu cokolwiek poprawila
- rust-toolchain.toml z DOKLADNA wersja channel (nie 'stable') - bo Rust std dokumentuje, ze precyzja funkcji matematycznych varies by 'Rust version', wiec nieprzypiety toolchain moze ruszyc goldeny bez zmiany ani jednej linii kodu
- clippy.toml z disallowed-methods na std float math + grep w CI - mechanizm wymuszajacy zakaz z par. 7; bez tego ktos wpisze .sin() i Tier 0 pada po cichu
- vc-num (shim libm) i vc-dsp (biquady RBJ, RMS, decymator polyphase 48k->16k z LP 7,2 kHz i >=60 dB tlumienia) - warunek wstepny vc-f0
- vc-f0 z pelnym pYIN: YIN-FFT + integracja po Beta(2,18) po 100 progach + siatka 10 centow (490 binow) + fixed-lag Viterbi - warunek wstepny vc-notes i vc-score; do tego czasu nie wolno pisac scoringu, bo bedzie strojony pod bledny detektor
- vc_calibrate_latency (znormalizowana korelacja krzyzowa) - warunek wstepny jakiegokolwiek scoringu zaleznego od czasu; bez tego metryka timingu mierzy latencje urzadzenia, nie uzytkownika
- Decyzja o hostingu web (Vercel vs Cloudflare Pages vs Netlify) - determinuje forme pliku COOP/COEP per-sciezka; UWAGA: headers() w next.config.ts NIE dziala przy output:'export', a repo nie ma dzisiaj ZADNEJ konfiguracji naglowkow
- wasi-sdk >= 33 przypiety w obrazie CI - warunek wstepny buildu tieru offline na web (signalsmith-stretch przez wasm32-wasip1)
- Konwerter ONNX -> tract-OPL na CI + MODELS.lock z SHA-256 upstreamu i BLAKE3 artefaktu - warunek wstepny ladowania jakiegokolwiek modelu; rdzen odmawia przy niezgodnosci hasha
- Fizyczne urzadzenia do nightly device job: jeden iPhone + jeden Android arm64 - bo x86_64-linux-android w emulatorze NIE JEST aarch64-linux-android numerycznie, a Tier 0 na emulatorze nie dowodzi niczego o telefonie
- Dostep do OboeTester (Play Store / GitHub) i lista top-20 urzadzen w obecnej bazie uzytkownikow - do zbudowania matrycy latencji, ktora zdecyduje, czy monitorowanie na sluchawki jest funkcja bramkowana urzadzeniem

### Ryzyka

- `+simd128` moze zlamac bitowa rownosc Tier 0 mimo braku fast-math - autowektoryzacja petli redukcyjnej moze zmienic kolejnosc dodawan FP w sposob, ktorego RFC 3514 nie zabrania eksplicytnie na poziomie petli. MITYGACJA: harness rozstrzyga to w jeden przebieg; fallback to wysylanie wariantu bez SIMD jako buildu RT i uzywanie SIMD tylko w tierze offline (Tier 1). To jest pytanie pomiarowe, nie projektowe.
- `signalsmith-stretch` 0.1.3 nie obsluguje wasm w build.rs - jego skrypt to goly `cc::Build().cpp(true).std("c++14")` bez zadnej obslugi targetu wasm. Bedzie wymagal forka albo `[patch.crates-io]`, zeby dodac sysroot wasi-sdk i flagi `-ffp-contract=off`. Jesli libc++ z wasi-sdk okaze sie nie do zlinkowania obok Rust std na wasip1, fallback to Emscripten TYLKO dla tieru offline (osobny wasm, osobny loader) - gorsze pakowanie, ta sama jakosc.
- tract ma 'hand-rolled SIMD micro-kernels' per architektura, wiec tier NN STRUKTURALNIE nie moze byc Tier 0. Zaakceptowane projektowo (NN jest backendem dokladnym w tierze offline), ale jesli kiedykolwiek decyzja produktowa postawi wynik NN przed uzytkownikiem jako liczbe, ten model MUSI zostac przepisany recznie do no_std Rusta - inaczej ten sam take dostanie inny wynik na iPhonie i na Pixelu.
- Rdzen RT musi byc IMPORT-FREE, a to jest wlasnosc krucha. Jedna zaleznosc pociagajaca formatowanie panicow ze std albo `getrandom` dodaje importy, lamiac synchroniczna instancjacje w worklecie ORAZ budzet 220 KB. MITYGACJA: check w CI na sekcje importow w disasemblacji `.wat` - musi byc pusta. To musi byc bramka, nie zalecenie.
- AVAudioSession `.measurement` obniza poziom wyjscia (Apple: 'disables some dynamics processing on input and output signals, resulting in a lower-output playback level'). Tor monitorowy potrzebuje jawnej kompensacji wzmocnienia, a kazde A/B miedzy trybami NIE JEST zrownane poziomowo - wiec porownania jakosci miedzy trybami sa niewazne bez normalizacji.
- Rozrzut latencji na Androidzie to 20 ms (FEATURE_AUDIO_PRO) do 300 ms (baseline CDD) - piecnastokrotnie. Monitorowanie na sluchawki NIE MOZE byc funkcja uniwersalna; musi byc bramkowane przez PackageManager.FEATURE_AUDIO_PRO albo zmierzony RT < 30 ms, i produkt musi to komunikowac. Zaprojektowanie UI zakladajacego monitoring wszedzie jest bledem, ktory ujawni sie dopiero u uzytkownikow.
- Bluetooth HFP zbija sampleRate wejscia do 16 kHz (czasem 8), a na web dodatkowo resetuje AudioContext. Przy 16 kHz Nyquist to 8 kHz - formanty i harmoniczne potrzebne do rozstrzygania oktawy znikaja, a jakosc detekcji spada bez zadnego sygnalu dla uzytkownika. Rdzen MUSI odrzucac wejscie < 32 kHz do scoringu z jawnym bledem, zamiast po cichu produkowac gorsze liczby.
- MPL-2.0 na uniffi i symphonia to copyleft PLIKOWY - linkowanie do zamknietej aplikacji jest w porzadku, ale modyfikacja ich plikow uruchamia obowiazek publikacji tych plikow. Regula: nie forkowac. Jesli fork bedzie konieczny, publikowac zmodyfikowane pliki osobno.
- COOP/COEP per-sciezka oznacza, ze nawigacja z /karaoke do /train przekracza granice izolacji - BFCache i kazda relacja window.opener sie lamia. Dla tej aplikacji nieszkodliwe, ale MUSI byc przetestowane, bo objawi sie jako 'przycisk wstecz gubi stan' i zostanie zdiagnozowane jako bug Reacta.
- x86_64-linux-android w emulatorze CI nie jest aarch64-linux-android numerycznie (rozne kernele libm w tract, rozne wektoryzacja). Zielony Tier 0 na emulatorze NIE dowodzi niczego o urzadzeniu. Nightly job na fizycznym arm64 jest obowiazkowy, nie opcjonalny - a to znaczy self-hosted runner albo farma urzadzen.
- Payloady NaN sa jedynym niedeterminizmem w specyfikacji wasm ('propagate NaN payloads from their operands' jest dozwolone, nie wymagane). Jesli rdzen kiedykolwiek wyprodukuje NaN w normalnej pracy, Tier 0 zacznie migotac losowo miedzy platformami i bedzie to zdiagnozowane jako niestabilnosc harnessu, nie jako bug w DSP. Stad: FAULT event + porownywanie NaN-owosci, nigdy bitow NaN.
- FPCR moze byc zostawiony brudny (FZ / flush-to-zero) przez innego hosta albo plugin na aarch64, a wasm nie ma FTZ w ogole. To da rozbieznosc Tier 0 zaleznaca od tego, co uzytkownik uruchomil wczesniej - najgorszy mozliwy rodzaj niedeterminizmu. Stad odczyt i asercja FPCR w vc_rt_init z odmowa startu.

### Do rozstrzygnięcia pomiarem

- Czy `-C target-feature=+simd128` zachowuje bitowa rownosc Tier 0 dla NASZYCH konkretnych kerneli (funkcja roznicowa YIN, CMNDF, koszty Viterbiego, biquady)? Rozstrzyga to jeden przebieg harnessu vc-equiv porownujacy vc_core_rt.wasm z vc_core_rt.simd.wasm z referencja arm64-darwin. Jesli nie - wysylamy wariant bez SIMD jako build RT.
- Czy modul RT jest FAKTYCZNIE import-free po `lto=fat` + `panic=abort` (+ ewentualnie `panic_immediate_abort` z build-std), i czy miesci sie w 220 KB raw / 90 KB brotli po `wasm-opt -Oz`? Rozstrzyga to inspekcja sekcji importow w `.wat` i pomiar rozmiaru. Jesli nie - trzeba zidentyfikowac zaleznosc wnoszaca import i ja wyciac.
- Czy wasi-sdk >= 33 linkuje signalsmith-stretch czysto dla wasm32-wasip1 OBOK Rust std, czy tier offline wymaga Emscripten? Rozstrzyga to proba buildu. Wynik decyduje o liczbie modulow wasm i o kształcie loadera na web.
- Jaki jest REALNY zmierzony round-trip na top-20 urzadzeniach w obecnej bazie uzytkownikow (per trasa audio: wbudowany, przewodowe, BT)? Rozstrzyga to telemetria z akustycznej kalibracji w aplikacji + OboeTester na matrycy urzadzen. Wynik decyduje, czy monitorowanie na sluchawki jest funkcja globalna, bramkowana, czy tylko iOS.
- Czy fixed-lag Viterbi z lagiem L=24 ramek (256 ms) jest percepcyjnie akceptowalny dla tieru 'committed', czy trzeba zejsc do L=14 (149 ms) i przyjac wzrost bledow oktawowych? Rozstrzyga to A/B z realnymi spiewakami na tym samym korpusie, mierzone jednoczesnie odczuciem responsywnosci i octave-error rate.
- Czy tract z pulsified SwiftF0 wyrabia sie w czasie rzeczywistym na Androidzie sredniej klasy przy 62,5 ramki/s, czy musi chodzic na obnizonej czestotliwosci ramek z interpolacja? Rozstrzyga to profilowanie na fizycznym urzadzeniu z dolnej polowy matrycy, nie na flagowcu.
- Jaka czesc obecnej bazy uzytkownikow jest na Safari/iOS, gdzie `COEP: credentialless` nie istnieje - czyli ile z szybkiej sciezki SharedArrayBuffer jest martwym balastem? Rozstrzyga to analityka. Jesli >60%, sciezka SAB moze nie byc warta utrzymywania dwoch torow transportu zdarzen.
- Czy `AVAudioSinkNode` faktycznie dostarcza bloki o rozmiarze wynegocjowanym przez `preferredIOBufferDuration`, czy AVAudioEngine wprowadza wlasne buforowanie miedzy inputNode i sinkiem? Rozstrzyga to pomiar rozkladu `frameCount` w callbacku na kilku urzadzeniach. Wplywa na to, czy 5 ms `preferredIOBufferDuration` cokolwiek daje.
- Czy `postMessage` z watku audio przy 8 kwantach (21,3 ms) powoduje mierzalne xruny na Androidzie w Chrome przy obciazeniu, czy jest szumem? Rozstrzyga to pomiar `getXRunCount`-owego odpowiednika (liczba nieudanych deadline'ow AudioWorkletu) pod syntetycznym obciazeniem CPU. Wynik decyduje, czy trzeba schodzic do 16 kwantow, czy podnosic priorytet sciezki SAB.

<details><summary>Źródła</summary>

- [rustc platform support: wasm32-unknown-unknown — 'There is no C/C++ toolchain for this target'](https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-unknown.html)
- [rustc platform support: wasm32-wasip1 — 'explicitly supports interop with non-Rust code such as C and C++', wasi-sdk >= 33](https://doc.rust-lang.org/rustc/platform-support/wasm32-wasip1.html)
- [Rust std f32 — 'The precision of this function is non-deterministic. This means it varies by platform, Rust version…'](https://doc.rust-lang.org/std/primitive.f32.html#method.sin)
- [Rust RFC 3514: float semantics — odrzucenie fast-math i kontrakcji do FMA](https://github.com/rust-lang/rfcs/blob/master/text/3514-float-semantics.md)
- [WebAssembly core spec, numerics — 'All operators use round-to-nearest ties-to-even'; NaN payload jako jedyny niedeterminizm](https://webassembly.github.io/spec/core/exec/numerics.html)
- [libm — port MUSL libm do Rust, MIT, scalony do compiler-builtins](https://github.com/rust-lang/libm)
- [UniFFI internals: lifting and lowering — 'lowered to a byte buffer called a RustBuffer', serializacja per wywolanie](https://mozilla.github.io/uniffi-rs/latest/internals/lifting_and_lowering.html)
- [UniFFI overview — wsparcie dla Kotlin, Swift, Python](https://mozilla.github.io/uniffi-rs/latest/)
- [swift-bridge — Rust/Swift interop, wymaga Swift 6.0+, wersja 0.1.x](https://github.com/chinedufn/swift-bridge)
- [libsignal — recznie pisane bridge'e rust/bridge/{ffi,jni,node}, produkcja na iOS+Android+Node, BEZ uniffi](https://github.com/signalapp/libsignal)
- [Oboe Full Guide — PerformanceMode::LowLatency, SharingMode::Exclusive, framesPerBurst, i kategoryczny zakaz malloc/new/mutex w onAudioReady](https://github.com/google/oboe/blob/main/docs/FullGuide.md)
- [Android NDK audio latency — low_latency <= 45 ms output, pro <= 20 ms round-trip, bufory 96-512 ramek, preset VOICE_RECOGNITION](https://developer.android.com/ndk/guides/audio/audio-latency)
- [Android audio latency measurement — bialy szum + loopback + znormalizowana korelacja; OboeTester](https://source.android.com/docs/core/audio/latency/measure)
- [Android 15 CDD — mean continuous round-trip <= 300 ms (MAD < 30 ms); Media Performance Class V <= 80 ms](https://source.android.com/docs/compatibility/15/android-15-cdd)
- [AVAudioSession.Mode.measurement — 'minimize the amount of system-supplied signal processing'; obniza poziom wyjscia](https://developer.apple.com/documentation/avfaudio/avaudiosession/mode-swift.struct/measurement)
- [AVAudioSession.setPreferredIOBufferDuration — max 0.093 s (4096 @44,1k), min 0.005 s (256 ramek)](https://developer.apple.com/documentation/avfaudio/avaudiosession/setpreferredIOBufferDuration(_:))
- [AURenderBlock — 'All realtime operations are implemented using blocks to avoid Objective-C method dispatching and the possibility of blocking'](https://developer.apple.com/documentation/audiotoolbox/aurenderblock)
- [AVAudioSourceNode render block — 'When rendering to a device, avoid making blocking calls within the block'](https://developer.apple.com/documentation/avfaudio/avaudiosourcenode/init(format:renderblock:))
- [AVAudioSession.Mode.voiceChat — stosuje automatic gain correction i echo cancellation (dlatego zakazany dla TRAIN/SING)](https://developer.apple.com/documentation/avfaudio/avaudiosession/mode-swift.struct/voicechat)
- [Web Audio API 1.1 — renderQuantumSize domyslnie 128 ramek; baseLatency i outputLatency](https://www.w3.org/TR/webaudio-1.1/)
- [AudioWorkletGlobalScope — tylko currentFrame, currentTime, sampleRate, port, registerProcessor (brak fetch/XHR)](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletGlobalScope)
- [Chrome: Audio Worklet Design Pattern — Pattern A (Emscripten) vs Pattern B (Module przez konstruktor), ring buffer dla 128 ramek](https://developer.chrome.com/blog/audio-worklet-design-pattern)
- [MDN WebAssembly.Module — structured-cloneable, przekazywalny przez postMessage](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Module)
- [MDN WebAssembly.Instance() — synchroniczny; RangeError dla duzych buforow 'on the UI thread'](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Instance/Instance)
- [wasm-bindgen issue #2367 — 'the major blocker is that TextEncoder and TextDecoder are not available within AudioWorklets'](https://github.com/rustwasm/wasm-bindgen/issues/2367)
- [MDN Cross-Origin-Embedder-Policy — require-corp vs credentialless; wymogi crossOriginIsolated i SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)
- [caniuse: WebAssembly SIMD — Safari 16.4+, Chrome 91+, Firefox 89+, ~93,6% globalnie](https://caniuse.com/wasm-simd)
- [tract (Sonos) — czysty Rust ONNX/NNEF, produkcja do wake-word i streaming ASR, pulsified inference, tract-OPL](https://github.com/sonos/tract)
- [ONNX Runtime CoreML EP — AllowLowPrecisionAccumulationOnGPU (float16); CPU-only daje 'reference output value without precision loss'](https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html)
- [onnxruntime-web@1.27.0 rozmiary artefaktow (jsDelivr) — ort-wasm-simd-threaded.wasm 12,86 MB](https://data.jsdelivr.com/v1/packages/npm/onnxruntime-web@1.27.0?structure=flat)
- [SwiftF0 — 95 842 parametry, 16 kHz, hop 256 (16 ms), zakres 46,875-2093,75 Hz, MIT](https://github.com/lars76/swift-f0)
- [SwiftF0 (arXiv 2508.18440) — 91,80% HM przy 10 dB SNR, +12 pp nad CREPE, ~42x szybszy na CPU](https://arxiv.org/abs/2508.18440)
- [Signalsmith Stretch — C++ polyphonic pitch/time, MIT, ostatni push 2026-01-24](https://github.com/Signalsmith-Audio/signalsmith-stretch)
- [signalsmith-stretch-rs build.rs — cc::Build().cpp(true).std("c++14") + bindgen, bez obslugi wasm](https://github.com/colinmarc/signalsmith-stretch-rs)
- [rtrb — wait-free SPSC ring buffer, no_std-capable, MIT/Apache-2.0](https://github.com/mgeier/rtrb)
- [Apple: Creating a multiplatform binary framework bundle (XCFramework z -library + -headers)](https://developer.apple.com/documentation/xcode/creating-a-multi-platform-binary-framework-bundle)

</details>

---

## Pełny łańcuch przetwarzania dźwięku Vocal Coach: profile ŚPIEW i MOWA, kompensacja latencji, korekcja intonacji, enhancement, separacja, mastering, silnik audio (web + native iOS Swift + native Android Kotlin)

**Werdykt:** Budujemy jeden rdzeń DSP w Rust (`vc-core`), w którym żyje 100% przetwarzania — Web Audio, AVAudioEngine i Oboe są WYŁĄCZNIE hostami I/O i zegarem, a nie procesorami. Każdy węzeł Web Audio liczący próbki (DynamicsCompressorNode, BiquadFilterNode, ConvolverNode, WaveShaperNode) jest wyrzucony: nie istnieje na iOS/Android, różni się między przeglądarkami, a DynamicsCompressorNode nie ma nawet makeup gain ani kontroli knee, więc fizycznie nie potrafi zrealizować żadnego z kompresorów w tej specyfikacji. Łańcuch ŚPIEW i łańcuch MOWA są pełne i bez cięć: de-plosive, ekspander, de-esser 2-pasmowy, dynamiczny tłumik rezonansów, EQ, dwa kompresory, kompresor wielopasmowy, adaptive leveler, saturacja z oversamplingiem, FDN reverb 16x16, doubler, limiter true-peak z ditheringiem — z dwoma osobnymi torami: monitoring o budżecie DSP 1,7 ms (tylko procesory zerowej latencji) i render offline bez żadnych ograniczeń. Korekcja intonacji to hybryda trzech silników wybieranych per nuta wielkością korekty: TD-PSOLA (<=150 centów), WORLD/BSD-3 (150-600 centów), WORLD z częściowym skalowaniem formantów (>600 centów), plus Signalsmith Stretch (MIT, potwierdzone) w torze monitoringu — Rubber Band odrzucony (GPL albo płatna licencja, potwierdzone na breakfastquay.com), a modele voice conversion odrzucone merytorycznie, bo zmieniają tożsamość głosu, czyli robią dokładnie to, czego produkt obiecuje nie robić. Separacja podkładu idzie NA URZĄDZENIU modelem BS PolarFormer (SDR 11.00 — najwyższy na publicznym leaderboardzie, wagi MIT w bgkb/bs_polarformer, gotowy eksport `bs_polarformer_webgpu_fp16.onnx` 108,3 MB, SNR fp16 48,6 dB / Pearson 0,99999642 względem PyTorch), co jednocześnie daje najlepszą jakość i eliminuje prawne ryzyko wysyłania cudzej muzyki na nasze serwery. Odszumianie dzieli się na profile na podstawie arXiv 2607.11630 (potwierdzone): jeden model bazowy DPDFNet 48 kHz (Apache-2.0) z dwoma adapterami LoRA — mowa i śpiew — bo pełne dotrenowanie NISZCZY zdolności mowy, a LoRA je zachowuje przy +6-12% parametrów i bije modele trenowane od zera o 0,29-1,8 dB SDR; dereverb permisywny NIE ISTNIEJE (wszystkie modele GPL-3.0 lub CC-BY-NC, sprawdzone), więc idziemy WPE (MIT) plus własny adapter LoRA jako jedyna droga do niekopyleftowego dereverbu.

### Decyzje

| Pytanie | Rozstrzygnięcie | Dlaczego | Odrzucone |
|---|---|---|---|
| Gdzie liczymy DSP: węzły Web Audio czy własny rdzeń? | Własny rdzeń Rust `vc-core`. Web Audio dostarcza DOKŁADNIE JEDEN węzeł: AudioWorkletNode będący pompą do `rt_process()`. Bindingi: wasm-bindgen (web) + UniFFI (Swift/Kotlin). Neural inference przez trait `Inferencer` implementowany per host (ORT Web / ORT + CoreML / ORT + NNAPI). | Każdy węzeł Web Audio liczący próbki nie istnieje na iOS/Android — port byłby przepisaniem całego DSP od zera, czyli dokładnie tym, czego mamy uniknąć. Dodatkowo DynamicsCompressorNode nie ma makeup gain ani konfigurowalnego knee, BiquadFilterNode ma inne konwencje Q/gain niż cookbook RBJ, a AnalyserNode nakłada niekontrolowane okno Blackmana i wygładzanie czasowe. Żaden kompresor ani EQ z tej spe | Web Audio jako procesor — nieprzenośne i niezdolne do wymaganych parametrów. WASM threads / SharedArrayBuffer — wymusza COOP/COEP, a Safari nie ma COEP: credentialless, co wywala każdy cross-origin embed; rdzeń jednowątkowy + WASM SIMD wystarcza. Trzymanie DSP w TypeScript — blokuje port całkowicie. |
| Czy neural denoise / pitch correction wchodzą do toru MONITORINGU? | NIE dla neural denoise — nigdy. Pitch correction: dostępna, domyślnie WYŁĄCZONA, z jawną etykietą kosztu latencji. Budżet DSP monitoringu = 1,7 ms (0,16 ms saturacja 4x + 1,5 ms lookahead limitera). Wszystko inne to procesory zerowej latencji (IIR, dynamika bez lookahead, FDN równolegle). | Argument merytoryczny, nie kosztowy: DPDFNet/GTCRN mają algorytmiczną latencję 20 ms okna + 10 ms hopu, Signalsmith presetCheaper ~32 ms. Przy samopodsłuchu powyżej 15-20 ms śpiewak traci stabilność intonacji i dostaje filtrację grzebieniową względem przewodnictwa kostnego — czyli narzędzie do nauki intonacji zaczyna ją psuć. To wprost szkodzi funkcji produktu. | Neural denoise w monitoringu — psuje intonację użytkownika. Twarde wyłączenie pitch correction z monitoringu — część użytkowników chce słyszeć hard-tune jako efekt wykonawczy, więc zostaje jako opt-in z dokładną kompensacją przez `outputLatency()`. |
| Silnik korekcji intonacji zachowujący formanty | Hybryda trzech silników, wybór per nuta wielkością korekty: \|Δ\|<=150 centów → TD-PSOLA (własna impl., algorytm wolny); 150-600 centów → WORLD (BSD-3-Clause, potwierdzone w LICENSE.txt); >600 centów → WORLD + skalowanie formantów o 1+0,25(ratio-1). Tor monitoringu: Signalsmith Stretch (MIT, npm signalsmith-stretch@1.3.2, oficjalny WASM/AudioWorklet). F0 podaje NASZ pYIN, nie Harvest — jedna prawd | WORLD to jawna dekompozycja źródło-filtr (Harvest/CheapTrick/D4C): zmiana F0 nie dotyka obwiedni widmowej, więc formanty są zachowane PRZEZ KONSTRUKCJĘ, a nie przez heurystykę kompensacji. TD-PSOLA nie rozmywa widma w ogóle i zachowuje przebieg glotalny, więc przy małych korektach jest najbardziej przejrzysty. Sam README Signalsmith Stretch stwierdza, że jego obsługa formantów jest "not as sharp a | Rubber Band v4.0.0 — POTWIERDZONE na breakfastquay.com: GPL albo płatna licencja komercyjna. Odrzucony nie z powodu ceny, a z braku zysku jakościowego: dla materiału MONOFONICZNEGO metody źródło-filtr dają równą lub lepszą naturalność, więc licencja kupuje zero. zplane élastique — to samo rozumowanie plus brak możliwości wniesienia kodu do własnego rdzenia. SoundTouch — LGPL-2.1 ORAZ jakość klasy  |
| Czy modele odszumiania trenowane na MOWIE niszczą ŚPIEW? Jaka architektura? | TAK, i jest to udokumentowane: arXiv 2607.11630 (Bereuter, Plumbley, Sontacchi, 2026-07-13, potwierdzone przez arXiv API). Architektura: JEDEN model bazowy `dpdfnet2_48khz_hr` (Apache-2.0, 2,58M par., 2,42 GMACs, 10,0 MB ONNX) + DWA adaptery LoRA rank-8: mowa (=identity, baza JEST modelem mowy) i śpiew (własny trening). Wyłącznie warianty 48 kHz-native. Analiza F0/scoring CZYTA ZAWSZE SUROWY sygna | Paper podaje kierunkowe liczby: adaptacja modelu mowy bije trening od zera o 0,29-1,8 dB SDR (więc pretrening na mowie jest cenny — odpowiedź to ADAPTUJ, nie unikaj), pełne dotrenowanie NISZCZY zdolność mowy, a LoRA ją zachowuje przy +6-12% parametrów. Mechanizm szkody: vibrato na wytrzymanej samogłosce wygląda dla modelu mowy jak szum tonalny (buczenie) i jest tłumione; modele mowy uczą się usuwa | Modele generatywne/restoration (VoiceFixer MIT, Resemble Enhance) — HALUCYNUJĄ, co przy aplikacji treningowej jest błędem poprawności: użytkownik byłby oceniany za dźwięk, którego nie zaśpiewał. Luka SI-SDR 12,42 dB vs 19,36 dB przy porównywalnym DNSMOS pokazuje to liczbowo. Odrzucone bezwarunkowo w torze analizy. Dwa osobne pełne modele (mowa+śpiew) — gorsze od LoRA według papera ORAZ 2x kod i 2x |
| Dereverberacja | Model permisywny NIE ISTNIEJE — sprawdzone wyczerpująco. WPE (algorytm nara_wpe, MIT, 569 gwiazdek, push 2025-03-19) w rdzeniu Rust jako baza: single-channel, taps 24 (śpiew) / 30 (mowa), prediction delay 3 ramki, 4-5 iteracji, STFT 1024/256 @48 kHz. Plus dynamiczny tłumik rezonansów i EQ de-boxiness 300-500 Hz, które rozwiązują większość realnych przypadków. Plus własny adapter LoRA dereverb na t | Przegląd wszystkich modeli dereverb na Hugging Face: anvuew/dereverb_mel_band_roformer GPL-3.0, anvuew/dereverb_bs_roformer GPL-3.0, Sucial/Dereverb-Echo_Mel_Band_Roformer CC-BY-NC-SA-4.0, Intel/dereverb_mel_band_roformer_anvuew_openvino GPL-3.0, mochiya98/melbandroformer_variant GPL-3.0. ZERO modeli MIT/Apache/BSD. WPE jest liniowy, treścio-agnostyczny (identycznie działa na mowie i śpiewie — tu  | anvuew Mel-Band Roformer dereverb (SDR 19,17-20,40, najlepszy publicznie) — GPL-3.0 na wagach, dyskwalifikuje zamknięty binarny produkt w App Store. Sucial — CC-BY-NC, zakaz komercyjny. SGMSE/StoRM (MIT) — dyfuzyjne, halucynują i są zbyt wolne dla renderu z paskiem postępu. |
| Separacja głosu od podkładu: na urządzeniu czy serwerowo? Jaki model? | NA URZĄDZENIU, na wszystkich trzech platformach. Model: BS PolarFormer, wagi MIT (bgkb/bs_polarformer, potwierdzone przez HF API), SDR 11.00 na wokalu — najwyższy na leaderboardzie Multisong ZFTurbo. 51M parametrów. Plik `bs_polarformer_webgpu_fp16.onnx` 108,3 MB (fp32: 210,7 MB). STFT/iSTFT SĄ POZA grafem ONNX, więc należą do naszego rdzenia. 44,1 kHz stereo, chunk 131 584 próbki, 25% overlap. Dr | Ten model jest jednocześnie najwyższej jakości na publicznym leaderboardzie, MIT na kodzie (ZFTurbo MSST MIT 1455 gwiazdek push 2026-07-12, lucidrains/BS-RoFormer MIT push 2026-06-14) i na wagach, ORAZ już wyeksportowany do runtime'u istniejącego na web/iOS/Android. fp16 jest percepcyjnie bezstratny: SNR 48,6 dB, Pearson 0,99999642 względem PyTorch (fp32: 107 dB). Argument przeciw serwerowi jest M | Serwer jako podstawowa ścieżka — tworzy ryzyko prawne po naszej stronie. Zostaje wyłącznie jako jawna, uruchamiana przez użytkownika akcja "zrób to szybciej w chmurze". Mel-Band Roformer KimberleyJSN (SDR 10,98, MIT) — świetny fallback, ale 0,02 dB niżej i bez gotowego eksportu WebGPU. MDX-Net kuielab — MIT, ale ostatni push 2023-02-27 i MDX23C ma SDR 10,17 < 11,00: przestarzały, zero powodu by go |
| Kompensacja latencji nagrania na podkład | Dwupoziomowo. Tier 1 (prior): raporty platformy — web `AudioContext.outputLatency`/`baseLatency`, iOS `AVAudioSession.outputLatency`/`.inputLatency`, Android `AudioTrack.getTimestamp()`/`AudioRecord.getTimestamp()`. Tier 2 (autorytatywny, ten sam kod w rdzeniu na 3 platformach): pomiar akustyczny 3 chirpami 500 Hz→8 kHz, 2048 próbek, okno Tukey 0,1, -12 dBFS, odstęp 300 ms; filtr dopasowany przez  | Chirp pasmowy zamiast kliku: koncentruje energię tam, gdzie głośniki i mikrofony telefonów realnie pracują, daje ~30 dB zysku przetwarzania z filtracji dopasowanej i przeżywa dowolne przetwarzanie w torze. Klucz per trasa, bo latencja jest własnością TRASY: {platforma, wersja OS, output_route_id, input_route_id, sample_rate, io_buffer_frames, monitoring_dsp_enabled} — z unieważnieniem na `AVAudioS | Poleganie wyłącznie na raportach platformy — na web są niekompletne (Safari nierzadko nie podaje `outputLatency`, `MediaStreamTrack.getSettings().latency` prawie nigdy nie jest wypełnione), więc pomiar jest obowiązkowy, nie opcjonalny. Wypalanie korekty w próbkach — uniemożliwia poprawę kalibracji bez utraty materiału. Jedna globalna wartość latencji — Bluetooth HFP daje 120-250 ms zmiennej latenc |
| Reverb: FDN czy konwolucja? | Własny FDN 16x16 w rdzeniu. Linie opóźniające o wzajemnie pierwszych długościach 1013-2939 próbek (21-61 ms @48 kHz), macierz Hadamarda 16x16 znormalizowana 1/4 przez szybką transformatę Walsha-Hadamarda (64 dodawania zamiast 256 mnożeń), tłumienie per linia g_i = 10^(-3·L_i/(RT60·fs)), 1-biegunowy LP na HF damping, 4 kaskadowe allpassy dyfuzji (137/211/293/379 próbek, g 0,62-0,56), modulacja ±0,4 | Zero plików IR, więc zero problemu licencyjnego z impulsami. RT60 jako pokrętło, a nie jako wybór pliku. ~200 operacji/próbkę wobec partycjonowanej konwolucji 2-sekundowego IR stereo. I — najważniejsze — jest to NASZ kod, więc brzmi identycznie na trzech platformach, czego konwolucja przez ConvolverNode nigdy nie zagwarantuje. Modulacja linii jest obowiązkowa: bez niej FDN dzwoni metalicznie. | ConvolverNode — nie istnieje na iOS/Android. Konwolucja z IR jako v1 — dochodzi jako presety "prawdziwych pomieszczeń" później, gdy będzie czysty licencyjnie zestaw IR; nie jest to cięcie zakresu, a kolejność. |
| Wyrównanie rozmówców w podcaście: diaryzacja czy multitrack? | Multitrack wymuszony jako warunek wejścia produktu, diaryzacja ODRZUCONA. Wyrównanie: integrated LUFS liczony TYLKO na regionach aktywności danego mówcy (jego własna ścieżka powyżej własnego noise floor +12 dB, segmenty min 300 ms), target = MEDIANA zmierzonych wartości wszystkich mówców, potem wolny leveler ±6 dB na drift. Weryfikacja: mediany short-term w granicach 1,0 LU, rozrzut 10-90 percenty | Standardowe gated integrated LUFS wg BS.1770 mierzy CAŁY plik razem z ciszą mówcy — przy podcaście czteroosobowym, gdzie każdy mówi 25% czasu, odczyt jest o ~6 dB za nisko i RÓŻNIE za nisko dla każdego, więc wyrównanie na tej podstawie jest z definicji błędne. Dlatego liczymy loudness speech-active. Mediana jako target, żeby nikt nie był pchany ekstremalnie. Diaryzacja (pyannote MIT ale wagi gated | Diaryzacja — rozwiązuje nieistniejący problem i dodaje niewidoczne błędy. Broadband ducking jako domyślny — spektralny ducking (-8 dB tylko w 300-3400 Hz) brzmi wyraźnie lepiej, bo zachowuje bas i górę muzyki. |
| Model danych: wspólny dla śpiewu i mowy? | TAK, jeden EDL. Mowa to ten sam EDL PLUS warstwa tokenów. `Clip { source_in, source_len, timeline_in: i64, latency_comp: i32, gain_db, fade_in/out, time_stretch, pitch, reversed, mute }`, `Token { clip_id, t_start, t_end, text, kind: Word\|Filler\|Breath\|Pause\|Silence, confidence }`. Każda edycja to czysta funkcja `Project -> Project`. Undo/redo: log komend z komendami odwrotnymi (`trait Command | Usunięcie zakresu tekstu = split klipu + crossfade 15 ms equal-power, punkt cięcia snapowany do zera przejścia w ±40 ms ORAZ do lokalnego minimum energii. Próbki nigdy nie są modyfikowane, więc undo jest arytmetyką i NIE MOŻE zgubić audio — co wprost usuwa potwierdzony błąd krytyczny w interactive-waveform.tsx, gdzie undo kasuje audio bezpowrotnie i drugie cięcie niszczy zły fragment. Zapis do sto | Snapshoty jako undo — nie skalują się do 60-minutowej ścieżki i nie dają koalescencji. Osobny model danych dla podcastu — dwa silniki, dwa renderery, dwa zestawy błędów; warstwa tokenów jest addytywna i wystarcza. contenteditable dla transkrypcji — synchronizacja DOM z EDL przy undo/wklejaniu/IME jest nierozwiązywalna; własny renderer tokenów. |
| Automatyzacja i render offline | Automatyzacja evaluowana z POZYCJI SAMPLOWEJ transportu, nigdy z requestAnimationFrame. `Lane { param, points: Vec<Point{sample:u64, value, curve: Linear\|Hold\|Bezier\|SCurve}>, enabled, visible }` — `enabled` i `visible` to OSOBNE pola i silnik czyta tylko `enabled`. Zastosowanie w RT: target na granicy bloku + jednobiegunowy smoother τ=5 ms; parametry wrażliwe (delay time, pitch) dostają interp | Obecna automatyzacja sterowana rAF zamarza w tle — to gwarantowana ścieżka uszkodzenia renderu. Rozdzielenie enabled/visible usuwa potwierdzony błąd, w którym ukrycie lane'a wyłącza automatykę. PDC (plugin delay compensation) musi istnieć, bo inaczej de-esser z 5 ms lookahead przesuwa wokal względem podkładu. Render jest deterministyczny: te same wejście + EDL + wersja rdzenia = bit-identyczny wyn | rAF jako zegar automatyki — zamarza w tle. Automatyka przez przypisanie `.value` — trzaski; setTargetAtTime/smoother obowiązkowy. Render jako osobny kod — natychmiast się rozjeżdża z odtwarzaniem i umiera jako martwy kod. |
| Pomiar głośności i limitowanie | BS.1770-4 zaimplementowane w rdzeniu Rust, z libebur128 (MIT, 491 gwiazdek) jako złotą referencją w testach, nie jako zależnością linkowaną. Raportujemy: momentary 400 ms, short-term 3 s, integrated gated, LRA, sample peak, true peak z 4x oversamplingiem (polyphase FIR 4 fazy x 32 tapy). Limiter dwustopniowy: stopień 1 soft-knee comp (thr = ceiling-6 dB, 4:1, atak 5 ms, release 100 ms), stopień 2  | Sample peak nie wystarcza: intersample peaks po kodowaniu stratnym rutynowo przekraczają 0 dBFS o 1-2 dB, a Web Audio nie ma żadnego miernika TP. Obecny kod eksportuje 16 bit bez ditheringu i bez limitera, przy presetach z outputGain do 1,25 — to dwa słyszalne błędy nałożone na siebie. Pułapka +3 LU: BS.1770 sumuje średnie kwadratów kanałów, więc ten sam głos jako mono i jako dual-mono różni się o | ffmpeg.wasm do pomiaru loudness — domyślny core budowany z --enable-gpl, mina licencyjna, plus absurdalny narzut. Linkowanie libebur128 jako zależności C — łamie zasadę rdzenia bez zależności i daje trzy różne buildy zamiast jednego kodu; używamy go jako oracle w testach. |
| Formaty i enkodery | Źródło prawdy: WAV RIFF, fmt tag 3 (WAVE_FORMAT_IEEE_FLOAT), 32-bit float, 48 kHz, RF64 powyżej 4 GB. Archiwum: FLAC 48/24. Dostawa: AAC-LC 256 kbps (192 dla mowy), Opus 128 kbps (96 dla mowy), FLAC 24-bit, WAV 24-bit. Enkodery: web → WebCodecs AudioEncoder z fallbackiem opus-recorder (BSD-3); iOS → AVAudioFile / AudioToolbox AudioConverter (AAC, kAudioFormatFLAC, ALAC) plus własny build libopus ( | Wszystkie trzy platformy mają AAC/Opus/FLAC natywnie, więc payload enkodera to zero bajtów i sprzętowa akceleracja. MP3 oznaczałby albo LGPL i friction ze statycznym linkowaniem, albo zależność dla formatu, którego w 2026 nikt nie potrzebuje. AudioContext.sampleRate podąża za systemem (na wielu Macach 44100), a wszystkie współczynniki filtrów, w tym K-weighting z BS.1770, zależą od sample rate — w | MP3 w aplikacji — friction licencyjny bez zysku funkcjonalnego; jeśli użytkownik żąda, robimy serwerowo. Podnoszenie sample rate projektu do 96 kHz — oversampling robimy WEWNĄTRZ procesorów (4x/8x), nie globalnie. |
| Obsługa długich plików i waveform | Nigdy nie dekodujemy całej ścieżki do RAM. Źródła mmapowane (native) albo przez FileSystemSyncAccessHandle w workerze (web), dekodowane stronami 1 s do LRU 256 MB z read-ahead 2 s zależnym od kierunku transportu. Piramida peaków min/max/rms na poziomach 1:64, 1:256, 1:1024, 1:4096, 1:16384, 1:65536, liczona JEDNYM przebiegiem dekodu przy imporcie i zapisana obok źródła. Renderer waveformu wybiera  | 60-minutowa ścieżka 48 kHz stereo float to 1,38 GB — nie może być Float32Array. Piramida daje stałą rozdzielczość na każdym zoomie zamiast obecnych sztywnych 1000 próbek niezależnie od długości pliku. Canvas rozmiaru viewportu usuwa awarię przy klipie 5,5-minutowym, gdzie canvas przekracza maksymalny rozmiar przeglądarki. Jeden przebieg dekodu zamiast trzech przy imporcie. | Pełny dekod do RAM — poza zasięgiem dla ścieżki 60-minutowej. Stała liczba próbek waveformu — bezużyteczna przy dowolnej długości. Canvas o szerokości całego klipu — twardy limit przeglądarki. |

### Specyfikacja

> Wszystkie licencje, daty i rozmiary oznaczone **[V]** zweryfikowałem w tej sesji przez GitHub API, Hugging Face API, crates.io API, npm registry, arXiv API albo bezpośredni WebFetch pliku LICENSE. Budżet WebSearch był wyczerpany globalnie (200/200) przed startem, więc weryfikacja szła przez API — to daje twardsze dane niż snippety. Wartości oznaczone **[?]** pochodzą z wiedzy własnej (cutoff maj 2026) i wymagają jednorazowego sprawdzenia — dotyczy to wyłącznie tabeli LUFS platform w §7.4.

---

# 0. Fundament architektoniczny

## 0.1 Podział odpowiedzialności

```
┌─────────────────────────────────────────────────────────────┐
│  HOST (cienki)   web: Next.js/React │ iOS: Swift │ Android: Kotlin
│  - I/O urządzeń, uprawnienia, cykl życia sesji audio
│  - UI, rendering waveformu z piramidy peaków
│  - wywołanie ONNX Runtime (impl. traitu Inferencer)
└──────────────────────────┬──────────────────────────────────┘
                           │  ~30 funkcji FFI, tylko typy POD
┌──────────────────────────┴──────────────────────────────────┐
│  vc-core  (Rust workspace, 100% DSP, zero API platformy)     │
│  vc-dsp       filtry, dynamika, saturacja, FDN, oversampling │
│  vc-pitch     pYIN + Viterbi, TD-PSOLA, WORLD, korekcja      │
│  vc-enhance   WPE, spектral gating, wrapper LoRA/ONNX I/O     │
│  vc-separate  STFT/iSTFT + chunking + maska dla BS PolarFormer│
│  vc-loudness  BS.1770-4, true peak 4x, limiter, dither        │
│  vc-engine    graf, transport, scheduler, automatyka, render  │
│  vc-edl       model danych, komendy, undo/redo, migracje      │
│  vc-latency   kalibracja chirpem, matched filter, klucz trasy │
└─────────────────────────────────────────────────────────────┘
      ↓ wasm-bindgen              ↓ UniFFI              ↓ UniFFI
   ort-web (WASM/WebGPU)   ORT + CoreML EP        ORT + NNAPI
```

**Reguła nadrzędna:** żaden węzeł Web Audio nie liczy próbek. Dozwolone są wyłącznie:
`AudioContext` (zegar + I/O), **jeden** `AudioWorkletNode` (pompa), `MediaStreamAudioSourceNode`, `AudioBuffer`, `OfflineAudioContext`.

Zabronione: `DynamicsCompressorNode` (brak makeup gain, brak kontroli knee — fizycznie nie realizuje żadnego kompresora z tej specyfikacji), `BiquadFilterNode` (inne konwencje Q/gain niż cookbook RBJ), `WaveShaperNode`, `ConvolverNode`, `AnalyserNode` (niekontrolowane okno Blackmana + wygładzanie czasowe).

## 0.2 Kontrakt RT

```rust
// Wołane z callbacku audio. Zero alokacji, zero locków, zero syscalli.
pub extern "C" fn vc_rt_process(
    h: *mut Engine,
    in_ptr: *const f32, in_ch: u32,
    out_ptr: *mut f32,  out_ch: u32,
    frames: u32,
) -> i32;

// Wołane z wątku UI
pub extern "C" fn vc_push_command(h: *mut Engine, cmd: *const u8, len: u32) -> i32;
pub extern "C" fn vc_drain_events(h: *mut Engine, buf: *mut u8, cap: u32) -> u32;
```

Trzy wątki: RT audio (nigdy nie blokuje), worker (dysk/dekod/inferencja), UI.
Komunikacja: dwa lock-free SPSC ring buffery (`rtrb`), 4096 zdarzeń ≈ 4 s historii przy hopie 512. Drenowane raz na rAF/CADisplayLink/Choreographer.

## 0.3 Parametry globalne

| Parametr | Wartość | Uzasadnienie |
|---|---|---|
| Wewnętrzny sample rate | **48 000 Hz** | iOS i Android pracują natywnie na 48 kHz; resampling to darmowy błąd |
| Format wewnętrzny | f32, deinterleaved | zapas nad 0 dBFS w łańcuchu, brak clippingu międzywęzłowego |
| Blok RT | 128 próbek (2,67 ms) + akumulator | najmniejszy kwant hosta (AudioWorklet) jest niekonfigurowalny |
| Blok renderu offline | 4096 próbek | przepustowość |
| Hop analizy | 256 próbek (5,33 ms) = 187,5 ramek/s | rozdzielczość vibrata 4-9 Hz |
| Okno analizy | 2048 próbek (42,67 ms) | rozmywa 21-30% cyklu vibrata — akceptowalne; 4096 rozmywa ~50% |
| Sample rate separacji | 44 100 Hz | BS PolarFormer trenowany na 44,1; resampling rubato tam i z powrotem, jednorazowo |
| Resampler | **rubato 4.0.0, MIT OR Apache-2.0** [V] | sinc 256 tapów, okno Blackman-Harris |
| `AudioContext` | `new AudioContext({sampleRate: 48000, latencyHint: 'interactive'})` | `sampleRate` podąża za systemem (na wielu Macach 44100), a K-weighting BS.1770 zależy od sample rate |

---

# 1. ŁAŃCUCH ŚPIEW

## 1.1 Tor MONITORINGU — budżet DSP 1,7 ms

**Twarda reguła:** w torze monitoringu dozwolone są wyłącznie procesory zerowej latencji. Powyżej 15-20 ms samopodsłuchu śpiewak traci stabilność intonacji i dostaje filtrację grzebieniową względem przewodnictwa kostnego — narzędzie do nauki intonacji zaczyna ją psuć. To dyskwalifikuje neural denoise (20 ms okna + 10 ms hopu) i domyślnie pitch correction (~32 ms).

| # | Blok | Parametry startowe | Latencja |
|---|---|---|---|
| 1 | **DC block** | 1-biegunowy HP @ 5 Hz, `a = exp(-2π·5/fs)` | 0 |
| 2 | **HPF** | Butterworth 24 dB/okt = 4 kaskadowe biquady, **60 Hz** (C2 = 65,4 Hz musi przejść). Wybór 50/60/80/100 | 0 |
| 3 | **De-plosive** (dynamiczny HP) | detektor: RMS w pasmie 20-120 Hz (LR4 bandpass); wyzwolenie gdy `RMS_LF > RMS_full − 12 dB`; narożnik HP 60 → **180 Hz** w 8 ms, release 80 ms | 0 |
| 4 | **Ekspander** (NIE gate) | próg = noise_floor + 8 dB, ratio 2:1, **max głębokość −10 dB**, atak 3 ms, hold 120 ms, release 200 ms, histereza 4 dB | 0 |
| 5 | **De-esser** 1-pasmowy | detektor 5-9 kHz (LR4); dyskryminator sybilancji `E(5-9k)/E(1-3k) > 0,7`; próg adaptacyjny = bieżący 90. percentyl pasma HF z 3 s − 3 dB; ratio 4:1, atak 0,5 ms, release 40 ms, **max −8 dB** | 0 |
| 6 | **EQ 4-pasmowy** (własne biquady RBJ) | low-shelf 200 Hz −1,5 dB · bell 400 Hz Q1,0 −2 dB · bell 3 kHz Q0,8 +1,5 dB · high-shelf 8 kHz +1,5 dB | 0 |
| 7 | **Kompresor 1 — leveler** | thr −20 dBFS, ratio 2,5:1, soft knee 6 dB, atak 12 ms, release **auto 80-300 ms** (z crest factor), makeup +4 dB, detektor hybryda RMS/peak 50/50 | 0 |
| 8 | **Kompresor 2 — peak** | thr −8 dBFS, ratio 6:1, knee 2 dB, atak 1 ms, release 60 ms | 0 |
| 9 | **Saturacja** | asymetryczny tanh, **4× oversampling** (polyphase FIR half-band 63 tapy, stopband −90 dB), drive +3 dB, mix 15% | **0,16 ms** |
| 10 | *(opt-in)* **Pitch correction** | Signalsmith Stretch `presetCheaper`, block 2048, interval 512, formant compensation ON | **~32 ms** — etykieta w UI |
| 11 | **FDN Reverb** (równolegle) | RT60 1,4 s, pre-delay 20 ms, wet 18%, HF damping 0,45, LF 0,15, wet HP 250 Hz / LP 7 kHz | 0 (dry nietknięty) |
| 12 | *(opt)* **Delay** | 1/8 kropkowana do tempa podkładu, 2 powtórzenia, wet 8%, HP 400 Hz na powtórkach | 0 |
| 13 | **Mix monitorowy** | głos + podkład, niezależne gainy | 0 |
| 14 | **Limiter** | true-peak brickwall, ceiling **−1,0 dBTP**, lookahead **1,5 ms**, release 60 ms | **1,5 ms** |

**Suma DSP: 1,66 ms.** Realny round-trip: iOS 12-18 ms (wired, `preferredIOBufferDuration = 0.005` = 256 ramek), Android 15-25 ms (AAudio EXCLUSIVE + `PERFORMANCE_MODE_LOW_LATENCY`, CDD `audio.pro` wymaga ≤20 ms), web 30-70 ms (quantum 128 = 2,67 ms, `baseLatency` 2,67-11 ms, `outputLatency` 10-40 ms, wejście getUserMedia 10-30 ms).

> **Wniosek merytoryczny:** monitoring śpiewu przez przeglądarkę jest na granicy użyteczności i to jest realne uzasadnienie aplikacji natywnych. Na web domyślnie proponujemy podsłuch sprzętowy (interfejs) albo tryb bez podsłuchu.

**Constraints wejścia (obowiązkowe dla ŚPIEW):**
```js
getUserMedia({audio:{
  echoCancellation:false, noiseSuppression:false, autoGainControl:false,
  channelCount:1, sampleRate:48000
}})
// PO uzyskaniu strumienia OBOWIĄZKOWO sprawdź track.getSettings() —
// Safari i część Androidów ignorują część constraintów i trzeba to wykryć, nie założyć.
```
iOS natywnie: `AVAudioSession` kategoria `.playAndRecord`, mode **`.measurement`** (wyłącza systemowe przetwarzanie), `.allowBluetoothA2DP` bez `.allowBluetooth` (HFP forsuje 16 kHz).

## 1.2 Tor RENDERU — offline, bez ograniczeń

### Przebieg A — analiza (bez wyjścia audio)
- kontur F0: **pYIN** (hop 256, okno 2048, fmin 60 Hz, fmax 1200 Hz, 100 progów, prior Beta(2,18), no_trough_prob 0,01, Viterbi po siatce 10 centów)
- segmentacja na nuty (histereza 60/100 centów, przytrzymanie 60 ms, min 100 ms/nuta)
- noise floor = 10. percentyl bloków RMS 400 ms
- profil sybilancji = 90. percentyl 5-9 kHz
- lokalizacje plozji, oddechów, kliknięć
- loudness: momentary / short-term / integrated / LRA / sample peak / true peak
- crest factor per 3 s
- **DRR / reverberance** (decyzja o dereverbie)
- obwiednia widmowa wygładzona 1/3-oktawy → pozycje rezonansów

### Przebieg B — naprawa
| # | Blok | Parametry |
|---|---|---|
| 1 | DC block + HPF | Butterworth 24 dB/okt @ 60 Hz |
| 2 | **Repair kliknięć** | `|Δx| > 8σ` lokalnej pochodnej → interpolacja AR (rząd 32) na ≤3 ms |
| 3 | De-plosive | jak monitoring, ale **30 ms lookahead** → HP już jest na 180 Hz, gdy plozja dociera |
| 4 | **Dereverb WPE** | taps **24**, prediction delay 3 ramki, **4 iteracje**, STFT 1024/256, wet ≤60%, tylko gdy DRR poniżej progu |
| 5 | **Denoise** | §5 — profil ŚPIEW: harmonicznie chroniony spectral gating, `α=1,5`, floor `β=0,15` (**max −16 dB**), gain wymuszony na 1,0 w binach ±40 centów od F0 i 12 pierwszych harmonicznych. Po dostarczeniu adaptera: DPDFNet 48 kHz + LoRA śpiew, `attn_limit_db=10`, wet 40% |
| 6 | **Oddechy** | detekcja: flatness >0,30 AND RMS ∈ [−45,−25] dBFS AND brak F0 AND 150-500 ms AND sąsiedztwo voiced → **tłumienie −10 dB**, fade 20 ms. **NIGDY usuwanie** |

### Przebieg C — barwa i dynamika
| # | Blok | Parametry |
|---|---|---|
| 7 | **Dynamiczny tłumik rezonansów** | 6 pasm auto-lokowanych na pikach >6 dB nad obwiednią 1/3-okt w 200 Hz–6 kHz; dynamiczny bell Q6, max −6 dB, atak 5 ms, release 80 ms |
| 8 | **De-esser 2-pasmowy** | pasma 5-9 kHz i 9-16 kHz osobno, **5 ms lookahead**, ratio 4:1, max −8 dB / −6 dB |
| 9 | **EQ statyczny** | 4 pasma z §1.1 + tilt |
| 10 | **KOREKCJA INTONACJI** | §4 — hybryda TD-PSOLA / WORLD |
| 11 | Kompresor 1 | thr −20, ratio 2,5:1, knee 6, atak 12 ms, release auto, **lookahead 5 ms** |
| 12 | **Adaptive leveler** | target short-term **−18 LUFS**, okno 3 s, max **±6 dB**, slew **1 dB/s**, freeze gdy short-term < −45 LUFS. **Zapisywany do EDL jako widoczna, edytowalna krzywa automatyki** |
| 13 | Kompresor 2 | thr −8, ratio 6:1, atak 1 ms, release 60 ms, lookahead 2 ms |
| 14 | **Kompresor wielopasmowy** | LR4 @ 250 Hz i 3,5 kHz; low 2:1 thr −24 · mid 1,5:1 thr −20 · high 2,5:1 thr −26 |
| 15 | **Saturacja** | **8× oversampling**, drive +4 dB, mix 20% |
| 16 | **FDN Reverb** | §1.3, + slapback pre-delay 12 ms |
| 17 | *(opt)* **Doubler** | 2 kopie ±7 centów, delay 18 i 27 ms, pan ±35%, −9 dB |
| 18 | **Parallel compression** | thr −30, ratio 4:1, blend 25% |
| 19 | **Mastering** | §7 |

## 1.3 FDN Reverb 16×16 — pełna specyfikacja

```
Długości linii (próbki @48 kHz, wszystkie pierwsze, wzajemnie pierwsze):
1013 1117 1231 1361 1487 1601 1733 1861 1999 2131 2267 2393 2531 2663 2803 2939
  (21,1 ms … 61,2 ms)

Macierz mieszająca: Hadamard 16×16 znormalizowana 1/√16 = 1/4,
  liczona szybką transformatą Walsha-Hadamarda: 16·log2(16) = 64 dodawania
  (zamiast 256 mnożeń)

Tłumienie per linia:  g_i = 10^(-3·L_i / (RT60·fs))
HF damping:  1-biegunowy LP per linia, coeff z HF_ratio (default 0,40 → HF gaśnie 2,5× szybciej)
LF damping:  1-biegunowy HP shelf per linia, LF_ratio default 1,10

Dyfuzja wejściowa: 4 kaskadowe allpassy
  delay 137, 211, 293, 379 próbek ; g = 0,62 / 0,60 / 0,58 / 0,56

Modulacja (obowiązkowa — bez niej FDN dzwoni metalicznie):
  każda linia ±0,4 próbki, niezależny LFO 0,13–0,31 Hz,
  interpolacja Lagrange'a 4-punktowa

Wyjście: 8 linii → L, 8 → R, naprzemienne znaki (dekorelacja)
Pre-delay: osobna linia 0–200 ms
Wet EQ: HP 250 Hz (2-pol), LP 7 kHz (2-pol)
Ducking wet obwiednią dry: max 3 dB, atak 10 ms, release 250 ms
```

Presety: `Vocal Plate` (RT60 1,4 s, pre 20 ms, HF 0,45) · `Room` (0,6 s, pre 8 ms, HF 0,55) · `Hall` (2,6 s, pre 35 ms, HF 0,35) · `Podcast Room` (0,35 s, pre 4 ms, wet 4%).

---

# 2. ŁAŃCUCH MOWA (podcast)

## 2.1 Monitoring (talkback) — ta sama dyscyplina zerowej latencji
HP Butterworth 12 dB/okt @ 80 Hz (męski) / 100 Hz (żeński) → de-plosive → ekspander → de-esser → EQ 3-pasmowy → kompresor (thr −22, 3:1, atak 8 ms, release 120 ms) → limiter −1 dBTP / 1,5 ms. Reverb 0% albo `Podcast Room` 4% dla komfortu. **Zero neural.**

## 2.2 Render — pełny łańcuch

| # | Blok | Parametry |
|---|---|---|
| 1 | DC block + HPF | Butterworth **12 dB/okt** (2 biquady) @ **80 Hz** męski / **100 Hz** żeński. Opcjonalne notche 50/100/150 Hz **Q=30** przy brumie sieciowym |
| 2 | Repair kliknięć | jak §1.2 |
| 3 | De-plosive | 30 ms lookahead, HP 80 → 180 Hz |
| 4 | **Dereverb WPE** | taps **30**, delay 3, **5 iteracji** — agresywniej niż śpiew, bo brak reverbu artystycznego do ochrony, a zrozumiałość rośnie |
| 5 | **Neural denoise** | **`dpdfnet2_48khz_hr`** (Apache-2.0 [V], 2,58M par., 2,42 GMACs, **10,0 MB ONNX**), `attn_limit_db = 12`, **wet 85%**. Max quality offline: `dpdfnet8_48khz_hr` (3,63M, 7,17 GMACs, 14,2 MB). Fallback słabe urządzenia: GTCRN (MIT [V], 48,2K par.) |
| 6 | Oddechy | tłumienie **−12 dB** (mowa toleruje więcej niż śpiew), fade 20 ms, nigdy usuwanie |
| 7 | **Wypełniacze** | hybryda akustyczno-tekstowa, **tylko flagowanie, nigdy auto-usuwanie** (§2.5) |
| 8 | **Kompresja ciszy** | próg otwarcia = noise_floor + 10 dB, zamknięcia + 6 dB (histereza 4 dB); przerwy >400 ms skracane do max 250 ms, **minimum 120 ms zachowane**. Nigdy do zera |
| 9 | Dynamiczny tłumik rezonansów | 6 pasm, jak §1.2 |
| 10 | De-esser 2-pasmowy | 5 ms lookahead |
| 11 | **EQ statyczny** | low-shelf 120 Hz **+1 dB** (lub −2 dB gdy buczy) · bell 300 Hz Q1,2 **−2,5 dB** (boxiness) · bell 1,8 kHz Q1,0 **+1,5 dB** (artykulacja) · bell 4 kHz Q1,5 **+2 dB** (presence) · high-shelf 10 kHz **+1 dB** |
| 12 | Kompresor 1 | thr −22, ratio 3:1, knee 6, atak 8 ms, release auto 80-250 ms, lookahead 5 ms |
| 13 | **Adaptive leveler** | target short-term **−18 LUFS**, okno 3 s, max **±9 dB**, slew **1,5 dB/s**, freeze <−45 LUFS |
| 14 | Kompresor 2 | thr −10, ratio 5:1, atak 1 ms, release 50 ms |
| 15 | Kompresor wielopasmowy | LR4 @ **200 Hz / 3 kHz**; low 2,5:1 thr −26 · mid 1,8:1 thr −20 · high 3:1 thr −28 |
| 16 | Saturacja | 8× oversampling, drive **+2 dB**, mix **12%** |
| 17 | **Wyrównanie rozmówców** | §2.3 |
| 18 | **Ducking muzyki** | §2.4 |
| 19 | Mastering | §7 |

## 2.3 Wyrównanie rozmówców

**Warunek wejścia produktu: jeden mówca = jedna ścieżka.** Diaryzacja odrzucona (§decisions).

```
KROK 1 — wyrównanie czasowe
  Dla każdej pary ścieżek: cross-correlation pierwszych 60 s @16 kHz,
  zakres ±5 s, rozdzielczość 1 próbki, matched filter przez FFT.
  Korekta stałego offsetu = trim w EDL (timeline_in).

KROK 2 — drift (osobne rekordery, różne zegary)
  offset(0..60 s) i offset(T-60..T) → δ = (off_end − off_start)/T
  jeśli |δ| > 20 ppm → resampling rubato ratio (1+δ). Raportuj ppm w UI.

KROK 3 — loudness speech-active (NIE gated integrated całego pliku)
  Dla mówcy k: maska aktywności = własna ścieżka > własny noise_floor + 12 dB,
  segmenty ≥300 ms, z histerezą 4 dB.
  L_k = integrated LUFS liczony WYŁĄCZNIE na tej masce.

KROK 4 — statyczny gain
  target = median(L_1..L_n)          ← mediana, nie średnia, nie max
  gain_k = target − L_k              ← clamp ±12 dB

KROK 5 — wolny leveler per mówca
  jak §2.2/13, max ±6 dB (odchylanie się od mikrofonu)

KROK 6 — bleed gating (przesłuch)
  Dominacja mówcy B na ścieżce A: RMS_B(300–3400 Hz) > RMS_A + 6 dB przez >60 ms
  → duck A o 12–18 dB, histereza 3 dB, atak 15 ms, release 200 ms.
  NIGDY pełne wyciszenie (zachowanie ciągłości pomieszczenia).

KROK 7 — weryfikacja (raport w UI, tabela)
  mediany short-term LUFS mówców w granicach 1,0 LU
  rozrzut 10–90 percentyla w granicach 3 LU
```

**Dlaczego speech-active, a nie standardowe gated integrated:** BS.1770 mierzy cały plik razem z ciszą mówcy. W podcaście czteroosobowym, gdzie każdy mówi ~25% czasu, odczyt jest o ~6 dB za nisko i **różnie za nisko dla każdego** (zależnie od udziału w rozmowie), więc wyrównanie na tej podstawie jest z definicji błędne.

## 2.4 Ducking muzyki pod mowę

```
Sidechain: suma wszystkich ścieżek mowy, band-pass 300–3400 Hz, RMS 30 ms
Wyzwolenie: detekcja aktywności mowy (jak §2.3 KROK 3), NIE próg poziomu
Anticipation: 150 ms lookahead → muzyka jest już ściszona, gdy pada pierwsza sylaba

TRYB DOMYŚLNY — ducking spektralny (brzmi wyraźnie lepiej):
  −8 dB tylko w 300–3400 Hz przez dynamiczne pasmo (LR4 split)
  → bas i góra muzyki zostają obecne, mowa wychodzi na wierzch

TRYB ALTERNATYWNY — broadband:
  −12 dB (bed music) / −18 dB (gęsty utwór)

Obwiednia: atak 120 ms (muzykalny, nie klik), hold 400 ms,
           release 700 ms krzywą S (podniesiony cosinus, NIE eksponenta —
           eksponenta brzmi jak pompowanie)

Zapis: krzywa automatyki gain na ścieżce muzyki w EDL — WIDOCZNA i EDYTOWALNA.
       Nie ukryty procesor. Użytkownik musi móc nadpisać każdy punkt.
```

## 2.5 Wypełniacze i oddechy — reguły

Lista PL: `yyy/eee/mmm`, `no`, `znaczy`, `jakby`, `tak jakby`, `wiesz`, `no wiesz`, `prawda`, `generalnie`, `w zasadzie`, `powiedzmy`, `że tak powiem`, `tego`, `no dobra`, `tak?` + powtórzenia (to samo słowo 2× w oknie 600 ms).

**Krytyczne:** Whisper jest trenowany na czystych napisach i **sam usuwa wypełniacze** — „yyy" nie ma w transkrypcji, choć jest w audio. Dlatego detekcja jest **akustyczna** (segment voiced 120-400 ms, F0 płaskie ±20 centów, brak zmiany formantów, otoczony pauzami ≥150 ms), a tekst służy tylko do etykietowania leksykalnych (`no`, `jakby`). Polskie wypełniacze są leksykalnie dwuznaczne w stopniu, w jakim angielskie `um/uh` nie są (`No dobra, zrobiłem` vs `No, i wtedy no poszedłem`), więc **auto-usuwanie jest wyłączone konstrukcyjnie** — tylko flagi w warstwie tokenów i podgląd „usuń wszystkie zaznaczone".

Punkt cięcia: przesunięcie do lokalnego minimum energii w ±40 ms, potem do najbliższego przejścia przez zero, crossfade equal-power 15 ms.

---

# 3. KOMPENSACJA LATENCJI

## 3.1 Rozkład opóźnienia

```
L_rt = L_out + L_air + L_in + L_dsp
  L_out  bufor software + driver + DAC + (Bluetooth)
  L_air  d / 343 m·s⁻¹   (mikrofon wbudowany: ~10 cm → 0,3 ms; laptop ~20 cm → 0,6 ms)
  L_in   ADC + driver + bufor wejściowy
  L_dsp  nasz łańcuch monitoringu (znany dokładnie: 1,66 ms, +32 ms gdy pitch ON)
```

## 3.2 Tier 1 — raport platformy (prior, nie wynik)

| Platforma | API | Uwagi |
|---|---|---|
| **web** | `AudioContext.outputLatency`, `.baseLatency`; `MediaStreamTrack.getSettings().latency` | **niekompletne** — Safari nierzadko nie podaje `outputLatency`, `.latency` wejścia prawie nigdy nie jest wypełnione → pomiar akustyczny OBOWIĄZKOWY |
| **iOS** | `AVAudioSession.outputLatency`, `.inputLatency`, `.ioBufferDuration` | dokładne, zawierają tor sprzętowy. Typowo 8-20 ms wired, 120-250 ms Bluetooth |
| **Android** | `AudioTrack.getTimestamp()` (framePosition + nanoTime), `AudioRecord.getTimestamp()` (API 24+), `AAudioStream_getTimestamp()`, `AudioManager.getProperty(PROPERTY_OUTPUT_FRAMES_PER_BUFFER)` | Oboe (Apache-2.0 [V], push 2026-07-10) opakowuje |

## 3.3 Tier 2 — pomiar akustyczny (autorytatywny, ten sam kod w `vc-latency`)

```
SYGNAŁ POMIAROWY
  3 × chirp liniowy 500 Hz → 8000 Hz
  długość 2048 próbek (42,67 ms), okno Tukey α=0,1
  amplituda −12 dBFS, odstęp 300 ms ciszy

  Dlaczego chirp pasmowy, nie klik:
    - klik rozprasza energię także tam, gdzie głośnik i mikrofon telefonu nie pracują
    - 500 Hz–8 kHz to pasmo, w którym każdy głośnik telefonu realnie gra
    - matched filter daje ~30 dB zysku przetwarzania → odporność na szum pokoju
    - przeżywa dowolne przetwarzanie w torze (w przeciwieństwie do kliku)

PROCEDURA
 1. Zapytaj o trasę: słuchawki vs głośnik. Kalibruj OSOBNO dla każdej.
 2. Odtwórz sekwencję i nagrywaj JEDNOCZEŚNIE z tego samego AudioContext /
    AVAudioEngine / AAudio stream — wspólny zegar to warunek konieczny.
 3. Zapisz sample index, na którym każdy chirp został ZAPLANOWANY
    (sample-accurate, bo planujemy go sami we własnym grafie).
 4. Matched filter przez FFT:
        r = IFFT( FFT(rec) · conj(FFT(chirp)) )
        env = |r + i·Hilbert(r)|          ← obwiednia analityczna
 5. Pik w oknie ±400 ms wokół oczekiwanego przyjścia; interpolacja paraboliczna
    obwiedni → rozdzielczość praktyczna ±0,1 ms.
 6. ROBUSTNOŚĆ: 3 pomiary muszą zgadzać się w granicach 2 ms → bierz MEDIANĘ.
    Rozjazd >2 ms  → trasa niedeterministyczna (BT z adaptacyjnym buforem)
                   → powtórz 7 chirpami, raportuj IQR jako niepewność.
    IQR >5 ms      → OSTRZEŻ: tej trasy nie da się rzetelnie skompensować,
                     zaproponuj przewód.
 7. Odjęcie L_air: mikrofon wbudowany → stałe 0,5 ms.
    Głośniki zewnętrzne → zapytaj o odległość
    (błąd 1 m = 2,9 ms, czyli na granicy percepcji — więc pytamy, nie zgadujemy).
 8. Wynik: L_rt w próbkach przy sample rate projektu.
```

## 3.4 Klucz przechowywania — latencja jest własnością TRASY, nie urządzenia

```rust
struct LatencyKey {
    platform: Platform,
    os_major: u32,
    output_route_id: String,   // iOS: portType + uid ; Android: AudioDeviceInfo type+id
    input_route_id:  String,   //  web: deviceId/groupId + sinkId + hash(outputLatency)
    output_sample_rate: u32,
    io_buffer_frames: u32,
    monitoring_dsp_enabled: bool,
}
struct LatencyCal { l_rt_samples: i32, l_out_samples: i32, iqr_ms: f32, measured_at: i64, n_chirps: u8 }
```

**Unieważnienie (bez tego kalibracja jest bezużyteczna):**
- iOS: `AVAudioSession.routeChangeNotification`
- Android: `AudioManager.registerAudioDeviceCallback`
- web: `devicechange` event **oraz** zmiana `outputLatency` o >2 ms

## 3.5 Zastosowanie — trzy różne miejsca, trzy różne liczby

**(a) Wyrównanie nagranego take'a — to naprawia obecny błąd krytyczny**
```
clip.timeline_in  = scheduled_backing_start + (capture_start − scheduled_start)
clip.latency_comp = −L_rt          // signed samples, W EDL
```
Kompensacja jest **liczbą w EDL, nigdy wypaloną w audio** — gdy kalibracja się poprawi, take da się wyrównać ponownie bez utraty materiału. Przechowujemy surowe nieskompensowane nagranie + wartość kompensacji.

**(b) Scoring live**
Melodia referencyjna jest **symboliczna** i nie przechodzi przez głośnik, więc ramka mikrofonu z czasu `t` odpowiada czasowi melodii `t − L_in − L_analysis`. Potrzebne jest tylko **wejście + analiza**, nie pełne `L_rt`:
```
L_in = L_rt − L_out          (L_out z Tier 1 — jedyne miejsce, gdzie raport platformy jest nośny,
                              i jest OK, bo potrzebujemy tylko PODZIAŁU, a suma jest zmierzona)
fallback bez raportu: L_out = L_in = L_rt/2, oznacz estymatę jako zgrubną
L_analysis = okno/2 + hop = 1024 + 256 = 1280 próbek = 26,7 ms
```

**(c) Overdub** — EDL z (a) załatwia to automatycznie, pod warunkiem tej samej trasy.

## 3.6 Detekcja driftu w długich take'ach

```
Znacznik: ton 19,5 kHz, AM m-sekwencją 63-bitową 8 chipów/s, −50 dBFS,
          wmieszany w podkład NA CZAS NAGRANIA.
Po take'u: korelacja nagranej kopii → offset na starcie i na końcu → drift w ppm.
|drift| > 20 ppm → resampling take'a rubato ratio (1+δ).

Na 19,5 kHz i −50 dBFS jest to niesłyszalne i przechodzi przez tor akustyczny
każdego urządzenia pracującego na 48 kHz.
Trasa Bluetooth HFP (16 kHz) → POMIŃ tracking i OSTRZEŻ.
Dla ŚPIEWU: na trasach HFP domyślnie ODMAWIAMY nagrywania i podajemy powód
(HFP forsuje 16 kHz i 120–250 ms zmiennej latencji).
```

## 3.7 Kryteria akceptacji (test, nie opinia)

1. **Loopback przewodowy** (wyjście → wejście): zmierzone `L_rt` = `outputLatency + inputLatency` raportowane przez platformę **±2 ms**.
2. **Test nulowy:** nagraj kopię podkładu przez loopback, zastosuj kompensację, zsumuj z oryginałem odwróconym w fazie → **residuum < −40 dBFS** względem oryginału.

Test (2) jest właściwym kryterium przyjęcia całego podsystemu i musi być w CI/QA.

---

# 4. KOREKCJA INTONACJI

## 4.1 Macierz silników

| Silnik | Licencja | Werdykt | Uzasadnienie MERYTORYCZNE |
|---|---|---|---|
| **WORLD** (mmorise/World) | **BSD 3-Clause** [V] (LICENSE.txt), push 2026-02-18, 1332★ | **REKOMENDACJA — render, 150-600 centów** | Jawna dekompozycja źródło-filtr: F0 + obwiednia (CheapTrick) + aperiodyczność (D4C). Zmiana F0 **nie dotyka obwiedni**, więc formanty są zachowane **przez konstrukcję**, nie heurystyką |
| **TD-PSOLA** (własna impl.) | algorytm wolny | **REKOMENDACJA — render, ≤150 centów** | Zero rozmycia widmowego, zachowuje przebieg glotalny. Najbardziej przejrzysty przy małych korektach — a większość realnych korekt jest mała |
| **Signalsmith Stretch** | **MIT** [V] (repo + `signalsmith-stretch@1.3.2` npm, oficjalny WASM/AudioWorklet), push 2026-01-24, 528★ | **REKOMENDACJA — monitoring** | Real-time, header-only C++11, `setFormantFactor`/`setFormantBase` z kompensacją. **Własne README stwierdza: formanty „not as sharp as monophonic algorithms (such as PSOLA)"** → autorytatywne potwierdzenie, że jego rolą jest tor RT, nie render |
| **Rubber Band v4.0.0** | **GPL albo płatna komercyjna** [V] (breakfastquay.com) | **ODRZUCONY** | Copyleft niekompatybilny z zamkniętym binarium w App Store. Licencja komercyjna istnieje, ale dla materiału **monofonicznego** metody źródło-filtr dają równą lub lepszą naturalność → zapłata kupuje **zero jakości**. To odrzucenie jakościowe, nie kosztowe |
| **zplane élastique** | komercyjna per-title/per-seat | **ODRZUCONY** | To samo rozumowanie + niemożliwość wniesienia kodu do własnego rdzenia (łamie fundament z §0) |
| **SoundTouch** | LGPL-2.1 | **ODRZUCONY** | Jakość klasy WSOLA (rozmycie formantów przy większych shiftach) **oraz** friction LGPL przy statycznym linkowaniu. Gorszy na obu osiach |
| **RVC** | MIT [V], push 2026-07-23, 36 735★ | **ODRZUCONY merytorycznie** | Voice **conversion** — resyntezuje barwą docelowego mówcy. Obietnica produktu to „ty, w stroju"; zmiana tożsamości głosu jest **błędem, nie funkcją** |
| **so-vits-svc** | **AGPL-3.0, ARCHIWALNY** [V], ostatni push 2023-11-11 | **ODRZUCONY** | AGPL + martwy + to samo co wyżej |
| **Vocos** (gemelo-ai) | MIT [V], push 2024-08-07 | **WARUNKOWO — v2** | Neuronowy wokoder resyntezujący z (mel + F0) pobiłby WORLD przy dużych shiftach. Publiczne checkpointy są mel-only, speaker-general TTS — dla **konkretnego** głosu na 48 kHz wymagają własnego treningu. To pułap jakości v2, nie v1. Repo pół-uśpione |

## 4.2 Werdykt: hybryda trzech silników, wybór per nuta

```
|Δ| ≤ 150 centów      →  TD-PSOLA                                (najbardziej przejrzysty)
150 < |Δ| ≤ 600       →  WORLD (F0 podmienione, CheapTrick nietknięty)
|Δ| > 600 centów      →  WORLD + skalowanie formantów × (1 + 0,25·(ratio − 1))
                          (pełne zachowanie formantów przy oktawie brzmi
                           jak odwrócony chipmunk; 25% podążania to naturalny kompromis)
monitoring real-time  →  Signalsmith Stretch, presetCheaper, formant compensation ON
```

**F0 dla WORLD podaje NASZ pYIN, nie Harvest.** Jedna prawda o F0 w całym produkcie: ta sama krzywa napędza scoring, wizualizację i korekcję. Bez tego użytkownik dostaje ocenę „fałszujesz" i korekcję, która porusza nutę gdzie indziej.

**WORLD @48 kHz:** `frame_period = 5,0 ms`, `fft_size = 4096` (nie domyślne 2048 — potrzebne, by `f0_floor = 60 Hz` sięgnął C2 = 65,4 Hz), `f0_ceil = 1200 Hz`, `d4c_threshold = 0,85`.

**TD-PSOLA — detekcja epok (GCI):** residuum LP rzędu 32, sygnał średniej ruchomej po 1,75·T0 → interwały kandydujące → pik residuum w każdym; programowanie dynamiczne po spójności T0. Okna OLA: 2 okresy, Hann.

## 4.3 Korekcja MUZYKALNA — reguły

### (1) Martwa strefa — nigdy nie koryguj wewnątrz
`d0(stopień) = 12 + |JI_adj(stopień)|` centów. Domyślnie: **a cappella 20 centów**, **stały podkład ET 12 centów**.
*Dlaczego:* eksperci oceniają ±20-25 centów jako „w stroju" (Vurma & Ross 2006). Korygowanie 10 centów to korygowanie błędu niesłyszalnego dla nikogo — i usuwanie mikro-wariacji, która sprawia, że wokal brzmi żywo.

### (2) Retune speed — krzywa, nie liczba
```
retune_time_ms = clamp( 60 · (1 + 0,5·log2(dur_ms/300)), 25, 250 )
  krótkie nuty korygują szybko (inaczej zostaną pominięte)
  długie nuty korygują wolno (słyszalne „snapowanie" to sygnatura nr 1 auto-tune'a)

OCHRONA ATAKU:  zero korekcji w pierwszych max(40 ms, 0,12·dur),
                potem narastanie gainu korekcji podniesionym cosinusem przez retune_time_ms
                → scoop i portamento to TECHNIKA, nie błąd
OCHRONA RELEASE: zero korekcji w ostatnich 30 ms
LIMIT PRĘDKOŚCI: max 400 centów/s stosowanej korekcji
                → powyżej korekcja jest słyszalna jako glissando
```

### (3) Zachowanie vibrata — obowiązkowe
```
Dekompozycja konturu centowego nuty:   c(t) = trend(t) + vib(t)
  trend = Savitzky-Golay rzędu 2, okno = round(T_vib/hop) wymuszone nieparzyste
          (czyli DOKŁADNIE jeden okres vibrata, zero-phase)
  vib   = c − trend

Detekcja vibrata (wymaga ≥500 ms stanu ustalonego):
  FFT(c − mediana(c,250 ms)), okno Hann, zero-pad 1024
  vibrato obecne ⟺ pik w 4,0–9,0 Hz o mocy ≥4× (6 dB) średniej mocy 1–15 Hz
                    AND amplituda peak-to-peak ≥30 centów

KORYGUJ WYŁĄCZNIE `trend`. Wstrzyknij `vib` NIETKNIĘTE.
  Vibrato zawodowca to ±34…±123 centów (średnia ±71, Prame 1997).
  Spłaszczenie go niszczy najwyraźniejszy marker wyszkolonego głosu.
Opcjonalny suwak „głębokość vibrata" skaluje vib × 0,5…1,5 —
  kontrola MUZYCZNA, nie korekcja.
```

### (4) Bramka wierności — odmów korekcji, gdy wejście jej nie uzasadnia
Pomiń nutę, jeśli **którykolwiek** warunek:
- voiced fraction < 0,7
- mediana confidence pYIN < 0,6
- czas trwania < 100 ms
- HNR < 6 dB (oddechowa/szeptana — korekcja zabrzmi syntetycznie)
- wymagane `|Δ| > 700 centów` → **to zła nuta, nie błąd stroju** → flaga w UI „zła nuta?", nie cicha transpozycja
- spectral flux wewnątrz nuty > próg → są tu dwie nuty, segmentacja zawiodła
- ramka w wykrytym regionie spółgłoskowym/bezdźwięcznym (korekcja daje artefakt „gargle")

**Globalny bypass:** jeśli mediana `|Δ|` całego take'a > 250 centów — estymata transpozycji jest zła albo użytkownik śpiewa w innej tonacji. Przelicz tonację i **zapytaj**.

### (5) Wybór celu
A cappella → najbliższy dopuszczalny stopień skali z korektą JI (tercja wielka −14, tercja mała +16, seksta wielka −16, kwinta +2 centa).
Stały podkład → siatka ET tonacji podkładu **plus zmierzony wolny offset O(t)**, żeby nie walczyć z podkładem celowo obniżonym.

### (6) Wet/dry
Amount 0-100% to **blend krzywej korekcji F0**, nie crossfade audio. Crossfade dwóch wersji wysokości daje filtrację grzebieniową. Przy 60% nuta przechodzi 60% drogi do celu.

### (7) Straż artefaktów — pipeline samosprawdzający
Po syntezie: odległość obwiedni widmowej wejście↔wyjście per nuta (cosinus na log-mel, 40 pasm). Jeśli **> 0,08** → korekcja uszkodziła barwę → **automatyczny fallback do łagodniejszego silnika** (WORLD → PSOLA → bypass) + log.
To jest różnica między „czasem świetne" a „zawsze godne zaufania".

---

# 5. ENHANCEMENT: odszumianie i dereverberacja

## 5.1 Czy modele MOWY niszczą ŚPIEW? Tak — i jest to udokumentowane

**arXiv 2607.11630** [V, arXiv API]: Bereuter, Plumbley, Sontacchi, **2026-07-13** — *„Teaching Speech Enhancement Models to Sing: Domain Adaptation from Speech Enhancement to Singing Voice Separation"*.

Ustalenia, które przekładają się na architekturę:
- modele mowy **adaptowane** do śpiewu biją modele trenowane **od zera** o **0,29-1,8 dB SDR** → pretrening na mowie jest genuinie cenny, więc odpowiedź to **adaptuj**, nie unikaj
- **pełne dotrenowanie NISZCZY zdolność mowy** modelu
- **LoRA ją zachowuje przy +6-12% parametrów**, z konkurencyjną separacją
- wariant generatywny lepiej generalizuje na nowe dane

**Mechanizm szkody (żeby dało się przewidzieć, a nie tylko zmierzyć):**
1. Wytrzymana samogłoska z vibratem wygląda dla modelu mowy jak **szum tonalny** (buczenie, piszczenie) — model ją tłumi.
2. Modele mowy uczą się usuwać energię >8 kHz niebędącą frykatywą. Tam żyje „powietrze", oddech i blask śpiewaka → głos robi się matowy.
3. Modele **16 kHz** (FRCRN, MossFormerGAN, domyślny GTCRN, większość wariantów DPDFNet) **nieodwracalnie kasują wszystko powyżej 8 kHz**. Dla śpiewu to śmiertelne.

## 5.2 Architektura: jeden model bazowy, dwa adaptery LoRA

```
BAZA:  dpdfnet2_48khz_hr        Apache-2.0 [V]
       2,58 M par. · 2,42 GMACs · 10,0 MB ONNX / 11,6 MB TFLite
       okno 20 ms, hop 10 ms, tryb streaming, --attn-limit-db  [V README]

  + adapter_speech = IDENTITY        (baza JEST modelem mowy)
  + adapter_sing   = własny LoRA rank-8 na warstwach dual-path

Koszt: 10,0 MB bazy + ~1 MB adaptera.
Wobec: 2 pełne modele = 20 MB + dwie ścieżki kodu + dwa zestawy błędów.
I paper mówi wprost, że LoRA jest LEPSZA od modelu śpiewu trenowanego od zera.

MAX QUALITY offline: dpdfnet8_48khz_hr — 3,63 M par., 7,17 GMACs, 14,2 MB ONNX [V]
FALLBACK słabe urządzenia: GTCRN — MIT [V], 48,2 K par., 696★, push 2026-01-18
ALTERNATYWA 48 kHz: MossFormer2_SE_48K — Apache-2.0 [V] (alibabasglab, HF)
```

**Reguła nienaruszalna:** ścieżka analizy F0 / scoringu czyta **ZAWSZE SUROWY** sygnał. Enhancement istnieje wyłącznie w torze renderu i monitoringu. Inaczej aplikacja ocenia wyjście modelu, nie śpiewaka.

**Modele generatywne/restoration odrzucone bezwarunkowo** (VoiceFixer MIT, Resemble Enhance): **halucynują**. Przy aplikacji treningowej to błąd poprawności — użytkownik byłby oceniany za dźwięk, którego nie zaśpiewał. Liczbowo: Resemble Enhance ma DNSMOS OVRL 3,12 (praktycznie tyle co najlepsze) przy **SI-SDR 12,42 dB vs 19,36 dB** dla MossFormer2 — metryki percepcyjne tego nie pokazują, SI-SDR pokazuje.

**PESQ/STOI/DNSMOS są bez sensu dla śpiewu** — wszystkie trzy są skalibrowane na mowie. Tuning łańcucha SING pod DNSMOS wytuninguje go pod „brzmi jak mowa".

## 5.3 Odszumianie ŚPIEWU v1 — harmonicznie chroniony spectral gating

Zanim adapter LoRA istnieje, to jest **lepsze** od generycznego denoisera dla tej treści i kosztuje zero ryzyka licencyjnego:

```
Widmo szumu N(f) z 2 s kalibracyjnej ciszy (§5.5)
Odjęcie: over-subtraction α = 1,5 ; spectral floor β = 0,15
         → MAX ATENUACJA −16 dB, nie −40
Gain wygładzony po 3 ramkach (Wiener-style)

OCHRONA HARMONICZNA (możliwa tylko dlatego, że mamy dobry track F0):
  gain wymuszony na 1,0 w binach ±40 centów od F0 i 12 pierwszych harmonicznych
  → zaśpiewana nuta zostaje nietknięta

STRAŻ MUSICAL NOISE:
  jeśli wariancja gainu po binach w ramce > próg → lokalnie podnieś β
```

## 5.4 Dereverberacja — model permisywny NIE ISTNIEJE

**Przegląd wyczerpujący** [V, HF API]:

| Model | SDR/jakość | Licencja | Werdykt |
|---|---|---|---|
| `anvuew/dereverb_mel_band_roformer` | SDR 19,17 / 20,40 (mono) — **najlepszy publicznie** | **GPL-3.0** | ODRZUCONY |
| `anvuew/dereverb_bs_roformer` | wysoka | **GPL-3.0** | ODRZUCONY |
| `Sucial/Dereverb-Echo_Mel_Band_Roformer` | wysoka | **CC-BY-NC-SA-4.0** | ODRZUCONY (zakaz komercyjny) |
| `Intel/dereverb_mel_band_roformer_anvuew_openvino` | = anvuew | **GPL-3.0** | ODRZUCONY |
| `mochiya98/melbandroformer_variant` | — | **GPL-3.0** | ODRZUCONY |
| SGMSE / StoRM (sp-uhh) | dyfuzyjne | MIT | ODRZUCONY — halucynują, zbyt wolne |

**ZERO modeli dereverb na licencji MIT / Apache / BSD / CC-BY.**

### Odpowiedź trzyczęściowa

**(1) Teraz — WPE** (algorytm `nara_wpe`, **MIT** [V], 569★, push 2025-03-19)
```
single-channel, taps 24 (śpiew) / 30 (mowa)
prediction delay 3 ramki, 4-5 iteracji
STFT 1024/256 @48 kHz, wet ≤60%
Zysk: ~+0,5–1,5 dB SRMR — umiarkowany, ale NIGDY nie uszkadza głosu
```
Zalety merytoryczne, nie ekonomiczne: liniowy, **treścio-agnostyczny** (identycznie działa na mowie i śpiewie — tu realna przewaga nad każdym modelem uczonym), i **nie może halucynować**.

**(2) Darmowe 80%** — większość „pogłaśniętych" nagrań domowych to problem **modów pomieszczenia i wczesnych odbić**, który lepiej reaguje na dynamiczny tłumik rezonansów (§1.2/7) + EQ de-boxiness 300-500 Hz niż na jakikolwiek dereverb net. Wdrożyć to pierwsze i **zmierzyć DRR przed/po**.

**(3) v2 — własny adapter LoRA dereverb.** To nie jest odłożenie z powodu kosztu — to **jedyna istniejąca droga** do niekopyleftowego dereverbu:
```
Baza: ta sama dpdfnet2_48khz_hr (Apache-2.0)
Dane syntezowalne bez ograniczeń:
  suche wokale (VocalSet, vocadito, własne najlepsze take'i za zgodą użytkowników)
  ⊗ generowane RIR (metoda źródeł obrazowych albo pyroomacoustics MIT)
  RT60 200–800 ms, DRR −5…+15 dB
  → nieograniczona liczba par oznaczonych
Przepis treningu: dokładnie jak arXiv 2607.11630 (LoRA rank-8, 6–12% parametrów)
```

## 5.5 Kalibracja wejścia (start sesji) — zamiast `rmsThreshold = 0.001`

```
KROK 1 — cisza 2,0 s: ramki 20 ms / hop 10 ms → 200 pomiarów RMS dBFS
         N = mediana; zapisz też widmo szumu w 8 pasmach (dla §5.3)
         ODRZUĆ I POWTÓRZ jeśli percentyl 90 > mediana + 10 dB (ktoś mówił, drzwi)
KROK 2 — głos 3,0 s: zmierz medianę i percentyl 10 poziomu mowy/śpiewu
KROK 3 — próg voicingu = N + 12 dB, histereza 4 dB
KROK 4 — ciągła aktualizacja N trackerem percentylowym (10. percentyl, okno 30 s)
```
Stała absolutna nie może być poprawna: rozrzut między mikrofonem laptopa z AGC (szum jałowy −50…−40 dBFS) a kondensatorem USB (−70 dBFS) to **25-30 dB**.

---

# 6. SEPARACJA GŁOSU OD PODKŁADU

## 6.1 Macierz modeli

| Model | SDR wokal (Multisong) | Kod | Wagi | Werdykt |
|---|---|---|---|---|
| **BS PolarFormer** | **11,00** — najwyższy na leaderboardzie | ZFTurbo MSST **MIT** [V] 1455★ push 2026-07-12; lucidrains/BS-RoFormer **MIT** [V] 877★ push 2026-06-14 | **MIT** [V] `bgkb/bs_polarformer` | **PODSTAWOWY** |
| Mel-Band Roformer (KimberleyJensen) | 10,98 | MIT [V] | **MIT** [V] `KimberleyJSN/melbandroformer` | **FALLBACK** |
| BS Roformer (viperx) | 10,87 | MIT | nieustalona | pomiń |
| MDX23C | 10,17 | MIT | — | pomiń |
| MDX-Net (kuielab) | < MDX23C | MIT [V], **push 2023-02-27** | — | **ODRZUCONY** — przestarzały |
| Segm Models VitLarge23 | 9,77 | MIT | — | pomiń |
| **HTDemucs** | ~9 (klasa) | **MIT** [V] `adefossez/demucs` push 2026-07-11 (`facebookresearch/demucs` **ARCHIWALNY**) | MIT | **DRUGI SILNIK — 4 stemy do ćwiczeń** |
| `yongyizang/16k_Vocal_Lightweight_MelBandRoformer` | — | — | **MIT** [V], 60 MB ckpt, **16 kHz** | **tylko PODGLĄD** |
| Fine-tuny MIT/Apache | — | — | `SYH99999/*` MIT, `SYH99999/MelBandRoformer4StemFTLarge` Apache-2.0, `Aname-Tommy/Mel-Band-Roformer_Duality` Apache-2.0 [V] | rezerwa |
| `becruily/*`, `Sucial/*` | wysokie | — | CC-BY-NC / brak | ODRZUCONE |

## 6.2 BS PolarFormer — pełna specyfikacja [V, HF README + tree API]

```
SDR wokal (Multisong): 11,00
Parametry ONNX core: 51 M
Architektura: BandSplit (60 pasm) + 12 bloków transformera
              (8 głów attention, dim 256, polar positional embeddings) + MaskEstimator

PLIKI:
  bs_polarformer.onnx              210 652 828 B  (fp32)
  bs_polarformer_fp16.onnx         108 325 429 B
  bs_polarformer_webgpu.onnx       210 607 721 B
  bs_polarformer_webgpu_fp16.onnx  108 302 219 B   ← TEN
  index.html                        22 599 B      ← działające demo przeglądarkowe
  model_bs_polarformer_float16.yaml

WIERNOŚĆ vs PyTorch:
  fp32  SNR 107 dB
  fp16  SNR 48,6 dB · Pearson 0,999996 42  → PERCEPCYJNIE BEZSTRATNE

I/O:  sample rate 44 100 Hz, stereo
      wejście  (batch, time_frames, 4100)      interleaved stereo STFT
      wyjście  (batch, 1, 2050, time_frames, 2) maska zespolona
      *** STFT/iSTFT SĄ POZA GRAFEM ONNX *** → należą do naszego rdzenia
```

**To jest decydujące:** graf ONNX celowo nie zawiera STFT/iSTFT, więc `vc-separate` implementuje je **raz w Rust** i identycznie na trzech platformach. Nasze są okna, chunking, overlap-add i aplikacja maski — czyli wszystko, co decyduje o brzmieniu.

## 6.3 Wdrożenie — NA URZĄDZENIU, trzy platformy

```
Model: jednorazowy download 108,3 MB, weryfikacja SHA-256 (hash zapięty w repo)
Storage: OPFS (web) / Application Support + isExcludedFromBackup (iOS) / filesDir (Android)

RUNTIME: ONNX Runtime v1.28.0 [V, release 2026-07-25]
  web      ort-web, EP 'webgpu' → fallback 'wasm' (SIMD, single-thread, BEZ COOP/COEP)
  iOS      ORT + CoreML EP (preview) → fallback CPU/XNNPACK
  Android  ORT + NNAPI → fallback XNNPACK

CHUNKING (w rdzeniu):
  chunk 131 584 próbki [V — domyślna wartość z docs MSST]
  overlap 25%, okno podniesiony cosinus na granicach
  STFT 2048 / hop 512 / win 2048 [V]

PIPELINE:
  źródło 48 kHz → rubato sinc 256 tapów → 44,1 kHz stereo
  → STFT → ONNX → maska → iSTFT → overlap-add
  → rubato → 48 kHz  (jednorazowo)
  → CACHE jako asset projektu: FLAC 48/24, klucz = (content_hash utworu, model_hash)
     → separujemy RAZ, używamy zawsze

WYDAJNOŚĆ: WebGPU na nowoczesnym GPU ≈ w okolicy real-time dla utworu 3,5 min;
           wasm-SIMD ~10–20× wolniej → minuty.
           OBA akceptowalne dla zadania offline z paskiem postępu.
           *** NIGDY w ścieżce interaktywnej. ***
Low-end Android: model 16 kHz jako szybki PODGLĄD, pełny jako opt-in.
```

## 6.4 Dlaczego on-device, a nie serwer — argument merytoryczny

Flagowa funkcja „śpiewaj do dowolnej swojej piosenki" przy ścieżce serwerowej wymagałaby **wysyłania cudzej muzyki objętej prawem autorskim na nasze serwery** — to ekspozycja prawna, którą **my** byśmy posiadali, i historia prywatności, której musielibyśmy bronić. On-device: plik nie opuszcza telefonu. To, że jest to również darmowe, jest efektem ubocznym, nie powodem.

Serwer zostaje wyłącznie jako **jawna, uruchamiana przez użytkownika** akcja „zrób to szybciej w chmurze", z tą samą wagą modelu.

## 6.5 Wartość produktowa poza karaoke

Separacja oryginalnego wokalu daje **ground-truth kontur F0 profesjonalnego wykonania** — nieporównanie lepszy cel treningowy niż transkrypcja MIDI, i rozwiązuje problem pustej biblioteki utworów (`lib/midi-parser.ts:396` — pusta tablica) z **dowolnych plików użytkownika**. Dodatkowo HTDemucs 4-stem pozwala wyciszyć bas, wysolować perkusję, ćwiczyć do samej sekcji rytmicznej.

---

# 7. MASTERING I EKSPORT

## 7.1 Pomiar głośności — BS.1770-4 w rdzeniu

```
K-weighting: shelving HP +4 dB @ ~1681 Hz  +  HP RLB @ 38 Hz
             (współczynniki ZALEŻĄ od sample rate → wymuszamy 48 kHz)
Bloki 400 ms z 75% zakładką
Gating: absolutny −70 LUFS  +  relatywny −10 LU poniżej wartości niegatowanej

RAPORTUJEMY: momentary (400 ms) · short-term (3 s) · integrated (gated)
             · LRA · sample peak · TRUE PEAK (4× oversampling, polyphase FIR 4×32 tapy)
```
**libebur128 (MIT** [V], 491★) jako **złota referencja w testach**, nie jako zależność linkowana — implementujemy sami i porównujemy do niego w CI. Trzymamy zasadę rdzenia bez zależności i jeden kod zamiast trzech buildów.

## 7.2 Limiter dwustopniowy

```
STOPIEŃ 1 — soft-knee kompresor gęstości
  thr = ceiling − 6 dB, ratio 4:1, knee 6 dB, atak 5 ms, release 100 ms
  → limiter nie jest proszony o 10 dB

STOPIEŃ 2 — lookahead peak limiter
  lookahead 5 ms (render) / 1,5 ms (monitor)
  atak natychmiastowy
  release DWUSTOPNIOWY: 20 ms i 200 ms RÓWNOLEGLE, wynik = max(oba)
  detekcja 4× oversampled  → łapie INTERSAMPLE PEAKS
  ceiling −1,0 dBTP

TWARDY LIMIT: nigdy więcej niż 6 dB limitowania.
Jeśli target wymaga więcej → POWIEDZ UŻYTKOWNIKOWI i zaproponuj niższy target.
```

## 7.3 Dithering
TPDF ±1 LSB + **noise shaping 2. rzędu (Lipshitz/Vanderkooy, E-weighted)**.
Stosowany **wyłącznie** przy konwersji float → **16 bit**. Nie dla 24-bit, nie dla float.

> Obecny kod eksportuje 16-bit **bez ditheringu i bez limitera**, przy presetach z `outputGain` do 1,25 — dwa słyszalne błędy nałożone na siebie.

## 7.4 Presety dostawy

| Preset | Integrated | True peak | LRA cel | Uwagi |
|---|---|---|---|---|
| `PODCAST_STEREO` | **−16 LUFS** | −1,0 dBTP | 4-8 LU | de facto standard branży [?] |
| `PODCAST_MONO` | **−16 LUFS** | −1,0 dBTP | 4-8 LU | patrz pułapka +3 LU |
| `MUSIC_STREAMING` | **−14 LUFS** | −1,0 dBTP | 6-12 LU | Spotify / YouTube / Amazon / Tidal [?] |
| `MUSIC_LOUD` | −9 LUFS | −1,0 dBTP | — | ostrzeż, że Spotify to ściszy |
| `BROADCAST_EBU_R128` | **−23 LUFS** ±0,5 | −1,0 dBTP | ≤18 LU | [?] |
| `BROADCAST_ATSC_A85` | −24 LKFS | −2,0 dBTP | — | US [?] |
| `AUDIOBOOK_ACX` | RMS −20 dB | **−3,0 dBFS** | — | noise floor **< −60 dBFS** [?] |
| `ARCHIVE` | brak normalizacji | brak | — | float32 WAV |

Wartości docelowe per platforma [?]: Apple Podcasts / Apple Music Sound Check −16 LUFS; Spotify −14 (TP −1, przy masterach >−14 sugerowane −2); YouTube ~−14; Amazon Music −14 (TP −2); Tidal −14; Deezer −15; AES TD1004 dla mowy −16…−20. **Jednorazowo sprawdzić przed releasem** — to jedyne liczby w tym dokumencie, których nie zweryfikowałem.

## 7.5 PUŁAPKA +3 LU
BS.1770 **sumuje średnie kwadratów kanałów**, więc ten sam głos zapisany jako **mono** i jako **dual-mono stereo** różni się o **3 LUFS**.
→ **Mierz ZAWSZE plik, który dostarczasz**, po ustaleniu layoutu kanałów. Test w CI.

## 7.6 Formaty i enkodery

| Rola | Format |
|---|---|
| **Źródło prawdy / projekt** | WAV RIFF, `fmt` tag **3** (`WAVE_FORMAT_IEEE_FLOAT`), **32-bit float, 48 kHz**; RF64 gdy >4 GB |
| **Archiwum** | FLAC 48 kHz / 24-bit |
| **Dostawa** | AAC-LC 256 kbps (192 mowa) · Opus 128 kbps (96 mowa) · FLAC 24-bit · WAV 24-bit |

| Platforma | Enkoder | Uwagi |
|---|---|---|
| **web** | **WebCodecs `AudioEncoder`** (opus / aac / flac / pcm) | sprzętowo wspierany, **zero bajtów payloadu**; fallback `opus-recorder` (BSD-3) |
| **iOS** | `AVAudioFile` / AudioToolbox `AudioConverter` (AAC, `kAudioFormatFLAC`, ALAC) | Opus: **własny build libopus (BSD-3)** — AudioToolbox nie ma Opusa |
| **Android** | `MediaCodec` (AAC, Opus, FLAC) | wszystkie trzy natywnie |

**Bez enkodera MP3 w aplikacji.** Wszystkie trzy platformy mają AAC/Opus/FLAC natywnie. MP3 oznaczałby albo LGPL i friction ze statycznym linkowaniem, albo zależność dla formatu, którego nikt w 2026 nie potrzebuje. Jeśli użytkownik żąda — serwerowo.

**Oversampling robimy WEWNĄTRZ procesorów (4×/8×), nie globalnie.** Nie podnosimy sample rate projektu do 96 kHz.

---

# 8. SILNIK AUDIO

## 8.1 Graf sygnałowy

```
Typy węzłów: Source(clip) · Bus · Send · Insert(chain) · Master
Topologia: DAG. Cykle odrzucane na etapie budowy grafu,
           z jedynym wyjątkiem jawnego FeedbackSend z opóźnieniem 1 bloku.

Model wykonania: PULL. Blok 128 próbek (najmniejszy kwant hosta)
                 + wewnętrzny akumulator dla DSP chcącego 2048/512.

Na każdy blok:
  1. transport += 128 próbek                    (INTEGER, nigdy float sekund)
  2. evaluacja automatyki na sample startu bloku
     + sub-blokowo co 16 próbek dla parametrów wrażliwych
  3. topologicznie posortowana evaluacja węzłów do PRE-ALOKOWANYCH buforów z puli

*** ZERO alokacji, ZERO locków, ZERO syscalli w rt_process ***
```

## 8.2 Scheduling sample-accurate

```
Pozycja transportu to INTEGER liczby próbek. Nigdy float sekund.

Klip grany ⟺ transport_sample ∈ [clip.timeline_in, clip.timeline_in + len)
Offset czytania źródła = clip.source_in + (transport_sample − clip.timeline_in)

Start w środku bloku: renderujemy CZĘŚCIOWY blok.
  Klip startujący na próbce 37 bloku 128-próbkowego zapisuje próbki 37..127.
```
Obecny silnik planuje na zegarze AudioContext — **model jest poprawny**; poprawka polega na tym, że wszystko musi być liczbami całkowitymi względem jednego licznika próbek.

## 8.3 Model danych EDL — jeden dla śpiewu i mowy

```rust
struct Project {
    id: Uuidv7, schema_version: u32,
    sample_rate: u32, tempo_map: Vec<TempoEvent>,
    tracks: Vec<Track>, master: Chain,
    sources: Vec<Source>,
    updated_at: i64, deleted_at: Option<i64>, device_id: Uuid,
}

struct Track {
    id: Uuidv7, name: String,
    kind: Vocal | Backing | Music | Speaker { index: u8 } | Sfx,
    clips: Vec<Clip>, chain: Chain,
    automation: Vec<Lane>, sends: Vec<Send>,
    latency_route_key: String,        // §3.4
}

struct Clip {
    id: Uuidv7, source_id: Uuidv7,
    source_in: u64, source_len: u64,   // próbki w źródle
    timeline_in: i64,                   // próbki na osi; MOŻE być ujemne
    latency_comp: i32,                  // §3.5 — NIGDY wypalone w audio
    gain_db: f32,
    fade_in: Fade, fade_out: Fade,      // Fade { len: u64, curve: Linear|EqualPower|SCurve(f32)|Exp(f32) }
    time_stretch: Option<StretchSpec>,
    pitch: Option<PitchSpec>,
    reversed: bool, mute: bool,
}

struct Source {
    id: Uuidv7, media_hash: [u8;32], path: String,
    sample_rate: u32, channels: u8, frames: u64,
    peaks: PeakPyramid,
}

// WARSTWA MOWY — addytywna, nie osobny model
struct Token {
    id: Uuidv7, clip_id: Uuidv7,
    t_start: u64, t_end: u64,            // próbki
    text: String,
    kind: Word | Filler | Breath | Pause | Silence,
    confidence: f32,
}
```

**Każda edycja to czysta funkcja `Project -> Project`. Próbki NIGDY nie są modyfikowane.**

Usunięcie zakresu (audio albo tekstu) = split klipu + dwa nowe klipy + **crossfade equal-power 15 ms** w miejscu styku, z punktem cięcia snapowanym do **lokalnego minimum energii w ±40 ms**, a potem do **najbliższego przejścia przez zero**.

Wymagana dokładność granicy słowa dla edycji tekstowej: **≤30 ms**. Natywne word timestamps Whispera (DTW na cross-attention) mają błąd ±100-200 ms, a średnie polskie słowo przy 150 słów/min trwa 300-400 ms → **forced alignment osobnym modelem CTC jest obowiązkowy**, transkrypcja i alignment to dwa niezależne kroki.

## 8.4 Undo/redo — log komend, nie snapshoty

```rust
trait Command {
    fn apply(&self, p: &mut Project) -> Result<Box<dyn Command>>;  // zwraca WŁASNĄ inwersję
    fn coalesce_key(&self) -> Option<(TypeId, Uuidv7)>;
}
```
- głębokość nieograniczona, **persystowana z projektem** → undo przeżywa reload
- koalescencja dragów/scrubów po `(typ komendy, target id)` w okienku **300 ms** → jeden drag = jeden krok undo
- zapis do storage **na commit, nie na mousemove**

> To wprost usuwa potwierdzony błąd krytyczny w `components/interactive-waveform.tsx:203-206`: undo kasuje audio bezpowrotnie, a drugie cięcie niszczy zły fragment. W EDL undo jest **arytmetyką** i **nie może** zgubić audio. Usuwa też `multi-track-timeline.tsx:590` (zapis do IndexedDB na każde zdarzenie scrolla i mousemove).

## 8.5 Automatyzacja

```rust
struct Lane {
    param: ParamId,
    points: Vec<Point>,   // Point { sample: u64, value: f32, curve: Linear|Hold|Bezier{c1,c2}|SCurve }
    enabled: bool,        // ← czyta SILNIK
    visible: bool,        // ← czyta TYLKO UI
}
impl Lane { fn value_at(&self, sample: u64) -> f32 }  // czysta funkcja + cursor cache
```

- **Evaluacja z POZYCJI SAMPLOWEJ TRANSPORTU, nigdy z `requestAnimationFrame`.** Obecna automatyka sterowana rAF **zamarza w tle** — gwarantowana ścieżka uszkodzenia renderu.
- Zastosowanie w RT: target na granicy bloku + jednobiegunowy smoother **τ = 5 ms**. Parametry wrażliwe (delay time, pitch) → interpolacja sub-blokowa co **16 próbek**.
- **`enabled` i `visible` to OSOBNE pola.** Ukrycie lane'a nie może wyłączać automatyki (potwierdzony błąd w `lib/track-processor.ts:132`).
- Automatyka EQ musi być evaluowana **także gdy insert jest w bypassie**, bo bypass sam jest parametrem automatyzowalnym.
- Nigdy przypisanie `.value` — zawsze smoother (unika trzasków).

## 8.6 Render offline

```
TEN SAM graf. TEN SAM kod węzłów. Pętla zamiast callbacku urządzenia.
Blok 4096. Transport::Offline → wszystko czasozależne używa zegara próbek.

PLUGIN DELAY COMPENSATION — obowiązkowa:
  każdy procesor raportuje latency_samples()
  graf opóźnia ścieżki równoległe o max latencję w gałęzi
  bez tego de-esser z 5 ms lookahead PRZESUWA WOKAL względem podkładu

DETERMINIZM: te same wejście + EDL + wersja rdzenia = BIT-IDENTYCZNY wynik.
  Wymuszone golden-file testem.

CI: render 3-minutowego projektu referencyjnego NA KAŻDY COMMIT,
    porównanie integrated LUFS (±0,1 LU), true peak (±0,1 dB),
    oraz residuum testu nulowego względem zapisanego wzorca (< −60 dBFS).
    → render NIE MOŻE być martwym kodem, jak jest dziś w lib/multi-track-engine.ts:373
```

## 8.7 Długie pliki, pamięć, waveform

```
NIGDY nie dekodujemy całej ścieżki do RAM.
  60 min · 48 kHz · stereo · f32 = 1,38 GB → nie może być Float32Array.

Źródła:
  native  mmap
  web     FileSystemSyncAccessHandle w WORKERZE (jedyne API dające
          synchroniczny random-access do dużych plików bez ładowania do RAM)
Dekod stronami 1 s → LRU cache 256 MB, read-ahead 2 s zależny od kierunku transportu.

PIRAMIDA PEAKÓW (min/max/rms per bucket):
  poziomy 1:64, 1:256, 1:1024, 1:4096, 1:16384, 1:65536
  liczona JEDNYM przebiegiem dekodu przy imporcie (nie trzema, jak dziś)
  zapisana obok źródła
  Renderer wybiera poziom, gdzie 1 bucket ≈ 1 piksel urządzenia
    → STAŁA rozdzielczość na każdym zoomie
      (dziś: sztywne 1000 próbek niezależnie od długości pliku)
  Canvas ma rozmiar VIEWPORTU, nie klipu
    → usuwa awarię przy klipie 5,5-minutowym przekraczającym max canvas przeglądarki
```

## 8.8 Persystencja

Jedna schema SQLite wszędzie: **web** SQLite Wasm na OPFS VFS (`SyncAccessHandle` w workerze), audio jako osobne pliki w OPFS; **native** to samo SQLite przez `rusqlite` w rdzeniu.
W każdej tabeli od pierwszego dnia: `id` UUIDv7 (sortowalny czasowo), `updated_at`, `deleted_at` (tombstone), `device_id`, `schema_version`.
Sesje treningowe jako **append-only event log** (niemutowalne → brak konfliktów przy sync).

> To zastępuje obecne trzy niezależne bazy IndexedDB + trzy klucze localStorage bez migracji i bez wspólnego ID (`lib/project-templates.ts:261`), oraz usuwa `pitchHistory` z localStorage (`hooks/use-session-library.ts:88` — ciche gubienie sesji po przekroczeniu quoty) i transfer base64 dataURL przez localStorage (`app/record/karaoke/page.tsx:299`).

## 8.9 Cykl życia sesji audio — pułapki obowiązkowe do obsłużenia

- **iOS: `AudioContext` ma niestandardowy stan `'interrupted'`** (rozmowa, Siri, alarm, przełączenie aplikacji). Kod obsługujący tylko `'suspended'`/`'running'` zostawia po przerwaniu **martwy graf audio bez żadnego sygnału błędu**. Obsłużyć `'interrupted'` jawnie + `statechange` + `AVAudioSession.interruptionNotification`.
- **`AudioContext` nigdy nie jest wznawiany** (potwierdzony błąd krytyczny `lib/multi-track-engine.ts:32`): każde `play()` musi zaczynać się od `if (ctx.state !== 'running') await ctx.resume()` w kontekście gestu użytkownika.
- **iOS: `getUserMedia` przełącza sesję audio**, może ściszyć/przekierować wyjście i przy Bluetooth HFP zbić sampleRate do 16 kHz z resetem `AudioContext`. Rdzeń **musi** obsługiwać zmianę sample rate w locie (resampling wejścia do wewnętrznych 48 kHz).
- **Brak nagrywania w tle / przy zablokowanym ekranie na web to twardy sufit** — nie ma obejścia. Każda funkcja „nagraj długą sesję" wymaga natywnego: iOS `UIBackgroundModes: audio`, Android foreground service z `FOREGROUND_SERVICE_MICROPHONE`.
- **Sprzątanie przy odmontowaniu:** zatrzymanie wszystkich `MediaStreamTrack`, anulowanie pętli rAF, `close()` kontekstu. Dziś Karaoke i Studio tego nie robią (`app/record/karaoke/page.tsx:223`) i zostawiają włączony mikrofon oraz wieczną pętlę rAF.

---

# 9. TABELA: krok · web · iOS · Android · real-time · licencja · gdzie liczony

| # | Krok | web | iOS (Swift) | Android (Kotlin) | RT? | Licencja | Gdzie liczony |
|---|---|---|---|---|---|---|---|
| 0 | Host I/O + zegar | AudioContext 48 kHz + 1× AudioWorkletNode | AVAudioEngine, `.playAndRecord` / mode `.measurement` | Oboe → AAudio EXCLUSIVE, `PERFORMANCE_MODE_LOW_LATENCY` | tak | Oboe Apache-2.0 [V] | host |
| 1 | DC block, HPF Butterworth | ✔ | ✔ | ✔ | tak (0 ms) | własne | **rdzeń** `vc-dsp` |
| 2 | De-plosive (dynamiczny HP) | ✔ | ✔ | ✔ | tak (0 ms) | własne | **rdzeń** |
| 3 | Ekspander / VAD / noise floor | ✔ | ✔ | ✔ | tak (0 ms) | własne | **rdzeń** |
| 4 | De-esser 1-/2-pasmowy | ✔ | ✔ | ✔ | tak (0 / 5 ms) | własne | **rdzeń** |
| 5 | Dynamiczny tłumik rezonansów | ✔ | ✔ | ✔ | tak | własne | **rdzeń** |
| 6 | EQ (biquady RBJ) | ✔ | ✔ | ✔ | tak (0 ms) | własne | **rdzeń** |
| 7 | Kompresor 1 / 2 | ✔ | ✔ | ✔ | tak (0 / 2-5 ms) | własne | **rdzeń** |
| 8 | Kompresor wielopasmowy (LR4) | ✔ | ✔ | ✔ | render | własne | **rdzeń** |
| 9 | **Adaptive leveler** (short-term LUFS) | ✔ | ✔ | ✔ | **nie** (render) | własne | **rdzeń** `vc-loudness` |
| 10 | **Saturacja** 4×/8× oversampled | ✔ | ✔ | ✔ | tak (0,16 ms) | własne | **rdzeń** |
| 11 | **FDN Reverb 16×16** | ✔ | ✔ | ✔ | tak (0 ms, wet równolegle) | własne | **rdzeń** |
| 12 | Delay / Doubler | ✔ | ✔ | ✔ | tak / render | własne | **rdzeń** |
| 13 | **pYIN + Viterbi (F0)** | AudioWorklet → rdzeń | ✔ | ✔ | tak (Tier A ~60-80 ms e2e) | algorytm wolny, własna impl. | **rdzeń** `vc-pitch` |
| 14 | **Korekcja intonacji — monitoring** | Signalsmith WASM/AudioWorklet | Signalsmith C++ | Signalsmith C++ | tak (**~32 ms**, opt-in) | **MIT** [V] | **rdzeń** |
| 15 | **Korekcja intonacji — render** | TD-PSOLA / WORLD w WASM | TD-PSOLA / WORLD | TD-PSOLA / WORLD | **nie** | **BSD-3** [V] + własne | **rdzeń** `vc-pitch` |
| 16 | **Denoise mowa** DPDFNet 48 kHz | ORT Web (wasm SIMD) | ORT + CoreML EP | ORT + NNAPI/XNNPACK | streaming (20+10 ms) — **nie w monitoringu ŚPIEW** | **Apache-2.0** [V] | ONNX; STFT/gain/mix w **rdzeniu** |
| 17 | Denoise śpiew — harmoniczny spectral gate | ✔ | ✔ | ✔ | render | własne | **rdzeń** `vc-enhance` |
| 18 | Denoise śpiew — LoRA (v2) | ORT Web | ORT + CoreML | ORT + NNAPI | render | Apache-2.0 baza + nasze wagi | ONNX + **rdzeń** |
| 19 | **Dereverb WPE** | ✔ | ✔ | ✔ | **nie** (iteracyjny) | **MIT** [V] (algorytm nara_wpe) | **rdzeń** `vc-enhance` |
| 20 | **Separacja BS PolarFormer** fp16 | ORT Web **WebGPU** → wasm | ORT + CoreML EP | ORT + NNAPI | **nie** (job offline, progress bar) | **MIT** kod+wagi [V] | ONNX; **STFT/iSTFT/chunk/maska w rdzeniu** |
| 21 | Separacja 4-stem HTDemucs | ORT Web | ORT | ORT | **nie** | **MIT** [V] | ONNX + **rdzeń** |
| 22 | **Resampling** | rubato → WASM | rubato | rubato | tak (wejście) / nie (separacja) | **MIT OR Apache-2.0** [V] | **rdzeń** |
| 23 | **BS.1770-4 + true peak 4×** | ✔ | ✔ | ✔ | tak (miernik) / render | własne, libebur128 **MIT** [V] jako oracle w testach | **rdzeń** `vc-loudness` |
| 24 | **Limiter TP dwustopniowy** | ✔ | ✔ | ✔ | tak (1,5 ms) / render (5 ms) | własne | **rdzeń** |
| 25 | **Dithering TPDF + noise shaping** | ✔ | ✔ | ✔ | **nie** (tylko eksport 16-bit) | własne | **rdzeń** |
| 26 | **Kalibracja latencji (chirp + matched filter)** | AudioContext, jeden zegar | AVAudioEngine; `routeChangeNotification` | Oboe; `registerAudioDeviceCallback` | pomiar jednorazowy | własne | **rdzeń** `vc-latency` |
| 27 | Raport latencji platformy | `outputLatency`/`baseLatency` (niekompletne) | `AVAudioSession.output/inputLatency` | `AudioTrack/AudioRecord.getTimestamp()` | n/d | API platformy | **host** → rdzeń |
| 28 | **Graf, transport, scheduler, automatyka** | rdzeń w AudioWorklet | rdzeń w AVAudioSourceNode | rdzeń w callbacku Oboe | tak | własne | **rdzeń** `vc-engine` |
| 29 | **EDL, komendy, undo/redo, migracje** | rdzeń via wasm-bindgen | rdzeń via UniFFI | rdzeń via UniFFI | nie | własne | **rdzeń** `vc-edl` |
| 30 | **Render offline (deterministyczny)** | rdzeń w Web Workerze | rdzeń, wątek tła | rdzeń, wątek tła | **nie** | własne | **rdzeń** |
| 31 | Piramida peaków, dekod stronami | FileSystemSyncAccessHandle w workerze | mmap | mmap | nie | własne | **rdzeń** + host I/O |
| 32 | Persystencja | SQLite Wasm + OPFS VFS | SQLite (rusqlite) | SQLite (rusqlite) | nie | SQLite public domain | **rdzeń** |
| 33 | **Enkodowanie eksportu** | **WebCodecs AudioEncoder**; fallback opus-recorder BSD-3 | AVAudioFile / AudioConverter; libopus BSD-3 | MediaCodec | nie | API platformy + BSD-3 | **host** |
| 34 | Forced alignment (mowa) | ORT Web, wav2vec2 CTC | ORT / SpeechAnalyzer (iOS 26+) | ORT | nie | model-zależne — **audytować wagi** | ONNX + **rdzeń** (snap do minimum energii) |

---

# 10. Sekwencja wdrożenia (kolejność wymuszona zależnościami, nie kosztem)

1. **`vc-core` szkielet + golden-test harness na OBECNEJ implementacji TS.** Zmierz punkt wyjścia: RPA/RCA @±50 centów, GPE, % błędów oktawowych, luka RPA−RCA. Bez tego nie da się stwierdzić, czy cokolwiek się poprawiło.
2. **`vc-pitch`: pYIN + Viterbi.** To odblokowuje scoring, korekcję i WORLD (jedna prawda o F0).
3. **`vc-latency` + test nulowy < −40 dBFS.** Odblokowuje karaoke i eliminuje błąd nr 1 na liście krytycznych.
4. **`vc-engine` + `vc-edl` + render offline w CI.** Odblokowuje edytor, undo/redo, eksport.
5. **`vc-dsp` pełny łańcuch (oba profile) + `vc-loudness`.** Odblokowuje mastering.
6. **`vc-separate` BS PolarFormer.** Odblokowuje bibliotekę utworów z plików użytkownika.
7. **`vc-enhance` WPE + spectral gate; potem trening adapterów LoRA.**
8. **Shell iOS Swift** (AVAudioEngine + UniFFI). Może ruszyć równolegle od punktu 2 — kontrakt FFI jest znany od pierwszego dnia.
9. **Shell Android Kotlin** (Oboe + UniFFI).

Punkty 8 i 9 nie czekają na „etap 7", bo cały DSP jest już w rdzeniu, a shell to I/O + UI. To jest właśnie to, co ma udźwignąć architektura od pierwszego dnia.

---

# 11. Polityka licencyjna — zapisać w `docs/licensing.md`

**Reguła twarda:** do produktu wchodzą wyłącznie komponenty z licencją **MIT / Apache-2.0 / BSD / 0BSD / public domain NA KODZIE I NA WAGACH**, z udokumentowanym pochodzeniem danych treningowych.

Dla każdego pliku wag zapisać: URL źródła, licencję, **SHA-256**, datę pobrania, notatkę o pochodzeniu danych treningowych.

**Wykluczone na poziomie polityki, nie oceny technicznej:**
GPL-3.0 (aubio, Praat, TarsosDSP, aubio-rs, wagi anvuew dereverb, mochiya98) · AGPL-3.0 (essentia.js, so-vits-svc) · LGPL (PESTO — obowiązek relinkowania niewykonalny w binarium ze sklepu; SoundTouch) · CC-BY-NC / CC-BY-NC-SA (Sucial, becruily-deux, MDB-stem-synth do produkcji) · `pitchfinder` (package.json: „GNU v3") · domyślny core `ffmpeg.wasm` (`--enable-gpl`) · Soundpipe/AudioKit PitchTrack (pochodne Csounda — mina licencyjna) · Rubber Band (GPL/komercyjna) · zplane élastique (komercyjna, zamknięta).

**Uwaga niezmienna: licencja kodu ≠ licencja wag.** ZFTurbo MSST jest MIT, ale najlepszy checkpoint dereverbu jest GPL-3.0. Sprawdzać osobno, za każdym razem.

### Zależności

- vc-core: workspace Rust z wasm-bindgen (web) i UniFFI (Swift/Kotlin) — MUSI istnieć przed jakimkolwiek shellem natywnym, bo definiuje kontrakt FFI (~30 funkcji, tylko typy POD)
- Golden-test harness uruchamialny w Node bez przeglądarki + korpus referencyjny z ground truth — warunek wstępny KAŻDEJ zmiany DSP; bez punktu wyjścia nie da się stwierdzić, czy zmiana pomogła
- vc-pitch (pYIN + Viterbi) — blokuje: scoring, korekcję intonacji (WORLD potrzebuje NASZEGO F0, nie Harvest), harmoniczną ochronę w denoisingu śpiewu, detekcję vibrata, segmentację nut
- vc-latency + zdany test nulowy (residuum < −40 dBFS) — blokuje karaoke, overdub, scoring live i całe nagrywanie na podkład
- vc-engine + vc-edl (transport na integerach, graf DAG, PDC) — blokuje render offline, undo/redo, eksport multitracku, automatyzację
- vc-loudness (BS.1770-4 + true peak 4x) — blokuje mastering, adaptive leveler, wyrównanie rozmówców (loudness speech-active), wszystkie presety dostawy
- rubato 4.0.0 (MIT OR Apache-2.0) — blokuje separację (48 → 44,1 → 48 kHz) i obsługę zmiany sample rate w locie na iOS przy Bluetooth
- ONNX Runtime v1.28.0 z EP: WebGPU (web), CoreML (iOS, preview), NNAPI/XNNPACK (Android) — blokuje separację i neural denoise
- Plik bs_polarformer_webgpu_fp16.onnx (108,3 MB) + zapięty SHA-256 + magazyn OPFS/Application Support/filesDir z weryfikacją hasha przed użyciem
- Implementacja STFT/iSTFT/chunkingu/aplikacji maski w vc-separate — graf ONNX BS PolarFormer CELOWO ich nie zawiera, więc bez tego model jest bezużyteczny
- Piramida peaków + dekod stronami + LRU 256 MB — blokuje jakąkolwiek pracę ze ścieżką dłuższą niż kilka minut (60 min stereo f32 = 1,38 GB)
- Kalibracja wejścia (2 s ciszy + 3 s głosu) — blokuje ekspander, spectral gating, bramkę voicingu i wyrównanie rozmówców; zastępuje rmsThreshold = 0.001
- Zbiór treningowy dla adaptera LoRA śpiew: suche wokale (VocalSet, vocadito, opt-in od użytkowników) ⊗ generowane RIR — blokuje dereverb i denoise śpiewu na poziomie modelowym
- Wymuszenie multitracku (jeden mówca = jedna ścieżka) jako warunku wejścia produktu — blokuje całe wyrównanie rozmówców i bleed gating
- Forced alignment model CTC (wav2vec2 / MMS / iOS 26 SpeechAnalyzer) o dokładności granicy ≤30 ms — blokuje edycję podcastu przez tekst; natywne timestampy Whispera (±100-200 ms) NIE wystarczają
- docs/licensing.md z SHA-256 i pochodzeniem danych każdego pliku wag — warunek wstępny wprowadzenia jakiegokolwiek modelu
- Obsługa stanu AudioContext 'interrupted' (iOS) + resume w geście użytkownika + sprzątanie MediaStreamTrack/rAF przy odmontowaniu — blokuje niezawodność na Safari/iOS

### Ryzyka

- Dereverb permisywny nie istnieje i nie pojawi się sam. Wszystkie dobre modele są GPL-3.0 albo CC-BY-NC (sprawdzone wyczerpująco na HF). WPE daje tylko ~+0,5-1,5 dB SRMR, więc dopóki nasz adapter LoRA nie jest wytrenowany, funkcja 'usuń pogłos pokoju' będzie wyraźnie słabsza niż u konkurencji korzystającej z GPL-owych wag. To ryzyko jakościowe, nie do obejścia inżynierią.
- CoreML EP w ONNX Runtime ma status PREVIEW. Jeśli 51M-parametrowy graf BS PolarFormer nie skompiluje się na ANE albo da inny wynik niż CPU, separacja na iOS zjedzie na CPU/XNNPACK i będzie wielokrotnie wolniejsza. Wymaga zmierzenia na realnym urządzeniu, zanim funkcja zostanie obiecana w UI, oraz testu zgodności wyjścia CoreML vs CPU (SNR > 40 dB).
- WebGPU w ONNX Runtime Web na iOS Safari było niedojrzałe w poprzednim researchu. Jeśli WebGPU nie działa na Safari, separacja w przeglądarce na iPhonie spada na wasm-SIMD single-thread — czyli z 'około real-time' na minuty dla utworu 3,5 min. Trzeba to zmierzyć, a nie założyć.
- Model 108 MB jako jednorazowy download to realna bariera wejścia dla funkcji flagowej. Na połączeniu mobilnym użytkownik może przerwać pobieranie. Potrzebny resumable download, jasna komunikacja rozmiaru przed startem i model 16 kHz (60 MB, MIT) jako podgląd — ale ten ostatni daje podkład bez niczego powyżej 8 kHz, więc nie może być tym, co użytkownik dostaje jako wynik.
- Trening adaptera LoRA śpiew to jedyne miejsce w całym planie wymagające GPU i eksperymentowania z hiperparametrami — czyli jedyny element o niepewnym wyniku. Paper arXiv 2607.11630 podaje kierunek i liczby (rank, +6-12% parametrów, 0,29-1,8 dB SDR), ale nie gwarantuje, że nasz zbiór syntetycznych RIR da model lepszy od WPE. Trzeba mieć kryterium przyjęcia PRZED treningem (np. > +2 dB SRMR i zero degradacji SI-SDR na czystym śpiewie), inaczej wdrożymy model, który psuje.
- Bluetooth to strukturalna dziura w kompensacji latencji. HFP forsuje 16 kHz i 120-250 ms ZMIENNEJ latencji z adaptacyjnym buforowaniem, więc pojedyncza kalibracja nie opisuje trasy. Domyślna odmowa nagrywania śpiewu na HFP jest jedyną uczciwą odpowiedzią, ale odcina dużą część użytkowników mobilnych — a oni tego nie zrozumieją bez dobrego komunikatu.
- Korekcja intonacji ma wbudowane ryzyko odwrotne do intuicyjnego: zbyt dobra korekcja szkodzi produktowi treningowemu. Jeśli użytkownik słyszy siebie zawsze w stroju, przestaje się uczyć intonacji. Dlatego korekcja MUSI być wyłączona w torze analizy i scoringu (jest), i powinna być jawnie oddzielona w UI jako 'produkcja', nie 'trening'. Bez tego rozdziału funkcja podkopuje rdzeń, który już się obronił produktowo.
- Bramka wierności i straż artefaktów (§4.3) to mechanizmy z progami dobranymi analitycznie (0,08 odległości log-mel, HNR 6 dB, confidence 0,6). Te progi są zgadnięte i będą wymagały kalibracji na realnych nagraniach; przy złych progach albo korekcja odmawia pracy zbyt często, albo przepuszcza uszkodzone nuty. Potrzebny zbiór 50-100 realnych take'ów z oceną słuchową jako kalibrator.
- Pułapka +3 LU (mono vs dual-mono) jest bardzo łatwa do przeoczenia w pipeline, w którym audio przechodzi przez wiele reprezentacji. Jeśli nie ma testu mierzącego DOSTARCZANY plik, eksporty podcastu będą systematycznie o 3 LU obok targetu — i nikt tego nie zauważy, dopóki platforma nie znormalizuje.
- Forced alignment jest wymagany do edycji przez tekst z dokładnością ≤30 ms, ale wagi modeli CTC (wav2vec2-large-XLSR-polish, MMS) mają niejednoznaczne pochodzenie danych treningowych. To jest ta sama klasa ryzyka co wagi CREPE/RMVPE: licencja repo nie unieważnia warunków zbiorów badawczych. Trzeba to zaudytować osobno, zanim edycja tekstowa wejdzie do produktu komercyjnego.
- Determinizm renderu bit-w-bit na trzech platformach jest założony, ale zmiennoprzecinkowa arytmetyka może się różnić przy różnych poziomach optymalizacji, SIMD i kolejności operacji (zwłaszcza WASM SIMD vs NEON vs x86 AVX). Golden-file test wymuszający bit-identyczność może się okazać zbyt mocnym wymogiem — trzeba mieć zapasowe kryterium (SNR > 100 dB względem wzorca), inaczej CI będzie fałszywie czerwony.

### Do rozstrzygnięcia pomiarem

- Realny czas separacji BS PolarFormer fp16 dla utworu 3,5 min: ONNX Runtime Web + WebGPU na Chrome/desktop, Safari 26+/macOS, Safari/iOS; ORT + CoreML na A15/A17/M-series; ORT + NNAPI na średnim i słabym Androidzie. Bez tych liczb nie da się zaprojektować UX (progress bar vs 'zostaw na noc' vs offload do chmury).
- Czy CoreML EP (preview) w ORT 1.28 kompiluje graf BS PolarFormer bez fallbacku do CPU per-węzeł, i czy wyjście CoreML zgadza się z CPU w granicach SNR > 40 dB. Fallback per-węzeł potrafi być wolniejszy niż czysty CPU.
- Czy WebGPU w ORT Web działa na Safari/iOS na tyle, by separacja w przeglądarce na iPhonie miała sens — albo czy jedyną drogą na iOS jest aplikacja natywna. To rozstrzyga, czy funkcja 'śpiewaj do swojej piosenki' jest webowa, czy natywna-only.
- Realny round-trip monitoringu na każdej z trzech platform po wdrożeniu rdzenia: pomiar chirpem na 10-15 konfiguracjach (iPhone wired/BT/głośnik, Android flagowiec/średniak, MacBook Chrome/Safari, Windows Chrome). Dopiero to powie, czy monitoring śpiewu na web jest funkcją, czy ostrzeżeniem.
- Faktyczny rozrzut i determinizm latencji na trasach Bluetooth A2DP (nie HFP): czy 7 chirpów daje IQR poniżej 5 ms na typowych słuchawkach, czy A2DP też jest niekompensowalny. Rozstrzyga, czy odmowa dotyczy tylko HFP, czy całego Bluetootha.
- Czy nasz adapter LoRA dereverb wytrenowany na syntetycznych RIR bije WPE na REALNYCH nagraniach domowych (nie na held-out syntetyku). Kryterium: > +2 dB SRMR ORAZ zero degradacji SI-SDR na czystym śpiewie. Da się rozstrzygnąć tylko pomiarem na własnym zbiorze referencyjnym z realnych pokoi.
- Progi bramki wierności korekcji intonacji (odległość log-mel 0,08, HNR 6 dB, confidence 0,6, spectral flux) — kalibracja na 50-100 realnych take'ach z oceną słuchową. Zgadnięte wartości mogą albo blokować korekcję zbyt często, albo przepuszczać uszkodzone nuty.
- Czy 0,25 jako współczynnik częściowego podążania formantów przy shiftach > 600 centów jest właściwy — to liczba dobrana z rozumowania, nie z testu odsłuchowego. Wymaga ABX na kilku głosach i kilku wielkościach shiftu.
- Czy 20 centów martwej strefy a cappella / 12 centów przy podkładzie ET daje wynik, który użytkownicy odbierają jako 'naprawione, ale nadal ja'. Rozstrzygalne tylko testem preferencji A/B na realnych użytkownikach produktu, który już ma bazę.
- Czy determinizm bit-w-bit renderu jest osiągalny między WASM SIMD, ARM NEON i x86 AVX przy tej samej kolejności operacji — czy trzeba zejść na kryterium SNR > 100 dB. Do zmierzenia natychmiast po zbudowaniu vc-dsp, bo determinuje kształt CI.
- Rzeczywisty pułap harmonicznie chronionego spectral gatingu dla śpiewu względem DPDFNet + LoRA: czy klasyczna metoda z ochroną F0 i 12 harmonicznych jest 'wystarczająco dobra', czy różnica jest słyszalna na tyle, by uzasadniać trening adaptera jako priorytet.
- Aktualne wartości docelowe LUFS platform (Spotify, Apple Podcasts, YouTube, Amazon, Tidal, Deezer, AES TD1004, EBU R128, ACX) — jedyne liczby w tej specyfikacji niezweryfikowane w tej sesji, do sprawdzenia jednorazowo przed pierwszym releasem eksportu.
- Pochodzenie danych treningowych wag forced-alignment (wav2vec2-large-XLSR-polish, MMS) — czy da się je legalnie użyć w produkcie komercyjnym, czy trzeba iść w SpeechAnalyzer (iOS 26+) i własny model dla web/Android.

<details><summary>Źródła</summary>

- [Signalsmith Stretch — repo (MIT, push 2026-01-24, 528 gwiazdek)](https://github.com/Signalsmith-Audio/signalsmith-stretch)
- [Signalsmith Stretch — dokumentacja (formanty, latencja, presety, MIT)](https://signalsmith-audio.co.uk/code/stretch/)
- [signalsmith-stretch npm 1.3.2 — oficjalny release WASM/AudioWorklet, MIT](https://registry.npmjs.org/signalsmith-stretch)
- [Rubber Band Library — licencja GPL albo płatna komercyjna, v4.0.0 (2024-10-25)](https://breakfastquay.com/rubberband/)
- [WORLD (mmorise) — LICENSE.txt = BSD 3-Clause, push 2026-02-18](https://github.com/mmorise/World/blob/master/LICENSE.txt)
- [DPDFNet (ceva-ip) — Apache-2.0, push 2026-07-22, warianty 48 kHz, attn-limit-db, okno 20 ms / hop 10 ms](https://github.com/ceva-ip/DPDFNet)
- [GTCRN (Xiaobin-Rong) — MIT, push 2026-01-18, 696 gwiazdek, 48,2K parametrów](https://github.com/Xiaobin-Rong/gtcrn)
- [DeepFilterNet — LICENSE-MIT (Hendrik Schröter), ostatni push 2024-10-17 (de facto zamrożony)](https://github.com/Rikorose/DeepFilterNet)
- [arXiv 2607.11630 — Teaching Speech Enhancement Models to Sing: Domain Adaptation from SE to SVS (Bereuter, Plumbley, Sontacchi, 2026-07-13)](https://arxiv.org/abs/2607.11630)
- [BS PolarFormer ONNX — wagi MIT, SDR 11.00, fp16 108,3 MB, wariant WebGPU, SNR 48,6 dB / Pearson 0,999996](https://huggingface.co/bgkb/bs_polarformer)
- [Mel-Band Roformer (KimberleyJSN) — wagi MIT, SDR 10.98](https://huggingface.co/KimberleyJSN/melbandroformer)
- [Music-Source-Separation-Training (ZFTurbo) — MIT, push 2026-07-12, leaderboard Multisong](https://github.com/ZFTurbo/Music-Source-Separation-Training)
- [BS-RoFormer (lucidrains) — MIT, push 2026-06-14](https://github.com/lucidrains/BS-RoFormer)
- [anvuew dereverb Mel-Band Roformer — GPL-3.0 na wagach (dyskwalifikuje komercyjnie)](https://huggingface.co/anvuew/dereverb_mel_band_roformer)
- [nara_wpe (fgnt) — MIT, 569 gwiazdek, push 2025-03-19, WPE dereverberacja](https://github.com/fgnt/nara_wpe)
- [libebur128 (jiixyj) — MIT, referencja EBU R128 / ITU-R BS.1770](https://github.com/jiixyj/libebur128)
- [rubato 4.0.0 — MIT OR Apache-2.0, crates.io, aktualizacja 2026-07-09](https://crates.io/crates/rubato)
- [Demucs (adefossez) — MIT, push 2026-07-11; facebookresearch/demucs ARCHIWALNY](https://github.com/adefossez/demucs)
- [ONNX Runtime v1.28.0 — release 2026-07-25](https://github.com/microsoft/onnxruntime/releases/latest)
- [ONNX Runtime — execution providers (CoreML = preview, NNAPI, WebGPU, XNNPACK)](https://onnxruntime.ai/docs/execution-providers/)
- [Oboe (google) — Apache-2.0, push 2026-07-10, low-latency audio Android](https://github.com/google/oboe)
- [ClearerVoice-Studio (modelscope) — Apache-2.0, źródło MossFormer2_SE_48K](https://github.com/modelscope/ClearerVoice-Studio)
- [MossFormer2_SE_48K (alibabasglab) — Apache-2.0, natywne 48 kHz speech enhancement](https://huggingface.co/alibabasglab/MossFormer2_SE_48K)
- [yongyizang 16k Vocal Lightweight MelBandRoformer — MIT, 60 MB (tylko podgląd, 16 kHz)](https://huggingface.co/yongyizang/16k_Vocal_Lightweight_MelBandRoformer)
- [RVC (MIT, push 2026-07-23) i so-vits-svc (AGPL-3.0, ARCHIWALNY 2023-11-11) — odrzucone: voice conversion zmienia tożsamość głosu](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI)
- [Vocos (gemelo-ai) — MIT, neuronowy wokoder, kandydat na v2 korekcji intonacji](https://github.com/gemelo-ai/vocos)
- [MDX-Net (kuielab) — MIT, ale ostatni push 2023-02-27, SDR 10.17 < 11.00: przestarzały](https://github.com/kuielab/mdx-net)

</details>

---

## Filar PODCAST platformy Vocal Coach — profil materiału MOWA na wspólnym torze capture / EDL / render, plus warstwa adnotacji tekstowych (ASR, alignment, diaryzacja, automaty redakcyjne)

**Werdykt:** Podcast nie jest osobnym produktem ani osobnym edytorem — jest PROFILEM MATERIAŁU (zestaw stałych DSP i celów loudness) plus jedną dodatkową warstwą danych: adnotacjami czasowymi nad tym samym EDL, którego używa śpiew. Granica nie leży między ekranami, leży w warstwie ANALIZY: śpiew produkuje PitchTrack, mowa produkuje WordTrack + SpeakerTrack + VadTrack, a edycja po tekście to drugi WIDOK na ten sam EDL, emitujący te same komendy (SplitClip, RemoveRange, SetGain) co timeline. Silnikiem ASR dla polskiego jest Parakeet TDT 0.6b v3 (CC-BY-4.0, WER PL 7,31% Fleurs / 7,28% MLS, natywne timestampy, ONNX int8 670 MB, brak halucynacji na ciszy), a nie Whisper; granice słów do cięcia daje trójstopniowy własny aligner (Parakeet 80 ms → CTC forced alignment na wav2vec2-large-xlsr-53-polish Apache-2.0, hop 20 ms → refinement DSP do minimum energii i zero-crossingu), bo żaden ASR sam nie schodzi poniżej ±100 ms. Diaryzacji nie wygrywamy modelem — wygrywamy ją nagrywaniem: własny double-ender z lokalnym zapisem i24 48 kHz per uczestnik i korektą DRYFU zegarów (do 1,08 s na 3 h przy ±100 ppm) redukuje błąd przypisania mówcy do zera, a pyannote/segmentation-3.0 (MIT) zostaje wyłącznie fallbackiem dla obcych plików. Backend jest minimalny i cały na Cloudflare (Durable Object na sesję, R2 na ścieżki przez presigned multipart, Containers standard-4 CPU na inferencję ONNX, Workflows/Queues, D1 na metadane) — render i eksport zostają LOKALNIE, bo klient ma cały graf i wszystkie dane; koszt inferencji odcinka 3 h × 3 ścieżki wychodzi 0,6–1,5 USD przy podłodze 0,27 USD (Workers AI whisper-turbo, 0,03 USD/h).

### Decyzje

| Pytanie | Rozstrzygnięcie | Dlaczego | Odrzucone |
|---|---|---|---|
| Czy podcast jest osobnym produktem/aplikacją? | NIE. Podcast = profil materiału MOWA na wspólnym torze capture → EDL → render → eksport, plus jedna dodatkowa warstwa danych (adnotacje tekstowe). | Z siedmiu warstw toru (capture, storage, EDL, silnik RT, render offline, DSP, loudness/eksport) sześć jest identyczna dla mowy i śpiewu. Różnią się WYŁĄCZNIE stałe (HPF 80/100 Hz vs 60 Hz, target -16 vs -14 LUFS, agresywność denoise) i to, jaki analizator jest podpięty. Rozdzielenie tych warstw na dwie aplikacje gwarantuje rozjazd — czyli dokładnie mechanizm, który wygenerował obecne 79 usterek (t | Osobna aplikacja podcastowa — odrzucona bo duplikuje 6/7 warstw i podwaja liczbę miejsc, w których może wystąpić ta sama usterka. Osobny edytor tekstowy obok timeline'u — odrzucony bo edycja po tekście nie jest edytorem, jest widokiem (patrz decyzja 2). |
| Gdzie DOKŁADNIE przebiega granica wspólne / podcastowe? | Granica jest w warstwie ANALIZY, nie w warstwie MATERIAŁU. Wspólne: capture, storage, peak pyramid, EDL, silnik RT, render offline, DSP, LUFS/true peak, eksport, undo/redo, waveform. Podcastowe: WordTrack (ASR+alignment), SpeakerTrack (diaryzacja), detektory disfluencji PL, rozdziały, show notes, klipy social, transkrypt jako artefakt. Sporne-ale-wspólne: VAD, obwiednia RMS, detektor oddechów (uży | AnalysisTrack jest pluggable i time-indexed. Śpiew wstawia PitchTrack, mowa wstawia WordTrack/SpeakerTrack/VadTrack. Edytor konsumuje adnotacje generycznie (interwały + wartości + etykiety), więc jeden mechanizm obsługuje piano-roll, karaoke-highlight słów w klipie social i podświetlanie wypełniaczy. Detektor oddechów NIE jest podcastowy — brak periodyczności wykrywa pYIN, który i tak musi istnieć | Granica per-ekran ("ekrany podcastowe" vs "ekrany wokalne") — odrzucona bo prowadzi do dwóch modeli EDL i dwóch silników renderu. Granica per-format pliku — odrzucona bo materiał jest tym samym PCM. |
| Który silnik ASR dla polskiego jest podstawowy? | Parakeet TDT 0.6b v3 (NVIDIA, CC-BY-4.0, 600M par., 25 języków w tym PL, WER PL 7,31% Fleurs / 7,28% MLS, RTFx 3332, natywne word/segment/char timestamps, ONNX int8 dostępny: encoder 652 MB + decoder 11,8 MB + joiner 6,4 MB). Canary-1b-v2 (978M, CC-BY-4.0) jako drugi przebieg max-quality i do napisów tłumaczonych. Whisper large-v3-turbo (809M, MIT) jako tania ścieżka serwerowa (Workers AI 0,03 USD | Transducer TDT nie halucynuje na ciszy (autoregresja jest po tokenach, nie po 30-sekundowych oknach), nie ma okna 30 s, emituje timestampy z modelu (przewiduje duration), jest 2,6× mniejszy od large-v3 i istnieje jako gotowy ONNX int8 w sherpa-onnx (Apache-2.0) z buildami na iOS/Android. Licencja CC-BY-4.0 dotyczy WAG, a dane treningowe (Granary, arXiv 2505.13404) są opisane i pseudo-etykietowane, | Whisper large-v3 jako podstawowy — odrzucony: halucynacje na ciszy i muzyce, twarde okno 30 s wymuszające własną segmentację, timestampy tylko przez DTW cross-attention (±100–200 ms). Moonshine — odrzucony: brak realnego polskiego. Vosk pl small (50 MB, Apache-2.0) — odrzucony: WER >20% czyni edycję po tekście bezużyteczną. transformers.js + WebGPU — odrzucony: modele mieszczące się w budżecie pob |
| Skąd brać granice słów dla edycji po tekście? | NIE z ASR. Trójstopniowy własny aligner w rdzeniu: (1) ASR daje tekst + zgrubne timestampy (Parakeet: siatka 80 ms), (2) CTC forced alignment Viterbi na jonatasgrosman/wav2vec2-large-xlsr-53-polish (Apache-2.0, Common Voice PL 6.0, hop 20 ms, tokenizer GRAFEMOWY), (3) refinement DSP: przesunięcie granicy do minimum energii w oknie ±40 ms, preferencja ciszy zwarcia przed p/t/k/b/d/g, snap do zero-c | Wymagana dokładność granicy to ≤30 ms, bo polskie słowo przy 150 sł./min trwa 300–400 ms i błąd 150 ms obcina sylabę. Parakeet ma 80 ms rozdzielczości (FastConformer, subsampling 8× z 10 ms), Whisper DTW ±100–200 ms — oba za grube. wav2vec2-XLSR-PL na grafemach nie wymaga słownika wymowy ani G2P, więc nie ma problemu OOV na polskich nazwach własnych i anglicyzmach. Trzeci stopień jest darmowy obli | WhisperX (BSD-2-Clause, żywy) jako całość — odrzucony jako produkcyjne źródło timestampów bo jego baza to Whisper+DTW; jego pomysł (osobny wav2vec2 per język) jest natomiast potwierdzeniem wybranej ścieżki. ctc-forced-aligner (MahmoudAshraf97) — odrzucony: brak jakiejkolwiek licencji w repo (spdx null). MMS-FA / facebook/mms-300m — odrzucony: cc-by-nc-4.0, wyklucza komercję. MFA (MIT, modele PL CC |
| Diaryzacja modelami czy własne nagrywanie wielościeżkowe? | WŁASNE NAGRYWANIE WIELOŚCIEŻKOWE (double-ender): każdy rozmówca nagrywa lokalnie i24 48 kHz mono na swoim urządzeniu, progresywny upload w częściach. Diaryzacja zdegradowana do fallbacku dla materiału obcego / jednego mikrofonu: pyannote/segmentation-3.0 (wagi MIT) + embeddingi 3D-Speaker/WeSpeaker (Apache-2.0) jako ONNX przez sherpa-onnx (Apache-2.0), on-device na web/iOS/Android; serwerowo opcjo | Diaryzacja ma nieusuwalny sufit (DER 8–15% na realnych podcastach, mowa nakładająca się praktycznie gubiona), a jej błąd propaguje się wprost na edycję po tekście: słowo przypisane złemu mówcy = błędna edycja u użytkownika. Osobne ścieżki dają 0% błędu przypisania, per-osobę gain/EQ/gate/denoise, usuwanie crosstalku, niezależny ratunek gdy jedna strona padnie i brak kompresji VoIP. Riverside — naj | Diaryzacja jako główny mechanizm identyfikacji mówców — odrzucona merytorycznie: rozwiązuje problem, którego przy poprawnym nagraniu nie ma, i wprowadza błąd tam, gdzie może go nie być. sherpa-onnx-reverb-diarization-v1 — odrzucona: pochodzenie od Rev z licencją niekomercyjną. |
| Jaki format PCM na dysku dla materiału roboczego? | i24 packed (3 bajty LE) 48 kHz mono per ścieżka jako format capture i format roboczy, w pliku raw z nagłówkiem własnym. FLAC 24-bit (własny enkoder w rdzeniu / flacenc-rs, MIT-Apache) na archiwum i upload. Rdzeń pracuje wewnętrznie na f32, konwersja przy odczycie bloku. | f32 nie nosi więcej informacji niż 24 bity, bo ENOB realnego ADC to 20–21 bitów; kosztuje natomiast 25% więcej miejsca (2,07 GB vs 1,56 GB na 3 h) i 25% więcej I/O w hot pathu odtwarzania. i16 zabiera headroom przy nagraniu z zapasem -18 dBFS. Raw (nie FLAC) jako format roboczy jest kluczowy: odczyt losowy to czysty seek offset = frame × 3, zero dekodowania — bez tego streaming 12 ścieżek podczas  | f32 na dysku — odrzucony (25% I/O bez zysku informacyjnego). i16 — odrzucony (headroom). WebM/Opus lub MediaRecorder jako tor capture — odrzucony: stratny, brak random access, na Safari wymuszony mp4/AAC, i to jest dokładnie obecna usterka (hooks/use-audio-recording.ts:17 — nagranie tylko jako webm/opus, zero PCM). |
| Jak przechowywać i edytować 3 h × 3 ścieżki w przeglądarce? | OPFS z FileSystemSyncAccessHandle w dedykowanym Web Workerze (dostępne: Chrome 102+, Chrome Android 109+, Safari i iOS 15.2+, Firefox 111+), SQLite Wasm na OPFS dla metadanych i command logu, obowiązkowe navigator.storage.persist() przy tworzeniu projektu, twarda bramka navigator.storage.estimate() wymagająca 1,3 × przewidywanego rozmiaru wolnego miejsca. | Tylko SyncAccessHandle daje synchroniczny random-access read/write do plików wielogigabajtowych bez trzymania ich w RAM — to jedyne API przeglądarki spełniające wymóg streamingu. Bez persist() Safari usuwa dane skryptowe po 7 dniach bez interakcji użytkownika, czyli 4,7 GB projektu znika. SQLite Wasm daje ten sam schemat, co natywne iOS/Android — jeden model danych na trzy platformy. | IndexedDB na bloby audio — odrzucone: brak random access, transakcyjny narzut na każdy zapis, i to jest źródło obecnych usterek (base64 dataURL w localStorage w app/record/karaoke/page.tsx:299, pitchHistory w localStorage w hooks/use-session-library.ts:88, trzy niezależne bazy). localStorage na cokolwiek poza preferencjami UI — odrzucone: 5 MiB limitu, cicha utrata danych. |
| Jak wygląda undo/redo, żeby obsłużyć oba widoki (timeline i tekst)? | Append-only command log w SQLite: każda komenda EDL ma jawną odwrotność, snapshot pełnego EDL co 50 komend. Widok tekstowy i widok timeline emitują TE SAME komendy. Zero contenteditable — tekst jest renderowany z WordTrack, a kursor/selekcja są własnym modelem indeksów (znak → token → klatka). | Jedno źródło prawdy dla dwóch widoków to jedyny sposób, żeby usunięcie zdania w tekście i przesunięcie klipu na timeline były wzajemnie spójne po undo. contenteditable wygląda na skrót, ale synchronizacja DOM z EDL przy wklejaniu, autokorekcie, IME i undo przeglądarki jest niedeterministyczna. | Snapshot całego EDL na każdą zmianę — odrzucony: przy 3 h projektu i przeciąganiu klipu to zapis na każdy mousemove, czyli obecna usterka components/timeline/multi-track-timeline.tsx:590. Brak undo — obecny stan (components/timeline/multi-track-timeline.tsx:262) i nieodwracalna utrata materiału (components/interactive-waveform.tsx:206). |
| Jak wykrywać wypełniacze niesłowne (yyy, eee, mmm)? | WYŁĄCZNIE akustycznie, z LUK W ALIGNMENCIE. Kandydat = przedział 120–800 ms bez przypisanego słowa, z wykrytym F0 (clarity >0,6), SD F0 <40 centów, \|nachylenie F0\| <200 centów/s, stabilny centroid widmowy (zmiana <15%), poziom -40…-12 dBFS. Klasyfikacja typu przez F1/F2. Akcja: usuwalne automatycznie, z pozostawieniem 100 ms ciszy. | Whisper jest trenowany na czystych napisach i SAM USUWA wypełniacze; Parakeet v3 jest trenowany na Granary, czyli na pseudo-etykietach z dwuprzebiegowej inferencji z filtrowaniem halucynacji i restauracją interpunkcji — więc również ich nie zawiera. Tekst ASR fizycznie nie ma tej informacji. Luki w alignmencie są jednak dokładnie tam, gdzie wypełniacze były: to naturalny produkt uboczny forced ali | Szukanie "yyy" w transkrypcie — odrzucone: tego tokenu tam nie ma i nigdy nie będzie. Detekcja przez samą energię/VAD — odrzucona: nie odróżnia wypełniacza od oddechu (różnicuje je obecność voicingu). |
| Jak traktować wypełniacze leksykalne po polsku (no, znaczy, jakby, wiesz, nie?)? | Klasyfikator kontekstowy per token, NIGDY auto-usuwanie: tylko podświetlenie + licznik + "usuń zaznaczone" z podglądem A/B przed zastosowaniem. Wejście klasyfikatora: okno ±6 tokenów + cechy prozodyczne (pauza przed/po w ms, czas trwania tokenu vs jego mediana w korpusie, ΔF0, energia względna). Model: fine-tune HerBERT-base (allegro/herbert-base-cased) lub sdadas/polish-roberta-base-v2 na własnym | Polskie wypełniacze są leksykalnie dwuznaczne w stopniu, w jakim angielskie um/uh nie są: "no dobra" vs "no i wtedy no poszedłem", "nie" jako negacja vs tag question ("fajnie, nie?"), "jakby + rzeczownik" (porównanie) vs "jakby + czasownik/pauza" (wypełniacz), "znaczy" po "to" vs samodzielne. Fałszywe usunięcie zmienia SENS wypowiedzi, więc precyzja jest asymetrycznie ważniejsza od recall — a to w | Lista słów + auto-apply (model Descripta) — odrzucone merytorycznie: dla polskiego daje fałszywe usunięcia zmieniające znaczenie, a auto-usuwanie jest najczęstszą skargą na Descript nawet po angielsku. Reguły bez cech prozodycznych — odrzucone: pauza po tokenie jest najmocniejszą pojedynczą cechą i ignorowanie jej wyrzuca połowę sygnału. |
| Oddechy: usuwać czy tłumić? | TŁUMIĆ -12 dB z fade in/out 20 ms, długość zachowana. Usuwanie tylko na jawne życzenie i wyłącznie z wstawieniem ciszy tej samej długości. Detekcja: RMS -45…-25 dBFS, spectral flatness >0,30, BRAK F0 z pYIN, długość 150–500 ms, sąsiedztwo mowy w oknie 1 s. | Nagranie bez oddechów brzmi nieludzko i jest udokumentowaną skargą na wszystkie automaty w tej klasie (Descript, Alitu). Skrócenie materiału przez usunięcie oddechu psuje rytm frazy silniej, niż oddech przeszkadza. Brak periodyczności jest najmocniejszym sygnałem oddechu, a detektor pYIN musi istnieć dla toru śpiewu — więc to zero dodatkowego kodu DSP. | Usuwanie domyślnie — odrzucone (brzmi nieludzko, psuje rytm). Noise gate na oddechy — odrzucony: gate odcina niskoenergetyczne początki wyrazów (szczelinowe s/ś/f) razem z oddechem. |
| Jak skracać ciszę, nie niszcząc rytmu? | Adaptacyjny próg z histerezą: noise floor = 10. percentyl rozkładu poziomów całej ścieżki; otwarcie NF+10 dB, zamknięcie NF+6 dB; min długość mowy 120 ms; kandydatem jest cisza ≥350 ms; docelowa długość = min(oryginalna, max(150 ms, 0,25 × oryginalna)) z presetami 400/250/150 ms; padding 120 ms po ostatnim słowie i 80 ms przed następnym; crossfade 15 ms. PAUZA RETORYCZNA CHRONIONA: jeśli poprzedni | Skracanie do zera to najczęstszy błąd tej klasy narzędzi — usuwa oddech dramaturgiczny i sprawia, że mowa brzmi jak lista. Stały próg dBFS nie może być poprawny, bo rozrzut szumu jałowego między mikrofonem laptopa z AGC (-50…-40 dBFS) i kondensatorem USB (-70 dBFS) to 25–30 dB. Ochrona pauzy po kropce to miejsce, w którym warstwa tekstowa realnie poprawia decyzję DSP — i to jest argument za trzyma | Stały próg -35 dBFS — odrzucony (30 dB rozrzutu między urządzeniami). Skracanie do zera / "remove silence" bez klasy pauzy — odrzucone (niszczy rytm). |
| Co MUSI być serwerowo i na czym? | Serwerowo: (a) sesja double-ender — Durable Object per sesja: sygnalizacja WebSocket z hibernacją, synchronizacja zegarów, stan uczestników; (b) odbiór ścieżek — R2, presigned multipart BEZPOŚREDNIO z klienta; (c) inferencja domyślnej ścieżki web — Containers standard-4 (4 vCPU / 12 GiB, BEZ GPU) z Parakeet ONNX int8 + wav2vec2 aligner + pyannote segmentation; (d) orkiestracja — Workflows + Queues | Worker ma limit body 100 MB (Free/Pro) i 128 MB pamięci na isolate — audio przez Workera jest fizycznie niemożliwe, więc upload musi iść presigned do R2. Containers nie mają GPU, ale batch nie wymaga realtime: CPU int8 wystarcza. Render lokalnie, bo klient ma cały graf DSP w rdzeniu i wszystkie próbki — wysyłanie 4,7 GB na serwer, żeby dostać z powrotem plik, jest gorsze na każdym wymiarze (koszt, | Backend GPU — odrzucony: Cloudflare Containers go nie ma, a batchowa inferencja nie potrzebuje realtime, więc GPU kupuje tylko czas, którego pipeline asynchroniczny i tak nie wymaga. Audio w Workerze — odrzucone (128 MB RAM). Workers AI whisper jako JEDYNE ASR — odrzucone: brak Parakeeta, brak alignmentu, brak diaryzacji, brak kontroli nad segmentacją; zostaje jako podłoga kosztowa 0,03 USD/h i aw |
| Co liczyć lokalnie przed wysłaniem na inferencję? | VAD, obwiednię RMS, noise floor, detekcję clippingu i wstępną segmentację liczy rdzeń WASM lokalnie. Na serwer idą TYLKO segmenty mowy (16 kHz mono FLAC dla ASR/alignera), nie cała ścieżka. | Typowy podcast ma 30–40% czasu bez mowy. Wysyłanie tego kosztuje dwa razy: transfer i sekundy inferencji. Segmentacja lokalna jest praktycznie darmowa (te same funkcje, które i tak działają w torze śpiewu) i zmniejsza rachunek inferencji o ~35% oraz upload dla ASR o ten sam rząd. | Upload całości do inferencji — odrzucony: płaci się za ciszę. Segmentacja serwerowa — odrzucona: wymaga i tak przesłania całości. |
| Jak zsynchronizować ścieżki z różnych urządzeń w double-enderze? | Trzy mechanizmy jednocześnie: (1) offset zegara — algorytm Cristiana nad WebSocket DO, mediana z 20 próbek RTT, do zgrubnego ustawienia; (2) offset dokładny — każdy uczestnik zapisuje dodatkowo referencyjny miks zdalny 16 kHz mono, GCC-PHAT lokalnej ścieżki vs referencja u partnera na oknie 60 s daje offset z dokładnością ±1 próbki; (3) KOREKTA DRYFU — cross-correlation w punktach co 5 min, regres | Nominalne 48000 Hz na dwóch urządzeniach różni się realnie o do ±100 ppm, co przy 3 h daje do 1,08 s narastającego rozjazdu — to zabija montaż nawet przy idealnym offsecie startowym. Punkt (3) jest tym, o czym się nie mówi, i jest warunkiem, żeby zdalne nagrywanie było w ogóle użyteczne dla długich odcinków. Punkt (2) nie wymaga niczego od użytkownika, w odróżnieniu od chirpów synchronizacyjnych. | Poleganie na Date.now() / wall clock — odrzucone: rozjazd zegarów systemowych i brak informacji o dryfie sample rate. Jednorazowy offset bez korekty dryfu — odrzucony: poprawny na pierwszej minucie, bezużyteczny na trzeciej godzinie. Chirp 18–20 kHz jako główny mechanizm — odrzucony: część urządzeń i kodeków go zabija; zostaje jako opcjonalna weryfikacja. |
| Loudness i eksport — jeden kod czy dwa? | Jeden kod BS.1770-4 (K-weighting: shelving HP +4 dB @1681 Hz + RLB HP @38 Hz, bloki 400 ms / 75% overlap, gating -70 LUFS absolutny i -10 LU relatywny) plus true peak z 4× oversamplingiem, w rdzeniu. Różne CELE per profil: mowa -16 LUFS / -1 dBTP / LRA 4-8 LU, śpiew -14 LUFS / -1 dBTP. Dodatkowo normalizacja PER MÓWCA do -20 LUFS short-term PRZED masterem. Eksport: WebCodecs AudioEncoder gdzie jes | Pomiar loudness jest identyczny dla mowy i śpiewu — różni się tylko liczba docelowa, więc dwa kody to dwa miejsca na tę samą usterkę. Normalizacja per mówca przed masterem jest konieczna, bo inaczej kompresor mastera pracuje inaczej dla cichego i głośnego rozmówcy i słychać "pompowanie" na zmianach mówcy. Mierzyć trzeba PLIK DOSTARCZANY, nie bufor roboczy — pułapka +3 LU między mono i dual-mono je | ffmpeg.wasm do pomiaru/konwersji — odrzucone: domyślny core jest budowany z GPL-owymi komponentami, plus rozmiar. Web Audio DynamicsCompressorNode / BiquadFilterNode w łańcuchu — odrzucone: brak makeup i knee, zachowanie różni się między przeglądarkami, nie istnieje na iOS/Android. MP3 jako format podstawowy — odrzucony; zostaje wyłącznie jako eksport zgodnościowy z rozdziałami ID3v2 CHAP. |
| ASR on-device na iOS i Androidzie? | iOS 26+: SpeechAnalyzer + SpeechTranscriber (on-device, bez limitu długości, ResultAttributeOption.audioTimeRange i .transcriptionConfidence dają timing i pewność per fragment) — ale TYLKO za runtime-gate'em SpeechTranscriber.supportedLocales.contains(pl_PL) i installedLocales z pobraniem assetu. Fallback i Android: Parakeet TDT v3 ONNX int8 (670 MB) przez sherpa-onnx, jako świadomy opt-in "tryb o | SpeechTranscriber jest bezpłatny, już na urządzeniu i nie wymaga pobierania 670 MB — to najlepsze UX, jeśli polski jest w zestawie locale. Ale polskiego nie ma w zestawie startowym iOS 26, więc kod musi to sprawdzać w runtime, a nie zakładać. 670 MB w przeglądarce nie może być ścieżką domyślną — natywnie jest to akceptowalne jako jawny wybór użytkownika. | Założenie, że pl-PL jest wspierany przez SpeechTranscriber — odrzucone: brak dowodu, wymaga sprawdzenia na urządzeniu. WhisperKit (MIT, aktywny) jako podstawowy on-device — odrzucony: baza to Whisper, czyli halucynacje i DTW; zostaje jako awaryjna ścieżka na starszych iOS. Vosk jako offline — odrzucony (WER). |
| Czy fine-tunować cokolwiek na polskim? | NIE fine-tunować ASR ogólnego na start (Parakeet v3 jest już trenowany na polskiej części Granary). Fine-tunować trzy rzeczy: (a) klasyfikator wypełniaczy/disfluencji PL — bo żaden ASR nie zwraca tej informacji; (b) opcjonalnie model interpunkcji/truecasingu PL, jeśli pomiar wykaże słabość Parakeeta; (c) LoRA domenowa na Parakeecie dopiero PO zmierzeniu WER na własnym korpusie. Niezależnie: wdroży | Nazwy własne, marki i anglicyzmy IT są dominującym źródłem WER w polskim podcaście, a biasing kontekstowy rozwiązuje to bez treningu i natychmiast (użytkownik i tak wpisuje nazwiska gości w metadanych odcinka). Fine-tuning ASR bez zmierzonego punktu wyjścia jest optymalizacją w ciemno. | Fine-tuning Whispera na polskim jako pierwszy krok — odrzucony: poprawia model, który i tak nie jest wybrany, i nie naprawia braku wypełniaczy ani rozdzielczości timestampów. |

### Specyfikacja

﻿# Filar PODCAST — specyfikacja techniczna

## 0. Teza w jednym akapicie

Podcast to **profil materiału MOWA** przepływający tym samym torem, którym płynie śpiew, plus **jedna dodatkowa warstwa danych**: adnotacje czasowe (słowa, mówcy, disfluencje). Wszystko, co dotyczy próbek — capture, plik na dysku, piramida peaków, EDL, silnik odtwarzania, renderer offline, łańcuch DSP, pomiar loudness, eksport — jest **jednym kodem**. Wszystko, co dotyczy tekstu, jest **osobnym modułem, ale nie osobnym produktem**: edycja po tekście to drugi *widok* na ten sam EDL, emitujący te same komendy co timeline.

---

## 1. Granica wspólne / podcastowe (to determinuje architekturę)

### 1.1 Tabela rozdziału

| Warstwa | Wspólna? | Co jest specyficzne dla mowy |
|---|---|---|
| Capture (AudioWorklet / AVAudioEngine / Oboe → ring buffer → plik i24) | **100% wspólna** | nic |
| Kompensacja latencji round-trip, monitoring, miernik RMS/clip | **100% wspólna** | nic |
| Plik na dysku (i24 raw + nagłówek), FLAC-24 na archiwum | **100% wspólna** | nic |
| Peak pyramid (min/max/rms, 6 poziomów) | **100% wspólna** | nic |
| EDL (projekt / ścieżka / klip / fade / gain / automatyka) | **100% wspólna** | nic |
| Command log, undo/redo, autosave | **100% wspólna** | nic |
| Silnik RT (scheduling z zegara audio, streaming z dysku) | **100% wspólna** | nic |
| Renderer offline (ten sam graf, inny driver zegara) | **100% wspólna** | nic |
| Bloki DSP (HPF, gate/expander, kompresor, EQ, de-esser, limiter, FDN reverb) | **kod wspólny** | **tylko stałe** (patrz `MaterialProfile`) |
| LUFS BS.1770-4 + true peak 4× | **kod wspólny** | **tylko target** (-16 vs -14 LUFS) |
| Eksport / kodeki / metadane | **kod wspólny** | rozdziały (CHAP/Podcasting 2.0), transkrypt jako artefakt |
| VAD, obwiednia RMS, noise floor | **wspólna** | progi |
| Detektor oddechów (pYIN + spectral flatness) | **wspólna** *(używa detektora F0 z toru śpiewu)* | akcja redakcyjna |
| **PitchTrack** (pYIN + Viterbi, scoring intonacji) | tylko śpiew | — |
| **WordTrack** (ASR + forced alignment) | — | **tylko mowa** |
| **SpeakerTrack** (diaryzacja / przypisanie ścieżki) | — | **tylko mowa** |
| Detektory disfluencji PL (klasa A akustyczna, klasa B kontekstowa) | — | **tylko mowa** |
| Skracanie ciszy z ochroną pauzy retorycznej | — | **tylko mowa** (wymaga WordTrack) |
| Rozdziały, show notes, tytuły, klipy social | — | **tylko mowa** |
| Widok tekstowy (edycja po tekście) | mechanizm wspólny z piano-rollem | dane z WordTrack |
| Double-ender (nagrywanie zdalne wielościeżkowe) | **wspólna** (priorytet: podcast) | protokół zgód, etykiety mówców |

**Wniosek architektoniczny:** granica nie przebiega między ekranami ani między formatami plików. Przebiega w **warstwie analizy**, która jest pluggable.

### 1.2 Kontrakt warstwy analizy

```rust
// core-edl/src/analysis.rs
pub enum AnalysisTrackKind {
    Pitch,     // śpiew: F0 + confidence + voiced, 5.33 ms hop
    Vad,       // wspólne: mowa/nie-mowa + poziom
    Word,      // mowa: słowa z granicami i pewnością
    Speaker,   // mowa: kto mówi
    Disfluency,// mowa: wypełniacze / powtórzenia / oddechy
}

/// Adnotacja to zawsze interwał w klatkach źródła + payload.
pub struct Annotation {
    pub source_id: SourceId,
    pub start: u64,       // klatka w źródle, 48 kHz
    pub end: u64,
    pub payload: Payload, // Word{text, conf} | Speaker{id} | Disfl{class, kind, conf} | ...
}

pub struct AnalysisTrack {
    pub kind: AnalysisTrackKind,
    pub source_id: SourceId,
    pub anns: Vec<Annotation>, // posortowane po start, indeks interwałowy
}
```

Edytor konsumuje `Annotation` **generycznie**. Dzięki temu jeden mechanizm obsługuje:
piano-roll (Pitch), podświetlanie słów w klipie social 9:16 (Word), podświetlanie wypełniaczy (Disfluency), kolorowanie ścieżek po mówcy (Speaker).

### 1.3 Profil materiału — pełna definicja

```rust
pub struct MaterialProfile {
    pub id: &'static str,              // "speech" | "singing"
    // capture
    pub hp_hz: f32,                    // speech 80 (męski) / 100 (żeński); singing 60
    pub hp_slope_db_oct: u8,           // speech 12; singing 24
    // dynamika
    pub expander: Option<Expander>,    // speech: thr = NF+8, ratio 2:1, depth max -8 dB
    pub comp: Compressor,              // speech: 3:1, thr -18, atk 6 ms, rel 120 ms, knee 6 dB
                                       // singing: 2:1, thr -14, atk 15 ms, rel 200 ms, knee 9 dB
    pub deesser: DeEsser,              // speech 6.5 kHz; singing 7.5 kHz
    // loudness
    pub target_lufs: f32,              // speech -16.0; singing -14.0
    pub target_tp_dbtp: f32,           // -1.0 dla obu
    pub lra_target: (f32, f32),        // speech (4.0, 8.0); singing (6.0, 14.0)
    pub per_speaker_pre_norm_lufs: Option<f32>, // speech Some(-20.0); singing None
    // denoise
    pub denoise: DenoiseCfg,           // speech: DPDFNet 48k, wet 100%, attn limit -18 dB
                                       // singing: spectral gate, max -8 dB, wet 30-50%
    // analiza
    pub analyzers: &'static [AnalysisTrackKind],
    // speech: [Vad, Word, Speaker, Disfluency]
    // singing: [Vad, Pitch]
}
```

Nie ma „aplikacji podcastowej”. Jest `MaterialProfile::SPEECH` i cztery analizatory.

---

## 2. EDL — model kanoniczny (poprawka do obecnego kodu)

Obecny `AudioClip` (`lib/multi-track-storage.ts:18`) ma właściwe **pojęcia** (startTime / duration / trimStart / trimEnd / audioSourceId — edycja niedestrukcyjna z współdzielonymi źródłami) i to zostaje. Zmieniają się trzy rzeczy:

1. **Czas w klatkach całkowitych (`u64` @48 kHz), nie w sekundach `f64`.** Sekundy float uniemożliwiają sample-exact cięcie i są przyczyną obecnej desynchronizacji trim vs pozycja klipu (`multi-track-timeline.tsx:263`).
2. **Fade'y i gain na klipie** — bez nich każde cięcie klika.
3. **Audio poza bazą metadanych** — źródła to pliki, nie `Blob` w IndexedDB.

```rust
pub struct AudioSource {           // plik i24 raw + peaks + opcjonalnie FLAC
    pub id: SourceId,              // UUIDv7
    pub frames: u64,
    pub sample_rate: u32,          // zawsze 48000
    pub channels: u8,              // 1 dla mikrofonu
    pub path_raw: PathBuf,         // /projects/{p}/src/{id}.i24
    pub path_peaks: PathBuf,       // /projects/{p}/src/{id}.pk
    pub clock_ppm: f32,            // zmierzony dryf względem sesji (double-ender)
    pub sha256: [u8; 32],
}

pub struct Clip {
    pub id: ClipId,
    pub track_id: TrackId,
    pub source_id: SourceId,
    pub timeline_start: u64,       // klatka na osi projektu
    pub source_in: u64,            // klatka w źródle
    pub len: u64,                  // długość w klatkach
    pub gain_db: f32,
    pub fade_in: FadeSpec,         // len_frames + kształt (equal-power | linear | s-curve)
    pub fade_out: FadeSpec,
    pub xfade_with_prev: u32,      // klatki nakładki z poprzednim klipem
}
```

**Komendy** (jedyny sposób mutacji, każda ma odwrotność):
`SplitClip`, `RemoveRange{track, start, end, ripple: bool}`, `MoveClip`, `TrimClip`, `SetGain`, `SetFade`, `InsertSilence`, `SetTrackParam`, `AddAutomationPoint`, `SetSpeakerLabel`, `ApplyDisfluencyDecision`.

**Widok tekstowy nie ma własnych operacji.** Usunięcie zdania w tekście = `RemoveRange{start: word[i].start_refined, end: word[j].end_refined, ripple: true}` + `xfade 15 ms`. To jest cała integracja.

---

## 3. ASR dla polskiego

### 3.1 Tabela decyzyjna

| Model | Rozmiar | Licencja | Polski | Timestampy | Runtime | Werdykt |
|---|---|---|---|---|---|---|
| **Parakeet TDT 0.6b v3** | 600M; ONNX int8 **670 MB** (enc 652 + dec 11,8 + join 6,4) | **CC-BY-4.0** (wagi), dane = Granary (opisane) | **WER 7,31% Fleurs / 7,28% MLS**; 25 języków | **natywne** word/segment/char, siatka **80 ms** | NeMo 2.4+ / HF; **ONNX int8 w sherpa-onnx (Apache-2.0), iOS+Android+WASM** | **PODSTAWOWY** |
| Canary-1b-v2 | 978M | CC-BY-4.0 | 25 języków, PL bez osobnej liczby | word + segment | NeMo | **drugi przebieg „max quality” + napisy tłumaczone** |
| Whisper large-v3 | 1550M | MIT | dobry | tylko DTW ±100–200 ms | faster-whisper (MIT), whisper.cpp (MIT) | tani fallback / A-B |
| Whisper large-v3-turbo | 809M (4 warstwy dekodera vs 32) | MIT | „nierówno między językami” wg karty modelu | `return_timestamps="word"` (DTW) | Workers AI **0,03 USD/h** | **podłoga kosztowa, fallback** |
| Moonshine | ~60–200M | MIT | brak realnego PL | — | — | odrzucony |
| Vosk pl small | 50 MB | Apache-2.0 | WER >20% | natywne | dowolny | odrzucony (WER) |
| Apple SpeechTranscriber | wbudowany | platformowa | **wymaga runtime-check** | `.audioTimeRange` + `.transcriptionConfidence` | iOS/macOS **26.0+**, on-device, bez limitu długości | **iOS: pierwszy wybór jeśli `supportedLocales` ⊇ pl-PL** |
| WhisperKit | zależnie od wariantu | MIT (aktywny 07.2026) | jak Whisper | DTW | CoreML, Apple Silicon | awaryjny iOS <26 |
| transformers.js + WebGPU | small/base realnie | Apache/MIT | WER 20–30% dla PL | słabe | WebGPU niedojrzały na iOS Safari | odrzucony |

### 3.2 Dlaczego Parakeet, nie Whisper — trzy powody merytoryczne

1. **Brak halucynacji na ciszy.** Transducer emituje token tylko wtedy, gdy encoder go „widzi”. AED (Whisper, Canary) generuje autoregresyjnie i na 3-godzinnym nagraniu z ciszami produkuje powtarzające się frazy-widma. W edycji po tekście halucynacja jest gorsza od braku słowa: użytkownik kliknie w tekst, który nie istnieje w audio.
2. **Brak okna 30 s.** Whisper wymaga własnej segmentacji + zszywania, co jest źródłem błędów granic na stykach. Parakeet obsługuje długie wejście (do 24 min z pełną atencją, do 3 h z lokalną).
3. **Timestampy z modelu, nie z heurystyki.** TDT przewiduje *duration* tokenu jako część wyjścia. To daje siatkę 80 ms — za grubą do cięcia, ale monotoniczną i niezależną od DTW.

### 3.3 Pułapka wspólna dla obu — i konsekwencja projektowa

**Ani Whisper, ani Parakeet nie zwracają wypełniaczy.** Whisper jest trenowany na czystych napisach. Parakeet v3 jest trenowany na Granary, którego pipeline to *pseudo-labeling z dwuprzebiegową inferencją, filtrowaniem halucynacji i restauracją interpunkcji* — to znaczy, że wypełniacze zostały wyprane na etapie tworzenia danych.

Konsekwencja: cała funkcja „usuń yyy” opiera się na **własnym detektorze akustycznym** (§6.3), a nie na tekście. Kto tego nie wie, buduje funkcję, która nie może działać.

### 3.4 Kontekstowy biasing (największy pojedynczy zysk WER dla PL)

Nazwy własne, marki i anglicyzmy IT są dominującym źródłem błędów w polskim podcaście. Transducer pozwala na to bez treningu:

- Użytkownik podaje w metadanych odcinka listę terminów (imiona i nazwiska gości, marki, nazwy narzędzi) — max 200 pozycji.
- Shallow fusion: podczas dekodowania greedy/beam do log-prawdopodobieństwa dodawany jest bonus z n-gramowego automatu zbudowanego z tej listy: `λ = 2.0` (log), z odwróceniem bonusu przy porzuceniu prefiksu (standardowe context biasing dla RNNT/TDT).
- Wariant zapasowy bez ingerencji w dekoder: post-korekcja fuzzy na wyjściu (Levenshtein na poziomie fonetycznym po transliteracji PL) z progiem 0,82 podobieństwa i wymogiem, żeby długość ≥5 znaków.

### 3.5 Koszty jako punkt odniesienia (zweryfikowane)

| Dostawca / ścieżka | Cena za 1 h audio | Odcinek 3 h × 3 ścieżki = 9 h |
|---|---|---|
| **Cloudflare Workers AI** `@cf/openai/whisper-large-v3-turbo` (0,0005 USD/min) | **0,030 USD** | **0,27 USD** |
| **Groq** whisper-large-v3-turbo | 0,040 USD | 0,36 USD |
| Groq whisper-large-v3 | 0,111 USD | 1,00 USD |
| **Własny kontener CF** (Parakeet+aligner int8, RTF 0,25+0,15, po VAD −35%) | 0,04–0,17 USD | **0,4–1,5 USD** |
| ElevenLabs Scribe v2 (batch) | 0,220 USD | 1,98 USD |
| ElevenLabs Scribe v2 Realtime | 0,390 USD | 3,51 USD |
| Deepgram diaryzacja (add-on, 0,0020 USD/min) | 0,120 USD | 1,08 USD |
| **Auphonic** (mastering + ASR + shownotes) | 1,00 → 0,60 EUR | 5,4–9,0 EUR |
| **Descript Creator** (24 USD / 30 h mediów) | 0,80 USD | 7,20 USD |

Punkt odniesienia dla wyceny: Descript bierze **0,80 USD/h mediów** przy koszcie surowej transkrypcji rzędu 0,03–0,22 USD/h.

---

## 4. Forced alignment — trójstopniowy aligner

**Wymóg:** mediana |błędu granicy| ≤ 20 ms, p95 ≤ 50 ms. Uzasadnienie: polskie słowo przy 150 sł./min trwa 300–400 ms; błąd 150 ms obcina sylabę i słychać to jako ucięte słowo.

### Stopień 1 — timestampy z ASR (zgrubne)
Parakeet TDT: siatka 80 ms (FastConformer, subsampling 8× z 10 ms). Rola: zakotwiczenie kolejności i ograniczenie przestrzeni poszukiwań dla stopnia 2 (±1,5 s).

### Stopień 2 — CTC forced alignment (główny)
- Model: **`jonatasgrosman/wav2vec2-large-xlsr-53-polish`** — Apache-2.0, trenowany na Common Voice PL 6.0, 315M par., ONNX int8 ≈ 320 MB. Tokenizer **grafemowy** (polskie znaki z ogonkami) → **brak słownika wymowy, brak G2P, brak problemu OOV** na nazwach własnych i anglicyzmach.
- Wejście: 16 kHz mono, hop modelu 20 ms.
- Algorytm: Viterbi na kratownicy CTC (własna implementacja w Rust, wzorowana na `torchaudio.functional.forced_align`, BSD-2 — piszemy sami, więc licencja obojętna). Blank i powtórzenia obsługiwane standardowo; `star` token dla fragmentów nieprzewidzianych w transkrypcie.
- Wyjście per słowo: `start_20ms`, `end_20ms`, `score` = średni log-posterior grafemów słowa (to jest realna pewność alignmentu, użyteczna do podświetlania „niepewnych” miejsc w tekście).
- Konwersja do 48 kHz: `frame48 = frame16 * 3` (dokładnie, bez zaokrągleń).

### Stopień 3 — refinement DSP (zawsze, w rdzeniu, na 48 kHz)
Okno `±40 ms` wokół granicy ze stopnia 2:
1. Policz obwiednię energii w oknach 5 ms (hop 1 ms).
2. Kandydat = globalne minimum energii w oknie.
3. Jeśli słowo po granicy zaczyna się od zwartej (p, t, k, b, d, g) — preferuj **początek ciszy zwarcia**: pierwsza próbka, gdzie energia spada poniżej 0,25 × mediany otoczenia i utrzymuje się ≥15 ms.
4. Snap do najbliższego **przejścia przez zero** w tym samym kierunku nachylenia.
5. Przy każdym cięciu: crossfade **równopotęgowy 8–15 ms** (12 ms domyślnie).

**Kryterium akceptacji cięcia (test automatyczny):** |Δamplitudy| na styku < 0,002 po crossfade; wzrost THD+N < 0,1 dB względem materiału nieciętego.

### Wpięcie w pipeline
```
segmenty mowy (VAD, lokalnie)
  → ASR (Parakeet)            → tekst + tokeny 80 ms
  → aligner CTC (XLSR-PL)     → granice 20 ms + score
  → refinement DSP            → granice ~1 ms, gotowe do cięcia
  → WordTrack (Annotation[])
```
Realignment po edycji tekstu: **tylko okno zmienione** (zdanie ± 2 zdania), nigdy całość.

### Produkt uboczny alignmentu — luki
Przedziały mowy (VAD = speech) **niepokryte żadnym słowem** to dokładnie miejsca, gdzie były wypełniacze, oddechy i jąkanie. To fundament §6.3 i §6.4 — i jedyny sposób odzyskania informacji, którą ASR skasował.

### MFA jako golden reference (nie produkcja)
Montreal Forced Aligner: kod **MIT**, modele polskie **`polish_mfa` (CC-BY-4.0)** i `polish_cv` (CC-0), phone set MFA/Epitran. W produkcji odrzucony (Kaldi + Python + słownik wymowy + G2P na OOV). W CI: 30 min polskiego materiału zalignowanego MFA jako prawda, przeciw której mierzymy medianę i p95 błędu granic naszego alignera na każdym commicie.

---

## 5. Diaryzacja vs nagrywanie wielościeżkowe

### 5.1 Werdykt
**Budujemy double-ender.** Diaryzacja modelami zostaje wyłącznie fallbackiem.

**Uzasadnienie merytoryczne (nie kosztowe):** DER 8–15% na realnych podcastach oznacza, że co dziesiąte słowo może być przypisane złemu mówcy. W edycji po tekście ten błąd nie jest kosmetyczny — użytkownik filtruje „pokaż tylko moje wypowiedzi”, klika „usuń wszystkie wypełniacze gościa”, a system tnie w cudzej wypowiedzi. Mowa nakładająca się (najczęstsze miejsce w rozmowie!) jest przez diaryzację praktycznie gubiona. Osobne ścieżki dają **zero** błędu przypisania, a dodatkowo: per-osobę gain/EQ/gate/denoise, usuwanie crosstalku, niezależny ratunek gdy jedna strona padnie, brak kompresji VoIP.

Riverside — najlepszy w klasie w nagrywaniu — robi dokładnie to: **lokalny zapis 48 kHz nieskompresowanego WAV per uczestnik + progresywny upload w małych kawałkach w trakcie nagrania**. To zewnętrzne potwierdzenie, że problem należy rozwiązać w warstwie nagrywania, nie w warstwie modeli.

### 5.2 Protokół double-ender

**Role:** host (właściciel projektu) + N gości (N ≤ 7). Każdy uczestnik = jedna `AudioSource` + jedna `Track`.

**Kanały:**
- WebRTC (Opus 32–48 kb/s, AEC/AGC/NS **włączone**) — wyłącznie do *rozmowy na żywo*. Ten strumień **nigdy** nie jest materiałem.
- Lokalny zapis (AudioWorklet / AVAudioEngine / Oboe → i24 48 kHz mono, `echoCancellation:false, noiseSuppression:false, autoGainControl:false`) — **to jest materiał**.
- Referencyjny miks zdalny: 16 kHz mono, i16, to co uczestnik *słyszy* — 28,8 kB/s, do synchronizacji.

**Upload:** presigned R2 multipart, części **5 MB** (≈34 s audio i24) — bezpośrednio z klienta, nigdy przez Workera (limit body 100 MB, 128 MB RAM na isolate). Okno ryzyka utraty = 34 s, a lokalny plik jest zawsze prawdą i można go dosłać po fakcie.
Liczba części dla 3 h: 1 555 200 000 B / 5 MB ≈ **312 części** (limit R2 to 10 000 — z zapasem).

**Synchronizacja — trzy mechanizmy, wszystkie obowiązkowe:**

| # | Mechanizm | Dokładność | Rola |
|---|---|---|---|
| 1 | Cristian nad WebSocket DO: 20 sond RTT, mediana, `offset = t_srv + RTT/2 − t_loc` | ±20–50 ms | zgrubne ustawienie, natychmiast |
| 2 | **GCC-PHAT** lokalnej ścieżki A vs referencyjny miks u B, okno 60 s, FFT 2²⁰ | **±1 próbka (±21 µs)** | offset dokładny, bez udziału użytkownika |
| 3 | **Korekta dryfu:** pomiar (2) w punktach co 5 min → regresja liniowa `offset(t)` → resampling korygujący (rubato, sinc VHQ, `clock_ppm` zapisany w `AudioSource`) | ≤1 ms na 3 h | **warunek użyteczności długich odcinków** |

**Dlaczego (3) jest krytyczne:** nominalne 48 000 Hz na dwóch urządzeniach różni się realnie o do **±100 ppm**. Na 3 h to **1,08 s** narastającego rozjazdu. Poprawny offset startowy jest bezwartościowy, jeśli po godzinie ścieżki rozchodzą się o 350 ms. Prawie żadne narzędzie nie mówi o tym wprost.

**Opcjonalna weryfikacja:** trzy chirpy 18–20 kHz na start (nie jako główny mechanizm — część urządzeń i kodeków je zabija).

**Zgody:** przed pierwszym blokiem nagrania każdy uczestnik musi kliknąć zgodę na nagranie i transkrypcję; zgoda z timestampem i `device_id` do D1. To wymóg prawny, nie feature.

### 5.3 Diaryzacja jako fallback

Stosowana wyłącznie do: (a) importu obcych plików, (b) jednej ścieżki z dwiema osobami przy jednym mikrofonie, (c) etykietowania crosstalku na ścieżkach double-endera.

| Model | Licencja wag | Runtime | Werdykt |
|---|---|---|---|
| **pyannote/segmentation-3.0** | **MIT** (gated: auto) | ONNX przez **sherpa-onnx** (Apache-2.0) — Android/iOS/WASM/C++/Rust | **on-device, ścieżka podstawowa fallbacku** |
| Embeddingi 3D-Speaker / WeSpeaker / NeMo (int8) | Apache-2.0 | sherpa-onnx | **on-device** |
| pyannote/speaker-diarization-community-1 | CC-BY-4.0 (gated) | pipeline Python | serwerowo, wyższa jakość |
| NVIDIA `diar_streaming_sortformer_4spk-v2` | CC-BY-4.0 | NeMo | diaryzacja *na żywo*, ≤4 mówców |
| `sherpa-onnx-reverb-diarization-v1` | pochodne Rev, niekomercyjne | — | **odrzucone** |

**Higiena wag:** `pyannote/segmentation-3.0` jest gated (auto) — wagi trzeba zaakceptować, zarchiwizować lokalnie i zapisać SHA-256 w `docs/licensing.md` razem z URL i datą, bo gating może się zmienić. CC-BY-4.0 na Parakeecie/Canary/community-1 wymaga **ekranu atrybucji w produkcie** — to zobowiązanie, nie formalność.

**Crosstalk gating na ścieżkach double-endera** (to działa tylko dlatego, że mamy osobne ścieżki):
- Dla pary ścieżek (A, B): jeśli `RMS_A(t) > NF_A + 10 dB` i `RMS_B(t) < RMS_A(t) − 12 dB` i korelacja krótkoterminowa `|r_AB| > 0,4` (opóźniona o zmierzony offset akustyczny) → B zawiera przeciek A.
- Akcja: ducking B o 12–18 dB, attack 5 ms, release 120 ms. Nie gate — gate odcina początki wyrazów B.

---

## 6. Automaty redakcyjne

### 6.1 Skracanie ciszy (z ochroną rytmu)
- Obwiednia: RMS okno 20 ms / hop 10 ms na 16 kHz mono → dBFS.
- `NF` = 10. percentyl rozkładu poziomów całej ścieżki.
- Histereza: otwarcie `NF + 10 dB`, zamknięcie `NF + 6 dB`.
- Min długość mowy 120 ms (krótsze = artefakt, scal z sąsiadem).
- Kandydat do skrócenia: cisza ≥ **350 ms**.
- Docelowa długość: `min(orig, max(150 ms, 0,25 × orig))`. Presety agresywności: łagodny 400 ms / średni 250 ms / mocny 150 ms.
- Padding: 120 ms po ostatnim słowie, 80 ms przed następnym.
- **Pauza retoryczna chroniona:** jeśli poprzednie słowo w WordTrack kończy zdanie (`.` `?` `!` z ASR), minimum **400 ms**. To miejsce, w którym warstwa tekstowa realnie poprawia decyzję DSP.
- Cięcie: `RemoveRange` + crossfade 15 ms.

### 6.2 Oddechy — tłumić, nie usuwać
Detekcja (koniunkcja): RMS ∈ [−45, −25] dBFS; spectral flatness > 0,30; **brak F0 z pYIN** (clarity < 0,45); długość 150–500 ms; mowa w oknie ±1 s.
Akcja domyślna: **tłumienie −12 dB, fade in/out 20 ms, długość zachowana.** Usunięcie tylko na jawne życzenie i **z wstawieniem ciszy tej samej długości**.
Detektor F0 to ten sam pYIN, który obsługuje tor śpiewu — zero dodatkowego DSP.

### 6.3 Wypełniacze KLASA A — niesłowne (yyy, eee, mmm, aaa, hmm)
Źródło kandydatów: **luki w alignmencie** (§4). Warunki:

| Cecha | Progi |
|---|---|
| długość | 120–800 ms |
| brak przypisanego słowa | tak |
| VAD = mowa | tak |
| F0 wykryty (odróżnia od oddechu) | clarity > 0,6 |
| stabilność F0 | SD < 40 centów, \|nachylenie\| < 200 centów/s |
| stabilność barwy | zmiana centroidu widmowego < 15% w oknie |
| poziom | −40…−12 dBFS |

Klasyfikacja typu przez formanty (wartości orientacyjne, do kalibracji na własnym korpusie):
- `yyy` [ɨ]: F1 ≈ 300–400 Hz, F2 ≈ 1500–1900 Hz
- `eee` [ɛ]: F1 ≈ 550–650 Hz, F2 ≈ 1700–1900 Hz
- `mmm` (nazalne): energia skupiona <500 Hz, brak wyraźnego F2

**Akcja: usuwalne automatycznie** (to nie leksem, nie zmienia sensu), z pozostawieniem **100 ms ciszy**.
**Cel: precyzja ≥97%, recall ≥85%.**

### 6.4 Wypełniacze KLASA B — leksykalne (polskie, trudne)
Lista kandydatów (nie reguła decyzyjna, tylko zbiór do klasyfikacji):
`no`, `znaczy`, `to znaczy`, `jakby`, `tak jakby`, `wiesz`, `no wiesz`, `prawda`, `nie?`, `tak?`, `generalnie`, `w zasadzie`, `w sumie`, `powiedzmy`, `że tak powiem`, `tego`, `typu`, `dosłownie`, `po prostu`, `jakoś`, `ogólnie`, `tak naprawdę`, `no dobra`, `dobra`, `okej`, `słuchaj`, `patrz`, `rozumiesz`.

**Te formy są ortograficznie identyczne ze zwykłymi użyciami.** Dlatego lista słów + auto-apply jest błędem merytorycznym, nie tylko ryzykownym UX:
- „**No** dobra, zrobiłem” (wypełniacz) vs „**No** i wtedy poszedłem” (spójnik dyskursywny, potrzebny)
- „fajnie, **nie**?” (tag question, wypełniacz) vs „**nie** zrobiłem” (negacja — usunięcie odwraca sens)
- „**jakby** + rzeczownik” = porównanie (potrzebne) vs „**jakby** + czasownik/pauza” = wypełniacz
- „to **znaczy**” (spójnik wyjaśniający) vs samodzielne „**znaczy**”

**Klasyfikator per token:**
- Wejście: okno ±6 tokenów (kontekst leksykalny) **+ cechy prozodyczne**: pauza przed / po (ms), czas trwania tokenu / mediana tego tokenu w korpusie, ΔF0 na tokenie, energia względna, pozycja we frazie.
- Model: fine-tune **HerBERT-base** (`allegro/herbert-base-cased`, CC-BY-4.0) lub `sdadas/polish-roberta-base-v2`, head binarny + cechy prozodyczne wstrzyknięte jako dodatkowe embeddingi. Korpus treningowy: **5–10 h własnego oznaczonego materiału PL**.
- Cechy prozodyczne są kluczowe: pauza po tokenie jest najmocniejszą pojedynczą cechą, a wersje czysto tekstowe ją ignorują.

**Polityka produktowa (to jest przewaga nad Descriptem):** klasa B **nigdy** nie jest usuwana automatycznie. Jest: podświetlona, zliczona („znalazłem 47 × »jakby«, 31 pewnych”), z filtrem po pewności i z **podglądem odsłuchowym A/B** dla każdego kandydata przed zastosowaniem.
**Cel: precyzja ≥95% przy recall ≥60%.** Precyzja jest asymetrycznie ważniejsza — fałszywe usunięcie zmienia sens.

### 6.5 Powtórzenia i falstarty
Struktura *reparandum + interregnum + repair*. Detekcja: dopasowanie n-gramów w oknie 8 tokenów; jeśli ciąg X (1–5 tokenów) powtarza się z ≤1 edycją (Levenshtein na lematach) i przerwa między wystąpieniami ≤400 ms **albo** zawiera wypełniacz klasy A → pierwsze wystąpienie jest kandydatem do usunięcia. Prezentacja jako sugestia, nigdy automat.

### 6.6 Auto-rozdziały
1. Zdania z WordTrack (granice zdań z interpunkcji ASR + pauzy >500 ms).
2. Embeddingi zdań: `intfloat/multilingual-e5-base` (MIT) lub `sdadas/mmlw-roberta-base`.
3. Cosine similarity między oknami 5 zdań → TextTiling / C99 → punkty podziału.
4. Ograniczenia: min **90 s**, max **15 min** na rozdział; **snap do najbliższej pauzy >700 ms w oknie ±10 s** (rozdział nigdy nie zaczyna się w środku zdania).
5. Tytuł: LLM, max 60 znaków, po polsku, bez cudzysłowów i numeracji.

Format wyjścia:
```json
{ "version": "1.2.0",
  "chapters": [ { "startTime": 0, "title": "Wstęp" },
                { "startTime": 187.42, "title": "Dlaczego mikrofon dynamiczny" } ] }
```
Plus ID3v2 `CHAP`/`CTOC` dla MP3 i chapter track QuickTime dla M4A.

### 6.7 Show notes — z obowiązkowym zakotwiczeniem
Struktura wymuszona: streszczenie 60–90 słów → 3–7 punktów kluczowych **każdy z timestampem** → nazwy własne i linki (NER) → 3–5 pytań (SEO) → pełny transkrypt.

**Antyhalucynacja (twarda reguła walidatora):** każdy bullet musi zawierać zakotwiczenie `{word_start_idx, word_end_idx}` wskazujące cytat z transkryptu, z którego powstał. Bullet bez zakotwiczenia, albo z zakotwiczeniem o podobieństwie leksykalnym <0,35 do treści bulleta, jest **odrzucany automatycznie** przed pokazaniem użytkownikowi.
Rozmiar wejścia: 3 h ≈ 27 000 słów ≈ 40 000 tokenów — jedno wywołanie.

### 6.8 Klipy do social
Scoring okien 20–90 s (przesuw 5 s):
- `+` domknięcie retoryczne: zaczyna się po pauzie >600 ms, kończy zdaniem oznajmującym
- `+` gęstość mowy (słowa/s w percentylu 60–90 odcinka)
- `+` dynamika: SD F0 i SD energii powyżej mediany odcinka
- `+` pytanie w pierwszych 8 s
- `+` śmiech (detektor: energia >−20 dBFS, spectral flatness 0,15–0,35, modulacja 4–7 Hz)
- `+` ocena LLM 0–1: „czy fragment jest zrozumiały bez kontekstu”
Wyjście: 5–10 kandydatów. Render 9:16 z **karaoke-highlight słów z WordTrack** — ta funkcja jest darmowa, bo mechanizm podświetlania jest ten sam, co piano-roll w torze śpiewu.

---

## 7. Skala danych — policzone

### 7.1 Rozmiary (3 h, 48 kHz, mono per ścieżka)

| Format | B/s | 1 h | 3 h × 1 ścieżka | **3 h × 3 ścieżki** |
|---|---|---|---|---|
| f32 | 192 000 | 691,2 MB | 2,074 GB | **6,221 GB** |
| **i24 (roboczy)** | 144 000 | 518,4 MB | **1,555 GB** | **4,666 GB** |
| i16 | 96 000 | 345,6 MB | 1,037 GB | 3,110 GB |
| FLAC-24 (≈58%) | ~83 500 | ~301 MB | ~0,90 GB | **~2,71 GB** |
| Opus 64 kb/s (tylko podgląd/WebRTC) | 8 000 | 28,8 MB | 86,4 MB | 259 MB |
| Referencyjny miks 16 kHz i16 | 32 000 | 115,2 MB | 345,6 MB | 1,037 GB |

**Werdykt:** i24 raw jako format capture i roboczy; FLAC-24 na archiwum/upload. f32 nie nosi więcej informacji (ENOB realnego ADC = 20–21 bitów) i kosztuje +25% I/O w hot pathu. Raw, nie FLAC, jako roboczy — bo odczyt losowy to czysty `seek(frame × 3)` bez dekodowania.

### 7.2 Peak pyramid

6 poziomów, współczynnik 4, bucket = `{min: i16, max: i16, rms: i16}` = 6 B.

| Poziom | Próbek/bucket | Bucketów (3 h) | Rozmiar |
|---|---|---|---|
| L0 | 256 | 2 025 000 | 12,15 MB |
| L1 | 1 024 | 506 250 | 3,04 MB |
| L2 | 4 096 | 126 563 | 0,76 MB |
| L3 | 16 384 | 31 641 | 0,19 MB |
| L4 | 65 536 | 7 911 | 47 kB |
| L5 | 262 144 | 1 978 | 12 kB |
| **Razem** | | | **≈16,2 MB / ścieżka → 48,6 MB / 3 ścieżki** |

Kontrola pokrycia zoomu: cała 3 h w 1600 px → 324 000 klatek/px → L5 daje **1,24 bucketa/px** ≥ 1. ✅ Sześć poziomów wystarcza.

To naprawia dwie obecne usterki: stała rozdzielczość 1000 próbek (`lib/multi-track-storage.ts:715`) i przekroczenie maksymalnego rozmiaru canvasu już przy klipie 5,5 min (`components/timeline/audio-clip.tsx:53`).

### 7.3 Streaming reader (warunek edytowalności)
- Per odtwarzany klip: ring buffer 4 × 65 536 klatek = 262 144 klatek ≈ 5,46 s prefetch.
- Wątek dyskowy o niższym priorytecie; konwersja i24→f32 blokowo.
- Pamięć: 12 ścieżek × 262 144 × 4 B = **12,6 MB**. 
- **Nigdy** pełny dekod do RAM — to obecna usterka (`lib/multi-track-engine.ts:491`, trzykrotny dekod przy imporcie).

### 7.4 Storage per platforma

| | Web | iOS | Android |
|---|---|---|---|
| Audio | **OPFS** + `FileSystemSyncAccessHandle` w dedykowanym Workerze | `Application Support/projects/{id}/`, `isExcludedFromBackup = true` | `filesDir` / `getExternalFilesDir` |
| Odczyt | `read(buf, {at})` synchronicznie w Workerze | `Data(contentsOf:, .mappedIfSafe)` | `memmap2` w rdzeniu |
| Metadane + command log | **SQLite Wasm na OPFS** | SQLite (`rusqlite` w rdzeniu) | SQLite (ten sam rdzeń) |
| Trwałość | **`navigator.storage.persist()` obowiązkowo** | trwałe | trwałe |
| Dostępność API | Chrome 102+, Chrome Android 109+, **Safari/iOS 15.2+**, Firefox 111+ | — | — |

**Bramka miejsca (obowiązkowa, przed startem nagrania):** `navigator.storage.estimate()` / `volumeAvailableCapacity`; wymagane wolne = **1,3 × przewidywany rozmiar**. Dla 3 h × 3 ścieżki i24 = **6,07 GB wymagane**. Poniżej progu: propozycja zapisu FLAC-24 w locie (kompresja realtime, +8–12% CPU, rozmiar ×0,58).

**Kwoty i eviction (zweryfikowane):** per-origin Chrome ~60% dysku, Safari (macOS 14+/iOS 17+) ~60% dla przeglądarki i ~15% dla WebView; limit łączny 80%. **Bez `persist()` Safari usuwa dane skryptowe po 7 dniach bez interakcji użytkownika** — 4,7 GB projektu przepada. `persist()` w Chrome/Safari jest przyznawany heurystycznie bez promptu, więc trzeba obsłużyć odmowę: ostrzeżenie i rekomendacja aplikacji natywnej dla długich sesji.

**Twardy sufit weba:** brak nagrywania w tle i przy zablokowanym ekranie. 3-godzinna sesja w zakładce jest realnie zagrożona (przełączenie aplikacji, blokada na iOS). To argument, nie preferencja: **długie nagrywanie należy do aplikacji natywnych** (iOS `UIBackgroundModes: audio`, Android foreground service), a web jest w pełni sprawny dla importu, edycji, renderu i sesji krótkich.

**Jedna baza, jeden schemat.** Obecne trzy niezależne bazy IndexedDB + trzy klucze localStorage bez migracji i bez wspólnego ID (`lib/project-templates.ts:261`) zastępuje jeden schemat SQLite z `id UUIDv7`, `updated_at`, `deleted_at`, `device_id`, `schema_version` w każdej tabeli — identyczny na trzech platformach.

---

## 8. Backend

### 8.1 Co MUSI być serwerowo (i dlaczego akurat to)

| Funkcja | Dlaczego nie da się lokalnie |
|---|---|
| Sesja double-ender: sygnalizacja, sync zegarów, stan uczestników | potrzebny rendez-vous i trwałość między urządzeniami |
| Odbiór ścieżek gości | dane gościa muszą fizycznie dotrzeć do hosta |
| ASR / alignment / diaryzacja w domyślnej ścieżce web | 670 MB + 320 MB modeli nie może być domyślnym pobraniem |
| LLM: rozdziały, show notes, tytuły, scoring klipów | brak sensownego lokalnego odpowiednika jakościowego |
| Konto, licencja, płatność | oczywiste |

**Co zostaje lokalnie:** VAD i segmentacja, cała edycja, cały render i eksport, przechowywanie projektu. Render lokalnie dlatego, że klient ma **cały graf DSP w rdzeniu i wszystkie próbki** — wysyłanie 4,7 GB, żeby dostać z powrotem plik, jest gorsze na każdym wymiarze.

### 8.2 Kształt na Cloudflare

```
Klient (web / iOS / Android)
  │  WebSocket ──────────────► Durable Object "Session"          (1 per sesja)
  │                              • sygnalizacja WebRTC
  │                              • Cristian clock sync
  │                              • stan uczestników, zgody
  │                              • hibernacja WS
  │  presigned multipart PUT ─► R2  bucket "tracks"              (5 MB części)
  │                                  ↓ event / kolejka
  │                             Queue "asr-jobs"
  │                                  ↓
  │                             Workflow "episode-pipeline"      (durable, retry)
  │                                  ├─► Container standard-4  ASR Parakeet ONNX int8
  │                                  ├─► Container standard-4  aligner XLSR-PL int8
  │                                  ├─► Container standard-4  pyannote seg. (tylko fallback)
  │                                  ├─► Workers AI whisper-turbo (tania/awaryjna ścieżka)
  │                                  └─► LLM API (rozdziały, show notes)
  │  GET wyników ◄──────────── R2 "artifacts" (WordTrack, SpeakerTrack, chapters — JSON/binarnie)
  └─ metadane, zadania, konta ─ D1
```

**Twarde ograniczenia platformy, które ukształtowały ten diagram (zweryfikowane):**
- Worker: body **100 MB** (Free/Pro), pamięć **128 MB / isolate** → audio nigdy nie przechodzi przez Workera; upload zawsze presigned do R2.
- Containers: max **standard-4 = 4 vCPU / 12 GiB / 20 GB disk**, **bez GPU** → inferencja CPU int8, batch, nie realtime.
- Cron/Queue/DO alarm: max **15 min** wykonania → pipeline musi być pocięty na segmenty i orkiestrowany Workflow.

**Konsekwencja produktowa, nie techniczna:** 3 h nie zostaną przetranskrybowane w 30 s. Więc pipeline jest asynchroniczny i **UI musi działać na wynikach częściowych** — segmenty 5-minutowe do N równoległych kontenerów, tekst pojawia się przyrostowo. Wymóg: **pierwszy tekst na ekranie ≤60 s od zakończenia nagrania.**

### 8.3 Koszt odcinka 3 h × 3 ścieżki (9 h audio)

| Pozycja | Wyliczenie | Koszt |
|---|---|---|
| Inferencja — kontener (Parakeet RTF 0,25 + aligner RTF 0,15, po VAD −35%) | `9 h × 3600 s × 0,40 × 0,65 = 8 424 s` × `(4 × 0,00002 + 12 × 0,0000025)` = 8424 × 0,00011 | **0,93 USD** |
| ...ten sam etap przy RTF 0,15+0,10 | 5 265 s × 0,00011 | 0,58 USD |
| **Alternatywa: Workers AI whisper-turbo** (bez alignmentu/diaryzacji) | 540 min × 0,0005 | **0,27 USD** |
| LLM (40k in + 2k out, klasa Sonnet) | — | ~0,15 USD |
| R2 storage FLAC-24 (2,71 GB) | 2,71 × 0,015 | 0,041 USD/mies |
| R2 Class A (multipart: ~940 PUT + 6) | 946 × 4,50/10⁶ | 0,004 USD |
| R2 Class B (odczyty artefaktów) | pomijalne | <0,001 USD |
| **Razem (ścieżka Parakeet+aligner)** | | **≈0,75–1,15 USD / odcinek** |
| **Razem (ścieżka whisper-turbo)** | | **≈0,47 USD / odcinek** |

**Odniesienie:** Descript Creator = 24 USD / 30 h = **0,80 USD za godzinę mediów**; ten odcinek to 9 h mediów = 7,20 USD u Descripta. Auphonic: 9 h × 1,00 EUR = 9 EUR.
**Wniosek dla modelu biznesowego:** darmowy plan musi mieć twardy limit godzin — inaczej inferencja zje przychód. Marża jest zdrowa (≈8–15× na godzinie).

### 8.4 Czego NIE budować
- **GPU backend** — Containers go nie mają, a batch nie potrzebuje realtime; GPU kupuje czas, którego pipeline asynchroniczny nie wymaga.
- **Render serwerowy** — bez korzyści, z kosztem.
- **Własny hosting RSS/feedu** — pobocze; eksport do istniejących hostingów (RSS + rozdziały + transkrypt) wystarcza.
- **ffmpeg.wasm** — domyślny core jest budowany z komponentami GPL, plus rozmiar.

---

## 9. Poprzeczka i czym ich pobić

| Narzędzie | Co robi dobrze | Gdzie jest słabe |
|---|---|---|
| **Descript** (16/24/50 USD, 10/30/40 h mies.) | edycja po tekście — wzorzec kategorii; Studio Sound; multitrack we wszystkich płatnych | format zamknięty i chmura obowiązkowa; auto-usuwanie wypełniaczy działa naprawdę tylko po angielsku; polskie wypełniacze nieobsługiwane; edytor tekstowy odbiera kontrolę nad crossfade'ami; Studio Sound artefaktuje na śmiechu i muzyce |
| **Riverside** | **najlepsze nagrywanie**: lokalnie 48 kHz WAV per uczestnik + progresywny upload w kawałkach | edytor płaski; brak głębokiej obróbki; brak edycji po tekście na poziomie Descripta |
| **Adobe Podcast Enhance** | najlepszy jednoprzyciskowy „głos radiowy”, darmowy | filtr generatywny → **halucynuje na muzyce i śmiechu**, zmienia barwę; brak lokalności; brak edytora |
| **Auphonic** (€9/9 h … €149/250 h; 2 h/mies. darmowo) | najlepszy batch-master: leveler, noise+reverb reduction, AutoEQ, BWE, loudness spec, **filler & silence cutting**, multitrack, rozdziały, shownotes | brak UI edycyjnego; brak edycji po tekście; wsad/wynik, zero interakcji |
| **Hindenburg** | workflow dziennikarski, auto-leveling per region, EBU R128, „clipboard” | brak ASR/tekstu; UI archaiczny; brak mobile |

### Pięć rzeczy, którymi się to bije (każda merytoryczna, nie marketingowa)

1. **Polski jako obywatel pierwszej kategorii.** Parakeet PL (7,3% WER) + **grafemowy aligner PL bez słownika wymowy** (nazwy własne i anglicyzmy nie są OOV) + **własny klasyfikator wypełniaczy PL z cechami prozodycznymi** + kontekstowy biasing na nazwiska gości. Żadne z pięciu narzędzi tego nie ma; wszystkie traktują polski jako „kolejny język”.
2. **Lokalny rdzeń, lokalne dane, chmura opcjonalna.** Projekt to katalog na dysku, render lokalny, chmura tylko na inferencję i sesję. Descript i Riverside są chmura-obowiązkowa; utrata konta = utrata materiału.
3. **Nagranie, którego nie da się zepsuć.** Double-ender z lokalnym i24, okno utraty ≤34 s, **i korekta dryfu zegarów** (do 1,08 s na 3 h) — o tym ostatnim konkurencja nie mówi wprost, a to jest realna przyczyna „rozjechanych” zdalnych nagrań.
4. **Uczciwe automaty.** Klasa A wypełniaczy usuwana automatycznie, klasa B **tylko jako sugestia z podglądem A/B**; oddechy tłumione, nie usuwane; pauza retoryczna chroniona; **każdy bullet show notes zakotwiczony w cytacie z transkryptu, bez zakotwiczenia — odrzucany**. To adresuje wprost najczęstsze skargi na Descript i Adobe.
5. **Jeden tor ze śpiewem.** Ten sam capture, ten sam edytor, ten sam eksport, ten sam LUFS, ten sam pYIN. Klip social z karaoke-highlight słów i piano-roll intonacji to **ten sam mechanizm adnotacji**. Żadne z pięciu narzędzi tego nie ma i nie może mieć.

---

## 10. Architektura kodu (rdzeń przenośny)

```
core/                              # Rust workspace, zero API platformy
  core-audio/    PCM i24/i16/f32, WAV, FLAC (flacenc), resampling (rubato),
                 peak pyramid, streaming reader, ring buffer
  core-dsp/      HPF, expander, compressor, EQ(RBJ), de-esser, limiter,
                 FDN reverb, BS.1770-4 + true peak 4x, pYIN  ← wspólne ze śpiewem
  core-edl/      model, komendy + odwrotności, command log, walidacja, serializacja
  core-engine/   graf RT + renderer offline (ten sam kod, inny driver zegara)
  core-speech/   VAD, obwiednia, noise floor, detektor oddechów,
                 detektor wokalizowanych pauz (klasa A),
                 CTC forced aligner (Viterbi), agregacja tokenów→słów,
                 refinement granic, segmentacja zdań, TextTiling, scoring klipów
  core-onnx/     [feature] driver onnxruntime: Parakeet, XLSR-PL, pyannote-seg
  bindings-wasm/ wasm-bindgen
  bindings-ffi/  uniffi → Swift + Kotlin
shell-web/       Next.js 16 / React 19 (istniejący)
shell-ios/       SwiftUI + AVAudioEngine
shell-android/   Jetpack Compose (Kotlin) + Oboe
```

**Krytyczne rozdzielenie w przeglądarce:** `AudioWorklet` nie może załadować onnxruntime. Dlatego:
- `AudioWorklet` ← rdzeń WASM **bez** feature `onnx` (tylko graf RT, DSP, pYIN).
- `Web Worker` ← druga instancja WASM **z** `onnx` + `onnxruntime-web` (ASR, aligner, diaryzacja), komunikacja przez `postMessage` z `Transferable`.
- **Nie włączać wasm-threads/SharedArrayBuffer** → brak COOP/COEP → brak psucia zewnętrznych embedów (Safari nie ma `COEP: credentialless`).

**Podział LOC (cel):** ~75% w rdzeniu, ~25% w shellach. Granica FFI: ≤35 funkcji, tylko typy POD.

---

## 11. Metryki akceptacji (bez nich nic z tego nie jest weryfikowalne)

| Obszar | Metryka | Cel |
|---|---|---|
| ASR PL | WER na własnym korpusie (2 h, 6 mówców, telefon/USB/BT) | ≤10% bez nazw własnych, ≤14% z nazwami |
| Alignment | mediana \|błąd granicy\| vs MFA `polish_mfa` | ≤20 ms |
| Alignment | p95 \|błąd granicy\| | ≤50 ms |
| Cięcie | \|Δamplitudy\| na styku po crossfade | <0,002 |
| Cięcie | wzrost THD+N vs materiał nieciętny | <0,1 dB |
| Wypełniacze A | precyzja / recall | ≥97% / ≥85% |
| Wypełniacze B | precyzja / recall | ≥95% / ≥60% |
| Diaryzacja (fallback) | DER | ≤12% |
| Double-ender | \|offset\| po korekcie | ≤2 ms |
| Double-ender | dryf szczątkowy na 3 h | ≤1 ms |
| Loudness | \|zmierzony − target\| na pliku dostarczanym | ≤0,3 LU |
| Loudness | true peak | ≤ −1,0 dBTP **zawsze** |
| Render | 3 h × 6 ścieżek z pełnym DSP | ≥20× realtime (≤9 min) |
| Latencja UX | pierwszy tekst na ekranie po nagraniu | ≤60 s |
| Edycja | przewijanie 3 h × 6 ścieżek | 60 fps, zero dropoutów audio |
| Pamięć | edycja 3 h × 6 ścieżek | ≤400 MB RSS |

---

## 12. Kolejność zależności (nie harmonogram — porządek warunków koniecznych)

1. **Rdzeń Rust + bindingi** (`core-audio`, `core-dsp`, `core-edl`, `core-engine`) — wspólny z torem śpiewu, bez tego nic dalej nie ma sensu.
2. **Poprawny capture** (AudioWorklet/AVAudioEngine/Oboe → ring buffer → i24 na dysk, kompensacja round-trip, monitoring). Obecny tor jest martwy — `MediaRecorder` nigdy nie startuje (`contexts/audio-recorder-context.tsx:62`).
3. **Storage + peak pyramid + streaming reader** — warunek edytowalności 3 h.
4. **EDL na klatkach + command log + undo/redo** — warunek istnienia jakiegokolwiek edytora.
5. **Renderer offline w rdzeniu** — obecnie martwy kod (`lib/multi-track-engine.ts:373`), czyli projektu multitrack nie da się wyeksportować.
6. **Własny korpus ewaluacyjny PL**: 2 h z etykietami (transkrypt, granice słów z MFA, wypełniacze A i B, mówcy, 3 klasy mikrofonów, 3 warunki akustyczne) + golden-file testy w CI. Bez tego każda decyzja o modelu jest zgadywaniem.
7. **ASR + aligner serwerowo** (Container: Parakeet ONNX int8 + XLSR-PL) → WordTrack.
8. **Widok tekstowy** jako drugi widok na EDL.
9. **Detektory disfluencji** (A akustyczny, B po zebraniu 5–10 h etykiet).
10. **Backend sesji + double-ender** (DO + R2 + sync + dryf).
11. **Warstwa redakcyjna** (cisza, oddechy, rozdziały, show notes, klipy).
12. **Natywne shelle** — nagrywanie w tle, on-device ASR, brak eviction.


### Zależności

- Rdzeń Rust (core-audio / core-dsp / core-edl / core-engine) z bindingami wasm-bindgen + uniffi — ten sam rdzeń, który obsługuje tor śpiewu; podcast nie ma własnego rdzenia i nie może ruszyć przed nim
- Poprawny tor capture: AudioWorklet / AVAudioEngine / Oboe → ring buffer → plik i24 48 kHz, z kompensacją latencji round-trip i monitoringiem. Obecny tor jest martwy: MediaRecorder nigdy nie startuje (contexts/audio-recorder-context.tsx:62), więc żadna sesja nie ma audio
- pYIN w rdzeniu (wspólny z torem śpiewu) — jest warunkiem detekcji oddechów (brak periodyczności) i odróżnienia wokalizowanej pauzy od oddechu; bez niego klasa A wypełniaczy jest niewykrywalna
- Peak pyramid (6 poziomów, min/max/rms) + streaming reader z ring bufferem — bez tego 3 h × 3 ścieżki nie da się ani narysować (obecnie stałe 1000 próbek, lib/multi-track-storage.ts:715; canvas przekracza limit już przy 5,5 min, components/timeline/audio-clip.tsx:53), ani odtworzyć bez pełnego dekodu do RAM (lib/multi-track-engine.ts:491)
- EDL na klatkach całkowitych u64 zamiast sekund float (obecny AudioClip w lib/multi-track-storage.ts:18 ma sekundy) + fade'y i gain na klipie — warunek sample-exact cięcia po granicach słów
- Command log z odwrotnościami + snapshot co 50 komend jako JEDYNE źródło mutacji EDL — warunek spójności widoku tekstowego z widokiem timeline (obecnie undo nie istnieje: components/timeline/multi-track-timeline.tsx:262, a w edytorze jednej ścieżki niszczy materiał: components/interactive-waveform.tsx:206)
- Renderer offline w rdzeniu (deterministyczny, blokowy, ten sam graf co RT) — obecny jest martwym kodem (lib/multi-track-engine.ts:373), czyli nie istnieje żadna ścieżka eksportu projektu multitrack
- Jeden schemat SQLite na trzech platformach z UUIDv7 / updated_at / deleted_at / device_id / schema_version, zastępujący trzy niezależne bazy IndexedDB + trzy klucze localStorage bez migracji (lib/project-templates.ts:261)
- Pomiar BS.1770-4 + true peak 4× oversampling w rdzeniu — warunek jakiegokolwiek sensownego eksportu i wspólny dla obu profili materiału
- Własny korpus ewaluacyjny PL: 2 h z etykietami (transkrypt, granice słów zalignowane MFA polish_mfa jako prawda, wypełniacze klasy A i B, mówcy) × 3 klasy mikrofonu × 3 warunki akustyczne — warunek wstępny KAŻDEJ decyzji o modelu ASR i o aligenerze
- Korpus treningowy 5–10 h oznaczonych wypełniaczy klasy B po polsku — bez niego klasyfikator kontekstowy nie istnieje, a lista słów jest merytorycznie błędna
- Golden-file testy DSP + CI (obecnie zero testów i niedziałający lint, package.json:9) — warunek, żeby port na Swift/Kotlin był przenoszeniem, nie pisaniem od nowa
- Backend minimum (Durable Object na sesję + R2 z presigned multipart + Workers) — warunek istnienia double-endera; bez niego działa tylko tryb solo/lokalny
- Akceptacja i lokalna archiwizacja wag gated (pyannote/segmentation-3.0) z zapisem SHA-256 i URL w docs/licensing.md + ekran atrybucji CC-BY-4.0 w produkcie (Parakeet, Canary, pyannote community-1, modele MFA)
- Flow zgody uczestnika na nagranie i transkrypcję w double-enderze (timestamp + device_id do D1) — wymóg prawny przy nagrywaniu osób trzecich

### Ryzyka

- Ani Whisper, ani Parakeet nie zwracają wypełniaczy — Whisper trenowany na czystych napisach, Parakeet na pseudo-etykietach Granary z filtrowaniem i restauracją interpunkcji. Cała wartość funkcji 'usuń yyy' opiera się więc na WŁASNYM detektorze akustycznym z luk w alignmencie. Jeśli ten detektor nie dowiezie precyzji ≥97%, funkcja pada niezależnie od tego, jak dobry jest ASR
- Wypełniacze leksykalne po polsku są dwuznaczne w stopniu, w jakim angielskie um/uh nie są ('nie' jako negacja vs tag question, 'no' jako spójnik dyskursywny vs wypełniacz, 'jakby' jako porównanie vs wypełniacz). Fałszywe usunięcie ZMIENIA SENS wypowiedzi. Jeśli klasyfikator nie osiągnie precyzji ≥95%, funkcja musi zostać ograniczona do samego podświetlania bez akcji masowej
- Dryf zegarów w double-enderze: 48000 Hz ±100 ppm daje do 1,08 s narastającego rozjazdu na 3 h. Jeśli korekta dryfu przez regresję + resampling nie zadziała na jakiejś klasie urządzeń (np. telefony z agresywnym power managementem zmieniającym faktyczny rate w trakcie), zdalne nagrywanie długich odcinków jest niesprzedawalne — a to jest główny use case podcastu
- Cloudflare Containers nie mają GPU, a maksymalna instancja to 4 vCPU / 12 GiB. Jeśli faktyczny RTF Parakeeta int8 na współdzielonych vCPU wyjdzie >0,5 zamiast założonych 0,25, koszt inferencji rośnie 2–5× i wymusza równoległość po segmentach albo zewnętrznego dostawcę GPU. Zmienia to model kosztowy, nie architekturę
- Safari usuwa dane skryptowe po 7 dniach bez interakcji, jeśli navigator.storage.persist() nie zostanie przyznany — a przyznanie jest heurystyczne, bez promptu i bez gwarancji. 4,7 GB projektu może zniknąć. Web nie może być głównym miejscem długich nagrań, dopóki to nie jest kontrolowalne
- Brak nagrywania w tle i przy zablokowanym ekranie w przeglądarce jest twardym sufitem bez obejścia. 3-godzinna sesja w zakładce jest realnie zagrożona przez przełączenie aplikacji lub blokadę ekranu na iOS. Dla podcastu to oznacza, że nagrywanie długich odcinków należy do aplikacji natywnych, a web obsługuje import i edycję
- OPFS/quota na urządzeniu z małą ilością wolnego miejsca: 4,666 GB nagrania i24 po prostu się nie zmieści na iPhonie z 5 GB wolnego. Bramka 1,3× jest konieczna, ale odcina część użytkowników; alternatywa (FLAC-24 w locie) kosztuje 8–12% CPU w trakcie nagrania, czyli w najgorszym możliwym momencie
- Diaryzacja fallbackowa nie rozwiąże mowy nakładającej się przy jednym mikrofonie w stopniu wystarczającym do edycji po tekście. To trzeba komunikować wprost jako ograniczenie trybu jednomikrofonowego, nie ukrywać — inaczej użytkownik odkryje to przez błędną edycję
- CC-BY-4.0 na wagach (Parakeet, Canary, pyannote community-1, modele MFA) to zobowiązanie atrybucyjne w produkcie na trzech platformach; pyannote/segmentation-3.0 jest gated (auto) i warunki mogą się zmienić — trzeba lokalnej archiwizacji z SHA-256, inaczej można stracić dostęp do wag używanych w wydanej aplikacji
- LLM na show notes halucynuje. Obowiązkowe zakotwiczenie każdego bulleta w cytacie z transkryptu ogranicza to, ale nie eliminuje przy streszczeniach abstrakcyjnych — bullet może być poprawnie zakotwiczony i jednocześnie źle zinterpretowany
- Model kosztowy: 0,75–1,15 USD na odcinek 3 h × 3 ścieżki przy cenie odniesienia Descripta 0,80 USD za godzinę mediów oznacza, że darmowy plan bez twardego limitu godzin skonsumuje przychód. To ryzyko biznesowe, ale wynikające bezpośrednio z architektury inferencji
- Kontekstowy biasing przez shallow fusion ingeruje w dekoder transducera — źle dobrane λ (za wysokie) powoduje wstawianie terminów z listy tam, gdzie ich nie ma. Wymaga kalibracji na własnym korpusie, inaczej pogarsza WER zamiast poprawiać

### Do rozstrzygnięcia pomiarem

- Realny WER Parakeet TDT v3 vs Whisper large-v3 vs Canary-1b-v2 na POLSKIM PODCAŚCIE (mowa spontaniczna, przerywanie się, nazwy własne, anglicyzmy IT) — liczby 7,31% Fleurs / 7,28% MLS pochodzą ze zbiorów czytanej mowy i nie przenoszą się. Rozstrzygalne tylko własnym korpusem 2 h z etykietami
- Czy SpeechTranscriber.supportedLocales na iOS 26.x zawiera pl-PL, i czy asset polski jest dostępny do pobrania przez AssetInventory. Sprawdzalne wyłącznie na urządzeniu z aktualnym iOS — od tego zależy, czy on-device ASR na iPhonie jest bezpłatny i bez pobrania 670 MB
- Faktyczny RTF Parakeeta ONNX int8 i aligneru XLSR-PL int8 na Cloudflare Containers standard-4 (współdzielone vCPU). Przyjąłem 0,25 i 0,15 — rozrzut 0,15–0,6 zmienia koszt odcinka z 0,58 na 2,2 USD i decyduje o konieczności równoległości po segmentach
- Precyzja i recall klasyfikatora wypełniaczy klasy B na polskim przy realnym rozkładzie (a nie na zbalansowanym zbiorze). Wymaga 5–10 h oznaczonego materiału; do tego momentu nie da się stwierdzić, czy funkcja może mieć akcję masową, czy tylko podświetlanie
- Dokładność granic słów grafemowego aligneru XLSR-PL vs MFA polish_mfa na polskim. Spodziewane 15–25 ms mediany, ale polskie zbitki spółgłoskowe (wszczęcie, źdźbło) i palatalizacja mogą to znacząco pogorszyć — a próg 20 ms decyduje o tym, czy potrzebny jest czwarty stopień alignmentu
- Czy interpunkcja i wielkie litery Parakeeta v3 dla polskiego są wystarczające do wyznaczania granic zdań (potrzebne dla ochrony pauzy retorycznej i dla auto-rozdziałów), czy konieczny jest osobny model punctuation/truecasing PL
- Realny rozrzut dryfu zegarów typowych urządzeń (telefony vs laptopy, USB vs Bluetooth vs wbudowany) — czy ±100 ppm to worst case, czy występują urządzenia zmieniające faktyczny rate w trakcie sesji (co unieważniałoby model regresji liniowej i wymagało korekty odcinkowej)
- O ile kwantyzacja int8 degraduje WER Parakeeta dla polskiego względem fp32. Dla angielskiego typowo <0,3 pp, ale dla języka fleksyjnego z bogatą morfologią końcówek degradacja może być nieproporcjonalna
- Czy 670 MB pobrania modelu on-device na Androidzie jest akceptowalne produktowo — metryka: odsetek użytkowników kończących pobranie i odsetek wybierających tryb offline zamiast chmurowego
- Realna przepustowość zapisu OPFS przez FileSystemSyncAccessHandle przy 3 równoczesnych ścieżkach i24 (432 kB/s łącznie) na iOS Safari podczas równoległego uploadu — czy nie występuje dławienie powodujące gubienie bloków
- Czy GCC-PHAT na referencyjnym miksie zdalnym 16 kHz daje deklarowaną dokładność ±1 próbki, gdy miks przeszedł przez Opus 32 kb/s z AEC i pakietową utratą — kodek i AEC wprowadzają nieliniowości, które mogą rozmyć pik korelacji
- Progi formantowe do klasyfikacji typu wokalizowanej pauzy (F1/F2 dla polskiego [ɨ] i [ɛ]) — wartości podane orientacyjnie z fonetyki ogólnej, wymagają kalibracji na własnym korpusie z podziałem na płeć i typ głosu

### Adwersarz techniczny

**Nie zadziała tak, jak opisano:**

- **§10: 'Nie włączać wasm-threads/SharedArrayBuffer → brak COOP/COEP' + §1.1/§7.3: 'AudioWorklet → ring buffer → plik i24' i 'ring buffer 4 × 65 536 klatek'**

  Bez SharedArrayBuffer ring buffer między AudioWorkletem a Workerem trzymającym FileSystemSyncAccessHandle NIE ISTNIEJE. Jedyny kanał z AudioWorkletProcessor to jego `port`, a drugi koniec (`AudioWorkletNode.port`) żyje na MAIN THREADZIE. Czyli każdy blok audio 3 ścieżek przechodzi przez wątek Reacta zanim trafi na dysk. Przy rysowaniu waveformu 3 h, re-renderze albo GC main thread stoi, kolejka MessagePortu rośnie, RAM rośnie liniowo. To nie jest ring buffer, to kolejka komunikatów bez backpressure. Przy 432 kB/s przez 3 h to 4,7 GB, które musi przepłynąć przez wątek UI.

  → Albo (a) włączyć COOP/COEP + SAB i rozwiązać problem embedów inaczej (Safari nie ma `COEP: credentialless` — potwierdzone, BCD version_added:false — więc embedy trzeba przenieść na własny proxy albo iframe na osobnym originie), albo (b) utworzyć `new MessageChannel()`, przesłać `port2` DO procesora przez `node.port.postMessage(msg,[port2])`, a `port1` do Workera dyskowego. Wtedy kanał worklet→worker omija main thread i działa bez COOP/COEP. Wariant (b) musi być zapisany w spec jawnie, bo naiwna implementacja go nie zrobi.

- **§10: 'bindings-wasm/ wasm-bindgen' + 'AudioWorklet ← rdzeń WASM bez feature onnx'**

  Wygenerowany przez wasm-bindgen glue NIE URUCHOMI SIĘ w AudioWorklecie. `AudioWorkletGlobalScope` nie ma `TextEncoder` ani `TextDecoder` (używanych przez glue do każdego stringa), nie ma `fetch` ani `importScripts` (więc `init()` z URL-em .wasm nie zadziała). Issue rustwasm/wasm-bindgen#2367 jest OTWARTE od 2020 z cytatem: 'the major blocker is that TextEncoder and TextDecoder are not available within AudioWorklets'.

  → Osobny build rdzenia dla worklera: `wasm-bindgen --target no-modules`, wstrzyknięty polyfill TextEncoder/TextDecoder (FastestSmallestTextEncoderDecoder, MIT) na początku pliku procesora, `WebAssembly.Module` skompilowany na main threadzie i przekazany przez `node.port.postMessage(module)` + `WebAssembly.instantiate(module, imports)` w konstruktorze procesora. Alternatywnie: build worklerowy bez wasm-bindgen w ogóle — czysty `extern "C"` bez stringów, bo tor RT nie potrzebuje stringów.

- **§3.1 i §8: 'Parakeet w onnxruntime-web tylko jako opt-in na desktopie, model cache'owany w OPFS' przy jednoczesnym 'nie włączać SharedArrayBuffer'**

  Wielowątkowość onnxruntime-web wymaga cross-origin isolation. Dokumentacja ORT: 'only when the browser supports WebAssembly multi-threading and crossOriginIsolated mode is enabled, multi-threading will be enabled'. Bez COOP/COEP `env.wasm.numThreads` degraduje do 1. Enkoder FastConformer 600M int8 na JEDNYM wątku WASM to RTF rzędu jednostek (nie ułamków) — 3 h materiału to godziny liczenia. Ta ścieżka jest martwa z definicji, a spec ją wymienia jako realną opcję.

  → Skreślić onnxruntime-web CPU z opcji. Jeśli ma być cokolwiek on-device w przeglądarce, to tylko backend WebGPU ORT (nie wymaga SAB) — ale spec sam odrzucił WebGPU na iOS. Werdykt merytoryczny: w przeglądarce ASR jest wyłącznie serwerowy, a on-device należy do shelli natywnych. Zapisać to jako decyzję, nie jako 'opt-in'.

- **§7: 'SQLite Wasm na OPFS dla metadanych i command logu' przy braku COOP/COEP**

  Kanoniczny VFS `opfs` w sqlite-wasm WYMAGA SharedArrayBuffer i COOP/COEP (dokumentacja SQLite: 'JavaScript's SharedArrayBuffer type is required for the OPFS VFS, and that class is only available if the web server includes the so-called COOP and COEP response headers'). Zostaje `opfs-sahpool`, który ma dwa ograniczenia zabójcze dla tej architektury: 'does not support multiple simultaneous connections' oraz 'pre-allocates all potential file handles, immediately locking those files'. Czyli: jedna instancja bazy na cały origin (Worker audio i Worker ASR nie mogą obie mieć połączenia), brak drugiej zakładki, i pula plików zablokowana wyłącznie przez SAHPool — koegzystująca z Twoimi własnymi SyncAccessHandle na plikach i24.

  → Jeden dedykowany 'db-worker' jako JEDYNY właściciel połączenia SQLite; wszystkie inne Workery i main thread rozmawiają z nim przez MessagePort (RPC). Zapisać w spec, że command log NIE jest zapisywany bezpośrednio z Workera audio. Dodatkowo obsłużyć 'pause/unpause' VFS (sqlite 3.50+) na wypadek drugiej zakładki, albo jawnie zablokować drugą zakładkę tego samego projektu przez Web Locks API.

- **§5.2: 'presigned R2 multipart, części 5 MB (≈34 s audio i24)' oraz '1 555 200 000 B / 5 MB ≈ 312 części'**

  R2 odrzuci te części. Minimum to 5 MiB = 5 242 880 B, nie 5 MB = 5 000 000 B — dostaniesz EntityTooSmall na każdej części poza ostatnią. Do tego dwa warunki, których spec nie uwzględnia: 'All parts except the last must be the same size' (czyli po wznowieniu przerwanego uploadu NIE WOLNO zmienić rozmiaru części) oraz 'Incomplete multipart uploads are automatically aborted after 7 days by default' (przerwany upload gościa znika, a spec zakłada 'lokalny plik jest zawsze prawdą i można go dosłać po fakcie' — po 8 dniach nie można, trzeba zacząć od nowa). Poprawna liczba części: 1 555 200 000 / 5 242 880 = 297 na ścieżkę, 891 na odcinek.

  → Rozmiar części 8 MiB = 8 388 608 B (54,5 s audio i24, 186 części/3 h, zapas do limitu 10 000). Rozmiar części zapisać w metadanych sesji w D1 i NIGDY nie zmieniać przy wznowieniu. Lifecycle policy na buckecie 'tracks' wydłużyć abort do 30 dni. Ostatnia część jako jedyna może być mniejsza — zaokrąglić nagranie w górę i dopchać ciszą, żeby nie było części o rozmiarze innym niż nominalny w środku.

- **§7.4: 'twarda bramka navigator.storage.estimate() wymagająca 1,3 × przewidywanego rozmiaru wolnego miejsca'**

  Ta bramka na Safari nie mierzy tego, co spec zakłada — przepuści nagranie na pełnym telefonie. Po pierwsze: `StorageManager.estimate()` jest w Safari/iOS dopiero od wersji 17 (MDN BCD), a SyncAccessHandle od 15.2 — na iOS 16.x bramki fizycznie nie ma. Po drugie i ważniejsze: WebKit liczy kwotę od CAŁKOWITEGO rozmiaru dysku, nie od wolnego: 'each origin can store up to around 60% of total disk'. Na iPhonie 256 GB z 2 GB wolnego `estimate().quota` zwróci ~150 GB, bramka '1,3 × 4,666 GB = 6,07 GB' przejdzie, a zapis padnie QuotaExceededError w 40. minucie trzygodzinnego nagrania — czyli w najgorszym możliwym momencie. Ryzyko #7 ze spec jest niedoszacowane: to nie jest 'odcina część użytkowników', to jest 'przepuszcza i gubi materiał'.

  → Bramka musi być testem zapisu, nie zapytaniem o kwotę: przed startem nagrania utworzyć docelowe pliki i wywołać `handle.truncate(przewidywany_rozmiar)` dla każdej ścieżki (preallocation). Jeśli truncate rzuci QuotaExceededError — miejsca nie ma, koniec. Preallocation daje dodatkowo mniejszą fragmentację i stały offset seek. Do tego licznik zapisanych bajtów z twardym progiem ostrzegawczym co 10% i automatyczne przełączenie na FLAC-24 w locie po przekroczeniu 80% zadeklarowanej alokacji.

- **§7.4: 'OPFS z FileSystemSyncAccessHandle ... Safari i iOS 15.2+'**

  Na Safari 15.2–16.3 metody `getSize()`, `flush()`, `truncate()` i `close()` ZWRACAJĄ PROMISE, nie działają synchronicznie (MDN BCD notuje wersję synchroniczną dopiero od 16.4). Cały argument spec — 'tylko SyncAccessHandle daje synchroniczny random-access' — na tych wersjach nie zachodzi, a kod napisany pod API synchroniczne rzuci tam błędy typu 'undefined is not a number' przy `getSize()`. Realna podłoga to Safari/iOS 16.4, nie 15.2.

  → Zadeklarować minimum Safari/iOS 16.4 i sprawdzać w runtime: `typeof handle.getSize() === 'number'`. Poniżej — tryb tylko-do-odczytu / import, bez nagrywania długich sesji. Poprawić tabelę w §7.4.

- **§5.2 mechanizm (2): 'GCC-PHAT lokalnej ścieżki A vs referencyjny miks u B, okno 60 s, FFT 2^20 → ±1 próbka (±21 µs)' i mechanizm (3): 'regresja liniowa offset(t)'**

  Referencyjny miks zdalny to WYJŚCIE NetEq (jitter buffer WebRTC), który robi time-scale modification: accelerate, preemptive expand, PLC. NetEq NIELINIOWO wstawia i usuwa próbki w zależności od jittera sieci — to nie jest ta sama oś czasu, tylko oś czasu warpowana skokowo. Do tego Opus 32 kb/s nie jest liniowo-fazowy, a AEC jest adaptacyjny i nieliniowy. Konsekwencje: (a) 'offset(t) = a + b·t' jest fałszywym modelem — mierzysz sumę dryfu zegara i skoków NetEq, a resampling korygujący wyprostuje artefakty jitter buffera zamiast dryfu; (b) '±21 µs' to fizycznie 1 próbka przy 48 kHz, a sygnał referencyjny ma 16 kHz — jedna próbka referencji to 62,5 µs = 3 próbki @48 kHz przed interpolacją; (c) przy stracie pakietów PLC generuje syntetyczne próbki, które w GCC-PHAT są szumem dekorelującym. Twoje własne openQuestion #11 zadaje to pytanie — odpowiedź brzmi: nie, nie da deklarowanej dokładności, i model liniowy jest strukturalnie zły.

  → Nie mierz dryfu przez sieć. Mierz zegar urządzenia LOKALNIE, u każdego uczestnika, przeciw monotonicznemu zegarowi systemowemu: iOS — `AVAudioTime.hostTime` + `mach_timebase_info` przy każdym buforze wejściowym; Android — `AudioStream::getTimestamp()` (framePosition + nanoseconds, Oboe); web — `currentFrame`/`currentTime` w worklecie vs `performance.now()`. Regresja liniowa liczby zarejestrowanych klatek względem zegara monotonicznego daje realny rate urządzenia w ppm z dokładnością <0,5 ppm po 10 minutach, jest ciągła i całkowicie odporna na Opus, AEC, NetEq i utratę pakietów. Sieć (Cristian) służy TYLKO do zsynchronizowania zegarów monotonicznych, i to zgrubnie, bo dryf bierzesz z nachylenia, nie z offsetu. GCC-PHAT zostaw wyłącznie do JEDNORAZOWEGO wyznaczenia offsetu startowego, na oknie 5–10 s, z jawnym progiem jakości piku (peak-to-sidelobe ratio > 3) i fallbackiem na chirp, gdy pik jest rozmyty.

- **§5.2: 'Lokalny zapis (AudioWorklet → i24 48 kHz mono) — to jest materiał' jako mechanizm double-endera dostępny na webie**

  W przeglądarce nie masz dostępu do zegara mikrofonu. `MediaStreamAudioSourceNode` oddaje próbki JUŻ przeresamplowane do `AudioContext.sampleRate`, a przeglądarka sama kompensuje dryf urządzenia względem kontekstu (wstawiając/gubiąc próbki lub resamplując asynchronicznie). Spec Web Audio mówi o resamplingu wyjścia; dla wejścia z MediaStream nie definiuje nic, a implementacje robią właśnie ukrytą kompensację. Czyli 'lokalny zapis i24 48 kHz' na webie NIE jest zapisem zegara mikrofonu, tylko zapisem zegara AudioContextu z już nałożoną, niewidoczną korektą — i te wstawione/pominięte próbki są nieodwracalne. Mierzenie dryfu ±100 ppm na materiale, który przeglądarka już zdryfowała za Ciebie, nie ma sensu.

  → To jest twardy argument, że DOUBLE-ENDER JEST FUNKCJĄ NATYWNĄ, nie webową — i to zapisać wprost, obok istniejącego argumentu o nagrywaniu w tle. Na iOS `AVAudioEngine` z `installTap` na input node daje surowe bufory i hostTime; na Androidzie Oboe/AAudio daje framePosition. Web pozostaje trybem 'solo, krótka sesja, import i edycja'. Jeśli web ma być trybem gościa w double-enderze, to z jawnym komunikatem o ograniczonej precyzji synchronizacji i obowiązkową weryfikacją chirpem.

- **§6.3: 'Źródło kandydatów: luki w alignmencie ... Akcja: usuwalne automatycznie' przy celu 'precyzja ≥97%'**

  Luka w alignmencie powstaje w TRZECH sytuacjach, nie w jednej: (1) wypełniacz, (2) DELECJA ASR — Parakeet nie zwrócił realnie wypowiedzianego słowa, (3) błąd alignera. Przy WER 7% na czytanej mowie i realnie 15–25% na spontanicznym polskim podcaście delecje to kilka procent słów. Automat będzie regularnie kasował realnie wypowiedziane słowa — i to BEZ ŚLADU dla użytkownika, bo tego słowa nigdy nie było w transkrypcie, więc w widoku tekstowym nic nie zniknie. Użytkownik dowie się dopiero z odsłuchu. To jest gorsze niż problem, który funkcja rozwiązuje: 'yyy' jest irytujące, ucięte słowo jest błędem merytorycznym. Dodatkowo: kryterium 'F0 wykryty, clarity >0,6' spełnia każda samogłoska, czyli każde niezaalignowane słowo z sylabą otwartą.

  → Warunek konieczny przed automatycznym usunięciem: DRUGI PRZEBIEG ASR na wyizolowanym fragmencie luki z paddingiem 200 ms z każdej strony. Jeśli zwróci jakikolwiek token leksykalny — to jest delecja, nie wypełniacz; oznacz jako 'możliwe brakujące słowo' i NIE usuwaj. Dopiero pusty lub nieleksykalny wynik + kryteria akustyczne z §6.3 kwalifikuje do klasy A. Drugi warunek: monotoniczność formantów — wypełniacz ma stały F1/F2 (zmiana <10% przez ≥100 ms), a każde słowo ma tranzycje formantowe; to jest silniejszy dyskryminator niż stabilność centroidu. I nawet z tym: przy 27 000 słów precyzja 97% to ~kilkanaście błędnych cięć na odcinek, więc domyślnie klasa A też powinna być 'zaznaczone + jeden przycisk zastosuj', a nie cicha automatyka.

- **§10 + zależność #12: 'Golden-file testy DSP + CI — warunek, żeby port na Swift/Kotlin był przenoszeniem, nie pisaniem od nowa'**

  Golden-file testy bit-exact NIE PRZEJDĄ między wasm32, aarch64-apple-ios i aarch64-linux-android. Arytmetyka IEEE-754 (+,−,×,÷,sqrt) jest deterministyczna, ale funkcje transcendentalne NIE SĄ: `sin`, `cos`, `tan`, `exp`, `log`, `pow`, `atan2` w Ruście wołają platformowy libm na targetach natywnych (Apple libm ≠ bionic ≠ musl) i wkompilowany libm na wasm32-unknown-unknown. Dotyczy to bezpośrednio: współczynników biquadów RBJ (tan, cos, sinh) w HPF/EQ/de-esserze, jądra sinc w rubato (sin), pYIN (log, exp), K-weightingu BS.1770-4, obliczeń FDN reverb. Dodatkowo: WASM nie ma instrukcji FMA, ARM64 ma — jeśli ktokolwiek napisze SIMD ręcznie albo włączy `relaxed-simd` (którego `f32x4.relaxed_madd` jest W SPECYFIKACJI niedeterministyczny: może być fused albo nie), różnice rosną z każdą próbką rekursji IIR.

  → Trzy twarde reguły w `core-dsp`, egzekwowane clippy lintem: (1) ZAKAZ `std`/`core` float math — wyłącznie crate `libm` (pure Rust, ten sam kod źródłowy na wszystkich targetach, MIT); (2) ZAKAZ target-feature `relaxed-simd`, zakaz jakichkolwiek flag fast-math w LLVM; (3) golden-file porównywane z TOLERANCJĄ, nie bit-exact — kryterium: RMS różnicy < −120 dBFS i max |różnica| < 1e-5 dla bloków 10 s. Osobno: współczynniki filtrów liczyć RAZ przy zmianie parametru i cache'ować, żeby ewentualna różnica w tan() nie propagowała się per-próbkę.

- **§10: 'bindings-ffi/ uniffi → Swift + Kotlin' jako jedyna granica FFI, przy metryce '60 fps, zero dropoutów audio'**

  UniFFI jest realtime-unsafe i nie wolno go wołać z callbacku audio. Generowane scaffoldingi alokują `RustBuffer` (malloc) na każde wywołanie zwracające cokolwiek złożonego, obiekty są za `Arc<Mutex<…>>`, a `catch_unwind` jest w każdej funkcji. Wołanie tego z render callbacku AudioUnit/AVAudioSourceNode albo z `AudioStreamCallback::onAudioReady` w Oboe łamie zasadę no-malloc/no-lock w wątku o priorytecie czasu rzeczywistego → priority inversion, dropouty, w skrajnym przypadku watchdog kill na iOS.

  → DWIE granice FFI, zapisane w §10 jako osobne crate'y: (a) `bindings-ffi-control` — UniFFI, dla EDL, komend, analizy, storage, wszystkiego co nie jest w wątku audio; (b) `bindings-ffi-rt` — ręczny `extern "C"`, kontekst preallokowany raz (`rt_create(cfg) -> *mut RtCtx`), pętla `rt_process(ctx, in_ptr, out_ptr, n_frames)` bez jednej alokacji, `panic = "abort"` dla profilu release, żaden `Mutex` (parametry przekazywane lock-free przez `AtomicU64` / triple buffer). Do tego `#[inline(never)]` na granicy i `assert_no_alloc` w testach debug.

- **§3.2 punkt 2: 'Brak okna 30 s ... Parakeet obsługuje długie wejście (do 24 min z pełną atencją, do 3 h z lokalną)' jako powód wyboru Parakeeta, przy wdrożeniu na Cloudflare Containers standard-4**

  Karta modelu mówi dosłownie: 'audio up to 24 minutes long with full attention (on A100 80GB) or up to 3 hours with local attention'. standard-4 to 4 vCPU / 12 GiB / BEZ GPU (potwierdzone w docs Cloudflare). 24 min przy subsamplingu 8× z 10 ms to 18 000 ramek — macierz atencji 18000² × 4 B to 1,3 GB na głowę na warstwę. Na 12 GiB to niewykonalne. Zostaje local attention, dla którego opublikowane WER 7,31%/7,28% NIE BYŁY MIERZONE (Fleurs i MLS to krótkie, czytane wypowiedzi kilkunastosekundowe, więc mierzono full attention). Do tego §8.2 i tak tnie materiał na segmenty 5-minutowe dla równoległości. Czyli deklarowana przewaga #2 w wybranym wdrożeniu nie występuje — i to jest w porządku, ale nie wolno na niej opierać werdyktu wyboru silnika.

  → Przeformułować uzasadnienie wyboru Parakeeta na dwa realne powody: (1) brak halucynacji na ciszy (transducer), (2) natywne timestampy z predykcji duration. Skreślić 'brak okna 30 s' jako argument. Zapisać jawnie: segmentacja własna na granicach VAD, okna 120–300 s z zakładką 5 s i zszywaniem po najdłuższym wspólnym prefiksie/sufiksie tokenów, local attention jako tryb produkcyjny. Dopisać do korpusu ewaluacyjnego pomiar WER W TRYBIE LOCAL ATTENTION przy realnym rozmiarze okna — bo to jest tryb, który pojedzie na produkcji.

- **§3.1/§8.1: 'Whisper large-v3-turbo ... Workers AI 0,03 USD/h ... podłoga kosztowa, fallback' oraz tabela kosztów 'Razem (ścieżka whisper-turbo) ≈0,47 USD / odcinek'**

  Schemat odpowiedzi `@cf/openai/whisper-large-v3-turbo` na Workers AI to `text` (string), `word_count` (number), `vtt` (string) — CZYLI SEGMENTY W WEBVTT, BEZ word-level timestamps. Jako 'fallback' dla toru, którego cała wartość to granice słów, to nie jest fallback — to inna funkcjonalność. Może służyć wyłącznie jako źródło TEKSTU dla alignera CTC, ale wtedy 'podłoga kosztowa 0,27 USD' jest fikcyjna, bo droga część (aligner XLSR-large 315M na CPU, RTF 0,15–0,5) zostaje w kosztach. Druga rzecz: żądanie do Workers AI idzie przez Workera, a Worker ma limit body 100 MB na Free I NA PRO (potwierdzone; 200 MB dopiero Business). 9 h FLAC 16 kHz mono to ~150–250 MB, więc i tak trzeba ciąć na kawałki i płacić za wywołania.

  → Wykreślić 'whisper-turbo jako tania ścieżka' z tabeli kosztów jako pozycję samodzielną. Zostawić go jako awaryjne ŹRÓDŁO TEKSTU, gdy kontener Parakeeta nie wstaje, z kosztem = 0,27 USD + pełny koszt alignera. Prawdziwa podłoga kosztowa odcinka to koszt alignera, nie ASR.

- **§8.2: 'Workflow "episode-pipeline" (durable, retry)' zwracający WordTrack/SpeakerTrack**

  Cloudflare Workflows ma limit 'Max step result size: 1 MiB'. WordTrack dla 3 h to ~27 000 słów; jako JSON z `start`, `end`, `text`, `score` to 2–5 MB, binarnie z tabelą stringów ~600 kB–1 MB — czyli na granicy albo ponad. Krok, który zwróci WordTrack jako wynik, wywali cały workflow. Drugi limit: CPU time per step 30 s domyślnie (konfigurowalne do 5 min) na Workers Paid — jakiekolwiek przetwarzanie WordTracku w Workerze (scalanie segmentów, deduplikacja zakładek) musi się w tym zmieścić albo iść do kontenera. Trzeci: retention stanu 30 dni.

  → Reguła w spec: KAŻDY krok Workflow zwraca wyłącznie klucz R2 i metadane skalarne (≤1 kB). Żaden artefakt nie przechodzi przez stan Workflow. Scalanie segmentów WordTrack robi kontener, nie Worker. Zapisać limit 1 MiB wprost, bo diagram w §8.2 sugeruje przepływ danych przez Workflow.

- **§16/§11: 'true peak z 4× oversamplingiem' + metryka akceptacji 'true peak ≤ −1,0 dBTP ZAWSZE'**

  Te dwa zdania są ze sobą sprzeczne. BS.1770-4 podaje 4× jako MINIMUM dla materiału 48 kHz, a znane niedoszacowanie estymatora 4× dla sygnałów o energii w górnym paśmie sięga ~0,5 dB (dla treści blisko Nyquista więcej). Czyli plik zmierzony przez Ciebie na −1,0 dBTP realnie może mieć −0,5 dBTP, a mierzony niezależnym narzędziem z 16× oversamplingiem obleje test. Metryka mówi 'ZAWSZE', a metoda tego nie gwarantuje.

  → Albo oversampling 8× minimum (16× dla eksportu, koszt pomijalny bo to jeden przebieg offline), albo limiter celuje w −1,5 dBTP przy pomiarze 4×. Wybrać jedno i zapisać. Rekomendacja: 16× w pomiarze eksportowym, 4× w mierniku RT (tam liczy się latencja, nie ostatnie 0,5 dB).

- **§16: 'normalizacja PER MÓWCA do −20 LUFS short-term PRZED masterem'**

  To jest niedefiniowalne. Short-term LUFS to wartość ZMIENNA W CZASIE (okno przesuwne 3 s wg EBU Tech 3341). 'Znormalizować do −20 LUFS short-term' nie ma jednego wyniku — to może znaczyć jedno przesunięcie gain na ścieżkę (wtedy właściwą miarą jest integrated albo mediana short-term), albo automatyzację gain w czasie (leveler). To dwie zupełnie różne implementacje o różnym brzmieniu: pierwsza zachowuje dynamikę mówcy, druga ją spłaszcza. Napisane tak, jak jest, zostanie zaimplementowane losowo.

  → Wybrać i zapisać: gain statyczny per ścieżka do integrated −20 LUFS liczonego TYLKO na segmentach VAD=mowa tej ścieżki (bo cisza i crosstalk zaniżają integrated), plus opcjonalny leveler jako osobny blok DSP z jawnymi parametrami (cel −20 LUFS-S, zakres ±6 dB, slew 1 dB/s, okno 3 s). Dwa parametry w `MaterialProfile`, nie jeden.

- **§2: 'Widok tekstowy nie ma własnych operacji. Usunięcie zdania w tekście = RemoveRange{start: word[i].start_refined, ...}' przy `Annotation.start: u64 // klatka w źródle`**

  Brakuje najważniejszej funkcji w całej integracji i bez niej widok tekstowy się rozjedzie. Adnotacje są indeksowane KLATKĄ W ŹRÓDLE, a EDL operuje na OSI PROJEKTU. Po `RemoveRange{ripple:true}` odwzorowanie source→timeline przestaje być monotoniczne, a po `MoveClip`/duplikacji klipu jedno źródłowe słowo może występować w projekcie ZERO, JEDEN albo N razy. Spec nie definiuje funkcji `source_frame → [timeline_frame]` ani tego, co widok tekstowy pokazuje, gdy to samo źródłowe słowo jest na osi dwa razy (dubel zdania w tekście?), ani co robi `word[i].start_refined`, gdy słowo zostało PRZECIĘTE przez `SplitClip` w środku. To jest dokładnie ten szew, na którym pęka teza 'drugi widok na ten sam EDL'.

  → Odwrócić kierunek: tekst NIE jest renderowany z WordTrack, tylko z PRZEJŚCIA PO KLIPACH OSI CZASU. Dla każdego klipu w kolejności `timeline_start` bierzesz zakres źródła `[source_in, source_in+len)`, robisz zapytanie interwałowe do WordTrack tego źródła i emitujesz tokeny, które mieszczą się CAŁE w klipie (częściowo przycięte oznaczasz jako 'ucięte' i renderujesz na szaro, nieedytowalne). Wtedy: dubel klipu = dubel zdania w tekście (poprawnie), ripple delete = tekst po prostu krótszy, split w środku słowa = widoczny artefakt zamiast cichego rozjazdu. Dodać do §2 jawną strukturę `TimelineTextIndex` przebudowywaną inkrementalnie po każdej komendzie (tylko dotknięte klipy) i zdefiniować `undo` jako przebudowę tego indeksu, nie osobny stan.

- **§1.1, tabela: 'Kompensacja latencji round-trip, monitoring, miernik RMS/clip — 100% wspólna'**

  Na webie nie ma czego kompensować, bo nie ma z czego policzyć. Web Audio daje `AudioContext.baseLatency` i `outputLatency` — obie dotyczą WYJŚCIA. Nie istnieje żadne API zwracające latencję ścieżki WEJŚCIOWEJ (`MediaTrackSettings.latency` jest advisory, nieimplementowane spójnie i nie obejmuje bufora sprzętowego). Czyli 'kompensacja round-trip' jako warstwa '100% wspólna' jest na webie niewykonalna, a na iOS/Androidzie jest trywialna (`AVAudioSession.inputLatency + outputLatency + ioBufferDuration`; Oboe `getTimestamp()` na obu strumieniach). To nie jest warstwa wspólna, to warstwa z dziurą na jednej z trzech platform.

  → Przenieść kompensację latencji do warstwy platformowej z jednym kontraktem `fn io_latency_frames() -> Option<u64>`. Na webie: `None` domyślnie + jednorazowy KALIBRATOR PĘTLI AKUSTYCZNEJ (odtwórz chirp/MLS przez głośniki, nagraj mikrofonem, GCC-PHAT, zapisz wynik per urządzenie w SQLite). Bez tego overdub na webie będzie systematycznie przesunięty o 20–200 ms zależnie od sprzętu — a to jest funkcja, którą tor śpiewu potrzebuje bardziej niż podcast.

- **Zależność #7 / §12 punkt 5: 'Renderer offline w rdzeniu — obecny jest martwym kodem (lib/multi-track-engine.ts:373), czyli nie istnieje żadna ścieżka eksportu projektu multitrack'**

  To jest po prostu nieprawda i sprawdziłem to w repo. `mixToBuffer` (lib/multi-track-engine.ts:373) jest wołane z `exportMix` (lib/multi-track-engine.ts:423), a `exportMix` jest wołane z UI: components/multi-track-manager.tsx:177. Ścieżka eksportu ISTNIEJE i jest podpięta. Ma realne wady (twardo zaszyte `sampleRate = 44100` mimo capture 48 kHz, wymaga wszystkich buforów w RAM przez `loadAudioSource`/`decodeAudioData` — lib/multi-track-engine.ts:491), ale to jest 'zły renderer', nie 'brak renderera'. Fałszywa diagnoza w liście zależności psuje priorytetyzację: pozycja 5 w §12 jest opisana jako 'nie istnieje', czyli blocker, a realnie jest to refaktor.

  → Poprawić diagnozę na: 'renderer offline istnieje i jest podpięty (multi-track-manager.tsx:177 → exportMix → mixToBuffer), ale renderuje na 44 100 Hz niezależnie od materiału i wymaga pełnego dekodu wszystkich źródeł do RAM (decodeAudioData na całych blobach), więc dla 3 h × 3 ścieżki wywali zakładkę na OOM'. To zmienia charakter zadania i jego ryzyko. Pozostałe cytowane usterki sprawdziłem i SĄ prawdziwe: MediaRecorder tylko webm (hooks/use-audio-recording.ts:17-19), martwy start nagrywania przez odczyt `audioRecorder.isRecording` w tym samym ticku po await (contexts/audio-recorder-context.tsx:62), czas w sekundach float (lib/multi-track-storage.ts:24-29), stałe 1000 próbek waveformu (lib/multi-track-storage.ts:715), brak jakiegokolwiek AudioWorkletu w repo.

- **§1.3 MaterialProfile: 'denoise: DenoiseCfg, // speech: DPDFNet 48k, wet 100%, attn limit −18 dB'**

  Nie istnieje projekt o nazwie 'DPDFNet'. Najbliższy realny to DeepFilterNet (Rikorose/DeepFilterNet) — i jest to JEDYNY blok DSP w całej specyfikacji, dla którego nie podano licencji ani wersji, mimo że denoise mowy jest najbardziej widoczną dla użytkownika funkcją całego filaru. Sprawdziłem: kod DeepFilterNet jest dual MIT/Apache-2.0 (LICENSE-MIT, Copyright 2021 Hendrik Schröter), 4,5k gwiazdek — ale OSTATNI PUSH TO 2024-10-17, czyli 21 miesięcy bez commita. GitHub raportuje spdx NOASSERTION dla repo. Wagi modeli są dystrybuowane osobno i wymagają osobnego sprawdzenia (DNS4/DNS5 mają własne warunki).

  → Nazwać projekt poprawnie, przypiąć konkretny tag (DeepFilterNet3), zarchiwizować wagi lokalnie z SHA-256 tak samo jak dla pyannote, i sprawdzić licencję WAG osobno od licencji kodu. Rozważyć, czy denoiser ma być modelem, czy klasycznym spectral gate + Wienerem w rdzeniu — bo projekt bez commitów od 21 miesięcy, z którego bierzesz wagi ONNX na trzy platformy, jest realnym długiem. Alternatywa z żywym utrzymaniem: `sherpa-onnx` ma wbudowane modele speech-enhancement (GTCRN) pod Apache-2.0 z buildami na iOS/Android/WASM — tym samym runtime, którego i tak używasz.

- **§4: 'MFA jako GOLDEN REFERENCE w CI do pomiaru błędu granic' + metryka 'mediana |błąd granicy| vs MFA polish_mfa ≤20 ms'**

  MFA nie jest prawdą, tylko drugim estymatorem o TYM SAMYM RZĘDZIE BŁĘDU. Publikowany błąd granic MFA na mowie spontanicznej to same 20–30 ms, a próg akceptacji ustawiony jest na ≤20 ms mediany — czyli mierzysz zgodność dwóch narzędzi, których błędy są porównywalne, i nie wiesz, które się myli. Gorzej: MFA na dokładnie tych przypadkach, które są trudne (nazwy własne, anglicyzmy IT, code-switching), wymaga G2P i często odmawia alignmentu albo produkuje śmieć — czyli 'prawda' znika tam, gdzie najbardziej jej potrzebujesz. Metryka jest niefalsyfikowalna w interesującym zakresie.

  → Prawdą muszą być RĘCZNE ANOTACJE GRANIC. 20–30 minut polskiego materiału podcastowego oznaczone w Praacie na poziomie słowa przez fonetyka — to jest ~2 dni pracy jednej osoby i rozwiązuje problem raz na zawsze dla całego projektu. MFA zostaje jako trzeci głos do wykrywania regresji na dużej próbce (gdzie liczy się trend, nie wartość bezwzględna). Do korpusu z zależności #10 dopisać 'granice słów anotowane ręcznie', a MFA przenieść z 'prawda' na 'baseline'.

- **§8.2: 'Wymóg: pierwszy tekst na ekranie ≤60 s od zakończenia nagrania' przy Containers z sleepAfter**

  Budżet 60 s nie zamyka się przy zimnym starcie. Cloudflare podaje 'Container cold starts can often be in the 1-3 second range, but this is dependent on image size and code execution time' — to jest dla małych obrazów. Twój obraz zawiera Parakeet int8 (640 MB wg sherpa-onnx: encoder 622M + decoder 12M + joiner 6,1M), wav2vec2-XLSR int8 (~320 MB) i pyannote. Do 1–3 s cold startu dochodzi inicjalizacja sesji ONNX Runtime dla enkodera 622 MB na 4 vCPU — realnie 10–40 s, zanim policzy się pierwsza ramka. Plus Cloudflare zastrzega: 'no guarantee that any instance will run for any set period of time' i restarty hostów są nieregularne, więc job w połowie może zniknąć.

  → (1) Startować kontener SPEKULATYWNIE w momencie rozpoczęcia nagrywania, nie po jego zakończeniu — masz 3 h zapasu, a koszt idle to 12 GiB × 0,0000025 USD/GiB-s ≈ 0,03 USD/h, czyli nic. (2) Ustawić `sleepAfter` dłużej niż typowy odstęp między odcinkami użytkownika. (3) Wysyłać segmenty do ASR NA BIEŻĄCO w trakcie nagrania (masz progresywny upload do R2, więc materiał już tam jest) — wtedy 'pierwszy tekst' istnieje jeszcze przed końcem nagrania i metryka staje się trywialna. (4) Każdy segment musi być idempotentny i wznawialny, bo host może zniknąć.

**Problemy licencyjne:**

- Wagi modeli embeddingów mówcy: spec deklaruje '3D-Speaker/WeSpeaker (Apache-2.0)'. To jest licencja KODU repozytorium (modelscope/3D-Speaker: Apache-2.0, potwierdzone), a NIE licencja wag. Wagi tych modeli trenowane są na VoxCeleb1/2 i CN-Celeb. Metadane VoxCeleb są pod CC BY-SA 4.0 (potwierdzone na stronie VGG: 'The provided VoxCeleb metadata is licensed under a Creative Commons Attribution-ShareAlike 4.0 International License'), a CC BY-SA jest licencją COPYLEFT — jeśli ktoś uzna wagi za utwór zależny, klauzula ShareAlike zaraża. Sam audio to linki do YouTube'a, więc dochodzi warstwa praw osób trzecich. Spec archiwizuje SHA-256 tylko dla pyannote; embeddingi zostawia bez żadnej weryfikacji. https://www.robots.ox.ac.uk/~vgg/data/voxceleb/vox1.html | https://api.github.com/repos/modelscope/3D-Speaker
- flacenc-rs jest Apache-2.0, NIE 'MIT-Apache' jak podaje spec §6/§10. Do tego 40 gwiazdek i jeden maintainer — dla enkodera FLAC w produkcie komercyjnym na trzy platformy to cienki fundament. Push 2026-06-29, więc żywy, ale plan B (własny enkoder, który spec i tak dopuszcza) powinien być decyzją, nie fallbackiem. https://api.github.com/repos/yotarok/flacenc-rs
- DeepFilterNet (spec nazywa go błędnie 'DPDFNet') to JEDYNY blok DSP w całej specyfikacji bez podanej licencji. Kod jest dual MIT/Apache-2.0 (LICENSE-MIT: Copyright (c) 2021 Hendrik Schröter), ale GitHub API zwraca spdx NOASSERTION, a wagi są dystrybuowane osobno i mają własną historię zbiorów treningowych (DNS Challenge). To wymaga osobnego audytu przed wdrożeniem. https://api.github.com/repos/Rikorose/DeepFilterNet
- CC-BY-4.0 na wagach oznacza atrybucję W PRODUKCIE, na trzech platformach, dla: Parakeet TDT 0.6b v3 (potwierdzone: cc-by-4.0, lastModified 2026-06-29), Canary-1b-v2 (potwierdzone: cc-by-4.0, lastModified 2025-12-03), pyannote community-1, modele MFA, HerBERT-base-cased (potwierdzone: cc-by-4.0). Spec to zauważa, ale nie precyzuje formy: CC-BY-4.0 wymaga podania autora, tytułu, linku do licencji ORAZ oznaczenia zmian (kwantyzacja int8 i eksport ONNX to modyfikacja utworu — trzeba to napisać). Ekran 'O programie' z listą nie wystarczy, jeśli nie ma adnotacji o modyfikacji.
- Dataset Granary (na którym trenowany jest Parakeet v3) jest CC-BY-4.0, ale składa się m.in. z YODAS i 'YouTube Clips (YTC)' — czyli materiału z YouTube'a. To nie jest problem licencyjny dla Ciebie (wagi są CC-BY-4.0), ale spec twierdzi, że dane 'nie są zapożyczone ze zbiorów badawczych o ograniczeniach' — to jest za mocne stwierdzenie przy komponencie YouTube'owym. Zapisać jako ryzyko reputacyjne/regulacyjne, nie jako czysty rachunek. https://huggingface.co/api/datasets/nvidia/Granary
- sdadas/polish-roberta-base-v2 jest Apache-2.0 (potwierdzone, lastModified 2026-01-27) — czyli PERMISYWNIEJSZY niż HerBERT (CC-BY-4.0, wymaga atrybucji). Spec wymienia HerBERT jako pierwszy wybór, a polish-roberta jako 'lub'. Przy równej lub lepszej jakości i braku obowiązku atrybucji kolejność powinna być odwrotna.

**Projekty martwe:**

- DeepFilterNet (spec: 'DPDFNet') — ostatni push 2024-10-17, czyli 21 MIESIĘCY bez commita na dzień 2026-07-26. To jest denoiser mowy, czyli najbardziej widoczna dla użytkownika funkcja DSP w całym filarze podcast. 4,5k gwiazdek, nie zarchiwizowany, ale bez utrzymania. https://api.github.com/repos/Rikorose/DeepFilterNet
- jonatasgrosman/wav2vec2-large-xlsr-53-polish — lastModified 2022-12-14, czyli 3,5 ROKU bez zmian. Trenowany na Common Voice PL 6.0 (mowa CZYTANA, studyjna, zdania z Wikipedii). To jest fundament stopnia 2 alignera, na którym opiera się cała edycja po tekście. Nie jest 'martwy' (2,5 mln pobrań, Apache-2.0), ale jest zamrożony w 2022 i architektura XLSR-53 ma od tego czasu następców. https://huggingface.co/api/models/jonatasgrosman/wav2vec2-large-xlsr-53-polish
- pyannote/segmentation-3.0 — lastModified 2024-05-10, ponad 2 lata. MIT, gated (auto, z formularzem 'Company/university' i 'Website' oraz zastrzeżeniem 'we will occasionnally email you about premium models and paid services'). Gating na modelu, który jest w Twojej ścieżce produkcyjnej fallbacku, to ryzyko dostępu — spec słusznie każe archiwizować z SHA-256, ale ta reguła powinna dotyczyć WSZYSTKICH wag, nie tylko tej. https://huggingface.co/api/models/pyannote/segmentation-3.0
- modelscope/3D-Speaker — push 2025-12-08, 7,5 miesiąca bez commita. Apache-2.0 na kodzie. Nie martwy, ale w zwolnionym tempie.
- allegro/herbert-base-cased — lastModified 2022-06-09, 4 LATA. Jeśli klasyfikator wypełniaczy klasy B ma być fine-tune'em, to na modelu zamrożonym cztery lata temu, podczas gdy sdadas/polish-roberta-base-v2 był aktualizowany 2026-01-27.
- ŻYWE (sprawdzone, bez zastrzeżeń): k2-fsa/sherpa-onnx — push 2026-07-24, Apache-2.0, 13 797 gwiazdek, nie zarchiwizowany. HEnquist/rubato — push 2026-07-18, LICENSE.txt = dual MIT OR Apache-2.0 (GitHub raportuje NOASSERTION tylko dlatego, że plik zawiera oba warianty; to nie jest problem). yotarok/flacenc-rs — push 2026-06-29.

**Luki platformowe:**

- AudioWorkletGlobalScope nie ma TextEncoder/TextDecoder/fetch/importScripts → wygenerowany glue wasm-bindgen rzuca ReferenceError przy pierwszym stringu. Issue rustwasm/wasm-bindgen#2367 otwarte. Dotyczy WSZYSTKICH trzech przeglądarek, nie tylko Safari.
- onnxruntime-web wielowątkowy wymaga crossOriginIsolated (COOP/COEP) — dokumentacja ORT wprost. Decyzja spec o braku COOP/COEP zabija ścieżkę 'Parakeet w onnxruntime-web opt-in na desktopie'.
- sqlite-wasm: kanoniczny VFS 'opfs' wymaga SharedArrayBuffer + COOP/COEP. Bez tego zostaje 'opfs-sahpool', który 'does not support multiple simultaneous connections' i prealokuje/blokuje pulę plików. Jedno połączenie na origin, brak drugiej zakładki.
- Cross-Origin-Embedder-Policy: credentialless — Safari i Safari iOS: version_added FALSE (MDN BCD). Czyli argument spec jest poprawny, ale konsekwencja jest twardsza niż spec przyznaje: na Safari wybór to 'COEP require-corp i naprawa wszystkich embedów' albo 'brak SAB i brak wielowątkowego WASM'.
- navigator.storage.estimate() — Safari i Safari iOS dopiero od wersji 17 (MDN BCD). FileSystemSyncAccessHandle od 15.2. Czyli na iOS 15.2–16.7 masz OPFS bez możliwości sprawdzenia kwoty.
- FileSystemSyncAccessHandle na Safari 15.2–16.3: getSize(), flush(), truncate(), close() ZWRACAJĄ PROMISE. Wersje synchroniczne dopiero od Safari 16.4. Deklaracja 'Safari i iOS 15.2+' w §7.4 jest myląca — realna podłoga to 16.4.
- WebKit liczy kwotę storage od CAŁKOWITEGO rozmiaru dysku ('each origin can store up to around 60% of total disk', 'overall quota ... 80% of disk size'), nie od wolnego miejsca. Bramka miejsca oparta na estimate() przepuści nagranie na pełnym urządzeniu.
- Safari 7-dniowa eksmisja: WebKit dokumentuje ją jako część ITP ('If an origin has no user interaction ... in the last seven days of browser use, its data created from script will be deleted'). ANI MDN, ANI blog WebKit NIE POTWIERDZAJĄ, że navigator.storage.persist() z tego zwalnia — mówią tylko 'might be excluded from eviction if it has active page at the time of eviction, or its storage is in persistent mode', a persistent mode WebKit przyznaje heurystycznie, 'based on heuristics like whether the website is opened as a Home Screen Web App'. Czyli JEDYNY udokumentowany niezawodny sposób to instalacja jako Home Screen Web App — a to trzeba zaproponować użytkownikowi w UI, nie liczyć na persist().
- WebCodecs AudioEncoder: Safari/Safari iOS od 26, Chrome 94, Firefox 130 — ale Firefox Android: version_added FALSE. Czyli fallback WASM jest obowiązkowy nie tylko dla starszego Safari.
- Web Audio nie ma żadnego API latencji WEJŚCIA. baseLatency i outputLatency dotyczą wyjścia. 'Kompensacja latencji round-trip 100% wspólna' (§1.1) jest na webie niewykonalna bez kalibratora pętli akustycznej.
- MediaStreamAudioSourceNode oddaje próbki już przeresamplowane do AudioContext.sampleRate — przeglądarka ukrywa i kompensuje dryf zegara mikrofonu. Na webie nie da się zmierzyć realnego rate'u urządzenia, więc double-ender z korektą dryfu jest funkcją NATYWNĄ.
- Cloudflare Containers: brak GPU (potwierdzone — nigdzie w docs nie ma o tym mowy), max standard-4 = 4 vCPU / 12 GiB / 20 GB, custom max 4 vCPU / 12 GiB / 20 GB, min ratio 3 GiB pamięci na vCPU. Max rozmiar obrazu = dysk instancji (20 GB), łącznie 50 GB rejestru na konto. Cold start '1-3 s' tylko dla małych obrazów. 'No guarantee that any instance will run for any set period of time'.
- Cloudflare Workers: body 100 MB na Free I NA PRO (200 MB dopiero Business, 500 MB Enterprise), 128 MB RAM na isolate — spec ma to poprawnie.
- Cloudflare Workflows: max step result 1 MiB, CPU per step 30 s (do 5 min konfigurowalnie), retention stanu 30 dni, max persisted state 1 GB.
- Workers AI @cf/openai/whisper-large-v3-turbo zwraca text / word_count / vtt — BEZ word-level timestamps.
- iOS Safari: brak nagrywania w tle i przy zablokowanym ekranie (spec to wie i wyciąga poprawny wniosek).

**Potwierdzone niezależnie:**

- Parakeet TDT 0.6b v3: licencja CC-BY-4.0, lastModified 2026-06-29, 25 języków w tym polski, WER PL 7,31% Fleurs / 7,28% MLS, automatyczna interpunkcja i wielkie litery, 'accurate word-level and segment-level timestamps'. Wszystko jak w spec. https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3
- sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8 ISTNIEJE i jest udokumentowany w sherpa-onnx, 25 języków europejskich z polskim, rozmiary: encoder 622M, decoder 12M, joiner 6,1M, razem 640M (spec podaje 652/11,8/6,4 = 670 MB — rząd się zgadza). https://k2-fsa.github.io/sherpa/onnx/pretrained_models/offline-transducer/nemo-transducer-models.html
- k2-fsa/sherpa-onnx: Apache-2.0, push 2026-07-24, 13 797 gwiazdek, nie zarchiwizowany. Żywy projekt.
- jonatasgrosman/wav2vec2-large-xlsr-53-polish: Apache-2.0 — licencja jak deklarowana.
- pyannote/segmentation-3.0: MIT, gated (auto) — licencja jak deklarowana.
- nvidia/canary-1b-v2: CC-BY-4.0 — jak deklarowana.
- allegro/herbert-base-cased: CC-BY-4.0 — jak deklarowana. sdadas/polish-roberta-base-v2: Apache-2.0.
- Granary: CC-BY-4.0.
- Cloudflare Containers standard-4 = 4 vCPU / 12 GiB / 20 GB, BEZ GPU, ceny 0,000020 USD/vCPU-s i 0,0000025 USD/GiB-s — dokładnie jak w spec. Arytmetyka kosztu 8424 s × 0,00011 = 0,93 USD jest poprawna.
- Workers AI @cf/openai/whisper-large-v3-turbo: 0,0005 USD za minutę audio = 0,03 USD/h — jak w spec.
- Worker: 100 MB body na Free/Pro, 128 MB RAM na isolate, 15 min dla Queue consumers / Cron / DO alarms — jak w spec.
- R2 max 10 000 części — jak w spec.
- Descript: Free 60 min, Hobbyist 16 USD / 10 h, Creator 24 USD / 30 h, Business 50 USD / 40 h; Studio Sound, Remove Filler Words i Multitrack Transcription gated na Creator+ — dokładnie jak w spec.
- COEP credentialless brak w Safari — jak w spec.
- Matematyka piramidy peaków: L0=256 → 2 025 000 bucketów × 6 B = 12,15 MB; suma 6 poziomów ≈16,2 MB/ścieżka; pokrycie zoomu 3 h w 1600 px = 324 000 klatek/px, L5 = 1,236 bucketa/px ≥ 1. Wszystko się liczy.
- Rozmiary PCM: i24 mono 48 kHz = 144 000 B/s, 3 h = 1,5552 GB, ×3 ścieżki = 4,666 GB. Poprawne.
- Diagnoza obecnego kodu (sprawdzone lokalnie): MediaRecorder tylko 'audio/webm' — hooks/use-audio-recording.ts:17-19. Martwy start nagrywania audio przez odczyt audioRecorder.isRecording w tym samym renderze po await — contexts/audio-recorder-context.tsx:62. AudioClip w sekundach float — lib/multi-track-storage.ts:24-29. generateWaveformData ze stałym samples=1000 — lib/multi-track-storage.ts:715. Pełny decodeAudioData całego bloba do RAM — lib/multi-track-engine.ts:490-492. Zero AudioWorkletu w całym repo (grep bez wyników).
- Teza główna — 'podcast to profil materiału, nie osobny produkt; granica leży w warstwie ANALIZY, a widok tekstowy to drugi widok na ten sam EDL emitujący te same komendy' — jest merytorycznie słuszna i jest najlepszą częścią tej propozycji. Podobnie: EDL na klatkach u64 zamiast sekund float, command log z odwrotnościami zamiast snapshotów, zakaz contenteditable, oddechy tłumione zamiast usuwanych, klasa B wypełniaczy tylko jako sugestia, zakotwiczenie bulletów show notes w cytacie, adaptacyjny próg ciszy z percentyla zamiast stałego dBFS, ochrona pauzy retorycznej.

**Lepsze alternatywy:**

- zamiast *Dwustopniowy pipeline modelowy: Parakeet TDT (ASR) + osobny wav2vec2-large-xlsr-53-polish 315M / ~320 MB int8 (forced alignment CTC, RTF 0,15)* → **Forced alignment NA WŁASNEJ KRATOWNICY PARAKEETA. Transducer TDT pozwala na wymuszony alignment: przy zadanym ciągu tokenów robisz Viterbi po siatce (t, u) enkodera-jointa, dokładnie tak jak CTC, tylko na modelu, który już policzyłeś. Drugi model dokładasz DOPIERO gdy pomiar na własnym korpusie pokaże medianę >30 ms.** (Cztery konkretne zyski: (1) −320 MB modelu i −RTF 0,15, czyli koszt inferencji odcinka spada o ~40% (z 0,93 do ~0,58 USD) i on-device na Androidzie robi się realny; (2) ZERO rozjazdu tokenizacji — obecnie Parakeet ma tokenizer SentencePiece BPE na 25 języków, a XLSR-PL grafemowy, więc tekst trzeba renormalizować między modelami i każda różnica w interpunkcji/wielkich literach/liczbach psuje alignment; (3) TDT PRZEWIDUJE DURATION tokenu, więc granica jest ostrzejsza niż sama siatka 80 ms — CTC daje 20 ms grid, ale CTC ma udokumentowane systematyczne opóźnienie pików (peaky behaviour), którego spec w ogóle nie uwzględnia, a które może przekroczyć okno refinementu ±40 ms; (4) jeden model do utrzymania, kwantyzacji, walidacji i archiwizacji zamiast dwóch. Spec sam pisze, że fine-tuningu nie robi się przed pomiarem — ta sama zasada dotyczy dokładania drugiego modelu. Jeśli pomiar pokaże, że trzeba, to i tak nie XLSR-53 z grudnia 2022, tylko coś nowszego.)
- zamiast *Korekta dryfu zegarów przez GCC-PHAT na referencyjnym miksie zdalnym przesłanym przez WebRTC + regresja liniowa offsetu* → **Pomiar rate'u urządzenia LOKALNIE, bez sieci: regresja (liczba zarejestrowanych klatek) vs (monotoniczny zegar sprzętowy). iOS: AVAudioTime.hostTime + mach_timebase_info przy każdym buforze wejściowym. Android: AudioStream::getTimestamp() z Oboe (framePosition + nanoseconds). Wynik: ppm urządzenia, zapisywany w AudioSource.clock_ppm co 60 s. Sieć służy tylko do synchronizacji zegarów monotonicznych; offset startowy z GCC-PHAT na oknie 5-10 s z progiem peak-to-sidelobe > 3.** (Ścieżka sieciowa nie może dać deklarowanej dokładności, bo referencyjny miks jest wyjściem NetEq, który nieliniowo wstawia i usuwa próbki (accelerate/preemptive expand/PLC) w reakcji na jitter. To unieważnia model offset(t)=a+b·t, na którym stoi cała korekta: resampling będzie prostował artefakty jitter buffera zamiast dryfu zegara. Pomiar lokalny jest odporny na Opus, AEC, NetEq, utratę pakietów i zmienne opóźnienie, daje dryf z dokładnością <0,5 ppm po 10 minutach (czyli <20 ms na 3 h, dziesięć razy lepiej niż wymóg spec ≤1 ms... a przy ciągłym pomiarze i korekcie odcinkowej ≤1 ms), i — kluczowe — WYKRYWA urządzenia, które zmieniają rate w trakcie sesji (openQuestion #7 spec), bo nachylenie regresji przestaje być stałe. Metoda sieciowa tego nie odróżni od jittera. Bonus: eliminuje potrzebę zapisu i uploadu referencyjnego miksu 16 kHz (345,6 MB na ścieżkę na 3 h).)
- zamiast *MFA polish_mfa jako 'GOLDEN REFERENCE / prawda' w CI, z progiem mediany błędu granic ≤20 ms* → **20-30 minut polskiego materiału podcastowego z granicami słów anotowanymi RĘCZNIE w Praacie przez fonetyka. MFA schodzi do roli trzeciego głosu / detektora regresji na dużej próbce.** (Błąd granic MFA na mowie spontanicznej jest sam rzędu 20-30 ms, czyli równy progowi akceptacji — mierzysz zgodność dwóch estymatorów o porównywalnym błędzie i nie wiesz, który się myli. Gorzej: MFA wymaga słownika wymowy i G2P, więc dokładnie na przypadkach trudnych (nazwiska gości, anglicyzmy IT, code-switching) — czyli tam, gdzie chcesz mierzyć — 'prawda' albo znika, albo jest zmyślona przez G2P. Ręczna anotacja 25 minut to dwa dni pracy jednej osoby i zamyka temat dla całego projektu na trzy platformy. To jest dokładnie ten rodzaj wydatku, który zasada 'wysiłek nie jest wektorem' każe ponieść.)
- zamiast *i24 raw jako domyślny format capture na wszystkich platformach, z FLAC-24 w locie jako awaryjnym fallbackiem 'poniżej progu miejsca'* → **FLAC-24 w locie jako DOMYŚLNY format capture na urządzeniach mobilnych (blocksize 4096, SEEKTABLE co 10 s), i24 raw jako domyślny na desktopie/natywnym macOS/Windows.** (Spec odrzuca FLAC jako roboczy argumentem 'odczyt losowy to czysty seek offset = frame × 3, zero dekodowania'. Ale FLAC ma SEEKTABLE i stałe bloki: przy blocksize 4096 indeks bloku liczysz arytmetycznie, a dekod jednego bloku 24-bit mono to ~30-50 µs — o rząd wielkości poniżej budżetu prefetchu 5,46 s, który spec sam definiuje. Zysk jest za to twardy i rozwiązuje ryzyko, które spec sam wskazuje jako niemożliwe do obejścia (ryzyko #7): 4,666 GB → 2,71 GB, czyli bramka miejsca przechodzi na iPhonie, który spec skazuje na odmowę. Koszt 8-12% CPU jest realny, ale na telefonie nagrywającym JEDNĄ ścieżkę (a nie 12) to jest 8-12% z jednego rdzenia. Odwrócenie domyślnej wartości per platforma kosztuje jedną flagę w MaterialProfile, a ratuje główny scenariusz mobilny. Dodatkowo: i24 packed to niewyrównane 3-bajtowe próbki — jeśli i tak trzeba je rozpakowywać w pętli, argument 'zero dekodowania' jest słabszy niż wygląda, a argument '+25% I/O dla f32' nie ma za sobą żadnego pomiaru.)
- zamiast *Diaryzacja fallback jako pyannote/segmentation-3.0 (segmentacja) + embeddingi 3D-Speaker/WeSpeaker + klastrowanie* → **NVIDIA Sortformer (diar_sortformer_4spk / diar_streaming_sortformer_4spk-v2, CC-BY-4.0) jako podstawowa ścieżka fallbacku end-to-end, bez osobnych embeddingów i bez klastrowania. pyannote+embeddingi zostaje dla >4 mówców.** (Spec sam identyfikuje mowę nakładającą się jako główną słabość diaryzacji ('praktycznie gubiona') i główne źródło błędnej edycji. Pipeline segmentacja+embedding+klastrowanie jest architekturą, która overlapu NIE MODELUJE — przypisuje ramkę jednemu klastrowi. Sortformer jest modelem EEND-owym, który wielomówcowość modeluje wprost w wyjściu. Skoro overlap jest zdefiniowanym problemem, wybór modelu, który go modeluje, jest wyborem merytorycznym, nie wygodnym. Drugi powód jest licencyjny: Sortformer to jedne wagi CC-BY-4.0 od jednego wydawcy, zamiast łańcucha segmentacja (MIT, gated) + embeddingi (Apache-2.0 na kodzie, wagi trenowane na VoxCeleb CC-BY-SA i CN-Celeb) — czyli usuwa cały problem opisany w licenceProblems. Spec wymienia Sortformer wyłącznie jako opcję 'na żywo', co jest niedoszacowaniem.)
- zamiast *Ochrona pauzy retorycznej oparta na interpunkcji z ASR ('jeśli poprzednie zdanie kończy się znakiem końca zdania według ASR, minimum 400 ms')* → **Detekcja końca frazy PROZODYCZNA jako podstawa: opadający kontur F0 na ostatnich 200-300 ms (nachylenie < -150 centów/s), wydłużenie finalne (czas trwania ostatniej sylaby > 1,4 × mediana), spadek intensywności > 6 dB. Interpunkcja ASR jako wzmocnienie, gdy jest dostępna.** (Trzy powody. (1) Twoje własne openQuestion #6 pyta, czy interpunkcja Parakeeta dla polskiego wystarcza — a na mowie spontanicznej modele wytrenowane na Granary (gdzie interpunkcja była RESTAUROWANA pseudo-etykietowaniem) stawiają kropki nierówno. (2) Detektor pYIN i tak musi istnieć dla toru śpiewu, więc to zero dodatkowego DSP — dokładnie ten sam argument, którym spec uzasadnia detektor oddechów. (3) I najważniejsze produktowo: skracanie ciszy przestaje wtedy WYMAGAĆ CHMURY. Użytkownik importuje plik i natychmiast, offline, za darmo, dostaje działający 'remove silence' z ochroną rytmu — zamiast czekać na Workflow, ASR i aligner. To zmienia moment pierwszej wartości z 'kilka minut po uploadzie' na 'natychmiast', i robi to bez kompromisu jakościowego. Spec używa tej zależności jako argumentu, że WordTrack musi być obok obwiedni; realnie jest odwrotnie — im mniej warstwa DSP zależy od chmury, tym lepiej.)
- zamiast *Klasa A wypełniaczy usuwana automatycznie na podstawie samych luk w alignmencie + kryteriów akustycznych* → **Obowiązkowa weryfikacja drugim przebiegiem ASR na wyizolowanym fragmencie luki (padding 200 ms). Token leksykalny w wyniku = delecja ASR, oznacz jako 'brakujące słowo', NIE usuwaj. Plus twardsze kryterium akustyczne: monotoniczność formantów (zmiana F1 i F2 < 10% przez ≥100 ms) zamiast samego centroidu widmowego.** (Luka w alignmencie to suma trzech zdarzeń: wypełniacz, delecja ASR i błąd alignera. Przy realnym WER 15-25% na spontanicznym polskim (bo 7,31% to Fleurs, mowa czytana) delecje są częste, a automat skasuje je BEZ ŚLADU — użytkownik nie zobaczy nic w tekście, bo tego słowa tam nigdy nie było. Weryfikacja drugim przebiegiem kosztuje ułamek sekundy na kandydata (fragmenty 120-800 ms), jest praktycznie darmowa w skali odcinka i zamienia najgroźniejszy tryb awarii (ciche kasowanie treści) na nieszkodliwy (nadmiarowe podświetlenie). Monotoniczność formantów jest silniejszym dyskryminatorem niż centroid, bo każde realne słowo ma tranzycje formantowe, a wypełniacz z definicji ich nie ma.)
- zamiast *Jedna granica FFI: 'bindings-ffi/ uniffi → Swift + Kotlin'* → **Dwie granice: bindings-ffi-control (UniFFI, dla EDL/komend/analizy/storage) i bindings-ffi-rt (ręczny extern "C", kontekst preallokowany, rt_process(ctx, in, out, n) bez alokacji, panic=abort, parametry przez triple buffer/atomiki).** (UniFFI alokuje RustBuffer (malloc) i owija obiekty w Arc<Mutex<>> — wywołanie z render callbacku AVAudioSourceNode albo z Oboe onAudioReady łamie realtime safety i daje priority inversion. Metryka 'zero dropoutów audio' jest z tym niekompatybilna. To nie jest kwestia optymalizacji, tylko poprawności: alokator może zablokować wątek audio na czas nieograniczony. Podział na dwie granice trzeba zadeklarować w §10, bo inaczej pierwsza implementacja pójdzie najkrótszą drogą i problem wyjdzie dopiero na urządzeniu.)
- zamiast *Determinizm DSP przez 'golden-file testy w CI' bez sprecyzowania metody porównania* → **Zakaz std/core float math w core-dsp (clippy lint), wyłącznie crate libm (pure Rust, MIT), zakaz target-feature relaxed-simd, zakaz jakichkolwiek flag fast-math; golden-file z tolerancją: RMS różnicy < -120 dBFS i max |różnica| < 1e-5 na blokach 10 s.** (Bez tego CI będzie oblewał w sposób, którego nikt nie zdiagnozuje. sin/cos/tan/exp/log/pow w Ruście to platformowy libm na aarch64-apple-ios i aarch64-linux-android, a wkompilowany na wasm32 — trzy różne wyniki w ostatnich bitach. Dotyczy to współczynników każdego biquada RBJ (tan, cos), jądra sinc w rubato (sin), pYIN (log/exp), K-weightingu. Do tego WASM nie ma FMA, ARM64 ma, a relaxed-simd jest W SPECYFIKACJI niedeterministyczny. Crate libm daje ten sam kod źródłowy na wszystkich targetach, czyli realnie identyczne bity — to jedyny sposób, żeby zdanie 'port na Swift/Kotlin ma być przenoszeniem, nie pisaniem od nowa' było weryfikowalne.)
- zamiast *Startowanie kontenera z inferencją po zakończeniu nagrania, przy wymogu 'pierwszy tekst ≤60 s'* → **Inferencja W TRAKCIE nagrania: każda ukończona część multipart w R2 (8 MiB ≈ 54 s audio) wyzwala Queue → Workflow → kontener. Kontener startuje spekulatywnie w momencie rozpoczęcia sesji.** (Cold start kontenera z ~1 GB wag ONNX plus inicjalizacja sesji ORT dla enkodera 622 MB na 4 vCPU to realnie 15-45 s, a Cloudflare podaje '1-3 s' tylko dla małych obrazów. Budżet 60 s zjada się na samym starcie. Materiał i tak leci do R2 progresywnie — spec to już ma. Uruchamianie ASR na bieżąco sprawia, że transkrypt jest gotowy w sekundach po naciśnięciu STOP zamiast po minutach, a koszt idle kontenera (12 GiB × 0,0000025 USD/GiB-s ≈ 0,11 USD/h) jest nieistotny wobec 0,93 USD za inferencję odcinka. Dodatkowo Cloudflare zastrzega, że instancja może zniknąć w dowolnym momencie ('no guarantee that any instance will run for any set period of time'), więc rozbicie na segmenty ~54 s jest i tak wymuszone przez idempotencję.)
- zamiast *Widok tekstowy renderowany z WordTrack indeksowanego klatką w źródle* → **Widok tekstowy renderowany z PRZEJŚCIA PO KLIPACH OSI CZASU: dla każdego klipu w kolejności timeline_start → zapytanie interwałowe do WordTrack źródła po [source_in, source_in+len) → tokeny mieszczące się całe w klipie. Tokeny przecięte przez granicę klipu renderowane na szaro jako nieedytowalne. Struktura TimelineTextIndex przebudowywana inkrementalnie tylko dla dotkniętych klipów po każdej komendzie.** (To jest jedyny szew, na którym teza 'drugi widok na ten sam EDL' pęka, i spec go nie definiuje. Po RemoveRange z ripple odwzorowanie source→timeline nie jest monotoniczne, a po duplikacji klipu jedno źródłowe słowo istnieje na osi N razy. Przy renderowaniu z WordTrack nie wiadomo, co pokazać — i implementacja albo zduplikuje zdania, albo je zgubi, albo zdesynchronizuje kursor. Renderowanie z klipów rozwiązuje wszystkie trzy przypadki poprawnie i jest jednocześnie naturalnym miejscem, żeby pokazać użytkownikowi, że coś jest ucięte w środku słowa. Bez tej struktury undo w widoku tekstowym będzie się rozjeżdżać z undo na timeline mimo wspólnego command logu.)

<details><summary>Źródła</summary>

- [nvidia/parakeet-tdt-0.6b-v3 — karta modelu (CC-BY-4.0, 25 języków, WER PL 7,31% Fleurs / 7,28% MLS, word-level timestamps, RTFx 3332)](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)
- [nvidia/canary-1b-v2 — karta modelu (978M, CC-BY-4.0, 25 języków, word+segment timestamps, tłumaczenie)](https://huggingface.co/nvidia/canary-1b-v2)
- [csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8 — rozmiary plików ONNX (encoder 652 MB, decoder 11,8 MB, joiner 6,4 MB)](https://huggingface.co/api/models/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/tree/main)
- [k2-fsa/sherpa-onnx — Apache-2.0, ASR/TTS/diaryzacja/VAD offline, iOS+Android+WASM (ostatni push 2026-07-24)](https://api.github.com/repos/k2-fsa/sherpa-onnx)
- [sherpa-onnx — lista pretrenowanych modeli ONNX (potwierdzone: sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8, 25 języków europejskich)](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/index.html)
- [sherpa-onnx — diaryzacja mówców (pyannote-segmentation-3-0 + embeddingi 3D-Speaker/NeMo, buildy Android/iOS/WASM)](https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/index.html)
- [openai/whisper-large-v3-turbo — 809M, 4 warstwy dekodera (vs 32), MIT, word timestamps przez return_timestamps="word", ostrzeżenie o nierównej jakości między językami](https://huggingface.co/openai/whisper-large-v3-turbo)
- [m-bain/whisperX — BSD-2-Clause, aktywny (push 2026-07-13), ASR z word-level timestamps i diaryzacją](https://api.github.com/repos/m-bain/whisperX)
- [SYSTRAN/faster-whisper — MIT, CTranslate2](https://api.github.com/repos/SYSTRAN/faster-whisper)
- [jonatasgrosman/wav2vec2-large-xlsr-53-polish — Apache-2.0, Common Voice PL 6.0 (baza aligneru CTC dla polskiego)](https://huggingface.co/api/models/jonatasgrosman/wav2vec2-large-xlsr-53-polish)
- [facebook/mms-300m — cc-by-nc-4.0 (WYKLUCZA komercyjne użycie MMS-FA i ctc-forced-aligner opartego na MMS)](https://huggingface.co/api/models/facebook/mms-300m)
- [MahmoudAshraf97/ctc-forced-aligner — brak licencji w repo (spdx_id: null)](https://api.github.com/repos/MahmoudAshraf97/ctc-forced-aligner)
- [Montreal-Forced-Aligner — MIT, aktywny (push 2026-07-11)](https://api.github.com/repos/MontrealCorpusTools/Montreal-Forced-Aligner)
- [MFA — polskie modele akustyczne: polish_mfa v2.0.0 (CC-BY-4.0), polish_cv v2.0.0 (CC-0)](https://mfa-models.readthedocs.io/en/latest/acoustic/Polish/index.html)
- [pyannote/segmentation-3.0 — licencja wag MIT, gated (auto)](https://huggingface.co/api/models/pyannote/segmentation-3.0)
- [pyannote/speaker-diarization-community-1 — CC-BY-4.0, gated (auto)](https://huggingface.co/api/models/pyannote/speaker-diarization-community-1)
- [nvidia/diar_streaming_sortformer_4spk-v2 — CC-BY-4.0, streaming diaryzacja do 4 mówców](https://huggingface.co/api/models/nvidia/diar_streaming_sortformer_4spk-v2)
- [argmaxinc/WhisperKit — MIT, on-device Apple Silicon, aktywny (push 2026-07-13)](https://api.github.com/repos/argmaxinc/WhisperKit)
- [Apple SpeechTranscriber — iOS/macOS/tvOS/visionOS 26.0+, supportedLocales / installedLocales, isAvailable](https://developer.apple.com/tutorials/data/documentation/speech/speechtranscriber.json)
- [Apple SpeechTranscriber.ResultAttributeOption — .audioTimeRange (timing) i .transcriptionConfidence](https://developer.apple.com/tutorials/data/documentation/speech/speechtranscriber/resultattributeoption.json)
- [Granary: Speech Recognition and Translation Dataset in 25 European Languages (arXiv 2505.13404) — pipeline pseudo-labelingu z filtrowaniem halucynacji i restauracją interpunkcji (dane treningowe Parakeet v3 / Canary v2)](https://arxiv.org/abs/2505.13404)
- [Cloudflare Workers AI — pricing: @cf/openai/whisper-large-v3-turbo 0,0005 USD / minutę audio (= 0,03 USD/h), 0,011 USD/1000 neuronów](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Cloudflare Containers — pricing i typy instancji (max standard-4: 4 vCPU / 12 GiB / 20 GB; 0,000020 USD/vCPU-s; 0,0000025 USD/GiB-s; BRAK GPU)](https://developers.cloudflare.com/containers/pricing/)
- [Cloudflare R2 — pricing: 0,015 USD/GB-mies Standard, Class A 4,50 USD/M, Class B 0,36 USD/M, egress 0 USD](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare Workers — limity platformy: body 100 MB (Free/Pro), 128 MB pamięci na isolate, 15 min dla Queue/Cron/DO alarm](https://developers.cloudflare.com/workers/platform/limits/)
- [Groq — pricing ASR: whisper-large-v3-turbo 0,04 USD/h, whisper-large-v3 0,111 USD/h](https://groq.com/pricing)
- [Deepgram — pricing (Nova-3 mono/multilingual, diaryzacja jako add-on 0,0020 USD/min)](https://deepgram.com/pricing)
- [ElevenLabs — pricing API: Scribe v2 0,22 USD/h, Scribe v2 Realtime 0,39 USD/h z word-level timestamps](https://elevenlabs.io/pricing/api)
- [Auphonic — pricing: 2 h/mies. darmowo, S €9/9h … XXL €149/250h; leveler, noise+reverb reduction, AutoEQ, BWE, loudness, filler & silence cutting, multitrack, rozdziały, shownotes](https://auphonic.com/pricing)
- [Descript — pricing: Free 60 min, Hobbyist 16 USD/10 h, Creator 24 USD/30 h, Business 50 USD/40 h; gating Studio Sound i usuwania wypełniaczy](https://www.descript.com/pricing)
- [Riverside — local recording: nagranie lokalne 48 kHz nieskompresowany WAV per uczestnik, progresywny upload w kawałkach w trakcie sesji, osobne ścieżki](https://riverside.com/blog/local-recording)
- [MDN — Storage quotas and eviction criteria: Chrome ~60% dysku per origin, Safari (macOS 14+/iOS 17+) ~60%, limit łączny 80%, proaktywna eksmisja Safari po 7 dniach bez interakcji, wpływ navigator.storage.persist()](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [MDN browser-compat-data — FileSystemSyncAccessHandle: Chrome 102, Chrome Android 109, Safari/iOS 15.2, Firefox 111](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/FileSystemSyncAccessHandle.json)
- [MDN browser-compat-data — AudioEncoder (WebCodecs): Chrome 94, Safari 26, Firefox 130](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/AudioEncoder.json)

</details>

---
