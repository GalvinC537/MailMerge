package mailmerge.web.rest;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import mailmerge.repository.HeadingRepository;
import mailmerge.service.HeadingQueryService;
import mailmerge.service.HeadingService;
import mailmerge.service.criteria.HeadingCriteria;
import mailmerge.service.dto.HeadingDTO;
import mailmerge.web.rest.errors.BadRequestAlertException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import tech.jhipster.web.util.HeaderUtil;
import tech.jhipster.web.util.ResponseUtil;

/**
 * REST controller for managing {@link mailmerge.domain.Heading}.
 */
@RestController
@RequestMapping("/api/headings")
public class HeadingResource {

    private static final Logger LOG = LoggerFactory.getLogger(HeadingResource.class);

    private static final String ENTITY_NAME = "heading";

    @Value("${jhipster.clientApp.name}")
    private String applicationName;

    private final HeadingService headingService;

    private final HeadingRepository headingRepository;

    private final HeadingQueryService headingQueryService;

    public HeadingResource(HeadingService headingService, HeadingRepository headingRepository, HeadingQueryService headingQueryService) {
        this.headingService = headingService;
        this.headingRepository = headingRepository;
        this.headingQueryService = headingQueryService;
    }

    /**
     * {@code POST  /headings} : Create a new heading.
     *
     * @param headingDTO the headingDTO to create.
     * @return the {@link ResponseEntity} with status {@code 201 (Created)} and with body the new headingDTO, or with status {@code 400 (Bad Request)} if the heading has already an ID.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PostMapping("")
    public ResponseEntity<HeadingDTO> createHeading(@Valid @RequestBody HeadingDTO headingDTO) throws URISyntaxException {
        LOG.debug("REST request to save Heading : {}", headingDTO);
        if (headingDTO.getId() != null) {
            throw new BadRequestAlertException("A new heading cannot already have an ID", ENTITY_NAME, "idexists");
        }
        headingDTO = headingService.save(headingDTO);
        return ResponseEntity.created(new URI("/api/headings/" + headingDTO.getId()))
            .headers(HeaderUtil.createEntityCreationAlert(applicationName, false, ENTITY_NAME, headingDTO.getId().toString()))
            .body(headingDTO);
    }

    /**
     * {@code PUT  /headings/:id} : Updates an existing heading.
     *
     * @param id the id of the headingDTO to save.
     * @param headingDTO the headingDTO to update.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the updated headingDTO,
     * or with status {@code 400 (Bad Request)} if the headingDTO is not valid,
     * or with status {@code 500 (Internal Server Error)} if the headingDTO couldn't be updated.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PutMapping("/{id}")
    public ResponseEntity<HeadingDTO> updateHeading(
        @PathVariable(value = "id", required = false) final Long id,
        @Valid @RequestBody HeadingDTO headingDTO
    ) throws URISyntaxException {
        LOG.debug("REST request to update Heading : {}, {}", id, headingDTO);
        if (headingDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        if (!Objects.equals(id, headingDTO.getId())) {
            throw new BadRequestAlertException("Invalid ID", ENTITY_NAME, "idinvalid");
        }

        if (!headingRepository.existsById(id)) {
            throw new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound");
        }

        headingDTO = headingService.update(headingDTO);
        return ResponseEntity.ok()
            .headers(HeaderUtil.createEntityUpdateAlert(applicationName, false, ENTITY_NAME, headingDTO.getId().toString()))
            .body(headingDTO);
    }

    /**
     * {@code PATCH  /headings/:id} : Partial updates given fields of an existing heading, field will ignore if it is null
     *
     * @param id the id of the headingDTO to save.
     * @param headingDTO the headingDTO to update.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the updated headingDTO,
     * or with status {@code 400 (Bad Request)} if the headingDTO is not valid,
     * or with status {@code 404 (Not Found)} if the headingDTO is not found,
     * or with status {@code 500 (Internal Server Error)} if the headingDTO couldn't be updated.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PatchMapping(value = "/{id}", consumes = { "application/json", "application/merge-patch+json" })
    public ResponseEntity<HeadingDTO> partialUpdateHeading(
        @PathVariable(value = "id", required = false) final Long id,
        @NotNull @RequestBody HeadingDTO headingDTO
    ) throws URISyntaxException {
        LOG.debug("REST request to partial update Heading partially : {}, {}", id, headingDTO);
        if (headingDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        if (!Objects.equals(id, headingDTO.getId())) {
            throw new BadRequestAlertException("Invalid ID", ENTITY_NAME, "idinvalid");
        }

        if (!headingRepository.existsById(id)) {
            throw new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound");
        }

        Optional<HeadingDTO> result = headingService.partialUpdate(headingDTO);

        return ResponseUtil.wrapOrNotFound(
            result,
            HeaderUtil.createEntityUpdateAlert(applicationName, false, ENTITY_NAME, headingDTO.getId().toString())
        );
    }

    /**
     * {@code GET  /headings} : get all the headings.
     *
     * @param criteria the criteria which the requested entities should match.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and the list of headings in body.
     */
    @GetMapping("")
    public ResponseEntity<List<HeadingDTO>> getAllHeadings(HeadingCriteria criteria) {
        LOG.debug("REST request to get Headings by criteria: {}", criteria);

        List<HeadingDTO> entityList = headingQueryService.findByCriteria(criteria);
        return ResponseEntity.ok().body(entityList);
    }

    /**
     * {@code GET  /headings/count} : count all the headings.
     *
     * @param criteria the criteria which the requested entities should match.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and the count in body.
     */
    @GetMapping("/count")
    public ResponseEntity<Long> countHeadings(HeadingCriteria criteria) {
        LOG.debug("REST request to count Headings by criteria: {}", criteria);
        return ResponseEntity.ok().body(headingQueryService.countByCriteria(criteria));
    }

    /**
     * {@code GET  /headings/:id} : get the "id" heading.
     *
     * @param id the id of the headingDTO to retrieve.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the headingDTO, or with status {@code 404 (Not Found)}.
     */
    @GetMapping("/{id}")
    public ResponseEntity<HeadingDTO> getHeading(@PathVariable("id") Long id) {
        LOG.debug("REST request to get Heading : {}", id);
        Optional<HeadingDTO> headingDTO = headingService.findOne(id);
        return ResponseUtil.wrapOrNotFound(headingDTO);
    }

    /**
     * {@code DELETE  /headings/:id} : delete the "id" heading.
     *
     * @param id the id of the headingDTO to delete.
     * @return the {@link ResponseEntity} with status {@code 204 (NO_CONTENT)}.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteHeading(@PathVariable("id") Long id) {
        LOG.debug("REST request to delete Heading : {}", id);
        headingService.delete(id);
        return ResponseEntity.noContent()
            .headers(HeaderUtil.createEntityDeletionAlert(applicationName, false, ENTITY_NAME, id.toString()))
            .build();
    }
}
