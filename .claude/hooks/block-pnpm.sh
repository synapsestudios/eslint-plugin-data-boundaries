#!/bin/bash

# PreToolUse hook: block any pnpm invocation
input=$(cat)

command=$(echo "$input" | jq -r '.tool_input.command // empty')

# Extract just the executable (first word of the command, ignoring env vars)
executable=$(echo "$command" | sed -E 's/^(\s*[A-Za-z_][A-Za-z0-9_]*=[^ ]*\s+)*//' | awk '{print $1}')

if [[ "$executable" == "pnpm" ]] || echo "$command" | grep -qE '[;&|]\s*pnpm(\s|$)'; then
  echo "BLOCKED: pnpm use is not allowed on this project. Use npm instead." >&2
  exit 2
fi

exit 0
