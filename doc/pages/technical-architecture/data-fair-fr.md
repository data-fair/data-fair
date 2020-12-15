---
title: DataFair
section: 2
updated: 2020-12-09
description : DataFair
published: false
---

DataFair permet d'exposer facilement ses données via une API web, contractualisée et documentée, ce qui permet aux développeurs de les réutiliser facilement dans leurs **applications**. De plus les données peuvent être sémantisées, ce qui permet ensuite de les enrichir avec d'autres données sémantisées. Ainsi, des données qui ont une adresse peuvent par exemple être complétées par des coordonnées GPS, ce qui permet ensuite de les afficher sur une carte.

Le coeur de la solution permet
* d’indexer des données
* d’Apifier des données
* d’enrichir des données
* de partager des données
* de configurer les visualisations
* de gérer les droits d’accès aux données et aux visualisations (publication)


### Concepts clés

Les trois concepts centraux sont : les **jeux de données**, les **services distants** et les **applications**. La finalité de ce service est de pouvoir utiliser facilement des **applications** adaptées à différents métiers et alimentées par une combinaison de **services distants** et de données propres à l'utilisateur.

Les **jeux de données** sont créés par les utilisateurs en chargeant des fichiers : le service stocke le fichier, l'analyse et déduit un schéma de données. Les données sont ensuite indexées suivant ce schéma et peuvent être requêtées au travers d'une API Web propre.  
L'utilisateur peut sémantiser les champs des **jeux de données**, par exemple en déterminant qu'une colonne contenant des données sur 5 chiffres est un champ de type Code Postal.  
Cette sémantisation permet 2 choses : les données peuvent être enrichies et servir à certains traitements si on dispose des **services distants** appropriés, et les données peuvent être utilisées dans des **applications** adaptées à leurs concepts.

En complément des **jeux de données** basés fichiers, DataFair permet également de créer des **jeux de données** incrémentaux qui sont éditables en temps réel et des **jeux de données** virtuels qui sont des vues re-configurable d'un ou plusieurs **jeux de données**.

Les **services distants** mettent à disposition des fonctionnalités sous forme d'APIs Web externes à DataFair qui respectent les règles d’interopérabilité d’OpenAPI 3.0.  
Un des objectifs de DataFair est de permettre à des non informaticiens d'utiliser facilement des APIs tierces avec leurs propres données. Il y a 2 manières d'exploiter les **services distants** : l'utilisateur peut les utiliser pour ajouter en temps différé des colonnes à ses **jeux de données** (exemple géocodage) et les **applications** peuvent les exploiter en temps réel (exemple fonds de carte).

Les **services distants** connectés sur une instance DataFair ne sont pas gérés par les utilisateurs directement, mais plutôt mis à leur disposition par les administrateurs. Nous proposon  un certain nombre de **services distants** compatibles avec l’abonnement (fonds de carte, base des entreprises de France, cadastre, base nationale des adresses, etc.).

Les **applications** permettent d'exploiter au maximum le potentiel des données des utilisateurs et des **services distants**. Quelques exemples: un jeu de données contenant des codes de commune peut être projeté sur une carte du découpage administratif français, un jeu de données contenant des codes de parcelles peut être projeté sur le cadastre, etc.

Les **applications** ne sont pas développées dans ce projet : ce sont des **applications** Web développées et déployées de manière autonome qui respectent les règles d’interopérabilité d’OpenAPI 3.0 avec DataFair. Elles peuvent être open source ou non. Chaque application de base peut être utilisée autant de fois que désiré pour valoriser différents **jeux de données**. DataFair permet de stocker et éditer les différents paramètres d'une même application de base.

### Contrôles d’accès
DataFair permet de contrôler simplement mais de manière puissante les permissions sur les différentes ressources. Les utilisateurs peuvent faire partie de une ou plusieurs organisations, qui peuvent elles même contenir un ou plusieurs utilisateurs.  
Quand un utilisateur configure un jeux de données ou une application, il peut déterminer quels utilisateurs et organisations y ont accès. Ouvrir un accès à une organisation donne l'accès à tous les membres de cette organisation. Les accès peuvent également être ouverts en public et même les personnes non authentifiées pourront alors accéder à la ressource.

Les utilisateurs et organisations ne sont pas gérées dans ce service. Ce service doit être connecté à un annuaire qui implémente le contrat du service d'identification Simple-Directory.


### Publication d’un jeu de données

La publication d’un jeu de données est soumise à plusieurs étapes décrite dans le schéma suivant :

![Catalogue de données](./images/technical-architecture/publication.jpeg)

La solution couvre ainsi les cas de reprise de jeux de données d’une ancienne plateforme et la publication de nouveau jeux de données.
