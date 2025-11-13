package mailmerge.service.criteria;

import java.io.Serializable;
import java.util.Objects;
import java.util.Optional;
import org.springdoc.core.annotations.ParameterObject;
import tech.jhipster.service.Criteria;
import tech.jhipster.service.filter.*;

/**
 * Criteria class for the {@link mailmerge.domain.Attachment} entity. This class is used
 * in {@link mailmerge.web.rest.AttachmentResource} to receive all the possible filtering options from
 * the Http GET request parameters.
 * For example the following could be a valid request:
 * {@code /attachments?id.greaterThan=5&attr1.contains=something&attr2.specified=false}
 * As Spring is unable to properly convert the types, unless specific {@link Filter} class are used, we need to use
 * fix type specific filters.
 */
@ParameterObject
@SuppressWarnings("common-java:DuplicatedBlocks")
public class AttachmentCriteria implements Serializable, Criteria {

    private static final long serialVersionUID = 1L;

    private LongFilter id;

    private StringFilter fileContentType;

    private StringFilter name;

    private LongFilter size;

    private LongFilter projectId;

    private LongFilter emailId;

    private Boolean distinct;

    public AttachmentCriteria() {}

    public AttachmentCriteria(AttachmentCriteria other) {
        this.id = other.optionalId().map(LongFilter::copy).orElse(null);
        this.fileContentType = other.optionalFileContentType().map(StringFilter::copy).orElse(null);
        this.name = other.optionalName().map(StringFilter::copy).orElse(null);
        this.size = other.optionalSize().map(LongFilter::copy).orElse(null);
        this.projectId = other.optionalProjectId().map(LongFilter::copy).orElse(null);
        this.emailId = other.optionalEmailId().map(LongFilter::copy).orElse(null);
        this.distinct = other.distinct;
    }

    @Override
    public AttachmentCriteria copy() {
        return new AttachmentCriteria(this);
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

    public StringFilter getFileContentType() {
        return fileContentType;
    }

    public Optional<StringFilter> optionalFileContentType() {
        return Optional.ofNullable(fileContentType);
    }

    public StringFilter fileContentType() {
        if (fileContentType == null) {
            setFileContentType(new StringFilter());
        }
        return fileContentType;
    }

    public void setFileContentType(StringFilter fileContentType) {
        this.fileContentType = fileContentType;
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

    public LongFilter getSize() {
        return size;
    }

    public Optional<LongFilter> optionalSize() {
        return Optional.ofNullable(size);
    }

    public LongFilter size() {
        if (size == null) {
            setSize(new LongFilter());
        }
        return size;
    }

    public void setSize(LongFilter size) {
        this.size = size;
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

    public LongFilter getEmailId() {
        return emailId;
    }

    public Optional<LongFilter> optionalEmailId() {
        return Optional.ofNullable(emailId);
    }

    public LongFilter emailId() {
        if (emailId == null) {
            setEmailId(new LongFilter());
        }
        return emailId;
    }

    public void setEmailId(LongFilter emailId) {
        this.emailId = emailId;
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
        final AttachmentCriteria that = (AttachmentCriteria) o;
        return (
            Objects.equals(id, that.id) &&
            Objects.equals(fileContentType, that.fileContentType) &&
            Objects.equals(name, that.name) &&
            Objects.equals(size, that.size) &&
            Objects.equals(projectId, that.projectId) &&
            Objects.equals(emailId, that.emailId) &&
            Objects.equals(distinct, that.distinct)
        );
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, fileContentType, name, size, projectId, emailId, distinct);
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "AttachmentCriteria{" +
            optionalId().map(f -> "id=" + f + ", ").orElse("") +
            optionalFileContentType().map(f -> "fileContentType=" + f + ", ").orElse("") +
            optionalName().map(f -> "name=" + f + ", ").orElse("") +
            optionalSize().map(f -> "size=" + f + ", ").orElse("") +
            optionalProjectId().map(f -> "projectId=" + f + ", ").orElse("") +
            optionalEmailId().map(f -> "emailId=" + f + ", ").orElse("") +
            optionalDistinct().map(f -> "distinct=" + f + ", ").orElse("") +
        "}";
    }
}
