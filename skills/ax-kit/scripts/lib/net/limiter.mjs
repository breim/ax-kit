export function createLimiter({ concurrency, requests, posts, deadlineMs, now = Date.now }) {
  const startedAt = now();
  const waiting = [];
  let active = 0;
  let made = 0;
  let postsMade = 0;

  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };

  const acquire = () => {
    if (active < concurrency) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      waiting.push(() => {
        active += 1;
        resolve();
      });
    });
  };

  const refusal = (method) => {
    if (now() - startedAt > deadlineMs) return 'deadline';
    if (made >= requests) return 'budget';
    if (method === 'POST' && postsMade >= posts) return 'budget';
    return null;
  };

  const count = (method) => {
    made += 1;
    if (method === 'POST') postsMade += 1;
  };

  async function run(method, task) {
    await acquire();
    try {
      const refused = refusal(method);
      if (refused) return { refused };
      count(method);
      return { value: await task() };
    } finally {
      release();
    }
  }

  return { run, stats: () => ({ made, budget: requests }) };
}
