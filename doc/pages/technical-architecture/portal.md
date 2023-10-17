---
title: Data Fair Portal
section: 4
updated: 2020-12-09
description : Portails de données
published: true
---

Data&nbsp;Fair Portal permet de réaliser des portails de données, publics ou privés.

Une organisation peut avoir plusieurs portails, et il sera bientôt possible de réaliser des portails multi-organisations. Chaque portail peut être publié sur un nom de domaine différent, Data&nbsp;Fair Portal agit à la manière d'un *reverse proxy* pour que chaque requête HTTP soit traitée dans le contexte du portail auquel elle fait référence.

L'authentification avec Simple Directory n'étant possible que sur le même domaine (ou sur un sous-domaine de celui pour lequel Simple Directory est configuré), les portails de données sur un autre domaine ne peuvent être que des portails open&nbsp;data.

## Stack technique

Le back-end de Data&nbsp;Fair Portal est écrit en Node.js avec le framework Express.js. La persistance est assurée avec MongoDB. Le front-end est réalisé avec les frameworks Vue.js, Vuetify.js et Nuxt.js. La configuration des pages est faites à l'aide de JSON schémas interprétés par la librairie VJFS.

Il n'y a pour l'instant qu'un mode de distribution qui est Docker, et il est recommandé d'opérer ce service dans un environnement tel que Kubernetes.
