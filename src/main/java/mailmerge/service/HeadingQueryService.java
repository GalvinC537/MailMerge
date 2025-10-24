package mailmerge.service;

import jakarta.persistence.criteria.JoinType;
import java.util.List;
import mailmerge.domain.*; // for static metamodels
import mailmerge.domain.Heading;
import mailmerge.repository.HeadingRepository;
import mailmerge.service.criteria.HeadingCriteria;
import mailmerge.service.dto.HeadingDTO;
import mailmerge.service.mapper.HeadingMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tech.jhipster.service.QueryService;

/**
 * Service for executing complex queries for {@link Heading} entities in the database.
 * The main input is a {@link HeadingCriteria} which gets converted to {@link Specification},
 * in a way that all the filters must apply.
 * It returns a {@link List} of {@link HeadingDTO} which fulfills the criteria.
 */
@Service
@Transactional(readOnly = true)
public class HeadingQueryService extends QueryService<Heading> {

    private static final Logger LOG = LoggerFactory.getLogger(HeadingQueryService.class);

    private final HeadingRepository headingRepository;

    private final HeadingMapper headingMapper;

    public HeadingQueryService(HeadingRepository headingRepository, HeadingMapper headingMapper) {
        this.headingRepository = headingRepository;
        this.headingMapper = headingMapper;
    }

    /**
     * Return a {@link List} of {@link HeadingDTO} which matches the criteria from the database.
     * @param criteria The object which holds all the filters, which the entities should match.
     * @return the matching entities.
     */
    @Transactional(readOnly = true)
    public List<HeadingDTO> findByCriteria(HeadingCriteria criteria) {
        LOG.debug("find by criteria : {}", criteria);
        final Specification<Heading> specification = createSpecification(criteria);
        return headingMapper.toDto(headingRepository.findAll(specification));
    }

    /**
     * Return the number of matching entities in the database.
     * @param criteria The object which holds all the filters, which the entities should match.
     * @return the number of matching entities.
     */
    @Transactional(readOnly = true)
    public long countByCriteria(HeadingCriteria criteria) {
        LOG.debug("count by criteria : {}", criteria);
        final Specification<Heading> specification = createSpecification(criteria);
        return headingRepository.count(specification);
    }

    /**
     * Function to convert {@link HeadingCriteria} to a {@link Specification}
     * @param criteria The object which holds all the filters, which the entities should match.
     * @return the matching {@link Specification} of the entity.
     */
    protected Specification<Heading> createSpecification(HeadingCriteria criteria) {
        Specification<Heading> specification = Specification.where(null);
        if (criteria != null) {
            // This has to be called first, because the distinct method returns null
            if (criteria.getDistinct() != null) {
                specification = specification.and(distinct(criteria.getDistinct()));
            }
            if (criteria.getId() != null) {
                specification = specification.and(buildRangeSpecification(criteria.getId(), Heading_.id));
            }
            if (criteria.getName() != null) {
                specification = specification.and(buildStringSpecification(criteria.getName(), Heading_.name));
            }
            if (criteria.getProjectId() != null) {
                specification = specification.and(
                    buildSpecification(criteria.getProjectId(), root -> root.join(Heading_.project, JoinType.LEFT).get(Project_.id))
                );
            }
        }
        return specification;
    }
}
