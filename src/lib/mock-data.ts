import type {
  AuditLogEntry,
  Attachment,
  Clash,
  Comment,
  Discipline,
  Priority,
  Project,
  Status,
  User,
  Zone,
} from "./types";

/**
 * These INITIAL_* constants seed the mutable, localStorage-persisted state in
 * data-context.tsx. Once the app boots, master data (users, disciplines,
 * zones, statuses, priorities, project) lives in context and can be edited
 * via the Admin pages — components must read it from useData(), not from
 * these constants directly (the exception is generateSeedData below, which
 * only needs valid ids at seed time).
 */
export const INITIAL_PROJECT: Project = {
  id: "proj-1",
  nama: "Menara Cendana — Tower A",
  kode: "MCA",
};

export const INITIAL_USERS: User[] = [
  { id: "u-eng", nama: "Dimas Prasetyo", email: "engineer@clashhub.dev", peran: "Engineer", isActive: true },
  { id: "u-coord", nama: "Siti Rahmawati", email: "coordinator@clashhub.dev", peran: "Coordinator", isActive: true },
  { id: "u-mgmt", nama: "Bambang Wijaya", email: "management@clashhub.dev", peran: "Management", isActive: true },
  { id: "u-admin", nama: "Admin ClashHub", email: "admin@clashhub.dev", peran: "Admin", isActive: true },
  { id: "u-eng2", nama: "Rizky Ananda", email: "rizky@clashhub.dev", peran: "Engineer", isActive: true },
  { id: "u-coord2", nama: "Putri Lestari", email: "putri@clashhub.dev", peran: "Coordinator", isActive: true },
];

export const INITIAL_DISCIPLINES: Discipline[] = [
  { id: "disc-ars", kode: "ARS", nama: "Arsitektur", isActive: true },
  { id: "disc-str", kode: "STR", nama: "Struktur", isActive: true },
  { id: "disc-mep", kode: "MEP", nama: "Mekanikal/Elektrikal/Plumbing", isActive: true },
  { id: "disc-other", kode: "OTH", nama: "Lainnya", isActive: true },
];

export const INITIAL_ZONES: Zone[] = [
  { id: "zone-1", nama: "Zona A", level: "Lantai 1", isActive: true },
  { id: "zone-2", nama: "Zona B", level: "Lantai 1", isActive: true },
  { id: "zone-3", nama: "Zona A", level: "Lantai 2", isActive: true },
  { id: "zone-4", nama: "Zona B", level: "Lantai 2", isActive: true },
  { id: "zone-5", nama: "Zona Core", level: "Lantai 3", isActive: true },
  { id: "zone-6", nama: "Basement", level: "B1", isActive: true },
];

export const INITIAL_STATUSES: Status[] = [
  { id: "st-open", nama: "Open", urutan: 1, isClosedState: false },
  { id: "st-inprogress", nama: "In Progress", urutan: 2, isClosedState: false },
  { id: "st-resolved", nama: "Resolved", urutan: 3, isClosedState: false },
  { id: "st-closed", nama: "Closed", urutan: 4, isClosedState: true },
];

export const INITIAL_PRIORITIES: Priority[] = [
  { id: "pr-low", nama: "Low", bobot: 1, isActive: true },
  { id: "pr-medium", nama: "Medium", bobot: 2, isActive: true },
  { id: "pr-high", nama: "High", bobot: 3, isActive: true },
  { id: "pr-critical", nama: "Critical", bobot: 4, isActive: true },
];

const TITLES = [
  "Bentrok pipa HVAC dengan balok struktur",
  "Konflik jalur kabel listrik dengan plafon arsitektur",
  "Kolom struktur menembus ruang tangga",
  "Pipa air bersih bertabrakan dengan sparing STR",
  "Ducting AC memotong balok anak",
  "Instalasi sprinkler bentrok dengan jalur kabel tray",
  "Dinding partisi menghalangi akses shaft MEP",
  "Elevasi plafon tidak sesuai dengan ducting utama",
  "Bukaan pintu terhalang kolom praktis",
  "Jalur pipa drainase bentrok dengan pondasi",
  "Panel listrik bentrok dengan railing tangga darurat",
  "Bentrok grating floor dengan pipa chiller",
  "Jalur kabel tray menembus balok utama",
  "Ruang AHU tidak cukup untuk maintenance",
  "Sparing plumbing tidak sesuai shop drawing struktur",
];

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export interface SeedData {
  clashes: Clash[];
  comments: Comment[];
  auditLogs: AuditLogEntry[];
  attachments: Attachment[];
}

