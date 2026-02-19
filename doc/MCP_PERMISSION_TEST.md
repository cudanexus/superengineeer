# MCP Permission System Testing Guide

This document explains how to test the new MCP (Model Context Protocol) permission system in Superengineer-v5.

## Overview

The MCP permission system allows you to automatically approve all tools from specific MCP servers without individual permission prompts. When enabled, it generates wildcard permission rules in the format `mcp__<servername>__*`.

## Testing Steps

### 1. Disable Dangerous Skip Permissions

First, ensure that `dangerouslySkipPermissions` is disabled:

1. Open Settings (gear icon)
2. In the Permissions tab, ensure "Skip all permission prompts" is unchecked
3. Save settings

### 2. Configure an MCP Server

1. Open Settings
2. Go to the MCP tab
3. Enable MCP by checking "Enable MCP"
4. Click "Add Server"
5. Configure a test MCP server:
   - **Name**: filesystem (or any name - this will be used in the permission rule)
   - **Type**: stdio or http depending on your MCP server
   - **Enable this server**: Checked
   - **Auto-approve all tools from this server**: Checked (this is the new feature!)
6. Save the server
7. Save settings

### 3. Verify Permission Rules

When you start an agent with the MCP server configured:

1. The system will generate a permission rule: `mcp__filesystem__*` (if your server name is "filesystem")
2. This rule is added to the `allowRules` automatically
3. All tools exposed by this MCP server will be allowed without prompts

### 4. Test with an Agent

1. Select or create a project
2. Start an interactive agent session
3. Use MCP tools - they should work without permission prompts
4. Check that tools like `mcp__filesystem__read_file` are automatically allowed

### 5. Test Auto-Approve Toggle

1. Edit the MCP server
2. Uncheck "Auto-approve all tools from this server"
3. Save and restart the agent
4. Now MCP tools should require individual permission approval

## Expected Behavior

- **With autoApproveTools = true (default)**: All tools from the MCP server are automatically allowed
- **With autoApproveTools = false**: Each tool requires individual permission approval
- **With server disabled**: No MCP tools are available

## Technical Details

The permission rules are generated in the following format:
- Pattern: `mcp__<servername>__*`
- Example: `mcp__filesystem__*` allows all tools like:
  - `mcp__filesystem__read_file`
  - `mcp__filesystem__write_file`
  - `mcp__filesystem__list_directory`
  - etc.

## Troubleshooting

If MCP tools are not being auto-approved:

1. Check that the MCP server is enabled
2. Verify "Auto-approve all tools" is checked
3. Ensure `dangerouslySkipPermissions` is false
4. Check the browser console for any errors
5. Restart the agent after making changes

## Future Improvements

The Ralph Loop agents currently use `--dangerously-skip-permissions`. A future enhancement would be to update them to use the same permission system as interactive agents.