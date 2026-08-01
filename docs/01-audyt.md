# Audyt Vocal Coach — pełna lista ustaleń

Metoda: sześciu agentów zaudytowało repo obszarami, następnie sześciu niezależnych weryfikatorów sprawdziło każde zgłoszenie wracając do kodu i szukało tego, co audytor przeoczył.

**Bilans:** 81 zgłoszeń potwierdzonych · 16 obalonych · 71 znalezionych dodatkowo przez weryfikatorów.

Poniżej wyłącznie ustalenia **potwierdzone na kodzie**. Obalone zebrane są w sekcji na końcu — warto je znać, żeby nie naprawiać rzeczy, które działają.

---

## Przegląd obszarów

| Obszar | Dojrzałość | Werdykt | Potwierdzone | Nowe |
|---|---|---|---|---|
| SING — karaoke, nagrywanie na podkład, obróbka głosu | prototype | **rewrite** | 12 | 13 |
| Edytor / studio multitrack (fundament pod filar PODCAST) | prototype | **rewrite** | 13 | 11 |
| TRAIN - cwiczenia, gry, sing-along, zakres glosu, postepy | prototype | **rewrite** | 14 | 10 |
| Architektura aplikacji, information architecture, stan, jako | prototype | **refactor** | 14 | 14 |
| Silnik detekcji wysokosci dzwieku (F0) - lib/pitch-detector. | prototype | **rewrite** | 14 | 12 |
| Pipeline przechwytywania i przechowywania audio (capture + s | prototype | **rewrite** | 14 | 11 |

---

## SING — karaoke, nagrywanie na podkład, obróbka głosu

> Filar SING praktycznie nie istnieje jako spójna funkcja — są trzy niezależne, częściowo zepsute kawałki: (1) /record/karaoke, które odtwarza YouTube w iframe i równolegle nagrywa mikrofon bez ŻADNEJ synchronizacji ani kompensacji latencji (grep po baseLatency/outputLatency/getOutputTimestamp w całym repo daje zero trafień), (2) /train/singalong, które w ogóle nie odtwarza dźwięku — to tylko piano-roll z MIDI, a czas płynie tylko wtedy gdy użytkownik śpiewa, więc to nie jest podkład tylko wizualny metronom sterowany głosem, oraz (3) /edit/studio z offline'owym łańcuchem kompresor→EQ 3-pasmowe→reverb→gain, który jest jedynym realnie działającym elementem obróbki. Łańcuch "nagraj → zapisz → odsłuchaj" jest przerwany w krytycznym miejscu: w kontekście nagrywania MediaRecorder nigdy się nie uruchamia przez stale closure (`audioRecorder.isRecording` czytane natychmiast po `startRecording()`), więc sesje z /record/live zapisują się z flagą hasAudio:true, ale IndexedDB jest puste i Studio pokazuje błąd. Nie ma monitoringu na słuchawki, nie ma de-essera, redukcji szumu, normalizacji ani tuningu, nie ma miksu wokal+podkład, nie ma żadnej biblioteki treści (AVAILABLE_MIDI_FILES to pusta tablica, pliki .mid leżą nieużywane w public/). Duża część kodu SING jest martwa: SessionLibrary i AudioPlayback nie są nigdzie renderowane, /karaoke, /sessions, /analysis i /training/* to puste redirecty do których nic nie linkuje.

**Werdykt: rewrite** — Do przeniesienia na iOS/Android nadaje się z tego obszaru wyłącznie warstwa pojęciowa (presety EQ/kompresora, model sesji, TimelineAnalysis) — cała mechanika jest zbudowana na założeniach, które nie mają odpowiednika w natywnym: YouTube IFrame API jako źródło podkładu (dodatkowo ToS zabrania nagrywania/miksowania), rAF jako zegar DSP, MediaRecorder/webm-opus jako format nagrania, localStorage+IndexedDB jako storage, a graf Web Audio jest wpleciony bezpośrednio w komponenty React (refy do BiquadFilterNode trzymane w app/edit/studio/page.tsx), więc nie da się go wyekstrahować. Fundamentalnie: karaoke bez kompensacji latencji round-trip i bez wspólnego zegara audio dla podkładu i nagrania jest nienaprawialne "łatką" — to trzeba zaprojektować od zera wokół jednego audio clocka (sample-accurate scheduling podkładu, znacznik startu z getOutputTimestamp, kalibracja pomiarowa loopbackiem, offset zapisywany razem z nagraniem). Nie kasować: lib/audio-processor.ts (presety + topologia łańcucha), lib/midi-parser.ts (samodzielny parser MIDI, zero zależności), components/timeline-analysis.tsx (jedyna wizualizacja pracująca na czasie względnym) i model Session/audio-storage jako specyfikacja schematu danych.

### 1. Zero kompensacji latencji round-trip w karaoke — nagrania nieodwracalnie rozjechane

`KRYTYCZNY` · `app/record/karaoke/page.tsx:240` · potwierdzone

`mediaRecorder.start(100)` (240) → `setIsRecording(true)` (242) → `setInterval` (246) → `player.playVideo()` (251). Nic nie mierzy ani nie zapisuje offsetu.

*Weryfikator:* POTWIERDZONE. Powtórzyłem grep po całym repo (bez node_modules) po `baseLatency|outputLatency|getOutputTimestamp|latencyHint` — 0 trafień. Dodatkowo, czego audytor nie zauważył: `startKaraoke` NIE robi `player.seekTo(0)`, więc jeśli użytkownik wcześniej odsłuchał utwór, nagranie startuje w losowym miejscu ścieżki, a `player.getCurrentTime()` nigdy nie jest odczytywany — offsetu nie da się odtworzyć nawet post factum. Blob webm nie zawiera żadnego znacznika czasu odniesienia.

### 2. Audio z /record/live NIGDY nie jest nagrywane — stale closure blokuje MediaRecorder

`KRYTYCZNY` · `contexts/audio-recorder-context.tsx:62` · potwierdzone

`await audioRecorder.startRecording()` (59), następnie `if (audioRecorder.isRecording && streamRef.current === null)` (62). `audioRecorder` to obiekt z renderu, w którym powstał handler; `isRecording` jest prymitywem odczytanym w tym renderze i w momencie kliknięcia Start ma zawsze wartość `false`.

*Weryfikator:* POTWIERDZONE i sprawdzone Grepem: `startAudioRecording` ma DOKŁADNIE JEDNEGO wywołującego (contexts/audio-recorder-context.tsx:69), schowanego pod tym warunkiem. Nie ma alternatywnej ścieżki. Cały łańcuch potwierdzony: `audioBlob` zostaje null → save-session-dialog.tsx:35 `hasAudio = audioBlob !== null` → false; na desktopie desktop-navigation.tsx:92 wpisuje `true` niezależnie → /library/session:205 pokazuje 'Audio: Tak' i przycisk 'Otworz w Studio', a studio/page.tsx:171 wyświetla 'Nie znaleziono nagrania audio dla tej sesji'. DODATKOWO (audytor pominął): nawet po naprawie warunku, linia 67 robi DRUGIE `getUserMedia({audio: true})` — z domyślnymi echoCancellation/noiseSuppression/autoGainControl WŁĄCZONYMI — więc zapisane audio byłoby innym, przetworzonym przez przeglądarkę sygnałem niż ten analizowany, przy dwóch jednocześnie otwartych strumieniach mikrofonu.

### 3. Podwójny zapis sesji na desktopie + hasAudio zahardkodowane na true

`wysoki` · `components/desktop-navigation.tsx:92` · potwierdzone

`const sessionId = saveSession(pitchHistory, sessionType, duration, undefined, true)` — piąty argument (hasAudio) stały `true`. Równolegle app/record/live/page.tsx:68-70 otwiera SaveSessionDialog → components/save-session-dialog.tsx:38 woła `saveSession` drugi raz.

*Weryfikator:* POTWIERDZONE częściowo, z korektami. Grep: `saveSession(` ma dokładnie 2 wywołujących (desktop-navigation.tsx:92, save-session-dialog.tsx:38) — duplikat powstaje TYLKO gdy użytkownik kliknie 'Zapisz'; po 'Pomiń' jest jeden wpis (autozapis). Obniżyłem z critical na high właśnie dlatego. `hasAudio: true` jest bezwarunkowe i dziś ZAWSZE kłamie (patrz ustalenie #2). Sprawdziłem też podejrzenie o duplikat przy każdej nawigacji: app/template.tsx jest Next.js *template*, więc DesktopNavigation remontuje się na każdej zmianie route i `wasRecordingRef` się zeruje — dodatkowego duplikatu przy nawigacji NIE ma. Zamiast tego znalazłem inny błąd tego samego efektu (patrz 'missed': duration w ms).

### 4. Brak jakiegokolwiek monitoringu na słuchawki podczas nagrywania

`wysoki` · `hooks/use-audio-recorder.ts:112` · potwierdzone

`source.connect(gainNode)` (113) → `gainNode.connect(analyser)` (114) — łańcuch kończy się na AnalyserNode. To samo w app/record/karaoke/page.tsx:205 (`source.connect(analyser)`).

*Weryfikator:* POTWIERDZONE Grepem po `.destination` w całym repo: jedyne połączenia do wyjścia to app/edit/studio/page.tsx:229 (preview odsłuchu pliku), components/metronome.tsx, lib/audio-synth.ts, lib/guitar.ts, lib/multi-track-engine.ts. W ŻADNEJ ścieżce nagrywania (live, karaoke, studio recording) nie ma toru odsłuchu, ani wykrywania słuchawek, ani ostrzeżenia o sprzężeniu.

### 5. Karaoke: mikrofon łapie podkład z głośników, a UI twierdzi że nie

`wysoki` · `app/record/karaoke/page.tsx:193` · potwierdzone

`echoCancellation: false` (193), `noiseSuppression: false` (194), podkład leci z YouTube przez głośniki. Sekcja 'Jak to dziala' obiecuje: `<li>2. Mikrofon nagrywa TYLKO Twoj wokal (bez audio z YouTube)</li>` (522).

*Weryfikator:* POTWIERDZONE dosłownie — cytat z linii 522 istnieje w pliku, flagi w liniach 193-195 też. Nigdzie w pliku nie ma detekcji urządzenia wyjściowego ani ostrzeżenia o słuchawkach (przeczytałem cały plik, 532 linie). Wybór `echoCancellation: false` jest sam w sobie słuszny dla jakości wokalu — problemem jest wyłącznie fałszywa obietnica w UI i brak wymuszenia słuchawek.

### 6. localStorage jako magazyn pełnych tablic pitchHistory — przekroczenie quoty i cicha utrata sesji

`wysoki` · `hooks/use-session-library.ts:88` · potwierdzone

`localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(trimmedSessions))` (88) zapisuje pełne `pitchHistory` (session.pitchHistory, linia 73). Historia rośnie w każdej klatce rAF (hooks/use-audio-recorder.ts:68). MAX_SESSIONS = 50 (linia 22).

*Weryfikator:* Mechanizm POTWIERDZONY, jedno twierdzenie audytora BŁĘDNE: biblioteka NIE jest 'parsowana z JSON przy każdym renderze hooka' — parsowanie jest w `useEffect(..., [])` (linie 29-46), czyli raz na montowanie hooka, plus raz na każdy zapis/usunięcie. Reszta się broni: catch w liniach 98-101 zwraca `null` bez żadnego sygnału do UI, a save-session-dialog.tsx:46 wykonuje `onOpenChange(false)` NIEZALEŻNIE od tego, czy `sessionId` jest null — dialog zamyka się jak przy sukcesie, sesji nie ma. Cicha utrata danych potwierdzona.

### 7. Przekazywanie nagrania karaoke do Studio przez base64 w localStorage

`wysoki` · `app/record/karaoke/page.tsx:299` · potwierdzone

`reader.onload = () => { localStorage.setItem("karaoke-temp-audio", reader.result as string); router.push("/edit/studio?source=karaoke") }` (297-302), `reader.readAsDataURL(recordedBlob)` (302). Brak try/catch.

*Weryfikator:* POTWIERDZONE. Wyjątek QuotaExceededError leci wewnątrz callbacku FileReadera → `router.push` w linii 300 nigdy się nie wykonuje, brak `setError`, użytkownik nie widzi nic. Sprawdziłem też stronę docelową: app/edit/studio/page.tsx:96-127 czyta klucz i w linii 119 robi `localStorage.removeItem` — więc nawet po udanym transferze odświeżenie Studio bezpowrotnie traci nagranie. Nigdzie indziej blob karaoke nie jest zapisywany (grep po saveSessionAudio: brak wywołań ze strony karaoke).

### 8. SingAlong nie odtwarza żadnego dźwięku — to nie jest podkład, tylko piano-roll sterowany głosem

`wysoki` · `hooks/use-sing-along.ts:211` · potwierdzone

`if (isSinging) { setState((prev) => ({ ...prev, currentTime: prev.currentTime + deltaMs * PLAYBACK_SPEED })) }` (211-222); `isSinging` gaśnie po 200 ms ciszy (`setTimeout(() => setIsSinging(false), 200)`, 242-244). UI opisuje to jako feature: components/sing-along.tsx:381 'Piosenka płynie gdy śpiewasz, zatrzymuje się gdy milczysz'.

*Weryfikator:* POTWIERDZONE. Grep po `AudioSynthesizer` w repo: importowany wyłącznie przez hooks/use-hit-the-note-game.ts, hooks/use-training-mode.ts, hooks/use-hit-the-chord-game.ts. W hooks/use-sing-along.ts (411 linii) i components/sing-along.tsx (906 linii) nie ma ani AudioSynthesizer, ani AudioBufferSourceNode, ani `<audio>`. Sprawdziłem też, że komponent jest realnie zamontowany (app/train/singalong/page.tsx:33) — to nie martwy kod. Bonus: `state.score` istnieje w typie i jest zerowane w 4 miejscach, ale nigdy nie inkrementowane ani nie wyświetlane — punktacja to atrapa.

### 9. Zerowa biblioteka treści — lista utworów jest pustą tablicą

`wysoki` · `lib/midi-parser.ts:396` · potwierdzone

`export const AVAILABLE_MIDI_FILES: Array<{ id: string; name: string; url: string }> = [ // Add your MIDI files here ]` (396-398). UI renderuje `AVAILABLE_MIDI_FILES.map(...)` pod nagłówkiem 'Wybierz utwór:' (components/sing-along.tsx:392).

*Weryfikator:* POTWIERDZONE. Numer linii dokładnie 396 (grep). W public/ leżą 3 pliki: 'A HA.Take on me K.mid', 'Aha_-_Take_On_Me.mid', 'Nirvana - Smells Like Teen Spirit.mid' — grep nie znajduje do nich żadnego odwołania w kodzie. Sekcja 'Wybierz utwór:' renderuje się z zerem dzieci, zostaje tylko upload własnego .mid. Uwaga na przyszłość: te pliki to pełne aranże wielościeżkowe, więc po wpisaniu ich na listę użytkownik wpada w ekran wyboru ścieżki (phase 'track-select', hooks/use-sing-along.ts:58-69) i musi sam odgadnąć, która ścieżka to wokal.

### 10. Karaoke nie ma ŻADNEGO cleanupu — wyjście ze strony (lub 'Zmien wideo') w trakcie nagrywania zostawia otwarty mikrofon i pętlę rAF

`wysoki` · `app/record/karaoke/page.tsx:442` · znalezione przy weryfikacji

W całym pliku są tylko dwa `useEffect` (46 i 52) i ŻADEN nie zwraca funkcji czyszczącej. Zwolnienie zasobów (`stream.getTracks().forEach(track => track.stop())`, `cancelAnimationFrame`, `audioContext.close()`) siedzi wyłącznie w `mediaRecorder.onstop` (223-238). Przycisk 'Zmien wideo' (442-455) robi `setIsRecording(false)` i `player.destroy()`, ale NIE woła `stopRecording()` — MediaRecorder, `recordingTimerRef` interval i pętla `analyzePitch` (178) lecą dalej.

**Skutek dla użytkownika:** Kliknięcie 'Zmien wideo' albo nawigacja w menu w trakcie nagrywania: dioda mikrofonu w przeglądarce zostaje zapalona (mikrofon nagrywa dalej po opuszczeniu strony), rAF spala CPU/baterię do końca życia karty, a całe nagranie przepada bez komunikatu. Na telefonie to od razu widoczne jako grzejące się urządzenie i podejrzenie podsłuchu.

**Naprawa:** Wyciągnąć zwalnianie zasobów z `onstop` do jednej funkcji `teardown()` (stream, AudioContext, rAF, interval) i wołać ją z `useEffect(() => () => teardown(), [])` oraz z handlera 'Zmien wideo' przed `player.destroy()`. Trzymać `stream`/`audioContext` w refach, nie w closure `startKaraoke`.

### 11. mimeType 'audio/webm' zahardkodowany bez fallbacku — nagrywanie w ogóle nie startuje na iOS/Safari, a komunikat błędu kłamie

`wysoki` · `app/record/karaoke/page.tsx:213` · znalezione przy weryfikacji

`new MediaRecorder(stream, { mimeType: "audio/webm" })` (karaoke:213), to samo w hooks/use-audio-recording.ts:18 i components/multi-track-manager.tsx:232. Safari nie wspiera webm w MediaRecorderze (tylko audio/mp4). Konstruktor rzuca NotSupportedError już PO udanym `getUserMedia` (191-197), więc catch w linii 254-257 ustawia `setError("Nie mozna uzyskac dostepu do mikrofonu. Sprawdz uprawnienia.")`, a `stream` nigdy nie jest zatrzymany. Nawet app/edit/studio/page.tsx:472-475 ma tylko fallback webm→webm (`"audio/webm;codecs=opus"` → `"audio/webm"`), czyli też pada.

**Skutek dla użytkownika:** Na iPhonie/iPadzie (jedyna przeglądarka to WebKit) karaoke, nagrywanie w Studio i multitrack nie działają w ogóle, a aplikacja obwinia użytkownika o brak uprawnień do mikrofonu — po czym zostawia zapalony mikrofon. Przy planie 'najpierw web, potem natywne iOS' to blokuje połowę docelowych urządzeń już dziś.

**Naprawa:** Jedna wspólna funkcja `pickRecorderMime()` z listą kandydatów ['audio/webm;codecs=opus','audio/mp4;codecs=mp4a.40.2','audio/mp4',''] filtrowaną przez `MediaRecorder.isTypeSupported`, użyta we wszystkich trzech miejscach; przy braku wsparcia komunikat o formacie, nie o uprawnieniach; `stream.getTracks().forEach(t => t.stop())` w bloku catch.

### 12. Eksport WAV buduje zwykłą tablicę JS ze WSZYSTKICH próbek — kilkuset MB alokacji i zawieszenie karty na dłuższym nagraniu

`wysoki` · `lib/audio-processor.ts:262` · znalezione przy weryfikacji

```
const data = []
for (let i = 0; i < audioBuffer.length; i++) {
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const sample = audioBuffer.getChannelData(channel)[i]
    ...
    data.push(pcmSample)
  }
}
```
(262-271). Dla 3 min stereo 48 kHz to 17,3 mln elementów w `Array<number>` (~8 bajtów + narzut na element ≈ 150-250 MB) zanim w ogóle powstanie `ArrayBuffer` (274). Dodatkowo `getChannelData(channel)` jest wołane w pętli wewnętrznej, czyli 17 mln razy.

**Skutek dla użytkownika:** Kliknięcie 'Przetworz' na dłuższym nagraniu (podcast, cały utwór) zawiesza zakładkę na kilkanaście sekund albo wywala ją z braku pamięci — na telefonie praktycznie zawsze. Użytkownik traci przetworzone audio i nie dostaje żadnego komunikatu.

**Naprawa:** Alokować `ArrayBuffer` od razu (44 + length*blockAlign) i pisać `view.setInt16` w jednej pętli, bez tablicy pośredniej; `getChannelData` wyciągnąć przed pętlę do tablicy referencji na kanały. Docelowo przenieść eksport do Web Workera i strumieniować.

### 13. Transpozycja w SingAlong kumuluje się i nie da się jej cofnąć

`wysoki` · `hooks/use-sing-along.ts:173` · znalezione przy weryfikacji

```
const transposedOriginal = transposeMidi(prev.originalMidi, semitones)   // 156
...
originalMidi: transposeMidi(prev.originalMidi, semitones),               // 173
```
`originalMidi` jest NADPISYWANY wersją już przetransponowaną, a UI liczy argument absolutnie: `setTranspose(state.transpose - 12)` / `+ 12` (components/sing-along.tsx:651, 663). Do tego `transposeMidi` ma early return `if (semitones === 0) return midi` (lib/midi-parser.ts:~401).

**Skutek dla użytkownika:** Pierwsze kliknięcie 'w dół' daje -12 (poprawnie). Drugie kliknięcie ('w dół' → argument -24) transponuje już przesunięty materiał, czyli faktycznie -36 przy etykiecie '-24'. Powrót do 0 nie przywraca nic (early return), więc nuty na piano rollu wyjeżdżają poza zakres C2-C6 i są klampowane do skrajnych wierszy (components/sing-along.tsx:41 `midiToY`) — funkcja 'obniż jeśli za wysoko', reklamowana w UI, po dwóch kliknięciach robi utwór niemożliwy do zaśpiewania i nie ma z tego wyjścia bez przeładowania pliku.

**Naprawa:** Nie modyfikować `originalMidi` — zostawić go jako niezmienny materiał źródłowy i wyliczać `midi = transposeMidi(originalMidi, semitones)` zawsze od oryginału; usunąć linię 173. Przy okazji `transposeMidi` powinno klampować `newMidiNumber` do 0-127.

### 14. autoGainControl: true w karaoke — trzy różne polityki pozyskiwania sygnału

`sredni` · `app/record/karaoke/page.tsx:195` · potwierdzone

`autoGainControl: true, // Keep auto gain to prevent clipping` (195) vs `autoGainControl: false` w hooks/use-audio-recorder.ts:89 i w app/edit/studio/page.tsx:467.

*Weryfikator:* Fakty POTWIERDZONE co do linii i treści. Obniżyłem high→medium: AGC jest tu świadomą decyzją (komentarz + miernik przesterowania w UI, linie 391-417), więc to nie jest 'zepsute', a niespójność polityki i utrata dynamiki. Prawdziwy koszt jest przy naturalnym łańcuchu karaoke→Studio: AGC systemowe + kompresor w PRESETS (ratio 4-6) + outputGain 1.1-1.25 nakładają się bez limitera (patrz 'missed': brak limitera).

### 15. Stale closure w handlerze YouTube — pauza/koniec wideo nie zatrzymuje nagrywania

`sredni` · `app/record/karaoke/page.tsx:105` · potwierdzone

Player powstaje w `loadVideo()` (90-115); `onStateChange` domyka `isRecording` z renderu, w którym wideo dopiero ładowano: `if (isRecording) { stopRecording() }` (105-107).

*Weryfikator:* POTWIERDZONE — w chwili tworzenia playera `isRecording` jest zawsze `false` i handler nigdy nie jest odtwarzany na nowo (player tworzony raz, `playerRef`/`setPlayer` nie odświeżają eventów). Ten sam closure trzyma stale `player === null`, więc `stopRecording` w linii 273-275 też by nie wykonał `player.pauseVideo()`. Skutek: koniec utworu nie kończy nagrania, MediaRecorder i licznik lecą dalej, mikrofon zostaje otwarty.

### 16. Sesje karaoke nie są w ogóle zapisywane — filtr 'Karaoke' w bibliotece jest strukturalnie martwy

`sredni` · `app/record/karaoke/page.tsx:223` · potwierdzone

`mediaRecorder.onstop = () => { const blob = new Blob(...); setRecordedBlob(blob); ... }` (223-238) — brak saveSession/saveSessionAudio. `pitchHistory` (do 500 próbek, linia 156) ginie z komponentem. app/library/page.tsx:31-33: `case "karaoke": // karaoke is currently stored as "analysis" mode; return session.mode === "analysis"`.

*Weryfikator:* POTWIERDZONE dwoma grepami: (a) `saveSessionAudio` nie ma wywołania w app/record/karaoke/page.tsx, (b) `saveSession(` ma tylko 2 wywołujących i żaden nie przekazuje mode 'analysis' (save-session-dialog jest użyty wyłącznie w app/record/live/page.tsx:195 z `mode="live"`, desktop-navigation liczy sessionType z pathname). Sesja z mode 'analysis' nie może więc powstać — zakładka 'Karaoke' zawsze pusta.

### 17. Brak limitera/normalizacji na wyjściu — presety z outputGain 1.1-1.25 i boostami EQ twardo obcinają sygnał

`sredni` · `lib/audio-processor.ts:190` · znalezione przy weryfikacji

Łańcuch to compressor → 3 x biquad → `outputGain` → destination (194-212), bez żadnego limitera ani analizy szczytu. Presety: 'Bright & Crisp' `highShelfGain: 5, midGain: 3, outputGain: 1.25` (94-98), 'Podcast Voice' `outputGain: 1.2` przy +3 dB high (46-50). Obcięcie realizuje dopiero konwerter WAV: `const intSample = Math.max(-1, Math.min(1, sample))` (267).

**Skutek dla użytkownika:** Na normalnie nagranym (lub przepuszczonym przez AGC) wokalu presety 'poprawiające jakość' wprowadzają twarde clipping — trzask i przester na najgłośniejszych frazach, słyszalny w wyeksportowanym WAV. Funkcja robi dokładne przeciwieństwo tego, co obiecuje jej nazwa.

**Naprawa:** Dodać na końcu łańcucha limiter (drugi DynamicsCompressor: threshold -1 dB, ratio 20, attack 0.001, knee 0) albo policzyć szczyt wyrenderowanego bufora i przeskalować do -1 dBFS przed zapisem WAV; wyświetlić w UI zmierzony peak/LUFS.

### 18. Reverb: ogon obcięty do długości wejścia + impuls to surowy biały szum

`sredni` · `lib/audio-processor.ts:134` · znalezione przy weryfikacji

`new OfflineAudioContext(audioBuffer.numberOfChannels, audioBuffer.length, audioBuffer.sampleRate)` (134-138) — długość renderu = długość wejścia, a impuls ma 2 s (`createReverbImpulse(offlineContext, 2, 2)`, 179). `createReverbImpulse` (230-248) generuje wyłącznie `(Math.random()*2-1) * Math.pow(1 - i/length, decay)` — bez pre-delayu, bez filtracji pasma, bez korelacji kanałów.

**Skutek dla użytkownika:** Pogłos ucina się w połowie zaniku dokładnie na końcu pliku (słyszalne 'ścięcie' ostatniego wyrazu), a jego barwa jest metaliczna/syczaca, bo to płaskie widmo szumu — brzmi jak artefakt, nie jak przestrzeń. Przy mono nagraniu z MediaRecordera dodatkowo `numberOfChannels: 1` sprawia, że dwukanałowy impuls jest sumowany do mono.

**Naprawa:** Renderować `audioBuffer.length + reverbDuration * sampleRate` próbek; ukształtować IR (lowpass ~6-8 kHz, pre-delay 20-40 ms, dekorelacja kanałów) albo dołożyć krótkie pliki IR jako assety; wymusić 2 kanały w OfflineAudioContext, gdy reverb jest włączony.

### 19. Podgląd 'na żywo' w Studio nie zawiera reverbu — słyszysz inny efekt niż eksportujesz

`sredni` · `app/edit/studio/page.tsx:188` · znalezione przy weryfikacji

`setupPreviewChain` (188-237) tworzy compressor + lowShelf + midPeak + highShelf + gain i nic więcej; grep po `reverb|Convolver` w tym pliku daje wyłącznie suwak UI (1117-1125). Tymczasem `updatePreviewSettings` (240-262) w ogóle nie tyka reverbMix, a UI zapewnia: 'Slyszysz efekty w czasie rzeczywistym - zmieniaj ustawienia i sluchaj!' (linia ~940).

**Skutek dla użytkownika:** Użytkownik ustawia reverb na 30%, słyszy zero różnicy w podglądzie, uznaje że suwak nie działa — albo renderuje i dostaje nagranie brzmiące inaczej niż to, co odsłuchiwał. Podgląd przestaje być wiarygodnym narzędziem decyzyjnym.

**Naprawa:** Albo dodać ConvolverNode + dry/wet do łańcucha podglądu i aktualizować go w `updatePreviewSettings`, albo (prościej i uczciwiej) wyszarzyć suwak reverbu z etykietą 'tylko w renderze'. Docelowo jeden opis łańcucha DSP współdzielony przez preview i offline render.

### 20. Studio nie zwalnia AudioContextu ani blob URL-i — po kilku wejściach podgląd przestaje działać

`sredni` · `app/edit/studio/page.tsx:265` · znalezione przy weryfikacji

Wszystkie 5 `useEffect` w pliku (73, 80, 131, 265, 270) są bez cleanupu — nie ma `return () => audioContextRef.current?.close()`. Kontekst tworzony w `setupPreviewChain` (193) żyje po odmontowaniu strony. Równolegle `URL.createObjectURL` jest wołane w 6 miejscach (112, 157, 278, 313, 444, 505) i `revokeObjectURL` tylko raz, w `handleDownload` (342).

**Skutek dla użytkownika:** Każde wejście do Studio zostawia żywy AudioContext; przeglądarki limitują je do ~6 na kartę, więc po kilku przejściach Studio↔Biblioteka podgląd 'Efekty ON' cichnie/nie startuje (błąd tylko w konsoli), a pamięć rośnie o cały bufor audio na każdy wygenerowany URL.

**Naprawa:** Dodać `useEffect(() => () => { audioContextRef.current?.close(); ... }, [])` zwalniające kontekst, `pause()` na elementach audio i `revokeObjectURL` dla każdego utworzonego URL-a; trzymać URL-e w refie i zwalniać poprzedni przy każdej podmianie elementu audio.

### 21. Race w Studio: zatrzymanie nagrywania czyści świeżo nagrane audio, jeśli wcześniej była wybrana sesja

`sredni` · `app/edit/studio/page.tsx:557` · znalezione przy weryfikacji

`stopStudioRecording` (545-559) synchronicznie robi `setSelectedSessionId(null)` (557), a efekt z linii 131-139 na `!selectedSessionId` wykonuje `setOriginalAudio(null); setOriginalWaveform(null); setProcessedAudio(null)`. Wynik nagrania przychodzi dopiero w asynchronicznym `mediaRecorder.onstop` (491-526), który po `await getWaveformData(blob)` (499) woła `setOriginalAudio(blob)` i `setOriginalWaveform`.

**Skutek dla użytkownika:** Scenariusz: wczytaj nagranie z biblioteki, potem nagraj nowe i kliknij Stop — w zależności od tego, czy dekodowanie waveformu zdąży przed przebiegiem efektu, ekran wraca do stanu 'brak audio' albo pokazuje waveform bez możliwości odtworzenia. Nagranie jest bezpowrotnie tracone (nic go nie zapisuje).

**Naprawa:** Nie zerować `selectedSessionId` w `stopStudioRecording`; zamiast tego wprowadzić jedno źródło prawdy dla źródła audio (np. `audioSource: {kind:'session'|'recording'|'upload', ...}`) i czyścić stan tylko przy faktycznej zmianie wyboru sesji, nie jako efekt uboczny nagrywania.

### 22. Autozapis na desktopie: od drugiego nagrania czas trwania sesji zapisywany w milisekundach jako sekundy

`sredni` · `components/desktop-navigation.tsx:107` · znalezione przy weryfikacji

W gałęzi zapisu efekt robi `return () => clearTimeout(timer)` (104), więc linia 107 `wasRecordingRef.current = isRecording` NIE wykonuje się po zatrzymaniu — ref zostaje `true` na zawsze. Przy kolejnym starcie warunek `if (isRecording && !wasRecordingRef.current)` (81) nie przechodzi, więc `recordingStartTimeRef.current` pozostaje `null` (zerowane w 101), i przy stopie duration liczy się z fallbacku `: recordingDuration` (89) — a `recordingDuration` z hooka jest w MILISEKUNDACH (hooks/use-audio-recorder.ts:75-76 `const elapsed = Date.now() - startTimeRef.current; setRecordingDuration(elapsed)`).

**Skutek dla użytkownika:** Drugie i każde następne nagranie w tej samej sesji przeglądarki (bez zmiany strony) zapisuje się z czasem w rodzaju '208:20' zamiast '0:12'. Biblioteka, statystyki i ekran Progress liczą z tego bzdurne sumy czasu ćwiczeń.

**Naprawa:** Przenieść `wasRecordingRef.current = isRecording` na koniec efektu tak, by wykonywało się w każdej gałęzi (albo zapisać `isRecording` w refie osobnym efektem) i ujednolicić jednostkę: zawsze `Math.floor(recordingDuration / 1000)`.

### 23. sessionType liczony z nieistniejącej ścieżki '/training' — wszystkie sesje zapisują się jako 'live', filtr 'Trening' jest zawsze pusty

`sredni` · `components/desktop-navigation.tsx:91` · znalezione przy weryfikacji

`const sessionType = pathname.startsWith("/training") ? "training" : "live"` (91). Realne trasy treningowe to /train, /train/exercises, /train/game, /train/singalong (`find app -name page.tsx`), a app/training/* to wyłącznie stuby redirectujące (app/training/singalong/page.tsx:10 `router.replace("/train/singalong")`). Drugi zapisujący, save-session-dialog, jest wywoływany tylko z app/record/live/page.tsx:200 z `mode="live"`.

**Skutek dla użytkownika:** Żadna sesja w bazie nie ma nigdy trybu 'training' — zakładka 'Trening' w bibliotece (app/library/page.tsx:29-30) zawsze pokazuje 'Brak sesji', a ćwiczenia wykonane w /train są nieodróżnialne od swobodnego śpiewania w statystykach postępu.

**Naprawa:** Zmienić warunek na `pathname.startsWith("/train")` (i usunąć stuby /training albo dodać do nich rewrite), a najlepiej przekazywać tryb sesji jawnie z ekranu, który nagrywa, zamiast wnioskować go z URL-a w komponencie nawigacji.

### 24. Przycinanie do MAX_SESSIONS usuwa metadane, ale osierocone audio zostaje w IndexedDB na zawsze

`sredni` · `hooks/use-session-library.ts:85` · znalezione przy weryfikacji

`const trimmedSessions = updatedSessions.slice(0, MAX_SESSIONS)` (85) — wycięte sesje przepadają z localStorage bez wywołania `deleteSessionAudio` (import jest w linii 4 i używany wyłącznie w `deleteSession`, linia 143). Nagrania w IndexedDB są kluczowane po `sessionId` (lib/audio-storage.ts:34), więc bez wpisu w localStorage nie ma już do nich żadnej referencji.

**Skutek dla użytkownika:** Po przekroczeniu 50 sesji nagrania audio starszych sesji zostają w IndexedDB jako niewidoczne, nieusuwalne z UI śmieci (dziesiątki MB) — jedyne wyjście to 'Usun wszystko' (`clearAllSessions`, które kasuje całą bazę). Na telefonie prowadzi to do wyczerpania limitu storage i błędów zapisu nowych nagrań.

**Naprawa:** W `saveSession` policzyć różnicę `updatedSessions` vs `trimmedSessions` i dla każdej wypadającej sesji wywołać `deleteSessionAudio(id)`; dodatkowo przy starcie zrobić garbage collection: przejść klucze store'u i usunąć te, których nie ma w localStorage.

### 25. Historia pitchu przepisywana w całości 60 razy na sekundę — O(n²) alokacji i pełny re-render drzewa co klatkę

`sredni` · `hooks/use-audio-recorder.ts:68` · znalezione przy weryfikacji

`historyRef.current = [...historyRef.current, pitchData]` a zaraz po tym `setPitchHistory(historyRef.current)` (68-69), wewnątrz pętli `requestAnimationFrame` (78). Dodatkowo `setCurrentPitch` (67) i `setRecordingDuration(elapsed)` (76) w każdej klatce — a `pitchHistory` i `currentPitch` są w value contextu (contexts/audio-recorder-context.tsx:108-118), więc re-renderuje się wszystko pod providerem.

**Skutek dla użytkownika:** Po ~2 minutach śpiewania (kilka tysięcy próbek) kopiowanie tablicy rośnie kwadratowo: wizualizator zaczyna się zacinać, GC 'czka', telefon się grzeje i klatki spadają dokładnie wtedy, gdy dokładność detekcji jest najbardziej potrzebna. Ten sam wzorzec jest w karaoke (app/record/karaoke/page.tsx:156, ograniczony do 500 próbek).

**Naprawa:** Dopisywać przez `historyRef.current.push(pitchData)` i publikować do Reactu z throttlingiem (np. 10-15 Hz) albo trzymać dane w ring bufferze Float32Array i czytać je bezpośrednio w canvasie, bez przechodzenia przez stan Reacta. `recordingDuration` aktualizować z `setInterval(…, 200)`, nie w rAF.

**Warte zachowania z tego obszaru:**

- Offline'owy łańcuch obróbki wokalu: kompresor → low shelf 200Hz → peaking 1kHz → high shelf 3kHz → reverb (dry/wet) → output gain, renderowany w OfflineAudioContext i eksportowany do WAV 16-bit — lib/audio-processor.ts:144-225 — pełny graf plus audioBufferToWavBlob(); działa end-to-end: Przetworz Audio → Pobierz .wav
- Pięć presetów obróbki głosu z sensownymi wartościami (Podcast Voice, Studio Vocals, Warm Tone, Bright & Crisp, Clean & Natural) — lib/audio-processor.ts:36-117 — np. podcast: threshold -30, ratio 6, highShelf +3, reverb 5%
- Real-time preview efektów podczas odsłuchu w Studio (MediaElementSource → ten sam łańcuch → destination), z przełącznikiem Efekty ON/OFF — app/edit/studio/page.tsx:188-237 setupPreviewChain() + updatePreviewSettings() na zmianę suwaków
- Własny parser MIDI bez zależności zewnętrznych: tracki, kanały, tempo, note on/off, transpozycja, wykrywanie ścieżki perkusyjnej (kanał 9) — lib/midi-parser.ts:70-426 — parseMidiBuffer(), transposeMidi(); w UI heurystyka 'Melodia?' po nazwie ścieżki (components/sing-along.tsx:511-519)
- TimelineAnalysis — jedyna wizualizacja pitchu licząca czas WZGLĘDNIE do pierwszej próbki, więc poprawnie renderuje zapisane sesje — components/timeline-analysis.tsx:141,183 — `pitchHistory[len-1].timestamp - pitchHistory[0].timestamp` oraz `const startTime = pitchHistory[0].timestamp`
- Warstwa storage audio w IndexedDB z czystym API (saveSessionAudio/getSessionAudio/deleteSessionAudio/hasSessionAudio) — lib/audio-storage.ts:13-131 — klasa AudioStorageDB, keyPath sessionId; API jest przenośne, implementacja nie
- Miernik poziomu RMS + detekcja przesterowania w trakcie nagrania karaoke — app/record/karaoke/page.tsx:161-176 — rms, maxSample > 0.98 → ostrzeżenie 'Przesterowanie!'
- Per-track chain dla multitracku: 3-pasmowy EQ + volume + StereoPanner + automatyzacja przez setTargetAtTime (20ms smoothing) — lib/track-processor.ts:21-180 — createTrackProcessor(), applyAutomationAtTime()

**Duplikaty / martwy kod:**

- app/karaoke/page.tsx — pusty stub przekierowujący na /record/karaoke; grep po '/karaoke' w linkach i router.push: zero trafień, nic tam nie prowadzi
- app/sessions/page.tsx — stub redirect na /library, nic nie linkuje
- app/analysis/page.tsx — stub redirect na /library, nic nie linkuje
- app/training/singalong/page.tsx, app/training/game/page.tsx, app/training/exercises/page.tsx — trzy stuby redirect na /train/*, żywe są tylko wersje /train/*
- app/record/page.tsx — ekran wyboru trybu nagrywania (Na żywo / Karaoke), nieobecny w desktop-navigation ani mobile-navigation, nic go nie linkuje; jedyne wejście to wpisanie URL ręcznie
- components/session-library.tsx (401 linii) — kompletny widok biblioteki z porównywaniem dwóch sesji i odsłuchem; NIGDZIE nie renderowany, zastąpiony przez app/library/page.tsx + app/library/session/page.tsx
- components/audio-playback.tsx — importowany wyłącznie przez martwy session-library.tsx, więc również martwy; to jedyny komponent próbujący łączyć odsłuch z wizualizacją pitchu i przy okazji jedyny, w którym ta synchronizacja jest zaimplementowana (błędnie)
- components/training-hub.tsx — eksportuje TrainingHub, żaden plik go nie importuje; zawiera własną, drugą integrację SingAlong (linia 77) równoległą do app/train/singalong/page.tsx
- public/'A HA.Take on me K.mid', public/Aha_-_Take_On_Me.mid, public/'Nirvana - Smells Like Teen Spirit.mid' — pliki podkładów w repo, do których nic nie prowadzi (AVAILABLE_MIDI_FILES jest pustą tablicą)
- Dwie równoległe ścieżki zapisu sesji: autozapis w components/desktop-navigation.tsx:88 i jawny zapis przez components/save-session-dialog.tsx:38 — na desktopie wykonują się OBIE dla jednego nagrania
- Zduplikowana konwersja frequency→note+cents: app/record/karaoke/page.tsx:136-153 vs frequencyToNote() w lib/pitch-detector.ts
- Zduplikowana pętla analizy rAF + pomiar RMS: app/record/karaoke/page.tsx:118-179 vs hooks/use-audio-recorder.ts:31-79
- Zduplikowany łańcuch kompresor+EQ: lib/audio-processor.ts:144-191 (offline, do renderu) vs app/edit/studio/page.tsx:201-229 (realtime, do preview) — dwie niezależne kopie tej samej topologii, które mogą się rozjechać
- Trzeci, częściowo pokrywający się łańcuch EQ w lib/track-processor.ts:28-44 z innymi częstotliwościami granicznymi (320/1000/3200 Hz) niż audio-processor (200/1000/3000 Hz)
- hooks/use-sing-along.ts:271-275 processNoPitch() — funkcja z pustym ciałem i komentarzem 'Will be handled by the silence timeout', eksportowana i nieużywana
- Filtr 'Karaoke' w app/library/page.tsx:32 — mapuje na mode === 'analysis', którego żaden kod nigdy nie zapisuje

---

## Edytor / studio multitrack (fundament pod filar PODCAST)

> To nie jest edytor, to demo timeline'u. Realnie dziala: schedulowanie klipow przez AudioBufferSourceNode.start(when, offset, duration) na zegarze AudioContext (a wiec sample-accurate w zamysle), niedestrukcyjny model danych (AudioSource + AudioClip z trimStart/trimEnd), mute/solo, volume/pan, EQ 3-pasmowy i rysowanie krzywych automatyki. Nie dziala albo nie istnieje: eksport calego projektu (jedyny kod eksportu, MultiTrackEngine.exportMix, jest osiagalny wylacznie z martwego komponentu multi-track-manager.tsx i i tak ignoruje klipy, EQ i automatyke), undo/redo (zero w timeline; w InteractiveWaveform undo jest gorsze niz brak - kasuje audio bezpowrotnie i przy drugim ciecu niszczy zle miejsce), split, fade, crossfade, usuwanie klipow, loop, scrub. Do tego trzy niezalezne bledy geometrii sprawiaja, ze playhead, linijka czasu i klipy fizycznie nie pokrywaja sie na ekranie (offset 160px + podwojne odejmowanie scrollX), a seek po pauzie odtwarza z zupelnie innego miejsca niz pokazuje playhead. Persystencja to IndexedDB gdzie blob audio siedzi w tym samym rekordzie co metadane, bez migracji, bez navigator.storage.persist(), bez kasowania osieroconych zrodel - czyli realny scenariusz utraty projektu i niekontrolowanego puchniecia bazy. Wydajnosciowo sciezka 60-minutowa jest poza zasiegiem: pelny dekod do RAM (~1,4 GB dla 48 kHz stereo), waveform o stalej rozdzielczosci 1000 probek (3,6 s na piksel danych) i canvas szerokosci 720 000 px device (limit Chrome to 65 535 - waveform po prostu znika). Nic specyficznego dla podcastu nie istnieje: jedyna funkcja duckingu (createDuckCurve) nie jest nigdzie wywolywana.

**Werdykt: rewrite** — Silnik i warstwa UI ida do przepisania, model danych zostaje. Argumenty za przepisaniem: (1) brak undo/redo w timeline to definicyjny blocker edytora - dokladanie go do obecnej architektury (kazda mutacja to bezposredni await do IndexedDB rozsiany po 8 handlerach w multi-track-timeline.tsx) wymaga i tak przebudowy calego przeplywu stanu na command pattern / reducer; (2) brak eksportu w zywej sciezce oznacza, ze produkt nie ma wyjscia - a jedyny istniejacy renderer (mixToBuffer) operuje na zlym kluczu (trackBuffers po track.id, gdy timeline zapisuje po source.id), ignoruje klipy, EQ i automatyke, wiec nie ma czego naprawiac, tylko napisac; (3) automatyka sterowana requestAnimationFrame + setTargetAtTime jest architektonicznie nie do uratowania - poprawne jest zaplanowanie rampy z gory (linearRampToValueAtTime / setValueCurveAtTime), co jest inna klasa rozwiazania; (4) geometria timeline'u (trzy niezalezne bledy offsetu) wskazuje, ze layout "header 160px w tym samym flex-row co scrollowana zawartosc" jest bledny u podstaw i wymaga rozdzielenia na kolumne headerow + osobny viewport. Co zostaje bez zmian: interfejsy AudioClip / AudioSource / Track / AutomationLane (multi-track-storage.ts:18-99), cala matematyka interpolacji automatyki (automation.ts:62-162, czyste funkcje bez Web Audio), topologia channel stripa (track-processor.ts:21-75) i szablony projektow (project-templates.ts:36-130). To ~15% kodu obszaru, ale to akurat ta czesc, ktora przenosi sie na natywne 1:1.

### 26. Brak jakiegokolwiek undo/redo w edytorze multitrack

`KRYTYCZNY` · `components/timeline/multi-track-timeline.tsx:262` · potwierdzone

Grep po 'undo|redo|history|snapshot' w components/timeline/* i app/edit/* - zero trafien. Handlery mutuja natychmiast i bez zapisu stanu poprzedniego: :269 `await updateClip(clipId, { startTime: snappedTime })`, :286 `await updateClip(clipId, { trimStart, trimEnd })`, :492 `await removeTrackFromProject(trackId)`. Jedyne onKeyDown w repo to inputy tekstowe (app/edit/projects/page.tsx:407 - nazwa projektu, components/save-session-dialog.tsx:103, components/session-library.tsx:318), zadnych skrotow transportu/edycji.

*Weryfikator:* Potwierdzone. MultiTrackTimeline jest ZYWY (app/edit/projects/page.tsx:183), wiec to nie martwy kod. Jedyne zabezpieczenie to confirm() przy usuwaniu sciezki (:482) - dla przesuniecia i trimu nie ma nic. Numer linii z raportu poprawny.

### 27. Nie da sie wyeksportowac projektu multitrack - jedyny renderer jest martwym kodem i tak by nie zadzialal

`KRYTYCZNY` · `lib/multi-track-engine.ts:373` · potwierdzone

mixToBuffer (:373) / exportMix (:423) maja jedyne wywolanie w components/multi-track-manager.tsx:177. Grep 'MultiTrackManager' po calym repo zwraca tylko wlasna definicje (multi-track-manager.tsx:18 i :23) - komponent nigdzie nie importowany. W zywej sciezce (app/edit/projects/page.tsx) nie ma zadnego przycisku eksportu; `Download` jest zaimportowany w multi-track-timeline.tsx:5 i nieuzyty w JSX. Nawet po podpieciu: :392 `const buffer = this.trackBuffers.get(track.id)` - w trybie klipowym trackBuffers jest kluczowany po source.id (:492 `this.trackBuffers.set(source.id, audioBuffer)`), wiec `continue` dla kazdej sciezki -> pusty bufor. Dodatkowo mixToBuffer ignoruje clip.startTime/trimStart/trimEnd, EQ (brak createBiquadFilter) i automatyke, a duration bierze z getDuration() (:316, max dlugosc bufora, nie koniec ostatniego klipu).

*Weryfikator:* Potwierdzone w calosci, w tym trafna diagnoza rozjazdu kluczy trackBuffers. TrackControls (components/track-controls.tsx) jest martwy z tego samego powodu - uzywany tylko przez MultiTrackManager:447.

### 28. Playhead, linijka czasu i klipy nie pokrywaja sie na ekranie - bledy geometrii (faktycznie cztery, nie trzy)

`KRYTYCZNY` · `components/timeline/multi-track-timeline.tsx:606` · potwierdzone

(1) Playhead renderowany WEWNATRZ przewijanego kontenera (viewportRef :587-589 overflow-auto -> inner div :598 width=duration*pps -> Playhead :606) i sam odejmuje scroll: playhead.tsx:17 `const xPosition = currentTime * pixelsPerSecond - scrollX` -> efektywna pozycja t*pps - 2*scrollX; przy wiekszym scrollu xPosition < -10, wiec playhead.tsx:20/50 zwraca null i kreska w ogole znika. (2) TrackLane trzyma naglowek 160 px w tym samym flex-row co zawartosc (track-lane.tsx:75-83 `style={{ width: trackHeaderWidth }}`, trackHeaderWidth=160 :66), a content ma `minWidth: duration*pixelsPerSecond` (:201) - wiec klip o t=0 zaczyna sie na x=160 wewnatrz warstwy, w ktorej playhead t=0 rysuje sie na x=0. (3) AutomationLane przesuwa swoje SVG dodatkowo o -scrollX (automation-lane.tsx:168 `style={{ left: -scrollX }}`) mimo ze siedzi w tym samym przewijanym kontenerze - krzywe odjezdzaja od klipow po kazdym scrollu. (4) TimeRuler jest POZA kontenerem przewijanym (multi-track-timeline.tsx:576-583) i liczy x od wlasnego lewego brzegu (time-ruler.tsx:52, :92), czyli od x=0, a nie od x=160 gdzie zaczynaja sie klipy - klikniecie w linijke seekuje o 160/pps sekundy obok (1,6 s przy domyslnym zoomie 100 px/s). Do tego drag playheada liczy czas z surowego e.clientX (playhead.tsx:33 `(e.clientX + scrollX - dragOffsetRef.current)/pixelsPerSecond`), ignorujac offset kontenera w oknie - blad rowny szerokosci lewej nawigacji + 160 px.

*Weryfikator:* Potwierdzone, z uzupelnieniem: audytor wymienil 3 bledy, sa 4 niezalezne (dodatkowo TimeRuler/x=0 i drag po clientX). Wszystkie linie sprawdzone i poprawne.

### 29. AudioContext nigdy nie jest wznawiany - odtwarzanie moze w ogole nie ruszyc (pewne na iOS/Safari)

`KRYTYCZNY` · `lib/multi-track-engine.ts:32` · potwierdzone

Konstruktor: :30-36 `this.audioContext = new AudioContext()` + masterGain, wolany z useEffect na montowaniu komponentu (multi-track-timeline.tsx:69), czyli przed jakimkolwiek gestem. W calym multi-track-engine.ts nie ma slowa `resume` (grep). play() (:128) i playClips() (:502) tylko czytaja `this.audioContext.currentTime` i wolaja source.start() - jesli kontekst jest 'suspended', currentTime stoi, klipy sa zaplanowane, ale nic nie leci i getCurrentTime() zwraca stala. Inne sciezki w repo o tym pamietaja: app/edit/studio/page.tsx:367-370 (`if (state === 'suspended') await resume()`), components/metronome.tsx:111.

*Weryfikator:* Potwierdzone, cytaty i linie zgodne. Dodatkowo brak nasluchu na `statechange`, wiec nie ma nawet diagnostyki - UI pokazuje 'Pause' i zamrozony czas.

### 30. Undo w edytorze pojedynczej sciezki kasuje audio bezpowrotnie, a drugie ciecie niszczy zly fragment

`KRYTYCZNY` · `components/interactive-waveform.tsx:206` · potwierdzone

applyEditsToAudio bierze zrodlo z aktualnie zaladowanego bufora: :209 `const audioBuffer = wavesurferRef.current.getDecodedData()`, a offsety liczy z akumulowanej listy `regions` w czasie ORYGINALU (:243-244 `Math.floor(region.start * sampleRate)`). Po pierwszym ciecu onAudioEdited -> app/edit/studio/page.tsx:430 `setOriginalAudio(editedBlob)` -> prop audioBlob zmienia tozsamosc -> useEffect [audioBlob, color, height] (:47, :160) przeladowuje WaveSurfera na juz przycietym audio, ale stany deletedRegions/editHistory/historyIndex NIE sa resetowane (brak key={} na komponencie, app/edit/studio/page.tsx:905-910). Drugie ciecie wola applyEditsToAudio([region1, region2]) na buforze, z ktorego region1 zostal juz usuniety -> wycina material przesuniety o dlugosc region1. undo (:326-340) robi to samo w druga strone: applyEditsToAudio(newDeletedRegions) na SKROCONYM buforze; przy pustej liscie newDuration = audioBuffer.duration - 0 = obecna dlugosc, wiec przepisuje 1:1 - nic nie przywraca, a original blob nie jest nigdzie trzymany.

*Weryfikator:* Potwierdzone lacznie z wiring w studio (:430 i :905-910). Dodatkowo: deletedRegions nie jest czyszczone tez przy zmianie sesji/pliku (setOriginalAudio w :105, :150, :497, :588), wiec regiony z poprzedniego nagrania zostaja zaaplikowane do nowego.

### 31. Zapis do IndexedDB na kazde zdarzenie scrolla i na kazdy mousemove przeciagania klipu

`wysoki` · `components/timeline/multi-track-timeline.tsx:590` · potwierdzone

onScroll (:590-596) -> updateLocalTimelineState (:241-245) -> multi-track-storage.ts:699 updateTimelineState = getProject (txn readonly) + saveProject (txn readwrite) + `project.updatedAt = Date.now()` (:710) - dwie transakcje na kazde zdarzenie scrolla, plus setTimelineState -> re-render wszystkich TrackLane/AudioClip/AutomationLane. To samo przy drag klipu: audio-clip.tsx:128-134 handleMouseMove -> onUpdatePosition na kazdy ruch myszy -> multi-track-timeline.tsx:269 -> multi-track-storage.ts:690-696 updateClip = getClip + saveClip, bez debounce i bez czekania na poprzedni zapis. Zaden z tych zapisow nie jest anulowany/serializowany, wiec read-modify-write moga sie przeplatac.

*Weryfikator:* Potwierdzone. Uwaga: to samo dotyczy handleSelectClip (:259) - zwykle klikniecie w klip robi zapis projektu. Powazniejszy skutek tego samego wzorca opisalem osobno w 'missed' (kasowanie pola przy trimie lewej krawedzi).

### 32. Sciezka 60-minutowa jest poza zasiegiem - pelny dekod do RAM plus trzykrotny dekod przy imporcie

`wysoki` · `lib/multi-track-engine.ts:491` · potwierdzone

:490-492 `const arrayBuffer = await source.audioBlob.arrayBuffer(); const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer); this.trackBuffers.set(source.id, audioBuffer)` - caly plik w pamieci, mapa nigdy nie czyszczona poza loadTracks()/dispose() (:90, :359). Rachunek 60 min / 48 kHz / stereo Float32: 172 800 000 ramek x 2 x 4 B = 1,38 GB - zgadza sie. Import dekoduje ten sam plik dwa razy synchronicznie: multi-track-timeline.tsx:309 generateWaveformData -> multi-track-storage.ts:716-718 (nowy AudioContext + decodeAudioData) oraz :312 createAudioSource -> multi-track-storage.ts:640-644 (kolejny nowy AudioContext + decodeAudioData), trzeci raz przy pierwszym play (engine :491).

*Weryfikator:* Potwierdzone, arytmetyka poprawna. Oba pomocnicze konteksty sa zamykane (:644, :735), wiec to nie wyciek kontekstow, ale peak RAM przy imporcie to ~3x rozmiar zdekodowanego audio.

### 33. Waveform ma stala rozdzielczosc 1000 probek niezaleznie od dlugosci pliku

`wysoki` · `lib/multi-track-storage.ts:715` · potwierdzone

:715 `export async function generateWaveformData(audioBlob: Blob, samples: number = 1000)`, wywolanie multi-track-timeline.tsx:309 `generateWaveformData(blob, 1000)`. Usredniana jest wartosc bezwzgledna bloku (:729 `sum += Math.abs(channelData[index])`, :732 `waveform.push(sum / blockSize)`) - brak pary min/max, wiec transjenty i pauzy sa rozmyte i amplituda systematycznie zanizona. Brak jakiegokolwiek cache peakow w wielu rozdzielczosciach: audio-clip.tsx:61-79 przy kazdym zoomie interpoluje te sama tablice 1000 wartosci (`samplesPerPixel = waveform.length / (source.duration * pixelsPerSecond)`, :62). Dla 60 min to 3,6 s audio na punkt.

*Weryfikator:* Potwierdzone. Ten sam wzorzec w lib/audio-processor.ts:311-333 (getWaveformData, tez 1000 probek, tez srednia abs).

### 34. Canvas waveformu przekracza maksymalny rozmiar canvasu przegladarki - i to juz przy klipie 5,5-minutowym

`wysoki` · `components/timeline/audio-clip.tsx:53` · potwierdzone

:39-41 `visualDuration = clip.duration - trimStart - trimEnd`, `width = visualDuration * pixelsPerSecond`; :51-54 `const dpr = window.devicePixelRatio || 1; canvas.width = width * dpr`. Limit jednego wymiaru canvasu (Chrome/Safari) to 65535 px, wiec warunek to visualDuration <= 65535/(pps*dpr). Przy domyslnym zoomie 100 px/s i dpr=2 (multi-track-timeline.tsx:39 pixelsPerSecond: 100) granica wypada na 327 s, czyli 5,5 MINUTY klipu. Przy maksymalnym zoomie 1000 px/s (:232) - 33 sekundy. Canvas jest przerysowywany w calosci przy kazdej zmianie zoomu (effect deps [clip, source, trackColor, isMuted, width, pixelsPerSecond], :82).

*Weryfikator:* Potwierdzone, ale liczby audytora byly zle: podal prog '32,7 minuty przy minimalnym zoomie' - faktycznie przy min. zoomie 10 px/s (:237) prog to 32767/10 = 3276 s = 54,6 min, a przy DOMYSLNYM zoomie tylko 5,5 min. Czyli problem jest znacznie gorszy niz w zgloszeniu: dowolny odcinek podcastu ma niewidoczny waveform bez recznego wyzoomowania.

### 35. Automatyka jest sterowana requestAnimationFrame zamiast harmonogramem AudioParam - zamarza w tle

`wysoki` · `lib/multi-track-engine.ts:200` · potwierdzone

startAutomationLoop (:200-241) wola applyAutomationAtTime co klatke rAF (:237 `this.automationFrameId = requestAnimationFrame(updateAutomation)`), a ta ustawia parametry przez track-processor.ts:167-178 `setTargetAtTime(..., audioContext.currentTime, 0.02)`. Konsekwencje realne: (a) rAF jest zatrzymywany/throttlowany w nieaktywnej zakladce, a audio leci dalej - automatyka zamarza na ostatniej wartosci (muzyka zostaje przyduszona albo nie zostaje przyduszona do konca odcinka); (b) rozdzielczosc automatyki = klatka (~16 ms) i zalezy od obciazenia GPU/CPU, brak lookahead scheduling, wiec nie jest to sample-accurate; (c) ta sama logika nie ma zadnego odpowiednika offline - kazdy przyszly renderer eksportu bedzie musial byc napisany od zera, bo automatyka nie jest opisana jako lista zdarzen AudioParam; (d) automatyka nie jest aplikowana wcale gdy nie gra (petla startuje tylko w play/playClips), wiec suwaki/podglad nie odzwierciedlaja krzywej.

*Weryfikator:* Architektura potwierdzona, ale mechanizm w zgloszeniu jest CZESCIOWO BLEDNY: teza 'setTargetAtTime nigdy nie dochodzi do wartosci zadanej, ustawisz -18 dB uslyszysz -12' jest nieprawdziwa. Kazde wywolanie startuje wykladnicze dazenie od BIEZACEJ wartosci, przy tau=20 ms i kroku 16,7 ms pozostaly blad maleje o czynnik e^-0.83 ~ 0,43 na klatke, wiec parametr zbiega do celu z opoznieniem rzedu ~20-30 ms, a nie z trwalym offsetem. Potwierdzam finding za punkty (a)-(d), nie za matematyke zbieznosci.

### 36. Ukrycie lane'a automatyki wylacza automatyke, a automatyka EQ nie dziala gdy processing.enabled=false

`wysoki` · `lib/track-processor.ts:132` · potwierdzone

:131-132 `for (const lane of automationLanes) { if (!lane.visible || lane.points.length === 0) continue` - flaga widocznosci UI jest wlacznikiem przetwarzania. Toggle w UI ustawia wlasnie to pole: track-lane.tsx:157 `onToggleAutomationLane?.(lane.id, !lane.visible)` -> multi-track-timeline.tsx:440 `updateAutomationLane(laneId, { visible })`. Osobno :175 `if (baseProcessing?.enabled)` obudowuje aplikowanie eqLow/eqMid/eqHigh, wiec lane EQ na sciezce z processing.enabled=false jest cicho ignorowany - dokladnie taka sciezka jest w szablonie Muzyka (project-templates.ts:96-105: 'Instrumenty' enabled:false). Szablon Podcast tworzy lane volume na sciezce Glos z `visible: false` (project-templates.ts:54) i lane eqMid na Muzyce tla z `visible: false` (:68) - automatyka istnieje w bazie i nie robi nic.

*Weryfikator:* Potwierdzone w calosci; wszystkie cytowane linie zgodne. Sciezka szablonow jest zywa (app/edit/projects/page.tsx:77 createProjectFromTemplate).

### 37. Snap wymuszony na 1 sekunde bez mozliwosci wylaczenia, i desynchronizuje trim od pozycji klipu

`wysoki` · `components/timeline/multi-track-timeline.tsx:263` · potwierdzone

:264-266 `const snappedTime = timelineState.snapEnabled ? Math.round(startTime / timelineState.snapInterval) * timelineState.snapInterval : startTime`, przy defaultach snapEnabled:true / snapInterval:1 (multi-track-timeline.tsx:42-43 oraz multi-track-storage.ts:489-490). Grep po 'snapEnabled|snapInterval' w app+components: wystepuja tylko w definicji typu, w defaultach i w tej jednej linii - zero UI do przelaczenia. Trim lewej krawedzi wola OBIE funkcje w tym samym mousemove (audio-clip.tsx:162-163 `onUpdateTrim(clip.id, newTrimStart, clip.trimEnd); onUpdatePosition(clip.id, newStartTime)`), przy czym trimStart NIE jest snapowany a startTime jest -> tresc audio przesuwa sie wzgledem obrazu o roznice (do 0,5 s).

*Weryfikator:* Potwierdzone. Przy okazji: loopEnabled/loopStart/loopEnd (multi-track-storage.ts:65-67) tez nigdy nie sa czytane - petla odtwarzania to martwe pole w schemacie.

### 38. Usuwanie projektu i sciezki zostawia osierocone bloby audio, klipy i lane'y automatyki

`wysoki` · `lib/multi-track-storage.ts:214` · potwierdzone

deleteProject (:214-236) iteruje sciezki i wola `this.deleteTrack(track.id)` (:222), a deleteTrack (:283-294) usuwa WYLACZNIE rekord z TRACKS_STORE. Nie jest ruszany AUDIO_SOURCES_STORE (pelne bloby), CLIPS_STORE ani AUTOMATION_LANES_STORE. removeTrackFromProject (:587-602) usuwa lane'y automatyki (:599) i sciezke, ale nie usuwa klipow tej sciezki. Brak licznika referencji i garbage collectora; deleteAudioSource (:337) i deleteClip (:395) nie maja ZADNEGO wywolania w repo (grep).

*Weryfikator:* Potwierdzone i gorsze niz w zgloszeniu: deleteProject korzysta z deleteTrack, a nie z removeTrackFromProject, wiec zostawia rowniez lane'y automatyki - osierocone sa wszystkie cztery magazyny poza projects/tracks.

### 39. Stan transportu w React rozjezdza sie z silnikiem - po koncu odtwarzania playhead skacze na 0, przycisk zostaje na 'Pause', petla rAF kreci sie w nieskonczonosc

`wysoki` · `components/timeline/multi-track-timeline.tsx:173` · znalezione przy weryfikacji

Silnik sam sie zatrzymuje po zakonczeniu ostatniego klipu: lib/multi-track-engine.ts:614-619 `sourceNode.onended = () => { this.trackSources.delete(...); if (this.trackSources.size === 0 && this.isPlaying) this.stop() }`, a stop() ustawia isPlaying=false, pausedAt=0, startTime=0 (:294-297). Nie ma zadnego callbacku do Reacta - `isPlaying` w komponencie zostaje true. Petla updateTime (:173-178) dalej dziala i wola `setCurrentTime(engineRef.current.getCurrentTime())`, a getCurrentTime() dla !isPlaying && !isPaused zwraca 0 (:303-312). Symetryczny przypadek: playClips z clipsPlaying===0 (np. seek za ostatni klip, :586 `if (offset > clipEndInTimeline) continue`) nie ustawia isPlaying w silniku (:624), ale handlePlay bezwarunkowo robi setIsPlaying(true) (:204).

**Skutek dla użytkownika:** Po dojechaniu do konca projektu czerwona kreska skacze na poczatek, licznik pokazuje 0:00, a przycisk nadal mowi 'Pause'. Nastepne klikniecie wola engine.pause(), ktore wychodzi na wejsciu (`if (!this.isPlaying) return`) i tylko gasi UI - pozycja odsluchu jest bezpowrotnie tracona, uzytkownik musi seekowac od nowa po kazdym odsluchu. Do tego rAF kreci sie caly czas w tle (bateria, zacinanie).

**Naprawa:** Dodac do MultiTrackEngine callback stanu (onEnded/onStateChange) wywolywany z stop()/onended i podpiac go w komponencie (setIsPlaying(false), pozostawiajac currentTime na koncu projektu). handlePlay powinien ustawiac isPlaying na podstawie zwrotki playClips (np. liczby zaplanowanych klipow), a nie bezwarunkowo. Docelowo: jedno zrodlo prawdy o transporcie (silnik) i selektor stanu w React, nie dwie kopie.

### 40. W zywym edytorze nie ma zadnego miksera - brak faderow volume, pan i EQ; jedyne UI z nimi to martwy kod, master volume nie jest w ogole aplikowany

`wysoki` · `components/timeline/track-lane.tsx:99` · znalezione przy weryfikacji

TrackLane renderuje wylacznie 4 przyciski: mute, solo, panel automatyki, delete (:100-142) - onUpdateTrack jest wolane tylko z `{ mute: ... }` (:101) i `{ solo: ... }` (:113). Jedyny komponent z suwakami volume/pan (components/track-controls.tsx) jest importowany tylko przez martwy components/multi-track-manager.tsx:5/:447. Nie ma zadnego UI do processing.eqLow/eqMid/eqHigh (grep 'eqLow' w components: tylko track-processor/automation/templates). project.masterVolume nie jest nigdzie aplikowany w zywej sciezce - engine.setMasterVolume (lib/multi-track-engine.ts:121) ma jedyne wywolanie w multi-track-manager.tsx:162.

**Skutek dla użytkownika:** Silnik ma volume, pan i 3-pasmowy EQ na sciezke, ale uzytkownik nie moze ich ruszyc: wartosci pochodzaj wylacznie z szablonu projektu (project-templates.ts) i pozostaja stale na zawsze. Jedyny sposob zmiany glosnosci sciezki to narysowanie krzywej automatyki. Master volume zapisany w projekcie jest ignorowany. Praktycznie: to nie jest mikser, tylko przelacznik mute/solo.

**Naprawa:** Przeniesc do TrackLane (albo do wysuwanego panelu sciezki) kontrolki volume/pan/EQ - handleUpdateTrack w multi-track-timeline.tsx:447 juz obsluguje dowolne Partial<Track> i propaguje volume/pan do silnika (:463-470), wiec brakuje tylko UI plus obslugi `processing`. Dodac aplikowanie project.masterVolume przy inicjalizacji silnika. TrackControls albo podlaczyc, albo usunac zeby nie mylil.

### 41. Punkty automatyki lądują w zlym czasie gdy timeline jest przewiniety - podwojna kompensacja scrollX

`wysoki` · `components/timeline/automation-lane.tsx:71` · znalezione przy weryfikacji

SVG lane'a jest juz przesuniete o -scrollX (:168 `style={{ left: -scrollX }}`), a jednoczesnie handlery liczace czas z pozycji myszy dodaja scrollX jeszcze raz: :70-74 `const rect = svgRef.current.getBoundingClientRect(); const x = e.clientX - rect.left + scrollX; const time = x / pixelsPerSecond` (i identycznie :84-88 dla tooltipa hover). Poniewaz rect.left to juz lewa krawedz przesunietego SVG, `e.clientX - rect.left` daje wspolrzedna lokalna SVG (czyli poprawne t*pps dla narysowanego punktu) - dodanie scrollX przesuwa wynik o scrollX/pixelsPerSecond sekund.

**Skutek dla użytkownika:** Po przewinieciu o 500 px przy 100 px/s klikniecie w krzywa dodaje punkt 5 sekund dalej niz w miejscu klikniecia, a etykieta wartosci pod kursorem pokazuje czas z tym samym bledem. Ducking narysowany na przewinietym widoku wchodzi w zlym momencie - i uzytkownik nie ma powodu podejrzewac scrolla.

**Naprawa:** Usunac `+ scrollX` z automation-lane.tsx:71 i :86 (getBoundingClientRect juz uwzglednia i scroll kontenera, i inline left), albo - lepiej - usunac inline `left: -scrollX` z SVG (:168) i wszystkie recznie liczone offsety scrolla z warstw wewnatrz przewijanego kontenera (to naprawia rownoczesnie finding #3).

### 42. Konwersja do WAV buduje tablice JS z kazdej probki - ~8-krotny narzut pamieci i zamrozenie watku glownego przy eksporcie

`wysoki` · `lib/audio-processor.ts:262` · znalezione przy weryfikacji

Ten sam wzorzec w trzech miejscach, w tym w zywej sciezce studio: lib/audio-processor.ts:262-271 `const data = []` + `data.push(pcmSample)` dla kazdego sample'a kazdego kanalu, potem drugi przebieg :294-297; components/interactive-waveform.tsx:281-289 (uzywane po kazdym ciecu); lib/multi-track-engine.ts:438-446. Do tego `audioBuffer.getChannelData(channel)` jest wolane WEWNATRZ petli po probkach (audio-processor.ts:265, interactive-waveform.tsx:284, multi-track-engine.ts:441) - jedno wywolanie Web IDL na probke. Dla 10 min stereo 48 kHz: 57,6 mln elementow w packed-double array (~460 MB) + 115 MB ArrayBuffer, wszystko synchronicznie na watku UI. processAudio jest wolane z app/edit/studio/page.tsx:306, wiec to zywa sciezka.

**Skutek dla użytkownika:** Przy nagraniu dluzszym niz kilka minut 'Przetworz' / kazde ciecie zamraza karte na kilkanascie sekund albo wywala ja na OOM. Na iOS/Safari (limit pamieci karty ~1-1,5 GB) padnie przy nagraniu rzedu 5-10 minut - czyli przy typowym odcinku podcastu jest to nieprzejezdne.

**Naprawa:** Pisac wprost do Int16Array/DataView w jednym przebiegu, o rozmiarze policzonym z gory (`new Int16Array(length * channels)`), z `getChannelData(ch)` pobranym RAZ przed petla po probkach. Docelowo przeniesc konwersje i eksport do Web Workera i strumieniowac chunkami (Blob z tablicy fragmentow), zeby nie blokowac UI - ta sama logika przeklada sie 1:1 na natywne (AVAudioFile / MediaCodec).

### 43. Trim lewej krawedzi wysyla dwa rownolegle read-modify-write na TEN SAM rekord klipu - jedno pole nadpisuje drugie stara wartoscia

`wysoki` · `components/timeline/audio-clip.tsx:162` · znalezione przy weryfikacji

:162-163 w handleMouseMove trimu lewej krawedzi: `onUpdateTrim(clip.id, newTrimStart, clip.trimEnd)` i natychmiast `onUpdatePosition(clip.id, newStartTime)` - oba bez await. Kazde z nich trafia do multi-track-storage.ts:690-696 updateClip, ktore robi `const clip = await multiTrackStorage.getClip(clipId)` a potem `saveClip({...clip, ...updates})`. Obie operacje czytaja TEN SAM stary rekord (bo pierwszy zapis jeszcze nie wrocil) i kazda zapisuje pelny obiekt - ta, ktora skonczy druga, przywraca stara wartosc pola ustawionego przez pierwsza. Nie ma zadnej serializacji, kolejki ani transakcji obejmujacej oba pola.

**Skutek dla użytkownika:** Lokalny stan Reacta pokazuje poprawny wynik trimu, ale w IndexedDB zostaje albo nowy trimStart ze starym startTime, albo odwrotnie. Po przeladowaniu projektu klip jest przesuniety wzgledem tego, co uzytkownik widzial przed zamknieciem - z perspektywy uzytkownika projekt 'sam sie rozjezdza' po ponownym otwarciu, i to wlasnie na cieciach, ktore sa sensem edytora.

**Naprawa:** Jedna operacja domenowa = jeden zapis: dodac `updateClip(clipId, { trimStart, startTime })` wolane raz (albo callback onTrimLeft(clipId, trimStart, startTime)). Ogolnie: zapisy klipow powinny iss przez pojedyncza kolejke/mutex per rekord, a persystencja przeciagania - dopiero na mouseup (patrz confirmed #7).

### 44. Nie ma zadnego sposobu usuniecia klipu ani zaimportowanego zrodla audio - deleteClip i deleteAudioSource nie maja wywolan

`wysoki` · `lib/multi-track-storage.ts:395` · znalezione przy weryfikacji

Grep 'deleteClip' i 'deleteAudioSource' po calym repo: jedyne trafienia to definicje w lib/multi-track-storage.ts:395 i :337. W multi-track-timeline.tsx nie ma handlera usuwania klipu (jedyne akcje na klipie: select :247, position :262, trim :284), nie ma splitu/ciecia klipu, nie ma nasluchu klawisza Delete. Jedyna destrukcyjna akcja to usuniecie calej sciezki (:478), ktore i tak nie usuwa jej klipow (removeTrackFromProject, multi-track-storage.ts:587-602).

**Skutek dla użytkownika:** Kazdy pomylkowo zaimportowany plik zostaje w projekcie i w IndexedDB na zawsze; jedyny sposob to usuniecie calej sciezki (a i wtedy blob zostaje w bazie). Bez usuwania i dzielenia klipow montaz odcinka jest fizycznie niemozliwy - to razem z brakiem eksportu (confirmed #2) domyka obraz: material mozna tylko dodawac.

**Naprawa:** Dodac akcje na klipie: delete (z wywolaniem storage.deleteClip + aktualizacja track.clips), split w playheadzie (dwa klipy z trimStart/trimEnd - model danych to juz obsluguje), oraz GC zrodel bez referencji (index audioSourceId w CLIPS_STORE juz istnieje, multi-track-storage.ts:157 - wystarczy count() po indeksie przed deleteAudioSource).

### 45. Kazda edycja automatyki przeladowuje z IndexedDB wszystkie sciezki, klipy i PELNE bloby audio

`sredni` · `components/timeline/multi-track-timeline.tsx:356` · znalezione przy weryfikacji

handleAddAutomationPoint (:360), handleDeleteAutomationPoint (:407), handleAutomationCurveChange (:420), handleCreateAutomationLane (:433), handleToggleAutomationLane (:441) - kazdy konczy sie `await loadTracks()`. loadTracks (:101-138) czyta wszystkie sciezki, dla kazdej wszystkie klipy i lane'y, a dla kazdego klipu `multiTrackStorage.getAudioSource(clip.audioSourceId)` (:122) - a AudioSource zawiera pole audioBlob z calym plikiem (multi-track-storage.ts:44). Przy okazji nadpisuje `duration` (:137) i podmienia mapy sources/clips, wiec re-renderuje cala liste.

**Skutek dla użytkownika:** Dodanie jednego punktu duckingu w projekcie z dwoma 30-minutowymi plikami odczytuje z bazy kilkaset MB blobow i przycina UI na kilkaset ms - przy rysowaniu krzywej (kilkadziesiat punktow) edytor staje sie bezuzyteczny.

**Naprawa:** Aktualizowac tylko stan automationLanes lokalnie (wzorzec z handleMoveAutomationPoint, :373-390 juz to robi poprawnie) i nie wolac loadTracks po operacjach na automatyce. Docelowo rozdzielic metadane od blobow: trzymac blob w osobnym magazynie i pobierac go wylacznie przy dekodowaniu, nigdy do stanu React.

### 46. Wycieki blob URL w studio - kazda edycja i kazde przetworzenie pinuje kolejna kopie audio w pamieci karty

`sredni` · `app/edit/studio/page.tsx:444` · znalezione przy weryfikacji

URL.createObjectURL bez odpowiadajacego revokeObjectURL w: :278 (reset przy toggle podgladu), :313 (po processAudio), :444 (handleAudioEdited po kazdym ciecu), :505 (po nagraniu), :611. Jedyne revoke w pliku to :342 w handleDownload - i to natychmiast po `a.click()` (:341), co w Safari/Firefox potrafi przerwac zapis pliku. Stary originalAudioEl/processedAudioEl jest po prostu porzucany (setOriginalAudioEl(audio)), a jego URL trzyma blob.

**Skutek dla użytkownika:** Po kilku cieciach i przetworzeniach karta trzyma kilka pelnych kopii nagrania (dziesiatki-setki MB) do konca sesji; na iOS przyspiesza to zabicie karty przez system. Dodatkowo pobieranie efektu koncowego moze skonczyc sie pustym plikiem na Safari.

**Naprawa:** Trzymac aktualny URL w refie i revoke'owac poprzedni przy kazdej podmianie (oraz w cleanupie efektu); w handleDownload revoke'owac w setTimeout/po zdarzeniu, nie synchronicznie po click().

### 47. Automatyka volume operuje na liniowej amplitudzie 0-1, nie na dB - cala uzyteczna czesc zakresu duckingu jest w dolnych 20% lane'a

`sredni` · `lib/automation.ts:130` · znalezione przy weryfikacji

:126-141 denormalizeValue: dla 'volume' zwraca wprost normalizedValue (0-1 = surowy gain), podczas gdy dla EQ jest mapowanie na dB (:135 `(normalizedValue - 0.5) * 24`). formatValue pokazuje to jako procenty (:172 `${Math.round(value * 100)}%`). Lane ma 60 px wysokosci (track-lane.tsx:65 automationLaneHeight = 60), wiec -6 dB to y=30 px, -12 dB to y=15 px, a -18 dB to y=7,5 px - typowy ducking (-12..-20 dB) mieszka w ostatnich kilku pikselach lane'a. Nigdzie w module nie ma konwersji dB<->gain.

**Skutek dla użytkownika:** Nie da sie precyzyjnie ustawic poziomu przyduszenia muzyki: roznica miedzy -12 i -18 dB to 7 pikseli, a odczyt jest w procentach amplitudy, ktore nie odpowiadaja niczemu, co uzytkownik slyszy. To samo dotyczy volume sciezki (0-1 liniowo).

**Naprawa:** Wprowadzic jeden model poziomu w dB w calym projekcie (fader taper np. -60..+6 dB, konwersja gain = 10^(dB/20)), formatowac w dB, a normalizacje 0-1 traktowac tylko jako wspolrzedna rysowania. To decyzja, ktora i tak trzeba podjac przed portem na natywne - AVAudioUnitEQ / Oboe operuja na dB.

### 48. processAudio obcina ogon pogłosu i nie ma zadnego limitera przed konwersja do 16-bit

`sredni` · `lib/audio-processor.ts:134` · znalezione przy weryfikacji

:134-138 `new OfflineAudioContext(audioBuffer.numberOfChannels, audioBuffer.length, audioBuffer.sampleRate)` - dlugosc renderu rowna dlugosci wejscia, a konwolwer dostaje impuls 2-sekundowy (:179 `createReverbImpulse(offlineContext, 2, 2)`), wiec caly ogon reverbu za koncem materialu jest ucinany. Lancuch konczy sie na outputGain (:190-191) bez limitera/soft-clipu, a konwersja do int16 tylko obcina: :267-268 `Math.max(-1, Math.min(1, sample))`. Suma dry+wet (:206-207) tez moze przekroczyc 1 nawet przy outputGain=1.

**Skutek dla użytkownika:** Pogłos urywa sie w polowie na koncu nagrania (slyszalne 'ciachniecie'), a przy presetach z podbiciem gainu material jest twardo klipowany (trzask/dystorsja) bez zadnego ostrzezenia ani wskaznika poziomu.

**Naprawa:** Renderowac do dlugosci `audioBuffer.length + ogon_reverbu * sampleRate`; wstawic przed wyjsciem limiter (DynamicsCompressor z ratio 20, threshold -1 dBFS, albo wlasny soft-clip w ScriptProcessor/AudioWorklet) i dodac pomiar peak/true-peak po renderze, zeby dac uzytkownikowi info o klipowaniu.

### 49. Dzielenie przez zero w generatorach waveformu dla bardzo krotkiego audio

`niski` · `lib/multi-track-storage.ts:721` · znalezione przy weryfikacji

multi-track-storage.ts:721 `const blockSize = Math.floor(audioBuffer.length / samples)` przy samples=1000; dla audio krotszego niz 1000 ramek (~21 ms przy 48 kHz) blockSize = 0, wiec petla wewnetrzna nie wykonuje sie ani raz i :732 `waveform.push(sum / blockSize)` daje 0/0 = NaN dla wszystkich 1000 punktow. Identycznie lib/audio-processor.ts:320-329 (`waveformData[i] = sum / blockSize`).

**Skutek dla użytkownika:** Bardzo krotki import (np. jednorazowy 'blip', ucieta koncowka nagrania) daje klip bez zadnego waveformu - pusty prostokat, bez bledu; canvas rysuje NaN i nie widac czy plik ma tresc.

**Naprawa:** `const blockSize = Math.max(1, Math.floor(length / samples))` i przyciecie liczby punktow do `Math.min(samples, length)`; docelowo przy okazji zamienic srednia abs na pary min/max (patrz confirmed #9).

**Warte zachowania z tego obszaru:**

- Schedulowanie klipow jest oparte na zegarze AudioContext, nie na setTimeout - model jest poprawny — lib/multi-track-engine.ts:551 `const now = this.audioContext.currentTime` (pobrane PO wszystkich awaitach ladowania zrodel), :594 `when = now + (clipStartInTimeline - offset)`, :609 `sourceNode.start(
- Edycja jest niedestrukcyjna - klipy z offsetami, wspoldzielone zrodla audio — lib/multi-track-storage.ts:18-37 `AudioClip { startTime, duration, trimStart, trimEnd, audioSourceId }` + :40-48 `AudioSource` z komentarzem 'multiple clips can reference same audio'. Trim jest respek
- Matematyka automatyki to czyste funkcje bez zaleznosci od Web Audio — lib/automation.ts:62-121 getValueAtTime + smoothstep (3t^2-2t^3), :126-162 denormalizeValue/normalizeValue. Zero importow z DOM/Web Audio w calym pliku. Przenosi sie na Swift/Kotlin przez proste przep
- Topologia channel stripa jest sensowna (input -> EQ low/mid/high -> volume -> pan -> output) — lib/track-processor.ts:21-75 createTrackProcessor, lowshelf@320Hz, peaking@1kHz Q=1, highshelf@3200Hz. Kazda sciezka ma wlasny lancuch podlaczony do masterGain (multi-track-engine.ts:530-531). Sam gra
- Szablony projektow (podcast/muzyka) jako czysta konfiguracja danych — lib/project-templates.ts:36-130 BUILT_IN_TEMPLATES - szablon 'podcast' tworzy sciezke Glos (EQ low -2, mid +2, high +1) i Muzyka tla (mid -2) z lane'ami volume. Zero zaleznosci od Web Audio - to JSON.

**Duplikaty / martwy kod:**

- components/multi-track-manager.tsx (461 linii) - nieimportowany nigdzie, caly widok miksera martwy
- components/track-controls.tsx (238 linii) - importowany wylacznie przez martwy multi-track-manager.tsx
- lib/multi-track-engine.ts:49-197 i 373-481 - loadTrack/loadTracks/play/mixToBuffer/exportMix/audioBufferToWavBlob/setMasterVolume osiagalne tylko z martwego managera; to oznacza, ze CALY kod eksportu jest martwy
- lib/automation.ts:286-318 createDuckCurve - jedyna funkcja podcastowa w repo, zero wywolan
- lib/automation.ts:147-162 normalizeValue - zero wywolan
- lib/track-processor.ts:198-216 getProcessorValue - zero wywolan
- audioBufferToWavBlob zduplikowany 3x, identyczny wzorzec z tablica number[]: lib/audio-processor.ts:250-300, lib/multi-track-engine.ts:429-481, components/interactive-waveform.tsx:272-324
- lib/multi-track-storage.ts:12 i :166-169 TEMPLATES_STORE - store tworzony w bazie 'vocal-coach-multitrack' i nigdy nie uzywany; szablony realnie leza w osobnej bazie 'vocal-coach-templates' otwieranej w project-templates.ts:261
- AUTOMATION_PARAMS = ['volume','eqMid','pan'] zduplikowane: components/track-controls.tsx:21 i components/timeline/track-lane.tsx:11
- lib/multi-track-storage.ts:111 MultiTrackProject.useTimeline - zapisywane przy tworzeniu (:484), nigdy nieczytane
- lib/multi-track-storage.ts:65-67 TimelineState.loopEnabled/loopStart/loopEnd - persystowane, nigdy nieczytane, funkcji loop nie ma
- lib/multi-track-storage.ts:97 Track.clips - zapisywane jako [] przy tworzeniu sciezki, nigdy nieczytane (klipy pobierane przez indeks trackId w CLIPS_STORE)
- lib/multi-track-storage.ts:93 Track.height - czytane w track-lane.tsx:64 ale nie ma UI do zmiany wysokosci sciezki
- components/timeline/multi-track-timeline.tsx:5 - ikona Download zaimportowana, brak przycisku eksportu w JSX
- lib/multi-track-storage.ts:502-536 addTrackToProject - sciezka legacy (audio w rekordzie sciezki), uzywana tylko przez martwy manager; timeline uzywa createTrack + createAudioSource + createClip
- app/studio/page.tsx (33 linie) - czysty redirect do /edit/studio; app/edit/page.tsx to menu duplikujace selektor trybu wbudowany w /edit/studio (studioMode === 'select')
- lib/multi-track-engine.ts:14-17 trackGains/trackPanners - utrzymywane jako 'legacy compatibility' obok trackProcessors, ktore i tak zawieraja te same wezly

---

## TRAIN - cwiczenia, gry, sing-along, zakres glosu, postepy

> Filar TRAIN to zestaw czterech niezaleznych demo (Cwiczenia, Hit the Note, Hit the Chord, Sing-along) plus ekran Postepow, ktore nie sa spiete zadnym wspolnym modelem oceny ani zadna trwala warstwa domenowa. Kazda logika oceniania zyje wewnatrz hookow Reacta (useState/useRef/useCallback), jest sterowana przez requestAnimationFrame i mierzona przez Date.now(), wiec nie da sie jej ani przetestowac, ani przeniesc na natywne bez przepisania. Merytorycznie scoring jest zly na poziomie fundamentu: cwiczenia mapuja nuty na oś czasu przez proporcjonalne rozciagniecie nagrania (bez detekcji onsetu, bez pominiecia ataku, bez tolerancji na vibrato/portamento), gra wymaga stalej liczby ramek (czyli trudnosc zalezy od odswiezania ekranu), sing-along nie liczy wyniku w ogole (pole score jest zerowane i nigdy nie ustawiane), a "srednia dokladnosc" na ekranie Postepow mierzy odleglosc od najblizszego dowolnego poltonu, czyli nie mierzy niczego dydaktycznego. Dochodzi do tego brak jakiegokolwiek gate'u mikrofonu podczas grania tonu referencyjnego (przy echoCancellation:false), wiec glosnik moze zaliczac nuty za uzytkownika - jedyne miejsce, gdzie to rozwiazano poprawnie, to gra akordowa. app/training/* i app/progress to celowe stuby przekierowujace (nie duplikaty), ale components/training-hub.tsx to 194 linie martwego kodu, a lista utworow do sing-alongu jest pusta tablica, wiec ta funkcja jest realnie niedostepna bez recznego uploadu MIDI. Realna wartosc do zachowania: lib/midi-parser.ts (czysty TS, wlasny parser z mapa tempa i podzialem na sciezki), pomysl "piosenka plynie tylko gdy spiewasz", ekran wyboru sciezki wokalnej i wzorzec pauzowania nasluchu z gry akordowej.

**Werdykt: rewrite** — Warstwa oceniania (scoring) nie nadaje sie do naprawy przyrostowej - blad jest w modelu, nie w implementacji: nie ma pojecia onsetu nuty, segmentacji, tolerancji stylistycznej ani wspolnego typu "wynik cwiczenia". Kazda z czterech aktywnosci liczy cos innego, trzy z nich niepoprawnie, a jedna (sing-along) nie liczy nic. Dodatkowo cala logika jest zrosnieta z Reactem i rAF, wiec i tak wymaga wyciagniecia do czystego TS pod natywne iOS/Android - a to jest praktycznie przepisanie. Zachowac warto lib/midi-parser.ts (bezzaleznosciowy, przenosny), zestaw danych cwiczen jako punkt wyjscia do schematu JSON oraz trzy pomysly UX (sterowanie czasem glosem, wybor sciezki wokalnej, pauzowanie nasluchu na czas referencji). Reszta to demo-ware: components/training-hub.tsx do skasowania od reki, sing-along do przeprojektowania od zera (nie odtwarza dzwieku, nie liczy punktow, nie ma utworow), ekran Postepow do przepiecia na sensowna metryke.

### 50. Ton referencyjny leci przez glosnik przy echoCancellation:false i moze zaliczac nuty za uzytkownika

`KRYTYCZNY` · `lib/audio-synth.ts:21` · potwierdzone

audio-synth.ts:21-22 `this.masterGain.gain.value = 0.85` + `this.masterGain.connect(this.audioContext.destination)`; use-audio-recorder.ts:85-91 `echoCancellation: false, noiseSuppression: false, autoGainControl: false`. hit-the-note-game.tsx:48-52 przetwarza kazdy currentPitch gdy `phase === "playing" && isRecordingActive` - BEZ sprawdzania `isPlayingNote`, ktore hook zwraca (use-hit-the-note-game.ts:46, 97-105).

*Weryfikator:* POTWIERDZONE i silniejsze niz zgloszenie. W Hit the Note przycisk 'Powtorz nute' (hit-the-note-game.tsx:390-399) gra 800 ms tonu docelowego przy aktywnym `phase === "playing"`, a licznik `consecutiveCorrectRef` NIE wygasa w ciszy (processPitch jest wolane tylko gdy currentPitch != null), wiec 3 klikniecia przycisku = ~150 ramek idealnego pitchu = automatyczne zaliczenie nuty i +10 pkt bez spiewania. W Cwiczeniach identyczna dziura: w fazie 'recording' aktywne sa przyciski playSingleNote (training-mode.tsx:378-385 'Pierwsza nuta (przypomnienie)' i :395-409 'Wszystkie nuty'), ktore wstrzykuja ton wzorcowy wprost do recordedPitches. KOREKTA: mechanizm opisany w evidence audytora ('ogon referencji' po playNoteSequence) jest slaby - startRecording jest zablokowane dopoki isPlayingReference (training-mode.tsx:215-241), realna droga to przyciski pojedynczych nut. Gra akordowa jest jako jedyna zabezpieczona: use-hit-the-chord-game.ts:44-61 `pauseListeningDuringPlayback` + guard `isListeningPaused` na :166.

### 51. Ocena cwiczenia mapuje nuty na os czasu przez proporcjonalne rozciagniecie nagrania - bez detekcji onsetu i bez przerw miedzy nutami

`KRYTYCZNY` · `hooks/use-training-mode.ts:161` · potwierdzone

use-training-mode.ts:152-170: `totalDuration = expectedNotes.reduce(... + note.duration)`, `startTime = recordedPitches[0].timestamp`, `actualDuration = endTime - startTime`, `noteStartRatio = currentTime / totalDuration`, okno `p.timestamp >= noteStartTime && p.timestamp <= noteEndTime`.

*Weryfikator:* POTWIERDZONE dokladnie w cytowanych liniach. Dodatkowy dowod ktory audytor pominal, a ktory czyni blad systematycznym (nie tylko losowym): wzorzec jest odtwarzany z 300 ms przerwa miedzy nutami (use-training-mode.ts:58 `playNoteSequence(notes, 300)`), a totalDuration liczy WYLACZNIE sumy duration (600/800 ms). Uzytkownik nasladujacy wzorzec spiewa w rytmie 900 ms/nute, a siatka oceny dzieli nagranie w proporcjach 600/4800 - przy gamie 8-nutowej ostatnie nuty maja okno przesuniete o ~2 nuty. Do tego brak jakiejkolwiek detekcji onsetu i zakotwiczenie w pierwszej ramce (kazde chrzakniecie przesuwa cala siatke).

### 52. Sing-along w ogole nie liczy wyniku - pole score jest tylko zerowane

`KRYTYCZNY` · `hooks/use-sing-along.ts:38` · potwierdzone

`score: 0` w trzech miejscach: inicjalizacja stanu (use-sing-along.ts:38, audytor podal 39), start (:303), stop (:350). Grep `score` po components/sing-along.tsx nie zwraca NIC - pole nie jest nawet czytane w UI. `totalNotes` (interface :14) rowniez nie jest nigdzie wyswietlane. Ekran koncowy (sing-along.tsx:582-587) pokazuje tylko tekst 'Porownaj swoja pomaranczowa linie z fioletowymi nutami'.

*Weryfikator:* POTWIERDZONE, numer linii poprawiony na 38. Zweryfikowalem gruntownie: w calym hooku nie ma zadnego porownania pitchHistory z midi.notes - `getVisibleNotes` i `getVisiblePitchHistory` sluza wylacznie do rysowania canvasu. Zero danych z sing-alongu trafia tez do sesji (patrz problem z autozapisem).

### 53. 'Srednia dokladnosc' mierzy odleglosc od najblizszego dowolnego poltonu - metryka bez celu dydaktycznego

`KRYTYCZNY` · `hooks/use-session-library.ts:60` · potwierdzone

use-session-library.ts:60-62: `perfectCount = pitchHistory.filter(p => Math.abs(p.cents) <= 10)`, `averageAccuracy = ((perfectCount + goodCount * 0.7) / pitchHistory.length) * 100`. `PitchData.cents` pochodzi z frequencyToNote (pitch-detector.ts:14-17) i jest odchyleniem od NAJBLIZSZEJ nuty rownomiernie temperowanej. saveSession nie przyjmuje zadnego celu/cwiczenia (sygnatura :49-56).

*Weryfikator:* POTWIERDZONE co do slowa. Ta liczba jest zarazem jedynym zrodlem wykresu 'Dokladnosc w czasie' (progress-charts.tsx:22-26), kafla 'Sr. dokladnosc' (app/library/progress/page.tsx:60-62) i osiagniecia 'Perfekcjonista' (progress-charts.tsx:189). Wyniki cwiczen (NoteAccuracy.hitRate) nie sa nigdzie zapisywane - accuracyResults zyje tylko w stanie komponentu do momentu odmontowania.

### 54. Na telefonie ZADNA sesja treningowa nie jest zapisywana - autozapis istnieje tylko w nawigacji desktopowej

`KRYTYCZNY` · `components/mobile-navigation.tsx:10` · znalezione przy weryfikacji

app/template.tsx:28-34: dla `window.innerWidth >= 1024` renderowany jest DesktopNavigation (ktory ma efekt autozapisu, desktop-navigation.tsx:82-108), a ponizej 1024 px renderowany jest MobileNavigation - grep `saveSession|useSessionLibrary|isRecording` po components/mobile-navigation.tsx nie zwraca NIC, plik to czysty zestaw linkow. Jedyny inny zapis to SaveSessionDialog, montowany wylacznie w app/record/live/page.tsx:195-201. Zadna ze stron /train/exercises, /train/game, /train/singalong nie zapisuje niczego samodzielnie.

**Skutek dla użytkownika:** Uzytkownik telefonu (a to glowny target aplikacji do spiewania i zapowiadany kierunek natywny) moze cwiczyc godzinami, po czym na ekranie Postepow widzi 'Brak danych do wyswietlenia', 0 min czasu cwiczen, passe 0 dni i brak zakresu wokalnego. Na desktopie te same cwiczenia sie zapisuja - czyli dane zaleza od szerokosci okna, a zmiana rozmiaru okna w trakcie nagrania (template.tsx:19-21) przelacza layout i moze zgubic albo zdublowac zapis.

**Naprawa:** Wyciagnac autozapis z komponentu nawigacji do jednego miejsca niezaleznego od layoutu (efekt w AudioRecorderProvider albo dedykowany hook useSessionAutosave wolany w app/template.tsx), i przekazywac tam jawny kontekst sesji (typ cwiczenia, id cwiczenia, wyniki) zamiast zgadywac go z pathname.

### 55. Scoring karze za atak nuty, portamento i vibrato - liczone jako blad intonacji

`wysoki` · `hooks/use-training-mode.ts:196` · potwierdzone

use-training-mode.ts:196-206: petla po WSZYSTKICH ramkach okna, `if (Math.abs(cents) <= 50) correctPitches++`, `hitRate = (correctPitches / notePitches.length) * 100`. Brak odrzucenia poczatku segmentu, brak obslugi glissanda, brak tolerancji na vibrato. `detectVibrato` istnieje (lib/pitch-detector.ts:248) ale grep pokazuje jedyne uzycie w components/current-note-display.tsx:77 - czyli tylko do wyswietlania, nigdy w ocenie.

*Weryfikator:* POTWIERDZONE. Sprawdzilem grep detectVibrato: tylko current-note-display.tsx - w scoringu nieuzywana. hitRate jest jedyna liczba pokazywana jako wynik (training-mode.tsx:418-431 usrednia hitRate po nutach). Obnizam severity z critical do high: to blad jakosci metryki, nie bledny wynik binarny - `accuracy` liczone z avgCents (getPitchAccuracy) usrednia vibrato poprawnie, wiec etykieta kolorystyczna jest znosna, psuje sie glowna liczba procentowa.

### 56. Prog trafienia w Hit the Note zalezy od czestotliwosci odswiezania ekranu

`wysoki` · `hooks/use-hit-the-note-game.ts:11` · potwierdzone

use-hit-the-note-game.ts:10-11 komentarz `// ~5 seconds at ~20 pitch detections per second` i `REQUIRED_CONSECUTIVE_HITS = 100`; detekcja chodzi w rytmie rAF (use-audio-recorder.ts:78 `animationFrameRef.current = requestAnimationFrame(processAudio)`), nie 20 Hz. UI deklaruje 3 sekundy (hit-the-note-game.tsx:63 'utrzymuj je przez 3 sekundy', :76 'utrzymaj przez ~3s').

*Weryfikator:* POTWIERDZONE. Rachunek: 100 ramek @60 Hz = 1,67 s, @120 Hz (ProMotion) = 0,83 s, czyli 3,6x szybciej niz deklarowane 3 s. Sam komentarz w kodzie jest wewnetrznie sprzeczny ('~5 seconds' vs UI '3 s' vs faktyczne 1,67 s). Ten sam wzorzec w grze akordowej: use-hit-the-chord-game.ts:19-20 `// ~2 seconds` przy 40 ramkach = 0,67 s @60 Hz.

### 57. Lista utworow do sing-alongu to pusta tablica, mimo ze pliki MIDI leza w /public

`wysoki` · `lib/midi-parser.ts:395` · potwierdzone

midi-parser.ts:395-397: `export const AVAILABLE_MIDI_FILES: Array<{...}> = [ // Add your MIDI files here ]`. W public/ leza: 'Aha_-_Take_On_Me.mid', 'A HA.Take on me K.mid', 'Nirvana - Smells Like Teen Spirit.mid'. sing-along.tsx:392 `AVAILABLE_MIDI_FILES.map(...)` pod naglowkiem 'Wybierz utwor:' (:391).

*Weryfikator:* POTWIERDZONE (deklaracja zaczyna sie w linii 395, nie 396). Sprawdzilem `ls public/` - trzy pliki .mid faktycznie sa wdrozone. Jedyna droga do funkcji to upload wlasnego pliku (sing-along.tsx:411-434). Uwaga na przyszlosc: nazwy plikow zawieraja spacje, wiec przy dodaniu ich do listy trzeba encodeURI, bo parseMidiFile robi goly fetch(url) (midi-parser.ts:389).

### 58. Brak jakiejkolwiek kompensacji latencji miedzy czasem melodii a wejsciem mikrofonu

`wysoki` · `hooks/use-sing-along.ts:253` · potwierdzone

use-sing-along.ts:252-258: `const pitchPoint: PitchPoint = { time: state.currentTime, ... }` - czas wizualny z zamkniecia Reactowego, mimo ze PitchData ma wlasny `timestamp` (pitch-detector.ts:11) ustawiany w momencie detekcji (use-audio-recorder.ts:64). Grep `outputLatency|baseLatency|AudioWorklet` w calym repo: brak trafien.

*Weryfikator:* POTWIERDZONE, w tym brak jakiegokolwiek odwolania do outputLatency/baseLatency (grep pusty). Blad jest wiekszy niz szacowal audytor: detektor czyta z bufora 2048 probek tylko pierwsze ~1356 probek (pitch-detector.ts:74-82, i+tau<SIZE), czyli analizuje NAJSTARSZY fragment bufora - dochodzi kolejne ~16 ms opoznienia wzgledem 'teraz'. Do tego wszystkie ramki przetworzone w jednym batchu Reacta dostaja identyczny `time` (state.currentTime z zamkniecia), a czas plynie tylko gdy isSinging - pierwsza ramka frazy dostaje czas z momentu PRZED wznowieniem odtwarzania.

### 59. Zakres wokalny wyznaczany z pojedynczych skrajnych probek - jeden blad oktawowy rozjezdza zakres na stale

`wysoki` · `hooks/use-vocal-range.ts:64` · potwierdzone

use-vocal-range.ts:64-71 (i identyczna kopia :113-120 w getVocalRangeFromSessions): czyste min/max po pojedynczych ramkach. Jedyny filtr: `p.confidence > 0.9` (:56, :106). Confidence = `1 - yinBuffer[tau]` (pitch-detector.ts:197, identycznie pitch-detector-pro.ts:207) - miara periodycznosci, wysoka rowniez dla harmonicznej i subharmonicznej.

*Weryfikator:* POTWIERDZONE. Dodatkowo: confidence z YIN jest z definicji ograniczone do [0.65, 1] (kandydat musi miec yinValue < threshold 0.25 w basic / 0.35 w pro), wiec 'confidence > 0.9' nie jest filtrem jakosci f0 a jedynie 'bardzo stacjonarna ramka' - octave error na czystym, stabilnym tonie przechodzi przez ten filtr bez problemu. Brak percentyla, brak wymogu utrzymania nuty przez N ms, brak histogramu. Logika jest zduplikowana w dwoch funkcjach (useVocalRange uzywane nigdzie poza typem, realnie dziala getVocalRangeFromSessions z app/library/progress/page.tsx:46,54).

### 60. Sesje z trybu treningowego zapisuja sie jako 'live' - warunek sprawdza sciezke, ktora juz nie istnieje

`wysoki` · `components/desktop-navigation.tsx:91` · potwierdzone

desktop-navigation.tsx:91 `const sessionType = pathname.startsWith("/training") ? "training" : "live"`. Wszystkie linki nawigacji prowadza na /train (:44 '/train', :45 '/train/game', :52 '/train/exercises'), a app/training/page.tsx:10 to tylko `router.replace("/train")`.

*Weryfikator:* POTWIERDZONE i mocniejsze: sprawdzilem WSZYSTKIE wywolania saveSession w repo (grep). Sa dwa - desktop-navigation.tsx:92 (zawsze 'live' w praktyce) i save-session-dialog.tsx:38, do ktorego app/record/live/page.tsx:200 przekazuje `mode="live"` na sztywno. Czyli w calej aplikacji NIE ISTNIEJE sciezka zapisujaca sesje z mode 'training' ani 'analysis' - galezie 'Trenuj'/'Analiza' w progress-charts.tsx:43 sa martwym kodem, a wykres 'Sesje wedlug trybu' zawsze pokazuje 100% 'Na zywo'.

### 61. Historia pitcha kopiowana w calosci co ramke - O(n^2) alokacji i setState przy kazdej ramce

`wysoki` · `hooks/use-audio-recorder.ts:68` · potwierdzone

use-audio-recorder.ts:68-69 `historyRef.current = [...historyRef.current, pitchData]; setPitchHistory(historyRef.current)` w petli rAF; use-training-mode.ts:98 `recordedPitchesRef.current = [...recordedPitchesRef.current, pitch]` + setRecordedPitches(:99).

*Weryfikator:* POTWIERDZONE dla use-audio-recorder i use-training-mode (obie kolekcje rosna bez ograniczenia). KOREKTA: use-sing-along.ts:260-265 NIE jest O(n^2) - filtruje okno 30 s (`cutoff = state.currentTime - 30000`), wiec kopiuje najwyzej ~1800 elementow. Zaostrzenie: recorder siedzi w globalnym kontekscie (contexts/audio-recorder-context.tsx), a `setRecordingDuration` (use-audio-recorder.ts:76) i setPitchHistory strzelaja przy KAZDEJ ramce, czyli cale drzewo aplikacji re-renderuje sie 60x/s podczas nagrywania. Dodatkowo `new Float32Array(2048)` alokowany w kazdej ramce (:39) i detekcja O(MAX_PERIOD^2) ≈ 460 tys. operacji/ramke na glownym watku.

### 62. Gra akordowa ocenia polifonie monofonicznym detektorem i akumuluje trafione dzwieki w Set bez wygasania

`wysoki` · `hooks/use-hit-the-chord-game.ts:178` · potwierdzone

use-hit-the-chord-game.ts:168 `const detectedNote = pitch.note`, :175 `targetNotes.includes(detectedNote)` (porownanie po nazwie nuty, oktawa ignorowana), :178 `matchedNotesRef.current.add(detectedNote)` - Set czyszczony dopiero przy nastepnym akordzie (:232, :280, :308). Warunek sukcesu :200 `consecutiveCorrectRef.current >= REQUIRED_CONSECUTIVE_HITS && matchedCount >= requiredNotes` gdzie requiredNotes = `Math.ceil(targetNotes.length * 0.6)` (:198).

*Weryfikator:* POTWIERDZONE. Zadna warstwa nie sprawdza rownoczesnosci - detektor (YIN/pro) zwraca jedno f0 na ramke, wiec 'akord' = 40 kolejnych ramek dowolnego dzwieku z akordu + 60% roznych nazw nut zebranych kiedykolwiek w tej probie. Wystarczy zagrac/zaspiewac dzwieki po kolei, w dowolnej oktawie i kolejnosci. Prog 40 ramek to ~0,67 s @60 Hz (komentarz :19 mowi '~2 seconds').

### 63. Cwiczenia zahardkodowane w module syntezy i przypiete na sztywno do C4-C5, bez adaptacji do zakresu glosu

`wysoki` · `lib/audio-synth.ts:240` · potwierdzone

audio-synth.ts:240-341 `export const TRAINING_EXERCISES: TrainingExercise[] = [...]` - 8 cwiczen jako literal w tym samym pliku co klasa AudioSynthesizer. Wszystkie gamy startuja z C4 (:246-255, :262-271, :294-299, :306-309, :316-319, :326-329, :336-339) lub A4 (:278-286), duration 600/800 ms na sztywno, brak pola tonacji i brak transpozycji. Jedyna 'kuracja' to filtr trudnosci training-mode.tsx:50-53.

*Weryfikator:* POTWIERDZONE. Sprawdzilem: TrainingExercise (audio-synth.ts:232-238) nie ma ani pola key/root, ani zakresu, ani progresji; nigdzie w repo nie ma funkcji transponujacej cwiczenie (transposeMidi dotyczy tylko sing-alongu). getVocalRangeFromSessions istnieje, ale nic nie karmi nim doboru cwiczen - dwie warstwy nie sa spiete. Kwalifikacja audytora ('architecture') jest trafna: to zaleznosc odwrotna (dane cwiczen w warstwie DSP), ktora blokuje przeniesienie na natywne.

### 64. Pelna historia pitcha serializowana do localStorage - realne ryzyko przekroczenia limitu i cichej utraty sesji

`wysoki` · `hooks/use-session-library.ts:88` · potwierdzone

use-session-library.ts:88 `localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(trimmedSessions))` gdzie Session zawiera `pitchHistory: PitchData[]` (:18). Blad tylko logowany (:98-101 `console.error("Failed to save session:", error); return null`). MAX_SESSIONS = 50 (:22) ogranicza liczbe sesji, ale nie rozmiar pojedynczej.

*Weryfikator:* POTWIERDZONE. Szacunek audytora jest rzetelny: PitchData w JSON to ~110-130 B (frequency z pelna precyzja float, note, octave, cents, confidence, timestamp), przy ~60 ramkach/s to ~400-470 kB na minute nagrania, czyli limit 5 MB pada po ~11-12 minutach lacznych nagran. Zadnego decymowania, zadnego kompaktowania (mozna trzymac same f0 jako Int16 z krokiem 20 ms), zadnej obslugi QuotaExceededError, zadnego komunikatu dla uzytkownika. Pogorszenie: deleteSession (:140) i renameSession (:167) rowniez przepisuja caly blob, wiec przy zapelnionym quota nawet usuwanie moze sie wywalic.

### 65. AudioSynthesizer nigdy nie wywoluje resume() - po wejsciu bezposrednio na /train/game lub /train/exercises dzwieki wzorcowe nie graja wcale

`wysoki` · `lib/audio-synth.ts:19` · znalezione przy weryfikacji

audio-synth.ts:17-24: AudioContext tworzony w konstruktorze, a konstruktor jest wolany w useEffect przy montowaniu hooka, czyli PRZED jakimkolwiek gestem uzytkownika na tej stronie (use-training-mode.ts:31-35, use-hit-the-note-game.ts:57-60, use-hit-the-chord-game.ts:63-66). W calej klasie nie ma ani jednego `resume()` (grep: resume() wystepuje tylko w use-audio-recorder.ts:99, app/edit/studio/page.tsx:369 i components/metronome.tsx:111 - czyli autor zna ten wzorzec i stosuje go wszedzie indziej). playPianoTone planuje oscylatory na `audioContext.currentTime`, ktory w stanie 'suspended' nie plynie, a promise i tak rozwiazuje sie przez setTimeout (:111-113), wiec playNoteSequence zwraca `true` i faza przechodzi na 'ready'.

**Skutek dla użytkownika:** Po odswiezeniu strony albo wejsciu z zakladki/PWA prosto na /train/game lub /train/exercises: uzytkownik klika cwiczenie, widzi animacje 'Sluchaj wzorca...', po czym ekran 'Gotowy?' - i nie slyszy ani jednego dzwieku. Nie da sie zaspiewac wzorca, ktorego nie slychac, wiec caly tryb jest bezuzyteczny; na iOS Safari (brak sticky-activation dla juz utworzonego kontekstu) tak bedzie praktycznie zawsze. Cisza jest niema - zadnego komunikatu o bledzie.

**Naprawa:** Nie tworzyc AudioContext w konstruktorze/useEffect. Leniwa inicjalizacja w pierwszym wywolaniu play* + `if (ctx.state !== 'running') await ctx.resume()` wewnatrz handlera gestu; dodatkowo zwracac z playNoteSequence realny status (a nie `true` z setTimeout) i pokazywac blad, jesli kontekst pozostal suspended.

### 66. Petla rAF trzyma zamkniecie z pierwszego renderu - 'Pauza' nie zatrzymuje detekcji, a zmiana czulosci i trybu detekcji w trakcie nagrania nie dziala

`wysoki` · `hooks/use-audio-recorder.ts:78` · znalezione przy weryfikacji

processAudio (use-audio-recorder.ts:31-79) jest useCallback z deps `[isPaused, sensitivity, detectionMode]`, ale sam planuje swoje kolejne wywolanie referencja do siebie z tego samego renderu (:33 i :78 `requestAnimationFrame(processAudio)`). Petla startuje raz, w startRecording (:124), i nigdy nie jest podmieniana - nie ma zadnego useEffect ktory by ja restartowal po zmianie deps. Wiec `isPaused` widziane w linii 32 zostaje na `false` na zawsze, a sensitivity/detectionMode zamrazaja sie na wartosciach z momentu startu.

**Skutek dla użytkownika:** Po nacisnieciu Pauzy (app/record/live/page.tsx:186 -> recording-controls.tsx:68) UI pokazuje pauze, ale mikrofon dalej jest analizowany, historia pitcha dalej rosnie (i wejdzie do autozapisu), a licznik czasu nagrania dalej biegnie (:75-76) - zapisany czas cwiczenia i statystyki sa zawyzone. Suwak czulosci i przelacznik Basic/Pro przestawiony w trakcie nagrania nie robi nic, choc UI pokazuje nowy stan - uzytkownik walczy z ustawieniem, ktore nie dziala.

**Naprawa:** Przeniesc petle do useEffect zaleznego od isRecording i trzymac zmienne w refach (sensitivityRef, detectionModeRef, isPausedRef) czytanych w kazdej ramce; docelowo, pod natywne, przeniesc detekcje do AudioWorklet z wlasnym zegarem zamiast rAF.

### 67. setTranspose nadpisuje baseline - transpozycja kumuluje sie i UI klamie o tonacji

`wysoki` · `hooks/use-sing-along.ts:173` · znalezione przy weryfikacji

use-sing-along.ts:152-176: `const transposedOriginal = transposeMidi(prev.originalMidi, semitones)` ... a w zwracanym stanie `originalMidi: transposeMidi(prev.originalMidi, semitones)` (:173) - czyli punkt odniesienia jest podmieniany na wersje JUZ przetransponowana, podczas gdy komponent wola funkcje z wartoscia ABSOLUTNA (`setTranspose(state.transpose - 12)`, sing-along.tsx:651 i :663). Po pierwszym klikniecu: originalMidi = base-12, transpose=-12 (OK). Po drugim: semitones=-24 nalozone na base-12 daje base-36, a UI pokazuje '-2 okt'.

**Skutek dla użytkownika:** Druga zmiana tonacji przenosi melodie o 3 oktawy zamiast 2. Nuty wypadaja pod dolna krawedz piano rolla (clamp w sing-along.tsx:41-44 MIN_MIDI_NOTE=36), wiec zbijaja sie w jedna linie na dnie wykresu i sa niemozliwe do zaspiewania, a etykieta tonacji pokazuje inna wartosc niz to, co widac i co bedzie oceniane. Bez przeladowania strony nie da sie tego cofnac (kazde kolejne klikniecie pogarsza).

**Naprawa:** Trzymac originalMidi jako niezmienny baseline (nigdy go nie nadpisywac) i liczyc `midi = transposeMidi(baseline, semitones)` przy kazdej zmianie; alternatywnie przechowywac tylko offset i transponowac przy rysowaniu/ocenie.

### 68. Globalny mutowalny stan detektora nie jest resetowany przy starcie nagrania - poprzednia sesja zatruwa pierwsze ramki nastepnej

`wysoki` · `lib/pitch-detector.ts:42` · znalezione przy weryfikacji

pitch-detector.ts:42-44 `let previousFrequency: number | null = null; let frequencyHistory: number[] = []` (moduleowe) oraz pitch-detector-pro.ts:56-58 `let recentF0s: number[] = []; let previousFrequencyPro: number | null = null`. Grep `resetPitchTracking`: jedyne wywolanie to app/record/karaoke/page.tsx:186. `resetProPitchTracking` wolane tylko przy przelaczeniu trybu (use-audio-recorder.ts:187). startRecording (use-audio-recorder.ts:81-129) nie resetuje ani jednego z nich. Ten stan wplywa na wynik realnie: pitch-detector.ts:142-169 wybiera kandydata wg odleglosci od previousFrequency, a :210-230 ODRZUCA ramke (return null), gdy skok wzgledem previousFrequency wyglada na harmoniczna >5 poltonow; w pro getTemporalStabilityScore ma wage 0.3 (pitch-detector-pro.ts:47-52, 100-118).

**Skutek dla użytkownika:** Pierwsze ~10 ramek kazdego nowego cwiczenia jest oceniane wzgledem ostatniej nuty poprzedniej sesji. Jesli poprzednio konczylo sie na C5, a nowe cwiczenie startuje od C4, detektor moze te ramki wyrzucic ('Czekam na dzwiek...') albo dociagnac do zlej oktawy. Efekt: pierwsza nuta cwiczenia regularnie ma hitRate 0%, a wyniki nie sa powtarzalne miedzy probami - dokladnie to, co uniemozliwia obserwowanie postepu. Stan zyje tez miedzy ekranami (gra -> cwiczenia -> sing-along) w ramach jednej sesji SPA.

**Naprawa:** Wolac resetPitchTracking() i resetProPitchTracking() w startRecording (i przy zmianie cwiczenia/nuty docelowej). Docelowo: usunac stan moduleowy i zamknac tracking w instancji detektora przekazywanej jawnie - inaczej ta sama pulapka wroci w natywnym porcie i w testach.

### 69. Funkcja roznicowa YIN nie normalizuje liczby skladnikow - przy sampleRate > ~66 kHz systematyczne bledy oktawowe w dol; okno analizy to tylko ~15 ms

`sredni` · `lib/pitch-detector.ts:76` · znalezione przy weryfikacji

pitch-detector.ts:74-82 (identycznie pitch-detector-pro.ts:170-178): `for (tau...) for (let i = 0; i < MAX_PERIOD; i++) if (i + tau < SIZE) yinBuffer[tau] += delta*delta` - liczba zsumowanych skladnikow maleje, gdy i+tau przekracza SIZE, a suma NIE jest dzielona przez liczbe skladnikow. Przy SIZE=2048 (analyser.fftSize, use-audio-recorder.ts:103) i MAX_PERIOD = floor(sampleRate/65) obcinanie zaczyna sie, gdy 2*MAX_PERIOD > 2048, czyli powyzej ~66,5 kHz (interfejsy audio 88,2/96 kHz, gdzie AudioContext dziedziczy sampleRate urzadzenia). Duze tau dostaja wtedy zanizona wartosc, a CMND (:87-90) preferuje minimum przy duzym tau - czyli f0 o oktawe za nisko. Dodatkowo okno korelacji to zawsze MAX_PERIOD probek (~678 @44,1 kHz = 15,4 ms), czyli ~1 okres dla 65 Hz i ~1,7 okresu dla 110 Hz.

**Skutek dla użytkownika:** Na sprzecie 96 kHz (studyjne interfejsy, czyli scenariusz filaru PODCAST) detekcja spada o oktawe - uzytkownik widzi C3 spiewajac C4, wszystkie cwiczenia pokazuja 'Do poprawy', a zakres wokalny w Postepach zapisuje sie trwale zle. Basy i barytony (80-110 Hz) dostaja niestabilne f0 nawet na 44,1 kHz, bo okno analizy zawiera 1-2 okresy.

**Naprawa:** Dzielic yinBuffer[tau] przez liczbe faktycznie zsumowanych skladnikow (albo ustawic W = SIZE/2 i tau < W, klasyczny YIN), zwiekszyc bufor do 4096 dla dolnego rejestru, dodac decymacje 2-4x dla niskich f0 i przeniesc petle do AudioWorklet (dzis ~460 tys. operacji na ramke na glownym watku).

### 70. Podwojny zapis tej samej sesji na desktopie w Free Practice (autozapis w nawigacji + dialog zapisu)

`sredni` · `components/desktop-navigation.tsx:82` · znalezione przy weryfikacji

desktop-navigation.tsx:82-108 zapisuje sesje automatycznie przy kazdym przejsciu isRecording true->false, dla dowolnej sciezki (jedyny warunek to pitchHistory.length > 0). Rownolegle app/record/live/page.tsx:195-201 renderuje SaveSessionDialog, ktory po zatwierdzeniu wola saveSession jeszcze raz (save-session-dialog.tsx:38) na tych samych danych. Oba korzystaja z tego samego globalnego recordera (contexts/audio-recorder-context.tsx), a saveSession nie ma zadnej deduplikacji (nowe id z Date.now(), use-session-library.ts:65).

**Skutek dla użytkownika:** Jedno nagranie tworzy dwie sesje w bibliotece: licznik 'Sesji', czas cwiczen, passa i wykresy sa zawyzone dwukrotnie, uzytkownik widzi duplikaty na liscie, a limit 5 MB localStorage konczy sie dwa razy szybciej. Dodatkowo obie instancje useSessionLibrary maja wlasny stan czytany osobno z localStorage, wiec kolejnosc zapisow decyduje, ktora wersja przezyje.

**Naprawa:** Jedno zrodlo prawdy dla zapisu (patrz punkt o autozapisie) - albo autozapis, albo dialog, z jawnym id sesji tworzonym przy starcie nagrania i idempotentnym upsertem.

### 71. Stan sesji raz zawiera pelne pitchHistory, raz nie - zakres wokalny znika po zapisie, a kazda nawigacja parsuje caly blob localStorage synchronicznie

`sredni` · `hooks/use-session-library.ts:91` · znalezione przy weryfikacji

use-session-library.ts:29-40 przy montowaniu wrzuca do stanu PELNE obiekty z localStorage (razem z pitchHistory), mimo ze typ stanu to SessionMetadata[]. Natomiast :91, :149 i :173 (po zapisie/usunieciu/zmianie nazwy) wrzucaja `map(({ pitchHistory: _, ...meta }) => meta)` - bez historii. app/library/progress/page.tsx:46,54 przekazuje ten stan do getVocalRangeFromSessions, ktore czyta `session.pitchHistory` (use-vocal-range.ts:97-101). Do tego app/template.tsx jest szablonem Next.js, wiec DesktopNavigation (a z nim useSessionLibrary) montuje sie ponownie przy KAZDEJ nawigacji i za kazdym razem robi synchroniczne JSON.parse calego blobu sesji.

**Skutek dla użytkownika:** Zakres wokalny na ekranie Postepow dziala tylko dopoki w tej instancji hooka nie doszlo do zapisu/usuniecia sesji - po tej operacji zamienia sie w 'Zacznij spiewac aby wykryc swoj zakres wokalny', mimo ze dane sa w localStorage. Niezaleznie od tego kazde przejscie miedzy stronami na desktopie parsuje i trzyma w pamieci Reacta wszystkie historie pitcha (potencjalnie kilka MB), co daje zauwazalne zaciecie nawigacji i skoki pamieci.

**Naprawa:** Rozdzielic magazyn: metadane w localStorage (male, szybkie), pitchHistory w IndexedDB (obok audio, ktore juz tam jest - lib/audio-storage.ts), pobierane leniwie. Typ stanu ma odpowiadac rzeczywistosci; zakres wokalny liczyc z osobnego, agregowanego rekordu (histogram nut), nie z surowych ramek.

### 72. Licznik trafien w Hit the Note nie wygasa w ciszy - nute mozna 'uzbierac' krotkimi impulsami

`sredni` · `hooks/use-hit-the-note-game.ts:175` · znalezione przy weryfikacji

processPitch jest wolane wylacznie gdy currentPitch != null (hit-the-note-game.tsx:48-52), a wygaszanie `consecutiveCorrectRef` (use-hit-the-note-game.ts:178-185) dzieje sie tylko WEWNATRZ processPitch, czyli tylko w ramkach z wykrytym dzwiekiem. W ciszy (albo gdy RMS < sensitivity, use-audio-recorder.ts:56 / pitch-detector.ts:69) licznik po prostu zamarza. Nie ma tez zadnego limitu czasu na nute (lives spada wylacznie w skipNote, :253-254).

**Skutek dla użytkownika:** Wymog 'utrzymaj nute przez 3 sekundy' (hit-the-note-game.tsx:63) faktycznie oznacza 'nazbieraj 100 ramek z trafiona nuta kiedykolwiek, w dowolnie wielu urwanych probach'. Uzytkownik oddycha, odchrzakuje, spiewa 5 krotkich impulsow - i dostaje 'PERFECT!' bez utrzymania dzwieku, co jest dokladnie odwrotnoscia cwiczonej umiejetnosci (kontrola oddechu i stabilnosc dzwieku).

**Naprawa:** Liczyc czas trwania trafienia w milisekundach z zegara audio (nie ramkach) i zerowac go po przekroczeniu progu ciszy (np. 150 ms bez detekcji); wygaszac postep rowniez w ramkach bez pitchu.

### 73. Parser MIDI ignoruje zmiany tempa i nie obsluguje podzialu czasu SMPTE - siatka nut rozjezdza sie z nagraniem

`sredni` · `lib/midi-parser.ts:238` · znalezione przy weryfikacji

midi-parser.ts:88-90 zbiera `tempoChanges`, ale :236-242 uzywa wylacznie pierwszego wpisu: `tempo = tempoChanges[0].tempo` i jednego stalego `msPerTick = 60000 / (tempo * ticksPerQuarterNote)` dla calego utworu. midi-parser.ts:85 `const ticksPerQuarterNote = timeDivision & 0x7fff` - brak sprawdzenia bitu 0x8000 (format SMPTE: frames/s + ticks/frame), dla takich plikow wartosc jest bezsensowna i cala os czasu jest przeskalowana. Dodatkowo note-on bez pasujacego note-off (activeNotes, :113) jest po cichu porzucany, a duration liczone jest przez `Math.max(...allNotes.map(...))` (:378-381) - spread na tablicy wszystkich nut grozi RangeError przy bardzo gestych plikach.

**Skutek dla użytkownika:** Dla plikow z rubato/zmiana tempa (typowe dla darmowych MIDI z internetu, a to jedyne zrodlo utworow po naprawieniu pustej listy) fioletowe bloki plyna coraz bardziej rozjechane z faktyczna melodia - im dalej w utwor, tym gorzej, a uzytkownik nie ma pojecia, ze wina jest po stronie aplikacji. Dla plikow SMPTE utwor trwa np. sekundy albo godziny zamiast minut. Brakujace note-off = ciche dziury w melodii.

**Naprawa:** Przeliczac ticki na ms po posortowanej liscie tempoChanges (segmentami), obslugiwac lub jawnie odrzucac timeDivision z ustawionym bitem 0x8000, domykac wiszace note-on na koncu sciezki, a duration liczyc reduce'em zamiast spreadem.

**Warte zachowania z tego obszaru:**

- Wlasny parser MIDI bez zewnetrznych zaleznosci - obsluguje running status, variable-length quantity, mape zmian tempa, podzial na sciezki i fallback na podzial po kanalach — lib/midi-parser.ts:43 readVarLen, :86 tempoChanges, :107 activeNotes keyed by noteNumber+channel dla polifonii; caly plik to czysty TypeScript bez importow DOM/Web Audio
- Transpozycja MIDI jako czysta funkcja (immutable, przelicza notes i tracks spojnie) — lib/midi-parser.ts:401 transposeMidi(midi, semitones) - mapuje midiNumber i przelicza nazwe/oktawe przez midiNumberToNote
- Pomysl UX: piosenka w sing-along przesuwa sie tylko wtedy, gdy uzytkownik spiewa, i zatrzymuje sie na ciszy - eliminuje frustracje 'nie nadazam' i wymusza ciaglosc frazy — hooks/use-sing-along.ts:211 'if (isSinging)' w updatePlayback + :242 silenceTimeoutRef 200ms
- Ekran wyboru sciezki wokalnej z MIDI: heurystyka nazw (vocal/voice/melody/lead/sing), blokada perkusji po kanale 9, podglad zakresu nut i dlugosci sciezki — components/sing-along.tsx:511-519 isLikelyVocal / isDrums, :499-504 wyliczenie noteRange z min/max midiNumber
- Poprawny wzorzec anty-sprzezeniowy: gra akordowa wycisza nasluch na czas odtwarzania referencji i zeruje progres, zeby glosnik nie zaliczal akordu — hooks/use-hit-the-chord-game.ts:44 pauseListeningDuringPlayback(durationMs) wywolywane przed kazdym playFrequency, :166 'if (... || isListeningPaused) return'
- Koncepcja histerezy trafienia: licznik kolejnych poprawnych ramek z asymetryczna kara (-1 za lekkie odchylenie, -5 za >100 centow) zamiast pojedynczej ramki — hooks/use-hit-the-note-game.ts:180-184 'if (cents > 100) consecutiveCorrectRef.current -= 5 else -= 1'
- Struktura danych cwiczenia (TrainingExercise/ToneNote: id, name, description, difficulty, notes[]) - rozsadny zarodek schematu JSON dla biblioteki cwiczen — lib/audio-synth.ts:232-238 interface TrainingExercise; :240 TRAINING_EXERCISES jako tablica deklaratywna

**Duplikaty / martwy kod:**

- components/training-hub.tsx - caly plik (194 linie) martwy: grep po 'TrainingHub' nie znajduje zadnego importu. Duplikuje menu treningowe zyjace w app/train/page.tsx, w wersji starszej (nie przekazuje detectionMode). Do skasowania.
- app/training/, app/training/exercises/, app/training/game/, app/training/singalong/ - to NIE sa duplikaty tylko celowe stuby przekierowujace (router.replace na odpowiednik w /train). Kazdy ma 21 linii identycznego boilerplate ze spinnerem. Nawigacja (components/desktop-navigation.tsx:46-54, components/mobile-navigation.tsx:19) linkuje wylacznie do /train. Zostawic tylko jesli stare URL-e sa realnie w obiegu; przy statycznym eksporcie lepszy byloby redirect na poziomie hostingu.
- app/progress/page.tsx - stub przekierowujacy na /library/progress (21 linii). Realna strona to app/library/progress/page.tsx (227 linii), i to ona jest linkowana z obu nawigacji (desktop :61, mobile :21). Ta sama uwaga co wyzej.
- hooks/use-vocal-range.ts:51 useVocalRange() - eksportowany hook nieuzywany nigdzie; uzywana jest wylacznie blizniacza funkcja getVocalRangeFromSessions (:94), ktora kopiuje te sama logike min/max linia po linii (:110-125 vs :61-79). Klasyczna duplikacja: naprawa buga trzeba by robic dwa razy.
- hooks/use-sing-along.ts:271 processNoPitch - pusta funkcja z komentarzem '// Will be handled by the silence timeout', eksportowana (:401), nigdy nie destrukturyzowana w components/sing-along.tsx.
- hooks/use-sing-along.ts:15 state.score i :16 state.totalNotes - pola stanu ustawiane wylacznie na wartosci poczatkowe/zerowe i nigdy nieodczytywane przez UI. Martwy model danych.
- hooks/use-hit-the-note-game.ts:53-54 correctPitchCountRef i totalPitchCountRef - inkrementowane (:136, :176) i zerowane w piecu miejscach, nigdy nieodczytywane.
- lib/audio-synth.ts:117 playTone() - opisane w komentarzu jako 'Legacy simple tone (kept for compatibility)', deleguje 1:1 do playPianoTone; brak wywolan w repo. Podobnie :26 getIsPlaying() - bez wywolan.
- lib/midi-parser.ts:396 AVAILABLE_MIDI_FILES = [] - pusta tablica z komentarzem '// Add your MIDI files here', mimo ze trzy pliki .mid leza w public/. Efektywnie wylacza liste utworow w sing-alongu.
- lib/pitch-detector.ts:248 detectVibrato - zaimplementowane, ale uzywane wylacznie dekoracyjnie w components/current-note-display.tsx:77. Nie wchodzi do zadnego scoringu, mimo ze jest tam potrzebne.
- Wzorzec 'spread na kazda ramke' zduplikowany w trzech miejscach: hooks/use-audio-recorder.ts:68, hooks/use-training-mode.ts:98, hooks/use-sing-along.ts:260-265.
- Konwersja nuta<->numer MIDI zaimplementowana niezaleznie co najmniej cztery razy: hooks/use-vocal-range.ts:26 noteToMidiNumber, lib/midi-parser.ts:37 noteToMidiNumber, hooks/use-sing-along.ts:247-249 (inline w processPitch), components/sing-along.tsx:46 frequencyToMidi. Tablica NOTE_NAMES powielona w co najmniej pieciu plikach.

---

## Architektura aplikacji, information architecture, stan, jakosc bazowa, gotowosc na przebudowe

> To jest ~21.6k LOC prototypu zbudowanego w 60 commitach w ciagu 14 dni (6-20 stycznia 2026), potem 6 miesiecy ciszy - klasyczna piaskownica "dodaj feature, zdeployuj, nastepny". Rdzen ma realna wartosc: warstwa DSP-pure (pitch-detector, pitch-detector-pro, fft-analyzer, midi-parser, automation) jest w 100% wolna od Web Audio API i DOM, czyli daje sie przeniesc 1:1 na iOS/Android. Wszystko powyzej tej warstwy jest natomiast splecione z Reactem, Web Audio API, IndexedDB i localStorage bez zadnej granicy domenowej - nie istnieje katalog core/, nie istnieje ani jeden interfejs portu (AudioCapture, Storage, Player), a hooki mieszaja logike domenowa z zarzadzaniem AudioContext. Information architecture jest w polowie migracji: 30 tras, z czego 10 to puste stuby redirectowe po dwoch przemianowaniach (train/training, progress, studio, karaoke, sessions, analysis, about), a 2 to hub-y-sieroty nielinkowane z nawigacji (/record, /edit). Weryfikacja jakosci praktycznie nie istnieje: zero testow, brak CI, `npm run lint` w ogole nie startuje (brakuje eslint i @eslint/eslintrc w package.json), a jedynym gate'em jest `tsc --noEmit`, ktory przechodzi czysto. Persystencja to szesc niezaleznych mechanizmow bez wersjonowania i bez migracji, w tym zapis calego nagrania jako base64 do localStorage.

**Werdykt: refactor** — Nie "rewrite" i nie "keep". Warstwa czysto-obliczeniowa (pitch-detector-pro + fft-analyzer + midi-parser + automation + guitar data, lacznie ~1.5k LOC bez zaleznosci od przegladarki) jest fundamentem, ktory przenosi sie na natywne bez zmian i szkoda go wyrzucac - to jedyne miejsce z realnym IP. Cala reszta wymaga przebudowy strukturalnej, nie kosmetyki: trzeba wprowadzic warstwe core/ z portami (capture, storage, playback, clock), wyciac 10 stubow tras i 2 huby-sieroty, skonsolidowac 6 mechanizmow persystencji w jeden wersjonowany model danych i dopiero wtedy budowac trzy filary. Rewrite od zera zmarnowalby dzialajace algorytmy DSP i sprawdzone UI gier; keep jest niemozliwy, bo obecna struktura nie ma gdzie zaczepic ani PODCAST (multitrack jest martwy poza jedna strona), ani natywnego portu.

### 74. Zero testow i niedzialajacy lint - brak jakiejkolwiek automatycznej weryfikacji DSP

`KRYTYCZNY` · `package.json:9` · potwierdzone

`find` po repo: brak *.test.*, *.spec.*, __tests__, vitest.config, jest.config, playwright.config. Brak katalogu .github (`ls .github` -> No such file). package.json linia 9: `"lint": "eslint ."`; devDependencies zawieraja tylko @tailwindcss/postcss, @types/*, postcss, tailwindcss, tw-animate-css, typescript.

*Weryfikator:* POTWIERDZONE, z korekta cytatu i numeru linii. Skrypt lint jest w linii 9, nie 10. Faktyczny blad przy `npm run lint` to `sh: eslint: command not found` (eslint nie ma w node_modules/.bin ani katalogu node_modules/@eslint), a nie `ERR_MODULE_NOT_FOUND: @eslint/eslintrc` - ten blad wystapilby dopiero po instalacji samego eslinta. Wniosek audytora bez zmian: jedynym gate'em jest tsc, a eslint.config.mjs (importujacy @eslint/eslintrc) nigdy sie nie wykonal.

### 75. Sesje z pelna historia pitchu w localStorage - ciche gubienie nagran po przekroczeniu quoty

`KRYTYCZNY` · `hooks/use-session-library.ts:88` · potwierdzone

Session extends SessionMetadata z `pitchHistory: PitchData[]` (linie 17-19). saveSession czyta cala tablice, dokleja nowa sesje i zapisuje calosc: `localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(trimmedSessions))` (linia 88). MAX_SESSIONS = 50 (linia 22). Blad wpada w `catch { console.error(...); return null }` (98-101). Wolajacy (desktop-navigation.tsx:94) tylko sprawdza `if (sessionId)` i nie pokazuje bledu.

*Weryfikator:* POTWIERDZONE, linia 88 poprawna. Uzupelnienie: przycinanie do MAX_SESSIONS jest po LICZBIE sesji, nie po rozmiarze - nie ratuje quoty. Jeden obiekt PitchData po JSON to ~110 B (frequency/note/octave/cents/confidence/timestamp), wiec minuta nagrania to 160-400 KB. Po przekroczeniu ~5 MB kazdy kolejny setItem rzuca QuotaExceededError, wiec od tego momentu ZADNA nowa sesja sie nie zapisze - istniejace dane pozostaja calkowite, ale aplikacja przestaje zapisywac na zawsze, bez komunikatu.

### 76. Auto-zapis sesji zyje wylacznie w komponencie nawigacji desktopowej - na mobile treningi nie zapisuja sie w ogole

`KRYTYCZNY` · `components/desktop-navigation.tsx:80` · potwierdzone

useEffect (linie 80-108) wykrywa zbocze isRecording i po 300 ms wola `saveSession(pitchHistory, sessionType, duration, undefined, true)` (linia 92). components/mobile-navigation.tsx ma 76 linii i zawiera wylacznie Linki - zero logiki zapisu. app/template.tsx:28-29 renderuje DesktopNavigation tylko gdy isDesktop, ustawiane z `window.innerWidth >= 1024` (linia 19). Strony /train/exercises, /train/game, /train/singalong korzystaja z useAudioRecorderContext i NIE maja wlasnego saveSession ani SaveSessionDialog (grep saveSession: tylko save-session-dialog.tsx:38 i desktop-navigation.tsx:92).

*Weryfikator:* POTWIERDZONE co do mechanizmu. Korekta zasiegu skutku: na mobile /record/live NADAL zapisuje sesje przez SaveSessionDialog (app/record/live/page.tsx:69 -> save-session-dialog.tsx:38), wiec ekran Progress na telefonie nie jest 'pusty niezaleznie od tego ile uzytkownik cwiczy' - traci wylacznie sesje z /train/*. To i tak krytyczne, bo trening to filar TRAIN.

### 77. Domyslny tryb detekcji 'pro' liczy naiwny DFT O(N^2) w kazdej ramce rAF - ~26 ms na wywolanie, nie ma szans na czas rzeczywisty

`KRYTYCZNY` · `lib/fft-analyzer.ts:24` · znalezione przy weryfikacji

computeFFTMagnitudes (fft-analyzer.ts:10-38) to podwojna petla: 1024 biny x 2048 probek, w kazdej iteracji Math.cos i Math.sin liczone od zera (linie 28-32) - ~2,1 mln iteracji i ~4,2 mln wywolan trygonometrii na jedno wywolanie. Jest wolane bezwarunkowo z detectPitchPro (pitch-detector-pro.ts:248) dla kazdej ramki, a detectPitchPro jest domyslna sciezka: hooks/use-audio-recorder.ts:19 `useState<DetectionMode>("pro")` i linie 44-49 w processAudio, ktore leci w petli requestAnimationFrame (78, 124). Zmierzone w Node/V8 na tej maszynie: 25,76 ms na wywolanie (do tego 1,07 ms na funkcje roznicowa YIN, ktora tez jest O(MAX_PERIOD^2) = ~545 tys. operacji, pitch-detector-pro.ts:170-178). Budzet ramki 60 fps to 16,6 ms. Do tego alokacja dwoch Float32Array na kazde wywolanie (fft-analyzer.ts:14, 17).

**Skutek dla użytkownika:** Domyslny tryb analizy nie moze dzialac w czasie rzeczywistym: watek glowny jest zajety w 100%, petla rAF spada z 60 do ~30 fps na szybkim laptopie i do 5-10 fps na telefonie sredniej klasy. Wizualizator pitchu klatkuje, historia pitchu robi sie rzadka i o nierownych timestampach, a detectVibrato (pitch-detector.ts:248) przy 5-10 probkach na sekunde nie jest w stanie zmierzyc vibrato 4-7 Hz - to bezposrednio tlumaczy skarge wlasciciela, ze 'analiza tonow jest niedoskonala'. To nie jest kwestia strojenia algorytmu, tylko braku FFT.

**Naprawa:** Zastapic naiwny DFT prawdziwym radix-2 FFT (~30 tys. operacji zamiast 2,1 mln, przyspieszenie ~70x) albo pobierac widmo z AnalyserNode.getFloatFrequencyData, ktore i tak jest liczone natywnie. Petla roznicowa YIN powinna korzystac z FFT-owej autokorelacji. Docelowo cala detekcja powinna zejsc z watku glownego do AudioWorkletu z ustalonym hopem (np. 10 ms), co jednoczesnie daje stabilny timestamp i przenosi sie 1:1 na natywne (AVAudioEngine tap / Oboe callback). Wstepnie prealokowac bufory i tablice sin/cos poza funkcja.

### 78. MediaRecorder nigdy nie startuje - zadna sesja nie ma audio, a Studio pokazuje nagrania, ktorych nie da sie otworzyc

`KRYTYCZNY` · `contexts/audio-recorder-context.tsx:62` · znalezione przy weryfikacji

startRecording (58-77): `await audioRecorder.startRecording()`, a nastepnie `if (audioRecorder.isRecording && streamRef.current === null) { setTimeout(... startAudioRecording ...) }`. `audioRecorder` to swiezy obiekt zwracany przez useAudioRecorder() w danym renderze, wiec `audioRecorder.isRecording` w tym domknieciu to wartosc stanu z RENDERU, w ktorym callback powstal - w momencie klikniecia Rec jest to zawsze false (nagrywanie jeszcze nie wystartowalo; setIsRecording(true) w use-audio-recorder.ts:119 nie mutuje domkniecia). Warunek nigdy nie jest spelniony. Grep potwierdza, ze `startAudioRecording` nie jest wolane z zadnego innego miejsca w repo (jedyne trafienie: audio-recorder-context.tsx:69). Konsekwencje w kodzie: use-audio-recording.ts audioBlob zostaje null -> save-session-dialog.tsx:35 `const hasAudio = audioBlob !== null` zawsze false; saveAudio (60-61) zwraca false; desktop-navigation.tsx:92 przekazuje hasAudio=true na sztywno, wiec loguje tylko `console.warn("Audio not saved for session")` (97).

**Skutek dla użytkownika:** Cala funkcja 'nagraj i odsluchaj' jest martwa: zadna sesja z /record/live ani z /train/* nie ma pliku audio. Na mobile biblioteka nigdy nie pokazuje przycisku odtwarzania (app/library/page.tsx:221 `session.hasAudio`). Na desktopie jest gorzej - auto-zapis wpisuje hasAudio=true, wiec /library/session:33 probuje pobrac blob i dostaje null (odtwarzacz bez zrodla), a Studio listuje te sesje jako gotowe do obrobki (app/edit/studio/page.tsx:185 `sessions.filter(s => s.hasAudio)`) i ladowanie konczy sie bledem. Dla filarow SING i PODCAST to blokada u samego zrodla: nie ma z czego robic obrobki.

**Naprawa:** Usunac warunek na przestarzalym `audioRecorder.isRecording` i zwracac strumien z useAudioRecorder.startRecording (albo wystawic streamRef), po czym karmic MediaRecorder TYM SAMYM MediaStreamem, ktory idzie do analizy - drugie getUserMedia (linia 67) otwiera niepotrzebnie drugi strumien mikrofonu z innymi constraintami (audio: true, czyli z wlaczonym echoCancellation/AGC) i bez gain node'a. Docelowo: jeden AudioCapture jako port, jeden strumien, dwa konsumenty (analiza + zapis), zero setTimeout.

### 79. Podwojny zapis sesji na desktopie na /record/live

`wysoki` · `app/record/live/page.tsx:69` · potwierdzone

handleStopRecording (61-71): `setRecordedPitchHistory([...pitchHistory])`, `setRecordedDuration(...)`, `stopRecording()`, a nastepnie `if (pitchHistory.length > 0) setShowSaveDialog(true)` (68-70). Dialog wola saveSession z mode="live" (save-session-dialog.tsx:38). Rownolegle desktop-navigation.tsx:86-92 po 300 ms wola saveSession dla tej samej historii z pathname /record/live -> sessionType "live".

*Weryfikator:* POTWIERDZONE, linia 69 poprawna. Warunek: dotyczy desktopu (>=1024 px) i tylko gdy uzytkownik kliknie Zapisz w dialogu; przy 'Pomin' zostaje jeden wpis (automatyczny). Efekt: dwa wpisy w bibliotece z ta sama historia, zawyzone totalSessions/streak/avgAccuracy na /library/progress (linie 58-62).

### 80. Martwy warunek po przemianowaniu /training -> /train: wszystkie sesje zapisuja sie jako 'live'

`wysoki` · `components/desktop-navigation.tsx:91` · potwierdzone

`const sessionType = pathname.startsWith("/training") ? "training" : "live"` (linia 91). Realne trasy w navGroups (linie 39-62): /record/live, /train, /train/game, /train/exercises, /record/karaoke, /guitar, /edit/studio, /library, /library/progress. app/training/* to 4 stuby robiace natychmiast router.replace na /train/*. Filtr 'training' w app/library/page.tsx:29-30 dopasowuje `session.mode === "training"`.

*Weryfikator:* POTWIERDZONE. Sprawdzone dodatkowo, ze zaden inny wolajacy saveSession nie przekazuje mode="training" (save-session-dialog.tsx jest wolany tylko z /record/live z mode="live"). W efekcie wartosc "training" nie powstaje NIGDY, wiec filtr 'Trening' zawsze zwraca pusto.

### 81. Tryb 'karaoke' nie istnieje w danych - filtr w bibliotece to martwe UI, nagrania karaoke nigdy nie trafiaja do sesji

`wysoki` · `app/library/page.tsx:33` · potwierdzone

app/library/page.tsx:31-33: `case "karaoke": // karaoke is currently stored as "analysis" mode` -> `return session.mode === "analysis"`. Grep saveSession po calym repo: tylko hooks/use-session-library.ts (definicja), components/save-session-dialog.tsx:38 i components/desktop-navigation.tsx:92. app/record/karaoke/page.tsx (532 linie) nie wola saveSession ani razu - konczy na downloadRecording (278-291) albo processInStudio (293-305).

*Weryfikator:* POTWIERDZONE co do litery. mode="analysis" nie jest generowany nigdzie w repo, wiec filtr karaoke zwraca zawsze pusto. Nagrania karaoke istnieja tylko w pamieci komponentu (setRecordedBlob) - po nawigacji lub odswiezeniu przepadaja.

### 82. Transfer nagrania Karaoke -> Studio przez base64 w localStorage, bez try/catch i kontroli rozmiaru

`wysoki` · `app/record/karaoke/page.tsx:299` · potwierdzone

processInStudio (293-305): `reader.onload = () => { localStorage.setItem("karaoke-temp-audio", reader.result as string); router.push("/edit/studio?source=karaoke") }`, `reader.readAsDataURL(recordedBlob)` (302). Brak try/catch, brak sprawdzenia blob.size. Odbior: app/edit/studio/page.tsx:96 `localStorage.getItem("karaoke-temp-audio")`, `fetch(karaokeData).then(res => res.blob())` (101-102), removeItem po sukcesie (119).

*Weryfikator:* POTWIERDZONE, linia 299 (setItem) poprawna, readAsDataURL jest w 302. Dodatkowo: jesli setItem rzuci QuotaExceededError, wyjatek leci wewnatrz callbacku FileReader (brak try/catch), wiec router.push nie wykona sie wcale - uzytkownik zostaje na stronie karaoke bez zadnego komunikatu, a nagranie i tak nie trafia do Studia. Budzet dzielony z kluczem vocal-coach-sessions, wiec duze nagranie moze tez zablokowac zapis sesji.

### 83. Rozproszona persystencja: trzy niezalezne bazy IndexedDB + trzy klucze localStorage, zero migracji i zero wspolnego ID

`wysoki` · `lib/project-templates.ts:261` · potwierdzone

IndexedDB #1: lib/audio-storage.ts:3-5 `vocal-coach-audio` v1, store `recordings` (keyPath sessionId). IndexedDB #2: lib/multi-track-storage.ts:5-12 `vocal-coach-multitrack` v3, stores projects/tracks/audioSources/clips/automationLanes/templates. IndexedDB #3: lib/project-templates.ts:261 `indexedDB.open('vocal-coach-templates', 1)` ze storem `templates` (133, 268-269). localStorage: `vocal-coach-sessions` (use-session-library.ts:21), `voice-profile-v1` (use-voice-profile.ts:6), `karaoke-temp-audio` (karaoke:299). Zaden plik nie zawiera kodu migracji miedzy bazami ani wspolnego identyfikatora uzytkownika/projektu.

*Weryfikator:* POTWIERDZONE co do fragmentacji, ale sub-teza o 'kolizji nazwy store' jest bledna - patrz sekcja refuted. Sprawdzilem realny defekt w tym miejscu: store `templates` w bazie vocal-coach-multitrack jest TWORZONY (multi-track-storage.ts:167-168), ale nie ma ani jednego odczytu/zapisu - wszystkie operacje na szablonach ida do osobnej bazy vocal-coach-templates (project-templates.ts:175-252). To martwy store, nie kolizja.

### 84. Brak granicy domenowej: nie istnieje warstwa core ani zaden port - blokier planu iOS/Android

`wysoki` · `lib/audio-processor.ts:1` · potwierdzone

Struktura repo (ls -d */): app, components, contexts, hooks, lib, public, out - podzial techniczny. Grep `interface [A-Za-z]*Port|interface AudioCapture|interface Storage` po app/components/contexts/hooks/lib: 0 trafien. Zliczenie odwolan do API przegladarki (AudioContext|AudioBuffer|MediaRecorder|indexedDB|localStorage|window.|document.) w lib/: multi-track-engine 13, audio-processor 7, analytics 5, multi-track-storage 3, track-processor 2, guitar 2, audio-synth 2, project-templates 1, audio-storage 1; a jednoczesnie pitch-detector 0, pitch-detector-pro 0, fft-analyzer 0, midi-parser 0, automation 0.

*Weryfikator:* POTWIERDZONE co do tezy glownej (brak core/, brak portow, lib miesza DSP z infrastruktura). Dwie korekty: (1) liczby audytora sie nie odtwarzaja (audio-storage ma 1 trafienie moim regexem, nie 14 - reszta to metody IDB na obiekcie this.db, ktore nie sa globalnym API); (2) teza z summary, ze warstwa DSP jest 'w 100% wolna od DOM i daje sie przeniesc 1:1', jest ZA OPTYMISTYCZNA - pitch-detector.ts:28-30 loguje do console, a oba detektory trzymaja globalny mutowalny stan modulu (patrz missed).

### 85. Karaoke oparte na YouTube iframe API - slepy zaulek dla wersji natywnej i dla filaru SING

`wysoki` · `app/record/karaoke/page.tsx:55` · potwierdzone

Linie 52-63: dynamiczny `tag.src = "https://www.youtube.com/iframe_api"` + window.onYouTubeIframeAPIReady. Linie 90-115: `new window.YT.Player("youtube-player", {...})` w setTimeout 500 ms. Glos nagrywany osobno: `new MediaRecorder(stream, { mimeType: "audio/webm" })` (213) na wlasnym AudioContext (200). Zegary rozdzielne: player.playVideo() (251) vs mediaRecorder.start(100) (240), plus setInterval liczacy sekundy (246-248).

*Weryfikator:* POTWIERDZONE. Uzupelnienie techniczne: setTimeout 500 ms na inicjalizacje playera to sam w sobie race - jesli iframe_api nie zdazy sie zaladowac, `if (window.YT && window.YT.Player)` jest false i player nigdy nie powstaje, a przycisk zostaje martwy bez komunikatu. Brak wspolnego clocka potwierdzony: nie ma zadnego pomiaru offsetu miedzy player.getCurrentTime() a audioContext.currentTime.

### 86. Statyczny eksport bez backendu + dwa rownoczesne systemy analityki (jeden nieczynny)

`wysoki` · `next.config.ts:4` · potwierdzone

next.config.ts:4 `output: 'export'`, images.unoptimized, reactStrictMode: false. DEPLOYMENT.md linie 3-14: Cloudflare Pages, static HTML. app/layout.tsx:4 `import { Analytics } from "@vercel/analytics/next"` + render `<Analytics />` (58), rownolegle gtag G-BFQ35YS210 wstrzykiwany Scriptem (35-52) i uzywany przez lib/analytics.ts. Caly stan uzytkownika: localStorage + 3 bazy IndexedDB.

*Weryfikator:* POTWIERDZONE. @vercel/analytics faktycznie jest bezuzyteczny poza Vercelem - laduje skrypt z wlasnej sciezki /_vercel/insights/*, ktora na Cloudflare Pages nie istnieje, wiec to czysty narzut i falszywe poczucie telemetrii. reactStrictMode: false (linia 8) dodatkowo maskuje bledy cyklu zycia efektow - istotne przy liczbie wyciekow zasobow znalezionych w tym repo.

### 87. Pauza nie pauzuje, a zmiana czulosci i trybu detekcji w trakcie nagrywania nie ma zadnego efektu (przestarzale domkniecie w petli rAF)

`wysoki` · `hooks/use-audio-recorder.ts:78` · znalezione przy weryfikacji

processAudio to useCallback z zaleznosciami [isPaused, sensitivity, detectionMode] (linia 79). Petla startuje raz: `animationFrameRef.current = requestAnimationFrame(processAudio)` w startRecording (124), a nastepnie sama sie odnawia tym samym domknieciem: `requestAnimationFrame(processAudio)` w linii 78 - to referencja do funkcji, w ktorej `isPaused`, `sensitivity` i `detectionMode` sa zamrozone na wartosciach z momentu startu. Nie ma zadnego useEffect, ktory restartowalby petle po zmianie tych zaleznosci. togglePause (158-160) zmienia wylacznie stan Reacta.

**Skutek dla użytkownika:** Klikniecie Pauzy zmienia ikone w UI, ale detekcja dalej dokleja probki do pitchHistory i licznik czasu dalej rosnie (linie 75-76) - po 'wznowieniu' sesja ma dane z okresu pauzy, a dlugosc i sredni accuracy sa zafalszowane. Suwak czulosci i przelacznik Basic/Pro (app/record/live/page.tsx:92-104) nie robia nic do konca nagrania, mimo ze UI sugeruje zmiane. Uzytkownik probujacy zdiagnozowac zle wykrywanie pitchu kreci suwakami bez zadnego skutku - kolejne zrodlo wrazenia, ze 'analiza jest niedoskonala'.

**Naprawa:** Trzymac zmienne parametry w refach (isPausedRef, sensitivityRef, modeRef) czytanych wewnatrz petli, albo trzymac petle w useEffect zaleznym od tych parametrow i restartowac ja przy zmianie. Pauza powinna dodatkowo pauzowac licznik czasu (odejmowac czas pauzy od elapsed), a nie tylko przestawac zbierac probki.

### 88. wasRecordingRef nie jest resetowany na sciezce zapisu - drugie i kolejne nagranie na tej samej stronie zapisuje dlugosc w milisekundach jako sekundy

`wysoki` · `components/desktop-navigation.tsx:104` · znalezione przy weryfikacji

W efekcie 80-108 galaz zapisu konczy sie wczesnym `return () => clearTimeout(timer)` (104), wiec instrukcja `wasRecordingRef.current = isRecording` (107) NIE wykonuje sie - flaga zostaje true. W timeoucie ustawiane jest `recordingStartTimeRef.current = null` (101). Przy kolejnym starcie nagrywania warunek `if (isRecording && !wasRecordingRef.current)` (81) jest falszywy, wiec recordingStartTimeRef pozostaje null. Po zatrzymaniu wyliczenie dlugosci to `recordingStartTimeRef.current ? Math.floor((Date.now()-start)/1000) : recordingDuration` (87-89), a `recordingDuration` z kontekstu jest w MILISEKUNDACH (use-audio-recorder.ts:75-76 `const elapsed = Date.now() - startTimeRef.current; setRecordingDuration(elapsed)`; potwierdzone przez konwersje /1000 u pozostalych konsumentow: audio-recorder-context.tsx:80, app/record/live/page.tsx:64, components/recording-controls.tsx:27-28).

**Skutek dla użytkownika:** Drugie i kazde nastepne nagranie wykonane bez zmiany strony zapisuje sie z dlugoscia 1000x wieksza - 30-sekundowe cwiczenie ladzie w bibliotece jako 30000 s, czyli 8 godzin 20 minut. 'Czas cwiczen' na /library/progress (totalDuration, linia 59) i wykresy praktyki natychmiast przestaja mieć sens, a sam licznik czasu jest jedna z niewielu metryk postepu w filarze TRAIN.

**Naprawa:** Przeniesc `wasRecordingRef.current = isRecording` na poczatek efektu (albo do bloku finally kazdej galezi) i ujednolicic jednostke czasu: recordingDuration powinno byc jawnie recordingDurationMs, a saveSession powinno przyjmowac durationMs i samo konwertowac. Docelowo cala detekcja konca nagrania nie powinna miec zadnego zwiazku z komponentem nawigacji - to obowiazek warstwy sesji.

### 89. Zakres glosu na ekranie Postepy jest zawsze pusty - funkcja dostaje metadane bez pitchHistory

`wysoki` · `app/library/progress/page.tsx:46` · znalezione przy weryfikacji

app/library/progress/page.tsx:46 i 54 wolaja `getVocalRangeFromSessions(filteredSessions)`, gdzie filteredSessions pochodzi z `sessions` z useSessionLibrary (linia 18). Ten hook trzyma w stanie WYLACZNIE SessionMetadata[] - pitchHistory jest usuwane przy kazdym ustawieniu stanu: `const metadata = trimmedSessions.map(({ pitchHistory: _, ...meta }) => meta)` (use-session-library.ts:91, analogicznie 149 i 173) oraz przy odczycie z localStorage (35-39) trafia tam to, co bylo zapisane, ale stan i tak nie zawiera pitchHistory dla nowych zapisow. hooks/use-vocal-range.ts:97-101 robi `if (session.pitchHistory) allPitches.push(...)` - warunek nigdy nie jest spelniony, wiec allPitches.length === 0 i funkcja zwraca null (103). components/vocal-range-display.tsx:11 `if (!range)` renderuje stan pusty.

**Skutek dla użytkownika:** Zakladka 'Zakres glosu' na /library/progress (linia 218) jest permanentnie pusta - nigdy nie pokaze najnizszej/najwyzszej nuty, rozpietosci w polutonach ani sugerowanego typu glosu, niezaleznie od liczby nagran. Zakres glosu to jedna z czterech obiecanych funkcji filaru TRAIN i po prostu nie dziala.

**Naprawa:** Liczyc zakres glosu przy ZAPISIE sesji (raz, na swiezej pitchHistory) i trzymac go w SessionMetadata jako minF0/maxF0 - wtedy Postepy agreguja gotowe liczby bez wczytywania megabajtow historii. Dodatkowo przemyslec filtr `p.confidence > 0.9` (use-vocal-range.ts:106), ktory na obecnej definicji confidence odsiewa dane w sposob nieprzewidywalny.

### 90. Oba detektory pitchu trzymaja globalny mutowalny stan modulu - wzajemne zanieczyszczanie ekranow i brak reentrancji

`wysoki` · `lib/pitch-detector.ts:42` · znalezione przy weryfikacji

pitch-detector.ts:42-43 `let previousFrequency: number | null = null; let frequencyHistory: number[] = []` na poziomie modulu, mutowane w detectPitch (232-242) i wykorzystywane do scoringu kandydatow (142-169) oraz do odrzucania harmonicznych (210-230). Analogicznie pitch-detector-pro.ts:57-58 `let recentF0s: number[] = []; let previousFrequencyPro: number | null = null`, mutowane w 290-294 i czytane przez getTemporalStabilityScore (106-122). Reset jest globalny (resetPitchTracking:46, resetProPitchTracking:60) i wolany m.in. z app/record/karaoke/page.tsx:186 oraz hooks/use-audio-recorder.ts:187. Przy przelaczeniu trybu resetowany jest tylko stan pro - stan basic (previousFrequency) zostaje z poprzedniego nagrania.

**Skutek dla użytkownika:** Dwa niezalezne zrodla dzwieku analizowane w tej samej karcie (np. podglad nagrania w Studiu obok nagrywania na zywo, albo przyszly multitrack z kilkoma sciezkami) beda sobie nadpisywac historie czestotliwosci i wzajemnie wymuszac bledne oktawy - typowy objaw to 'przyklejanie sie' pitchu do zakresu poprzedniego glosu. Po zmianie trybu Basic->Pro->Basic pierwsze sekundy sa oceniane wzgledem czestotliwosci z zupelnie innego nagrania. Praktycznie uniemozliwia to tez to, czego wlasciciel potrzebuje najbardziej: przepuszczenie tego samego pliku przez detektor dwa razy i porownanie wynikow (offline batch, ewaluacja algorytmu), bo drugi przebieg startuje z zabrudzonym stanem.

**Naprawa:** Zamienic globale na jawny obiekt stanu: `createPitchTracker(config) -> { process(frame): PitchFrame }`, gdzie caly stan temporalny zyje w instancji. Funkcja czysta detectPitch(frame, state) -> [result, newState] jest testowalna, reentrantna, dziala offline na plikach i przenosi sie 1:1 na Swift/Kotlin. To warunek wstepny jakiegokolwiek zestawu testow regresyjnych DSP.

### 91. Ekran Karaoke nie ma zadnego cleanupu - po wyjsciu ze strony mikrofon zostaje aktywny, a petla rAF i MediaRecorder dzialaja dalej

`wysoki` · `app/record/karaoke/page.tsx:181` · znalezione przy weryfikacji

W calym pliku (532 linie) sa tylko dwa useEffect: ustawienie tytulu (46-49) i wstrzykniecie iframe_api (52-63). Zaden nie zwraca funkcji czyszczacej. startKaraoke (181-258) tworzy getUserMedia stream (191), AudioContext (200), AnalyserNode (202), petle `analyzePitch` odnawiajaca sie przez requestAnimationFrame (178) oraz MediaRecorder z timeslice 100 ms (240) i setInterval na licznik (246). Zwolnienie tych zasobow istnieje WYLACZNIE w mediaRecorder.onstop (223-238) i w stopRecording (260-276), czyli tylko gdy uzytkownik sam kliknie Stop.

**Skutek dla użytkownika:** Jesli uzytkownik w trakcie nagrywania karaoke przejdzie na inna zakladke aplikacji (a nawigacja jest zawsze widoczna), to: mikrofon zostaje wlaczony razem ze wskaznikiem nagrywania w przegladarce (problem prywatnosci), AudioContext nigdy sie nie zamyka, petla rAF dalej liczy YIN 60 razy na sekunde na zywym analyserze i wywolywa setState na odmontowanym komponencie, a MediaRecorder dalej gromadzi chunki w audioChunksRef - pamiec rosnie do konca zycia karty. Kilka takich cykli i przegladarka odmawia utworzenia kolejnego AudioContextu (limit ~6), po czym nagrywanie przestaje dzialac na wszystkich ekranach do przeladowania strony.

**Naprawa:** Dodac useEffect z cleanupem zwalniajacym wszystko po refach (cancelAnimationFrame, stream.getTracks().forEach(stop), audioContext.close(), mediaRecorder.stop(), clearInterval) i wywalic identyczna logike do jednego hooka/portu AudioCapture wspolnego dla karaoke, /record/live, tunera i Studia - dzis kazdy z tych ekranow ma wlasna, niekompletna wersje tego samego cyklu zycia.

### 92. Dziesiec tras to puste stuby redirectowe po dwoch przemianowaniach IA

`sredni` · `app/training/page.tsx:10` · potwierdzone

Zweryfikowane pliki: app/training/page.tsx:10 -> /train, app/training/exercises/page.tsx:10, app/training/game/page.tsx, app/training/singalong/page.tsx, app/progress/page.tsx:10 -> /library/progress, app/sessions/page.tsx:10 -> /library, app/analysis/page.tsx:11 -> /library, app/karaoke/page.tsx:10 -> /record/karaoke, app/about/page.tsx:10 -> /settings, app/studio/page.tsx:14 -> /edit/studio z zachowaniem query params. Kazdy 21-33 linii, wzorzec useEffect + router.replace + spinner.

*Weryfikator:* POTWIERDZONE, dokladnie 10 stubow, numery linii sie zgadzaja. Zaden nie jest linkowany z navGroups (desktop-navigation.tsx:39-62) ani navItems (mobile-navigation.tsx:16-22). Kazdy to osobna prerenderowana strona w /out.

### 93. Dwa huby-sieroty: /record i /edit dzialaja, ale nic do nich nie linkuje

`sredni` · `app/record/page.tsx:1` · potwierdzone

Grep `"/record"` i `"/edit"` po app/components/lib zwraca wylacznie dwa trafienia i oba to stringi analityczne: app/record/page.tsx:13 `trackPageView("Vocal Coach - Nagrywaj", "/record")` oraz app/edit/page.tsx:13. Nawigacja linkuje bezposrednio do lisci (/record/live, /record/karaoke, /edit/studio). /edit/projects jest osiagalne tylko z app/edit/page.tsx:46 (sierota) i app/edit/studio/page.tsx:665.

*Weryfikator:* POTWIERDZONE, linia 665 w studio potwierdzona gremem. Wniosek audytora, ze prototyp multitracku (przyszly filar PODCAST) jest praktycznie ukryty za jednym przyciskiem w Studiu, jest trafny.

### 94. Nawigacja w template.tsx - cale drzewo nawigacji przemontowuje sie przy kazdej zmianie trasy

`sredni` · `app/template.tsx:11` · potwierdzone

app/template.tsx:11 `export default function Template({ children })` renderuje DesktopNavigation (29) albo MobileNavigation (34). Next.js App Router tworzy nowa instancje template.tsx przy kazdej nawigacji. Resetowane sa: useState expandedGroups (desktop-navigation.tsx:77), refy recordingStartTimeRef i wasRecordingRef (74-75) oraz useState isDesktop (template.tsx:12).

*Weryfikator:* POTWIERDZONE i POWAZNIEJSZE niz opisano. Trzy dodatkowe konsekwencje, ktorych audytor nie wyciagnal: (1) `isDesktop` startuje z false, wiec na desktopie po KAZDEJ nawigacji pierwszy render to layout mobilny - widoczny przeblysk mobilnego UI; (2) przemontowanie odpala cleanup efektu (linia 104), ktory kasuje 300 ms timer auto-zapisu - nawigacja w ciagu 300 ms po zatrzymaniu nagrania kasuje sesje bezpowrotnie; (3) samo nagrywanie NIE przerywa sie, bo AudioRecorderProvider siedzi wyzej, w layout.tsx:55 - czyli mikrofon dalej pracuje, a mechanizm zapisu juz nie istnieje.

### 95. Przestarzale domkniecie w handlerze YouTube - nagrywanie nie zatrzymuje sie po zakonczeniu lub zapauzowaniu utworu

`sredni` · `app/record/karaoke/page.tsx:105` · znalezione przy weryfikacji

Handler onStateChange jest tworzony raz, wewnatrz loadVideo (99-110), i domyka sie na wartosci `isRecording` z renderu, w ktorym uzytkownik wkleil URL - czyli na false. Kod `if (isRecording) { stopRecording() }` (105-107) nigdy sie nie wykona, bo w tym domknieciu isRecording pozostaje false na zawsze (a stopRecording tez jest przestarzala referencja, widzaca stare refy/stan). Nie ma zadnego useEffect aktualizujacego handlery playera.

**Skutek dla użytkownika:** Gdy podklad z YouTube sie skonczy albo uzytkownik zapauzuje wideo, nagrywanie glosu leci dalej - do nagrania dolepia sie cisza albo rozmowy po utworze, a licznik czasu rosnie. Uzytkownik musi pamietac o recznym Stopie; jesli tego nie zrobi i przejdzie dalej, dziala scenariusz z wyciekiem zasobow opisany osobno.

**Naprawa:** Trzymac isRecording w refie czytanym w handlerze albo rejestrowac handlery playera w useEffect zaleznym od aktualnych callbackow. Docelowo synchronizacja podkladu i nagrania nie powinna opierac sie na eventach iframe'a YouTube - to potwierdza teze o slepym zaulku SING.

### 96. 'confidence' nie jest miara pewnosci - progi odrzucania w obu detektorach sa martwe, a filtry w UI dzialaja na przypadkowej liczbie

`sredni` · `lib/pitch-detector.ts:204` · znalezione przy weryfikacji

W pitch-detector.ts kandydat wchodzi na liste tylko gdy `yinBuffer[tau] < threshold` gdzie threshold = 0.25 (92-101), a nastepnie `const confidence = 1 - yinBuffer[tau]` (197). Z tego wynika confidence > 0.75 dla kazdego zwracanego wyniku, wiec check `if (confidence < 0.7) return null` (204) nie moze sie NIGDY wykonac. Identycznie w pitch-detector-pro.ts: prog kandydatow yinThreshold = 0.35 (161, 192), confidence = 1 - yinBuffer[tau] (207), a gate `if (winner.confidence < 0.6) return null` (285) jest nieosiagalny. Ta sama liczba jest potem uzywana jako realny filtr w app/record/karaoke/page.tsx:127 (`result.confidence > 0.9`) i hooks/use-vocal-range.ts:56, 106 (`p.confidence > 0.9`).

**Skutek dla użytkownika:** Dwa zabezpieczenia, ktore w kodzie wygladaja na kontrole jakosci detekcji, nie odrzucaja niczego - wszystkie ramki przechodza. Jednoczesnie filtr `confidence > 0.9` w karaoke i w liczeniu zakresu glosu odcina dane na podstawie glebokosci minimum funkcji YIN, ktora nie jest znormalizowana i zalezy od glosnosci oraz barwy - w praktyce na cichszym mikrofonie odrzuci prawie wszystko, na glosniejszym prawie nic. Efekt dla uzytkownika: nieprzewidywalne 'dziury' w analizie i pusty zakres glosu, bez zadnego zwiazku z tym, jak dobrze spiewa.

**Naprawa:** Rozdzielic dwie rzeczy: (a) surowy wskaznik periodycznosci YIN (do wyboru kandydata) i (b) jawna, kalibrowana miare zaufania na wyjsciu (np. znormalizowany HNR albo prawdopodobienstwo z modelu), na ktorej wolno oprzec progi w UI. Martwe gate'y usunac albo przestawic na wlasciwa metryke. Bez zestawu nagran referencyjnych z etykietami F0 (do czego potrzebne sa testy z punktu 1) tych progow nie da sie ustawic w sposob inny niz zgadywanie.

### 97. Funkcja roznicowa YIN zaklada bufor >= 2x maksymalny okres - przy 88,2/96 kHz sumy sa cicho obcinane, co przesuwa detekcje o oktawe w dol

`sredni` · `lib/pitch-detector.ts:74` · znalezione przy weryfikacji

pitch-detector.ts:74-82 (i identycznie pitch-detector-pro.ts:170-178): `for (tau...) for (let i = 0; i < MAX_PERIOD; i++) if (i + tau < SIZE) { ... yinBuffer[tau] += delta*delta }`. MAX_PERIOD = floor(sampleRate/65). Przy 48 kHz i buforze 2048 (analyser.fftSize, use-audio-recorder.ts:103) MAX_PERIOD = 738, wiec max i+tau = 1476 < 2048 i wszystko sie miesci. Przy 96 kHz MAX_PERIOD = 1476, wiec dla tau > 572 czesc skladnikow jest pomijana - a suma NIE jest normalizowana liczba faktycznie zsumowanych skladnikow, wiec d(tau) systematycznie maleje wraz z tau. Sprawdzone liczbowo: przy 96 kHz obcinanie zaczyna sie od tau = 573 z 1476.

**Skutek dla użytkownika:** Na urzadzeniach i interfejsach audio pracujacych w 88,2/96 kHz (zewnetrzne karty, czesc Androidow) sztucznie zanizone d(tau) dla duzych tau tworzy fałszywe minima w obszarze niskich czestotliwosci, wiec detektor uparcie pokazuje nute o oktawe (lub wiecej) nizsza niz zaspiewana. Uzytkownik widzi, ze aplikacja 'nie umie rozpoznac wysokosci', i nie ma zadnego sposobu, zeby to obejsc - sampleRate wynika ze sprzetu.

**Naprawa:** Rozdzielic dlugosc okna analizy W od maksymalnego opoznienia tau i wymagac bufora >= W + MAX_PERIOD (albo decymowac sygnal do stalej czestotliwosci roboczej, np. 16 kHz, co jednoczesnie kilkukrotnie skraca obliczenia). Minimum: normalizowac yinBuffer[tau] liczba zsumowanych skladnikow. Warto rowniez oderwac dlugosc bufora od analyser.fftSize i ustawiac ja jawnie na podstawie sampleRate.

### 98. Silnik multitracku tworzy AudioContext przy montowaniu i nigdy nie wola resume() - odtwarzanie po swiezym wejsciu na strone jest ciche

`sredni` · `lib/multi-track-engine.ts:32` · znalezione przy weryfikacji

MultiTrackEngine w konstruktorze robi `this.audioContext = new AudioContext()` (30-36), a konstruktor jest wolany w useEffect przy montowaniu komponentu, czyli bez gestu uzytkownika: components/multi-track-manager.tsx:44 i components/timeline/multi-track-timeline.tsx:69. Grep `resume(` po calym repo daje trzy trafienia i zadne nie jest w silniku multitracku: components/metronome.tsx:111, app/edit/studio/page.tsx:369, hooks/use-audio-recorder.ts:99. play() (128-197) planuje `source.start(now, offset)` na `this.audioContext.currentTime`, a getCurrentTime/pause licza sie wzgledem tego samego zegara (259).

**Skutek dla użytkownika:** Na Safari/iOS (i pod polityka autoplay w Chrome) kontekst utworzony bez gestu zostaje w stanie suspended, wiec pierwsze klikniecie Play w edytorze multitrack nie daje dzwieku, a glowica stoi na 0:00, bo audioContext.currentTime nie plynie. Uzytkownik widzi 'wlaczone' odtwarzanie bez dzwieku i bez ruchu. iOS to docelowa platforma projektu, a multitrack to filar PODCAST.

**Naprawa:** Nie tworzyc AudioContextu w konstruktorze/efekcie montowania. Tworzyc go leniwie przy pierwszej akcji uzytkownika i w play() zawsze robic `if (ctx.state !== 'running') await ctx.resume()`. To samo dotyczy pozostalych miejsc tworzacych konteksty poza gestem (lib/audio-synth.ts:19).

### 99. Brak try/finally wokol AudioContextow w Studio - kilka nieudanych dekodowan blokuje edytor do przeladowania strony, a eksport WAV buduje tablice JS ze wszystkich probek

`sredni` · `lib/audio-processor.ts:127` · znalezione przy weryfikacji

processAudio (122-225): `const audioContext = new AudioContext()` (127), `await audioContext.decodeAudioData(...)` (131), a `await audioContext.close()` dopiero w linii 222 na sciezce sukcesu - brak try/finally, wiec kazdy rzut z decodeAudioData albo z startRendering (216) zostawia otwarty kontekst. Identyczny wzorzec w getWaveformData (315-332: new AudioContext -> decode -> close na koncu). Osobno audioBufferToWavBlob (253-300) buduje `const data = []` i robi push dla KAZDEJ probki kazdego kanalu (262-271), zanim zaalokuje ArrayBuffer. Dodatkowo getWaveformData liczy `blockSize = Math.floor(channelData.length / samples)` (320) i dzieli przez blockSize (329) - dla klipu krotszego niz 1000 probek blockSize = 0 i cala tablica wychodzi NaN (to samo w lib/multi-track-storage.ts:746 generateWaveformData).

**Skutek dla użytkownika:** Nagrania webm/opus nie sa dekodowalne we wszystkich przegladarkach; kazda nieudana proba wczytania zostawia otwarty AudioContext, a po przekroczeniu limitu (~6 w Chrome) konstruktor rzuca i CALE Studio przestaje dzialac - kazde kolejne wczytanie, podglad i eksport konczy sie bledem do przeladowania karty. Przy eksporcie 3-minutowego stereo 48 kHz tablica JS z ~17 mln liczb zajmuje ~140 MB tylko na sam bufor pomocniczy, co na telefonie oznacza ubicie karty. Bardzo krotkie nagranie daje pusty (NaN) waveform, czyli niewidoczna sciezke.

**Naprawa:** Owinac oba miejsca w try/finally z close() w finally, a jeszcze lepiej trzymac jeden wspoldzielony AudioContext do dekodowania. Eksport WAV pisac wprost do prealokowanego DataView bez posredniej tablicy JS (rozmiar jest znany z audioBuffer.length). W obu generatorach waveformu zabezpieczyc `blockSize = Math.max(1, ...)` i przyciac liczbe slupkow do dlugosci sygnalu.

### 100. Przycinanie do MAX_SESSIONS zostawia osierocone blony audio w IndexedDB - magazyn rosnie bez konca

`sredni` · `hooks/use-session-library.ts:85` · znalezione przy weryfikacji

saveSession przycina liste sesji `updatedSessions.slice(0, MAX_SESSIONS)` (85) i zapisuje tylko metadane 50 najnowszych. deleteSessionAudio (import z lib/audio-storage w linii 4) jest wolane WYLACZNIE w deleteSession (143) - czyli przy recznym usuwaniu jednej sesji. Sesje wypchniete przez przycinanie nie maja swoich blobow usuwanych z bazy vocal-coach-audio, a klucz to sessionId (audio-storage.ts:34), do ktorego nie prowadzi juz zadna referencja. clearAllSessions (182-208) kasuje cala baze, ale to operacja resetu na zadanie uzytkownika.

**Skutek dla użytkownika:** Miejsce zajmowane przez aplikacje rosnie monotonicznie i nie da sie go odzyskac inaczej niz przez 'usun wszystkie sesje' albo czyszczenie danych strony. Po przekroczeniu limitu magazynu przegladarka zaczyna odrzucac zapisy IndexedDB (albo w ogole eksmituje cala origin), czyli uzytkownik traci nagrania, ktore chcial zachowac, z powodu smieci po nagraniach, ktorych nie widzi.

**Naprawa:** W momencie przycinania usuwac audio wypadajacych sesji (await deleteSessionAudio dla kazdego usunietego id) oraz dorzucic operacje 'garbage collect': przejscie po kluczach w store recordings i usuniecie tych, ktore nie maja odpowiednika w liscie sesji. Docelowo metadane i audio powinny nalezec do jednego magazynu z transakcyjnym usuwaniem, a nie do localStorage + IndexedDB bez zadnego wiazania.

### 101. Produkcyjny console.log w gorącej sciezce konwersji czestotliwosci na nute (10% wszystkich detekcji)

`niski` · `lib/pitch-detector.ts:28` · znalezione przy weryfikacji

frequencyToNote (14-33) konczy sie blokiem `if (Math.random() < 0.1) { console.log("[PitchDetect] ...") }` z komentarzem 'Debug logging (can be removed later)' (27-30). Funkcja jest wolana raz na kazda wykryta ramke: hooks/use-audio-recorder.ts:57 oraz lib/pitch-detector-pro.ts:320. Formatowanie stringa (toFixed) wykonuje sie przed sprawdzeniem, czy ktokolwiek to czyta.

**Skutek dla użytkownika:** Na produkcji (sing.arvind.digital) konsola dostaje kilka wpisow na sekunde przez cale nagranie, co przy dlugiej sesji zapycha bufor DevTools i realnie zwalnia karte przy otwartych narzedziach; przy zamknietej konsoli to nadal zbedna alokacja stringow w petli 60 Hz. Ubocznie: konsola jest nieczytelna dla diagnozowania czegokolwiek innego.

**Naprawa:** Usunac log albo schowac go za flaga debug przekazywana jawnie (nie za Math.random). Przy okazji: to samo dotyczy logow w lib/multi-track-engine.ts:75, 196, 205 i app/record/karaoke/page.tsx:236 - warto miec jeden przelacznik diagnostyki, bo po przejsciu na natywne te logi trzeba bedzie usunac tak czy inaczej.

**Warte zachowania z tego obszaru:**

- Warstwa DSP jest calkowicie czysta - zero API przegladarki, gotowa do przeniesienia na Swift/Kotlin lub do skompilowania jako wspolny rdzen — lib/pitch-detector.ts, lib/pitch-detector-pro.ts, lib/fft-analyzer.ts, lib/midi-parser.ts, lib/automation.ts - grep za AudioContext|navigator|document|window|localStorage|indexedDB zwraca 0 trafien w 
- Gry i tryb treningowy maja juz poprawny podzial hook (logika) vs komponent (UI) - jedyne miejsce w repo z taka dyscyplina — hooks/use-hit-the-note-game.ts (314), hooks/use-hit-the-chord-game.ts (331), hooks/use-training-mode.ts (223), hooks/use-sing-along.ts (411) - wszystkie 0 trafien w grepie za API przegladarki, konsumo
- TypeScript strict:true i build faktycznie uruchamia sprawdzanie typow - `npx tsc --noEmit` konczy sie kodem 0, zero bledow; next.config.ts NIE zawiera ignoreBuildErrors ani ignoreDuringBuilds — tsconfig.json: "strict": true; next.config.ts nie ma sekcji typescript ani eslint; `npx next build` -> "Running TypeScript ..." -> sukces, 31 stron prerenderowanych
- Dane domenowe gitary (stroje, akordy, przeliczanie centow) to czysty model bez UI — lib/guitar.ts:27 TUNINGS, :103 CHORDS, :221 getCentsDifference, :232 getTuningStatus - tylko playTone/playGuitarString (linie 239, 275) dotykaja AudioContext
- Model automatyzacji dla podcastu (krzywe, interpolacja, parametry) jest czysty i przenosny mimo ze UI ktore go konsumuje jest w polowie martwe — lib/automation.ts (318 linii) - 0 trafien w grepie za API przegladarki; generateCurvePoints, AUTOMATION_LABELS, AUTOMATION_COLORS

**Duplikaty / martwy kod:**

- /training -> stub redirect na /train (app/training/page.tsx, 21 linii, nielinkowany)
- /training/exercises -> stub redirect na /train/exercises (21 linii)
- /training/game -> stub redirect na /train/game (21 linii)
- /training/singalong -> stub redirect na /train/singalong (21 linii)
- /progress -> stub redirect na /library/progress (app/progress/page.tsx, 21 linii); prawdziwa strona to app/library/progress/page.tsx (227 linii, filtry czasowe, streak, VocalRangeDisplay, ProgressCharts)
- /sessions -> stub redirect na /library (21 linii); prawdziwa strona to app/library/page.tsx (248 linii)
- /analysis -> stub redirect na /library (22 linie)
- /karaoke -> stub redirect na /record/karaoke (21 linii); prawdziwa strona to app/record/karaoke/page.tsx (532 linie)
- /studio -> stub redirect na /edit/studio (33 linie, jedyny ktory zachowuje query params); prawdziwa strona to app/edit/studio/page.tsx (1197 linii - najwiekszy plik w repo)
- /about -> stub redirect na /settings (21 linii)
- /record -> hub-sierota (64 linie), nielinkowany z nawigacji, duplikuje grupe 'Practice' z desktop-navigation
- /edit -> hub-sierota (64 linie), nielinkowany z nawigacji; jedyna droga do /edit/projects poza nim to przycisk w app/edit/studio/page.tsx:665
- components/session-library.tsx (400 linii) - martwy, zero importerow; funkcjonalnie zastapiony przez app/library/page.tsx, ale zawiera nieprzeniesiona funkcje porownywania dwoch sesji
- components/audio-playback.tsx (171 linii) - martwy tranzytywnie, importowany tylko przez martwy session-library.tsx
- components/multi-track-manager.tsx (461 linii) - martwy, zero importerow; zastapiony przez components/timeline/multi-track-timeline.tsx
- components/track-controls.tsx (238 linii) - martwy tranzytywnie, importowany tylko przez martwy multi-track-manager.tsx
- components/training-hub.tsx (194 linie) - martwy, przedrutingowa wersja huba treningowego ze stanem 'menu'|'exercises'|'game'|'singalong'; zastapiony przez trasy /train/*
- hooks/use-hotkeys.ts (64 linie) - martwy, pozostalosc po commicie 4fe8543 'desktop workspace UI with keyboard shortcuts'
- components/ui/card.tsx (75 linii), components/ui/command.tsx (155 linii) - martwe komponenty shadcn
- hooks/use-audio-recorder.ts (229) vs hooks/use-audio-recording.ts (81) - myląco podobne nazwy, rozne odpowiedzialnosci (analiza pitchu vs MediaRecorder); oba zszyte w contexts/audio-recorder-context.tsx, ktory dla drugiego strumienia wola getUserMedia PONOWNIE w setTimeout 100 ms (linie 62-73) zamiast wspoldzielic jeden MediaStream
- IndexedDB store 'templates' zdefiniowany w dwoch roznych bazach: lib/multi-track-storage.ts:12 (baza vocal-coach-multitrack) i lib/project-templates.ts:133 (baza vocal-coach-templates)
- public/'A HA.Take on me K.mid' (48k) vs public/Aha_-_Take_On_Me.mid (35k) - ten sam utwor dwa razy
- Dwa rownolegle systemy analityki: lib/analytics.ts (gtag, G-BFQ35YS210, wpiety w app/layout.tsx) + @vercel/analytics (app/layout.tsx:4) - ten drugi nic nie robi na Cloudflare Pages
- Zdublowana detekcja breakpointu window.innerWidth >= 1024: app/template.tsx:19 i app/record/live/page.tsx:37
- public/file.svg, globe.svg, next.svg, vercel.svg, window.svg - pozostalosci szablonu create-next-app

---

## Silnik detekcji wysokosci dzwieku (F0) - lib/pitch-detector.ts, lib/pitch-detector-pro.ts, lib/fft-analyzer.ts + warstwa konsumujaca (use-audio-recorder, use-voice-profile, use-vocal-range, current-note-display, karaoke, guitar-tuner)

> Rdzen YIN (funkcja roznicowa + CMND + interpolacja paraboliczna) jest matematycznie poprawny i zgodny z de Cheveigne & Kawahara 2002 - to jakies 40 linii kodu, ktore warto zachowac. Wszystko co zbudowano NAD tym rdzeniem jest zepsute: krok 4 papieru (absolute threshold) zastapiono zestawem heurystyk, ktore w testach na sygnale syntetycznym daja bledy oktawowe i kwintowe dla KAZDEJ nuty powyzej ~E4 (330 Hz -> 165 Hz, 523 Hz -> 174 Hz, 880 Hz -> 220 Hz), a raz zablokowana wysokosc nigdy sie nie odblokowuje - skok o oktawe C3->C4 nie zostaje wykryty w ani jednej z 10 kolejnych ramek. Deklarowane filtry antyharmoniczne to martwy kod (kandydaci sa posortowani malejaco po czestotliwosci, wiec badany stosunek jest zawsze < 1 i warunek "abs(ratio-2)<0.05" nie moze byc nigdy spelniony - potwierdzone licznikiem: 0 trafien na 9 przypadkow testowych). Tryb "Pro", ktory jest DOMYSLNY, liczy naiwna DFT O(N^2) - zmierzone 26,9 ms na ramke na M-series w Node (2,1 mln iteracji z 4,2 mln wywolan Math.cos/sin), co samo w sobie ogranicza aplikacje do ~37 fps na desktopie i realnie ~10 fps na telefonie, przy czym cecha, dla ktorej ta DFT jest liczona (harmonicScore), przyjmuje tylko trzy wartosci {1.0, 0.4, 0.3} i nie rozroznia prawdziwego F0 od jego subharmonicznych - remisy rozstrzyga szum zmiennoprzecinkowy. Do tego nie ma zadnej segmentacji na nuty (onset/offset), caly system ocenia per-ramke, a stan detektora jest globalny i mutowalny na poziomie modulu. Poza silnikiem: strona karaoke i tuner gitarowy maja wlasne, blednie zaimplementowane konwersje Hz->nuta (karaoke pokazuje kazda nute o oktawe za nisko, tuner pokazuje A/A#/B o oktawe za wysoko - struna A2 gitary wyswietla sie jako "A3").

**Werdykt: rewrite** — Nie da sie tego naprawic lataniem, bo zepsuta jest warstwa DECYZYJNA (wybor kandydata), a nie warstwa obliczeniowa, i ta warstwa decyzyjna zostala zbudowana z heurystyk, ktore albo nie dzialaja (martwe filtry), albo dzialaja przeciwko uzytkownikowi (kara za skok oktawowy = blokada na jednej nucie). Do tego caly kontrakt API jest nie do przeniesienia: funkcje modulowe z globalnym stanem, wywolywane z requestAnimationFrame na glownym watku, ze sztywnym zalozeniem bufora 2048 z AnalyserNode. Na iOS/Android trzeba bedzie callbacku audio o stalym hopie, instancji detektora na strumien i pracy offline (multitrack w PODCAST). Do zachowania jest okolo 60 linii: CMND, interpolacja paraboliczna, noteToFrequency, tabela typow glosu. Reszte (okolo 800 linii pitch-detector + pro + fft-analyzer + trzy duplikaty konwersji Hz->nuta) napisac od nowa jako czysty, bezstanowy modul DSP: prawdziwe FFT radix-2 lub pominiecie FFT na rzecz YIN/pYIN/CREPE, wybor kandydata przez Viterbi po siatce nut (a nie przez jednoramkowe heurystyki), segmentacja onset/offset i ocena per-nuta. Bez tego zaden z trzech filarow (TRAIN wymaga poprawnej intonacji, SING wymaga poprawnej detekcji do korekty, PODCAST i tak tego nie uzywa) nie ma fundamentu.

### 102. Tryb Pro (DOMYSLNY) liczy naiwna DFT O(N^2) na glownym watku - 26,9 ms na ramke

`KRYTYCZNY` · `lib/fft-analyzer.ts:24` · potwierdzone

Petla `for (let k = 0; k < fftSize / 2; k++) { for (let n = 0; n < fftSize; n++) { const angle = -2 * Math.PI * k * n / fftSize; ... Math.cos(angle) ... Math.sin(angle) } }` istnieje doslownie w liniach 24-32. Wywolanie: lib/pitch-detector-pro.ts:248 `computeFFTMagnitudes(buffer, 2048)`, raz na ramke, z buffer o dlugosci analyser.fftSize=2048 (hooks/use-audio-recorder.ts:103). Tryb pro jest domyslny: hooks/use-audio-recorder.ts:19 `useState<DetectionMode>("pro")`.

*Weryfikator:* Zmierzone przeze mnie niezaleznie (Node 25.1, Apple Silicon, 20 przebiegow): computeFFTMagnitudes(2048) = 25,94 ms/ramke, caly detectPitchPro = 26,94 ms/ramke, detectPitch (basic) = 1,13 ms/ramke. Liczba auditora (26,9 ms) jest dokladna. Petla jest wywolywana z rAF (use-audio-recorder.ts:78), czyli synchronicznie na glownym watku - potwierdzone.

### 103. Systematyczny blad oktawowy/kwintowy dla kazdej nuty powyzej E4 - detektor jest zestrojony na 200 Hz

`KRYTYCZNY` · `lib/pitch-detector.ts:175` · potwierdzone

Linie 170-179: `bestCandidate = filteredCandidates.reduce((a, b) => { const vocalCenter = 200; const scoreA = a.value + Math.abs(Math.log2(a.freq / vocalCenter)) * 0.1; ... })`. Kandydaci maja value < 0.25 (prog z linii 92), wiec kara odleglosci od 200 Hz (0,214 dla 880 Hz) przewyzsza cala rozpietosc kryterium jakosci. Dla sygnalu okresowego CMND w tau = k*T jest ~0, wiec skladnik jakosciowy jest remisem i decyduje wylacznie kara.

*Weryfikator:* Uruchomilem detectPitch na sygnale harmonicznym (8 harmonicznych, 1/n, sr=48000, 2048 probek). Wyniki: C3 130,81->130,81 OK; G3 196->196 OK; C4 261,63->261,63 OK; E4 329,63->164,81 (÷2); G4 392->196,00 (÷2); C5 523,25->174,42 (÷3); E5 659,26->219,75 (÷3); A5 880->220,00 (÷4). Liczby auditora zgadzaja sie do drugiego miejsca. Numer linii poprawiony: 173 to `reduce`, sama stala vocalCenter jest w 175.

### 104. Blokada na jednej wysokosci - skok interwalowy nigdy nie zostaje wykryty

`KRYTYCZNY` · `lib/pitch-detector.ts:156` · potwierdzone

Linia 156 `semitoneDistance = octaveRemainder + octaves * 15` wewnatrz score z linii 163 `semitoneDistance * 3.0 + c.value * 20` (45 pkt kary vs 5 pkt calego zakresu jakosci), plus twarde odrzucenie w liniach 225-228 `if (semitones > 5) return null` po tescie ratio ~2/3/4.

*Weryfikator:* Zmierzone: po 10 ramkach C3 (130,81) podanie C4 (261,63) daje 130,82 Hz w KAZDEJ z 10 kolejnych ramek - dokladnie jak twierdzi auditor. Skok kwintowy C4->G4 daje 196,00 Hz (G3, oktawa nizej) we wszystkich 6 ramkach. DODATKOWO, czego auditor nie zauwazyl: blokada przezywa cisze. Po 10 ramkach C3, 30 ramkach cyfrowej ciszy (detectPitch zwraca null przez prog RMS w linii 69, NIE zerujac previousFrequency) i podaniu G4=392 Hz detektor zwraca 130,7 Hz - trzecia subharmoniczna 392, ktora pasuje do starego C3. Blokada jest wiec trwala przez cala sesje, nie tylko przez jeden skok.

### 105. harmonicScore w trybie Pro nie rozroznia F0 od subharmonicznych - remisy rozstrzyga kolejnosc sortowania

`KRYTYCZNY` · `lib/pitch-detector-pro.ts:98` · potwierdzone

Linie 89-99: wczesne returny odsiewaja tylko `subharmonicEnergy > energy * 1.2` (-> 0.3) i `octaveAboveEnergy > energy * 1.5` (-> 0.4), gdzie subharmonic to WYLACZNIE f0/2 (linia 82) i octaveAbove WYLACZNIE f0*2 (linia 86). Potem `const maxEnergy = Math.max(energy, subharmonicEnergy, octaveAboveEnergy, 0.001); return Math.min(1, energy / maxEnergy)`.

*Weryfikator:* Potwierdzone empirycznie i znalazlem wlasciwy mechanizm, ktory auditor opisal tylko czesciowo: kontrola dotyczy jedynie f0/2 i f0*2, wiec NIEPARZYSTE subharmoniczne (f0/3, f0/5) nie sa sprawdzane w ogole i dostaja harmonicScore = 1.00, identyczny jak prawdziwe F0. Wydruk kandydatow dla C4: `87Hz h=1.00 s=0.50 r=0.50 f=0.750 | 262Hz h=1.00 s=0.50 r=0.50 f=0.750` - dokladny remis finalScore, rozstrzygniety przez sort. Zmierzone wyjscia: C4 261,63->87,21 (÷3); E4 329,63->65,93 (÷5); G4 392->78,40 (÷5); C5 523,25->174,42 (÷3); E5 659,26->131,85 (÷5); A5 880->175,99 (÷5). Tryb Pro jest wiec gorszy od basic (basic myli sie od E4, Pro juz od C4) i domyslny.

### 106. Nagranie audio NIGDY sie nie uruchamia - MediaRecorder jest za warunkiem, ktory jest zawsze falszywy. Uzytkownik traci kazde nagranie

`KRYTYCZNY` · `contexts/audio-recorder-context.tsx:62` · znalezione przy weryfikacji

`const startRecording = useCallback(async () => { await audioRecorder.startRecording(); if (audioRecorder.isRecording && streamRef.current === null) { setTimeout(async () => { ... await audioRecording.startAudioRecording(stream) }, 100) } ... }, [audioRecorder, audioRecording])`. `audioRecorder` to obiekt z domkniecia tego renderu, w ktorym callback powstal. W momencie klikniecia Start stan isRecording jest jeszcze `false`; audioRecorder.startRecording() ustawia go przez setIsRecording(true) (hooks/use-audio-recorder.ts:119), ale to nie zmienia przechwyconego obiektu. Po awaicie `audioRecorder.isRecording` nadal === false, wiec branch nie wchodzi. Grep potwierdza, ze startAudioRecording nie jest wywolywane NIGDZIE indziej w repo - to jedyny call-site. Po stopie audioBlob pozostaje null (hooks/use-audio-recording.ts:8,30-32 - onstop nigdy sie nie odpali, bo mediaRecorder nie powstal).

**Skutek dla użytkownika:** Na /record/live i na wszystkich stronach /train/* nagranie dzwieku nie powstaje w ogole. components/save-session-dialog.tsx:35 `const hasAudio = audioBlob !== null` jest zawsze false, wiec kazda sesja jest zapisywana bez audio i linia 41 `if (sessionId && audioBlob)` nigdy nie zapisuje pliku. Uzytkownik spiewa 5 minut, klika Zapisz, dostaje sesje z samymi liczbami i bez sciezki dzwiekowej. Studio (app/edit/studio/page.tsx:146 getSessionAudio) nie ma czego wczytac, wiec filary PODCAST i SING sa odciete od jedynego zrodla materialu, jakie generuje aplikacja.

**Naprawa:** Nie polegac na stanie Reacta jako sygnale gotowosci. useAudioRecorder powinien zwracac strumien (albo przyjmowac callback onStreamReady) i uruchamiac MediaRecorder na TYM SAMYM strumieniu, ktory juz otworzyl - obecny kod dodatkowo woła getUserMedia po raz drugi (linia 67), otwierajac drugi, niezaleznie wzmacniany strumien mikrofonu. Docelowo: jedno getUserMedia, jeden MediaStream, MediaRecorder i AnalyserNode podpiete do tego samego zrodla, start MediaRecordera synchronicznie po uzyskaniu strumienia, bez setTimeout(100).

### 107. Oba filtry antyharmoniczne to martwy kod - warunek nie moze byc nigdy spelniony

`wysoki` · `lib/pitch-detector.ts:114` · potwierdzone

Kandydaci sa zbierani w petli po rosnacym tau (linia 95) i mapowani na `freq: sampleRate / c.tau` (linia 108), wiec candidateFreqs jest posortowane MALEJACO po czestotliwosci. Filtr harmonicznych (116-126) porownuje `candidate.freq / candidateFreqs[i].freq` dla i < idx, gdzie candidateFreqs[i].freq jest ZAWSZE wieksze - iloraz < 1, nigdy nie zblizy sie do 2/3/4. Filtr subharmonicznych (129-135) porownuje `candidateFreqs[i].freq / candidate.freq` dla i > idx, gdzie candidateFreqs[i].freq jest ZAWSZE mniejsze - iloraz znowu < 1.

*Weryfikator:* Rozumowanie o monotonicznosci sprawdzilem na kodzie: nie ma zadnego sortowania miedzy linia 95 i 114, wiec kolejnosc rzeczywiscie jest malejaca po freq. filteredCandidates === candidateFreqs w kazdym przebiegu. Obnizam severity z critical na high: sam martwy kod nikomu nic nie psuje, szkoda (brak obrony przed subharmonicznymi) jest w pelni pokryta przez problemy #2 i #3. Komentarz w liniach 111-113 obiecuje ochrone, ktorej nie ma - to realny koszt dla kazdego, kto bedzie to debugowal.

### 108. Strona karaoke wyswietla kazda nute o oktawe za nisko (wlasna, bledna konwersja Hz->nuta)

`wysoki` · `app/record/karaoke/page.tsx:139` · potwierdzone

Linie 137-139: `const C0 = A4 * Math.pow(2, -4.75)` (=16,3516 Hz, poprawnie C0), `const halfSteps = Math.round(12 * Math.log2(frequency / C0))`, `const octave = Math.floor(halfSteps / 12) - 1`. halfSteps liczy polnuty od C0, wiec oktawa to floor(halfSteps/12), bez -1.

*Weryfikator:* Przeliczylem formule linia po linii: A4=440 -> halfSteps=57 -> "A3"; C4=261,63 -> "C3"; C3=130,81 -> "C2"; E2=82,41 -> "E1". Blad potwierdzony. KORYGUJE impact auditora: pitchHistory tej strony to lokalny useState (linia 32) przekazywany wylacznie do PitchVisualizer (linia 469) - nie jest nigdzie zapisywany ani nie trafia do sessions/statystyk zakresu glosu. Twierdzenie o zanieczyszczaniu globalnych statystyk jest bledne, dlatego obnizam severity z critical na high (blad jest w 100% realny, ale ograniczony do wyswietlania na tej stronie). Poprawka: uzyc istniejacego frequencyToNote() z lib/pitch-detector.ts, ktore liczy poprawnie (zweryfikowalem: A4->A4, C3->C3, E2->E2).

### 109. WEIGHTS: 50% budzetu punktowego to stale, ktore nie roznicuja kandydatow

`wysoki` · `lib/pitch-detector-pro.ts:47` · potwierdzone

getTemporalStabilityScore zwraca stale 0.5 gdy `recentF0s.length < 3` (linie 107-109); getUserRangeScore zwraca stale 0.5 gdy `!profile || profile.sampleCount < 50` (linie 129-131). WEIGHTS.temporalStability=0.3 + WEIGHTS.userRangeMatch=0.2 = 50% wagi jest wtedy identyczne dla wszystkich kandydatow, a 20% na stale dopoki nie ma profilu (hooks/use-voice-profile.ts:8 MIN_SAMPLES_FOR_PROFILE=50).

*Weryfikator:* Fakty potwierdzone w kodzie. Empirycznie widac to w wydruku kandydatow (`s=0.50 r=0.50` dla kazdego kandydata w kazdej z 8 testowanych nut). Sformulowanie "decyzja jest praktycznie losowa" wydawalo mi sie przesada, ale test to potwierdza: poniewaz harmonicScore tez daje 1.00 dla F0 i dla f0/3 (patrz problem wyzej), finalScore wychodzi doslownie identyczny (0.750) i wygrywa ten kandydat, ktory Array.sort postawi pierwszy. Potwierdzam bez korekty.

### 110. Tuner gitarowy pokazuje nuty A, A# i B o oktawe za wysoko

`wysoki` · `components/guitar-tuner.tsx:176` · potwierdzone

Linie 174-177: `const semitones = 12 * Math.log2(frequency / A4); const noteIndex = Math.round(semitones) + 9; const octave = Math.floor((noteIndex + 3) / 12) + 4`. Przesuniecie +3 zamiast +9 lamie sie na granicy G#->A.

*Weryfikator:* Przeliczylem formule dla calego strojenia standardowego: E2 82,41->"E2" OK, A2 110->"A3" BLAD, D3 146,83->"D3" OK, G3 196->"G3" OK, B3 246,94->"B4" BLAD, E4 329,63->"E4" OK, A4 440->"A5" BLAD, B4 493,88->"B5" BLAD, C4 261,63->"C4" OK. Podana przez auditora poprawka `Math.floor((Math.round(semitones) + 69) / 12) - 1` daje poprawny wynik dla wszystkich powyzszych przypadkow - sprawdzilem. To trzecia niezalezna implementacja Hz->nuta w repo (obok frequencyToNote i formuly w karaoke) i druga zepsuta.

### 111. Globalny mutowalny stan na poziomie modulu - jedna instancja detektora dla calej aplikacji, bez resetu przy starcie nagrywania

`wysoki` · `lib/pitch-detector.ts:42` · potwierdzone

lib/pitch-detector.ts:42-43 `let previousFrequency: number | null = null; let frequencyHistory: number[] = []`; lib/pitch-detector-pro.ts:57-58 `let recentF0s: number[] = []; let previousFrequencyPro: number | null = null`. Grep po calym repo: resetPitchTracking() wywolywane dokladnie raz (app/record/karaoke/page.tsx:186), resetProPitchTracking() dokladnie raz (hooks/use-audio-recorder.ts:187, tylko przy zmianie trybu). hooks/use-audio-recorder.ts startRecording (81-129) nie wywoluje zadnego z nich.

*Weryfikator:* Grep potwierdzil dokladnie te dwa call-site'y i zero innych. Potwierdzam i wzmacniam: skoro previousFrequency nie jest zerowane rowniez przy ciszy (detectPitch:69 zwraca null przed dotkniciem stanu), stan przezywa nie tylko granice nagran ale i dowolnie dluga przerwe w spiewie - zmierzylem to (30 ramek ciszy nie odblokowuje). Dla warstwy natywnej to dodatkowo blokada: singleton na module nie da sie zinstancjonowac per-track w edytorze podcastow.

### 112. Brak jakiejkolwiek segmentacji na nuty (onset/offset) - system ocenia wylacznie per-ramke

`wysoki` · `lib/pitch-detector.ts:244` · potwierdzone

detectPitch zwraca `{ frequency, confidence }` dla pojedynczej ramki (linia 244) i nic wiecej; brak flagi voiced/unvoiced, brak histerezy, brak zdarzen nuty. hooks/use-training-mode.ts:161-165 dzieli nagranie na okna PROPORCJONALNIE do zaplanowanych dlugosci nut: `const noteStartRatio = currentTime / totalDuration; const noteStartTime = startTime + noteStartRatio * actualDuration`, czyli zaklada, ze uzytkownik trafil w tempo idealnie.

*Weryfikator:* Potwierdzone. Dwie korekty/uzupelnienia. (1) Auditor przypisal do tego problemu takze liczenie centow wzgledem najblizszej nuty - w use-training-mode to NIE zachodzi: linie 192-193 licza `12 * Math.log2(avgFrequency / expectedFrequency)`, czyli poprawnie wzgledem nuty docelowej. (2) Znalazlem gorszy skutek braku segmentacji w tym samym miejscu: linia 189 usrednia czestotliwosc LINIOWO w Hz (`sum + p.frequency / length`), wiec jedna ramka z bledem oktawowym (a te wystepuja systematycznie powyzej E4) przesuwa avgCents o setki centow i przewraca ocene calej nuty. Usrednianie musi byc w domenie log/centow, po odrzuceniu ramek nieustabilizowanych.

### 113. Profil glosu uczy sie z blednych oktaw i tylko poszerza zakres - sprzezenie zwrotne utrwalajace blad

`wysoki` · `hooks/use-voice-profile.ts:104` · potwierdzone

Linie 104-107: `for (const f0 of newF0s) { if (f0 < minF0) minF0 = f0; if (f0 > maxF0) maxF0 = f0 }` - min/max sa monotonicznie rozszerzane i nigdy nie zwezane (jedyne wyjscie to wygasniecie po 30 dniach, linia 30). Zrodlo danych: contexts/audio-recorder-context.tsx:53 `addPitch(audioRecorder.currentPitch.frequency)` - surowe wyjscie detektora. Walidacja w linii 138 przepuszcza cale 50-2500 Hz. Profil wraca do detektora przez use-audio-recorder.ts:192 -> pitch-detector-pro.ts:259 getUserRangeScore.

*Weryfikator:* Potwierdzone w calosci, petla sprzezenia zamyka sie dokladnie tak, jak opisano. Dodam, ze skala problemu jest wieksza niz "pojedyncze bledne ramki": bledy subharmoniczne nie sa losowe, sa systematyczne (÷3 i ÷5 zmierzone wyzej), wiec kazda nuta powyzej C4 dokleja do profilu punkt w okolicy 65-90 Hz. minF0 osiada na dolnym limicie detektora (65 Hz) po pierwszej sesji, po czym getUserRangeScore (linie 134-137) uznaje kazda subharmoniczna za "wewnatrz zakresu".

### 114. pitchHistory rosnie bez ograniczen, kopiowana caloscia co ramke i filtrowana caloscia przez konsumentow co render

`wysoki` · `hooks/use-audio-recorder.ts:68` · potwierdzone

Linie 68-69: `historyRef.current = [...historyRef.current, pitchData]; setPitchHistory(historyRef.current)` - pelna kopia tablicy raz na ramke rAF, bez zadnego slice (dla porownania karaoke robi `.slice(-500)`, linia 156). Konsumenci filtruja cala tablice: components/current-note-display.tsx:77 detectVibrato -> pitch-detector.ts:252 `pitchHistory.filter(...)`; components/pitch-visualizer.tsx:28 i :183 (dwa razy na jedno draw); components/circle-visualizer.tsx:52 i :81.

*Weryfikator:* Potwierdzone, wszystkie cytowane miejsca istnieja. Uzupelnienie: koszt jest jeszcze wyzszy niz w zgloszeniu, bo pitch-visualizer.tsx rysuje canvas DWA razy na kazda nowa ramke (osobne zgloszenie w missed) i kazde draw wykonuje dwa pelne filtry po historii. Zlozonosc calosci jest kwadratowa w dlugosci nagrania.

### 115. Petla rAF trzyma zamrozone domkniecie - przycisk Pauza nic nie pauzuje, a suwak czulosci i przelacznik trybu detekcji nie dzialaja w trakcie nagrania

`wysoki` · `hooks/use-audio-recorder.ts:78` · znalezione przy weryfikacji

`const processAudio = useCallback(() => { if (!analyserRef.current || !audioContextRef.current || isPaused) { animationFrameRef.current = requestAnimationFrame(processAudio); return } ... animationFrameRef.current = requestAnimationFrame(processAudio) }, [isPaused, sensitivity, detectionMode])`. Identyfikator `processAudio` wewnatrz cialа funkcji wiaze sie ze stala `processAudio` z TEGO renderu, wiec petla rekurencyjnie planuje wciaz to samo, pierwotne domkniecie - to zaplanowane w startRecording (linia 124). Zmiana isPaused / sensitivity / detectionMode tworzy nowy processAudio, ktorego nikt nigdy nie planuje; zadnego useEffect przeplanowujacego petle w tym pliku nie ma.

**Skutek dla użytkownika:** togglePause (linia 158) zmienia tylko wyglad przycisku: detekcja wysokosci leci dalej, pitchHistory rosnie dalej, a licznik czasu (linie 75-76 `Date.now() - startTimeRef.current`) tez nie zatrzymuje sie, wiec po "pauzie" czas nagrania jest zawyzony. Przesuniecie suwaka Sensitivity w trakcie nagrania nie robi nic (nowa wartosc siedzi w nieuzywanym domknieciu), podobnie przelacznik Basic/Pro w AudioSettings - uzytkownik przelacza tryb, nie widzi zadnej zmiany i wyciaga wniosek, ze oba tryby sa identyczne. Trzeba zatrzymac i zaczac nagranie od nowa, tracac dane.

**Naprawa:** Przeniesc isPaused, sensitivity i detectionMode do refow (isPausedRef.current itd.) czytanych w petli, a samo processAudio zrobic stabilne (useCallback z pusta lista zaleznosci lub useRef na funkcje). Docelowo ta petla i tak musi zjechac z rAF do AudioWorklet/ScriptProcessor o stalym hopie - rAF nie jest zegarem audio i nie przeniesie sie na natywne.

### 116. Strona karaoke nie zwalnia mikrofonu ani AudioContextu - petla rAF i strumien zyja po opuszczeniu strony

`wysoki` · `app/record/karaoke/page.tsx:443` · znalezione przy weryfikacji

W calym pliku sa tylko dwa useEffecty (linie 46-49 tytul strony i 52-63 ladowanie YouTube API) - zadnego cleanupu przy unmount dla audioContextRef, analyserRef, animationFrameRef ani dla strumienia z getUserMedia (linia 191). Zwolnienie zasobow jest wylacznie w mediaRecorder.onstop (linie 223-235). Przycisk "Zmien wideo" (443-455) robi `setIsRecording(false)` i `player.destroy()`, ale nie wola stopRecording(), wiec MediaRecorder nie dostaje stop(), onstop sie nie odpala, cancelAnimationFrame nie jest wywolane i audioContext nie jest zamkniety.

**Skutek dla użytkownika:** Klikniecie "Zmien wideo" w trakcie nagrania albo zwykle przejscie na inna podstrone (Next.js client-side routing, komponent sie odmontowuje) zostawia zapalona diode mikrofonu, dzialajaca petle requestAnimationFrame wolajaca detectPitch (ok. 1,1 ms/ramke) i otwarty AudioContext. Kazde kolejne wejscie na strone dokłada nastepny strumien i nastepny AudioContext - przegladarki maja limit ~6 kontekstow, po czym audio przestaje dzialac w calej aplikacji do przeladowania karty. Na telefonie to takze ciagly drenaz baterii po wyjsciu ze strony.

**Naprawa:** Dodac useEffect z cleanupem zwalniajacym animationFrameRef, streamRef (getTracks().forEach(t => t.stop())), audioContextRef.close() i mediaRecorderRef.stop(); wywolac stopRecording() z handlera "Zmien wideo". Strumien nalezy trzymac w refie - obecnie zmienna `stream` jest tylko lokalna w startKaraoke (linia 191) i niedostepna spoza onstop.

### 117. Bezwzgledny prog RMS bez normalizacji, mierzony po programowym wzmocnieniu - trzy rozne wartosci w trzech miejscach

`sredni` · `lib/pitch-detector.ts:54` · potwierdzone

lib/pitch-detector.ts:54 `rmsThreshold = 0.001` (-60 dBFS); hooks/use-audio-recorder.ts:18 `useState(0.002)` (-54 dBFS); app/record/karaoke/page.tsx:126 `detectPitch(dataArray, ..., 0.01)` na sztywno (-40 dBFS). hooks/use-audio-recorder.ts:108-114 wpina GainNode (gain domyslnie 2.0, linia 17) miedzy source i analyser, wiec suwak Gain przesuwa rowniez efektywny prog RMS.

*Weryfikator:* Wszystkie trzy wartosci i topologia GainNode -> analyser potwierdzone w kodzie. CZESCIOWO ODRZUCAM impact: twierdzenie "na czulym mikrofonie szum wentylatora przechodzi prog i detektor produkuje przypadkowe nuty" nie ma poparcia. Przetestowalem bialy szum o rms 0,05 (25x powyzej progu 0,002): tryb basic 0/60 ramek zwrocil jakakolwiek wysokosc, tryb Pro 0/30. Prog CMND 0.25 (linia 92) plus brama `confidence < 0.7` (linia 204) skutecznie odrzucaja szum. Realny problem to tylko druga polowa: na cichym mikrofonie uzytkownik nie przechodzi progu i aplikacja wyglada na martwa, a prog zmienia sie przy ruszeniu suwaka Gain. Dlatego severity medium, nie high.

### 118. Centy w widoku na zywo sa liczone wzgledem NAJBLIZSZEJ nuty temperowanej, wiec falsz o polnute pokazuje sie jako 100% dokladnosci

`sredni` · `components/current-note-display.tsx:84` · potwierdzone

lib/pitch-detector.ts:16-17 `const roundedNote = Math.round(noteNumber); const cents = Math.round((noteNumber - roundedNote) * 100)` - centy zawsze w -50..+50 wzgledem najblizszego polnuty. components/current-note-display.tsx:82-84 `const cents = Math.abs(currentPitch.cents); return Math.max(0, Math.round(100 - (cents * 2)))`. lib/pitch-detector.ts:282 `if (absCents <= 10) return "perfect"`.

*Weryfikator:* Fakty potwierdzone. KORYGUJE zakres: blad dotyczy tylko sciezki wyswietlania na zywo (current-note-display.tsx, pitch-visualizer.tsx:193, circle-visualizer.tsx:57/98/187). Warstwa oceny cwiczen i gier liczy centy POPRAWNIE wzgledem celu: hooks/use-training-mode.ts:192-193 i hooks/use-hit-the-note-game.ts:140 uzywaja expectedFrequency/targetFreq. Twierdzenie "podwaza cala wartosc filaru TRAIN" jest wiec zbyt szerokie. Zostaje realny problem UX: na stronie /record/live nie ma nuty docelowej, wiec wskaznik "Dokladnosc 100% / Swietnie!" nagradza kazde stabilne trzymanie dowolnej wysokosci, w tym falszowanie o polnute. Severity medium.

### 119. Auto-stop karaoke po zakonczeniu utworu nie dziala - handler YouTube czyta zamrozone isRecording

`sredni` · `app/record/karaoke/page.tsx:105` · znalezione przy weryfikacji

Player jest tworzony raz, w setTimeout wewnatrz loadVideo (linie 90-115), a jego handler zawiera `if (event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.ENDED) { setIsPlaying(false); if (isRecording) { stopRecording() } }`. `isRecording` jest przechwycone z renderu, w ktorym powstal loadVideo - a wideo mozna zaladowac tylko przed rozpoczeciem nagrywania (przycisk Start jest w bloku `!videoId`... i tak isRecording jest wtedy false). Handler nigdy nie jest odtwarzany z nowa wartoscia, bo player nie jest przebudowywany.

**Skutek dla użytkownika:** Gdy utwor sie konczy albo uzytkownik zapauzuje wideo, nagrywanie mikrofonu nie zatrzymuje sie. Nagranie rosnie dalej (MediaRecorder z timeslice 100 ms), licznik czasu leci, a uzytkownik dostaje plik z minutami ciszy albo rozmow po koncu utworu. Obiecane w UI zachowanie po prostu nie zachodzi.

**Naprawa:** Trzymac isRecording w refie i czytac ref w handlerze, albo reagowac na zmiane isPlaying w useEffect zamiast wewnatrz domkniecia handlera playera.

### 120. Tryb Pro nie ma zadnej bramy jakosci - sprawdzenie confidence jest nieosiagalne

`sredni` · `lib/pitch-detector-pro.ts:285` · znalezione przy weryfikacji

Kandydaci sa dopuszczani tylko gdy `yinBuffer[tau] < yinThreshold` z yinThreshold = 0.35 (linie 161, 192), a confidence jest definiowane jako `1 - yinBuffer[tau]` (linia 207). Zatem confidence kazdego kandydata jest > 0.65. Pozniejsze `if (winner.confidence < 0.6) { return null }` (linie 285-287) nie moze byc nigdy prawdziwe. Dla porownania tryb basic ma realna brame `if (confidence < 0.7) return null` (pitch-detector.ts:204).

**Skutek dla użytkownika:** Tryb Pro przyjmuje kazdego kandydata, ktory przeszedl prog CMND 0.35, czyli jest o 0,1 luzniejszy od basic i pozbawiony dodatkowej weryfikacji. W praktyce oznacza to wiecej ramek z odczytem na dzwiekach szumowych (spolgloski, oddech, syk), gdzie basic zwrocilby null i wykres pokazalby przerwe. Przy okazji: ta martwa linia sugeruje czytajacemu, ze Pro ma ostrzejsza kontrole niz basic, co jest odwrotnoscia prawdy.

**Naprawa:** Albo obnizyc yinThreshold, albo (lepiej) zastapic prog CMND wlasciwym krokiem 4 z de Cheveigne & Kawahara: wybierac pierwsze minimum ponizej absolutnego progu i zwracac aperiodicity = d'(tau) jako miare jakosci, a decyzje voiced/unvoiced podejmowac na aperiodicity + RMS z histereza.

### 121. Funkcja roznicowa YIN nie jest normalizowana liczba zsumowanych elementow - przy sampleRate >= 88200 Hz sumy dla duzych tau sa obcinane, co systematycznie faworyzuje niskie czestotliwosci

`sredni` · `lib/pitch-detector.ts:74` · znalezione przy weryfikacji

`for (let tau = 0; tau < MAX_PERIOD; tau++) { yinBuffer[tau] = 0; for (let i = 0; i < MAX_PERIOD; i++) { if (i + tau < SIZE) { const delta = buffer[i] - buffer[i + tau]; yinBuffer[tau] += delta * delta } } }` (linie 74-82; identyczny kod w pitch-detector-pro.ts:170-178). MAX_PERIOD = floor(sampleRate / 65), SIZE = buffer.length = 2048. Warunek `i + tau < SIZE` cicho pomija elementy, ale suma nie jest dzielona przez ich liczbe. Przy 48000 Hz MAX_PERIOD=738 i 738+737=1475 < 2048, wiec obciecia nie ma. Przy 88200 Hz MAX_PERIOD=1356, przy 96000 Hz MAX_PERIOD=1476 - dla tau=1475 sumowane jest tylko 573 z 1476 elementow, czyli d(tau) jest zanizone ok. 2,6x wzgledem malych tau. Zadnego sprawdzenia `buffer.length >= 2 * MAX_PERIOD` w kodzie nie ma.

**Skutek dla użytkownika:** Na sprzecie raportujacym 88,2/96 kHz (zewnetrzne interfejsy audio, czesc konfiguracji macOS - AudioContext bez opcji sampleRate bierze wartosc sprzetowa) funkcja roznicowa jest przekrzywiona w strone dlugich okresow, czyli w strone subharmonicznych - dokladnie w kierunku bledu, ktory aplikacja juz ma. Na moim tescie z czystym sygnalem synetycznym nie udalo mi sie tego jeszcze wywolac (130-262 Hz wykrywane poprawnie przy 96 kHz), bo minima CMND w tau=k*T sa tam dokladnie zerowe - dlatego oznaczam medium, nie high. Ryzyko materializuje sie na realnym, szumnym glosie i przy przenoszeniu na natywne, gdzie rozmiary buforow i sampleRate sa inne (iOS potrafi dac 44100 lub 48000, Android bywa 16000).

**Naprawa:** Liczyc d(tau) jako srednia na element (dzielic przez faktyczna liczbe zsumowanych probek) albo, poprawniej, wymusic niezmienna dlugosc okna W i wymagac buffer.length >= W + MAX_PERIOD, walidujac to na wejsciu i zwiekszajac analyser.fftSize gdy sampleRate jest wysoki. Docelowo: przejsc na sumy skumulowane (roznicowa YIN da sie policzyc przez autokorelacje w O(N log N) z FFT), co usuwa i ten blad, i O(N^2).

### 122. suggestVoiceType zwraca pierwszy typ z tablicy, nie najlepszy - soprany sa oznaczane jako tenor, a kazdy waski zakres jako bas

`sredni` · `hooks/use-vocal-range.ts:48` · znalezione przy weryfikacji

`const matches = VOICE_TYPES.filter(type => { ... return overlap > 0 && overlap >= rangeMidi * 0.5 }); if (matches.length === 0) return undefined; // Return the voice type with best overlap\n return matches[0].name` (linie 36-48). Komentarz obiecuje najlepsze pokrycie, kod bierze element o najnizszym indeksie, a VOICE_TYPES (linie 17-24) jest uporzadkowane od Bass. Kryterium to 50% ZAKRESU UZYTKOWNIKA, nie zakresu typu glosu: dla zakresu C4-C6 (MIDI 60-84, rangeMidi=24) Tenor daje overlap 12 >= 12 i Soprano 24 >= 12, wiec matches=[Tenor, Soprano] i zwracany jest "Tenor". Dla uzytkownika, ktory zaspiewal jedna nute C4 (rangeMidi=0, prog 0), pierwszym trafieniem jest Bass (overlap 4 > 0).

**Skutek dla użytkownika:** Sopran, ktory poprawnie zaspiewal caly swoj zakres, dostaje etykiete "Tenor". Ktokolwiek zaspiewa krotki fragment w okolicy C4-E4 dostaje "Bass". To jest widoczna, konkretna liczba prezentowana uzytkownikowi jako diagnoza jego glosu, wiec blad podkopuje zaufanie do calego modulu, niezaleznie od bledow detektora. Ta sama funkcja jest uzywana dwukrotnie: w useVocalRange (linia 79) i w getVocalRangeFromSessions (linia 125), wiec dotyczy i widoku na zywo, i historii postepow.

**Naprawa:** Wybierac maksimum po metryce pokrycia, np. `matches.reduce((best, t) => score(t) > score(best) ? t : best)` gdzie score to Jaccard (overlap / union) albo pokrycie zakresu TYPU, nie uzytkownika; wymagac minimalnej dlugosci zakresu uzytkownika (np. >= 12 polnut) przed jakakolwiek sugestia; liczyc percentyle (np. 5. i 95.) zamiast skrajnych min/max, ktore sa zdominowane przez pojedyncze bledne ramki.

### 123. Przelacznik strict octave w grze nie dziala do konca aktualnej nuty - brak strictOctave w zaleznosciach useCallback

`sredni` · `hooks/use-hit-the-note-game.ts:238` · znalezione przy weryfikacji

`const processPitch = useCallback((pitch: PitchData) => { ... if (!strictOctave) { while (semitonesDiff > 6) semitonesDiff -= 12; ... } ... }, [phase, currentNote, generateRandomNote])` - strictOctave (parametr hooka, linia 39, czytany w linii 145) nie jest w liscie zaleznosci. components/hit-the-note-game.tsx:28 trzyma go w useState i przekazuje do hooka (linia 45), a przelacznik jest w linii 144.

**Skutek dla użytkownika:** Uzytkownik klika przelacznik "strict octave" w trakcie gry, UI zmienia stan (linie 138-150 pokazuja nowy opis), ale scoring dalej uzywa starej wartosci az do zmiany nuty albo fazy. Przy wlaczonym trybie tolerancji oktawowej - dodanym wlasnie po to, by obejsc bledy oktawowe detektora (komentarz w liniach 142-143 mowi to wprost) - uzytkownik dalej nie moze zaliczyc nuty i nie rozumie dlaczego.

**Naprawa:** Dodac strictOctave do tablicy zaleznosci processPitch. Docelowo tryb tolerancji oktawowej to plaster na blad detektora z problemu #2/#5 - po naprawie detektora powinien zniknac, bo maskuje realne pomylki oktawowe uzytkownika w cwiczeniu, ktore ma uczyc wysokosci.

### 124. PitchVisualizer rysuje canvas dwa razy na kazda ramke i przebudowuje petle rAF 60 razy na sekunde

`sredni` · `components/pitch-visualizer.tsx:353` · znalezione przy weryfikacji

`const draw = useCallback(() => {...}, [pitchHistory, currentPitch, isRecording])` (koniec w linii 352) - identycznosc draw zmienia sie przy kazdej nowej ramce, bo pitchHistory to nowa referencja tablicy co ramke (hooks/use-audio-recorder.ts:68). Nastepnie `useEffect(() => { draw() }, [draw])` (353-355) wykonuje dodatkowe pelne rysowanie przy kazdej zmianie, a `useEffect(..., [isRecording, draw])` (357-371) demontuje i ponownie tworzy petle animate/requestAnimationFrame przy kazdej zmianie draw. Kazde draw wykonuje dwa pelne filtry po calej historii (linia 28 w calculateVisibleRange i linia 183).

**Skutek dla użytkownika:** Podwojony koszt rysowania canvasu (pelny repaint z gradientami, cieniami i shadowBlur po kazdej klawiszu fortepianu) plus cztery pelne przejscia po rosnacej bez ograniczen historii na ramke. To mnoznik do potwierdzonego problemu #13: spadek fps nie jest liniowy, a odczuwalny juz po ok. minucie. Na telefonie razem z 26,9 ms DFT w trybie Pro daje to kilka fps.

**Naprawa:** Odczepic rysowanie od tozsamosci draw: trzymac pitchHistory/currentPitch w refach aktualizowanych w useEffect i uruchomic petle rAF raz, na [isRecording]. Rownolegle ograniczyc bufor historii (ring buffer o stalym rozmiarze) i utrzymywac wstepnie przefiltrowane okno widoczne, zamiast filtrowac cala historie w kazdej klatce.

### 125. Alokacje w gorącej petli - kilkaset kB smieci na sekunde plus 60 renderow calego drzewa kontekstu na sekunde

`sredni` · `hooks/use-audio-recorder.ts:39` · znalezione przy weryfikacji

Na kazda ramke rAF: `const buffer = new Float32Array(bufferLength)` (linia 39, 2048 float = 8 kB), `new Float32Array(MAX_PERIOD)` w YIN (lib/pitch-detector.ts:72 oraz pitch-detector-pro.ts:168), a w trybie Pro dodatkowo `new Float32Array(fftSize / 2)` i `new Float32Array(fftSize)` (lib/fft-analyzer.ts:14 i 17) - razem ok. 25 kB/ramke, czyli ~1,5 MB/s przy 60 fps. Do tego `setRecordingDuration(elapsed)` (linie 75-76) jest wolane w kazdej ramce, choc czas jest wyswietlany z rozdzielczoscia sekundy, co wymusza re-render calego AudioRecorderProvider i wszystkich konsumentow kontekstu 60 razy na sekunde. Analogicznie app/record/karaoke/page.tsx:122 alokuje bufor na ramke i wola setCurrentVolume co ramke.

**Skutek dla użytkownika:** Cykle GC widoczne jako mikroprzycięcia wizualizacji, na urzadzeniach mobilnych regularne zaciecia i szybsze rozladowanie baterii. Re-render kontekstu 60 razy na sekunde propaguje sie do kazdego komponentu uzywajacego useAudioRecorderContext, nawet tych, ktore potrzebuja tylko czasu z dokladnoscia do sekundy.

**Naprawa:** Zaalokowac wszystkie bufory raz (refy / pola instancji detektora zamiast globalnych funkcji) i uzywac ich ponownie. Czas nagrania aktualizowac osobnym setInterval(1000) albo trzymac w refie i czytac lokalnie w komponencie licznika. To sa dokladnie te same zmiany, ktore beda konieczne przy przejsciu na AudioWorklet i na natywne - w obu srodowiskach alokacja w callbacku audio jest niedopuszczalna.

### 126. Debugowy console.log w gorącej sciezce detekcji trafia do builda produkcyjnego

`niski` · `lib/pitch-detector.ts:28` · znalezione przy weryfikacji

`if (Math.random() < 0.1) { console.log(\`[PitchDetect] ${frequency.toFixed(2)} Hz → ${result.note}${result.octave} (MIDI note ${roundedNote})\`) }` (linie 27-30, z komentarzem "can be removed later"). frequencyToNote jest wolane raz na ramke (hooks/use-audio-recorder.ts:57 i lib/pitch-detector-pro.ts:320). next.config.ts nie ustawia `compiler.removeConsole`, wiec log zostaje w statycznym exporcie. Podobnie components/hit-the-note-game / use-hit-the-note-game.ts:99 loguje kazda odtworzona nute.

**Skutek dla użytkownika:** Ok. 6 wpisow na sekunde do konsoli w produkcji przez cala sesje nagrywania. Przy podlaczonym remote debuggerze (typowe na iOS Safari) sam koszt serializacji i utrzymywania bufora konsoli jest mierzalny, a konsola staje sie bezuzyteczna do diagnozowania czegokolwiek innego. Dodatkowo template string i toFixed sa wykonywane bezwarunkowo dla 10% ramek.

**Naprawa:** Usunac log albo schowac go za flaga debug czytana raz (np. localStorage.getItem('debug-pitch') w module scope, nie w kazdym wywolaniu) i dodac `compiler: { removeConsole: { exclude: ['error', 'warn'] } }` do next.config.ts.

### 127. previousFrequencyPro jest zapisywane, ale nigdy nie czytane - tryb Pro nie ma pojecia poprzedniej ramki poza srednia z 10

`niski` · `lib/pitch-detector-pro.ts:294` · znalezione przy weryfikacji

`let previousFrequencyPro: number | null = null` (linia 58), zerowane w resetProPitchTracking (linia 62), przypisywane `previousFrequencyPro = winner.frequency` (linia 294) - i nigdzie w pliku nie ma odczytu tej zmiennej (grep po pliku daje tylko te trzy wystapienia). Jednoczesnie detectPitchProWithNote (linie 309-332) jest eksportowane i nie ma zadnego konsumenta w repo.

**Skutek dla użytkownika:** Bezposrednio zaden, ale to mylacy sygnal architektoniczny: czytajac plik mozna zalozyc, ze Pro ma kontrole ciaglosci ramka-do-ramki, ktorej nie ma - getTemporalStabilityScore (linie 106-122) usrednia odleglosc od 10 ostatnich F0 bez wag i bez rozroznienia, czy ostatnia ramka byla dzwiekiem czy cisza, wiec po przerwie w spiewie okno recentF0s wciaz zawiera stare nuty i przyciaga wynik do nich.

**Naprawa:** Usunac martwa zmienna i nieuzywany eksport. Przy okazji: recentF0s powinno byc czyszczone po wykryciu ciszy (offset), inaczej okno stabilnosci przenosi stara nute przez dowolnie dluga przerwe - to ten sam blad klasy co potwierdzony problem #9 w trybie basic.

**Warte zachowania z tego obszaru:**

- Normalizacja CMND (cumulative mean normalized difference) jest dokladnie zgodna z rownaniem (8) z papieru de Cheveigne & Kawahara 2002 — lib/pitch-detector.ts:85-90 - `yinBuffer[0] = 1; let runningSum = 0; for (let tau = 1; tau < MAX_PERIOD; tau++) { runningSum += yinBuffer[tau]; yinBuffer[tau] *= tau / runningSum }`. Po dodaniu elemen
- Funkcja roznicowa uzywa STALEGO okna calkowania W = MAX_PERIOD niezaleznego od tau - to jest poprawna forma YIN (a nie bledny wariant sumujacy do SIZE-tau, ktory dawalby narastajaca stronniczosc dla duzych tau) — lib/pitch-detector.ts:74-82 - `for (let i = 0; i < MAX_PERIOD; i++) { if (i + tau < SIZE) ... }`. Przy 48 kHz MAX_PERIOD=738, wiec max i+tau = 1474 < SIZE=2048 - warunek nigdy nie ucina i liczba sumow
- Interpolacja paraboliczna wokol minimum jest poprawna i daje realne subsemitonowe rozroznienie — lib/pitch-detector.ts:186-194 - `const denom = 2 * (2 * s1 - s2 - s0); if (Math.abs(denom) > 0.0001) betterTau = tau + (s2 - s0) / denom`. Test: f0=82.4/98/110/130.8/146.8/196/220/261.6 Hz -> blad med
- noteToFrequency jest poprawna i jest jedyna konwersja nuta<->Hz w repo, ktora nie ma bledu oktawowego — lib/pitch-detector.ts:35-40 - `const noteNumber = (octave + 1) * 12 + noteIndex; return A4_FREQUENCY * Math.pow(2, (noteNumber - A4_NOTE_NUMBER) / 12)`. Uzywana przez audio-synth, hit-the-note-game i 
- Architektura wielohipotezowa w trybie Pro (lista kandydatow + scoring) to koncepcyjnie WLASCIWE podejscie - tylko cechy i wagi sa bez wartosci — lib/pitch-detector-pro.ts:251-282 - `const scoredCandidates = yinCandidates.map(...)` + sort po finalScore. Szkielet nadaje sie do podmiany na Viterbi/pYIN bez zmiany interfejsu wywolujacego.
- getUserMedia z wylaczonym AGC/NS/EC - poprawna decyzja dla analizy wysokosci dzwieku — hooks/use-audio-recorder.ts:87-90 - `echoCancellation: false, noiseSuppression: false, autoGainControl: false` oraz analyser.smoothingTimeConstant = 0 (linia 104). To jest DSP-owo prawidlowe (karaoke 
- Mechanika batchowania zapisow profilu glosu do localStorage (debounce 500 ms, ograniczony bufor historii) — hooks/use-voice-profile.ts:135-149 - `batchTimeoutRef.current = setTimeout(flushBatch, 500)` + `recentF0s.slice(-MAX_RECENT_F0S)`. Sam wzorzec jest dobry, statystyki wewnatrz sa zle (patrz problemy).
- Tabela zakresow typow glosu z numerami MIDI — hooks/use-vocal-range.ts:17-24 - VOICE_TYPES z lowMidi/highMidi. Dane sa poprawne muzycznie, tylko logika dopasowania jest bledna.
- Enkoder WAV (naglowek RIFF, konwersja float->PCM16) jest poprawny bitowo — lib/audio-processor.ts:273-299 - poprawny naglowek 44-bajtowy, poprawne skalowanie asymetryczne `intSample < 0 ? intSample * 0x8000 : intSample * 0x7fff`. Logika przenosi sie 1:1 na natywne.

**Duplikaty / martwy kod:**

- lib/pitch-detector.ts:111-138 - oba filtry antyharmoniczne (harmoniczne i subharmoniczne) sa martwym kodem: kandydaci sa posortowani malejaco po czestotliwosci, wiec badany stosunek jest zawsze < 1 i warunki abs(ratio-2)<0.05 / <0.08 nie moga byc spelnione. Zweryfikowane licznikiem: 0 trafien na 9 przypadkow testowych.
- lib/pitch-detector.ts:204 `if (confidence < 0.7) return null` - martwy: confidence = 1 - d'(tau), a kandydaci maja d' < 0.25, wiec confidence > 0.75 zawsze.
- lib/pitch-detector-pro.ts:285 `if (winner.confidence < 0.6) return null` - martwy z tego samego powodu (yinThreshold 0.35 -> confidence > 0.65).
- lib/pitch-detector-pro.ts:58,62,294 - previousFrequencyPro: trzy zapisy, zero odczytow.
- lib/fft-analyzer.ts:133-159 - computeHarmonicRatio nie jest importowana nigdzie (grep: tylko definicja). Martwa funkcja.
- lib/fft-analyzer.ts:71-105 findHarmonicPeaks + 44-65 getMagnitudeAtFrequency - uzywane wylacznie przez computeHarmonicEnergy w sciezce Pro, ktora i tak nalezy usunac razem z naiwna DFT.
- lib/pitch-detector-pro.ts:309-332 detectPitchProWithNote - eksportowana, ale nigdzie nie importowana (use-audio-recorder wola detectPitchPro i osobno frequencyToNote). Martwy eksport.
- TRZY niezalezne implementacje konwersji Hz -> nazwa nuty: lib/pitch-detector.ts:14-33 (poprawna), app/record/karaoke/page.tsx:136-146 (blad oktawy -1), components/guitar-tuner.tsx:171-179 (blad oktawy +1 dla A/A#/B). Dwie z trzech sa bledne.
- DWIE niezalezne implementacje detekcji F0: YIN w lib/pitch-detector.ts i autokorelacja w components/guitar-tuner.tsx:105-168 (klasyczny snippet autoCorrelate z MDN, z wlasnymi problemami: brak normalizacji, `while (c[d] > c[d+1]) d++` moze wyjsc poza tablice, brak zabezpieczenia gdy T0=0).
- DWIE prawie identyczne implementacje wyznaczania zakresu glosu: hooks/use-vocal-range.ts:51-92 (useVocalRange) i 94-137 (getVocalRangeFromSessions) - ta sama logika skopiowana linia w linie, druga wersja przyjmuje `sessions: any[]`.
- DWA rownolegle silniki detekcji (basic/pro) utrzymywane jako produkt, oba z bledami oktawowymi, przelaczane suwakiem w ustawieniach - to nie jest wybor dla uzytkownika, to nieukonczona migracja.
- lib/pitch-detector.ts:28-30 - `// Debug logging (can be removed later)` z console.log w hot pathu.
- hooks/use-hit-the-note-game.ts:95 - console.log przy kazdej granej nucie.
- lib/audio-processor.ts:122-225 processAudio i cala warstwa presetow - nie ma zwiazku z detekcja F0, ale sa niepodlaczone do glownego potoku nagrywania (grep za processAudio/PRESETS poza wlasnym plikiem: brak uzycia w app/record/*). Kod czeka na filar SING/PODCAST i w obecnej formie sie do niego nie nadaje (patrz problem z OOM w eksporcie WAV).

---

## Pipeline przechwytywania i przechowywania audio (capture + storage)

> Pipeline przechwytywania to w praktyce dwa rozjezdzone tory: tor ANALIZY (AnalyserNode + requestAnimationFrame + YIN) i tor NAGRYWANIA (MediaRecorder -> webm/opus), spiete klejem w contexts/audio-recorder-context.tsx. Tor nagrywania jest de facto MARTWY - warunek `audioRecorder.isRecording` w linii 62 kontekstu czyta stary closure i nigdy nie jest prawdziwy, wiec MediaRecorder nie startuje, audioBlob zawsze jest null, a mimo to desktop-navigation.tsx:92 zapisuje sesje z `hasAudio: true`. Tor analizy jest calkowicie zalezny od rAF: przy jankach UI i przy przelaczeniu karty analiza sie zatrzymuje, licznik czasu zamarza, a probki sa bezpowrotnie gubione (brak ciaglosci, brak gwarantowanego hopu). Constraints getUserMedia sa niespojne w 6 miejscach - glowny rekorder ma wszystko wylaczone poprawnie, ale drugie wywolanie w kontekscie uzywa `{ audio: true }` (AEC+NS+AGC WLACZONE), a karaoke i multi-track maja `autoGainControl: true`. Format docelowy to webm/opus 128 kbps, czyli stratny i nieodtwarzalny natywnie na iOS - dla edytora podcastow i masteringu to slepy zaulek. Przechowywanie: IndexedDB dla blobow (rozsadny szkielet, brak obslugi quoty/persist) plus localStorage dla pitchHistory i dla przekazywania nagrania karaoke jako base64 dataURL - to ostatnie wysadza 5 MB limit przy ~4 minutach nagrania, bez zadnego catcha.

**Werdykt: rewrite** — Kazdy nosny element tego obszaru jest do wymiany, a nie do poprawki: (1) zrodlo probek - AnalyserNode+rAF trzeba zastapic AudioWorkletem z ring bufferem, bo rAF nie daje ciaglosci ani deterministycznego hopu i przestaje dzialac w tle; (2) format - webm/opus jest stratny i nie dekoduje sie natywnie na iOS, wiec dla PODCAST i SING trzeba zapisywac PCM float32/int24 (WAV/FLAC) z tego samego workletu, ktory karmi analize; (3) sciezka nagrywania w kontekscie jest zepsuta na poziomie logiki (drugi getUserMedia, setTimeout 100ms, martwy warunek) - nie ma tam nic do uratowania; (4) rozjazd 6 roznych zestawow constraints i 12 niezaleznych AudioContextow to brak jakiejkolwiek warstwy abstrakcji nad wejsciem audio. Do uratowania sa tylko drobiazgi: schemat IndexedDB z audio-storage.ts, koncepcja WAV writera (po przepisaniu na streaming) i lancuch wezlow z track-processor.ts jako referencja topologii DSP. Docelowo potrzebny jest jeden modul `AudioCaptureEngine` z interfejsem niezaleznym od Web Audio (start/stop/onFrame(Float32Array, sampleRate, frameIndex)/onLevel), za ktorym po stronie web stoi AudioWorklet, a po stronie natywnej AVAudioEngine tap / Oboe callback. Wtedy cala analiza i zapis sa przenosne, a wymianie podlega tylko cienki adapter.

### 128. MediaRecorder nigdy nie startuje - tor nagrywania audio jest w praktyce martwy

`KRYTYCZNY` · `contexts/audio-recorder-context.tsx:62` · potwierdzone

Linia 58-77: `const startRecording = useCallback(async () => { await audioRecorder.startRecording(); if (audioRecorder.isRecording && streamRef.current === null) { setTimeout(...) } }, [audioRecorder, audioRecording])`. `audioRecorder.isRecording` to wartosc z renderu, w ktorym callback powstal - w momencie klikniecia Start jest `false` (setIsRecording(true) w hooks/use-audio-recorder.ts:119 nie zdazyl sie zpropagowac, a callback nie jest odtwarzany w trakcie wykonania).

*Weryfikator:* Potwierdzone przez czytanie obu plikow. Uzupelnienie: warunek nie jest formalnie nieosiagalny - przy DRUGIM klikniecia Start w trakcie trwajacego nagrania (`isRecording===true`, `streamRef.current===null`) blok sie wykona i wtedy powstaje trzeci strumien mikrofonu. W normalnym przeplywie (jeden klik) nigdy. Skutki potwierdzone lancuchowo: use-audio-recording.ts:61 `if (!audioBlob) return false`, save-session-dialog.tsx:35 `const hasAudio = audioBlob !== null` -> false, wiec lib/audio-storage.ts nigdy nie dostaje danych.

### 129. Nagranie karaoke przekazywane do Studio przez localStorage jako base64 dataURL, bez try/catch

`KRYTYCZNY` · `app/record/karaoke/page.tsx:299` · potwierdzone

Linie 293-305: `const reader = new FileReader(); reader.onload = () => { localStorage.setItem("karaoke-temp-audio", reader.result as string); router.push("/edit/studio?source=karaoke") }; reader.readAsDataURL(recordedBlob)`. Brak try/catch, brak sprawdzenia rozmiaru, brak komunikatu bledu.

*Weryfikator:* Potwierdzone; korekta numeru linii - `setItem` jest w linii 299 (audytor podal 298, to linia `reader.onload`). Matematyka bitrate'u audytora jest szacunkowa (Chrome dla mono mic w opus czesto koduje ponizej 128 kbps), ale defekt nie zalezy od niej: QuotaExceededError w handlerze onload jest nieobsluzonym wyjatkiem, router.push() sie nie wykona, nagranie przepada bez slowa. Dodatkowo potwierdzam drugi skutek: `karaoke-temp-audio` jest usuwany tylko po UDANYM zaladowaniu w Studio (app/edit/studio/page.tsx:119) - przy bledzie fetch/blob wielomegabajtowy string zostaje w localStorage na zawsze i zjada te same 5 MB, z ktorych korzystaja sesje (hooks/use-session-library.ts:88).

### 130. pitchHistory zapisywany do localStorage - dluzsze sesje wysadzaja quote i sa cicho tracone

`KRYTYCZNY` · `hooks/use-session-library.ts:88` · potwierdzone

Linie 76-101: `const existingSessions: Session[] = stored ? JSON.parse(stored) : []` ... `localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(trimmedSessions))`, gdzie `Session extends SessionMetadata { pitchHistory: PitchData[] }` (linia 17-19) i MAX_SESSIONS = 50 (linia 22). Blad lapany w linii 98-100: `catch (error) { console.error(...); return null }`.

*Weryfikator:* Cytat i linia dokladne. Potwierdzam takze wersje 'cichej' utraty: desktop-navigation.tsx:92 przypisuje wynik do `sessionId` i sprawdza tylko `if (sessionId)` - null nie generuje zadnego komunikatu dla uzytkownika. Ten sam wzorzec pelnej deserializacji+serializacji jest w loadSession (109), deleteSession (140) i renameSession (167), wiec kazda operacja na bibliotece przepuszcza przez main thread caly wielomegabajtowy JSON.

### 131. audioBufferToWavBlob buduje zwykla tablice JS ze wszystkich probek - OOM i blokada main threada

`KRYTYCZNY` · `lib/audio-processor.ts:262` · potwierdzone

Linie 262-271: `const data = []` a potem `data.push(pcmSample)` w podwojnej petli po `audioBuffer.length` x `numberOfChannels`. Dodatkowo w linii 265 `audioBuffer.getChannelData(channel)[i]` - wywolanie getChannelData na KAZDA probke, nie raz na kanal. Funkcja jest wywolywana z processAudio (linia 219), a ta z app/edit/studio/page.tsx:306 (`handleProcess`), czyli sciezka zywa.

*Weryfikator:* Potwierdzone, linia dokladna. Ten sam wzorzec zywy takze w components/interactive-waveform.tsx:281-289 (uzywany przez Studio w trybie edycji, page.tsx:428 handleAudioEdited). Korekta: trzecia lokalizacja podana przez audytora, lib/multi-track-engine.ts:438, jest MARTWA - `audioBufferToWavBlob` tam jest prywatna, wolana tylko z `exportMix`, a `exportMix` tylko z components/multi-track-manager.tsx:177, ktory nie jest nigdzie zamontowany. Poza push() drugim mnoznikiem kosztu jest getChannelData per probka.

### 132. Nagrywanie w Karaoke rozwala sie na Safari/iOS i przy tym zostawia wlaczony mikrofon oraz wieczna petle rAF

`KRYTYCZNY` · `app/record/karaoke/page.tsx:213` · znalezione przy weryfikacji

Linia 213: `new MediaRecorder(stream, { mimeType: "audio/webm" })` - bez `MediaRecorder.isTypeSupported`. Safari (w tym cale iOS) nie wspiera webm w MediaRecorder, wiec konstruktor rzuca NotSupportedError. Kolejnosc w startKaraoke jest krytyczna: getUserMedia (191), utworzenie AudioContext + analyser (200-207) i START petli `analyzePitch()` (211) dzieja sie PRZED rzucajaca linia 213, a catch w linii 254-257 nie sprzata niczego - tylko ustawia komunikat. Ten sam brak sprawdzenia jest w hooks/use-audio-recording.ts:17-19; app/edit/studio/page.tsx:472-475 sprawdza isTypeSupported, ale fallbackiem tez jest "audio/webm", wiec efekt na Safari identyczny.

**Skutek dla użytkownika:** Na iPhonie/iPadzie i w Safari na macOS klikniecie 'Start Karaoke' pokazuje komunikat 'Nie mozna uzyskac dostepu do mikrofonu. Sprawdz uprawnienia' (falszywa diagnoza - uprawnienie zostalo wlasnie przyznane), nagrywanie nie startuje NIGDY, a mikrofon zostaje otwarty i petla analizy kreci sie do konca zycia karty: kropka nagrywania swieci sie w pasku, bateria sie pali. Przy zapowiedzianym kierunku na natywne iOS to zamkniete drzwi na calej platformie Apple.

**Naprawa:** Wydzielic jeden helper wybierajacy kontener (`audio/mp4` / `audio/webm;codecs=opus`) przez MediaRecorder.isTypeSupported i uzywac go we wszystkich 4 miejscach; w startKaraoke utworzyc MediaRecorder PRZED odpaleniem analyzePitch, a w catch dodac stop trackow, cancelAnimationFrame i audioContext.close().

### 133. Edytor przebiegu: drugie ciecie wycina zle miejsce, a Undo nie odzyskuje audio (nieodwracalna utrata materialu)

`KRYTYCZNY` · `components/interactive-waveform.tsx:203` · znalezione przy weryfikacji

`deleteSelectedRegion` akumuluje wszystkie regiony w stanie (`const newDeletedRegions = [...deletedRegions, regionData]`, linia 183) i wola `applyEditsToAudio(newDeletedRegions)` (linia 203). Ale `applyEditsToAudio` bierze zrodlo z `wavesurferRef.current.getDecodedData()` (linia 209), a to jest AKTUALNIE zaladowany buffer - po pierwszym ciecie Studio podmienia blob (app/edit/studio/page.tsx:430 setOriginalAudio -> nowy `audioBlob` w propsach -> reinicjalizacja WaveSurfera w useEffect linia 47/160 z JUZ przycietym audio). Wspolrzedne pierwszego regionu sa wiec ponownie stosowane do skroconego materialu, a `newDuration = audioBuffer.duration - totalDeletedDuration` (linia 220) odejmuje sumy z dwoch roznych osi czasu. Stan `deletedRegions` nie jest resetowany, bo komponent nie jest odmontowywany (zmienia sie tylko prop).

**Skutek dla użytkownika:** Pierwsze ciecie dziala. Drugie usuwa fragment w zupelnie innym miejscu niz zaznaczony (przesuniety o dlugosc poprzedniego ciecia) i skraca material podwojnie; przy kilku cieciach `newLength` schodzi do zera lub ponizej i `new OfflineAudioContext(...)` (linia 228) rzuca wyjatek - edycja przestaje reagowac. Undo (linie 326-340) wola to samo applyEditsToAudio na juz okrojonym buforze, wiec nie przywraca wycietego audio, tylko generuje kolejna zla wersje. To glowna sciezka montazu dla filaru PODCAST i konczy sie utrata nagrania.

**Naprawa:** Przechowywac nietkniety buffer zrodlowy (raz zdekodowany oryginal) w refie i zawsze aplikowac pelna liste ciec do NIEGO, nigdy do biezacego bufora WaveSurfera; resetowac `deletedRegions`/historie gdy prop `audioBlob` przychodzi z zewnatrz jako nowe zrodlo, albo trzymac EDL (liste ciec) jako jedyne zrodlo prawdy i renderowac wynik dopiero na eksport.

### 134. Edytor multitrack (projekty) nie ma zadnej sciezki eksportu; a istniejacy mikser i tak ignoruje EQ, master i clipy

`KRYTYCZNY` · `components/timeline/multi-track-timeline.tsx:5` · znalezione przy weryfikacji

components/timeline/multi-track-timeline.tsx importuje ikone `Download` w linii 5 i NIGDY jej nie uzywa (`grep -c "Download"` = 1, tylko import); w calym pliku nie ma slowa export/render/bounce ani wywolania exportMix. Jedyny mikser w repo, `MultiTrackEngine.mixToBuffer` (lib/multi-track-engine.ts:373-420), jest osiagalny tylko z martwego MultiTrackManager i dodatkowo: (a) miksuje `this.trackBuffers` per track.id, wiec CALKOWICIE pomija clipy, ich `startTime`, `trimStart`/`trimEnd` (sciezka playClips uzywa trackBuffers pod kluczem source.id), (b) buduje lancuch tylko z gain+panner - nie tworzy processora, wiec EQ z `track.processing` nie trafia do miksu, (c) nie stosuje master volume (`masterGain` w offline kontekscie zostaje 1.0), (d) ma na sztywno `sampleRate = 44100`, mimo ze bufory sa dekodowane w rate'cie kontekstu (zwykle 48000) - dodatkowy, niezamierzony resampling.

**Skutek dla użytkownika:** Uzytkownik moze w edytorze projektow zaimportowac slady, pociac je na clipy, ustawic automatyke i EQ - i nie ma zadnego przycisku, ktorym wyniesie to z aplikacji. Cala praca montazowa konczy sie w IndexedDB bez wyjscia. Gdyby ktos podlaczyl istniejacy exportMix, wyeksportowany plik i tak nie odpowiadalby temu, co uzytkownik slyszal (bez EQ, bez master volume, bez ukladu clipow na osi czasu, przepuszczony przez resampling do 44.1 kHz). Dla filaru PODCAST oznacza to brak produktu koncowego.

**Naprawa:** Napisac render offline oparty na tej samej reprezentacji, co playClips (clipy + trimy + processor per track + automatyka + masterGain), z sampleRate rownym rate'owi zdekodowanych buforow, wypisujacy strumieniowo do WAV (bez tablicy JS - patrz potwierdzony problem 6); wystawic to w UI timeline'u. Usunac martwe exportMix/mixToBuffer i MultiTrackManager, zeby nie bylo dwoch sprzecznych mikserow.

### 135. Drugie getUserMedia bez constraints wlacza AGC/NS/AEC na strumieniu przeznaczonym do nagrania

`wysoki` · `contexts/audio-recorder-context.tsx:67` · potwierdzone

Linia 67: `const stream = await navigator.mediaDevices.getUserMedia({ audio: true })` - zero constraints, wiec przegladarka domyslnie wlacza echoCancellation/noiseSuppression/autoGainControl. Tor analizy (hooks/use-audio-recorder.ts:85-91) jawnie wylacza wszystkie trzy.

*Weryfikator:* Cytat i numer linii dokladne. Obnizam severity z critical do high, bo problem jest DZIS utajony - kod jest nieosiagalny w normalnym przeplywie (patrz problem 1), wiec uzytkownik nie slyszy jeszcze zniszczonego nagrania. Staje sie realny w sekundzie, w ktorej ktos 'naprawi' problem 1 nie ruszajac constraintow. Dodatkowo: to DRUGIE, niezalezne przechwycenie mikrofonu obok tego z use-audio-recorder.ts:85 - dwa strumienie, dwa razy bateria, ryzyko konfliktu urzadzenia na iOS.

### 136. Nagranie tylko jako stratny webm/opus - brak jakiegokolwiek zapisu PCM

`wysoki` · `hooks/use-audio-recording.ts:17` · potwierdzone

`grep -rn "new MediaRecorder"` daje dokladnie 4 miejsca: hooks/use-audio-recording.ts:17 (`mimeType: "audio/webm"`), app/record/karaoke/page.tsx:213, app/edit/studio/page.tsx:478 (`audioBitsPerSecond: 128000`), components/multi-track-manager.tsx:232. Zapis WAV istnieje tylko jako EKSPORT po dekodowaniu (lib/audio-processor.ts:253, lib/multi-track-engine.ts:429, components/interactive-waveform.tsx:272) - nigdzie nie ma sciezki nagrywania do PCM.

*Weryfikator:* Fakt kodowy potwierdzony. Dwie korekty: (a) components/multi-track-manager.tsx to MARTWY KOD - `grep -rn "multi-track-manager"` po calym repo nie znajduje ani jednego importu, komponent nie jest nigdzie zamontowany (Studio kieruje do /edit/projects -> MultiTrackTimeline); (b) severity obnizone z critical do high, bo to zaluzenie architektoniczne (dlug), nie zepsuta funkcja - nagranie DZIS istnieje i sie odtwarza tam, gdzie sciezka dziala (karaoke, studio). Uzasadnienie kierunkowe (mastering z opus, artefakty wypalone przy kolejnych przebiegach) jest poprawne.

### 137. Sesje zapisywane z hasAudio: true bezwarunkowo, mimo ze audio nie istnieje

`wysoki` · `components/desktop-navigation.tsx:92` · potwierdzone

Linia 92: `const sessionId = saveSession(pitchHistory, sessionType, duration, undefined, true)` - piaty parametr to `hasAudio` (hooks/use-session-library.ts:55). Linie 94-98: `const saved = await saveAudioToSession(sessionId); if (!saved) { console.warn(...) }` - jedyna reakcja to log.

*Weryfikator:* Potwierdzone, linia dokladna. Potwierdzone takze konsekwencje w UI: app/library/session/page.tsx:205 `{session.hasAudio ? "Tak" : "Nie"}` oraz page.tsx:32-34 wchodzi w `loadAudio(sessionId)`, ktore dostaje null i nie ustawia audioUrl (odtwarzacz sie nie renderuje - linia 210 `{audioUrl && ...}`). Trzeci, nie zauwazony przez audytora skutek: app/edit/studio/page.tsx:185 `const sessionsWithAudio = sessions.filter(s => s.hasAudio)` - Studio oferuje wszystkie te sesje do obrobki, a po wybraniu pokazuje 'Nie znaleziono nagrania audio dla tej sesji' (linia 171).

### 138. Petla analizy zamrozona na stalym closure - Pauza nie dziala

`wysoki` · `hooks/use-audio-recorder.ts:78` · potwierdzone

`processAudio` = useCallback z deps [isPaused, sensitivity, detectionMode] (linia 79), ale podtrzymuje sie sam: linia 78 `animationFrameRef.current = requestAnimationFrame(processAudio)` wewnatrz wlasnego ciala (identyfikator z tamtego renderu), a start jest jednorazowy w linii 124. Nowa wersja callbacka nigdy nie zostaje zaplanowana, wiec `isPaused` w linii 32 na zawsze jest `false`. `togglePause` (158-160) zmienia tylko stan Reacta.

*Weryfikator:* Rdzen potwierdzony i to jest realna, widoczna awaria: components/recording-controls.tsx:117 pokazuje 'Wstrzymano', a detekcja i historia leca dalej (app/record/live/page.tsx:186 podaje `togglePause` do tego przycisku). CZESCIOWA korekta: teza o czulosci i trybie detekcji jest na stronie /record/live nieprawdziwa - oba kontrolki maja `disabled={isRecording}` (linie 93, 105, 124 i 222, 234, 253), wiec uzytkownik nie moze ich tam zmienic w trakcie nagrania. Sciezka, na ktorej to boli, to /settings (app/settings/page.tsx:9) przy nagraniu trwajacym globalnie - tam zmiana jest cicho ignorowana.

### 139. AnalyserNode + requestAnimationFrame zamiast AudioWorkletu - brak deterministycznego hopu, gubione probki

`wysoki` · `hooks/use-audio-recorder.ts:40` · potwierdzone

Linia 40 `analyser.getFloatTimeDomainData(buffer)` przy `analyser.fftSize = 2048` (linia 103), wolana z rAF (linia 78). `grep -rn "AudioWorklet|ScriptProcessor|audioWorklet"` po lib/components/hooks/app/public nie zwraca ZADNEGO trafienia - potwierdzam, ze w repo nie ma workletu ani zadnego innego zrodla ciaglych ramek.

*Weryfikator:* Diagnoza poprawna: getFloatTimeDomainData zwraca ostatnie 2048 probek bez gwarancji ciaglosci, hop = odstep klatek rAF, wiec rozdzielczosc czasowa zalezy od obciazenia main threada. Ten sam wzorzec w app/record/karaoke/page.tsx:118-178 i components/guitar-tuner.tsx. KOREKTA opisu skutku: licznik czasu NIE zatrzymuje sie przy przelaczeniu karty - linia 75-76 liczy `Date.now() - startTimeRef.current`, wiec po powrocie doskakuje do realnego czasu. Faktyczny skutek jest inny i gorszy diagnostycznie: czas trwania rosnie zgodnie z zegarem, a w pitchHistory jest dziura, wiec ta sama sesja ma niespojne mapowanie 'indeks probki -> czas' (na czym opiera sie components/audio-playback.tsx:96-97).

### 140. O(n^2) kopiowanie historii pitchu 60x/s + setState globalnego kontekstu w kazdej klatce

`wysoki` · `hooks/use-audio-recorder.ts:68` · potwierdzone

Linie 67-69: `setCurrentPitch(pitchData); historyRef.current = [...historyRef.current, pitchData]; setPitchHistory(historyRef.current)` w kazdej klatce; linia 76 `setRecordingDuration(elapsed)` rowniez. AudioRecorderProvider owija cale drzewo (app/layout.tsx:55).

*Weryfikator:* Potwierdzone dokladnie jak zgloszone. Uzupelnienie, ktorego audytor nie policzyl: to nie jeden, a trzy setState na klatke plus czwarty lancuch - contexts/audio-recorder-context.tsx:51-55 wola `addPitch(currentPitch.frequency)` na kazda zmiane currentPitch, a hooks/use-voice-profile.ts:143-146 przy kazdym wywolaniu robi clearTimeout+setTimeout (debounce 500 ms), wiec przy ciaglym spiewie flush nigdy nie nastepuje i `updateBatchRef` rosnie bez ograniczenia do konca frazy, a po flushu (linia 125) leci kolejny setState w providerze na korzeniu.

### 141. Niespojne constraints getUserMedia; autoGainControl: true na sciezce karaoke

`wysoki` · `app/record/karaoke/page.tsx:195` · potwierdzone

Linie 191-197: `echoCancellation: false, noiseSuppression: false, autoGainControl: true, // Keep auto gain to prevent clipping`. Dla porownania hooks/use-audio-recorder.ts:85-91 i components/guitar-tuner.tsx:36-41 maja wszystkie trzy false, app/edit/studio/page.tsx:461-468 dodaje `sampleRate: {ideal: 48000}, channelCount: {ideal: 2}`.

*Weryfikator:* Potwierdzone, linia dokladna (audytor podal 194, komentarz z AGC jest w 195). Korekta liczby wariantow: zywych jest CZTERY (use-audio-recorder, karaoke, studio, guitar-tuner) plus piaty nieosiagalny `{audio:true}` w kontekscie; szosty wskazany przez audytora (components/multi-track-manager.tsx:217) jest w martwym, nigdzie nie montowanym komponencie. Merytorycznie sedno stoi: karaoke to filar SING i wlasnie tam AGC nieodwracalnie niszczy dynamike przed jakimkolwiek masteringiem.

### 142. Eksport zawsze 16-bit bez ditheringu i bez limitera, przy presetach z outputGain do 1.25

`wysoki` · `lib/audio-processor.ts:257` · potwierdzone

Linia 257 `const bitDepth = 16` na sztywno; linie 267-268 `const intSample = Math.max(-1, Math.min(1, sample)); const pcmSample = intSample < 0 ? intSample * 0x8000 : intSample * 0x7fff` - twarde obcinanie bez ditheringu. Lancuch (linie 194-212) to compressor -> 3x EQ -> [reverb] -> outputGain -> destination, bez zadnego limitera. Presety: `outputGain: 1.25` w 'bright' (linia 98), `1.2` w 'podcast' (linia 50), przy jednoczesnym `highShelfGain: 5` / `midGain: 3`.

*Weryfikator:* Potwierdzone co do znaku i linii. Warto dodac, ze przesterowanie jest tu podwojnie zaprogramowane: EQ z boostem +5 dB juz samo podnosi peaki, outputGain mnozy jeszcze x1.25, a OfflineAudioContext renderuje w float (nie obcina), wiec caly nadmiar spotyka sie dopiero w linii 267 jako twardy klip przy konwersji do int16. Preset 'podcast' i 'bright' to dokladnie te, ktore uzytkownik wybierze najczesciej.

### 143. Karaoke i Studio nie sprzataja przy odmontowaniu - mikrofon i petla rAF zostaja aktywne

`wysoki` · `app/record/karaoke/page.tsx:223` · potwierdzone

W app/record/karaoke/page.tsx sprzatanie (stop trackow, cancelAnimationFrame, audioContext.close) jest WYLACZNIE w `mediaRecorder.onstop` (linie 223-238); jedyne useEffect w pliku to linie 46 (tytul) i 52 (YouTube API), oba bez cleanupu audio. W app/edit/studio/page.tsx `grep -n "return () =>"` nie zwraca ANI JEDNEGO trafienia - plik nie ma zadnego cleanupu: ani stopu strumienia z linii 461, ani `audioContextRef.current.close()` z chainu preview (linia 193), ani revokeObjectURL.

*Weryfikator:* Potwierdzone dla karaoke i Studio - i dla Studio jest nawet gorzej niz zglaszano (zero cleanupow w calym pliku, wiec kazde wejscie/wyjscie ze Studio zostawia AudioContext; Chrome przewraca sie po ~6). KOREKTA trzeciego przypadku: components/multi-track-manager.tsx MA cleanup (linie 43-52: cancelAnimationFrame + engine.dispose()), tylko nie zatrzymuje mikrofonu ani recordingAnimationRef - a przede wszystkim jest to martwy kod (zero importow w repo), wiec nie generuje zadnego realnego wycieku.

### 144. Karaoke pokazuje kazda nute o oktawe za nisko (wlasna, bledna konwersja Hz -> nuta)

`wysoki` · `app/record/karaoke/page.tsx:139` · znalezione przy weryfikacji

Linie 136-142: `const C0 = A4 * Math.pow(2, -4.75); const halfSteps = Math.round(12 * Math.log2(frequency / C0)); const octave = Math.floor(halfSteps / 12) - 1`. halfSteps jest liczone od C0 (16.35 Hz), wiec dla A4=440 Hz wychodzi 57, a `floor(57/12) - 1 = 3` -> wynik 'A3' zamiast 'A4'. Odjecie `- 1` jest poprawne tylko dla numeracji MIDI (jak w lib/pitch-detector.ts:15-18, gdzie noteNumber liczony jest od A4=69), a nie dla indeksu liczonego od C0. Strona nie uzywa gotowego `frequencyToNote` z lib/pitch-detector.ts, tylko duplikuje matematyke inline.

**Skutek dla użytkownika:** Podglad na zywo w Karaoke (etykieta nuty przy mierniku poziomu, linia 407, oraz caly PitchVisualizer, linia 468) pokazuje kazdy dzwiek o oktawe nizej niz ta sama nuta na /record/live. Uzytkownik trenujacy zakres glosu dostaje dwie sprzeczne odpowiedzi z tej samej aplikacji i nie ma sposobu ustalic, ktora jest prawdziwa.

**Naprawa:** Usunac inline matematyke z linii 136-153 i wywolac `frequencyToNote(frequency)` z lib/pitch-detector.ts (juz zaimportowanego w linii 9 obok detectPitch), tak jak robi to hooks/use-audio-recorder.ts:57.

### 145. Karaoke: auto-stop po zakonczeniu podkladu nie dziala, a 'Zmien wideo' porzuca aktywny MediaRecorder

`wysoki` · `app/record/karaoke/page.tsx:105` · znalezione przy weryfikacji

Handler YouTube jest tworzony raz w `loadVideo` (linie 92-111) i zawiera `if (isRecording) { stopRecording() }` (linie 105-107) - `isRecording` jest tu odczytane z closure'a z momentu ladowania wideo, czyli zawsze `false`. Drugi przypadek: przycisk 'Zmien wideo' (linie 442-460) robi `setRecordedBlob(null); setIsRecording(false); player.destroy()`, ale NIE wola `stopRecording()` ani `mediaRecorderRef.current.stop()`, wiec mediaRecorder.onstop (jedyne miejsce ze sprzataniem, linie 223-238) nigdy nie odpala.

**Skutek dla użytkownika:** (1) Gdy podklad z YouTube sie skonczy albo uzytkownik go zapauzuje, nagrywanie leci dalej - do nagrania dokleja sie cisza i wszystko, co uzytkownik mowi po utworze; timer tez leci. (2) Kliknieciem 'Zmien wideo' w trakcie nagrania uzytkownik bezpowrotnie traci cale nagranie (blob nigdy nie powstanie), a mikrofon, interwal timera i petla rAF zostaja aktywne do przeladowania strony.

**Naprawa:** Trzymac stan nagrywania w refie (`isRecordingRef`) i czytac go w handlerze onStateChange, albo rejestrowac handler przez wavesurfer-owy wzorzec z aktualnym closure; w 'Zmien wideo' wywolac najpierw `stopRecording()` i poczekac na onstop; dodac useEffect z cleanupem zatrzymujacym recorder, strumien, interwal i rAF przy odmontowaniu.

### 146. Na desktopie kazde nagranie zapisuje sie jako DWIE sesje w bibliotece

`wysoki` · `components/desktop-navigation.tsx:84` · znalezione przy weryfikacji

components/desktop-navigation.tsx:79-107 to bezwarunkowy auto-save: gdy `isRecording` przechodzi na false i `pitchHistory.length > 0`, po 300 ms leci `saveSession(...)`. Rownolegle app/record/live/page.tsx:61-71 na tym samym zdarzeniu ustawia `setShowSaveDialog(true)`, a components/save-session-dialog.tsx:38 wola `saveSession(...)` po raz drugi z nazwa uzytkownika. app/template.tsx:28-30 montuje DesktopNavigation dla `window.innerWidth >= 1024`, wiec na desktopie oba tory dzialaja jednoczesnie (na mobile auto-save nie istnieje wcale - asymetria zachowania).

**Skutek dla użytkownika:** Po kazdej sesji na desktopie w bibliotece pojawiaja sie dwa wpisy o tej samej tresci: jeden z automatyczna nazwa i klamliwym 'Ma audio: Tak', drugi z nazwa nadana przez uzytkownika i 'Nie'. Podwaja to takze zuzycie quoty localStorage (kazda kopia zawiera pelne pitchHistory - patrz potwierdzony problem 4), czyli o polowe szybciej dochodzi do cichej utraty sesji. Na mobile odwrotny problem: jesli uzytkownik pominie dialog, sesja nie zapisze sie w ogole.

**Naprawa:** Wybrac jedno zrodlo prawdy dla zapisu sesji - albo auto-save w jednym miejscu niezaleznym od breakpointu (np. w kontekscie/hooku), albo wylacznie jawny SaveSessionDialog; jesli zostaje auto-save, przekazywac `hasAudio` z faktycznego `audioBlob !== null`, nie literal `true`.

### 147. Brak zabezpieczenia przed podwojnym startem nagrania - wyciek strumienia mikrofonu i AudioContextu, dwie petle rAF na jednej historii

`wysoki` · `hooks/use-audio-recorder.ts:81` · znalezione przy weryfikacji

`startRecording` (linie 81-129) nie sprawdza ani `isRecording`, ani flagi 'w toku': kazde wywolanie robi nowe getUserMedia, nowy `new AudioContext()` (95), nadpisuje `streamRef.current` (93), `audioContextRef.current` (96), `analyserRef.current` (105) i uruchamia kolejny `requestAnimationFrame(processAudio)` (124), nadpisujac `animationFrameRef.current`. Poprzedni strumien i kontekst traca ostatniego referenta, ale ich tracki NIE sa zatrzymane - `stopRecording` (131-156) zatrzyma tylko ten ostatni. Okno na dwuklik jest realne, bo miedzy klikniecia a `setIsRecording(true)` jest `await navigator.mediaDevices.getUserMedia` (przy pierwszym uzyciu - takze prompt uprawnien).

**Skutek dla użytkownika:** Dwuklik na przycisku Start (lub klik + Enter na sfokusowanym przycisku) zostawia otwarty mikrofon i AudioContext, ktorych nie da sie zamknac inaczej niz przeladowaniem strony - kropka nagrywania swieci sie nawet po Stopie. Rownolegle dwie petle analizy dopisuja do tego samego `historyRef`, wiec historia pitchu ma zdublowane probki (falszuje statystyki i wykresy), a CPU/bateria ida x2. Chrome pozwala na ~6 AudioContextow na strone, wiec po kilku takich zdarzeniach nagrywanie przestaje sie w ogole uruchamiac.

**Naprawa:** Dodac na wejsciu `if (isRecordingRef.current || startingRef.current) return` (ref, nie stan, bo stan nie zdazy sie zpropagowac) i ustawiac `startingRef` przed awaitem; ewentualnie zamiast nadpisywac refy - najpierw wywolac wewnetrzne sprzatanie.

### 148. Jeden Blob w pamieci jako caly model przechowywania audio

`sredni` · `lib/audio-storage.ts:47` · potwierdzone

Linie 47-51: `const record: AudioRecord = { sessionId, audioBlob, timestamp }` i `getAudio` (59-73) zwracajacy caly Blob; konsumenci robia `URL.createObjectURL` + `decodeAudioData` na calosci (app/edit/studio/page.tsx:146-152, app/library/session/page.tsx:43-51). Brak chunkowania, brak strumieniowania, brak kontroli quoty.

*Weryfikator:* Kod i linia zgodne, diagnoza architektoniczna poprawna. Ale obnizam z critical do medium, bo opisany user-visible impact jest DZIS nieosiagalny: `saveSessionAudio` ma tylko jednego wolajacego (hooks/use-audio-recording.ts:64), ktory zwraca false zanim cokolwiek zapisze (problem 1) - magazyn IndexedDB jest w praktyce zawsze pusty, wiec zaden 30-minutowy Blob nie ma jak tam trafic. To ryzyko na etapie PO naprawie toru nagrywania, nie awaria produkcyjna. Rachunki pamieciowe audytora sa arytmetycznie poprawne.

### 149. Sciezka Studio dekoduje przez `new AudioContext()`, wiec material jest niejawnie resamplowany do czestotliwosci sprzetu

`sredni` · `lib/audio-processor.ts:127` · znalezione przy weryfikacji

lib/audio-processor.ts:127-131: `const audioContext = new AudioContext(); const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)`. decodeAudioData na AudioContexcie resampluje wynik do sampleRate tego kontekstu (czyli czestotliwosci urzadzenia wyjsciowego), a nie do rate'u pliku. Dopiero potem OfflineAudioContext jest tworzony z `audioBuffer.sampleRate` (135-138) i WAV zapisuje ten rate (285-286). Identycznie w `getWaveformData` (315-317).

**Skutek dla użytkownika:** Ten sam plik (opus 48 kHz z Karaoke lub upload 44.1 kHz) daje inny wynik eksportu w zaleznosci od tego, na jakim wyjsciu audio uzytkownik ma otwarta karte - np. przy urzadzeniu 44.1 kHz nagranie 48 kHz przechodzi dodatkowy, niezamierzony resampling przed masteringiem, a plik wyjsciowy dostaje 44.1 kHz mimo ze zrodlo bylo 48 kHz. Dla filaru PODCAST/mastering to niedeterministyczny lancuch: brak powtarzalnosci eksportu miedzy urzadzeniami.

**Naprawa:** Dekodowac w `new OfflineAudioContext(1, 1, targetRate)` z jawnie wybranym, stalym rate'em pipeline'u (np. 48000) albo odczytac rate ze naglowka i uzyc OfflineAudioContext o tym samym rate; nie uzywac AudioContextu wyjsciowego jako dekodera. Przy okazji zamykac kontekst w `finally` - dzis `audioContext.close()` (222) nie wykona sie, jesli decodeAudioData rzuci.

### 150. Globalny mutowalny stan trackera pitchu w lib/pitch-detector.ts, nie resetowany na start nagrania

`sredni` · `lib/pitch-detector.ts:42` · znalezione przy weryfikacji

Linie 42-43: `let previousFrequency: number | null = null; let frequencyHistory: number[] = []` - stan na poziomie modulu, uzywany do wazenia kandydatow (linie 142-169) i do odrzucania skokow harmonicznych (210-230). Jest wspoldzielony przez WSZYSTKICH konsumentow detectPitch (hooks/use-audio-recorder.ts:52, app/record/karaoke/page.tsx:126, gry w app/train/*). `resetPitchTracking()` jest wolane w karaoke (linia 186), ale hooks/use-audio-recorder.ts:81-129 nie wola go nigdy przy starcie nagrania (resetuje tylko wersje Pro, i tylko przy zmianie trybu - linia 187).

**Skutek dla użytkownika:** Pierwsze sekundy nowej sesji sa oceniane przez pryzmat ostatniej nuty z sesji POPRZEDNIEJ (albo z innej strony aplikacji): jesli poprzednio uzytkownik konczyl na wysokim dzwieku, nowe niskie wejscie moze byc odrzucane jako 'skok harmoniczny' (linie 226-227 `return null`) - detekcja milczy przez chwile bez powodu, a przy zmianie zakresu glosu miedzy sesjami wyniki nie sa powtarzalne. Efekt nie do zdiagnozowania przez uzytkownika i niemozliwy do przetestowania jednostkowo bez resetu miedzy testami.

**Naprawa:** Zamienic stan modulowy na jawny obiekt trackera tworzony per sesja/konsument (`createPitchTracker()` zwracajacy detect()), albo - jako minimum - wolac `resetPitchTracking()` w startRecording obok `resetProPitchTracking()`. Ten sam wymog dotyczy `lastLogTime` w lib/track-processor.ts:105.

### 151. Object URL-e nigdy nie zwalniane w Studio i w widoku sesji - kazdy blob zostaje w pamieci do konca zycia karty

`sredni` · `app/edit/studio/page.tsx:112` · znalezione przy weryfikacji

W app/edit/studio/page.tsx jest 7 wywolan `URL.createObjectURL` (linie 112, 157, 278, 313, 337, 444, 505, 598) i tylko JEDNO `revokeObjectURL` - w handleDownload (342). Nie ma cleanupu przy odmontowaniu (`grep -n "return () =>"` w tym pliku: brak trafien) ani przy podmianie audio (handleAudioEdited 428-456, toggle preview 270-285 tworza kolejne URL-e nie zwalniajac starych). Analogicznie app/library/session/page.tsx:46-47 tworzy URL i nigdy go nie zwalnia. Wyjatek pozytywny: components/interactive-waveform.tsx:155 zwalnia poprawnie.

**Skutek dla użytkownika:** Kazde przetworzenie, kazda edycja, kazde przelaczenie podgladu i kazde wejscie w sesje przypina kolejny pelny blob audio w pamieci karty (dziesiatki MB przy dluzszym materiale) - blob nie moze zostac zwolniony przez GC, dopoki URL zyje. Przy dluzszej sesji montazu w Studio karta pucha, a na telefonie zostaje ubita przez system w trakcie pracy, bez ostrzezenia i bez zapisanego stanu.

**Naprawa:** Trzymac aktualne URL-e w refie i zwalniac stary przy kazdej podmianie oraz w cleanupie useEffect (jeden useEffect z `return () => { urls.forEach(URL.revokeObjectURL) }`); w app/library/session/page.tsx zwolnic audioUrl w cleanupie efektu ladowania.

### 152. Suwak 'Wzmocnienie mikrofonu' nie ma wplywu na nagranie i skaluje znaczenie progu czulosci

`niski` · `hooks/use-audio-recorder.ts:108` · znalezione przy weryfikacji

Linie 107-115: gainNode (domyslnie `gain = 2.0`, linia 17) jest wlaczony miedzy source i analyser, wiec dotyczy WYLACZNIE toru analizy. MediaRecorder (hooks/use-audio-recording.ts:17) dostaje surowy MediaStream, a nie wyjscie grafu, wiec zmiana suwaka nie zmienia nagrania. Jednoczesnie prog `sensitivity` jest porownywany z RMS sygnalu PO wzmocnieniu (lib/pitch-detector.ts:69), wiec przy gain=2.0 efektywny prog jest dwukrotnie nizszy niz wartosc pokazana uzytkownikowi w components/audio-settings.tsx.

**Skutek dla użytkownika:** Dwa sprzezone kontrolki opisane jako niezalezne: podniesienie wzmocnienia po cichu obniza prog detekcji (wiecej falszywych wykryc szumu tla), a uzytkownik, ktory podnosi gain zeby 'lepiej bylo slychac nagranie', nie uzyskuje zadnej zmiany w pliku. Kalibracja czulosci nie jest przenosna miedzy ustawieniami gainu ani miedzy urzadzeniami.

**Naprawa:** Albo normalizowac prog przez aktualny gain (porownywac RMS/gain), albo liczyc RMS przed gainNode; docelowo - gdy powstanie AudioWorklet - trzymac jeden lancuch wejsciowy i nagrywac WYJSCIE grafu (MediaStreamDestination), zeby gain dotyczyl obu torow spojnie.

**Warte zachowania z tego obszaru:**

- Warstwa IndexedDB dla blobow audio - czysty, minimalny singleton z init/save/get/delete/has, poprawne keyPath i onupgradeneeded — lib/audio-storage.ts:13-92 - `class AudioStorageDB` z `db.createObjectStore(STORE_NAME, { keyPath: "sessionId" })` i lazy `if (!this.db) await this.init()` w kazdej metodzie
- Poprawne constraints w glownym rekorderze - wszystkie trzy przetworzenia wylaczone — hooks/use-audio-recorder.ts:85-91 - `audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }`
- Studio jako jedyne miejsce prosi o jakosc masteringowa i negocjuje kodek — app/edit/studio/page.tsx:461-475 - `sampleRate: { ideal: 48000 }, channelCount: { ideal: 2 }` plus `MediaRecorder.isTypeSupported("audio/webm;codecs=opus")` z fallbackiem
- Detekcja clippingu i pomiar RMS wejscia (jedyne miejsce w calej apce) — app/record/karaoke/page.tsx:166-178 - `maxSample = Math.max(maxSample, Math.abs(dataArray[i]))` i `if (maxSample > 0.98) setIsClipping(true)`
- Topologia per-track DSP chain jest sensowna i czytelna (input -> 3-band EQ -> volume -> pan -> output) z porzadnym dispose — lib/track-processor.ts:21-75 `createTrackProcessor` oraz lib/track-processor.ts:185-193 `disposeTrackProcessor` odlaczajacy wszystkie 7 wezlow
- Automatyzacja parametrow uzywa setTargetAtTime zamiast przypisania .value - unika trzaskow przy zmianach — lib/track-processor.ts:167-172 - `nodes.volume.gain.setTargetAtTime(isMuted ? 0 : volume, currentTime, 0.02)`
- Sesje sa nieniszczaco rozdzielone: metadane w localStorage, ciezkie audio w IndexedDB, kasowanie sesji kasuje tez audio — hooks/use-session-library.ts:141 - `await deleteSessionAudio(sessionId)` w deleteSession

**Duplikaty / martwy kod:**

- hooks/use-audio-recording.ts - caly hook jest w praktyce MARTWY: jego jedyny konsument (contexts/audio-recorder-context.tsx:69) nigdy nie wywoluje startAudioRecording, bo warunek w linii 62 zawsze jest false. audioBlob/audioURL sa zawsze null, wiec martwe sa tez zalezne od nich sciezki UI.
- Trzy niezalezne, prawie identyczne implementacje 'MediaRecorder + audio/webm + chunks + onstop -> Blob': hooks/use-audio-recording.ts:17-33, app/record/karaoke/page.tsx:213-238, components/multi-track-manager.tsx:232-266, plus czwarta wariacja w app/edit/studio/page.tsx:478-526. Zadna nie wspoldzieli kodu, kazda inaczej (lub wcale) sprzata.
- Szesc niezaleznych zestawow constraints getUserMedia: hooks/use-audio-recorder.ts:85, contexts/audio-recorder-context.tsx:67, app/record/karaoke/page.tsx:191, app/edit/studio/page.tsx:461, components/guitar-tuner.tsx:36, components/multi-track-manager.tsx:213 - trzy rozne polityki AGC.
- Trzy kopie konwertera AudioBuffer -> WAV, wszystkie 16-bit, wszystkie z tym samym bugiem tablicy JS: lib/audio-processor.ts:253-300, lib/multi-track-engine.ts:431-470, components/interactive-waveform.tsx:274-320.
- Dwie kopie ekstraktora waveformu robiace to samo (srednia |x| na bucket): lib/audio-processor.ts:311-334 (getWaveformData, zwraca Float32Array) i lib/multi-track-storage.ts:715-737 (generateWaveformData, zwraca number[]).
- Dwa niezalezne konwertery frequency -> nuta: lib/pitch-detector.ts:14-32 (frequencyToNote) i wklejona kopia inline w app/record/karaoke/page.tsx:135-152 (z wlasnym C0 = A4 * 2^-4.75).
- Dwie petle rAF do detekcji pitchu z wlasnym stanem: hooks/use-audio-recorder.ts:31-79 i app/record/karaoke/page.tsx:118-179 - druga uzywa hardkodowanego progu RMS 0.01 i progu confidence 0.9, calkowicie ignorujac ustawienia uzytkownika z AudioSettings.
- components/audio-settings.tsx:118 - przycisk 'Przywroc domyslne' ustawia sensitivity na 0.001, ale wartosc poczatkowa hooka to 0.002 (hooks/use-audio-recorder.ts:18). 'Domyslne' to inna wartosc niz domyslna.
- components/waveform-display.tsx:28 - `const height = canvas.height` przeslania parametr `height` z propsow (linia 15); prop jest uzywany tylko do atrybutu canvasu i stylu.
- components/audio-playback.tsx:15 - prop `sessionDuration` jest przyjmowany i nigdy nie uzywany (komponent liczy duration z elementu <audio>).
- lib/track-processor.ts:104-105 - modulowa zmienna `lastLogTime` sluzaca wylacznie debugowaniu, wspoldzielona miedzy wszystkimi sciezkami; residuum developerskie.
- lib/audio-processor.ts:36-117 - piec presetow (PRESETS) z opisami po angielsku w polskim UI; zaden nie jest kalibrowany pomiarowo, wartosci wygladaja na dobrane na oko, a dwa z nich powoduja clipping przy eksporcie.

---

## Zgłoszenia obalone przy weryfikacji

Te rzeczy **działają** albo skutek został wyolbrzymiony. Nie naprawiaj ich.

**PitchVisualizer jest przywiązany do zegara ściennego — nie renderuje zapisanych nagrań**

Fakt o kodzie jest prawdziwy (components/pitch-visualizer.tsx:173-174 `const now = Date.now(); const startTime = now - VISIBLE_DURATION`, filtr w 184, pozycja X w 192, VISIBLE_DURATION = 6000 w linii 21), ale WSKAZANY SKUTEK DLA UŻYTKOWNIKA NIE ISTNIEJE — oba miejsca podające dane historyczne są martwym kodem. Grep po `<SessionLibrary`: komponent components/session-library.tsx (400 linii) nie jest renderowany przez żadną stronę; app/sessions/page.tsx to tylko redirect na /library, a app/library/page.tsx ma własną, inline listę. components/audio-playback.tsx jest importowany WYŁĄCZNIE przez session-library.tsx, czyli też jest nieosiągalny. Realna strona szczegółów sesji (app/library/session/page.tsx:227) używa `TimelineAnalysis`, które liczy czas relatywnie: `const startTime = pitchHistory[0].timestamp` (components/timeline-analysis.tsx:183) — i działa poprawnie dla nagrań z przeszłości. W miejscach, gdzie PitchVisualizer JEST zamontowany (app/record/live/page.tsx:167 i 285, app/record/karaoke/page.tsx:468), zegar ścienny jest poprawnym układem odniesienia. Do naprawy przed dodaniem odsłuchu historii, ale dziś nic nie psuje.

**AudioPlayback synchronizuje pitch z audio przez proporcję indeksów, nie przez czas**

Cytat i diagnoza są poprawne (components/audio-playback.tsx:96-99 — indeksowanie proporcjonalne przy dziurach w historii, bo hooks/use-audio-recorder.ts:56-72 dopisuje próbkę tylko gdy wykryto ton w 65-2100 Hz), ale to MARTWY KOD: `AudioPlayback` ma jedynych konsumentów w components/session-library.tsx:161 i 206, a sam SessionLibrary nie jest nigdzie zamontowany (grep `<SessionLibrary` — zero trafień w app/). Użytkownik nie ma dostępu do tego ekranu, więc nie ma też opisanego przesunięcia krzywej. Audytor sam dopisał 'nawet gdyby wizualizator w ogóle rysował dane historyczne' — czyli to problem hipotetyczny na hipotetycznym ekranie. Uwaga architektoniczna zostaje ważna dla przebudowy: PitchData nie ma pola czasu relatywnego do startu nagrania, co trzeba naprawić w modelu danych.

**Seek po pauzie jest ignorowany - odtwarzanie startuje z poprzedniej pozycji (multi-track-timeline.tsx:216)**

Blad w analizie kolejnosci. playClips() na samym POCZATKU wola `this.stop()` (lib/multi-track-engine.ts:514), a stop() ustawia `this.isPaused = false` i `this.pausedAt = 0` (:295-296). Dopiero potem, w linii 552, liczony jest `const offset = this.isPaused ? this.pausedAt : currentTime` - w tym momencie isPaused jest ZAWSZE false, wiec offset zawsze rowna sie argumentowi currentTime. Czyli seek bez odtwarzania (handleSeek -> setCurrentTime(time) -> handlePlay -> playClips(..., currentTime)) jest respektowany, a galaz `this.pausedAt` w :552 jest martwa. Zweryfikowalem tez pauze: engine.pause() zapisuje pausedAt (:259), ale przy nastepnym play offset bierze sie z reactowego currentTime, ktory petla rAF (multi-track-timeline.tsx:173-178) aktualizuje co klatke - roznica maks. jedna klatka. UWAGA: identyczna konstrukcja w play() (:135 stop() -> :145 `const offset = this.isPaused ? this.pausedAt : 0`) jest realnie zepsuta (resume zawsze od 0), ale play() jest wolane tylko z martwego components/multi-track-manager.tsx, wiec nie ma wplywu na uzytkownika. Opisany objaw ('slyszysz cos zupelnie innego') nie wystapi z tego powodu - wystapi z powodu geometrii playheada/linijki (finding #3) i desynchronizacji stanu transportu (patrz missed #1).

**Podteza z findingu o automatyce: 'setTargetAtTime nigdy nie osiaga wartosci docelowej - ustawisz -18 dB, uslyszysz okolo -12'**

Nieprawda matematycznie. setTargetAtTime(target, now, tau) startuje wykladnicze dazenie od aktualnej wartosci parametru; ponowne wywolanie co ~16,7 ms z tau=20 ms nie 'zeruje' postepu, tylko kontynuuje z osiagnietej wartosci - pozostaly blad maleje o e^(-16,7/20) ~ 0,43 na klatke, czyli <1% po ~5 klatkach. Efektem jest opoznienie rzedu 20-30 ms wzgledem krzywej, nie trwaly offset amplitudy. Sam finding o rAF potwierdzam, ale z powodow (zamarzanie w nieaktywnej zakladce, brak lookahead, brak odpowiednika offline), nie z powodu zbieznosci setTargetAtTime.

**Zmiana czulosci i trybu detekcji nie dziala w trakcie nagrania (jako skutek problemu 9 na /record/live)**

Techniczna przyczyna (stale closure) jest prawdziwa, ale opisany user-visible impact na stronie nagrywania nie zachodzi: w app/record/live/page.tsx suwak czulosci i przelacznik Basic/Pro sa jawnie zablokowane w trakcie nagrania - `disabled={isRecording}` w liniach 93, 105 i 124 (mobile) oraz 222, 234, 253 (desktop). Uzytkownik nie moze ich tam ruszyc, wiec nie ma efektu 'suwak nic nie robi'. Realny (ale wezszy) przypadek to zmiana z /settings przy globalnie trwajacym nagraniu. Sedno problemu 9 - martwa Pauza - potwierdzam osobno.

**Petla rAF zatrzymuje sie przy przelaczeniu karty, 'timer leci dalej' / zatrzymuje sie**

Sam fakt zatrzymania rAF w tle jest prawdziwy, ale opis licznika czasu jest bledny w obie strony. hooks/use-audio-recorder.ts:75-76 liczy `const elapsed = Date.now() - startTimeRef.current; setRecordingDuration(elapsed)`, czyli czas jest wyliczany z zegara scienego, nie akumulowany po klatkach - po powrocie do karty licznik natychmiast pokazuje poprawny czas i nic nie 'gubi'. Faktyczna szkoda to rozjazd miedzy dlugoscia sesji a liczba probek w pitchHistory (istotny, bo components/audio-playback.tsx:96-97 mapuje czas na indeks proporcjonalnie).

**multi-track-manager.tsx: autoGainControl: true, MediaRecorder audio/webm, brak sprzatania (problemy 5, 12, 14)**

Wszystkie trzy cytaty w tym pliku sa dosłownie poprawne, ale plik to MARTWY KOD: `grep -rn "multi-track-manager"` po calym repo (bez node_modules) nie znajduje ani jednego importu - komponent MultiTrackManager nie jest nigdzie montowany. Multitrack w produkcie idzie przez app/edit/projects/page.tsx -> components/timeline/multi-track-timeline.tsx. Zgloszenia oparte na tym pliku nie psuja niczego dla uzytkownika (i nie nalezy tracic na nie czasu w naprawach - plik nalezy usunac).

**lib/multi-track-engine.ts:431 jako trzecia lokalizacja OOM-owego audioBufferToWavBlob (problem 6)**

Kod istnieje i jest identycznie wadliwy (linia 438 `const data: number[] = []`), ale jest nieosiagalny: prywatna metoda `audioBufferToWavBlob` jest wolana tylko z `exportMix` (linia 425), a `exportMix` tylko z components/multi-track-manager.tsx:177 - martwego komponentu. Weryfikacja: `grep -n "engineRef.current[.?]" components/timeline/multi-track-timeline.tsx` pokazuje wylacznie playClips/pause/stop/seek/setTrackVolume/setTrackPan/setAutomationLanes/setTracksData/getCurrentTime/dispose - zadnego exportMix. Zywe sa tylko dwa wystapienia wzorca: lib/audio-processor.ts:262 i components/interactive-waveform.tsx:281.

**[fragment zgloszenia 1] 'W cwiczeniach ogon referencji laduje w recordedPitches i psuje wyliczenie startTime'**

Ta konkretna sciezka jest zablokowana: przycisk 'Zacznij spiewac' jest renderowany wylacznie w galezi `!isPlayingReference` (training-mode.tsx:215-241 i :280-306), a playNoteSequence konczy sie 300 ms przerwa po ostatniej nucie (use-training-mode.ts:58) i dopiero wtedy phase przechodzi na 'ready'. Ogon obwiedni to +0.1 s po endTime (audio-synth.ts:104), wiec zanim uzytkownik zdazy kliknac, tonu juz nie ma. Sam problem 1 potwierdzam - ale realna droga zanieczyszczenia to przyciski playSingleNote aktywne W FAZIE 'recording' (training-mode.tsx:378-385, 395-409), czego audytor nie zauwazyl.

**[fragment zgloszenia 11] 'Ten sam wzorzec O(n^2) w hooks/use-sing-along.ts:260-265'**

Sing-along nie ma tam wzrostu kwadratowego w skali sesji: setPitchHistory (use-sing-along.ts:260-265) filtruje okno 30 s (`const cutoff = state.currentTime - 30000`), wiec kopiowana tablica jest ograniczona do ~1800 elementow niezaleznie od dlugosci utworu. To jest zwykla nadmiarowa kopia per ramka, nie narastajacy O(n^2) jak w use-audio-recorder.ts:68 i use-training-mode.ts:98 (te dwa potwierdzam).

**Kolizja nazwy store 'templates' miedzy dwoma bazami IndexedDB**

Nie ma tu zadnej kolizji. Przestrzen nazw store'ow w IndexedDB jest lokalna dla bazy: `templates` w bazie `vocal-coach-multitrack` (lib/multi-track-storage.ts:12, 167-168) i `templates` w bazie `vocal-coach-templates` (lib/project-templates.ts:133, 261, 268-269) to dwa niezalezne obiekty, ktore nie moga sie nadpisac ani pomieszac. Sprawdzilem wszystkich wolajacych: caly kod szablonow (getCustomTemplates:175, saveCustomTemplate:229, delete:242) przechodzi wylacznie przez openTemplatesDB(), czyli przez baze vocal-coach-templates. Realny defekt jest inny i lagodniejszy: store `templates` w bazie multitrack jest tworzony w onupgradeneeded, ale nie ma ani jednego odczytu ani zapisu - to martwy store. Sama teza nadrzedna o fragmentacji persystencji zostaje potwierdzona.

**Ekran Progress na mobile pozostaje pusty niezaleznie od tego ile uzytkownik cwiczy**

Przesadzone. Na mobile dziala sciezka /record/live -> handleStopRecording (app/record/live/page.tsx:61-71) -> SaveSessionDialog -> saveSession (components/save-session-dialog.tsx:38), i ta sciezka nie zalezy od DesktopNavigation. Sesje z 'Practice' na telefonie zapisuja sie normalnie i licza sie do statystyk. Utrata dotyczy wylacznie /train, /train/exercises, /train/game, /train/singalong, ktore nie maja wlasnego zapisu (potwierdzone gremem: te strony importuja tylko useAudioRecorderContext). Mechanizm i severity zgloszenia zostaja, ale opis skutku nalezy zawezic.

**(czesc zgloszenia #10) Na czulym mikrofonie szum przechodzi prog RMS i detektor produkuje przypadkowe nuty z szumu**

Przetestowalem to bezposrednio: bialy szum o rms 0,05 (25x powyzej progu 0,002 z use-audio-recorder.ts:18) nie wyprodukowal ANI JEDNEJ wysokosci - tryb basic 0/60 ramek, tryb Pro 0/30 ramek. Kombinacja progu CMND 0.25 (pitch-detector.ts:92), wymogu lokalnego minimum (linia 97) i bramy `confidence < 0.7` (linia 204) odrzuca szum niezawodnie. Sama niespojnosc progow (0.001/0.002/0.01) i pomiar po GainNode sa potwierdzone, ale ta konkretna konsekwencja jest zmyslona.

**(czesc zgloszenia #6) Historia wysokosci ze strony karaoke zanieczyszcza globalne statystyki zakresu glosu i postepow**

app/record/karaoke/page.tsx:32 deklaruje `const [pitchHistory, setPitchHistory] = useState<PitchData[]>([])` jako stan LOKALNY komponentu. Jedyny konsument to `<PitchVisualizer pitchHistory={pitchHistory} .../>` (linia 469). Strona nie importuje ani useAudioRecorderContext, ani useSessionLibrary, ani useVoiceProfile - grep nie pokazuje zadnego zapisu do sessions ani do localStorage z tymi danymi. Bledne oktawy z karaoke nie wychodza poza wykres na tej stronie.

**(czesc zgloszenia #3) Glissando przechodzace przez oktawe jest gubione**

Przetestowalem glissando C3->C4 rozlozone na 40 ramek: detektor sledzi je bezblednie na calej dlugosci (k=0 130,8->130,8; k=12 161,9->161,9; k=20 186,6->186,6; k=32 231,0->231,0; k=36 248,0->248,0). Mechanizm kary jest proporcjonalny do odleglosci od poprzedniej ramki, a w glissandzie kolejne ramki roznia sie o ~0,3 polnuty - kara nie wchodzi w gre. Blokada dotyczy wylacznie SKOKOW nieciaglych (zmierzone: oktawa i kwinta). Reszta zgloszenia #3 jest potwierdzona.

**(czesc zgloszenia #11) Vibrato jest liczone jako blad intonacji na rowni z ustabilizowanym srodkiem nuty**

Formalnie prawda w warstwie wyswietlania, ale nie w warstwie oceny, ktora auditor wskazal jako dowod. hooks/use-training-mode.ts liczy hitRate jako odsetek ramek w +/-50 centow od celu (linie 197-206) - vibrato o zakresie +/-50-100 centow obniza hitRate, ale ocena koncowa `accuracy` bierze avgCents, czyli SREDNIA po calej nucie (linie 192-193, 207), a srednia vibrato wokol poprawnej wysokosci jest bliska zeru. Vibrato nie jest wiec karane w klasyfikacji perfect/good/off. Prawdziwy problem w tym samym miejscu to liniowe usrednianie Hz - opisalem go w verifierNote do potwierdzonego zgloszenia #11.
