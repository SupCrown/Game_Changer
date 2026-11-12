import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { useJeu } from './store'
import { Titre } from './ecrans/Titre'
import { NouvellePartie } from './ecrans/NouvellePartie'
import { Jeu } from './ecrans/Jeu'
import { audio } from './outils'
import { installerEssai } from './essai'

function App() {
  const pret = useJeu((s) => s.pret)
  const ecran = useJeu((s) => s.ecran)
  const reglages = useJeu((s) => s.reglages)
  const theme = useJeu((s) => (s.ecran === 'jeu' ? s.etat?.monde.theme : undefined))

  useEffect(() => {
    void useJeu.getState().demarrer()
    installerEssai()
    // L'audio ne peut démarrer qu'après un premier geste du joueur.
    const debloquer = () => audio.demarrer()
    window.addEventListener('pointerdown', debloquer, { once: true })
    window.addEventListener('keydown', debloquer, { once: true })
    const visibilite = () => audio.pause(document.hidden)
    document.addEventListener('visibilitychange', visibilite)
    return () => document.removeEventListener('visibilitychange', visibilite)
  }, [])

  useEffect(() => {
    const a = reglages.affichage
    const r = document.documentElement
    r.style.setProperty('--echelle', String(a.taillePolice / 100))
    r.classList.toggle('dyslexie', a.policeDyslexie)
    r.classList.toggle('contraste', a.contraste)
    r.classList.toggle('sans-effets', !a.effets)
    audio.setVolumes({ musique: reglages.son.musique ? reglages.son.volumeMusique : 0, effets: reglages.son.effets ? reglages.son.volumeEffets : 0 })
  }, [reglages])

  useEffect(() => {
    document.documentElement.dataset.theme = theme ?? 'fantasy'
  }, [theme])

  if (!pret) return <div className="attente"><div className="orbe" /></div>
  if (ecran === 'nouvelle') return <NouvellePartie />
  if (ecran === 'jeu') return <Jeu />
  return <Titre />
}

createRoot(document.getElementById('racine')!).render(<StrictMode><App /></StrictMode>)
