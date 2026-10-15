"use client";

import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ELK from "elkjs/lib/elk.bundled.js";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { bornAs, displayName, type Neighborhood, type Person } from "@/lib/data/family";
import { formatLifespan } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";

const PERSON_W = 172;
const PERSON_H = 56;
const UNION_SIZE = 10;
const elk = new ELK();

type PersonData = { person: Person; isFocus: boolean; isMe: boolean; isSelected: boolean };
type UnionData = { ended: boolean; hidden?: boolean };

const PersonNode = memo(function PersonNode({ data }: NodeProps<Node<PersonData>>) {
  const { person: p, isFocus, isMe, isSelected } = data;
  return (
    <div className="relative">
      {isMe && (
        <span className="absolute -top-4 left-0 font-mono text-[10px] font-medium tracking-[0.08em] text-accent">
          YOU
        </span>
      )}
      <div
        className={cn(
          "flex flex-col justify-center rounded-[5px] border bg-surface px-3 transition-shadow",
          p.isPlaceholder ? "border-dashed border-edge bg-ground" : "border-rule",
          isSelected && "border-accent",
          isFocus && "shadow-[0_0_0_2px_var(--accent)]",
        )}
        style={{ width: PERSON_W, height: PERSON_H }}
      >
        <Handle type="target" position={Position.Top} className="!opacity-0" />
        <span
          className={cn(
            "truncate font-serif text-[14px] leading-[18px] font-medium",
            p.isDeceased || p.isPlaceholder ? "text-ink-muted" : "text-ink",
            p.isPlaceholder && "italic",
          )}
        >
          {displayName(p)}
        </span>
        <span className="truncate text-[11.5px] leading-4 text-ink-muted tabular-nums">
          {p.isPlaceholder
            ? "Tap to fill in"
            : [bornAs(p), formatLifespan(p.birth, p.death, p.isDeceased), p.place?.split(",")[0]].filter(Boolean).join(" · ")}
        </span>
        <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      </div>
    </div>
  );
});

