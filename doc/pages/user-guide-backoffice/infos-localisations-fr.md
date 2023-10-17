---
title: Infos localisations
section: 6
subsection : 5
updated: 2021-09-20
description : Projeter vos données géolocalisées sur une carte avec des marqueurs personnalisés
published: true
application : https://koumoul.com/apps/infos-loc/0.9/
---

La visualisation **infos localisations** permet de projeter des données géolocalisées sur une carte. Les coordonnées sont représentées par un marqueur cliquable qui permet d'afficher une fiche personnalisée sur chaque point.

## Prérequis
Les données que vous souhaitez projeter doivent contenir des latitudes et longitudes.  
La visualisation supporte les projections Lambert 93, Lambert II et le système WGS 84.

## Les concepts
Pour utiliser vos données dans une visualisation **infos localisations**, [les concepts](./user-guide-backoffice/concept) **latitude** et **longitude** doivent être associés au schéma du jeu de données que vous souhaitez utiliser.

Ensuite, associez le concept **libellé** à la colonne correspondante de votre jeu de données.  
Les valeurs de cette colonne seront utilisées en tant que titres de fiches dans votre carte **infos localisations**.

Vous pouvez associer d'autres concepts, tels que les **images**, les **descriptions** ou les **pages web** pour mieux renseigner vos données. Ces concepts seront utilisés par les fiches des marqueurs.  
Une fois que vous avez mis à jour le schéma de vos données, vous pouvez visualiser un aperçu de vos données à l'aide du bouton **carte générique**. Vous pouvez ainsi vérifier que vos données sont correctement projetées sur une carte.

## Créer une visualisation infos localisations
Pour réaliser votre visualisation, cliquez sur **visualisations** puis sur **configurer une visualisation**.

1. Choisir l'application **infos localisations**&nbsp;;
2. Entrer le titre de la visualisation.

Vous êtes redirigé vers la page de configuration de votre application avec ses différentes sections&nbsp;:

1. Informations&nbsp;;
2. Boutons d'action (plein écran, intégration sur un site, capture...)&nbsp;;
3. Menu de configuration&nbsp;;
4. Aperçu.

![Page de configuration](./images/user-guide-backoffice/infos-localisations-config.jpg)

Le titre de la visualisation peut être modifié.  
Les **informations** vous donnent un résumé des caractéristiques de votre application.  

## Menu de configuration
Le menu de configuration est composé de quatre sous-menus&nbsp;: **données**, **rendu**, **fiche** et **navigation**.

### 1. Données
Dans le menu **données**, choisissez le jeu de données que vous venez de préparer avec vos concepts.

**Remarque**&nbsp;: si votre jeu de données n'est pas disponible dans ce menu, vérifiez que vous avez bien mis à jour les [concepts](./user-guide-backoffice/concept) **latitude** et **longitude** dans votre jeu de données.

Lorsque vous avez choisi un jeu de données compatible avec l'application **infos localisations**, l'aperçu de carte s'affiche avec les points de vos données.


### 2. Rendu
Dans le menu **rendu**, vous pouvez choisir le **style de carte** qui vous convient le mieux.  
La **couleur par valeur d'un champ** définit la colonne utilisée pour les couleurs de votre légende. Vous pouvez définir les différentes couleurs que vous voulez associer à vos valeurs de légende.

Vous pouvez aussi choisir les **icônes par valeur d'un champ** pour définir la colonne utilisée pour les icônes dans votre légende. Vous pouvez définir des icônes différents pour chaque valeur d'une de vos colonnes

### 3. Fiche
Les fiches des marqueurs affichent certains concepts automatiquement. Par exemple, sur le [jeu de données des journées européennes du patrimoine](https://opendata.koumoul.com/reuses/carte-des-evenements-des-journees-europeennes-du-patrimoine-en-france-2019), les concepts **latitude**, **longitude**, **libellé**, **image**, **description** et **page web** sont associés aux colonnes correspondantes.

Dans le menu **fiche**, vous pouvez ajouter des **champs à utiliser** afin de les afficher dans chacune des fiches des marqueurs.  
Vous pouvez ajouter autant d'informations que vous le désirez sur une fiche, cependant, une fiche avec beaucoup d'informations sera trop grand pour être affichée.

### 4. Navigation
Dans le menu **navigation**, vous pouvez cacher la barre de recherche, activer ou désactiver la géolocalisation et définir la position initiale de la carte.

Lorsqu'un aperçu vous satisfait, cliquez sur **enregistrer** pour finaliser votre configuration.  
Vous pouvez ajouter une description en bas de page et rendre publique votre application.  
Votre application est configurée et vous pouvez la consulter à l'aide des boutons **consultation** ou **plein écran**.
