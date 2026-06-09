# HubSpot dealer quote alert workflow

When a dealer submits a quote request, the quoting tool:

1. Creates a HubSpot deal (owner: Jess Moon by default)
2. Pushes HubSpot quote draft(s) with line items
3. Creates a **task for each sales rep** (Jess Moon + John Quinn)
4. Adds a consolidated **note** on the deal
5. Sets deal property **`quote_tool_status`** = `ready_for_review`

The **workflow below** sends HubSpot’s internal email notification to both reps.

## One-time HubSpot setup

### 1. Create custom deal properties

**Option A (recommended):** from the repo root with `HUBSPOT_PRIVATE_APP_TOKEN` set:

```bash
npm run hubspot:setup-alerts
```

**Option B:** In HubSpot → Settings → Properties → Deal properties, create manually:

| Internal name | Label | Type |
|---------------|-------|------|
| `quote_tool_status` | Quote tool status | Dropdown: `pending`, `ready_for_review`, `published` |
| `quote_tool_machine_summary` | Quote tool machine summary | Single-line text (optional, for email tokens) |

### 2. Create workflow

**Workflow type:** Deal-based  
**Trigger:** Deal property `quote_tool_status` is any of `ready_for_review`  
**Re-enrollment:** Allow re-enrollment when trigger conditions met again

**Optional filter:**

- Pipeline is dealer pipeline (`90932330`), or
- `dealer_company` is known

**Actions:**

1. **Send internal email notification**
   - Recipients: **Jess Moon** (`96593046862`) and **John Quinn** (`158817869370`)
   - Subject (example): `Dealer quote ready: {{ deal.dealname }}`
   - Body: include link to deal `{{ deal.url }}` and `{{ deal.quote_tool_machine_summary }}` if populated

2. (Optional) Delay 0 minutes — workflow runs immediately when property is set

### 3. Turn off email later

Deactivate this workflow in HubSpot. No app deploy required.

## App environment

```bash
SALES_ALERT_HUBSPOT_OWNER_IDS=96593046862,158817869370
```

First ID = primary deal owner (Jess Moon). Both IDs receive HubSpot tasks from the app.
