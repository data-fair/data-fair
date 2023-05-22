---
title: Analytics
section: 8
updated: 2020-12-09
description : Analytics
published: true
---

La gestion des analytics et autres statistiques d'utilisation de la plateforme peut se faire de 2 manières :
 * A l'aide d'un service en ligne externe à la plateforme, tel que Google Analytics
 * Avec un service d'analytics déployé sur la même infrastructure que Data&nbsp;Fair : dans ce cas nous recommandons le logiciel open source [Matomo](https://fr.matomo.org/matomo-on-premise/) (anciennement Piwik).

### Matomo

Matomo est écrit en PHP et nécessite une base de données MySQL, comme par exemple MariaDB. Il est distribué sous forme de conteneurs Docker, et nous recommandons de l'intégrer à la plateforme de cette manière.
