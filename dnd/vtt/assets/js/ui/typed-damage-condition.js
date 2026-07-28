const FALLBACK_DAMAGE_TYPES = [
  'untyped',
  'acid',
  'cold',
  'corruption',
  'fire',
  'holy',
  'lightning',
  'poison',
  'psychic',
  'sonic',
];

function titleCase(value) {
  return String(value || '')
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function getCanonicalDamageTypes(registry = globalThis?.window?.AbilityAutomationPrimitives) {
  const source = Array.isArray(registry?.DAMAGE_TYPES)
    ? registry.DAMAGE_TYPES
    : FALLBACK_DAMAGE_TYPES;
  return Array.from(new Set(
    source
      .map((value) => String(value || '').trim().toLowerCase())
      .filter((value) => value && value !== 'untyped')
  ));
}

export function getWeaknessDamageTypeOptions(registry) {
  return [
    { value: 'all', label: 'All damage' },
    ...getCanonicalDamageTypes(registry).map((value) => ({ value, label: titleCase(value) })),
  ];
}

export function getManualDamageTypeOptions(registry) {
  return [
    { value: '', label: 'Untyped' },
    ...getCanonicalDamageTypes(registry).map((value) => ({ value, label: titleCase(value) })),
  ];
}

export function buildDamageWeaknessCondition(input = {}, registry) {
  const amount = Number(input.amount);
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, error: 'Enter a whole-number weakness amount greater than 0.' };
  }

  const rawDamageType = String(input.damageType || '').trim().toLowerCase();
  const supported = getCanonicalDamageTypes(registry);
  const universal = rawDamageType === 'all';
  if (!universal && !supported.includes(rawDamageType)) {
    return { ok: false, error: 'Choose a damage type.' };
  }

  const duration = input.duration === 'end-of-turn' ? 'end-of-turn' : 'save-ends';
  const condition = {
    name: 'damageWeakness',
    amount,
    duration: { type: duration },
  };
  if (!universal) {
    condition.damageType = rawDamageType;
  }
  return { ok: true, condition };
}

export function formatDamageWeaknessLabel(condition = {}) {
  const amount = Number(condition.amount);
  const damageType = String(condition.damageType || '').trim().toLowerCase();
  const typeLabel = damageType ? titleCase(damageType) : 'All damage';
  return `${typeLabel} weakness${Number.isFinite(amount) && amount > 0 ? ` ${amount}` : ''}`;
}

export function calculateConditionDamageAdjustments(conditions, damageType) {
  const requestedType = String(damageType || '').trim().toLowerCase();
  return (Array.isArray(conditions) ? conditions : []).reduce(
    (totals, condition) => {
      const name = String(condition?.name || '').trim().toLowerCase();
      if (name !== 'damageweakness' && name !== 'damageimmunity') return totals;
      const amount = Number.parseInt(condition.amount, 10);
      if (!Number.isFinite(amount) || amount <= 0) return totals;
      const conditionType = String(condition.damageType || '').trim().toLowerCase();
      if (conditionType && conditionType !== requestedType) return totals;
      if (name === 'damageweakness') totals.weakness += amount;
      else totals.immunity += amount;
      return totals;
    },
    { weakness: 0, immunity: 0 }
  );
}

export function createDamageWeaknessDialogController(options = {}) {
  let closed = false;
  return {
    get closed() {
      return closed;
    },
    submit(values = {}) {
      if (closed) return { ok: false, error: 'Weakness dialog is closed.' };
      const result = buildDamageWeaknessCondition({
        ...values,
        duration: options.duration,
      }, options.registry);
      if (!result.ok) return result;
      closed = true;
      options.onSubmit?.(result.condition);
      return result;
    },
    cancel() {
      if (closed) return false;
      closed = true;
      options.onCancel?.();
      return true;
    },
  };
}

