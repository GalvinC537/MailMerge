package mailmerge.service;

import jakarta.persistence.criteria.JoinType;
import java.util.List;
import mailmerge.domain.*; // for static metamodels
import mailmerge.domain.Attachment;
import mailmerge.repository.AttachmentRepository;
import mailmerge.service.criteria.AttachmentCriteria;
import mailmerge.service.dto.AttachmentDTO;
import mailmerge.service.mapper.AttachmentMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tech.jhipster.service.QueryService;

/**
 * Service for executing complex queries for {@link Attachment} entities in the database.
 * The main input is a {@link AttachmentCriteria} which gets converted to {@link Specification},
 * in a way that all the filters must apply.
 * It returns a {@link List} of {@link AttachmentDTO} which fulfills the criteria.
 */
@Service
@Transactional(readOnly = true)
public class AttachmentQueryService extends QueryService<Attachment> {

    private static final Logger LOG = LoggerFactory.getLogger(AttachmentQueryService.class);

    private final AttachmentRepository attachmentRepository;

    private final AttachmentMapper attachmentMapper;

    public AttachmentQueryService(AttachmentRepository attachmentRepository, AttachmentMapper attachmentMapper) {
        this.attachmentRepository = attachmentRepository;
        this.attachmentMapper = attachmentMapper;
    }

    /**
     * Return a {@link List} of {@link AttachmentDTO} which matches the criteria from the database.
     * @param criteria The object which holds all the filters, which the entities should match.
     * @return the matching entities.
     */
    @Transactional(readOnly = true)
    public List<AttachmentDTO> findByCriteria(AttachmentCriteria criteria) {
        LOG.debug("find by criteria : {}", criteria);
        final Specification<Attachment> specification = createSpecification(criteria);
        return attachmentMapper.toDto(attachmentRepository.findAll(specification));
    }

    /**
     * Return the number of matching entities in the database.
     * @param criteria The object which holds all the filters, which the entities should match.
     * @return the number of matching entities.
     */
    @Transactional(readOnly = true)
    public long countByCriteria(AttachmentCriteria criteria) {
        LOG.debug("count by criteria : {}", criteria);
        final Specification<Attachment> specification = createSpecification(criteria);
        return attachmentRepository.count(specification);
    }

    /**
     * Function to convert {@link AttachmentCriteria} to a {@link Specification}
     * @param criteria The object which holds all the filters, which the entities should match.
     * @return the matching {@link Specification} of the entity.
     */
    protected Specification<Attachment> createSpecification(AttachmentCriteria criteria) {
        Specification<Attachment> specification = Specification.where(null);
        if (criteria != null) {
            // This has to be called first, because the distinct method returns null
            if (criteria.getDistinct() != null) {
                specification = specification.and(distinct(criteria.getDistinct()));
            }
            if (criteria.getId() != null) {
                specification = specification.and(buildRangeSpecification(criteria.getId(), Attachment_.id));
            }
            if (criteria.getFileContentType() != null) {
                specification = specification.and(buildStringSpecification(criteria.getFileContentType(), Attachment_.fileContentType));
            }
            if (criteria.getName() != null) {
                specification = specification.and(buildStringSpecification(criteria.getName(), Attachment_.name));
            }
            if (criteria.getSize() != null) {
                specification = specification.and(buildRangeSpecification(criteria.getSize(), Attachment_.size));
            }
            if (criteria.getProjectId() != null) {
                specification = specification.and(
                    buildSpecification(criteria.getProjectId(), root -> root.join(Attachment_.project, JoinType.LEFT).get(Project_.id))
                );
            }
            if (criteria.getEmailId() != null) {
                specification = specification.and(
                    buildSpecification(criteria.getEmailId(), root -> root.join(Attachment_.email, JoinType.LEFT).get(Email_.id))
                );
            }
        }
        return specification;
    }
}
