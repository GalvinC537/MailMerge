package mailmerge.service.dto;

public class AIRewriteResponse {
    private String rewrittenText;

    // ✅ Required by Jackson
    public AIRewriteResponse() {}

    // ✅ Optional convenience constructor
    public AIRewriteResponse(String rewrittenText) {
        this.rewrittenText = rewrittenText;
    }

    public String getRewrittenText() {
        return rewrittenText;
    }

    public void setRewrittenText(String rewrittenText) {
        this.rewrittenText = rewrittenText;
    }
}
