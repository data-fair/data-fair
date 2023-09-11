---
title: Éditer un jeu de données
section: 4
subsection: 3
updated: 2021-09-20
description: Ajouter les metadonnées à votre jeu de données
published: true
---

Les jeux de données sont représentés par une fiche. L'édition d'un jeu de données est accessible en cliquant sur cette fiche.

La page d'édition d'un jeu de données contient plusieurs sections&nbsp;: la structure, les métadonnées, les données, les visualisations, le partage des données, l'activité, les boutons d'actions et le contenu.

## Structure
La section **Structure** est composé du **Schéma** et de l'**Enrichissement**.

### Schéma
Le schéma des données vous permet de visualiser l'ensemble des colonnes de votre jeu de données.
Un clic sur une colonne vous permet d'accéder aux informations de la colonne&nbsp;:
1. Colonne sélectionnée&nbsp;;
2. Libellé et description de la colonne&nbsp;;
3. Clé, type et cardinalité de la colonne&nbsp;;
4. [Concept](./user-guide-backoffice/concept) associé à la colonne.

<p>
</p>

Les [concepts](./user-guide-backoffice/concept) sont des notions connues pour la plateforme et sont utilisés dans les visualisations ou pour l'[enrichissement](./user-guide-backoffice/enrichment).  

![schema](./images/user-guide-backoffice/dataset-schema-edit.jpg)  
*Visualisez les schémas de vos données et renseignez des concepts pour donner du sens à vos données*

### Enrichissement

L'enrichissement permet d'importer des colonnes d'une base de référence. Il est ainsi possible de croiser ses données avec des données issues de l'open&nbsp;data telles que la base Sirene, les données INSEE, le cadastre ou la BAN.

Plusieurs étapes sont nécessaires pour créer un enrichissement de données&nbsp;:

1. Sur le schéma, associez les [concepts](./user-guide-backoffice/concept) nécessaires à l'enrichissement que vous désirez&nbsp;;
2. Choisissez l'extension désirée&nbsp;;
3. Choisissez les colonnes que vous voulez ajouter et appliquez l'enrichissement.

![enrichissement](./images/user-guide-backoffice/dataset-enrichement.jpg)  
*Enrichissez vos données pour leur donner encore plus de valeur*

Le jeu de données va être traité et l'état d'avancement peut être visualisé sur les six différents états du jeu de données. Une fois l'étape de finalisation terminée, votre jeu de données est enrichi.

Dans la partie basse de la fiche de votre enrichissement, vous retrouvez le journal d'enrichissement, ainsi qu'un bouton pour supprimer celui-ci.  
Le rapport d'enrichissement vous permet de vérifier sa qualité et lister les différentes lignes qui n'ont pas été enrichies.

Les colonnes que vous avez ajoutées à votre jeu de données avec l'[enrichissement](./user-guide-backoffice/enrichment) seront automatiquement ajoutées au schéma du jeu de données et il sera possible de télécharger le fichier enrichi avec les colonnes supplémentaires.

## Métadonnées
La section **Métadonnées** est composée des **Informations** et des **Pièces&nbsp;jointes**.

### Informations
Dans cette section, vous retrouvez les informations de votre jeu de données, telles que&nbsp;:
* Le titre&nbsp;;
* La description&nbsp;;
* Le nom, l'extension et la taille de votre fichier&nbsp;;
* La date de la dernière mise à jour des métadonnées et des données&nbsp;;
* Le nombre de lignes&nbsp;;
* La licence&nbsp;&nbsp;;
* La thématique&nbsp;;
* La provenance.

![Informations](./images/user-guide-backoffice/dataset-informations.jpg)

### Pièces&nbsp;jointes

Les pièces&nbsp;jointes permettent d'attacher un document aux données, tel qu'un descriptif ou une documentation dans un fichier PDF.  
Les fichiers en pièce&nbsp;jointe seront disponibles en téléchargement sur la page du jeu de données sur vos portails.

## Données

Dans cette section, les données sont consultables sous forme de tableau, de carte, de calendrier ou de vignettes.

**Le tableau**

Le tableau vous permet d'accéder aux 10&nbsp;000 premières lignes du fichier.

![Tableau](./images/user-guide-backoffice/edition-tableau-1.png)

Il contient plusieurs sections&nbsp;:
1. la recherche&nbsp;;  
2. le mode d'affichage des lignes&nbsp;;
3. le choix des colonnes&nbsp;;  
4. le téléchargement&nbsp;;  
5. les filtres sur une colonne&nbsp;;  
6. le filtre sur une valeur d'une colonne.  

![Tableau](./images/user-guide-backoffice/edition-tableau-2.png)

1. Les filtres sur les valeurs d'une colonne vous permettent de réaliser un filtre de type &laquo;&nbsp;égal à&nbsp;&raquo; ou &laquo;&nbsp;commence par&nbsp;&raquo; sur les colonnes avec du texte et de réaliser des filtres &laquo;&nbsp;supérieur ou égal à&nbsp;&raquo; ou &laquo;&nbsp;inférieur ou égal à&nbsp;&raquo; sur les colonnes avec des nombres ou des dates. Vous pouvez appliquer plusieurs filtres. Le nombre de lignes filtrées est alors disponible à côté de la recherche.
2. Téléchargement des lignes filtrées sous différents formats.   
Le téléchargement aux format XLSX, ODS et GeoJSON sont limités aux 10&nbsp;000 premières lignes.

