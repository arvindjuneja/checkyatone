# PLAN: Vocal Coach → platforma głosowa (web + natywny iOS + natywny Android)

## 1. Jak to rozegrać

**Dzień 0 — zamrożenie.** Trzy kontrakty: nagłówek C ścieżki RT (`vc_core.h`), schemat SQLite, format projektu. Tego samego dnia wychodzi **stub rdzenia z poprawnym ABI**, emitujący syntetyczne zdarzenia F0.

**Od dnia 1 cztery tory jadą równolegle**, bo shelle piszą przeciwko nagłówkowi, nie przeciwko implementacji:

- **TOR A — rdzeń.** Szeregowy wewnątrz, kolejność dyktuje wyłącznie ryzyko merytoryczne.
- **TOR B — trzy shelle. iOS i Android startują tutaj, razem, natychmiast po zamknięciu Fali 0.** Web równolegle z nimi.
- **TOR C — dane i własny model.** Start dzień 1: najdłuższy czas dojrzewania, nie blokuje niczego.
- **TOR D — backend Cloudflare.** Start dzień 1, nie blokuje niczego.

**Osiem spike'ów biegnie równolegle; nic na nie nie czeka.** Każdy binarny, każdy z planem awaryjnym. Mogą zmienić decyzje 3, 7, 10 i 11 — i tylko one mogą jeszcze zmienić kształt planu.

**Kolejność wewnątrz rdzenia:** harness ewaluacyjny i korpus (bez nich żadna zmiana DSP nie jest weryfikowalna) → klasyczny tor F0 (werdykt intonacyjny to jedyna rzecz, której nie wolno pomylić ani razu) → integralność ujęcia i kalibracja latencji (utrata materiału i rozjechany podkład są nieodwracalne) → OCEŃ i gra → montaż, sieć neuronowa, profil MOWA.

**Każdy krok toru A ląduje pod istniejącym UI weba natychmiast po zamknięciu.** Dzisiejszy użytkownik widzi kolejno: silnik przestaje kłamać powyżej E4 → nagrania w końcu istnieją → karaoke przestaje być rozjechane → wynik mówi, *co* poprawić.

**Rozjazdowi platform zapobiega jeden mechanizm:** jeden rdzeń, jeden generator typów z jednej definicji, jedna bramka CI porównująca wyjście trzech targetów na tym samym korpusie WAV.

**Krok jest skończony, gdy przechodzi swoje mierzalne kryterium z sekcji 5.** Kryteriów opisowych nie ma.

## 2. Co budujemy

Przyrząd pomiarowy, który jest zabawny.

Jeden prymityw danych — **UJĘCIE** (niezmienne: FLAC-24 48 kHz + kontur F0 + referencja + snapshot kalibracji urządzenia + profil materiału). Cztery czasowniki nad nim: **ĆWICZ**, **NAGRAJ**, **OCEŃ**, **ZMONTUJ**.

Analiza to derywat wersjonowany `analyzerVersion`: poprawa detektora retroaktywnie poprawia całą historię użytkownika — niemożliwe, gdy trzyma się sam wynik.

**OCEŃ jest czasownikiem brakującym.** „Śpiewasz czysto, ale całość leży 18 centów nisko" i „śpiewasz chaotycznie" to dwie różne recepty, które jedna liczba zlepia.

SPIEW i MOWA to **profile materiału**: przełączają stałe DSP, cele loudness, zestaw analizatorów i domyślny czasownik. Nie osobne aplikacje.

Kategoria do wygrania: jedyna aplikacja, której werdykt intonacyjny zaakceptowałby wyszkolony śpiewak. Konkurencja mierzy odległość do siatki temperacji równej, karze transpozycję, karze vibrato, myli oktawy.

Cała analiza on-device — Apple i Google zwalniają to z deklaracji zbierania danych. Zero analizy emocji (AI Act art. 5(1)(f): zakaz, nie ryzyko), zero voiceprintu (jedyna droga pod art. 9 RODO).

## 3. Architektura

