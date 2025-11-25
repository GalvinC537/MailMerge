package mailmerge.service.dto;

public class AIRewriteRequest {

    private String originalText;
    private String tone; // "professional", "friendly", or custom free text

    public String getOriginalText() {
        return originalText;
    }

    public void setOriginalText(String originalText) {
        this.originalText = originalText;
    }

    public String getTone() {
        return tone;
    }

    public void setTone(String tone) {
        this.tone = tone;
    }
}
