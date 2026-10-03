"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveProject } from "@/lib/supabase/project-actions";
import { badgesQuery } from "@/types/badge";
import { DIFFICULTIES } from "@/types/project-plan";

import styles from "./ProjectPlanBuilder.module.css";

/**
 * Array fields are edited as one-item-per-line text. It keeps the form simple
 * and matches how people naturally paste lists; the split happens on save.
 */
type PlanDraft = {
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

function toLines(values: string[] | undefined): string {
  return (values ?? []).join("\n");
}

function fromLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function ProjectPlanBuilder() {
  const router = useRouter();

  const [idea, setIdea] = useState("");
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);

  function update<K extends keyof PlanDraft>(field: K, value: PlanDraft[K]) {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function generate() {
    const text = idea.trim();
    if (!text || isGenerating) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/project-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: text }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        // 429 is the shared daily cap. Show the server's wording rather than
        // inventing a second one here.
        if (response.status === 429) setLimitReached(true);
        setError(payload?.error ?? "Could not generate a plan. Please try again.");
        return;
      }

      const plan = payload.plan;
      setDraft({
        title: plan.title ?? "",
        problem_statement: plan.problem_statement ?? "",
        architecture_overview: plan.architecture_overview ?? "",
        objectives: toLines(plan.objectives),
        components: toLines(plan.components),
        technologies: toLines(plan.technologies),
        development_steps: toLines(plan.development_steps),
        subjects_to_learn_first: toLines(plan.subjects_to_learn_first),
        difficulty: plan.difficulty ?? "Medium",
      });
      if (payload.usage) setUsage(payload.usage);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  function save() {
    if (!draft) return;
    setError(null);

    startSaving(async () => {
      // A rejected server action inside a transition would otherwise be
      // rethrown to the error boundary and discard the edited plan.
      let result: Awaited<ReturnType<typeof saveProject>>;
      try {
        result = await saveProject({
          title: draft.title,
          problem_statement: draft.problem_statement,
          architecture_overview: draft.architecture_overview,
          objectives: fromLines(draft.objectives),
          components: fromLines(draft.components),
          technologies: fromLines(draft.technologies),
          development_steps: fromLines(draft.development_steps),
          subjects_to_learn_first: fromLines(draft.subjects_to_learn_first),
          difficulty: draft.difficulty,
        });
      } catch (error) {
        console.error("[projects] FAILED stage=insert (client)", error);
        setError("Could not reach the server. Check your connection and try again.");
        return;
      }

      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/projects${badgesQuery(result.newBadges)}`);
    });
  }

  return (
    <div className={styles.wrapper}>
      <section className={styles.ideaBlock}>
        <label className={styles.field}>
          <span>Describe your project idea</span>
          <textarea
            className={styles.textarea}
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            rows={4}
            maxLength={2000}
            disabled={limitReached}
            placeholder="e.g. A soil moisture monitor for our college garden that alerts students when plants need water."
          />
        </label>

        <button
          type="button"
          className={styles.primary}
          onClick={() => void generate()}
          disabled={isGenerating || limitReached || idea.trim().length === 0}
        >
          {isGenerating ? "Generating plan…" : draft ? "Regenerate plan" : "Generate Plan"}
        </button>

        {isGenerating ? (
          <p className={styles.thinking} role="status">
            MEDHVARA is planning your project…
          </p>
        ) : null}
      </section>

      {error ? (
        <p
          className={limitReached ? styles.limit : styles.error}
          role={limitReached ? "status" : "alert"}
        >
          {error}
        </p>
      ) : null}

      {draft ? (
        <section className={styles.planBlock}>
          <div className={styles.planHeader}>
            <h2 className={styles.planTitle}>Your plan</h2>
            <p className={styles.planHint}>
              Everything below is editable. Change anything before saving.
            </p>
          </div>

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
              onChange={(event) => update("architecture_overview", event.target.value)}
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

          <button
            type="button"
            className={styles.primary}
            onClick={save}
            disabled={isSaving || draft.title.trim().length === 0}
          >
            {isSaving ? "Saving…" : "Save Project"}
          </button>
        </section>
      ) : null}

      {usage ? (
        <p className={styles.usage}>
          {usage.used} of {usage.limit} messages used today
        </p>
      ) : null}
    </div>
  );
}
