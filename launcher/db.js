/* アプリ入れ：保存場所（IndexedDB）の共通部品。画面とサービスワーカーの両方で使う */
const APPIRE_DB = {
  name: "appire", ver: 1,
  open(){
    return new Promise((ok, ng) => {
      const r = indexedDB.open(this.name, this.ver);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("apps")) db.createObjectStore("apps", {keyPath: "id"});
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ng(r.error);
    });
  },
  async tx(stores, mode, fn){
    const db = await this.open();
    return new Promise((ok, ng) => {
      const t = db.transaction(stores, mode);
      let out;
      Promise.resolve(fn(t)).then(v => { out = v; });
      t.oncomplete = () => { db.close(); ok(out); };
      t.onerror = () => { db.close(); ng(t.error); };
      t.onabort = () => { db.close(); ng(t.error || new Error("abort")); };
    });
  },
  req(r){ return new Promise((ok, ng) => { r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); }); },
  getApp(id){ return this.tx(["apps"], "readonly", t => this.req(t.objectStore("apps").get(id))); },
  allApps(){ return this.tx(["apps"], "readonly", t => this.req(t.objectStore("apps").getAll())); },
  getFile(key){ return this.tx(["files"], "readonly", t => this.req(t.objectStore("files").get(key))); },
  fileKey(id, build, path){ return id + "@" + build + "/" + path; }
};
