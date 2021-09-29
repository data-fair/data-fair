---
title: Mise à jour d'un jeu de données
section: 4
subsection : 4
updated: 2021-09-20
description : Mettre à jour ses données
published: false
---

La mise à jour d'un jeu de données d'un jeu de données peut être réalisée manuellement sur la [page d'édition du jeu de données](./user-guide/edition-dataset) ou automatisé à l'aide des [traitements périodiques](./user-guide/processing).

### Mise à jour manuelle

Avant de réaliser une mise à jour manuelle, vérifiez le schéma de vos données. Par exemple, si une visualisation utilise votre jeu de données, vérifiez que les colonnes utilisées par la visualisation sont toujours présentes dans le fichier que vous importez.

La mise à jour s'effectue à l'aide du bouton d'action **Mettre à jour** sur la [page d'édition du jeu de données](./user-guide/edition-dataset) que vous souhaitez mettre à jour.  
Il suffira de choisir le nouveau fichier à charger sur votre ordinateur pour mettre à jour votre jeu de données sur Data Fair.

Le fichier va être soumis aux 6 étapes de traitement :

1. Le **chargement**, qui représente la barre de progression.
2. La **conversion** vers un format utilisé par la plateforme.
3. L'**analyse**, qui va déterminer le schéma du jeu de données.
4. L'**indexation**, qui va permettre d'accéder rapidement aux données du fichier.
5. L’**enrichissement**, qui va tenir compte des nouvelles valeurs du jeu de données et va effectuer un nouvel enrichissement en fonction des extensions ajoutées pour le jeu de données.  
6. La **finalisation**, qui correspond aux derniers traitements avant que le jeu de données ne soit disponible.

<p>
</p>
Lorsque la finalisation est terminée, le jeu de données passe en état "disponible".  
Il peut alors être édité, enrichi et utilisé dans les visualisations.
