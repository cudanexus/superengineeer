export const getDefaultWorkflowRules = (currentUrl?: string) => {
    let baseUrl = 'http://localhost';
    if (currentUrl) {
        try {
            const urlObj = new URL(currentUrl);
            urlObj.port = '';
            urlObj.pathname = '/';
            urlObj.search = '';
            urlObj.hash = '';
            // Remove trailing slash for a clean base URL (e.g., http://192.168.1.26)
            baseUrl = urlObj.toString().replace(/\/+$/, "");
        } catch (e) {
            // Ignore parse errors, fallback to default
        }
    }
    return `## Development Workflow

### Project Setup

**Default Build Tool: Vite**

When creating any web application or project, always use Vite as the build tool unless explicitly instructed otherwise.

### Running Vite Development Server

When instructed to run a Vite project:

1. Execute \`npm run dev\` (or the appropriate package manager command)
2. Wait for the server to start successfully
3. The application's viewing environment is available through the Daytona proxy host at: ${baseUrl}. When you start the development server, access the application using the Daytona port-based format by prefixing the running port to the host (for example, if the development server runs on port 5173, open https://5173-bf32fb03-f1e8-4445-80f5-505249ce964f.proxy.daytona.works
). Always use this Daytona URL structure for testing and navigation.
4. Keep the response concise—provide the URL and brief status, avoiding verbose logs unless errors occur

If the server fails to start, provide a clear error summary to help with troubleshooting.


These deployment defaults apply on every message by default unless the user explicitly asks for a different platform or explicitly says deployment/containerization is not needed.

1. Prefer deployment-ready solutions for Fly.io.
2. Ensure the app can run in Docker without extra manual steps.
3. Treat frontend-only, backend-only, and full-stack apps as valid targets. Do not assume a Node-only stack.
4. Reuse and update existing deployment files instead of creating conflicting alternatives.
5. Keep runtime port, host binding, start command, Dockerfile, and Fly.io config aligned as one deployment unit.
6. Detect the real runnable app root before generating deployment files. Do not guess.
7. The runnable app may live in the repository root or in a nested folder. Handle both correctly.
8. Always identify which folder actually contains the app entrypoint, dependency manifest, build files, and production start command before writing Docker or Fly.io config.

### Fly.io Template

- Keep a valid \`fly.toml\` in the project root when Fly.io deployment is relevant.
- Keep all Fly.io deployment files in the main project folder/root directory, not in nested subfolders.
- The Fly.io config must target the actual runnable app, even if that app lives in a nested subfolder.
- Ensure the app binds to \`0.0.0.0\` and uses a real runtime port.
- Match Fly.io internal port to the application port.
- Add health/service settings when the app type needs them.

Use this Fly.io template shape when generating or repairing config:

\`\`\`toml
app = "replace-with-app-name"
primary_region = "sin"

[build]

[env]
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]
\`\`\`

### Docker Template

- Keep a production-ready \`Dockerfile\` in the project root when containerization is relevant.
- Use a base image appropriate to the app language/runtime.
- Install dependencies deterministically.
- Run any required build step only if the project actually has one.
- Expose the same port used by the app and Fly.io config.
- Start the app with the real production command for that stack.
- If the runnable app is in the repository root, copy the root app files into the image correctly.
- If the runnable app is inside a subfolder, copy that exact app folder into the image correctly and run commands from that app folder.
- Do not generate \`COPY . .\` blindly unless the repository root itself is the runnable app root.
- Do not assume the main app folder is named \`app\`, \`src\`, \`frontend\`, or \`backend\`. Detect it from the project structure.
- The Dockerfile must be accurate for the detected app root, not just syntactically valid.

Use this Docker template shape and adapt the base image/build commands/runtime command to the app language:

\`\`\`dockerfile
FROM <runtime-base-image>
WORKDIR /app

# Copy only the files needed for the detected runnable app root.
# If the runnable app is in the repository root, copy root files.
# If the runnable app is in a nested folder, copy that folder and set WORKDIR accordingly.

# Install dependencies
# Build if needed

ENV PORT=3000
EXPOSE 3000

CMD ["<production-start-command>"]
\`\`\`

### Mandatory Deployment Detection Rules

- First identify the runnable app root.
- Then generate \`fly.toml\` and \`Dockerfile\` in the repository root/main folder.
- The generated files must reference and copy the actual runnable app root correctly.
- For monorepos or split frontend/backend repos, do not deploy the wrong folder.
- If multiple runnable apps exist, choose the one the prompt is asking to deploy and make that choice explicit.

Always follow this deployment template guidance on every message by default.

`;
};

/**
 * Robustly identify and strip the protected workflow section from a CLAUDE.md file's content.
 * This handles both the pure text version and legacy versions that included HTML comments.
 */
export function stripProtectedSection(content: string): { strippedContent: string, wasProtected: boolean } {
    const legacyEndMarker = "ADD YOUR CUSTOM CONTENT BELOW THIS LINE:\n=========================================================================\n-->";
    const rulesEndText = "If the server fails to start, provide a clear error summary to help with troubleshooting.";

    let strippedContent = content;
    let wasProtected = false;

    // First check if it has the legacy marker
    const legacyIndex = strippedContent.indexOf(legacyEndMarker);
    if (legacyIndex !== -1 && legacyIndex < 3000) {
        strippedContent = strippedContent.substring(legacyIndex + legacyEndMarker.length);
        wasProtected = true;
    } else {
        // Otherwise check for the end of the newer clean rules text
        const rulesIndex = strippedContent.indexOf(rulesEndText);
        if (rulesIndex !== -1 && rulesIndex < 3000) {
            // Must also ensure it's not preceded by user content, but in our case it's always at the top
            strippedContent = strippedContent.substring(rulesIndex + rulesEndText.length);
            wasProtected = true;
        }
    }

    if (wasProtected) {
        // clean up any leading newlines that were left over
        strippedContent = strippedContent.replace(/^\s+/, '');
    }

    return { strippedContent, wasProtected };
}

/**
 * Verify that the new content being saved doesn't improperly mutate the protected section
 * compared to the original content.
 */
export function validateProtectedSectionSave(oldContent: string, newContent: string): void {
    const { wasProtected: oldContentWasProtected } = stripProtectedSection(oldContent);

    if (oldContentWasProtected) {
        // If the old content had a protected section, the new content should *not* contain it.
        // The API expects the frontend to send back only the stripped content.
        // We check if the new content still starts with the protected section's beginning.
        const protectedSectionStart = "## Development Workflow";
        const newContentStartsWithProtected = newContent.trimStart().startsWith(protectedSectionStart);

        if (newContentStartsWithProtected) {
            throw new Error("Validation Error: The new content still contains the protected workflow section. This section should be stripped before saving.");
        }
    }
    // If oldContent was not protected, then there's no protected section to validate against.
    // If oldContent was protected and newContent doesn't start with it, then it's valid.
}
