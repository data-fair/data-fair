---
title: Charts
section: 7
subsection : 7
updated: 2021-09-20
description : Histograms, lines, areas, radar ... visualize your data in interactive charts!
published: false
application : https://cdn.jsdelivr.net/npm/@koumoul/data-fair-charts@0.9/dist/
---


The **Charts** visualization allows to compare several columns of your data with each other in different charts :

* **Histogram**, chart in the form of vertical or horizontal columns, grouped or stacked.
* **Lines**, chart as single lines or multiple lines.
* **Areas**, chart in the form of areas and stacked areas.
* **Radar**, spider web chart.
* **Pie**, circle chart.

![Différentes visualisations](./images/user-guide-backoffice/Charts-Visu.jpg)

In this visualization, you can aggregate the values of your data.  
This visualization is a quite powerful, its configuration is more complex than other visualizations.

### Create a chart

To configure a **Chart** visualization, click on **Visualizations** in the navigation bar, then on **Configure visualization**.  

1. Choose the application **Chart**
2. Enter the title of your visualization

<p>
</p>

You are redirected to the configuration page of your application with its different sections:  

1. Information
2. Action buttons (full screen, integration on a site, capture, ...)
3. Configuration menu
4. Preview

![Page de configuration](./images/user-guide-backoffice/charts-config.jpg)

The title of the visualization can be changed anytime.  
The **Informations** section shows a summary of the characteristics of your application.

### Configuration Menu

The configuration menu contains five sub-menus: **Data**, **Type**, **Preparation**, **Presentation** and **Navigation**.

#### 1.Data


The **Data** menu allows to select the columns to display and to have the first preview of your chart.  

The **Data type** parameter allows to choose how you will represent your data. A different menu is displaued depending on the option you selected.  

- Option 1: **Read rows one by one**, the values ​​of your data are read directly from a column of your dataset.
- Option 2: **Group the rows and count them**, the rows of the dataset are grouped according to one or two criterias and the displayed values ​​represent the sum of rows for each group.
- Option 3: **Group the rows and aggregate**, the rows of the dataset are grouped according to one or two criterias and the displayed values ​​are the results of a calculation on a numerical column (sum, average, etc ...) that you choose.


<p>
</p>

1. **Read rows one by one** :
- **Values ​column** corresponds to the values re​​presented on the Y-Axis.
- **Columns of labels** corresponds to the values represented on the X-Axis, these values ​​can be sorted.
- **Sort by** allows you to sort your values.
- **Sequence** allows you to order to your sort.  
- **Maximum number of lines** allows to limit the number of elements in the legend.

<p>
</p>

2. **Group the rows and count them** :  
This option allows to group rows and count them on two levels. The first level corresponds to the value on the X-Axis, the second level corresponds to the legend.  

**1st level** on the X-axis:  
- **Group by**, define the method to group the values. The graph will be able to read the **exact values ​​of a column**, define **intervals of a date type column**, define **intervals of a numeric column**
- **Group according to this column** define the column you want to use on the X-axis.
- **Sort by** allows to choose a sorting method

**2nd level** in legend: This group level is optional, it allows to separate the values even more​. For example it's possible to separate a line into several lines or delimit different sections on a bar in a histogram.

<p>
</p>

3. **Group the rows and aggregate** :

- **Group by**, allows to define the method to group the values. The chart can read the **exact values ​​of a column**, set the **intervals of a date type column** or define **intervals of a numeric column**.  
- **Group according to this column** allows to define the column you want to use on the X-axis.
- **Sort by** allows to choose a sorting method.
- **Aggregate** options: average, minimum value, maximum value, sum
- **Values column** allows to choose the column for the aggregation.

#### 2.Presentation

This section allows you to choose a color palette to use on your application.

#### 3.Navigation

This section allows to define different types of interactive filters. The visualization with an interactive filter will be modified according to the values ​​provided in the filters by the visitor.

When you are satisfied with the preview click on **Save** to finalize your configuration.  
You can add a description at the bottom of the page and make your application public.  
You can consult it using the **consult** or **full screen** buttons.
