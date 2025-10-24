package mailmerge.service.mapper;

import static mailmerge.domain.HeadingAsserts.*;
import static mailmerge.domain.HeadingTestSamples.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class HeadingMapperTest {

    private HeadingMapper headingMapper;

    @BeforeEach
    void setUp() {
        headingMapper = new HeadingMapperImpl();
    }

    @Test
    void shouldConvertToDtoAndBack() {
        var expected = getHeadingSample1();
        var actual = headingMapper.toEntity(headingMapper.toDto(expected));
        assertHeadingAllPropertiesEquals(expected, actual);
    }
}
