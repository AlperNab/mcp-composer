/**
 * WorkflowPlanner — uses Claude to plan multi-step workflows,
 * then executes them across connected MCP servers.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ServerManager } from "../servers/manager.js";

interface Step {
  step: number;
  description: string;
  server: string;
  tool: string;
  args: Record<string, unknown>;
  depends_on: number[];
}

interface ExecutionPlan {
  prompt: string;
  steps: Step[];
  estimated_duration_seconds: number;
}

interface StepResult {
  step: number;
  tool: string;
  success: boolean;
  output: unknown;
  error?: string;
  duration_ms: number;
}

interface WorkflowResult {
  plan: ExecutionPlan;
  results: StepResult[];
  dry_run: boolean;
  total_duration_ms: number;
}

const PLANNER_SYSTEM = `You are a workflow planner for an MCP orchestration system.
Given a user's goal and a list of available tools (with their server names), 
produce a step-by-step execution plan as JSON.

Rules:
- Use ONLY tools from the provided list
- Steps that don't depend on each other can be marked parallel (depends_on: [])
- Steps that need output from previous steps should list those step numbers in depends_on
- The "args" object must match the tool's input schema
- Keep args as templates where needed — use {{step_N.output.field}} for data from previous steps

Return ONLY valid JSON, no explanation, no markdown.`;

const PLANNER_PROMPT = (goal: string, tools: string) => `
Goal: "${goal}"

Available tools:
${tools}

Return a JSON execution plan:
{
  "prompt": "${goal}",
  "steps": [
    {
      "step": 1,
      "description": "What this step does",
      "server": "server-name",
      "tool": "tool_name",
      "args": { "param": "value" },
      "depends_on": []
    }
  ],
  "estimated_duration_seconds": 10
}
`;

export class WorkflowPlanner {
  private anthropic: Anthropic;

  constructor(private manager: ServerManager) {
    this.anthropic = new Anthropic();
  }

  async run(
    prompt: string,
    options: { dryRun?: boolean } = {}
  ): Promise<WorkflowResult> {
    const start = Date.now();

    // Get all available tools for planning
    const tools = this.manager.getAllTools();
    const toolSummary = tools
      .filter((t) => !t.name.startsWith("composer_"))
      .map((t) => `- ${t.name}: ${t.description.substring(0, 120)}`)
      .join("\n");

    // Ask Claude to plan the workflow
    const plan = await this.planWorkflow(prompt, toolSummary);

    if (options.dryRun) {
      return {
        plan,
        results: [],
        dry_run: true,
        total_duration_ms: Date.now() - start,
      };
    }

    // Execute the plan
    const results = await this.executePlan(plan);

    return {
      plan,
      results,
      dry_run: false,
      total_duration_ms: Date.now() - start,
    };
  }

  private async planWorkflow(prompt: string, toolSummary: string): Promise<ExecutionPlan> {
    const response = await this.anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: PLANNER_SYSTEM,
      messages: [
        { role: "user", content: PLANNER_PROMPT(prompt, toolSummary) },
      ],
    });

    const text = (response.content[0] as any).text.trim();
    const clean = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "");

    try {
      return JSON.parse(clean) as ExecutionPlan;
    } catch {
      // Fallback: single-step plan
      return {
        prompt,
        steps: [],
        estimated_duration_seconds: 0,
      };
    }
  }

  private async executePlan(plan: ExecutionPlan): Promise<StepResult[]> {
    const results: StepResult[] = [];
    const completed = new Map<number, StepResult>();

    // Group steps by their dependency level
    const levels = this.topologicalSort(plan.steps);

    for (const levelSteps of levels) {
      // Execute steps at the same level in parallel
      const levelResults = await Promise.all(
        levelSteps.map((step) => this.executeStep(step, completed))
      );

      for (const result of levelResults) {
        results.push(result);
        completed.set(result.step, result);
      }
    }

    return results;
  }

  private async executeStep(
    step: Step,
    completed: Map<number, StepResult>
  ): Promise<StepResult> {
    const start = Date.now();

    try {
      // Resolve template args from previous step outputs
      const resolvedArgs = this.resolveArgs(step.args, completed);

      const result = await this.manager.callTool(step.tool, resolvedArgs);
      const output = (result as any)?.content?.[0]?.text ?? result;

      return {
        step: step.step,
        tool: step.tool,
        success: true,
        output: typeof output === "string" ? this.tryParseJson(output) : output,
        duration_ms: Date.now() - start,
      };
    } catch (error: any) {
      return {
        step: step.step,
        tool: step.tool,
        success: false,
        output: null,
        error: error.message,
        duration_ms: Date.now() - start,
      };
    }
  }

  private resolveArgs(
    args: Record<string, unknown>,
    completed: Map<number, StepResult>
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(args)) {
      if (typeof value === "string") {
        // Replace {{step_N.output.field}} templates
        resolved[key] = value.replace(
          /\{\{step_(\d+)\.output\.([^}]+)\}\}/g,
          (_, stepNum, field) => {
            const prev = completed.get(parseInt(stepNum));
            if (!prev?.output) return "";
            const output = prev.output as Record<string, unknown>;
            return String(this.getNestedValue(output, field) ?? "");
          }
        );
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce((cur: unknown, key) => {
      if (cur && typeof cur === "object") return (cur as Record<string, unknown>)[key];
      return undefined;
    }, obj);
  }

  private tryParseJson(text: string): unknown {
    try { return JSON.parse(text); } catch { return text; }
  }

  private topologicalSort(steps: Step[]): Step[][] {
    const levels: Step[][] = [];
    const placed = new Set<number>();

    while (placed.size < steps.length) {
      const level = steps.filter(
        (s) =>
          !placed.has(s.step) &&
          s.depends_on.every((dep) => placed.has(dep))
      );

      if (level.length === 0) break; // circular dependency guard
      levels.push(level);
      level.forEach((s) => placed.add(s.step));
    }

    return levels;
  }
}
