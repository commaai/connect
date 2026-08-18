export async function shareOrDownload({ blob, url, filename, mimeType, share = true }) {
  let fileBlob = blob;

  if (share && navigator.share) {
    try {
      fileBlob ||= await fetch(url).then(response => response.blob());
      const file = new File([fileBlob], filename, { type: mimeType || fileBlob.type });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }

  const objectUrl = url || URL.createObjectURL(fileBlob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (!url) URL.revokeObjectURL(objectUrl);
}
