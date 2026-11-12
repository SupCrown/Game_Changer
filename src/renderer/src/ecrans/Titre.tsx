import { useEffect, useRef, useState } from 'react'
import { t } from '@shared/i18n'
import { api, useJeu } from '../store'
import { dateCourte } from '../outils'
import { Reglages } from '../panneaux/Reglages'

/** Ciel étoilé discret, dessiné une fois puis animé par un lent scintillement. */
function Ciel() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    let image = 0
    const etoiles = Array.from({ length: 220 }, (_, i) => ({
      x: (Math.sin(i * 12.9898) * 43758.5453) % 1, y: (Math.sin(i * 78.233) * 12543.123) % 1, r: 0.4 + ((i * 7) % 10) / 9, p: i * 1.7,
    }))
    const dessiner = (temps: number) => {
      const l = (c.width = c.clientWidth)
      const h = (c.height = c.clientHeight)
      ctx.clearRect(0, 0, l, h)
      for (const e of etoiles) {
        const a = 0.25 + 0.55 * Math.abs(Math.sin(temps / 2400 + e.p))
        ctx.fillStyle = `rgba(236, 226, 200, ${a})`
        ctx.beginPath()
        ctx.arc(Math.abs(e.x) * l, Math.abs(e.y) * h * 0.85, e.r, 0, 7)
        ctx.fill()
      }
      image = requestAnimationFrame(dessiner)
    }
    image = requestAnimationFrame(dessiner)
    return () => cancelAnimationFrame(image)
  }, [])
  return <canvas ref={ref} className="titre-ciel" style={{ width: '100%', height: '100%' }} />
}

export function Titre() {
  const { parties, initial, reglages, aller, ouvrirPartie } = useJeu()
  const [reglagesOuverts, setReglagesOuverts] = useState(false)
  const [message, setMessage] = useState('')
  const [aSupprimer, setASupprimer] = useState<string | null>(null)
  const derniere = parties[0]

  const ouvrir = (id: string) => ouvrirPartie(id).catch((e) => setMessage(String(e.message ?? e)))

  const supprimer = async (id: string) => {
    const restantes = await api().parties.supprimer(id)
    useJeu.setState({ parties: restantes })
    setASupprimer(null)
  }

  const importer = async () => {
    try {
      const liste = await api().parties.importer()
      if (liste) { useJeu.setState({ parties: liste }); setMessage(t('Partie importée.')) }
    } catch (e: any) { setMessage(String(e.message ?? e)) }
  }

  const exporter = async (id: string) => {
    try {
      const chemin = await api().parties.exporter(id)
      if (chemin) setMessage(t('Partie exportée : {chemin}', { chemin }))
    } catch (e: any) { setMessage(String(e.message ?? e)) }
  }

  return (
    <div className="titre-ecran">
      <Ciel />
      <div className="titre-contenu">
        <h1 className="titre-nom">RÉSONANCE</h1>
        <p className="titre-sous">{t('Une histoire qui n’existe que pour vous.')}</p>
        <div className="titre-menu">
          {derniere && <button className="btn plein" onClick={() => ouvrir(derniere.id)}>{t('Continuer')} — {derniere.titre}</button>}
          <button className={derniere ? 'btn' : 'btn plein'} onClick={() => aller('nouvelle')}>{t('Nouvelle histoire')}</button>
          <button className="btn" onClick={importer}>{t('Importer une partie')}</button>
          <button className="btn" onClick={() => setReglagesOuverts(true)}>{t('Réglages')}</button>
          <button className="btn fantome" onClick={() => api().app.quitter()}>{t('Quitter')}</button>
        </div>
        {reglages.ia.fournisseur === 'mock' && (
          <div className="avis">
            {t('Mode démonstration : le jeu rejoue une histoire enregistrée, sans clé ni coût. Pour une histoire unique à chaque partie, branchez une IA dans Réglages (Claude, ou Ollama en local et gratuit).')}
          </div>
        )}
        {message && <div className="avis">{message}</div>}
      </div>

      {parties.length > 0 && (
        <div className="titre-parties">
          <h3 style={{ marginBottom: '0.8em' }}>{t('Vos histoires')}</h3>
          <div className="grille">
            {parties.map((p) => (
              <div key={p.id} className="carte">
                <div className="rangee">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontFamily: 'var(--police-titre)' }}>{p.titre}</b>
                    <div className="doux petit">{p.hero} · {p.univers} · {t('jour {n}', { n: p.jour })} · {t('{n} scènes', { n: p.scenes })}</div>
                    <div className="doux petit">{dateCourte(p.modifieLe)}</div>
                  </div>
                  <button className="btn petit" onClick={() => ouvrir(p.id)}>{t('Reprendre')}</button>
                </div>
                <div className="rangee" style={{ marginTop: '0.5em' }}>
                  <button className="btn fantome petit" onClick={() => exporter(p.id)}>{t('Exporter')}</button>
                  {aSupprimer === p.id ? (
                    <>
                      <span className="petit" style={{ color: 'var(--danger)' }}>{t('Tout effacer, images comprises ?')}</span>
                      <button className="btn danger petit" onClick={() => supprimer(p.id)}>{t('Oui, effacer')}</button>
                      <button className="btn fantome petit" onClick={() => setASupprimer(null)}>{t('Annuler')}</button>
                    </>
                  ) : (
                    <button className="btn fantome petit" onClick={() => setASupprimer(p.id)}>{t('Supprimer')}</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="titre-pied">
        <span>v{initial?.version}</span>
        <span>{t('Vos parties et vos clés restent sur cet ordinateur.')}</span>
      </div>

      {reglagesOuverts && (
        <div className="voile" onClick={(e) => e.target === e.currentTarget && setReglagesOuverts(false)}>
          <div className="grimoire">
            <div className="page">
              <button className="btn fantome fermer" onClick={() => setReglagesOuverts(false)}>✕</button>
              <Reglages />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
