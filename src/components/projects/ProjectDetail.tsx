"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  deleteProject,
  updateProject,
  updateProjectStatus,
} from "@/lib/supabase/project-actions";
import { badgesQuery } from "@/types/badge";
import { PROJECT_STATUSES } from "@/types/project";
import type { Project } from "@/types/project";
import { DIFFICULTIES } from "@/types/project-plan";

import styles from "./ProjectDetail.module.css";

type Draft = {
  title: string;
  problem_statement: string;
  architecture_overview: string;
  objectives: string;
  components: string;
  technologies: string;
  development_steps: string;
  subjects_to_learn_first: string;
  difficulty: string;
};

function toLines(values: string[] | null | undefined): string {
  return (values ?? []).join("\n");
}

function fromLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function draftFrom(project: Project): Draft {
  return {
    title: project.title ?? "",
    problem_statement: project.problem_statement ?? "",
    architecture_overview: project.architecture_overview ?? "",
    objectives: toLines(project.objectives),
    components: toLines(project.components),
    technologies: toLines(project.technologies),
    development_steps: toLines(project.development_steps),
    subjects_to_learn_first: toLines(project.subjects_to_learn_first),
    difficulty: project.difficulty ?? "",
  };
}

function List({ label, values }: { label: string; values: string[] | null }) {
  if (!values || values.length === 0) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionLabel}>{label}</h2>
      <ul className={styles.list}>
        {values.map((value, index) => (
          <li key={`${index}-${value}`}>{value}</li>
        ))}
      </ul>
    </section>
  );
}

