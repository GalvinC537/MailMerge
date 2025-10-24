package mailmerge.web.rest;

import static mailmerge.domain.EmailAsserts.*;
import static mailmerge.web.rest.TestUtil.createUpdateProxyForBean;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Random;
import java.util.concurrent.atomic.AtomicLong;
import mailmerge.IntegrationTest;
import mailmerge.domain.Email;
import mailmerge.domain.Project;
import mailmerge.domain.enumeration.EmailStatus;
import mailmerge.repository.EmailRepository;
import mailmerge.service.dto.EmailDTO;
import mailmerge.service.mapper.EmailMapper;
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
 * Integration tests for the {@link EmailResource} REST controller.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser
class EmailResourceIT {

    private static final String DEFAULT_EMAIL_ADDRESS = "AAAAAAAAAA";
    private static final String UPDATED_EMAIL_ADDRESS = "BBBBBBBBBB";

    private static final String DEFAULT_CONTENT = "AAAAAAAAAA";
    private static final String UPDATED_CONTENT = "BBBBBBBBBB";

    private static final String DEFAULT_VARIABLES_JSON = "AAAAAAAAAA";
    private static final String UPDATED_VARIABLES_JSON = "BBBBBBBBBB";

    private static final EmailStatus DEFAULT_STATUS = EmailStatus.PENDING;
    private static final EmailStatus UPDATED_STATUS = EmailStatus.SENT;

    private static final Instant DEFAULT_SENT_AT = Instant.ofEpochMilli(0L);
    private static final Instant UPDATED_SENT_AT = Instant.now().truncatedTo(ChronoUnit.MILLIS);

    private static final String ENTITY_API_URL = "/api/emails";
    private static final String ENTITY_API_URL_ID = ENTITY_API_URL + "/{id}";

    private static Random random = new Random();
    private static AtomicLong longCount = new AtomicLong(random.nextInt() + (2 * Integer.MAX_VALUE));

    @Autowired
    private ObjectMapper om;

    @Autowired
    private EmailRepository emailRepository;

    @Autowired
    private EmailMapper emailMapper;

    @Autowired
    private EntityManager em;

    @Autowired
    private MockMvc restEmailMockMvc;

    private Email email;

    private Email insertedEmail;

    /**
     * Create an entity for this test.
     *
     * This is a static method, as tests for other entities might also need it,
     * if they test an entity which requires the current entity.
     */
    public static Email createEntity() {
        return new Email()
            .emailAddress(DEFAULT_EMAIL_ADDRESS)
            .content(DEFAULT_CONTENT)
            .variablesJson(DEFAULT_VARIABLES_JSON)
            .status(DEFAULT_STATUS)
            .sentAt(DEFAULT_SENT_AT);
    }

    /**
     * Create an updated entity for this test.
     *
     * This is a static method, as tests for other entities might also need it,
     * if they test an entity which requires the current entity.
     */
    public static Email createUpdatedEntity() {
        return new Email()
            .emailAddress(UPDATED_EMAIL_ADDRESS)
            .content(UPDATED_CONTENT)
            .variablesJson(UPDATED_VARIABLES_JSON)
            .status(UPDATED_STATUS)
            .sentAt(UPDATED_SENT_AT);
    }

    @BeforeEach
    public void initTest() {
        email = createEntity();
    }

    @AfterEach
    public void cleanup() {
        if (insertedEmail != null) {
            emailRepository.delete(insertedEmail);
            insertedEmail = null;
        }
    }

    @Test
    @Transactional
    void createEmail() throws Exception {
        long databaseSizeBeforeCreate = getRepositoryCount();
        // Create the Email
        EmailDTO emailDTO = emailMapper.toDto(email);
        var returnedEmailDTO = om.readValue(
            restEmailMockMvc
                .perform(post(ENTITY_API_URL).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(emailDTO)))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString(),
            EmailDTO.class
        );

        // Validate the Email in the database
        assertIncrementedRepositoryCount(databaseSizeBeforeCreate);
        var returnedEmail = emailMapper.toEntity(returnedEmailDTO);
        assertEmailUpdatableFieldsEquals(returnedEmail, getPersistedEmail(returnedEmail));

