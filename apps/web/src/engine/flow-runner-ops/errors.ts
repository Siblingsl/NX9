export class ReviewGateBlockedError extends Error {
  readonly pending: number[];

  constructor(pending: number[]) {
    super(`关键帧审阅未通过：镜头 ${pending.join(', ')} 尚未批准`);
    this.name = 'ReviewGateBlockedError';
    this.pending = pending;
  }
}

export class DirectorRunBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectorRunBlockedError';
  }
}
