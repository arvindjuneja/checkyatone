import type { CapacitorConfig } from "@capacitor/cli"

/**
 * UWAGA: appId to trwały identyfikator w Google Play — po pierwszym uploadzie
 * nie da się go zmienić. Zmień PRZED pierwszą publikacją, jeśli chcesz inny.
 */
const config: CapacitorConfig = {
  appId: "digital.arvind.checkyatone",
  appName: "CheckYaTone",
  webDir: "out",
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: "#0a0a0a",
    },
  },
  android: {
    // Web Audio wymaga gestu użytkownika; zostawiamy domyślne zachowanie,
    // AudioContext wznawiamy w kodzie po pierwszym tapnięciu.
    allowMixedContent: false,
  },
}

export default config
