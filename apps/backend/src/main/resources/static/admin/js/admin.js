// Potriv admin — optional progressive enhancement only. The UI is fully
// functional without JavaScript. Submits list filter forms automatically when
// a <select> filter changes, for convenience.
(function () {
    "use strict";
    document.querySelectorAll("form.admin-filters select").forEach(function (select) {
        select.addEventListener("change", function () {
            if (select.form) {
                select.form.submit();
            }
        });
    });
})();