```
┌─ SHELLE (cienkie: I/O, uprawnienia, cykl życia sesji, UI, rasteryzacja) ─────┐
│ web: Next.js 16/React 19   iOS: Swift/SwiftUI/Metal   Android: Kotlin/Compose│
│ AudioWorklet+SAB+Worker    AVAudioSinkNode            Oboe/AAudio + shim C++ │
└────────┬─────────────────────────┬──────────────────────────┬───────────────┘
   RT: extern "C" + POD + slab hosta │ CONTROL: typy z JEDNEGO generatora
┌────────┴─────────────────────────────────────────────────────────────────────┐
│ vc-core-rt  #![no_std] · zero alloc · zero C/C++ · zero importów wasm         │
│  vc-num (własne libm, real-FFT z tablicą twiddle jako DANE)                   │
│  vc-dsp (biquady RBJ, dynamika, FDN, BS.1770-4+TP16×, resampler 441/320)      │
│  vc-f0 (CMNDF 1024+2048 @hop 480 → pYIN → fuzja → Viterbi int32 Q16.16)       │
│  vc-nn-rt (ręczny kernel, model ≤2 MMAC) · vc-notes · vc-score · vc-viewmodel │
│  SPSC ring nad slabem hosta, per-slot seqlock, licznik dropped                │
│  KONTRAKT Tier 0: bit-exact na wasm32 / aarch64-ios / aarch64-android         │
├───────────────────────────────────────────────────────────────────────────────┤
│ vc-core-off  std · alloc · C++ OK                                             │
│  vc-edl (log komend + undo) · vc-project (SQLite) · vc-render · vc-peaks       │
│  vc-nn (tract 0.23.4, MIT) · vc-speech · vc-flac · vc-latency                 │
│  KONTRAKT Tier 1 (1 LSB 24-bit) / Tier 2 (metryki MIR)                        │
└───────────────────────────────────────────────────────────────────────────────┘
        BACKEND (Cloudflare) — WYŁĄCZNIE: sesja double-ender (DO), ścieżki (R2,
        multipart 8 MiB), ASR+alignment (Containers standard-4), Workflows, D1.
        Render, eksport, scoring, F0, EDL — NIGDY na serwerze.
```

| Element | Gdzie | Granica uzasadniona |
|---|---|---|
| F0, voicing, Viterbi, scoring, DSP, loudness, view-model (draw-listy 0..1) | vc-core-rt | jedna implementacja = jedna liczba na trzech platformach |
| EDL, undo, SQLite, render offline, peak pyramid, FLAC, duże modele | vc-core-off | te same semantyki cofania, ten sam plik wyjściowy wszędzie |
| Audio I/O, przerwania, trasy, uprawnienia, tło, wykonanie storage | shell | trzy modele przerwań nie mają wspólnej części wartej abstrahowania |
| Rasteryzacja (Canvas2D / Metal / Skia) | shell | rdzeń wystawia draw-listy i rolę semantyczną, nie piksele |

## 4. Decyzje twarde

