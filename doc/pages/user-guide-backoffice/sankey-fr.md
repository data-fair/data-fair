---
title: Diagramme de Sankey
section: 7
subsection : 4
updated: 2021-09-20
description : Visualiser vos flux d'informations.
published: true
application : https://koumoul.com/apps/sankey/0.5/
---

Un diagramme de **Sankey** permet de visualiser des données de flux et d'avoir les informations de chaque flux en un clic.

## Prérequis

Pour configurer une visualisation **Sankey**, votre compte actif doit posséder un jeu de données avec une colonne contenant des nombres (**integer**) et deux colonnes contenant des chaînes de caractères (**string**).

![Deux colonnes string et une colonne integer](./images/user-guide-backoffice/sankey-type.jpg)  
*Jeu de données avec les colonnes de type string, Pays et Candidats, et une colonne de type integer, Nombre de voix*  

Les valeurs des deux colonnes de chaines de caractères, **pays** et **candidats**, sont en relation avec les valeurs numériques de la colonne des **nombres de voix**.


## Créer un diagramme de Sankey

Pour réaliser la visualisation, cliquez sur **visualisations** puis sur **configurer une visualisation**.


1. Choisir l'application **diagramme de Sankey**&nbsp;;
2. Entrer le titre de la visualisation.
<p>
</p>

Vous êtes redirigé vers la page de configuration de votre application avec ses différentes sections&nbsp;:

1. Informations&nbsp;;
2. Boutons d'action (plein écran, intégration sur un site, capture...)&nbsp;;
3. Menu de configuration&nbsp;;
4. Aperçu.

![Page de configuration](./images/user-guide-backoffice/sankey-config.jpg)

Le titre de la visualisation peut être modifié.  
1. Les **informations** vous donnent un résumé des caractéristiques de votre application.  
2. Les boutons d'action vous permettent d'importer l'application sur un autre site, de la dupliquer, de la supprimer et d'y accéder en plein écran.

## Menu de configuration
Le menu de configuration est composé de trois sous-menus&nbsp;: **sources de données**, **préparation des données** et **présentation**.

### 1. Sources de données

Dans le menu **sources de données**, vous allez choisir le jeu de données que vous souhaitez utiliser.

### 2. Préparation des données  

Le menu **préparation des données** permet de renseigner les colonnes que vous souhaitez afficher et d'avoir votre premier rendu.

**Calcul de la valeur** permet de compter le nombre de lignes non nulles d'une colonne pour qu'elle soit représentée ou bien de réaliser les sommes des valeurs d'une colonne. Dans notre image nous avons réalisé la somme de valeurs pour la colonne **nombre de voix**.  
**Source** permet de définir les éléments placés sur la gauche du diagramme de Sankey.  
**Cible** permet de définir les éléments placés sur la droite du diagramme de Sankey.


### 3. Présentation

Dans le menu **présentation**, vous pouvez paramétrer les **sources** et les **cibles** pour définir les éléments que vous voulez afficher sur votre diagramme de Sankey.

**Nombre maximal de sources** permet d'avoir plus ou moins d'éléments. Le groupe **autres** comprend l'ensemble des éléments des données qui ne sont pas affichés individuellement.  
**Tri** permet de trier les éléments par ordre alphabétique ou bien par ordre décroissant. Si vous avez une catégorie **autres**, elle sera placée en bas du diagramme lors d'un tri.  
**Type de la palette de couleurs** et **nom de la palette de couleurs** permettent de choisir la couleur des éléments.


Lorsque vous avez un aperçu qui vous satisfait, cliquez sur **enregistrer** pour finaliser votre configuration.  
Vous pouvez ajouter une description en bas de page et rendre publique votre application.  
Votre application est configurée et vous pouvez la consulter à l'aide des boutons **consultation** ou **plein écran**.
