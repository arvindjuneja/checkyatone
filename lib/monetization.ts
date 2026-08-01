/**
 * Monetyzacja: darmowa aplikacja z reklamami + subskrypcja, która robi
 * dokładnie jedną rzecz — wyłącza reklamy.
 *
 * Dwie twarde zasady:
 *
 *  1. REKLAMA NIGDY PODCZAS ŚPIEWANIA. Banner wolno pokazać wyłącznie na
 *     ekranach wymienionych w AD_ALLOWED_ROUTES. Ćwiczenie, gra, nagrywanie,
 *     karaoke — nigdy. Reklama w pętli treningowej niszczy produkt, dla
 *     którego ktoś tę aplikację zainstalował.
 *  2. WEB BEZ REKLAM. AdMob istnieje tylko w buildzie natywnym; web pozostaje
 *     darmowym demo i kanałem akwizycji.
 *
 * Identyfikatory są TESTOWE (oficjalne testowe ID Google — bezpieczne w
 * developmencie, klikanie ich niczego nie psuje). Przed publikacją podmień
 * PROD_* na własne z konsoli AdMob i ustaw USE_TEST_ADS = false.
 */

import { Capacitor } from "@capacitor/core"

// ── Stan "bez reklam" ──

const AD_FREE_KEY = "ad-free-v1"

export function isAdFree(): boolean {
  if (typeof window === "undefined") return true
  try {
    return localStorage.getItem(AD_FREE_KEY) === "true"
  } catch {
    return false
  }
}

/**
 * Wołane po pomyślnym zakupie/odtworzeniu subskrypcji. Docelowo wpięte w
 * werdykt sklepu (StoreKit/Play Billing przez wtyczkę IAP) — lokalny zapis
 * jest cache'em werdyktu, nie jego źródłem.
 */
export function setAdFree(value: boolean): void {
  if (typeof window === "undefined") return
  localStorage.setItem(AD_FREE_KEY, String(value))
  window.dispatchEvent(new Event("ad-free-changed"))
}

// ── Gdzie reklamy WOLNO pokazywać ──

/**
 * Lista pozytywna, nie negatywna: nowa trasa domyślnie NIE ma reklam, dopóki
 * ktoś świadomie jej tu nie doda. Odwrotna konwencja gwarantowałaby, że nowy
 * ekran treningowy wystartuje z banerem.
 */
export const AD_ALLOWED_ROUTES = ["/library", "/library/progress", "/about"]

export function adsAllowedOn(pathname: string): boolean {
  return AD_ALLOWED_ROUTES.some(
    (route) => pathname === route || (route !== "/" && pathname === `${route}/`),
  )
}

// ── AdMob ──

const USE_TEST_ADS = true

/** Oficjalne testowe ID Google. */
const TEST_APP_ID_ANDROID = "ca-app-pub-3940256099942544~3347511713"
const TEST_APP_ID_IOS = "ca-app-pub-3940256099942544~1458002511"
const TEST_BANNER_ANDROID = "ca-app-pub-3940256099942544/6300978111"
const TEST_BANNER_IOS = "ca-app-pub-3940256099942544/2934735716"

/** TODO przed publikacją: własne ID z konsoli AdMob. */
const PROD_BANNER_ANDROID = ""
const PROD_BANNER_IOS = ""

function bannerAdUnitId(): string {
  const platform = Capacitor.getPlatform()
  if (USE_TEST_ADS) return platform === "ios" ? TEST_BANNER_IOS : TEST_BANNER_ANDROID
  return platform === "ios" ? PROD_BANNER_IOS : PROD_BANNER_ANDROID
}

export const ADMOB_APP_IDS = {
  android: USE_TEST_ADS ? TEST_APP_ID_ANDROID : "",
  ios: USE_TEST_ADS ? TEST_APP_ID_IOS : "",
}

let initialized = false

async function ensureInitialized(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  if (initialized) return true
  try {
    const { AdMob } = await import("@capacitor-community/admob")
    await AdMob.initialize()
    initialized = true
    return true
  } catch (error) {
    console.warn("AdMob init failed:", error)
    return false
  }
}

/** Pokazuje banner na dole ekranu. No-op na webie i przy adFree. */
export async function showBanner(): Promise<void> {
  if (isAdFree()) return
  if (!(await ensureInitialized())) return
  try {
    const { AdMob, BannerAdPosition, BannerAdSize } = await import("@capacitor-community/admob")
    await AdMob.showBanner({
      adId: bannerAdUnitId(),
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: USE_TEST_ADS,
    })
  } catch (error) {
    console.warn("showBanner failed:", error)
  }
}

export async function hideBanner(): Promise<void> {
  if (!initialized) return
  try {
    const { AdMob } = await import("@capacitor-community/admob")
    await AdMob.hideBanner()
    await AdMob.removeBanner()
  } catch {
    // Brak banera do schowania — nieistotne.
  }
}
