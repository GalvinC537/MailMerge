package mailmerge.web.rest;

import static mailmerge.domain.ProjectAsserts.*;
import static mailmerge.web.rest.TestUtil.createUpdateProxyForBean;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Random;
import java.util.concurrent.atomic.AtomicLong;
import mailmerge.IntegrationTest;
import mailmerge.domain.Project;
import mailmerge.domain.User;
import mailmerge.domain.enumeration.EmailStatus;
import mailmerge.repository.ProjectRepository;
import mailmerge.repository.UserRepository;
import mailmerge.service.ProjectService;
import mailmerge.service.dto.ProjectDTO;
import mailmerge.service.mapper.ProjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for the {@link ProjectResource} REST controller.
 */
@IntegrationTest
@ExtendWith(MockitoExtension.class)
@AutoConfigureMockMvc
@WithMockUser
class ProjectResourceIT {

    private static final String DEFAULT_NAME = "AAAAAAAAAA";
    private static final String UPDATED_NAME = "BBBBBBBBBB";

    private static final byte[] DEFAULT_SPREADSHEET_LINK = TestUtil.createByteArray(1, "0");
    private static final byte[] UPDATED_SPREADSHEET_LINK = TestUtil.createByteArray(1, "1");
    private static final String DEFAULT_SPREADSHEET_LINK_CONTENT_TYPE = "image/png";
    private static final String UPDATED_SPREADSHEET_LINK_CONTENT_TYPE = "image/jpg";

    private static final String DEFAULT_SPREADSHEET_FILE_CONTENT_TYPE = "AAAAAAAAAA";
    private static final String UPDATED_SPREADSHEET_FILE_CONTENT_TYPE = "BBBBBBBBBB";

    private static final String DEFAULT_TO_FIELD = "AAAAAAAAAA";
    private static final String UPDATED_TO_FIELD = "BBBBBBBBBB";

    private static final String DEFAULT_CC_FIELD = "AAAAAAAAAA";
    private static final String UPDATED_CC_FIELD = "BBBBBBBBBB";

    private static final String DEFAULT_BCC_FIELD = "AAAAAAAAAA";
    private static final String UPDATED_BCC_FIELD = "BBBBBBBBBB";

    private static final String DEFAULT_HEADER = "AAAAAAAAAA";
    private static final String UPDATED_HEADER = "BBBBBBBBBB";

    private static final String DEFAULT_CONTENT = "AAAAAAAAAA";
    private static final String UPDATED_CONTENT = "BBBBBBBBBB";

    private static final EmailStatus DEFAULT_STATUS = EmailStatus.PENDING;
    private static final EmailStatus UPDATED_STATUS = EmailStatus.SENT;

    private static final Instant DEFAULT_SENT_AT = Instant.ofEpochMilli(0L);
    private static final Instant UPDATED_SENT_AT = Instant.now().truncatedTo(ChronoUnit.MILLIS);

    private static final String ENTITY_API_URL = "/api/projects";
    private static final String ENTITY_API_URL_ID = ENTITY_API_URL + "/{id}";

    private static Random random = new Random();
    private static AtomicLong longCount = new AtomicLong(random.nextInt() + (2 * Integer.MAX_VALUE));

    @Autowired
    private ObjectMapper om;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private UserRepository userRepository;

    @Mock
    private ProjectRepository projectRepositoryMock;

    @Autowired
    private ProjectMapper projectMapper;

    @Mock
    private ProjectService projectServiceMock;

    @Autowired
    private EntityManager em;

    @Autowired
    private MockMvc restProjectMockMvc;

    private Project project;

    private Project insertedProject;

    /**
     * Create an entity for this test.
     *
     * This is a static method, as tests for other entities might also need it,
     * if they test an entity which requires the current entity.
     */
    public static Project createEntity() {
        return new Project()
            .name(DEFAULT_NAME)
            .spreadsheetLink(DEFAULT_SPREADSHEET_LINK)
            .spreadsheetLinkContentType(DEFAULT_SPREADSHEET_LINK_CONTENT_TYPE)
            .spreadsheetFileContentType(DEFAULT_SPREADSHEET_FILE_CONTENT_TYPE)
            .toField(DEFAULT_TO_FIELD)
            .ccField(DEFAULT_CC_FIELD)
            .bccField(DEFAULT_BCC_FIELD)
            .header(DEFAULT_HEADER)
            .content(DEFAULT_CONTENT)
            .status(DEFAULT_STATUS)
            .sentAt(DEFAULT_SENT_AT);
    }

