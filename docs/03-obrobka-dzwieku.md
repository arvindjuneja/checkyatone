## Obróbka dźwięku — łańcuchy DSP, jakość głosu, silnik audio

*Dokument techniczny warstwy przetwarzania dla filarów SING i PODCAST.*

---

### 1. Diagnoza: co dziś realnie istnieje

#### 1.1. Jedyna działająca obróbka

W całym repo działa **jeden** łańcuch przetwarzania end-to-end: `lib/audio-processor.ts:144-225`. Topologia: `compressor → lowShelf 200 Hz → peaking 1 kHz → highShelf 3 kHz → [ConvolverNode reverb dry/wet] → outputGain → destination`, renderowany w `OfflineAudioContext` (`:134`) i eksportowany do WAV 16-bit (`audioBufferToWavBlob`, `:250-300`). Wywoływany z `app/edit/studio/page.tsx:306`. To jest żywa ścieżka i faktycznie produkuje plik.

Do tego 5 presetów (`:36-117`) z sensownymi w intencji wartościami. Ale każdy z nich ma zaprogramowane przesterowanie:

| Preset | outputGain | highShelfGain | midGain | Skutek |
|---|---|---|---|---|
| `podcast` | 1.2 | +3 dB | 0 | twardy clipping na peakach |
| `bright` | 1.25 | +5 dB | +3 dB | clipping gwarantowany |

Lańcuch kończy się na `outputGain` (`:190-191`), **bez limitera i bez pomiaru szczytu**. `OfflineAudioContext` renderuje we float, więc nadmiar nie jest obcinany aż do konwersji: `Math.max(-1, Math.min(1, sample))` w `:267`. To jest trzask w wyeksportowanym pliku, a funkcja nazywa się „popraw jakość".

Trzy dodatkowe potwierdzone defekty tego łańcucha:

- **Reverb obcięty w połowie zaniku.** `new OfflineAudioContext(ch, audioBuffer.length, sr)` (`:134-138`) — długość renderu = długość wejścia, a impuls ma 2 s (`createReverbImpulse(offlineContext, 2, 2)`, `:179`). Ogon ucina się na końcu pliku, słyszalne jako „ciachnięcie" ostatniego wyrazu.
- **Impuls to surowy biały szum.** `createReverbImpulse` (`:230-248`) generuje wyłącznie `(Math.random()*2-1) * Math.pow(1 - i/length, decay)` — bez pre-delayu, bez filtracji pasma, bez dekorelacji kanałów. Barwa metaliczna/sycząca, brzmi jak artefakt, nie jak przestrzeń.
- **Podgląd „na żywo" w Studio nie zawiera reverbu.** `setupPreviewChain` (`app/edit/studio/page.tsx:188-237`) tworzy kompresor + 3 filtry + gain i nic więcej; `updatePreviewSettings` (`:240-262`) w ogóle nie tyka `reverbMix`. UI zapewnia „Słyszysz efekty w czasie rzeczywistym" (~linia 940). Użytkownik ustawia reverb 30%, nie słyszy różnicy, uznaje suwak za zepsuty — albo renderuje i dostaje inny plik niż odsłuchiwał.

To jest architektoniczny wzór, który powtarza się w całym obszarze: **dwa niezależne opisy tego samego DSP** (offline w `audio-processor.ts:144-191`, realtime w `studio/page.tsx:201-229`), które już się rozjechały. Plus trzeci, częściowo pokrywający się łańcuch EQ w `lib/track-processor.ts:28-44` z innymi częstotliwościami granicznymi (320/1000/3200 Hz vs 200/1000/3000 Hz).

#### 1.2. Cztery kopie enkodera WAV, każda z tym samym błędem

`audioBufferToWavBlob` istnieje trzykrotnie: `lib/audio-processor.ts:250-300`, `lib/multi-track-engine.ts:429-481`, `components/interactive-waveform.tsx:272-324`. Wszystkie budują pośrednią tablicę JS:

```js
const data = []
for (let i = 0; i < audioBuffer.length; i++) {
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const sample = audioBuffer.getChannelData(channel)[i]   // ← wywołanie Web IDL na PRÓBKĘ
    data.push(pcmSample)
  }
}
```

Dla 10 min stereo 48 kHz to 57,6 mln elementów w packed-double array (~460 MB) + 115 MB `ArrayBuffer`, synchronicznie na wątku UI, plus 57,6 mln wywołań `getChannelData`. Na telefonie przy 5-minutowym nagraniu zakładka pada z OOM.

Dodatkowo: **eksport jest zawsze 16-bit i bez ditheringu** (`bitDepth = 16` na sztywno, `:257`).

#### 1.3. Stan silnika multitrack

Silnik ma jedną rzecz zrobioną dobrze i to jest najcenniejsza rzecz w całym obszarze: **scheduling na zegarze AudioContext, nie na `setTimeout`**.

```
lib/multi-track-engine.ts:551   const now = this.audioContext.currentTime   // po wszystkich awaitach ładowania
lib/multi-track-engine.ts:594   when = now + (clipStartInTimeline - offset)
lib/multi-track-engine.ts:609   sourceNode.start(when, sourceOffset, duration)
```

To jest poprawny, sample-accurate model i trzeba go zachować jako specyfikację. Wszystko powyżej tego jest niesprawne:

