package me.aydgn.potriv.admin.support;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

/**
 * Pagination normalization. These are the exact values a hand-edited admin URL
 * can carry, so the contract is asserted directly on the helper rather than
 * inferred from a rendered page.
 */
class AdminPagingTest {

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "abc", "-1", "-999", "1;drop table users",
        "<script>alert(1)</script>", "99999999999", "1.5", "0x10", " 1 2 "})
    void unusablePageValuesBecomeTheFirstPage(String raw) {
        assertThat(AdminPaging.page(raw)).isZero();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "abc", "0", "-1", "-999", "1;drop", "<script>",
        "99999999999", "2.5"})
    void unusableSizeValuesBecomeTheDefault(String raw) {
        assertThat(AdminPaging.size(raw)).isEqualTo(AdminPaging.DEFAULT_SIZE);
    }

    @Test
    void usableValuesAreHonoured() {
        assertThat(AdminPaging.page("0")).isZero();
        assertThat(AdminPaging.page("7")).isEqualTo(7);
        assertThat(AdminPaging.page(" 3 ")).isEqualTo(3);
        assertThat(AdminPaging.size("1")).isEqualTo(1);
        assertThat(AdminPaging.size("50")).isEqualTo(50);
        assertThat(AdminPaging.size(String.valueOf(AdminPaging.MAX_SIZE)))
            .isEqualTo(AdminPaging.MAX_SIZE);
    }

    @Test
    void oversizedPagesAreClampedToTheMaximum() {
        assertThat(AdminPaging.size("101")).isEqualTo(AdminPaging.MAX_SIZE);
        assertThat(AdminPaging.size("999999")).isEqualTo(AdminPaging.MAX_SIZE);
        assertThat(AdminPaging.size(String.valueOf(Integer.MAX_VALUE)))
            .isEqualTo(AdminPaging.MAX_SIZE);
    }

    /**
     * A far-past-the-end page is a legitimate request that simply renders empty.
     * The largest index that parses is {@code Integer.MAX_VALUE}, and Spring
     * computes the offset in {@code long} arithmetic, so it cannot overflow.
     */
    @Test
    void aFarPageIsAcceptedAndCannotOverflowTheOffset() {
        Pageable pageable = AdminPaging.of(
            String.valueOf(Integer.MAX_VALUE), "100", Sort.unsorted());

        assertThat(pageable.getPageNumber()).isEqualTo(Integer.MAX_VALUE);
        assertThat(pageable.getOffset()).isEqualTo((long) Integer.MAX_VALUE * 100);
    }

    @Test
    void pageableCombinesBothNormalizations() {
        Pageable pageable = AdminPaging.of("-4", "999999", Sort.by("createdAt"));

        assertThat(pageable.getPageNumber()).isZero();
        assertThat(pageable.getPageSize()).isEqualTo(AdminPaging.MAX_SIZE);
        assertThat(pageable.getSort()).isEqualTo(Sort.by("createdAt"));
    }

    /**
     * Pagination links retain the size only when one was asked for, and always in
     * its normalized form — so a hostile value can never reach a rendered link.
     */
    @Test
    void retainedSizeIsNormalizedOrAbsent() {
        assertThat(AdminPaging.retainedSize(null)).isNull();
        assertThat(AdminPaging.retainedSize("  ")).isNull();
        assertThat(AdminPaging.retainedSize("50")).isEqualTo("50");
        assertThat(AdminPaging.retainedSize("999999"))
            .isEqualTo(String.valueOf(AdminPaging.MAX_SIZE));
        assertThat(AdminPaging.retainedSize("<script>alert(1)</script>"))
            .isEqualTo(String.valueOf(AdminPaging.DEFAULT_SIZE));
    }
}
