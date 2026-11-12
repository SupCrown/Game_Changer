import { useState } from 'react'
import { t } from '@shared/i18n'
import type { Preferences, StatId } from '@shared/types'
import { STATS } from '@shared/types'
import { PREFERENCES_DEFAUT } from '@core/game/creation'
import { NOMS_STATS } from '@core/rules/des'
import { api, useJeu } from '../store'
import { Bascule, Champ, Choix } from '../outils'

const DESCRIPTIONS_STATS: Record<StatId, string> = {
  force: 'Puissance, endurance, coups portés.',
  agilite: 'Réflexes, esquive, discrétion.',
  esprit: 'Savoir, logique, maîtrise de la magie.',
  volonte: 'Sang-froid, courage, résistance.',
  charme: 'Aisance, persuasion, présence.',
  perception: 'Sens en éveil, intuition, détails.',
}

export function NouvellePartie() {
  const { initial, aller, charger, reglages } = useJeu()
  const creation = useJeu((s) => s.creation)
  const univers = initial?.univers ?? []
  const [prefs, setPrefs] = useState<Preferences>({ ...PREFERENCES_DEFAUT, univers: univers[0]?.id ?? 'fantasy', ton: univers[0]?.tons[0] ?? PREFERENCES_DEFAUT.ton })
  const [prenom, setPrenom] = useState('')
  const [age, setAge] = useState(19)
  const [forces, setForces] = useState<StatId[]>(['volonte', 'perception'])
  const [faiblesse, setFaiblesse] = useState<StatId | null>('force')
  const [erreur, setErreur] = useState('')
  const pack = univers.find((u) => u.id === prefs.univers)
  const maj = (p: Partial<Preferences>) => setPrefs((a) => ({ ...a, ...p }))

  const basculerForce = (s: StatId) => {
    setForces((f) => (f.includes(s) ? f.filter((x) => x !== s) : [...f, s].slice(-2)))
    if (faiblesse === s) setFaiblesse(null)
  }

  const creer = async () => {
    setErreur('')
    useJeu.setState({ creation: true })
    try {
      const i = await api().parties.creer(prefs, { prenom: prenom.trim() || 'Aubin', age, forces, faiblesse })
      charger(i)
      void api().jeu.commencer()
    } catch (e: any) {
      setErreur(String(e.message ?? e))
    } finally {
      useJeu.setState({ creation: false })
    }
  }

  if (creation) {
    return (
      <div className="attente">
        <div className="orbe" />
        <h2>{t('Le monde prend forme…')}</h2>
        <p className="doux">{t('Un univers, une distribution et une vérité cachée s’écrivent pour vous. Cela peut prendre une minute.')}</p>
      </div>
    )
  }

  return (
    <div className="nouvelle">
      <div className="rangee" style={{ marginBottom: '1.4em' }}>
        <h1 style={{ color: 'var(--accent)', letterSpacing: '0.14em' }}>{t('Nouvelle histoire')}</h1>
        <button className="btn fantome pousse" onClick={() => aller('titre')}>{t('Retour')}</button>
      </div>

      <section>
        <h2>1 · {t('L’univers')}</h2>
        <div className="grille trois">
          {univers.map((u) => (
            <div key={u.id} className={`carte cliquable univers-carte ${prefs.univers === u.id ? 'choisie' : ''}`}
              onClick={() => maj({ univers: u.id, ton: u.tons[0] ?? prefs.ton, premisse: '' })}>
              <h3>{u.nom}</h3>
              <p className="petit" style={{ fontStyle: 'italic' }}>{u.accroche}</p>
              <p className="doux petit">{u.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grille deux" style={{ gap: '2em' }}>
        <div>
          <h2>2 · {t('L’histoire')}</h2>
          <Champ titre={t('Point de départ')} aide={t('Gardez celui-ci, modifiez-le, ou décrivez le vôtre.')}>
            <textarea rows={5} value={prefs.premisse || pack?.premisse || ''} onChange={(e) => maj({ premisse: e.target.value })} />
          </Champ>
          <Champ titre={t('Ton')}>
            <input type="text" list="tons" value={prefs.ton} onChange={(e) => maj({ ton: e.target.value })} />
            <datalist id="tons">{(pack?.tons ?? []).map((x) => <option key={x} value={x} />)}</datalist>
          </Champ>
          <Champ titre={t('Ce que vous aimeriez y trouver')} aide={t('Facultatif. Exemples : des duels, une rivalité amicale, de l’humour, une enquête.')}>
            <textarea rows={2} value={prefs.envies} onChange={(e) => maj({ envies: e.target.value })} />
          </Champ>
          <Champ titre={t('Ce que vous ne voulez pas')} aide={t('Facultatif. Le Narrateur s’y tiendra.')}>
            <textarea rows={2} value={prefs.refus} onChange={(e) => maj({ refus: e.target.value })} />
          </Champ>
          <Choix titre={t('Style des images')} valeur={prefs.style} options={(initial?.styles ?? []).map((s) => [s.id, s.nom])} onChange={(style) => maj({ style })}
            aide={t('Appliqué à toutes les images générées, pour un rendu cohérent. Sans effet en mode procédural.')} />
        </div>

        <div>
          <h2>3 · {t('Votre personnage')}</h2>
          <div className="grille deux">
            <Champ titre={t('Prénom')}><input type="text" maxLength={24} placeholder="Aubin" value={prenom} onChange={(e) => setPrenom(e.target.value)} /></Champ>
            <Champ titre={t('Âge (18 ans minimum)')}><input type="number" min={18} max={60} value={age} onChange={(e) => setAge(Math.max(18, Number(e.target.value) || 18))} /></Champ>
          </div>
          <p className="doux petit">{t('Choisissez deux points forts (le premier compte double) et, si vous voulez, un point faible.')}</p>
          <div className="grille trois">
            {STATS.map((s) => {
              const rang = forces.indexOf(s)
              return (
                <div key={s} className={`carte cliquable ${rang >= 0 ? 'choisie' : ''}`} onClick={() => basculerForce(s)} style={{ padding: '0.6em 0.8em' }}>
                  <b>{NOMS_STATS[s]}</b> {rang === 0 && <span className="pastille accent">+4</span>}{rang === 1 && <span className="pastille accent">+2</span>}
                  {faiblesse === s && <span className="pastille" style={{ color: 'var(--danger)' }}>−2</span>}
                  <div className="doux petit">{t(DESCRIPTIONS_STATS[s])}</div>
                </div>
              )
            })}
          </div>
          <Choix titre={t('Point faible')} valeur={faiblesse ?? ''} onChange={(v) => setFaiblesse((v || null) as StatId | null)}
            options={[['', t('Aucun')], ...STATS.filter((s) => !forces.includes(s)).map((s) => [s, NOMS_STATS[s]] as [string, string])]} />

          <h2 style={{ marginTop: '1.4em' }}>4 · {t('Contenu et rythme')}</h2>
          <Bascule titre={t('Romance')} valeur={prefs.romance} onChange={(romance) => maj({ romance })} aide={t('Des liens qui peuvent devenir amoureux, lentement. Jamais de scène explicite.')} />
          <div className="grille trois">
            <Choix titre={t('Violence')} valeur={prefs.violence} onChange={(violence) => maj({ violence })} options={[['legere', t('Légère')], ['moderee', t('Modérée')], ['sombre', t('Sombre')]]} />
            <Choix titre={t('Difficulté des jets')} valeur={prefs.difficulte} onChange={(difficulte) => maj({ difficulte })} options={[['clemente', t('Clémente')], ['normale', t('Normale')], ['rude', t('Rude')]]} />
            <Choix titre={t('Rythme du mystère')} valeur={prefs.rythmeMystere} onChange={(rythmeMystere) => maj({ rythmeMystere })} options={[['lent', t('Lent (conseillé)')], ['normal', t('Normal')], ['soutenu', t('Soutenu')]]} />
          </div>
        </div>
      </section>

      <div className="barre-bas">
        {erreur && <span style={{ color: 'var(--danger)' }}>{erreur}</span>}
        {reglages.ia.fournisseur === 'mock' && <span className="doux petit">{t('Mode démonstration : l’histoire enregistrée sera jouée quels que soient ces choix.')}</span>}
        <button className="btn plein pousse" style={{ padding: '0.75em 2.2em', fontSize: '1.05em' }} onClick={creer}>{t('Créer le monde')}</button>
      </div>
    </div>
  )
}
