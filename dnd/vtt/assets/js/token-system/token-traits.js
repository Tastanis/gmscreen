export function createTokenTraitRegistry({ resolvers = [] } = {}) {
  const registeredResolvers = Array.isArray(resolvers) ? [...resolvers] : [];

  function register(resolver) {
    if (typeof resolver === 'function') {
      registeredResolvers.push(resolver);
    }
  }

  async function resolveTrait(traitName, placement, context = {}) {
    const normalizedName = normalizeTraitName(traitName);
    if (!normalizedName) {
      return null;
    }

    for (const resolver of registeredResolvers) {
      const result = await resolver(normalizedName, placement, context);
      if (result !== null && result !== undefined) {
        return result;
      }
    }

    return null;
  }

  return {
    register,
    resolveTrait,
  };
}

export function normalizeTraitName(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
