# PLAN WYDANIA: sklepy iOS + Android

Cel: pełnoprawna aplikacja w App Store i Google Play, tańsza niż benchmark
([Vocalista](https://vocalista.app/): trial → subskrypcja roczna, tiery 7,99–79,99 USD).

## Model biznesowy

- **Wszystko darmowe, z reklamami.** Subskrypcja robi jedną rzecz: wyłącza reklamy.
  Cena celowo niska (rząd 49,99 zł/rok / 9,99 USD — do potwierdzenia przed publikacją).
- **Reklamy nigdy podczas śpiewania.** Banner/interstitial wyłącznie na ekranach
  wyników, biblioteki i między sesjami. Reklama w trakcie ćwiczenia niszczy produkt.
- Web (sing.arvind.digital) zostaje darmowy bez reklam — akwizycja i demo.

## Architektura wydania

**Capacitor 7 wokół istniejącego Next.js static export.** Jeden kod, trzy platformy.
Rdzeń (detekcja YIN, scoring, gry) jest w czystym TS i działa w WKWebView/WebView
bez zmian. Natywne możliwości przez pluginy: AdMob, zakupy w aplikacji, haptyka
przy trafieniu nuty, keep-awake podczas ćwiczeń.

Docelowa architektura natywna (docs/PLAN.md: rdzeń Rust, trzy shelle) pozostaje
jako ewolucja PO wydaniu — nie blokuje niczego. Wydanie Capacitorem daje rynek
teraz; rdzeń wymienia się pod spodem bez zmiany produktu.

## Fazy

| Faza | Zakres | Kryterium ukończenia |
|---|---|---|
| **F1 Pętla produktu** | Onboarding zakresu głosu (pomiar mikrofonem, zakres **ciągły** — nie wiaderka tenor/baryton, na które skarżą się recenzje benchmarku) → generator ćwiczeń transponowanych w tessiturze → ekran ćwiczenia z podglądem i śladem głosu → wynik z lib/scoring per nuta | Pełna pętla: zmierz zakres → ćwicz → wynik → pół tonu wyżej, przechodzalna na telefonie |
| **F2 Shell natywny** | Capacitor, projekty iOS+Android, uprawnienia mikrofonu, AudioSession, ikony, splash, safe-areas, haptyka, keep-awake | `.app` i `.apk` budują się lokalnie; mikrofon i detekcja działają na fizycznym urządzeniu |
| **F3 Monetyzacja** | AdMob z testowymi ID + IAP „usuń reklamy" (scaffold gotowy na produkcyjne ID) | Banery tylko na ekranach nie-treningowych; testowy zakup ukrywa reklamy |
| **F4 Store-ready** | Polityka prywatności (wszystko on-device — etykieta „no data collected"), metadane, screenshoty, wersjonowanie | Archiwa gotowe do uploadu |
| **F5 Po wydaniu** | i18n EN, analiza oddechu (spectral tilt, on-device), widgety, Live Activities | — |

## Co wymaga Twoich kont (nie da się delegować)

1. Apple Developer Program — 99 USD/rok (rejestracja + zgody tylko osobiście).
2. Google Play Console — 25 USD jednorazowo.
3. Konto AdMob + utworzenie jednostek reklamowych (podmiana testowych ID).
4. Decyzja cenowa subskrypcji.
5. Upload buildów i odpowiedzi w review — przygotuję wszystko do kliknięcia.

## Czego świadomie nie robimy teraz

- Breathiness/resonance — u benchmarku pół-martwe (nieakcjonowalne, tylko topowe
  iPhone'y). Wchodzi w F5 jako spectral tilt z konkretną poradą, albo wcale.
- Dzienny streak — plan (docs/PLAN.md, dec. 17) świadomie wybiera cel tygodniowy
  z dniami odpoczynku; głos to mięsień. To przewaga, nie brak.
- Rdzeń Rust — po wydaniu, wymiana pod spodem.
