"use client";

import { useState } from "react";
import {
  AlarmClock,
  Archive,
  CalendarClock,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  MessageCircle,
  Plus,
  RotateCcw,
  Sparkles,
  ThumbsUp,
  UserRound,
  X,
  Zap,
} from "lucide-react";

type Status = "suggested" | "active" | "completed" | "declined" | "archived";

/** Suggested tasks shown before the user asks for more. */
const SUGGESTED_PREVIEW_COUNT = 4;
type Category = "work" | "school" | "startup" | "truck" | "personal" | "other";
type Priority = "low" | "medium" | "high" | "urgent";
type Task = {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  category: Category;
  dueAt: string | null;
  completedAt: string | null;
  sourceType: string | null;
  sourceTitle: string | null;
  sourceSnippet: string | null;
  sourceUrl: string | null;
  extractedFromKnowledgeItemId: string | null;
  assignedToUserId?: string | null;
  metadata?: unknown;
  confidence: number | null;
  createdAt: string;
  updatedAt: string;
};
type Filter =
  | "all"
  | "work"
  | "school"
  | "startup"
  | "truck"
  | "personal"
  | "completed"
  | "declined"
  | "archived";

const categories: Category[] = [
  "work",
  "school",
  "startup",
  "truck",
  "personal",
  "other",
];
const sources = [
  ["manual", "Manual"],
  ["slack", "Slack"],
  ["gmail", "Gmail"],
  ["telegram", "Telegram"],
  ["discord", "Discord"],
  ["linear", "Linear"],
  ["notion", "Notion"],
  ["datatruck", "Datatruck"],
  ["five_eld", "Five ELD"],
  ["other", "Other"],
] as const;
const tabs: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "work", label: "Work" },
  { value: "school", label: "School" },
  { value: "startup", label: "Startup" },
  { value: "truck", label: "Truck" },
  { value: "personal", label: "Personal" },
  { value: "completed", label: "Completed" },
  { value: "declined", label: "Declined" },
  { value: "archived", label: "Archived" },
];

function sourceName(source?: string | null) {
  return (
    sources.find(([value]) => value === source)?.[1] ??
    (source
      ? source
          .replaceAll("_", " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase())
      : "Manual")
  );
}

function localInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function dueInfo(task: Task) {
  if (!task.dueAt) return { label: "No due date", overdue: false };
  const date = new Date(task.dueAt),
    now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextDay = new Date(tomorrow);
  nextDay.setDate(nextDay.getDate() + 1);
  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  if (date < now && task.status !== "completed")
    return {
      label: `Overdue · ${date.toLocaleDateString([], { month: "short", day: "numeric" })}`,
      overdue: true,
    };
  if (date >= today && date < tomorrow)
    return { label: `Today, ${time}`, overdue: false };
  if (date >= tomorrow && date < nextDay)
    return { label: `Tomorrow, ${time}`, overdue: false };
  return {
    label: date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    }),
    overdue: false,
  };
}

