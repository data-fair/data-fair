---
title: Editer un jeu de données
section: 4
subsection : 2
updated: 2021-09-20
description : Ajouter les metadonnées à votre jeu de données
published: false
---

Sur la page [Jeux de données](https://koumoul.com/s/data-fair/datasets), les jeux de données sont représentés par une fiche. L'édition d'une jeu de données est accessible en cliquant sur cette fiche.

La page d'édition d'un jeu de données contient plusieurs sections : la structure, les métadonnées, les données, les visualisations, le partage des données, l'activité, les boutons d'actions et le contenu.

## Structure
La section **Structure** est composé du Schéma et de l'Enrichissement.

### Schéma
Le schéma des données vous permet de visualiser l'ensemble des colonnes de votre jeu de données.
Un clic sur une colonne vous permet d'accéder aux informations de la colonne
1. Colonne sélectionnée
2. Libellé et description de la colonne
3. Clé, type et cardinalité de la colonne
4. [Concept](./user-guide/concept) associé à la colonne

<p>
</p>

Les [concepts](./user-guide/concept) sont des notions connues pour la plateforme et sont utilisés dans les visualisations ou pour l'[enrichissement](./user-guide/enrichment).  

![schema](./images/user-guide/dataset-schema-edit.jpg)  
*Visualisez les schémas de vos données et renseignez des concepts pour donner du sens à vos données*

### Enrichissement

L'enrichissement permet d'importer des colonnes d'une base de référence. Il est ainsi possible de croiser ses données avec des données issues de l'open data telles que la base SIRENE, les données INSEE, le cadastre ou la BAN.

Plusieurs étapes sont nécessaires pour créer un enrichissement de données :

1. Sur le schéma, associez les [concepts](./user-guide/concept) nécessaires à l'enrichissement que vous désirez.
2. Choisissez l'extension désirée.
3. Choisissez les colonnes que vous voulez ajouter et appliquez l'enrichissement

![enrichissement](./images/user-guide/dataset-enrichement.jpg)  
*Enrichissez vos données pour leur donner encore plus de valeur*

Le jeu de données va être traité et l'état d'avancement peut être visualiser sur les 6 différents états du jeu de données. Une fois l'étape de finalisation terminée votre jeu de données est enrichi.

Dans la partie basse de la fiche de votre enrichissement, vous retrouvez le journal d'enrichissement, ainsi qu'un bouton pour supprimer l'enrichissement.  
Le rapport d'enrichissement vous permet de vérifier la qualité de l'enrichissement et lister les différentes lignes qui n'ont pas été enrichies.

Les colonnes que vous avez ajoutées à votre jeu de données avec l'[enrichissement](./user-guide/enrichment) seront automatiquement ajoutées au schéma du jeu de données et il sera possible de télécharger le fichier enrichi avec les colonnes supplémentaires.

## Métadonnées
La section **Métadonnées** est composée des Informations et des Pièces jointes.

### Informations
Dans cette section, vous retrouvez les informations de votre jeu de données, telles que :
* Le titre
* La description,
* Le nom, l'extension et la taille de votre fichier
* La date de la dernière mise à jour des métadonnées et des données
* Le nombre de lignes
* La licence
* La thématique
* La provenance

![Informations](./images/user-guide/dataset-informations.jpg)

### Pièces jointes

Les pièces jointes permettent d'attacher un document aux données tels qu'un descriptif ou une documentation dans un fichier PDF par exemple.  
Les fichiers en pièce jointe seront disponibles en téléchargement sur la page du jeu de données sur vos portails.

## Données

Dans cette section, les données sont consultables sous forme de tableau ou de carte (si vous données possèdent les concepts **Latitude**/**Longitude** ou **Géometrie** de renseignés).

![Données](./images/user-guide/dataset-donnees.jpg)  
*Accédez à vos données sous forme de tableau ou de carte*

Le tableau permet d'explorer vos données à travers plusieurs fonctionnalités.  
Il est possible de réaliser des recherches textuelles et des filtres sur une valeur d'une colonne, les 10 000 premières lignes du résultat seront alors affichées.  
Le résultat de votre recherche est téléchargeable sous différents formats de fichiers.

## Visualisations
Dans cette section, vous retrouvez la liste des visualisations qui utilisent votre jeu de données.  
Vous pouvez ainsi naviguer rapidement entre les différentes visualisations pour les configurer ou créer une nouvelle visualisation.  
L'ordre des visualisations peut être modifié avec un simple glissé et déposé des fiches des visualisations. Cet ordre sera appliqué sur la page de vos portails.

![Visualisations](./images/user-guide/dataset-visualisations-edit.jpg)  
*Configurez plusieurs visualisations pour mieux comprendre vos données*

Il est possible d'ajouter des **Réutilisations Externes** qui utilisent vos données.  
Les réutilisations externes seront affichées sur la page du portail du jeu de données sous la forme d'une fiche récapitulative ou la réutilisation sera intégrée à la page si vous possédez le code d'intégration.

## Partage

Dans cette section vous pourrez définir les permissions de votre jeu de données, la publication sur vos portails et la publication sur des catalogues externes. Par défaut, un jeu de donnée est privé.


### Permissions
L'option **Accessible publiquement** permet de rendre les données publiques ou privées.  
Les permissions peuvent être définies plus finement à l'aide de l'**Ajout des permissions** pour ne donner l'accès qu'à un nombre limité de comptes.

![Permissions](./images/user-guide/dataset-permissions.jpg)  
*Rendez vos données accessibles*

### Portails

La liste de vos portails est disponible dans cette section.

Les jeux de données peuvent être publiée sur plusieurs portails. Vous pouvez ainsi publier vos données en interne, avoir des retours, puis publier les données sur un portail opendata. Une diffusion de données par étapes sur différents portail permet d'augmenter la qualité des données partagées.  
Le fait de pouvoir partager sur plusieurs portails permet aussi d'avoir les même données sur tous les portails sans les dupliquer. De plus lorsque les données seront mises à jour, elles le seront pour tous les portails.

![Permissions](./images/user-guide/dataset-partage.jpg)

### Catalogue

La liste des catalogues que vous avez configurés sur la page [Catalogues](./user-guide/catalogues) est disponible dans cette section.  
Vous pouvez ainsi publier vos données sur un ou plusieurs catalogues externes.

## Activité

Le journal d'activité permet de consulter l'historique des dernières modifications réalisée sur le jeu de données

![Activité](./images/user-guide/dataset-activity.jpg)  
*Dernies événements de votre jeu de données*

## Boutons d'actions
Sur la droite de la page d'édition vous avez accès à plusieurs boutons d'actions :

* **Fichier original**, vous permet de télécharger le fichier original
* **Fichier enrichi**, vous permet de télécharger le fichier avec toutes les nouvelles colonnes que vous avez ajoutées grâce à l'[enrichissement](./user-guide/enrichment) au format CSV.
* **Mettre à jour**, vous permet de modifier le jeu de données chargé sur votre compte par un nouveau de votre ordinateur.
* **Intégrer dans un site**, permet d'accéder au code HTML pour intégrer le tableau ou la carte des données à un site externe.
* **Voir sur le portail des données**, permet d'accéder à la page sur votre portail. Si vous avez publié le jeu sur plusieurs portail, il y aura plusieurs liens.
* **Utiliser l'API**, permet d'accéder à la documentation interactive de 'API du jeu de données.
* **Suppression**, permet de supprimer le jeu de données de la plateforme.
* **Changer de propriétaire**, permet de transfère le jeu de données dans une autre compte.

## Contenu
La section du contenu permet de naviguer rapidement entre les différentes sections de la page d'édition du jeu de données.
