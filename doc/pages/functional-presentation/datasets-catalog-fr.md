---
title: Catalogue des données
section: 2
subsection : 2
updated: 2020-12-09
description : Catalogue des données
published: true
---

Le catalogue de données est un moteur de recherche permettant d’**accéder rapidement** aux jeux de données susceptibles d'intéresser l'utilisateur. Outre le champ de recherche textuelle, il est possible d'accéder aux jeux de données par thématique ou par concept présent dans les données. Il est par exemple possible de lister tous les jeux de données géographiques en filtrant par concept *Latitude*, ou toutes les données liées à des entreprises en filtrant par *SIREN*.

<img src="./images/functional-presentation/search.jpg"
     height="100" style="margin:15px auto;" alt="capture d'écran de la page de catalogue de données d'un portail"/>


La liste des jeux de données est parcourue au moyen d’un mécanisme de scroll infini, aussi bien adapté à une utilisation **bureautique ou mobile**. Il est également possible de trier les résultats suivant différent critères (Alphabétique, date de création, ...). La liste des résultats obtenus peut être exportée au format CSV en un clic.

Les résultats sur cette page sont présentés sous forme de vignettes qui affichent des informations comme le titre du jeu de données, sa date de mise à jour ou les thématiques qui lui sont associée. Un bout de la description est également affiché, mais il peut être remplacé par une image pour faire un catalogue plus "visuel".

En plus de permettre de naviguer vers la page de détails d'un jeu de données, les vignettes présentent des boutons d'action permettant de :
* Visualiser les données avec une **vue tabulaire** dans laquelle on peut trier les colonnes, paginer, effectuer des recherches fulltext et télécharger les données filtrées
* Eventuellement visualiser les données avec une **vue cartographique** quand les données le permettent.
* Accéder à la **documentation interactive de l’API**
* Consulter le **schéma des données**

<img src="./images/functional-presentation/home-dataset.jpg"
     height="140" style="margin:15px auto;" alt="capture d'écran de vignettes de jeux de données"/>

Le catalogue présente les jeux de données que l'utilisateur a le droit de voir. Si il n'est pas connecté, il ne verra que les jeux en opendata, si il est connecté et membre de l'organisation propriétaire du portail, il pourra en plus voir des jeux de données privés.
