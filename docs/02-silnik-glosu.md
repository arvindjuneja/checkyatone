# Silnik analizy głosu — specyfikacja docelowa

> Zakres tej sekcji: warstwa od próbek mikrofonu do liczby „trafiłeś / nie trafiłeś". Nie obejmuje UI, wizualizacji, edytora ani warstwy sesji — te są opisane w innych sekcjach.

---

## 1. Diagnoza: co konkretnie jest zepsute

Rdzeń YIN w `lib/pitch-detector.ts` jest **poprawny matematycznie** i to jest jedyna dobra wiadomość. Weryfikator potwierdził trzy rzeczy warte zachowania: normalizacja CMND zgodna z równaniem (8) de Cheveigné & Kawahara 2002 (`lib/pitch-detector.ts:85-90`), stałe okno całkowania W = MAX_PERIOD niezależne od tau (`:74-82`, poprawna forma YIN, nie zniekształcony wariant sumujący do SIZE−tau) oraz interpolacja paraboliczna minimum (`:186-194`, mediana błędu **0 centów** na sygnałach 82,4–261,6 Hz).

Zepsuta jest **warstwa decyzyjna zbudowana nad tym rdzeniem** oraz **warstwa akwizycji pod nim**. Poniżej osiem potwierdzonych defektów, każdy z bezpośrednim przełożeniem na doświadczenie użytkownika.

### 1.1. Domyślny tryb „Pro" nie ma szans działać w czasie rzeczywistym — naiwny DFT O(N²)

`lib/fft-analyzer.ts:24-35` to podwójna pętla 1024 biny × 2048 próbek z `Math.cos`/`Math.sin` liczonymi od zera w każdej iteracji: ~2,1 mln iteracji i ~4,2 mln wywołań trygonometrii **na jedną ramkę**. Wywoływany bezwarunkowo z `lib/pitch-detector-pro.ts:248` dla każdej ramki, a tryb pro jest **domyślny** (`hooks/use-audio-recorder.ts:19`: `useState<DetectionMode>("pro")`).

Dwa niezależne pomiary w tej samej sesji audytowej (Node, Apple Silicon):

| ścieżka | ms/ramkę | max fps na 1 rdzeniu |
|---|---|---|
| `computeFFTMagnitudes(2048)` | 25,84–25,94 | 38 |
| całe `detectPitchPro` | 26,94 | 37 |
| `detectPitch` (basic) | 0,36–1,13 | 880–2700 |

Budżet ramki przy 60 fps to 16,7 ms. **Domyślny tryb analizy nie wyrabia 60 fps na najszybszym dostępnym desktopie**, a na telefonie średniej klasy zjeżdża do 5–10 fps. Objaw dla użytkownika: „wskaźnik drga i się zacina" — przypisywany algorytmowi, a będący głodzeniem CPU. Przy 5–10 próbkach na sekundę `detectVibrato` (`lib/pitch-detector.ts:248`) fizycznie nie może zmierzyć vibrato 4–7 Hz.

### 1.2. Systematyczny błąd oktawowy powyżej E4 — detektor jest zestrojony na 200 Hz

`lib/pitch-detector.ts:170-179`: wybór kandydata to `reduce` z karą `Math.abs(Math.log2(freq / 200)) * 0.1`. Kandydaci mają `value < 0.25` (prog z `:92`), więc cała rozpiętość kryterium jakości to 0,25, a kara odległości od 200 Hz dla 880 Hz wynosi 0,214. **Kara przewyższa kryterium jakości.** Dla sygnału okresowego CMND w tau = k·T jest ~0, więc składnik jakościowy jest remisem i decyduje wyłącznie kara.

Zmierzone na sygnale harmonicznym (8 harmonicznych 1/n, 48 kHz, 2048 próbek):

| wejście | wyjście basic | wyjście pro |
|---|---|---|
| C3 130,81 | 130,81 ✓ | — |
| C4 261,63 | 261,63 ✓ | **87,21 (÷3)** |
| E4 329,63 | **164,81 (÷2)** | **65,93 (÷5)** |
| G4 392,00 | **196,00 (÷2)** | **78,40 (÷5)** |
| C5 523,25 | **174,42 (÷3)** | **174,42 (÷3)** |
| E5 659,26 | **219,75 (÷3)** | **131,85 (÷5)** |
| A5 880,00 | **220,00 (÷4)** | **175,99 (÷5)** |

Tryb Pro jest **gorszy** niż basic (myli się już od C4, basic od E4) i jest domyślny. Przyczyna w Pro jest inna i głębsza: `getHarmonicConsistencyScore` (`lib/pitch-detector-pro.ts:82-99`) sprawdza **wyłącznie** f0/2 i f0·2, więc nieparzyste subharmoniczne (f0/3, f0/5) dostają `harmonicScore = 1.00`, identyczny jak prawdziwe F0. Wydruk kandydatów dla C4: `87Hz h=1.00 s=0.50 r=0.50 f=0.750 | 262Hz h=1.00 s=0.50 r=0.50 f=0.750` — **dokładny remis finalScore rozstrzygany przez `Array.sort`**.

Objaw: sopran śpiewający C5 widzi F3. Cały zakres kobiecego i wysokiego męskiego głosu jest mierzony błędnie.

### 1.3. Blokada na jednej wysokości — skok interwałowy nigdy nie zostaje wykryty

`lib/pitch-detector.ts:156`: `semitoneDistance = octaveRemainder + octaves * 15` wewnątrz score `semitoneDistance * 3.0 + c.value * 20` (`:163`) — 45 punktów kary za oktawę wobec 5 punktów całego zakresu jakości. Plus twarde odrzucenie w `:210-229`.

Zmierzone: po 10 ramkach C3 podanie C4 daje **130,82 Hz we wszystkich 10 kolejnych ramkach**. Skok C4→G4 daje 196,00 Hz (G3) we wszystkich 6 ramkach. **Blokada przeżywa ciszę**: 30 ramek cyfrowej ciszy (`detectPitch` zwraca `null` przez prog RMS w `:69`, nie zerując `previousFrequency`) i podanie G4 = 392 Hz zwraca 130,7 Hz — trzecią subharmoniczną 392, która pasuje do starego C3. Blokada trwa **całą sesję**, nie jeden skok.

**Korekta wobec wcześniejszych opisów:** teza „kara za skok > 5 półtonów gubi kwintę i septymę" jest w tym kodzie **nieprawdziwa**. Warunek `semitones > 5` (`:225`) jest zagnieżdżony wewnątrz bramki wymagającej stosunku w ±0,08 od 2, 3 albo 4. Kwinta (1,498), septyma mała (1,782) i wielka (1,888) nie wchodzą do gałęzi. Jednocześnie każdy stosunek w oknie 1,92–2,08 to ≥ 11,3 półtonu, więc test `> 5` jest **zawsze prawdziwy, gdy bramka odpali**. Realne działanie: *odrzuć bezwarunkowo każdą zmianę o ~oktawę, ~duodecymę i ~dwie oktawy*. **Konsekwencja praktyczna: usunięcie samej linii 225 nie zmieni nic — trzeba usunąć cały blok 210-229.**

### 1.4. Zadeklarowane zabezpieczenia to martwy kod

Trzy niezależne bramki, które w kodzie wyglądają na kontrolę jakości i **nie mogą się nigdy wykonać**:

| lokalizacja | kod | dlaczego martwy |
|---|---|---|
| `lib/pitch-detector.ts:116-135` | filtry harmonicznych i subharmonicznych, tolerancja 0,05/0,08 | kandydaci zbierani po rosnącym tau (`:95`) i mapowani na `sampleRate/tau` (`:108`) → posortowani **malejąco po freq**; badany iloraz zawsze < 1, nigdy nie zbliży się do 2/3/4 |
| `lib/pitch-detector.ts:204` | `if (confidence < 0.7) return null` | `confidence = 1 − d'` (`:197`), a kandydaci mają `d' < 0.25` (`:92`) → `confidence > 0.75` **zawsze** |
| `lib/pitch-detector-pro.ts:285` | `if (winner.confidence < 0.6) return null` | `yinThreshold = 0.35` (`:161`) → `confidence > 0.65` **zawsze** |

Efekt uboczny gorszy niż sam martwy kod: komentarz w `:111-113` obiecuje ochronę przed subharmonicznymi, której nie ma. Ktokolwiek będzie to debugował, straci dzień. A ta sama liczba `confidence` jest potem używana jako **realny filtr** w `app/record/karaoke/page.tsx:127` i `hooks/use-vocal-range.ts:56,106` (`> 0.9`) — czyli filtruje na podstawie głębokości minimum funkcji YIN, która nie jest znormalizowana i zależy od głośności i barwy.

### 1.5. Prog CMNDF ustawiony w złą stronę + globalny stan modułu

`lib/pitch-detector.ts:92` ustawia `const threshold = 0.25` z komentarzem „Stricter threshold to reduce false positives" — **odwrotność prawdy**. Wyższy prog CMNDF akceptuje *pierwsze, słabsze* minimum, czyli zwiększa ryzyko wyboru subharmonicznej. To jedna liczba i jedna z najtańszych realnych popraw w całym repo (0,25 → 0,12; w pro 0,35 → 0,15).

`lib/pitch-detector.ts:42-43` (`previousFrequency`, `frequencyHistory`) i `lib/pitch-detector-pro.ts:57-58` (`recentF0s`, `previousFrequencyPro`) to **stan modułowy**, współdzielony przez tuner gitarowy, karaoke, hit-the-note i pomiar zakresu głosu. `resetPitchTracking()` ma jedno wywołanie w całym repo (`app/record/karaoke/page.tsx:186`), `resetProPitchTracking()` jedno (`hooks/use-audio-recorder.ts:187`, tylko przy zmianie trybu). `startRecording` (`:81-129`) nie resetuje żadnego. Skutki: (a) pierwsze ~10 ramek nowego ćwiczenia jest oceniane względem ostatniej nuty poprzedniej sesji, (b) nie da się przepuścić tego samego pliku przez detektor dwa razy i porównać wyników — drugi przebieg startuje z zabrudzonym stanem, (c) `previousFrequencyPro` ma trzy zapisy i **zero odczytów** (`:294`), czyli sugeruje kontrolę ciągłości, której nie ma.

### 1.6. Warstwa akwizycji nie ma stałego hopu — wszystkie parametry „na ramkę" są fikcją

Nie ma **ani jednego** użycia `AudioWorklet` w repo. Analiza chodzi w pętli `requestAnimationFrame` czytającej `AnalyserNode.getFloatTimeDomainData` (`hooks/use-audio-recorder.ts:33-40,78`; `app/record/karaoke/page.tsx:121-123,178`; `components/guitar-tuner.tsx:84-98`). To znaczy:

- Efektywny hop = jedna klatka animacji (~16,7 ms, a pod obciążeniem React / na telefonie 30–60+ ms).
- `AnalyserNode` zwraca **najświeższe** `fftSize` próbek w momencie wywołania → ramki nachodzą nieregularnie, część próbek jest duplikowana, część gubiona. **To nie jest ciągły strumień.**
- rAF jest dławiony do zera przy ukrytej karcie i zwalnia przy scrollu na iOS.
- Okno funkcji różnicowej to `MAX_PERIOD = sampleRate/65 ≈ 738` próbek @48 kHz = **~15 ms**, czyli dla niskiego głosu męskiego (82 Hz, okres 12,2 ms) **około jeden okres** — estymacja niskich F0 jest degeneracyjna niezależnie od tego, co się nad nią zbuduje.
- Model przejść HMM/Viterbi (kara proporcjonalna do |Δcentów| na ramkę) jest **zdefiniowany tylko przy stałym hopie**. Na nierównomiernych ramkach z rAF jest bezsensowny.

Do tego pętla trzyma zamrożone domknięcie (`hooks/use-audio-recorder.ts:78-79`): `processAudio` to `useCallback` z deps `[isPaused, sensitivity, detectionMode]`, ale planuje swoje kolejne wywołanie referencją do siebie z tego samego renderu. **Pauza nie pauzuje, suwak czułości i przełącznik Basic/Pro nie robią nic w trakcie nagrania**, choć UI pokazuje nowy stan.

### 1.7. Czterech różnych polityk pozyskiwania sygnału + prog w złej jednostce

