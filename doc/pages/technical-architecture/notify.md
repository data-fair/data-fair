---
title: Notify
section: 7
updated: 2020-12-09
description : Notify
published: true
---

Le service **Notify** permet de gérer les notifications d'une plateforme. Celles-ci peuvent être transmises dans le navigateur, sur un smartphone ou par e-mail.

## Stack technique

Le back-end de Notify est écrit en Node.js avec le framework Express.js. La persistance est assurée avec MongoDB. Le front-end est réalisé avec les frameworks Vue.js, Vuetify.js et Nuxt.js.

Il n'y a pour l'instant qu'un mode de distribution qui est Docker, et il est recommandé d'opérer ce service dans un environnement tel que Kubernetes.
