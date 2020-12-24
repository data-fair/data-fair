---
title: Introduction
section: 1
updated: 2020-12-09
description : Introduction
published: true
---
**Data Fair** et son écosystème permettent de mettre en œuvre une plateforme de partage (interne ou opendata) et de visualisation de données. Cette plateforme peut être à destination du grand public, qui peut accéder aux données au travers de visualisations interactives adaptées, aussi bien qu’à un public plus expert qui peut accéder aux données au travers des APIs.  
Le mot **FAIR** fait référence à de la donnée [« Facile à trouver, Accessible, Interopérable et Réutilisable »](https://fr.wikipedia.org/wiki/Fair_data).

Les **jeux de données** chargés sur la plateforme sont indexés. L’indexation d’un jeu de données augmente considérablement sa réutilisabilité et permet de réaliser des recherches textuelles dans des données volumineuses de plusieurs millions d’enregistrements ou dans les visualisations des données.

La partie **front-office** permet d’accéder au catalogue de jeux de données et de pouvoir rechercher dans celui-ci de différentes manières. Il est possible de consulter directement les jeux de données, que ce soit avec des vues génériques (tableaux, cartes simples, …) ou des visualisations plus spécifiques préconfigurées. Les données sont diffusées au travers de pages qui les présentent sous la forme d’histoires (data storytelling). Enfin les développeurs peuvent accéder à la documentation des diverses **APIs de la plateforme**.

Le **back-office** permet de gérer les différents éléments de la plateforme : comptes utilisateurs, jeux de données et visualisations. Les administrateurs peuvent paramétrer l'environnement et gérer les permissions d’accès aux données et visualisations. Selon leur profil, les utilisateurs du back-office pourront créer, éditer, enrichir, supprimer les jeux de données, les cartes et les graphiques.
Le back-office permet de créer des **portails de données** (private ou open data) et aussi d’accéder à différentes statistiques d’utilisation des portails (analytics).

### Principaux atouts de la plateforme

* La possibilité de charger des données sous différents formats.
* L’enrichissement des données pour leur donner encore plus de valeur.
* Les représentations possibles grâce à un large choix de visualisations interactives (graphiques, cartes, moteur de recherches, ...).
* La publication des données sous formes de visualisations, de portail et d'API
* Une interface intuitive pour une prise en main rapide
* La possibilité d’étendre la plateforme avec des visualisations spécifiques
* Un cadre méthodologique pour publier des données sémantiques hautement réutilisables

### Concepts clés

Les trois concepts centraux sont : les **jeux de données**, les **services distants** et les **applications**. La finalité de ce service est de pouvoir utiliser facilement des **applications** adaptées à différents métiers et alimentées par une combinaison de **services distants** et de données propres à l'utilisateur.

Les **jeux de données** sont créés par les utilisateurs en chargeant des fichiers : le service stocke le fichier, l'analyse et déduit un schéma de données. Les données sont ensuite indexées suivant ce schéma et peuvent être requêtées au travers d'une API Web propre.  

L'utilisateur peut sémantiser les champs des **jeux de données**, par exemple en déterminant qu'une colonne contenant des données sur 5 chiffres est un champ de type Code Postal. Cette sémantisation permet 2 choses : les données peuvent être enrichies et servir à certains traitements si on dispose des **services distants** appropriés, et les données peuvent être utilisées dans des **applications** adaptées à leurs concepts.

En complément des **jeux de données** basés fichiers, Data Fair permet également de créer des **jeux de données** incrémentaux qui sont éditables en temps réel et des **jeux de données** virtuels qui sont des vues re-configurable d'un ou plusieurs **jeux de données**.

Les **services distants** mettent à disposition des fonctionnalités sous forme d'APIs Web externes à Data Fair qui respectent les règles d’interopérabilité d’OpenAPI 3.0.  
Un des objectifs de Data Fair est de permettre à des non informaticiens d'utiliser facilement des APIs tierces avec leurs propres données. Il y a 2 manières d'exploiter les **services distants** : l'utilisateur peut les utiliser pour ajouter en temps différé des colonnes à ses **jeux de données** (exemple géocodage) et les **applications** peuvent les exploiter en temps réel (exemple fonds de carte).

Les **services distants** connectés sur une instance Data Fair ne sont pas gérés par les utilisateurs directement, mais plutôt mis à leur disposition par les administrateurs.

Les **applications** permettent d'exploiter au maximum le potentiel des données des utilisateurs et des **services distants**. Quelques exemples: un jeu de données contenant des codes de commune peut être projeté sur une carte du découpage administratif français, un jeu de données contenant des codes de parcelles peut être projeté sur le cadastre, etc.
