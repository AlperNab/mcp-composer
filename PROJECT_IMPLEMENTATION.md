# Mcp Composer — Standalone Real GUI Implementation

This folder is now its own runnable project app. It does not depend on the root all-project dashboard at runtime.

## Run

```bash
./run_gui.sh
```

Windows:

```powershell
.\run_gui_windows.ps1
```

Default URL: `http://127.0.0.1:9135`

## What is inside this project folder

- `app/` — FastAPI backend for this project.
- `static/` — elegant browser GUI.
- `plugins/mcp-composer.json` — this project’s own feature/customization/input schema.
- `project_config.json` — readable copy of the same project-specific configuration.
- `data/` — local SQLite jobs, uploads, exports.
- `tests/` — verifies this project has a registered real local engine.

## Project-specific scope

- Domain: `AI Platform / Agents`
- Target user: `Domain operator, business owner, analyst, or team member who needs this workflow executed reliably.`
- Core job: MCP tools → composed agent workflows
- Suite: `AI Platform Core`

## Deep features applied

- tool registry
- permission model
- workflow builder
- prompt/tool templates
- dry-run simulator
- approval gates
- audit logs

## Customization controls

- `execution_mode` — Execution mode (select)
- `allowed_tools` — allowed tools (text)
- `auth_scopes` — auth scopes (text)
- `model_provider` — model provider (select)
- `approval_rules` — approval rules (textarea)
- `workflow_limits` — workflow limits (text)
- `tenant_policy` — tenant policy (text)
- `output_format` — output format (select)
- `language` — language (select)
- `privacy_mode` — privacy mode (select)
- `confidence_threshold` — Confidence threshold (slider)

## Input fields

- `mcp_tools` — MCP tools (text) required
- `work_brief` — Work brief / source text / URL / instructions (textarea) required

## External data policy

The local deterministic core is real and executable. Live external systems are not simulated. If Shopify, ATS, ERP, OCR/STT, maps, SERP, market data, medical databases, tax/customs databases, or other live systems are required, this project reports the missing connector/API requirement instead of inventing data.

---

## Final UX/UI Layer

This project now uses the **AI Platform Control Plane** pattern.

**UX workflow:** Provider/tool intake → routing/security → execution → audit/export

**Domain components:**
- Provider routing matrix
- Tool registry
- Cost/billing controls
- Security settings
- Audit trail

**Quick actions:**
- Configure providers
- Review routing rules
- Check security controls
- Export audit package

**No fake-data policy:** external/live actions require real connectors or API keys. Missing connectors are reported instead of simulated.
