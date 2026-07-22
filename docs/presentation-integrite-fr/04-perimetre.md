## Périmètre couvert

### Ce qui est protégé

La protection s'applique de façon homogène aux deux formes de jeux de données, toujours aux deux niveaux (détection **et** réparation) :

| Ressource | Couverture |
|---|---|
| **Jeux de données fichier** (CSV, tableur, géographique…) | Le fichier de données d'origine, octet par octet, quelle que soit sa taille — chaque version distincte est conservée intégralement dans l'entrepôt |
| **Métadonnées du jeu de données** | L'ensemble des champs porteurs de sens — description, schéma, permissions, sites de publication, configuration — scellés conjointement avec le fichier dans chaque révision |
| **Jeux de données éditables** (saisie ligne à ligne, API) | Chaque ligne porte sa **propre séquence de révisions** : création, modifications successives, suppression (pierre tombale). Détection et restauration s'exercent ligne par ligne, avec un historique consultable par ligne |

Quelques exclusions techniques raisonnées à l'intérieur de ce périmètre : les champs d'exploitation interne qui changent en permanence sans porter de sens (compteurs, dates de traitement), les libellés d'affichage recopiés depuis leurs sources de référence, et les colonnes produites par les enrichissements automatiques — toutes recalculables, aucune n'étant une donnée source. Les index de recherche sont des projections reconstructibles depuis les données couvertes : ils n'ont pas besoin d'être historisés, et se réparent par réindexation.

### Ce qui est refusé à l'enrôlement — la règle d'honnêteté

Le principe : **un verdict « intégrité vérifiée » ne doit jamais couvrir moins que ce qu'il annonce**. Plutôt que d'enrôler avec des angles morts documentés, la plateforme refuse l'activation dans les cas où la garantie serait partielle — et refuse également qu'un jeu de données déjà protégé acquière ces caractéristiques après coup :

- **jeux de données avec pièces jointes** : les fichiers joints aux lignes ne sont pas couverts par le scellement ; un verdict positif serait trompeur — l'enrôlement est refusé tant que cette couverture n'existe pas ;
- **jeux de données éditables avec attribution de lignes par propriétaire** : la restauration ne saurait pas préserver cette attribution ; le remède causerait une perte collatérale — refusé ;
- **jeux de données éditables au-delà du seuil de lignes** (100 000 lignes actives par défaut) : la protection ligne à ligne impose un travail par ligne et par période pour maintenir les verrous ; au-delà du seuil, ce coût cesse d'être raisonnable et l'enrôlement est refusé plutôt que dégradé. Un jeu déjà protégé qui franchit le seuil par croissance continue d'être protégé, avec un avertissement visible ;
- **transfert de propriétaire** : refusé tant que la protection est active (l'historique est ancré au compte propriétaire) ; le parcours prévu est désactiver — transférer — réactiver, chaque étape étant tracée ;
- **réinitialisations en masse** (vidage d'une collection de lignes) : refusées tant que la protection est active — les suppressions passent ligne à ligne, chacune laissant sa pierre tombale scellée.

Ces refus sont des choix de conception : chacun disparaîtra le jour où la couverture correspondante sera construite, sans que la promesse ait jamais été surévaluée entre-temps.

### Ce qui n'est pas dans le périmètre de cette itération

- la **vérification de cohérence de l'index de recherche** : les verdicts portent sur les
  données sources (fichier, métadonnées, lignes) ; l'index par lequel les données sont
  effectivement servies aux lecteurs est reconstructible et réparable, mais sa cohérence avec
  la source n'est pas encore contrôlée en continu — c'est la prochaine extension prévue ;
- les **applications et paramètres de compte** (la protection couvre les jeux de données) ;
- la **prévention** (niveau 3) : rendre une ressource immodifiable ;
- la **généralisation aux autres services** de la plateforme : la conception le permet, l'itération se concentre sur data-fair.
