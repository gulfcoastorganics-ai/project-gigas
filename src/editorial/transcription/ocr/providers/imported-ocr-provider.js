export class ImportedOcrProvider {
  constructor() {
    this.id = 'imported';
  }

  async availability() {
    return { available: true };
  }

  async recognize(input, options) {
    // Logic to look up imported result
    return { status: 'succeeded', text: 'IMPORTED_TEXT' };
  }
}
