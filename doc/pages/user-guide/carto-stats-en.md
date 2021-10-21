---
title: Carto-stats
section: 6
subsection : 1
updated: 2021-09-20
description : Project your geolocated data on a map.
published: false
application : https://koumoul.com/apps/carto-stats/0.6/
---

**Carto-stats** visualization is a map with geolocated data and dynamic filters.  
An example of this visualization is the [bicycle accidents map](https://opendata.koumoul.com/reuses/cartographie-des-accidents-de-velo/full).


Carto-stats allows to create dynamic filters and to have filtered data on the map.  
Compared to [Infos-location](./user-guide/infos-localisations), **Carto-stats** will be more suitable for large data and **Info-locations** will be more suitable for data containing special fields such as URL, images, descriptions, ...

## Concepts

To configure a **Carto-stats** visualization, your active account contains a monthly dataset with [concepts] (./ user-guide / concept) **Latitude** and **Longitude** of associates in its schema.  
Once you have updated your data schema, you can preview your data using the **generic map**. YOu can verify that the data is correctly projected on a map.

## Create a Carto-stats map

To configure a **Carto-stats** visualization, click on **Visualizations** in the navigation bar, then on **Configure visualization**.  

1. Choose the application **Carto-stats**
2. Enter the title of your visualization

<p>
</p>

You are redirected to the configuration page of your application with its different sections:  

1. Information
2. Action buttons (full screen, integration on a site, capture, ...)
3. Configuration menu
4. Preview

![Page de configuration](./images/user-guide/carto-stats-config.jpg)

The title of the visualization can be changed anytime.  
The **Informations** section shows a summary of the characteristics of your application.  

## Configuration menu

The configuration menu contains three submenus : **Sources**, **Preparation** and **Presentation**.  

### Sources

**Sources** allows to choose a dataset.  

Once you have choosen a dataset compatible with the **Carto-stats** visualization, a map preview is displayed with geolocalised data.

You can configure dynamic filters, predefined filters and a slider.

* Dynamic filters allow to choose fields that will be available to users of your visualization. These users will be able to use the filters to restrict the number of dots on the map.
* Predefined filters allow to restrict or exclude values ​​in your data. The fields, or values, that you configure in this section will not be available in your visualization.
* The Slider allows to choose an integer field, such as a **year** field. The user will be able to choose a year value on the slider, the data will be filtered on this year and displayed on the map.

### Render options


In the menu **Render options**, you can customize the cards available on the markers and customize your legend.  

The **Tooltip** menu allows you to select the different fields to be displayed on the cards of your markers.  
The **Color by value of a field** defines the column used for your legend. The palette allows to choose a set of colors that will be associated with your legend values.

### Navigation

In the **Navigation** menu, you can hide the search bar and set the initial position of the map

When you are satisfied with the preview click on **Save** to finalize your configuration.  
You can add a description at the bottom of the page and make your application public.  
You can consult it using the **consult** or **full screen** buttons.
