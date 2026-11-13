/** Menu « grimoire » : tous les panneaux d'information et de gestion de la partie. */
import { useEffect, useState } from 'react'
import { t } from '@shared/i18n'
import type { EntreeJournalAppels, GameState, NoeudSauvegarde, Personnage } from '@shared/types'
import { CRENEAUX, STATS } from '@shared/types'
import { modificateur, NOMS_STATS } from '@core/rules/des'
import { JOURS_SEMAINE, NOMS_CRENEAUX, creneauDe, estJourDeRepos } from '@core/rules/rythme'
import { typePalier } from '@core/rules/moteur'
import { api, useJeu, type Panneau } from '../store'
import { dateCourte, dollars, Jauge, useImage } from '../outils'
import { Reglages } from './Reglages'

const ONGLETS: ([Panneau, string] | null)[] = [
  ['fiche', 'Fiche'], ['liens', 'Résonance'], ['factions', 'Factions'], ['relations', 'Carte des relations'], null,
  ['journal', 'Journal'], ['enquete', 'Tableau d’enquête'], ['codex', 'Codex'], ['emploi', 'Emploi du temps'], ['historique', 'Historique'], null,
  ['sauvegardes', 'Sauvegardes'], ['galerie', 'Galerie'], ['succes', 'Succès'], ['couts', 'Coûts'], ['reglages', 'Réglages'],
]

function Portrait(p: { perso: Personnage }) {
  const url = useImage(`sprite:${p.perso.id}:neutre`)
  return <div className="portrait">{url && <img src={url} alt="" />}</div>
}

// ───────────────────────── Fiche ─────────────────────────

function Fiche({ e }: { e: GameState }) {
  const h = e.hero
  return (
    <>
      <h2>{h.prenom}, {h.age} {t('ans')}</h2>
      <p className="doux">{h.apparence}</p>
      <div className="grille deux" style={{ margin: '1em 0' }}>
        <div><div className="rangee"><b>{t('Points de vie')}</b><span className="pousse">{h.pv} / {h.pvMax}</span></div><Jauge valeur={h.pv} max={h.pvMax} couleur="var(--succes)" /></div>
        <div><div className="rangee"><b>{t('Mana')}</b><span className="pousse">{h.mana} / {h.manaMax}</span></div><Jauge valeur={h.mana} max={h.manaMax} couleur="var(--accent-2)" /></div>
      </div>
      <div className="grille trois">
        {STATS.map((s) => {
          const m = modificateur(h.stats[s])
          return <div key={s} className="carte stat"><b>{h.stats[s]}</b>{NOMS_STATS[s]} <small>({m >= 0 ? '+' : ''}{m})</small>
            {e.entrainement[s] ? <div className="doux petit">{t('entraînement {n}/3', { n: e.entrainement[s]! })}</div> : null}</div>
        })}
      </div>
      <h3 style={{ margin: '1.4em 0 0.5em' }}>{t('Capacités')}</h3>
      {h.capacites.map((c) => <div key={c.id} className="ligne-table"><div><b>{c.nom}</b><div className="doux petit">{c.description}</div></div>{c.coutMana ? <span className="pastille">{c.coutMana} {t('mana')}</span> : <span />}</div>)}
      <h3 style={{ margin: '1.4em 0 0.5em' }}>{t('États')}</h3>
      <div className="rangee">{h.etats.length ? h.etats.map((x) => <span key={x} className="pastille accent">{x}</span>) : <span className="doux">{t('Aucun.')}</span>}</div>
      <h3 style={{ margin: '1.4em 0 0.5em' }}>{t('Inventaire')} · {h.or} {t('pièces d’or')}</h3>
      {h.inventaire.length ? h.inventaire.map((o) => <div key={o.nom} className="ligne-table"><div><b>{o.nom}</b>{o.quantite > 1 ? ` ×${o.quantite}` : ''}<div className="doux petit">{o.description}</div></div><span /></div>) : <p className="doux">{t('Vos poches sont vides.')}</p>}
    </>
  )
}

// ───────────────────────── Résonance ─────────────────────────

