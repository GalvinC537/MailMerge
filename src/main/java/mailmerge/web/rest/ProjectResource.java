// This is the backend controller. Its purpose is to define the REST endpoints
// project.service.ts makes HTTP requests to REST endpoints so has to call one of these functions to do so


package mailmerge.web.rest;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import mailmerge.repository.ProjectRepository;
import mailmerge.service.ProjectQueryService;
import mailmerge.service.ProjectService;
import mailmerge.service.criteria.ProjectCriteria;
import mailmerge.service.dto.ProjectDTO;
import mailmerge.web.rest.errors.BadRequestAlertException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tech.jhipster.web.util.HeaderUtil;
import tech.jhipster.web.util.PaginationUtil;
import tech.jhipster.web.util.ResponseUtil;
import mailmerge.repository.UserRepository;
import mailmerge.domain.User;
import mailmerge.security.SecurityUtils;
import mailmerge.service.dto.UserDTO;


/**
 * REST controller for managing {@link mailmerge.domain.Project}.
 */
@RestController
@RequestMapping("/api/projects")
public class ProjectResource {

    private static final Logger LOG = LoggerFactory.getLogger(ProjectResource.class);

    private static final String ENTITY_NAME = "project";

    @Value("${jhipster.clientApp.name}")
    private String applicationName;

    private final ProjectService projectService;

    private final ProjectRepository projectRepository;

    private final ProjectQueryService projectQueryService;

    private final UserRepository userRepository;

    public ProjectResource(ProjectService projectService, ProjectRepository projectRepository, ProjectQueryService projectQueryService, UserRepository userRepository) {
        this.projectService = projectService;
        this.projectRepository = projectRepository;
        this.projectQueryService = projectQueryService;
        this.userRepository = userRepository;
    }

    /**
     * {@code POST  /projects} : Create a new project.
     *
     * @param projectDTO the projectDTO to create.
     * @return the {@link ResponseEntity} with status {@code 201 (Created)} and with body the new projectDTO, or with status {@code 400 (Bad Request)} if the project has already an ID.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    /**
     * {@code POST  /projects} : Create a new project and automatically link it to the logged-in user.
     */
    @PostMapping("")
    public ResponseEntity<ProjectDTO> createProject(@Valid @RequestBody ProjectDTO projectDTO) throws URISyntaxException {
        LOG.debug("REST request to save Project : {}", projectDTO);

        if (projectDTO.getId() != null) {
            throw new BadRequestAlertException("A new project cannot already have an ID", ENTITY_NAME, "idexists");
        }

        final ProjectDTO dto = projectDTO;

        String currentUserLogin = SecurityUtils.getCurrentUserLogin().orElse(null);
        if (currentUserLogin != null) {
            userRepository.findOneByLogin(currentUserLogin)
                .ifPresent(user -> dto.setUser(new UserDTO(user)));
        }


        //Save the project
        projectDTO = projectService.save(projectDTO);

        return ResponseEntity.created(new URI("/api/projects/" + projectDTO.getId()))
            .headers(HeaderUtil.createEntityCreationAlert(applicationName, false, ENTITY_NAME, projectDTO.getId().toString()))
            .body(projectDTO);
    }