| # | Decyzja | Wybór | Dlaczego | Odrzucone |
|---|---|---|---|---|
| 1 | Język rdzenia | Rust, dwa tiery: `vc-core-rt` (`#![no_std]`) / `vc-core-off` (`std`) | `wasm32-unknown-unknown` bez toolchainu C/C++; `no_std` = compile-time dowód braku alokacji (kontrakt Oboe) | C++ (domyślna kontrakcja FMA, brak zakazu alokacji, dojrzałe DSP na GPL/LGPL); C |
| 2 | FFT | Własny real-FFT o stałym harmonogramie; twiddle liczone offline, wysyłane jako dane z SHA-256 | rustfft: twiddle przez `f64::sin/cos` z platformowego libm + runtime dispatch AVX/NEON → Tier 0 pada w pierwszym bloku | rustfft/realfft w produkcji (zostają jako dev-dependency w golden testach) |
| 3 | Determinizm | Bit-exact na **skwantowanym posteriorze Q16.16, ścieżce Viterbiego int32 i wyjściach całkowitych**; tor float: SNR > 120 dB; bramka na WAV-ach z korpusu. Pełna równość float w S1 → podnosimy kontrakt | Jedyna widoczna różnica platformowa: przełączenie argmaxu przy remisie = skok o oktawę na jednym telefonie. Fixed-point deterministyczny z definicji i szybszy | „assert równości wszystkich f32" jako jedyna bramka; NaN w ABI (zastąpione `f0_hz == 0.0` + `state: u8`) |
| 4 | Transcendentale i targety | `libm = "=0.2.16"` `default-features = false`; `Cargo.lock` + `--locked`; `rust-toolchain.toml` z dokładną wersją; clippy `disallowed-methods` na std float math; zakaz `relaxed-simd`. Targety: wasm32, aarch64-ios, aarch64-android, x86_64-\*. **armv7 wypada** | Rust std dokumentuje niedeterministyczną precyzję `sin/exp/pow`; armv7 nie ma NEON w Ruście i pracuje w FTZ | armv7 jako target produkcyjny; poleganie na przypięciu kanału rustc |
| 5 | FFI | **Dwie powierzchnie**: `extern "C"` + POD + slab hosta dla RT; **własny generator** typów C/Swift/Kotlin/TS z jednej definicji dla ścieżki zimnej | UniFFI: alokowany `RustBuffer` per wywołanie = 375 alokacji/s na wątku RT = priority inversion; UniFFI-Kotlin ciągnie JNA (druga `.so`, +1,5 MB). Dwa generatory = dwa modele typów = dryf | UniFFI; swift-bridge (tylko iOS → dryf wraca) |
| 6 | Ring zdarzeń | Własny SPSC nad slabem hosta (`static VC_SLAB` w .bss), per-slot seqlock, numer sekwencji, licznik `dropped` | rtrb: bezwarunkowe `extern crate alloc`, brak nadpisywania starych wpisów, brak bazy; sześć nieatomowych odczytów 32 B = torn read | rtrb; `postMessage` jako kanał danych |
| 7 | Sample rate | Rdzeń przyjmuje natywny rate urządzenia (44 100 i 48 000 pierwszoklasowe); deterministyczny resampler polifazowy 320/441 (64 tapy/fazę, Kaiser β=8,6, stopband −96 dB) w `vc-dsp`; **cały tor poniżej pracuje na 48 000** | Android CDD wymaga 44,1 i 48; wymuszenie 48 przy `ConversionQuality::None` zabija LowLatency, `precondition` na iOS trapuje przy HFP. Jedna częstotliwość analizy zachowuje Tier 0 | „48 kHz albo błąd"; rdzeń parametryczny w częstotliwości analizy (mnoży bramki bit-exact) |
| 8 | Estymator F0 v1 | Klasyczny, bez sieci: **CMNDF w dwóch oknach (1024 + 2048) na wspólnym hopie 480** → pYIN Beta(2,18) → fuzja log-liniowa → fixed-lag Viterbi int32; voicing z 5 cech; siatka 10¢ do C7 | Dwa okna zdejmują trzy kompromisy naraz: basy 70 Hz (3 okresy w 1024 to za mało), vibrato 6–8 Hz (2048 zaniża o 10–18%), szybkość ataku. Koszt +44 MFLOP/s, latencja bez zmian | jedno okno 42,67 ms; pYIN jako samodzielny estymator (voicing recall 0,633); RMVPE (nieprzyczynowy); PESTO (LGPL) |
| 9 | Wagi modeli | **Trenujemy własne.** Do produktu wchodzą wyłącznie licencje permisywne na kodzie **i** na wagach, z SHA-256 i udokumentowanym pochodzeniem danych | MDB-stem-synth (CC BY-NC) zatruwa CREPE, RMVPE, PENN, SwiftF0, HARMOF0, SPICE. Nie ma gotowego modelu F0 klasy SOTA do wysyłki komercyjnej | fine-tuning cudzych wag (dziedziczy zatrucie); FSD50K bez filtrowania (11% dev setu CC-BY-NC) → MUSAN |
| 10 | Runtime inferencji | Tor RT: **ręczny kernel w `vc-nn-rt`** (model ≤2 MMAC, wagi int8 jako dane). Tor off: `tract` 0.23.4 (MIT), jeden `.opl`. ONNX Runtime **wyłącznie jako oracle w CI**. ASR on-device: sherpa-onnx (Apache-2.0), natywny opt-in, poza Tier 0 | Tylko ręczny kernel wchodzi do `no_std` i pod Tier 0; `ort-wasm-simd-threaded.wasm` to 12,86 MB przy modelu 0,38 MB i nie ładuje się do worklet; CoreML liczy fp16 na ANE i cicho spada na CPU; NNAPI zdeprecjonowane w Androidzie 15 | ORT/CoreML/LiteRT w produkcie; tract w torze RT (`cc` + SIMD per-arch) |
| 11 | Izolacja i transport na webie | **COOP `same-origin` + COEP `require-corp` na całej aplikacji** (nagłówki w `_headers` — `output: 'export'` nie obsługuje `headers()`); SAB jako jedyny kanał danych worklet↔worker; surowy cdylib w worklecie przez `WebAssembly.Module` w `processorOptions`. Bez COI: tryb tylko do odczytu historii | Bez SAB drugi koniec `MessagePort` worklety żyje na main threadzie: 4,67 GB przez wątek UI; brak też VFS `opfs` w SQLite Wasm. Safari obsługuje `require-corp`, nie `credentialless`. Warunek: usunięcie iframe YouTube, i tak usuwanego | dwa tory transportu; `credentialless`; wątki wasm w tierze RT; wasm-bindgen w worklecie (brak `TextEncoder`); drugi silnik dla przeglądarek bez COI |
| 12 | Storage i format zapisu | OPFS + `FileSystemSyncAccessHandle` w dedykowanym workerze, minimum Safari/iOS **16.4**; jeden `db-worker` jako wyłączny właściciel SQLite; bramka miejsca przez `truncate()` (prealokacja), nie `estimate()`. **FLAC-24 wszędzie** (blocksize 4096 stały, SEEKTABLE co 1 s); i24 raw tylko jako scratch bieżącego ujęcia | 3 h × 3 ścieżki = 4,67 GB w i24 vs 2,71 GB we FLAC, random access ~40 µs/blok. WebKit liczy kwotę od całkowitego dysku — `estimate()` przepuszcza nagranie na pełnym telefonie | IndexedDB na audio; localStorage na cokolwiek poza preferencjami; f32 na dysku (+25% I/O, ENOB ADC to 20–21 bitów); MediaRecorder/webm jako tor capture |
| 13 | Model danych | Jedna schema SQLite na trzech platformach (Take, Reference, Analysis, Project, AudioProfile, SkillState); migracje jako dane; EDL na klatkach `u64`; log komend z odwrotnościami + snapshot co 50 | Ten sam plik otwiera się w wasm, iOS i Androidzie; jeden log obsługuje widok timeline i widok tekstowy podcastu | trzy bazy IndexedDB; jakakolwiek tablica w localStorage |
| 14 | Latencja | Kalibracja **log-sweepem Fariny** per (device, route), mediana z 3 pomiarów w odstępie ≥1,2 s, okno ±350 ms; zapis w Ujęciu jako `latency_comp: i32`, **nigdy wypalona w audio** | Chirp liniowy wpada w nieliniowość głośnika telefonu; korekta w EDL pozwala poprawić kalibrację bez utraty materiału; web nie raportuje latencji wejścia | globalny offset w ustawieniach; poleganie na raportach platformy |
| 15 | Scoring | **Cztery liczby zawsze razem**: offset O(t), rozrzut 1,4826·MAD(residuum), dryf, błąd interwałowy. Martwa strefa zależna od trybu (JI a cappella / ET z podkładem). Vibrato premiowane, jego składowa odejmowana przed liczeniem stabilności. Jedna liczba wyłącznie w grze | Offset transpozycyjny w a cappella to norma, nie błąd. MusicJudge osiąga ρ=0,683 przez ten rozdział; samo pitch tracking sufituje na ρ≈0,49 | „średnia dokładność" = odległość do najbliższego półtonu (rośnie, gdy stabilnie fałszujesz); % ramek w tolerancji |
| 16 | Trudność gry | Rośnie **strukturą muzyczną** (8 poziomów, L3 = referencja milknie); tolerancja `max(25¢, 1,5×MAD użytkownika)`; dobór elementu bandytą na pasmo sukcesu 75–85%; miernik trzymania **w sekundach** | Eksperci uznają ±20–25¢ za „w stroju"; poziom „10 centów" mierzy szum estymatora, nie śpiew | poziomy 50→25→15→10 centów; globalny „poziom użytkownika"; próg trafienia w ramkach |
| 17 | Motywacja | Cel **tygodniowy** (4 sesje) + 2 dni odpoczynku na miesiąc; celebracja nazywa CO było dobre | Głos to mięsień wymagający regeneracji; dzienny streak z framingiem straty to antypedagogika wpisana w mechanikę. Nagrody informacyjne nie podkopują motywacji wewnętrznej, kontrolujące tak | dzienny streak, XP/waluta, tabele liderów, A/B testowanie tego wyboru |
| 18 | Segmentacja na nuty | Reguły (histereza na konturze centów) jako bootstrap → **własna sieć klasy ROSVOT trenowana na korpusie EGG**, wchodzi z bramką F1 | Wagi ROSVOT nie mają licencji, M4Singer ma NOASSERTION. Reguły przegrywają o 26 pkt F1, a korpus i tak powstaje w torze C | wagi ROSVOT; dekoder wysokości z sieci (przyciąga fałsz do zamierzonej nuty: −10,49 pp RPA) |
| 19 | Separacja podkładu | **Własne wagi na architekturze BS-RoFormer (kod MIT), trenowane na korpusie multitrack z pełnym przeniesieniem praw** (zamówione sesje + syntetyczne miksy z bibliotek z prawem do trenowania). Karaoke działa niezależnie: import stemów i „przynieś własny podkład" | Czołowe checkpointy (BS PolarFormer, HTDemucs) trenowane na MUSDB18-HQ — wprost non-commercial; tag MIT na re-uploadzie nie tworzy licencji. Ta sama doktryna co przy CREPE/RMVPE | tag MIT z HF bez audytu danych; wysyłanie cudzej muzyki na nasze serwery |
| 20 | Mowa: ASR i mówcy | Parakeet TDT v3 na Containers standard-4 (domyślnie) + forced alignment **na własnej kratownicy TDT**; sherpa-onnx jako opt-in offline. **Multitrack zamiast diaryzacji** (jeden mówca = jedna ścieżka) | DER 8–15% propaguje się wprost na edycję po tekście: użytkownik tnie w cudzej wypowiedzi. Osobne ścieżki = 0% błędu przypisania | diaryzacja jako mechanizm podstawowy; Whisper (halucynacje na ciszy) |
| 21 | Prywatność i zakres | Wszystko on-device domyślnie; chmura jako jawna akcja per-ujęcie; zero analizy emocji, zero voiceprintu, zero telemetrii konturów F0; target 13+ | Apple i Google zwalniają on-device z deklaracji → etykieta „no data collected" i usunięcie całej klasy compliance. AI Act art. 5(1)(f) to zakaz w kontekście edukacyjnym | „ocena pewności prezentacji" dla podcasterów; telemetria konturów (kontur wysłany dalej to osobna dana do zadeklarowania) |

