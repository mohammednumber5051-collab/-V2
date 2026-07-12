/**
 * SyncEngine — Lightweight event bus for UI refresh coordination.
 *
 * Bug fixed: the previous emit() called DATA_CHANGED listeners twice:
 *   once via the specific event handler (when event === 'DATA_CHANGED'),
 *   and again via the unconditional extra call at the end of emit().
 *
 * Fix: the general DATA_CHANGED re-emit is now skipped when the event
 * being emitted IS DATA_CHANGED.
 */

type SyncEvent =
    | "ENTRY_CREATED"
    | "ENTRY_UPDATED"
    | "ENTRY_DELETED"
    | "CASHBOX_UPDATED"
    | "CUSTOMER_UPDATED"
    | "DATA_CHANGED";

type Listener = () => void;

class SyncEngine {
    private listeners: Map<SyncEvent, Listener[]> = new Map();

    subscribe(event: SyncEvent, listener: Listener): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(listener);
        return () => this.unsubscribe(event, listener);
    }

    unsubscribe(event: SyncEvent, listener: Listener): void {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            this.listeners.set(event, eventListeners.filter((l) => l !== listener));
        }
    }

    emit(event: SyncEvent): void {
        // Fire the specific event's listeners
        this.listeners.get(event)?.forEach((l) => l());

        // Also fire the general DATA_CHANGED listeners — but ONLY when the
        // event itself is not already DATA_CHANGED (prevents double-fire).
        if (event !== "DATA_CHANGED") {
            this.listeners.get("DATA_CHANGED")?.forEach((l) => l());
        }
    }
}

export const syncEngine = new SyncEngine();
