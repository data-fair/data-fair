---
title: Bar Chart Race
section: 7
subsection : 1
updated: 2021-09-20
description : Vos données font la course à la première place
published: true
application : https://koumoul.com/apps/bar-chart-race/0.2/
---
La visualisation **Bar Chart Race** permet de représenter des données de classement à travers le temps.

Vous avez un exemple de cette visualisation sur l'[évolution des salaires selon la région entre 1966 et 2010](https://opendata.koumoul.com/reuses/evolution-des-salaires-selon-la-region-entre-1966-et-2010).

## Prérequis

Les données que vous souhaitez projeter doivent posséder une colonne contenant une temporalité. Dans notre exemple de l'évolution des salaires, la temporalité est en année.


## Créer une visualisation Bar Chart Race

Pour configurer une visualisation **Bar Chart Bace**, cliquez sur **Visualisations** dans la barre de navigation, puis sur **Configurer une visualisation**.

1. Choisir l'application **Bar Chart Race**
2. Entrer le titre de sa visualisation

<p>
</p>

Vous êtes redirigé vers la page de configuration de votre application avec ses différentes sections:

1. Informations
2. Boutons d'actions (plein écran, intégration sur un site, capture, ... )
3. Menu de configuration
4. Aperçu

![Page de configuration](./images/user-guide-backoffice/barchart-config.jpg)

Le titre de la visualisation peut être modifié.  
Les **informations** vous donnent un résumé des caractéristiques de votre application.  

## Menu de configuration
Le menu de configuration est composé de trois sous-menus : **Sources de données**, **Préparation des données** et **Présentation**.

### 1.Sources de données
Le sous-menu **Sources de données** vous permet de choisir un jeu de données et de définir des **Filtres prédéfinis**. Les **Filtres prédéfinis** permettent de restreindre les données affichées dans l'application.  
Vous pouvez **Restreindre à des valeurs** d'une colonne,  **Restreindre à un intervalle de valeurs** d'une colonne ou **Exclure des valeurs** d'une colonne.

### 2.Préparation des données
Le sous-menu **Préparation des données** vous permet de définir quelles sont les colonnes que vous allez utiliser dans votre visualisation.
* **Calcul de la valeur** vous permet de compter les lignes, de faire une somme ou une moyenne sur les valeurs de la colonne.
* **Colonne** vous permet de choisir la colonne utilisée pour le **Calcul de la valeur**.
* **Champ temporel** vous permet de choisir la colonne contenant les valeurs temporelles de vos données.
* **Champ de la valeur** vous permet de définir la colonne contenant les libellés utilisés sur chaque barre.

Une fois que toutes les options sont renseignées, vous avez un premier aperçu de votre visualisation.

![Premier aperçu](./images/user-guide-backoffice/barchart-preparation.gif)  
*Evolution du classement des équipes de Ligue 1 saison 2016-2017*

### 3.Présentation
Le sous-menu **Présentation** vous permet de modifier le **Nombre maximal de barres**, la **Durée en secondes**, la **Largeur des barres**, la **Position des barres**, si la visualisation démarre automatiquement et les couleurs des barres.
