package mailmerge.web.rest;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import mailmerge.repository.AttachmentRepository;
import mailmerge.service.AttachmentQueryService;
import mailmerge.service.AttachmentService;
import mailmerge.service.criteria.AttachmentCriteria;
import mailmerge.service.dto.AttachmentDTO;
import mailmerge.web.rest.errors.BadRequestAlertException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import tech.jhipster.web.util.HeaderUtil;
import tech.jhipster.web.util.ResponseUtil;

/**
 * REST controller for managing {@link mailmerge.domain.Attachment}.
 */
@RestController
@RequestMapping("/api/attachments")
public class AttachmentResource {

    private static final Logger LOG = LoggerFactory.getLogger(AttachmentResource.class);

    private static final String ENTITY_NAME = "attachment";

    @Value("${jhipster.clientApp.name}")
    private String applicationName;

    private final AttachmentService attachmentService;

    private final AttachmentRepository attachmentRepository;

    private final AttachmentQueryService attachmentQueryService;

    public AttachmentResource(
        AttachmentService attachmentService,
        AttachmentRepository attachmentRepository,
        AttachmentQueryService attachmentQueryService
    ) {
        this.attachmentService = attachmentService;
        this.attachmentRepository = attachmentRepository;
        this.attachmentQueryService = attachmentQueryService;
    }

    /**
     * {@code POST  /attachments} : Create a new attachment.
     *
     * @param attachmentDTO the attachmentDTO to create.
     * @return the {@link ResponseEntity} with status {@code 201 (Created)} and with body the new attachmentDTO, or with status {@code 400 (Bad Request)} if the attachment has already an ID.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PostMapping("")
    public ResponseEntity<AttachmentDTO> createAttachment(@Valid @RequestBody AttachmentDTO attachmentDTO) throws URISyntaxException {
        LOG.debug("REST request to save Attachment : {}", attachmentDTO);
        if (attachmentDTO.getId() != null) {
            throw new BadRequestAlertException("A new attachment cannot already have an ID", ENTITY_NAME, "idexists");
        }
        attachmentDTO = attachmentService.save(attachmentDTO);
        return ResponseEntity.created(new URI("/api/attachments/" + attachmentDTO.getId()))
            .headers(HeaderUtil.createEntityCreationAlert(applicationName, false, ENTITY_NAME, attachmentDTO.getId().toString()))
            .body(attachmentDTO);
    }

    /**
     * {@code PUT  /attachments/:id} : Updates an existing attachment.
     *
     * @param id the id of the attachmentDTO to save.
     * @param attachmentDTO the attachmentDTO to update.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the updated attachmentDTO,
     * or with status {@code 400 (Bad Request)} if the attachmentDTO is not valid,
     * or with status {@code 500 (Internal Server Error)} if the attachmentDTO couldn't be updated.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PutMapping("/{id}")
    public ResponseEntity<AttachmentDTO> updateAttachment(
        @PathVariable(value = "id", required = false) final Long id,
        @Valid @RequestBody AttachmentDTO attachmentDTO
    ) throws URISyntaxException {
        LOG.debug("REST request to update Attachment : {}, {}", id, attachmentDTO);
        if (attachmentDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        if (!Objects.equals(id, attachmentDTO.getId())) {
            throw new BadRequestAlertException("Invalid ID", ENTITY_NAME, "idinvalid");
        }

        if (!attachmentRepository.existsById(id)) {
            throw new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound");
        }

        attachmentDTO = attachmentService.update(attachmentDTO);
        return ResponseEntity.ok()
            .headers(HeaderUtil.createEntityUpdateAlert(applicationName, false, ENTITY_NAME, attachmentDTO.getId().toString()))
            .body(attachmentDTO);
    }

    /**
     * {@code PATCH  /attachments/:id} : Partial updates given fields of an existing attachment, field will ignore if it is null
     *
     * @param id the id of the attachmentDTO to save.
     * @param attachmentDTO the attachmentDTO to update.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the updated attachmentDTO,
     * or with status {@code 400 (Bad Request)} if the attachmentDTO is not valid,
     * or with status {@code 404 (Not Found)} if the attachmentDTO is not found,
     * or with status {@code 500 (Internal Server Error)} if the attachmentDTO couldn't be updated.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PatchMapping(value = "/{id}", consumes = { "application/json", "application/merge-patch+json" })
    public ResponseEntity<AttachmentDTO> partialUpdateAttachment(
        @PathVariable(value = "id", required = false) final Long id,
        @NotNull @RequestBody AttachmentDTO attachmentDTO
    ) throws URISyntaxException {
        LOG.debug("REST request to partial update Attachment partially : {}, {}", id, attachmentDTO);
        if (attachmentDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        if (!Objects.equals(id, attachmentDTO.getId())) {
            throw new BadRequestAlertException("Invalid ID", ENTITY_NAME, "idinvalid");
        }

        if (!attachmentRepository.existsById(id)) {
            throw new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound");
        }

        Optional<AttachmentDTO> result = attachmentService.partialUpdate(attachmentDTO);

        return ResponseUtil.wrapOrNotFound(
            result,
            HeaderUtil.createEntityUpdateAlert(applicationName, false, ENTITY_NAME, attachmentDTO.getId().toString())
        );
    }

    /**
     * {@code GET  /attachments} : get all the attachments.
     *
     * @param criteria the criteria which the requested entities should match.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and the list of attachments in body.
     */
    @GetMapping("")
    public ResponseEntity<List<AttachmentDTO>> getAllAttachments(AttachmentCriteria criteria) {
        LOG.debug("REST request to get Attachments by criteria: {}", criteria);

        List<AttachmentDTO> entityList = attachmentQueryService.findByCriteria(criteria);
        return ResponseEntity.ok().body(entityList);
    }

