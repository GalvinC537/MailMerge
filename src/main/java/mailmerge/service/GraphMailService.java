// This is called by MailMergeService.java
// This uses sprongs webclient to send HTTP POST request to the Microsoft Graph API in order to send the emails


package mailmerge.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.Map;

@Service
public class GraphMailService {

    private static final Logger log = LoggerFactory.getLogger(GraphMailService.class);

    private final WebClient graphWebClient;

    public GraphMailService(WebClient graphWebClient) {
        this.graphWebClient = graphWebClient;
    }

    public void sendMail(String to, String subject, String body) {
        log.info("Sending email to {}", to);

        // Build message payload for Microsoft Graph
        Map<String, Object> message = Map.of(
            "message", Map.of(
                "subject", subject,
                "body", Map.of(
                    "contentType", "HTML",
                    "content", body
                ),
                "toRecipients", new Object[]{
                    Map.of("emailAddress", Map.of("address", to))
                }
            ),
            "saveToSentItems", true
        );

        // Call Microsoft Graph API
        graphWebClient
            .post()
            .uri("/me/sendMail")
            .bodyValue(message)
            .retrieve()
            .toBodilessEntity()
            .doOnSuccess(v -> log.info("Email sent successfully"))
            .doOnError(e -> log.error("Failed to send email: {}", e.getMessage()))
            .onErrorResume(e -> Mono.empty()) // prevents crash if send fails
            .block(); // executes synchronously
    }
}
