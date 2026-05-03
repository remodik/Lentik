"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Heart,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  createTreePerson,
  createTreeRelation,
  deleteTreePerson,
  deleteTreeRelation,
  getFamilyTree,
  moveTreePerson,
  updateTreePerson,
  type Family,
  type TreeGender,
  type TreePerson,
  type TreeRelation,
  type TreeRelationType,
} from "@/lib/api";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 76;
const HORIZONTAL_GAP = 36;
const VERTICAL_GAP = 88;
const CANVAS_PADDING = 32;
const DRAG_THRESHOLD_PX = 4;

type Props = {
  familyId: string;
  family: Family;
  meId: string;
};

type EditState = {
  open: boolean;
  person: TreePerson | null;
};

const GENDER_LABEL: Record<TreeGender, string> = {
  male: "Мужской",
  female: "Женский",
  other: "Другой",
  unknown: "Не указан",
};

const GENDER_COLOR: Record<TreeGender, string> = {
  male: "#7aa7e0",
  female: "#e08bb0",
  other: "#b29ad9",
  unknown: "#b8bdc8",
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("ru", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatYear(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return String(d.getFullYear());
}

function lifeSpan(person: TreePerson): string | null {
  const b = formatYear(person.birth_date);
  const d = formatYear(person.death_date);
  if (!b && !d) return null;
  return `${b ?? "?"} – ${d ?? ""}`.replace(/–\s*$/, "");
}

function computeGenerations(
  persons: TreePerson[],
  relations: TreeRelation[],
): Map<string, number> {
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const spouses = new Map<string, string[]>();

  for (const r of relations) {
    if (r.relation_type === "parent") {
      childrenOf.set(r.person_a_id, [
        ...(childrenOf.get(r.person_a_id) ?? []),
        r.person_b_id,
      ]);
      parentsOf.set(r.person_b_id, [
        ...(parentsOf.get(r.person_b_id) ?? []),
        r.person_a_id,
      ]);
    } else {
      spouses.set(r.person_a_id, [
        ...(spouses.get(r.person_a_id) ?? []),
        r.person_b_id,
      ]);
      spouses.set(r.person_b_id, [
        ...(spouses.get(r.person_b_id) ?? []),
        r.person_a_id,
      ]);
    }
  }

  const gen = new Map<string, number>();

  const roots = persons.filter((p) => !(parentsOf.get(p.id)?.length));
  if (roots.length === 0 && persons.length > 0) {
    gen.set(persons[0].id, 0);
  }
  for (const root of roots) gen.set(root.id, 0);

  let changed = true;
  let iterations = 0;
  while (changed && iterations < 64) {
    changed = false;
    iterations += 1;

    for (const p of persons) {
      const ps = parentsOf.get(p.id) ?? [];
      const parentGens = ps
        .map((id) => gen.get(id))
        .filter((v): v is number => v !== undefined);
      if (parentGens.length > 0) {
        const next = Math.max(...parentGens) + 1;
        if (gen.get(p.id) !== next) {
          gen.set(p.id, next);
          changed = true;
        }
      } else if (!gen.has(p.id)) {
        gen.set(p.id, 0);
        changed = true;
      }
    }

    for (const [a, list] of spouses) {
      for (const b of list) {
        const ga = gen.get(a);
        const gb = gen.get(b);
        if (ga !== undefined && gb === undefined) {
          gen.set(b, ga);
          changed = true;
        } else if (gb !== undefined && ga === undefined) {
          gen.set(a, gb);
          changed = true;
        }
      }
    }
  }

  for (const p of persons) if (!gen.has(p.id)) gen.set(p.id, 0);

  return gen;
}

function PersonAvatar({
  person,
  size = 56,
}: {
  person: TreePerson;
  size?: number;
}) {
  const initial = person.display_name?.[0]?.toUpperCase() ?? "?";
  return (
    <div
      className="rounded-full overflow-hidden grid place-items-center text-white font-display font-bold shrink-0 ring-2 ring-white/80"
      style={{
        width: size,
        height: size,
        background: GENDER_COLOR[person.gender] ?? GENDER_COLOR.unknown,
        fontSize: size * 0.38,
      }}
      aria-hidden
    >
      {person.avatar_url ? (
        <img src={person.avatar_url} alt="" className="w-full h-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}

function PersonNode({
  person,
  isMe,
  onClick,
  onPointerDown,
  highlighted,
  selected,
  dragging,
  position,
}: {
  person: TreePerson;
  isMe: boolean;
  onClick: () => void;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  highlighted: boolean;
  selected: boolean;
  dragging: boolean;
  position: { x: number; y: number };
}) {
  const span = lifeSpan(person);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      onPointerDown={onPointerDown}
      className={`tree-node ${selected ? "selected" : ""} ${highlighted ? "highlighted" : ""} ${dragging ? "dragging" : ""}`}
      data-person-id={person.id}
      data-testid={`tree-person-${person.id}`}
      style={{
        position: "absolute",
        left: position.x,
        top: position.y,
        width: NODE_WIDTH,
        touchAction: "none",
      }}
    >
      <PersonAvatar person={person} size={48} />
      <div className="min-w-0 text-left">
        <p className="font-display text-sm text-ink-900 leading-tight tracking-tight truncate">
          {person.display_name}
        </p>
        <p className="text-[11px] text-ink-400 font-body mt-0.5 truncate">
          {span ?? GENDER_LABEL[person.gender]}
        </p>
      </div>
      {isMe && <span className="tree-pill-me">я</span>}
      {person.user_id && !isMe && (
        <span className="tree-pill-linked" title="Привязан к участнику">
          <Link2 className="w-3 h-3" strokeWidth={2.4} />
        </span>
      )}
    </div>
  );
}

export default function FamilyTreeView({ familyId, family, meId }: Props) {
  const [persons, setPersons] = useState<TreePerson[]>([]);
  const [relations, setRelations] = useState<TreeRelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editState, setEditState] = useState<EditState>({ open: false, person: null });
  const [showRelationModal, setShowRelationModal] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getFamilyTree(familyId);
      setPersons(data.persons);
      setRelations(data.relations);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить древо");
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const personById = useMemo(
    () => new Map(persons.map((p) => [p.id, p])),
    [persons],
  );

  const generations = useMemo(
    () => computeGenerations(persons, relations),
    [persons, relations],
  );

  const defaultPositions = useMemo(() => {
    const byGen = new Map<number, TreePerson[]>();
    for (const p of persons) {
      const g = generations.get(p.id) ?? 0;
      const list = byGen.get(g) ?? [];
      list.push(p);
      byGen.set(g, list);
    }
    let widestRow = 1;
    for (const list of byGen.values()) {
      list.sort((a, b) => a.created_at.localeCompare(b.created_at));
      if (list.length > widestRow) widestRow = list.length;
    }
    const totalWidth =
      widestRow * NODE_WIDTH + (widestRow - 1) * HORIZONTAL_GAP;

    const result = new Map<string, { x: number; y: number }>();
    for (const [gen, list] of byGen) {
      const rowWidth =
        list.length * NODE_WIDTH + (list.length - 1) * HORIZONTAL_GAP;
      const offsetX = CANVAS_PADDING + (totalWidth - rowWidth) / 2;
      const y = CANVAS_PADDING + gen * (NODE_HEIGHT + VERTICAL_GAP);
      list.forEach((p, idx) => {
        result.set(p.id, {
          x: offsetX + idx * (NODE_WIDTH + HORIZONTAL_GAP),
          y,
        });
      });
    }
    return result;
  }, [persons, generations]);

  const [dragOverrides, setDragOverrides] = useState<
    Map<string, { x: number; y: number }>
  >(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragStateRef = useRef<{
    personId: string;
    pointerId: number;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  function getPosition(personId: string): { x: number; y: number } {
    const override = dragOverrides.get(personId);
    if (override) return override;
    const person = personById.get(personId);
    if (person && person.pos_x != null && person.pos_y != null) {
      return { x: person.pos_x, y: person.pos_y };
    }
    return defaultPositions.get(personId) ?? { x: CANVAS_PADDING, y: CANVAS_PADDING };
  }

  const canvasSize = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    for (const p of persons) {
      const { x, y } = getPosition(p.id);
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return {
      width: Math.max(NODE_WIDTH + CANVAS_PADDING * 2, maxX + NODE_WIDTH + CANVAS_PADDING),
      height: Math.max(NODE_HEIGHT + CANVAS_PADDING * 2, maxY + NODE_HEIGHT + CANVAS_PADDING),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persons, dragOverrides, defaultPositions]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, personId: string) => {
      if (e.button !== 0) return;
      const node = e.currentTarget;
      const pos = getPosition(personId);
      node.setPointerCapture(e.pointerId);
      dragStateRef.current = {
        personId,
        pointerId: e.pointerId,
        offsetX: e.clientX - (node.getBoundingClientRect().left),
        offsetY: e.clientY - (node.getBoundingClientRect().top),
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      // start with the current visible position so movement is smooth
      setDragOverrides((prev) => {
        const next = new Map(prev);
        next.set(personId, pos);
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persons, dragOverrides, defaultPositions],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== e.pointerId) return;
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      state.moved = true;
      if (draggingId !== state.personId) setDraggingId(state.personId);
      const root = containerRef.current;
      if (!root) return;
      const rootRect = root.getBoundingClientRect();
      const x = e.clientX - rootRect.left - state.offsetX + root.scrollLeft;
      const y = e.clientY - rootRect.top - state.offsetY + root.scrollTop;
      setDragOverrides((prev) => {
        const next = new Map(prev);
        next.set(state.personId, {
          x: Math.max(0, x),
          y: Math.max(0, y),
        });
        return next;
      });
    },
    [draggingId],
  );

  const handlePointerUp = useCallback(
    async (e: React.PointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== e.pointerId) return;
      dragStateRef.current = null;
      setDraggingId(null);
      if (!state.moved) {
        // not a drag — drop the override and let click fire
        setDragOverrides((prev) => {
          if (!prev.has(state.personId)) return prev;
          const next = new Map(prev);
          next.delete(state.personId);
          return next;
        });
        return;
      }
      // commit move to backend
      const finalPos = dragOverrides.get(state.personId);
      if (!finalPos) return;
      try {
        const updated = await moveTreePerson(
          state.personId,
          finalPos.x,
          finalPos.y,
        );
        setPersons((prev) =>
          prev.map((p) => (p.id === updated.id ? updated : p)),
        );
        setDragOverrides((prev) => {
          if (!prev.has(state.personId)) return prev;
          const next = new Map(prev);
          next.delete(state.personId);
          return next;
        });
      } catch (err) {
        console.error("moveTreePerson failed", err);
        // revert override on failure
        setDragOverrides((prev) => {
          if (!prev.has(state.personId)) return prev;
          const next = new Map(prev);
          next.delete(state.personId);
          return next;
        });
      }
    },
    [dragOverrides],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<
    Array<{
      id: string;
      kind: TreeRelationType;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }>
  >([]);
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });

  const recomputeEdges = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const nextEdges: Array<{
      id: string;
      kind: TreeRelationType;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }> = [];

    for (const r of relations) {
      const aEl = root.querySelector(
        `[data-person-id="${r.person_a_id}"]`,
      ) as HTMLElement | null;
      const bEl = root.querySelector(
        `[data-person-id="${r.person_b_id}"]`,
      ) as HTMLElement | null;
      if (!aEl || !bEl) continue;
      const ar = aEl.getBoundingClientRect();
      const br = bEl.getBoundingClientRect();
      if (r.relation_type === "parent") {
        nextEdges.push({
          id: r.id,
          kind: "parent",
          x1: ar.left + ar.width / 2 - rootRect.left,
          y1: ar.bottom - rootRect.top,
          x2: br.left + br.width / 2 - rootRect.left,
          y2: br.top - rootRect.top,
        });
      } else {
        const left = ar.left < br.left ? ar : br;
        const right = ar.left < br.left ? br : ar;
        nextEdges.push({
          id: r.id,
          kind: "spouse",
          x1: left.right - rootRect.left,
          y1: left.top + left.height / 2 - rootRect.top,
          x2: right.left - rootRect.left,
          y2: right.top + right.height / 2 - rootRect.top,
        });
      }
    }

    setEdges(nextEdges);
    setSvgSize({ width: root.scrollWidth, height: root.scrollHeight });
  }, [relations]);

  useLayoutEffect(() => {
    recomputeEdges();
  }, [recomputeEdges, persons, relations, defaultPositions, dragOverrides, canvasSize]);

  useEffect(() => {
    const handleResize = () => recomputeEdges();
    window.addEventListener("resize", handleResize);

    const root = containerRef.current;
    let ro: ResizeObserver | null = null;
    if (root && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(handleResize);
      ro.observe(root);
    }
    return () => {
      window.removeEventListener("resize", handleResize);
      ro?.disconnect();
    };
  }, [recomputeEdges]);

  const linkedUserIds = useMemo(
    () => new Set(persons.map((p) => p.user_id).filter((v): v is string => !!v)),
    [persons],
  );

  const unlinkedMembers = useMemo(
    () => family.members.filter((m) => !linkedUserIds.has(m.user_id)),
    [family.members, linkedUserIds],
  );

  const selectedPerson = selectedPersonId
    ? personById.get(selectedPersonId) ?? null
    : null;

  const relationsOfSelected = useMemo(() => {
    if (!selectedPerson) return [] as Array<{ relation: TreeRelation; other: TreePerson; label: string }>;
    const rows: Array<{ relation: TreeRelation; other: TreePerson; label: string }> = [];
    for (const r of relations) {
      let otherId: string | null = null;
      let label = "";
      if (r.relation_type === "spouse") {
        if (r.person_a_id === selectedPerson.id) otherId = r.person_b_id;
        else if (r.person_b_id === selectedPerson.id) otherId = r.person_a_id;
        if (otherId) label = "Супруг(а)";
      } else if (r.relation_type === "parent") {
        if (r.person_a_id === selectedPerson.id) {
          otherId = r.person_b_id;
          label = "Ребёнок";
        } else if (r.person_b_id === selectedPerson.id) {
          otherId = r.person_a_id;
          label = "Родитель";
        }
      }
      if (otherId) {
        const other = personById.get(otherId);
        if (other) rows.push({ relation: r, other, label });
      }
    }
    return rows;
  }, [selectedPerson, relations, personById]);

  async function handleAddOrUpdate(values: PersonFormValues, id: string | null) {
    setBusy(true);
    try {
      if (id) {
        const updated = await updateTreePerson(id, {
          display_name: values.display_name,
          gender: values.gender,
          bio: values.bio || null,
          avatar_url: values.avatar_url || null,
          birth_date: values.birth_date || null,
          death_date: values.death_date || null,
          user_id: values.user_id || null,
          clear_user_link: !values.user_id,
          clear_birth_date: !values.birth_date,
          clear_death_date: !values.death_date,
        });
        setPersons((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        const created = await createTreePerson(familyId, {
          display_name: values.display_name,
          gender: values.gender,
          bio: values.bio || null,
          avatar_url: values.avatar_url || null,
          birth_date: values.birth_date || null,
          death_date: values.death_date || null,
          user_id: values.user_id || null,
        });
        setPersons((prev) => [...prev, created]);
      }
      setEditState({ open: false, person: null });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeletePerson(id: string) {
    if (!confirm("Удалить человека из древа? Связи с ним тоже исчезнут.")) return;
    setBusy(true);
    try {
      await deleteTreePerson(id);
      setPersons((prev) => prev.filter((p) => p.id !== id));
      setRelations((prev) =>
        prev.filter((r) => r.person_a_id !== id && r.person_b_id !== id),
      );
      if (selectedPersonId === id) setSelectedPersonId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddRelation(
    aId: string,
    bId: string,
    type: TreeRelationType,
  ) {
    setBusy(true);
    try {
      const created = await createTreeRelation(familyId, {
        person_a_id: aId,
        person_b_id: bId,
        relation_type: type,
      });
      setRelations((prev) => [...prev, created]);
      setShowRelationModal(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось добавить связь");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteRelation(relationId: string) {
    if (!confirm("Удалить связь?")) return;
    setBusy(true);
    try {
      await deleteTreeRelation(relationId);
      setRelations((prev) => prev.filter((r) => r.id !== relationId));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось удалить связь");
    } finally {
      setBusy(false);
    }
  }

  const highlightedIds = useMemo(() => {
    if (!selectedPersonId) return new Set<string>();
    const ids = new Set<string>();
    for (const r of relations) {
      if (r.person_a_id === selectedPersonId) ids.add(r.person_b_id);
      else if (r.person_b_id === selectedPersonId) ids.add(r.person_a_id);
    }
    return ids;
  }, [selectedPersonId, relations]);

  return (
    <div className="tree-shell">
      <header className="tree-head glass-topbar glossy">
        <div className="tree-head__inner">
          <div className="tree-head__row">
            <div className="min-w-0">
              <h2 className="tree-title">Семейное древо</h2>
              <p className="tree-sub">
                {persons.length} {persons.length === 1 ? "человек" : "людей"}
                {relations.length ? ` · ${relations.length} связей` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                className="ui-btn ui-btn-subtle inline-flex items-center gap-1.5"
                onClick={() => void load()}
                disabled={loading}
                aria-label="Обновить"
                title="Обновить"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
                  strokeWidth={2.2}
                />
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-subtle inline-flex items-center gap-1.5"
                onClick={() => setShowRelationModal(true)}
                disabled={persons.length < 2}
                title={persons.length < 2 ? "Сначала добавьте людей" : "Связь"}
              >
                <Heart className="w-3.5 h-3.5" strokeWidth={2.2} />
                Связь
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-primary inline-flex items-center gap-1.5"
                onClick={() => setEditState({ open: true, person: null })}
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2.4} />
                Добавить
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="tree-body">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50/70 p-3 text-sm text-red-600 font-body mb-3">
            {error}
          </div>
        )}

        {loading && persons.length === 0 ? (
          <div className="text-center py-16 text-ink-400 font-body text-sm">
            Загрузка…
          </div>
        ) : persons.length === 0 ? (
          <div className="tree-empty">
            <Users
              className="w-8 h-8 mb-3 text-ink-300 mx-auto"
              aria-hidden
              strokeWidth={2.1}
            />
            <p className="text-ink-500 text-sm font-body">
              Древо пока пустое. Добавь первого человека — себя или предка.
            </p>
            <button
              type="button"
              className="ui-btn ui-btn-primary mt-4 inline-flex items-center gap-1.5"
              onClick={() => setEditState({ open: true, person: null })}
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.4} />
              Добавить человека
            </button>
          </div>
        ) : (
          <div className="tree-canvas-wrap">
            <div
              className="tree-canvas"
              ref={containerRef}
              style={{
                width: canvasSize.width,
                height: canvasSize.height,
              }}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <svg
                className="tree-edges"
                width={svgSize.width || "100%"}
                height={svgSize.height || "100%"}
                aria-hidden
              >
                {edges.map((e) => {
                  if (e.kind === "spouse") {
                    return (
                      <line
                        key={e.id}
                        x1={e.x1}
                        y1={e.y1}
                        x2={e.x2}
                        y2={e.y2}
                        className="tree-edge-spouse"
                      />
                    );
                  }
                  const midY = (e.y1 + e.y2) / 2;
                  const path = `M${e.x1},${e.y1} C${e.x1},${midY} ${e.x2},${midY} ${e.x2},${e.y2}`;
                  return (
                    <path
                      key={e.id}
                      d={path}
                      className="tree-edge-parent"
                      fill="none"
                    />
                  );
                })}
              </svg>

              {persons.map((p) => (
                <PersonNode
                  key={p.id}
                  person={p}
                  isMe={p.user_id === meId}
                  selected={selectedPersonId === p.id}
                  highlighted={highlightedIds.has(p.id)}
                  dragging={draggingId === p.id}
                  position={getPosition(p.id)}
                  onPointerDown={(e) => handlePointerDown(e, p.id)}
                  onClick={() => {
                    if (dragStateRef.current?.moved) return;
                    setSelectedPersonId((prev) => (prev === p.id ? null : p.id));
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {selectedPerson && (
          <PersonDetailsCard
            person={selectedPerson}
            relations={relationsOfSelected}
            onClose={() => setSelectedPersonId(null)}
            onEdit={() => setEditState({ open: true, person: selectedPerson })}
            onDelete={() => void handleDeletePerson(selectedPerson.id)}
            onDeleteRelation={(id) => void handleDeleteRelation(id)}
            busy={busy}
          />
        )}
      </div>

      {editState.open && (
        <PersonFormModal
          person={editState.person}
          unlinkedMembers={unlinkedMembers}
          onClose={() => setEditState({ open: false, person: null })}
          onSubmit={(values) =>
            void handleAddOrUpdate(values, editState.person?.id ?? null)
          }
          busy={busy}
        />
      )}

      {showRelationModal && (
        <RelationFormModal
          persons={persons}
          relations={relations}
          onClose={() => setShowRelationModal(false)}
          onSubmit={(a, b, type) => void handleAddRelation(a, b, type)}
          busy={busy}
        />
      )}
    </div>
  );
}

type PersonFormValues = {
  display_name: string;
  gender: TreeGender;
  birth_date: string;
  death_date: string;
  bio: string;
  avatar_url: string;
  user_id: string;
};

function PersonFormModal({
  person,
  unlinkedMembers,
  onClose,
  onSubmit,
  busy,
}: {
  person: TreePerson | null;
  unlinkedMembers: Family["members"];
  onClose: () => void;
  onSubmit: (values: PersonFormValues) => void;
  busy: boolean;
}) {
  const [values, setValues] = useState<PersonFormValues>({
    display_name: person?.display_name ?? "",
    gender: person?.gender ?? "unknown",
    birth_date: person?.birth_date?.slice(0, 10) ?? "",
    death_date: person?.death_date?.slice(0, 10) ?? "",
    bio: person?.bio ?? "",
    avatar_url: person?.avatar_url ?? "",
    user_id: person?.user_id ?? "",
  });

  const linkOptions = useMemo(() => {
    if (person?.user_id) {
      return unlinkedMembers;
    }
    return unlinkedMembers;
  }, [person, unlinkedMembers]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.display_name.trim()) return;
    onSubmit({
      ...values,
      display_name: values.display_name.trim(),
      bio: values.bio.trim(),
      avatar_url: values.avatar_url.trim(),
    });
  }

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/35 backdrop-blur-sm p-4 flex items-center justify-center"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={person ? "Редактировать человека" : "Добавить человека"}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-white/70 bg-white/88 backdrop-blur-2xl p-6 shadow-[0_30px_90px_rgba(28,23,20,0.25)] max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-ink-400 font-body">
              {person ? "Редактирование" : "Новый человек"}
            </p>
            <h3 className="font-display text-2xl text-ink-900 mt-1">
              {person ? person.display_name : "Добавить в древо"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="w-8 h-8 rounded-xl grid place-items-center text-ink-400 hover:text-ink-700 hover:bg-white/60 transition shrink-0"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" strokeWidth={2.2} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label className="block">
            <span className="text-xs text-ink-500 font-body">Имя</span>
            <input
              className="input-field mt-1"
              value={values.display_name}
              onChange={(e) =>
                setValues((v) => ({ ...v, display_name: e.target.value }))
              }
              placeholder="Например: Иван Иванович"
              autoFocus
              required
            />
          </label>

          <label className="block">
            <span className="text-xs text-ink-500 font-body">Пол</span>
            <select
              className="input-field mt-1"
              value={values.gender}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  gender: e.target.value as TreeGender,
                }))
              }
            >
              <option value="unknown">Не указан</option>
              <option value="male">Мужской</option>
              <option value="female">Женский</option>
              <option value="other">Другой</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-ink-500 font-body">Дата рождения</span>
              <input
                type="date"
                className="input-field mt-1"
                value={values.birth_date}
                onChange={(e) =>
                  setValues((v) => ({ ...v, birth_date: e.target.value }))
                }
              />
            </label>
            <label className="block">
              <span className="text-xs text-ink-500 font-body">Дата смерти</span>
              <input
                type="date"
                className="input-field mt-1"
                value={values.death_date}
                onChange={(e) =>
                  setValues((v) => ({ ...v, death_date: e.target.value }))
                }
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-ink-500 font-body">URL аватарки</span>
            <input
              className="input-field mt-1"
              value={values.avatar_url}
              onChange={(e) =>
                setValues((v) => ({ ...v, avatar_url: e.target.value }))
              }
              placeholder="https://…"
            />
          </label>

          {linkOptions.length > 0 || person?.user_id ? (
            <label className="block">
              <span className="text-xs text-ink-500 font-body">
                Привязать к участнику семьи
              </span>
              <select
                className="input-field mt-1"
                value={values.user_id}
                onChange={(e) =>
                  setValues((v) => ({ ...v, user_id: e.target.value }))
                }
              >
                <option value="">— не привязывать —</option>
                {person?.user_id && (
                  <option value={person.user_id}>
                    {person.display_name} (текущая привязка)
                  </option>
                )}
                {linkOptions.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name} (@{m.username})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block">
            <span className="text-xs text-ink-500 font-body">Биография</span>
            <textarea
              className="input-field mt-1 min-h-[80px]"
              value={values.bio}
              onChange={(e) =>
                setValues((v) => ({ ...v, bio: e.target.value }))
              }
              placeholder="Кем работал, где жил, чем запомнился…"
            />
          </label>

          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              className="ui-btn ui-btn-subtle"
              onClick={onClose}
              disabled={busy}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="ui-btn ui-btn-primary"
              disabled={busy || !values.display_name.trim()}
            >
              {busy ? "Сохранение…" : person ? "Сохранить" : "Создать"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RelationFormModal({
  persons,
  relations,
  onClose,
  onSubmit,
  busy,
}: {
  persons: TreePerson[];
  relations: TreeRelation[];
  onClose: () => void;
  onSubmit: (a: string, b: string, type: TreeRelationType) => void;
  busy: boolean;
}) {
  const [aId, setAId] = useState(persons[0]?.id ?? "");
  const [bId, setBId] = useState(persons[1]?.id ?? persons[0]?.id ?? "");
  const [type, setType] = useState<TreeRelationType>("parent");
  const [warn, setWarn] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setWarn("");
    if (!aId || !bId || aId === bId) {
      setWarn("Выбери разных людей");
      return;
    }
    const dup = relations.find((r) => {
      if (r.relation_type !== type) return false;
      if (type === "spouse") {
        return (
          (r.person_a_id === aId && r.person_b_id === bId) ||
          (r.person_a_id === bId && r.person_b_id === aId)
        );
      }
      return r.person_a_id === aId && r.person_b_id === bId;
    });
    if (dup) {
      setWarn("Такая связь уже есть");
      return;
    }
    onSubmit(aId, bId, type);
  }

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/35 backdrop-blur-sm p-4 flex items-center justify-center"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Создать связь"
    >
      <div
        className="w-full max-w-md rounded-3xl border border-white/70 bg-white/88 backdrop-blur-2xl p-6 shadow-[0_30px_90px_rgba(28,23,20,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs uppercase tracking-[0.16em] text-ink-400 font-body">
          Связь
        </p>
        <h3 className="font-display text-2xl text-ink-900 mt-1">
          Создать связь
        </h3>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label className="block">
            <span className="text-xs text-ink-500 font-body">Тип связи</span>
            <select
              className="input-field mt-1"
              value={type}
              onChange={(e) => setType(e.target.value as TreeRelationType)}
            >
              <option value="parent">Родитель → ребёнок</option>
              <option value="spouse">Супруги</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-ink-500 font-body">
              {type === "parent" ? "Родитель" : "Супруг(а)"}
            </span>
            <select
              className="input-field mt-1"
              value={aId}
              onChange={(e) => setAId(e.target.value)}
            >
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-ink-500 font-body">
              {type === "parent" ? "Ребёнок" : "Супруг(а)"}
            </span>
            <select
              className="input-field mt-1"
              value={bId}
              onChange={(e) => setBId(e.target.value)}
            >
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </label>

          {warn && <p className="text-xs text-red-500 font-body">{warn}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              className="ui-btn ui-btn-subtle"
              onClick={onClose}
              disabled={busy}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="ui-btn ui-btn-primary"
              disabled={busy}
            >
              {busy ? "Сохранение…" : "Создать"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PersonDetailsCard({
  person,
  relations,
  onClose,
  onEdit,
  onDelete,
  onDeleteRelation,
  busy,
}: {
  person: TreePerson;
  relations: Array<{ relation: TreeRelation; other: TreePerson; label: string }>;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDeleteRelation: (id: string) => void;
  busy: boolean;
}) {
  const span = lifeSpan(person);
  const birth = formatDate(person.birth_date);
  const death = formatDate(person.death_date);

  return (
    <div className="tree-details glass-card glossy">
      <div className="flex items-start gap-3">
        <PersonAvatar person={person} size={56} />
        <div className="flex-1 min-w-0">
          <p className="font-display text-lg text-ink-900 leading-tight tracking-tight truncate">
            {person.display_name}
          </p>
          <p className="text-[12px] text-ink-400 font-body mt-0.5">
            {GENDER_LABEL[person.gender]}
            {span ? ` · ${span}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-xl grid place-items-center text-ink-400 hover:text-ink-700 hover:bg-white/60 transition shrink-0"
          aria-label="Закрыть"
        >
          <X className="w-4 h-4" strokeWidth={2.2} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="tree-info-cell">
          <p className="tree-info-k">Родился</p>
          <p className="tree-info-v">{birth ?? "—"}</p>
        </div>
        <div className="tree-info-cell">
          <p className="tree-info-k">Ушёл</p>
          <p className="tree-info-v">{death ?? "—"}</p>
        </div>
      </div>

      {person.bio && (
        <div className="tree-bio mt-3">
          <p className="tree-info-k">О человеке</p>
          <p className="tree-bio-v">{person.bio}</p>
        </div>
      )}

      {relations.length > 0 && (
        <div className="mt-4">
          <p className="tree-info-k mb-2">Связи</p>
          <ul className="space-y-1.5">
            {relations.map(({ relation, other, label }) => (
              <li
                key={relation.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/65 bg-white/65 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <PersonAvatar person={other} size={28} />
                  <div className="min-w-0">
                    <p className="text-sm text-ink-800 font-body truncate">
                      {other.display_name}
                    </p>
                    <p className="text-[11px] text-ink-400 font-body">{label}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteRelation(relation.id)}
                  disabled={busy}
                  className="w-7 h-7 rounded-lg grid place-items-center text-ink-400 hover:text-red-500 hover:bg-white/60 transition"
                  title="Удалить связь"
                  aria-label="Удалить связь"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2 justify-end mt-4">
        <button
          type="button"
          className="ui-btn ui-btn-subtle inline-flex items-center gap-1.5"
          onClick={onEdit}
          disabled={busy}
        >
          <Pencil className="w-3.5 h-3.5" strokeWidth={2.2} />
          Изменить
        </button>
        <button
          type="button"
          className="ui-btn ui-btn-danger inline-flex items-center gap-1.5"
          onClick={onDelete}
          disabled={busy}
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={2.2} />
          Удалить
        </button>
      </div>
    </div>
  );
}
