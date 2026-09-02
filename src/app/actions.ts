"use server";

import { revalidatePath } from "next/cache";
import { ApplicationInput, ApplicationInputSchema } from "@/types/application";
import { saveApplication, deleteApplication } from "@/lib/sheets";

export async function upsertApplicationAction(formData: FormData) {
  const rawData = {
    id: formData.get("id") ? String(formData.get("id")) : undefined,
    programName: String(formData.get("programName") || ""),
    university: String(formData.get("university") || ""),
    deadline: String(formData.get("deadline") || ""),
    status: String(formData.get("status") || "Researching"),
    degreeType: String(formData.get("degreeType") || "MS / SMP"),
    gpaRequirement: String(formData.get("gpaRequirement") || ""),
    mcatRequirement: String(formData.get("mcatRequirement") || ""),
    appFee: String(formData.get("appFee") || ""),
    transcriptsSent: formData.get("transcriptsSent") === "on" || formData.get("transcriptsSent") === "true",
    lorsRequested: formData.get("lorsRequested") === "on" || formData.get("lorsRequested") === "true",
    essayCompleted: formData.get("essayCompleted") === "on" || formData.get("essayCompleted") === "true",
    portalUrl: String(formData.get("portalUrl") || ""),
    notes: String(formData.get("notes") || ""),
  };

  const parsed = ApplicationInputSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  await saveApplication(parsed.data as ApplicationInput);
  revalidatePath("/");
  return { success: true };
}

export async function deleteApplicationAction(id: string) {
  if (!id) return { success: false, error: "Missing ID" };
  await deleteApplication(id);
  revalidatePath("/");
  return { success: true };
}
