# Tirelire+

Application mobile (noir & vert) de suivi de budget personnel, pensée pour un revenu irrégulier (revente d'occasion + études).
Elle sépare les **ventes** (avec leur marge) des autres revenus et affiche l'**argent réellement disponible par jour**
plutôt qu'un simple solde brut.

- **Zéro IA, zéro API externe** : que des calculs classiques (dates, sommes, pourcentages)
- **100 % gratuit, 100 % local** : SQLite sur le téléphone (`expo-sqlite`). Pas de serveur, pas de compte, pas de connexion bancaire
- **Stack** : React Native + Expo SDK 57 (managed workflow) + Expo Router, compatible **Expo Go**
- **Utilisable comme une vraie appli sans store** : version web installable (PWA) hébergée gratuitement sur **Render**,
  ajoutée à l'écran d'accueil du téléphone, fonctionne hors connexion

## Fonctionnalités

| Écran | Contenu |
|---|---|
| **Accueil** | « Dispo aujourd'hui » = (solde du mois − dépenses fixes à venir) / jours restants (aujourd'hui compris) · boutons rapides Dépense / Revenu / Vente · alertes d'enveloppes · jauges par catégorie · objectif d'épargne |
| **Historique** | Liste chronologique groupée par jour, filtres par type (dépense / revenu / vente) et par catégorie. Touche une ligne pour la modifier ou la supprimer. Bouton « Importer un relevé » en haut |
| **Ventes** | Total encaissé, marge totale, marge moyenne par vente, taux de marge (ce mois / mois dernier / tout) |
| **Stats** | Navigation mois par mois : revenus (dont ventes), dépenses, solde net, comparaison en % avec le mois précédent (▲ mieux / ▼ moins bien), barres par catégorie, solde net sur 6 mois |
| **Réglages** | Catégories (dépenses et revenus) et budgets mensuels, dépenses fixes, objectif d'épargne, simulateur, import de relevé, règles de catégorisation, export CSV |
| **Simulateur d'épargne** | De 0 à 3 000 €/mois, de 1 à 40 ans, taux de 0 à 10 % : courbe de l'épargne totale vs argent versé (glisser le doigt pour lire chaque mois), étapes 1/2/5/10… ans, délai pour atteindre l'objectif |
| **Import de relevé** | Fichier CSV ou OFX exporté depuis la banque → aperçu, catégorisation automatique, import sans doublons |

**Saisie rapide (2 taps)** : le bouton flottant **+** (présent sur Accueil, Historique, Ventes) ouvre la saisie avec le clavier
déjà ouvert → tape le montant → **touche une catégorie = enregistré** (date du jour par défaut).
« + Date, note, dépense fixe… » ouvre les options (date, note, rendre la dépense mensuelle).

### Import de relevé bancaire (au lieu de tout saisir)

Pas de connexion bancaire (payant, serveur obligatoire, données sensibles) : on importe le **fichier exporté par la banque**,
lu uniquement sur le téléphone. Seules les **espèces** restent à saisir avec **+**.

1. Dans l'app / le site de la banque : « Exporter / Télécharger mes opérations » → **CSV** (ou Excel-CSV) ou **OFX**
2. Tirelire+ → Historique → **⤓ Importer un relevé** → choisir le fichier
3. Vérifier l'aperçu, corriger les catégories si besoin → **Importer**

