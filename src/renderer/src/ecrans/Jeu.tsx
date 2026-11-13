/**
 * Écran de jeu : décor, sprites, boîte de dialogue, zone d'action, dés, combat.
 * Tout ce qui est affiché vient du magasin ; les actions partent vers le processus principal.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '@shared/i18n'
import type { Calendrier, Expression, GameState, Ligne, Personnage, StatId } from '@shared/types'
import { STATS } from '@shared/types'
import { trouverParNom } from '@core/rules/moteur'
import { creneauDe, dateLisible, lumiereDe } from '@core/rules/rythme'
import { modificateur, NOMS_STATS } from '@core/rules/des'
import { api, useJeu } from '../store'
import { audio, Jauge, useImage } from '../outils'
import { dire, taire } from '../voix'
import { De3D, ETIQUETTES_D20, ETIQUETTES_DIZAINES, ETIQUETTES_UNITES } from '../jeu/De3D'
import { Meteo } from '../jeu/Meteo'
import { Menu } from '../panneaux/Menu'

// ───────────────────────── Décor et sprites ─────────────────────────

function Decor(p: { cle: string | null }) {
  const url = useImage(p.cle)
  const [couches, setCouches] = useState<{ url: string; id: number }[]>([])
  useEffect(() => {
    if (!url) return
    setCouches((c) => (c[c.length - 1]?.url === url ? c : [...c.slice(-1), { url, id: Date.now() }]))
  }, [url])
  return (
    <div className="decor">
      {couches.map((c, i) => <img key={c.id} src={c.url} alt="" style={{ opacity: i === couches.length - 1 ? 1 : 0 }} />)}
    </div>
  )
}

function Sprite(p: { perso: Personnage; expression: Expression; position: number; actif: boolean }) {
  const url = useImage(`sprite:${p.perso.id}:${p.expression}`)
  const neutre = useImage(`sprite:${p.perso.id}:neutre`)
  const src = url ?? neutre
  if (!src) return null
  return (
    <div className={`sprite entree ${p.actif ? '' : 'retrait'}`} style={{ left: `${p.position}%` }}>
      <img src={src} alt={p.perso.nom} />
    </div>
  )
}

interface EnScene { perso: Personnage; expression: Expression; dernier: number }

/** Les deux derniers personnages à avoir parlé depuis le dernier changement de lieu. */
function distribution(etat: GameState, lignes: Ligne[], curseur: number): EnScene[] {
  const vus = new Map<string, EnScene>()
  for (let i = 0; i <= curseur && i < lignes.length; i++) {
    const l = lignes[i]
    if (l.type === 'lieu') vus.clear()
    if (l.type !== 'replique') continue
    const perso = trouverParNom(etat.personnages, l.personnage)
    if (perso) vus.set(perso.id, { perso, expression: l.expression, dernier: i })
  }
  return [...vus.values()].sort((a, b) => b.dernier - a.dernier).slice(0, 2).sort((a, b) => a.perso.id.localeCompare(b.perso.id))
}

// ───────────────────────── Boîte de dialogue ─────────────────────────

function Boite(p: { ligne: Ligne | undefined; direct: string | null; couleur?: string; enEcriture: boolean; vitesse: number; onAvancer(): void; onComplet(c: boolean): void }) {
  const texte = p.direct ?? (p.ligne && 'texte' in p.ligne ? p.ligne.texte : '')
  const [n, setN] = useState(0)
  const complet = p.direct !== null || n >= texte.length

  useEffect(() => { setN(p.direct !== null ? texte.length : 0) }, [p.ligne]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (complet) return
    if (p.vitesse >= 200) { setN(texte.length); return }
    const pas = Math.max(1, Math.round(p.vitesse / 30))
    const minuterie = setInterval(() => setN((v) => Math.min(texte.length, v + pas)), 1000 / 30)
    return () => clearInterval(minuterie)
  }, [complet, texte, p.vitesse])
  useEffect(() => { p.onComplet(complet) }, [complet]) // eslint-disable-line react-hooks/exhaustive-deps

  const clic = () => (complet ? p.onAvancer() : setN(texte.length))
  const l = p.ligne
  const replique = p.direct === null && l?.type === 'replique' ? l : null
  const classe = p.direct !== null ? 'direct' : replique ? (replique.chuchote ? 'chuchote' : '') : 'narration'
  return (
    <div className="boite" onClick={clic} style={{ ['--couleur-perso' as any]: p.couleur }}>
      {replique && <div className="nom">{replique.personnage}</div>}
      <div className={`texte ${classe}`}>{replique ? `« ${texte.slice(0, n)}${complet ? ' »' : ''}` : texte.slice(0, p.direct !== null ? texte.length : n)}</div>
      {p.enEcriture ? <span className="plume">{t('Le Narrateur écrit…')}</span> : complet && <span className="suite">▼</span>}
    </div>
  )
}

