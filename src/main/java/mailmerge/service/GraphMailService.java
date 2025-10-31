
//Sends the actual email via Graph API


package mailmerge.service;

import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

@Service
public class GraphMailService {

    private final WebClient graphWebClient;

    public GraphMailService(WebClient graphWebClient) {
        this.graphWebClient = graphWebClient;
    }

    /**
     * Sends a simple hardcoded test email to verify Microsoft Graph setup.
     */
    public void sendTestEmail(String toAddress) {
        Map<String, Object> payload = Map.of(
            "message", Map.of(
                "subject", "Hello world (Graph API Test)",
                "body", Map.of(
                    "contentType", "Text",
                    "content", "This is a test email sent via Microsoft Graph API from the JHipster app. 🎉"
                ),
                "toRecipients", new Object[]{
                    Map.of("emailAddress", Map.of("address", toAddress))
                }
            ),
            "saveToSentItems", true
        );

        graphWebClient
            .post()
            .uri("/me/sendMail")
            .bodyValue(payload)
            .retrieve()
            .toBodilessEntity()
            .onErrorResume(e -> {
                e.printStackTrace(); // helpful for debugging if API call fails
                return Mono.empty();
            })
            .block(); // blocking is fine for a single call
    }
}

