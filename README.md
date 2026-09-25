# Tirelire 🐷

Application mobile de suivi de budget personnel, pensée pour un revenu irrégulier (revente d'occasion + études).
Elle sépare les **ventes** (avec leur marge) des autres revenus et affiche l'**argent réellement disponible par jour**
plutôt qu'un simple solde brut.

- **Zéro IA, zéro API externe** : que des calculs classiques (dates, sommes, pourcentages)
- **100 % gratuit, 100 % local** : SQLite sur le téléphone (`expo-sqlite`). Pas de serveur, pas de compte, pas de connexion bancaire
- **Stack** : React Native + Expo SDK 57 (managed workflow) + Expo Router, compatible **Expo Go**

## Fonctionnalités

| Écran | Contenu |
|---|---|
| **Accueil** | « Dispo aujourd'hui » = (solde du mois − dépenses fixes à venir) / jours restants (aujourd'hui compris) · boutons rapides Dépense / Revenu / Vente · alertes d'enveloppes · jauges par catégorie · objectif d'épargne |
| **Historique** | Liste chronologique groupée par jour, filtres par type (dépense / revenu / vente) et par catégorie. Touche une ligne pour la modifier ou la supprimer |
| **Ventes** | Total encaissé, marge totale, marge moyenne par vente, taux de marge (ce mois / mois dernier / tout) |
| **Stats** | Navigation mois par mois : revenus (dont ventes), dépenses, solde net, comparaison en % avec le mois précédent (▲ mieux / ▼ moins bien), barres par catégorie, solde net sur 6 mois |
| **Réglages** | Catégories (dépenses et revenus) et budgets mensuels, dépenses fixes, objectif d'épargne, export CSV |

**Saisie rapide (2 taps)** : le bouton flottant **+** (présent sur Accueil, Historique, Ventes) ouvre la saisie avec le clavier
déjà ouvert → tape le montant → **touche une catégorie = enregistré** (date du jour par défaut).
« + Date, note, dépense fixe… » ouvre les options (date, note, rendre la dépense mensuelle).

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

## Lancer l'app (Codespace + Expo Go)

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
```

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
  lib/                 # calculs purs : dates, montants, dispo/jour, marges, CSV
tests/                 # tests Node exécutés sur une vraie base SQLite en mémoire
```

## Limites connues / pistes

- **Widget écran d'accueil** : impossible avec Expo Go (nécessite du code natif + un development build). Remplacé par le bouton flottant **+**
- **Notifications système** pour les enveloppes : non implémentées (alertes visuelles dans l'app uniquement), pour rester sans permission ni module natif en plus
- **Import CSV** : l'export existe, la réimportation sur un nouveau téléphone n'est pas encore faite
- Un seul objectif d'épargne à la fois
- Le versement automatique d'un mois est figé une fois fait : si tu modifies ensuite une opération de ce mois, ajuste l'épargne à la main
