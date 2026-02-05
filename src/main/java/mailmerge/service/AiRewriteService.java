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

    // =========================================================================
    // HTTP client (Groq OpenAI-compatible endpoint)
    // =========================================================================

    // eslint-disable-next-line @typescript-eslint/member-ordering
    private final WebClient webClient;

    /**
     * Constructs a WebClient configured for Groq's OpenAI-compatible API.
     * - Base URL points at Groq's /openai/v1
     * - Auth header uses Bearer token from application properties
     * - Content-Type defaults to JSON
     */
    // eslint-disable-next-line @typescript-eslint/member-ordering
    public AiRewriteService(@Value("${groq.api-key}") String apiKey) {
        this.webClient = WebClient.builder()
            .baseUrl("https://api.groq.com/openai/v1")
            .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .build();
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Rewrites the provided email text using the requested tone.
     * Enforces your "markdown-ish" formatting + placeholder preservation rules by
     * embedding strict instructions in the prompt.
     *
     * @param original the original email body (markdown-ish text with tokens)
     * @param tone     "professional", "friendly", or a custom free-text style
     * @return DTO containing rewrittenText (or empty string on unexpected responses)
     */
    // eslint-disable-next-line @typescript-eslint/member-ordering
    public AIRewriteResponse rewrite(String original, String tone) {
        // Choose the high-level tone instruction that leads the LLM
        String styleInstruction;

        // Default to professional when tone is missing/blank
        if (tone == null || tone.isBlank() || "professional".equalsIgnoreCase(tone)) {
            styleInstruction = "Rewrite this email in a polished, professional tone.";
        } else if ("friendly".equalsIgnoreCase(tone)) {
            styleInstruction = "Rewrite this email in a friendly, positive, approachable tone.";
        } else {
            // Custom tone: user-supplied style text (e.g. "more concise, persuasive")
            styleInstruction = "Rewrite this email using the following writing style: " + tone + ".";
        }

        // Build the prompt content with strict rules so formatting/tokens survive intact
        String userContent =
            styleInstruction +
                "\n\nFORMAT & PLACEHOLDER RULES:\n" +
                "1) The email text uses a simple markdown-like syntax for formatting:\n" +
                "   - **text** = bold\n" +
                "   - _text_ or *text* = italic\n" +
                "   - ~text~ = underlined\n" +
                "2) You MUST preserve all existing formatting markers exactly:\n" +
                "   - If a span is wrapped in ** **, keep the ** markers in the same positions and only rewrite the text inside.\n" +
                "   - If a span is wrapped in _ _ (or * *), keep those markers and only rewrite the text inside.\n" +
                "   - If a span is wrapped in ~ ~, keep those markers and only rewrite the text inside.\n" +
                "   - Do NOT remove, add, move, or rearrange any **, _, *, or ~ markers.\n" +
                "   - Do NOT introduce new bold/italic/underline that was not formatted in the original.\n" +
                "3) The email also contains placeholders using double curly brackets, e.g. {{name}}, {{email}}, {{grade}}, {{company_name}}.\n" +
                "   - DO NOT modify, remove, rename, expand, reformat, translate, or touch any of these placeholders.\n" +
                "   - Keep ALL placeholders EXACTLY as they appear.\n" +
                "   - Do not add spaces inside them.\n" +
                "   - Do not invent new placeholders.\n" +
                "   - Do not refer to them explicitly in the rewritten text.\n" +
                "4) Return ONLY the rewritten email text, in the same markdown-style format.\n" +
                "   - Do NOT return HTML.\n" +
                "   - Do NOT add explanations, intros, quotes, or labels.\n\n" +
                "Email:\n" + original;

        // Build a Chat Completions request (OpenAI-compatible schema)
        Map<String, Object> request = Map.of(
            "model", "llama-3.3-70b-versatile",
            "messages", List.of(
                Map.of(
                    "role", "user",
                    "content", userContent
                )
            ),
            // Moderate temperature: some rewrite creativity but tries to respect strict constraints
            "temperature", 0.4
        );

        // Execute the POST (blocking) and parse into a generic Map so we can extract choices[].message.content
        Map<String, Object> response = webClient.post()
            .uri("/chat/completions")
            .bodyValue(request)
            .retrieve()
            .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
            .block();

        // Defensive extraction: choices may be missing or empty if upstream fails oddly
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> choices = response != null
            ? (List<Map<String, Object>>) response.get("choices")
            : null;

        if (choices == null || choices.isEmpty()) {
            // Return an empty rewrite rather than throwing (caller can show error UI if desired)
            return new AIRewriteResponse("");
        }

        // choices[0].message.content is where the rewritten text usually is
        @SuppressWarnings("unchecked")
        Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");

        String content = message != null ? (String) message.get("content") : "";

        // Some models/providers may wrap the entire output in quotes; strip only if BOTH ends are quotes
        if (content != null) {
            content = content.trim();
            if (content.startsWith("\"") && content.endsWith("\"")) {
                content = content.substring(1, content.length() - 1).trim();
            }
        }

        // Map to your DTO
        AIRewriteResponse dto = new AIRewriteResponse();
        dto.setRewrittenText(content != null ? content : "");
        return dto;
    }

}
