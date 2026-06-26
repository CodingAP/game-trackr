export function readViewportAspectRatio(
  widthInput: HTMLInputElement,
  heightInput: HTMLInputElement,
  resolveFallback?: () => number | null,
): number | null {
  const width = Number(widthInput.value);
  const height = Number(heightInput.value);
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return width / height;
  }
  return resolveFallback?.() ?? null;
}

export function readMediaNaturalAspectRatio(media: HTMLImageElement | HTMLVideoElement | null): number | null {
  if (!media) return null;

  const width =
    media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const height =
    media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;

  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    return null;
  }

  return width / height;
}

export function wireViewportAspectRatio(
  container: HTMLElement,
  options: {
    widthField: string;
    heightField: string;
    lockField: string;
    widthUnitField?: string;
    heightUnitField?: string;
    resolveAspectRatio?: () => number | null;
  },
): { cleanup: () => void; refreshAspectRatio: () => void } {
  const widthInput = container.querySelector(options.widthField) as HTMLInputElement | null;
  const heightInput = container.querySelector(options.heightField) as HTMLInputElement | null;
  const lockInput = container.querySelector(options.lockField) as HTMLInputElement | null;
  if (!widthInput || !heightInput || !lockInput) {
    return { cleanup: () => {}, refreshAspectRatio: () => {} };
  }

  const readUnit = (selector?: string): string =>
    selector ? (container.querySelector(selector) as HTMLSelectElement | null)?.value ?? 'px' : 'px';

  const isPercentWidth = (): boolean => readUnit(options.widthUnitField) === '%';

  // Percentage width stores a proportional box: sync the numeric width/height ratio.
  // Pixel autofill requires both dimensions to use px.
  const unitsAllowSync = (): boolean => {
    if (isPercentWidth()) return true;
    return readUnit(options.widthUnitField) !== '%' && readUnit(options.heightUnitField) !== '%';
  };

  const syncPercentWidthMode = () => {
    if (!isPercentWidth()) {
      lockInput.disabled = false;
      return;
    }

    lockInput.checked = true;
    lockInput.disabled = true;

    const heightUnitSelect = options.heightUnitField
      ? (container.querySelector(options.heightUnitField) as HTMLSelectElement | null)
      : null;
    if (heightUnitSelect && heightUnitSelect.value !== '%') {
      heightUnitSelect.value = '%';
    }
  };

  let aspectRatio: number | null = null;

  const captureAspectRatio = (): number | null => {
    const nextRatio =
      options.resolveAspectRatio?.() ??
      readViewportAspectRatio(widthInput, heightInput);
    aspectRatio = nextRatio;
    return nextRatio;
  };

  syncPercentWidthMode();

  if (lockInput.checked) {
    captureAspectRatio();
  }

  const syncHeightFromWidth = () => {
    if (!lockInput.checked) return;
    if (!unitsAllowSync()) return;
    if (!aspectRatio) {
      captureAspectRatio();
    }
    if (!aspectRatio) return;

    const width = Number(widthInput.value);
    if (!Number.isFinite(width) || width <= 0) return;
    heightInput.value = String(Math.max(1, Math.round(width / aspectRatio)));
  };

  const syncWidthFromHeight = () => {
    if (!lockInput.checked) return;
    if (!unitsAllowSync()) return;
    if (!aspectRatio) {
      captureAspectRatio();
    }
    if (!aspectRatio) return;

    const height = Number(heightInput.value);
    if (!Number.isFinite(height) || height <= 0) return;
    widthInput.value = String(Math.max(1, Math.round(height * aspectRatio)));
  };

  const onWidthUnitChange = () => {
    syncPercentWidthMode();
    if (isPercentWidth()) {
      captureAspectRatio();
      syncHeightFromWidth();
    }
  };

  const onLockChange = () => {
    if (isPercentWidth()) return;
    if (lockInput.checked) {
      if (!unitsAllowSync()) {
        aspectRatio = null;
        return;
      }
      captureAspectRatio();
      const width = Number(widthInput.value);
      const height = Number(heightInput.value);
      const hasWidth = Number.isFinite(width) && width > 0;
      const hasHeight = Number.isFinite(height) && height > 0;

      if (hasWidth && !hasHeight) {
        syncHeightFromWidth();
      } else if (hasHeight && !hasWidth) {
        syncWidthFromHeight();
      }
    } else {
      aspectRatio = null;
    }
  };

  const widthUnitSelect = options.widthUnitField
    ? (container.querySelector(options.widthUnitField) as HTMLSelectElement | null)
    : null;
  const heightUnitSelect = options.heightUnitField
    ? (container.querySelector(options.heightUnitField) as HTMLSelectElement | null)
    : null;

  lockInput.addEventListener('change', onLockChange);
  widthInput.addEventListener('input', syncHeightFromWidth);
  heightInput.addEventListener('input', syncWidthFromHeight);
  widthUnitSelect?.addEventListener('change', onWidthUnitChange);
  heightUnitSelect?.addEventListener('change', onWidthUnitChange);

  return {
    refreshAspectRatio: captureAspectRatio,
    cleanup: () => {
      lockInput.removeEventListener('change', onLockChange);
      widthInput.removeEventListener('input', syncHeightFromWidth);
      heightInput.removeEventListener('input', syncWidthFromHeight);
      widthUnitSelect?.removeEventListener('change', onWidthUnitChange);
      heightUnitSelect?.removeEventListener('change', onWidthUnitChange);
    },
  };
}
