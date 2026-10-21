# EXO 1 — Population de véhicules, rebouclage et réapparition

**Projet :** `SteeringBehavioursM2IA2_2026_2027` — dossier `1-Seek`.
**Date :** 12 octobre 2026.
**Statut :** spécification approuvée et implémentée le 12 octobre 2026. Voir [README.md](README.md) pour l’utilisation et les tests.

## 1. Objectif

Étendre la démonstration actuelle pour afficher de **1 à 200 véhicules**, tous pilotés par le comportement `seek()` existant et poursuivant la même cible contrôlée par la souris.

Trois fonctionnalités sont demandées :

1. Un slider modifie le nombre de véhicules pendant son déplacement, sans attendre son relâchement.
2. Un véhicule qui sort par un bord réapparaît du côté opposé grâce à `Vehicle.edges()`.
3. Un véhicule qui atteint la cible réapparaît à une position aléatoire.

La règle de réapparition est une règle de gestion de la scène. Le steering reste celui fourni : calcul d’une force, `applyForce()`, puis locomotion dans `update()`. Aucun déplacement direct ne sera ajouté à `seek()`.

## 2. Choix proposés

| Paramètre | Proposition |
|---|---|
| Population initiale | **20 véhicules**, afin de rendre la démonstration collective visible dès l’ouverture |
| Nombre minimal / maximal | **1 / 200**, bornes incluses |
| Pas du slider | **1**, uniquement des entiers |
| Indication du nombre | `Véhicules : N / 200`, synchronisée avec la population réelle |
| Vitesse et force | Valeurs existantes et identiques pour tous : `maxSpeed = 4`, `maxForce = 0.1` |
| Apparence des véhicules | Triangle bleu, contour blanc, flèche de vitesse rouge, comme actuellement |
| Cible | Disque rouge de **32 px de diamètre**, commun à tous les véhicules |
| Critère d’arrivée | Distance entre le centre du véhicule et le centre de la cible **≤ 16 px** |
| Réapparition sur la cible | Nouvelle position dans le canvas, vitesse et accélération nulles |
| Réapparition au bord | Comportement exact de `edges()`, sans modifier vitesse ni accélération |

Les valeurs initiales et le seuil d’arrivée sont des choix proposés ici ; ils n’étaient pas précisés dans la demande.

## 3. Slider et gestion de la population

### Interaction immédiate

Utiliser un slider HTML natif ou celui créé par p5, avec une gestion de l’événement **`input`**. L’événement `change` seul ne satisfait pas la demande, puisqu’il peut n’arriver qu’à la validation ou au relâchement.

À chaque événement `input` :

1. Lire et valider un entier entre 1 et 200.
2. Ajuster immédiatement le tableau de véhicules à cette taille.
3. Mettre à jour le texte avec le nombre réellement présent.
4. Dessiner cette population dès la prochaine image p5, sans attendre la fin du geste.

« Immédiat » signifie ici que le traitement démarre sur `input`, puis que le résultat visuel apparaît au prochain rendu disponible. Le navigateur peut regrouper des événements ou ralentir un onglet en arrière-plan ; aucun délai artificiel, debounce ou attente du relâchement ne sera ajouté.

### Conservation de l’état

- **Augmentation :** conserver tous les véhicules existants et ajouter seulement ceux qui manquent, à des positions aléatoires valides et avec une vitesse nulle.
- **Diminution :** supprimer les derniers éléments du tableau. Conserver les positions, vitesses et identités des véhicules restants.
- **Valeur inchangée :** ne rien recréer.
- Un véhicule supprimé puis réajouté sera une nouvelle instance. Il n’est pas nécessaire de mettre en cache les instances supprimées.
- Aucune collision ni séparation entre véhicules n’est demandée : ils peuvent se croiser ou se superposer.

Le même réglage doit fonctionner à la souris, au tactile et au clavier. Le slider aura un libellé associé ; le texte restera visible pendant le geste. Éviter une annonce vocale forcée pour chaque incrément pendant un glissement rapide.

## 4. Cible et interface

Prévoir une petite barre de contrôle au-dessus du canvas, avec le libellé, le slider et le compteur. Le canvas occupe l’espace disponible en dessous : la barre ne doit pas cacher les véhicules ni intercepter la souris au milieu de la scène.

La cible suit la souris **uniquement lorsqu’elle est à l’intérieur du canvas**. Pendant une manipulation du slider ou lorsque le pointeur quitte le canvas, elle conserve sa dernière position valide. Au démarrage, avant toute position valide de souris, elle est placée au centre du canvas.