## 5. Sekwencja

### FALA 0 — zamrożenie kontraktów; spike'i startują tego samego dnia

| Krok | Kryterium ukończenia |
|---|---|
| **0.1** `vc_core.h` + `module.modulemap` + generator typów + **stub rdzenia** emitujący syntetyczne `VcEvent` | Buduje się do XCFramework, `libvcshim.so` i surowego `.wasm`; `vc_core_abi_version()` sprawdzany przez trzy shelle; rysuje przewijający się kontur na fizycznym iPhonie i Androidzie |
| **0.2** Schema SQLite + migracje jako dane + `numeric_epoch` | Jeden plik `.db` w round-tripie zapis/odczyt w wasm, iOS i Androidzie; 100% testów migracji z trzech obecnych baz IndexedDB |
| **0.3** `vc-equiv` + korpus (`synth/ noise/ real/ edge/ blocks/`, 200 plików) + CI z 4 targetami + clippy `disallowed-methods` | Bramka bit-exact zielona na stubie od pierwszego commitu; grep na `relaxed_` pusty; sekcja importów w `.wat` pusta; **pomiar OBECNEGO detektora**: RPA/RCA/GPE/voicing znane liczbowo |

| Spike | Zaliczony gdy | Plan awaryjny |
|---|---|---|
| S1 Bit-identyczność wasm32/ios/android: własny FFT + CMNDF + Viterbi int32, `codegen-units=1`, `panic=abort`, urządzenia fizyczne | Zero różnic `to_bits()` na 200 plikach | Tier 0 zawężony do posteriora i ścieżki (dec. 3) |
| S2 `+simd128` vs równość skwantowanego posteriora | Wynik identyczny ze skalarnym na 4 targetach | Build RT bez SIMD; przebudżetowanie 2 GFLOP/s → 0,8–1,2 |
| S3 Surowy cdylib w AudioWorklecie na **realnym iPhonie** | `process()` wołane, moduł import-free, ≤220 KB raw / 90 KB brotli | Emscripten SINGLE_FILE z własnym libm; Tier 0 tylko dla native |
| S4 Koszt pełnego toru klasycznego na 3 klasach Androida (Chrome) | ≤25% jednego rdzenia w Workerze | Hop neuronowy 30–40 ms przy hopie klasycznym 10 ms |
| S5 Round-trip na 15 konfiguracjach (iPhone wired/BT/głośnik, Android flagowiec/średniak, desktop Chrome/Safari) | Rozkład znany, odsetek >45 ms zmierzony | Monitoring bramkowany klasą urządzenia, nie wyłączony |
| S6 WER Parakeet vs Canary na własnym korpusie PL (2 h: 6 mówców × 3 mikrofony × 3 akustyki, 25 min z granicami ręcznie w Praacie) | WER ≤14% z nazwami własnymi; mediana granicy ≤20 ms, p95 ≤50 ms; RTF sumaryczny ≤0,4 | Osobny aligner wav2vec2 na kratownicy |
| S7 `SpeechTranscriber.supportedLocales` zawiera `pl_PL` (iOS 26) | pl-PL obecny, asset pobierany na urządzeniu | ASR serwerowy domyślnie, sherpa-onnx jako opt-in |
| S8 ICC(2,k) trzech nauczycieli na 120 wykonaniach | ICC ≥0,78 | Poprzeczka scoringu = 0,90 × ICC, nie 0,70 |

