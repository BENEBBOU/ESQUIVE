# ESQUIVE — 100 niveaux de survie

Ouvrir `index.html` dans un navigateur, ou servir ce dossier avec un serveur HTTP local. Le jeu s'ouvre sur l'écran titre.

## Le jeu

Votre boule suit la souris (ou le doigt). Des vaisseaux pilotés par des *steering behaviors* vous poursuivent :
- Chaque contact coûte **un cœur** ; vous en avez 3.
- **Tenez 60 secondes** : vos cœurs restants deviennent vos étoiles, 3 = or, 2 = argent, 1 = bronze. Une étoile suffit pour débloquer le niveau suivant.
- Quand ils **s'excitent**, les vaisseaux virent au rouge et accélèrent.
- Les **barres néon** coûtent un cœur au toucher. Les vaisseaux les évitent, mais elles **surchauffent** si l'on s'y cache.

### Interface

- **Écran titre** : derrière le menu, une démo animée montre des vaisseaux qui poursuivent une boule sur le fond élastique. On y trouve « Jouer » (qui reprend au premier niveau pas encore validé), « Niveaux », « Comment jouer », « Réglages » et le total d'étoiles.
- **Niveaux** : 10 mondes, chacun avec sa couleur et son total d'étoiles. Chaque carte de niveau affiche ses étoiles, son cadenas, le nombre de vaisseaux, les barres, l'excitation et un badge BOSS.
- **En partie**, le HUD est épuré : bouton pause, « MONDE · NIVEAU », barre de temps aux couleurs du monde (rouge quand les vaisseaux sont excités) et cœurs. Le curseur système est masqué.
- **Pause** : Échap, P ou le bouton, avec Reprendre, Recommencer, Niveaux et Menu. La pause est aussi automatique quand la fenêtre perd le focus.
- **Fin de partie** : les étoiles apparaissent une par une, avec le détail (cœurs restants, frôlements), le record du niveau et les boutons Niveau suivant, Rejouer et Niveaux.
- **Réglages**, gardés dans le navigateur : son, tremblements de l'écran, fond élastique animé (on peut le couper pour les petites machines).
- **Clavier** : Échap/P pause, R rejouer, Entrée niveau suivant, N niveaux.

### 100 niveaux (`levels.js`)

Les niveaux 1 à 4 sont faits main ; les niveaux 5 à 100 sont **générés avec la même logique**, de façon déterministe, avec 10 mondes de 10 niveaux :

| Monde | Nom | Niveaux |
|---|---|---|
| 1 | Premiers pas | 1–10 |
| 2 | Les barres | 11–20 |
| 3 | Accélération | 21–30 |
| 4 | Labyrinthe | 31–40 |
| 5 | Essaim | 41–50 |
| 6 | Tempête | 51–60 |
| 7 | Forteresse | 61–70 |
| 8 | Hypervitesse | 71–80 |
| 9 | Chaos | 81–90 |
| 10 | Légende | 91–100 |

Comment la difficulté évolue :
- **Vitesse de départ** : 420 px/s, +4 px/s par niveau, jusqu'à 800 px/s.
- **Vaisseaux** : de 7 à 28, et jusqu'à 32 pour les boss.
- **Excitation** à 0:30 : un niveau sur deux dans les mondes 1 et 2, puis tous les niveaux.
- **Barres** : 10 dispositions, choisies selon le monde (aucune, centre horizontal ou vertical, deux barres, portail, croix, zigzag, coins, cadre).
- **Boss** à la fin de chaque monde : plus de vaisseaux, excitation à 0:20 et seconde accélération à 0:40.
- **Surchauffe** des barres de plus en plus rapide : de 2 s à 1,3 s.

### Évitement des barres par les vaisseaux (`vaisseau.js`)

