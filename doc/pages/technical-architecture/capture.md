---
title: Capture
section: 9
updated: 2020-12-09
description : Capture
published: true
---

Le service Capture permet de créer des images à partir de visualisations web ou des documents PDF à partir de pages web.

### Stack technique

Le backend de Capture est écrit en NodeJS avec le framework ExpressJS. Ce service ne possède pas de persistance ni de frontend. Ce service utilise un navigateur headless pour faire les rendu qui est [Puppeteer](https://github.com/puppeteer/puppeteer)

Il n'y a pour l'instant qu'un mode de distribution qui est Docker, et il est recommandé d'opérer ce service dans un environnement tel que Kubernetes.