function SourceContext({
  task,
  prominent = false,
}: {
  task: Task;
  prominent?: boolean;
}) {
  return (
    <div className={prominent ? "rounded-xl bg-black/[.025] p-3" : ""}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
          {sourceName(task.sourceType)}
        </span>
        <span className="text-[11px] text-black/40">
          {task.extractedFromKnowledgeItemId
            ? "From synced message"
            : "Manually added"}
        </span>
        {task.sourceUrl && (
          <a
            href={task.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline"
          >
            Open source <ExternalLink size={11} />
          </a>
        )}
      </div>
      {task.sourceTitle && (
        <p className="mt-2 text-xs font-semibold text-black/65">
          {task.sourceTitle}
        </p>
      )}
      {task.sourceSnippet && (
        <p className="mt-1 line-clamp-3 text-xs leading-5 text-black/50">
          {task.sourceSnippet}
        </p>
      )}
    </div>
  );
}

function DoneButton({
  task,
  complete,
}: {
  task: Task;
  complete: (task: Task) => void;
}) {
  const done = task.status === "completed";
  if (task.status === "declined")
    return (
      <span
        aria-label="Declined task"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-rose-200 bg-rose-50 text-rose-400"
      >
        <X size={13} />
      </span>
    );
  return (
    <button
      disabled={done}
      aria-label={done ? "Task completed" : `Complete ${task.title}`}
      onClick={(event) => {
        event.stopPropagation();
        complete(task);
      }}
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition ${done ? "border-emerald-500 bg-emerald-500 text-white" : "border-black/20 bg-white hover:scale-105 hover:border-emerald-500"}`}
    >
      {done && <Check size={14} />}
    </button>
  );
}

function ProgressRing({
  label,
  completed,
  total,
}: {
  label: string;
  completed: number;
  total: number;
}) {
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const circumference = 2 * Math.PI * 25;
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-black/[.06] bg-white p-4 shadow-sm">
      <div className="relative h-16 w-16 shrink-0">
        <svg
          viewBox="0 0 60 60"
          className="h-full w-full -rotate-90"
          aria-label={`${label} ${percent}% complete`}
        >
          <circle
            cx="30"
            cy="30"
            r="25"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            className="text-black/[.06]"
          />
          <circle
            cx="30"
            cy="30"
            r="25"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            className="text-emerald-500 transition-all duration-500"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - percent / 100)}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-xs font-semibold">
          {percent}%
        </span>
      </div>
      <div>
        <p className="text-sm font-medium text-black/50">{label}</p>
        <p className="mt-1 text-lg font-semibold">
          {completed} / {total} done
        </p>
      </div>
    </div>
  );
}

function SuggestedCard({
  task,
  action,
  edit,
}: {
  task: Task;
  action: (task: Task, action: string) => void;
  edit: (task: Task) => void;
}) {
  const due = dueInfo(task);
  return (
    <article className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-semibold text-black/90">{task.title}</h3>
        <span className="shrink-0 rounded-full bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-600">
          {task.confidence == null
            ? "Suggested"
            : `${Math.round(task.confidence * 100)}% confidence`}
        </span>
      </div>
      {task.description && (
        <p className="mt-1 text-sm text-black/50">{task.description}</p>
      )}
      <div className="mt-4">
        <SourceContext task={task} prominent />
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span
          className={`rounded-full px-2.5 py-1 ${due.overdue ? "bg-red-50 text-red-600" : "bg-orange-50 text-orange-700"}`}
        >
          {due.label}
        </span>
        <span className="rounded-full bg-black/[.04] px-2.5 py-1 capitalize text-black/55">
          {task.category}
        </span>
        <span className="rounded-full bg-black/[.04] px-2.5 py-1 capitalize text-black/55">
          {task.priority}
        </span>
      </div>
      <div className="mt-5 flex gap-2">
        <button
          onClick={() => action(task, "approve")}
          className="rounded-lg bg-black px-3.5 py-2 text-xs font-semibold text-white"
        >
          Approve
        </button>
        <button
          onClick={() => action(task, "decline")}
          className="rounded-lg border border-black/10 px-3.5 py-2 text-xs font-semibold text-black/55"
        >
          Decline
        </button>
        <button
          onClick={() => edit(task)}
          className="rounded-lg px-3 py-2 text-xs font-semibold text-black/45 hover:bg-black/[.04]"
        >
          Edit
        </button>
      </div>
    </article>
  );
}

function Actions({
  task,
  edit,
  action,
  archive,
}: {
  task: Task;
  edit: (task: Task) => void;
  action: (task: Task, action: string) => void;
  archive: (task: Task) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        onClick={() => edit(task)}
        className="rounded-lg px-2 py-1.5 text-xs text-black/50 hover:bg-black/[.04] hover:text-black"
      >
        Edit
      </button>
      {(task.status === "completed" || task.status === "declined") && (
        <button
          aria-label={`Reopen ${task.title}`}
          onClick={() => action(task, "reopen")}
          className="rounded-lg p-1.5 text-black/40 hover:bg-black/[.04] hover:text-black"
        >
          <RotateCcw size={14} />
        </button>
      )}
      {task.status === "archived" ? <button type="button" onClick={() => action(task, "restore")} className="rounded-lg px-2 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50">Restore</button> : <button
        title="Archive task"
        aria-label={`Archive ${task.title}`}
        onClick={() => archive(task)}
        className="rounded-lg p-1.5 text-black/35 hover:bg-red-50 hover:text-red-600"
      >
        <Archive size={14} />
      </button>}
    </div>
  );
}

function TaskTable({
  tasks,
  complete,
  action,
  edit,
  archive,
  emptyMessage,
}: {
  tasks: Task[];
  complete: (task: Task) => void;
  action: (task: Task, action: string) => void;
  edit: (task: Task) => void;
  archive: (task: Task) => void;
  emptyMessage: string;
}) {
  if (!tasks.length)
    return (
      <div className="rounded-2xl border border-dashed border-black/10 bg-white/50 px-5 py-12 text-center text-sm text-black/45">
        {emptyMessage}
      </div>
    );
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-black/[.07] bg-white shadow-sm md:block">
        <div className="max-h-[650px] overflow-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead className="sticky top-0 z-[1] bg-[#faf9f7]">
              <tr className="border-b border-black/[.07] text-[11px] font-semibold uppercase tracking-wider text-black/35">
                <th className="w-14 px-4 py-3">Done</th>
                <th className="min-w-64 px-3 py-3">Task</th>
                <th className="px-3 py-3">Due date</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3">Source</th>
                <th className="px-3 py-3">Priority</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const due = dueInfo(task);
                return (
                  <tr
                    key={task.id}
                    data-status={task.status}
                    className={`border-b border-black/[.05] align-top transition last:border-0 ${task.status === "declined" ? "bg-rose-50/70 hover:bg-rose-50" : task.status === "completed" ? "bg-emerald-50/20 hover:bg-emerald-50/30" : "hover:bg-black/[.015]"}`}
                  >
                    <td className="px-4 py-4">
                      <DoneButton task={task} complete={complete} />
                    </td>
                    <td className="max-w-sm px-3 py-4">
                      <button
                        type="button"
                        onClick={() => edit(task)}
                        className={`text-sm font-semibold ${task.status === "completed" ? "text-black/35 line-through" : task.status === "declined" ? "text-rose-900/55" : "text-black/85"}`}
                      >
                        {task.title}
                      </button>
                      {(task.description || task.sourceSnippet) && (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-black/40">
                          {task.description || task.sourceSnippet}
                        </p>
                      )}
                      {task.sourceTitle && (
                        <p className="mt-1 text-[11px] text-black/35">
                          {task.sourceTitle}
                        </p>
                      )}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-4 text-xs ${due.overdue ? "font-semibold text-red-600" : "text-black/50"}`}
                    >
                      {due.label}
                    </td>
                    <td className="px-3 py-4">
                      <span className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-medium capitalize text-indigo-650">
                        {task.category}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <div>
                        <span className="rounded-full bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700">
                          {sourceName(task.sourceType)}
                        </span>
                        {task.sourceUrl && (
                          <a
                            href={task.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open source for ${task.title}`}
                            className="ml-1.5 inline-block text-blue-500"
                          >
                            <ExternalLink size={12} />
                          </a>
                        )}
                        <p className="mt-1.5 text-[10px] text-black/35">
                          {task.extractedFromKnowledgeItemId
                            ? "Synced"
                            : "Manual"}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-medium capitalize ${task.priority === "urgent" ? "bg-red-50 text-red-600" : task.priority === "high" ? "bg-orange-50 text-orange-650" : "bg-black/[.04] text-black/50"}`}
                      >
                        {task.priority}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-medium capitalize ${task.status === "declined" ? "bg-rose-100 text-rose-700" : task.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-black/[.04] text-black/55"}`}
                      >
                        {task.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Actions
                        task={task}
                        edit={edit}
                        action={action}
                        archive={archive}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="space-y-3 md:hidden">
        {tasks.map((task) => (
          <article
            key={task.id}
            data-status={task.status}
            className={`rounded-2xl border p-4 shadow-sm ${task.status === "declined" ? "border-rose-100 bg-rose-50/80" : task.status === "completed" ? "border-emerald-100 bg-emerald-50/30" : "border-black/[.07] bg-white"}`}
          >
            <div className="flex items-start gap-3">
              <DoneButton task={task} complete={complete} />
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => edit(task)}
                  className={`font-semibold ${task.status === "completed" ? "text-black/35 line-through" : task.status === "declined" ? "text-rose-900/55" : ""}`}
                >
                  {task.title}
                </button>
                {(task.description || task.sourceSnippet) && (
                  <p className="mt-1 line-clamp-2 text-sm text-black/45">
                    {task.description || task.sourceSnippet}
                  </p>
                )}
              </div>
              <Actions
                task={task}
                edit={edit}
                action={action}
                archive={archive}
              />
            </div>
            <div className="mt-3">
              <SourceContext task={task} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-black/[.04] px-2 py-1">
                {dueInfo(task).label}
              </span>
              <span className="rounded-full bg-black/[.04] px-2 py-1 capitalize">
                {task.category}
              </span>
              <span
                className={`rounded-full px-2 py-1 capitalize ${task.status === "declined" ? "bg-rose-100 text-rose-700" : task.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-black/[.04]"}`}
              >
                {task.status}
              </span>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

type TaskPanelAction = "reminder" | "snooze" | "schedule" | "assign" | "feedback" | null;

function TaskDetailDrawer({
  task,
  close,
  updated,
  edit,
  decline,
}: {
  task: Task;
  close: () => void;
  updated: (task: Task) => void;
  edit: () => void;
  decline: () => void;
}) {
  const [panelAction, setPanelAction] = useState<TaskPanelAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const taskMetadata =
    task.metadata &&
    typeof task.metadata === "object" &&
    !Array.isArray(task.metadata)
      ? (task.metadata as Record<string, unknown>)
      : null;
  const reminderAt =
    taskMetadata && typeof taskMetadata.reminderAt === "string"
      ? taskMetadata.reminderAt
      : null;

  async function request(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const response = await fetch(path, {
      method: path.endsWith("/reminder") || path.endsWith("/feedback") ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(data.error || "Could not update this task.");
      return;
    }
    updated(data.task);
    setPanelAction(null);
  }

  function relativeDate(kind: "hour" | "tomorrow" | "week" | "today" | "tomorrowMorning" | "tomorrowAfternoon") {
    const date = new Date();
    if (kind === "hour") date.setHours(date.getHours() + 1);
    if (kind === "today") date.setHours(17, 0, 0, 0);
    if (kind === "tomorrow" || kind === "tomorrowMorning" || kind === "tomorrowAfternoon") {
      date.setDate(date.getDate() + 1);
      date.setHours(kind === "tomorrowAfternoon" ? 14 : 9, 0, 0, 0);
    }
    if (kind === "week") {
      date.setDate(date.getDate() + 7);
      date.setHours(9, 0, 0, 0);
    }
    return date.toISOString();
  }

  const actions = [
    { label: "Ask Neuron", icon: MessageCircle, run: () => { window.location.href = `/dashboard/query?taskId=${encodeURIComponent(task.id)}`; } },
    { label: "Remind me", icon: AlarmClock, run: () => setPanelAction("reminder") },
    { label: "Snooze", icon: Zap, run: () => setPanelAction("snooze") },
    { label: "Schedule", icon: CalendarClock, run: () => setPanelAction("schedule") },
    { label: "Assign to", icon: UserRound, run: () => setPanelAction("assign") },
    { label: "Feedback", icon: ThumbsUp, run: () => setPanelAction("feedback") },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <aside role="dialog" aria-modal="true" aria-label={`Task details: ${task.title}`} className="absolute inset-0 ml-auto flex w-full flex-col bg-[#fbfaf8] shadow-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:max-w-3xl">
        <header className="flex items-center justify-between border-b border-black/[.07] bg-white px-5 py-4">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Task details</p><p className="mt-0.5 text-xs text-black/40">Created {new Date(task.createdAt).toLocaleDateString()} · Updated {new Date(task.updatedAt).toLocaleDateString()}</p></div>
          <button type="button" onClick={close} aria-label="Close task details" className="rounded-lg p-2 hover:bg-black/[.05]"><X size={19}/></button>
        </header>
        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[1fr_220px]">
          <main className="p-5 sm:p-7">
            <div className="flex items-start gap-3"><DoneButton task={task} complete={() => void request(`/api/tasks/${task.id}`, { status: "completed" })}/><div><h2 className="text-xl font-semibold leading-7 text-black/90">{task.title}</h2><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-orange-50 px-2.5 py-1 text-orange-700">{dueInfo(task).label}</span><span className="rounded-full bg-violet-50 px-2.5 py-1 capitalize text-violet-700">{task.priority}</span><span className="rounded-full bg-black/[.05] px-2.5 py-1 capitalize">{task.category}</span><span className="rounded-full bg-black/[.05] px-2.5 py-1 capitalize">{task.status}</span></div></div></div>
            {task.description && <section className="mt-7"><h3 className="text-xs font-semibold uppercase tracking-wider text-black/35">Description</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/65">{task.description}</p></section>}
            <section className="mt-7"><h3 className="text-xs font-semibold uppercase tracking-wider text-black/35">Source and evidence</h3><div className="mt-2"><SourceContext task={task} prominent/></div></section>
            {reminderAt && <p className="mt-5 rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-700">Reminder set for {new Date(reminderAt).toLocaleString()}</p>}
            <button type="button" onClick={edit} className="mt-7 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-semibold">Edit task</button>
          </main>
          <aside className="border-t border-black/[.07] bg-white p-4 md:border-t-0 md:border-l">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-black/35">Actions</p>
            <div className="space-y-2">{actions.map(({ label, icon: Icon, run }) => <button key={label} type="button" onClick={run} className="flex w-full items-center gap-3 rounded-xl border border-black/[.07] px-3 py-2.5 text-left text-sm font-medium transition hover:border-indigo-200 hover:bg-indigo-50/50"><Icon size={16} className="text-indigo-600"/>{label}</button>)}</div>
          </aside>
        </div>
        {panelAction && <div className="border-t border-black/[.07] bg-white p-5">
          <div className="mx-auto max-w-xl">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold capitalize">{panelAction === "assign" ? "Assign to" : panelAction}</h3><button onClick={() => setPanelAction(null)} aria-label="Close action"><X size={16}/></button></div>
            {panelAction === "reminder" && <div className="flex flex-wrap gap-2">{[
              ["Later today", relativeDate("today")], ["Tomorrow morning", relativeDate("tomorrowMorning")], ["Tomorrow afternoon", relativeDate("tomorrowAfternoon")],
            ].map(([label, value]) => <button key={label} disabled={busy} onClick={() => void request(`/api/tasks/${task.id}/reminder`, { reminderAt: value })} className="rounded-lg border px-3 py-2 text-sm">{label}</button>)}<DateAction label="Custom date/time" busy={busy} submit={(value) => request(`/api/tasks/${task.id}/reminder`, { reminderAt: value })}/></div>}
            {panelAction === "snooze" && <div className="flex flex-wrap gap-2">{[
              ["1 hour", relativeDate("hour")], ["Tomorrow", relativeDate("tomorrow")], ["Next week", relativeDate("week")],
            ].map(([label, value]) => <button key={label} disabled={busy} onClick={() => void request(`/api/tasks/${task.id}`, { dueAt: value })} className="rounded-lg border px-3 py-2 text-sm">{label}</button>)}<DateAction label="Custom" busy={busy} submit={(value) => request(`/api/tasks/${task.id}`, { dueAt: value })}/></div>}
            {panelAction === "schedule" && <><p className="mb-3 text-sm text-black/50">Change this task’s due date and time. This does not create a calendar event.</p><DateAction label="Update due date" busy={busy} submit={(value) => request(`/api/tasks/${task.id}`, { dueAt: value })}/></>}
            {panelAction === "assign" && <p className="rounded-xl bg-black/[.035] p-4 text-sm text-black/55">Assignment is coming soon. Workspace member selection is not available yet.</p>}
            {panelAction === "feedback" && <FeedbackForm busy={busy} submit={(body) => request(`/api/tasks/${task.id}/feedback`, body)} decline={decline}/>}
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </div>
        </div>}
      </aside>
    </div>
  );
}

function DateAction({ label, busy, submit }: { label: string; busy: boolean; submit: (value: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  return <div className="flex flex-wrap gap-2"><input aria-label={label} type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} className="rounded-lg border px-3 py-2 text-sm"/><button type="button" disabled={!value || busy} onClick={() => void submit(new Date(value).toISOString())} className="rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">{label}</button></div>;
}

function FeedbackForm({ busy, submit, decline }: { busy: boolean; submit: (body: Record<string, unknown>) => Promise<void>; decline: () => void }) {
  const [reason, setReason] = useState("Wrong task");
  const [note, setNote] = useState("");
  return <div className="space-y-3"><select aria-label="Feedback reason" value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-lg border bg-white px-3 py-2 text-sm">{["Wrong task", "Wrong due date", "Wrong priority", "Not a task"].map(value => <option key={value}>{value}</option>)}</select><textarea aria-label="Feedback note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note (optional)" className="w-full rounded-lg border px-3 py-2 text-sm"/><div className="flex gap-2"><button disabled={busy} onClick={() => void submit({ reason, note })} className="rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white">Send feedback</button>{reason === "Not a task" && <button onClick={decline} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600">Decline task</button>}</div></div>;
}

export function TaskModal({
  task,
  close,
  saved,
}: {
  task?: Task | null;
  close: () => void;
  saved: (task: Task) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const body = {
      title: form.get("title"),
      description: form.get("description") || null,
      category: form.get("category"),
      priority: form.get("priority"),
      dueAt: form.get("dueAt")
        ? new Date(String(form.get("dueAt"))).toISOString()
        : null,
      sourceType: form.get("sourceType"),
    };
    const response = await fetch(
      task ? `/api/tasks/${task.id}` : "/api/tasks",
      {
        method: task ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setError(data.error || "Could not save task");
    saved(data.task);
    close();
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/35 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="my-6 w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">
              {task ? "Edit task" : "Add task"}
            </h2>
            <p className="mt-1 text-sm text-black/45">
              Add context so your team knows exactly where this task came from.
            </p>
          </div>
          <button type="button" aria-label="Close task modal" onClick={close}>
            <X size={20} />
          </button>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Title
            <input
              required
              maxLength={180}
              name="title"
              defaultValue={task?.title}
              className="mt-1.5 w-full rounded-xl border border-black/10 px-3 py-2.5 outline-none focus:border-black/30"
            />
          </label>
          <label className="block text-sm font-medium">
            Description
            <textarea
              name="description"
              defaultValue={task?.description || ""}
              rows={2}
              className="mt-1.5 w-full resize-none rounded-xl border border-black/10 px-3 py-2.5 outline-none focus:border-black/30"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Category
              <select
                name="category"
                defaultValue={task?.category || "work"}
                className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 capitalize"
              >
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Priority
              <select
                name="priority"
                defaultValue={task?.priority || "medium"}
                className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 capitalize"
              >
                {(["low", "medium", "high", "urgent"] as const).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium">
            Due date
            <input
              type="datetime-local"
              name="dueAt"
              defaultValue={localInputValue(task?.dueAt)}
              className="mt-1.5 w-full rounded-xl border border-black/10 px-3 py-2.5"
            />
          </label>
          <label className="block border-t border-black/[.06] pt-4 text-sm font-medium">
            Source / Platform
            <select
              aria-label="Source / Platform"
              name="sourceType"
              defaultValue={task?.sourceType || "manual"}
              className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5"
            >
              {sources.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          disabled={busy}
          className="mt-6 w-full rounded-xl bg-black py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save task"}
        </button>
      </form>
    </div>
  );
}

export default function TasksClient({
  initialTasks,
}: {
  initialTasks: Task[];
}) {
  const [tasks, setTasks] = useState(initialTasks),
    [filter, setFilter] = useState<Filter>("all"),
    [modal, setModal] = useState<false | null | Task>(false),
    [selectedTask, setSelectedTask] = useState<Task | null>(null),
    [archiveCandidate, setArchiveCandidate] = useState<Task | null>(null),
    [archiveNotice, setArchiveNotice] = useState(false),
    [showAllSuggested, setShowAllSuggested] = useState(false);
  const nonArchivedTasks = tasks.filter((task) => task.status !== "archived");
  const activeTasks = nonArchivedTasks.filter(
    (task) => task.status === "active",
  );
  const suggested = nonArchivedTasks.filter(
    (task) => task.status === "suggested",
  );
  const visibleSuggested = showAllSuggested
    ? suggested
    : suggested.slice(0, SUGGESTED_PREVIEW_COUNT);
  const countFor = (value: Filter) =>
    value === "all"
      ? activeTasks.length
      : value === "completed" || value === "declined" || value === "archived"
        ? tasks.filter((task) => task.status === value).length
        : activeTasks.filter((task) => task.category === value).length;
  const tableTasks =
    filter === "completed" || filter === "declined" || filter === "archived"
      ? tasks.filter((task) => task.status === filter)
      : activeTasks.filter(
          (task) => filter === "all" || task.category === filter,
        );
  const tableTitle =
    filter === "all"
      ? "Active tasks"
      : `${tabs.find((tab) => tab.value === filter)?.label ?? filter} tasks`;
  const emptyMessage =
    filter === "all"
      ? "No active tasks right now."
      : `No ${filter} tasks right now.`;
  const now = new Date(),
    today = new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dueToday = nonArchivedTasks.filter(
    (task) =>
      task.status !== "declined" &&
      task.dueAt &&
      new Date(task.dueAt) >= today &&
      new Date(task.dueAt) < tomorrow,
  );
  const allProgressTasks = nonArchivedTasks.filter(
    (task) => task.status === "active" || task.status === "completed",
  );
  const completedWeek = nonArchivedTasks.filter(
    (task) =>
      task.status === "completed" &&
      task.completedAt &&
      +new Date(task.completedAt) >= +today - 6 * 86400000,
  ).length;

  async function action(task: Task, name: string) {
    if (name === "restore") {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "active" }) });
      if (response.ok) {
        const data = await response.json();
        setTasks((all) => all.map((current) => current.id === task.id ? data.task : current));
      }
      return;
    }
    const response = await fetch(`/api/tasks/${task.id}/${name}`, {
      method: "POST",
    });
    if (response.ok) {
      const data = await response.json();
      setTasks((all) =>
        all.map((current) => (current.id === task.id ? data.task : current)),
      );
    }
  }
  async function archive(task: Task) {
    const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    if (response.ok) {
      const data = await response.json();
      setTasks((all) => all.map((current) => current.id === task.id ? data.task : current));
      setArchiveCandidate(null);
      setArchiveNotice(true);
    }
  }
  return (
    <div className="w-full pb-12">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Tasks</h1>
          <p className="mt-1 text-black/50">
            Track action items from your company brain.
          </p>
        </div>
        <button
          onClick={() => setModal(null)}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus size={17} /> Add task
        </button>
      </header>
      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Suggested", count: suggested.length, Icon: Sparkles },
          { label: "Active", count: activeTasks.length, Icon: ChevronRight },
          {
            label: "Due today",
            count: dueToday.filter((task) => task.status !== "completed")
              .length,
            Icon: Clock3,
          },
          { label: "Completed this week", count: completedWeek, Icon: Check },
        ].map(({ label, count, Icon }) => (
          <div
            key={label}
            className="rounded-2xl border border-black/[.06] bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between text-sm text-black/45">
              <span>{label}</span>
              <Icon className="h-4 w-4" />
            </div>
            <p className="mt-3 text-3xl font-semibold">{count}</p>
          </div>
        ))}
      </section>
      <section className="mt-3 grid gap-3 md:grid-cols-2">
        <ProgressRing
          label="Today"
          completed={
            dueToday.filter((task) => task.status === "completed").length
          }
          total={dueToday.length}
        />
        <ProgressRing
          label="All tasks"
          completed={
            allProgressTasks.filter((task) => task.status === "completed")
              .length
          }
          total={allProgressTasks.length}
        />
      </section>
      <div
        className="mt-7 flex gap-2 overflow-x-auto pb-1"
        role="tablist"
        aria-label="Task filters"
      >
        {tabs.map((tab) => (
          <button
            role="tab"
            aria-selected={filter === tab.value}
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm ${filter === tab.value ? "bg-black text-white" : "border border-black/[.08] bg-white text-black/55"}`}
          >
            {tab.label}{" "}
            <span
              className={
                filter === tab.value ? "text-white/65" : "text-black/35"
              }
            >
              {countFor(tab.value)}
            </span>
          </button>
        ))}
      </div>
      <section className="mt-9">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{tableTitle}</h2>
          <span className="text-xs text-black/35">
            {tableTasks.length} task{tableTasks.length === 1 ? "" : "s"}
          </span>
        </div>
        <TaskTable
          tasks={tableTasks}
          complete={(task) => action(task, "complete")}
          action={action}
          edit={setSelectedTask}
          archive={setArchiveCandidate}
          emptyMessage={emptyMessage}
        />
      </section>
      {/* Suggested tasks sit AFTER active work: they are a review queue, not the job. */}
      {filter !== "archived" && <section data-testid="suggested-tasks-section" className="mt-9">
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Sparkles className="h-5 w-5 text-violet-500" />
          <h2 className="text-lg font-semibold">Suggested tasks</h2>
          {suggested.length > 0 && (
            <span className="text-xs text-black/35">{suggested.length} waiting for review</span>
          )}
          <p className="w-full text-xs text-black/45">
            Review tasks Neuron found from your connected tools.
          </p>
        </div>
        {suggested.length ? (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              {visibleSuggested.map((task) => (
                <SuggestedCard
                  key={task.id}
                  task={task}
                  action={action}
                  edit={setModal}
                />
              ))}
            </div>
            {suggested.length > SUGGESTED_PREVIEW_COUNT && (
              <button
                type="button"
                onClick={() => setShowAllSuggested((current) => !current)}
                className="mt-3 w-full rounded-xl border border-black/10 px-4 py-2.5 text-sm font-medium text-black/70 transition hover:bg-black/[.03] sm:w-auto"
              >
                {showAllSuggested
                  ? "Hide"
                  : `See more (${suggested.length - SUGGESTED_PREVIEW_COUNT})`}
              </button>
            )}
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-black/10 bg-white/50 px-5 py-4 text-center text-sm text-black/45">
            No suggested tasks waiting.
          </div>
        )}
      </section>}
      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          close={() => setSelectedTask(null)}
          updated={(task) => {
            setSelectedTask(task);
            setTasks((all) =>
              all.map((current) => (current.id === task.id ? task : current)),
            );
          }}
          edit={() => {
            setModal(selectedTask);
            setSelectedTask(null);
          }}
          decline={() => {
            void action(selectedTask, "decline");
            setSelectedTask(null);
          }}
        />
      )}
      {archiveCandidate && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/30 p-4"><div role="dialog" aria-label="Archive task?" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-semibold">Archive task?</h2><p className="mt-2 text-sm text-black/55">This will hide the task from your active lists. You can find it later in Archived tasks.</p><div className="mt-6 flex justify-end gap-2"><button onClick={() => setArchiveCandidate(null)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button onClick={() => void archive(archiveCandidate)} className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white">Archive</button></div></div></div>}
      {archiveNotice && <div role="status" className="fixed bottom-5 right-5 z-[70] flex items-center gap-3 rounded-xl bg-black px-4 py-3 text-sm text-white shadow-xl"><span>Task archived.</span><button onClick={() => { setFilter("archived"); setArchiveNotice(false) }} className="font-semibold text-indigo-200">View archived tasks</button></div>}
      {modal !== false && (
        <TaskModal
          task={modal}
          close={() => setModal(false)}
          saved={(task) =>
            setTasks((all) => [
              task,
              ...all.filter((current) => current.id !== task.id),
            ])
          }
        />
      )}
    </div>
  );
}
