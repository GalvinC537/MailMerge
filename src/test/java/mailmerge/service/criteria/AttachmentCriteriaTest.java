package mailmerge.service.criteria;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.function.BiFunction;
import java.util.function.Function;
import org.assertj.core.api.Condition;
import org.junit.jupiter.api.Test;

class AttachmentCriteriaTest {

    @Test
    void newAttachmentCriteriaHasAllFiltersNullTest() {
        var attachmentCriteria = new AttachmentCriteria();
        assertThat(attachmentCriteria).is(criteriaFiltersAre(filter -> filter == null));
    }

    @Test
    void attachmentCriteriaFluentMethodsCreatesFiltersTest() {
        var attachmentCriteria = new AttachmentCriteria();

        setAllFilters(attachmentCriteria);

        assertThat(attachmentCriteria).is(criteriaFiltersAre(filter -> filter != null));
    }

    @Test
    void attachmentCriteriaCopyCreatesNullFilterTest() {
        var attachmentCriteria = new AttachmentCriteria();
        var copy = attachmentCriteria.copy();

        assertThat(attachmentCriteria).satisfies(
            criteria ->
                assertThat(criteria).is(
                    copyFiltersAre(copy, (a, b) -> (a == null || a instanceof Boolean) ? a == b : (a != b && a.equals(b)))
                ),
            criteria -> assertThat(criteria).isEqualTo(copy),
            criteria -> assertThat(criteria).hasSameHashCodeAs(copy)
        );

        assertThat(copy).satisfies(
            criteria -> assertThat(criteria).is(criteriaFiltersAre(filter -> filter == null)),
            criteria -> assertThat(criteria).isEqualTo(attachmentCriteria)
        );
    }

    @Test
    void attachmentCriteriaCopyDuplicatesEveryExistingFilterTest() {
        var attachmentCriteria = new AttachmentCriteria();
        setAllFilters(attachmentCriteria);

        var copy = attachmentCriteria.copy();

        assertThat(attachmentCriteria).satisfies(
            criteria ->
                assertThat(criteria).is(
                    copyFiltersAre(copy, (a, b) -> (a == null || a instanceof Boolean) ? a == b : (a != b && a.equals(b)))
                ),
            criteria -> assertThat(criteria).isEqualTo(copy),
            criteria -> assertThat(criteria).hasSameHashCodeAs(copy)
        );

        assertThat(copy).satisfies(
            criteria -> assertThat(criteria).is(criteriaFiltersAre(filter -> filter != null)),
            criteria -> assertThat(criteria).isEqualTo(attachmentCriteria)
        );
    }

    @Test
    void toStringVerifier() {
        var attachmentCriteria = new AttachmentCriteria();

        assertThat(attachmentCriteria).hasToString("AttachmentCriteria{}");
    }

    private static void setAllFilters(AttachmentCriteria attachmentCriteria) {
        attachmentCriteria.id();
        attachmentCriteria.content();
        attachmentCriteria.projectId();
        attachmentCriteria.emailId();
        attachmentCriteria.distinct();
    }

    private static Condition<AttachmentCriteria> criteriaFiltersAre(Function<Object, Boolean> condition) {
        return new Condition<>(
            criteria ->
                condition.apply(criteria.getId()) &&
                condition.apply(criteria.getContent()) &&
                condition.apply(criteria.getProjectId()) &&
                condition.apply(criteria.getEmailId()) &&
                condition.apply(criteria.getDistinct()),
            "every filter matches"
        );
    }

    private static Condition<AttachmentCriteria> copyFiltersAre(AttachmentCriteria copy, BiFunction<Object, Object, Boolean> condition) {
        return new Condition<>(
            criteria ->
                condition.apply(criteria.getId(), copy.getId()) &&
                condition.apply(criteria.getContent(), copy.getContent()) &&
                condition.apply(criteria.getProjectId(), copy.getProjectId()) &&
                condition.apply(criteria.getEmailId(), copy.getEmailId()) &&
                condition.apply(criteria.getDistinct(), copy.getDistinct()),
            "every filter matches"
        );
    }
}
