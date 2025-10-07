const MAX_ZOOM_MULTIPLIER = 10;

const fallbackApi = {
  hasImage: () => false,
  async exportToken() {
    return null;
  },
  reset() {},
};

export function initializeTokenMaker(moduleRoot) {
  const makerRoot = moduleRoot?.querySelector('[data-module="vtt-token-maker"]');
  if (!makerRoot) return fallbackApi;

  const preview = makerRoot.querySelector('[data-token-preview]');
  const placeholder = makerRoot.querySelector('[data-token-placeholder]');
  const image = makerRoot.querySelector('[data-token-image]');
  const dropzone = makerRoot.querySelector('[data-token-dropzone]');
  const fileInput = makerRoot.querySelector('[data-token-input]');
  const browseButton = makerRoot.querySelector('[data-action="browse-token-image"]');

  if (!preview || !image || !fileInput) {
    return fallbackApi;
  }

  const state = {
    scale: 1,
    minScale: 1,
    offsetX: 0,
    offsetY: 0,
    hasImage: false,
  };

  let objectUrl = null;
  let isPanning = false;
  let lastPoint = { x: 0, y: 0 };
  let dragDepth = 0;

  const applyTransform = () => {
    image.style.setProperty('--token-maker-scale', String(state.scale));
    image.style.setProperty('--token-maker-offset-x', `${state.offsetX}px`);
    image.style.setProperty('--token-maker-offset-y', `${state.offsetY}px`);
  };

  const setHasImage = (hasImage) => {
    state.hasImage = hasImage;
    makerRoot.classList.toggle('token-maker--has-image', hasImage);
    if (hasImage) {
      image.hidden = false;
      placeholder?.setAttribute('aria-hidden', 'true');
    } else {
      image.hidden = true;
      placeholder?.setAttribute('aria-hidden', 'false');
    }
  };

  const resetPosition = (scale) => {
    state.scale = scale;
    state.minScale = scale;
    state.offsetX = 0;
    state.offsetY = 0;
    applyTransform();
  };

  const cleanupObjectUrl = (url) => {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  };

  const loadFile = (file) => {
    if (!file || !file.type?.startsWith('image/')) {
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    const handleLoad = () => {
      const bounds = getPreviewBounds(preview);
      const naturalWidth = image.naturalWidth || 1;
      const naturalHeight = image.naturalHeight || 1;
      const coverScale = Math.max(
        bounds.width / naturalWidth,
        bounds.height / naturalHeight,
      );

      resetPosition(Number.isFinite(coverScale) && coverScale > 0 ? coverScale : 1);
      setHasImage(true);

      if (objectUrl && objectUrl !== nextUrl) {
        cleanupObjectUrl(objectUrl);
      }

      objectUrl = nextUrl;
    };

    image.addEventListener('load', handleLoad, { once: true });
    image.addEventListener(
      'error',
      () => {
        if (objectUrl && objectUrl !== nextUrl) {
          cleanupObjectUrl(objectUrl);
        }
        cleanupObjectUrl(nextUrl);
        setHasImage(false);
      },
      { once: true },
    );
    image.src = nextUrl;
  };

  const handleWheel = (event) => {
    if (!state.hasImage) return;

    event.preventDefault();

    const zoomMultiplier = Math.exp(-event.deltaY / 300);
    const maxScale = state.minScale * MAX_ZOOM_MULTIPLIER;
    const nextScale = clamp(state.scale * zoomMultiplier, state.minScale, maxScale);

    if (Math.abs(nextScale - state.scale) < 0.001) {
      return;
    }

    state.scale = nextScale;
    applyTransform();
  };

  const handlePointerMove = (event) => {
    if (!isPanning || !state.hasImage) return;

    event.preventDefault();

    if ((event.buttons & 2) === 0) {
      isPanning = false;
      return;
    }

    const dx = event.clientX - lastPoint.x;
    const dy = event.clientY - lastPoint.y;
    lastPoint = { x: event.clientX, y: event.clientY };

    state.offsetX += dx / state.scale;
    state.offsetY += dy / state.scale;
    applyTransform();
  };

  const handlePointerUp = () => {
    isPanning = false;
  };

  preview.addEventListener('wheel', handleWheel, { passive: false });
  preview.addEventListener('contextmenu', (event) => event.preventDefault());

  preview.addEventListener('mousedown', (event) => {
    if (event.button !== 2 || !state.hasImage) return;

    isPanning = true;
    lastPoint = { x: event.clientX, y: event.clientY };
    event.preventDefault();
  });

  window.addEventListener('mousemove', handlePointerMove);
  window.addEventListener('mouseup', handlePointerUp);
  preview.addEventListener('mouseleave', handlePointerUp);

  const dropTargets = [dropzone, preview].filter(Boolean);

  dropTargets.forEach((target) => {
    target.addEventListener('dragenter', (event) => {
      event.preventDefault();
      dragDepth += 1;
      dropzone?.classList.add('is-active');
    });

    target.addEventListener('dragover', (event) => {
      event.preventDefault();
    });

    target.addEventListener('dragleave', (event) => {
      if (event.currentTarget !== target) return;
      const related = event.relatedTarget;
      if (related && target.contains(related)) {
        return;
      }
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        dropzone?.classList.remove('is-active');
      }
    });

    target.addEventListener('drop', (event) => {
      event.preventDefault();
      dragDepth = 0;
      dropzone?.classList.remove('is-active');

      const file = event.dataTransfer?.files?.[0];
      loadFile(file);
    });
  });

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      loadFile(file);
      fileInput.value = '';
    });
  }

  if (browseButton) {
    browseButton.addEventListener('click', () => {
      fileInput.click();
    });
  }

  window.addEventListener('beforeunload', () => {
    cleanupObjectUrl(objectUrl);
  });

  applyTransform();
  setHasImage(false);

  return {
    hasImage: () => state.hasImage,
    async exportToken(options = {}) {
      if (!state.hasImage) {
        return null;
      }

      const size = Number.isFinite(options.size) && options.size > 0 ? options.size : 512;
      const bounds = getPreviewBounds(preview);
      const dimension = Math.max(bounds.width, bounds.height, 1);
      const ratio = size / dimension;

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;

      const context = canvas.getContext('2d');
      if (!context) {
        return null;
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';

      context.save();
      context.translate(size / 2, size / 2);
      const scaleFactor = state.scale * ratio;
      context.scale(scaleFactor, scaleFactor);
      context.translate(state.offsetX, state.offsetY);
      context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
      context.restore();

      context.globalCompositeOperation = 'destination-in';
      context.beginPath();
      context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      context.closePath();
      context.fill();

      return {
        dataUrl: canvas.toDataURL('image/png'),
        size,
      };
    },
    reset() {
      cleanupObjectUrl(objectUrl);
      objectUrl = null;
      image.removeAttribute('src');
      setHasImage(false);
      resetPosition(1);
      fileInput.value = '';
    },
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getPreviewBounds(element) {
  if (!element) {
    return { width: 220, height: 220 };
  }

  const rect = element.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { width: rect.width, height: rect.height };
  }

  const computed = window.getComputedStyle(element);
  const width = Number.parseFloat(computed.width) || element.clientWidth || 220;
  const height = Number.parseFloat(computed.height) || element.clientHeight || width || 220;
  return { width, height };
}

export default initializeTokenMaker;
