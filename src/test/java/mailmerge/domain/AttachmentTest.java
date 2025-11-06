package mailmerge.domain;

import static mailmerge.domain.AttachmentTestSamples.*;
import static mailmerge.domain.EmailTestSamples.*;
import static mailmerge.domain.ProjectTestSamples.*;
import static org.assertj.core.api.Assertions.assertThat;

import mailmerge.web.rest.TestUtil;
import org.junit.jupiter.api.Test;

class AttachmentTest {

    @Test
    void equalsVerifier() throws Exception {
        TestUtil.equalsVerifier(Attachment.class);
        Attachment attachment1 = getAttachmentSample1();
        Attachment attachment2 = new Attachment();
        assertThat(attachment1).isNotEqualTo(attachment2);

        attachment2.setId(attachment1.getId());
        assertThat(attachment1).isEqualTo(attachment2);

        attachment2 = getAttachmentSample2();
        assertThat(attachment1).isNotEqualTo(attachment2);
    }

    @Test
    void projectTest() {
        Attachment attachment = getAttachmentRandomSampleGenerator();
        Project projectBack = getProjectRandomSampleGenerator();

        attachment.setProject(projectBack);
        assertThat(attachment.getProject()).isEqualTo(projectBack);

        attachment.project(null);
        assertThat(attachment.getProject()).isNull();
    }

    @Test
    void emailTest() {
        Attachment attachment = getAttachmentRandomSampleGenerator();
        Email emailBack = getEmailRandomSampleGenerator();

        attachment.setEmail(emailBack);
        assertThat(attachment.getEmail()).isEqualTo(emailBack);

        attachment.email(null);
        assertThat(attachment.getEmail()).isNull();
    }
}
