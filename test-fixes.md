# Testing the Fixes

## 1. Agent Start/Restart Button Fix

### Test Steps:
1. Start Superengineer-v5: `npm run dev`
2. Open http://localhost:3000
3. Select a project
4. **Expected**: You should see a green "Start" button when no agent is running
5. Click the Start button
6. **Expected**: The Start button should disappear and a red "Stop" button should appear
7. Click the Stop button to stop the agent
8. **Expected**: The Stop button should change to a green "Restart" button
9. Click the Restart button
10. **Expected**: The agent should restart with the same session

### What was fixed:
- Updated `updateStartStopButtons()` function in `public/js/app.js` to show the Start button when agent is stopped
- The existing functionality for Stop→Restart morph was already working

## 2. MCP Server Persistence Fix

### Test Steps:
1. Start Superengineer-v5: `npm run dev`
2. Open http://localhost:3000
3. Select a project
4. Click on "MCP Servers" button
5. Disable all servers by unchecking all checkboxes
6. Click "Save"
7. **Expected**: Settings should be saved with a success toast
8. Close the modal and reopen it
9. **Expected**: All servers should still be disabled
10. Refresh the page (F5)
11. **Expected**: All servers should still be disabled (not reset to enabled)
12. Click "Reset to Global" button
13. **Expected**: Confirm dialog appears
14. Click OK
15. **Expected**: Servers return to global default state

### What was fixed:
- Frontend (`public/js/modules/mcp-project-module.js`):
  - Changed save logic to always set `enabled: true` when saving overrides
  - Added `clearProjectOverrides()` function
- Backend (`src/routes/projects/core.ts`):
  - Updated logic to only clear overrides when both `enabled: false` AND empty overrides
  - Changed default for `enabled` to `true` when saving
- UI (`public/index.html`):
  - Added "Reset to Global" button

## Key Changes Summary:

1. **Agent Buttons**: Simple fix to show Start button when stopped
2. **MCP Persistence**: Fixed semantic confusion where `enabled` was incorrectly tied to "any server enabled" instead of "overrides configured"

The fixes are minimal but address the core usability issues.