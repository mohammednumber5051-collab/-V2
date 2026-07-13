type SyncEvent = 'ENTRY_CREATED' | 'ENTRY_UPDATED' | 'ENTRY_DELETED' | 'CASHBOX_UPDATED' | 'CUSTOMER_UPDATED' | 'DATA_CHANGED';

type Listener = () => void;

class SyncEngine {
    private listeners: Map<SyncEvent, Listener[]> = new Map();

    subscribe(event: SyncEvent, listener: Listener) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)?.push(listener);
        return () => this.unsubscribe(event, listener);
    }

    unsubscribe(event: SyncEvent, listener: Listener) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            this.listeners.set(event, eventListeners.filter(l => l !== listener));
        }
    }

    emit(event: SyncEvent) {
        this.listeners.get(event)?.forEach(listener => listener());
        // Always emit a general change event
        this.listeners.get('DATA_CHANGED')?.forEach(listener => listener());
    }
}

export const syncEngine = new SyncEngine();
