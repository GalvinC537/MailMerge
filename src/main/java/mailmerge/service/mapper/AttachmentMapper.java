package mailmerge.service.mapper;

import mailmerge.domain.Attachment;
import mailmerge.domain.Email;
import mailmerge.domain.Project;
import mailmerge.service.dto.AttachmentDTO;
import mailmerge.service.dto.EmailDTO;
import mailmerge.service.dto.ProjectDTO;
import org.mapstruct.*;

/**
 * Mapper for the entity {@link Attachment} and its DTO {@link AttachmentDTO}.
 */
@Mapper(componentModel = "spring")
public interface AttachmentMapper extends EntityMapper<AttachmentDTO, Attachment> {
    @Mapping(target = "project", source = "project", qualifiedByName = "projectId")
    @Mapping(target = "email", source = "email", qualifiedByName = "emailId")
    AttachmentDTO toDto(Attachment s);

    @Named("projectId")
    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "id", source = "id")
    ProjectDTO toDtoProjectId(Project project);

    @Named("emailId")
    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "id", source = "id")
    EmailDTO toDtoEmailId(Email email);
}
