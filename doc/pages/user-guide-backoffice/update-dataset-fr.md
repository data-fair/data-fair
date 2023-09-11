---
title: Mise à jour d'un jeu de données
section: 4
subsection: 4
updated: 2021-09-20
description: Mettre à jour ses données
published: true
---

La mise à jour d'un jeu de données peut être réalisée manuellement sur la [page d'édition du jeu de données](./user-guide-backoffice/edition-dataset) ou peut être automatisé à l'aide des [traitements périodiques](./user-guide-backoffice/processing).

## Mise à jour manuelle

Avant de réaliser une mise à jour manuelle, vérifiez le schéma de vos données. Par exemple, si une visualisation utilise votre jeu de données, vérifiez que les colonnes qu'elle utilise sont toujours présentes dans le fichier que vous importez.

La mise à jour s'effectue à l'aide du bouton d'action **Mettre à jour** sur la [page d'édition du jeu de données](./user-guide-backoffice/edition-dataset) que vous souhaitez actualiser.  
Il suffira de choisir le nouveau fichier à charger sur votre ordinateur pour mettre à jour votre jeu de données sur Data&nbsp;Fair.


Le fichier va être soumis aux 6 étapes de traitement&nbsp;:

1. Le **chargement**, qui représente la barre de progression&nbsp;;
2. La **conversion** vers un format utilisé par la plateforme&nbsp;;
3. L'**analyse**, qui va déterminer le schéma du jeu de données&nbsp;;
4. L'**indexation**, qui va permettre d'accéder rapidement aux données du fichier&nbsp;;
5. L’**enrichissement**, qui va tenir compte des nouvelles valeurs du jeu de données et va effectuer un nouvel enrichissement en fonction des extensions ajoutées pour celui-ci&nbsp;;  
6. La **finalisation**, qui correspond aux derniers traitements avant que le jeu de données ne soit disponible.

<p>
</p>

![Visualisations Carto](./images/user-guide-backoffice/update.png)

Lorsque la finalisation est terminée, le jeu de données passe en état &laquo;&nbsp;brouillon&nbsp;&raquo;.  

Il est alors possible de vérifier la structure du schéma, d'ajouter des concepts aux **nouvelles colonnes** et de consulter les cent premières lignes du nouveau fichier.  
Les nouvelles colonnes seront affichées en rouge.  
Vous pouvez **annuler la mise à jour** du fichier si le schéma ne correspond pas à ce que vous désirez.

Après avoir réalisé les vérification de schéma et de données, le bouton **Valider le brouillon** permet de lancer la dernière étape de la mise à jour.

Le fichier sera à nouveau soumis aux six étapes de traitement.  
Lorsque la finalisation est terminée, le jeu de données passe en état &laquo;&nbsp;disponible&nbsp;&raquo;.  
Il peut alors être édité, enrichi et utilisé dans les visualisations.
