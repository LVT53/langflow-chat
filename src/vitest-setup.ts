import { vi } from 'vitest';
import '@testing-library/jest-dom';

if (!Element.prototype.animate) {
	Object.defineProperty(Element.prototype, 'animate', {
		writable: true,
		value: vi.fn(() => ({
			finished: Promise.resolve(),
			cancel: vi.fn(),
			finish: vi.fn(),
			play: vi.fn(),
			pause: vi.fn(),
			reverse: vi.fn(),
			commitStyles: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})),
	});
}

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
	writable: true,
	value: vi.fn(() => ({
		clearRect: vi.fn(),
		drawImage: vi.fn(),
		fillRect: vi.fn(),
		fillText: vi.fn(),
		getImageData: vi.fn(),
		putImageData: vi.fn(),
		measureText: vi.fn(() => ({ width: 0 })),
		restore: vi.fn(),
		save: vi.fn(),
		scale: vi.fn(),
		setTransform: vi.fn(),
		stroke: vi.fn(),
		translate: vi.fn(),
	})),
});

if (!URL.createObjectURL) {
	Object.defineProperty(URL, 'createObjectURL', {
		writable: true,
		value: vi.fn(() => 'blob:mock-url'),
	});
}

if (!URL.revokeObjectURL) {
	Object.defineProperty(URL, 'revokeObjectURL', {
		writable: true,
		value: vi.fn(),
	});
}
