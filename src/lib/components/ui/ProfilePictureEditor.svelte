<script lang="ts">
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	import { fade, scale } from 'svelte/transition';

	const dispatch = createEventDispatcher<{ close: void; uploaded: void }>();

	// ── State ──────────────────────────────────────────────────────────────────
	type Step = 'drop' | 'edit' | 'uploading';
	let step: Step = 'drop';

	let fileInput: HTMLInputElement;
	let canvasEl: HTMLCanvasElement;
	let dialogRef: HTMLDivElement;
	let previousFocus: HTMLElement | null = null;

	let isDraggingOver = false;
	let uploadError = '';

	// Image source
	let img: HTMLImageElement | null = null;

	// Editor state
	let rotation = 0; // 0–360 degrees, arbitrary precision
	let zoom = 1.0;
	let panX = 0;
	let panY = 0;

	// Canvas dimensions (square crop area)
	const CANVAS_SIZE = 320;
	const PREVIEW_SIZE = 64;

	// Drag tracking
	let isDragging = false;
	let dragStartX = 0;
	let dragStartY = 0;
	let dragStartPanX = 0;
	let dragStartPanY = 0;

	// Preview canvas
	let previewCanvas: HTMLCanvasElement;

	// ── Helpers ────────────────────────────────────────────────────────────────
	function loadFile(file: File) {
		if (!file.type.startsWith('image/')) {
			uploadError = 'Please select an image file.';
			return;
		}
		if (file.size > 20 * 1024 * 1024) {
			uploadError = 'File is too large. Maximum size is 20MB.';
			return;
		}
		uploadError = '';

		const reader = new FileReader();
		reader.onload = (e) => {
			const src = e.target?.result as string;
			const image = new Image();
			image.onload = () => {
				img = image;
				// Reset editor state for new image
				rotation = 0;
				zoom = 1.0;
				panX = 0;
				panY = 0;
				step = 'edit';
				setTimeout(drawCanvas, 0);
			};
			image.src = src;
		};
		reader.readAsDataURL(file);
	}

	// Compute the base scale so the image (at the given rotation) covers the W×H canvas.
	function computeBaseScale(iw: number, ih: number, angleRad: number, W: number, H: number) {
		const cos = Math.abs(Math.cos(angleRad));
		const sin = Math.abs(Math.sin(angleRad));
		const bboxW = iw * cos + ih * sin || 1;
		const bboxH = iw * sin + ih * cos || 1;
		return Math.max(W / bboxW, H / bboxH);
	}

	function drawCanvas() {
		if (!canvasEl || !img) return;
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;

		const W = CANVAS_SIZE;
		const H = CANVAS_SIZE;
		ctx.clearRect(0, 0, W, H);

		const angleRad = (rotation * Math.PI) / 180;

		ctx.save();
		ctx.translate(W / 2 + panX, H / 2 + panY);
		ctx.rotate(angleRad);
		ctx.scale(zoom, zoom);

		const baseScale = computeBaseScale(img.naturalWidth, img.naturalHeight, angleRad, W, H);
		const dw = img.naturalWidth * baseScale;
		const dh = img.naturalHeight * baseScale;
		ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
		ctx.restore();

		// Dimming mask outside crop circle (evenodd punches the circle out of the rect)
		ctx.save();
		ctx.fillStyle = 'rgba(0,0,0,0.45)';
		ctx.beginPath();
		ctx.rect(0, 0, W, H);
		ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
		ctx.fill('evenodd');
		ctx.restore();

		// Crop circle border
		ctx.save();
		ctx.strokeStyle = 'rgba(255,255,255,0.8)';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();

		drawPreview();
	}

	function drawPreview() {
		if (!previewCanvas || !img) return;
		const pctx = previewCanvas.getContext('2d');
		if (!pctx) return;

		const P = PREVIEW_SIZE;
		pctx.clearRect(0, 0, P, P);

		pctx.save();
		pctx.beginPath();
		pctx.arc(P / 2, P / 2, P / 2, 0, Math.PI * 2);
		pctx.clip();

		const ratio = P / CANVAS_SIZE;
		pctx.scale(ratio, ratio);
		pctx.drawImage(canvasEl, 0, 0);
		pctx.restore();
	}

	function rotateLeft() {
		rotation = (rotation - 90 + 360) % 360;
		drawCanvas();
	}

	function rotateRight() {
		rotation = (rotation + 90) % 360;
		drawCanvas();
	}

	function zoomOut() {
		zoom = Math.max(0.5, parseFloat((zoom - 0.1).toFixed(2)));
		drawCanvas();
	}

	function zoomIn() {
		zoom = Math.min(3, parseFloat((zoom + 0.1).toFixed(2)));
		drawCanvas();
	}

	$: if (step === 'edit' && canvasEl && img) {
		drawCanvas();
	}

	// ── Canvas drag (pan) ──────────────────────────────────────────────────────
	function onMouseDown(e: MouseEvent) {
		isDragging = true;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		dragStartPanX = panX;
		dragStartPanY = panY;
	}

	function onMouseMove(e: MouseEvent) {
		if (!isDragging) return;
		panX = dragStartPanX + (e.clientX - dragStartX);
		panY = dragStartPanY + (e.clientY - dragStartY);
		drawCanvas();
	}

	function onMouseUp() {
		isDragging = false;
	}

	function onTouchStart(e: TouchEvent) {
		const t = e.touches[0];
		isDragging = true;
		dragStartX = t.clientX;
		dragStartY = t.clientY;
		dragStartPanX = panX;
		dragStartPanY = panY;
	}

	function onTouchMove(e: TouchEvent) {
		if (!isDragging) return;
		e.preventDefault();
		const t = e.touches[0];
		panX = dragStartPanX + (t.clientX - dragStartX);
		panY = dragStartPanY + (t.clientY - dragStartY);
		drawCanvas();
	}

	function onTouchEnd() {
		isDragging = false;
	}

	// ── Upload (with compression pipeline) ─────────────────────────────────────
	async function handleUpload() {
		if (!canvasEl || !img) return;
		step = 'uploading';
		uploadError = '';

		// Draw final output to an offscreen 512×512 canvas (circle-cropped)
		const offscreen = document.createElement('canvas');
		offscreen.width = 512;
		offscreen.height = 512;
		const ctx = offscreen.getContext('2d')!;

		const angleRad = (rotation * Math.PI) / 180;
		const ratio = 512 / CANVAS_SIZE;

		ctx.save();
		ctx.beginPath();
		ctx.arc(256, 256, 256, 0, Math.PI * 2);
		ctx.clip();

		ctx.translate(256 + panX * ratio, 256 + panY * ratio);
		ctx.rotate(angleRad);
		ctx.scale(zoom, zoom);

		const baseScale = computeBaseScale(img.naturalWidth, img.naturalHeight, angleRad, 512, 512);
		const dw = img.naturalWidth * baseScale;
		const dh = img.naturalHeight * baseScale;
		ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
		ctx.restore();

		// Compress: export as WebP at quality 0.88 — regardless of input size,
		// the output is a 512×512 WebP which is typically 50–200 KB.
		offscreen.toBlob(
			async (blob) => {
				if (!blob) {
					uploadError = 'Failed to process image.';
					step = 'edit';
					return;
				}
				const formData = new FormData();
				formData.append('image', blob, 'avatar.webp');

				try {
					const res = await fetch('/api/settings/avatar', {
						method: 'POST',
						body: formData,
					});
					const json = await res.json();
					if (!res.ok) throw new Error(json.error ?? 'Upload failed');
					dispatch('uploaded');
					dispatch('close');
				} catch (e: any) {
					uploadError = e.message;
					step = 'edit';
				}
			},
			'image/webp',
			0.88
		);
	}

	// ── Drag-and-drop ──────────────────────────────────────────────────────────
	function onDragOver(e: DragEvent) {
		e.preventDefault();
		isDraggingOver = true;
	}

	function onDragLeave() {
		isDraggingOver = false;
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		isDraggingOver = false;
		const file = e.dataTransfer?.files[0];
		if (file) loadFile(file);
	}

	function onFileInput(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) loadFile(file);
	}

	// ── Keyboard & focus ───────────────────────────────────────────────────────
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			if (step !== 'uploading') dispatch('close');
		} else if (e.key === 'Tab') {
			const focusable = dialogRef?.querySelectorAll<HTMLElement>(
				'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
			);
			if (!focusable || focusable.length === 0) return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (e.shiftKey) {
				if (document.activeElement === first) {
					last.focus();
					e.preventDefault();
				}
			} else {
				if (document.activeElement === last) {
					first.focus();
					e.preventDefault();
				}
			}
		}
	}

	onMount(() => {
		previousFocus = document.activeElement as HTMLElement;
		document.body.style.overflow = 'hidden';
	});

	onDestroy(() => {
		if (previousFocus) previousFocus.focus();
		document.body.style.overflow = '';
	});
