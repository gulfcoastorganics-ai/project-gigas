export class StageRegistry {
  constructor() {
    this.stages = new Map();
  }

  register(stageId, implementation) {
    this.stages.set(stageId, implementation);
  }

  get(stageId) {
    return this.stages.get(stageId);
  }
}
