export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export type ProjectPlan = {
  title: string;
  problem_statement: string;
  objectives: string[];
  components: string[];
  technologies: string[];
  architecture_overview: string;
  development_steps: string[];
  difficulty: Difficulty;
  subjects_to_learn_first: string[];
};

export const PROJECT_PLAN_STRING_FIELDS = [
  "title",
  "problem_statement",
  "architecture_overview",
] as const;

export const PROJECT_PLAN_ARRAY_FIELDS = [
  "objectives",
  "components",
  "technologies",
  "development_steps",
  "subjects_to_learn_first",
] as const;
