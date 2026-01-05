package mailmerge.service.dto;

import jakarta.persistence.Lob;
import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import mailmerge.domain.enumeration.EmailStatus;

/**
 * A DTO for the {@link mailmerge.domain.Project} entity.
 */
@SuppressWarnings("common-java:DuplicatedBlocks")
public class ProjectDTO implements Serializable {

    private Long id;

    @NotNull
    @Size(min = 1)
    private String name;

    // ✅ NEW: store the original spreadsheet filename (e.g. "scores.xlsx")
    private String spreadsheetName;

    @Lob
    private byte[] spreadsheetLink;

    private String spreadsheetLinkContentType;

    private String spreadsheetFileContentType;

    @Lob
    private String toField;

    @Lob
    private String ccField;

    @Lob
    private String bccField;

    @Lob
    private String header;

    @Lob
    private String content;

    private EmailStatus status;

    private Instant sentAt;

    private UserDTO user;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getSpreadsheetName() {
        return spreadsheetName;
    }

    public void setSpreadsheetName(String spreadsheetName) {
        this.spreadsheetName = spreadsheetName;
    }

    public byte[] getSpreadsheetLink() {
        return spreadsheetLink;
    }

    public void setSpreadsheetLink(byte[] spreadsheetLink) {
        this.spreadsheetLink = spreadsheetLink;
    }

    public String getSpreadsheetFileContentType() {
        return spreadsheetFileContentType;
    }

    public void setSpreadsheetFileContentType(String spreadsheetFileContentType) {
        this.spreadsheetFileContentType = spreadsheetFileContentType;
    }

    public String getSpreadsheetLinkContentType() {
        return spreadsheetLinkContentType;
    }

    public void setSpreadsheetLinkContentType(String spreadsheetLinkContentType) {
        this.spreadsheetLinkContentType = spreadsheetLinkContentType;
    }

    public String getToField() {
        return toField;
    }

    public void setToField(String toField) {
        this.toField = toField;
    }

    public String getCcField() {
        return ccField;
    }

    public void setCcField(String ccField) {
        this.ccField = ccField;
    }

    public String getBccField() {
        return bccField;
    }

    public void setBccField(String bccField) {
        this.bccField = bccField;
    }

    public String getHeader() {
        return header;
    }

    public void setHeader(String header) {
        this.header = header;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public EmailStatus getStatus() {
        return status;
    }

    public void setStatus(EmailStatus status) {
        this.status = status;
    }

    public Instant getSentAt() {
        return sentAt;
    }

    public void setSentAt(Instant sentAt) {
        this.sentAt = sentAt;
    }

    public UserDTO getUser() {
        return user;
    }

    public void setUser(UserDTO user) {
        this.user = user;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof ProjectDTO)) {
            return false;
        }

        ProjectDTO projectDTO = (ProjectDTO) o;
        if (this.id == null) {
            return false;
        }
        return Objects.equals(this.id, projectDTO.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(this.id);
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "ProjectDTO{" +
            "id=" + getId() +
            ", name='" + getName() + "'" +
            ", spreadsheetName='" + getSpreadsheetName() + "'" +
            ", spreadsheetLink='" + getSpreadsheetLink() + "'" +
            ", spreadsheetLinkContentType='" + getSpreadsheetLinkContentType() + "'" +
            ", spreadsheetFileContentType='" + getSpreadsheetFileContentType() + "'" +
            ", toField='" + getToField() + "'" +
            ", ccField='" + getCcField() + "'" +
            ", bccField='" + getBccField() + "'" +
            ", header='" + getHeader() + "'" +
            ", content='" + getContent() + "'" +
            ", status='" + getStatus() + "'" +
            ", sentAt='" + getSentAt() + "'" +
            ", user=" + getUser() +
            "}";
    }
}
