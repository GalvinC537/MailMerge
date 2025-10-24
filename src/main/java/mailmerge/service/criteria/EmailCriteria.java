package mailmerge.service.criteria;

import java.io.Serializable;
import java.util.Objects;
import java.util.Optional;
import mailmerge.domain.enumeration.EmailStatus;
import org.springdoc.core.annotations.ParameterObject;
import tech.jhipster.service.Criteria;
import tech.jhipster.service.filter.*;

/**
 * Criteria class for the {@link mailmerge.domain.Email} entity. This class is used
 * in {@link mailmerge.web.rest.EmailResource} to receive all the possible filtering options from
 * the Http GET request parameters.
 * For example the following could be a valid request:
 * {@code /emails?id.greaterThan=5&attr1.contains=something&attr2.specified=false}
 * As Spring is unable to properly convert the types, unless specific {@link Filter} class are used, we need to use
 * fix type specific filters.
 */
@ParameterObject
@SuppressWarnings("common-java:DuplicatedBlocks")
public class EmailCriteria implements Serializable, Criteria {

    /**
     * Class for filtering EmailStatus
     */
    public static class EmailStatusFilter extends Filter<EmailStatus> {

        public EmailStatusFilter() {}

        public EmailStatusFilter(EmailStatusFilter filter) {
            super(filter);
        }

        @Override
        public EmailStatusFilter copy() {
            return new EmailStatusFilter(this);
        }
    }

    private static final long serialVersionUID = 1L;

    private LongFilter id;

    private StringFilter emailAddress;

    private EmailStatusFilter status;

    private InstantFilter sentAt;

    private LongFilter attachmentsId;

    private LongFilter projectId;

    private Boolean distinct;

    public EmailCriteria() {}

    public EmailCriteria(EmailCriteria other) {
        this.id = other.optionalId().map(LongFilter::copy).orElse(null);
        this.emailAddress = other.optionalEmailAddress().map(StringFilter::copy).orElse(null);
        this.status = other.optionalStatus().map(EmailStatusFilter::copy).orElse(null);
        this.sentAt = other.optionalSentAt().map(InstantFilter::copy).orElse(null);
        this.attachmentsId = other.optionalAttachmentsId().map(LongFilter::copy).orElse(null);
        this.projectId = other.optionalProjectId().map(LongFilter::copy).orElse(null);
        this.distinct = other.distinct;
    }

    @Override
    public EmailCriteria copy() {
        return new EmailCriteria(this);
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

    public StringFilter getEmailAddress() {
        return emailAddress;
    }

    public Optional<StringFilter> optionalEmailAddress() {
        return Optional.ofNullable(emailAddress);
    }

    public StringFilter emailAddress() {
        if (emailAddress == null) {
            setEmailAddress(new StringFilter());
        }
        return emailAddress;
    }

    public void setEmailAddress(StringFilter emailAddress) {
        this.emailAddress = emailAddress;
    }

    public EmailStatusFilter getStatus() {
        return status;
    }

    public Optional<EmailStatusFilter> optionalStatus() {
        return Optional.ofNullable(status);
    }

    public EmailStatusFilter status() {
        if (status == null) {
            setStatus(new EmailStatusFilter());
        }
        return status;
    }

    public void setStatus(EmailStatusFilter status) {
        this.status = status;
    }

    public InstantFilter getSentAt() {
        return sentAt;
    }

    public Optional<InstantFilter> optionalSentAt() {
        return Optional.ofNullable(sentAt);
    }

    public InstantFilter sentAt() {
        if (sentAt == null) {
            setSentAt(new InstantFilter());
        }
        return sentAt;
    }

    public void setSentAt(InstantFilter sentAt) {
        this.sentAt = sentAt;
    }

    public LongFilter getAttachmentsId() {
        return attachmentsId;
    }

    public Optional<LongFilter> optionalAttachmentsId() {
        return Optional.ofNullable(attachmentsId);
    }

    public LongFilter attachmentsId() {
        if (attachmentsId == null) {
            setAttachmentsId(new LongFilter());
        }
        return attachmentsId;
    }

    public void setAttachmentsId(LongFilter attachmentsId) {
        this.attachmentsId = attachmentsId;
    }

    public LongFilter getProjectId() {
        return projectId;
    }

    public Optional<LongFilter> optionalProjectId() {
        return Optional.ofNullable(projectId);
    }

    public LongFilter projectId() {
        if (projectId == null) {
            setProjectId(new LongFilter());
        }
        return projectId;
    }

    public void setProjectId(LongFilter projectId) {
        this.projectId = projectId;
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
        final EmailCriteria that = (EmailCriteria) o;
        return (
            Objects.equals(id, that.id) &&
            Objects.equals(emailAddress, that.emailAddress) &&
            Objects.equals(status, that.status) &&
            Objects.equals(sentAt, that.sentAt) &&
            Objects.equals(attachmentsId, that.attachmentsId) &&
            Objects.equals(projectId, that.projectId) &&
            Objects.equals(distinct, that.distinct)
        );
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, emailAddress, status, sentAt, attachmentsId, projectId, distinct);
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "EmailCriteria{" +
            optionalId().map(f -> "id=" + f + ", ").orElse("") +
            optionalEmailAddress().map(f -> "emailAddress=" + f + ", ").orElse("") +
            optionalStatus().map(f -> "status=" + f + ", ").orElse("") +
            optionalSentAt().map(f -> "sentAt=" + f + ", ").orElse("") +
            optionalAttachmentsId().map(f -> "attachmentsId=" + f + ", ").orElse("") +
            optionalProjectId().map(f -> "projectId=" + f + ", ").orElse("") +
            optionalDistinct().map(f -> "distinct=" + f + ", ").orElse("") +
        "}";
    }
}
