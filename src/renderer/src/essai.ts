/**
 * Crochets pour l'essai automatique (`npm run smoke`) : le script du processus principal pilote
 * l'interface par les mêmes chemins que le joueur. Sans effet en usage normal.
 */
import { api, useJeu, type Ecran, type Panneau } from './store'
import { PREFERENCES_DEFAUT } from '@core/game/creation'

export function installerEssai(): void {
  const s = () => useJeu.getState()
  window.__essai = {
    pret: () => s().pret,
    ecran: (e: Ecran) => s().aller(e),
    ecranCourant: () => s().ecran,
    creer: async () => {
      useJeu.setState({ creation: true, ecran: 'nouvelle' })
      try {
        const i = await api().parties.creer({ ...PREFERENCES_DEFAUT }, { prenom: 'Aubin', age: 19, forces: ['agilite', 'charme'], faiblesse: 'force' })
        s().charger(i)
        void api().jeu.commencer()
      } finally {
        useJeu.setState({ creation: false })
      }
    },
    lignes: () => s().scenes.at(-1)?.lignes.length ?? 0,
    libre: () => s().phase === 'repos' && s().narrationFinie && !s().creation,
    toutAfficher: () => s().toutAfficher(),
    jouer: (texte: string) => s().jouer(texte),
    jetEnAttente: () => !!s().jet,
    lancer: () => { void api().jeu.lancerDe(null) },
    panneau: (p: Panneau | null) => s().ouvrirPanneau(p),
    dormir: () => { void api().jeu.avancerTemps('jour') },
  }
}