    /**
     * Create an updated entity for this test.
     *
     * This is a static method, as tests for other entities might also need it,
     * if they test an entity which requires the current entity.
     */
    public static Project createUpdatedEntity() {
        return new Project()
            .name(UPDATED_NAME)
            .spreadsheetLink(UPDATED_SPREADSHEET_LINK)
            .spreadsheetLinkContentType(UPDATED_SPREADSHEET_LINK_CONTENT_TYPE)
            .spreadsheetFileContentType(UPDATED_SPREADSHEET_FILE_CONTENT_TYPE)
            .toField(UPDATED_TO_FIELD)
            .ccField(UPDATED_CC_FIELD)
            .bccField(UPDATED_BCC_FIELD)
            .header(UPDATED_HEADER)
            .content(UPDATED_CONTENT)
            .status(UPDATED_STATUS)
            .sentAt(UPDATED_SENT_AT);
    }

    @BeforeEach
    public void initTest() {
        project = createEntity();
    }

    @AfterEach
    public void cleanup() {
        if (insertedProject != null) {
            projectRepository.delete(insertedProject);
            insertedProject = null;
        }
        userRepository.deleteAll();
    }

    @Test
    @Transactional
    void createProject() throws Exception {
        long databaseSizeBeforeCreate = getRepositoryCount();
        // Create the Project
        ProjectDTO projectDTO = projectMapper.toDto(project);
        var returnedProjectDTO = om.readValue(
            restProjectMockMvc
                .perform(
                    post(ENTITY_API_URL).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(projectDTO))
                )
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString(),
            ProjectDTO.class
        );

        // Validate the Project in the database
        assertIncrementedRepositoryCount(databaseSizeBeforeCreate);
        var returnedProject = projectMapper.toEntity(returnedProjectDTO);
        assertProjectUpdatableFieldsEquals(returnedProject, getPersistedProject(returnedProject));