// ───────────────────────── Zone d'action ─────────────────────────

function ZoneAction(p: { etat: GameState }) {
  const { jouer, reglages, brouillon } = useJeu()
  const [texte, setTexte] = useState(brouillon)
  const [stat, setStat] = useState<StatId>('force')
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (brouillon) setTexte(brouillon) }, [brouillon])
  useEffect(() => { ref.current?.focus() }, [])
  const envoyer = (v = texte, activite?: string) => { if (v.trim()) { jouer(v, activite); setTexte('') } }
  const creneau = creneauDe(p.etat.calendrier)
  const consigne = p.etat.plan?.jour === p.etat.calendrier.jour ? p.etat.plan.consignes.find((c) => c.creneau === creneau) : undefined
  const libre = consigne?.type === 'libre' || creneau === 'soir' || creneau === 'nuit'

  return (
    <div className="zone-action">
      <div className="pistes">
        {reglages.affichage.pistes && p.etat.pistes.map((piste, i) => (
          <button key={piste} className="piste" onClick={() => envoyer(piste)}><kbd>{i + 1}</kbd>{piste}</button>
        ))}
        {libre && (
          <>
            <button className="piste activite" onClick={() => envoyer(t('Je m’entraîne ({stat}).', { stat: NOMS_STATS[stat] }), `entrainement:${stat}`)}>{t('S’entraîner')} :
              <select value={stat} onClick={(e) => e.stopPropagation()} onChange={(e) => setStat(e.target.value as StatId)}
                style={{ width: 'auto', border: 'none', background: 'transparent', padding: '0 0 0 0.4em' }}>
                {STATS.map((s) => <option key={s} value={s}>{NOMS_STATS[s]}</option>)}
              </select>
            </button>
            <button className="piste activite" onClick={() => envoyer(t('Je prends le temps de me reposer.'), 'repos')}>{t('Se reposer')}</button>
          </>
        )}
        <button className="btn fantome petit pousse" title={t('Aucune scène : le temps avance simplement.')}
          onClick={() => api().jeu.avancerTemps(creneau === 'nuit' ? 'jour' : 'creneau')}>
          {creneau === 'nuit' ? t('Dormir jusqu’à demain ›') : t('Laisser passer ce moment ›')}
        </button>
      </div>
      <div className="saisie">
        <textarea ref={ref} value={texte} maxLength={2000} placeholder={t('Que faites-vous ? Écrivez librement…')}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer() } }} />
        <button className="btn plein" disabled={!texte.trim()} onClick={() => envoyer()}>{t('Agir')}</button>
      </div>
    </div>
  )
}

// ───────────────────────── Jets de dés ─────────────────────────

function CarteJet(p: { etat: GameState }) {
  const jet = useJeu((s) => s.jet)!
  const [reel, setReel] = useState('')
  const mod = modificateur(p.etat.hero.stats[jet.stat]) * (jet.de === 'D100' ? 5 : 1)
  const max = jet.de === 'D100' ? 100 : 20
  const valeur = parseInt(reel, 10)
  const valide = Number.isInteger(valeur) && valeur >= 1 && valeur <= max
  return (
    <div className="jet-carte">
      <h3>{t('Jet de {stat}', { stat: NOMS_STATS[jet.stat] })} · {jet.de}</h3>
      <p className="motif">{jet.motif}</p>
      <p className="doux petit">{t('Difficulté {dd} · votre modificateur : {mod}', { dd: jet.difficulte, mod: mod >= 0 ? `+${mod}` : mod })}</p>
      <div className="rangee" style={{ marginTop: '0.8em' }}>
        <button className="btn plein" onClick={() => { audio.effet('de-roule'); void api().jeu.lancerDe(null) }}>{t('Lancer le dé')}</button>
        <span className="doux">{t('ou, avec un vrai dé :')}</span>
        <input type="number" min={1} max={max} value={reel} placeholder={`1–${max}`} style={{ width: 96 }}
          onChange={(e) => setReel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && valide) void api().jeu.lancerDe(valeur) }} />
        <button className="btn" disabled={!valide} onClick={() => api().jeu.lancerDe(valeur)}>{t('Valider mon résultat')}</button>
      </div>
    </div>
  )
}

