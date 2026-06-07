#!/bin/bash

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT" || exit 1

npx commitplease .git/COMMIT_EDITMSG
exit $?