**Zamknięcie Fali 0 = start iOS i Androida**, obu równolegle ze sobą i z rdzeniem.

### FALA 1 — cztery tory naraz

**TOR A — rdzeń + widoczna wartość dla dzisiejszych użytkowników** (szeregowy wewnątrz)

| Krok | Kryterium ukończenia | Co widzi użytkownik |
|---|---|---|
| **A1** `vc-num` + `vc-dsp` (biquady RBJ, dynamika, decymator, resampler 320/441, BS.1770-4 + TP 16×) | Golden test vs rustfft, tolerancja 1e-6; `.wasm` import-free ≤220 KB; resampler: SNR >110 dB, THD+N < −96 dB na sweepie 20 Hz–20 kHz | — |
| **A2** `vc-f0` w pełni | Bije obecny kod i goły pYIN na korpusie; **zero błędów oktawowych** na gamie C3–C5 i skokach oktawowych; mediana \|błędu\| <10¢; wierność vibrata 4–8 Hz w paśmie 0,92–1,05; bit-exact na 4 targetach | — |
| **A3** Podmiana detektora w webie (AudioWorklet + SAB + Worker); usunięcie `lib/fft-analyzer.ts`, filtrów antyharmonicznych, blokady skoku, globalnego stanu | Latencja od dźwięku do piksela <100 ms na 3 urządzeniach; 60 fps bez `setState` per klatka; zero `AnalyserNode`/rAF w torze analizy | **Silnik przestaje kłamać powyżej E4 — sopran widzi A4, nie A3** |
| **A4** Capture, który nie gubi: ring → FLAC-24 → OPFS, prealokacja, jedna schema SQLite, migracja | Nagranie 40 min przeżywa zabicie karty/procesu; zero pominiętych próbek przy losowej sekwencji rozmiarów bloków; odzyskiwanie ujęcia ≤3 s | **Nagrania w końcu istnieją** (dziś `MediaRecorder` nie startuje) |
| **A5** `vc_calibrate_latency` + monitoring w słuchawkach + detekcja trasy | Test nulowy: kopia podkładu przez loopback po kompensacji, residuum < −40 dBFS; zgodność z raportem platformy ±2 ms na loopbacku przewodowym | **Karaoke przestaje być rozjechane; słychać się w słuchawkach** |
| **A6** `core-eval` + ekran OCEŃ: cztery liczby, klikalna tabela nut, heatmapa interwałów, „przećwicz te 3 nuty" | Monotoniczność scoringu; transpozycja +250¢ → ΔScore ≤3 pkt; vibrato 6 Hz/±70¢ → ΔScore ≥0; 10 użytkowników, ≥50% formułuje poprawne „co mam poprawić" | **„Śpiewasz czysto, ale 18 centów nisko"** |
| **A7** Gra: L1–L8, `SkillState` Beta per (interwał × rejestr × kierunek), cel tygodniowy | Pasmo sukcesu 75–85% na 4-tygodniowej kohorcie; próg trafienia niezależny od odświeżania (30/60/120 Hz → identyczny wynik) | Gra rośnie razem z użytkownikiem |
| **A8** Kalibracja percentylowa wyniku | Mediana populacji referencyjnej 62 ±3; różnica median ≤4 pkt między typami głosu i między klasami urządzeń; N ≥500 ujęć | Wynik porównywalny w czasie |

