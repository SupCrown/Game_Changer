/**
 * Essai automatique de bout en bout (`npm run smoke`) : lance la vraie application dans un dossier jetable,
 * joue quelques tours avec l'histoire de démonstration, ouvre les panneaux et enregistre des captures d'écran.
 * Sert à vérifier que le jeu se lance et s'affiche réellement, pas seulement que les tests passent.
 *
 * Le script pilote l'interface par `window.__essai` (exposé par le renderer) : mêmes chemins que le joueur.
 */
import type { BrowserWindow } from 'electron'
import { app } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Application } from './application'

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function lancerSmoke(f: BrowserWindow, application: Application): Promise<void> {
  const argDossier = process.argv.find((a) => a.startsWith('--smoke-dir='))
  const dossier = resolve(argDossier ? argDossier.slice('--smoke-dir='.length) : join(process.cwd(), 'smoke'))
  mkdirSync(dossier, { recursive: true })
  const erreurs: string[] = []
  f.webContents.on('console-message', (e: any) => {
    const niveau = e.level ?? ''
    const message = e.message ?? ''
    if (niveau === 'error' || niveau === 3) erreurs.push(String(message))
  })
  f.webContents.on('render-process-gone', (_e, d) => erreurs.push(`renderer arrêté : ${d.reason}`))

  const js = <T = unknown>(code: string): Promise<T> => f.webContents.executeJavaScript(code, true)
  const capture = async (nom: string) => {
    await attendre(450)
    const image = await f.webContents.capturePage()
    writeFileSync(join(dossier, `${nom}.png`), image.toPNG())
  }
  const jusqua = async (condition: string, delai = 20000) => {
    const fin = Date.now() + delai
    while (Date.now() < fin) {
      if (await js<boolean>(`!!(${condition})`).catch(() => false)) return true
      await attendre(150)
    }
    erreurs.push(`délai dépassé : ${condition}`)
    return false
  }

  let code = 0
  try {
    f.setSize(1360, 820)
    f.showInactive()
    await new Promise<void>((r) => (f.webContents.isLoading() ? f.webContents.once('did-finish-load', () => r()) : r()))
    await jusqua('window.__essai && window.__essai.pret()')
    await capture('01-titre')

    await js(`window.__essai.ecran('nouvelle')`)
    await capture('02-nouvelle-partie')

    await js(`window.__essai.creer()`)
    await jusqua(`window.__essai.ecranCourant() === 'jeu' && window.__essai.lignes() > 0`)
    await js(`window.__essai.toutAfficher()`)
    await jusqua(`window.__essai.libre()`)
    await capture('03-scene')

    await js(`window.__essai.jouer('Je cherche quelqu’un à qui demander mon chemin.')`)
    await jusqua(`window.__essai.libre()`)
    await js(`window.__essai.toutAfficher()`)
    await capture('04-scene-suivante')

    // On avance jusqu'à la scène qui demande un jet de dé (4e scène de la démo).
    for (let i = 0; i < 4; i++) {
      if (await js<boolean>(`window.__essai.jetEnAttente()`)) break
      await js(`window.__essai.jouer('Je continue ma journée.')`)
      await jusqua(`window.__essai.libre()`)
      await js(`window.__essai.toutAfficher()`)
    }
    if (await js<boolean>(`window.__essai.jetEnAttente()`)) {
      await capture('05-jet')
      await js(`window.__essai.lancer()`)
      await attendre(900)
      await capture('06-de')
      await jusqua(`window.__essai.libre() && !window.__essai.jetEnAttente()`, 30000)
      await js(`window.__essai.toutAfficher()`)
      await capture('07-apres-jet')
    }

    for (const panneau of ['fiche', 'liens', 'factions', 'journal', 'codex', 'emploi', 'relations', 'enquete', 'sauvegardes', 'galerie', 'succes', 'couts', 'reglages', 'historique']) {
      await js(`window.__essai.panneau('${panneau}')`)
      await capture(`10-${panneau}`)
    }
    await js(`window.__essai.panneau(null)`)

    await js(`window.__essai.dormir()`)
    await jusqua(`window.__essai.libre()`, 30000)
    await capture('20-lendemain')

    const etat = application.session?.etat
    const resume = {
      scenes: etat?.stats.scenes, jour: etat?.calendrier.jour, jets: etat?.stats.jets,
      resonances: etat?.personnages.filter((p) => p.role === 'heroine').map((p) => `${p.nom}: ${p.resonance}`),
      images: application.session ? application.depot.imagesDe(application.session.partieId).length : 0,
      succes: etat?.succes, erreurs,
    }
    writeFileSync(join(dossier, 'resume.json'), JSON.stringify(resume, null, 2))
    if (erreurs.length) code = 1
  } catch (e) {
    erreurs.push(e instanceof Error ? `${e.message}\n${e.stack}` : String(e))
    writeFileSync(join(dossier, 'resume.json'), JSON.stringify({ erreurs }, null, 2))
    try { await capture('99-erreur') } catch { /* rien */ }
    code = 1
  }
  app.exit(code)
}
