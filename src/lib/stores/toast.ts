import { writable } from 'svelte/store';

export interface ToastMessage {
	message: string;
	visible: boolean;
}

const initialState: ToastMessage = {
	message: '',
	visible: false
};

export const toast = writable<ToastMessage>(initialState);

export function showToast(message: string, duration = 3000) {
	toast.set({ message, visible: true });
	
	// Auto-dismiss after duration
	setTimeout(() => {
		toast.update(current => ({ ...current, visible: false }));
	}, duration);
}