**TOR B — trzy shelle, równolegle ze sobą** (start: zamknięcie Fali 0)

| Krok | Kryterium |
|---|---|
| **B1** Capture jako serwis o cyklu życia niezależnym od widoku. iOS: `AVAudioSession .measurement` + `AVAudioSinkNode` (blok RT, zero ARC, weryfikacja `channelCount`/`isInterleaved`). Android: Oboe + shim C++, **zero JNI w `onAudioReady`**, jedna `libvcshim.so`, FGS `microphone`, arm64-v8a + x86_64 | Ujęcie przeżywa `interruptionNotification` i `routeChangeNotification`; zero `precondition` na sample rate; 0 nowych xrunów (`getXRunCount`) na 40 min; drain ringu przez seqlock bez torn read w 10⁸ iteracjach |
| **B2** Storage + peak pyramid 6 poziomów + streaming reader | 3 h × 6 ścieżek: przewijanie 60 fps przy ≤400 MB RSS; seek do dowolnej sekundy ≤50 ms |
| **B3** Nawigacja czterech czasowników + wizualizacja (piano-roll + error lane, zegar audio) | Aplikacja użyteczna w skali szarości (kontrast WCAG AA); dryf wizualizacji vs audio ≤1 ramka na 10 min |
| **B4** Nightly device job: `vc-equiv` na fizycznym iPhonie i arm64 Androidzie | Równość posteriora i ścieżki Viterbiego na całym korpusie, codziennie |

**TOR C — dane i własny model** (start: dzień 1)

| Krok | Kryterium |
|---|---|
| **C1** `docs/licensing.md` z SHA-256 i pochodzeniem każdego artefaktu | Zero źródeł NC w pipeline; FSD50K zastąpiony MUSAN; audyt blokuje merge treningowy |
| **C2** Synteza źródło-filtr (LF + trakt) + resynteza WORLD na VocalSet (CC BY 4.0) | ≥300 h z idealnym ground truth |
| **C3** Korpus EGG: 20 śpiewaków, pokrycie E2–F6, falset męski, głos dziecięcy, fry | ≥10 h; ręczna anotacja granic nut na 2 h (sufit ludzki COnPOff zmierzony na dwóch anotatorach) |
| **C4** Replika w skali HARMOF0 → krzywa jakość-vs-MAC w repo → `VC-F0-Net` ≤2 MMAC | Bramka to punkt z własnej krzywej; twardy próg wejścia: **octave error ≤1,2% na vocadito** (poziom SwiftF0) i nie gorzej niż tor klasyczny na **żadnej** metryce |
| **C5** Sieć segmentująca nut na EGG | F1 COnPOff ≥ (reguły + 20 pkt) i ≥0,85 × sufit ludzki z C3 |

