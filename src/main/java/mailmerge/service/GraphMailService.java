// This is called by MailMergeService.java
// This uses sprongs webclient to send HTTP POST request to the Microsoft Graph API in order to send the emails

package mailmerge.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.*;

@Service
public class GraphMailService {

    private static final Logger log = LoggerFactory.getLogger(GraphMailService.class);
    private final WebClient graphWebClient;

    public GraphMailService(WebClient graphWebClient) {
        this.graphWebClient = graphWebClient;
    }

    /**
     * Sends a message via Microsoft Graph.
     *
     * @param to comma-separated "To" addresses
     * @param cc comma-separated "CC" addresses
     * @param bcc comma-separated "BCC" addresses
     * @param subject subject line
     * @param body HTML body content
     * @param attachments list of maps with keys: name, fileContentType, file (base64)
     */
    public void sendMail(String to, String cc, String bcc, String subject, String body, List<mailmerge.service.dto.AttachmentDTO> attachments) {
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
                for (mailmerge.service.dto.AttachmentDTO a : attachments) {
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

            Map<String, Object> payload = Map.of("message", message, "saveToSentItems", true);

            // Send the email via Graph API
            graphWebClient.post()
                    .uri("/me/sendMail")
                    .bodyValue(payload)
                    .retrieve()
                    .toBodilessEntity()
                    .doOnSuccess(v -> log.info("✅ Email sent successfully to {}", to))
                    .doOnError(e -> log.error("❌ Failed to send email: {}", e.getMessage()))
                    .onErrorResume(e -> Mono.empty())
                    .block();

        } catch (Exception e) {
            log.error("❌ Exception in sendMail", e);
        }
    }

    /** Utility: convert comma-separated addresses into recipient objects */
    private List<Map<String, Object>> buildRecipients(String addresses) {
        if (addresses == null || addresses.isBlank()) return List.of();
        String[] parts = addresses.split(",\\s*");
        List<Map<String, Object>> recipients = new ArrayList<>();
        for (String addr : parts) {
            if (!addr.isBlank()) {
                recipients.add(Map.of("emailAddress", Map.of("address", addr.trim())));
            }
        }
        return recipients;
    }
}
