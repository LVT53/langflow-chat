import { writable } from 'svelte/store';
import type { Project } from '$lib/types';
import {
	createProject as createProjectRequest,
	deleteProject as deleteProjectRequest,
	fetchProjects,
	renameProject as renameProjectRequest,
} from '$lib/client/api/projects';

export const projects = writable<Project[]>([]);

export async function loadProjects(): Promise<void> {
	try {
		projects.set(await fetchProjects());
	} catch (error) {
		console.error('Error loading projects:', error);
	}
}

export async function createProject(name: string): Promise<Project> {
	const project = await createProjectRequest(name);
	projects.update((list) => [...list, project]);
	return project;
}

export async function renameProject(id: string, name: string): Promise<void> {
	await renameProjectRequest(id, name);
	projects.update((list) => list.map((p) => (p.id === id ? { ...p, name } : p)));
}

export async function deleteProject(id: string): Promise<void> {
	await deleteProjectRequest(id);
	projects.update((list) => list.filter((p) => p.id !== id));
}