Pour respecter la règle locale selon laquelle toute entité visible dérive de `Vehicle`, représenter cette cible par une classe dédiée **`MouseTarget extends Vehicle`**, dans `mouseTarget.js` :

- rendu du disque rouge ;
- rayon visuel et seuil d’arrivée de 16 px ;
- position fournie par le contrôleur à partir de l’entrée souris ;
- aucun mouvement autonome, timer ou aléatoire.

Le déplacement imposé de la cible représente une entrée utilisateur, pas un comportement de steering. Les véhicules reçoivent sa position vectorielle, par exemple via `target.pos`.

**Ne pas instancier la classe `Target` actuelle :** son constructeur démarre un timer et son déplacement aléatoire ne correspond pas à la cible souris de cet exercice. Son fichier peut rester présent ; son chargement dans la page sera remplacé par celui de `mouseTarget.js`.

## 5. Réapparition au bord

Appeler **`vehicle.edges()` après `vehicle.update()` et avant le dessin** de chaque véhicule qui n’a pas été réinitialisé avant son déplacement.

Respecter exactement la méthode fournie :

| Condition après déplacement | Nouvelle coordonnée |
|---|---|
| `pos.x > width + r` | `pos.x = -r` |
| `pos.x < -r` | `pos.x = width + r` |
| `pos.y > height + r` | `pos.y = -r` |
| `pos.y < -r` | `pos.y = height + r` |

Les comparaisons sont strictes : être exactement à `width + r` ou `-r` ne déclenche pas encore le rebouclage. Le véhicule franchit une marge égale à `r` avant d’être replacé de l’autre côté ; on ne remplace pas cette règle par un test sur son centre à `0` ou `width`.

- Préserver la composante de position de l’autre axe.
- Préserver la vitesse, afin de continuer dans la même direction.
- Si les deux axes sont dépassés, traiter les deux dans la même image.
- Ne pas recopier cette logique dans un autre fichier.
- Le monde présente une continuité de position aux bords, mais **seek continue d’utiliser la distance euclidienne habituelle**. Il ne choisit pas automatiquement le trajet le plus court à travers un bord : une modification du steering torique est hors périmètre.

## 6. Arrivée sur la cible et réapparition aléatoire

### Définition d’« atteindre »

Un véhicule atteint la cible lorsque :

```text
(pos.x - target.pos.x)² + (pos.y - target.pos.y)² ≤ 16²
```

Le test porte sur le **centre du véhicule entrant dans le disque rouge**. Il ne s’agit ni d’une collision précise triangle/cercle, ni d’une distance égale à la somme des rayons. Cela rend le critère facile à comprendre et à tester, sans moteur physique.

Contrôler l’arrivée avant le déplacement pour prendre en compte une souris venant de se placer sur un véhicule. Si le véhicule n’était pas déjà arrivé, contrôler de nouveau après `update()` et `edges()`. Cela couvre une entrée dans le disque pendant l’image. Avec une vitesse maximale de 4 px par image et ce rayon de 16 px, un test discret convient à l’exercice ; une collision balayée exacte reste hors périmètre.

### Réinitialisation d’un véhicule

Lorsqu’une arrivée est détectée :

1. Tirer une nouvelle position valide à l’intérieur du canvas.
2. Modifier la position de **la même instance**, sans changer la taille du tableau.
3. Remettre `vel` et `acc` à `(0,0)`.
4. Conserver `maxSpeed`, `maxForce`, `r` et l’apparence.
5. Dessiner le véhicule à sa nouvelle position. Ne pas effectuer une seconde mise à jour de locomotion dans la même image.

Le véhicule recommence à poursuivre la cible à l’image suivante. Il n’y a ni disparition temporisée, ni nouvelle cible, ni ajout d’instance.

Cette téléportation doit rester dans une fonction de gestion de scène, distincte de `seek()`, `applyForce()` et `update()`.

### Tirage sûr et borné

Réutiliser la même règle de tirage pour l’initialisation, l’ajout par slider et la réapparition :

- coordonnées dans le canvas ; préférer une marge `r` sur chaque bord quand la taille le permet ;
- nouvelle position située à une distance **strictement supérieure à 20 px** de la cible : seuil d’arrivée de 16 px et marge de 4 px ;
- pas de contrainte d’écartement entre véhicules ;
- au maximum **32 tentatives aléatoires**, puis choix déterministe du coin admissible le plus éloigné de la cible ;
- si la marge `r` empêche une position valide dans un petit canvas, élargir la recherche à tout le canvas et à ses coins ;
- si aucune position ne peut être située hors de la zone d’exclusion, ne jamais boucler indéfiniment. Pour un ajout, utiliser le point disponible le plus éloigné ; pour une arrivée, différer la réapparition et conserver le véhicule jusqu’à une configuration permettant le tirage. La population doit toujours correspondre au slider.

