package mailmerge.service.criteria;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.function.BiFunction;
import java.util.function.Function;
import org.assertj.core.api.Condition;
import org.junit.jupiter.api.Test;

class HeadingCriteriaTest {

    @Test
    void newHeadingCriteriaHasAllFiltersNullTest() {
        var headingCriteria = new HeadingCriteria();
        assertThat(headingCriteria).is(criteriaFiltersAre(filter -> filter == null));
    }

    @Test
    void headingCriteriaFluentMethodsCreatesFiltersTest() {
        var headingCriteria = new HeadingCriteria();

        setAllFilters(headingCriteria);

        assertThat(headingCriteria).is(criteriaFiltersAre(filter -> filter != null));
    }

    @Test
    void headingCriteriaCopyCreatesNullFilterTest() {
        var headingCriteria = new HeadingCriteria();
        var copy = headingCriteria.copy();

        assertThat(headingCriteria).satisfies(
            criteria ->
                assertThat(criteria).is(
                    copyFiltersAre(copy, (a, b) -> (a == null || a instanceof Boolean) ? a == b : (a != b && a.equals(b)))
                ),
            criteria -> assertThat(criteria).isEqualTo(copy),
            criteria -> assertThat(criteria).hasSameHashCodeAs(copy)
        );

        assertThat(copy).satisfies(
            criteria -> assertThat(criteria).is(criteriaFiltersAre(filter -> filter == null)),
            criteria -> assertThat(criteria).isEqualTo(headingCriteria)
        );
    }

    @Test
    void headingCriteriaCopyDuplicatesEveryExistingFilterTest() {
        var headingCriteria = new HeadingCriteria();
        setAllFilters(headingCriteria);

        var copy = headingCriteria.copy();

        assertThat(headingCriteria).satisfies(
            criteria ->
                assertThat(criteria).is(
                    copyFiltersAre(copy, (a, b) -> (a == null || a instanceof Boolean) ? a == b : (a != b && a.equals(b)))
                ),
            criteria -> assertThat(criteria).isEqualTo(copy),
            criteria -> assertThat(criteria).hasSameHashCodeAs(copy)
        );

        assertThat(copy).satisfies(
            criteria -> assertThat(criteria).is(criteriaFiltersAre(filter -> filter != null)),
            criteria -> assertThat(criteria).isEqualTo(headingCriteria)
        );
    }

    @Test
    void toStringVerifier() {
        var headingCriteria = new HeadingCriteria();

        assertThat(headingCriteria).hasToString("HeadingCriteria{}");
    }

    private static void setAllFilters(HeadingCriteria headingCriteria) {
        headingCriteria.id();
        headingCriteria.name();
        headingCriteria.projectId();
        headingCriteria.distinct();
    }

    private static Condition<HeadingCriteria> criteriaFiltersAre(Function<Object, Boolean> condition) {
        return new Condition<>(
            criteria ->
                condition.apply(criteria.getId()) &&
                condition.apply(criteria.getName()) &&
                condition.apply(criteria.getProjectId()) &&
                condition.apply(criteria.getDistinct()),
            "every filter matches"
        );
    }

    private static Condition<HeadingCriteria> copyFiltersAre(HeadingCriteria copy, BiFunction<Object, Object, Boolean> condition) {
        return new Condition<>(
            criteria ->
                condition.apply(criteria.getId(), copy.getId()) &&
                condition.apply(criteria.getName(), copy.getName()) &&
                condition.apply(criteria.getProjectId(), copy.getProjectId()) &&
                condition.apply(criteria.getDistinct(), copy.getDistinct()),
            "every filter matches"
        );
    }
}
