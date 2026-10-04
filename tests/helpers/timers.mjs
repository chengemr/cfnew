import { flush } from './transports.mjs';

export function timerRuntime() {
  let now = 1_000_000;
  let id = 0;
  const pending = new Map();
  const schedule = (callback, delay, interval) => {
    pending.set(++id, { callback, delay, interval, at: now + delay });
    return id;
  };
  class Clock extends Date { static now() { return now; } }
  return {
    pending,
    globals: {
      Date: Clock,
      setTimeout: (callback, delay = 0) => schedule(callback, delay, false),
      setInterval: (callback, delay) => schedule(callback, delay, true),
      clearTimeout: handle => pending.delete(handle),
      clearInterval: handle => pending.delete(handle)
    },
    async tick(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const next = [...pending].filter(([, task]) => task.at <= end)
          .sort(([, left], [, right]) => left.at - right.at)[0];
        if (!next) break;
        const [handle, task] = next;
        now = task.at;
        if (task.interval) task.at += task.delay;
        else pending.delete(handle);
        task.callback();
        await flush();
      }
      now = end;
      await flush();
    }
  };
}
