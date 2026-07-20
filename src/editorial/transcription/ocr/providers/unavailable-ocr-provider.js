export class UnavailableOcrProvider {
  constructor(reason) {
    this.id = 'unavailable';
    this.reason = reason;
  }

  async availability() {
    return { available: false, reason: this.reason };
  }

  async recognize(input, options) {
    return {
      status: 'blocked',
      reason: this.reason
    };
  }
}
