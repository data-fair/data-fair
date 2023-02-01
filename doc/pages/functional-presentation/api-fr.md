---
title: Accès par API
section: 2
subsection : 9
description : APIs proposées et intégration globale
published: true
---

L’ensemble des fonctionnalités de la plateforme est disponible au travers d’**APIs Rest documentées**. Ces APIs peuvent être appelées en dehors du portail, mais pour les accès restreints il faut passer par l'utilisation d'une **clé d'API**. Lors de l’ajout d’une clé d’api, il est possible de restreindre l’accès à une seule fonction. Il est ensuite possible de restreindre l’accès à une IP ou à un nom de domaine précis.

La documentation des APIs est réalisée en suivant la spécification **OpenAPI 3.0**. Cela permet une documentation claire et compréhensible au travers d’une documentation interactive. La prise en main des APIs par les développeurs est ainsi plus rapide.

Un autre avantage d’utiliser cette spécification est l’**interopérabilité** accrue, certains systèmes informatiques (par exemple les API gateway)  étant capable de comprendre cette spécification. Les APIs réalisées avec Data Fair peuvent par exemple être directement intégrées par des sites comme https://api.gouv.fr.

<img src="./images/functional-presentation/api.jpg"
     height="500" style="margin:20px auto;" alt="screenshot of the API documentation" />


Il est possible d'utiliser l'API pour **moissonner les données d'un portail**. Par exemple, le site https://opendatarchives.fr/ moissonne régulièrement les données du portail https://data.ademe.fr/ propulsé par Data Fair.
