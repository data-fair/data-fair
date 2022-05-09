---
title: Jeu de données
section: 4
updated: 2021-09-20
description : Datasets
published: true
---

Sur Data Fair, un jeu de données correspond à un [fichier](./user-guide-backoffice/file-formats) que vous avez chargé ou à un [jeu virtuel ou un jeu éditable](./user-guide-backoffice/import-dataset) dont vous avez renseigné les meta-données.  
Par défaut, toutes les données que vous chargez sont privées, il n'y a que le compte sur lequel vous avez chargé les données qui a accès aux données.

Vous pouvez travailler à plusieurs sur des jeux de données en utilisant une [organisation](./user-guide-backoffice/organisation).


### Les meta-données

Les meta-données sont les données qui vont caractériser votre fichier, telles que la taille, le format, la date de modification, etc...  
Le titre, la description, la provenance, la licence sont des meta-données que vous pouvez modifier dans la page d'édition d'un jeu de données. Elles permettent de mieux identifier et de retrouver vos jeux de données.

### Les concepts

Dans la page d'édition d'un jeu de données, vous retrouvez la section **Schéma** qui vous permet de visualiser le model de vos données. Le schéma d'un jeu de données correspond à son architecture (l'ensemble des colonnes). Dans cette section vous pouvez renseigner des [concepts](./user-guide-backoffice/concept). Lorsque vous renseignez un concept sur une colonne, vous associez une notion connue de Data Fair à cette colonne. Vos données ont ainsi plus de sens pour Data Fair.

Les [concepts](./user-guide-backoffice/concept) sont utilisés dans divers fonctionnalités, dans certains cas, ils sont indispensables. Par exemple, si vous souhaitez projeter vos données sur une carte, les concepts **Latitude/Longitude** ou **Géométrie** devront être renseignés dans votre schéma.