function Liens({ e }: { e: GameState }) {
  const heroines = e.personnages.filter((p) => p.role === 'heroine' && p.rencontre)
  return (
    <>
      <h2>{t('Résonance')}</h2>
      <p className="doux">{t('La confiance et l’affection débloquent des paliers. Certaines Résonances s’opposent : rapprochez-vous de l’une, et l’autre le remarquera.')}</p>
      {!heroines.length && <p>{t('Vous n’avez encore tissé aucun lien.')}</p>}
      <div className="grille" style={{ marginTop: '1em' }}>
        {heroines.map((p) => (
          <div key={p.id} className="carte">
            <div className="rangee" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <Portrait perso={p} />
              <div style={{ flex: 1 }}>
                <div className="rangee"><b style={{ color: p.couleur, fontFamily: 'var(--police-titre)', fontSize: '1.1em' }}>{p.nom}</b><span className="doux petit">{p.archetype}</span><b className="pousse">{p.resonance} / 100</b></div>
                <Jauge valeur={p.resonance} max={100} couleur={p.couleur} />
                <p className="petit">{p.description}</p>
                {p.paliers.map((pa) => (
                  <div key={pa.seuil} className={`palier ${p.paliersDebloques.includes(pa.seuil) ? 'ok' : ''}`}>
                    <b>{pa.seuil}</b><span>{p.paliersDebloques.includes(pa.seuil) ? <><b>{pa.nom}</b> — {pa.description}</> : <>{t(typePalier(pa))} — ???</>}</span>
                  </div>
                ))}
                {p.rivales.length > 0 && <p className="petit" style={{ color: 'var(--danger)' }}>{t('S’oppose à :')} {p.rivales.map((id) => e.personnages.find((x) => x.id === id)?.nom).filter(Boolean).join(', ')}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function Factions({ e }: { e: GameState }) {
  return (
    <>
      <h2>{t('Pression sociale')}</h2>
      <p className="doux">{t('Sous −50, une faction agit contre vous. Au-dessus de +50, elle vous protège.')}</p>
      <div className="grille" style={{ marginTop: '1em' }}>
        {e.factions.map((f) => (
          <div key={f.id} className="carte">
            <div className="rangee"><b style={{ fontFamily: 'var(--police-titre)' }}>{f.nom}</b>
              <span className="pastille" style={{ color: f.reputation <= -50 ? 'var(--danger)' : f.reputation >= 50 ? 'var(--succes)' : undefined }}>
                {f.reputation <= -50 ? t('hostile') : f.reputation >= 50 ? t('protectrice') : t('neutre')}</span>
              <b className="pousse">{f.reputation > 0 ? '+' : ''}{f.reputation}</b></div>
            <div className="jauge" style={{ position: 'relative' }}>
              <i style={{ width: `${(f.reputation + 100) / 2}%`, background: f.reputation < 0 ? 'var(--danger)' : 'var(--succes)' }} />
              <span style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--texte-doux)' }} />
            </div>
            <p className="petit doux">{f.description}</p>
          </div>
        ))}
      </div>
    </>
  )
}

// ───────────────────────── Carte des relations ─────────────────────────

function Relations({ e }: { e: GameState }) {
  const connus = e.personnages.filter((p) => p.rencontre && p.role !== 'secondaire')
  const [choisi, setChoisi] = useState<string | null>(connus[0]?.id ?? null)
  const cx = 300, cy = 250
  const pos = new Map(connus.map((p, i) => {
    const angle = (i / Math.max(1, connus.length)) * Math.PI * 2 - Math.PI / 2
    const d = p.role === 'heroine' ? 210 - p.resonance * 1.25 : 215
    return [p.id, { x: cx + Math.cos(angle) * d, y: cy + Math.sin(angle) * d }]
  }))
  const perso = connus.find((p) => p.id === choisi)
  return (
    <>
      <h2>{t('Carte des relations')}</h2>
      <div className="grille deux">
        <svg viewBox="0 0 600 500" style={{ width: '100%' }}>
          {[90, 150, 210].map((r) => <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="var(--bord)" strokeDasharray="2 6" />)}
          {connus.flatMap((p) => p.rivales.filter((id) => pos.has(id) && id > p.id).map((id) => (
            <line key={p.id + id} x1={pos.get(p.id)!.x} y1={pos.get(p.id)!.y} x2={pos.get(id)!.x} y2={pos.get(id)!.y} stroke="var(--danger)" strokeDasharray="5 5" opacity="0.7" />)))}
          {connus.map((p) => <line key={p.id} x1={cx} y1={cy} x2={pos.get(p.id)!.x} y2={pos.get(p.id)!.y} stroke={p.couleur} strokeWidth={1 + p.resonance / 14} opacity={0.35 + p.resonance / 160} />)}
          <circle cx={cx} cy={cy} r="20" fill="var(--accent)" /><text x={cx} y={cy + 40} textAnchor="middle" fill="var(--texte)" fontSize="14">{e.hero.prenom}</text>
          {connus.map((p) => {
            const q = pos.get(p.id)!
            return <g key={p.id} onClick={() => setChoisi(p.id)} style={{ cursor: 'pointer' }}>
              <circle cx={q.x} cy={q.y} r={choisi === p.id ? 17 : 13} fill={p.couleur} stroke={choisi === p.id ? '#fff' : 'none'} strokeWidth="2" />
              <text x={q.x} y={q.y + 31} textAnchor="middle" fill="var(--texte)" fontSize="13">{p.nom.split(' ')[0]}</text>
            </g>
          })}
        </svg>
        <div>
          {perso ? <>
            <h3 style={{ color: perso.couleur }}>{perso.nom}</h3>
            <p className="petit doux">{perso.archetype} · {perso.age} {t('ans')}</p>
            <p className="petit">{perso.description}</p>
            <h3 style={{ margin: '1em 0 0.4em' }}>{t('Moments clés')}</h3>
            {perso.moments.length ? perso.moments.slice(-10).map((m, i) => <p key={i} className="petit"><span className="pastille">{t('J{n}', { n: m.jour })}</span> {m.texte}</p>) : <p className="doux petit">{t('Rien de marquant pour l’instant.')}</p>}
          </> : <p className="doux">{t('Les personnages que vous rencontrez apparaîtront ici. Plus un lien est fort, plus il se rapproche du centre ; les pointillés rouges signalent une rivalité.')}</p>}
        </div>
      </div>
    </>
  )
}

// ───────────────────────── Journal, enquête, codex ─────────────────────────

function Journal({ e }: { e: GameState }) {
  const groupe = (type: string, titre: string, vide: string) => {
    const l = e.journal.filter((j) => j.type === type)
    return <>
      <h3 style={{ margin: '1.2em 0 0.5em' }}>{t(titre)}</h3>
      {l.length ? l.map((j) => <p key={j.id} style={{ opacity: j.statut === 'actif' ? 1 : 0.5, textDecoration: j.statut === 'accompli' ? 'line-through' : undefined }}>
        <span className="pastille">{t('J{n}', { n: j.jour })}</span> {j.texte}</p>) : <p className="doux">{t(vide)}</p>}
    </>
  }
  return <>
    <h2>{t('Journal')}</h2>
    {groupe('objectif', 'Objectifs', 'Aucun objectif.')}
    {groupe('indice', 'Indices', 'Aucun indice pour l’instant. Ils sont rares : c’est voulu.')}
    {groupe('rumeur', 'Rumeurs', 'Aucune rumeur.')}
  </>
}

function Enquete({ e }: { e: GameState }) {
  const cartes = e.journal.filter((j) => j.type === 'indice' || j.type === 'rumeur')
  const [choisies, setChoisies] = useState<string[]>([])
  const [texte, setTexte] = useState('')
  const phase = useJeu((s) => s.phase)
  const basculer = (id: string) => setChoisies((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-4)))
  return (
    <>
      <h2>{t('Tableau d’enquête')}</h2>
      <p className="doux">{t('Reliez au moins deux indices ou rumeurs, formulez une hypothèse, et le Maître du Jeu la jugera. Une déduction juste fait avancer l’histoire.')}</p>
      <div className="grille trois" style={{ margin: '1.2em 0' }}>
        {cartes.map((c) => (
          <div key={c.id} className={`carte cliquable indice ${choisies.includes(c.id) ? 'choisie' : ''}`} onClick={() => basculer(c.id)}>
            {choisies.includes(c.id) && <span className="num">{choisies.indexOf(c.id) + 1}</span>}
            <span className="pastille">{c.type === 'indice' ? t('Indice') : t('Rumeur')} · {t('J{n}', { n: c.jour })}</span>
            <p>{c.texte}</p>
          </div>
        ))}
      </div>
      {!cartes.length && <p>{t('Votre tableau est vide. Vivez d’abord ; les indices viendront.')}</p>}
      {cartes.length >= 2 && <>
        <textarea rows={3} value={texte} placeholder={t('Votre hypothèse…')} onChange={(ev) => setTexte(ev.target.value)} />
        <div className="rangee" style={{ marginTop: '0.6em' }}>
          <button className="btn plein" disabled={choisies.length < 2 || !texte.trim() || phase !== 'repos'}
            onClick={() => { void api().jeu.deduire(choisies, texte); setTexte(''); setChoisies([]) }}>{t('Soumettre la déduction')}</button>
          <span className="doux petit">{t('{n} carte(s) reliée(s)', { n: choisies.length })}</span>
        </div>
      </>}
      {e.hypotheses.length > 0 && <h3 style={{ margin: '1.6em 0 0.5em' }}>{t('Vos déductions')}</h3>}
      {[...e.hypotheses].reverse().map((h) => (
        <div key={h.id} className="carte" style={{ marginBottom: '0.6em', borderColor: h.verdict === 'juste' ? 'var(--succes)' : h.verdict === 'fausse' ? 'var(--danger)' : undefined }}>
          <span className="pastille">{h.verdict === 'juste' ? t('Juste') : h.verdict === 'partielle' ? t('En partie juste') : t('Fausse')}</span> <i>{h.texte}</i>
          <p className="petit">{h.commentaire}</p>
        </div>
      ))}
    </>
  )
}

function Codex({ e }: { e: GameState }) {
  const [filtre, setFiltre] = useState('tout')
  const persos = e.personnages.filter((p) => p.rencontre)
  const lieux = e.lieux.filter((l) => l.decouvert)
  const cats: [string, string][] = [['tout', 'Tout'], ['personnage', 'Personnages'], ['lieu', 'Lieux'], ['faction', 'Factions'], ['monde', 'Monde'], ['objet', 'Objets']]
  const voir = (c: string) => filtre === 'tout' || filtre === c
  return (
    <>
      <h2>{t('Codex')}</h2>
      <div className="rangee" style={{ marginBottom: '1em' }}>{cats.map(([id, nom]) => <button key={id} className={`btn petit ${filtre === id ? 'plein' : ''}`} onClick={() => setFiltre(id)}>{t(nom)}</button>)}</div>
      {voir('personnage') && persos.map((p) => (
        <div key={p.id} className="carte rangee" style={{ marginBottom: '0.6em', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <Portrait perso={p} /><div><b style={{ color: p.couleur }}>{p.nom}</b> <span className="doux petit">{p.archetype}</span><p className="petit">{p.description}</p>{p.opinion && e.succes.length > 0 && p.role === 'heroine' && p.resonance >= 25 && <p className="petit doux"><i>{t('Ce qu’elle semble penser de vous :')} {p.opinion}</i></p>}</div>
        </div>
      ))}
      {voir('lieu') && lieux.map((l) => <div key={l.id} className="carte" style={{ marginBottom: '0.6em' }}><b>{l.nom}</b><p className="petit doux">{l.description || t('Vous y êtes passé.')}</p></div>)}
      {voir('faction') && e.factions.map((f) => <div key={f.id} className="carte" style={{ marginBottom: '0.6em' }}><b>{f.nom}</b><p className="petit doux">{f.description}</p></div>)}
      {e.codex.filter((c) => voir(c.categorie)).map((c) => <div key={c.id} className="carte" style={{ marginBottom: '0.6em' }}><b>{c.titre}</b> <span className="pastille">{t('J{n}', { n: c.jour })}</span><p className="petit" style={{ whiteSpace: 'pre-wrap' }}>{c.texte}</p></div>)}
    </>
  )
}

// ───────────────────────── Emploi du temps ─────────────────────────

function Emploi({ e }: { e: GameState }) {
  const univers = useJeu((s) => s.initial?.univers.find((u) => u.id === e.preferences.univers))
  const phase = useJeu((s) => s.phase)
  const jour = e.calendrier.jour
  const debut = jour - ((jour - 1) % 7)
  const aVenir = (univers?.evenements ?? []).filter((x) => x.jour >= jour).slice(0, 5)
  return (
    <>
      <h2>{t('Emploi du temps')}</h2>
      <p className="doux">{t('Semaine {s} · chapitre {c}', { s: Math.floor((jour - 1) / 7) + 1, c: e.rythme.chapitre })}</p>
      <table style={{ margin: '1em 0' }}>
        <thead><tr><th />{Array.from({ length: 7 }, (_, i) => <th key={i} style={{ color: debut + i === jour ? 'var(--accent)' : undefined }}>{JOURS_SEMAINE[i].slice(0, 3)} {debut + i}</th>)}</tr></thead>
        <tbody>
          {CRENEAUX.map((c) => (
            <tr key={c}><th>{NOMS_CRENEAUX[c]}</th>
              {Array.from({ length: 7 }, (_, i) => {
                const j = debut + i
                const ici = j === jour && creneauDe(e.calendrier) === c
                const evenement = univers?.evenements.find((x) => x.jour === j)
                return <td key={i} className="petit" style={{ background: ici ? 'color-mix(in srgb, var(--accent) 22%, transparent)' : undefined, opacity: j < jour ? 0.4 : 1 }}>
                  {evenement && c === 'apres-midi' ? <b style={{ color: 'var(--accent)' }}>{evenement.nom}</b> : estJourDeRepos(j) || c === 'soir' ? t('Libre') : univers?.emploiDuTemps[c] ?? '—'}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {aVenir.length > 0 && <><h3>{t('À venir')}</h3>{aVenir.map((x) => <p key={x.jour} className="petit"><span className="pastille accent">{t('Jour {n}', { n: x.jour })}</span> <b>{x.nom}</b> — {x.description}</p>)}</>}
      <div className="rangee" style={{ marginTop: '1.2em' }}>
        <button className="btn" disabled={phase !== 'repos' || !!e.jetEnAttente} onClick={() => { useJeu.getState().ouvrirPanneau(null); void api().jeu.avancerTemps('creneau') }}>{t('Laisser passer ce moment')}</button>
        <button className="btn" disabled={phase !== 'repos' || !!e.jetEnAttente} onClick={() => { useJeu.getState().ouvrirPanneau(null); void api().jeu.avancerTemps('jour') }}>{t('Aller dormir (passer au lendemain)')}</button>
      </div>
      <p className="doux petit">{t('Le temps libre se dépense : voir quelqu’un, s’entraîner (un point tous les trois entraînements), enquêter ou se reposer.')}</p>
    </>
  )
}

function Historique() {
  const scenes = useJeu((s) => s.scenes)
  useEffect(() => { document.getElementById('fin-historique')?.scrollIntoView() }, [])
  return (
    <>
      <h2>{t('Historique')}</h2>
      {scenes.map((sc, i) => (
        <div key={i} className="histo-scene">
          {sc.action && sc.action !== '🎲' && <div className="histo-action">{sc.action}</div>}
          {sc.lignes.map((l, j) => l.type === 'lieu' ? <p key={j} className="pastille accent">{l.nom}</p>
            : l.type === 'replique' ? <p key={j} className="histo-ligne"><b>{l.personnage}</b>{l.chuchote ? <i>« {l.texte} »</i> : <>« {l.texte} »</>}</p>
              : 'texte' in l ? <p key={j} className="histo-ligne doux">{l.texte}</p> : null)}
        </div>
      ))}
      <div id="fin-historique" />
    </>
  )
}

// ───────────────────────── Sauvegardes (arbre) ─────────────────────────

function Sauvegardes() {
  const [arbre, setArbre] = useState<NoeudSauvegarde[]>([])
  const [confirmer, setConfirmer] = useState(false)
  const s = useJeu()
  const recharger = () => api().jeu.arbre().then(setArbre)
  useEffect(() => { void recharger() }, [])
  // Colonne de chaque nœud : 0 pour la branche jouée, puis une colonne par branche abandonnée.
  const colonne = new Map<string, number>()
  let prochaine = 1
  for (const n of arbre) colonne.set(n.id, n.surChemin ? 0 : (n.parent && colonne.get(n.parent)) || prochaine++)
  const revenir = async (id: string) => { s.charger(await api().jeu.revenirA(id)) }
  return (
    <>
      <h2>{t('Sauvegardes')}</h2>
      <p className="doux">{t('Chaque scène est sauvegardée automatiquement. Revenez à n’importe laquelle : continuer depuis là ouvre une nouvelle branche, l’ancienne reste disponible.')}</p>
      <div className="rangee" style={{ margin: '1em 0' }}>
        <button className="btn" onClick={async () => { await api().jeu.sauvegardeRapide(); void recharger() }}>{t('Sauvegarde rapide (F5)')}</button>
        <button className="btn" disabled={s.phase !== 'repos'} onClick={() => { s.ouvrirPanneau(null); void api().jeu.refaire() }}>{t('Faire réécrire la dernière scène')}</button>
        <button className="btn" onClick={() => api().parties.exporter(s.etat!.id)}>{t('Exporter la partie')}</button>
        {confirmer
          ? <><span style={{ color: 'var(--danger)' }}>{t('Revenir au tout début ? (le monde et les images sont gardés)')}</span>
            <button className="btn danger" onClick={async () => { s.charger(await api().jeu.recommencer()); void api().jeu.commencer() }}>{t('Oui, recommencer')}</button>
            <button className="btn fantome" onClick={() => setConfirmer(false)}>{t('Annuler')}</button></>
          : <button className="btn danger" onClick={() => setConfirmer(true)}>{t('Recommencer cette histoire')}</button>}
        <button className="btn pousse" onClick={() => s.quitterPartie()}>{t('Retour au titre')}</button>
      </div>
      {[...arbre].reverse().map((n) => (
        <div key={n.id} className="ligne-table" style={{ paddingLeft: (colonne.get(n.id) ?? 0) * 26, opacity: n.surChemin ? 1 : 0.6 }}>
          <div>
            <span className="pastille" style={{ borderColor: n.surChemin ? 'var(--accent)' : undefined }}>{t('J{n}', { n: n.jour })} · {NOMS_CRENEAUX[CRENEAUX[n.creneau] ?? 'matin']}</span>{' '}
            {n.marque && <span className="pastille accent">★ {n.marque}</span>} <span className="petit">{n.lieu}</span>
            <div className="petit doux">{n.extrait || t('(début)')} · {dateCourte(n.creeLe)}{!n.surChemin && ` · ${t('autre branche')}`}</div>
          </div>
          <button className="btn petit" disabled={s.phase !== 'repos'} onClick={() => revenir(n.id)}>{t('Revenir ici')}</button>
        </div>
      ))}
    </>
  )
}

// ───────────────────────── Galerie, succès, coûts, coulisses ─────────────────────────

function Vignette(p: { cle: string; titre: string; onVoir(url: string): void }) {
  const url = useImage(p.cle)
  const [prompt, setPrompt] = useState<string | null>(null)
  const procedural = useJeu((s) => s.reglages.images.fournisseur === 'procedural')
  return (
    <figure>
      {url && <img src={url} alt={p.titre} onClick={() => p.onVoir(url)} />}
      <figcaption>{p.titre}
        <div className="rangee" style={{ marginTop: '0.4em' }}>
          <button className="btn petit fantome" onClick={() => api().images.importer(p.cle)}>{t('Remplacer')}</button>
          {!procedural && <button className="btn petit fantome" onClick={async () => setPrompt(await api().images.prompt(p.cle))}>{t('Régénérer…')}</button>}
          <button className="btn petit fantome" onClick={() => api().images.reinitialiser(p.cle)}>{t('Réinitialiser')}</button>
        </div>
        {prompt !== null && <>
          <textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} style={{ fontSize: '0.8em', marginTop: '0.4em' }} />
          <button className="btn petit" onClick={() => { void api().images.regenerer(p.cle, prompt); setPrompt(null) }}>{t('Générer avec ce prompt')}</button>
        </>}
      </figcaption>
    </figure>
  )
}

function Galerie({ e }: { e: GameState }) {
  const [vue, setVue] = useState<string | null>(null)
  const persos = e.personnages.filter((p) => p.rencontre)
  return (
    <>
      <h2>{t('Galerie')}</h2>
      <h3 style={{ margin: '0.6em 0' }}>{t('Illustrations')}</h3>
      {e.galerie.length ? <div className="galerie">{e.galerie.map((g) => <Vignette key={g.id} cle={`cg:${g.id}`} titre={g.titre} onVoir={setVue} />)}</div> : <p className="doux">{t('Les moments forts de votre histoire s’afficheront ici.')}</p>}
      <h3 style={{ margin: '1.4em 0 0.6em' }}>{t('Portraits')}</h3>
      <div className="galerie">{persos.map((p) => <Vignette key={p.id} cle={`sprite:${p.id}:neutre`} titre={p.nom} onVoir={setVue} />)}</div>
      <h3 style={{ margin: '1.4em 0 0.6em' }}>{t('Lieux')}</h3>
      <div className="galerie">{e.lieux.filter((l) => l.decouvert).map((l) => <Vignette key={l.id} cle={`decor:${l.id}:jour`} titre={l.nom} onVoir={setVue} />)}</div>
      {vue && <div className="visionneuse" onClick={() => setVue(null)}><img src={vue} alt="" /></div>}
    </>
  )
}

function Succes({ e }: { e: GameState }) {
  const defs = useJeu((s) => s.initial?.succes ?? [])
  const st = e.stats
  return (
    <>
      <h2>{t('Succès')} · {e.succes.length} / {defs.length}</h2>
      <div className="grille trois" style={{ marginBottom: '1.4em' }}>
        {[[st.scenes, 'scènes'], [e.calendrier.jour, 'jours'], [st.jets ? `${st.jetsReussis}/${st.jets}` : '—', 'jets réussis'], [st.critiques, 'critiques'], [st.combats, 'combats'], [st.motsEcrits, 'mots écrits']].map(([v, n]) => (
          <div key={n} className="carte stat"><b>{v}</b><small>{t(String(n))}</small></div>))}
      </div>
      <div className="grille deux">
        {defs.map((d) => <div key={d.id} className="carte" style={{ opacity: e.succes.includes(d.id) ? 1 : 0.4 }}><b>{e.succes.includes(d.id) ? '★ ' : '☆ '}{d.nom}</b><div className="petit doux">{d.description}</div></div>)}
      </div>
    </>
  )
}

function Couts() {
  const b = useJeu((s) => s.bilan)
  const demo = useJeu((s) => s.reglages.ia.fournisseur === 'mock')
  if (!b) return <h2>{t('Coûts')}</h2>
  const barre = (titre: string, valeur: number, plafond: number) => (
    <div className="carte"><div className="rangee"><b>{t(titre)}</b><span className="pousse">{dollars(valeur)}{plafond > 0 ? ` / ${dollars(plafond)}` : ''}</span></div>
      {plafond > 0 && <Jauge valeur={valeur} max={plafond} couleur={valeur / plafond > 0.8 ? 'var(--danger)' : undefined} />}</div>
  )
  return (
    <>
      <h2>{t('Coûts')}</h2>
      {demo && <div className="avis">{t('Mode démonstration : aucun appel payant.')}</div>}
      <div className="grille trois">{barre('Cette session', b.session, b.plafondSession)}{barre('Cette partie', b.partie, b.plafondPartie)}{barre('Total, toutes parties', b.total, 0)}</div>
      <p className="doux petit" style={{ margin: '1em 0' }}>{t('Part des jetons d’entrée lus en cache : {p} %. Plus elle est haute, moins chaque tour coûte.', { p: Math.round(b.tauxCache * 100) })} {b.images > 0 && t('Images : {c}.', { c: dollars(b.images) })}</p>
      <table>
        <thead><tr><th>{t('Rôle')}</th><th className="n">{t('Appels')}</th><th className="n">{t('Entrée')}</th><th className="n">{t('Cache')}</th><th className="n">{t('Sortie')}</th><th className="n">{t('Coût')}</th></tr></thead>
        <tbody>{b.parRole.map((r) => <tr key={r.role}><td>{r.role}</td><td className="n">{r.appels}</td><td className="n">{r.entree.toLocaleString('fr-FR')}</td><td className="n">{r.cacheLecture.toLocaleString('fr-FR')}</td><td className="n">{r.sortie.toLocaleString('fr-FR')}</td><td className="n">{dollars(r.cout)}</td></tr>)}</tbody>
      </table>
      <p className="doux petit">{t('Estimations en dollars, d’après les tarifs publics. Les modèles locaux et le mode démonstration ne coûtent rien.')}</p>
    </>
  )
}

function Coulisses({ e }: { e: GameState }) {
  const [journal, setJournal] = useState<EntreeJournalAppels[]>([])
  useEffect(() => { void api().dev.journal().then(setJournal) }, [])
  return (
    <>
      <h2>{t('Coulisses')}</h2>
      <div className="avis attention">{t('Ce panneau révèle la vérité cachée et les consignes des IA.')}</div>
      <details><summary>{t('Rythme et plan du jour')}</summary><pre className="brut">{JSON.stringify({ rythme: e.rythme, plan: e.plan, calendrier: e.calendrier, memoire: { ...e.memoire, scenes: e.memoire.scenes.length } }, null, 2)}</pre></details>
      <details><summary>{t('État complet du jeu')}</summary><pre className="brut">{JSON.stringify(e, null, 2)}</pre></details>
      <h3 style={{ margin: '1em 0 0.5em' }}>{t('Journal des appels')} ({journal.length})</h3>
      {journal.map((j) => (
        <details key={j.id}>
          <summary>{new Date(j.quand).toLocaleTimeString('fr-FR')} · <b>{j.role}</b> · {j.fournisseur} {j.modele} · {j.dureeMs} ms{j.usage ? ` · ${j.usage.entree}+${j.usage.cacheLecture}c → ${j.usage.sortie} · ${dollars(j.usage.cout)}` : ''}{j.erreur ? ` · ✕ ${j.erreur}` : ''}</summary>
          <pre className="brut">{j.prompt}</pre><pre className="brut">{j.reponse}</pre>
        </details>
      ))}
    </>
  )
}

export function Menu() {
  const { panneau, ouvrirPanneau, etat, reglages } = useJeu()
  if (!panneau || !etat) return null
  const onglets = reglages.dev ? [...ONGLETS, ['dev', 'Coulisses'] as [Panneau, string]] : ONGLETS
  return (
    <div className="voile" onClick={(ev) => ev.target === ev.currentTarget && ouvrirPanneau(null)}>
      <div className="grimoire">
        <nav className="onglets">
          {onglets.map((o, i) => o ? <button key={o[0]} className={panneau === o[0] ? 'actif' : ''} onClick={() => ouvrirPanneau(o[0])}>{t(o[1])}</button> : <hr key={i} />)}
        </nav>
        <div className="page">
          <button className="btn fantome fermer" onClick={() => ouvrirPanneau(null)}>✕</button>
          {panneau === 'fiche' && <Fiche e={etat} />}
          {panneau === 'liens' && <Liens e={etat} />}
          {panneau === 'factions' && <Factions e={etat} />}
          {panneau === 'relations' && <Relations e={etat} />}
          {panneau === 'journal' && <Journal e={etat} />}
          {panneau === 'enquete' && <Enquete e={etat} />}
          {panneau === 'codex' && <Codex e={etat} />}
          {panneau === 'emploi' && <Emploi e={etat} />}
          {panneau === 'historique' && <Historique />}
          {panneau === 'sauvegardes' && <Sauvegardes />}
          {panneau === 'galerie' && <Galerie e={etat} />}
          {panneau === 'succes' && <Succes e={etat} />}
          {panneau === 'couts' && <Couts />}
          {panneau === 'reglages' && <Reglages />}
          {panneau === 'dev' && <Coulisses e={etat} />}
        </div>
      </div>
    </div>
  )
}
