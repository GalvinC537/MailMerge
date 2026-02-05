package mailmerge.service;

import mailmerge.service.dto.AttachmentDTO;
import mailmerge.service.dto.MailProgressEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import mailmerge.service.dto.InlineImageDTO;

import java.util.*;

@Service
public class GraphMailService {

    // =========================================================================
    // Logging
    // =========================================================================

    // eslint-disable-next-line @typescript-eslint/member-ordering
    private static final Logger log = LoggerFactory.getLogger(GraphMailService.class);

    // =========================================================================
    // Dependencies
    // =========================================================================

    // Graph WebClient (pre-configured with auth)
    // eslint-disable-next-line @typescript-eslint/member-ordering
    private final WebClient graphWebClient;

    // SSE progress updates
    // eslint-disable-next-line @typescript-eslint/member-ordering
    private final MailProgressService progressService;

    // =========================================================================
    // Constructor
    // =========================================================================

    // eslint-disable-next-line @typescript-eslint/member-ordering
    public GraphMailService(WebClient graphWebClient, MailProgressService progressService) {
        this.graphWebClient = graphWebClient;
        this.progressService = progressService;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Sends a message via Microsoft Graph (BLOCKING, STABLE VERSION).
     *
     * Supports:
     *  - To / CC / BCC recipient lists (comma-separated addresses)
     *  - Normal file attachments
     *  - Inline images (CID) for <img src="cid:..."> (Graph fileAttachment with isInline + contentId)
     *
     * Notes:
     *  - Uses /me/sendMail
     *  - saveToSentItems = true
     *  - Uses .block() (synchronous) for stability
     */
    // eslint-disable-next-line @typescript-eslint/member-ordering
    public boolean sendMail(
        String to,
        String cc,
        String bcc,
        String subject,
        String body,
        List<AttachmentDTO> attachments,
        List<InlineImageDTO> inlineImages
    ) {
        try {
            // Emit "sending" progress (count = -1 indicates "not tied to row progress" in your UI)
            progressService.sendProgress(
                new MailProgressEvent(
                    to,
                    false,
                    -1,
                    -1,
                    "Sending..."
                )
            );

            log.info("📧 Sending email to={} cc={} bcc={} subject={} attachments={} inlineImages={}",
                to, cc, bcc, subject,
                attachments != null ? attachments.size() : 0,
                inlineImages != null ? inlineImages.size() : 0
            );

            // Build recipient objects expected by Graph
            List<Map<String, Object>> toRecipients = buildRecipients(to);
            List<Map<String, Object>> ccRecipients = buildRecipients(cc);
            List<Map<String, Object>> bccRecipients = buildRecipients(bcc);

            // Graph attachments includes BOTH normal attachments + inline image attachments
            List<Map<String, Object>> graphAttachments = new ArrayList<>();

            // -----------------------------------------------------------------
            // 1) Normal attachments
            // -----------------------------------------------------------------
            if (attachments != null) {
                for (AttachmentDTO a : attachments) {
                    if (a == null || a.getFile() == null) continue;

                    Map<String, Object> attach = new HashMap<>();
                    attach.put("@odata.type", "#microsoft.graph.fileAttachment");
                    attach.put("name", a.getName());
                    attach.put("contentType", a.getFileContentType());
                    attach.put("contentBytes", Base64.getEncoder().encodeToString(a.getFile()));
                    attach.put("isInline", false);

                    graphAttachments.add(attach);
                }
            }

            // -----------------------------------------------------------------
            // 2) Inline images (CID)
            // -----------------------------------------------------------------
            if (inlineImages != null) {
                for (InlineImageDTO img : inlineImages) {
                    if (img == null || img.getFile() == null) continue;

                    String cid = img.getCid();
                    if (cid == null || cid.isBlank()) continue;

                    Map<String, Object> attach = new HashMap<>();
                    attach.put("@odata.type", "#microsoft.graph.fileAttachment");

                    // Attachment name shown in Graph payload (not necessarily visible in email clients)
                    String name = img.getName();
                    attach.put("name", (name != null && !name.isBlank()) ? name : (cid + ".png"));

                    // Content type fallback
                    String ct = img.getFileContentType();
                    attach.put("contentType", (ct != null && !ct.isBlank()) ? ct : "image/png");

                    attach.put("contentBytes", Base64.getEncoder().encodeToString(img.getFile()));

                    // Key bits for inline images:
                    attach.put("isInline", true);
                    attach.put("contentId", cid.trim()); // MUST match <img src="cid:...">

                    graphAttachments.add(attach);
                }
            }

            // -----------------------------------------------------------------
            // Build Graph message payload
            // -----------------------------------------------------------------
            Map<String, Object> message = new LinkedHashMap<>();
            message.put("subject", subject != null ? subject : "(no subject)");
            message.put("body", Map.of("contentType", "HTML", "content", body != null ? body : ""));

            if (!toRecipients.isEmpty()) message.put("toRecipients", toRecipients);
            if (!ccRecipients.isEmpty()) message.put("ccRecipients", ccRecipients);
            if (!bccRecipients.isEmpty()) message.put("bccRecipients", bccRecipients);
            if (!graphAttachments.isEmpty()) message.put("attachments", graphAttachments);

            Map<String, Object> payload = Map.of(
                "message", message,
                "saveToSentItems", true
            );

            // -----------------------------------------------------------------
            // POST /me/sendMail (blocking)
            // -----------------------------------------------------------------
            graphWebClient.post()
                .uri("/me/sendMail")
                .bodyValue(payload)
                .retrieve()
                .toBodilessEntity()
                .block();

            log.info("✅ Email sent successfully to {}", to);

            // Emit success
            progressService.sendProgress(
                new MailProgressEvent(
                    to,
                    true,
                    -1,
                    -1,
                    "Sent successfully"
                )
            );

            return true;

        } catch (Exception e) {
            log.error("❌ Failed to send email: {}", e.getMessage(), e);

            // Emit failure
            progressService.sendProgress(
                new MailProgressEvent(
                    to,
                    false,
                    -1,
                    -1,
                    "FAILED: " + e.getMessage()
                )
            );

            return false;
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /** Utility: convert comma-separated addresses into Graph recipient objects. */
    // eslint-disable-next-line @typescript-eslint/member-ordering
    private List<Map<String, Object>> buildRecipients(String addresses) {
        if (addresses == null || addresses.isBlank()) return List.of();

        // Split on commas, tolerating spaces
        String[] parts = addresses.split(",\\s*");

        List<Map<String, Object>> recipients = new ArrayList<>();
        for (String addr : parts) {
            if (!addr.isBlank()) {
                recipients.add(
                    Map.of(
                        "emailAddress",
                        Map.of("address", addr.trim())
                    )
                );
            }
        }

        return recipients;
    }
}
