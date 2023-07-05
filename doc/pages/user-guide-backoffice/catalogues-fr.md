---
title: Catalogues
section: 13
updated: 2021-09-20
description : Diffusez ou importez des données de différents catalogues.
published: true
---
Les connecteurs permettent d’interagir avec d’autres plateformes ou services de données, en lecture comme en écriture.

En écriture, l’idée est de pouvoir pousser des métadonnées dans d’autres catalogues.  
Un exemple de catalogue est le catalogue de données ouvertes national [data.gouv.fr](https://www.data.gouv.fr/fr/) : les jeux de données publiés à l’aide de Data&nbsp;Fair peuvent être **synchronisés automatiquement** et toute modification des métadonnées est propagée vers le catalogue distant.

En lecture, l’approche est  différente et les connecteurs se comportent plutôt comme des moissonneurs de métadonnées et de données. On peut ainsi pour chaque connecteur paramétrer les fréquences de collecte et les types de sources que l’on souhaite moissonner.


### Configuration d'un catalogue data.gouv.fr

Voici la configuration du catalogue data.gouv.fr de l'organisation Koumoul :

![Catalogue](./images/user-guide-backoffice/catalogue-data-gouv.jpg)  
*Configurez des catalogues et rendez vos données accessibles à partir d'autres plateformes*

1. Le titre du catalogue
2. Description du catalogue  
3. Clé d'API du catalogue  
4. Lien des jeux de données  
5. Lien des visualisations

<p>
</p>

Les liens vers les jeux de données et les visualisations correspond aux pages de votre portail vers lesquelles vous souhaitez rediriger les visiteurs qui vont naviger vers votre portail.

La **clé d'API** à renseigner correspond à la clé que vous générez sur votre compte [data.gouv.fr](https://www.data.gouv.fr/fr/) dans votre espace personnel :

![Catalogue](./images/user-guide-backoffice/cle-catalogue-data-gouv.jpg)  
*Créez votre clé d'API*
