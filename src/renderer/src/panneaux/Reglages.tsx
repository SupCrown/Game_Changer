/** Réglages : IA, images, affichage, son, coûts, contenu. Utilisé depuis l'écran titre et depuis le menu en jeu. */
import { useState } from 'react'
import { t } from '@shared/i18n'
import type { FournisseurImage, FournisseurTexte, Reglages as TReglages } from '@shared/types'
import type { NomCle, ResultatTest } from '@shared/ipc'
import { api, useJeu } from '../store'
import { Bascule, Champ, Choix, Curseur } from '../outils'
import { voixDisponible } from '../voix'

const FOURNISSEURS: Record<FournisseurTexte, { nom: string; aide: string }> = {
  mock: { nom: 'Démonstration', aide: 'Histoire enregistrée. Aucune clé, aucun coût, aucune connexion. Idéal pour découvrir le jeu.' },
  anthropic: { nom: 'Claude (Anthropic)', aide: 'Recommandé pour la qualité d’écriture. Demande une clé API et une connexion Internet ; payant à l’usage (voir l’onglet Coûts).' },
  ollama: { nom: 'Ollama (local)', aide: 'Gratuit et hors ligne. Demande le logiciel Ollama et un modèle installé ; une carte graphique récente est conseillée.' },
  openai: { nom: 'Service compatible OpenAI', aide: 'LM Studio, OpenRouter, Mistral… Indiquez l’adresse du service et, si besoin, sa clé.' },
}

const IMAGES: Record<FournisseurImage, { nom: string; aide: string }> = {
  procedural: { nom: 'Procédural (par défaut)', aide: 'Décors et personnages dessinés par le jeu. Gratuit, instantané, hors ligne. Rien à installer.' },
  comfyui: { nom: 'ComfyUI (local)', aide: 'Matériel : carte graphique avec 8 Go de mémoire ou plus. Demande ComfyUI lancé sur cet ordinateur et un modèle (checkpoint). Gratuit.' },
  a1111: { nom: 'Automatic1111 / Forge (local)', aide: 'Même matériel que ComfyUI. Doit être lancé avec l’option --api. Gratuit.' },
  'openai-images': { nom: 'API d’images en ligne', aide: 'Demande un compte et une clé chez le fournisseur. Payant : quelques centimes par image (une partie en génère plusieurs dizaines).' },
}

function Cle(p: { nom: NomCle; titre: string }) {
  const initial = useJeu((s) => s.initial)
  const [masque, setMasque] = useState<string | null>(initial?.cles[p.nom] ?? null)
  const [saisie, setSaisie] = useState('')
  const [message, setMessage] = useState('')
  const enregistrer = async () => {
    try {
      const m = await api().reglages.definirCle(p.nom, saisie)
      setMasque(m); setSaisie(''); setMessage('')
      if (initial) useJeu.setState({ initial: { ...initial, cles: { ...initial.cles, [p.nom]: m } } })
    } catch (e: any) { setMessage(String(e.message ?? e)) }
  }
  const retirer = async () => {
    await api().reglages.supprimerCle(p.nom)
    setMasque(null)
    if (initial) useJeu.setState({ initial: { ...initial, cles: { ...initial.cles, [p.nom]: null } } })
  }
  return (
    <Champ titre={p.titre} aide={message || t('La clé est chiffrée par le trousseau de votre système et ne quitte jamais cet ordinateur, sauf vers le service concerné.')}>
      <div className="rangee">
        {masque
          ? <><span className="pastille accent">{masque}</span><button className="btn petit danger" onClick={retirer}>{t('Retirer')}</button></>
          : <>
            <input type="password" autoComplete="off" value={saisie} placeholder={t('Collez votre clé ici')} style={{ flex: 1, width: 'auto' }} onChange={(e) => setSaisie(e.target.value)} />
            <button className="btn petit" disabled={!saisie.trim()} onClick={enregistrer}>{t('Enregistrer')}</button>
          </>}
      </div>
    </Champ>
  )
}

function Test(p: { lancer(): Promise<ResultatTest>; surModeles?(m: string[]): void }) {
  const [etat, setEtat] = useState<ResultatTest | 'en-cours' | null>(null)
  const tester = async () => {
    setEtat('en-cours')
    try {
      const r = await p.lancer()
      setEtat(r)
      if (r.modeles) p.surModeles?.(r.modeles)
    } catch (e: any) { setEtat({ ok: false, message: String(e.message ?? e) }) }
  }
  return (
    <div className="rangee" style={{ margin: '0.6em 0' }}>
      <button className="btn" onClick={tester} disabled={etat === 'en-cours'}>{etat === 'en-cours' ? t('Test en cours…') : t('Tester la connexion')}</button>
      {etat && etat !== 'en-cours' && <span style={{ color: etat.ok ? 'var(--succes)' : 'var(--danger)' }}>{etat.ok ? '✓' : '✕'} {etat.message}</span>}
    </div>
  )
}