**TOR D — backend** (start: dzień 1)

| Krok | Kryterium |
|---|---|
| **D1** Durable Object sesji + R2 presigned multipart 8 MiB + D1 metadata | Wznowienie uploadu po zerwaniu sieci; zero utraconych części na 3 h × 4 uczestników |
| **D2** Containers: Parakeet TDT v3 int8 + alignment na kratownicy TDT | Progi S6 utrzymane w produkcji; koszt odcinka 60 min ≤0,60 USD |
| **D3** Workflows z regułą „każdy krok zwraca klucz R2, nie artefakt" | Restart dowolnego kroku bez ponownego uploadu |

### FALA 2 — start po zamknięciu A6 i B2

| Krok | Kryterium |
|---|---|
| **E1** EDL + log komend z odwrotnościami + snapshot co 50 | Undo/redo przeżywa reload w obu widokach; cięcie sample-exact; \|Δamplitudy\| <0,002 po crossfade |
| **E2** Render offline (`Transport::Offline`, ten sam graf, PDC) + eksport WAV/FLAC/AAC/Opus/MP3 + presety dostawy | 3 h × 6 ścieżek ≥20× realtime; \|LUFS − target\| ≤0,1 LU, TP ≤ −1,0 dBTP; preset ACX: RMS −23…−18 dBFS, peak ≤ −3 dB, noise floor ≤ −60 dBFS; regresja renderu w CI na każdy commit (residuum vs wzorzec < −60 dBFS) |
| **E3** Aligner NW na nutach + wymiar `content` + silnik findings (LLM tylko formułuje słowa) | Zero diagnoz spoza `findings[]`; jeden finding na sesję |
| **E4** Panel ekspercki: 120 wykonań, ≥3 nauczycieli | Spearman ρ ≥ min(0,70; 0,90 × ICC z S8) |

### FALA 3 — rozszerzenia, każde niezależne

- **F1** Sieć F0 za flagą + A/B z telemetrią lokalną (po C4).
- **F2** Profil MOWA: WordTrack, widok tekstowy jako drugi widok na tym samym EDL, skracanie ciszy z ochroną pauzy prozodycznej, detektory disfluencji klasy A **z obowiązkową weryfikacją drugim przebiegiem ASR na luce z paddingiem 200 ms**; precyzja ≥97%, cięcie po tekście ≤30 ms błędu (po D2, E1).
- **F3** Double-ender natywny: dryf liczony regresją klatek vs monotoniczny zegar sprzętowy lokalnie u każdego uczestnika — offset ≤2 ms, dryf szczątkowy ≤1 ms na 3 h (po D1, B1).
- **F4** Separacja na własnych wagach (dec. 19) — SDR wokalu ≥8,5 dB na własnym zestawie testowym.
- **F5** Enhancement: WPE (MIT) + LoRA dereverb na architekturze Roformer, wagi własne.

## 6. Co z istniejącym kodem

| Zostaje (przenoszone do rdzenia) | Ginie |
|---|---|
| Normalizacja CMND zgodna z równ. (8) de Cheveigné & Kawahara; stałe okno całkowania W; interpolacja paraboliczna; `noteToFrequency` | `lib/fft-analyzer.ts` — naiwny DFT O(N²), 26,9 ms/ramkę, w trybie **domyślnym** |
| Architektura wielohipotezowa trybu Pro (koncepcja poprawna — wymieniamy cechy i wagi) | Filtry antyharmoniczne (martwy kod, idea szkodliwa: kasują kandydata, którego dekoder potrzebuje); blokada skoku >5 półtonów (zatrzaskuje błąd oktawowy); `harmonicScore` + `WEIGHTS` z 50% stałych |
| Histereza z asymetryczną karą (−1/−5) z Hit the Note — zmieniamy **tylko jednostkę**: ramki → sekundy | Globalny mutowalny stan detektora; `AnalyserNode` + rAF jako tor analizy; O(n²) kopiowanie `pitchHistory` + setState per klatka |
| `lib/midi-parser.ts` (running status, VLQ, mapa tempa, transpozycja jako czysta funkcja) | `pitchHistory` w localStorage; base64 dataURL między ekranami; trzy niezależne bazy IndexedDB |
| `lib/guitar.ts`, `lib/automation.ts`, `lib/project-templates.ts`, topologia channel stripa, `setTargetAtTime` zamiast `.value` | Karaoke na iframe YouTube (ślepy zaułek natywny i blokada COEP `require-corp`) |
| Wzorzec antysprzężeniowy z gry akordowej; zatrzymywanie czasu na ciszy w sing-along; podział hook/komponent w grach | 16-bit bez ditheringu i limitera przy `outputGain` 1,25; dialog zapisu żyjący w nawigacji desktopowej |
| Enkoder WAV; `lib/audio-storage.ts` jako referencja migracji | 9 duplikatów tras (`/train`+`/training` ×4, `/progress`+`/library/progress`, `/studio`+`/edit/studio`, `/karaoke`+`/record/karaoke`, `/library`+`/sessions`) → **20 tras kanonicznych, 9 przekierowań 301** |

