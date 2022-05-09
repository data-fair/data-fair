---
title: Pièces jointes par ligne
section: 4  
subsection: 7
updated: 2021-09-20
description: Pièces jointes par ligne
published: true
---

Lorsque vous chargez un jeu de données, il est possible d'associer une archive zip contenant des fichiers PDF, JPG, etc... à votre jeu de données. Ces fichiers pourront être utilisés dans les applications.

Pour que votre archive soit correctement associée à votre jeu de données, votre jeu de données et votre archive doivent suivre ces deux règles :

1. votre jeu de donnée doit posséder une colonne contenant les chemins et les noms des fichiers dans l'archive ZIP
2. le nom de votre fichier zip doit correspondre au nom de la colonne contenant les chemins des fichiers dans l'archive ZIP. Exemple : La colonne dans votre jeu de données s'appelle **Document** votre fichier doit s'appeler **Document.zip**

<p>
</p>

![PJ-1](./images/user-guide-backoffice/piece-jointe-1.png)

Dans le schéma de votre jeu de données, le concept **Document numérique attaché** sera automatiquement associé à la colonne contenant les noms des fichiers de votre archive ZIP.

![PJ-2](./images/user-guide-backoffice/piece-jointe-2.png)

Le temps d'indexation des pièces jointes est assez long et il dépendra de la taille de vos pièces jointes.  
La taille des fichiers dézippé des pièces jointes est comptabilisée dans le quota de stockage de données de votre plan.

N’hésitez pas à nous [contacter](https://koumoul.com/contact) si vous rencontrez des difficultés.
