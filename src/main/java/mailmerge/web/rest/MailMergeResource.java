package mailmerge.web.rest;

import mailmerge.service.MailMergeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST controller for mail merge sending.
 */
@RestController
@RequestMapping("/api/mail-merge")
public class MailMergeResource {

    // =========================================================================
    // Logging + dependencies
    // =========================================================================

    // eslint-disable-next-line @typescript-eslint/member-ordering
    private final Logger log = LoggerFactory.getLogger(MailMergeResource.class);

    // Service that handles the spreadsheet parsing + token replacement + sending
    // eslint-disable-next-line @typescript-eslint/member-ordering
    private final MailMergeService mailMergeService;

    // eslint-disable-next-line @typescript-eslint/member-ordering
    public MailMergeResource(MailMergeService mailMergeService) {
        this.mailMergeService = mailMergeService;
    }

    // =========================================================================
    // Advanced mail merge send
    // =========================================================================

    /**
     * NEW endpoint: handles JSON payload with:
     *  - subject/body templates
     *  - to/cc/bcc templates
     *  - spreadsheet base64 + content type
     *  - attachments
     *  - inline images (CID attachments)
     *
     * Called from sendMailMergeWithMeta() in project.service.ts
     */
    // eslint-disable-next-line @typescript-eslint/member-ordering
    @PostMapping("/send-advanced")
    public ResponseEntity<Void> sendMailMergeAdvanced(@RequestBody Map<String, Object> payload) {
        log.debug("REST request to send mail merge with full metadata");

        // Read templates (stored as strings in the JSON payload)
        String subjectTemplate = (String) payload.get("subjectTemplate");
        String bodyTemplate = (String) payload.get("bodyTemplate");
        String toTemplate = (String) payload.get("toTemplate");
        String ccTemplate = (String) payload.get("ccTemplate");
        String bccTemplate = (String) payload.get("bccTemplate");

        // Spreadsheet content comes as base64 + contentType so backend can parse it
        String spreadsheetBase64 = (String) payload.get("spreadsheet");
        String spreadsheetFileContentType = (String) payload.get("spreadsheetFileContentType");

        // Attachments: list of maps (name, fileContentType, file(base64))
        @SuppressWarnings("unchecked")
        List<Map<String, String>> attachments = (List<Map<String, String>>) payload.get("attachments");

        // Inline images: list of maps (cid, fileContentType, base64, name)
        @SuppressWarnings("unchecked")
        List<Map<String, String>> inlineImages = (List<Map<String, String>>) payload.get("inlineImages");

        try {
            // Delegate all business logic to the service layer
            mailMergeService.sendMailMergeAdvanced(
                subjectTemplate,
                bodyTemplate,
                toTemplate,
                ccTemplate,
                bccTemplate,
                spreadsheetBase64,
                spreadsheetFileContentType,
                attachments,
                inlineImages
            );

            // Success → no body needed (frontend listens to SSE for progress)
            return ResponseEntity.ok().build();

        } catch (Exception e) {
            // Log the full stack trace server-side
            log.error("❌ Failed to process advanced mail merge", e);

            // Convert to runtime exception so JHipster returns an error response
            throw new RuntimeException("Mail merge failed: " + e.getMessage(), e);
        }
    }

    // =========================================================================
    // Test mail merge send
    // =========================================================================

    /**
     * TEST endpoint: sends ONE merged email (first data row) to the current user's email.
     * Backend ignores to/cc/bcc templates to avoid accidentally emailing real recipients.
     *
     * Called from sendMailMergeTestWithMeta() in project.service.ts
     */
    // eslint-disable-next-line @typescript-eslint/member-ordering
    @PostMapping("/send-test")
    public ResponseEntity<Void> sendMailMergeTest(@RequestBody Map<String, Object> payload) {
        log.debug("REST request to send TEST mail merge");

        // Same payload shape as /send-advanced (keeps frontend simple)
        String subjectTemplate = (String) payload.get("subjectTemplate");
        String bodyTemplate = (String) payload.get("bodyTemplate");
        String toTemplate = (String) payload.get("toTemplate");
        String ccTemplate = (String) payload.get("ccTemplate");
        String bccTemplate = (String) payload.get("bccTemplate");

        String spreadsheetBase64 = (String) payload.get("spreadsheet");
        String spreadsheetFileContentType = (String) payload.get("spreadsheetFileContentType");

        @SuppressWarnings("unchecked")
        List<Map<String, String>> attachments = (List<Map<String, String>>) payload.get("attachments");

        @SuppressWarnings("unchecked")
        List<Map<String, String>> inlineImages = (List<Map<String, String>>) payload.get("inlineImages");

        try {
            // Service handles: resolve current user's email + merge first row + send once
            mailMergeService.sendMailMergeAdvancedTest(
                subjectTemplate,
                bodyTemplate,
                toTemplate,
                ccTemplate,
                bccTemplate,
                spreadsheetBase64,
                spreadsheetFileContentType,
                attachments,
                inlineImages
            );

            return ResponseEntity.ok().build();

        } catch (Exception e) {
            log.error("❌ Failed to process TEST mail merge", e);
            throw new RuntimeException("Test mail merge failed: " + e.getMessage(), e);
        }
    }
}
