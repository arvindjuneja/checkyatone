# Publikacja w sklepach — instrukcja krok po kroku

Stan repo: aplikacja buduje się na iOS (Xcode/SPM) i Android (Gradle), z ćwiczeniami
sterowanymi zakresem, reklamami na testowych ID i scaffoldem subskrypcji.
Poniżej wyłącznie to, czego NIE dało się zrobić bez Twoich kont.

## 0. Konta (raz)

| Co | Gdzie | Koszt |
|---|---|---|
| Apple Developer Program | developer.apple.com/programs | 99 USD/rok |
| Google Play Console | play.google.com/console | 25 USD jednorazowo |
| AdMob | admob.google.com | darmowe |

## 1. Decyzje przed pierwszym uploadem (nieodwracalne!)

- **appId** `digital.arvind.checkyatone` (capacitor.config.ts) — w Google Play
  nazwa pakietu jest trwała. Jeśli chcesz inną, zmień TERAZ i przebuduj
  (`npx cap sync`).
- Nazwa w sklepach: „CheckYaTone" (capacitor.config.ts → appName).
- Cena subskrypcji „bez reklam" (plan zakłada ~49,99 zł/rok).

## 2. AdMob — podmiana testowych ID

1. W konsoli AdMob utwórz dwie aplikacje (iOS i Android) → dostaniesz App ID
   `ca-app-pub-XXXX~YYYY` dla każdej.
2. Utwórz po jednej jednostce **Banner** dla każdej platformy.
3. Podmień w kodzie (każde miejsce ma komentarz `TESTOWE`/`TODO`):
   - `lib/monetization.ts`: `PROD_BANNER_ANDROID`, `PROD_BANNER_IOS`,
     `USE_TEST_ADS = false`
   - `android/app/src/main/AndroidManifest.xml`: `APPLICATION_ID`
   - `ios/App/App/Info.plist`: `GADApplicationIdentifier`

## 3. Subskrypcja „usuń reklamy"

1. App Store Connect → aplikacja → Subscriptions → utwórz subskrypcję roczną
   (np. `adfree_yearly`). Analogicznie Play Console → Products → Subscriptions.
2. Podepnij wtyczkę zakupów (rekomendacja: RevenueCat — darmowy do 2,5k USD MRR,
   `npm i @revenuecat/purchases-capacitor`), a w callbacku pomyślnego
   zakupu/odtworzenia wywołaj `setAdFree(true)` z `lib/monetization.ts`.
   Przycisk w Ustawieniach (components/ad-free-settings.tsx) jest gotowy —
   dziś jest disabled, podmień handler.

## 4. Build produkcyjny

```bash
npm run build && npx cap sync

# Android (podpisany bundle do Play):
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
cd android && ./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
# Podpis: Play App Signing (zalecane) — wygeneruj upload key:
#   keytool -genkey -v -keystore upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000
# i skonfiguruj signingConfig w android/app/build.gradle.

# iOS:
open ios/App/App.xcodeproj
# Xcode → Signing & Capabilities → Twój Team → Product → Archive → Distribute
```

## 5. Listing (oba sklepy)

- **Polityka prywatności**: publiczny URL — po deployu weba to
  `https://sing.arvind.digital/privacy` (strona już istnieje w repo).
- **Etykieta prywatności**: cała analiza on-device; zbierane: identyfikator
  reklamowy (AdMob, tylko wersja z reklamami) + anonimowe statystyki użycia.
  Audio: NIE zbierane. To rzadka i mocna etykieta — wyeksponuj ją w opisie.
- Screenshoty: ekran ćwiczenia ze śladem głosu, pomiar zakresu, wynik
  czterema liczbami, tuner. (Symulator iPhone + `xcrun simctl io screenshot`.)
- Kategoria: Muzyka / Edukacja. Rating: bez zastrzeżeń (PEGI 3 / 4+).

## 6. Przed wysłaniem do review — checklist

- [ ] `USE_TEST_ADS = false` i produkcyjne ID w trzech miejscach z pkt 2
- [ ] Zakup testowy sandbox: kupno → reklamy znikają; reinstalacja →
      „Przywróć zakup" działa
- [ ] Mikrofon na fizycznym urządzeniu: prompt pojawia się raz, detekcja działa
- [ ] Wersje: `ios/App/App.xcodeproj` (MARKETING_VERSION) i
      `android/app/build.gradle` (versionName/versionCode) — podbijaj przy
      każdym uploadzie