- **Eksport nie istnieje.** `mixToBuffer` (`:373`) / `exportMix` (`:423`) mają jedyne wywołanie w `components/multi-track-manager.tsx:177`, a ten komponent nie jest nigdzie importowany. W żywej ścieżce (`app/edit/projects/page.tsx`) nie ma przycisku eksportu — ikona `Download` jest zaimportowana w `multi-track-timeline.tsx:5` i nieużyta w JSX. A nawet po podłączeniu nie zadziałałby: `:392` czyta `this.trackBuffers.get(track.id)`, gdy timeline zapisuje pod `source.id` (`:492`) → `continue` dla każdej ścieżki → pusty bufor. Do tego ignoruje `clip.startTime/trimStart/trimEnd`, EQ (brak `createBiquadFilter`) i automatykę, a `sampleRate` ma na sztywno 44100 przy buforach dekodowanych w 48000 (niezamierzony resampling).
- **Brak `resume()`.** Konstruktor tworzy `new AudioContext()` (`:30-36`) z `useEffect` na montowaniu (`multi-track-timeline.tsx:69`), czyli przed jakimkolwiek gestem. W całym pliku nie ma słowa `resume`. Na iOS/Safari kontekst zostaje `suspended`, `currentTime` stoi, klipy są zaplanowane i nic nie leci — UI pokazuje „Pause" i zamrożony czas. Inne miejsca w repo o tym pamiętają (`studio/page.tsx:367-370`, `metronome.tsx:111`).
- **Automatyka na `requestAnimationFrame`.** `startAutomationLoop` (`:200-241`) wywołuje `applyAutomationAtTime` co klatkę rAF, a ta ustawia `setTargetAtTime(..., 0.02)` (`track-processor.ts:167-178`). Skutki: zamarza w nieaktywnej zakładce (muzyka zostaje przyduszona albo nie zostaje do końca odcinka), rozdzielczość = klatka i zależy od obciążenia GPU, **nie ma żadnego odpowiednika offline** (każdy przyszły renderer trzeba pisać od zera), i nie działa wcale gdy transport stoi. *(Uwaga: teza audytora, że `setTargetAtTime` „nigdy nie dochodzi do wartości zadanej" została obalona — przy tau=20 ms i kroku 16,7 ms błąd maleje o e^-0,83 na klatkę. Problem jest architektoniczny, nie arytmetyczny.)*
- **Stan transportu rozjeżdża się z React.** Silnik sam się zatrzymuje w `sourceNode.onended` (`:614-619`), `stop()` ustawia `isPlaying=false, pausedAt=0`. Nie ma żadnego callbacku do UI — `isPlaying` w komponencie zostaje `true`, `getCurrentTime()` zwraca 0 dla `!isPlaying` (`:303-312`), więc playhead skacze na 0, licznik pokazuje 0:00, przycisk mówi „Pause", a pętla rAF kręci się do końca życia karty.
- **Skala.** `:490-492` dekoduje cały plik do RAM, mapa nigdy nie czyszczona poza `dispose()`. 60 min / 48 kHz / stereo float32 = 172,8 mln ramek × 2 × 4 B = **1,38 GB**. Import dekoduje ten sam plik trzykrotnie: `generateWaveformData` (`multi-track-storage.ts:716-718`), `createAudioSource` (`:640-644`), pierwszy play (`engine:491`).

#### 1.4. Werdykty

| Plik | Werdykt | Uzasadnienie |
|---|---|---|
| **`lib/multi-track-engine.ts`** | **rewrite**, zachowaj wzorzec schedulingu | Model `start(when, offset, duration)` na `currentTime` (`:551/:594/:609`) jest poprawny i jedyny w repo — przenieś jako specyfikację. Reszta do wyrzucenia: eksport martwy i z rozjechanym kluczem (`trackBuffers` po `source.id` w `:492` vs `track.id` w `:392`), brak `resume()` (`:32`), automatyka na rAF bez odpowiednika offline (`:200-241`), brak callbacku stanu (`:614-619` vs `:204`), `sampleRate` 44100 na sztywno, legacy `trackGains`/`trackPanners` (`:14-17`) obok `trackProcessors`. |
| **`lib/automation.ts`** | **refactor** — zachowaj matematykę, wymień jednostki | Jedyny plik w tym obszarze bez importów DOM/Web Audio, czyli jedyny, który przenosi się 1:1 na Swift/Kotlin. `getValueAtTime` + smoothstep (3t²−2t³, `:62-121`) zostaje bez zmian. Do wymiany: `denormalizeValue` (`:126-141`) zwraca dla `volume` liniową amplitudę 0-1, a `formatValue` pokazuje procenty (`:172`) — przy lane'ie 60 px (`track-lane.tsx:65`) −6 dB to y=30 px, −12 dB to y=15, −18 dB to y=7,5, czyli typowy ducking mieszka w ostatnich kilku pikselach i jest nieustawialny. `createDuckCurve` (`:286-318`) i `normalizeValue` (`:147-162`) mają zero wywołań w repo — duck curve to jedyna funkcja podcastowa jaka istnieje i trzeba ją podłączyć. |
| **`lib/track-processor.ts`** | **rewrite** | Topologia (`input → EQ low/mid/high → volume → pan → output`, `:21-75`) jest sensowna i przenosi się pojęciowo, ale implementacja to konfiguracja `BiquadFilterNode`/`StereoPannerNode` — nie ma czego przenieść, bo cały DSP to czarne skrzynki przeglądarki. Do tego dwa błędy logiczne: flaga widoczności UI jest wyłącznikiem przetwarzania (`if (!lane.visible ...) continue`, `:131-132`, przełączana z `track-lane.tsx:157`), a automatyka EQ jest cicho ignorowana przy `processing.enabled=false` (`:175`) — dokładnie taką ścieżkę tworzy szablon „Muzyka" (`project-templates.ts:96-105`). Szablon „Podcast" tworzy lane volume z `visible:false` (`:54`), czyli automatyka istnieje w bazie i nie robi nic. |
| **`components/timeline/*`** | **rewrite** UI, zachowaj koncepcję | Cztery niezależne błędy geometrii: playhead odejmuje `scrollX` będąc wewnątrz przewijanego kontenera (`playhead.tsx:17` → efektywnie `t*pps − 2*scrollX`, przy większym scrollu `xPosition < -10` i kreska **znika**); nagłówek 160 px w tym samym flex-row co zawartość (`track-lane.tsx:66/75-83`) więc klip t=0 startuje na x=160 tam, gdzie playhead rysuje x=0; `automation-lane.tsx:168` przesuwa SVG o dodatkowe `-scrollX`; `TimeRuler` jest **poza** kontenerem i liczy x od 0 (`time-ruler.tsx:52/:92`) → klik w linijkę seekuje 1,6 s obok przy zoomie 100 px/s. Do tego: brak undo/redo (grep `undo|redo|history|snapshot` = 0 trafień), brak usuwania klipu i splitu (`deleteClip`/`deleteAudioSource` mają zero wywołań w repo), brak miksera (TrackLane ma 4 przyciski: mute/solo/automatyka/delete, `:100-142`; `project.masterVolume` nigdzie nie aplikowany), snap wymuszony 1 s bez UI do wyłączenia (`multi-track-timeline.tsx:264-266`), zapis do IndexedDB na **każdy** scroll (`:590-596`) i **każdy** mousemove (`audio-clip.tsx:128-134`), a trim lewej krawędzi wysyła dwa równoległe read-modify-write na ten sam rekord (`:162-163`) więc jedno pole nadpisuje drugie starą wartością. Canvas klipu przekracza limit 65535 px przy **5,5 min** klipu w domyślnym zoomie 100 px/s i dpr=2 (`audio-clip.tsx:51-54`) → waveform po prostu znika. |
| **`lib/multi-track-storage.ts`** | **refactor** schematu, **rewrite** implementacji | Model danych jest jedyną rzeczą w tym obszarze wartą pełnego zachowania: `AudioClip{startTime, duration, trimStart, trimEnd, audioSourceId}` + współdzielone `AudioSource` (`:18-48`) to poprawna edycja niedestrukcyjna, a `DB_VERSION = 3` (`:6`) to jedyne wersjonowanie schematu w repo. Do wyrzucenia: `audioBlob` w tym samym rekordzie co metadane (`:44`) — dlatego każda edycja punktu automatyki przeładowuje z bazy pełne bloby (`multi-track-timeline.tsx:356-441` → `loadTracks` → `:122 getAudioSource`) i przycina UI na kilkaset ms; brak GC (`deleteProject :214-236` idzie przez `deleteTrack :283-294`, który usuwa **tylko** rekord ścieżki → osierocone bloby, klipy i lane'y we wszystkich czterech pozostałych magazynach); martwy store `TEMPLATES` (`:12/:166-169`) obok osobnej bazy `vocal-coach-templates`; pola nigdy nieczytane (`useTimeline :111`, `loopEnabled/loopStart/loopEnd :65-67`, `Track.clips :97`); `generateWaveformData` stała rozdzielczość 1000 próbek ze średnią |x| i dzieleniem przez zero dla <1000 ramek (`:715/:721/:732`) → 3,6 s audio na punkt dla godzinnej ścieżki i NaN dla bardzo krótkich importów. |
| **`lib/audio-processor.ts`** *(dodatkowo)* | **rewrite**, zachowaj presety jako dane | Presety (`:36-117`) to czysty JSON i zostają jako punkt startowy. Cała reszta: brak limitera, brak ditheringu, `bitDepth=16` na sztywno, obcięty ogon reverbu, IR = biały szum, WAV writer z tablicą JS, `new AudioContext()` bez `try/finally` (`:127` / `close()` dopiero w `:222` na ścieżce sukcesu → kilka nieudanych dekodowań zabija Studio na dobre, limit ~6 kontekstów na kartę). |
| **`components/interactive-waveform.tsx`** *(dodatkowo)* | **rewrite** — utrata danych | `applyEditsToAudio` bierze źródło z aktualnie załadowanego bufora (`:209 getDecodedData()`), a offsety liczy w czasie **oryginału** (`:243-244`). Po pierwszym cięciu Studio podmienia blob (`studio/page.tsx:430`), WaveSurfer przeładowuje się na przyciętym audio, ale `deletedRegions`/`editHistory` **nie są resetowane** (brak `key={}`, `:905-910`). Drugie cięcie wycina materiał przesunięty o długość pierwszego regionu. Undo (`:326-340`) robi to samo w drugą stronę na skróconym buforze i nie przywraca nic. Nagranie ginie bezpowrotnie. To jest główna ścieżka montażu dla filaru PODCAST. |

#### 1.5. Czy to nadaje się pod edytor?

Nie w obecnej formie, i nie z powodu brakujących funkcji, a z powodu braku fundamentów:

1. **Brak undo/redo** to definicyjny blocker edytora. Dołożenie go do obecnej architektury (każda mutacja = bezpośredni `await` do IndexedDB rozsiany po 8 handlerach) wymaga i tak przebudowy całego przepływu stanu.
2. **Brak eksportu w żywej ścieżce** oznacza, że produkt nie ma wyjścia. Cała praca montażowa kończy się w IndexedDB.
3. **Brak jednego opisu DSP** — trzy niezależne łańcuchy EQ, dwa niezależne opisy tego samego przetwarzania, podgląd który nie zgadza się z renderem.
4. **Zero AudioWorkletu w repo** (grep `AudioWorklet|ScriptProcessor` = 0 trafień). Cała analiza i przetwarzanie na wątku głównym, sterowane rAF.

Werdykt całościowy: **rdzeń DSP i silnik do przepisania, model danych i wzorzec schedulingu do zachowania.**

---

### 2. Architektura silnika audio

#### 2.1. Zasada nadrzędna: jeden opis DSP, jeden rdzeń, trzy hosty

Odpowiedź na pytanie „czy to przenosi się na natywne" jest binarna i zależy od jednej decyzji: **czy DSP jest grafem węzłów Web Audio, czy własnym kodem.**

Węzły, które **liczą próbki**, są ślepym zaułkiem: `DynamicsCompressorNode` (brak makeup gain, zachowanie zależne od przeglądarki, różne krzywe w Chrome i Safari), `ConvolverNode`, `WaveShaperNode`, `BiquadFilterNode` (inne konwencje Q/gain niż cookbook RBJ dla części typów). Żaden nie istnieje na iOS/Android i żaden nie ma powtarzalnego zachowania.

*Korekta wobec części materiału źródłowego: `DynamicsCompressorNode` MA konfigurowalny `knee` (AudioParam 0-40 dB, default 30), `WaveShaperNode` MA wbudowany `oversample` ('none'|'2x'|'4x'), a `AnalyserNode` ma `smoothingTimeConstant` który można ustawić na 0 oraz `getFloatTimeDomainData()` zwracający surowe próbki bez okna. Argument za własnym rdzeniem jest więc inny i mocniejszy: nieprzenośność, brak determinizmu, brak testowalności, brak makeup gain, brak true-peak.*

Web Audio wolno używać **wyłącznie jako hosta**: `AudioContext` (zegar + I/O), `AudioWorkletNode` (cienka powłoka na WASM), `MediaStreamAudioSourceNode`, `AudioBuffer` (magazyn), `AudioBufferSourceNode` (sample-accurate scheduling — to jedno warto zachować).

Kontrakt rdzenia — nic więcej:

```c
void  dsp_process(void* state, const float* const* in, float* const* out, int nFrames);
void  dsp_reset(void* state);
void  dsp_set_curve(void* state, int paramId, const float* curve, int len, double startSec, double durSec);
int   dsp_latency_samples(void* state);
```

Ten sam plik `.c`/`.rs` idzie do: Emscripten/wasm-bindgen (web, `-msimd128`, **nigdy** relaxed-SIMD — nie ma w Safari), staticlib + XCFramework (iOS, pod `AVAudioSourceNode`/AUv3), cargo-ndk/CMake (Android, pod callback Oboe).

**Wybór języka: Rust.** Uzasadnienie: jedna osoba bez testów nie utrzyma C++ z UB w wątku audio; `rustfft 6.4.1` (2025-09-18, 23,1 mln pobrań) i `realfft 3.5.0` (2025-06-12, 13,8 mln) są MIT/Apache-2.0 i realnie utrzymywane; `rubato` (ostatni commit 2026-07-09) i `fundsp` (2026-03-03) to najżywsza część całego rozważanego zestawu. Ryzyko: **nie znalazłem ani jednego publicznie opisanego produktu komercyjnego mobile z rdzeniem RT-audio w Rust** — wszystkie przykłady wzorca (libsignal, Bitwarden, Mozilla app-services, Automerge) to krypto/CRDT/telemetria. Standardem branżowym dla RT audio pozostaje C/C++. To otwarte ryzyko doboru narzędzia, nie techniki.

**Wariant awaryjny**, jeśli Rust okaże się blokadą: czysty C11 (nie C++) — Emscripten do web, ten sam `.c` w Xcode i NDK. Traci bezpieczeństwo pamięci, zyskuje: `libebur128` i RNNoise wchodzą bez FFI, bo są już w C.

#### 2.2. Graf sygnałowy

```
                     ┌─ clip → clipGain → fade ─┐
źródła (OPFS/RAM) ───┼─ clip → clipGain → fade ─┼→ [TRACK CHAIN] ─┬→ [BUS] ─┬→ [MASTER] → out
                     └─ clip → clipGain → fade ─┘                 │         │
                                                                   └→ send ──┘
                        TRACK CHAIN = HPF → deplosive → gate/expander
                                    → deEsser → EQ(korekcyjny)
                                    → leveler(automatyka) → comp1 → comp2
                                    → EQ(tonalny) → saturate → gain → pan

                        MASTER = sum → EQ(opcjonalny) → loudnessTrim → limiter(TP, 4× OS) → dither
```

Realizacja w web, dwa etapy:

**Etap 1 (SING, ≤15 min na ścieżkę):** klipy jako `AudioBufferSourceNode` (Web Audio robi dekodowanie i sample-accurate scheduling — to już działa), jeden `AudioWorkletNode` per ścieżka hostujący WASM chain, buses/master jako kolejne worklety. Karaoke take 3-5 min stereo float32 = **115 MB** — mieści się w RAM bez problemu, więc streaming nie jest potrzebny.

**Etap 2 (PODCAST):** jeden `AudioWorkletNode` na cały mikser. Dedykowany Worker streamuje zdekodowany PCM z OPFS do ring buffera worklet-u. **Bez `SharedArrayBuffer`**: utwórz `MessageChannel`, przekaż jeden port do workletu przez `node.port.postMessage({port}, [port])`, drugi do Workera — daje bezpośrednią komunikację Worker↔Worklet bez COOP/COEP. Prefetch 2 s/ścieżka = 384 kB.

**Pułapka wdrożeniowa, o którą ten plan się zatrzyma na dzień:** w `AudioWorkletGlobalScope` nie ma `fetch()` ani XHR. Modułu `.wasm` nie da się tam wczytać — trzeba skompilować `WebAssembly.Module` na wątku głównym i przesłać go przez `postMessage`, instancjonując w konstruktorze procesora. Zrób z tego pierwszy spike, przed planowaniem czegokolwiek innego.

#### 2.3. Scheduling sample-accurate

Podstawa jest już poprawna w repo. Formuła:

```
when = tPlayStart + (clip.timelineIn - seekPos)
if (clip.timelineIn < seekPos):
    when     = tPlayStart
    sourceIn += (seekPos - clip.timelineIn)
    duration -= (seekPos - clip.timelineIn)
source.start(when, sourceIn, duration)
```

Do dołożenia:

- **Look-ahead scheduler.** Planuj tylko klipy z okna `[nowTimeline, nowTimeline + 2.0 s]`, przelicz co 250 ms. **Nie z `rAF`** (throttling w tle to dokładnie obecny bug automatyki) i **nie z `setTimeout` na wątku głównym** (Chrome dławi do 1/min po 5 min w tle). Poprawnie: `AudioWorkletProcessor` postuje tick co N bloków (np. co 94 bloki = 250 ms), wątek główny na to reaguje. Zegar audio steruje planowaniem, nie zegar obrazu.
- **Playhead z zegara audio, nigdy z akumulowanego czasu rAF.** Pozycję rysuj interpolując `enginePosition` do bieżącego `performance.now()`; to samo sprawia, że 30 fps wygląda jak 60. Akumulowanie delt rAF rozjeżdża paski z audio przez 3 minuty utworu.
- **Automatyka sample-accurate.** Etap 1: policz krzywą jako `Float32Array` przy 200 Hz dla okna look-ahead i podaj przez `AudioParam.setValueCurveAtTime(curve, when, dur)`. Etap 2: ewaluuj krzywą per blok wewnątrz `process()` z `currentFrame`. **Ta sama funkcja ewaluująca krzywą jest używana w renderze offline** — to jest cały mechanizm, który sprawia, że podgląd i eksport się zgadzają.
- **Crossfade na granicach cięć.** Punkt cięcia przesuń do lokalnego minimum energii w oknie ±40 ms, potem do najbliższego zero-crossing, potem crossfade 10-20 ms equal-power. Bez tego każde cięcie klika (nieciągłość amplitudy = impuls szerokopasmowy). To jest najczęstszy błąd pierwszych implementacji edytora.

#### 2.4. Edycja niedestrukcyjna — model

```ts
type Sec = number;   // sekundy na osi projektu
type Db  = number;   // decybele; gain = 10 ** (db / 20)

interface Project {
  schemaVersion: 4;
  id: string;                    // UUIDv7 (sortowalny czasowo)
  sampleRate: 48000;             // stała projektu, nie zależy od AudioContext
  tracks: Track[];
  clips: Clip[];                 // płaska lista, referencja przez trackId
  sources: AudioSourceRef[];
  buses: Bus[];
  master: ChainSpec;
  updatedAt: number; deviceId: string; deletedAt: number | null;
}

interface AudioSourceRef {
  id: string;
  fileRef: string;               // ścieżka w OPFS / na dysku — NIGDY Blob w rekordzie
  format: 'flac24' | 'wav-i24' | 'wav-f32';
  sampleRate: number; channels: 1 | 2; frames: number;
  peakFileRef: string;           // piramida LOD, osobny plik
  loudness?: { integratedLufs: number; truePeakDbtp: number; noiseFloorDbfs: number };
}

interface Clip {
  id: string; trackId: string; sourceId: string;
  timelineIn: Sec;               // gdzie próbka sourceIn ląduje na osi projektu
  sourceIn: Sec;                 // offset w źródle
  duration: Sec;
  gainDb: Db;
  fadeIn: Fade; fadeOut: Fade;
  // proweniencja kompensacji latencji — audytowalna i odwracalna
  capture?: {
    latencyRtMs: number; manualNudgeMs: number;
    inputDeviceId: string; outputDeviceId: string;
    calibratedAt: number; method: 'sweep' | 'platformApi' | 'manual';
  };
}
interface Fade { ms: number; shape: 'linear' | 'equalPower' | 'exp' }

interface Track {
  id: string; name: string;
  role: 'voice' | 'music' | 'sfx' | 'vocalLead' | 'backing';
  mute: boolean; solo: boolean;
  gainDb: Db; pan: number;       // -1..1
  chain: ChainSpec;              // DEKLARATYWNY opis, nie węzły Web Audio
  lanes: AutomationLane[];
  output: string;                // busId
}
```

Kluczowe: `ChainSpec` jest **deklaratywny**. Jeden opis, dwa konsumenci (realtime worklet i offline renderer), zero szans na rozjazd.

```ts
type ChainSpec = ProcessorSpec[];

type ProcessorSpec =
  | { kind:'hpf';       hz:number; order:2|4|8 }
  | { kind:'deplosive'; detectLoHz:number; detectHiHz:number; thresholdDb:Db;
                        contrastDb:Db; hpFromHz:number; hpToHz:number;
                        attackMs:number; releaseMs:number }
  | { kind:'expander';  thresholdDb:Db; ratio:number; rangeDb:Db;
                        attackMs:number; holdMs:number; releaseMs:number; hysteresisDb:Db }
  | { kind:'eq';        bands: EqBand[] }
  | { kind:'deEsser';   loHz:number; hiHz:number; q:number; thresholdDb:Db;
                        ratio:number; attackMs:number; releaseMs:number; maxReductionDb:Db }
  | { kind:'comp';      thresholdDb:Db; ratio:number; attackMs:number; releaseMs:number;
                        kneeDb:Db; detector:'peak'|'rms'; rmsMs:number; makeupDb:Db }
  | { kind:'saturate';  driveDb:Db; oversample:2|4; mix:number; asym:number }
  | { kind:'send';      busId:string; sendDb:Db; preFader:boolean }
  | { kind:'limiter';   ceilingDbtp:Db; lookaheadMs:number; releaseMs:number; oversample:4 }
  | { kind:'trim';      db:Db }
  | { kind:'denoise';   model:'rnnoise'|'dfn3ll'|'dpdfnet2_48k'; mix:number; maxAttenDb:Db }
  | { kind:'dereverb';  taps:number; delayFrames:number; iterations:number; mix:number };

interface EqBand {
  type:'lowshelf'|'peaking'|'highshelf'|'notch'|'dynamic';
  hz:number; gainDb:Db; q:number;
  dynamic?: { thresholdDb:Db; ratio:number; attackMs:number; releaseMs:number };
}

interface AutomationLane {
  id: string;
  param: ParamPath;              // 'gainDb' | 'pan' | 'chain[3].bands[1].gainDb' | 'chain[7].sendDb'
  unit: 'dB' | 'hz' | 'ratio' | 'pan' | 'norm';
  points: { t: Sec; v: number; curve:'linear'|'smooth'|'hold' }[];
  enabled: boolean;              // ≠ widoczność w UI (to jest obecny bug track-processor.ts:131)
  visible: boolean;              // wyłącznie UI, ZERO wpływu na DSP
  origin: 'user' | 'computed';   // 'computed' = leveler/ducking, przeliczalne
}
```

Dwie reguły niepodlegające negocjacji, wprost z audytu:

1. **`enabled` jest oddzielone od `visible`.** Dziś flaga widoczności UI jest wyłącznikiem przetwarzania.
2. **Wszystkie poziomy w dB.** Dziś `volume` to liniowa amplituda 0-1, więc ducking −12…−20 dB mieszka w 7 pikselach lane'a. Fader taper −60…+6 dB, `gain = 10^(dB/20)`, formatowanie w dB. Ta decyzja i tak musi być podjęta przed portem — `AVAudioUnitEQ` i Oboe operują na dB.

#### 2.5. Undo/redo — konkretny model

**Command pattern z operacjami odwrotnymi na EDL, nie snapshoty.**

```ts
interface Command {
  readonly kind: string;
  apply(s: Project): Project;              // czysta funkcja
  invert(s: Project): Command;             // odwrotność, liczona PRZED apply
  coalesceWith?(next: Command): Command | null;
  storageWrites(s: Project): StorageOp[];  // JEDNA transakcja na komendę
}

class History {
  private undo: Command[] = [];
  private redo: Command[] = [];
  exec(c: Command) { /* invert → apply → push → clear redo → 1× zapis */ }
  undoStep() { /* pop → apply inverse → push to redo */ }
  redoStep() { /* symetrycznie */ }
}
```

Dlaczego to, a nie snapshoty: jedna operacja to 200-500 B, 10 000 operacji to 5 MB w pamięci — snapshot całego EDL projektu podcastowego to megabajty na krok.

**`coalesceWith` rozwiązuje trzy bugi jednocześnie.** Drag klipu produkuje `MoveClip` na każdy mousemove; `coalesceWith` scala je, jeśli dotyczą tego samego klipu i przyszły w ciągu 500 ms → cały drag to **jeden** krok undo. A `storageWrites` wykonuje się **tylko na mouseup**. To eliminuje: (a) zapis do IndexedDB na każdy mousemove i każdy scroll, (b) dwa równoległe read-modify-write przy trim lewej krawędzi — bo trim to jedna komenda `TrimClipLeft{clipId, trimStart, startTime}` z jednym zapisem obu pól, (c) niespójny stan po przeładowaniu projektu.

Zestaw komend dla MVP edytora: `MoveClip`, `TrimClipLeft`, `TrimClipRight`, `SplitClip`, `DeleteClip`, `SetClipGain`, `SetFade`, `AddAutomationPoint`, `MoveAutomationPoint`, `DeleteAutomationPoint`, `SetTrackParam`, `AddTrack`, `DeleteTrack`, `SetChainParam`.

**Stan transportu ma jednego właściciela — silnik.** UI subskrybuje, nie trzyma kopii. `handlePlay` ustawia `isPlaying` na podstawie **zwrotki** ze silnika (liczby zaplanowanych klipów), nie bezwarunkowo. Silnik emituje `onStateChange` z `stop()` i z `onended`, zostawiając `currentTime` na końcu projektu, nie na zerze.

#### 2.6. Render offline

**Nie używaj `OfflineAudioContext` do produktu końcowego.** Trzy powody: (1) długość renderu trzeba znać z góry, co jest bezpośrednią przyczyną obecnego bugu z obciętym ogonem reverbu; (2) zawiera `DynamicsCompressorNode`, którego zachowanie zależy od przeglądarki, więc eksport brzmi inaczej na Safari i Chrome; (3) nie przenosi się na natywne.

Zamiast tego: ten sam WASM chain w Workerze, blok po bloku, czyta z OPFS, pisze do OPFS. Faster-than-realtime, progress, anulowalny, bez limitu długości, bit-identyczny z natywnym.

```ts
interface RenderOptions {
  range?: { in: Sec; out: Sec };
  tailSec: number;                    // ≥ najdłuższy ogon reverbu/delayu — NAPRAWIA obecny bug
  loudness: { targetLufs: number; ceilingDbtp: number; mode: 'normalize' | 'measureOnly' };
  bitDepth: 16 | 24 | 32;
  dither: 'none' | 'tpdf';            // TPDF obowiązkowy dla 16-bit
  blockSize: 1024;                    // większy niż RT — mniej narzutu
}

interface RenderResult {
  fileRef: string;
  measured: { integratedLufs: number; truePeakDbtp: number; lra: number;
              maxSamplePeakDbfs: number; clippedSamples: number };
  chainSnapshot: ChainSpec[];         // dokładnie to, co zostało wyrenderowane
}
```

`clippedSamples > 0` w wyniku = twardy błąd pokazywany użytkownikowi, nie cicha degradacja.

**Enkoder WAV — poprawka, którą trzeba zrobić w jednym miejscu na całe repo:**

```
1. Zaalokuj ArrayBuffer(44 + frames * blockAlign) od razu (rozmiar znany z góry).
2. Wyciągnij getChannelData(ch) RAZ przed pętlą, do tablicy referencji.
3. Pisz DataView.setInt16 / Int16Array w jednym przebiegu, bez tablicy pośredniej.
4. Rób to w Workerze, strumieniując chunki do tablicy fragmentów Blob.
```

To usuwa 460 MB alokacji pomocniczej i 57 mln wywołań Web IDL na 10-minutowym stereo, i usuwa trzy kopie tego samego kodu.

---

### 3. Łańcuch SING — od mikrofonu do pliku

#### 3.1. Rozdzielenie monitoringu od renderu

To są **dwa różne łańcuchy z różnymi budżetami**, i mieszanie ich jest głównym błędem konstrukcyjnym w tej klasie aplikacji.

| | Monitoring (realtime) | Render (offline) |
|---|---|---|
| Budżet latencji | ≤15-20 ms round-trip | brak |
| Lookahead | **zero** | dowolny |
| Efekty | HPF, łagodny comp, krótki reverb | wszystko |
| Modele ML | nie | tak |
| Korekcja wysokości | nie | tak |
| Platformy | **tylko natywne** | wszystkie |

**W przeglądarce nie oferuj monitoringu z efektami. W ogóle.** Round-trip w web to 30-100+ ms zanim dodasz cokolwiek własnego, a na iOS Safari nie da się wyłączyć przetwarzania wejścia (patrz §8). Śpiewanie z podsłuchem opóźnionym o >15-20 ms jest dezorientujące jak DAF. Komunikat w UI: „Podsłuch własnego głosu: użyj bezpośredniego monitoringu interfejsu audio albo śpiewaj bez podsłuchu. Nagranie zostanie automatycznie zsynchronizowane z podkładem." Świadome okrojenie funkcji web, zakomunikowane wprost, jest lepsze niż funkcja, którą użytkownicy zgłoszą jako „echo".

**Na natywnym monitoring ma sens:**

- iOS: `AVAudioSession` category `.playAndRecord`, mode **`.measurement`** (wyłącza systemowe EQ/AGC/ochronę głośnika — to jest tryb do pomiaru; `.voiceChat` włącza AEC/AGC i jest dla karaoke z głośnika, nie dla pomiaru), `setPreferredIOBufferDuration(0.005)` → system zaokrągli do **256 ramek ≈ 5,33 ms** na kierunek (0.005 × 48000 = 240, zaokrąglane w górę). Realny round-trip z przewodem: 8-16 ms.
- Android: Oboe, `PERFORMANCE_MODE_LOW_LATENCY`, `SHARING_MODE_EXCLUSIVE`, bufor = wielokrotność `AAudioStream_getFramesPerBurst()` (typowo 96-256, fallback 256). **Ale**: nie ma API runtime do odczytu faktycznej latencji, wartości „różnią się drastycznie między modelami i buildami" (dokumentacja Google), callbacki wejścia i wyjścia **nie są zsynchronizowane**, a sample rate wejścia i wyjścia mogą się różnić (potrzebny asynchroniczny resampling). Flagi `android.hardware.audio.pro` (≤20 ms round-trip) i `android.hardware.audio.low_latency` (≤45 ms wyjścia) deklaruje ułamek rynku. **Monitoring na Androidzie musi być funkcją warunkową**, włączaną po `PackageManager.hasSystemFeature()` + własnym pomiarze loopbackowym, z jawnym fallbackiem. Inaczej dostaniesz recenzje „echo" dokładnie tam, gdzie obiecujesz przewagę natywnego.

Łańcuch monitoringu (zero lookahead, ~40 mnożeń na próbkę):

```
HPF 80 Hz (Butterworth 12 dB/oct)
  → comp: ratio 2:1, attack 10 ms, release 150 ms, threshold dla 3 dB GR, knee 6 dB
  → send do reverbu: pre-delay 15 ms, RT60 0,8 s, HPF 250 Hz, LPF 6 kHz, wet -20 dB
  → out
```

Bez limitera z lookahead, bez de-essera z lookahead, bez denoise (DFN dodaje 20 ms okno), bez korekcji wysokości.

#### 3.2. Kompensacja latencji nagrania na podkład

**To jest dziś kompletnie nieobsłużone i psuje każde nagranie karaoke.** Grep po całym repo za `baseLatency|outputLatency|getOutputTimestamp|latencyHint` daje **0 trafień**. Do tego `app/record/karaoke/page.tsx` uruchamia rzeczy w kolejności: `mediaRecorder.start(100)` (`:240`) → `setIsRecording(true)` (`:242`) → `setInterval` (`:246`) → `player.playVideo()` (`:251`), nie mierząc ani nie zapisując żadnego offsetu. `startKaraoke` nie robi `player.seekTo(0)`, więc po wcześniejszym odsłuchu nagranie startuje w losowym miejscu ścieżki, a `player.getCurrentTime()` nigdy nie jest odczytywany — offsetu nie da się odtworzyć nawet post factum.

##### Warunek wstępny: koniec z YouTube jako podkładem

Kompensacja jest **matematycznie niemożliwa** z iframe YouTube: nie znasz momentu, w którym próbka 0 podkładu opuściła transducer, `getCurrentTime()` ma granulację ~250 ms i własną, nieznaną latencję pipeline'u, a blob z MediaRecordera nie zawiera żadnego znacznika czasu odniesienia. Doszedł do tego drugi argument: warunki YouTube nie pozwalają na nagrywanie ani miksowanie. Podkład musi być **lokalnym, zdekodowanym `AudioBuffer`**, schedulowanym na `AudioContext.currentTime` przez `start(when)`.

##### Model matematyczny

Definicje:
- `t_sched` — czas `AudioContext`, na który zaplanowana została próbka 0 podkładu.
- `L_out` — latencja wyjścia (schedule → dźwięk opuszcza transducer).
- `L_in` — latencja wejścia (dźwięk trafia w mikrofon → próbka ląduje w buforze workletu).
- `L_rt = L_out + L_in` + czas przelotu akustycznego (pomijalny, patrz niżej).

Próbka mikrofonu, która ląduje w workleecie w czasie `t_arrive`, została wyprodukowana przez śpiewaka w `t_arrive − L_in`. Podkład, który śpiewak wtedy słyszał, był na pozycji:

```
p = (t_arrive − L_in) − (t_sched + L_out) = (t_arrive − t_sched) − L_rt
```

**Wniosek: nagranie trzeba przesunąć WCZEŚNIEJ o `L_rt`** względem naiwnego założenia „próbka 0 nagrania = próbka 0 podkładu".

Praktycznie:

```
1. Startuj nagrywanie (worklet) ≥500 ms PRZED podkładem — masz materiał do przycięcia.
2. Zapisz t_rec_start = czas AudioContext pierwszej przechwyconej ramki
   (worklet zna to dokładnie z currentFrame / sampleRate, nie z Date.now()).
3. Zaplanuj podkład: backing.start(t_sched), gdzie t_sched = ctx.currentTime + 0.3.
4. Po stopie:  clip.timelineIn = (t_rec_start − t_sched) − L_rt
5. Ustaw clip.sourceIn tak, żeby nic nie wypadło przed timeline 0.
6. Zapisz w clip.capture: { latencyRtMs, inputDeviceId, outputDeviceId, calibratedAt, method }
```

Punkt 6 jest istotny: kompensacja musi być **audytowalna i odwracalna**. Jeśli kalibracja okaże się później błędna, przeliczasz `timelineIn` bez ponownego nagrywania.

##### Procedura kalibracji — akustyczny loopback (metoda podstawowa)

Mierzy pełny round-trip dla konkretnej pary urządzeń, jednym pomiarem, bez założeń o platformie.

**Sygnał:** wykładniczy sweep (chirp) **500 Hz → 8 kHz, 250 ms**, amplituda −6 dBFS (0.5), z 10 ms fade-in/out (okno Hanna na krawędziach). Dolna granica 500 Hz nie jest przypadkowa: głośniki telefonów zjeżdżają gwałtownie poniżej ~500 Hz, a niżej siedzą mody pomieszczenia i przydźwięk sieciowy. Górna 8 kHz: powyżej zaczyna się rolloff i obszar antyaliasingu.

**Przebieg:**

```
1. AudioContext({ latencyHint: 'interactive' }).
   getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false,
                           autoGainControl: false, channelCount: 1 } })
   → NATYCHMIAST sprawdź track.getSettings(): jeśli którakolwiek flaga nie jest false,
     zapisz to i obniż zaufanie do pomiaru (patrz uwaga o iOS niżej).
2. Zaplanuj sweep: source.start(t0), gdzie t0 = ctx.currentTime + 0.2 (margines bezpieczeństwa).
3. Nagrywaj przez AudioWorklet; każdy blok 128 ramek ma znany indeks próbki (currentFrame).
4. Matched filter: skoreluj nagranie z odwróconym w czasie, skorygowanym amplitudowo sweepem
   (= dekonwolucja). Okno poszukiwań: 0 → 500 ms po t0.
5. Pozycję piku wyznacz interpolacją paraboliczną na korelacji → dokładność podpróbkowa,
   praktycznie <0,1 ms.
6. L_rt = t1 − t0.
7. ODRZUĆ pomiar, jeśli:
   - prominencja piku (peak / RMS korelacji) < 6 dB → „za głośno w pokoju, spróbuj w ciszy"
   - pik na krawędzi okna poszukiwań
   - L_rt < 3 ms (fizycznie niemożliwe — błąd pomiaru)
8. Powtórz 5×, weź MEDIANĘ (nie średnią — jeden trzask drzwiami psuje średnią).
9. Zapisz per para (inputDeviceId, outputDeviceId) z MediaDeviceInfo + sampleRate + timestamp.
```

**Przelot akustyczny:** głośnik laptopa → mikrofon to ~0,1-0,3 m = 0,3-0,9 ms; na telefonie (głośnik i mikrofon oba na dole) ~0,02 m = 0,06 ms. Wobec 30-200 ms latencji cyfrowej pomijalne — nie odejmuj, ale użyj progu `L_rt ≥ 3 ms` jako sanity check.

##### Zmiana routingu i słuchawki

Ze słuchawkami nie zrobisz akustycznego loopbacku ścieżki słuchawkowej. Hierarchia rozwiązań:

1. **`Δ outputLatency`.** Jeśli `AudioContext.outputLatency` jest dostępne (Chrome 102+, Firefox 70+, **Safari/iOS dopiero 18.4+**), przy zmianie routingu skoryguj: `L_rt_new = L_rt_cal + (outputLatency_new − outputLatency_cal)`.
2. **Ponowna kalibracja** — jeśli `outputLatency` niedostępne (Safari <18.4).
3. **Ręczny nudge ±200 ms** z podglądem A/B, zawsze dostępny, per projekt. Trzymaj go w **osobnym polu** (`manualNudgeMs`) niż wartość zmierzoną — nigdy nie nadpisuj pomiaru.
4. **Blokada Bluetooth.** A2DP dokłada 100-250 ms i jest skrajnie zmienny per urządzenie. Reguła: jeśli zmierzone `L_rt > 150 ms` → ostrzeżenie „prawdopodobnie masz słuchawki Bluetooth; nagranie będzie rozjechane, użyj przewodowych". Na iOS słuchawki Bluetooth z profilem HFP dodatkowo **wymuszają sampleRate 16 kHz i resetują AudioContext** — rdzeń musi to przeżyć (własny resampling do wewnętrznych 48 kHz).

##### Walidacja per-take

Opcjonalny drugi kanał pomiaru: **sync tick** na `t=0` podkładu — dwuton 1 kHz + 3 kHz, 30 ms, −40 dBFS, w czasie 500 ms count-inu. Przy otwartych lub nieszczelnych słuchawkach przecieka do mikrofonu wystarczająco, by skorelować i zmierzyć `L_rt` **dla tego konkretnego take'u**, bez osobnej kalibracji. Przy słuchawkach zamkniętych nie przecieknie — wtedy prominencja korelacji < 6 dB i po cichu pomijasz, wracając do zapisanej kalibracji. Tanie, i w połowie przypadków daje pomiar dokładniejszy niż kalibracja.

Kryterium akceptacji całości: po kompensacji korelacja krzyżowa nagrania z podkładem w pasmie 100-4000 Hz (jeśli jest jakikolwiek przeciek) daje resztkowy offset **<5 ms**.

##### Na natywnym

iOS daje `AVAudioSession.inputLatency`, `outputLatency` i `ioBufferDuration` — użyj sumy jako prior, potem zwaliduj **jednym** loopbackiem. Android nie ma żadnego takiego API, więc **pomiar loopbackowy jest obowiązkowy**, nie opcjonalny.

##### Ograniczenie, które trzeba przyjąć wprost

Na iOS Safari **nie da się wyłączyć `noiseSuppression` ani `autoGainControl`** — te constrainty nie są wspierane w ogóle (`MediaTrackSupportedConstraints`: `safari: false`, `safari_ios: false`; wspierane jest tylko `echoCancellation`). NS może częściowo wytłumić sweep, AGC zmienia jego obwiednię. Mitygacja: sweep na −6 dBFS, 5 powtórzeń; jeśli wszystkie 5 nie przejdą progu prominencji, spadnij na `baseLatency + outputLatency` + ręczny nudge i **powiedz to użytkownikowi**. To samo ograniczenie oznacza, że pomiary poziomu i F0 na iOS Safari nie są porównywalne z desktopem — i jest to najmocniejszy techniczny argument za aplikacją natywną w całym tym dokumencie.

#### 3.3. Pełny łańcuch SING (render)

Parametry startowe. Wszystkie do dostrojenia na własnym zestawie referencyjnym, ale to są sensowne punkty wyjścia, nie zgadywanie.

| # | Blok | Parametry startowe |
|---|---|---|
| 0 | Kompensacja latencji | przesunięcie o zmierzone `L_rt` (§3.2) |
| 1 | DC block | 1-biegunowy HP @ 5 Hz |
| 2 | HPF | Butterworth 24 dB/oct (4 biquady): **80 Hz** głos męski, **110 Hz** żeński, **60 Hz** bas (C2 = 65,4 Hz) |
| 3 | De-plosive (dynamiczny HP) | detektor RMS 20-120 Hz; wyzwól gdy RMS(20-120) > **−30 dBFS** **i** > RMS(300-3000) + **12 dB** → HP 80 → **180 Hz**, attack 20 ms, release 120 ms |
| 4 | Denoise *(domyślnie OFF)* | RNNoise v0.2, **mix wet 30-50%, nigdy więcej**, cap atenuacji **−8 dB** |
| 5 | Dereverb *(opcjonalnie)* | WPE: taps **24** @48 kHz, delay **3** ramki, **4** iteracje, mix 60% |
| 6 | Expander (nie gate) | threshold = noise floor + **8 dB**, ratio **2:1**, range max **−8 dB** (nigdy −∞), attack 3 ms, hold 80 ms, release 350 ms |
| 7 | Korekcja wysokości | Signalsmith Stretch, parametry w §6 |
| 8 | EQ korekcyjny (tylko cięcia) | −3 dB @ 300 Hz Q=1,0 (mud); −2 dB @ 500 Hz Q=1,5 (kartonowo, warunkowo); **dynamiczny** −3 dB @ 2-3 kHz z threshold zamiast statycznego cięcia |
| 9 | De-esser | pasmo **6-10 kHz**, centrum **7,5 kHz**, Q=1,6, ratio **4:1**, attack **0,3 ms**, release **45 ms**, redukcja 3-8 dB, **hard cap 8 dB** |
| 10 | Kompresor 1 | ratio **3:1**, threshold dla **4 dB GR**, attack 8 ms, release 120 ms, soft knee 6 dB, detektor RMS 10 ms |
| 11 | Kompresor 2 (szybki) | ratio **6:1**, threshold dla **3 dB GR**, attack **1,5 ms**, release 60 ms, knee 2 dB, detektor peak. **Suma GR 6-12 dB** |
| 12 | Saturacja | `tanh` z lekką asymetrią, **4× oversampling (obowiązkowo)**, THD ~3%, mix parallel 25% |
| 13 | EQ tonalny (podbicia) | presence **+3 dB @ 4 kHz** Q=0,8; air high-shelf **+3 dB @ 11 kHz** |
| 14a | Send: Reverb (FDN 8×8) | pre-delay **25 ms**, RT60 **1,4 s**, HPF sendu **250 Hz**, LPF **7 kHz**, HF damping 0,45, wet **−16 dB**, ducking wokalem −3 dB / release 100 ms |
| 14b | Send: Delay (slap) | **110 ms**, feedback 8%, wet −20 dB, HPF 300 Hz + LPF 4 kHz w pętli. Sync 3/16: `delay_ms = 60000/BPM × 0,75` |
| 14c | Send: Doubler | offsety **22** i **31 ms**, detune **−12** i **+9 centów**, pan ±55%, poziom −8 dB, dryf ±10 centów @0,4 Hz + modulacja opóźnienia ±3 ms. **Offset MUSI być <30 ms** (fuzja Haasa); >40 ms czyta się jako echo. Detune realizuj modulowaną frakcyjną linią opóźniającą, **nie** pełnym pitch-shifterem — 10× taniej |
| 15 | Bus wokalu (glue) | ratio 1,5:1, attack 20 ms, release 200 ms, **1-2 dB GR** |
| 16 | Miks z podkładem | short-term LUFS wokalu **3-6 dB nad instrumentalem** (pop). Praktycznie: peak wokalu ~−6 dBFS, podkład ~−10 dBFS |
| 17 | Master | normalizacja **−14 LUFS** integrated, limiter ceiling **−1,0 dBTP**, lookahead 5 ms, release 60 ms, true-peak z **4× oversamplingiem** |
| 18 | Render | `tailSec ≥ RT60 + ogon delayu` (min. 2 s) — inaczej ogon reverbu jest obcięty (obecny bug) |
| 19 | Konwersja | TPDF dither przy 16-bit; raport `clippedSamples` |

**Reguła #1 przeciw mulastemu karaoke:** HPF 250 Hz i LPF 7 kHz **na sendzie reverbu**. To jedna zmiana, która naprawia „brudny" reverb i jest najczęściej pomijana.

**Kluczowa bramka jakości dla filaru SING.** Nie ma opublikowanego pomiaru wpływu modeli speech enhancement na odszumianie i dereverb **śpiewu**. *(Praca arXiv 2607.11630, którą część materiału źródłowego cytowała jako dowód, dotyczy w rzeczywistości SEPARACJI wokalu od podkładu — nie odszumiania śpiewu — i nie zawiera żadnego dowodu na tłumienie vibrato ani przedłużonych samogłosek.)* Skoro nie ma literatury, decyzja musi zapaść na Twoim zestawie referencyjnym, a kryterium jest mierzalne i darmowe, bo detektor F0 już masz:

```
Przepuść wejście i wyjście przez istniejący YIN i wymagaj:
  median |ΔF0| < 5 centów
  zgodność ramek voiced/unvoiced > 98%
  |Δ integrated LUFS| < 0,5 LU (po wyrównaniu gainu)
Jeśli którykolwiek warunek pada → łańcuch jest zbyt agresywny.
```

To zamienia „brzmi lepiej / brzmi gorzej" w liczbę i jest jedynym uczciwym sposobem obrony przed tym, że aplikacja oceniająca intonację sama tę intonację zmienia.

---

### 4. Łańcuch PODCAST

#### 4.1. Kolejność

Cztery reguły, których zamiana jest najczęstszym błędem łańcucha mownego:

1. **Cięcia korekcyjne PRZED kompresją** — żeby kompresor nie reagował na problem, który zaraz usuwasz.
2. **De-esser PRZED kompresją** — inaczej kompresor podniesie „s" z powrotem.
3. **Podbicia tonalne PO kompresji** — żeby kompresor ich nie zjadł.
4. **Expander, nie gate, na początku** — klasyczny gate na mowie „trzaska" i wycina końcówki wyrazów.

Plus: dwa stopnie łagodnej kompresji zamiast jednego mocnego. Wolny leveler wyrównuje poziom zdań, szybki łapie transjenty spółgłosek — łącznie brzmi to naturalniej niż 10 dB z jednego kompresora.

#### 4.2. Łańcuch per ścieżka

| # | Blok | Parametry startowe |
|---|---|---|
| 1 | DC block | 1-biegunowy HP @ 5 Hz |
| 2 | HPF | Butterworth 12 dB/oct: **80 Hz** męski, **100 Hz** żeński. Notch 50/100/150 Hz Q=30 **tylko** przy brumie sieciowym |
| 3 | De-plosive | jak w SING (HP 80 → 180 Hz) |
| 4 | Denoise | RNNoise v0.2 (domyślnie), cap atenuacji **12 dB**. Model docelowy wybrany pomiarem — patrz §4.4 |
| 5 | Dereverb | WPE taps **24** @48 kHz, delay 3, **4** iteracje. Włącz tylko jeśli zmierzony SRMR rośnie |
| 6 | **Crosstalk gate** (multitrack) | na ścieżce A: jeśli RMS_B > RMS_A + **6 dB** → duck A o **12-18 dB**, attack 5 ms, hold 100 ms, release 200-400 ms |
| 7 | Expander | threshold = noise floor + **8 dB**, ratio 2:1, range max **−12 dB**, attack 2 ms, hold 60 ms, release 200 ms, **histereza 4 dB** |
| 8 | EQ korekcyjny (cięcia) | −3 dB @ **250 Hz** Q=1,2 (mud); −2 dB @ **400 Hz** Q=1,4 (boxiness); −2,5 dB @ **1 kHz** Q=2,5 (nasal, warunkowo); −2 dB @ **3,5 kHz** Q=3 (harsh, warunkowo) |
| 9 | De-esser | pasmo **5-9 kHz**, centrum **6,5 kHz** męski / **8 kHz** żeński, bandpass Q=1,8, threshold dla **4 dB** redukcji na najgłośniejszym „s", ratio 4:1, attack 0,5 ms, release 60 ms, **cap 6 dB** |
| 10 | **Adaptive leveler** | patrz §4.5 |
| 11 | Kompresor 1 (leveler) | ratio **2:1**, threshold dla **4 dB GR**, attack 15 ms, release 250 ms, soft knee 8 dB, detektor RMS 10 ms |
| 12 | Kompresor 2 (peak) | ratio **3,5:1**, threshold dla **3 dB GR**, attack 4 ms, release 90 ms, knee 4 dB, detektor peak. **Suma GR 6-10 dB** |
| 13 | Saturacja | `tanh`, **4× oversampling**, THD ~1,5%, mix parallel 15% |
| 14 | EQ tonalny | presence **+2,5 dB @ 3 kHz** Q=0,9; air high-shelf **+1,5 dB @ 9 kHz**. **Przy tanim mikrofonie ZERO air** — podniesiesz tylko szum |

#### 4.3. Normalizacja LUFS

Implementuj pełne ITU-R BS.1770-4 z gatingiem + true-peak limiter. To najlepszy stosunek wartości do nakładu w całym projekcie: ~150-200 linii deterministycznego, w pełni testowalnego kodu, dający wynik porównywalny z Auphonic co do dziesiątej części LU. Do tego jest to **pierwsze miejsce w repo, gdzie test jednostkowy ma oczywisty sens** — masz referencyjne pliki EBU TECH 3341 z zadanymi wartościami.

**Nie pisz K-weightingu samodzielnie.** BS.1770 podaje współczynniki biquadów **tylko dla 48 kHz**, a `AudioContext.sampleRate` na wielu Macach to 44100. Użycie współczynników 48k przy 44,1k daje błąd 0,3-0,5 LU — to typowy bug w portach JS. Zamiast tego: **`libebur128` (MIT), vendorowany jako przypięta kopia, ~2000 LOC C**, kompilowany do WASM (30-60 kB po `-Oz`), i **ten sam `.c` linkowany na iOS i Androidzie**. Obsługuje dowolny sample rate i daje true peak z 4× oversamplingiem, którego Web Audio nie ma w ogóle.

⚠️ **`libebur128` jest porzucony — ostatni commit 2021-02-14.** Konsekwencje: wendoruj przypiętą kopię do repo (nie zależność), nie licz na upstream fixy, i **obowiązkowo napisz testy zgodności na materiale EBU TECH 3341/3342**. To jednocześnie pierwsze prawdziwe testy w projekcie i dowód poprawności portu na iOS/Android.

Cele — **zweryfikowane u źródła:**

| Platforma | Integrated | True peak | Źródło |
|---|---|---|---|
| **Apple Podcasts** | **−16 LUFS ±1** | **≤ −1,0 dBFS** | „the overall loudness remains around -16 dB LKFS, with a +/- 1 dB tolerance" + „the true-peak value doesn't exceed -1 dB FS" — **bez rozróżnienia mono/stereo** |
| **Spotify (muzyka)** | normalizuje do **−14 LUFS** | **< −1 dB TP**; **< −2 dB TP** jeśli master głośniejszy niż −14 LUFS | „-14 dB LUFS, according to the ITU 1770 standard" |
| Spotify — tryby użytkownika | Loud −11 / Normal −14 / Quiet −19 | — | jak wyżej |

Rozpowszechniony mit „−19 LUFS dla mono w Apple Podcasts" **nie występuje w aktualnej specyfikacji Apple** — tolerancja i cel są identyczne dla mono i stereo.

⚠️ **Niezweryfikowane** (nie wpisuj do kodu bez sprawdzenia): YouTube ~−14, Amazon Music −14/−2 dBTP, Tidal −14, AES TD1004 −16…−20/−1 dBTP, EBU R128 broadcast −23/−1 dBTP, ATSC A/85 −24 LKFS/−2 dBTP.

**Wartości do wpisania w presety:**

```
PODCAST:  −16 LUFS integrated / −1,5 dBTP / LRA cel 3-8 LU (docelowo ~5)
SING:     −14 LUFS integrated / −1,0 dBTP / LRA 5-12 LU
```

Dlaczego −1,5 dBTP dla podcastu, a nie −1,0: kodowanie lossy podnosi true peak; te 0,5 dB to zapas na AAC/MP3. **Zawsze zmierz ponownie na pliku PO kodowaniu.**

Parametry pomiaru: K-weighting (shelf +4,0 dB @ ~1681 Hz + high-pass RLB @ 38 Hz), bloki 400 ms z 75% zakładką (hop 100 ms), gating dwustopniowy (absolutny **−70 LUFS**, potem relatywny **−10 LU** względem średniej po gatingu absolutnym). LRA (EBU Tech 3342) = percentyl 10.-95. short-term przy gate relatywnym −20 LU. Wagi kanałów: L=1,0, R=1,0, C=1,0, Ls=Rs=1,41 (+1,5 dB).

**LRA jest metryką, którą warto pokazać użytkownikowi obok LUFS.** Poniżej ~3 LU na mowie = przekompresowanie i zmęczenie słuchacza; powyżej ~10 LU podcast jest niesłuchalny w samochodzie.

#### 4.4. Redukcja szumu i pogłosu — konkretne modele i licencje

##### Szum (mowa)

| Model | Licencja *(weryfikowana z pliku)* | Rozmiar / koszt | SR | Utrzymanie | Gdzie liczony |
|---|---|---|---|---|---|
| **RNNoise v0.2** | **BSD-3** (`COPYING`: Mozilla / Jean-Marc Valin / Xiph.Org) | model ~85 kB, **0,04 GMACs** | **48 kHz natywnie** | ostatni commit **2025-02-22**; `jitsi/rnnoise-wasm` (Apache-2.0) już wozi rnnoise 0.2 | realtime **wszędzie**, jednowątkowo, bez COOP/COEP |
| **DeepFilterNet3** | **dual „Apache-2.0 **lub** MIT, at your option"** (`LICENSE`) | DFN v1: 1,80M par. / 0,35 GMACs; oficjalne ONNX w repo, w tym **`DeepFilterNet3_ll_onnx.tar.gz`** (low-latency) | **48 kHz** | ostatni commit **2024-10-17**, 4505 gwiazdek — zamrożony, ale sprawdzony | ONNX Runtime: web/iOS/Android; okno 20 ms |
| **DPDFNet** (Ceva) | **Apache-2.0** | `dpdfnet2_48khz_hr`: 2,58M par. / **2,42 GMACs** / 10,0 MB ONNX / 11,6 MB TFLite. Flaga **`--attn-limit-db`** + `StreamEnhancer` z zachowaniem stanu RNN | **48 kHz** | ostatni push **2026-07-22**, paper recenzowany (Speech Communication), ale tylko 113 gwiazdek i ~4 mies. integracji w sherpa-onnx | ONNX/TFLite |
| **GTCRN** | MIT | 48,2K par. / **33 MMACs/s** | ⚠️ **16 kHz** | push 2026-01-18 | — |

**Decyzja: zacznij od RNNoise v0.2, docelowy model wybierz pomiarem na własnym zestawie.**

Uzasadnienie, wbrew popularnemu rankingowi:

- **GTCRN odrzucony dla głównego łańcucha.** Jest 16 kHz → resample 48→16→48 bezpowrotnie usuwa wszystko powyżej 8 kHz (powietrze, oddech, sybilanty). Co gorsza, w tabeli DNS3 blind kolumna **SIG** (jakość samego sygnału mowy) wynosi: Noisy **3,20**, RNNoise 3,00, GTCRN **3,00** — czyli oba modele **pogarszają** jakość sygnału względem nieprzetworzonego wejścia; cała przewaga GTCRN siedzi w BAK (3,90 vs 3,45), czyli w usuwaniu tła. Dla aplikacji analizującej głos to najistotniejsza liczba w całym materiale i domyślne uzasadnienie dla suwaka wet/dry poniżej 100%.
- **Tabela benchmarkowa ClearerVoice (MossFormer2/Resemble/DeepFilterNet) zdegradowana do orientacyjnej.** Jest self-reported przez Alibabę własnym narzędziem SpeechScore, **autorzy sami dopisują pod tabelą 48 kHz**: „We observed anomalies in two speech metrics, LLR and LSD, after processing with the 48 kHz models", a zwycięski wiersz jest arytmetycznie niespójny (MossFormer2_SE_48K: SI-SDR 19,36 ale SDR 4,06 i ISR 4,08; DeepFilterNet: SI-SDR 15,71 i SDR 15,79 — spójne). Rozjazd 15 dB między SI-SDR i SDR jest niemożliwy dla poprawnie działającego systemu. **Nie wybieraj modelu na podstawie tej tabeli.**
- **Argument „Resemble Enhance ma najgorszy MCD = dowód resyntezy" jest błędny.** W tabeli 48 kHz: MossFormer2 0,53, Resemble **1,54**, **DeepFilterNet 1,77**. DeepFilterNet — rekomendowany jako „drugi tor" — ma **gorszy** MCD niż odrzucany model generatywny. Teza o ryzyku modeli generatywnych jest prawdopodobnie słuszna, ale ta tabela jej nie dowodzi.
- **RNNoise pierwszy, bo:** natywne 48 kHz (pułapka 16 kHz w ogóle nie występuje), 0,04 GMACs (realtime na każdym telefonie i w WASM na jednym wątku, więc COOP/COEP przestaje blokować cokolwiek), BSD-3, gotowy port WASM na wersji 0.2, integracja w ciągu dnia. Dodatkowo ma **jawnie udokumentowaną proweniencję danych treningowych** (README: „models distributed with RNNoise are now trained using only the publicly available datasets listed below", lista w `datasets.txt`, dane na `media.xiph.org`) — czystszą niż GTCRN, który trenowano na VCTK-DEMAND, gdzie DEMAND jest CC-BY-SA.
- **Bonus, który zmienia wycenę treningu własnego modelu:** RNNoise ma otwarty pipeline treningowy w C z **wbudowaną augmentacją pogłosem** (`dump_features` z flagą `-rir_list`, RIR-y na `media.xiph.org/rnnoise/data/measured_rirs-v2.tar.gz`). Możesz dotrenować go na własnych nagraniach śpiewu z RIR-ami z ReverbFX przy budżecie CPU, na który stać każdy telefon. To realna, znacznie tańsza alternatywa dla ścieżki „LoRA na GTCRN" wycenianej jako XL.

##### Pogłos

**`nara_wpe` (MIT), single-channel WPE, przepisany do rdzenia (~200 linii).**

Parametry: taps (filter order) **20-30** @48 kHz, prediction delay **3** ramki, **3-5** iteracji, STFT 960/480 (wspólny front-end). Zysk: **+0,5-1,5 dB SRMR** — umiarkowany, ale **bez artefaktów widmowych i bez halucynacji**, i **agnostyczny wobec treści** (działa na śpiewie i instrumentach, bo nie ma prioru mowy).

Dlaczego nie coś lepszego:

- **`anvuew/dereverb_mel_band_roformer` — DYSKWALIFIKACJA.** Najlepszy publiczny dereverb wokalu ma wagi na **GPL-3.0** (HF API: `cardData.license = "gpl-3.0"`, `lastModified 2025-02-11`). Nie do zamkniętego produktu w sklepie. Dodatkowo wiele pozostałych checkpointów w ekosystemie UVR/MSST **nie ma licencji w ogóle**, co prawnie jest gorsze niż GPL — brak licencji oznacza brak zgody.
- **SGMSE / StoRM** są MIT, ale wymagają 30-60 kroków odwrotnej dyfuzji → RTF 10-100× nawet na GPU. Server only.

⚠️ **Uwaga o ReverbFX:** praca (arXiv 2505.20533) dowodzi, że RIR-y z pluginów są lepszym materiałem treningowym dla sztucznego pogłosu niż RIR-y realnych pomieszczeń — ale trenowała **dwa modele generatywne**. Nie dowodzi niczego o modelach dyskryminatywnych ani o adapterach LoRA. Najtańsze i najpewniejsze zastosowanie ReverbFX: **źródło RIR-ów do własnego zestawu testowego dereverbu**, którego dziś nie ma.

##### Gdzie co liczyć

```
RNNoise        → realtime, w worklet chain (0,04 GMACs)
WPE            → offline, w Workerze (inwersja macierzy per pasmo)
DFN3_ll / DPDFNet → offline render; live tylko po zmierzeniu na docelowym telefonie
```

⚠️ **Nie ma ANI JEDNEGO pomiaru któregokolwiek z tych modeli w `onnxruntime-web` na iPhonie w całym dostępnym materiale.** Dowód „on-device feasibility" w paperze DPDFNet dotyczy **NPU Ceva NeuPro-Nano** (marketing wydajnościowy własnego akceleratora IP), a RTF 0,07 dla GTCRN jest z **desktopowego Intel i5-12400**. Do czasu własnego pomiaru zakładaj **offline render, nie live**. Pomiar to jedna strona testowa, ORT-web single-thread WASM, `dpdfnet2_48khz_hr` + `DeepFilterNet3_ll` + RNNoise, na najstarszym iPhonie który chcesz wspierać.

#### 4.5. Ducking muzyki i wyrównanie poziomów

##### Ducking

`createDuckCurve` istnieje w `lib/automation.ts:286-318` i **nigdy nie jest wywoływana**. To jedyna funkcja podcastowa w repo.

Realizacja: **precomputed automation curve, nie live sidechain.** Powody: identyczna w podglądzie i w renderze, edytowalna ręcznie, i trywialnie przenośna (bo to lista punktów, nie graf sidechainu).

```
Detektor:  RMS 10 ms na busie głosowym (suma wszystkich ścieżek role='voice')
Threshold: −35 dBFS z histerezą 4 dB
Głębokość: −12 do −18 dB na ścieżce muzyki
Attack:    30 ms   (dla muzyki wolniej jest przyjemniej niż 5 ms)
Hold:      300 ms
Release:   600 ms  (zakres 400-800)
Wynik:     AutomationLane{ param:'gainDb', unit:'dB', origin:'computed' }
```

Zapisz jako lane z `origin:'computed'` — użytkownik może ją potem edytować ręcznie, a przelicz na żądanie.

##### Wyrównanie poziomów między rozmówcami — dwa etapy

**Etap A: statyczny trim per ścieżka (jednorazowy, dokładny).**

```
1. Dla każdej ścieżki policz integrated LUFS (BS.1770 z gatingiem)
   ale TYLKO na jej własnych regionach mownych — crosstalk-gated:
   na ścieżce A licz wyłącznie ramki, gdzie A jest ≥6 dB nad B.
   Bez tego cisza jednej osoby i przeciek drugiej zafałszują pomiar.
2. Ustaw trim tak, by wszystkie ścieżki wylądowały na tej samej wartości,
   minus offset per rola (np. narrator −0 dB, gość −0 dB, lektor intro +1 dB).
3. Zapisz jako Track.gainDb — jedna liczba, widoczna i edytowalna.
```

**Etap B: adaptive leveler (wolny, wewnątrz ścieżki).**

To jest technicznie to, co robi Auphonic Adaptive Leveler, i dlatego Auphonic jest wzorcem porównawczym dla tej warstwy.

```
Wejście:   obwiednia short-term LUFS (bloki 400 ms, hop 100 ms, gate absolutny −70 LUFS)
Cel:       stały poziom docelowy busa
Stała czasowa: 1-3 s        (to leveler, nie kompresor — nie ma reagować na sylaby)
Zakres:    max ±12 dB
Slew:      max 3 dB/s       (bez tego długa nuta/zdanie „pełznie")
Freeze:    podczas ramek unvoiced i podczas ciszy — nie podnoś szumu tła
Wynik:     AutomationLane{ param:'gainDb', origin:'computed' }
```

Dopiero **po** levelerze wchodzą kompresory (§4.2 kroki 11-12), które zajmują się szybką dynamiką. Rozdzielenie tych dwóch rzeczy jest tym, co odróżnia „brzmi profesjonalnie" od „brzmi zmiażdżone".

##### Master bus

```
sum busów → [EQ opcjonalny] → loudnessTrim (do −16 LUFS)
          → limiter (ceiling −1,5 dBTP, lookahead 3 ms, release 80 ms, 4× OS)
          → dither TPDF (jeśli 16-bit)
Raport:  integrated LUFS, true peak, LRA, clippedSamples
```

---

### 5. Tabela: krok DSP × platforma

| Krok DSP | Web | iOS | Android | Real-time? | Licencja |
|---|---|---|---|---|---|
| **I/O wejścia** | `AudioWorklet`, kwant **128 ramek = 2,67 ms** @48k (niekonfigurowalny — konstruktor `AudioContext` przyjmuje tylko `latencyHint`/`sampleRate`/`sinkId`); `getUserMedia` z EC/NS/AGC=false + weryfikacja `getSettings()` | `AVAudioEngine.inputNode.installTap`, `AVAudioSession` mode **`.measurement`**, `setPreferredIOBufferDuration(0.005)` → 256 ramek | **Oboe** (AAudio, fallback OpenSL ES), `PERFORMANCE_MODE_LOW_LATENCY`, bufor = k × `getFramesPerBurst()` | tak | web: standard; Oboe **Apache-2.0** |
| **Zapis surowy** | worklet → transferable `Float32Array` → Worker → **OPFS** `createSyncAccessHandle` (chrome 102 / android 109 / firefox 111 / **safari 15.2 / ios 15.2**). **NIE MediaRecorder** | `AVAudioFile` / `ExtAudioFile` | AAudio callback → plik | tak | standard / platformowa |
| **Resampling** | `rubato` (Rust→WASM) | ten sam `rubato` | ten sam `rubato` | tak | **MIT / Apache-2.0** |
| **FFT** | `realfft`/`rustfft` (WASM SIMD) albo `fft.js` (21,9 kB) | `realfft` | `realfft` | tak | MIT/Apache-2.0; fft.js **MIT** |
| **Biquad / EQ / gate / expander / comp / de-esser / limiter** | **własny rdzeń → WASM `-msimd128`** (SIMD: chrome 91 / firefox 89 / **safari 16.4 / ios 16.4**; relaxed-SIMD **nie w Safari**) | ten sam rdzeń (staticlib + XCFramework) | ten sam rdzeń (cargo-ndk / CMake) | tak | **własna** |
| **Reverb** | **własny FDN 8×8 / 16×16** w rdzeniu | ten sam | ten sam | tak | własna (algorytm publiczny) |
| **Saturacja** | rdzeń, 4× oversampling wewnątrz | ten sam | ten sam | tak | własna |
| **Denoise (mowa)** | **RNNoise v0.2** przez WASM (realtime); `DeepFilterNet3_ll` / `dpdfnet2_48khz_hr` ONNX offline | RNNoise (C) / ONNX Runtime | RNNoise (C) / ONNX Runtime / TFLite | RNNoise **tak**; DFN/DPDFNet — **niezmierzone na telefonie**, zakładaj offline | RNNoise **BSD-3**; DFN **MIT/Apache-2.0**; DPDFNet **Apache-2.0** |
| **Dereverb** | `nara_wpe` przepisany do rdzenia | ten sam | ten sam | **nie** (offline, inwersja macierzy) | **MIT** |
| **LUFS + true peak** | **`libebur128` → WASM** (vendored, pinned, 30-60 kB) | ten sam `.c` | ten sam `.c` | M/S tak; I na koniec | **MIT** ⚠️ porzucony od 2021-02-14 |
| **Korekcja wysokości** | **`signalsmith-stretch`** (npm 1.3.2, oficjalny release WASM+AudioWorklet) | ten sam `.h` w Xcode | ten sam `.h` przez NDK | technicznie tak, **używamy offline** | **MIT** |
| **Detekcja F0** | rdzeń (YIN/pYIN) | rdzeń | rdzeń | tak | własna |
| **Render offline** | Worker + rdzeń, faster-than-realtime. **NIE `OfflineAudioContext`** | rdzeń albo `AVAudioEngine` manual rendering | rdzeń | n/d | własna |
| **Waveform (peaki)** | rdzeń → piramida min/max w OPFS (~28 MB dla 3h×3) | ten sam | ten sam | n/d | własna |
| **Enkoder AAC / Opus / FLAC** | **WebCodecs `AudioEncoder`** (chrome 94 / firefox 130 / **safari 26 / ios 26**) + muxer | `AVAudioConverter` / `ExtAudioFile` | `MediaCodec` | n/d | standard; `mp4-muxer` **MIT** (zamrożony 2025-07-02) / `mediabunny` **MPL-2.0** (aktywny 2026-07-24) |
| **Enkoder WAV** | własny writer (~30 linii) | własny | własny | n/d | własna |
| **Enkoder MP3** | LAME WASM — **tylko web** | **brak systemowego** | **brak systemowego** | n/d | `lamejs`/`@breezystack/lamejs` npm deklaruje **LGPL-3.0** → nie na App Store |
| **Separacja źródeł** (opcjonalnie, SING) | brak realnej ścieżki | Demucs ONNX offline (~300 MB) | jw. | nie | Demucs **MIT** (Meta, kod i wagi) |

**Świadomie odrzucone:**

| Technologia | Powód |
|---|---|
| **Rubber Band** | `COPYING` = **GPL v2** + płatna komercyjna; `rubberband-web` npm = GPL-2.0-or-later. Aktywny (2025-02-27), więc to kwestia licencji, nie porzucenia |
| **SoundTouch** | **LGPL-2.1** (npm `soundtouchjs` 0.3.0, aktywny 2026-02-04), brak zachowania formantów. LGPL + statyczne linkowanie na App Store = konflikt |
| **`ffmpeg.wasm`** | `@ffmpeg/core` 0.12.10 = **GPL-2.0-or-later**, ~25-32 MB. *(Uwaga: wariant single-thread NIE wymaga SharedArrayBuffer — częsty mit)* |
| **Essentia** | **AGPL-3.0** — obowiązek udostępnienia źródeł przy serwowaniu przez sieć, czym `sing.arvind.digital` jest |
| **`aubio`** | GPL-3.0; ostatni tagowany release **0.4.9 z 2019-02-27** (7 lat) |
| **`pitchfinder`** | npm deklaruje **„GNU v3"** = GPL-3.0. To najbardziej prawdopodobny skrót, po który sięgnie się „na szybko" — wpisz jawny zakaz do `CLAUDE.md` |
| **Elementary Audio** | MIT, ale **zamrożony**: ostatni commit 2024-12-21, npm `@elemaudio/core` 4.0.1 z 2024-12-10 (~19 mies.) |
| **JUCE** | GPLv3 albo płatna; **web/WASM nie jest oficjalnie wspierany** → zły kształt dla strategii web-first |
| **SoundPipe** | `LICENSE` = MIT (nie GPL, jak twierdziła część materiału), ale **ostatni commit 2020-08-06** — porzucony |
| **Cmajor** | licencja komercyjna z limitami rocznego przychodu i per-seat; iOS i Android **nie są udokumentowanymi targetami** |
| **FAUST** | `COPYING.txt` = **LGPL-2.1+** (nie GPL, jak często się powtarza), bardzo aktywny (2026-07-22). Ale `faustlibraries` to osobne repo **bez pliku LICENSE** — licencje siedzą w nagłówkach `.lib` per funkcja. Użyj wyłącznie jako generatora C++ z funkcji o jawnie permisywnym nagłówku, i zapisz tę deklarację w komentarzu wygenerowanego pliku |

---

### 6. Korekcja wysokości dla karaoke

#### 6.1. Wybór silnika

**Signalsmith Stretch — MIT, header-only C++11, jeden plik na trzy platformy.**

Licencja zweryfikowana dwukrotnie i niezależnie: `LICENSE.txt` w repo („MIT License, Copyright (c) 2022 Geraint Luff / Signalsmith Audio Ltd.") oraz metadane npm (`signalsmith-stretch` 1.3.2, `license: MIT`, publikacja 2025-06-27). Repo żywe — ostatni commit 2026-01-24. Biblioteka pomocnicza `Signalsmith-Audio/dsp` też MIT.

Co daje:
- `setTransposeSemitones()` i **`setFormantFactor()`** — zachowanie formantów jest wbudowane, nie doklejane.
- Tryb real-time z flagą `splitComputation` (rozkłada obliczenia równomiernie, eliminuje spike'y CPU).
- Oddzielnie raportowane `inputLatency()` i `outputLatency()`.
- **Oficjalny release Web Audio** (katalog `web/`, WASM + AudioWorklet, npm) obok tego samego `.h` do Xcode i NDK. To dosłownie jeden rdzeń na trzy platformy.
- Najlepszy zakres pracy: stretch **0,75×-1,5×**. Przy korekcji intonacji stretch = 1,0, czyli jesteśmy w idealnym punkcie.

Ograniczenia zapisane wprost na stronie autora: bufory wejścia i wyjścia **nie mogą być tym samym wskaźnikiem**; biblioteka „mostly tested with Clang".

⚠️ **Brak jakichkolwiek opublikowanych liczb latencji i kosztu CPU.** Jedyna liczba na stronie autora to „about 10x slower with optimisation disabled". **Nie planuj UX-u realtime na niesprawdzonych liczbach** — zbuduj release WASM, zmierz `inputLatency() + outputLatency()` i obciążenie na najsłabszym docelowym iPhonie i na średnim Androidzie, i **dopiero potem** decyduj.

#### 6.2. Decyzja: v1 offline-only

Powody:
1. Use-case „wyszlifuj gotowy take karaoke" jest **z natury offline**. Nie ma budżetu latencji do wyczerpania.
2. Jeden silnik do utrzymania zamiast dwóch.
3. Jeśli kiedyś pojawi się efekt „hard tune" na żywo — to ten sam silnik z innym `retune tau`, nie nowa implementacja.

Rozważane alternatywy i dlaczego odpadły:

| Opcja | Werdykt |
|---|---|
| **WORLD** (DIO/Harvest + CheapTrick + D4C) | **BSD-3** (`LICENSE.txt`), aktywny (2025-02-21), pełna separacja F0 od obwiedni widmowej → **najwyższa jakość dla ±100 centów**. Ale to drugi silnik do utrzymania i tylko offline. **Trzymaj jako plan B**, jeśli Signalsmith okaże się za słaby na dużych przesunięciach |
| **TD-PSOLA** | Formanty zachowane naturalnie (segmenty czasowe nietknięte), koszt CPU minimalny, lookahead ~2 okresy F0 = 8-20 ms, najlepsza jakość dla ±3-4 półtonu. Ale wymaga **niezawodnego wykrywania pitch marks** — to tygodnie pracy, i degraduje się na dźwiękach bezdźwięcznych |
| **Phase vocoder własny** | Formanty **nie są zachowane** (całe widmo się skaluje → chipmunk), wymaga osobnej korekcji obwiedni przez cepstral liftering. Plus „phasiness" i rozmycie transjentów |
| **Rubber Band** | GPL v2 / płatna. Odpada |
| **SoundTouch** | LGPL-2.1, zero formantów. Nadaje się do zwalniania nagrań do ćwiczeń w filarze TRAIN, **nie** do korekcji intonacji |

#### 6.3. Parametry muzykalności — to one decydują, czy brzmi jak człowiek

Silnik sam z siebie nie da muzykalności. Całą różnicę robi warstwa sterująca `ratio` przesunięcia.

**Detekcja F0:**
```
hop:          128-256 próbek @48k (2,67-5,33 ms). Przy hop 512 korekcja słyszalnie „kroczy"
okno:         2048 (4096 dla basów; F0 80 Hz wymaga ≥2 okresów = 1200 próbek)
próg YIN:     0,10-0,15
```

⚠️ **Poprawka do istniejącego kodu:** `lib/pitch-detector.ts:92` ustawia `const threshold = 0.25` z komentarzem *„Stricter threshold to reduce false positives"* — to jest **odwrotność prawdy**. Wyższy próg CMNDF akceptuje **pierwsze, słabsze** minimum, czyli **zwiększa** ryzyko błędów oktawowych i subharmonicznych. Zmiana jednej liczby na 0,10-0,15.

Interpolacja paraboliczna minimum CMNDF jest już zaimplementowana w obu detektorach (`pitch-detector.ts:184`, `pitch-detector-pro.ts:194`) — bez niej dokładność jest rzędu 10-30 centów, czyli martwa strefa 18 centów nie miałaby sensu.

**Cel korekcji:**
```
PREFERUJ:  referencyjna melodia MIDI utworu
DOPUŚĆ:    skala użytkownika (tonacja + tryb)
NIGDY:     pełna chromatyka
```
**Snap chromatyczny jest bezpośrednią przyczyną efektu T-Pain** — nie „za duża siła korekcji", tylko brak referencji melodycznej. Portamento i legato przeskakują wtedy między najbliższymi półtonami.

**Martwa strefa:**
```
nie koryguj, gdy |błąd| < 18 centów   (eksperci nie słyszą 20-25 centów; Vurma & Ross 2006)
nie koryguj, gdy |błąd| > 120 centów  (to zła nuta albo błąd detektora — korekta zrobi skok)
```

**Retune speed** — jednobiegunowy LP na wartości korekcji, `a = exp(-hop_seconds / tau)`:
```
naturalne / „szlifowanie" (domyślne):  tau = 25 ms
standard pop:                          tau = 12 ms
twardy T-Pain:                         tau = 0-3 ms
```

**Amount:** `70%`, nie 100%. `f_out = f_in * 2^(amount * err_cents / 1200)`.

**Zachowanie vibrata — jedna zmiana, która robi 80% różnicy w muzykalności:**
```
1. F0 → centy
2. LP 2. rzędu @ 4,0 Hz  = kontur melodyczny (intonacja)
3. residual = F0_cents − LP  = vibrato + jitter
4. koryguj TYLKO LP
5. wyjście = corrected_LP + residual   (vibrato nietknięte)
```
Vibrato zawodowca: **4,5-7 Hz**, zasięg **±34 do ±123 centów, średnia ±71** (Prame 1997). Bez tego rozdziału korekcja spłaszcza vibrato, czyli kasuje dowód umiejętności — i to jest dokładnie to, co ludzie słyszą jako „robot".

**Ataki:** zamroź korekcję na **pierwsze 40 ms** nuty. Naturalny scoop/podjazd musi przejść.

**Ramki bezdźwięczne:** gdy `voicing confidence < 0,5` — **TRZYMAJ ostatni ratio**, nie resetuj do 1,0. Reset daje słyszalne kliknięcie.

**Clamp:** ±100 centów maksymalnego przesunięcia.

**Formanty:** `setFormantFactor(1.0)` = formanty **absolutne**, nie skalowane z wysokością. Przy ±100 centów to jedyne ustawienie, które brzmi jak człowiek.

**Korekcja czasu** (osobna funkcja): przesuwanie ataków nut do siatki max ±50 ms, tylko na początkach nut.

#### 6.4. Bramka jakości

Ta sama, co dla całego łańcucha SING, plus jedna dodatkowa:

```
Po korekcji, na regionach BEZ korekcji (|błąd| < martwa strefa):
   median |ΔF0| < 2 centy         — silnik nie może dryfować tam, gdzie nie miał nic robić
Na regionach z korekcją:
   zasięg vibrata po korekcji ≥ 90% zasięgu przed  — nie spłaszczaj
```

---

### 7. Formaty

#### 7.1. Źródło i projekt

```
Wewnętrzny format pracy:  float32, 48 kHz, mono per ścieżka
Magazyn ścieżek:          FLAC 24-bit 48 kHz  (~50-55% rozmiaru int24)
Master/eksport pośredni:  WAV RIFF, fmt tag 3 (WAVE_FORMAT_IEEE_FLOAT), 32-bit float, 48 kHz
Pliki >4 GB:              RF64 / WAV64
```

**48 kHz, nie 44,1.** To natywna częstotliwość wyjścia każdego urządzenia mobilnego i natywny rate Opusa. 44,1 wymusza resampling przy każdym nagraniu z telefonu i przy każdym kodowaniu.

**Nie podnoś rate projektu do 96 kHz.** Oversampling rób **wewnątrz** bloku nieliniowego (2-4×), nie globalnie.

Rachunek na jedną ścieżkę mono 48 kHz:

| Format | B/s | MB/h |
|---|---|---|
| float32 | 192 000 | **691,2** |
| int24 | 144 000 | **518,4** |
| FLAC 24-bit (mowa) | ~72 000 | **~270** |

#### 7.2. Nagrywanie

**Nie `MediaRecorder`.** Daje tylko stratny format, nie daje dostępu do float, a w repo jest zahardkodowany jako `"audio/webm"` w **czterech miejscach** — `app/record/karaoke/page.tsx:213`, `components/multi-track-manager.tsx:232`, `hooks/use-audio-recording.ts:18`, `app/edit/studio/page.tsx:472` (ten ostatni ma fallback, ale tylko webm→webm). Safari nie wspiera webm w MediaRecorderze (tylko `audio/mp4`), więc **nagrywanie karaoke, w Studio i multitrack nie działa dziś na iPhonie w ogóle**, a aplikacja obwinia użytkownika o brak uprawnień do mikrofonu (`catch` w `:254-257` ustawia „Nie mozna uzyskac dostepu do mikrofonu") i zostawia zapalony mikrofon.

Zamiast tego:
```
AudioWorklet → Float32Array (transferable) → Worker → OPFS createSyncAccessHandle
```
Wsparcie zweryfikowane: chrome 102 / chrome_android 109 / firefox 111 / **safari 15.2 / safari_ios 15.2**. `createSyncAccessHandle` jest **worker-only we wszystkich przeglądarkach** (nie tylko w Safari).

⚠️ Pułapka Safari, którą trzeba zweryfikować spike'em (2-3 dni) **zanim** zatwierdzisz „SQLite/OPFS wszędzie": praktycznie trzeba VFS `opfs-sahpool` (pula preallokowanych plików), który nie obsługuje wielu równoległych połączeń i przy zmianie rozmiaru potrafi wymagać reinicjalizacji.

**Constrainty `getUserMedia` — jedna wspólna funkcja `openMicrophone()` w `lib/`, i zakaz wołania `getUserMedia` gdziekolwiek indziej.** Dziś repo ma **cztery żywe implementacje z trzema różnymi politykami**:

| Miejsce | EC | NS | AGC |
|---|---|---|---|
| `hooks/use-audio-recorder.ts:85-91` | false | false | false ✅ |
| `app/edit/studio/page.tsx:461-467` | false | false | false ✅ |
| `components/guitar-tuner.tsx:36-41` | false | false | false ✅ |
| **`app/record/karaoke/page.tsx:193-195`** | false | false | **true** ❌ (komentarz: „Keep auto gain to prevent clipping") |
| **`contexts/audio-recorder-context.tsx:67`** | — | — | — ❌ (`getUserMedia({ audio: true })`, czyli pełne APM) |

To znaczy, że pomiary z gry, z tunera i z nagrania karaoke **nie są tym samym sygnałem**. Poprawka to godzina pracy i sprawia, że wszystkie dane o postępach stają się porównywalne.

AGC w karaoke zostało wybrane świadomie jako ochrona przed przesterowaniem — więc trzeba dać zamiennik, nie tylko zabrać: **miernik poziomu wejścia w onboardingu + ostrzeżenie o clippingu** (detekcja `|x| > 0.99` w kolejnych ramkach), zamiast nieliniowej ingerencji w obwiednię przed YIN i przed pomiarem głośności.

```js
{ audio: { echoCancellation: false, noiseSuppression: false,
           autoGainControl: false, channelCount: 1, sampleRate: 48000 } }
// i NATYCHMIAST: track.getSettings() — Safari i część Androidów ignorują część flag
```

#### 7.3. Eksport

**Kolejność prób w web:**
```
1. WebCodecs AudioEncoder  ('opus' | 'mp4a.40.2' | 'flac')
   → 0 bajtów payloadu, sprzętowo wspierane ścieżki
   → chrome 94 / chrome_android 94 / firefox 130 / safari 26 / safari_ios 26
   → NIE muxuje: mp4-muxer (MIT, 5.2.2, zamrożony 2025-07-02)
                 albo mediabunny (MPL-2.0, 1.51.0, aktywny 2026-07-24)
2. Zapis WAV — 30 linii własnego kodu, zero zależności, uniwersalny fallback
3. opus-recorder (libopus BSD-3) — jeśli Opus jest twardo wymagany
   ⚠️ ostatnia publikacja npm 8.0.5 z 2021-10-15
```

Safari 26 to wrzesień 2025 → w 2026 masz na iOS istotny ogon starych wersji. Fallback jest potrzebny, ale jako **ścieżka schyłkowa**, nie równoprawna.

**Uwaga licencyjna:** `mediabunny` to **MPL-2.0**, nie MIT (jak podawała część materiału). MPL to copyleft **plikowy**: linkowanie w zamkniętej aplikacji jest OK, ale każdą **zmodyfikowaną** kopię pliku musisz opublikować. Akceptowalne pod warunkiem, że nie forkujesz.

**Presety eksportu:**

| Cel | Format | Loudness |
|---|---|---|
| **Podcast** | MP3 128 kbps mono CBR (kompatybilność ze starymi czytnikami) **lub** AAC-LC 96-128 kbps mono **lub** Opus 64-96 kbps mono | −16 LUFS / −1,5 dBTP |
| **Podcast master** | WAV float32 48 kHz | pomiar bez normalizacji |
| **Karaoke** | AAC-LC 256 kbps stereo **lub** Opus 128-160 kbps stereo | −14 LUFS / −1,0 dBTP |
| **Karaoke — udostępnianie** | MP3 320 kbps stereo | jw. |

#### 7.4. MP3 — decyzja

**Ani iOS, ani Android nie mają systemowego enkodera MP3** (tylko dekoder). Do tego `lamejs` 1.2.1 (2021-12-02) i `@breezystack/lamejs` 1.2.7 (2023-10-17) deklarują w npm **LGPL-3.0**, nie 2.1 — a LGPL-3.0 dziedziczy z GPLv3 klauzule anty-DRM i wymóg Installation Information, co jest ostrzej sprzeczne z ToS App Store.

**Decyzja: MP3 wyłącznie w wersji web, kanoniczny zestaw to AAC-LC / Opus / FLAC / WAV.** Jeśli MP3 zostaje w web — sprawdź plik `LICENSE` w tarballu, nie tylko `package.json`, i uruchamiaj wyłącznie w Web Workerze.

#### 7.5. Enkodery natywne

```
iOS:      AVAudioConverter / ExtAudioFile → AAC / ALAC / FLAC / WAV
Android:  MediaCodec                      → AAC / Opus / FLAC
```

---

### 8. Backend vs on-device — uczciwy bilans

#### 8.1. Co działa on-device: praktycznie wszystko z tej sekcji

Cały DSP, LUFS, korekcja wysokości, denoise, dereverb, render offline, eksport, piramida peaków, magazyn projektu. **Zero z tego nie wymaga serwera.**

#### 8.2. Co wymaga backendu

**Tylko dwie rzeczy, i tylko jedna z nich dotyczy tej sekcji:**

1. **Proxy do ASR/LLM** (transkrypcja dla edycji tekstowej podcastu, rozdziały). Klucz API nie może być w statycznym froncie — `NEXT_PUBLIC_*` trafia do bundla, a zmienne bez prefiksu nie istnieją w runtime static exportu. Jeden Cloudflare Worker, ~150 linii, bez bazy, bez stanu.
2. **Nagrywanie zdalnych gości** (signaling + TURN). To osobny produkt, 3-6 miesięcy pracy jednoosobowo. Poza zakresem.

**Limity Cloudflare Workers — zweryfikowane:**

| | Free | Paid |
|---|---|---|
| CPU / request | **10 ms** (nie 50) | 30 s domyślnie, konfigurowalne do **5 min** |
| Cron / Queue consumer / DO Alarm | — | **15 min** CPU |
| Duration (wall-clock) HTTP | brak limitu dopóki klient podłączony | jw. |

**Nie transkoduj audio w Workerze** — ale powód to **~128 MB pamięci na isolate i brak natywnych binarek** (nie da się uruchomić ffmpeg, tylko WASM), a **nie** limit CPU. Jeśli kiedykolwiek potrzebny render server-side: Queue Consumer (15 min) albo Cloudflare Containers, nigdy Worker HTTP.

Opcjonalnie później: R2 na backup/sync audio (~$0,015/GB-miesiąc, **zero opłat za egress** — istotne, bo audio to ruch wychodzący).

#### 8.3. Ograniczenia static exportu

`sing.arvind.digital` serwuje z Cloudflare (`server: cloudflare`, `cf-ray: ...-WAW`, ustawione już `referrer-policy` i `x-content-type-options`) — czyli warstwa edge już modyfikuje nagłówki. Cloudflare Pages pozwala ustawić dowolne nagłówki plikiem **`_headers`** (do 100 reguł). To **nie jest backend**.

**Decyzja: NIE włączaj COOP/COEP.** Uzasadnienie:
- `SharedArrayBuffer` i wątki WASM wymagają `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`.
- Chrome ma łagodniejsze `COEP: credentialless`; **Safari nie ma**. Z `require-corp` przestają się ładować wszystkie zasoby cross-origin bez CORP — u Ciebie gtag i Vercel Analytics (nagłówek `link: <googletagmanager.com/gtag/js>; rel=preload` sugeruje, że zepsuje).
- **Nie potrzebujesz tego.** Rdzeń jednowątkowy + **WASM SIMD** (chrome 91 / firefox 89 / **safari 16.4 / ios 16.4**) w zupełności wystarcza. Komunikacja Worker↔AudioWorklet przez `MessageChannel` z transferowalnymi `ArrayBuffer` — zero kopii, zero COOP/COEP.
- Kompiluj z `-msimd128`, **nigdy z relaxed-SIMD** (nie ma w Safari — wypadniesz z iOS).

To zamienia „ograniczenie" w „decyzję": prostsza architektura, mniej ryzyka, ta sama wydajność dla tej klasy obliczeń.

#### 8.4. iOS Safari — twarde limity, wprost

Uporządkowane od najważniejszego:

1. **Nie da się wyłączyć przetwarzania wejścia.** `noiseSuppression` i `autoGainControl` **nie są wspierane w ogóle** (`MediaTrackSupportedConstraints`: `safari: false`, `safari_ios: false`; wspierany tylko `echoCancellation` od safari 11 / ios 11). Twoje pomiary F0, poziomu i zakresu głosu na iPhonie w przeglądarce mierzą sygnał po przetwarzaniu Apple, którego nie kontrolujesz, i **nie są porównywalne z desktopem**. To jest **najmocniejszy argument za aplikacją natywną w całym dokumencie** — na natywnym `AVAudioSession` mode `.measurement` to wyłącza.

   Konsekwencje produktowe: (a) zapisuj platformę/przeglądarkę obok każdego pomiaru i nie porównuj między nimi bez kalibracji, (b) nie obiecuj „dokładności centowej" na iPhonie w webie.

2. **`AudioContext.outputLatency` dopiero od Safari 18.4 / iOS 18.4** (chrome 102, firefox 70). `baseLatency` od safari 14.1. Poniżej 18.4 kompensacja latencji musi opierać się wyłącznie na pomiarze loopbackowym.

3. **Niestandardowy stan `'interrupted'`** (rozmowa, Siri, alarm). Kod obsługujący tylko `suspended`/`running` zostawia po przerwaniu martwy graf audio, bez żadnego błędu w konsoli. Użytkownik widzi „aplikacja przestała słyszeć".

4. **Bluetooth HFP wymusza 16 kHz i resetuje `AudioContext`.** *(To ograniczenie warstwy systemowej, nie WebKita — na natywnym iOS `playAndRecord` + `allowBluetooth` z mikrofonem słuchawek również schodzi do HFP. Natywne daje kontrolę **routingu** (`setPreferredInput` na mikrofon wbudowany), nie 48 kHz z mikrofonu HFP.)* Rdzeń musi resamplować do wewnętrznych 48 kHz i przeżywać zmianę urządzenia w trakcie sesji.

5. **Storage: ~1 GB domyślnej quoty per origin + ewikcja po 7 dniach** braku interakcji (ITP), jeśli PWA nie jest dodane do ekranu głównego. Wymagane: `navigator.storage.persist()`, jawne ostrzeżenie w UI, i **eksport projektu do pliku jako backup**. ⚠️ Dokładna aktualna wartość quoty na iOS 26 **nie została zweryfikowana** — sprawdź `navigator.storage.estimate()` na realnym iPhonie przed zaprojektowaniem formatu projektu.

6. **Limit ~6 `AudioContext` na kartę.** Studio przecieka jeden na każde wejście — **żaden z jego 5 `useEffect` nie ma cleanupu** (grep `return () =>` w `app/edit/studio/page.tsx` = 0 trafień), więc kontekst z `setupPreviewChain` (`:193`) żyje po odmontowaniu. Po kilku przejściach Studio↔Biblioteka podgląd cichnie, a błąd jest tylko w konsoli. To samo w karaoke: dwa `useEffect` (`:46`, `:52`) i żaden nie zwraca funkcji czyszczącej — kliknięcie „Zmień wideo" albo nawigacja w trakcie nagrywania zostawia **zapalony mikrofon**, działającą pętlę rAF i otwarty `AudioContext`.

#### 8.5. Skala — gdzie web się kończy

Rachunek nie zostawia wyboru:

| Konfiguracja | float32 | int24 | FLAC 24-bit |
|---|---|---|---|
| 1 ścieżka × 60 min | 691 MB | 518 MB | ~270 MB |
| 4 ścieżki × 60 min | 2,76 GB | 2,07 GB | **~1,08 GB** |
| 3 ścieżki × 3 h | **6,22 GB** | 4,67 GB | ~2,33 GB |
| 4 ścieżki × 3 h | 8,29 GB | 6,22 GB | ~3,11 GB |

Heap zakładki to realnie ~2 GB, WASM32 ma **twardy sufit 4 GB przestrzeni adresowej**. Trzymanie ścieżek w `AudioBuffer`ach jest **arytmetycznie niemożliwe**, nie „nieoptymalne".

Piramida peaków (poziom 0 = 256 próbek/bin, min+max jako int16 = 4 B/bin, kolejne poziomy /8): dla 3 h × 3 ścieżki **~28 MB**. Buduj raz przy imporcie w Workerze, zapisz jako plik binarny w OPFS. Bez tego rysowanie 518 mln próbek w viewport 1600 px zawiesza zakładkę.

**Limity produktowe:**

```
SING (karaoke):     3-5 min stereo = ~115 MB float32  → mieści się trywialnie,
                    streaming w ogóle niepotrzebny
PODCAST w web:      4 ścieżki × 60 min jako FLAC 24-bit ≈ 1,08 GB
                    → na Safari ściana przy ~2 ścieżkach × 60 min (quota ~1 GB)
PODCAST pełny:      3 h × 4 ścieżki → TYLKO aplikacja natywna
```

Bramka w UI: `navigator.storage.estimate()` **przed** importem, odmowa gdy quota < 3× rozmiar importu, z czytelnym komunikatem. Nie odkryj tego w produkcji.

---

### 9. Kolejność prac dla tej warstwy

Uporządkowane po stosunku zysku do ryzyka. Kroki 1-4 nie zmieniają architektury i dają widoczny efekt w dniach, nie miesiącach — to jest istotne przy historii repo (60 commitów w 14 dni, potem 6 miesięcy ciszy).

| # | Zadanie | Nakład | Efekt |
|---|---|---|---|
| 1 | **Jedna funkcja `openMicrophone()`** + naprawa `mimeType` (wybór przez `MediaRecorder.isTypeSupported` z listą kandydatów, albo od razu porzucenie MediaRecordera) | godziny | nagrywanie zaczyna działać na iPhonie; wszystkie pomiary stają się porównywalne |
| 2 | **Limiter + TPDF dither + pomiar peak** przed konwersją do int16 w `lib/audio-processor.ts`; `tailSec` dla ogona reverbu | 1 dzień | znikają trzaski w eksporcie i ucięty ogon — dwa najbardziej słyszalne bugi |
| 3 | **Jeden enkoder WAV** bez tablicy JS, z `getChannelData` przed pętlą, w Workerze; usuń 3 kopie | 1 dzień | koniec z 460 MB alokacji i zawieszaniem zakładki na eksporcie |
| 4 | **Cleanup `AudioContext`, strumieni, rAF i blob URL-i** w Studio i karaoke (`useEffect` z `return`) | 1-2 dni | koniec z zapalonym mikrofonem po wyjściu ze strony i z martwym Studio po 6 wejściach |
| 5 | **Deterministyczne ramkowanie**: `AudioWorklet` + ring buffer + stały hop; `resume()` w każdej ścieżce | 1-2 tyg. | warunek konieczny dla wszystkiego dalej — bez tego żaden pomiar nie jest powtarzalny |
| 6 | **`libebur128` → WASM** (vendored, pinned) + testy zgodności EBU TECH 3341 | 1 tydz. | pierwsze prawdziwe testy w repo; LUFS na poziomie Auphonic |
| 7 | **Kalibracja latencji** (§3.2) + porzucenie YouTube jako podkładu | 1-2 tyg. | karaoke zaczyna być użyteczne — dziś każde nagranie jest rozjechane |
| 8 | **Rdzeń DSP w Rust** (biquady, dynamika, saturacja, FDN) + `ChainSpec` jako jedyny opis | 4-8 tyg. | jeden łańcuch dla podglądu, renderu i trzech platform |
| 9 | **Renderer offline w Workerze** zamiast `OfflineAudioContext` | 1-2 tyg. | eksport bez limitu długości, przenośny na natywne |
| 10 | **Przebudowa timeline'u**: command pattern, geometria, mikser, split/delete, eksport | 6-10 tyg. | edytor przestaje być demem |

---

### 10. Otwarte pytania — do zamknięcia pomiarem, nie researchem

Wszystkie poniższe wymagają **własnego pomiaru na własnym sprzęcie**. Żadnej z tych liczb nie znaleziono w niezależnym źródle w całym dostępnym materiale.

1. **Latencja round-trip w przeglądarce** (desktop, Chrome Android, iOS Safari). Wszystkie zakresy w tym dokumencie (30-60 ms desktop, 50-100 ms mobile) pochodzą z wiedzy modelu, **nie z pomiaru**. Zmierz testem loopbackowym z §3.2 — to jeden dzień pracy i usuwa największą niepewność.

2. **Wydajność `DeepFilterNet3_ll` i `dpdfnet2_48khz_hr` w `onnxruntime-web` na iPhonie.** Zero danych. Do czasu pomiaru zakładaj offline render, nie live. Jedna strona testowa, ORT-web single-thread WASM, najstarszy wspierany iPhone.

3. **Latencja i koszt CPU Signalsmith Stretch.** Autor nie publikuje żadnych liczb. To rozstrzyga, czy korekcja wysokości może kiedykolwiek być live.

4. **Rozmiar binarki WASM ONNX Runtime** (nieskompresowany i po brotli). To **dominujący koszt** wdrożenia neuronowego na web — model `dpdfnet2_48khz_hr` waży 10 MB, runtime prawdopodobnie kilka MB więcej. Jeśli to zaboli, przy modelach tej wielkości ręczne przepisanie inferencji (kilka warstw conv + softmax) w rdzeniu Rust jest realną alternatywą, która znosi całą zależność.

5. **Realne zachowanie flag `getUserMedia` na iOS Safari i w WebView na Androidzie w 2026.** BCD mówi, że NS/AGC nie są wspierane — ale czy Apple stosuje własne przetwarzanie mimo `echoCancellation: false`? Test: sinus stały + cisza + głośne wejście, sprawdź czy poziom dryfuje.

6. **Sample rate wejścia przy słuchawkach Bluetooth/AirPods na iOS.** Rozstrzygające, bo słuchawki są twardym wymogiem dla SING, a jeśli tor BT schodzi do 16 kHz, wymóg sam niszczy pasmo, o które walczy cały łańcuch. Zmierz: `track.getSettings()` + `AudioContext.sampleRate`, przewodowe vs BT.

7. **Aktualna quota OPFS na iOS 26** i faktyczne zachowanie ITP przy 7 dniach — czy `navigator.storage.persist()` albo dodanie do ekranu głównego wystarcza.

8. **Wsparcie kodeków wewnątrz WebCodecs w Safari 26** (`opus` / `mp4a.40.2` / `flac`). BCD potwierdza tylko API, nie kodeki. Jedyna wiarygodna metoda: runtime probe przez `AudioEncoder.isConfigSupported()` dla każdego kodeka i degradacja w dół.

9. **Wsparcie `opfs-sahpool` przy 500 MB danych na iOS Safari** — spike 2-3 dni przed zatwierdzeniem architektury magazynu.

10. **Cele LUFS dla YouTube, Amazon Music, Tidal, AES TD1004, EBU R128** — nie zweryfikowane u źródła. Do sprawdzenia przed wpisaniem w presety. Apple Podcasts i Spotify są potwierdzone.

11. **Auphonic: minimum 3 minuty rozliczeniowe na produkcję.** Jeśli kiedykolwiek rozważysz chmurę jako akcję premium — każdy klip karaoke 30-90 s rozlicza się jak 3 minuty, czyli 2-6× inflacja kosztu, a darmowy limit 2 h/mies. daje realnie ~40 klipów, nie 120+. Sensowne wyłącznie dla długich materiałów PODCAST albo po zbatchowaniu wielu ujęć w jedną produkcję.

12. **Czy istnieje jakikolwiek produkt komercyjny mobile z rdzeniem RT-audio w Rust.** Nie znaleziono ani jednego — wszystkie przykłady wzorca „Rust core + wasm + FFI" to krypto/CRDT/telemetria. Standardem branżowym dla RT audio pozostaje C/C++. To otwarte ryzyko doboru narzędzia; wariant awaryjny (czysty C11) jest opisany w §2.1.