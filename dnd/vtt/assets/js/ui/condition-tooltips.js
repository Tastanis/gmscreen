/**
 * Condition tooltips.
 *
 * Extracted from dnd/vtt/assets/js/ui/board-interactions.js as part of the
 * phase 4 refactor. Do not add unrelated code to this file.
 *
 * Attaches a reusable hover/focus tooltip DOM element to arbitrary targets
 * (combat tracker labels, condition banners, etc.). Each target is registered
 * with a set of condition entries; the tooltip element is created once and
 * shared across all targets.
 *
 * See docs/vtt-sync-refactor/phase-4-extraction-targets.md target #2 for the
 * design history.
 */

export function createConditionTooltips({
  getConditionDefinition,
  windowRef = typeof window === 'undefined' ? undefined : window,
  documentRef = typeof document === 'undefined' ? undefined : document,
} = {}) {
  const registry = new WeakMap();
  let element = null;
  let activeTarget = null;

  function normalizeEntries(source) {
    if (!source) {
      return [];
    }

    const rawEntries = Array.isArray(source) ? source : [source];
    const entries = [];

    rawEntries.forEach((entry) => {
      if (!entry) {
        return;
      }

      if (typeof entry === 'string') {
        const definition = getConditionDefinition?.(entry);
        if (definition?.description) {
          entries.push({ name: definition.name, description: definition.description });
        }
        return;
      }

      if (typeof entry === 'object') {
        const name = typeof entry.name === 'string' ? entry.name.trim() : '';
        if (!name) {
          return;
        }

        const definition = getConditionDefinition?.(name);
        if (definition?.description) {
          entries.push({ name: definition.name, description: definition.description });
        } else if (typeof entry.description === 'string' && entry.description.trim()) {
          entries.push({ name, description: entry.description.trim() });
        }
      }
    });

    return entries;
  }

  function ensureElement() {
    if (element || !documentRef) {
      return element;
    }

    if (!documentRef.body) {
      return null;
    }

    const el = documentRef.createElement('div');
    el.id = 'vtt-condition-tooltip';
    el.className = 'vtt-condition-tooltip';
    el.setAttribute('role', 'tooltip');
    el.hidden = true;
    documentRef.body.appendChild(el);
    element = el;
    return element;
  }

  function render(entries) {
    const tooltip = ensureElement();
    if (!tooltip) {
      return;
    }

    tooltip.replaceChildren();
    tooltip.removeAttribute('aria-label');
    entries.forEach((entry, index) => {
      if (!entry?.name || !entry?.description) {
        return;
      }
      const item = documentRef.createElement('div');
      item.className = 'vtt-condition-tooltip__item';

      const nameElement = documentRef.createElement('div');
      nameElement.className = 'vtt-condition-tooltip__name';
      nameElement.textContent = entry.name;
      item.appendChild(nameElement);

      const descriptionElement = documentRef.createElement('div');
      descriptionElement.className = 'vtt-condition-tooltip__description';
      descriptionElement.textContent = entry.description;
      item.appendChild(descriptionElement);

      tooltip.appendChild(item);
      if (index === 0) {
        tooltip.setAttribute('aria-label', `${entry.name}: ${entry.description}`);
      }
    });
  }

  function position(target) {
    const tooltip = ensureElement();
    if (!tooltip || !target || typeof target.getBoundingClientRect !== 'function') {
      return;
    }

    const { clientWidth: viewportWidth, clientHeight: viewportHeight } =
      documentRef.documentElement || documentRef.body;

    tooltip.style.left = '0px';
    tooltip.style.top = '0px';
    tooltip.hidden = false;
    tooltip.style.visibility = 'hidden';
    tooltip.dataset.visible = 'true';

    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
    let top = targetRect.bottom + 8;

    const margin = 8;
    if (left + tooltipRect.width > viewportWidth - margin) {
      left = viewportWidth - tooltipRect.width - margin;
    }
    if (left < margin) {
      left = margin;
    }

    if (top + tooltipRect.height > viewportHeight - margin) {
      top = Math.max(margin, targetRect.top - tooltipRect.height - 8);
    }

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.visibility = '';
  }

  function show(target, entries) {
    const tooltipEntries = normalizeEntries(entries);
    if (!tooltipEntries.length) {
      return;
    }

    const tooltip = ensureElement();
    if (!tooltip) {
      return;
    }

    render(tooltipEntries);
    position(target);
    activeTarget = target;
    target?.setAttribute('aria-describedby', 'vtt-condition-tooltip');
  }

  function hide(target) {
    if (target && activeTarget && target !== activeTarget) {
      return;
    }

    const tooltip = ensureElement();
    if (!tooltip) {
      return;
    }

    tooltip.hidden = true;
    tooltip.removeAttribute('data-visible');
    tooltip.style.visibility = '';
    activeTarget?.removeAttribute('aria-describedby');
    activeTarget = null;
  }

  function attach(target, entries, options = {}) {
    if (!target) {
      return;
    }

    const tooltipEntries = normalizeEntries(entries);
    const delay =
      typeof options.delay === 'number' && options.delay >= 0 ? options.delay : 400;

    if (!tooltipEntries.length) {
      detach(target);
      return;
    }

    let registryEntry = registry.get(target);
    if (!registryEntry) {
      registryEntry = {
        entries: tooltipEntries,
        delay,
        showTimeoutId: null,
      };
      registry.set(target, registryEntry);

      registryEntry.handlePointerEnter = () => {
        windowRef.clearTimeout(registryEntry.showTimeoutId);
        registryEntry.showTimeoutId = windowRef.setTimeout(() => {
          show(target, registryEntry.entries);
        }, registryEntry.delay);
      };

      registryEntry.handlePointerLeave = () => {
        windowRef.clearTimeout(registryEntry.showTimeoutId);
        hide(target);
      };

      registryEntry.handlePointerDown = () => {
        windowRef.clearTimeout(registryEntry.showTimeoutId);
        hide(target);
      };

      registryEntry.handleFocus = () => {
        windowRef.clearTimeout(registryEntry.showTimeoutId);
        registryEntry.showTimeoutId = windowRef.setTimeout(() => {
          show(target, registryEntry.entries);
        }, Math.min(registryEntry.delay, 200));
      };

      registryEntry.handleBlur = () => {
        windowRef.clearTimeout(registryEntry.showTimeoutId);
        hide(target);
      };

      target.addEventListener('pointerenter', registryEntry.handlePointerEnter);
      target.addEventListener('pointerleave', registryEntry.handlePointerLeave);
      target.addEventListener('pointerdown', registryEntry.handlePointerDown);
      target.addEventListener('pointercancel', registryEntry.handlePointerLeave);
      target.addEventListener('focus', registryEntry.handleFocus);
      target.addEventListener('blur', registryEntry.handleBlur);
    }

    registryEntry.entries = tooltipEntries;
    registryEntry.delay = delay;
  }

  function detach(target) {
    if (!target) {
      return;
    }

    const registryEntry = registry.get(target);
    if (!registryEntry) {
      return;
    }

    target.removeEventListener('pointerenter', registryEntry.handlePointerEnter);
    target.removeEventListener('pointerleave', registryEntry.handlePointerLeave);
    target.removeEventListener('pointerdown', registryEntry.handlePointerDown);
    target.removeEventListener('pointercancel', registryEntry.handlePointerLeave);
    target.removeEventListener('focus', registryEntry.handleFocus);
    target.removeEventListener('blur', registryEntry.handleBlur);
    windowRef.clearTimeout(registryEntry.showTimeoutId);
    if (activeTarget === target) {
      hide(target);
    }
    registry.delete(target);
  }

  return { attach, detach };
}
