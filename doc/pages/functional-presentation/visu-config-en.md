---
title: Configure visualizations
section: 3
subsection : 2
description : Configure visualizations
published: false
---

Interactive visualizations make it possible to present the data in a synthetic way and offer the user the possibility of manipulating them to understand them more quickly. They are served by light Web applications, this allows direct consultation on any type of Web terminal, or iframe integration in portals or institutional sites.

### Intuitive setup
Visualizations can be configured through a graphical interface that **requires no programming skills**. The configuration menu consists of different sections which differ according to the applications. Most of the time, the menu consists of three sections: data source, rendering options, and navigation related items. It is often possible to filter the data if you do not want to represent the entire dataset.

<img src="./images/functional-presentation/configuration-visu.jpg"
     height="300" style="margin:20px auto;" />

A preview renders the visualization. When changes are made in the configuration menu, they are directly represented in the preview. It is thus possible to quickly modify and test different renderings of the visualization, in **draft mode**. When the rendering is satisfactory, saving makes it possible to validate the modifications made. The changes are then visible on all posts in the visualization.

### Types of visualizations
Data&nbsp;Fair offers a wide variety of visualizations in constant progression, there are today nearly a **thirty different visualizations**. ([This section](./interoperate/applications) describes in detail how to create them).


#### Map visualizations

Several applications can display geolocated data. *Location info* allows you to display **markers** which, when clicked, present a **detailed sheet**, possibly accompanied by an image. *Carto stats* displays data in the form of **colored circles and proportional** to a data in a column, it lends itself well to the visualization of a **large number of points**. *Geo shapes* is suitable for displaying **complex geometries**, for example a road network or a PLU.

<img src="./images/functional-presentation/visu-carto.jpg"
     height="300" style="margin:20px auto;" />

Other applications are adapted to territorialized data, these are data with at least one territory code: municipality code, department or even plot code. *Plot info* allows data to be projected on the French **cadastral map**. *Multi-Level Territorial Mapping* displays a **choropleth map** of territories from IRIS to Region and is suitable for presenting data such as election results or other indicators. *Catchment areas* allows you to **merge the geometries of the territories** to have coverage areas, for example the perimeter of action of the gendarmeries.

#### Visualizations in diagrams

As soon as the data has columns with numeric types, it is possible to configure chart visualizations for them. *Various graphs* allows to make different types of common graphs: **histograms, lines, areas, pie charts**, ... *Sankey diagram* is suitable for **flow visualization**. *Radar Chart* compares rows of data on **different criteria**. *Comparison of proportions* produces waffle diagrams, for example to compare the distribution of elements according to different categories.

<img src="./images/functional-presentation/visu-diag.jpg"
     height="300" style="margin:20px auto;" />

*Graphs / Networks* and *Network of relations* allow you to make **graphs**, in the first case using nodes and links, and in the second case based on 2 criteria in 2 different columns of a dataset. For **hierarchical data**, 2 visualizations are available: *Treemap* and *Sunburst Diagram*, and are well suited to visualize budget or aid allocation data.

#### Time visualizations

Data with date-related concepts can be visualized with time visualizations. Some are interactive, such as *Time series* which allows you to compare **curves over time** (deaths linked to covid for example), or *Timeline diagram* and *Calendar* to view data with start dates and end dates.

<img src="./images/functional-presentation/visu-temp.jpg"
     height="300" style="margin:20px auto;" />

Other time visualizations are animated: they have a play button and the user can watch them passively. These visualizations are interesting for social networks because they allow to attract the attention of users, who do not have to click on the link to see the result. *Bar chart race* allows you to see races of horizontal bars and is suitable when there is a **significant number of elements that have the maximum value**, for example to see the first name given the most over time. *Periodic Series* allows you to analyze **cyclical data** to see how it behaves from one period to another (for example temperatures or vehicle traffic).

#### Text visualizations

This type of visualizations present data as text, including numeric data. *Metrics* allows you to highlight **key figures** in the form of tiles. *Summary table* calculates **aggregates on 1 or 2 axes**, and can for example show averages of a value by department. *Simple Table* makes it possible to display a few columns of the dataset by proposing **filters or a tree structure** to access the data more quickly (for example region > department > municipality). *Word Cloud* analyzes the frequency of different terms in a dataset, or one of its columns, to highlight those that are most present.

<img src="./images/functional-presentation/visu-text.jpg"
     height="150" style="margin:20px auto;" />

It is also possible to create a search engine to be able to explore its data in the form of files with *List and files*. This is well suited when the data has columns with long texts, which are not easy to read in a table view. The rendering of the sheets can be finely configured and it is even possible to make a pdf rendering of the data set. This application is well suited for making directories or catalogs.

#### Gamification

In addition to the "traditional" data visualizations, it is possible to configure mini-games. The game is one of the **best ways to learn** and allows you to memorize certain things without sometimes even realizing it. This helps to make the data **more attractive**, promotes the engagement of users who can retry the games several times until they have a good score and **increase the visibility of the data** on social networks via the mechanisms sharing scores and "challenging".

<img src="./images/functional-presentation/visu-jeu.jpg"
     height="150" style="margin:20px auto;" />

*Location Game* is for geolocated data and requires placing items on a map. *Quizz Game* allows you to carry out a multiple choice questionnaire. *Sorting game* asks the user to sort data by drag and drop to classify them according to a certain criterion, for example to sort food according to their carbon footprint. All these games take time into account when calculating the score, to avoid "cheating" and encourage the user to memorize the correct answers by trial and error.

#### Other visualizations
Some visualizations don't easely fall into a category, we mention them here. *Slideshow* displays data with **images attached**. *Input form* offers the possibility of collecting feedback directly stored in a dataset, of doing **crowd sourcing** or of offering a data update interface that is lighter than the entire back- office for someone who would only be responsible for updating one dataset.

There are also visualizations that are specifically **adapted to data schemas**, such as *deliberations* or *equipment* published according to the **Common Base of Local Data (SCDL)** schemas.

### Permissions and publication of visualizations

The permission and publishing mechanisms for visualizations are the same as for datasets. By default, a visualization is private. It can be made public later. In any case, it is recommended to fill in a description. This description is visible on the viewing page of the visualization, but also on the page of the associated dataset.

It is also possible to share a private visualization with unauthenticated users. This is done by generating a sharing link which contains a secret code. Anyone who knows this link can access the visualization, even if the data they use is private. If the link is compromised, it can be deleted and then regenerated with a different passcode. This makes it possible to embed visualizations in private sites, without having to create one or more user accounts and transmit access credentials.
