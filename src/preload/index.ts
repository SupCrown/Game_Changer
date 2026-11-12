/**
 * Pont sécurisé : seule surface exposée à l'interface. Aucun accès à Node depuis le renderer.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { CANAL_EVENEMENTS, FORME, type Reponse } from '@shared/ipc'
import type { EvenementTour } from '@shared/types'

const pont: Record<string, unknown> = {}
for (const [espace, methodes] of Object.entries(FORME)) {
  const groupe: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
  for (const methode of methodes as string[]) {
    groupe[methode] = async (...args: unknown[]) => {
      const rep = (await ipcRenderer.invoke(`resonance:${espace}.${methode}`, ...args)) as Reponse<unknown>
      if (!rep.ok) throw new Error(rep.message)
      return rep.valeur
    }
  }
  pont[espace] = groupe
}

pont.surEvenement = (rappel: (e: EvenementTour) => void) => {
  const ecouteur = (_: unknown, e: EvenementTour) => rappel(e)
  ipcRenderer.on(CANAL_EVENEMENTS, ecouteur)
  return () => ipcRenderer.removeListener(CANAL_EVENEMENTS, ecouteur)
}

contextBridge.exposeInMainWorld('resonance', pont)
