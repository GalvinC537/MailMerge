package mailmerge.service.dto;

public class PublicUserDTO {
    private String id;
    private String login;

    public PublicUserDTO() {}

    public PublicUserDTO(String id, String login) {
        this.id = id;
        this.login = login;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getLogin() { return login; }
    public void setLogin(String login) { this.login = login; }
}
