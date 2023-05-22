---
title: Configurer vos analytics
section: 11
subsection : 3
updated: 2021-11-09
description : Configurer le système de suivi de votre portail
published: true
---

La configuration du système de suivi des utilisateurs se compose en deux points.
1. Le choix du système de suivi sur le portail
2. Configuration des événements
<p>
</p>

Vous pouvez choisir entre trois différents système de suivi, **Matotmo**, **Google Analytics Universal Analytics (ancienne version de GA)** et **Google Analytics 4 (nouvelle version de GA)**.

## Configuration avec Matomo

Pour configurer votre portail pour qu'il envoie les données de suivi à Matomo, vous aurez besoin de l'**url du tracker** et de l'**identifiant de votre site** que vous avez configuré dans Matomo. Vous pourrez ensuite renseigner ces codes sur la configuration de votre portail.

## Configuration avec l'ancien système de suivi de Google Analytics UA-

Pour Google Analytics Universal Analytics vous aurez besoin de l'**ID de suivi** que vous pouvez retrouver après avoir créer votre propriété sur Google Analytics : **Administration** > **Paramètres de la propriété** > **ID de suivi**.  
L'identifiant de suivi est un code commençant par UA-*.

Vous pourrez ensuite renseigner ce code sur la configuration de votre portail.

![Configuration](./images/user-guide-backoffice/config-GA-1.jpg)

## Configuration avec le nouveau système de suivi de Google Analytics 4 G-

Pour Google Analytics 4 vous aurez besoin de l'**ID DE MESURE** que vous pouvez retrouver après avoir créer votre propriété sur Google Analytics : **Administration** > **Paramètres de la propriété** > **Flux de données** > Ajouter ou cliquez sur le flux de données > **ID DE MESURE**.  
L'identifiant de mesure est un code commençant par G-*.

Vous pourrez ensuite renseigner ce code sur la configuration de votre portail.

![Configuration](./images/user-guide-backoffice/config-GA4.jpg)

## Configuration des événements

Ce point de configuration est disponible dans les paramètres de Data&nbsp;Fair à la catégorie *Appels exterieurs (webhooks)*.

Vous pouvez définir quels événements vous souhaitez suivre dans vos analytics :
* Un nouveau jeu de données a été créé
* Un jeu de données a rencontré une erreur
* Un jeu de données a été finalisé et mis en ligne
* Un jeu de données a été publié sur un catalogue
* Une nouvelle réutilisation a été créée
* Une réutilisation a rencontré une erreur
* Une réutilisation a été publiée sur un catalogue
* Le fichier d'un jeu de données a été mis à jour

![Configuration](./images/user-guide-backoffice/config-GA-2.jpg)
