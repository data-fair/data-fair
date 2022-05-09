---
title: Location info
section: 6
subsection : 5
updated: 2021-09-20
description : Project your geolocated data on a map with custom markers
published: true
application : https://koumoul.com/apps/infos-loc/0.9/
---

The **Location info** visualization allows to project geolocated data on a map. The coordinates are represented by a clickable marker with a personalized card on each point.


### Prerequisites

The data you want to project must contain latitudes and longitudes.  
The visualization supports Lambert 93, Lambert II and WGS 84 system projections.

### Configuration
#### 1.Concepts

To use your data in a **Location Info** visualization, [the concepts](./user-guide-backoffice/concept) **Latitude** and **Longitude** must be associated with the schema of the dataset you want to use.

Then, associate the concept **Label** with the corresponding column of your dataset.  
The values of this column will be used as card titles in your visualisation.  

You can combine other concepts such as **images**, **descriptions** or **web page** to better inform your data. These concepts will be used on the marker cards.  
Once you updated your data schema, you can preview your data using the **generic map** button. This allows to verify that your data is correctly projected on a map.

#### 2.Create a Location info map

Click on **Visualizations** then on **Configure a visualization**.


1. Choose the application **Location Info**
2. Enter the title of the visualization

<p>
</p>

You are redirected to the configuration page of your application with its different sections:  

1. Information
2. Action buttons (full screen, integration on a site, capture, ...)
3. Configuration menu
4. Preview

![Page de configuration](./images/user-guide-backoffice/infos-localisations-config.jpg)

The title of the visualization can be changed anytime.  
The **Informations** section shows a summary of the characteristics of your application.

### Configuration menu

The configuration menu contains four sub-menus: **Data**, **Render**, **Card** and **Navigation**.

#### 1.Data

In the **Data** menu, you choose the dataset you want to use.  

Note: If your dataset is not available in this menu, make sure you have updated the [concepts](./user-guide-backoffice/concept) **Latitude** and **Longitude** in your dataset.

#### 2.Render

In the **Render** menu, you can choose the **Map Style** that suits you the most.  
The **Color by value** defines the column used for the colors of your legend. You can choose the different colors you want to associate with your legend values.  

You can also choose **Icons by field value** to define the column used for the icons in your legend. You can define different icons for each value of one of your columns.

#### 3.Card

The marker cards display certain concepts automatically. For example, on the [European Heritage Days dataset](https://opendata.koumoul.com/reuses/carte-des-evenements-des-journees-europeennes-du-patrimoine-en-france-2019), the concepts **Latitude**, **Longitude**, **Label**, **Image**, **Description** and **Web page** are associated with the corresponding columns.


In the **Card** menu, you can add **Fields to be used** in order to display them in each of the marker files.  
You can add as much information as you want on a record, however, a card with a lot of information will be too large to display.

#### 4.Navigation

The **Navigation** menu is used to activate geolocation and define the initial position of the map.

When you are satisfied with the preview click on **Save** to finalize your configuration.  
You can add a description at the bottom of the page and make your application public.  
You can consult it using the **consult** or **full screen** buttons.
