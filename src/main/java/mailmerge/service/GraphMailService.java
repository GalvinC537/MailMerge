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

    private static final Logger log = LoggerFactory.getLogger(GraphMailService.class);
    private final WebClient graphWebClient;
    private final MailProgressService progressService;

    public GraphMailService(WebClient graphWebClient, MailProgressService progressService) {
        this.graphWebClient = graphWebClient;
        this.progressService = progressService;
    }

    /**
     * Sends a message via Microsoft Graph (BLOCKING, STABLE VERSION)
     * Supports:
     *  - normal file attachments
     *  - inline images (CID) for <img src="cid:...">
     */
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

            List<Map<String, Object>> toRecipients = buildRecipients(to);
            List<Map<String, Object>> ccRecipients = buildRecipients(cc);
            List<Map<String, Object>> bccRecipients = buildRecipients(bcc);

            // Graph attachments includes BOTH normal attachments + inline image attachments
            List<Map<String, Object>> graphAttachments = new ArrayList<>();

            // 1) Normal attachments
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

            // 2) Inline images (CID)
            if (inlineImages != null) {
                for (InlineImageDTO img : inlineImages) {
                    if (img == null || img.getFile() == null) continue;

                    String cid = img.getCid();
                    if (cid == null || cid.isBlank()) continue;

                    Map<String, Object> attach = new HashMap<>();
                    attach.put("@odata.type", "#microsoft.graph.fileAttachment");

                    String name = img.getName();
                    attach.put("name", (name != null && !name.isBlank()) ? name : (cid + ".png"));

                    String ct = img.getFileContentType();
                    attach.put("contentType", (ct != null && !ct.isBlank()) ? ct : "image/png");

                    attach.put("contentBytes", Base64.getEncoder().encodeToString(img.getFile()));
                    attach.put("isInline", true);
                    attach.put("contentId", cid.trim()); // MUST match <img src="cid:...">

                    graphAttachments.add(attach);
                }
            }

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

            graphWebClient.post()
                .uri("/me/sendMail")
                .bodyValue(payload)
                .retrieve()
                .toBodilessEntity()
                .block();

            log.info("✅ Email sent successfully to {}", to);

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

    /** Utility: convert comma-separated addresses into recipient objects */
    private List<Map<String, Object>> buildRecipients(String addresses) {
        if (addresses == null || addresses.isBlank()) return List.of();
        String[] parts = addresses.split(",\\s*");

        List<Map<String, Object>> recipients = new ArrayList<>();
        for (String addr : parts) {
            if (!addr.isBlank()) {
                recipients.add(
                    Map.of("emailAddress",
                        Map.of("address", addr.trim()))
                );
            }
        }
        return recipients;
    }
}