    /**
     * {@code GET  /attachments/count} : count all the attachments.
     *
     * @param criteria the criteria which the requested entities should match.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and the count in body.
     */
    @GetMapping("/count")
    public ResponseEntity<Long> countAttachments(AttachmentCriteria criteria) {
        LOG.debug("REST request to count Attachments by criteria: {}", criteria);
        return ResponseEntity.ok().body(attachmentQueryService.countByCriteria(criteria));
    }

    /**
     * {@code GET  /attachments/:id} : get the "id" attachment.
     *
     * @param id the id of the attachmentDTO to retrieve.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the attachmentDTO, or with status {@code 404 (Not Found)}.
     */
    @GetMapping("/{id}")
    public ResponseEntity<AttachmentDTO> getAttachment(@PathVariable("id") Long id) {
        LOG.debug("REST request to get Attachment : {}", id);
        Optional<AttachmentDTO> attachmentDTO = attachmentService.findOne(id);
        return ResponseUtil.wrapOrNotFound(attachmentDTO);
    }

    /**
     * {@code DELETE  /attachments/:id} : delete the "id" attachment.
     *
     * @param id the id of the attachmentDTO to delete.
     * @return the {@link ResponseEntity} with status {@code 204 (NO_CONTENT)}.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteAttachment(@PathVariable("id") Long id) {
        LOG.debug("REST request to delete Attachment : {}", id);
        attachmentService.delete(id);
        return ResponseEntity.noContent()
            .headers(HeaderUtil.createEntityDeletionAlert(applicationName, false, ENTITY_NAME, id.toString()))
            .build();
    }

    /**
     * {@code POST  /attachments/project/{projectId}} : Save one or more attachments for a given project.
     *
     * @param projectId the project ID.
     * @param attachments list of attachments to save.
     * @return the list of saved attachments.
     */
    @PostMapping("/project/{projectId}")
    public ResponseEntity<List<AttachmentDTO>> uploadAttachmentsForProject(
        @PathVariable Long projectId,
        @Valid @RequestBody List<AttachmentDTO> attachments
    ) {
        LOG.debug("REST request to upload {} attachments for project {}", attachments.size(), projectId);

        // Make sure project exists
        if (attachments == null || attachments.isEmpty()) {
            throw new BadRequestAlertException("No attachments provided", ENTITY_NAME, "emptyattachments");
        }

        List<AttachmentDTO> savedAttachments = attachments.stream()
            .peek(a -> {
                // Force link to project
                mailmerge.service.dto.ProjectDTO project = new mailmerge.service.dto.ProjectDTO();
                project.setId(projectId);
                a.setProject(project);
            })
            .map(attachmentService::save)
            .toList();

        return ResponseEntity.ok(savedAttachments);
    }

    @GetMapping("/project/{projectId}")
    public ResponseEntity<List<AttachmentDTO>> getAttachmentsByProject(@PathVariable Long projectId) {
        LOG.debug("REST request to get attachments for project {}", projectId);
        List<AttachmentDTO> list = attachmentRepository.findByProjectId(projectId)
            .stream()
            .map(attachmentService::convertToDto)
            .toList();
        return ResponseEntity.ok(list);
    }
}
