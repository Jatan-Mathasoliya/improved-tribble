import { z } from "zod";

// Section status for nav display
export type SectionStatus = "locked" | "incomplete" | "complete" | "error";

export interface Section {
  id: string;
  label: string;
  required: boolean;
  status: SectionStatus;
}

// Contact Section Schema
export const contactSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().min(1, "Last name is required").max(50),
  email: z.string().email("Valid email is required"),
  phone: z.string().regex(/^\d{10}$/, "Please enter exactly 10 digits for the phone number"),
  location: z.string().max(100).optional().or(z.literal("")),
});

export type ContactData = z.infer<typeof contactSchema>;

// Experience Section Schema
export const experienceItemSchema = z.object({
  id: z.string(),
  role: z.string().min(1, "Role is required").max(100),
  company: z.string().min(1, "Company is required").max(100),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  current: z.boolean().default(false),
  summary: z.string().max(500).optional(),
});

export const experienceSchema = z.object({
  items: z.array(experienceItemSchema),
});

export type ExperienceItem = z.infer<typeof experienceItemSchema>;
export type ExperienceData = z.infer<typeof experienceSchema>;

// Education Section Schema
export const educationItemSchema = z.object({
  id: z.string(),
  school: z.string().min(1, "School is required").max(100),
  degree: z.string().max(100).optional(),
  field: z.string().max(100).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().max(300).optional(),
});

export const educationSchema = z.object({
  items: z.array(educationItemSchema),
});

export type EducationItem = z.infer<typeof educationItemSchema>;
export type EducationData = z.infer<typeof educationSchema>;

// Skills Section Schema
export const skillItemSchema = z.object({
  name: z.string().min(1).max(50),
  proficiency: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
});

export const skillsSchema = z.object({
  skills: z.array(skillItemSchema).max(30),
});

export type SkillItem = z.infer<typeof skillItemSchema>;
export type SkillsData = z.infer<typeof skillsSchema>;

// Documents Section Schema
export const documentsSchema = z.object({
  resumeFile: z.instanceof(File).optional().nullable(),
  resumeText: z.string().max(50000).optional(),
  coverLetter: z.string().max(5000).optional(),
  portfolioUrl: z.string().url().optional().or(z.literal("")),
});

export type DocumentsData = z.infer<typeof documentsSchema>;

// Notes Section Schema
export const notesSchema = z.object({
  source: z.enum(["recruiter_add", "referral", "linkedin", "indeed", "other"]).default("recruiter_add"),
  referrer: z.string().max(100).optional(),
  internalNotes: z.string().max(2000).optional(),
  initialStageId: z.number().optional().nullable(),
});

export type NotesData = z.infer<typeof notesSchema>;

// Combined form data
export interface CandidateIntakeData {
  contact: ContactData;
  experience: ExperienceData;
  education: EducationData;
  skills: SkillsData;
  documents: DocumentsData;
  notes: NotesData;
}

// Default values
export const defaultContactData: ContactData = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  location: "",
};

export const defaultExperienceData: ExperienceData = {
  items: [],
};

export const defaultEducationData: EducationData = {
  items: [],
};

export const defaultSkillsData: SkillsData = {
  skills: [],
};

export const defaultDocumentsData: DocumentsData = {
  resumeFile: null,
  resumeText: "",
  coverLetter: "",
  portfolioUrl: "",
};

export const defaultNotesData: NotesData = {
  source: "recruiter_add",
  referrer: "",
  internalNotes: "",
  initialStageId: null,
};

export const defaultIntakeData: CandidateIntakeData = {
  contact: defaultContactData,
  experience: defaultExperienceData,
  education: defaultEducationData,
  skills: defaultSkillsData,
  documents: defaultDocumentsData,
  notes: defaultNotesData,
};
