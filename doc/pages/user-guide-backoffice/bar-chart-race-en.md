---
title: Bar Chart Race
section: 7
subsection : 1
updated: 2021-09-20
description : Data racing for first place
published: false
application : https://koumoul.com/apps/bar-chart-race/0.2/
---

**Bar Chart Race** represent rankings data over time.  
An example of this visualization is the [evolution of wages by region between 1966 and 2010 in France](https://opendata.koumoul.com/reuses/evolution-des-salaires-selon-la-region-entre-1966-et-2010)

### Prerequisites

The data you want to visualise must have a column containing a temporality. In the evolution of wages example, the temporality is the years.


### Bar Chart Race initialization

To configure a **Bar Chart Bace** visualization, click on **Visualizations** in the navigation bar, then on **Configure visualization**.  

1. Choose the application **Bar Chart Race**
2. Enter the title of your visualization

<p>
</p>

You are redirected to the configuration page of your application with its different sections:  

1. Information
2. Action buttons (full screen, integration on a site, capture, ...)
3. Configuration menu
4. Preview

![Page de configuration](./images/user-guide-backoffice/barchart-config.jpg)


The title of the visualization can be changed anytime.  
The **Informations** section shows a summary of the characteristics of your application.  

### Configuration menu

The configuration menu contains three submenus : **Sources**, **Preparation** and **Presentation**.  

#### 1.Sources
**Sources** allows to choose a dataset and define the **Filters**. **Filters** restrict the data displayed in the visualization.  
It's possible to **Restrict to Values** from a column, **Restrict to Range of Values** from a column, or **Exclude Values** from a column.  

#### 2.Preparation
**Preparation** section define which columns you will use in your visualization.  
* **Calculation** allows to count rows, sum or average on column values.
* **Column** allows to choose the column used for the **Calculation**.
* **Time field** allows to choose the column containing the time values.
* **Value field** allows to define the column containing the labels used on each bar.

Once all the options are filled in, you have a first glimpse of your visualization.

![Premier aperçu](./images/user-guide-backoffice/barchart-preparation.gif)  
*Evolution of the ranking of Ligue 1 teams for the 2016-2017 season*

#### 3.Presentation
The **Presentation** submenu allows to modify the **Maximum number**, the **Duration in seconds**, the **Width**, the **Position**, the colors of the bars of bars and if the visualization starts automatically.

When you are satisfied with the preview click on **Save** to finalize your configuration.  
You can add a description at the bottom of the page and make your application public.  
You can consult it using the **consult** or **full screen** buttons.
