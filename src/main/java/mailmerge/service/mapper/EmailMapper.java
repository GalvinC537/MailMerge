package mailmerge.service.mapper;

import mailmerge.domain.Email;
import mailmerge.domain.Project;
import mailmerge.service.dto.EmailDTO;
import mailmerge.service.dto.ProjectDTO;
import org.mapstruct.*;

/**
 * Mapper for the entity {@link Email} and its DTO {@link EmailDTO}.
 */
@Mapper(componentModel = "spring")
public interface EmailMapper extends EntityMapper<EmailDTO, Email> {
    @Mapping(target = "project", source = "project", qualifiedByName = "projectId")
    EmailDTO toDto(Email s);

    @Named("projectId")
    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "id", source = "id")
    ProjectDTO toDtoProjectId(Project project);
}
