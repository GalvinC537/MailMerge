package mailmerge.service.dto;

public class MailProgressEvent {
    public String email;
    public boolean success;
    public int sentCount;
    public int totalCount;
    public String message;

    public MailProgressEvent(String email, boolean success, int sentCount, int totalCount, String message) {
        this.email = email;
        this.success = success;
        this.sentCount = sentCount;
        this.totalCount = totalCount;
        this.message = message;
    }
}