const REPORTERS = ["u-eng", "u-eng2", "u-coord", "u-coord2"];
const ASSIGNEES = ["u-eng", "u-eng2", "u-coord", "u-coord2", null];

export function generateSeedData(count = 87): SeedData {
  const rng = mulberry32(42);
  const clashes: Clash[] = [];
  const comments: Comment[] = [];
  const auditLogs: AuditLogEntry[] = [];
  const attachments: Attachment[] = [];

  const now = new Date("2026-07-31T09:00:00");
  const disciplineCounters: Record<string, number> = {};

  for (let i = 0; i < count; i++) {
    const discipline = pick(rng, INITIAL_DISCIPLINES);
    const zone = pick(rng, INITIAL_ZONES);
    const priority = pick(rng, INITIAL_PRIORITIES);
    const statusRoll = rng();
    const status =
      statusRoll < 0.35
        ? INITIAL_STATUSES[0]
        : statusRoll < 0.6
        ? INITIAL_STATUSES[1]
        : statusRoll < 0.8
        ? INITIAL_STATUSES[2]
        : INITIAL_STATUSES[3];
    const reporter = pick(rng, REPORTERS);
    const assignee = pick(rng, ASSIGNEES);
    const createdAt = addDays(now, -Math.floor(rng() * 90));
    const dueDate = rng() < 0.85 ? addDays(createdAt, 5 + Math.floor(rng() * 25)) : null;
    const closedAt = status.isClosedState ? addDays(createdAt, 3 + Math.floor(rng() * 20)) : null;

    disciplineCounters[discipline.kode] = (disciplineCounters[discipline.kode] ?? 0) + 1;
    const kodeUnik = `${INITIAL_PROJECT.kode}-${discipline.kode}-${String(disciplineCounters[discipline.kode]).padStart(4, "0")}`;
    const id = `clash-${i + 1}`;

    const clash: Clash = {
      id,
      kodeUnik,
      projectId: INITIAL_PROJECT.id,
      judul: pick(rng, TITLES),
      deskripsi:
        "Hasil koordinasi model menunjukkan potensi bentrok antar elemen pada zona ini. Perlu verifikasi lapangan dan revisi shop drawing sebelum instalasi lanjutan.",
      disciplineId: discipline.id,
      zoneId: zone.id,
      statusId: status.id,
      priorityId: priority.id,
      reporterId: reporter,
      assigneeId: assignee,
      dueDate: dueDate ? dueDate.toISOString() : null,
      createdAt: createdAt.toISOString(),
      closedAt: closedAt ? closedAt.toISOString() : null,
    };
    clashes.push(clash);

    auditLogs.push({
      id: `audit-${id}-created`,
      clashId: id,
      actorId: reporter,
      aksi: "created",
      createdAt: createdAt.toISOString(),
    });

    if (assignee) {
      auditLogs.push({
        id: `audit-${id}-assigned`,
        clashId: id,
        actorId: "u-coord",
        aksi: "updated",
        field: "assignee",
        nilaiLama: "-",
        nilaiBaru: INITIAL_USERS.find((u) => u.id === assignee)?.nama ?? assignee,
        createdAt: addDays(createdAt, 1).toISOString(),
      });
    }

    if (status.urutan > 1) {
      auditLogs.push({
        id: `audit-${id}-status`,
        clashId: id,
        actorId: assignee ?? "u-coord",
        aksi: "updated",
        field: "status",
        nilaiLama: "Open",
        nilaiBaru: status.nama,
        createdAt: addDays(createdAt, 2).toISOString(),
      });
    }

    if (rng() < 0.4) {
      comments.push({
        id: `comment-${id}-1`,
        clashId: id,
        authorId: assignee ?? reporter,
        isi: "Sudah dicek di lapangan, perlu koordinasi ulang dengan tim STR untuk revisi elevasi.",
        createdAt: addDays(createdAt, 2).toISOString(),
      });
    }

    if (rng() < 0.5) {
      attachments.push({
        id: `att-${id}-1`,
        clashId: id,
        namaFile: `screenshot-${kodeUnik}.png`,
        tipe: "image",
        ukuranBytes: 1_200_000 + Math.floor(rng() * 3_000_000),
        uploadedBy: reporter,
        createdAt: createdAt.toISOString(),
      });
    }
  }

  return { clashes, comments, auditLogs, attachments };
}
