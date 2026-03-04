#!/bin/bash

# Read the JSON input from stdin
input=$(cat)

# Extract the file path from the tool_input
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

# Only proceed if we got a file path and it's a TypeScript file in src or tests
if [[ -n "$file_path" && "$file_path" == *.ts ]]; then
  # Change to the project directory
  cd "$CLAUDE_PROJECT_DIR"

  # Run prettier directly on just this file
  npx prettier --write "$file_path"

  # Run eslint on the file
  eslint_output=$(npx eslint "$file_path" 2>&1)
  eslint_exit_code=$?

  # If eslint failed (exit code != 0), report errors to Claude
  if [ $eslint_exit_code -ne 0 ]; then
    echo "ESLint errors in $file_path:" >&2
    echo "$eslint_output" >&2
    exit 2
  fi
fi

exit 0
