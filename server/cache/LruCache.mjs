export class LruCache {
  #max;
  #map;

  constructor(max = 10) {
    this.#max = max;
    this.#map = new Map();
  }

  get(key) {
    if (!this.#map.has(key)) return undefined;
    const value = this.#map.get(key);
    this.#map.delete(key);
    this.#map.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.#map.has(key)) this.#map.delete(key);
    this.#map.set(key, value);
    if (this.#map.size > this.#max) {
      this.#map.delete(this.#map.keys().next().value);
    }
  }

  invalidate(key) {
    this.#map.delete(key);
  }

  clear() {
    this.#map.clear();
  }
}
