---
title: API Acces
section: 2
subsection : 9
description : APIs and global integration
published: true
---

All of the platform's features are available through **documented Rest APIs**. These APIs can be called outside the portal, but for restricted access it is necessary to use an **API key**. When adding an API key, it is possible to restrict access to a single function. It is then possible to restrict access to a specific IP or domain name.

API documentation is done following the **OpenAPI 3.0** specification. This allows clear and understandable documentation through interactive documentation. The handling of APIs by developers is thus faster

Another benefit of using this specification is increased **interoperability**, with some IT systems (e.g. API gateways) being able to understand this specification. APIs made with Data Fair can, for example, be directly integrated by sites such as https://api.gouv.fr.

<img src="./images/functional-presentation/api.jpg"
     height="500" style="margin:20px auto;" alt="capture d'écran de la documentation d'API" />

It is possible to use the API to **harvest data from a portal**. For example, the https://opendatarchives.fr/ site regularly harvests data from the https://data.ademe.fr/ portal powered by Data Fair.
