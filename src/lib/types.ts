export type Role = "Engineer" | "Coordinator" | "Management" | "Admin";

export interface User {
  id: string;
  nama: string;
  email: string;
  peran: Role;
  isActive: boolean;
  mustChangePassword: boolean;
}

export interface Project {
  id: string;
  nama: string;
  kode: string;
  archivedAt: string | null;
}

export interface Discipline {
  id: string;
  kode: string;
  nama: string;
  isActive: boolean;
}

export interface Zone {
  id: string;
  nama: string;
  level: string;
  isActive: boolean;
}

export interface Status {
  id: string;
  nama: string;
  urutan: number;
  isClosedState: boolean;
}

export interface Priority {
  id: string;
  nama: string;
  bobot: number;
  isActive: boolean;
}

/** Kolom mana di laporan "Tabel Clash Detection" yang diisi lampiran ini.
 * Tetap berbahasa Inggris seperti Annotation.kind — nilainya adalah enum
 * yang dikirim/diterima API apa adanya, bukan teks yang ditampilkan. */
export type AttachmentRole = "ORIGINAL" | "CLASH_DETECTION" | "OTHER";

export interface Attachment {
  id: string;
  clashId: string;
  namaFile: string;
  tipe: "image" | "pdf" | "other";
  ukuranBytes: number;
  uploadedBy: string;
  createdAt: string;
  role: AttachmentRole;
}

export interface Comment {
  id: string;
  clashId: string;
  authorId: string;
  isi: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  clashId: string;
  actorId: string;
  aksi: string;
  field?: string;
  nilaiLama?: string;
  nilaiBaru?: string;
  createdAt: string;
}

export interface Clash {
  id: string;
  kodeUnik: string;
  projectId: string;
  judul: string;
  deskripsi: string;
  disciplineId: string;
  zoneId: string;
  statusId: string;
  priorityId: string;
  reporterId: string;
  assigneeId: string | null;
  dueDate: string | null;
  createdAt: string;
  closedAt: string | null;
  deletedAt: string | null;
  // Dua kolom laporan konsultan. Namanya dibiarkan Inggris karena itu label
  // kolom yang dicetak di dokumen — menerjemahkannya di sini hanya membuat
  // pemetaan ke header xlsx jadi tebak-tebakan.
  resolveProposed: string | null;
  resolveByConsultant: string | null;
}

export interface NewClashInput {
  judul: string;
  disciplineId: string;
  zoneId: string;
  priorityId: string;
  deskripsi: string;
  dueDate?: string;
  // `role` opsional: kalau dibiarkan kosong, lampiran mendarat sebagai OTHER
  // (DEFAULT di database) dan tidak muncul di laporan sampai ditandai.
  attachments: {
    namaFile: string;
    tipe: "image" | "pdf" | "other";
    ukuranBytes: number;
    file?: File;
    role?: AttachmentRole;
  }[];
}

export interface NotificationPreference {
  userId: string;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  whatsappNumber: string;
}
