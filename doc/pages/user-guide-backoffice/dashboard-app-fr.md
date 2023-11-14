---
title: Tableau de bord
section: 9
subsection : 1
updated: 2023-11-14
description : Visualisation Tableau de bord
published: true
---

Les visualisations dashboards présentent vos données sous format tableau de manière attrayante et informative en facilitant la prise de décisions éclairées et la communication des résultats à un large public.  

## Créer un Dashboard

Pour réaliser votre visualisation, cliquez sur **visualisations** puis sur **configurer une visualisation**.

1. Choisir l’application **Dashboards**  
2. Entrer le titre de la visualisation
<p>
</p>

Vous êtes redirigé vers la page de configuration de votre application avec ses différentes sections :

1. Informations  
2. Boutons d’actions (plein écran, intégration sur un site, capture…) ;  
3. Menu de configuration ;  
4. Aperçu.


<img src="./images/user-guide-backoffice/dashboard-1.png"
     height="700" style="margin:15px auto;" alt="Metadonnées votre tableau de bord" />


Le titre de la visualisation peut être modifié.

Les informations vous donnent un résumé des caractéristiques de votre application.

Les boutons d’action vous permettent d’importer l’application sur un autre site, de la dupliquer, de la supprimer et d’y accéder en plein écran.

## Menu de configuration

Le menu de configuration est composé de cinq champs principaux : **changer de version**, **source des valeurs pour le filtre commun**, **colonne de libellé pour le filtre commun**, **titre** et **introduction**.  
Vous avez également la possibilité d’ajouter des sections supplémentaires ayant la faculté de comporter des éléments.

## Changer de version  
Dans le champ « **changer de version** », vous ne disposez que d’un seul choix pour le moment. Potentiellement, de nouvelles versions verront le jour.

## Source des valeurs pour le filtre commun  
Dans le champ « **sources des valeurs pour le filtre commun** », vous avez la possibilité de sélectionner votre jeu de données que vous avez chargé au préalable qui sera la source des valeurs pour le filtre commun.

## Colonne de libellé pour le filtre commun  
Dans le champ « **colonne de libellé pour le filtre commun** », vous avez la possibilité de choisir un champ (une colonne) de votre source. Vous devrez donc saisir un champ parmi les existants pour cibler la visualisation du Dashboard.

**1. Sections**

Après avoir compléter l’ensemble de ces informations, vous avez la possibilité d’ajouter des **Sections**.  
Cette configuration permet d’effectuer des éléments de comparaison à l'aide d’un concept.  
Un concept peut être public, vous pouvez le sélectionner parmi la liste exhaustive qui vous est proposée.

A contrario, vous avez la possibilité de créer un concept privé que vous pouvez renseigner dans l’onglet “**Paramètres**”, “**vocabulaire privé**”.

*Vous devez obligatoirement respecter la convention de nommage, sans cela, votre concept privé ne pourra pas être interprété*

Pour créer ce concept privé, vous devez renseigner un identifiant, un identifiant de vocabulaire extérieur et un titre ; de manière facultative, vous avez la possibilité de renseigner une description et une catégorie dans laquelle vous pourriez répertorier votre concept privé.

Une fois enregistré, vous pouvez paramétrer votre concept dans votre jeu de données, c’est exactement la même méthode que pour le concept public car il figurera dans la liste afin de pouvoir le sélectionner.

Pour ce faire, vous devrez effectuer les actions suivantes :

A. Titre  
Dans le champ « titre », vous avez la possibilité de renseigner le titre de votre section.

B. Description  
Dans le champ « **description** », vous avez la possibilité d’ajouter un texte en fonction de votre besoin qui s’insèrera juste en dessous de votre titre.  

C. Hauteur  
Dans le champ « **hauteur** », vous avez la possibilité d’augmenter ou de réduire la taille de votre section tout en saisissant une valeur ou bien en cliquant sur les flèches directionnelles qui portera une unité en pixel (px) à votre convenance.

**2. Elements**  
Après avoir compléter l’ensemble de ces informations, vous avez la possibilité d’ajouter des **Eléments** qui s’insèreront ci-dessous :  

A. Titre  
Dans le champ « titre », vous avez la possibilité de renseigner le titre de votre élément.   

B. Largeur  
Dans le champ « **largeur** », vous avez la possibilité de modifier la largeur de votre élément par « **fin** », « **moyen** », « **large** » et « **toute la largeur** » selon votre convenance.  

C. Type d’élément
Dans le champ « **type d’élément** », vous avez plusieurs scénarios comme la **prévisualisation table**, la **visualisation** et le **texte**.

**Prévisualisation table**  

Le modèle « **Prévisualisation table** » vous propose 3 types de format différents : en « **Tableau** », en « **Tableau dense** » et en « **Vignettes** ».

Il vous suffira de sélectionner la “**colonne du filtre commun**”, autrement dit, votre concept public ou privé. Vous avez la possibilité de cocher la case indiquant la nécessité de devoir sélectionner une valeur dans le filtre pour obtenir un résultat, vous allez donc choisir une valeur comprise dans la colonne du filtre commun saisie, ou non, en décochant cette case.  

Ci-dessous vous devez renseigner votre jeu de données dans “**dataset**” sur lequel vous souhaitez effectuer une comparaison.  

Pour finir vous avez la possibilité de modifier le type d’affichage, par défaut vous avez le format “**tableau**” :

<img src="./images/user-guide-backoffice/dashboard-2.png"
     height="700" style="margin:15px auto;" alt="Vue tableau" />


Vous pouvez très bien sélectionner le format “**Tableau dense**”, qui affichera l’intégralité des éléments du tableau :

<img src="./images/user-guide-backoffice/dashboard-3.png"
     height="700" style="margin:15px auto;" alt="Vue tableau dense" />

Et l’affichage en “**Vignettes**” :

<img src="./images/user-guide-backoffice/dashboard-4.png"
     height="700" style="margin:15px auto;" alt="Vue vignettes" />


Autre format qui fonctionne par bloc reprenant le libellé des colonnes de votre jeu de données pour chaque valeur de votre filtre commun.

**Visualisation**

Le modèle “**Visualisation**” vous permet de comparer un “**filtre commun**” entre 2 applications comportant un jeu de données chacun.

=> Exemple de cas d’utilisation :

J’ai créé ma **première** application de visualisation de Dashboard nommé “**Liste faune fougerets**”, dans lequel j’ai inséré mon jeu de données regroupant une liste de 10 lignes depuis un référentiel de données.  

Je vais donc créer une **deuxième** application de type graphique, par exemple, dans laquelle je vais insérer mon référentiel en jeu de données portant le nom “**référentiel faune fougerets**” tout en paramétrant une visualisation graphique en amont. Je vais donc pouvoir configurer cette visualisation graphique des éléments du filtre commun.  

<img src="./images/user-guide-backoffice/dashboard-5.png"
     height="700" style="margin:15px auto;" alt="Configuration de votre première visualisation" />


Une fois ma deuxième application créée, je peux retourner dans la configuration de ma première application “**Dashboard liste faune fougerets**”, afin d’y insérer cette nouvelle application de type graphique.   

<img src="./images/user-guide-backoffice/dashboard-6.png"
     height="700" style="margin:15px auto;" alt="Configuration de votre deuxième visualisation" />


En saisissant le type d’élément en « **texte** », vous avez la possibilité de saisir un “**contenu**” explicite.

<img src="./images/user-guide-backoffice/dashboard-7.png"
     height="700" style="margin:15px auto;" alt="Configuration d'un paragraphe de texte'" />
