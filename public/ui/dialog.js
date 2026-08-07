export function initEmailSuccessModal() {
  const modal = document.getElementById("email-success-modal");
  const message = document.getElementById("email-success-modal-message");
  const closeBtn = document.getElementById("email-success-modal-close");
  const doneBtn = document.getElementById("email-success-modal-done");

  function show() {
    if (!modal) return;
    if (message) {
      message.textContent = "Success! Test report email sent.";
    }
    modal.classList.remove("hidden");
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    doneBtn?.focus();
  }

  function hide() {
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function isOpen() {
    return modal?.classList.contains("is-open") ?? false;
  }

  closeBtn?.addEventListener("click", hide);
  doneBtn?.addEventListener("click", hide);
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) hide();
  });

  return { show, hide, isOpen };
}
