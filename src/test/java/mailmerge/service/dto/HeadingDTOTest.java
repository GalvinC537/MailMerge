package mailmerge.service.dto;

import static org.assertj.core.api.Assertions.assertThat;

import mailmerge.web.rest.TestUtil;
import org.junit.jupiter.api.Test;

class HeadingDTOTest {

    @Test
    void dtoEqualsVerifier() throws Exception {
        TestUtil.equalsVerifier(HeadingDTO.class);
        HeadingDTO headingDTO1 = new HeadingDTO();
        headingDTO1.setId(1L);
        HeadingDTO headingDTO2 = new HeadingDTO();
        assertThat(headingDTO1).isNotEqualTo(headingDTO2);
        headingDTO2.setId(headingDTO1.getId());
        assertThat(headingDTO1).isEqualTo(headingDTO2);
        headingDTO2.setId(2L);
        assertThat(headingDTO1).isNotEqualTo(headingDTO2);
        headingDTO1.setId(null);
        assertThat(headingDTO1).isNotEqualTo(headingDTO2);
    }
}
