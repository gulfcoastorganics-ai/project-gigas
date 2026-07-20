export class OcrProviderRegistry {
  constructor() {
    this.providers = new Map();
  }

  register(providerId, provider) {
    this.providers.set(providerId, provider);
  }

  get(providerId) {
    return this.providers.get(providerId);
  }

  list() {
    return Array.from(this.providers.keys());
  }
}