export function openDamageWeaknessDialog(options = {}) {
  const documentRef = options.document ?? globalThis.document;
  if (!documentRef?.body) return null;

  const overlay = documentRef.createElement('div');
  overlay.className = 'vtt-custom-condition-overlay';
  overlay.dataset.damageWeaknessOverlay = 'true';
  const damageTypeOptions = [
    '<option value="">Choose a damage type</option>',
    ...getWeaknessDamageTypeOptions(options.registry)
      .map(({ value, label }) => `<option value="${value}">${label}</option>`),
  ].join('');
  overlay.innerHTML = `
    <div class="vtt-custom-condition-dialog" role="dialog" aria-modal="true" aria-labelledby="vtt-damage-weakness-title">
      <form class="vtt-custom-condition-dialog__form" data-damage-weakness-form novalidate>
        <header class="vtt-custom-condition-dialog__header">
          <h3 id="vtt-damage-weakness-title" class="vtt-custom-condition-dialog__title">Add Weakness</h3>
          <button type="button" class="vtt-custom-condition-dialog__close" data-damage-weakness-cancel aria-label="Cancel weakness">&times;</button>
        </header>
        <div class="vtt-custom-condition-dialog__body">
          <label class="vtt-custom-condition-dialog__label" for="vtt-damage-weakness-type">Damage type</label>
          <select id="vtt-damage-weakness-type" class="vtt-custom-condition-dialog__input" data-damage-weakness-type required>
            ${damageTypeOptions}
          </select>
          <label class="vtt-custom-condition-dialog__label" for="vtt-damage-weakness-amount">Weakness amount</label>
          <input id="vtt-damage-weakness-amount" class="vtt-custom-condition-dialog__input" type="number" min="1" step="1" inputmode="numeric" data-damage-weakness-amount required />
          <p class="vtt-custom-condition-dialog__error" data-damage-weakness-error hidden></p>
        </div>
        <footer class="vtt-custom-condition-dialog__footer">
          <button type="button" class="btn vtt-custom-condition-dialog__button" data-damage-weakness-cancel>Cancel</button>
          <button type="submit" class="btn btn--primary vtt-custom-condition-dialog__button">Apply</button>
        </footer>
      </form>
    </div>`;
  documentRef.body.appendChild(overlay);

  const form = overlay.querySelector('[data-damage-weakness-form]');
  const typeSelect = overlay.querySelector('[data-damage-weakness-type]');
  const amountInput = overlay.querySelector('[data-damage-weakness-amount]');
  const errorElement = overlay.querySelector('[data-damage-weakness-error]');
  const controller = createDamageWeaknessDialogController(options);

  const close = (cancelled = false) => {
    if (controller.closed) return;
    if (cancelled) controller.cancel();
    documentRef.removeEventListener('keydown', handleKeydown, true);
    overlay.remove();
  };
  const showError = (message) => {
    errorElement.textContent = message;
    errorElement.hidden = false;
  };
  const handleSubmit = (event) => {
    event.preventDefault();
    const result = controller.submit({
      damageType: typeSelect.value,
      amount: amountInput.value,
    });
    if (!result.ok) {
      showError(result.error);
      return;
    }
    documentRef.removeEventListener('keydown', handleKeydown, true);
    overlay.remove();
  };
  const handleCancel = (event) => {
    event?.preventDefault();
    close(true);
  };
  const handleKeydown = (event) => {
    if (event.key === 'Escape') handleCancel(event);
  };

  form.addEventListener('submit', handleSubmit);
  overlay.querySelectorAll('[data-damage-weakness-cancel]').forEach((button) => {
    button.addEventListener('click', handleCancel);
  });
  documentRef.addEventListener('keydown', handleKeydown, true);
  typeSelect.addEventListener('change', () => {
    errorElement.hidden = true;
    errorElement.textContent = '';
  });
  amountInput.addEventListener('input', () => {
    errorElement.hidden = true;
    errorElement.textContent = '';
  });
  globalThis.setTimeout?.(() => typeSelect.focus(), 0);

  return {
    overlay,
    form,
    typeSelect,
    amountInput,
    close: () => {
      if (!controller.closed) {
        controller.cancel();
      }
      documentRef.removeEventListener('keydown', handleKeydown, true);
      overlay.remove();
    },
  };
}
