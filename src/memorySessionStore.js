import session from 'express-session';

const Store = session.Store;

/** In-memory store that keeps Buffers intact (default store JSON-clones sessions). */
export class MemorySessionStore extends Store {
  constructor() {
    super();
    this.sessions = Object.create(null);
  }

  get(sid, callback) {
    callback(null, this.sessions[sid] ?? null);
  }

  set(sid, sessionData, callback) {
    this.sessions[sid] = sessionData;
    callback(null);
  }

  destroy(sid, callback) {
    delete this.sessions[sid];
    callback(null);
  }

  touch(sid, sessionData, callback) {
    this.sessions[sid] = sessionData;
    callback(null);
  }
}
