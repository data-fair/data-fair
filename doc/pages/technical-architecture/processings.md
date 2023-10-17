---
title: Data Fair Processings
section: 6
updated: 2020-12-09
description : Traitements périodiques
published: true
---

Data&nbsp;Fair Processings permet de programmer des traitements périodiques. Ils permettent d'aller chercher des données à certains endroits, les transformer et les publier sur Data&nbsp;Fair. Il est aussi prévu de pouvoir faire prochainement l'inverse. Il permet, en pratique, de mettre à jour automatiquement des jeux de données spécifiques.

## Stack technique

Le back-end de Data&nbsp;Fair Processings est écrit en Node.js avec le framework Express.js. La persistance est assurée avec MongoDB. Le front-end est réalisé avec les frameworks Vue.js, Vuetify.js et Nuxt.js. Les plugins pour ajouter de nouveaux types de traitements sont à écrire en Node.js, mais il est prévu dans le futur de pouvoir supporter des plugins écrits dans d'autres langages.

Il n'y a pour l'instant qu'un mode de distribution qui est Docker, et il est recommandé d'opérer ce service dans un environnement tel que Kubernetes.
