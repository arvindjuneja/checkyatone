# Plan przebudowy — architektura platformy, zakres filarów, mapa drogowa

> Sekcja decyzyjna. Wszystkie liczby w tabelach LOC, licencji i zależności zweryfikowałem bezpośrednio na repo (`wc -l`, grep po importach, `package.json`). Liczby wydajnościowe pochodzą z audytu/researchu i są oznaczone źródłem.

---

## 1. Inwentaryzacja istniejącego kodu

Stan wejściowy: **21 617 LOC** w `app/ components/ hooks/ lib/ contexts/`, 29 tras `page.tsx`, 46 zależności runtime, **0 testów, 0 CI, `npm run lint` nie startuje** (brak `eslint` w `devDependencies`).

Legenda werdyktów: **ZOSTAW** = przenieść bez zmian merytorycznych · **PRZERÓB** = zachować pomysł/dane, wymienić implementację · **PRZEPISZ** = zachować tylko wiedzę, kod do wyrzucenia · **SKASUJ** = usunąć teraz.

### 1.1 Warstwa DSP i analizy (rdzeń IP)

| Moduł | LOC | Co robi | Dojrzałość | Werdykt | Filar |
|---|---|---|---|---|---|
| `lib/pitch-detector.ts` | 285 | YIN: funkcja różnicowa, CMND, interpolacja paraboliczna, scoring kandydatów, wygładzanie | prototyp z poprawnym rdzeniem (~60 LOC) i zepsutą warstwą decyzyjną | **PRZEPISZ** (zachowaj CMND + interpolację + `noteToFrequency`) | wspólne |
| `lib/pitch-detector-pro.ts` | 332 | multi-hypothesis: harmonicConsistency 0.4, temporalStability 0.3, userRangeMatch 0.2, confidence 0.1 | prototyp; szkielet słuszny, cechy i wagi bezwartościowe, prior samozwrotny | **PRZEPISZ** (szkielet zostaje, cechy do wymiany) | wspólne |
| `lib/fft-analyzer.ts` | 159 | naiwny DFT O(N²), 2,1 mln iteracji/ramkę | **najdroższy zmierzony defekt w repo**: 25,84 ms/ramkę na Apple M5 (weryfikator) | **PRZEPISZ** → radix-2 FFT / `realfft` | wspólne |
| `lib/midi-parser.ts` | 440 | własny parser MIDI: running status, VLQ, mapa tempa, tracki, transpozycja | działa; 2 defekty (ignoruje zmiany tempa poza pierwszą, brak obsługi SMPTE `0x8000`) | **PRZERÓB** — jedyny plik lib/ do zachowania niemal 1:1 | Train / Sing |
| `lib/automation.ts` | 318 | krzywe automatyki, smoothstep, denormalizacja | czysta matematyka, 0 API przeglądarki | **PRZERÓB** (volume w dB, nie liniowo; usuń `createDuckCurve`, `normalizeValue`) | Podcast |
| `lib/guitar.ts` | 340 | stroje, akordy, przeliczanie centów, `playTone` | dane czyste, tylko 2 funkcje dotykają AudioContext | **PRZERÓB** → dane do `content/*.json` | Narzędzia |
| `lib/audio-synth.ts` | 359 | oscylatory, obwiednie, 8 ćwiczeń jako literal TS | prototyp; nigdy nie woła `resume()` → na `/train/*` po odświeżeniu **cisza** | **PRZEPISZ**; ćwiczenia → JSON | Train |
| `lib/audio-processor.ts` | 334 | offline chain kompresor→EQ×3→reverb→gain, WAV export | jedyny działający renderer; brak limitera, ucięty ogon reverbu, `data=[]` per próbka | **PRZEPISZ** (presety jako dane zostają) | Sing / Podcast |
| `lib/track-processor.ts` | 216 | per-track EQ 3-pasm + volume + pan, `setTargetAtTime` | topologia sensowna, częstotliwości niespójne z `audio-processor` (320/1k/3200 vs 200/1k/3000) | **PRZEPISZ** | Podcast |

### 1.2 Silnik audio, storage, stan

| Moduł | LOC | Co robi | Dojrzałość | Werdykt | Filar |
|---|---|---|---|---|---|
| `lib/multi-track-engine.ts` | 637 | schedulowanie klipów na zegarze AudioContext, mute/solo, automatyka przez rAF | prototyp; brak `resume()`, `mixToBuffer` operuje na złym kluczu, 40% pliku osiągalne tylko z martwego komponentu | **PRZEPISZ** (model schedulowania jest poprawny) | Podcast |
| `lib/multi-track-storage.ts` | 824 | IndexedDB v3: projects/tracks/audioSources/clips/automationLanes | prototyp; blob w rekordzie, brak GC, `deleteProject` zostawia 4 osierocone store'y | **PRZEPISZ** (schema `AudioClip`/`AudioSource` zostaje) | Podcast |
| `lib/audio-storage.ts` | 131 | IndexedDB dla blobów sesji, czyste API save/get/delete/has | API przenośne, implementacja nie; magazyn de facto **zawsze puste** (MediaRecorder nie startuje) | **PRZERÓB** (interfejs → OPFS) | wspólne |
| `lib/project-templates.ts` | 279 | szablony projektów jako dane + osobna baza IndexedDB | dane czyste; trzecia baza IDB bez powodu | **PRZERÓB** → JSON | Podcast |
| `hooks/use-audio-recorder.ts` | 229 | getUserMedia + AnalyserNode + rAF + YIN, historia pitchu | prototyp; stale closure (Pauza nie pauzuje), `[...tab, x]` co ramkę, brak resetu stanu detektora | **PRZEPISZ** | wspólne |
| `hooks/use-audio-recording.ts` | 81 | MediaRecorder → Blob | **de facto martwy** — jedyny wywołujący ma warunek zawsze `false` | **PRZEPISZ** | wspólne |
| `contexts/audio-recorder-context.tsx` | 133 | spina oba hooki, drugie `getUserMedia({audio:true})` | prototyp; źródło błędu krytycznego #1 — audio nigdy nie jest nagrywane | **PRZEPISZ** | wspólne |
| `hooks/use-session-library.ts` | 219 | sesje w localStorage z pełnym `pitchHistory` | prototyp; ~400 kB/min → limit 5 MB pada po ~11 min łącznych nagrań, cicha utrata | **PRZEPISZ** | wspólne |
| `hooks/use-voice-profile.ts` | 180 | profil głosu, debounce 500 ms, min/max F0 | mechanika zapisu OK, statystyka zła (monotoniczne rozszerzanie min/max z błędnych oktaw) | **PRZEPISZ** | Train |
| `hooks/use-vocal-range.ts` | 137 | zakres głosu; **dwie kopie tej samej logiki** (`useVocalRange` martwa) | prototyp; skrajne próbki bez percentyli, `suggestVoiceType` zwraca `matches[0]` zamiast najlepszego | **PRZEPISZ** | Train |

### 1.3 Filar TRAIN

