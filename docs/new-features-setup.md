# New Features Setup Guide

## Recent Changes

### 1. Added New Agent Skills
- **Code Reviewer Agent** (`/code-reviewer`) - Expert code review with maintainability focus
- **Expert Developer Agent** (`/expert-developer`) - High-quality code implementation with best practices

### 2. Added Prompt Templates
- **"Review Code"** - Quick action template for code review
- **"Expert Developer"** - Template for expert development tasks

### 3. UI Updates
- Removed Templates link from bottom navigation (now only in Settings)
- Fixed markdown list rendering to show bullet points properly

## Troubleshooting Templates Not Appearing

If the new templates aren't showing up in the UI, try these steps:

1. **Restart the Claudito server**
   - Stop the server (Ctrl+C)
   - Run `npm run build` to rebuild
   - Start the server again with `npm start` or `npm run dev`

2. **Clear browser cache**
   - Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
   - The templates are loaded from the server settings on page load

3. **Verify templates in settings**
   - Go to Settings → Templates tab
   - Check if "Review Code" and "Expert Developer" templates appear
   - If not, the server may need to reload the settings file

4. **Check Quick Actions dropdown**
   - The "Review Code" template should appear in the Quick Actions dropdown
   - Quick Actions button is next to the message input

## Using the New Features

### With Claude Code Plugin

1. Start Claude Code with the plugin:
   ```bash
   claude --plugin-dir ./superengineer-plugin
   ```

2. Use the new skills:
   - `/code-reviewer` - Analyzes code for quality issues
   - `/expert-developer` - Implements features with best practices

### In Claudito UI

1. **Quick Action: Review Code**
   - Click Quick Actions button (lightning bolt icon)
   - Select "Review Code"
   - Fill in the review scope (default: entire codebase)
   - Optional: Add specific concerns or select priority areas
   - Template auto-sends after filling

2. **Expert Developer Template**
   - Click the template button (document icon) next to input
   - Select "Expert Developer"
   - Specify the task (default: "Implement the current plan")
   - Send to execute

## Technical Details

### File Locations
- Agent skills: `superengineer-plugin/skills/`
  - `code-reviewer.md`
  - `expert-developer.md`
- Plugin config: `superengineer-plugin/plugin.json`
- Templates: `src/repositories/settings.ts` (DEFAULT_PROMPT_TEMPLATES)

### CSS Updates
- Added list styles to `.markdown-content ul/ol` in `styles.css`
- Lists now properly display with bullets (disc, circle, square)
- Ordered lists show decimal numbers

### Template Variables
- `${textarea:scope}` - Multi-line text with default value
- `${textarea:concerns}` - Optional multi-line text
- `${select:priority}` - Dropdown with options
- `${text:task}` - Single-line text with default

## If Templates Still Don't Appear

The templates are part of the DEFAULT_PROMPT_TEMPLATES constant in the TypeScript code. If they're not showing after a rebuild and restart, check:

1. The build output for any errors
2. The browser console for JavaScript errors
3. The Network tab to see if `/api/settings` returns the templates
4. The server logs for any startup issues

The most common issue is that the server needs to be restarted to pick up the new default templates.