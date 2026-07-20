export class OcrRunner {
  constructor(registry) {
    this.registry = registry;
  }

  async run(input, options) {
    const providerId = options.provider || 'unavailable';
    const provider = this.registry.get(providerId);

    if (!provider) {
      return { status: 'blocked', reason: `Provider ${providerId} not found` };
    }

    return await provider.recognize(input, options);
  }
}
