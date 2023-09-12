---
title: Bar chart race
section: 7
subsection : 1
updated: 2021-09-20
description : Vos données font la course à la première place
published: true
application : https://koumoul.com/apps/bar-chart-race/0.2/
---
La visualisation **bar chart race** permet de représenter des données de classement à travers le temps.

Vous avez un exemple de cette visualisation sur l'[évolution des salaires selon la région entre 1966 et 2010](https://opendata.koumoul.com/reuses/evolution-des-salaires-selon-la-region-entre-1966-et-2010).

## Prérequis

Les données que vous souhaitez projeter doivent posséder une colonne contenant une **temporalité**. Dans notre exemple de l'évolution des salaires, la temporalité est en année.


## Créer une visualisation Bar Chart Race

Pour configurer une visualisation **bar chart race**, cliquez sur **visualisations** dans la barre de navigation, puis sur **configurer une visualisation**.

1. Choisir l'application **bar chart race**&nbsp;;
2. Entrer le titre de sa visualisation.

<p>
</p>

Vous êtes redirigé vers la page de configuration de votre application avec ses différentes sections&nbsp;:

1. Informations&nbsp;;
2. Boutons d'action (plein écran, intégration sur un site, capture...)&nbsp;;
3. Menu de configuration&nbsp;;
4. Aperçu.

![Page de configuration](./images/user-guide-backoffice/barchart-config.jpg)

Le titre de la visualisation peut être modifié.  
Les **informations** vous donnent un résumé des caractéristiques de votre application.  

## Menu de configuration
Le menu de configuration est composé de trois sous-menus&nbsp;: **sources de données**, **préparation des données** et **présentation**.

### 1. Sources de données
Le sous-menu **sources de données** vous permet de choisir un jeu de données et de définir des **filtres prédéfinis**. Les **filtres prédéfinis** permettent de restreindre les données affichées dans l'application.  
Vous pouvez **restreindre à des valeurs** d'une colonne,  **restreindre à un intervalle de valeurs** d'une colonne ou **exclure des valeurs** d'une colonne.

### 2. Préparation des données
Le sous-menu **préparation des données** vous permet de définir quelles sont les colonnes que vous allez utiliser dans votre visualisation.
* **Calcul de la valeur** vous permet de compter les lignes, de faire une somme ou une moyenne sur les valeurs de la colonne&nbsp;;
* **Colonne** vous permet de choisir la colonne utilisée pour le **calcul de la valeur**&nbsp;;
* **Champ temporel** vous permet de choisir la colonne contenant les valeurs temporelles de vos données&nbsp;;
* **Champ de la valeur** vous permet de définir la colonne contenant les libellés utilisés sur chaque barre.

Une fois que toutes les options sont renseignées, vous avez un premier aperçu de votre visualisation.

![Premier aperçu](./images/user-guide-backoffice/barchart-preparation.gif)  
*Évolution du classement des équipes de Ligue 1 saison 2016-2017*

### 3. Présentation
Le sous-menu **présentation** vous permet de modifier le **nombre maximal de barres**, la **durée en secondes**, la **largeur des barres**, la **position des barres**, si la visualisation démarre automatiquement et les couleurs des barres.
