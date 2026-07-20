import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export class TesseractCliProvider {
  constructor(config = {}) {
    this.id = 'tesseract';
    this.psm = config.psm || '6';
    this.lang = config.lang || 'eng';
  }

  async availability() {
    // In production, check if `tesseract` binary exists
    return { available: false, reason: 'Tesseract not installed in this environment' };
  }

  async recognize(input, options) {
    return {
      status: 'failed',
      reason: 'Tesseract not installed'
    };
  }
}