function ResultatDe() {
  const r = useJeu((s) => s.resultatJet)
  const [vu, setVu] = useState<object | null>(null)
  const [pose, setPose] = useState(false)
  useEffect(() => {
    setPose(!r?.virtuel)
    if (!r) return
    if (!r.virtuel) audio.effet(r.critique ? 'critique' : r.reussite ? 'de-reussite' : 'de-echec')
  }, [r])
  useEffect(() => {
    if (!r || !pose) return
    const m = setTimeout(() => setVu(r), 2600)
    return () => clearTimeout(m)
  }, [r, pose])
  if (!r || vu === r) return null
  const fini = () => { setPose(true); audio.effet(r.critique ? 'critique' : r.reussite ? 'de-reussite' : 'de-echec') }
  const signe = r.modificateur >= 0 ? `+${r.modificateur}` : `${r.modificateur}`
  return (
    <div className="de-zone" onClick={() => setVu(r)}>
      {r.virtuel && (
        <div className="rangee">
          {r.de === 'D20'
            ? <De3D valeur={String(r.valeur)} etiquettes={ETIQUETTES_D20} onFini={fini} />
            : <>
              <De3D valeur={String(Math.floor((r.valeur % 100) / 10) * 10).padStart(2, '0')} etiquettes={ETIQUETTES_DIZAINES} taille={200} onFini={fini} />
              <De3D valeur={String(r.valeur % 10)} etiquettes={ETIQUETTES_UNITES} taille={200} couleur="#8fb4e6" />
            </>}
        </div>
      )}
      {pose && (
        <div className={`de-resultat ${r.reussite ? 'reussite' : 'echec'}`}>
          {r.critique === 'reussite' ? t('Réussite critique !') : r.critique === 'echec' ? t('Échec critique…') : r.reussite ? t('Réussite') : t('Échec')}
          <div className="doux petit" style={{ fontFamily: 'var(--police-ui)' }}>{r.valeur} {signe} = {r.total} · {t('difficulté {dd}', { dd: r.difficulte })}</div>
        </div>
      )}
    </div>
  )
}

// ───────────────────────── Combat ─────────────────────────

function Combat(p: { etat: GameState }) {
  const c = p.etat.combat!
  const ennemis = c.combattants.filter((x) => x.camp === 'ennemi' && x.pv > 0)
  const [cible, setCible] = useState(ennemis[0]?.id ?? '')
  const [reel, setReel] = useState('')
  const d20 = () => { const v = parseInt(reel, 10); setReel(''); return Number.isInteger(v) && v >= 1 && v <= 20 ? v : null }
  const cibleValide = ennemis.some((e) => e.id === cible) ? cible : ennemis[0]?.id ?? ''
  const techniques = p.etat.hero.capacites.filter((k) => k.coutMana)
  return (
    <div className="combat">
      <div className="rangee"><h3 style={{ color: 'var(--danger)' }}>{t('Combat')} · {t('tour {n}', { n: c.tour })}</h3><span className="doux petit pousse">{c.enjeu}</span></div>
      {c.combattants.map((x) => (
        <div key={x.id} className={`combattant ${x.pv <= 0 ? 'ko' : ''}`} onClick={() => x.camp === 'ennemi' && x.pv > 0 && setCible(x.id)} style={{ cursor: x.camp === 'ennemi' ? 'pointer' : 'default' }}>
          <span style={{ color: x.camp === 'ennemi' ? 'var(--danger)' : x.camp === 'allie' ? 'var(--accent-2)' : 'var(--accent)' }}>{x.id === cibleValide ? '▸ ' : ''}{x.nom}</span>
          <Jauge valeur={x.pv} max={x.pvMax} couleur={x.camp === 'ennemi' ? 'var(--danger)' : 'var(--succes)'} />
          <span className="doux petit">{x.pv}/{x.pvMax}</span>
        </div>
      ))}
      <div className="combat-journal">{c.journal.slice(-5).map((l, i) => <div key={i}>{l}</div>)}</div>
      <div className="rangee">
        <button className="btn plein" onClick={() => api().jeu.actionCombat({ type: 'attaque', cible: cibleValide }, d20())}>{t('Attaquer')}</button>
        {techniques.map((k) => (
          <button key={k.id} className="btn" disabled={p.etat.hero.mana < (k.coutMana ?? 0)} title={k.description}
            onClick={() => api().jeu.actionCombat({ type: 'technique', capacite: k.id, cible: cibleValide }, d20())}>{k.nom} ({k.coutMana} {t('mana')})</button>
        ))}
        <button className="btn" onClick={() => api().jeu.actionCombat({ type: 'defense' }, d20())}>{t('Se défendre')}</button>
        <button className="btn fantome" onClick={() => api().jeu.actionCombat({ type: 'fuite' }, d20())}>{t('Fuir')}</button>
        <input className="pousse" type="number" min={1} max={20} value={reel} placeholder={t('D20 réel (facultatif)')} style={{ width: 170 }} onChange={(e) => setReel(e.target.value)} />
      </div>
      <p className="doux petit">{t('Mana : {m}/{max}. Sans dé réel saisi, le jeu lance le D20 pour vous.', { m: p.etat.hero.mana, max: p.etat.hero.manaMax })}</p>
    </div>
  )
}

