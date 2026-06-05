import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { html as cmHtml } from "@codemirror/lang-html";
import { json as cmJson } from "@codemirror/lang-json";
import { autocompletion } from "@codemirror/autocomplete";
import { bindingCompletionSource } from "./bindings/bindingCompletion";
import { bindingHints } from "./bindings/schemaHints";
import {
  DEFAULT_PAGE_LAYOUT,
  extractPageLayoutFromDoc,
  upsertPageLayoutStyle,
  type PageLayoutSettings,
  parseLw,
  serializeLw,
  type LwDocument,
  type Node,
} from "@lw-text/engine";
import {
  api,
  type BlockReference,
  type Diagnostic,
  type FontInfo,
  type ProjectDetail,
  type ProjectSummary,
  type TestCaseSummary,
} from "./api";
import { Palette } from "./visual/Palette";
import { AlignmentField, isAlignableElement } from "./visual/AlignmentField";
import { VersionHistoryPanel } from "./version/VersionHistoryPanel";
import { DesignCanvas } from "./visual/DesignCanvas";
import { DocumentPage, DocumentSurface, PreviewFrame } from "./preview/documentPage";
import { Inspector } from "./visual/Inspector";
import { StructureTree } from "./visual/StructureTree";
import { DataModelDesigner } from "./model/DataModelDesigner";
import {
  createNode,
  duplicateNode,
  getNode,
  insertChild,
  isContainer,
  moveNode,
  moveNodeTo,
  removeNode,
  updateNode,
  type Path,
  type PaletteKind,
} from "./visual/editorModel";
import { applyBoxSizeToStyle, isResizableTag, type BoxSize } from "./visual/boxStyle";
import { loadLayout, normalizeSizes, saveLayout, type PanelId, type PanelLayout } from "./layout/panelLayout";
import { PageLayoutPanel } from "./layout/PageLayoutPanel";
import { PanelVisibilityToggles, ResizablePanel, ResizablePanelGroup } from "./layout/ResizablePanelGroup";
import { ProjectExplorer, type ExplorerOpen } from "./explorer/ProjectExplorer";
import { TestCaseBar } from "./testCases/TestCaseBar";
import { EditorCommandBar, type EditorCommandProps } from "./editor/EditorCommandBar";
import { useDocumentHistory } from "./editor/documentHistory";
import { useGlobalShortcuts } from "./editor/useGlobalShortcuts";
import { locateNodeInSource } from "./editor/sourceLocator";
import {
  clearSourceHighlight,
  revealSourceRange,
  sourceHighlightExtension,
} from "./editor/sourceHighlight";
import type { EditorView } from "@codemirror/view";
import { diagnosticsLinter } from "./diagnostics/codemirrorLint";
import {
  diagnoseJson,
  diagnoseTemplateParse,
  statusLabel,
} from "./diagnostics/diagnose";
import { DiagnosticsPanel, EditorDiagnosticsStrip } from "./diagnostics/DiagnosticsPanel";
import { lintGutter } from "@codemirror/lint";

type Tab = "template" | "data";
type MiddleView = "preview" | "design";
type WorkspaceMode = "author" | "model";
type TypoPreset = "comfortable" | "compact" | "reading";

interface TypographySettings {
  bodyFont: string;
  headingFont: string;
  baseSizePx: number;
  lineHeight: number;
  letterSpacingPx: number;
}

const TYPO_ID = "lw-typography";
type EditorTarget =
  | { kind: "template"; id: string }
  | { kind: "file"; path: string; label: string; readOnly?: boolean };

const DEFAULT_TYPO: TypographySettings = {
  bodyFont: "var(--font-sans, sans-serif)",
  headingFont: "var(--font-sans, sans-serif)",
  baseSizePx: 11,
  lineHeight: 1.55,
  letterSpacingPx: 0,
};

// ── Session persistence ─────────────────────────────────────────────────
// Saves workspace state to localStorage so the open project, template,
// scenario, and view mode survive a page refresh.
const SESSION_KEY = "lw-studio-session";

interface SessionState {
  pid: string;
  tid: string;
  testCaseKey: string;
  tab: Tab;
  middleView: MiddleView;
  workspaceMode: WorkspaceMode;
  schemaName?: string;
}

function loadSession(): Partial<SessionState> {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSession(s: Partial<SessionState>) {
  try {
    const prev = loadSession();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...prev, ...s }));
  } catch { /* localStorage may be unavailable */ }
}

const _saved = loadSession();

