---
title: Backup
section: 11
updated: 2020-12-09
description : Backup - Sauvegardes
published: true
---

Le service Backup permet de sauvegarder les données des différents services de la plateforme dans un format compressé.

Les differents base MongoDB, les données de data-fair et les utilisateurs de simple-directory sont enregistrées lors d’une sauvegarde.
Il est possible de configurer une sauvegarde périodique ou de déclencher une sauvegarde manuellement.

### Stack technique

Le backend de Backup est écrit en NodeJS avec le framework ExpressJS. La persistance est assurée avec MongoDB. Le frontend est réalisé avec les frameworks VueJS, VuetifyJS et NuxtJS. De part son rôle, il est important d'avoir des volumes très fiables avec ce service.

Il n'y a pour l'instant qu'un mode de distribution qui est Docker, et il est recommandé d'opérer ce service dans un environnement tel que Kubernetes.
