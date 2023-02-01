---
title: Notify
section: 7
updated: 2020-12-09
description : Notify
published: true
---

Le service **Notify** permet de gérer les notifications d'une plateforme. Celles-ci peuvent être transmises dans le navigateur, sur un smartphone ou par email.

## Stack technique

Le backend de Notify est écrit en NodeJS avec le framework ExpressJS. La persistance est assurée avec MongoDB. Le frontend est réalisé avec les frameworks VueJS, VuetifyJS et NuxtJS.

Il n'y a pour l'instant qu'un mode de distribution qui est Docker, et il est recommandé d'opérer ce service dans un environnement tel que Kubernetes.
