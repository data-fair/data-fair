---
title: Carto stats
section: 6
subsection : 1
updated: 2021-09-20
description : Projeter vos données géolocalisées sur une carte
published: true
application : https://koumoul.com/apps/carto-stats/0.6/
---

La visualisation **carto stats** permet de projeter des données géolocalisées sur une carte et de pouvoir créer des filtres dynamiques.  
Vous pouvez trouver un exemple de cette visualisation sur notre [carte des accidents de vélos](https://opendata.koumoul.com/reuses/cartographie-des-accidents-de-velo/full).

**Carto stats** permet de créer des filtres dynamiques et d'avoir les résultats de ces filtres sur la carte.  
En comparaison avec [Infos-localisation](./user-guide-backoffice/infos-localisations), **carto stats** sera plus adaptée pour des données volumineuses et **infos localisations** à des données contenant des champs spéciaux tels que des liens de sites, des images, des descriptions, etc.


## Les concepts

Pour configurer une visualisation **carto stats**, votre compte actif contient au moins un jeu de données avec [les concepts](./user-guide-backoffice/concept) **latitude** et **longitude** associés dans son schéma.  
Une fois que vous avez mis à jour le schéma de vos données, vous pouvez visualiser un aperçu de vos données à l'aide de la **carte générique**. Vous pouvez ainsi vérifier que vos données sont correctement projetées sur une carte.

## Créer une visualisation carto stats

Pour réaliser la visualisation, cliquez sur **Visualisations** puis sur **Configurer une visualisation**.

1. Choisir l'application **carto stats**&nbsp;;
2. Entrer le titre de la visualisation.

<p>
</p>

Vous êtes redirigé vers la page de configuration de votre application avec ses différentes sections&nbsp;:

1. Informations&nbsp;;
2. Boutons d'actions (plein écran, intégration sur un site, capture...)&nbsp;;
3. Menu de configuration&nbsp;;
4. Aperçu.

![Page de configuration](./images/user-guide-backoffice/carto-stats-config.jpg)

Le titre de la visualisation peut être modifié.  
Les **informations** vous donnent un résumé des caractéristiques de votre application.  

## Menu de configuration
Le menu de configuration est composé de trois sous-menus&nbsp;: **Source de données**, **Options de rendu** et **Navigation**.

### 1. Sources des données
Dans le menu **sources de données**, vous pouvez choisir le jeu de données que vous voulez utiliser.

**Remarque**&nbsp;: si votre fichier n'est pas disponible dans ce menu, vérifiez que vous avez bien mis à jour les [concepts](./user-guide-backoffice/concept) **latitude** et **longitude** dans votre jeu de données.

Lorsque vous avez choisi un jeu de données compatible avec l'application **carto stats**, votre aperçu de carte s'affiche avec les points de vos données.  
Vous pouvez configurer des filtres dynamiques, des filtres prédéfinis et un slider.

* Les **filtres dynamiques** vous permettent de choisir des champs qui seront disponibles pour les utilisateurs de votre visualisation. Ils pourront alors utiliser les filtres pour restreindre le nombre de points sur la carte.
* Les **filtres prédéfinis** vous permettent de restreindre ou exclure des valeurs dans vos données. Les champs, ou valeurs, que vous configurez dans cette section ne seront pas disponibles dans votre visualisation.
* Le **slider** vous permet de choisir un champ entier, tel qu'un champ **année**. L'utilisateur pourra choisir une valeur d'année sur le slider, les données seront filtrées sur cette année et affichées sur la carte.

### 2. Options de rendu

Dans le menu **options de rendu**, vous pouvez personnaliser les fiches disponibles sur les marqueurs et votre légende.  
Le menu **infobulle** vous permet de sélectionner les différents champs à afficher sur les fiches de vos marqueurs.  
La **couleur par valeur d'un champ** définit la colonne utilisée pour votre légende. La palette vous permet de choisir un ensemble de couleurs qui seront associées à vos valeurs de légende.

### 3.Navigation

Dans le menu **navigation**, vous pouvez cacher la barre de recherche et définir la position initiale de la carte.

Lorsque vous avez un aperçu qui vous satisfait, cliquez sur **enregistrer** pour finaliser votre configuration.  
Vous pouvez ajouter une description en bas de page et rendre publique votre application.  
Votre application est configurée et vous pouvez la consulter à l'aide des boutons **consultation** ou **plein écran**.
