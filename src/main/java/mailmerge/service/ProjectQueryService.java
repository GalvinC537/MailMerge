package mailmerge.service;

import jakarta.persistence.criteria.JoinType;
import mailmerge.domain.*; // for static metamodels
import mailmerge.domain.Project;
import mailmerge.repository.ProjectRepository;
import mailmerge.service.criteria.ProjectCriteria;
import mailmerge.service.dto.ProjectDTO;
import mailmerge.service.mapper.ProjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tech.jhipster.service.QueryService;

/**
 * Service for executing complex queries for {@link Project} entities in the database.
 * The main input is a {@link ProjectCriteria} which gets converted to {@link Specification},
 * in a way that all the filters must apply.
 * It returns a {@link Page} of {@link ProjectDTO} which fulfills the criteria.
 */
@Service
@Transactional(readOnly = true)
public class ProjectQueryService extends QueryService<Project> {

    private static final Logger LOG = LoggerFactory.getLogger(ProjectQueryService.class);

    private final ProjectRepository projectRepository;

    private final ProjectMapper projectMapper;

    public ProjectQueryService(ProjectRepository projectRepository, ProjectMapper projectMapper) {
        this.projectRepository = projectRepository;
        this.projectMapper = projectMapper;
    }

    /**
     * Return a {@link Page} of {@link ProjectDTO} which matches the criteria from the database.
     * @param criteria The object which holds all the filters, which the entities should match.
     * @param page The page, which should be returned.
     * @return the matching entities.
     */
    @Transactional(readOnly = true)
    public Page<ProjectDTO> findByCriteria(ProjectCriteria criteria, Pageable page) {
        LOG.debug("find by criteria : {}, page: {}", criteria, page);
        final Specification<Project> specification = createSpecification(criteria);
        return projectRepository.findAll(specification, page).map(projectMapper::toDto);
    }

    /**
     * Return the number of matching entities in the database.
     * @param criteria The object which holds all the filters, which the entities should match.
     * @return the number of matching entities.
     */
    @Transactional(readOnly = true)
    public long countByCriteria(ProjectCriteria criteria) {
        LOG.debug("count by criteria : {}", criteria);
        final Specification<Project> specification = createSpecification(criteria);
        return projectRepository.count(specification);
    }

    /**
     * Function to convert {@link ProjectCriteria} to a {@link Specification}
     * @param criteria The object which holds all the filters, which the entities should match.
     * @return the matching {@link Specification} of the entity.
     */
    protected Specification<Project> createSpecification(ProjectCriteria criteria) {
        Specification<Project> specification = Specification.where(null);
        if (criteria != null) {
            // This has to be called first, because the distinct method returns null
            if (criteria.getDistinct() != null) {
                specification = specification.and(distinct(criteria.getDistinct()));
            }
            if (criteria.getId() != null) {
                specification = specification.and(buildRangeSpecification(criteria.getId(), Project_.id));
            }
            if (criteria.getName() != null) {
                specification = specification.and(buildStringSpecification(criteria.getName(), Project_.name));
            }
            if (criteria.getSpreadsheetFileContentType() != null) {
                specification = specification.and(
                    buildStringSpecification(criteria.getSpreadsheetFileContentType(), Project_.spreadsheetFileContentType)
                );
            }
            if (criteria.getStatus() != null) {
                specification = specification.and(buildSpecification(criteria.getStatus(), Project_.status));
            }
            if (criteria.getSentAt() != null) {
                specification = specification.and(buildRangeSpecification(criteria.getSentAt(), Project_.sentAt));
            }
            if (criteria.getHeadingsId() != null) {
                specification = specification.and(
                    buildSpecification(criteria.getHeadingsId(), root -> root.join(Project_.headings, JoinType.LEFT).get(Heading_.id))
                );
            }
            if (criteria.getAttachmentsId() != null) {
                specification = specification.and(
                    buildSpecification(criteria.getAttachmentsId(), root ->
                        root.join(Project_.attachments, JoinType.LEFT).get(Attachment_.id)
                    )
                );
            }
            if (criteria.getUserId() != null) {
                specification = specification.and(
                    buildSpecification(criteria.getUserId(), root -> root.join(Project_.user, JoinType.LEFT).get(User_.id))
                );
            }
            if (criteria.getEmailsId() != null) {
                specification = specification.and(
                    buildSpecification(criteria.getEmailsId(), root -> root.join(Project_.emails, JoinType.LEFT).get(Email_.id))
                );
            }
        }
        return specification;
    }
}
