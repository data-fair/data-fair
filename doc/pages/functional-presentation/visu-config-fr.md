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

<img src="./images/functional-presentation/configuration-visu.jpg"
     height="400" style="margin:40px auto;" />

Un aperçu donne un rendu de la visualisation. Lorsque l’on réalise des modifications sur le menu de configuration, elles sont directement représentées sur l'aperçu. Il est ainsi possible de modifier et tester rapidement différents rendus de la visualisation, en **mode brouillon**. Lorsque le rendu est satisfaissant, l’enregistrement permet de valider les modifications réalisées. Les modifications sont alors visibles sur toutes les publications de la visualisation.

### Types de visualisations
Data Fair offre une grande variété de visualisations en constante progression, il y a ce jour près d'une **trentaine de visualisations différentes**. ([Cette section](./interoperate/applications) décrit en détails la manière de les créer).


#### Visualisations cartographiques

<img src="./images/functional-presentation/visu-carto.jpg"
     height="500" style="margin:40px auto;" />

Plusieurs applications permettent d'afficher des données géolocalisées. *Infos localisations* permet d'afficher des **marqueurs** qui présentent au clic une **fiche détaillée**, éventuellement accompagnée d'une image. *Carto stats* affiche les données sous forme de **cercles colorés et proportionnels** à une donnée dans une colonne, elle se prête bien à la visualisation d'un **grand nombre de points**. *Géo shapes* est quand à elle adaptée à l'affichage de **géométrie complexes**, par exemple un réseau routier ou un PLU.

D'autres applications sont adaptées aux données territorialisées, ce sont les données possédant des code territoire : code commune, département ou même code parcelles. *Infos parcelles* permet de projeter les données sur le **plan cadastral** français. *Cartographie territoriale multi-niveaux* affiche une **carte choroplèthe** des terrtoires allant de l'IRIS à la région et est adaptée à présenter des données comme les résultats d'élections ou d'autres indicateurs. *Zones de chalandise* permet de **fusionner les géométries des territoires** pour avoir des zones de couverture, par exemple le perimètre d'action des gendarmeries.

#### Visualisations en diagrammes

<img src="./images/functional-presentation/visu-diag.jpg"
     height="500" style="margin:40px auto;" />

Dès que les données possèdent des colonnes avec des types numériques, il est possible de paramétrer pour elles des visualisations en diagrammes. *Graphiques divers* permet de faire différents type de graphiques communs : **histogrammes, lignes, aires, camemberts**, ... *Diagramme de Sankey* est adapté à la **visualisation de flux**. *Graphique en radar* permet de comparer les lignes de données sur **différents critères**. *Comparaison de proportions* produit des diagrammes en gaufre, pour par exemple comparer la répartitions des éléments suivant différentes catégories.

*Graphes / Réseaux* et *Réseau de relations* permettent de faire des **graphes**, dans le premiers cas en utilisant des nœuds et des liens, et dans le second cas en se basant sur 2 critères dans 2 colonnes différentes d'un jeu de données. Pour les **données hiérarchiques**, 2 visualisations sont disponibles : *Treemap* et *Diagramme Sunburst*, et sont bien adaptée pour visualiser des données de budget ou d'allocation d'aides.

#### Visualisations temporelles

<img src="./images/functional-presentation/visu-temp.jpg"
     height="500" style="margin:40px auto;" />

Les données ayant des concepts liés aux dates peuvent être visualisées avec des visualisation temporelles. Certaines sont interactives, comme *Séries temporelles* qui permet de comparer des **courbes au cours du temps** (décès liés au covid par exemple), ou *Diagramme Timeline*  et *Calendrier* pour visualiser les données ayant des dates de début et dates de fin.

D'autres visualisation temporelles sont animées : elles possède un bouton lecture et l'utilisateur peut les regarder de manière passive. Ces visualisations sont intéressantes pour les réseaux sociaux car elles permettent d'augmenter l'engagement des autres utilisateurs, qui n'ont pas a cliquer sur le lien pour voir le résultat. *Bar chart race* permet de voir des courses de barres horizontales et est adapté quand il y a un **nombre important d'éléments qui ont la valeur maximale**, par exemple pour voir le prénom le plus donné au cours du temps. *Periodic Series* permet d'analyser les **données cycliques** pour voir comment elle se comportent d'une période sur une autre (par exemple des températures ou du trafic de véhicules).

