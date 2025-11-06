package mailmerge.service.criteria;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.function.BiFunction;
import java.util.function.Function;
import org.assertj.core.api.Condition;
import org.junit.jupiter.api.Test;

class ProjectCriteriaTest {

    @Test
    void newProjectCriteriaHasAllFiltersNullTest() {
        var projectCriteria = new ProjectCriteria();
        assertThat(projectCriteria).is(criteriaFiltersAre(filter -> filter == null));
    }

    @Test
    void projectCriteriaFluentMethodsCreatesFiltersTest() {
        var projectCriteria = new ProjectCriteria();

        setAllFilters(projectCriteria);

        assertThat(projectCriteria).is(criteriaFiltersAre(filter -> filter != null));
    }

    @Test
    void projectCriteriaCopyCreatesNullFilterTest() {
        var projectCriteria = new ProjectCriteria();
        var copy = projectCriteria.copy();

        assertThat(projectCriteria).satisfies(
            criteria ->
                assertThat(criteria).is(
                    copyFiltersAre(copy, (a, b) -> (a == null || a instanceof Boolean) ? a == b : (a != b && a.equals(b)))
                ),
            criteria -> assertThat(criteria).isEqualTo(copy),
            criteria -> assertThat(criteria).hasSameHashCodeAs(copy)
        );

        assertThat(copy).satisfies(
            criteria -> assertThat(criteria).is(criteriaFiltersAre(filter -> filter == null)),
            criteria -> assertThat(criteria).isEqualTo(projectCriteria)
        );
    }

    @Test
    void projectCriteriaCopyDuplicatesEveryExistingFilterTest() {
        var projectCriteria = new ProjectCriteria();
        setAllFilters(projectCriteria);

        var copy = projectCriteria.copy();

        assertThat(projectCriteria).satisfies(
            criteria ->
                assertThat(criteria).is(
                    copyFiltersAre(copy, (a, b) -> (a == null || a instanceof Boolean) ? a == b : (a != b && a.equals(b)))
                ),
            criteria -> assertThat(criteria).isEqualTo(copy),
            criteria -> assertThat(criteria).hasSameHashCodeAs(copy)
        );

        assertThat(copy).satisfies(
            criteria -> assertThat(criteria).is(criteriaFiltersAre(filter -> filter != null)),
            criteria -> assertThat(criteria).isEqualTo(projectCriteria)
        );
    }

    @Test
    void toStringVerifier() {
        var projectCriteria = new ProjectCriteria();

        assertThat(projectCriteria).hasToString("ProjectCriteria{}");
    }

    private static void setAllFilters(ProjectCriteria projectCriteria) {
        projectCriteria.id();
        projectCriteria.name();
        projectCriteria.spreadsheetLink();
        projectCriteria.status();
        projectCriteria.sentAt();
        projectCriteria.headingsId();
        projectCriteria.attachmentsId();
        projectCriteria.userId();
        projectCriteria.emailsId();
        projectCriteria.distinct();
    }

    private static Condition<ProjectCriteria> criteriaFiltersAre(Function<Object, Boolean> condition) {
        return new Condition<>(
            criteria ->
                condition.apply(criteria.getId()) &&
                condition.apply(criteria.getName()) &&
                condition.apply(criteria.getSpreadsheetLink()) &&
                condition.apply(criteria.getStatus()) &&
                condition.apply(criteria.getSentAt()) &&
                condition.apply(criteria.getHeadingsId()) &&
                condition.apply(criteria.getAttachmentsId()) &&
                condition.apply(criteria.getUserId()) &&
                condition.apply(criteria.getEmailsId()) &&
                condition.apply(criteria.getDistinct()),
            "every filter matches"
        );
    }

    private static Condition<ProjectCriteria> copyFiltersAre(ProjectCriteria copy, BiFunction<Object, Object, Boolean> condition) {
        return new Condition<>(
            criteria ->
                condition.apply(criteria.getId(), copy.getId()) &&
                condition.apply(criteria.getName(), copy.getName()) &&
                condition.apply(criteria.getSpreadsheetLink(), copy.getSpreadsheetLink()) &&
                condition.apply(criteria.getStatus(), copy.getStatus()) &&
                condition.apply(criteria.getSentAt(), copy.getSentAt()) &&
                condition.apply(criteria.getHeadingsId(), copy.getHeadingsId()) &&
                condition.apply(criteria.getAttachmentsId(), copy.getAttachmentsId()) &&
                condition.apply(criteria.getUserId(), copy.getUserId()) &&
                condition.apply(criteria.getEmailsId(), copy.getEmailsId()) &&
                condition.apply(criteria.getDistinct(), copy.getDistinct()),
            "every filter matches"
        );
    }
}