- `avoid` : fuite du point de barre le plus proche (`Flee.reynolds`), convertie en virage. La force permise grandit avec le carré de la vitesse, pour garder un virage d'environ 70 px quelle que soit l'allure.
- `contact` : garde-fou appliqué en dernier, qui retire la partie de la vitesse dirigée vers l'intérieur d'une barre. Le vaisseau glisse alors le long de la barre au lieu de la traverser.
- Les vaisseaux apparaissent toujours à l'écart des barres.
- Mesuré dans le navigateur : aucune traversée sur plus de 30 000 déplacements, aux niveaux 40, 70 et 100, jusqu'à 1 060 px/s.

## Mode développeur

Ouvrir `index.html?dev` : le mode reste actif dans ce navigateur jusqu'à `index.html?dev=0`. On y retrouve :
- l'en-tête de réglages : scénarios d'exercice, sliders de vaisseaux, vitesse et force, options d'affichage ;
- le tableau de bord avec les mesures : vitesse réelle, force, paliers, FPS ;
- le tableau des niveaux (touche N) avec **tous les niveaux ouverts**.

Dans le jeu publié, aucune de ces mesures n'apparaît, et les niveaux se débloquent un par un.

---

# Documentation développeur

## Steering behaviors — seek, flee, scénarios

Ouvrir `index.html` dans un navigateur (ou servir ce dossier avec un serveur HTTP local).

## Mode Niveaux (mode par défaut, touche 1)

Le joueur déplace la cible (la boule) à la souris et doit survivre aux vaisseaux, qui le poursuivent. Une partie dure **1 minute**. Le joueur a **3 cœurs** : chaque touche d'un vaisseau retire un cœur, la boule garde sa taille et le nombre de vaisseaux ne change pas. Après une touche, la boule est invulnérable 1,5 s (elle clignote) et les vaisseaux proches sont renvoyés au loin. À 0 cœur, c'est le game over.

**Étoiles = cœurs restants.** Si l'on survit jusqu'à la fin de la minute, on gagne autant d'étoiles que de cœurs restants : 3 = or, 2 = argent, 1 = bronze. Une seule étoile suffit à valider le niveau et à débloquer le suivant. Si l'on perd ses 3 cœurs avant la fin, le niveau est échoué (0 étoile). Les 5 dernières secondes sont décomptées à l'écran.

Les niveaux sont décrits dans `levels.js`.

### Barème de vitesse (référence pour concevoir les niveaux)

La vitesse des niveaux est donnée en **crans de 1 à 20** (`speedScale.js`). Chaque cran correspond à une vitesse réelle garantie : dans les niveaux, les vaisseaux avancent toujours exactement à la vitesse de leur cran. **V10 = 600 px/s**, puis chaque cran ajoute 60 px/s, jusqu'à V20 = 1 200 px/s. La **force max reste 0,1** et ne sert qu'à tourner, si bien que plus un cran est rapide, plus les virages sont larges.

| Cran | px / image | px / s (60 images/s) | Rayon de virage minimal (force 0,1) |
|---|---|---|---|
| V1 | 2 | 120 | 40 px |
| V2 | 2,5 | 150 | 62 px |
| V3 | 3 | 180 | 90 px |
| V4 | 3,5 | 210 | 122 px |
| V5 | 4 | 240 | 160 px |
| V6 | 5 | 300 | 250 px |
| V7 | 6 | 360 | 360 px |
| V8 | 7 | 420 | 490 px |
| V9 | 8 | 480 | 640 px |
| V10 | 10 | 600 | 1 000 px |
| V11 | 11 | 660 | 1 210 px |
| V12 | 12 | 720 | 1 440 px |
| V13 | 13 | 780 | 1 690 px |
| V14 | 14 | 840 | 1 960 px |
| V15 | 15 | 900 | 2 250 px |
| V16 | 16 | 960 | 2 560 px |
| V17 | 17 | 1020 | 2 890 px |
| V18 | 18 | 1080 | 3 240 px |
| V19 | 19 | 1140 | 3 610 px |
| V20 | 20 | 1200 | 4 000 px |

Comment c'est réalisé (`Vaisseau.chase`), avec des forces appliquées par `applyForce()` et la locomotion héritée de `Vehicle` :
- **Virage** : force de pilotage de Reynolds (vitesse désirée vers la cible − vitesse actuelle), dont on ne garde que la partie perpendiculaire au mouvement, limitée à la force max.
- **Vitesse** : une seconde force ramène la vitesse exactement au cran.

