"use client"

/**
 * Polityka prywatności — wymagana przez App Store i Google Play (link w
 * listingu musi prowadzić do publicznego URL; ta strona jest też dostępna
 * w aplikacji). Treść odzwierciedla stan faktyczny kodu: cała analiza
 * on-device, audio nigdzie nie wychodzi.
 */

import { useEffect } from "react"
import { trackPageView } from "@/lib/analytics"

export default function PrivacyPage() {
  useEffect(() => {
    document.title = "CheckYaTone - Prywatność"
    trackPageView("Privacy", "/privacy")
  }, [])

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-24 leading-relaxed">
      <h1 className="text-2xl font-bold">Polityka prywatności</h1>
      <p className="text-xs text-muted-foreground">Ostatnia aktualizacja: 1 sierpnia 2026</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Najważniejsze w jednym zdaniu</h2>
        <p className="text-sm">
          Cała analiza Twojego głosu odbywa się <strong>na Twoim urządzeniu</strong>.
          Nagrania i wyniki nie są nigdzie wysyłane ani przechowywane poza Twoim
          telefonem lub przeglądarką.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Mikrofon</h2>
        <p className="text-sm">
          Dostęp do mikrofonu służy wyłącznie do pomiaru wysokości dźwięku w czasie
          rzeczywistym i — jeśli o to poprosisz — do zapisania nagrania sesji.
          Dźwięk jest przetwarzany lokalnie. Żaden fragment audio, kontur wysokości
          ani wynik analizy nie opuszcza urządzenia.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Dane przechowywane lokalnie</h2>
        <p className="text-sm">
          Sesje, nagrania, zmierzony zakres głosu i ustawienia zapisujemy w pamięci
          lokalnej aplikacji (localStorage / IndexedDB). Usunięcie aplikacji lub
          wyczyszczenie danych przeglądarki usuwa je bezpowrotnie. Możesz też
          usunąć wszystkie sesje jednym przyciskiem w Ustawieniach.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Statystyki użycia</h2>
        <p className="text-sm">
          Zbieramy anonimowe zdarzenia produktowe (np. „uruchomiono ćwiczenie")
          przez Google Analytics — bez treści audio, bez konturów głosu, bez danych
          pozwalających Cię zidentyfikować. Służą wyłącznie do rozwoju aplikacji.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Reklamy (aplikacja mobilna)</h2>
        <p className="text-sm">
          Darmowa wersja mobilna wyświetla reklamy Google AdMob na ekranach innych
          niż treningowe. AdMob może przetwarzać identyfikator reklamowy urządzenia
          zgodnie z własną polityką prywatności Google. Subskrypcja „bez reklam"
          wyłącza reklamy całkowicie. Wersja webowa nie ma reklam.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Czego nie robimy</h2>
        <ul className="text-sm list-disc pl-5 space-y-1">
          <li>Nie wysyłamy audio ani wyników analizy na żaden serwer.</li>
          <li>Nie tworzymy odcisku głosu ani profilu biometrycznego.</li>
          <li>Nie analizujemy emocji.</li>
          <li>Nie sprzedajemy żadnych danych.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Kontakt</h2>
        <p className="text-sm">
          Pytania dotyczące prywatności: <a className="underline" href="mailto:arvind@oumm.pl">arvind@oumm.pl</a>
        </p>
      </section>
    </div>
  )
}
