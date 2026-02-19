"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_WORKFLOW_RULES = void 0;
exports.stripProtectedSection = stripProtectedSection;
exports.validateProtectedSectionSave = validateProtectedSectionSave;
exports.DEFAULT_WORKFLOW_RULES = "## Development Workflow\n\n### Project Setup\n\n**Default Build Tool: Vite**\n\nWhen creating any web application or project, always use Vite as the build tool unless explicitly instructed otherwise.\n\n### Running Vite Development Server\n\nWhen instructed to run a Vite project:\n\n1. Execute `npm run dev` (or the appropriate package manager command)\n2. Wait for the server to start successfully\n3. Extract and return the local development URL from the output (typically `http://localhost:5173/`)\n4. Keep the response concise\u2014provide the URL and brief status, avoiding verbose logs unless errors occur\n\nIf the server fails to start, provide a clear error summary to help with troubleshooting.\n\n";
/**
 * Robustly identify and strip the protected workflow section from a CLAUDE.md file's content.
 * This handles both the pure text version and legacy versions that included HTML comments.
 */
function stripProtectedSection(content) {
    var legacyEndMarker = "ADD YOUR CUSTOM CONTENT BELOW THIS LINE:\n=========================================================================\n-->";
    var rulesEndText = "If the server fails to start, provide a clear error summary to help with troubleshooting.";
    var strippedContent = content;
    var wasProtected = false;
    // First check if it has the legacy marker
    var legacyIndex = strippedContent.indexOf(legacyEndMarker);
    if (legacyIndex !== -1 && legacyIndex < 3000) {
        strippedContent = strippedContent.substring(legacyIndex + legacyEndMarker.length);
        wasProtected = true;
    }
    else {
        // Otherwise check for the end of the newer clean rules text
        var rulesIndex = strippedContent.indexOf(rulesEndText);
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
    return { strippedContent: strippedContent, wasProtected: wasProtected };
}
/**
 * Verify that the new content being saved doesn't improperly mutate the protected section
 * compared to the original content.
 */
function validateProtectedSectionSave(oldContent, newContent) {
    var oldContentWasProtected = stripProtectedSection(oldContent).wasProtected;
    if (oldContentWasProtected) {
        // If the old content had a protected section, the new content should *not* contain it.
        // The API expects the frontend to send back only the stripped content.
        // We check if the new content still starts with the protected section's beginning.
        var protectedSectionStart = "## Development Workflow";
        var newContentStartsWithProtected = newContent.trimStart().startsWith(protectedSectionStart);
        if (newContentStartsWithProtected) {
            throw new Error("Validation Error: The new content still contains the protected workflow section. This section should be stripped before saving.");
        }
    }
    // If oldContent was not protected, then there's no protected section to validate against.
    // If oldContent was protected and newContent doesn't start with it, then it's valid.
}