Avant ce barème, la « vitesse max » n'était qu'un plafond : avec une force de 0,1, les vaisseaux passaient leur temps à freiner pour se retourner et restaient vers 5 px/image, quelle que soit la vitesse max.

La vitesse des niveaux est donnée **en px/s** (vitesse réelle garantie, `Vaisseau.chase`). Le cran du barème le plus proche est affiché comme repère, par exemple « 420 px/s (V8) ». Un palier peut changer la vitesse en cours de partie, avec une transition de 3 s ; le palier « excitation » rend les vaisseaux rouges. La force max reste 0,1 dans tous les niveaux.

| Niveau | Vaisseaux | Vitesse | Excitation | Particularité |
|---|---|---|---|---|
| 1 — Premier contact | 7 | 420 px/s (V8) | aucune | |
| 2 — Encerclement | 10 | 420 px/s (V8) | aucune | |
| 3 — Excitation | 7 | 420 px/s, puis 500 px/s | à 0:30 | |
| 4 — La barre | 7 | 420 px/s, puis 500 px/s | à 0:30 | barre néon au centre |

**La barre du niveau 4** (`barrier.js`, entité immobile, sous-classe de `Vehicle`) :
- Horizontale au centre de la scène, longue de 5 cm (≈ 189 px à 96 points par pouce) et épaisse de 18 px.
- Néon noir : cœur noir brillant, halo sombre qui pulse, bordure blanche lumineuse, reflet de miroir qui glisse le long de la barre et reflet estompé dessous.
- La toucher avec la boule coûte un cœur. Le trajet de la souris entre deux images est vérifié : traverser la barre d'un geste rapide compte aussi comme une touche.
- **Les vaisseaux évitent la barre par fuite** (`Vaisseau.avoid`, à partir de `Flee.reynolds` de `flee.js`) :
  - ils examinent plusieurs points de leur trajet anticipé (jusqu'à 25 images devant) ;
  - à moins de 40 px de la barre, ils fuient le point de la barre le plus proche, avec une force 8 fois supérieure au braquage normal (l'évitement est prioritaire) ;
  - comme ils roulent à vitesse constante, la fuite est convertie en virage ; face à la barre, ils tournent du côté opposé à son centre pour la contourner ;
  - réglages choisis par simulation : aucune traversée sur 96 approches, à 420 et à 500 px/s ; dans le navigateur, aucune traversée sur environ 4 000 déplacements.
- **Anti-glitch : la surchauffe.** Puisque les vaisseaux évitent la barre, la boule pourrait se cacher contre elle. Rester à moins de 60 px de la barre la fait chauffer :
  - une zone pointillée apparaît, la bordure vire au rouge et « TROP PRÈS ! xx % » s'affiche ;
  - au bout de 2 s, la barre surchauffe et coûte un cœur, puis la chaleur repart de zéro ;
  - loin de la barre, elle refroidit deux fois plus vite qu'elle ne chauffe : passer près d'elle est permis, s'y installer ne l'est pas.
  - Réglages : `campRadius` et `campTime` dans `levels.js`.

Commun à tous les niveaux :
- Fond blanc **élastique** (`rubberSheet.js`) : là où passe le curseur, la membrane se creuse en relief (grille déformée en perspective, ombrage éclairé depuis le haut à gauche), puis revient à plat en une seconde environ, avec un léger rebond.
- L'excitation est annoncée (« ILS S'EXCITENT ! »). Le tableau de bord affiche la vitesse en px/s, la vitesse réelle moyenne, la force, le prochain palier et le temps restant.
- Le meilleur nombre d'étoiles de chaque niveau est conservé dans le navigateur.

**Sliders pendant le développement** : vaisseaux au départ, vitesse et force max. En mode Niveaux, le slider de vitesse va de 60 à 1 200 px/s, par pas de 10, et affiche le cran du barème correspondant. Au lancement d'un niveau, il reprend la vitesse de départ du niveau. Le modifier décale toute la courbe : par exemple, un départ à 450 px/s au niveau 3 donne 530 px/s après l'excitation. La force du slider est appliquée telle quelle.

**Mode développeur** : voir plus haut (`index.html?dev`) ; il ouvre tous les niveaux.

**Tableau des niveaux** (bouton « Tableau des niveaux » ou touche N, Échap pour fermer) : il contient 100 cases, avec les étoiles obtenues et le total sur 300. La partie se met en pause pendant la consultation. Un niveau est jouable s'il est défini et si le précédent est validé ; les autres apparaissent « à venir » ou verrouillés 🔒.

Pour ajouter un niveau, il suffit d'ajouter un objet à `LEVELS` dans `levels.js` : vaisseaux, affichage, fond, cœurs (`lives`), durée (`duration`), force max (`force`), paliers (`stages` : temps, vitesse en px/s, `excite`), barre (`barrier`) et seuils des étoiles.

- 20 véhicules au démarrage, réglables de 1 à 200 avec le slider, pendant le glissement.
- La cible rouge suit le pointeur dans le canvas ; elle reste immobile pendant la manipulation des contrôles.
- Les véhicules réapparaissent au bord opposé grâce à `Vehicle.edges()`.
- À 16 px ou moins de la cible, le véhicule réapparaît ailleurs avec une vitesse et une accélération nulles.
- Les véhicules conservés lors d'un changement d'effectif gardent leur état.
- `creerVehicules(nb)` (dans `sketch.js`) ajuste la population à `nb` véhicules suiveurs.
- Un menu **Scénario** (touches 1 à 6) propose :
  - *Scénario 1 — Les vaisseaux chassent la cible* : une `Target` (`target.js`) avance dans une direction aléatoire et réapparaît au bord opposé ; le vaisseau qui la touche réapparaît ailleurs.
  - *Scénario 2 — La cible fuit le vaisseau le plus proche* : `TargetFuyante` (`targetFuyante.js`, sous-classe de `Target`, donc de `Vehicle`). Quand le vaisseau le plus proche entre dans son cercle de détection (200 px, slider « Détection »), elle le fuit avec la méthode héritée `flee()` en accélérant : sa vitesse max et sa force max augmentent à chaque image, jusqu'à 7 et 0,5. Elle fuit jusqu'à 300 px du prédateur (ou le rayon de détection s'il est plus grand), puis reprend le comportement normal de `Target` et revient progressivement à sa vitesse de croisière.
  - *Mode joueur* (`game.js`, `playerTarget.js`) : la souris contrôle la cible (le centre du fond la suit) et les vaisseaux la poursuivent avec seek. Après un compte à rebours de 3 s :
    - chaque touche double la taille de la cible et le nombre de vaisseaux (200 au plus) ; à 4 fois la taille de départ, c'est le game over ;
    - après une touche, la cible est invulnérable 1,5 s (elle clignote) et les vaisseaux proches sont renvoyés au loin ;
    - les vaisseaux accélèrent : +1 de vitesse max toutes les 10 s, sans plafond (« VITESSE +N ! » s'affiche) ;
    - le curseur « Vaisseaux au départ » (1 à 100, 8 par défaut) règle le nombre initial ; il s'applique tout de suite avant le départ ou après un game over, sinon à la partie suivante ;
    - score : 10 points par seconde et par vaisseau en chasse, plus un bonus de frôlement (50 × la taille actuelle) quand un vaisseau passe à moins de 45 px du bord de la cible puis s'éloigne au-delà de 90 px sans toucher ;
    - le chrono, le score, le record (gardé dans le navigateur) et la taille s'affichent dans la barre du haut ; R, un clic ou « Rejouer » relance une partie.
  - *Seek — cible souris* : la scène d'origine.
  - *Flee — fuir la souris* : fuite selon Reynolds (`Flee.reynolds()` dans `flee.js`). La case « flee naïf » utilise `Vehicle.flee()`, qui inverse la force de seek, pour comparer.
  - *Variante* : c'est la `Target` qui réapparaît ailleurs, avec une nouvelle direction, quand un vaisseau l'atteint.
- `index.html?scenario=scenario-2` ouvre directement un scénario.
- En mode Flee, la fuite est limitée à une **zone** autour du cercle (slider « Zone de fuite », 40 à 400 px, cercle pointillé). Hors de la zone, le véhicule erre aléatoirement avec le comportement wander de Reynolds (`wander.js`) : il suit un point qui glisse sur un cercle placé devant lui, donc sa direction change progressivement.
- Fond : anneaux arc-en-ciel concentriques plein écran (magenta au centre, puis bleu, cyan, vert, jaune, rouge), qui sortent du centre en continu (`background.js`). Le centre des anneaux suit le curseur en douceur ; le slider « Voile du fond » assombrit les couleurs.
- Effets visuels :
  - les véhicules sont des `Vaisseau` (`vaisseau.js`, sous-classe de `Vehicle` qui ne change que le dessin) : coque sombre, cockpit coloré, flamme de réacteur proportionnelle à la vitesse et traînée colorée ;
  - à chaque capture, une explosion d'étincelles et une onde de choc (`particle.js`, sous-classe de `Vehicle` freinée par une force de frottement ; `effects.js` gère la liste, plafonnée à 900 particules) ;
  - la cible fuyante affiche son cercle de détection (rouge pendant la fuite), sa distance de fin de fuite, une jauge de vitesse, le lien vers le prédateur et « FUITE ! » ;
  - un tableau de bord en bas à gauche (scénario, captures, état et vitesse de la cible, distance du prédateur), qui devient transparent quand la cible passe dessous.
- Raccourcis : 1 à 6 (scénarios), Espace (pause), R (rejouer en mode joueur), T (traînées), V (vecteurs vitesse), H (tableau de bord), S (son).
- Bouton « Activer le son » (`sound.js`, Web Audio) : plus il y a de véhicules qui touchent le cercle (la zone en mode Flee, sinon la cible), plus le son, en synthèse FM (un modulateur fait varier la fréquence du porteur), est fort et riche (l'indice de modulation et l'harmonicité augmentent), et chaque véhicule dans le cercle monte la note d'un demi-ton (jusqu'à 4 octaves). Le cercle est celui de détection dans le scénario 2. Chaque capture joue un court « ping » FM et l'alerte de la cible fuyante une note grave. Le compteur « Dans le cercle » affiche ce nombre.
- Deux sliders p5 (`createSlider`) règlent en direct la vitesse max (1 à 20, 4 par défaut) et la force de pilotage max (0,01 à 1, 0,1 par défaut) de tous les véhicules.

`vehicle.js` reste inchangé. `target.js` a été réécrit pour l'exercice Target (plus de timer). `MouseTarget` sert de cible dans les scènes pilotées à la souris. Les fonctions de gestion de population sont dans `population.js` ; la boucle p5 et les interactions sont dans `sketch.js`.

## Tests

Depuis ce dossier, avec Node.js (18 ou plus) :

```sh
node --test tests/*.test.mjs
```

### Pourquoi inverser la vitesse désirée et pas la force ?

`seek` renvoie `désirée - vitesse`. Si on l'inverse, on obtient `-désirée + vitesse`, alors que Reynolds demande `(-désirée) - vitesse`. Les deux ne coïncident que pour un véhicule à l'arrêt. Un véhicule qui fonce sur la cible à `maxSpeed` a une vitesse égale à la vitesse désirée de seek : la version naïve renvoie alors une force **nulle** et le véhicule ne fuit pas. `Flee.reynolds()` calcule `désirée = (position - cible)` normée à `maxSpeed`, puis `force = désirée - vitesse`, limitée à `maxForce`.

Aucune dépendance à installer. Les tests exécutent le vrai `vehicle.js` avec un adaptateur vectoriel minimal et un aléatoire déterministe. La validation du rendu avec p5 et du glissement réel se fait également dans le navigateur.

La [spécification](EXO1_SPECIFICATION.md) décrit les règles, le workflow et les cas limites. Elle constitue le document de conception initial ; l'implémentation et les tests sont maintenant présents.
