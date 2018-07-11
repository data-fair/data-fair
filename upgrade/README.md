# Upgrade scripts

Scripts must be written in 'scripts/{CURRENT VERSION}' directory. All scripts with a version number greater than or equal to the version of the service registered in the database will executed.

The scripts will be run automatically at startup of service. You can also run them manually:

    DEBUG=upgrade* node upgrade

Scripts are simple nodejs modules that export these properties:

  - description: A short description string.
  - exec: An async function. It accepts a mongodb connection as first parameter and debug log method as second parameter.

WARNING: theoretically all scripts are run only once. But this cannot be strictly ensured therefore scripts should be idempotent. It means that running them multiple times should not create problems.
