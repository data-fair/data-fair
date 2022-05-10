---
title: Periodic processings
section: 3
subsection : 5
description : Periodic processings
published: true
---

Periodic processing **fetch** data from certain places, **transform** it and **publish** it on the platform..

Periodic processing differs from catalog connectors on several points:
* A processing is limited to a reduced set of input and output sources. Typically it can retrieve data from one place, and metadata from another, and dump the data into a platform source.
* The collection frequencies can be higher: data can be collected with a few seconds interval, which is suitable for the publication of **IOT data**.

<p>
</p>

Periodic processing is configured by entering the type of source (IOT data, files from billing, etc.), the corresponding data set in the platform and the frequency of collection.

![Collecteurs](./images/functional-presentation/collecteurs.jpg)


It is also possible to have the **success status** of the last processing for each collector, as well as to access detailed logs of the last data collections. Periodic jobs can also be used for daily, weekly, etc. updates.

It is possible to add **new periodic processing** by following the instructions in [this section](./interoperate/collectors).
