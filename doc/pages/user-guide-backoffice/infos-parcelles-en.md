---
title: Parcel info
section: 6
subsection : 4
updated: 2021-09-20
description : Project your data on the French cadastral map.
published: true
application : https://koumoul.com/apps/infos-parcelles/2.4/
---

The **Parcel Info** visualization allows you to project your data onto an interactive French cadastral map.

### Prerequisites

To view your data on **Parcel Info**, your dataset must contain a column of **parcel identifiers of 14 characters**.  
These identifier (or parcel code) are made up of this method: common INSEE code of 5 digits + cadastre section code of 5 characters + cadastral parcel number of 4 digits = structured parcel identifier for Parcel info.


For example **56197037ZC0063** is a valid code for **Parcel info**. An exemple is the [dataset of agricultural plots managed by the agricultural management of the City of Toulouse](https://koumoul.com/s/data-fair/api/v1/datasets/domaine-agricole-toulouse/full) which has a column with identifiers of 14 characters valid for Parcel info.

Your dataset must also contain latitudes and longitudes associated with each field code.  
If you only have 14 character identifiers, it is possible to [enrich your dataset](./user-guide-backoffice/enrichment) and import the latitudes and longitudes according to the parcel identifiers with the help for the **cadastre** enrichment of the Koumoul platform.

### Concepts

To configure a **Parcel info** visualization, your active account contains a data set with [concepts](./user-guide-backoffice/concept) **Parcel code**, **Latitude** and **Longitude** associated in its schema.

Once you update your data schema, the **Map** preview is available in the **Data** section. This allows to verify that your data is correctly projected on a map.

### Create a Parcel info visualization

lick on **Visualizations** then on **Configure a visualization**.


1. Choose the application **Parcel info**
2. Enter the title of the visualization

<p>
</p>

You are redirected to the configuration page of your application with its different sections:  

1. Information
2. Action buttons (full screen, integration on a site, capture, ...)
3. Configuration menu
4. Preview

![Page de configuration](./images/user-guide-backoffice/infos-parcelles-config.jpg)

The title of the visualization can be changed anytime.  
The **Informations** section shows a summary of the characteristics of your application.

### Configuration menu

The configuration menu contains four sub-menus: **Data**, **Render** and **Navigation**.

#### 1.Data

In the **Data** menu, you choose the dataset you want to use.  

Note: If your dataset is not available in this menu, make sure you have updated the [concepts](./user-guide-backoffice/concept) **Latitude**, **Longitude** and **Parcel Code** in your dataset.

#### 2.Render

In the **Render** menu, the **Color by value** defines the column used for the colors of your legend. You can choose the different colors you want to associate with your legend values.  

In the **Tooltip** parameter, you can select multiple columns to display when a user clicks on a parcel.

You can have a 3D render with the **Field height**.

#### 3.Navigation

The **Navigation** menu is used to activate geolocation and define the initial position of the map.

When you are satisfied with the preview click on **Save** to finalize your configuration.  
You can add a description at the bottom of the page and make your application public.  
You can consult it using the **consult** or **full screen** buttons.
