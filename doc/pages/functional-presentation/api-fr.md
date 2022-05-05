---
title: Accès par API
section: 2
subsection : 9
description : APIs proposées et intégration globale
published: true
---

L’ensemble des fonctionnalités de la plateforme est disponible au travers d’**API Rest documentées**.  

La documentation des APIs est réalisée en suivant la spécification **OpenAPI 3.0**. Cela permet une documentation claire et compréhensible au travers d’une documentation interactive. La prise en main des APIs par les développeurs est ainsi plus rapide.

Un autre avantage d’utiliser cette spécification est l’**interopérabilité** accrue, certains systèmes informatiques (par exemple les API gateway)  étant capable de comprendre cette spécification. Les APIs réalisées avec Data Fair peuvent par exemple être directement intégrées par des sites comme https://api.gouv.fr.

<img src="./images/functional-presentation/api.jpg"
     height="500" style="margin:20px auto;" />


Il est possible d'utiliser l'API pour **moissonner les données d'un portail**. Par exemple, le site https://opendatarchives.fr/ moissonne régulièrement les données du portail https://data.ademe.fr/ propulsé par Data Fair.