    /**
     * {@code PUT  /projects/:id} : Updates an existing project.
     *
     * @param id the id of the projectDTO to save.
     * @param projectDTO the projectDTO to update.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the updated projectDTO,
     * or with status {@code 400 (Bad Request)} if the projectDTO is not valid,
     * or with status {@code 500 (Internal Server Error)} if the projectDTO couldn't be updated.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PutMapping("/{id}")
    public ResponseEntity<ProjectDTO> updateProject(
        @PathVariable(value = "id", required = false) final Long id,
        @Valid @RequestBody ProjectDTO projectDTO
    ) throws URISyntaxException {
        LOG.debug("REST request to update Project : {}, {}", id, projectDTO);
        if (projectDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        if (!Objects.equals(id, projectDTO.getId())) {
            throw new BadRequestAlertException("Invalid ID", ENTITY_NAME, "idinvalid");
        }

        if (!projectRepository.existsById(id)) {
            throw new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound");
        }

        projectDTO = projectService.update(projectDTO);
        return ResponseEntity.ok()
            .headers(HeaderUtil.createEntityUpdateAlert(applicationName, false, ENTITY_NAME, projectDTO.getId().toString()))
            .body(projectDTO);
    }

    /**
     * {@code PATCH  /projects/:id} : Partial updates given fields of an existing project, field will ignore if it is null
     *
     * @param id the id of the projectDTO to save.
     * @param projectDTO the projectDTO to update.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the updated projectDTO,
     * or with status {@code 400 (Bad Request)} if the projectDTO is not valid,
     * or with status {@code 404 (Not Found)} if the projectDTO is not found,
     * or with status {@code 500 (Internal Server Error)} if the projectDTO couldn't be updated.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PatchMapping(value = "/{id}", consumes = { "application/json", "application/merge-patch+json" })
    public ResponseEntity<ProjectDTO> partialUpdateProject(
        @PathVariable(value = "id", required = false) final Long id,
        @NotNull @RequestBody ProjectDTO projectDTO
    ) throws URISyntaxException {
        LOG.debug("REST request to partial update Project partially : {}, {}", id, projectDTO);
        if (projectDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        if (!Objects.equals(id, projectDTO.getId())) {
            throw new BadRequestAlertException("Invalid ID", ENTITY_NAME, "idinvalid");
        }

        if (!projectRepository.existsById(id)) {
            throw new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound");
        }

        Optional<ProjectDTO> result = projectService.partialUpdate(projectDTO);

        return ResponseUtil.wrapOrNotFound(
            result,
            HeaderUtil.createEntityUpdateAlert(applicationName, false, ENTITY_NAME, projectDTO.getId().toString())
        );
    }

    /**
     * {@code PATCH  /projects/:id/status} : Updates only the status (and optional sentAt timestamp) of a project.
     *
     * @param id the id of the project to update.
     * @param status the new status (PENDING, SENT, FAILED)
     * @param sentAt optional ISO timestamp for when it was sent
     * @return the updated ProjectDTO
     */
    @PatchMapping("/{id}/status")
    public ResponseEntity<ProjectDTO> updateProjectStatus(
        @PathVariable Long id,
        @RequestParam("status") String status,
        @RequestParam(value = "sentAt", required = false) String sentAt
    ) {
        LOG.debug("REST request to update project {} to status {}", id, status);

        ProjectDTO project = projectService.findOne(id)
            .orElseThrow(() -> new BadRequestAlertException("Project not found", ENTITY_NAME, "idnotfound"));


        // Update status safely
        project.setStatus(Enum.valueOf(mailmerge.domain.enumeration.EmailStatus.class, status.toUpperCase()));

        // If SENT, add timestamp
        if ("SENT".equalsIgnoreCase(status) && sentAt != null) {
            project.setSentAt(java.time.Instant.parse(sentAt));
        }

        ProjectDTO result = projectService.update(project);
        return ResponseEntity.ok(result);
    }


    /**
     * {@code GET  /projects} : get all the projects.
     *
     * @param pageable the pagination information.
     * @param criteria the criteria which the requested entities should match.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and the list of projects in body.
     */
    @GetMapping("")
    public ResponseEntity<List<ProjectDTO>> getAllProjects(
        ProjectCriteria criteria,
        @org.springdoc.core.annotations.ParameterObject Pageable pageable
    ) {
        LOG.debug("REST request to get Projects by criteria: {}", criteria);

        Page<ProjectDTO> page = projectQueryService.findByCriteria(criteria, pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    /**
     * {@code GET  /projects/count} : count all the projects.
     *
     * @param criteria the criteria which the requested entities should match.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and the count in body.
     */
    @GetMapping("/count")
    public ResponseEntity<Long> countProjects(ProjectCriteria criteria) {
        LOG.debug("REST request to count Projects by criteria: {}", criteria);
        return ResponseEntity.ok().body(projectQueryService.countByCriteria(criteria));
    }

    /**
     * {@code GET  /projects/:id} : get the "id" project.
     *
     * @param id the id of the projectDTO to retrieve.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the projectDTO, or with status {@code 404 (Not Found)}.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ProjectDTO> getProject(@PathVariable("id") Long id) {
        LOG.debug("REST request to get Project : {}", id);

        String currentUserLogin = SecurityUtils.getCurrentUserLogin().orElseThrow();

        ProjectDTO projectDTO = projectService.findOne(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));

        if (projectDTO.getUser() == null || !currentUserLogin.equals(projectDTO.getUser().getLogin())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        return ResponseEntity.ok(projectDTO);
    }

    /**
     * {@code DELETE  /projects/:id} : delete the "id" project.
     *
     * @param id the id of the projectDTO to delete.
     * @return the {@link ResponseEntity} with status {@code 204 (NO_CONTENT)}.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteProject(@PathVariable("id") Long id) {
        LOG.debug("REST request to delete Project : {}", id);
        projectService.delete(id);
        return ResponseEntity.noContent()
            .headers(HeaderUtil.createEntityDeletionAlert(applicationName, false, ENTITY_NAME, id.toString()))
            .build();
    }

    @GetMapping("/my")
    public ResponseEntity<List<ProjectDTO>> getMyProjects() {
        LOG.debug("REST request to get projects for current user");

        // Get the username of the currently logged-in user
        String username = mailmerge.security.SecurityUtils.getCurrentUserLogin().orElse(null);
        if (username == null) {
            return ResponseEntity.status(401).build(); // Not logged in
        }

        // Use the ProjectService to fetch projects for that user
        List<ProjectDTO> projects = projectService.findByUserLogin(username);

        return ResponseEntity.ok(projects);
    }


}
