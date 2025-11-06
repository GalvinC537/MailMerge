package mailmerge.web.rest;

import static mailmerge.domain.HeadingAsserts.*;
import static mailmerge.web.rest.TestUtil.createUpdateProxyForBean;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.util.Random;
import java.util.concurrent.atomic.AtomicLong;
import mailmerge.IntegrationTest;
import mailmerge.domain.Heading;
import mailmerge.domain.Project;
import mailmerge.repository.HeadingRepository;
import mailmerge.service.dto.HeadingDTO;
import mailmerge.service.mapper.HeadingMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for the {@link HeadingResource} REST controller.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser
class HeadingResourceIT {

    private static final String DEFAULT_NAME = "AAAAAAAAAA";
    private static final String UPDATED_NAME = "BBBBBBBBBB";

    private static final String ENTITY_API_URL = "/api/headings";
    private static final String ENTITY_API_URL_ID = ENTITY_API_URL + "/{id}";

    private static Random random = new Random();
    private static AtomicLong longCount = new AtomicLong(random.nextInt() + (2 * Integer.MAX_VALUE));

    @Autowired
    private ObjectMapper om;

    @Autowired
    private HeadingRepository headingRepository;

    @Autowired
    private HeadingMapper headingMapper;

    @Autowired
    private EntityManager em;

    @Autowired
    private MockMvc restHeadingMockMvc;

    private Heading heading;

    private Heading insertedHeading;

    /**
     * Create an entity for this test.
     *
     * This is a static method, as tests for other entities might also need it,
     * if they test an entity which requires the current entity.
     */
    public static Heading createEntity() {
        return new Heading().name(DEFAULT_NAME);
    }

    /**
     * Create an updated entity for this test.
     *
     * This is a static method, as tests for other entities might also need it,
     * if they test an entity which requires the current entity.
     */
    public static Heading createUpdatedEntity() {
        return new Heading().name(UPDATED_NAME);
    }

    @BeforeEach
    public void initTest() {
        heading = createEntity();
    }

    @AfterEach
    public void cleanup() {
        if (insertedHeading != null) {
            headingRepository.delete(insertedHeading);
            insertedHeading = null;
        }
    }

    @Test
    @Transactional
    void createHeading() throws Exception {
        long databaseSizeBeforeCreate = getRepositoryCount();
        // Create the Heading
        HeadingDTO headingDTO = headingMapper.toDto(heading);
        var returnedHeadingDTO = om.readValue(
            restHeadingMockMvc
                .perform(
                    post(ENTITY_API_URL).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(headingDTO))
                )
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString(),
            HeadingDTO.class
        );

        // Validate the Heading in the database
        assertIncrementedRepositoryCount(databaseSizeBeforeCreate);
        var returnedHeading = headingMapper.toEntity(returnedHeadingDTO);
        assertHeadingUpdatableFieldsEquals(returnedHeading, getPersistedHeading(returnedHeading));

