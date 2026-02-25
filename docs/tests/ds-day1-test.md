# Day 1 End-to-End Test — Design System Foundation

> Run this test inside Figma using the Figmento tools.
> Tests: token generation, presets, CRUD (DS-01 through DS-04).

---

## Test: "PayFlow Design System Showcase"

### Step 1 — Create the design system

```
create_design_system({
  name: "payflow",
  preset: "shadcn",
  primary_color: "#2563EB",
  mood: ["fintech", "trust", "modern"]
})
```

**Expected:** Returns summary with `name: "payflow"`, `presetUsed: "shadcn"`, `colors: 15`, fonts showing heading + body families, and `spacingUnit: 8`.

---

### Step 2 — Create a frame as the showcase canvas

Create a frame called **"PayFlow — Design System Test"**
Size: **1200 x 800**

---

### Step 3 — Color palette strip

Inside the frame, create a row of **6 rectangles** (120x80 each), one for each key token color:

| Rectangle | Token Key       |
|-----------|-----------------|
| 1         | `primary`       |
| 2         | `primary_light` |
| 3         | `primary_dark`  |
| 4         | `secondary`     |
| 5         | `accent`        |
| 6         | `surface`       |

Label each rectangle with the token name and hex value below it.

---

### Step 4 — Typography sample

Create text samples using the generated font tokens:

| Level   | Content                                         | Expected Size |
|---------|--------------------------------------------------|---------------|
| Display | "PayFlow"                                        | ~61px         |
| H1      | "Instant Transfers"                              | ~49px         |
| Body    | "Send money anywhere, instantly and securely."   | 16px          |
| Caption | "© 2026 PayFlow Inc."                            | ~10px         |

Use the heading font for Display and H1, body font for Body and Caption.

---

### Step 5 — Verify token values

```
get_design_system({ name: "payflow" })
```

Print the full tokens and confirm they are populated correctly (not empty, not placeholder values).

---

### Step 6 — Test CRUD operations

```
list_design_systems()
```
**Expected:** Array containing `payflow` entry with name, created date, presetUsed, primaryColor.

```
update_design_system({
  name: "payflow",
  changes: { "colors.accent": "#F59E0B" }
})
```
**Expected:** Returns `{ updated: ["colors.accent"], affectedCount: 1 }`.

```
get_design_system({ name: "payflow" })
```
**Expected:** `colors.accent` is now `"#F59E0B"`.

```
delete_design_system({ name: "payflow" })
```
**Expected:** Returns `{ deleted: true, name: "payflow" }`.

```
list_design_systems()
```
**Expected:** Empty array (payflow no longer listed).

---

## Pass Criteria

- [ ] All 6 color rectangles render with visually distinct, correct colors
- [ ] Typography shows correct size hierarchy (display > h1 > body > caption)
- [ ] `get_design_system` returns a complete token object with real hex values
- [ ] `list_design_systems` shows payflow in the list
- [ ] `update_design_system` modifies a token and the change persists
- [ ] `delete_design_system` removes the system cleanly
