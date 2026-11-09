// The help and FAQ dialog.
import { $, wireDialog } from "../lib/dom.js";

const $faqDialog = $<HTMLDialogElement>("faqDialog");
const openFaq = () => $faqDialog.showModal();
$<HTMLButtonElement>("helpToggle").addEventListener("click", openFaq);
$<HTMLButtonElement>("aboutLink").addEventListener("click", openFaq);
// The version in the footer is the short form; the dialog has the rest, so send people there.
$("footerVersion").addEventListener("click", () => {
  openFaq();
  $("buildSection").scrollIntoView({ block: "nearest" });
});
wireDialog($faqDialog);