![Tableau](./images/user-guide-backoffice/edition-tableau-3.png)

Les choix des colonnes permettent de sélectionner les colonnes que vous souhaitez afficher dans le tableau.  
Il est ensuite possible de télécharger le fichier avec seulement les colonnes que vous avez sélectionnées.

**La carte**

L'onglet **Carte** est disponible si les [concepts](./user-guide-backoffice/concept) de position, tels que des latitudes/longitudes ou des géométries, sont associés à vos données.  
La carte va vous permettre de visualiser rapidement vos données sur un territoire et d'accéder aux données brutes de chaque point ou géométrie.

![Tableau](./images/user-guide-backoffice/edition-map.png)

**Calendrier**  

L'onglet **Calendrier** est disponible si les [concepts](./user-guide-backoffice/concept) **Libellé**, **Date de début** et **Date de fin** sont associés à vos données.  
Le calendrier vous permet de visualiser vos données chronologiquement.

**Vignettes**  

L'onglet **Calendrier** est disponible si le [concept](./user-guide-backoffice/concept) **Images** est associé à vos données.  

![Tableau](./images/user-guide-backoffice/edition-images.png)

## Visualisations
Dans cette section, vous retrouvez la liste des visualisations qui utilisent votre jeu de données.  
Vous pouvez ainsi naviguer rapidement entre les différentes visualisations pour les configurer ou en créer une nouvelle.  
Leur ordre peut être modifié avec un simple glissé et déposé des fiches des visualisations. Cet ordre sera appliqué sur la page de vos portails.

![Visualisations](./images/user-guide-backoffice/dataset-visualisations-edit.jpg)  
*Configurez plusieurs visualisations pour mieux comprendre vos données*

Il est possible d'ajouter des **Réutilisations Externes** qui utilisent vos données.  
Les réutilisations externes seront affichées sur la page du portail du jeu de données sous la forme d'une fiche récapitulative où la réutilisation sera intégrée à la page si vous possédez le code d'intégration.

## Partage

Dans cette section vous pourrez définir les permissions de votre jeu de données, la publication sur vos portails et la publication sur des catalogues externes. Par défaut, un jeu de donnée est privé.


### Permissions
L'option **Accessible publiquement** permet de rendre les données publiques ou privées.  
Les permissions peuvent être définies plus finement à l'aide de l'**Ajout des permissions** pour ne donner l'accès qu'à un nombre limité de comptes.

![Permissions](./images/user-guide-backoffice/dataset-permissions.jpg)  
*Rendez vos données accessibles*

### Portails

La liste de vos portails est disponible dans cette section.

Les jeux de données peuvent être publiée sur plusieurs portails. Vous pouvez ainsi publier vos données en interne, avoir des retours, puis publier les données sur un portail open&nbsp;data. Une diffusion de données par étapes sur différents portail permet d'augmenter la qualité des données partagées.  
Le fait de pouvoir partager sur plusieurs portails permet aussi d'avoir les même données sur tous les portails sans les dupliquer. De plus, lorsque les données seront mises à jour, elles le seront pour tous les portails.

![Permissions](./images/user-guide-backoffice/dataset-partage.jpg)

### Catalogue

La liste des catalogues que vous avez configurés sur la page [Catalogues](./user-guide-backoffice/catalogues) est disponible dans cette section.  
Vous pouvez ainsi publier vos données sur un ou plusieurs catalogues externes.

## Activité

Le journal d'activité permet de consulter l'historique des dernières modifications réalisées sur le jeu de données.

![Activité](./images/user-guide-backoffice/dataset-activity.jpg)  
*Derniers événements de votre jeu de données*

## Boutons d'action
Sur la droite de la page d'édition vous avez accès à plusieurs boutons d'action&nbsp;:

* **Fichier original** vous permet de télécharger le fichier original&nbsp;;
* **Fichier enrichi** vous permet de télécharger le fichier avec toutes les nouvelles colonnes que vous avez ajoutées grâce à l'[enrichissement](./user-guide-backoffice/enrichment) au format CSV&nbsp;;
* **Mettre à jour** vous permet de modifier le jeu de données chargé sur votre compte par un nouveau depuis votre ordinateur&nbsp;;
* **Intégrer dans un site** permet d'accéder au code HTML pour intégrer le tableau ou la carte des données à un site externe&nbsp;
* **Voir sur le portail des données** permet d'accéder à la page sur votre portail. Si vous avez publié le jeu sur plusieurs portail, il y aura plusieurs liens&nbsp;;
* **Utiliser l'API** permet d'accéder à la documentation interactive de l'API du jeu de données&nbsp;;
* **Suppression** permet de supprimer le jeu de données de la plateforme&nbsp;;
* **Changer de propriétaire** permet de transférer le jeu de données vers un autre compte.

## Contenu
La section du contenu permet de naviguer rapidement entre les différentes sections de la page d'édition du jeu de données.
