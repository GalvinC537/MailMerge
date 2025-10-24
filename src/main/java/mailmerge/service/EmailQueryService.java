package mailmerge.service;

import jakarta.persistence.criteria.JoinType;
import mailmerge.domain.*; // for static metamodels
import mailmerge.domain.Email;
import mailmerge.repository.EmailRepository;
import mailmerge.service.criteria.EmailCriteria;
import mailmerge.service.dto.EmailDTO;
import mailmerge.service.mapper.EmailMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tech.jhipster.service.QueryService;

/**
 * Service for executing complex queries for {@link Email} entities in the database.
 * The main input is a {@link EmailCriteria} which gets converted to {@link Specification},
 * in a way that all the filters must apply.
 * It returns a {@link Page} of {@link EmailDTO} which fulfills the criteria.
 */
@Service
@Transactional(readOnly = true)
public class EmailQueryService extends QueryService<Email> {

    private static final Logger LOG = LoggerFactory.getLogger(EmailQueryService.class);

    private final EmailRepository emailRepository;

    private final EmailMapper emailMapper;

    public EmailQueryService(EmailRepository emailRepository, EmailMapper emailMapper) {
        this.emailRepository = emailRepository;
        this.emailMapper = emailMapper;
    }

    /**
     * Return a {@link Page} of {@link EmailDTO} which matches the criteria from the database.
     * @param criteria The object which holds all the filters, which the entities should match.
     * @param page The page, which should be returned.
     * @return the matching entities.
     */
    @Transactional(readOnly = true)
    public Page<EmailDTO> findByCriteria(EmailCriteria criteria, Pageable page) {
        LOG.debug("find by criteria : {}, page: {}", criteria, page);
        final Specification<Email> specification = createSpecification(criteria);
        return emailRepository.findAll(specification, page).map(emailMapper::toDto);
    }

    /**
     * Return the number of matching entities in the database.
     * @param criteria The object which holds all the filters, which the entities should match.
     * @return the number of matching entities.
     */
    @Transactional(readOnly = true)
    public long countByCriteria(EmailCriteria criteria) {
        LOG.debug("count by criteria : {}", criteria);
        final Specification<Email> specification = createSpecification(criteria);
        return emailRepository.count(specification);
    }

    /**
     * Function to convert {@link EmailCriteria} to a {@link Specification}
     * @param criteria The object which holds all the filters, which the entities should match.
     * @return the matching {@link Specification} of the entity.
     */
    protected Specification<Email> createSpecification(EmailCriteria criteria) {
        Specification<Email> specification = Specification.where(null);
        if (criteria != null) {
            // This has to be called first, because the distinct method returns null
            if (criteria.getDistinct() != null) {
                specification = specification.and(distinct(criteria.getDistinct()));
            }
            if (criteria.getId() != null) {
                specification = specification.and(buildRangeSpecification(criteria.getId(), Email_.id));
            }
            if (criteria.getEmailAddress() != null) {
                specification = specification.and(buildStringSpecification(criteria.getEmailAddress(), Email_.emailAddress));
            }
            if (criteria.getStatus() != null) {
                specification = specification.and(buildSpecification(criteria.getStatus(), Email_.status));
            }
            if (criteria.getSentAt() != null) {
                specification = specification.and(buildRangeSpecification(criteria.getSentAt(), Email_.sentAt));
            }
            if (criteria.getAttachmentsId() != null) {
                specification = specification.and(
                    buildSpecification(criteria.getAttachmentsId(), root -> root.join(Email_.attachments, JoinType.LEFT).get(Attachment_.id)
                    )
                );
            }
            if (criteria.getProjectId() != null) {
                specification = specification.and(
                    buildSpecification(criteria.getProjectId(), root -> root.join(Email_.project, JoinType.LEFT).get(Project_.id))
                );
            }
        }
        return specification;
    }
}
