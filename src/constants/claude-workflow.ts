export const DEFAULT_WORKFLOW_RULES = `## Development Workflow

### Project Setup

**Default Build Tool: Vite**

When creating any web application or project, always use Vite as the build tool unless explicitly instructed otherwise.

### Running Vite Development Server

When instructed to run a Vite project:

1. Execute \`npm run dev\` (or the appropriate package manager command)
2. Wait for the server to start successfully
3. Extract and return the local development URL from the output (typically \`http://localhost:5173/\`)
4. Keep the response concise—provide the URL and brief status, avoiding verbose logs unless errors occur

If the server fails to start, provide a clear error summary to help with troubleshooting.

`;

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
