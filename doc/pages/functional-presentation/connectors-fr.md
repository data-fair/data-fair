---
title: Connecteurs de catalogues
section: 3
subsection : 6
description : Connecteurs de catalogues
published: true
---

Les connecteurs permettent d’interagir avec d’autres plateformes ou services de données, en lecture comme en écriture.

En **écriture**, l’idée est de pouvoir pousser des métadonnées dans d’autres **catalogues**. Un exemple de catalogue est le catalogue de données ouvertes national [data.gouv.fr](https://www.data.gouv.fr/fr/) : les jeux de données publiés à l’aide de Data Fair peuvent être synchronisés automatiquement et toute modification dans les métadonnées est propagée vers le catalogue distant.

Le fait de pousser les métadonnées vers un catalogue plutôt que de se faire moissonner par lui offre plusieurs avantages dont le fait de propager immédiatement les modifications. De plus, si il y a des modification de l'API de Data Fair, le connecteur continuera de fonctionner alors qu'un moissonneur pourrait devenir inopérant.

Les connecteurs peuvent éventuellement pousser les données vers ces catalogues mais il est préférable d’éviter cela à cause des problèmes de duplication et synchronisation de données. Comme mentionné précédemment, les données sont indexée de manière très performante avec Data Fair et il est préférable de requêter les données directement à partir des APIs qu'il offre.

<img src="./images/functional-presentation/catalogues.jpg"
     height="200" style="margin:40px auto;" />

En ce qui concerne la **lecture**, l’approche est par contre différente et les connecteurs se comportent plutôt comme des **moissonneurs de métadonnées et de données**. On peut ainsi pour chaque connecteur paramétrer les fréquences de collecte et les types de sources que l’on souhaite moissonner.

Le fait d'intégrer les données à la plateforme permet de les indexer et de pouvoir centraliser les contrôles d’accès, prérequis indispensable si l’on souhaite pouvoir **fusionner** les données ou consulter différentes sources sur une visualisation.

Il est possible de rajouter de nouveaux connecteurs de catalogues en suivant les instructions dans [cette section](./interoperate/connectors).

Par rapport aux traitements périodiques, les connecteurs de catalogue ont pour principale différence de pouvoir traiter **plusieurs sources de données qui sont référencées via une API** qui les liste. La fréquence de synchronisation est en général plus faible que pour les traitements périodiques.