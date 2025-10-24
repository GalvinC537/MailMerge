package mailmerge.service.mapper;

import mailmerge.domain.Heading;
import mailmerge.domain.Project;
import mailmerge.service.dto.HeadingDTO;
import mailmerge.service.dto.ProjectDTO;
import org.mapstruct.*;

/**
 * Mapper for the entity {@link Heading} and its DTO {@link HeadingDTO}.
 */
@Mapper(componentModel = "spring")
public interface HeadingMapper extends EntityMapper<HeadingDTO, Heading> {
    @Mapping(target = "project", source = "project", qualifiedByName = "projectId")
    HeadingDTO toDto(Heading s);

    @Named("projectId")
    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "id", source = "id")
    ProjectDTO toDtoProjectId(Project project);
}
