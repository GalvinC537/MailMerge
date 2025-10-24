package mailmerge.service.mapper;

import mailmerge.domain.Attachment;
import mailmerge.domain.Email;
import mailmerge.service.dto.AttachmentDTO;
import mailmerge.service.dto.EmailDTO;
import org.mapstruct.*;

/**
 * Mapper for the entity {@link Attachment} and its DTO {@link AttachmentDTO}.
 */
@Mapper(componentModel = "spring")
public interface AttachmentMapper extends EntityMapper<AttachmentDTO, Attachment> {
    @Mapping(target = "email", source = "email", qualifiedByName = "emailId")
    AttachmentDTO toDto(Attachment s);

    @Named("emailId")
    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "id", source = "id")
    EmailDTO toDtoEmailId(Email email);
}
