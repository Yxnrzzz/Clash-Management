export type Role = "Engineer" | "Coordinator" | "Management" | "Admin";

export interface User {
  id: string;
  nama: string;
  email: string;
  peran: Role;
  isActive: boolean;
}

export interface Project {
  id: string;
  nama: string;
  kode: string;
}

export interface Discipline {
  id: string;
  kode: string;
  nama: string;
}

export interface Zone {
  id: string;
  nama: string;
  level: string;
}

export interface Status {
  id: string;
  nama: "Open" | "In Progress" | "Resolved" | "Closed";
  urutan: number;
  isClosedState: boolean;
}

export interface Priority {
  id: string;
  nama: "Low" | "Medium" | "High" | "Critical";
  bobot: number;
}

export interface Attachment {
  id: string;
  clashId: string;
  namaFile: string;
  tipe: "image" | "pdf";
  ukuranBytes: number;
  uploadedBy: string;
  createdAt: string;
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
}

export interface NewClashInput {
  judul: string;
  disciplineId: string;
  zoneId: string;
  priorityId: string;
  deskripsi: string;
  dueDate?: string;
  attachments: { namaFile: string; tipe: "image" | "pdf"; ukuranBytes: number }[];
}
