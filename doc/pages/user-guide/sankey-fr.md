---
title: Diagramme de Sankey
section: 7
subsection : 4
updated: 2021-09-20
description : Visualiser vos flux d'informations.
published: false
application : https://koumoul.com/apps/sankey/0.5/
---

Un diagramme de **Sankey** permet de visualiser des données de flux et d'avoir les informations de chaque flux en un clic.

### Prérequis

Pour configurer une visualisation **Sankey**, votre compte actif doit posséder un jeu de données avec une colonne contenant des nombres (**integer**) et deux colonnes contenant des chaines de caractères (**string**).

![Deux colonnes string et une colonne integer](./images/user-guide/sankey-type.jpg)  
*Jeu de données avec les colonnes de type string, Pays et Candidats, et une colonne de type integer, Nombre_de_voix*  

Les valeurs des deux colonnes de chaines de caractères, **Pays** et **Candidats**, sont en relations avec les valeurs numériques de la colonne des **Nombre_de_voix**.

### Configuration
#### Créer un diagramme de Sankey

Pour réaliser la visualisation, cliquez sur **Visualisations** puis sur **Configurer une visualisation**.


1. Choisir l'application **Diagramme de Sankey**
2. Entrer le titre de la visualisation
<p>
</p>

Vous êtes redirigé vers la page de configuration de votre application avec ses différentes sections:

1. Informations
2. Boutons d'actions (plein écran, intégration sur un site, capture, ... )
3. Menu de configuration
4. Aperçu

![Page de configuration](./images/user-guide/sankey-config.jpg)

Le titre de la visualisation peut être modifié.  
1. Les **informations** vous donnent un résumé des caractéristiques de votre application.  
2. Les boutons d'actions vous permettent d'importer l'application sur un autre site, de dupliquer l'application, de la supprimer et d'accéder à l'application en plein écran.

#### Menu de configuration
Le menu de configuration est composé de trois sous-menus : **Sources de données**, **Préparation des données** et **Présentation**.

##### Sources de données

Dans le menu **Sources de données**, vous allez choisir le jeu de données que vous souhaitez utiliser.

##### Préparation des données  

Le menu **Préparation des données** permet de renseigner les colonnes que vous souhaitez afficher et d'avoir votre premier rendu.

**Calcul de la valeur** permet de compter le nombre de lignes non nulles d'une colonne pour qu'elle soit représentée ou bien de réaliser les sommes des valeurs d'une colonne. Dans notre image nous avons réaliser la sommes de valeurs pour la colonne **Nombre de voix**.  
**Source** permet de définir les éléments placés sur la gauche du diagramme de Sankey.  
**Cible** permet de définir les éléments placés sur la droite du diagramme de Sankey.


##### Présentation

Dans le menu **Présentation**, vous pouvez paramétrer les **Sources** et les **Cibles** pour définir les éléments que vous voulez afficher sur votre diagramme de Sankey.

**Nombre maximal de sources** permet d'avoir plus ou moins d'éléments. Le groupe **Autres** comprend l'ensemble des éléments des données qui ne sont pas affichés individuellement.  
**Tri** permet de trier les éléments par ordre alphabétique ou bien par ordre décroissant. Si vous avez une catégorie autres, elle sera placée en bas du diagramme lors d'un tri.  
**Type de la palette de couleurs** et **Nom de la palette de couleurs** permettent de choisir la couleur des éléments.


Lorsque vous avez un aperçu qui vous satisfait, cliquez sur **Enregistrer** pour finaliser votre configuration.  
Vous pouvez ajouter une description en bas de page et rendre publique votre application.  
Votre application est configurée et vous pouvez la consulter à l'aide des boutons **consultation** ou **plein écran**.
