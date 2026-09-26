// Saves the newest value without ever running two saves at once, and without
// making the caller wait between changes. While a save is in flight, later
// values replace each other: only the most recent one is sent next, so a quick
// series of changes ends with the last one on the server and costs at most two
// requests. `send` must report its own errors (it is not expected to throw; if it
// does, that value is dropped and the next one is still sent).
export function createSerialSaver<T>(send: (value: T) => Promise<void>) {
  let next: { value: T } | null = null;
  let running: Promise<void> | null = null;

  async function drain() {
    while (next) {
      const { value } = next;
      next = null;
      try {
        await send(value);
      } catch {
        // dropped; the loop carries on with whatever is newer
      }
    }
  }

  return {
    // Resolves once nothing is left to send.
    push(value: T): Promise<void> {
      next = { value };
      if (!running) running = drain().finally(() => { running = null; });
      return running;
    },
    get busy() {
      return running !== null;
    },
  };
}