**Migracja użytkowników:** jednorazowy import przy pierwszym uruchomieniu — sesje z localStorage i trzech baz IndexedDB stają się Ujęciami z `analyzerVersion: legacy` i flagą `lowConfidence: true`. Stare wyniki widoczne obok przeliczonych, ale **nie wchodzą do dopasowania trendu**; na wykresie oznaczone „zmierzone starym detektorem". Jeden komunikat: „poprawiliśmy pomiar, przeliczyliśmy Twoje sesje", z podglądem obu wersji. Audio nie migruje, bo nie istnieje.

## 7. Ryzyka i pomiary, którymi je zbijamy

| Ryzyko | Pomiar |
|---|---|
| **Zaufanie jest binarne** — jeden fałszywy werdykt unieważnia wszystkie | Bramka A2: zero błędów oktawowych na gamie C3–C5 i skokach oktawowych u wyszkolonego śpiewaka |
| Referencja adaptacyjna wchłania fałsz (residuum → 0, wszyscy dostają 95%) | Symulacja z rosnącym rozrzutem; próg MAD, przy którym residuum przestaje maleć; powyżej — zamrożenie O(t) (hipoteza startowa 40¢) |
| Własne wagi F0 na starcie gorsze od RMVPE | Tor klasyczny jest w pełni funkcjonalny **sam**; sieć wchodzi za flagą z A/B; VocalSet trafia do treningu **także jako oryginalne audio**, z etykietami ważonymi zgodnością ensemble'u |
| Bit-exactness rdzenia ≠ parytet produktu (trzy tory akwizycji) | Bramka bitowa działa na plikach WAV i tak jest opisana; parytet mierzymy osobno: ten sam materiał z głośnika, 3 platformy, metryki MIR |
| Ujęcia low-confidence produkują „pogorszyłeś się" | `lowConfidence` (SNR, wykryte AGC, brak kalibracji) wyklucza z trendu **z jawnym licznikiem** („12 sesji, 4 zbyt zaszumione") i linkiem do liczb; przy >30% — normalizacja względem zmierzonego SNR zamiast wykluczania |
| Bas 70 Hz (3 okresy w oknie); falset i głos dziecięcy — słaby punkt wszystkich modeli | Obowiązkowe pokrycie w C3; **osobne raportowanie metryk per typ głosu**; test sprawiedliwości: rozrzut median ≤4 pkt |
| Usuwanie wypełniaczy klasy A kasuje delecje ASR (luka to wypełniacz ALBO brakujące słowo) | Drugi przebieg ASR na luce z paddingiem 200 ms + monotoniczność formantów; token „możliwe brakujące słowo" zamiast usunięcia; precyzja ≥97% |
| Sufit ludzki poniżej poprzeczki scoringu | S8 przed zamrożeniem poprzeczki; ρ ≥ 0,90 × ICC |
| Interleaving pogarsza wynik w sesji, poprawiając retencję | Jawny komunikat w UI + pomiar **retencji po 4 tygodniach**, nie satysfakcji |
| Licencje wag jako mina (MUSDB18-HQ, ROSVOT, FSD50K) | `docs/licensing.md` z SHA-256 jako warunek każdego treningu; własne wagi wszędzie, gdzie pochodzenie jest niepewne |

## 8. Co rozstrzygamy pomiarem przed zamrożeniem parametru

| Parametr | Pomiar rozstrzygający |
|---|---|
| Rozmiar bloku i hop | S4 (Oboe daje 96–512 ramek, AudioWorklet 128) |
| Lag Viterbiego: L=12 vs 24 ramki | A/B na realnych śpiewakach — responsywność vs octave error; wariant adaptacyjny zależny od tego, czy użytkownik trzyma nutę, czy robi pasaż |
| Realny MAD centów początkującego w jego tessiturze | 30 nagrań onboardingowych — na tej liczbie stoi cała drabina trudności |
| Czy zamilknięcie referencji na L3 jest skokiem, czy ścianą | Współczynnik przejścia L2→L3 w produkcji |
| Czy adnotacje Annotated-VocalSet są ludzkie, czy algorytmiczne | Lektura metodologii + ręczna kontrola 200 nut |
| Czy `wasi-sdk ≥33` linkuje signalsmith-stretch obok Rust std dla `wasm32-wasip1` | Liczba modułów wasm w tierze offline |