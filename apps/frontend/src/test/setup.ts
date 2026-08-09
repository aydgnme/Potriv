import "@testing-library/jest-dom/vitest";

/**
 * jsdom implements `<dialog>` as an element but not as a dialog: `showModal` and
 * `close` are missing, and a closed dialog is not hidden.
 *
 * This shim is the smallest thing that makes the element behave the way the
 * browser does for the parts a test can observe — `open` reflects whether it was
 * shown, and a closed dialog is genuinely hidden, so a test cannot pass by
 * finding text in a dialog nobody opened.
 */
if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
  }

  if (!HTMLDialogElement.prototype.show) {
    HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
      this.open = true;
    };
  }

  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    };
  }
}

/**
 * A closed dialog's contents are not on the page. jsdom applies no user-agent
 * stylesheet, so this supplies the one rule that decides it.
 */
const style = document.createElement("style");
style.textContent = "dialog:not([open]) { display: none; }";
document.head.append(style);
