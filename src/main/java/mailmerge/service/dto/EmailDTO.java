package mailmerge.service.dto;

import jakarta.persistence.Lob;
import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import mailmerge.domain.enumeration.EmailStatus;

/**
 * A DTO for the {@link mailmerge.domain.Email} entity.
 */
@SuppressWarnings("common-java:DuplicatedBlocks")
public class EmailDTO implements Serializable {

    private Long id;

    @NotNull
    private String emailAddress;

    @Lob
    private String content;

    @Lob
    private String variablesJson;

    @NotNull
    private EmailStatus status;

    private Instant sentAt;

    private ProjectDTO project;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getEmailAddress() {
        return emailAddress;
    }

    public void setEmailAddress(String emailAddress) {
        this.emailAddress = emailAddress;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getVariablesJson() {
        return variablesJson;
    }

    public void setVariablesJson(String variablesJson) {
        this.variablesJson = variablesJson;
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

    public ProjectDTO getProject() {
        return project;
    }

    public void setProject(ProjectDTO project) {
        this.project = project;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof EmailDTO)) {
            return false;
        }

        EmailDTO emailDTO = (EmailDTO) o;
        if (this.id == null) {
            return false;
        }
        return Objects.equals(this.id, emailDTO.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(this.id);
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "EmailDTO{" +
            "id=" + getId() +
            ", emailAddress='" + getEmailAddress() + "'" +
            ", content='" + getContent() + "'" +
            ", variablesJson='" + getVariablesJson() + "'" +
            ", status='" + getStatus() + "'" +
            ", sentAt='" + getSentAt() + "'" +
            ", project=" + getProject() +
            "}";
    }
}
