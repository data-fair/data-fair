---
title: Connecteurs de catalogues
section: 3
subsection : 7
updated: 2020-12-09
description : Connecteurs de catalogues
published: true
---

Les connecteurs permettent d’interagir avec d’autres plateformes ou services de données, en lecture comme en écriture.

En **écriture**, l’idée est de pouvoir pousser des métadonnées dans d’autres **catalogues**. Un exemple de catalogue est le catalogue de données ouvertes national [data.gouv.fr](https://www.data.gouv.fr/fr/) : les jeux de données publiés à l’aide de Data Fair peuvent être synchronisés automatiquement et toute modification dans les métadonnées est propagée vers le catalogue distant.

Le fait de pousser les métadonnées vers un catalogue plutôt que de se faire moissonner par lui offre plusieurs avantages dont le fait de propager immédiatement les modifications.

Les connecteurs peuvent éventuellement pousser les données vers ces catalogues mais il est préférable d’éviter cela à cause des problèmes de duplication et synchronisation de données. Comme mentionné précédemment, les données sont indexée de manière très performante et il est préférable de requêter les données directement à partir de Data Fair.

![Connecteur vers le catalogue data.gouv.fr](./images/functional-presentation/catalogues.jpg)

En ce qui concerne la **lecture**, l’approche est par contre différente et les connecteurs se comportent plutôt comme des **moissonneurs de métadonnées et de données**. On peut ainsi pour chaque connecteur paramétrer les fréquences de collecte et les types de sources que l’on souhaite moissonner.

Le fait d'intégrer les données à la plateforme permet de les indexer et de pouvoir centraliser les contrôles d’accès, prérequis indispensable si l’on souhaite pouvoir **fusionner** les données ou consulter différentes sources sur une visualisation.

Il est possible de rajouter de nouveaux connecteurs de catalogues en suivant les instructions dans [cette section](./interoperate/connectors).
