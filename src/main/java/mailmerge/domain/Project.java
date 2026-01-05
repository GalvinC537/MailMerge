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
 * A Project.
 */
@Entity
@Table(name = "project")
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
@SuppressWarnings("common-java:DuplicatedBlocks")
public class Project implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "sequenceGenerator")
    @SequenceGenerator(name = "sequenceGenerator")
    @Column(name = "id")
    private Long id;

    @NotNull
    @Size(min = 1)
    @Column(name = "name", nullable = false)
    private String name;

    // ✅ NEW: store the original spreadsheet filename (e.g. "scores.xlsx")
    @Column(name = "spreadsheet_name")
    private String spreadsheetName;

    @Lob
    @Column(name = "spreadsheet_link")
    private byte[] spreadsheetLink;

    @Column(name = "spreadsheet_link_content_type")
    private String spreadsheetLinkContentType;

    @Column(name = "spreadsheet_file_content_type")
    private String spreadsheetFileContentType;

    @Lob
    @Column(name = "to_field")
    private String toField;

    @Lob
    @Column(name = "cc_field")
    private String ccField;

    @Lob
    @Column(name = "bcc_field")
    private String bccField;

    @Lob
    @Column(name = "header")
    private String header;

    @Lob
    @Column(name = "content")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(name = "status")
    private EmailStatus status;

    @Column(name = "sent_at")
    private Instant sentAt;

    @OneToMany(fetch = FetchType.LAZY, mappedBy = "project")
    @Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
    @JsonIgnoreProperties(value = { "project" }, allowSetters = true)
    private Set<Heading> headings = new HashSet<>();

    @OneToMany(fetch = FetchType.LAZY, mappedBy = "project")
    @Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
    @JsonIgnoreProperties(value = { "project", "email" }, allowSetters = true)
    private Set<Attachment> attachments = new HashSet<>();

    @ManyToOne(fetch = FetchType.LAZY)
    private User user;

    @OneToMany(fetch = FetchType.LAZY, mappedBy = "project")
    @Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
    @JsonIgnoreProperties(value = { "attachments", "project" }, allowSetters = true)
    private Set<Email> emails = new HashSet<>();

    // jhipster-needle-entity-add-field - JHipster will add fields here

    public Long getId() {
        return this.id;
    }

    public Project id(Long id) {
        this.setId(id);
        return this;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return this.name;
    }

    public Project name(String name) {
        this.setName(name);
        return this;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getSpreadsheetName() {
        return this.spreadsheetName;
    }

    public Project spreadsheetName(String spreadsheetName) {
        this.setSpreadsheetName(spreadsheetName);
        return this;
    }

    public void setSpreadsheetName(String spreadsheetName) {
        this.spreadsheetName = spreadsheetName;
    }

    public byte[] getSpreadsheetLink() {
        return this.spreadsheetLink;
    }

    public Project spreadsheetLink(byte[] spreadsheetLink) {
        this.setSpreadsheetLink(spreadsheetLink);
        return this;
    }

    public void setSpreadsheetLink(byte[] spreadsheetLink) {
        this.spreadsheetLink = spreadsheetLink;
    }

    public String getSpreadsheetLinkContentType() {
        return this.spreadsheetLinkContentType;
    }

    public Project spreadsheetLinkContentType(String spreadsheetLinkContentType) {
        this.spreadsheetLinkContentType = spreadsheetLinkContentType;
        return this;
    }

    public void setSpreadsheetLinkContentType(String spreadsheetLinkContentType) {
        this.spreadsheetLinkContentType = spreadsheetLinkContentType;
    }

    public String getSpreadsheetFileContentType() {
        return this.spreadsheetFileContentType;
    }

    public Project spreadsheetFileContentType(String spreadsheetFileContentType) {
        this.setSpreadsheetFileContentType(spreadsheetFileContentType);
        return this;
    }

    public void setSpreadsheetFileContentType(String spreadsheetFileContentType) {
        this.spreadsheetFileContentType = spreadsheetFileContentType;
    }

    public String getToField() {
        return this.toField;
    }

    public Project toField(String toField) {
        this.setToField(toField);
        return this;
    }

    public void setToField(String toField) {
        this.toField = toField;
    }

    public String getCcField() {
        return this.ccField;
    }

    public Project ccField(String ccField) {
        this.setCcField(ccField);
        return this;
    }

    public void setCcField(String ccField) {
        this.ccField = ccField;
    }

    public String getBccField() {
        return this.bccField;
    }

    public Project bccField(String bccField) {
        this.setBccField(bccField);
        return this;
    }

    public void setBccField(String bccField) {
        this.bccField = bccField;
    }

    public String getHeader() {
        return this.header;
    }

    public Project header(String header) {
        this.setHeader(header);
        return this;
    }

    public void setHeader(String header) {
        this.header = header;
    }

    public String getContent() {
        return this.content;
    }

    public Project content(String content) {
        this.setContent(content);
        return this;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public EmailStatus getStatus() {
        return this.status;
    }

    public Project status(EmailStatus status) {
        this.setStatus(status);
        return this;
    }

    public void setStatus(EmailStatus status) {
        this.status = status;
    }

    public Instant getSentAt() {
        return this.sentAt;
    }

    public Project sentAt(Instant sentAt) {
        this.setSentAt(sentAt);
        return this;
    }

    public void setSentAt(Instant sentAt) {
        this.sentAt = sentAt;
    }

    public Set<Heading> getHeadings() {
        return this.headings;
    }

    public void setHeadings(Set<Heading> headings) {
        if (this.headings != null) {
            this.headings.forEach(i -> i.setProject(null));
        }
        if (headings != null) {
            headings.forEach(i -> i.setProject(this));
        }
        this.headings = headings;
    }

    public Project headings(Set<Heading> headings) {
        this.setHeadings(headings);
        return this;
    }

    public Project addHeadings(Heading heading) {
        this.headings.add(heading);
        heading.setProject(this);
        return this;
    }

    public Project removeHeadings(Heading heading) {
        this.headings.remove(heading);
        heading.setProject(null);
        return this;
    }

    public Set<Attachment> getAttachments() {
        return this.attachments;
    }

    public void setAttachments(Set<Attachment> attachments) {
        if (this.attachments != null) {
            this.attachments.forEach(i -> i.setProject(null));
        }
        if (attachments != null) {
            attachments.forEach(i -> i.setProject(this));
        }
        this.attachments = attachments;
    }

    public Project attachments(Set<Attachment> attachments) {
        this.setAttachments(attachments);
        return this;
    }

    public Project addAttachments(Attachment attachment) {
        this.attachments.add(attachment);
        attachment.setProject(this);
        return this;
    }

    public Project removeAttachments(Attachment attachment) {
        this.attachments.remove(attachment);
        attachment.setProject(null);
        return this;
    }

    public User getUser() {
        return this.user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public Project user(User user) {
        this.setUser(user);
        return this;
    }

    public Set<Email> getEmails() {
        return this.emails;
    }

    public void setEmails(Set<Email> emails) {
        if (this.emails != null) {
            this.emails.forEach(i -> i.setProject(null));
        }
        if (emails != null) {
            emails.forEach(i -> i.setProject(this));
        }
        this.emails = emails;
    }

    public Project emails(Set<Email> emails) {
        this.setEmails(emails);
        return this;
    }

    public Project addEmails(Email email) {
        this.emails.add(email);
        email.setProject(this);
        return this;
    }

    public Project removeEmails(Email email) {
        this.emails.remove(email);
        email.setProject(null);
        return this;
    }

    // jhipster-needle-entity-add-getters-setters - JHipster will add getters and setters here

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof Project)) {
            return false;
        }
        return getId() != null && getId().equals(((Project) o).getId());
    }

    @Override
    public int hashCode() {
        // see https://vladmihalcea.com/how-to-implement-equals-and-hashcode-using-the-jpa-entity-identifier/
        return getClass().hashCode();
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "Project{" +
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
            "}";
    }
}
