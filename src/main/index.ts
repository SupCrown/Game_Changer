/**
 * Point d'entrée Electron : fenêtre, sécurité, protocole d'images, pont IPC.
 */
import { app, BrowserWindow, dialog, ipcMain, nativeImage, net, protocol, safeStorage, session, shell } from 'electron'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CANAL_EVENEMENTS, FORME, type Api, type Reponse } from '@shared/ipc'
import type { EvenementTour } from '@shared/types'
import { detourageCredible, detourer } from '@core/images/detourage'
import { Application } from './application'
import { lancerSmoke } from './smoke'

const ici = dirname(fileURLToPath(import.meta.url))
const SMOKE = process.argv.includes('--smoke')
const DEV = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL

// Le protocole d'images doit être déclaré avant que l'application soit prête.
protocol.registerSchemesAsPrivileged([
  { scheme: 'resonance-media', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

// En mode essai automatique, on travaille dans un dossier jetable : les vraies sauvegardes ne sont jamais touchées.
if (SMOKE) app.setPath('userData', mkdtempSync(join(tmpdir(), 'resonance-smoke-')))

let fenetre: BrowserWindow | null = null
let application: Application

function emettre(e: EvenementTour): void {
  if (fenetre && !fenetre.isDestroyed()) fenetre.webContents.send(CANAL_EVENEMENTS, e)
}

/** Détoure un PNG avec les outils d'image d'Electron (aucune dépendance native). */
function detourerPng(png: Uint8Array): Uint8Array | null {
  try {
    const image = nativeImage.createFromBuffer(Buffer.from(png))
    if (image.isEmpty()) return null
    const { width, height } = image.getSize()
    const pixels = image.toBitmap()
    const resultat = detourer(pixels, width, height)
    if (!detourageCredible(resultat)) return null
    return new Uint8Array(nativeImage.createFromBitmap(pixels, { width, height }).toPNG())
  } catch {
    return null
  }
}

function dossierPacks(): string {
  const candidats = [join(process.resourcesPath ?? '', 'packs'), join(app.getAppPath(), 'packs'), join(ici, '../../packs')]
  return candidats.find((c) => existsSync(c)) ?? candidats[1]
}

function creerFenetre(): BrowserWindow {
  const f = new BrowserWindow({
    width: 1360, height: 820, minWidth: 1024, minHeight: 640,
    backgroundColor: '#0b0d14', show: false, autoHideMenuBar: true, title: 'Résonance',
    webPreferences: {
      preload: join(ici, '../preload/index.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: true,
    },
  })
  f.once('ready-to-show', () => { if (!SMOKE) f.show() })
  // Aucune navigation ni fenêtre externe : le jeu ne quitte jamais sa page.
  f.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(console\.anthropic\.com|platform\.claude\.com|ollama\.com|github\.com)\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  f.webContents.on('will-navigate', (e) => e.preventDefault())
  f.webContents.session.setPermissionRequestHandler((_wc, _permission, rappel) => rappel(false))
  f.webContents.on('before-input-event', (_e, entree) => {
    if (entree.type === 'keyDown' && entree.key === 'F11') f.setFullScreen(!f.isFullScreen())
  })
  f.on('closed', () => { fenetre = null })
  if (DEV) void f.loadURL(process.env.ELECTRON_RENDERER_URL!)
  else void f.loadFile(join(ici, '../renderer/index.html'))
  return f
}

function enregistrerPont(): void {
  const jeu = () => application.jeu()
  const impl: Api = {
    app: {
      initial: async () => application.initial(),
      pleinEcran: async (actif) => { fenetre?.setFullScreen(!!actif) },
      quitter: async () => { app.quit() },
      ouvrirDossierDonnees: async () => { void shell.openPath(app.getPath('userData')) },
    },
    reglages: {
      ecrire: async (r) => application.ecrireReglages(r),
      definirCle: async (nom, valeur) => { application.secrets.definir(nom, String(valeur)); return application.secrets.masquee(nom) },
      supprimerCle: async (nom) => { application.secrets.supprimer(nom) },
      testerTexte: (taille) => application.testerTexte(taille),
      testerImages: () => application.testerImages(),
    },
    parties: {
      lister: async () => application.depot.listerParties(),
      creer: (preferences, heros) => application.creer(preferences, heros),
      ouvrir: async (id) => application.ouvrir(id),
      fermer: async () => application.fermer(),
      supprimer: async (id) => application.supprimer(id),
      exporter: async (id) => {
        const titre = application.depot.listerParties().find((p) => p.id === id)?.titre ?? 'partie'
        const r = await dialog.showSaveDialog(fenetre!, {
          title: 'Exporter la partie', defaultPath: `${titre.replace(/[\\/:*?"<>|]/g, ' ').trim()}.resonance`,
          filters: [{ name: 'Partie Résonance', extensions: ['resonance'] }],
        })
        if (r.canceled || !r.filePath) return null
        application.exporterVers(id, r.filePath)
        return r.filePath
      },
      importer: async () => {
        const r = await dialog.showOpenDialog(fenetre!, { title: 'Importer une partie', properties: ['openFile'], filters: [{ name: 'Partie Résonance', extensions: ['resonance'] }] })
        if (r.canceled || !r.filePaths[0]) return null
        return application.importerDepuis(r.filePaths[0])
      },
    },
    jeu: {
      commencer: () => jeu().commencer(),
      jouer: (texte, activite) => jeu().jouer(String(texte ?? ''), activite ? String(activite) : undefined),
      lancerDe: (valeur) => jeu().lancerDe(valeur === null || valeur === undefined ? null : Number(valeur)),
      reessayer: () => jeu().reessayer(),
      annuler: async () => jeu().annuler(),
      avancerTemps: (mode) => jeu().avancerTemps(mode === 'jour' ? 'jour' : 'creneau'),
      actionCombat: (action, d20) => jeu().actionCombat(action, d20 === null || d20 === undefined ? null : Number(d20)),
      deduire: (indices, hypothese) => jeu().deduire(Array.isArray(indices) ? indices.map(String) : [], String(hypothese ?? '')),
      conclure: () => jeu().conclure(),
      refaire: () => jeu().refaire(),
      recommencer: async () => { jeu().recommencer(); return application.instantane() },
      revenirA: async (sceneId) => { jeu().revenirA(String(sceneId)); return application.instantane() },
      arbre: async () => application.depot.arbre(jeu().partieId),
      marquer: async (sceneId, marque) => jeu().marquer(String(sceneId), marque ? String(marque) : null),
      sauvegardeRapide: async () => jeu().sauvegardeRapide(),
      instantane: async () => application.instantane(),
      preferences: async (p) => jeu().modifierPreferences(p),
    },
    images: {
      obtenir: async (cle) => application.images.obtenir(jeu().etat, String(cle)),
      regenerer: async (cle, prompt) => application.images.regenerer(jeu().etat, String(cle), prompt ? String(prompt) : undefined),
      importer: async (cle) => {
        const r = await dialog.showOpenDialog(fenetre!, { title: 'Choisir une image', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
        if (r.canceled || !r.filePaths[0]) return null
        const ext = extname(r.filePaths[0]).toLowerCase()
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
        return application.images.importer(jeu().etat, String(cle), new Uint8Array(readFileSync(r.filePaths[0])), mime)
      },
      reinitialiser: async (cle) => application.images.reinitialiser(jeu().etat, String(cle)),
      prompt: async (cle) => application.images.prompt(jeu().etat, String(cle)),
    },
    dev: {
      journal: async () => application.journalDev(),
    },
  }

  for (const [espace, methodes] of Object.entries(FORME)) {
    for (const methode of methodes as string[]) {
      ipcMain.handle(`resonance:${espace}.${methode}`, async (_e, ...args): Promise<Reponse<unknown>> => {
        try {
          const f = (impl as any)[espace][methode] as (...a: unknown[]) => Promise<unknown>
          return { ok: true, valeur: await f(...args) }
        } catch (e) {
          return { ok: false, message: e instanceof Error ? e.message : String(e) }
        }
      })
    }
  }
}

const TYPES_MIME: Record<string, string> = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

void app.whenReady().then(() => {
  application = new Application({
    dossierDonnees: app.getPath('userData'),
    dossierPacks: dossierPacks(),
    version: app.getVersion(),
    emettre,
    detourer: detourerPng,
    delaiDemo: SMOKE ? 0 : 14,
    chiffrementDisponible: () => safeStorage.isEncryptionAvailable(),
  })

  // resonance-media://img/<partie>/<fichier> → fichier du cache d'images de cette partie, et rien d'autre.
  protocol.handle('resonance-media', async (requete) => {
    try {
      const url = new URL(requete.url)
      const [partie, fichier] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
      if (url.hostname !== 'img' || !partie || !fichier) return new Response('', { status: 404 })
      const chemin = application.cheminImage(partie, fichier)
      if (!existsSync(chemin)) return new Response('', { status: 404 })
      const rep = await net.fetch(pathToFileURL(chemin).toString())
      return new Response(rep.body, { headers: { 'content-type': TYPES_MIME[extname(chemin).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-cache' } })
    } catch {
      return new Response('', { status: 404 })
    }
  })

  // Politique de sécurité du contenu : rien ne se charge depuis l'extérieur. (En développement, Vite a besoin de scripts en ligne.)
  if (!DEV) {
    session.defaultSession.webRequest.onHeadersReceived((details, rappel) => {
      rappel({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' resonance-media: data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'"],
        },
      })
    })
  }

  enregistrerPont()
  fenetre = creerFenetre()
  if (SMOKE) void lancerSmoke(fenetre, application)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) fenetre = creerFenetre()
  })
})

app.on('window-all-closed', () => {
  application?.depot.fermer()
  app.quit()
})
