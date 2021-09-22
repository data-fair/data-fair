---
title: Carto-stats
section: 5
subsection : 10
updated: 2021-09-20
description : Projeter vos données géolocalisées sur une carte.
published: false
application : https://koumoul.com/apps/carto-stats/0.6/
---

La visualisation **Carto-stats** permet de projeter des données géolocalisées sur une carte et de pouvoir créer des filtres dynamiques. Vous avez un exemple de cette visualisation sur notre [carte des accidents de vélos](https://opendata.koumoul.com/reuses/cartographie-des-accidents-de-velo/full).

Carto-stats permet de créer des filtres dynamiques et d'avoir les résultats des filtres sur la carte.  
En comparaison avec [Infos-localisation](./user-guide/infos-localisations), **Carto-stats** sera plus adaptée pour des données volumineuses et **Infos-localisations** sera plus adaptée à des données contenant des champs spéciaux tels que des liens de sites, des images, des descriptions, etc...


### Configuration
#### Les concepts

Pour configurer une visualisation **Carto-stats**, votre compte actif contient au mois un jeu de données avec [les concepts](./user-guide/concept)  **Latitude** et **Longitude** d'associés dans son schéma.

Une fois que vous avez mis à jour le schéma de vos données, vous pouvez visualiser un aperçu de vos données à l'aide du bouton **carte générique**. Vous pouvez ainsi vérifier que vos données sont correctement projetées sur une carte.

### Créer une visualisation Carto-stats

Pour réaliser la visualisation, cliquez sur **Visualisations** puis sur **Configurer une visualisation**.

1. Choisir l'application **Carto-stats**
2. Entrer le titre de la visualisation

Vous êtes redirigé vers la page de configuration de votre application avec ses différentes sections:

1. Informations
2. Boutons d'actions (plein écran, intégration sur un site, capture, ... )
3. Menu de configuration
4. Aperçu

![Page de configuration](./images/user-guide/carto-stats-config.jpg)

Le titre de la visualisation peut être modifié.  
Les **informations** vous donnent un résumé des caractéristiques de votre application.  

### Menu de configuration
Le menu de configuration est composé de trois sous-menus : **Source de données**, **Options de rendu** et **Navigation**.

#### Sources des données
Dans le menu **Sources de données**, vous pouvez choisir le jeu de données que vous voulez utiliser.

Remarque : Si votre fichier n'est pas disponible dans ce menu, vérifiez que vous avez bien mis à jour les [concepts](./user-guide/concept) **Latitude** et **Longitude** dans votre jeu de données.

Lorsque vous avez choisi un jeu de données compatible avec l'application **Carto-stats**, votre aperçu de carte s'affiche avec les points de vos données.

Vous pouvez configurer des filtres dynamiques, des filtres prédéfinis et un slider.

* Les filtres dynamiques vous permettent de choisir des champs qui seront disponibles aux utilisateurs de votre visualisation. Ces utilisateurs pourront utiliser les filtres pour restreindre le nombre de points sur la carte.
* Les filtres prédéfinis vous permettent de restreindre ou exclure des valeurs dans vos données. Les champs, ou valeurs, que vous configurez dans cette section ne seront pas disponibles dans votre visualisation.
* Le Slider vous permet de choisir un champ entier, tel qu'un champ **année**. L'utilisateur pourra choisir une valeur d'année sur le slider, les données seront filtrées sur cette année et affichées sur la carte.

#### Options de rendu

Dans le menu **Options de rendu**, vous pouvez personnaliser les fiches disponible sur les marqueurs et votre légende.

Le menu **Infobulle**, vous permet de sélectionner les différents champs à afficher sur les fiches de vos marqueurs.

La **Couleur par valeur d'un champ** défini la colonne utilisée pour votre légende. La palette vous permet de choisir un ensemble de couleurs qui seront associées à vos valeurs de légende.


#### Navigation

Dans le menu **Navigation**, vous pouvez cacher la barre de recherche et définir la position initiale de la carte.

Lorsque vous avez un aperçu qui vous satisfait, cliquez sur **Enregistrer** pour finaliser votre configuration.  
Vous pouvez ajouter une description en bas de page et rendre publique votre application.  
Votre application est configurée et vous pouvez la consulter à l'aide des boutons **consultation** ou **plein écran**.