</script>

<svelte:window on:keydown={handleKeydown} on:mouseup={onMouseUp} />

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center p-md"
	transition:fade={{ duration: 150 }}
>
	<!-- Backdrop -->
	<div
		class="absolute inset-0 bg-surface-page opacity-80 backdrop-blur-sm"
		on:click={() => { if (step !== 'uploading') dispatch('close'); }}
	></div>

	<!-- Modal -->
	<div
		bind:this={dialogRef}
		role="dialog"
		aria-modal="true"
		aria-labelledby="pic-editor-title"
		tabindex="-1"
		class="relative w-full max-w-[520px] rounded-lg border border-border bg-surface-page p-lg shadow-lg"
		on:click|stopPropagation
		transition:scale={{ duration: 150, start: 0.95 }}
	>
		<h2 id="pic-editor-title" class="mb-md text-xl font-semibold text-text-primary">
			Upload Profile Photo
		</h2>

		<!-- ── Step: Drop zone ───────────────────────────────────────────── -->
		{#if step === 'drop'}
			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<div
				class="drop-zone flex cursor-pointer flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-border p-10 text-center transition-colors duration-150"
				class:drop-zone-active={isDraggingOver}
				on:dragover={onDragOver}
				on:dragleave={onDragLeave}
				on:drop={onDrop}
				on:click={() => fileInput.click()}
				role="button"
				tabindex="0"
				on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); }}
				aria-label="Upload photo drop zone"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="40"
					height="40"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="text-icon-muted"
				>
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="17 8 12 3 7 8" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</svg>
				<p class="text-sm text-text-primary font-medium">Drop an image here, or click to select</p>
				<p class="text-xs text-text-muted">JPEG, PNG, WebP, GIF, HEIC, AVIF, BMP, TIFF · max 20 MB</p>
			</div>

			<input
				bind:this={fileInput}
				type="file"
				accept="image/*,.heic,.heif,.avif,.tiff,.tif,.bmp"
				class="sr-only"
				on:change={onFileInput}
			/>

			{#if uploadError}
				<p class="mt-sm text-sm text-danger" role="alert">{uploadError}</p>
			{/if}
		{/if}

		<!-- ── Step: Edit / Uploading ─────────────────────────────────────── -->
		{#if step === 'edit' || step === 'uploading'}
			<div class="flex flex-col items-center gap-md">
				<!-- Canvas editor -->
				<div class="relative" style="width: {CANVAS_SIZE}px; height: {CANVAS_SIZE}px;">
					<canvas
						bind:this={canvasEl}
						width={CANVAS_SIZE}
						height={CANVAS_SIZE}
						class="rounded-md"
						style="cursor: {isDragging ? 'grabbing' : 'grab'};"
						on:mousedown={onMouseDown}
						on:mousemove={onMouseMove}
						on:touchstart|passive={onTouchStart}
						on:touchmove|preventDefault={onTouchMove}
						on:touchend={onTouchEnd}
					></canvas>

					{#if step === 'uploading'}
						<div
							class="absolute inset-0 flex items-center justify-center rounded-md bg-surface-page/60 backdrop-blur-sm"
						>
							<svg
								class="animate-spin text-accent"
								xmlns="http://www.w3.org/2000/svg"
								width="32"
								height="32"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path d="M21 12a9 9 0 1 1-6.219-8.56" />
							</svg>
						</div>
					{/if}
				</div>

				<!-- ── Controls ──────────────────────────────────────────────── -->
				<div class="flex w-full flex-col gap-sm" style="max-width: {CANVAS_SIZE}px;">

					<!-- Rotation row -->
					<div class="flex items-center gap-xs">
						<!-- Rotate CCW 90° -->
						<button
							type="button"
							class="btn-icon-bare flex-shrink-0"
							on:click={rotateLeft}
							disabled={step === 'uploading'}
							title="Rotate left 90°"
							aria-label="Rotate left 90°"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
								<path d="M3 3v5h5"/>
							</svg>
						</button>

						<!-- Precise rotation slider -->
						<input
							type="range"
							min="0"
							max="360"
							step="0.5"
							bind:value={rotation}
							on:input={drawCanvas}
							disabled={step === 'uploading'}
							class="rotation-slider flex-1"
							aria-label="Rotation"
						/>

						<!-- Rotate CW 90° -->
						<button
							type="button"
							class="btn-icon-bare flex-shrink-0"
							on:click={rotateRight}
							disabled={step === 'uploading'}
							title="Rotate right 90°"
							aria-label="Rotate right 90°"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
								<path d="M21 3v5h-5"/>
							</svg>
						</button>

						<!-- Degree readout -->
						<span class="degree-readout w-14 flex-shrink-0 text-right text-xs text-text-muted tabular-nums">
							{rotation.toFixed(1)}°
						</span>
					</div>

					<!-- Zoom row -->
					<div class="flex items-center gap-xs">
						<!-- Zoom out -->
						<button
							type="button"
							class="btn-icon-bare flex-shrink-0"
							on:click={zoomOut}
							disabled={step === 'uploading' || zoom <= 0.5}
							title="Zoom out"
							aria-label="Zoom out"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="11" cy="11" r="8"/>
								<line x1="21" y1="21" x2="16.65" y2="16.65"/>
								<line x1="8" y1="11" x2="14" y2="11"/>
							</svg>
						</button>

						<!-- Zoom slider -->
						<input
							type="range"
							min="0.5"
							max="3"
							step="0.05"
							bind:value={zoom}
							on:input={drawCanvas}
							disabled={step === 'uploading'}
							class="zoom-slider flex-1"
							aria-label="Zoom"
						/>

						<!-- Zoom in -->
						<button
							type="button"
							class="btn-icon-bare flex-shrink-0"
							on:click={zoomIn}
							disabled={step === 'uploading' || zoom >= 3}
							title="Zoom in"
							aria-label="Zoom in"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="11" cy="11" r="8"/>
								<line x1="21" y1="21" x2="16.65" y2="16.65"/>
								<line x1="11" y1="8" x2="11" y2="14"/>
								<line x1="8" y1="11" x2="14" y2="11"/>
							</svg>
						</button>

						<!-- Zoom % readout -->
						<span class="degree-readout w-11 flex-shrink-0 text-right text-xs text-text-muted tabular-nums">
							{Math.round(zoom * 100)}%
						</span>

						<!-- Preview -->
						<div class="ml-1 flex flex-shrink-0 flex-col items-center gap-1">
							<canvas
								bind:this={previewCanvas}
								width={PREVIEW_SIZE}
								height={PREVIEW_SIZE}
								class="rounded-full border border-border"
								aria-label="Preview"
							></canvas>
							<span class="text-[10px] text-text-muted">Preview</span>
						</div>
					</div>
				</div>

				<!-- Choose different image — proper secondary button -->
				{#if step === 'edit'}
					<button
						type="button"
						class="btn-secondary text-xs"
						on:click={() => { step = 'drop'; img = null; fileInput && (fileInput.value = ''); }}
					>
						Choose a different image
					</button>
				{/if}

				{#if uploadError}
					<p class="text-sm text-danger" role="alert">{uploadError}</p>
				{/if}
			</div>
		{/if}

		<!-- Footer -->
		<div class="mt-lg flex justify-end gap-md">
			<button
				type="button"
				class="btn-secondary"
				on:click={() => dispatch('close')}
				disabled={step === 'uploading'}
			>
				Cancel
			</button>
			{#if step === 'edit'}
				<button type="button" class="btn-primary" on:click={handleUpload}>
					Upload
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.drop-zone {
		background: var(--surface-overlay);
	}
	.drop-zone-active {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 8%, var(--surface-overlay));
	}

	/* Shared slider base styles */
	.rotation-slider,
	.zoom-slider {
		-webkit-appearance: none;
		appearance: none;
		height: 5px;
		border-radius: 3px;
		background: rgba(128, 128, 128, 0.28);
		outline: none;
		cursor: pointer;
	}
	.rotation-slider::-webkit-slider-runnable-track,
	.zoom-slider::-webkit-slider-runnable-track {
		height: 5px;
		border-radius: 3px;
		background: rgba(128, 128, 128, 0.28);
	}
	.rotation-slider::-webkit-slider-thumb,
	.zoom-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--accent);
		cursor: pointer;
		margin-top: -5.5px;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
	}
	.rotation-slider::-moz-range-track,
	.zoom-slider::-moz-range-track {
		height: 5px;
		border-radius: 3px;
		background: rgba(128, 128, 128, 0.28);
	}
	.rotation-slider::-moz-range-thumb,
	.zoom-slider::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--accent);
		cursor: pointer;
		border: none;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
	}
	.rotation-slider:disabled,
	.zoom-slider:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.degree-readout {
		font-variant-numeric: tabular-nums;
	}
</style>
