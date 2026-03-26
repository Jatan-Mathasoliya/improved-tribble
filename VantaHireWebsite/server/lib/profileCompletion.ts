import { eq, count } from "drizzle-orm";
import { candidateResumes, type User, type UserProfile } from "@shared/schema";
import { db } from "../db";
import { storage } from "../storage";

type CompletionInputs = {
  profile?: UserProfile | null;
  resumeCount?: number;
};

export type ProfileCompletionResult = {
  complete: boolean;
  missingRequired: string[];
  missingNiceToHave: string[];
  completionPercent: number;
};

const NICE_TO_HAVE_FIELDS = ["linkedin", "location", "bio"] as const;

function getRequiredFields(role: string): string[] {
  const required = ["firstName", "lastName"];

  if (role === "candidate") {
    required.push("resume");
  } else if (role === "recruiter" || role === "hiring_manager") {
    required.push("company");
    required.push("phone");
  }

  return required;
}

export async function computeProfileCompletion(
  user: User,
  inputs: CompletionInputs = {}
): Promise<ProfileCompletionResult> {
  const requiredFields = getRequiredFields(user.role);
  const missingRequired: string[] = [];
  const missingNiceToHave: string[] = [];

  let profile = inputs.profile;
  if (!profile && (requiredFields.includes("company") || requiredFields.includes("phone") || NICE_TO_HAVE_FIELDS.length > 0)) {
    profile = await storage.getUserProfile(user.id);
  }

  if (!user.firstName) missingRequired.push("firstName");
  if (!user.lastName) missingRequired.push("lastName");

  if (requiredFields.includes("resume")) {
    const resumeCountValue = inputs.resumeCount ?? Number(
      (
        await db
          .select({ count: count() })
          .from(candidateResumes)
          .where(eq(candidateResumes.userId, user.id))
      )[0]?.count ?? 0
    );
    if (resumeCountValue === 0) {
      missingRequired.push("resume");
    }
  }

  if (requiredFields.includes("company")) {
    if (!profile?.company) missingRequired.push("company");
  }

  if (requiredFields.includes("phone")) {
    if (!profile?.phone) missingRequired.push("phone");
  }

  if (!profile?.linkedin) missingNiceToHave.push("linkedin");
  if (!profile?.location) missingNiceToHave.push("location");
  if (!profile?.bio) missingNiceToHave.push("bio");

  const totalRequired = requiredFields.length;
  const totalNiceToHave = NICE_TO_HAVE_FIELDS.length;
  const filledRequired = totalRequired - missingRequired.length;
  const filledNiceToHave = totalNiceToHave - missingNiceToHave.length;
  const completionPercent = Math.round(
    ((filledRequired + filledNiceToHave) / (totalRequired + totalNiceToHave)) * 100
  );

  return {
    complete: missingRequired.length === 0,
    missingRequired,
    missingNiceToHave,
    completionPercent,
  };
}

export async function syncProfileCompletionStatus(
  user: User,
  inputs: CompletionInputs = {}
): Promise<ProfileCompletionResult> {
  const result = await computeProfileCompletion(user, inputs);
  if (result.complete) {
    if (!user.profileCompletedAt) {
      await storage.markProfileCompleted(user.id);
    }
  } else {
    await storage.clearProfileCompletedAt(user.id);
  }
  return result;
}
