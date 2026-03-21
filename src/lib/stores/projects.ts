import { writable } from 'svelte/store';
import type { Project } from '$lib/types';

export const projects = writable<Project[]>([]);

export async function loadProjects(): Promise<void> {
	try {
		const res = await fetch('/api/projects');
		if (!res.ok) throw new Error('Failed to load projects');
		const data = await res.json();
		projects.set(data.projects || []);
	} catch (error) {
		console.error('Error loading projects:', error);
	}
}

export async function createProject(name: string): Promise<Project> {
	const res = await fetch('/api/projects', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name }),
	});
	if (!res.ok) throw new Error('Failed to create project');
	const project: Project = await res.json();
	projects.update((list) => [...list, project]);
	return project;
}

export async function renameProject(id: string, name: string): Promise<void> {
	const res = await fetch(`/api/projects/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name }),
	});
	if (!res.ok) throw new Error('Failed to rename project');
	projects.update((list) => list.map((p) => (p.id === id ? { ...p, name } : p)));
}

export async function deleteProject(id: string): Promise<void> {
	const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
	if (!res.ok) throw new Error('Failed to delete project');
	projects.update((list) => list.filter((p) => p.id !== id));
}
