import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ProjectFileEntry, type ProjectFileTree, type ProjectKind, type ProjectSummary } from "../api";
import { CreateProjectMenu } from "./CreateProjectMenu";
import { ProjectActionsMenu } from "./ProjectActionsMenu";
import {
  EXPLORER_ACCEPT,
  filesToUploadPayload,
  pickFiles,
  UPLOADABLE_FOLDER_IDS,
  type UploadFolderHint,
} from "./fileUpload";
import { usePersistedExplorerTree } from "../prefs/usePersistedUi";

export type ExplorerOpen =
  | { kind: "template"; id: string }
  | { kind: "schema"; name: string }
  | { kind: "fixture"; key: string }
  | { kind: "block"; id: string; path: string; readOnly?: boolean; frameworkProject?: string }
  | { kind: "manifest"; path: string }
  | { kind: "asset"; name: string }
  | { kind: "font"; name: string };

export interface ProjectExplorerProps {
  projects: ProjectSummary[];
  pid: string;
  onProject: (id: string) => void;
  onProjectsChange: (projects: ProjectSummary[]) => void;
  onProjectRenamed: (oldId: string, newId: string) => void;
  onProjectDeleted: (id: string) => void;
  active: ExplorerOpen | null;
  onOpen: (item: ExplorerOpen) => void;
  onToast: (msg: string) => void;
  refreshKey?: number;
  /** Called after files land on disk (refresh preview, fonts, project detail). */
  onUploadComplete?: () => void;
}

const CREATABLE = new Set(["templates", "schemas", "fixtures", "blocks"]);

