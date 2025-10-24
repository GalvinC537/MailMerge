package mailmerge.service.mapper;

import mailmerge.domain.Project;
import mailmerge.domain.User;
import mailmerge.service.dto.ProjectDTO;
import mailmerge.service.dto.UserDTO;
import org.mapstruct.*;

/**
 * Mapper for the entity {@link Project} and its DTO {@link ProjectDTO}.
 */
@Mapper(componentModel = "spring")
public interface ProjectMapper extends EntityMapper<ProjectDTO, Project> {
    @Mapping(target = "user", source = "user", qualifiedByName = "userLogin")
    ProjectDTO toDto(Project s);

    @Named("userLogin")
    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "id", source = "id")
    @Mapping(target = "login", source = "login")
    UserDTO toDtoUserLogin(User user);
}
