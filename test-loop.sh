#!/bin/bash

# stop on failure
set -e

# run test until one fails, useful when some test fails in a non predictable way
while true; do
    npm test
done