---
title: Divisions administratives
section: 6
subsection : 2
updated: 2021-09-20
description : Créer facilement des cartes administratives interactives.
published: false
application : https://koumoul.com/apps/data-fair-admin-divs/0.2/
---


La visualisation **Divisions administratives** permet de réaliser des cartes administratives, thématiques ou choroplèthes.  
Il s'agit de projeter des données statistiques sur un ensemble de territoires. Il est possible de naviguer entre les niveaux de territoires à l'aide du zoom. Un clic sur un territoire vous permet d'accéder aux données.  
Vous avez un exemple de cette visualisation sur notre [carte des résultats aux élections européennes de 2019](https://opendata.koumoul.com/reuses/resultats-aux-elections-europeennes-2019/full).

**Divisions administratives** permet de créer des cartes aux niveaux d'IRIS, EPCI, des communes, des départements et/ou des régions.  


### Configuration
#### Les concepts

Pour configurer une visualisation **Divisions administratives**, votre compte actif contient au moins un jeu de données avec des [concepts](./user-guide/concept) **Code IRIS**, **Code EPCI**, **Code Commune**, **Code département** et/ou **Code région**.

#### Créer une visualisation Divisions administratives

Pour réaliser votre visualisation, cliquez sur **Visualisations** puis sur **Configurer une visualisation**.

1. Choisir l'application **Divisions administratives**
2. Entrer le titre de la visualisation

<p>
</p>

Vous êtes redirigé vers la page de configuration de votre application avec ses différentes sections:

1. Informations
2. Boutons d'actions (plein écran, intégration sur un site, capture, ... )
3. Menu de configuration
4. Aperçu

![Page de configuration](./images/user-guide/div-admin-config.jpg)

Le titre de la visualisation peut être modifié.  
Les **informations** vous donnent un résumé des caractéristiques de votre application.  

#### Menu de configuration
Le menu de configuration est composé de quatre sous-menus : **Données**, **Métrique**, **Rendu** et **Navigation**.

#### Données
Dans le menu **Données**, vous pouvez choisir le jeu de données que vous voulez utiliser.  
Lorsque vous avez choisi un jeu de données compatible avec l'application **Divisions administratives**, un aperçu de carte s'affiche.

##### Métrique

Dans le menu **Métrique**, la section **Numérateur** vous permet de définir la valeur de votre jeu de données que vous voulez afficher sur votre carte. Il est possible de réaliser un décompte, une somme ou une moyenne sur les valeurs de ce champs.

Le champ **Dénominateur** vous permet de réaliser un ratio. Par exemple, si vous avez les populations des territoires dans une colonne de votre jeu de données, vous pouvez avoir la valeur renseignée dans le **Numérateur** divisée par la population pour avoir le ratio par habitant.

##### Rendu

Le menu **Rendu** permet de personnaliser votre visualisation.

La **Palette** permet de choisir un ensemble de couleurs qui seront associées aux valeurs de vos données. Vous pouvez inverser les couleurs de la palette et définir une couleur par défaut pour vos valeurs.

Le **Calcul des intervalles** permet de définir le type des intervalles que vous souhaitez afficher. Il est possible d'avoir des intervalles de même taille, des intervalles à partir de quantiles ou de les définir soit même.

##### Navigation

Le menu **Navigation** permet de définir la position initiale de la carte.

Lorsque vous avez un aperçu qui vous satisfait, cliquez sur **Enregistrer** pour finaliser votre configuration.  
Vous pouvez ajouter une description en bas de page et rendre publique votre application.  
Votre application est configurée et vous pouvez la consulter à l'aide des boutons **consultation** ou **plein écran**.
