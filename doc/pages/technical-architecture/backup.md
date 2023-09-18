---
title: Backup
section: 11
updated: 2020-12-09
description : Backup - Sauvegardes
published: true
---

Le service **Backup** permet de sauvegarder les données des différents services de la plateforme dans un format compressé.

Les différentes bases MongoDB, les données de Data&nbsp;Fair et les utilisateurs de Simple Directory sont enregistrés lors d’une sauvegarde.
Il est possible de configurer une sauvegarde périodique ou de déclencher une sauvegarde manuellement.

### Stack technique

Le back-end de Backup est écrit en Node.js avec le framework Express.js. La persistance est assurée avec MongoDB. Le front-end est réalisé avec les frameworks Vue.js, Vuetify.js et Nuxt.js. Étant donné son rôle, il est important d'avoir des volumes très fiables avec ce service.

Il n'y a pour l'instant qu'un mode de distribution qui est Docker, et il est recommandé d'opérer ce service dans un environnement tel que Kubernetes.
