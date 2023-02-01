---
title: Cartographic workshop
section: 6
subsection : 7
updated: 2022-06-30
description : Visualiser différentes données sur une carte
published: false
application : https://koumoul.com/apps/atelier-carto/1.0/
---

The **Cartographic workshop** visualization allows to project geolocated data onto a map.

You have an example of this visualization on [Move by bike](https://opendata.koumoul.com/reuses/se-deplacer-a-velo/full).


## Concepts

To configure a **Cartographic workshop** visualization, your active account contains at least one dataset with [concepts](./user-guide-backoffice/concept)  **Latitude** et **Longitude** / **Geometry** associated with the columns of its schema.  

## Create a Cartographic Workshop visualization

To create your visualization, click on **Visualizations** then on **Configure a visualization**.

1. Choose the visualization **Cartographic workshop**
2. Enter the visualization title and save

<p>
</p>

You are redirected to the configuration page of your application with its different sections:

1. Information
2. Action buttons (full screen, integration on a site, capture, ...)
3. Configuration menu
4. Preview

![Page de configuration](./images/user-guide-backoffice/carto-factory.jpg)

The title of the visualization can be changed anytime.  
The **Informations** section shows a summary of the characteristics of your application.  

## Configuration menu

The configuration menu contains three submenus : **Data layers** and **Other options**.

### 1.Data Layers
In the **Data Layers** section, you add the layers present in your visualization.  
A layer corresponds to a dataset containing geographic data.  
You can add multiple layers, each layer will have its own configuration.

When you add a layer, a new window is displayed. This window allows you to configure how your layer data is rendered using the **Data Source**, **Details On Click**, **Display Type** and **Color Adjustments* sections. *.

Note: If your file is not available in the **Data Source** section, check that you have updated [concepts](./user-guide-backoffice/concept) **Latitude** and **Longitude** or **Geometry** in your dataset.

**Details On Click** allows to select multiple columns to display in the legend when a user of your visualization clicks on an item on your layer

**Display type** allows to define the representation of your layer: a single icon, icons based on the values ​​of a field, circles or even the geometries present in the dataset used for your layer.

**Color Settings** allows you to set the colors used by your layer.  
You can use a single color, colors based on values ​​in an interval, or based on values ​​in a set.
Single color can be set in configuration.  
When working with colors based on values ​​within a range, you have three palette type options: **Gradient Between Different Colors**, **Gradient Same Color Tone**, or **Specific Colors**.  
The **Field containing values** allows you to define the numeric column represented by the colors.  
You can then define intervals **of the same size**, by **quantiles** or in **manual adjustment**.

### 2.Other options

In this section you can:
* set the **Map Style** among nearly 10 different styles
* show/hide search by address
* enable geolocation
* set the initial position of your map
