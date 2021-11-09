---
title: Analytics setup
section: 11
subsection : 2
updated: 2021-11-09
description : Configure your analytics
published: false
---

There are 2 steps in the  configuration of the user tracking system
1. Choosing the monitoring system on the portal
2. Event configuration

You can choose between three different tracking systems, Matotmo, Google Analytics Universal Analytics (old version of GA) and Google Analytics 4 (new version of GA).

### Matomo configuration

After creating the web site on Matoto, it will provide **tracker url** and **th site id** of your portal. You can then enter these codes on the configuration of your portal.

### Google Analytics UA (old tracking system)

For Google Analytics Universal Analytics you will need the **Tracking ID** which you can find after creating your property on Google Analytics: **Administration**> **Property Settings**> **Tracking ID** .  
The tracking ID is a code starting with UA- *

You can then enter this code on the configuration of your portal.

![Configuration](./images/user-guide/config-GA-1.jpg)

### Google Analytics 4 (new tracking system)

For Google Analytics Universal Analytics you will need the **MEASURE ID** which you can find after creating your property on Google Analytics: **Administration**> **Property settings**> **Data feed** > Add or click on data feed> **MEASUREMENT ID**.  
The measure ID is a code starting with G- *.

You can then enter this code on the configuration of your portal.

![Configuration](./images/user-guide/config-GA4.jpg)

### Event configuration

The event configuration is available in the Data Fair settings in the **Webhooks** category.

You can select which events you want to track in your analytics:
* A new dataset has been created
* A dataset has encountered an error
* A dataset has been finalized and uploaded
* A dataset has been published to a catalog
* A dataset has been downloaded in a file format
* A new reuse has been created
* A reuse encountered an error
* A reuse has been published in a catalog
* The file of a dataset has been updated
* A filtered extract of a dataset has been downloaded in a file format

![Configuration](./images/user-guide/config-GA-2.jpg)
