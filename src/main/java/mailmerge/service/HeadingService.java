package mailmerge.service;

import java.util.Optional;
import mailmerge.domain.Heading;
import mailmerge.repository.HeadingRepository;
import mailmerge.service.dto.HeadingDTO;
import mailmerge.service.mapper.HeadingMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service Implementation for managing {@link mailmerge.domain.Heading}.
 */
@Service
@Transactional
public class HeadingService {

    private static final Logger LOG = LoggerFactory.getLogger(HeadingService.class);

    private final HeadingRepository headingRepository;

    private final HeadingMapper headingMapper;

    public HeadingService(HeadingRepository headingRepository, HeadingMapper headingMapper) {
        this.headingRepository = headingRepository;
        this.headingMapper = headingMapper;
    }

    /**
     * Save a heading.
     *
     * @param headingDTO the entity to save.
     * @return the persisted entity.
     */
    public HeadingDTO save(HeadingDTO headingDTO) {
        LOG.debug("Request to save Heading : {}", headingDTO);
        Heading heading = headingMapper.toEntity(headingDTO);
        heading = headingRepository.save(heading);
        return headingMapper.toDto(heading);
    }

    /**
     * Update a heading.
     *
     * @param headingDTO the entity to save.
     * @return the persisted entity.
     */
    public HeadingDTO update(HeadingDTO headingDTO) {
        LOG.debug("Request to update Heading : {}", headingDTO);
        Heading heading = headingMapper.toEntity(headingDTO);
        heading = headingRepository.save(heading);
        return headingMapper.toDto(heading);
    }

    /**
     * Partially update a heading.
     *
     * @param headingDTO the entity to update partially.
     * @return the persisted entity.
     */
    public Optional<HeadingDTO> partialUpdate(HeadingDTO headingDTO) {
        LOG.debug("Request to partially update Heading : {}", headingDTO);

        return headingRepository
            .findById(headingDTO.getId())
            .map(existingHeading -> {
                headingMapper.partialUpdate(existingHeading, headingDTO);

                return existingHeading;
            })
            .map(headingRepository::save)
            .map(headingMapper::toDto);
    }

    /**
     * Get one heading by id.
     *
     * @param id the id of the entity.
     * @return the entity.
     */
    @Transactional(readOnly = true)
    public Optional<HeadingDTO> findOne(Long id) {
        LOG.debug("Request to get Heading : {}", id);
        return headingRepository.findById(id).map(headingMapper::toDto);
    }

    /**
     * Delete the heading by id.
     *
     * @param id the id of the entity.
     */
    public void delete(Long id) {
        LOG.debug("Request to delete Heading : {}", id);
        headingRepository.deleteById(id);
    }
}
