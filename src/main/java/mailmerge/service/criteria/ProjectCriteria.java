package mailmerge.service.criteria;

import java.io.Serializable;
import java.util.Objects;
import java.util.Optional;
import org.springdoc.core.annotations.ParameterObject;
import tech.jhipster.service.Criteria;
import tech.jhipster.service.filter.*;

/**
 * Criteria class for the {@link mailmerge.domain.Project} entity. This class is used
 * in {@link mailmerge.web.rest.ProjectResource} to receive all the possible filtering options from
 * the Http GET request parameters.
 * For example the following could be a valid request:
 * {@code /projects?id.greaterThan=5&attr1.contains=something&attr2.specified=false}
 * As Spring is unable to properly convert the types, unless specific {@link Filter} class are used, we need to use
 * fix type specific filters.
 */
@ParameterObject
@SuppressWarnings("common-java:DuplicatedBlocks")
public class ProjectCriteria implements Serializable, Criteria {

    private static final long serialVersionUID = 1L;

    private LongFilter id;

    private StringFilter name;

    private StringFilter spreadsheetLink;

    private LongFilter emailsId;

    private LongFilter headingsId;

    private StringFilter userId;

    private Boolean distinct;

    public ProjectCriteria() {}

    public ProjectCriteria(ProjectCriteria other) {
        this.id = other.optionalId().map(LongFilter::copy).orElse(null);
        this.name = other.optionalName().map(StringFilter::copy).orElse(null);
        this.spreadsheetLink = other.optionalSpreadsheetLink().map(StringFilter::copy).orElse(null);
        this.emailsId = other.optionalEmailsId().map(LongFilter::copy).orElse(null);
        this.headingsId = other.optionalHeadingsId().map(LongFilter::copy).orElse(null);
        this.userId = other.optionalUserId().map(StringFilter::copy).orElse(null);
        this.distinct = other.distinct;
    }

    @Override
    public ProjectCriteria copy() {
        return new ProjectCriteria(this);
    }

    public LongFilter getId() {
        return id;
    }

    public Optional<LongFilter> optionalId() {
        return Optional.ofNullable(id);
    }

    public LongFilter id() {
        if (id == null) {
            setId(new LongFilter());
        }
        return id;
    }

    public void setId(LongFilter id) {
        this.id = id;
    }

    public StringFilter getName() {
        return name;
    }

    public Optional<StringFilter> optionalName() {
        return Optional.ofNullable(name);
    }

    public StringFilter name() {
        if (name == null) {
            setName(new StringFilter());
        }
        return name;
    }

    public void setName(StringFilter name) {
        this.name = name;
    }

    public StringFilter getSpreadsheetLink() {
        return spreadsheetLink;
    }

    public Optional<StringFilter> optionalSpreadsheetLink() {
        return Optional.ofNullable(spreadsheetLink);
    }

    public StringFilter spreadsheetLink() {
        if (spreadsheetLink == null) {
            setSpreadsheetLink(new StringFilter());
        }
        return spreadsheetLink;
    }

    public void setSpreadsheetLink(StringFilter spreadsheetLink) {
        this.spreadsheetLink = spreadsheetLink;
    }

    public LongFilter getEmailsId() {
        return emailsId;
    }

    public Optional<LongFilter> optionalEmailsId() {
        return Optional.ofNullable(emailsId);
    }

    public LongFilter emailsId() {
        if (emailsId == null) {
            setEmailsId(new LongFilter());
        }
        return emailsId;
    }

    public void setEmailsId(LongFilter emailsId) {
        this.emailsId = emailsId;
    }

    public LongFilter getHeadingsId() {
        return headingsId;
    }

    public Optional<LongFilter> optionalHeadingsId() {
        return Optional.ofNullable(headingsId);
    }

    public LongFilter headingsId() {
        if (headingsId == null) {
            setHeadingsId(new LongFilter());
        }
        return headingsId;
    }

    public void setHeadingsId(LongFilter headingsId) {
        this.headingsId = headingsId;
    }

    public StringFilter getUserId() {
        return userId;
    }

    public Optional<StringFilter> optionalUserId() {
        return Optional.ofNullable(userId);
    }

    public StringFilter userId() {
        if (userId == null) {
            setUserId(new StringFilter());
        }
        return userId;
    }

    public void setUserId(StringFilter userId) {
        this.userId = userId;
    }

    public Boolean getDistinct() {
        return distinct;
    }

    public Optional<Boolean> optionalDistinct() {
        return Optional.ofNullable(distinct);
    }

    public Boolean distinct() {
        if (distinct == null) {
            setDistinct(true);
        }
        return distinct;
    }

    public void setDistinct(Boolean distinct) {
        this.distinct = distinct;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (o == null || getClass() != o.getClass()) {
            return false;
        }
        final ProjectCriteria that = (ProjectCriteria) o;
        return (
            Objects.equals(id, that.id) &&
            Objects.equals(name, that.name) &&
            Objects.equals(spreadsheetLink, that.spreadsheetLink) &&
            Objects.equals(emailsId, that.emailsId) &&
            Objects.equals(headingsId, that.headingsId) &&
            Objects.equals(userId, that.userId) &&
            Objects.equals(distinct, that.distinct)
        );
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, name, spreadsheetLink, emailsId, headingsId, userId, distinct);
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "ProjectCriteria{" +
            optionalId().map(f -> "id=" + f + ", ").orElse("") +
            optionalName().map(f -> "name=" + f + ", ").orElse("") +
            optionalSpreadsheetLink().map(f -> "spreadsheetLink=" + f + ", ").orElse("") +
            optionalEmailsId().map(f -> "emailsId=" + f + ", ").orElse("") +
            optionalHeadingsId().map(f -> "headingsId=" + f + ", ").orElse("") +
            optionalUserId().map(f -> "userId=" + f + ", ").orElse("") +
            optionalDistinct().map(f -> "distinct=" + f + ", ").orElse("") +
        "}";
    }
}