export function ProjectExplorer({
  projects,
  pid,
  onProject,
  onProjectsChange,
  onProjectRenamed,
  onProjectDeleted,
  active,
  onOpen,
  onToast,
  refreshKey = 0,
  onUploadComplete,
}: ProjectExplorerProps) {
  const [trees, setTrees] = useState<Record<string, ProjectFileTree>>({});
  const {
    workspaceOpen,
    setWorkspaceOpen,
    expandedProjects,
    setExpandedProjects,
    expandedFolders,
    setExpandedFolders,
  } = usePersistedExplorerTree();
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragTarget, setDragTarget] = useState<{ projectId: string; folderId?: string } | null>(null);
  const dragDepth = useRef(0);

  const defaultFolderExpanded = useCallback(
    () => ({
      config: true,
      templates: true,
      schemas: true,
      fixtures: true,
      blocks: false,
      assets: false,
      fonts: false,
    }),
    [],
  );

  const loadTree = useCallback(
    (projectId: string) => {
      if (!projectId) return;
      api
        .fileTree(projectId)
        .then((tree) => setTrees((prev) => ({ ...prev, [projectId]: tree })))
        .catch((e) => onToast((e as Error).message));
    },
    [onToast],
  );

  const reloadExpandedTrees = useCallback(
    (opts?: { clearCache?: boolean }) => {
      if (opts?.clearCache) setTrees({});
      const expandedIds = Object.entries(expandedProjects)
        .filter(([, open]) => open)
        .map(([id]) => id);
      const ids = expandedIds.length > 0 ? expandedIds : pid ? [pid] : [];
      for (const id of ids) loadTree(id);
    },
    [expandedProjects, pid, loadTree],
  );

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const list = await api.projects();
      onProjectsChange(list);
      reloadExpandedTrees({ clearCache: true });
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [onProjectsChange, onToast, reloadExpandedTrees]);

  useEffect(() => {
    if (!pid && projects[0]) {
      onProject(projects[0].id);
      setExpandedProjects((p) => ({ ...p, [projects[0]!.id]: true }));
    }
  }, [pid, projects, onProject]);

  useEffect(() => {
    if (pid) {
      setExpandedProjects((p) => ({ ...p, [pid]: true }));
      loadTree(pid);
    }
  }, [pid, loadTree]);

  // Auto-refresh when parent bumps refreshKey (disk changes via SSE).
  useEffect(() => {
    if (refreshKey === 0) return;
    reloadExpandedTrees();
    api.projects().then(onProjectsChange).catch(() => {});
  }, [refreshKey, reloadExpandedTrees, onProjectsChange]);

  const toggleProject = (projectId: string) => {
    const willExpand = !expandedProjects[projectId];
    setExpandedProjects((p) => ({ ...p, [projectId]: willExpand }));
    onProject(projectId);
    if (!trees[projectId]) loadTree(projectId);
    setExpandedFolders((f) => ({ ...f, [projectId]: f[projectId] ?? defaultFolderExpanded() }));
  };

  const activateProject = (projectId: string) => {
    onProject(projectId);
    setExpandedProjects((p) => ({ ...p, [projectId]: true }));
    if (!trees[projectId]) loadTree(projectId);
    setExpandedFolders((f) => ({ ...f, [projectId]: f[projectId] ?? defaultFolderExpanded() }));
  };

  const uploadFiles = useCallback(
    async (projectId: string, folder: UploadFolderHint, fileList: FileList | File[]) => {
      const files = [...fileList];
      if (!files.length || !projectId) return;
      setUploading(true);
      try {
        const payload = await filesToUploadPayload(files);
        const res = await api.uploadFiles(projectId, {
          folder: folder === "auto" ? "auto" : folder,
          files: payload,
        });
        setTrees((prev) => ({ ...prev, [projectId]: res.tree }));
        activateProject(projectId);
        const ok = res.uploaded.length;
        if (ok > 0) {
          onToast(`Uploaded ${ok} file${ok > 1 ? "s" : ""}`);
          onUploadComplete?.();
        }
        if (res.errors.length > 0) {
          onToast(res.errors.slice(0, 3).join(" · ") + (res.errors.length > 3 ? " …" : ""));
        }
      } catch (e) {
        onToast((e as Error).message);
      } finally {
        setUploading(false);
        setDragTarget(null);
        dragDepth.current = 0;
      }
    },
    [onToast, onUploadComplete, onProject, trees, defaultFolderExpanded],
  );

  const pickAndUpload = async (projectId: string, folder: UploadFolderHint) => {
    const files = await pickFiles(EXPLORER_ACCEPT);
    if (files.length) await uploadFiles(projectId, folder, files);
  };

  const handleDragEnter = (projectId: string, folderId?: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setDragTarget({ projectId, folderId });
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragTarget(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop =
    (projectId: string, folder: UploadFolderHint) => async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepth.current = 0;
      setDragTarget(null);
      if (e.dataTransfer.files.length > 0) {
        await uploadFiles(projectId, folder, e.dataTransfer.files);
      }
    };

  const toggleFolder = (projectId: string, folderId: string) => {
    setExpandedFolders((f) => ({
      ...f,
      [projectId]: { ...(f[projectId] ?? defaultFolderExpanded()), [folderId]: !(f[projectId]?.[folderId] ?? true) },
    }));
  };

  function handleProjectCreated(project: ProjectSummary, kind: ProjectKind) {
    activateProject(project.id);
    if (kind === "framework") {
      onOpen({ kind: "block", id: "legal-footer", path: "blocks/legal-footer.lw" });
    } else {
      onOpen({ kind: "template", id: "document" });
    }
  }

  function handleProjectRenamed(oldId: string, newId: string) {
    setTrees((prev) => {
      const next = { ...prev };
      if (next[oldId]) {
        next[newId] = next[oldId];
        delete next[oldId];
      }
      return next;
    });
    setExpandedProjects((p) => {
      const next = { ...p };
      if (next[oldId]) {
        next[newId] = next[oldId];
        delete next[oldId];
      }
      return next;
    });
    setExpandedFolders((f) => {
      if (!f[oldId]) return f;
      const next = { ...f };
      next[newId] = f[oldId];
      delete next[oldId];
      return next;
    });
    onProjectRenamed(oldId, newId);
  }

  function handleProjectDeleted(id: string) {
    setTrees((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setExpandedProjects((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
    setExpandedFolders((f) => {
      const next = { ...f };
      delete next[id];
      return next;
    });
    onProjectDeleted(id);
  }

  async function linkFramework(projectId: string) {
    const fwId = window.prompt("Framework project id in workspace (e.g. acme-common):");
    if (!fwId?.trim()) return;
    try {
      const res = await api.addDependency(projectId, { project: fwId.trim() });
      setTrees((prev) => ({ ...prev, [projectId]: res.tree }));
      activateProject(projectId);
      onToast(`Linked framework “${fwId.trim()}”`);
    } catch (e) {
      onToast((e as Error).message);
    }
  }

  async function addFile(projectId: string, folderId: string) {
    if (folderId === "dependencies") {
      void linkFramework(projectId);
      return;
    }
    if (!CREATABLE.has(folderId)) return;
    const name = window.prompt(`New ${folderLabel(folderId)} name:`);
    if (!name?.trim()) return;
    try {
      const res = await api.createFile(projectId, {
        folder: folderId as "templates" | "schemas" | "fixtures" | "blocks",
        name: name.trim(),
        datasourceName: folderId === "schemas" ? name.trim().toUpperCase() : undefined,
      });
      setTrees((prev) => ({ ...prev, [projectId]: res.tree }));
      onToast(`Created ${res.file.name}`);
      activateProject(projectId);
      openEntry(res.file);
    } catch (e) {
      onToast((e as Error).message);
    }
  }

  function openEntry(file: ProjectFileEntry) {
    switch (file.kind) {
      case "template":
        if (file.id) onOpen({ kind: "template", id: file.id });
        break;
      case "schema":
        if (file.id) onOpen({ kind: "schema", name: file.id });
        break;
      case "fixture":
        if (file.id) onOpen({ kind: "fixture", key: file.id });
        break;
      case "block":
        if (file.id)
          onOpen({
            kind: "block",
            id: file.id,
            path: file.path,
            readOnly: file.readOnly,
            frameworkProject: file.frameworkProject,
          });
        break;
      case "manifest":
        onOpen({ kind: "manifest", path: file.path });
        break;
      case "asset":
        onOpen({ kind: "asset", name: file.name });
        break;
      case "font":
        onOpen({ kind: "font", name: file.name });
        break;
    }
  }

  function isActiveFile(file: ProjectFileEntry, projectId: string): boolean {
    if (!active || pid !== projectId) return false;
    if (file.kind === "template" && active.kind === "template") return file.id === active.id;
    if (file.kind === "schema" && active.kind === "schema") return file.id === active.name;
    if (file.kind === "fixture" && active.kind === "fixture") return file.id === active.key;
    if (file.kind === "block" && active.kind === "block") return file.id === active.id;
    if (file.kind === "manifest" && active.kind === "manifest") return file.path === active.path;
    return false;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0b0d12] text-xs">
      <div className="flex shrink-0 items-center gap-1 border-b border-white/5 px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-wide text-white/45">
          Explorer
        </span>
        <button
          type="button"
          title="Upload files (auto-detect type)"
          disabled={!pid || uploading}
          onClick={() => pid && void pickAndUpload(pid, "auto")}
          className="rounded px-1.5 py-0.5 text-[11px] text-white/45 hover:bg-white/5 hover:text-white/80 disabled:opacity-40"
        >
          {uploading ? "…" : "↑"}
        </button>
        <button
          type="button"
          title="Refresh workspace and file trees"
          disabled={refreshing}
          onClick={() => void refreshAll()}
          className="rounded px-2 py-0.5 text-[11px] text-white/45 hover:bg-white/5 hover:text-white/80 disabled:opacity-40"
        >
          {refreshing ? "…" : "↻"}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {/* Workspace root — not selectable, only expands */}
        <div className="mb-0.5">
          <div className="flex items-center gap-0.5 px-1">
            <button
              type="button"
              onClick={() => setWorkspaceOpen((o) => !o)}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-left font-semibold text-white/70 hover:bg-white/5"
            >
              <span className="w-3 shrink-0 text-[10px]">{workspaceOpen ? "▾" : "▸"}</span>
              <span>Workspace</span>
              <span className="ml-auto text-[10px] font-normal text-white/25">{projects.length}</span>
            </button>
            <CreateProjectMenu
              onProjectsChange={onProjectsChange}
              onCreated={handleProjectCreated}
              onToast={onToast}
            />
          </div>

          {workspaceOpen && (
            <ul className="pb-1 pl-2">
              {projects.length === 0 ? (
                <li className="px-3 py-2 text-[10px] text-white/35">
                  No projects yet — click <strong>+</strong> to create one.
                </li>
              ) : (
                projects.map((project) => (
                  <ProjectNode
                    key={project.id}
                    project={project}
                    active={pid === project.id}
                    expanded={!!expandedProjects[project.id]}
                    tree={trees[project.id]}
                    folderExpanded={expandedFolders[project.id] ?? {}}
                    onToggle={() => toggleProject(project.id)}
                    onToggleFolder={(folderId) => toggleFolder(project.id, folderId)}
                    onAddFile={(folderId) => void addFile(project.id, folderId)}
                    onOpenFile={openEntry}
                    isActiveFile={(file) => isActiveFile(file, project.id)}
                    onProjectsChange={onProjectsChange}
                    onRenamed={handleProjectRenamed}
                    onDeleted={handleProjectDeleted}
                    onActivate={activateProject}
                    onToast={onToast}
                    dragTarget={dragTarget}
                    uploading={uploading}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onPickUpload={pickAndUpload}
                  />
                ))
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectNode({
  project,
  active,
  expanded,
  tree,
  folderExpanded,
  onToggle,
  onToggleFolder,
  onAddFile,
  onOpenFile,
  isActiveFile,
  onProjectsChange,
  onRenamed,
  onDeleted,
  onActivate,
  onToast,
  dragTarget,
  uploading,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onPickUpload,
}: {
  project: ProjectSummary;
  active: boolean;
  expanded: boolean;
  tree?: ProjectFileTree;
  folderExpanded: Record<string, boolean>;
  onToggle: () => void;
  onToggleFolder: (folderId: string) => void;
  onAddFile: (folderId: string) => void;
  onOpenFile: (file: ProjectFileEntry) => void;
  isActiveFile: (file: ProjectFileEntry) => boolean;
  onProjectsChange: (projects: ProjectSummary[]) => void;
  onRenamed: (oldId: string, newId: string) => void;
  onDeleted: (id: string) => void;
  onActivate: (id: string) => void;
  onToast: (msg: string) => void;
  dragTarget: { projectId: string; folderId?: string } | null;
  uploading: boolean;
  onDragEnter: (projectId: string, folderId?: string) => (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (projectId: string, folder: UploadFolderHint) => (e: React.DragEvent) => Promise<void>;
  onPickUpload: (projectId: string, folder: UploadFolderHint) => Promise<void>;
}) {
  const isDragOverProject =
    dragTarget?.projectId === project.id && dragTarget.folderId === undefined;
  return (
    <li className="group mb-0.5">
      <div className="flex items-center gap-0.5 pr-1">
        <button
          type="button"
          onClick={onToggle}
          title="Expand or collapse project"
          className={`flex min-w-0 flex-1 items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-white/5 ${
            active ? "bg-indigo-500/10 text-indigo-100" : "text-white/75"
          }`}
        >
          <span className="w-3 shrink-0 text-[10px]">{expanded ? "▾" : "▸"}</span>
          <span className="truncate font-medium">{project.name}</span>
          <span className="truncate font-mono text-[10px] text-white/25">{project.id}</span>
          {project.kind === "framework" && (
            <span className="shrink-0 rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-200/90">
              FW
            </span>
          )}
        </button>
        <ProjectActionsMenu
          project={project}
          active={active}
          onProjectsChange={onProjectsChange}
          onActivate={onActivate}
          onRenamed={onRenamed}
          onDeleted={onDeleted}
          onToast={onToast}
        />
      </div>

      {expanded && (
        <div
          className="relative pl-3"
          onDragEnter={onDragEnter(project.id)}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={(e) => void onDrop(project.id, "auto")(e)}
        >
          {isDragOverProject && (
            <div className="pointer-events-none absolute inset-1 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-indigo-400/60 bg-indigo-500/15">
              <span className="px-2 text-center text-[10px] font-medium text-indigo-200">
                Drop files — .lw · .json · images · fonts
              </span>
            </div>
          )}
          {!tree ? (
            <p className="px-2 py-1 text-[10px] text-white/30">Loading…</p>
          ) : (
            tree.folders.map((folder) => {
              const fOpen = folderExpanded[folder.id] ?? (folder.id === "config" || folder.id === "templates");
              const canUpload = UPLOADABLE_FOLDER_IDS.has(folder.id);
              const isDragOverFolder =
                dragTarget?.projectId === project.id && dragTarget.folderId === folder.id;
              return (
                <div
                  key={folder.id}
                  className={`mb-0.5 rounded-md ${isDragOverFolder ? "bg-indigo-500/10 ring-1 ring-indigo-400/40" : ""}`}
                  onDragEnter={canUpload ? onDragEnter(project.id, folder.id) : undefined}
                  onDragLeave={canUpload ? onDragLeave : undefined}
                  onDragOver={canUpload ? onDragOver : undefined}
                  onDrop={canUpload ? (e) => void onDrop(project.id, folder.id as UploadFolderHint)(e) : undefined}
                >
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => onToggleFolder(folder.id)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-2 py-0.5 text-left text-white/50 hover:bg-white/5 hover:text-white/80"
                    >
                      <span className="w-3 shrink-0 text-[10px]">{fOpen ? "▾" : "▸"}</span>
                      <span className="truncate">{folder.label}</span>
                      <span className="ml-auto text-[10px] text-white/25">{folder.files.length}</span>
                    </button>
                    {canUpload && (
                      <button
                        type="button"
                        title={`Upload to ${folder.label}`}
                        disabled={uploading}
                        onClick={() => void onPickUpload(project.id, folder.id as UploadFolderHint)}
                        className="rounded px-1 py-0.5 text-white/30 hover:bg-emerald-500/20 hover:text-emerald-200 disabled:opacity-40"
                      >
                        ↑
                      </button>
                    )}
                    {(CREATABLE.has(folder.id) || folder.id === "dependencies") && (
                      <button
                        type="button"
                        title={`Add to ${folder.label}`}
                        onClick={() => onAddFile(folder.id)}
                        className="rounded px-1 py-0.5 text-white/30 hover:bg-indigo-500/20 hover:text-indigo-200"
                      >
                        +
                      </button>
                    )}
                  </div>
                  {fOpen && (
                    <ul className="pb-0.5 pl-4">
                      {folder.files.length === 0 ? (
                        <li className="px-2 py-0.5 text-[10px] text-white/25">Empty</li>
                      ) : (
                        folder.files.map((file) => (
                          <li key={file.path}>
                            <button
                              type="button"
                              onClick={() => onOpenFile(file)}
                              className={`flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left font-mono hover:bg-white/5 ${
                                isActiveFile(file) ? "bg-indigo-500/15 text-indigo-200" : "text-white/60"
                              }`}
                            >
                              <FileIcon kind={file.kind} />
                              <span className="truncate">{file.name}</span>
                              {file.readOnly && (
                                <span className="shrink-0 text-[9px] text-amber-200/60">shared</span>
                              )}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </li>
  );
}

function folderLabel(id: string): string {
  switch (id) {
    case "templates":
      return "template";
    case "schemas":
      return "data model";
    case "fixtures":
      return "test case";
    case "blocks":
      return "block";
    case "dependencies":
      return "framework link";
    case "assets":
      return "image";
    case "fonts":
      return "font";
    default:
      return "file";
  }
}

function FileIcon({ kind }: { kind: ProjectFileEntry["kind"] }) {
  const icon =
    kind === "template"
      ? "▣"
      : kind === "schema"
        ? "{}"
        : kind === "fixture"
          ? "◎"
          : kind === "block"
            ? "◆"
            : kind === "asset"
              ? "▣"
              : kind === "font"
                ? "A"
                : kind === "manifest"
                  ? "⚙"
                  : "·";
  return <span className="w-3 shrink-0 text-center text-[10px] text-white/35">{icon}</span>;
}
