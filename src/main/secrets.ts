/**
 * Clés API : chiffrées par le trousseau du système (DPAPI sous Windows, Trousseau sous macOS, libsecret sous Linux)
 * via `safeStorage` d'Electron. Elles ne sont jamais écrites en clair, jamais journalisées,
 * et ne quittent jamais le processus principal : l'interface ne voit qu'une version masquée.
 */
import { safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { NomCle } from '@shared/ipc'

export class Secrets {
  private cache: Partial<Record<NomCle, string>> = {}

  constructor(private fichier: string) {
    this.charger()
  }

  get disponible(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  private charger(): void {
    if (!existsSync(this.fichier) || !this.disponible) return
    try {
      const brut = JSON.parse(readFileSync(this.fichier, 'utf8')) as Record<string, string>
      for (const [nom, chiffre] of Object.entries(brut)) {
        try {
          this.cache[nom as NomCle] = safeStorage.decryptString(Buffer.from(chiffre, 'base64'))
        } catch {
          /* Clé illisible (profil système changé) : on l'ignore, le joueur la ressaisira. */
        }
      }
    } catch {
      /* Fichier abîmé : on repart de zéro. */
    }
  }

  private enregistrer(): void {
    if (!this.disponible) throw new Error('Le trousseau sécurisé du système est indisponible : la clé ne peut pas être enregistrée.')
    const sortie: Record<string, string> = {}
    for (const [nom, valeur] of Object.entries(this.cache)) {
      if (valeur) sortie[nom] = safeStorage.encryptString(valeur).toString('base64')
    }
    mkdirSync(dirname(this.fichier), { recursive: true })
    writeFileSync(this.fichier, JSON.stringify(sortie), { encoding: 'utf8', mode: 0o600 })
  }

  lire(nom: NomCle): string {
    return this.cache[nom] ?? ''
  }

  definir(nom: NomCle, valeur: string): void {
    const v = valeur.trim()
    if (!v) return this.supprimer(nom)
    this.cache[nom] = v
    this.enregistrer()
  }

  supprimer(nom: NomCle): void {
    delete this.cache[nom]
    if (this.disponible) this.enregistrer()
  }

  /** Forme affichable : « sk-a…x9Qz ». Null si aucune clé. */
  masquee(nom: NomCle): string | null {
    const v = this.cache[nom]
    if (!v) return null
    if (v.length <= 10) return '••••••'
    return `${v.slice(0, 4)}…${v.slice(-4)}`
  }
}
