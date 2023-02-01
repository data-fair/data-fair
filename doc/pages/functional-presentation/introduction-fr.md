---
title: Introduction
section: 1
description : Introduction
published: true
---
**Data Fair** et son écosystème permettent de mettre en œuvre une plateforme de partage de données (interne ou opendata) et de visualisations. Cette plateforme peut être à destination du grand public, qui peut accéder aux données au travers de **visualisations interactives** adaptées, aussi bien qu’à un public plus expert qui peut accéder aux données au travers des APIs.  

Le mot **FAIR** fait référence à de la donnée [« Facile à trouver, Accessible, Interopérable et Réutilisable »](https://fr.wikipedia.org/wiki/Fair_data). Cela est rendu possible grâce à **l'indexation** des données sur la plateforme. Elle permet de réaliser des recherches complexes dans des volumes de plusieurs millions d’enregistrements et d'accéder plus facilement et rapidement à ce qui nous intéresse. L'accès aux données aux travers **d'APIs normalisées et documentées** permet d'interfacer la plateforme avec d'autres systèmes d'information et facilite la réutilisabilité des données.

<img src="./images/functional-presentation/FAIR.jpg"
     height="160" style="margin:30px auto;" title="détail de l'acronyme FAIR" />

Les utilisateurs des données accèdent à la plateforme au travers **d'un ou plusieurs portails de données**. Ils permettent d’accéder au catalogue de jeux de données et de l'explorer de différentes manières. Il est possible de consulter directement les jeux de données, que ce soit avec des vues génériques (tableaux, cartes simples, ...) ou des visualisations plus spécifiques préconfigurées. Les données sont diffusées au travers de pages qui les présentent sous la forme d’histoires (data storytelling), **permettant à n'importe qui de les comprendre plus facilement**. Les utilisateurs peuvent s'abonner à des notifications sur les mises à jour et les développeurs peuvent accéder à la documentation interactive des diverses APIs de la plateforme. Les portails peuvent être agrémentés de **pages de contenu** présentant les démarches, contributeurs ou réutilisations mises en avant par exemple.

Les administrateurs et contributeurs de données ont accès à un **back-office** qui permet de gérer les différents éléments de la plateforme : comptes utilisateurs, jeux de données et visualisations. Les administrateurs peuvent paramétrer l'environnement et gérer les permissions d’accès aux données et visualisations. Selon leur profil, les utilisateurs du back-office pourront créer, éditer, enrichir, supprimer les jeux de données, les cartes et les graphiques. Le back-office permet de créer des **portails de données** (interne ou open data) et aussi d’accéder à différentes métriques d’utilisation des portails.

## Fonctionnement général
Les **jeux de données** sont en général créés par les utilisateurs en **chargeant des fichiers tabulaires ou géographiques** : le service stocke le fichier, l'analyse et déduit un schéma de données. Les données sont ensuite indexées suivant ce schéma et peuvent être requêtées au travers d'une API Web propre.

En complément des jeux de données basés fichiers, Data Fair permet également de créer des jeux de données **éditables par formulaire** et des jeux de données virtuels qui sont des **vues configurables d'un ou plusieurs jeux de données**.

L'utilisateur peut sémantiser les champs des jeux de données en leur **attribuant des concepts**, par exemple en déterminant qu'une colonne contenant des données sur 5 chiffres est un champ de type Code Postal. Cette sémantisation permet 2 choses : les données peuvent **être enrichies** à partir de données de référence ou elles même devenir **données de référénce** pour en enrichir d'autres, et les données peuvent être utilisées dans des **visualisations adaptées à leurs concepts**.

Les **visualisations** permettent d'exploiter au maximum le potentiel des données des utilisateurs. Quelques exemples: un jeu de données contenant des codes de commune peut être projeté sur une carte du découpage administratif français, un jeu de données contenant des codes de parcelles peut être projeté sur le cadastre, etc.

<!-- ![FAIR](./images/functional-presentation/data_and_settings.png) -->

## Principaux atouts de la plateforme
Data Fair permet de mettre en place une organisation centrée autour de la donnée :
* Possibilité de charger des données sous différents formats de fichiers ou par saisie via formulaire, permettant même de faire du crowd sourcing
* Consultation des données au travers d'un large choix de visualisations interactives (graphiques, cartes, moteurs de recherche, ...)
* Possibilité de créer plusieurs portails suivant les cas d'usage (opendata, echanges interne, ...)
* Création facilité d'APIs de données et enrichissement des données pour leur donner encore plus de valeur
* Mise en place de traitements périodiques permettant d'alimenter automatiquement la plateforme en données
* Cadre sécurisé, code source ouvert et utilisation de standards
