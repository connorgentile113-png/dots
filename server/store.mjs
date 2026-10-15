export class FirestoreStore {
  constructor(db) { this.db = db; }
  async get(path) { const d = await this.db.doc(path).get(); return d.exists ? { ...d.data(), id: d.id } : null; }
  async set(path, value) { await this.db.doc(path).set(value, { merge: true }); }
  async remove(path) { await this.db.doc(path).delete(); }
  async list(path, limit = 100) { const q = await this.db.collection(path).limit(limit).get(); return q.docs.map(d => ({ ...d.data(), id: d.id, path: d.ref.path })); }
  async query(name, filters, limit = 30, group = false) {
    try {
      let q = group ? this.db.collectionGroup(name) : this.db.collection(name);
      for (const [key, op, value] of filters) q = q.where(key, op, value);
      const r = await q.limit(limit).get(); return r.docs.map(d => ({ ...d.data(), id: d.id, path: d.ref.path }));
    } catch (e) {
      if (!group || e.code !== 9) throw e;
      const users = await this.list('users', 30), results = [];
      for (const u of users.filter(u => u.enabled)) {
        const docs = await this.list(`users/${u.id}/${name}`, 100);
        for (const d of docs) {
          if (filters.every(([k, op, v]) => op === '==' ? d[k] === v : op === '<=' ? d[k] <= v : op === 'in' ? v.includes(d[k]) : false)) results.push(d);
        }
      }
      return results.slice(0, limit);
    }
  }
  async atomic(path, callback) {
    return this.db.runTransaction(async tx => {
      const ref = this.db.doc(path), snap = await tx.get(ref);
      const result = callback(snap.exists ? snap.data() : null);
      if (result?.value) tx.set(ref, result.value, { merge: true });
      return result?.result;
    });
  }
}

export class MemoryStore {
  constructor() { this.data = new Map(); }
  async get(path) { const d = this.data.get(path); return d ? structuredClone({ ...d, id: path.split('/').at(-1) }) : null; }
  async set(path, value) { this.data.set(path, { ...this.data.get(path), ...structuredClone(value) }); }
  async remove(path) { this.data.delete(path); }
  async list(path, limit = 100) { return [...this.data].filter(([p]) => p.startsWith(path + '/') && p.split('/').length === path.split('/').length + 1).slice(0, limit).map(([p,d]) => structuredClone({ ...d, id: p.split('/').at(-1), path:p })); }
  async query(name, filters, limit = 30, group = false) {
    return [...this.data].filter(([p,d]) => (group ? p.split('/').at(-2) === name : p.startsWith(name + '/') && p.split('/').length === name.split('/').length + 1) && filters.every(([k,op,v]) => op === '==' ? d[k] === v : op === '<=' ? d[k] <= v : op === 'in' ? v.includes(d[k]) : false)).slice(0,limit).map(([p,d]) => structuredClone({ ...d,id:p.split('/').at(-1),path:p }));
  }
  async atomic(path, callback) { const r = callback(structuredClone(this.data.get(path) || null)); if (r?.value) this.data.set(path, { ...this.data.get(path), ...structuredClone(r.value) }); return r?.result; }
}
