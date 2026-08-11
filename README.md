# React Code Camp Starter

A small, beginner-friendly app for learning **React**, **TypeScript**, and **Vite**. It demonstrates components, props, state, events, an input, buttons, and rendering an array with `.map()` without hiding the basics behind a large framework.

## Technology versions

This starter uses these published package versions:

- React **19.2.8**
- React DOM **19.2.8**
- Vite **8.2.0**
- TypeScript **6.0.2**

The exact versions are recorded in `package.json`.

## What you need before starting

Install these programs:

1. **Node.js 24 LTS** — Node includes the `npm` command used below.
2. **Git** — used to copy the repository to your computer.
3. **Cursor** or another code editor.

Open a terminal and check that Node.js, npm, and Git are installed:

```bash
node --version
npm --version
git --version
```

You should see a version number after each command. For Node.js, use version **22.12.0 or newer**; Node.js 24 LTS is recommended for the camp.

## Start and view the app for the first time

### 1. Clone the repository

Open a terminal and run:

```bash
git clone https://github.com/CordanoCorey/code-camp-starter.git
```

### 2. Move into the project folder

```bash
cd code-camp-starter
```

All remaining commands in this README should be run from inside this folder.

### 3. Install the project packages

```bash
npm install
```

This downloads React, Vite, TypeScript, and the other packages listed in `package.json`. It also creates a `node_modules` folder. Run this after cloning the project and whenever the dependencies change.

### 4. Start the development server

```bash
npm run dev
```

Vite should open the app automatically in your default browser. If the browser does not open, look in the terminal for a line similar to:

```text
Local: http://localhost:5173/
```

Hold `Ctrl` and click the address, or copy and paste it into Chrome. The port may be a different number if `5173` is already being used.

You should see a page headed **“Welcome, coder!”** with a name input and an interactive counter.

Keep the terminal running while you work. When you save a code change, Vite normally updates the browser immediately.

### 5. Stop the app

Return to the terminal where Vite is running and press:

```text
Ctrl + C
```

On Windows, the terminal may ask whether you want to terminate the batch job. Type `Y` and press Enter.

## Start the app on later days

You normally do **not** need to run `npm install` again. Open a terminal in the project folder and run:

```bash
npm run dev
```

Then use the browser window Vite opens, or open the `Local` address shown in the terminal.

## Open the project in Cursor

From inside the project folder, run:

```bash
cursor .
```

If the `cursor` command is unavailable, open Cursor normally, choose **File → Open Folder**, and select the `code-camp-starter` folder.

## Where students should begin

The most important files are:

- `src/App.tsx` — the page content, React components, data, and interactive behavior.
- `src/App.css` — styles for the starter page.
- `src/index.css` — basic styles shared by the whole app.
- `src/main.tsx` — connects the React app to the HTML page.
- `index.html` — the HTML page Vite loads first.

A good first exercise is to open `src/App.tsx`, change the main heading, save the file, and watch the browser update.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm install` | Downloads the packages listed in `package.json`. |
| `npm run dev` | Starts the app for local development. |
| `npm run lint` | Checks the source code for common mistakes. |
| `npm run build` | Type-checks the code and creates a production build in `dist`. |
| `npm run preview` | Shows the production build locally after `npm run build`. |
| `npm run check` | Runs both linting and the production build. |

## Preview the production build

Run:

```bash
npm run build
npm run preview
```

Open the local address printed in the terminal. Press `Ctrl + C` when you are finished.

## Beginner challenges

1. Change the large heading and description in `src/App.tsx`.
2. Change a color in `src/App.css`.
3. Add another object to the `campTopics` array.
4. Add a button that changes the greeting.
5. Create a new component and display it inside `App`.

## Troubleshooting

### `npm` is not recognized

Install Node.js 24 LTS, then close and reopen the terminal. Run `node --version` and `npm --version` again.

### Your Node.js version is too old

Run:

```bash
node --version
```

If the version is lower than `22.12.0`, install Node.js 24 LTS.

### The browser says the page cannot be reached

Make sure `npm run dev` is still running. Use the exact `Local` address printed by Vite; the port can change.

### Port 5173 is already in use

Vite normally chooses another port automatically, such as `5174`. Open the exact address displayed in the terminal.

### Changes are not appearing

Save the file, check the terminal for an error, and refresh the browser. Vite normally updates the page immediately after a valid file is saved.

### Packages seem broken

From the project folder, remove `node_modules` and install the packages again.

**macOS, Linux, or Chromebook Linux terminal:**

```bash
rm -rf node_modules
npm install
```

**Windows PowerShell:**

```powershell
Remove-Item -Recurse -Force node_modules
npm install
```
