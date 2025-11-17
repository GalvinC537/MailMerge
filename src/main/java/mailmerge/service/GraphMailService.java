package mailmerge.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import mailmerge.service.dto.AttachmentDTO;

import java.util.*;

@Service
public class GraphMailService {

    private static final Logger log = LoggerFactory.getLogger(GraphMailService.class);
    private final WebClient graphWebClient;

    public GraphMailService(WebClient graphWebClient) {
        this.graphWebClient = graphWebClient;
    }

    /**
     * Sends a message via Microsoft Graph (BLOCKING, STABLE VERSION)
     */
    public void sendMail(
        String to,
        String cc,
        String bcc,
        String subject,
        String body,
        List<AttachmentDTO> attachments
    ) {
        try {
            log.info("📧 Sending email to={} cc={} bcc={} subject={} attachments={}",
                to, cc, bcc, subject, attachments != null ? attachments.size() : 0);

            // Convert comma-separated addresses
            List<Map<String, Object>> toRecipients = buildRecipients(to);
            List<Map<String, Object>> ccRecipients = buildRecipients(cc);
            List<Map<String, Object>> bccRecipients = buildRecipients(bcc);

            // Convert AttachmentDTO list to Graph attachments
            List<Map<String, Object>> graphAttachments = new ArrayList<>();
            if (attachments != null) {
                for (AttachmentDTO a : attachments) {
                    if (a.getFile() == null) continue;

                    Map<String, Object> attach = new HashMap<>();
                    attach.put("@odata.type", "#microsoft.graph.fileAttachment");
                    attach.put("name", a.getName());
                    attach.put("contentType", a.getFileContentType());
                    attach.put("contentBytes", Base64.getEncoder().encodeToString(a.getFile()));

                    graphAttachments.add(attach);
                }
            }

            // Build the Graph message payload
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

            // ✅ **BLOCKING send (this is the stable version that worked before)**
            graphWebClient.post()
                .uri("/me/sendMail")
                .bodyValue(payload)
                .retrieve()
                .toBodilessEntity()
                .block(); // THIS was working fine

            log.info("✅ Email sent successfully to {}", to);

        } catch (Exception e) {
            log.error("❌ Failed to send email: {}", e.getMessage());
            // swallow error so mail-merge continues
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
