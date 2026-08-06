import { prisma } from "@/lib/prisma";

export type ProjectStatus = "planning" | "active" | "completed" | "archived";
export type ProjectMemberRole = "admin" | "member";

export interface Project {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}

function toProject(project: {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}): Project {
  return {
    id: project.id,
    ownerId: project.ownerId,
    title: project.title,
    description: project.description,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export function findMembership(projectId: string, userId: string) {
  return prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

export interface CreateProjectInput {
  title: string;
  description: string | null;
}

/** Власник одразу отримує `ProjectMember(role=admin)` — той самий підхід,
 * що й `createCommunity` (lib/communities.ts). */
export async function createProject(
  ownerId: string,
  input: CreateProjectInput,
): Promise<Project> {
  const project = await prisma.project.create({
    data: {
      ownerId,
      title: input.title,
      description: input.description,
      members: {
        create: [{ userId: ownerId, role: "admin" }],
      },
    },
  });
  return toProject(project);
}

/** Лише проєкти, де глядач власник або учасник — "список проєктів
 * користувача" (DEVELOPMENT_PLAN.md), не публічний каталог, на відміну
 * від Community. */
export async function listProjects(userId: string): Promise<Project[]> {
  const projects = await prisma.project.findMany({
    where: { members: { some: { userId } } },
    orderBy: { createdAt: "desc" },
  });
  return projects.map(toProject);
}

export interface ProjectMemberSummary {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: ProjectMemberRole;
}

const memberSelect = {
  role: true,
  user: {
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  },
} as const;

function toMemberSummaries(
  rows: {
    role: ProjectMemberRole;
    user: Omit<ProjectMemberSummary, "role">;
  }[],
): ProjectMemberSummary[] {
  return rows.map((row) => ({ ...row.user, role: row.role }));
}

export type ProjectErrorCode = "not_found";

export interface ProjectDetail extends Project {
  members: ProjectMemberSummary[];
  viewerRole: ProjectMemberRole;
}

export type GetProjectResult =
  { ok: true; project: ProjectDetail } | { ok: false; code: ProjectErrorCode };

/**
 * Anti-enumeration, як Goal: чужий/неіснуючий проєкт дає однакову
 * `not_found` — Project видимий лише учасникам (щойно узгоджене рішення),
 * немає легітимного "бачу, але не можу редагувати" стану для сторонніх.
 * Список учасників включено сюди ж — окремого `GET .../members` немає,
 * той самий підхід, що й у `getCommunityDetail`.
 */
export async function getProject(
  projectId: string,
  userId: string,
): Promise<GetProjectResult> {
  const membership = await findMembership(projectId, userId);
  if (!membership) return { ok: false, code: "not_found" };

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: { orderBy: { joinedAt: "asc" }, select: memberSelect },
    },
  });
  if (!project) return { ok: false, code: "not_found" };

  return {
    ok: true,
    project: {
      ...toProject(project),
      members: toMemberSummaries(project.members),
      viewerRole: membership.role,
    },
  };
}

export type ProjectMutationErrorCode = "not_found" | "forbidden";

export interface EditProjectInput {
  title?: string;
  description?: string | null;
  status?: ProjectStatus;
}

export type EditProjectResult =
  | { ok: true; project: Project }
  | { ok: false; code: ProjectMutationErrorCode };

/** Редагувати може учасник з роллю `admin` (власник — завжди `admin` за
 * замовчуванням). Не учасник → anti-enumeration `not_found`; учасник без
 * прав `admin` → `forbidden`. */
export async function editProject(
  projectId: string,
  actorId: string,
  input: EditProjectInput,
): Promise<EditProjectResult> {
  const membership = await findMembership(projectId, actorId);
  if (!membership) return { ok: false, code: "not_found" };
  if (membership.role !== "admin") return { ok: false, code: "forbidden" };

  const project = await prisma.project.update({
    where: { id: projectId },
    data: input,
  });
  return { ok: true, project: toProject(project) };
}

export type DeleteProjectResult =
  { ok: true } | { ok: false; code: ProjectMutationErrorCode };

/**
 * Видаляти може лише власник (суворіше за редагування, той самий принцип,
 * що й передача власності в Community). `ProjectMember` має
 * `ON DELETE RESTRICT` на `project_id`, а власник завжди учасник одразу
 * після створення — тож спершу прибираємо всіх учасників, потім сам
 * проєкт, в одній транзакції.
 */
