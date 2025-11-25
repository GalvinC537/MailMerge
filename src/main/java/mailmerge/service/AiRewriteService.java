package mailmerge.service;

import java.util.List;
import java.util.Map;

import mailmerge.service.dto.AIRewriteResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

@Service
public class AiRewriteService {

    private final WebClient webClient;

    public AiRewriteService(@Value("${groq.api-key}") String apiKey) {
        this.webClient = WebClient.builder()
            .baseUrl("https://api.groq.com/openai/v1")
            .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .build();
    }

    public AIRewriteResponse rewrite(String original, String tone) {
        String styleInstruction;

        if (tone == null || tone.isBlank() || "professional".equalsIgnoreCase(tone)) {
            styleInstruction = "Rewrite this email in a polished, professional tone.";
        } else if ("friendly".equalsIgnoreCase(tone)) {
            styleInstruction = "Rewrite this email in a friendly, positive, approachable tone.";
        } else {
            styleInstruction = "Rewrite this email using the following writing style: " + tone + ".";
        }

        String userContent =
            styleInstruction +
                "\n\nIMPORTANT RULES:\n" +
                "• DO NOT modify, remove, rename, expand, reformat, translate, or touch placeholders in double curly brackets (e.g., {{name}}, {{email}}, {{grade}}, {{company_name}}).\n" +
                "• Keep ALL placeholders EXACTLY as they appear.\n" +
                "• Do not add spaces inside them.\n" +
                "• Do not add new placeholders.\n" +
                "• Do not reference them in text.\n\n" +
                "Return ONLY the rewritten email text — no explanations, no intro sentences, no quotes, no formatting labels.\n\n" +
                "Email:\n" + original;

        Map<String, Object> request = Map.of(
            "model", "llama-3.3-70b-versatile",
            "messages", List.of(
                Map.of(
                    "role", "user",
                    "content", userContent
                )
            ),
            "temperature", 0.4
        );

        Map<String, Object> response = webClient.post()
            .uri("/chat/completions")
            .bodyValue(request)
            .retrieve()
            .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
            .block();

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> choices = (List<Map<String, Object>>) response.get("choices");

        if (choices == null || choices.isEmpty()) {
            return new AIRewriteResponse("");
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");

        String content = message != null ? (String) message.get("content") : "";

        // Strip surrounding quotes if returned
        if (content != null) {
            content = content.trim();
            if (content.startsWith("\"") && content.endsWith("\"")) {
                content = content.substring(1, content.length() - 1).trim();
            }
        }

        AIRewriteResponse dto = new AIRewriteResponse();
        dto.setRewrittenText(content != null ? content : "");
        return dto;
    }
}
