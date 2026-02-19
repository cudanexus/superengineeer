# Fix: Projects Show as Running After Reload Until Switched

## Problem Description

When the page reloads, all project cards would show their persisted status from `status.json` files instead of the actual current agent status. This meant that projects that had agents running before a server restart would still show as "running" even though the agents were no longer active.

## Root Cause

The `/api/projects` endpoint was returning project data directly from the repository, which included the persisted status from disk. This status was not updated when the server restarted and agents were no longer running.

## Solution Implemented

Modified the GET `/api/projects` endpoint in `src/routes/projects.ts` to include the current agent status from `AgentManager`:

```typescript
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const projects = await projectRepository.findAll();

  // Add current agent status to each project
  const projectsWithCurrentStatus = projects.map((project) => {
    const agentStatus = agentManager.getAgentStatus(project.id);
    return {
      ...project,
      status: agentStatus // This will override the persisted status with current status
    };
  });

  res.json(projectsWithCurrentStatus);
}));
```

## How It Works

1. The endpoint fetches all projects from the repository as before
2. For each project, it queries the `AgentManager` for the current agent status
3. The current status overrides the persisted status in the response
4. The frontend receives the actual current status for all projects

## Testing the Fix

1. Start the Superengineer-v5 server
2. Create or open multiple projects
3. Start agents in some projects
4. Reload the page (F5 or browser refresh)
5. All project cards should now show the correct status ("stopped") without needing to switch to them
6. The selected project should continue to work as before

## Benefits

- **Accurate Status Display**: Project cards always show the current agent status
- **No User Action Required**: Status is correct immediately on page load
- **Maintains Functionality**: Existing features like WebSocket updates continue to work
- **Low Risk**: Simple change that only affects the data returned by the endpoint

## Impact

- **Performance**: Minimal - `getAgentStatus()` is a simple map lookup
- **Breaking Changes**: None - the response structure remains the same
- **Side Effects**: None - only affects the status display

## Verification

The fix can be verified by:
1. Checking that all project cards show correct status after reload
2. Verifying that WebSocket status updates still work
3. Ensuring that starting/stopping agents updates the display correctly