| Moduł | LOC | Co robi | Dojrzałość | Werdykt | Filar |
|---|---|---|---|---|---|
| `hooks/use-training-mode.ts` | 223 | ocena ćwiczenia: proporcjonalne rozciągnięcie nagrania na siatkę nut | prototyp; wzorzec grany z przerwą 300 ms, siatka liczona bez niej → ostatnie nuty przesunięte o ~2 nuty | **PRZEPISZ** | Train |
| `components/training-mode.tsx` | 511 | UI ćwiczeń | dziura: przyciski „pojedyncza nuta" aktywne w fazie recording → ton wzorcowy wpada do `recordedPitches` | **PRZERÓB** | Train |
| `hooks/use-hit-the-note-game.ts` | 314 | gra: 100 kolejnych ramek | prototyp; próg zależy od odświeżania ekranu (1,67 s @60 Hz, 0,83 s @120 Hz vs „3 s" w UI) | **PRZERÓB** (histereza to dobry pomysł, jednostka zła) | Train |
| `components/hit-the-note-game.tsx` | 517 | UI gry | działa; brak guard na `isPlayingNote` → 3× „Powtórz nutę" = zaliczone bez śpiewania | **PRZERÓB** | Train |
| `hooks/use-hit-the-chord-game.ts` | 331 | gra akordowa | **ocenia polifonię detektorem monofonicznym**; Set trafionych nut bez wygasania; jedyny poprawny anty-sprzężeniowy wzorzec w repo | **SKASUJ** (zachowaj `pauseListeningDuringPlayback`) | wyciąć |
| `components/hit-the-chord-game.tsx` | 519 | UI gry akordowej | j.w. | **SKASUJ** | wyciąć |
| `hooks/use-sing-along.ts` | 411 | sing-along; `score` zerowany i nigdy nieustawiany, transpozycja kumuluje się | prototyp; **nie odtwarza dźwięku** — piano-roll sterowany głosem | **PRZEPISZ** (pomysł „czas płynie gdy śpiewasz" zachować) | Train |
| `components/sing-along.tsx` | 906 | piano-roll na Canvas, wybór ścieżki wokalnej, upload MIDI | najlepsza wizualizacja w repo; lista utworów to pusta tablica | **PRZERÓB** | Train |
| `components/pitch-visualizer.tsx` | 376 | wykres pitchu w czasie | rysuje 2× na ramkę, 4 pełne przejścia po rosnącej historii | **PRZEPISZ** (dual-view + LOD) | Train |
| `components/circle-visualizer.tsx` | 393 | wizualizacja kołowa | ignoruje oktawę → zła klasa wizualizacji do intonacji | **SKASUJ** | wyciąć |
| `components/current-note-display.tsx` | 154 | bieżąca nuta + „dokładność" liczona do najbliższego półtonu | metryka bez celu dydaktycznego | **PRZEPISZ** | Train |
| `components/timeline-analysis.tsx` | 406 | jedyna wizualizacja licząca czas **względnie** do pierwszej próbki | poprawna, renderuje zapisane sesje | **ZOSTAW** (jedyny komponent wizualizacji do zachowania) | Train |
| `components/progress-charts.tsx` | 207 | wykresy postępu (recharts) | działa; karmiony bezwartościową metryką i gałęziami trybów, które nigdy nie powstają | **PRZERÓB** (nowe źródło danych, `recharts` do wymiany na LOD) | Train |
| `components/vocal-range-display.tsx` | 124 | zakres głosu | **zawsze pusty** — dostaje metadane bez `pitchHistory` | **PRZERÓB** | Train |
| `components/audio-settings.tsx` | 130 | czułość, wzmocnienie, tryb detekcji | „Przywróć domyślne" ustawia 0.001, domyślna to 0.002; suwak czułości niszczy porównywalność sesji | **PRZEPISZ** → kalibracja mikrofonu | wspólne |
| `components/recording-controls.tsx` | 126 | start/stop/pauza | Pauza pokazuje stan, nie pauzuje | **PRZERÓB** | wspólne |

### 1.4 Filar SING (karaoke) i edytor

| Moduł | LOC | Co robi | Dojrzałość | Werdykt | Filar |
|---|---|---|---|---|---|
| `app/record/karaoke/page.tsx` | 532 | YouTube iframe + równoległe nagrywanie mikrofonu | prototyp; **zero kompensacji latencji**, brak `seekTo(0)`, brak cleanupu (mikrofon zostaje otwarty), `mimeType:"audio/webm"` = crash na iOS, własna błędna konwersja Hz→nuta (oktawa niżej), sesje nigdy niezapisywane | **PRZEPISZ** od zera, bez YouTube | Sing |
| `app/edit/studio/page.tsx` | **1197** (największy plik) | quick studio: wczytaj/nagraj → efekty → eksport | prototyp; 0 cleanupów w całym pliku, 8× `createObjectURL` na 1 `revoke`, race czyszcząca świeże nagranie, podgląd bez reverbu | **PRZEPISZ** | Sing |
| `components/interactive-waveform.tsx` | 466 | wavesurfer + regiony + cięcie | **undo kasuje audio bezpowrotnie**, drugie cięcie niszczy złe miejsce | **PRZEPISZ** (wavesurfer.js do wyrzucenia — webonly) | Podcast |
| `components/waveform-display.tsx` | 80 | prosty canvas waveformu | prop `height` przesłonięty | **PRZEPISZ** → LOD renderer | wspólne |
| `components/save-session-dialog.tsx` | 134 | dialog zapisu | zamyka się jak przy sukcesie także gdy `sessionId === null` | **PRZERÓB** | wspólne |

### 1.5 Filar PODCAST (multitrack)

| Moduł | LOC | Co robi | Dojrzałość | Werdykt | Filar |
|---|---|---|---|---|---|
| `components/timeline/multi-track-timeline.tsx` | 659 | żywy timeline: klipy, drag, trim, automatyka | prototyp; **brak undo/redo**, brak eksportu, zapis do IndexedDB na każdy `scroll` i `mousemove`, 4 niezależne błędy geometrii (playhead/linijka/klipy się nie pokrywają) | **PRZEPISZ** | Podcast |
| `components/timeline/audio-clip.tsx` | 257 | klip + waveform na canvas | canvas przekracza limit 65 535 px już przy klipie 5,5 min (domyślny zoom, dpr=2) | **PRZEPISZ** | Podcast |
| `components/timeline/track-lane.tsx` | 258 | ścieżka: mute/solo/delete | **brak faderów volume/pan/EQ** — silnik je ma, UI nie | **PRZEPISZ** | Podcast |
| `components/timeline/automation-lane.tsx` + `automation-point.tsx` | 399 | krzywe automatyki (SVG) | podwójna kompensacja `scrollX` → punkty lądują w złym czasie | **PRZEPISZ** | Podcast |
| `components/timeline/playhead.tsx`, `time-ruler.tsx` | 191 | głowica, linijka | oba z błędami offsetu (160 px / podwójny scroll) | **PRZEPISZ** | Podcast |
| `app/edit/projects/page.tsx` | 427 | lista projektów + montaż timeline'u | działa jako shell | **PRZERÓB** | Podcast |
| `components/template-card.tsx` | 85 | karta szablonu | OK | **ZOSTAW** | Podcast |

### 1.6 Moduł gitarowy

| Moduł | LOC | Co robi | Dojrzałość | Werdykt | Filar |
|---|---|---|---|---|---|
| `components/metronome.tsx` | 308 | metronom, poprawnie woła `resume()` | **działa** — jeden z niewielu takich modułów | **ZOSTAW** (przenieść pod nowy audio-io) | Narzędzia |
| `components/guitar-tuner.tsx` | 357 | tuner: **druga, niezależna implementacja detekcji F0** (autokorelacja z MDN) | prototyp; A/A#/B pokazywane o oktawę wyżej (struna A2 → „A3") | **PRZEPISZ** → cienkie UI nad rdzeniem F0 | Narzędzia |
| `app/guitar/page.tsx` + `tuner` + `metronome` + `game` | 191 | 4 trasy modułu gitarowego | `game` = gra akordowa (do wycięcia) | **PRZERÓB** → `/tools/*`, `game` **SKASUJ** | Narzędzia |

### 1.7 Nawigacja, layout, infrastruktura

| Moduł | LOC | Co robi | Dojrzałość | Werdykt | Filar |
|---|---|---|---|---|---|
| `components/desktop-navigation.tsx` | 256 | nawigacja **+ autozapis sesji** (!) | prototyp; autozapis w komponencie nawigacji → na mobile sesje z `/train/*` nie zapisują się w ogóle; `hasAudio: true` na sztywno; `sessionType` z nieistniejącej ścieżki `/training`; od 2. nagrania czas w ms zapisywany jako s | **PRZEPISZ** (autozapis WYJĄĆ do warstwy sesji) | wspólne |
| `components/mobile-navigation.tsx` | 76 | linki | brak jakiejkolwiek logiki zapisu | **PRZERÓB** | wspólne |
| `app/template.tsx` | ~40 | wybór layoutu po `innerWidth >= 1024` | remontuje nawigację przy każdej nawigacji; `isDesktop` startuje `false` → przebłysk mobilnego UI | **PRZEPISZ** | wspólne |
| `app/layout.tsx` | ~60 | provider + gtag + `@vercel/analytics` | `@vercel/analytics` na Cloudflare nie robi nic | **PRZERÓB** | wspólne |
| `components/ui/{button,dialog,tabs,alert}.tsx` | ~350 | shadcn | używane | **ZOSTAW** | wspólne |
| `lib/utils.ts`, `lib/analytics.ts` | 60 | cn(), gtag | OK | **ZOSTAW** | wspólne |
| `app/page.tsx` | 306 | strona główna | działa, do przeprojektowania pod 3 filary | **PRZERÓB** | wspólne |
| `app/settings/page.tsx` | 293 | ustawienia | działa | **PRZERÓB** | wspólne |
| `app/library/*` (3 trasy) | 753 | biblioteka, sesja, postępy | działa jako shell; filtry „Trening"/„Karaoke" strukturalnie martwe | **PRZERÓB** | wspólne |
| `app/record/live/page.tsx` | 309 | free practice | działa; podwójny zapis na desktopie | **PRZERÓB** | Train |
| `app/train/*` (4 trasy) | ~250 | huby TRAIN | shell OK | **PRZERÓB** | Train |
| `next.config.ts` | 12 | `output:'export'`, `reactStrictMode:false` | `reactStrictMode:false` maskuje dokładnie te bugi cyklu życia, których jest tu najwięcej | **PRZERÓB** (strict mode ON po etapie 0) | wspólne |

### 1.8 DO SKASOWANIA — lista wykonawcza

**Martwe komponenty i hooki (0 importerów — zweryfikowane grepem):**
```
components/session-library.tsx          400 LOC   0 importerów
components/audio-playback.tsx           171 LOC   tylko z martwego session-library
components/multi-track-manager.tsx      461 LOC   0 importerów
components/track-controls.tsx           238 LOC   tylko z martwego multi-track-manager
components/training-hub.tsx             194 LOC   0 importerów
hooks/use-hotkeys.ts                     64 LOC   0 importerów
components/ui/card.tsx                   75 LOC   0 importerów
components/ui/command.tsx               155 LOC   0 importerów (jedyny konsument cmdk)
```

**Stuby tras po dwóch przemianowaniach IA (10 tras, każda osobna prerenderowana strona w `/out`):**
```
app/training/page.tsx  app/training/exercises/page.tsx  app/training/game/page.tsx
app/training/singalong/page.tsx  app/progress/page.tsx  app/sessions/page.tsx
app/analysis/page.tsx  app/karaoke/page.tsx  app/about/page.tsx  app/studio/page.tsx
```

**Huby-sieroty (nielinkowane z żadnej nawigacji):**
```
app/record/page.tsx    64 LOC
app/edit/page.tsx      64 LOC
```

**Gra akordowa (nienaprawialna monofonicznym detektorem):**
```
components/hit-the-chord-game.tsx   519 LOC
hooks/use-hit-the-chord-game.ts     331 LOC   (zachowaj wzorzec pauseListeningDuringPlayback)
app/guitar/game/page.tsx             41 LOC
components/circle-visualizer.tsx    393 LOC   (ignoruje oktawę)
```

**Assety:**
```
public/file.svg  public/globe.svg  public/next.svg  public/vercel.svg  public/window.svg
public/Aha_-_Take_On_Me.mid            (duplikat "A HA.Take on me K.mid")
public/screen.jpg                       174 kB — zweryfikować użycie
```
Pozostałe `.mid` — jeśli mają zostać, **nazwy muszą być URL-safe** (`parseMidiFile` robi goły `fetch(url)`, spacje w nazwach ją wywalą).

**Martwy kod wewnątrz żywych plików:**
```
lib/pitch-detector.ts:27-30      console.log w hot pathie (10% ramek)
lib/pitch-detector.ts:111-138    oba filtry antyharmoniczne — warunek nieosiągalny
lib/pitch-detector.ts:204        gate confidence < 0.7 — nieosiągalny (kandydaci mają d' < 0.25)
lib/pitch-detector.ts:210-229    blok blokady oktawowej — CAŁY (usunięcie samego `> 5` nic nie da, jest zawsze prawdziwe)
lib/pitch-detector-pro.ts:58,62,294   previousFrequencyPro — 3 zapisy, 0 odczytów
lib/pitch-detector-pro.ts:285    gate confidence < 0.6 — nieosiągalny
lib/pitch-detector-pro.ts:309-332     detectPitchProWithNote — eksport bez konsumenta
lib/fft-analyzer.ts:133-159      computeHarmonicRatio — 0 wywołań
lib/automation.ts:147-162, 286-318    normalizeValue, createDuckCurve — 0 wywołań
lib/track-processor.ts:104-105, 198-216   lastLogTime (globalny), getProcessorValue
lib/audio-synth.ts:26, 117       getIsPlaying, playTone (legacy)
lib/multi-track-storage.ts:12,65-67,97,111,166-169   TEMPLATES_STORE, loop*, Track.clips, useTimeline
lib/multi-track-engine.ts:14-17  trackGains/trackPanners "legacy compatibility"
hooks/use-sing-along.ts:271-275  processNoPitch — puste ciało, eksportowane
hooks/use-vocal-range.ts:51-92   useVocalRange — duplikat getVocalRangeFromSessions
```

**Zależności npm — 37 z 46 do usunięcia** (zweryfikowane grepem po importach w `app/ components/ hooks/ lib/ contexts/`):

| Kategoria | Pakiety | Trafień |
|---|---|---|
| Radix UI nieużywane | `accordion, alert-dialog, aspect-ratio, avatar, checkbox, collapsible, context-menu, dropdown-menu, hover-card, label, menubar, navigation-menu, popover, progress, radio-group, scroll-area, select, separator, slider, switch, toast, toggle, toggle-group, tooltip` (24 pakiety) | 0 |
| Formularze/daty/UI nieużywane | `@hookform/resolvers, react-hook-form, zod, date-fns, react-day-picker, embla-carousel-react, input-otp, next-themes, react-resizable-panels, sonner, vaul` (11) | 0 |
| Używane tylko przez martwy kod | `cmdk` (tylko `ui/command.tsx`) | 1 |
| No-op na docelowym hostingu | `@vercel/analytics` (Cloudflare Pages nie ma `/_vercel/insights/*`) | 1 |

Zostają: `next, react, react-dom, lucide-react, clsx, tailwind-merge, class-variance-authority, @radix-ui/react-{slot,dialog,tabs}, wavesurfer.js` (do wymiany w etapie 6), `recharts` (do wymiany), `autoprefixer`, `postcss`, `tailwindcss`.

**Bilans:** hard delete ≈ **2 900 LOC (13,4%)** + 37 zależności. Do przepisania ≈ **16 000 LOC**. Do zachowania merytorycznie ≈ **2 700 LOC** (`midi-parser`, `automation`, dane `guitar`/`templates`, `timeline-analysis`, `metronome`, `ui/`, shelle tras). To jest **przepisanie z odzyskiem**, nie refaktor — i tak trzeba to nazwać.

---

## 2. Docelowa architektura

### 2.1 Zasada podziału

Jedna reguła, egzekwowalna przez lint i CI:

> **Wszystko, co produkuje LICZBĘ WIDZIANĄ PRZEZ UŻYTKOWNIKA (F0, centy, LUFS, wynik ćwiczenia, granica nuty) żyje w przenośnym rdzeniu. Wszystko, co produkuje EKRAN, żyje w warstwie platformy. Wszystko pomiędzy (ćwiczenia, presety, stroje, szablony) jest DANYMI w JSON, nie kodem.**

Reguła „dane, nie kod" nie jest kosmetyką: dziś dodanie jednego ćwiczenia wymaga rekompilacji, a po wejściu na App Store wymagałoby **review Apple za dodanie jednej gamy**.

### 2.2 Struktura repo

```
voice/                                   # jedno repo: npm workspaces + cargo workspace
├─ core/                                 # Rust workspace → wasm32 + iOS staticlib + Android cdylib
│  ├─ core-dsp/          # FFT (realfft), biquady, gate/expander, adaptive leveler,
│  │                     # de-esser, kompresor, limiter true-peak, LUFS BS.1770-4, resampler
│  ├─ core-pitch/        # pYIN: kandydaci + Viterbi + segmentacja nut + vibrato
│  │                     # BEZ stanu modułowego — createTracker(config) -> instancja
│  ├─ core-score/        # metryki intonacji (offset/rozrzut/dryf/interwał), ocena ćwiczenia
│  ├─ core-edl/          # model projektu, operacje na klipach, graf renderu offline
│  └─ core-ffi/          # extern "C" + cbindgen (native) | wasm-bindgen (web)
├─ packages/
│  ├─ audio-io/          # adapter przechwytywania per platforma (jedyne miejsce z API platformy)
│  ├─ content/           # exercises.json, presets.json, tunings.json, chords.json, templates.json
│  └─ ui-kit/            # shadcn + tokeny kolorów (Okabe-Ito), współdzielone przez web/WebView
├─ apps/
│  ├─ web/               # Next.js static export — obecna aplikacja, przeorganizowana
│  ├─ mobile/            # etap 7: Capacitor + 2 natywne pluginy
│  ├─ ios/               # opcjonalnie później: SwiftUI shell
│  └─ android/           # opcjonalnie później: Compose shell
└─ tools/
   └─ eval/              # harness golden-testów: korpus + metryki + baseline.json
```

### 2.3 Kontrakt granicy

Granica jest **płaska i wąska** — maks. ~25 funkcji, tylko typy POD:

```c
// RT: wołane z callbacku audio. Zero alokacji, zero mutexów, zero logowania, zero syscalli.
void  vc_process(VcHandle*, const float* in, uint32_t frames);
// UI: drenaż z prędkością 60 Hz (rAF / CADisplayLink / Choreographer)
uint32_t vc_drain_events(VcHandle*, VcEvent* out, uint32_t cap);
// konfiguracja: jeden atomowy swap, nigdy mutowanie stanu z UI
void  vc_set_params(VcHandle*, const VcParams*);
// offline: ta sama arytmetyka, bez ograniczeń czasowych
int32_t vc_analyze_buffer(const float* pcm, uint32_t n, uint32_t sr, VcFrame* out, uint32_t cap);
int32_t vc_render(const VcRenderSpec*, float* out, uint32_t n);
```

Zdarzenia jako POD: `F0Frame{t_ns, f0_hz, cents, conf, rms_dbfs, voiced}`, `NoteEvent{onset_ns, offset_ns, center_cents, dev_cents, vibrato_rate, vibrato_extent}`, `Meter{peak, rms, lufs_s}`, `ScoreDelta{...}`.

**Warunek testowalności:** `vc_process` podane tą samą sekwencją ramek co `vc_analyze_buffer` musi dać **bit-identyczny** wynik na jednej platformie. Bez tego harness offline mierzy inny algorytm niż ten, który słyszy użytkownik.

### 2.4 Rekomendacja główna: Rust, ale zakres rosnący etapami

| Etap | Co wchodzi do `core/` | Dlaczego wtedy |
|---|---|---|
| 1 | FFT + biquady + resampler | naiwny DFT to najdroższy zmierzony defekt (25,84 ms/ramkę na M5) — poprawia go FFT, nie zmiana języka |
| 2 | `core-pitch` (pYIN + Viterbi + segmentacja) | to jest IP i to jest miejsce, gdzie „analiza jest niedoskonała" |
| 4 | `core-dsp` chain + LUFS + render offline | nowy kod — nie ma czego portować, więc od razu w rdzeniu |
| 3/5 | `core-score`, `core-edl` | najpierw jako czysty TypeScript pod golden-testami, port mechaniczny gdy pojawi się shell natywny |

**Nie kopiuję planu „70–80% LOC w Rust od razu".** Kontr-researcher ma rację: przy hop 512 (10,7 ms) i budżecie 30–80 ms na feedback wizualny masz 3–7 hopów zapasu — jedyny kod, który *musi* być bez GC, to skopiowanie próbek z callbacku do ring buffera (~50 LOC/platformę). Scoring i EDL to arytmetyka na danych, portowalna mechanicznie **jeśli masz golden-testy**. Plan „przepisz wszystko na Rust najpierw" kosztuje ~2 miesiące bez widocznej funkcji, a historia repo (60 commitów w 14 dni → 6 miesięcy ciszy) mówi wprost, że tak długiego okresu bez efektu ten projekt nie przetrwa.

**Bindingi: `extern "C"` + cbindgen, NIE uniffi.** uniffi zarabia na bogatych typach (enumy z payloadem, async, callback interfaces) — przy granicy POD daje tylko warstwę codegenu do utrzymania, jest jawnie przed 1.0 („a long way from a 1.0 release"), a jego backend WASM to third-party. Swift woła C bezpośrednio przez modulemap, Android przez ~100 LOC JNI albo ten sam C ABI z NDK, web przez wasm-bindgen.

**Konkrety buildu:**
- `wasm32-unknown-unknown`, **SIMD tak** (`-C target-feature=+simd128`; Safari 16.4+), **relaxed-SIMD nie** (brak w Safari)
- **Bez `SharedArrayBuffer`, bez wasm-threads → bez COOP/COEP.** Host to Cloudflare (potwierdzone: `server: cloudflare`), więc nagłówki *dałoby się* ustawić plikiem `_headers` — ale `COEP: require-corp` wywala gtag i każdy embed cross-origin, a `credentialless` nie istnieje w Safari. Przy drenażu małych zdarzeń POD raz na rAF `postMessage` z transferem `ArrayBuffer` wystarcza w pełni. To czysty zysk, nie kompromis.
- `panic=abort`, `lto=fat`, `wasm-opt -Oz`. Budżet: **`.wasm` rdzenia < 400 kB brotli.**
- **Zakaz `fast-math`** — łamie powtarzalność między WASM/ARM/x86, czyli unieważnia golden-testy.
- Ładowanie w AudioWorklecie: w `AudioWorkletGlobalScope` **nie ma `fetch`** — `WebAssembly.Module` kompilujesz na głównym wątku i przesyłasz przez `postMessage`, instancjonujesz w konstruktorze procesora. To pierwszy realny blocker etapu 1, warto go zdjąć spike'em (2 dni) przed planowaniem reszty.

### 2.5 Plan B

**Trigger:** jeśli po **2 tygodniach** CI (wasm + XCFramework + cargo-ndk) nie jest zielone, albo jeśli okaże się potrzebny algorytm istniejący tylko w C/C++.

**Plan B: rdzeń C++17 → Emscripten (web) + linkowanie natywne (iOS/Android).** Uzasadnienie: głębszy ekosystem audio, a trzy z czterech bibliotek, które i tak wciągniesz, są w C: **Signalsmith Stretch** (MIT, header-only, pitch shift z kompensacją formantów), **libebur128** (MIT, LUFS — ale porzucona, ostatni commit 2021-02-14, więc i tak wendorujesz kopię), **RNNoise v0.2** (BSD-3, 48 kHz natywnie, ~0,04 GMACs). Koszt Planu B: brak bezpieczeństwa pamięci przy jednej osobie i zerze testów — dlatego to plan B, nie A.

**Uwaga o ryzyku doboru narzędzia:** nie znalazłem publicznie opisanego komercyjnego produktu mobilnego z rdzeniem **RT-audio** w Rust. Wzorzec Rust core + wasm + FFI jest potwierdzony (libsignal, Bitwarden SDK, Mozilla app-services, Automerge), ale w domenach krypto/CRDT/telemetrii. Standardem branżowym dla wątku audio pozostaje C/C++. Ryzyko jest realne i dlatego Plan B ma jasny trigger, a nie „zobaczymy".

### 2.6 Czego NIE robimy

| Odrzucone | Dlaczego |
|---|---|
| Graf z węzłów Web Audio (`DynamicsCompressorNode`, `BiquadFilterNode`, `ConvolverNode`) jako łańcuch DSP | brak makeup gain, przeglądarkozależne zachowanie, brak odpowiednika na iOS/Android → przepisujesz i brzmi inaczej. **To jest ten „ślepy zaułek Web Audio API".** Web Audio zostaje wyłącznie jako **host**: `AudioContext`, `AudioWorkletNode`, `MediaStreamAudioSourceNode`, `AudioBuffer`, `OfflineAudioContext` |
| Wspólne UI (Compose MP / Flutter / RN) jako rozwiązanie problemu audio | w każdym z nich wątek RT i tak musi być natywny/C++/Rust — wspólny rdzeń jest warunkiem koniecznym niezależnie od UI. Dodatkowo: Compose MP Web to Beta i regresja wobec static exportu; Flutter nie ma dojrzałego low-latency capture; RN dokłada Turbo Modules, w których i tak piszesz Swift/Kotlin |
| `wavesurfer.js`, `recharts` długoterminowo | webonly, nie skalują się na multitrack i 3-godzinne nagrania. Zastąpić własnym rendererem na piramidzie LOD (min/max per bucket, poziomy 1:256/1:2048/1:16384; **~28 MB dla 3h × 3 ścieżek**) |
| `AnalyserNode` + `requestAnimationFrame` jako źródło ramek | rAF to zegar KLATEK OBRAZU. Dziś efektywny hop to jedna ramka animacji (~16,7 ms, pod obciążeniem 30–60 ms), ramki nie są ciągłe (`getFloatTimeDomainData` zwraca ostatnie N próbek *w momencie wywołania* — dziury i nakładki), a rAF jest dławiony w tle. Każdy parametr „na ramkę" (Viterbi, mediana, histereza) jest w tej architekturze **niezdefiniowany** |

---

## 3. Information Architecture

### 3.1 Rozstrzygnięcie: moduł gitarowy

**Decyzja: gitara przestaje być filarem. Tuner i metronom zostają jako wspólne NARZĘDZIA. Gra akordowa wypada.**

Uzasadnienie:
1. Dziś w `desktop-navigation` „Guitar" jest peerem całego TRAIN — nawigacja **kłamie o proporcjach produktu**.
2. Metronom (`components/metronome.tsx`, 308 LOC) **realnie działa i poprawnie woła `resume()`** — jest przydatny w ćwiczeniach rytmicznych TRAIN i w SING. Zostaje.
3. Tuner po zbudowaniu `core-pitch` to ~50 LOC UI. Jest przy tym **najtańszym smoke testem rdzenia F0**: „zagraj A2, czy pokazuje A2". Dziś pokazuje `A3` (potwierdzony błąd oktawy dla A/A#/B w `guitar-tuner.tsx:176`) i jest **drugą, niezależną implementacją detekcji F0** w repo — to samo w sobie jest argumentem za konsolidacją.
4. `lib/guitar.ts` (stroje, akordy, centy) to czyste dane → `packages/content/tunings.json` + `chords.json`.
5. Gra akordowa ocenia polifonię detektorem monofonicznym. Naprawa wymaga front-endu polifonicznego (**Basic Pitch**, Apache-2.0 na kodzie *i* wagach, oficjalny port TF.js) — opcja na przyszłość, nie w MVP.

### 3.2 Docelowa mapa tras

```
/                            Dashboard: co ćwiczyć dziś, ostatnie nagrania, streak

TRAIN
/train                       hub filaru
/train/free                  swobodne śpiewanie + analiza na żywo      (dziś /record/live)
/train/warmup                rozgrzewki                                 (dziś /train)
/train/exercises             biblioteka ćwiczeń (z content/*.json)
/train/exercises/[id]        pojedyncze ćwiczenie
/train/game                  Hit the Note
/train/songs                 sing-along z MIDI                          (dziś /train/singalong)
/train/range                 test zakresu głosu                         ← NOWE (dziś nie działa)
/train/progress              postępy + wykresy + zakres                 (dziś /library/progress)

SING
/sing                        hub: lista take'ów
/sing/new                    wybór podkładu → kalibracja → nagranie
/sing/[takeId]               take: odsłuch, analiza, szlifowanie, eksport

PODCAST
/podcast                     lista projektów                            (dziś /edit/projects)
/podcast/[projectId]         edytor: transkrypcja + timeline             (nowy)

WSPÓLNE
/library                     wszystkie nagrania, filtr po filarze
/library/[id]                szczegóły nagrania
/settings                    ustawienia
/settings/audio              urządzenie wejściowe, KALIBRACJA mikrofonu, tryb detekcji
/settings/voice              profil głosu, zakres, tonacja odniesienia (A4 = 415–445 Hz)
/tools/tuner                 tuner
/tools/metronome             metronom
```

29 tras → **21 tras**, z czego 10 stubów i 2 huby-sieroty znikają, a dodają się `/train/range`, `/sing/*`, `/settings/audio`, `/settings/voice`.

### 3.3 Co jest wspólne między filarami

| Zasób wspólny | Kto używa | Uwaga architektoniczna |
|---|---|---|
| **Biblioteka nagrań** (`/library`) | wszystkie 3 | jeden model `Take` z polem `pillar`; **dziś 3 niezależne magazyny** (localStorage + 3 bazy IndexedDB) bez wspólnego ID |
| **Kalibracja mikrofonu + ustawienia audio** | wszystkie 3 | **jedna funkcja `openMicrophone(profile)`** — dziś 4 różne polityki `getUserMedia` w 4 miejscach, w tym `{audio:true}` z włączonym AGC w globalnym kontekście nagrywania |
| **Profil głosu** (zakres, tonacja, typ) | Train, Sing | **musi wypaść z estymatora F0** — dziś `userRangeMatch` ma wagę 0.2 w scoringu kandydatów, czyli prior samozwrotny: detektor „poprawia się", odmawiając raportowania nut poza znanym zakresem. W trenerze rozszerzania zakresu to sabotaż |
| **Postępy** | Train (Sing wnosi dane) | liczone z **zagregowanych metryk per take**, nie z surowych `pitchHistory` |
| **Rdzeń F0** | Train, Sing, tuner | jedna instancja per konsument (dziś stan modułowy → tuner, karaoke i gry zatruwają sobie tracking) |
| **Łańcuch DSP + LUFS + eksport** | Sing, Podcast | to jest powód, dla którego SING musi być przed PODCAST |
| **EDL** | Sing (proste cięcia), Podcast (montaż) | jeden model danych, dwa poziomy UI |

**Autozapis sesji wychodzi z `desktop-navigation.tsx`** do warstwy sesji niezależnej od layoutu. Dziś jest w komponencie nawigacji desktopowej, więc na telefonie (`innerWidth < 1024`) sesje z `/train/*` **nie zapisują się w ogóle** — dane zależą od szerokości okna.

---

## 4. Zakres filarów: MVP vs później

### TRAIN

**Jedna rzecz, która musi być znakomita: liczba w centach musi być godna zaufania.** Jeśli aplikacja mówi „jesteś 20 centów nisko", a tuner użytkownika mówi coś innego, cała reszta filaru jest bez wartości. To zarazem odpowiedź na skargę właściciela.

| MVP | Odłożone |
|---|---|
| Analiza na żywo: F0 + centy + voicing + segmentacja nut | Detekcja rejestrów / passaggio |
| Dual-view: piano-roll 8–12 centów/px + error lane ±50 centów @1–2 centy/px | Analiza formantów, barwy |
| **Dron referencyjny** w tle (dudnienia to najczulszy detektor intonacji i działa z zamkniętymi oczami) | Ćwiczenia oddechowe, MPT |
| Bandwidth feedback: nic nie pokazuj w pasie tolerancji | Fonetogram (VRP) — wymaga kalibracji SPL |
| 4 metryki rozdzielone: offset tonacji / rozrzut / dryf / błąd interwałowy | Vibrato jako oceniany wymiar (mierz i pokazuj, nie oceniaj) |
| Ćwiczenia z JSON, transponowane do zakresu użytkownika | Adaptacyjna progresja trudności |
| Test zakresu głosu (percentyle 5/95, nuta trzymana ≥1 s, SD < 50 centów) | Ćwiczenia z podkładem harmonicznym |
| Hit the Note na **czasie w ms**, nie na liczbie ramek | Hit the Chord (wymaga polifonii) |
| Sing-along z **rzeczywistym odtwarzaniem** MIDI + 3–5 utworów na liście | Biblioteka utworów, import z internetu |
| Zapis sesji identyczny na mobile i desktop | — |

**Bezwarunkowo wypada z MVP:** jitter, shimmer, HNR jako miary jakości głosu. Są zdefiniowane dla stacjonarnej fonacji bez vibrata w nagraniu studyjnym; vibrato zawodowca to celowa modulacja ±71 centów przy 6 Hz, więc te miary **punktowałyby dobrą technikę jako patologię**. Jeśli kiedyś potrzebna miara „czystości tonu" — CPPS jako trend wewnątrz jednego użytkownika i jednego setupu, nigdy jako liczba bezwzględna.

### SING

**Jedna rzecz, która musi być znakomita: nagranie musi się zgadzać z podkładem co do próbki.** Reszta (reverb, presety, korekcja) jest ozdobą, jeśli wokal jest przesunięty o 80 ms.

| MVP | Odłożone |
|---|---|
| Kalibracja latencji urządzenia (klik → mikrofon → korelacja krzyżowa), zapis offsetu per urządzenie | Nagrywanie wideo |
| Podkład z **pliku lokalnego** (WAV/MP3), odtwarzanie na zegarze audio | Biblioteka podkładów, integracje |
| Wymóg słuchawek + detekcja przecieku (koherencja > 0,3 w 300–3000 Hz → blokujący komunikat) | Monitoring z efektami na żywo (wymaga <20 ms — patrz D4) |
| Jeden łańcuch czyszczenia wokalu: HPF 60 Hz → expander (max −8 dB) → de-esser (6–10 kHz, cap 8 dB) → kompresor → limiter → −14 LUFS / −1 dBTP | Separacja źródeł (Demucs), dereverb modelowy |
| Wykres intonacji take'u + 4 metryki | Auto-tune „na żywo" |
| Opcjonalna korekcja intonacji **offline**: Signalsmith Stretch (MIT), martwa strefa 18 centów, retune tau 25 ms, amount 70%, clamp ±100 centów, `formantFactor 1.0`, **vibrato zachowane** (rozdziel kontur LP 4 Hz — koryguj tylko wolną składową) | Harmonie, doubler, chorus |
| Eksport WAV + AAC/Opus | Publikacja / udostępnianie |

**YouTube wypada bezwarunkowo.** Nie tylko dlatego, że nie istnieje w aplikacji natywnej i że ToS zabrania nagrywania/miksowania, ale też dlatego, że iframe uniemożliwia jakąkolwiek synchronizację (`player.getCurrentTime()` nie jest sample-accurate, dziś nie jest nawet czytany).

### PODCAST

**Jedna rzecz, która musi być znakomita: cięcie przez polską transkrypcję musi być bezszwowe.** Bez tego to kolejny edytor fal, a Audacity jest darmowe. Z tym — jest to jedna rzecz, w której jedna osoba może być lepsza niż Descript, bo jego `Remove Filler Words` to lista angielskich `um/uh`, a jego transkrypcja jest znormalizowana, więc polskiego „yyy" nie ma nawet w tekście.

| MVP (v1) | Odłożone |
|---|---|
| Import 2–4 ścieżek, **limit 60 min/ścieżka** | 3 h × 3 ścieżki (= 6,22 GB float32 — wymaga pełnego streamingu OPFS) |
| **Wymuszony multitrack** (każdy rozmówca = osobna ścieżka) | Diaryzacja (pyannote: RTF 0,3–1,0 na CPU, DER ~10% → i tak ręczna korekta) |
| Transkrypcja PL przez proxy + **forced alignment do ≤30 ms** | Transkrypcja on-device w jakości produkcyjnej |
| EDL + edycja przez tekst (własny renderer, **nie `contenteditable`**) | Wideo, klipy social, klonowanie głosu |
| 3 automaty: skracanie ciszy (400→200 ms), tłumienie oddechów (−15 dB, nie usuwanie), **sugestie** wypełniaczy PL z checkboxami | Automatyczne usuwanie czegokolwiek |
| Jeden preset voice-cleanup + normalizacja do −16 LUFS / −1,5 dBTP | Automatyka, pluginy, time-stretch |
| Undo/redo na EDL (stos operacji, nie snapshot) | Auto-chapters, show notes (dodać zaraz po v1 — jedno wywołanie LLM) |
| Eksport WAV 24-bit + MP3/AAC + SRT/VTT | Nagrywanie zdalnych gości (signaling + TURN = osobny produkt) |

**Architektoniczny haczyk, którego nie wolno przegapić:** Whisper **sam usuwa wypełniacze** (trenowany na czystych napisach). „yyy" nie ma w tokenach, choć jest w audio — nie da się usunąć czegoś, czego nie ma. Rozwiązanie musi być hybrydowe: albo model CTC transkrybujący dosłownie (Vosk PL, natywne word timestamps z ramek 10 ms), albo detekcja **akustycznych dziur** — segmentów >150 ms bez przypisanego tokena, ale z energią powyżej noise floor. To trzeba zaprojektować **przed** napisaniem edytora.

---

## 5. Mapa drogowa

### Etap 0 — Higiena i przyrząd pomiarowy · **S/M**

**Cel:** móc zmierzyć, czy zmiana coś poprawiła. Bez tego cała przebudowa jest zakładem bez pomiaru.

**Zakres:**
- Skasować wszystko z §1.8 (2 900 LOC, 37 zależności, 12 tras)
- `eslint` faktycznie w `devDependencies`; GitHub Actions: `tsc --noEmit` + `eslint` + `npm test`; `reactStrictMode: true`
- **Jedna** funkcja `openMicrophone(profile)` — zakaz `getUserMedia` gdziekolwiek indziej
- `pickRecorderMime()` z `isTypeSupported` w 4 miejscach — dziś `"audio/webm"` na sztywno **wywala nagrywanie na całym iOS**, a komunikat kłamie o uprawnieniach
- Naprawić błąd krytyczny #1: `contexts/audio-recorder-context.tsx:62` — stale closure blokuje MediaRecorder, żadna sesja nie ma audio
- Wyciąć `console.log` z hot pathu (`pitch-detector.ts:27-30`, 10% ramek)
- **Harness `tools/eval`:** korpus + metryki + zmierzony baseline **obecnej implementacji TS**

**Korpus (licencje sprawdzone):**
- 90% syntetyk generowany w kodzie — zero plików w repo, zero problemów licencyjnych: sinusy 65–1100 Hz co pół tonu, sweep, wibrato 5/6/7 Hz o zakresie ±50 i ±200 centów, glissando E2→C6 w 2 s i 0,5 s, sygnał z wytłumioną fundamentalną (pułapka oktawowa), szum przy SNR 0/10/20 dB
- 20–30 własnych nagrań (falset, głos oddechowy, bas, przejście rejestrów, /s/ między nutami, nagranie z laptopa z AGC)
- Zbiory publiczne **tylko CC BY 4.0**: `vocadito` (Zenodo 5578807), `Dagstuhl ChoirSet` (4618287 — ma ścieżki z mikrofonu krtaniowego), `Annotated-VocalSet` (7061507)
- **`MDB-stem-synth` jest CC BY-NC** (pochodzi z MedleyDB) — do repo komercyjnego nie wchodzi. `MIR-1K` na Zenodo nie ma licencji w metadanych = brak zgody. Oba wolno użyć tylko lokalnie, poza repo, do jednorazowej kalibracji.

**Metryki (5, wszystkie raportowane):** RPA@50, RCA@50, **luka RPA−RCA** (to dosłownie miara błędów oktawowych), Voicing Recall, Voicing False Alarm. Plus mediana |błędu| w centach i jitter odczytu (SD F0 na nucie trzymanej — najbardziej odczuwalny dla użytkownika).

**Kryterium ukończenia:** `npm test` w CI wypisuje tabelę metryk i porównuje z zacommitowanym `baseline.json`. `npm run lint` startuje. Bundle spada o rozmiar 37 pakietów. Nagranie audio z `/record/live` faktycznie istnieje w magazynie.

**Ryzyka:** pokusa pominięcia — najkosztowniejsza pokusa w całym planie.

---

### Etap 1 — Deterministyczne przechwytywanie + FFT · **S**

**Cel:** ramki o stałym hopie i budżet CPU, który pozwala liczyć cokolwiek sensownego.

**Zakres:** AudioWorklet + ring buffer + stały hop (512 próbek = 10,67 ms @48 kHz, okno 2048 = 42,7 ms). Naiwny DFT → radix-2 FFT. Reset stanu detektora przy starcie nagrania. Pauza faktycznie pauzuje (parametry w refach, nie w closure).

**Dlaczego okno 2048 @48 kHz, nie 4096:** okres E2 (82,41 Hz) to 582 próbki, więc max lag 1024 pokrywa F0 do 46,9 Hz z zapasem. Jednocześnie 42,7 ms rozmywa 21–30% cyklu vibrata 5–7 Hz (okres 143–200 ms) — akceptowalnie. Okno 4096 (85,3 ms) rozmywa ~50% cyklu i **systematycznie zaniża zmierzony zasięg vibrata**. Jest wąskie okno akceptowalnych wartości i 2048 @48 kHz w nim siedzi.

**Kryterium ukończenia:** jitter hopu < 1 ms zmierzony na 10-minutowym nagraniu; 100% ciągłości próbek (zero dziur i duplikatów); czas ramki trybu Pro **< 2 ms** na laptopie właściciela (dziś 25,84 ms na Apple M5 — czyli tryb „Pro" nie wyrabia 60 fps na najszybszym rdzeniu na rynku) i < 8 ms na średnim Androidzie.

**Ryzyka:** ładowanie `.wasm` w AudioWorklecie (brak `fetch`) — spike 2 dni przed planowaniem.

---

### Etap 2 — Rdzeń F0 · **M/L**

**Cel:** naprawić „analiza tonów jest niedoskonała" i mieć na to liczby.

**Zakres:**
- **Najpierw usunąć, potem dodać.** Wyciąć CAŁY blok `pitch-detector.ts:210-229` (blokada oktawowa — usunięcie samego `> 5` nic nie da, ten warunek jest zawsze prawdziwy gdy bramka odpali), oba martwe filtry antyharmoniczne, oba nieosiągalne gate'y `confidence`, i **oba priory samozwrotne** z trybu Pro (`temporalStability` 0.3 + `userRangeMatch` 0.2 = 50% wagi to prior na własne poprzednie zwycięstwa i na zaobserwowany zakres). Dołożenie Viterbiego na to dałoby **podwójną korektę** i wynik gorszy niż każde z rozwiązań osobno.
- pYIN: N=100 progów 0,01–1,00, prior Beta(2,18) (średnia 0,10 — dała najniższy octave error 0,5% w oryginalnej pracy), `no_trough_prob = 0.01`
- Siatka HMM: **10 centów/bin, 55–1175 Hz** (A1–D6, szerzej niż zakres użytkowy, żeby Viterbi nie przyklejał się do krawędzi przy subharmonicznych i vocal fry) = 490 binów × 2 (voiced/unvoiced)
- Model przejścia: **mieszanka dwóch Laplace'ów** 0.9·σ=40c + 0.1·σ=250c, obcięcie ±500 centów/ramkę. **Nie podłoga jednostajna ε=0.02** — arytmetyka: masa podłogi na bin = 4,08e-5, człon Laplace'a spada poniżej niej przy ~460 centach, więc kwinta, septyma, oktawa i dwie oktawy stają się dla dekodera **równocenne**. librosa używa `transition_min_prob=1e-4`, czyli przycinania, nie podłogi.
- **Interpolacja sub-binowa obowiązkowa** — siatka 10 centów daje błąd ±5 centów, czyli 50% szerokości pasma „perfect" w istniejącej metryce. Bez tego kwantyzacja sama przerzuca nuty między klasami ocen.
- **Pełny Viterbi offline** dla ścieżki oceniającej (take jest wsadowy — TRAIN ocenia wykonanie ćwiczenia, SING obrabia nagranie po fakcie). Fixed-lag online tylko jeśli wymóg produktowy wymusi ocenianie w trakcie nuty.
- Instancja z jawnym stanem: `createTracker(config) -> { process(frame), flush(), reset() }`. Koniec ze stanem modułowym (dziś tuner, karaoke i gry współdzielą `previousFrequency`, a stan przeżywa 30 ramek ciszy — zmierzone przez weryfikatora).

**Kryterium ukończenia (na korpusie z etapu 0):**
- RPA@50 ≥ 0,95 na czystych, **luka RPA−RCA < 1,5 pp**, mediana |err| < 8 centów na czystych i < 25 centów przy SNR 10 dB
- Voicing Recall ≥ 0,92 przy VFA < 10%
- **Skok oktawowy C3→C4 wykryty w ≤3 ramkach** (dziś: 130,82 Hz w KAŻDEJ z 10 kolejnych ramek — zmierzone)
- Ten sam wynik w Node i w przeglądarce (bit-identyczny na jednej platformie)
- Zmierzony zasięg vibrata 5 Hz / ±60 centów nie spada o więcej niż 10% po filtrze

**Ryzyka:** to jedyny etap, w którym można się przekonać, że problem był gdzie indziej — dlatego etapy 0 i 1 są przed nim.

---

### Etap 3 — TRAIN v2 · **L**

**Cel:** pierwszy filar, który realnie działa i którego liczby użytkownik uzna za wiarygodne.

**Zakres:**
- **Nowy model oceny.** Wyrzucić kubełki 10/25/off (próg 10 centów jest o rząd wielkości niżej niż percepcja: eksperci nie słyszą 20–25 centów, nietrenowani do ~65, zawodowcy sami dryfują ~30). Zamiast tego ciągła funkcja `s(e) = exp(-max(0,|e|-d0)²/(2·25²))` z **adaptacyjną martwą strefą** 20–70 centów (długość nuty × rejestr × kontekst × SNR)
- Ocena **per NUTA**, nie per ramka; pomijanie ataku (adaptacyjnie 40–150 ms, kryterium stabilizacji: |nachylenie| < 400 centów/s i rozstęp < 35 centów w oknie 50 ms); środek nuty przez średnią kroczącą o długości **dokładnie jednego okresu vibrata**, **w centach** (uśrednianie w Hz systematycznie przesuwa w stronę „sharp")
- **4 metryki rozdzielone:** offset (mediana, nie karaj poniżej 25 centów a cappella / 12 centów z podkładem), rozrzut (`1,4826 · MAD` — to jest właściwa ocena), dryf (centy/min), błąd interwałowy (koreluje z sądem ekspertów **lepiej** niż odchylenie absolutne)
- Referencja **trybowa**: a cappella → martwa strefa zależna od stopnia skali (tercja wielka 26 centów, kwinta 14 — bo JI odchyla tercję o −13,7 centa); z podkładem → 15 centów niezależnie od stopnia
- Wygładzanie: mediana-3 w centach (16 ms) → **One Euro Filter** (`fcmin 1.5 Hz, beta 0.01`). Arytmetyka: vibrato 5 Hz / ±60 centów ma prędkość ~1400 centów/s → cutoff rośnie do ~15,5 Hz, więc vibrato przeżywa. Stały LP poniżej 8 Hz kasuje vibrato, czyli kasuje dowód umiejętności.
- Dual-view + dron referencyjny + bandwidth feedback; kolory Okabe-Ito (`#0072B2` / neutralny / `#D55E00`) + **redundancja bez koloru** (pozycja, kształt głifu, grubość, hatch, liczba centów) — ~8% mężczyzn nie odróżni zielonego od czerwonego
- Kalibracja mikrofonu zamiast suwaka czułości: 2 s ciszy + 3 s głosu, próg = noise floor + max(10, 0,35·SNR) dB z histerezą 4 dB, persystencja per `deviceId`
- Autozapis niezależny od layoutu; ujednolicone jednostki czasu; zakres głosu liczony **przy zapisie** i trzymany jako `minF0/maxF0` w metadanych

**Kryterium ukończenia:**
- Na 10 take'ach uszeregowanych ręcznie przez 3 osoby: **Spearman ρ > 0,8** między wynikiem aplikacji a rankingiem ludzkim
- Take zaśpiewany konsekwentnie 30 centów nisko: **wysoki wynik względny + flaga „strojenie"** (spadek ≤5 punktów)
- Take z per-nutowym szumem N(0, 40 centów): **niski wynik względny** ← to jedyny test, który łapie zbyt szybką adaptację referencji
- Liczba zapisanych sesji na mobile == na desktopie
- Zakres głosu niepusty po pierwszej sesji

**Ryzyka:** przeprojektowanie oceny zmieni historyczne wyniki. **Wersjonuj silnik oceny** (`scoreVersion` + `dspVersion` + hash parametrów z każdym wynikiem) i trzymaj surowe kontury F0, żeby dało się przeliczyć historię. Zmiana formuły bez wersjonowania zamienia wykres postępu w kłamstwo.

---

### Etap 4 — Silnik audio i łańcuch DSP · **L**

**Cel:** jedno miejsce, gdzie audio brzmi tak samo w przeglądarce i (później) na telefonie.

**Zakres:** `core-dsp` w Rust: biquady, gate/expander, adaptive leveler, de-esser, kompresor (2 stopnie), saturacja z 4× oversamplingiem, **limiter true-peak** (4× oversampling, lookahead 3–5 ms), **LUFS BS.1770-4 z pełnym gatingiem** (absolutny −70 LUFS, relatywny −10 LU), LRA. Render offline. Storage: OPFS + `FileSystemSyncAccessHandle` w dedykowanym Workerze, peak pyramid, koniec `localStorage` dla audio. Eksport: WebCodecs (`AudioEncoder` — Safari 26+) + fallback.

**Kluczowe liczby:**
- 1 kanał float32 48 kHz = **691,2 MB/h**. Nagrania robocze: int16 48 kHz. Archiwum: FLAC. Podgląd: Opus 96 kbps.
- LUFS: własny build **libebur128** (MIT) — ale **wendorowana kopia**, projekt porzucony (ostatni commit 2021-02-14). Nie pisz K-weightingu sam: BS.1770-4 podaje współczynniki tylko dla 48 kHz, a `AudioContext.sampleRate` na wielu Macach to 44,1 kHz → błąd 0,3–0,5 LU (typowy bug portów JS).
- Presety: PODCAST −16 LUFS / −1,5 dBTP / LRA 3–8 LU; SING −14 LUFS / −1,0 dBTP
- **Limiter jest obowiązkowy** — dzisiejsze presety mają `outputGain` do 1,25 przy `highShelf +5 dB`, a obcięcie realizuje dopiero konwerter WAV (`Math.min(1, sample)`), czyli twardy clipping bez ostrzeżenia

**Kryterium ukończenia:** LUFS zgodny z plikami referencyjnymi **EBU TECH 3341 w granicach ±0,1 LU**; eksport 10-minutowego take'u nie alokuje >150 MB i nie blokuje UI >100 ms (dziś `audioBufferToWavBlob` buduje `Array<number>` ze wszystkich próbek — dla 3 min stereo 48 kHz to 17,3 mln elementów, ~150–250 MB); zmierzony peak/LUFS pliku wyeksportowanego zgadza się z zapowiedzianym.

---

### Etap 5 — SING · **M/L**

**Cel:** filar, który wymusza kalibrację latencji i EDL — czyli fundament PODCAST przy 1/5 zakresu.

**Zakres:** kalibracja latencji, odtwarzanie podkładu na zegarze audio, wymóg słuchawek + detekcja przecieku, łańcuch czyszczenia, opcjonalna korekcja intonacji offline (Signalsmith Stretch, MIT), proste cięcia na EDL, eksport.

**Kryterium ukończenia:**
- Nagrany take zmiksowany z podkładem ma **|offset| < 10 ms na 3 urządzeniach**, w tym jednym iPhonie
- **Bramka wierności:** wejście i wyjście łańcucha czyszczenia przepuszczone przez własny detektor F0 dają **medianę |ΔF0| < 5 centów** i **zgodność ramek voiced/unvoiced > 98%**. Jeśli którykolwiek warunek pada, łańcuch jest zbyt agresywny. To jedyny sposób, żeby uczciwie powiedzieć użytkownikowi „to samo nagranie, tylko czystsze".
- Odsłuch zapisanego take'u brzmi identycznie jak to, co było słychać przy nagraniu

**Ryzyka:** wymóg słuchawek podnosi próg wejścia. Ale nagranie z przeciekiem podkładu jest **nie do naprawienia** bez separacji źródeł (Demucs, ~300 MB, GPU) — lepiej zapobiegać. Fallback: tryb a cappella.

---

### Etap 6 — PODCAST v1 · **L/XL**

**Cel:** wąska, weryfikowalna przewaga na polskim.

**Zakres:** patrz §4. Plus: minimalny backend (jeden Cloudflare Worker jako proxy ASR/LLM, ~150 linii, bez bazy i bez stanu).

**Kryterium ukończenia (mierzalne na własnym zbiorze):**
- Na 30-minutowym polskim nagraniu: **≥85% faktycznych wypełniaczy znalezionych przy <5% fałszywych trafień** na słowach dwuznacznych („no", „jakby", „prawda", „nie")
- **Granice cięć z błędem ≤30 ms** i **zero słyszalnych klików** w slepym odsłuchu 20 cięć (przesunięcie do lokalnego minimum energii ±40 ms → zero-crossing → crossfade 10–20 ms)
- Projekt 4 × 60 min ładuje się i przewija w 60 fps
- Undo/redo działa na 50 kolejnych operacjach bez utraty danych

**Ryzyka:** to najbardziej podatny na rozjazd zakresu etap. Twardy limit: **jeśli v1 nie jest gotowe po zakresie z §4, nie dodaje się nic — obcina się.**

---

### Etap 7 — Natywne · **XL**

**Zakres:** Capacitor + 2 natywne pluginy (audio I/O z nagrywaniem w tle, pliki) nad tym samym rdzeniem. **Capture MUSI być w natywnym pluginie** (`AVAudioSession` mode `.measurement` / Oboe), nie przez `getUserMedia` w WebView — WKWebView ma ten sam problem co Safari.

**Kryterium ukończenia:** ten sam korpus golden przechodzi na iOS i Androidzie z tymi samymi tolerancjami; nagrywanie w tle 30 min przeżywa rozmowę telefoniczną; latencja round-trip zmierzona i raportowana w aplikacji; **live monitoring włączany po runtime capability check**, nie deklaratywnie.

**Ryzyka:** Google Play dla nowych kont indywidualnych wymaga zamkniętego testowania (rzędu 12 testerów / 14 dni) — kilkutygodniowy blocker. Do potwierdzenia przed planowaniem premiery.

### Uzasadnienie kolejności

1. **Pomiar przed zmianą.** Skarga właściciela to „analiza jest niedoskonała". Bez metryk nie odróżnisz poprawy od przetasowania błędów — a w audio regresje są ciche.
2. **Akwizycja przed algorytmem.** Viterbi z karą „na ramkę" jest niezdefiniowany przy nierównomiernych ramkach z rAF. Lepszy algorytm na dziurawych ramkach mierzy harmonogram klatek przeglądarki, nie śpiewaka.
3. **TRAIN przed SING**, bo SING używa analizy TRAIN.
4. **SING przed PODCAST**, bo SING wymusza łańcuch DSP, EDL i kalibrację latencji — wszystko, czego PODCAST potrzebuje, przy 1/5 zakresu i z natychmiastową wartością dla użytkownika.
5. **Natywne na końcu**, bo mnoży koszt supportu ×3 i powinno iść za walidacją produktu, nie przed.

---

## 6. Decyzje do podjęcia teraz

| # | Decyzja | Opcje | Rekomendacja | Dlaczego | Co jeśli źle |
|---|---|---|---|---|---|
| **D1** | Język rdzenia DSP/analizy | (a) TS + wasm tylko dla FFT (b) **Rust** → wasm + staticlib (c) C++17 → Emscripten (d) wspólne UI z natywnym DSP | **(b), z zakresem rosnącym etapami** (etap 1: FFT+biquady; 2: pitch; 4: chain). Bindingi przez `extern "C"` + cbindgen, **nie uniffi** | To jedyna warstwa, której nie da się przenieść inaczej. Rust, bo jedna osoba bez testów nie utrzyma C++ z UB w wątku audio. `extern "C"`, bo granica jest płaska (POD) — uniffi zarabia na bogatych typach, jest przed 1.0 i jego backend WASM jest third-party | (a) → przy porcie przepisujesz analizę 2. i 3. raz, z rozjazdem wyników między platformami (inny wynik na iPhonie niż na laptopie). (c) → race w wątku audio i UB niewykrywalne bez testów. (d) → i tak piszesz DSP natywnie, a dodatkowo tracisz istniejące web UI |
| **D2** | Backend: czy i jaki | (a) brak (b) **minimalny proxy Worker** (c) pełny backend z kontami i sync | **(a) do etapu 5, (b) od etapu 6.** Nigdy (c) przed pierwszymi płacącymi | Bez backendu robisz ~85%: import, EDL, DSP, LUFS, eksport. Nie da się jednego: trzymać klucza ASR w statycznym froncie. To ~150 linii w Workerze. **Poprawka do researchu:** Workers Free = **10 ms** CPU/request (nie 50 ms), Paid = 30 s domyślnie do 5 min, Queue Consumers/Cron 15 min. Nie transkoduj w Workerze — nie z powodu CPU, a ~128 MB isolate i braku natywnych binarek | (c) za wcześnie = miesiące na auth/RODO/monitoring zamiast na produkt. (a) za długo = klucz API w bundlu i skradziona kwota w tygodniu |
| **D3** | Format i miejsce przechowywania audio | (a) status quo (localStorage + IndexedDB blob + base64 dataURL) (b) IndexedDB blob (c) **OPFS + pliki + peak pyramid + SQLite na metadane** | **(c).** Natychmiast: koniec `localStorage` dla `pitchHistory` i base64 dla transferu nagrań | 3 h × 3 ścieżki float32 = **6,22 GB** (int16 3,11 GB) — heap taba ~2 GB, WASM32 sufit 4 GB. To arytmetycznie niemożliwe w `AudioBuffer`, nie „nieoptymalne". Peak pyramid dla tego = ~28 MB | Zostajesz z cichą utratą sesji po ~11–12 min łącznych nagrań (limit 5 MB) i z niemożliwym do zrealizowania filarem PODCAST. **Uwaga:** Safari OPFS ~1 GB domyślnie + eviction po 7 dniach bez interakcji dla niezainstalowanego PWA → obowiązkowo `navigator.storage.persist()` + eksport projektu do pliku |
| **D4** | Framework natywny | (a) SwiftUI + Compose (dwa UI) (b) **Capacitor + własne pluginy audio** (c) React Native (d) Compose MP / Flutter | **(b) jako pierwszy krok do sklepów.** (a) tylko jeśli dane retencyjne pokażą, że WebView UI jest problemem | 2 pluginy ≈ 400–800 LOC/platformę vs **12–20 tygodni** na dwa natywne UI. Pluginy przechodzą 1:1 do natywnego shella później. **Warunek konieczny:** capture w natywnym pluginie, nie przez `getUserMedia` w WebView | (a) od razu = 3–5 miesięcy przed pierwszym użytkownikiem mobilnym i 3× koszt każdej funkcji. (b) bez natywnego capture = powtarzasz problem AGC z web i nie masz nagrywania w tle, czyli **nie masz po co iść do sklepu**. Live monitoring: `android.hardware.audio.pro` (≤20 ms) deklaruje ułamek rynku — funkcja **warunkowa** po runtime check, nie obiecana |
| **D5** | Static export | (a) **zostaje** (b) SSR / hosting node | **(a), do etapu 6 włącznie.** Worker jest osobnym originem/route, nie SSR w Next.js | Zero zysku funkcjonalnego z SSR na etapach 0–5, realny koszt operacyjny. Nagłówki (`Cache-Control` dla `.wasm`) przez `_headers` na Cloudflare — potwierdzone, że host to Cloudflare | Przejście na SSR = utrata trywialnego deploymentu i nowa klasa problemów bez żadnej nowej możliwości |
| **D6** | Monorepo | (a) **jedno repo** (npm workspaces + cargo workspace) (b) polyrepo | **(a)** | Golden files muszą być współdzielone przez rdzeń (Rust), harness (Node) i shelle. Przy jednej osobie wersjonowanie 3 repo to czysty koszt | (b) → nieuchronny rozjazd wersji rdzenia między platformami; przy jednej osobie nikt tego nie zauważy, dopóki użytkownik nie zgłosi różnych wyników |
| **D7** | Algorytm F0 | (a) załatać istniejący YIN (b) **pYIN we własnym rdzeniu** (c) model neuronowy on-device | **(b) jako kanoniczny.** (c) tylko offline, jako oracle do budowy korpusu — i to `penn`/FCNF0++ (MIT na kodzie **i** checkpointach), nie SwiftF0 | (a) nie wystarczy — błąd jest w warstwie decyzyjnej, nie obliczeniowej. Ale najdroższy zmierzony defekt to naiwny DFT (**25,84 ms/ramkę** na Apple M5 vs 0,36 ms dla samego YIN) — to poprawia FFT. (c) nie: brak niezależnych benchmarków (liczby SwiftF0 są z repo tego samego autora co benchmark), **licencja wag SwiftF0 NIEOKREŚLONA**, zero pomiarów na CPU telefonu | (c) teraz = pobranie modelu jako warunek działania trenera intonacji, checkpoint bez jasnej licencji w produkcie komercyjnym, i WebGPU niedostępne na iOS < 26 |
| **D8** | ASR dla PODCAST | (a) on-device (b) **chmura przez proxy** (c) hybryda | **(b) domyślnie, (a) jako tryb prywatny oznaczony jako szkic** (Vosk PL small, 50 MB, Apache-2.0, natywne word timestamps, **transkrybuje dosłownie**) | 9 h audio (3h × 3 ścieżki) = **0,36–2,80 USD**. Optymalizowanie kosztu ASR to optymalizowanie pozycji, która nie jest problemem. Prawdziwy argument za on-device to prywatność, nie cena — i on jest wart przełącznika, nie przebudowy architektury | (a) domyślnie = 800 MB pobrania dla jakości produkcyjnej. (b) bez proxy = skradziony klucz. **Uwaga:** Auphonic nalicza **minimum 3 min na produkcję** → dla klipów karaoke 30–90 s to 2–6× inflacja kosztu; chmura post-produkcyjna ma sens tylko dla długich materiałów PODCAST |
| **D9** | Moduł gitarowy | (a) czwarty filar (b) wyciąć całkowicie (c) **tuner + metronom jako wspólne Narzędzia, gra akordowa out** | **(c)** | Metronom działa i jest przydatny w TRAIN/SING. Tuner to ~50 LOC UI nad `core-pitch` i **najtańszy smoke test rdzenia F0** (dziś pokazuje A2 jako „A3"). `lib/guitar.ts` → JSON | (a) = czwarty filar do utrzymania i nawigacja, w której gitara ma tę samą wagę co cały TRAIN. (b) = wyrzucasz działający metronom i najtańszy test rdzenia |
| **D10** | Trzy filary równolegle czy sekwencyjnie | (a) równolegle (b) **sekwencyjnie TRAIN → SING → PODCAST** | **(b), z PODCAST radykalnie okrojonym** | SING to naturalny most: wymusza łańcuch DSP i EDL, które PODCAST potrzebuje, przy 1/5 zakresu. PODCAST jako pełny edytor to projekt zespołowy na kwartały | (a) = trzy niedokończone filary, czyli **dokładnie to, co jest dzisiaj**, tylko z nową architekturą |

### Zakazy licencyjne — do wpisania w `CLAUDE.md` teraz

Nie wchodzą do artefaktu wysyłanego użytkownikowi (App Store / Google Play / bundle web):

| Pakiet / wagi | Licencja (zweryfikowana) | Uwaga |
|---|---|---|
| `pitchfinder` (npm 2.3.4) | **GPL-3.0** (`"GNU v3"` w package.json) | najbardziej prawdopodobny skrót „na szybko" — i najgroźniejszy |
| `aubio` / `aubio-rs` | GPL-3.0 | ostatni tagowany release 0.4.9 z 2019 |
| `essentia` / `essentia.js` | **AGPL-3.0** | AGPL uruchamia obowiązek udostępnienia źródeł przy serwowaniu przez sieć — czym `sing.arvind.digital` jest |
| Rubber Band Library / `rubberband-web` | GPL-2.0-or-later albo płatna | zastąpione przez Signalsmith Stretch (MIT) |
| `anvuew/dereverb_mel_band_roformer` (wagi) | **GPL-3.0** (HF API: `cardData.license`) | najlepszy publiczny dereverb wokalu — niedostępny |
| `@ffmpeg/core` | GPL-2.0-or-later | wrapper `@ffmpeg/ffmpeg` jest MIT, core nie |
| `lamejs` / `@breezystack/lamejs` | **LGPL-3.0** (metadane npm) | LGPL-3 dziedziczy klauzule anty-DRM z GPLv3 |
| `soundtouchjs` | LGPL-2.1 | statyczne linkowanie sprzeczne z ToS App Store |
| Praat / Parselmouth | GPL-3.0 | **wolno** używać offline jako oracle w harnessie, nie w produkcie |
| `MDB-stem-synth`, `MIR-1K` (dane) | CC BY-NC / brak licencji | tylko lokalnie, nie w repo |

Bezpieczne: **Signalsmith Stretch** (MIT), **libebur128** (MIT, wendoruj), **RNNoise** (BSD-3), **speexdsp** (BSD), **WORLD** (BSD-3), **rustfft/realfft** (MIT/Apache-2.0), **pitchy** (0BSD), **sevagh/pitch-detection** (MIT, jedyna permisywna implementacja pYIN), **penn/FCNF0++** (MIT kod + checkpointy), **Basic Pitch** (Apache-2.0 kod + wagi), **mp4-muxer/webm-muxer** (MIT), **Oboe** (Apache-2.0), **AudioKit** (MIT — do I/O, **nie** do pitchu: `PitchTap` to Csound `ptrack` z `BINPEROCT 48` = 25 centów rozdzielczości).

---

## 7. Ryzyka

### 7.1 Co zabija takie projekty

| Ryzyko | Jak wygląda tutaj | Ograniczenie |
|---|---|---|
| **Zakres, nie technologia** | 60 commitów w 14 dni → 6 miesięcy ciszy. To już się raz stało i wzorzec jest jednoznaczny: zbyt szeroki front, brak zamkniętej pętli „zmiana → pomiar → efekt" | Sekwencja filarów (D10). Twarde kryteria ukończenia etapów. Zakaz dodawania funkcji do etapu w trakcie |
| **2 miesiące bez widocznego efektu** | Etapy 0–2 nie dodają ani jednej funkcji dla użytkownika. To najczęstsze miejsce porzucenia | **Etapy 0 i 1 są krótkie (S) i mają widoczny efekt: tryb Pro przestaje klatkować (25,84 ms → <2 ms/ramkę) i nagrania faktycznie się zapisują.** To dwa realne bugi, które użytkownik czuje |
| **Ciche regresje w DSP** | 21,6k LOC, 0 testów. Zmiana współczynnika filtra, przesunięcie okna o ramkę — nic nie rzuca wyjątku, wszystko psuje brzmienie | Golden-file testy w etapie 0. **EDL i LUFS są jedynymi częściami testowalnymi trywialnie i bez audio** — jeśli testy nie pojawią się tam, nie pojawią się nigdzie |
| **Rozjazd między platformami** | Jeśli scoring żyje w TS i w Swift, i w Kotlin, użytkownik dostaje różne wyniki i traci zaufanie do wykresu postępu | D1 + reguła „liczba widziana przez użytkownika → rdzeń". Port mechaniczny weryfikowany golden files jako testem równoważności |
| **Optymalizacja niewłaściwej rzeczy** | Cały research o denoisingu i modelach neuronowych adresuje nie to wąskie gardło. Zmierzone wąskie gardło to naiwny DFT i rAF jako zegar | Kryterium: żadna praca nad algorytmem, dopóki nie zmierzysz, co jest wolne. Etap 1 jest tańszy niż wszystkie etapy modelowe razem |

### 7.2 Ryzyka specyficzne dla tego projektu

**iOS w web jest kaleki bardziej, niż się wydaje.** iOS Safari **w ogóle nie wspiera constraintów `noiseSuppression` i `autoGainControl`** (MDN BCD 8.0.8: `safari: false`, `safari_ios: false` — wspierany jest tylko `echoCancellation`). To znaczy, że na iPhonie w przeglądarce mierzysz sygnał po przetwarzaniu Apple, którego nie kontrolujesz — a Twoje pomiary z iPhone'a **nie są porównywalne** z pomiarami z desktopu. Konsekwencje: (1) zapisuj platformę i przeglądarkę z każdym pomiarem i nie porównuj między nimi bez kalibracji, (2) nie obiecuj „dokładności centowej" na iPhonie w webie, (3) to jest silniejszy argument za natywnym niż jakakolwiek latencja.

**Nagrywanie w web nie działa na iOS już dziś.** `mimeType: "audio/webm"` zahardkodowany w 4 miejscach (`app/record/karaoke/page.tsx:213`, `components/multi-track-manager.tsx:232`, `hooks/use-audio-recording.ts:18`, `app/edit/studio/page.tsx:472` — ostatni ma fallback, ale tylko webm→webm). Safari daje `audio/mp4`. Karaoke to funkcja z definicji mobilna. **Najtańsza naprawa z natychmiastowym efektem** — etap 0.

**Trzy filary naraz to zbyt szeroki zakres. Mówię to wprost.** Każdy z trzech obszarów audytu ma werdykt `rewrite`. Filar PODCAST jako pełny edytor multitrack (undo/redo, split, fade, crossfade, automatyka, eksport, transkrypcja) to projekt na kwartały pracy **zespołu** — Descript ma na to setkę inżynierów, Hindenburg buduje to od dekady. Jedna osoba part-time nie zbuduje trzech produktów równolegle; zbuduje trzy prototypy, czyli dokładnie to, co jest dzisiaj.

**Co zrobić zamiast:**

1. **TRAIN jest produktem. SING jest funkcją TRAIN. PODCAST jest osobnym produktem.** Ta ramka zmienia wszystko: SING nie potrzebuje własnego edytora, tylko „nagraj do podkładu → wyczyść → wyeksportuj". PODCAST może być drugim produktem na tym samym rdzeniu, wypuszczonym rok później, albo nie wypuszczonym wcale — i to nie będzie porażką.
2. **PODCAST v1 nie jest edytorem, jest post-produkcją do cudzych plików.** Pozycjonowanie: „post-produkcja do Twojego Riverside/Zoom/Zencastr". Import gotowych ścieżek, wymuszony multitrack, cięcie przez polską transkrypcję, jeden preset, eksport. To eliminuje nagrywanie zdalne (jedyną funkcję wymagającą realnej infrastruktury i 3–6 miesięcy pracy), diaryzację i połowę timeline'u.
3. **Bramka decyzyjna przed etapem 6:** jeśli po TRAIN + SING nie ma ~200 powracających użytkowników albo pierwszych przychodów, **PODCAST się nie zaczyna**. Wtedy właściwa decyzja to pogłębić TRAIN (ćwiczenia, progresja, treść), nie otwierać nowego frontu.
4. **Wąska przewaga rynkowa jest jedna i jest do zrobienia przez jedną osobę: POLSKI.** Descript po polsku nie usuwa „yyy", „no wiesz", „znaczy" — jego filler removal to lista angielskich `um/uh`, a transkrypcja jest normalizowana. Nikt nie zrobił dosłownej polskiej transkrypcji z word timestamps, na której edycja przez tekst faktycznie działa, bo dla dużych graczy to 0,5% przychodu. Dla Ciebie to cały rynek. Ekspansja na czeski/węgierski/rumuński (te same dziury) jest naturalna później.

### 7.3 Otwarte pytania — do rozstrzygnięcia pomiarem, nie researchem

Trzy spike'y (~1 tydzień razem) rozstrzygają więcej niż jakikolwiek dalszy research:

1. **Test loopbackowy latencji** na własnym iPhonie, Androidzie i desktopie (klik → mikrofon → korelacja krzyżowa). **Żadna liczba latencji w całym researchu nie została zmierzona** — wszystkie są szacunkami z pamięci albo z desktopowego x86. Bez tego nie da się rozstrzygnąć, czy live monitoring w SING jest realny.
2. **Spike WASM w AudioWorklecie na iOS Safari** — brak `fetch` w `AudioWorkletGlobalScope`, `postMessage` modułu, czas startu sesji nagrywania.
3. **Spike SQLite Wasm / OPFS na iOS Safari z 500 MB danych** — realna quota, zachowanie `opfs-sahpool` (worker-only, jeden writer), przeżycie 7 dni ITP po `navigator.storage.persist()`.

Plus, do sprawdzenia bez pisania kodu:

- **Czy Apple `SpeechAnalyzer` / `SpeechTranscriber` (iOS 26+) obsługuje polski?** (`SpeechTranscriber.supportedLocales`). `SFSpeechRecognizer` wspierał `pl-PL` od lat, nowe API startowało z węższą listą. Jeśli tak — na iOS masz darmowy, szybki, on-device ASR i cała kalkulacja PODCAST się zmienia.
- **Rzeczywiste zachowanie constraintów w WKWebView (Capacitor)** vs Safari — determinuje, czy plugin capture jest opcjonalny czy obowiązkowy (zakładam obowiązkowy).
- **Konkretne WER dla polskiego** z benchmarku BIGOS V2 — HF Space zwrócił 401, wiadomo tylko, że Whisper Large V3 jest w top-3 z ~25 systemów. Zmierz na własnym korpusie 3 × 10 min.
- **Aktualne limity i ceny Cloudflare** (R2 $/GB, D1, Durable Objects SQLite GA) przed projektowaniem sync.
- **Wymogi Google Play** dla nowych kont indywidualnych (zamknięte testowanie) przed planowaniem premiery.
- **Numer wersji Compose Multiplatform** — research podał „v2.4.10" jako potwierdzone, ale publiczna linia była 1.x; jeśli numer jest błędny, status per platforma też może być. Nieistotne dla rekomendacji (D4 nie wybiera CMP), ale nie opieraj na tym żadnej decyzji.