package mailmerge.domain;

import static mailmerge.domain.EmailTestSamples.*;
import static mailmerge.domain.HeadingTestSamples.*;
import static mailmerge.domain.ProjectTestSamples.*;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;
import mailmerge.web.rest.TestUtil;
import org.junit.jupiter.api.Test;

class ProjectTest {

    @Test
    void equalsVerifier() throws Exception {
        TestUtil.equalsVerifier(Project.class);
        Project project1 = getProjectSample1();
        Project project2 = new Project();
        assertThat(project1).isNotEqualTo(project2);

        project2.setId(project1.getId());
        assertThat(project1).isEqualTo(project2);

        project2 = getProjectSample2();
        assertThat(project1).isNotEqualTo(project2);
    }

    @Test
    void emailsTest() {
        Project project = getProjectRandomSampleGenerator();
        Email emailBack = getEmailRandomSampleGenerator();

        project.addEmails(emailBack);
        assertThat(project.getEmails()).containsOnly(emailBack);
        assertThat(emailBack.getProject()).isEqualTo(project);

        project.removeEmails(emailBack);
        assertThat(project.getEmails()).doesNotContain(emailBack);
        assertThat(emailBack.getProject()).isNull();

        project.emails(new HashSet<>(Set.of(emailBack)));
        assertThat(project.getEmails()).containsOnly(emailBack);
        assertThat(emailBack.getProject()).isEqualTo(project);

        project.setEmails(new HashSet<>());
        assertThat(project.getEmails()).doesNotContain(emailBack);
        assertThat(emailBack.getProject()).isNull();
    }

    @Test
    void headingsTest() {
        Project project = getProjectRandomSampleGenerator();
        Heading headingBack = getHeadingRandomSampleGenerator();

        project.addHeadings(headingBack);
        assertThat(project.getHeadings()).containsOnly(headingBack);
        assertThat(headingBack.getProject()).isEqualTo(project);

        project.removeHeadings(headingBack);
        assertThat(project.getHeadings()).doesNotContain(headingBack);
        assertThat(headingBack.getProject()).isNull();

        project.headings(new HashSet<>(Set.of(headingBack)));
        assertThat(project.getHeadings()).containsOnly(headingBack);
        assertThat(headingBack.getProject()).isEqualTo(project);

        project.setHeadings(new HashSet<>());
        assertThat(project.getHeadings()).doesNotContain(headingBack);
        assertThat(headingBack.getProject()).isNull();
    }
}
