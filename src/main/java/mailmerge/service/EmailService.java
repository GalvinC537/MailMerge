package mailmerge.service;

import java.util.Optional;
import mailmerge.domain.Email;
import mailmerge.repository.EmailRepository;
import mailmerge.service.dto.EmailDTO;
import mailmerge.service.mapper.EmailMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service Implementation for managing {@link mailmerge.domain.Email}.
 */
@Service
@Transactional
public class EmailService {

    private static final Logger LOG = LoggerFactory.getLogger(EmailService.class);

    private final EmailRepository emailRepository;

    private final EmailMapper emailMapper;

    public EmailService(EmailRepository emailRepository, EmailMapper emailMapper) {
        this.emailRepository = emailRepository;
        this.emailMapper = emailMapper;
    }

    /**
     * Save a email.
     *
     * @param emailDTO the entity to save.
     * @return the persisted entity.
     */
    public EmailDTO save(EmailDTO emailDTO) {
        LOG.debug("Request to save Email : {}", emailDTO);
        Email email = emailMapper.toEntity(emailDTO);
        email = emailRepository.save(email);
        return emailMapper.toDto(email);
    }

    /**
     * Update a email.
     *
     * @param emailDTO the entity to save.
     * @return the persisted entity.
     */
    public EmailDTO update(EmailDTO emailDTO) {
        LOG.debug("Request to update Email : {}", emailDTO);
        Email email = emailMapper.toEntity(emailDTO);
        email = emailRepository.save(email);
        return emailMapper.toDto(email);
    }

    /**
     * Partially update a email.
     *
     * @param emailDTO the entity to update partially.
     * @return the persisted entity.
     */
    public Optional<EmailDTO> partialUpdate(EmailDTO emailDTO) {
        LOG.debug("Request to partially update Email : {}", emailDTO);

        return emailRepository
            .findById(emailDTO.getId())
            .map(existingEmail -> {
                emailMapper.partialUpdate(existingEmail, emailDTO);

                return existingEmail;
            })
            .map(emailRepository::save)
            .map(emailMapper::toDto);
    }

    /**
     * Get one email by id.
     *
     * @param id the id of the entity.
     * @return the entity.
     */
    @Transactional(readOnly = true)
    public Optional<EmailDTO> findOne(Long id) {
        LOG.debug("Request to get Email : {}", id);
        return emailRepository.findById(id).map(emailMapper::toDto);
    }

    /**
     * Delete the email by id.
     *
     * @param id the id of the entity.
     */
    public void delete(Long id) {
        LOG.debug("Request to delete Email : {}", id);
        emailRepository.deleteById(id);
    }
}
