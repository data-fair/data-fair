---
title: Les concepts
section: 4
subsection: 5
updated: 2021-09-20
description: Donnez du sens à vos données
published: true
---

Les concepts sont des notions connues pour la plateforme. Ils vont donner du sens à vos données.  
Ils permettent d'augmenter la réutilisabilité de vos données et de faire **le lien entre vos données et les fonctionnalités de Data&nbsp;Fair**.

La page d'édition d'un jeu de données permet de renseigner les concepts dans la section **Schéma des données**.

1. Colonne sélectionnée&nbsp;;
2. Libellé et description de la colonne&nbsp;;
3. Clé, type et cardinalité de la colonne&nbsp;;
4. Concept associé à la colonne.

![Concepts](./images/user-guide-backoffice/schema-concept.jpg)  
*Les concepts sont nécessaires lors de la création de certaines visualisations*

Grâce aux concepts, vous pouvez, par exemple, [enrichir](./user-guide-backoffice/enrichment) vos données pour leur donner encore plus de valeur ou bien projeter vos données sur une carte.

Un concept est unique pour un jeu de données, il ne peut être attribué qu'une seule fois à un jeu de données. Par exemple, si le concept **latitude** est associé à une colonne de votre jeu de données, il ne pourra pas être associé à une autre colonne de votre jeu de données.


## Liste des concepts

Il est possible de créer ses propres concepts et de les utiliser dans vos [données de référence](./user-guide-backoffice/enrichment).  
Voici la liste par défaut des concepts utilisé par Data&nbsp;Fair&nbsp;:

* **Libellé**&nbsp;: un libellé facilement lisible&nbsp;;
* **Description**&nbsp;: un petit texte descriptif (contenu HTML accepté)&nbsp;;
* **Image**&nbsp;: une URL vers une image illustration du document courant&nbsp;;
* **Numéro de rue**&nbsp;: un numéro de rue, qui peut contenir des mots comme bis ou ter&nbsp;;
* **Rue ou lieu-dit**&nbsp;: un nom de rue ou de lieu-dit&nbsp;;
* **Adresse**&nbsp;: une adresse complète écrite sur une ligne&nbsp;
* **Commune**&nbsp;: libellé d'une commune&nbsp;;
* **Code postal**&nbsp;: un code postal, sur 5 chiffres&nbsp;;
* **Code commune**&nbsp;: le code INSEE de la commune, sur 5 caractères, à ne pas confondre avec le code postal&nbsp;;
* **Code département**&nbsp;: le code du département, sur 2 ou 3 caractères&nbsp;;
* **Code région**&nbsp;: le code de la région, sur 2 chiffres&nbsp;;
* **Latitude**&nbsp;: une coordonnée géographique qui permet de se situer par rapport à l'équateur&nbsp;;
* **Longitude**&nbsp;: une coordonnée géographique qui permet de se situer par rapport au méridien de Greenwich&nbsp;;
* **Latitude / Longitude**&nbsp;: une paire latitude / longitude, séparées par une virgule&nbsp;;
* **SIRET**&nbsp;: le numéro SIRET est un identifiant numérique de 14 chiffres composé du SIREN (9 chiffres) et du NIC (5 chiffres)&nbsp;;
* **SIREN**&nbsp;: le numéro SIREN est un identifiant numérique d'entreprise (9 chiffres)&nbsp;;
* **Code APE**&nbsp;: le code APE (activité principale exercée) permet d'identifier la branche d'activité principale de l'entreprise ou du travailleur indépendant, en référence à la nomenclature des activités françaises&nbsp;;
* **Catégorie juridique (niveau 3)**&nbsp;: la catégorie juridique de niveau 3, parfois appelée nature juridique est un code sur 4 caractères numériques. Elle est issue d'une nomenclature de l'état Français&nbsp;;
* **Date de l'évènement**&nbsp;: la date de l'évènement&nbsp;;
* **Date de création**&nbsp;: la date à laquelle a été créée la ressource&nbsp;;
* **Code parcelle**&nbsp;: le code de la parcelle cadastrale est le numéro unique attribué par le service du cadastre pour identifier une parcelle cadastrale au niveau national. Il est composé de 14 caractères&nbsp;: code commune INSEE de 5 chiffres + code section cadastre de 5 caractères + numéro parcelle cadastre de 4 chiffres. Par exemple 56197037ZC0063 est un code valide&nbsp;;
* **Géométrie GeoJSON**&nbsp;: une géométrie (point, polygone, ligne, etc.) au format GeoJSON&nbsp;;
* **Document numérique attaché**&nbsp;: un chemin relatif vers un fichier rattaché au jeu de données ou URL vers un fichier hébergé à l'extérieur.
