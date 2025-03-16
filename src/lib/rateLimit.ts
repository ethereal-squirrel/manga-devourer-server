class RateLimiter {
  private queue: (() => Promise<void>)[] = [];
  private processing = false;
  private lastRequestTime = 0;
  private requestsThisMinute = 0;
  private minuteStart = Date.now();

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();

      if (now - this.minuteStart >= 60000) {
        this.requestsThisMinute = 0;
        this.minuteStart = now;
      }

      if (this.requestsThisMinute >= 45) {
        const waitTime = this.minuteStart + 60000 - now;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      if (now - this.lastRequestTime < 400) {
        await new Promise(resolve => setTimeout(resolve, 400));
        continue;
      }

      const request = this.queue.shift();
      if (request) {
        this.lastRequestTime = Date.now();
        this.requestsThisMinute++;
        await request();
      }
    }

    this.processing = false;
  }

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }
}

export const jikanLimiter = new RateLimiter();