export async function deleteProject(
  projectId: string,
  actorId: string,
): Promise<DeleteProjectResult> {
  const membership = await findMembership(projectId, actorId);
  if (!membership) return { ok: false, code: "not_found" };

  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });
  if (!project) return { ok: false, code: "not_found" };
  if (project.ownerId !== actorId) return { ok: false, code: "forbidden" };

  await prisma.$transaction([
    prisma.projectMember.deleteMany({ where: { projectId } }),
    prisma.project.delete({ where: { id: projectId } }),
  ]);

  return { ok: true };
}

export type AddMembersErrorCode = "not_found" | "forbidden";

/** Лише `admin` може додавати учасників. Уже наявних тихо пропускає
 * (ідемпотентно) — той самий підхід, що й `addGroupParticipants`
 * (lib/conversations.ts). Вхід — `userId`, не username (клієнт резолвить
 * через пошук). */
export async function addProjectMembers(
  projectId: string,
  actorId: string,
  newUserIds: string[],
): Promise<{ ok: true } | { ok: false; code: AddMembersErrorCode }> {
  const membership = await findMembership(projectId, actorId);
  if (!membership) return { ok: false, code: "not_found" };
  if (membership.role !== "admin") return { ok: false, code: "forbidden" };

  const existing = await prisma.projectMember.findMany({
    where: { projectId, userId: { in: newUserIds } },
    select: { userId: true },
  });
  const existingIds = new Set(existing.map((m) => m.userId));
  const toAdd = newUserIds.filter((id) => !existingIds.has(id));

  if (toAdd.length > 0) {
    await prisma.projectMember.createMany({
      data: toAdd.map((userId) => ({ projectId, userId, role: "member" })),
    });
  }

  return { ok: true };
}

export type ChangeProjectMemberRoleErrorCode =
  "not_found" | "forbidden" | "target_not_member" | "cannot_change_owner_role";

/** Лише `admin` може змінювати ролі. Роль власника не змінюється цим
 * шляхом — вона синхронізована з `Project.ownerId` (той самий підхід, що
 * й `changeMemberRole` у Community; тут немає передачі власності, тож це
 * просто заборона, без альтернативного шляху). */
export async function changeProjectMemberRole(
  projectId: string,
  actorId: string,
  targetUserId: string,
  newRole: ProjectMemberRole,
): Promise<
  { ok: true } | { ok: false; code: ChangeProjectMemberRoleErrorCode }
> {
  const actorMembership = await findMembership(projectId, actorId);
  if (!actorMembership) return { ok: false, code: "not_found" };
  if (actorMembership.role !== "admin") return { ok: false, code: "forbidden" };

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  });
  if (project.ownerId === targetUserId) {
    return { ok: false, code: "cannot_change_owner_role" };
  }

  const target = await findMembership(projectId, targetUserId);
  if (!target) return { ok: false, code: "target_not_member" };

  if (target.role !== newRole) {
    await prisma.projectMember.update({
      where: { id: target.id },
      data: { role: newRole },
    });
  }

  return { ok: true };
}

export type RemoveProjectMemberErrorCode =
  "not_found" | "forbidden" | "target_not_member" | "owner_cannot_leave";

/**
 * Самостійний вихід дозволено всім, крім власника (спрощення: на відміну
 * від Community/групових чатів, тут немає окремого майбутнього таску
 * "передача прав", тож власник, який хоче піти, має або передати проєкт
 * комусь поза цим API, або видалити його через `deleteProject`).
 * Видаляти інших може лише `admin`; власника видалити ніхто не може.
 */
export async function removeProjectMember(
  projectId: string,
  actorId: string,
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; code: RemoveProjectMemberErrorCode }> {
  const actorMembership = await findMembership(projectId, actorId);
  if (!actorMembership) return { ok: false, code: "not_found" };

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  });

  if (targetUserId === actorId) {
    if (project.ownerId === actorId) {
      return { ok: false, code: "owner_cannot_leave" };
    }
  } else if (actorMembership.role !== "admin") {
    return { ok: false, code: "forbidden" };
  }

  if (project.ownerId === targetUserId) {
    return { ok: false, code: "forbidden" };
  }

  const target = await findMembership(projectId, targetUserId);
  if (!target) return { ok: false, code: "target_not_member" };

  await prisma.projectMember.delete({ where: { id: target.id } });
  return { ok: true };
}