| plik:linia | echoCancellation | noiseSuppression | autoGainControl |
|---|---|---|---|
| `hooks/use-audio-recorder.ts:85-91` | false | false | false ✓ |
| `components/guitar-tuner.tsx:36-41` | false | false | false ✓ |
| `app/edit/studio/page.tsx:461-467` | false | false | false ✓ |
| `app/record/karaoke/page.tsx:193-195` | false | false | **true** („Keep auto gain to prevent clipping") |
| `contexts/audio-recorder-context.tsx:67` | **getUserMedia({ audio: true })** — wszystko włączone | | |

Kontekst nagraniowy jest współdzielony, więc jest to najprawdopodobniej najszerzej używana ścieżka w aplikacji — i najgorsza. AGC nieliniowo zmienia obwiednię (unieważnia pomiar dynamiki i przesuwa efektywny prog), NS wycina harmoniczne przy niskich F0.

Prog RMS: `lib/pitch-detector.ts:54` domyślnie 0,001; realna ścieżka live używa 0,002 (`hooks/use-audio-recorder.ts:18`); karaoke ma zahardkodowane 0,01 (`app/record/karaoke/page.tsx:126`). Wszystkie trzy to **bezwzględne dBFS**, mierzone **po** programowym `GainNode` (domyślnie gain 2.0, `:108-115`) — więc ruszenie suwaka Gain przesuwa prog detekcji, o czym UI nie mówi. Rozrzut szumu tła między mikrofonem laptopa z systemowym AGC (~−45 dBFS) a kondensatorem USB (~−70 dBFS) przekracza 25 dB: **jedna stała nie może być poprawna dla obu**. Zła jest jednostka, nie wartość.

**Korekta:** teza „na czułym mikrofonie szum przechodzi prog i detektor produkuje przypadkowe nuty" została **obalona** pomiarem — biały szum o RMS 0,05 (25× powyżej progu) dał 0/60 ramek w basic i 0/30 w pro. Prog CMNDF 0,25 skutecznie odrzuca szum. Realny problem to tylko druga strona: cichy mikrofon nie przechodzi progu i aplikacja wygląda na martwą.

**Ograniczenie platformowe do zaakceptowania:** iOS Safari **w ogóle nie wspiera** constraintów `noiseSuppression` i `autoGainControl` (MDN BCD 8.0.8: `safari: false`, `safari_ios: false`; wspierany jest tylko `echoCancellation`). Na iPhonie w przeglądarce te dwie flagi są cichymi no-opami. Konsekwencja: **pomiary z iOS web nie są porównywalne z desktopowymi** i każda sesja musi nieść metadane platformy.

### 1.8. Nie ma pojęcia nuty, więc nie ma czego oceniać

`detectPitch` zwraca `{ frequency, confidence }` dla jednej ramki (`:244`) i nic więcej — brak flagi voiced/unvoiced, brak histerezy, brak zdarzeń nuty. Konsekwencje w warstwie oceny:

- `hooks/use-training-mode.ts:152-170` dzieli nagranie na okna **proporcjonalnie** do zaplanowanych długości nut, zakładając, że użytkownik trafił w tempo idealnie. Gorzej: wzorzec jest odtwarzany z 300 ms przerwą (`:58` `playNoteSequence(notes, 300)`), a `totalDuration` sumuje **wyłącznie** `duration` (600/800 ms). Użytkownik naśladujący wzorzec śpiewa w rytmie 900 ms/nutę, a siatka oceny dzieli w proporcjach 600/4800 — przy gamie 8-nutowej ostatnie nuty mają okno przesunięte o ~2 nuty.
- `hooks/use-training-mode.ts:189` uśrednia częstotliwość **liniowo w hercach** (`sum + p.frequency / length`). Jedna ramka z błędem oktawowym (a te są systematyczne powyżej E4) przesuwa `avgCents` o setki centów i przewraca ocenę całej nuty.
- `hooks/use-training-mode.ts:196-206` liczy `hitRate` jako procent **ramek** w ±50 centów, po wszystkich ramkach okna — bez odrzucenia ataku, bez obsługi glissanda, bez tolerancji na vibrato. Zawodowe vibrato ma zasięg ±34…±123 centów (średnia ±71, Prame 1997), więc poprawnie zaśpiewana nuta z vibratem spędza większość czasu poza progiem. `detectVibrato` istnieje (`lib/pitch-detector.ts:248`), ale jest używane **wyłącznie dekoracyjnie** w `components/current-note-display.tsx:77`.
- `hooks/use-hit-the-note-game.ts:11`: `REQUIRED_CONSECUTIVE_HITS = 100` z komentarzem „~5 seconds at ~20 pitch detections per second", UI obiecuje 3 s (`hit-the-note-game.tsx:63`), a faktycznie przy 60 Hz to 1,67 s, przy 120 Hz ProMotion 0,83 s. **Trudność gry zależy od częstotliwości odświeżania ekranu.** Licznik nie wygasa w ciszy (`processPitch` wołane tylko gdy `currentPitch != null`), więc nutę można „uzbierać" krótkimi impulsami.
- `hooks/use-voice-profile.ts:104-107` rozszerza min/max **monotonicznie**, nigdy nie zwężając, karmiony surowym wyjściem detektora (`contexts/audio-recorder-context.tsx:53`). Ponieważ błędy są systematyczne (÷3, ÷5), każda nuta powyżej C4 dokleja punkt w okolicy 65–90 Hz. `minF0` osiada na dolnym limicie detektora po pierwszej sesji — a potem **wraca do detektora** przez `getUserRangeScore` (`lib/pitch-detector-pro.ts:259`) z wagą 0,2. Domknięta pętla sprzężenia utrwalająca błąd.

Do tego dwie zduplikowane, **błędne** konwersje Hz→nuta obok poprawnej `frequencyToNote`:
- `app/record/karaoke/page.tsx:137-139`: `octave = Math.floor(halfSteps / 12) - 1` gdzie `halfSteps` liczone od C0 → **każda nuta o oktawę za nisko** (A4→„A3", C4→„C3", E2→„E1").
- `components/guitar-tuner.tsx:174-177`: `octave = Math.floor((noteIndex + 3) / 12) + 4` → **A, A# i B o oktawę za wysoko** (struna A2 = „A3", B3 = „B4", A4 = „A5").

---

### Werdykt: PRZEPISAĆ warstwę decyzyjną i akwizycyjną, ZACHOWAĆ ~60 linii rdzenia

**Nie da się tego naprawić lataniem, bo zepsuta jest warstwa DECYZYJNA (wybór kandydata i akwizycja ramek), a nie warstwa obliczeniowa.** Argumenty:

1. Heurystyki wyboru kandydata są albo martwe (`:116-135`, `:204`, pro `:285`), albo działają aktywnie przeciw użytkownikowi (`:175` kara na 200 Hz, `:156` kara oktawowa, `:210-229` bezwarunkowe odrzucenie oktawy). Nie ma tam czego stroić.
2. Warstwa „wielu hipotez" **już istnieje** w `lib/pitch-detector-pro.ts:251-282` i jest **koncepcyjnie właściwym szkieletem** — ale jej cechy są bez wartości (50% budżetu punktowego to stałe 0,5+0,5 przy braku profilu, `:107-109`/`:129-131`) i **będzie kolidować** z dodaniem Viterbi. Dołożenie dekodera sekwencyjnego na wierzch da podwójną korektę: Viterbi ukarze skok, który heurystyka już złożyła o oktawę, i wynik będzie gorszy niż każde z rozwiązań osobno. **Heurystyki muszą wypaść PRZED dodaniem dekodera.**
3. Akwizycja na rAF + `AnalyserNode` nie daje stałego hopu ani ciągłego strumienia. Bez tego żaden estymator nie da powtarzalnych liczb, a zbiór ewaluacyjny będzie mierzył coś innego niż to, co widzi użytkownik na żywo.
4. Prior `userRangeMatch` w aplikacji do **treningu** głosu systematycznie ukrywa dokładnie te zdarzenia, które aplikacja ma mierzyć: rozszerzanie zakresu, falset, przejścia rejestrów. Czyni ewaluację cyrkularną.

**Do zachowania (~60 linii, przenoszą się bez zmian):** funkcja różnicowa ze stałym oknem, normalizacja CMND, interpolacja paraboliczna, `noteToFrequency`, `frequencyToNote`, tabela zakresów typów głosu, szkielet scoringu wielohipotezowego (jako *kształt*, nie jako *cechy*).

**Kolejność prac, w której każdy krok zwraca się natychmiast** (odwrotna do intuicyjnej — nie zaczynaj od dekodera):

| # | krok | nakład | zysk |
|---|---|---|---|
| 0 | Deterministyczna akwizycja: AudioWorklet + ring buffer + stały hop | S | Pierwszy raz sensowne parametry „na ramkę"; warunek wstępny wszystkiego |
| 1 | FFT radix-2 zamiast naiwnego DFT (`lib/fft-analyzer.ts:24`) | S | ~50–100× CPU; tryb Pro przestaje głodzić UI |
| 2 | Harness golden-testów na **obecnej** implementacji (zbiory CC BY 4.0) | M | Punkt wyjścia w liczbach; bez tego reszta jest zgadywaniem |
| 3 | Usunięcie trucizny: bloki `:116-135`, `:142-179`, `:210-229`, `:204`, pro `:285`, `userRangeMatch`, stan modułowy, `console.log` `:27-30`; prog 0,25→0,12 | S | Największy pojedynczy skok jakości; usuwa błędy z 1.2 i 1.3 |
| 4 | Mediana-3 w centach + octave-snap + One Euro na ścieżce wyświetlania | S | Stabilny wskaźnik bez opóźnienia decyzyjnego |
| 5 | Dowody widmowe per ramka (SHR, wzór harmonicznych) z już liczonego widma | M | Rozstrzyga oktawę **wewnątrz ramki** — najtańsza część walki z oktawami |
| 6 | pYIN stage 1 (100 progów, prior Beta) + pełny Viterbi w **ścieżce oceny offline** | M | 0,5–1,7% octave error, wiarygodny voicing |
| 7 | Segmentacja nut + vibrato + referencja adaptacyjna + nowy scoring | L | Pierwszy raz uczciwa ocena |
| 8 | Rdzeń w Rust (tylko kernel: FFT/YIN/Viterbi, ~1–1,5k LOC) | XL | Warunek portu natywnego, **nie** warunek jakości |

Punkt 8 jest **na końcu i jest opcjonalny na tym etapie**. Uzasadnienie: przy hopie 512 (10,7 ms) i budżecie 30–80 ms opóźnienia analizy masz 3–7 hopów zapasu, więc jedyny kod, który *musi* być bez GC i bez alokacji, to skopiowanie próbek z callbacku audio do ring buffera (~30 LOC na platformę). Sama analiza może chodzić w zwykłym Workerze. Przepisanie do Rust jest warunkiem *jednego brzmienia na trzech platformach*, nie warunkiem *poprawności*.

---

## 2. Architektura docelowa pipeline'u

```
[0] CAPTURE          AudioWorklet, 128 ramek/quantum, ring buffer, chunk 512 → transferable postMessage
        │                                                             (bez SAB, bez COOP/COEP)
        ▼
[1] PREPROCESSING    resample→48 kHz │ HP Butterworth 4° @65 Hz │ (kopia) LP Butterworth 2° @3 kHz
        │
        ▼
[2] FRAMING          N=3072 (64 ms), W_int=2048 (42,7 ms), tau∈[40,1024], hop 512 live / 256 offline
        │
        ▼
[3] F0 CANDIDATES    YIN-FFT (d przez realFFT 4096) → CMND → 100 progów (Beta 2,18) → interp. paraboliczna
        │            + dowody widmowe: SHR, wzór amplitud harmonicznych, flatness, HNR, LF ratio
        ▼
[4] VOICING          fuzja log-odds 5 cech → voicedProb ∈ [0,1] + skalibrowana bramka poziomu
        │
        ▼
[5] DECODING         HMM 531 binów × 10 centów (55–1175 Hz) × {voiced, unvoiced} = 1062 stany
        │            LIVE: mediana-3 + octave-snap │ OCENA: pełny Viterbi po całym take'u + interp. sub-bin
        ▼
[6] SEGMENTATION     histereza na konturze centów: 60/100 centów, hold 60 ms, min 100 ms
        │            + pominięcie ataku (adaptacyjne 40–150 ms) i release (40 ms), min 50 ms steady
        ▼
[7] VIBRATO          residuum vs mediana 250 ms → FFT → pik 4–9 Hz → rate/extent/regularity
        │            środek nuty = średnia krocząca o długości 1 okresu vibrata, W CENTACH
        ▼
[8] REFERENCE        transpozycja (moda kołowa, zamrożona po 4–6 nutach) + O(t) (mediana 6 nut, EMA τ=3 s)
        │            + temperacja: strefa martwa z korektą naturalną a cappella
        ▼
[9] METRICS          offset / scatter / drift / interval_err + P, C, S, T, K
        │
        ▼
[10] SCORE           średnia geometryczna ważona + kalibracja na kotwicach
```

### [0] Capture

| parametr | wartość | uzasadnienie |
|---|---|---|
| sampleRate wewnętrzny | **48 000 Hz** | natywny na iOS/Android; 44,1 kHz na Macach wymusza resampling — rób go jawnie w rdzeniu |
| kanały | 1 (mono) | |
| constraints | `{ echoCancellation:false, noiseSuppression:false, autoGainControl:false, channelCount:1 }` | + **obowiązkowo** `track.getSettings()` po uzyskaniu strumienia; iOS ignoruje 2 z 3 → zapisz faktyczne ustawienia w metadanych sesji |
| gdzie | `AudioWorkletProcessor` | render quantum **stały 128 ramek = 2,67 ms**, nie do zmiany (`AudioContext()` przyjmuje tylko `latencyHint`, `sampleRate`, `sinkId`) |
| co robi worklet | wyłącznie: kopia bloku do pre-alokowanego bufora z puli → `port.postMessage(buf, [buf])` co 4 quanta | ~30 LOC, RT-safe, zero alokacji |
| chunk | **512 próbek = 10,67 ms**, 93,75 msg/s, 2 kB | pula 8 buforów zwracanych przez Worker; pusta pula = drop + licznik XRUN |
| transport | transferable `ArrayBuffer` przez `postMessage` | **nie SharedArrayBuffer** — SAB wymaga COOP/COEP, a Safari nie ma `COEP: credentialless`, więc wywala iframe YouTube z karaoke |

**Wejście:** `Float32Array[128]` z callbacku audio. **Wyjście:** ciąg `ArrayBuffer(512·4 B)` do Workera. **Koszt:** ≤ 0,15 ms na quantum (≤ 5% budżetu 2,67 ms).

Ładowanie WASM: `AudioWorkletGlobalScope` **nie ma `fetch` ani XHR** — modułu `.wasm` nie da się tam wczytać. Jeśli kiedyś DSP wejdzie do worklet, moduł trzeba skompilować na głównym wątku (`WebAssembly.compile`) i przesłać przez `postMessage`. W architekturze wyżej to nieistotne, bo worklet tylko kopiuje.

**Kalibracja wejścia (zamiast suwaka czułości):**

```
KROK 1 — cisza (2,0 s): ramki 20 ms / hop 10 ms → 200 pomiarów RMS w dBFS
  N = mediana
  odrzuć i powtórz, jeśli p90 > mediana + 10 dB (ktoś mówił) lub N > −35 dBFS (za głośno)
KROK 2 — głos (3,0 s, „zaśpiewaj aaa"): S = p90; SNR = S − N
  SNR ≥ 30 dB doskonale │ 20–30 dobrze │ 12–20 używalne (ostrzeż) │ < 12 odmów sesji treningowej
  clipping: > 0,1% próbek |x| > 0,98 → „zmniejsz wzmocnienie"
KROK 3 — progi: voicedEnter = N + max(10, 0,35·SNR) dB; voicedExit = voicedEnter − 4 dB
  attack 0 ramek, release 3–5 ramek (30–50 ms)
KROK 4 — adaptacja: N = percentyl 10 z pierścienia 3–5 s, tylko z ramek pewnie-unvoiced,
  zamrożenie 1 s po zaniku voicingu, slew ±3 dB/s
KROK 5 — persystencja: klucz = deviceId + label z MediaDeviceInfo
```

Suwak czułości (`components/audio-settings.tsx:80-91`) **musi zniknąć** albo zdegradować się do offsetu diagnostycznego. Ręczne przestrajanie progu między sesjami unieważnia porównywalność postępów w czasie — czyli kluczową funkcję produktu. **Każda zapisana sesja musi nieść zmierzone N i SNR**, żeby stare sesje pozostały interpretowalne po zmianie kalibracji.

### [1] Preprocessing

| filtr | parametry | ścieżka | dlaczego |
|---|---|---|---|
| DC block | jednobiegunowy HP @ 5 Hz | wszystkie | offset DC |
| HP | Butterworth 4° (2 kaskadowe biquady), −3 dB @ **65 Hz** | wszystkie | 17 Hz poniżej E2 (82,41 Hz); usuwa rumble, handling noise |
| LP | Butterworth 2° @ **3000 Hz** | **tylko kopia idąca do detektora F0** | szum przydechowy i sybilanty mają dużą energię w 4–10 kHz, która w autokorelacji generuje minima przy krótkich lagach → sztuczny pitch o oktawę za wysoko. To najczęstsza przyczyna złego zachowania na głosie oddechowym i falsecie. **Nie stosować na sygnale do odsłuchu ani zapisu.** |
| okno | **PROSTOKĄTNE** | detektor F0 | taper (Hann) obcina koniec okna i systematycznie przesuwa minima d'. Hann wyłącznie do widma (z zero-paddingiem) |

**Wejście:** ciągły strumień 48 kHz. **Wyjście:** dwa strumienie — `x_audio` (HP) i `x_pitch` (HP+LP). **Koszt:** ≤ 0,02 ms/ramkę.

### [2] Framing

| parametr | wartość | uzasadnienie |
|---|---|---|
| N (ramka podawana estymatorowi) | **3072 próbek = 64 ms** | |
| W_int (okno całkowania, stałe dla wszystkich tau) | **2048 próbek = 42,67 ms** | 3 okresy fmin są wymagane (kryterium Boersmy); 2048 = 3 okresy dla 70 Hz, 2,77 dla 65 Hz — udokumentowany kompromis |
| tau_max | **1024** → fmin **46,9 Hz** | |
| tau_min | **40** → fmax **1200 Hz** | zapas nad C6 (1046,5 Hz) |
| **niezmiennik** | **N ≥ W_int + tau_max = 3072** ✓ dokładnie | funkcja różnicowa **nigdy nie jest obcinana**, więc nie wymaga normalizacji liczbą składników. To bezpośrednio naprawia latentny błąd `lib/pitch-detector.ts:74` przy 88,2/96 kHz |
| hop live | **512 = 10,67 ms** → 93,75 fps | |
| hop offline/ocena | **256 = 5,33 ms** → 187,5 fps | zgodne z referencyjnym Vamp pYIN (step 256 @44,1 kHz = 5,8 ms) |

**Efektywna szerokość czasowa** estymaty ≈ W_int + 1/F0: 43 ms dla 200 Hz, 55 ms dla 80 Hz. Konsekwencja dla vibrato: pomiar zasięgu jest tłumiony o czynnik ≈ sinc(f_vib · W_eff). Przy 6 Hz i W_eff = 50 ms to ~0,86 → **~14% zaniżenia zasięgu vibrato**. Kompensacja: mnóż zmierzony extent przez `1/sinc(rate · W_eff)`, wartość walidowana testem syntetycznym (punkt 6.4), nie przyjmowana analitycznie na wiarę.

### [3] Kandydaci F0

```
d(tau) = r(0) + r_tau(0) − 2·r(tau)         ← przez realFFT, NIE naiwnie
  r(tau)      : autokorelacja z zero-paddowanego realFFT długości 4096
  r(0), r_tau(0) : biegnące sumy kumulatywne, O(W)
d'(tau) = d(tau) · tau / Σ_{j=1..tau} d(j)   ← CMND, równanie (8) de Cheveigné & Kawahara
```

To zamienia O(W·L) = 4,194 MMAC/ramkę na ~305 kFLOP — **~14× mniej operacji**, asymptotycznie W/log₂(2W) = 170×. Dokładnie ta zamiana kryje się pod nazwami `yinfast`/`yinfft` w aubio i `FastYin` w TarsosDSP. **Uwaga na najczęstszy bug domowych implementacji YIN-FFT: brak zero-paddingu do ≥ W + tau_max daje circular wraparound i fałszywe minima przy dużych lagach** — sevagh naprawiał dokładnie ten błąd w release grudzień 2023, przechodząc na transformaty r2c/c2r.

**Stage 1 pYIN (zamiast jednego progu):**

| parametr | wartość |
|---|---|
| liczba progów | 100, wartości 0,01…1,00 krok 0,01 |
| prior | Beta(α=2, β=18), średnia **0,10**, moda 0,056 |
| `no_trough_prob` (p_a) | 0,01 — masa dla fallbacku argmin |
| kandydaci | **wszystkie** lokalne minima d' z d' < 0,60, do K = 12, + jawnie dołożone 2f i f/2 z ich **własnymi** zmierzonymi d' |

Prior Beta o średniej 0,10 dał w oryginalnej pracy **najlepsze F (0,981) i najniższy octave error (0,5%)** — średnie 0,15 i 0,20 wypadły gorzej (0,9% i 1,7%). Nie eksperymentować z wyższymi.

Jawne dołożenie kandydatów 2f i f/2 gwarantuje, że poprawna oktawa jest **zawsze na siatce**, nawet gdy CMND nie dał tam wyraźnego minimum. **Nigdy nie usuwaj kandydatów** — nie da się zdekodować ścieżki przez punkt, który wykasowałeś. To jest bezpośrednia lekcja z `lib/pitch-detector.ts:116-135`.

**Dowody widmowe (z tego samego widma, praktycznie darmowe):**

| cecha | definicja | rola |
|---|---|---|
| SHR (subharmonic-to-harmonic ratio) | stosunek energii przy subharmonicznych do harmonicznych | SHR > ~0,4 → jesteś oktawę za nisko. **Podawaj jako DODATKOWĄ obserwację przesuwającą masę między binem f i 2f, nigdy jako regułę nadpisującą** |
| wzór amplitud harmonicznych | energia przy f, f·2…f·8 **oraz f/2, f/3, f/5** | to poprawia błąd `lib/pitch-detector-pro.ts:82-99`, który sprawdzał tylko f/2 i f·2 i dawał harmonicScore 1,00 dla ÷3 i ÷5 |
| spectral flatness (80–4000 Hz) | średnia geometryczna / arytmetyczna widma mocy | tonalne < 0,10, szumowe > 0,40 |
| LF energy ratio | energia < 1 kHz / całość | śpiewana samogłoska > 0,6; syk, HVAC, klik klawiatury znacznie niżej |

**Kluczowa korekta wobec dominującego przekonania:** teza „w obrębie jednej ramki NIE MA informacji rozstrzygającej oktawę" jest prawdziwa dla samego CMNDF, ale **fałszywa jako zdanie o ramce**. CREPE jest estymatorem czysto per-ramkowym (Viterbi opcjonalny) i bije pYIN. Informacja rozstrzygająca oktawę leży w **widmie** jednej ramki. Dlatego kolejność jest: **najpierw dowody ramkowe (krok 5 planu), potem dekodowanie sekwencyjne (krok 6)**. Dekoder na słabych dowodach ramkowych da gładki, ale konsekwentnie o oktawę przesunięty kontur — a to gorszy tryb awarii niż migotanie, bo niewidoczny.

**Koszt:** realFFT 4096 (forward + inverse) + widmo mocy ≈ 305 kFLOP; skan 100 progów ≈ 102k op; cechy widmowe ≈ 50k op. Razem szacunkowo **≤ 0,8 ms/ramkę w JS, ≤ 0,15 ms w WASM+SIMD128**.

### [4] Voicing

Fuzja pięciu cech do jednego `voicedProb ∈ [0,1]`, podanego dekoderowi jako masa emisyjna stanu unvoiced. **Żadna cecha nie jest bramką z twardym progiem** — twardy prog na dowolnej z nich zawodzi na innym podzbiorze nagrań (aperiodyczność na głosie oddechowym, energia na cichym pp, ZCR na dźwięcznych spółgłoskach, flatness na wibracji przydechowej).

| cecha | definicja | progi |
|---|---|---|
| aperiodyczność | d'(tau*) z integracją po priorze Beta(2,18), 100 progów | zamiast jednej wartości — rozkład |
| HNR | z znormalizowanej autokorelacji r: **HNR_dB = 10·log10(r/(1−r))** | r=0,5→0 dB; 0,8→6; 0,9→9,5; 0,95→12,8; 0,99→20. Wejście w voiced > **7 dB**, wyjście < **4 dB** (histereza). Zdrowa śpiewana samogłoska 15–25 dB, mowa 10–20, oddechowy < 7. Wymaga ≥6 okresów → licz na dłuższym oknie, co 2. ramkę |
| spectral flatness | 80–4000 Hz | tonalne < 0,10, szumowe > 0,40 |
| LF energy ratio | < 1 kHz / całość | samogłoska > 0,6 |
| ZCR | przejścia przez zero / s | samogłoska ~2·F0 = 200–600/s; /s/ i /ʃ/ 3000–5000/s. **Tylko rozstrzygacz remisów** |
| bramka poziomu | z kalibracji (sekcja [0]) | enter N+max(10, 0,35·SNR) dB, exit −4 dB, release 3–5 ramek |

Ograniczenia czasu trwania: minimalny odcinek voiced **5 ramek = 50 ms** (krótszy niż jakakolwiek śpiewana nuta i krótszy niż 3 okresy niskiego głosu → nie może być prawdziwy); minimalny unvoiced **3 ramki = 30 ms**; hangover po zaniku 3–5 ramek, żeby nie obcinać wybrzmienia.

**Krytyczne rozróżnienie API:** rozdziel `periodicity` (surowe 1 − d', do wyboru kandydata, **NIE jest prawdopodobieństwem**, z konstrukcji ograniczone do [0,88; 1] przy progu 0,12) od `voicedProb` (skalibrowana miara z fuzji, [0,1]). **Zakaz w UI: nigdy nie próguj na `periodicity`.** To jest bezpośrednia poprawka błędu z `app/record/karaoke/page.tsx:127` i `hooks/use-vocal-range.ts:56,106` (`confidence > 0.9`).

### [5] Dekodowanie sekwencyjne

**Siatka:** 10 centów/bin, **55–1175 Hz (A1–D6)** → `round(1200·log2(1175/55)/10) = 531` binów voiced + 531 „cieni" unvoiced = **1062 stany**.

Zakres jest **celowo szerszy niż użytkowy** (E2–C6 = 82–1047 Hz). Ograniczenie siatki do zakresu użytkowego powoduje przyklejanie ścieżki do krawędzi: subharmoniczne, vocal fry i przydźwięk sieciowy generują kandydatów poniżej E2, a Viterbi bez stanu docelowego wybierze najbliższy istniejący, produkując fałszywe „poprawne" odczyty na dolnej granicy.

**Model przejść voiced→voiced:**

```
P(Δ) = 0,9 · Laplace(Δ; σ=40 centów) + 0,1 · Laplace(Δ; σ=250 centów)
obcięcie okna: |Δ| ≤ 500 centów na ramkę przy hopie 10,67 ms  (= 469 półtonów/s)
transition_min_prob = 1e-4  (przycinanie małych prawdopodobieństw, jak librosa)
```

**Uzasadnienie tej konkretnej formy** (i odrzucenie dwóch popularnych alternatyw):

- **Nie kwadratowy koszt |Δ|²** — gaussowski koszt efektywnie *zakazuje* interwałów, czyli powtarza błąd `lib/pitch-detector.ts:210-229`, tylko gładziej. Koszt musi być L1 w log-częstotliwości (dokładnie jak `OctaveJumpCost·|log2(F1/F2)|` u Boersmy), z ciężkim ogonem.
- **Nie podłoga jednostajna ε=0,02** — to popularna „poprawka", która niszczy dokładnie tę zdolność, po którą buduje się dekoder. Arytmetyka: masa podłogi na bin = 0,02/531 = 3,77e-5; człon Laplace'a σ=4 biny (gęstość ≈ (1/8)·exp(−|Δ_bins|/4)) spada poniżej podłogi przy |Δ| ≈ 32 biny ≈ 320 centów. Powyżej tego **każde** przejście kosztuje tyle samo: kwinta, septyma, oktawa i dwie oktawy stają się dla dekodera równocenne. Mieszanka dwóch Laplace'ów zachowuje monotoniczność kosztu na całym zakresie, więc oktawa nadal jest droższa od kwinty.
- **Szerokość okna 500 centów/ramkę = 469 półtonów/s.** Referencje: praca pYIN 431 st/s (2,5 półtonu na ramkę 5,8 ms), librosa 35,92 st/s. librosa jest **dokładnie na granicy** maksymalnego nachylenia vibrato 6 Hz o zakresie ±100 centów (2π·6·100 = 3770 centów/s = 37,7 st/s), więc szerokie vibrato operowe (±200 centów) byłoby spłaszczane. Skopiowanie domyślnych librosy do trenera śpiewu to cichy błąd pomiarowy. Najszybsze realne gesty: glissando przez oktawę w 0,3 s = 40 st/s; wybrany zapas jest ~10×.
- **Bias oktawowy — asymetryczny, na bezwzględną wysokość, nie na skok.** YIN/autokorelacja mylą się **W DÓŁ** (subharmonicznie), metody widmowe **W GÓRĘ**. Praat rozwiązuje to `OctaveCost = 0,01/oktawę` na siłę kandydata: `R = r(τmax) − OctaveCost·log2(MinimumPitch·τmax)`. Kara na *skok* ±1200 centów byłaby błędem koncepcyjnym — karałaby prawdziwe skoki oktawowe równie mocno jak pomyłki.

**Przejście voicingu:** `switch_prob = 0,01` (0,99 stay). Koszt unvoiced→unvoiced = 0 (Boersma, równanie 27).

**Emisja:** dla stanu voiced m: `p_{m,voiced} = voicedProb · p*_m`; dla unvoiced: `(1 − voicedProb)/531` (jednostajna, jak librosa).

**Dwie ścieżki wyjścia — i to jest świadoma decyzja architektoniczna:**

| ścieżka | mechanizm | opóźnienie | do czego |
|---|---|---|---|
| **LIVE** | mediana-3 w centach (tylko wewnątrz odcinka voiced) → octave-snap → One Euro (fcmin 1,5 Hz, β 0,01, dcutoff 1,0 Hz) | 1 hop = 10,7 ms + ~20–40 ms | wskaźnik i ślad na ekranie. **Nigdy nie ocenia** |
| **OCENA** | **pełny Viterbi po całym take'u** + interpolacja sub-binowa | offline, po nagraniu | scoring, segmentacja nut, vibrato, statystyki postępu |

**Odrzucam fixed-lag Viterbi z dwupoziomowym wyjściem (Tier A/Tier B) jako over-engineering na tym etapie.** Uzasadnienie: we wszystkich trzech filarach ocena jest z natury **wsadowa** — TRAIN ocenia wykonanie ćwiczenia (take), SING obrabia nagranie karaoke po fakcie, PODCAST pracuje na plikach. Dla ścieżki ocenianej nie ma żadnego ograniczenia opóźnienia, a pełny Viterbi po całej sekwencji jest **ściśle dokładniejszy** od fixed-lag i nie generuje klasy bugów „rozjazd między tym, co widziałem, a tym, co ocenił system". Fixed-lag (L = 14–24 ramki = 149–256 ms) wprowadzać dopiero jeśli wymóg produktowy wymusi ocenianie *w trakcie* nuty.

**Interpolacja sub-binowa jest OBOWIĄZKOWA, nie opcjonalna.** Siatka 10 centów/bin daje błąd kwantyzacji ±5 centów, czyli **50% szerokości pasma „perfect"** w istniejącej metryce (`lib/pitch-detector.ts:280-284`: `|cents| ≤ 10` → perfect). Kwantyzacja sama przerzucałaby nuty między klasami ocen. Realizacja: paraboliczna interpolacja po posteriorze DP, albo raportowanie ciągłej częstotliwości zwycięskiego kandydata YIN „przyklejonej" do zdekodowanego binu. **Wariant 20 centów/bin (tańszy dla mobile) jest skreślony dla TRAIN.**

**Octave-snap (ścieżka live):**
```
M = mediana ostatnich 200 ms voiced (wymagaj ≥5 ramek voiced w oknie)
jeśli |cent(f) − M| ∈ {−1200±60, +1200±60, +2400±60, −1902±60}   ← ostatnie: kwinta nad oktawą (3. harmoniczna)
   ORAZ istnieje kandydat przy f·2 / f/2 / f/3 z siłą ≥ 0,8·siły zwycięzcy
→ podmień
```

**Koszt:** 531 · 2 · ~50 niezerowych przejść ≈ 53k mul-add na ramkę. Live: pomijalny. Pełny Viterbi 3-minutowego take'u przy hopie 512: 16 870 ramek × 53k = 894 M op → **≤ 1,5 s w JS w Workerze z raportowaniem progresu, ≤ 0,4 s w WASM**. Dla ćwiczenia 10–30 s to 80–250 ms, czyli niewyczuwalne.

### [6] Segmentacja na nuty

Podejście: **histereza na krzywej pitch-time** (SiPTH, Molina i in. 2014), nie klasyczna detekcja onsetu. Śpiew legato nie ma transientu perkusyjnego — spectral flux jest zaprojektowany pod atak perkusyjny i na miękkich onsetach wokalnych ma fatalną skuteczność. Dowód pośredni: ewaluacja transkrypcji śpiewu używa tolerancji onsetu **100 ms**, podczas gdy MIREX dla onsetów perkusyjnych 50 ms.

| parametr | wartość |
|---|---|
| STAY_BAND | 60 centów od bieżącego centrum nuty |
| NEW_NOTE_BAND | 100 centów (potwierdzenie, histereza) |
| NEW_NOTE_HOLD | 60 ms (6 ramek) poza pasem |
| MIN_NOTE_LEN | 100 ms — krótsze segmenty scal z bliższym wysokościowo sąsiadem (to były przejścia, nie nuty) |
| reartykulacja tej samej wysokości | spadek RMS ≥ 8 dB poniżej mediany RMS nuty przez ≥ 40 ms z powrotem = podział |
| granica voiced/unvoiced | zawsze granica nuty |
| spectral flux | **wyłącznie** do klasyfikacji spółgłoski (plozywne/frykatywne), nigdy jako główny detektor onsetu |

**Pomijanie ataku i release — adaptacyjne, nie stała:**

```
skip_head = pierwsza ramka, dla której w oknie 50 ms JEDNOCZEŚNIE:
              |nachylenie wygładzonego konturu| < 400 centów/s
              ORAZ (max − min w oknie) < 35 centów
            clamp do [40 ms, min(150 ms, 0,3 · długość nuty)]
skip_tail = 40 ms
wymóg: ≥ 50 ms (5 ramek) stanu ustalonego, inaczej nuta = UNMEASURABLE
```

Głos ma na ataku charakterystyczny „scoop" (dojście od dołu), a między nutami legato naturalny glide. Uśrednienie ich razem ze stanem ustalonym karze technicznie poprawny śpiew i systematycznie przesuwa wynik w stronę „flat". Jednocześnie **nadmierny scoop to realny problem pedagogiczny**, więc nie wolno go tylko wyciszyć — mierz osobno:

```
attack_accuracy = czas od startu nuty do wejścia w pas 50 centów od celu + kierunek (od dołu/góry)
cel dydaktyczny: < 80 ms
```

**TRANSITION** (wykluczany z obu sąsiednich nut, nie karany): monotoniczna rampa obejmująca > 80 centów z |nachyleniem| > 500 centów/s, trwająca 50–250 ms między dwoma stabilnymi segmentami. Jeśli glide > 250 ms lub scoop na ataku obejmuje > 120 centów → osobna metryka, nie kara intonacyjna.

**Jawna kategoria UNMEASURABLE.** Nuta za krótka, zbyt cicha, zbyt szumna albo bez stanu ustalonego **nie dostaje oceny 0** — jest wykluczona i zaraportowana. Jeśli > 30% nut jest niemierzalnych, komunikat brzmi „popraw mikrofon/pomieszczenie", nie „twój wynik: 43%".

**W tempie powyżej ~8 nut/s** (nuty 150–250 ms) po pominięciu ataku zostaje bardzo mało materiału — wtedy jawnie powiedz, że ocena intonacyjna nie jest rzetelna, zamiast zwracać liczbę.

**Wyrównanie do wzorca:** dla ćwiczeń z metronomem wystarczą okna tolerancji ±150 ms plus jednorazowa kalibracja latencji urządzenia. Dla dowolnej melodii — **wyrównanie na poziomie NUT** przez Needleman-Wunsch z affine gap penalty (koszt substytucji = min(|Δcentów|, 400)/100 + |Δt|/200 ms; gap open 2,0, extend 1,0). Macierz < 100×100 = mikrosekundy. To daje **bezpośrednio** metryki „pominięte nuty" i „dodane nuty", których DTW ramkowy nie umie (DTW z definicji nie potrafi tanio usunąć nuty). Zastępuje w całości `hooks/use-training-mode.ts:152-170`.

### [7] Vibrato

**Detekcja** (wymaga ≥ 500 ms stanu ustalonego, idealnie 600–1000 ms = 3–6 okresów):

```
r(t) = cents(t) − krocząca_mediana(cents, 250 ms)
FFT(r, okno Hann, zero-pad do 1024)
szukaj piku w 4,0–9,0 Hz
vibrato obecne  ⟺  moc piku ≥ 4× (6 dB) średnia moc w 1–15 Hz
                   ORAZ autokorelacja r przy lagu 1/rate > 0,5
rate      = pik z interpolacją paraboliczną
extent    = √2 · RMS(r) centów · 1/sinc(rate · W_eff)    ← kompensacja okna analizy
regularity= 1 − stdev(długości półokresów) / mean(długości półokresów)
```

Tania alternatywa live bez FFT: przejścia przez zero r(t) w oknie 500 ms + mediana amplitudy półokresu.

**Środek nuty** (to jest najważniejsza pojedyncza zmiana w całej sekcji oceny):

```
jeśli vibrato:  center = mean( średnia_krocząca(cents, N = round(100/rate) ramek) )
                         po ramkach, dla których pełne okno się mieści
                         (przy 6 Hz i hopie 10,67 ms → N = 16 ramek = 171 ms)
w przeciwnym razie: center = median(cents po stanie ustalonym)
ZAWSZE W CENTACH, NIGDY W HERCACH
```

Uzasadnienie: postrzegana wysokość tonu z vibratem odpowiada średniej czasowej modulacji w domenie **logarytmicznej** (średnia geometryczna skrajnych F0 dla zasięgu do ~1 półtonu, Shonle & Horan 1980). Uśrednianie w hercach systematycznie przesuwa wynik w stronę „sharp". Średnia krocząca o długości dokładnie jednego okresu vibrata jest idealnym notchem na częstotliwości vibrata i jej harmonicznych — tańsza i odporniejsza niż dopasowanie sinusoidy, i bez opóźnienia fazowego (filtr symetryczny). To zastępuje `hooks/use-training-mode.ts:189` (uśrednianie liniowe w Hz).

**Normy do feedbacku** (uwaga: dane Prame dotyczą profesjonalistów klasycznych; progi dla amatorów są **szacunkami inżynierskimi**, patrz otwarte pytania):

| wskaźnik | zdrowe/wytrenowane | patologia |
|---|---|---|
| rate | 5,5–7,5 Hz | < 5 Hz z dużym zasięgiem = **wobble**; > 8 Hz z małym zasięgiem = **tremor** (napięcie krtani) |
| extent | ±20–50 centów pop/rock; ±34–123 klasyka (średnia ±71) | |
| regularity | ≥ 0,85 | < 0,85 = vibrato nieregularne — **u amatorów to lepszy marker niż samo tempo** |
| onset | 200–300 ms po ataku | natychmiastowy = często niekontrolowany |

**Nie mieszać zasięgu vibrata z rozrzutem intonacyjnym.** Po odjęciu vibrata raportuj SD **wygładzonego** konturu jako „stabilność", a amplitudę vibrata osobno. Odwrotność (rozszerzanie tolerancji intonacyjnej gdy jest vibrato) to błąd — vibrato nie usprawiedliwia złego centrum.

### [8] Referencja adaptacyjna

Trzy niezależne wielkości, których obecny kod nie rozdziela wcale.

**A. Transpozycja i oktawa.** Praca domyślnie w przestrzeni **chroma (mod 1200)**:

```
d_i = 1200 · log2(f_i / f_ref_i)
histogram (d_i mod 1200), bin 10 centów, jądro gaussowskie σ = 20 centów → moda kołowa T
k  = round(T / 100)          ← półtony
O0 = T − 100·k               ← z konstrukcji |O0| < 50
```

- **Zamek po 4–6 nutach LUB 2,5 s głosu**, warunek akceptacji: MAD(d_i − T) < 60 centów na ≥ 60% dopasowanych nut. Ponowne szacowanie w trakcie utworu sprawia, że śpiewak modulujący w losowe tonacje dostaje 100%.
- **Oktawa (k mod 12 == 0): akceptuj bezwarunkowo**, raportuj informacyjnie („śpiewałeś o oktawę niżej — w porządku"). Bez niezmienniczości oktawowej połowa użytkowników dostaje antywzorzec „zawsze 40%".
- Transpozycja nie-oktawowa: akceptuj w trybie ćwiczeń/a cappella; przy podkładzie tylko **ostrzeż**.
- Jeśli jest zapisany zakres głosu użytkownika — pretransponuj referencję tak, by jej mediana wpadła w środek jego zakresu. Wtedy oczekiwane T ≈ 0 i estymacja jest tylko zabezpieczeniem.
- Awaryjny restart: jeśli po 8 nutach MAD residuów > 80 centów, zrestartuj estymację **raz i tylko raz**, zaznaczając w UI „restart strojenia".

**B. Offset tonacji O(t) — wolno zmienny dryf.** To jest różnica między „śpiewasz czysto, ale 30 centów nisko" i „śpiewasz chaotycznie".

| parametr | wartość |
|---|---|
| okno | 6 nut (min 3, nie krócej niż 2,5 s głosu) |
| statystyka | **MEDIANA** (nigdy średnia) |
| wygładzanie | EMA, τ = 3 s |
| slew rate | **8 centów/s** |
| clamp | \|O\| ≤ 60 centów (po odjęciu transpozycji) |
| wejście | tylko nuty: `voicedProb > 0,7`, długość > 180 ms, tylko część podtrzymana, \|dev − O_bieżące\| < 70 centów |
| **ZAMROŻENIE** | jeśli **MAD(dev w oknie) > 40 centów** → nie aktualizuj O. Śpiewak jest chaotyczny, nie ma czego śledzić |
| kara | a cappella: dopiero powyżej \|O_mediana\| = 25 centów; przy stałym podkładzie: powyżej 12 centów |

Realny dryf chóru a cappella to jednostki–dziesiątki centów na minutę, więc 8 centów/s to ~60× szybciej niż zjawisko, które śledzisz — ta rezerwa istnieje wyłącznie na złapanie offsetu startowego. **Każde przyspieszenie adaptacji (τ < 2 s, slew > 15 centów/s, brak zamrożenia) zaczyna maskować prawdziwy fałsz: referencja „auto-tune'uje się" pod śpiewaka.** To najczęstszy błąd tej klasy systemów i jedyne zabezpieczenie to twarde limity + zamrożenie. Test regresyjny z punktu 6 (per-nutowy szum N(0, 40 centów) MUSI dostać niski wynik względny) jest jedynym, który to łapie.

W a cappella odejmij nie tylko stały offset, ale **wolno zmienne centrum**: dopasuj kroczącą medianę dev o oknie 8–15 s i odejmij ją.

**C. Temperacja.** Śpiewacy a cappella systematycznie odchylają się od temperacji równej w stronę interwałów naturalnych, i to jest **muzycznie poprawne**. Karanie za to dyskwalifikuje aplikację w oczach wyszkolonego śpiewaka w pierwszej minucie. Jednocześnie przy stałym podkładzie w ET to samo odchylenie daje słyszalne dudnienie.

Tabela odchyleń 5-limit JI względem ET (centy) i wynikająca strefa martwa `d0 = 12 + |JI_adj|`:

| stopień | interwał | JI (centy) | Δ vs ET | **d0 a cappella** |
|---|---|---|---|---|
| 0 | 1/1 | 0,00 | 0,0 | **12** |
| 1 | 16/15 m2 | 111,73 | +11,7 | **24** |
| 2 | 9/8 M2 | 203,91 | +3,9 | **16** |
| 3 | 6/5 m3 | 315,64 | +15,6 | **28** |
| 4 | 5/4 M3 | 386,31 | **−13,7** | **26** |
| 5 | 4/3 P4 | 498,04 | −2,0 | **14** |
| 6 | 45/32 TT | 590,22 | −9,8 | **22** |
| 7 | 3/2 P5 | 701,96 | +2,0 | **14** |
| 8 | 8/5 m6 | 813,69 | +13,7 | **26** |
| 9 | 5/3 M6 | 884,36 | **−15,6** | **28** |
| 10 | 16/9 m7 | 996,09 | −3,9 | **16** |
| 11 | 15/8 M7 | 1088,27 | −11,7 | **24** |

Warianty: 10/9 M2 = 182,40 (−17,6); 9/5 m7 = 1017,60 (+17,6); 7/4 harm. m7 = 968,83 (−31,2). Pitagorejskie (melodyczne, „expressive sharp"): 81/64 M3 = 407,82 (+7,8); 32/27 m3 = 294,13 (−5,9); 27/16 M6 = 905,87 (+5,9).

**Przy stałym podkładzie w ET: d0 = 15 centów niezależnie od stopnia.** Pokazuj w UI, że na tym dźwięku dopuszczono szersze pasmo — to buduje zaufanie zamiast wyglądać na błąd.

**Globalny odnośnik strojenia:** A4 konfigurowalne 415–445 Hz (nagrania przy A=442 nie są rzadkie).

---

## 3. Wybór algorytmu F0 i ścieżka ewolucji

### Decyzja: pYIN jako baseline, nie YIN i nie MPM

Na tych samych 30 godzinach syntezowanego śpiewu (RWC) pYIN podnosi medianę F z 0,858–0,917 do **0,976–0,981** i sprowadza octave error rate do **0,5–1,7%**. Autorzy explicite pokazują (Fig. 4), że naprawia błędy oktawowe na breathy głosie żeńskim — dokładnie ten tryb awarii, który boli tutaj.

| algorytm | mediana F (30 h śpiewu) | octave error | RPA@50c / @25c / @10c (MDB-stem-synth) |
|---|---|---|---|
| YIN (prog .10 / .15 / .20) | 0,917 / 0,891 / 0,858 | — | nie testowany |
| **pYIN** (prog .10 / .15 / .20) | **0,981 / 0,981 / 0,976** | **0,5% / 0,9% / 1,7%** | 0,919 / 0,890 / 0,826 |
| SWIPE' | — | — | 0,925 / 0,897 / 0,816 |
| CREPE | — | — | 0,967 / 0,953 / 0,909 |

Voicing pYIN: recall 92,5/94,1/95,0%, specificity 91,9/90,6/88,9%. Full candidate set recall 0,993 (orig), 0,990 (sound) — vs YIN.10 odpowiednio 0,988/0,886.

**Sufit metod klasycznych jest realny i trzeba go zaakceptować świadomie:** pYIN ma RPA tylko 0,826 przy tolerancji 10 centów. Jeśli produkt obiecuje ocenę intonacji dokładniejszą niż 10 centów, klasyczny tracker jej nie dostarczy na trudnym materiale. **Projektuj granice tolerancji w UI na 20–25 centów, nie na 5.** To jest zgodne z percepcją: eksperci oceniają interwały odchylone o **20–25 centów** jako w stroju (Vurma & Ross 2006), a nietrenowani słuchacze wykrywają rozstrojenie dopiero około **65 centów** (wysoko trenowani ~43).

**Degradacja „live recording" zabija wszystko:** w tabeli pracy pYIN nawet pełny zbiór kandydatów spada na tym presecie do recall 0,750, a YIN do 0,632–0,648. Mikrofon telefonu w pokoju z pogłosem to inny problem niż mikrofon blisko ust. Bez pre-processingu (HP 65 Hz, LP 3 kHz na ścieżce pitchu, bramka energii z kalibracją) benchmarki laboratoryjne nie przenoszą się na użytkownika.

### Ścieżka ewolucji

| etap | co | kiedy | uzasadnienie |
|---|---|---|---|
| **E0** | Deterministyczna akwizycja + FFT zamiast naiwnego DFT + usunięcie trucizny + mediana/octave-snap | **teraz**, w TypeScript | Najtańszy skok jakości. Punkty 1.1–1.5 diagnozy naprawiane bez nowego algorytmu |
| **E1** | pYIN stage 1 (100 progów, Beta 2,18) + dowody widmowe (SHR, harmoniczne) + pełny Viterbi w ścieżce oceny | po E0, w TypeScript | 0,5–1,7% octave error. Koszt obliczeniowy: stage 1 to ~102k op nad już policzonym d' — autorzy nazywają to „minimal computational overhead" |
| **E2** | Kernel (realFFT + YIN + Viterbi, ~1–1,5k LOC) w Rust → WASM (web) + staticlib (iOS) + cdylib (Android) | wraz z portem natywnym | Warunek jednego brzmienia na 3 platformach, **nie** warunek jakości |
| **E3** *(opcjonalne)* | Model neuronowy jako tryb „Pro"/offline | **tylko jeśli harness pokaże, że pYIN nie wystarcza na Twoich nagraniach** | Patrz zastrzeżenia niżej |

**Zastrzeżenia do E3.** Krajobraz neuronowy zmienił się w 2025, ale żadna z opcji nie jest oczywista:

- **SwiftF0** (arXiv 2508.18440): 95 842 parametry, ONNX **~0,38 MB**, ~42× szybszy niż CREPE na CPU, 91,80% harmonic mean przy 10 dB SNR (>12 pp nad CREPE), 16 kHz, hop 256 = 16 ms, zakres 46,875–2093,75 Hz, potwierdzone demo client-side na WASM + ONNX Runtime Web. **Ale:** kod MIT, a licencja samego pliku `.onnx` **nie jest w repo określona** i nie ma listy zbiorów treningowych; 8 commitów, jeden autor; **wszystkie** liczby pochodzą od autora (arXiv + jego własny „Pitch Detection Benchmark") — brak jakiegokolwiek trzecioosobowego benchmarku. Werdykt: **warunkowo, po odpowiedzi autora na maila o licencję wag.**
- **FCNF0++ / penn** (`interactiveaudiolab/penn`): MIT **jawnie obejmuje kod I pretrenowane checkpointy**, 261 commitów, 278 gwiazdek, wbudowane opcjonalne dekodowanie Viterbi, hop 0,01 s, fmin 31 / fmax 1984 Hz. **Ale:** brak ścieżki web (README nie wspomina ONNX ani mobile); trenowany na MDB-stem-synth (**CC BY-NC**) + PTDB. Werdykt: **najlepszy offline'owy oracle do generowania referencji dla zbioru testowego**, nie kandydat do produktu.
- **CREPE**: kod MIT, ale wagi `full.pth` = **89,0 MB** (nie 22 MB — to liczba parametrów 22,2 mln), `tiny.pth` = 1,96 MB; paczka PyPI ostatnie wydanie 2024-08-19. Werdykt: **skreślić dla produktu**, ewentualnie jako punkt odniesienia.
- **PESTO**: kod LGPL-3.0. Realne blokery to nie licencja kodu (uruchomienie offline do eksportu ONNX nie jest dystrybucją LGPL), a: (a) licencja **wag nieokreślona**, (b) front-end CQT przez nnAudio do przepisania w JS/C++, (c) brak jakiejkolwiek ścieżki web/mobile. Werdykt: **pominąć.**

**Krytyczny koszt ukryty:** binarka WASM ONNX Runtime Web to **kilka MB**, przy modelu SwiftF0 0,38 MB — czyli runtime waży rzędy wielkości więcej niż model. Przy 95 842 parametrach ręczne przepisanie inferencji (kilka warstw conv1d + softmax) w ~300 liniach na `Float32Array` jest realne i eliminuje runtime ML całkowicie. To najlżejsza możliwa opcja i najbardziej przenośna na natywne.

### Biblioteki i licencje — twarda reguła

**Do produktu wchodzą tylko MIT / BSD / Apache-2.0 / ISC / 0BSD / public domain, NA KODZIE I NA WAGACH.** Uzasadnienie: GPL-3 jest w praktyce niekompatybilny z warunkami App Store (klauzula anti-DRM / restrykcje redystrybucji), AGPL uruchamia obowiązek udostępnienia źródeł przy serwowaniu przez sieć — czym `sing.arvind.digital` właśnie jest.

| biblioteka | licencja (**zweryfikowana**) | stan | werdykt |
|---|---|---|---|
| **fft.js** | MIT, 21,9 KB unpacked | | ✅ **natychmiastowa zamiana naiwnego DFT** |
| **sevagh/pitch-detection** | **MIT** — jedyna permisywna implementacja pYIN (`src/hmm.cpp`), 228 testów | release v2023.12, push 2025-01-07, 653⭐ | ✅ **wzorzec implementacyjny / źródło portu do Rust** |
| **rustfft** / **realfft** | MIT OR Apache-2.0 | 6.4.1 (2025-09-18, 23,1 M pobrań) / 3.5.0 (2025-06-12, 13,8 M) | ✅ dla etapu E2 |
| **pitchy** | **0BSD** (najbardziej permisywna) | v4.1.0 (2024-01-04), 133⭐ | ✅ lekki drugi tracker do cross-checku |
| **penn** (FCNF0++) | **MIT na kodzie I checkpointach** | 261 commitów, 278⭐ | ✅ **oracle offline w harnessie** |
| **Basic Pitch** (Spotify) | **Apache-2.0 na kodzie I wagach**, oficjalny port TS/TF.js | | ✅ **do gry akordowej** (monofoniczny detektor jest tam po prostu złym narzędziem) i jako oracle segmentacji nut |
| **librosa** | ISC | 0.11.0 (2025-03-11) | ✅ **tylko dev/CI** — referencja `librosa.pyin` do golden testów |
| **mir_eval** | MIT | | ✅ tylko dev — metryki |
| **WORLD** (mmorise) | **BSD 3-clause** (potwierdzone z LICENSE.txt) | push 2025-02-21 | ✅ opcja offline (DIO/Harvest + CheapTrick + D4C) |
| **SwiftF0** | kod MIT; **wagi: NIEOKREŚLONE** | 8 commitów, 1 autor, v0.1.2 (2025-07-24) | ⚠️ warunkowo |
| **praat-parselmouth** | GPL-3 | 2025-11-27 | ⚠️ **tylko narzędzie dev** (oracle w harnessie), nigdy w produkcie |
| **pitchfinder** (npm) | **„GNU v3" = GPL-3.0** | v2.3.4 (2025-12-16), 504⭐ | ❌ **NAJBARDZIEJ PRAWDOPODOBNA MINA** — to biblioteka, po którą sięga się „na szybko" |
| **aubio** / **aubio-rs** | GPL-3.0 | repo push 2026-04, ale ostatni **tag 0.4.9 z 2019-02-27** | ❌ |
| **essentia.js** | **AGPL-3.0** | repo push 2025-12, ale **npm stoi na 0.1.3 z 2021-06-24** | ❌ |
| **TarsosDSP** | GPL-3.0, Android/JVM only | push 2026-06-18, 2184⭐ | ❌ jako zależność; ✅ jako referencja implementacyjna |
| **AudioKit PitchTap** | MIT, ALE to **nie YIN** — Csound `ptrack` (Lazzarini/Puckette), `BINPEROCT 48` = **25 centów** rozdzielczości, upstream Soundpipe **ARCHIVED** | AudioKit żywy (11,4k⭐) | ❌ **do pitchu**; ✅ do I/O audio na iOS |
| **alesgenova/pitch-detection** | MIT/Apache-2.0 | **MARTWY**: v0.3.0 (2022-06), push 2023-01 | ❌ |

**Zbiory danych — osobna warstwa ryzyka:**

| zbiór | licencja | użycie |
|---|---|---|
| **vocadito** (Zenodo 5578807) | **CC BY 4.0** | ✅ w repo, solowe wokale z anotacją F0/nut/tekstu |
| **Dagstuhl ChoirSet** (Zenodo 4618287) | **CC BY 4.0** | ✅ w repo — zawiera ścieżki z mikrofonu krtaniowego = near-ground-truth F0 dla śpiewu |
| **Annotated-VocalSet** (Zenodo 7061507) | **CC BY 4.0** | ✅ w repo |
| **MDB-stem-synth** (Zenodo 1481172) | **CC BY-NC 4.0** — non-commercial | ❌ w repo; ✅ prywatny sanity-check lokalnie |
| **MIR-1K** (mirror Zenodo 3532216) | **license: null** — brak licencji = brak zgody | ❌ |
| **PTDB-TUG** | nieustalona | ⚠️ traktować jako niedostępny do potwierdzenia |

---

## 4. Definicja „fałszowania" — algorytm oceny

### 4.1. Cztery zasady, na których stoi cała ocena

**Zasada 1: ocena wyłącznie per NUTA, nigdy per ramka.** „Procent ramek w stroju" mierzy przede wszystkim rozkład długości nut — długie nuty dominują statystykę, krótkie znikają. Dodatkowo ramki nie są niezależne (autokorelacja konturu), więc żadna średnia ani odchylenie liczone po ramkach nie ma interpretacji statystycznej. Agregacja z **równą wagą na nutę** (opcjonalnie √czas trwania), nigdy na ramkę. To zastępuje `hooks/use-training-mode.ts:196-206`.

**Zasada 2: rozłóż błąd na dwie składowe i pokaż DWIE liczby.**

```
e_i = O(t_i) + r_i
      ↑          ↑
      offset     residuum = PRAWDZIWY FAŁSZ
      tonacji
      (transpozycja + dryf)
```

To jest różnica między „śpiewa czysto, ale cały czas 30 centów niżej" i „śpiewa chaotycznie". Bez tego rozkładu system produkuje ten sam niski wynik dla obu, co jest merytorycznie fałszywe i pedagogicznie bezużyteczne — pierwszy przypadek wymaga rady „zacznij od dostrojenia / rozgrzej się", drugi „pracuj nad podparciem oddechowym".

**Zasada 3: interwały ważą więcej niż odchylenie absolutne.** Larrouy-Maestri & Morsomme (2014, 22 ekspertów × 14 wykonań) wykazali, że miary **interwałowe** korelują z sądem ekspertów lepiej niż odchylenie absolutne od wzorca nutowego — bo człowiek słyszy relatywnie. Śpiewak, który zaśpiewał całą piosenkę idealnie, ale 30 centów niżej, brzmi dobrze; śpiewak skaczący losowo ±40 centów wokół zera brzmi źle. Obecna metryka ocenia je odwrotnie. Zawodowcy dryfują średnio ~30 centów w trakcie wykonania.

**Zasada 4: ciągła funkcja oceny, nie kubełki.** Trzy sztywne progi (10/25/off) tworzą nieciągłości widoczne dla użytkownika jako migotanie: 24,9 centa to „good", 25,1 to „off". Zamiast tego: martwa strefa + gładka funkcja gaussowska + histereza **tylko na stanach dyskretnych** (wskaźnik, kolor, dźwięk), nigdy na pozycji rysowanej linii.

### 4.2. Tolerancja adaptacyjna

```
tol = clamp( tol_base · f_dur · f_reg · f_ctx · f_lvl , 20 , 70 )   [centy]

tol_base = 25
f_dur = clamp(1 + (200 − min(dur_ms, 200)) / 200, 1, 2)
        → nuta 100 ms: 1,5×;  nuta ≤ 100 ms: NIE OCENIANA WCALE
f_reg = 1 + max(0, 130 − f0_hz)/130 · 0,8         → poniżej C3 (~130 Hz) do 1,8×
        × 1,25 gdy f0 > 800 Hz                     → rzadkie harmoniczne, ryzyko błędów oktawowych
f_ctx = 0,7 z jednoczesnym akompaniamentem harmonicznym   (dudnienia i szorstkość obniżają próg)
        1,0 z dronem / backingiem
        1,3 a cappella
f_lvl = 1,3 gdy SNR < 20 dB  (+ flaga low-confidence w UI)
```

Uzasadnienie `f_reg`: różnica dostrzegalna (DL) w centach **rośnie** poniżej ~200 Hz (przy 100 Hz DL rzędu 1 Hz to już ~17 centów), a jednocześnie estymacja F0 wymaga tam dłuższych okien, czyli traci rozdzielczość czasową. Ten sam prog dla basu i sopranu jest niesprawiedliwy w obie strony.

**Ostrzeżenie o `f_ctx = 0,7`:** ta wartość jest **oszacowaniem opartym na rozumowaniu o dudnieniach**, nie na zmierzonym progu percepcyjnym dla interwałów jednoczesnych. Do skalibrowania na własnych danych — patrz otwarte pytania.

### 4.3. Główna funkcja oceny

```ts
const JI_ADJUST_CENTS = [0, 11.7, 3.9, 15.6, -13.7, -2.0, -9.8, 2.0, 13.7, -15.6, -3.9, -11.7];
const SCORE_VERSION = 2;

function scoreTake(input: ScoreInput): TakeScore {
  const { notes, target, ctx, cfg } = input;

  // ── 1. Wyrównanie do wzorca (Needleman-Wunsch na NUTACH, nie na ramkach) ──
  //    daje bezpośrednio "pominięte" i "dodane" nuty, czego DTW ramkowy nie umie
  const pairs = target
    ? alignNotes(notes, target, cfg.align)   // affine gap: open 2.0, extend 1.0
    : notes.map(n => ({ sung: n, ref: null }));

  // ── 2. Surowe odchylenia w centach, w przestrzeni chroma ─────────────────
  //    Oktawa jest ZAWSZE wybaczona: różnice sprowadzamy do (-600, +600]
  type Raw = { idx: number; dev: number; wSec: number } | null;
  const raw: Raw[] = pairs.map(p => {
    if (!p.ref) return null;                                 // wstawka
    if (p.sung.steadyMs < cfg.minSteadyMs) return null;       // UNMEASURABLE
    let d = p.sung.centerCents - p.ref.centerCents;
    if (cfg.octaveInvariant) d = wrapToChroma(d);             // mod 1200 → (-600, 600]
    return { idx: p.sung.index, dev: d, wSec: p.sung.steadyMs / 1000 };
  });

  // ── 3. Transpozycja: moda kołowa, ZAMROŻONA po 4-6 nutach ────────────────
  const Tr = ctx.lockedTransposeCents ?? estimateTransposeCents(raw, cfg.reference);
  const k  = Math.round(Tr / 100);      // półtony
  const O0 = Tr - 100 * k;              // |O0| < 50 z konstrukcji

  // ── 4. Offset tonacji O(t): mediana 6 nut → EMA(τ=3 s) → slew 8 c/s ──────
  //    ZAMROŻENIE gdy MAD(dev w oknie) > 40 c — śpiewak chaotyczny, nie ma czego śledzić
  const O = estimateTuningOffset(raw, { ...cfg.reference, seed: O0 });

  // ── 5. Residuum = PRAWDZIWY fałsz ────────────────────────────────────────
  type Res = { dev: number; w: number; degree: number; f0: number; durMs: number; idx: number };
  const res: Res[] = [];
  for (let j = 0; j < raw.length; j++) {
    const r0 = raw[j];
    if (!r0) continue;
    res.push({
      idx: r0.idx,
      dev: r0.dev - 100 * k - O[j],
      w: cfg.weightBySqrtDuration ? Math.sqrt(r0.wSec) : 1,
      degree: pairs[j].ref!.scaleDegree,          // 0..11
      f0: pairs[j].sung.centerHz,
      durMs: pairs[j].sung.steadyMs,
    });
  }

  // ── 6. Cztery metryki raportowane OSOBNO (nie wchodzą do jednej liczby) ──
  const devs           = res.map(r => r.dev);
  const offsetCents    = median(devs);
  const scatterCents   = 1.4826 * mad(devs, offsetCents);      // odporny odpowiednik SD
  const driftCentsMin  = slopePerMinute(res, notes);
  const intervalErr    = median(intervalErrors(pairs));         // |zaśpiewany − docelowy|

  // ── 7. Per nuta: martwa strefa + tolerancja + ciągła ocena ───────────────
  let pSum = 0, pW = 0;
  const perNote: NoteScore[] = [];
  for (const r of res) {
    const d0 = ctx.acappella
      ? 12 + Math.abs(JI_ADJUST_CENTS[r.degree])   // 12..28 centów
      : 15;                                        // stały podkład w ET

    const tol = clamp(
      cfg.tolBaseCents
        * clamp(1 + (200 - Math.min(r.durMs, 200)) / 200, 1, 2)
        * (1 + Math.max(0, 130 - r.f0) / 130 * 0.8) * (r.f0 > 800 ? 1.25 : 1)
        * ctx.contextFactor
        * (ctx.snrDb < 20 ? 1.3 : 1.0),
      cfg.tolMinCents, cfg.tolMaxCents             // 20 .. 70
    );

    const a = Math.abs(r.dev);

    // ZŁA NUTA — nie fałsz, tylko pomyłka. Wyłącz ze statystyk intonacyjnych.
    if (a > (ctx.stepwiseMotion ? 150 : 250)) {
      perNote.push({ idx: r.idx, devCents: r.dev, tolCents: tol, deadZoneCents: d0,
                     score: 0, verdict: 'wrong-note' });
      continue;
    }

    const e = Math.max(0, a - d0) / tol;
    const s = Math.exp(-0.5 * e * e);      // 1,00 w strefie martwej; 0,61 przy e=1; 0,13 przy e=2
    perNote.push({
      idx: r.idx, devCents: r.dev, tolCents: tol, deadZoneCents: d0, score: s,
      verdict: e <= 1 ? 'in-tune' : e <= 2 ? (r.dev > 0 ? 'slightly-sharp' : 'slightly-flat')
                                           : (r.dev > 0 ? 'sharp' : 'flat'),
    });
    pSum += s * r.w; pW += r.w;
  }

  // ── 8. Komponenty ────────────────────────────────────────────────────────
  const FLOOR = 0.15;   // podłoga: bez niej geometryczna średnia jest brutalna dla początkującego
  const P  = Math.max(FLOOR, pW > 0 ? pSum / pW : 0);            // intonacja
  const C  = Math.max(FLOOR, completeness(pairs));               // matched / (ref + 0.5·insert)
  const S  = Math.max(FLOOR, stabilityScore(res, notes));        // po odjęciu vibrata
  const Tm = ctx.latencyCalibrated                               // timing
             ? Math.max(FLOOR, timingScore(pairs, ctx.inputLatencyMs))
             : null;                                             // brak kalibracji → WYŁĄCZ
  const K  = ctx.hasFixedBacking                                 // strojenie
             ? Math.max(FLOOR, Math.exp(-0.5 * Math.pow(Math.max(0, Math.abs(offsetCents) - 15) / 30, 2)))
             : null;

  // ── 9. Jedna liczba: średnia GEOMETRYCZNA (arytmetyczna ukrywa zepsuty komponent) ──
  const rawScore = geoMean([
    [P,  0.45], [C, 0.25], [S, 0.15],
    ...(Tm !== null ? [[Tm, 0.15] as const] : []),
    ...(K  !== null ? [[K,  0.12] as const] : []),
  ]);   // wagi renormalizowane do sumy 1 gdy komponent wyłączony

  return {
    score: Math.round(100 * calibrate(rawScore)),   // kotwice: 0.30→30, 0.50→50, 0.70→70, 0.85→88, 0.95→98
    components: { P, C, S, timing: Tm, tuning: K },
    offsetCents, scatterCents, driftCentsPerMin: driftCentsMin, intervalErrCents: intervalErr,
    perNote,
    unmeasurableCount: raw.filter(r => r === null).length,
    transposeSemitones: k,
    engineVersion: cfg.version, scoreVersion: SCORE_VERSION,
  };
}
```

### 4.4. Obsługa przypadków szczególnych — tabela decyzji

| przypadek | obsługa | gdzie w pipeline |
|---|---|---|
| **atak nuty / scoop** | pominięty adaptacyjnie 40–150 ms (kryterium stabilizacji), mierzony **osobno** jako `attack_accuracy` (czas do wejścia w pas 50 centów, cel < 80 ms) + kierunek | [6] segmentacja |
| **vibrato** | wykryte (4–9 Hz, moc piku ≥ 6 dB nad tłem); środek nuty = średnia krocząca o 1 okresie vibrata **w centach**; zasięg raportowany osobno. **Nie rozszerza tolerancji intonacyjnej** | [7] |
| **portamento / legato glide** | klasyfikowane jako TRANSITION (>80 centów, >500 centów/s, 50–250 ms) i wykluczane z obu sąsiednich nut; glide > 250 ms → osobna metryka | [6] |
| **dryf tonacji** | wchłonięty przez O(t) z limitem 8 centów/s i zamrożeniem przy MAD > 40 centów; raportowany jako osobna liczba (centy/min); kara dopiero > 25 centów a cappella / > 12 centów z podkładem | [8] |
| **śpiew w innej oktawie** | akceptowany **bezwarunkowo** (praca w chroma, `k mod 12 == 0`), raportowany informacyjnie | [8] |
| **transpozycja nie-oktawowa** | akceptowana a cappella; przy podkładzie tylko ostrzeżenie („jesteś całe 2 półtony pod podkładem") | [8] |
| **zła nuta** (\|dev\| > 250 centów, lub > 150 przy ruchu sekundowym) | `verdict: 'wrong-note'`, wyłączona ze statystyk intonacyjnych, liczona jako błąd nutowy | 4.3 krok 7 |
| **nuta ≤ 100 ms** | nie oceniana wcale (UNMEASURABLE) | 4.3 krok 2 |
| **> 30% nut niemierzalnych** | komunikat „popraw mikrofon/pomieszczenie", **nie** „twój wynik: 43%" | UI |
| **prior zadaniowy** („teraz ma być C4") | wolno użyć **wyłącznie** w warstwie wyświetlania, **nigdy** w liczbie centów. Przeciek do metryki daje pochlebny i bezwartościowy feedback | granica API |
| **temperacja naturalna** | strefa martwa d0 = 12 + \|JI_adj(stopień)\| a cappella (12–28 centów); d0 = 15 stały przy podkładzie ET | 4.3 krok 7 |
| **prior zakresu głosu użytkownika** | **USUNIĘTY z estymatora.** W aplikacji do treningu prior na znany zakres systematycznie ukrywa rozszerzanie zakresu, falset i przejścia rejestrów — czyni ewaluację cyrkularną. Może zostać wyłącznie jako **ostrzeżenie w warstwie prezentacji** | [3] |

### 4.5. Histereza — tylko dla stanów dyskretnych

```
wejście w stan "czysto":  |błąd| ≤ 15 centów
wyjście ze stanu:         |błąd| > 25 centów        (pasmo histerezy 10 centów)
dwell przed zmianą stanu: 100 ms
histereza tożsamości nuty docelowej: 60 ms powyżej granicy przed przepisaniem
odczyt liczbowy: throttle 10 Hz, rozdzielczość 1 cent, strefa martwa wyświetlania 3 centy
```

**Nigdy nie nakładaj strefy martwej na POZYCJĘ rysowanej linii** — użytkownik widziałby, że jest idealnie, gdy nie jest, i nie uczyłby się mikro-korekt.

### 4.6. Walidacja rozkładu wyników

Formuła jest niesprawdzona dopóki nie zobaczysz rozkładu na realnych danych. **Kryterium akceptacji: dla zbioru „uczciwych prób" mediana wyniku 65–75, IQR ~20 punktów.**

- Mediana > 85 → zwęź `tol_base` i/lub `d0` (antywzorzec „wszyscy dostają 90%+").
- Mediana < 50 → poluzuj (antywzorzec „zawsze 40%").

Progi orientacyjne metryk raportowanych osobno:

| metryka | bardzo dobrze | dobrze | do pracy | problem |
|---|---|---|---|---|
| `scatterCents` | < 20 | 20–35 | 35–55 | > 55 |
| `intervalErrCents` | < 25 | 25–40 | 40–50 | > 50 (słyszalne nawet dla nietrenowanego ucha) |
| `\|driftCentsPerMin\|` | < 15 | 15–40 | — | > 40 → flaga „gubisz centrum tonalne" |
| `\|offsetCents\|` | — | — | — | > 25 a cappella / > 12 z podkładem → „dostrój się" |

**Wersjonowanie jest niezbywalne.** Zmiana formuły między wydaniami czyni wykres postępu kłamstwem. Zapisuj `scoreVersion` + `engineVersion` + hash parametrów z **każdym** wynikiem i trzymaj surowe kontury F0 — wtedy przy zmianie formuły przeliczasz historię offline zamiast pokazywać przełam na wykresie.

---

## 5. Kontrakt API rdzenia

Projekt granicy: **wszystko jest POD (plain old data) albo `Float32Array`/`Int32Array`.** Zero typów z DOM, zero `AudioContext`, zero `AnalyserNode`, zero `Promise` na ścieżce gorącej, zero domknięć przekazywanych przez granicę. Każdy typ poniżej ma bezpośrednie odwzorowanie: `number` → `f32`/`f64`/`Float`/`Double`, `Float32Array` → `&[f32]`/`UnsafePointer<Float>`/`FloatArray`, `interface` → `struct`/`data class`, `enum` (string) → `enum` z `u8` reprezentacją.

### 5.1. Typy podstawowe i konfiguracja

```ts
// Jednostki jako aliasy — dokumentują intencję, znikają w kompilacji.
type Hz = number;          type Cents = number;
type Millis = number;      type Dbfs = number;
type Samples = number;     type Prob01 = number;

export interface CaptureConfig {
  sampleRate: Hz;                 // 48000; rdzeń resampluje jeśli wejście inne
  channels: 1;
}

export interface FramingConfig {
  frameSamples: Samples;          // 3072  (64 ms @ 48 kHz)
  integrationWindow: Samples;     // 2048  (42,67 ms) — stałe dla wszystkich tau
  hopSamples: Samples;            // 512 live / 256 offline
  // NIEZMIENNIK: frameSamples >= integrationWindow + tauMax
}

export interface PreprocessConfig {
  dcBlockHz: Hz;                  // 5
  highpassHz: Hz;                 // 65,  Butterworth 4. rzędu
  pitchLowpassHz: Hz;             // 3000, Butterworth 2. rzędu — TYLKO kopia do detektora
}

export interface F0Config {
  fMinHz: Hz;                     // 46.875  (tauMax = 1024)
  fMaxHz: Hz;                     // 1200    (tauMin = 40)
  nThresholds: number;            // 100
  betaAlpha: number;              // 2
  betaBeta: number;               // 18   → średnia progu 0,10
  noTroughProb: Prob01;           // 0.01
  maxCandidates: number;          // 12
  candidateCutoff: number;        // 0.60  (d' powyżej → odrzuć kandydata)
  addOctaveCandidates: boolean;   // true — jawnie dołóż 2f i f/2
}

export interface VoicingConfig {
  hnrEnterDb: number;             // 7
  hnrExitDb: number;              // 4
  flatnessTonalMax: number;       // 0.10
  flatnessNoiseMin: number;       // 0.40
  lfEnergyRatioMin: number;       // 0.60
  minVoicedRunMs: Millis;         // 50
  minUnvoicedRunMs: Millis;       // 30
  hangoverMs: Millis;             // 40
}

export interface LevelCalibration {
  noiseFloorDbfs: Dbfs;           // N z 2 s ciszy (mediana)
  snrDb: number;                  // S(p90 głosu) − N
  voicedEnterDbfs: Dbfs;          // N + max(10, 0.35·SNR)
  voicedExitDbfs: Dbfs;           // voicedEnter − 4
  deviceId: string;               // klucz persystencji
  measuredAtMs: number;
}

export interface DecoderConfig {
  binCents: Cents;                // 10
  gridMinHz: Hz;                  // 55    (A1)
  gridMaxHz: Hz;                  // 1175  (D6) → 531 binów
  sigmaNarrowCents: Cents;        // 40
  sigmaWideCents: Cents;          // 250
  wideMix: Prob01;                // 0.10
  maxJumpCents: Cents;            // 500 na ramkę @ hop 10,67 ms
  transitionMinProb: number;      // 1e-4
  switchProb: Prob01;             // 0.01  (voiced <-> unvoiced)
  octaveCostPerOctave: number;    // 0.01  — bias asymetryczny (Praat OctaveCost)
  subBinInterpolation: true;      // OBOWIĄZKOWE
}

export interface SegmentationConfig {
  stayBandCents: Cents;           // 60
  newNoteBandCents: Cents;        // 100
  newNoteHoldMs: Millis;          // 60
  minNoteMs: Millis;              // 100
  attackSkipMinMs: Millis;        // 40
  attackSkipMaxMs: Millis;        // 150
  attackSkipMaxFraction: number;  // 0.30
  releaseSkipMs: Millis;          // 40
  minSteadyMs: Millis;            // 50
  rearticulationDropDb: number;   // 8
  transitionMinCents: Cents;      // 80
  transitionMinSlopeCentsPerSec: number;  // 500
}

export interface VibratoConfig {
  minNoteMsForDetection: Millis;  // 500
  detrendWindowMs: Millis;        // 250
  rateMinHz: Hz;                  // 4.0
  rateMaxHz: Hz;                  // 9.0
  peakPowerRatio: number;         // 4.0  (6 dB)
  autocorrMin: number;            // 0.50
  compensateWindowSinc: boolean;  // true
}

export interface ReferenceConfig {
  transposeLockAfterNotes: number;   // 5
  transposeLockAfterMs: Millis;      // 2500
  transposeMadMaxCents: Cents;       // 60
  offsetWindowNotes: number;         // 6
  offsetEmaTauMs: Millis;            // 3000
  offsetSlewCentsPerSec: number;     // 8
  offsetClampCents: Cents;           // 60
  offsetFreezeMadCents: Cents;       // 40
  offsetOutlierCents: Cents;         // 70
  a4Hz: Hz;                          // 440 (konfigurowalne 415..445)
}

export interface ScoringConfig {
  tolBaseCents: Cents;            // 25
  tolMinCents: Cents;             // 20
  tolMaxCents: Cents;             // 70
  minSteadyMs: Millis;            // 50
  wrongNoteCents: Cents;          // 250 (150 przy ruchu sekundowym)
  octaveInvariant: boolean;       // true
  weightBySqrtDuration: boolean;  // true
  componentFloor: number;         // 0.15
  version: number;
}

export interface EngineConfig {
  capture: CaptureConfig;   framing: FramingConfig;   preprocess: PreprocessConfig;
  f0: F0Config;             voicing: VoicingConfig;   decoder: DecoderConfig;
  segmentation: SegmentationConfig;  vibrato: VibratoConfig;
  reference: ReferenceConfig;        scoring: ScoringConfig;
  calibration: LevelCalibration | null;
  version: string;                   // semver rdzenia, zapisywane z każdym wynikiem
}
```

### 5.2. Ramka wyjściowa i format FFI

```ts
export const enum FrameFlag {
  Voiced        = 1 << 0,
  Clipping      = 1 << 1,
  BelowGate     = 1 << 2,
  OctaveSnapped = 1 << 3,   // ścieżka live poprawiła oktawę
  Interpolated  = 1 << 4,   // sub-binowa interpolacja zastosowana
}

export interface F0Frame {
  tSamples: Samples;    // pozycja W STRUMIENIU, nie Date.now()
  tMs: Millis;          // tSamples / sampleRate * 1000
  f0Hz: Hz;             // 0 gdy unvoiced
  cents: Cents;         // 1200·log2(f0/55); NaN gdy unvoiced
  periodicity: number;  // 1 − d'(tau*). NIE JEST PRAWDOPODOBIEŃSTWEM.
                        // Z konstrukcji ∈ [1−candidateCutoff, 1]. ZAKAZ progowania w UI.
  voicedProb: Prob01;   // skalibrowana fuzja 5 cech — TYLKO tego wolno używać jako filtru
  rmsDbfs: Dbfs;
  hnrDb: number;
  flags: number;        // bitmaska FrameFlag
}

/** Postać FFI: płaska tablica, stały krok. Ten sam układ w Rust/Swift/Kotlin. */
export const FRAME_STRIDE = 8;   // f32: [tMs, f0Hz, cents, periodicity, voicedProb, rmsDbfs, hnrDb, flags]
```

**Uwaga o znaczniku czasu:** `tSamples` to pozycja w strumieniu, nie `Date.now()`. Obecny kod (`hooks/use-audio-recorder.ts:64`) używa zegara ściennego — na natywnym i tak trzeba przejść na pozycję próbki, a wall-clock uniemożliwia sample-accurate synchronizację z podkładem i sprawia, że wszystkie ramki przetworzone w jednym batchu Reacta dostają identyczny czas.

### 5.3. Nuty, vibrato, wynik

```ts
export interface VibratoMeasurement {
  present: boolean;
  rateHz: Hz;               // 0 gdy !present
  extentCents: Cents;       // po kompensacji sinc; ±, nie peak-to-peak
  regularity: number;       // 0..1
  onsetMs: Millis;          // od początku nuty
}

export interface NoteMeasurement {
  index: number;
  startMs: Millis;  endMs: Millis;
  steadyStartMs: Millis;  steadyEndMs: Millis;  steadyMs: Millis;
  centerCents: Cents;       // środek nuty — mediana lub średnia vibrato-aware, ZAWSZE w centach
  centerHz: Hz;
  madCents: Cents;          // rozrzut w obrębie nuty po odjęciu vibrata
  vibrato: VibratoMeasurement;
  attackMs: Millis;         // czas do wejścia w pas 50 centów
  attackDirection: -1 | 0 | 1;
  peakDbfs: Dbfs;
  kind: 'note' | 'transition' | 'unmeasurable';
  frameStart: number;  frameEnd: number;   // indeksy w tablicy F0Frame
}

export interface TargetNote {
  index: number;
  startMs: Millis; endMs: Millis;
  centerCents: Cents;      // wzgl. tej samej referencji 55 Hz
  midi: number;
  scaleDegree: number;     // 0..11 względem toniki — dla strefy martwej JI
}
export interface TargetMelody { notes: TargetNote[]; keyRootMidi: number; a4Hz: Hz; }

export interface ScoreContext {
  acappella: boolean;
  hasFixedBacking: boolean;
  contextFactor: number;        // 1.3 / 1.0 / 0.7
  snrDb: number;
  stepwiseMotion: boolean;
  latencyCalibrated: boolean;
  inputLatencyMs: Millis;
  lockedTransposeCents: Cents | null;
}

export interface NoteScore {
  idx: number; devCents: Cents; tolCents: Cents; deadZoneCents: Cents;
  score: Prob01;
  verdict: 'in-tune' | 'slightly-sharp' | 'slightly-flat' | 'sharp' | 'flat' | 'wrong-note';
}

export interface TakeScore {
  score: number;                       // 0..100
  components: { P: number; C: number; S: number; timing: number | null; tuning: number | null };
  offsetCents: Cents;                  // systematyczne przesunięcie
  scatterCents: Cents;                 // 1.4826 · MAD — WŁAŚCIWA ocena kontroli głosu
  driftCentsPerMin: number;
  intervalErrCents: Cents;             // najlepiej koreluje z sądem eksperta
  perNote: NoteScore[];
  unmeasurableCount: number;
  transposeSemitones: number;
  engineVersion: string; scoreVersion: number;
}
```

### 5.4. Tracker (stanowy) i API wsadowe

Kontrakt „czysta funkcja `Float32Array → (f0, voicing)`" jest **nie do pogodzenia** z fixed-lag Viterbi, medianą, trackerem szumu i histerezą — te są z definicji stanowe. Poprawny kształt to fabryka z jawnym stanem plus czysta funkcja wsadowa.

```ts
/** Tracker strumieniowy. Instancja = jawny stan. ŻADNYCH globali modułowych. */
export interface F0Tracker {
  /** Wołane z Workera dla chunku z AudioWorkletu. Bez alokacji po konstrukcji. */
  push(pcm: Float32Array, frameCount: number): void;

  /** Zapisuje gotowe ramki do `out` (krok FRAME_STRIDE). Zwraca liczbę ramek. */
  drain(out: Float32Array, maxFrames: number): number;

  reset(): void;                    // zeruje CAŁY stan temporalny
  latencySamples(): Samples;        // opóźnienie środka ramki
  snapshot(): Int32Array;           // do debugowania / testów determinizmu
  dispose(): void;
}

export interface AnalysisResult {
  frames: F0Frame[];
  sampleRate: Hz;
  droppedChunks: number;            // XRUN z warstwy capture
}

export interface DecodedTrack {
  frames: F0Frame[];                // po Viterbi + interpolacji sub-binowej
  logLikelihood: number;
}

/** Wszystko poniżej jest CZYSTE i deterministyczne — testowalne w Node bez audio. */
export interface AnalysisEngine {
  createTracker(cfg: EngineConfig): F0Tracker;

  /** Wsadowo, faster-than-realtime. Do harnessu, oceny take'u i ponownej analizy. */
  analyzeBuffer(pcm: Float32Array, cfg: EngineConfig): AnalysisResult;

  /** Pełny Viterbi po całej sekwencji — ścieżka OCENY, nie live. */
  decodeSequence(frames: F0Frame[], cfg: DecoderConfig): DecodedTrack;

  segmentNotes(track: DecodedTrack, cfg: SegmentationConfig, vib: VibratoConfig): NoteMeasurement[];

  scoreTake(input: {
    notes: NoteMeasurement[];
    target: TargetMelody | null;
    ctx: ScoreContext;
    cfg: ScoringConfig & { align: AlignConfig; reference: ReferenceConfig; version: string };
  }): TakeScore;
}
```

**Niezmiennik kontraktowy, egzekwowany testem:**

```
analyzeBuffer(pcm, cfg).frames
  ===  bit-identyczne  ===
concat( push(pcm[0..n]), push(pcm[n..2n]), ... ) → drain()
```

dla dowolnego podziału na chunki (128 / 512 / 2048 próbek). Bez tego harness mierzy inny algorytm niż ten, który widzi użytkownik.

**Odwzorowanie na natywne (bez zmiany kształtu):**

| TS | Rust | Swift | Kotlin |
|---|---|---|---|
| `F0Tracker` | `struct F0Tracker` + `extern "C"` handle | klasa nad `UnsafeMutableRawPointer` | klasa nad `Long` (JNI) |
| `push(Float32Array, n)` | `f0_push(h, *const f32, u32)` | `UnsafePointer<Float>` | `FloatArray` + `GetPrimitiveArrayCritical` |
| `drain(Float32Array, n) → n` | `f0_drain(h, *mut f32, u32) -> u32` | j.w. | j.w. |
| `EngineConfig` | `#[repr(C)] struct` | `struct` | `data class` + serializacja do POD |
| `F0Frame` | `#[repr(C)] struct` (8×f32) | `struct` | odczyt z `FloatArray` po stride |

**Granica: max ~12 funkcji FFI, wyłącznie typy POD.** Przy tak płaskiej granicy `extern "C"` + `cbindgen` jest tańsze i stabilniejsze niż UniFFI (który zarabia na bogatych typach i którego upstream nie ma targetu WASM — potwierdzone w `mozilla/uniffi-rs`: wbudowane bindingi to Kotlin/Swift/Python/Ruby).

**Zasady, które czynią to przenośnym (i których obecny kod łamie):**
1. Zero stanu modułowego. Cały stan temporalny w instancji. *(łamie: `lib/pitch-detector.ts:42-43`, `lib/pitch-detector-pro.ts:57-58`)*
2. Zero `Date.now()` — tylko `tSamples`. *(łamie: `hooks/use-audio-recorder.ts:64`)*
3. Zero `requestAnimationFrame` w ścieżce analizy. *(łamie: `hooks/use-audio-recorder.ts:78`)*
4. Zero alokacji po konstrukcji trackera. *(łamie: `hooks/use-audio-recorder.ts:39`, `lib/fft-analyzer.ts:14,17`, `lib/pitch-detector.ts:72`)*
5. Zero `console.*` w ścieżce gorącej. *(łamie: `lib/pitch-detector.ts:27-30` — log przy 10% ramek)*
6. Zero `-ffast-math` / `fast-math` — łamie powtarzalność między WASM/ARM/x86.
7. Wszystkie długości okien liczone z `sampleRate`, nigdy z magicznych stałych.

---

## 6. Strategia testowania DSP

Dziś nie istnieje **żaden** test: `find` po repo nie znajduje `*.test.*`, `*.spec.*`, `__tests__`, `vitest.config`, `jest.config`, `playwright.config`; brak katalogu `.github`; `npm run lint` kończy się `sh: eslint: command not found`. Jedynym gate'em jest `tsc --noEmit`.

W DSP błąd nie wywala się wyjątkiem — daje ciche 3% błędów oktawowych, których nikt nie zobaczy, aż użytkownik napisze „aplikacja się myli". **Harness jest warunkiem wstępnym każdej zmiany w tej warstwie**, nie miłym dodatkiem.

### 6.1. Runner i struktura

```
test/
  synth.ts                 # generator sygnałów syntetycznych (ZERO plików binarnych w repo)
  unit/*.test.ts           # czysta matematyka: CMND, interpolacja, konwersje, Viterbi na 3 stanach
  golden/*.test.ts         # fixtures → oczekiwane wyniki z tolerancją
  property/*.test.ts       # niezmienniki (fast-check)
  fixtures/
    real/*.wav             # 12-20 własnych nagrań (Git LFS)
    real/*.f0.csv          # referencja z penn (MIT) + spot-check w Praat
eval/
  run.ts                   # CLI: pełny sweep metryk → tabela + JSON
  baseline.json            # zacommitowany punkt odniesienia
```

- **Runner unit/golden/property:** `vitest` w Node. Warunek: cały DSP musi być importowalny bez przeglądarki — czyli wolny od `AudioContext`, `AnalyserNode`, `wavesurfer`. *To jest ten sam refaktor, który przenosi logikę na natywne: jeśli test nie uruchamia się w Node, kod nie przeniesie się na Swift/Kotlin.*
- **Runner metryk:** `npx tsx eval/run.ts` → tabela + `eval/out.json`, porównywana z `eval/baseline.json`.
- **CI:** GitHub Actions (katalogu `.github` **nie ma — trzeba go utworzyć**). Na każdy PR: `tsc --noEmit` + `vitest run` (host) — cel < 60 s. Nightly: `eval/run.ts` na pełnym zbiorze + target `wasm32` przez `wasmtime`. Po porcie: iOS Simulator i Android Emulator nightly, czytające **te same** WAV-y i **ten sam** CSV.

### 6.2. Sygnały syntetyczne (generowane w kodzie, zero problemów licencyjnych)

| # | sygnał | parametry | asercja |
|---|---|---|---|
| S1 | czysty sinus | 13 częstotliwości E2…C6 (82,41 / 110 / 146,83 / 196 / 220 / 261,63 / 329,63 / 392 / 440 / 523,25 / 659,26 / 880 / 1046,50), 2 s, 20 losowych faz | mediana \|err\| **< 1 cent**, max \|err\| < 3 centy, **octave errors = 0** |
| S2 | **kompleks harmoniczny** (8 harmonicznych, amplitudy 1/n) | te same częstotliwości | mediana \|err\| **< 3 centy**, **octave errors = 0**. **← TEN TEST OBECNY SILNIK OBLEWA**: zmierzone E4→÷2, C5→÷3, A5→÷4 (basic); C4→÷3, E4→÷5 (pro) |
| S3 | **brakująca fundamentalna** (harmoniczne 2…8) | 110, 220, 440 Hz | zwraca F0, nie 2·F0. Tolerancja 5 centów |
| S4 | vibrato | 5/6/7 Hz × ±50/±100/±200 centów, nośne 220 i 440 Hz, 2 s | zmierzony `rate` w ±0,3 Hz; `extent` w ±15% **po kompensacji sinc**; `centerCents` w ±5 centów od średniej geometrycznej |
| S5 | glissando E2→C6 | 2 s (22 st/s), 0,5 s (88 st/s), 0,25 s (176 st/s) | kontur ciągły — brak skoku > 150 centów między kolejnymi ramkami voiced ponad zadane nachylenie; **brak flipu oktawowego** |
| S6 | **skoki interwałowe** | 5, 7, 12, 19, 24 półtony, 400 ms/nutę, oba kierunki | obie nuty wykryte, \|err\| < 10 centów na części ustalonej, **zero ramek zablokowanych na poprzedniej nucie**. **← TEN TEST OBECNY SILNIK OBLEWA KATASTROFALNIE**: C3→C4 daje 130,82 Hz we **wszystkich** 10 kolejnych ramkach |
| S7 | cisza / biały szum RMS 0,05 | 2 s | `voicedFrames == 0`. *(Obecny kod to przechodzi — 0/60 basic, 0/30 pro. Zachowaj jako straż regresji.)* |
| S8 | S2 + biały szum | SNR 20 / 10 / 6 / 0 dB | RPA@50 ≥ 0,95 / 0,90 / 0,80 / brak wymagania |
| S9 | **macierz sampleRate** | 44100, 48000, **88200, 96000** Hz, sygnał S2 | ten sam F0 w ±3 centy. **← łapie nienormalizowaną funkcję różnicową** (`lib/pitch-detector.ts:74`): przy 96 kHz MAX_PERIOD=1476 i obcinanie zaczyna się od tau=573 |
| S10 | wibracja przydechowa | sinus + szum pasmowy 4–10 kHz, SNR 6 dB | z filtrem LP 3 kHz na ścieżce pitchu: brak skoku o oktawę w górę |

### 6.3. Testy własnościowe (fast-check)

| test | asercja |
|---|---|
| niezmienniczość wzmocnienia | ±20 dB → identyczne decyzje voiced/unvoiced, \|ΔF0\| < 1 cent |
| niezmienniczość podziału na chunki | `analyzeBuffer(pcm)` ≡ `push` w chunkach 128/512/2048 → **bit-identyczne** |
| determinizm | ten sam wejściowy PCM dwa razy → bit-identycznie. **← łapie stan modułowy** (`lib/pitch-detector.ts:42`) |
| izolacja instancji | dwa trackery przeplecione → każdy równy swojemu przebiegowi solo. **← łapie** `lib/pitch-detector-pro.ts:57-58` |
| odporność na offset stały | +30 centów na całym take'u → **wysoki** wynik względny (`P`) + flaga „strojenie 30 centów nisko" |
| odporność na rampę | dryf 40 centów/min → wysoki wynik względny + flaga dryfu |
| **wykrywanie chaosu** | per-nutowy szum N(0, 40 centów) → **NISKI** wynik względny. **To jedyny test łapiący za szybką adaptację referencji** — jeśli przechodzi z wysokim wynikiem, `estimateTuningOffset` „auto-tune'uje" pod śpiewaka |
| brak alokacji w pętli | licznik alokacji w testowym allokatorze == 0 po fazie rozgrzewki |

### 6.4. Zbiór realny i oracle

**12–20 własnych nagrań**, po 20–40 s: niski męski sustain, wysoki żeński, falset, głos oddechowy pp, przejście rejestrów (passaggio), vocal fry, atak ze scoopem, fraza z portamento, fraza z vibratem, /s/ i /ʃ/ między nutami, mikrofon laptopa z pogłosem, telefon w pokoju.

**Referencja F0:** wygeneruj skryptem przez **penn / FCNF0++** (MIT obejmuje kod **i** checkpointy) → `*.f0.csv` co 10 ms. Spot-check 3 nagrań w Praat. Zapisz obok wersję narzędzia i nazwę metody — Praat ma od 2023 trzy różne ścieżki autokorelacyjne („filtered autocorrelation" nowa domyślna, „raw autocorrelation" = dawne „(ac)"), ze **zmienioną kolejnością argumentów**. Bez tego dwa uruchomienia tego samego skryptu na różnych maszynach dadzą różne etykiety i wygenerują „regresje", które nie są regresjami.

**Zbiory publiczne — tylko CC BY 4.0 w repo:** vocadito (Zenodo 5578807), Dagstuhl ChoirSet (Zenodo 4618287, ma ścieżki z mikrofonu krtaniowego = near-ground-truth), Annotated-VocalSet (Zenodo 7061507). **MDB-stem-synth (CC BY-NC) i MIR-1K (brak licencji) — wyłącznie prywatny sanity-check poza repo**, nigdy jako baseline cytowany w produkcie.

### 6.5. Metryki i progi akceptacji

Licz przez `mir_eval.melody` (MIT), nie własnym kodem.

| metryka | czyste | SNR 10 dB | uwaga |
|---|---|---|---|
| RPA @ 50 centów | ≥ 0,95 | ≥ 0,88 | konwencja MIR, **nie** prog pedagogiczny |
| RPA @ 25 centów | ≥ 0,90 | ≥ 0,80 | |
| RPA @ 10 centów | ≥ 0,80 | — | sufit metod klasycznych: pYIN ma 0,826 na MDB-stem-synth |
| **RCA − RPA (luka)** | **≤ 1,5 pp** | ≤ 3 pp | **to jest DOSŁOWNIE wskaźnik błędów oktawowych** — RCA ignoruje oktawę, RPA nie. Dziś ta luka jest prawdopodobnie ogromna i nikt jej nie widzi |
| Voicing Recall | ≥ 0,92 | ≥ 0,88 | pYIN: 92,5–95,0% |
| Voicing False Alarm | ≤ 0,10 | ≤ 0,15 | pYIN specificity: 88,9–91,9% |
| GPE (błąd > 20% F0) | ≤ 0,02 | ≤ 0,05 | |
| cents RMSE (fragmenty stabilne) | ≤ 8 | ≤ 20 | |
| **jitter odczytu** (SD F0 na sustainie) | ≤ 5 centów RMS | ≤ 12 | najbardziej odczuwalne dla użytkownika |
| octave error rate | ≤ 1% | ≤ 2% | pYIN referencyjnie: 0,5–1,7% |
| **regresja vs baseline** | RPA nie spada > **0,5 pp** | | bramka CI |

**Brak wymagania bit-exactness między platformami.** Różnice wchodzą przez `libm` (sin/cos/exp/log), kontrakcję FMA, kolejność redukcji w SIMD i obsługę denormali (flush-to-zero na ARM vs x86). Kontrakt to „te same decyzje muzyczne": tolerancje 1e-5 względnie dla ścieżek f32, 1e-9 dla f64.

### 6.6. Golden files

```
eval/baseline.json:
{
  "engineVersion": "2.0.0",
  "generatedAt": "…",
  "perFile": {
    "real/male_low_sustain.wav": {
      "rpa50": 0.967, "rpa25": 0.921, "rca50": 0.974, "gap": 0.007,
      "vr": 0.941, "vfa": 0.062, "gpe": 0.011, "centsRmse": 6.3, "octaveErrorRate": 0.004
    }, …
  },
  "aggregate": { … }
}
```

CI: `npx tsx eval/run.ts --compare eval/baseline.json` → **fail** jeśli którakolwiek metryka spadnie poniżej progu z 6.5 **lub** RPA spadnie > 0,5 pp na dowolnym pliku. Aktualizacja baseline wyłącznie świadomym commitem z uzasadnieniem w opisie.

**Snapshot całego pipeline'u:** dla 3 wybranych nagrań zapisz pełny `TakeScore` (z `perNote`) jako JSON i porównuj — to łapie regresje w segmentacji, vibrato i referencji, których metryki F0 nie widzą.

### 6.7. Panel percepcyjny — jedyna realna walidacja scoringu

10 take'ów uszeregowanych ręcznie przez 3 osoby od najlepszego do najgorszego. Wymóg: **Spearman ρ > 0,8** między wynikiem systemu a rankingiem ludzkim. Metryki F0 mówią, czy detektor działa; **tylko to mówi, czy ocena ma sens**.

---

## 7. Budżet wydajnościowy

### 7.1. Gdzie się co wykonuje

```
┌─ AUDIO THREAD (AudioWorkletProcessor) ────────── ~30 LOC, RT-safe ─────────┐
│  kopia 128 ramek → bufor z puli; co 4 quanta: port.postMessage(buf,[buf])  │
│  budżet: ≤ 0,15 ms / quantum 2,67 ms (5%)                                  │
│  ZERO alokacji, ZERO logowania, ZERO WASM (brak fetch w tym scope)         │
└────────────────────────────────────────────────────────────────────────────┘
                        │  93,75 msg/s × 2 kB transferable (bez SAB, bez COOP/COEP)
                        ▼
┌─ DEDICATED WORKER ────────────────────── cała analiza, wszystko testowalne ─┐
│  ring buffer → framing → preprocess → YIN-FFT → pYIN st.1 → cechy → fuzja  │
│  live: mediana-3 + octave-snap + One Euro                                  │
│  ocena: pełny Viterbi po take'u (osobne wywołanie, z progresem)            │
└────────────────────────────────────────────────────────────────────────────┘
                        │  batch ≤ 30 Hz, płaski Float32Array (FRAME_STRIDE=8)
                        ▼
┌─ MAIN THREAD ─────────────────────────────────────────────────────────────┐
│  ring buffer w useRef → jeden rAF → canvas. NIGDY setState per ramkę.     │
└────────────────────────────────────────────────────────────────────────────┘
```

**Dlaczego analiza nie w AudioWorklecie:** przy hopie 512 (10,67 ms) i budżecie opóźnienia 30–80 ms masz 3–7 hopów zapasu. Jedyny kod, który *musi* być RT-safe, to kopia próbek. Umieszczenie DSP w worklecie kupuje ~10 ms i kosztuje: problem ładowania WASM (brak `fetch` w `AudioWorkletGlobalScope` → moduł trzeba kompilować na main thread i przesyłać przez `postMessage`), brak możliwości uruchomienia ONNX Runtime, twardy deadline 2,67 ms i nieprzyjemne debugowanie.

**Dlaczego transferable postMessage, nie SharedArrayBuffer:** SAB wymaga `crossOriginIsolated`, czyli nagłówków `COOP: same-origin` + `COEP: require-corp`. Chrome ma łagodniejszy `COEP: credentialless`, **Safari nie** — czyli w Safari wszystkie embedy cross-origin przestają się ładować, w tym **iframe YouTube używany przez karaoke**. Przy 93,75 msg/s × 2 kB (188 kB/s) transferable postMessage jest w zupełności wystarczające. Wzorzec puli buforów (Worker zwraca bufor po przetworzeniu) eliminuje alokację w wątku audio; pusta pula = drop chunku + inkrementacja licznika XRUN widocznego w diagnostyce.

### 7.2. Budżet na ramkę

Budżet wall przy hopie 512: **10,67 ms**. Cel wykorzystania: ≤ 15% jednego rdzenia.

| etap | JS (cel) | WASM+SIMD128 (cel) | dziś |
|---|---|---|---|
| framing + HP/LP + okno | ≤ 0,05 ms | ≤ 0,01 ms | — |
| realFFT 4096 (fwd) + widmo mocy + realFFT (inv) | ≤ 0,35 ms | ≤ 0,06 ms | — |
| d(tau) z autokorelacji + sumy kumulatywne + CMND | ≤ 0,10 ms | ≤ 0,02 ms | 0,36–1,13 ms (pętla O(W·L)) |
| pYIN stage 1 (100 progów × 1024) | ≤ 0,15 ms | ≤ 0,03 ms | — |
| interpolacja paraboliczna + kandydaci 2f/f÷2 | ≤ 0,02 ms | ≤ 0,01 ms | — |
| cechy widmowe (SHR, harmoniczne, flatness, HNR, LF) | ≤ 0,20 ms | ≤ 0,05 ms | **25,84 ms** (`lib/fft-analyzer.ts:24`) |
| fuzja voicingu + bramka + histereza | ≤ 0,02 ms | ≤ 0,01 ms | — |
| live: mediana-3 + octave-snap + One Euro | ≤ 0,03 ms | ≤ 0,01 ms | — |
| **SUMA / ramkę** | **≤ 0,92 ms (8,6%)** | **≤ 0,20 ms (1,9%)** | **26,94 ms (252%)** |

Szacunki JS/WASM pochodzą z liczby operacji, nie z pomiaru na urządzeniu — **muszą być zweryfikowane** (patrz otwarte pytania). Pomiar `26,94 ms` jest twardy: zmierzony niezależnie dwa razy w Node na Apple Silicon.

**Pełny Viterbi (ścieżka oceny, offline w Workerze):** 531 binów × 2 × ~50 niezerowych przejść ≈ 53k mul-add/ramkę.

| długość take'u | ramek (hop 512) | operacji | JS (cel) | WASM (cel) |
|---|---|---|---|---|
| ćwiczenie 20 s | 1 875 | 99 M | ≤ 200 ms | ≤ 60 ms |
| piosenka 3 min | 16 870 | 894 M | ≤ 1,5 s | ≤ 0,4 s |

Powyżej 30 s raportuj progres. Dla take'ów > 5 min użyj hopu 512 zamiast 256 (dwukrotna oszczędność bez straty dla oceny — segmentacja nut i tak działa na skali 100 ms).

### 7.3. Pamięć

**Pre-alokacja przy konstrukcji trackera** (zero alokacji w pętli):

| bufor | rozmiar |
|---|---|
| ring buffer wejściowy (8192 f32) | 32 kB |
| ramka + ramka po oknie (2 × 3072 f32) | 24 kB |
| FFT work (4096 complex f32 × 2) | 64 kB |
| widmo mocy (2048 f32) | 8 kB |
| yinBuffer + cumsum (2 × 1024 f32) | 8 kB |
| kandydaci (12 × 4 f32) | < 1 kB |
| pierścień wyjściowy (512 ramek × 8 f32) | 16 kB |
| **razem na tracker** | **< 160 kB** |
| tabela przejść Viterbi (rzadka, 531 × ~50 f32) | 106 kB |
| tabela DP + backpointery na 3-min take (16 870 × 1062 × u16) | 36 MB — **alokuj tylko na czas dekodowania i zwolnij** |

Dziś: `new Float32Array(2048)` na ramkę (`hooks/use-audio-recorder.ts:39`) + dwa w `lib/fft-analyzer.ts:14,17` + jeden w YIN (`lib/pitch-detector.ts:72`) ≈ **25 kB/ramkę ≈ 1,5 MB/s śmieci** przy 60 fps. Widoczne jako mikroprzycięcia wizualizacji i cykle GC.

### 7.4. Jak nie blokować UI

| problem dzisiaj | plik:linia | rozwiązanie |
|---|---|---|
| `historyRef.current = [...historyRef.current, pitchData]` + `setPitchHistory` **co ramkę** → O(n²) alokacji | `hooks/use-audio-recorder.ts:68-69` | ring buffer `Float32Array` w `useRef`, publikacja do Reacta z throttlingiem ≤ 30 Hz albo wcale (canvas czyta ref bezpośrednio) |
| `setCurrentPitch` + `setRecordingDuration` + `addPitch` co ramkę, a `AudioRecorderProvider` owija całe drzewo (`app/layout.tsx:55`) → **re-render całej aplikacji 60×/s** | `:67`, `:76`; `contexts/audio-recorder-context.tsx:51-55` | czas z `setInterval(…, 200)`; `currentPitch` przez ref + subskrypcja tylko w komponencie wskaźnika |
| `PitchVisualizer` rysuje canvas **dwa razy** na ramkę i przebudowuje pętlę rAF 60×/s (`draw` zmienia tożsamość, bo `pitchHistory` to nowa referencja co ramkę) | `components/pitch-visualizer.tsx:353-371` | dane w refach, jedna pętla rAF na `[isRecording]`, canvas poza drzewem reaktywnym |
| dwa pełne filtry po całej rosnącej historii na każde `draw` | `components/pitch-visualizer.tsx:28,183` | okno widoczne utrzymywane inkrementalnie w ring bufferze |
| `console.log` przy 10% ramek | `lib/pitch-detector.ts:27-30` | usunąć + `compiler: { removeConsole: { exclude: ['error','warn'] } }` w `next.config.ts` |

### 7.5. Opóźnienie end-to-end

| składnik | ms |
|---|---|
| wejście `getUserMedia` (platformowe, niemierzalne z JS) | 10–40 |
| quantum AudioWorklet | 2,7 |
| chunk 512 próbek | 10,7 |
| środek ramki analizy (W_eff/2) | ~32 |
| mediana-3 (ścieżka live) | 10,7 |
| One Euro (adaptacyjnie: dużo przy wolnym ruchu, mało przy szybkim) | 5–40 |
| rAF + kompozycja | 16,7 |
| **razem (wskaźnik na ekranie)** | **~78–153 ms** |

Kierunek asynchronii (obraz opóźniony względem dźwięku) jest tym **tolerancyjnym**: ITU-R BT.1359-1 podaje próg detekcji dopiero przy 125 ms opóźnienia obrazu, ATSC „broadcast acceptable" 45 ms. Jesteśmy na granicy górnej — dlatego **emituj dwie linie**: cienką „surową" (bez mediany i One Euro, ~57–90 ms) jako kursor i grubą wygładzoną jako ślad. **Zasada twarda: linia surowa nigdy nie ocenia.**

**Zastrzeżenie metodologiczne:** próg 125 ms pochodzi z badań **biernej** percepcji asynchronii audio-wideo, nie z zamkniętej pętli sensomotorycznej, w której użytkownik sam generuje bodziec. Nie znaleziono badań o progu opóźnienia feedbacku **wizualnego** u śpiewaków. Budżet trzeba zweryfikować testem pętli (klik → widoczna reakcja) na docelowych urządzeniach, nie sumą teoretyczną.

**Percepcyjnie gorsza jest NIESTABILNOŚĆ niż opóźnienie.** Kursor opóźniony gładko o 100 ms czyta się jako responsywny; kursor o średnim opóźnieniu 40 ms, który raz na sekundę przeskakuje o oktawę, czyta się jako zepsuty. W zakresie 45–150 ms optymalizuj gładkość, nie milisekundy.

---

## 8. Otwarte pytania — do rozstrzygnięcia pomiarem, nie researchem

1. **Żaden z benchmarków w tym dokumencie nie jest niezależny.** Liczby pYIN/YIN pochodzą z pracy autorów pYIN; liczby SwiftF0 z arXiv autora **i** z benchmarku prowadzonego przez tego samego autora; liczby ClearerVoice od Alibaby mierzącej konkurentów własnym narzędziem. Nie istnieje trzecioosobowe porównanie żadnego z tych detektorów **na śpiewie**. Rozstrzyga wyłącznie własny zbiór z sekcji 6.
2. **Zero pomiarów na telefonie.** Wszystkie szacunki ms/ramkę dla JS i WASM wynikają z liczby operacji. Jedyny twardy pomiar (26,94 ms naiwnego DFT) był na Apple Silicon w Node. Przed decyzją o budżecie CPU: zmierz jedną ramkę YIN-FFT W=2048 na najstarszym docelowym iPhonie i średnim Androidzie — to godzina pracy i usuwa największą niepewność.
3. **Babacan i in. (ICASSP 2013)** „A Comparative Study of Pitch Extraction Algorithms on a Large Variety of Singing Sounds" — kluczowa praca porównawcza YIN/SWIPE/RAPT/Praat/STRAIGHT **na śpiewie**, nie pozyskana (PDF z tcts.fpms.ac.be nie odpowiada). To największa luka merytoryczna.
4. **Benchmark BIGOS/polskie dane** nieistotny tutaj, ale analogiczny problem: brak liczb dla vocadito i Dagstuhl ChoirSet — a to jedyne zbiory CC BY 4.0 ze śpiewem, na których wolno budować baseline.
5. **Licencja wag SwiftF0** — repo deklaruje MIT dla kodu, nie wypowiada się o `.onnx` ani o zbiorach treningowych poza syntetycznym SpeechSynth. Jeden mail do autora jest tańszy od audytu prawnego.
6. **Licencja PTDB-TUG** nieustalona; do czasu potwierdzenia traktować jako niedostępny.
7. **Współczynnik `f_ctx = 0,7`** (tolerancja przy jednoczesnym akompaniamencie harmonicznym) to oszacowanie z rozumowania o dudnieniach, nie zmierzony prog percepcyjny dla interwałów jednoczesnych. Do kalibracji na własnych danych.
8. **Normy vibrata dla amatorów** — wszystkie dane Prame dotyczą zawodowców klasycznych. Progi „5,5–7,5 Hz zdrowe", „regularity < 0,85 nieregularne", „< 5 Hz wobble", „> 8 Hz tremor" są szacunkami inżynierskimi. Baza użytkowników to amatorzy i pop — te normy trzeba wyznaczyć z własnych nagrań, zanim pokaże się je użytkownikowi jako diagnozę.
9. **Kotwice kalibracji wyniku** (0,70 → 70 itd.) są **postulatem**. Bez 50–100 własnych nagrań nie da się stwierdzić, czy mediana wypada w docelowym przedziale 65–75. To jedyna rzecz w tym dokumencie, której nie da się załatwić teorią.
10. **Realne zachowanie flag `echoCancellation`/`noiseSuppression`/`autoGainControl` na iOS Safari i w Android WebView w 2026** — BCD potwierdza, że dwie z trzech nie są w Safari wspierane wcale, ale to trzeba zmierzyć na urządzeniu (`getSettings()` + porównanie zmierzonego szumu tła przy flagach on/off). Od tego zależy, czy kalibracja poziomu w przeglądarce mobilnej jest w ogóle wykonalna, czy jest argumentem za przyspieszeniem portu natywnego.
11. **Czy `@audio/pitch-pyin`** (MIT, 7,3 KB, opublikowany 2026-07-11) implementuje pełny pYIN z HMM, czy tylko część probabilistyczną — do przeczytania kodu, nie do zaufania na słowo. Jeśli pełny, oszczędza tydzień pracy w etapie E1.
12. **Czy istnieje utrzymywana implementacja online/fixed-lag pYIN**, którą można wziąć zamiast pisać samemu. `sevagh/pitch-detection` ma PYIN z `hmm.cpp`, ale liczy jeden pitch na cały bufor — nie wiadomo, czy jego HMM da się użyć inkrementalnie bez przepisania.