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

    private final Logger log = LoggerFactory.getLogger(MailMergeResource.class);
    private final MailMergeService mailMergeService;

    public MailMergeResource(MailMergeService mailMergeService) {
        this.mailMergeService = mailMergeService;
    }

    /**
     * NEW endpoint: handles JSON payload with to/cc/bcc/attachments
     *
     * Called from sendMailMergeWithMeta() in project.service.ts
     */
    @PostMapping("/send-advanced")
    public ResponseEntity<Void> sendMailMergeAdvanced(@RequestBody Map<String, Object> payload) {
        log.debug("REST request to send mail merge with full metadata");

        String subjectTemplate = (String) payload.get("subjectTemplate");
        String bodyTemplate = (String) payload.get("bodyTemplate");
        String toTemplate = (String) payload.get("toTemplate");
        String ccTemplate = (String) payload.get("ccTemplate");
        String bccTemplate = (String) payload.get("bccTemplate");
        String spreadsheetBase64 = (String) payload.get("spreadsheet");
        String spreadsheetFileContentType = (String) payload.get("spreadsheetFileContentType");
        @SuppressWarnings("unchecked")
        List<Map<String, String>> attachments = (List<Map<String, String>>) payload.get("attachments");

        try {
            mailMergeService.sendMailMergeAdvanced(
                subjectTemplate,
                bodyTemplate,
                toTemplate,
                ccTemplate,
                bccTemplate,
                spreadsheetBase64,
                spreadsheetFileContentType,
                attachments
            );
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            log.error("❌ Failed to process advanced mail merge", e);
            throw new RuntimeException("Mail merge failed: " + e.getMessage(), e);
        }
    }

    /**
     * ✅ NEW endpoint: sends ONE "test" email to the currently logged-in user's email.
     *
     * Called from sendMailMergeTestWithMeta() in project.service.ts
     */
    @PostMapping("/send-test")
    public ResponseEntity<Void> sendMailMergeTest(@RequestBody Map<String, Object> payload) {
        log.debug("REST request to send TEST mail merge");

        String subjectTemplate = (String) payload.get("subjectTemplate");
        String bodyTemplate = (String) payload.get("bodyTemplate");
        String toTemplate = (String) payload.get("toTemplate");
        String ccTemplate = (String) payload.get("ccTemplate");
        String bccTemplate = (String) payload.get("bccTemplate");
        String spreadsheetBase64 = (String) payload.get("spreadsheet");
        String spreadsheetFileContentType = (String) payload.get("spreadsheetFileContentType");
        @SuppressWarnings("unchecked")
        List<Map<String, String>> attachments = (List<Map<String, String>>) payload.get("attachments");

        try {
            mailMergeService.sendMailMergeAdvancedTest(
                subjectTemplate,
                bodyTemplate,
                toTemplate,
                ccTemplate,
                bccTemplate,
                spreadsheetBase64,
                spreadsheetFileContentType,
                attachments
            );
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            log.error("❌ Failed to process TEST mail merge", e);
            throw new RuntimeException("Test mail merge failed: " + e.getMessage(), e);
        }
    }
}
