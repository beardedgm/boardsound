const storage = (() => {
    const DB_NAME = 'soundboardDB';
    const STORE_NAME = 'files';
    let dbPromise = null;

    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => {
                request.result.createObjectStore(STORE_NAME);
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => {
                console.error('IndexedDB open error', request.error);
                reject(request.error);
            };
        });
        return dbPromise;
    }

    async function put(key, blob) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(blob, key);
            tx.oncomplete = () => resolve(key);
            tx.onerror = () => {
                console.error('IndexedDB put error', tx.error);
                reject(tx.error);
            };
        });
    }

    async function get(key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => {
                console.error('IndexedDB get error', req.error);
                reject(req.error);
            };
        });
    }

    async function remove(key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => {
                console.error('IndexedDB remove error', tx.error);
                reject(tx.error);
            };
        });
    }

    return { put, get, remove };
})();