#### Visualisations textuelles

<img src="./images/functional-presentation/visu-text.jpg"
     height="500" style="margin:40px auto;" />

Ce type de visualisations présente les données sous forme de texte, y compris les données numériques. *Métriques* permet de mettre en avant des **chiffres clés** sous la forme de tuiles. *Tableau synthétique* calcule des **agrégats sur 1 ou 2 axes**, et peut par exemple montrer des moyennes d'une valeur par départements. *Simple Table* permet d'afficher quelques colonnes du jeu de données en proposant des **filtres ou une arborescence** pour accéder plus rapidement aux données (par exemple région > département > commune). *Nuage de mots* analyse la fréquence des différents termes d'un jeu de données, ou de l'une de ses colonnes, pour mettre en avant ceux qui sont les plus présents.

Il est également possible de créer un moteur de recherche pour pouvoir explorer ses données sous formes de fiches avec *Liste et fiches*. Cela est bien adapté quand les données possèdent des colonnes avec des textes longs, qui ne sont pas faciles à lire dans une vue tableau. Le rendu des fiches peut être paramétré finement et il est même possible de faire un rendu pdf du jeu de données. Cette application est bien adaptée pour réaliser des annuaires ou des catalogues.

#### Gamification

<img src="./images/functional-presentation/visu-jeu.jpg"
     height="500" style="margin:40px auto;" />

En plus des visualisations de données "traditionnelles", il est possible de configurer des mini-jeux. Le jeu est l'un des **meilleurs moyens d'apprentissage** et permet de mémoriser certaines choses sans parfois même s’en rendre compte. Cela permet de rendre les données **plus attractives**, favorise l'engagement des utilisateurs qui peuvent réessayer les jeux plusieurs fois jusqu'à avoir un bon score et **augmenter la visibilité des données** sur les réseaux sociaux via les mécanismes de partage de scores et de "mise au défi".

*Jeu de localisation* est destiné aux données géolocalisées et demande a placer des éléments sur une carte. *Jeu de Quizz* permet de réaliser un questionnaire a choix multiples. *Jeu de tri* demande à l'utilisateur de trier des données par glisser / déposer pour les classer suivant un certain critère, par exemple pour trier des aliments en fonction de leur empreinte carbone. Tous ces jeux prennent en compte le temps dans le calcul du score, pour éviter la "triche" et inciter l'utilisateur a mémoriser les bonnes réponses par essai / erreur.

#### Autre types de visualisations
Certaines visualisations sont compliquées à classer et nous les mentionnons ici. *Diaporama* permet d'afficher des données ayant des **images en pièces-jointes**. *Formulaire de saisie* offre la possibilité de collecter des retour directement stockés dans un jeu de données, de faire du **crowd sourcing** ou d'offrir une interface de mise à jour des données plus légère que l'intégralité du back-office pour une personne qui ne serait responsable de la mise à jour que d'un jeu de données.

Il y a aussi des visualisation qui sont **adaptées à certains schémas de données**, comme les *délibérations* ou les *équipements* publiés suivant les schémas du **Socle Commun des Données Locales (SCDL)**.

### Permissions et publication des visualisations

Les mécanismes de permission et de publication des visualisations sont les même que pour les jeux de données. Par défaut, une visualisation est privée. Elle peut être rendue publique par la suite. Dans tous les cas, il est recommandé de renseigner une description. Cette description est visible sur la page de consultation de la visualisation, mais aussi sur la page du jeu de données associé.

Il est aussi possible de partager une visualisation privée avec des utilisateurs non authentifiés. Cela se fait en générant un lien de partage qui contient un code secret. Toute personne connaissant ce lien peut accéder à la visualisation, même si les données qu'elle utilise sont privées. Si le lien est compromis, il peut être supprimé puis régénéré avec un code secret différent. Cela permet d'embarquer des visualisations dans des sites privés, sans avoir à créer un ou plusieurs comptes utilisateur et transmettre des identifiants d'accès.
