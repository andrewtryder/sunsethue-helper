const bannerTimeouts = new Map();

export function showBanner(bannerElement, message, duration = 5000) {
  if (!bannerElement) return;
  if (bannerTimeouts.has(bannerElement)) {
    clearTimeout(bannerTimeouts.get(bannerElement));
  }
  bannerElement.textContent = message;
  bannerElement.classList.add("show");
  bannerElement.style.display = "block";

  if (duration > 0) {
    const timeoutId = setTimeout(() => {
      bannerElement.classList.remove("show");
      bannerElement.style.display = "none";
      bannerTimeouts.delete(bannerElement);
    }, duration);
    bannerTimeouts.set(bannerElement, timeoutId);
  }
}

export function hideBanner(bannerElement) {
  if (!bannerElement) return;
  if (bannerTimeouts.has(bannerElement)) {
    clearTimeout(bannerTimeouts.get(bannerElement));
    bannerTimeouts.delete(bannerElement);
  }
  bannerElement.style.display = "none";
  bannerElement.textContent = "";
}
