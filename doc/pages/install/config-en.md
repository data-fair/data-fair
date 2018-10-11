### Variables

*DataFair* supports quite a large number of parameters that are documented below. We try as much as possible to define sensible default values, still some parameters will almost always need to be overridden, these parameters have **IMPORTANT** in their descriptions.

Parameters can be overridden by directly modifying the files, but the recommanded way is to use environment variables.

{{CONFIG_VARS}}

### Internationalization

All messages in *DataFair* are externalized and internationalized.

To add a language you can add a file in [this directory ]((https://github.com/koumoul-dev/data-fair/tree/master/i18n)) either by overwriting the Docker image or submitting a pull request.

To change some values you can set environment variables when running the service. The table below contains the supported keys. **Warning:** we try to keep the keys as stables as possible, but still some modification may occur between 2 versions of *DataFair*. If you overwrite some values, you should check it again after each upgrade.

{{I18N_VARS}}