const UnionNode = memo(function UnionNode({ data }: NodeProps<Node<UnionData>>) {
  return (
    <div
      title={data.hidden ? undefined : data.ended ? "Ended" : "Couple"}
      className={cn(
        "rounded-full",
        data.hidden ? "opacity-0" : data.ended ? "border-[1.5px] border-[#55595E] bg-surface" : "bg-[#55595E]",
      )}
      style={{ width: UNION_SIZE, height: UNION_SIZE }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
});

const nodeTypes = { person: PersonNode, union: UnionNode };

const edgeStyle = (kind?: string) => ({
  stroke: "var(--edge)",
  strokeWidth: 1.5,
  strokeDasharray: kind === "adoptive" ? "6 4" : kind === "step" || kind === "foster" || kind === "guardian" ? "2 4" : undefined,
});

/**
 * Couples are small connector nodes (person -> couple -> children). That turns the family into
 * a graph a layered layout handles cleanly, including several marriages for one person.
 */
async function layout(data: Neighborhood) {
  const ids = new Set(data.persons.map((p) => p.id));
  const unions = data.unions.filter((u) => u.memberIds.filter((id) => ids.has(id)).length >= 1);
  const unionIds = new Set(unions.map((u) => u.id));
  const edges: Edge[] = [];

  for (const u of unions) {
    for (const m of u.memberIds) {
      if (ids.has(m)) edges.push({ id: `m:${m}:${u.id}`, source: m, target: `u:${u.id}`, type: "straight", style: edgeStyle() });
    }
  }
  const seen = new Set<string>();
  // Children with only one parent shown go through an invisible connector too, so every child
  // lands two layers below its parents and siblings share a row.
  const soloParents = new Set<string>();
  for (const e of data.parentChild) {
    if (e.union_id && unionIds.has(e.union_id)) {
      const key = `${e.union_id}:${e.child_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ id: `c:${key}`, source: `u:${e.union_id}`, target: e.child_id, type: "smoothstep", style: edgeStyle(e.kind) });
    } else {
      if (!soloParents.has(e.parent_id)) {
        soloParents.add(e.parent_id);
        edges.push({ id: `sp:${e.parent_id}`, source: e.parent_id, target: `s:${e.parent_id}`, type: "straight", style: edgeStyle() });
      }
      edges.push({ id: `p:${e.id}`, source: `s:${e.parent_id}`, target: e.child_id, type: "smoothstep", style: edgeStyle(e.kind) });
    }
  }

  const graph = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.layered.spacing.nodeNodeBetweenLayers": "34",
      "elk.spacing.nodeNode": "28",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children: [
      ...data.persons.map((p) => ({ id: p.id, width: PERSON_W, height: PERSON_H })),
      ...unions.map((u) => ({ id: `u:${u.id}`, width: UNION_SIZE, height: UNION_SIZE })),
      ...[...soloParents].map((id) => ({ id: `s:${id}`, width: 1, height: UNION_SIZE })),
    ],
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  });

  const pos = new Map((graph.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
  const nodes: Node[] = [
    ...data.persons.map((p) => ({
      id: p.id,
      type: "person",
      position: pos.get(p.id)!,
      data: { person: p, isFocus: false, isMe: false, isSelected: false },
    })),
    ...unions.map((u) => ({
      id: `u:${u.id}`,
      type: "union",
      position: pos.get(`u:${u.id}`)!,
      data: { ended: Boolean(u.endReason) },
      selectable: false,
    })),
    ...[...soloParents].map((id) => ({
      id: `s:${id}`,
      type: "union",
      position: pos.get(`s:${id}`)!,
      data: { ended: false, hidden: true },
      selectable: false,
    })),
  ];
  return { nodes, edges, focusId: data.focusId };
}

function Canvas({
  data,
  focusId,
  meId,
  selectedId,
  onSelect,
  onFocus,
}: {
  data: Neighborhood;
  focusId: string;
  meId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onFocus: (id: string) => void;
}) {
  const [graph, setGraph] = useState<{ nodes: Node[]; edges: Edge[]; focusId: string } | null>(null);
  const centredOn = useRef<string | null>(null);
  const flow = useReactFlow();

  // Layout depends only on the data; selection and focus just restyle nodes (no re-layout, so a
  // double-click is not interrupted by the first click).
  useEffect(() => {
    let cancelled = false;
    layout(data).then((g) => {
      if (!cancelled) setGraph(g);
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const nodes = useMemo(
    () =>
      graph?.nodes.map((n) =>
        n.type === "person"
          ? { ...n, data: { ...n.data, isFocus: n.id === focusId, isMe: n.id === meId, isSelected: n.id === selectedId } }
          : n,
      ) ?? [],
    [graph, focusId, meId, selectedId],
  );

  // Centre on the focus person whenever the focus changes, once the tree around them is laid
  // out (the previous tree may also contain them, at a position about to change). Reloads
  // around the same person (after adding someone) keep the view where it is.
  useEffect(() => {
    if (!graph || graph.focusId !== focusId || centredOn.current === focusId) return;
    centredOn.current = focusId;
    const focus = graph.nodes.find((n) => n.id === focusId);
    // Phones start a little zoomed out so parents and children fit around the person.
    const zoom = window.innerWidth < 768 ? 0.75 : 1;
    if (focus) flow.setCenter(focus.position.x + PERSON_W / 2, focus.position.y + PERSON_H / 2, { zoom, duration: 300 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, graph]);

  if (!graph) return null;
  return (
    <ReactFlow
      nodes={nodes}
      edges={graph.edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, n) => n.type === "person" && onSelect(n.id)}
      onNodeDoubleClick={(_, n) => n.type === "person" && onFocus(n.id)}
      nodesDraggable={false}
      nodesConnectable={false}
      // Double-click means "centre on this person"; the canvas zoom would swallow it.
      zoomOnDoubleClick={false}
      minZoom={0.2}
      maxZoom={1.8}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#DCDDD8" gap={24} size={1.2} />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}

export function TreeView(props: Parameters<typeof Canvas>[0]) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
