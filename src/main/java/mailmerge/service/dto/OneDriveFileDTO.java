// src/main/java/mailmerge/service/dto/OneDriveFileDTO.java
package mailmerge.service.dto;

public class OneDriveFileDTO {

    private String id;
    private String driveId;
    private String name;
    private String webUrl;

    public OneDriveFileDTO() {}

    public OneDriveFileDTO(String id, String driveId, String name, String webUrl) {
        this.id = id;
        this.driveId = driveId;
        this.name = name;
        this.webUrl = webUrl;
    }

    public String getId() {
        return id;
    }

    public String getDriveId() {
        return driveId;
    }

    public String getName() {
        return name;
    }

    public String getWebUrl() {
        return webUrl;
    }

    public void setId(String id) {
        this.id = id;
    }

    public void setDriveId(String driveId) {
        this.driveId = driveId;
    }

    public void setName(String name) {
        this.name = name;
    }

    public void setWebUrl(String webUrl) {
        this.webUrl = webUrl;
    }
}
