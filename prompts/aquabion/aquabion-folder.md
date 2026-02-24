# Aquabion — Edifício Gaudi Folder

## Brief
4-page A4 folder (595 × 842 px per frame in Figma) for Aquabion Brazil — a German galvanic water treatment company proposing their system to Edifício Gaudi, a luxury 26-floor Plaenge condo in Gleba Palhano, Londrina.

Target audience: Síndico and Conselho Consultivo (building decision-makers).
Tone: Premium, technical, ROI-focused. Think Grohe or BWT brochure quality.

## Design System
Read first: `prompts/aquabion/aquabion-design-system.html`
This has all fonts, colors, type scale, spacing, and component patterns. Follow it.

## Assets
`prompts/aquabion/assets/` — logo files, cover photo, product photo.

## Tools
1. **mcp-image** — generate infographic illustrations, diagrams, decorative graphics. Use heavily — the generated images should be the visual backbone of each page, not just decoration.
2. **Figmento** — build everything directly in Figma. Connect first, then create frames and compose.

If mcp-image fails, place a gray (#DCE6FA) placeholder rectangle and continue. Never block the layout waiting for images.

Save generated images to `prompts/aquabion/assets/generated/`

## Pages

### P1 — Capa
**Inovação Alemã para a Valorização e Proteção do Edifício Gaudi.**
Solução definitiva contra incrustações e corrosão, sem química e sem manutenção.
Use the cover photo as hero background. Aquabion logo. Badge: "Tecnologia Alemã Aquabion®".

### P2 — O Desafio
**O Desafio da "Água Dura" na Gleba Palhano**
A água da região possui alta concentração de minerais que danificam a infraestrutura do Gaudi (entregue em 2003). Problems: entupimento de chuveiros, incrustações em aquecedores, aumento de até 10% na energia, manutenções frequentes.
Generate a rich infographic-style illustration showing these water problems — this image should dominate the page.

### P3 — A Solução
**A Solução Racional — Tecnologia Aquabion®**
Conversor galvânico que libera íons de zinco, transformando calcário aderente em partículas neutras. Benefits: Pele e Cabelos (água mais leve), Economia Doméstica (máquinas duram mais), Área Comum (proteção de tubulações). Diferencial "Instale e Esqueça": zero energia, zero sal, zero manutenção por 10 anos.
Generate a product rendering or technical diagram of the converter.

### P4 — ROI e Dados Técnicos
**Payback em 22 meses.** Economia em químicos, energia e manutenção. Tecnologia 100% ecológica. Modelos: AB-H50 (Série H) e Série F (Flange) para 26 pavimentos. Vantagem: 90% menos espaço que abrandadores de sal, sem recarga, sem alterar sabor.
Generate a ROI chart visualization. End with CTA: "Solicitar Proposta".

## Execution
Read the design system → generate all images → connect to Figma → build all 4 pages. Run autonomously, do not stop for approvals.

**Important: Use Figma's standard A4 size (595 × 842 px), NOT print pixel dimensions (2480 × 3508). I will export from Figma manually at the resolution I need.**
