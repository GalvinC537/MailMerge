package mailmerge.domain;

import static mailmerge.domain.AttachmentTestSamples.*;
import static mailmerge.domain.EmailTestSamples.*;
import static mailmerge.domain.ProjectTestSamples.*;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;
import mailmerge.web.rest.TestUtil;
import org.junit.jupiter.api.Test;

class EmailTest {

    @Test
    void equalsVerifier() throws Exception {
        TestUtil.equalsVerifier(Email.class);
        Email email1 = getEmailSample1();
        Email email2 = new Email();
        assertThat(email1).isNotEqualTo(email2);

        email2.setId(email1.getId());
        assertThat(email1).isEqualTo(email2);

        email2 = getEmailSample2();
        assertThat(email1).isNotEqualTo(email2);
    }

    @Test
    void attachmentsTest() {
        Email email = getEmailRandomSampleGenerator();
        Attachment attachmentBack = getAttachmentRandomSampleGenerator();

        email.addAttachments(attachmentBack);
        assertThat(email.getAttachments()).containsOnly(attachmentBack);
        assertThat(attachmentBack.getEmail()).isEqualTo(email);

        email.removeAttachments(attachmentBack);
        assertThat(email.getAttachments()).doesNotContain(attachmentBack);
        assertThat(attachmentBack.getEmail()).isNull();

        email.attachments(new HashSet<>(Set.of(attachmentBack)));
        assertThat(email.getAttachments()).containsOnly(attachmentBack);
        assertThat(attachmentBack.getEmail()).isEqualTo(email);

        email.setAttachments(new HashSet<>());
        assertThat(email.getAttachments()).doesNotContain(attachmentBack);
        assertThat(attachmentBack.getEmail()).isNull();
    }

    @Test
    void projectTest() {
        Email email = getEmailRandomSampleGenerator();
        Project projectBack = getProjectRandomSampleGenerator();

        email.setProject(projectBack);
        assertThat(email.getProject()).isEqualTo(projectBack);

        email.project(null);
        assertThat(email.getProject()).isNull();
    }
}
