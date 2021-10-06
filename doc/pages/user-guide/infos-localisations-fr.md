---
title: Infos localisations
section: 5
subsection : 4
updated: 2021-09-20
description : Projeter vos données géolocalisées sur une carte.
published: false
application : https://koumoul.com/apps/infos-loc/0.9/
---

La visualisation **Infos-localisations** permet de projeter des données géolocalisées sur une carte. Les coordonnées sont représentées par un marqueur cliquable qui permet d'afficher une fiche personnalisée sur chaque point.

### Prérequis

Les données que vous souhaitez projeter doivent contenir des latitudes et longitudes.  

La visualisation supporte les projections Lambert 93, Lambert II et le système WGS 84.

### Configuration
#### Les concepts

Pour utiliser vos données dans une visualisation **Infos-localisations**, [les concepts](./user-guide/concept) **Latitude** et **Longitude** doivent être associés au schéma du jeu de données que vous souhaitez utiliser.

Ensuite, associez le concept **Libellé** à la colonne correspondante de votre jeu de données.  
Les valeurs de cette colonne seront utilisés en tant que titres de fiches dans votre carte **Infos-localisations**.

Vous pouvez associer d'autres concepts telles que les **images**, les **descriptions** ou les **page web** pour mieux renseigner vos données. Ces concepts seront utilisés par les fiches des marqueurs.

Une fois que vous avez mis à jour le schéma de vos données, vous pouvez visualiser un aperçu de vos données à l'aide du bouton **carte générique**. Vous pouvez ainsi vérifier que vos données sont correctement projetées sur une carte.

#### Créer une visualisation Infos-localisation

Pour réaliser votre visualisation, cliquez sur **Visualisations** puis sur **Configurer une visualisation**.


1. Choisir l'application **Infos-localisations**
2. Entrer le titre de la visualisation

Vous êtes redirigé vers la page de configuration de votre application avec ses différentes sections:

1. Informations
2. Boutons d'actions (plein écran, intégration sur un site, capture, ... )
3. Menu de configuration
4. Aperçu

![Page de configuration](./images/user-guide/infos-localisations-config.jpg)

Le titre de la visualisation peut être modifié.  
Les **informations** vous donnent un résumé des caractéristiques de votre application.  

### Menu de configuration
Le menu de configuration est composé de quatre sous-menus : **Données**, **Rendu**, **Fiche** et **Navigation**.

#### Données
Dans le menu **Données**, choisissez le jeu de données que vous venez de préparer avec vos concepts.

Remarque : Si votre jeu de données n'est pas disponible dans ce menu, vérifiez que vous avez bien mis à jour les [concepts](./user-guide/concept) **Latitude** et **Longitude** dans votre jeu de données.

Lorsque vous avez choisi un jeu de données compatible avec l'application **Infos-localisations**, l'aperçu de carte s'affiche avec les points de vos données.


#### Rendu
Dans le menu **Rendu**, choisissez le **Style de carte** qui vous convient le mieux.  
La **Couleur par valeur d'un champ** défini la colonne utilisée pour les couleurs de votre légende. Choisissez les différentes couleurs que vous voulez associer à vos valeurs de légende.

Vous pouvez aussi choisir les **Icones par valeur d'un champ** pour définir la colonne utilisée pour les icones dans votre légende. Vous pouvez définir des icones différents pour chaque valeur d'une de vos colonnes


#### Fiche

Les fiches des marqueurs affichent certains concepts automatiquement. Par exemple, sur le [jeu de données des journées européennes du patrimoine](https://opendata.koumoul.com/reuses/carte-des-evenements-des-journees-europeennes-du-patrimoine-en-france-2019), les concepts **Latitude**, **Longitude**, **Libellé**, **Image**, **Description** et **Page Web** sont associés aux colonnes correspondantes.

Dans le menu **Fiche**, vous pouvez ajouter des **Champs à utiliser** afin de les afficher dans chacune des fiches des marqueurs.  
Vous pouvez ajouter autant d'informations que vous le désirez sur une fiche, cependant, une fiche avec beaucoup d'informations sera trop grand pour être affichée.

#### Navigation
Dans le menu **Navigation**, vous pouvez cacher la barre de recherche, activer ou désactiver la géolocalisation et définir la position initiale de la carte.

Lorsque vous avez un aperçu qui vous satisfait, cliquez sur **Enregistrer** pour finaliser votre configuration.  
Vous pouvez ajouter une description en bas de page et rendre publique votre application.  
Votre application est configurée et vous pouvez la consulter à l'aide des boutons **consultation** ou **plein écran**.
