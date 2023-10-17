---
title: Page d'un jeu de données
section: 3
subsection : 1
updated: 2022-04-25
description : Accéder aux données du portail
published: true
---

La page d'un jeu de données est composé de plusieurs éléments&nbsp;:
1. Le titre et la description du jeu de données&nbsp;;
2. Les métadonnées du jeu de données et les boutons d'action&nbsp;;
3. Les icônes de partage sur les réseaux sociaux&nbsp;;
4. Les visualisations.

Les visualisations externes peuvent être ajoutées en fin de page du jeu de données.

<img src="./images/user-guide-frontoffice/datasetpage.png"
     height="600" style="margin:15px auto;" />

## Le titre et la description
Le titre et la description du jeu de données permettent de donner un contexte aux données. La description présente les données, les différents traitements réalisés pour les obtenir ou bien le producteur des données.

## Les métadonnées et les boutons d'action

Les métadonnées sont disponibles sous forme de fiche. Elles contiennent le nombre de lignes, la taille du fichier CSV, la source des données lorsque celle-ci est externe, la licence, ainsi que le producteur des données lorsqu'il est renseigné.

Les boutons d'action sont aussi présents dans cet encadré.
De gauche à droite&nbsp;: le tableau, le tableau en plein écran, la carte générique, la documentation de l'API, le téléchargement du fichier original, le téléchargement des données enrichies, le schéma des données, le code HTML pour intégrer le tableau ou la carte à un site ainsi que la cloche de notification pour s'abonner au jeu de données.

**Le tableau**

Le tableau vous permet d'accéder aux 10&nbsp;000 premières lignes du fichier.

<img src="./images/user-guide-frontoffice/tableau-1.png"
     height="400" style="margin:15px auto;" />

Il contient plusieurs sections&nbsp;:
1. la recherche&nbsp;;  
2. le mode de visualisation des lignes&nbsp;;
3. le choix des colonnes&nbsp;;  
4. le téléchargement&nbsp;;  
5. les filtres sur une colonne&nbsp;;  
6. le filtre sur une valeur d'une colonne.  


<img src="./images/user-guide-frontoffice/tableau-2.png"
     height="350" style="margin:15px auto;" />

1. Les filtres sur les valeurs d'une colonne vous permettent de réaliser un filtre de type &laquo;&nbsp;égal à&nbsp;&raquo; ou &laquo;&nbsp;commence par&nbsp;&raquo; sur les colonnes avec du texte et de réaliser des filtres &laquo;&nbsp;supérieur ou égal à&nbsp;&raquo; ou &laquo;&nbsp;inférieur ou égal à&nbsp;&raquo; sur les colonnes avec des nombres ou des dates. Vous pouvez réaliser plusieurs filtres. Le nombre de lignes filtrées est alors disponible à côté de la recherche.
2. Téléchargement des lignes filtrés sous différents formats.   
Le téléchargement aux formats XLSX, ODS et GeoJSON sont limités aux 10&nbsp;000 premières lignes.

<img src="./images/user-guide-frontoffice/tableau-3.png"
     height="350" style="margin:15px auto;" />

Les choix des colonnes permettent de sélectionner les colonnes que vous souhaitez afficher dans le tableau.  
Il est ensuite possible de télécharger le fichier avec seulement les colonnes que vous avez sélectionnées.

<p></p>

**Le tableau en plein écran**

Le tableau en plein écran possède les mêmeS fonctionnalités que le tableau.

<img src="./images/user-guide-frontoffice/tableau-full.png"
     height="300" style="margin:15px auto;" />

 1. la recherche&nbsp;;
 2. le mode de visualisations des lignes&nbsp;;
 3. le choix des colonnes&nbsp;;  
 4. le téléchargement&nbsp;;  
 5. les filtres sur une colonne&nbsp;;  
 6. le filtre sur une valeur d'une colonne.  

<p></p>

**La carte générique**

La carte générique présente des données géographiques. Un clic sur un des points ou géométries vous permet d'afficher les données brutes de l'élément.

<img src="./images/user-guide-frontoffice/carte-g.png"
     height="300" style="margin:15px auto;" />

**La documentation de l'API**

Chaque jeu de données possède sa propre API. La documentation interactive de l'API permet aux développeurs de réaliser des requêtes et de visualiser les résultats rapidement.


<img src="./images/user-guide-frontoffice/dataset-API.png"
     height="600" style="margin:15px auto;" />

**Le téléchargement du fichier original**
Le bouton de téléchargement dans les métadonnées vous permet de télécharger le fichier brut des données. Le format dépend du type de fichier importé par le producteur des données.

**Le téléchargement des données enrichies**
Le bouton de téléchargement des données enrichies vous permet de télécharger le fichier CSV contenant les données brutes ainsi que les données enrichies. Les données enrichies sont présentés sous la forme de colonnes en fin de tableau.

**Description des champs**

La description des champs correspond au schéma des données, autrement dit&nbsp;: à l'ensemble des colonnes présentes dans votre jeu de données. Vous pouvez ainsi accéder à la clé, au nom, au type, au concept et à la description de chacune des colonnes du jeu de données.

**Le code d'intégration**

Le code d'intégration vous permet d'intégrer de tableau ou la carte d'un jeu de données directement sur votre site sous forme d'une iframe.  
Les visiteurs de votre site auront ainsi accès aux données sans devoir naviguer vers le portail de données.

<img src="./images/user-guide-frontoffice/dataset-code.png"
     height="300" style="margin:15px auto;" />


**Les pièces jointes**

Les pièces jointes correspondent à des fichiers ajoutés en complément du jeu de données. Ils peuvent contenir un dictionnaire de variable, une présentation au format PDF des données ou encore une image correspondant aux données.

**Les notifications**

Il est possible d'activer deux types de notifications sur un jeu de données&nbsp;:
* Mise à jour des données&nbsp;;  
* Rupture de compatibilité des données.  

La rupture de compatibilité des données correspond à une modification du schéma du jeu de données.

<img src="./images/user-guide-frontoffice/dataset-notif.png"
     height="200" style="margin:15px auto;" />

## Les icônes de partage

Les icônes de partage vous permettent de partager rapidement le lien de la page sur différents réseaux sociaux.  
La vignette du partage correspond à la vignette de la première visualisation de la page.

## Les visualisations

Les visualisations interactives facilitent l'accès et l'exploration du jeu de données.  
Les descriptions permettent de mieux comprendre les données et de découvrir certains points mis en avant par le producteur des données.  

En cliquant sur le titre d'une visualisation, vous accédez à sa page. Sur cette page, vous retrouvez la description et la visualisation affichée en plus grand.
