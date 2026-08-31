#!/usr/bin/env bash
# Remove only the isolated acceptance home. / 仅删除隔离的验收目录。
set -euo pipefail

readonly acceptance_home="${DSH_HOME:-$HOME/.dsh-learnloop-acceptance}"
if [[ -z "$acceptance_home" || "$acceptance_home" == "/" || "$acceptance_home" == "$HOME" ]]; then
  printf 'Refusing to remove unsafe acceptance path: %s\n' "$acceptance_home" >&2
  exit 1
fi
rm -rf -- "$acceptance_home"
printf 'Removed isolated acceptance data: %s\n' "$acceptance_home"