type Onglet = 'ia' | 'images' | 'affichage' | 'son' | 'couts' | 'contenu' | 'avance'

export function Reglages() {
  const { reglages, majReglages, initial, etat } = useJeu()
  const [onglet, setOnglet] = useState<Onglet>('ia')
  const [modeles, setModeles] = useState<string[]>([])
  const r = reglages
  const ia = (p: Partial<TReglages['ia']>) => majReglages({ ...r, ia: { ...r.ia, ...p } })
  const img = (p: Partial<TReglages['images']>) => majReglages({ ...r, images: { ...r.images, ...p } })
  const aff = (p: Partial<TReglages['affichage']>) => majReglages({ ...r, affichage: { ...r.affichage, ...p } })
  const son = (p: Partial<TReglages['son']>) => majReglages({ ...r, son: { ...r.son, ...p } })
  const couts = (p: Partial<TReglages['couts']>) => majReglages({ ...r, couts: { ...r.couts, ...p } })
  const f = r.ia.fournisseur
  const modele = (taille: 'grand' | 'leger', v: string) => ia({ modeles: { ...r.ia.modeles, [f]: { ...r.ia.modeles[f], [taille]: v } } })
  const prereglage = (grand: string, leger: string) => ia({ modeles: { ...r.ia.modeles, anthropic: { grand, leger } } })
  const prefs = async (p: Parameters<ReturnType<typeof api>['jeu']['preferences']>[0]) => useJeu.setState({ etat: await api().jeu.preferences(p) })

  const onglets: [Onglet, string][] = [['ia', 'IA de texte'], ['images', 'Images'], ['affichage', 'Affichage'], ['son', 'Son et voix'], ['couts', 'Coûts'], ...(etat ? [['contenu', 'Contenu et ton'] as [Onglet, string]] : []), ['avance', 'Avancé']]

  return (
    <>
      <h2>{t('Réglages')}</h2>
      <div className="rangee" style={{ marginBottom: '1.2em' }}>
        {onglets.map(([id, nom]) => <button key={id} className={`btn petit ${onglet === id ? 'plein' : ''}`} onClick={() => setOnglet(id)}>{t(nom)}</button>)}
      </div>

      {onglet === 'ia' && (
        <div className="grille deux" style={{ gap: '2em' }}>
          <div>
            <Choix titre={t('Qui raconte l’histoire ?')} valeur={f} onChange={(v) => { setModeles([]); ia({ fournisseur: v }) }}
              options={(Object.keys(FOURNISSEURS) as FournisseurTexte[]).map((k) => [k, t(FOURNISSEURS[k].nom)])} aide={t(FOURNISSEURS[f].aide)} />
            {f === 'anthropic' && <>
              <Cle nom="anthropic" titre={t('Clé API Anthropic')} />
              {!initial?.chiffrementDisponible && <div className="avis attention">{t('Le trousseau sécurisé de ce système est indisponible : la clé ne pourra pas être enregistrée.')}</div>}
              <Champ titre={t('Préréglage')} aide={t('Qualité : la plus belle écriture. Équilibré : très bon, deux fois moins cher. Économique : correct, presque gratuit.')}>
                <div className="rangee">
                  <button className="btn petit" onClick={() => prereglage('claude-opus-5-5', 'claude-haiku-5-5')}>{t('Qualité')}</button>
                  <button className="btn petit" onClick={() => prereglage('claude-sonnet-5-5', 'claude-haiku-5-5')}>{t('Équilibré')}</button>
                  <button className="btn petit" onClick={() => prereglage('claude-haiku-5-5', 'claude-haiku-5-5')}>{t('Économique')}</button>
                </div>
              </Champ>
            </>}
            {f === 'ollama' && <>
              <Champ titre={t('Adresse d’Ollama')}><input type="text" value={r.ia.ollamaUrl} onChange={(e) => ia({ ollamaUrl: e.target.value })} /></Champ>
              <Curseur titre={t('Taille du contexte')} affiche={`${r.ia.ollamaContexte} ${t('jetons')}`} min={4096} max={65536} pas={2048} valeur={r.ia.ollamaContexte} onChange={(v) => ia({ ollamaContexte: v })} />
              <div className="aide">{t('Plus grand = meilleure mémoire, mais plus de mémoire vive et plus lent. 8192 convient à la plupart des machines.')}</div>
            </>}
            {f === 'openai' && <>
              <Champ titre={t('Adresse du service (se termine souvent par /v1)')}><input type="text" value={r.ia.openaiUrl} onChange={(e) => ia({ openaiUrl: e.target.value })} /></Champ>
              <Cle nom="openai" titre={t('Clé API (laisser vide pour un service local)')} />
              <Choix titre={t('Capacité du modèle')} valeur={r.ia.openaiGabarit} onChange={(v) => ia({ openaiGabarit: v })}
                options={[['petit', t('Modeste : consignes courtes')], ['grand', t('Grand : consignes complètes')]]} />
            </>}
            {f !== 'mock' && <>
              <Champ titre={t('Grand modèle — narration et mise en scène')}>
                <input type="text" list="modeles" value={r.ia.modeles[f].grand} onChange={(e) => modele('grand', e.target.value)} />
              </Champ>
              <Champ titre={t('Modèle léger — rapports, résumés, vérifications')} aide={t('Vide = le même que le grand modèle.')}>
                <input type="text" list="modeles" value={r.ia.modeles[f].leger} onChange={(e) => modele('leger', e.target.value)} />
              </Champ>
              <datalist id="modeles">{modeles.map((m) => <option key={m} value={m} />)}</datalist>
            </>}
            <Test lancer={() => api().reglages.testerTexte('grand')} surModeles={setModeles} />
          </div>
          <div>
            <h3>{t('Qualité et coût')}</h3>
            <Choix titre={t('Mémoire envoyée à chaque tour')} valeur={r.ia.fenetre} onChange={(v) => ia({ fenetre: v })}
              options={[['econome', t('Économe : les dernières scènes')], ['equilibre', t('Équilibrée : plusieurs journées')], ['riche', t('Riche : presque toute la partie')]]}
              aide={t('Les scènes plus anciennes restent connues par leurs résumés et par la recherche de souvenirs. Avec Claude, cette mémoire est mise en cache : elle coûte peu.')} />
            <Choix titre={t('Longueur des scènes')} valeur={r.ia.longueurScene} onChange={(v) => ia({ longueurScene: v })}
              options={[['courte', t('Courte')], ['moyenne', t('Moyenne')], ['longue', t('Longue')]]} />
            <Choix titre={t('Réflexion du modèle')} valeur={r.ia.effort} onChange={(v) => ia({ effort: v })}
              options={[['low', t('Légère (rapide, économique)')], ['medium', t('Moyenne')], ['high', t('Poussée (plus lent, plus cher)')]]} />
            <Choix titre={t('Gardien de la cohérence')} valeur={r.ia.gardien} onChange={(v) => ia({ gardien: v })}
              options={[['off', t('Désactivé')], ['leger', t('Discret : corrige dans la scène suivante')], ['strict', t('Strict : vous prévient aussi')]]} />
            <Choix titre={t('Modèle léger chez un autre fournisseur')} valeur={r.ia.fournisseurLeger} onChange={(v) => ia({ fournisseurLeger: v })}
              options={[['', t('Non, le même fournisseur')], ...(Object.keys(FOURNISSEURS) as FournisseurTexte[]).filter((k) => k !== f && k !== 'mock').map((k) => [k, t(FOURNISSEURS[k].nom)] as [FournisseurTexte, string])]}
              aide={t('Exemple : narration par Claude, comptabilité par un modèle local gratuit.')} />
            <Choix titre={t('Recherche de souvenirs')} valeur={r.ia.vectoriseur} onChange={(v) => ia({ vectoriseur: v })}
              options={[['integre', t('Intégrée (gratuite, hors ligne)')], ['ollama', t('Modèle de vecteurs Ollama')]]} />
            {r.ia.vectoriseur === 'ollama' && <Champ titre={t('Modèle de vecteurs')}><input type="text" value={r.ia.modeleVecteurs} onChange={(e) => ia({ modeleVecteurs: e.target.value })} /></Champ>}
          </div>
        </div>
      )}

      {onglet === 'images' && (
        <div style={{ maxWidth: 640 }}>
          <Choix titre={t('Comment créer les images ?')} valeur={r.images.fournisseur} onChange={(v) => img({ fournisseur: v })}
            options={(Object.keys(IMAGES) as FournisseurImage[]).map((k) => [k, t(IMAGES[k].nom)])} aide={t(IMAGES[r.images.fournisseur].aide)} />
          {r.images.fournisseur === 'comfyui' && <>
            <Champ titre={t('Adresse de ComfyUI')}><input type="text" value={r.images.comfyUrl} onChange={(e) => img({ comfyUrl: e.target.value })} /></Champ>
            <Champ titre={t('Modèle (checkpoint)')} aide={t('Vide = le premier modèle installé.')}><input type="text" list="modeles-img" value={r.images.comfyModele} onChange={(e) => img({ comfyModele: e.target.value })} /></Champ>
          </>}
          {r.images.fournisseur === 'a1111' && <Champ titre={t('Adresse d’Automatic1111')}><input type="text" value={r.images.a1111Url} onChange={(e) => img({ a1111Url: e.target.value })} /></Champ>}
          {r.images.fournisseur === 'openai-images' && <>
            <Champ titre={t('Adresse du service')}><input type="text" value={r.images.openaiImagesUrl} onChange={(e) => img({ openaiImagesUrl: e.target.value })} /></Champ>
            <Champ titre={t('Modèle')}><input type="text" value={r.images.openaiImagesModele} onChange={(e) => img({ openaiImagesModele: e.target.value })} /></Champ>
            <Cle nom="openai-images" titre={t('Clé API du service d’images')} />
            <Champ titre={t('Coût estimé par image (USD)')} aide={t('Sert au tableau des coûts. Vérifiez le tarif réel chez votre fournisseur.')}>
              <input type="number" step={0.01} min={0} value={r.images.coutEstime} onChange={(e) => img({ coutEstime: Math.max(0, Number(e.target.value) || 0) })} />
            </Champ>
          </>}
          <datalist id="modeles-img">{modeles.map((m) => <option key={m} value={m} />)}</datalist>
          <Test lancer={() => api().reglages.testerImages()} surModeles={setModeles} />
          <Bascule titre={t('Préparer à l’avance les décors probables')} valeur={r.images.prechargement} onChange={(v) => img({ prechargement: v })} />
          <Bascule titre={t('Illustrations des moments forts')} valeur={r.images.illustrations} onChange={(v) => img({ illustrations: v })} />
          <div className="avis">{t('Tant qu’une image n’est pas prête, ou si sa génération échoue, le jeu affiche sa version procédurale : vous n’attendez jamais.')}</div>
        </div>
      )}

      {onglet === 'affichage' && (
        <div style={{ maxWidth: 560 }}>
          <Curseur titre={t('Vitesse du texte')} affiche={r.affichage.vitesseTexte >= 200 ? t('instantané') : `${r.affichage.vitesseTexte} ${t('caractères/s')}`} min={15} max={200} pas={5} valeur={r.affichage.vitesseTexte} onChange={(v) => aff({ vitesseTexte: v })} />
          <Bascule titre={t('Avance automatique')} valeur={r.affichage.auto} onChange={(v) => aff({ auto: v })} />
          <Curseur titre={t('Pause entre deux lignes en mode automatique')} affiche={`${(r.affichage.delaiAuto / 1000).toFixed(1)} s`} min={500} max={5000} pas={100} valeur={r.affichage.delaiAuto} onChange={(v) => aff({ delaiAuto: v })} />
          <Curseur titre={t('Taille du texte')} affiche={`${r.affichage.taillePolice} %`} min={80} max={150} pas={5} valeur={r.affichage.taillePolice} onChange={(v) => aff({ taillePolice: v })} />
          <Bascule titre={t('Police adaptée à la dyslexie')} valeur={r.affichage.policeDyslexie} onChange={(v) => aff({ policeDyslexie: v })} />
          <Bascule titre={t('Contrastes renforcés')} valeur={r.affichage.contraste} onChange={(v) => aff({ contraste: v })} />
          <Bascule titre={t('Effets visuels (mouvements, tremblements, météo)')} valeur={r.affichage.effets} onChange={(v) => aff({ effets: v })} />
          <Bascule titre={t('Proposer des pistes d’action')} valeur={r.affichage.pistes} onChange={(v) => aff({ pistes: v })} />
          <Bascule titre={t('Plein écran')} valeur={r.affichage.pleinEcran} onChange={(v) => { aff({ pleinEcran: v }); void api().app.pleinEcran(v) }} />
          <p className="doux petit">{t('Clavier : Espace ou Entrée pour avancer · Ctrl pour tout afficher · A automatique · H historique · 1-2-3 pistes · Échap menu · F5 sauvegarde rapide · F11 plein écran.')}</p>
        </div>
      )}

      {onglet === 'son' && (
        <div style={{ maxWidth: 560 }}>
          <Bascule titre={t('Musique d’ambiance')} valeur={r.son.musique} onChange={(v) => son({ musique: v })} aide={t('Composée par le jeu selon l’humeur de la scène. Aucun fichier, aucun téléchargement.')} />
          <Curseur titre={t('Volume de la musique')} min={0} max={1} pas={0.05} valeur={r.son.volumeMusique} onChange={(v) => son({ volumeMusique: v })} affiche={`${Math.round(r.son.volumeMusique * 100)} %`} />
          <Bascule titre={t('Effets sonores')} valeur={r.son.effets} onChange={(v) => son({ effets: v })} />
          <Curseur titre={t('Volume des effets')} min={0} max={1} pas={0.05} valeur={r.son.volumeEffets} onChange={(v) => son({ volumeEffets: v })} affiche={`${Math.round(r.son.volumeEffets * 100)} %`} />
          <Bascule titre={t('Lecture à voix haute')} valeur={r.son.voix} onChange={(v) => son({ voix: v })}
            aide={voixDisponible() ? t('Utilise les voix installées sur votre système : gratuit et hors ligne. Chaque personnage garde la sienne.') : t('Aucune voix française n’est installée sur ce système.')} />
          <Curseur titre={t('Volume des voix')} min={0} max={1} pas={0.05} valeur={r.son.volumeVoix} onChange={(v) => son({ volumeVoix: v })} affiche={`${Math.round(r.son.volumeVoix * 100)} %`} />
        </div>
      )}

      {onglet === 'couts' && (
        <div style={{ maxWidth: 560 }}>
          <Champ titre={t('Plafond par session de jeu (USD, 0 = aucun)')}><input type="number" min={0} step={0.5} value={r.couts.plafondSession} onChange={(e) => couts({ plafondSession: Math.max(0, Number(e.target.value) || 0) })} /></Champ>
          <Champ titre={t('Plafond par partie (USD, 0 = aucun)')}><input type="number" min={0} step={1} value={r.couts.plafondPartie} onChange={(e) => couts({ plafondPartie: Math.max(0, Number(e.target.value) || 0) })} /></Champ>
          <Bascule titre={t('M’alerter à 80 % d’un plafond')} valeur={r.couts.alerte} onChange={(v) => couts({ alerte: v })} />
          <div className="avis">{t('Quand un plafond est atteint, le jeu s’arrête proprement avant le prochain appel payant ; rien n’est perdu. Les montants sont des estimations calculées à partir des tarifs publics.')}</div>
        </div>
      )}

      {onglet === 'contenu' && etat && (
        <div style={{ maxWidth: 560 }}>
          <Bascule titre={t('Romance')} valeur={etat.preferences.romance} onChange={(romance) => prefs({ romance })} aide={t('Jamais de scène explicite, quel que soit ce réglage.')} />
          <Choix titre={t('Violence')} valeur={etat.preferences.violence} onChange={(violence) => prefs({ violence })} options={[['legere', t('Légère')], ['moderee', t('Modérée')], ['sombre', t('Sombre')]]} />
          <Choix titre={t('Difficulté des jets')} valeur={etat.preferences.difficulte} onChange={(difficulte) => prefs({ difficulte })} options={[['clemente', t('Clémente')], ['normale', t('Normale')], ['rude', t('Rude')]]} />
          <Choix titre={t('Rythme du mystère')} valeur={etat.preferences.rythmeMystere} onChange={(rythmeMystere) => prefs({ rythmeMystere })}
            options={[['lent', t('Lent')], ['normal', t('Normal')], ['soutenu', t('Soutenu')]]} aide={t('Combien de vraies révélations par chapitre, et combien de scènes de quotidien entre deux.')} />
        </div>
      )}

      {onglet === 'avance' && (
        <div style={{ maxWidth: 560 }}>
          <Bascule titre={t('Panneau de développement')} valeur={r.dev} onChange={(dev) => majReglages({ ...r, dev })} aide={t('Ajoute un onglet « Coulisses » au menu : consignes envoyées aux IA, réponses brutes, état du jeu. Attention : il révèle la vérité cachée.')} />
          <Choix titre={t('Durée du cache des consignes (Claude)')} valeur={r.ia.cacheTtl} onChange={(v) => ia({ cacheTtl: v })}
            options={[['auto', t('Automatique (conseillé)')], ['5m', t('5 minutes')], ['1h', t('1 heure')]]} aide={t('Automatique : passe à 1 heure si vous prenez en général plus de 4 minutes entre deux tours.')} />
          <button className="btn" onClick={() => api().app.ouvrirDossierDonnees()}>{t('Ouvrir le dossier des sauvegardes')}</button>
        </div>
      )}
    </>
  )
}
