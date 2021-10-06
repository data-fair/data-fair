---
title: Graphiques
section: 5
subsection : 7
updated: 2021-09-20
description : Histogrammes, lignes, aires, radar... visualiser vos données dans des graphiques interactifs!
published: false
application : https://cdn.jsdelivr.net/npm/@koumoul/data-fair-charts@0.9/dist/
---


La visualisation **Graphiques** vous permet de comparer plusieurs colonnes de vos données entre elles sous différents formes graphiques:

* **Histogramme**, graphiques sous formes de colonnes verticales ou horizontales, groupées ou empilées.
* **Lignes**, graphiques sous formes de ligne simples ou de lignes multiples.
* **Aires**, graphiques sous formes d'aires et aires empilées.
* **Radar**, graphiques sous formes de toile d'araignée.
* **Camembert**, graphiques sous formes de camembert.

![Différentes visualisations](./images/user-guide/Charts-Visu.jpg)

Dans cette visualisation, vous pouvez agréger les valeurs de vos données.  
Il s'agit d'une visualisation assez puissante et c'est pour cela que sa configuration est plus complexe que les autres visualisations.

### Créer un graphique

Pour réaliser la visualisation, cliquez sur **Visualisations** dans la barre de navigation, puis sur **Configurer une visualisation**.

1. Choisir l'application **Graphiques**
2. Entrer le titre de la visualisation

<p>
</p>

Vous êtes redirigé vers la page de configuration de votre application avec ses différentes sections:

1. Informations
2. Boutons d'actions (plein écran, intégration sur un site, capture, ... )
3. Menu de configuration
4. Aperçu

![Page de configuration](./images/user-guide/charts-config.jpg)

Le **titre** de la visualisation peut être modifié.  
Les **informations** vous donnent un résumé des caractéristiques de votre application.  

### Menu de configuration
Le menu de configuration est composé de cinq sous-menus : **Sources de données**, **Type de visualisation**, **Préparation des données**, **Présentation** et **Navigation**.

#### Sources des données
Dans le menu **Sources de données**, vous pouvez choisir le jeu de données que vous voulez utiliser.  
Lorsque vous choisissez la source de données, vous pouvez configurer des filtres pour restreindre ou exclure des valeurs dans vos données.

#### Type de visualisation
Dans ce menu, vous choisissez le type de graphique que vous voulez réaliser.  
Vous pouvez représenter vos données sous formes d'un histogramme, de diagramme en lignes, en aires, d'un radar ou d'un camembert.

#### Préparation des données
Le menu **Préparation des données** permet de renseigner les colonnes que vous souhaitez afficher et d'avoir le premier aperçu de votre graphique.

Le paramètre **Type de préparation des données** permet de choisir comment vous allez représenter vos données. Vous avez un menu diffèrent en fonction de l'option que vous avez choisi.

- Option 1 :  **Lire les lignes une par une**, les valeurs de vos données sont lues directement depuis une colonne de votre jeu de données.  
- Option 2 : **Grouper les lignes et les compter**, les lignes du jeu de données sont groupées selon un ou deux critères et les valeurs affichées représente la somme du nombre lignes pour chaque groupe.  
- Option 3 : **Grouper les lignes et calculer des valeurs dans ces groupes**, les lignes du jeu de données sont groupées selon un ou deux critères et les valeurs affichées sont les résultats d'un calcul sur une colonne numérique (somme, moyenne, etc...) que vous choisissez.

<p>
</p>

1. **Lire les lignes une par une** :  
- **Colonne des valeurs** correspond aux valeurs présentées en ordonnée.  
- **Colonnes des libellés** correspond à la colonne représenté en abscisses, ces valeurs peuvent être triées.  
- **Trier par** permet de trier vos valeurs.
- **Ordre** permet donner un ordre à votre tri.  
- **Nombre maximal de lignes** permet de délimiter le nombre d'éléments dans la légende.

<p>
</p>

2. **Grouper les lignes et les compter** :  
Cette option permet de grouper les lignes et les compter sur deux niveaux. Le premier niveau correspond à la valeur en abscisse, le second niveau correspond à la légende.
- **1re niveau de groupes** en abscisse:
- **Grouper par** , vous permet de définir la méthode pour grouper les valeurs. Le graphique pourra lire les **valeurs exacte d'une colonne**, définir **intervalles d'une colonne de type date**, définir des **intervalles d'une colonne numérique**
- **Grouper en fonction de cette colonne** permet de définir la colonne que vous voulez utiliser en abscisse.  
- **Trier par** permet de choisir une méthode de tri pour la colonne choisie
- **2ème niveau de groupes** en légende : Ce niveau de groupe est optionnel, il permet de séparer les valeurs quand les données le permettent. On peut par exemple séparer une ligne en plusieurs lignes dans un graphique en lignes ou encore  délimiter différentes sections par barre dans un histogramme.

<p>
</p>

3. **Grouper les lignes et calculer des valeurs dans ces groupes** :  
- **Grouper par** , vous permet de définir la méthode pour grouper les valeurs. Le graphique pourra lire les **valeurs exacte d'une colonne**, définir * **intervalles d'une colonne de type date**, définir des **intervalles d'une colonne numérique**.  
- **Grouper en fonction de cette colonne** permet de définir la colonne que vous voulez utiliser en abscisse.  
- **Trier par** permet de choisir une méthode de tri pour la colonne choisie.  
- **Type de calcul** possibles : moyenne, valeur minimale, valeur maximale, somme.  
- **Colonne de valeurs** permet de choisir la colonne sur laquelle faire le calcul.

#### Présentation
Cette section vous permet de choisir une palette de couleur à utiliser sur votre application.

#### Navigation
Cette section vous permet de définir différents types de filtres interactifs. La visualisation avec un filtre interactif sera modifiée en fonction des valeurs fournies dans les filtres.

Lorsque vous avez un aperçu qui vous satisfait, cliquez sur **Enregistrer** pour finaliser votre configuration.  
Vous pouvez ajouter une description en bas de page et rendre publique votre application.  
Votre application est configurée et vous pouvez la consulter à l'aide des boutons **consultation** ou **plein écran**.