// ───────────────────────── Notifications, transition ─────────────────────────

function Notifications() {
  const { notifications, retirerNotification } = useJeu()
  const vues = useRef(new Set<number>())
  useEffect(() => {
    for (const n of notifications) {
      if (vues.current.has(n.id)) continue
      vues.current.add(n.id)
      audio.effet(n.genre === 'palier' ? 'palier' : n.genre === 'succes' ? 'succes' : 'notification')
      setTimeout(() => retirerNotification(n.id), n.genre === 'palier' || n.genre === 'succes' ? 8000 : 5200)
    }
  }, [notifications, retirerNotification])
  return (
    <div className="notifs">
      {notifications.map((n) => <div key={n.id} className={`notif ${n.genre} ${n.delta ? (n.delta > 0 ? 'plus' : 'moins') : ''}`}>{n.texte}</div>)}
    </div>
  )
}

function Transition() {
  const tr = useJeu((s) => s.transition)
  const [visible, setVisible] = useState<number | null>(null)
  useEffect(() => {
    if (!tr) return
    setVisible(tr.id)
    audio.effet('transition')
    const m = setTimeout(() => setVisible(null), 2600)
    return () => clearTimeout(m)
  }, [tr])
  if (!tr || visible !== tr.id) return null
  return <div className="transition" key={tr.id}><h1>{tr.titre}</h1>{tr.sousTitre && <p>{tr.sousTitre}</p>}</div>
}

const PHASES: Record<string, string> = {
  narration: 'Le Narrateur écrit…', rapport: 'Mise à jour de votre fiche…', nuit: 'La nuit passe…', plan: 'Une nouvelle journée se prépare…',
  deduction: 'Le Maître du Jeu réfléchit…', epilogue: 'L’épilogue s’écrit…', monde: 'Le monde prend forme…',
}

// ───────────────────────── Écran ─────────────────────────

