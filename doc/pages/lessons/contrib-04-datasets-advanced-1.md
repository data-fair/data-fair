---
title: Ajout de métadonnées, concepts et demandes de publications
section: 2
subsection: 4
description : Ajout de métadonnées, concepts et demandes de publications
published: false
---

Les métadonnées et concepts permettent de mieux comprendre la données que vous présentez sur vos portails.  
Les métadonnées sont les données sur les données telles que la description, la source, les thématiques, etc.  
Les concepts sont des notions connues de la plateforme pour préciser de quel type sont vos données.  
Par exemple s'il s'agit d'un code commune, d'une adresse, d'un latitude ou longitude, etc.  

Les concepts permettent d'accéder à des fonctionnalités de la plateforme, telles que l'enrichissement ou certaines visualisation.  
Un jeu de données avec le code SIRENE pourra être enrichi avec la base SIRENE.  
Un jeu de données avec les concepts latitude et longitude pourra être projeter sur une carte dynamique.

### Ajout de métadonnées et concepts

Nous allons importer les [données SITADEL sur les permis d'aménager filtrées sur la ville de Vannes](https://opendata.koumoul.com/data-fair/api/v1/datasets/sitadel-pa/lines?size=10000&page=1&q_mode=simple&qs=(COMM:(%2256260%22))&finalizedAt=2022-12-10T00:29:00.040Z&format=csv).

Une fois les données importées, vous pouvez renseigner différents concepts sur les colonnes du schéma du jeu de données :

* colonne *REG* = concept *Code Région*
* colonne *DEP* = concept *Code département*
* colonne *COMM* = concept *Code commune*
* colonne *SIREN_DEM* = concept *SIRENE*
* colonne *SIRET_DEM* = concept *SIRET*
* colonne *ADR_CODPOST_TER* = concept *Code postal*
* colonne *latitude* = concept *Latitude*
* colonne *longitude* = concept *Longitude*
* colonne *parcelle* = concept *Code parcelle*

Dans le schéma, la section des groupes vous permet de regrouper certaines colonnes, nous allons regrouper les colonnes latitude, longitude et parcelle en renseignant le groupe *geo* sur ces colonnes.  
Les colonnes modifiées apparaissent en orange.  
Appliquez les modifications du schéma.

![Concepts](./images/lessons/contrib-04-datasets-advanced-1-01.jpg)  
*Validez les concepts pour donner du sens à vos données*

Après la finalisation de votre jeu de données, une carte est disponible dans la section *Données*

![Carte](./images/lessons/contrib-04-datasets-advanced-1-02.jpg)  
*Carte de vos données*

Dans le *Tableau* vous pouvez visualisez votre groupe *geo* dans les colonnes.  

![Groupe Geo](./images/lessons/contrib-04-datasets-advanced-1-03.jpg)  
*Les groupes rassemblent des colonnes*


Dans la section *Métadonnées*, nous allons renseigner une description, une licence et une provenance.  

* Description :  
> Dans le cadre de l’ouverture des données publiques, le Service des données et études statistiques, SDES, met à disposition du public une large partie des informations concernant les autorisations d’urbanisme renseignées dans la base de données Sitadel. L’essentiel des données de cette base, alimentée par les collectivités territoriales et les directions départementales du territoire, est diffusé chaque mois en même temps que les statistiques sur la construction neuve (logements et locaux).

* Licence : Licence Ouverte / Open Licence

* Provenance : https://www.data.gouv.fr/fr/datasets/base-des-permis-de-construire-et-autres-autorisations-durbanisme-sitadel/

D'autres métadonnées peuvent être ajoutées par un administrateur de l'organisation, telles que, les thématiques, la couverture temporelle, les mots clés, etc...
Il peut également rendre des métadonnées obligatoire lors de la demande de publication au jeu de données.  

Dans notre cas, aucune métadonnées n'est obligatoire. Nous allons pouvoir réaliser une demande de publication sur le portail de données.  

![Demande de publication](./images/lessons/contrib-04-datasets-advanced-1-04.jpg)  
*Une demande a été réalisée*

Lorsqu'un administrateur valide la publication, les données sont disponibles sur le portail.  
L'administrateur décide également de la visibilité des données, il peut laisser les données en privée pour les publier sur un portail en interne, ou rendre les données publiques pour les publier sur un portail opendata.
