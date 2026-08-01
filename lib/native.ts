/**
 * Mostek do natywnych możliwości telefonu. Każda funkcja jest bezpiecznym
 * no-opem na webie — ten sam kod działa w przeglądarce, na iOS i Androidzie.
 */

import { Capacitor } from "@capacitor/core"
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics"
import { KeepAwake } from "@capacitor-community/keep-awake"

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

/** Lekkie tapnięcie — trafienie nuty, przejście kroku. */
export async function hapticTap(): Promise<void> {
  if (!isNativeApp()) return
  try {
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch {
    // Urządzenie bez wibracji — trudno.
  }
}

/** Wyraźny sukces — ukończenie ćwiczenia, komplet trafień. */
export async function hapticSuccess(): Promise<void> {
  if (!isNativeApp()) return
  try {
    await Haptics.notification({ type: NotificationType.Success })
  } catch {
    /* jw. */
  }
}

/**
 * Ekran nie gaśnie w trakcie ćwiczenia — telefon leży na pulpicie,
 * a użytkownik śpiewa, nie dotyka ekranu.
 */
export async function stayAwake(active: boolean): Promise<void> {
  if (!isNativeApp()) return
  try {
    if (active) await KeepAwake.keepAwake()
    else await KeepAwake.allowSleep()
  } catch {
    /* jw. */
  }
}
