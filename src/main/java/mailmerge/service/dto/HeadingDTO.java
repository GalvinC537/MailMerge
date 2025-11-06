package mailmerge.service.dto;

import java.io.Serializable;
import java.util.Objects;

/**
 * A DTO for the {@link mailmerge.domain.Heading} entity.
 */
@SuppressWarnings("common-java:DuplicatedBlocks")
public class HeadingDTO implements Serializable {

    private Long id;

    private String name;

    private ProjectDTO project;

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
        if (!(o instanceof HeadingDTO)) {
            return false;
        }

        HeadingDTO headingDTO = (HeadingDTO) o;
        if (this.id == null) {
            return false;
        }
        return Objects.equals(this.id, headingDTO.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(this.id);
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "HeadingDTO{" +
            "id=" + getId() +
            ", name='" + getName() + "'" +
            ", project=" + getProject() +
            "}";
    }
}