        insertedEmail = returnedEmail;
    }

    @Test
    @Transactional
    void createEmailWithExistingId() throws Exception {
        // Create the Email with an existing ID
        email.setId(1L);
        EmailDTO emailDTO = emailMapper.toDto(email);

        long databaseSizeBeforeCreate = getRepositoryCount();

        // An entity with an existing ID cannot be created, so this API call must fail
        restEmailMockMvc
            .perform(post(ENTITY_API_URL).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(emailDTO)))
            .andExpect(status().isBadRequest());

        // Validate the Email in the database
        assertSameRepositoryCount(databaseSizeBeforeCreate);
    }

    @Test
    @Transactional
    void checkEmailAddressIsRequired() throws Exception {
        long databaseSizeBeforeTest = getRepositoryCount();
        // set the field null
        email.setEmailAddress(null);

        // Create the Email, which fails.
        EmailDTO emailDTO = emailMapper.toDto(email);

        restEmailMockMvc
            .perform(post(ENTITY_API_URL).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(emailDTO)))
            .andExpect(status().isBadRequest());

        assertSameRepositoryCount(databaseSizeBeforeTest);
    }

    @Test
    @Transactional
    void checkStatusIsRequired() throws Exception {
        long databaseSizeBeforeTest = getRepositoryCount();
        // set the field null
        email.setStatus(null);

        // Create the Email, which fails.
        EmailDTO emailDTO = emailMapper.toDto(email);

        restEmailMockMvc
            .perform(post(ENTITY_API_URL).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(emailDTO)))
            .andExpect(status().isBadRequest());

        assertSameRepositoryCount(databaseSizeBeforeTest);
    }

    @Test
    @Transactional
    void getAllEmails() throws Exception {
        // Initialize the database
        insertedEmail = emailRepository.saveAndFlush(email);

        // Get all the emailList
        restEmailMockMvc
            .perform(get(ENTITY_API_URL + "?sort=id,desc"))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.[*].id").value(hasItem(email.getId().intValue())))
            .andExpect(jsonPath("$.[*].emailAddress").value(hasItem(DEFAULT_EMAIL_ADDRESS)))
            .andExpect(jsonPath("$.[*].content").value(hasItem(DEFAULT_CONTENT.toString())))
            .andExpect(jsonPath("$.[*].variablesJson").value(hasItem(DEFAULT_VARIABLES_JSON.toString())))
            .andExpect(jsonPath("$.[*].status").value(hasItem(DEFAULT_STATUS.toString())))
            .andExpect(jsonPath("$.[*].sentAt").value(hasItem(DEFAULT_SENT_AT.toString())));
    }

    @Test
    @Transactional
    void getEmail() throws Exception {
        // Initialize the database
        insertedEmail = emailRepository.saveAndFlush(email);

        // Get the email
        restEmailMockMvc
            .perform(get(ENTITY_API_URL_ID, email.getId()))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.id").value(email.getId().intValue()))
            .andExpect(jsonPath("$.emailAddress").value(DEFAULT_EMAIL_ADDRESS))
            .andExpect(jsonPath("$.content").value(DEFAULT_CONTENT.toString()))
            .andExpect(jsonPath("$.variablesJson").value(DEFAULT_VARIABLES_JSON.toString()))
            .andExpect(jsonPath("$.status").value(DEFAULT_STATUS.toString()))
            .andExpect(jsonPath("$.sentAt").value(DEFAULT_SENT_AT.toString()));
    }

    @Test
    @Transactional
    void getEmailsByIdFiltering() throws Exception {
        // Initialize the database
        insertedEmail = emailRepository.saveAndFlush(email);

        Long id = email.getId();

        defaultEmailFiltering("id.equals=" + id, "id.notEquals=" + id);

        defaultEmailFiltering("id.greaterThanOrEqual=" + id, "id.greaterThan=" + id);

        defaultEmailFiltering("id.lessThanOrEqual=" + id, "id.lessThan=" + id);
    }

    @Test
    @Transactional
    void getAllEmailsByEmailAddressIsEqualToSomething() throws Exception {
        // Initialize the database
        insertedEmail = emailRepository.saveAndFlush(email);

        // Get all the emailList where emailAddress equals to
        defaultEmailFiltering("emailAddress.equals=" + DEFAULT_EMAIL_ADDRESS, "emailAddress.equals=" + UPDATED_EMAIL_ADDRESS);
    }

    @Test
    @Transactional
    void getAllEmailsByEmailAddressIsInShouldWork() throws Exception {
        // Initialize the database
        insertedEmail = emailRepository.saveAndFlush(email);

        // Get all the emailList where emailAddress in
        defaultEmailFiltering(
            "emailAddress.in=" + DEFAULT_EMAIL_ADDRESS + "," + UPDATED_EMAIL_ADDRESS,
            "emailAddress.in=" + UPDATED_EMAIL_ADDRESS
        );
    }

    @Test
    @Transactional
    void getAllEmailsByEmailAddressIsNullOrNotNull() throws Exception {
        // Initialize the database
        insertedEmail = emailRepository.saveAndFlush(email);

        // Get all the emailList where emailAddress is not null
        defaultEmailFiltering("emailAddress.specified=true", "emailAddress.specified=false");
    }

    @Test
    @Transactional
    void getAllEmailsByEmailAddressContainsSomething() throws Exception {
        // Initialize the database
        insertedEmail = emailRepository.saveAndFlush(email);

        // Get all the emailList where emailAddress contains
        defaultEmailFiltering("emailAddress.contains=" + DEFAULT_EMAIL_ADDRESS, "emailAddress.contains=" + UPDATED_EMAIL_ADDRESS);
    }

    @Test
    @Transactional
    void getAllEmailsByEmailAddressNotContainsSomething() throws Exception {
        // Initialize the database
        insertedEmail = emailRepository.saveAndFlush(email);

        // Get all the emailList where emailAddress does not contain
        defaultEmailFiltering(
            "emailAddress.doesNotContain=" + UPDATED_EMAIL_ADDRESS,
            "emailAddress.doesNotContain=" + DEFAULT_EMAIL_ADDRESS
        );
    }

    @Test
    @Transactional
    void getAllEmailsByStatusIsEqualToSomething() throws Exception {
        // Initialize the database
        insertedEmail = emailRepository.saveAndFlush(email);

        // Get all the emailList where status equals to
        defaultEmailFiltering("status.equals=" + DEFAULT_STATUS, "status.equals=" + UPDATED_STATUS);
    }

    @Test
    @Transactional
    void getAllEmailsByStatusIsInShouldWork() throws Exception {
        // Initialize the database
        insertedEmail = emailRepository.saveAndFlush(email);

        // Get all the emailList where status in
        defaultEmailFiltering("status.in=" + DEFAULT_STATUS + "," + UPDATED_STATUS, "status.in=" + UPDATED_STATUS);
    }

    @Test
    @Transactional
    void getAllEmailsByStatusIsNullOrNotNull() throws Exception {
        // Initialize the database
        insertedEmail = emailRepository.saveAndFlush(email);

        // Get all the emailList where status is not null
        defaultEmailFiltering("status.specified=true", "status.specified=false");
    }

    @Test
    @Transactional
    void getAllEmailsBySentAtIsEqualToSomething() throws Exception {
        // Initialize the database
        insertedEmail = emailRepository.saveAndFlush(email);

        // Get all the emailList where sentAt equals to
        defaultEmailFiltering("sentAt.equals=" + DEFAULT_SENT_AT, "sentAt.equals=" + UPDATED_SENT_AT);
    }

    @Test
    @Transactional
    void getAllEmailsBySentAtIsInShouldWork() throws Exception {
        // Initialize the database
        insertedEmail = emailRepository.saveAndFlush(email);

        // Get all the emailList where sentAt in
        defaultEmailFiltering("sentAt.in=" + DEFAULT_SENT_AT + "," + UPDATED_SENT_AT, "sentAt.in=" + UPDATED_SENT_AT);
    }

    @Test
    @Transactional
    void getAllEmailsBySentAtIsNullOrNotNull() throws Exception {
        // Initialize the database
        insertedEmail = emailRepository.saveAndFlush(email);

        // Get all the emailList where sentAt is not null
        defaultEmailFiltering("sentAt.specified=true", "sentAt.specified=false");
    }

    @Test
    @Transactional
    void getAllEmailsByProjectIsEqualToSomething() throws Exception {
        Project project;
        if (TestUtil.findAll(em, Project.class).isEmpty()) {
            emailRepository.saveAndFlush(email);
            project = ProjectResourceIT.createEntity();
        } else {
            project = TestUtil.findAll(em, Project.class).get(0);
        }
        em.persist(project);
        em.flush();
        email.setProject(project);
        emailRepository.saveAndFlush(email);
        Long projectId = project.getId();
        // Get all the emailList where project equals to projectId
        defaultEmailShouldBeFound("projectId.equals=" + projectId);

        // Get all the emailList where project equals to (projectId + 1)
        defaultEmailShouldNotBeFound("projectId.equals=" + (projectId + 1));
    }

    private void defaultEmailFiltering(String shouldBeFound, String shouldNotBeFound) throws Exception {
        defaultEmailShouldBeFound(shouldBeFound);
        defaultEmailShouldNotBeFound(shouldNotBeFound);
    }

    /**
     * Executes the search, and checks that the default entity is returned.
     */
    private void defaultEmailShouldBeFound(String filter) throws Exception {
        restEmailMockMvc
            .perform(get(ENTITY_API_URL + "?sort=id,desc&" + filter))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.[*].id").value(hasItem(email.getId().intValue())))
            .andExpect(jsonPath("$.[*].emailAddress").value(hasItem(DEFAULT_EMAIL_ADDRESS)))
            .andExpect(jsonPath("$.[*].content").value(hasItem(DEFAULT_CONTENT.toString())))
            .andExpect(jsonPath("$.[*].variablesJson").value(hasItem(DEFAULT_VARIABLES_JSON.toString())))
            .andExpect(jsonPath("$.[*].status").value(hasItem(DEFAULT_STATUS.toString())))
            .andExpect(jsonPath("$.[*].sentAt").value(hasItem(DEFAULT_SENT_AT.toString())));

        // Check, that the count call also returns 1
        restEmailMockMvc
            .perform(get(ENTITY_API_URL + "/count?sort=id,desc&" + filter))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(content().string("1"));
    }

    /**
     * Executes the search, and checks that the default entity is not returned.
     */
    private void defaultEmailShouldNotBeFound(String filter) throws Exception {
        restEmailMockMvc
            .perform(get(ENTITY_API_URL + "?sort=id,desc&" + filter))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$").isArray())
            .andExpect(jsonPath("$").isEmpty());

        // Check, that the count call also returns 0
        restEmailMockMvc
            .perform(get(ENTITY_API_URL + "/count?sort=id,desc&" + filter))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(content().string("0"));
    }

    @Test
    @Transactional
    void getNonExistingEmail() throws Exception {
        // Get the email
        restEmailMockMvc.perform(get(ENTITY_API_URL_ID, Long.MAX_VALUE)).andExpect(status().isNotFound());
    }

    @Test
    @Transactional
    void putExistingEmail() throws Exception {
        // Initialize the database
        insertedEmail = emailRepository.saveAndFlush(email);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the email
        Email updatedEmail = emailRepository.findById(email.getId()).orElseThrow();
        // Disconnect from session so that the updates on updatedEmail are not directly saved in db
        em.detach(updatedEmail);
        updatedEmail
            .emailAddress(UPDATED_EMAIL_ADDRESS)
            .content(UPDATED_CONTENT)
            .variablesJson(UPDATED_VARIABLES_JSON)
            .status(UPDATED_STATUS)
            .sentAt(UPDATED_SENT_AT);
        EmailDTO emailDTO = emailMapper.toDto(updatedEmail);

        restEmailMockMvc
            .perform(
                put(ENTITY_API_URL_ID, emailDTO.getId())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(emailDTO))
            )
            .andExpect(status().isOk());

        // Validate the Email in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertPersistedEmailToMatchAllProperties(updatedEmail);
    }

    @Test
    @Transactional
    void putNonExistingEmail() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        email.setId(longCount.incrementAndGet());

        // Create the Email
        EmailDTO emailDTO = emailMapper.toDto(email);

        // If the entity doesn't have an ID, it will throw BadRequestAlertException
        restEmailMockMvc
            .perform(
                put(ENTITY_API_URL_ID, emailDTO.getId())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(emailDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Email in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void putWithIdMismatchEmail() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        email.setId(longCount.incrementAndGet());

        // Create the Email
        EmailDTO emailDTO = emailMapper.toDto(email);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restEmailMockMvc
            .perform(
                put(ENTITY_API_URL_ID, longCount.incrementAndGet())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(emailDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Email in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void putWithMissingIdPathParamEmail() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        email.setId(longCount.incrementAndGet());

        // Create the Email
        EmailDTO emailDTO = emailMapper.toDto(email);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restEmailMockMvc
            .perform(put(ENTITY_API_URL).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(emailDTO)))
            .andExpect(status().isMethodNotAllowed());

        // Validate the Email in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void partialUpdateEmailWithPatch() throws Exception {
        // Initialize the database
        insertedEmail = emailRepository.saveAndFlush(email);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the email using partial update
        Email partialUpdatedEmail = new Email();
        partialUpdatedEmail.setId(email.getId());

        partialUpdatedEmail.status(UPDATED_STATUS);

        restEmailMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, partialUpdatedEmail.getId())
                    .with(csrf())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(partialUpdatedEmail))
            )
            .andExpect(status().isOk());

        // Validate the Email in the database

        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertEmailUpdatableFieldsEquals(createUpdateProxyForBean(partialUpdatedEmail, email), getPersistedEmail(email));
    }

    @Test
    @Transactional
    void fullUpdateEmailWithPatch() throws Exception {
        // Initialize the database
        insertedEmail = emailRepository.saveAndFlush(email);

        long databaseSizeBeforeUpdate = getRepositoryCount();

        // Update the email using partial update
        Email partialUpdatedEmail = new Email();
        partialUpdatedEmail.setId(email.getId());

        partialUpdatedEmail
            .emailAddress(UPDATED_EMAIL_ADDRESS)
            .content(UPDATED_CONTENT)
            .variablesJson(UPDATED_VARIABLES_JSON)
            .status(UPDATED_STATUS)
            .sentAt(UPDATED_SENT_AT);

        restEmailMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, partialUpdatedEmail.getId())
                    .with(csrf())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(partialUpdatedEmail))
            )
            .andExpect(status().isOk());

        // Validate the Email in the database

        assertSameRepositoryCount(databaseSizeBeforeUpdate);
        assertEmailUpdatableFieldsEquals(partialUpdatedEmail, getPersistedEmail(partialUpdatedEmail));
    }

    @Test
    @Transactional
    void patchNonExistingEmail() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        email.setId(longCount.incrementAndGet());

        // Create the Email
        EmailDTO emailDTO = emailMapper.toDto(email);

        // If the entity doesn't have an ID, it will throw BadRequestAlertException
        restEmailMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, emailDTO.getId())
                    .with(csrf())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(emailDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Email in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void patchWithIdMismatchEmail() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        email.setId(longCount.incrementAndGet());

        // Create the Email
        EmailDTO emailDTO = emailMapper.toDto(email);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restEmailMockMvc
            .perform(
                patch(ENTITY_API_URL_ID, longCount.incrementAndGet())
                    .with(csrf())
                    .contentType("application/merge-patch+json")
                    .content(om.writeValueAsBytes(emailDTO))
            )
            .andExpect(status().isBadRequest());

        // Validate the Email in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void patchWithMissingIdPathParamEmail() throws Exception {
        long databaseSizeBeforeUpdate = getRepositoryCount();
        email.setId(longCount.incrementAndGet());

        // Create the Email
        EmailDTO emailDTO = emailMapper.toDto(email);

        // If url ID doesn't match entity ID, it will throw BadRequestAlertException
        restEmailMockMvc
            .perform(patch(ENTITY_API_URL).with(csrf()).contentType("application/merge-patch+json").content(om.writeValueAsBytes(emailDTO)))
            .andExpect(status().isMethodNotAllowed());

        // Validate the Email in the database
        assertSameRepositoryCount(databaseSizeBeforeUpdate);
    }

    @Test
    @Transactional
    void deleteEmail() throws Exception {
        // Initialize the database
        insertedEmail = emailRepository.saveAndFlush(email);

        long databaseSizeBeforeDelete = getRepositoryCount();

        // Delete the email
        restEmailMockMvc
            .perform(delete(ENTITY_API_URL_ID, email.getId()).with(csrf()).accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isNoContent());

        // Validate the database contains one less item
        assertDecrementedRepositoryCount(databaseSizeBeforeDelete);
    }

    protected long getRepositoryCount() {
        return emailRepository.count();
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

    protected Email getPersistedEmail(Email email) {
        return emailRepository.findById(email.getId()).orElseThrow();
    }

    protected void assertPersistedEmailToMatchAllProperties(Email expectedEmail) {
        assertEmailAllPropertiesEquals(expectedEmail, getPersistedEmail(expectedEmail));
    }

    protected void assertPersistedEmailToMatchUpdatableProperties(Email expectedEmail) {
        assertEmailAllUpdatablePropertiesEquals(expectedEmail, getPersistedEmail(expectedEmail));
    }
}
