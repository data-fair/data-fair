---
title: Webhooks
section: 12
subsection: 3
updated: 2021-09-20
description : Keep informed on your data
published: true
---

**Webhooks** are used to synchronize computer systems. It is possible to send messages during updates on data for example.

List of triggering events:

* Creation of a dataset
* Errors on a dataset
* Finalization of a dataset
* Publication of a dataset in a catalog
* Downloading a dataset
* Creation of a visualization
* Error on a visualization
* Publication of a visualization in a catalog

## Configure the event tracking for Google Analytics

To configure event tracking for Google Analytics, you will need a [Google Analytics account](https://support.google.com/analytics/answer/1008015?hl=fr)
with a configured property and a UA-XXXXXXXX-X number configured for your site.

Once you configured your Google Analytics account and got your UA-XXXXXXXX-X number, you can use it on the **Webhooks** section of your Data Fair account.

When you are on the settings page, you can add an 'External calls' using the **+** button.  
A window appears to configure your call.  
Fill in the title, the trigger events you want to track from the list, then choose **Google Analytics** as the target type.  
In the Tracker ID section, enter your UA-XXXXXXXX-X number.

Once your webhook is validated, you will have a rendering like this:

![webhook](./images/user-guide-backoffice/web-2-identifiant.jpg)  
*Koumoul webhook for Google Analytics configured*

If you have correctly configured your calls, you will be able to view the number of events by type that the users of your portal have carried out in the **Behavior**> **Events**> **Main events** section of your account Google Analytics.

![webhook](./images/user-guide-backoffice/web-3-events.jpg)

To obtain the details of the downloads, click on **Event action** for the type of events **dataset**.

![webhook](./images/user-guide-backoffice/web-4-liste-events.jpg)
