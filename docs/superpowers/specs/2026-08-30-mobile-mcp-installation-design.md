# Mobile MCP Installation Design

## Goal

Make the `mobile-mcp` server available both from this repository's VS Code
workspace and from the current VS Code installation, without adding it to the
Expo application's runtime dependencies.

## Design

Add a committed `.vscode/mcp.json` containing one server named `mobile`:

- Command: `npx`
- Arguments: `-y`, `mobile-mcp`

The `-y` flag allows VS Code to start the published server without an
interactive npm confirmation. The repository currently ignores all of
`.vscode/`, so add a negated rule for `.vscode/mcp.json` while keeping other
editor settings local.

Also register the same server through the VS Code CLI with `code --add-mcp`.
This gives the current developer an immediately available user-level
registration while the committed workspace configuration remains the
reproducible source of truth.

## Scope and prerequisites

This change only configures the MCP server. It does not modify Expo source or
package manifests. The server's mobile automation capabilities still require
Android Studio/platform tools and an Android emulator or USB-debugging Android
device. The published package currently supports Android devices.

## Validation

Validate that:

1. `.vscode/mcp.json` is valid JSON and contains the expected command and
   arguments.
2. Git tracks only the intended MCP configuration exception.
3. `code --add-mcp` completes successfully for the current VS Code
   installation.
