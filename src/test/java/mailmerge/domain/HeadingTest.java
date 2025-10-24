package mailmerge.domain;

import static mailmerge.domain.HeadingTestSamples.*;
import static mailmerge.domain.ProjectTestSamples.*;
import static org.assertj.core.api.Assertions.assertThat;

import mailmerge.web.rest.TestUtil;
import org.junit.jupiter.api.Test;

class HeadingTest {

    @Test
    void equalsVerifier() throws Exception {
        TestUtil.equalsVerifier(Heading.class);
        Heading heading1 = getHeadingSample1();
        Heading heading2 = new Heading();
        assertThat(heading1).isNotEqualTo(heading2);

        heading2.setId(heading1.getId());
        assertThat(heading1).isEqualTo(heading2);

        heading2 = getHeadingSample2();
        assertThat(heading1).isNotEqualTo(heading2);
    }

    @Test
    void projectTest() {
        Heading heading = getHeadingRandomSampleGenerator();
        Project projectBack = getProjectRandomSampleGenerator();

        heading.setProject(projectBack);
        assertThat(heading.getProject()).isEqualTo(projectBack);

        heading.project(null);
        assertThat(heading.getProject()).isNull();
    }
}
