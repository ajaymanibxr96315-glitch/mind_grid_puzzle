# MindGrid Web Arcade

This is a browser-based HTML, CSS, and JavaScript version of MindGrid. It has no framework, build step, or package installation.

## Run it

Open `index.html` in a modern browser. The games, solver controls, responsive layout, and profile use browser-local JavaScript and `localStorage`.

## Files

- `index.html` — application shell and navigation
- `styles.css` — responsive arcade layout and game boards
- `app.js` — game state, interactions, solvers, and browser profile

The original C++ console program remains in the project root as `main.cpp`.

## Run the game logic checks

With Node.js installed, open a terminal in the project root and run:

```powershell
node --test .\web\tests\engines.test.cjs
```
