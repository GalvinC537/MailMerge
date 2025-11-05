package mailmerge.service.dto;

public class GraphMailDTO {

    private String to;
    private String subject;
    private String body;

    public GraphMailDTO() {
        // Empty constructor for JSON deserialization
    }

    public GraphMailDTO(String to, String subject, String body) {
        this.to = to;
        this.subject = subject;
        this.body = body;
    }

    public String getTo() {
        return to;
    }

    public void setTo(String to) {
        this.to = to;
    }

    public String getSubject() {
        return subject;
    }

    public void setSubject(String subject) {
        this.subject = subject;
    }

    public String getBody() {
        return body;
    }

    public void setBody(String body) {
        this.body = body;
    }

    @Override
    public String toString() {
        return "GraphMailDTO{" +
            "to='" + to + '\'' +
            ", subject='" + subject + '\'' +
            ", body='" + (body != null ? body.substring(0, Math.min(50, body.length())) + "..." : null) + '\'' +
            '}';
    }
}
