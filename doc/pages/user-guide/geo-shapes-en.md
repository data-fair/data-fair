---
title: Geo Shapes
section: 6
subsection : 3
updated: 2021-09-20
description : Visualize geometric data on a map.
published: false
application : https://koumoul.com/apps/data-fair-geo-shapes/0.1/
---

The **Geo Shapes** visualization display geometric data on a map. It is thus possible to visualize data such as the zoning of the PLU or energy networks.  
An example is the [map of the Angers Loire Métropole PLU zones](https://opendata.koumoul.com/reuses/plu-zone-urba-angers-loire-metropole/full).  
You can click on each zone to get more details and click on a zone type in the legend to filter by zone type.

### Configuration
#### Concepts  

To configure a **Geo Shapes** visualization, your active account contains at least one dataset with the [concept](./user-guide/concept) **GeoJSON geometry** to be able to project your data on the map.

Once you updated your data schema, you can preview your data using the **generic map** button. This allows to verify that your data is correctly projected on a map.

#### Create a Geo Shapes visualization

Click on **Visualizations** then on **Configure a visualization**.


1. Choose the application **Geo Shapes**
2. Enter the title of the visualization

<p>
</p>

You are redirected to the configuration page of your application with its different sections:  

1. Information
2. Action buttons (full screen, integration on a site, capture, ...)
3. Configuration menu
4. Preview

![Page de configuration](./images/user-guide/geo-shapes-config.jpg)

The title of the visualization can be changed anytime.  
The **Informations** section shows a summary of the characteristics of your application.

#### Configuration menu
The configuration menu contains three submenus: **Data**, **Render** and **Presentation**.

##### Data
In the **Data** menu, you choose the dataset you want to use.
Once you chose a dataset compatible with the **Geo Shapes** visualization, a map preview is displayed.  

##### Render


In the **Render** menu, the **Value color** defines the column used for your legend. A legend color can be defined by clicking on the **color** circle or each legend value. You manage the legend order with a drag and drop on the hamburger menu.  

The **Details Fiels** allows to choose the fields to display when a user clicks on a geometric shape. Without any value in this section, the side panel will only be useful for navigation.  
The **map style** allows to modify your basemap. You can customize the basemap of your application to have a better rendering.

##### Navigation

The **Navigation** menu is used to activate geolocation and define the initial position of the map.

When you are satisfied with the preview click on **Save** to finalize your configuration.  
You can add a description at the bottom of the page and make your application public.  
You can consult it using the **consult** or **full screen** buttons.
