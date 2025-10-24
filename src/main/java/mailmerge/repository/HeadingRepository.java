package mailmerge.repository;

import mailmerge.domain.Heading;
import org.springframework.data.jpa.repository.*;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for the Heading entity.
 */
@SuppressWarnings("unused")
@Repository
public interface HeadingRepository extends JpaRepository<Heading, Long>, JpaSpecificationExecutor<Heading> {}
