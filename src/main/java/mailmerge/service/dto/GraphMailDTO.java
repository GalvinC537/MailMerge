package mailmerge.service.dto;

import java.util.List;

public class GraphMailDTO {

    private String to;
    private String cc;
    private String bcc;
    private String subject;
    private String body;
    private List<AttachmentDTO> attachments;

    public GraphMailDTO() {
        // Empty constructor for JSON deserialization
    }

    public GraphMailDTO(String to, String cc, String bcc, String subject, String body, List<AttachmentDTO> attachments) {
        this.to = to;
        this.cc = cc;
        this.bcc = bcc;
        this.subject = subject;
        this.body = body;
        this.attachments = attachments;
    }

    public String getTo() {
        return to;
    }

    public void setTo(String to) {
        this.to = to;
    }

    public String getCc() {
        return cc;
    }

    public void setCc(String cc) {
        this.cc = cc;
    }

    public String getBcc() {
        return bcc;
    }

    public void setBcc(String bcc) {
        this.bcc = bcc;
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

    public List<AttachmentDTO> getAttachments() {
        return attachments;
    }

    public void setAttachments(List<AttachmentDTO> attachments) {
        this.attachments = attachments;
    }

    @Override
    public String toString() {
        return "GraphMailDTO{" +
                "to='" + to + '\'' +
                ", cc='" + cc + '\'' +
                ", bcc='" + bcc + '\'' +
                ", subject='" + subject + '\'' +
                ", body='" + (body != null ? body.substring(0, Math.min(50, body.length())) + "..." : null) + '\'' +
                ", attachments=" + (attachments != null ? attachments.size() : 0) +
                '}';
    }
}