        insertedHeading = returnedHeading;
    }

    @Test
    @Transactional
    void createHeadingWithExistingId() throws Exception {
        // Create the Heading with an existing ID
        heading.setId(1L);
        HeadingDTO headingDTO = headingMapper.toDto(heading);

        long databaseSizeBeforeCreate = getRepositoryCount();

        // An entity with an existing ID cannot be created, so this API call must fail
        restHeadingMockMvc
            .perform(post(ENTITY_API_URL).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(headingDTO)))
            .andExpect(status().isBadRequest());

        // Validate the Heading in the database
        assertSameRepositoryCount(databaseSizeBeforeCreate);
    }

    @Test
    @Transactional
    void getAllHeadings() throws Exception {
        // Initialize the database
        insertedHeading = headingRepository.saveAndFlush(heading);

        // Get all the headingList
        restHeadingMockMvc
            .perform(get(ENTITY_API_URL + "?sort=id,desc"))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.[*].id").value(hasItem(heading.getId().intValue())))
            .andExpect(jsonPath("$.[*].name").value(hasItem(DEFAULT_NAME)));
    }

    @Test
    @Transactional
    void getHeading() throws Exception {
        // Initialize the database
        insertedHeading = headingRepository.saveAndFlush(heading);

        // Get the heading
        restHeadingMockMvc
            .perform(get(ENTITY_API_URL_ID, heading.getId()))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.id").value(heading.getId().intValue()))
            .andExpect(jsonPath("$.name").value(DEFAULT_NAME));
    }

    @Test
    @Transactional
    void getHeadingsByIdFiltering() throws Exception {
        // Initialize the database
        insertedHeading = headingRepository.saveAndFlush(heading);

        Long id = heading.getId();

        defaultHeadingFiltering("id.equals=" + id, "id.notEquals=" + id);

        defaultHeadingFiltering("id.greaterThanOrEqual=" + id, "id.greaterThan=" + id);

        defaultHeadingFiltering("id.lessThanOrEqual=" + id, "id.lessThan=" + id);
    }

    @Test
    @Transactional
    void getAllHeadingsByNameIsEqualToSomething() throws Exception {
        // Initialize the database
        insertedHeading = headingRepository.saveAndFlush(heading);

        // Get all the headingList where name equals to
        defaultHeadingFiltering("name.equals=" + DEFAULT_NAME, "name.equals=" + UPDATED_NAME);
    }

    @Test
    @Transactional
    void getAllHeadingsByNameIsInShouldWork() throws Exception {
        // Initialize the database
        insertedHeading = headingRepository.saveAndFlush(heading);

        // Get all the headingList where name in
        defaultHeadingFiltering("name.in=" + DEFAULT_NAME + "," + UPDATED_NAME, "name.in=" + UPDATED_NAME);
    }

    @Test
    @Transactional
    void getAllHeadingsByNameIsNullOrNotNull() throws Exception {
        // Initialize the database
        insertedHeading = headingRepository.saveAndFlush(heading);

        // Get all the headingList where name is not null
        defaultHeadingFiltering("name.specified=true", "name.specified=false");
    }

    @Test
    @Transactional
    void getAllHeadingsByNameContainsSomething() throws Exception {
        // Initialize the database
        insertedHeading = headingRepository.saveAndFlush(heading);

        // Get all the headingList where name contains
        defaultHeadingFiltering("name.contains=" + DEFAULT_NAME, "name.contains=" + UPDATED_NAME);
    }

    @Test
    @Transactional
    void getAllHeadingsByNameNotContainsSomething() throws Exception {
        // Initialize the database
        insertedHeading = headingRepository.saveAndFlush(heading);

        // Get all the headingList where name does not contain
        defaultHeadingFiltering("name.doesNotContain=" + UPDATED_NAME, "name.doesNotContain=" + DEFAULT_NAME);
    }

    @Test
    @Transactional
    void getAllHeadingsByProjectIsEqualToSomething() throws Exception {
        Project project;
        if (TestUtil.findAll(em, Project.class).isEmpty()) {
            headingRepository.saveAndFlush(heading);
            project = ProjectResourceIT.createEntity();
        } else {
            project = TestUtil.findAll(em, Project.class).get(0);
        }
        em.persist(project);
        em.flush();
        heading.setProject(project);
        headingRepository.saveAndFlush(heading);
        Long projectId = project.getId();
        // Get all the headingList where project equals to projectId
        defaultHeadingShouldBeFound("projectId.equals=" + projectId);

        // Get all the headingList where project equals to (projectId + 1)
        defaultHeadingShouldNotBeFound("projectId.equals=" + (projectId + 1));
    }

    private void defaultHeadingFiltering(String shouldBeFound, String shouldNotBeFound) throws Exception {
        defaultHeadingShouldBeFound(shouldBeFound);
        defaultHeadingShouldNotBeFound(shouldNotBeFound);
    }

    /**
     * Executes the search, and checks that the default entity is returned.
     */
    private void defaultHeadingShouldBeFound(String filter) throws Exception {
        restHeadingMockMvc
            .perform(get(ENTITY_API_URL + "?sort=id,desc&" + filter))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.[*].id").value(hasItem(heading.getId().intValue())))
            .andExpect(jsonPath("$.[*].name").value(hasItem(DEFAULT_NAME)));

        // Check, that the count call also returns 1
        restHeadingMockMvc
            .perform(get(ENTITY_API_URL + "/count?sort=id,desc&" + filter))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(content().string("1"));
    }

    /**
     * Executes the search, and checks that the default entity is not returned.
     */
    private void defaultHeadingShouldNotBeFound(String filter) throws Exception {
        restHeadingMockMvc
            .perform(get(ENTITY_API_URL + "?sort=id,desc&" + filter))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$").isArray())
            .andExpect(jsonPath("$").isEmpty());

        // Check, that the count call also returns 0
        restHeadingMockMvc
            .perform(get(ENTITY_API_URL + "/count?sort=id,desc&" + filter))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(content().string("0"));
    }

    @Test
    @Transactional
    void getNonExistingHeading() throws Exception {
        // Get the heading
        restHeadingMockMvc.perform(get(ENTITY_API_URL_ID, Long.MAX_VALUE)).andExpect(status().isNotFound());
    }

    @Test
    @Transactional
    void putExistingHeading() throws Exception {
        // Initialize the database
        insertedHeading = headingRepository.saveAndFlush(heading);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the heading
        Heading updatedHeading = headingRepository.findById(heading.getId()).orElseThrow();
        // Disconnect from session so that the updates on updatedHeading are not directly saved in db
        em.detach(updatedHeading);
        updatedHeading.name(UPDATED_NAME);
        HeadingDTO headingDTO = headingMapper.toDto(updatedHeading);

        restHeadingMockMvc
            .perform(
                put(ENTITY_API_URL_ID, headingDTO.getId())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(headingDTO))
            )
            .andExpect(status().isOk());

        // Validate the Heading in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertPersistedHeadingToMatchAllProperties(updatedHeading);
    }

    @Test
    @Transactional
    void putNonExistingHeading() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        heading.setId(longCount.incrementAndGet());

        // Create the Heading
        HeadingDTO headingDTO = headingMapper.toDto(heading);

        // If the entity doesn't have an ID, it will throw BadRequestAlertException
        restHeadingMockMvc
            .perform(
                put(ENTITY_API_URL_ID, headingDTO.getId())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(headingDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Heading in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void putWithIdMismatchHeading() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        heading.setId(longCount.incrementAndGet());

        // Create the Heading
        HeadingDTO headingDTO = headingMapper.toDto(heading);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restHeadingMockMvc
            .perform(
                put(ENTITY_API_URL_ID, longCount.incrementAndGet())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(headingDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Heading in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void putWithMissingIdPathParamHeading() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        heading.setId(longCount.incrementAndGet());

        // Create the Heading
        HeadingDTO headingDTO = headingMapper.toDto(heading);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restHeadingMockMvc
            .perform(put(ENTITY_API_URL).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(headingDTO)))
            .andExpect(status().isMethodNotAllowed());

        // Validate the Heading in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void partialUpdateHeadingWithPatch() throws Exception {
        // Initialize the database
        insertedHeading = headingRepository.saveAndFlush(heading);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the heading using partial update
        Heading partialUpdatedHeading = new Heading();
        partialUpdatedHeading.setId(heading.getId());

        partialUpdatedHeading.name(UPDATED_NAME);

        restHeadingMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, partialUpdatedHeading.getId())
                    .with(csrf())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(partialUpdatedHeading))
            )
            .andExpect(status().isOk());

        // Validate the Heading in the database

        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertHeadingUpdatableFieldsEquals(createUpdateProxyForBean(partialUpdatedHeading, heading), getPersistedHeading(heading));
    }

    @Test
    @Transactional
    void fullUpdateHeadingWithPatch() throws Exception {
        // Initialize the database
        insertedHeading = headingRepository.saveAndFlush(heading);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the heading using partial update
        Heading partialUpdatedHeading = new Heading();
        partialUpdatedHeading.setId(heading.getId());

        partialUpdatedHeading.name(UPDATED_NAME);

        restHeadingMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, partialUpdatedHeading.getId())
                    .with(csrf())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(partialUpdatedHeading))
            )
            .andExpect(status().isOk());

        // Validate the Heading in the database

        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertHeadingUpdatableFieldsEquals(partialUpdatedHeading, getPersistedHeading(partialUpdatedHeading));
    }

    @Test
    @Transactional
    void patchNonExistingHeading() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        heading.setId(longCount.incrementAndGet());

        // Create the Heading
        HeadingDTO headingDTO = headingMapper.toDto(heading);

        // If the entity doesn't have an ID, it will throw BadRequestAlertException
        restHeadingMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, headingDTO.getId())
                    .with(csrf())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(headingDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Heading in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void patchWithIdMismatchHeading() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        heading.setId(longCount.incrementAndGet());

        // Create the Heading
        HeadingDTO headingDTO = headingMapper.toDto(heading);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restHeadingMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, longCount.incrementAndGet())
                    .with(csrf())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(headingDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Heading in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void patchWithMissingIdPathParamHeading() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        heading.setId(longCount.incrementAndGet());

        // Create the Heading
        HeadingDTO headingDTO = headingMapper.toDto(heading);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restHeadingMockMvc
            .perform(
                patch(ENTITY_API_URL).with(csrf()).contentType("application/merge-patch+json").content(om.writeValueAsBytes(headingDTO))
            )
            .andExpect(status().isMethodNotAllowed());

        // Validate the Heading in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void deleteHeading() throws Exception {
        // Initialize the database
        insertedHeading = headingRepository.saveAndFlush(heading);

        long databaseSizeBeforeDelete = getRepositoryCount();

        // Delete the heading
        restHeadingMockMvc
            .perform(delete(ENTITY_API_URL_ID, heading.getId()).with(csrf()).accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isNoContent());

        // Validate the database contains one less item
        assertDecrementedRepositoryCount(databaseSizeBeforeDelete);
    }

    protected long getRepositoryCount() {
        return headingRepository.count();
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

    protected Heading getPersistedHeading(Heading heading) {
        return headingRepository.findById(heading.getId()).orElseThrow();
    }

    protected void assertPersistedHeadingToMatchAllProperties(Heading expectedHeading) {
        assertHeadingAllPropertiesEquals(expectedHeading, getPersistedHeading(expectedHeading));
    }

    protected void assertPersistedHeadingToMatchUpdatableProperties(Heading expectedHeading) {
        assertHeadingAllUpdatablePropertiesEquals(expectedHeading, getPersistedHeading(expectedHeading));
    }
}
