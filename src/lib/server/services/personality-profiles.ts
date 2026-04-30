import { eq } from 'drizzle-orm';
import { db } from '../db';
import { personalityProfiles } from '../db/schema';
import * as crypto from 'crypto';

export interface PersonalityProfile {
	id: string;
	name: string;
	description: string;
	promptText: string;
	isBuiltIn: boolean;
	createdAt: Date;
}

export async function listPersonalityProfiles(): Promise<PersonalityProfile[]> {
	return db.select().from(personalityProfiles).orderBy(personalityProfiles.createdAt);
}

export async function getPersonalityProfile(id: string): Promise<PersonalityProfile | null> {
	const [row] = await db.select().from(personalityProfiles).where(eq(personalityProfiles.id, id));
	return row ?? null;
}

export async function createPersonalityProfile(params: {
	name: string;
	description: string;
	promptText: string;
}): Promise<PersonalityProfile> {
	const id = crypto.randomUUID();
	await db.insert(personalityProfiles).values({
		id,
		name: params.name,
		description: params.description,
		promptText: params.promptText,
		isBuiltIn: 0,
	});
	return (await getPersonalityProfile(id))!;
}

export async function updatePersonalityProfile(
	id: string,
	params: { name?: string; description?: string; promptText?: string }
): Promise<PersonalityProfile | null> {
	const updates: Record<string, unknown> = {};
	if (params.name !== undefined) updates.name = params.name;
	if (params.description !== undefined) updates.description = params.description;
	if (params.promptText !== undefined) updates.promptText = params.promptText;

	if (Object.keys(updates).length === 0) return getPersonalityProfile(id);

	await db.update(personalityProfiles).set(updates).where(eq(personalityProfiles.id, id));
	return getPersonalityProfile(id);
}

export async function deletePersonalityProfile(id: string): Promise<boolean> {
	const [profile] = await db.select().from(personalityProfiles).where(eq(personalityProfiles.id, id));
	if (!profile || profile.isBuiltIn) return false;
	await db.delete(personalityProfiles).where(eq(personalityProfiles.id, id));
	return true;
}

const BUILT_IN_PROFILES = [
	{
		name: 'Default',
		description: 'Direct, grounded, thoughtful. The standard AlfyAI voice.',
		promptText: 'Be direct, grounded, thoughtful, and useful. Use plain language by default. Go deeper when the task is technical, ambiguous, or high-value. Give the answer first when that helps, then reasoning. Match the user\'s tone within professional bounds. Avoid filler, empty praise, and performative enthusiasm.',
	},
	{
		name: 'Concise',
		description: 'Terse, answer-first, minimal exposition. Engineer-to-engineer.',
		promptText: 'Be extremely concise. Default to 1-3 short paragraphs or at most 5 bullets. Answer first. Do not include background, caveats, summaries, or step-by-step explanation unless the user asks or correctness requires it. Skip pleasantries, intros, and sign-offs. Prefer code, data, or structured output over prose.',
	},
	{
		name: 'Exploratory',
		description: 'Curious, asks clarifying questions, explores tradeoffs. Good for brainstorming and research.',
		promptText: 'Be curious and exploratory. Ask clarifying questions when the user\'s intent is ambiguous. Offer multiple perspectives and explore tradeoffs. When solving problems, consider edge cases and alternatives before committing to a single answer. Encourage the user to refine their thinking. Be more verbose when depth helps, but stay focused.',
	},
	{
		name: 'Creative',
		description: 'Imaginative and inspiring, uses metaphors and storytelling. Great for content creation.',
		promptText: 'Be imaginative, creative, and inspiring. Use vivid language, metaphors, and storytelling when appropriate. Encourage experimentation and celebrate ideas. When writing content, prioritize engagement and originality while staying clear. Vary sentence structure and use rhetorical devices to keep prose lively. Be enthusiastic about creative possibilities.',
	},
];

export async function seedPersonalityProfiles(): Promise<void> {
	const existing = await db.select().from(personalityProfiles);
	const existingByName = new Map(existing.map((r) => [r.name, r]));

	for (const profile of BUILT_IN_PROFILES) {
		const existingProfile = existingByName.get(profile.name);
		if (existingProfile) {
			if (
				existingProfile.isBuiltIn &&
				(existingProfile.description !== profile.description ||
					existingProfile.promptText !== profile.promptText)
			) {
				await db
					.update(personalityProfiles)
					.set({
						description: profile.description,
						promptText: profile.promptText,
					})
					.where(eq(personalityProfiles.id, existingProfile.id));
			}
			continue;
		}
		await db.insert(personalityProfiles).values({
			id: crypto.randomUUID(),
			name: profile.name,
			description: profile.description,
			promptText: profile.promptText,
			isBuiltIn: 1,
		});
	}
}
