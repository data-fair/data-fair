---
title: Ajouter un jeu de données
section: 4
subsection: 2
updated: 2021-09-20
description: Ajouter un dataset
published: true
---

Vous pouvez créer un jeu de données sur la [page d'accueil](./user-guide-backoffice/dashboard) ou sur la [page des jeux de données](./user-guide-backoffice/datasets).

Il existe trois jeux de données différents sur Data&nbsp;Fair&nbsp;:
1. L'import d'un fichier de votre ordinateur&nbsp;;
2. Un jeu éditable&nbsp;;  
3. Jeu de métadonnées seules&nbsp;;
4. Un jeu virtuel.

## Import d'un fichier

L'import de fichiers est réalisable à l'aide des différents boutons d'action **Créer un jeu de données** disponibles dans Data&nbsp;Fair.  
Le déroulé d'import d'un fichier contient un rappel des [formats](./user-guide-backoffice/file-formats) pris en charge par Data&nbsp;Fair.  
Il est possible d'ajouter des [pièces jointes](./user-guide-backoffice/attachements) dans une archive ZIP qui sera attachée aux lignes du jeu de données.

Une fois le fichier chargé, vous êtes redirigé vers la page d'édition du jeu de données. Data&nbsp;Fair continue le traitement du fichier sur la page d'édition du jeu de données.  

Pour qu'il soit utilisable, l'étape&nbsp;6 de finalisation doit être validée&nbsp;:  

1. Le **chargement**&nbsp;;
2. La **conversion** vers un format utilisé par la plateforme en interne&nbsp;;
3. L'**analyse**, qui va déterminer le schéma du jeu de données&nbsp;;
4. L'**indexation**, qui va permettre de trouver et d'accéder rapidement aux données du fichier&nbsp;;
5. L’**enrichissement**, qui complète les données du fichier avec des données externes&nbsp;;
6. La **finalisation**, qui correspond aux derniers traitements avant que le jeu de données ne soit disponible.

<p>
</p>

Lorsque la finalisation est terminée, le jeu de données passe en état &laquo;&nbsp;disponible&nbsp;&raquo;. Il peut alors être [édité](./user-guide-backoffice/edition-dataset), enrichi et utilisé dans les différentes visualisations.  
La plupart des visualisations utilisent [des concepts](./user-guide-backoffice/concept), tels que les concepts **Latitude** et **Longitude** pour une visualisation cartographique.


## Jeu de métadonnées seules

Un jeu de métadonnées ne contient pas de données.  
Il peut être utilisé pour contenir un ensemble de fichiers, tels que des fichiers PDF, images ou vidéos.  

Les images peuvent ensuite être utilisées sur vos portails, en tant que vignettes pour les jeux de données ou utilisées à l'aide de leurs liens.

Les descriptions des pièces&nbsp;jointes peuvent contenir du texte riche au format Markdown pour mieux le formater.


## Jeu éditable

Un **jeu de données éditable** est un jeu de données vide, il est créé sans fichier de données.  
Vous allez pouvoir définir les colonnes du jeu de données puis ajouter les lignes à partir de Data&nbsp;Fair.

Chaque colonne est caractérisée par son libellé et son type.
Le schéma de votre **jeu de données éditable** est défini lorsque vous avez renseigné l'ensemble des colonnes de votre jeu de données.

![Choix de l'application](./images/user-guide-backoffice/import-schema-editable.jpg)  
*Ajoutez des colonnes et créez votre propre jeu de données*

Vous pouvez ensuite ajouter des lignes à votre jeu de données, que ce soit par un formulaire sur une page de votre site, de votre portail, ou par la section **Données** dans l'édition du jeu de données.

![Formulaire](./images/user-guide-backoffice/import-formulaire.jpg)  
*Formulaire de retours pour les visiteurs de portail*

## Jeu virtuel

Un **jeu virtuel** est une vue d'un ou plusieurs jeux de données (jeux&nbsp;enfants).  
Il permet de présenter un sous-ensemble d'un jeu de données ou de concaténer des jeux de données qui possèdent le même schéma.

Il est ainsi possible de créer une vue de sa commune ou de son département sur un jeu de données de référence national sans devoir copier les données.  
Comme il s'agit d'une vue, lorsque le jeu de référence sera mis à jour, le jeu virtuel sur la commune (ou le département) sera aussi actualisé. Les données restent ainsi toujours à jour par rapport au jeu de données de référence.

![Jeu virtuel](./images/user-guide-backoffice/import-virtuel-valeur.jpg)  
*Filtrez ou agrégez les valeurs de vos jeux de données*
