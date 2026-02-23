# Screenshot to Design - Figma Plugin

Convert screenshots into fully editable, structured Figma designs using AI vision.

## Features

- **Multiple Input Methods**: Paste from clipboard, drag & drop, or file upload
- **AI-Powered Analysis**: Uses Gemini or OpenAI to analyze UI elements
- **Accurate Recreation**: Creates proper Figma layers with correct styling
- **Preserves Hierarchy**: Maintains parent-child relationships between elements

## Setup

### 1. Install Dependencies

```bash
cd screenshot-to-design
npm install
```

### 2. Build the Plugin

```bash
npm run build
```

For development with auto-rebuild:

```bash
npm run watch
```

### 3. Load in Figma

1. Open Figma Desktop
2. Go to **Plugins > Development > Import plugin from manifest**
3. Select the `manifest.json` file from this directory
4. Run from **Plugins > Development > Screenshot to Design**

## Usage

1. Open the plugin in Figma
2. Select your AI provider (Claude or OpenAI)
3. Enter your API key
4. Upload/paste a screenshot
5. Click "Generate Design"

## API Keys

### Claude (Anthropic)
Get your API key from: https://console.anthropic.com/

### OpenAI
Get your API key from: https://platform.openai.com/api-keys

## Project Structure

```
screenshot-to-design/
├── manifest.json       # Plugin configuration
├── package.json        # Dependencies
├── tsconfig.json       # TypeScript config
├── build.js            # Build script
├── src/
│   ├── code.ts         # Main plugin code (Figma sandbox)
│   ├── ui.ts           # UI logic
│   ├── ui.html         # Plugin UI template
│   └── types.ts        # TypeScript interfaces
└── dist/               # Compiled output
```

## Development

The plugin consists of two parts:

- **Sandbox (code.ts)**: Runs in Figma's main thread with access to the Plugin API
- **UI (ui.ts + ui.html)**: Runs in an iframe with browser capabilities

Communication between them happens via `postMessage`.

## Development Guidelines

1. First think through the problem, read the codebase for relevant files.
2. Before you make any major changes, check in with me and I will verify the plan.
3. Please every step of the way just give me a high level explanation of what changes you made
4. Make every task and code change you do as simple as possible. We want to avoid making any massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity.
5. Maintain a documentation file that describes how the architecture of the app works inside and out.
6. Never speculate about code you have not opened. If the user references a specific file, you MUST read the file before answering. Make sure to investigate and read relevant files BEFORE answering questions about the codebase. Never make any claims about code before investigating unless you are certain of the correct answer - give grounded and hallucination-free answers.

## License

MIT