        insertedProject = returnedProject;
    }

    @Test
    @Transactional
    void createProjectWithExistingId() throws Exception {
        // Create the Project with an existing ID
        project.setId(1L);
        ProjectDTO projectDTO = projectMapper.toDto(project);

        long databaseSizeBeforeCreate = getRepositoryCount();

        // An entity with an existing ID cannot be created, so this API call must fail
        restProjectMockMvc
            .perform(post(ENTITY_API_URL).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(projectDTO)))
            .andExpect(status().isBadRequest());

        // Validate the Project in the database
        assertSameRepositoryCount(databaseSizeBeforeCreate);
    }

    @Test
    @Transactional
    void checkNameIsRequired() throws Exception {
        long databaseSizeBeforeTest = getRepositoryCount();
        // set the field null
        project.setName(null);

        // Create the Project, which fails.
        ProjectDTO projectDTO = projectMapper.toDto(project);

        restProjectMockMvc
            .perform(post(ENTITY_API_URL).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(projectDTO)))
            .andExpect(status().isBadRequest());

        assertSameRepositoryCount(databaseSizeBeforeTest);
    }

    @Test
    @Transactional
    void getAllProjects() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        // Get all the projectList
        restProjectMockMvc
            .perform(get(ENTITY_API_URL + "?sort=id,desc"))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.[*].id").value(hasItem(project.getId().intValue())))
            .andExpect(jsonPath("$.[*].name").value(hasItem(DEFAULT_NAME)))
            .andExpect(jsonPath("$.[*].spreadsheetLinkContentType").value(hasItem(DEFAULT_SPREADSHEET_LINK_CONTENT_TYPE)))
            .andExpect(jsonPath("$.[*].spreadsheetLink").value(hasItem(Base64.getEncoder().encodeToString(DEFAULT_SPREADSHEET_LINK))))
            .andExpect(jsonPath("$.[*].spreadsheetFileContentType").value(hasItem(DEFAULT_SPREADSHEET_FILE_CONTENT_TYPE)))
            .andExpect(jsonPath("$.[*].toField").value(hasItem(DEFAULT_TO_FIELD.toString())))
            .andExpect(jsonPath("$.[*].ccField").value(hasItem(DEFAULT_CC_FIELD.toString())))
            .andExpect(jsonPath("$.[*].bccField").value(hasItem(DEFAULT_BCC_FIELD.toString())))
            .andExpect(jsonPath("$.[*].header").value(hasItem(DEFAULT_HEADER.toString())))
            .andExpect(jsonPath("$.[*].content").value(hasItem(DEFAULT_CONTENT.toString())))
            .andExpect(jsonPath("$.[*].status").value(hasItem(DEFAULT_STATUS.toString())))
            .andExpect(jsonPath("$.[*].sentAt").value(hasItem(DEFAULT_SENT_AT.toString())));
    }

    @SuppressWarnings({ "unchecked" })
    void getAllProjectsWithEagerRelationshipsIsEnabled() throws Exception {
        when(projectServiceMock.findAllWithEagerRelationships(any())).thenReturn(new PageImpl(new ArrayList<>()));

        restProjectMockMvc.perform(get(ENTITY_API_URL + "?eagerload=true")).andExpect(status().isOk());

        verify(projectServiceMock, times(1)).findAllWithEagerRelationships(any());
    }

    @SuppressWarnings({ "unchecked" })
    void getAllProjectsWithEagerRelationshipsIsNotEnabled() throws Exception {
        when(projectServiceMock.findAllWithEagerRelationships(any())).thenReturn(new PageImpl(new ArrayList<>()));

        restProjectMockMvc.perform(get(ENTITY_API_URL + "?eagerload=false")).andExpect(status().isOk());
        verify(projectRepositoryMock, times(1)).findAll(any(Pageable.class));
    }

    @Test
    @Transactional
    @WithMockUser(username = "user") // simulate logged-in user
    void getProject() throws Exception {
        // Ensure the test user exists in the database
        User currentUser = userRepository.findOneByLogin("user").orElseGet(() -> {
            User newUser = new User();
            newUser.setId(String.valueOf(1L)); // manually set ID to avoid null PK
            newUser.setLogin("user");
            newUser.setActivated(true);
            return userRepository.saveAndFlush(newUser);
        });

        // Assign project to the logged-in user
        project.setUser(currentUser);
        insertedProject = projectRepository.saveAndFlush(project);

        // Get the project (should succeed with 200 OK)
        restProjectMockMvc
            .perform(get(ENTITY_API_URL_ID, project.getId()))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.id").value(project.getId().intValue()))
            .andExpect(jsonPath("$.name").value(DEFAULT_NAME))
            .andExpect(jsonPath("$.spreadsheetLinkContentType").value(DEFAULT_SPREADSHEET_LINK_CONTENT_TYPE))
            .andExpect(jsonPath("$.spreadsheetLink").value(Base64.getEncoder().encodeToString(DEFAULT_SPREADSHEET_LINK)))
            .andExpect(jsonPath("$.spreadsheetFileContentType").value(DEFAULT_SPREADSHEET_FILE_CONTENT_TYPE))
            .andExpect(jsonPath("$.toField").value(DEFAULT_TO_FIELD))
            .andExpect(jsonPath("$.ccField").value(DEFAULT_CC_FIELD))
            .andExpect(jsonPath("$.bccField").value(DEFAULT_BCC_FIELD))
            .andExpect(jsonPath("$.header").value(DEFAULT_HEADER))
            .andExpect(jsonPath("$.content").value(DEFAULT_CONTENT))
            .andExpect(jsonPath("$.status").value(DEFAULT_STATUS.toString()))
            .andExpect(jsonPath("$.sentAt").value(DEFAULT_SENT_AT.toString()));
    }

    @Test
    @Transactional
    void getProjectsByIdFiltering() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        Long id = project.getId();

        defaultProjectFiltering("id.equals=" + id, "id.notEquals=" + id);

        defaultProjectFiltering("id.greaterThanOrEqual=" + id, "id.greaterThan=" + id);

        defaultProjectFiltering("id.lessThanOrEqual=" + id, "id.lessThan=" + id);
    }

    @Test
    @Transactional
    void getAllProjectsByNameIsEqualToSomething() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        // Get all the projectList where name equals to
        defaultProjectFiltering("name.equals=" + DEFAULT_NAME, "name.equals=" + UPDATED_NAME);
    }

    @Test
    @Transactional
    void getAllProjectsByNameIsInShouldWork() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        // Get all the projectList where name in
        defaultProjectFiltering("name.in=" + DEFAULT_NAME + "," + UPDATED_NAME, "name.in=" + UPDATED_NAME);
    }

    @Test
    @Transactional
    void getAllProjectsByNameIsNullOrNotNull() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        // Get all the projectList where name is not null
        defaultProjectFiltering("name.specified=true", "name.specified=false");
    }

    @Test
    @Transactional
    void getAllProjectsByNameContainsSomething() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        // Get all the projectList where name contains
        defaultProjectFiltering("name.contains=" + DEFAULT_NAME, "name.contains=" + UPDATED_NAME);
    }

    @Test
    @Transactional
    void getAllProjectsByNameNotContainsSomething() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        // Get all the projectList where name does not contain
        defaultProjectFiltering("name.doesNotContain=" + UPDATED_NAME, "name.doesNotContain=" + DEFAULT_NAME);
    }

    @Test
    @Transactional
    void getAllProjectsBySpreadsheetFileContentTypeIsEqualToSomething() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        // Get all the projectList where spreadsheetFileContentType equals to
        defaultProjectFiltering(
            "spreadsheetFileContentType.equals=" + DEFAULT_SPREADSHEET_FILE_CONTENT_TYPE,
            "spreadsheetFileContentType.equals=" + UPDATED_SPREADSHEET_FILE_CONTENT_TYPE
        );
    }

    @Test
    @Transactional
    void getAllProjectsBySpreadsheetFileContentTypeIsInShouldWork() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        // Get all the projectList where spreadsheetFileContentType in
        defaultProjectFiltering(
            "spreadsheetFileContentType.in=" + DEFAULT_SPREADSHEET_FILE_CONTENT_TYPE + "," + UPDATED_SPREADSHEET_FILE_CONTENT_TYPE,
            "spreadsheetFileContentType.in=" + UPDATED_SPREADSHEET_FILE_CONTENT_TYPE
        );
    }

    @Test
    @Transactional
    void getAllProjectsBySpreadsheetFileContentTypeIsNullOrNotNull() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        // Get all the projectList where spreadsheetFileContentType is not null
        defaultProjectFiltering("spreadsheetFileContentType.specified=true", "spreadsheetFileContentType.specified=false");
    }

    @Test
    @Transactional
    void getAllProjectsBySpreadsheetFileContentTypeContainsSomething() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        // Get all the projectList where spreadsheetFileContentType contains
        defaultProjectFiltering(
            "spreadsheetFileContentType.contains=" + DEFAULT_SPREADSHEET_FILE_CONTENT_TYPE,
            "spreadsheetFileContentType.contains=" + UPDATED_SPREADSHEET_FILE_CONTENT_TYPE
        );
    }

    @Test
    @Transactional
    void getAllProjectsBySpreadsheetFileContentTypeNotContainsSomething() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        // Get all the projectList where spreadsheetFileContentType does not contain
        defaultProjectFiltering(
            "spreadsheetFileContentType.doesNotContain=" + UPDATED_SPREADSHEET_FILE_CONTENT_TYPE,
            "spreadsheetFileContentType.doesNotContain=" + DEFAULT_SPREADSHEET_FILE_CONTENT_TYPE
        );
    }

    @Test
    @Transactional
    void getAllProjectsByStatusIsEqualToSomething() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        // Get all the projectList where status equals to
        defaultProjectFiltering("status.equals=" + DEFAULT_STATUS, "status.equals=" + UPDATED_STATUS);
    }

    @Test
    @Transactional
    void getAllProjectsByStatusIsInShouldWork() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        // Get all the projectList where status in
        defaultProjectFiltering("status.in=" + DEFAULT_STATUS + "," + UPDATED_STATUS, "status.in=" + UPDATED_STATUS);
    }

    @Test
    @Transactional
    void getAllProjectsByStatusIsNullOrNotNull() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        // Get all the projectList where status is not null
        defaultProjectFiltering("status.specified=true", "status.specified=false");
    }

    @Test
    @Transactional
    void getAllProjectsBySentAtIsEqualToSomething() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        // Get all the projectList where sentAt equals to
        defaultProjectFiltering("sentAt.equals=" + DEFAULT_SENT_AT, "sentAt.equals=" + UPDATED_SENT_AT);
    }

    @Test
    @Transactional
    void getAllProjectsBySentAtIsInShouldWork() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        // Get all the projectList where sentAt in
        defaultProjectFiltering("sentAt.in=" + DEFAULT_SENT_AT + "," + UPDATED_SENT_AT, "sentAt.in=" + UPDATED_SENT_AT);
    }

    @Test
    @Transactional
    void getAllProjectsBySentAtIsNullOrNotNull() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        // Get all the projectList where sentAt is not null
        defaultProjectFiltering("sentAt.specified=true", "sentAt.specified=false");
    }

    @Test
    @Transactional
    void getAllProjectsByUserIsEqualToSomething() throws Exception {
        User user;
        if (TestUtil.findAll(em, User.class).isEmpty()) {
            projectRepository.saveAndFlush(project);
            user = UserResourceIT.createEntity();
        } else {
            user = TestUtil.findAll(em, User.class).get(0);
        }
        em.persist(user);
        em.flush();
        project.setUser(user);
        projectRepository.saveAndFlush(project);
        String userId = user.getId();
        // Get all the projectList where user equals to userId
        defaultProjectShouldBeFound("userId.equals=" + userId);

        // Get all the projectList where user equals to "invalid-id"
        defaultProjectShouldNotBeFound("userId.equals=" + "invalid-id");
    }

    private void defaultProjectFiltering(String shouldBeFound, String shouldNotBeFound) throws Exception {
        defaultProjectShouldBeFound(shouldBeFound);
        defaultProjectShouldNotBeFound(shouldNotBeFound);
    }

    /**
     * Executes the search, and checks that the default entity is returned.
     */
    private void defaultProjectShouldBeFound(String filter) throws Exception {
        restProjectMockMvc
            .perform(get(ENTITY_API_URL + "?sort=id,desc&" + filter))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.[*].id").value(hasItem(project.getId().intValue())))
            .andExpect(jsonPath("$.[*].name").value(hasItem(DEFAULT_NAME)))
            .andExpect(jsonPath("$.[*].spreadsheetLinkContentType").value(hasItem(DEFAULT_SPREADSHEET_LINK_CONTENT_TYPE)))
            .andExpect(jsonPath("$.[*].spreadsheetLink").value(hasItem(Base64.getEncoder().encodeToString(DEFAULT_SPREADSHEET_LINK))))
            .andExpect(jsonPath("$.[*].spreadsheetFileContentType").value(hasItem(DEFAULT_SPREADSHEET_FILE_CONTENT_TYPE)))
            .andExpect(jsonPath("$.[*].toField").value(hasItem(DEFAULT_TO_FIELD.toString())))
            .andExpect(jsonPath("$.[*].ccField").value(hasItem(DEFAULT_CC_FIELD.toString())))
            .andExpect(jsonPath("$.[*].bccField").value(hasItem(DEFAULT_BCC_FIELD.toString())))
            .andExpect(jsonPath("$.[*].header").value(hasItem(DEFAULT_HEADER.toString())))
            .andExpect(jsonPath("$.[*].content").value(hasItem(DEFAULT_CONTENT.toString())))
            .andExpect(jsonPath("$.[*].status").value(hasItem(DEFAULT_STATUS.toString())))
            .andExpect(jsonPath("$.[*].sentAt").value(hasItem(DEFAULT_SENT_AT.toString())));

        // Check, that the count call also returns 1
        restProjectMockMvc
            .perform(get(ENTITY_API_URL + "/count?sort=id,desc&" + filter))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(content().string("1"));
    }

    /**
     * Executes the search, and checks that the default entity is not returned.
     */
    private void defaultProjectShouldNotBeFound(String filter) throws Exception {
        restProjectMockMvc
            .perform(get(ENTITY_API_URL + "?sort=id,desc&" + filter))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$").isArray())
            .andExpect(jsonPath("$").isEmpty());

        // Check, that the count call also returns 0
        restProjectMockMvc
            .perform(get(ENTITY_API_URL + "/count?sort=id,desc&" + filter))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(content().string("0"));
    }

    @Test
    @Transactional
    void getNonExistingProject() throws Exception {
        // Get the project
        restProjectMockMvc.perform(get(ENTITY_API_URL_ID, Long.MAX_VALUE)).andExpect(status().isNotFound());
    }

    @Test
    @Transactional
    void putExistingProject() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the project
        Project updatedProject = projectRepository.findById(project.getId()).orElseThrow();
        // Disconnect from session so that the updates on updatedProject are not directly saved in db
        em.detach(updatedProject);
        updatedProject
            .name(UPDATED_NAME)
            .spreadsheetLink(UPDATED_SPREADSHEET_LINK)
            .spreadsheetLinkContentType(UPDATED_SPREADSHEET_LINK_CONTENT_TYPE)
            .spreadsheetFileContentType(UPDATED_SPREADSHEET_FILE_CONTENT_TYPE)
            .toField(UPDATED_TO_FIELD)
            .ccField(UPDATED_CC_FIELD)
            .bccField(UPDATED_BCC_FIELD)
            .header(UPDATED_HEADER)
            .content(UPDATED_CONTENT)
            .status(UPDATED_STATUS)
            .sentAt(UPDATED_SENT_AT);
        ProjectDTO projectDTO = projectMapper.toDto(updatedProject);

        restProjectMockMvc
            .perform(
                put(ENTITY_API_URL_ID, projectDTO.getId())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(projectDTO))
            )
            .andExpect(status().isOk());

        // Validate the Project in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertPersistedProjectToMatchAllProperties(updatedProject);
    }

    @Test
    @Transactional
    void putNonExistingProject() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        project.setId(longCount.incrementAndGet());

        // Create the Project
        ProjectDTO projectDTO = projectMapper.toDto(project);

        // If the entity doesn't have an ID, it will throw BadRequestAlertException
        restProjectMockMvc
            .perform(
                put(ENTITY_API_URL_ID, projectDTO.getId())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(projectDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Project in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void putWithIdMismatchProject() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        project.setId(longCount.incrementAndGet());

        // Create the Project
        ProjectDTO projectDTO = projectMapper.toDto(project);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restProjectMockMvc
            .perform(
                put(ENTITY_API_URL_ID, longCount.incrementAndGet())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(projectDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Project in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void putWithMissingIdPathParamProject() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        project.setId(longCount.incrementAndGet());

        // Create the Project
        ProjectDTO projectDTO = projectMapper.toDto(project);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restProjectMockMvc
            .perform(put(ENTITY_API_URL).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(projectDTO)))
            .andExpect(status().isMethodNotAllowed());

        // Validate the Project in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void partialUpdateProjectWithPatch() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the project using partial update
        Project partialUpdatedProject = new Project();
        partialUpdatedProject.setId(project.getId());

        partialUpdatedProject
            .spreadsheetFileContentType(UPDATED_SPREADSHEET_FILE_CONTENT_TYPE)
            .header(UPDATED_HEADER)
            .status(UPDATED_STATUS)
            .sentAt(UPDATED_SENT_AT);

        restProjectMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, partialUpdatedProject.getId())
                    .with(csrf())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(partialUpdatedProject))
            )
            .andExpect(status().isOk());

        // Validate the Project in the database

        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertProjectUpdatableFieldsEquals(createUpdateProxyForBean(partialUpdatedProject, project), getPersistedProject(project));
    }

    @Test
    @Transactional
    void fullUpdateProjectWithPatch() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the project using partial update
        Project partialUpdatedProject = new Project();
        partialUpdatedProject.setId(project.getId());

        partialUpdatedProject
            .name(UPDATED_NAME)
            .spreadsheetLink(UPDATED_SPREADSHEET_LINK)
            .spreadsheetLinkContentType(UPDATED_SPREADSHEET_LINK_CONTENT_TYPE)
            .spreadsheetFileContentType(UPDATED_SPREADSHEET_FILE_CONTENT_TYPE)
            .toField(UPDATED_TO_FIELD)
            .ccField(UPDATED_CC_FIELD)
            .bccField(UPDATED_BCC_FIELD)
            .header(UPDATED_HEADER)
            .content(UPDATED_CONTENT)
            .status(UPDATED_STATUS)
            .sentAt(UPDATED_SENT_AT);

        restProjectMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, partialUpdatedProject.getId())
                    .with(csrf())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(partialUpdatedProject))
            )
            .andExpect(status().isOk());

        // Validate the Project in the database

        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertProjectUpdatableFieldsEquals(partialUpdatedProject, getPersistedProject(partialUpdatedProject));
    }

    @Test
    @Transactional
    void patchNonExistingProject() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        project.setId(longCount.incrementAndGet());

        // Create the Project
        ProjectDTO projectDTO = projectMapper.toDto(project);

        // If the entity doesn't have an ID, it will throw BadRequestAlertException
        restProjectMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, projectDTO.getId())
                    .with(csrf())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(projectDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Project in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void patchWithIdMismatchProject() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        project.setId(longCount.incrementAndGet());

        // Create the Project
        ProjectDTO projectDTO = projectMapper.toDto(project);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restProjectMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, longCount.incrementAndGet())
                    .with(csrf())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(projectDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Project in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void patchWithMissingIdPathParamProject() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        project.setId(longCount.incrementAndGet());

        // Create the Project
        ProjectDTO projectDTO = projectMapper.toDto(project);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restProjectMockMvc
            .perform(
                patch(ENTITY_API_URL).with(csrf()).contentType("application/merge-patch+json").content(om.writeValueAsBytes(projectDTO))
            )
            .andExpect(status().isMethodNotAllowed());

        // Validate the Project in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void deleteProject() throws Exception {
        // Initialize the database
        insertedProject = projectRepository.saveAndFlush(project);

        long databaseSizeBeforeDelete = getRepositoryCount();

        // Delete the project
        restProjectMockMvc
            .perform(delete(ENTITY_API_URL_ID, project.getId()).with(csrf()).accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isNoContent());

        // Validate the database contains one less item
        assertDecrementedRepositoryCount(databaseSizeBeforeDelete);
    }

    protected long getRepositoryCount() {
        return projectRepository.count();
    }

    protected void assertIncrementedRepositoryCount(long countBefore) {
        assertThat(countBefore + 1).isEqualTo(getRepositoryCount());
    }

    protected void assertDecrementedRepositoryCount(long countBefore) {
        assertThat(countBefore - 1).isEqualTo(getRepositoryCount());
    }

    protected void assertSameRepositoryCount(long countBefore) {
        assertThat(countBefore).isEqualTo(getRepositoryCount());
    }

    protected Project getPersistedProject(Project project) {
        return projectRepository.findById(project.getId()).orElseThrow();
    }

    protected void assertPersistedProjectToMatchAllProperties(Project expectedProject) {
        assertProjectAllPropertiesEquals(expectedProject, getPersistedProject(expectedProject));
    }

    protected void assertPersistedProjectToMatchUpdatableProperties(Project expectedProject) {
        assertProjectAllUpdatablePropertiesEquals(expectedProject, getPersistedProject(expectedProject));
    }
}
