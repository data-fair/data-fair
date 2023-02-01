---
title: Géo Shapes
section: 6
subsection : 3
updated: 2021-09-20
description : Visualiser des données géométriques sur une carte.
published: true
application : https://koumoul.com/apps/data-fair-geo-shapes/0.1/
---

La visualisation **Géo Shapes** permet de visualiser des données géométriques sur une carte. Il est ainsi possible de visualiser des données telles que le zonage du PLU ou des réseaux énergétiques.  
Vous avez un exemple de cette visualisation sur la [carte des zones du PLU d'Angers Loire Métropole](https://opendata.koumoul.com/reuses/plu-zone-urba-angers-loire-metropole/full).  
Il est possible de cliquer sur chaque zone pour obtenir plus de détails ou de cliquer sur un type de zone dans la légende pour filtrer par type de zone.

## Les concepts

Pour configurer une visualisation **Géo Shapes**, votre compte actif contient au moins un jeu de données avec le [concept](./user-guide-backoffice/concept)  **Géometrie GeoJSON** pour pouvoir projeter vos données sur la visualisation.  
Une fois que vous avez mis à jour le schéma de vos données, vous pouvez visualiser un aperçu de vos données à l'aide du bouton **carte générique**. Vous pouvez ainsi vérifier que vos données sont correctement projetées sur une carte.

## Créer une visualisation Géo Shapes

Pour réaliser votre visualisation, cliquez sur **Visualisations** puis sur **Configurer une visualisation**.

1. Choisir l'application **Géo Shapes**
2. Entrer le titre de la visualisation

<p>
</p>

Vous êtes redirigé vers la page de configuration de votre application avec ses différentes sections:

1. Informations
2. Boutons d'actions (plein écran, intégration sur un site, capture, ... )
3. Menu de configuration
4. Aperçu

![Page de configuration](./images/user-guide-backoffice/geo-shapes-config.jpg)

Le titre de la visualisation peut être modifié.  
Les **informations** vous donnent un résumé des caractéristiques de votre application.  

## Menu de configuration
Le menu de configuration est composé de trois sous-menus : **Source de données**, **Option de rendu** et **Navigation**.

### 1.Source de données
Dans le menu **Source de données**, vous pouvez choisir le jeu de données que vous voulez utiliser.  
Lorsque vous avez choisi un jeu de données compatible avec l'application **Géo Shapes**, un aperçu de carte s'affiche.

### 2.Option de rendu

Dans le menu **Option de rendu**, la **Couleur par valeur d'un champ** défini la colonne utilisée pour votre légende. Vous pouvez définir chaque couleur par valeur de votre légende en cliquant sur le cercle **color**. Vous pouvez modifier l'ordre avec un glisser-déposer sur le menu hamburger de la valeur de légende à réordonner.  
Le **Détails des champs** permet de choisir les champs à afficher lorsqu'un utilisateur cliquera sur une forme géométrique. Sans aucune valeur dans cette section, le panneau latéral ne sera utile que pour la navigation.  
Le **style de carte** permet de modifier votre fond de carte. Vous pouvez ainsi personnaliser le fond de carte de votre application pour avoir le meilleur rendu.

### 3.Navigation

Le menu **Navigation** permet d'activer la géolocalisation et de définir la position initiale de la carte.

Lorsque vous avez un aperçu qui vous satisfait, cliquez sur **Enregistrer** pour finaliser votre configuration.  
Vous pouvez ajouter une description en bas de page et rendre publique votre application.  
Votre application est configurée et vous pouvez la consulter à l'aide des boutons **consultation** ou **plein écran**.
