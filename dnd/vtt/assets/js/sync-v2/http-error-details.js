// Diagnostic headers only: never retain response HTML, URLs or credentials.
export function attachHttpErrorDetails(error, response) {
  for (const [property, header] of [['cfRay', 'CF-Ray'], ['requestId', 'X-Request-ID']]) {
    const value = response?.headers?.get?.(header);
    if (typeof value === 'string' && /^[A-Za-z0-9._:-]{1,160}$/.test(value)) {
      error[property] = value;
    }
  }
  return error;
}
