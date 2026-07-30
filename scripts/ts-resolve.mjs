/**
 * Hook resolvera dla natywnego strippingu typów w Node.
 *
 * Źródła w lib/ importują bez rozszerzenia (`./fft-analyzer`), bo tak wymaga
 * bundler Next.js. Node ESM wymaga rozszerzenia jawnie. Hook dokleja `.ts`,
 * dzięki czemu skrypty w scripts/ uruchamiają produkcyjny kod bez zmian w nim
 * i bez dodatkowej zależności.
 */

const HAS_EXTENSION = /\.[cm]?[jt]sx?$/

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !HAS_EXTENSION.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context)
    } catch {
      // Nie każdy extensionless import to TypeScript — oddajemy sprawę dalej.
    }
  }
  return nextResolve(specifier, context)
}
