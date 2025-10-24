package mailmerge.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import mailmerge.domain.enumeration.EmailStatus;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;

/**
 * A Email.
 */
@Entity
@Table(name = "email")
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
@SuppressWarnings("common-java:DuplicatedBlocks")
public class Email implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "sequenceGenerator")
    @SequenceGenerator(name = "sequenceGenerator")
    @Column(name = "id")
    private Long id;

    @NotNull
    @Column(name = "email_address", nullable = false)
    private String emailAddress;

    @Lob
    @Column(name = "content", nullable = false)
    private String content;

    @Lob
    @Column(name = "variables_json")
    private String variablesJson;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private EmailStatus status;

    @Column(name = "sent_at")
    private Instant sentAt;

    @OneToMany(fetch = FetchType.LAZY, mappedBy = "email")
    @Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
    @JsonIgnoreProperties(value = { "email" }, allowSetters = true)
    private Set<Attachment> attachments = new HashSet<>();

    @ManyToOne(fetch = FetchType.LAZY)
    @JsonIgnoreProperties(value = { "emails", "headings", "user" }, allowSetters = true)
    private Project project;

    // jhipster-needle-entity-add-field - JHipster will add fields here

    public Long getId() {
        return this.id;
    }

    public Email id(Long id) {
        this.setId(id);
        return this;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getEmailAddress() {
        return this.emailAddress;
    }

    public Email emailAddress(String emailAddress) {
        this.setEmailAddress(emailAddress);
        return this;
    }

    public void setEmailAddress(String emailAddress) {
        this.emailAddress = emailAddress;
    }

    public String getContent() {
        return this.content;
    }

    public Email content(String content) {
        this.setContent(content);
        return this;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getVariablesJson() {
        return this.variablesJson;
    }

    public Email variablesJson(String variablesJson) {
        this.setVariablesJson(variablesJson);
        return this;
    }

    public void setVariablesJson(String variablesJson) {
        this.variablesJson = variablesJson;
    }

    public EmailStatus getStatus() {
        return this.status;
    }

    public Email status(EmailStatus status) {
        this.setStatus(status);
        return this;
    }

    public void setStatus(EmailStatus status) {
        this.status = status;
    }

    public Instant getSentAt() {
        return this.sentAt;
    }

    public Email sentAt(Instant sentAt) {
        this.setSentAt(sentAt);
        return this;
    }

    public void setSentAt(Instant sentAt) {
        this.sentAt = sentAt;
    }

    public Set<Attachment> getAttachments() {
        return this.attachments;
    }

    public void setAttachments(Set<Attachment> attachments) {
        if (this.attachments != null) {
            this.attachments.forEach(i -> i.setEmail(null));
        }
        if (attachments != null) {
            attachments.forEach(i -> i.setEmail(this));
        }
        this.attachments = attachments;
    }

    public Email attachments(Set<Attachment> attachments) {
        this.setAttachments(attachments);
        return this;
    }

    public Email addAttachments(Attachment attachment) {
        this.attachments.add(attachment);
        attachment.setEmail(this);
        return this;
    }

    public Email removeAttachments(Attachment attachment) {
        this.attachments.remove(attachment);
        attachment.setEmail(null);
        return this;
    }

    public Project getProject() {
        return this.project;
    }

    public void setProject(Project project) {
        this.project = project;
    }

    public Email project(Project project) {
        this.setProject(project);
        return this;
    }

    // jhipster-needle-entity-add-getters-setters - JHipster will add getters and setters here

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof Email)) {
            return false;
        }
        return getId() != null && getId().equals(((Email) o).getId());
    }

    @Override
    public int hashCode() {
        // see https://vladmihalcea.com/how-to-implement-equals-and-hashcode-using-the-jpa-entity-identifier/
        return getClass().hashCode();
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "Email{" +
            "id=" + getId() +
            ", emailAddress='" + getEmailAddress() + "'" +
            ", content='" + getContent() + "'" +
            ", variablesJson='" + getVariablesJson() + "'" +
            ", status='" + getStatus() + "'" +
            ", sentAt='" + getSentAt() + "'" +
            "}";
    }
}