export function Jeu() {
  const s = useJeu()
  const etat = s.etat!
  const lignes = s.scenes[s.scenes.length - 1]?.lignes ?? []
  const ligne = s.curseur >= 0 ? lignes[s.curseur] : undefined
  const [complet, setComplet] = useState(false)
  const [cal, setCal] = useState<Calendrier>(etat.calendrier)
  const [secousse, setSecousse] = useState(false)
  const a = s.reglages.affichage
  const finDeLecture = s.narrationFinie && s.curseur >= lignes.length - 1 && complet
  const direct = s.suitDirect && !s.narrationFinie && s.enDirect && s.curseur >= lignes.length - 1 ? s.enDirect.replace(/\[\[[^\]]*\]?\]?/g, '') : null

  // La date et la lumière affichées restent celles de la scène tant que le joueur ne l'a pas lue jusqu'au bout.
  useEffect(() => { if (finDeLecture || lignes.length === 0) setCal(etat.calendrier) }, [finDeLecture, etat.calendrier, lignes.length])

  // Une ligne « lieu » n'est pas du texte : elle change le décor et on passe à la suite.
  useEffect(() => { if (ligne?.type === 'lieu' && s.curseur < lignes.length - 1) s.avancer() }, [ligne, lignes.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const lieuNom = useMemo(() => {
    for (let i = Math.min(s.curseur, lignes.length - 1); i >= 0; i--) { const l = lignes[i]; if (l.type === 'lieu') return l.nom }
    return null
  }, [lignes, s.curseur])
  const lieu = (lieuNom && trouverParNom(etat.lieux, lieuNom)) || etat.lieux.find((l) => l.id === etat.lieuActuel)
  const enScene = useMemo(() => distribution(etat, lignes, s.curseur), [etat, lignes, s.curseur])
  const locuteur = ligne?.type === 'replique' && direct === null ? trouverParNom(etat.personnages, ligne.personnage) : undefined

  // Voix : chaque nouvelle ligne est lue si l'option est active.
  useEffect(() => {
    if (!s.reglages.son.voix || !ligne || !('texte' in ligne) || ligne.type === 'joueur') return
    dire(ligne.texte, ligne.type === 'replique' ? (trouverParNom(etat.personnages, ligne.personnage)?.graine ?? 1) : null, s.reglages.son.volumeVoix)
    return taire
  }, [ligne, s.reglages.son.voix]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ambiance : musique selon l'humeur, effets de mise en scène.
  useEffect(() => {
    audio.setHumeur(etat.combat?.actif ? 'combat' : s.ambiance.humeur)
    if (s.ambiance.effet === 'tremblement' && a.effets) { setSecousse(true); audio.effet('coup'); setTimeout(() => setSecousse(false), 520) }
  }, [s.ambiance, etat.combat?.actif, a.effets])
  useEffect(() => { if (s.erreur) audio.effet('erreur') }, [s.erreur])
  useEffect(() => { if (s.scenes.length) audio.effet('page') }, [s.scenes.length])

  // Mode automatique.
  useEffect(() => {
    if (!a.auto || !complet || s.panneau || s.curseur >= lignes.length - 1) return
    const texte = ligne && 'texte' in ligne ? ligne.texte : ''
    const m = setTimeout(() => s.avancer(), a.delaiAuto + texte.length * 28)
    return () => clearTimeout(m)
  }, [a.auto, a.delaiAuto, complet, s.curseur, lignes.length, s.panneau]) // eslint-disable-line react-hooks/exhaustive-deps

  const basculerAuto = useCallback(() => s.majReglages({ ...s.reglages, affichage: { ...a, auto: !a.auto } }), [s, a])

  // Clavier.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const dansChamp = ['TEXTAREA', 'INPUT', 'SELECT'].includes((e.target as HTMLElement)?.tagName)
      if (e.key === 'Escape') { e.preventDefault(); s.ouvrirPanneau(s.panneau ? null : 'fiche'); return }
      if (e.key === 'F5') { e.preventDefault(); void api().jeu.sauvegardeRapide(); useJeu.setState({ notifications: [...useJeu.getState().notifications, { id: Date.now(), genre: 'info', texte: t('Sauvegarde rapide enregistrée.') }] }); return }
      if (s.panneau || dansChamp) return
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); s.avancer() }
      else if (e.key === 'Control') s.toutAfficher()
      else if (e.key.toLowerCase() === 'a') void basculerAuto()
      else if (e.key.toLowerCase() === 'h') s.ouvrirPanneau('historique')
      else if (['1', '2', '3'].includes(e.key) && finDeLecture && s.phase === 'repos' && !s.jet && etat.pistes[Number(e.key) - 1]) s.jouer(etat.pistes[Number(e.key) - 1])
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [s, finDeLecture, etat.pistes, basculerAuto])

  const occupe = s.phase !== 'repos'
  const reessayable = s.erreur?.reessayable && (s.rapportManquant || !!s.jet || s.scenes.length === 0)

  return (
    <div className={`jeu ${secousse ? 'tremble' : ''}`} onWheel={(e) => { if (e.deltaY < -40 && !s.panneau) s.ouvrirPanneau('historique') }}>
      <Decor cle={lieu ? `decor:${lieu.id}:${lumiereDe(cal)}` : null} />
      {a.effets && <Meteo genre={s.ambiance.meteo} />}
      <div className="sprites">
        {enScene.map((x, i) => (
          <Sprite key={x.perso.id} perso={x.perso} expression={x.expression} position={enScene.length === 1 ? 50 : i === 0 ? 31 : 69}
            actif={!locuteur || locuteur.id === x.perso.id} />
        ))}
      </div>
      {s.ambiance.effet === 'flash' && a.effets && <div className="flash" key={s.ambiance.id} />}

      <div className="barre-haut">
        <span className="date">{dateLisible(cal)}</span>
        {lieu && <span className="lieu">{lieu.nom}</span>}
        <span className="pousse" />
        {(occupe || s.generationImage) && (
          <span className="indicateur"><i />{t(occupe ? PHASES[s.phase] ?? '…' : 'Une image se dessine…')}
            {s.phase === 'narration' && <button className="btn fantome petit" onClick={() => api().jeu.annuler()}>{t('Interrompre')}</button>}
          </span>
        )}
        <button className="btn" onClick={() => s.ouvrirPanneau('historique')} title="H">{t('Historique')}</button>
        <button className={`btn ${a.auto ? 'actif' : ''}`} onClick={basculerAuto} title="A">{t('Auto')}</button>
        <button className="btn" onClick={() => s.toutAfficher()} title="Ctrl">{t('Passer')}</button>
        <button className="btn" onClick={() => s.ouvrirPanneau('fiche')} title={t('Échap')}>{t('Menu')}</button>
      </div>

      <div className="bas">
        {s.erreur && (
          <div className="erreur">
            <div style={{ flex: 1 }}>
              <b>{s.erreur.message}</b>
              {s.erreur.detail && s.reglages.dev && <details><summary>{t('Détail technique')}</summary>{s.erreur.detail}</details>}
            </div>
            {reessayable && <button className="btn" onClick={() => { s.fermerErreur(); void api().jeu.reessayer() }}>{t('Réessayer')}</button>}
            {s.erreur.genre === 'cle' || s.erreur.genre === 'plafond' ? <button className="btn" onClick={() => s.ouvrirPanneau('reglages')}>{t('Ouvrir les réglages')}</button> : null}
            <button className="btn fantome" onClick={s.fermerErreur}>✕</button>
          </div>
        )}
        {finDeLecture && !etat.termine && (
          etat.combat?.actif ? <Combat etat={etat} />
            : s.jet ? (occupe ? null : <CarteJet etat={etat} />)
              : occupe ? null : <ZoneAction etat={etat} />
        )}
        {finDeLecture && etat.finProposee && !etat.termine && !occupe && (
          <button className="btn" onClick={() => api().jeu.conclure()}>{t('L’histoire touche à sa fin : écrire l’épilogue')}</button>
        )}
        {(ligne && ligne.type !== 'lieu') || direct !== null ? (
          <Boite ligne={ligne} direct={direct} couleur={locuteur?.couleur} vitesse={a.vitesseTexte} enEcriture={!s.narrationFinie && s.curseur >= lignes.length - 1}
            onAvancer={s.avancer} onComplet={setComplet} />
        ) : (
          !s.narrationFinie && <div className="boite"><div className="texte direct">{s.enDirect.replace(/\[\[[^\]]*\]?\]?/g, '') || '…'}</div><span className="plume">{t('Le Narrateur écrit…')}</span></div>
        )}
      </div>

      <Notifications />
      <Transition />
      <ResultatDe />
      {(etat.termine || s.phase === 'epilogue') && (
        <div className="epilogue">
          <article>
            <h1>{t('Épilogue')}</h1>
            {s.epilogue || t('…')}
            {etat.termine && (
              <div className="rangee" style={{ justifyContent: 'center', marginTop: '3em' }}>
                <button className="btn" onClick={() => s.ouvrirPanneau('relations')}>{t('Revoir les liens')}</button>
                <button className="btn plein" onClick={() => s.quitterPartie()}>{t('Retour au titre')}</button>
              </div>
            )}
          </article>
        </div>
      )}
      {s.panneau && <Menu />}
    </div>
  )
}
