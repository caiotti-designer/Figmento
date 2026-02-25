# Day 2 End-to-End Test — Components & Token Resolution

> Run this test inside Figma using the Figmento tools.
> Tests: token resolution (DS-05), component recipes (DS-06), create_component (DS-07), list_components (DS-08).

---

## Test: "PayFlow Component Showcase"

### Step 1 — Create the design system

```
create_design_system({
  name: "payflow",
  preset: "shadcn",
  primary_color: "#2563EB",
  mood: ["fintech", "trust"]
})
```

---

### Step 2 — Create the showcase frame

Create a frame called **"Day 2 — Component Test"**
Size: **1400 x 900**

---

### Step 3 — Create components

Use `create_component` for each, all with `system: "payflow"`:

#### Buttons (row at y=80)

| Variant | Props | Position |
|---------|-------|----------|
| primary | `{ label: "Get Started" }` | x=80, y=80 |
| secondary | `{ label: "Learn More" }` | x=280, y=80 |
| ghost | `{ label: "Cancel" }` | x=480, y=80 |

#### Badges (row at y=200)

| Variant | Props | Position |
|---------|-------|----------|
| success | `{ label: "Active" }` | x=80, y=200 |
| warning | `{ label: "Pending" }` | x=200, y=200 |
| error | `{ label: "Failed" }` | x=320, y=200 |

#### Cards (row at y=300)

| Variant | Position |
|---------|----------|
| default | x=80, y=300 |
| elevated | x=440, y=300 |

#### Divider (y=600)

| Variant | Position |
|---------|----------|
| default | x=80, y=600 |

#### Avatars (row at y=700)

| Size | Position |
|------|----------|
| lg (56px) | x=80, y=700 |
| sm (32px) | x=180, y=700 |

---

### Step 4 — List components

```
list_components()
```

**Expected:** Array of 5 components (button, badge, card, divider, avatar) each with description, variants, sizes, and props.

---

## Pass Criteria

- [ ] All components render with correct token colors (primary=#2563EB, not black/default)
- [ ] Buttons show correct padding and corner radius from shadcn preset (radius.md = 6)
- [ ] Secondary button has border stroke with surface fill, ghost has no fill
- [ ] Badges are pill-shaped (full corner radius) with tinted fills (10% opacity)
- [ ] Badge colors match semantic tokens (success=green, warning=yellow, error=red)
- [ ] Cards have shadow (default) or larger shadow (elevated)
- [ ] Divider renders as a thin 1px line in border color
- [ ] Avatars are circular with correct sizes (lg=56px, sm=32px)
- [ ] No `batch_execute` errors in any create_component call
- [ ] `list_components` returns complete info for all 5 components