Cette dernière règle concerne les canvas exceptionnellement petits. Elle garantit que l’application continue à répondre, même si la géométrie demandée devient impossible.

Un véhicule ne peut être réinitialisé **qu’une fois par image**. Le déplacement de la souris peut toutefois le recouvrir à nouveau à l’image suivante : il peut alors réapparaître une nouvelle fois, conformément au critère d’arrivée.

## 7. Workflow proposé

```mermaid
flowchart LR
    I["Événement input du slider"] --> N["Lire entier N : 1 à 200"]
    N --> C{"Comparer N à la taille du tableau"}
    C -->|"plus grand"| ADD["Ajouter uniquement les instances manquantes"]
    C -->|"plus petit"| REMOVE["Retirer uniquement les dernières instances"]
    C -->|"identique"| KEEP["Conserver la population"]
    ADD --> LABEL["Compteur = taille réelle"]
    REMOVE --> LABEL
    KEEP --> LABEL
    LABEL --> FRAME["Population visible au prochain rendu p5"]
```

```mermaid
flowchart TD
    DRAW["draw : effacer le canvas"] --> TARGET["Actualiser la cible si le pointeur est dans le canvas"]
    TARGET --> NEXT["Prendre le véhicule suivant"]
    NEXT --> PRE{"Déjà dans la cible ?"}
    PRE -->|"oui"| RESET["Réapparition aléatoire ; vel et acc nulles si possible"]
    PRE -->|"non"| SEEK["applyBehaviors avec la position cible"]
    SEEK --> UPDATE["update existant"]
    UPDATE --> EDGES["edges existant"]
    EDGES --> POST{"Dans la cible après déplacement ?"}
    POST -->|"oui"| RESET
    POST -->|"non"| SHOW["show existant"]
    RESET --> SHOW
    SHOW --> MORE{"Autre véhicule ?"}
    MORE -->|"oui"| NEXT
    MORE -->|"non"| END["Dessiner la cible au premier plan ; fin de l’image"]
```

En cas d’impossibilité de réapparition dans un canvas trop petit, la branche de réinitialisation diffère l’opération sans exécuter plusieurs pas ou modifier la population.

## 8. Organisation de l’implémentation future

| Fichier | Modification envisagée |
|---|---|
| `sketch.js` | Remplacer le véhicule global implicite par un tableau explicitement déclaré ; initialiser la population ; gérer le slider et orchestrer les étapes de chaque image |
| `population.js` | Fonctions de redimensionnement de la population, détection d’arrivée et tirage/réinitialisation ; aléatoire injectable pour les tests |
| `mouseTarget.js` | Entité `MouseTarget extends Vehicle`, dédiée à la cible contrôlée par la souris |
| `index.html` | Charger les nouveaux scripts dans l’ordre adapté et fournir les éléments de contrôle si l’interface n’est pas créée par p5 |
| `style.css` | Disposer la barre de contrôle et le canvas, conserver des commandes lisibles et utilisables au tactile |
| `tests/*.test.mjs` | Tests automatisés du comportement et des cas limites dans le dossier `1-Seek` |
| `vehicle.js` | **Aucune modification** : réutiliser `applyBehaviors()`, `update()`, `edges()` et `show()` |
| `target.js` | Aucun changement nécessaire ; classe autonome existante non utilisée par cette démonstration |

Un tableau de véhicules ordinaires suffit : ils partagent le comportement existant. Il n’est pas nécessaire de dupliquer `Vehicle`, son calcul de seek ou sa locomotion pour la population.

Les helpers de gestion ne doivent pas devenir de nouvelles classes d’entités visibles. Ne pas créer de timer par véhicule ; une seule boucle p5 met à jour toute la population.

Le redimensionnement de la fenêtre n’est pas une quatrième fonctionnalité demandée. Si un ajustement du canvas est ajouté pour maintenir la disposition barre/canvas, il doit préserver les instances et leurs vitesses, recaler la cible dans le canvas et réutiliser `edges()` pour les véhicules hors limites.

## 9. Critères d’acceptation

### Population et interaction

- À l’ouverture, 20 véhicules poursuivent la même cible.
- Le slider accepte tous les entiers de 1 à 200, sans dépasser les bornes.
- Pendant un glissement maintenu, plusieurs valeurs intermédiaires modifient le compteur et la population visible avant le relâchement.
- Passer de 20 à 35 conserve les 20 premières instances et en ajoute 15.
- Revenir de 35 à 8 conserve les 8 premières instances sans les réinitialiser.
- Le clavier permet également d’ajuster le nombre ; le texte affiche toujours la taille effective du tableau.
- Manipuler le slider ne déplace pas la cible vers les coordonnées de l’interface.

