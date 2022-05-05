---
title: Page d'un jeu de données
section: 3
subsection : 1
updated: 2022-04-25
description : Accéder aux données du portail
published: false
---

La page d'un jeu de données est composé de plusieurs éléments :
1. Le titre et la description du jeu de données
2. Les metadonnées du jeu de données et les boutons d'actions
3. Les icones de partage sur les réseaux sociaux
4. Les visualisations

Les visualisations externes peuvent être ajoutées en fin de page du jeu données.

![page d'un jeu de données](./images/user-guide-frontoffice/datasetpage.png)

### Le titre et la description
Le titre et la description du jeu de données permette de donner un contexte au données. La description présente les données, les différents traitements réalisés pour obtenir les données ou bien le producteur des données.

### Les metadonnées et les boutons d'actions

Les metadonnées sont disponibles sous forme de fiche. Elles contiennent le nombre des lignes, la taille du fichier csv, la source des données lorsque celle-ci est externe, la licence ainsi que le producteur des données lorsqu'il est renseigné.

Les boutons d'actions sont aussi présent dans cet encadré.
De gauche à droite : le tableau, le tableau en plein écran, la carte générique, la documentation de l'API, le téléchargement du fichier original, le téléchargement des données enrichies, le schéma des données, le code HTML pour intégrer le tableau ou la carte à un site ainsi que la cloche de notification pour s'abonner au jeu de données.

**Le tableau**

Le tableau vous permet d'accéder aux 10 000 premières lignes du fichier.

![Tableau](./images/user-guide-frontoffice/tableau-1.png)

Il contient plusieurs sections :
1. la recherche  
2. les pages de navigations  
3. le choix des colonnes  
4. le téléchargement  
5. les filtres sur une colonne  
6. le filtre sur une valeur d'une colonne  
7. la barre de navigation


![Tableau](./images/user-guide-frontoffice/tableau-2.png)

1. Les filtres sur les valeurs d'une colonne vous permettent de réaliser un filtre de type "égal à" ou "commence par" sur les colonnes avec du texte et de réaliser des filtres "supérieur ou égale à" ou "inferieur ou égal à" sur les colonnes avec des nombres. Vous pouvez réaliser plusieurs filtres. Le nombre de lignes filtrées est alors disponible sous la recherche.
2. Téléchargement des lignes filtrés sous différents formats.   
Le téléchargement aux format XLSX, ODS et Geojson sont limités aux 10 000 premières lignes.

![Tableau](./images/user-guide-frontoffice/tableau-3.png)

Les choix des colonnes permettent de sélectionner les colonnes que vous souhaitez afficher dans le tableau.  
Il est ensuite possible de télécharger le fichier avec seulement les colonnes que vous avez sélectionnées.

**Le tableau en plein écran**

Le tableau en plein écran possède les même fonctionnalités que le tableau.
1. la recherche  
2. les pages de navigations  
3. le choix des colonnes  
4. le téléchargement  
5. les filtres sur une colonne  
6. le filtre sur une valeur d'une colonne  
7. la barre de navigation  

![Tableau](./images/user-guide-frontoffice/tableau-full.png)

**La carte générique**

La carte générique présente des données géographiques. Un clic sur un des points ou géométries vous permet d'afficher les données brutes de l'élément.

![Tableau](./images/user-guide-frontoffice/carte-g.png)

**La documentation de l'API**

Chaque jeu de données possède sa propre API. La documentation interactive de l'API permet aux développeurs de réaliser des requêtes et de visualiser les résultats rapidement.

![Tableau](./images/user-guide-frontoffice/dataset-API.png)

**Le téléchargement du fichier original**
Le bouton de téléchargement dans les métadonnées vous permet de télécharger le fichier brut des données. Le format dépend du type de fichier importé par le producteur des données.

**Le téléchargement des données enrichies**
Le bouton de téléchargement dans les métadonnées vous permet de télécharger le fichier CSV contenant les données brutes ainsi que les données enrichies. Les données enrichies sont présentés sous la forme de colonnes en fin de tableau.

**Description des champs**

La description des champs correspond au schéma des données. Vous pouvez ainsi accéder à la clé, au nom, au type, au concept et à la description de chacune des colonnes du jeu de données.

![Tableau](./images/user-guide-frontoffice/dataset-schema.png)

**Le code d'intégration**

Le code d'intégration vous permet d'intégrer de tableau ou la carte d'un jeu de données directement sur votre sous forme d'une iframe.  
Les visiteurs de votre site auront ainsi accès aux données sans devoir naviguer vers le portail de données.

![Tableau](./images/user-guide-frontoffice/dataset-code.png)



**Les notifications**

Il est possible d'activer deux types de notifications sur un jeu de données :
* Mise à jour des données  
* Rupture de compatibilité des données  

La rupture de compatibilité des données correspond à une modification du schéma du jeu de données.

![Tableau](./images/user-guide-frontoffice/dataset-notif.png)

### Les icones de partage

Les icones de partage vous permettent de rapidement partage le lien de la page sur différents réseaux sociaux.  
La vignette du partage correspond à la vignette de la première visualisation de la page.

![Tableau](./images/user-guide-frontoffice/share-linkedin.png)


### Les visualisations

Les visualisations interactives facilitent l'accès et l'exploration du jeu de données.  
Les descriptions permettent de mieux comprendre les données et de découvrir certains points mis en avant par le producteur des données.  

En cliquant sur le titre d'une visualisation vous accéder à la page de la visualisation. Sur cette page, vous retrouvez la description et la visualisation est affichée en plus grand.