// Simple semaphore implementation for coordination
export class Semaphore {
  private current: number;
  private readonly max: number;
  private readonly queue: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];

  constructor(max: number) {
    this.max = max;
    this.current = 0;
  }

  async acquire(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.current < this.max) {
        this.current++;
        resolve();
      } else {
        this.queue.push({ resolve, reject });
      }
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const { resolve } = this.queue.shift()!;
      resolve();
    } else {
      this.current--;
    }
  }
}