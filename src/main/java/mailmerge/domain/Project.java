package mailmerge.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.util.HashSet;
import java.util.Set;
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

    @NotNull
    @Column(name = "spreadsheet_link", nullable = false)
    private String spreadsheetLink;

    @OneToMany(fetch = FetchType.LAZY, mappedBy = "project")
    @Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
    @JsonIgnoreProperties(value = { "attachments", "project" }, allowSetters = true)
    private Set<Email> emails = new HashSet<>();

    @OneToMany(fetch = FetchType.LAZY, mappedBy = "project")
    @Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
    @JsonIgnoreProperties(value = { "project" }, allowSetters = true)
    private Set<Heading> headings = new HashSet<>();

    @ManyToOne(fetch = FetchType.LAZY)
    private User user;

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

    public String getSpreadsheetLink() {
        return this.spreadsheetLink;
    }

    public Project spreadsheetLink(String spreadsheetLink) {
        this.setSpreadsheetLink(spreadsheetLink);
        return this;
    }

    public void setSpreadsheetLink(String spreadsheetLink) {
        this.spreadsheetLink = spreadsheetLink;
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
            ", spreadsheetLink='" + getSpreadsheetLink() + "'" +
            "}";
    }
}