### Bords

- Un dépassement de chacun des quatre seuils provoque le repositionnement exact prévu par `edges()`.
- Les égalités aux seuils ne déclenchent pas prématurément le rebouclage.
- Un dépassement simultané sur deux axes traite les deux axes.
- La vitesse reste inchangée pendant un rebouclage.

### Cible

- À une distance supérieure à 16 px, le véhicule continue son seek normal.
- À exactement 16 px ou moins, il réapparaît selon les règles de tirage.
- Une arrivée avant le déplacement est détectée, de même qu’une arrivée après déplacement/rebouclage.
- Une réapparition conserve l’instance et le nombre de véhicules ; la vitesse et l’accélération sont nulles.
- La position tirée n’est pas immédiatement dans la zone d’arrivée, lorsque la géométrie le permet.
- Plusieurs véhicules peuvent atteindre la cible dans la même image et sont traités indépendamment.
- Si le slider supprime ou ajoute des véhicules pendant leur poursuite, l’état reste cohérent et aucune référence supprimée n’est mise à jour ensuite.

## 10. Vérifications à prévoir pendant l’implémentation

Le dépôt demande des tests pour chaque nouvelle fonctionnalité. Aucun lanceur utilisable n’existe actuellement dans `1-Seek` et `test.js` ne contient qu’un commentaire. Prévoir un lanceur léger, par exemple les tests natifs Node, avec une commande documentée depuis `1-Seek` :

```sh
node --test tests/*.test.mjs
```

Cette commande est maintenant disponible. Les 9 tests automatisés passent ; le rendu p5, le slider jusqu’à 200 véhicules et le retour à 1 au clavier ont également été vérifiés dans le navigateur, sans erreur console.

| Famille de tests | Cas essentiels |
|---|---|
| Population | Bornes 1/200, hausse/baisse/valeur identique, conservation d’identité et d’état, entrées invalides rejetées par les helpers |
| Interaction | Déclencher `input` sans déclencher `change` ni relâcher ; vérifier population et compteur ; compléter par un glissement réel dans le navigateur |
| Steering existant | Tous les véhicules utilisent le même seek ; force limitée à `maxForce`, vitesse limitée à `maxSpeed`, cible non mutée par seek |
| Rebouclement | Quatre bords, valeurs exactement aux seuils, angles du canvas, conservation des composantes et de la vitesse |
| Arrivée | Juste dehors, égalité et intérieur du seuil ; détection avant/après mouvement ; une réapparition au maximum par image |
| Tirage | Aléatoire injecté, marges, exclusion de la cible, limite de tentatives, repli déterministe, canvas petit ou géométrie impossible |
| Réinitialisation | Même instance, même effectif, paramètres conservés, vitesse et accélération remises à zéro |
| Intégration | Slider 1 → 200 → 1 pendant un geste, passages de bord et arrivées simultanées, interface utilisable et absence d’erreurs navigateur |

Les tests des règles de gestion doivent rester reproductibles. Les tests de locomotion doivent exercer les méthodes réellement fournies par `Vehicle`, sans en recopier l’algorithme dans le code applicatif. Une vérification dans le navigateur avec p5 réel complétera les tests isolés, notamment pour le rendu et l’événement `input`.

À 200 véhicules, le traitement doit rester proportionnel à la population : une boucle de mise à jour/dessin et des tirages bornés, sans comparaison systématique entre toutes les paires. Aucun engagement de cadence universelle n’est fixé ; mesurer le comportement dans le navigateur de validation et signaler une baisse notable plutôt que promettre 60 images/s sur toute machine.

## 11. Hors périmètre et livrable actuel

Ne sont pas inclus : flee, pursue, arrival, collisions entre véhicules, séparation/flocking, obstacles, cibles multiples ou autonomes, réglages individuels, trajectoires toroidales optimales et refonte du pas de temps.

Cette proposition respecte les frontières de [l’architecture](../ARCHITECTURE.md) et les [consignes du dépôt](../AGENTS.md). Le modèle de steering reste celui discuté dans l’[analyse de `1-Seek`](ANALYSE.md) et dans l’article de Reynolds fourni au dépôt.

**Historique :** cette spécification a d’abord été livrée seule, sans modification du code. Après approbation, les fonctionnalités ont été implémentées dans `sketch.js`, `population.js` et `mouseTarget.js`, avec adaptation de `index.html` et `style.css`, tests dans `tests/population.test.mjs` et documentation dans `README.md`. `vehicle.js` et `target.js` restent inchangés.
