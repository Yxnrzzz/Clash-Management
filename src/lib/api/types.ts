/**
 * Raw shapes returned by the NestJS API. These deliberately use the backend's
 * English field names (mirroring the Prisma schema); everything the UI touches
 * goes through mappers.ts and comes out in the Indonesian domain types declared
 * in src/lib/types.ts.
 */

export type ApiRole = "ENGINEER" | "COORDINATOR" | "MANAGEMENT" | "ADMIN";

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: ApiRole;
  isActive: boolean;
}

export interface ApiProject {
  id: string;
  name: string;
  code: string;
}

export interface ApiDiscipline {
  id: string;
  projectId: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ApiZone {
  id: string;
  projectId: string;
  name: string;
  level: string;
  isActive: boolean;
}

export interface ApiStatus {
  id: string;
  name: string;
  sequence: number;
  isClosedState: boolean;
}

export interface ApiPriority {
  id: string;
  name: string;
  weight: number;
  isActive: boolean;
}

export interface ApiSession {
  accessToken: string;
  user: ApiUser;
}
