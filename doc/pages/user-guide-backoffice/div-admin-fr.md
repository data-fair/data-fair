---
title: Divisions administratives
section: 6
subsection : 2
updated: 2021-09-20
description : Créer facilement des cartes administratives interactives.
published: true
application : https://koumoul.com/apps/data-fair-admin-divs/0.2/
---


La visualisation **divisions administratives** permet de réaliser des cartes administratives, thématiques ou choroplèthes.  
Il s'agit de projeter des données statistiques sur un ensemble de territoires. Il est possible de naviguer entre les niveaux de territoires à l'aide du zoom. Un clic sur un territoire vous permet d'accéder aux données.  
Vous avez un exemple de cette visualisation sur notre [carte des résultats aux élections européennes de 2019](https://opendata.koumoul.com/reuses/resultats-aux-elections-europeennes-2019/full).

**Divisions administratives** permet de créer des cartes aux niveaux d'IRIS, des EPCI, des communes, des départements et/ou des régions.  

## Les concepts

Pour configurer une visualisation **divisions administratives**, votre compte actif contient au moins un jeu de données avec des [concepts](./user-guide-backoffice/concept) **code IRIS**, **code EPCI**, **code commune**, **code département** et/ou **code région**.

## Créer une visualisation Divisions administratives

Pour réaliser votre visualisation, cliquez sur **visualisations** puis sur **configurer une visualisation**.

1. Choisir l'application **divisions administratives**&nbsp;;
2. Entrer le titre de la visualisation.

<p>
</p>

Vous êtes redirigé vers la page de configuration de votre application avec ses différentes sections&nbsp;:

1. Informations&nbsp;;
2. Boutons d'action (plein écran, intégration sur un site, capture...)&nbsp;;
3. Menu de configuration&nbsp;;
4. Aperçu.

![Page de configuration](./images/user-guide-backoffice/div-admin-config.jpg)

Le titre de la visualisation peut être modifié.  
Les **informations** vous donnent un résumé des caractéristiques de votre application.  

## Menu de configuration
Le menu de configuration est composé de quatre sous-menus&nbsp;: **données**, **métrique**, **rendu** et **navigation**.

### 1. Données
Dans le menu **données**, vous pouvez choisir le jeu de données que vous voulez utiliser.  
Lorsque vous avez choisi un jeu de données compatible avec l'application **divisions administratives**, un aperçu de carte s'affiche.

### 2. Métrique

Dans le menu **métrique**, la section **numérateur** vous permet de définir la valeur du jeu de données que vous voulez afficher sur votre carte. Il est possible de réaliser un décompte, une somme ou une moyenne sur les valeurs de ce champ.

Le champ **dénominateur** vous permet de réaliser un ratio. Par exemple, si vous avez les populations des territoires dans une colonne de votre jeu de données, la valeur renseignée dans le **numérateur** peut être divisée par la population pour avoir le ratio par habitant.

### 3. Rendu

Le menu **rendu** permet de personnaliser votre visualisation.

La **palette** permet de choisir un ensemble de couleurs qui seront associées aux valeurs de vos données. Vous pouvez inverser les couleurs de la palette et définir une couleur par défaut pour vos valeurs.

Le **calcul des intervalles** permet de définir le type d'intervalles que vous souhaitez afficher. Il est possible d'avoir des intervalles de même taille, des intervalles à partir de quantiles ou de les définir soi-même.

### 4. Navigation

Le menu **navigation** permet de définir la position initiale de la carte.

Lorsqu'un aperçu vous satisfait, cliquez sur **enregistrer** pour finaliser votre configuration.  
Vous pouvez ajouter une description en bas de page et rendre publique votre application.  
Votre application est configurée et vous pouvez la consulter à l'aide des boutons **consultation** ou **plein écran**.