export default function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [pid, setPid] = useState<string>(_saved.pid ?? "");
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [tid, setTid] = useState<string>(_saved.tid ?? "");
  const { source, setPresent, reset: resetSource, undo, redo, canUndo, canRedo } = useDocumentHistory("");
  const [savingDocument, setSavingDocument] = useState(false);
  const [versionRefresh, setVersionRefresh] = useState(0);
  const [dataText, setDataText] = useState<string>("{}");
  const [testCaseKey, setTestCaseKey] = useState<string>(_saved.testCaseKey ?? "");
  const [tab, setTab] = useState<Tab>(_saved.tab ?? "template");
  const [html, setHtml] = useState<string>("");
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [references, setReferences] = useState<BlockReference[]>([]);
  const [fontCss, setFontCss] = useState<string>("");
  const [middleView, setMiddleView] = useState<MiddleView>(_saved.middleView ?? "preview");
  const [selected, setSelected] = useState<Path | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(_saved.workspaceMode ?? "author");
  const [panelLayout, setPanelLayout] = useState<PanelLayout>(loadLayout);
  const [typographyDraft, setTypographyDraft] = useState<TypographySettings>(DEFAULT_TYPO);
  const [pageLayoutDraft, setPageLayoutDraft] = useState<PageLayoutSettings>(DEFAULT_PAGE_LAYOUT);
  const [explorerActive, setExplorerActive] = useState<ExplorerOpen | null>(null);
  const [explorerRefresh, setExplorerRefresh] = useState(0);
  const [savingCase, setSavingCase] = useState(false);
  const [editorTarget, setEditorTarget] = useState<EditorTarget>({ kind: "template", id: "" });
  const [schemaName, setSchemaName] = useState(_saved.schemaName ?? "DATA");
  const fileSaveTimer = useRef<number | undefined>(undefined);
  const modelSaveRef = useRef<(() => void) | null>(null);
  const templateEditorRef = useRef<EditorView | null>(null);

  const togglePanel = useCallback((id: PanelId) => {
    setPanelLayout((prev) => {
      const hidden = { ...prev.hidden, [id]: !prev.hidden[id] };
      const visible = (["explorer", "editor", "center", "sidebar"] as PanelId[]).filter((p) => !hidden[p]);
      if (visible.length === 0) return prev;
      const next = { ...prev, hidden, sizes: normalizeSizes(prev.sizes, hidden) };
      saveLayout(next);
      return next;
    });
  }, []);

  // Mirror the live editor buffers + the last value loaded from disk so the
  // SSE watcher can tell apart "no local edits" (safe to adopt) from "user has
  // unsaved edits" (don't clobber).
  const sourceRef = useRef("");
  const lastLoadedSourceRef = useRef("");
  const dataRef = useRef("{}");
  const lastLoadedDataRef = useRef("{}");
  useEffect(() => {
    sourceRef.current = source;
  }, [source]);
  useEffect(() => {
    dataRef.current = dataText;
  }, [dataText]);

  // Persist workspace state so the session survives a page refresh.
  const sessionRestored = useRef(false);
  useEffect(() => { saveSession({ pid }); }, [pid]);
  useEffect(() => { saveSession({ tid }); }, [tid]);
  useEffect(() => { saveSession({ testCaseKey }); }, [testCaseKey]);
  useEffect(() => { saveSession({ tab }); }, [tab]);
  useEffect(() => { saveSession({ middleView }); }, [middleView]);
  useEffect(() => { saveSession({ workspaceMode }); }, [workspaceMode]);
  useEffect(() => { saveSession({ schemaName }); }, [schemaName]);

  // bootstrap — restore saved project or fall back to first in list
  useEffect(() => {
    api.projects()
      .then((p) => {
        setProjects(p);
        const validSaved = pid && p.some((proj) => proj.id === pid);
        if (!validSaved && p[0]) setPid(p[0].id);
      })
      .catch((e) => setToast(String(e.message)));
  }, []);

  const loadCase = useCallback(
    (key: string) => {
      if (!pid || !key) return;
      setTestCaseKey(key);
      api
        .testCase(pid, key)
        .then((tc) => {
          const text = JSON.stringify(tc.dataSources, null, 2);
          lastLoadedDataRef.current = text;
          setDataText(text);
        })
        .catch((e) => setToast(String((e as Error).message)));
    },
    [pid],
  );

  const openTemplate = useCallback(
    (id: string) => {
      setTid(id);
      setEditorTarget({ kind: "template", id });
      setExplorerActive({ kind: "template", id });
      setTab("template");
      setWorkspaceMode("author");
    },
    [],
  );

  // load project detail — on first mount, restore saved template if valid
  useEffect(() => {
    if (!pid) return;
    api.project(pid).then((d) => {
      setDetail(d);
      if (!sessionRestored.current) {
        sessionRestored.current = true;
        if (_saved.tid && d.templates.some((t) => t.id === _saved.tid)) {
          openTemplate(_saved.tid!);
          return;
        }
      }
      if (d.templates[0]) openTemplate(d.templates[0].id);
    });
    api.aiContext(pid).then((c) => setSchema(c.dataSources as Record<string, unknown>)).catch(() => {});
    api.references(pid).then(setReferences).catch(() => setReferences([]));
    api.fonts(pid).then((f) => setFontCss(fontCssFromList(pid, f))).catch(() => setFontCss(""));
  }, [pid, openTemplate]);

  // test cases available for the active template (fall back to all)
  const activeTemplateId = editorTarget.kind === "template" ? editorTarget.id : tid;

  const templateCases = useMemo<TestCaseSummary[]>(() => {
    if (!detail) return [];
    const own = detail.testCases.filter((c) => c.templateId === activeTemplateId);
    return own.length ? own : detail.testCases.filter((c) => c.templateId === activeTemplateId);
  }, [detail, activeTemplateId]);

  const dataDirty = dataText !== lastLoadedDataRef.current;
  const sourceDirty = source !== lastLoadedSourceRef.current;
  const documentReadOnly = editorTarget.kind === "file" && !!editorTarget.readOnly;

  const activeFilePath = useMemo(() => {
    if (!pid) return null;
    if (tab === "data" && testCaseKey) return `fixtures/${testCaseKey}.json`;
    if (editorTarget.kind === "template" && editorTarget.id) return `templates/${editorTarget.id}.lw`;
    if (editorTarget.kind === "file") return editorTarget.path;
    return null;
  }, [pid, tab, testCaseKey, editorTarget]);

  const versionEditorContent = tab === "data" ? dataText : source;

  const jsonDiagnostics = useMemo(() => diagnoseJson(dataText), [dataText]);
  const jsonDiagnosticsRef = useRef(jsonDiagnostics);
  jsonDiagnosticsRef.current = jsonDiagnostics;

  const parsedData = useMemo<Record<string, unknown> | null>(() => {
    if (jsonDiagnostics.length > 0) return null;
    try {
      return JSON.parse(dataText || "{}");
    } catch {
      return null;
    }
  }, [dataText, jsonDiagnostics]);

  const refreshProjectDetail = useCallback(async () => {
    if (!pid) return;
    const d = await api.project(pid);
    setDetail(d);
    setExplorerRefresh((n) => n + 1);
  }, [pid]);

  const saveDocument = useCallback(async () => {
    if (!pid || documentReadOnly || !sourceDirty) return;
    const path =
      editorTarget.kind === "template" ? `templates/${editorTarget.id}.lw` : editorTarget.path;
    setSavingDocument(true);
    try {
      window.clearTimeout(fileSaveTimer.current);
      await api.writeFile(pid, path, source);
      lastLoadedSourceRef.current = source;
      setVersionRefresh((n) => n + 1);
      setToast(`Saved ${path}`);
    } catch (e) {
      setToast(String((e as Error).message));
    } finally {
      setSavingDocument(false);
    }
  }, [pid, editorTarget, source, sourceDirty, documentReadOnly]);

  const handleRestoreVersion = useCallback(
    (content: string) => {
      if (tab === "data") {
        lastLoadedDataRef.current = content;
        setDataText(content);
      } else {
        lastLoadedSourceRef.current = content;
        resetSource(content);
      }
      setVersionRefresh((n) => n + 1);
    },
    [tab, resetSource],
  );

  const saveActiveCase = useCallback(async () => {
    if (!pid || !testCaseKey || parsedData === null) return;
    setSavingCase(true);
    try {
      await api.saveTestCase(pid, testCaseKey, parsedData);
      lastLoadedDataRef.current = dataText;
      setVersionRefresh((n) => n + 1);
      setToast("Scenario saved");
      await refreshProjectDetail();
    } catch (e) {
      setToast(String((e as Error).message));
    } finally {
      setSavingCase(false);
    }
  }, [pid, testCaseKey, parsedData, dataText, refreshProjectDetail]);

  const createCase = useCallback(
    async (input: {
      title: string;
      caseId: string;
      description?: string;
      copyFromKey?: string;
      useCurrentData?: boolean;
    }) => {
      if (!pid || !activeTemplateId) return;
      const res = await api.createTestCase(pid, {
        templateId: activeTemplateId,
        title: input.title,
        caseId: input.caseId,
        description: input.description,
        copyFromKey: input.useCurrentData ? undefined : input.copyFromKey,
        dataSources: input.useCurrentData && parsedData !== null ? parsedData : undefined,
      });
      setDetail((d) => (d ? { ...d, testCases: res.testCases } : d));
      setExplorerRefresh((n) => n + 1);
      loadCase(res.key);
      setToast(`Created “${input.title}”`);
    },
    [pid, activeTemplateId, parsedData, loadCase],
  );

  const deleteCase = useCallback(
    async (key: string) => {
      if (!pid) return;
      const res = await api.deleteTestCase(pid, key);
      setDetail((d) => (d ? { ...d, testCases: res.testCases } : d));
      setExplorerRefresh((n) => n + 1);
      const remaining = res.testCases.filter((c) => c.templateId === activeTemplateId);
      const next = remaining.find((c) => c.isDefault) ?? remaining[0];
      if (next) loadCase(next.key);
      else {
        setTestCaseKey("");
        setDataText("{}");
        lastLoadedDataRef.current = "{}";
      }
      setToast("Scenario deleted");
    },
    [pid, activeTemplateId, loadCase],
  );

  const handleGlobalSave = useCallback(() => {
    if (workspaceMode === "model") {
      modelSaveRef.current?.();
      return;
    }
    if (tab === "data") void saveActiveCase();
    else void saveDocument();
  }, [workspaceMode, tab, saveActiveCase, saveDocument]);

  useGlobalShortcuts(
    {
      onSave: handleGlobalSave,
      onUndo: undo,
      onRedo: redo,
    },
    tab === "template" && workspaceMode === "author" && !documentReadOnly,
  );

  useEffect(() => {
    if (tab !== "data" || !templateCases.length || testCaseKey) return;
    const pick = templateCases.find((c) => c.isDefault) ?? templateCases[0];
    if (pick) loadCase(pick.key);
  }, [tab, templateCases, testCaseKey, loadCase]);

  const handleExplorerOpen = useCallback(
    (item: ExplorerOpen) => {
      setExplorerActive(item);
      switch (item.kind) {
        case "template":
          openTemplate(item.id);
          break;
        case "schema":
          setSchemaName(item.name);
          setWorkspaceMode("model");
          break;
        case "fixture":
          setWorkspaceMode("author");
          setTab("data");
          loadCase(item.key);
          break;
        case "block":
        case "manifest":
          setWorkspaceMode("author");
          setTab("template");
          setEditorTarget({
            kind: "file",
            path: item.path,
            label: item.kind === "block" && item.readOnly ? `${item.path} (framework)` : item.path,
            readOnly: item.kind === "block" ? item.readOnly : undefined,
          });
          break;
        case "asset":
          setToast("Select an image on the design canvas, then use Properties to manage assets.");
          setMiddleView("design");
          break;
        case "font":
          setToast("Use Template typography or element font settings to apply uploaded fonts.");
          break;
      }
    },
    [openTemplate, loadCase],
  );

  // Load editor content for the active template or project file.
  useEffect(() => {
    if (!pid || !detail) return;
    if (editorTarget.kind === "template") {
      if (!editorTarget.id) return;
      api.template(pid, editorTarget.id).then((t) => {
        lastLoadedSourceRef.current = t.source;
        resetSource(t.source);
      });
      // On restore, keep the saved test-case if it belongs to this template.
      if (testCaseKey && templateCases.some((c) => c.key === testCaseKey)) {
        loadCase(testCaseKey);
        return;
      }
      const chosen =
        templateCases.find((c) => c.templateId === editorTarget.id && c.isDefault) ??
        templateCases.find((c) => c.templateId === editorTarget.id) ??
        templateCases.find((c) => c.isDefault) ??
        templateCases[0];
      if (chosen) loadCase(chosen.key);
      return;
    }
    api.readFile(pid, editorTarget.path).then((f) => {
      lastLoadedSourceRef.current = f.content;
      resetSource(f.content);
    }).catch((e) => setToast(String((e as Error).message)));
  }, [pid, detail, editorTarget, templateCases, loadCase]);

  const handleSourceChange = useCallback((value: string) => setPresent(value), [setPresent]);

  // Live reload: subscribe to on-disk file changes (e.g. edits from Claude
  // Code or the CLI) and refresh the UI without a manual page reload.
  useEffect(() => {
    if (!pid) return;
    const es = new EventSource(api.eventsUrl(pid));
    let debounce: number | undefined;

    const sync = () => {
      setExplorerRefresh((n) => n + 1);
      // Project list + explorer trees (templates, blocks, frameworks on disk).
      api.projects().then(setProjects).catch(() => {});
      // Project structure may have changed (new templates / schemas / cases).
      api.project(pid).then(setDetail).catch(() => {});
      api.references(pid).then(setReferences).catch(() => {});
      api
        .aiContext(pid)
        .then((c) => setSchema(c.dataSources as Record<string, unknown>))
        .catch(() => {});
      api.fonts(pid).then((f) => setFontCss(fontCssFromList(pid, f))).catch(() => {});

      // Active template source — adopt the disk version unless the user has
      // local unsaved edits in the Studio editor.
      if (editorTarget.kind === "template" && editorTarget.id) {
        api
          .template(pid, editorTarget.id)
          .then((t) => {
            if (sourceRef.current === t.source) {
              lastLoadedSourceRef.current = t.source;
              return;
            }
            if (sourceRef.current === lastLoadedSourceRef.current) {
              lastLoadedSourceRef.current = t.source;
              resetSource(t.source);
              setToast("↻ Updated from disk");
            } else {
              setToast("File changed on disk — your local edits were kept");
            }
          })
          .catch(() => {});
      } else if (editorTarget.kind === "file") {
        api
          .readFile(pid, editorTarget.path)
          .then((f) => {
            if (sourceRef.current === f.content) {
              lastLoadedSourceRef.current = f.content;
              return;
            }
            if (sourceRef.current === lastLoadedSourceRef.current) {
              lastLoadedSourceRef.current = f.content;
              resetSource(f.content);
              setToast("↻ Updated from disk");
            }
          })
          .catch(() => {});
      }

      // Active test-case data — same local-edit guard for fixtures.
      if (testCaseKey) {
        api
          .testCase(pid, testCaseKey)
          .then((tc) => {
            const text = JSON.stringify(tc.dataSources, null, 2);
            if (dataRef.current === text) {
              lastLoadedDataRef.current = text;
              return;
            }
            if (dataRef.current === lastLoadedDataRef.current) {
              lastLoadedDataRef.current = text;
              setDataText(text);
            }
          })
          .catch(() => {});
      }
    };

    es.addEventListener("change", () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(sync, 150);
    });

    return () => {
      window.clearTimeout(debounce);
      es.close();
    };
  }, [pid, editorTarget, testCaseKey]);

  const templateParseDiagnostics = useMemo(() => diagnoseTemplateParse(source), [source]);
  const templateParseRef = useRef(templateParseDiagnostics);
  templateParseRef.current = templateParseDiagnostics;
  const bindingDiagnosticsRef = useRef<Diagnostic[]>([]);
  bindingDiagnosticsRef.current = diagnostics;

  const jsonLint = useMemo(
    () => [diagnosticsLinter(() => jsonDiagnosticsRef.current), lintGutter()],
    [],
  );
  const templateLint = useMemo(
    () => [
      diagnosticsLinter(() => [...templateParseRef.current, ...bindingDiagnosticsRef.current]),
      lintGutter(),
      sourceHighlightExtension,
    ],
    [],
  );

  // Canonical source ⇄ IR for the visual editor (low priority so typing/resize stays snappy).
  const [doc, setDoc] = useState<LwDocument | null>(null);
  useEffect(() => {
    if (templateParseDiagnostics.length > 0) {
      setDoc(null);
      return;
    }
    startTransition(() => {
      try {
        setDoc(source ? parseLw(source) : null);
      } catch {
        setDoc(null);
      }
    });
  }, [source, templateParseDiagnostics]);

  // Structure / canvas selection → scroll + highlight matching markup in the code editor.
  useEffect(() => {
    const view = templateEditorRef.current;
    if (tab !== "template" || !view || !doc || !selected) return;
    const range = locateNodeInSource(source, doc, selected);
    if (range) revealSourceRange(view, range);
  }, [tab, doc, selected, source]);

  useEffect(() => {
    if (tab !== "template" && templateEditorRef.current) {
      clearSourceHighlight(templateEditorRef.current);
    }
  }, [tab]);

  const sidebarDiagnostics = useMemo(() => {
    if (tab === "data") return jsonDiagnostics;
    return [...templateParseDiagnostics, ...diagnostics];
  }, [tab, jsonDiagnostics, templateParseDiagnostics, diagnostics]);

  const topStatus = useMemo(
    () =>
      statusLabel([...jsonDiagnostics, ...templateParseDiagnostics, ...diagnostics], {
        dataInvalid: parsedData === null && jsonDiagnostics.length === 0,
      }),
    [jsonDiagnostics, templateParseDiagnostics, diagnostics, parsedData],
  );

  const applyDoc = useCallback((next: LwDocument) => setPresent(serializeLw(next)), [setPresent]);

  const selectedNode = useMemo(() => (doc && selected ? getNode(doc, selected) : null), [doc, selected]);
  const variableHints = useMemo(() => bindingHints(schema, parsedData), [schema, parsedData]);
  const templateCompletion = useMemo(() => bindingCompletionSource(variableHints), [variableHints]);

  useEffect(() => {
    if (!doc) {
      setTypographyDraft(DEFAULT_TYPO);
      setPageLayoutDraft(DEFAULT_PAGE_LAYOUT);
      return;
    }
    setTypographyDraft(extractTypographySettings(doc) ?? DEFAULT_TYPO);
    setPageLayoutDraft(extractPageLayoutFromDoc(doc) ?? DEFAULT_PAGE_LAYOUT);
  }, [doc, tid]);

  const handleInsert = useCallback(
    (parentPath: Path, index: number, kind: PaletteKind) => {
      if (!doc) return;
      applyDoc(insertChild(doc, parentPath, index, createNode(kind)));
      setSelected([...parentPath, index]);
    },
    [doc, applyDoc],
  );

  const handleAdd = useCallback(
    (kind: PaletteKind) => {
      if (!doc) return;
      // Append inside the selected container, else at document end.
      if (selected) {
        const node = getNode(doc, selected);
        if (node && isContainer(node)) {
          const len = (node.type === "element" || node.type === "if" || node.type === "repeat" ? node.children.length : 0);
          handleInsert(selected, len, kind);
          return;
        }
      }
      handleInsert([], doc.nodes.length, kind);
    },
    [doc, selected, handleInsert],
  );

  const handleEditText = useCallback(
    (path: Path, value: string) => {
      if (!doc) return;
      applyDoc(updateNode(doc, path, (n) => {
        if (n.type === "text") n.text.template = value;
      }));
    },
    [doc, applyDoc],
  );

  const handlePatch = useCallback(
    (fn: (n: import("@lw-text/engine").Node) => void) => {
      if (!doc || !selected) return;
      applyDoc(updateNode(doc, selected, fn));
    },
    [doc, selected, applyDoc],
  );

  const handleAlignStyle = useCallback(
    (style: string) => {
      handlePatch((n) => {
        if (n.type !== "element") return;
        n.attrs.style = style;
      });
    },
    [handlePatch],
  );

  const handleMove = useCallback(
    (path: Path, dir: -1 | 1) => {
      if (!doc) return;
      applyDoc(moveNode(doc, path, dir));
      setSelected((prev) => {
        if (!prev) return prev;
        const next = [...prev];
        next[next.length - 1] = (next[next.length - 1] ?? 0) + dir;
        return next;
      });
    },
    [doc, applyDoc],
  );

  const handleDelete = useCallback(
    (path: Path) => {
      if (!doc) return;
      applyDoc(removeNode(doc, path));
      setSelected(null);
    },
    [doc, applyDoc],
  );

  const handleDuplicate = useCallback(
    (path: Path) => {
      if (!doc) return;
      const res = duplicateNode(doc, path);
      applyDoc(res.doc);
      setSelected(res.path);
    },
    [doc, applyDoc],
  );

  const handleMoveTo = useCallback(
    (from: Path, toParentPath: Path, toIndex: number) => {
      if (!doc) return;
      const res = moveNodeTo(doc, from, toParentPath, toIndex);
      applyDoc(res.doc);
      setSelected(res.path);
    },
    [doc, applyDoc],
  );

  const handleElementResize = useCallback(
    (path: Path, patch: Partial<BoxSize>) => {
      if (!doc) return;
      applyDoc(
        updateNode(doc, path, (n) => {
          if (n.type !== "element") return;
          if (n.tag === "img" || isResizableTag(n.tag)) {
            n.attrs.style = applyBoxSizeToStyle(n.attrs.style, patch);
          }
        }),
      );
    },
    [doc, applyDoc],
  );

  const applyTypography = useCallback(() => {
    if (!doc) return;
    applyDoc(upsertTypographyStyle(doc, typographyDraft));
    setToast("Typography applied to template");
  }, [doc, typographyDraft, applyDoc]);

  const applyPageLayout = useCallback(() => {
    if (!doc) return;
    applyDoc(upsertPageLayoutStyle(doc, pageLayoutDraft));
    setToast("Page layout applied to template");
  }, [doc, pageLayoutDraft, applyDoc]);

  // debounced live preview + validate (stale responses ignored)
  const timer = useRef<number | undefined>(undefined);
  const previewGen = useRef(0);
  const refresh = useCallback(() => {
    if (!pid || !source || editorTarget.kind !== "template") return;
    if (!doc || parsedData === null) {
      setDiagnostics([]);
      return;
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const gen = ++previewGen.current;
      const snapshotSource = source;
      const snapshotData = parsedData;
      try {
        const [p, v] = await Promise.all([
          api.preview(pid, snapshotSource, snapshotData, pageLayoutDraft),
          api.validate(pid, snapshotSource, snapshotData),
        ]);
        if (gen !== previewGen.current) return;
        setHtml(p.html);
        setWarnings(p.warnings);
        setDiagnostics(v.diagnostics);
      } catch (e) {
        if (gen !== previewGen.current) return;
        setDiagnostics([]);
        setToast(String((e as Error).message));
      }
    }, 500);
  }, [pid, source, parsedData, editorTarget, doc, pageLayoutDraft]);

  useEffect(refresh, [refresh]);

  const editorCommands = useMemo((): EditorCommandProps | null => {
    if (workspaceMode !== "author") return null;
    if (tab === "template") {
      return {
        kind: "template",
        dirty: sourceDirty,
        saving: savingDocument,
        readOnly: documentReadOnly,
        canUndo,
        canRedo,
        onUndo: undo,
        onRedo: redo,
        onSave: () => void saveDocument(),
        onRevert: () => resetSource(lastLoadedSourceRef.current),
      };
    }
    if (tab === "data" && activeTemplateId) {
      return {
        kind: "data",
        dirty: dataDirty && parsedData !== null,
        saving: savingCase,
        canSave: parsedData !== null && !!testCaseKey,
        onSave: () => void saveActiveCase(),
        onRevert: testCaseKey ? () => loadCase(testCaseKey) : undefined,
      };
    }
    return null;
  }, [
    workspaceMode,
    tab,
    sourceDirty,
    savingDocument,
    documentReadOnly,
    canUndo,
    canRedo,
    undo,
    redo,
    saveDocument,
    resetSource,
    dataDirty,
    parsedData,
    savingCase,
    activeTemplateId,
    testCaseKey,
    saveActiveCase,
    loadCase,
  ]);

  async function exportPdf() {
    if (!pid || parsedData === null) return;
    setBusy(true);
    try {
      const blob = await api.composePdf(pid, source, parsedData, pageLayoutDraft);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tid}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setToast(`PDF export: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {fontCss && <style>{fontCss}</style>}
      <TopBar
        status={topStatus}
        busy={busy}
        onExport={exportPdf}
        exportDisabled={parsedData === null || templateParseDiagnostics.length > 0}
        mode={workspaceMode}
        onMode={setWorkspaceMode}
        panelLayout={panelLayout}
        onTogglePanel={togglePanel}
        editorCommands={editorCommands}
      />

      {workspaceMode === "model" ? (
        <DataModelDesigner
          pid={pid}
          schemaNames={detail?.schemas ?? []}
          schemaName={schemaName}
          onSchemaName={setSchemaName}
          sampleData={parsedData}
          saveHandlerRef={modelSaveRef}
          onToast={setToast}
        />
      ) : (
      <ResizablePanelGroup layout={panelLayout} onLayoutChange={setPanelLayout}>
        <ResizablePanel id="explorer">
          <ProjectExplorer
            projects={projects}
            pid={pid}
            onProject={setPid}
            onProjectsChange={setProjects}
            onProjectRenamed={(oldId, newId) => {
              if (pid === oldId) setPid(newId);
            }}
            onProjectDeleted={(id) => {
              if (pid === id) {
                const next = projects.find((p) => p.id !== id);
                setPid(next?.id ?? "");
                setDetail(null);
              }
            }}
            active={explorerActive}
            onOpen={handleExplorerOpen}
            onToast={setToast}
            refreshKey={explorerRefresh}
            onUploadComplete={() => {
              setExplorerRefresh((n) => n + 1);
              if (pid) {
                api.project(pid).then(setDetail).catch(() => {});
                api.fonts(pid).then((f) => setFontCss(fontCssFromList(pid, f))).catch(() => {});
              }
            }}
          />
        </ResizablePanel>

        <ResizablePanel
          id="editor"
          header={
            <div className="flex min-w-0 items-center gap-1 px-3 py-2 text-xs">
              <TabButton active={tab === "template"} onClick={() => setTab("template")}>
                {editorTarget.kind === "file" ? editorTarget.label : `${tid || "template"}.lw`}
              </TabButton>
              <TabButton active={tab === "data"} onClick={() => setTab("data")}>
                data.json {jsonDiagnostics.length > 0 && <span className="text-rose-400">●</span>}
              </TabButton>
              {tab === "data" && activeTemplateId && (
                <TestCaseBar
                  templateId={activeTemplateId}
                  cases={templateCases}
                  activeKey={testCaseKey}
                  canUseCurrentData={dataDirty && parsedData !== null}
                  onSelect={loadCase}
                  onCreate={createCase}
                  onDelete={deleteCase}
                />
              )}
            </div>
          }
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1">
              {tab === "template" ? (
                <CodeMirror
                  value={source}
                  height="100%"
                  theme="dark"
                  extensions={[
                    cmHtml(),
                    autocompletion({ activateOnTyping: true, override: [templateCompletion] }),
                    ...templateLint,
                  ]}
                  onChange={handleSourceChange}
                  onCreateEditor={(view) => {
                    templateEditorRef.current = view;
                    if (doc && selected) {
                      const range = locateNodeInSource(source, doc, selected);
                      if (range) revealSourceRange(view, range);
                    }
                  }}
                />
              ) : (
                <CodeMirror
                  value={dataText}
                  height="100%"
                  theme="dark"
                  extensions={[cmJson(), ...jsonLint]}
                  onChange={setDataText}
                />
              )}
            </div>
            {tab === "data" && (
              <EditorDiagnosticsStrip diagnostics={jsonDiagnostics} />
            )}
            {tab === "template" && templateParseDiagnostics.length > 0 && (
              <EditorDiagnosticsStrip diagnostics={templateParseDiagnostics} />
            )}
          </div>
        </ResizablePanel>

        <ResizablePanel
          id="center"
          className="bg-[#0e1118]"
          header={
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-white/50">
              <div className="inline-flex rounded-md border border-white/10 bg-white/5 p-0.5">
                <Seg active={middleView === "preview"} onClick={() => setMiddleView("preview")}>Preview</Seg>
                <Seg active={middleView === "design"} onClick={() => setMiddleView("design")}>Design</Seg>
              </div>
              <span className="truncate text-white/30">
                {middleView === "preview" ? "renders with the selected data" : "drag elements · click to edit"}
              </span>
            </div>
          }
        >
          {middleView === "preview" ? (
            <div className="h-full overflow-auto bg-[#1a1d27] p-4">
              <DocumentPage pageLayout={pageLayoutDraft}>
                <PreviewFrame html={html} />
              </DocumentPage>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-white/5 bg-[#0b0d12] px-3 py-2">
                <Palette onAdd={handleAdd} />
              </div>
              {selectedNode && isAlignableElement(selectedNode) && (
                <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/5 bg-[#0b0d12] px-3 py-2">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-white/35">Align</span>
                  <AlignmentField
                    compact
                    tag={selectedNode.tag}
                    style={selectedNode.attrs.style ?? ""}
                    children={selectedNode.children}
                    onChange={handleAlignStyle}
                  />
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-auto bg-[#1a1d27] p-4">
                {doc ? (
                  <DocumentPage className="min-h-full" pageLayout={pageLayoutDraft}>
                    <DocumentSurface
                      typographyCss={typographyCss(typographyDraft)}
                      pageLayout={pageLayoutDraft}
                    >
                      <DesignCanvas
                        pid={pid}
                        doc={doc}
                        selected={selected}
                        onSelect={setSelected}
                        onInsert={handleInsert}
                        onEditText={handleEditText}
                        onDuplicate={handleDuplicate}
                        onDelete={handleDelete}
                        onMoveTo={handleMoveTo}
                        onElementResize={handleElementResize}
                        variableHints={variableHints}
                        sampleData={parsedData}
                      />
                    </DocumentSurface>
                  </DocumentPage>
                ) : (
                  <div className="mx-auto max-w-md rounded-lg border border-rose-500/30 bg-rose-950/30 p-6 text-sm text-rose-200">
                    <p className="text-center font-medium">Template can’t be parsed</p>
                    {templateParseDiagnostics[0] && (
                      <p className="mt-3 text-left text-xs text-rose-100/90">
                        <span className="font-mono text-rose-300">
                          {templateParseDiagnostics[0].loc
                            ? `Line ${templateParseDiagnostics[0].loc.line}: `
                            : ""}
                        </span>
                        {templateParseDiagnostics[0].message}
                        {templateParseDiagnostics[0].hint && (
                          <span className="mt-1 block text-white/45">{templateParseDiagnostics[0].hint}</span>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </ResizablePanel>

        <ResizablePanel
          id="sidebar"
          className="bg-[#0b0d12]"
          header={
            <div className="px-3 py-2 text-xs font-medium text-white/45">
              {middleView === "design" ? "Inspector & structure" : "Diagnostics & schema"}
            </div>
          }
        >
          <div className="h-full overflow-auto">
            <VersionHistoryPanel
              pid={pid}
              filePath={activeFilePath}
              currentContent={versionEditorContent}
              refreshToken={versionRefresh}
              readOnly={documentReadOnly}
              onRestore={handleRestoreVersion}
              onToast={setToast}
            />
            {middleView === "design" ? (
              <>
                <PageLayoutPanel
                  settings={pageLayoutDraft}
                  onChange={setPageLayoutDraft}
                  onApply={applyPageLayout}
                />
                {selectedNode && selected ? (
                  <Inspector
                    pid={pid}
                    node={selectedNode}
                    path={selected}
                    variableHints={variableHints}
                    sampleData={parsedData}
                    onPatch={handlePatch}
                  />
                ) : (
                  <div className="border-b border-white/5 p-3 text-xs text-white/40">
                    Select an element on the canvas to edit its properties.
                  </div>
                )}
                {doc && (
                  <StructureTree
                    doc={doc}
                    selected={selected}
                    onSelect={setSelected}
                    onMove={handleMove}
                    onDelete={handleDelete}
                  />
                )}
                <DiagnosticsPanel
                  diagnostics={sidebarDiagnostics}
                  warnings={warnings}
                  projectId={pid}
                  templateId={tid}
                  onCopied={setToast}
                />
              </>
            ) : (
              <>
                <DiagnosticsPanel
                  diagnostics={sidebarDiagnostics}
                  warnings={warnings}
                  projectId={pid}
                  templateId={tid}
                  onCopied={setToast}
                />
                <PageLayoutPanel
                  settings={pageLayoutDraft}
                  onChange={setPageLayoutDraft}
                  onApply={applyPageLayout}
                />
                <TypographyPanel
                  settings={typographyDraft}
                  onChange={setTypographyDraft}
                  onApply={applyTypography}
                />
                <ReferencesPanel references={references} activeTemplate={tid} />
                <SchemaPanel schema={schema} />
              </>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function TopBar(props: {
  status: { text: string; title: string; tone: "ok" | "warn" | "error" };
  busy: boolean;
  onExport: () => void;
  exportDisabled?: boolean;
  mode: WorkspaceMode;
  onMode: (m: WorkspaceMode) => void;
  panelLayout: PanelLayout;
  onTogglePanel: (id: PanelId) => void;
  editorCommands: EditorCommandProps | null;
}) {
  const chipCls =
    props.status.tone === "error"
      ? "bg-rose-500/15 text-rose-300 ring-rose-500/30"
      : props.status.tone === "warn"
        ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
        : "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";

  return (
    <header className="flex items-center gap-4 border-b border-white/5 bg-[#0e1118] px-4 py-2.5">
      <div className="flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-black text-white">
          lw
        </div>
        <span className="font-semibold tracking-tight">lw-text <span className="text-white/40">Studio</span></span>
      </div>

      <span
        className={`max-w-[min(420px,45vw)] truncate rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${chipCls}`}
        title={props.status.title}
      >
        {props.status.text}
      </span>

      <div className="ml-3 inline-flex rounded-md border border-white/10 bg-white/5 p-0.5">
        <Seg active={props.mode === "author"} onClick={() => props.onMode("author")}>Author</Seg>
        <Seg active={props.mode === "model"} onClick={() => props.onMode("model")}>Data model</Seg>
      </div>

      {props.mode === "author" && (
        <PanelVisibilityToggles layout={props.panelLayout} onToggle={props.onTogglePanel} />
      )}

      {props.editorCommands && <EditorCommandBar {...props.editorCommands} />}

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={props.onExport}
          disabled={props.busy || props.exportDisabled}
          className="rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:brightness-110 disabled:opacity-50"
        >
          {props.busy ? "Rendering…" : "Export PDF"}
        </button>
      </div>
    </header>
  );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-xs font-medium transition ${
        active ? "bg-indigo-500/80 text-white shadow" : "text-white/50 hover:text-white/85"
      }`}
    >
      {children}
    </button>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 font-medium transition ${
        active ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80"
      }`}
    >
      {children}
    </button>
  );
}

function fontCssFromList(pid: string, fonts: FontInfo[]): string {
  if (fonts.length === 0) return "";
  return fonts
    .map((f) => {
      const url = api.fontUrl(pid, f.name);
      const family = f.family.replace(/["\\]/g, "\\$&");
      return `@font-face{font-family:"${family}";src:url("${url}");font-display:swap;}`;
    })
    .join("\n");
}

function typographyCss(s: TypographySettings): string {
  return [
    `body{font-family:${s.bodyFont};font-size:${s.baseSizePx}px;line-height:${s.lineHeight};letter-spacing:${s.letterSpacingPx}px;}`,
    `h1,h2,h3,h4,h5,h6{font-family:${s.headingFont};}`,
  ].join("");
}

function extractTypographySettings(doc: LwDocument): TypographySettings | null {
  const node = doc.nodes.find((n) => n.type === "element" && n.tag === "style" && n.id === TYPO_ID);
  if (!node || node.type !== "element") return null;
  const txt = node.children.find((c) => c.type === "text");
  if (!txt || txt.type !== "text") return null;
  const css = txt.text.template;
  return {
    bodyFont: capture(css, /body\{[^}]*font-family:([^;]+);/i) ?? DEFAULT_TYPO.bodyFont,
    baseSizePx: Number(capture(css, /body\{[^}]*font-size:([0-9.]+)px;/i) ?? DEFAULT_TYPO.baseSizePx),
    lineHeight: Number(capture(css, /body\{[^}]*line-height:([0-9.]+);/i) ?? DEFAULT_TYPO.lineHeight),
    letterSpacingPx: Number(capture(css, /body\{[^}]*letter-spacing:([0-9.\-]+)px;/i) ?? DEFAULT_TYPO.letterSpacingPx),
    headingFont: capture(css, /h1,h2,h3,h4,h5,h6\{[^}]*font-family:([^;]+);/i) ?? DEFAULT_TYPO.headingFont,
  };
}

function capture(text: string, rx: RegExp): string | null {
  const m = rx.exec(text);
  return m?.[1]?.trim() ?? null;
}

function upsertTypographyStyle(doc: LwDocument, settings: TypographySettings): LwDocument {
  const next = structuredClone(doc);
  const css = typographyCss(settings);
  const styleNode: Node = {
    type: "element",
    id: TYPO_ID,
    tag: "style",
    attrs: {},
    children: [{ type: "text", text: { template: css } }],
  };
  const idx = next.nodes.findIndex((n) => n.type === "element" && n.tag === "style" && n.id === TYPO_ID);
  if (idx >= 0) next.nodes[idx] = styleNode;
  else next.nodes.unshift(styleNode);
  return next;
}

function TypographyPanel({
  settings,
  onChange,
  onApply,
}: {
  settings: TypographySettings;
  onChange: (s: TypographySettings) => void;
  onApply: () => void;
}) {
  const set = <K extends keyof TypographySettings>(k: K, v: TypographySettings[K]) => onChange({ ...settings, [k]: v });
  const applyPreset = (p: TypoPreset) => {
    if (p === "compact") onChange({ ...settings, baseSizePx: 10, lineHeight: 1.4, letterSpacingPx: 0 });
    if (p === "comfortable") onChange({ ...settings, baseSizePx: 11, lineHeight: 1.55, letterSpacingPx: 0 });
    if (p === "reading") onChange({ ...settings, baseSizePx: 12, lineHeight: 1.7, letterSpacingPx: 0.1 });
  };
  return (
    <div className="border-b border-white/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Template typography</h3>
        <button
          onClick={onApply}
          className="rounded-md border border-indigo-400/40 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-200 hover:bg-indigo-500/20"
        >
          Apply to template
        </button>
      </div>
      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wide text-white/35">Preset</label>
          <div className="inline-flex rounded-md border border-white/10 bg-white/5 p-0.5">
            <button onClick={() => applyPreset("compact")} className="rounded px-2 py-1 text-[10px] text-white/60 hover:text-white">Compact</button>
            <button onClick={() => applyPreset("comfortable")} className="rounded px-2 py-1 text-[10px] text-white/60 hover:text-white">Comfortable</button>
            <button onClick={() => applyPreset("reading")} className="rounded px-2 py-1 text-[10px] text-white/60 hover:text-white">Reading</button>
          </div>
        </div>
        <TextInput label="Body font-family" value={settings.bodyFont} onCommit={(v) => set("bodyFont", v || DEFAULT_TYPO.bodyFont)} mono />
        <TextInput label="Heading font-family" value={settings.headingFont} onCommit={(v) => set("headingFont", v || DEFAULT_TYPO.headingFont)} mono />
        <NumInput label="Base size (px)" value={settings.baseSizePx} min={8} max={24} step={0.5} onCommit={(v) => set("baseSizePx", v)} />
        <NumInput label="Line height" value={settings.lineHeight} min={1} max={2.2} step={0.05} onCommit={(v) => set("lineHeight", v)} />
        <NumInput label="Letter spacing (px)" value={settings.letterSpacingPx} min={-1} max={2} step={0.05} onCommit={(v) => set("letterSpacingPx", v)} />
      </div>
    </div>
  );
}

function TextInput({ label, value, onCommit, mono }: { label: string; value: string; onCommit: (v: string) => void; mono?: boolean }) {
  const cls = `w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/90 outline-none focus:border-indigo-400/50 ${mono ? "font-mono" : ""}`;
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wide text-white/35">{label}</label>
      <input defaultValue={value} onBlur={(e) => onCommit(e.target.value)} className={cls} />
    </div>
  );
}

function NumInput({
  label,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (v: number) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wide text-white/35">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        onBlur={(e) => onCommit(Number(e.target.value || value))}
        className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/90 outline-none focus:border-indigo-400/50"
      />
    </div>
  );
}

function ReferencesPanel({ references, activeTemplate }: { references: BlockReference[]; activeTemplate: string }) {
  if (references.length === 0) return null;
  return (
    <div className="border-b border-white/5 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
        Building blocks · where used
      </h3>
      <ul className="space-y-1.5">
        {references.map((r) => (
          <li key={r.block} className="rounded-md border border-white/5 bg-white/[0.03] p-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono text-violet-300">{r.block}</span>
              {r.shared && (
                <span
                  title="Edited content propagates to every consumer"
                  className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300"
                >
                  shared ×{r.usedBy.length}
                </span>
              )}
            </div>
            {r.usedBy.length === 0 ? (
              <p className="mt-1 text-white/30">unused</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {r.usedBy.map((u, i) => (
                  <li
                    key={`${u.id}-${i}`}
                    className={`flex items-center gap-1.5 ${u.id === activeTemplate ? "text-emerald-300" : "text-white/60"}`}
                  >
                    <span className="text-white/25">{u.kind === "template" ? "▣" : "◆"}</span>
                    <span className="font-mono">{u.id}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SchemaPanel({ schema }: { schema: Record<string, unknown> | null }) {
  if (!schema) return null;
  return (
    <div className="p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Datasource schema</h3>
      {Object.entries(schema).map(([name, s]) => (
        <div key={name} className="mb-2">
          <div className="mb-1 font-mono text-xs text-indigo-300">{name}</div>
          <SchemaTree node={s as SchemaNode} prefix={name} />
        </div>
      ))}
    </div>
  );
}

interface SchemaNode {
  type?: string | string[];
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
}

function SchemaTree({ node, prefix, depth = 0 }: { node: SchemaNode; prefix: string; depth?: number }) {
  if (depth > 4) return null;
  const props = node.properties;
  const items = node.items?.properties;
  const entries = props ?? items;
  if (!entries) return null;
  return (
    <ul className="space-y-0.5" style={{ marginLeft: depth ? 10 : 0 }}>
      {Object.entries(entries).map(([k, v]) => {
        const typ = Array.isArray(v.type) ? v.type.join("|") : v.type ?? "any";
        return (
          <li key={k}>
            <div className="flex items-center gap-2 rounded px-1.5 py-0.5 font-mono text-[11px] hover:bg-white/5">
              <span className="text-white/80">{k}</span>
              <span className="text-white/30">{typ}{items && depth === 0 ? "[]" : ""}</span>
            </div>
            {(v.properties || v.items) && <SchemaTree node={v} prefix={`${prefix}.${k}`} depth={depth + 1} />}
          </li>
        );
      })}
    </ul>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="fixed bottom-4 right-4 max-w-sm rounded-lg border border-rose-500/30 bg-rose-950/90 px-4 py-3 text-sm text-rose-100 shadow-2xl backdrop-blur">
      {message}
      <button onClick={onClose} className="ml-3 text-rose-300 hover:text-white">✕</button>
    </div>
  );
}
