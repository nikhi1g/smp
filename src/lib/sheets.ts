import { sheets_v4 } from "googleapis";
import { Application, ApplicationInput, ApplicationSchema } from "@/types/application";
import fs from "fs";
import path from "path";
import { google } from "googleapis";

const SHEET_NAME = "Applications";
const HEADERS = [
  "ID",
  "Program Name",
  "University",
  "Deadline",
  "Status",
  "Degree Type",
  "GPA Req",
  "MCAT Req",
  "App Fee",
  "Transcripts Sent",
  "LORs Requested",
  "Essay Completed",
  "Portal URL",
  "Notes",
  "Updated At",
];

const LOCAL_STORAGE_FILE = path.join(process.cwd(), ".data_applications.json");

const SEED_DATA: Application[] = [
  {
    id: "smp-1",
    programName: "Special Master's Program in Physiology",
    university: "Georgetown University",
    deadline: "2026-05-15",
    status: "In Progress",
    portalUrl: "https://som.georgetown.edu/smp/",
    degreeType: "M.S. Physiology",
    gpaRequirement: "3.0+",
    mcatRequirement: "500+",
    appFee: "$90",
    transcriptsSent: true,
    lorsRequested: true,
    essayCompleted: false,
    notes: "Direct linkage to Georgetown School of Medicine. Medical school curriculum parallel.",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "smp-2",
    programName: "Master of Arts in Medical Sciences (MAMS)",
    university: "Boston University",
    deadline: "2026-06-01",
    status: "Researching",
    portalUrl: "https://www.bumc.bu.edu/gms/mams/",
    degreeType: "M.A. Medical Sciences",
    gpaRequirement: "3.0+",
    mcatRequirement: "505+",
    appFee: "$100",
    transcriptsSent: false,
    lorsRequested: false,
    essayCompleted: false,
    notes: "Top placement into US MD/DO programs. 1 or 2-year thesis option.",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "smp-3",
    programName: "Master of Science in Narrative Medicine / Post-Bacc SMP",
    university: "Temple University (Katz)",
    deadline: "2026-04-30",
    status: "Submitted",
    portalUrl: "https://medicine.temple.edu/education/postbaccalaureate-programs",
    degreeType: "Post-Bacc Pre-Med / MS",
    gpaRequirement: "3.2+",
    mcatRequirement: "500+",
    appFee: "$75",
    transcriptsSent: true,
    lorsRequested: true,
    essayCompleted: true,
    notes: "Requires CASPer assessment. Committee letter sent directly.",
    updatedAt: new Date().toISOString(),
  },
];

function getLocalData(): Application[] {
  if (!fs.existsSync(LOCAL_STORAGE_FILE)) {
    fs.writeFileSync(LOCAL_STORAGE_FILE, JSON.stringify(SEED_DATA, null, 2), "utf8");
    return SEED_DATA;
  }
  try {
    const raw = fs.readFileSync(LOCAL_STORAGE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return SEED_DATA;
  }
}

function getGoogleSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!email || !privateKey || !sheetId) {
    return null;
  }

  privateKey = privateKey.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return { sheets: google.sheets({ version: "v4", auth }), sheetId };
}

function rowToApp(row: string[]): Application | null {
  if (!row || row.length < 4) return null;
  try {
    return ApplicationSchema.parse({
      id: row[0] || `smp-${Date.now()}`,
      programName: row[1] || "",
      university: row[2] || "",
      deadline: row[3] || "",
      status: row[4] || "Researching",
      degreeType: row[5] || "MS / SMP",
      gpaRequirement: row[6] || "",
      mcatRequirement: row[7] || "",
      appFee: row[8] || "",
      transcriptsSent: row[9] === "TRUE" || row[9] === "true",
      lorsRequested: row[10] === "TRUE" || row[10] === "true",
      essayCompleted: row[11] === "TRUE" || row[11] === "true",
      portalUrl: row[12] || "",
      notes: row[13] || "",
      updatedAt: row[14] || new Date().toISOString(),
    });
  } catch {
    return null;
  }
}