export function ProjectDetail({ project }: { project: Project }) {
  const router = useRouter();

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(project));
  // Held locally so the dropdown reflects the change immediately; the server
  // action revalidates the page behind it.
  const [status, setStatus] = useState(project.status ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  /** Refresh the page, carrying any new badges to the layout's popup. */
  function showResult(newBadges: { id: string }[]) {
    if (newBadges.length > 0) {
      router.replace(`/projects/${project.id}${badgesQuery(newBadges)}`, { scroll: false });
    } else {
      router.refresh();
    }
  }

  function changeStatus(next: string) {
    const previous = status;
    setStatus(next);
    setError(null);

    startTransition(async () => {
      const result = await updateProjectStatus(project.id, next);
      if (!result.ok) {
        // Put the dropdown back so it never shows a value the database rejected.
        setStatus(previous);
        setError(result.error);
        return;
      }
      showResult(result.newBadges);
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateProject(project.id, {
        ...draft,
        objectives: fromLines(draft.objectives),
        components: fromLines(draft.components),
        technologies: fromLines(draft.technologies),
        development_steps: fromLines(draft.development_steps),
        subjects_to_learn_first: fromLines(draft.subjects_to_learn_first),
        status,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIsEditing(false);
      showResult(result.newBadges);
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteProject(project.id);
      if (!result.ok) {
        setError(result.error);
        setConfirmingDelete(false);
        return;
      }
      router.push("/projects");
    });
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <label className={styles.statusField}>
          <span>Status</span>
          <select
            className={styles.select}
            value={status}
            onChange={(event) => changeStatus(event.target.value)}
            disabled={isPending}
          >
            {/* With no status stored, the browser would otherwise display
                "Idea" while the database holds nothing — and picking Idea would
                fire no change. */}
            {!status ? (
              <option value="" disabled>
                Not set
              </option>
            ) : null}
            {/* A value written before these five existed would otherwise vanish
                from the dropdown and look like data loss. */}
            {status && !PROJECT_STATUSES.includes(status as never) ? (
              <option value={status}>{status}</option>
            ) : null}
            {PROJECT_STATUSES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.actions}>
          {isEditing ? (
            <>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  setDraft(draftFrom(project));
                  setIsEditing(false);
                  setError(null);
                }}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={save}
                disabled={isPending || draft.title.trim().length === 0}
              >
                {isPending ? "Saving…" : "Save changes"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                // Start from the saved row, not a draft left over from the last
                // edit — the server trims and cleans what it stores.
                setDraft(draftFrom(project));
                setIsEditing(true);
              }}
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {isEditing ? (
        <div className={styles.form}>
          <label className={styles.field}>
            <span>Title</span>
            <input
              className={styles.input}
              value={draft.title}
              onChange={(event) => update("title", event.target.value)}
              maxLength={200}
            />
          </label>

          <label className={styles.field}>
            <span>Problem statement</span>
            <textarea
              className={styles.textarea}
              value={draft.problem_statement}
              onChange={(event) => update("problem_statement", event.target.value)}
              rows={3}
            />
          </label>

          <label className={styles.field}>
            <span>
              Objectives <em className={styles.hint}>one per line</em>
            </span>
            <textarea
              className={styles.textarea}
              value={draft.objectives}
              onChange={(event) => update("objectives", event.target.value)}
              rows={5}
            />
          </label>

          <label className={styles.field}>
            <span>
              Components <em className={styles.hint}>one per line</em>
            </span>
            <textarea
              className={styles.textarea}
              value={draft.components}
              onChange={(event) => update("components", event.target.value)}
              rows={5}
            />
          </label>

          <label className={styles.field}>
            <span>
              Technologies <em className={styles.hint}>one per line</em>
            </span>
            <textarea
              className={styles.textarea}
              value={draft.technologies}
              onChange={(event) => update("technologies", event.target.value)}
              rows={4}
            />
          </label>

          <label className={styles.field}>
            <span>Architecture overview</span>
            <textarea
              className={styles.textarea}
              value={draft.architecture_overview}
              onChange={(event) =>
                update("architecture_overview", event.target.value)
              }
              rows={4}
            />
          </label>

          <label className={styles.field}>
            <span>
              Development steps <em className={styles.hint}>one per line, in order</em>
            </span>
            <textarea
              className={styles.textarea}
              value={draft.development_steps}
              onChange={(event) => update("development_steps", event.target.value)}
              rows={8}
            />
          </label>

          <label className={styles.field}>
            <span>Difficulty</span>
            <select
              className={styles.select}
              value={draft.difficulty}
              onChange={(event) => update("difficulty", event.target.value)}
            >
              <option value="">Not set</option>
              {DIFFICULTIES.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>
              Subjects to learn first <em className={styles.hint}>one per line</em>
            </span>
            <textarea
              className={styles.textarea}
              value={draft.subjects_to_learn_first}
              onChange={(event) =>
                update("subjects_to_learn_first", event.target.value)
              }
              rows={4}
            />
          </label>
        </div>
      ) : (
        <div className={styles.readonly}>
          {project.problem_statement ? (
            <section className={styles.section}>
              <h2 className={styles.sectionLabel}>Problem statement</h2>
              <p className={styles.body}>{project.problem_statement}</p>
            </section>
          ) : null}

          <List label="Objectives" values={project.objectives} />
          <List label="Components" values={project.components} />
          <List label="Technologies" values={project.technologies} />

          {project.architecture_overview ? (
            <section className={styles.section}>
              <h2 className={styles.sectionLabel}>Architecture overview</h2>
              <p className={styles.body}>{project.architecture_overview}</p>
            </section>
          ) : null}

          {project.development_steps && project.development_steps.length > 0 ? (
            <section className={styles.section}>
              <h2 className={styles.sectionLabel}>Development steps</h2>
              <ol className={styles.steps}>
                {project.development_steps.map((step, index) => (
                  <li key={`${index}-${step}`}>{step}</li>
                ))}
              </ol>
            </section>
          ) : null}

          <List
            label="Subjects to learn first"
            values={project.subjects_to_learn_first}
          />

          {project.notes ? (
            <section className={styles.section}>
              <h2 className={styles.sectionLabel}>Notes</h2>
              <p className={styles.body}>{project.notes}</p>
            </section>
          ) : null}
        </div>
      )}

      <div className={styles.danger}>
        {confirmingDelete ? (
          <>
            <span className={styles.dangerText}>
              Delete this project permanently?
            </span>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setConfirmingDelete(false)}
              disabled={isPending}
            >
              Keep it
            </button>
            <button
              type="button"
              className={styles.destructive}
              onClick={remove}
              disabled={isPending}
            >
              {isPending ? "Deleting…" : "Yes, delete"}
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.destructive}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete project
          </button>
        )}
      </div>
    </div>
  );
}
