import ms from 'ms';

export const sleep = (time: string) =>
  new Promise((r) => setTimeout(r, ms(time)));

export type Listener<T> = (value: T) => void;
export abstract class Listenable<T> {
  private listeners: Listener<T>[] = [];
  private lastValue!: T;

  public subscribe(listener: Listener<T>): () => void {
    this.listeners.push(listener);
    listener(this.lastValue);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  protected notifyListeners(value: T) {
    this.lastValue = value;
    this.listeners.forEach((l) => l(value));
  }
}
