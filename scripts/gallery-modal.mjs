export function isGalleryModalOpen(expected) {
  return Array.from(document.querySelectorAll('[role="dialog"], [role="document"]'))
    .some((element) => globalThis.galleryVisible(element) && element.textContent.includes(expected));
}
