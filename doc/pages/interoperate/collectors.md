---
title: Collecteurs de données
section: 3
updated: 2020-12-10
description : Collecteurs de données
published: true
---

Les collecteurs de données périodiques permettent de mettre à jour certains jeux de données spécifiques de manière automatisée. Il y a principalement 2 cas d'usage, mais on peut en imaginer d'autres :
 * Mise à jour de jeux de données alimentés par des fichiers produits par d'autres traitement automatisés. Typiquement des traitements réalisés par des ETL avec en sortie des fichiers tabulaires ou cartographiques mis à disposition sur un espace d'échange (serveur HTTP ou FTP).
 * Mise à jour de données temps réel alimentés par des flux de données ayant des formats spécifiques. Cela concerne principalement des données IOT.

 La collecte de données est assurée par le service open source [Data&nbsp;Fair Processings](https://github.com/data-fair-processings). Lorsque l'on souhaite collecter des données dans un nouveau format ou protocole d'échange, il faut développer un nouveau plugin. On peut distinguer 2 cas de figure. Soit la mise à disposition des données correspond à un standard qui n'est pas encore supporté, et dans ce cas le plugin peut être intégré directement dans Data&nbsp;Fair Processings via une merge request. Soit le plugin reste propriétaire ou correspond à un format/protocole trop spécifique pour être intégré directement dans le projet, et il est rajouté par configuration, lors de l'installation du service.