function appToRow(app: Application): (string | boolean)[] {
  return [
    app.id,
    app.programName,
    app.university,
    app.deadline,
    app.status,
    app.degreeType,
    app.gpaRequirement,
    app.mcatRequirement,
    app.appFee,
    app.transcriptsSent ? "TRUE" : "FALSE",
    app.lorsRequested ? "TRUE" : "FALSE",
    app.essayCompleted ? "TRUE" : "FALSE",
    app.portalUrl,
    app.notes,
    app.updatedAt,
  ];
}

export async function fetchApplications(): Promise<{ data: Application[]; source: "google_sheets" | "local_fallback" }> {
  const client = getGoogleSheetsClient();
  if (!client) {
    return { data: getLocalData(), source: "local_fallback" };
  }

  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.sheetId,
      range: `${SHEET_NAME}!A2:O`,
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
      return { data: [], source: "google_sheets" };
    }

    const apps: Application[] = [];
    for (const row of rows) {
      const app = rowToApp(row as string[]);
      if (app) apps.push(app);
    }
    return { data: apps, source: "google_sheets" };
  } catch (error) {
    console.error("Google Sheets API error, falling back to local storage:", error);
    return { data: getLocalData(), source: "local_fallback" };
  }
}

export async function saveApplication(input: ApplicationInput): Promise<Application> {
  const appId = input.id || `smp-${Date.now()}`;
  const record: Application = {
    ...input,
    id: appId,
    updatedAt: new Date().toISOString(),
  };

  const client = getGoogleSheetsClient();
  if (!client) {
    const list = getLocalData();
    const idx = list.findIndex((a) => a.id === appId);
    if (idx >= 0) {
      list[idx] = record;
    } else {
      list.unshift(record);
    }
    fs.writeFileSync(LOCAL_STORAGE_FILE, JSON.stringify(list, null, 2), "utf8");
    return record;
  }

  try {
    await ensureHeadersExist(client.sheets, client.sheetId);

    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.sheetId,
      range: `${SHEET_NAME}!A:A`,
    });

    const rows = res.data.values || [];
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === appId) {
        rowIndex = i + 1;
        break;
      }
    }

    const rowValues = appToRow(record);

    if (rowIndex > 0) {
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.sheetId,
        range: `${SHEET_NAME}!A${rowIndex}:O${rowIndex}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [rowValues] },
      });
    } else {
      await client.sheets.spreadsheets.values.append({
        spreadsheetId: client.sheetId,
        range: `${SHEET_NAME}!A:O`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [rowValues] },
      });
    }

    return record;
  } catch (err) {
    console.error("Error writing to Google Sheets, writing to local storage:", err);
    const list = getLocalData();
    const idx = list.findIndex((a) => a.id === appId);
    if (idx >= 0) list[idx] = record;
    else list.unshift(record);
    fs.writeFileSync(LOCAL_STORAGE_FILE, JSON.stringify(list, null, 2), "utf8");
    return record;
  }
}

export async function deleteApplication(id: string): Promise<boolean> {
  const client = getGoogleSheetsClient();
  if (!client) {
    const list = getLocalData();
    const filtered = list.filter((a) => a.id !== id);
    fs.writeFileSync(LOCAL_STORAGE_FILE, JSON.stringify(filtered, null, 2), "utf8");
    return true;
  }

  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.sheetId,
      range: `${SHEET_NAME}!A:O`,
    });

    const rows = res.data.values || [];
    const remaining = rows.filter((r, idx) => idx === 0 || r[0] !== id);

    await client.sheets.spreadsheets.values.clear({
      spreadsheetId: client.sheetId,
      range: `${SHEET_NAME}!A:O`,
    });

    if (remaining.length > 0) {
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.sheetId,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: remaining },
      });
    }

    return true;
  } catch (err) {
    console.error("Failed to delete from Google Sheets, updating local storage:", err);
    const list = getLocalData();
    fs.writeFileSync(LOCAL_STORAGE_FILE, JSON.stringify(list.filter((a) => a.id !== id), null, 2), "utf8");
    return true;
  }
}

async function ensureHeadersExist(sheets: sheets_v4.Sheets, spreadsheetId: string) {
  try {
    const check = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:O1`,
    });
    if (!check.data.values || check.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A1:O1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [HEADERS] },
      });
    }
  } catch {
    // Range or sheet might not exist until initialization
  }
}
