#!/usr/bin/env bash
# Remove only the isolated acceptance home. / 仅删除隔离的验收目录。
set -euo pipefail

readonly acceptance_home="$HOME/.dsh-learnloop-acceptance"
rm -rf -- "$acceptance_home"
printf 'Removed isolated acceptance data: %s\n' "$acceptance_home"
