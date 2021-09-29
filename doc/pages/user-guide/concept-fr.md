---
title: Les concepts
section: 4
subsection : 5
updated: 2021-09-20
description : Ajouter du sens à vos données
published: false
---

Les concepts sont des notions connues pour la plateforme. Les concepts vont donner du sens à vos données.  
Ils permettent d'augmenter la réutilisabilité de vos données et de faire **le lien entre vos données et les fonctionnalités de Data Fair**.

La page d'édition d'un jeu de données permet de renseigner les concepts dans la section **Schéma des données**.

1. Colonne sélectionnée
2. Libellé et description de la colonne
3. Clé, type et cardinalité de la colonne
4. Concept associé à la colonne

![Concepts](./images/user-guide/schema-concept.jpg)  

Grace aux concepts, vous pouvez, par exemple, [enrichir](./user-guide/enrichment) vos données pour leur donner encore plus de valeur ou bien projeter vos données sur une carte.

Les concepts sont nécessaires à la représentation de certaines visualisations. Par exemple, vos données pourront être projetées sur une carte que si vous avez associé les concepts **Latitude** et **Longitude** aux colonnes contenant les valeurs latitude et longitude.

Un concept est unique pour un jeu de données, il ne peut être attribué qu'une seule fois à un jeu de données. Par exemple, si le concept **Latitude** est associé à une colonne de votre jeu de données, il ne pourra pas être associé à une autre colonne de votre jeu de données.


### Liste des concepts

Il est possible de créer des concepts en créant des donnée de référence.  
Voici la liste par défaut des concepts utilisé par Data Fair :

* **Libellé** : Un libellé facilement lisible
* **Description** : Un petit texte descriptif (contenu HTML accepté)
* **Image** : URL vers une image illustration du document courant
* **Numéro de rue** : Un numéro de rue, qui peut contenir des mots comme bis ou ter
* **Rue ou lieu-dit** : Un nom de rue ou de lieu-dit
* **Adresse** : Une adresse écrite sur une ligne
* **Commune** : Libellé d'une commune
* **Code postal** : Code postal, sur 5 chiffre
* **Code commune** : Code INSEE de la commune, sur 5 caractères, à ne pas confondre avec le code postal.
* **Code département** : Code du département, sur 2 ou 3 caractères
* **Code région** : Code de la région, sur 2 chiffres
* **Latitude** : Coordonné géographique qui permet de se situer par rapport à l'équateur
* **Longitude** : Coordonné géographique qui permet de se situer par rapport au méridien de Greenwich
* **Latitude / Longitude** : Paire latitude / longitude, séparées par une virgule
* **SIRET** : Le numéro SIRET est un identifiant numérique de 14 chiffres composé du SIREN (9 chiffres) et du NIC (5 chiffres)
* **SIRENE** : Le numéro SIREN est un identifiant numérique d'entreprise (9 chiffres)
* **Code APE** : Le code APE (activité principale exercée) permet d'identifier la branche d'activité principale de l'entreprise ou du travailleur indépendant en référence à la nomenclature des activités françaises
* **Catégorie juridique (niveau 3)** : La catégorie juridique de niveau 3, parfois appelée nature juridique est un code sur 4 caractères numériques. Elle est issue d'une nomenclature de l'état Français.
* **Date de l'évènement** : Correspond à la date de l'évènement
* **Date de création** : Date à laquelle a été créée la ressource
* **Code parcelle** : Le code de la parcelle cadastrale est le numéro unique attribué par le Service du cadastre pour identifier une parcelle cadastrale au niveau national. Il est composé de 14 caractères : code commune INSEE de 5 chiffres + code section cadastre de 5 caractères + numéro parcelle cadastre de 4 chiffres. Par exemple 56197037ZC0063 est un code valide.
* **Géométrie GeoJSON** : Une géométrie (point, polygone, ligne, etc.) au format GeoJSON.
* **Document numérique attaché** : Chemin relatif vers un fichier rattaché au jeu de données ou URL vers un fichier hébergé à l'extérieur
