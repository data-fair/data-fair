---
title: Paramétrage des visualisations
section: 3
subsection : 2
description : Paramétrage des visualisations
published: true
---

Les visualisations interactives permettent de présenter les données de manière synthétique et d'offrir la possibilité à l'utilisateur de les manipuler pour les comprendre plus rapidement. Elle sont servies par des applications Web légères, qui permet une consultation directe sur tout type de terminal Web, ou une intégration iframe dans des portails ou sites institutionnel.

### Paramétrage intuitif
Les visualisations peuvent être configurées grâce à une interface graphique qui ne **requiert pas de compétences en programmation**. Le menu de configuration se compose de différentes sections qui diffèrent selon les applications. La plupart du temps, le menu est composé de trois sections : la source de données, les options de rendu et les éléments liés à la navigation. Il est souvent possible de filtrer les données si on ne souhaite pas représenter le jeu de données en entier.

![Configuration d'une visualisation](./images/functional-presentation/configuration-visu.jpg)

Un aperçu donne un rendu de la visualisation. Lorsque l’on réalise des modifications sur le menu de configuration, elles sont directement représentées sur l'aperçu. Il est ainsi possible de modifier et tester rapidement différents rendus de la visualisation, en **mode brouillon**. Lorsque le rendu est satisfaissant, l’enregistrement permet de valider les modifications réalisées. Les modifications sont alors visibles sur toutes les publications de la visualisation.

### Types de visualisations
Data Fair offre une grande variété de visualisations en constante progression, il y a ce jour près d'une **trentaine de visualisations différentes**. ([Cette section](./interoperate/applications) décrit en détails la manière de les créer).

![Differentes visualisations](./images/functional-presentation/valorisations.jpg)

#### Visualisations cartographiques
Plusieurs applications permettent d'afficher des données géolocalisées. *Infos localisations* permet d'afficher des **marqueurs** qui présentent au clic une **fiche détaillée**, éventuellement accompagnée d'une image. *Carto stats* affiche les données sous forme de **cercles colorés et proportionnels** à une donnée dans une colonne, elle se prête bien à la visualisation d'un **grand nombre de points**. *Géo shapes* est quand à elle adaptée à l'affichage de **géométrie complexes**, par exemple un réseau routier ou un PLU.

D'autres applications sont adaptées aux données territorialisées, ce sont les données possédant des code territoire : code commune, département ou même code parcelles. *Infos parcelles* permet de projeter les données sur le **plan cadastral** français. *Cartographie territoriale multi-niveaux* affiche une **carte choroplèthe** des terrtoires allant de l'IRIS à la région et est adaptée à présenter des données comme les résultats d'élections ou d'autres indicateurs. *Zones de chalandise* permet de **fusionner les géométries des territoires** pour avoir des zones de couverture, par exemple le perimètre d'action des gendarmeries.

#### Visualisations graphiques
Dès que les données possèdent des colonnes avec des types numériques, il est possible de paramétrer pour elles des visualisations graphiques. 

* **Diagramme de Sankey** : Visualiser ses données de flux.
* **Diagramme Sunburst** : Visualiser ses données hiérarchiques.
* **Bar chart race** : Visualiser ses données de classement à travers le temps.
* **Charts** : Visualiser ses données dans différents type de graphiques, tels que des histogrammes, des graphiques d'aires, de lignes, etc…
* **Relations et graphes/réseaux** : visualiser des données avec des noeuds, des liens ou des réseaux.

#### Visualisations textuelles

* **Liste et fiches** : Créer un moteur de recherche pour pouvoir explorer ses données sous formes de fiches.
* **Nuage de mots** : Générer son propre nuage de mots à partir d’une analyse du contenu de la source.

#### Gamification

#### Autre types de visualisations



### Permissions et publication des visualisations

Les mécanismes de permission et de publication des visualisations sont les même que pour les jeux de données. Par défaut, une visualisation est privée. Elle peut être rendue publique par la suite. Dans tous les cas, il est recommandé de renseigner une description. Cette description est visible sur la page de consultation de la visualisation, mais aussi sur la page du jeu de données associé.

Il est aussi possible de partager une visualisation privée avec des utilisateurs non authentifiés. Cela se fait en générant un lien de partage qui contient un code secret. Toute personne connaissant ce lien peut accéder à la visualisation, même si les données qu'elle utilise sont privées. Si le lien est compromis, il peut être supprimé puis régénéré avec un code secret différent. Cela permet d'embarquer des visualisations dans des sites privés, sans avoir à créer un ou plusieurs comptes utilsateur et transmettre des identifiants d'accès.