- **Formats reconnus** : CSV avec `;` `,` ou tabulation, avec ou sans ligne d'en-tête, colonne « Montant » signée ou
  colonnes « Débit » / « Crédit » séparées, dates `JJ/MM/AAAA`, `JJ/MM/AA` ou `AAAA-MM-JJ`, UTF-8 ou Latin-1 (accents
  des exports Windows). OFX/QFX (utilise l'identifiant unique de chaque opération). Lignes d'en-tête/de solde ignorées
- **Pas de doublons** : chaque ligne a une empreinte ; réimporter un relevé qui chevauche le précédent n'ajoute que les nouvelles
  opérations. Une opération déjà saisie à la main (même montant, ± 4 jours) est reliée au lieu d'être ajoutée
- **Catégorisation automatique sans IA** : des mots-clés (Carrefour, Lidl → Nourriture ; SNCF, Uber → Transport ;
  Netflix, Free → Abonnements ; Vinted, Leboncoin → **Vente** ; CAF, Crous → Bourse / aides ; virements vers Livret A → ignorés…).
  Quand tu changes la catégorie d'une ligne, le mot-clé est **retenu** pour les prochains imports. Règles modifiables dans
  Réglages → Règles de catégorisation
- **Dépenses fixes** : un prélèvement importé du même montant (± 5 jours autour du jour prévu) compte comme la dépense fixe
  du mois, elle n'est donc ni générée en double ni encore déduite du « dispo »
- Les virements Vinted/Leboncoin importés arrivent comme **ventes** sans prix d'achat : touche-les dans l'Historique pour
  ajouter le prix d'achat et obtenir la marge

### Règles de calcul

- **Solde du mois** = revenus + ventes − dépenses du mois. Une **vente compte pour sa marge** (prix de vente − prix d'achat).
  Sans prix d'achat, c'est le prix de vente entier qui compte. → **Ne saisis pas l'achat d'un article à revendre comme dépense** (sinon il serait compté deux fois)
- **Dépenses fixes** : tant que leur jour du mois n'est pas arrivé, elles sont déduites d'avance du « dispo aujourd'hui ».
  Le jour venu, la dépense est ajoutée automatiquement à l'historique (au prochain lancement de l'app). Jour 31 = dernier jour du mois.
  Supprimer une occurrence générée ne la recrée pas
- **Enveloppes** : vert < 70 %, orange 70–100 %, rouge au-delà. Une alerte s'affiche quand un ajout fait franchir un seuil, et un bandeau reste sur l'accueil
- **Épargne** : chaque mois terminé (depuis la création de l'objectif) avec un solde net positif est versé une fois dans l'objectif
  (désactivable dans Réglages). Ajustement manuel possible (ajout / retrait) depuis l'accueil
- **Export CSV** : séparateur `;`, décimales à virgule, UTF-8 avec BOM → s'ouvre directement dans Excel / Google Sheets.
  Contient toutes les opérations + les mouvements d'épargne

## Mettre l'appli en ligne sur Render (l'utiliser comme une appli)

Render héberge gratuitement la version web ; on l'ajoute ensuite à l'écran d'accueil : icône, plein écran, hors connexion.
Aucun store, aucun compte développeur payant.

1. Pousse ce dépôt sur GitHub (c'est déjà le cas) et fusionne la branche dans `main` (ou choisis la branche dans Render)
2. Sur [render.com](https://render.com) : crée un compte gratuit → **New → Blueprint** → connecte GitHub → choisis ce dépôt.
   Render lit `render.yaml` et crée le site statique **tirelire-plus** tout seul (build : `npm ci && npm run build:web`)
3. Attends la fin du build (quelques minutes) → Render donne une adresse du type `https://tirelire-plus-xxxx.onrender.com`
4. Sur le téléphone, ouvre cette adresse puis :
   - **iPhone (Safari)** : bouton **Partager** → **Sur l'écran d'accueil**
   - **Android (Chrome)** : menu **⋮** → **Installer l'application** (ou « Ajouter à l'écran d'accueil »)
5. Lance **Tirelire+** depuis l'icône : elle s'ouvre en plein écran, comme une appli

Chaque `git push` sur la branche suivie redéploie automatiquement ; l'appli installée prend la nouvelle version à la
réouverture suivante.

⚠️ **Où sont les données ?** Dans le stockage de l'appli sur le téléphone (rien sur Render : le site ne contient que le code).
- Les données de l'appli installée sont séparées de celles de Safari/Chrome : utilise toujours l'icône
- Effacer les données du navigateur ou désinstaller l'icône efface tout → fais **Réglages → Exporter en CSV** régulièrement
- `render.yaml` ajoute les en-têtes `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`, obligatoires pour la base
  SQLite dans le navigateur. Si tu crées le site à la main (sans Blueprint), ajoute-les dans *Settings → Headers*
  (`/*`) et une règle *Rewrite* `/*` → `/index.html`

Tester la version web en local : `npm run build:web` puis servir `dist/` avec ces mêmes en-têtes (ou `npx expo start --web`
pour le mode développement, les en-têtes sont déjà configurés dans `metro.config.js`).

## Lancer l'app en développement (Codespace + Expo Go)

Prérequis : l'app **Expo Go** à jour sur le téléphone (elle doit supporter le SDK 57).

```bash
npm install
npx expo start --tunnel
```

- La première fois, Expo propose d'installer `@expo/ngrok` pour le tunnel → réponds **Y**
- Scanne le QR code affiché dans le terminal avec l'appareil photo (iPhone) ou depuis Expo Go (Android)
- Le tunnel évite d'avoir à exposer un port : pas besoin de rendre le port 8081 public dans l'onglet *Ports* du Codespace
  (si le tunnel est lent ou échoue, relance `npx expo start --tunnel --clear`)

Au premier lancement, la base est créée avec des catégories par défaut (Nourriture 200 €, Sorties 80 €, Transport 50 €,
Fournitures 30 €, Logement, Abonnements, Divers + 4 catégories de revenus). Tout est modifiable dans Réglages.

### Commandes utiles

```bash
npm test            # tests des calculs et de la base SQLite (node:test + node:sqlite, sans téléphone)
npm run typecheck   # vérification TypeScript
npm run lint        # ESLint (config Expo)
npm run build:web   # version web installable dans dist/ (ce que fait Render)
npm run icons       # régénère toutes les icônes depuis le logo (scripts/make-icons.js, nécessite Playwright)
```

## Design & nom

- Thème noir (`#000` / cartes `#121212`) avec le vert `#22C55E` en accent : tout est dans `src/theme.ts`
- Nom : `APP_NAME` dans `src/theme.ts` + `name` dans `app.json` (le nom sous l'icône vient de `app.json`)
- Logo : courbe montante verte sur fond noir, dessinée en SVG dans `scripts/make-icons.js`

## Structure

```
src/
  app/                 # écrans (Expo Router)
    (tabs)/            # Accueil, Historique, Ventes, Stats, Réglages
    add.tsx            # saisie / modification d'une opération (modale)
    category/[id].tsx  # catégorie + budget
    recurring/[id].tsx # dépense fixe
    goal.tsx           # objectif d'épargne + mouvements
  components/          # UI réutilisable (jauges, chips, bouton +, …)
  db/                  # schéma SQLite, migrations, requêtes (repo.ts)
  lib/                 # calculs purs : dates, montants, dispo/jour, marges, CSV, simulateur
    bankImport.ts      # lecture des relevés CSV/OFX, nettoyage des libellés, règles, anti-doublons
tests/                 # tests Node exécutés sur une vraie base SQLite en mémoire
```

## Limites connues / pistes

- **Widget écran d'accueil** : impossible avec Expo Go (nécessite du code natif + un development build). Remplacé par le bouton flottant **+**
- **Notifications système** pour les enveloppes : non implémentées (alertes visuelles dans l'app uniquement), pour rester sans permission ni module natif en plus
- **Restauration** : l'export CSV de Tirelire+ n'est pas encore réimportable tel quel sur un nouveau téléphone
- **Import de relevé** : testé sur des formats CSV/OFX typiques, pas encore sur l'export réel de chaque banque ; si un fichier
  n'est pas reconnu, le message d'erreur l'indique (envoie un exemple anonymisé pour ajouter le format)
- Une ligne décochée à l'import est mémorisée comme ignorée et ne sera plus proposée
- Simulateur : intérêts mensuels (taux ÷ 12), sans impôts, inflation ni règles propres au Livret A (quinzaines) → ordre de grandeur
- Un seul objectif d'épargne à la fois
- Le versement automatique d'un mois est figé une fois fait : si tu modifies ensuite une opération de ce mois, ajuste l'épargne à la main
